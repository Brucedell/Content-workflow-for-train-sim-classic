bl_info = {
    "name": "TSW Export Prep (Train Sim World branch)",
    "author": "Content-workflow-for-train-sim-classic",
    "version": (0, 1, 0),
    "blender": (4, 2, 0),
    "location": "3D Viewport > Sidebar (N) > TSC > TSW branch",
    "description": "Turn the TSC object hierarchy into one skinned skeletal mesh + value-scrubbed clips + sockets for the TSW PC Editor",
    "category": "Import-Export",
}

"""
TSW Export Prep - fourth output of the shared-model workflow.

Train Sim World wants something the other targets do not: ONE skeletal mesh
with an armature, where every part that moves is a bone, every animation is a
short clip that the game scrubs with a value (wheel angle, lever position, door
0..1), and attachment points are sockets on the skeleton.  The TSC master scene
is an object hierarchy with object-level keys.  This add-on converts it on a
temporary copy and leaves the master untouched:

  objects              -> bones (world-aligned: X forward, Y left, Z up), one
                          per animated / tagged object; wheels -> axle1..n,
                          bogies -> bogie1..n, buffers -> buffer_fl..br
  static objects       -> weighted to the nearest bone ancestor, else Body_Pivot
  object keyframes     -> pose-bone keys, baked per frame, one action per clip
  tsc_driver empty     -> SOCKET_DriverSeat
  wheel meshes         -> SOCKET_Wheel_L1/R1.. at the rail contact
  tsc_coupling empties -> SOCKET_Coupler_F/B + coupler numbers in the build sheet
  socket_* / tsw_socket empties -> SOCKET_<name>

Writes into <out>/<Name>/:
  SK_<Name>_Ext.fbx              skeletal mesh + skeleton + sockets, no animation
  SK_<Name>_Cab.fbx              (optional) cab mesh on the same skeleton
  Animation/<Clip>.fbx           one FBX per clip (armature only), including a
                                 generated Wheels_FullRotation
  UCX_<Name>_Collision.fbx       walkable collision, static mesh
  <Name>.tsw_build.json          numbers for the editor: physics box, buffers,
                                 couplers, axles, sockets, clips, VHID hints,
                                 bone map
Units: Blender metres; the FBX carries cm (Apply Unit, FBX All).  UE Y = -Blender Y.

Custom properties read (Object):
  tsw_bone       force a bone with this name
  tsw_clip       clip name for this object's animation (default: NLA strip name,
                 web_anim, or the action name)
  tsw_vhid       name of the VHID model component that will drive this part
  tsw_socket     (empty) export as SOCKET_<value>
  tsw_collision  (mesh) part of the UCX collision mesh
  tsw_cab        goes into SK_<Name>_Cab (or put it in the cab collection)
  tsw_skip       leave out
"""

import json
import math
import os
import re

import bpy
from mathutils import Matrix, Vector

NAME_RE = re.compile(r"^(\d)_(\d{4})_(.+)$")
DUP_RE = re.compile(r"\.\d{3}$")
BOGIE_RE = re.compile(r"(?:^|_)bo(\d\d)$")
WHEEL_RE = re.compile(r"(?:^|_)bo(\d\d)wh(\d\d)$")
TSC_ONLY = ("shadow_", "primarydigits", "light_fwd", "light_rev")
BODY_NAMES = ("engine", "wagon", "coach", "body", "vehicle", "car")
ROT_Y_TO_X = Matrix.Rotation(-math.pi / 2.0, 4, "Z")      # Blender +Y (TSC front) -> +X (UE front)
WHEEL_CLIP = "Wheels_FullRotation"


# ---------------------------------------------------------------------------
# naming helpers
# ---------------------------------------------------------------------------
def split_name(name):
    base = DUP_RE.sub("", name)
    m = NAME_RE.match(base)
    if not m:
        return None, None, base
    return int(m.group(1)), int(m.group(2)), m.group(3)


def base_of(o):
    return split_name(o.name)[2]


