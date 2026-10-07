/**
 * stepPixelRatio state-machine pin — lifted from bone-buster's T2 suite
 * (src/__tests__/unit/bonebuster-adaptiveResolution.test.ts), re-pointed at
 * the extracted package export. The pure function keeps the 60-frame
 * downgrade/upgrade ladder unit-testable without mounting r3f.
 */

import { describe, expect, it } from 'vitest';
import { stepPixelRatio } from '../src/AdaptiveResolution.js';

describe('stepPixelRatio state machine', () => {
  it('starts at cap, in-band fps clears both counters', () => {
    const r = stepPixelRatio({
      avgFps: 45,
      current: 1.5,
      cap: 1.5,
      consecutiveLow: 0,
      consecutiveHigh: 0,
    });
    expect(r.next).toBe(1.5);
    expect(r.consecutiveLow).toBe(0);
    expect(r.consecutiveHigh).toBe(0);
  });

  it("one low window doesn't drop the ratio (debounce)", () => {
    const r = stepPixelRatio({
      avgFps: 25,
      current: 1.5,
      cap: 1.5,
      consecutiveLow: 0,
      consecutiveHigh: 0,
    });
    expect(r.next).toBe(1.5); // unchanged
    expect(r.consecutiveLow).toBe(1);
    expect(r.consecutiveHigh).toBe(0);
  });

  it('two consecutive low windows drop the ratio by 0.1', () => {
    // Window 1: consecutiveLow becomes 1.
    const f1 = stepPixelRatio({
      avgFps: 25,
      current: 1.5,
      cap: 1.5,
      consecutiveLow: 0,
      consecutiveHigh: 0,
    });
    // Window 2: consecutiveLow becomes 2 → cut ratio.
    const f2 = stepPixelRatio({
      avgFps: 25,
      current: f1.next,
      cap: 1.5,
      consecutiveLow: f1.consecutiveLow,
      consecutiveHigh: f1.consecutiveHigh,
    });
    expect(f2.next).toBeCloseTo(1.4, 6);
    expect(f2.consecutiveLow).toBe(0); // counter reset after cut
  });

  it('at the floor (0.5) further low windows stay at 0.5', () => {
    // 2nd low at floor — counter increments but next stays at floor.
    const r = stepPixelRatio({
      avgFps: 25,
      current: 0.5,
      cap: 1.5,
      consecutiveLow: 1,
      consecutiveHigh: 0,
    });
    expect(r.next).toBe(0.5);
    // counter NOT reset because no cut happened
    expect(r.consecutiveLow).toBe(2);
  });

  it('two consecutive high windows raise the ratio by 0.1', () => {
    const f1 = stepPixelRatio({
      avgFps: 60,
      current: 1.0,
      cap: 1.5,
      consecutiveLow: 0,
      consecutiveHigh: 0,
    });
    const f2 = stepPixelRatio({
      avgFps: 60,
      current: f1.next,
      cap: 1.5,
      consecutiveLow: f1.consecutiveLow,
      consecutiveHigh: f1.consecutiveHigh,
    });
    expect(f2.next).toBeCloseTo(1.1, 6);
    expect(f2.consecutiveHigh).toBe(0); // reset after raise
  });

  it('in-band fps clears both counters mid-streak', () => {
    // Build a low streak, then in-band recovers — counter must clear
    // so the next low window starts at 1 again, not 2.
    const r = stepPixelRatio({
      avgFps: 45,
      current: 1.2,
      cap: 1.5,
      consecutiveLow: 1,
      consecutiveHigh: 0,
    });
    expect(r.next).toBe(1.2);
    expect(r.consecutiveLow).toBe(0);
    expect(r.consecutiveHigh).toBe(0);
  });

  it('dpr cap clamps the ratio on raise', () => {
    // At cap=1.0 — even with high fps, can't exceed cap.
    const f1 = stepPixelRatio({
      avgFps: 60,
      current: 1.0,
      cap: 1.0,
      consecutiveLow: 0,
      consecutiveHigh: 1,
    });
    expect(f1.next).toBe(1.0);
    // 2nd consecutive high tries to raise, clamps at cap.
    expect(f1.consecutiveHigh).toBe(2);
  });
});
