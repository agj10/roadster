import * as CANNON from 'cannon-es';

// SI units. All vehicle parameters below are engineering assumptions, not Tesla data.
export const PARAMETERS = Object.freeze({mass:1900, wheelRadius:0.355, wheelbase:2.78, track:1.7, maxSpeed:105, motorForce:25000, boostForce:72000, gasSeconds:8, suction:2, lift:2.8, dragArea:0.66});
export const ZONES = [
  {name:'OPEN PAD',title:'자유 주행',position:[0,1.1,-35],yaw:0,tip:'W로 출발하세요. 1–5로 시험 구역을 바꿀 수 있어요.'},
  {name:'THE RAMP',title:'인버티드 램프',position:[-65,1.1,-65],yaw:0,tip:'흡착 팬 ON · 80–110 km/h로 램프 진입 · 공중에서는 Q/E'},
  {name:'THE JUMP',title:'킥플립 점프',position:[0,1.1,125],yaw:0,tip:'진입로 끝 장애물을 향해 Space로 상승 · Q/E로 롤'},
  {name:'THE LOOP',title:'버티컬 루프',position:[75,1.1,-45],yaw:0,tip:'흡착 팬 ON · 100 km/h 안팎으로 수직 루프에 진입하세요.'},
  {name:'THE STRAIGHT',title:'가속 시험로',position:[155,1.1,-180],yaw:0,tip:'정지 상태에서 W + Shift · 0–96.6 km/h 시간을 측정해요.'},
];
export function makeWorld(){
  const world=new CANNON.World({gravity:new CANNON.Vec3(0,-9.81,0)});
  world.broadphase=new CANNON.SAPBroadphase(world);world.solver.iterations=16;
  world.defaultContactMaterial.friction=.5;world.defaultContactMaterial.restitution=.04;
  const ground=new CANNON.Body({mass:0,collisionFilterGroup:1});ground.addShape(new CANNON.Plane());ground.quaternion.setFromEuler(-Math.PI/2,0,0);world.addBody(ground);
  return world;
}
export function addBox(world,size,position,rotation=[0,0,0]){
  const b=new CANNON.Body({mass:0,collisionFilterGroup:1});
  b.addShape(new CANNON.Box(new CANNON.Vec3(size[0]/2,size[1]/2,size[2]/2)));
  b.position.set(...position);b.quaternion.setFromEuler(...rotation);world.addBody(b);return b;
}
export function addHeightfield(world,data,elementSize,position){
  const terrain=new CANNON.Body({mass:0,collisionFilterGroup:1});terrain.addShape(new CANNON.Heightfield(data,{elementSize}));terrain.position.set(...position);terrain.quaternion.setFromEuler(-Math.PI/2,0,0);world.addBody(terrain);return terrain;
}
export function curvePoint(radius,theta,z0=0){return {y:radius*(1-Math.cos(theta)),z:z0+radius*Math.sin(theta),normalY:Math.cos(theta),normalZ:-Math.sin(theta)};}
export function addCurvePhysics(world,{x,z,radius,angle=Math.PI,width=14,segments=160}){
  const step=angle/segments,thickness=.45;
  for(let i=0;i<segments;i++){
    const t=(i+.5)*step,p=curvePoint(radius,t,z);
    addBox(world,[width,thickness,radius*step+.035],[x,p.y-p.normalY*thickness/2+.015,p.z-p.normalZ*thickness/2],[-t,0,0]);
  }
}
export class VehicleSimulation{
  constructor(world){
    this.world=world;this.body=new CANNON.Body({mass:PARAMETERS.mass,linearDamping:.012,angularDamping:.35,allowSleep:false,collisionFilterGroup:2,collisionFilterMask:1});
    this.body.addShape(new CANNON.Box(new CANNON.Vec3(.91,.29,2.12)),new CANNON.Vec3(0,.13,0));
    this.body.position.set(...ZONES[0].position);this.body.ccdSpeedThreshold=15;this.body.ccdIterations=10;
    this.vehicle=new CANNON.RaycastVehicle({chassisBody:this.body,indexRightAxis:0,indexUpAxis:1,indexForwardAxis:2});
    const wheel={radius:PARAMETERS.wheelRadius,directionLocal:new CANNON.Vec3(0,-1,0),axleLocal:new CANNON.Vec3(-1,0,0),suspensionStiffness:55,suspensionRestLength:.27,frictionSlip:3.5,dampingRelaxation:4.2,dampingCompression:5.2,maxSuspensionForce:45000,rollInfluence:.06,maxSuspensionTravel:.18,customSlidingRotationalSpeed:-30,useCustomSlidingRotationalSpeed:true};
    for(const z of [1.39,-1.39])for(const x of [-.85,.85])this.vehicle.addWheel({...wheel,chassisConnectionPointLocal:new CANNON.Vec3(x,0,z),isFrontWheel:z>0});
    this.vehicle.addToWorld(world);this.fan=true;this.stabilize=false;this.suction=2;this.lift=2.8;this.gas=1;this.infinite=false;this.grounded=0;this.steer=0;this.input={};this.altitude=0;this.airtime=0;this.lastAirtime=0;this.maxHeight=0;this.runTime=null;this.runStart=null;this.elapsed=0;this.speed=0;this.gForce=1;this.lastVelocity=new CANNON.Vec3();this.jet=0;this.impact=0;this.zone=0;
    this.body.addEventListener('collide',e=>{this.impact=Math.max(this.impact,Math.abs(e.contact.getImpactVelocityAlongNormal()));});
    this.reset(0);
  }
  reset(zone=this.zone){
    this.zone=zone;const spawn=ZONES[zone];this.body.position.set(...spawn.position);this.body.previousPosition.copy(this.body.position);this.body.interpolatedPosition.copy(this.body.position);this.body.quaternion.setFromEuler(0,spawn.yaw,0);this.body.previousQuaternion.copy(this.body.quaternion);this.body.interpolatedQuaternion.copy(this.body.quaternion);this.body.velocity.setZero();this.body.angularVelocity.setZero();this.body.force.setZero();this.body.torque.setZero();this.body.aabbNeedsUpdate=true;this.body.wakeUp();this.steer=0;this.speed=0;this.gas=1;this.runStart=null;this.runTime=null;this.airtime=0;this.maxHeight=0;this.lastVelocity.setZero();this.impact=0;this.jet=0;
    for(let i=0;i<4;i++){this.vehicle.applyEngineForce(0,i);this.vehicle.setBrake(0,i);this.vehicle.wheelInfos[i].rotation=0;this.vehicle.wheelInfos[i].suspensionLength=.27;}
  }
  step(dt,input={}){
    this.input=input;this.elapsed+=dt;const b=this.body;
    this.grounded=this.vehicle.wheelInfos.filter(w=>w.isInContact).length;
    const forward=b.quaternion.vmult(new CANNON.Vec3(0,0,1)),up=b.quaternion.vmult(new CANNON.Vec3(0,1,0));
    this.speed=b.velocity.length();const signed=b.velocity.dot(forward);
    const steering=(input.left?1:0)-(input.right?1:0),steerLimit=.48/(1+this.speed*.026);
    this.steer+=(steering*steerLimit-this.steer)*Math.min(1,dt*7);
    this.vehicle.setSteeringValue(this.steer,0);this.vehicle.setSteeringValue(this.steer,1);
    let motor=0,brake=0;
    if(input.forward)motor=-PARAMETERS.motorForce/4*Math.max(.15,1-this.speed/125);
    if(input.back){if(signed>1)brake=160;else if(signed>-12)motor=PARAMETERS.motorForce/4*.4;}
    for(let i=0;i<4;i++){this.vehicle.applyEngineForce(motor,i);this.vehicle.setBrake(input.handbrake&&i>=2?340:brake,i);}
    // Fan force is chassis-relative and only acts while a wheel can see a surface.
    if(this.fan&&this.grounded){const force=(this.suction*9.81+this.speed*this.speed*.003)*b.mass;b.applyForce(up.scale(-force));}
    const drag=this.speed*.5*1.225*PARAMETERS.dragArea;b.applyForce(b.velocity.scale(-drag));
    const canFire=this.gas>0||this.infinite;let use=0;this.jet=0;
    if(canFire&&input.boost&&input.forward){b.applyForce(forward.scale(PARAMETERS.boostForce));use+=1;this.jet=1;}
    if(canFire&&input.lift){b.applyForce(up.scale(b.mass*9.81*this.lift));use+=1.6;this.jet=2;}
    const roll=(input.rollLeft?1:0)-(input.rollRight?1:0),pitch=(input.pitchUp?1:0)-(input.pitchDown?1:0);
    if(canFire&&!this.grounded&&(roll||pitch)){b.applyTorque(b.quaternion.vmult(new CANNON.Vec3(pitch*11500,steering*6000,roll*8500)));use+=(Math.abs(roll)+Math.abs(pitch)+Math.abs(steering))*.25;this.jet=3;}
    if(this.stabilize&&!this.grounded&&canFire&&!roll&&!pitch){
      const error=up.cross(new CANNON.Vec3(0,1,0));
      // An inverted body has zero cross-product; choose a roll direction explicitly.
      if(up.y<-.95)error.vadd(forward.scale(.8),error);
      const torque=error.scale(12500).vsub(b.angularVelocity.scale(3800));b.applyTorque(torque);use+=torque.length()/90000;
    }
    this.gas=Math.max(0,this.gas-use*dt/PARAMETERS.gasSeconds);
    if(this.grounded>=2&&this.speed<.35&&!input.forward&&!input.back)b.velocity.scale(.97,b.velocity);
    if(this.runStart===null&&input.forward&&this.grounded&&this.speed<1)this.runStart=this.elapsed;
    this.world.step(dt);
    if(this.runStart!==null&&this.runTime===null&&b.velocity.length()>=26.8224)this.runTime=this.elapsed-this.runStart;
    if(this.speed<.3&&!input.forward)this.runStart=null;
    b.velocity.vsub(this.lastVelocity,this.lastVelocity);this.lastVelocity.scale(1/dt,this.lastVelocity);this.lastVelocity.y+=9.81;this.gForce=Math.min(15,this.lastVelocity.length()/9.81);this.lastVelocity.copy(b.velocity);
    this.altitude=Math.max(0,b.position.y-.62);
    if(!this.grounded){this.airtime+=dt;this.maxHeight=Math.max(this.maxHeight,this.altitude);}else if(this.airtime>.15){this.lastAirtime=this.airtime;this.airtime=0;}
    this.impact*=.93;
    if(b.position.y<-30||Math.abs(b.position.x)>1100||Math.abs(b.position.z)>1100)this.reset();
  }
}
