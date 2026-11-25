import * as THREE from '/vendor/three/three.module.js';

const canvas = document.getElementById('buttons');
const status = document.getElementById('status');
const token = location.hash.slice(1);
const debug = new URLSearchParams(location.search).get('debug') === '1';
const DEFAULT_VIEW_ELEVATION = 12;
const MIN_VIEW_ELEVATION = 5;
const MAX_VIEW_ELEVATION = 25;
const cameraOrbitDistance = 16;
const viewPreferenceKey = `gamejoy.obs.buttons.view.${token || 'default'}`;
const layoutPreferenceKey = `gamejoy.obs.buttons.layout.${token || 'default'}`;
const tiltPanel = document.getElementById('tilt-panel');
const tiltRange = document.getElementById('tilt-range');
const tiltValue = document.getElementById('tilt-value');
const positionXRange = document.getElementById('position-x-range');
const positionXValue = document.getElementById('position-x-value');
const positionYRange = document.getElementById('position-y-range');
const positionYValue = document.getElementById('position-y-value');
const sizeRange = document.getElementById('size-range');
const sizeValue = document.getElementById('size-value');
const DEFAULT_LAYOUT = { x: 0, y: 0, size: 100 };
const layout = { ...DEFAULT_LAYOUT };

try {
  const savedLayout = JSON.parse(localStorage.getItem(layoutPreferenceKey) || 'null');
  if (savedLayout && typeof savedLayout === 'object') {
    if (Number.isFinite(savedLayout.x)) layout.x = THREE.MathUtils.clamp(savedLayout.x, -100, 100);
    if (Number.isFinite(savedLayout.y)) layout.y = THREE.MathUtils.clamp(savedLayout.y, -100, 100);
    if (Number.isFinite(savedLayout.size)) layout.size = THREE.MathUtils.clamp(savedLayout.size, 50, 200);
  }
} catch (_) {}

positionXRange.value = String(layout.x);
positionYRange.value = String(layout.y);
sizeRange.value = String(layout.size);
positionXValue.value = `${layout.x}%`;
positionYValue.value = `${layout.y}%`;
sizeValue.value = `${layout.size}%`;

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
  setStatus('No se pudo iniciar el overlay 3D de botones');
  throw error;
}

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(39, window.innerWidth / window.innerHeight, 0.1, 80);
const cameraTarget = new THREE.Vector3(0, 0, -1.2);

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
    syncCalibrationScene();
    event.preventDefault();
  } else if (event.key === 'Escape') {
    tiltPanel.hidden = true;
    syncCalibrationScene();
  }
});

scene.add(new THREE.AmbientLight(0xa9d9ff, 1.8));
const keyLight = new THREE.DirectionalLight(0xf2fbff, 2.6);
keyLight.position.set(-4, 8, 7);
scene.add(keyLight);
const rimLight = new THREE.PointLight(0x31bfff, 14, 20, 2);
rimLight.position.set(0, 3, 2);
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
floor.position.set(0, -2.5, -3);
floor.visible = false;
scene.add(floor);

const grid = new THREE.GridHelper(24, 24, 0x68e4ff, 0x42b7e9);
grid.position.set(0, -2.46, -3);
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

const buttonColumn = new THREE.Group();
scene.add(buttonColumn);

const buttonDefinitions = [
  { id: 'Y', symbol: 'triangle', color: 0x47b347, x: 0, y: 0.75 },
  { id: 'B', symbol: 'circle', color: 0xe41e20, x: 0.75, y: 0 },
  { id: 'A', symbol: 'cross', color: 0x4470ad, x: 0, y: -0.75 },
  { id: 'X', symbol: 'square', color: 0xcf7db2, x: -0.75, y: 0 }
];
const buttonStates = new Map();

