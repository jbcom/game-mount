/**
 * The renderer-neutral policy: DPR capping, device detection, quality tiers, reduced motion and
 * phase gating.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_MAX_DPR,
  DEFAULT_QUALITY,
  detectQuality,
  detectQualityTier,
  detectReduceMotion,
  dprRange,
  getDpr,
  isActivePhase,
  isMobileDevice,
  QUALITY_TIERS,
  readDevicePixelRatio,
} from "../../src/index.js";

const IPHONE = { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)" };
const ANDROID = { userAgent: "Mozilla/5.0 (Linux; Android 16; Pixel 9)" };
const DESKTOP = { userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/150" };
const IPAD_AS_MAC = { ...DESKTOP, maxTouchPoints: 5 };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("readDevicePixelRatio", () => {
  it("reads devicePixelRatio and falls back to 1 for missing or invalid values", () => {
    vi.stubGlobal("devicePixelRatio", 2.75);
    expect(readDevicePixelRatio()).toBe(2.75);
    for (const bad of [Number.NaN, -1, 0, Number.POSITIVE_INFINITY, "2", undefined]) {
      vi.stubGlobal("devicePixelRatio", bad);
      expect(readDevicePixelRatio()).toBe(1);
    }
  });
});

describe("getDpr", () => {
  it("caps the device ratio at maxDpr, defaulting to 2", () => {
    expect(DEFAULT_MAX_DPR).toBe(2);
    expect(getDpr(undefined, 3)).toBe(2);
    expect(getDpr(3, 3)).toBe(3);
    expect(getDpr(1.5, 2.75)).toBe(1.5);
    vi.stubGlobal("devicePixelRatio", 3);
    expect(getDpr()).toBe(2);
  });

  it("raises a zoomed-out ratio to 1, unless the cap itself is below 1", () => {
    expect(getDpr(2, 0.5)).toBe(1);
    expect(getDpr(0.75, 3)).toBe(0.75);
  });

  it("rejects a cap that is not a positive finite number", () => {
    for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => getDpr(bad, 2)).toThrow(RangeError);
      expect(() => dprRange(bad)).toThrow(RangeError);
    }
  });
});

describe("dprRange", () => {
  it("is [1, maxDpr], or [maxDpr, maxDpr] below 1", () => {
    expect(dprRange()).toEqual([1, 2]);
    expect(dprRange(1.5)).toEqual([1, 1.5]);
    expect(dprRange(0.75)).toEqual([0.75, 0.75]);
  });
});

describe("isMobileDevice", () => {
  it("detects phones, tablets and iPadOS's desktop user agent", () => {
    expect(isMobileDevice(IPHONE)).toBe(true);
    expect(isMobileDevice(ANDROID)).toBe(true);
    expect(isMobileDevice(IPAD_AS_MAC)).toBe(true);
    expect(isMobileDevice({ userAgent: "x", userAgentData: { mobile: true } })).toBe(true);
  });

  it("does not flag desktops, an empty navigator, or a missing one", () => {
    expect(isMobileDevice(DESKTOP)).toBe(false);
    expect(isMobileDevice({ ...DESKTOP, userAgentData: { mobile: false } })).toBe(false);
    expect(isMobileDevice({})).toBe(false);
    vi.stubGlobal("navigator", undefined);
    expect(isMobileDevice()).toBe(false);
  });

  it("reads the global navigator by default", () => {
    vi.stubGlobal("navigator", IPHONE);
    expect(isMobileDevice()).toBe(true);
  });
});

describe("quality tiers", () => {
  it("are frozen, ordered by cost, and high is the default", () => {
    expect(QUALITY_TIERS.low).toEqual({ maxDpr: 1, antialias: false });
    expect(QUALITY_TIERS.medium).toEqual({ maxDpr: 1.5, antialias: true });
    expect(QUALITY_TIERS.high).toEqual({ maxDpr: 2, antialias: true });
    expect(DEFAULT_QUALITY).toBe(QUALITY_TIERS.high);
    expect(Object.isFrozen(QUALITY_TIERS)).toBe(true);
    expect(Object.isFrozen(QUALITY_TIERS.high)).toBe(true);
  });

  it("detect low on mobile and high elsewhere", () => {
    expect(detectQualityTier(ANDROID)).toBe("low");
    expect(detectQualityTier(DESKTOP)).toBe("high");
    expect(detectQuality(IPHONE)).toBe(QUALITY_TIERS.low);
    vi.stubGlobal("navigator", DESKTOP);
    expect(detectQuality()).toBe(QUALITY_TIERS.high);
  });
});

describe("detectReduceMotion", () => {
  it("reads prefers-reduced-motion", () => {
    const queries: string[] = [];
    vi.stubGlobal("matchMedia", (query: string) => {
      queries.push(query);
      return { matches: true };
    });
    expect(detectReduceMotion()).toBe(true);
    expect(queries).toEqual(["(prefers-reduced-motion: reduce)"]);
    vi.stubGlobal("matchMedia", () => ({ matches: false }));
    expect(detectReduceMotion()).toBe(false);
  });

  it("is false without matchMedia or when it throws", () => {
    vi.stubGlobal("matchMedia", undefined);
    expect(detectReduceMotion()).toBe(false);
    vi.stubGlobal("matchMedia", () => {
      throw new Error("unsupported");
    });
    expect(detectReduceMotion()).toBe(false);
  });
});

describe("isActivePhase", () => {
  it("matches one phase or any of several", () => {
    expect(isActivePhase("playing", "playing")).toBe(true);
    expect(isActivePhase("menu", "playing")).toBe(false);
    expect(isActivePhase("paused", ["playing", "paused"])).toBe(true);
    expect(isActivePhase("menu", ["playing", "paused"])).toBe(false);
    expect(isActivePhase(2, [1, 2, 3])).toBe(true);
  });
});
