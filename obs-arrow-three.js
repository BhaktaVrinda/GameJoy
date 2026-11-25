import * as THREE from '/vendor/three/three.module.js';
import { waitForObsToken } from '/obs-session-token.js';

const canvas = document.getElementById('arrow');
const status = document.getElementById('status');
const obsAccess = await waitForObsToken('arrow', message => { status.textContent = message; });
const token = obsAccess.token;
const debug = new URLSearchParams(location.search).get('debug') === '1';
const deadZone = 0.1;
const staleAfterMs = 2400;
const DEFAULT_VIEW_ELEVATION = 12;
const MIN_VIEW_ELEVATION = 5;
const MAX_VIEW_ELEVATION = 25;
const viewPreferenceKey = `gamejoy.obs.arrow.view.${token || 'default'}`;
const arrowPositionPreferenceKey = `gamejoy.obs.arrow.position.${token || 'default'}`;
const oldArrowVerticalPreferenceKey = `gamejoy.obs.arrow.vertical.${token || 'default'}`;
const tiltPanel = document.getElementById('tilt-panel');
const tiltRange = document.getElementById('tilt-range');
const tiltValue = document.getElementById('tilt-value');
const arrowXRange = document.getElementById('arrow-x-range');
const arrowXValue = document.getElementById('arrow-x-value');
const arrowYRange = document.getElementById('arrow-y-range');
const arrowYValue = document.getElementById('arrow-y-value');
const modelToggle = document.getElementById('model-toggle');
const modelValue = document.getElementById('model-value');
const modelPreferenceKey = `gamejoy.obs.arrow.model.v2.${token || 'default'}`;
const arrowPosition = { x: 0, y: 0 };
let arrowModel = null;
let overlaySocket = null;
let hasCachedArrowPosition = false;

try {
  const savedPositionText = localStorage.getItem(arrowPositionPreferenceKey);
  const savedPosition = JSON.parse(savedPositionText || 'null');
  if (savedPosition && typeof savedPosition === 'object') {
    if (Number.isFinite(savedPosition.x)) {
      arrowPosition.x = THREE.MathUtils.clamp(savedPosition.x, -100, 100);
      hasCachedArrowPosition = true;
    }
    if (Number.isFinite(savedPosition.y)) {
      arrowPosition.y = THREE.MathUtils.clamp(savedPosition.y, -100, 100);
      hasCachedArrowPosition = true;
    }
  } else {
    const oldOffsetText = localStorage.getItem(oldArrowVerticalPreferenceKey);
    if (oldOffsetText !== null) {
      const oldVerticalOffset = Number(oldOffsetText);
      if (Number.isFinite(oldVerticalOffset)) {
        arrowPosition.y = THREE.MathUtils.clamp(oldVerticalOffset * (0.55 / 0.9), -100, 100);
        hasCachedArrowPosition = true;
      }
    }
  }
} catch (_) {}
arrowXRange.value = String(arrowPosition.x);
arrowXValue.value = `${arrowPosition.x}%`;
arrowYRange.value = String(arrowPosition.y);
arrowYValue.value = `${arrowPosition.y}%`;

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
function positionArrowModel() {
  if (!arrowModel) return;
  camera.updateMatrixWorld(true);
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(new THREE.Vector2(arrowPosition.x / 100 * 0.9, arrowPosition.y / 100 * 0.9), camera);
  const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -arrowModel.position.z);
  const position = raycaster.ray.intersectPlane(plane, new THREE.Vector3());
  if (position) arrowModel.position.set(position.x, position.y, arrowModel.position.z);
}

