import { clamp } from "./math.js";
import { clampState } from "./state.js";
import type {
  GroundCameraLimits,
  GroundCameraPose,
  GroundCameraState,
  GroundPoint,
  Viewport,
} from "./types.js";

/** Where `span` sits between the closest (0) and farthest (1) zoom, geometrically. */
function spanFraction(limits: GroundCameraLimits, span: number): number {
  const ratio = limits.maxSpan / limits.minSpan;
  if (ratio === 1) return 0;
  return clamp(Math.log(span / limits.minSpan) / Math.log(ratio), 0, 1);
}

/**
 * The pitch below horizontal, in radians, at `span`: the fixed pitch, or the range's two ends
 * joined by a smoothstep over the geometric zoom range so the tilt changes gently near both ends.
 * Throws a RangeError unless the pitch is strictly between 0 and π/2.
 */
export function pitchFor(limits: GroundCameraLimits, span: number): number {
  const { pitch } = limits;
  let value: number;
  if (typeof pitch === "number") {
    value = pitch;
  } else {
    const t = spanFraction(limits, span);
    value = pitch.atMinSpan + (pitch.atMaxSpan - pitch.atMinSpan) * (t * t * (3 - 2 * t));
  }
  if (!(value > 0 && value < Math.PI / 2)) {
    throw new RangeError("pitch must be strictly between 0 and π/2 radians");
  }
  return value;
}

/**
 * Eye-to-target distance that shows `span` world units of ground across the short side of the
 * screen. The ground the screen shows is measured at the target. Across the screen's width that is
 * exactly `2 · distance · tan(fov / 2) · aspect`. Down its height the tilt stretches the ground by
 * `1 / sin(pitch)`, giving `2 · distance · tan(fov / 2) / sin(pitch)` at the target's scale. The
 * smaller of the two is the short axis of the visible ground. It is continuous in the aspect, so a
 * device that unfolds to a near-square screen does not jump.
 */
function distanceFor(
  limits: GroundCameraLimits,
  span: number,
  pitch: number,
  aspect: number
): number {
  const tanHalfFov = Math.tan(limits.fov / 2);
  return span / (2 * Math.min(tanHalfFov * aspect, tanHalfFov / Math.sin(pitch)));
}

/**
 * The camera pose for a state at a screen aspect (width over height). The state is clamped to the
 * limits first. Throws a RangeError for an unusable aspect, field of view, pitch or span limits.
 *
 * Yaw 0 looks toward −z from a point on the +z side of the target. With `limits.terrain` the
 * target sits on the ground's height there and the eye is lifted if needed to keep the terrain's
 * clearance above the ground beneath it.
 */
export function poseFor(
  state: GroundCameraState,
  limits: GroundCameraLimits,
  aspect: number
): GroundCameraPose {
  if (!(Number.isFinite(aspect) && aspect > 0)) {
    throw new RangeError("aspect must be a positive finite number");
  }
  if (!(limits.fov > 0 && limits.fov < Math.PI)) {
    throw new RangeError("fov must be strictly between 0 and π radians");
  }
  const { x: targetX, z: targetZ, span, yaw } = clampState(state, limits);
  const pitch = pitchFor(limits, span);
  const distance = distanceFor(limits, span, pitch, aspect);
  const { terrain } = limits;
  const targetY = terrain ? terrain.height(targetX, targetZ) : 0;
  const horizontal = Math.cos(pitch) * distance;
  const x = targetX - Math.sin(yaw) * horizontal;
  const z = targetZ + Math.cos(yaw) * horizontal;
  const naturalY = targetY + Math.sin(pitch) * distance;
  const y = terrain ? Math.max(naturalY, terrain.height(x, z) + terrain.clearance) : naturalY;
  return {
    position: [x, y, z],
    target: [targetX, targetY, targetZ],
    fov: limits.fov,
    pitch,
    distance,
  };
}

/**
 * The ground point seen through a screen pixel, on the plane of the target, or null when the pixel
 * looks at or above the horizon. It casts the ray from the pose `poseFor` returns, so it matches
 * what is drawn, including a terrain lift of the eye. The ground is treated as flat at the target's
 * height, which is exact for flat ground.
 */
export function screenToGround(
  state: GroundCameraState,
  limits: GroundCameraLimits,
  viewport: Viewport,
  pixelX: number,
  pixelY: number
): GroundPoint | null {
  const clamped = clampState(state, limits);
  const pose = poseFor(clamped, limits, viewport.width / viewport.height);
  const [eyeX, eyeY, eyeZ] = pose.position;
  const [targetX, targetY, targetZ] = pose.target;
  // The camera basis: forward along the eye-to-target line, right level and fixed by the yaw,
  // up = right × forward.
  const length = Math.hypot(targetX - eyeX, targetY - eyeY, targetZ - eyeZ);
  const forwardX = (targetX - eyeX) / length;
  const forwardY = (targetY - eyeY) / length;
  const forwardZ = (targetZ - eyeZ) / length;
  const rightX = Math.cos(clamped.yaw);
  const rightZ = Math.sin(clamped.yaw);
  const upX = -rightZ * forwardY;
  const upY = rightZ * forwardX - rightX * forwardZ;
  const upZ = rightX * forwardY;
  const tanV = Math.tan(pose.fov / 2);
  const tanH = tanV * (viewport.width / viewport.height);
  const ndcX = (pixelX / viewport.width) * 2 - 1;
  const ndcY = 1 - (pixelY / viewport.height) * 2;
  const rayX = forwardX + ndcX * tanH * rightX + ndcY * tanV * upX;
  const rayY = forwardY + ndcY * tanV * upY;
  const rayZ = forwardZ + ndcX * tanH * rightZ + ndcY * tanV * upZ;
  if (rayY >= 0) return null;
  const t = (targetY - eyeY) / rayY;
  return { x: eyeX + rayX * t, z: eyeZ + rayZ * t };
}
