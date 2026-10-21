// "How simulation works": a live driving model with the same moving parts the three engines have.
// It is an illustration of the concepts, not a copy of any engine's code: numbers are typical, not tuned.

const G = 9.81;

export const VEH = {
  bogie: { name: 'Bo-Bo electric', mass: 120, power: 3000, te: 300, vmax: 120 / 3.6, adhesionMass: 120, steam: false },
  rigid: { name: '0-6-0 tank engine', mass: 50, power: 450, te: 95, vmax: 60 / 3.6, adhesionMass: 50, steam: true },
};
const RAIL = { dry: { mu: 0.33, name: 'Dry rail' }, wet: { mu: 0.2, name: 'Wet rail' }, leaves: { mu: 0.1, name: 'Leaves on the line' } };
const SAND = 0.08;

// ---------------------------------------------------------------------------
// text: per game, per topic; and the scripts with per-game implementations
// ---------------------------------------------------------------------------
export const TOPICS = [
  ['input', 'From key to control'], ['power', 'Power'], ['perf', 'Performance: resistance, gradient, adhesion'],
  ['brake', 'Braking'], ['script', 'Where scripting fits'], ['where', 'Where the numbers live'],
];

export const SIMTEXT = {
  tsc: {
    lit: [5, 6, 8],
    input: 'Every key and every cab lever writes a **control value**: a named number on a bus defined in the engine blueprint\'s ControlContainerComponent (`Regulator`, `Reverser`, `TrainBrakeControl`, `Sander`…). The simulation, the Lua script, the cab and exterior animations and the sound blueprints all read that same bus. A cab lever is just an `.ia` animation scrubbed by its control value.',
    power: 'The sim blueprint (`cEngineSimBlueprint`) turns the regulator into force. For an electric: `TractiveEffortVThrottle` maps throttle to a fraction, `TractiveForceVSpeed` shapes it over speed, `MaxForce` scales it. Steam uses the steam subsystem instead: boiler, cylinders, regulator and a `TractiveEffortVsCutoff` curve. Check `MaxForce` units against a known loco: the 7F sample\'s label says lbf but the value is in thousands of lbf {v}.',
    perf: 'The RailVehicleComponent holds mass, drag, rolling friction, wheel-rail friction for dry, wet and snow, and a sand multiplier. The game sums tractive effort, brake force, resistance and the gradient into one acceleration. When demanded force exceeds what the rail can take, the wheels slip.',
    brake: 'The brake subsystem models the pipe and cylinder pressures: moving `TrainBrakeControl` lowers the brake-pipe pressure, the cylinders fill after a delay, and force follows the cylinder pressure (`PressureForMaxForce`). A `TrainBrakeControl` default of 0.7 makes the loco spawn braked {v}.',
    script: 'A Lua engine script sits **on the control bus**. `Update(interval)` runs every frame; `OnControlValueChange(name, index, value)` sees every lever move and decides what reaches the bus. It reads the physics through calls such as `GetSpeed`, `GetGradient`, `GetTractiveEffort` (kN), `GetAcceleration` and `GetTotalMass`, and acts by writing control values. It cannot replace the physics; it shapes the inputs and adds systems around them. AI trains run the same script, so gate player-only logic with `GetIsPlayer`.',
    where: [
      ['Keys and levers', 'ControlContainerComponent: ControlValues, interface elements, keys'],
      ['Power and tractive effort', 'cEngineSimBlueprint: MaxForce, TractiveEffortVThrottle, TractiveForceVSpeed (CSV curves)'],
      ['Mass, drag, friction, sand', 'RailVehicleComponent (engine blueprint)'],
      ['Brakes', 'Brake subsystem in the sim blueprint; CabControlName links it to TrainBrakeControl'],
      ['Behaviour', 'Engine Script Lua: Update, OnControlValueChange'],
    ],
  },
  tf3: {
    lit: [6, 8],
    input: 'There is no driver input in TF3. Trains run on **lines** you draw; the game\'s AI driver accelerates to the line speed and brakes for stations and signals. The desk below is therefore replaced by a target speed: watch the AI use the same physics.',
    power: 'A vehicle\'s performance is a handful of numbers in its metadata: power, tractive effort, top speed and weight {check} for exact field names. The game builds the force curve from them: full tractive effort at low speed, then limited by power, then capped at top speed.',
    perf: 'Resistance, gradients and the train\'s total weight slow it; a train with too little power for its weight and the line\'s gradients cannot keep the line speed. Adhesion and wheelslip are not modelled for the player to manage {check}.',
    brake: 'Braking is applied by the AI from a simple deceleration; you do not author brake systems {check}.',
    script: 'TF3 Lua runs when the game loads or builds things: `mod.lua`, model transformators, construction scripts. There is **no per-frame script on a vehicle**, so nothing can sit between an input and the physics. Features like vigilance or brake fade have no place to live.',
    where: [
      ['Performance', '`.mdl` metadata: power, tractive effort, top speed, weight {check}'],
      ['Who drives', 'The game\'s AI on the lines the player builds'],
      ['Sound with speed', '`soundConfig`: the sound set follows speed'],
      ['Scripts', 'mod.lua and transformators at load time only'],
    ],
  },
  tsw: {
    lit: [5, 6, 7, 8],
    input: 'A key press goes to a **VHID** component on the RVM. Its input identifier (`Throttle`, `SimpleThrottle`, `TrainBrake`) binds the keyboard; the component turns input into output through its value map and notches. The same output drives the HUD, the cab lever clip and the sounds. Keys only work in the interaction environment you occupy.',
    power: 'The RVM event graph copies the lever\'s output into the **SimuGraph** (`PowerInput.InputValue`). The graph is a set of physical nodes integrated every frame with RK4: a voltage source, a chopper, an `ElectricalMotorV2`, a gearbox and the axles. Torque reaches the axles; the physics body moves the vehicle. Thomas shapes the throttle with a `ValueTransition` node before the chopper {v}.',
    perf: 'Each SimuGraph Axle node has a wheel radius and reports speed and rotation; the physics component holds mass, drag, creep (rolling resistance) and buffers. A `SimplePhysics` block (max tractive effort, braking effort, an effort-against-speed curve) is filled even on Thomas and is probably what AI and stored trains use {check}.',
    brake: 'Braking is built from nodes: `DirectBrakeControl` (the driver\'s valve), `BrakeCylinder`, `BrakeRigging` and a `BrakePad` per axle, fed by compressor, reservoirs and pipes; `AirHose` nodes connect to the next vehicle\'s graph when coupled.',
    script: 'Scripting is the **Blueprint event graph** on the RVM. It binds `OnOutputValueChanged` to copy controls into the SimuGraph, registers threshold delegates (told when speed crosses a value instead of polling), and can run every step on `OnPreSimulate`. The rule from the guide: the graph is glue; physics that must integrate over time (heat, pressure, smoothing) belongs in SimuGraph nodes such as `Expression`, `RateOfChange` and `ValueTransition`.',
    where: [
      ['Keys and levers', 'RVM VHID components: InputIdentifier, ValueMap, Notches'],
      ['Power chain', 'SimuGraph (SA_ asset): PowerInput, Motor, Gearbox, Axles'],
      ['Mass, drag, simple physics', 'RVM RailVehiclePhysicsComponent'],
      ['Brakes', 'SimuGraph brake and air nodes; BrakeControl VHID'],
      ['Behaviour', 'RVM event graph (Blueprint); SimuGraph Expression nodes'],
    ],
  },
};

