bl_info = {
    "name": "TSC Toolkit (Train Sim Classic workflow helpers)",
    "author": "Content-workflow-for-train-sim-classic",
    "version": (0, 3, 0),
    "blender": (4, 2, 0),
    "location": "3D Viewport > Sidebar (N) > TSC",
    "description": "Validate TSC naming/scene rules, measure the model and write "
                   "bogie blueprints / blueprint patches, batch IA export, Lua scaffolding",
    "category": "Import-Export",
}

"""
TSC Toolkit - removes the manual, error-prone steps between a Blender model and
a working Train Sim Classic blueprint set. It does NOT replace BRIAGE: BRIAGE
still writes the .igs/.ia files. This add-on sits on either side of it:

  1. Validate   - checks the scene against the rules BRIAGE and TSC enforce
                  (LOD names, scale, bogie naming, rest frame, material slots,
                  texture paths, object limits) before you export.
  2. Name       - applies L_DDDD_ prefixes to selected objects.
  3. Measure    - reads bogie/wheel/coupling/collision data from the model and
                  writes it out as bogie blueprint XML files plus a patch for
                  the engine/wagon blueprint, so the XML (which has the final
                  say in game) always matches the mesh.
  4. IA jobs    - steps through every animation that must become its own .ia
                  (one per cab control / pantograph / wiper), setting the frame
                  range and selection for BRIAGE each time.
  5. Lua        - writes a Lua script skeleton containing every control name
                  tagged in the scene.

Coordinate systems
  Blender:  X = lateral (right), Y = forward, Z = up
  TSC:      X = lateral,         Y = up,      Z = forward
  Blueprint 2D fields (FrontPivotX, BogeyPivotX, CollisionCentreX ...) use
  X = along the track (Blender Y) and Y = height (Blender Z).

Custom properties the toolkit reads (Object > Custom Properties):
  tsc_ia        file name for this object's .ia export, e.g. "sample_throttle"
  tsc_control   ControlName this cab object drives, e.g. "Regulator"
  tsc_min / tsc_max / tsc_default   control range (floats)
Empties the toolkit reads (any LOD prefix is ignored):
  tsc_coupling_front, tsc_coupling_rear, tsc_driver
"""

import json
import math
import os
import re
import xml.etree.ElementTree as ET

import bpy
from mathutils import Matrix, Vector

NAME_RE = re.compile(r"^(\d)_(\d{4})_(.+)$")
BOGIE_RE = re.compile(r"(?:^|_)bo(\d\d)$")
WHEEL_RE = re.compile(r"(?:^|_)bo(\d\d)wh(\d\d)$")
BLENDER_DUP_RE = re.compile(r"\.\d{3}$")
TS_KEYWORDS = ("_locomotive", "_tender", "_coach", "_vehicle", "_wagon", "_carriage", "_coal",
               "_fuel_level_", "_freight", "_bulk", "_lights_fwdhead", "_lights_revhead",
               "_lights_fwdtail", "_lights_revtail")
MAX_OBJECTS = 256
MAX_CHILDREN = 24
MAX_NAME = 31          # Railworks wiki rule quoted by BRIAGE 10.4
SAFE_NAME = 24         # BRIAGE truncates to 24 chars in some code paths (8.1.3, 9.10)

# Blender (x, y, z) -> TSC (x, z, y)
B2T = Matrix(((1, 0, 0, 0), (0, 0, 1, 0), (0, 1, 0, 0), (0, 0, 0, 1)))


# ---------------------------------------------------------------------------
# Small helpers
# ---------------------------------------------------------------------------
def split_name(name):
    """'1_0500_engine.001' -> (1, 500, 'engine')  or (None, None, base)."""
    base = BLENDER_DUP_RE.sub("", name)
    m = NAME_RE.match(base)
    if not m:
        return None, None, base
    return int(m.group(1)), int(m.group(2)), m.group(3)


def base_name(obj):
    return split_name(obj.name)[2]


def exportable(obj):
    return obj.type in {"MESH", "CURVE", "SURFACE", "META", "FONT", "EMPTY", "ARMATURE"}


