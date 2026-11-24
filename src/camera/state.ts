import { clampToBounds } from "./bounds.js";
import { clamp } from "./math.js";
import type { GroundCameraLimits, GroundCameraState } from "./types.js";

/**
 * The state inside the limits: the target moved to the nearest point of the bounds union and the
 * span held between `minSpan` and `maxSpan`. Yaw is untouched. Returns the same object when
 * nothing needs clamping. Throws a RangeError for unusable limits.
 */
export function clampState(
  state: GroundCameraState,
  limits: GroundCameraLimits
): GroundCameraState {
  const { minSpan, maxSpan } = limits;
  if (
    !(Number.isFinite(minSpan) && Number.isFinite(maxSpan) && minSpan > 0 && maxSpan >= minSpan)
  ) {
    throw new RangeError("span limits need 0 < minSpan <= maxSpan, both finite");
  }
  const centre = clampToBounds(limits.bounds, state.x, state.z);
  const span = clamp(state.span, minSpan, maxSpan);
  if (centre.x === state.x && centre.z === state.z && span === state.span) return state;
  return { x: centre.x, z: centre.z, span, yaw: state.yaw };
}
