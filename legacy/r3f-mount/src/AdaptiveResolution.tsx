import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';

/**
 * Pure step function for the AdaptiveResolution downgrade/upgrade ladder
 * (bone-buster's `stepPixelRatio`, the fleet's strongest runtime
 * perf-tiering logic). Extracted so the state machine can be unit-tested
 * without mounting r3f. The component below is a thin wrapper that pumps
 * useFrame deltas through this function and writes the result back to
 * `gl.setPixelRatio()`.
 *
 * Contract:
 *  - avgFps < 30 increments `consecutiveLow`, resets `consecutiveHigh`.
 *    On the 2nd consecutive low, drop ratio by 0.1 (floor 0.5).
 *  - avgFps > 55 increments `consecutiveHigh`, resets `consecutiveLow`.
 *    On the 2nd consecutive high, raise ratio by 0.1 (cap `cap`).
 *  - In-band (30..55) resets both counters.
 *
 * Returns `next` ratio plus the updated counters. Caller swaps in `next`
 * for `current` on the next call.
 */
export type StepPixelRatioInput = Readonly<{
  avgFps: number;
  current: number;
  cap: number;
  consecutiveLow: number;
  consecutiveHigh: number;
}>;

export type StepPixelRatioResult = Readonly<{
  next: number;
  consecutiveLow: number;
  consecutiveHigh: number;
}>;

export function stepPixelRatio(input: StepPixelRatioInput): StepPixelRatioResult {
  const { avgFps, current, cap } = input;
  let { consecutiveLow, consecutiveHigh } = input;
  let next = current;

  if (avgFps < 30) {
    consecutiveLow += 1;
    consecutiveHigh = 0;
    if (consecutiveLow >= 2 && current > 0.5) {
      next = Math.max(0.5, (current * 10 - 1) / 10);
      consecutiveLow = 0;
    }
  } else if (avgFps > 55) {
    consecutiveHigh += 1;
    consecutiveLow = 0;
    if (consecutiveHigh >= 2 && current < cap) {
      next = Math.min(cap, (current * 10 + 1) / 10);
      consecutiveHigh = 0;
    }
  } else {
    consecutiveLow = 0;
    consecutiveHigh = 0;
  }

  return { next, consecutiveLow, consecutiveHigh };
}

export interface AdaptiveResolutionProps {
  /** Fires on every 60-frame window with the rolling stats — wire to a
   * debug HUD readout. */
  onUpdate?: (info: {
    fps: number;
    pixelRatio: number;
    drawCalls?: number;
    triangles?: number;
  }) => void;
  /** Starting pixel-ratio clamp; match your Canvas's dpr max band (e.g.
   * `quality.maxDpr`). Default 1.5, the bone-buster mobile baseline. */
  startCap?: number;
  /** r3f `useFrame` render priority. Default 0 (runs BEFORE r3f's render, so
   * the drawCalls/triangles sample lags one frame — harmless for a debug
   * readout). If something else already owns the render loop (an
   * EffectComposer at priority 1, as in bone-buster), pass a value above it
   * (e.g. 2) to sample THIS frame's totals post-render. Do NOT pass a
   * positive priority in a plain auto-rendering Canvas — any positive
   * useFrame priority tells r3f you render manually, and the scene goes
   * black. */
  priority?: number;
}

/**
 * Adaptive resolution (bone-buster E12/PA16). Lives inside `<Canvas>`,
 * samples frame deltas through `useFrame`, and adjusts `gl.setPixelRatio()`
 * dynamically when the rolling FPS drifts out of the target band.
 *
 * Algorithm:
 *  - Maintain a 60-frame rolling buffer of frame deltas.
 *  - Every 60 frames, compute average FPS.
 *  - If avg < 30 FPS for 2 consecutive windows, drop pixel ratio by 0.1
 *    (down to a 0.5 floor).
 *  - If avg > 55 FPS for 2 consecutive windows, raise pixel ratio by 0.1
 *    (up to the devicePixelRatio ceiling).
 *  - The 2-window debounce prevents oscillation under transient spikes
 *    (loading a new GLB, audio-context warmup, etc).
 *  - The very first window after mount is skipped — initial frames include
 *    asset loads that would otherwise trip a spurious downgrade.
 *
 * The Canvas's static dpr band sets the starting point (`startCap`); this
 * component narrows/widens the effective ratio at runtime.
 */
export function AdaptiveResolution({
  onUpdate,
  startCap = 1.5,
  priority = 0,
}: AdaptiveResolutionProps): null {
  const gl = useThree((s) => s.gl);

  const deltaBuf = useRef<number[]>([]);
  const consecutiveLow = useRef(0);
  const consecutiveHigh = useRef(0);
  const lastUpdateAt = useRef(performance.now());
  const ratioRef = useRef<number>(Math.min(window.devicePixelRatio || 1, startCap));
  // Sample PEAK draw-call + triangle counts across the 60-frame window.
  // `gl.info.render` resets per-render by default, so we accumulate the max
  // seen between windows instead of the last value alone.
  const peakCalls = useRef(0);
  const peakTris = useRef(0);

  useEffect(() => {
    gl.setPixelRatio(ratioRef.current);
    // Disable auto-reset so render info survives until our useFrame sample;
    // we call `gl.info.reset()` manually after sampling instead. Restore the
    // default on unmount so the renderer isn't left in a surprising state.
    gl.info.autoReset = false;
    return () => {
      gl.info.autoReset = true;
    };
  }, [gl]);

  useFrame((_, dt) => {
    // With the default priority 0 this runs BEFORE r3f's render, so the
    // info read is last frame's totals (autoReset=false preserved them);
    // with a positive priority above a render-owning composer it reads this
    // frame's totals post-render. Either way: read, then reset.
    const info = gl.info.render as { calls?: number; triangles?: number };
    if (info.calls != null && info.calls > peakCalls.current) peakCalls.current = info.calls;
    if (info.triangles != null && info.triangles > peakTris.current)
      peakTris.current = info.triangles;
    gl.info.reset();

    deltaBuf.current.push(dt);
    if (deltaBuf.current.length < 60) return;

    const total = deltaBuf.current.reduce((a, b) => a + b, 0);
    const avgFps = deltaBuf.current.length / total;
    deltaBuf.current = [];

    const now = performance.now();
    // Skip the very first window after mount — initial frames include asset
    // loads + audio warmup which would otherwise trip a downgrade.
    if (now - lastUpdateAt.current < 2000) return;
    lastUpdateAt.current = now;

    const cap = window.devicePixelRatio || 1;
    const current = ratioRef.current;
    const stepped = stepPixelRatio({
      avgFps,
      current,
      cap,
      consecutiveLow: consecutiveLow.current,
      consecutiveHigh: consecutiveHigh.current,
    });
    consecutiveLow.current = stepped.consecutiveLow;
    consecutiveHigh.current = stepped.consecutiveHigh;
    const next = stepped.next;

    if (next !== current) {
      ratioRef.current = next;
      gl.setPixelRatio(next);
    }

    // Emit the PEAK calls + triangles observed during the 60-frame window,
    // then reset the peaks for the next window.
    const drawCalls = peakCalls.current > 0 ? peakCalls.current : undefined;
    const triangles = peakTris.current > 0 ? peakTris.current : undefined;
    peakCalls.current = 0;
    peakTris.current = 0;
    onUpdate?.({
      fps: avgFps,
      pixelRatio: next,
      drawCalls,
      triangles,
    });
  }, priority);

  return null;
}
