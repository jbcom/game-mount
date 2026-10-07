/**
 * game-mount/pixi/pixi-react: `PixiReactMount`, the mount policy for `@pixi/react`. Needs
 * `pixi.js`, `react` and `@pixi/react`.
 *
 * `@pixi/react` v8 creates and owns its Application and cannot adopt one from `mountPixi`, so this
 * component wraps `@pixi/react`'s own `<Application>` and never creates a second one. React owns
 * the canvas and `@pixi/react` owns teardown; this component adds the same quality, reduced-motion
 * and single resize-pipeline contracts `mountPixi` has, around that one Application.
 */

import { type ApplicationRef, Application as PixiReactApplication } from "@pixi/react";
import type { Application } from "pixi.js";
import {
  type ComponentProps,
  type ReactElement,
  type RefObject,
  useCallback,
  useEffect,
  useRef,
} from "react";
import { detectReduceMotion } from "../core/motion.js";
import { DEFAULT_QUALITY, type RenderQuality } from "../core/quality.js";
import {
  DEFAULT_BACKGROUND,
  FALLBACK_HEIGHT,
  FALLBACK_WIDTH,
  isWindow,
  measure,
  type PixiResizeMode,
  pixiRenderOptions,
  type ResizeEmitter,
  toPixelSize,
} from "./shared.js";

type PixiReactChildren = ComponentProps<typeof PixiReactApplication>["children"];

export type PixiReactResizeTarget = HTMLElement | Window | RefObject<HTMLElement | null>;

export interface PixiReactMountHandle {
  /** The only Application; `@pixi/react` creates and destroys it. */
  readonly app: Application;
  /** The React-owned canvas the Application renders to. */
  readonly canvas: HTMLCanvasElement;
  /** Whether reduced motion is honoured for this mount. */
  readonly reduceMotion: boolean;
  /** Current logical width in CSS pixels. */
  readonly width: number;
  /** Current logical height in CSS pixels. */
  readonly height: number;
  /** Resize to integer CSS pixels: renderer first, then `onResize`; same-size requests are ignored. */
  resize(width: number, height: number): void;
}

export interface PixiReactMountProps {
  children?: PixiReactChildren;
  /** Class for the canvas. */
  className?: string;
  /** Clear colour. Defaults to a near-black. */
  background?: number | string;
  /** Pixel-ratio cap and antialiasing; defaults to the `high` tier. */
  quality?: RenderQuality;
  /** Pixel-art mode: integer coordinates, resolution 1, no antialiasing. */
  pixelSnap?: boolean;
  /** Honour reduced motion. Detected from `prefers-reduced-motion` when omitted. */
  reduceMotion?: boolean;
  /** Resize wiring; defaults to one ResizeObserver. */
  resizeMode?: PixiResizeMode;
  /** The element (or window) whose box sets the size. Defaults to the canvas's parent. */
  resizeTarget?: PixiReactResizeTarget;
  /** Called after every renderer resize, for scene reflow. */
  onResize?: (width: number, height: number) => void;
  /** Called once for each Application that finishes initialising. */
  onReady?: (handle: PixiReactMountHandle) => void;
}

interface CapturedOptions {
  readonly background: number | string;
  readonly quality: RenderQuality;
  readonly pixelSnap: boolean;
  readonly reduceMotion: boolean;
  readonly resizeMode: PixiResizeMode;
  readonly resizeTarget?: PixiReactResizeTarget;
}

/** One initialised Application and the resize wiring currently attached to it. */
interface MountedRuntime {
  readonly app: Application;
  readonly canvas: HTMLCanvasElement;
  readonly handle: PixiReactMountHandle;
  currentWidth: number;
  currentHeight: number;
  /** Detaches the wiring; `null` while unbound. */
  unbind: (() => void) | null;
}

function unbind(runtime: MountedRuntime): void {
  runtime.unbind?.();
  runtime.unbind = null;
}

function isRefTarget(target: PixiReactResizeTarget): target is RefObject<HTMLElement | null> {
  return "current" in target;
}

function resolveTarget(target: PixiReactResizeTarget | undefined): HTMLElement | Window | null {
  if (target === undefined) return null;
  return isRefTarget(target) ? target.current : target;
}

/**
 * Attach the single resize pipeline to a runtime and return the function that detaches it: the
 * renderer's `resize` event feeds the handle and `onResize`, and the chosen resize mode feeds
 * `renderer.resize()`.
 */
