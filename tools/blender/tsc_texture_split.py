bl_info = {
    "name": "TSC Texture Split (atlas tiler)",
    "author": "Content-workflow-for-train-sim-classic",
    "version": (0, 1, 0),
    "blender": (4, 2, 0),
    "location": "3D Viewport > Sidebar (N) > TSC > Texture split",
    "description": "Split a material whose textures exceed the game's size limit into tile materials, cutting the mesh along the tile borders in UV space; lossless (crop, not bake)",
    "category": "Material",
}

"""
TSC Texture Split
-----------------
Substance Painter gives you one 4K sheet per material.  Train Sim Classic
wants smaller, power-of-two textures.  Instead of re-baking (blurry, slow,
re-packs the UVs) this add-on CROPS:

  1. the UV space of the material is divided into a grid of tiles of
     tile_w x tile_h source pixels (e.g. 4096 -> 2x2 tiles of 2048);
  2. every face that straddles a tile border is cut along that border in UV
     space (edges are split at the exact crossing, so there is no crack and
     smoothing is kept: the new vertices are shared);
  3. each face is assigned to a copy of the original material whose image
     nodes point at the cropped tile images; every map the material uses
     (base colour, normal, spec...) is cropped the same way;
  4. the face's UVs are remapped into 0..1 of its tile, with a half-texel
     inset so bilinear filtering never wraps to the opposite edge.

Every source texel lands in exactly one tile texel: the detail is kept
unchanged.  Tiles no face uses are not written.  The original material and
images stay in the file untouched; the operator works on the selected mesh
objects' data (duplicate first if you want to keep the unsplit mesh).

Output: <out_dir>/<image>_c<col>r<row>.<png|tga> per used tile and map,
plus a JSON report.  ACE conversion is external (the same step as before).
"""

import json
import math
import os

import bmesh
import bpy
import numpy as np
from mathutils import Vector

EPS = 1e-6


# ---------------------------------------------------------------------------
# tile grid
# ---------------------------------------------------------------------------
class Grid:
    """Tile grid over the source image in pixels and in UV space."""

    def __init__(self, src_w, src_h, tile_w, tile_h):
        self.src_w, self.src_h, self.tile_w, self.tile_h = src_w, src_h, tile_w, tile_h
        self.cols = int(math.ceil(src_w / float(tile_w)))
        self.rows = int(math.ceil(src_h / float(tile_h)))
        # UV border lines inside [0,1): u = k*tile_w/src_w
        self.u_lines = [k * tile_w / float(src_w) for k in range(1, self.cols)]
        self.v_lines = [j * tile_h / float(src_h) for j in range(1, self.rows)]

    def tile_of(self, u, v):
        """(col, row) for a UV point; UVs outside 0..1 wrap like a repeating texture."""
        fu, fv = u - math.floor(u), v - math.floor(v)
        c = min(int(fu * self.src_w / self.tile_w), self.cols - 1)
        r = min(int(fv * self.src_h / self.tile_h), self.rows - 1)
        return c, r

    def rect(self, c, r):
        """Pixel rect (x0, y0, x1, y1) of a tile in the source image (y up, like Blender)."""
        x0, y0 = c * self.tile_w, r * self.tile_h
        return x0, y0, min(x0 + self.tile_w, self.src_w), min(y0 + self.tile_h, self.src_h)

    def all_lines(self, umin, umax, vmin, vmax):
        """Cut lines covering the mesh's UV range (texture repeats beyond 0..1)."""
        us, vs = [], []
        for base in range(int(math.floor(umin)), int(math.ceil(umax)) + 1):
            us.append(float(base))
            us.extend(base + l for l in self.u_lines)
        for base in range(int(math.floor(vmin)), int(math.ceil(vmax)) + 1):
            vs.append(float(base))
            vs.extend(base + l for l in self.v_lines)
        us = [u for u in us if umin + EPS < u < umax - EPS]
        vs = [v for v in vs if vmin + EPS < v < vmax - EPS]
        return us, vs


# ---------------------------------------------------------------------------
# cutting the mesh along UV lines
# ---------------------------------------------------------------------------
def _split_edge_at(bm, uv_layer, edge, t_from_v0):
    """Split edge at fraction t (from edge.verts[0]); set the new loops' UVs by
    interpolating each adjacent face's own loop UVs, so UV seams stay intact."""
    v0 = edge.verts[0]
    new_edge, v_new = bmesh.utils.edge_split(edge, v0, t_from_v0)
    for l in v_new.link_loops:
        lp, ln = l.link_loop_prev, l.link_loop_next
        d = (ln.vert.co - lp.vert.co).length
        t = (v_new.co - lp.vert.co).length / d if d > 0 else 0.5
        l[uv_layer].uv = lp[uv_layer].uv.lerp(ln[uv_layer].uv, t)
    return v_new


