import { describe, expect, it } from "vitest";
import { babylonEngineOptions } from "../../src/babylon/index.js";
import { QUALITY_TIERS } from "../../src/index.js";

const PHONE = { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)" };
const DESKTOP = { userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/150" };

describe("babylonEngineOptions", () => {
  it("caps the ratio through Babylon's own limitDeviceRatio, with adaptToDeviceRatio on", () => {
    const options = babylonEngineOptions({ navigator: DESKTOP });
    expect(options.adaptToDeviceRatio).toBe(true);
    expect(options.limitDeviceRatio).toBe(QUALITY_TIERS.high.maxDpr);
    expect(options.antialias).toBe(true);
  });

  it("desktop: high-performance GPU with a stencil buffer", () => {
    const options = babylonEngineOptions({ navigator: DESKTOP });
    expect(options.powerPreference).toBe("high-performance");
    expect(options.stencil).toBe(true);
    expect(options.preserveDrawingBuffer).toBe(false);
  });

  it("mobile: low tier by default, low-power GPU, no stencil", () => {
    const options = babylonEngineOptions({ navigator: PHONE });
    expect(options.powerPreference).toBe("low-power");
    expect(options.stencil).toBe(false);
    expect(options.limitDeviceRatio).toBe(1);
    expect(options.antialias).toBe(false);
  });

  it("an explicit quality wins over detection", () => {
    const options = babylonEngineOptions({ navigator: PHONE, quality: QUALITY_TIERS.medium });
    expect(options.limitDeviceRatio).toBe(1.5);
    expect(options.antialias).toBe(true);
  });

  it("overrides are spread last", () => {
    const options = babylonEngineOptions({
      navigator: PHONE,
      overrides: { preserveDrawingBuffer: true, stencil: true },
    });
    expect(options.preserveDrawingBuffer).toBe(true);
    expect(options.stencil).toBe(true);
  });

  it("reads the global navigator when none is given", () => {
    expect(babylonEngineOptions().powerPreference).toBe("high-performance");
  });
});
