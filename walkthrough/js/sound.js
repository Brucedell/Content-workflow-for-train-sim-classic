// "How sound works": a listening lab. Speed, power, brake, curve and where you stand drive
// synthesized layers you can hear, solo and watch. The sounds are made in the browser (Web Audio),
// standing in for the recorded samples a real sound pack uses; the logic that drives them is the point.

const JOINT = 18.3;                               // jointed rail: one gap every 60 ft
const AXLES = { bogie: [6.2, 3.8, -3.8, -6.2], rigid: [2, 0.2, -1.6] };
const LENGTH = { bogie: 16, rigid: 9 };
const VMAX = { bogie: 140, rigid: 80 };
const BANDS = [20, 60, 110];                      // speeds the three motor samples were "recorded" at
const MR_IN = 7.5, MR_OUT = 9.0;                  // compressor cut-in / cut-out, bar
const DRIVER_WHEEL = 1.37;                        // m, tank engine driving wheel diameter

export const LAYERS = [
  { id: 'traction', color: '--accent', bus: 'ext', name: { bogie: 'Traction motors', rigid: 'Exhaust chuffs' }, drive: { bogie: 'speed → pitch · power → volume', rigid: 'wheel turns → chuffs · regulator → volume' } },
  { id: 'aux', color: '--muted', bus: 'ext', name: { bogie: 'Blowers', rigid: 'Boiler and blower' }, drive: { bogie: 'power → fan speed', rigid: 'regulator shut → blower on' } },
  { id: 'roll', color: '--good', bus: 'ext', name: 'Rolling roar', drive: 'speed → volume and brightness' },
  { id: 'joints', color: '--ink', bus: 'ext', name: 'Rail joints', drive: 'distance → a click per axle per joint' },
  { id: 'flange', color: '--bad', bus: 'ext', name: 'Flange squeal', drive: 'curvature × speed' },
  { id: 'brake', color: '--warn-line', bus: 'ext', name: 'Brake friction and squeal', drive: 'brake × speed · squeal near a stand' },
  { id: 'air', color: '--blender', bus: 'ext', name: 'Air: valves and compressor', drive: 'lever moves · reservoir pressure' },
  { id: 'horn', color: '--hi', bus: 'ext', name: { bogie: 'Horn', rigid: 'Whistle' }, drive: 'button held: start, loop, tail' },
];
const pick = (v, type) => (typeof v === 'string' ? v : v[type]);

export const LISTEN = {
  cab: { name: 'In the cab', ext: { gain: 0.45, lp: 750 }, int: 1 },
  side: { name: 'Lineside', ext: { gain: 1, lp: 18000 }, int: 0.25 },
  far: { name: '100 m away', ext: { gain: 0.22, lp: 4000 }, int: 0 },
};

// ---------------------------------------------------------------------------
// text: general topics, then per game
// ---------------------------------------------------------------------------
export const SOUNDTOPICS = [
  ['loops', 'Loops, curves and crossfades', 'A running sound is not one recording. It is a few looping samples recorded at different speeds or power notches. The engine crossfades between them and bends their pitch to fill the gaps, both driven by **curves**: a value in (speed, power, brake), a pitch or a volume out. Select the traction layer: the shaded curves are each sample\'s volume and the line is the pitch.'],
  ['events', 'One-shots and events', 'Doors, the horn, valve exhausts and joint clicks are **one-shots**. They fire when something happens: a control value changes, a threshold is crossed, a distance is reached. A horn is usually three parts: a start, a loop for as long as the button is held, and a tail on release.'],
  ['joints', 'Rail joints: why it goes di-dum, di-dum', 'Jointed rail has a gap every 18.3 m (60 ft) here. Each axle clicks as it crosses a gap, so a bogie\'s two axles give a quick pair, then the next bogie repeats it. The time between clicks is the axle spacing divided by the speed, which is why the rhythm tells your ear the speed. Welded rail has no gaps, so the clicks vanish and only the roar is left. Engines trigger these per axle from distance travelled; they are not a recording of a passing train.'],
  ['flange', 'Curves: flange squeal', 'In a tight curve the wheelsets cannot line up with the rails, so the wheels creep sideways across the rail head and the leading flange rubs the outer rail. The stick-slip rings at a few kilohertz and wavers. It is driven by **curvature and speed**: loudest in tight curves at walking-to-running pace, fading on gentle curves and at speed.'],
  ['brakes', 'Brakes and air', 'Braking is several sounds. **Friction** is a broad rush that grows with brake force and speed. **Squeal** is a tone that appears only as the train slows to a stand. **Air** is separate again: the driver\'s valve exhausts in the cab when you apply, the cylinders vent at the bogies when you release, and the compressor runs when the main reservoir falls below its cut-in pressure, stopping at cut-out.'],
  ['listen', 'Where you listen from', 'The same sources sound different from the cab, the lineside and a distance. **Attenuation** lowers the volume with distance and the air takes the high frequencies first. **Occlusion** is the cab body muffling the outside. Some sounds only exist in one place: the brake valve exhaust is in the cab. Every source has a position on the vehicle and its own attenuation settings.'],
];