def is_mesh_like(obj):
    return obj.type in {"MESH", "CURVE", "SURFACE", "META", "FONT"}


def find_by_base(scene, base):
    for o in scene.objects:
        if base_name(o) == base:
            return o
    return None


def ts_matrix_rowmajor(mw):
    """Blender world matrix -> 16 floats in TSC blueprint order
    (row-major, translation in elements 12..14, Y up / Z forward)."""
    m = B2T @ mw @ B2T.inverted()
    loc, rot, _scale = m.decompose()
    m = Matrix.Translation(loc) @ rot.to_matrix().to_4x4()   # drop scale
    t = m.transposed()
    return [round(t[r][c], 6) for r in range(4) for c in range(4)]


def world_bbox(objs):
    xs, ys, zs = [], [], []
    for o in objs:
        for c in o.bound_box:
            w = o.matrix_world @ Vector(c)
            xs.append(w.x)
            ys.append(w.y)
            zs.append(w.z)
    if not xs:
        return None
    return (min(xs), min(ys), min(zs)), (max(xs), max(ys), max(zs))


# ---------------------------------------------------------------------------
# 1. VALIDATION
# ---------------------------------------------------------------------------
def validate_scene(scene, blend_path=""):
    """Return a list of (level, message). level in ERROR/WARN/INFO."""
    out = []

    def add(level, msg):
        out.append((level, msg))

    objs = [o for o in scene.objects if exportable(o)]
    meshes = [o for o in objs if is_mesh_like(o)]

    # --- names -----------------------------------------------------------
    for o in objs:
        if o.name.startswith("#s") or o.name.startswith("tsc_"):
            continue  # snap points / toolkit empties
        lod, dist, base = split_name(o.name)
        if lod is None and is_mesh_like(o):
            add("WARN", "%s: no L_DDDD_ prefix - BRIAGE will rename it 1_1000_%s" % (o.name, o.name))
        if BLENDER_DUP_RE.search(o.name):
            add("WARN", "%s: Blender '.00N' suffix will be exported as part of the name" % o.name)
        if len(o.name) > MAX_NAME:
            add("ERROR", "%s: name is %d chars (max %d)" % (o.name, len(o.name), MAX_NAME))
        elif len(o.name) > SAFE_NAME:
            add("WARN", "%s: name is %d chars; BRIAGE may truncate to %d (LOD clashes)" % (o.name, len(o.name), SAFE_NAME))
        if " " in o.name:
            add("WARN", "%s: spaces in names are risky in blueprints and Lua" % o.name)

    # --- LOD chains --------------------------------------------------------
    for o in meshes:
        lod, dist, base = split_name(o.name)
        if lod is None or lod == 1:
            continue
        p = o.parent
        plod, pdist, pbase = split_name(p.name) if p else (None, None, None)
        if p is None or plod != lod - 1:
            add("ERROR", "%s: LOD %d must be parented to the LOD %d version of '%s'" % (o.name, lod, lod - 1, base))
        else:
            if pbase != base:
                add("ERROR", "%s: LOD child base name '%s' differs from parent '%s'" % (o.name, base, pbase))
            if dist <= pdist:
                add("ERROR", "%s: LOD distance %d must be greater than parent's %d" % (o.name, dist, pdist))

    # --- transforms ----------------------------------------------------------
    for o in objs:
        s = o.scale
        if min(s) < 0:
            add("ERROR", "%s: negative scale %s - apply with Ctrl+A > Scale" % (o.name, tuple(round(v, 3) for v in s)))
        elif any(abs(v - 1.0) > 1e-4 for v in s):
            add("WARN", "%s: unapplied scale %s (IA files carry no scale; apply it)" % (o.name, tuple(round(v, 3) for v in s)))
        kids = [c for c in o.children if exportable(c)]
        if len(kids) > MAX_CHILDREN:
            add("WARN", "%s: %d children; IGS allows %d unless merged by hierarchy processing" % (o.name, len(kids), MAX_CHILDREN))
    if len(meshes) > MAX_OBJECTS:
        add("WARN", "%d exportable objects; TSC limit is %d per IGS (BRIAGE merging can reduce this)" % (len(meshes), MAX_OBJECTS))

    # --- rolling stock layout ----------------------------------------------
    bogies = {}
    for o in meshes:
        lod, dist, base = split_name(o.name)
        m = BOGIE_RE.search(base)
        if m and (lod in (None, 1)):
            bogies[int(m.group(1))] = o
    if bogies:
        if 1 in bogies and bogies[1].matrix_world.translation.y <= 0:
            add("ERROR", "bo01 must be the FRONT bogie (positive Blender Y); it is at Y=%.3f" % bogies[1].matrix_world.translation.y)
        if 2 in bogies and bogies[2].matrix_world.translation.y >= 0:
            add("WARN", "bo02 is expected behind the centre (negative Y); it is at Y=%.3f" % bogies[2].matrix_world.translation.y)
        for n, b in bogies.items():
            wheels = [c for c in b.children if WHEEL_RE.search(base_name(c))]
            if not wheels:
                add("WARN", "%s has no child wheels named bo%02dwhNN" % (b.name, n))
            for w in wheels:
                (_, _, z0), (_, _, z1) = world_bbox([w])
                if abs(z0) > 0.005:
                    add("WARN", "%s: wheel bottom is at Z=%.3f m; it should touch the rail head at Z=0 "
                                "(radius from mesh %.3f m, centre %.3f m)" % (w.name, z0, (z1 - z0) / 2, (z0 + z1) / 2))
    roots = [o for o in meshes if o.parent is None and split_name(o.name)[0] in (None, 1)]
    body = max(roots, key=lambda o: len(o.data.vertices) if o.type == "MESH" else 0, default=None)
    if body is not None:
        t = body.matrix_world.translation
        if abs(t.x) > 1e-3 or abs(t.y) > 1e-3 or abs(t.z) > 1e-3:
            add("WARN", "main body %s origin is at %s; TSC expects it at 0,0,0 with Z=0 on the rail head"
                % (body.name, tuple(round(v, 3) for v in t)))
        add("INFO", "main body guessed as %s (most vertices among root LOD1 objects)" % body.name)

    # --- animation rest pose ----------------------------------------------
    for o in objs:
        ad = o.animation_data
        if ad and ad.action:
            fr = ad.action.frame_range
            if fr[0] > 0.0:
                add("WARN", "%s: action '%s' starts at frame %d; BRIAGE exports the IGS at frame 0 - "
                            "key the rest pose on frame 0" % (o.name, ad.action.name, fr[0]))
            for fc in _fcurves(ad.action):
                if any(k.interpolation != "LINEAR" for k in fc.keyframe_points):
                    add("INFO", "%s: non-linear keys in '%s' (BRIAGE advises LINEAR to avoid stutter)" % (o.name, ad.action.name))
                    break
            if "tsc_ia" not in o.keys() and o.parent is None:
                add("INFO", "%s is animated but has no 'tsc_ia' property (IA batch will skip it)" % o.name)

    # --- materials & textures --------------------------------------------
    blend_drive = os.path.splitdrive(bpy.path.abspath(blend_path or bpy.data.filepath))[0].lower()
    for o in meshes:
        if o.type != "MESH":
            continue
        if not o.data.uv_layers:
            add("ERROR", "%s: no UV map" % o.name)
        used = {p.material_index for p in o.data.polygons}
        for i, slot in enumerate(o.material_slots):
            if slot.material is None:
                add("ERROR", "%s: empty material slot %d" % (o.name, i))
            elif i not in used:
                add("WARN", "%s: material slot %d '%s' is not used by any face (it will still export)"
                    % (o.name, i, slot.material.name))
        if not o.material_slots:
            add("ERROR", "%s: no material" % o.name)
    for img in bpy.data.images:
        if img.source != "FILE" or not img.filepath:
            continue
        fn = os.path.basename(bpy.path.abspath(img.filepath))
        if fn.count(".") > 1:
            add("WARN", "image %s: more than one '.' in filename (BRIAGE appends .safe)" % fn)
        drive = os.path.splitdrive(bpy.path.abspath(img.filepath))[0].lower()
        if blend_drive and drive and drive != blend_drive:
            add("ERROR", "image %s is on drive %s but the .blend is on %s (BRIAGE refuses cross-drive textures)"
                % (fn, drive, blend_drive))
    for m in bpy.data.materials:
        if m.users and m.name.startswith("shadow_") is False and "shadow" in m.name.lower():
            add("INFO", "material %s: StencilShadow materials must start with 'shadow_'" % m.name)

    if not any(l == "ERROR" for l, _ in out):
        add("INFO", "no blocking errors found")
    return out


