import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { makeWorld,VehicleSimulation,ZONES } from './physics.js';
import { createCar } from './vehicle.js';
import { buildEnvironment } from './environment.js';
import {Vec3,RaycastResult} from 'cannon-es';
import {HDRLoader} from 'three/addons/loaders/HDRLoader.js';

const $=s=>document.querySelector(s),keys=new Set();
let renderer,composer,camera,scene,sim,car,environment,started=false,paused=false,cameraMode=0,quality='high',soundOn=false;
let toastTimer,orbitYaw=.65,orbitPitch=.18,dragging=false,lastX=0,lastY=0,lastFrame=performance.now(),accumulator=0,frameCount=0,fpsTime=0,renderTime=0,hudTime=0;
const lookAt=new THREE.Vector3(),cameraGoal=new THREE.Vector3(),target=new THREE.Vector3(),heading=new THREE.Vector3(0,0,1),worldUp=new THREE.Vector3(0,1,0);
const cameraRay=new RaycastResult(),rayFrom=new Vec3(),rayTo=new Vec3();
function toast(t){$('#toast').textContent=t;$('#toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('visible'),4800);}
window.addEventListener('error',e=>{if(!renderer){$('#error').hidden=false;$('#error').textContent='3D 화면을 시작하지 못했어요. 최신 Chrome 또는 Edge에서 하드웨어 가속을 켜고 다시 열어주세요. '+e.message;}});
init().catch(e=>{$('#loading').style.display='none';$('#error').hidden=false;$('#error').textContent='3D 초기화 오류: '+e.message;console.error(e);});
async function init(){
  renderer=new THREE.WebGLRenderer({canvas:$('#scene'),antialias:true,powerPreference:'high-performance'});renderer.setPixelRatio(Math.min(devicePixelRatio,1.75));renderer.setSize(innerWidth,innerHeight);renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=.75;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.info.autoReset=false;
  scene=new THREE.Scene();camera=new THREE.PerspectiveCamera(51,innerWidth/innerHeight,.25,4000);
  const loader=new THREE.TextureLoader();const [diffuse,normal,hdr]=await Promise.all([loader.loadAsync('/textures/asphalt-diffuse.jpg'),loader.loadAsync('/textures/asphalt-normal.jpg'),new HDRLoader().loadAsync('/textures/sky.hdr')]);
  const world=makeWorld();sim=new VehicleSimulation(world);environment=buildEnvironment(scene,world,{diffuse,normal});car=createCar();scene.add(car.root);car.wheels.forEach(w=>scene.add(w));
  const pmrem=new THREE.PMREMGenerator(renderer);hdr.mapping=THREE.EquirectangularReflectionMapping;const envMap=pmrem.fromEquirectangular(hdr);pmrem.dispose();scene.environment=envMap.texture;scene.background=hdr;environment.sky.visible=false;
  function updateEnvironment(){const night=$('#time').value==='night';scene.environmentIntensity=night?.13:.6;scene.backgroundIntensity=night?.07:.8;}
  updateEnvironment();
  const renderTarget=new THREE.WebGLRenderTarget(innerWidth,innerHeight,{type:THREE.HalfFloatType});renderTarget.samples=4;
  composer=new EffectComposer(renderer,renderTarget);composer.addPass(new RenderPass(scene,camera));const bloom=new UnrealBloomPass(new THREE.Vector2(innerWidth,innerHeight),.12,.4,1.9);composer.addPass(bloom);composer.addPass(new OutputPass());
  // Tire marks: one shared dynamic buffer, bounded memory, no unbounded mesh creation.
  const marks=new THREE.BufferGeometry(),markData=new Float32Array(9000*6);marks.setAttribute('position',new THREE.BufferAttribute(markData,3).setUsage(THREE.DynamicDrawUsage));marks.setDrawRange(0,0);const skid=new THREE.LineSegments(marks,new THREE.LineBasicMaterial({color:0x1b1e1e,transparent:true,opacity:.35}));scene.add(skid);let markIndex=0,lastMark=null;
  // Cold-gas mist is pooled and emitted from the actual chassis position.
  const particleCount=320,particleData=new Float32Array(particleCount*3),particles=[];
  for(let i=0;i<particleCount;i++){particleData[i*3+1]=-100;particles.push({life:0,velocity:new THREE.Vector3()});}
  const mistGeometry=new THREE.BufferGeometry();mistGeometry.setAttribute('position',new THREE.BufferAttribute(particleData,3));
  const mistTexture=(()=>{const c=document.createElement('canvas');c.width=c.height=64;const ct=c.getContext('2d'),g=ct.createRadialGradient(32,32,0,32,32,32);g.addColorStop(0,'rgba(235,248,255,.5)');g.addColorStop(1,'rgba(235,248,255,0)');ct.fillStyle=g;ct.fillRect(0,0,64,64);return new THREE.CanvasTexture(c);})();
  const mist=new THREE.Points(mistGeometry,new THREE.PointsMaterial({color:0xe1e9e8,size:1.5,map:mistTexture,transparent:true,opacity:.5,depthWrite:false}));mist.frustumCulled=false;scene.add(mist);let particleCursor=0;
  // Soft world-space contact shadow adds grounding without faking airborne contact.
  const shadowCanvas=document.createElement('canvas');shadowCanvas.width=shadowCanvas.height=128;const sctx=shadowCanvas.getContext('2d'),grad=sctx.createRadialGradient(64,64,5,64,64,64);grad.addColorStop(0,'rgba(0,0,0,.6)');grad.addColorStop(1,'rgba(0,0,0,0)');sctx.fillStyle=grad;sctx.fillRect(0,0,128,128);
  const contactShadow=new THREE.Mesh(new THREE.PlaneGeometry(5,7),new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(shadowCanvas),transparent:true,depthWrite:false}));contactShadow.rotation.x=-Math.PI/2;scene.add(contactShadow);
  const headlamps=[];for(const x of [-.65,.65]){const light=new THREE.SpotLight(0xd4e9ff,0,90,.35,.6,1.5);light.position.set(x,.25,2.2);light.target.position.set(x,-.8,25);car.root.add(light,light.target);headlamps.push(light);}
  setZone(0,false);for(let i=0;i<120;i++)sim.step(1/120,{});updateCar();updateCamera(1,true);
  $('#loading').style.opacity='0';setTimeout(()=>$('#loading').remove(),750);
  requestAnimationFrame(frame);
  function frame(now){
    requestAnimationFrame(frame);const dt=Math.min((now-lastFrame)/1000,.06);lastFrame=now;renderTime+=dt;
    const active=started&&!paused&&!document.querySelector('dialog[open]');
    if(active){accumulator+=dt;const input=readInput();while(accumulator>=1/120){sim.step(1/120,input);accumulator-=1/120;}updateMarks(input);}else accumulator=0;
    updateCar();updateCamera(dt);updateMist(dt,active);audio.update(sim,active);
    const pos=car.root.position,dir=scene.userData.sunDirection;environment.sun.position.copy(pos).addScaledVector(dir,250);environment.sun.target.position.copy(pos);environment.sun.target.updateMatrixWorld();
    contactShadow.position.set(pos.x,.082,pos.z);contactShadow.material.opacity=Math.max(0,.85-sim.altitude*.055);contactShadow.rotation.z=-new THREE.Euler().setFromQuaternion(car.root.quaternion,'YXZ').y;
    renderer.info.reset();composer.render();frameCount++;fpsTime+=dt;hudTime+=dt;if(hudTime>.08){updateHUD();hudTime=0;}if(fpsTime>1){$('#fps').textContent=`${Math.round(frameCount/fpsTime)} FPS`;frameCount=0;fpsTime=0;}
  }
  function updateCar(){
    car.root.position.copy(sim.body.position);car.root.quaternion.copy(sim.body.quaternion);
    for(let i=0;i<4;i++){sim.vehicle.updateWheelTransform(i);const t=sim.vehicle.wheelInfos[i].worldTransform;car.wheels[i].position.copy(t.position);car.wheels[i].quaternion.copy(t.quaternion);}
    car.jets.forEach((j,i)=>{j.visible=started&&!paused&&((sim.jet===2&&i<4)||(sim.jet===1&&i>=4&&i<6)||(sim.jet===3&&i>=6));j.scale.setScalar(.75+Math.random()*.35);});
  }
  function updateCamera(dt,snap=false){
    const pos=car.root.position,quat=car.root.quaternion;target.copy(pos).add(new THREE.Vector3(0,.35,0).applyQuaternion(quat));
    const forward=new THREE.Vector3(0,0,1).applyQuaternion(quat);if(Math.abs(forward.y)<.9){heading.set(forward.x,0,forward.z).normalize();}
    const yaw=Math.atan2(heading.x,heading.z),a=yaw+orbitYaw;
    if(cameraMode===1){cameraGoal.copy(pos).add(new THREE.Vector3(0,.7,1.5).applyQuaternion(quat));lookAt.copy(pos).addScaledVector(forward,25).add(new THREE.Vector3(0,.7,0));camera.up.copy(worldUp);camera.position.lerp(cameraGoal,snap?1:1-Math.exp(-dt*18));camera.lookAt(lookAt);}
    else{
      const distance=cameraMode===2?20:started?9+Math.min(sim.speed*.035,2.5):9.3;
      cameraGoal.set(target.x+Math.sin(a)*distance,target.y+(cameraMode===2?8:1.8)+orbitPitch*4,target.z-Math.cos(a)*distance);
      cameraGoal.y=Math.max(.65,cameraGoal.y);rayFrom.set(target.x,target.y,target.z);rayTo.set(cameraGoal.x,cameraGoal.y,cameraGoal.z);cameraRay.reset();
      if(sim.world.raycastClosest(rayFrom,rayTo,{collisionFilterMask:1,skipBackfaces:false},cameraRay)){const direction=cameraGoal.clone().sub(target).normalize();cameraGoal.copy(target).addScaledVector(direction,Math.max(.6,cameraRay.distance-.4));}
      camera.position.lerp(cameraGoal,snap?1:1-Math.exp(-dt*(cameraMode===2?5:6)));lookAt.lerp(target,snap?1:1-Math.exp(-dt*8));camera.up.copy(worldUp);camera.lookAt(lookAt);
    }
    const desired=51+Math.min(sim.speed*.12,11);camera.fov+=(desired-camera.fov)*Math.min(1,dt*3);camera.updateProjectionMatrix();
  }
  function updateMarks(input){
    if(sim.grounded>=2&&(input.handbrake||Math.abs(sim.steer)>.15&&sim.speed>17)){
      const p=new THREE.Vector3().copy(sim.body.position);p.y=.085;
      if(lastMark&&p.distanceTo(lastMark)<5&&p.y<.2&&sim.altitude<.6){for(const side of [-1,1]){const offset=new THREE.Vector3(side*.83,0,0).applyQuaternion(car.root.quaternion);const a=lastMark.clone().add(offset),b=p.clone().add(offset);markData.set([a.x,a.y,a.z,b.x,b.y,b.z],markIndex*6);markIndex=(markIndex+1)%9000;}marks.attributes.position.needsUpdate=true;marks.setDrawRange(0,Math.min(18000,marks.drawRange.count+4));}lastMark=p;
    }else lastMark=null;
  }
  function updateMist(dt,active){
    if(active&&sim.jet){for(let n=0;n<4;n++){const i=particleCursor++%particleCount,p=particles[i],direction=sim.jet===2?new THREE.Vector3(0,-1,0):new THREE.Vector3(0,0,-1);direction.applyQuaternion(car.root.quaternion);const origin=car.root.position.clone().addScaledVector(direction,1);particleData.set([origin.x+(Math.random()-.5),origin.y,origin.z],i*3);p.velocity.copy(direction).multiplyScalar(8).add(new THREE.Vector3(sim.body.velocity.x*.4,sim.body.velocity.y*.4,sim.body.velocity.z*.4));p.life=.8;}}
    for(let i=0;i<particleCount;i++){const p=particles[i];if(p.life>0){p.life-=dt;particleData[i*3]+=p.velocity.x*dt;particleData[i*3+1]+=p.velocity.y*dt;particleData[i*3+2]+=p.velocity.z*dt;if(p.life<=0)particleData[i*3+1]=-100;}}mistGeometry.attributes.position.needsUpdate=true;
  }
  $('#time').addEventListener('change',e=>{environment.setTime(e.target.value);updateEnvironment();headlamps.forEach(l=>l.intensity=e.target.value==='night'?180:0);});
  $('#quality').addEventListener('change',e=>{quality=e.target.value;renderer.setPixelRatio(Math.min(devicePixelRatio,quality==='high'?1.75:quality==='medium'?1.1:.75));renderer.shadowMap.enabled=quality!=='low';bloom.enabled=quality==='high';resize();});
  function resize(){renderer.setSize(innerWidth,innerHeight);composer.setPixelRatio(renderer.getPixelRatio());composer.setSize(innerWidth,innerHeight);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();}window.addEventListener('resize',resize);
  // Explicit diagnostics for reproducible QA, no controls or mutation exposed in production.
  window.roadsterDiagnostics=()=>({position:[...sim.body.position.toArray()],speed:sim.speed,gas:sim.gas,grounded:sim.grounded,zone:sim.zone,started,paused,drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles});
}
function readInput(){return {forward:keys.has('KeyW')||keys.has('ArrowUp'),back:keys.has('KeyS')||keys.has('ArrowDown'),left:keys.has('KeyA')||keys.has('ArrowLeft'),right:keys.has('KeyD')||keys.has('ArrowRight'),boost:keys.has('ShiftLeft')||keys.has('ShiftRight'),lift:keys.has('Space'),rollLeft:keys.has('KeyQ'),rollRight:keys.has('KeyE'),pitchUp:keys.has('KeyI'),pitchDown:keys.has('KeyK'),handbrake:keys.has('KeyB')};}
function setZone(index,notify=true){sim.reset(index);document.querySelectorAll('[data-zone]').forEach(b=>b.classList.toggle('active',Number(b.dataset.zone)===index));$('#zone-title').innerHTML=`${ZONES[index].name}<small>흡착 ${sim.fan?'ON':'OFF'} · 추진기 대기</small>`;$('#world-label small').textContent=`TEST COMPLEX / 0${index+1}`;if(notify)toast(ZONES[index].tip);orbitYaw=.45;orbitPitch=.14;}
function updateHUD(){
  const speed=sim.body.velocity.length()*3.6;$('#speed').textContent=String(Math.round(speed)).padStart(3,'0');$('#speed-bar').style.width=`${Math.min(100,speed/3.8)}%`;$('#gear').textContent=speed<1?'P':sim.body.velocity.dot(sim.body.quaternion.vmult({x:0,y:0,z:1}))<-.5?'R':'D';$('#altitude').textContent=sim.altitude.toFixed(1);$('#gforce').textContent=sim.gForce.toFixed(1);$('#contact').textContent=sim.grounded?'GROUNDED':'AIRBORNE';$('#contact').style.color=sim.grounded?'#cddcc3':'#ff9c76';$('#fan-status').textContent=sim.fan?'ACTIVE':'OFF';$('#fan-status').style.color=sim.fan?'#cddcc3':'#ff9c76';$('#gas').textContent=sim.infinite?'∞':Math.round(sim.gas*100);$('#gas-bar').style.width=`${sim.infinite?100:sim.gas*100}%`;$('#accel').textContent=sim.runTime!==null?`${sim.runTime.toFixed(2)} s`:sim.runStart!==null?`${(sim.elapsed-sim.runStart).toFixed(2)} s`:'—.— s';
}
function start(){started=true;paused=false;document.body.classList.add('driving');$('#start').innerHTML='일시정지 <span>Ⅱ</span>';orbitYaw=0;toast(ZONES[sim.zone].tip);audio.init();}
function togglePause(){if(!started){start();return;}paused=!paused;keys.clear();$('#start').innerHTML=paused?'계속 주행 <span>↗</span>':'일시정지 <span>Ⅱ</span>';document.body.classList.toggle('driving',!paused);toast(paused?'일시정지 · Esc로 계속 주행':'주행을 계속해요.');}
function openDialog(id){keys.clear();$(id).showModal();}document.querySelectorAll('dialog .close').forEach(b=>b.addEventListener('click',()=>b.closest('dialog').close()));
$('#help').onclick=()=>openDialog('#help-dialog');$('#settings').onclick=()=>openDialog('#settings-dialog');$('.close-help').onclick=()=>{$('#help-dialog').close();start();};$('#start').onclick=togglePause;
document.querySelectorAll('[data-zone]').forEach(b=>b.onclick=()=>setZone(Number(b.dataset.zone)));
$('#suction').oninput=e=>{sim.suction=Number(e.target.value);$('#suction-value').textContent=`${sim.suction.toFixed(1)} × 중량`;};$('#thrust').oninput=e=>{sim.lift=Number(e.target.value);$('#thrust-value').textContent=`${sim.lift.toFixed(1)} × 중량`;};$('#infinite').onchange=e=>sim.infinite=e.target.checked;
window.addEventListener('keydown',e=>{
  if(!sim)return;
  if(document.querySelector('dialog[open]'))return;if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Tab'].includes(e.code)&&e.code!=='Tab')e.preventDefault();if(e.repeat)return;keys.add(e.code);
  if(e.code==='Escape')togglePause();if(e.code==='KeyH')openDialog('#help-dialog');if(e.code==='KeyM')toggleSound();
  if(/^Digit[1-5]$/.test(e.code))setZone(Number(e.code.slice(-1))-1);
  if(e.code==='KeyR'){setZone(sim.zone);toast('시작 위치 복귀 · 가스 충전 완료');}
  if(e.code==='KeyC'){cameraMode=(cameraMode+1)%3;toast(['추적 카메라','범퍼 카메라','오비트 카메라'][cameraMode]);}
  if(e.code==='KeyF'){sim.fan=!sim.fan;toast(`흡착 팬 ${sim.fan?'ON':'OFF'}`);}
  if(e.code==='KeyT'){sim.stabilize=!sim.stabilize;toast(`공중 자세 안정화 ${sim.stabilize?'ON':'OFF'}`);}
  if(!started&&['KeyW','ArrowUp'].includes(e.code))start();
});window.addEventListener('keyup',e=>keys.delete(e.code));
window.addEventListener('blur',()=>{keys.clear();if(started&&!paused)togglePause();});document.addEventListener('visibilitychange',()=>{if(document.hidden){keys.clear();if(started&&!paused)togglePause();}});
$('#scene').addEventListener('pointerdown',e=>{dragging=true;lastX=e.clientX;lastY=e.clientY;$('#scene').setPointerCapture(e.pointerId);});$('#scene').addEventListener('pointermove',e=>{if(dragging){orbitYaw-=(e.clientX-lastX)*.006;orbitPitch=THREE.MathUtils.clamp(orbitPitch+(e.clientY-lastY)*.005,-.25,1.2);lastX=e.clientX;lastY=e.clientY;}});$('#scene').addEventListener('pointerup',()=>dragging=false);$('#scene').addEventListener('pointercancel',()=>dragging=false);
document.querySelectorAll('[data-key]').forEach(b=>{b.addEventListener('pointerdown',e=>{e.preventDefault();b.setPointerCapture(e.pointerId);if(!started)start();keys.add(b.dataset.key);});for(const type of ['pointerup','pointercancel','lostpointercapture'])b.addEventListener(type,()=>keys.delete(b.dataset.key));});
let audioContext,osc,gain,wind,windGain;
const audio={init(){if(audioContext||!soundOn)return;audioContext=new AudioContext();osc=audioContext.createOscillator();gain=audioContext.createGain();osc.type='sine';gain.gain.value=0;osc.connect(gain).connect(audioContext.destination);osc.start();const buffer=audioContext.createBuffer(1,audioContext.sampleRate*2,audioContext.sampleRate),d=buffer.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1;wind=audioContext.createBufferSource();wind.buffer=buffer;wind.loop=true;const filter=audioContext.createBiquadFilter();filter.type='lowpass';filter.frequency.value=650;windGain=audioContext.createGain();windGain.gain.value=0;wind.connect(filter).connect(windGain).connect(audioContext.destination);wind.start();},update(s,active){if(!audioContext)return;const t=audioContext.currentTime,on=soundOn&&active;osc.frequency.setTargetAtTime(90+s.speed*6,t,.12);gain.gain.setTargetAtTime(on?.013+Math.min(s.speed*.0003,.035):0,t,.1);windGain.gain.setTargetAtTime(on?Math.min(s.speed*.0008,.1)+(s.jet?.09:0):0,t,.1);}};
function toggleSound(){soundOn=!soundOn;audio.init();if(audioContext?.state==='suspended')audioContext.resume();$('#sound').textContent=soundOn?'SOUND ON':'SOUND OFF';}$('#sound').onclick=toggleSound;
