(function(){
  const maps=document.querySelector('.map-google');
  const placeholder=maps?.querySelector('iframe');
  const dot=document.querySelector('.map-location-dot');
  if(!maps||!dot)return;

  // Misma estrategia que el mapa original: no se recarga por cada lectura
  // del GPS. Solo se centra al superar el umbral y como máximo cada 5 s.
  const recenterDistanceMeters=14;
  const minMapReloadIntervalMs=5000;
  let center=null;
  let zoom=21;
  let current=null;
  let loading=null;
  let loadTimeout=null;
  let retryTimer=null;
  let queuedPoint=null;
  let lastMapRequestAt=0;

  function distanceMeters(a,b){
    const north=(b.lat-a.lat)*111320;
    const east=(b.lng-a.lng)*111320*Math.cos(b.lat*Math.PI/180);
    return Math.hypot(north,east);
  }

  function scheduleMapUpdate(delay){
    if(retryTimer!==null)return;
    retryTimer=setTimeout(()=>{
      retryTimer=null;
      const point=queuedPoint;
      queuedPoint=null;
      if(point)showPosition(point);
    },Math.max(0,delay));
  }

  function requestGoogleMap(point){
    const frame=document.createElement('iframe');
    frame.title='Ubicación en Google Maps';
    frame.referrerPolicy='strict-origin';
    frame.style.visibility='hidden';
    frame._gamejoyPoint=point;
    loading=frame;
    lastMapRequestAt=Date.now();
    if(placeholder?.isConnected)placeholder.remove();
    const url=new URL('https://maps.google.com/maps');
    url.search=new URLSearchParams({
      ll:point.lat+','+point.lng,
      z:String(point.zoom),
      t:'m',
      hl:'es',
      output:'embed'
    });
    frame.onload=()=>{
      if(loading!==frame)return;
      clearTimeout(loadTimeout);
      frame.style.visibility='visible';
      current?.remove();
      current=frame;
      center=frame._gamejoyPoint;
      loading=null;
      document.body.classList.add('google-ready');
      if(queuedPoint&&distanceMeters(center,queuedPoint)>=recenterDistanceMeters){
        scheduleMapUpdate(minMapReloadIntervalMs-(Date.now()-lastMapRequestAt));
      }else queuedPoint=null;
    };
    frame.onerror=()=>{
      if(loading!==frame)return;
      clearTimeout(loadTimeout);
      loading=null;
      frame.remove();
    };
    loadTimeout=setTimeout(()=>{
      if(loading!==frame)return;
      loading=null;
      frame.onload=null;
      frame.onerror=null;
      frame.remove();
    },12000);
    maps.appendChild(frame);
  }

  function showPosition(point,force=false){
    if(force){
      queuedPoint=null;
      if(retryTimer!==null){clearTimeout(retryTimer);retryTimer=null;}
      if(loading){clearTimeout(loadTimeout);loading.remove();loading=null;}
      zoom=point.zoom;
      requestGoogleMap(point);
      return;
    }
    if(loading){queuedPoint=point;return;}
    if(current&&center&&distanceMeters(center,point)<recenterDistanceMeters&&point.zoom===zoom)return;
    const remaining=minMapReloadIntervalMs-(Date.now()-lastMapRequestAt);
    if(lastMapRequestAt&&remaining>0){
      queuedPoint=point;
      scheduleMapUpdate(remaining);
      return;
    }
    zoom=point.zoom;
    requestGoogleMap(point);
  }

  function update(data){
    if(!Number.isFinite(data?.lat)||!Number.isFinite(data?.lng))return;
    const angle=(Number.isFinite(data.angle)?data.angle:0)*Math.PI/180;
    const radius=(Number.isFinite(data.distance)?data.distance:0)/2;
    dot.style.left=(50+Math.sin(angle)*radius)+'%';
    dot.style.top=(50-Math.cos(angle)*radius)+'%';
    const point={lat:data.lat,lng:data.lng,zoom:Number.isFinite(data.zoom)?data.zoom:zoom};
    if(data.refresh){
      queuedPoint=null;
      if(loading){loading.remove();loading=null;}
      showPosition(point,true);
      return;
    }
    showPosition(point);
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
