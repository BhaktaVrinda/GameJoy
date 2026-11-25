const arrow=document.querySelector('#direction-arrow');
const steeringLine=arrow.querySelector('#steering-line');
const chevronGroup=arrow.querySelector('#steering-arrows');
let arrowCount=6, side=50, depth=50, height=0;
let previewActive=false;
let targetX=0, targetY=0;
function applyConfig(data){
  arrowCount=data.count;
  side=data.side;
  depth=data.depth;
  height=data.height;
  if(chevronGroup.childElementCount!==arrowCount){
    chevronGroup.replaceChildren();
    for(let i=0;i<arrowCount;i++){
      const path=document.createElementNS('http://www.w3.org/2000/svg','path');
      path.setAttribute('d','M-78 29 0 -15 78 29 78 57 0 17 -78 57Z');
      chevronGroup.appendChild(path);
    }
  }
  arrow.style.translate=`${(side-50)*2}cqw ${(depth-50)*0.9-height*1.8}cqw`;
  steerArrow(visualX);
}
const directions=['em frente','frente à direita','direita','atrás à direita','atrás','atrás à esquerda','esquerda','frente à esquerda'];
const renderSteeringScene=window.createSteeringScene?.(document.querySelector('#steering-scene'));
const svgBody=arrow.querySelector('svg');
let heading=0, targetHeading=0;
function angleDifference(to,from){
  return Math.atan2(Math.sin(to-from),Math.cos(to-from));
}
const fadeDuration=200;
const fades=[];
let fadeFrame=0;
function steerArrow(x){
  cancelAnimationFrame(fadeFrame);
  const baseControlX=95-46*x;
  const visibleCount=previewActive
    ? arrowCount
    : Math.round(Math.min(1,Math.hypot(targetX,targetY))*arrowCount);
  const now=performance.now();
  fades.length=arrowCount;
  const opacities=Array.from({length:arrowCount},(_,i)=>{
    const fade=fades[i] ??= {from:0,to:0,start:now};
    const t=Math.min(1,(now-fade.start)/fadeDuration);
    const opacity=fade.from+(fade.to-fade.from)*t*t*(3-2*t);
    const goal=Number(i<visibleCount);
    if(goal!==fade.to){
      fade.from=opacity;
      fade.to=goal;
      fade.start=now;
    }
    return opacity;
  });
  if(opacities.some((opacity,i)=>opacity!==fades[i].to)){
    fadeFrame=requestAnimationFrame(()=>steerArrow(visualX));
  }
  const extent=opacities.reduce((sum,opacity)=>sum+opacity,0)/arrowCount;
  renderSteeringScene?.(baseControlX,heading,opacities,extent,side,depth,height);
  svgBody.style.transformOrigin='50% 92.5%';
  svgBody.style.transform=`rotate(${heading}rad)`;
  steeringLine.setAttribute('d',`M95 185 C${baseControlX} 127 95 60 95 25`);
  const length=steeringLine.getTotalLength();
  steeringLine.style.strokeDasharray=`${length*extent} ${length+1}`;
  steeringLine.style.opacity=opacities[0];
  const tip=arrow.querySelector('#steering-tip');
  const end=steeringLine.getPointAtLength(length*extent);
  tip.style.opacity=opacities[0];
  tip.setAttribute('transform',`translate(${end.x} ${end.y})`);
  const scale=Math.min(0.82,length/(78*arrowCount));
  Array.from(chevronGroup.children).forEach((chevron,index)=>{
    chevron.style.opacity=opacities[index];
    if(!opacities[index]) return;
    const distance=length*(index+0.75)/(arrowCount+0.5);
    const point=steeringLine.getPointAtLength(distance);
    const before=steeringLine.getPointAtLength(distance-1);
    const after=steeringLine.getPointAtLength(distance+1);
    const rotation=Math.atan2(after.x-before.x,before.y-after.y)*180/Math.PI;
    chevron.setAttribute('transform',`translate(${point.x} ${point.y}) rotate(${rotation}) scale(${scale})`);
  });
  const sector=((Math.round(heading/(Math.PI/4))%8)+8)%8;
  arrow.setAttribute('aria-label','Direção: '+directions[sector]);
}
const returnDuration=520;
const steeringResponseMs=85;
let returnFrame=0;
let steeringFrame=0, previousFrameTime=0;
let visualX=0, visualY=0;
function drawStick(x,y){
  visualX=x;
  visualY=y;
  steerArrow(x);
}
function followStick(now){
  const elapsed=Math.max(0,now-previousFrameTime);
  previousFrameTime=now;
  const blend=1-Math.exp(-elapsed/steeringResponseMs);
  const x=visualX+(targetX-visualX)*blend;
  const y=visualY+(targetY-visualY)*blend;
  const turn=targetHeading-heading;
  heading+=turn*blend;
  if(Math.hypot(targetX-x,targetY-y)<0.002 && Math.abs(turn)<0.002){
    heading=targetHeading;
    drawStick(targetX,targetY);
    steeringFrame=0;
    return;
  }
  drawStick(x,y);
  steeringFrame=requestAnimationFrame(followStick);
}
function move(x,y){
  previewActive=false;
  if (x===0 && y===0) {
    releaseStick();
    return;
  }
  cancelAnimationFrame(returnFrame);
  returnFrame=0;
  const limit=Math.max(1,Math.hypot(x,y));
  x/=limit;
  y/=limit;
  targetX=x;
  targetY=y;
  const direction=Math.hypot(x,y)>0.04 ? Math.atan2(x,-y) : 0;
  targetHeading=heading+angleDifference(direction,heading);
  if(!steeringFrame && (targetX!==visualX || targetY!==visualY || targetHeading!==heading)){
    previousFrameTime=performance.now();
    steeringFrame=requestAnimationFrame(followStick);
  }
}
function releaseStick(){
  previewActive=false;
  cancelAnimationFrame(steeringFrame);
  steeringFrame=0;
  targetX=0;
  targetY=0;
  steerArrow(visualX);
  if(returnFrame) return;
  const startHeading=angleDifference(heading,0);
  if(!visualX && !visualY && !startHeading) return;
  const startX=visualX, startY=visualY;
  const start=performance.now();
  function settle(now){
    const t=Math.min(1,Math.max(0,(now-start)/returnDuration));
    const remaining=1-t*t*(3-2*t);
    heading=startHeading*remaining;
    drawStick(startX*remaining,startY*remaining);
    returnFrame=t<1 ? requestAnimationFrame(settle) : 0;
  }
  returnFrame=requestAnimationFrame(settle);
}

function announceReady() {
  const cameraAngle = document.querySelector('#camera-angle').textContent;
  parent.postMessage({type:'module:peer', payload:{type:'arrow:ready', cameraAngle}}, '*');
}
window.addEventListener('message', event => {
  if (event.source !== parent) return;
  const data = event.data;
  if (data?.type === 'arrow:config') {
    const editing = data.editing === true;
    document.getElementById('show-grid').checked = editing && data.config.grid;
    previewActive = editing && targetX === 0 && targetY === 0;
    applyConfig(data.config);
  }
  if (data?.type === 'arrow:panel-ready') announceReady();
  if (data?.type === 'arrow:move') move(data.x, data.y);
  if (data?.type === 'arrow:release') releaseStick();
});
window.GameJoyBus?.on(data => {
  if (data?.type !== 'controls:move') return;
  move(data.x, data.y);
});
document.addEventListener('keydown', event => {
  if (event.key.toLowerCase() === 'f' && !event.repeat && !event.altKey && !event.ctrlKey && !event.metaKey) {
    parent.postMessage({type:'module:peer', payload:{type:'settings:toggle'}}, '*');
  }
});
applyConfig({count:arrowCount, side, depth, height});
announceReady();