function addSymbol(root, type, materials) {
  const symbolMaterial = new THREE.MeshBasicMaterial({
    color: 0xf5fdff,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    side: THREE.DoubleSide
  });
  materials.push(symbolMaterial);

  if (type === 'triangle') {
    const shape = new THREE.Shape();
    shape.moveTo(0, 0.16);
    shape.lineTo(-0.15, -0.13);
    shape.lineTo(0.15, -0.13);
    shape.closePath();
    const triangle = new THREE.Mesh(new THREE.ShapeGeometry(shape), symbolMaterial);
    triangle.position.z = 0.115;
    root.add(triangle);
  } else if (type === 'circle') {
    const circle = new THREE.Mesh(new THREE.TorusGeometry(0.135, 0.026, 9, 36), symbolMaterial);
    circle.position.z = 0.115;
    root.add(circle);
  } else if (type === 'cross') {
    const cross = new THREE.Group();
    const barGeometry = new THREE.BoxGeometry(0.055, 0.34, 0.025);
    const barA = new THREE.Mesh(barGeometry, symbolMaterial);
    const barB = new THREE.Mesh(barGeometry, symbolMaterial);
    barA.rotation.z = Math.PI / 4;
    barB.rotation.z = -Math.PI / 4;
    cross.position.z = 0.115;
    cross.add(barA, barB);
    root.add(cross);
  } else {
    const points = [
      new THREE.Vector3(-0.12, -0.12, 0.115),
      new THREE.Vector3(0.12, -0.12, 0.115),
      new THREE.Vector3(0.12, 0.12, 0.115),
      new THREE.Vector3(-0.12, 0.12, 0.115)
    ];
    root.add(new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints(points),
      new THREE.LineBasicMaterial({ color: 0xf5fdff, transparent: true, opacity: 0, depthWrite: false })
    ));
    materials.push(root.children[root.children.length - 1].material);
  }
}

for (const definition of buttonDefinitions) {
  const root = new THREE.Group();
  root.position.set(definition.x, definition.y, 0);
  root.visible = false;
  buttonColumn.add(root);

  const materials = [];
  const accent = new THREE.Color(definition.color);
  const sideColor = accent.clone().multiplyScalar(0.46);
  const bottomColor = accent.clone().multiplyScalar(0.24);
  const topMaterial = new THREE.MeshStandardMaterial({
    color: definition.color,
    emissive: definition.color,
    emissiveIntensity: 0.18,
    transparent: true,
    opacity: 0,
    roughness: 0.28,
    metalness: 0.18
  });
  const bottomMaterial = new THREE.MeshStandardMaterial({
    color: bottomColor,
    transparent: true,
    opacity: 0,
    roughness: 0.42,
    metalness: 0.12
  });
  const sideMaterial = new THREE.MeshStandardMaterial({
    color: sideColor,
    transparent: true,
    opacity: 0,
    roughness: 0.34,
    metalness: 0.2
  });
  materials.push(topMaterial, bottomMaterial, sideMaterial);

  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(0.42, 0.47, 0.18, 48),
    [topMaterial, bottomMaterial, sideMaterial]
  );
  body.rotation.x = Math.PI / 2;
  root.add(body);

  const haloMaterial = new THREE.MeshBasicMaterial({
    color: definition.color,
    transparent: true,
    opacity: 0,
    depthWrite: false
  });
  const halo = new THREE.Mesh(new THREE.TorusGeometry(0.53, 0.05, 10, 48), haloMaterial);
  halo.position.z = -0.06;
  root.add(halo);
  materials.push(haloMaterial);

  const rimMaterial = new THREE.MeshStandardMaterial({
    color: accent.clone().lerp(new THREE.Color(0xffffff), 0.55),
    emissive: definition.color,
    emissiveIntensity: 0.34,
    transparent: true,
    opacity: 0,
    roughness: 0.22,
    metalness: 0.24
  });
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.025, 8, 48), rimMaterial);
  rim.position.z = 0.085;
  root.add(rim);
  materials.push(rimMaterial);

  addSymbol(root, definition.symbol, materials);
  buttonStates.set(definition.id, { root, materials, target: 0, opacity: 0, baseZ: 0.1 });
}

function setColumnPosition() {
  const halfWidth = cameraOrbitDistance * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect;
  const halfHeight = halfWidth / camera.aspect;
  const extent = 1.25 * (layout.size / 100);
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  buttonColumn.position.x = clamp(
    halfWidth * (0.56 + layout.x / 100),
    -halfWidth + extent,
    halfWidth - extent
  );
  buttonColumn.position.y = clamp(
    halfHeight * (layout.y / 100),
    -halfHeight + extent,
    halfHeight - extent
  );
  buttonColumn.scale.setScalar(layout.size / 100);
}
setColumnPosition();

