/**
 * game-mount/pixi: the PixiJS 8 adapter. Needs `pixi.js` only.
 *
 * The React hook is `game-mount/pixi/react`; the `@pixi/react` component is
 * `game-mount/pixi/pixi-react`.
 */
export { applyFilterResolutionFix } from "./filterResolutionFix.js";
export { type MountOptions, mountPixi, type PixiMountHandle } from "./mount.js";
export { type PixiResizeMode, pixiRenderOptions } from "./shared.js";
