bl_info = {
    "name": "Web Export Prep (interactive store viewer branch)",
    "author": "Content-workflow-for-train-sim-classic",
    "version": (0, 2, 0),
    "blender": (4, 2, 0),
    "location": "3D Viewport > Sidebar (N) > TSC > Web viewer",
    "description": "Export a web-sized .glb of the vehicle plus a hotspot manifest the store viewer reads",
    "category": "Import-Export",
}

"""
Web Export Prep - third branch of the shared-model workflow. From the
TSC-structured scene it writes:

  <name>.glb            glTF binary, +Y up, LOD-1 meshes only, TSC-only parts
                        dropped, optional decimation to a triangle budget,
                        every tagged action pushed into an NLA strip so it
                        becomes a named glTF animation
  <name>.manifest.json  what the viewer needs: which node is clickable, what
                        it is called on screen, which animation(s) it plays,
                        plus the triangle count and bounding box

Custom properties the add-on reads (Object):
  web_anim     name of the animation this object's action becomes
               (e.g. "open_door_l", "raise_panto_front"); the object becomes a
               clickable hotspot that plays that animation
  web_label    text shown on the hotspot (default: the animation name, prettified)
  web_hotspot  an object with no animation of its own that should still be
               clickable; value = animation name to play (lets a door *frame*
               trigger the door *leaf* animation)
  web_skip     truthy -> leave this object out of the web model
Material:
  web_glass    truthy -> export as transmissive glass (alpha blend)

The scene itself is never modified except for pushing tagged actions into NLA
strips once (the same push TF3 Export Prep makes), which keeps the TSC .ia
exports working.
"""

import json
import os
import re

import bpy
from mathutils import Vector

NAME_RE = re.compile(r"^(\d)_(\d{4})_(.+)$")
DUP_RE = re.compile(r"\.\d{3}$")
WEB_ONLY_SKIP = ("shadow_", "primarydigits", "tsc_coupling", "tsc_driver")


def split_name(name):
    base = DUP_RE.sub("", name)
    m = NAME_RE.match(base)
    if not m:
        return None, None, base
    return int(m.group(1)), int(m.group(2)), m.group(3)


def is_web_skipped(o):
    if o.get("web_skip"):
        return True
    lod, _, base = split_name(o.name)
    if lod not in (None, 1):
        return True                                  # web model = LOD 1 only
    if o.type == "EMPTY":
        return not (o.get("web_hotspot") or o.get("web_anim"))
    return any(t in base.lower() for t in WEB_ONLY_SKIP)


def pretty(name):
    return name.replace("_", " ").strip().capitalize()


def push_actions_to_nla(objs):
    done = []
    for o in objs:
        name = o.get("web_anim")
        ad = o.animation_data
        if not name or ad is None or ad.action is None:
            continue
        if any(s.name.split("#")[0] == name for t in ad.nla_tracks for s in t.strips):
            continue
        track = ad.nla_tracks.new()
        track.name = name
        strip = track.strips.new(name, int(ad.action.frame_range[0]), ad.action)
        strip.name = name
        ad.action = None
        done.append((o.name, name))
    return done


def triangle_count(objs, depsgraph):
    n = 0
    for o in objs:
        if o.type != "MESH":
            continue
        ev = o.evaluated_get(depsgraph)
        me = ev.to_mesh()
        me.calc_loop_triangles()
        n += len(me.loop_triangles)
        ev.to_mesh_clear()
    return n


def world_bbox(objs):
    xs, ys, zs = [], [], []
    for o in objs:
        if o.type != "MESH":
            continue
        for c in o.bound_box:
            w = o.matrix_world @ Vector(c)
            xs.append(w.x); ys.append(w.y); zs.append(w.z)
    if not xs:
        return None
    return [min(xs), min(ys), min(zs)], [max(xs), max(ys), max(zs)]


def build_manifest(scene, objs, name, tris, bbox, texture_mb):
    hotspots = []
    anims = set()
    labels = {}                                        # animation -> explicit label (first one wins)
    for o in objs:
        a = o.get("web_anim") or o.get("web_hotspot")
        if a and o.get("web_label") and str(a) not in labels:
            labels[str(a)] = str(o["web_label"])
    for o in objs:
        node = o.name                                  # glTF node name = Blender object name
        a = o.get("web_anim") or o.get("web_hotspot")
        if not a:
            continue
        a = str(a)
        anims.add(a)
        hotspots.append({"node": node, "label": labels.get(a, pretty(a)), "animations": [a]})
    return {
        "model": name + ".glb",
        "title": str(scene.get("web_title", pretty(name))),
        "blurb": str(scene.get("web_blurb", "")),
        "triangles": tris,
        "bbox": bbox,
        "textureMB": round(texture_mb, 2),
        "forward": "+Y in Blender -> -Z in glTF (viewer rotates so the front faces the camera)",
        "animations": sorted(anims),
        "hotspots": hotspots,
    }


