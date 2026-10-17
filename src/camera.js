import * as THREE from 'three';
import {Vec3, RaycastResult} from 'cannon-es';

export const CAMERA = Object.freeze({
  radiansPerPixel: .0035,
  defaultPitch: .26,
  defaultDistance: 14,
  minPitch: -1.35,
  maxPitch: 1.42,
  minDistance: 4.2,
  maxDistance: 100,
  fov: 67,
});

// Classic orbit: follow translation, retain the player's world-space rotation.
// A pointer delta changes the angle directly, without a spring or frame scaling.
export class DrivingCamera {
  constructor(camera, world) {
    this.camera = camera;
    this.world = world;
    this.mode = 0;
    this.zoom = this.armLength = CAMERA.defaultDistance;
    this.yaw = this.heading = 0;
    this.pitch = CAMERA.defaultPitch;
    this.sensitivity = 1;
    this.dragging = false;
    this.obstructed = false;
    this.cutaway = false;
    this.target = new THREE.Vector3();
    this.pointers = new Map();
    this.contextMenusPrevented = 0;
    this.ray = new RaycastResult();
    this.from = new Vec3();
    this.to = new Vec3();
  }

  rotate(deltaX, deltaY) {
    // +Z is the nose. Viewed from behind, world -X is screen-right.
    this.yaw -= deltaX * CAMERA.radiansPerPixel * this.sensitivity;
    this.pitch = THREE.MathUtils.clamp(
      this.pitch + deltaY * CAMERA.radiansPerPixel * this.sensitivity,
      CAMERA.minPitch, CAMERA.maxPitch,
    );
  }

  changeZoom(delta) {
    this.zoom = THREE.MathUtils.clamp(this.zoom * Math.exp(delta), CAMERA.minDistance, CAMERA.maxDistance);
  }

  bind(canvas) {
    this.canvas = canvas;
    canvas.addEventListener('contextmenu', event => {
      event.preventDefault();
      this.contextMenusPrevented++;
    });
    canvas.addEventListener('wheel', event => {
      event.preventDefault();
      this.mode = 0;
      this.changeZoom(event.deltaY * (event.deltaMode === 1 ? .025 : .0012));
    }, {passive: false});
    canvas.addEventListener('pointerdown', event => {
      if (event.pointerType !== 'touch' && event.button !== 2) return;
      event.preventDefault();
      canvas.focus({preventScroll: true});
      canvas.setPointerCapture(event.pointerId);
      this.pointers.set(event.pointerId, {x: event.clientX, y: event.clientY});
      this.dragging = true;
      this.mode = 0;
      canvas.classList.add('orbiting');
    });
    canvas.addEventListener('pointermove', event => {
      const old = this.pointers.get(event.pointerId);
      if (!old) return;
      const next = {x: event.clientX, y: event.clientY};
      if (this.pointers.size === 2) {
        const other = [...this.pointers.entries()].find(([id]) => id !== event.pointerId)[1];
        const before = Math.hypot(old.x - other.x, old.y - other.y);
        const after = Math.hypot(next.x - other.x, next.y - other.y);
        if (before > 1 && after > 1) this.changeZoom(Math.log(before / after));
      } else {
        this.rotate(next.x - old.x, next.y - old.y);
      }
      this.pointers.set(event.pointerId, next);
    });
    const release = event => {
      this.pointers.delete(event.pointerId);
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
      this.dragging = this.pointers.size > 0;
      if (!this.dragging) canvas.classList.remove('orbiting');
    };
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) canvas.addEventListener(type, release);
  }

  cancelDrag() {
    const ids = [...this.pointers.keys()];
    this.pointers.clear();
    this.dragging = false;
    for (const id of ids) if (this.canvas?.hasPointerCapture(id)) this.canvas.releasePointerCapture(id);
    this.canvas?.classList.remove('orbiting');
  }

  recenter() {
    this.mode = 0;
    this.yaw = this.heading;
    this.pitch = CAMERA.defaultPitch;
  }

  reset(position, heading = 0) {
    this.cancelDrag();
    this.heading = heading;
    this.recenter();
    this.target.set(position.x, position.y + .35, position.z);
    this.armLength = this.zoom;
    this.cutaway = false;
  }

  update(_dt, pose) {
    const {position, quaternion} = pose;
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(quaternion);
    const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(quaternion);
    if (Math.hypot(forward.x, forward.z) > .1) this.heading = Math.atan2(forward.x, forward.z);
    const camera = this.camera;
    camera.fov = CAMERA.fov;
    camera.updateProjectionMatrix();
    if (this.mode === 1) {
      this.cutaway = false;
      camera.position.copy(position).add(new THREE.Vector3(0, .55, 1.75).applyQuaternion(quaternion));
      camera.up.copy(up);
      camera.lookAt(camera.position.clone().add(forward));
      return;
    }

    this.target.set(position.x, position.y + .35, position.z);
    const horizontal = Math.cos(this.pitch);
    const direction = new THREE.Vector3(
      -Math.sin(this.yaw) * horizontal,
      Math.sin(this.pitch),
      -Math.cos(this.yaw) * horizontal,
    );
    const goal = this.target.clone().addScaledVector(direction, this.zoom);
    let allowed = this.zoom;
    // A small bundle of rays protects the near plane, including at road edges.
    for (const [x, y, z] of [[0, 0, 0], [.22, 0, 0], [-.22, 0, 0], [0, .22, 0], [0, -.22, 0]]) {
      this.from.set(this.target.x + x, this.target.y + y, this.target.z + z);
      this.to.set(goal.x + x, goal.y + y, goal.z + z);
      this.ray.reset();
      if (this.world.raycastClosest(this.from, this.to, {collisionFilterMask: 1, skipBackfaces: false}, this.ray)) {
        allowed = Math.min(allowed, Math.max(.35, this.ray.distance - .32));
      }
    }
    this.obstructed = allowed < this.zoom - .05;
    // Keep the manual view usable under an inverted road instead of putting
    // the lens inside the chassis. The environment opens a local sight window.
    this.cutaway = this.obstructed && (allowed < CAMERA.minDistance || this.cutaway);
    this.armLength = this.cutaway ? this.zoom : allowed;
    camera.position.copy(this.target).addScaledVector(direction, this.armLength);
    camera.up.set(0, 1, 0);
    camera.lookAt(this.target);
  }

  diagnostics() {
    return {
      mode: this.mode, yaw: this.yaw, pitch: this.pitch, heading: this.heading,
      zoom: this.zoom, distance: this.armLength, dragging: this.dragging,
      obstructed: this.obstructed, cutaway: this.cutaway, contextMenusPrevented: this.contextMenusPrevented,
      position: this.camera.position.toArray(), target: this.target.toArray(), fov: this.camera.fov,
    };
  }
}
