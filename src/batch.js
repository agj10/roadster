import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
// Static geometry is baked in parent coordinates, retaining material and shadows.
export function batchStatic(parent,exclude=()=>false){
  // Split grouped materials once, then batch all road tops and retaining walls.
  for(const child of [...parent.children]){
    if(!child.isMesh||!Array.isArray(child.material)||exclude(child))continue;
    const source=child.geometry.index?child.geometry.toNonIndexed():child.geometry;
    for(const group of source.groups){
      const geometry=new THREE.BufferGeometry();
      for(const [name,attribute] of Object.entries(source.attributes))geometry.setAttribute(name,new THREE.BufferAttribute(attribute.array.slice(group.start*attribute.itemSize,(group.start+group.count)*attribute.itemSize),attribute.itemSize,attribute.normalized));
      const part=new THREE.Mesh(geometry,child.material[group.materialIndex]);part.position.copy(child.position);part.quaternion.copy(child.quaternion);part.scale.copy(child.scale);part.castShadow=child.castShadow;part.receiveShadow=child.receiveShadow;parent.add(part);
    }
    parent.remove(child);if(source!==child.geometry)source.dispose();
  }
  const groups=new Map();
  for(const child of [...parent.children]){
    if(!child.isMesh||child.isInstancedMesh||Array.isArray(child.material)||exclude(child))continue;
    const key=child.material.id+'/'+Object.keys(child.geometry.attributes).sort().join(',')+'/'+Boolean(child.geometry.index);let group=groups.get(key);if(!group){group={material:child.material,meshes:[]};groups.set(key,group);}group.meshes.push(child);
  }
  for(const {material,meshes} of groups.values()){
    if(meshes.length<2)continue;
    const geometries=meshes.map(m=>{m.updateMatrix();return m.geometry.clone().applyMatrix4(m.matrix);});
    const merged=mergeGeometries(geometries,false);geometries.forEach(g=>g.dispose());if(!merged)continue;
    const result=new THREE.Mesh(merged,material);result.castShadow=meshes.some(m=>m.castShadow);result.receiveShadow=meshes.some(m=>m.receiveShadow);parent.add(result);meshes.forEach(m=>parent.remove(m));
  }
}
