import * as THREE from 'three';

// A local cutaway only when the collision arm would enter the car. The road
// keeps its material everywhere outside the sight cone, including batched meshes.
export class CameraOcclusion {
  constructor(scene) {
    this.uniforms = {
      uCameraCutaway: {value: 0},
      uCameraCutawayTarget: {value: new THREE.Vector3()},
    };
    this.materials = new Set();
    scene.traverse(object => {
      if (!object.isMesh) return;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) {
        if (material.isMeshStandardMaterial || material.isMeshBasicMaterial) this.addMaterial(material);
      }
    });
  }

  addMaterial(material) {
    if (this.materials.has(material)) return;
    this.materials.add(material);
    const originalCompile = material.onBeforeCompile.bind(material);
    const originalKey = material.customProgramCacheKey();
    material.customProgramCacheKey = () => originalKey + '/camera-cutaway-v1';
    material.onBeforeCompile = shader => {
      originalCompile(shader);
      Object.assign(shader.uniforms, this.uniforms);
      shader.vertexShader = 'varying vec3 vCameraCutawayPosition;\n' + shader.vertexShader.replace(
        '#include <project_vertex>',
        '#include <project_vertex>\nvCameraCutawayPosition = mvPosition.xyz;',
      );
      shader.fragmentShader = `
        varying vec3 vCameraCutawayPosition;
        uniform float uCameraCutaway;
        uniform vec3 uCameraCutawayTarget;
      ` + shader.fragmentShader.replace('#include <clipping_planes_fragment>', `
        #include <clipping_planes_fragment>
        if (uCameraCutaway > 0.5) {
          float targetDistance = max(length(uCameraCutawayTarget), 0.001);
          vec3 axis = uCameraCutawayTarget / targetDistance;
          float along = dot(vCameraCutawayPosition, axis);
          if (along > 0.0 && along < targetDistance + 2.8) {
            float radius = 3.4 * along / targetDistance;
            float radial = length(vCameraCutawayPosition - axis * along);
            float cut = 1.0 - smoothstep(radius * 0.86, radius, radial);
            float screenNoise = fract(dot(gl_FragCoord.xy, vec2(0.75487766, 0.56984029)));
            if (screenNoise < cut) discard;
          }
        }
      `);
    };
    material.needsUpdate = true;
  }

  update(camera, target, active) {
    camera.updateMatrixWorld();
    this.uniforms.uCameraCutaway.value = active ? 1 : 0;
    this.uniforms.uCameraCutawayTarget.value.copy(target).applyMatrix4(camera.matrixWorldInverse);
  }
}
