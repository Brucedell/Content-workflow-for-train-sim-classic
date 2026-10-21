// Content for the walkthrough. Text markup: `code`, **bold**, {check} = not verified, {v} = verified.
// Every statement comes from the TSC, TF3 and TSW guides in this repository (guide/, guide-tf3/, guide-tsw/).

export const GAMES = {
  tsc: {
    name: 'Train Sim Classic', short: 'TSC', accent: 'tsc',
    blurb: 'Blender + BRIAGE → .igs/.ia → Blueprint Editor 2 → Lua → game. The blueprint XML has the final say on where bogies pivot.',
    stages: [
      { name: 'Model', tool: 'Blender', out: '.blend master' },
      { name: 'Name + LOD', tool: 'Blender', out: 'L_DDDD_name' },
      { name: 'Materials', tool: 'Blender + Substance', out: 'TSC shaders, .tga/.ace' },
      { name: 'Animate', tool: 'Blender', out: 'actions, frame 0 parked' },
      { name: 'Export', tool: 'BRIAGE', out: '.igs + .ia' },
      { name: 'Blueprints', tool: 'Blueprint Editor 2', out: 'engine, sim, bogie .xml' },
      { name: 'Script', tool: 'Lua', out: 'Engine Script.lua' },
      { name: 'Compile', tool: 'BPE2 export', out: '.bin .GeoPcDx .TgPcDx' },
      { name: 'In game', tool: 'TSC + LogMate', out: 'drivable vehicle' },
    ],
  },
  tf3: {
    name: 'Transport Fever 3', short: 'TF3', accent: 'tf3',
    blurb: 'Same master → TF3 Export Prep (rename, +X forward, NLA events) → FBX per LOD → Model Editor → metadata → mod folder. No cab, no script per vehicle.',
    stages: [
      { name: 'Model', tool: 'Blender', out: 'same master' },
      { name: 'Names + axes', tool: 'TF3 Export Prep', out: 'body, w1, +X forward' },
      { name: 'PBR textures', tool: 'Substance / packer', out: '_alb _nrm _mga' },
      { name: 'Event strips', tool: 'Blender NLA', out: 'open_doors_left…' },
      { name: 'FBX per LOD', tool: 'TF3 Export Prep', out: 'name_lod0.fbx, _lod1' },
      { name: 'Model Editor', tool: 'TF3 Model Editor', out: '.mdl .msh .mtl .ani' },
      { name: 'Metadata', tool: 'Model Editor', out: 'railVehicle, seats, sound' },
      { name: 'Mod folder', tool: 'file system', out: 'mod.lua + res/' },
      { name: 'In game', tool: 'TF3', out: 'buyable vehicle' },
    ],
  },
  tsw: {
    name: 'Train Sim World', short: 'TSW', accent: 'tsw',
    blurb: 'Same master → TSW Export Prep (objects become bones, clips scrubbed by values) → FBX set → PC Editor: ABP, RVV, RVM, SimuGraph, VHIDs, RVD → Play In Editor → package.',
    stages: [
      { name: 'Model', tool: 'Blender', out: 'same master' },
      { name: 'Rig', tool: 'TSW Export Prep', out: 'Root › Body_Pivot › bones' },
      { name: 'Textures', tool: 'Substance', out: 'base, normal, ORM' },
      { name: 'Clips', tool: 'TSW Export Prep', out: 'one clip per control' },
      { name: 'FBX set', tool: 'TSW Export Prep', out: 'SK, clips, UCX, build sheet' },
      { name: 'Import + ABP', tool: 'PC Editor', out: 'SkeletalMesh, ABP' },
      { name: 'RVV/RVM/Sim', tool: 'PC Editor', out: 'Blueprints, SimuGraph, VHIDs' },
      { name: 'RVD + RVA', tool: 'PC Editor', out: 'definition, formation, audio' },
      { name: 'Play + ship', tool: 'PIE, cook, package', out: 'DLC package' },
    ],
  },
};

export const CATS = { running: 'Running gear', body: 'Body', moving: 'Moving parts', lights: 'Lights', sound: 'Sound and effects', cab: 'Cab', data: 'Hidden data' };

// what "Try it" does for each kind
export const TRY = {
  wheelset: ['run', 'Run the loco'], drivewheel: ['run', 'Run the loco'], rods: ['run', 'Run the loco'], bogie: ['curve', 'Run on a curve'],
  frame: ['curve', 'Run on a curve'], traction: ['run', 'Run the loco'], cylinders: ['run', 'Run the loco'], smoke: ['run', 'Run the loco'],
  door: ['doors', 'Open or close doors'], panto: ['panto', 'Raise or lower'], wiper: ['wipers', 'Start or stop wipers'],
  headlight: ['lights', 'Lights on or off'], horn: ['horn', 'Sound it'], cab: ['lever', 'Move the lever'],
  collision: ['show', 'Show hull'], shadow: ['show', 'Show shadow mesh'], driver: ['xray', 'See inside'],
};

