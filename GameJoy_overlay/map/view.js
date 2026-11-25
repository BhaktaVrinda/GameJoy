(function(){
  const iframe=document.querySelector('iframe');
  const dot=document.querySelector('.map-location-dot');
  let center=[40.416775,-3.70379],zoom=16;
  iframe.addEventListener('load',()=>document.body.classList.add('google-ready'));
  function update(data){
    const angle=data.angle*Math.PI/180;
    const radius=data.distance/2;
    dot.style.left=(50+Math.sin(angle)*radius)+'%';
    dot.style.top=(50-Math.cos(angle)*radius)+'%';
    const changed=zoom!==data.zoom || center[0]!==data.lat || center[1]!==data.lng || data.refresh;
    center=[data.lat,data.lng];zoom=data.zoom;
    if(changed){
      document.body.classList.remove('google-ready');
      const query=new URLSearchParams({ll:center.join(','),z:String(zoom),output:'embed'});
      iframe.src='https://www.google.com/maps?'+query;
    }
  }
  function receive(data){
    if(data?.type==='map:config') update(data.config);
    if(data?.type==='map:shortcut' && data.key==='m') {
      parent.postMessage(data,'*');
      window.GameJoyBus?.post(data);
    }
  }
  window.addEventListener('message',event=>{
    if(event.source===parent) receive(event.data);
  });
  window.GameJoyBus?.on(receive);
  const ready={type:'map:ready'};
  parent.postMessage(ready,'*');
  window.GameJoyBus?.post(ready);
  document.addEventListener('keydown',event=>{
    if(event.key.toLowerCase()==='m'&&!event.repeat&&!event.altKey&&!event.ctrlKey&&!event.metaKey&&
       !event.target.closest('input,textarea,select,[contenteditable]')) receive({type:'map:shortcut',key:'m'});
  });
}());
