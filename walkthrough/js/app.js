// Locomotive Pipeline Explorer: two 3D modes over one scene, plus three flat explainers.
//   Explore: click a part of a finished vehicle, see what it is in TSC / TF3 / TSW and where it sits in the pipeline.
//   Build:   step through turning a simple model into a game asset, for a bogie loco and a rigid-frame loco.
//   Curves, simulation and sound: flat views of how each engine moves, drives and voices the vehicle.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { buildVehicle, buildTrack } from './models.js';
import { GAMES, KINDS, STEPS, CATS, TRY } from './data.js';
import { narrator } from './narrate.js';
import { createCurves, CURVES, SLIDERS, tourFor } from './curves.js';
import { createSim, SIMTEXT, SCRIPTS, TOPICS, simTour } from './sim.js';
import { createSound, SOUNDTEXT, SOUNDTOPICS, LAYERS, soundTour } from './sound.js';

// ---------------------------------------------------------------------------
// state
// ---------------------------------------------------------------------------
const store = {
  get(k, d) { try { const v = localStorage.getItem('lpe.' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('lpe.' + k, JSON.stringify(v)); } catch { /* storage blocked: fine */ } },
};
const S = {
  mode: store.get('mode', 'explore'),
  game: store.get('game', 'tsc'),
  type: store.get('type', 'bogie'),
  step: 0,
  selected: null,
  running: false, curve: false, lights: false, xray: false, labels: false,
  sound: store.get('sound', true),
  narrate: false,
};
if (!GAMES[S.game]) S.game = 'tsc';
if (!['explore', 'build', 'curves', 'sim', 'sound'].includes(S.mode)) S.mode = 'explore';
if (!['bogie', 'rigid'].includes(S.type)) S.type = 'bogie';

const $ = (s, r = document) => r.querySelector(s);
const app = $('#app');
const canvas = $('#view');
const labelLayer = $('#labels');
const panel = $('#panel');
const pipelineEl = $('#pipeline');
const curvesEl = $('#curves');
const captionEl = $('#caption');
const simEl = $('#sim');
const soundEl = $('#sound');

// ---------------------------------------------------------------------------
// text markup
// ---------------------------------------------------------------------------
const esc = (t) => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function md(t) {
  return esc(t)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/\{check\}/g, '<span class="pill check" title="Inferred or untested; confirm in your own tools">check</span>')
    .replace(/\{v\}/g, '<span class="pill ok" title="Read from the sample files or the running editor">verified</span>');
}

// ---------------------------------------------------------------------------
// renderer / scene
// ---------------------------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 400);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI * 0.495;
controls.minDistance = 3; controls.maxDistance = 60;

scene.add(new THREE.HemisphereLight(0xe8f0ff, 0x4a4238, 1.15));
const sun = new THREE.DirectionalLight(0xffffff, 2.1);
sun.position.set(10, 16, 9); sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 10, bottom: -10, near: 1, far: 60 });
scene.add(sun);
const fill = new THREE.DirectionalLight(0xbfd6ff, 0.5); fill.position.set(-8, 6, -10); scene.add(fill);
const headBeam = new THREE.PointLight(0xfff0c8, 0, 14, 1.6); scene.add(headBeam);

const track = buildTrack(); scene.add(track);
const ground = new THREE.Mesh(new THREE.CircleGeometry(80, 48), new THREE.MeshStandardMaterial({ color: 0x9aa39a, roughness: 1 }));
ground.rotation.x = -Math.PI / 2; ground.position.y = -0.4; ground.receiveShadow = true; ground.userData.nopick = true; scene.add(ground);

function themeColors() {
  const cs = getComputedStyle(app);
  scene.background = new THREE.Color(cs.getPropertyValue('--stage').trim() || '#dfe5eb');
  ground.material.color.set(cs.getPropertyValue('--ground').trim() || '#9aa39a');
}

// ---------------------------------------------------------------------------
// vehicles (built once per type; LOD/blockout twins built with detail = false)
// ---------------------------------------------------------------------------
const vehicles = {};
function getVehicle(type) {
  if (!vehicles[type]) {
    const full = buildVehicle(type);
    const lite = buildVehicle(type, { detail: false });
    lite.applyLook('clay');
    lite.root.traverse(o => { o.userData.nopick = true; });
    full.lite = lite;
    prepareExplode(full);
    vehicles[type] = full;
  }
  return vehicles[type];
}
let V = null;

// ---------------------------------------------------------------------------
// explode: move part containers apart to show that they are separate nodes
// ---------------------------------------------------------------------------
const EXPLODE = { panto: [0, 1.3, 0], door: [0, 0, 1], wiper: [0.7, 0, 0], bogie: [0, -1.0, 0], wheelset: [0, -1.0, 0], drivewheel: [0, -1.0, 0],
  rods: [0, -1.0, 0.35], cab: [0, 1.6, 0], horn: [0, 0.8, 0], couplers: [1, 0, 0], lights: [0.5, 0, 0], headlight: [0.5, 0, 0], smoke: [0, 0.8, 0] };
function prepareExplode(v) {
  const top = new Set([v.root, ...v.root.children]);
  const bodyPivot = v.bones.find(b => b.name === 'Body_Pivot').obj;
  const movers = new Map();
  for (const p of Object.values(v.parts)) {
    const off = EXPLODE[p.kind]; if (!off) continue;
    for (const o of p.objects) {
      let m = o;
      while (m.parent && m.parent !== v.root && m.parent !== bodyPivot) m = m.parent;
      if (movers.has(m)) continue;
      const vec = new THREE.Vector3(...off);
      if (p.kind === 'door') vec.z = Math.sign(m.position.z || 1) * 0.9;
      if (p.kind === 'couplers' || p.kind === 'headlight') vec.x *= Math.sign(m.position.x || 1);
      movers.set(m, { base: m.position.clone(), off: vec, animDriven: m.parent === v.root && p.kind === 'rods' });
    }
  }
  v.movers = movers; v.explode = 0; v.explodeT = 0;
}
function applyExplode(v, dt) {
  v.explode += Math.sign(v.explodeT - v.explode) * Math.min(Math.abs(v.explodeT - v.explode), dt * 1.6);
  for (const [m, d] of v.movers) {
    if (!d.animDriven) m.position.copy(d.base);
    if (v.explode > 0) m.position.addScaledVector(d.off, v.explode);
  }
}

// ---------------------------------------------------------------------------
// helpers drawn on top: pivots, bones, sockets
// ---------------------------------------------------------------------------
const overlay = new THREE.Group(); scene.add(overlay);
const jointMat = new THREE.MeshBasicMaterial({ color: 0xffc83d, depthTest: false });
const socketMat = new THREE.MeshBasicMaterial({ color: 0x3fd0c9, depthTest: false });
const boneLineMat = new THREE.LineBasicMaterial({ color: 0xffc83d, depthTest: false });
let boneLines = null, boneJoints = [], socketMarks = [], axesHelpers = [];
const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3();

