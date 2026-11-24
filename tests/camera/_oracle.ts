/**
 * An independent oracle for the camera maths: a real three.js PerspectiveCamera built from the pose
 * the module returns. Tests project world points through it instead of re-deriving the module's own
 * formulas, so a sign or foreshortening mistake in the module cannot be hidden by the same mistake
 * in the test.
 */
import { PerspectiveCamera, Vector3 } from "three";
import {
  type GroundCameraLimits,
  type GroundCameraState,
  poseFor,
  type ScreenPoint,
  type Viewport,
} from "../../src/camera/index.js";

export const LIMITS: GroundCameraLimits = {
  bounds: [{ minX: -1000, minZ: -1000, maxX: 1000, maxZ: 1000 }],
  minSpan: 20,
  maxSpan: 200,
  pitch: { atMinSpan: (35 * Math.PI) / 180, atMaxSpan: (65 * Math.PI) / 180 },
  fov: (40 * Math.PI) / 180,
};

export const PORTRAIT: Viewport = { width: 390, height: 844 };
export const LANDSCAPE: Viewport = { width: 1280, height: 720 };
/** An unfolded foldable is close to square. */
export const FOLDABLE: Viewport = { width: 884, height: 832 };

export function cameraFor(
  state: GroundCameraState,
  limits: GroundCameraLimits,
  viewport: Viewport
): PerspectiveCamera {
  const pose = poseFor(state, limits, viewport.width / viewport.height);
  const camera = new PerspectiveCamera(
    (pose.fov * 180) / Math.PI,
    viewport.width / viewport.height,
    0.1,
    1e6
  );
  camera.position.set(...pose.position);
  camera.lookAt(...pose.target);
  camera.updateMatrixWorld(true);
  camera.updateProjectionMatrix();
  return camera;
}

/** Normalised device coordinates (x right, y up) of a world point. */
export function ndcOf(camera: PerspectiveCamera, x: number, y: number, z: number): Vector3 {
  return new Vector3(x, y, z).project(camera);
}

/** The pixel (y down) a world point lands on. */
export function pixelOf(
  camera: PerspectiveCamera,
  viewport: Viewport,
  x: number,
  y: number,
  z: number
): ScreenPoint {
  const ndc = ndcOf(camera, x, y, z);
  return {
    x: ((ndc.x + 1) / 2) * viewport.width,
    y: ((1 - ndc.y) / 2) * viewport.height,
  };
}
