#!/usr/bin/env python3
"""
tsc_crosscheck.py - cross-check a Train Sim Classic vehicle's blueprints against
its exported geometry, and lint the blueprints for common authoring mistakes.

Pure Python 3 standard library. Runs outside Blender (Windows, Linux, macOS).

Inputs
  --engine   Engine or wagon blueprint (.xml, Blueprint Editor 2 source format)
  --sim      Engine simulation blueprint (.xml)                     [optional]
  --bogies   One or more bogie blueprints (.xml)                    [optional]
  --geo      Exterior geometry as XML (an .IGS/.GeoPcDx run through serz.exe)
  --cabgeo   Cab geometry as XML                                    [optional]
  --csv      Traction / curve CSV files referenced by the sim       [optional]

Output
  A plain-text report grouped as ERROR / WARN / INFO / OK.
  Exit code 1 if any ERROR was found, else 0.

Example
  python tsc_crosscheck.py --engine Sample_Engine.xml --sim "Electric Engine Simulation.xml" ^
      --bogies "Sample Bogie 01.xml" "Sample Bogie 02.xml" ^
      --geo sample_engine.geo.xml --cabgeo sample_cab.geo.xml --csv TractiveEffortVsThrottle.csv
"""
import argparse
import csv
import os
import sys
import xml.etree.ElementTree as ET

# --------------------------------------------------------------------------
# Report helpers
# --------------------------------------------------------------------------
LEVELS = ("ERROR", "WARN", "INFO", "OK")
_report = []


def emit(level, topic, msg):
    _report.append((level, topic, msg))


def print_report():
    for level in LEVELS:
        rows = [r for r in _report if r[0] == level]
        if not rows:
            continue
        print("\n==== %s (%d) ====" % (level, len(rows)))
        for _, topic, msg in rows:
            print("  [%s] %s" % (topic, msg))
    n_err = sum(1 for r in _report if r[0] == "ERROR")
    n_warn = sum(1 for r in _report if r[0] == "WARN")
    print("\nSummary: %d error(s), %d warning(s)" % (n_err, n_warn))
    return n_err


# --------------------------------------------------------------------------
# Blueprint (BPE2 source XML) helpers
#   <Attribute name="X"><type><Element>[<ToolData>...]<Value>v</Value>...
# --------------------------------------------------------------------------
def attr(el, name):
    """Return the <Attribute name=...> directly under el/Element/Value."""
    return el.find("./Element/Value/Attribute[@name='%s']" % name)


def attr_value(el, name):
    a = attr(el, name)
    if a is None:
        return None
    for v in a.iter("Value"):
        # skip the ToolData mTypedIn/mUnits values, take the real one
        if v.text is not None and v.text.strip() != "" and not _inside_tooldata(a, v):
            return v.text.strip()
    return None


def attr_units(el, name):
    a = attr(el, name)
    if a is None:
        return None
    u = a.find(".//Attribute[@name='mUnits']")
    if u is None:
        return None
    for v in u.iter("Value"):
        return (v.text or "").strip()
    return None


def _inside_tooldata(root, target):
    for td in root.iter("ToolData"):
        for x in td.iter("Value"):
            if x is target:
                return True
    return False


def fnum(s, default=None):
    try:
        return float(s)
    except (TypeError, ValueError):
        return default


def first_text(el):
    """First non-blank <Value> text under el."""
    for v in el.iter("Value"):
        if v.text and v.text.strip():
            return v.text.strip()
    return None


def basename_any(path):
    return (path or "").replace("\\", "/").split("/")[-1]


def matrix16(attr_el):
    """cHcRMatrix4x4 -> list of 16 floats (row-major, translation in 12..14)."""
    if attr_el is None:
        return None
    vals = [fnum(v.text) for v in attr_el.iter("Value") if v.text and v.text.strip()]
    vals = [v for v in vals if v is not None]
    return vals if len(vals) == 16 else None


