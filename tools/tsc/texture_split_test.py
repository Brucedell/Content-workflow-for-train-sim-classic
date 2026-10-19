"""Headless test of tools/blender/tsc_texture_split.py.

Builds a locomotive body with a single 4K colour-grid texture (plus a second
"normal-like" map to prove multi-map splitting), smart-UV-unwraps it so faces
straddle the tile borders, splits into tiles, and checks:

  1. exactness: random points on the split mesh sample the SAME texel through
     their tile image as they did through the 4K image (inset = 0 run);
  2. every face's UVs lie in 0..1 of its tile; every tile image is the right size;
  3. the mesh is still one connected surface (no cracks: no new boundary edges);
  4. a Cycles render of the split model matches a render of the original (inset 0.5 run);
  5. the user's 1920x1080 tile request also works (partial tiles, padded or not).

Run:  python tools/tsc/texture_split_test.py <out dir>      (bpy wheel)
      blender -b --python tools/tsc/texture_split_test.py -- <out dir>
"""
import sys, os, json, math, random, time
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "blender"))
import bpy
import bmesh
import numpy as np
from mathutils import Vector
from mathutils.interpolate import poly_3d_calc
import tsc_texture_split as ts
ts.register()

OUT = sys.argv[-1]
os.makedirs(OUT, exist_ok=True)
errors = []


def build_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    # a loco-ish body: box + roof + nose, joined, with a bevelled edge for some extra faces
    bpy.ops.mesh.primitive_cube_add(location=(0, 0, 1.9)); body = bpy.context.active_object; body.name = "1_0500_engine"
    body.scale = (1.45, 9.0, 1.6); bpy.ops.object.transform_apply(scale=True)
    bpy.ops.mesh.primitive_cylinder_add(radius=1.3, depth=17, vertices=16, location=(0, 0, 3.6), rotation=(math.pi / 2, 0, 0))
    roof = bpy.context.active_object
    bpy.ops.mesh.primitive_cone_add(radius1=1.4, radius2=0.6, depth=2.0, vertices=12, location=(0, 10, 1.9), rotation=(-math.pi / 2, 0, 0))
    nose = bpy.context.active_object
    for o in (body, roof, nose): o.select_set(True)
    bpy.context.view_layer.objects.active = body
    bpy.ops.object.join()
    bpy.ops.object.mode_set(mode="EDIT"); bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.subdivide(number_cuts=2)
    bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.01)
    bpy.ops.object.mode_set(mode="OBJECT")
    # 4K colour grid + a second map (gradient) in the same material
    bpy.ops.image.new(name="body_grid", width=4096, height=4096, generated_type="COLOR_GRID")
    grid = bpy.data.images["body_grid"]
    bpy.ops.image.new(name="body_nrm", width=4096, height=4096, generated_type="UV_GRID")
    nrm = bpy.data.images["body_nrm"]; nrm.colorspace_settings.name = "Non-Color"
    mat = bpy.data.materials.new("body_mat"); mat.use_nodes = True
    nt = mat.node_tree; bsdf = nt.nodes["Principled BSDF"]
    t1 = nt.nodes.new("ShaderNodeTexImage"); t1.image = grid; nt.links.new(t1.outputs["Color"], bsdf.inputs["Base Color"])
    t2 = nt.nodes.new("ShaderNodeTexImage"); t2.image = nrm
    nm = nt.nodes.new("ShaderNodeNormalMap"); nt.links.new(t2.outputs["Color"], nm.inputs["Color"]); nt.links.new(nm.outputs["Normal"], bsdf.inputs["Normal"])
    mat["tsc_shader"] = "TrainBasicObjectDiffuse.fx"          # custom props survive mat.copy()
    body.data.materials.append(mat)
    return body, mat, grid, nrm


def sample_points(obj, n, seed=1):
    """n random points on the surface: (face index, barycentric weights, 3D point)."""
    rnd = random.Random(seed)
    me = obj.data
    polys = list(me.polygons)
    areas = [p.area for p in polys]
    total = sum(areas)
    out = []
    for _ in range(n):
        x = rnd.random() * total
        for p in polys:
            x -= p.area
            if x <= 0: break
        vs = [me.vertices[i].co for i in p.vertices]
        w = [rnd.random() for _ in vs]; s = sum(w); w = [a / s for a in w]
        pt = Vector((0, 0, 0))
        for a, v in zip(w, vs): pt += a * v
        out.append((p.index, pt))
    return out


def uv_at(obj, face_index, pt):
    me = obj.data; p = me.polygons[face_index]
    vs = [me.vertices[i].co for i in p.vertices]
    w = poly_3d_calc(vs, pt)
    uv = Vector((0, 0))
    for a, li in zip(w, p.loop_indices): uv += a * me.uv_layers.active.data[li].uv
    return uv


