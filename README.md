# Content workflow for Train Sim Classic

A guide and a set of tools for turning a Blender model into a drivable Train Sim Classic (TSC) locomotive or a hauled wagon, using
Blender + BRIAGE, Blueprint Editor 2 (BPE2), Lua and the game itself. The aim is as little friction as possible between the model and the vehicle.

## The guide (PDF, one file per topic)

| Part | File | Topic |
|---|---|---|
| 0 | [guide/pdf/part-00-start-here.pdf](guide/pdf/part-00-start-here.pdf) | Pipeline map, folder layout, conventions, glossary |
| 1 | [guide/pdf/part-01-what-a-vehicle-is.pdf](guide/pdf/part-01-what-a-vehicle-is.pdf) | What a vehicle is to the game: blueprint graph, components, coordinates, control values, physics chain |
| 2 | [guide/pdf/part-02-blender-modelling.pdf](guide/pdf/part-02-blender-modelling.pdf) | Modelling rules, naming/LODs, bogies, materials, cab, IGS export with BRIAGE |
| 3 | [guide/pdf/part-03-animation-ia.pdf](guide/pdf/part-03-animation-ia.pdf) | Animations and .ia export: pantographs, levers, needles, wipers, trolley pole |
| 4 | [guide/pdf/part-04-blueprint-editor.pdf](guide/pdf/part-04-blueprint-editor.pdf) | Blueprint Editor 2: bogie, simulation, engine/wagon blueprints, controls, units |
| 5 | [guide/pdf/part-05-lua-scripting.pdf](guide/pdf/part-05-lua-scripting.pdf) | Lua: lifecycle, API, patterns, tested trolley-pole example |
| 6 | [guide/pdf/part-06-build-test-ship.pdf](guide/pdf/part-06-build-test-ship.pdf) | Iteration loop, in-game testing, inspecting compiled files, troubleshooting |
| 7 | [guide/pdf/part-07-friction-toolkit.pdf](guide/pdf/part-07-friction-toolkit.pdf) | The tools below, and ideas for more |

Sources are in `guide/src/*.html`. Rebuild the PDFs with Chromium via Playwright:

```
NODE_PATH=<global node_modules> node guide/build.js
```

## Tools

| Path | What it does | Needs |
|---|---|---|
| `tools/blender/tsc_toolkit.py` | Blender add-on (sidebar tab **TSC**): validate the scene against TSC/BRIAGE rules, apply LOD names, measure bogies/wheels/couplers/collision and write bogie blueprints + patch the vehicle blueprint, step through .ia exports, write a Lua skeleton | Blender 4.2+ |
| `tools/tsc_crosscheck.py` | Cross-checks a vehicle blueprint (+ sim, bogies, curves) against the exported geometry (serz XML of the .igs/.GeoPcDx) and lints common mistakes | Python 3 (stdlib only) |
| `tools/lua_mock/run_trolley_test.py` | Runs `examples/lua/TrolleyPole.lua` against a mock of the TSC Lua API and checks 14 behaviours | Python 3 + `pip install lupa` |
| `examples/lua/TrolleyPole.lua` | Dual trolley pole engine script implementing the revised trolley-pole spec | TSC |

Example:

```
python tools/tsc_crosscheck.py --engine Sample_Engine.xml --sim "Electric Engine Simulation.xml" \
    --bogies "Sample Bogie 01.xml" "Sample Bogie 02.xml" \
    --geo sample_engine.geo.xml --cabgeo sample_cab.geo.xml --csv TractiveEffortVsThrottle.csv
```

## Status

- The guide marks statements checked against the supplied sample files as **verified** and statements to confirm in your own tools as **check**.
- The Blender add-on was exercised headless in Blender 4.2 (bpy) on a synthetic locomotive. The cross-checker was run on the Kuju sample
  electric and steam blueprints. The Lua example passes its offline test. None of it has been run inside TSC or with BRIAGE itself here, so
  test in your own setup.
- The supplied BRIAGE manual targets Blender 2.7x; see Part 0 for the Blender/BRIAGE version question.