# --------------------------------------------------------------------------
# Geometry (serz XML of .IGS / .GeoPcDx, cHcGeometry)
# --------------------------------------------------------------------------
class Geo:
    def __init__(self, path):
        self.path = path
        root = ET.parse(path).getroot()
        self.names = [e.text for e in root.find("TransformName")]
        self.parent = [int(e.text) for e in root.find("TransformDependency")]
        self.local = [list(map(float, e.text.split())) for e in root.find("SourceLToPTransform")]
        self.min = self._vec(root.find("RootMinExtents"))
        self.max = self._vec(root.find("RootMaxExtents"))
        self.materials = []
        mat = root.find("Material")
        if mat is not None:
            for m in mat:
                self.materials.append((m.findtext("Name"), m.findtext("ShaderName")))

    @staticmethod
    def _vec(el):
        if el is None:
            return None
        txt = el.text if (el.text and el.text.strip()) else " ".join(
            e.text for e in el.iter() if e.text and e.text.strip())
        v = [float(x) for x in txt.split()]
        return v[:3]

    def index(self, name):
        try:
            return self.names.index(name)
        except ValueError:
            return -1

    def world_pos(self, name):
        """Accumulate parent translations (rotation ignored except for the
        final offset of the node itself - adequate for position checks)."""
        i = self.index(name)
        if i < 0:
            return None
        pos = [0.0, 0.0, 0.0]
        chain = []
        while i >= 0:
            chain.append(i)
            i = self.parent[i]
        for j in reversed(chain):
            m = self.local[j]
            pos = [pos[0] + m[12], pos[1] + m[13], pos[2] + m[14]]
        return pos  # file axes: X lateral, Y up, Z forward


# --------------------------------------------------------------------------
# Engine / wagon blueprint
# --------------------------------------------------------------------------
class VehicleBP:
    def __init__(self, path):
        self.path = path
        self.root = ET.parse(path).getroot()
        self.kind = self.root.tag  # cEngineBlueprint / cWagonBlueprint / ...
        rv = self.root.find(".//Attribute[@name='RailVehicleComponent']")
        self.rv = rv[0] if rv is not None and len(rv) else None

    def rv_value(self, name):
        return attr_value(self.rv, name) if self.rv is not None else None

    def bogies(self):
        out = []
        for b in self.root.iter("cRailVehicleComponentBlueprint-tag_sBogey"):
            bp = b.find(".//Attribute[@name='BogeyBlueprint']")
            bid = None
            if bp is not None:
                x = bp.find(".//Attribute[@name='BlueprintID']")
                if x is not None:
                    bid = first_text(x)
            out.append((fnum(attr_value(b, "BogeyPivotX")), fnum(attr_value(b, "BogeyPivotY")), bid))
        return out

    def coupling(self, name):
        return matrix16(self.root.find(".//Attribute[@name='%s']" % name))

    def controls(self):
        """Yield dicts describing every control value and its interface elements."""
        for cv in self.root.iter("cControlContainerBlueprint-cControlValue"):
            d = {
                "name": attr_value(cv, "ControlName"),
                "default": fnum(attr_value(cv, "DefaultValue")),
                "min": fnum(attr_value(cv, "MinimumValue")),
                "max": fnum(attr_value(cv, "MaximumValue")),
                "elements": [],
            }
            ie = attr(cv, "InterfaceElements")
            if ie is not None:
                holder = ie.find("./*/Element/Value")
                if holder is not None:
                    for el in holder:
                        d["elements"].append({
                            "type": el.tag.split("-")[-1],
                            "pick": attr_value(el, "PickTransformName"),
                            "anim": attr_value(el, "AnimationName"),
                            "anim_id": attr_value(el, "AnimationID"),
                            "transform": attr_value(el, "TransformName"),
                        })
            yield d

    def anim_set(self):
        out = {}
        for a in self.root.iter("iAnimObjectRenderBlueprint-cAnimation"):
            out[attr_value(a, "AnimationID")] = attr_value(a, "AnimationName")
        return out

    def interior_geometry(self):
        a = self.root.find(".//Attribute[@name='InteriorGeometryID']")
        return first_text(a) if a is not None else None


