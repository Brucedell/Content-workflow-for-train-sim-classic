// Interactive vehicle viewer for the store landing page.
// Loads a random .glb from the pool, lets the visitor orbit it, and plays a named
// animation when a hotspot node (from the manifest) is clicked.
//
// Blender-generalist reading of this file:
//   scene      = a .blend scene        camera/light = same as in Blender
//   renderer   = the viewport          OrbitControls = middle-mouse orbit / scroll zoom
//   GLTFLoader = File > Import         AnimationMixer = the NLA editor playing a strip
//   Raycaster  = clicking in the viewport to select the object under the mouse
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const POOL = window.MODEL_POOL || ['models/sample_electric.manifest.json'];

const canvas = document.getElementById('viewer');
const hotspotList = document.getElementById('hotspots');
const titleEl = document.getElementById('model-title');
const blurbEl = document.getElementById('model-blurb');
const statusEl = document.getElementById('status');
const labelEl = document.getElementById('hover-label');

// ---- renderer, scene, camera, lights, controls --------------------------
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 500);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI * 0.49;          // never go below the rails

scene.add(new THREE.HemisphereLight(0xdfe9ff, 0x303030, 1.1));
const sun = new THREE.DirectionalLight(0xffffff, 2.2);
sun.position.set(12, 18, 10);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
scene.add(sun);

const ground = new THREE.Mesh(
  new THREE.CircleGeometry(60, 64),
  new THREE.ShadowMaterial({ opacity: 0.35 }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// ---- state ---------------------------------------------------------------
let model = null, mixer = null, manifest = null;
const actions = new Map();           // animation name -> THREE.AnimationAction
const hotspotByNode = new Map();     // node name -> hotspot entry
const playing = new Map();           // animation name -> true when played forward
const clock = new THREE.Clock();
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

// ---- loading -------------------------------------------------------------
async function loadRandom() {
  const url = POOL[Math.floor(Math.random() * POOL.length)];
  await load(url);
}

async function load(manifestUrl) {
  statusEl.textContent = 'Loading…';
  const base = manifestUrl.substring(0, manifestUrl.lastIndexOf('/') + 1);
  manifest = await (await fetch(manifestUrl)).json();
  const gltf = await new GLTFLoader().loadAsync(base + manifest.model);

  if (model) scene.remove(model);
  actions.clear(); hotspotByNode.clear(); playing.clear();
  model = gltf.scene;
  model.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  scene.add(model);

  // animations: one AnimationAction per named clip, clamped so doors stay open
  mixer = new THREE.AnimationMixer(model);
  for (const clip of gltf.animations) {
    const a = mixer.clipAction(clip);
    a.setLoop(THREE.LoopOnce, 1);
    a.clampWhenFinished = true;
    actions.set(clip.name, a);
  }
  for (const h of manifest.hotspots) hotspotByNode.set(h.node, h);

  frameModel();
  buildHotspotList();
  titleEl.textContent = manifest.title;
  blurbEl.textContent = manifest.blurb || '';
  statusEl.textContent = `${manifest.triangles.toLocaleString()} triangles · ${gltf.animations.length} animations · click a part`;
}

function frameModel() {
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  model.position.y -= box.min.y;                       // rails on the ground plane
  center.y -= box.min.y;
  const radius = Math.max(size.x, size.y, size.z);
  camera.position.set(center.x + radius * 0.9, center.y + radius * 0.45, center.z + radius * 0.9);
  controls.target.copy(center);
  controls.minDistance = radius * 0.3;
  controls.maxDistance = radius * 3;
  controls.update();
}

// ---- hotspots ------------------------------------------------------------
function buildHotspotList() {
  hotspotList.innerHTML = '';
  const seen = new Set();                              // several nodes can share one label (two pantograph arms)
  for (const h of manifest.hotspots) {
    if (seen.has(h.label)) continue;
    seen.add(h.label);
    const b = document.createElement('button');
    b.textContent = h.label;
    b.dataset.node = h.node;
    b.dataset.label = h.label;
    b.onclick = () => trigger(h.node);
    hotspotList.appendChild(b);
  }
}

// Play the hotspot's animation; a second click plays it backwards (close the door).
function trigger(nodeName) {
  const h = hotspotByNode.get(nodeName);
  if (!h) return false;
  for (const name of h.animations) {
    const a = actions.get(name);
    if (!a) { console.warn('no animation named', name); continue; }
    const forward = !playing.get(name);
    a.reset();
    a.timeScale = forward ? 1 : -1;
    if (!forward) a.time = a.getClip().duration;
    a.play();
    playing.set(name, forward);
  }
  flash(nodeName);
  const btn = hotspotList.querySelector(`[data-label="${h.label}"]`);
  if (btn) btn.classList.toggle('active');
  return true;
}

function flash(nodeName) {
  const obj = model.getObjectByName(nodeName);
  if (!obj) return;
  obj.traverse(o => {
    if (!o.isMesh) return;
    const mat = o.material;
    const old = mat.emissive ? mat.emissive.clone() : null;
    if (mat.emissive) mat.emissive.set(0x3a7bd5);
    setTimeout(() => { if (old) mat.emissive.copy(old); }, 350);
  });
}

// Which hotspot is under the pointer? Walk up the parents until a hotspot node is found.
function pick(ev) {
  const r = canvas.getBoundingClientRect();
  pointer.x = ((ev.clientX - r.left) / r.width) * 2 - 1;
  pointer.y = -((ev.clientY - r.top) / r.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObject(model, true);
  for (const hit of hits) {
    let o = hit.object;
    while (o) {
      if (hotspotByNode.has(o.name)) return o.name;
      o = o.parent;
    }
  }
  return null;
}

let downAt = null;
canvas.addEventListener('pointerdown', ev => { downAt = [ev.clientX, ev.clientY]; });
canvas.addEventListener('pointerup', ev => {
  if (!downAt || !model) return;
  const moved = Math.hypot(ev.clientX - downAt[0], ev.clientY - downAt[1]);
  downAt = null;
  if (moved > 6) return;                               // it was an orbit drag, not a click
  const node = pick(ev);
  if (node) trigger(node);
});
canvas.addEventListener('pointermove', ev => {
  if (!model) return;
  const node = pick(ev);
  canvas.style.cursor = node ? 'pointer' : 'grab';
  if (node) {
    labelEl.textContent = hotspotByNode.get(node).label;
    labelEl.style.left = ev.clientX + 12 + 'px';
    labelEl.style.top = ev.clientY + 12 + 'px';
    labelEl.hidden = false;
  } else labelEl.hidden = true;
});

// ---- resize + render loop -----------------------------------------------
function resize() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (canvas.width !== w || canvas.height !== h) {
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
}
function animate() {
  resize();
  if (mixer) mixer.update(clock.getDelta());
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}
animate();

document.getElementById('shuffle')?.addEventListener('click', loadRandom);
loadRandom();

// Exposed for tests and for other page scripts (e.g. a "raise pantograph" link in the copy).
window.viewer = { load, trigger, get manifest() { return manifest; }, get ready() { return !!model; },
  screenPos(nodeName) {                                // where a node is on screen, for tests
    const obj = model?.getObjectByName(nodeName);
    if (!obj) return null;
    const p = new THREE.Box3().setFromObject(obj).getCenter(new THREE.Vector3()).project(camera);
    const r = canvas.getBoundingClientRect();
    return { x: r.left + (p.x + 1) / 2 * r.width, y: r.top + (1 - p.y) / 2 * r.height };
  } };
