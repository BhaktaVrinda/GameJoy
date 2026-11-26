// El servidor resuelve el token de mapa de la cuenta con la cookie OBS.
export function startLiveMap(panel) {
  const layers = panel.querySelector('.map-layers');
  const status = panel.querySelector('.map-state');
  const heading = panel.querySelector('.map-heading');
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
    heading.textContent = '';
    status.textContent = message;
  }

  function moved(a, b) {
    const north = (a.latitude - b.latitude) * 111320;
    const longitudeDelta = ((a.longitude - b.longitude + 540) % 360) - 180;
    const east = longitudeDelta * 111320 * Math.cos(b.latitude * Math.PI / 180);
    return Math.hypot(north, east) >= 12;
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
    heading.textContent = Number.isFinite(point.heading) ? Math.round(point.heading) % 360 + '°' : '';
    if (pending || (active && !moved(point, active.point)) || performance.now() - lastAttempt < 4000) return;

    lastAttempt = performance.now();
    const frame = document.createElement('iframe');
    frame.title = 'Ubicación del jugador en Google Maps';
    frame.referrerPolicy = 'no-referrer';
    frame.style.visibility = 'hidden';
    const coords = latitude + ',' + longitude;
    frame.src = 'https://maps.google.com/maps?' + new URLSearchParams({
      q: coords, ll: coords, z: '17', hl: 'es', output: 'embed'
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
