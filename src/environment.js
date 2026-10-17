import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { addBox,addCurvePhysics,curvePoint,addHeightfield,addWedge,wedgeData,ROAD_Y,heightfieldRenderIndices } from './physics.js';
import {batchStatic} from './batch.js';

function random(seed){let x=seed;return()=>{x=(x*1664525+1013904223)>>>0;return x/4294967296;};}
const rng=random(9241);
function texture(type){
  const c=document.createElement('canvas');c.width=c.height=512;const ctx=c.getContext('2d');const img=ctx.createImageData(512,512);
  for(let i=0;i<img.data.length;i+=4){const n=rng(),v=type==='asphalt'?49+n*27:140+n*42;img.data[i]=v;img.data[i+1]=type==='sand'?v*.91:v;img.data[i+2]=type==='sand'?v*.73:v;img.data[i+3]=255;}
  ctx.putImageData(img,0,0);
  if(type==='asphalt'){ctx.strokeStyle='#a1a19818';ctx.lineWidth=.6;for(let i=0;i<35;i++){ctx.beginPath();let x=rng()*512,y=rng()*512;ctx.moveTo(x,y);for(let k=0;k<7;k++){x+=rng()*50-25;y+=rng()*40;ctx.lineTo(x,y);}ctx.stroke();}}
  const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(type==='sand'?180:2,type==='sand'?180:2);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=8;return t;
}
function makeMaterial(color,roughness=.85,metalness=0){return new THREE.MeshStandardMaterial({color,roughness,metalness});}
export function buildEnvironment(scene,world,assets){
  const asphaltTex=assets.diffuse;asphaltTex.wrapS=asphaltTex.wrapT=THREE.RepeatWrapping;asphaltTex.repeat.set(2,2);asphaltTex.colorSpace=THREE.SRGBColorSpace;asphaltTex.anisotropy=8;
  const asphaltNormal=assets.normal;asphaltNormal.wrapS=asphaltNormal.wrapT=THREE.RepeatWrapping;asphaltNormal.repeat.set(2,2);asphaltNormal.anisotropy=8;
  const asphalt=new THREE.MeshStandardMaterial({map:asphaltTex,normalMap:asphaltNormal,normalScale:new THREE.Vector2(.5,.5),color:0x999999,roughness:.94,metalness:.02});
  const trackMaterial=asphalt.clone();trackMaterial.map=asphaltTex.clone();trackMaterial.map.repeat.set(1,1);trackMaterial.normalMap=asphaltNormal.clone();trackMaterial.normalMap.repeat.set(1,1);
  const concrete=makeMaterial(0xa6a498),dark=makeMaterial(0x252c2e),paint=makeMaterial(0xe1dfcd),orange=makeMaterial(0xe76639),steel=makeMaterial(0x677478,.5,.7),yellow=makeMaterial(0xf0bc5c);
  function box(size,pos,mat=concrete,rot=[0,0,0],collide=false){const m=new THREE.Mesh(new THREE.BoxGeometry(...size),mat);m.position.set(...pos);m.rotation.set(...rot);m.castShadow=true;m.receiveShadow=true;scene.add(m);if(collide)addBox(world,size,pos,rot);return m;}
  function road(x,z,w,l){const m=box([w,.16,l],[x,ROAD_Y-.08,z],asphalt,[0,0,0],true);const tex=asphaltTex.clone();tex.repeat.set(w/5,l/5);m.material=asphalt.clone();m.material.map=tex;m.material.normalMap=asphaltNormal.clone();m.material.normalMap.repeat.copy(tex.repeat);return m;}
  function wedge(x,z,width,length,h0,h1){
    const data=wedgeData(width,length,ROAD_Y+h0,ROAD_Y+h1),vertices=[],uv=[],groups=[];
    data.faces.forEach((face,i)=>{const start=vertices.length/3;for(let j=1;j<face.length-1;j++)for(const k of [0,j,j+1]){const p=data.vertices[face[k]];vertices.push(...p);uv.push((p[0]+width/2)/4,(p[2]+length/2)/4);}groups.push({start,count:vertices.length/3-start,materialIndex:i===1?0:1});});
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.computeVertexNormals();groups.forEach(g=>geometry.addGroup(g.start,g.count,g.materialIndex));
    const ramp=new THREE.Mesh(geometry,[trackMaterial,concrete]);ramp.position.set(x,0,z);ramp.castShadow=ramp.receiveShadow=true;scene.add(ramp);addWedge(world,data,x,z);
    const angle=Math.atan2(h1-h0,length),slopeLength=Math.hypot(length,h1-h0);
    for(const side of [-1,1])box([.12,.012,slopeLength],[x+side*(width/2-.25),ROAD_Y+(h0+h1)/2+.012,z],yellow,[-angle,0,0]);
  }
  const terrain=new THREE.Mesh(new THREE.PlaneGeometry(3200,3200),new THREE.MeshStandardMaterial({map:texture('sand'),roughness:1}));terrain.rotation.x=-Math.PI/2;terrain.position.y=-.04;terrain.receiveShadow=true;scene.add(terrain);
  road(0,0,100,150);road(-65,0,18,180);road(75,15,18,230);road(0,175,18,140);road(155,145,22,710);road(40,-100,240,18);road(40,300,240,18);
  // Pad grid and subtle expansion seams.
  for(let x=-40;x<=40;x+=10)box([.025,.008,145],[x,.067,-1],concrete);
  for(let z=-70;z<=70;z+=10)box([98,.008,.025],[0,.068,z],concrete);
  for(let z=-190;z<490;z+=12)box([.17,.008,5],[155,.067,z],paint);
  for(const x of [145,165])box([.14,.008,700],[x,.07,145],paint);
  for(const x of [-72.2,-57.8,67.8,82.2,-7.2,7.2])box([.12,.008,130],[x,.07,x>40?0:0],paint);
  for(let z=-140;z<=440;z+=50){box([22,.01,.25],[155,.075,z],paint);sign(`${z+180} m`,[171,1.15,z],2,.6,-Math.PI/2);box([.06,1.45,.06],[171,.725,z],steel);}
  function sign(text,pos,w=8,h=2,rot=0,color='#e4e9dc',background='#1c282d'){
    const c=document.createElement('canvas');c.width=1024;c.height=256;const ct=c.getContext('2d');ct.fillStyle=background;ct.fillRect(0,0,1024,256);ct.fillStyle='#ff713e';ct.fillRect(0,0,14,256);ct.font='600 60px sans-serif';ct.fillStyle=color;ct.textAlign='center';ct.textBaseline='middle';ct.fillText(text,512,132,950);
    const m=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshStandardMaterial({map:new THREE.CanvasTexture(c),roughness:.9,side:THREE.DoubleSide}));m.position.set(...pos);m.rotation.y=rot;scene.add(m);return m;
  }
  function curve(config){
    addCurvePhysics(world,config);
    const {x,z,radius,angle=Math.PI,width=14}=config;const n=220,verts=[],uv=[],idx=[];
    for(let i=0;i<=n;i++){const t=angle*i/n,p=curvePoint(radius,t,z);for(const s of [-1,1]){verts.push(x+s*width/2,p.y+ROAD_Y+p.normalY*.002,p.z+p.normalZ*.002);uv.push(s<0?0:width/4,t*radius/4);}}
    for(let i=0;i<n;i++){const a=i*2;idx.push(a,a+2,a+1,a+1,a+2,a+3);}
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(verts,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(idx);g.computeVertexNormals();const mat=asphalt.clone();mat.map=asphaltTex.clone();mat.map.repeat.set(1,1);mat.normalMap=asphaltNormal.clone();mat.normalMap.repeat.set(1,1);mat.side=THREE.DoubleSide;const m=new THREE.Mesh(g,mat);m.receiveShadow=true;m.castShadow=true;scene.add(m);
    for(const s of [-1,1]){
      const points=[],edge=[];for(let i=0;i<=n;i++){const t=angle*i/n,p=curvePoint(radius,t,z);points.push(new THREE.Vector3(x+s*(width/2+.12),p.y+ROAD_Y-p.normalY*.13,p.z-p.normalZ*.13));edge.push(new THREE.Vector3(x+s*(width/2-.35),p.y+ROAD_Y+p.normalY*.014,p.z+p.normalZ*.014));}
      const rail=new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),n,.18,6,false),steel);rail.castShadow=true;scene.add(rail);
      scene.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(edge),n,.065,5,false),yellow));
    }
    // Visible underside and sidewalls share the collider's half-metre thickness.
    const underside=g.clone(),backPos=underside.attributes.position;
    for(let i=0;i<=n;i++){const p=curvePoint(radius,angle*i/n,z);for(const side of [0,1]){const j=i*2+side;backPos.setXYZ(j,backPos.getX(j),p.y+ROAD_Y-p.normalY*.45,p.z-p.normalZ*.45);}}
    underside.computeVertexNormals();const back=new THREE.Mesh(underside,steel);back.material=steel.clone();back.material.side=THREE.DoubleSide;back.castShadow=true;back.receiveShadow=true;scene.add(back);
    for(const side of [-1,1]){const sideVertices=[],sideIndices=[];for(let i=0;i<=n;i++){const p=curvePoint(radius,angle*i/n,z);sideVertices.push(x+side*width/2,p.y+ROAD_Y,p.z,x+side*width/2,p.y+ROAD_Y-p.normalY*.45,p.z-p.normalZ*.45);if(i<n){const a=i*2;sideIndices.push(a,a+1,a+2,a+1,a+3,a+2);}}const sg=new THREE.BufferGeometry();sg.setAttribute('position',new THREE.Float32BufferAttribute(sideVertices,3));sg.setIndex(sideIndices);sg.computeVertexNormals();const sm=new THREE.Mesh(sg,back.material);sm.castShadow=true;scene.add(sm);}
    for(let i=5;i<65;i+=6){const t=angle*i/65,p=curvePoint(radius,t,z);if(p.y<2)continue;const supportY=p.y+ROAD_Y-p.normalY*.7,supportZ=p.z-p.normalZ*.7;for(const side of [-1,1]){const sx=x+side*(width/2+1.1);box([.5,supportY,.5],[sx,supportY/2,supportZ],steel);}box([width+3,.35,.5],[x,supportY,supportZ],steel);}
  }
  curve({x:-65,z:75,radius:25,angle:Math.PI,width:14,segments:180});
  // Inverted extension: the driving surface is the underside, at y = 50 m.
  box([14,.5,12],[-65,50.25+ROAD_Y,69],dark,[0,0,0],true);
  for(const s of [-1,1])box([.18,.25,12],[-65+s*7,50.15+ROAD_Y,69],yellow);
  curve({x:75,z:72,radius:16,angle:Math.PI,width:14,segments:160});
  // Two takeoff profiles, with corresponding landing wedge and solid obstacles.
  wedge(0,185,14,25,0,5.05);
  wedge(0,249,18,28,4.1,0);
  for(let i=0;i<5;i++){
    const z=205+i*5.6;box([6.3,2.2,2.5],[0,1.1,z],i%2?steel:concrete,[0,0,0],true);box([6.5,.1,2.6],[0,2.25,z],orange);
    sign(`CLEARANCE / ${i+1}`,[0,1.2,z-1.26],4,.8,Math.PI);
  }
  for(const x of [-9,9]){box([.35,12,.35],[x,6,219],steel,[0,0,0],true);box([.5,.12,2],[x,11.9,219],orange);}box([18.5,.3,.35],[0,12,219],steel);
  // Low handling ramps and skidpad.
  for(const [x,z,h0,h1] of [[-26,15,0,1.6],[26,38,1.6,0],[-27,-15,0,1.05]])wedge(x,z,9,15,h0,h1);
  const ring=new THREE.Mesh(new THREE.RingGeometry(21.8,22,128),paint);ring.rotation.x=-Math.PI/2;ring.position.set(0,.078,2);scene.add(ring);
  const ring2=ring.clone();ring2.scale.setScalar(.55);scene.add(ring2);
  // Flight landing pad.
  road(-65,5,34,45);const pad=new THREE.Mesh(new THREE.RingGeometry(12.5,12.85,96),orange);pad.rotation.x=-Math.PI/2;pad.position.set(-65,.085,5);scene.add(pad);
  box([13,.012,.35],[-65,.09,5],paint);box([.35,.012,13],[-65,.09,5],paint);
  // Architectural framing: test operations building and long equipment hangar.
  box([62,11,22],[-109,5.5,-65],concrete,[0,0,0],true);box([64,.5,24],[-109,11.3,-65],paint);
  box([57,2.8,.13],[-109,7.4,-53.93],new THREE.MeshStandardMaterial({color:0x263d46,roughness:.2,metalness:.7}));
  for(let x=-136;x<-80;x+=5)box([.12,3,.3],[x,7.4,-53.8],dark);
  for(let x=-132;x<-90;x+=12)box([9,4.6,.12],[x,2.3,-53.9],dark);
  sign('R /    ADVANCED VEHICLE OPERATIONS',[-109,9.7,-53.8],42,1.7);
  box([30,7,75],[211,3.5,48],concrete,[0,0,0],true);box([31,.4,76],[211,7.3,48],steel);
  for(let z=18;z<80;z+=15){box([.1,5.3,10],[195.94,2.65,z],dark);for(let y=.6;y<5.3;y+=.35)box([.12,.035,10],[195.85,y,z],steel);}
  // Modular safety barriers (physical).
  for(let z=-87;z<90;z+=6)for(const x of [-84,96]){box([.8,.9,5.5],[x,.45,z],concrete,[0,0,0],true);box([.84,.12,1.8],[x,.94,z],orange);}
  for(let x=-40;x<50;x+=6){box([5.5,.9,.8],[x,.45,-83],concrete,[0,0,0],true);box([1.7,.12,.85],[x,.94,-83],orange);}
  // Cone slalom, small physical boundaries.
  for(let i=0;i<18;i++){const x=(i%2?1:-1)*7,z=-55+i*6;const cone=new THREE.Mesh(new THREE.ConeGeometry(.25,.65,12),orange);cone.position.set(x,.325,z);cone.castShadow=true;scene.add(cone);box([.5,.06,.5],[x,.03,z],dark);}
  sign('02   /   INVERTED HALF RAMP',[-65,5,61],15,2.2,Math.PI);sign('04   /   COMPACT HALF PIPE',[75,7,59],16,2.4,Math.PI);
  sign('03   /   CLEAR THE ORDINARY',[0,7,173],18,2.5,Math.PI);
  sign('05   /   ACCELERATION',[155,6,-151],20,2.4,Math.PI);
  for(const [x,z,y,w] of [[-65,61,5,15],[75,59,7,16],[0,173,7,18],[155,-151,6,20]]){const height=y+1.5;for(const s of [-1,1])box([.2,height,.2],[x+s*(w/2+.35),height/2,z],steel);box([w+.9,.2,.2],[x,height,z],steel);}
  // Added practice sites. Every raised road is solid down to its foundation.
  road(-115,150,15,130);road(-125,220,70,16);road(-90,310,70,16);
  const waveCount=50,waveStart=120,waveLength=90;
  const waveHeight=t=>Math.sin(t*Math.PI)**2*(1-Math.cos(t*Math.PI*6))*.85;
  for(let i=0;i<waveCount;i++)wedge(-115,waveStart+(i+.5)*waveLength/waveCount,14,waveLength/waveCount,waveHeight(i/waveCount),waveHeight((i+1)/waveCount));
  function solidQuad(quad){
    const data={vertices:[...quad.map(p=>[p[0],ROAD_Y-.25,p[2]]),...quad],faces:[[0,1,2,3],[4,7,6],[4,6,5],[0,4,5,1],[3,2,6,7],[0,3,7,4],[1,5,6,2]]};
    const vertices=[],uv=[];for(const face of data.faces)for(let i=1;i<face.length-1;i++)for(const k of [0,i,i+1]){const p=data.vertices[face[k]];vertices.push(...p);uv.push(p[0]/5,p[2]/5);}
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.computeVertexNormals();const m=new THREE.Mesh(geometry,trackMaterial);m.castShadow=m.receiveShadow=true;scene.add(m);addWedge(world,data,0,0);
  }
  const bankPoint=(t,side)=>{const a=-Math.PI/2+t*Math.PI,bank=Math.sin(t*Math.PI)*.34,r=45+side*7.5;return [-90+Math.cos(a)*r,ROAD_Y+(side+1)*7.5*Math.sin(bank),265+Math.sin(a)*r];};
  for(let i=0;i<60;i++){const t0=i/60,t1=(i+1)/60;solidQuad([bankPoint(t0,-1),bankPoint(t0,1),bankPoint(t1,1),bankPoint(t1,-1)]);}
  for(const side of [-1,1]){const points=[];for(let i=0;i<=60;i++){const p=bankPoint(i/60,side);p[1]+=.012;points.push(new THREE.Vector3(...p));}scene.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),100,.065,5,false),yellow));}
  road(55,263,16,65);wedge(55,290,15,25,0,4);wedge(55,340,18,25,4,0);road(55,366,32,38);wedge(55,399,12,24,0,2.3);wedge(55,443,18,28,2.3,0);road(55,471,35,30);
  road(-65,-231,44,132);road(-65,-140,18,65);
  for(let i=0;i<9;i++){const z=-260+i*12,x=-65+(i%2?-1:1)*9;box([9,.65,1],[x,.325,z],concrete,[0,0,0],true);box([9,.05,1.03],[x,.675,z],orange);}
  for(const [label,x,z] of [['06 / BANKED CORNER',-125,207],['07 / WAVE RUN',-115,91],['08 / GAP JUMPS',55,228],['09 / HANDLING',-65,-292]]){sign(label,[x,2.3,z],9,1);for(const side of [-1,1])box([.12,2.9,.12],[x+side*4.7,1.45,z],steel);box([9.6,.12,.12],[x,2.9,z],steel);}
  // Solar light towers, emissive lamps also read at night.
  const lamps=new THREE.MeshStandardMaterial({color:0xffe7bd,emissive:0xffe2aa,emissiveIntensity:3});
  for(const [x,z] of [[-92,40],[-42,-65],[45,-70],[100,110],[134,-130],[175,150],[-42,135],[25,260]]){
    box([.24,15,.24],[x,7.5,z],steel);box([4,.18,.7],[x,15,z],steel);for(const s of [-1,1])box([1.2,.1,.65],[x+s*1.3,14.85,z],lamps);
  }
  // Distant desert ridges, deterministic noise; clear flat ground inside the facility.
  const geo=new THREE.PlaneGeometry(3400,3400,180,180);geo.rotateX(-Math.PI/2);const attr=geo.attributes.position,colors=[];
  function noise(x,z){return Math.sin(x*.005+Math.cos(z*.003)*2)*Math.cos(z*.004)+.35*Math.sin(x*.018+z*.011)+.14*Math.sin(x*.047-z*.037);}
  function terrainHeight(x,z){const distance=Math.hypot(x,z-80),fade=THREE.MathUtils.smoothstep(distance,390,720);return Math.max(-.2,fade*(65+noise(x,z)*75+Math.sin(z*.009)*30));}
  for(let i=0;i<attr.count;i++){
    const x=attr.getX(i),z=attr.getZ(i),h=terrainHeight(x,z);attr.setY(i,h);const color=new THREE.Color().setHSL(.09,.19,.36+Math.max(0,h)/650+rng()*.05);colors.push(color.r,color.g,color.b);
  }
  const heights=Array.from({length:181},(_,i)=>Array.from({length:181},(_,j)=>terrainHeight(-1700+i*3400/180,1700-j*3400/180)));const terrainBody=addHeightfield(world,heights,3400/180,[-1700,-.15,1700]);geo.setIndex(heightfieldRenderIndices(180));
  geo.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geo.computeVertexNormals();const mountain=new THREE.Mesh(geo,new THREE.MeshStandardMaterial({vertexColors:true,roughness:1,flatShading:false,map:texture('sand'),bumpMap:texture('sand'),bumpScale:.4}));mountain.position.y=-.15;mountain.receiveShadow=true;scene.add(mountain);
  const rocks=new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1,1),makeMaterial(0x817864),280),dummy=new THREE.Object3D();
  rocks.geometry.computeBoundingBox();const rockBounds=new THREE.Box3();
  function terrainSample(x,z){return Math.max(-.04,terrainBody.shapes[0].getHeightAt(x+1700,1700-z,true)-.15);}
  for(let i=0;i<280;i++){const a=rng()*Math.PI*2,r=330+rng()*650,x=Math.cos(a)*r,z=Math.sin(a)*r+80;dummy.position.set(x,0,z);dummy.scale.set(1+rng()*4,.4+rng()*2,1+rng()*4);dummy.rotation.set(rng()*.25,rng()*6,rng()*.25);dummy.updateMatrix();rockBounds.copy(rocks.geometry.boundingBox).applyMatrix4(dummy.matrix);const floor=Math.min(terrainSample(x,z),terrainSample(rockBounds.min.x,rockBounds.min.z),terrainSample(rockBounds.max.x,rockBounds.max.z));dummy.position.y=floor-rockBounds.min.y-.5*dummy.scale.y;dummy.updateMatrix();rocks.setMatrixAt(i,dummy.matrix);}rocks.castShadow=true;scene.add(rocks);
  // Facility boundary and slender antenna masts establish scale.
  for(let z=-160;z<330;z+=15)box([.12,2.6,.12],[-157,1.3,z],steel);
  for(const y of [.5,1.5,2.5])box([.035,.035,490],[-157,y,85],steel);
  for(let i=0;i<3;i++){const x=-120+i*14;box([.18,30+i*7,.18],[x,15+i*3.5,-110],steel);box([3,.09,.09],[x,29+i*7,-110],paint);}
  const sky=new Sky();sky.scale.setScalar(5000);scene.add(sky);
  const sun=new THREE.DirectionalLight(0xffe2b7,3.1);sun.position.set(-180,145,-110);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=-55;sun.shadow.camera.right=55;sun.shadow.camera.top=55;sun.shadow.camera.bottom=-55;sun.shadow.camera.near=1;sun.shadow.camera.far=500;sun.shadow.bias=-.0001;sun.shadow.normalBias=.12;scene.add(sun);scene.add(sun.target);
  const hemi=new THREE.HemisphereLight(0xc0d8e6,0xb5a58b,2);scene.add(hemi);
  const uniforms=sky.material.uniforms;uniforms.turbidity.value=5;uniforms.rayleigh.value=1.6;uniforms.mieCoefficient.value=.004;uniforms.mieDirectionalG.value=.86;
  scene.fog=new THREE.FogExp2(0xb5b7af,.00085);
  function setTime(time){
    const night=time==='night',day=time==='day',elevation=night?-4:day?54:17;
    const phi=THREE.MathUtils.degToRad(90-elevation),theta=THREE.MathUtils.degToRad(245),direction=new THREE.Vector3().setFromSphericalCoords(1,phi,theta);uniforms.sunPosition.value.copy(direction);
    sun.color.set(day?0xfff4db:night?0xa6c4ff:0xffdcab);sun.intensity=night?.4:day?3.5:3.1;hemi.intensity=night?.35:day?1.8:1.3;
    scene.fog.color.set(night?0x17232f:day?0xc6d3d4:0xb5b7af);scene.userData.sunDirection=night?new THREE.Vector3(-.4,.65,.4):direction;
  }
  setTime('sunset');
  batchStatic(scene,m=>m===sky);
  return {sky,sun,hemi,setTime};
}
