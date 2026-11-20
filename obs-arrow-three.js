import * as THREE from '/vendor/three/three.module.js';

const canvas = document.getElementById('arrow');
const status = document.getElementById('status');
const token = location.hash.slice(1);
const debug = new URLSearchParams(location.search).get('debug') === '1';
const deadZone = 0.1;
const staleAfterMs = 2400;
const DEFAULT_VIEW_ELEVATION = 12;
const MIN_VIEW_ELEVATION = 5;
const MAX_VIEW_ELEVATION = 25;
const viewPreferenceKey = `gamejoy.obs.arrow.view.${token || 'default'}`;
const tiltPanel = document.getElementById('tilt-panel');
const tiltRange = document.getElementById('tilt-range');
const tiltValue = document.getElementById('tilt-value');

function setStatus(message) {
  status.textContent = message;
  status.hidden = !message;
}

let renderer;
try {
  renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: true,
    powerPreference: 'high-performance'
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
} catch (error) {
  setStatus('No se pudo iniciar el espacio 3D de GameJoy');
  throw error;
}

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(39, window.innerWidth / window.innerHeight, 0.1, 80);
const cameraTarget = new THREE.Vector3(0, 0, -1.2);
const cameraOrbitDistance = 16;
function setViewElevation(degrees, persist = false) {
  const elevation = THREE.MathUtils.clamp(degrees, MIN_VIEW_ELEVATION, MAX_VIEW_ELEVATION);
  const radians = THREE.MathUtils.degToRad(elevation);
  camera.position.set(
    cameraTarget.x,
    cameraTarget.y + Math.sin(radians) * cameraOrbitDistance,
    cameraTarget.z + Math.cos(radians) * cameraOrbitDistance
  );
  camera.lookAt(cameraTarget);
  tiltRange.value = String(Math.round(elevation));
  tiltValue.value = `${Math.round(elevation)}°`;
  if (persist) {
    try { localStorage.setItem(viewPreferenceKey, String(elevation)); } catch (_) {}
  }
}

let initialViewElevation = DEFAULT_VIEW_ELEVATION;
try {
  const savedView = Number(localStorage.getItem(viewPreferenceKey));
  if (Number.isFinite(savedView) && savedView >= MIN_VIEW_ELEVATION && savedView <= MAX_VIEW_ELEVATION) {
    initialViewElevation = savedView;
  }
} catch (_) {}
setViewElevation(initialViewElevation);

tiltRange.addEventListener('input', () => setViewElevation(Number(tiltRange.value), true));
document.getElementById('tilt-reset').addEventListener('click', () => {
  setViewElevation(DEFAULT_VIEW_ELEVATION, true);
});
document.getElementById('tilt-close').addEventListener('click', () => { tiltPanel.hidden = true; });
window.addEventListener('keydown', event => {
  const isEditingControl = event.target instanceof HTMLElement &&
    event.target.closest('input, button, textarea, select');
  if (!isEditingControl && event.key.toLowerCase() === 't') {
    tiltPanel.hidden = !tiltPanel.hidden;
    event.preventDefault();
  } else if (event.key === 'Escape') {
    tiltPanel.hidden = true;
  }
});

scene.add(new THREE.AmbientLight(0x9bdfff, 1.6));
const keyLight = new THREE.DirectionalLight(0xe9fbff, 2.7);
keyLight.position.set(-4, 8, 6);
scene.add(keyLight);
const rimLight = new THREE.PointLight(0x20bfff, 13, 18, 2);
rimLight.position.set(0, 3, -2);
scene.add(rimLight);

const floorGeometry = new THREE.PlaneGeometry(24, 32);
floorGeometry.rotateX(-Math.PI / 2);
const floor = new THREE.Mesh(floorGeometry, new THREE.MeshBasicMaterial({
  color: 0x0d3345,
  transparent: true,
  opacity: 0.055,
  side: THREE.DoubleSide,
  depthWrite: false
}));
floor.position.set(0, -0.08, -3);
scene.add(floor);

