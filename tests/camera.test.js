import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {DrivingCamera,CAMERA} from '../src/camera.js';
import {makeWorld,addBox} from '../src/physics.js';

function setup(heading=0){
  const camera=new THREE.PerspectiveCamera(CAMERA.fov,1.6,.18,4000),world=makeWorld();
  const rig=new DrivingCamera(camera,world);
  const pose={position:new THREE.Vector3(0,1,0),quaternion:new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),heading)};
  rig.reset(pose.position,heading);rig.update(1/60,pose);camera.updateMatrixWorld();
  return {camera,world,rig,pose};
}

test('rear view is behind the nose at every cardinal vehicle heading',()=>{
  for(const heading of [0,Math.PI/2,Math.PI,-Math.PI/2]){
    const {camera,rig,pose}=setup(heading),forward=new THREE.Vector3(0,0,1).applyQuaternion(pose.quaternion);
    assert.ok(camera.position.clone().sub(rig.target).dot(forward)<-10);
    const driverRight=forward.clone().cross(new THREE.Vector3(0,1,0));
    const projected=rig.target.clone().add(driverRight).project(camera);
    assert.ok(projected.x>0,'driver-right must appear on screen-right at heading '+heading);
  }
});

test('mouse displacement produces the same immediate view at 30 and 120 Hz',()=>{
  function drag(hz){const {camera,rig,pose}=setup();for(let i=0;i<hz;i++){rig.rotate(240/hz,60/hz);rig.update(1/hz,pose);}return {rig,camera};}
  const a=drag(30),b=drag(120);
  assert.ok(Math.abs(a.rig.yaw+240*CAMERA.radiansPerPixel)<1e-12);
  assert.ok(a.camera.position.distanceTo(b.camera.position)<1e-10);
  const before=a.camera.position.clone();a.rig.update(1/60,setup().pose);
  assert.ok(a.camera.position.distanceTo(before)<1e-10,'camera kept drifting after mouse release');
});

test('dragging right turns the view to the right and sensitivity scales pixels',()=>{
  const {camera,rig,pose}=setup(),right=new THREE.Vector3(-1,0,0);
  rig.rotate(100,0);rig.update(1/60,pose);
  assert.ok(camera.getWorldDirection(new THREE.Vector3()).dot(right)>.2);
  rig.sensitivity=2;const before=rig.yaw;rig.rotate(100,0);
  assert.ok(Math.abs(rig.yaw-before+200*CAMERA.radiansPerPixel)<1e-12);
});

test('classic orbit retains its world angle, zoom and FOV while following a turning car',()=>{
  const {camera,rig,pose}=setup();rig.rotate(70,25);
  const yaw=rig.yaw,pitch=rig.pitch;
  pose.position.set(80,15,120);pose.quaternion.setFromAxisAngle(new THREE.Vector3(0,1,0),2);
  for(let i=0;i<600;i++)rig.update(1/60,pose,{moving:true,grounded:true,speed:100});
  assert.equal(rig.yaw,yaw);assert.equal(rig.pitch,pitch);assert.equal(camera.fov,CAMERA.fov);
  assert.ok(Math.abs(camera.position.distanceTo(rig.target)-rig.zoom)<1e-10);
  assert.deepEqual(rig.target.toArray(),[80,15.35,120]);
  rig.recenter();rig.update(1/60,pose);
  assert.ok(Math.abs(rig.yaw-2)<1e-12);
  assert.ok(camera.position.clone().sub(rig.target).dot(new THREE.Vector3(0,0,1).applyQuaternion(pose.quaternion))<0);
});

test('camera avoids walls without changing the chosen mouse angle or zoom',()=>{
  const {camera,world,rig,pose}=setup(),wall=addBox(world,[8,8,1],[0,4,-5]);
  rig.update(1/60,pose);assert.ok(rig.obstructed);assert.ok(camera.position.z>-4.5);
  const yaw=rig.yaw,zoom=rig.zoom;world.removeBody(wall);rig.update(1/60,pose);
  assert.equal(rig.yaw,yaw);assert.equal(rig.zoom,zoom);assert.equal(rig.armLength,zoom);
});

test('inverted car cannot roll or rotate the classic camera on its own',()=>{
  const {camera,rig,pose}=setup();pose.position.y=40;pose.quaternion.setFromAxisAngle(new THREE.Vector3(1,0,0),Math.PI);
  rig.rotate(60,20);const yaw=rig.yaw,pitch=rig.pitch;
  for(let i=0;i<120;i++)rig.update(1/60,pose);
  assert.equal(rig.yaw,yaw);assert.equal(rig.pitch,pitch);assert.equal(camera.up.y,1);
  assert.ok(camera.position.toArray().every(Number.isFinite));
});

test('an inverted ceiling cannot push the camera inside the chassis or rotate the view',()=>{
  const {camera,world,rig,pose}=setup();
  pose.position.y=49.5;pose.quaternion.setFromAxisAngle(new THREE.Vector3(1,0,0),Math.PI);
  const ceiling=addBox(world,[30,.5,30],[0,50.3,0]);
  rig.update(1/60,pose);assert.ok(rig.cutaway);assert.equal(rig.armLength,rig.zoom);
  assert.equal(rig.yaw,0);assert.equal(rig.pitch,CAMERA.defaultPitch);
  assert.ok(camera.position.distanceTo(pose.position)>10,'camera is inside the car');
  world.removeBody(ceiling);rig.update(1/60,pose);assert.equal(rig.cutaway,false);
});
