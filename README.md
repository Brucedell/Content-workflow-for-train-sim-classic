# Content workflow for Train Sim Classic (and Transport Fever 3, Train Sim World, and the store)

Guides and tools for turning one Blender train model into (a) a drivable Train Sim Classic (TSC) locomotive or hauled wagon, using
Blender + BRIAGE, Blueprint Editor 2 (BPE2), Lua and the game, (b) a Transport Fever 3 (TF3) vehicle mod from the same model, via the
TF3 Model Editor, (c) a Train Sim World (TSW) vehicle through the TSW PC Editor (Unreal 4.26), and (d) a web model for an online store whose
landing page lets visitors click doors, pantographs and wipers on the vehicle. The aim is as little friction as possible between the model
and the vehicle in any of the games or in the browser.

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

## Interactive 3D walkthrough (`walkthrough/`)

A browser app covering all three games, with two modes and two vehicles (a Bo-Bo electric with bogies and a 0-6-0 tank engine with a rigid frame):

- **Explore a finished loco**: click any part (wheelsets, bogies, rods, doors, pantographs, lamps, horn, cab, collision hull…) to see,
  for TSC, TF3 or TSW, its node name, which file holds it, how it renders, what moves it, how it animates, how it sounds, and its path
  through that game's pipeline. "Try it" runs the part (wheels turn, doors open, horn sounds).
- **Build it step by step**: 12–13 steps per game from block-out to in-game asset, with the 3D view switching to show pivots, names,
  LOD twins, UV checker, special objects, animation, bones and sockets (TSW), exploded export and the running result. Each step shows
  the bogie and rigid-frame variants side by side.

- **Bogies on curves**: a plan view and a side view of the vehicle driving from straight track into a curve. Per game it shows which
  number decides where a bogie turns (TSC: `BogeyPivotX` in the blueprint vs the Blender origin; TF3: the bogie node origin; TSW: the
  SimuGraph Bogie offset vs the bogie bone), how the body sits as a chord between the pivots, how far wheels drift when Blender and the
  editor disagree, and the middle-axle offset of a rigid wheelbase. Sliders for radius and both values; readouts in millimetres.
- **Spoken tours**: every mode can be read aloud with the browser's own speech voices, with captions; the build and curves tours move
  the view as they speak. Without voices the tours still run with captions.

Run it locally with `cd walkthrough && python -m http.server 8790`, then open http://localhost:8790/. three.js 0.170 is vendored.

## The Train Sim World branch guide (PDF, separate folder)

From the same master scene to a TSW vehicle: TSW wants one skinned skeletal mesh, clips scrubbed by values, sockets, and a family of
Unreal Blueprints and data assets (RVD / RVM / RVV / RVA + SimuGraph). Based on the supplied live inspection of the TSW PC Editor and a
community livestream of a wagon conversion.

| Part | File | Topic |
|---|---|---|
| 0 | [guide-tsw/pdf/part-00-start-here.pdf](guide-tsw/pdf/part-00-start-here.pdf) | The branch point, three games side by side, the four-asset family, plugin folder, conventions, glossary |
| 1 | [guide-tsw/pdf/part-01-what-a-tsw-vehicle-is.pdf](guide-tsw/pdf/part-01-what-a-tsw-vehicle-is.pdf) | Model/view split, key press to turning wheel, RVD and RVM field by field, TSC knowledge mapped to TSW |
| 2 | [guide-tsw/pdf/part-02-preparing-the-model.pdf](guide-tsw/pdf/part-02-preparing-the-model.pdf) | Objects become bones: skeleton, weights, sockets, collision, cab mesh, materials, units/axes, export settings |
| 3 | [guide-tsw/pdf/part-03-animation.pdf](guide-tsw/pdf/part-03-animation.pdf) | Clips scrubbed by values: wheels, doors, levers, pantographs; the TSC animation map; the Animation Blueprint |
| 4 | [guide-tsw/pdf/part-04-editor-blueprints-and-data.pdf](guide-tsw/pdf/part-04-editor-blueprints-and-data.pdf) | Plugin, import, ABP, RVV, RVM and physics numbers, seat and camera, RVD and formation, Play In Editor |
| 5 | [guide-tsw/pdf/part-05-simulation-and-controls.pdf](guide-tsw/pdf/part-05-simulation-and-controls.pdf) | SimuGraph nodes and the minimal graph, VHID pairs, presets, where the TSC Lua goes |
| 6 | [guide-tsw/pdf/part-06-view-audio-test-ship.pdf](guide-tsw/pdf/part-06-view-audio-test-ship.pdf) | Lights, particles, collision/LOD, the RVA, pre-flight checklist, editor Python, troubleshooting, packaging |
| 7 | [guide-tsw/pdf/part-07-branch-tooling.pdf](guide-tsw/pdf/part-07-branch-tooling.pdf) | TSW Export Prep add-on, the build sheet, the editor-side helper, test results, further scripts |

