(function () {
  const stage = document.querySelector('main');
  const minimap = document.querySelector('#map-shell');
  const storageKey = 'gamejoy:minimap-position';
  const originKey = 'gamejoy:minimap-animation-origin';
  const sizeKey = 'gamejoy:minimap-size';
  const settings = document.getElementById('map-settings-view');
  const size = {value:'21'};
  let position;
  let origin;
  let activePointer;
  let grabX;
  let grabY;
  let animationFrame;

  function savePosition() {
    if (position) {
      try { localStorage.setItem(storageKey, JSON.stringify(position)); } catch {}
    }
  }

  function saveOrigin() {
    if (origin) {
      try { localStorage.setItem(originKey, JSON.stringify(origin)); } catch {}
    }
  }

  function place(x, y) {
    const availableX = Math.max(1, stage.clientWidth - minimap.offsetWidth);
    const availableY = Math.max(1, stage.clientHeight - minimap.offsetHeight);
    const left = Math.max(-minimap.offsetWidth, Math.min(stage.clientWidth, x * availableX));
    const top = Math.max(-minimap.offsetHeight, Math.min(stage.clientHeight, y * availableY));
    position = {x: left / availableX, y: top / availableY};
    minimap.style.left = left + 'px';
    minimap.style.top = top + 'px';
  }

  try {
    const savedSize = Number(localStorage.getItem(sizeKey));
    if (Number.isInteger(savedSize) && savedSize >= 10 && savedSize <= 55) {
      size.value = savedSize;
    }
    minimap.style.width = size.value + '%';
    const saved = JSON.parse(localStorage.getItem(storageKey));
    if (Number.isFinite(saved?.x) && Number.isFinite(saved?.y)) place(saved.x, saved.y);
    const savedOrigin = JSON.parse(localStorage.getItem(originKey));
    if (Number.isFinite(savedOrigin?.x) && Number.isFinite(savedOrigin?.y)) origin = savedOrigin;
  } catch {}

  function updateSize(value) {
    size.value = String(value);
    cancelAnimationFrame(animationFrame);
    animationFrame = undefined;
    const oldWidth = minimap.offsetWidth;
    const oldHeight = minimap.offsetHeight;
    const wasVisibleX = minimap.offsetLeft >= 0 && minimap.offsetLeft + oldWidth <= stage.clientWidth;
    const wasVisibleY = minimap.offsetTop >= 0 && minimap.offsetTop + oldHeight <= stage.clientHeight;
    const centerX = minimap.offsetLeft + oldWidth / 2;
    const centerY = minimap.offsetTop + oldHeight / 2;
    const originCenterX = origin?.x * Math.max(1, stage.clientWidth - oldWidth) + oldWidth / 2;
    const originCenterY = origin?.y * Math.max(1, stage.clientHeight - oldHeight) + oldHeight / 2;
    const originWasVisibleX = originCenterX - oldWidth / 2 >= 0 && originCenterX + oldWidth / 2 <= stage.clientWidth;
    const originWasVisibleY = originCenterY - oldHeight / 2 >= 0 && originCenterY + oldHeight / 2 <= stage.clientHeight;
    minimap.style.width = size.value + '%';
    const availableX = Math.max(1, stage.clientWidth - minimap.offsetWidth);
    const availableY = Math.max(1, stage.clientHeight - minimap.offsetHeight);
    const nextLeft = centerX - minimap.offsetWidth / 2;
    const nextTop = centerY - minimap.offsetHeight / 2;
    place((wasVisibleX ? Math.max(0, Math.min(availableX, nextLeft)) : nextLeft) / availableX,
      (wasVisibleY ? Math.max(0, Math.min(availableY, nextTop)) : nextTop) / availableY);
    if (origin) {
      const originLeft = originCenterX - minimap.offsetWidth / 2;
      const originTop = originCenterY - minimap.offsetHeight / 2;
      origin = {
        x: (originWasVisibleX ? Math.max(0, Math.min(availableX, originLeft)) : originLeft) / availableX,
        y: (originWasVisibleY ? Math.max(0, Math.min(availableY, originTop)) : originTop) / availableY
      };
      saveOrigin();
    }
    savePosition();
    try { localStorage.setItem(sizeKey, size.value); } catch {}
  }

  new ResizeObserver(() => {
    if (position) place(position.x, position.y);
  }).observe(stage);

  minimap.addEventListener('pointerdown', event => {
    if (activePointer !== undefined) return;
    cancelAnimationFrame(animationFrame);
    animationFrame = undefined;
    activePointer = event.pointerId;
    const bounds = minimap.getBoundingClientRect();
    grabX = event.clientX - bounds.left;
    grabY = event.clientY - bounds.top;
    minimap.setPointerCapture(event.pointerId);
    minimap.classList.add('dragging');
    event.preventDefault();
  });

  minimap.addEventListener('pointermove', event => {
    if (event.pointerId !== activePointer) return;
    const bounds = stage.getBoundingClientRect();
    const availableX = Math.max(0, stage.clientWidth - minimap.offsetWidth);
    const availableY = Math.max(0, stage.clientHeight - minimap.offsetHeight);
    const x = availableX ? (event.clientX - bounds.left - grabX) / availableX : 0;
    const y = availableY ? (event.clientY - bounds.top - grabY) / availableY : 0;
    place(x, y);
  });

  minimap.addEventListener('lostpointercapture', event => {
    if (event.pointerId !== activePointer) return;
    activePointer = undefined;
    minimap.classList.remove('dragging');
    savePosition();
    origin = position;
    saveOrigin();
  });

  function resetMinimap() {
    cancelAnimationFrame(animationFrame);
    animationFrame = undefined;
    position = undefined;
    origin = undefined;
    minimap.style.removeProperty('left');
    minimap.style.removeProperty('top');
    try {
      localStorage.removeItem(storageKey);
      localStorage.removeItem(originKey);
    } catch {}
  }

  function animateTo(endX, endY, seconds = 1.2) {
    cancelAnimationFrame(animationFrame);
    const startX = minimap.offsetLeft;
    const startY = minimap.offsetTop;
    const availableX = Math.max(1, stage.clientWidth - minimap.offsetWidth);
    const availableY = Math.max(1, stage.clientHeight - minimap.offsetHeight);
    const started = performance.now();
    const durationMs = seconds * 1000;

    function animate(now) {
      const progress = Math.min(1, (now - started) / durationMs);
      const eased = progress * progress * (3 - 2 * progress);
      place((startX + (endX - startX) * eased) / availableX,
        (startY + (endY - startY) * eased) / availableY);
      if (progress < 1) animationFrame = requestAnimationFrame(animate);
      else {
        animationFrame = undefined;
        savePosition();
      }
    }
    animationFrame = requestAnimationFrame(animate);
  }

  function animateDirection(dx, dy, distance, duration) {
    const startX = minimap.offsetLeft;
    const startY = minimap.offsetTop;
    if (!origin) {
      origin = {
        x: startX / Math.max(1, stage.clientWidth - minimap.offsetWidth),
        y: startY / Math.max(1, stage.clientHeight - minimap.offsetHeight)
      };
      saveOrigin();
    }
    const offsetX = dx * stage.clientWidth * distance / 100;
    const offsetY = dy * stage.clientHeight * distance / 100;
    const endX = Math.max(-minimap.offsetWidth, Math.min(stage.clientWidth, startX + offsetX));
    const endY = Math.max(-minimap.offsetHeight, Math.min(stage.clientHeight, startY + offsetY));
    animateTo(endX, endY, duration);
  }

  function returnMinimap(duration) {
    if (!origin) return;
    animateTo(origin.x * Math.max(1, stage.clientWidth - minimap.offsetWidth),
      origin.y * Math.max(1, stage.clientHeight - minimap.offsetHeight), duration);
  }
  function handle(data) {
    if (data?.type === 'settings:map-size') updateSize(data.size);
    if (data?.type === 'settings:map-reset') resetMinimap();
    if (data?.type === 'settings:map-animate') animateDirection(data.dx, data.dy, data.distance, data.duration);
    if (data?.type === 'settings:map-return') returnMinimap(data.duration);
  }
  window.addEventListener('message', event => {
    if (event.source === settings.contentWindow) handle(event.data);
  });
  window.GameJoyBus?.on(handle);
}());
