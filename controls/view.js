(function () {
  const part=new URLSearchParams(location.search).get('part');
  const stick=document.querySelector('.stick');
  const actions=document.querySelector('.actions');
  stick.hidden=part!=='stick';
  actions.hidden=part!=='actions';
  // The hidden part is removed so it cannot cover the active controls.
  if(part==='stick') actions.remove();
  else stick.remove();
  function send(type,detail){
    const message={type,...detail};
    parent.postMessage(message,'*');
    window.GameJoyBus?.post(message);
  }
  if(part==='stick'){
    const thumb=document.getElementById('thumb');
    function move(x,y){
      const limit=Math.max(1,Math.hypot(x,y));x/=limit;y/=limit;
      thumb.style.transition='transform 85ms ease-out';
      thumb.style.transform=`translate(${x*75}%,${y*75}%)`;
      send('controls:move',{x,y});
    }
    function release(){
      thumb.style.transition='transform 520ms cubic-bezier(.25,0,.2,1)';
      thumb.style.transform='translate(0,0)';
      send('controls:move',{x:0,y:0});
    }
    function drag(event){
      if(!stick.hasPointerCapture(event.pointerId))return;
      const rect=stick.getBoundingClientRect();
      move((event.clientX-rect.left-rect.width/2)/(rect.width*.375),(event.clientY-rect.top-rect.height/2)/(rect.height*.375));
    }
    stick.onpointerdown=event=>{stick.setPointerCapture(event.pointerId);drag(event);};
    stick.onpointermove=drag;
    stick.onlostpointercapture=release;
    const keys={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]};
    stick.onkeydown=event=>{if(keys[event.key]){event.preventDefault();move(...keys[event.key]);}};
    stick.onkeyup=event=>{if(keys[event.key])release();};
    stick.onblur=release;
  } else {
    actions.onclick=event=>{
      const button=event.target.closest('button');
      if(button)send('controls:action',{action:button.dataset.key});
    };
    function style(data){
      if(data?.type!=='controls:style')return;
      const {enabled,hue}=data;
      actions.classList.toggle('custom-color',Boolean(enabled));
      actions.style.setProperty('--button-accent',`hsl(${Number(hue)||0} 95% 70%)`);
    }
    window.addEventListener('message',event=>{if(event.source===parent)style(event.data);});
    window.GameJoyBus?.on(style);
    window.GameJoyBus?.on(data => {
      if (data?.type !== 'controls:remote-action') return;
      const button = actions.querySelector(`[data-key="${data.action}"]`);
      if (button) {
        button.classList.toggle('remote-pressed', data.pressed === true);
        button.style.filter = data.pressed === true ? 'brightness(1.8)' : '';
        button.style.outline = data.pressed === true ? '3px solid white' : '';
        button.style.transform = data.pressed === true ? 'scale(1.08)' : '';
      }
    });
    send('controls:ready',{});
  }
  document.addEventListener('keydown',event=>{
    const key=event.key.toLowerCase();
    if(key==='b'&&!event.repeat&&!event.altKey&&!event.ctrlKey&&!event.metaKey){
      event.preventDefault();send('controls:shortcut',{key});
    }
  });
}());