def clean(name):
    return re.sub(r"[^A-Za-z0-9_]", "_", name)


def is_skipped(o):
    if o.get("tsw_skip"):
        return True
    lod, _, base = split_name(o.name)
    if lod not in (None, 1):
        return True                                       # LOD 1 only; UE makes its own LODs
    b = base.lower()
    return any(t in b for t in TSC_ONLY)


def has_keys(o):
    ad = o.animation_data
    if ad is None:
        return False
    if ad.action is not None and len(ad.action.fcurves):
        return True
    return any(len(t.strips) for t in ad.nla_tracks)


def object_clips(o):
    """[(clip name, first frame, last frame)] for this object's animation."""
    ad = o.animation_data
    if ad is None:
        return []
    out = []
    override = o.get("tsw_clip")
    if ad.action is not None and len(ad.action.fcurves):
        name = override or o.get("web_anim") or ad.action.name
        fr = ad.action.frame_range
        out.append((clean(str(name)), int(fr[0]), int(math.ceil(fr[1]))))
    for t in ad.nla_tracks:
        for s in t.strips:
            name = override or s.name.split("#")[0]
            out.append((clean(str(name)), int(s.frame_start), int(math.ceil(s.frame_end))))
    return out


# ---------------------------------------------------------------------------
# classification of the master scene
# ---------------------------------------------------------------------------
class Part:
    __slots__ = ("obj", "role", "bone", "parent_bone", "clips", "group", "cab")

    def __init__(self, obj):
        self.obj = obj
        self.role = "static"
        self.bone = None             # bone this object BECOMES (None = static)
        self.parent_bone = "Body_Pivot"
        self.clips = object_clips(obj)
        self.group = None            # vertex group it is weighted to
        self.cab = False


def classify(scene, settings):
    cab_col = bpy.data.collections.get(settings.cab_collection) if settings.cab_collection else None
    cab_objs = set(cab_col.all_objects) if cab_col else set()
    parts = {}
    for o in scene.objects:
        if o.type not in {"MESH", "EMPTY"} or is_skipped(o):
            continue
        p = Part(o)
        p.cab = bool(o.get("tsw_cab")) or o in cab_objs
        base = base_of(o)
        b = base.lower()
        if o.type == "EMPTY":
            p.role = "empty"
        elif WHEEL_RE.search(b):
            p.role = "wheel"
        elif BOGIE_RE.search(b):
            p.role = "bogie"
        elif "buffer" in b:
            p.role = "buffer"
        elif b in BODY_NAMES:
            p.role = "body"
        elif o.get("tsw_bone") or o.get("tsw_vhid") or has_keys(o):
            p.role = "moving"
        parts[o.name] = p

    # bone names -------------------------------------------------------------
    fwd = lambda o: (ROT_Y_TO_X @ o.matrix_world.translation).x
    wheels = sorted([p for p in parts.values() if p.role == "wheel"], key=lambda p: -fwd(p.obj))
    for i, p in enumerate(wheels):
        p.bone = str(p.obj.get("tsw_bone") or "axle%d" % (i + 1))
    bogies = sorted([p for p in parts.values() if p.role == "bogie"], key=lambda p: -fwd(p.obj))
    for i, p in enumerate(bogies):
        p.bone = str(p.obj.get("tsw_bone") or "bogie%d" % (i + 1))
    for p in parts.values():
        if p.role == "buffer":
            t = ROT_Y_TO_X @ p.obj.matrix_world.translation
            p.bone = str(p.obj.get("tsw_bone") or "buffer_%s%s" % ("f" if t.x >= 0 else "b", "l" if t.y >= 0 else "r"))
        elif p.role == "moving":
            p.bone = clean(str(p.obj.get("tsw_bone") or base_of(p.obj)))
    # unique bone names
    seen = {}
    for p in parts.values():
        if p.bone:
            n = p.bone
            if n in seen:
                k = 2
                while "%s_%d" % (n, k) in seen:
                    k += 1
                p.bone = "%s_%d" % (n, k)
            seen[p.bone] = p

    # parent bone = nearest ancestor that is a bone ----------------------------
    for p in parts.values():
        a = p.obj.parent
        while a is not None:
            ap = parts.get(a.name)
            if ap is not None and ap.bone:
                p.parent_bone = ap.bone
                break
            a = a.parent
        p.group = p.bone or p.parent_bone
    return parts


