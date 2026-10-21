// Procedural locomotives for the walkthrough.
// Axes: X forward (front of the loco at +X), Y up, Z to the right. Units: metres.
// Every clickable mesh carries userData.partId; moving parts sit under a pivot group
// placed on the hinge / axle, exactly the "origin on the hinge" rule of the guides.
import * as THREE from 'three';

const COLORS = {
  electric: { paint: 0x2f5d8a, stripe: 0xe9dfc4, roof: 0x5d6670, dark: 0x262a30, metal: 0x8d949c, glass: 0x9cc6e2,
              lamp: 0xfff2c4, red: 0xc23a2e, beam: 0x9b2a24, brass: 0xc9a347, accent: 0xffc83d },
  steam:    { paint: 0x2e5a3c, stripe: 0xd9b45a, roof: 0x1d2124, dark: 0x1d2124, metal: 0x8d949c, glass: 0x9cc6e2,
              lamp: 0xf4f1e6, red: 0xc23a2e, beam: 0x9b2a24, brass: 0xc9a347, accent: 0xffc83d },
};

// ---------------------------------------------------------------------------
// materials: three looks per mesh (painted, clay, uv checker); built lazily
// ---------------------------------------------------------------------------
let checkerTex = null;
function checker() {
  if (checkerTex) return checkerTex;
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  const cols = ['#d84a3a', '#e3a12f', '#5aa84a', '#3a86c8', '#8a5ac8', '#d0507c', '#3fb3a6', '#c6c03a'];
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    g.fillStyle = cols[(x + y) % 8]; g.globalAlpha = (x + y) % 2 ? 1 : 0.72;
    g.fillRect(x * 32, y * 32, 32, 32);
    g.globalAlpha = 1; g.fillStyle = 'rgba(255,255,255,.9)'; g.font = 'bold 11px sans-serif';
    g.fillText(String.fromCharCode(65 + x) + (8 - y), x * 32 + 8, y * 32 + 20);
  }
  checkerTex = new THREE.CanvasTexture(c);
  checkerTex.colorSpace = THREE.SRGBColorSpace;
  checkerTex.wrapS = checkerTex.wrapT = THREE.RepeatWrapping;
  return checkerTex;
}

function makeMaterial(look, role, pal) {
  if (look === 'clay') return new THREE.MeshStandardMaterial({ color: role === 'glass' ? 0xd7dade : 0xbfc3c9, roughness: 0.85, metalness: 0,
    transparent: role === 'glass', opacity: role === 'glass' ? 0.55 : 1 });
  if (look === 'checker' && role !== 'glass' && role !== 'lamp' && role !== 'red')
    return new THREE.MeshStandardMaterial({ map: checker(), roughness: 0.7 });
  const col = pal[role] ?? pal.paint;
  const m = new THREE.MeshStandardMaterial({ color: col, roughness: role === 'metal' || role === 'brass' ? 0.35 : 0.6,
    metalness: role === 'metal' || role === 'brass' ? 0.6 : 0.05 });
  if (role === 'glass') { m.transparent = true; m.opacity = 0.42; m.roughness = 0.1; }
  if (role === 'lamp' || role === 'red') { m.emissive = new THREE.Color(col); m.emissiveIntensity = 0.0; }
  return m;
}

export function applyLook(vehicle, look) {
  vehicle.look = look;
  vehicle.root.traverse(o => {
    if (!o.isMesh || !o.userData.role) return;
    const u = o.userData;
    u.mats = u.mats || {};
    if (!u.mats[look]) u.mats[look] = makeMaterial(look, u.role, vehicle.pal);
    o.material = u.mats[look];
  });
}

// ---------------------------------------------------------------------------
// small geometry helpers
// ---------------------------------------------------------------------------
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const cylX = (r, len, seg = 20) => { const g = new THREE.CylinderGeometry(r, r, len, seg); g.rotateZ(Math.PI / 2); return g; };
const cylY = (r, h, seg = 16) => new THREE.CylinderGeometry(r, r, h, seg);
const cylZ = (r, len, seg = 24) => { const g = new THREE.CylinderGeometry(r, r, len, seg); g.rotateX(Math.PI / 2); return g; };

function numberTexture(text, bg, fg) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 96;
  const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, 256, 96);
  g.strokeStyle = fg; g.lineWidth = 6; g.strokeRect(6, 6, 244, 84);
  g.fillStyle = fg; g.font = 'bold 54px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 128, 52);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

function speakerSprite(color) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = color; g.beginPath(); g.arc(64, 64, 60, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#10151b';
  g.beginPath(); g.moveTo(30, 52); g.lineTo(48, 52); g.lineTo(70, 32); g.lineTo(70, 96); g.lineTo(48, 76); g.lineTo(30, 76); g.closePath(); g.fill();
  g.strokeStyle = '#10151b'; g.lineWidth = 7; g.lineCap = 'round';
  g.beginPath(); g.arc(70, 64, 20, -0.8, 0.8); g.stroke();
  g.beginPath(); g.arc(70, 64, 34, -0.8, 0.8); g.stroke();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true }));
  s.scale.set(0.7, 0.7, 0.7); s.renderOrder = 10;
  return s;
}

