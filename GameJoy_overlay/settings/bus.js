(function () {
  const listeners = new Set();
  let channel;
  try {
    channel = new BroadcastChannel('gamejoy:hud');
    channel.addEventListener('message', event => {
      for (const listener of listeners) listener(event.data, event);
    });
  } catch {}

  window.GameJoyBus = {
    post(data) {
      try { channel?.postMessage(data); } catch {}
    },
    on(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }
  };
}());
