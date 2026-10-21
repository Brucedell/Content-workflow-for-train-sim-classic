// "Bogies on curves": a plan view and a side view that show how each engine carries the body on its
// bogies (or rigid wheelbase), how bogies and wheels turn on straights and curves, and which number
// (a Blender origin or an editor field) decides each pivot. Geometry is exact for a circular curve.

// ---------------------------------------------------------------------------
// track: straight to x = 0, then a left-hand arc of radius R through 90°, then straight again
// ---------------------------------------------------------------------------
const GAUGE = 1.435, RAIL = GAUGE / 2;
const ARC = Math.PI / 2;
function trackAt(s, R) {
  if (s <= 0) return { x: s, y: 0, a: 0 };
  const L = R * ARC;
  if (s <= L) { const t = s / R; return { x: R * Math.sin(t), y: R * (1 - Math.cos(t)), a: t }; }
  return { x: R, y: R + (s - L), a: ARC };
}
// signed distance to the centreline: + toward the inside of the curve
function trackDist(p, R) {
  const c = [];
  if (p.x <= 0) c.push(p.y);
  const vx = p.x, vy = p.y - R, t = Math.atan2(vx, -vy);
  if (t >= 0 && t <= ARC) c.push(R - Math.hypot(vx, vy));
  if (p.y >= R) c.push(R - p.x);
  if (!c.length) c.push(Math.hypot(p.x, p.y));
  return c.reduce((a, b) => Math.abs(b) < Math.abs(a) ? b : a);
}
// rear support position: on the track, behind sf, at chord distance d
function chordBack(sf, d, R) {
  const pf = trackAt(sf, R);
  let lo = sf - d * 1.7, hi = sf - d;
  for (let i = 0; i < 50; i++) {
    const m = (lo + hi) / 2, pm = trackAt(m, R);
    if (Math.hypot(pf.x - pm.x, pf.y - pm.y) > d) lo = m; else hi = m;
  }
  return (lo + hi) / 2;
}
const rot = (x, y, a) => ({ x: x * Math.cos(a) - y * Math.sin(a), y: x * Math.sin(a) + y * Math.cos(a) });
const deg = r => r * 180 / Math.PI;

// ---------------------------------------------------------------------------
// what each slider means in each game
// ---------------------------------------------------------------------------
export const SLIDERS = {
  tsc: { mesh: ['Bogie modelled at', 'Blender: origin of `1_0500_bo01`'], edit: ['BogeyPivotX', 'Blueprint Editor 2: vehicle blueprint, Bogey[] entry'],
         rotAbout: 'edit', physFrom: 'edit', mismatch: { mesh: 5.583, edit: 6.25 }, editShort: 'BogeyPivotX (BPE2)', meshShort: 'bo01 origin (Blender)' },
  tf3: { mesh: ['Bogie geometry centre', 'Blender: where the frame and axles are modelled'], edit: ['Bogie node origin', 'Blender: origin of `bogie_front`, imported by the Model Editor'],
         rotAbout: 'edit', physFrom: 'edit', mismatch: { mesh: 5.6, edit: 4.6 }, editShort: 'bogie_front origin', meshShort: 'bogie geometry (Blender)' },
  tsw: { mesh: ['Bogie bone at', 'Blender rig: bone `bogie1` (the visual bogie)'], edit: ['Bogie1 X offset', 'PC Editor: SimuGraph Bogie node (the physics bogie)'],
         rotAbout: 'mesh', physFrom: 'edit', mismatch: { mesh: 5.0, edit: 5.8 }, editShort: 'SimuGraph Bogie1', meshShort: 'bone bogie1 (rig)' },
};

