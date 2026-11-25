// Forward a message only to the peer declared by the enclosing page.
// Both frames can use postMessage even when opened from the filesystem.
window.addEventListener('message', event => {
  if (event.data?.type !== 'module:peer') return;
  const frames = document.querySelectorAll('iframe[data-peer]');
  const sender = Array.from(frames).find(frame => frame.contentWindow === event.source);
  if (!sender) return;
  const peer = document.getElementById(sender.dataset.peer);
  if (peer?.dataset.peer === sender.id) {
    peer.contentWindow.postMessage(event.data.payload, '*');
  }
});