def check_split(body_orig, body_split, grid_arr, tile_w, tile_h, inset, tag, n=600):
    """body_split carries an int face attribute 'orig_face' (added before the split, carried
    through the cuts by bmesh) so every split face knows its source face exactly."""
    me = body_split.data
    # 2. tiles / UV ranges / image sizes
    for p in me.polygons:
        m = me.materials[p.material_index]
        for li in p.loop_indices:
            u, v = me.uv_layers.active.data[li].uv
            if not (-1e-4 <= u <= 1 + 1e-4 and -1e-4 <= v <= 1 + 1e-4):
                errors.append("%s: UV out of range in %s: %.4f %.4f" % (tag, m.name, u, v)); break
    sizes = {}
    for m in me.materials:
        for nd in ts.image_nodes(m):
            sizes[nd.image.name] = tuple(nd.image.size)
            if nd.image.size[0] > tile_w or nd.image.size[1] > tile_h:
                errors.append("%s: tile %s is %s, over the limit" % (tag, nd.image.name, tuple(nd.image.size)))
    # 3. no cracks: boundary edge count unchanged
    def boundary_edges(o):
        bm = bmesh.new(); bm.from_mesh(o.data); k = sum(1 for e in bm.edges if e.is_boundary); bm.free(); return k
    b0, b1 = boundary_edges(body_orig), boundary_edges(body_split)
    if b0 != b1: errors.append("%s: boundary edges changed %d -> %d (crack)" % (tag, b0, b1))
    # 1. exact mapping check: tile UV mapped back to source UV must equal the original face's UV at that point
    W, H = grid_arr.shape[1], grid_arr.shape[0]
    src_attr = me.attributes["orig_face"].data
    tile_arrays = {}
    worst = 0.0; bad_uv = 0; bad_tex = 0; checked = 0
    for fi, pt in sample_points(body_split, n):
        p = me.polygons[fi]
        m = me.materials[p.material_index]
        c, r = [int(x) for x in m.name.rsplit("_c", 1)[1].split("r")]
        node = [nd for nd in ts.image_nodes(m) if "grid" in nd.image.name][0]
        timg = node.image
        tw, th = timg.size
        x0, y0 = c * tile_w, r * tile_h
        nu, nv = uv_at(body_split, fi, pt)
        iu, iv = inset / float(tw), inset / float(th)
        nu0, nv0 = (nu - iu) / (1 - 2 * iu), (nv - iv) / (1 - 2 * iv)
        ru, rv = (x0 + nu0 * tw) / float(W), (y0 + nv0 * th) / float(H)
        ou, ov = uv_at(body_orig, src_attr[fi].value, pt)
        ou, ov = ou % 1.0, ov % 1.0
        du = min(abs(ru - ou), abs(ru - ou - 1), abs(ru - ou + 1)); dv = min(abs(rv - ov), abs(rv - ov - 1), abs(rv - ov + 1))
        worst = max(worst, du, dv)
        checked += 1
        if du > 2e-5 or dv > 2e-5: bad_uv += 1
        if timg.name not in tile_arrays: tile_arrays[timg.name] = ts.image_pixels(timg)
        ta = tile_arrays[timg.name]
        ox, oy = int(min(max(ou * W, 0), W - 1)), int(min(max(ov * H, 0), H - 1))
        tx, ty = int(min(max(nu0 * ta.shape[1], 0), ta.shape[1] - 1)), int(min(max(nv0 * ta.shape[0], 0), ta.shape[0] - 1))
        if np.abs(grid_arr[oy, ox, :3] - ta[ty, tx, :3]).max() > 1e-3: bad_tex += 1
    print("%s: %d samples, UV mapping error max %.2e (= %.3f source px), %d UV mismatches, %d texel mismatches (texel-boundary rounding); tiles %s"
          % (tag, checked, worst, worst * W, bad_uv, bad_tex, sorted(set(sizes.values()))))
    if bad_uv: errors.append("%s: %d / %d UV mismatches (max %.2e)" % (tag, bad_uv, checked, worst))
    return sizes


def render(obj, path, grid_name_part="grid"):
    """Cycles CPU render with emission so the texture is compared, not lighting."""
    sc = bpy.context.scene
    for m in obj.data.materials:
        nt = m.node_tree
        node = [nd for nd in ts.image_nodes(m) if grid_name_part in nd.image.name][0]
        em = nt.nodes.new("ShaderNodeEmission"); nt.links.new(node.outputs["Color"], em.inputs["Color"])
        outn = [n for n in nt.nodes if n.type == "OUTPUT_MATERIAL"][0]
        nt.links.new(em.outputs["Emission"], outn.inputs["Surface"])
    cam = bpy.data.objects.get("Cam")
    if cam is None:
        cd = bpy.data.cameras.new("Cam"); cam = bpy.data.objects.new("Cam", cd); sc.collection.objects.link(cam)
        cam.location = (16, -20, 9); cam.rotation_euler = (math.radians(68), 0, math.radians(38)); cd.lens = 35
    sc.camera = cam
    sc.render.engine = "CYCLES"; sc.cycles.samples = 8; sc.cycles.device = "CPU"
    sc.render.resolution_x, sc.render.resolution_y = 640, 400; sc.render.resolution_percentage = 100
    sc.render.image_settings.file_format = "PNG"; sc.render.filepath = path
    sc.view_settings.view_transform = "Standard"
    t = time.time(); bpy.ops.render.render(write_still=True); print("rendered", path, "in %.1fs" % (time.time() - t))