function clearOverlay() {
  overlay.clear(); boneLines = null; boneJoints = []; socketMarks = [];
  for (const a of axesHelpers) a.removeFromParent(); axesHelpers = [];
}
function showPivots(kinds) {
  for (const p of V.pivots) {
    const part = V.parts[p.partId];
    if (kinds && !kinds.includes(part.kind)) continue;
    const a = new THREE.AxesHelper(0.75); a.material.depthTest = false; a.renderOrder = 20;
    p.obj.add(a); axesHelpers.push(a);
  }
}
function showBones() {
  const pos = new Float32Array(V.bones.length * 6);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  boneLines = new THREE.LineSegments(g, boneLineMat); boneLines.renderOrder = 21; overlay.add(boneLines);
  for (const b of V.bones) {
    const j = new THREE.Mesh(new THREE.SphereGeometry(b.name === 'Root' ? 0.16 : 0.1, 10, 8), jointMat); j.renderOrder = 22;
    overlay.add(j); boneJoints.push({ j, b });
  }
}
function updateBones() {
  if (!boneLines) return;
  const pos = boneLines.geometry.attributes.position.array;
  const byName = Object.fromEntries(V.bones.map(b => [b.name, b]));
  V.bones.forEach((b, i) => {
    b.obj.getWorldPosition(tmpA);
    const par = b.parent ? byName[b.parent] : null;
    if (par) par.obj.getWorldPosition(tmpB); else tmpB.copy(tmpA);
    if (b.name === 'Body_Pivot') tmpA.y += 0.25;
    pos.set([tmpA.x, tmpA.y, tmpA.z, tmpB.x, tmpB.y + (b.parent === 'Body_Pivot' ? 0.25 : 0), tmpB.z], i * 6);
  });
  boneLines.geometry.attributes.position.needsUpdate = true;
  for (const { j, b } of boneJoints) { b.obj.getWorldPosition(j.position); if (b.name === 'Body_Pivot') j.position.y += 0.25; }
}
function showSockets() {
  for (const s of V.sockets) {
    const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.12), socketMat); m.renderOrder = 22;
    s.obj.add(m); socketMarks.push(m); axesHelpers.push(m);
  }
}

// ---------------------------------------------------------------------------
// labels (HTML over the canvas)
// ---------------------------------------------------------------------------
let labels = [];   // {el, obj, offsetY}
function setLabels(list) {
  labelLayer.innerHTML = '';
  labels = list.map(({ text, obj, cls, sub }) => {
    const el = document.createElement('div');
    el.className = 'tag ' + (cls || '');
    el.innerHTML = `<span>${md(text)}</span>${sub ? `<small>${md(sub)}</small>` : ''}`;
    labelLayer.appendChild(el);
    return { el, obj };
  });
}
function updateLabels() {
  const r = canvas.getBoundingClientRect();
  for (const l of labels) {
    l.obj.getWorldPosition(tmpA);
    tmpA.project(camera);
    const vis = tmpA.z < 1 && Math.abs(tmpA.x) < 1.1 && Math.abs(tmpA.y) < 1.1;
    l.el.style.display = vis ? '' : 'none';
    if (!vis) continue;
    l.el.style.transform = `translate(${(tmpA.x + 1) / 2 * r.width}px, ${(1 - tmpA.y) / 2 * r.height}px) translate(-50%, -100%)`;
  }
}
const partLabels = (filter, textFn, cls) => Object.values(V.parts)
  .filter(p => p.anchor && (!filter || filter(p)))
  .map(p => ({ text: textFn(p), obj: p.anchor, cls: (cls || '') + (S.selected === p.id ? ' sel' : '') }));

// ---------------------------------------------------------------------------
// looks: selection highlight, x-ray
// ---------------------------------------------------------------------------
const HI = new THREE.Color(0xffb400);
function eachMesh(fn) { V.root.traverse(o => { if (o.isMesh && o.material && o.userData.partId) fn(o); }); }
function applyHighlight(ids) {
  const set = new Set(ids || []);
  eachMesh(o => {
    const m = o.material;
    if (!m.emissive) return;
    const lamp = o.userData.role === 'lamp' || o.userData.role === 'red';
    if (set.has(o.userData.partId)) { if (!lamp) { m.emissive.copy(HI); m.emissiveIntensity = 0.38; } }
    else if (!lamp) { m.emissive.setRGB(0, 0, 0); m.emissiveIntensity = 0; }
  });
  V.setLights(S.lights);
}
const XRAY_KINDS = new Set(['body', 'glass', 'frame', 'numbers']);
function applyXray(on) {
  eachMesh(o => {
    const k = V.parts[o.userData.partId]?.kind;
    if (!XRAY_KINDS.has(k)) return;
    const m = o.material;
    if (on) { m.transparent = true; m.opacity = k === 'glass' ? 0.15 : 0.22; m.depthWrite = false; }
    else { m.transparent = o.userData.role === 'glass'; m.opacity = o.userData.role === 'glass' ? (V.look === 'clay' ? 0.55 : 0.42) : 1; m.depthWrite = true; }
    m.needsUpdate = true;
  });
}

