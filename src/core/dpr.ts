/**
 * The device-pixel-ratio policy every adapter shares.
 *
 * High-DPI screens make fill cost grow with the square of the ratio: a 3x phone asks the GPU for
 * 2.25 times the pixels of a 2x one for a picture few people can tell apart. Every adapter caps the
 * ratio with the same rule, so a game that switches renderer keeps the same sharpness/cost trade.
 *
 * The rule: the device ratio, raised to at least 1 (a zoomed-out browser reports less than 1, and
 * rendering below CSS resolution there only blurs), then capped at `maxDpr`. A `maxDpr` below 1 wins
 * over the floor, so a caller can deliberately render below CSS resolution on a weak device.
 */

/** The default cap. Above 2, extra pixels cost far more than they show. */
export const DEFAULT_MAX_DPR = 2;

/** `devicePixelRatio`, or 1 where there is none (Node, workers) or it is not a positive number. */
export function readDevicePixelRatio(): number {
  const dpr = (globalThis as { devicePixelRatio?: unknown }).devicePixelRatio;
  return typeof dpr === "number" && Number.isFinite(dpr) && dpr > 0 ? dpr : 1;
}

function assertMaxDpr(maxDpr: number): void {
  if (!Number.isFinite(maxDpr) || maxDpr <= 0) {
    throw new RangeError(`maxDpr must be a positive finite number, got ${maxDpr}`);
  }
}

/**
 * The pixel ratio to render at: `devicePixelRatio` clamped to `[1, maxDpr]` (to `maxDpr` alone
 * when `maxDpr < 1`).
 *
 * @param maxDpr the cap; defaults to {@link DEFAULT_MAX_DPR}.
 * @param devicePixelRatio the device ratio; defaults to {@link readDevicePixelRatio}.
 */
export function getDpr(
  maxDpr: number = DEFAULT_MAX_DPR,
  devicePixelRatio: number = readDevicePixelRatio()
): number {
  assertMaxDpr(maxDpr);
  return Math.min(maxDpr, Math.max(1, devicePixelRatio));
}

/**
 * The same policy as a `[min, max]` band, for renderers that take a range and pick inside it
 * themselves (react-three-fiber's `dpr` prop).
 */
export function dprRange(maxDpr: number = DEFAULT_MAX_DPR): readonly [number, number] {
  assertMaxDpr(maxDpr);
  return [Math.min(1, maxDpr), maxDpr];
}