# ---------------------------------------------------------------------------
# the temporary rig
# ---------------------------------------------------------------------------
def _world_at(o, frame_cache, f):
    """World matrix of o at frame f (already rotated to +X forward)."""
    key = (o.name, f)
    if key not in frame_cache:
        raise KeyError(key)
    return frame_cache[key]


def sample_frames(scene, objs, frames):
    """{(obj name, frame): rotated world matrix} for the given objects/frames."""
    cache = {}
    cur = scene.frame_current
    for f in frames:
        scene.frame_set(f)
        for o in objs:
            cache[(o.name, f)] = ROT_Y_TO_X @ o.matrix_world.copy()
    scene.frame_set(cur)
    return cache


def mesh_bbox_world(o, M):
    pts = [M @ Vector(c) for c in o.bound_box]
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    return lo, hi


def build_rig(context, settings, report):
    """Build armature + joined meshes + sockets + clip actions in a temporary
    collection.  Returns a dict describing everything (used by export and by
    the build sheet)."""
    scene = context.scene
    parts = classify(scene, settings)
    if not any(p.role != "empty" for p in parts.values()):
        raise RuntimeError("nothing to export (no LOD-1 meshes)")
    name = settings.model_name.strip() or bpy.path.display_name_from_filepath(bpy.data.filepath) or "MyLoco"
    name = clean(name)

    scene.frame_set(0)
    dg = context.evaluated_depsgraph_get()
    rest = {o.name: ROT_Y_TO_X @ o.matrix_world.copy() for o in scene.objects}

    col = bpy.data.collections.new("_tsw_export")
    scene.collection.children.link(col)

    # --- armature -----------------------------------------------------------
    arm_data = bpy.data.armatures.new("Armature")
    arm = bpy.data.objects.new("Armature", arm_data)
    col.objects.link(arm)
    for o in scene.objects:
        o.select_set(False)
    context.view_layer.objects.active = arm
    arm.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    eb = arm_data.edit_bones
    L = settings.bone_length

    def add_bone(bname, head, parent=None, length=L):
        b = eb.new(bname)
        b.head = head
        b.tail = head + Vector((0.0, length, 0.0))          # bone Y = world Y, roll 0 -> X fwd, Z up
        b.roll = 0.0
        if parent is not None:
            b.parent = eb[parent]
        b.use_deform = True
        return b

    add_bone("Root", Vector((0, 0, 0)))
    add_bone("Body_Pivot", Vector((0, 0, 0)), "Root")
    # create bone objects in hierarchy order (parents first)
    boned = [p for p in parts.values() if p.bone]
    ordered, done = [], {"Root", "Body_Pivot"}
    while boned:
        progress = False
        for p in list(boned):
            if p.parent_bone in done:
                ordered.append(p); done.add(p.bone); boned.remove(p); progress = True
        if not progress:
            raise RuntimeError("bone hierarchy loop at %s" % [p.bone for p in boned])
    bone_rest = {"Root": Matrix.Identity(4), "Body_Pivot": Matrix.Identity(4)}
    for p in ordered:
        head = rest[p.obj.name].translation.copy()
        length = L
        if p.role == "wheel":
            lo, hi = mesh_bbox_world(p.obj, rest[p.obj.name])
            length = max(hi.y - lo.y, 0.05)
            head.y = lo.y                                  # axle bone spans the wheelset
        add_bone(p.bone, head, p.parent_bone, length)
        bone_rest[p.bone] = Matrix.Translation(head)
    bpy.ops.object.mode_set(mode="OBJECT")

    # --- meshes (joined per target: Ext / Cab) --------------------------------
    def make_copy(p):
        o = p.obj
        ev = o.evaluated_get(dg)
        me = bpy.data.meshes.new_from_object(ev, preserve_all_data_layers=True, depsgraph=dg)
        c = bpy.data.objects.new("_tsw_" + o.name, me)
        col.objects.link(c)
        c.matrix_world = rest[o.name]
        vg = c.vertex_groups.new(name=p.group)
        vg.add(list(range(len(me.vertices))), 1.0, "REPLACE")
        return c

    def join(copies, mesh_name):
        me = bpy.data.meshes.new(mesh_name)
        j = bpy.data.objects.new(mesh_name, me)
        col.objects.link(j)
        if copies:
            with context.temp_override(active_object=j, object=j, selected_editable_objects=[j] + copies,
                                       selected_objects=[j] + copies):
                bpy.ops.object.join()
        mod = j.modifiers.new("Armature", "ARMATURE")
        mod.object = arm
        j.parent = arm
        return j

    ext_copies = [make_copy(p) for p in parts.values() if p.obj.type == "MESH" and not p.cab and not p.obj.get("tsw_collision")]
    cab_copies = [make_copy(p) for p in parts.values() if p.obj.type == "MESH" and p.cab and not p.obj.get("tsw_collision")]
    sk_ext = join(ext_copies, "SK_%s_Ext" % name)
    sk_cab = join(cab_copies, "SK_%s_Cab" % name) if cab_copies else None

    # --- collision ------------------------------------------------------------
    coll_src = [p for p in parts.values() if p.obj.type == "MESH" and p.obj.get("tsw_collision")]
    ucx_name = "UCX_%s_Collision" % name
    if coll_src:
        cc = []
        for p in coll_src:
            ev = p.obj.evaluated_get(dg)
            me = bpy.data.meshes.new_from_object(ev, depsgraph=dg)
            c = bpy.data.objects.new("_tsw_c_" + p.obj.name, me)
            col.objects.link(c); c.matrix_world = rest[p.obj.name]; cc.append(c)
        me = bpy.data.meshes.new(ucx_name)
        ucx = bpy.data.objects.new(ucx_name, me); col.objects.link(ucx)
        with context.temp_override(active_object=ucx, object=ucx, selected_editable_objects=[ucx] + cc, selected_objects=[ucx] + cc):
            bpy.ops.object.join()
    else:
        body = [p for p in parts.values() if p.role == "body"] or [p for p in parts.values() if p.obj.type == "MESH" and not p.cab]
        lo, hi = mesh_bbox_world(body[0].obj, rest[body[0].obj.name])
        for p in body[1:]:
            l2, h2 = mesh_bbox_world(p.obj, rest[p.obj.name])
            lo = Vector((min(lo.x, l2.x), min(lo.y, l2.y), min(lo.z, l2.z))); hi = Vector((max(hi.x, h2.x), max(hi.y, h2.y), max(hi.z, h2.z)))
        me = bpy.data.meshes.new(ucx_name)
        verts = [Vector((x, y, z)) for x in (lo.x, hi.x) for y in (lo.y, hi.y) for z in (lo.z, hi.z)]
        faces = [(0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)]
        me.from_pydata(verts, [], faces); me.update()
        ucx = bpy.data.objects.new(ucx_name, me); col.objects.link(ucx)
        report.append("no tsw_collision meshes: UCX is the body bounding box")

    # --- sockets ------------------------------------------------------------
    sockets = []

    def add_socket(sname, M, parent_bone):
        e = bpy.data.objects.new("SOCKET_" + sname, None)
        e.empty_display_size = 0.15
        col.objects.link(e)
        e.parent = arm
        e.parent_type = "BONE"
        e.parent_bone = parent_bone
        e.matrix_parent_inverse = Matrix.Identity(4)
        e.matrix_world = M
        sockets.append({"name": sname, "bone": parent_bone, "position_m": [round(v, 4) for v in M.translation]})
        return e

    for p in parts.values():
        if p.role == "wheel":
            lo, hi = mesh_bbox_world(p.obj, rest[p.obj.name])
            n = re.sub(r"\D", "", p.bone) or "0"
            x = rest[p.obj.name].translation.x
            carrier = p.parent_bone                     # bogie bone or Body_Pivot: sockets must not spin
            add_socket("Wheel_L%s" % n, Matrix.Translation((x, hi.y, lo.z)), carrier)
            add_socket("Wheel_R%s" % n, Matrix.Translation((x, lo.y, lo.z)), carrier)
    couplers = []
    for p in parts.values():
        o = p.obj
        if o.type != "EMPTY":
            continue
        b = base_of(o).lower()
        M = rest[o.name]
        if o.get("tsw_socket"):
            add_socket(clean(str(o["tsw_socket"])), M, p.parent_bone)
        elif b.startswith("socket_"):
            add_socket(clean(base_of(o)[7:]), M, p.parent_bone)
        elif b.startswith("tsc_driver"):
            add_socket("DriverSeat", M, p.parent_bone)
        elif b.startswith("tsc_coupling"):
            side = "F" if M.translation.x >= 0 else "B"
            add_socket("Coupler_" + side, M, p.parent_bone)
            couplers.append({"side": "FRONT" if side == "F" else "BACK",
                             "pivot_point_m": [round(M.translation.x, 3), round(M.translation.z, 3)],
                             "socket": "Coupler_" + side})

    # --- clips -> actions on the armature ----------------------------------------
    clips = {}                                             # clip -> {obj name: (first, last)}
    for p in parts.values():
        if not p.bone:
            continue
        for cname, f0, f1 in p.clips:
            clips.setdefault(cname, {})[p.obj.name] = (f0, f1)
    obj_by_bone = {p.bone: p for p in parts.values() if p.bone}
    arm.animation_data_create()
    actions = {}
    for cname, members in clips.items():
        last = max(f1 for f0, f1 in members.values())
        frames = list(range(0, last + 1))
        objs = [parts[n].obj for n in members]
        parents = [parts[n] for n in members]
        sample_objs = set(objs)
        for p in parents:
            if p.parent_bone in obj_by_bone:
                sample_objs.add(obj_by_bone[p.parent_bone].obj)
        cache = sample_frames(scene, list(sample_objs), frames)
        act = bpy.data.actions.new(cname)
        arm.animation_data.action = act
        for n in members:
            p = parts[n]
            pb = arm.pose.bones[p.bone]
            pb.rotation_mode = "QUATERNION"
            R = bone_rest[p.bone]
            W0 = cache[(n, 0)]
            if p.parent_bone in obj_by_bone:
                po = obj_by_bone[p.parent_bone].obj.name
                Wp0 = cache[(po, 0)]
            else:
                po, Wp0 = None, Matrix.Identity(4)
            for f in frames:
                Wf = cache[(n, f)]
                Wpf = cache[(po, f)] if po else Matrix.Identity(4)
                # bone pose so that bone world = (Wf W0^-1) R, given parent pose (Wpf Wp0^-1) Rp
                P = R.inverted() @ Wp0 @ Wpf.inverted() @ Wf @ W0.inverted() @ R
                loc, rot, sca = P.decompose()
                pb.location, pb.rotation_quaternion, pb.scale = loc, rot, sca
                pb.keyframe_insert("location", frame=f)
                pb.keyframe_insert("rotation_quaternion", frame=f)
                pb.keyframe_insert("scale", frame=f)
        for fc in act.fcurves:
            for k in fc.keyframe_points:
                k.interpolation = "LINEAR"
        actions[cname] = (act, 0, last, sorted(parts[n].bone for n in members))
        report.append("clip %s: %d bone(s), frames 0-%d" % (cname, len(members), last))

    # generated wheel clip
    if WHEEL_CLIP not in actions:
        N = max(2, settings.wheel_frames)
        act = bpy.data.actions.new(WHEEL_CLIP)
        arm.animation_data.action = act
        wheel_bones = [p.bone for p in parts.values() if p.role == "wheel"]
        for bname in wheel_bones:
            pb = arm.pose.bones[bname]
            pb.rotation_mode = "QUATERNION"
            for f in range(0, N + 1):
                ang = 2.0 * math.pi * f / N                  # +Y rotation = forward roll for +X travel
                pb.rotation_quaternion = Matrix.Rotation(ang, 4, "Y").to_quaternion()
                pb.keyframe_insert("rotation_quaternion", frame=f)
        for fc in act.fcurves:
            for k in fc.keyframe_points:
                k.interpolation = "LINEAR"
        actions[WHEEL_CLIP] = (act, 0, N, wheel_bones)
        report.append("clip %s: generated, %d axle(s), %d frames" % (WHEEL_CLIP, len(wheel_bones), N))
    arm.animation_data.action = None
    for pb in arm.pose.bones:
        pb.location = (0, 0, 0); pb.rotation_quaternion = (1, 0, 0, 0); pb.scale = (1, 1, 1)

    # --- numbers for the build sheet -----------------------------------------------
    body_parts = [p for p in parts.values() if p.obj.type == "MESH" and not p.cab]
    lo, hi = mesh_bbox_world(body_parts[0].obj, rest[body_parts[0].obj.name])
    for p in body_parts[1:]:
        l2, h2 = mesh_bbox_world(p.obj, rest[p.obj.name])
        lo = Vector((min(lo.x, l2.x), min(lo.y, l2.y), min(lo.z, l2.z))); hi = Vector((max(hi.x, h2.x), max(hi.y, h2.y), max(hi.z, h2.z)))
    axles = []
    for p in sorted([p for p in parts.values() if p.role == "wheel"], key=lambda p: p.bone):
        l2, h2 = mesh_bbox_world(p.obj, rest[p.obj.name])
        axles.append({"bone": p.bone, "x_m": round(rest[p.obj.name].translation.x, 3),
                      "radius_m": round((h2.z - l2.z) / 2.0, 3), "carrier": p.parent_bone, "tsc_object": p.obj.name})
    buffers = {p.bone: [round(v, 3) for v in rest[p.obj.name].translation] for p in parts.values() if p.role == "buffer"}
    vhids = []
    for p in parts.values():
        if p.obj.get("tsw_vhid"):
            vhids.append({"component": str(p.obj["tsw_vhid"]), "bone": p.bone,
                          "clips": sorted({c for c, _, _ in p.clips}), "tsc_object": p.obj.name})
    sheet = {
        "name": name,
        "units": "metres, Blender axes after rotation: X forward, Y left, Z up. UE: multiply by 100 for cm, negate Y.",
        "physics": {
            "Width_m": round(hi.y - lo.y, 3), "Height_m": round(hi.z - lo.z, 3), "Length_m": round(hi.x - lo.x, 3),
            "PhysicsBodyOffset_xz_m": [round((hi.x + lo.x) / 2, 3), round((hi.z + lo.z) / 2, 3)],
            "CentreOfMassOffset_xz_m": [round((hi.x + lo.x) / 2, 3), round(lo.z + (hi.z - lo.z) * 0.4, 3)],
            "ApproximateBounds_cm": [round((hi.x - lo.x) * 100), round((hi.y - lo.y) * 100), round((hi.z - lo.z) * 100)],
            "Mass_kg": None,
        },
        "axles": axles,
        "bogies": [{"bone": p.bone, "x_m": round(rest[p.obj.name].translation.x, 3)} for p in parts.values() if p.role == "bogie"],
        "buffers_m": buffers,
        "couplers": couplers,
        "sockets": sockets,
        "clips": [{"name": c, "frames": last, "bones": bones} for c, (a, f0, last, bones) in actions.items()],
        "vhids": vhids,
        "bone_map": {p.obj.name: p.bone for p in parts.values() if p.bone},
        "weights": {p.obj.name: p.group for p in parts.values() if p.obj.type == "MESH"},
        "files": {"ext": "SK_%s_Ext.fbx" % name, "cab": ("SK_%s_Cab.fbx" % name) if sk_cab else None,
                  "collision": ucx_name + ".fbx", "clips": ["Animation/%s.fbx" % c for c in actions]},
    }
    return {"name": name, "col": col, "arm": arm, "ext": sk_ext, "cab": sk_cab, "ucx": ucx,
            "sockets": [o for o in col.objects if o.name.startswith("SOCKET_")], "actions": actions, "sheet": sheet}