def _fcurves(action):
    """Blender 4.4+ layered actions keep curves in layers/strips/channelbags."""
    if hasattr(action, "fcurves") and len(action.fcurves):
        return list(action.fcurves)
    curves = []
    for layer in getattr(action, "layers", []):
        for strip in layer.strips:
            for bag in getattr(strip, "channelbags", []):
                curves.extend(bag.fcurves)
    return curves


# ---------------------------------------------------------------------------
# 2. NAMING
# ---------------------------------------------------------------------------
def apply_ts_name(obj, lod, dist):
    _, _, base = split_name(obj.name)
    obj.name = "%d_%04d_%s" % (lod, dist, base)
    return obj.name


# ---------------------------------------------------------------------------
# 3. MEASURE -> manifest, bogie XML, blueprint patch
# ---------------------------------------------------------------------------
def measure(scene):
    """Collect everything the blueprints need from the model (metres, TSC axes)."""
    man = {"bogies": [], "collision": None, "couplings": {}, "driver": None, "animations": [], "controls": []}
    lod1 = [o for o in scene.objects if is_mesh_like(o) and split_name(o.name)[0] in (None, 1)]

    for o in lod1:
        m = BOGIE_RE.search(base_name(o))
        if not m:
            continue
        pos = o.matrix_world.translation
        b = {"index": int(m.group(1)), "node": base_name(o), "pivot_x": round(pos.y, 4),
             "pivot_y": round(pos.z, 4), "axles": []}
        for w in sorted((c for c in o.children if WHEEL_RE.search(base_name(c))), key=base_name):
            wp = w.matrix_world.translation
            (_, _, wz0), (_, _, wz1) = world_bbox([w])
            radius = round((wz1 - wz0) / 2.0, 4)          # vertical extent = diameter
            b["axles"].append({"node": base_name(w), "offset": round(wp.y - pos.y, 4),
                               "radius": radius, "centre_height": round(wp.z, 4)})
        b["wheel_radius"] = b["axles"][0]["radius"] if b["axles"] else None
        man["bogies"].append(b)
    man["bogies"].sort(key=lambda b: b["index"])

    body_parts = [o for o in lod1 if o.type == "MESH" and not any(
        k in base_name(o) for k in ("shadow", "light_", "primarydigits", "panto", "wiper"))]
    bb = world_bbox(body_parts)
    if bb:
        (x0, y0, z0), (x1, y1, z1) = bb
        man["collision"] = {"CollisionCentreX": round((y0 + y1) / 2, 4), "CollisionCentreY": round((z0 + z1) / 2, 4),
                            "CollisionLength": round(y1 - y0, 4), "CollisionWidth": round(x1 - x0, 4),
                            "CollisionHeight": round(z1 - z0, 4)}

    for key, name in (("FrontCouplingPivot", "tsc_coupling_front"), ("RearCouplingPivot", "tsc_coupling_rear")):
        e = find_by_base(scene, name)
        if e is not None:
            man["couplings"][key] = ts_matrix_rowmajor(e.matrix_world)
    e = find_by_base(scene, "tsc_driver")
    if e is not None:
        man["driver"] = ts_matrix_rowmajor(e.matrix_world)

    for o in scene.objects:
        ad = o.animation_data
        if ad and ad.action:
            fr = ad.action.frame_range
            man["animations"].append({"object": o.name, "action": ad.action.name,
                                      "ia": o.get("tsc_ia", ""), "frames": [int(fr[0]), int(fr[1])]})
        if "tsc_control" in o.keys():
            man["controls"].append({"object": base_name(o), "control": o["tsc_control"],
                                    "min": float(o.get("tsc_min", 0.0)), "max": float(o.get("tsc_max", 1.0)),
                                    "default": float(o.get("tsc_default", 0.0)), "ia": o.get("tsc_ia", "")})
    return man