export const SOUNDTEXT = {
  tsc: {
    lit: [5, 6, 7],
    intro: 'In TSC, sound is data on the same control bus as everything else. Sound sources are child entities in the engine blueprint\'s `ContainerComponent`, each with a position, so a motor sound sits under the body and a cab sound sits in the cab. Each source points at a sound blueprint: a list of samples, looping or one-shot, and curves that map a value such as `Speed` or a control value to pitch and volume {check}. The game reads those values every frame, so a sound follows the simulation with no script at all.',
    rows: {
      traction: ['Looping samples whose pitch and volume follow speed and the power controls (`Regulator`, `Ammeter`) through the blueprint\'s curves {check}. Steam chuffs are triggered by the steam simulation, timed to wheel rotation {check}.', 'Engine sound blueprint, a child entity of the `ContainerComponent`'],
      aux: ['Loops switched or scaled by control values: blowers, compressor, boiler {check}.', 'Engine sound blueprint'],
      roll: ['A loop rising with speed. The bogie\'s `WheelRadius` sets the wheel spin rate and the running sound with it.', 'Bogie blueprint sound {check}'],
      joints: ['Clicks from distance travelled, per bogie or axle {check}.', 'Bogie blueprint sound {check}'],
      flange: ['A curve on track curvature and speed {check}. Lua reads the same value with `GetCurvature`.', 'Sound blueprint, or a scripted virtual control'],
      brake: ['Curves on the brake controls and speed; squeal is often a virtual control a script computes.', 'Sound blueprint + Lua'],
      air: ['One-shots when a control crosses a value; compressor as a loop on a control the script sets {check}.', 'Sound blueprint + Lua'],
      horn: ['The `Horn` control value: a start, a loop while held, a tail on release {check}.', 'Engine sound blueprint'],
    },
    script: 'Lua drives sound in two ways. It can write a control value the sound blueprint listens to, such as a virtual `BrakeSqueal` computed from speed and brake, or it can address a sound child entity directly with `Call("ControlSound:SetParameter", name, value)`, where `ControlSound` is that child\'s name. One-shots work as one-frame pulses: set a control to 1 for one `Update`, then back to 0. `OnCameraEnter` and `OnCameraLeave` tell the script whether you are in the cab.',
    listen: 'Each source plays in 3D at its child entity\'s position with its own falloff. Cab sounds belong to the cab, and the game switches between cab and exterior sets as the camera moves in and out {check}.',
    files: 'Sound blueprints compile with the rest of the blueprints; the audio itself ships as converted sound files beside them {check}.',
  },
  tf3: {
    lit: [6, 7],
    intro: 'In TF3 there is no driver and you mostly watch from above, so a vehicle\'s sound is **chosen rather than built**. The `.mdl` metadata has `soundConfig = { soundSet = { name = "…/train_electric.snd" }, effects = {…} }`: pick a base-game sound set and override event sounds if you need to. The set holds the running loops, which follow the vehicle\'s speed and power, and its events {check}.',
    rows: {
      traction: ['The sound set\'s engine loops follow speed and power {check}.', '`soundConfig.soundSet` → a `.snd` file'],
      aux: ['Part of the same set {check}.', '`.snd` set'],
      roll: ['The set\'s rolling loop follows speed {check}.', '`.snd` set'],
      joints: ['Come with the set and the track, not authored per vehicle {check}.', 'Base game'],
      flange: ['From the set when the train is in a curve {check}.', 'Base game'],
      brake: ['From the set when the AI brakes {check}.', '`.snd` set'],
      air: ['Set events {check}.', '`.snd` set'],
      horn: ['An event; replace it through `effects` {check}.', '`soundConfig.effects`'],
    },
    script: 'There is no per-frame vehicle script, so nothing can compute a custom sound value while the game runs. Lua at load time (`mod.lua`, transformators) can change which set a model uses, and that is the end of it.',
    listen: 'Distance matters most: you usually hear trains from far above, so the fine detail of joints and squeal is mostly lost and the running loop carries the character {check}.',
    files: 'The `.snd` set lives in the base game; your mod refers to it by path relative to the `.mdl` {check}.',
  },
  tsw: {
    lit: [1, 6, 7],
    intro: 'TSW keeps sound in its own actor, the **RVA** (RailVehicleAudio), listed in the RVD\'s `AdditionalViewActorAssets`. Its AudioComponents play Sound Cues (`SC_`) attached to `Audio*` sockets on the skeleton, and `AudioToViewBindings` re-attaches them when the view respawns. Continuous values (speed, load) reach cue parameters such as `MPH` through float curves (`FC_`), thresholds start and stop sounds, and VHID events fire one-shots. Thomas has 114 sound waves, 15 cues, 6 attenuations and 8 curves {v}.',
    rows: {
      traction: ['Cue parameters (`MPH`, pitch) set from sim values through `FC_` float curves {v}.', 'RVA AudioComponent playing an `SC_` cue'],
      aux: ['Cues started and stopped by thresholds or VHID outputs {check}.', 'RVA'],
      roll: ['Rumble from an actor value binding on speed, shaped by a float curve. One community build borrowed a mineral wagon\'s curve.', 'RVV view component'],
      joints: ['The view component plays a joint clack per axle {v}.', 'RVV view component'],
      flange: ['Rail singing is an ActorValueBinding reading a sim parameter {v}; curve squeal by curvature {check}.', 'RVV view component'],
      brake: ['Brake squeal from curves on friction and on speed in the view component {v}.', 'RVV view component'],
      air: ['One-shots on a VHID\'s `OnOutputValueChanged`; the compressor follows the SimuGraph compressor {check}.', 'RVA event graph'],
      horn: ['Horn held → `SC_Horn` plays while pressed {v}.', 'RVA'],
    },
    script: 'The RVA has its own event graph. It binds a VHID\'s `OnOutputValueChanged` to play a cue (doors, horn) and registers `RailVehicleParameterChangedDelegate` thresholds instead of polling: on Thomas, 2.24 m/s for running and 0.045 m/s for stopped {v}. Anything that must build up over time, such as squeal that grows with brake heat, belongs in the SimuGraph; the audio reads the result.',
    listen: 'Attenuation assets set how each cue falls with distance. A cab occlusion mesh and a `SoundMix` muffle the outside when the camera is in the cab {v}.',
    files: 'Waves, cues and curves live in `Audio/` (`Audio/RVA`, `Audio/Cues`, `Audio/Curves`); a boilerplate needs two cues, a running loop and a horn {v}.',
  },
};

// spoken tours: each step changes the lab, then the narrator explains
export function soundTour(game, type) {
  const T = SOUNDTEXT[game], top = Object.fromEntries(SOUNDTOPICS.map(([k, , t]) => [k, t]));
  const fast = type === 'bogie' ? 70 : 40;
  const steps = [
    { say: 'This is a listening lab. Every layer you hear is driven by the same few values an engine reads: speed, power, brake, curvature and where you stand. ' + T.intro, set: { v: 0, speed: 0, load: 0, brake: 0, radius: 0, welded: false, listener: 'side', sel: 'traction', solo: null, mute: [] } },
    { say: `Power on and away. ${type === 'bogie' ? 'Listen to the motors climb in pitch with speed.' : 'Each chuff is one cylinder exhausting: four per turn of the driving wheels.'} ` + top.loops, set: { load: 0.75, v: fast, sel: 'traction' } },
    { say: 'Now just the rail joints. ' + top.joints, set: { sel: 'joints', solo: 'joints' } },
    { say: 'Welded rail: the clicks stop and the roar stays.', set: { welded: true, solo: null } },
    { say: 'Back to jointed rail, slow down, and into a tight curve. ' + top.flange, set: { welded: false, v: type === 'bogie' ? 25 : 18, radius: 120, sel: 'flange', load: 0.3 } },
    { say: 'Straight again, power off, and a brake application. ' + top.brakes, set: { radius: 0, load: 0, brake: 0.6, v: 0, sel: 'brake' } },
    { say: 'Release the brake: the cylinders vent, the reservoir refills the pipe, and the compressor cuts in. ' + top.events, set: { brake: 0, sel: 'air' } },
    { say: 'Away again, and now from the cab. ' + top.listen, set: { v: fast, load: 0.6, listener: 'cab', sel: 'roll' } },
    { say: 'And from a hundred metres away: quieter, and the top end is gone first.', set: { listener: 'far' } },
    { say: T.listen + ' ' + T.script, set: { listener: 'side' } },
  ];
  return steps;
}