def export_web(context, settings, report):
    scene = context.scene
    objs = [o for o in scene.objects if o.type in {"MESH", "EMPTY"} and not is_web_skipped(o)]
    if not objs:
        raise RuntimeError("nothing to export")
    name = settings.model_name.strip() or bpy.path.display_name_from_filepath(bpy.data.filepath) or "vehicle"
    out_dir = bpy.path.abspath(settings.out_dir)
    os.makedirs(out_dir, exist_ok=True)

    pushed = push_actions_to_nla(objs)
    for n, a in pushed:
        report.append("NLA: %s -> strip '%s'" % (n, a))

    depsgraph = context.evaluated_depsgraph_get()
    tris = triangle_count(objs, depsgraph)
    report.append("triangles (LOD 1, modifiers applied): %d (budget %d)" % (tris, settings.tri_budget))

    # optional decimation on a temporary modifier
    added_mods = []
    if settings.tri_budget and tris > settings.tri_budget:
        ratio = settings.tri_budget / float(tris)
        for o in objs:
            if o.type == "MESH" and not o.get("web_anim") and not o.get("web_hotspot"):
                m = o.modifiers.new("_web_decimate", "DECIMATE")
                m.ratio = ratio
                added_mods.append((o, m))
        depsgraph = context.evaluated_depsgraph_get()
        tris2 = triangle_count(objs, depsgraph)
        report.append("decimated static parts by %.2f -> %d triangles" % (ratio, tris2))
        tris = tris2

    tex_bytes = 0
    for img in bpy.data.images:
        if img.source == "FILE" and img.filepath:
            p = bpy.path.abspath(img.filepath)
            if os.path.exists(p):
                tex_bytes += os.path.getsize(p)
        if img.size[0] > settings.max_texture or img.size[1] > settings.max_texture:
            report.append("WARN texture %s is %dx%d (> %d); scale it down for the web" % (img.name, img.size[0], img.size[1], settings.max_texture))

    # glass materials
    for m in bpy.data.materials:
        if m.get("web_glass"):
            m.blend_method = "BLEND"

    scene.frame_set(0)
    for o in scene.objects:
        o.select_set(False)
    for o in objs:
        o.select_set(True)
    path = os.path.join(out_dir, name + ".glb")
    bpy.ops.export_scene.gltf(
        filepath=path, export_format="GLB", use_selection=True, export_yup=True,
        export_apply=True, export_animations=True, export_nla_strips=True,
        export_frame_range=False, export_force_sampling=True,
        export_image_format="AUTO", export_texcoords=True, export_normals=True,
        export_materials="EXPORT", export_draco_mesh_compression_enable=False)
    report.append("wrote %s (%.2f MB)" % (path, os.path.getsize(path) / 1e6))

    for o, m in added_mods:
        o.modifiers.remove(m)

    bbox = world_bbox(objs)
    man = build_manifest(scene, objs, name, tris, bbox, tex_bytes / 1e6)
    with open(os.path.join(out_dir, name + ".manifest.json"), "w") as f:
        json.dump(man, f, indent=2)
    report.append("wrote %s.manifest.json: %d hotspot(s), %d animation(s)" % (name, len(man["hotspots"]), len(man["animations"])))
    return path, man


class WebSettings(bpy.types.PropertyGroup):
    out_dir: bpy.props.StringProperty(name="Output folder", subtype="DIR_PATH",
                                      description="Your site's models/ folder")
    model_name: bpy.props.StringProperty(name="Model name", default="")
    tri_budget: bpy.props.IntProperty(name="Triangle budget", default=60000, min=0,
                                      description="Static parts are decimated to stay under this; 0 = never")
    max_texture: bpy.props.IntProperty(name="Max texture px", default=2048, min=256)


class WEB_OT_export(bpy.types.Operator):
    bl_idname = "web.export_prep"
    bl_label = "Export web GLB + manifest"

    def execute(self, context):
        s = context.scene.web
        if not s.out_dir:
            self.report({"ERROR"}, "Set the output folder first")
            return {"CANCELLED"}
        rep = []
        try:
            path, man = export_web(context, s, rep)
        except Exception as e:  # noqa: BLE001
            self.report({"ERROR"}, str(e))
            return {"CANCELLED"}
        txt = bpy.data.texts.get("Web_Export") or bpy.data.texts.new("Web_Export")
        txt.clear(); txt.write("\n".join(rep))
        self.report({"INFO"}, "%s: %d triangles, %d hotspots (details in text 'Web_Export')" % (os.path.basename(path), man["triangles"], len(man["hotspots"])))
        return {"FINISHED"}


class WEB_PT_panel(bpy.types.Panel):
    bl_label = "Web viewer"
    bl_space_type = "VIEW_3D"
    bl_region_type = "UI"
    bl_category = "TSC"

    def draw(self, context):
        s = context.scene.web
        col = self.layout.column(align=True)
        col.prop(s, "out_dir"); col.prop(s, "model_name"); col.prop(s, "tri_budget"); col.prop(s, "max_texture")
        col.operator("web.export_prep", icon="WORLD")


CLASSES = (WebSettings, WEB_OT_export, WEB_PT_panel)


def register():
    for c in CLASSES:
        bpy.utils.register_class(c)
    bpy.types.Scene.web = bpy.props.PointerProperty(type=WebSettings)


def unregister():
    del bpy.types.Scene.web
    for c in reversed(CLASSES):
        bpy.utils.unregister_class(c)


if __name__ == "__main__":
    register()