export const SCRIPTS = {
  smooth: {
    name: 'Smoothed throttle', short: 'smooth',
    what: 'The lever moves instantly but the real power value follows at 25% per second, like a notching timer. Notice the operating point lag behind the lever.',
    tsc: { how: 'The virtual control pattern: the cab lever writes a custom control, the script writes the real `Regulator`.', code:
`function OnControlValueChange(name, index, value)
  if name == "VirtualThrottle" then target = value
  elseif Call("*:ControlExists", name, index) == 1 then
    Call("*:SetControlValue", name, index, value)  -- pass the rest through
  end
end
function Update(dt)
  local r = Call("*:GetControlValue", "Regulator", 0)
  r = r + math.max(-0.25*dt, math.min(0.25*dt, target - r))
  Call("*:SetControlValue", "Regulator", 0, r)
end` },
    tf3: null,
    tsw: { how: 'No script needed: put a `ValueTransition` node between the PowerInput converter and the motor, as Thomas does.', code:
`PowerInput (ValueConverter)
  └─► TractionSmoothing (ValueTransition, rate 0.25/s)
        └─► ChopperV2.CurrentPosition ─► Motor ─► Axles` },
  },
  vigilance: {
    name: 'Vigilance (dead-man)', short: 'vigilance',
    what: 'If you touch no control for 20 s while moving, an alarm sounds; press Acknowledge (Q) within 5 s or the brakes go to emergency and power is cut until the train stops.',
    tsc: { how: 'Lua timer in `Update`; any control change resets it; on timeout write the emergency brake.', code:
`function OnControlValueChange(name, index, value)
  idle = 0                                -- any input resets the timer
  Call("*:SetControlValue", name, index, value)
end
function Update(dt)
  if Call("*:GetSpeed") > 1 then idle = idle + dt end
  if idle > 20 then Call("*:SetControlValue", "VigilAlarm", 0, 1) end
  if idle > 25 then
    Call("*:SetControlValue", "Regulator", 0, 0)
    Call("*:SetControlValue", "EmergencyBrake", 0, 1)
  end
end` },
    tf3: null,
    tsw: { how: 'Blueprint on the RVM: reset a timer from every VHID\'s `OnBeginChanging`; on timeout set the brake VHID to emergency. Dovetail\'s stock uses safety-system VHIDs and presets for this {check}.', code:
`Event OnBeginChanging (any VHID) ─► Set IdleTime = 0
Event OnPreSimulate(dt) ─► IdleTime += dt (if speed > 1 m/s)
  IdleTime > 20 ─► VigilanceLamp output = 1, alarm cue
  IdleTime > 25 ─► BrakeControl.SetInputValue(1.0)
                   PowerInput.InputValue = 0` },
  },
  fade: {
    name: 'Brake fade with heat', short: 'fade',
    what: 'Braking turns energy into heat; hot brakes grip less. Hold a long brake on a down gradient and watch the heat rise and the brake force fall.',
    tsc: { how: 'The script integrates brake energy into a heat value and reduces the brake it writes, using the virtual brake control pattern.', code:
`function Update(dt)
  local v  = math.abs(Call("*:GetSpeed"))
  local b  = Call("*:GetControlValue", "VirtualBrake", 0)
  heat = heat + b * v * dt * 0.012            -- energy in
  heat = heat - heat * dt * (0.01 + v*0.0008) -- cooling
  local eff = 1 / (1 + heat)
  Call("*:SetControlValue", "TrainBrakeControl", 0, b * eff)
end` },
    tf3: null,
    tsw: { how: 'Physics that integrates over time belongs in the SimuGraph: an `Expression` node computes heat from pad force and speed, and its output scales the pad friction.', code:
`BrakePad.Force × Axle.SpeedAtRail_MS ─► HeatIn (Expression)
HeatIn ─► BrakeHeat (integrator: Expression + RateOfChange)
BrakeHeat ─► FadeFactor = 1 / (1 + heat) (Expression)
FadeFactor ··► BrakePad.Friction   (parameter link)` },
  },
  autosand: {
    name: 'Wheelslip warning and auto-sand', short: 'autosand',
    what: 'When the wheels slip, a lamp lights and sand goes down automatically, raising adhesion. Try leaves on the line with full power.',
    tsc: { how: 'Read a wheelslip indication from the sim and write the `Sander` control. Many TSC locos expose a `Wheelslip` control value {check}.', code:
`function Update(dt)
  local slip = Call("*:GetControlValue", "Wheelslip", 0)
  if slip > 1 then
    Call("*:SetControlValue", "SlipLamp", 0, 1)
    Call("*:SetControlValue", "Sander", 0, 1)
  else
    Call("*:SetControlValue", "SlipLamp", 0, 0)
  end
end` },
    tf3: null,
    tsw: { how: 'Compare axle speed with ground speed in the SimuGraph (`SpeedAtRail_MS` against `VelocityAtGround_MS`) and drive the sander from the difference, or do it in the RVM graph with a threshold delegate {check}.', code:
`Axle1.SpeedAtRail_MS − Axle1.VelocityAtGround_MS ─► SlipAmount (Expression)
SlipAmount > 0.5 ─► SlipLamp light controller = 1
                 ─► Sander VHID input = 1` },
  },
};

