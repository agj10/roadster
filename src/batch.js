import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
// Static geometry is baked in parent coordinates, retaining material and shadows.
export function batchStatic(parent,exclude=()=>false){
  const groups=new Map();
  for(const child of [...parent.children]){
    if(!child.isMesh||child.isInstancedMesh||Array.isArray(child.material)||exclude(child))continue;
    const key=child.material.id+'/'+Object.keys(child.geometry.attributes).sort().join(',');let group=groups.get(key);if(!group){group={material:child.material,meshes:[]};groups.set(key,group);}group.meshes.push(child);
  }
  for(const {material,meshes} of groups.values()){
    if(meshes.length<2)continue;
    const geometries=meshes.map(m=>{m.updateMatrix();return m.geometry.clone().applyMatrix4(m.matrix);});
    const merged=mergeGeometries(geometries,false);geometries.forEach(g=>g.dispose());if(!merged)continue;
    const result=new THREE.Mesh(merged,material);result.castShadow=meshes.some(m=>m.castShadow);result.receiveShadow=meshes.some(m=>m.receiveShadow);parent.add(result);meshes.forEach(m=>parent.remove(m));
  }
}