Rebuild with `NODE_PATH=<global node_modules> node guide-tsw/build.js`.

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
| `tools/blender/tsc_texture_split.py` | Blender add-on (panel **Texture split** in the TSC tab): splits a material whose textures exceed the game's size limit into tile materials by *cropping* (not baking): cuts the mesh along the tile borders in UV space, crops every map of the material into tiles, remaps UVs, copies the material settings; lossless and tested headless (see `tools/tsc/texture_split_test.py`) | Blender 4.2+ (numpy) |
| `tools/tsc_crosscheck.py` | Cross-checks a vehicle blueprint (+ sim, bogies, curves) against the exported geometry (serz XML of the .igs/.GeoPcDx) and lints common mistakes | Python 3 (stdlib only) |
| `tools/lua_mock/run_trolley_test.py` | Runs `examples/lua/TrolleyPole.lua` against a mock of the TSC Lua API and checks 14 behaviours | Python 3 + `pip install lupa` |
| `examples/lua/TrolleyPole.lua` | Dual trolley pole engine script implementing the revised trolley-pole spec | TSC |
| `tools/blender/tf3_export_prep.py` | Blender add-on (panel **TF3 branch** in the TSC tab): from the TSC-named scene, writes one FBX per LOD with TF3 node names, +X forward, NLA event strips, a `|bounding_box` helper, plus a `.import.lua` metadata template and a name map; the scene is left unchanged | Blender 4.2+ |
| `tools/tf3_pack_mga.py` | Packs metal / gloss / AO greyscale maps (or a TSC specular map) into a TF3 `_mga` texture | Python 3 + `pip install pillow` |
| `tools/blender/tsw_export_prep.py` | Blender add-on (panel **TSW branch** in the TSC tab): converts the TSC object hierarchy into one skinned skeletal mesh + armature (one world-aligned bone per moving part, wheels → `axleN`, bogies → `bogieN`, buffers), bakes object keys into pose-bone clips (one FBX per clip, take named after the clip), generates `Wheels_FullRotation`, makes sockets from the TSC empties and wheel meshes, exports a UCX collision mesh and writes a `.tsw_build.json` with the physics/coupler/ABP numbers; the master scene is untouched | Blender 4.2+ |
| `tools/tsw/tsw_editor_setup.py` | Runs inside the TSW PC Editor (Unreal Python): creates the plugin folders, imports the FBX set and clips, creates the RVD and formation data assets, prints the numbers to type by hand. Written against the UE 4.26 API, not yet run in the editor | TSW PC Editor |
| `tools/tsw/build_test.py` | Headless test of the TSW add-on: builds a TSC-named loco, exports, checks the bone maths and re-imports the FBX | Blender 4.2 / bpy wheel |
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
- The texture splitter was tested headless in Blender 4.2 (exact UV mapping, render comparison, no cracks); its output has not been put through
  BRIAGE or BPE2 here.
- The TSW set is based on the supplied live-inspection guide of the PC Editor and a community wagon-conversion stream; statements from the
  inspection are marked **verified**, inferences **check**, and the streamer's steps **community**. The TSW Export Prep add-on was tested headless
  in Blender 4.2 (rig maths, export, FBX re-import); the editor helper has not been run inside the editor and nothing was tested in TSW itself.
- The store set is based on the supplied opportunity analysis plus general web practice; host and provider names, fees and tax figures are
  marked **check**. The Web Export Prep add-on and the demo viewer were tested end to end here: a synthetic locomotive exported headless from
  Blender 4.2, loaded in headless Chromium (WebGL), hotspots clicked and screenshotted with no page errors. Not yet tried on a real
  game-grade model or a live host.
