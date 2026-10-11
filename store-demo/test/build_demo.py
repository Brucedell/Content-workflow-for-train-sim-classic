# Builds a synthetic "Little Joe" from primitives, tags hotspots and exports it with the
# Web Export Prep add-on. Run headless:
#   blender -b --python store-demo/test/build_demo.py -- store-demo/models
# (or with the bpy wheel:  python build_demo.py store-demo/models)
import sys, os, json, math
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "tools", "blender"))
import bpy
import web_export_prep as wp
wp.register()
OUT = sys.argv[-1]
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
sc["web_title"] = 'Class EF-4 "Little Joe" Heavy Electric (demo stand-in)'
sc["web_blurb"] = "Demo model built from primitives to prove the pipeline: body, two three-axle bogies, two pantographs, four doors, wipers."
def mat(name, rgb, rough=0.5, metal=0.0):
    m = bpy.data.materials.get(name)
    if m: return m
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]; b.inputs["Base Color"].default_value = (*rgb, 1); b.inputs["Roughness"].default_value = rough; b.inputs["Metallic"].default_value = metal
    return m
def box(name, loc, size, m, parent=None, origin_shift=(0,0,0)):
    bpy.ops.mesh.primitive_cube_add(location=loc)
    o = bpy.context.active_object; o.name = name
    o.scale = (size[0]/2, size[1]/2, size[2]/2)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if any(origin_shift):
        for v in o.data.vertices: v.co = (v.co[0]+origin_shift[0], v.co[1]+origin_shift[1], v.co[2]+origin_shift[2])
        o.data.update()
    bpy.ops.mesh.uv_texture_add(); o.data.materials.append(m)
    if parent: o.parent = parent; o.matrix_parent_inverse = parent.matrix_world.inverted()
    return o
paint = mat("Body", (0.75, 0.42, 0.08)); dark = mat("Underside", (0.12,0.12,0.13), 0.8); glass = mat("Glass", (0.3,0.45,0.6), 0.1); glass["web_glass"]=1
steel = mat("Steel", (0.6,0.6,0.62), 0.35, 1.0)
body = box("1_0500_engine", (0,0,0), (2.9, 18.0, 3.2), paint, origin_shift=(0,0,1.9))
roof = box("1_0500_roof", (0,0,3.7), (2.6, 17.0, 0.5), dark, parent=body)
for i,y in enumerate((-6,-2,2,6)):
    box("1_0500_win%02d"%i, (0, y, 2.3), (2.95, 2.4, 1.0), glass, parent=body)
# doors (origins on hinge edge), left and right
for side,x in (("l",-1.46),("r",1.46)):
    for j,y in enumerate((-7.2, 7.2)):
        d = box("1_0500_door_%s%d"%(side,j+1), (x, y, 0.0), (0.08, 1.2, 2.2), dark, parent=body, origin_shift=(0, 0.6, 1.5))
        d["web_anim"] = "open_door_%s%d"%(side,j+1); d["web_label"] = "Door %s%d"%(side.upper(),j+1)
        d.rotation_euler = (0,0,0); d.keyframe_insert("rotation_euler", frame=0)
        d.rotation_euler = (0,0, (1.4 if side=="l" else -1.4)); d.keyframe_insert("rotation_euler", frame=24)
# bogies + wheels
for n,y in ((1,5.5),(2,-5.5)):
    b = box("1_0500_bo%02d"%n, (0,y,0.5), (2.4,4.4,0.5), dark); b.parent = body; b.matrix_parent_inverse = body.matrix_world.inverted()
    for i,off in enumerate((1.9,0.0,-1.9)):
        bpy.ops.mesh.primitive_cylinder_add(radius=0.525, depth=1.6, vertices=24, location=(0,y+off,0.525), rotation=(0,math.pi/2,0))
        w = bpy.context.active_object; w.name = "1_0500_bo%02dwh%02d"%(n,i+1); bpy.ops.mesh.uv_texture_add(); w.data.materials.append(steel)
        w.parent = b; w.matrix_parent_inverse = b.matrix_world.inverted()
# pantographs: lower arm hinged at base, upper arm child of lower
for n,y,s in ((1,5.0,1),(2,-5.0,-1)):
    base = box("1_0128_panto%02d_base"%n, (0,y,4.0), (1.6,1.2,0.15), steel, parent=body)
    low = box("1_0128_panto%02d_part01"%n, (0,y-0.9*s,4.1), (0.12,1.9,0.12), steel, parent=base, origin_shift=(0,0.95*s,0))
    up = box("1_0128_panto%02d_part02"%n, (0,y+0.9*s,4.1), (0.12,1.9,0.12), steel, parent=low, origin_shift=(0,0.95*s,0))
    head = box("1_0128_panto%02d_head"%n, (0,y+1.85*s,4.1), (1.5,0.3,0.08), steel, parent=up)
    low["web_anim"] = "raise_panto_%s"%("front" if n==1 else "rear"); low["web_label"] = "Pantograph %s"%("front" if n==1 else "rear")
    base["web_hotspot"] = low["web_anim"]; base["web_label"] = low["web_label"]
    # key: lower arm rotates up about X, upper arm counter-rotates so the head stays level
    low.rotation_euler=(0,0,0); low.keyframe_insert("rotation_euler", frame=0)
    low.rotation_euler=(-1.0*s,0,0); low.keyframe_insert("rotation_euler", frame=30)
    up.rotation_euler=(0,0,0); up.keyframe_insert("rotation_euler", frame=0)
    up.rotation_euler=(2.0*s,0,0); up.keyframe_insert("rotation_euler", frame=30)
    up["web_anim"] = low["web_anim"]  # same strip name: both become one glTF animation
# wipers
for side,x in (("l",-0.7),("r",0.7)):
    wpr = box("1_0064_wiper01_%s"%side, (x, 9.0, 2.6), (0.05, 0.05, 0.8), dark, parent=body, origin_shift=(0,0,0.4))
    wpr["web_anim"]="wipers"; wpr["web_label"]="Wipers"
    wpr.rotation_euler=(0,0,0); wpr.keyframe_insert("rotation_euler", frame=0)
    wpr.rotation_euler=(0,1.2,0); wpr.keyframe_insert("rotation_euler", frame=12)
    wpr.rotation_euler=(0,0,0); wpr.keyframe_insert("rotation_euler", frame=24)
# TSC-only things that should be skipped
sh = box("1_0400_shadow_engine", (0,0,0), (2,17,0.5), dark, parent=body)
cf = bpy.data.objects.new("tsc_coupling_front", None); sc.collection.objects.link(cf)
bpy.context.view_layer.update()
s = sc.web; s.out_dir = OUT; s.model_name = "sample_electric"; s.tri_budget = 60000
rep = []; path, man = wp.export_web(bpy.context, s, rep)
print("\n".join(rep)); print(json.dumps(man, indent=1)[:1500])
