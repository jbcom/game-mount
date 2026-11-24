import { describe, expect, it } from "vitest";
import {
  dragGround,
  type GroundCameraLimits,
  type GroundCameraState,
  panByPixels,
  rotateBy,
  zoomBy,
} from "../../src/camera/index.js";
import { cameraFor, FOLDABLE, LANDSCAPE, LIMITS, PORTRAIT, pixelOf } from "./_oracle.js";

const DEG = Math.PI / 180;
const VIEWPORTS = [
  ["portrait", PORTRAIT],
  ["landscape", LANDSCAPE],
  ["foldable", FOLDABLE],
] as const;
// Span picks the tilt (35 degrees close, 65 degrees far); the yaws cover every quadrant.
const SPANS = [20, 60, 200];
const YAWS = [0, 0.7, -2.4, Math.PI];

describe("dragGround", () => {
  it.each(VIEWPORTS)(
    "keeps the ground under the finger at any tilt and yaw (%s)",
    (_n, viewport) => {
      for (const span of SPANS) {
        for (const yaw of YAWS) {
          const state: GroundCameraState = { x: 14, z: -9, span, yaw };
          // A ground point a little off-centre, found by the independent camera.
          const ground = [state.x + span * 0.12, state.z - span * 0.08] as const;
          const before = pixelOf(
            cameraFor(state, LIMITS, viewport),
            viewport,
            ground[0],
            0,
            ground[1]
          );
          const to = { x: before.x + 41, y: before.y - 58 };

          const next = dragGround(state, LIMITS, viewport, before, to);

          const after = pixelOf(
            cameraFor(next, LIMITS, viewport),
            viewport,
            ground[0],
            0,
            ground[1]
          );
          expect(after.x).toBeCloseTo(to.x, 6);
          expect(after.y).toBeCloseTo(to.y, 6);
          expect(next.span).toBe(span);
          expect(next.yaw).toBe(yaw);
        }
      }
    }
  );

  it("is the identity for a drag that goes nowhere", () => {
    const state = { x: 3, z: 4, span: 80, yaw: 1 };
    const next = dragGround(state, LIMITS, LANDSCAPE, { x: 300, y: 400 }, { x: 300, y: 400 });
    expect(next.x).toBeCloseTo(3, 9);
    expect(next.z).toBeCloseTo(4, 9);
  });

  it("slides along a bound: the free axis keeps moving", () => {
    const limits: GroundCameraLimits = {
      ...LIMITS,
      bounds: [{ minX: -10, minZ: -10, maxX: 10, maxZ: 10 }],
    };
    const state = { x: 10, z: 0, span: 60, yaw: 0 };
    // The finger moves left (the camera goes east, into the wall) and down (the camera goes north).
    const next = dragGround(state, limits, PORTRAIT, { x: 200, y: 400 }, { x: 120, y: 480 });
    expect(next.x).toBe(10);
    expect(next.z).toBeLessThan(0);
  });

  it("does nothing when either pixel looks above the horizon", () => {
    const shallow: GroundCameraLimits = { ...LIMITS, pitch: 15 * DEG, fov: 60 * DEG };
    const state = { x: 3, z: 4, span: 80, yaw: 1 };
    const sky = { x: 640, y: 0 };
    const ground = { x: 640, y: 600 };
    expect(dragGround(state, shallow, LANDSCAPE, sky, ground)).toEqual(state);
    expect(dragGround(state, shallow, LANDSCAPE, ground, sky)).toEqual(state);
  });

  it("clamps the span of a state that was out of range", () => {
    const next = dragGround(
      { x: 0, z: 0, span: 9999, yaw: 0 },
      LIMITS,
      LANDSCAPE,
      { x: 1, y: 700 },
      { x: 1, y: 700 }
    );
    expect(next.span).toBe(200);
  });
});

describe("panByPixels", () => {
  const state: GroundCameraState = { x: 0, z: 0, span: 80, yaw: 0 };

  it("moves the ground with the finger: dragging right moves the camera west", () => {
    const next = panByPixels(state, LIMITS, LANDSCAPE, 100, 0);
    expect(next.x).toBeLessThan(0);
    expect(next.z).toBeCloseTo(0, 9);
  });

  it("dragging down moves the camera north at yaw 0", () => {
    const next = panByPixels(state, LIMITS, LANDSCAPE, 0, 100);
    expect(next.z).toBeLessThan(0);
    expect(next.x).toBeCloseTo(0, 9);
  });

  it("is a drag of a finger at the screen centre", () => {
    const viewport = PORTRAIT;
    const centre = { x: viewport.width / 2, y: viewport.height / 2 };
    const viaDrag = dragGround(state, LIMITS, viewport, centre, {
      x: centre.x + 30,
      y: centre.y - 45,
    });
    expect(panByPixels(state, LIMITS, viewport, 30, -45)).toEqual(viaDrag);
  });

  it("follows the yaw: at a quarter turn, dragging right moves the camera south", () => {
    const next = panByPixels({ ...state, yaw: Math.PI / 2 }, LIMITS, LANDSCAPE, 100, 0);
    // Looking east, screen-right is south (+z), and the ground follows the finger.
    expect(next.z).toBeLessThan(0);
    expect(next.x).toBeCloseTo(0, 9);
  });

  it("covers more ground per pixel the further out it is zoomed", () => {
    const near = panByPixels({ ...state, span: 40 }, LIMITS, LANDSCAPE, 50, 0);
    const far = panByPixels({ ...state, span: 160 }, LIMITS, LANDSCAPE, 50, 0);
    // The long axis scales with the span at a fixed tilt; the tilt differs, so allow a loose ratio.
    expect(Math.abs(far.x)).toBeGreaterThan(Math.abs(near.x) * 3);
  });
});