# --------------------------------------------------------------------------
# Checks
# --------------------------------------------------------------------------
def check_geometry_links(bp, geo, cabgeo):
    # Cab pick nodes / visibility transforms
    for c in bp.controls():
        for e in c["elements"]:
            for field in ("pick", "transform"):
                node = e[field]
                if not node:
                    continue
                if cabgeo is None:
                    emit("INFO", "cab", "control %s uses cab node '%s' (no --cabgeo given, not verified)" % (c["name"], node))
                elif cabgeo.index(node) >= 0:
                    emit("OK", "cab", "control %s -> cab node '%s' found" % (c["name"], node))
                elif geo is not None and geo.index(node) >= 0:
                    emit("OK", "cab", "control %s -> node '%s' found in exterior geometry" % (c["name"], node))
                else:
                    emit("ERROR", "cab", "control %s -> node '%s' (%s) not found in cab geometry; clicking/visibility will not work"
                         % (c["name"], node, e["type"]))
            if e["anim_id"]:
                ids = bp.anim_set()
                if e["anim_id"] in ids:
                    emit("OK", "anim", "control %s drives exterior AnimSet '%s'" % (c["name"], e["anim_id"]))
                else:
                    emit("ERROR", "anim", "control %s references AnimationID '%s' which is not in the RenderComponent AnimSet"
                         % (c["name"], e["anim_id"]))


def check_bogies(bp, geo, bogie_files):
    bogies = bp.bogies()
    if not bogies:
        emit("WARN", "bogie", "no bogies declared in the vehicle blueprint")
        return
    by_name = {basename_any(p).lower(): p for p in bogie_files}
    for i, (px, py, bid) in enumerate(bogies):
        fname = basename_any(bid).lower()
        path = by_name.get(fname)
        if path is None:
            # tolerate upload prefixes / underscores vs spaces
            key = fname.replace(" ", "_")
            path = next((p for n, p in by_name.items() if n.endswith(key) or n.replace(" ", "_").endswith(key)), None)
        if path is None:
            emit("INFO", "bogie", "bogie %d at pivot %.3f uses %s (file not supplied, not checked)" % (i + 1, px, bid))
            continue
        broot = ET.parse(path).getroot()
        gname = attr_value(broot, "Geometry")
        radius = fnum(attr_value(broot, "WheelRadius"))
        powered = attr_value(broot, "Powered")
        emit("INFO", "bogie", "bogie %d: pivot %.3f m, node '%s', wheel radius %.3f m, Powered=%s"
             % (i + 1, px, gname, radius or 0, powered if powered is not None else "(absent - engine default)"))
        if geo is None:
            continue
        if geo.index(gname) < 0:
            emit("ERROR", "bogie", "bogie geometry node '%s' not in exterior geometry" % gname)
            continue
        gpos = geo.world_pos(gname)
        if abs(gpos[2] - px) > 0.02:
            emit("WARN", "bogie", "bogie '%s' modelled at %.3f m but blueprint pivot is %.3f m (difference %.3f m). "
                 "The blueprint wins in game - move the mesh or the pivot so they agree." % (gname, gpos[2], px, px - gpos[2]))
        else:
            emit("OK", "bogie", "bogie '%s' mesh position matches blueprint pivot %.3f m" % (gname, px))
        for ax in broot.iter("cBogeyBlueprint-tag_sAxle"):
            node = attr_value(ax, "NodeId")
            off = fnum(attr_value(ax, "HorizontalOffset"))
            r = fnum(attr_value(ax, "Radius"))
            if geo.index(node) < 0:
                emit("ERROR", "axle", "axle node '%s' not in geometry - wheel will not rotate" % node)
                continue
            wpos = geo.world_pos(node)
            local = wpos[2] - gpos[2]
            if abs(local - off) > 0.02:
                emit("WARN", "axle", "'%s' modelled %.3f m from bogie centre, blueprint says %.3f m" % (node, local, off))
            if r is not None and abs(wpos[1] - r) > 0.01:
                emit("WARN", "axle", "'%s' wheel centre is %.3f m above rail origin but radius is %.3f m (%.3f m %s)"
                     % (node, wpos[1], r, abs(wpos[1] - r), "sunk into rail" if wpos[1] < r else "floating"))