const grid = new THREE.GridHelper(24, 24, 0x68e4ff, 0x42b7e9);
grid.position.set(0, -0.055, -3);
for (const material of Array.isArray(grid.material) ? grid.material : [grid.material]) {
  material.transparent = true;
  material.opacity = 0.22;
  material.depthWrite = false;
}
scene.add(grid);

const anchor = new THREE.Group();
anchor.position.set(0, 0, 2.15);
scene.add(anchor);

const anchorBase = new THREE.Mesh(
  new THREE.CylinderGeometry(0.32, 0.38, 0.12, 48),
  new THREE.MeshStandardMaterial({
    color: 0x102d3b,
    emissive: 0x062638,
    roughness: 0.34,
    metalness: 0.35
  })
);
anchorBase.position.y = 0.035;
anchor.add(anchorBase);

const anchorRing = new THREE.Mesh(
  new THREE.TorusGeometry(0.245, 0.026, 8, 48),
  new THREE.MeshBasicMaterial({ color: 0x51dcff, transparent: true, opacity: 0.9 })
);
anchorRing.rotation.x = Math.PI / 2;
anchorRing.position.y = 0.12;
anchor.add(anchorRing);

const anchorCore = new THREE.Mesh(
  new THREE.SphereGeometry(0.105, 20, 14),
  new THREE.MeshStandardMaterial({
    color: 0xc7faff,
    emissive: 0x32cfff,
    emissiveIntensity: 1.7,
    roughness: 0.22,
    metalness: 0.1
  })
);
anchorCore.position.y = 0.18;
anchor.add(anchorCore);

const arrow = new THREE.Group();
arrow.visible = false;
scene.add(arrow);

const glowMaterial = new THREE.MeshBasicMaterial({
  color: 0x12aaff,
  transparent: true,
  opacity: 0.3,
  depthWrite: false
});
const shaftMaterial = new THREE.MeshStandardMaterial({
  color: 0x58e5ff,
  emissive: 0x159fff,
  emissiveIntensity: 1.5,
  roughness: 0.24,
  metalness: 0.18
});
const glowShaft = new THREE.Mesh(new THREE.BufferGeometry(), glowMaterial);
const shaft = new THREE.Mesh(new THREE.BufferGeometry(), shaftMaterial);
const glowHead = new THREE.Mesh(
  new THREE.ConeGeometry(0.48, 1.08, 8),
  glowMaterial
);
const head = new THREE.Mesh(
  new THREE.ConeGeometry(0.34, 0.82, 8),
  new THREE.MeshStandardMaterial({
    color: 0x8bf5ff,
    emissive: 0x148fff,
    emissiveIntensity: 1.7,
    roughness: 0.2,
    metalness: 0.12
  })
);
arrow.add(glowShaft, shaft, glowHead, head);

let targetX = 0;
let targetY = 0;
let currentX = 0;
let currentY = 0;
let targetActive = false;
let lastPacketAt = 0;
let lastFrameAt = 0;
let lastArrowKey = '';

function acceptInput(data) {
  if (!data || !Number.isFinite(data.x) || !Number.isFinite(data.y) ||
      data.x < -1 || data.x > 1 || data.y < -1 || data.y > 1) return;
  targetX = data.x;
  targetY = data.y;
  targetActive = data.active === true && Math.hypot(targetX, targetY) > deadZone;
  lastPacketAt = performance.now();
  if (targetActive) {
    if (debug) setStatus('Recibiendo movimiento del mando');
    else status.hidden = true;
  } else {
    setStatus(debug ? 'Overlay conectado · mando centrado' : '');
  }
}

