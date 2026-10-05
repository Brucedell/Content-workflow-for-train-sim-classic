bl_info = {
    "name": "TF3 Export Prep (Transport Fever 3 branch of the TSC workflow)",
    "author": "Content-workflow-for-train-sim-classic",
    "version": (0, 2, 0),
    "blender": (4, 2, 0),
    "location": "3D Viewport > Sidebar (N) > TSC > TF3 branch",
    "description": "Turn a Train Sim Classic-structured vehicle scene into the per-LOD FBX files, "
                   "node names and import template the Transport Fever 3 Model Editor expects",
    "category": "Import-Export",
}

"""
TF3 Export Prep - the branch point between the Train Sim Classic workflow and
Transport Fever 3. It does not touch your TSC-named scene. On export it builds
a temporary copy of the model, renames and re-orients it the way the TF3 Model
Editor wants, writes one FBX per LOD into a folder named by TF3's import rule,
and writes a .import.lua metadata template next to them. Then it deletes the
temporary copy.

What it changes between the two targets (see guide-tf3 Part 2):
  TSC                                   TF3 (Model Editor FBX import)
  object  1_0500_bo01                   node  bogie_front   (mesh bogie_front)
  object  1_0500_bo01wh02               node  w2            (axle)
  object  2_1200_engine (LOD child)     separate file  <name>_lod1.fbx, node body
  front = +Y                            front = +X  (rotate -90 deg about Z)
  LOD in the name                       LOD in the file name
  Blender ".001" suffix exported        "#comment" suffix stripped by the importer
  materials by TSC shader               materials "<name>|<shortcode>"
  animation per .ia + control value     NLA strip named after a TF3 event

Custom properties read (Object / Material):
  tf3_name       node name to use instead of the automatic mapping
  tf3_event      TF3 animation event this object's action represents
                 (e.g. "wheels", "forever", "open_doors_left", "forward_parts_on")
  tf3_skip       truthy -> leave this object out of the TF3 export (TSC-only parts
                 such as cab pick meshes, shadow meshes, number digits)
  tf3_material   material shortcode to append (e.g. "phys_nrml_map_cblend")
Empties recognised:
  tsc_coupling_front / tsc_coupling_rear   -> not exported (TF3 has no couplers)
  tsc_driver                               -> seat locator "<name>|seat_crew_driving_upright"
  objects whose name contains "emitter"    -> kept as TF3 particle emitter locators
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
TSC_ONLY = ("shadow_", "primarydigits", "light_fwd", "light_rev")   # no TF3 equivalent by default
ROT_Y_TO_X = Matrix.Rotation(-math.pi / 2.0, 4, "Z")              # Blender +Y (TSC front) -> +X (TF3 front)

DEFAULT_BOGIE_NAMES = {1: "bogie_front", 2: "bogie_rear"}


# ---------------------------------------------------------------------------
# naming
# ---------------------------------------------------------------------------
def split_name(name):
    base = DUP_RE.sub("", name)
    m = NAME_RE.match(base)
    if not m:
        return None, None, base
    return int(m.group(1)), int(m.group(2)), m.group(3)


def tf3_node_name(obj, axle_counter):
    """Map a TSC object to a TF3 node name. axle_counter is a dict mutated to
    number axles w1, w2, ... front to back."""
    if "tf3_name" in obj.keys():
        return str(obj["tf3_name"])
    lod, dist, base = split_name(obj.name)
    m = WHEEL_RE.search(base)
    if m:
        axle_counter["n"] += 1
        return "w%d" % axle_counter["n"]
    m = BOGIE_RE.search(base)
    if m:
        return DEFAULT_BOGIE_NAMES.get(int(m.group(1)), "bogie_%s" % m.group(1))
    if base in ("engine", "wagon", "coach", "body", "vehicle"):
        return "body"
    return re.sub(r"[|%#]", "_", base.lower())


def is_tsc_only(obj):
    if obj.get("tf3_skip"):
        return True
    base = split_name(obj.name)[2].lower()
    return any(t in base for t in TSC_ONLY) or base.startswith("tsc_coupling")


# ---------------------------------------------------------------------------
# build the temporary TF3 copy of one LOD
# ---------------------------------------------------------------------------
def lod_objects(scene, lod):
    """Objects belonging to a LOD level: LOD-1 objects without prefix count as LOD 1.
    Objects of LOD n replace their LOD-1 ancestors with the same base name."""
    out = []
    for o in scene.objects:
        if o.type not in {"MESH", "EMPTY", "LIGHT"}:
            continue
        if is_tsc_only(o):
            continue
        l, _, _ = split_name(o.name)
        l = l or 1
        if l == lod:
            out.append(o)
    if lod > 1:
        # add LOD-1 objects that have no LOD-n twin (animated parts, empties, lights)
        twins = {split_name(o.name)[2] for o in out}
        for o in scene.objects:
            l, _, base = split_name(o.name)
            if (l or 1) == 1 and base not in twins and o.type in {"MESH", "EMPTY", "LIGHT"} and not is_tsc_only(o):
                if o.type != "MESH":
                    out.append(o)
    return out


def make_tf3_copy(context, scene, lod, add_bbox=True):
    """Duplicate the LOD's objects into a temporary collection, rename and
    re-orient them for TF3. Returns (collection, name_map)."""
    src = lod_objects(scene, lod)
    col = bpy.data.collections.new("_tf3_export_lod%d" % (lod - 1))
    scene.collection.children.link(col)
    copies = {}
    # order parents first so parenting can be re-created
    for o in sorted(src, key=lambda x: len([p for p in _ancestors(x)])):
        c = o.copy()
        if o.data is not None:
            c.data = o.data.copy()
        col.objects.link(c)
        copies[o] = c
    axle_counter = {"n": 0}
    name_map = {}
    # name axles front to back regardless of scene order
    wheels = sorted([o for o in src if WHEEL_RE.search(split_name(o.name)[2])],
                    key=lambda o: -o.matrix_world.translation.y)
    for o in wheels:
        name_map[o.name] = tf3_node_name(o, axle_counter)
    for o in src:
        if o.name not in name_map:
            name_map[o.name] = tf3_node_name(o, axle_counter)
    mat_cache = {}
    for o, c in copies.items():
        nm = name_map[o.name]
        if o.type == "EMPTY" and split_name(o.name)[2] == "tsc_driver":
            nm = "seat_driver|seat_crew_driving_upright"
        _safe_rename(c, nm)                      # "#tf3" suffix if the name is taken; TF3 strips it
        if c.data is not None:
            c.data.name = nm.split("|")[0]       # mesh datablock name -> .msh file name
        # re-parent to the copied parent (or the LOD-1 parent's copy)
        p = o.parent
        while p is not None and p not in copies:
            # LOD-n object parented to its LOD-1 twin: climb to the twin's parent
            p = p.parent
        c.parent = copies.get(p) if p is not None else None
        if c.parent is not None:
            c.matrix_parent_inverse = Matrix.Identity(4)
            c.matrix_local = c.parent.matrix_world.inverted() @ o.matrix_world
        else:
            c.matrix_world = o.matrix_world
        # TF3 materials: "<name>|<shortcode>"
        if c.type == "MESH":
            for slot in c.material_slots:
                if slot.material is not None:
                    m = slot.material
                    if m not in mat_cache:
                        short = m.get("tf3_material")
                        base = DUP_RE.sub("", m.name).split("|")[0].split("#")[0]
                        new = base + ("|" + str(short) if short else "")
                        if m.name == new:
                            mat_cache[m] = m
                        else:
                            mc = m.copy()
                            _safe_rename(mc, new)
                            mat_cache[m] = mc
                    slot.material = mat_cache[m]
    # rotate the whole copy so that TSC +Y (front) becomes TF3 +X
    for c in copies.values():
        if c.parent is None:
            c.matrix_world = ROT_Y_TO_X @ c.matrix_world
    # bounding-box helper
    if add_bbox and lod == 1:
        bb = _world_bbox([c for c in copies.values() if c.type == "MESH"])
        if bb:
            (x0, y0, z0), (x1, y1, z1) = bb
            me = bpy.data.meshes.new("bbox")
            verts = [(x, y, z) for x in (x0, x1) for y in (y0, y1) for z in (z0, z1)]
            faces = [(0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)]
            me.from_pydata(verts, [], faces)
            ob = bpy.data.objects.new("bbox|bounding_box", me)
            col.objects.link(ob)
    return col, name_map


def _safe_rename(idblock, name):
    """Rename; if Blender appends .00N because the name is taken, use TF3's
    '#comment' suffix instead, which the Model Editor strips on import."""
    idblock.name = name
    if idblock.name != name:
        idblock.name = name + "#tf3"
    return idblock.name


def _ancestors(o):
    while o.parent is not None:
        o = o.parent
        yield o


def _world_bbox(objs):
    xs, ys, zs = [], [], []
    for o in objs:
        for c in o.bound_box:
            w = o.matrix_world @ Vector(c)
            xs.append(w.x); ys.append(w.y); zs.append(w.z)
    if not xs:
        return None
    return (min(xs), min(ys), min(zs)), (max(xs), max(ys), max(zs))


def remove_copy(col):
    for o in list(col.objects):
        data = o.data
        bpy.data.objects.remove(o, do_unlink=True)
        if data is not None and data.users == 0:
            if isinstance(data, bpy.types.Mesh):
                bpy.data.meshes.remove(data)
    for m in [m for m in bpy.data.materials if m.users == 0 and ("|" in m.name or m.name.endswith("#tf3"))]:
        bpy.data.materials.remove(m)
    bpy.data.collections.remove(col)


# ---------------------------------------------------------------------------
# NLA strip naming for TF3 events
# ---------------------------------------------------------------------------
def push_actions_to_nla(objs):
    """For every object with an action and a tf3_event tag, make sure the action
    sits in an NLA strip named after the event (TF3 reads strip names)."""
    done = []
    for o in objs:
        ev = o.get("tf3_event")
        ad = o.animation_data
        if not ev or ad is None or ad.action is None:
            continue
        action = ad.action
        # already pushed?
        if any(s.name.split("#")[0] == ev for t in ad.nla_tracks for s in t.strips):
            continue
        track = ad.nla_tracks.new()
        track.name = ev
        strip = track.strips.new(ev, int(action.frame_range[0]), action)
        strip.name = ev                      # several strips per event: TF3 strips "#..." off
        ad.action = None
        done.append((o.name, ev))
    return done


# ---------------------------------------------------------------------------
# metadata template (.import.lua)
# ---------------------------------------------------------------------------
IMPORT_LUA = '''-- {mdl}.import.lua  (generated by TF3 Export Prep; edit before importing)
-- Drag this onto the Model Editor BEFORE the FBX folder: it seeds materials and metadata.
fbxLoader = {{
  predictMaterial = function(params)
    -- default physical material with normal map and colour blend; override per material
    -- by appending |<shortcode> to the material name in Blender instead.
    return nil
  end,
  overrideProperties = function(params)
    return params.properties
  end,
  getMetadataMap = function()
    return {{
      availability = {{ yearFrom = {year_from}, yearTo = {year_to} }},
      description = {{
        name = _("VEHICLE_{MDL}_NAME"),
        description = _("VEHICLE_{MDL}_DESCRIPTION"),
      }},
      cost = {{ price = -1 }},
      emissions = {{ noise = {{ score = -1 }}, pollution = {{ score = -1 }} }},
      landVehicle = {{
        engines = {{ {{ power = {power}, tractiveEffort = {te}, type = "{engine_type}" }} }},
        topSpeed = {top_speed},              -- m/s
        weightEmpty = {weight},              -- kg
        weightMaxPayload = 0,
        friction = 0.02,
        brakeDeceleration = 2.5,
      }},
      railVehicle = {{
        config = {{
          axles = {{ {axles} }},
          fakeBogies = {{ {fake_bogies} }},   -- one list per LOD ({n_lods} LODs)
        }},
      }},
      transportVehicle = {{
        carrier = "RAIL",
        transportModes = {{ {modes} }},
        engineTransportModes = {{ {engine_modes} }},
        compartmentsList = {{ }},            -- fill in capacity / cargo in the Model Editor
        loadSpeed = -1,
        comfortFactor = -1,
        arrivalDelay = 2000,
        departureDelay = 2000,
        reversible = {reversible},
        filterTags = {{ "default" }},
      }},
      seatProvider = {{
        drivingLicense = "RAIL",
        crewModels = {{ }},
        seats = {{ }},                      -- seat locators from the FBX are imported automatically
      }},
      soundConfig = {{ soundSet = {{ name = "::/vehicle/train/shared/sound/{sound}.snd" }} }},
    }}
  end,
}}
'''


def build_import_lua(mdl, name_map, n_lods, settings, manifest=None):
    axles = ", ".join('"%s"' % v for k, v in sorted(name_map.items(), key=lambda kv: _axle_index(kv[1]))
                      if re.match(r"^w\d+$", v))
    fake = ", ".join(["{ }"] * n_lods)
    power = settings.power
    te = settings.tractive_effort
    weight = settings.weight_kg
    top = settings.top_speed_ms
    is_engine = power > 0
    modes = '"TRAIN", "ELECTRIC_TRAIN"' if settings.engine_type == "ELECTRIC" else '"TRAIN"'
    engine_modes = ('"ELECTRIC_TRAIN"' if settings.engine_type == "ELECTRIC" else '"TRAIN"') if is_engine else ""
    sound = {"ELECTRIC": "train_electric", "DIESEL": "train_diesel", "STEAM": "train_steam"}.get(settings.engine_type, "train_electric")
    return IMPORT_LUA.format(mdl=mdl, MDL=mdl.upper(), year_from=settings.year_from, year_to=settings.year_to,
                             power=power, te=te, engine_type=settings.engine_type, top_speed=top, weight=weight,
                             axles=axles, fake_bogies=fake, n_lods=n_lods, modes=modes, engine_modes=engine_modes,
                             reversible="true" if settings.reversible else "false", sound=sound)


def _axle_index(v):
    m = re.match(r"^w(\d+)$", v)
    return int(m.group(1)) if m else 999


# ---------------------------------------------------------------------------
# export
# ---------------------------------------------------------------------------
def export_tf3(context, settings, report):
    scene = context.scene
    lods = sorted({(split_name(o.name)[0] or 1) for o in scene.objects if o.type == "MESH" and not is_tsc_only(o)})
    if not lods:
        raise RuntimeError("no exportable meshes")
    mdl = settings.mdl_name.strip() or bpy.path.display_name_from_filepath(bpy.data.filepath) or "vehicle"
    folder = "%s-%s" % (settings.folder_path.strip("-").replace("/", "-"), mdl) if settings.folder_path.strip() else mdl
    out_dir = os.path.join(bpy.path.abspath(settings.out_dir), folder)
    os.makedirs(out_dir, exist_ok=True)

    pushed = push_actions_to_nla([o for o in scene.objects if "tf3_event" in o.keys()])
    for n, ev in pushed:
        report.append("NLA: %s -> strip '%s'" % (n, ev))

    name_map_all = {}
    scene.frame_set(0)
    for lod in lods:
        col, name_map = make_tf3_copy(context, scene, lod, add_bbox=settings.add_bbox)
        name_map_all.update(name_map)
        for o in scene.objects:
            o.select_set(False)
        for o in col.objects:
            o.select_set(True)
        path = os.path.join(out_dir, "%s_lod%d.fbx" % (mdl, lod - 1))
        bpy.ops.export_scene.fbx(
            filepath=path, use_selection=True, apply_unit_scale=True, apply_scale_options="FBX_SCALE_ALL",
            axis_forward="X", axis_up="Z", object_types={"MESH", "EMPTY", "LIGHT"},
            use_mesh_modifiers=True, mesh_smooth_type="FACE", add_leaf_bones=False,
            bake_anim=lod == 1, bake_anim_use_nla_strips=True, bake_anim_use_all_actions=False,
            bake_anim_force_startend_keying=True, path_mode="COPY", embed_textures=False)
        report.append("wrote %s (%d objects)" % (path, len(col.objects)))
        remove_copy(col)

    with open(os.path.join(out_dir, "%s.import.lua" % mdl), "w") as f:
        f.write(build_import_lua(mdl, name_map_all, len(lods), settings))
    with open(os.path.join(out_dir, "tf3_name_map.json"), "w") as f:
        json.dump(name_map_all, f, indent=2, sort_keys=True)
    report.append("wrote %s.import.lua and tf3_name_map.json" % mdl)
    return out_dir, name_map_all


# ---------------------------------------------------------------------------
# UI
# ---------------------------------------------------------------------------
class TF3Settings(bpy.types.PropertyGroup):
    out_dir: bpy.props.StringProperty(name="Export root", subtype="DIR_PATH",
                                      description="Folder that will receive <folders>-<mdl>/ with the FBX files")
    folder_path: bpy.props.StringProperty(name="TF3 folder path", default="vehicle-train",
                                          description="Hyphen-separated TF3 content path, e.g. vehicle-train")
    mdl_name: bpy.props.StringProperty(name="Model name", default="", description="<mdlname>; empty = .blend name")
    add_bbox: bpy.props.BoolProperty(name="Add |bounding_box helper", default=True)
    engine_type: bpy.props.EnumProperty(name="Engine", items=[("ELECTRIC", "Electric", ""), ("DIESEL", "Diesel", ""),
                                                              ("STEAM", "Steam", ""), ("NONE", "None (wagon)", "")], default="ELECTRIC")
    power: bpy.props.FloatProperty(name="Power kW", default=0.0, min=0.0)
    tractive_effort: bpy.props.FloatProperty(name="Tractive effort kN", default=0.0, min=0.0)
    top_speed_ms: bpy.props.FloatProperty(name="Top speed m/s", default=20.0, min=0.0)
    weight_kg: bpy.props.FloatProperty(name="Empty weight kg", default=60000.0, min=0.0)
    year_from: bpy.props.IntProperty(name="Year from", default=1950)
    year_to: bpy.props.IntProperty(name="Year to (0 = open)", default=0)
    reversible: bpy.props.BoolProperty(name="Reversible", default=False)


class TF3_OT_export(bpy.types.Operator):
    bl_idname = "tf3.export_prep"
    bl_label = "Export TF3 FBX set"
    bl_description = "Write <name>_lod0.fbx … plus .import.lua and a name map; the TSC scene is left unchanged"

    def execute(self, context):
        s = context.scene.tf3
        if not s.out_dir:
            self.report({"ERROR"}, "Set the export root first")
            return {"CANCELLED"}
        report = []
        try:
            out, _ = export_tf3(context, s, report)
        except Exception as e:  # noqa: BLE001
            self.report({"ERROR"}, str(e))
            return {"CANCELLED"}
        txt = bpy.data.texts.get("TF3_Export") or bpy.data.texts.new("TF3_Export")
        txt.clear()
        txt.write("\n".join(report))
        self.report({"INFO"}, "TF3 set written to %s (details in text 'TF3_Export')" % out)
        return {"FINISHED"}


class TF3_OT_preview_names(bpy.types.Operator):
    bl_idname = "tf3.preview_names"
    bl_label = "Preview TF3 names"
    bl_description = "List how each object will be named / skipped for TF3 without exporting"

    def execute(self, context):
        scene = context.scene
        lines = []
        for lod in sorted({(split_name(o.name)[0] or 1) for o in scene.objects if o.type == "MESH"}):
            objs = lod_objects(scene, lod)
            counter = {"n": 0}
            wheels = sorted([o for o in objs if WHEEL_RE.search(split_name(o.name)[2])], key=lambda o: -o.matrix_world.translation.y)
            names = {o.name: tf3_node_name(o, counter) for o in wheels}
            for o in objs:
                names.setdefault(o.name, tf3_node_name(o, counter))
            lines.append("LOD %d -> _lod%d.fbx" % (lod, lod - 1))
            for o in objs:
                shown = names[o.name]
                if o.type == "EMPTY" and split_name(o.name)[2] == "tsc_driver":
                    shown = "seat_driver|seat_crew_driving_upright"
                lines.append("  %-32s -> %s%s" % (o.name, shown, "  [event %s]" % o["tf3_event"] if "tf3_event" in o.keys() else ""))
        skipped = [o.name for o in scene.objects if o.type == "MESH" and is_tsc_only(o)]
        if skipped:
            lines.append("skipped (TSC-only): " + ", ".join(skipped))
        txt = bpy.data.texts.get("TF3_Names") or bpy.data.texts.new("TF3_Names")
        txt.clear()
        txt.write("\n".join(lines))
        self.report({"INFO"}, "See text block 'TF3_Names'")
        return {"FINISHED"}


class TF3_PT_panel(bpy.types.Panel):
    bl_label = "TF3 branch"
    bl_space_type = "VIEW_3D"
    bl_region_type = "UI"
    bl_category = "TSC"

    def draw(self, context):
        s = context.scene.tf3
        col = self.layout.column(align=True)
        col.prop(s, "out_dir"); col.prop(s, "folder_path"); col.prop(s, "mdl_name"); col.prop(s, "add_bbox")
        col.separator()
        col.label(text="Metadata seed")
        col.prop(s, "engine_type"); col.prop(s, "power"); col.prop(s, "tractive_effort")
        col.prop(s, "top_speed_ms"); col.prop(s, "weight_kg")
        row = col.row(align=True); row.prop(s, "year_from"); row.prop(s, "year_to")
        col.prop(s, "reversible")
        col.separator()
        col.operator("tf3.preview_names", icon="VIEWZOOM")
        col.operator("tf3.export_prep", icon="EXPORT")


CLASSES = (TF3Settings, TF3_OT_export, TF3_OT_preview_names, TF3_PT_panel)


def register():
    for c in CLASSES:
        bpy.utils.register_class(c)
    bpy.types.Scene.tf3 = bpy.props.PointerProperty(type=TF3Settings)


def unregister():
    del bpy.types.Scene.tf3
    for c in reversed(CLASSES):
        bpy.utils.unregister_class(c)


if __name__ == "__main__":
    register()
