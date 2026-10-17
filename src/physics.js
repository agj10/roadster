import * as CANNON from 'cannon-es';
import {VEHICLE} from './vehicle-config.js';
export const ROAD_Y=.06;

// SI units. All vehicle parameters below are engineering assumptions, not Tesla data.
export const PARAMETERS = Object.freeze({mass:1900, wheelRadius:0.355, wheelbase:2.78, track:1.7, maxSpeed:105, motorForce:25000, boostForce:72000, gasSeconds:8, suction:2, lift:2.8, dragArea:0.66});
export const ZONES = [
  {name:'OPEN PAD',title:'자유 주행',position:[0,1.1,-35],yaw:0,tip:'W로 출발하세요. 1–5로 시험 구역을 바꿀 수 있어요.'},
  {name:'THE RAMP',title:'인버티드 램프',position:[-65,1.1,-65],yaw:0,tip:'흡착 팬 ON · 80–110 km/h로 램프 진입 · 공중에서는 Q/E'},
  {name:'THE JUMP',title:'킥플립 점프',position:[0,1.1,125],yaw:0,tip:'진입로 끝 장애물을 향해 Space로 상승 · Q/E로 롤'},
  {name:'HALF PIPE',title:'컴팩트 반원',position:[75,1.1,-45],yaw:0,tip:'작은 수직 반원 · 70–90 km/h로 진입한 뒤 끝에서 공중 복귀'},
  {name:'THE STRAIGHT',title:'가속 시험로',position:[155,1.1,-180],yaw:0,tip:'정지 상태에서 W + Shift · 0–96.6 km/h 시간을 측정해요.'},
  {name:'BANKED TURN',title:'뱅크 코너',position:[-125,1.1,220],yaw:Math.PI/2,tip:'기울어진 180° 코너 · 가속을 줄이고 일정하게 조향해 보세요.'},
  {name:'WAVE RUN',title:'연속 요철',position:[-115,1.1,100],yaw:0,tip:'완만한 물결 지형 · 서스펜션과 착지를 시험하세요.'},
  {name:'GAP JUMPS',title:'갭 점프',position:[55,1.1,240],yaw:0,tip:'경사로 끝에서 뛰어올라 건너편에 착지 · Space로 체공 조절'},
  {name:'HANDLING',title:'핸들링 코스',position:[-65,1.1,-280],yaw:0,tip:'낮은 속도에서 슬라럼 · 좌우 조향과 제동 연습'},
];
export function makeWorld(){
  const world=new CANNON.World({gravity:new CANNON.Vec3(0,-9.81,0)});
  world.broadphase=new CANNON.SAPBroadphase(world);world.solver.iterations=16;
  world.defaultContactMaterial.friction=.5;world.defaultContactMaterial.restitution=.04;
  const ground=new CANNON.Body({mass:0,collisionFilterGroup:1});ground.addShape(new CANNON.Plane());ground.position.y=-.04;ground.quaternion.setFromEuler(-Math.PI/2,0,0);world.addBody(ground);
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
// World Z reverses the heightfield's local Y. Match its triangle diagonal exactly.
export function heightfieldRenderIndices(cells){const result=[],stride=cells+1;for(let z=0;z<cells;z++)for(let x=0;x<cells;x++){const a=z*stride+x,b=a+1,c=a+stride,d=c+1;result.push(a,c,d,a,d,b);}return result;}
export function wedgeData(width,length,startHeight,endHeight,base=ROAD_Y-.3){
  const w=width/2,l=length/2;
  return {vertices:[[-w,base,-l],[w,base,-l],[w,base,l],[-w,base,l],[-w,startHeight,-l],[w,startHeight,-l],[w,endHeight,l],[-w,endHeight,l]],faces:[[0,1,2,3],[4,7,6,5],[0,4,5,1],[3,2,6,7],[0,3,7,4],[1,5,6,2]]};
}
export function addWedge(world,data,x,z){
  const center=data.vertices.reduce((sum,p)=>{sum.x+=p[0]/data.vertices.length;sum.y+=p[1]/data.vertices.length;sum.z+=p[2]/data.vertices.length;return sum;},new CANNON.Vec3());
  const body=new CANNON.Body({mass:0,collisionFilterGroup:1});body.addShape(new CANNON.ConvexPolyhedron({vertices:data.vertices.map(p=>new CANNON.Vec3(p[0]-center.x,p[1]-center.y,p[2]-center.z)),faces:data.faces}));body.position.set(x+center.x,center.y,z+center.z);world.addBody(body);return body;
}
export function curvePoint(radius,theta,z0=0){return {y:radius*(1-Math.cos(theta)),z:z0+radius*Math.sin(theta),normalY:Math.cos(theta),normalZ:-Math.sin(theta)};}
export function addCurvePhysics(world,{x,z,radius,angle=Math.PI,width=14,segments=160}){
  const step=angle/segments,thickness=.45;
  for(let i=0;i<segments;i++){
    const t=(i+.5)*step,p=curvePoint(radius,t,z);
    addBox(world,[width,thickness,radius*step+.025],[x,p.y+ROAD_Y-p.normalY*thickness/2,p.z-p.normalZ*thickness/2],[-t,0,0]);
  }
}
export class VehicleSimulation{
  constructor(world){
    this.world=world;this.body=new CANNON.Body({mass:PARAMETERS.mass,linearDamping:.012,angularDamping:.35,allowSleep:false,collisionFilterGroup:2,collisionFilterMask:1});
    this.body.addShape(new CANNON.Box(new CANNON.Vec3(.955,.22,2.25)),new CANNON.Vec3(0,.015,0));
    this.body.addShape(new CANNON.Box(new CANNON.Vec3(.57,.16,.67)),new CANNON.Vec3(0,.55,-.05));
    this.body.position.set(...ZONES[0].position);this.body.ccdSpeedThreshold=15;this.body.ccdIterations=10;
    this.vehicle=new CANNON.RaycastVehicle({chassisBody:this.body,indexRightAxis:0,indexUpAxis:1,indexForwardAxis:2});
    const wheel={radius:PARAMETERS.wheelRadius,directionLocal:new CANNON.Vec3(0,-1,0),axleLocal:new CANNON.Vec3(-1,0,0),suspensionStiffness:55,suspensionRestLength:.27,frictionSlip:1.35,dampingRelaxation:4.2,dampingCompression:5.2,maxSuspensionForce:45000,rollInfluence:.035,maxSuspensionTravel:.18,customSlidingRotationalSpeed:-30,useCustomSlidingRotationalSpeed:true};
    for(const z of [VEHICLE.wheelbase/2,-VEHICLE.wheelbase/2])for(const x of [-VEHICLE.track/2,VEHICLE.track/2])this.vehicle.addWheel({...wheel,chassisConnectionPointLocal:new CANNON.Vec3(x,0,z),isFrontWheel:z>0});
    this.vehicle.addToWorld(world);this.fan=true;this.stabilize=true;this.suction=2;this.lift=2.8;this.gas=1;this.infinite=true;this.grounded=0;this.steer=0;this.throttle=0;this.reverseHold=0;this.input={};this.altitude=0;this.airtime=0;this.lastAirtime=0;this.maxHeight=0;this.runTime=null;this.runStart=null;this.elapsed=0;this.speed=0;this.gForce=1;this.lastVelocity=new CANNON.Vec3();this.jet=0;this.impact=0;this.zone=0;this.thrusters={boost:0,lift:0,roll:0,pitch:0,yaw:0};
    this.body.addEventListener('collide',e=>{this.impact=Math.max(this.impact,Math.abs(e.contact.getImpactVelocityAlongNormal()));});
    this.reset(0);
  }
  reset(zone=this.zone){
    this.zone=zone;const spawn=ZONES[zone];this.body.position.set(...spawn.position);this.body.previousPosition.copy(this.body.position);this.body.interpolatedPosition.copy(this.body.position);this.body.quaternion.setFromEuler(0,spawn.yaw,0);this.body.previousQuaternion.copy(this.body.quaternion);this.body.interpolatedQuaternion.copy(this.body.quaternion);this.body.velocity.setZero();this.body.angularVelocity.setZero();this.body.force.setZero();this.body.torque.setZero();this.body.aabbNeedsUpdate=true;this.body.wakeUp();this.steer=0;this.speed=0;this.gas=1;this.runStart=null;this.runTime=null;this.airtime=0;this.maxHeight=0;this.lastVelocity.setZero();this.impact=0;this.jet=0;
    this.throttle=0;this.reverseHold=0;this.thrusters={boost:0,lift:0,roll:0,pitch:0,yaw:0};
    for(let i=0;i<4;i++){this.vehicle.applyEngineForce(0,i);this.vehicle.setBrake(0,i);this.vehicle.wheelInfos[i].rotation=0;this.vehicle.wheelInfos[i].suspensionLength=.27;}
  }
  step(dt,input={}){
    this.input=input;this.elapsed+=dt;const b=this.body;
    this.grounded=this.vehicle.wheelInfos.filter(w=>w.isInContact).length;
    const forward=b.quaternion.vmult(new CANNON.Vec3(0,0,1)),up=b.quaternion.vmult(new CANNON.Vec3(0,1,0));
    this.speed=b.velocity.length();const signed=b.velocity.dot(forward);
    // Cannon's positive steering turns +Z towards +X, i.e. RIGHT.
    const steering=(input.right?1:0)-(input.left?1:0);
    const steerLimit=Math.min(.52,Math.atan(VEHICLE.wheelbase*(this.fan?14:9)/(this.speed*this.speed+3)));
    this.steer+=(steering*steerLimit-this.steer)*(1-Math.exp(-dt*(steering?11:16)));
    const radius=VEHICLE.wheelbase/Math.tan(Math.max(.00001,Math.abs(this.steer)));
    for(let i=0;i<2;i++){const inner=(this.steer>0&&i===1)||(this.steer<0&&i===0);this.vehicle.setSteeringValue(Math.sign(this.steer)*Math.atan(VEHICLE.wheelbase/(radius+(inner?-1:1)*VEHICLE.track/2)),i);}
    let targetThrottle=0,brake=0;
    if(input.forward){if(signed<-.7)brake=1;else targetThrottle=1;this.reverseHold=0;}
    else if(input.back){if(signed>.7){brake=1;this.reverseHold=0;}else{this.reverseHold+=dt;if(this.reverseHold>.3&&signed>-12)targetThrottle=-.36;else brake=1;}}
    else this.reverseHold=0;
    this.throttle+=(targetThrottle-this.throttle)*(1-Math.exp(-dt*(brake?20:8)));
    const motor=-PARAMETERS.motorForce/4*this.throttle*Math.max(.15,1-this.speed/125),brakeImpulse=brake*11.5*b.mass*dt/4;
    for(let i=0;i<4;i++){this.vehicle.applyEngineForce(motor,i);this.vehicle.setBrake(input.handbrake&&i>=2?90:brakeImpulse,i);}
    // Fan force is chassis-relative and only acts while a wheel can see a surface.
    if(this.fan&&this.grounded&&!input.lift){const force=(this.suction*9.81+this.speed*this.speed*.003)*b.mass;b.applyForce(up.scale(-force));}
    const drag=this.speed*.5*1.225*PARAMETERS.dragArea;b.applyForce(b.velocity.scale(-drag));
    this.jet=0;this.thrusters={boost:0,lift:0,roll:0,pitch:0,yaw:0};
    if(input.boost&&input.forward){b.applyForce(forward.scale(PARAMETERS.boostForce));this.jet=1;this.thrusters.boost=1;}
    if(input.lift){b.applyForce(up.scale(b.mass*9.81*this.lift));this.jet=2;this.thrusters.lift=1;}
    const roll=(input.rollLeft?1:0)-(input.rollRight?1:0),pitch=(input.pitchDown?1:0)-(input.pitchUp?1:0);
    if(!this.grounded){
      const localOmega=b.quaternion.conjugate().vmult(b.angularVelocity),desired=new CANNON.Vec3(pitch*1.35,steering*1.15,roll*1.85);
      if(this.stabilize&&!roll&&!pitch){const error=up.cross(new CANNON.Vec3(0,1,0));if(up.y<-.95)error.vadd(forward.scale(.8),error);const localError=b.quaternion.conjugate().vmult(error);desired.x=Math.max(-1.35,Math.min(1.35,localError.x*2.3));desired.z=Math.max(-1.85,Math.min(1.85,localError.z*2.3));}
      const limits=[18000,12000,4200],torque=new CANNON.Vec3();for(const [i,axis] of ['x','y','z'].entries())torque[axis]=Math.max(-limits[i],Math.min(limits[i],(desired[axis]-localOmega[axis])*b.inertia[axis]*5.5));
      b.applyTorque(b.quaternion.vmult(torque));
      if(roll||pitch||steering){this.jet=3;this.thrusters.roll=roll;this.thrusters.pitch=pitch;this.thrusters.yaw=steering;}
    }
    this.gas=1;
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
