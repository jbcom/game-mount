import { describe, expect, it } from "vitest";
import {
  clampState,
  type GroundCameraLimits,
  type GroundCameraState,
  pitchFor,
  poseFor,
  screenToGround,
} from "../../src/camera/index.js";
import { cameraFor, FOLDABLE, LANDSCAPE, LIMITS, ndcOf, PORTRAIT, pixelOf } from "./_oracle.js";

const DEG = Math.PI / 180;

describe("clampState", () => {
  it("returns the same object when nothing needs clamping", () => {
    const state = { x: 3, z: -4, span: 50, yaw: 9 };
    expect(clampState(state, LIMITS)).toBe(state);
  });

  it("clamps the span to the limits and leaves yaw alone", () => {
    expect(clampState({ x: 0, z: 0, span: 5, yaw: 7 }, LIMITS)).toEqual({
      x: 0,
      z: 0,
      span: 20,
      yaw: 7,
    });
    expect(clampState({ x: 0, z: 0, span: 5000, yaw: 0 }, LIMITS).span).toBe(200);
  });

  it("clamps the centre into the bounds", () => {
    const limits = { ...LIMITS, bounds: [{ minX: 0, minZ: 0, maxX: 10, maxZ: 10 }] };
    expect(clampState({ x: 25, z: 4, span: 50, yaw: 0 }, limits)).toEqual({
      x: 10,
      z: 4,
      span: 50,
      yaw: 0,
    });
  });

  it("clamps against a union and slides along an edge", () => {
    const limits = {
      ...LIMITS,
      bounds: [
        { minX: 0, minZ: 0, maxX: 10, maxZ: 5 },
        { minX: 0, minZ: 0, maxX: 5, maxZ: 10 },
      ],
    };
    // In the notch of the L: moved onto the nearer inner edge, the other coordinate kept.
    expect(clampState({ x: 8, z: 6, span: 50, yaw: 0 }, limits)).toMatchObject({ x: 8, z: 5 });
    // Past an outer edge while moving along it.
    expect(clampState({ x: 4, z: 40, span: 50, yaw: 0 }, limits)).toMatchObject({ x: 4, z: 10 });
  });

  it.each([
    ["a zero minimum", { minSpan: 0 }],
    ["a negative minimum", { minSpan: -1 }],
    ["a maximum below the minimum", { maxSpan: 10 }],
    ["an infinite maximum", { maxSpan: Number.POSITIVE_INFINITY }],
    ["a NaN minimum", { minSpan: Number.NaN }],
  ])("throws for %s", (_name, override) => {
    expect(() => clampState({ x: 0, z: 0, span: 50, yaw: 0 }, { ...LIMITS, ...override })).toThrow(
      RangeError
    );
  });
});

describe("pitchFor", () => {
  it("returns a fixed pitch whatever the span", () => {
    const limits: GroundCameraLimits = { ...LIMITS, pitch: 50 * DEG };
    expect(pitchFor(limits, 20)).toBe(50 * DEG);
    expect(pitchFor(limits, 200)).toBe(50 * DEG);
  });

  it("interpolates between the two ends over the span, smoothly", () => {
    expect(pitchFor(LIMITS, 20)).toBeCloseTo(35 * DEG, 12);
    expect(pitchFor(LIMITS, 200)).toBeCloseTo(65 * DEG, 12);
    // The geometric middle of the range is the middle of the pitch range.
    expect(pitchFor(LIMITS, Math.sqrt(20 * 200))).toBeCloseTo(50 * DEG, 12);
    // Smoothstep: flat at both ends, so a quarter of the way in has moved less than a quarter.
    const quarter = pitchFor(LIMITS, 20 * 10 ** 0.25);
    expect(quarter - 35 * DEG).toBeLessThan(0.25 * 30 * DEG);
    expect(quarter).toBeGreaterThan(35 * DEG);
  });

  it("clamps the span it is given to the limits", () => {
    expect(pitchFor(LIMITS, 1)).toBeCloseTo(35 * DEG, 12);
    expect(pitchFor(LIMITS, 1e6)).toBeCloseTo(65 * DEG, 12);
  });

  it("copes with a range that has one span", () => {
    const limits = { ...LIMITS, minSpan: 80, maxSpan: 80 };
    expect(pitchFor(limits, 80)).toBeCloseTo(35 * DEG, 12);
  });

  it.each([0, -0.1, Math.PI / 2, 2, Number.NaN])("throws for a pitch of %s", (pitch) => {
    expect(() => pitchFor({ ...LIMITS, pitch }, 50)).toThrow(RangeError);
  });
});