// ---------------------------------------------------------------------------
// scene states (build mode) and explore defaults
// ---------------------------------------------------------------------------
let stateLoop = null;   // per-state animation driver
function setScene(stateName, step) {
  const v = V;
  clearOverlay(); stateLoop = null;
  v.root.visible = true; v.lite.root.visible = false; v.lite.root.position.set(0, 0, 0);
  v.parts.collision.objects.forEach(o => o.visible = false);
  v.parts.shadow.objects.forEach(o => o.visible = false);
  v.explodeT = 0; v.state.game = false;
  S.curve = false;
  let look = 'paint', xray = false, lbl = [], hl = step?.hl ? Object.values(v.parts).filter(p => step.hl.includes(p.kind)).map(p => p.id) : [];
  let run = 0, lights = false;
  const g = S.game;
  const name = (p) => p.names[g] || p.label;

  switch (stateName) {
    case 'blockout':
      v.root.visible = false; v.lite.root.visible = true;
      lbl = [{ text: 'Primitives at real size', obj: v.parts.body.anchor, cls: 'note' }];
      break;
    case 'pivots':
      look = 'clay'; v.explodeT = 1; showPivots(step?.hl);
      lbl = partLabels(p => step?.hl?.includes(p.kind), p => p.label, 'small');
      break;
    case 'names':
      look = 'clay';
      lbl = partLabels(p => !['collision', 'shadow', 'traction'].includes(p.kind) && !(g === 'tf3' && ['cab', 'shadow', 'numbers'].includes(p.kind)), name, 'mono');
      break;
    case 'lod': {
      v.lite.root.visible = true; v.lite.root.position.set(0, 0, -4.6);
      const tsc = g === 'tsc';
      lbl = [
        { text: tsc ? '`1_0500_engine` · LOD 1, to 500 m' : g === 'tf3' ? '`myloco_lod0.fbx`' : 'LOD 0 (imported)', obj: v.parts.body.anchor, cls: 'mono' },
        { text: tsc ? '`2_1200_engine` · LOD 2, to 1200 m' : g === 'tf3' ? '`myloco_lod1.fbx`' : 'LOD 1 (generated in the editor)', obj: v.lite.parts.body.anchor, cls: 'mono' },
      ];
      break;
    }
    case 'uv': look = 'checker'; lbl = [{ text: 'UV checker: even squares mean even texel density', obj: v.parts.body.anchor, cls: 'note' }]; break;
    case 'textures': look = 'paint'; break;
    case 'special':
      v.parts.collision.objects.forEach(o => o.visible = true);
      if (g === 'tsc') v.parts.shadow.objects.forEach(o => o.visible = true);
      lbl = partLabels(p => step?.hl?.includes(p.kind) && !(g === 'tsc' ? false : p.kind === 'shadow'), name, 'mono');
      break;
    case 'anim':
      lbl = partLabels(p => step?.hl?.includes(p.kind), p => p.label, 'small');
      stateLoop = animDemo;
      if (v.type === 'rigid') run = 2.5;
      break;
    case 'rig':
      look = 'clay'; xray = true; showBones();
      lbl = v.bones.filter(b => b.name !== 'Root' && !b.name.startsWith('buffer_b')).map(b => ({ text: b.name, obj: b.obj, cls: 'mono bone' }));
      break;
    case 'sockets':
      look = 'clay'; xray = true; showSockets();
      lbl = v.sockets.filter(s => !/Wheel_[LR][2-9]/.test(s.name)).map(s => ({ text: s.name, obj: s.obj, cls: 'mono sock' }));
      break;
    case 'export':
      v.explodeT = 1;
      lbl = partLabels(p => !['collision', 'shadow', 'traction', 'glass'].includes(p.kind) && !(g === 'tf3' && ['cab', 'numbers'].includes(p.kind)), name, 'mono');
      break;
    case 'data':
      lbl = partLabels(p => step?.hl?.includes(p.kind), name, 'mono');
      break;
    case 'cab':
      xray = true; hl = ['cab', 'driver'];
      lbl = partLabels(p => ['cab', 'driver'].includes(p.kind), name, 'mono');
      stateLoop = (t) => { v.state.leverT = (Math.sin(t * 0.9) + 1) / 2; };
      break;
    case 'game':
      run = 7; lights = true; v.state.game = true; S.curve = true;
      break;
  }
  v.applyLook(look);
  S.xray = xray; applyXray(xray);
  S.lights = lights; v.setLights(lights);
  S.running = run > 0; targetSpeed = run;
  if (!stateLoop) resetMoving();
  applyHighlight(hl);
  setLabels(lbl);
  syncToolbar();
}
function resetMoving() {
  const st = V.state;
  if ('doorsT' in st) st.doorsT = 0;
  if (V.pantos) V.pantos.forEach(p => p.target = 0);
  if ('wipers' in st) st.wipers = false;
  st.leverT = 0;
}
function animDemo(t) {
  const st = V.state;
  const ph = (Math.sin(t * 0.7) + 1) / 2;
  if ('doorsT' in st) st.doorsT = ph > 0.5 ? 1 : 0;
  if (V.pantos) V.pantos.forEach((p, i) => p.target = (i === 0 ? ph : 1 - ph) > 0.5 ? 1 : 0);
  if ('wipers' in st) st.wipers = true;
  st.leverT = ph;
}

function exploreScene() {
  clearOverlay(); stateLoop = null;
  V.root.visible = true; V.lite.root.visible = false;
  V.explodeT = 0;
  V.parts.collision.objects.forEach(o => o.visible = S.selected === 'collision');
  V.parts.shadow.objects.forEach(o => o.visible = S.selected === 'shadow');
  V.applyLook('paint');
  applyXray(S.xray);
  V.state.game = S.curve;
  applyHighlight(S.selected ? [S.selected] : []);
  refreshExploreLabels();
  syncToolbar();
}
function refreshExploreLabels() {
  if (!S.labels) { setLabels(S.selected && V.parts[S.selected]?.anchor ? [{ text: V.parts[S.selected].names[S.game] || V.parts[S.selected].label, obj: V.parts[S.selected].anchor, cls: 'mono sel' }] : []); return; }
  setLabels(partLabels(p => !['collision', 'shadow'].includes(p.kind) || S.selected === p.id, p => p.label, 'small'));
}

// ---------------------------------------------------------------------------
// camera framing
// ---------------------------------------------------------------------------
function frame(type, instant) {
  resize();
  const far = (type === 'bogie' ? 1 : 0.68) * Math.max(1, 1.45 / Math.max(camera.aspect, 0.3));
  const pos = new THREE.Vector3(15 * far, 7.5 * far, 17 * far);
  const tgt = new THREE.Vector3(type === 'bogie' ? 0.5 : 0.2, 1.8, 0);
  if (instant) { camera.position.copy(pos); controls.target.copy(tgt); controls.update(); return; }
  camAnim = { from: camera.position.clone(), to: pos, tf: controls.target.clone(), tt: tgt, t: 0 };
}
let camAnim = null;

// ---------------------------------------------------------------------------
// picking
// ---------------------------------------------------------------------------
const ray = new THREE.Raycaster();
const ptr = new THREE.Vector2();
function pick(ev) {
  const r = canvas.getBoundingClientRect();
  ptr.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ptr, camera);
  const hits = ray.intersectObject(V.root, true);
  for (const h of hits) {
    if (h.object.userData.nopick || !h.object.visible) continue;
    if (S.xray && XRAY_KINDS.has(V.parts[h.object.userData.partId]?.kind)) continue;
    let o = h.object;
    while (o && !o.userData.partId) o = o.parent;
    if (o) return o.userData.partId;
  }
  return null;
}
let downAt = null;
canvas.addEventListener('pointerdown', e => { downAt = [e.clientX, e.clientY]; audio.unlock(); });
canvas.addEventListener('pointerup', e => {
  if (!downAt) return;
  const moved = Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]); downAt = null;
  if (moved > 6) return;
  const id = pick(e);
  if (S.mode !== 'explore') { if (id) { S.mode = 'explore'; S.selected = id; render(); } return; }
  if (id) select(id);
});
canvas.addEventListener('pointermove', e => {
  if (e.buttons) return;
  const id = pick(e);
  canvas.style.cursor = id ? 'pointer' : 'grab';
  hoverTag.hidden = !id;
  if (id) {
    const p = V.parts[id];
    hoverTag.textContent = p.label;
    const r = canvas.getBoundingClientRect();
    hoverTag.style.transform = `translate(${e.clientX - r.left + 14}px, ${e.clientY - r.top + 14}px)`;
  }
});
canvas.addEventListener('pointerleave', () => { hoverTag.hidden = true; });
const hoverTag = document.createElement('div'); hoverTag.className = 'hover'; hoverTag.hidden = true; labelLayer.parentElement.appendChild(hoverTag);

