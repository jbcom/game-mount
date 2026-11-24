import { describe, expect, it } from "vitest";
import { clampToBounds, growBounds, inflateRect, type Rect } from "../../src/camera/index.js";

const BASE: Rect = { minX: 0, minZ: 0, maxX: 10, maxZ: 10 };

/** An L: a wide bar along the bottom and a tall bar up the left, with the top-right corner missing. */
const L_SHAPE: readonly Rect[] = [
  { minX: 0, minZ: 0, maxX: 10, maxZ: 5 },
  { minX: 0, minZ: 0, maxX: 5, maxZ: 10 },
];

describe("inflateRect", () => {
  it("grows every side by the margin and leaves the input alone", () => {
    expect(inflateRect(BASE, 2)).toEqual({ minX: -2, minZ: -2, maxX: 12, maxZ: 12 });
    expect(BASE).toEqual({ minX: 0, minZ: 0, maxX: 10, maxZ: 10 });
  });

  it("shrinks for a negative margin", () => {
    expect(inflateRect(BASE, -1)).toEqual({ minX: 1, minZ: 1, maxX: 9, maxZ: 9 });
  });
});

describe("growBounds", () => {
  it("adds a rectangle without mutating the union it grows", () => {
    const original: readonly Rect[] = [BASE];
    const next = growBounds(original, { minX: 10, minZ: 0, maxX: 20, maxZ: 10 });
    expect(next).toHaveLength(2);
    expect(original).toEqual([BASE]);
  });

  it("skips a rectangle an existing one already covers", () => {
    const original: readonly Rect[] = [BASE];
    const next = growBounds(original, { minX: 2, minZ: 2, maxX: 4, maxZ: 4 });
    expect(next).toEqual([BASE]);
  });

  it("drops rectangles the new one swallows", () => {
    const small = { minX: 2, minZ: 2, maxX: 4, maxZ: 4 };
    const next = growBounds([small, BASE], inflateRect(BASE, 5));
    expect(next).toEqual([inflateRect(BASE, 5)]);
  });

  it("takes several rectangles in order", () => {
    const next = growBounds(
      [BASE],
      { minX: 10, minZ: 0, maxX: 20, maxZ: 10 },
      { minX: 0, minZ: 10, maxX: 10, maxZ: 20 }
    );
    expect(next).toHaveLength(3);
  });

  it("changes where the camera may go: a point outside before is inside after", () => {
    const grown = growBounds([BASE], { minX: 10, minZ: 0, maxX: 20, maxZ: 10 });
    expect(clampToBounds([BASE], 15, 5)).toEqual({ x: 10, z: 5 });
    expect(clampToBounds(grown, 15, 5)).toEqual({ x: 15, z: 5 });
  });
});

describe("clampToBounds", () => {
  it("leaves a point inside any rectangle alone", () => {
    expect(clampToBounds([BASE], 3, 4)).toEqual({ x: 3, z: 4 });
    expect(clampToBounds(L_SHAPE, 8, 2)).toEqual({ x: 8, z: 2 });
    expect(clampToBounds(L_SHAPE, 2, 8)).toEqual({ x: 2, z: 8 });
  });

  it("treats the edge as inside", () => {
    expect(clampToBounds([BASE], 10, 10)).toEqual({ x: 10, z: 10 });
  });

  it("projects a point beyond a corner onto the corner", () => {
    expect(clampToBounds([BASE], 14, -3)).toEqual({ x: 10, z: 0 });
  });

  it("slides along an edge: only the coordinate past the edge is removed", () => {
    // Pushed 7 beyond the east edge while 4.25 along it: the along-edge position survives.
    expect(clampToBounds([BASE], 17, 4.25)).toEqual({ x: 10, z: 4.25 });
    expect(clampToBounds([BASE], -2, 6.5)).toEqual({ x: 0, z: 6.5 });
    expect(clampToBounds([BASE], 6.5, 30)).toEqual({ x: 6.5, z: 10 });
  });

  it("puts a point in the notch of an L on the nearer inner edge", () => {
    // (8, 6) sits in the missing corner, 1 above the wide bar and 3 right of the tall bar.
    expect(clampToBounds(L_SHAPE, 8, 6)).toEqual({ x: 8, z: 5 });
    // (6, 8): 3 above the wide bar, 1 right of the tall bar.
    expect(clampToBounds(L_SHAPE, 6, 8)).toEqual({ x: 5, z: 8 });
  });

  it("breaks an exact tie in favour of the earlier rectangle", () => {
    // (9, 9) is 4 from both inner edges.
    expect(clampToBounds(L_SHAPE, 9, 9)).toEqual({ x: 9, z: 5 });
    expect(clampToBounds([...L_SHAPE].reverse(), 9, 9)).toEqual({ x: 5, z: 9 });
  });

  it("picks the nearer inner edge close to the notch's corner", () => {
    expect(clampToBounds(L_SHAPE, 5.25, 5.5)).toEqual({ x: 5, z: 5.5 });
  });

  it("finds the nearest of disjoint rectangles", () => {
    const apart: readonly Rect[] = [BASE, { minX: 30, minZ: 0, maxX: 40, maxZ: 10 }];
    expect(clampToBounds(apart, 14, 5)).toEqual({ x: 10, z: 5 });
    expect(clampToBounds(apart, 26, 5)).toEqual({ x: 30, z: 5 });
  });

  it("throws for an empty union", () => {
    expect(() => clampToBounds([], 0, 0)).toThrow(RangeError);
  });
});
