/**
 * AdaptiveResolution against a fake r3f: useThree hands out a recording renderer and useFrame
 * hands the per-frame callback to the test, which drives frames and the clock by hand.
 */

import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

interface FakeRenderer {
  pixelRatios: number[];
  setPixelRatio(ratio: number): void;
  info: { autoReset: boolean; render: { calls?: number; triangles?: number }; reset(): void };
}

const fake = vi.hoisted(() => ({
  renderer: null as FakeRenderer | null,
  frame: null as ((state: unknown, delta: number) => void) | null,
  priority: undefined as number | undefined,
}));

vi.mock("@react-three/fiber", () => ({
  useThree: (selector: (state: { gl: FakeRenderer }) => unknown) =>
    selector({ gl: fake.renderer as FakeRenderer }),
  useFrame: (callback: (state: unknown, delta: number) => void, priority?: number) => {
    fake.frame = callback;
    fake.priority = priority;
  },
}));

const { AdaptiveResolution } = await import("../../src/r3f/index.js");

let now = 0;

beforeEach(() => {
  now = 0;
  vi.spyOn(performance, "now").mockImplementation(() => now);
  vi.stubGlobal("devicePixelRatio", 3);
  fake.frame = null;
  fake.priority = undefined;
  fake.renderer = {
    pixelRatios: [],
    setPixelRatio(ratio) {
      this.pixelRatios.push(ratio);
    },
    info: { autoReset: true, render: {}, reset: vi.fn() },
  };
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

/** Run one 60-frame window at `fps`, advancing the clock by `windowMs` first. */
function runWindow(fps: number, windowMs = 2500): void {
  now += windowMs;
  for (let i = 0; i < 60; i++) fake.frame?.({}, 1 / fps);
}

describe("AdaptiveResolution", () => {
  it("starts at min(startDpr, capped device ratio), disables info auto-reset, restores it", () => {
    const view = render(<AdaptiveResolution />);
    const renderer = fake.renderer as FakeRenderer;
    expect(renderer.pixelRatios).toEqual([1.5]);
    expect(renderer.info.autoReset).toBe(false);
    expect(fake.priority).toBe(0);
    view.unmount();
    expect(renderer.info.autoReset).toBe(true);
  });

  it("caps the start and the climb at getDpr(maxDpr)", () => {
    render(<AdaptiveResolution maxDpr={1.2} startDpr={2} priority={2} />);
    const renderer = fake.renderer as FakeRenderer;
    expect(renderer.pixelRatios).toEqual([1.2]);
    expect(fake.priority).toBe(2);
    runWindow(60);
    runWindow(60);
    expect(renderer.pixelRatios).toEqual([1.2]);
  });

  it("steps down after two slow windows and reports each window", () => {
    const onUpdate = vi.fn();
    render(<AdaptiveResolution onUpdate={onUpdate} />);
    const renderer = fake.renderer as FakeRenderer;
    renderer.info.render = { calls: 12, triangles: 3400 };
    runWindow(20);
    expect(onUpdate).toHaveBeenLastCalledWith({
      fps: expect.closeTo(20, 5),
      pixelRatio: 1.5,
      drawCalls: 12,
      triangles: 3400,
    });
    renderer.info.render = {};
    runWindow(20);
    expect(renderer.pixelRatios).toEqual([1.5, 1.4]);
    // No draw-call figures were seen in that window, so none are reported.
    expect(onUpdate).toHaveBeenLastCalledWith({ fps: expect.closeTo(20, 5), pixelRatio: 1.4 });
    expect(renderer.info.reset).toHaveBeenCalledTimes(120);
  });

  it("keeps the peak, not the last, draw-call sample in a window", () => {
    const onUpdate = vi.fn();
    render(<AdaptiveResolution onUpdate={onUpdate} />);
    const renderer = fake.renderer as FakeRenderer;
    now += 2500;
    for (let i = 0; i < 60; i++) {
      renderer.info.render = { calls: i === 10 ? 99 : 5, triangles: i === 20 ? 7000 : 10 };
      fake.frame?.({}, 1 / 45);
    }
    expect(onUpdate).toHaveBeenLastCalledWith(
      expect.objectContaining({ drawCalls: 99, triangles: 7000 })
    );
  });

  it("climbs after two fast windows", () => {
    render(<AdaptiveResolution startDpr={1} />);
    runWindow(60);
    runWindow(60);
    expect((fake.renderer as FakeRenderer).pixelRatios).toEqual([1, 1.1]);
  });

  it("ignores windows that end within the settle time", () => {
    const onUpdate = vi.fn();
    render(<AdaptiveResolution onUpdate={onUpdate} />);
    runWindow(10, 500);
    runWindow(10, 500);
    expect(onUpdate).not.toHaveBeenCalled();
    expect((fake.renderer as FakeRenderer).pixelRatios).toEqual([1.5]);
  });
});
