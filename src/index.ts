/**
 * game-mount: the renderer-neutral core. No peer dependencies.
 *
 * Renderer adapters live under their own subpaths and need only their own renderer installed:
 * `game-mount/pixi`, `game-mount/pixi/react`, `game-mount/pixi/pixi-react`, `game-mount/r3f`,
 * `game-mount/babylon` and `game-mount/babylon/havok`. React-only, renderer-neutral pieces are in
 * `game-mount/react`; the host stylesheet is `game-mount/styles.css`.
 */

export {
  type AssetErrorClass,
  type AssetErrorReason,
  classifyAssetError,
  errorMessage,
} from "./core/assetError.js";
export { isMobileDevice, type NavigatorLike } from "./core/device.js";
export { DEFAULT_MAX_DPR, dprRange, getDpr, readDevicePixelRatio } from "./core/dpr.js";
export {
  GAME_CANVAS_HOST_CLASS,
  type GameCanvasHostStyle,
  gameCanvasHostStyle,
} from "./core/host.js";
export { detectReduceMotion } from "./core/motion.js";
export { isActivePhase } from "./core/phase.js";
export {
  LADDER_FLOOR,
  LADDER_HIGH_FPS,
  LADDER_LOW_FPS,
  LADDER_STEP,
  type StepPixelRatioInput,
  type StepPixelRatioResult,
  stepPixelRatio,
} from "./core/pixelRatioLadder.js";
export {
  DEFAULT_QUALITY,
  detectQuality,
  detectQualityTier,
  QUALITY_TIERS,
  type QualityTier,
  type RenderQuality,
} from "./core/quality.js";