def _plain(parent, name, typ, value):
    a = ET.SubElement(parent, "Attribute", name=name)
    t = ET.SubElement(a, typ)
    e = ET.SubElement(t, "Element")
    ET.SubElement(e, "Value").text = value
    return a


def bogie_blueprint_xml(b, powered=True, stiffness="8E+09", damping="6E+07"):
    """Write a cBogeyBlueprint in Blueprint Editor 2 source format (same shape as Kuju's samples)."""
    root = ET.Element("cBogeyBlueprint")
    v = ET.SubElement(ET.SubElement(root, "Element"), "Value")
    _plain(v, "WheelRadius", "sFloat32", "%g" % (b["wheel_radius"] or 0.5))
    _plain(v, "WheelGauge", "sFloat32", "1.435")
    _plain(v, "Geometry", "cDeltaString", b["node"])
    _plain(v, "Animation", "cDeltaString", None)
    _plain(v, "Powered", "eBoolean", "eTrue" if powered else "eFalse")
    _plain(v, "SuspensionStiffness", "sFloat32", stiffness)
    _plain(v, "SuspensionDamping", "sFloat32", damping)
    axa = ET.SubElement(v, "Attribute", name="Axle")
    holder = ET.SubElement(ET.SubElement(ET.SubElement(axa, "__Indexed__cBogeyBlueprint-tag_sAxle"), "Element"), "Value")
    for ax in b["axles"]:
        av = ET.SubElement(ET.SubElement(ET.SubElement(holder, "cBogeyBlueprint-tag_sAxle"), "Element"), "Value")
        _plain(av, "Radius", "sFloat32", "%g" % ax["radius"])
        _plain(av, "HorizontalOffset", "sFloat32", "%g" % ax["offset"])
        _plain(av, "NodeId", "cDeltaString", ax["node"])
        _plain(av, "AnimationId", "cDeltaString", None)
    pa = ET.SubElement(v, "Attribute", name="PivotOffset")
    ph = ET.SubElement(ET.SubElement(ET.SubElement(pa, "__Indexed__cBogeyBlueprint-tag_sPivotOffset"), "Element"), "Value")
    pv = ET.SubElement(ET.SubElement(ET.SubElement(ph, "cBogeyBlueprint-tag_sPivotOffset"), "Element"), "Value")
    _plain(pv, "HorizontalOffset", "sFloat32", "0")
    _plain(pv, "VerticalOffset", "sFloat32", "0")
    return root