// ---------------------------------------------------------------------------
// sound: tiny synth so the "sound" column can be heard, started only by a click
// ---------------------------------------------------------------------------
const audio = (() => {
  let ctx = null, master = null, hum = null, humGain = null, humFilter = null, noiseBuf = null;
  const ok = () => S.sound && ctx;
  function unlock() {
    if (ctx || !S.sound) return;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain(); master.gain.value = 0.6; master.connect(ctx.destination);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      hum = ctx.createOscillator(); hum.type = 'sawtooth'; hum.frequency.value = 50;
      humFilter = ctx.createBiquadFilter(); humFilter.type = 'lowpass'; humFilter.frequency.value = 500;
      humGain = ctx.createGain(); humGain.gain.value = 0;
      hum.connect(humFilter).connect(humGain).connect(master); hum.start();
    } catch { ctx = null; }
  }
  function noise(dur, freq, q, gain, type = 'bandpass') {
    if (!ok()) return;
    const s = ctx.createBufferSource(); s.buffer = noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const gn = ctx.createGain(); const t = ctx.currentTime;
    gn.gain.setValueAtTime(0, t); gn.gain.linearRampToValueAtTime(gain, t + 0.01); gn.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f).connect(gn).connect(master); s.start(t); s.stop(t + dur + 0.05);
  }
  function tone(freqs, dur, type, gain, f = 2400) {
    if (!ok()) return;
    const t = ctx.currentTime; const gn = ctx.createGain(); const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = f;
    gn.gain.setValueAtTime(0, t); gn.gain.linearRampToValueAtTime(gain, t + 0.05); gn.gain.setValueAtTime(gain, t + dur - 0.15); gn.gain.linearRampToValueAtTime(0, t + dur);
    lp.connect(gn).connect(master);
    for (const fr of freqs) { const o = ctx.createOscillator(); o.type = type; o.frequency.value = fr; o.connect(lp); o.start(t); o.stop(t + dur + 0.05); }
  }
  return {
    unlock,
    horn(type) { unlock(); if (type === 'bogie') tone([311, 370], 1.1, 'sawtooth', 0.12, 1800); else { tone([740, 1108], 1.3, 'sine', 0.1, 4000); noise(1.3, 2200, 1.5, 0.05); } },
    clunk() { unlock(); noise(0.18, 300, 1, 0.5, 'lowpass'); },
    alarm() { tone([880], 0.35, 'square', 0.06, 3000); setTimeout(() => tone([880], 0.35, 'square', 0.06, 3000), 500); },
    chuff(level) { noise(0.16, 700, 0.8, 0.35 * level); },
    running(speed, type) {
      if (!ok()) return;
      const t = ctx.currentTime;
      if (type === 'bogie') { hum.frequency.setTargetAtTime(45 + speed * 22, t, 0.2); humGain.gain.setTargetAtTime(Math.min(speed / 5, 1) * 0.07, t, 0.3); }
      else humGain.gain.setTargetAtTime(0, t, 0.2);
    },
    mute() { if (humGain && ctx) humGain.gain.setTargetAtTime(0, ctx.currentTime, 0.05); },
  };
})();

// ---------------------------------------------------------------------------
// actions (toolbar and "Try it")
// ---------------------------------------------------------------------------
let targetSpeed = 0;
function act(what) {
  audio.unlock();
  const st = V.state;
  switch (what) {
    case 'run': S.running = !S.running; targetSpeed = S.running ? 6 : 0; if (!S.running) { S.curve = false; st.game = false; } break;
    case 'curve': S.curve = !S.curve || !S.running; S.running = S.curve; st.game = S.curve; targetSpeed = S.running ? 6 : 0; break;
    case 'doors': st.doorsT = st.doorsT > 0.5 ? 0 : 1; audio.clunk(); break;
    case 'panto': { const on = V.pantos[0].target < 0.5; V.pantos[0].target = on ? 1 : 0; audio.clunk(); break; }
    case 'wipers': st.wipers = !st.wipers; break;
    case 'lights': S.lights = !S.lights; V.setLights(S.lights); break;
    case 'horn': audio.horn(V.type); if ('whistle' in st) st.whistle = 1; flashPart('horn'); break;
    case 'lever': st.leverT = st.leverT > 0.5 ? 0 : 1; audio.clunk(); break;
    case 'xray': S.xray = !S.xray; applyXray(S.xray); break;
    case 'labels': S.labels = !S.labels; if (S.mode === 'explore') refreshExploreLabels(); break;
    case 'narrate': S.narrate = !S.narrate; if (!S.narrate) stopTour(); else narrateCurrent(); break;
    case 'sound': S.sound = !S.sound; store.set('sound', S.sound); if (!S.sound) audio.mute(); else audio.unlock(); break;
    case 'show': break;
    case 'reset': frame(V.type); break;
  }
  syncToolbar();
}
function flashPart(id) {
  const p = V.parts[id]; if (!p) return;
  const t0 = performance.now();
  const tick = () => {
    const k = 1 - (performance.now() - t0) / 900; if (k <= 0) { applyHighlight(S.mode === 'explore' && S.selected ? [S.selected] : []); return; }
    for (const o of p.objects) if (o.material?.emissive) { o.material.emissive.setRGB(0.3, 0.7, 1); o.material.emissiveIntensity = k; }
    requestAnimationFrame(tick);
  };
  tick();
}
function syncToolbar() {
  for (const b of document.querySelectorAll('[data-act]')) {
    const a = b.dataset.act;
    const on = { run: S.running, lights: S.lights, xray: S.xray, labels: S.labels, sound: S.sound, narrate: S.narrate }[a];
    if (on !== undefined) b.setAttribute('aria-pressed', on ? 'true' : 'false');
  }
}
document.querySelectorAll('[data-act]').forEach(b => b.addEventListener('click', () => act(b.dataset.act)));

// ---------------------------------------------------------------------------
// panel rendering
// ---------------------------------------------------------------------------
function stageName(i) { return GAMES[S.game].stages[i]?.name || ''; }
function renderPipeline(lit = [], cur = -1, done = -1) {
  const g = GAMES[S.game];
  pipelineEl.innerHTML = g.stages.map((s, i) => `
    <button class="st ${lit.includes(i) ? 'lit' : ''} ${i === cur ? 'cur' : ''} ${i < done ? 'done' : ''}" data-stage="${i}" type="button"
      title="${esc(s.tool)} → ${esc(s.out)}">
      <i>${i + 1}</i><b>${esc(s.name)}</b><small>${esc(s.tool)}</small>
    </button>`).join('<span class="ar" aria-hidden="true"></span>');
  pipelineEl.querySelectorAll('.st').forEach(b => b.addEventListener('click', () => {
    const i = +b.dataset.stage;
    if (S.mode === 'build') {
      const steps = STEPS[S.game]; const k = steps.findIndex(s => s.stage >= i);
      if (k >= 0) { S.step = k; renderBuild(); }
    } else {
      const li = panel.querySelector(`.journey li[data-stage="${i}"]`);
      if (li) { li.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); li.classList.add('ping'); setTimeout(() => li.classList.remove('ping'), 900); }
    }
  }));
}

