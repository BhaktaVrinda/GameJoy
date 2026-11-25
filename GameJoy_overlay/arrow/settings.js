(function () {
  const panel = document.querySelector('.arrow-settings');
  const names = ['count', 'side', 'depth', 'height'];
  const sliders = names.map(name => document.getElementById('arrow-' + name));
  const grid = document.getElementById('show-grid');
  const storageKey = 'gamejoy:arrow-config';

  function currentConfig() {
    return {
      ...Object.fromEntries(names.map((name, i) => [name, sliders[i].valueAsNumber])),
      grid: grid.checked
    };
  }

  function restore(config) {
    sliders.forEach((input, i) => {
      const value = config?.[names[i]];
      if (Number.isFinite(value) && value >= Number(input.min) && value <= Number(input.max)) {
        input.valueAsNumber = value;
      }
    });
    if (typeof config?.grid === 'boolean') grid.checked = config.grid;
  }

  function publish() {
    sliders.forEach(input => {
      const unit = input.id === 'arrow-count' ? '' : ' m';
      input.labels[0].querySelector('output').value = input.value + unit;
    });
    parent.postMessage({type:'module:peer', payload:{
      type:'arrow:config', config:currentConfig(), editing:panel.open
    }}, '*');
  }

  function save() {
    try { localStorage.setItem(storageKey, JSON.stringify(currentConfig())); } catch {}
    publish();
  }

  try { restore(JSON.parse(localStorage.getItem(storageKey))); } catch {}
  panel.addEventListener('input', save);
  panel.addEventListener('toggle', publish);
  document.getElementById('preview-arrows').addEventListener('click', publish);
  window.addEventListener('message', event => {
    if (event.source !== parent) return;
    const data = event.data;
    if (data?.type === 'arrow:ready') {
      document.getElementById('camera-angle').textContent = data.cameraAngle;
      publish();
    }
    if (data?.type === 'arrow:set-config') {
      restore(data.config);
      save();
    }
  });
  publish();
  parent.postMessage({type:'module:peer', payload:{type:'arrow:panel-ready'}}, '*');
}());
