# Content workflow for Train Sim Classic (and Transport Fever 3, and the store)

Guides and tools for turning one Blender train model into (a) a drivable Train Sim Classic (TSC) locomotive or hauled wagon, using
Blender + BRIAGE, Blueprint Editor 2 (BPE2), Lua and the game, (b) a Transport Fever 3 (TF3) vehicle mod from the same model, via the
TF3 Model Editor, and (c) a web model for an online store whose landing page lets visitors click doors, pantographs and wipers on the
vehicle. The aim is as little friction as possible between the model and the vehicle in either game or in the browser.

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

## The Transport Fever 3 branch guide (PDF, separate folder)

The TF3 set only covers what TF3 adds or changes; shared modelling rules live in the TSC set.

| Part | File | Topic |
|---|---|---|
| 0 | [guide-tf3/pdf/part-00-start-here.pdf](guide-tf3/pdf/part-00-start-here.pdf) | The branch point, TSC vs TF3 side by side, mod folder, glossary |
| 1 | [guide-tf3/pdf/part-01-what-a-tf3-vehicle-is.pdf](guide-tf3/pdf/part-01-what-a-tf3-vehicle-is.pdf) | The .mdl, metadata structs, node names, events, the four-number simulation |
| 2 | [guide-tf3/pdf/part-02-preparing-the-model.pdf](guide-tf3/pdf/part-02-preparing-the-model.pdf) | Axes, TSC→TF3 name map, LOD files, bogies/axles, materials, PBR textures, locators |
| 3 | [guide-tf3/pdf/part-03-animations.pdf](guide-tf3/pdf/part-03-animations.pdf) | Event vocabulary, NLA strips, wheels/doors/lights, pantographs |
| 4 | [guide-tf3/pdf/part-04-model-editor-metadata.pdf](guide-tf3/pdf/part-04-model-editor-metadata.pdf) | Model Editor import, metadata field by field, fake bogies, validation, icons, MUs, groups, repaints |
| 5 | [guide-tf3/pdf/part-05-scripting.pdf](guide-tf3/pdf/part-05-scripting.pdf) | Transformators; what carries over from TSC Lua and what cannot |
| 6 | [guide-tf3/pdf/part-06-build-test-publish.pdf](guide-tf3/pdf/part-06-build-test-publish.pdf) | Iteration loop, mod skeleton, testing, mod.io, troubleshooting |
| 7 | [guide-tf3/pdf/part-07-branch-tooling.pdf](guide-tf3/pdf/part-07-branch-tooling.pdf) | TF3 Export Prep add-on, texture packer, further script ideas |

Rebuild with `NODE_PATH=<global node_modules> node guide-tf3/build.js`.

## The online store guide (PDF, separate folder)

How to sell the content: what a store is, the site's pages and copy, the web export of the same model, the interactive click-to-animate
viewer, hosting, selling and managing, written for a Blender generalist with no web background.

| Part | File | Topic |
|---|---|---|
| 0 | [guide-store/pdf/part-00-start-here.pdf](guide-store/pdf/part-00-start-here.pdf) | A website explained in Blender terms, the whole store on one diagram, build/rent/skip, glossary |
| 1 | [guide-store/pdf/part-01-what-a-store-is.pdf](guide-store/pdf/part-01-what-a-store-is.pdf) | Catalogue, cart, payment, delivery, accounts, updates; hosted-store vs platform vs self-built; recommended split |
| 2 | [guide-store/pdf/part-02-site-map-and-content.pdf](guide-store/pdf/part-02-site-map-and-content.pdf) | Site map, landing page blocks, product-page anatomy, copy formula, safe product names, demos and pre-orders |
| 3 | [guide-store/pdf/part-03-blender-to-browser.pdf](guide-store/pdf/part-03-blender-to-browser.pdf) | The web .glb: budgets, poly diet, baking, glTF textures, hotspot tags, NLA clips, export settings |
| 4 | [guide-store/pdf/part-04-interactive-viewer.pdf](guide-store/pdf/part-04-interactive-viewer.pdf) | The demo viewer explained as a Blender viewport: load, frame, raycast click, play forward/backward, labels, random pool; screenshots |
| 5 | [guide-store/pdf/part-05-putting-it-on-the-web.pdf](guide-store/pdf/part-05-putting-it-on-the-web.pdf) | Local server, static hosts, domain and sub-names, upload, embedding next to the Buy button, phones, speed |
| 6 | [guide-store/pdf/part-06-selling-and-managing.pdf](guide-store/pdf/part-06-selling-and-managing.pdf) | Provider set-up, packaging and versioning, updates, support, greenlight pre-orders and memberships, legal names, fees and taxes, routine |
| 7 | [guide-store/pdf/part-07-branch-tooling.pdf](guide-store/pdf/part-07-branch-tooling.pdf) | Web Export Prep add-on, the demo site file by file, how it was tested, extensions, further scripts |

