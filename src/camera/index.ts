/**
 * game-mount/camera: a bounded ground camera as pure maths. It imports no renderer and no input
 * library: a tilted camera over a piece of land with drag-pan that keeps the ground under the
 * finger, anchored zoom, twist rotation, bounds that are a union of rectangles, and eased motion.
 * Feed it pixel deltas from any pointer source and apply `poseFor` to any renderer's camera.
 * `projectAnchor` is the inverse direction for any camera: a world point to a screen pixel, with
 * the position and angle of an indicator for a point out of view.
 */
export {
  type AnchorProjection,
  type AnchorView,
  type EdgeInsets,
  projectAnchor,
  type Vec3,
} from "./anchor.js";
export { clampToBounds, growBounds, inflateRect } from "./bounds.js";
export { DEFAULT_SMOOTHING, easeToward } from "./ease.js";
export { dragGround, panByPixels, rotateBy, zoomBy } from "./gestures.js";
export { pitchFor, poseFor, screenToGround } from "./pose.js";
export { clampState } from "./state.js";
export type {
  GroundCameraLimits,
  GroundCameraPose,
  GroundCameraState,
  GroundPoint,
  GroundTerrain,
  PitchRange,
  Rect,
  ScreenPoint,
  Viewport,
} from "./types.js";