function renderExplore() {
  const g = GAMES[S.game];
  const parts = Object.values(V.parts);
  const groups = {};
  for (const p of parts) (groups[p.cat] ||= []).push(p);
  const sel = S.selected && V.parts[S.selected] ? V.parts[S.selected] : null;
  const k = sel ? KINDS[sel.kind] : null;
  const gk = k ? k[S.game] : null;
  const tr = sel ? TRY[sel.kind] : null;
  panel.innerHTML = `
    <div class="intro">
      <p class="eyebrow">${esc(g.name)} · ${S.type === 'bogie' ? 'Bo-Bo electric with bogies' : '0-6-0 tank engine, rigid frame'}</p>
      <p class="lede">Click any part of the locomotive, or pick one below, to see what it becomes in ${esc(g.short)}: which file holds it, how it is drawn, what moves it, how it animates and sounds, and where it passes through the pipeline.</p>
    </div>
    <div class="chips" role="list">
      ${Object.entries(CATS).filter(([c]) => groups[c]).map(([c, name]) => `
        <div class="chipgroup"><span>${esc(name)}</span>
          <div>${groups[c].map(p => `<button type="button" class="chip ${sel === p ? 'on' : ''} ${gameAbsent(p) ? 'absent' : ''}" data-part="${p.id}">${esc(p.label)}</button>`).join('')}</div>
        </div>`).join('')}
    </div>
    ${sel ? `
    <article class="card">
      <header>
        <h2>${esc(sel.label)}</h2>
        <p>${md(k.summary)}</p>
      </header>
      <div class="names">
        <div><span>In the Blender master</span><code>${esc(sel.names.tsc)}</code></div>
        <div><span>In ${esc(g.short)}</span>${md(gk.node)}</div>
      </div>
      <div class="nav" style="justify-content:flex-start;flex-wrap:wrap">
        ${tr && !gameAbsent(sel) ? `<button type="button" class="try" data-try="${tr[0]}">${esc(tr[1])}</button>` : ''}
        <button type="button" class="btn" data-read>${narrator.speaking ? 'Stop reading' : 'Read aloud'}</button>
      </div>
      <dl class="facts">
        <div><dt>Files</dt><dd>${md(gk.files)}</dd></div>
        <div><dt>How it renders</dt><dd>${md(gk.render)}</dd></div>
        <div><dt>What moves it</dt><dd>${md(gk.motion)}</dd></div>
        <div><dt>Animation</dt><dd>${md(gk.anim)}</dd></div>
        <div><dt>Sound</dt><dd>${md(gk.sound)}</dd></div>
      </dl>
      <h3>Its path through the ${esc(g.short)} pipeline</h3>
      <ol class="journey">
        ${gk.journey.map(([i, t]) => `<li data-stage="${i}"><span class="sn">${i + 1}</span><div><b>${esc(stageName(i))}</b><p>${md(t)}</p></div></li>`).join('')}
      </ol>
      <p class="compare">Same part in the other games:
        ${Object.keys(GAMES).filter(x => x !== S.game).map(x => `<button type="button" class="link" data-game-jump="${x}">${GAMES[x].short}: ${md(k[x].node.split(';')[0])}</button>`).join(' ')}
      </p>
    </article>` : ''}
  `;
  panel.querySelectorAll('[data-part]').forEach(b => b.addEventListener('click', () => select(b.dataset.part)));
  panel.querySelector('[data-try]')?.addEventListener('click', e => act(e.currentTarget.dataset.try === 'show' ? 'show' : e.currentTarget.dataset.try));
  panel.querySelectorAll('[data-game-jump]').forEach(b => b.addEventListener('click', () => setGame(b.dataset.gameJump)));
  panel.querySelector('[data-read]')?.addEventListener('click', () => { if (narrator.speaking) stopTour(); else sayPart(); });
  panel.querySelectorAll('.journey li').forEach(li => {
    li.addEventListener('mouseenter', () => renderPipeline(gk.journey.map(j => j[0]), +li.dataset.stage));
    li.addEventListener('mouseleave', () => renderPipeline(gk.journey.map(j => j[0])));
  });
  renderPipeline(gk ? gk.journey.map(j => j[0]) : []);
}
function gameAbsent(p) { return S.game === 'tf3' && p.kind === 'cab'; }

function renderBuild() {
  const steps = STEPS[S.game];
  S.step = Math.max(0, Math.min(S.step, steps.length - 1));
  const st = steps[S.step];
  const other = S.type === 'bogie' ? 'rigid' : 'bogie';
  const names = { bogie: 'With bogies (Bo-Bo electric)', rigid: 'Rigid frame (0-6-0 tank)' };
  const snip = st.snippet ? (st.snippet[S.type] || st.snippet.all) : null;
  panel.innerHTML = `
    <div class="intro">
      <p class="eyebrow">${esc(GAMES[S.game].name)} · building the ${S.type === 'bogie' ? 'bogie electric' : 'rigid tank engine'}</p>
      <p class="lede">${md(GAMES[S.game].blurb)}</p>
    </div>
    ${tourBar('Play the spoken walkthrough', 'Speaks each step and moves on by itself; the 3D view follows.')}
    <nav class="dots" aria-label="Steps">
      ${steps.map((s, i) => `<button type="button" class="dot ${i === S.step ? 'on' : ''} ${i < S.step ? 'done' : ''}" data-step="${i}" aria-label="Step ${i + 1}: ${esc(s.title)}"><span>${i + 1}</span></button>`).join('')}
    </nav>
    <article class="card step">
      <header>
        <p class="eyebrow">Step ${S.step + 1} of ${steps.length} · stage ${st.stage + 1}, ${esc(stageName(st.stage))}</p>
        <h2>${esc(st.title)}</h2>
      </header>
      <p>${md(st.text)}</p>
      ${st.bogie || st.rigid ? `
      <div class="variants">
        ${[S.type, other].filter(t => st[t]).map(t => `<div class="variant ${t === S.type ? 'mine' : ''}"><span>${esc(names[t])}${t === S.type ? '' : ' · the other type'}</span><p>${md(st[t])}</p>
          ${t !== S.type ? `<button type="button" class="link" data-type-jump="${t}">Show this vehicle</button>` : ''}</div>`).join('')}
      </div>` : ''}
      ${snip ? `<pre class="snip">${esc(snip)}</pre>` : ''}
      <div class="nav">
        <button type="button" class="btn" data-nav="-1" ${S.step === 0 ? 'disabled' : ''}>Previous</button>
        <button type="button" class="btn primary" data-nav="1" ${S.step === steps.length - 1 ? 'disabled' : ''}>Next step</button>
      </div>
    </article>
  `;
  panel.querySelectorAll('[data-step]').forEach(b => b.addEventListener('click', () => { stopTour(); S.step = +b.dataset.step; renderBuild(); if (S.narrate) narrateCurrent(); }));
  panel.querySelectorAll('[data-nav]').forEach(b => b.addEventListener('click', () => { stopTour(); S.step += +b.dataset.nav; renderBuild(); if (S.narrate) narrateCurrent(); }));
  wireTourBar();
  panel.querySelectorAll('[data-type-jump]').forEach(b => b.addEventListener('click', () => setType(b.dataset.typeJump)));
  renderPipeline([st.stage], st.stage, st.stage);
  setScene(st.state, st);
  panel.scrollTop = 0;
}

function select(id) {
  stopTour();
  S.selected = id;
  const p = V.parts[id];
  if (p && (p.kind === 'cab' || p.kind === 'driver')) S.xray = true;
  exploreScene(); renderExplore();
  if (S.narrate) sayPart();
}

