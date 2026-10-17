import * as THREE from 'three';
import {batchStatic} from './batch.js';
import {VEHICLE,NOZZLES} from './vehicle-config.js';

const paint=new THREE.MeshPhysicalMaterial({color:0xe3e6e2,metalness:.38,roughness:.24,clearcoat:1,clearcoatRoughness:.12});
const carbon=new THREE.MeshStandardMaterial({color:0x12171b,roughness:.43,metalness:.36});
const seam=new THREE.MeshStandardMaterial({color:0x1b2327,roughness:.7});
const alloy=new THREE.MeshStandardMaterial({color:0x9aa5a9,roughness:.25,metalness:.94});
const rotorMaterial=new THREE.MeshStandardMaterial({color:0x667078,roughness:.58,metalness:.85});
const glass=new THREE.MeshPhysicalMaterial({color:0x0a1821,metalness:.12,roughness:.08,clearcoat:1,clearcoatRoughness:.06});
const headlight=new THREE.MeshStandardMaterial({color:0xd8eeff,emissive:0xc1e4ff,emissiveIntensity:2.4});
const taillight=new THREE.MeshStandardMaterial({color:0xa60807,emissive:0xff1609,emissiveIntensity:1.7});
const redCaliper=new THREE.MeshStandardMaterial({color:0xbc3021,roughness:.4,metalness:.55});
const profile=[[-2.325,.83,.24],[-2.05,1.005,.43],[-1.39,1.025,.475],[-.72,.957,.425],[0,.948,.39],[.76,.985,.36],[1.39,1.025,.405],[1.98,.94,.255],[2.325,.79,.14]];
const times=new Float32Array(profile.map(p=>p[0]));
const widthAt=new THREE.CubicInterpolant(times,new Float32Array(profile.map(p=>p[1])),1);
const deckAt=new THREE.CubicInterpolant(times,new Float32Array(profile.map(p=>p[2])),1);
const width=z=>widthAt.evaluate(z)[0],deck=z=>deckAt.evaluate(z)[0];
function mesh(parent,geometry,material,position=[0,0,0]){const m=new THREE.Mesh(geometry,material);m.position.set(...position);m.castShadow=m.receiveShadow=true;parent.add(m);return m;}
function box(parent,size,position,material=carbon){return mesh(parent,new THREE.BoxGeometry(...size),material,position);}
function tube(parent,points,radius,material=seam){return mesh(parent,new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p))),Math.max(16,points.length*8),radius,6,false),material);}
function patch(parent,nu,nv,fn,material,reverse=false){
  const vertices=[],uv=[],indices=[];
  for(let i=0;i<=nu;i++)for(let j=0;j<=nv;j++){vertices.push(...fn(i/nu,j/nv));uv.push(i/nu,j/nv);}
  for(let i=0;i<nu;i++)for(let j=0;j<nv;j++){const a=i*(nv+1)+j,b=a+nv+1;indices.push(...(reverse?[a,a+1,b,a+1,b+1,b]:[a,b,a+1,a+1,b,b+1]));}
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.setIndex(indices);geometry.computeVertexNormals();return mesh(parent,geometry,material);
}
function archBottom(z){let result=-.23;for(const axle of [-VEHICLE.wheelbase/2,VEHICLE.wheelbase/2]){const dz=z-axle;if(Math.abs(dz)<.435)result=Math.max(result,VEHICLE.archCenterY+Math.sqrt(.435**2-dz**2));}return result;}
function sideX(z,y){const bottom=archBottom(z),v=THREE.MathUtils.clamp((y-bottom)/(deck(z)-bottom),0,1);return width(z)*(THREE.MathUtils.lerp(bottom>-.2?1:.945,.945,v)+.04*Math.sin(v*Math.PI));}
function tireMaterial(){
  const c=document.createElement('canvas');c.width=512;c.height=128;const ctx=c.getContext('2d');ctx.fillStyle='#9b9b9b';ctx.fillRect(0,0,512,128);ctx.strokeStyle='#383838';ctx.lineWidth=3;
  for(const y of [28,45,83,100]){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(512,y);ctx.stroke();}
  ctx.lineWidth=2;for(let x=-20;x<530;x+=18){for(const y of [18,51,86]){ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+10,y+23);ctx.stroke();}}
  const bump=new THREE.CanvasTexture(c);bump.wrapS=bump.wrapT=THREE.RepeatWrapping;bump.repeat.set(4,1);bump.anisotropy=8;
  return new THREE.MeshStandardMaterial({color:0x17191a,roughness:.94,bumpMap:bump,bumpScale:.004});
}
function createWheel(side){
  const wheel=new THREE.Group(),radius=VEHICLE.wheelRadius;
  const cross=[new THREE.Vector2(.265,-.13),new THREE.Vector2(.3,-.15),new THREE.Vector2(.339,-.138),new THREE.Vector2(radius,-.105),new THREE.Vector2(radius,.105),new THREE.Vector2(.339,.138),new THREE.Vector2(.3,.15),new THREE.Vector2(.265,.13)];
  const tire=mesh(wheel,new THREE.LatheGeometry(cross,64),tireMaterial());tire.rotation.z=Math.PI/2;
  const inside=mesh(wheel,new THREE.CylinderGeometry(.267,.267,.25,48,1,true),carbon);inside.rotation.z=Math.PI/2;
  const rotor=mesh(wheel,new THREE.CylinderGeometry(.232,.232,.016,64),rotorMaterial,[side*.112,0,0]);rotor.rotation.z=Math.PI/2;
  for(let k=0;k<32;k++){const a=k*Math.PI/16;for(const r of [.172,.209]){const hole=mesh(wheel,new THREE.CircleGeometry(.006,5),seam,[side*.122,Math.cos(a)*r,Math.sin(a)*r]);hole.rotation.y=side*Math.PI/2;}}
  const rim=mesh(wheel,new THREE.TorusGeometry(.267,.012,8,64),alloy,[side*.148,0,0]);rim.rotation.y=Math.PI/2;
  const innerLip=mesh(wheel,new THREE.TorusGeometry(.25,.007,6,64),carbon,[side*.151,0,0]);innerLip.rotation.y=Math.PI/2;
  for(let i=0;i<5;i++)for(const fork of [-1,1]){const a=i*Math.PI/2.5,points=[];for(let j=0;j<=5;j++){const t=j/5,r=.054+.205*t,angle=a+.19*t+fork*.065*t;points.push([side*(.16+.012*Math.sin(t*Math.PI)),Math.cos(angle)*r,Math.sin(angle)*r]);}tube(wheel,points,.012,alloy);}
  const hub=mesh(wheel,new THREE.CylinderGeometry(.053,.053,.024,24),carbon,[side*.165,0,0]);hub.rotation.z=Math.PI/2;
  for(let i=0;i<5;i++){const a=i*Math.PI/2.5,bolt=mesh(wheel,new THREE.CylinderGeometry(.006,.006,.006,6),alloy,[side*.18,Math.cos(a)*.034,Math.sin(a)*.034]);bolt.rotation.z=Math.PI/2;}
  batchStatic(wheel);
  const caliper=new THREE.Group();const c=box(caliper,[.06,.145,.065],[side*.126,.13,-.13],redCaliper);c.rotation.x=.3;
  return {wheel,caliper};
}

