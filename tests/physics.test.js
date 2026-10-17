import test from 'node:test';
import assert from 'node:assert/strict';
import {makeWorld,VehicleSimulation,addBox,addCurvePhysics,addWedge,wedgeData,ROAD_Y,ZONES} from '../src/physics.js';
import {Vec3,RaycastResult} from 'cannon-es';
import * as THREE from 'three';
import {DrivingCamera} from '../src/camera.js';
const dt=1/120;
function settled(){const world=makeWorld(),sim=new VehicleSimulation(world);for(let i=0;i<240;i++)sim.step(dt);return {world,sim};}
function run(sim,seconds,input={}){for(let i=0;i<seconds/dt;i++)sim.step(dt,input);}
test('suspension supports the stationary car without sinking or gaining energy',()=>{const {sim}=settled();assert.ok(sim.body.position.y>.45&&sim.body.position.y<.9,`height ${sim.body.position.y}`);assert.equal(sim.grounded,4);assert.ok(sim.speed<.2);});
test('all-wheel drive accelerates forward; braking removes momentum',()=>{const {sim}=settled();run(sim,2,{forward:true});assert.ok(sim.body.position.z>ZONES[0].position[2]+5);assert.ok(sim.speed>15);const before=sim.speed;run(sim,1,{back:true});assert.ok(sim.speed<before*.6);});
test('unlimited thrust still works after more than the former tank duration',()=>{const {sim}=settled();run(sim,10,{lift:true});assert.equal(sim.gas,1);assert.ok(sim.infinite);const before=sim.body.velocity.y;run(sim,.5,{lift:true});assert.ok(sim.body.velocity.y>before);});
test('reset restores pose, velocity, fuel and measurement state',()=>{const {sim}=settled();run(sim,1,{forward:true,boost:true});sim.reset(2);assert.deepEqual(sim.body.position.toArray(),ZONES[2].position);assert.equal(sim.body.velocity.length(),0);assert.equal(sim.gas,1);assert.equal(sim.runTime,null);});
test('solid barriers stop the chassis instead of allowing it to pass through',()=>{const {world,sim}=settled();addBox(world,[10,5,2],[0,2.5,-15]);run(sim,3,{forward:true});assert.ok(sim.body.position.z<-17,`barrier crossing: ${sim.body.position.z}`);});
test('boost improves acceleration without consuming the unlimited supply',()=>{const a=settled().sim,b=settled().sim;run(a,1,{forward:true});run(b,1,{forward:true,boost:true});assert.ok(b.speed>a.speed*1.5);assert.equal(b.gas,1);});
test('brake has priority over boost when W and S are held together',()=>{const {sim}=settled();run(sim,1,{forward:true,boost:true});const before=sim.speed;run(sim,.5,{forward:true,back:true,boost:true});assert.equal(sim.thrusters.boost,0);assert.equal(sim.throttle,0);assert.ok(sim.speed<before-4);});
test('forward thrust can slow backward flight without tyre contact',()=>{const {sim}=settled();sim.body.position.y=20;sim.step(dt);sim.body.velocity.set(0,0,-10);run(sim,.2,{forward:true,boost:true});assert.equal(sim.grounded,0);assert.equal(sim.thrusters.boost,1);assert.ok(sim.body.velocity.z>-4);});
test('roll controls produce actual angular momentum in flight',()=>{const {sim}=settled();run(sim,.6,{lift:true});run(sim,.3,{rollLeft:true});assert.ok(Math.abs(sim.body.angularVelocity.z)>.2);});
test('infinite experiment mode still works after normal tank depletion',()=>{const {sim}=settled();sim.gas=0;sim.infinite=true;run(sim,.5,{lift:true});assert.ok(sim.body.velocity.y>3);});
test('ramp collision geometry is traversable and fan holds an inverted vehicle',()=>{const world=makeWorld();addCurvePhysics(world,{x:-65,z:75,radius:25,angle:Math.PI,width:14,segments:180});const sim=new VehicleSimulation(world);sim.reset(1);let maxHeight=0,inverted=false;for(let i=0;i<1800;i++){sim.step(dt,{forward:true});maxHeight=Math.max(maxHeight,sim.body.position.y);if(sim.body.quaternion.w*sim.body.quaternion.w+sim.body.quaternion.y*sim.body.quaternion.y<.2&&sim.grounded>1)inverted=true;}assert.ok(maxHeight>45,`reached only ${maxHeight}`);assert.ok(inverted,'never drove upside down');});
test('A and D turn the rendered nose left and right at every cardinal heading',()=>{
  for(const heading of [0,Math.PI/2,Math.PI,-Math.PI/2])for(const [key,screenSign] of [['left',-1],['right',1]]){
    const {world,sim}=settled();sim.body.quaternion.setFromEuler(0,heading,0);run(sim,2,{forward:true});
    const camera=new THREE.PerspectiveCamera(67,1.6,.18,4000),rig=new DrivingCamera(camera,world);
    rig.reset(sim.body.position,heading);run(sim,.8,{forward:true,[key]:true});
    const pose={position:new THREE.Vector3().copy(sim.body.position),quaternion:new THREE.Quaternion().copy(sim.body.quaternion)};
    rig.update(dt,pose);camera.updateMatrixWorld();
    const front=new THREE.Vector3(0,0,2).applyQuaternion(pose.quaternion).add(pose.position).project(camera);
    const rear=new THREE.Vector3(0,0,-2).applyQuaternion(pose.quaternion).add(pose.position).project(camera);
    assert.ok((front.x-rear.x)*screenSign>.06,`${key} has wrong SCREEN direction at heading ${heading}: ${front.x-rear.x}`);
    assert.ok(Math.abs(sim.body.angularVelocity.y)<1.3,'steering caused an abrupt spin');
  }
});
test('releasing W cuts engine torque immediately and coasting comes to rest',()=>{
  const {sim}=settled();run(sim,2,{forward:true});const before=sim.speed;
  sim.step(dt,{});assert.equal(sim.throttle,0);assert.ok(sim.vehicle.wheelInfos.every(w=>w.engineForce===0));
  run(sim,5);assert.ok(sim.speed<before*.6,`coasted from ${before} to ${sim.speed}`);
  run(sim,12);assert.ok(sim.speed<.05,`did not settle: ${sim.speed}`);assert.ok(sim.body.velocity.z>-.02,'coasting reversed the vehicle');
});
test('reverse coasting also slows without pushing the vehicle forward',()=>{
  const {sim}=settled();run(sim,2,{back:true});const before=sim.speed;assert.ok(sim.body.velocity.z<0);
  run(sim,2);assert.ok(sim.speed<before-.5);run(sim,6);assert.ok(sim.speed<.05);assert.ok(sim.body.velocity.z<.02);
});
test('air drag grows with speed but tyre regen never brakes an airborne car',()=>{
  const {sim}=settled();sim.body.position.y=100;sim.step(dt);sim.body.velocity.set(0,0,30);run(sim,1);
  assert.equal(sim.grounded,0);assert.ok(sim.body.velocity.z>29,'ground regen was applied in the air');assert.ok(sim.body.velocity.z<30);
  assert.ok(sim.body.velocity.y<-9,'gravity was damped away');
});
test('left roll and left yaw match the rendered vehicle orientation in flight',()=>{
  for(const action of ['rollLeft','left']){
    const {sim}=settled();sim.stabilize=false;run(sim,.7,{lift:true});run(sim,.3,{[action]:true});
    const up=sim.body.quaternion.vmult(new Vec3(0,1,0)),nose=sim.body.quaternion.vmult(new Vec3(0,0,1));
    assert.ok(action==='rollLeft'?up.x>.02:nose.x>.02,`${action} points screen-right`);
  }
});
test('braking stops before reverse; holding S then engages reverse',()=>{const {sim}=settled();run(sim,2,{forward:true});run(sim,1,{back:true});assert.ok(sim.body.velocity.z>0,'brake immediately engaged reverse');run(sim,2,{back:true});assert.ok(sim.body.velocity.z<0);});
test('air rotation is rate limited and releasing input brakes the spin',()=>{const {sim}=settled();sim.stabilize=false;run(sim,1,{lift:true});run(sim,2,{rollLeft:true,lift:true});assert.ok(sim.body.angularVelocity.length()<2.2);run(sim,.6,{});assert.ok(sim.body.angularVelocity.length()<.2);});
test('nose-up input actually points the nose above the horizon',()=>{const {sim}=settled();sim.stabilize=false;run(sim,1,{lift:true});run(sim,.6,{pitchUp:true});assert.ok(sim.body.quaternion.vmult(new Vec3(0,0,1)).y>.25);});
test('a solid wedge follows the same top coordinates at its entrance, middle and exit',()=>{const world=makeWorld();addWedge(world,wedgeData(14,25,ROAD_Y,ROAD_Y+5),0,100);for(const offset of [-12,0,12]){const expected=ROAD_Y+(offset+12.5)/25*5,result=new RaycastResult();assert.ok(world.raycastClosest(new Vec3(0,10,100+offset),new Vec3(0,-1,100+offset),{collisionFilterMask:1},result));assert.ok(Math.abs(result.hitPointWorld.y-expected)<1e-6);}});