// ---------------------------------------------------------------------------
// the builder
// ---------------------------------------------------------------------------
export function buildVehicle(type, { detail = true } = {}) {
  const pal = COLORS[type === 'bogie' ? 'electric' : 'steam'];
  const root = new THREE.Group(); root.name = 'vehicle';
  const parts = {};
  const bones = [];      // TSW view: {name, obj, parent}
  const sockets = [];    // TSW view: {name, obj}
  const pivots = [];     // origins worth showing: {partId, obj}
  const v = { type, root, parts, bones, sockets, pivots, pal, look: 'paint', anim: null, detail };

  const part = (id, kind, label, cat, names) => {
    parts[id] = { id, kind, label, cat, names, objects: [], anchor: null };
    return parts[id];
  };
  const add = (pid, geom, role, parent = root, pos = [0, 0, 0], opts = {}) => {
    const m = new THREE.Mesh(geom, makeMaterial('paint', role, pal));
    m.position.set(...pos);
    m.userData.role = role;
    m.userData.partId = pid;
    if (opts.nopick) m.userData.nopick = true;
    m.castShadow = role !== 'glass'; m.receiveShadow = true;
    parent.add(m);
    parts[pid].objects.push(m);
    return m;
  };
  const anchor = (pid, parent, pos) => {
    const a = new THREE.Object3D(); a.position.set(...pos); parent.add(a); parts[pid].anchor = a; return a;
  };
  const group = (parent, pos, name) => { const g = new THREE.Group(); g.position.set(...pos); if (name) g.name = name; parent.add(g); return g; };
  const bone = (name, obj, parent) => bones.push({ name, obj, parent });
  const socket = (name, parent, pos) => { const s = new THREE.Object3D(); s.position.set(...pos); parent.add(s); sockets.push({ name, obj: s }); return s; };

  const rootBone = new THREE.Object3D(); root.add(rootBone); bone('Root', rootBone, null);
  const bodyPivot = new THREE.Object3D(); root.add(bodyPivot); bone('Body_Pivot', bodyPivot, 'Root');

  if (type === 'bogie') buildElectric(); else buildSteam();

  // collision hull and shadow are shared ideas
  function hullAndShadow(len, wid, h, cx = 0) {
    part('collision', 'collision', 'Collision hull', 'data', { tsc: 'collision .igs (CollisionGeometryID)', tf3: '|bounding_box', tsw: 'UCX_Name_Collision' });
    const hull = add('collision', box(len, h, wid), 'metal', root, [cx, h / 2 + 0.1, 0], { nopick: true });
    hull.material = new THREE.MeshBasicMaterial({ color: pal.accent, wireframe: true }); hull.userData.role = null; hull.visible = false;
    hull.castShadow = false; anchor('collision', root, [cx, h + 0.3, 0]);
    part('shadow', 'shadow', 'Shadow mesh', 'data', { tsc: '1_0400_shadow_engine', tf3: '(dropped)', tsw: '(dynamic shadows)' });
    const sh = add('shadow', box(len * 0.96, 0.6, wid * 0.8), 'dark', root, [cx, 1.6, 0], { nopick: true });
    sh.material = new THREE.MeshBasicMaterial({ color: 0x6b5bd6, wireframe: true }); sh.userData.role = null; sh.visible = false;
    sh.castShadow = false; anchor('shadow', root, [cx, 2.0, 0]);
  }

  // =========================================================================
  function buildElectric() {
    const L = 16, W = 3.0;
    // ---- body ------------------------------------------------------------
    part('body', 'body', 'Body shell', 'body', { tsc: '1_0500_engine', tf3: 'body', tsw: 'Body_Pivot (SK_Name_Ext)' });
    add('body', box(L, 2.6, W), 'paint', bodyPivot, [0, 2.65, 0]);
    add('body', box(L - 0.6, 0.26, W - 0.4), 'roof', bodyPivot, [0, 4.08, 0]);
    add('body', box(L - 1, 0.35, W - 0.4), 'dark', bodyPivot, [0, 1.18, 0]);
    if (detail) {
      for (const z of [-1, 1]) {
        add('body', box(L, 0.16, 0.02), 'stripe', bodyPivot, [0, 1.62, z * (W / 2 + 0.01)]);
        for (let i = 0; i < 5; i++) add('body', box(0.9, 0.9, 0.03), 'dark', bodyPivot, [-3.6 + i * 1.8, 2.75, z * (W / 2 + 0.01)]);
      }
      for (const x of [-1.5, 1.5]) add('body', box(2.2, 0.3, 1.6), 'roof', bodyPivot, [x, 4.35, 0]);
    }
    anchor('body', bodyPivot, [0, 4.4, 0]);

    // ---- glass -----------------------------------------------------------
    part('glass', 'glass', 'Windows', 'body', { tsc: '1_0500_engine (TrainGlass.fx)', tf3: 'body · glass.mtl', tsw: 'MI_Glass on SK_Name_Ext' });
    for (const s of [1, -1]) for (const z of [-0.65, 0.65]) add('glass', box(0.03, 0.75, 1.05), 'glass', bodyPivot, [s * (L / 2 + 0.01), 3.25, z]);
    if (detail) for (const s of [1, -1]) for (const z of [-1, 1]) add('glass', box(0.9, 0.6, 0.03), 'glass', bodyPivot, [s * 5.7, 3.25, z * (W / 2 + 0.015)]);
    anchor('glass', bodyPivot, [L / 2, 3.7, 0]);

    // ---- cab doors (hinge at the rear edge) -----------------------------
    const doorAt = (id, side) => {
      const z = side === 'l' ? -(W / 2 + 0.03) : (W / 2 + 0.03);
      part(id, 'door', side === 'l' ? 'Cab door, left' : 'Cab door, right', 'moving',
        { tsc: `1_0500_door_${side}1`, tf3: `door_${side}1`, tsw: `door_${side}1 · CabDoor_${side.toUpperCase()}` });
      const hinge = group(bodyPivot, [6.55, 2.4, z], 'door_' + side);
      add(id, box(0.8, 1.9, 0.05), 'paint', hinge, [0.4, 0, 0]);
      if (detail) add(id, box(0.5, 0.5, 0.06), 'glass', hinge, [0.4, 0.5, 0]);
      anchor(id, hinge, [0.4, 1.1, 0]);
      pivots.push({ partId: id, obj: hinge }); bone(`door_${side}1`, hinge, 'Body_Pivot');
      return hinge;
    };
    const doorL = doorAt('door_l', 'l'), doorR = doorAt('door_r', 'r');

    // ---- pantographs -----------------------------------------------------
    const pantos = [];
    const pantoAt = (id, px, s, label) => {
      part(id, 'panto', label, 'moving', { tsc: `1_0128_panto0${s > 0 ? 1 : 2}`, tf3: `panto_${s > 0 ? 'front' : 'rear'}`, tsw: `panto0${s > 0 ? 1 : 2}_part01/02` });
      const c = group(bodyPivot, [px, 4.22, 0]);
      if (s < 0) c.rotation.y = Math.PI;
      add(id, box(1.5, 0.1, 1.3), 'metal', c, [0, 0, 0]);
      for (const z of [-0.5, 0.5]) add(id, cylY(0.07, 0.2, 8), 'stripe', c, [0.6, -0.08, z]);
      const lower = group(c, [-0.7, 0.08, 0]);
      add(id, box(1.5, 0.07, 0.07), 'metal', lower, [0.75, 0, 0.35]);
      add(id, box(1.5, 0.07, 0.07), 'metal', lower, [0.75, 0, -0.35]);
      const upper = group(lower, [1.5, 0, 0]);
      add(id, box(1.5, 0.06, 0.06), 'metal', upper, [0.75, 0, 0]);
      const head = group(upper, [1.5, 0, 0]);
      add(id, box(0.22, 0.06, 1.7), 'metal', head, [0, 0.04, 0]);
      anchor(id, head, [0, 0.3, 0]);
      pivots.push({ partId: id, obj: lower }, { partId: id, obj: upper });
      const n = s > 0 ? 1 : 2;
      bone(`panto0${n}_part01`, lower, 'Body_Pivot'); bone(`panto0${n}_part02`, upper, `panto0${n}_part01`);
      const p = { lower, upper, head, t: 0, target: 0 };
      pantos.push(p); return p;
    };
    pantoAt('panto_f', 4.3, 1, 'Pantograph, front');
    pantoAt('panto_r', -4.3, -1, 'Pantograph, rear');

    // ---- horn --------------------------------------------------------------
    part('horn', 'horn', 'Horn', 'sound', { tsc: '1_0500_engine (static) · Horn control', tf3: 'body · soundConfig', tsw: 'Horn (PushButton) → RVA SC_Horn' });
    for (const z of [-0.18, 0.18]) add('horn', cylX(0.07, 0.45, 12), 'metal', bodyPivot, [6.9, 4.4, z]);
    anchor('horn', bodyPivot, [6.9, 4.7, 0]);

    // ---- wipers ------------------------------------------------------------
    part('wipers', 'wiper', 'Wipers', 'moving', { tsc: '1_0064_wiper01', tf3: 'wiper_l / wiper_r', tsw: 'wiper01_l / _r' });
    const wipers = [];
    for (const z of [-0.65, 0.65]) {
      const g = group(bodyPivot, [L / 2 + 0.04, 2.92, z]);
      add('wipers', box(0.02, 0.62, 0.035), 'dark', g, [0, 0.31, 0]);
      wipers.push(g); pivots.push({ partId: 'wipers', obj: g });
      bone(z < 0 ? 'wiper01_l' : 'wiper01_r', g, 'Body_Pivot');
    }
    anchor('wipers', bodyPivot, [L / 2 + 0.05, 3.6, 0]);

    // ---- lights ------------------------------------------------------------
    part('lights', 'headlight', 'Head and tail lamps', 'lights', { tsc: '1_1000_light_fwdhead …', tf3: 'light_front + FBX light', tsw: 'HeadlightController + SpotLight' });
    const lamps = { head: [], tail: [] };
    for (const z of [-1.0, 1.0]) {
      lamps.head.push(add('lights', cylX(0.13, 0.07, 16), 'lamp', bodyPivot, [L / 2 + 0.03, 1.8, z]));
      lamps.tail.push(add('lights', cylX(0.1, 0.07, 16), 'red', bodyPivot, [-L / 2 - 0.03, 1.8, z]));
      add('lights', cylX(0.1, 0.07, 16), 'red', bodyPivot, [L / 2 + 0.03, 1.5, z * 0.6]);      // rev tail: off running forward
      add('lights', cylX(0.13, 0.07, 16), 'lamp', bodyPivot, [-L / 2 - 0.03, 1.5, z * 0.6]);  // rev head: off running forward
    }
    lamps.head.push(add('lights', cylX(0.15, 0.07, 16), 'lamp', bodyPivot, [L / 2 + 0.03, 3.8, 0]));
    anchor('lights', bodyPivot, [L / 2 + 0.1, 1.9, 1.0]);
    socket('Headlight', bodyPivot, [L / 2 + 0.05, 3.8, 0]);

    // ---- numbers -------------------------------------------------------------
    part('numbers', 'numbers', 'Running number', 'body', { tsc: '1_1000_primarydigits_1…', tf3: '(texture / label)', tsw: 'NumberingComponent' });
    const tex = numberTexture('E 4711', '#1c2a38', '#e9dfc4');
    for (const z of [-1, 1]) {
      const m = add('numbers', new THREE.PlaneGeometry(1.1, 0.4), 'paint', bodyPivot, [3.0, 2.1, z * (W / 2 + 0.025)]);
      if (z < 0) m.rotation.y = Math.PI;
      m.userData.fixedMap = tex;
    }
    anchor('numbers', bodyPivot, [3.0, 2.5, W / 2]);

    // ---- couplers & buffers -------------------------------------------------
    part('couplers', 'couplers', 'Buffers and couplers', 'running', { tsc: 'tsc_coupling_front / _rear', tf3: 'body (buffers)', tsw: 'Coupler_F/B · buffer_fl…' });
    for (const s of [1, -1]) {
      add('couplers', box(0.14, 0.5, W - 0.1), 'beam', bodyPivot, [s * (L / 2 + 0.07), 1.05, 0]);
      for (const z of [-0.85, 0.85]) {
        add('couplers', cylX(0.1, 0.42, 12), 'metal', bodyPivot, [s * (L / 2 + 0.33), 1.05, z]);
        const head = add('couplers', cylX(0.2, 0.05, 20), 'metal', bodyPivot, [s * (L / 2 + 0.55), 1.05, z]);
        bone(`buffer_${s > 0 ? 'f' : 'b'}${z < 0 ? 'l' : 'r'}`, head, 'Body_Pivot');
      }
      add('couplers', box(0.5, 0.14, 0.14), 'metal', bodyPivot, [s * (L / 2 + 0.4), 1.0, 0]);
      socket(s > 0 ? 'Coupler_F' : 'Coupler_B', bodyPivot, [s * (L / 2 + 0.6), 1.0, 0]);
    }
    anchor('couplers', bodyPivot, [L / 2 + 0.5, 1.5, 0]);

    // ---- bogies + wheelsets -------------------------------------------------
    const wheelsets = []; const bogies = [];
    let axleNo = 0;
    for (const [i, bx] of [[1, 5.0], [2, -5.0]]) {
      const id = i === 1 ? 'bogie_f' : 'bogie_r';
      part(id, 'bogie', i === 1 ? 'Bogie, front' : 'Bogie, rear', 'running', { tsc: `1_0500_bo0${i}`, tf3: i === 1 ? 'bogie_front' : 'bogie_rear', tsw: `bogie${i}` });
      const bg = group(root, [bx, 0, 0], 'bogie' + i);
      add(id, box(3.6, 0.32, 0.18), 'dark', bg, [0, 0.82, -1.0]);
      add(id, box(3.6, 0.32, 0.18), 'dark', bg, [0, 0.82, 1.0]);
      add(id, box(0.5, 0.3, 2.1), 'dark', bg, [0, 0.82, 0]);
      if (detail) for (const z of [-1.05, 1.05]) for (const x of [-1.2, 1.2]) add(id, cylY(0.12, 0.35, 10), 'metal', bg, [x, 1.05, z]);
      anchor(id, bg, [0, 1.25, -1.1]);
      pivots.push({ partId: id, obj: bg }); bone(`bogie${i}`, bg, 'Body_Pivot'); bogies.push(bg);
      const wid = i === 1 ? 'wheels_f' : 'wheels_r';
      part(wid, 'wheelset', i === 1 ? 'Wheelsets, front bogie' : 'Wheelsets, rear bogie', 'running',
        { tsc: `1_0500_bo0${i}wh01 / wh02`, tf3: i === 1 ? 'w1, w2' : 'w3, w4', tsw: i === 1 ? 'axle1, axle2' : 'axle3, axle4' });
      for (const ax of [1.2, -1.2]) {
        axleNo++;
        const ws = group(bg, [ax, 0.55, 0], 'axle' + axleNo);
        add(wid, cylZ(0.09, 1.7, 10), 'metal', ws, [0, 0, 0]);
        for (const z of [-0.72, 0.72]) {
          add(wid, cylZ(0.55, 0.12, 28), 'dark', ws, [0, 0, z]);
          add(wid, cylZ(0.57, 0.04, 28), 'metal', ws, [0, 0, z + (z > 0 ? -0.07 : 0.07)]);
          add(wid, box(0.5, 0.12, 0.03), 'beam', ws, [0, 0.2, z + (z > 0 ? 0.07 : -0.07)]);
        }
        wheelsets.push(ws); pivots.push({ partId: wid, obj: ws }); bone('axle' + axleNo, ws, `bogie${i}`);
        socket(`Wheel_L${axleNo}`, bg, [ax, 0, -0.72]); socket(`Wheel_R${axleNo}`, bg, [ax, 0, 0.72]);
      }
      anchor(wid, bg, [1.2, 1.2, 1.0]);
    }

    // ---- cab desk + lever ---------------------------------------------------
    part('cab', 'cab', 'Cab desk and throttle', 'cab', { tsc: 'Cab .igs · CabView .ia', tf3: '(no cab)', tsw: 'SK_Cab · ThrottleControl' });
    add('cab', box(0.6, 0.5, 1.4), 'dark', bodyPivot, [7.35, 2.05, -0.3]);
    const lever = group(bodyPivot, [7.25, 2.3, -0.55], 'throttle_lever');
    add('cab', box(0.05, 0.38, 0.05), 'red', lever, [0, 0.19, 0]);
    add('cab', new THREE.SphereGeometry(0.06, 10, 8), 'red', lever, [0, 0.38, 0]);
    anchor('cab', bodyPivot, [7.3, 2.9, -0.5]);
    pivots.push({ partId: 'cab', obj: lever }); bone('throttle_lever', lever, 'Body_Pivot');
    socket('Lever_Throttle', bodyPivot, [7.25, 2.5, -0.55]);

    // ---- driver --------------------------------------------------------------
    part('driver', 'driver', 'Driver position', 'cab', { tsc: 'tsc_driver', tf3: '|seat_ crew seat', tsw: 'DriverSeat socket' });
    add('driver', box(0.5, 0.1, 0.5), 'dark', bodyPivot, [6.8, 1.85, 0.6]);
    add('driver', new THREE.SphereGeometry(0.16, 14, 10), 'stripe', bodyPivot, [6.8, 2.55, 0.6]);
    add('driver', cylY(0.17, 0.5, 12), 'roof', bodyPivot, [6.8, 2.15, 0.6]);
    anchor('driver', bodyPivot, [6.8, 2.95, 0.6]);
    socket('DriverSeat', bodyPivot, [6.8, 1.9, 0.6]);

    // ---- traction + sound marker ----------------------------------------------
    part('traction', 'traction', 'Traction motors and sound', 'sound', { tsc: 'sim + sound blueprints', tf3: 'metadata + soundConfig', tsw: 'SimuGraph + RVA' });
    const spk = speakerSprite('#ffc83d'); spk.position.set(0, 1.55, W / 2 + 0.4); bodyPivot.add(spk);
    spk.userData.partId = 'traction'; parts.traction.objects.push(spk); anchor('traction', bodyPivot, [0, 1.95, W / 2 + 0.4]);
    socket('AudioRunning', bodyPivot, [0, 1.5, 0]);

    hullAndShadow(L + 1.2, W, 4.3);

    // ---- animator ------------------------------------------------------------
    const st = { wheelAngle: 0, speed: 0, doors: 0, doorsT: 0, wipers: false, wipeT: 0, lights: false, lever: 0, leverT: 0, t: 0, game: false };
    pantos[0].target = 0; pantos[1].target = 0;
    v.state = st; v.pantos = pantos; v.lamps = lamps;
    v.anim = (dt) => {
      st.t += dt;
      st.wheelAngle += st.speed * dt / 0.55;
      for (const w of wheelsets) w.rotation.z = -st.wheelAngle;
      for (const [k, b] of bogies.entries()) b.rotation.y = st.game ? 0.035 * Math.sin(st.t * 0.6 + k * 0.9) : 0;
      st.doors += Math.sign(st.doorsT - st.doors) * Math.min(Math.abs(st.doorsT - st.doors), dt * 0.9);
      doorL.rotation.y = 1.25 * st.doors; doorR.rotation.y = -1.25 * st.doors;
      for (const p of pantos) {
        p.t += Math.sign(p.target - p.t) * Math.min(Math.abs(p.target - p.t), dt * 0.6);
        const a = 0.07 + p.t * 0.55;
        p.lower.rotation.z = a; p.upper.rotation.z = Math.PI - 2 * a; p.head.rotation.z = -(Math.PI - a);
      }
      if (st.wipers) st.wipeT += dt;
      const sweep = st.wipers ? 0.75 * Math.sin(st.wipeT * 3.2) : 0;
      for (const w of wipers) w.rotation.x = sweep;
      st.lever += Math.sign(st.leverT - st.lever) * Math.min(Math.abs(st.leverT - st.lever), dt * 1.2);
      lever.rotation.z = 0.5 - st.lever * 1.0;
    };
  }

  // =========================================================================
  function buildSteam() {
    const W = 2.6;
    // ---- frame / footplate (the rigid frame carries the wheels) --------------
    part('frame', 'frame', 'Frame and footplate', 'running', { tsc: '1_0500_frame (rigid)', tf3: 'body (no bogie nodes)', tsw: 'Body_Pivot (no bogie bones)' });
    add('frame', box(9.4, 0.16, W), 'dark', bodyPivot, [0.15, 1.36, 0]);
    for (const z of [-0.55, 0.55]) add('frame', box(8.6, 0.75, 0.1), 'dark', bodyPivot, [0.2, 0.98, z]);
    if (detail) for (const z of [-1, 1]) add('frame', box(9.4, 0.12, 0.04), 'stripe', bodyPivot, [0.15, 1.32, z * (W / 2 + 0.02)]);
    anchor('frame', bodyPivot, [-3.2, 1.6, W / 2]);

    // ---- body: boiler, tanks, cab, bunker ---------------------------------------
    part('body', 'body', 'Boiler, tanks and cab', 'body', { tsc: '1_0500_engine', tf3: 'body', tsw: 'Body_Pivot (SK_Name_Ext)' });
    add('body', cylX(0.72, 4.5, 28), 'paint', bodyPivot, [1.25, 2.35, 0]);
    add('body', cylX(0.76, 0.9, 28), 'dark', bodyPivot, [3.95, 2.35, 0]);
    add('body', new THREE.CylinderGeometry(0.3, 0.38, 0.5, 18), 'brass', bodyPivot, [1.6, 3.25, 0]);
    for (const z of [-1, 1]) add('body', box(3.4, 1.15, 0.5), 'paint', bodyPivot, [1.5, 2.0, z * 1.02]);
    add('body', box(2.2, 2.35, W), 'paint', bodyPivot, [-2.2, 2.6, 0]);
    add('body', box(2.5, 0.12, W + 0.1), 'roof', bodyPivot, [-2.2, 3.83, 0]);
    add('body', box(1.1, 1.3, W - 0.2), 'paint', bodyPivot, [-3.85, 2.07, 0]);
    if (detail) {
      add('body', cylY(0.09, 0.3, 10), 'brass', bodyPivot, [-0.3, 3.15, 0]);
      for (const z of [-1, 1]) add('body', box(1.0, 1.0, 0.03), 'dark', bodyPivot, [-2.2, 2.85, z * (W / 2 + 0.01)]);
      add('body', cylX(0.62, 0.04, 24), 'dark', bodyPivot, [4.41, 2.35, 0]);
      for (const z of [-1, 1]) add('body', box(3.4, 0.06, 0.04), 'stripe', bodyPivot, [1.5, 1.5, z * 1.28]);
    }
    anchor('body', bodyPivot, [1.2, 3.3, 0]);

    part('glass', 'glass', 'Cab spectacle glasses', 'body', { tsc: '1_0500_engine (TrainGlass.fx)', tf3: 'body · glass.mtl', tsw: 'MI_Glass on SK_Name_Ext' });
    for (const z of [-0.6, 0.6]) add('glass', new THREE.CircleGeometry(0.22, 20), 'glass', bodyPivot, [-1.09, 3.25, z]).rotation.y = Math.PI / 2;
    anchor('glass', bodyPivot, [-1.0, 3.6, 0.6]);

    // ---- chimney + smoke ---------------------------------------------------------
    part('chimney', 'smoke', 'Chimney and smoke', 'sound', { tsc: '1_0500_engine + smoke emitter child', tf3: 'body · emissions', tsw: 'Niagara MainPipeSmoke' });
    add('chimney', new THREE.CylinderGeometry(0.2, 0.24, 0.8, 18), 'dark', bodyPivot, [4.05, 3.45, 0]);
    add('chimney', cylY(0.27, 0.1, 18), 'dark', bodyPivot, [4.05, 3.86, 0]);
    anchor('chimney', bodyPivot, [4.05, 4.2, 0]);

    // ---- whistle ------------------------------------------------------------------
    part('horn', 'horn', 'Whistle', 'sound', { tsc: '1_0500_engine (static) · Horn control', tf3: 'body · soundConfig', tsw: 'Whistle (PushButton) → RVA' });
    add('horn', cylY(0.06, 0.35, 10), 'brass', bodyPivot, [-1.0, 3.98, 0.3]);
    add('horn', new THREE.SphereGeometry(0.07, 10, 8), 'brass', bodyPivot, [-1.0, 4.18, 0.3]);
    anchor('horn', bodyPivot, [-1.0, 4.45, 0.3]);

    // ---- lamps ----------------------------------------------------------------------
    part('lights', 'headlight', 'Lamps', 'lights', { tsc: '1_1000_light_fwdhead …', tf3: 'light_front + FBX light', tsw: 'HeadlightController + SpotLight' });
    const lamps = { head: [], tail: [] };
    const lampAt = (x, z, list, role) => {
      add('lights', box(0.22, 0.28, 0.22), 'dark', bodyPivot, [x, 1.62, z]);
      list.push(add('lights', cylX(0.08, 0.04, 14), role, bodyPivot, [x + Math.sign(x) * 0.12, 1.62, z]));
    };
    lampAt(4.7, 0, lamps.head, 'lamp'); lampAt(-4.3, 0, lamps.tail, 'red');
    anchor('lights', bodyPivot, [4.7, 2.0, 0]);
    socket('Headlight', bodyPivot, [4.85, 1.62, 0]);

    // ---- numbers ----------------------------------------------------------------------
    part('numbers', 'numbers', 'Running number', 'body', { tsc: '1_1000_primarydigits_1…', tf3: '(texture / label)', tsw: 'NumberingComponent' });
    const tex = numberTexture('No. 7', '#24412d', '#d9b45a');
    for (const z of [-1, 1]) {
      const m = add('numbers', new THREE.PlaneGeometry(0.8, 0.3), 'paint', bodyPivot, [-3.85, 2.2, z * (W / 2 - 0.08)]);
      if (z < 0) m.rotation.y = Math.PI; m.userData.fixedMap = tex;
    }
    anchor('numbers', bodyPivot, [-3.85, 2.6, W / 2]);

    // ---- buffers / couplers -------------------------------------------------------
    part('couplers', 'couplers', 'Buffers and couplers', 'running', { tsc: 'tsc_coupling_front / _rear', tf3: 'body (buffers)', tsw: 'Coupler_F/B · buffer_fl…' });
    for (const [s, x] of [[1, 4.85], [-1, -4.55]]) {
      add('couplers', box(0.14, 0.45, W), 'beam', bodyPivot, [x, 1.15, 0]);
      for (const z of [-0.85, 0.85]) {
        add('couplers', cylX(0.09, 0.4, 12), 'metal', bodyPivot, [x + s * 0.27, 1.12, z]);
        const head = add('couplers', cylX(0.19, 0.05, 20), 'metal', bodyPivot, [x + s * 0.48, 1.12, z]);
        bone(`buffer_${s > 0 ? 'f' : 'b'}${z < 0 ? 'l' : 'r'}`, head, 'Body_Pivot');
      }
      add('couplers', box(0.45, 0.12, 0.12), 'metal', bodyPivot, [x + s * 0.3, 1.05, 0]);
      socket(s > 0 ? 'Coupler_F' : 'Coupler_B', bodyPivot, [x + s * 0.5, 1.05, 0]);
    }
    anchor('couplers', bodyPivot, [4.9, 1.6, 0]);

    // ---- cylinders --------------------------------------------------------------------
    part('cylinders', 'cylinders', 'Cylinders', 'running', { tsc: '1_0500_engine + steam sim', tf3: 'body', tsw: 'SimuGraph + RVA chuffs' });
    for (const z of [-1, 1]) {
      add('cylinders', cylX(0.32, 1.0, 22), 'dark', bodyPivot, [3.6, 0.95, z * 1.0]);
      add('cylinders', box(1.3, 0.05, 0.05), 'metal', bodyPivot, [2.55, 1.12, z * 1.0]);
      add('cylinders', box(1.3, 0.05, 0.05), 'metal', bodyPivot, [2.55, 0.78, z * 1.0]);
    }
    anchor('cylinders', bodyPivot, [3.6, 1.5, 1.0]);

    // ---- coupled wheels (no bogies) ---------------------------------------------------------
    part('wheels', 'drivewheel', 'Coupled driving wheels', 'running', { tsc: '1_0500_bo01wh01 … wh03', tf3: 'w1, w2, w3 (+ wheels strip)', tsw: 'axle1 … axle3' });
    const R = 0.66, crank = 0.3, axleX = [2.0, 0.2, -1.6];
    const wheels = [];
    axleX.forEach((x, i) => {
      const ws = group(root, [x, R, 0], 'axle' + (i + 1));
      add('wheels', cylZ(0.09, 1.6, 10), 'metal', ws, [0, 0, 0]);
      for (const z of [-0.72, 0.72]) {
        add('wheels', cylZ(R, 0.1, 30), 'paint', ws, [0, 0, z]);
        add('wheels', cylZ(R + 0.03, 0.04, 30), 'dark', ws, [0, 0, z + (z > 0 ? -0.06 : 0.06)]);
        add('wheels', cylZ(0.12, 0.14, 14), 'dark', ws, [0, 0, z + (z > 0 ? 0.06 : -0.06)]);
        const ph = z > 0 ? Math.PI / 2 : 0;
        add('wheels', box(0.42, 0.24, 0.04), 'dark', ws, [-Math.cos(ph) * 0.38, -Math.sin(ph) * 0.38, z + (z > 0 ? 0.06 : -0.06)]);
        add('wheels', cylZ(0.06, 0.16, 10), 'metal', ws, [Math.cos(ph) * crank, Math.sin(ph) * crank, z + (z > 0 ? 0.12 : -0.12)]);
      }
      wheels.push(ws); pivots.push({ partId: 'wheels', obj: ws }); bone('axle' + (i + 1), ws, 'Body_Pivot');
      socket(`Wheel_L${i + 1}`, bodyPivot, [x, 0, -0.72]); socket(`Wheel_R${i + 1}`, bodyPivot, [x, 0, 0.72]);
    });
    anchor('wheels', root, [0.2, 1.6, 1.0]);

    // ---- rods (coupling + connecting) and crossheads --------------------------------------
    part('rods', 'rods', 'Coupling and connecting rods', 'running', { tsc: '1_0100_rod1_l … (custom keywords)', tf3: 'rod_l, conrod_l … (wheels strip)', tsw: 'axle_Rod_L, ConnectingRod_L …' });
    const sides = [];
    for (const z of [-1, 1]) {
      const zc = z * 0.92;
      const coupling = new THREE.Group(); root.add(coupling);
      add('rods', box(axleX[0] - axleX[2] + 0.25, 0.09, 0.04), 'metal', coupling, [0, 0, 0]);
      const conrod = new THREE.Group(); root.add(conrod);
      add('rods', box(2.3, 0.08, 0.04), 'metal', conrod, [-1.15, 0, 0.05 * z]);
      const cross = new THREE.Group(); root.add(cross);
      add('rods', box(0.28, 0.26, 0.1), 'metal', cross, [0, 0, 0]);
      add('rods', box(0.9, 0.05, 0.05), 'metal', cross, [0.5, 0, 0]);
      sides.push({ z: zc, phase: z > 0 ? Math.PI / 2 : 0, coupling, conrod, cross });
      bone(z < 0 ? 'axle_Rod_L' : 'axle_Rod_R', coupling, 'Body_Pivot');
      bone(z < 0 ? 'ConnectingRod_L' : 'ConnectingRod_R', conrod, 'Body_Pivot');
    }
    anchor('rods', root, [0.9, 1.35, 1.05]);
    pivots.push({ partId: 'rods', obj: sides[1].cross });

    // ---- cab regulator ---------------------------------------------------------------------
    part('cab', 'cab', 'Regulator and cab controls', 'cab', { tsc: 'Cab .igs · CabView .ia', tf3: '(no cab)', tsw: 'SK_Cab · Regulator VHID' });
    add('cab', box(0.12, 1.0, 1.4), 'dark', bodyPivot, [-1.2, 2.6, 0]);
    const lever = group(bodyPivot, [-1.32, 2.95, 0.25], 'regulator');
    add('cab', box(0.05, 0.05, 0.42), 'red', lever, [0, 0, 0.21]);
    anchor('cab', bodyPivot, [-1.4, 3.4, 0.3]);
    pivots.push({ partId: 'cab', obj: lever }); bone('regulator', lever, 'Body_Pivot');
    socket('Lever_Regulator', bodyPivot, [-1.32, 2.95, 0.4]);

    part('driver', 'driver', 'Driver position', 'cab', { tsc: 'tsc_driver', tf3: '|seat_ crew seat', tsw: 'DriverSeat socket' });
    add('driver', new THREE.SphereGeometry(0.16, 14, 10), 'stripe', bodyPivot, [-2.6, 2.75, 0.7]);
    add('driver', cylY(0.17, 0.55, 12), 'roof', bodyPivot, [-2.6, 2.32, 0.7]);
    anchor('driver', bodyPivot, [-2.6, 3.15, 0.7]);
    socket('DriverSeat', bodyPivot, [-2.6, 1.5, 0.7]);
    socket('AudioChuff', bodyPivot, [4.05, 3.8, 0]);
    socket('AudioWhistle', bodyPivot, [-1.0, 4.1, 0.3]);

    hullAndShadow(10.2, W, 3.9, 0.15);

    // ---- smoke puffs ---------------------------------------------------------------------------
    const puffs = [];
    const puffMat = new THREE.MeshStandardMaterial({ color: 0xd8d8d8, transparent: true, opacity: 0.5, roughness: 1, depthWrite: false });
    for (let i = 0; i < 18; i++) {
      const p = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), puffMat.clone());
      p.visible = false; p.userData.nopick = true; root.add(p); puffs.push({ m: p, life: 0 });
    }
    const steamMat = new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.0, depthWrite: false });
    const whistleSteam = new THREE.Mesh(new THREE.SphereGeometry(0.25, 10, 8), steamMat);
    whistleSteam.position.set(-1.0, 4.4, 0.3); whistleSteam.userData.nopick = true; bodyPivot.add(whistleSteam);

    const st = { wheelAngle: 0, speed: 0, lights: false, lever: 0, leverT: 0, t: 0, puffClock: 0, whistle: 0, game: false };
    v.state = st; v.lamps = lamps;
    v.anim = (dt) => {
      st.t += dt;
      st.wheelAngle += st.speed * dt / R;
      const th = -st.wheelAngle;
      for (const w of wheels) w.rotation.z = th;
      for (const s of sides) {
        const ph = th + s.phase;
        const cx = Math.cos(ph) * crank, cy = Math.sin(ph) * crank;
        s.coupling.position.set((axleX[0] + axleX[2]) / 2 + cx, R + cy, s.z + 0.08 * Math.sign(s.z));
        const pin = new THREE.Vector3(axleX[1] + cx, R + cy, 0);
        const yc = 0.95, Lr = 2.3;
        const xc = pin.x + Math.sqrt(Lr * Lr - (yc - pin.y) ** 2);
        s.cross.position.set(xc, yc, s.z);
        s.conrod.position.set(xc, yc, s.z + 0.08 * Math.sign(s.z));
        s.conrod.rotation.z = Math.atan2(yc - pin.y, xc - pin.x);
      }
      // smoke: one puff per quarter revolution while moving
      st.puffClock += Math.abs(st.speed) * dt / R;
      if (st.speed > 0.05 && st.puffClock > Math.PI / 2) {
        st.puffClock = 0;
        const p = puffs.find(q => q.life <= 0);
        if (p) { p.life = 1; p.m.visible = true; p.m.position.set(4.05, 4.0, 0); p.m.scale.setScalar(0.6); }
      }
      for (const p of puffs) if (p.life > 0) {
        p.life -= dt * 0.45;
        p.m.position.y += dt * 1.1; p.m.position.x -= dt * (st.speed * 0.8 + 0.2);
        p.m.scale.setScalar(0.6 + (1 - p.life) * 2.2); p.m.material.opacity = 0.5 * Math.max(p.life, 0);
        if (p.life <= 0) p.m.visible = false;
      }
      st.whistle = Math.max(0, st.whistle - dt * 0.7);
      whistleSteam.material.opacity = 0.7 * st.whistle; whistleSteam.scale.setScalar(1 + (1 - st.whistle) * 2.5);
      whistleSteam.position.y = 4.4 + (1 - st.whistle) * 0.6;
      st.lever += Math.sign(st.leverT - st.lever) * Math.min(Math.abs(st.leverT - st.lever), dt * 1.2);
      lever.rotation.y = -st.lever * 0.9;
    };
  }

  // fixed textures (number plates) are kept in every look
  root.traverse(o => { if (o.isMesh && o.userData.fixedMap) { o.userData.role = 'paint'; } });
  const origApply = applyLook;
  v.applyLook = (look) => {
    origApply(v, look);
    root.traverse(o => {
      if (o.isMesh && o.userData.fixedMap) {
        if (look === 'paint') { o.material = o.userData.plateMat || (o.userData.plateMat = new THREE.MeshStandardMaterial({ map: o.userData.fixedMap, roughness: 0.5 })); }
      }
    });
  };
  v.setLights = (on) => {
    v.state.lights = on;
    for (const m of v.lamps.head) if (m.material.emissive) m.material.emissiveIntensity = on ? 2.2 : 0;
    for (const m of v.lamps.tail) if (m.material.emissive) m.material.emissiveIntensity = on ? 1.6 : 0;
  };
  v.applyLook('paint');
  return v;
}