def write_xml(root, path):
    ET.indent(root, space="\t")
    ET.ElementTree(root).write(path, encoding="utf-8", xml_declaration=True)


def _set_value(attr_el, text):
    """Set the real <Value> of a BPE2 attribute (and its ToolData mTypedIn if present)."""
    for td in attr_el.iter("ToolData"):
        for a in td.iter("Attribute"):
            if a.get("name") == "mTypedIn":
                for v in a.iter("Value"):
                    v.text = text
    vals = [v for v in attr_el.iter("Value") if not any(v in list(td.iter("Value")) for td in attr_el.iter("ToolData"))]
    leaf = [v for v in vals if len(v) == 0]
    if leaf:
        leaf[0].text = text
        return True
    return False


def patch_vehicle_blueprint(path, man, backup=True):
    """Update bogie pivots, collision box and coupling/driver matrices in an
    engine or wagon blueprint (BPE2 source XML). Returns list of changes."""
    tree = ET.parse(path)
    root = tree.getroot()
    changes = []
    rvc = root.find(".//Attribute[@name='RailVehicleComponent']")
    comp = rvc[0] if rvc is not None and len(rvc) else root

    def direct(name):
        return comp.find("./Element/Value/Attribute[@name='%s']" % name)

    if man.get("collision"):
        for k, val in man["collision"].items():
            a = direct(k)
            if a is not None and _set_value(a, "%g" % val):
                changes.append("%s = %g" % (k, val))

    bogey_els = list(root.iter("cRailVehicleComponentBlueprint-tag_sBogey"))
    for i, b in enumerate(man.get("bogies", [])):
        if i >= len(bogey_els):
            changes.append("WARNING: model has bogie %s but blueprint has only %d bogey entries" % (b["node"], len(bogey_els)))
            break
        a = bogey_els[i].find("./Element/Value/Attribute[@name='BogeyPivotX']")
        if a is not None and _set_value(a, "%g" % b["pivot_x"]):
            changes.append("Bogey[%d].BogeyPivotX = %g (%s)" % (i, b["pivot_x"], b["node"]))

    mats = dict(man.get("couplings") or {})
    if man.get("driver"):
        mats["DriverPosition"] = man["driver"]
    for key, m16 in mats.items():
        a = direct(key)
        if a is None:
            continue
        leaves = [v for v in a.iter("Value") if len(v) == 0]
        if len(leaves) == 16:
            for v, num in zip(leaves, m16):
                v.text = "%g" % num
            changes.append("%s translation = (%g, %g, %g)" % (key, m16[12], m16[13], m16[14]))

    if changes:
        if backup:
            os.replace(path, path + ".bak")
        tree.write(path, encoding="utf-8", xml_declaration=True)
    return changes


