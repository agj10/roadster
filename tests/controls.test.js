import test from 'node:test';
import assert from 'node:assert/strict';
import {DrivingControls} from '../src/controls.js';

test('opposite direction keys cancel steering and W + S brakes immediately',()=>{
  const controls=new DrivingControls();
  for(let i=0;i<60;i++)controls.update(1/120,{forward:true,left:true},15,true);
  let command;
  for(let i=0;i<30;i++)command=controls.update(1/120,{forward:true,back:true,left:true,right:true},15,true);
  assert.equal(command.steer,0);assert.equal(command.throttle,0);assert.equal(command.brake,1);
});

test('steering centres promptly on release and limits angle as road speed rises',()=>{
  const controls=new DrivingControls();
  for(let i=0;i<60;i++)controls.update(1/120,{left:true},0,true);
  const low=controls.steer;
  controls.update(1/120,{left:true},40,true);
  assert.ok(Math.abs(controls.steer)<low*.1);
  for(let i=0;i<24;i++)controls.update(1/120,{},40,true);
  assert.equal(controls.steer,0);
});
