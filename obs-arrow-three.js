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
document.getElementById('tilt-close').addEventListener('click', () => {
  tiltPanel.hidden = true;
  syncCalibrationScene();
});
window.addEventListener('keydown', event => {
  const isEditingControl = event.target instanceof HTMLElement &&
    event.target.closest('input, button, textarea, select');
  if (!isEditingControl && event.key.toLowerCase() === 't') {
    tiltPanel.hidden = !tiltPanel.hidden;
    syncCalibrationScene();
    event.preventDefault();
  } else if (event.key === 'Escape') {
    tiltPanel.hidden = true;
    syncCalibrationScene();
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
floor.visible = false;
scene.add(floor);

const grid = new THREE.GridHelper(24, 24, 0x68e4ff, 0x42b7e9);
grid.position.set(0, -0.055, -3);
for (const material of Array.isArray(grid.material) ? grid.material : [grid.material]) {
  material.transparent = true;
  material.opacity = 0.22;
  material.depthWrite = false;
}
grid.visible = false;
scene.add(grid);

function syncCalibrationScene() {
  const showCalibration = !tiltPanel.hidden;
  floor.visible = showCalibration;
  grid.visible = showCalibration;
}

const referencePoint = new THREE.Mesh(
  new THREE.SphereGeometry(0.075, 24, 16),
  new THREE.MeshBasicMaterial({ color: 0xff6878 })
);
referencePoint.position.set(0, 0.3, 2.15);
scene.add(referencePoint);

// A fixed, beveled arrow silhouette: the joystick rotates and scales the
// whole shape, so it keeps its proportions instead of bending or stretching.
const arrowPath = new THREE.Shape();
arrowPath.moveTo(-0.12, 0);
arrowPath.lineTo(-0.12, 1.9);
arrowPath.lineTo(-0.58, 1.79);
arrowPath.lineTo(0, 3.12);
arrowPath.lineTo(0.58, 1.79);
arrowPath.lineTo(0.12, 1.9);
arrowPath.lineTo(0.12, 0);
arrowPath.closePath();

const arrowGeometry = new THREE.ExtrudeGeometry(arrowPath, {
  steps: 1,
  depth: 0.06,
  bevelEnabled: true,
  bevelSegments: 3,
  bevelThickness: 0.025,
  bevelSize: 0.025,
  curveSegments: 8
});
arrowGeometry.rotateX(-Math.PI / 2);
arrowGeometry.computeVertexNormals();

const arrow = new THREE.Group();
arrow.position.set(0, 0.2, 2.15);
arrow.visible = false;
scene.add(arrow);

const glowMaterial = new THREE.MeshBasicMaterial({
  color: 0xff1830,
  transparent: true,
  opacity: 0.17,
  side: THREE.DoubleSide,
  depthWrite: false
});
const arrowMaterial = new THREE.MeshStandardMaterial({
  color: 0xc90a1c,
  emissive: 0x650008,
  emissiveIntensity: 0.8,
  roughness: 0.26,
  metalness: 0.22,
  side: THREE.DoubleSide
});
const outlineMaterial = new THREE.LineBasicMaterial({
  color: 0xff7580,
  transparent: true,
  opacity: 0.92,
  depthWrite: false
});
const glowGeometry = arrowGeometry.clone();
glowGeometry.scale(1.1, 1, 1.1);
const glowShape = new THREE.Mesh(glowGeometry, glowMaterial);
glowShape.position.y = -0.018;
const arrowShape = new THREE.Mesh(arrowGeometry, arrowMaterial);
const outlinePoints = [
  [-0.12, 0], [-0.12, 1.9], [-0.58, 1.79], [0, 3.12],
  [0.58, 1.79], [0.12, 1.9], [0.12, 0]
].map(([x, forward]) => new THREE.Vector3(x, 0.095, -forward));
const arrowOutline = new THREE.LineLoop(
  new THREE.BufferGeometry().setFromPoints(outlinePoints),
  outlineMaterial
);
arrow.add(glowShape, arrowShape, arrowOutline);

let targetX = 0;
let targetY = 0;
let currentX = 0;
let currentY = 0;
let targetActive = false;
let lastPacketAt = 0;
let lastFrameAt = 0;
let currentAngle = 0;

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

function shortestAngleDelta(from, to) {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
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
  if (magnitude > 0.001) {
    const targetAngle = Math.atan2(-currentX, currentY);
    currentAngle += shortestAngleDelta(currentAngle, targetAngle) * blend;
  }
  arrow.visible = moving;
  if (moving) {
    arrow.rotation.y = currentAngle;
    arrow.scale.setScalar(0.72 + magnitude * 0.28);
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