function updateLayout(persist = true) {
  layout.x = THREE.MathUtils.clamp(Number(positionXRange.value) || 0, -100, 100);
  layout.y = THREE.MathUtils.clamp(Number(positionYRange.value) || 0, -100, 100);
  layout.size = THREE.MathUtils.clamp(Number(sizeRange.value) || DEFAULT_LAYOUT.size, 50, 200);
  positionXValue.value = `${layout.x}%`;
  positionYValue.value = `${layout.y}%`;
  sizeValue.value = `${layout.size}%`;
  setColumnPosition();
  if (persist) {
    try { localStorage.setItem(layoutPreferenceKey, JSON.stringify(layout)); } catch (_) {}
  }
}

positionXRange.addEventListener('input', () => updateLayout());
positionYRange.addEventListener('input', () => updateLayout());
sizeRange.addEventListener('input', () => updateLayout());
document.getElementById('layout-reset').addEventListener('click', () => {
  positionXRange.value = String(DEFAULT_LAYOUT.x);
  positionYRange.value = String(DEFAULT_LAYOUT.y);
  sizeRange.value = String(DEFAULT_LAYOUT.size);
  updateLayout();
});

function setButtonPressed(button, pressed) {
  const state = buttonStates.get(button);
  if (state) state.target = pressed ? 1 : 0;
}

function clearButtons() {
  for (const state of buttonStates.values()) state.target = 0;
}

function setButtonSnapshot(data) {
  const pressed = new Set(Array.isArray(data?.buttons) ? data.buttons : []);
  for (const button of buttonStates.keys()) setButtonPressed(button, pressed.has(button));
}

function resize() {
  const width = Math.max(1, window.innerWidth);
  const height = Math.max(1, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  setColumnPosition();
}

let lastFrameAt = 0;
function render(now) {
  const dt = lastFrameAt ? Math.min(64, now - lastFrameAt) : 16;
  lastFrameAt = now;
  for (const state of buttonStates.values()) {
    const targetOpacity = state.target ? 1 : (tiltPanel.hidden ? 0 : 0.32);
    const blend = 1 - Math.exp(-dt / (targetOpacity ? 48 : 88));
    state.opacity += (targetOpacity - state.opacity) * blend;
    if (!targetOpacity && state.opacity < 0.008) state.opacity = 0;
    state.root.visible = state.opacity > 0;
    if (!state.root.visible) continue;
    state.root.scale.setScalar(0.82 + state.opacity * 0.18);
    state.root.position.z = state.baseZ + state.opacity * 0.07;
    for (const material of state.materials) material.opacity = state.opacity;
  }
  renderer.render(scene, camera);
  requestAnimationFrame(render);
}

window.addEventListener('resize', resize, { passive: true });

if (!/^[a-f0-9]{64}$/.test(token)) {
  setStatus('Usa el enlace OBS de GameJoy con su token');
} else if (typeof io !== 'function') {
  setStatus('No se pudo conectar con GameJoy');
} else {
  setStatus('Conectando con GameJoy…');
  const socket = io({ autoConnect: false, reconnection: true });
  socket.on('connect', () => {
    setStatus('Esperando botones…');
    socket.emit('gamejoy:obs-subscribe', { token });
  });
  socket.on('gamejoy:obs-ready', () => setStatus(debug ? 'Overlay de botones conectado' : ''));
  socket.on('gamejoy:obs-buttons', setButtonSnapshot);
  socket.on('gamejoy:obs-button', data => {
    if (typeof data?.button === 'string' && typeof data?.pressed === 'boolean') {
      setButtonPressed(data.button, data.pressed);
    }
  });
  socket.on('gamejoy:obs-stopped', clearButtons);
  socket.on('gamejoy:obs-error', data => setStatus(data?.message || 'Overlay no disponible'));
  socket.on('disconnect', () => {
    clearButtons();
    setStatus('Reconectando con GameJoy…');
  });
  socket.on('connect_error', () => setStatus('No se pudo conectar con el servidor'));
  socket.connect();
}

requestAnimationFrame(render);
