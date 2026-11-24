import { clamp } from "./math.js";
import type { GroundPoint, Rect } from "./types.js";

/** A rectangle grown by `margin` on every side; a negative margin shrinks it. */
export function inflateRect(rect: Rect, margin: number): Rect {
  return {
    minX: rect.minX - margin,
    minZ: rect.minZ - margin,
    maxX: rect.maxX + margin,
    maxZ: rect.maxZ + margin,
  };
}

function covers(outer: Rect, inner: Rect): boolean {
  return (
    outer.minX <= inner.minX &&
    outer.minZ <= inner.minZ &&
    outer.maxX >= inner.maxX &&
    outer.maxZ >= inner.maxZ
  );
}

/**
 * A union of rectangles with `added` joined to it, without growing the union by rectangles that
 * are already covered. Returns a new array; the input is not changed.
 */
export function growBounds(bounds: readonly Rect[], ...added: readonly Rect[]): readonly Rect[] {
  let next = [...bounds];
  for (const rect of added) {
    if (next.some((existing) => covers(existing, rect))) continue;
    next = [...next.filter((existing) => !covers(rect, existing)), rect];
  }
  return next;
}

/**
 * The point of the union of `bounds` nearest to (`x`, `z`): the point itself when it is inside any
 * rectangle, otherwise the nearest of its projections onto each rectangle. A point pushed past an
 * edge keeps its position along the edge, so a drag against a boundary slides. Equal distances go
 * to the earlier rectangle. Throws a RangeError when `bounds` is empty.
 */
export function clampToBounds(bounds: readonly Rect[], x: number, z: number): GroundPoint {
  if (bounds.length === 0) throw new RangeError("bounds needs at least one rectangle");
  let best: GroundPoint = { x, z };
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const rect of bounds) {
    const nearestX = clamp(x, rect.minX, rect.maxX);
    const nearestZ = clamp(z, rect.minZ, rect.maxZ);
    const distance = (nearestX - x) ** 2 + (nearestZ - z) ** 2;
    if (distance === 0) return { x, z };
    if (distance < bestDistance) {
      bestDistance = distance;
      best = { x: nearestX, z: nearestZ };
    }
  }
  return best;
}