# ---------------------------------------------------------------------------
# 5. LUA scaffold
# ---------------------------------------------------------------------------
LUA_TEMPLATE = '''--------------------------------------------------------------------------------
-- {name} - engine script (generated by TSC Toolkit, edit freely)
--------------------------------------------------------------------------------
-- Control names found in the Blender scene (custom property tsc_control):
{constants}

gInit = false

function Initialise()
    -- Runs once when the scenario loads, before the route is fully ready.
    Call("BeginUpdate")                    -- ask the game to call Update() every frame
end

function OnControlValueChange(name, index, value)
    -- Player (or HUD / keyboard) moved a control. Pass it through by default.
    if Call("*:ControlExists", name, index) == 1 then
        Call("*:SetControlValue", name, index, value)
    end
end

function Update(interval)
    -- interval = seconds since the last frame
    if not gInit then
        gInit = true
        -- one-time setup that needs the vehicle to be fully spawned
    end
    if Call("GetIsPlayer") ~= 1 then return end   -- AI copies usually need less logic
end
'''


def lua_scaffold(scene, name):
    ctrls = sorted({str(o["tsc_control"]) for o in scene.objects if "tsc_control" in o.keys()})
    consts = "\n".join('CTRL_%s = "%s"' % (re.sub(r"\W", "_", c).upper(), c) for c in ctrls) or "-- (none tagged yet)"
    return LUA_TEMPLATE.format(name=name, constants=consts)


# ---------------------------------------------------------------------------
# UI: properties, operators, panel
# ---------------------------------------------------------------------------
class TSCSettings(bpy.types.PropertyGroup):
    out_dir: bpy.props.StringProperty(name="Output folder", subtype="DIR_PATH",
                                      description="Where bogie XML, manifest and Lua are written "
                                                  "(use your Source\\Provider\\Product\\RailVehicles\\... folder)")
    blueprint: bpy.props.StringProperty(name="Vehicle blueprint", subtype="FILE_PATH",
                                        description="Engine or wagon blueprint .xml to patch")
    lod: bpy.props.IntProperty(name="LOD", default=1, min=1, max=9)
    dist: bpy.props.IntProperty(name="Distance", default=1000, min=0, max=9999)
    rear_powered: bpy.props.BoolProperty(name="Rear bogie powered", default=True)
    ia_index: bpy.props.IntProperty(default=0)
    briage_ia_op: bpy.props.StringProperty(
        name="BRIAGE IA operator",
        description="Optional. bpy.ops id of BRIAGE's IA export (hover its button with Python tooltips on). "
                    "Leave empty to use step mode (toolkit prepares, you click BRIAGE's Export)")