function setViewElevation(degrees, persist = false) {
  const elevation = THREE.MathUtils.clamp(degrees, MIN_VIEW_ELEVATION, MAX_VIEW_ELEVATION);
  const radians = THREE.MathUtils.degToRad(elevation);
  camera.position.set(
    cameraTarget.x,
    cameraTarget.y + Math.sin(radians) * cameraOrbitDistance,
    cameraTarget.z + Math.cos(radians) * cameraOrbitDistance
  );
  camera.lookAt(cameraTarget);
  positionArrowModel();
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
  setArrowPosition(0, 0, true);
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

// Screenshot-style arrow: a curved blue ribbon, triangular tip, and blue origin.
arrowModel = new THREE.Group();
arrowModel.position.z = joystickPosition.z;
arrowModel.visible = true;
scene.add(arrowModel);
function setArrowPosition(x, y, persist = false) {
  arrowPosition.x = THREE.MathUtils.clamp(Number(x) || 0, -100, 100);
  arrowPosition.y = THREE.MathUtils.clamp(Number(y) || 0, -100, 100);
  arrowXRange.value = String(Math.round(arrowPosition.x));
  arrowXValue.value = `${Math.round(arrowPosition.x)}%`;
  arrowYRange.value = String(Math.round(arrowPosition.y));
  arrowYValue.value = `${Math.round(arrowPosition.y)}%`;
  positionArrowModel();
  if (persist) {
    try {
      localStorage.setItem(arrowPositionPreferenceKey, JSON.stringify(arrowPosition));
      hasCachedArrowPosition = true;
    } catch (_) {}
  }
}
setArrowPosition(arrowPosition.x, arrowPosition.y);
function publishArrowPosition() {
  setArrowPosition(Number(arrowXRange.value), Number(arrowYRange.value), true);
  overlaySocket?.emit('gamejoy:obs-arrow-position-set', { x: arrowPosition.x, y: arrowPosition.y });
}
arrowXRange.addEventListener('input', publishArrowPosition);
arrowYRange.addEventListener('input', publishArrowPosition);

const arrowTrail = new THREE.Group();
arrowTrail.visible = false;
arrowModel.add(arrowTrail);

const arrowShadowMaterial = new THREE.MeshBasicMaterial({
  color: 0x173d5c,
  transparent: true,
  opacity: 0.56,
  side: THREE.DoubleSide,
  depthWrite: false
});
const arrowGlowMaterial = new THREE.MeshBasicMaterial({
  color: 0x31c8ff,
  transparent: true,
  opacity: 0.14,
  side: THREE.DoubleSide,
  depthWrite: false
});
const arrowShaftMaterial = new THREE.MeshStandardMaterial({
  vertexColors: true,
  emissive: 0x06446f,
  emissiveIntensity: 0.55,
  roughness: 0.3,
  metalness: 0.08,
  side: THREE.DoubleSide
});
const arrowShadow = new THREE.Mesh(new THREE.BufferGeometry(), arrowShadowMaterial);
const arrowGlow = new THREE.Mesh(new THREE.BufferGeometry(), arrowGlowMaterial);
const arrowShaft = new THREE.Mesh(new THREE.BufferGeometry(), arrowShaftMaterial);
arrowTrail.add(arrowShadow, arrowGlow, arrowShaft);

const arrowOriginHalo = new THREE.Mesh(
  new THREE.CircleGeometry(0.23, 48),
  new THREE.MeshBasicMaterial({ color: 0x42d7ff, transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide })
);
arrowOriginHalo.rotation.x = -Math.PI / 2;
arrowOriginHalo.position.y = 0.19;
const arrowOriginRing = new THREE.Mesh(
  new THREE.TorusGeometry(0.14, 0.024, 8, 40),
  new THREE.MeshBasicMaterial({ color: 0x55dcff, transparent: true, opacity: 0.94 })
);
arrowOriginRing.rotation.x = Math.PI / 2;
arrowOriginRing.position.y = 0.245;
arrowModel.add(arrowOriginHalo, arrowOriginRing);

let targetX = 0;
let targetY = 0;
let currentX = 0;
let currentY = 0;
let targetActive = false;
let lastPacketAt = 0;
let lastFrameAt = 0;
let arrowActive = false;
let lastArrowKey = '';
let currentModel = 'arrow';
try {
  if (localStorage.getItem(modelPreferenceKey) === 'joystick') currentModel = 'joystick';
} catch (_) {}

function syncModelSelection(persist = false) {
  const showJoystick = currentModel === 'joystick';
  joystickModel.visible = showJoystick;
  arrowModel.visible = !showJoystick;
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

const ribbonColors = [
  new THREE.Color(0x2879b8),
  new THREE.Color(0x67e7ff),
  new THREE.Color(0x2586d4)
];

function makeRibbonGeometry(curve, widthScale, height, offsetZ) {
  const segments = 48;
  const positions = [];
  const colors = [];
  const indices = [];

  for (let i = 0; i <= segments; i++) {
    const progress = i / segments;
    // Sample by distance along the curve so its bend stays evenly proportioned.
    const point = curve.getPointAt(progress);
    const tangent = curve.getTangentAt(progress).setY(0).normalize();
    const side = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
    const shaftWidth = 0.09 + progress * 0.02;
    const headNeck = 0.72;
    const headShoulder = 0.82;
    let halfWidth;
    if (progress <= headNeck) {
      halfWidth = shaftWidth;
    } else if (progress <= headShoulder) {
      const t = (progress - headNeck) / (headShoulder - headNeck);
      const eased = t * t * (3 - 2 * t);
      halfWidth = shaftWidth + (0.44 - shaftWidth) * eased;
    } else {
      const t = (progress - headShoulder) / (1 - headShoulder);
      halfWidth = 0.44 * (1 - t);
    }
    halfWidth *= widthScale;
    const left = point.clone().addScaledVector(side, halfWidth);
    const right = point.clone().addScaledVector(side, -halfWidth);
    left.z += offsetZ;
    right.z += offsetZ;
    positions.push(left.x, height, left.z, point.x, height, point.z + offsetZ, right.x, height, right.z);
    for (const color of ribbonColors) colors.push(color.r, color.g, color.b);

    if (i < segments) {
      const row = i * 3;
      indices.push(row, row + 1, row + 3, row + 1, row + 4, row + 3);
      indices.push(row + 1, row + 2, row + 4, row + 2, row + 5, row + 4);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function replaceGeometry(mesh, geometry) {
  const previous = mesh.geometry;
  mesh.geometry = geometry;
  previous.dispose();
}

function updateArrow(x, y, magnitude) {
  const forward = Math.max(0, y);
  const backward = Math.max(0, -y);
  const travel = 0.8 + forward * 4.2 + backward * 2.7 + Math.abs(x) * 1.65;
  const deltaZ = (backward - forward) * travel;
  const reach = 0.62 + magnitude * 0.38;
  const start = new THREE.Vector3(0, 0.22, 0);
  const shaftEnd = new THREE.Vector3(x * 2.85 * reach, 0.22, deltaZ);
  const direction = shaftEnd.clone().sub(start).setY(0).normalize();
  const side = new THREE.Vector3(-direction.z, 0, direction.x).normalize();
  const curveAmount = x * (0.24 + magnitude * 0.3);
  const end = shaftEnd.clone().addScaledVector(direction, 0.72)
    .addScaledVector(side, curveAmount * 0.78);
  const curveDirection = end.clone().sub(start);
  const control1 = start.clone().addScaledVector(curveDirection, 0.3)
    .addScaledVector(side, curveAmount * 0.3);
  const control2 = start.clone().addScaledVector(curveDirection, 0.7)
    .addScaledVector(side, curveAmount * 0.52);
  const curve = new THREE.CubicBezierCurve3(start, control1, control2, end);
  // The arrowhead is the widening and tapering end of this same curved ribbon.
  replaceGeometry(arrowShadow, makeRibbonGeometry(curve, 1.45, 0.17, 0.04));
  replaceGeometry(arrowGlow, makeRibbonGeometry(curve, 1.95, 0.205, 0));
  replaceGeometry(arrowShaft, makeRibbonGeometry(curve, 1, 0.24, 0));
}

function resize() {
  const width = Math.max(1, window.innerWidth);
  const height = Math.max(1, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  positionArrowModel();
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
  arrowModel.visible = currentModel === 'arrow';
  arrowTrail.visible = currentModel === 'arrow' && arrowActive;

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
  setStatus(obsAccess.message);
} else if (typeof io !== 'function') {
  setStatus('No se pudo conectar con el servidor de GameJoy');
} else {
  setStatus('Conectando con GameJoy…');
  const socket = io({ autoConnect: false, reconnection: true });
  overlaySocket = socket;
  socket.on('connect', () => {
    setStatus('Esperando el mando…');
    socket.emit('gamejoy:obs-subscribe', { token });
  });
  socket.on('gamejoy:obs-ready', () => setStatus(debug ? 'Overlay conectado · mando centrado' : ''));
  socket.on('gamejoy:obs-input', acceptInput);
  socket.on('gamejoy:obs-arrow-position', data => {
    if (data?.initialized === false) {
      socket.emit('gamejoy:obs-arrow-position-seed', hasCachedArrowPosition ? arrowPosition : { x: 0, y: 0 });
      return;
    }
    if (Number.isFinite(data?.x) && Number.isFinite(data?.y)) setArrowPosition(data.x, data.y, true);
  });
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
