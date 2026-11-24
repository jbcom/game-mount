import type { Viewport } from "./types.js";

/** A point in world units: x, y, z. */
export type Vec3 = readonly [x: number, y: number, z: number];

/** Screen margins in CSS pixels, one per side. */
export interface EdgeInsets {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

/**
 * What the projection needs from a camera, read once per frame: its view-projection matrix and
 * where its eye is.
 */
export interface AnchorView {
  /**
   * The projection matrix times the inverse of the camera's world matrix: 16 numbers, column-major
   * (three.js `Matrix4.elements`). Perspective and orthographic projections both work.
   */
  readonly viewProjection: ArrayLike<number>;
  /** The camera's world position, for `distance`. */
  readonly eye: Vec3;
}

/** Where a world point lands on a viewport, and what to do about it when it is out of view. */
export interface AnchorProjection {
  /**
   * The point's screen position in CSS pixels (origin top left, y down). It is only meaningful
   * while `inFront`; behind the camera it holds the same value as `edge`.
   */
  readonly x: number;
  readonly y: number;
  /** Straight-line distance from the eye to the point, in world units. */
  readonly distance: number;
  /** True when the point is in front of the camera (clip `w` above zero). */
  readonly inFront: boolean;
  /** True when the point is in front of the camera and inside the viewport shrunk by the insets. */
  readonly inside: boolean;
  /**
   * Where an indicator for this point sits: the point itself when `inside`, otherwise the spot on
   * the border of the inset rectangle along the ray from that rectangle's centre toward the point.
   * `angle` is the direction of that ray in radians, `atan2(dy, dx)` with y down, so 0 points right
   * and π/2 points down: the rotation to give an arrow drawn pointing right. A point behind the
   * camera points the way the camera would have to turn to face it; one straight behind points down.
   */
  readonly edge: { readonly x: number; readonly y: number; readonly angle: number };
}

const NO_INSETS: EdgeInsets = { top: 0, right: 0, bottom: 0, left: 0 };
/** Clip `w` at or below this is behind the camera (or on its plane). */
const BEHIND = 1e-9;

function resolveInsets(insets: number | Partial<EdgeInsets>): EdgeInsets {
  if (typeof insets === "number")
    return { top: insets, right: insets, bottom: insets, left: insets };
  return { ...NO_INSETS, ...insets };
}

function assertInset(name: string, value: number): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(
      `projectAnchor: inset ${name} must be finite and not negative, got ${value}`
    );
  }
}

/**
 * Projects a world point onto a viewport and works out where an off-screen indicator for it goes.
 *
 * It is the maths behind world-anchored HTML (a marker over a thing, a count on a part, an arrow
 * at the screen edge) with no renderer attached: give it the camera's view-projection matrix and
 * eye, the viewport in CSS pixels and, optionally, the margins that HUD furniture takes. A point
 * counts as `inside` only in front of the camera and within the viewport shrunk by `insets`, so an
 * anchor under a HUD bar gets an indicator on the bar's edge rather than being lost beneath it.
 *
 * `insets` is a number for all four sides, or any of `top`, `right`, `bottom` and `left`. Insets
 * larger than the viewport leave a rectangle of no size, and every edge indicator sits at its
 * centre. Throws `RangeError` for a viewport that is not positive and finite, or an inset that is
 * negative or not finite.
 */
export function projectAnchor(
  point: Vec3,
  view: AnchorView,
  viewport: Viewport,
  insets: number | Partial<EdgeInsets> = 0
): AnchorProjection {
  const { width, height } = viewport;
  if (!(width > 0 && height > 0 && Number.isFinite(width) && Number.isFinite(height))) {
    throw new RangeError(
      `projectAnchor: viewport must be positive and finite, got ${width}x${height}`
    );
  }
  const { top, right, bottom, left } = resolveInsets(insets);
  assertInset("top", top);
  assertInset("right", right);
  assertInset("bottom", bottom);
  assertInset("left", left);

  const m = view.viewProjection;
  const [px, py, pz] = point;
  const clipX =
    (m[0] as number) * px + (m[4] as number) * py + (m[8] as number) * pz + (m[12] as number);
  const clipY =
    (m[1] as number) * px + (m[5] as number) * py + (m[9] as number) * pz + (m[13] as number);
  const clipW =
    (m[3] as number) * px + (m[7] as number) * py + (m[11] as number) * pz + (m[15] as number);
  const distance = Math.hypot(px - view.eye[0], py - view.eye[1], pz - view.eye[2]);

  // The rectangle that holds full-size markers, and its centre, where indicator rays start.
  const halfW = Math.max(0, (width - left - right) / 2);
  const halfH = Math.max(0, (height - top - bottom) / 2);
  const centreX = left + halfW;
  const centreY = top + halfH;

  const inFront = clipW > BEHIND;
  let x: number;
  let y: number;
  let dx: number;
  let dy: number;
  if (inFront) {
    x = (clipX / clipW / 2 + 0.5) * width;
    y = (0.5 - clipY / clipW / 2) * height;
    dx = x - centreX;
    dy = y - centreY;
  } else {
    // Behind the camera the divide by w mirrors the point through the screen centre, so a target on
    // the right behind you would be drawn on the left. The undivided clip direction keeps its side.
    x = 0;
    y = 0;
    dx = (clipX * width) / 2;
    dy = (-clipY * height) / 2;
    if (dx === 0 && dy === 0) dy = 1;
  }

  const inside = inFront && x >= left && x <= width - right && y >= top && y <= height - bottom;
  const angle = Math.atan2(dy, dx);
  if (inside) return { x, y, distance, inFront, inside, edge: { x, y, angle } };

  // Walk the ray from the centre until it meets the rectangle's border.
  const reach = Math.min(
    dx === 0 ? Number.POSITIVE_INFINITY : halfW / Math.abs(dx),
    dy === 0 ? Number.POSITIVE_INFINITY : halfH / Math.abs(dy)
  );
  // Both components zero (a point on the centre of a rectangle with no size) has no ray to walk.
  const along = Number.isFinite(reach) ? reach : 0;
  const edgeX = centreX + dx * along;
  const edgeY = centreY + dy * along;
  return {
    x: inFront ? x : edgeX,
    y: inFront ? y : edgeY,
    distance,
    inFront,
    inside,
    edge: { x: edgeX, y: edgeY, angle },
  };
}