function updateArrow(x, y, magnitude) {
  const start = new THREE.Vector3(0, 0.22, 2.15);
  const forward = Math.max(0, y);
  const backward = Math.max(0, -y);
  const travel = 0.7 + forward * 4.7 + backward * 2.9 + Math.abs(x) * 1.8;
  const deltaZ = (backward - forward) * travel;
  const reach = 0.58 + 0.42 * magnitude;
  const end = new THREE.Vector3(x * 2.9 * reach, 0.22, start.z + deltaZ);
  const middle1 = new THREE.Vector3(end.x * 0.06, 0.22, start.z + deltaZ * 0.34);
  const middle2 = new THREE.Vector3(end.x * 0.72, 0.22, start.z + deltaZ * 0.79);
  const curve = new THREE.CatmullRomCurve3([start, middle1, middle2, end]);
  const radiusScale = 0.76 + magnitude * 0.24;

  for (const mesh of [glowShaft, shaft]) {
    const oldGeometry = mesh.geometry;
    mesh.geometry = new THREE.TubeGeometry(curve, 48, (mesh === shaft ? 0.083 : 0.19) * radiusScale, 12, false);
    oldGeometry.dispose();
  }

  const tangent = curve.getTangent(1).normalize();
  const tip = curve.getPoint(1);
  const up = new THREE.Vector3(0, 1, 0);
  for (const [mesh, height] of [[glowHead, 1.08], [head, 0.82]]) {
    mesh.position.copy(tip).addScaledVector(tangent, -height * 0.48);
    mesh.quaternion.setFromUnitVectors(up, tangent);
  }
}

function resize() {
  const width = Math.max(1, window.innerWidth);
  const height = Math.max(1, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

function render(now) {
  const dt = lastFrameAt ? Math.min(64, now - lastFrameAt) : 16;
  lastFrameAt = now;
  const blend = 1 - Math.exp(-dt / 115);

  if (now - lastPacketAt > staleAfterMs) {
    targetX = 0;
    targetY = 0;
    if (targetActive && debug) setStatus('Overlay conectado · mando centrado');
    targetActive = false;
  }

  currentX += (targetX - currentX) * blend;
  currentY += (targetY - currentY) * blend;
  const magnitude = Math.min(1, Math.hypot(currentX, currentY));
  const moving = targetActive || magnitude > 0.075;
  const arrowKey = moving ? `${Math.round(currentX * 50)}:${Math.round(currentY * 50)}` : 'center';

  if (arrowKey !== lastArrowKey) {
    if (moving) updateArrow(currentX, currentY, magnitude);
    arrow.visible = moving;
    lastArrowKey = arrowKey;
  }

  renderer.render(scene, camera);
  requestAnimationFrame(render);
}

window.addEventListener('resize', resize, { passive: true });

if (!/^[a-f0-9]{64}$/.test(token)) {
  setStatus('Copia el enlace de GameJoy y cambia /obs/map por /obs/arrow');
} else if (typeof io !== 'function') {
  setStatus('No se pudo conectar con el servidor de GameJoy');
} else {
  setStatus('Conectando con GameJoy…');
  const socket = io({ autoConnect: false, reconnection: true });
  socket.on('connect', () => {
    setStatus('Esperando el mando…');
    socket.emit('gamejoy:obs-subscribe', { token });
  });
  socket.on('gamejoy:obs-ready', () => setStatus(debug ? 'Overlay conectado · mando centrado' : ''));
  socket.on('gamejoy:obs-input', acceptInput);
  socket.on('gamejoy:obs-stopped', () => {
    acceptInput({ x: 0, y: 0, active: false });
    setStatus('GameJoy dejó de compartir');
  });
  socket.on('gamejoy:obs-error', data => setStatus(data?.message || 'Overlay no disponible'));
  socket.on('disconnect', () => {
    acceptInput({ x: 0, y: 0, active: false });
    setStatus('Reconectando con GameJoy…');
  });
  socket.on('connect_error', () => setStatus('No se pudo conectar con el servidor'));
  socket.connect();
}

requestAnimationFrame(render);
