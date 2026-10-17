import * as THREE from 'three';
import {Vec3,RaycastResult} from 'cannon-es';
import {NOZZLES} from './vehicle-config.js';

// Pooled, depth-faded vapour billboards. Cold gas has no flame or emissive cone.
export class ColdGas {
  constructor(scene,world){
    this.world=world;this.capacity=2200;this.cursor=0;this.time=0;this.accumulators=NOZZLES.map(()=>0);this.enabled=true;
    this.particles=Array.from({length:this.capacity},()=>({life:0,age:0,position:new THREE.Vector3(),velocity:new THREE.Vector3(),normal:new THREE.Vector3(),plane:new THREE.Vector3(),hasPlane:false,size:0,seed:0,rotation:0,distance:0}));
    const plane=new THREE.PlaneGeometry(1,1),geometry=new THREE.InstancedBufferGeometry();geometry.index=plane.index;geometry.attributes.position=plane.attributes.position;geometry.attributes.uv=plane.attributes.uv;
    this.attributes={center:new THREE.InstancedBufferAttribute(new Float32Array(this.capacity*3),3),size:new THREE.InstancedBufferAttribute(new Float32Array(this.capacity*2),2),rotation:new THREE.InstancedBufferAttribute(new Float32Array(this.capacity),1),opacity:new THREE.InstancedBufferAttribute(new Float32Array(this.capacity),1),seed:new THREE.InstancedBufferAttribute(new Float32Array(this.capacity),1)};
    for(const [name,value] of Object.entries(this.attributes)){value.setUsage(THREE.DynamicDrawUsage);geometry.setAttribute('a'+name[0].toUpperCase()+name.slice(1),value);}geometry.instanceCount=0;
    this.depth=new THREE.WebGLRenderTarget(1,1);this.depth.depthTexture=new THREE.DepthTexture(1,1,THREE.UnsignedIntType);this.depthMaterial=new THREE.MeshDepthMaterial();this.size=new THREE.Vector2();
    this.material=new THREE.ShaderMaterial({transparent:true,depthWrite:false,depthTest:true,uniforms:{uTime:{value:0},uDepth:{value:this.depth.depthTexture},uResolution:{value:new THREE.Vector2(1,1)},uNear:{value:.2},uFar:{value:4000},uSoft:{value:1},uTint:{value:new THREE.Color(.94,.96,.98)}},vertexShader:`
      attribute vec3 aCenter;attribute vec2 aSize;attribute float aRotation,aOpacity,aSeed;
      varying vec2 vUv;varying float vOpacity,vSeed,vViewZ;
      void main(){vec4 center=modelViewMatrix*vec4(aCenter,1.0);float c=cos(aRotation),s=sin(aRotation);vec2 corner=mat2(c,-s,s,c)*(position.xy*aSize);center.xy+=corner;gl_Position=projectionMatrix*center;vViewZ=center.z;vUv=uv;vOpacity=aOpacity;vSeed=aSeed;}
    `,fragmentShader:`
      uniform float uTime,uNear,uFar,uSoft;uniform sampler2D uDepth;uniform vec2 uResolution;uniform vec3 uTint;
      varying vec2 vUv;varying float vOpacity,vSeed,vViewZ;
      #include <packing>
      float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
      float fbm(vec2 p){float n=0.0,a=.55;for(int i=0;i<4;i++){n+=noise(p)*a;p=p*2.07+vec2(7.3,3.2);a*=.49;}return n;}
      void main(){vec2 p=vUv*2.0-1.0;vec2 flow=vec2(vSeed*17.0-uTime*.32,vSeed*31.0+uTime*.23);float n=fbm(p*3.0+flow);float edge=length(p)+(.5-n)*.4;float density=smoothstep(1.0,.2,edge)*(.25+n*.9);float soft=1.0;
        if(uSoft>.5){float sceneZ=-perspectiveDepthToViewZ(texture2D(uDepth,gl_FragCoord.xy/uResolution).x,uNear,uFar);soft=clamp((sceneZ+vViewZ)/.65,0.0,1.0);}
        float alpha=density*vOpacity*soft;if(alpha<.003)discard;vec3 color=uTint*(.65+.35*n);gl_FragColor=vec4(color,alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `});
    this.mesh=new THREE.Mesh(geometry,this.material);this.mesh.frustumCulled=false;this.mesh.layers.set(1);scene.add(this.mesh);this.ray=new RaycastResult();this.from=new Vec3();this.to=new Vec3();
  }
  strength(nozzle,thrusters){
    if(nozzle.kind==='boost')return thrusters.boost;
    if(nozzle.kind==='lift')return Math.min(1,thrusters.lift+(thrusters.roll*nozzle.side>0?.5:0)+(thrusters.pitch*nozzle.end<0?.5:0));
    return thrusters.yaw*nozzle.side*nozzle.end>0?.45:0;
  }
  update(dt,sim,pose,camera,active){
    this.time+=dt;this.material.uniforms.uTime.value=this.time;
    if(active)NOZZLES.forEach((nozzle,index)=>{
      const strength=this.strength(nozzle,sim.thrusters);if(!strength)return;
      const origin=new THREE.Vector3(...nozzle.position).applyQuaternion(pose.quaternion).add(pose.position),direction=new THREE.Vector3(...nozzle.direction).applyQuaternion(pose.quaternion);
      this.from.set(origin.x,origin.y,origin.z);this.to.set(origin.x+direction.x*15,origin.y+direction.y*15,origin.z+direction.z*15);this.ray.reset();
      const hit=this.world.raycastClosest(this.from,this.to,{collisionFilterMask:1,skipBackfaces:false},this.ray);
      this.accumulators[index]+=dt*320*strength;
      while(this.accumulators[index]>=1){this.accumulators[index]--;const p=this.particles[this.cursor++%this.capacity];p.life=.8+Math.random()*.5;p.age=0;p.seed=Math.random();p.size=.145+Math.random()*.07;p.rotation=Math.random()*Math.PI*2;p.position.copy(origin).addScaledVector(direction,.055+Math.random()*.25);p.velocity.set(sim.body.velocity.x,sim.body.velocity.y,sim.body.velocity.z).addScaledVector(direction,15+Math.random()*9);p.velocity.x+=(Math.random()-.5)*1.3;p.velocity.z+=(Math.random()-.5)*1.3;p.hasPlane=hit;p.impacted=false;if(hit){p.plane.copy(this.ray.hitPointWorld);p.normal.copy(this.ray.hitNormalWorld);}}
    });
    const alive=[];
    for(const p of this.particles){if(p.age>=p.life)continue;p.age+=dt;p.position.addScaledVector(p.velocity,dt);const age=Math.min(1,p.age/p.life);
      p.velocity.multiplyScalar(Math.exp(-dt*1.15));p.velocity.x+=Math.sin(p.seed*91+this.time*5)*dt*2.5;p.velocity.z+=Math.cos(p.seed*73+this.time*4)*dt*2.5;p.velocity.y-=dt*.3;
      if(p.hasPlane){const distance=(p.position.x-p.plane.x)*p.normal.x+(p.position.y-p.plane.y)*p.normal.y+(p.position.z-p.plane.z)*p.normal.z;if(distance<.1){p.position.addScaledVector(p.normal,.1-distance);const vn=p.velocity.dot(p.normal);if(vn<0)p.velocity.addScaledVector(p.normal,-vn);if(!p.impacted){const spread=new THREE.Vector3(Math.sin(p.seed*60),.1,Math.cos(p.seed*60));spread.addScaledVector(p.normal,-spread.dot(p.normal)).normalize();p.velocity.addScaledVector(spread,3+4*p.seed);p.size=Math.max(p.size,.17);p.impacted=true;}}}
      p.distance=p.position.distanceToSquared(camera.position);p.alpha=Math.min(1,p.age/.025)*(1-age)**1.5*.3;p.currentSize=p.size+p.age*(1.35+p.seed*.9);alive.push(p);
    }
    alive.sort((a,b)=>b.distance-a.distance);
    alive.forEach((p,i)=>{this.attributes.center.setXYZ(i,p.position.x,p.position.y,p.position.z);this.attributes.size.setXY(i,p.currentSize*1.4,p.currentSize);this.attributes.rotation.setX(i,p.rotation+p.age*.18);this.attributes.opacity.setX(i,p.alpha);this.attributes.seed.setX(i,p.seed);});
    this.mesh.geometry.instanceCount=alive.length;for(const attribute of Object.values(this.attributes))attribute.needsUpdate=true;this.aliveCount=alive.length;
  }
  renderDepth(renderer,scene,camera,cutaway=false){
    if(!this.aliveCount)return;
    if(cutaway){this.material.uniforms.uSoft.value=0;return;}
    renderer.getDrawingBufferSize(this.size);const width=Math.max(1,Math.round(this.size.x*.6)),height=Math.max(1,Math.round(this.size.y*.6));if(this.depth.width!==width||this.depth.height!==height)this.depth.setSize(width,height);
    this.material.uniforms.uResolution.value.copy(this.size);this.material.uniforms.uNear.value=camera.near;this.material.uniforms.uFar.value=camera.far;
    this.material.uniforms.uSoft.value=this.enabled?1:0;if(!this.enabled)return;
    const target=renderer.getRenderTarget(),override=scene.overrideMaterial,shadow=renderer.shadowMap.autoUpdate,mask=camera.layers.mask;camera.layers.set(0);scene.overrideMaterial=this.depthMaterial;renderer.shadowMap.autoUpdate=false;renderer.setRenderTarget(this.depth);renderer.clear();renderer.render(scene,camera);renderer.setRenderTarget(target);renderer.shadowMap.autoUpdate=shadow;scene.overrideMaterial=override;camera.layers.mask=mask;
  }
}