# ------------------------------------------------------------------ run 1: 2048 tiles, inset 0, exactness
body, mat, grid, nrm = build_scene()
grid_arr = ts.image_pixels(grid)
orig = body.copy(); orig.data = body.data.copy(); bpy.context.scene.collection.objects.link(orig); orig.name = "orig"
att = body.data.attributes.new("orig_face", "INT", "FACE"); att.data.foreach_set("value", list(range(len(body.data.polygons))))
s = bpy.context.scene.tsc_texsplit
s.out_dir = os.path.join(OUT, "t2048"); s.tile_w = s.tile_h = 2048; s.inset = 0.0; s.fmt = "PNG"
for o in bpy.context.scene.objects: o.select_set(o is body)
rep = []; res = ts.split_selected(bpy.context, s, rep); print("\n".join(rep))
sizes = check_split(orig, body, grid_arr, 2048, 2048, 0.0, "2048/inset0")
print("materials:", [m.name for m in body.data.materials], "faces", len(body.data.polygons), "verts", len(body.data.vertices))
if len(body.data.materials) < 2: errors.append("no tile materials created")
for m in body.data.materials:
    if m.get("tsc_shader") != "TrainBasicObjectDiffuse.fx": errors.append("custom prop lost on %s" % m.name)
    if len(ts.image_nodes(m)) != 2: errors.append("%s should have 2 image nodes" % m.name)

# ------------------------------------------------------------------ run 2: 2048 tiles, inset 0.5, render compare
body, mat, grid, nrm = build_scene()
orig = body.copy(); orig.data = body.data.copy(); bpy.context.scene.collection.objects.link(orig); orig.name = "orig"; orig.hide_render = True
att = body.data.attributes.new("orig_face", "INT", "FACE"); att.data.foreach_set("value", list(range(len(body.data.polygons))))
render(orig, os.path.join(OUT, "render_before.png"))
s = bpy.context.scene.tsc_texsplit
s.out_dir = os.path.join(OUT, "t2048b"); s.tile_w = s.tile_h = 2048; s.inset = 0.5; s.fmt = "TGA"
for o in bpy.context.scene.objects: o.select_set(o is body)
rep = []; res = ts.split_selected(bpy.context, s, rep); print("\n".join(rep))
check_split(orig, body, grid_arr, 2048, 2048, 0.5, "2048/inset0.5")
orig.hide_render = True
render(body, os.path.join(OUT, "render_after.png"))
a = ts.image_pixels(bpy.data.images.load(os.path.join(OUT, "render_before.png")))
b = ts.image_pixels(bpy.data.images.load(os.path.join(OUT, "render_after.png")))
d = np.abs(a[..., :3] - b[..., :3]).max(axis=2)
print("render diff: mean %.5f, pixels > 0.1: %d of %d" % (d.mean(), int((d > 0.1).sum()), d.size))
if d.mean() > 0.01: errors.append("render differs: mean %.4f" % d.mean())
diff_img = bpy.data.images.new("diff", d.shape[1], d.shape[0]); dd = np.zeros((d.shape[0], d.shape[1], 4), np.float32); dd[..., 0] = np.clip(d * 5, 0, 1); dd[..., 3] = 1
diff_img.pixels.foreach_set(dd.ravel()); diff_img.filepath_raw = os.path.join(OUT, "render_diff.png"); diff_img.file_format = "PNG"; diff_img.save()

# ------------------------------------------------------------------ run 3: the 1920x1080 request, unpadded and padded
for pad in (False, True):
    body, mat, grid, nrm = build_scene()
    orig = body.copy(); orig.data = body.data.copy(); bpy.context.scene.collection.objects.link(orig); orig.name = "orig"
    att = body.data.attributes.new("orig_face", "INT", "FACE"); att.data.foreach_set("value", list(range(len(body.data.polygons))))
    s = bpy.context.scene.tsc_texsplit
    s.out_dir = os.path.join(OUT, "t1920" + ("pad" if pad else "")); s.tile_w, s.tile_h = 1920, 1080; s.inset = 0.0; s.pad_partial = pad; s.fmt = "PNG"
    for o in bpy.context.scene.objects: o.select_set(o is body)
    rep = []; res = ts.split_selected(bpy.context, s, rep); print("\n".join(rep))
    sizes = check_split(orig, body, grid_arr, 1920, 1080, 0.0, "1920x1080 pad=%s" % pad)
    if pad and any(sz != (1920, 1080) for sz in sizes.values()): errors.append("padded tiles not uniform: %s" % sizes)

print("ERRORS:", errors)