// ---------------------------------------------------------------------------
// explanations and tours per game
// ---------------------------------------------------------------------------
export const CURVES = {
  tsc: {
    lit: [0, 1, 5],
    intro: 'TSC carries a rigid body on bogie entries listed in the vehicle blueprint. Each bogie follows the track and turns about the pivot the **blueprint** gives it. The XML has the final say; the mesh only decides what is drawn.',
    rows: [
      ['Where the bogie turns', '`BogeyPivotX` in the vehicle blueprint\'s Bogey[] entry (Blueprint Editor 2)', 'The point the game puts on the track and rotates the bogie node about.'],
      ['Where the bogie is drawn', 'Origin and geometry of `1_0500_bo01` in Blender, exported in the .igs', 'Only the picture. If it differs from BogeyPivotX, the bogie swings about the wrong point.'],
      ['Where the axles are', 'Wheelset nodes `bo01wh01…` in the .igs; `HorizontalOffset` in the bogie blueprint', 'The nodes are what you see; the blueprint offset is what the physics uses (±2.2 m on the sample).'],
      ['How fast wheels spin', '`WheelRadius` in the bogie blueprint', 'Spin = speed ÷ radius. It must equal the modelled wheel-centre height (sample: 0.525 mesh vs 0.55 blueprint).'],
      ['Where the body sits', 'Body = a straight chord between the two bogie pivots; `FrontPivotX/BackPivotX` in the vehicle blueprint {check}', 'On a curve the middle hangs inside and the ends swing outside.'],
    ],
    wrong: 'The Kuju sample electric is modelled with its front bogie at 5.583 m but its blueprint pivots it at 6.25 m. On straight track this is invisible. On a curve the bogie turns about a point 0.67 m ahead of its centre, so it is drawn displaced from where the physics carries it and its wheels drift off the rail centre; the tighter the curve, the worse it gets. The Toolkit\'s Measure + Patch writes BogeyPivotX from the mesh so the two always agree.',
    rigid: 'A rigid engine has no turning bogies. The 7F steam sample lists its coupled wheels as one bogie entry at x = 0 with very stiff suspension, and its pony truck as a separate entry {v}. How the game weighs that entry against the body pivots is not documented {check}.',
  },
  tf3: {
    lit: [0, 1, 5, 6],
    intro: 'TF3 has one source of truth: your Blender scene. Any node that holds axle nodes is a bogie, and the game turns it about that node\'s **origin**. There is no separate pivot field to keep in step.',
    rows: [
      ['Where the bogie turns', 'Origin of the `bogie_front` node in Blender (exported in the FBX)', 'The game rotates the bogie node about it to follow the track.'],
      ['Where the bogie is drawn', 'The bogie geometry around that origin', 'If the origin is not on the real pivot, the bogie swings about the wrong point.'],
      ['Where the axles are', 'Axle nodes `w1, w2…` under the bogie; listed in `railVehicle.config.axles`', 'Each axle spins about its own origin; the origin must be centred in x and z or the wheel wobbles.'],
      ['How fast wheels spin', 'The axle mesh radius', 'The game derives spin from speed and the mesh radius.'],
      ['Vehicles without bogies', '`railVehicle.config.fakeBogies` {check}', 'Gives a rigid frame the pivots it needs to follow curves.'],
    ],
    wrong: 'If the bogie node\'s origin is left away from the pivot (here 1 m behind the geometry), the game still turns the node about that origin. On a straight nothing shows; on a curve the wheels swing off the rails. Fix it in Blender: Set Origin on the pivot point, re-export.',
    rigid: 'Without bogie nodes the axles hang straight under `body`. `fakeBogies` give the game two pivots so the frame can follow a curve as one rigid chord {check}.',
  },
  tsw: {
    lit: [1, 5, 6],
    intro: 'TSW keeps two copies of each bogie. The **physics** bogie is a Bogie node in the SimuGraph with an X offset from the vehicle centre; it carries the body along the track. The **visual** bogie is the bone in your skeleton; the Animation Blueprint yaws it by the angle the physics computes. They must sit at the same place.',
    rows: [
      ['Where the body is carried', 'SimuGraph Bogie node X offset (PC Editor, `SA_Name`)', 'The physics puts these points on the track; the body is the chord between them.'],
      ['Where the bogie is drawn and turns', 'Bone `bogie1` in the Blender rig (TSW Export Prep places it at the bogie object\'s origin)', 'The ABP\'s Bogies list yaws this bone about its own position.'],
      ['Which angle it gets', 'ABP Bogies entry: bone `bogie1` ↔ sim node `Bogie1`', 'Without the sim node set, the bone does not turn.'],
      ['Where the axles are', 'Axle bones (visual); SimuGraph Axle nodes with an offset from their parent bogie (physics)', 'Each Axle node has gauge, wheel radius and parent bogie.'],
      ['How fast wheels spin', 'Axle node `WheelRotation_DEG` → ABP Axles list', 'The physics wheel radius decides the angle; the bone just follows it.'],
    ],
    wrong: 'If the bone is at 5.0 m but the SimuGraph offset is 5.8 m, the body is carried at 5.8 m while the bogie is drawn turning about 5.0 m: on a curve the wheels sit off the rails. If both Bogie nodes get the same sign, both supports are at one end and the vehicle jumps when hauled (community stream).',
    rigid: 'Thomas has no bogie nodes and an empty Bogies list {v}. The Axle nodes are children of the body with offsets from the vehicle centre, and the frame is carried by them as one rigid wheelbase.',
  },
};