def cut_faces_along(bm, uv_layer, faces, axis, line):
    """Cut every face in `faces` whose UVs straddle u=line (axis 0) or v=line
    (axis 1).  Returns the list of faces after cutting (originals replaced)."""
    out = []
    todo = list(faces)
    while todo:
        f = todo.pop()
        if not f.is_valid:
            continue
        vals = [l[uv_layer].uv[axis] for l in f.loops]
        if min(vals) >= line - EPS or max(vals) <= line + EPS:
            out.append(f)
            continue
        if len(f.verts) > 3:                                   # straddling n-gon: triangulate, revisit
            res = bmesh.ops.triangulate(bm, faces=[f], quad_method="BEAUTY", ngon_method="BEAUTY")
            todo.extend(res["faces"])
            continue
        # triangle: find crossing edges / on-line verts
        loops = list(f.loops)
        on_line, cross = [], []
        for i in range(3):
            la, lb = loops[i], loops[(i + 1) % 3]
            a, b = la[uv_layer].uv[axis], lb[uv_layer].uv[axis]
            if abs(a - line) <= EPS:
                on_line.append(la.vert)
            if (a < line - EPS and b > line + EPS) or (a > line + EPS and b < line - EPS):
                e = la.edge
                t_uv = (line - a) / (b - a)
                t = t_uv if e.verts[0] == la.vert else 1.0 - t_uv
                cross.append((e, t))
        new_verts = [_split_edge_at(bm, uv_layer, e, t) for e, t in cross]
        pts = list(dict.fromkeys(new_verts + on_line))
        if len(pts) >= 2:
            try:
                f2, _ = bmesh.utils.face_split(f, pts[0], pts[1])
                todo.extend([f, f2])
            except ValueError:
                out.append(f)
        else:
            out.append(f)
    return out


# ---------------------------------------------------------------------------
# images
# ---------------------------------------------------------------------------
def image_pixels(img):
    w, h = img.size
    arr = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(arr)
    return arr.reshape(h, w, 4)


def crop_tile(src_arr, rect, pad_to=None):
    x0, y0, x1, y1 = rect
    tile = src_arr[y0:y1, x0:x1]
    if pad_to and (tile.shape[1] != pad_to[0] or tile.shape[0] != pad_to[1]):
        full = np.zeros((pad_to[1], pad_to[0], 4), dtype=np.float32)
        full[:tile.shape[0], :tile.shape[1]] = tile
        tile = full
    return np.ascontiguousarray(tile)


def write_image(name, arr, out_dir, fmt, colorspace, is_data):
    h, w = arr.shape[:2]
    img = bpy.data.images.new(name, w, h, alpha=True, float_buffer=False)
    img.colorspace_settings.name = colorspace
    img.pixels.foreach_set(arr.ravel())
    ext = ".tga" if fmt == "TGA" else ".png"
    path = os.path.join(out_dir, name + ext)
    img.filepath_raw = path
    img.file_format = "TARGA" if fmt == "TGA" else "PNG"
    img.save()
    img.filepath = path
    img.source = "FILE"
    img.reload()
    if is_data:
        img.colorspace_settings.name = "Non-Color"
    return img


# ---------------------------------------------------------------------------
# the operation
# ---------------------------------------------------------------------------
def image_nodes(mat):
    if not mat.use_nodes:
        return []
    return [n for n in mat.node_tree.nodes if n.type == "TEX_IMAGE" and n.image is not None]


