"""Headless test of tools/blender/tsw_export_prep.py: build a TSC-named loco, export, check the math, re-import the FBX."""
Run:  python tools/tsw/build_test.py <output folder>      (bpy wheel)   or
      blender -b --python tools/tsw/build_test.py -- <output folder>
import sys, os, json, math
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "blender"))
import bpy
from mathutils import Matrix, Vector, Euler
import tsw_export_prep as tp
tp.register()
OUT = sys.argv[-1]
os.makedirs(OUT, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene

def mat(name, rgb):
    m = bpy.data.materials.new(name); m.use_nodes = True
    m.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (*rgb, 1); return m

def box(name, loc, size, m, parent=None, origin_shift=(0, 0, 0), rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(location=loc, rotation=rot)
    o = bpy.context.active_object; o.name = name
    o.scale = (size[0] / 2, size[1] / 2, size[2] / 2)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if any(origin_shift):
        for v in o.data.vertices: v.co = (v.co[0] + origin_shift[0], v.co[1] + origin_shift[1], v.co[2] + origin_shift[2])
        o.data.update()
    bpy.ops.mesh.uv_texture_add(); o.data.materials.append(m)
    if parent: o.parent = parent; o.matrix_parent_inverse = parent.matrix_world.inverted()
    return o

paint = mat("Body", (0.75, 0.42, 0.08)); dark = mat("Under", (0.1, 0.1, 0.1)); steel = mat("Steel", (0.6, 0.6, 0.6))
# TSC master: +Y forward, Z up, metres
body = box("1_0500_engine", (0, 0, 0), (2.9, 18.0, 3.2), paint, origin_shift=(0, 0, 1.9))
box("2_0500_engine", (0, 0, 0), (2.9, 18.0, 3.2), paint, origin_shift=(0, 0, 1.9))        # LOD2 twin -> skipped
box("1_0400_shadow_engine", (0, 0, 0), (2, 17, 0.5), dark, parent=body)                    # skipped
for side, x in (("l", 1.46), ("r", -1.46)):
    for j, y in enumerate((-7.2, 7.2)):
        d = box("1_0500_door_%s%d" % (side, j + 1), (x, y, 0.0), (0.08, 1.2, 2.2), dark, parent=body, origin_shift=(0, 0.6, 1.5))
        d["tsw_vhid"] = "CabDoor_%s" % side.upper() if j == 0 else "PassDoor_%s%d" % (side.upper(), j + 1)
        d["tsw_clip"] = "Door_%s%d" % (side.upper(), j + 1)
        d.rotation_euler = (0, 0, 0); d.keyframe_insert("rotation_euler", frame=0)
        d.rotation_euler = (0, 0, (1.4 if side == "l" else -1.4)); d.keyframe_insert("rotation_euler", frame=24)
for n, y in ((1, 5.5), (2, -5.5)):
    b = box("1_0500_bo%02d" % n, (0, y, 0.5), (2.4, 4.4, 0.5), dark); b.parent = body; b.matrix_parent_inverse = body.matrix_world.inverted()
    for i, off in enumerate((1.9, 0.0, -1.9)):
        bpy.ops.mesh.primitive_cylinder_add(radius=0.525, depth=1.6, vertices=24, location=(0, y + off, 0.525), rotation=(0, math.pi / 2, 0))
        w = bpy.context.active_object; w.name = "1_0500_bo%02dwh%02d" % (n, i + 1); bpy.ops.mesh.uv_texture_add(); w.data.materials.append(steel)
        w.parent = b; w.matrix_parent_inverse = b.matrix_world.inverted()
# pantograph: base (static, child of body) -> lower arm (keyed) -> upper arm (keyed) -> head (static child)
base = box("1_0128_panto01_base", (0, 5.0, 4.0), (1.6, 1.2, 0.15), steel, parent=body)
low = box("1_0128_panto01_part01", (0, 5.0 - 0.9, 4.1), (0.12, 1.9, 0.12), steel, parent=base, origin_shift=(0, 0.95, 0))
up = box("1_0128_panto01_part02", (0, 5.0 + 0.9, 4.1), (0.12, 1.9, 0.12), steel, parent=low, origin_shift=(0, 0.95, 0))
head = box("1_0128_panto01_head", (0, 5.0 + 1.85, 4.1), (1.5, 0.3, 0.08), steel, parent=up)
for o, a in ((low, -1.0), (up, 2.0)):
    o["tsw_clip"] = "Pantograph_F"; o.rotation_euler = (0, 0, 0); o.keyframe_insert("rotation_euler", frame=0)
    o.rotation_euler = (a, 0, 0); o.keyframe_insert("rotation_euler", frame=30)
low["tsw_vhid"] = "PantographControl"
# wipers (NLA strip, like the other add-ons leave it)
wpr = box("1_0064_wiper01_l", (-0.7, 9.0, 2.6), (0.05, 0.05, 0.8), dark, parent=body, origin_shift=(0, 0, 0.4))
wpr.rotation_euler = (0, 0, 0); wpr.keyframe_insert("rotation_euler", frame=0)
wpr.rotation_euler = (0, 1.2, 0); wpr.keyframe_insert("rotation_euler", frame=12)
wpr.rotation_euler = (0, 0, 0); wpr.keyframe_insert("rotation_euler", frame=24)
ad = wpr.animation_data; tr = ad.nla_tracks.new(); tr.name = "wipers"; st = tr.strips.new("wipers", 0, ad.action); st.name = "wipers"; ad.action = None
# buffers
for nm, (x, y) in (("fl", (0.9, 9.0)), ("fr", (-0.9, 9.0)), ("bl", (0.9, -9.0)), ("br", (-0.9, -9.0))):
    box("1_0500_buffer_%s" % nm, (x, y, 1.0), (0.3, 0.5, 0.3), steel, parent=body)
# empties: driver, couplings, a custom socket
def empty(name, loc, parent=None):
    e = bpy.data.objects.new(name, None); sc.collection.objects.link(e); e.location = loc
    if parent: e.parent = parent; e.matrix_parent_inverse = parent.matrix_world.inverted()
    return e
empty("tsc_driver", (0.7, 7.5, 2.4), body); empty("tsc_coupling_front", (0, 9.5, 1.0), body); empty("tsc_coupling_rear", (0, -9.5, 1.0), body)
empty("socket_AudioRunning", (0, 0, 2.5), body)
# cab: a lever in its own collection, keyed 0..1 like a TSC control animation
cabcol = bpy.data.collections.new("Cab"); sc.collection.children.link(cabcol)
lever = box("1_0010_throttle_lever", (0.5, 7.0, 1.5), (0.04, 0.04, 0.3), steel, parent=body, origin_shift=(0, 0, -0.15))
cabcol.objects.link(lever); sc.collection.objects.unlink(lever)
lever["tsw_vhid"] = "ThrottleControl"; lever["tsw_clip"] = "Throttle"
lever.rotation_euler = (0.5, 0, 0); lever.keyframe_insert("rotation_euler", frame=0)
lever.rotation_euler = (-0.5, 0, 0); lever.keyframe_insert("rotation_euler", frame=20)
empty("socket_Lever_Throttle", (0.5, 7.0, 1.5), body)
# collision
c = box("collision_body", (0, 0, 0), (2.9, 18.0, 3.2), dark, origin_shift=(0, 0, 1.9)); c["tsw_collision"] = 1
bpy.context.view_layer.update()

s = sc.tsw; s.out_dir = OUT; s.model_name = "DemoLoco"; s.cab_collection = "Cab"; s.wheel_frames = 60
ROT = tp.ROT_Y_TO_X

# ---------------- math check on a preview rig ----------------
rep = []
rig = tp.build_rig(bpy.context, s, rep)
print("\n".join(rep))
arm = rig["arm"]
errors = []
def world_pose(bone): return arm.matrix_world @ arm.pose.bones[bone].matrix
sheet = rig["sheet"]; bm = sheet["bone_map"]
# rest check: door bone sits at the hinge (rotated)
hinge = ROT @ bpy.data.objects["1_0500_door_l1"].matrix_world.translation
if (arm.data.bones[bm["1_0500_door_l1"]].head_local - hinge).length > 1e-4: errors.append("door bone head != hinge")
# pose check for a clip: bone world pose must equal (Wf W0^-1) R for members, incl. the child-of-bone upper arm
def check_clip(clip, objnames, frames):
    act = rig["actions"][clip][0]; arm.animation_data.action = act
    W0 = {}
    sc.frame_set(0)
    for n in objnames: W0[n] = ROT @ bpy.data.objects[n].matrix_world.copy()
    for f in frames:
        sc.frame_set(f)
        for n in objnames:
            Wf = ROT @ bpy.data.objects[n].matrix_world.copy()
            R = Matrix.Translation(arm.data.bones[bm[n]].head_local)
            expect = Wf @ W0[n].inverted() @ R
            got = world_pose(bm[n])
            d = max(abs(a - b) for ra, rb in zip(expect, got) for a, b in zip(ra, rb))
            if d > 1e-4: errors.append("pose mismatch %s %s f%d d=%.5f" % (clip, n, f, d))
    arm.animation_data.action = None
check_clip("Door_L1", ["1_0500_door_l1"], [0, 12, 24])
check_clip("Pantograph_F", ["1_0128_panto01_part01", "1_0128_panto01_part02"], [0, 15, 30])
check_clip("wipers", ["1_0064_wiper01_l"], [6, 12, 20])
check_clip("Throttle", ["1_0010_throttle_lever"], [0, 10, 20])
# mesh deformation check: a vertex of the pantograph HEAD (static child weighted to the upper-arm bone) at frame 30
act = rig["actions"]["Pantograph_F"][0]; arm.animation_data.action = act; sc.frame_set(30)
dg = bpy.context.evaluated_depsgraph_get()
head_obj = bpy.data.objects["1_0128_panto01_head"]
expect_v = ROT @ head_obj.matrix_world @ head_obj.data.vertices[0].co
ext_eval = rig["ext"].evaluated_get(dg)
me = ext_eval.to_mesh()
best = min((ROT @ Vector((0,0,0)) - (ext_eval.matrix_world @ v.co) + expect_v).length for v in me.vertices)   # min distance to expect_v
# simpler: distance from expect_v to the nearest evaluated vertex
best = min(((ext_eval.matrix_world @ v.co) - expect_v).length for v in me.vertices)
ext_eval.to_mesh_clear()
if best > 1e-3: errors.append("panto head vertex not following the upper arm at f30: %.4f" % best)
arm.animation_data.action = None; sc.frame_set(0)
# wheel clip direction: top of axle1 should move +X at frame 1
act = rig["actions"]["Wheels_FullRotation"][0]; arm.animation_data.action = act
sc.frame_set(0); P0 = world_pose("axle1"); sc.frame_set(3); P3 = world_pose("axle1")
top = Vector((0, 0, 0.525)); d = (P3 @ top) - (P0 @ top)
if d.x <= 0: errors.append("wheel rolls backwards: dx=%.3f" % d.x)
arm.animation_data.action = None; sc.frame_set(0)
print("bones:", [b.name for b in arm.data.bones])
print("sockets:", [(o.name, o.parent_bone) for o in rig["sockets"]])
print("groups:", sheet["weights"])
tp.remove_rig(rig)

# ---------------- real export ----------------
rep = []
out = tp.export_tsw(bpy.context, s, rep)
print("\n".join(rep))
print(json.dumps(sheet["physics"]), json.dumps(sheet["couplers"]), json.dumps(sheet["vhids"]))
leftover = [c.name for c in bpy.data.collections if c.name.startswith("_tsw")]
if leftover: errors.append("leftover collections %s" % leftover)
if "Armature" in bpy.data.objects: errors.append("armature left in scene")

# ---------------- re-import ----------------
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=os.path.join(out, "SK_DemoLoco_Ext.fbx"))
objs = {o.name: o for o in bpy.data.objects}
arms = [o for o in objs.values() if o.type == "ARMATURE"]
meshes = [o for o in objs.values() if o.type == "MESH"]
empties = [o for o in objs.values() if o.type == "EMPTY"]
print("reimport: armatures", [a.name for a in arms], "meshes", [(m.name, [round(v, 3) for v in m.dimensions]) for m in meshes])
print("reimport bones:", [(b.name, b.parent.name if b.parent else None) for b in arms[0].data.bones])
print("reimport sockets:", sorted((e.name, e.parent_bone, [round(v, 2) for v in e.matrix_world.translation]) for e in empties))
if not any(b.name == "axle1" for b in arms[0].data.bones): errors.append("axle1 missing after reimport")
if abs(meshes[0].dimensions.x - 18.5) > 0.05: errors.append("length wrong after reimport: %s" % meshes[0].dimensions.x)
if not [e for e in empties if e.name == "SOCKET_Wheel_L1"]: errors.append("SOCKET_Wheel_L1 missing")
# animation reimport
bpy.ops.import_scene.fbx(filepath=os.path.join(out, "Animation", "Door_L1.fbx"))
acts = [a for a in bpy.data.actions]
print("actions after anim import:", [(a.name, [round(v) for v in a.frame_range]) for a in acts])
a2 = [o for o in bpy.data.objects if o.type == "ARMATURE" and o.animation_data and o.animation_data.action]
if not a2: errors.append("no action on reimported armature")
else:
    arm2 = a2[0]; bpy.context.scene.frame_set(24)
    pb = arm2.pose.bones["door_l1"]
    ang = pb.matrix_basis.to_euler().z
    print("door_l1 rotation at f24:", round(math.degrees(ang), 1), "deg")
    if abs(abs(math.degrees(ang)) - math.degrees(1.4)) > 2: errors.append("door angle wrong after reimport: %.1f" % math.degrees(ang))
bpy.ops.import_scene.fbx(filepath=os.path.join(out, "Animation", "Wheels_FullRotation.fbx"))
a3 = [o for o in bpy.data.objects if o.type == "ARMATURE" and o.animation_data and o.animation_data.action and "Wheels" in o.animation_data.action.name]
if not a3: errors.append("no wheel action")
else:
    bpy.context.scene.frame_set(30); e = a3[0].pose.bones["axle1"].matrix_basis.to_euler("XYZ")
    print("axle1 at f30:", [round(math.degrees(v), 1) for v in e])
print("files:", sorted(os.listdir(out)), sorted(os.listdir(os.path.join(out, "Animation"))))
print("ERRORS:", errors)
