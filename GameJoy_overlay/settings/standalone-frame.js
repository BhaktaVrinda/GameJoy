(function () {
  const stage = document.querySelector('main');
  const frame = document.querySelector('.settings-frame');
  if (!stage || !frame) return;

  const key = stage.dataset.settingsKey || 'module';
  const storageKey = 'gamejoy:settings-position:' + key;
  let position;
  let dragStart;
  let topLayer = 10;

  function place(x, y) {
    const availableX = Math.max(0, stage.clientWidth - frame.offsetWidth);
    const availableY = Math.max(0, stage.clientHeight - frame.offsetHeight);
    position = {x:Math.max(0, Math.min(1, x)), y:Math.max(0, Math.min(1, y))};
    frame.style.transform = 'none';
    frame.style.left = position.x * availableX + 'px';
    frame.style.top = position.y * availableY + 'px';
  }

  try {
    const saved = JSON.parse(localStorage.getItem(storageKey));
    if (Number.isFinite(saved?.x) && Number.isFinite(saved?.y)) place(saved.x, saved.y);
  } catch {}

  function resize() {
    frame.contentWindow?.postMessage({type:'settings:stage',height:stage.clientHeight}, '*');
    if (position) place(position.x, position.y);
  }

  new ResizeObserver(resize).observe(stage);
  window.addEventListener('message', event => {
    if (event.source !== frame.contentWindow) return;
    const data = event.data;
    if (data?.type === 'settings:ready') resize();
    if (data?.type === 'settings:measure') {
      frame.style.width = (data.open ? Math.min(stage.clientWidth * .34, 420) : 145) + 'px';
      frame.style.height = Math.max(43, Math.min(stage.clientHeight - 10, data.height)) + 'px';
      if (data.open) frame.style.zIndex = String(++topLayer);
      if (position) place(position.x, position.y);
    }
    if (data?.type === 'settings:drag') {
      if (!dragStart) {
        const frameBounds = frame.getBoundingClientRect();
        const stageBounds = stage.getBoundingClientRect();
        dragStart = {left:frameBounds.left - stageBounds.left, top:frameBounds.top - stageBounds.top};
      }
      place((dragStart.left + data.dx) / Math.max(1, stage.clientWidth - frame.offsetWidth),
        (dragStart.top + data.dy) / Math.max(1, stage.clientHeight - frame.offsetHeight));
    }
    if (data?.type === 'settings:drag-end') {
      dragStart = null;
      if (position) try { localStorage.setItem(storageKey, JSON.stringify(position)); } catch {}
    }
    if (data?.type === 'settings:shortcut') {
      frame.contentWindow?.postMessage({type:'settings:toggle'}, '*');
    }
  });

  window.GameJoySettings = {
    toggle() { frame.contentWindow?.postMessage({type:'settings:toggle'}, '*'); }
  };
}());