def remove_rig(rig):
    col = rig["col"]
    for o in list(col.objects):
        data = o.data
        bpy.data.objects.remove(o, do_unlink=True)
        if data is not None and data.users == 0:
            if isinstance(data, bpy.types.Mesh):
                bpy.data.meshes.remove(data)
            elif isinstance(data, bpy.types.Armature):
                bpy.data.armatures.remove(data)
    for act, *_ in rig["actions"].values():
        if act.users == 0:
            bpy.data.actions.remove(act)
    bpy.data.collections.remove(col)


# ---------------------------------------------------------------------------
# export
# ---------------------------------------------------------------------------
FBX_COMMON = dict(apply_unit_scale=True, apply_scale_options="FBX_SCALE_ALL", axis_forward="-Z", axis_up="Y",
                  use_mesh_modifiers=True, mesh_smooth_type="FACE", add_leaf_bones=False,
                  use_armature_deform_only=False, primary_bone_axis="Y", secondary_bone_axis="X",
                  path_mode="COPY", embed_textures=False, use_custom_props=False)


def _select(context, objs):
    for o in context.scene.objects:
        o.select_set(False)
    for o in objs:
        o.select_set(True)
    context.view_layer.objects.active = objs[0]


def export_tsw(context, settings, report):
    scene = context.scene
    rig = build_rig(context, settings, report)
    name = rig["name"]
    out = os.path.join(bpy.path.abspath(settings.out_dir), name)
    os.makedirs(os.path.join(out, "Animation"), exist_ok=True)
    arm = rig["arm"]
    try:
        # skeletal meshes: armature + mesh + sockets, no animation
        for mesh_obj in (rig["ext"], rig["cab"]):
            if mesh_obj is None:
                continue
            objs = [arm, mesh_obj] + rig["sockets"]
            _select(context, objs)
            path = os.path.join(out, mesh_obj.name + ".fbx")
            bpy.ops.export_scene.fbx(filepath=path, use_selection=True, object_types={"ARMATURE", "MESH", "EMPTY"},
                                     bake_anim=False, **FBX_COMMON)
            report.append("wrote %s (%d verts, %d bones, %d sockets)" % (path, len(mesh_obj.data.vertices), len(arm.data.bones), len(rig["sockets"])))
        # clips: armature only, one take each, scene range = clip range
        fs, fe, sname = scene.frame_start, scene.frame_end, scene.name
        for cname, (act, f0, f1, bones) in rig["actions"].items():
            arm.animation_data.action = act
            scene.frame_start, scene.frame_end = f0, f1
            scene.name = cname                                   # the FBX take is named after the scene
            _select(context, [arm])
            path = os.path.join(out, "Animation", cname + ".fbx")
            bpy.ops.export_scene.fbx(filepath=path, use_selection=True, object_types={"ARMATURE"},
                                     bake_anim=True, bake_anim_use_all_bones=True, bake_anim_use_nla_strips=False,
                                     bake_anim_use_all_actions=False, bake_anim_force_startend_keying=True,
                                     bake_anim_step=1.0, bake_anim_simplify_factor=0.0, **FBX_COMMON)
            report.append("wrote %s (take '%s', frames %d-%d)" % (path, cname, f0, f1))
        arm.animation_data.action = None
        scene.frame_start, scene.frame_end, scene.name = fs, fe, sname
        # collision: static mesh
        _select(context, [rig["ucx"]])
        path = os.path.join(out, rig["ucx"].name + ".fbx")
        bpy.ops.export_scene.fbx(filepath=path, use_selection=True, object_types={"MESH"}, bake_anim=False, **FBX_COMMON)
        report.append("wrote %s" % path)
        with open(os.path.join(out, name + ".tsw_build.json"), "w") as f:
            json.dump(rig["sheet"], f, indent=2)
        report.append("wrote %s.tsw_build.json" % name)
    finally:
        remove_rig(rig)
        scene.frame_set(0)
    return out