describe("poseFor", () => {
  const state: GroundCameraState = { x: 12, z: -30, span: 100, yaw: 0 };

  it("looks north at yaw 0 from a point south of the target, above the ground", () => {
    const pose = poseFor(state, LIMITS, 1);
    expect(pose.target).toEqual([12, 0, -30]);
    expect(pose.position[0]).toBeCloseTo(12, 9);
    expect(pose.position[2]).toBeGreaterThan(-30);
    expect(pose.position[1]).toBeGreaterThan(0);
    expect(pose.fov).toBe(LIMITS.fov);
    expect(pose.pitch).toBeCloseTo(pitchFor(LIMITS, 100), 12);
  });

  it("turns clockwise seen from above as yaw grows: at a quarter turn it looks east", () => {
    const pose = poseFor({ ...state, yaw: Math.PI / 2 }, LIMITS, 1);
    expect(pose.position[0]).toBeLessThan(12);
    expect(pose.position[2]).toBeCloseTo(-30, 9);
  });

  it("keeps the target at the stated distance and pitch", () => {
    const pose = poseFor({ ...state, yaw: 1.1 }, LIMITS, 1.5);
    const [px, py, pz] = pose.position;
    const [tx, ty, tz] = pose.target;
    expect(Math.hypot(px - tx, py - ty, pz - tz)).toBeCloseTo(pose.distance, 9);
    expect(Math.asin((py - ty) / pose.distance)).toBeCloseTo(pose.pitch, 9);
  });

  it("clamps the state it poses", () => {
    const limits = { ...LIMITS, bounds: [{ minX: 0, minZ: 0, maxX: 10, maxZ: 10 }] };
    expect(poseFor({ x: 50, z: 5, span: 100, yaw: 0 }, limits, 1).target).toEqual([10, 0, 5]);
  });

  it("pulls back as the span grows", () => {
    expect(poseFor({ ...state, span: 200 }, LIMITS, 1).distance).toBeGreaterThan(
      poseFor({ ...state, span: 40 }, LIMITS, 1).distance
    );
  });

  describe("framing: the span is what the short axis shows", () => {
    const yaw = 0.7;
    const right = [Math.cos(yaw), Math.sin(yaw)] as const;
    const forward = [Math.sin(yaw), -Math.cos(yaw)] as const;
    const framed: GroundCameraState = { x: 5, z: -8, span: 100, yaw };

    it("portrait: span metres fill the width exactly", () => {
      const camera = cameraFor(framed, LIMITS, PORTRAIT);
      const east = ndcOf(camera, 5 + right[0] * 50, 0, -8 + right[1] * 50);
      const west = ndcOf(camera, 5 - right[0] * 50, 0, -8 - right[1] * 50);
      expect(east.x).toBeCloseTo(1, 9);
      expect(west.x).toBeCloseTo(-1, 9);
      expect(east.y).toBeCloseTo(0, 9);
    });

    it("landscape: span metres fill the height at the target's scale", () => {
      const camera = cameraFor(framed, LIMITS, LANDSCAPE);
      const delta = 0.01;
      const far = ndcOf(camera, 5 + forward[0] * delta, 0, -8 + forward[1] * delta);
      const near = ndcOf(camera, 5 - forward[0] * delta, 0, -8 - forward[1] * delta);
      // NDC spans 2 over the screen height, so the target's local scale is 2 / span per metre.
      expect((far.y - near.y) / (2 * delta)).toBeCloseTo(2 / framed.span, 6);
      // The long axis shows more than the span.
      const east = ndcOf(camera, 5 + right[0] * 50, 0, -8 + right[1] * 50);
      expect(Math.abs(east.x)).toBeLessThan(1);
    });

    it("a foldable's near-square aspect fills the width, the shorter ground axis", () => {
      const camera = cameraFor(framed, LIMITS, FOLDABLE);
      const east = ndcOf(camera, 5 + right[0] * 50, 0, -8 + right[1] * 50);
      expect(east.x).toBeCloseTo(1, 9);
      const delta = 0.01;
      const far = ndcOf(camera, 5 + forward[0] * delta, 0, -8 + forward[1] * delta);
      const near = ndcOf(camera, 5 - forward[0] * delta, 0, -8 - forward[1] * delta);
      // The height shows more than the span here, so each metre covers less of it.
      expect((far.y - near.y) / (2 * delta)).toBeLessThan(2 / framed.span);
    });

    it("is continuous across a square aspect", () => {
      const below = poseFor(framed, LIMITS, 0.99).distance;
      const above = poseFor(framed, LIMITS, 1.01).distance;
      expect(Math.abs(below / above - 1)).toBeLessThan(0.03);
    });

    it("pulls back further for a narrower screen at the same span", () => {
      const narrow = poseFor(framed, LIMITS, PORTRAIT.width / PORTRAIT.height).distance;
      const wide = poseFor(framed, LIMITS, LANDSCAPE.width / LANDSCAPE.height).distance;
      expect(narrow).toBeGreaterThan(wide);
    });
  });

  describe("terrain", () => {
    it("aims at the ground under the centre", () => {
      const limits: GroundCameraLimits = {
        ...LIMITS,
        terrain: { height: (x) => x * 0.5, clearance: 2 },
      };
      const pose = poseFor(state, limits, 1);
      expect(pose.target).toEqual([12, 6, -30]);
      expect(pose.position[1]).toBeGreaterThan(6);
    });

    it("leaves the eye where the span puts it when the ground beneath is low", () => {
      const flat = poseFor(state, LIMITS, 1);
      const limits: GroundCameraLimits = { ...LIMITS, terrain: { height: () => 0, clearance: 2 } };
      expect(poseFor(state, limits, 1).position).toEqual(flat.position);
    });

    it("lifts the eye to the clearance above a hill beneath it", () => {
      const limits: GroundCameraLimits = {
        ...LIMITS,
        // The eye sits south (+z) of the target; the hill is under it.
        terrain: { height: (_x, z) => (z > -10 ? 900 : 0), clearance: 7 },
      };
      const pose = poseFor(state, limits, 1);
      expect(pose.position[1]).toBe(907);
      expect(pose.target[1]).toBe(0);
    });
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])("throws for an aspect of %s", (aspect) => {
    expect(() => poseFor(state, LIMITS, aspect)).toThrow(RangeError);
  });

  it.each([0, -1, Math.PI, Number.NaN])("throws for a field of view of %s", (fov) => {
    expect(() => poseFor(state, { ...LIMITS, fov }, 1)).toThrow(RangeError);
  });
});

