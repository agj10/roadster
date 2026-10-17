import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {ColdGas} from '../src/gas.js';
import {makeWorld} from '../src/physics.js';
test('vapour spreads once on contact and does not gain unbounded speed on the ground',()=>{const effect=new ColdGas(new THREE.Scene(),makeWorld()),p=effect.particles[0],camera=new THREE.PerspectiveCamera();Object.assign(p,{life:5,age:0,seed:.3,size:.2,rotation:0,hasPlane:true,impacted:false});p.position.set(0,.05,0);p.velocity.set(0,-4,0);p.normal.set(0,1,0);p.plane.set(0,0,0);for(let i=0;i<120;i++)effect.update(1/120,{},null,camera,false);assert.ok(p.impacted);assert.ok(p.velocity.length()<6);assert.ok(p.position.y>=.099);});
test('expired vapour leaves no live instances or invalid alpha values',()=>{const effect=new ColdGas(new THREE.Scene(),makeWorld()),p=effect.particles[0],camera=new THREE.PerspectiveCamera();Object.assign(p,{life:.01,age:0,size:.2,seed:.3,rotation:0});effect.update(.05,{},null,camera,false);assert.ok(Array.from(effect.attributes.opacity.array).every(Number.isFinite));effect.update(.05,{},null,camera,false);assert.equal(effect.mesh.geometry.instanceCount,0);});