export function tourFor(game, type) {
  const T = SLIDERS[game];
  const g = CURVES[game];
  const ok = { mesh: 5.0, edit: 5.0 };
  if (type === 'rigid') return [
    { say: 'This is the rigid-frame tank engine seen from above. On straight track all three wheelsets sit on the rail centre and nothing turns.', set: { pos: -14, R: 40 } },
    { say: 'As it enters the curve, the frame cannot bend. It becomes a straight chord between its outer wheelsets.', set: { pos: 6, R: 40 } },
    { say: 'Look at the middle wheelset. It is pushed toward the inside of the curve by the versine of the wheelbase, shown in the readout. Real engines give middle drivers side play or thin flanges; the games simply draw it.', set: { pos: 24, R: 40 } },
    { say: 'Make the curve tighter and the offset grows with the square of the wheelbase. That is why long engines got pony trucks and bogies.', set: { pos: 24, R: 22 } },
    { say: g.rigid, set: { pos: 24, R: 40 } },
  ];
  return [
    { say: 'This is the bogie electric seen from above, on straight track. Body, bogies and wheelsets all line up. Nothing turns, so you cannot tell whether a bogie is in the right place.', set: { pos: -18, R: 60, ...ok } },
    { say: g.intro, set: { pos: -6, R: 60, ...ok } },
    { say: 'Now the front bogie enters the curve. It turns to follow the rails while the body still points straight ahead.', set: { pos: 6, R: 60, ...ok } },
    { say: 'Fully in the curve, the body is a straight chord between the two bogie pivots. Its middle hangs inside the curve and its ends swing outside. Both bogies turn by the same angle in opposite directions relative to the body.', set: { pos: 32, R: 60, ...ok } },
    { say: `The first slider is ${T.mesh[0]}, set in ${T.mesh[1]}. The second is ${T.edit[0]}, set in ${T.edit[1]}. While they agree, the wheels stay on the rails.`, set: { pos: 32, R: 60, ...ok } },
    { say: 'Back on straight track, let them disagree.', set: { pos: -18, R: 60, ...T.mismatch } },
    { say: 'Still on the straight, it looks perfect. That is why this mistake is easy to miss.', set: { pos: -12, R: 60, ...T.mismatch } },
    { say: g.wrong, set: { pos: 32, R: 35, ...T.mismatch } },
    { say: 'Put the two values back together and the wheels return to the rails.', set: { pos: 32, R: 35, ...ok } },
  ];
}