def split_material(context, obj, mat_index, settings, report):
    """Split one material slot of one mesh object into tile materials."""
    me = obj.data
    mat = me.materials[mat_index]
    nodes = image_nodes(mat)
    if not nodes:
        raise RuntimeError("material %s has no image texture" % mat.name)
    base_img = nodes[0].image                                   # the first map defines the grid
    grid = Grid(base_img.size[0], base_img.size[1], settings.tile_w, settings.tile_h)
    report.append("%s / %s: %dx%d -> %dx%d tiles of %dx%d" % (obj.name, mat.name, base_img.size[0], base_img.size[1],
                                                               grid.cols, grid.rows, settings.tile_w, settings.tile_h))
    if grid.cols * grid.rows == 1:
        report.append("  already within the tile size, nothing to do")
        return {}

    bm = bmesh.new()
    bm.from_mesh(me)
    uv_layer = bm.loops.layers.uv.verify()
    faces = [f for f in bm.faces if f.material_index == mat_index]
    if not faces:
        bm.free()
        return {}
    us = [l[uv_layer].uv.x for f in faces for l in f.loops]
    vs = [l[uv_layer].uv.y for f in faces for l in f.loops]
    u_lines, v_lines = grid.all_lines(min(us), max(us), min(vs), max(vs))
    n_before = len(faces)
    for line in u_lines:
        faces = cut_faces_along(bm, uv_layer, faces, 0, line)
    for line in v_lines:
        faces = cut_faces_along(bm, uv_layer, faces, 1, line)
    faces = [f for f in faces if f.is_valid]
    report.append("  cut along %d u-lines and %d v-lines: %d -> %d faces" % (len(u_lines), len(v_lines), n_before, len(faces)))

    # which tiles are used
    used = {}
    for f in faces:
        cu = sum(l[uv_layer].uv.x for l in f.loops) / len(f.loops)
        cv = sum(l[uv_layer].uv.y for l in f.loops) / len(f.loops)
        used.setdefault(grid.tile_of(cu, cv), []).append(f)
    report.append("  %d of %d tiles used: %s" % (len(used), grid.cols * grid.rows, sorted(used)))

    # tile images for every map of the material
    out_dir = bpy.path.abspath(settings.out_dir)
    os.makedirs(out_dir, exist_ok=True)
    arrays = {}
    for n in nodes:
        img = n.image
        if img.name not in arrays:
            arrays[img.name] = image_pixels(img)
    tile_images = {}                                            # (c, r) -> {image name: tile image}
    for (c, r) in sorted(used):
        d = {}
        for n in nodes:
            img = n.image
            sw, sh = img.size
            # the tile rect in this image's own pixels (maps may differ in size)
            x0 = int(round(c * settings.tile_w * sw / grid.src_w)); x1 = int(round(min((c + 1) * settings.tile_w, grid.src_w) * sw / grid.src_w))
            y0 = int(round(r * settings.tile_h * sh / grid.src_h)); y1 = int(round(min((r + 1) * settings.tile_h, grid.src_h) * sh / grid.src_h))
            pad = (int(round(settings.tile_w * sw / grid.src_w)), int(round(settings.tile_h * sh / grid.src_h))) if settings.pad_partial else None
            arr = crop_tile(arrays[img.name], (x0, y0, x1, y1), pad)
            name = "%s_c%dr%d" % (os.path.splitext(img.name)[0], c, r)
            is_data = img.colorspace_settings.name in ("Non-Color", "Linear", "Linear Rec.709")
            d[img.name] = write_image(name, arr, out_dir, settings.fmt, img.colorspace_settings.name, is_data)
        tile_images[(c, r)] = d

    # materials + face assignment + UV remap
    new_mats = {}
    for (c, r), tf in used.items():
        m2 = mat.copy()
        m2.name = "%s_c%dr%d" % (mat.name, c, r)
        for n in image_nodes(m2):
            n.image = tile_images[(c, r)][n.image.name]
            n.extension = "EXTEND"
        me.materials.append(m2)
        idx = len(me.materials) - 1
        new_mats[(c, r)] = m2
        x0, y0, x1, y1 = grid.rect(c, r)
        tw, th = (settings.tile_w, settings.tile_h) if settings.pad_partial else (x1 - x0, y1 - y0)
        inset_u, inset_v = settings.inset / float(tw), settings.inset / float(th)
        for f in tf:
            f.material_index = idx
            for l in f.loops:
                uv = l[uv_layer].uv
                fu, fv = uv.x - math.floor(uv.x), uv.y - math.floor(uv.y)
                px, py = fu * grid.src_w - x0, fv * grid.src_h - y0
                # a loop exactly on the far border of the last tile wraps to 0 above (frac(1.0) = 0); bring it back.
                # A loop on the tile's own left/bottom border is at px ~ 0 (float noise), never this far negative.
                if px < -0.5 * (x1 - x0) and c == grid.cols - 1: px += grid.src_w
                if py < -0.5 * (y1 - y0) and r == grid.rows - 1: py += grid.src_h
                nu, nv = px / float(tw), py / float(th)
                nu = inset_u + nu * (1.0 - 2 * inset_u)
                nv = inset_v + nv * (1.0 - 2 * inset_v)
                l[uv_layer].uv = (nu, nv)
    bm.to_mesh(me)
    bm.free()
    me.update()
    return {"material": mat.name, "grid": [grid.cols, grid.rows], "tiles": {"c%dr%d" % k: {"material": m.name, "faces": len(used[k]),
            "images": {src: ti.name for src, ti in tile_images[k].items()}} for k, m in new_mats.items()}}


