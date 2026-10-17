import * as THREE from 'three';
import {batchStatic} from './batch.js';
const chrome=new THREE.MeshStandardMaterial({color:0xaab2b3,metalness:.95,roughness:.22});
const rubber=new THREE.MeshStandardMaterial({color:0x151819,roughness:.94});
const carbon=new THREE.MeshStandardMaterial({color:0x141a1d,metalness:.45,roughness:.46});
const glass=new THREE.MeshPhysicalMaterial({color:0x142731,metalness:.35,roughness:.09,clearcoat:1,clearcoatRoughness:.05});
const white=new THREE.MeshPhysicalMaterial({color:0xcdd3d0,metalness:.72,roughness:.27,clearcoat:1,clearcoatRoughness:.15});
const red=new THREE.MeshStandardMaterial({color:0xfb3223,emissive:0xff1808,emissiveIntensity:2});
const led=new THREE.MeshStandardMaterial({color:0xffffff,emissive:0xd4f4ff,emissiveIntensity:2});
function mesh(geometry,material,parent,p=[0,0,0]){const m=new THREE.Mesh(geometry,material);m.position.set(...p);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
function box(parent,size,p,mat=carbon){return mesh(new THREE.BoxGeometry(...size),mat,parent,p);}
// Cross-section loft, +Z forward. Designed from visual proportions, not manufacturer CAD.
function loft(parent,sections,mat){
  const vertices=[],indices=[];
  for(const [z,w,y,h] of sections){for(const [x,yy] of [[-w*.83,y],[-w,y+.08],[-w*.98,h-.05],[-w*.7,h],[w*.7,h],[w*.98,h-.05],[w,y+.08],[w*.83,y]])vertices.push(x,yy,z);}
  for(let j=0;j<sections.length-1;j++)for(let k=0;k<8;k++){const a=j*8+k,b=j*8+(k+1)%8,c=b+8,d=a+8;indices.push(a,b,d,b,c,d);}
  for(let k=1;k<7;k++){indices.push(0,k+1,k);const n=(sections.length-1)*8;indices.push(n,n+k,n+k+1);}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));g.setIndex(indices);g.computeVertexNormals();const m=mesh(g,mat,parent);m.material.side=THREE.DoubleSide;return m;
}
export function createCar(){
  const root=new THREE.Group(),wheels=[],jets=[];const shell=new THREE.Group();root.add(shell);
  loft(shell,[[-2.25,.8,-.13,.27],[-2.12,.98,-.2,.49],[-1.6,1.025,-.2,.63],[-.9,.96,-.2,.59],[.3,.93,-.2,.45],[1.35,1.02,-.18,.48],[1.98,.94,-.12,.27],[2.25,.79,-.06,.17]],white);
  loft(shell,[[-1.05,.76,.47,.51],[-.55,.73,.46,.82],[.17,.68,.43,.85],[1.02,.76,.38,.44]],glass);
  // Roof rails and thin rear buttresses preserve the low, angular canopy silhouette.
  for(const s of [-1,1]){
    const rail=box(shell,[.055,.045,.82],[s*.69,.83,-.18],white);rail.rotation.y=s*.04;
    const sill=box(shell,[.07,.13,2.6],[s*.95,-.12,-.02],carbon);
    const shoulder=box(shell,[.09,.035,1.2],[s*.81,.66,-1.2],white);shoulder.rotation.x=-.19;
    box(shell,[.06,.1,.55],[s*.97,.21,-.3],carbon);
    box(shell,[.035,.025,.23],[s*.963,.43,-.45],chrome);
    const mirror=box(shell,[.21,.08,.3],[s*1.11,.62,.6],carbon);mirror.rotation.y=-s*.15;
    // Dark wheel arches overlaid on the body, segmented to follow each tire.
    for(const z of [-1.39,1.39]){
      const arch=mesh(new THREE.TorusGeometry(.414,.028,8,32,Math.PI),carbon,shell,[s*1.01,-.08,z]);arch.rotation.set(0,Math.PI/2,0);
    }
  }
  box(shell,[1.69,.025,.07],[0,.28,2.17],led);
  box(shell,[1.62,.035,.06],[0,.29,-2.28],red);
  box(shell,[1.87,.06,.18],[0,-.13,2.12],carbon);
  box(shell,[1.72,.29,.12],[0,-.045,-2.25],carbon);
  for(let i=-3;i<=3;i++)box(shell,[.035,.2,.43],[i*.23,-.13,-2.1],carbon);
  box(shell,[1.76,.065,.24],[0,.69,-1.96],carbon);
  for(const s of [-1,1])box(shell,[.045,.22,.08],[s*.69,.58,-1.96],carbon);
  // Turbine outlets on the rear deck.
  for(const s of [-1,1]){
    const fan=mesh(new THREE.CylinderGeometry(.23,.23,.025,32),carbon,shell,[s*.47,.61,-1.38]);
    for(let i=0;i<10;i++){const a=i*Math.PI/5,blade=box(shell,[.032,.015,.31],[s*.47+Math.sin(a)*.08,.629,-1.38+Math.cos(a)*.08],chrome);blade.rotation.y=a+.35;}
  }
  const emblem=box(shell,[.17,.006,.035],[0,.38,1.78],chrome);emblem.rotation.x=.1;
  box(shell,[.025,.008,.11],[0,.37,1.73],chrome);
  // License plaque with compact custom lettering.
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=128;const ctx=canvas.getContext('2d');ctx.fillStyle='#141c21';ctx.fillRect(0,0,512,128);ctx.fillStyle='#e0e8e3';ctx.font='500 48px sans-serif';ctx.textAlign='center';ctx.fillText('R O A D S T E R',256,81);const plaque=new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(canvas)});
  const plate=mesh(new THREE.PlaneGeometry(.61,.12),plaque,shell,[0,.02,-2.32]);plate.rotation.y=Math.PI;
  for(let i=0;i<4;i++){
    const wheel=new THREE.Group();
    const tire=mesh(new THREE.CylinderGeometry(.355,.355,.275,40),rubber,wheel);tire.rotation.z=Math.PI/2;
    for(const side of [-1,1]){
      const rim=mesh(new THREE.CylinderGeometry(.276,.276,.012,40),carbon,wheel,[side*.145,0,0]);rim.rotation.z=Math.PI/2;
      const brake=mesh(new THREE.CylinderGeometry(.226,.226,.018,40),chrome,wheel,[side*.15,0,0]);brake.rotation.z=Math.PI/2;
      const lip=mesh(new THREE.TorusGeometry(.273,.013,8,40),chrome,wheel,[side*.16,0,0]);lip.rotation.y=Math.PI/2;
      for(let k=0;k<10;k++){const a=k*Math.PI/5,spoke=box(wheel,[.027,.042,.24],[side*.175,Math.sin(a)*.135,Math.cos(a)*.135],carbon);spoke.rotation.x=-a+.17;}
      const hub=mesh(new THREE.CylinderGeometry(.055,.055,.022,16),chrome,wheel,[side*.185,0,0]);hub.rotation.z=Math.PI/2;
      box(wheel,[.025,.13,.065],[side*.16,.13,.11],new THREE.MeshStandardMaterial({color:0xd9422d,metalness:.4,roughness:.45}));
      for(let k=0;k<40;k++){const a=k*Math.PI/20;const tread=box(wheel,[.25,.006,.009],[0,Math.sin(a)*.355,Math.cos(a)*.355],carbon);tread.rotation.x=-a;}
    }
    wheels.push(wheel);
  }
  const nozzlePos=[[.65,-.2,-1.3],[-.65,-.2,-1.3],[.65,-.2,1.25],[-.65,-.2,1.25],[.67,.17,-2.18],[-.67,.17,-2.18],[1,.15,.8],[-1,.15,.8],[1,.15,-1],[-1,.15,-1]];
  nozzlePos.forEach((p,i)=>{
    const group=new THREE.Group();group.position.set(...p);if(i<4)group.rotation.x=Math.PI;else if(i<6)group.rotation.x=-Math.PI/2;else group.rotation.z=(p[0]>0?-1:1)*Math.PI/2;
    mesh(new THREE.CylinderGeometry(.07,.095,.085,16),chrome,group);mesh(new THREE.CylinderGeometry(.052,.06,.09,12),carbon,group);
    const plume=mesh(new THREE.ConeGeometry(.17,1.1,12,1,true),new THREE.MeshBasicMaterial({color:0xc7ecf1,transparent:true,opacity:.23,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending}),group,[0,.55,0]);plume.visible=false;plume.rotation.z=Math.PI;
    root.add(group);jets.push(plume);
  });
  batchStatic(shell);wheels.forEach(w=>batchStatic(w));
  return {root,shell,wheels,jets};
}