export const KINDS = {
  // ------------------------------------------------------------------ body
  body: {
    summary: 'The static shell. Everything that does not move is welded into as few nodes as possible.',
    tsc: {
      node: '`1_0500_engine` with a simplified LOD twin `2_1200_engine`',
      files: '`Engine.igs` (BRIAGE) → `.GeoPcDx` after BPE2 export; textures → `.TgPcDx`',
      render: 'Drawn by the RenderComponent (`cAnimObjectRenderBlueprint`) from the exterior `GeometryID`. Each material carries a TSC shader chosen in BRIAGE (`TrainBasicObjectDiffuse.fx` and friends). The LOD prefix decides the switch distance.',
      motion: 'Rigid. The game carries the body on its bogie entries as they follow the track; `FrontPivotX/BackPivotX` in the vehicle blueprint place it.',
      anim: 'None. BRIAGE merges static objects with the same LOD and distance into one node.',
      sound: 'None of its own. Sound sources are child entities placed on the body by the ContainerComponent.',
      journey: [[0, 'Modelled in metres, origin at rail level and mid-length, +Y forward, transforms applied.'], [1, 'Named `1_0500_engine`; its low-poly twin `2_1200_engine` is a child with a larger distance.'], [2, 'Materials get TSC shaders; textures power-of-two with one dot in the name.'], [4, 'BRIAGE writes it into the exterior `.igs`.'], [5, 'Engine blueprint: RenderComponent → .igs; RailVehicleComponent → mass, length, collision, pivots.'], [7, 'BPE2 export compiles it to `.GeoPcDx`.'], [8, 'Drawn in game; LOD switches at 500 m.']],
    },
    tf3: {
      node: '`body` in `name_lod0.fbx`, again in `name_lod1.fbx`',
      files: 'FBX per LOD → Model Editor writes `msh/body_lod0.msh`, `mat/*.mtl` and the `.mdl` node tree',
      render: 'PBR `.mtl` materials (albedo, normal, metal-gloss-AO). LOD distances are set in the Model Editor.',
      motion: 'Rigid; the game sets it on its bogies or fake bogies. Physics is a few numbers in metadata: power, tractive effort, top speed, weight.',
      anim: 'None.',
      sound: 'None; the vehicle\'s sound set lives in `soundConfig`.',
      journey: [[0, 'Same master scene as TSC.'], [1, 'Export Prep rotates it +Y → +X forward on a temporary copy and renames it `body`.'], [2, 'Textures as `_alb`, `_nrm`, `_mga`.'], [4, '`body` goes into `_lod0.fbx`; the twin into `_lod1.fbx`.'], [5, 'Model Editor converts it to `.msh` and builds the `.mdl`.'], [6, 'Metadata: transportVehicle, railVehicle, weight.'], [8, 'Bought from the depot, runs on AI timetables.']],
    },
    tsw: {
      node: 'Vertices weighted 100% to bone `Body_Pivot` in `SK_Name_Ext`',
      files: '`SK_Name_Ext.fbx` → SkeletalMesh + Skeleton in `View/Models/Exterior`',
      render: 'The RVV\'s skeletal mesh component `SK_RailVehicle` draws it with Unreal PBR materials (base colour, normal, packed ORM). LODs are generated in the editor; ComponentLODManagement turns extras off with distance.',
      motion: 'The RVM\'s physics body moves along the track. `Body_Pivot` carries body sway and buffer offsets. Size and mass are typed into the RailVehiclePhysicsComponent from the build sheet.',
      anim: 'None of its own; it is the parent of every moving bone.',
      sound: 'RVA audio components attach to the `Audio*` sockets on this skeleton.',
      journey: [[0, 'Same master scene.'], [1, 'Export Prep joins static parts into one mesh weighted to `Body_Pivot` under `Root`.'], [2, 'Base colour, normal and ORM maps; untick sRGB on ORM in the editor.'], [4, 'Written into `SK_Name_Ext.fbx` with the armature and sockets.'], [5, 'Imported as a SkeletalMesh; ABP parent `RailVehicleAnimInstance`.'], [6, 'RVV component `SK_RailVehicle`; RVM physics Width/Height/Length/Mass.'], [8, 'Spawned from the formation; drawn only near the player.']],
    },
  },
  // ------------------------------------------------------------------ glass
  glass: {
    summary: 'Windows are not separate objects in any game: they are a material on the body with a transparent shader.',
    tsc: {
      node: 'Faces of `1_0500_engine` with a glass material',
      files: 'Inside the exterior `.igs`',
      render: '`TrainGlass.fx`: slot 1 RGBA, slot 2 cubemap for reflection. A windscreen that should show rain uses `TrainGlassWeatherEffects.fx` and must be named `weatherglass_1`, `_2`… (BRIAGE §8.7.5).',
      motion: 'Moves with the body.', anim: 'None.', sound: 'None.',
      journey: [[2, 'Material set to TrainGlass in BRIAGE\'s material panel.'], [4, 'Exported with the body.'], [8, 'Reflects the sky cubemap; rain only on weatherglass materials.']],
    },
    tf3: {
      node: 'Faces of `body` with `glass.mtl`', files: '`mat/glass.mtl`',
      render: 'A transparent material type in the Model Editor; textures as for the body.', motion: 'With the body.', anim: 'None.', sound: 'None.',
      journey: [[2, 'Its own material so it can get a glass type.'], [5, 'Model Editor: Materials tab sets the glass material type.']],
    },
    tsw: {
      node: 'A material slot on `SK_Name_Ext`', files: '`MI_Glass` material instance',
      render: 'Translucent material instance on Dovetail\'s or your own master material. Rain on glass depends on the master material used {check}.',
      motion: 'With `Body_Pivot`.', anim: 'None.', sound: 'Cab occlusion (muffling outside sound) is an RVA occlusion mesh, not the glass.',
      journey: [[2, 'Separate material slot.'], [5, 'Material instance created and assigned after import.']],
    },
  },
  // ------------------------------------------------------------------ door
  door: {
    summary: 'A hinged part. Its origin sits on the hinge and frame 0 is closed in every game.',
    tsc: {
      node: '`1_0500_door_l1` (`door$$` keyword keeps it a separate node)',
      files: '`.igs` node + an `.ia` animation file per door set',
      render: 'Part of the exterior .igs.',
      motion: 'No physics; it only plays its animation.',
      anim: 'Keyed in Blender, exported as `.ia`, linked as an AnimSet ID and driven by a control (`DoorsOpenClose` on the steam sample) or by Lua with `AddTime`.',
      sound: 'Door sound is a sound blueprint listening to the same control {check}.',
      journey: [[0, 'Origin on the hinge edge.'], [1, 'Named with the door keyword.'], [3, 'Keyed closed at frame 0, open at the last frame.'], [4, 'BRIAGE IA export writes `door_l.ia`.'], [5, 'RenderComponent AnimSet ID → .ia; control value drives it.'], [6, 'Optional Lua: `Call("*:SetControlValue","DoorsOpenClose",0,1)`.'], [8, 'Opens when the control changes.']],
    },
    tf3: {
      node: '`door_l1`', files: 'NLA strips → `.ani` per event on the door node',
      render: 'Own `.msh` node.', motion: 'Plays when the game raises the event.',
      anim: 'NLA strip named `open_doors_left` (and `close_doors_left`). The strip name is the event name. Timing should fit `arrivalDelay` / `departureDelay`.',
      sound: 'Door effects from the sound set {check}.',
      journey: [[0, 'Origin on the hinge.'], [1, 'Renamed `door_l1`.'], [3, 'Action pushed into an NLA strip named after the event.'], [4, 'Baked strips go into `_lod0.fbx`.'], [5, 'Model Editor: node animations keyed by event name.'], [8, 'Opens at stations on the platform side.']],
    },
    tsw: {
      node: 'Bone `door_l1`; RVM `RailVehicleDoorComponent` `CabDoor_L`', files: 'Clip `Animation/Door_L1.fbx`; ABP VHID entry',
      render: 'Weighted to its bone.', motion: 'The door component is a VHID with a state machine: target OPEN/CLOSED, lock state, `transition_time` 1 s. Its output runs 0 → 1.',
      anim: 'Clip scrubbed by the output: the ABP\'s `VirtualHIDSequenceEntries` maps `CabDoor_L` → `Door_L1`. 0.5 shows a half-open door.',
      sound: 'RVA binds `OnOutputValueChanged(CabDoor_L)` and plays the door cue.',
      journey: [[1, 'Becomes bone `door_l1` at the hinge.'], [3, 'Object keys baked into clip `Door_L1`.'], [4, 'One FBX per clip, take named after the clip.'], [5, 'ABP entry `CabDoor_L → Door_L1`.'], [6, 'RVM door component + RVV hitbox with the same name.'], [7, 'RVA door cue.'], [8, 'Click the hitbox or the key to open.']],
    },
  },
  // ------------------------------------------------------------------ pantograph
  panto: {
    summary: 'A linkage of arms. Each arm is its own part with its origin on its joint, so the whole linkage can be keyed.',
    tsc: {
      node: '`1_0128_panto01` parts (`panto` keyword); 128 m LOD because thin detail vanishes beyond that',
      files: '`.igs` nodes + `frontPanto.ia` / `rearPanto.ia`',
      render: 'Exterior .igs.', motion: 'The electric simulation needs a raised pantograph for power (`HasPantograph eTrue`).',
      anim: '`.ia` exported from the keyed arms; ControlValues: `FrontPantographControl` gets an exterior element, AnimationID `frontPanto`, AnimStyle `Toggle`.',
      sound: 'Raise/lower thunk from a sound blueprint on the control {check}.',
      journey: [[0, 'Arms separate, origins on joints.'], [1, 'Named `1_0128_panto01…`.'], [3, 'Key lowered at frame 0, raised at the end.'], [4, 'IA export per pantograph.'], [5, 'AnimSet `frontPanto`; control element AnimStyle Toggle.'], [8, 'Raised with its key; power only when up.']],
    },
    tf3: {
      node: '`panto_front`, `panto_rear` with arm children', files: 'Event strips on the arm nodes',
      render: 'Own nodes.', motion: 'Raised by consist position events, so the trailing pantograph can be the one up.',
      anim: 'Strips such as `front_forward_parts_on/off` / `back_forward_parts_on/off`; TF3 has no driver-operated pantograph control {check}.',
      sound: 'None specific.',
      journey: [[1, 'Renamed by the name map.'], [3, 'Raise/lower actions as event strips.'], [5, 'Node animations keyed by event.'], [8, 'Changes with direction of travel.']],
    },
    tsw: {
      node: 'Bones `panto01_part01` › `panto01_part02`; RVM VHID `PantographControl`', files: 'Clip `Pantograph_F` holding both arms',
      render: 'Weighted per arm; the head rides on the upper arm.', motion: 'In the SimuGraph a contact value gates the voltage source (same pattern as the trolley-pole example).',
      anim: 'Export Prep bakes the whole linkage into one clip, scrubbed by the VHID output 0 → 1.',
      sound: 'RVA clunk bound to the VHID event.',
      journey: [[1, 'Upper arm bone is a child of the lower arm bone.'], [3, 'Both arms baked into `Pantograph_F`.'], [5, 'ABP VHID entry `PantographControl → Pantograph_F`.'], [6, 'VHID pair + SimuGraph contact node.'], [8, 'Raise from the cab or keyboard.']],
    },
  },
  // ------------------------------------------------------------------ bogie
  bogie: {
    summary: 'A frame that turns under the body to follow the track. Its pivot is the point that matters, not its mesh.',
    tsc: {
      node: '`1_0500_bo01` (front, +Y) and `1_0500_bo02`; wheelsets are its children',
      files: '`Default/Bogies/*.xml` (`cBogeyBlueprint`) → `.bin`; engine blueprint `Bogey[]` list',
      render: 'Nodes in the exterior .igs; the `bo` keyword keeps them unmerged.',
      motion: 'The game yaws the node to follow the track about the **blueprint** pivot `BogeyPivotX`, not the mesh origin. The XML has the final say: the sample\'s front bogie is modelled at 5.583 m and pivots at 6.25 m {v}.',
      anim: 'None.', sound: 'None.',
      journey: [[0, 'Origin on the real pivot point.'], [1, 'Named `1_0500_bo01`, `bo02`.'], [4, 'Separate nodes in the .igs.'], [5, 'Bogie blueprint: Geometry `bo01`, axles, radius, gauge. Vehicle bp: `BogeyPivotX` (Toolkit Measure + Patch writes it).'], [8, 'Turns on curves; if it swings in the wrong place, BogeyPivotX ≠ mesh.']],
    },
    tf3: {
      node: '`bogie_front`, `bogie_rear`; any node holding axle nodes is a bogie', files: 'Nodes in the `.mdl`; `railVehicle.config.fakeBogies`',
      render: 'Own `.msh`.', motion: 'The game turns real bogies about their origin to follow the track.',
      anim: 'None.', sound: 'None.',
      journey: [[1, 'Renamed `bogie_front` by the name map.'], [4, 'Node in each LOD file.'], [5, 'Node with axle children.'], [6, '`fakeBogies = { {}, {} }` when real bogie nodes exist.'], [8, 'Follows curves.']],
    },
    tsw: {
      node: 'Bone `bogie1`, `bogie2`; SimuGraph `Bogie` nodes', files: 'Skeleton; ABP `Bogies.Entries`; Bogie nodes in `SA_Name`',
      render: 'Weighted to its bone.',
      motion: 'The engine yaws the bone to follow the track. The SimuGraph Bogie node\'s X offset from the vehicle centre is the pivot and the axles name it as parent. Two bogies with the same offset sign make the vehicle jump when hauled.',
      anim: 'None; the parent class does it once the Bogies entry names the sim node.', sound: 'None.',
      journey: [[1, 'Bone `bogie1` at the pivot; axle bones as children; wheel sockets on it.'], [5, 'ABP Bogies list: bone `bogie1` ↔ sim node `Bogie1`.'], [6, 'SimuGraph: Bogie1 at +X, Bogie2 at −X.'], [8, 'Yaws on curves in Play In Editor.']],
    },
  },
  // ------------------------------------------------------------------ wheelset (bogie vehicle)
  wheelset: {
    summary: 'Plain wheelsets need no animation in any game: a separate node with its origin on the axle centre line is enough.',
    tsc: {
      node: '`1_0500_bo01wh01` … `bo02wh02`, children of their bogie', files: '.igs nodes; bogie blueprint `Axle NodeId` points at them',
      render: 'Exterior .igs; the `wh` keyword keeps them separate.',
      motion: 'The game spins each node at speed ÷ `WheelRadius`. The radius must equal the modelled height of the wheel centre or the vehicle floats or sinks (sample: 0.525 m mesh vs 0.55 m blueprint) {v}.',
      anim: 'None authored.', sound: 'Rail joints and flange noise come from sound blueprints driven by speed, not from the node {check}.',
      journey: [[0, 'One object per wheelset, origin on the axle, lowest point on Z = 0.'], [1, '`1_0500_bo01wh01` under `1_0500_bo01`.'], [4, 'Own node in the .igs.'], [5, 'Bogie bp `Axle NodeId`, `WheelRadius`, `HorizontalOffset`; Toolkit measures them.'], [8, 'Spun by the game from speed.']],
    },
    tf3: {
      node: '`w1` … `w4`, numbered front to back', files: '`msh/w1_lod0.msh`; listed in `railVehicle.config.axles`',
      render: 'Own `.msh` node.',
      motion: 'Rotated about its local y by the game from speed and mesh radius because it is listed in `axles`. The origin must be centred in x and z or the axle wobbles.',
      anim: 'None. Do not key axles.', sound: 'Running sounds from the `soundConfig` set.',
      journey: [[1, 'Renamed `w1` front to back; the rotation makes it spin about TF3 y.'], [4, 'Separate node in every LOD file.'], [5, 'Becomes `msh/w1_lodN.msh`.'], [6, '`axles = { "w1", "w2", "w3", "w4" }`.'], [8, 'Rotated from speed.']],
    },
    tsw: {
      node: 'Bones `axle1` … `axle4` under their bogie bone; SimuGraph `Axle1` …', files: 'Skeleton bones; ABP `Axles.Entries`; Axle nodes in `SA_Name`',
      render: 'Weighted 100% to its axle bone.',
      motion: 'The SimuGraph Axle node integrates torque and brake force and reports `WheelRotation_DEG`; the ABP\'s Axles list spins the bone from it. Each entry needs the Simulation component and node set, or the wheels stay still.',
      anim: 'None needed with the Axles list. A one-revolution `Wheels_FullRotation` clip is the alternative.',
      sound: 'View component: per-axle joint clack and rail singing; RVA cues from speed thresholds.',
      journey: [[1, 'Bone `axle1` spanning the wheelset; sockets `Wheel_L1/R1` at rail contact on the bogie bone.'], [3, 'Wheels_FullRotation generated (optional here).'], [4, 'In `SK_Name_Ext.fbx`.'], [5, 'ABP Axles: `axle1` ↔ sim node `Axle1`, and so on.'], [6, 'SimuGraph Axle nodes: offset from the bogie, gauge, wheel radius, parent bogie.'], [8, 'Turn in Play In Editor; sparks spawn at the Wheel sockets.']],
    },
  },
  // ------------------------------------------------------------------ frame (rigid vehicle)
  frame: {
    summary: 'The difference between the two vehicles: on a rigid engine the frame carries the wheels directly, with nothing to swivel.',
    tsc: {
      node: '`1_0500_frame` merged into the body; coupled wheels sit in a rigid bogie entry', files: 'Engine blueprint `Bogey[]` with one entry for the coupled wheels',
      render: 'Part of the body .igs.',
      motion: 'No bogies to turn. The 7F steam sample treats its coupled wheels as a bogie entry at x = 0 with very stiff suspension, and its pony truck as a second entry {v}.',
      anim: 'None; wheels and rods share one animation (see the rods).', sound: 'None.',
      journey: [[0, 'Frame and footplate modelled with the body.'], [1, 'Wheels named as one bogie group, rods with custom keywords.'], [5, 'One rigid bogie entry for the coupled wheels; stiff suspension values set explicitly.'], [8, 'Runs as a rigid chord through curves.']],
    },
    tf3: {
      node: 'Part of `body`; no bogie nodes at all', files: '`railVehicle.config.fakeBogies`',
      render: 'Body `.msh`.', motion: 'Axles hang straight under `body`. `fakeBogies` gives the game the pivots a rigid frame needs to follow curves.',
      anim: 'None.', sound: 'None.',
      journey: [[1, 'Wheels renamed `w1…w3` directly under `body`.'], [6, '`fakeBogies` filled because there are no bogie nodes {check}.'], [8, 'Follows curves as one rigid frame.']],
    },
    tsw: {
      node: 'Part of `Body_Pivot`; no bogie bones', files: 'Empty ABP `Bogies` list; no Bogie nodes in the SimuGraph',
      render: 'Weighted to Body_Pivot.', motion: 'Axle bones are children of Body_Pivot; SimuGraph Axle nodes take their X offsets from the vehicle centre. This is exactly how Thomas is built {v}.',
      anim: 'None.', sound: 'None.',
      journey: [[1, 'Axle bones parented straight to Body_Pivot.'], [5, 'Bogies list stays empty.'], [6, 'SimuGraph: Axle nodes only, offsets from the centre.'], [8, 'Rigid wheelbase on curves.']],
    },
  },
  // ------------------------------------------------------------------ drive wheels (rigid)
  drivewheel: {
    summary: 'Coupled wheels turn together with the rods, so here the wheels need an animation of one full revolution.',
    tsc: {
      node: '`1_0500_bo01wh01` … `wh03` in the coupled-wheel group', files: '.igs nodes + a one-revolution `.ia` of wheels and rods',
      render: 'Exterior .igs.',
      motion: 'Wheel nodes still spin from speed ÷ radius. Rods must move in step, so wheels and rods are exported together as a one-revolution IA from the bogie objects (BRIAGE §10.3) {v}; how that IA is tied to wheel rotation in the blueprint is still to confirm {check}.',
      anim: 'One full turn of wheels, rods and crossheads; the last frame equals frame 0.',
      sound: 'Chuffs come from the steam sound blueprint, timed to wheel rotation {check}.',
      journey: [[0, 'Each wheelset separate, origin on the axle; crank pins on the wheels.'], [1, 'Wheel keyword names, or the wheels added to Custom Keywords.'], [3, 'One revolution keyed with the rods.'], [4, 'IA export from the wheel group.'], [5, 'Bogie entry with the coupled axles and radius.'], [8, 'Wheels and rods turn together.']],
    },
    tf3: {
      node: '`w1` … `w3` directly under `body`', files: 'Strip `wheels` (or `drive`) on the drivers and rods',
      render: 'Own nodes.', motion: 'Drivers that carry rods are keyed with the rods; the `wheels` strip\'s length is mapped to one wheel revolution by the game. Do not also list them in `axles` or they turn twice {check}.',
      anim: 'One revolution of wheels and rods in an NLA strip named `wheels`.', sound: 'Steam sound set; chuff rate follows speed.',
      journey: [[1, 'Renamed `w1…w3`.'], [3, 'Revolution pushed into the `wheels` strip.'], [5, '.ani on each node.'], [6, 'Only plain carrying wheels stay in `axles`.'], [8, 'Rods in step with the wheels.']],
    },
    tsw: {
      node: 'Bones `axle1` … `axle3` under Body_Pivot; SimuGraph `Axle1–3`', files: 'Clip `Wheels_FullRotation`; ABP binding',
      render: 'Weighted to the axle bones.',
      motion: 'SimuGraph axle angle → ABP variable `Simulation_Axle2_WheelRotation_DEG` → `AxleRotationAlpha = deg / 360` → Sequence Evaluator scrubs `Wheels_FullRotation`. This is Thomas\'s entire exterior ABP {v}.',
      anim: '`Wheels_FullRotation` holds wheels, crank pins, rods and pistons: one turn, first frame equals last.',
      sound: 'RVA chuff cue with MPH and pitch parameters; speed thresholds at 2.24 m/s and 0.045 m/s on Thomas {v}.',
      journey: [[1, 'Axle bones under Body_Pivot; rod bones too.'], [3, 'Your keyed revolution baked into `Wheels_FullRotation`.'], [4, '`Animation/Wheels_FullRotation.fbx`.'], [5, 'Sequence Evaluator bound to the axle angle.'], [6, 'SimuGraph Axle nodes.'], [8, 'Rods turn with the simulated wheels.']],
    },
  },
  // ------------------------------------------------------------------ rods
  rods: {
    summary: 'Rods are never physics-driven. They replay a keyed revolution in step with the wheels.',
    tsc: {
      node: '`1_0100_rod1_l`, `rod1_r` … listed in BRIAGE Custom Keywords so they are not merged', files: 'Inside the wheels-and-rods `.ia`',
      render: 'Exterior .igs nodes.', motion: 'Replays the revolution animation in step with the wheels.',
      anim: 'Keyed in Blender; BRIAGE bakes bones, lattices and copy-location/rotation constraints into the IA (§8.5.2).', sound: 'None.',
      journey: [[0, 'Each rod a separate object; constraints are fine.'], [1, 'Rod names added to Custom Keywords.'], [3, 'Keyed with the wheels.'], [4, 'Exported in the same IA.']],
    },
    tf3: {
      node: '`rod_l`, `conrod_l` … under `body`', files: 'Same `wheels` strip as the drivers',
      render: 'Own nodes.', motion: 'The game maps the strip\'s length to one wheel revolution.', anim: 'Same action as the drivers.', sound: 'None.',
      journey: [[1, 'Renamed by the name map.'], [3, 'In the `wheels` strip.'], [5, '.ani per node.']],
    },
    tsw: {
      node: 'Bones such as `axle_Rod_L`, `ConnectingRod_L` (Thomas: `axle_Rod_L/R`, `ConectingRod_FL…`)', files: 'Inside `Wheels_FullRotation`',
      render: 'Weighted to the rod bones.', motion: 'Scrubbed by the axle angle with the wheels.', anim: 'Baked into the clip by Export Prep.', sound: 'None.',
      journey: [[1, 'Rod bones under Body_Pivot.'], [3, 'Baked into the wheel clip.'], [5, 'Played by the same Sequence Evaluator.']],
    },
  },
  // ------------------------------------------------------------------ cylinders
  cylinders: {
    summary: 'On a steam engine the cylinders are where the simulation lives: steam in, tractive effort out, chuffs as a side effect.',
    tsc: {
      node: 'Static in `1_0500_engine`; crossheads animate with the rods', files: 'Sim blueprint `cSteamSubSystemBlueprint`',
      render: 'Exterior .igs.', motion: 'The steam model: cylinders (2 × 21″ × 28″ on the 7F), cutoff, regulator, `TractiveEffortVsCutoff` curve {v}.',
      anim: 'Crossheads in the rods IA; drain-cock steam is a particle child entity.', sound: 'Chuff and cylinder-cock sound blueprints.',
      journey: [[5, 'Steam subsystem in the sim blueprint.'], [6, 'Lua can read cutoff and regulator.'], [8, 'Tractive effort from steam and cutoff.']],
    },
    tf3: {
      node: 'Part of `body`', files: 'Metadata numbers; `emissions`',
      render: 'Body .msh.', motion: 'No steam model: power, tractive effort and top speed numbers.', anim: 'None.', sound: 'Steam sound set.',
      journey: [[6, 'Power and tractive effort in metadata.'], [8, 'Performance from the numbers.']],
    },
    tsw: {
      node: 'Part of Body_Pivot', files: 'SimuGraph nodes; RVA cues',
      render: 'Weighted to Body_Pivot.', motion: 'Thomas fakes steam with an `ElectricalMotorV2` and a `ChopperV2`; real steam needs boiler, regulator and cutoff nodes from the palette {check}.',
      anim: 'Pistons inside the wheel clip.', sound: 'RVA chuff cue `SC_Chuffs`, pitch from speed through float curves.',
      journey: [[6, 'SimuGraph traction chain.'], [7, 'RVA chuffs.'], [8, 'Feels like steam if the graph does.']],
    },
  },
  // ------------------------------------------------------------------ smoke
  smoke: {
    summary: 'Smoke is never in the mesh: it is a particle system attached at the chimney and driven by the simulation.',
    tsc: {
      node: 'Chimney in `1_0500_engine` + a particle emitter child entity (the 7F\'s `Main Smoke Stack`)', files: 'Particle emitter blueprint in the ContainerComponent',
      render: 'TSC particle system at the child\'s matrix.', motion: 'Emission driven by the steam simulation and control values.', anim: 'None.', sound: 'None.',
      journey: [[5, 'Child entity with position on the chimney top.'], [6, 'Lua can change emitter rate and colour.'], [8, 'Puffs with the exhaust.']],
    },
    tf3: {
      node: 'Part of `body`', files: '`emissions` metadata at a node position {check}',
      render: 'Engine particle effect.', motion: 'Emitted while running.', anim: 'None.', sound: 'None.',
      journey: [[6, 'Emission entry in metadata.'], [8, 'Smoke while moving.']],
    },
    tsw: {
      node: 'Niagara component on the RVV (Thomas: `MainPipeSmoke`)', files: 'RVV component + Niagara system',
      render: 'Niagara particles.', motion: 'Driven by RVM events and sim values; whistle steam spawns with the whistle button.', anim: 'None.', sound: 'None.',
      journey: [[6, 'Niagara on the RVV, attached at a socket.'], [8, 'Visible near the player only.']],
    },
  },
  // ------------------------------------------------------------------ couplers
  couplers: {
    summary: 'Coupling is a pair of points, not a mesh: each game needs to know where the couplers are and which kinds may join.',
    tsc: {
      node: '`tsc_coupling_front/rear` empties (Toolkit) + buffer meshes in the body', files: 'Engine blueprint: Front/RearCouplingBlueprintID, coupling pivot and receiving matrices',
      render: 'Buffers are static mesh.', motion: 'Vehicles join at the receiving points (±9.03 / ±9.14 m at 1.025 m on the sample) {v}.',
      anim: 'None.', sound: 'Coupling clank from a sound blueprint {check}.',
      journey: [[0, 'Empties at the coupler faces.'], [5, 'Toolkit Measure + Patch writes the coupling matrices.'], [8, 'Couples in the game.']],
    },
    tf3: {
      node: 'Buffers are part of `body`', files: 'Vehicle length from the bounding box',
      render: 'Body .msh.', motion: 'TF3 couples vehicles end to end using each vehicle\'s length {check}.', anim: 'None.', sound: 'None.',
      journey: [[4, '`|bounding_box` helper sets the length.'], [8, 'Consists assembled by the game.']],
    },
    tsw: {
      node: 'RVM `CouplerComponent` `Coupler_F/B` + sockets `Coupler_F/B`; buffer bones `buffer_fl…`', files: 'RVM components; ABP `BufferBones`; RVD ConnectivityData',
      render: 'Coupler view mesh is a small ConnectionSkeletalMesh with its own ABP.',
      motion: '`coupler_id` must match the neighbour\'s. Pivot point at the draft gear, receiving point at the knuckle. The engine compresses the buffer bones from physics.',
      anim: 'Hook up/down in the coupler ABP.', sound: 'View component impact sounds; RVA coupler cues.',
      journey: [[1, 'Buffer bones and Coupler sockets from the empties.'], [5, 'BufferBones list.'], [6, 'Coupler components with id, pivot and receiving point.'], [7, 'RVD ConnectivityData ▸ Recalculate.'], [8, 'Couples to matching stock only.']],
    },
  },
  // ------------------------------------------------------------------ lights
  headlight: {
    summary: 'A lamp is two things: a glowing mesh you see and a light source that lights the world. Both are switched by direction or a control.',
    tsc: {
      node: 'Glow meshes `1_1000_light_fwdhead`, `_fwdtail`, `_revhead`, `_revtail` + a light child blueprint', files: '.igs nodes + light child entity',
      render: 'Additive/unlit glow shader; the light source is a separate child entity.',
      motion: 'Shown by direction: `fwd` meshes when running forward, `rev` when reversing; the Headlights control switches them.', anim: 'None.', sound: 'Switch click {check}.',
      journey: [[1, 'Named with the light keywords, 1000 m LOD so they show at night.'], [2, 'Glow material.'], [5, 'Light child entities at the lamp positions.'], [8, 'Head and tail swap with direction.']],
    },
    tf3: {
      node: 'Glow mesh node + an FBX light (point/spot) imported with `childId`', files: 'Event strips on the glow node',
      render: 'Emissive mesh + engine light.', motion: 'Shown and hidden by `front_forward_parts_on/off` and `back_forward_parts_on/off` (position in the consist).',
      anim: 'Strips named after those events.', sound: 'None.',
      journey: [[3, 'Visibility strips named after the events.'], [4, 'FBX light exported with the glow node.'], [8, 'Lamps follow the consist position.']],
    },
    tsw: {
      node: 'RVV `HeadlightController` (`LinearElectricLightComponent`) + SpotLight at a `Headlight` socket; RVM PushButton `Headlights`', files: 'RVV + RVM components; VHID presets',
      render: 'The controller maps 0..1 to the light\'s intensity or an emissive parameter. The Class 47 has twenty of them {v}.',
      motion: 'VHID output → RVV event graph → controller. Presets `HeadlightsOn` / `Off` set it from the pause menu.', anim: 'None.', sound: 'Switch click via the hitbox interaction sound.',
      journey: [[1, '`socket_Headlight` empty becomes a socket.'], [6, 'PushButton on the RVM, controller + SpotLight on the RVV.'], [8, 'Toggle with the key or the switch.']],
    },
  },
  // ------------------------------------------------------------------ horn / whistle
  horn: {
    summary: 'A horn or whistle is pure sound: the mesh is static and a control triggers the audio.',
    tsc: {
      node: 'Static mesh; `Horn` control value', files: 'Sound proxy blueprint as a child entity, listening to the control {check}',
      render: 'Body .igs.', motion: 'Horn key → control value → the sound blueprint plays; Lua can drive it too.', anim: 'None.', sound: 'The horn sample, converted for the game {check}.',
      journey: [[5, 'Sound child entity on the body; Horn control.'], [6, 'Lua can sound it.'], [8, 'Plays on the key.']],
    },
    tf3: {
      node: 'Static in `body`', files: '`soundConfig` effects',
      render: 'Body .msh.', motion: 'No driver: the AI timetable raises the events.', anim: 'None.', sound: 'Effects from the chosen sound set {check}.',
      journey: [[6, 'Pick a base-game sound set or override effects.'], [8, 'Plays on AI events.']],
    },
    tsw: {
      node: 'RVM `PushButtonComponent` (PUSH_AND_HOLD, input id `Horn`)', files: 'RVA `SC_Horn` cue on an `AudioWhistle` socket',
      render: 'Static.', motion: 'No sim involvement.', anim: 'None; a whistle also spawns Niagara steam (Thomas).',
      sound: 'RVA binds `OnOutputValueChanged` and plays the cue while the button is held.',
      journey: [[1, '`socket_AudioWhistle` empty.'], [6, 'PushButton on the RVM.'], [7, 'Horn cue in the RVA.'], [8, 'Hold the key.']],
    },
  },
  // ------------------------------------------------------------------ wipers
  wiper: {
    summary: 'A looping part. In TSC and TSW a control drives it; TF3 has no event for it.',
    tsc: {
      node: '`1_0064_wiper01`', files: '`sample_wipers.ia`',
      render: 'Exterior .igs, 64 m LOD.', motion: 'Wipers control.', anim: 'Key a full cycle park → sweep → park, tick Remove last frame; AnimSet `Wipers` with AnimStyle `BackAndForthContinuous` {v}.', sound: 'Wiper sound blueprint {check}.',
      journey: [[0, 'Origin on the spindle.'], [3, 'One full cycle.'], [4, 'IA export.'], [5, 'AnimSet + control element.'], [8, 'Runs while switched on.']],
    },
    tf3: {
      node: '`wiper_l`, `wiper_r` or dropped', files: '—',
      render: 'Own node if kept.', motion: 'No wiper event in the rail vocabulary: drop it, or key a `forever` strip {check}.', anim: 'Optional forever strip.', sound: 'None.',
      journey: [[1, 'Skip with `tf3_skip` or keep static.']],
    },
    tsw: {
      node: 'Bones `wiper01_l/_r`; RVM `Wipers` VHID', files: 'Clip `wipers`',
      render: 'Weighted to its bone.', motion: 'VHID or WiperComponent.', anim: 'Clip scrubbed by a sawtooth value; it must return to rest at the end.', sound: 'RVA cue.',
      journey: [[1, 'Wiper bones.'], [3, 'Clip from the NLA strip.'], [5, 'ABP VHID entry.'], [6, 'Wipers VHID pair.']],
    },
  },
  // ------------------------------------------------------------------ numbers
  numbers: {
    summary: 'Running numbers let one model carry many identities without new textures.',
    tsc: {
      node: '`1_1000_primarydigits_1` … faces mapped onto a digits texture', files: 'Named texture set + numbering CSV',
      render: 'TrainDecal-style material; the game swaps digit cells per vehicle number.', motion: 'With the body.', anim: 'None.', sound: 'None.',
      journey: [[1, 'Digit objects named with `primarydigits`.'], [5, 'RenderComponent PrimaryNamedTextureSet; numbering CSV.'], [8, 'Number chosen per vehicle.']],
    },
    tf3: {
      node: 'Painted in the texture, or a label locator {check}', files: '—',
      render: 'Part of the texture.', motion: 'With the body.', anim: 'None.', sound: 'None.',
      journey: [[1, '`primarydigits` objects skipped by the add-on.']],
    },
    tsw: {
      node: 'RVM `NumberingComponent` + RVV `NumberBinding`', files: 'Numbering data (RVN_ source)',
      render: 'Bound to decals or material parameters.', motion: 'With the body.', anim: 'None.', sound: 'None.',
      journey: [[6, 'Numbering component pair.']],
    },
  },
  // ------------------------------------------------------------------ shadow
  shadow: {
    summary: 'Only TSC needs a hand-made shadow mesh. The other two engines cast shadows from the real mesh.',
    tsc: {
      node: '`1_0400_shadow_engine`, a closed low-poly shell', files: 'In the exterior .igs',
      render: '`StencilShadow.fx`; name must start with `shadow_`. Dropped at 400 m because stencil shadows are expensive.', motion: 'With the body.', anim: 'None.', sound: 'None.',
      journey: [[0, 'Closed shell around the body.'], [1, '`1_0400_shadow_…`.'], [2, 'StencilShadow material.'], [8, 'Casts the vehicle\'s shadow.']],
    },
    tf3: { node: 'Dropped by Export Prep', files: '—', render: 'Engine shadow maps from the real mesh.', motion: '—', anim: '—', sound: '—', journey: [[1, 'Skipped (TSC-only object).']] },
    tsw: { node: 'Dropped; optional `SM_GroundShadow` blob', files: '—', render: 'Unreal dynamic shadows; Thomas adds a cheap blob under the loco.', motion: '—', anim: '—', sound: '—', journey: [[1, 'Skipped by Export Prep.']] },
  },
  // ------------------------------------------------------------------ collision
  collision: {
    summary: 'A simple invisible hull the game uses for collisions and walking. Never the render mesh.',
    tsc: { node: 'A separate collision .igs', files: '`CollisionGeometryID`; box 18 × 2.978 × 2.75 on the sample', render: 'Not drawn.', motion: 'With the vehicle.', anim: 'None.', sound: 'None.', journey: [[0, 'Low-poly hull.'], [4, 'Exported as its own .igs.'], [5, 'Engine bp CollisionGeometryID; Toolkit generates the box from the mesh.']] },
    tf3: { node: '`|bounding_box` helper', files: 'In `_lod0.fbx`', render: 'Not drawn.', motion: 'Defines the vehicle\'s extent.', anim: 'None.', sound: 'None.', journey: [[4, 'Export Prep adds the helper.'], [5, 'Read on import.']] },
    tsw: { node: '`UCX_Name_Collision` static mesh; `Blocker_F/B` boxes', files: '`UCX_Name_Collision.fbx`', render: 'Hidden in game.', motion: 'Walkable surface for the player on foot; blockers stop walking off the footplate.', anim: 'None.', sound: 'Sometimes doubles as the audio occluder.', journey: [[4, 'Tagged objects joined into the UCX file.'], [6, 'RVV static mesh component, collision on, hidden.']] },
  },
  // ------------------------------------------------------------------ cab
  cab: {
    summary: 'The driver\'s controls. Each lever is a moving part whose position is a control value.',
    tsc: {
      node: 'Separate cab `.igs`; one CabView `.ia` per lever', files: '`sample_cab.igs`, `CabView/*.ia`, ControlContainerComponent',
      render: 'Cab geometry with `0000` LOD distances (always visible).', motion: 'The control value is the lever position; the ControlContainerComponent wires each control to its lever node and animation.',
      anim: 'Each lever keyed min → max; the control value scrubs it.', sound: 'Lever clicks from cab sound blueprints {check}.',
      journey: [[0, 'Cab in its own scene of the .blend.'], [1, '`1_0000_`, `2_0000_` names.'], [3, 'Keys from minimum to maximum.'], [4, 'Cab .igs + one IA per lever.'], [5, 'ControlValues with interface elements.'], [6, 'Lua reads and writes the values.'], [8, 'Drag the lever or use the keys.']],
    },
    tf3: {
      node: 'No cab: TF3 vehicles are not driven from inside', files: '—',
      render: '—', motion: '—', anim: '—', sound: '—', journey: [[1, 'Cab objects skipped by Export Prep.']],
    },
    tsw: {
      node: '`SK_Cab` on the same skeleton; lever bone; RVM `IrregularLeverComponent`', files: 'ABP_Cab VHID entries; RVV `VirtualHIDInteractionComponent` at socket `Lever_Throttle`',
      render: 'Second skeletal mesh on the RVV.', motion: 'The lever component maps input → ValueMap → output with notches; the RVM event graph writes the output into the SimuGraph (`PowerInput.InputValue`).',
      anim: 'Lever clip scrubbed by the VHID output.', sound: 'Hitbox interaction sound; RVA cues.',
      journey: [[1, 'Cab collection → `SK_Name_Cab`; lever socket.'], [3, 'Lever clip from the TSC control animation.'], [5, 'ABP_Cab VHID entry.'], [6, 'VHID pair; event graph → SimuGraph.'], [8, 'HUD shows the lever; it drives the loco.']],
    },
  },
  // ------------------------------------------------------------------ driver
  driver: {
    summary: 'Where the driver sits and where the camera goes. One empty in Blender serves all three games.',
    tsc: { node: '`tsc_driver` empty', files: 'Vehicle bp DriverPosition; cab camera blueprint', render: '—', motion: 'Places the driver and cab camera.', anim: '—', sound: 'Cab camera enter/leave events switch cab sounds (`OnCameraEnter`).', journey: [[0, 'Empty at eye position.'], [5, 'Toolkit writes DriverPosition.']] },
    tf3: { node: 'Driver empty → `|seat_` crew seat', files: '`seatProvider.seats[]`', render: 'Crew model placed by the game.', motion: '—', anim: 'Seat animation set in metadata.', sound: '—', journey: [[1, 'Converted to a crew seat locator.'], [6, 'seatProvider: crew seat with group and transform.']] },
    tsw: { node: 'Socket `DriverSeat`', files: 'RVV SeatComponent + InteractionEnvironmentCameraComponent; RVM InteractionEnvironmentComponent `DriverEnvironment`', render: 'Crew mesh hidden when you sit.', motion: 'Keys only work in the environment you occupy.', anim: '—', sound: 'Cab occlusion via the RVA.', journey: [[1, 'tsc_driver → SOCKET_DriverSeat.'], [6, 'Seat, camera and environment all name each other.'], [8, 'Click the seat to drive.']] },
  },
  // ------------------------------------------------------------------ traction & sound
  traction: {
    summary: 'Not a mesh: the simulation that turns throttle into tractive effort, and the sound that follows it.',
    tsc: {
      node: 'No node; sound sources are child entities', files: 'Sim blueprint (electric subsystem, `TractiveForceVSpeed`, `TractiveEffortVThrottle`, MaxForce); sound blueprints',
      render: '—', motion: 'Throttle control → curves → force at the bogies marked powered.', anim: '—',
      sound: 'Sound blueprints listen to control values such as speed and ammeter; Lua can set sound parameters (`ControlSound:SetParameter`).',
      journey: [[5, 'Sim blueprint with curves; sound child entities.'], [6, 'Lua shapes the behaviour.'], [8, 'Pulls and sounds right.']],
    },
    tf3: {
      node: 'No node', files: 'Metadata numbers + `soundConfig`', render: '—', motion: 'Power, tractive effort, top speed, weight.', anim: '—', sound: 'A base-game sound set (`.snd`) with optional effect overrides.',
      journey: [[6, 'Four numbers and a sound set.'], [8, 'AI drives it.']],
    },
    tsw: {
      node: 'SimuGraph + RVA', files: '`SA_Name`, `RVA_Name`, cues and float curves',
      render: '—', motion: 'PowerInput (ValueConverter) → Motor (`ElectricalMotorV2`) → Gearbox → Axles; the RVM event graph copies the throttle into PowerInput.',
      anim: '—', sound: 'RVA cue pitch and volume from speed through `FC_*` curves; threshold delegates switch loops on and off.',
      journey: [[6, 'Minimal graph: PowerInput, Motor, Gearbox, Axles, BrakeInput.'], [7, 'RVA with a running loop and a horn.'], [8, 'Drives and sounds in PIE.']],
    },
  },
};