describe("screenToGround", () => {
  const state: GroundCameraState = { x: 5, z: -8, span: 120, yaw: -2.1 };

  it("sees the centre pixel on the centre of the state", () => {
    const ground = screenToGround(state, LIMITS, LANDSCAPE, 640, 360);
    expect(ground?.x).toBeCloseTo(5, 9);
    expect(ground?.z).toBeCloseTo(-8, 9);
  });

  it.each([
    ["portrait", PORTRAIT],
    ["landscape", LANDSCAPE],
    ["foldable", FOLDABLE],
  ])("returns a point the camera projects back to the pixel (%s)", (_name, viewport) => {
    const camera = cameraFor(state, LIMITS, viewport);
    for (const [px, py] of [
      [20, 30],
      [viewport.width - 15, viewport.height - 25],
      [viewport.width * 0.7, viewport.height * 0.3],
    ] as const) {
      const ground = screenToGround(state, LIMITS, viewport, px, py);
      expect(ground).not.toBeNull();
      const back = pixelOf(camera, viewport, ground?.x ?? 0, 0, ground?.z ?? 0);
      expect(back.x).toBeCloseTo(px, 6);
      expect(back.y).toBeCloseTo(py, 6);
    }
  });

  it("returns null for a pixel that looks above the horizon", () => {
    const shallow: GroundCameraLimits = { ...LIMITS, pitch: 15 * DEG, fov: 60 * DEG };
    expect(screenToGround(state, shallow, LANDSCAPE, 640, 0)).toBeNull();
    expect(screenToGround(state, shallow, LANDSCAPE, 640, 719)).not.toBeNull();
  });
});
