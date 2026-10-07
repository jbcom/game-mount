/**
 * game-mount/babylon: the Babylon.js adapter for Reactylon. Needs `react`, `@babylonjs/core` and
 * `reactylon`. Havok physics is the separate `game-mount/babylon/havok` entry point.
 */
export { type BabylonEngineOptionsInput, babylonEngineOptions } from "./engineOptions.js";
export { SceneRoot, type SceneRootProps } from "./SceneRoot.js";
export { MAX_FRAME_DELTA, useBeforeRender } from "./useBeforeRender.js";
