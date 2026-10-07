/**
 * Quality tiers: the two knobs every renderer exposes the same way, the pixel-ratio cap and
 * multisample antialiasing. Each adapter takes a {@link RenderQuality} and maps it onto its own
 * renderer's options (Pixi `resolution`/`antialias`, the r3f `dpr` band and `gl.antialias`, Babylon
 * `limitDeviceRatio`/`antialias`).
 */

import { isMobileDevice, type NavigatorLike } from "./device.js";

export interface RenderQuality {
  /** Cap on the device pixel ratio; see `getDpr`. */
  readonly maxDpr: number;
  /** Multisample antialiasing on the default framebuffer. */
  readonly antialias: boolean;
}

export type QualityTier = "low" | "medium" | "high";

/**
 * - `low`: CSS resolution, no MSAA. Phones, and anything that has to hold frame rate first.
 * - `medium`: 1.5x with MSAA. A good start for tablets and mid-range laptops.
 * - `high`: 2x with MSAA. Desktop.
 */
export const QUALITY_TIERS: Readonly<Record<QualityTier, RenderQuality>> = Object.freeze({
  low: Object.freeze({ maxDpr: 1, antialias: false }),
  medium: Object.freeze({ maxDpr: 1.5, antialias: true }),
  high: Object.freeze({ maxDpr: 2, antialias: true }),
});

/** What every adapter uses when no quality is given: the `high` tier. */
export const DEFAULT_QUALITY: RenderQuality = QUALITY_TIERS.high;

/** `low` on a mobile device (see `isMobileDevice`), `high` elsewhere. */
export function detectQualityTier(navigator?: NavigatorLike): QualityTier {
  return isMobileDevice(navigator) ? "low" : "high";
}

/** The {@link RenderQuality} of {@link detectQualityTier}. */
export function detectQuality(navigator?: NavigatorLike): RenderQuality {
  return QUALITY_TIERS[detectQualityTier(navigator)];
}