def _report_to_text(lines, title):
    txt = bpy.data.texts.get(title) or bpy.data.texts.new(title)
    txt.clear()
    for level, msg in lines:
        txt.write("%-5s %s\n" % (level, msg))
    return txt


class TSC_OT_validate(bpy.types.Operator):
    bl_idname = "tsc.validate"
    bl_label = "Validate scene"
    bl_description = "Check the scene against TSC / BRIAGE rules; results go to the Text Editor block TSC_Validation"

    def execute(self, context):
        res = validate_scene(context.scene)
        _report_to_text(res, "TSC_Validation")
        n_err = sum(1 for l, _ in res if l == "ERROR")
        n_warn = sum(1 for l, _ in res if l == "WARN")
        self.report({"ERROR" if n_err else "INFO"}, "TSC: %d error(s), %d warning(s) - see text 'TSC_Validation'" % (n_err, n_warn))
        return {"FINISHED"}


class TSC_OT_name(bpy.types.Operator):
    bl_idname = "tsc.apply_name"
    bl_label = "Apply LOD name to selected"
    bl_options = {"REGISTER", "UNDO"}

    def execute(self, context):
        s = context.scene.tsc
        for o in context.selected_objects:
            apply_ts_name(o, s.lod, s.dist)
        return {"FINISHED"}


class TSC_OT_measure(bpy.types.Operator):
    bl_idname = "tsc.measure"
    bl_label = "Measure + write bogie XML"
    bl_description = "Write tsc_manifest.json and one bogie blueprint per boNN into the output folder"

    def execute(self, context):
        s = context.scene.tsc
        out = bpy.path.abspath(s.out_dir)
        if not out or not os.path.isdir(out):
            self.report({"ERROR"}, "Set an existing output folder first")
            return {"CANCELLED"}
        man = measure(context.scene)
        with open(os.path.join(out, "tsc_manifest.json"), "w") as f:
            json.dump(man, f, indent=2)
        for b in man["bogies"]:
            powered = True if b["index"] == 1 else s.rear_powered
            write_xml(bogie_blueprint_xml(b, powered=powered), os.path.join(out, "%s.xml" % b["node"]))
        self.report({"INFO"}, "Wrote manifest + %d bogie blueprint(s) to %s" % (len(man["bogies"]), out))
        return {"FINISHED"}


class TSC_OT_patch(bpy.types.Operator):
    bl_idname = "tsc.patch_blueprint"
    bl_label = "Patch vehicle blueprint"
    bl_description = "Write bogie pivots, collision box, coupling and driver matrices into the blueprint (.bak kept)"

    def execute(self, context):
        s = context.scene.tsc
        path = bpy.path.abspath(s.blueprint)
        if not os.path.isfile(path):
            self.report({"ERROR"}, "Choose the engine/wagon blueprint .xml first")
            return {"CANCELLED"}
        changes = patch_vehicle_blueprint(path, measure(context.scene))
        _report_to_text([("INFO", c) for c in changes] or [("INFO", "nothing to change")], "TSC_Patch")
        self.report({"INFO"}, "%d field(s) updated - see text 'TSC_Patch'; close/reopen the file in Blueprint Editor" % len(changes))
        return {"FINISHED"}


def ia_jobs(scene):
    jobs = []
    for o in scene.objects:
        if "tsc_ia" in o.keys() and o.animation_data and o.animation_data.action:
            fr = o.animation_data.action.frame_range
            jobs.append((o, str(o["tsc_ia"]), int(fr[0]), int(fr[1])))
    jobs.sort(key=lambda j: j[1])
    return jobs


def prepare_ia_job(context, job):
    o, name, f0, f1 = job
    scene = context.scene
    for x in scene.objects:
        x.select_set(False)
    o.select_set(True)
    context.view_layer.objects.active = o
    scene.frame_start = min(0, f0)
    scene.frame_end = f1
    scene.frame_set(0)


