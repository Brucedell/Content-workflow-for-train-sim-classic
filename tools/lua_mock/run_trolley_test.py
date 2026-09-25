"""
Offline test of examples/lua/TrolleyPole.lua against a mock of the TSC Lua API.

Requires:  pip install lupa
Run:       python tools/lua_mock/run_trolley_test.py

The mock implements only what the script uses: Call("*:GetControlValue"/
"SetControlValue"/"ControlExists"/"GetSpeed"/"GetCurvature"/"GetIsPlayer"/
"AddTime"/"Reset"/"ActivateNode"/"BeginUpdate") and SysCall alerts.
It is a logic test, not a substitute for testing in the game.
"""
import os
import sys

from lupa import lua51

HERE = os.path.dirname(os.path.abspath(__file__))
SCRIPT = os.path.join(HERE, "..", "..", "examples", "lua", "TrolleyPole.lua")


class Sim:
    def __init__(self):
        self.controls = {"Reverser": 1.0, "PantographControl": 0.0}
        self.speed = 0.0          # m/s
        self.curvature = 0.0      # 1/radius
        self.anim_time = {}
        self.nodes = {}
        self.alerts = []

    def call(self, name, *args):
        fn = name.split(":", 1)[-1]
        if fn == "GetControlValue":
            return self.controls.get(args[0], 0.0)
        if fn == "SetControlValue":
            self.controls[args[0]] = args[2]
            return None
        if fn == "ControlExists":
            return 1 if args[0] in self.controls else 0
        if fn == "GetSpeed":
            return self.speed
        if fn == "GetCurvature":
            return self.curvature
        if fn == "GetIsPlayer":
            return 1
        if fn == "Reset":
            self.anim_time[args[0]] = 0.0
            return None
        if fn == "AddTime":
            self.anim_time[args[0]] = self.anim_time.get(args[0], 0.0) + args[1]
            return 0
        if fn == "ActivateNode":
            self.nodes[args[0]] = args[1]
            return None
        if fn == "BeginUpdate":
            return None
        raise KeyError("unmocked Call: " + name)

    def syscall(self, name, *args):
        if name.endswith("ShowAlertMessageExt"):
            self.alerts.append(args[1])
            return None
        raise KeyError("unmocked SysCall: " + name)


def main():
    sim = Sim()
    lua = lua51.LuaRuntime()
    g = lua.globals()
    g.Call = sim.call
    g.SysCall = sim.syscall
    lua.execute(open(SCRIPT).read())
    lua.execute("math.randomseed(1)")
    g.Initialise()
    dt = 1.0 / 60.0
    fails = []

    def run(seconds):
        for _ in range(int(seconds / dt)):
            g.Update(dt)

    def check(cond, msg):
        print(("PASS " if cond else "FAIL ") + msg)
        if not cond:
            fails.append(msg)

    run(0.5)
    check(sim.nodes.get("pole_front_stowed") == 1, "starts stowed (stowed mesh visible)")

    # unstow front pole (P press)
    sim.controls["PoleFrontStow"] = 1; run(0.1); sim.controls["PoleFrontStow"] = 0; run(0.1)
    check(sim.nodes.get("pole_front_stowed") == 0 and sim.nodes.get("pole_front") == 1, "unstow swaps to the dynamic mesh")

    # hold [ until seated at preset 1 (frame 65)
    sim.controls["PoleFrontKey"] = 1; run(3.0)
    front = sim.controls.get("PoleFrontFrame")
    check(abs(front - 65) < 0.01, "hoisted and seated at preset frame 65 (got %.2f)" % front)
    check(sim.controls.get("PantographControl") == 1, "power interlock on while seated")
    check(abs(sim.anim_time.get("poleFront", 0) - 0.65) < 1e-6, "animation positioned at 0.65 s (frame 65 at 100 fps)")
    sim.controls["PoleFrontKey"] = 0; run(0.5)
    check(sim.controls.get("PoleFrontFrame") == 65, "stays seated after key release")

    # double tap = manual dewire, fall at 50 frames/s -> 1.3 s
    for _ in range(2):
        sim.controls["PoleFrontKey"] = 1; run(0.05); sim.controls["PoleFrontKey"] = 0; run(0.05)
    run(0.6)
    mid = sim.controls.get("PoleFrontFrame")
    check(20 < mid < 45, "falling part-way after 0.7 s (frame %.1f)" % mid)
    run(1.0)
    check(sim.controls.get("PoleFrontFrame") == 0, "back on the roof after the fall")
    check(sim.controls.get("PantographControl") == 0, "power cut when no pole is seated")

    # reminder when rolling with a loose pole
    sim.speed = 2.0; run(0.2)
    check(any("loose" in a for a in sim.alerts), "once-per-session loose-pole reminder shown")
    n_alerts = len([a for a in sim.alerts if "loose" in a]); run(1.0)
    check(len([a for a in sim.alerts if "loose" in a]) == n_alerts, "reminder not repeated")

    # rolling re-wire, then leading-pole detachment above 7.5 mph going forward
    sim.speed = 1.0
    sim.controls["PoleFrontKey"] = 1; run(3.0); sim.controls["PoleFrontKey"] = 0; run(0.2)
    check(sim.controls.get("PoleFrontFrame") == 65, "rolling re-wire works")
    sim.speed = 10 / 2.23694; run(0.5)
    check(sim.controls.get("PoleFrontFrame") < 65, "leading front pole dewires above 7.5 mph when not held")

    # Alt+P cycles presets
    run(2.0)
    sim.controls["PoleHeightMode"] = 1; run(0.05); sim.controls["PoleHeightMode"] = 0; run(0.05)
    check(any("Northeast" in a for a in sim.alerts), "Alt+P cycles to the NEC preset")

    print("\n%d failure(s)" % len(fails))
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