# ---------------------------------------------------------------------------
# UI
# ---------------------------------------------------------------------------
class TSWSettings(bpy.types.PropertyGroup):
    out_dir: bpy.props.StringProperty(name="Export root", subtype="DIR_PATH", description="Receives <Name>/ with the FBX files")
    model_name: bpy.props.StringProperty(name="Name", default="", description="MyLoco -> SK_MyLoco_Ext etc.")
    cab_collection: bpy.props.StringProperty(name="Cab collection", default="", description="Objects here become SK_<Name>_Cab")
    wheel_frames: bpy.props.IntProperty(name="Wheel clip frames", default=60, min=2)
    bone_length: bpy.props.FloatProperty(name="Bone length (m)", default=0.3, min=0.01)


class TSW_OT_export(bpy.types.Operator):
    bl_idname = "tsw.export_prep"
    bl_label = "Export TSW FBX set + build sheet"

    def execute(self, context):
        s = context.scene.tsw
        if not s.out_dir:
            self.report({"ERROR"}, "Set the export root first")
            return {"CANCELLED"}
        rep = []
        try:
            out = export_tsw(context, s, rep)
        except Exception as e:  # noqa: BLE001
            self.report({"ERROR"}, str(e))
            return {"CANCELLED"}
        txt = bpy.data.texts.get("TSW_Export") or bpy.data.texts.new("TSW_Export")
        txt.clear(); txt.write("\n".join(rep))
        self.report({"INFO"}, "exported to %s (details in text 'TSW_Export')" % out)
        return {"FINISHED"}