// ---------------------------------------------------------------------------
// narration: read a part, read or tour the build steps, tour the curves
// ---------------------------------------------------------------------------
let touring = false;
function stopTour() { touring = false; narrator.stop(); }
const narrCtl = $('#narrctl');
function syncNarration() {
  const b = panel.querySelector('[data-read]'); if (b) b.textContent = narrator.speaking ? 'Stop reading' : 'Read aloud';
  const t = panel.querySelector('[data-tour]'); if (t) t.textContent = touring ? 'Stop the tour' : t.dataset.label;
  const label = narrator.paused ? 'Continue' : 'Pause';
  const pb = panel.querySelector('[data-pause]'); if (pb) { pb.hidden = !narrator.speaking; pb.textContent = label; }
  narrCtl.hidden = !narrator.speaking;
  const nb = narrCtl.querySelector('[data-n="toggle"]'); nb.textContent = label; nb.setAttribute('aria-pressed', narrator.paused ? 'true' : 'false');
}
narrator.attach(captionEl, syncNarration);
narrCtl.querySelector('[data-n="toggle"]').addEventListener('click', () => narrator.toggle());
narrCtl.querySelector('[data-n="stop"]').addEventListener('click', () => stopTour());
window.addEventListener('keydown', e => {
  if ((e.key === 'p' || e.key === 'P') && narrator.speaking && !e.target.closest('input, textarea, select')) { e.preventDefault(); narrator.toggle(); }
});
function partSpeech() {
  const p = V.parts[S.selected]; if (!p) return '';
  const k = KINDS[p.kind], gk = k[S.game], g = GAMES[S.game];
  return `${p.label}. ${k.summary} In ${g.name}: ${gk.node}. Files: ${gk.files}. ${gk.render} What moves it: ${gk.motion} Animation: ${gk.anim} Sound: ${gk.sound}`;
}
function sayPart() { narrator.say(partSpeech()); }
function stepSpeech(i) {
  const st = STEPS[S.game][i];
  return `Step ${i + 1}. ${st.title}. ${st.text} ${st[S.type] || ''}`;
}
function narrateCurrent() {
  if (S.mode === 'explore') sayPart();
  else if (S.mode === 'build') narrator.say(stepSpeech(S.step));
  else if (S.mode === 'sim') narrator.say(SIMTEXT[S.game].input);
  else if (S.mode === 'sound') narrator.say(SOUNDTEXT[S.game].intro);
  else narrator.say(CURVES[S.game].intro);
}
async function runTour() {
  if (touring) { stopTour(); return; }
  narrator.stop();
  touring = true;
  if (S.mode === 'build') {
    for (let i = S.step; i < STEPS[S.game].length && touring; i++) {
      S.step = i; renderBuild(); touring = true;
      const ok = await narrator.say(stepSpeech(i));
      if (!ok || !touring) break;
    }
  } else if (S.mode === 'sim') {
    sim.reset();
    for (const st of simTour(S.game, S.type)) {
      if (!touring) break;
      sim.set(st.set);
      const ok = await narrator.say(st.say);
      if (!ok) break;
    }
  } else if (S.mode === 'sound') {
    lab.start();                                    // still inside the click, so the browser lets audio start
    for (const st of soundTour(S.game, S.type)) {
      if (!touring) break;
      lab.set(st.set); renderSoundRows();
      const ok = await narrator.say(st.say);
      if (!ok) break;
    }
  } else if (S.mode === 'curves') {
    curves.stopPlay();
    for (const st of tourFor(S.game, S.type)) {
      if (!touring) break;
      curves.set(st.set);
      const ok = await narrator.say(st.say);
      if (!ok) break;
    }
  }
  touring = false; narrator.stop();
}
function tourBar(label, note) {
  const voices = narrator.voices;
  return `<div class="tourbar">
    <button type="button" class="btn primary" data-tour data-label="${esc(label)}">${touring ? 'Stop the tour' : esc(label)}</button>
    <button type="button" class="btn" data-pause ${narrator.speaking ? '' : 'hidden'}>${narrator.paused ? 'Continue' : 'Pause'}</button>
    <label class="sr" for="nar-rate" style="display:none">Speed</label>
    <select id="nar-rate" aria-label="Speaking speed">${[[0.85, 'Slower'], [1, 'Normal speed'], [1.2, 'Faster']].map(([v, t]) => `<option value="${v}" ${narrator.rate === v ? 'selected' : ''}>${t}</option>`).join('')}</select>
    ${voices.length ? `<select id="nar-voice" aria-label="Voice">${voices.map(v => `<option ${narrator.voice === v.name ? 'selected' : ''}>${esc(v.name)}</option>`).join('')}</select>` : ''}
    <small>${voices.length ? esc(note) : 'This browser has no speech voices, so the tour plays with captions only.'}</small>
  </div>`;
}
function wireTourBar() {
  panel.querySelector('[data-tour]')?.addEventListener('click', () => { audio.unlock(); runTour(); });
  panel.querySelector('[data-pause]')?.addEventListener('click', () => narrator.toggle());
  panel.querySelector('#nar-rate')?.addEventListener('change', e => { narrator.rate = +e.target.value; });
  panel.querySelector('#nar-voice')?.addEventListener('change', e => { narrator.voice = e.target.value; });
}

// ---------------------------------------------------------------------------
// bogies on curves
// ---------------------------------------------------------------------------
const curves = createCurves(curvesEl);
function renderCurves() {
  const c = CURVES[S.game], T = SLIDERS[S.game], g = GAMES[S.game];
  panel.innerHTML = `
    <div class="intro">
      <p class="eyebrow">${esc(g.name)} · ${S.type === 'bogie' ? 'bogie electric' : 'rigid tank engine'} on straights and curves</p>
      <p class="lede">The plan view follows the vehicle from straight track into a curve. ${S.type === 'bogie' ? 'The two lower sliders are the two numbers that decide where a bogie turns in this engine.' : 'A rigid frame has no bogies, so watch the middle wheelset.'}</p>
    </div>
    ${tourBar('Play the spoken explanation', 'The tour moves the vehicle and the sliders while it speaks.')}
    <article class="card">
      <header><h2>How ${esc(g.short)} moves body, bogies and wheels</h2></header>
      <p>${md(c.intro)}</p>
      ${S.type === 'rigid' ? `<p>${md(c.rigid)}</p>` : ''}
      <h3>Where each number comes from</h3>
      <div class="tablewrap"><table class="maptable">
        <thead><tr><th>Question</th><th>You set it in</th><th>The engine uses it for</th></tr></thead>
        <tbody>${c.rows.map(r => `<tr><td>${md(r[0])}</td><td>${md(r[1])}</td><td>${md(r[2])}</td></tr>`).join('')}</tbody>
      </table></div>
      <h3>On straights and in curves</h3>
      <ol class="journey">
        <li><span class="sn">1</span><div><b>Straight track</b><p>Body, bogies and wheelsets line up on the centreline. Nothing rotates, so a wrong pivot does not show.</p></div></li>
        <li><span class="sn">2</span><div><b>Entering the curve</b><p>${S.type === 'bogie' ? 'The front bogie turns to follow the rails while the body still points straight on.' : 'The front wheelset meets the curve; the whole frame starts to turn as one piece.'}</p></div></li>
        <li><span class="sn">3</span><div><b>In the curve</b><p>${S.type === 'bogie' ? 'The body is a straight chord between the two pivots: its middle sits inside the curve, its ends swing outside, and the bogies turn by equal and opposite angles relative to the body.' : 'The frame is a chord between its outer wheelsets; the middle wheelset is pushed inward by the versine of the wheelbase.'}</p></div></li>
        <li><span class="sn">4</span><div><b>Wheels</b><p>${md(c.rows.find(r => /spin/.test(r[0]))?.[2] || '')}</p></div></li>
      </ol>
      ${S.type === 'bogie' ? `<h3>When Blender and the editor disagree</h3><p class="callout">${md(c.wrong)}</p>
      <p class="compare">Try it: press <b>Show a mismatch</b> under the view, then drive into the curve. The sliders here are <b>${esc(T.mesh[0])}</b> and <b>${esc(T.edit[0])}</b>.</p>` : ''}
      <p class="compare">Same question in the other games:
        ${Object.keys(GAMES).filter(x => x !== S.game).map(x => `<button type="button" class="link" data-game-jump="${x}">${GAMES[x].short}</button>`).join(' ')}</p>
    </article>`;
  wireTourBar();
  panel.querySelectorAll('[data-game-jump]').forEach(b => b.addEventListener('click', () => setGame(b.dataset.gameJump)));
  renderPipeline(c.lit);
}