// ---------------------------------------------------------------------------
// the simulator
// ---------------------------------------------------------------------------
export function createSim(root, hooks = {}) {
  const $ = s => root.querySelector(s);
  const flowEl = $('#flow'), teC = $('#tecurve'), trC = $('#trace');
  const ctl = {
    thr: $('#s-thr'), rev: $('#s-rev'), brk: $('#s-brk'), wag: $('#s-wag'), grd: $('#s-grd'), rail: $('#s-rail'),
    thrV: $('#s-thr-v'), revV: $('#s-rev-v'), brkV: $('#s-brk-v'), wagV: $('#s-wag-v'), grdV: $('#s-grd-v'),
    sand: $('#s-sand'), ack: $('#s-ack'), panto: $('#s-panto'), aiV: $('#s-ai'), aiVv: $('#s-ai-v'),
    thrL: $('#s-thr-l'), revL: $('#s-rev-l'), gauges: $('#gauges'), scripts: $('#scripts'), desk: $('#desk-driver'), ai: $('#desk-ai'),
  };
  let game = 'tsc', type = 'bogie', visible = false;
  const S = {
    v: 0, x: 0, lever: 0, real: 0, rev: 1, brakeLever: 0.6, bp: 3.2, bc: 3.2, sand: false, slip: false, wagons: 6, grade: 0, rail: 'dry',
    heat: 0, idle: 0, alarm: 0, emergency: false, scripts: new Set(), te: 0, fb: 0, res: 0, fg: 0, acc: 0, aiTarget: 80, t: 0, trace: [], lastInput: 0, flash: {},
  };

  const css = n => getComputedStyle(root).getPropertyValue(n).trim();
  const veh = () => VEH[type];
  const mass = () => veh().mass + S.wagons * 40;                    // tonnes
  const mu = () => RAIL[S.rail].mu + (S.sand ? SAND : 0);

  // ---------------- physics -------------------------------------------------
  function envelope(v) {                                         // kN available at full demand
    const V = veh();
    return Math.min(V.te, V.power / Math.max(Math.abs(v), 0.5)) * (Math.abs(v) > V.vmax ? Math.max(0, 1 - (Math.abs(v) - V.vmax) * 2) : 1);
  }
  function resistance(v, m) { return (13 * m + 0.4 * m * Math.abs(v) + 6 * v * v) / 1000; }  // kN (Davis form)
  function step(dt) {
    const V = veh(), m = mass();
    S.t += dt;
    // --- inputs → "real" power value (scripts may sit in between) ---
    if (game === 'tf3') aiDriver(dt);
    const smooth = S.scripts.has('smooth') && game !== 'tf3';
    if (smooth) S.real += Math.max(-0.25 * dt, Math.min(0.25 * dt, S.lever - S.real)); else S.real = S.lever;
    // vigilance
    if (S.scripts.has('vigilance') && game !== 'tf3') {
      if (Math.abs(S.v) > 1 && !S.emergency) S.idle += dt;
      if (S.idle > 20 && !S.emergency && !S.alarm) { S.alarm = 1; hooks.alarm?.(); }
      if (S.idle > 25 && !S.emergency) { S.emergency = true; S.alarm = 0; }
    } else { S.idle = 0; S.alarm = 0; S.emergency = false; }
    const power = S.emergency || (type === 'bogie' && !ctl.panto.checked) || S.rev === 0 ? 0 : S.real;
    // --- brakes: pipe and cylinder pressures (bar) ---
    let lever = S.emergency ? 1 : S.brakeLever;
    if (game === 'tf3') { S.bc = lever * 3.8; S.bp = 5 - 1.6 * lever; }   // TF3: no authored brake system, the AI's brake acts directly
    const bpTarget = lever >= 0.98 ? 0 : 5 - 1.6 * lever;
    S.bp += (bpTarget - S.bp) * Math.min(1, dt * (lever >= 0.98 ? 3 : 1.2));
    const bcTarget = Math.min(3.8, Math.max(0, (5 - S.bp) * 1.2));
    const rate = bcTarget > S.bc ? 0.7 : 0.45;                 // bar/s fill, release
    if (game !== 'tf3') S.bc += Math.max(-rate * dt, Math.min(rate * dt, bcTarget - S.bc));
    let brakeEff = 1;
    if (S.scripts.has('fade') && game !== 'tf3') {
      S.heat += (S.bc / 3.8) * Math.abs(S.v) * dt * 0.012;
      S.heat -= S.heat * dt * (0.01 + Math.abs(S.v) * 0.0008);
      brakeEff = 1 / (1 + S.heat);
    } else S.heat = Math.max(0, S.heat - dt * 0.05);
    // --- forces (kN) ---
    const dir = S.rev === 0 ? Math.sign(S.v) || 1 : Math.sign(S.rev);
    let demand = power * envelope(S.v);
    if (V.steam && game !== 'tf3') demand *= Math.min(1, 0.35 + Math.abs(S.rev) * 0.9);    // cutoff: longer cutoff, more effort
    const adh = mu() * V.adhesionMass * G;                      // kN (t·g → kN)
    S.slip = demand > adh && power > 0;
    if (S.scripts.has('autosand') && game !== 'tf3' && S.slip) S.sand = true;
    S.te = S.slip ? adh * 0.65 : demand;
    S.fb = (S.bc / 3.8) * 0.092 * m * G * brakeEff;              // kN; ~0.9 m/s² at full service
    S.res = resistance(S.v, m);
    S.fg = m * G * S.grade / 100;                               // kN, + uphill opposes forward travel
    const fTr = S.te * dir;
    const opp = (S.fb + S.res) * Math.sign(S.v);
    let net = fTr - opp - S.fg;
    if (Math.abs(S.v) < 0.02 && Math.abs(fTr - S.fg) <= S.fb + S.res) { net = 0; S.v = 0; }
    S.acc = net / (m * 1.06);                                   // rotating mass ~6%
    const vOld = S.v;
    S.v += S.acc * dt;
    if (vOld !== 0 && Math.sign(S.v) !== Math.sign(vOld) && Math.abs(fTr) < S.fb + S.res) S.v = 0;
    S.x += S.v * dt;
    if (S.emergency && Math.abs(S.v) < 0.05 && S.ackPending) { S.emergency = false; S.idle = 0; S.ackPending = false; }
    // trace
    if (!S.trace.length || S.t - S.trace[S.trace.length - 1].t > 0.25) {
      S.trace.push({ t: S.t, v: S.v * 3.6, bc: S.bc, te: S.te, heat: S.heat }); if (S.trace.length > 360) S.trace.shift();
    }
  }
  function aiDriver(dt) {
    const target = S.aiTarget / 3.6;
    const err = target - S.v;
    S.rev = 1;
    if (err > 0.5) { S.lever = Math.min(1, S.lever + dt * 0.8); S.brakeLever = 0; }
    else if (err < -1) { S.lever = 0; S.brakeLever = Math.min(0.7, S.brakeLever + dt * 0.5); }
    else { S.lever = Math.max(0, Math.min(1, S.lever + err * dt * 0.4)); S.brakeLever = 0; }
  }

  // ---------------- input ------------------------------------------------------
  function touched(what) {
    S.idle = 0; S.alarm = 0; S.lastInput = S.t; S.flash[what] = S.t;
    hooks.input?.(what);
  }
  function setLever(v) { S.lever = Math.round(Math.max(0, Math.min(1, v)) * 20) / 20; touched('thr'); sync(); }
  function setRev(v) { S.rev = Math.max(-1, Math.min(1, v)); touched('rev'); sync(); }
  function setBrake(v) { S.brakeLever = Math.round(Math.max(0, Math.min(1, v)) * 20) / 20; touched('brk'); sync(); }
  ctl.thr.addEventListener('input', () => setLever(+ctl.thr.value));
  ctl.rev.addEventListener('input', () => setRev(+ctl.rev.value));
  ctl.brk.addEventListener('input', () => setBrake(+ctl.brk.value));
  ctl.wag.addEventListener('input', () => { S.wagons = +ctl.wag.value; sync(); });
  ctl.grd.addEventListener('input', () => { S.grade = +ctl.grd.value; sync(); });
  ctl.rail.addEventListener('change', () => { S.rail = ctl.rail.value; S.sand = false; sync(); });
  ctl.sand.addEventListener('click', () => { S.sand = !S.sand; touched('sand'); sync(); });
  ctl.ack.addEventListener('click', () => acknowledge());
  ctl.panto.addEventListener('change', () => { touched('panto'); sync(); });
  ctl.aiV.addEventListener('input', () => { S.aiTarget = +ctl.aiV.value; sync(); });
  function acknowledge() { touched('ack'); if (S.emergency) S.ackPending = true; }
  function key(e) {
    if (!visible || game === 'tf3' || e.target.closest('input, select, textarea')) return false;
    const k = e.key.toLowerCase();
    if (k === 'a') setLever(S.lever - 0.05); else if (k === 'd') setLever(S.lever + 0.05);
    else if (k === 'w') setRev(type === 'rigid' ? S.rev + 0.25 : S.rev + 1); else if (k === 's') setRev(type === 'rigid' ? S.rev - 0.25 : S.rev - 1);
    else if (k === "'") setBrake(S.brakeLever + 0.1); else if (k === ';') setBrake(S.brakeLever - 0.1);
    else if (k === 'x') { S.sand = !S.sand; touched('sand'); sync(); }
    else if (k === 'q') acknowledge();
    else return false;
    e.preventDefault(); return true;
  }
  window.addEventListener('keydown', key);

  function sync() {
    const V = veh();
    ctl.thr.value = S.lever; ctl.brk.value = S.brakeLever; ctl.wag.value = S.wagons; ctl.grd.value = S.grade; ctl.rail.value = S.rail; ctl.aiV.value = S.aiTarget;
    ctl.rev.min = -1; ctl.rev.max = 1; ctl.rev.step = type === 'rigid' ? 0.05 : 1; ctl.rev.value = S.rev;
    ctl.thrV.textContent = `${Math.round(S.lever * 100)} %`;
    ctl.revV.textContent = type === 'rigid' ? `${S.rev >= 0 ? 'fwd' : 'rev'} ${Math.round(Math.abs(S.rev) * 75)} % cutoff` : (S.rev > 0 ? 'Forward' : S.rev < 0 ? 'Reverse' : 'Neutral');
    ctl.brkV.textContent = S.brakeLever >= 0.98 ? 'Emergency' : S.brakeLever < 0.02 ? 'Release' : `${Math.round(S.brakeLever * 100)} % service`;
    ctl.wagV.textContent = `${S.wagons} × 40 t · train ${Math.round(V.mass + S.wagons * 40)} t`;
    ctl.grdV.textContent = `${S.grade > 0 ? '+' : ''}${S.grade.toFixed(1)} % ${S.grade > 0 ? 'uphill' : S.grade < 0 ? 'downhill' : 'level'}`;
    ctl.aiVv.textContent = `${S.aiTarget} km/h`;
    ctl.thrL.firstChild.textContent = V.steam ? 'Regulator ' : 'Throttle ';
    ctl.revL.firstChild.textContent = V.steam ? 'Reverser / cutoff ' : 'Reverser ';
    ctl.sand.setAttribute('aria-pressed', S.sand ? 'true' : 'false');
    ctl.panto.closest('label').hidden = type !== 'bogie' || game === 'tf3';
    ctl.desk.hidden = game === 'tf3'; ctl.ai.hidden = game !== 'tf3';
    ctl.scripts.querySelectorAll('[data-script]').forEach(b => {
      const on = S.scripts.has(b.dataset.script); b.setAttribute('aria-pressed', on ? 'true' : 'false'); b.disabled = game === 'tf3';
    });
  }
  ctl.scripts.addEventListener('click', e => {
    const b = e.target.closest('[data-script]'); if (!b) return;
    const k = b.dataset.script;
    if (S.scripts.has(k)) S.scripts.delete(k); else S.scripts.add(k);
    if (k === 'fade') S.heat = 0;
    sync(); hooks.scripts?.(k);
  });

  // ---------------- flow diagram (per game) ----------------------------------
  const FLOW = {
    tsc: [
      { id: 'in', t: 'Key A/D · cab lever', s: 'player input', k: 'input' },
      { id: 'cv', t: 'Control value', s: '`Regulator` on the bus', k: 'bus' },
      { id: 'lua', t: 'Lua script', s: 'OnControlValueChange · Update', k: 'script' },
      { id: 'sim', t: 'Sim blueprint', s: 'curves × MaxForce', k: 'sim' },
      { id: 'adh', t: 'Wheel–rail', s: 'friction · sand · slip', k: 'sim' },
      { id: 'phy', t: 'Physics', s: 'forces → speed', k: 'out' },
      { id: 'out', t: 'Wheels · sound · gauges', s: 'read the same values', k: 'out' },
    ],
    tf3: [
      { id: 'in', t: 'Line + timetable', s: 'player builds lines', k: 'input' },
      { id: 'cv', t: 'AI driver', s: 'target = line speed', k: 'bus' },
      { id: 'lua', t: 'No runtime script', s: 'Lua only at load', k: 'script' },
      { id: 'sim', t: 'Metadata numbers', s: 'power · effort · top speed · weight', k: 'sim' },
      { id: 'adh', t: 'Train weight', s: 'gradient · resistance', k: 'sim' },
      { id: 'phy', t: 'Physics', s: 'forces → speed', k: 'out' },
      { id: 'out', t: 'wheels event · sound set', s: 'follow speed', k: 'out' },
    ],
    tsw: [
      { id: 'in', t: 'Key A/D · drag lever', s: 'input identifier', k: 'input' },
      { id: 'cv', t: 'VHID on the RVM', s: 'input → value map → output', k: 'bus' },
      { id: 'lua', t: 'RVM event graph', s: 'Blueprint: Set Simulation Parameter', k: 'script' },
      { id: 'sim', t: 'SimuGraph', s: 'PowerInput → Motor → Gearbox', k: 'sim' },
      { id: 'adh', t: 'Axle nodes', s: 'torque · brake pads · slip', k: 'sim' },
      { id: 'phy', t: 'Physics body', s: 'RK4 each frame', k: 'out' },
      { id: 'out', t: 'ABP · RVA · HUD', s: 'read sim and VHID values', k: 'out' },
    ],
  };
  function buildFlow() {
    const nodes = FLOW[game];
    flowEl.innerHTML = `<div class="fl">${nodes.map((n, i) => `
      <div class="fn k-${n.k} ${n.id === 'lua' && game === 'tf3' ? 'off' : ''}" data-node="${n.id}">
        <b>${n.t}</b><small>${n.s.replace(/`([^`]+)`/g, '<code>$1</code>')}</small><em data-val="${n.id}">–</em>
      </div>${i < nodes.length - 1 ? '<span class="fa" aria-hidden="true"></span>' : ''}`).join('')}</div>
      <div class="fl brk">${(game === 'tf3' ? [['AI braking', 'simple deceleration'], ['Physics', 'speed falls']] :
        game === 'tsc' ? [['Key ; and \'', '`TrainBrakeControl`'], ['Brake subsystem', 'pipe → cylinders'], ['Brake force', 'PressureForMaxForce']] :
          [['Key ; and \'', 'BrakeControl VHID'], ['DirectBrakeControl', 'valve node'], ['Cylinder → rigging → pads', 'per axle']])
        .map((n, i, a) => `<div class="fn k-brake" data-node="b${i}"><b>${n[0]}</b><small>${n[1].replace(/`([^`]+)`/g, '<code>$1</code>')}</small><em data-val="b${i}">–</em></div>${i < a.length - 1 ? '<span class="fa" aria-hidden="true"></span>' : ''}`).join('')}</div>`;
  }
  function updateFlow() {
    const set = (id, t) => { const e = flowEl.querySelector(`[data-val="${id}"]`); if (e) e.textContent = t; };
    const hot = (id, on) => flowEl.querySelector(`[data-node="${id}"]`)?.classList.toggle('hot', on);
    const recent = k => S.t - (S.flash[k] ?? -9) < 0.6;
    const active = [...S.scripts].filter(k => game !== 'tf3');
    if (game === 'tf3') {
      set('in', `${S.aiTarget} km/h line`); set('cv', `power ${Math.round(S.lever * 100)} %`); set('lua', '—');
    } else {
      set('in', `lever ${Math.round(S.lever * 100)} %`);
      set('cv', game === 'tsc' ? `Regulator ${S.real.toFixed(2)}` : `output ${S.real.toFixed(2)}`);
      set('lua', active.length ? active.map(k => SCRIPTS[k].short).join(' · ') : 'pass-through');
    }
    set('sim', `${Math.round(S.te)} kN`);
    set('adh', S.slip ? `SLIP · limit ${Math.round(mu() * veh().adhesionMass * G)} kN` : `limit ${Math.round(mu() * veh().adhesionMass * G)} kN`);
    set('phy', `${(S.v * 3.6).toFixed(1)} km/h · ${S.acc.toFixed(2)} m/s²`);
    set('out', `${Math.round(Math.abs(S.v) / (type === 'bogie' ? 0.55 : 0.66) * 60 / (2 * Math.PI))} rpm`);
    set('b0', game === 'tf3' ? (S.brakeLever > 0 ? 'braking' : '—') : `lever ${Math.round((S.emergency ? 1 : S.brakeLever) * 100)} %`);
    set('b1', game === 'tf3' ? `${(S.v * 3.6).toFixed(0)} km/h` : `pipe ${S.bp.toFixed(1)} · cyl ${S.bc.toFixed(1)} bar`);
    set('b2', `${Math.round(S.fb)} kN${S.scripts.has('fade') && game !== 'tf3' ? ` · fade ×${(1 / (1 + S.heat)).toFixed(2)}` : ''}`);
    hot('in', recent('thr') || recent('rev') || (game === 'tf3' && S.lever > 0));
    hot('cv', recent('thr') || Math.abs(S.real - S.lever) > 0.01);
    hot('lua', active.length > 0);
    hot('sim', S.te > 1); hot('adh', S.slip); hot('phy', Math.abs(S.acc) > 0.02); hot('out', Math.abs(S.v) > 0.1);
    hot('b0', recent('brk') || S.emergency); hot('b1', Math.abs(S.bc - Math.min(3.8, Math.max(0, (5 - S.bp) * 1.2))) > 0.05 || S.bc > 0.1); hot('b2', S.fb > 1);
  }

  // ---------------- charts --------------------------------------------------------
  function fit(c) {
    const r = c.getBoundingClientRect(), d = Math.min(window.devicePixelRatio || 1, 2);
    if (c.width !== Math.round(r.width * d) || c.height !== Math.round(r.height * d)) { c.width = Math.round(r.width * d); c.height = Math.round(r.height * d); }
    const g = c.getContext('2d'); g.setTransform(d, 0, 0, d, 0, 0); return { g, w: r.width, h: r.height };
  }
  function axes(g, w, h, L, B, xmax, ymax, xl, yl, xt, yt) {
    g.strokeStyle = css('--line'); g.fillStyle = css('--muted'); g.lineWidth = 1; g.font = '11px "IBM Plex Mono", monospace';
    for (let x = 0; x <= xmax + 1e-6; x += xt) { const X = L + x / xmax * (w - L - 10); g.beginPath(); g.moveTo(X, 10); g.lineTo(X, h - B); g.stroke(); g.textBaseline = 'top'; g.fillText(String(x), X - 6, h - B + 4); }
    for (let y = 0; y <= ymax + 1e-6; y += yt) { const Y = h - B - y / ymax * (h - B - 10); g.beginPath(); g.moveTo(L, Y); g.lineTo(w - 10, Y); g.stroke(); g.textBaseline = 'middle'; g.fillText(String(y), 4, Y); }
    g.fillStyle = css('--ink'); g.font = '600 12px "Barlow Semi Condensed", sans-serif'; g.textBaseline = 'top';
    g.fillText(xl, w - 10 - g.measureText(xl).width, h - B + 18); g.fillText(yl, L + 4, 12);
  }
  function drawTE() {
    const { g, w, h } = fit(teC);
    g.fillStyle = css('--surface'); g.fillRect(0, 0, w, h);
    const V = veh(), xmax = type === 'bogie' ? 140 : 80, ymax = Math.ceil(V.te * 1.25 / 50) * 50, L = 40, B = 34;
    axes(g, w, h, L, B, xmax, ymax, 'speed km/h', 'force kN', type === 'bogie' ? 20 : 10, ymax > 200 ? 50 : 25);
    const X = kmh => L + kmh / xmax * (w - L - 10), Y = kn => h - B - Math.min(kn, ymax) / ymax * (h - B - 10);
    const line = (fn, color, width, dash) => { g.beginPath(); for (let k = 0; k <= xmax; k += 0.5) { const y = fn(k / 3.6); k ? g.lineTo(X(k), Y(y)) : g.moveTo(X(k), Y(y)); } g.strokeStyle = color; g.lineWidth = width; g.setLineDash(dash || []); g.stroke(); g.setLineDash([]); };
    const m = mass();
    line(v => envelope(v), css('--accent'), 2.5);
    line(v => S.real * envelope(v) * (V.steam && game !== 'tf3' ? Math.min(1, 0.35 + Math.abs(S.rev) * 0.9) : 1), css('--accent'), 1.2, [4, 3]);
    const adh = mu() * V.adhesionMass * G;
    if (game !== 'tf3') line(() => adh, css('--warn-line'), 1.5, [8, 4]);
    line(v => resistance(v, m) + m * G * S.grade / 100, css('--bad'), 1.8, [2, 3]);
    const lab = (t, x, y, c) => { g.fillStyle = c; g.font = '600 11.5px "IBM Plex Mono", monospace'; g.textBaseline = 'bottom'; g.fillText(t, Math.min(x, w - g.measureText(t).width - 12), y); };
    lab('max effort (power-limited)', X(xmax * 0.45), Y(envelope(xmax * 0.45 / 3.6)) - 4, css('--accent'));
    if (game !== 'tf3') lab(`adhesion limit · ${RAIL[S.rail].name.toLowerCase()}${S.sand ? ' + sand' : ''}`, X(xmax * 0.52), Y(adh) - 4, css('--warn-line'));
    lab(`train resistance ${S.grade ? '+ gradient' : ''}`, X(xmax * 0.62), Y(resistance(xmax * 0.62 / 3.6, m) + m * G * S.grade / 100) - 4, css('--bad'));
    // operating point
    const vk = Math.abs(S.v) * 3.6;
    g.beginPath(); g.arc(X(Math.min(vk, xmax)), Y(S.te), 6, 0, Math.PI * 2); g.fillStyle = S.slip ? css('--bad') : css('--ink'); g.fill();
    g.strokeStyle = css('--surface'); g.lineWidth = 2; g.stroke();
    lab(S.slip ? 'wheelslip!' : 'you are here', X(Math.min(vk, xmax)) + 9, Y(S.te) - 6, S.slip ? css('--bad') : css('--ink'));
  }
  function drawTrace() {
    const { g, w, h } = fit(trC);
    g.fillStyle = css('--surface'); g.fillRect(0, 0, w, h);
    const half = Math.round(h * 0.56);
    // speed / cylinder trace (last 90 s)
    const L = 40, B = h - half + 24, xmax = 90, ymax = type === 'bogie' ? 140 : 80;
    axes(g, w, half + 0, L, 24, xmax, ymax, 'seconds ago', 'km/h · bar×20', 15, type === 'bogie' ? 35 : 20);
    const now = S.t, X = t => L + (xmax - (now - t)) / xmax * (w - L - 10), Y = v => half - 24 - Math.min(v, ymax) / ymax * (half - 24 - 10);
    const plot = (key, color, scale = 1) => { g.beginPath(); let first = true; for (const p of S.trace) { if (now - p.t > xmax) continue; const x = X(p.t), y = Y(Math.abs(p[key]) * scale); first ? g.moveTo(x, y) : g.lineTo(x, y); first = false; } g.strokeStyle = color; g.lineWidth = 2; g.stroke(); };
    plot('v', css('--accent')); plot('bc', css('--warn-line'), 20);
    g.font = '600 11.5px "IBM Plex Mono", monospace'; g.textBaseline = 'top';
    g.fillStyle = css('--accent'); g.fillText('speed', w - 120, 14); g.fillStyle = css('--warn-line'); g.fillText('brake cylinder', w - 120, 28);
    // force bars
    const bars = [['traction', S.te, css('--accent')], ['brakes', -S.fb, css('--warn-line')], ['resistance', -S.res, css('--bad')], ['gradient', -S.fg, css('--muted')]];
    const net = S.te * (S.rev === 0 ? 0 : 1) - S.fb - S.res - S.fg;
    bars.push(['net', net, css('--ink')]);
    const top = half + 12, bh = (h - top - 8) / bars.length, mid = L + 70 + (w - L - 90) / 2, sc = (w - L - 100) / 2 / Math.max(veh().te, 50);
    g.strokeStyle = css('--line'); g.beginPath(); g.moveTo(mid, top - 4); g.lineTo(mid, h - 6); g.stroke();
    bars.forEach(([n, val, col], i) => {
      const y = top + i * bh;
      g.fillStyle = css('--muted'); g.font = '12px "Atkinson Hyperlegible", sans-serif'; g.textBaseline = 'middle'; g.fillText(n, 6, y + bh / 2);
      const len = Math.max(-1, Math.min(1, val * sc / ((w - L - 100) / 2))) * (w - L - 100) / 2;
      g.fillStyle = col; g.fillRect(len >= 0 ? mid : mid + len, y + bh * 0.2, Math.abs(len), bh * 0.6);
      g.fillStyle = css('--ink'); g.font = '11px "IBM Plex Mono", monospace';
      const t = `${val >= 0 ? '+' : ''}${Math.round(val)} kN`; g.fillText(t, len >= 0 ? mid + len + 4 : mid + len - g.measureText(t).width - 4, y + bh / 2);
    });
  }
  function gauges() {
    const V = veh();
    const item = (label, val, cls = '') => `<div class="gauge ${cls}"><span>${label}</span><b>${val}</b></div>`;
    const lamp = (label, on, cls) => `<div class="lamp ${on ? 'on ' + cls : ''}"><i></i>${label}</div>`;
    ctl.gauges.innerHTML =
      item('Speed', `${Math.abs(S.v * 3.6).toFixed(1)} <small>km/h</small>`, 'big') +
      item('Tractive effort', `${Math.round(S.te)} <small>kN</small>`) +
      item('Power at rail', `${Math.round(S.te * Math.abs(S.v))} <small>kW</small>`) +
      (V.steam ? '' : item('Ammeter', `${Math.round(S.te * 4.2)} <small>A</small>`)) +
      (game === 'tf3' ? '' : item('Brake pipe', `${S.bp.toFixed(2)} <small>bar</small>`) + item('Brake cylinder', `${S.bc.toFixed(2)} <small>bar</small>`)) +
      (S.scripts.has('fade') && game !== 'tf3' ? item('Brake heat', `${S.heat.toFixed(2)}`, S.heat > 0.6 ? 'warn' : '') : '') +
      `<div class="lamps">${lamp('Wheelslip', S.slip, 'red')}${lamp('Sand', S.sand, 'amber')}${lamp('Vigilance', S.alarm > 0 && Math.floor(S.t * 3) % 2 === 0, 'amber')}${lamp('Emergency', S.emergency, 'red')}</div>`;
  }

  // ---------------- public ----------------------------------------------------------
  let gaugeClock = 0;
  return {
    show(g, t) { game = g; type = t; visible = true; root.hidden = false; buildFlow(); sync(); },
    hide() { visible = false; root.hidden = true; },
    setGame(g) { game = g; buildFlow(); sync(); },
    setType(t) { type = t; S.v = 0; S.lever = 0; S.real = 0; S.rev = t === 'rigid' ? 0.6 : 1; S.trace = []; sync(); },
    reset() { Object.assign(S, { v: 0, x: 0, lever: 0, real: 0, brakeLever: 0.6, bp: 3.2, bc: 3.2, heat: 0, idle: 0, alarm: 0, emergency: false, trace: [], sand: false }); S.rev = type === 'rigid' ? 0.6 : 1; sync(); },
    set(o) {
      if ('lever' in o) setLever(o.lever); if ('rev' in o) setRev(o.rev); if ('brake' in o) setBrake(o.brake);
      for (const k of ['wagons', 'grade', 'rail', 'aiTarget', 'sand']) if (k in o) S[k] = o[k];
      if ('scripts' in o) { S.scripts = new Set(o.scripts); }
      if ('panto' in o) ctl.panto.checked = o.panto;
      if (o.speed !== undefined) S.v = o.speed / 3.6;
      sync();
    },
    key, acknowledge,
    get state() { return { v: S.v * 3.6, te: S.te, fb: S.fb, bc: S.bc, bp: S.bp, slip: S.slip, heat: S.heat, emergency: S.emergency, alarm: S.alarm, real: S.real, lever: S.lever, scripts: [...S.scripts], game, type }; },
    update(dt) {
      if (!visible) return;
      const n = Math.max(1, Math.ceil(dt / (1 / 120)));
      for (let i = 0; i < n; i++) step(dt / n);
      updateFlow(); drawTE(); drawTrace();
      gaugeClock += dt; if (gaugeClock > 0.1) { gaugeClock = 0; gauges(); }
      hooks.tick?.(S);
    },
  };
}