describe("zoomBy", () => {
  it.each(VIEWPORTS)(
    "keeps the anchored ground under the anchor at any tilt and yaw (%s)",
    (_n, viewport) => {
      for (const span of [60, 100, 150]) {
        for (const yaw of YAWS) {
          const state: GroundCameraState = { x: -4, z: 22, span, yaw };
          const ground = [state.x - span * 0.1, state.z + span * 0.06] as const;
          const anchor = pixelOf(
            cameraFor(state, LIMITS, viewport),
            viewport,
            ground[0],
            0,
            ground[1]
          );
          for (const factor of [0.5, 1.2]) {
            const next = zoomBy(state, LIMITS, viewport, factor, anchor);
            expect(next.span).toBeCloseTo(span * factor, 9);
            const after = pixelOf(
              cameraFor(next, LIMITS, viewport),
              viewport,
              ground[0],
              0,
              ground[1]
            );
            expect(after.x).toBeCloseTo(anchor.x, 6);
            expect(after.y).toBeCloseTo(anchor.y, 6);
          }
        }
      }
    }
  );

  it("zooms about the screen centre when there is no anchor", () => {
    const state = { x: 7, z: -3, span: 100, yaw: 0.4 };
    expect(zoomBy(state, LIMITS, LANDSCAPE, 0.5)).toEqual({ ...state, span: 50 });
  });

  it("stops at the span limits and still holds the anchor", () => {
    const state: GroundCameraState = { x: 0, z: 0, span: 150, yaw: 0.3 };
    const ground = [8, -6] as const;
    const anchor = pixelOf(cameraFor(state, LIMITS, PORTRAIT), PORTRAIT, ground[0], 0, ground[1]);
    const out = zoomBy(state, LIMITS, PORTRAIT, 100, anchor);
    expect(out.span).toBe(200);
    const after = pixelOf(cameraFor(out, LIMITS, PORTRAIT), PORTRAIT, ground[0], 0, ground[1]);
    expect(after.x).toBeCloseTo(anchor.x, 6);
    expect(after.y).toBeCloseTo(anchor.y, 6);
    expect(zoomBy(state, LIMITS, PORTRAIT, 1e-6).span).toBe(20);
  });

  it("falls back to the centre when the anchor looks above the horizon", () => {
    const shallow: GroundCameraLimits = { ...LIMITS, pitch: 15 * DEG, fov: 60 * DEG };
    const state = { x: 7, z: -3, span: 100, yaw: 0.4 };
    expect(zoomBy(state, shallow, LANDSCAPE, 0.5, { x: 640, y: 0 })).toEqual({
      ...state,
      span: 50,
    });
  });

  it("keeps the centre inside the bounds", () => {
    const limits: GroundCameraLimits = {
      ...LIMITS,
      bounds: [{ minX: -5, minZ: -5, maxX: 5, maxZ: 5 }],
    };
    const state = { x: 5, z: 5, span: 100, yaw: 0 };
    const next = zoomBy(state, limits, LANDSCAPE, 0.5, { x: 100, y: 100 });
    expect(next.x).toBeLessThanOrEqual(5);
    expect(next.z).toBeLessThanOrEqual(5);
  });

  it.each([0, -2, Number.NaN, Number.POSITIVE_INFINITY])("throws for a factor of %s", (factor) => {
    expect(() => zoomBy({ x: 0, z: 0, span: 50, yaw: 0 }, LIMITS, LANDSCAPE, factor)).toThrow(
      RangeError
    );
  });
});

describe("rotateBy", () => {
  const state: GroundCameraState = { x: 9, z: 4, span: 90, yaw: 0.5 };

  it("turns about the centre of the screen by default", () => {
    expect(rotateBy(state, LIMITS, LANDSCAPE, 0.25)).toEqual({ ...state, yaw: 0.75 });
  });

  it("wraps the yaw into a half turn either side", () => {
    expect(rotateBy({ ...state, yaw: 3 }, LIMITS, LANDSCAPE, 1).yaw).toBeCloseTo(
      4 - 2 * Math.PI,
      12
    );
    expect(rotateBy({ ...state, yaw: -3 }, LIMITS, LANDSCAPE, -1).yaw).toBeCloseTo(
      2 * Math.PI - 4,
      12
    );
    expect(rotateBy({ ...state, yaw: 0 }, LIMITS, LANDSCAPE, Math.PI).yaw).toBeCloseTo(Math.PI, 12);
  });

  it.each(VIEWPORTS)("holds an anchored ground point still while it turns (%s)", (_n, viewport) => {
    for (const span of SPANS) {
      const start: GroundCameraState = { ...state, span };
      const ground = [start.x + span * 0.1, start.z + span * 0.07] as const;
      const anchor = pixelOf(cameraFor(start, LIMITS, viewport), viewport, ground[0], 0, ground[1]);
      const next = rotateBy(start, LIMITS, viewport, 0.9, anchor);
      expect(next.yaw).toBeCloseTo(1.4, 12);
      const after = pixelOf(cameraFor(next, LIMITS, viewport), viewport, ground[0], 0, ground[1]);
      expect(after.x).toBeCloseTo(anchor.x, 6);
      expect(after.y).toBeCloseTo(anchor.y, 6);
    }
  });

  it("falls back to turning about the centre when the anchor looks above the horizon", () => {
    const shallow: GroundCameraLimits = { ...LIMITS, pitch: 15 * DEG, fov: 60 * DEG };
    expect(rotateBy(state, shallow, LANDSCAPE, 0.25, { x: 640, y: 0 })).toEqual({
      ...state,
      yaw: 0.75,
    });
  });
});
