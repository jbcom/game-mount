import { describe, expect, it } from "vitest";
import { DEFAULT_SMOOTHING, easeToward, type GroundCameraState } from "../../src/camera/index.js";

const from: GroundCameraState = { x: 0, z: 0, span: 40, yaw: 0 };
const goal: GroundCameraState = { x: 100, z: -50, span: 160, yaw: 1 };

describe("easeToward", () => {
  it("closes 1 - 1/e of the gap in one smoothing time", () => {
    const next = easeToward(from, goal, 0.5, 0.5);
    const k = 1 - Math.exp(-1);
    expect(next.x).toBeCloseTo(100 * k, 9);
    expect(next.z).toBeCloseTo(-50 * k, 9);
    expect(next.yaw).toBeCloseTo(k, 9);
  });

  it("eases the span geometrically so zoom steps feel even", () => {
    const next = easeToward(from, goal, 0.5, 0.5);
    expect(next.span).toBeCloseTo(40 * 4 ** (1 - Math.exp(-1)), 9);
  });

  it("is independent of the frame rate: two half steps equal one whole step", () => {
    const whole = easeToward(from, goal, 1 / 30);
    const half = easeToward(easeToward(from, goal, 1 / 60), goal, 1 / 60);
    expect(half.x).toBeCloseTo(whole.x, 9);
    expect(half.z).toBeCloseTo(whole.z, 9);
    expect(half.span).toBeCloseTo(whole.span, 9);
    expect(half.yaw).toBeCloseTo(whole.yaw, 9);
  });

  it("converges on the goal", () => {
    let state = from;
    for (let frame = 0; frame < 600; frame += 1) state = easeToward(state, goal, 1 / 60);
    expect(state.x).toBeCloseTo(100, 6);
    expect(state.z).toBeCloseTo(-50, 6);
    expect(state.span).toBeCloseTo(160, 6);
    expect(state.yaw).toBeCloseTo(1, 6);
  });

  it("never overshoots, even for a huge frame time", () => {
    const next = easeToward(from, goal, 1e6);
    expect(next.x).toBeCloseTo(100, 9);
    expect(next.span).toBeCloseTo(160, 9);
  });

  it("turns the short way round for yaw", () => {
    const next = easeToward(
      { ...from, yaw: Math.PI - 0.1 },
      { ...goal, yaw: -Math.PI + 0.1 },
      0.1,
      0.1
    );
    // The short arc is 0.2 radians through pi, so the yaw moves up past pi and wraps negative.
    const k = 1 - Math.exp(-1);
    expect(next.yaw).toBeCloseTo(Math.PI - 0.1 + 0.2 * k - 2 * Math.PI, 9);
  });

  it("keeps a state that is already at the goal", () => {
    const next = easeToward(goal, goal, 0.1);
    expect(next.x).toBeCloseTo(goal.x, 9);
    expect(next.span).toBeCloseTo(goal.span, 9);
    expect(next.yaw).toBeCloseTo(goal.yaw, 9);
  });

  it("does not move for a zero or negative frame time", () => {
    expect(easeToward(from, goal, 0)).toBe(from);
    expect(easeToward(from, goal, -1)).toBe(from);
    expect(easeToward(from, goal, Number.NaN)).toBe(from);
  });

  it("snaps to the goal when the smoothing time is zero or negative", () => {
    expect(easeToward(from, goal, 0.016, 0)).toBe(goal);
    expect(easeToward(from, goal, 0.016, -3)).toBe(goal);
  });

  it("defaults to a smoothing time of DEFAULT_SMOOTHING", () => {
    expect(easeToward(from, goal, 0.05)).toEqual(easeToward(from, goal, 0.05, DEFAULT_SMOOTHING));
  });
});
