import { useFrame, useThree } from "@react-three/fiber";
import { useRef } from "react";
import type { Camera, PerspectiveCamera } from "three";
import { DEFAULT_SMOOTHING, easeToward } from "../camera/ease.js";
import { poseFor } from "../camera/pose.js";
import { clampState } from "../camera/state.js";
import type { GroundCameraLimits, GroundCameraState, GroundPoint } from "../camera/types.js";

export interface GroundCameraRigProps {
  /** Where the camera may go and how it frames the ground. Changing it re-clamps the next frame. */
  readonly limits: GroundCameraLimits;
  /**
   * The camera's goal. Input handlers write `stateRef.current` (with the `game-mount/camera`
   * gestures or their own maths); the rig eases the camera toward it. Each frame the rig clamps the
   * goal to `limits` (and steers it to `follow`) and writes the result back, so the ref never holds
   * a position the camera cannot reach.
   */
  readonly stateRef: { current: GroundCameraState };
  /**
   * A ground point to keep at the centre of the view: a point, or a getter called every frame for a
   * moving target (return null for no target). While it gives a point it overrides the goal's
   * centre; pass null or undefined to hand control back, for example while the player pans.
   */
  readonly follow?: GroundPoint | (() => GroundPoint | null) | null;
  /** Easing time constant in seconds; 0 snaps. Defaults to `DEFAULT_SMOOTHING`. */
  readonly smoothing?: number;
  /**
   * `useFrame` priority. The default -1 moves the camera before anything at priority 0 reads it
   * this frame, without taking over r3f's render loop (a positive priority does).
   */
  readonly priority?: number;
}

function isPerspective(camera: Camera): camera is PerspectiveCamera {
  return (camera as Partial<PerspectiveCamera>).isPerspectiveCamera === true;
}

/**
 * Drives the r3f camera from a bounded ground camera (`game-mount/camera`). Each frame it clamps the
 * goal in `stateRef`, follows `follow` if given, eases the shown state toward the goal at any frame
 * rate, and applies the pose to the canvas's perspective camera. It reads no input: write the goal
 * from whichever pointer, keyboard or gamepad source the game uses.
 *
 * It assumes r3f's default continuous frame loop; with `frameloop="demand"` the eased motion needs
 * `invalidate()` calls from the caller.
 */
export function GroundCameraRig({
  limits,
  stateRef,
  follow,
  smoothing = DEFAULT_SMOOTHING,
  priority = -1,
}: GroundCameraRigProps): null {
  const camera = useThree((state) => state.camera);
  const size = useThree((state) => state.size);
  const shown = useRef<GroundCameraState | null>(null);

  useFrame((_, delta) => {
    // No perspective camera, or a canvas that has no size yet: there is nothing to frame.
    if (!isPerspective(camera) || size.width <= 0 || size.height <= 0) return;
    let goal = clampState(stateRef.current, limits);
    const point = typeof follow === "function" ? follow() : follow;
    if (point) goal = clampState({ ...goal, x: point.x, z: point.z }, limits);
    stateRef.current = goal;
    // The first frame starts on the goal; later frames ease, then clamp, since a straight line
    // between two allowed points can cross a notch in the union of bounds.
    const eased = shown.current === null ? goal : easeToward(shown.current, goal, delta, smoothing);
    const next = clampState(eased, limits);
    shown.current = next;

    const pose = poseFor(next, limits, size.width / size.height);
    camera.position.set(pose.position[0], pose.position[1], pose.position[2]);
    camera.lookAt(pose.target[0], pose.target[1], pose.target[2]);
    const fovDegrees = (pose.fov * 180) / Math.PI;
    if (Math.abs(camera.fov - fovDegrees) > 1e-3) {
      camera.fov = fovDegrees;
      camera.updateProjectionMatrix();
    }
  }, priority);

  return null;
}