export function createCar(){
  const root=new THREE.Group(),shell=new THREE.Group();root.add(shell);
  // Curved body panels have true wheel openings in the shared chassis coordinates.
  patch(shell,180,28,(u,v)=>{const z=-2.325+u*4.65,t=v*2-1,w=width(z)*.945,hoodDish=.065*Math.exp(-(((z-1.15)/.85)**2));return [t*w,deck(z)+.025*(1-t*t)-hoodDish*(1-t*t),z];},paint);
  for(const side of [-1,1]){
    patch(shell,240,10,(u,v)=>{const z=-2.325+u*4.65,bottom=archBottom(z),y=THREE.MathUtils.lerp(bottom,deck(z),v);return [side*sideX(z,y),y,z];},paint,side>0);
    for(const axle of [-1.39,1.39]){
      const points=[];for(let i=0;i<=40;i++){const a=Math.PI*i/40,z=axle+Math.cos(a)*.435;points.push([side*(width(z)+.001),VEHICLE.archCenterY+Math.sin(a)*.435,z]);}tube(shell,points,.008,paint);
      patch(shell,48,4,(u,v)=>{const a=Math.PI*u,z=axle+Math.cos(a)*.429;return [side*(width(z)-v*.18),VEHICLE.archCenterY+Math.sin(a)*.429,z];},carbon,side<0);
    }
    box(shell,[.055,.065,1.72],[side*.924,-.205,0],carbon);
    const door=[[-.62,.39],[-.69,.15],[-.65,-.13],[.56,-.13],[.71,.21],[.66,.36]].map(([z,y])=>[side*(sideX(z,y)+.002),y,z]);tube(shell,door,.0035,seam);
    box(shell,[.015,.018,.135],[side*(sideX(-.35,.345)+.005),.345,-.35],carbon);
    const intake=box(shell,[.019,.085,.26],[side*(sideX(-.78,.045)+.001),.045,-.78],carbon);intake.rotation.x=-.18;
    tube(shell,[[side*.56,.47,.53],[side*.96,.46,.57],[side*1.08,.47,.57]],.018,carbon);
    const mirror=mesh(shell,new THREE.SphereGeometry(1,18,10),paint,[side*1.115,.48,.57]);mirror.scale.set(.12,.043,.105);
  }
  for(const end of [-1,1])patch(shell,16,6,(u,v)=>{const bottom=end>0?-.2:-.21,y=THREE.MathUtils.lerp(bottom,deck(end*2.325),v),x=(u*2-1)*sideX(end*2.325,y);return [x,y,end*2.325];},paint,end<0);
  box(shell,[1.69,.045,.2],[0,-.2,2.25],carbon);
  box(shell,[1.44,.055,.018],[0,-.08,2.339],carbon);
  tube(shell,[[-.76,.132,2.333],[-.35,.135,2.338],[.35,.135,2.338],[.76,.132,2.333]],.009,headlight);
  box(shell,[1.7,.16,.075],[0,-.135,-2.34],carbon);
  for(let i=-3;i<=3;i++){const fin=box(shell,[.015,.105,.31],[i*.225,-.185,-2.22],carbon);fin.rotation.x=-.08;}
  tube(shell,[[-.805,.216,-2.334],[-.4,.22,-2.343],[.4,.22,-2.343],[.805,.216,-2.334]],.009,taillight);
  function canopy(u,v){const z=-.99+u*1.92,t=Math.PI*v,w=.665-.065*Math.sin(u*Math.PI),base=deck(z)+.006,h=.37*Math.sin(Math.PI*u)**.72;return [Math.cos(t)*w,base+Math.sin(t)*h,z];}
  patch(shell,54,32,canopy,glass,true);
  for(const side of [0,1]){const p=[];for(let i=0;i<=28;i++)p.push(canopy(i/28,side===0?.12:.88));tube(shell,p,.017,paint);}
  for(const u of [.14,.67]){const p=[];for(let i=0;i<=24;i++)p.push(canopy(u,.12+i/24*.76));tube(shell,p,.011,carbon);}
  for(const side of [-1,1]){
    const x=side*.39,z=-1.45,y=deck(z)+.007;
    mesh(shell,new THREE.CylinderGeometry(.158,.158,.014,40),carbon,[x,y,z]);
    for(let i=0;i<9;i++){const a=i*Math.PI/4.5,blade=box(shell,[.017,.007,.11],[x+Math.sin(a)*.075,y+.011,z+Math.cos(a)*.075],rotorMaterial);blade.rotation.y=a+.3;}
    const ring=mesh(shell,new THREE.TorusGeometry(.161,.009,6,40),alloy,[x,y+.009,z]);ring.rotation.x=Math.PI/2;
    const strut=box(shell,[.027,.16,.075],[side*.62,deck(-1.98)+.08,-1.98],carbon);strut.rotation.x=-.12;
  }
  const wing=mesh(shell,new THREE.CapsuleGeometry(.045,1.65,4,16),carbon,[0,deck(-1.98)+.17,-1.98]);wing.rotation.z=Math.PI/2;wing.scale.set(1,1,2);
  const label=document.createElement('canvas');label.width=512;label.height=64;const ctx=label.getContext('2d');ctx.clearRect(0,0,512,64);ctx.fillStyle='#d1d6d4';ctx.textAlign='center';ctx.font='500 30px sans-serif';ctx.fillText('R O A D S T E R',256,41);
  const badge=mesh(shell,new THREE.PlaneGeometry(.44,.055),new THREE.MeshStandardMaterial({map:new THREE.CanvasTexture(label),transparent:true,roughness:.5}),[0,.053,-2.345]);badge.rotation.y=Math.PI;
  const wheels=[],calipers=[];for(let i=0;i<4;i++){const result=createWheel(i%2===0?-1:1);wheels.push(result.wheel);calipers.push(result.caliper);}
  const nozzleGroups=[];
  for(const definition of NOZZLES){const group=new THREE.Group();group.position.set(...definition.position);group.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),new THREE.Vector3(...definition.direction));root.add(group);const nozzle=mesh(group,new THREE.CylinderGeometry(.049,.074,.055,24,1,true),alloy,[0,.012,0]);nozzle.material=alloy.clone();nozzle.material.side=THREE.DoubleSide;const throat=mesh(group,new THREE.CircleGeometry(.04,24),carbon,[0,.033,0]);throat.rotation.x=-Math.PI/2;nozzleGroups.push(group);}
  box(shell,[1.47,.022,3.6],[0,-.24,0],carbon);
  batchStatic(shell);root.name='Roadster body';
  return {root,shell,wheels,calipers,nozzleGroups};
}
