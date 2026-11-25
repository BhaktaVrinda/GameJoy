import * as THREE from '/vendor/three/three.module.js';

const canvas = document.getElementById('buttons-3d');
if (canvas) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
  } catch {
    renderer = null;
  }

  if (renderer) {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 40);
    camera.position.set(0, 0.65, 7.2);
    camera.lookAt(0, 0, 0);
    scene.add(new THREE.AmbientLight(0xb9e8ff, 2.1));
    const keyLight = new THREE.DirectionalLight(0xf2fbff, 3.2);
    keyLight.position.set(-3, 5, 6);
    scene.add(keyLight);
    const rimLight = new THREE.PointLight(0x31bfff, 10, 14, 2);
    rimLight.position.set(1, 2, 3);
    scene.add(rimLight);

    const buttonColumn = new THREE.Group();
    scene.add(buttonColumn);
    const definitions = [
      { id: 'Y', symbol: 'triangle', color: 0x47b347, x: 0, y: 0.78 },
      { id: 'B', symbol: 'circle', color: 0xe41e20, x: 0.78, y: 0 },
      { id: 'A', symbol: 'cross', color: 0x4470ad, x: 0, y: -0.78 },
      { id: 'X', symbol: 'square', color: 0xcf7db2, x: -0.78, y: 0 }
    ];
    const states = new Map();

    function addSymbol(root, type, materials) {
      const material = new THREE.MeshBasicMaterial({
        color: 0xf5fdff, transparent: true, opacity: 0.95, depthWrite: false, side: THREE.DoubleSide
      });
      materials.push(material);
      if (type === 'triangle') {
        const shape = new THREE.Shape();
        shape.moveTo(0, 0.16); shape.lineTo(-0.15, -0.13); shape.lineTo(0.15, -0.13); shape.closePath();
        const mesh = new THREE.Mesh(new THREE.ShapeGeometry(shape), material);
        mesh.position.z = 0.115; root.add(mesh);
      } else if (type === 'circle') {
        const mesh = new THREE.Mesh(new THREE.TorusGeometry(0.135, 0.026, 9, 36), material);
        mesh.position.z = 0.115; root.add(mesh);
      } else if (type === 'cross') {
        const cross = new THREE.Group();
        const geometry = new THREE.BoxGeometry(0.055, 0.34, 0.025);
        const first = new THREE.Mesh(geometry, material);
        const second = new THREE.Mesh(geometry, material);
        first.rotation.z = Math.PI / 4; second.rotation.z = -Math.PI / 4;
        cross.position.z = 0.115; cross.add(first, second); root.add(cross);
      } else {
        const points = [
          new THREE.Vector3(-0.12, -0.12, 0.115), new THREE.Vector3(0.12, -0.12, 0.115),
          new THREE.Vector3(0.12, 0.12, 0.115), new THREE.Vector3(-0.12, 0.12, 0.115)
        ];
        const line = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(points), material);
        root.add(line);
      }
    }

    for (const definition of definitions) {
      const root = new THREE.Group();
      root.position.set(definition.x, definition.y, 0);
      const materials = [];
      const accent = new THREE.Color(definition.color);
      const top = new THREE.MeshStandardMaterial({ color: definition.color, emissive: definition.color,
        emissiveIntensity: 0.2, transparent: true, opacity: 0.78, roughness: 0.28, metalness: 0.18 });
      const bottom = new THREE.MeshStandardMaterial({ color: accent.clone().multiplyScalar(0.24),
        transparent: true, opacity: 0.78, roughness: 0.42, metalness: 0.12 });
      const side = new THREE.MeshStandardMaterial({ color: accent.clone().multiplyScalar(0.46),
        transparent: true, opacity: 0.78, roughness: 0.34, metalness: 0.2 });
      materials.push(top, bottom, side);
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.47, 0.18, 48), [top, bottom, side]);
      body.rotation.x = Math.PI / 2;
      root.add(body);
      const haloMaterial = new THREE.MeshBasicMaterial({ color: definition.color, transparent: true,
        opacity: 0.24, depthWrite: false });
      const halo = new THREE.Mesh(new THREE.TorusGeometry(0.53, 0.05, 10, 48), haloMaterial);
      halo.position.z = -0.06; root.add(halo); materials.push(haloMaterial);
      const rimMaterial = new THREE.MeshStandardMaterial({ color: accent.clone().lerp(new THREE.Color(0xffffff), 0.55),
        emissive: definition.color, emissiveIntensity: 0.34, transparent: true, opacity: 0.9,
        roughness: 0.22, metalness: 0.24 });
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.025, 8, 48), rimMaterial);
      rim.position.z = 0.085; root.add(rim); materials.push(rimMaterial);
      addSymbol(root, definition.symbol, materials);
      buttonColumn.add(root);
      states.set(definition.id, { root, materials, pressed: false, opacity: 0.78 });
    }

    function normalizeAction(action) {
      return ({ cross: 'A', circle: 'B', square: 'X', triangle: 'Y' })[String(action || '').toLowerCase()] || String(action || '').toUpperCase();
    }
    function setButton(id, pressed) {
      const state = states.get(normalizeAction(id));
      if (state) state.pressed = pressed === true;
    }
    function receive(data) {
      if (data?.type === 'controls:remote-action') setButton(data.action, data.pressed);
      if (data?.type === 'controls:buttons-reset') for (const state of states.values()) state.pressed = false;
    }
    window.GameJoyBus?.on(receive);
    window.addEventListener('gamejoy:overlay-message', event => receive(event.detail));

    function resize() {
      const rect = canvas.getBoundingClientRect();
      const width = Math.max(1, rect.width);
      const height = Math.max(1, rect.height);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    }
    new ResizeObserver(resize).observe(canvas);
    resize();

    let lastFrame = 0;
    function render(now) {
      const dt = lastFrame ? Math.min(64, now - lastFrame) : 16;
      lastFrame = now;
      for (const state of states.values()) {
        const target = state.pressed ? 1 : 0.78;
        state.opacity += (target - state.opacity) * (1 - Math.exp(-dt / 70));
        state.root.scale.setScalar(0.92 + state.opacity * 0.08 + (state.pressed ? 0.08 : 0));
        for (const material of state.materials) material.opacity = state.opacity;
      }
      renderer.render(scene, camera);
      requestAnimationFrame(render);
    }
    requestAnimationFrame(render);
  }
}
