import * as THREE from 'three';
import {Vec3,RaycastResult} from 'cannon-es';

export const shortestAngle=(from,to)=>Math.atan2(Math.sin(to-from),Math.cos(to-from));
export function dampScalar(current,target,velocity,omega,dt){
  const error=current-target,j=velocity+omega*error,e=Math.exp(-omega*dt);
  return [target+(error+j*dt)*e,(velocity-omega*j*dt)*e];
}

// World-up orbital spring arm: input owns azimuth during orbit, the chase rig
// recentres only after input has stopped and the car is driving on level ground.
export class DrivingCamera {
  constructor(camera,world){
    this.camera=camera;this.world=world;this.mode=0;this.distance=12;this.zoom=12;this.yaw=.48;this.smoothedYaw=.48;this.pitch=.22;this.smoothedPitch=.22;this.elevation=.22;this.heading=0;this.idle=0;this.dragging=false;this.follow=true;this.sensitivity=1;this.target=new THREE.Vector3();this.targetVelocity=new THREE.Vector3();this.initialized=false;this.armLength=12;this.obstructed=false;
    this.ray=new RaycastResult();this.from=new Vec3();this.to=new Vec3();this.pointers=new Map();this.contextMenusPrevented=0;
  }
  bind(canvas){
    this.canvas=canvas;
    canvas.addEventListener('contextmenu',event=>{event.preventDefault();this.contextMenusPrevented++;});
    canvas.addEventListener('wheel',event=>{event.preventDefault();this.zoom=THREE.MathUtils.clamp(this.zoom*Math.exp(event.deltaY*(event.deltaMode===1?.025:.0012)),4.2,100);this.idle=0;},{passive:false});
    canvas.addEventListener('pointerdown',event=>{
      if(event.pointerType!=='touch'&&event.button!==0&&event.button!==2)return;
      event.preventDefault();canvas.focus({preventScroll:true});canvas.setPointerCapture(event.pointerId);this.pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});this.dragging=true;this.idle=0;if(this.mode===1)this.mode=0;canvas.classList.add('orbiting');
    });
    canvas.addEventListener('pointermove',event=>{
      const old=this.pointers.get(event.pointerId);if(!old)return;
      const next={x:event.clientX,y:event.clientY};
      if(this.pointers.size===2){const other=[...this.pointers.entries()].find(([id])=>id!==event.pointerId)[1];const before=Math.hypot(old.x-other.x,old.y-other.y),after=Math.hypot(next.x-other.x,next.y-other.y);if(after>1)this.zoom=THREE.MathUtils.clamp(this.zoom*before/after,4.2,100);}
      else {this.yaw-=(next.x-old.x)*.005*this.sensitivity;this.pitch=THREE.MathUtils.clamp(this.pitch+(next.y-old.y)*.004*this.sensitivity,-.12,1.25);}
      this.pointers.set(event.pointerId,next);this.idle=0;
    });
    const release=event=>{this.pointers.delete(event.pointerId);this.dragging=this.pointers.size>0;this.idle=0;if(!this.dragging)canvas.classList.remove('orbiting');};
    for(const type of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(type,release);
  }
  cancelDrag(){for(const id of [...this.pointers.keys()])if(this.canvas?.hasPointerCapture(id))this.canvas.releasePointerCapture(id);this.pointers.clear();this.dragging=false;this.canvas?.classList.remove('orbiting');}
  recenter(){this.yaw=this.heading;this.pitch=.22;this.idle=0;}
  reset(position,heading=0){this.cancelDrag();this.heading=heading;this.yaw=heading+.38;this.smoothedYaw=this.yaw;this.pitch=this.smoothedPitch=this.elevation=.22;this.target.set(position.x,position.y+.27,position.z);this.targetVelocity.set(0,0,0);this.distance=this.armLength=this.zoom;this.initialized=false;this.idle=0;}
  update(dt,pose,{moving=false,grounded=false,speed=0,velocity=null,snap=false}={}){
    const position=pose.position,rotation=pose.quaternion,up=new THREE.Vector3(0,1,0).applyQuaternion(rotation),forward=new THREE.Vector3(0,0,1).applyQuaternion(rotation);
    if(grounded&&up.y>.55&&Math.hypot(forward.x,forward.z)>.45)this.heading=Math.atan2(forward.x,forward.z);
    if(!this.dragging)this.idle+=dt;
    if(this.mode===0&&this.follow&&moving&&grounded&&up.y>.55&&this.idle>2.25){this.yaw+=shortestAngle(this.yaw,this.heading)*(1-Math.exp(-dt*1.5));}
    this.smoothedYaw+=shortestAngle(this.smoothedYaw,this.yaw)*(snap?1:1-Math.exp(-dt*24));this.smoothedPitch=THREE.MathUtils.lerp(this.smoothedPitch,this.pitch,snap?1:1-Math.exp(-dt*24));this.distance=THREE.MathUtils.lerp(this.distance,this.zoom,snap?1:1-Math.exp(-dt*10));
    const desiredTarget=new THREE.Vector3(position.x,position.y,position.z).addScaledVector(up,.27);
    if(velocity)desiredTarget.add(new THREE.Vector3(velocity.x,0,velocity.z).multiplyScalar(.045).clampLength(0,3));
    if(snap||!this.initialized){this.target.copy(desiredTarget);this.targetVelocity.set(0,0,0);}else for(const axis of ['x','y','z'])[this.target[axis],this.targetVelocity[axis]]=dampScalar(this.target[axis],desiredTarget[axis],this.targetVelocity[axis],32,dt);
    const camera=this.camera;
    if(this.mode===1){camera.position.copy(position).add(new THREE.Vector3(0,.55,1.75).applyQuaternion(rotation));camera.up.copy(up);camera.lookAt(new THREE.Vector3().copy(camera.position).addScaledVector(forward,20));camera.fov=72;this.initialized=true;camera.updateProjectionMatrix();return;}
    // Orbit input is applied to spherical coordinates, independently of car yaw.
    const desiredElevation=grounded&&up.y<-.2&&!this.dragging?-Math.abs(this.smoothedPitch)-.08:this.smoothedPitch;
    this.elevation=THREE.MathUtils.lerp(this.elevation,desiredElevation,snap?1:1-Math.exp(-dt*9));
    const horizontal=Math.cos(this.elevation),direction=new THREE.Vector3(Math.sin(this.smoothedYaw)*horizontal,Math.sin(this.elevation),-Math.cos(this.smoothedYaw)*horizontal);
    const wantedLength=this.distance+Math.min(speed*.025,2),goal=this.target.clone().addScaledVector(direction,wantedLength);
    let allowed=wantedLength;const offsets=[[0,0,0],[.22,0,0],[-.22,0,0],[0,.22,0],[0,-.22,0]];
    for(const offset of offsets){this.from.set(this.target.x+offset[0],this.target.y+offset[1],this.target.z+offset[2]);this.to.set(goal.x+offset[0],goal.y+offset[1],goal.z+offset[2]);this.ray.reset();if(this.world.raycastClosest(this.from,this.to,{collisionFilterMask:1,skipBackfaces:false},this.ray))allowed=Math.min(allowed,Math.max(.75,this.ray.distance-.32));}
    this.obstructed=allowed<wantedLength-.05;
    // Retract immediately on collision; extend gently after clearing the obstacle.
    this.armLength=allowed<this.armLength?allowed:THREE.MathUtils.lerp(this.armLength,allowed,snap?1:1-Math.exp(-dt*5));
    if(snap)this.armLength=allowed;
    camera.position.copy(this.target).addScaledVector(direction,this.armLength);camera.up.set(0,1,0);camera.lookAt(this.target);camera.fov=THREE.MathUtils.lerp(camera.fov,67+Math.min(speed*.035,4),snap?1:1-Math.exp(-dt*3));camera.updateProjectionMatrix();this.initialized=true;
  }
  diagnostics(){return {mode:this.mode,yaw:this.yaw,pitch:this.pitch,zoom:this.zoom,distance:this.armLength,dragging:this.dragging,follow:this.follow,obstructed:this.obstructed,contextMenusPrevented:this.contextMenusPrevented,position:this.camera.position.toArray()};}
}
