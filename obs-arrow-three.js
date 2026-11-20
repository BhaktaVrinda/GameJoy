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
const modelToggle = document.getElementById('model-toggle');
const modelValue = document.getElementById('model-value');
const modelPreferenceKey = `gamejoy.obs.arrow.model.${token || 'default'}`;

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

// GameJoy's analog stick, modeled flat on the ground plane.
const joystickPosition = new THREE.Vector3(0, 0, 2.15);
const joystickBaseRadius = 1.32;
const joystickKnobRadius = 0.49;
const joystickTravel = joystickBaseRadius - joystickKnobRadius;
const joystickModel = new THREE.Group();
scene.add(joystickModel);

const joystickBase = new THREE.Mesh(
  new THREE.CylinderGeometry(joystickBaseRadius, joystickBaseRadius, 0.1, 64),
  new THREE.MeshStandardMaterial({
    color: 0xf0f8ff,
    transparent: true,
    opacity: 0.2,
    roughness: 0.42,
    metalness: 0.08,
    depthWrite: false
  })
);
joystickBase.position.copy(joystickPosition).setY(0.025);
joystickModel.add(joystickBase);

const joystickRim = new THREE.Mesh(
  new THREE.TorusGeometry(joystickBaseRadius - 0.035, 0.035, 10, 72),
  new THREE.MeshBasicMaterial({ color: 0xf4fbff, transparent: true, opacity: 0.82 })
);
joystickRim.rotation.x = Math.PI / 2;
joystickRim.position.copy(joystickPosition).setY(0.085);
joystickModel.add(joystickRim);

const joystickKnob = new THREE.Group();
joystickKnob.position.set(0, 0.08, joystickPosition.z);
joystickModel.add(joystickKnob);

const joystickKnobBody = new THREE.Mesh(
  new THREE.CylinderGeometry(joystickKnobRadius * 0.92, joystickKnobRadius, 0.18, 48),
  new THREE.MeshStandardMaterial({
    color: 0x56bfff,
    emissive: 0x0871c4,
    emissiveIntensity: 0.32,
    transparent: true,
    opacity: 0.9,
    roughness: 0.28,
    metalness: 0.14
  })
);
joystickKnobBody.position.y = 0.075;
joystickKnob.add(joystickKnobBody);

const joystickKnobRim = new THREE.Mesh(
  new THREE.TorusGeometry(joystickKnobRadius * 0.9, 0.025, 8, 48),
  new THREE.MeshBasicMaterial({ color: 0xf3fbff, transparent: true, opacity: 0.9 })
);
joystickKnobRim.rotation.x = Math.PI / 2;
joystickKnobRim.position.y = 0.17;
joystickKnob.add(joystickKnobRim);

// Alternate model: the original curved 3D arrow, which bends with the input.
const arrowModel = new THREE.Group();
arrowModel.position.z = joystickPosition.z;
arrowModel.visible = false;
scene.add(arrowModel);

const arrowGlowMaterial = new THREE.MeshBasicMaterial({
  color: 0x12baff,
  transparent: true,
  opacity: 0.17,
  side: THREE.DoubleSide,
  depthWrite: false
});
const arrowShaftMaterial = new THREE.MeshStandardMaterial({
  color: 0x58e5ff,
  emissive: 0x159fff,
  emissiveIntensity: 1.45,
  roughness: 0.24,
  metalness: 0.16
});
const arrowHeadMaterial = new THREE.MeshStandardMaterial({
  color: 0x9af5ff,
  emissive: 0x168fff,
  emissiveIntensity: 1.65,
  roughness: 0.2,
  metalness: 0.1
});
const arrowGlowShaft = new THREE.Mesh(new THREE.BufferGeometry(), arrowGlowMaterial);
const arrowShaft = new THREE.Mesh(new THREE.BufferGeometry(), arrowShaftMaterial);
const arrowGlowHead = new THREE.Mesh(
  new THREE.ConeGeometry(0.43, 0.98, 8), arrowGlowMaterial
);
const arrowHead = new THREE.Mesh(
  new THREE.ConeGeometry(0.29, 0.72, 8), arrowHeadMaterial
);
arrowModel.add(arrowGlowShaft, arrowShaft, arrowGlowHead, arrowHead);

