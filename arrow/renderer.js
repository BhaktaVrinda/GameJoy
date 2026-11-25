// Three.js r180. Ground coordinates are shared with the HUD's Bézier guide.
function createSteeringScene(canvas) {

  const T = window.GameJoyThree;
  if (!T) return null;
  let renderer;
  try {
    renderer = new T.WebGLRenderer({canvas, alpha: true, antialias: true});
  } catch {
    return null;
  }
  renderer.setClearColor(0, 0);
  const scene = new T.Scene();
  const arrowBody = new T.Group();
  scene.add(arrowBody);
  const floor = new T.GridHelper(100, 100, 0x407f9c, 0x48b8de);
  floor.material.transparent = true;
  floor.material.opacity = 0.55;
  floor.material.depthWrite = false;
  // Fade at the street horizon in the fixed HUD photo.
  const framebufferHeight = {value: 1};
  floor.material.onBeforeCompile = shader => {
    shader.uniforms.floorViewportHeight = framebufferHeight;
    shader.fragmentShader = 'uniform float floorViewportHeight;\n' + shader.fragmentShader.replace(
      '#include <opaque_fragment>',
      'diffuseColor.a *= 1.0 - smoothstep(0.38, 0.46, gl_FragCoord.y / floorViewportHeight);\n#include <opaque_fragment>'
    );
  };
  floor.position.set(50, -0.045, 50);
  scene.add(floor);
  const gridControl = document.querySelector('#show-grid');
  const angleLabel = document.querySelector('#camera-angle');
  const camera = new T.PerspectiveCamera(48, 1, 0.1, 160);
  camera.position.set(50, 8.25, 62.65);
  camera.lookAt(50, 0, 51.4);
  angleLabel.textContent = `Cámara fija hacia −Z · ${Math.round(-camera.rotation.x * 180 / Math.PI)}° hacia abajo`;

  const cyan = new T.MeshBasicMaterial({color: 0x06bfff});
  const white = new T.MeshBasicMaterial({color: 0xe9fbff});
  const outline = new T.LineBasicMaterial({color: 0x008dcb});
  const shape = new T.Shape();
  shape.moveTo(0, 0.56);
  shape.lineTo(1.28, -0.20);
  shape.lineTo(1.28, -0.58);
  shape.lineTo(0, 0.12);
  shape.lineTo(-1.28, -0.58);
  shape.lineTo(-1.28, -0.20);
  shape.closePath();
  const geometry = new T.ExtrudeGeometry(shape, {depth: 0.11, bevelEnabled: false});
  geometry.rotateX(-Math.PI / 2);
  const edges = new T.EdgesGeometry(geometry);
  const arrows = [];
  function setCount(count) {
    while (arrows.length > count) {
      const mesh = arrows.pop();
      arrowBody.remove(mesh);
      mesh.material.forEach(material => material.dispose());
      mesh.children[0].material.dispose();
    }
    while (arrows.length < count) {
      const materials = [white.clone(), cyan.clone()];
      const edgeMaterial = outline.clone();
      for (const material of [...materials, edgeMaterial]) material.transparent = true;
      const mesh = new T.Mesh(geometry, materials);
      mesh.add(new T.LineSegments(edges, edgeMaterial));
      arrowBody.add(mesh);
      arrows.push(mesh);
    }
  }
  const anchor = new T.Mesh(new T.SphereGeometry(0.14), white);
  const tip = new T.Mesh(new T.SphereGeometry(0.11), cyan.clone());
  tip.material.transparent = true;
  const guide = new T.Mesh(undefined, tip.material);
  arrowBody.add(anchor, tip, guide);

  const ground = (x, y) => new T.Vector3((x - 95) * 0.034, 0, (y - 185) * 0.034);
  const curve = new T.CubicBezierCurve3(ground(95, 185), ground(95, 127), ground(95, 60), ground(95, 25));
  anchor.position.copy(curve.v0);

  function render() {
    renderer.render(scene, camera);
  }
  function updateFraming(width, height) {
    // Expand the original lower HUD viewport to the whole display, preserving its projection.
    const w = width * 0.48;
    const h = height * 0.42;
    camera.setViewOffset(w, h, (w-width)/2, h-height, width, height);
  }
  function resize() {
    const {width, height} = canvas.getBoundingClientRect();
    if (!width || !height) return;
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setSize(width, height, false);
    framebufferHeight.value = canvas.height;
    updateFraming(width, height);
    render();
  }
  new ResizeObserver(resize).observe(canvas);
  resize();
  const hud = canvas.closest('main');
  canvas.addEventListener('webglcontextlost', () => hud.classList.remove('steering-3d'));
  canvas.addEventListener('webglcontextrestored', () => {
    render();
    hud.classList.add('steering-3d');
  });
  let lastControlX;
  return (baseControlX, heading, opacities, extent, side, depth, height) => {
    const count = opacities.length;
    setCount(count);
    arrowBody.position.set(side, height, depth);
    floor.visible = gridControl.checked;
    arrowBody.rotation.y = -heading;
    if (lastControlX !== baseControlX) {
      lastControlX = baseControlX;
      curve.v1.copy(ground(baseControlX, 127));
      curve.updateArcLengths();
      guide.geometry.dispose();
      guide.geometry = new T.TubeGeometry(curve, 48, 0.038, 6, false);
    }
    guide.visible = tip.visible = extent > 0;
    tip.material.opacity = opacities[0];
    // Each tube ring contributes six quads (36 indices).
    guide.geometry.setDrawRange(0, Math.round(48 * extent) * 36);
    tip.position.copy(curve.getPointAt(extent));
    for (const [index, mesh] of arrows.entries()) {
      const opacity = opacities[index];
      mesh.visible = opacity > 0;
      if (!mesh.visible) continue;
      for (const material of mesh.material) material.opacity = opacity;
      mesh.children[0].material.opacity = opacity;
      const fraction = (index + 0.75) / (count + 0.5);
      mesh.position.copy(curve.getPointAt(fraction));
      mesh.position.y = 0.055;
      const tangent = curve.getTangentAt(fraction);
      mesh.rotation.y = Math.atan2(-tangent.x, -tangent.z);
      mesh.scale.setScalar(Math.min(1, curve.getLength() / (1.4 * count)));
    }
    render();
    hud.classList.toggle('steering-3d', !renderer.getContext().isContextLost());
  };
}