// ---------------------------------------------------------------------------
// the lab
// ---------------------------------------------------------------------------
export function createSound(root, hooks = {}) {
  const $ = s => root.querySelector(s);
  const el = {
    layers: $('#snd-layers'), curve: $('#snd-curve'), strip: $('#snd-strip'), go: $('#snd-go'), horn: $('#snd-horn'),
    v: $('#snd-v'), vV: $('#snd-v-v'), load: $('#snd-load'), loadV: $('#snd-load-v'), brake: $('#snd-brake'), brakeV: $('#snd-brake-v'),
    radius: $('#snd-radius'), rail: $('#snd-rail'), listen: $('#snd-listen'), note: $('#snd-note'), loadL: $('#snd-load-l'),
  };
  let game = 'tsc', type = 'bogie', visible = false;
  const L = {
    v: 0, vTarget: 0, load: 0, brake: 0, radius: 0, welded: false, listener: 'side', sel: 'traction', solo: null, mute: new Set(),
    x: 0, t: 0, mr: 8.6, comp: false, chuff: 0, horn: false, hornT: 0, clicks: [], lvl: {}, peak: {}, sq: [0, 0, 0],
  };
  for (const l of LAYERS) { L.lvl[l.id] = 0; L.peak[l.id] = 0; }
  const css = n => getComputedStyle(root).getPropertyValue(n).trim();

  // ---------------- the model: what each layer should be doing now ----------------
  const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const band = (i, v) => { // triangular crossfade between the three recorded speeds
    const c = BANDS[i], lo = BANDS[i - 1] ?? -1e9, hi = BANDS[i + 1] ?? 1e9;
    if (v <= c) return i === 0 ? 1 : Math.max(0, (v - lo) / (c - lo));
    return i === BANDS.length - 1 ? 1 : Math.max(0, (hi - v) / (hi - c));
  };
  const motorHz = v => 18 + v * 8.2;                       // gear-mesh whine
  const tracVol = (v, load) => (load > 0.02 ? 0.3 + 0.7 * load : 0.12 * smooth(0, 10, v));
  const rollVol = v => Math.pow(Math.min(1, v / 90), 0.8);
  const rollBright = v => 140 + v * 14;
  const flangeVol = (v, R) => (R ? Math.min(1, 70 / R) ** 1.4 * smooth(3, 15, v) * (1 - smooth(45, 90, v) * 0.85) : 0);
  const frictionVol = (v, b) => b * Math.min(1, v / 40) ** 0.7;
  const squealVol = (v, b) => (b > 0.15 && v > 0.3 ? b * (1 - smooth(4, 16, v)) : 0);
  const chuffRate = v => 4 * (v / 3.6) / (Math.PI * DRIVER_WHEEL);   // chuffs per second
  const chuffLen = v => Math.max(0.05, 0.22 - v * 0.0022);
  const auxVol = (load, v) => (type === 'bogie' ? 0.25 + 0.6 * load : 0.25 + 0.5 * (1 - smooth(0, 0.2, load)) * smooth(0, 5, v + 5));

  function model(dt) {
    const prevBrake = L.brakeSeen ?? L.brake;
    // speed eases toward the slider like a train would
    const rate = L.vTarget < L.v ? 6 + L.brake * 10 : 8;
    L.v += Math.sign(L.vTarget - L.v) * Math.min(Math.abs(L.vTarget - L.v), rate * dt);
    L.t += dt; L.x += L.v / 3.6 * dt;
    // brake lever moves → air events, reservoir
    const d = L.brake - prevBrake;
    if (Math.abs(d) > 0.01) {
      if (d > 0) event('air', 'apply', Math.min(1, d * 2.2));
      else { event('air', 'release', Math.min(1, -d * 1.8)); L.mr -= -d * 2.2; }
    }
    L.brakeSeen = L.brake;
    L.mr = Math.max(6.5, L.mr - dt * 0.008);
    if (!L.comp && L.mr < MR_IN) L.comp = true;
    if (L.comp) { L.mr += dt * 0.2; if (L.mr >= MR_OUT) { L.mr = MR_OUT; L.comp = false; } }
    // rail joints: an axle clicks when it crosses a gap
    if (!L.welded && L.v > 0.5) {
      const axles = AXLES[type];
      axles.forEach((a, i) => {
        const before = Math.floor((L.x - L.v / 3.6 * dt + a) / JOINT), after = Math.floor((L.x + a) / JOINT);
        if (after !== before) { L.clicks.push({ t: L.t, i }); event('joints', i, 0.35 + 0.65 * Math.min(1, L.v / 60)); }
      });
    }
    L.clicks = L.clicks.filter(c => L.t - c.t < 4);
    // chuffs
    if (type === 'rigid' && L.v > 0.3) {
      L.chuff += chuffRate(L.v) * dt;
      if (L.chuff >= 1) { L.chuff -= Math.floor(L.chuff); event('traction', 'chuff', L.load > 0.02 ? 0.25 + 0.75 * L.load : 0.08); }
    }
    // continuous levels
    const c = {
      traction: type === 'bogie' ? tracVol(L.v, L.load) * smooth(0, 3, L.v + L.load * 3) : null,
      aux: auxVol(L.load, L.v),
      roll: rollVol(L.v),
      flange: flangeVol(L.v, L.radius),
      brake: Math.max(frictionVol(L.v, L.brake), squealVol(L.v, L.brake)),
      air: L.comp ? 0.55 : null,
      horn: L.horn ? 1 : null,
    };
    for (const l of LAYERS) {
      const id = l.id;
      L.peak[id] = Math.max(0, L.peak[id] - dt * 3);
      L.lvl[id] = Math.max(c[id] ?? 0, L.peak[id]);
    }
    if (L.horn) L.hornT += dt;
  }
  const audible = id => !L.mute.has(id) && (!L.solo || L.solo === id);
  const busGain = (bus) => (bus === 'int' ? LISTEN[L.listener].int : LISTEN[L.listener].ext.gain);
  const heard = id => (audible(id) ? L.lvl[id] * busGain('ext') : 0);

  // ---------------- audio --------------------------------------------------------------
  let ctx = null, A = null;
  function start() {
    if (!ctx) {
      try { ctx = new (window.AudioContext || window.webkitAudioContext)(); build(); } catch { ctx = null; }
    }
    if (ctx?.state === 'suspended') ctx.resume().catch(() => {});
    L.playing = true; syncButtons();
  }
  function stop() {
    L.playing = false; L.horn = false;
    if (ctx && ctx.state === 'running') ctx.suspend().catch(() => {});
    syncButtons();
  }
  function build() {
    const master = ctx.createGain(); master.gain.value = 0.8;
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4;
    master.connect(comp).connect(ctx.destination);
    const ext = ctx.createGain(), extLP = ctx.createBiquadFilter(); extLP.type = 'lowpass'; extLP.frequency.value = 18000;
    ext.connect(extLP).connect(master);
    const int = ctx.createGain(); int.connect(master);
    const nb = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), nd = nb.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    const noise = () => { const s = ctx.createBufferSource(); s.buffer = nb; s.loop = true; s.start(); return s; };
    const filt = (type_, f, q = 0.7) => { const b = ctx.createBiquadFilter(); b.type = type_; b.frequency.value = f; b.Q.value = q; return b; };
    const gain = (v = 0) => { const g = ctx.createGain(); g.gain.value = v; return g; };
    const osc = (type_, f) => { const o = ctx.createOscillator(); o.type = type_; o.frequency.value = f; o.start(); return o; };
    const layer = {}; for (const l of LAYERS) { layer[l.id] = gain(1); layer[l.id].connect(ext); }
    // traction: three "samples" with different timbres, crossfaded
    const bands = BANDS.map((_, i) => {
      const lo = osc('sawtooth', 40), hi = osc(i === 2 ? 'sine' : 'triangle', 160), f = filt('lowpass', [700, 1500, 3200][i], 1.2), g = gain(0);
      const hg = gain([0.25, 0.45, 0.6][i]); lo.connect(f); hi.connect(hg).connect(f); f.connect(g).connect(layer.traction);
      return { lo, hi, g };
    });
    const aux = noise(), auxF = filt('bandpass', 380, 0.8), auxG = gain(0); aux.connect(auxF).connect(auxG).connect(layer.aux);
    const roll = noise(), rollF = filt('lowpass', 200, 0.5), rollF2 = filt('lowpass', 400, 0.5), rollG = gain(0); roll.connect(rollF).connect(rollF2).connect(rollG).connect(layer.roll);
    const sq = [2900, 3450, 4150].map(f => { const o = osc('sine', f), g = gain(0); o.connect(g).connect(layer.flange); return { o, g, f }; });
    const fr = noise(), frF = filt('bandpass', 1200, 0.8), frG = gain(0); fr.connect(frF).connect(frG).connect(layer.brake);
    const bs = osc('sine', 3300), bsG = gain(0); bs.connect(bsG).connect(layer.brake);
    const cp = noise(), cpF = filt('lowpass', 320, 0.9), cpPulse = gain(0.5), cpLfo = osc('square', 6.5), cpDepth = gain(0.5), cpG = gain(0);
    cpLfo.connect(cpDepth).connect(cpPulse.gain); cp.connect(cpF).connect(cpPulse).connect(cpG).connect(layer.air);
    const hornG = gain(0), hornF = filt('lowpass', 2000, 0.7); hornF.connect(hornG).connect(layer.horn);
    const hornOsc = [osc('sawtooth', 311), osc('sawtooth', 370), osc('sine', 740), osc('sine', 1108)], hornMix = hornOsc.map(() => gain(0));
    hornOsc.forEach((o, i) => o.connect(hornMix[i]).connect(hornF));
    A = { master, ext, extLP, int, nb, layer, bands, auxF, auxG, rollF, rollF2, rollG, sq, frF, frG, bs, bsG, cpG, hornG, hornF, hornMix, filt, gain };
  }
  function oneShot(bus, { dur, f, q = 0.8, kind = 'bandpass', g = 0.5, attack = 0.004, low = 0 }) {
    if (!ctx || !A || !L.playing) return;
    const t = ctx.currentTime, s = ctx.createBufferSource(); s.buffer = A.nb;
    const fl = A.filt(kind, f, q), gn = A.gain(0);
    gn.gain.setValueAtTime(0, t); gn.gain.linearRampToValueAtTime(g, t + attack); gn.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    s.connect(fl).connect(gn).connect(bus); s.start(t, Math.random()); s.stop(t + dur + 0.05);
    if (low) { // a low thump under the click
      const o = ctx.createOscillator(), og = A.gain(0); o.frequency.value = low; o.connect(og).connect(bus);
      og.gain.setValueAtTime(0, t); og.gain.linearRampToValueAtTime(g * 0.9, t + 0.005); og.gain.exponentialRampToValueAtTime(0.0008, t + 0.09);
      o.start(t); o.stop(t + 0.12);
    }
  }
  function event(id, what, strength) {
    L.peak[id] = Math.max(L.peak[id], strength);
    if (!audible(id) || !A) return;
    const s = strength;
    if (id === 'joints') oneShot(A.layer.joints, { dur: 0.07, f: what < 2 ? 1900 : 1700, q: 1.4, g: 0.55 * s, low: 70 });
    else if (id === 'traction') oneShot(A.layer.traction, { dur: chuffLen(L.v), f: 650, q: 0.7, g: 0.9 * s, attack: 0.008, low: 55 });
    else if (id === 'air' && what === 'apply') oneShot(A.int, { dur: 0.5 + s * 1.4, f: 2600, q: 0.6, kind: 'highpass', g: 0.35 * s, attack: 0.03 });
    else if (id === 'air') oneShot(A.layer.air, { dur: 0.6 + s * 1.8, f: 3200, q: 0.5, kind: 'highpass', g: 0.45 * s, attack: 0.02 });
  }
  function audioFrame() {
    if (!ctx || !A || !L.playing) return;
    const t = ctx.currentTime, k = 0.06, set = (p, v) => p.setTargetAtTime(v, t, k);
    const Lst = LISTEN[L.listener];
    set(A.ext.gain, Lst.ext.gain); set(A.extLP.frequency, Lst.ext.lp); set(A.int.gain, Lst.int);
    for (const l of LAYERS) set(A.layer[l.id].gain, audible(l.id) ? 1 : 0);
    // traction motors
    const hz = motorHz(L.v), tv = type === 'bogie' ? tracVol(L.v, L.load) * smooth(0, 3, L.v + L.load * 3) : 0;
    A.bands.forEach((b, i) => { set(b.lo.frequency, hz / 4); set(b.hi.frequency, hz); set(b.g.gain, tv * band(i, L.v) * 0.16); });
    set(A.auxF.frequency, type === 'bogie' ? 300 + L.load * 250 : 3000); A.auxF.type = type === 'bogie' ? 'bandpass' : 'highpass';
    set(A.auxG.gain, L.lvl.aux * (type === 'bogie' ? 0.35 : 0.06));
    set(A.rollF.frequency, rollBright(L.v)); set(A.rollF2.frequency, rollBright(L.v) * 2); set(A.rollG.gain, rollVol(L.v) * 1.1);
    const fv = flangeVol(L.v, L.radius);
    A.sq.forEach((s, i) => { L.sq[i] += (Math.random() - 0.5) * 0.5; L.sq[i] *= 0.92; set(s.o.frequency, s.f * (1 + L.sq[i] * 0.02)); set(s.g.gain, fv * 0.05 * Math.max(0, 0.5 + L.sq[i])); });
    set(A.frF.frequency, 900 + L.v * 14); set(A.frG.gain, frictionVol(L.v, L.brake) * 0.5);
    set(A.bsG.gain, squealVol(L.v, L.brake) * 0.05); set(A.bs.frequency, 3200 + Math.sin(L.t * 9) * 40);
    set(A.cpG.gain, L.comp ? 0.5 : 0);
    // horn / whistle: start, loop, tail
    const h = L.horn ? 0.22 : 0; A.hornG.gain.setTargetAtTime(h, t, L.horn ? 0.03 : 0.12);
    const steam = type === 'rigid';
    A.hornMix.forEach((g, i) => set(g.gain, (i < 2) !== steam ? 0.5 : 0)); set(A.hornF.frequency, steam ? 4000 : 1800);
  }

  // ---------------- controls --------------------------------------------------------
  const vmax = () => VMAX[type];
  function sync() {
    el.v.max = vmax(); el.v.value = L.vTarget; el.load.value = L.load; el.brake.value = L.brake;
    el.vV.textContent = `${Math.round(L.v)} km/h${Math.abs(L.v - L.vTarget) > 0.5 ? ` → ${Math.round(L.vTarget)}` : ''}`;
    el.loadV.textContent = `${Math.round(L.load * 100)} %`;
    el.brakeV.textContent = L.brake < 0.02 ? 'Released' : `${Math.round(L.brake * 100)} %`;
    el.loadL.firstChild.textContent = type === 'rigid' ? 'Regulator ' : 'Power ';
    el.radius.value = String(L.radius); el.rail.value = L.welded ? 'welded' : 'jointed';
    el.listen.querySelectorAll('[data-listen]').forEach(b => b.setAttribute('aria-pressed', b.dataset.listen === L.listener ? 'true' : 'false'));
    el.horn.textContent = type === 'rigid' ? 'Whistle (hold)' : 'Horn (hold)';
    buildRows();
  }
  function syncButtons() {
    el.go.textContent = L.playing ? 'Stop listening' : 'Start listening';
    el.go.setAttribute('aria-pressed', L.playing ? 'true' : 'false');
    el.note.textContent = !L.playing ? 'Sound is off. The meters and charts still run, so you can follow it silently.'
      : ctx ? 'Synthesized stand-ins for recorded samples. Headphones help with the joints and the squeal.' : 'This browser blocked audio; the meters and charts still run.';
  }
  el.go.addEventListener('click', () => (L.playing ? stop() : start()));
  el.v.addEventListener('input', () => { L.vTarget = +el.v.value; sync(); });
  el.load.addEventListener('input', () => { L.load = +el.load.value; sync(); });
  el.brake.addEventListener('input', () => { L.brake = +el.brake.value; sync(); });
  el.radius.addEventListener('change', () => { L.radius = +el.radius.value; sync(); });
  el.rail.addEventListener('change', () => { L.welded = el.rail.value === 'welded'; sync(); });
  el.listen.addEventListener('click', e => { const b = e.target.closest('[data-listen]'); if (b) { L.listener = b.dataset.listen; sync(); } });
  const hornOn = e => { e.preventDefault(); if (!L.playing) start(); L.horn = true; L.hornT = 0; };
  const hornOff = () => { L.horn = false; };
  el.horn.addEventListener('pointerdown', hornOn);
  ['pointerup', 'pointerleave', 'pointercancel'].forEach(n => el.horn.addEventListener(n, hornOff));
  el.horn.addEventListener('keydown', e => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) hornOn(e); });
  el.horn.addEventListener('keyup', e => { if (e.key === ' ' || e.key === 'Enter') hornOff(); });

  // layer rows: name (select for the curve chart), what drives it, a meter, mute and solo
  let rowEls = {};
  function buildRows() {
    el.layers.innerHTML = LAYERS.map(l => `
      <div class="lrow${L.sel === l.id ? ' sel' : ''}" data-layer="${l.id}" style="--lc: var(${l.color})">
        <button type="button" class="lname" data-sel="${l.id}" aria-pressed="${L.sel === l.id}"><i></i>${pick(l.name, type)}<small>${pick(l.drive, type)}</small></button>
        <div class="meter" role="meter" aria-label="${pick(l.name, type)} level" aria-valuemin="0" aria-valuemax="100"><b></b></div>
        <button type="button" class="ms" data-mute="${l.id}" aria-pressed="${L.mute.has(l.id)}" title="Mute">M</button>
        <button type="button" class="ms" data-solo="${l.id}" aria-pressed="${L.solo === l.id}" title="Solo">S</button>
      </div>`).join('');
    rowEls = {};
    el.layers.querySelectorAll('[data-layer]').forEach(r => { rowEls[r.dataset.layer] = { row: r, bar: r.querySelector('.meter b'), m: r.querySelector('.meter') }; });
  }
  el.layers.addEventListener('click', e => {
    const s = e.target.closest('[data-sel]'), m = e.target.closest('[data-mute]'), so = e.target.closest('[data-solo]');
    if (s) L.sel = s.dataset.sel;
    if (m) { const id = m.dataset.mute; L.mute.has(id) ? L.mute.delete(id) : L.mute.add(id); }
    if (so) L.solo = L.solo === so.dataset.solo ? null : so.dataset.solo;
    if (s || m || so) { buildRows(); hooks.select?.(L.sel); }
  });
  function meters() {
    for (const l of LAYERS) {
      const r = rowEls[l.id]; if (!r) continue;
      const v = heard(l.id);
      r.bar.style.width = `${Math.round(Math.min(1, v) * 100)}%`;
      r.m.setAttribute('aria-valuenow', String(Math.round(v * 100)));
      r.row.classList.toggle('quiet', !audible(l.id));
    }
  }

  // ---------------- charts ---------------------------------------------------------
  function fit(c) {
    const r = c.getBoundingClientRect(), d = Math.min(window.devicePixelRatio || 1, 2);
    if (c.width !== Math.round(r.width * d) || c.height !== Math.round(r.height * d)) { c.width = Math.round(r.width * d); c.height = Math.round(r.height * d); }
    const g = c.getContext('2d'); g.setTransform(d, 0, 0, d, 0, 0); return { g, w: r.width, h: r.height };
  }
  // what the selected layer's curves look like: the same shape a sound blueprint curve or an FC_ float curve holds
  function curveDef() {
    const vm = vmax(), id = L.sel, nm = pick(LAYERS.find(l => l.id === id).name, type);
    const sp = { xmax: vm, xl: 'speed km/h', x: L.v, xt: vm > 100 ? 20 : 10 };
    if (id === 'traction' && type === 'bogie') return { ...sp, title: `${nm}: three samples crossfaded by speed, pitch follows speed`, fns: [
      ...BANDS.map((b, i) => ({ label: `sample recorded at ${b} km/h`, f: v => band(i, v), fill: true, alpha: [0.18, 0.13, 0.09][i] })),
      { label: 'pitch', f: v => motorHz(v) / motorHz(vm), ink: true, width: 2.2 },
      { label: `volume at ${Math.round(L.load * 100)} % power`, f: v => tracVol(v, L.load), dash: [5, 3] },
    ] };
    if (id === 'traction') return { ...sp, title: `${nm}: four per wheel turn; they shorten and merge at speed`, fns: [
      { label: 'chuffs per second (0–20)', f: v => Math.min(1, chuffRate(v) / 20), ink: true, width: 2.2 },
      { label: 'chuff length', f: v => chuffLen(v) / 0.22 },
      { label: `loudness at ${Math.round(L.load * 100)} % regulator`, f: () => (L.load > 0.02 ? 0.25 + 0.75 * L.load : 0.08), dash: [5, 3] },
    ], value: `${chuffRate(L.v).toFixed(1)} chuffs/s` };
    if (id === 'aux') return type === 'bogie'
      ? { xmax: 100, xl: 'power %', x: L.load * 100, xt: 20, title: `${nm}: fans speed up with motor current`, fns: [{ label: 'fan volume', f: p => 0.25 + 0.6 * p / 100, ink: true, width: 2.2 }] }
      : { xmax: 100, xl: 'regulator %', x: L.load * 100, xt: 20, title: `${nm}: the blower is opened when the regulator shuts`, fns: [{ label: 'blower hiss', f: p => 0.25 + 0.5 * (1 - smooth(0, 20, p)), ink: true, width: 2.2 }] };
    if (id === 'roll') return { ...sp, title: `${nm}: louder and brighter with speed`, fns: [
      { label: 'volume', f: rollVol, ink: true, width: 2.2 }, { label: 'brightness (filter cutoff)', f: v => rollBright(v) / rollBright(vm), dash: [5, 3] }] };
    if (id === 'joints') return { ...sp, title: L.welded ? `${nm}: welded rail, no joints to click over` : `${nm}: clicks per axle per second, and how hard they hit`, fns: [
      { label: 'clicks per axle per second (0–2.5)', f: v => (L.welded ? 0 : Math.min(1, v / 3.6 / JOINT / 2.5)), ink: true, width: 2.2 },
      { label: 'click strength', f: v => (L.welded ? 0 : 0.35 + 0.65 * Math.min(1, v / 60)), dash: [5, 3] }],
      value: L.welded ? 'welded' : `${(L.v / 3.6 / JOINT * AXLES[type].length).toFixed(1)} clicks/s` };
    if (id === 'flange') return { ...sp, title: L.radius ? `${nm}: in a ${L.radius} m curve, against speed` : `${nm}: on straight track there is none; try a curve`, fns: [
      { label: L.radius ? `${L.radius} m curve` : 'straight', f: v => flangeVol(v, L.radius), ink: true, width: 2.2 },
      { label: '80 m curve', f: v => flangeVol(v, 80), dash: [5, 3] }, { label: '300 m curve', f: v => flangeVol(v, 300), dash: [2, 3] }] };
    if (id === 'brake') return { ...sp, title: `${nm}: at ${Math.round(L.brake * 100)} % brake`, fns: [
      { label: 'friction rush', f: v => frictionVol(v, L.brake || 0.6), ink: true, width: 2.2 },
      { label: 'squeal near a stand', f: v => squealVol(v, L.brake || 0.6), dash: [5, 3] }],
      value: L.brake ? '' : '(drawn at 60 % until you brake)' };
    if (id === 'air') return { xmax: 9.5, xmin: 6.5, xl: 'main reservoir bar', x: L.mr, xt: 0.5, title: `${nm}: the compressor ${L.comp ? 'is running, filling to cut-out' : 'is stopped until cut-in'}`, fns: [
      { label: 'running: stays on until cut-out', f: p => (p <= MR_OUT ? 0.9 : NaN), ink: true, width: 2.2, dot: L.comp },
      { label: 'stopped: stays off until cut-in', f: p => (p >= MR_IN ? 0.1 : NaN), width: 2.2, dot: !L.comp }],
      marks: [[MR_IN, 'cut-in'], [MR_OUT, 'cut-out']], value: `${L.mr.toFixed(2)} bar` };
    return { xmax: 3, xl: 'seconds since the button went down', x: L.horn ? Math.min(3, L.hornT) : 0, xt: 0.5, title: `${nm}: start, loop while held, tail on release`, fns: [
      { label: 'start sample', f: s => (s < 0.25 ? 1 - s / 0.25 * 0.6 : 0), ink: true, width: 2.2 },
      { label: 'loop (while held)', f: s => smooth(0.1, 0.3, s) * (1 - smooth(2.2, 2.4, s)) * 0.8 },
      { label: 'tail (after release at 2.3 s)', f: s => (s > 2.2 ? 0.7 * Math.exp(-(s - 2.3) * 3) * smooth(2.2, 2.35, s) : 0), dash: [5, 3] }] };
  }
  function drawCurve() {
    const { g, w, h } = fit(el.curve), D = curveDef();
    g.fillStyle = css('--surface'); g.fillRect(0, 0, w, h);
    g.font = '11px "Atkinson Hyperlegible", sans-serif';
    const legend = []; let lx = 8, ly = 30;
    for (const f of D.fns) { const tw = g.measureText(f.label).width; if (lx > 8 && lx + tw + 26 > w) { lx = 8; ly += 15; } legend.push([f, lx, ly]); lx += tw + 30; }
    const Lp = 34, R = 12, T = ly + 14, B = 30, x0 = D.xmin || 0;
    const X = x => Lp + (x - x0) / (D.xmax - x0) * (w - Lp - R), Y = y => h - B - y * (h - B - T);
    g.font = '11px "IBM Plex Mono", monospace'; g.strokeStyle = css('--line'); g.fillStyle = css('--muted'); g.lineWidth = 1;
    for (let x = x0; x <= D.xmax + 1e-6; x += D.xt) { g.beginPath(); g.moveTo(X(x), T); g.lineTo(X(x), h - B); g.stroke(); g.textBaseline = 'top'; const s = String(+x.toFixed(1)); g.fillText(s, X(x) - g.measureText(s).width / 2, h - B + 4); }
    for (const y of [0, 0.5, 1]) { g.beginPath(); g.moveTo(Lp, Y(y)); g.lineTo(w - R, Y(y)); g.stroke(); g.textBaseline = 'middle'; g.fillText(y ? (y === 1 ? 'max' : '½') : '0', 4, Y(y)); }
    g.fillStyle = css('--ink'); g.font = '600 13px "Barlow Semi Condensed", sans-serif'; g.textBaseline = 'top';
    g.fillText(D.title, 8, 6, w - 16);
    g.font = '600 11.5px "Barlow Semi Condensed", sans-serif'; g.fillStyle = css('--muted');
    g.fillText(D.xl, w - R - g.measureText(D.xl).width, h - B + 16);
    const col = css(LAYERS.find(l => l.id === L.sel).color), ink = css('--ink');
    // legend
    g.font = '11px "Atkinson Hyperlegible", sans-serif';
    for (const [f, x, y] of legend) {
      const c = f.ink ? ink : col;
      g.strokeStyle = c; g.lineWidth = 2; g.setLineDash(f.dash || []); g.beginPath(); g.moveTo(x, y); g.lineTo(x + 14, y); g.stroke(); g.setLineDash([]);
      g.fillStyle = css('--muted'); g.textBaseline = 'middle'; g.fillText(f.label, x + 18, y);
    }
    for (const [mx, ml] of D.marks || []) {
      g.strokeStyle = css('--muted'); g.setLineDash([3, 3]); g.beginPath(); g.moveTo(X(mx), T); g.lineTo(X(mx), h - B); g.stroke(); g.setLineDash([]);
      g.fillStyle = css('--muted'); g.textBaseline = 'bottom'; g.fillText(ml, X(mx) + 3, h - B - 2);
    }
    for (const f of D.fns) {
      const c = f.ink ? ink : col; g.beginPath();
      let pen = false;
      for (let i = 0; i <= 160; i++) {
        const x = x0 + (D.xmax - x0) * i / 160, raw = f.f(x);
        if (Number.isNaN(raw)) { pen = false; continue; }
        const y = Math.max(0, Math.min(1, raw)); pen ? g.lineTo(X(x), Y(y)) : g.moveTo(X(x), Y(y)); pen = true;
      }
      if (f.fill) { g.lineTo(X(D.xmax), Y(0)); g.lineTo(X(x0), Y(0)); g.closePath(); g.globalAlpha = f.alpha; g.fillStyle = c; g.fill(); g.globalAlpha = 1; }
      g.strokeStyle = c; g.lineWidth = f.width || 1.6; g.setLineDash(f.dash || []); g.stroke(); g.setLineDash([]);
    }
    // operating point
    const px = Math.max(x0, Math.min(D.xmax, D.x));
    g.strokeStyle = ink; g.lineWidth = 1.5; g.beginPath(); g.moveTo(X(px), T); g.lineTo(X(px), h - B); g.stroke();
    for (const f of D.fns) { const raw = f.f(px); if (f.dot === false || Number.isNaN(raw)) continue; const y = Math.max(0, Math.min(1, raw)); g.beginPath(); g.arc(X(px), Y(y), 4, 0, Math.PI * 2); g.fillStyle = f.ink ? ink : col; g.fill(); }
    const lab = `now: ${D.value || `${Math.round(D.x)} ${D.xl.split(' ')[0] === 'speed' ? 'km/h' : ''}`}`.trim();
    g.font = '600 11.5px "IBM Plex Mono", monospace'; g.fillStyle = ink; g.textBaseline = 'top';
    const lw = g.measureText(lab).width; g.fillText(lab, Math.min(Math.max(Lp, X(px) + 6), w - R - lw), T + 2);
  }
  // the joint strip: the vehicle over jointed track, and the rhythm of clicks it makes
  function drawStrip() {
    const { g, w, h } = fit(el.strip);
    g.fillStyle = css('--surface'); g.fillRect(0, 0, w, h);
    const axles = AXLES[type], top = Math.round(h * 0.46), scale = Math.min(14, (w - 40) / 46), cx = w / 2;
    const XM = m => cx + m * scale;
    // track: two rails with gaps at joints, moving under a fixed vehicle
    const r1 = top * 0.62, r2 = top * 0.86;
    g.strokeStyle = css('--rail'); g.lineWidth = 3;
    g.beginPath(); g.moveTo(0, r1); g.lineTo(w, r1); g.moveTo(0, r2); g.lineTo(w, r2); g.stroke();
    if (!L.welded) {
      const first = Math.floor((L.x - cx / scale) / JOINT) - 1;
      for (let j = first; j < first + w / scale / JOINT + 3; j++) {
        const X = XM(j * JOINT - L.x);
        g.fillStyle = css('--surface'); g.fillRect(X - 2, r1 - 3, 4, 6); g.fillRect(X - 2, r2 - 3, 4, 6);
        g.strokeStyle = css('--muted'); g.lineWidth = 1; g.beginPath(); g.moveTo(X, r1 - 8); g.lineTo(X, r2 + 8); g.stroke();
      }
    }
    // body and axles
    const len = LENGTH[type];
    g.fillStyle = css('--bogie-fill'); g.strokeStyle = css('--bodyc'); g.lineWidth = 1.5;
    g.fillRect(XM(-len / 2), r1 - 26, len * scale, 18); g.strokeRect(XM(-len / 2), r1 - 26, len * scale, 18);
    g.font = '600 11.5px "Barlow Semi Condensed", sans-serif'; g.fillStyle = css('--ink'); g.textBaseline = 'middle';
    g.fillText('→ direction of travel', XM(len / 2) + 8, r1 - 17);
    const recent = new Map(); for (const c of L.clicks) if (L.t - c.t < 0.18) recent.set(c.i, true);
    axles.forEach((a, i) => {
      g.beginPath(); g.arc(XM(a), (r1 + r2) / 2, recent.has(i) ? 7 : 5, 0, Math.PI * 2);
      g.fillStyle = recent.has(i) ? css('--hi') : css('--axle'); g.fill();
    });
    g.fillStyle = css('--muted'); g.font = '11px "IBM Plex Mono", monospace'; g.textBaseline = 'top';
    g.fillText(L.welded ? 'welded rail: no joints' : `joints every ${JOINT} m`, 8, 8);
    // timeline: last 3 s, one row per axle
    const t0 = top + 10, rows = axles.length, rh = (h - t0 - 22) / rows, span = 3, LW = 100, TX = t => LW + (span - (L.t - t)) / span * (w - LW - 10);
    g.strokeStyle = css('--line'); g.lineWidth = 1;
    for (let i = 0; i < rows; i++) {
      const y = t0 + i * rh + rh / 2;
      g.beginPath(); g.moveTo(LW, y); g.lineTo(w - 10, y); g.stroke();
      g.fillStyle = css('--muted'); g.textBaseline = 'middle'; g.fillText(type === 'bogie' ? `${i < 2 ? 'front' : 'rear'} bogie ${i % 2 + 1}` : `axle ${i + 1}`, 4, y);
    }
    for (const c of L.clicks) {
      if (L.t - c.t > span) continue;
      const x = TX(c.t), y = t0 + c.i * rh + rh / 2;
      g.fillStyle = css('--ink'); g.fillRect(x - 1.5, y - rh * 0.36, 3, rh * 0.72);
    }
    g.fillStyle = css('--muted'); g.textBaseline = 'bottom';
    const ms = d => (L.v > 1 ? `${Math.round(d / (L.v / 3.6) * 1000)} ms` : '–');
    const gaps = type === 'bogie' ? `di-dum gap ${ms(2.4)} (2.4 m ÷ speed) · bogie to bogie ${ms(10)}` : `axle to axle ${ms(1.8)} (1.8 m ÷ speed)`;
    const narrow = type === 'bogie' ? `di-dum ${ms(2.4)} · bogies ${ms(10)}` : `axle to axle ${ms(1.8)}`;
    g.fillText(w < 560 ? narrow : `last 3 s · ${gaps}`, w < 560 ? 8 : LW, h - 4);
  }

  // ---------------- public ----------------------------------------------------------
  return {
    show(g, t) { game = g; type = t; visible = true; root.hidden = false; sync(); syncButtons(); },
    hide() { visible = false; root.hidden = true; stop(); },
    setGame(g) { game = g; },
    setType(t) { type = t; L.v = L.vTarget = Math.min(L.vTarget, VMAX[t]); L.clicks = []; sync(); },
    start, stop,
    set(o) {
      if ('v' in o) L.vTarget = Math.min(o.v, vmax());
      for (const k of ['load', 'brake', 'radius', 'welded', 'listener', 'sel', 'solo']) if (k in o) L[k] = o[k];
      if ('mute' in o) L.mute = new Set(o.mute);
      if ('speed' in o) L.v = L.vTarget = o.speed;
      sync();
    },
    horn(on) { L.horn = on; L.hornT = 0; },
    get state() {
      return { v: L.v, vTarget: L.vTarget, load: L.load, brake: L.brake, radius: L.radius, welded: L.welded, listener: L.listener, sel: L.sel, solo: L.solo,
        mr: L.mr, comp: L.comp, clicks: L.clicks.length, playing: !!L.playing, audio: ctx?.state || 'none',
        lvl: Object.fromEntries(LAYERS.map(l => [l.id, +heard(l.id).toFixed(3)])) };
    },
    update(dt) {
      if (!visible) return;
      const n = Math.max(1, Math.ceil(dt / (1 / 120)));
      for (let i = 0; i < n; i++) model(dt / n);
      audioFrame(); meters(); drawCurve(); drawStrip();
      if (Math.abs(L.v - L.vTarget) > 0.05 || +el.vV.dataset.v !== Math.round(L.v)) { el.vV.dataset.v = Math.round(L.v); el.vV.textContent = `${Math.round(L.v)} km/h${Math.abs(L.v - L.vTarget) > 0.5 ? ` → ${Math.round(L.vTarget)}` : ''}`; }
    },
  };
}
