(function () {
  const frame = document.getElementById('map-view');
  const settings = document.getElementById('map-settings-view');
  if (!frame) return;
  const params = new URLSearchParams(location.search);
  const latitude = Number(params.get('lat'));
  const longitude = Number(params.get('lng'));
  let center = params.has('lat') && params.has('lng') && Number.isFinite(latitude) && Math.abs(latitude) <= 90 &&
    Number.isFinite(longitude) && Math.abs(longitude) <= 180 ? [latitude, longitude] : [40.416775, -3.70379];
  let zoom = 16, distance = 0, angle = 0, mapSize = 21;
  let liveCenter = false;
  try {
    const saved = Number(localStorage.getItem('gamejoy:map-zoom'));
    if (Number.isInteger(saved) && saved >= 3 && saved <= 21) zoom = saved;
    const dot = JSON.parse(localStorage.getItem('gamejoy:map-dot-position'));
    if (Number.isFinite(dot?.distance) && dot.distance >= 0 && dot.distance <= 85 &&
        Number.isFinite(dot?.angle) && dot.angle >= 0 && dot.angle <= 359) {
      distance = dot.distance;
      angle = dot.angle;
    }
    const size = Number(localStorage.getItem('gamejoy:minimap-size'));
    if (Number.isInteger(size) && size >= 10 && size <= 55) mapSize = size;
  } catch {}

  function sync(refresh = false) {
    frame.contentWindow?.postMessage({type:'map:config',config:{lat:center[0],lng:center[1],zoom,distance,angle,refresh}}, '*');
  }
  function receive(data) {
    if (data?.type === 'map:ready' && liveCenter) sync(true);
    if (data?.type === 'settings:map-config') {
      if (Number.isInteger(data.zoom)) zoom = data.zoom;
      if (Number.isFinite(data.distance)) distance = data.distance;
      if (Number.isFinite(data.angle)) angle = data.angle;
      try {
        localStorage.setItem('gamejoy:map-zoom', String(zoom));
        localStorage.setItem('gamejoy:map-dot-position', JSON.stringify({distance,angle}));
      } catch {}
      if (liveCenter || data.refresh) sync(Boolean(data.refresh));
    }
    if (data?.type === 'settings:map-refresh') sync(true);
  }
  window.GameJoyMap = {
    setCenter(position) {
      if (Number.isFinite(position?.lat) && Math.abs(position.lat) <= 90 &&
          Number.isFinite(position?.lng) && Math.abs(position.lng) <= 180) {
        center = [position.lat, position.lng];
        // El iframe de Google se carga una sola vez. Las siguientes
        // posiciones no lo recargan y evitan el parpadeo del minimapa.
        if (!liveCenter) {
          liveCenter = true;
          sync();
        }
      }
    },
    refresh() { liveCenter = true; sync(true); }
  };
  window.addEventListener('message', event => {
    if (event.source === frame.contentWindow || event.source === settings?.contentWindow) receive(event.data);
  });
  window.GameJoyBus?.on(receive);
  if (params.has('lat') && params.has('lng')) {
    liveCenter = true;
    sync();
  }
}());