def check_body(bp, geo):
    length = fnum(bp.rv_value("CollisionLength"))
    height = fnum(bp.rv_value("CollisionHeight"))
    width = fnum(bp.rv_value("CollisionWidth"))
    cy = fnum(bp.rv_value("CollisionCentreY"))
    cx = fnum(bp.rv_value("CollisionCentreX"))
    if geo is not None and geo.min and length:
        glen = geo.max[2] - geo.min[2]
        ghei = geo.max[1]
        gwid = geo.max[0] - geo.min[0]
        emit("INFO", "body", "mesh extents: length %.3f, width %.3f, height %.3f m" % (glen, gwid, ghei))
        emit("INFO", "body", "collision box: length %.3f, width %.3f, height %.3f, centre X %.3f / Y %.3f"
             % (length, width or 0, height or 0, cx or 0, cy or 0))
        if abs(glen - length) > 0.5:
            emit("WARN", "body", "collision length %.2f differs from mesh length %.2f by %.2f m" % (length, glen, glen - length))
        if cy is not None and height is not None:
            top = cy + height / 2.0
            if top < ghei - 0.3:
                emit("WARN", "body", "collision box top %.2f m is below mesh top %.2f m (roof/pantograph not covered)" % (top, ghei))
    for side in ("FrontCouplingPivot", "RearCouplingPivot"):
        m = bp.coupling(side)
        if m and geo is not None and geo.min:
            z = m[14]
            end = geo.max[2] if z > 0 else geo.min[2]
            emit("INFO", "coupling", "%s at height %.3f, %.3f m (mesh end %.3f)" % (side, m[13], z, end))
    mps = fnum(bp.rv_value("MaxPermissibleSpeed"))
    if mps is not None and mps <= 0:
        emit("WARN", "body", "MaxPermissibleSpeed is %s - AI and HUD will have no vehicle speed limit" % mps)


def check_controls(bp):
    names = set()
    for c in bp.controls():
        if c["name"] in names:
            emit("ERROR", "control", "duplicate ControlName '%s'" % c["name"])
        names.add(c["name"])
        if c["name"] == "TrainBrakeControl" and (c["default"] or 0) > 0.05:
            emit("WARN", "control", "TrainBrakeControl default %.2f - vehicle spawns with brakes applied" % c["default"])
        if c["min"] is not None and c["max"] is not None and c["default"] is not None:
            if not (c["min"] <= c["default"] <= c["max"]):
                emit("ERROR", "control", "%s default %.3f outside range %.3f..%.3f" % (c["name"], c["default"], c["min"], c["max"]))
    return names


def read_csv_peak(path):
    peak = None
    first = None
    with open(path, newline="") as f:
        for row in csv.reader(f):
            if len(row) < 2:
                continue
            x, y = fnum(row[0]), fnum(row[1])
            if x is None or y is None:
                continue
            if first is None:
                first = (x, y)
            peak = y if peak is None else max(peak, y)
    return first, peak


