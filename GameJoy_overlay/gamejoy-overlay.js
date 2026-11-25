import { waitForObsToken } from '/obs-session-token.js';

const arrowFrame = document.getElementById('arrow-module');
const classicArrow = document.getElementById('classic-arrow');
const mapFrame = document.getElementById('map-module');
const directFrame = document.getElementById('direct-view');
const status = document.getElementById('overlay-status');
const authPanel = document.getElementById('obs-auth');
const authMessage = document.getElementById('obs-auth-message');
const logoutFloating = document.getElementById('obs-logout-floating');
const HUD_LOGIN_URL = 'https://moneymaze.es/apps/gamejoy/obs/hud_menu.php';

let mapToken = null;
let arrowToken = null;
let buttonsToken = null;
let directToken = null;
let socket = null;
let socketToken = null;
let streamId = null;
let arrowStyle = localStorage.getItem('gamejoy:arrow-style') === 'classic' ? 'classic' : 'new';

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
  event.detail?.message || 'OBS necesita iniciar sesión para recuperar mapa, flecha, botones y directo.'
));
document.getElementById('obs-auth-login').addEventListener('click', () => {
  window.location.href = HUD_LOGIN_URL;
});
async function logoutObs() {
  if (logoutFloating) {
    logoutFloating.disabled = true;
    logoutFloating.textContent = 'Cerrando…';
  }
  try {
    await fetch('/obs/session/logout', { method: 'POST', credentials: 'same-origin', cache: 'no-store' });
  } catch {}
  window.location.href = HUD_LOGIN_URL;
}
document.getElementById('obs-auth-logout').addEventListener('click', logoutObs);
logoutFloating?.addEventListener('click', logoutObs);

function publish(data) {
  window.GameJoyBus?.post(data);
  window.dispatchEvent(new CustomEvent('gamejoy:overlay-message', { detail: data }));
}

function setArrowStyle(style, persist = true) {
  arrowStyle = style === 'classic' ? 'classic' : 'new';
  if (persist) localStorage.setItem('gamejoy:arrow-style', arrowStyle);
  const classic = arrowStyle === 'classic';
  arrowFrame.hidden = classic;
  classicArrow.hidden = !classic;
  const legacyArrowToken = arrowToken || mapToken || buttonsToken || directToken;
  if (classic && legacyArrowToken) {
    const nextSource = `/obs/arrow#${legacyArrowToken}`;
    if (classicArrow.getAttribute('src') !== nextSource) classicArrow.src = nextSource;
  }
  setStatus(`Flecha ${classic ? 'clásica' : 'nueva'}`);
  setTimeout(() => { if (status.textContent.startsWith('Flecha ')) setStatus(''); }, 1400);
}

function normalizeButton(button) {
  const value = String(button || '').toUpperCase();
  return ({ A: 'cross', B: 'circle', X: 'square', Y: 'triangle', CROSS: 'cross',
    CIRCLE: 'circle', SQUARE: 'square', TRIANGLE: 'triangle' })[value] || value.toLowerCase();
}

function resetInput() {
  publish({ type: 'controls:move', x: 0, y: 0 });
  for (const action of ['cross', 'circle', 'square', 'triangle']) {
    publish({ type: 'controls:remote-action', action, pressed: false });
  }
}

function connectSocket() {
  const token = mapToken || arrowToken || buttonsToken || directToken;
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
    if (Number.isFinite(data?.x) && Number.isFinite(data?.y)) publish({ type: 'controls:move', x: data.x, y: data.y });
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

async function pollMap() {
  if (!mapToken) return;
  const abort = new AbortController();
  const deadline = setTimeout(() => abort.abort(), 3500);
  try {
    const response = await fetch('/obs/position', {
      headers: { Authorization: 'Bearer ' + mapToken }, cache: 'no-store', signal: abort.signal
    });
    if (response.ok) {
      const point = await response.json();
      mapFrame.contentWindow?.GameJoyMap?.setCenter({ lat: point.latitude, lng: point.longitude });
    }
  } catch {}
  finally { clearTimeout(deadline); setTimeout(pollMap, 1000); }
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
  } catch { showStream(null); }
  finally { clearTimeout(deadline); setTimeout(pollDirect, 1000); }
}

window.addEventListener('keydown', event => {
  if (event.key.toLowerCase() === 'c' && !event.repeat && !event.altKey && !event.ctrlKey && !event.metaKey &&
      !event.target.closest('input,textarea,select,[contenteditable]')) {
    setArrowStyle(arrowStyle === 'classic' ? 'new' : 'classic');
  }
});

window.GameJoyOverlay = { setArrowStyle, getArrowStyle: () => arrowStyle };
setArrowStyle(arrowStyle, false);

waitForObsToken('map', message => setStatus(message)).then(access => {
  mapToken = access.token;
  connectSocket();
  pollMap();
  setArrowStyle(arrowStyle, false);
});
waitForObsToken('arrow', () => {}).then(access => {
  arrowToken = access.token;
  connectSocket();
  setArrowStyle(arrowStyle, false);
});
waitForObsToken('buttons', () => {}).then(access => {
  buttonsToken = access.token;
  connectSocket();
});
waitForObsToken('direct', message => { if (!mapToken) setStatus(message); }).then(access => {
  directToken = access.token;
  pollDirect();
});
