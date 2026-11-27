import { waitForObsToken } from '/obs-session-token.js';

const directFrame = document.getElementById('direct-view');
const mapFrame = document.getElementById('map-module');
const status = document.getElementById('overlay-status');
const authPanel = document.getElementById('obs-auth');
const authMessage = document.getElementById('obs-auth-message');
const logoutFloating = document.getElementById('obs-logout-floating');
const HUD_LOGIN_URL = 'https://moneymaze.es/apps/gamejoy/obs/hud_menu.php';

let arrowToken = null;
let mapToken = null;
let buttonsToken = null;
let directToken = null;
let socket = null;
let socketToken = null;
let streamId = null;

function setStatus(message) {
  status.textContent = message || '';
  status.hidden = !message;
}

function showAuthPanel(message = 'La sesión de OBS no está abierta.') {
  authMessage.textContent = message;
  authPanel.hidden = false;
  setStatus('');
}

window.addEventListener('gamejoy:obs-auth-required', event => showAuthPanel(
  event.detail?.message || 'OBS necesita iniciar sesión para recuperar la flecha y el directo.'
));

document.getElementById('obs-auth-login').addEventListener('click', () => {
  window.location.href = HUD_LOGIN_URL;
});

async function logout() {
  if (logoutFloating) logoutFloating.disabled = true;
  try {
    await fetch('/obs/session/logout', { method: 'POST', credentials: 'same-origin', cache: 'no-store' });
  } catch {}
  if (socket) socket.disconnect();
  socket = null;
  socketToken = null;
  arrowToken = null;
  mapToken = null;
  buttonsToken = null;
  directToken = null;
  streamId = null;
  directFrame.classList.remove('active');
  directFrame.removeAttribute('src');
  showAuthPanel('Sesión cerrada. Pulsa «Abrir formulario GameJoy» para conectar OBS otra vez.');
  if (logoutFloating) logoutFloating.disabled = false;
}

document.getElementById('obs-auth-logout').addEventListener('click', logout);
logoutFloating?.addEventListener('click', logout);

function publish(data) {
  window.GameJoyBus?.post(data);
  window.dispatchEvent(new CustomEvent('gamejoy:overlay-message', { detail: data }));
}

function resetInput() {
  publish({ type: 'controls:move', x: 0, y: 0 });
  for (const action of ['cross', 'circle', 'square', 'triangle']) {
    publish({ type: 'controls:remote-action', action, pressed: false });
  }
}

function normalizeButton(button) {
  const value = String(button || '').toUpperCase();
  return ({ A: 'cross', B: 'circle', X: 'square', Y: 'triangle', CROSS: 'cross',
    CIRCLE: 'circle', SQUARE: 'square', TRIANGLE: 'triangle' })[value] || value.toLowerCase();
}

function connectSocket() {
  const token = mapToken || arrowToken || buttonsToken;
  if (!token || typeof window.io !== 'function') return;
  if (socket && socketToken === token) return;
  if (socket) socket.disconnect();
  socketToken = token;
  socket = window.io({ autoConnect: false, reconnection: true });
  socket.on('connect', () => {
    socket.emit('gamejoy:obs-subscribe', { token: socketToken });
    setStatus('');
  });
  socket.on('gamejoy:obs-input', data => {
    if (Number.isFinite(data?.x) && Number.isFinite(data?.y)) {
      publish({ type: 'controls:move', x: data.x, y: data.y });
    }
  });
  socket.on('gamejoy:obs-buttons', data => {
    const pressed = new Set(Array.isArray(data?.buttons) ? data.buttons.map(normalizeButton) : []);
    for (const action of ['cross', 'circle', 'square', 'triangle']) {
      publish({ type: 'controls:remote-action', action, pressed: pressed.has(action) });
    }
  });
  socket.on('gamejoy:obs-button', data => {
    if (typeof data?.button === 'string' && typeof data?.pressed === 'boolean') {
      publish({ type: 'controls:remote-action', action: normalizeButton(data.button), pressed: data.pressed });
    }
  });
  socket.on('gamejoy:obs-stopped', resetInput);
  socket.on('gamejoy:obs-error', data => setStatus(data?.message || 'Overlay no disponible'));
  socket.on('disconnect', () => { resetInput(); setStatus('Reconectando con GameJoy…'); });
  socket.on('connect_error', () => setStatus('No se pudo conectar con GameJoy'));
  socket.connect();
}

function showStream(id) {
  if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{16,64}$/.test(id)) {
    streamId = null;
    directFrame.classList.remove('active');
    directFrame.removeAttribute('src');
    return;
  }
  if (id === streamId) return;
  streamId = id;
  directFrame.src = 'https://vdo.ninja/?view=' + encodeURIComponent(id) + '&cleanoutput&autoplay&mutespeaker=0';
  directFrame.classList.add('active');
}

async function pollDirect() {
  if (!directToken) return;
  const abort = new AbortController();
  const deadline = setTimeout(() => abort.abort(), 3500);
  try {
    const response = await fetch('/obs/vdo/current', {
      headers: { Authorization: 'Bearer ' + directToken }, cache: 'no-store', signal: abort.signal
    });
    showStream(response.ok ? (await response.json()).streamId : null);
  } catch {
    showStream(null);
  } finally {
    clearTimeout(deadline);
    setTimeout(pollDirect, 1000);
  }
}

async function pollMap() {
  if (!mapToken || !mapFrame) return;
  const abort = new AbortController();
  const deadline = setTimeout(() => abort.abort(), 3500);
  try {
    const response = await fetch('/obs/position', {
      headers: { Authorization: 'Bearer ' + mapToken },
      cache: 'no-store',
      signal: abort.signal
    });
    if (response.status === 200) {
      const point = await response.json();
      mapFrame.contentWindow?.GameJoyMap?.setCenter({
        lat: point.latitude,
        lng: point.longitude,
        heading: point.heading
      });
    }
  } catch {}
  finally {
    clearTimeout(deadline);
    setTimeout(pollMap, 1000);
  }
}

window.GameJoyOverlay = { resetInput };

waitForObsToken('map', message => setStatus(message)).then(access => {
  mapToken = access.token;
  connectSocket();
  pollMap();
});

waitForObsToken('arrow', message => setStatus(message)).then(access => {
  arrowToken = access.token;
  connectSocket();
});

waitForObsToken('buttons', () => {}).then(access => {
  buttonsToken = access.token;
  connectSocket();
});

waitForObsToken('direct', message => {
  if (!arrowToken) setStatus(message);
}).then(access => {
  directToken = access.token;
  pollDirect();
});
