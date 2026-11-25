(function () {
  const enabled = document.getElementById('button-color-enabled');
  const hue = document.getElementById('button-hue');
  const panel = document.querySelector('.arrow-settings');
  let config = {enabled:false,hue:190};
  try {
    const saved = JSON.parse(localStorage.getItem('gamejoy:button-color'));
    if (typeof saved?.enabled === 'boolean' && Number.isInteger(saved?.hue) && saved.hue >= 0 && saved.hue <= 359) config = saved;
  } catch {}

  function show(data) {
    if (typeof data?.enabled !== 'boolean' || !Number.isFinite(data?.hue)) return;
    config = {enabled:Boolean(data.enabled),hue:Math.max(0,Math.min(359,Number(data.hue)))};
    enabled.checked = config.enabled;
    hue.value = config.hue;
    hue.labels[0].querySelector('output').value = hue.value + '°';
  }
  function sync() {
    config = {enabled:enabled.checked,hue:hue.valueAsNumber};
    try { localStorage.setItem('gamejoy:button-color',JSON.stringify(config)); } catch {}
    const message={type:'settings:button-config',...config};
    parent.postMessage(message, '*');
    window.GameJoyBus?.post(message);
    window.GameJoyBus?.post({type:'controls:style',...config});
  }
  enabled.addEventListener('change', sync);
  hue.addEventListener('input', sync);
  window.addEventListener('message', event => {
    if (event.source !== parent) return;
    if (event.data?.type === 'settings:init-buttons') show(event.data);
  });
  window.GameJoyBus?.on(data => {
    if (data?.type === 'controls:style') show({enabled:data.enabled,hue:data.hue});
    if (data?.type === 'controls:shortcut' && data.key === 'b') panel.open = !panel.open;
  });
  show(config);
  parent.postMessage({type:'settings:ready'}, '*');
  parent.postMessage({type:'settings:init-buttons',...config}, '*');
  window.GameJoyBus?.post({type:'settings:init-buttons',...config});
  window.GameJoyBus?.post({type:'controls:style',...config});
}());