// ---------------------------------------------------------------------------
// how simulation works
// ---------------------------------------------------------------------------
let chuffAngle = 0, lastChuff = 0;
const sim = createSim(simEl, {
  alarm: () => audio.alarm?.(),
  tick: (st) => {
    audio.running(Math.abs(st.v), S.type);
    if (S.type === 'rigid' && Math.abs(st.v) > 0.05) {
      chuffAngle += Math.abs(st.v) / 0.66 / 60;
      const q = Math.floor(chuffAngle / (Math.PI / 2)); if (q !== lastChuff) { lastChuff = q; audio.chuff(Math.min(1, 0.3 + st.te / 95)); }
    }
  },
});
function renderSim() {
  const T = SIMTEXT[S.game], g = GAMES[S.game];
  const scriptHTML = Object.entries(SCRIPTS).map(([k, sc]) => {
    const impl = sc[S.game];
    return `<div class="scriptcard"><h4>${esc(sc.name)}</h4><p>${md(sc.what)}</p>
      ${impl ? `<p>${md(impl.how)}</p><pre class="snip">${esc(impl.code)}</pre>` : `<p><b>Not possible in ${esc(g.short)}:</b> there is no per-frame vehicle script and no driver to act on.</p>`}</div>`;
  }).join('');
  panel.innerHTML = `
    <div class="intro">
      <p class="eyebrow">${esc(g.name)} · ${S.type === 'bogie' ? 'Bo-Bo electric' : '0-6-0 tank engine'} · how simulation works</p>
      <p class="lede">${S.game === 'tf3' ? 'Set a line speed and watch the AI drive.' : 'Drive it: release the brake, reverser forward, open the throttle. Use the keys or the sliders under the charts.'} The model is an illustration with typical numbers, built from the same parts each engine has.</p>
    </div>
    ${tourBar('Play the spoken explanation', 'The tour drives the train while it explains: power, adhesion, braking, then scripts.')}
    ${TOPICS.filter(([k]) => k !== 'where' && k !== 'script').map(([k, title]) => `<article class="card topic"><h3>${esc(title)}</h3><p>${md(T[k])}</p></article>`).join('')}
    <article class="card topic"><h3>Where scripting fits</h3><p>${md(T.script)}</p>
      <p class="compare">Switch the scripts on under the charts; each changes the live behaviour. How each is built in ${esc(g.short)}:</p>
      ${scriptHTML}
    </article>
    <article class="card topic"><h3>Where the numbers live in ${esc(g.short)}</h3>
      <div class="tablewrap"><table class="maptable"><tbody>${T.where.map(r => `<tr><td>${md(r[0])}</td><td>${md(r[1])}</td></tr>`).join('')}</tbody></table></div>
      <p class="compare">Same question in the other games:
        ${Object.keys(GAMES).filter(x => x !== S.game).map(x => `<button type="button" class="link" data-game-jump="${x}">${GAMES[x].short}</button>`).join(' ')}</p>
    </article>`;
  wireTourBar();
  panel.querySelectorAll('[data-game-jump]').forEach(b => b.addEventListener('click', () => setGame(b.dataset.gameJump)));
  renderPipeline(T.lit);
}

// ---------------------------------------------------------------------------
// how sound works
// ---------------------------------------------------------------------------
const lab = createSound(soundEl, { select: () => renderSoundRows() });
// highlight the selected layer's row in the panel table
function renderSoundRows() {
  const sel = lab.state.sel;
  panel.querySelectorAll('[data-srow]').forEach(r => r.classList.toggle('hot', r.dataset.srow === sel));
}
function renderSound() {
  const T = SOUNDTEXT[S.game], g = GAMES[S.game];
  const name = l => (typeof l.name === 'string' ? l.name : l.name[S.type]);
  panel.innerHTML = `
    <div class="intro">
      <p class="eyebrow">${esc(g.name)} · ${S.type === 'bogie' ? 'Bo-Bo electric' : '0-6-0 tank engine'} · how sound works</p>
      <p class="lede">Press <b>Start listening</b>, then move speed, power and brake. Click a layer to see the curve that drives it; <b>S</b> solos it, <b>M</b> mutes it. The sounds are synthesized stand-ins; what drives them is how the engines work.</p>
    </div>
    ${tourBar('Play the spoken explanation', 'The tour drives the lab while it speaks: motors, joints, curves, brakes, then where you listen from.')}
    <article class="card">
      <header><h2>How ${esc(g.short)} builds a vehicle's sound</h2></header>
      <p>${md(T.intro)}</p>
      <h3>Each layer in ${esc(g.short)}</h3>
      <div class="tablewrap"><table class="maptable">
        <thead><tr><th>Layer</th><th>What drives it</th><th>Where you author it</th></tr></thead>
        <tbody>${LAYERS.map(l => `<tr data-srow="${l.id}"><td>${esc(name(l))}</td><td>${md(T.rows[l.id][0])}</td><td>${md(T.rows[l.id][1])}</td></tr>`).join('')}</tbody>
      </table></div>
      <p class="compare">${md(T.files)}</p>
    </article>
    ${SOUNDTOPICS.map(([k, title, text]) => `<article class="card topic"><h3>${esc(title)}</h3><p>${md(text)}</p>${k === 'listen' ? `<p><b>In ${esc(g.short)}:</b> ${md(T.listen)}</p>` : ''}</article>`).join('')}
    <article class="card topic"><h3>Scripts and sound in ${esc(g.short)}</h3><p>${md(T.script)}</p>
      <p class="compare">Same question in the other games:
        ${Object.keys(GAMES).filter(x => x !== S.game).map(x => `<button type="button" class="link" data-game-jump="${x}">${GAMES[x].short}</button>`).join(' ')}</p>
    </article>`;
  wireTourBar();
  panel.querySelectorAll('[data-game-jump]').forEach(b => b.addEventListener('click', () => setGame(b.dataset.gameJump)));
  renderSoundRows();
  renderPipeline(T.lit);
}

