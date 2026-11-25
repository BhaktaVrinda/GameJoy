(function () {
  const panel = document.querySelector('.arrow-settings');
  const handle = panel.querySelector(':scope > summary');
  let pointerId;
  let startX;
  let startY;
  let didDrag = false;
  const send = (type, detail = {}) => parent.postMessage({type, ...detail}, '*');

  function measure() {
    send('settings:measure', {open: panel.open, height: Math.ceil(panel.getBoundingClientRect().height)});
  }
  new ResizeObserver(measure).observe(panel);
  panel.addEventListener('toggle', measure);

  handle.addEventListener('pointerdown', event => {
    if (pointerId !== undefined) return;
    pointerId = event.pointerId;
    startX = event.screenX;
    startY = event.screenY;
    didDrag = false;
    handle.setPointerCapture(pointerId);
  });
  handle.addEventListener('pointermove', event => {
    if (event.pointerId !== pointerId) return;
    const dx = event.screenX - startX;
    const dy = event.screenY - startY;
    if (!didDrag && Math.hypot(dx, dy) < 4) return;
    didDrag = true;
    handle.classList.add('dragging');
    send('settings:drag', {dx, dy});
  });
  handle.addEventListener('lostpointercapture', event => {
    if (event.pointerId !== pointerId) return;
    pointerId = undefined;
    handle.classList.remove('dragging');
    if (didDrag) send('settings:drag-end');
  });
  handle.addEventListener('click', event => {
    if (!didDrag) return;
    event.preventDefault();
    didDrag = false;
  });
  document.addEventListener('keydown', event => {
    const key = event.key.toLowerCase();
    if (!'fmbo'.includes(key) || key.length !== 1 || event.repeat || event.altKey || event.ctrlKey || event.metaKey ||
        event.target.closest('input[type=text],input[type=color],textarea,select,[contenteditable]')) return;
    event.preventDefault();
    send('settings:shortcut', {key});
  });
  window.addEventListener('message', event => {
    if (event.source !== parent) return;
    if (event.data?.type === 'settings:toggle') panel.open = !panel.open;
    if (event.data?.type === 'settings:stage') {
      document.documentElement.style.setProperty('--panel-height', Math.max(60, event.data.height - 20) + 'px');
      measure();
    }
  });
  send('settings:ready');
  measure();
}());