class TSC_OT_ia_step(bpy.types.Operator):
    bl_idname = "tsc.ia_step"
    bl_label = "Prepare next IA job"
    bl_description = "Select the next tagged animation and set the frame range; then press BRIAGE's IA Export"

    def execute(self, context):
        s = context.scene.tsc
        jobs = ia_jobs(context.scene)
        if not jobs:
            self.report({"WARNING"}, "No objects with a 'tsc_ia' property and an action")
            return {"CANCELLED"}
        job = jobs[s.ia_index % len(jobs)]
        prepare_ia_job(context, job)
        context.window_manager.clipboard = job[1] + ".ia"
        s.ia_index += 1
        if s.briage_ia_op:
            mod, op = s.briage_ia_op.split(".", 1)
            out = os.path.join(bpy.path.abspath(s.out_dir), job[1] + ".ia")
            getattr(getattr(bpy.ops, mod), op)(filepath=out)
            self.report({"INFO"}, "Exported %s (%d/%d)" % (out, (s.ia_index - 1) % len(jobs) + 1, len(jobs)))
        else:
            self.report({"INFO"}, "Ready: %s frames %d-%d (%d/%d). File name copied - click BRIAGE IA Export."
                        % (job[1], job[2], job[3], (s.ia_index - 1) % len(jobs) + 1, len(jobs)))
        return {"FINISHED"}


class TSC_OT_lua(bpy.types.Operator):
    bl_idname = "tsc.lua_scaffold"
    bl_label = "Write Lua skeleton"

    def execute(self, context):
        s = context.scene.tsc
        out = bpy.path.abspath(s.out_dir)
        name = bpy.path.display_name_from_filepath(bpy.data.filepath) or "vehicle"
        path = os.path.join(out, "%s_EngineScript.lua" % name)
        if os.path.exists(path):
            self.report({"ERROR"}, "%s exists - not overwriting" % path)
            return {"CANCELLED"}
        with open(path, "w") as f:
            f.write(lua_scaffold(context.scene, name))
        self.report({"INFO"}, "Wrote %s" % path)
        return {"FINISHED"}


class TSC_PT_panel(bpy.types.Panel):
    bl_label = "TSC Toolkit"
    bl_space_type = "VIEW_3D"
    bl_region_type = "UI"
    bl_category = "TSC"

    def draw(self, context):
        s = context.scene.tsc
        col = self.layout.column(align=True)
        col.label(text="1. Check")
        col.operator("tsc.validate", icon="CHECKMARK")
        col.separator()
        col.label(text="2. Names")
        row = col.row(align=True)
        row.prop(s, "lod")
        row.prop(s, "dist")
        col.operator("tsc.apply_name", icon="SORTALPHA")
        col.separator()
        col.label(text="3. Blueprint sync")
        col.prop(s, "out_dir")
        col.prop(s, "rear_powered")
        col.operator("tsc.measure", icon="DRIVER_DISTANCE")
        col.prop(s, "blueprint")
        col.operator("tsc.patch_blueprint", icon="FILE_REFRESH")
        col.separator()
        col.label(text="4. Animations (.ia)")
        col.prop(s, "briage_ia_op")
        col.operator("tsc.ia_step", icon="ACTION")
        col.separator()
        col.label(text="5. Script")
        col.operator("tsc.lua_scaffold", icon="SCRIPT")


CLASSES = (TSCSettings, TSC_OT_validate, TSC_OT_name, TSC_OT_measure, TSC_OT_patch,
           TSC_OT_ia_step, TSC_OT_lua, TSC_PT_panel)


def register():
    for c in CLASSES:
        bpy.utils.register_class(c)
    bpy.types.Scene.tsc = bpy.props.PointerProperty(type=TSCSettings)


def unregister():
    del bpy.types.Scene.tsc
    for c in reversed(CLASSES):
        bpy.utils.unregister_class(c)


if __name__ == "__main__":
    register()