// ---------------------------------------------------------------------------
// the view
// ---------------------------------------------------------------------------
export function createCurves(root, onChange) {
  const plan = root.querySelector('#plan'), side = root.querySelector('#side');
  const read = root.querySelector('#readout');
  const ui = {
    pos: root.querySelector('#c-pos'), R: root.querySelector('#c-r'), mesh: root.querySelector('#c-mesh'), edit: root.querySelector('#c-edit'),
    play: root.querySelector('#c-play'), meshL: root.querySelector('#c-mesh-l'), editL: root.querySelector('#c-edit-l'),
    rv: root.querySelector('#c-r-v'), mv: root.querySelector('#c-mesh-v'), ev: root.querySelector('#c-edit-v'),
    bogieRows: root.querySelectorAll('.c-bogie'),
  };
  const P = { pos: -18, R: 60, mesh: 5.0, edit: 5.0 };
  const target = { ...P };
  let game = 'tsc', type = 'bogie', playing = false, cam = null, visible = false;

  const css = (n) => getComputedStyle(root).getPropertyValue(n).trim();

  function setParams(o, instant) {
    Object.assign(target, o);
    if (instant) Object.assign(P, o);
    syncUI();
  }
  function syncUI() {
    ui.pos.value = target.pos; ui.R.value = target.R; ui.mesh.value = target.mesh; ui.edit.value = target.edit;
    ui.rv.textContent = `${Math.round(target.R)} m`;
    ui.mv.textContent = `${target.mesh.toFixed(3)} m`; ui.ev.textContent = `${target.edit.toFixed(3)} m`;
    const T = SLIDERS[game];
    ui.meshL.innerHTML = `${T.mesh[0]} <small>${T.mesh[1].replace(/`([^`]+)`/g, '<code>$1</code>')}</small>`;
    ui.editL.innerHTML = `${T.edit[0]} <small>${T.edit[1].replace(/`([^`]+)`/g, '<code>$1</code>')}</small>`;
    ui.bogieRows.forEach(r => r.hidden = type !== 'bogie');
    ui.play.textContent = playing ? 'Pause' : 'Drive through';
    ui.play.setAttribute('aria-pressed', playing ? 'true' : 'false');
  }
  for (const k of ['pos', 'R', 'mesh', 'edit']) ui[k].addEventListener('input', () => { target[k] = +ui[k].value; P[k] = target[k]; if (k === 'pos') playing = false; syncUI(); });
  ui.play.addEventListener('click', () => { playing = !playing; if (playing && target.pos > 55) target.pos = P.pos = -25; syncUI(); });
  root.querySelector('#c-ok').addEventListener('click', () => setParams({ mesh: 5.0, edit: 5.0 }));
  root.querySelector('#c-bad').addEventListener('click', () => setParams({ ...SLIDERS[game].mismatch }));

  // ---------------- geometry for the current parameters
  function solve() {
    const R = P.R;
    if (type === 'rigid') {
      const ax = [2.0, 0.2, -1.6];
      const sf = P.pos + ax[0];
      const sr = chordBack(sf, ax[0] - ax[2], R);
      const pf = trackAt(sf, R), pr = trackAt(sr, R);
      const phi = Math.atan2(pf.y - pr.y, pf.x - pr.x);
      const O = { x: pf.x - Math.cos(phi) * ax[0], y: pf.y - Math.sin(phi) * ax[0] };
      const axles = ax.map(x => { const w = { x: O.x + Math.cos(phi) * x, y: O.y + Math.sin(phi) * x }; return { x, w, err: trackDist(w, R) }; });
      const front = { x: O.x + Math.cos(phi) * 4.9, y: O.y + Math.sin(phi) * 4.9 };
      return { O, phi, axles, supports: [pf, pr], mid: trackDist(O, R), end: trackDist(front, R), onCurve: Math.abs(trackAt(sf, R).a - trackAt(sr, R).a) > 1e-4 || trackAt(sf, R).a > 0 };
    }
    const T = SLIDERS[game];
    const phys = P[T.physFrom], about = P[T.rotAbout], mesh = P.mesh;
    const sf = P.pos + phys;
    const sr = chordBack(sf, 2 * phys, R);
    const pf = trackAt(sf, R), pr = trackAt(sr, R);
    const phi = Math.atan2(pf.y - pr.y, pf.x - pr.x);
    const O = { x: pf.x - Math.cos(phi) * phys, y: pf.y - Math.sin(phi) * phys };
    const bogies = [[1, pf], [-1, pr]].map(([s, p]) => {
      const psi = p.a - phi;
      const off = rot((mesh - about) * s, 0, psi);
      const cb = { x: about * s + off.x, y: off.y };                // bogie centre in body frame
      const cw = rot(cb.x, cb.y, phi);
      const c = { x: O.x + cw.x, y: O.y + cw.y };
      const ang = p.a;
      const axles = [1.2, -1.2].map(d => { const w = { x: c.x + Math.cos(ang) * d, y: c.y + Math.sin(ang) * d }; return { w, err: trackDist(w, R) }; });
      return { c, ang, psi, pivot: p, aboutW: (() => { const a = rot(about * s, 0, phi); return { x: O.x + a.x, y: O.y + a.y }; })(), axles };
    });
    const front = { x: O.x + Math.cos(phi) * 8, y: O.y + Math.sin(phi) * 8 };
    return { O, phi, bogies, mid: trackDist(O, R), end: trackDist(front, R) };
  }

  // ---------------- drawing
  function fit(c) {
    const r = c.getBoundingClientRect(), d = Math.min(window.devicePixelRatio || 1, 2);
    if (c.width !== Math.round(r.width * d) || c.height !== Math.round(r.height * d)) { c.width = Math.round(r.width * d); c.height = Math.round(r.height * d); }
    const g = c.getContext('2d'); g.setTransform(d, 0, 0, d, 0, 0); return { g, w: r.width, h: r.height };
  }
  function drawPlan(G) {
    const { g, w, h } = fit(plan);
    const k = Math.min(w / (type === 'bogie' ? 24 : 15), h / (type === 'bogie' ? 11 : 8));
    if (!cam) cam = { x: G.O.x, y: G.O.y };
    cam.x += (G.O.x - cam.x) * 0.25; cam.y += (G.O.y - cam.y) * 0.25;
    const S = (p) => [w / 2 + (p.x - cam.x) * k, h / 2 - (p.y - cam.y) * k];
    g.fillStyle = css('--stage'); g.fillRect(0, 0, w, h);
    const R = P.R;
    // ballast, sleepers, rails
    const sAt = P.pos;
    const path = (off) => { g.beginPath(); for (let s = sAt - 30; s <= sAt + 30; s += 0.4) { const t = trackAt(s, R); const p = { x: t.x - Math.sin(t.a) * off, y: t.y + Math.cos(t.a) * off }; const [X, Y] = S(p); s === sAt - 30 ? g.moveTo(X, Y) : g.lineTo(X, Y); } };
    g.lineCap = 'round';
    path(0); g.strokeStyle = css('--ballast'); g.lineWidth = 3.4 * k; g.stroke();
    g.strokeStyle = css('--sleeper'); g.lineWidth = Math.max(1, 0.22 * k);
    for (let s = Math.floor((sAt - 30) / 0.65) * 0.65; s <= sAt + 30; s += 0.65) {
      const t = trackAt(s, R); const n = { x: -Math.sin(t.a), y: Math.cos(t.a) };
      const [a1, b1] = S({ x: t.x + n.x * 1.3, y: t.y + n.y * 1.3 }), [a2, b2] = S({ x: t.x - n.x * 1.3, y: t.y - n.y * 1.3 });
      g.beginPath(); g.moveTo(a1, b1); g.lineTo(a2, b2); g.stroke();
    }
    g.strokeStyle = css('--rail'); g.lineWidth = Math.max(1.5, 0.08 * k);
    path(RAIL); g.stroke(); path(-RAIL); g.stroke();
    g.setLineDash([4, 5]); g.strokeStyle = css('--muted'); g.lineWidth = 1; path(0); g.stroke(); g.setLineDash([]);
    // curve start / end markers
    for (const [s, txt] of [[0, `curve starts · R = ${Math.round(R)} m`], [R * ARC, 'curve ends']]) {
      const t = trackAt(s, R); const n = { x: -Math.sin(t.a), y: Math.cos(t.a) };
      const [x1, y1] = S({ x: t.x - n.x * 2.2, y: t.y - n.y * 2.2 }), [x2, y2] = S({ x: t.x + n.x * 2.2, y: t.y + n.y * 2.2 });
      g.strokeStyle = css('--accent'); g.lineWidth = 2; g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
      label(g, txt, x1, y1 + 4, css('--accent'), 'top');
    }

    const body = (L0, L1, W, fillVar) => {
      const pts = [[L1, W / 2], [L1, -W / 2], [L0, -W / 2], [L0, W / 2]].map(([x, y]) => { const r = rot(x, y, G.phi); return S({ x: G.O.x + r.x, y: G.O.y + r.y }); });
      g.beginPath(); pts.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.closePath();
      g.fillStyle = css(fillVar); g.globalAlpha = 0.28; g.fill(); g.globalAlpha = 1; g.strokeStyle = css(fillVar); g.lineWidth = 2; g.stroke();
      const [a1, b1] = S({ x: G.O.x + Math.cos(G.phi) * (L0 - 0.8), y: G.O.y + Math.sin(G.phi) * (L0 - 0.8) });
      const [a2, b2] = S({ x: G.O.x + Math.cos(G.phi) * (L1 + 0.8), y: G.O.y + Math.sin(G.phi) * (L1 + 0.8) });
      g.setLineDash([8, 4]); g.strokeStyle = css(fillVar); g.lineWidth = 1.2; g.beginPath(); g.moveTo(a1, b1); g.lineTo(a2, b2); g.stroke(); g.setLineDash([]);
    };
    const box = (c, ang, L, W, stroke, fill) => {
      const pts = [[L / 2, W / 2], [L / 2, -W / 2], [-L / 2, -W / 2], [-L / 2, W / 2]].map(([x, y]) => { const r = rot(x, y, ang); return S({ x: c.x + r.x, y: c.y + r.y }); });
      g.beginPath(); pts.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.closePath();
      if (fill) { g.fillStyle = fill; g.fill(); } g.strokeStyle = stroke; g.lineWidth = 2; g.stroke();
    };
    const wheelset = (wpt, ang, err) => {
      const bad = Math.abs(err) > 0.025;
      const n = { x: -Math.sin(ang), y: Math.cos(ang) };
      const [a1, b1] = S({ x: wpt.x + n.x * 0.85, y: wpt.y + n.y * 0.85 }), [a2, b2] = S({ x: wpt.x - n.x * 0.85, y: wpt.y - n.y * 0.85 });
      g.strokeStyle = css('--axle'); g.lineWidth = Math.max(2, 0.12 * k); g.beginPath(); g.moveTo(a1, b1); g.lineTo(a2, b2); g.stroke();
      for (const sgn of [1, -1]) box({ x: wpt.x + n.x * RAIL * sgn, y: wpt.y + n.y * RAIL * sgn }, ang, 1.0, 0.16, bad ? css('--bad') : css('--ink'), bad ? css('--bad') : css('--ink'));
    };
    const dot = (p, color, r = 5) => { const [x, y] = S(p); g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fillStyle = color; g.fill(); g.strokeStyle = css('--stage'); g.lineWidth = 2; g.stroke(); };
    const tri = (p, color) => { const [x, y] = S(p); g.beginPath(); g.moveTo(x, y - 7); g.lineTo(x + 6, y + 5); g.lineTo(x - 6, y + 5); g.closePath(); g.fillStyle = color; g.fill(); };

    if (type === 'rigid') {
      body(-4.6, 4.9, 2.6, '--bodyc');
      for (const a of G.axles) wheelset(a.w, G.phi, a.err);
      G.supports.forEach((p, i) => dot(p, css('--accent'), 4));
      const m = G.axles[1];
      if (Math.abs(m.err) > 0.003) { const [x, y] = S(m.w); label(g, `middle axle ${Math.round(Math.abs(m.err) * 1000)} mm ${m.err > 0 ? 'inside' : 'outside'}`, x + 10, y - 26, css('--bad'), 'bottom'); }
    } else {
      body(-8, 8, 3.0, '--bodyc');
      const T = SLIDERS[game];
      G.bogies.forEach((b, i) => {
        box(b.c, b.ang, 3.6, 2.5, css('--bogie'), css('--bogie-fill'));
        for (const a of b.axles) wheelset(a.w, b.ang, a.err);
        // markers: physics pivot on the track, rotation point, mesh centre
        tri(b.c, css('--blender'));
        dot(b.pivot, css('--accent'), 5);
        if (Math.hypot(b.aboutW.x - b.pivot.x, b.aboutW.y - b.pivot.y) > 0.05) {
          const [x, y] = S(b.aboutW); g.strokeStyle = css('--bad'); g.lineWidth = 2.5; g.beginPath(); g.moveTo(x - 6, y - 6); g.lineTo(x + 6, y + 6); g.moveTo(x + 6, y - 6); g.lineTo(x - 6, y + 6); g.stroke();
        }
        if (i === 0) {
          const [px, py] = S(b.pivot), [mx, my] = S(b.c);
          label(g, `● ${T.editShort} = ${(P[T.physFrom]).toFixed(2)} m`, px + 12, py - 34, css('--accent'), 'bottom');
          label(g, `▲ ${T.meshShort} = ${P.mesh.toFixed(2)} m`, mx + 12, my + 30, css('--blender'), 'top');
        }
      });
    }
  }
  function label(g, t, x, y, color, base) {
    g.font = '600 12px "IBM Plex Mono", ui-monospace, monospace';
    const wdt = g.measureText(t).width;
    x = Math.max(6, Math.min(x, g.canvas.clientWidth - wdt - 10));
    const yy = Math.max(4, Math.min(base === 'top' ? y : y - 16, g.canvas.clientHeight - 22));
    g.fillStyle = css('--surface'); g.globalAlpha = 0.92; g.fillRect(x - 4, yy - 2, wdt + 8, 18); g.globalAlpha = 1;
    g.fillStyle = color; g.textBaseline = 'top'; g.fillText(t, x, yy + 1);
  }

  function drawSide() {
    const { g, w, h } = fit(side);
    g.fillStyle = css('--surface'); g.fillRect(0, 0, w, h);
    const span = type === 'bogie' ? 22 : 13;
    const railY = h - 34, k = Math.min((w - 40) / span, (railY - 44) / 4.2), X = (x) => w / 2 + x * k, Y = (z) => railY - z * k;
    // ruler
    g.strokeStyle = css('--muted'); g.fillStyle = css('--muted'); g.lineWidth = 1; g.font = '11px "IBM Plex Mono", monospace'; g.textBaseline = 'top';
    g.beginPath(); g.moveTo(X(-span / 2), railY + 1); g.lineTo(X(span / 2), railY + 1); g.stroke();
    for (let x = Math.ceil(-span / 2); x <= span / 2; x++) {
      g.beginPath(); g.moveTo(X(x), railY + 1); g.lineTo(X(x), railY + (x % 5 ? 5 : 9)); g.stroke();
      if (x % 2 === 0) { const t = `${x}`; g.fillText(t, X(x) - g.measureText(t).width / 2, railY + 11); }
    }
    g.fillText('metres from the body origin (+ = front)', X(-span / 2), railY + 22);
    const rect = (x0, x1, z0, z1, stroke, fill) => { g.fillStyle = fill; g.globalAlpha = 0.35; g.fillRect(X(x0), Y(z1), (x1 - x0) * k, (z1 - z0) * k); g.globalAlpha = 1; g.strokeStyle = stroke; g.lineWidth = 1.5; g.strokeRect(X(x0), Y(z1), (x1 - x0) * k, (z1 - z0) * k); };
    const wheel = (x, r) => { g.beginPath(); g.arc(X(x), Y(r), r * k, 0, Math.PI * 2); g.strokeStyle = css('--ink'); g.lineWidth = 1.5; g.stroke(); g.beginPath(); g.arc(X(x), Y(r), 2, 0, Math.PI * 2); g.fillStyle = css('--ink'); g.fill(); };
    const mark = (x, color, text, row, shape) => {
      const yy = 10 + row * 18;
      g.strokeStyle = color; g.setLineDash([3, 3]); g.beginPath(); g.moveTo(X(x), yy + 14); g.lineTo(X(x), railY); g.stroke(); g.setLineDash([]);
      g.fillStyle = color; g.font = '600 11.5px "IBM Plex Mono", monospace';
      const tw = g.measureText(text).width; let tx = X(x) + 9; if (tx + tw > w - 4) tx = X(x) - 6 - tw;
      g.fillText(text, tx, yy);
      g.beginPath(); if (shape === 'tri') { g.moveTo(X(x), yy + 2); g.lineTo(X(x) + 5, yy + 12); g.lineTo(X(x) - 5, yy + 12); } else g.arc(X(x), yy + 7, 5, 0, Math.PI * 2); g.fill();
    };
    if (type === 'rigid') {
      rect(-4.6, 4.9, 1.0, 3.8, css('--bodyc'), css('--bodyc'));
      for (const x of [2.0, 0.2, -1.6]) wheel(x, 0.66);
      mark(2.0, css('--accent'), 'axle1 · 2.0', 0, 'dot'); mark(0.2, css('--bad'), 'axle2 · 0.2 (middle)', 1, 'dot'); mark(-1.6, css('--accent'), 'axle3 · −1.6', 0, 'dot');
      return;
    }
    const T = SLIDERS[game];
    rect(-8, 8, 1.2, 4.1, css('--bodyc'), css('--bodyc'));
    for (const s of [1, -1]) {
      rect(s * P.mesh - 1.8, s * P.mesh + 1.8, 0.66, 1.0, css('--bogie'), css('--bogie-fill'));
      wheel(s * P.mesh + 1.2, 0.55); wheel(s * P.mesh - 1.2, 0.55);
    }
    mark(P.mesh, css('--blender'), `${T.meshShort}: ${P.mesh.toFixed(3)}`, 0, 'tri');
    mark(P[T.physFrom], css('--accent'), `${T.editShort}: ${P[T.physFrom].toFixed(3)}`, 1, 'dot');
    const narrow = w < 640;
    mark(-P.mesh, css('--blender'), narrow ? '' : `${(-P.mesh).toFixed(2)}`, 0, 'tri');
    mark(-P[T.physFrom], css('--accent'), narrow ? '' : `${(-P[T.physFrom]).toFixed(2)}`, 1, 'dot');
  }

  function readout(G) {
    const mm = v => `${Math.round(Math.abs(v) * 1000)} mm`;
    const rows = [];
    const onCurve = type === 'rigid' ? G.onCurve : Math.abs(G.bogies[0].pivot.a) > 1e-4 || Math.abs(G.bogies[1].pivot.a) > 1e-4;
    rows.push(['Track under the vehicle', onCurve ? `curve, R = ${Math.round(P.R)} m` : 'straight']);
    rows.push(['Body heading', `${deg(G.phi).toFixed(1)}°`]);
    if (type === 'bogie') {
      rows.push(['Front bogie turned', `${deg(G.bogies[0].psi).toFixed(1)}° vs body`]);
      rows.push(['Rear bogie turned', `${deg(G.bogies[1].psi).toFixed(1)}° vs body`]);
      const worst = Math.max(...G.bogies.flatMap(b => b.axles.map(a => Math.abs(a.err))));
      rows.push(['Worst wheelset off the rail centre', `<b class="${worst > 0.025 ? 'bad' : 'good'}">${mm(worst)}</b>`]);
    } else {
      rows.push(['Middle axle off the rail centre', `<b class="${Math.abs(G.axles[1].err) > 0.025 ? 'bad' : 'good'}">${mm(G.axles[1].err)}</b>`]);
    }
    rows.push(['Body middle', `${mm(G.mid)} ${G.mid > 0.0005 ? 'inside' : G.mid < -0.0005 ? 'outside' : ''}`]);
    rows.push(['Body front end', `${mm(G.end)} ${G.end < -0.0005 ? 'outside' : G.end > 0.0005 ? 'inside' : ''}`]);
    read.innerHTML = rows.map(([a, b]) => `<div><span>${a}</span><em>${b}</em></div>`).join('');
  }

  let G = null;
  return {
    show(g, t) { game = g; type = t; visible = true; cam = null; root.hidden = false; syncUI(); },
    hide() { visible = false; playing = false; root.hidden = true; },
    setGame(g) { game = g; syncUI(); },
    setType(t) { type = t; cam = null; syncUI(); },
    set: setParams,
    stopPlay() { playing = false; syncUI(); },
    get params() { return { ...P, game, type, playing }; },
    get geometry() { return G; },
    update(dt) {
      if (!visible) return;
      if (playing) { target.pos += dt * 6; if (target.pos > 58) target.pos = -25; P.pos = target.pos; ui.pos.value = P.pos; }
      for (const kk of ['pos', 'R', 'mesh', 'edit']) {
        const d = target[kk] - P[kk];
        P[kk] += Math.abs(d) < 1e-4 ? d : d * Math.min(1, dt * 2.6);
      }
      G = solve();
      drawPlan(G); drawSide(); readout(G);
      onChange?.(G);
    },
  };
}
