import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {Heightfield} from 'cannon-es';
import {heightfieldRenderIndices} from '../src/physics.js';
test('rendered terrain triangles agree with the physics heightfield at off-grid points',()=>{const data=[[0,3,1],[1,0,4],[2,5,0]],heightfield=new Heightfield(data,{elementSize:1}),vertices=[];for(let z=0;z<3;z++)for(let x=0;x<3;x++)vertices.push(x-1,data[x][2-z],z-1);const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geometry.setIndex(heightfieldRenderIndices(2));geometry.computeVertexNormals();const mesh=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));mesh.updateMatrixWorld();const ray=new THREE.Raycaster();for(const x of [-.86,-.31,.28,.79])for(const z of [-.73,-.19,.37,.84]){ray.set(new THREE.Vector3(x,10,z),new THREE.Vector3(0,-1,0));const hit=ray.intersectObject(mesh)[0];assert.ok(hit);assert.ok(Math.abs(hit.point.y-heightfield.getHeightAt(x+1,1-z,true))<1e-7,`terrain mismatch at ${x},${z}`);}});