Rebuild with `NODE_PATH=<global node_modules> node guide-store/build.js`.

### The demo store site (`store-demo/`)

A working landing page with the interactive viewer: three.js 0.170 (vendored, MIT), `js/viewer.js`, the demo `.glb` + manifest in
`models/`. Run it locally:

```
cd store-demo
python -m http.server 8765      # then open http://localhost:8765/
```

Drag to orbit, click a door or pantograph (or press its button) to animate it; click again to reverse. `test/build_demo.py` rebuilds the
demo model with the add-on headless; `test/drive.js` (Playwright) loads the page, clicks hotspots and takes the screenshots used in Part 4.

## Tools

| Path | What it does | Needs |
|---|---|---|
| `tools/blender/tsc_toolkit.py` | Blender add-on (sidebar tab **TSC**): validate the scene against TSC/BRIAGE rules, apply LOD names, measure bogies/wheels/couplers/collision and write bogie blueprints + patch the vehicle blueprint, step through .ia exports, write a Lua skeleton | Blender 4.2+ |
| `tools/tsc_crosscheck.py` | Cross-checks a vehicle blueprint (+ sim, bogies, curves) against the exported geometry (serz XML of the .igs/.GeoPcDx) and lints common mistakes | Python 3 (stdlib only) |
| `tools/lua_mock/run_trolley_test.py` | Runs `examples/lua/TrolleyPole.lua` against a mock of the TSC Lua API and checks 14 behaviours | Python 3 + `pip install lupa` |
| `examples/lua/TrolleyPole.lua` | Dual trolley pole engine script implementing the revised trolley-pole spec | TSC |
| `tools/blender/tf3_export_prep.py` | Blender add-on (panel **TF3 branch** in the TSC tab): from the TSC-named scene, writes one FBX per LOD with TF3 node names, +X forward, NLA event strips, a `|bounding_box` helper, plus a `.import.lua` metadata template and a name map; the scene is left unchanged | Blender 4.2+ |
| `tools/tf3_pack_mga.py` | Packs metal / gloss / AO greyscale maps (or a TSC specular map) into a TF3 `_mga` texture | Python 3 + `pip install pillow` |
| `tools/blender/web_export_prep.py` | Blender add-on (panel **Web viewer** in the TSC tab): from the TSC-named scene, writes a web-sized `.glb` (LOD 1 only, TSC-only parts dropped, optional decimation to a triangle budget, tagged actions as named clips) plus a `.manifest.json` of clickable hotspots for the store viewer | Blender 4.2+ |

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
- The TF3 set is based on the wiki pages supplied (Model Editor, Vehicle Basics/Types/Advanced, Repaints, API index). The Mod Definition,
  .mdl/.msh/.mtl, Guidelines, Publish and External Tools pages were not supplied; statements that depend on them are marked **check**.
  The TF3 Export Prep add-on was tested headless in Blender 4.2 (export + FBX re-import), not through the real Model Editor.
- The store set is based on the supplied opportunity analysis plus general web practice; host and provider names, fees and tax figures are
  marked **check**. The Web Export Prep add-on and the demo viewer were tested end to end here: a synthetic locomotive exported headless from
  Blender 4.2, loaded in headless Chromium (WebGL), hotspots clicked and screenshotted with no page errors. Not yet tried on a real
  game-grade model or a live host.
