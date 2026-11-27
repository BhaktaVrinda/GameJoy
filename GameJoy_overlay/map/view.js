(function(){
  const iframe=document.querySelector('.map-google iframe');
  const dot=document.querySelector('.map-location-dot');
  const directionBeam=document.getElementById('map-direction-beam');
  if(!iframe||!dot)return;

  let center=null;
  let zoom=21;
  let heading=null;

  iframe.addEventListener('load',()=>{
    if(iframe.getAttribute('src')) document.body.classList.add('google-ready');
  });

  function update(data){
    if(!Number.isFinite(data?.lat)||!Number.isFinite(data?.lng))return;
    const angle=(Number.isFinite(data.angle)?data.angle:0)*Math.PI/180;
    const radius=(Number.isFinite(data.distance)?data.distance:0)/2;
    dot.style.left=(50+Math.sin(angle)*radius)+'%';
    dot.style.top=(50-Math.cos(angle)*radius)+'%';

    heading=Number.isFinite(data.heading) ? ((data.heading % 360) + 360) % 360 : null;
    if(directionBeam){
      directionBeam.style.display=heading===null?'none':'block';
      if(heading!==null) directionBeam.setAttribute('transform','rotate('+heading+' 100 100)');
    }

    const nextZoom=Number.isFinite(data.zoom)?data.zoom:zoom;
    const changed=!center || zoom!==nextZoom || center[0]!==data.lat || center[1]!==data.lng || data.refresh;
    center=[data.lat,data.lng];
    zoom=nextZoom;
    if(changed){
      document.body.classList.remove('google-ready');
      const query=new URLSearchParams({ll:center.join(','),z:String(zoom),output:'embed'});
      iframe.src='https://www.google.com/maps?'+query;
    }
  }

  function receive(data){
    if(data?.type==='map:config')update(data.config||{});
    if(data?.type==='map:shortcut'&&data.key==='m'){
      parent.postMessage(data,'*');
      window.GameJoyBus?.post(data);
    }
  }

  window.addEventListener('message',event=>{
    if(event.source===parent)receive(event.data);
  });
  window.GameJoyBus?.on(receive);
  const ready={type:'map:ready'};
  parent.postMessage(ready,'*');
  window.GameJoyBus?.post(ready);
  document.addEventListener('keydown',event=>{
    if(event.key.toLowerCase()==='m'&&!event.repeat&&!event.altKey&&!event.ctrlKey&&!event.metaKey&&
       !event.target.closest('input,textarea,select,[contenteditable]'))receive({type:'map:shortcut',key:'m'});
  });
}());
