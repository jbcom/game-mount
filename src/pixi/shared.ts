/**
 * Shared by the imperative mount and the @pixi/react adapter. Imports nothing from pixi.js at
 * runtime.
 */

import { getDpr } from "../core/dpr.js";
import type { RenderQuality } from "../core/quality.js";

export type PixiResizeMode = "observer" | "resizeTo" | "manual";

/** Pixi `Application.init` options for a quality, honouring pixel-art mode. */
export function pixiRenderOptions(
  quality: RenderQuality,
  pixelSnap: boolean
): { antialias: boolean; resolution: number; autoDensity: true; roundPixels: boolean } {
  return {
    antialias: pixelSnap ? false : quality.antialias,
    resolution: pixelSnap ? 1 : getDpr(quality.maxDpr),
    autoDensity: true,
    roundPixels: pixelSnap,
  };
}

/**
 * A window is its own `window` property. Unlike `instanceof Window`, this holds across realms (a
 * window from an iframe, or a test DOM).
 */
export function isWindow(target: HTMLElement | Window): target is Window {
  return (target as { window?: unknown }).window === target;
}

/**
 * An element's (or the window's) CSS box, falling back to a canvas's backing size and then to the
 * given size when the box is empty (not laid out yet, or jsdom).
 */
export function measure(
  target: HTMLElement | Window,
  fallbackWidth: number,
  fallbackHeight: number
): readonly [number, number] {
  if (isWindow(target)) {
    return [target.innerWidth || fallbackWidth, target.innerHeight || fallbackHeight];
  }
  const isCanvas = target instanceof HTMLCanvasElement;
  const width = target.clientWidth || (isCanvas ? target.width : 0);
  const height = target.clientHeight || (isCanvas ? target.height : 0);
  return [width || fallbackWidth, height || fallbackHeight];
}

/** A renderer resize request as integer CSS pixels, at least 1x1. */
export function toPixelSize(width: number, height: number): readonly [number, number] {
  return [Math.max(1, Math.floor(width)), Math.max(1, Math.floor(height))];
}

/**
 * Pixi 8's renderer emits `resize` after every `renderer.resize()`, including resizeTo-driven ones.
 * Typed locally so the subscription survives churn in upstream event-map typings.
 */
export interface ResizeEmitter {
  on(event: "resize", listener: (width: number, height: number) => void): unknown;
  off(event: "resize", listener: (width: number, height: number) => void): unknown;
}

/** The size used before the first measurement and when nothing can be measured. */
export const FALLBACK_WIDTH = 800;
export const FALLBACK_HEIGHT = 450;

/** Default clear colour: a near-black with a little blue, so an empty stage reads as "on". */
export const DEFAULT_BACKGROUND = 0x080810;