class TSW_OT_preview(bpy.types.Operator):
    bl_idname = "tsw.preview_rig"
    bl_label = "Preview rig in scene"
    bl_description = "Build the armature, joined mesh, sockets and clips in a '_tsw_export' collection to inspect; delete the collection when done"

    def execute(self, context):
        rep = []
        try:
            rig = build_rig(context, context.scene.tsw, rep)
        except Exception as e:  # noqa: BLE001
            self.report({"ERROR"}, str(e))
            return {"CANCELLED"}
        txt = bpy.data.texts.get("TSW_Export") or bpy.data.texts.new("TSW_Export")
        txt.clear(); txt.write("\n".join(rep))
        self.report({"INFO"}, "%d bones, %d sockets, %d clips in collection _tsw_export" % (len(rig["arm"].data.bones), len(rig["sockets"]), len(rig["actions"])))
        return {"FINISHED"}


class TSW_PT_panel(bpy.types.Panel):
    bl_label = "TSW branch"
    bl_space_type = "VIEW_3D"
    bl_region_type = "UI"
    bl_category = "TSC"

    def draw(self, context):
        s = context.scene.tsw
        col = self.layout.column(align=True)
        col.prop(s, "out_dir"); col.prop(s, "model_name"); col.prop(s, "cab_collection")
        col.prop(s, "wheel_frames"); col.prop(s, "bone_length")
        col.operator("tsw.preview_rig", icon="ARMATURE_DATA")
        col.operator("tsw.export_prep", icon="EXPORT")


CLASSES = (TSWSettings, TSW_OT_export, TSW_OT_preview, TSW_PT_panel)


def register():
    for c in CLASSES:
        bpy.utils.register_class(c)
    bpy.types.Scene.tsw = bpy.props.PointerProperty(type=TSWSettings)


def unregister():
    del bpy.types.Scene.tsw
    for c in reversed(CLASSES):
        bpy.utils.unregister_class(c)


if __name__ == "__main__":
    register()