def split_selected(context, settings, report):
    results = []
    for obj in [o for o in context.selected_objects if o.type == "MESH"]:
        for i, mat in enumerate(list(obj.data.materials)):
            if mat is None or not image_nodes(mat):
                continue
            img = image_nodes(mat)[0].image
            if img.size[0] <= settings.tile_w and img.size[1] <= settings.tile_h:
                continue
            if settings.only_material and mat.name != settings.only_material:
                continue
            res = split_material(context, obj, i, settings, report)
            if res:
                res["object"] = obj.name
                results.append(res)
    if settings.remove_empty_slots:
        for obj in [o for o in context.selected_objects if o.type == "MESH"]:
            me = obj.data
            used = {p.material_index for p in me.polygons}
            for i in reversed(range(len(me.materials))):
                if i not in used:
                    me.materials.pop(index=i)
    out_dir = bpy.path.abspath(settings.out_dir)
    with open(os.path.join(out_dir, "texture_split_report.json"), "w") as f:
        json.dump(results, f, indent=2)
    return results


# ---------------------------------------------------------------------------
# UI
# ---------------------------------------------------------------------------
class TexSplitSettings(bpy.types.PropertyGroup):
    out_dir: bpy.props.StringProperty(name="Output folder", subtype="DIR_PATH")
    tile_w: bpy.props.IntProperty(name="Tile width px", default=2048, min=16)
    tile_h: bpy.props.IntProperty(name="Tile height px", default=2048, min=16)
    inset: bpy.props.FloatProperty(name="Border inset (texels)", default=0.5, min=0.0, max=8.0,
                                   description="UVs stop this many texels short of the tile edge so filtering never wraps")
    pad_partial: bpy.props.BoolProperty(name="Pad partial tiles to full size", default=False,
                                        description="Last column/row tiles are written at the full tile size (content bottom-left) instead of their real size")
    fmt: bpy.props.EnumProperty(name="Format", items=[("PNG", "PNG", ""), ("TGA", "TGA", "")], default="TGA")
    only_material: bpy.props.StringProperty(name="Only material", default="", description="Leave empty for every oversized material on the selected objects")
    remove_empty_slots: bpy.props.BoolProperty(name="Remove emptied slots", default=True)


class TEXSPLIT_OT_split(bpy.types.Operator):
    bl_idname = "tsc.texture_split"
    bl_label = "Split oversized textures into tiles"
    bl_options = {"REGISTER", "UNDO"}

    def execute(self, context):
        s = context.scene.tsc_texsplit
        if not s.out_dir:
            self.report({"ERROR"}, "Set the output folder first")
            return {"CANCELLED"}
        rep = []
        try:
            res = split_selected(context, s, rep)
        except Exception as e:  # noqa: BLE001
            self.report({"ERROR"}, str(e))
            return {"CANCELLED"}
        txt = bpy.data.texts.get("Texture_Split") or bpy.data.texts.new("Texture_Split")
        txt.clear(); txt.write("\n".join(rep))
        self.report({"INFO"}, "%d material(s) split (details in text 'Texture_Split')" % len(res))
        return {"FINISHED"}


class TEXSPLIT_PT_panel(bpy.types.Panel):
    bl_label = "Texture split"
    bl_space_type = "VIEW_3D"
    bl_region_type = "UI"
    bl_category = "TSC"

    def draw(self, context):
        s = context.scene.tsc_texsplit
        col = self.layout.column(align=True)
        col.prop(s, "out_dir"); col.prop(s, "tile_w"); col.prop(s, "tile_h"); col.prop(s, "inset")
        col.prop(s, "pad_partial"); col.prop(s, "fmt"); col.prop(s, "only_material"); col.prop(s, "remove_empty_slots")
        col.operator("tsc.texture_split", icon="TEXTURE")


CLASSES = (TexSplitSettings, TEXSPLIT_OT_split, TEXSPLIT_PT_panel)


def register():
    for c in CLASSES:
        bpy.utils.register_class(c)
    bpy.types.Scene.tsc_texsplit = bpy.props.PointerProperty(type=TexSplitSettings)


def unregister():
    del bpy.types.Scene.tsc_texsplit
    for c in reversed(CLASSES):
        bpy.utils.unregister_class(c)


if __name__ == "__main__":
    register()
