(function () {
  const settings = document.getElementById('button-settings-view');
  const actions = document.getElementById('actions-view');
  const storageKey = 'gamejoy:button-color';
  let config = {enabled:false,hue:190};
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey));
    if (typeof saved?.enabled === 'boolean' && Number.isInteger(saved?.hue) && saved.hue >= 0 && saved.hue <= 359) config = saved;
  } catch {}
  function syncActions() { actions?.contentWindow?.postMessage({type:'controls:style',...config}, '*'); }
  function receive(data, source) {
    if (data?.type === 'controls:ready' && source === actions?.contentWindow) syncActions();
    if (data?.type === 'settings:button-config') {
      config = {enabled:Boolean(data.enabled),hue:Number(data.hue)};
      try { localStorage.setItem(storageKey,JSON.stringify(config)); } catch {}
      syncActions();
    }
    if (data?.type === 'settings:ready' || data?.type === 'settings:init-buttons') {
      settings?.contentWindow?.postMessage({type:'settings:init-buttons',...config}, '*');
    }
    if (data?.type === 'controls:move' || data?.type === 'controls:action' || data?.type === 'controls:shortcut') {
      if (data.type === 'controls:action') window.dispatchEvent(new CustomEvent('gamejoy:action',{detail:{action:data.action}}));
      if (data.type === 'controls:move') window.dispatchEvent(new CustomEvent('gamejoy:move',{detail:{x:data.x,y:data.y}}));
    }
  }
  window.addEventListener('message', event => receive(event.data,event.source));
  window.GameJoyBus?.on(data => {
    if (data?.type === 'settings:button-config') receive(data);
  });
  window.GameJoyControls = {getConfig:() => ({...config})};
  syncActions();
}());
