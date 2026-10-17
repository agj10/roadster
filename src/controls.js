import {VEHICLE} from './vehicle-config.js';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const approach = (value, target, step) => value + clamp(target - value, -step, step);

export const DRIVING = Object.freeze({
  maxSteering: .5,
  steeringRate: 3.4,
  steeringReturnRate: 4.8,
  lateralAcceleration: 14,
  brakeDeceleration: 11.5,
  regenDeceleration: 1.7,
  rollingCoefficient: .015,
  reverseDelay: .3,
  reverseSpeed: 12,
});

export class DrivingControls {
  constructor() { this.reset(); }

  reset() {
    this.steer = 0;
    this.throttle = 0;
    this.reverseHold = 0;
    this.state = 'parked';
  }

  update(dt, input, signedSpeed, fan) {
    // With a +Z nose and +Y roof, +X is the driver's LEFT (right-handed axes).
    const turn = Number(!!input.left) - Number(!!input.right);
    const lateral = fan ? DRIVING.lateralAcceleration : 9;
    const limit = Math.min(DRIVING.maxSteering, Math.atan(VEHICLE.wheelbase * lateral / (signedSpeed ** 2 + 4)));
    this.steer = approach(this.steer, turn * limit, dt * (turn ? DRIVING.steeringRate : DRIVING.steeringReturnRate));
    this.steer = clamp(this.steer, -limit, limit);

    let target = 0, brake = 0;
    if (input.forward && input.back) {
      brake = 1;
      this.reverseHold = 0;
    } else if (input.forward) {
      if (signedSpeed < -.5) brake = 1;
      else target = 1;
      this.reverseHold = 0;
    } else if (input.back) {
      if (signedSpeed > .5) {
        brake = 1;
        this.reverseHold = 0;
      } else {
        this.reverseHold += dt;
        if (this.reverseHold >= DRIVING.reverseDelay) target = -.36 * clamp((DRIVING.reverseSpeed + signedSpeed) / 2, 0, 1);
        else if (this.reverseHold < DRIVING.reverseDelay) brake = 1;
      }
    } else this.reverseHold = 0;

    // Key release cuts motor torque immediately; only engagement has a short ramp.
    this.throttle = target === 0 ? 0 : approach(this.throttle, target, dt * 8);
    this.state = brake ? 'braking' : target < 0 ? 'reverse' : target > 0 ? 'forward' : Math.abs(signedSpeed) > .05 ? 'coasting' : 'parked';
    return {turn, steer: this.steer, throttle: this.throttle, brake};
  }
}