// spoken tours: each step changes the controls, then the narrator explains
export function simTour(game, type) {
  const T = SIMTEXT[game];
  if (game === 'tf3') return [
    { say: T.input, set: { aiTarget: 0, wagons: 6, grade: 0, speed: 0 } },
    { say: 'Set a line speed and the AI applies full power. ' + T.power, set: { aiTarget: type === 'bogie' ? 100 : 50 } },
    { say: 'Watch the force chart: the dot rides along the power curve until resistance and gradient balance it at the line speed.', set: {} },
    { say: 'Add wagons and a gradient: with too little power for the weight, the train cannot hold the line speed. ' + T.perf, set: { wagons: 16, grade: 1.5 } },
    { say: T.script, set: { grade: 0, wagons: 6 } },
  ];
  return [
    { say: 'This is a live driving model with the same parts the engines have. The flow diagram above lights up as a value travels from your key press to the wheels.', set: { lever: 0, brake: 0.6, wagons: 6, grade: 0, rail: 'dry', scripts: [], speed: 0, panto: true } },
    { say: T.input, set: {} },
    { say: 'Release the brakes and open the throttle to half.', set: { brake: 0, lever: 0.5 } },
    { say: T.power, set: { lever: 0.5 } },
    { say: 'On the force chart, the solid line is the most the loco can pull at each speed: flat at maximum effort, then falling as power runs out. The red line is the train\'s resistance. Where they meet is the balancing speed.', set: { lever: 1 } },
    { say: T.perf, set: {} },
    { say: 'Now leaves on the line. Full power asks for more force than the rail can take, and the wheels slip. Sand raises the limit.', set: { rail: 'leaves', lever: 1 } },
    { say: 'Back to dry rail, power off, and a service brake application. The pipe pressure drops first, the cylinders fill after it, and only then does the brake force arrive.', set: { rail: 'dry', lever: 0, brake: 0.6 } },
    { say: T.brake, set: {} },
    { say: T.script, set: { brake: 0, lever: 0.6 } },
    { say: 'Switch on the smoothed throttle script and move the lever: the real power value now follows behind the lever, exactly what a script or a SimuGraph smoothing node adds.', set: { scripts: ['smooth'], lever: 1 } },
    { say: 'Brake fade: on a long downhill with the brakes held, the heat rises and the same lever position gives less force. That behaviour does not exist until a script or a graph node adds it.', set: { scripts: ['fade'], grade: -2, lever: 0, brake: 0.5, speed: 60 } },
  ];
}
