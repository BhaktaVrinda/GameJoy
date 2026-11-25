(function () {
  const stage = document.querySelector('main');
  const frames = Object.fromEntries([
    ['f', 'arrow-settings-view'], ['m', 'map-settings-view'],
    ['b', 'button-settings-view'], ['o', 'mission-settings-view']
  ].map(([key, id]) => [key, document.getElementById(id)]));
  const states = new Map();
  let topLayer = 10;
  for (const [key, frame] of Object.entries(frames)) {
    const state = {frame, position:null, dragStart:null, storageKey:'gamejoy:settings-position:' + key};
    states.set(frame.contentWindow, state);
    try {
      const saved = JSON.parse(localStorage.getItem(state.storageKey));
      if (Number.isFinite(saved?.x) && Number.isFinite(saved?.y)) place(state, saved.x, saved.y);
    } catch {}
  }
  function place(state, x, y) {
    const frame = state.frame;
    const availableX = Math.max(0, stage.clientWidth - frame.offsetWidth);
    const availableY = Math.max(0, stage.clientHeight - frame.offsetHeight);
    state.position = {x:Math.max(0, Math.min(1, x)), y:Math.max(0, Math.min(1, y))};
    frame.style.transform = 'none';
    frame.style.left = state.position.x * availableX + 'px';
    frame.style.top = state.position.y * availableY + 'px';
  }
  function resize() {
    for (const state of states.values()) {
      state.frame.contentWindow?.postMessage({type:'settings:stage',height:stage.clientHeight}, '*');
      if (state.position) place(state, state.position.x, state.position.y);
    }
  }
  new ResizeObserver(resize).observe(stage);
  window.addEventListener('message', event => {
    const state = states.get(event.source);
    if (!state) return;
    const {frame} = state;
    const data = event.data;
    if (data?.type === 'settings:ready') resize();
    if (data?.type === 'settings:measure') {
      frame.style.width = (data.open ? Math.min(stage.clientWidth * .34, 420) : 145) + 'px';
      frame.style.height = Math.max(43, Math.min(stage.clientHeight - 10, data.height)) + 'px';
      if (data.open) frame.style.zIndex = String(++topLayer);
      if (state.position) place(state, state.position.x, state.position.y);
    }
    if (data?.type === 'settings:drag') {
      if (!state.dragStart) {
        const frameBounds = frame.getBoundingClientRect();
        const stageBounds = stage.getBoundingClientRect();
        state.dragStart = {left:frameBounds.left - stageBounds.left, top:frameBounds.top - stageBounds.top};
      }
      place(state, (state.dragStart.left + data.dx) / Math.max(1, stage.clientWidth - frame.offsetWidth),
        (state.dragStart.top + data.dy) / Math.max(1, stage.clientHeight - frame.offsetHeight));
    }
    if (data?.type === 'settings:drag-end') {
      state.dragStart = null;
      if (state.position) try {localStorage.setItem(state.storageKey, JSON.stringify(state.position));} catch {}
    }
    if (data?.type === 'settings:shortcut') toggle(data.key);
  });
  function toggle(key) {
    const frame = frames[key.toLowerCase()];
    frame?.contentWindow?.postMessage({type:'settings:toggle'}, '*');
  }
  window.GameJoySettings = {toggle};
  document.addEventListener('keydown', event => {
    const key = event.key.toLowerCase();
    if (!frames[key] || event.repeat || event.altKey || event.ctrlKey || event.metaKey ||
        event.target.closest('input,textarea,select,[contenteditable]')) return;
    event.preventDefault();
    toggle(key);
  });
}());
