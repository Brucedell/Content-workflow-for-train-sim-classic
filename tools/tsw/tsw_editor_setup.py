"""
tsw_editor_setup.py - run INSIDE the Train Sim World PC Editor (Unreal 4.26 Python).

Reads the <Name>.tsw_build.json written by the Blender add-on (tools/blender/
tsw_export_prep.py) and does the repetitive editor work:

  1. creates the plugin folder layout            Data/RVD, Simulation, View/Models/..., Audio/...
  2. imports SK_<Name>_Ext.fbx                   skeletal mesh + skeleton
  3. imports SK_<Name>_Cab.fbx                   onto the same skeleton (if present)
  4. imports every Animation/<Clip>.fbx          as an AnimSequence on that skeleton
  5. imports UCX_<Name>_Collision.fbx            as a static mesh
  6. creates RVD_<Name> (RailVehicleDefinition)  with the fields the sheet knows
  7. creates FRM_<Name> (TrainFormation)         empty; add the RVD entry by hand
  8. prints the numbers you still type by hand   physics box, buffers, couplers, VHIDs

It does NOT create the RVM / RVV / ABP Blueprints or the SimuGraph: Blueprint
component editing is not exposed to Python in 4.26.  Those are Parts 4 and 5 of
the TSW guide, and the printed sheet is what you copy from.

USE:  edit CONFIG below, then in the editor:  Output Log > Cmd: py "C:/path/tsw_editor_setup.py"
      (or Edit > Execute Python Script).  Re-running replaces the imported assets.

STATUS: written against the documented UE 4.26 Python API and the property names
read from the running editor in the TSW locomotive guide; it has NOT been run
inside the editor here.  Every step is wrapped so a failure prints and the
script carries on; read the Output Log.
"""

CONFIG = {
    "sheet": r"C:/exports/DemoLoco/DemoLoco.tsw_build.json",   # written by the Blender add-on
    "plugin_root": "/MyLoco",                                  # content plugin mount point (Edit > Plugins > New > Content Only)
    "max_speed_ms": 20.0,
    "friendly_name": "My Locomotive",
    "import_materials": True,
}

import json
import os

import unreal  # noqa: E402

ASSET_TOOLS = unreal.AssetToolsHelpers.get_asset_tools()
EAL = unreal.EditorAssetLibrary


def log(msg):
    unreal.log("[tsw_setup] %s" % msg)


def warn(msg):
    unreal.log_warning("[tsw_setup] %s" % msg)


def step(label, fn, *a, **kw):
    try:
        r = fn(*a, **kw)
        log("OK   %s" % label)
        return r
    except Exception as e:  # noqa: BLE001
        warn("FAIL %s: %s" % (label, e))
        return None


def ensure_dirs(root):
    for d in ("Data/RVD", "Simulation", "View", "View/Models/Exterior", "View/Models/Exterior/Animation",
              "View/Models/Cab", "View/Models/Collision", "View/Materials", "Audio/RVA", "Audio/Cues"):
        p = "%s/%s" % (root, d)
        if not EAL.does_directory_exist(p):
            EAL.make_directory(p)


def fbx_task(filename, dest, name, ui):
    t = unreal.AssetImportTask()
    t.set_editor_property("filename", filename)
    t.set_editor_property("destination_path", dest)
    t.set_editor_property("destination_name", name)
    t.set_editor_property("replace_existing", True)
    t.set_editor_property("automated", True)
    t.set_editor_property("save", True)
    t.set_editor_property("options", ui)
    return t


def import_skeletal(filename, dest, name, skeleton=None):
    ui = unreal.FbxImportUI()
    ui.set_editor_property("import_mesh", True)
    ui.set_editor_property("import_as_skeletal", True)
    ui.set_editor_property("import_animations", False)
    ui.set_editor_property("import_materials", CONFIG["import_materials"])
    ui.set_editor_property("import_textures", CONFIG["import_materials"])
    ui.set_editor_property("create_physics_asset", True)
    ui.set_editor_property("mesh_type_to_import", unreal.FBXImportType.FBXIT_SKELETAL_MESH)
    if skeleton is not None:
        ui.set_editor_property("skeleton", skeleton)
    smd = ui.get_editor_property("skeletal_mesh_import_data")
    smd.set_editor_property("use_t0_as_ref_pose", True)
    smd.set_editor_property("import_morph_targets", False)
    smd.set_editor_property("convert_scene", True)
    ASSET_TOOLS.import_asset_tasks([fbx_task(filename, dest, name, ui)])
    mesh = EAL.load_asset("%s/%s" % (dest, name))
    if mesh is None:
        raise RuntimeError("skeletal mesh %s not found after import" % name)
    return mesh


