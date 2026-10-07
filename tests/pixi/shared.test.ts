import { afterEach, describe, expect, it, vi } from "vitest";
import { QUALITY_TIERS } from "../../src/index.js";
import { measure, pixiRenderOptions, toPixelSize } from "../../src/pixi/shared.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

function sized<T extends HTMLElement>(element: T, width: number, height: number): T {
  Object.defineProperty(element, "clientWidth", { configurable: true, value: width });
  Object.defineProperty(element, "clientHeight", { configurable: true, value: height });
  return element;
}

describe("measure", () => {
  it("reads an element's CSS box", () => {
    expect(measure(sized(document.createElement("div"), 640, 360), 1, 1)).toEqual([640, 360]);
  });

  it("falls back to a canvas's backing size, then to the given size", () => {
    const canvas = document.createElement("canvas");
    canvas.width = 320;
    canvas.height = 0;
    expect(measure(canvas, 11, 22)).toEqual([320, 22]);
    expect(measure(document.createElement("div"), 11, 22)).toEqual([11, 22]);
  });

  it("reads the window, falling back when it reports nothing", () => {
    expect(measure(window, 1, 1)).toEqual([window.innerWidth, window.innerHeight]);
    const empty: Record<string, unknown> = { innerWidth: 0, innerHeight: 0 };
    empty.window = empty;
    expect(measure(empty as unknown as Window, 33, 44)).toEqual([33, 44]);
  });
});

describe("toPixelSize", () => {
  it("floors to integers and never goes below 1x1", () => {
    expect(toPixelSize(1023.9, 0.4)).toEqual([1023, 1]);
  });
});

describe("pixiRenderOptions", () => {
  it("maps a quality onto resolution and antialias, and pixel-art mode overrides both", () => {
    vi.stubGlobal("devicePixelRatio", 3);
    expect(pixiRenderOptions(QUALITY_TIERS.medium, false)).toEqual({
      antialias: true,
      resolution: 1.5,
      autoDensity: true,
      roundPixels: false,
    });
    expect(pixiRenderOptions(QUALITY_TIERS.high, true)).toEqual({
      antialias: false,
      resolution: 1,
      autoDensity: true,
      roundPixels: true,
    });
  });
});