def check_sim(sim_path, csv_files, control_names):
    root = ET.parse(sim_path).getroot()
    sub = None
    for s in root.iter():
        if s.tag.startswith("EngineSimulation-c") and s.tag.endswith("SubSystemBlueprint"):
            sub = s
            break
    if sub is None:
        emit("ERROR", "sim", "no SubSystem found in %s" % basename_any(sim_path))
        return
    kind = sub.tag.replace("EngineSimulation-", "")
    emit("INFO", "sim", "subsystem %s" % kind)
    maxforce = fnum(attr_value(sub, "MaxForce"))
    maxcont = fnum(attr_value(sub, "MaxContinuousForce"))
    emit("INFO", "sim", "MaxPower %s (%s), MaxForce %s (%s), MaxSpeed %s (%s)" % (
        attr_value(sub, "MaxPower"), attr_units(sub, "MaxPower") or "no unit label",
        attr_value(sub, "MaxForce"), attr_units(sub, "MaxForce") or "no unit label",
        attr_value(sub, "MaxSpeed"), attr_units(sub, "MaxSpeed") or "no unit label"))
    if maxforce is not None and maxcont is not None and maxcont > maxforce:
        emit("WARN", "sim", "MaxContinuousForce %.1f > MaxForce %.1f" % (maxcont, maxforce))

    lba = attr(sub, "LocoBrakeAssembly")
    if lba is not None:
        v = lba.find("./*/Element/Value")
        if v is not None and len(v) == 0:
            emit("INFO", "brake", "LocoBrakeAssembly is empty (Kuju samples ship this way; see guide Part 4)")
    for cc in root.iter("EngineSimulation-cBrakeControlBlueprint"):
        cab = attr_value(cc, "CabControlName")
        if cab and control_names and cab not in control_names:
            emit("ERROR", "brake", "brake CabControlName '%s' has no matching ControlValue in the vehicle blueprint" % cab)
        elif cab:
            emit("OK", "brake", "brake CabControlName '%s' matches a ControlValue" % cab)
    air = root.find(".//EngineSimulation-cBrakeAirSystemBlueprint")
    if air is not None:
        cut = fnum(attr_value(air, "CutOutPressure"))
        mres = fnum(attr_value(air, "MainResMaxAirPressure"))
        if cut == 0:
            emit("WARN", "air", "CutOutPressure is 0 - compressor never cuts out")
        if cut and mres and mres < cut:
            emit("WARN", "air", "MainResMaxAirPressure %.1f below CutOutPressure %.1f" % (mres, cut))
        comp = attr(air, "Compressor")
        if comp is not None:
            v = comp.find("./*/Element/Value")
            if v is not None and len(v) == 0:
                emit("ERROR", "air", "Compressor list is empty - no air will ever be generated")
    for hb in root.iter("EngineSimulation-cHandbrake"):
        emit("INFO", "brake", "Handbrake MaxForce %s (unit label '%s')" % (attr_value(hb, "MaxForce"), attr_units(hb, "MaxForce")))

    # curves
    for cname in ("TractiveEffortVThrottle", "TractiveForceVSpeed", "TractiveEffortVsCutoff", "TractiveEffortLinearVsSpeed"):
        a = attr(sub, cname)
        if a is None:
            continue
        ref = first_text(a)
        match = [p for p in csv_files if basename_any(p).lower().endswith(basename_any(ref).lower())]
        if not match:
            emit("INFO", "curve", "%s -> %s (file not supplied)" % (cname, basename_any(ref)))
            continue
        first, peak = read_csv_peak(match[0])
        emit("INFO", "curve", "%s: first point %s, peak Y %.3f" % (cname, first, peak))
        if cname == "TractiveEffortVThrottle" and first and first[1] != 0:
            emit("WARN", "curve", "throttle curve does not start at 0,0 - phantom traction at zero throttle")
        if cname in ("TractiveEffortVThrottle", "TractiveForceVSpeed") and maxforce and peak and peak > maxforce * 1.001:
            emit("ERROR", "curve", "%s peaks at %.1f but MaxForce caps traction at %.1f - curve above the cap is unreachable"
                 % (cname, peak, maxforce))
        if cname == "TractiveEffortVsCutoff" and peak and peak <= 1.0:
            emit("INFO", "curve", "cutoff curve Y is a 0..1 multiplier (not kN)")


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--engine", required=True)
    ap.add_argument("--sim")
    ap.add_argument("--bogies", nargs="*", default=[])
    ap.add_argument("--geo")
    ap.add_argument("--cabgeo")
    ap.add_argument("--csv", nargs="*", default=[])
    a = ap.parse_args(argv)

    bp = VehicleBP(a.engine)
    emit("INFO", "file", "vehicle blueprint: %s (%s)" % (basename_any(a.engine), bp.kind))
    geo = Geo(a.geo) if a.geo else None
    cab = Geo(a.cabgeo) if a.cabgeo else None
    if geo:
        emit("INFO", "file", "exterior geometry: %d transforms, %d materials" % (len(geo.names), len(geo.materials)))
    if cab:
        emit("INFO", "file", "cab geometry: %d transforms, %d materials" % (len(cab.names), len(cab.materials)))

    names = check_controls(bp)
    check_geometry_links(bp, geo, cab)
    check_bogies(bp, geo, a.bogies)
    check_body(bp, geo)
    if a.sim:
        check_sim(a.sim, a.csv, names)
    return 1 if print_report() else 0


if __name__ == "__main__":
    sys.exit(main())
