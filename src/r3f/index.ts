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
export { Anchor, type AnchorProps } from "./Anchor.js";
export { AnchorLayer, type AnchorLayerProps, useAnchorTracker } from "./AnchorLayer.js";
export { AnchorProjector, type AnchorProjectorProps } from "./AnchorProjector.js";
export {
  type AnchorFrame,
  type AnchorPosition,
  type AnchorSpec,
  type AnchorState,
  type AnchorTarget,
  type AnchorTracker,
  createAnchorTracker,
} from "./anchorTracker.js";
export { createR3FMount, type R3FMount } from "./createR3FMount.js";
export { GameCanvas, type GameCanvasHostProps, type GameCanvasProps } from "./GameCanvas.js";
export { GroundCameraRig, type GroundCameraRigProps } from "./GroundCameraRig.js";
export { ManagedGameCanvas, type ManagedGameCanvasProps } from "./ManagedGameCanvas.js";