let targetX = 0;
let targetY = 0;
let currentX = 0;
let currentY = 0;
let targetActive = false;
let lastPacketAt = 0;
let lastFrameAt = 0;
let arrowActive = false;
let lastArrowKey = '';
let currentModel = 'joystick';
try {
  if (localStorage.getItem(modelPreferenceKey) === 'arrow') currentModel = 'arrow';
} catch (_) {}

function syncModelSelection(persist = false) {
  const showJoystick = currentModel === 'joystick';
  joystickModel.visible = showJoystick;
  arrowModel.visible = !showJoystick && arrowActive;
  modelValue.textContent = showJoystick ? 'Joystick' : 'Flecha';
  modelToggle.textContent = showJoystick ? 'Cambiar a flecha' : 'Cambiar a joystick';
  if (persist) {
    try { localStorage.setItem(modelPreferenceKey, currentModel); } catch (_) {}
  }
}

modelToggle.addEventListener('click', () => {
  currentModel = currentModel === 'joystick' ? 'arrow' : 'joystick';
  syncModelSelection(true);
});
syncModelSelection();

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
  const forward = Math.max(0, y);
  const backward = Math.max(0, -y);
  const travel = 0.8 + forward * 4.2 + backward * 2.7 + Math.abs(x) * 1.65;
  const deltaZ = (backward - forward) * travel;
  const reach = 0.62 + magnitude * 0.38;
  const start = new THREE.Vector3(0, 0.22, 0);
  const end = new THREE.Vector3(x * 2.85 * reach, 0.22, deltaZ);
  const direction = end.clone().sub(start);
  const side = new THREE.Vector3(-direction.z, 0, direction.x).normalize();
  const curveAmount = x * (0.16 + magnitude * 0.22);
  const control1 = start.clone().addScaledVector(direction, 0.3)
    .addScaledVector(side, curveAmount * 0.38);
  const control2 = start.clone().addScaledVector(direction, 0.76)
    .addScaledVector(side, curveAmount);
  const curve = new THREE.CubicBezierCurve3(start, control1, control2, end);

  for (const [mesh, radius] of [[arrowGlowShaft, 0.17], [arrowShaft, 0.074]]) {
    const oldGeometry = mesh.geometry;
    mesh.geometry = new THREE.TubeGeometry(curve, 42, radius * (0.9 + magnitude * 0.1), 12, false);
    oldGeometry.dispose();
  }

  const tip = curve.getPoint(1);
  const tangent = curve.getTangent(1).normalize();
  const axis = new THREE.Vector3(0, 1, 0);
  for (const [mesh, height] of [[arrowGlowHead, 0.98], [arrowHead, 0.72]]) {
    mesh.position.copy(tip).addScaledVector(tangent, -height * 0.47);
    mesh.quaternion.setFromUnitVectors(axis, tangent);
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
  const directionScale = magnitude > 1 ? 1 / magnitude : 1;
  joystickKnob.position.x = currentX * directionScale * joystickTravel;
  joystickKnob.position.z = joystickPosition.z - currentY * directionScale * joystickTravel;
  arrowActive = targetActive || magnitude > 0.075;
  joystickModel.visible = currentModel === 'joystick';
  arrowModel.visible = currentModel === 'arrow' && arrowActive;

  const arrowKey = `${Math.round(currentX * 80)}:${Math.round(currentY * 80)}`;
  if (currentModel === 'arrow' && arrowActive && arrowKey !== lastArrowKey) {
    updateArrow(currentX, currentY, magnitude);
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
