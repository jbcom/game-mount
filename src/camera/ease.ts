import { wrapAngle } from "./math.js";
import type { GroundCameraState } from "./types.js";

/** Seconds for an eased camera to close about 63 % of the gap to its goal. */
export const DEFAULT_SMOOTHING = 0.12;

/**
 * One frame of exponential easing from `current` toward `goal`, independent of the frame rate: two
 * steps of `dt / 2` land exactly where one step of `dt` does. The target eases linearly, the span
 * geometrically (so zoom steps feel even) and the yaw along the shorter arc. `smoothing` is the
 * time constant in seconds; zero or less returns `goal`. A zero, negative or NaN `deltaSeconds`
 * returns `current`. The result never overshoots. Clamp it to the limits if the goal moves.
 */
export function easeToward(
  current: GroundCameraState,
  goal: GroundCameraState,
  deltaSeconds: number,
  smoothing: number = DEFAULT_SMOOTHING
): GroundCameraState {
  if (!(deltaSeconds > 0)) return current;
  if (!(smoothing > 0)) return goal;
  const k = 1 - Math.exp(-deltaSeconds / smoothing);
  return {
    x: current.x + (goal.x - current.x) * k,
    z: current.z + (goal.z - current.z) * k,
    span: current.span * (goal.span / current.span) ** k,
    yaw: wrapAngle(current.yaw + wrapAngle(goal.yaw - current.yaw) * k),
  };
}
