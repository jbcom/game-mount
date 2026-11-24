import { clamp, wrapAngle } from "./math.js";
import { screenToGround } from "./pose.js";
import { clampState } from "./state.js";
import type { GroundCameraLimits, GroundCameraState, ScreenPoint, Viewport } from "./types.js";

/**
 * Moves `after` so the ground that `before` showed at `anchor` is back under it. On flat ground
 * (no terrain lift of the eye) the correction is exact. Above the horizon there is nothing to hold.
 */
function holdAnchor(
  before: GroundCameraState,
  after: GroundCameraState,
  limits: GroundCameraLimits,
  viewport: Viewport,
  anchor: ScreenPoint
): GroundCameraState {
  const was = screenToGround(before, limits, viewport, anchor.x, anchor.y);
  const now = screenToGround(after, limits, viewport, anchor.x, anchor.y);
  if (was === null || now === null) return clampState(after, limits);
  return clampState({ ...after, x: after.x + was.x - now.x, z: after.z + was.z - now.z }, limits);
}

/**
 * Drags the ground so the point under pixel `from` ends up under pixel `to`: a finger keeps hold of
 * the ground it touched, at any zoom, tilt or yaw. The result is clamped to the limits, so a drag
 * against a boundary slides along it. A pixel at or above the horizon cannot hold ground, so the
 * state is returned (clamped) unchanged.
 */
export function dragGround(
  state: GroundCameraState,
  limits: GroundCameraLimits,
  viewport: Viewport,
  from: ScreenPoint,
  to: ScreenPoint
): GroundCameraState {
  const base = clampState(state, limits);
  const grabbed = screenToGround(base, limits, viewport, from.x, from.y);
  const under = screenToGround(base, limits, viewport, to.x, to.y);
  if (grabbed === null || under === null) return base;
  return clampState(
    { ...base, x: base.x + grabbed.x - under.x, z: base.z + grabbed.z - under.z },
    limits
  );
}

/**
 * Pans as if a finger at the centre of the screen moved by (`dxPixels`, `dyPixels`): the ground
 * follows the finger, so a positive `dxPixels` moves the camera toward the left of the screen.
 */
export function panByPixels(
  state: GroundCameraState,
  limits: GroundCameraLimits,
  viewport: Viewport,
  dxPixels: number,
  dyPixels: number
): GroundCameraState {
  const centre = { x: viewport.width / 2, y: viewport.height / 2 };
  return dragGround(state, limits, viewport, centre, {
    x: centre.x + dxPixels,
    y: centre.y + dyPixels,
  });
}

/**
 * Multiplies the span by `factor` (above 1 zooms out, below 1 zooms in), held between the span
 * limits. With an `anchor` pixel the ground under it stays under it, so a pinch or wheel zooms
 * toward the pointer; without one the zoom is about the centre of the screen. Throws a RangeError
 * unless `factor` is positive and finite.
 */
export function zoomBy(
  state: GroundCameraState,
  limits: GroundCameraLimits,
  viewport: Viewport,
  factor: number,
  anchor?: ScreenPoint
): GroundCameraState {
  if (!(Number.isFinite(factor) && factor > 0)) {
    throw new RangeError("zoom factor must be a positive finite number");
  }
  const base = clampState(state, limits);
  const zoomed = { ...base, span: clamp(base.span * factor, limits.minSpan, limits.maxSpan) };
  return anchor === undefined
    ? clampState(zoomed, limits)
    : holdAnchor(base, zoomed, limits, viewport, anchor);
}

/**
 * Turns the camera by `deltaYaw` radians (positive is clockwise seen from above), keeping the yaw
 * in (−π, π]. With an `anchor` pixel the ground under it stays under it, so a two-finger twist
 * turns about the fingers; without one the turn is about the centre of the screen.
 */
export function rotateBy(
  state: GroundCameraState,
  limits: GroundCameraLimits,
  viewport: Viewport,
  deltaYaw: number,
  anchor?: ScreenPoint
): GroundCameraState {
  const base = clampState(state, limits);
  const turned = { ...base, yaw: wrapAngle(base.yaw + deltaYaw) };
  return anchor === undefined ? turned : holdAnchor(base, turned, limits, viewport, anchor);
}