// ---------------------------------------------------------------------------
// top-level switches
// ---------------------------------------------------------------------------
function setGame(g) { stopTour(); S.game = g; store.set('game', g); curves.setGame(g); sim.setGame(g); lab.setGame(g); render(); }
function setType(t) {
  if (S.type === t) return;
  stopTour();
  S.type = t; store.set('type', t); curves.setType(t); sim.setType(t); lab.setType(t);
  if (S.selected && !getVehicle(t).parts[S.selected]) S.selected = null;
  mountVehicle(); render(); frame(t);
}
function mountVehicle() {
  for (const v of Object.values(vehicles)) { v.root.removeFromParent(); v.lite.root.removeFromParent(); }
  V = getVehicle(S.type);
  scene.add(V.root); scene.add(V.lite.root);
}
let lastMode = S.mode;
function render() {
  if (S.mode !== lastMode && S.mode === 'explore') { S.xray = false; S.running = false; targetSpeed = 0; S.curve = false; }
  lastMode = S.mode;
  app.dataset.game = S.game; app.dataset.mode = S.mode;
  store.set('mode', S.mode);
  document.querySelectorAll('.bar [data-mode]').forEach(b => b.setAttribute('aria-pressed', b.dataset.mode === S.mode ? 'true' : 'false'));
  document.querySelectorAll('.bar [data-game]').forEach(b => b.setAttribute('aria-pressed', b.dataset.game === S.game ? 'true' : 'false'));
  document.querySelectorAll('.bar [data-type]').forEach(b => b.setAttribute('aria-pressed', b.dataset.type === S.type ? 'true' : 'false'));
  const curvesOn = S.mode === 'curves', simOn = S.mode === 'sim', soundOn = S.mode === 'sound', flat = curvesOn || simOn || soundOn;
  canvas.hidden = flat; labelLayer.hidden = flat;
  document.querySelector('.tools').hidden = flat; document.querySelector('.legend').hidden = flat;
  if (!curvesOn) curves.hide();
  if (!simOn) sim.hide();
  if (!soundOn) lab.hide();
  if (curvesOn) { curves.show(S.game, S.type); renderCurves(); themeColors(); return; }
  if (simOn) { sim.show(S.game, S.type); renderSim(); themeColors(); return; }
  if (soundOn) { lab.show(S.game, S.type); renderSound(); themeColors(); return; }
  if (S.mode === 'explore') {
    if (!S.selected || !V.parts[S.selected]) S.selected = S.type === 'bogie' ? 'wheels_f' : 'wheels';
    if (S.selected === 'cab' || S.selected === 'driver') S.xray = true;
    exploreScene(); renderExplore();
  } else renderBuild();
  themeColors();
}
document.querySelectorAll('.bar [data-mode]').forEach(b => b.addEventListener('click', () => { stopTour(); S.mode = b.dataset.mode; if (S.mode === 'explore') { S.xray = false; S.running = false; targetSpeed = 0; S.curve = false; } render(); }));
document.querySelectorAll('.bar [data-game]').forEach(b => b.addEventListener('click', () => setGame(b.dataset.game)));
document.querySelectorAll('.bar [data-type]').forEach(b => b.addEventListener('click', () => setType(b.dataset.type)));
window.addEventListener('keydown', e => {
  if (S.mode !== 'build' || e.target.closest('input, textarea, select')) return;
  if (e.key === 'ArrowRight') { stopTour(); S.step++; renderBuild(); }
  if (e.key === 'ArrowLeft') { stopTour(); S.step--; renderBuild(); }
});

// theme changes (system or viewer toggle)
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', themeColors);
new MutationObserver(themeColors).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

// ---------------------------------------------------------------------------
// loop
// ---------------------------------------------------------------------------
const clock = new THREE.Clock();
let lastQuarter = 0, elapsed = 0;
function resize() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (canvas.width !== Math.round(w * renderer.getPixelRatio()) || canvas.height !== Math.round(h * renderer.getPixelRatio())) {
    renderer.setSize(w, h, false); camera.aspect = w / Math.max(h, 1); camera.updateProjectionMatrix();
  }
}
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
function loop() {
  const dt = Math.min(clock.getDelta(), 0.05); elapsed += dt;
  if (S.mode === 'curves') { curves.update(dt); audio.running(0, V.type); requestAnimationFrame(loop); return; }
  if (S.mode === 'sim') { sim.update(dt); requestAnimationFrame(loop); return; }
  if (S.mode === 'sound') { lab.update(dt); audio.running(0, V.type); requestAnimationFrame(loop); return; }
  resize();
  const st = V.state;
  const accel = reduced ? 100 : 3;
  st.speed += Math.sign(targetSpeed - st.speed) * Math.min(Math.abs(targetSpeed - st.speed), dt * accel);
  if (stateLoop) stateLoop(elapsed);
  for (const [m, d] of V.movers) if (!d.animDriven) m.position.copy(d.base);
  V.anim(dt);
  V.lite.anim?.(0);
  applyExplode(V, dt);
  track.userData.update(st.speed * dt);
  // chuffs: four per wheel revolution on the steam engine
  if (V.type === 'rigid' && st.speed > 0.05) {
    const q = Math.floor(st.wheelAngle / (Math.PI / 2));
    if (q !== lastQuarter) { lastQuarter = q; audio.chuff(Math.min(1, 0.4 + st.speed / 8)); }
  }
  audio.running(st.speed, V.type);
  headBeam.intensity = S.lights ? 6 : 0;
  headBeam.position.set(V.type === 'bogie' ? 9.2 : 5.3, 1.8, 0);
  if (camAnim) {
    camAnim.t = Math.min(1, camAnim.t + dt * 1.6);
    const e = 1 - Math.pow(1 - camAnim.t, 3);
    camera.position.lerpVectors(camAnim.from, camAnim.to, e); controls.target.lerpVectors(camAnim.tf, camAnim.tt, e);
    if (camAnim.t >= 1) camAnim = null;
  }
  controls.update();
  updateBones();
  renderer.render(scene, camera);
  updateLabels();
  requestAnimationFrame(loop);
}

// ---------------------------------------------------------------------------
// boot
// ---------------------------------------------------------------------------
mountVehicle();
frame(S.type, true);
render();
loop();

// handle for tests and the guide's screenshots
window.lpe = {
  get state() { return { mode: S.mode, game: S.game, type: S.type, step: S.step, selected: S.selected, parts: Object.keys(V.parts) }; },
  select, setGame, setType, act,
  setMode(m) { S.mode = m; render(); },
  goStep(i) { S.mode = 'build'; S.step = i; render(); },
  screenPos(id) {
    const p = V.parts[id]; if (!p) return null;
    const box = new THREE.Box3(); for (const o of p.objects) if (o.visible !== false) box.expandByObject(o);
    const c = box.getCenter(new THREE.Vector3()).project(camera); const r = canvas.getBoundingClientRect();
    return { x: r.left + (c.x + 1) / 2 * r.width, y: r.top + (1 - c.y) / 2 * r.height };
  },
  curves: { get params() { return curves.params; }, get geometry() { return curves.geometry; }, set: (o, i) => curves.set(o, i) },
  tour: runTour, stopTour, get touring() { return touring; },
  narrator: { pause: () => narrator.pause(), resume: () => narrator.resume(), get paused() { return narrator.paused; }, get speaking() { return narrator.speaking; } },
  sim: { get state() { return sim.state; }, set: (o) => sim.set(o), reset: () => sim.reset() },
  sound: { get state() { return lab.state; }, set: (o) => lab.set(o), start: () => lab.start(), stop: () => lab.stop(), horn: (on) => lab.horn(on) },
  view(pos, tgt) { camera.position.set(...pos); controls.target.set(...tgt); controls.update(); },
};
