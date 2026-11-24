/** An axis-aligned rectangle on the ground plane, in world units. `minX <= maxX`, `minZ <= maxZ`. */
export interface Rect {
  readonly minX: number;
  readonly minZ: number;
  readonly maxX: number;
  readonly maxZ: number;
}

/** A point on the ground plane (x east, z south; y is up and is not stored). */
export interface GroundPoint {
  readonly x: number;
  readonly z: number;
}

/** A point on the screen in CSS pixels, origin top left, y down. */
export interface ScreenPoint {
  readonly x: number;
  readonly y: number;
}

/** The size of the viewport in CSS pixels. */
export interface Viewport {
  readonly width: number;
  readonly height: number;
}

/**
 * What input manipulates. The camera looks at the ground point (`x`, `z`) with `yaw` radians of
 * turn, from far enough back that `span` world units of ground fill the short side of the screen.
 */
export interface GroundCameraState {
  /** Ground point the camera looks at. */
  readonly x: number;
  readonly z: number;
  /** World units of ground visible across the short screen axis at the target. */
  readonly span: number;
  /** Turn about the vertical axis in radians, growing clockwise seen from above. 0 looks −z. */
  readonly yaw: number;
}

/** A pitch that changes with zoom: `atMinSpan` fully zoomed in, `atMaxSpan` fully zoomed out. */
export interface PitchRange {
  readonly atMinSpan: number;
  readonly atMaxSpan: number;
}

/** The ground's height, so the camera can aim at it and keep its eye above it. */
export interface GroundTerrain {
  /** Height of the ground at (x, z), world units. */
  readonly height: (x: number, z: number) => number;
  /** Minimum height of the eye above the ground beneath it. */
  readonly clearance: number;
}

/** Where the camera may go and how it frames the ground. All angles are radians. */
export interface GroundCameraLimits {
  /**
   * The union of these rectangles is where the camera's target may be. Give it at least one. To
   * open more ground later, pass a new limits object with `growBounds` applied.
   */
  readonly bounds: readonly Rect[];
  /** Closest and farthest zoom, as the ground span across the short screen axis. */
  readonly minSpan: number;
  readonly maxSpan: number;
  /** Pitch below horizontal, strictly between 0 and π/2: fixed, or varying with the span. */
  readonly pitch: number | PitchRange;
  /** Vertical field of view, strictly between 0 and π. */
  readonly fov: number;
  /** Optional ground heights; without it the ground is the plane y = 0. */
  readonly terrain?: GroundTerrain;
}

/** What the renderer applies to its camera. */
export interface GroundCameraPose {
  readonly position: readonly [number, number, number];
  readonly target: readonly [number, number, number];
  /** Vertical field of view, radians. */
  readonly fov: number;
  /** Pitch below horizontal before any terrain lift, radians. */
  readonly pitch: number;
  /** Eye-to-target distance before any terrain lift, world units. */
  readonly distance: number;
}
