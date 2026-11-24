/**
 * game-mount/r3f: the react-three-fiber adapter. Needs `react`, `three` and `@react-three/fiber`.
 *
 * Pair it with `GameCanvasErrorBoundary` from `game-mount/react`.
 */
export {
  AdaptiveResolution,
  type AdaptiveResolutionInfo,
  type AdaptiveResolutionProps,
} from "./AdaptiveResolution.js";
export { createR3FMount, type R3FMount } from "./createR3FMount.js";
export { GameCanvas, type GameCanvasHostProps, type GameCanvasProps } from "./GameCanvas.js";
export { GroundCameraRig, type GroundCameraRigProps } from "./GroundCameraRig.js";
export { ManagedGameCanvas, type ManagedGameCanvasProps } from "./ManagedGameCanvas.js";
