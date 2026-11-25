// Public controls for the standalone module. The panel owns its settings.
(function () {
  const view = document.getElementById('arrow-view');
  const panel = document.getElementById('arrow-settings-view');
  window.GameJoyArrow = {
    setConfig(config) {
      panel.contentWindow.postMessage({type:'arrow:set-config', config}, '*');
    },
    move(x, y) {
      view.contentWindow.postMessage({type:'arrow:move', x, y}, '*');
    }
  };
}());
