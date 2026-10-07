import type { EngineOptions } from "@babylonjs/core/Engines/thinEngine";
import { isMobileDevice, type NavigatorLike } from "../core/device.js";
import { detectQuality, type RenderQuality } from "../core/quality.js";

export interface BabylonEngineOptionsInput {
  /** Pixel-ratio cap and antialiasing. Defaults to `detectQuality()`: `low` on mobile, `high` elsewhere. */
  quality?: RenderQuality;
  /** Fields spread last, over everything this function decides. */
  overrides?: Partial<EngineOptions>;
  /** The navigator to classify; defaults to the global one. */
  navigator?: NavigatorLike;
}

/**
 * Babylon `EngineOptions` that apply the shared quality policy.
 *
 * The pixel-ratio cap goes through Babylon's own `limitDeviceRatio` with `adaptToDeviceRatio` on,
 * so Babylon renders at `min(devicePixelRatio, quality.maxDpr)`, the same ratio the other adapters
 * use. On a mobile device it also turns the stencil buffer off and asks for the low-power GPU.
 * `preserveDrawingBuffer` is off; turn it on through `overrides` when you read frames back.
 *
 * Pass the result to Reactylon's `<Engine engineOptions={...}>` or to `new Engine(canvas,
 * antialias, options)`.
 */
export function babylonEngineOptions(input: BabylonEngineOptionsInput = {}): EngineOptions {
  const mobile = isMobileDevice(input.navigator);
  const quality = input.quality ?? detectQuality(input.navigator);
  return {
    preserveDrawingBuffer: false,
    stencil: !mobile,
    antialias: quality.antialias,
    powerPreference: mobile ? "low-power" : "high-performance",
    adaptToDeviceRatio: true,
    limitDeviceRatio: quality.maxDpr,
    ...input.overrides,
  };
}