def import_anim(filename, dest, name, skeleton):
    ui = unreal.FbxImportUI()
    ui.set_editor_property("import_mesh", False)
    ui.set_editor_property("import_as_skeletal", True)
    ui.set_editor_property("import_animations", True)
    ui.set_editor_property("import_materials", False)
    ui.set_editor_property("import_textures", False)
    ui.set_editor_property("mesh_type_to_import", unreal.FBXImportType.FBXIT_ANIMATION)
    ui.set_editor_property("skeleton", skeleton)
    asd = ui.get_editor_property("anim_sequence_import_data")
    asd.set_editor_property("animation_length", unreal.FBXAnimationLengthImportType.FBXALIT_EXPORTED_TIME)
    asd.set_editor_property("use_default_sample_rate", True)
    asd.set_editor_property("convert_scene", True)
    ASSET_TOOLS.import_asset_tasks([fbx_task(filename, dest, name, ui)])
    return EAL.load_asset("%s/%s" % (dest, name))


def import_static(filename, dest, name):
    ui = unreal.FbxImportUI()
    ui.set_editor_property("import_mesh", True)
    ui.set_editor_property("import_as_skeletal", False)
    ui.set_editor_property("import_animations", False)
    ui.set_editor_property("import_materials", False)
    ui.set_editor_property("import_textures", False)
    ui.set_editor_property("mesh_type_to_import", unreal.FBXImportType.FBXIT_STATIC_MESH)
    smd = ui.get_editor_property("static_mesh_import_data")
    smd.set_editor_property("combine_meshes", True)
    smd.set_editor_property("auto_generate_collision", False)
    smd.set_editor_property("convert_scene", True)
    ASSET_TOOLS.import_asset_tasks([fbx_task(filename, dest, name, ui)])
    return EAL.load_asset("%s/%s" % (dest, name))


def find_class(name):
    cls = getattr(unreal, name, None)
    if cls is None:
        cls = unreal.load_class(None, "/Script/TS2Prototype.%s" % name)
    if cls is None:
        raise RuntimeError("class %s not found; is this the TSW editor project?" % name)
    return cls


def create_data_asset(name, dest, cls):
    path = "%s/%s" % (dest, name)
    if EAL.does_asset_exist(path):
        return EAL.load_asset(path)
    asset = ASSET_TOOLS.create_asset(asset_name=name, package_path=dest, asset_class=cls, factory=unreal.DataAssetFactory())
    if asset is None:
        raise RuntimeError("could not create %s" % path)
    EAL.save_asset(path)
    return asset


def try_set(obj, prop, value):
    try:
        obj.set_editor_property(prop, value)
        log("     %s.%s = %s" % (obj.get_name(), prop, value))
    except Exception as e:  # noqa: BLE001
        warn("     could not set %s.%s (%s); set it in the Details panel" % (obj.get_name(), prop, e))


