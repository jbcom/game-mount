/**
 * The adaptive-resolution ladder: a pure state machine that walks the pixel ratio down when frame
 * rate stays low and back up when it stays high. Renderer adapters feed it one average-FPS sample
 * per measurement window and apply `next` to their renderer (r3f's `AdaptiveResolution` does this
 * through `gl.setPixelRatio`).
 *
 * - Below {@link LADDER_LOW_FPS}: count a low window; on the second in a row, step down by
 *   {@link LADDER_STEP}, never below {@link LADDER_FLOOR}.
 * - Above {@link LADDER_HIGH_FPS}: count a high window; on the second in a row, step up by
 *   {@link LADDER_STEP}, never above `cap`.
 * - In between: reset both counts.
 *
 * Two windows in a row, not one, so a single hitch (a texture upload, a garbage collection) never
 * moves the ratio.
 */

export const LADDER_LOW_FPS = 30;
export const LADDER_HIGH_FPS = 55;
export const LADDER_STEP = 0.1;
export const LADDER_FLOOR = 0.5;

export type StepPixelRatioInput = Readonly<{
  /** Average frames per second over the last window. */
  avgFps: number;
  /** The pixel ratio in use now. */
  current: number;
  /** The highest ratio the ladder may climb to, usually `getDpr(quality.maxDpr)`. */
  cap: number;
  consecutiveLow: number;
  consecutiveHigh: number;
}>;

export type StepPixelRatioResult = Readonly<{
  next: number;
  consecutiveLow: number;
  consecutiveHigh: number;
}>;

// Work in tenths so repeated steps land on 1.4, not 1.4000000000000001.
function stepBy(value: number, direction: 1 | -1): number {
  return Math.round(value * 10 + direction * LADDER_STEP * 10) / 10;
}

export function stepPixelRatio(input: StepPixelRatioInput): StepPixelRatioResult {
  const { avgFps, current, cap } = input;
  let { consecutiveLow, consecutiveHigh } = input;
  let next = current;

  if (avgFps < LADDER_LOW_FPS) {
    consecutiveLow += 1;
    consecutiveHigh = 0;
    if (consecutiveLow >= 2 && current > LADDER_FLOOR) {
      next = Math.max(LADDER_FLOOR, stepBy(current, -1));
      consecutiveLow = 0;
    }
  } else if (avgFps > LADDER_HIGH_FPS) {
    consecutiveHigh += 1;
    consecutiveLow = 0;
    if (consecutiveHigh >= 2 && current < cap) {
      next = Math.min(cap, stepBy(current, 1));
      consecutiveHigh = 0;
    }
  } else {
    consecutiveLow = 0;
    consecutiveHigh = 0;
  }

  return { next, consecutiveLow, consecutiveHigh };
}
