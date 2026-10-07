import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import { DEFAULT_MAX_DPR, getDpr } from "../core/dpr.js";
import { stepPixelRatio } from "../core/pixelRatioLadder.js";

/** Frames per measurement window. */
const WINDOW_FRAMES = 60;
/** Windows that end sooner than this after mount (or the previous window) are not acted on. */
const SETTLE_MS = 2000;

export interface AdaptiveResolutionInfo {
  fps: number;
  pixelRatio: number;
  /** Peak draw calls seen in the window, when the renderer reports them. */
  drawCalls?: number;
  /** Peak triangles seen in the window, when the renderer reports them. */
  triangles?: number;
}

export interface AdaptiveResolutionProps {
  /** Called after every window with its stats; wire it to a debug readout. */
  onUpdate?: (info: AdaptiveResolutionInfo) => void;
  /** Ceiling for the ladder; pass the canvas's `quality.maxDpr`. Defaults to 2. */
  maxDpr?: number;
  /** Ratio to start at, capped by `maxDpr` and the device. Defaults to 1.5. */
  startDpr?: number;
  /**
   * `useFrame` priority. The default 0 runs before r3f renders, so the draw-call sample lags one
   * frame. When something else owns the render loop (an EffectComposer at priority 1), pass a
   * value above it to sample this frame's totals. Never pass a positive priority in a plain
   * auto-rendering canvas: a positive priority tells r3f you render manually, and nothing draws.
   */
  priority?: number;
}

/**
 * Adapts the canvas pixel ratio to the frame rate at runtime. Place it inside `<GameCanvas>`.
 *
 * Every 60 frames it averages the frame rate and feeds the ladder (`stepPixelRatio`): two low
 * windows in a row step the ratio down by 0.1 (to a floor of 0.5), two high windows step it up
 * (to `getDpr(maxDpr)`). Windows that end within two seconds of mount are skipped, since the first
 * frames include asset uploads and shader compiles that would trigger a spurious downgrade.
 */
export function AdaptiveResolution({
  onUpdate,
  maxDpr = DEFAULT_MAX_DPR,
  startDpr = 1.5,
  priority = 0,
}: AdaptiveResolutionProps): null {
  const gl = useThree((state) => state.gl);

  const deltas = useRef<number[]>([]);
  const consecutiveLow = useRef(0);
  const consecutiveHigh = useRef(0);
  const lastWindowAt = useRef(performance.now());
  const ratio = useRef(Math.min(getDpr(maxDpr), startDpr));
  // gl.info.render resets on every render by default, so the window keeps the peak instead.
  const peakCalls = useRef(0);
  const peakTriangles = useRef(0);

  useEffect(() => {
    gl.setPixelRatio(ratio.current);
    // Keep render info until this component samples it, and restore the default on unmount.
    gl.info.autoReset = false;
    return () => {
      gl.info.autoReset = true;
    };
  }, [gl]);

  useFrame((_, delta) => {
    const info = gl.info.render as { calls?: number; triangles?: number };
    if (info.calls != null && info.calls > peakCalls.current) peakCalls.current = info.calls;
    if (info.triangles != null && info.triangles > peakTriangles.current) {
      peakTriangles.current = info.triangles;
    }
    gl.info.reset();

    deltas.current.push(delta);
    if (deltas.current.length < WINDOW_FRAMES) return;

    const total = deltas.current.reduce((sum, value) => sum + value, 0);
    const avgFps = deltas.current.length / total;
    deltas.current = [];

    const now = performance.now();
    if (now - lastWindowAt.current < SETTLE_MS) return;
    lastWindowAt.current = now;

    const stepped = stepPixelRatio({
      avgFps,
      current: ratio.current,
      cap: getDpr(maxDpr),
      consecutiveLow: consecutiveLow.current,
      consecutiveHigh: consecutiveHigh.current,
    });
    consecutiveLow.current = stepped.consecutiveLow;
    consecutiveHigh.current = stepped.consecutiveHigh;
    if (stepped.next !== ratio.current) {
      ratio.current = stepped.next;
      gl.setPixelRatio(stepped.next);
    }

    const drawCalls = peakCalls.current > 0 ? peakCalls.current : undefined;
    const triangles = peakTriangles.current > 0 ? peakTriangles.current : undefined;
    peakCalls.current = 0;
    peakTriangles.current = 0;
    onUpdate?.({
      fps: avgFps,
      pixelRatio: stepped.next,
      ...(drawCalls === undefined ? {} : { drawCalls }),
      ...(triangles === undefined ? {} : { triangles }),
    });
  }, priority);

  return null;
}
