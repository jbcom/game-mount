import { useFrame, useThree } from "@react-three/fiber";
import type { EdgeInsets } from "../camera/index.js";
import type { AnchorTracker } from "./anchorTracker.js";

export interface AnchorProjectorProps {
  /** The tracker the host's `AnchorLayer` was given. */
  tracker: AnchorTracker;
  /**
   * Margins in CSS pixels that HUD furniture takes: a number for every side, or any of `top`,
   * `right`, `bottom` and `left`. An anchor is only shown as a marker inside what is left, and gets
   * its indicator on that rectangle's border, so arrows stay clear of bars and button clusters.
   */
  insets?: number | Partial<EdgeInsets>;
  /** The most edge indicators shown at once; others are hidden. Default unlimited. */
  maxEdgeIndicators?: number;
  /**
   * `useFrame` priority. Keep it at 0 or below: it must run after the camera has moved (a camera
   * rig at -1 is earlier) and a positive priority takes over r3f's render loop. Default 0.
   */
  priority?: number;
}

/**
 * Drives the anchors of a tracker from inside the canvas: every frame it projects each anchor
 * through the canvas's camera and writes the result to the DOM. It renders nothing. Place it in
 * the scene beside a camera rig; the matching `AnchorLayer` lives in the host's React tree.
 *
 * It reads the canvas's own `size`, so the layer must cover the same box. With
 * `frameloop="demand"`, anchors move when frames are drawn: invalidate when a position changes.
 */
export function AnchorProjector({
  tracker,
  insets,
  maxEdgeIndicators,
  priority = 0,
}: AnchorProjectorProps): null {
  const camera = useThree((state) => state.camera);
  const size = useThree((state) => state.size);
  useFrame(() => {
    tracker.update({ camera, width: size.width, height: size.height, insets, maxEdgeIndicators });
  }, priority);
  return null;
}
