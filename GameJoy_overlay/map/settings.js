(function () {
  const byId = id => document.getElementById(id);
  const panel = document.querySelector('.arrow-settings');
  const zoom = byId('map-zoom');
  const dotDistance = byId('map-dot-distance');
  const dotAngle = byId('map-dot-angle');
  const size = byId('map-size');
  const animationDistance = byId('map-animation-distance');
  const animationDuration = byId('map-animation-duration');
  const send = (type, detail = {}) => {
    const message = {type, ...detail};
    parent.postMessage(message, '*');
    window.GameJoyBus?.post(message);
  };

  function readSaved() {
    const config = {zoom:16,dotDistance:0,dotAngle:0,mapSize:21};
    try {
      const savedZoom = Number(localStorage.getItem('gamejoy:map-zoom'));
      if (Number.isInteger(savedZoom) && savedZoom >= 3 && savedZoom <= 21) config.zoom = savedZoom;
      const dot = JSON.parse(localStorage.getItem('gamejoy:map-dot-position'));
      if (Number.isFinite(dot?.distance) && dot.distance >= 0 && dot.distance <= 85) config.dotDistance = dot.distance;
      if (Number.isFinite(dot?.angle) && dot.angle >= 0 && dot.angle <= 359) config.dotAngle = dot.angle;
      const savedSize = Number(localStorage.getItem('gamejoy:minimap-size'));
      if (Number.isInteger(savedSize) && savedSize >= 10 && savedSize <= 55) config.mapSize = savedSize;
    } catch {}
    return config;
  }

  function labels() {
    zoom.labels[0].querySelector('output').value = zoom.value;
    dotDistance.labels[0].querySelector('output').value = dotDistance.value + ' %';
    dotAngle.labels[0].querySelector('output').value = dotAngle.value + '°';
    size.labels[0].querySelector('output').value = size.value + ' %';
    animationDistance.labels[0].querySelector('output').value = animationDistance.value + ' %';
    animationDuration.labels[0].querySelector('output').value = animationDuration.value.replace('.', ',') + ' s';
  }

  function mapConfig(refresh = false) {
    labels();
    send('settings:map-config', {zoom:zoom.valueAsNumber, distance:dotDistance.valueAsNumber,
      angle:dotAngle.valueAsNumber, refresh});
  }
  zoom.addEventListener('input', labels);
  zoom.addEventListener('change', () => mapConfig());
  for (const [id, delta] of [['map-zoom-out', -1], ['map-zoom-in', 1]]) {
    byId(id).addEventListener('click', () => {
      zoom.value = Math.max(Number(zoom.min), Math.min(Number(zoom.max), zoom.valueAsNumber + delta));
      mapConfig();
    });
  }
  dotDistance.addEventListener('input', mapConfig);
  dotAngle.addEventListener('input', mapConfig);
  byId('center-map-dot').addEventListener('click', () => {
    dotDistance.value = 0;
    dotAngle.value = 0;
    mapConfig();
  });
  size.addEventListener('input', () => {
    labels();
    try { localStorage.setItem('gamejoy:minimap-size', size.value); } catch {}
    send('settings:map-size', {size:size.valueAsNumber});
  });
  size.addEventListener('change', () => send('settings:map-refresh'));
  animationDistance.addEventListener('input', labels);
  animationDuration.addEventListener('input', labels);
  document.querySelector('.map-animation-pad').addEventListener('click', event => {
    const button = event.target.closest('button[data-dx], button[data-dy]');
    if (button) send('settings:map-animate', {dx:Number(button.dataset.dx || 0), dy:Number(button.dataset.dy || 0),
      distance:animationDistance.valueAsNumber, duration:animationDuration.valueAsNumber});
  });
  byId('return-minimap').addEventListener('click', () => send('settings:map-return', {duration:animationDuration.valueAsNumber}));
  byId('reset-minimap').addEventListener('click', () => send('settings:map-reset'));

  function show(data) {
    if (Number.isInteger(data?.zoom)) zoom.value = data.zoom;
    if (Number.isFinite(data?.dotDistance)) dotDistance.value = data.dotDistance;
    if (Number.isFinite(data?.dotAngle)) dotAngle.value = data.dotAngle;
    if (Number.isInteger(data?.mapSize)) size.value = data.mapSize;
    labels();
  }
  window.addEventListener('message', event => {
    if (event.source !== parent) return;
    if (event.data?.type === 'settings:init-map') show(event.data);
  });
  window.GameJoyBus?.on(data => {
    if (data?.type === 'settings:init-map') show(data);
    if (data?.type === 'map:shortcut' && data.key === 'm') panel.open = !panel.open;
  });
  show(readSaved());
  const initial = readSaved();
  parent.postMessage({type:'settings:ready'}, '*');
  parent.postMessage({type:'settings:init-map',...initial}, '*');
  window.GameJoyBus?.post({type:'settings:init-map',...initial});
}());
