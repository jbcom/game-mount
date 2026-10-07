/**
 * Mount and unmount a PixiJS 8 `Application` into a parent-sized element.
 *
 * Two contracts carry the weight:
 *
 * - **A fresh canvas per Application.** A WebGL context belongs to its canvas element for the
 *   element's lifetime. Pixi's `app.destroy()` loses the context, and `getContext('webgl2')` on the
 *   same element afterwards returns that lost context forever: `gl.createShader()` returns null and
 *   Pixi throws during init, leaving a black canvas. React StrictMode's mount, cleanup, mount
 *   cycle does exactly this when the canvas is reused. So by default `mountPixi` creates and owns
 *   its canvas inside your container and removes it on destroy; the container is reusable, the
 *   canvas never is.
 * - **One resize pipeline.** Every resize path (a ResizeObserver, Pixi's `resizeTo`, a manual
 *   `resize()`) goes through `renderer.resize()`, and the renderer's own `resize` event then
 *   updates the handle and calls `onResize`. Scene reflow always runs after the surface resize, by
 *   construction rather than by listener registration order.
 *
 * No framework coupling: element in, handle out. The React hook is `game-mount/pixi/react`.
 */

import { Application } from "pixi.js";
import { detectReduceMotion } from "../core/motion.js";
import { DEFAULT_QUALITY, type RenderQuality } from "../core/quality.js";
import {
  DEFAULT_BACKGROUND,
  FALLBACK_HEIGHT,
  FALLBACK_WIDTH,
  measure,
  type PixiResizeMode,
  pixiRenderOptions,
  type ResizeEmitter,
  toPixelSize,
} from "./shared.js";

export interface MountOptions {
  /**
   * Your own canvas. Omit it (recommended) and `mountPixi` creates a fresh one inside `container`;
   * see the module notes on StrictMode. A provided canvas is never removed on destroy; an owned
   * one always is.
   */
  canvas?: HTMLCanvasElement;
  /** Where an owned canvas is appended. */
  container?: HTMLElement;
  /** Clear colour. Defaults to a near-black. */
  background?: number | string;
  /** Pixel-ratio cap and antialiasing; defaults to the `high` tier. */
  quality?: RenderQuality;
  /**
   * Pixel-art mode: integer coordinates (`roundPixels`), no antialiasing and resolution 1,
   * whatever `quality` says.
   */
  pixelSnap?: boolean;
  /** Honour reduced motion. Detected from `prefers-reduced-motion` when omitted. */
  reduceMotion?: boolean;
  /**
   * - `observer` (default): one ResizeObserver on the sizing element.
   * - `resizeTo`: Pixi's own `resizeTo`; `onResize` still fires through the renderer event.
   * - `manual`: nothing automatic; call `handle.resize()`.
   */
  resizeMode?: PixiResizeMode;
  /** The element whose box sets the size. Defaults to the container for an owned canvas, else the canvas. */
  resizeTarget?: HTMLElement;
  /** Called after every renderer resize, for scene reflow. */
  onResize?: (width: number, height: number) => void;
}

export interface PixiMountHandle {
  /** The Application. Stage content is yours. */
  readonly app: Application;
  /** The canvas the Application renders to, owned or provided. */
  readonly canvas: HTMLCanvasElement;
  /** Whether reduced motion is honoured for this mount. */
  readonly reduceMotion: boolean;
  /** Current logical width in CSS pixels. */
  readonly width: number;
  /** Current logical height in CSS pixels. */
  readonly height: number;
  /** Resize to integer CSS pixels (at least 1x1); same-size requests are ignored. */
  resize(width: number, height: number): void;
  /**
   * Idempotent. Disconnects the observer, destroys the Application (keeping textures, which may be
   * shared) and removes an owned canvas from the DOM.
   */
  destroy(): void;
}

/**
 * Create and initialise a Pixi 8 Application. The handle is fully usable once the promise
 * resolves (Pixi 8 initialises asynchronously).
 */
export async function mountPixi(options: MountOptions = {}): Promise<PixiMountHandle> {
  const {
    canvas: providedCanvas,
    container,
    background = DEFAULT_BACKGROUND,
    quality = DEFAULT_QUALITY,
    pixelSnap = false,
    resizeMode = "observer",
    resizeTarget,
    onResize,
  } = options;
  const reduceMotion = options.reduceMotion ?? detectReduceMotion();

  const ownsCanvas = providedCanvas === undefined;
  const canvas = providedCanvas ?? document.createElement("canvas");
  if (ownsCanvas) {
    canvas.style.display = "block";
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    container?.appendChild(canvas);
  }

  // For an owned canvas the container's box is authoritative: autoDensity rewrites the canvas's own
  // style size after each resize, so the canvas cannot be its own sizing reference.
  const sizingElement = resizeTarget ?? (ownsCanvas ? (container ?? canvas) : canvas);
  const [initialWidth, initialHeight] = measure(sizingElement, FALLBACK_WIDTH, FALLBACK_HEIGHT);

  const app = new Application();
  await app.init({
    canvas,
    width: initialWidth,
    height: initialHeight,
    background,
    ...pixiRenderOptions(quality, pixelSnap),
    ...(resizeMode === "resizeTo" ? { resizeTo: sizingElement } : {}),
  });

  let currentWidth = initialWidth;
  let currentHeight = initialHeight;
  let destroyed = false;

  const onRendererResize = (width: number, height: number): void => {
    currentWidth = width;
    currentHeight = height;
    onResize?.(width, height);
  };
  const emitter = app.renderer as unknown as ResizeEmitter;
  emitter.on("resize", onRendererResize);

  function resize(width: number, height: number): void {
    const [nextWidth, nextHeight] = toPixelSize(width, height);
    if (nextWidth === currentWidth && nextHeight === currentHeight) return;
    app.renderer.resize(nextWidth, nextHeight);
  }

  let observer: ResizeObserver | null = null;
  if (resizeMode === "observer") {
    const Observer = (globalThis as { ResizeObserver?: typeof ResizeObserver }).ResizeObserver;
    if (typeof Observer === "function") {
      observer = new Observer((entries) => {
        for (const entry of entries) resize(entry.contentRect.width, entry.contentRect.height);
      });
      observer.observe(sizingElement);
    }
  }

  function destroy(): void {
    if (destroyed) return;
    destroyed = true;
    observer?.disconnect();
    observer = null;
    emitter.off("resize", onRendererResize);
    try {
      app.destroy({ removeView: false }, { children: true, texture: false, textureSource: false });
    } catch {
      // Already destroyed by someone else; nothing left to release.
    }
    if (ownsCanvas) canvas.remove();
  }

  return {
    app,
    canvas,
    reduceMotion,
    get width() {
      return currentWidth;
    },
    get height() {
      return currentHeight;
    },
    resize,
    destroy,
  };
}
