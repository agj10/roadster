import * as THREE from 'three';
import {EffectComposer} from 'three/addons/postprocessing/EffectComposer.js';
import {RenderPass} from 'three/addons/postprocessing/RenderPass.js';
import {UnrealBloomPass} from 'three/addons/postprocessing/UnrealBloomPass.js';
import {OutputPass} from 'three/addons/postprocessing/OutputPass.js';
import {HDRLoader} from 'three/addons/loaders/HDRLoader.js';
import {makeWorld,VehicleSimulation,ZONES} from './physics.js';
import {createCar} from './vehicle.js';
import {buildEnvironment} from './environment.js';
import {DrivingCamera} from './camera.js';
import {ColdGas} from './gas.js';
import {VEHICLE} from './vehicle-config.js';

const $=s=>document.querySelector(s),keys=new Set(),fixedStep=1/120;
let renderer,composer,camera,scene,sim,car,environment,rig,gas,started=false,paused=false,soundOn=false,ready=false;
let accumulator=0,lastFrame=performance.now(),toastTimer,controlsTimer,previous,current,statsTime=0;
const axisY=new THREE.Vector3(0,1,0),axisAxle=new THREE.Vector3(-1,0,0);
function toast(text){$('#toast').textContent=text;$('#toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('visible'),3300);}
function snapshot(){return {position:new THREE.Vector3().copy(sim.body.position),quaternion:new THREE.Quaternion().copy(sim.body.quaternion),wheels:sim.vehicle.wheelInfos.map(w=>({length:w.suspensionLength,rotation:w.rotation,steer:w.steering}))};}
function resetSnapshots(){current=snapshot();previous=snapshot();accumulator=0;}
function start(){if(!ready)return;started=true;paused=false;$('#start').textContent='일시정지';$('#scene').focus({preventScroll:true});audio.init();clearTimeout(controlsTimer);controlsTimer=setTimeout(()=>document.body.classList.add('driving'),7000);}
function pause(){if(!started){start();return;}paused=!paused;keys.clear();$('#start').textContent=paused?'계속 주행':'일시정지';if(paused)document.body.classList.remove('driving');else document.body.classList.add('driving');}
function selectZone(index,notify=true){
  if(!sim)return;sim.reset(index);for(let i=0;i<110;i++)sim.step(fixedStep,{});
  resetSnapshots();rig.reset(sim.body.position,ZONES[index].yaw);document.querySelectorAll('[data-zone]').forEach(button=>button.classList.toggle('active',Number(button.dataset.zone)===index));$('#zone-title').textContent=ZONES[index].title;
  if(notify)toast(ZONES[index].tip);
}
function renderVehicle(alpha){
  car.root.position.lerpVectors(previous.position,current.position,alpha);car.root.quaternion.slerpQuaternions(previous.quaternion,current.quaternion,alpha);
  sim.vehicle.wheelInfos.forEach((info,i)=>{
    const a=previous.wheels[i],b=current.wheels[i],length=THREE.MathUtils.lerp(a.length,b.length,alpha),rotation=THREE.MathUtils.lerp(a.rotation,b.rotation,alpha),steering=THREE.MathUtils.lerp(a.steer,b.steer,alpha);
    const local=new THREE.Vector3(info.chassisConnectionPointLocal.x,-length,info.chassisConnectionPointLocal.z);
    const wheel=car.wheels[i];wheel.position.copy(local).applyQuaternion(car.root.quaternion).add(car.root.position);
    const steeringQuaternion=new THREE.Quaternion().setFromAxisAngle(axisY,steering),spin=new THREE.Quaternion().setFromAxisAngle(axisAxle,rotation);
    wheel.quaternion.copy(car.root.quaternion).multiply(steeringQuaternion).multiply(spin);
    car.calipers[i].position.copy(wheel.position);car.calipers[i].quaternion.copy(car.root.quaternion).multiply(steeringQuaternion);
  });
}
function readInput(){return {forward:keys.has('KeyW')||keys.has('ArrowUp'),back:keys.has('KeyS')||keys.has('ArrowDown'),left:keys.has('KeyA')||keys.has('ArrowLeft'),right:keys.has('KeyD')||keys.has('ArrowRight'),boost:keys.has('ShiftLeft')||keys.has('ShiftRight'),lift:keys.has('Space'),rollLeft:keys.has('KeyQ'),rollRight:keys.has('KeyE'),pitchUp:keys.has('KeyI'),pitchDown:keys.has('KeyK'),handbrake:keys.has('KeyB')};}
function hud(){
  const forward=new THREE.Vector3(0,0,1).applyQuaternion(car.root.quaternion),velocity=new THREE.Vector3().copy(sim.body.velocity),signed=forward.dot(velocity),speed=velocity.length()*3.6;
  $('#speed').textContent=Math.round(speed);$('#gear').textContent=speed<.9?'P':signed<-.5?'R':'D';
  $('#fan-status').textContent=sim.fan?'흡착 ON':'흡착 OFF';$('#fan-status').classList.toggle('off',!sim.fan);
  $('#assist-status').textContent=sim.stabilize?'자세 보조 ON':'자세 보조 OFF';$('#assist-status').classList.toggle('off',!sim.stabilize);
  $('#flight-status').hidden=sim.grounded>0||sim.altitude<.9;$('#altitude').textContent=sim.altitude.toFixed(1);
}
async function init(){
  renderer=new THREE.WebGLRenderer({canvas:$('#scene'),antialias:true,powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.6));renderer.setSize(innerWidth,innerHeight);renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=.83;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.info.autoReset=false;
  scene=new THREE.Scene();camera=new THREE.PerspectiveCamera(67,innerWidth/innerHeight,.18,4000);camera.layers.enable(1);
  const loader=new THREE.TextureLoader(),[diffuse,normal,hdr]=await Promise.all([loader.loadAsync('/textures/asphalt-diffuse.jpg'),loader.loadAsync('/textures/asphalt-normal.jpg'),new HDRLoader().loadAsync('/textures/sky.hdr')]);
  const world=makeWorld();sim=new VehicleSimulation(world);environment=buildEnvironment(scene,world,{diffuse,normal});car=createCar();scene.add(car.root,...car.wheels,...car.calipers);rig=new DrivingCamera(camera,world);rig.bind($('#scene'));gas=new ColdGas(scene,world);
  const pmrem=new THREE.PMREMGenerator(renderer);hdr.mapping=THREE.EquirectangularReflectionMapping;const envMap=pmrem.fromEquirectangular(hdr);pmrem.dispose();scene.environment=envMap.texture;scene.background=hdr;scene.environmentIntensity=.75;scene.backgroundIntensity=.8;environment.sky.visible=false;
  const target=new THREE.WebGLRenderTarget(innerWidth,innerHeight,{type:THREE.HalfFloatType});target.samples=4;composer=new EffectComposer(renderer,target);composer.addPass(new RenderPass(scene,camera));const bloom=new UnrealBloomPass(new THREE.Vector2(innerWidth,innerHeight),.09,.35,2.1);composer.addPass(bloom);composer.addPass(new OutputPass());
  const lights=[];for(const x of [-.65,.65]){const light=new THREE.SpotLight(0xd8ebff,0,85,.38,.7,1.5);light.position.set(x,.15,2.34);light.target.position.set(x,-.9,27);car.root.add(light,light.target);lights.push(light);}
  // Small, bounded skidmark pool; marks use real wheel contact points.
  const markGeometry=new THREE.BufferGeometry(),markBuffer=new Float32Array(6000*6);markGeometry.setAttribute('position',new THREE.BufferAttribute(markBuffer,3).setUsage(THREE.DynamicDrawUsage));markGeometry.setDrawRange(0,0);const marks=new THREE.LineSegments(markGeometry,new THREE.LineBasicMaterial({color:0x171a1b,transparent:true,opacity:.4}));marks.frustumCulled=false;scene.add(marks);let markIndex=0,markCount=0,lastContact=[null,null];
  function skidmarks(input){for(let i=2;i<4;i++){const wheel=sim.vehicle.wheelInfos[i],index=i-2;if(wheel.isInContact&&(input.handbrake||wheel.skidInfo<.7&&sim.speed>13)){const p=new THREE.Vector3().copy(wheel.raycastResult.hitPointWorld).addScaledVector(new THREE.Vector3().copy(wheel.raycastResult.hitNormalWorld),.012),last=lastContact[index];if(last&&last.distanceTo(p)<3){markBuffer.set([last.x,last.y,last.z,p.x,p.y,p.z],markIndex*6);markIndex=(markIndex+1)%6000;markCount=Math.min(6000,markCount+1);markGeometry.setDrawRange(0,markCount*2);markGeometry.attributes.position.needsUpdate=true;}lastContact[index]=p;}else lastContact[index]=null;}}
  selectZone(0,false);renderVehicle(1);rig.update(1,car.root,{snap:true,grounded:true});ready=true;
  $('#loading').style.opacity='0';setTimeout(()=>$('#loading').remove(),550);lastFrame=performance.now();
  function frame(now){
    requestAnimationFrame(frame);const dt=Math.min((now-lastFrame)/1000,.05);lastFrame=now;
    const active=started&&!paused&&!document.querySelector('dialog[open]'),input=readInput();
    if(active){accumulator+=dt;while(accumulator>=fixedStep){previous=current;sim.step(fixedStep,input);current=snapshot();accumulator-=fixedStep;}skidmarks(input);}else{accumulator=0;previous=current;}
    renderVehicle(active?accumulator/fixedStep:1);rig.update(dt,car.root,{moving:active&&sim.speed>2,grounded:sim.grounded>1,speed:sim.speed,velocity:sim.body.velocity});gas.update(dt,sim,car.root,camera,active);audio.update(sim,active);
    environment.sun.position.copy(car.root.position).addScaledVector(scene.userData.sunDirection,250);environment.sun.target.position.copy(car.root.position);environment.sun.target.updateMatrixWorld();
    renderer.info.reset();gas.renderDepth(renderer,scene,camera);composer.render();statsTime+=dt;if(statsTime>.1){hud();statsTime=0;}
  }
  requestAnimationFrame(frame);
  function resize(){renderer.setSize(innerWidth,innerHeight);composer.setPixelRatio(renderer.getPixelRatio());composer.setSize(innerWidth,innerHeight);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();}
  window.addEventListener('resize',resize);
  $('#quality').addEventListener('change',event=>{const q=event.target.value;renderer.setPixelRatio(Math.min(devicePixelRatio,q==='high'?1.6:q==='medium'?1:.75));renderer.shadowMap.enabled=q!=='low';bloom.enabled=q==='high';gas.enabled=q!=='low';resize();});
  $('#time').addEventListener('change',event=>{const night=event.target.value==='night';environment.setTime(event.target.value);scene.environmentIntensity=night?.18:.75;scene.backgroundIntensity=night?.07:.8;lights.forEach(light=>light.intensity=night?180:0);gas.material.uniforms.uTint.value.setRGB(night?.55:.94,night?.64:.96,night?.75:.98);});
  window.roadsterDiagnostics=()=>({
    position:sim.body.position.toArray(),speed:sim.body.velocity.length(),grounded:sim.vehicle.wheelInfos.filter(w=>w.isInContact).length,zone:sim.zone,zoneCount:ZONES.length,started,paused,gas:sim.gas,infinite:sim.infinite,steer:sim.steer,
    camera:rig.diagnostics(),particleCount:gas.aliveCount||0,drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,
    wheels:car.wheels.map((w,i)=>({position:w.position.toArray(),radius:VEHICLE.wheelRadius,inContact:sim.vehicle.wheelInfos[i].isInContact})),
  });
}
init().catch(error=>{console.error(error);$('#loading').style.display='none';$('#error').hidden=false;$('#error').textContent='3D 화면을 시작하지 못했어요. Chrome 또는 Edge의 하드웨어 가속을 확인해 주세요. '+error.message;});

function openDialog(id){if(!ready)return;keys.clear();rig.cancelDrag();$(id).showModal();}
document.querySelectorAll('dialog .close').forEach(button=>button.addEventListener('click',()=>button.closest('dialog').close()));
$('#locations').onclick=()=>openDialog('#locations-dialog');$('#help').onclick=()=>openDialog('#help-dialog');$('#settings').onclick=()=>openDialog('#settings-dialog');$('#start').onclick=()=>{pause();$('#scene').focus({preventScroll:true});};
document.querySelectorAll('[data-zone]').forEach(button=>button.onclick=()=>{selectZone(Number(button.dataset.zone));$('#locations-dialog').close();$('#scene').focus({preventScroll:true});});
$('#suction').oninput=event=>{sim.suction=Number(event.target.value);$('#suction-value').textContent=sim.suction.toFixed(1)+' × 중량';};
$('#thrust').oninput=event=>{sim.lift=Number(event.target.value);$('#thrust-value').textContent=sim.lift.toFixed(1)+' × 중량';};
$('#sensitivity').oninput=event=>{rig.sensitivity=Number(event.target.value);$('#sensitivity-value').textContent=rig.sensitivity.toFixed(1);};
$('#follow').onchange=event=>rig.follow=event.target.checked;$('#assist').onchange=event=>sim.stabilize=event.target.checked;
$('#fullscreen').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{toast('이 브라우저 창에서는 전체 화면을 사용할 수 없어요.');}};
$('#scene').addEventListener('dblclick',()=>{if(ready){rig.recenter();toast('카메라를 차량 뒤로 정렬해요.');}});
window.addEventListener('keydown',event=>{
  if(!ready||document.querySelector('dialog[open]'))return;
  if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Tab','End'].includes(event.code))event.preventDefault();
  if(event.repeat)return;keys.add(event.code);
  if(event.code==='Escape')pause();if(event.code==='KeyH')openDialog('#help-dialog');if(event.code==='Tab')openDialog('#locations-dialog');
  if(event.code==='KeyU')document.body.classList.toggle('ui-hidden');
  if(event.code==='KeyM')toggleSound();
  if(/^Digit[1-9]$/.test(event.code))selectZone(Number(event.code.slice(-1))-1);
  if(event.code==='KeyR'){selectZone(sim.zone,false);toast('시작 위치로 돌아왔어요.');}
  if(event.code==='KeyC'){rig.mode=(rig.mode+1)%3;rig.idle=0;toast(['추적 시점 · 휠로 거리 조절','범퍼 시점','자유 궤도 · 자동 정렬 없음'][rig.mode]);}
  if(event.code==='End')rig.recenter();
  if(event.code==='KeyF'){sim.fan=!sim.fan;toast('흡착 '+(sim.fan?'ON':'OFF'));}
  if(event.code==='KeyT'){sim.stabilize=!sim.stabilize;$('#assist').checked=sim.stabilize;toast('공중 자세 보조 '+(sim.stabilize?'ON':'OFF'));}
  if(!started&&['KeyW','ArrowUp','Space'].includes(event.code))start();
});
window.addEventListener('keyup',event=>keys.delete(event.code));
function clearInput(){keys.clear();rig?.cancelDrag();if(started&&!paused)pause();}
window.addEventListener('blur',clearInput);document.addEventListener('visibilitychange',()=>{if(document.hidden)clearInput();});
document.querySelectorAll('[data-key]').forEach(button=>{
  button.addEventListener('pointerdown',event=>{event.preventDefault();if(!ready)return;button.setPointerCapture(event.pointerId);if(!started)start();keys.add(button.dataset.key);});
  for(const type of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(type,()=>keys.delete(button.dataset.key));
});
let audioContext,osc,gain,wind,windGain;
const audio={
  init(){if(audioContext||!soundOn)return;audioContext=new AudioContext();osc=audioContext.createOscillator();gain=audioContext.createGain();osc.type='sine';gain.gain.value=0;osc.connect(gain).connect(audioContext.destination);osc.start();const buffer=audioContext.createBuffer(1,audioContext.sampleRate*2,audioContext.sampleRate),data=buffer.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=Math.random()*2-1;wind=audioContext.createBufferSource();wind.buffer=buffer;wind.loop=true;const filter=audioContext.createBiquadFilter();filter.type='lowpass';filter.frequency.value=900;windGain=audioContext.createGain();windGain.gain.value=0;wind.connect(filter).connect(windGain).connect(audioContext.destination);wind.start();},
  update(s,active){if(!audioContext)return;const t=audioContext.currentTime,on=soundOn&&active;osc.frequency.setTargetAtTime(85+s.speed*5,t,.1);gain.gain.setTargetAtTime(on?.008+Math.min(s.speed*.0002,.025):0,t,.1);windGain.gain.setTargetAtTime(on?Math.min(s.speed*.0007,.09)+(s.jet?.075:0):0,t,.1);}
};
function toggleSound(){soundOn=!soundOn;audio.init();if(audioContext?.state==='suspended')audioContext.resume();$('#sound').checked=soundOn;}
$('#sound').onchange=toggleSound;
