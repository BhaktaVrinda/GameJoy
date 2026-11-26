// El servidor resuelve el token de mapa de la cuenta con la cookie OBS.
export function startLiveMap(panel) {
  const layers = panel.querySelector('.map-layers');
  const status = panel.querySelector('.map-state');
  const heading = panel.querySelector('.map-heading');
  const view = panel.querySelector('.map-view');
  const fix = panel.querySelector('.map-fix');
  const beam = panel.querySelector('.map-beam');
  const zoom = 17;
  const worldPixels = 256 * 2 ** zoom;
  const compass = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];
  let latest = null;
  let angle = null;
  const lifetime = new AbortController();
  let active = null;
  let pending = null;
  let lastAttempt = -Infinity;
  let pollTimer;
  let loadTimer;
  let expiryTimer;

  function reset(message) {
    clearTimeout(loadTimer);
    clearTimeout(expiryTimer);
    active = pending = null;
    lastAttempt = -Infinity;
    layers.replaceChildren();
    delete panel.dataset.map;
    latest = angle = null;
    fix.hidden = true;
    beam.setAttribute('hidden', '');
    heading.textContent = '';
    status.textContent = message;
  }

  function moved(a, b) {
    const north = (a.latitude - b.latitude) * 111320;
    const longitudeDelta = ((a.longitude - b.longitude + 540) % 360) - 180;
    const east = longitudeDelta * 111320 * Math.cos(b.latitude * Math.PI / 180);
    return Math.hypot(north, east) >= 12;
  }

  // Píxeles Web Mercator respecto al centro de la cartografía visible.
  function mercatorY(latitude) {
    const radians = Math.max(-85.05113, Math.min(85.05113, latitude)) * Math.PI / 180;
    return -Math.asinh(Math.tan(radians)) * worldPixels / (2 * Math.PI);
  }

  function placeFix() {
    if (!active || !latest) return;
    const center = active.point;
    const dx = (((latest.longitude - center.longitude + 540) % 360) - 180) * worldPixels / 360;
    const dy = mercatorY(latest.latitude) - mercatorY(center.latitude);
    fix.hidden = Math.abs(dx) >= view.clientWidth / 2 || Math.abs(dy) >= view.clientHeight / 2;
    fix.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
  }

  function setHeading(degrees) {
    if (!Number.isFinite(degrees)) {
      angle = null;
      beam.setAttribute('hidden', '');
      heading.textContent = '';
      return;
    }
    const northBearing = ((degrees % 360) + 360) % 360;
    const previous = angle === null ? northBearing : ((angle % 360) + 360) % 360;
    const shortestTurn = ((northBearing - previous + 540) % 360) - 180;
    angle = (angle ?? northBearing) + shortestTurn;
    beam.style.transform = 'rotate(' + angle + 'deg)';
    beam.removeAttribute('hidden');
    heading.textContent = compass[Math.round(northBearing / 45) % 8] + ' · ' +
      Math.round(northBearing) % 360 + '°';
  }

  function render(point) {
    const { latitude, longitude, remainingMs } = point;
    if (!Number.isFinite(latitude) || Math.abs(latitude) > 90 ||
        !Number.isFinite(longitude) || Math.abs(longitude) > 180 ||
        !Number.isFinite(remainingMs) || remainingMs <= 0) {
      reset('Esperando GPS');
      return;
    }
    clearTimeout(expiryTimer);
    expiryTimer = setTimeout(() => reset('Esperando GPS'), remainingMs);
    latest = point;
    setHeading(point.heading);
    placeFix();
    if (pending || (active && !moved(point, active.point)) || performance.now() - lastAttempt < 4000) return;

    lastAttempt = performance.now();
    const frame = document.createElement('iframe');
    frame.title = 'Ubicación del jugador en Google Maps';
    frame.tabIndex = -1;
    frame.referrerPolicy = 'no-referrer';
    frame.style.visibility = 'hidden';
    const coords = latitude + ',' + longitude;
    frame.src = 'https://maps.google.com/maps?' + new URLSearchParams({
      ll: coords, z: String(zoom), hl: 'es', output: 'embed'
    });
    pending = frame;
    status.textContent = active ? 'Actualizando…' : 'Cargando mapa…';
    frame.onload = () => {
      if (pending !== frame) return;
      clearTimeout(loadTimer);
      frame.style.visibility = 'visible';
      active?.frame.remove();
      active = { point, frame };
      pending = null;
      placeFix();
      panel.dataset.map = 'ready';
      status.textContent = 'En directo';
    };
    function loadFailed() {
      if (pending !== frame) return;
      reset('Reintentando mapa…');
      lastAttempt = performance.now();
    }
    frame.onerror = loadFailed;
    loadTimer = setTimeout(loadFailed, 12000);
    panel.dataset.map = 'loading';
    layers.append(frame);
  }

  async function poll() {
    let delay = 1000;
    const request = new AbortController();
    const cancel = () => request.abort();
    lifetime.signal.addEventListener('abort', cancel, { once: true });
    const timeout = setTimeout(cancel, 4000);
    try {
      const response = await fetch('/obs/session/map/position', {
        credentials: 'same-origin', cache: 'no-store', signal: request.signal
      });
      if (lifetime.signal.aborted) return;
      if (response.status === 200) {
        delay = 500;
        const point = await response.json();
        if (!lifetime.signal.aborted) render(point);
      } else if (response.status === 204) {
        reset('Esperando GPS');
      } else if (response.status === 401 || response.status === 404) {
        reset(response.status === 401 ? 'Inicia sesión en OBS' : 'Envía el token de mapa y reconecta OBS');
        delay = 3000;
      } else {
        throw new Error('GPS unavailable');
      }
    } catch {
      if (!lifetime.signal.aborted) reset('Reconectando…');
      delay = 2000;
    } finally {
      clearTimeout(timeout);
      lifetime.signal.removeEventListener('abort', cancel);
      if (!lifetime.signal.aborted) pollTimer = setTimeout(poll, delay);
    }
  }

  poll();
  return () => {
    lifetime.abort();
    clearTimeout(pollTimer);
    reset('Sesión cerrada');
  };
}