// ---------------------------------------------------------------------------
// track: two rails and sleepers that scroll while "running"
// ---------------------------------------------------------------------------
export function buildTrack() {
  const g = new THREE.Group();
  const railMat = new THREE.MeshStandardMaterial({ color: 0x8a8f96, metalness: 0.7, roughness: 0.35 });
  for (const z of [-0.7175, 0.7175]) {
    const r = new THREE.Mesh(new THREE.BoxGeometry(60, 0.12, 0.07), railMat); r.position.set(0, -0.06, z); r.receiveShadow = true; g.add(r);
  }
  const n = 100, gap = 0.6;
  const sl = new THREE.InstancedMesh(new THREE.BoxGeometry(0.24, 0.14, 2.6), new THREE.MeshStandardMaterial({ color: 0x5a4a3c, roughness: 0.95 }), n);
  const ballast = new THREE.Mesh(new THREE.BoxGeometry(60, 0.2, 3.6), new THREE.MeshStandardMaterial({ color: 0x6f6a64, roughness: 1 }));
  ballast.position.y = -0.29; ballast.receiveShadow = true; g.add(ballast);
  const m4 = new THREE.Matrix4();
  g.add(sl); sl.receiveShadow = true;
  let offset = 0;
  g.userData.update = (dx) => {
    offset = (offset - dx) % gap; if (offset < 0) offset += gap;
    for (let i = 0; i < n; i++) { m4.makeTranslation(-30 + i * gap + offset, -0.16, 0); sl.setMatrixAt(i, m4); }
    sl.instanceMatrix.needsUpdate = true;
  };
  g.userData.update(0);
  g.traverse(o => { o.userData.nopick = true; });
  return g;
}
