import type { CanvasProps, RootState } from '@react-three/fiber';
import { Canvas } from '@react-three/fiber';
import type { HTMLAttributes, ReactNode } from 'react';
import { useEffect, useRef } from 'react';
import { ACESFilmicToneMapping, SRGBColorSpace } from 'three';
import { CABINET_CANVAS_HOST_CLASS, cabinetCanvasHostStyle } from './hostStyle.js';

/** Device/quality tier resolved by the caller (a `getQuality()`-style read).
 * Drives the Canvas dpr band `[1, maxDpr]` and the antialias default —
 * high-DPI phones pay quadratic fill cost, so low tiers clamp dpr and drop
 * MSAA (blobolines' quality bridge pattern). */
export interface CabinetQuality {
  maxDpr: number;
  antialias: boolean;
}

/** Host-div attributes; `data-*` explicitly allowed (object literals typed
 * as `HTMLAttributes` reject hyphenated keys otherwise). */
export type CabinetCanvasHostProps = HTMLAttributes<HTMLDivElement> & {
  [dataAttr: `data-${string}`]: string | number | boolean | undefined;
};

export interface CabinetCanvasProps extends Omit<CanvasProps, 'dpr' | 'gl'> {
  /** Quality tier; defaults to `{ maxDpr: 2, antialias: true }` (the
   * welcoming-wilds desktop baseline). */
  quality?: CabinetQuality;
  /** Mount gate: the canvas only renders while true. Unmounting fully tears
   * down the WebGL context — menu/idle screens should not pay renderer cost
   * (the blobolines menu-vs-run split, welcoming-wilds' phase gate). */
  active: boolean;
  /** Called on WebGL context loss (after the baked-in `preventDefault`,
   * which tells the browser we intend to recover). Override to show a
   * "reconnecting" overlay; default logs a console.warn. */
  onContextLost?: (canvas: HTMLCanvasElement) => void;
  /** Called when the context is restored (three re-initializes itself).
   * Default logs a console.warn. */
  onContextRestored?: (canvas: HTMLCanvasElement) => void;
  /** Needed only when something reads the canvas back (screenshot pipelines,
   * `toDataURL()` harnesses). Carries a real mobile perf cost — keep it off
   * in production unless you capture frames. */
  preserveDrawingBuffer?: boolean;
  /** Tone-mapping exposure; 1.0 is the canonical ACES baseline (welcoming-
   * wilds' visual-judge finding: saturation belongs to scene lighting, not
   * exposure). */
  toneMappingExposure?: number;
  /** Extra props (e.g. `data-*` attributes) for the host div this component
   * renders around the Canvas. */
  hostProps?: CabinetCanvasHostProps;
  children: ReactNode;
}

/**
 * `<CabinetCanvas>` — the parent-sized r3f mount wrapper.
 *
 * Renders `<div class="cabinet-canvas-host">` (inline-styled with
 * `cabinetCanvasHostStyle`, so the contract holds without a stylesheet
 * import) around an r3f `<Canvas>` configured with the fleet-audited
 * defaults: dpr band from the quality tier, ACES filmic tone mapping,
 * sRGB output, high-performance power preference.
 *
 * Sizing is 100% delegated to r3f's own ResizeObserver against a parent the
 * CSS contract guarantees resolves correctly — no vh/vw/innerWidth reads
 * anywhere. The CALLER owns the other half of the contract: the immediate
 * ancestor must resolve to a real box height (flex:1 + min-height:0 chain,
 * or a sized grid area). See the README — `min-height: 0` is the #1 footgun.
 *
 * WebGL context-loss handling is baked in (ported from blobolines, the only
 * fleet member that had it): mobile GPUs drop the context on backgrounding /
 * memory pressure; without `preventDefault` on `webglcontextlost` the canvas
 * goes permanently blank instead of recovering on `webglcontextrestored`.
 */
export function CabinetCanvas({
  quality = { maxDpr: 2, antialias: true },
  active,
  onContextLost,
  onContextRestored,
  preserveDrawingBuffer = false,
  toneMappingExposure = 1.0,
  hostProps,
  onCreated,
  children,
  ...canvasProps
}: CabinetCanvasProps): ReactNode {
  // Keep the latest callbacks in refs so the listeners registered once in
  // onCreated never go stale across re-renders.
  const lostRef = useRef(onContextLost);
  const restoredRef = useRef(onContextRestored);
  useEffect(() => {
    lostRef.current = onContextLost;
    restoredRef.current = onContextRestored;
  });

  if (!active) return null;

  const handleCreated = (state: RootState): void => {
    const canvas = state.gl.domElement;
    canvas.addEventListener(
      'webglcontextlost',
      (e) => {
        // preventDefault tells the browser we'll recover; three then
        // re-initializes on `webglcontextrestored`. Without it the canvas
        // stays permanently blank after a mobile-GPU context drop.
        e.preventDefault();
        if (lostRef.current) {
          lostRef.current(canvas);
        } else {
          console.warn('[r3f-mount] WebGL context lost — awaiting restore.');
        }
      },
      false,
    );
    canvas.addEventListener(
      'webglcontextrestored',
      () => {
        if (restoredRef.current) {
          restoredRef.current(canvas);
        } else {
          console.warn('[r3f-mount] WebGL context restored.');
        }
      },
      false,
    );
    onCreated?.(state);
  };

  const { className: hostClassName, style: hostStyle, ...hostRest } = hostProps ?? {};
  return (
    <div
      className={
        hostClassName ? `${CABINET_CANVAS_HOST_CLASS} ${hostClassName}` : CABINET_CANVAS_HOST_CLASS
      }
      style={hostStyle ? { ...cabinetCanvasHostStyle, ...hostStyle } : cabinetCanvasHostStyle}
      {...hostRest}
    >
      <Canvas
        dpr={[1, quality.maxDpr]}
        gl={{
          antialias: quality.antialias,
          powerPreference: 'high-performance',
          toneMapping: ACESFilmicToneMapping,
          toneMappingExposure,
          outputColorSpace: SRGBColorSpace,
          preserveDrawingBuffer,
        }}
        onCreated={handleCreated}
        {...canvasProps}
      >
        {children}
      </Canvas>
    </div>
  );
}