// ---------------------------------------------------------------------------
// build walkthrough: steps per game; `bogie` / `rigid` keys hold the variant text
// state = what the 3D view shows; hl = kinds to highlight
// ---------------------------------------------------------------------------
export const STEPS = {
  tsc: [
    { title: 'Block out the shape', stage: 0, state: 'blockout',
      text: 'Start with primitives at real size in metres. Put the origin at rail level, mid-length, with +Y forward in Blender. Apply scale and rotation before anything else.',
      bogie: 'A box body on two bogie frames, each with two wheelsets.', rigid: 'A boiler, tanks and cab on a frame, with three wheelsets fixed under it.',
      snippet: { all: 'Scene units: Metric, scale 1.0\nOrigin: (0, 0, 0) at rail head\nForward: +Y   Up: +Z\nCtrl+A ▸ All Transforms' } },
    { title: 'Separate every moving part and set its origin', stage: 0, state: 'pivots', hl: ['door', 'panto', 'wheelset', 'drivewheel', 'rods', 'bogie', 'wiper', 'cab'],
      text: 'Anything that moves on its own must stay a separate object with its origin on its hinge or axle. The gizmos show those origins.',
      bogie: 'Bogie origins go on the real pivot point. Wheelset origins on the axle centre line, lowest point exactly on Z = 0.',
      rigid: 'No bogies. Wheel origins on the axle; each rod is its own object. Crank pins sit on the wheels so the rods have something to follow.' },
    { title: 'Name for TSC: LOD level, distance, keyword', stage: 1, state: 'names',
      text: 'Every exported object is named `L_DDDD_name`. The prefix becomes LOD data; the base name is the node the blueprints refer to. Keywords such as `bo01`, `wh01`, `panto01`, `door`, `wiper` keep parts from being merged.',
      bogie: '`1_0500_bo01` is the front bogie, its wheelsets `1_0500_bo01wh01` and `…wh02` are children.',
      rigid: 'The wheels and rods do not follow a standard keyword set, so they go into BRIAGE\'s Custom Keywords list (§10.3).',
      snippet: { bogie: '1_0500_engine\n├─ 1_0500_bo01\n│  ├─ 1_0500_bo01wh01\n│  └─ 1_0500_bo01wh02\n├─ 1_0128_panto01\n├─ 1_0500_door_l1\n└─ 1_0064_wiper01', rigid: '1_0500_engine\n├─ 1_0500_bo01wh01\n├─ 1_0500_bo01wh02\n├─ 1_0500_bo01wh03\n├─ 1_0100_rod1_l   (custom keyword)\n└─ 1_0100_rod1_r   (custom keyword)' } },
    { title: 'Add the LOD twins', stage: 1, state: 'lod',
      text: 'A simplified copy with the same base name and a larger distance becomes the next LOD: `2_1200_engine` is the child of `1_0500_engine`. Thin details get short distances (`1_0128_` pantographs) and vanish early.',
      snippet: { all: '1_0500_engine      detailed, to 500 m\n└─ 2_1200_engine   simplified, to 1200 m\n1_0400_shadow_…    shadows drop at 400 m\n1_1000_light_…     lamps visible at night' } },
    { title: 'Materials, shaders and textures', stage: 2, state: 'uv',
      text: 'Paint in Substance, bring the maps back to Blender, and give each material a TSC shader in BRIAGE\'s material panel. Textures must be power-of-two with one dot in the name. A 4K sheet can be split into 2048 tiles by cropping (Texture split add-on) instead of re-baking.',
      snippet: { all: 'Body        TrainBasicObjectDiffuse.fx\nWindows     TrainGlass.fx  (RGBA + cubemap)\nNumbers     TrainDecal.fx\nShadow      StencilShadow.fx\nTextures    [00]body_diffuse.tga  2048 × 2048' } },
    { title: 'Special objects: shadow, lights, numbers, empties', stage: 1, state: 'special', hl: ['shadow', 'headlight', 'numbers', 'couplers', 'driver', 'collision'],
      text: 'TSC wants a few objects the other games do not: a stencil shadow shell, glow meshes for each lamp direction, digit faces for running numbers, and empties for the driver and couplings that the Toolkit measures. The collision hull is a separate .igs.' },
    { title: 'Animate with frame 0 parked', stage: 3, state: 'anim', hl: ['door', 'panto', 'wiper', 'drivewheel', 'rods', 'cab'],
      text: 'Every animation starts parked: pantographs down, doors shut, levers at minimum. The game plays these by control value.',
      bogie: 'Wheelsets need no animation: the game spins them. Pantographs, doors and wipers each get an action.',
      rigid: 'Key one full revolution of the wheels, crank pins and rods together. The last frame must equal frame 0 so it loops cleanly.' },
    { title: 'Export the .igs and the .ia files with BRIAGE', stage: 4, state: 'export',
      text: 'BRIAGE writes the exterior geometry as one `.igs` with all LODs and one `.ia` per animation. Same drive for the .blend, the textures and the target folder, or textures are dropped.',
      snippet: { bogie: 'RailVehicles/Electric/MyLoco/\n  Engine.igs\n  Engine_collision.igs\n  frontPanto.ia  rearPanto.ia\n  door_l.ia  wipers.ia\n  Textures/*.tga', rigid: 'RailVehicles/Steam/MyTank/\n  Engine.igs\n  Engine_collision.igs\n  wheels_rods.ia   (one revolution)\n  Textures/*.tga' } },
    { title: 'Blueprints in Blueprint Editor 2', stage: 5, state: 'data', hl: ['bogie', 'wheelset', 'frame', 'drivewheel', 'couplers', 'traction', 'cylinders'],
      text: 'The blueprints turn geometry into a vehicle: mass, bogies, couplings, controls, the sim, the script. The Toolkit\'s Measure + Patch writes the numbers taken from the mesh.',
      bogie: 'One bogie blueprint per bogie type (Geometry `bo01`, axle node ids, `WheelRadius`, gauge). The vehicle blueprint lists them with `BogeyPivotX`; that value, not the mesh, decides where the bogie turns.',
      rigid: 'The coupled wheels go into one rigid bogie entry at x = 0 with stiff suspension set explicitly, as on the 7F sample. The sim blueprint carries the steam subsystem: boiler, cylinders, cutoff.',
      snippet: { bogie: '<cBogeyBlueprint>\n  <Geometry>bo01</Geometry>\n  <WheelRadius>0.55</WheelRadius>\n  <WheelGauge>1.435</WheelGauge>\n</cBogeyBlueprint>\n…\n<Bogey> BogeyPivotX 6.25 </Bogey>', rigid: '<Bogey>  coupled wheels, x = 0\n  SuspensionStiffness 8E+09\n</Bogey>\n<cSteamSubSystemBlueprint>\n  Cylinders 2 × 21″ × 28″\n  TractiveEffortVsCutoff.csv\n</cSteamSubSystemBlueprint>' } },
    { title: 'The cab and its controls', stage: 5, state: 'cab', hl: ['cab', 'driver'],
      text: 'The cab is a second .igs with one IA per lever. In the ControlContainerComponent each control value gets its interface elements: the lever node, its animation, the keys. The driver empty becomes the DriverPosition.' },
    { title: 'Lua script', stage: 6, state: 'data', hl: ['traction', 'panto', 'door', 'cylinders'],
      text: 'The engine script reads and writes control values every frame (`Update`) and reacts to changes (`OnControlValueChange`). Physics stays in the sim blueprint; the script adds behaviour the blueprints cannot express.',
      snippet: { all: 'function Update(dt)\n  local v = Call("*:GetSpeed")\n  if v > 20 and Call("*:GetControlValue",\n       "PantographControl", 0) < 0.5 then\n    -- no power without the pantograph\n  end\nend' } },
    { title: 'Compile and test in the game', stage: 8, state: 'game',
      text: 'BPE2 export compiles .xml to .bin, .igs to .GeoPcDx and textures to .TgPcDx. Then load a scenario and watch LogMate.',
      bogie: 'Check: sits on the rails, wheels spin at the right speed, bogies turn on curves where the mesh says.', rigid: 'Check: rods stay in step with the wheels at every speed, smoke and chuffs follow the regulator.' },
  ],
  tf3: [
    { title: 'Start from the shared master', stage: 0, state: 'textures',
      text: 'TF3 uses the same Blender scene as TSC. Nothing in this branch changes the master: the TF3 Export Prep add-on works on a temporary copy.' },
    { title: 'Axes and names: +X forward, TF3 node names', stage: 1, state: 'names',
      text: 'TF3 faces +X, so the copy is rotated −90° about Z. TSC names are mapped: the body becomes `body`, wheelsets become `w1`, `w2`… front to back.',
      bogie: 'Bogies become `bogie_front` and `bogie_rear`; any node that holds axle nodes is a bogie.', rigid: 'No bogie nodes: `w1…w3` hang straight under `body`.',
      snippet: { bogie: 'body\n├─ bogie_front\n│  ├─ w1\n│  └─ w2\n├─ bogie_rear\n│  ├─ w3\n│  └─ w4\n├─ panto_front\n└─ door_l1', rigid: 'body\n├─ w1\n├─ w2\n├─ w3\n├─ rod_l   rod_r\n└─ conrod_l  conrod_r' } },
    { title: 'Origins and the axle rule', stage: 1, state: 'pivots', hl: ['wheelset', 'drivewheel', 'bogie', 'door', 'panto'],
      text: 'TF3 spins axles about their local y. The origin must be centred in x and z or the axle wobbles in game. Doors and pantograph arms keep their hinge origins.' },
    { title: 'PBR textures', stage: 2, state: 'uv',
      text: 'TF3 materials take albedo, normal and a packed metal-gloss-AO map. The `tf3_pack_mga.py` script packs the map from greyscale masks or from a TSC specular map.',
      snippet: { all: 'textures/body_alb.dds\ntextures/body_nrm.dds\ntextures/body_mga.dds   (metal · gloss · AO)' } },
    { title: 'Animations as event strips', stage: 3, state: 'anim', hl: ['door', 'panto', 'headlight', 'drivewheel', 'rods'],
      text: 'TF3 plays animations on events. Each action goes into an NLA strip named after the event: `open_doors_left`, `front_forward_parts_on`, `wheels`.',
      bogie: 'Plain wheelsets need nothing: they are listed in `axles` and the game rotates them.', rigid: 'Drivers and rods go into one `wheels` strip whose length the game maps to one wheel revolution.' },
    { title: 'LOD files', stage: 4, state: 'lod',
      text: 'LOD lives in the file name, not the object name: `name_lod0.fbx`, `name_lod1.fbx`. Each file holds the same node names.' },
    { title: 'Locators: bounding box, seats, lights', stage: 4, state: 'special', hl: ['collision', 'driver', 'headlight'],
      text: 'The add-on adds a `|bounding_box` helper, turns the driver empty into a crew seat locator, and keeps FBX lights for the lamps. TSC-only objects (shadow, digits, cab, coupling empties) are dropped.' },
    { title: 'Export the FBX set', stage: 4, state: 'export',
      text: 'One click writes every LOD file, an `.import.lua` metadata template and the name map. The master stays untouched.',
      snippet: { all: 'vehicle-train-myloco/\n  myloco_lod0.fbx\n  myloco_lod1.fbx\n  myloco.import.lua\n  tf3_name_map.json' } },
    { title: 'Model Editor import', stage: 5, state: 'data',
      text: 'Drag the `.import.lua` onto the Model Editor, then the folder. It writes `.msh` per node per LOD, `.mtl` materials and `.ani` animations, and builds the `.mdl` node tree.' },
    { title: 'Metadata', stage: 6, state: 'data', hl: ['wheelset', 'bogie', 'drivewheel', 'frame', 'driver', 'traction'],
      text: 'The `.mdl` metadata tells the game what the model is: transportVehicle, railVehicle (axles, fake bogies, power, tractive effort, top speed, weight), seats and sound.',
      bogie: '`axles` lists all four wheelsets; `fakeBogies = { {}, {} }` because real bogie nodes exist.', rigid: '`axles` lists only plain carrying wheels; the rod-driving wheels are animated by the `wheels` strip instead. `fakeBogies` gives the frame its pivots {check}.',
      snippet: { bogie: 'railVehicle = {\n  config = {\n    axles = { "w1", "w2", "w3", "w4" },\n    fakeBogies = { {}, {} },\n  },\n  maxPower = 3300, topSpeed = 33,\n}', rigid: 'railVehicle = {\n  config = {\n    axles = { },          -- drivers use "wheels"\n    fakeBogies = { {}, {} },\n  },\n  maxPower = 450, topSpeed = 15,\n}' } },
    { title: 'Mod folder and test', stage: 8, state: 'game',
      text: 'The model, icons and `mod.lua` go into a mod folder; enable it, buy the vehicle in the depot and put it on a line.' },
  ],
  tsw: [
    { title: 'Start from the shared master', stage: 0, state: 'textures',
      text: 'TSW uses the same Blender scene again. The TSW Export Prep add-on builds a rig on a temporary copy and deletes it after export.' },
    { title: 'Objects become bones', stage: 1, state: 'rig',
      text: 'TSW wants one skinned skeletal mesh. Every moving, wheel, bogie and buffer object becomes a bone at its origin; static parts are weighted to their nearest bone ancestor; everything else to `Body_Pivot` under `Root`.',
      bogie: '`Root › Body_Pivot › bogie1 › axle1, axle2`. The engine yaws bogie bones and spins axle bones.', rigid: '`Root › Body_Pivot › axle1…axle3` and rod bones. No bogie bones at all, exactly like Thomas.',
      snippet: { bogie: 'Root\n└─ Body_Pivot\n   ├─ bogie1\n   │  ├─ axle1\n   │  └─ axle2\n   ├─ bogie2 › axle3, axle4\n   ├─ door_l1   door_r1\n   ├─ panto01_part01 › panto01_part02\n   └─ buffer_fl … buffer_br', rigid: 'Root\n└─ Body_Pivot\n   ├─ axle1\n   ├─ axle2\n   ├─ axle3\n   ├─ axle_Rod_L   axle_Rod_R\n   ├─ ConnectingRod_L  ConnectingRod_R\n   └─ buffer_fl … buffer_br' } },
    { title: 'Sockets', stage: 1, state: 'sockets',
      text: 'Attachment points become sockets on the skeleton: `Wheel_L1/R1…` at the rail contact (sparks and spray spawn there), `DriverSeat`, `Coupler_F/B`, lever and audio points. The add-on makes them from your TSC empties and the wheel meshes.' },
    { title: 'Textures', stage: 2, state: 'uv',
      text: 'Base colour, normal and a packed ORM map. In the editor untick sRGB on ORM; flip the normal map\'s green channel if it was baked in Blender.' },
    { title: 'Clips scrubbed by values', stage: 3, state: 'anim', hl: ['door', 'panto', 'wiper', 'drivewheel', 'rods', 'cab'],
      text: 'Nothing on a TSW vehicle plays over time. Each clip runs from rest at frame 0 to the end state; the game evaluates it at time = a value. Object keys are baked into pose-bone keys, one clip per control.',
      bogie: 'Plain wheelsets need no clip: the ABP\'s Axles list spins the bones from the simulation.', rigid: '`Wheels_FullRotation` holds one revolution of wheels, crank pins, rods and pistons; the ABP scrubs it by axle angle ÷ 360.' },
    { title: 'Collision mesh and cab mesh', stage: 4, state: 'special', hl: ['collision', 'cab', 'driver'],
      text: 'Tagged collision objects become `UCX_Name_Collision`, a walkable static mesh. Cab objects become a second skeletal mesh `SK_Name_Cab` on the same skeleton.' },
    { title: 'Export the FBX set and the build sheet', stage: 4, state: 'export',
      text: 'One FBX for each mesh, one per clip with the take named after the clip, the collision mesh, and `Name.tsw_build.json` with the numbers the editor asks for.',
      snippet: { all: 'MyLoco/\n  SK_MyLoco_Ext.fbx\n  SK_MyLoco_Cab.fbx\n  Animation/Door_L1.fbx …\n  Animation/Wheels_FullRotation.fbx\n  UCX_MyLoco_Collision.fbx\n  MyLoco.tsw_build.json' } },
    { title: 'Import and the Animation Blueprint', stage: 5, state: 'data', hl: ['wheelset', 'bogie', 'drivewheel', 'door', 'couplers'],
      text: 'Import the skeletal mesh, the clips and the collision mesh into the plugin. Create `ABP_Name_Ext` with parent `RailVehicleAnimInstance`. Set the model actor reference, then fill Axles, Bogies, BufferBones and VirtualHIDSequenceEntries.',
      bogie: 'Each Axles and Bogies entry names its SimuGraph node (`axle1` ↔ `Axle1`, `bogie1` ↔ `Bogie1`), or the wheels stay still.', rigid: 'Bogies stays empty. The AnimGraph has a Sequence Evaluator on `Wheels_FullRotation` with time bound to `AxleRotationAlpha`.' },
    { title: 'RVV: what you see and click', stage: 6, state: 'data', hl: ['body', 'cab', 'driver', 'headlight', 'smoke'],
      text: 'The view Blueprint (parent `RailVehicleView`): the skeletal mesh component `SK_RailVehicle`, the UCX component, blockers, one hitbox per control, the seat and the cameras, lights and particles.' },
    { title: 'RVM and the SimuGraph', stage: 6, state: 'data', hl: ['traction', 'wheelset', 'bogie', 'drivewheel', 'frame', 'couplers'],
      text: 'The model Blueprint (parent `RailVehicle`) has no meshes: a `Simulation` component pointing at the SimuGraph, the physics body numbers, couplers, the seat manager and the controls.',
      bogie: 'SimuGraph: two Bogie nodes with opposite X offsets, four Axle nodes with gauge, radius and parent bogie, then PowerInput → Motor → Gearbox and BrakeInput → cylinder → rigging → pads.',
      rigid: 'SimuGraph: Axle nodes only, offsets from the vehicle centre. Thomas fakes steam with an electric motor and a chopper.',
      snippet: { bogie: 'PowerInput ─► Motor ─► Gearbox ─► Axle1\nReverserPosition ··► Motor.ReverseFieldPolarity\nBrakeInput ─► BrakeCylinder ─► BrakeRigging\n           ─► BrakePad_1..4 ─► Axle1..4\nBogie1 (+5.0 m)   Bogie2 (−5.0 m)', rigid: 'PowerInput ─► Motor ─► Gearbox ─► Axle1\nReverserPosition ··► Motor.ReverseFieldPolarity\nBrakeInput ─► BrakeCylinder ─► BrakeRigging\n           ─► BrakePad_1..3 ─► Axle1..3\n(no Bogie nodes)' } },
    { title: 'Controls: VHID pairs', stage: 6, state: 'cab', hl: ['cab', 'door', 'panto', 'horn', 'headlight'],
      text: 'Every control is a pair linked by name: a logic component on the RVM (lever, button, door) and a hitbox on the RVV. The RVM event graph copies each output into the SimuGraph; the ABPs scrub the clips; the RVA plays the sounds.' },
    { title: 'Definition, formation and audio', stage: 7, state: 'data', hl: ['traction', 'horn'],
      text: '`RVD_Name` points at the RVM, RVV and RVA and holds the name, category, max speed and coupling rules. `FRM_Name` lists the RVD so it can be spawned. The RVA needs two cues to start: a running loop and a horn.' },
    { title: 'Play In Editor, then package', stage: 8, state: 'game',
      text: 'Spawn the formation on a route, board, drive. To ship: a ContentManifest in the plugin root, cook with the community packer, Distribute Plugin, copy into the game\'s DLC folder.',
      bogie: 'If it jumps when hauled, two bogie nodes share an offset sign.', rigid: 'If the rods lag, the clip\'s first and last frames differ.' },
  ],
};