function attach(
  runtime: MountedRuntime,
  options: CapturedOptions,
  onResize: () => ((width: number, height: number) => void) | undefined
): () => void {
  const emitter = runtime.app.renderer as unknown as ResizeEmitter;
  const listener = (width: number, height: number): void => {
    runtime.currentWidth = width;
    runtime.currentHeight = height;
    onResize()?.(width, height);
  };
  emitter.on("resize", listener);
  const detach: Array<() => void> = [() => emitter.off("resize", listener)];

  const target =
    resolveTarget(options.resizeTarget) ?? runtime.canvas.parentElement ?? runtime.canvas;
  const resizeToTarget = (): void => {
    const [width, height] = measure(target, runtime.currentWidth, runtime.currentHeight);
    runtime.handle.resize(width, height);
  };

  if (options.resizeMode === "observer") {
    if (isWindow(target)) {
      target.addEventListener("resize", resizeToTarget);
      detach.push(() => target.removeEventListener("resize", resizeToTarget));
    } else if (typeof globalThis.ResizeObserver === "function") {
      const observer = new globalThis.ResizeObserver((entries) => {
        for (const entry of entries) {
          runtime.handle.resize(entry.contentRect.width, entry.contentRect.height);
        }
      });
      observer.observe(target);
      detach.push(() => observer.disconnect());
    }
    resizeToTarget();
  } else if (options.resizeMode === "resizeTo") {
    runtime.app.resizeTo = target;
    resizeToTarget();
  }

  return () => {
    for (const step of detach) step();
  };
}

/**
 * Render one `@pixi/react` Application under the shared mount policy.
 *
 * Mount options are captured for the component's lifetime; change its `key` to rebuild with
 * different ones. `onResize` and `onReady` are always read from the latest props.
 */
export function PixiReactMount({
  children,
  className,
  background = DEFAULT_BACKGROUND,
  quality = DEFAULT_QUALITY,
  pixelSnap = false,
  reduceMotion,
  resizeMode = "observer",
  resizeTarget,
  onResize,
  onReady,
}: PixiReactMountProps): ReactElement {
  const applicationRef = useRef<ApplicationRef | null>(null);
  const runtimeRef = useRef<MountedRuntime | null>(null);
  const mountedRef = useRef(true);
  const onResizeRef = useRef(onResize);
  const onReadyRef = useRef(onReady);
  onResizeRef.current = onResize;
  onReadyRef.current = onReady;

  const capturedRef = useRef<CapturedOptions | null>(null);
  capturedRef.current ??= {
    background,
    quality,
    pixelSnap,
    reduceMotion: reduceMotion ?? detectReduceMotion(),
    resizeMode,
    ...(resizeTarget === undefined ? {} : { resizeTarget }),
  };
  const captured = capturedRef.current;

  const bind = useCallback(
    (runtime: MountedRuntime): void => {
      runtime.unbind = attach(runtime, captured, () => onResizeRef.current);
    },
    [captured]
  );

  const handleInit = useCallback(
    (app: Application): void => {
      // @pixi/react initialises asynchronously; this component may be gone by then.
      if (!mountedRef.current) return;
      const canvas = applicationRef.current?.getCanvas();
      if (!canvas) throw new Error("@pixi/react initialised without exposing its canvas");

      canvas.style.display = "block";
      canvas.style.width = "100%";
      canvas.style.height = "100%";

      // A replaced Application (a remount inside @pixi/react) leaves its wiring behind; drop it.
      if (runtimeRef.current) unbind(runtimeRef.current);

      let runtime: MountedRuntime;
      const handle: PixiReactMountHandle = {
        app,
        canvas,
        reduceMotion: captured.reduceMotion,
        get width() {
          return runtime.currentWidth;
        },
        get height() {
          return runtime.currentHeight;
        },
        resize(width: number, height: number): void {
          const [nextWidth, nextHeight] = toPixelSize(width, height);
          if (nextWidth === runtime.currentWidth && nextHeight === runtime.currentHeight) return;
          app.renderer.resize(nextWidth, nextHeight);
        },
      };
      runtime = {
        app,
        canvas,
        handle,
        currentWidth: app.screen.width,
        currentHeight: app.screen.height,
        unbind: null,
      };
      runtimeRef.current = runtime;
      bind(runtime);
      onReadyRef.current?.(handle);
    },
    [bind, captured]
  );

  useEffect(() => {
    mountedRef.current = true;
    // Effects reconnecting (StrictMode, a hidden <Activity> shown again) rebind only an
    // Application @pixi/react still holds; a replaced one is wired by its own onInit.
    const runtime = runtimeRef.current;
    if (runtime !== null && applicationRef.current?.getApplication() === runtime.app) {
      bind(runtime);
    }
    return () => {
      mountedRef.current = false;
      if (runtimeRef.current) unbind(runtimeRef.current);
    };
  }, [bind]);

  return (
    <PixiReactApplication
      ref={applicationRef}
      className={className}
      width={FALLBACK_WIDTH}
      height={FALLBACK_HEIGHT}
      background={captured.background}
      {...pixiRenderOptions(captured.quality, captured.pixelSnap)}
      resizeTo={undefined}
      onInit={handleInit}
    >
      {children}
    </PixiReactApplication>
  );
}