def main():
    with open(CONFIG["sheet"]) as f:
        sheet = json.load(f)
    name = sheet["name"]
    src = os.path.dirname(CONFIG["sheet"])
    root = CONFIG["plugin_root"].rstrip("/")
    ext_dir, cab_dir, anim_dir, col_dir = ("%s/View/Models/Exterior" % root, "%s/View/Models/Cab" % root,
                                           "%s/View/Models/Exterior/Animation" % root, "%s/View/Models/Collision" % root)
    step("folders", ensure_dirs, root)

    ext = step("import SK_%s_Ext" % name, import_skeletal, os.path.join(src, sheet["files"]["ext"]), ext_dir, "SK_%s_Ext" % name)
    skeleton = ext.get_editor_property("skeleton") if ext else None
    if skeleton is None:
        warn("no skeleton; stopping after folder creation")
        return
    if sheet["files"].get("cab"):
        step("import SK_%s_Cab on the same skeleton" % name, import_skeletal, os.path.join(src, sheet["files"]["cab"]), cab_dir, "SK_%s_Cab" % name, skeleton)
    for rel in sheet["files"]["clips"]:
        clip = os.path.splitext(os.path.basename(rel))[0]
        step("import clip %s" % clip, import_anim, os.path.join(src, rel), anim_dir, clip, skeleton)
    step("import collision", import_static, os.path.join(src, sheet["files"]["collision"]), col_dir, "UCX_%s_Collision" % name)

    # RVD + formation ----------------------------------------------------------
    rvd = step("create RVD_%s" % name, create_data_asset, "RVD_%s" % name, "%s/Data/RVD" % root, find_class("RailVehicleDefinition"))
    if rvd is not None:
        try_set(rvd, "friendly_name", unreal.Text(CONFIG["friendly_name"]))
        try_set(rvd, "maximum_speed", float(CONFIG["max_speed_ms"]))
        try_set(rvd, "is_drivable", True)
        try_set(rvd, "is_selectable", True)
        try_set(rvd, "is_available_for_formation_editor", True)
        b = sheet["physics"]["ApproximateBounds_cm"]
        try_set(rvd, "approximate_bounds", unreal.Vector(b[0], b[1], b[2]))
        try_set(rvd, "approximate_length", float(b[0]))
        for prop, bp in (("model_actor_asset", "%s/Simulation/RVM_%s.RVM_%s_C" % (root, name, name)),
                         ("view_actor_asset", "%s/View/RVV_%s.RVV_%s_C" % (root, name, name))):
            cls = unreal.load_class(None, bp)
            if cls is None:
                warn("     %s not found yet (%s): create the Blueprint, then set %s by hand" % (bp, prop, prop))
            else:
                try_set(rvd, prop, cls)
        EAL.save_asset(rvd.get_path_name())
    step("create FRM_%s (add one Train Entry -> RVD_%s by hand)" % (name, name), create_data_asset, "FRM_%s" % name, "%s/Data/RVD" % root, find_class("TrainFormation"))

    # the numbers you still type ------------------------------------------------
    p = sheet["physics"]
    log("---- type these into RVM_%s > RailVehiclePhysicsComponent (metres / kg) ----" % name)
    log("Node.Width %.2f  Height %.2f  Length %.2f   PhysicsBodyOffset (%.2f, %.2f)   CentreOfMassOffset (%.2f, %.2f)   Mass: %s"
        % (p["Width_m"], p["Height_m"], p["Length_m"], p["PhysicsBodyOffset_xz_m"][0], p["PhysicsBodyOffset_xz_m"][1],
           p["CentreOfMassOffset_xz_m"][0], p["CentreOfMassOffset_xz_m"][1], p["Mass_kg"] or "fill in"))
    for k, v in sheet["buffers_m"].items():
        log("buffer %s offset (x along, y, z up) = (%.2f, %.2f, %.2f)   [UE: negate Y]" % (k, v[0], v[1], v[2]))
    for c in sheet["couplers"]:
        log("Coupler %s: pivot_point (%.2f, %.2f); view mesh attaches at socket %s" % (c["side"], c["pivot_point_m"][0], c["pivot_point_m"][1], c["socket"]))
    log("---- ABP_%s_Ext class defaults ----" % name)
    log("Axles.Entries = %s" % [a["bone"] for a in sheet["axles"]])
    log("Bogies.Entries = %s" % [b["bone"] for b in sheet["bogies"]])
    log("BufferBones = %s" % list(sheet["buffers_m"].keys()))
    log("VirtualHIDSequenceEntries: " + ", ".join("%s -> %s" % (v["component"], "/".join(v["clips"])) for v in sheet["vhids"]))
    log("---- RVV hitboxes: one VirtualHIDInteractionComponent per VHID, attached to the matching socket ----")
    for v in sheet["vhids"]:
        log("  %s  (bone %s)" % (v["component"], v["bone"]))
    log("done; see the TSW guide Parts 4-5 for the Blueprints")


main()
