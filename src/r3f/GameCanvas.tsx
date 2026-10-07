import type { CanvasProps, RootState } from "@react-three/fiber";
import { Canvas } from "@react-three/fiber";
import type { HTMLAttributes, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { ACESFilmicToneMapping, SRGBColorSpace } from "three";
import { dprRange } from "../core/dpr.js";
import { GAME_CANVAS_HOST_CLASS, gameCanvasHostStyle } from "../core/host.js";
import { DEFAULT_QUALITY, type RenderQuality } from "../core/quality.js";

/** Host element attributes; `data-*` keys are allowed explicitly. */
export type GameCanvasHostProps = HTMLAttributes<HTMLDivElement> & {
  [dataAttribute: `data-${string}`]: string | number | boolean | undefined;
};

export interface GameCanvasProps extends Omit<CanvasProps, "dpr" | "gl"> {
  /**
   * Phase gate: the canvas exists only while true. Going inactive tears the WebGL context down
   * completely, so a menu or idle screen pays nothing for the renderer. Derive it from the game's
   * phase, for example with `isActivePhase`.
   */
  active: boolean;
  /** Pixel-ratio band `[1, maxDpr]` and antialiasing; defaults to the `high` tier. */
  quality?: RenderQuality;
  /**
   * Called on WebGL context loss, after the built-in `preventDefault`. Use it to show a
   * "reconnecting" overlay. Defaults to a console warning.
   */
  onContextLost?: (canvas: HTMLCanvasElement) => void;
  /** Called when the context is restored, just before the canvas remounts. Defaults to a warning. */
  onContextRestored?: (canvas: HTMLCanvasElement) => void;
  /**
   * Keep the drawing buffer for read-back (`toDataURL`, screenshot tests). It costs real
   * performance on mobile GPUs; leave it off unless you capture frames.
   */
  preserveDrawingBuffer?: boolean;
  /** ACES tone-mapping exposure; 1.0 is neutral. Saturation belongs in lighting, not here. */
  toneMappingExposure?: number;
  /** Extra attributes for the host `<div>` (class names are merged, styles override the contract). */
  hostProps?: GameCanvasHostProps;
  children: ReactNode;
}

/**
 * A react-three-fiber `<Canvas>` that fills its parent.
 *
 * Renders `<div class="game-canvas-host">` with the host contract applied inline (no stylesheet
 * import needed) around a `<Canvas>` with: the `dpr` band from `quality`, ACES filmic tone mapping,
 * sRGB output and the high-performance power preference. r3f's own ResizeObserver does the sizing
 * against that box; nothing reads the window size. The parent must resolve to a real height (a
 * `flex: 1; min-height: 0` chain or a sized grid area).
 *
 * WebGL context loss is handled. Browsers drop contexts under memory pressure and when a tab is
 * backgrounded; without `preventDefault` on `webglcontextlost` the context is discarded for good.
 * `preventDefault` alone does not bring the scene back either: three.js cannot re-upload textures,
 * geometry and compiled programs into a restored context, and the remedy react-three-fiber
 * recommends for a lost context is remounting the `<Canvas>`. So on `webglcontextrestored` this
 * component remounts it, and React rebuilds the scene from its props and children. Without that, a
 * long-idle tab comes back to a blank canvas and nothing on screen says why.
 */
export function GameCanvas({
  active,
  quality = DEFAULT_QUALITY,
  onContextLost,
  onContextRestored,
  preserveDrawingBuffer = false,
  toneMappingExposure = 1.0,
  hostProps,
  onCreated,
  children,
  ...canvasProps
}: GameCanvasProps): ReactNode {
  // The listeners are registered once per canvas in onCreated; refs keep them pointing at the
  // latest callbacks.
  const lostRef = useRef(onContextLost);
  const restoredRef = useRef(onContextRestored);
  useEffect(() => {
    lostRef.current = onContextLost;
    restoredRef.current = onContextRestored;
  });

  const [remountKey, setRemountKey] = useState(0);

  if (!active) return null;

  const handleCreated = (state: RootState): void => {
    const canvas = state.gl.domElement;
    canvas.addEventListener(
      "webglcontextlost",
      (event) => {
        event.preventDefault();
        if (lostRef.current) lostRef.current(canvas);
        else console.warn("[game-mount] WebGL context lost; waiting for restore.");
      },
      false
    );
    canvas.addEventListener(
      "webglcontextrestored",
      () => {
        if (restoredRef.current) restoredRef.current(canvas);
        else console.warn("[game-mount] WebGL context restored; remounting the canvas.");
        setRemountKey((key) => key + 1);
      },
      false
    );
    onCreated?.(state);
  };

  const { className: hostClassName, style: hostStyle, ...hostRest } = hostProps ?? {};
  return (
    <div
      className={
        hostClassName ? `${GAME_CANVAS_HOST_CLASS} ${hostClassName}` : GAME_CANVAS_HOST_CLASS
      }
      style={hostStyle ? { ...gameCanvasHostStyle, ...hostStyle } : gameCanvasHostStyle}
      {...hostRest}
    >
      <Canvas
        key={remountKey}
        dpr={[...dprRange(quality.maxDpr)]}
        gl={{
          antialias: quality.antialias,
          powerPreference: "high-performance",
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
