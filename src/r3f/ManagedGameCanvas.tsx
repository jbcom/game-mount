import { events, extend } from "@react-three/fiber";
import type { ReactNode } from "react";
import { useCallback, useLayoutEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GAME_CANVAS_HOST_CLASS, gameCanvasHostStyle } from "../core/host.js";
import { DEFAULT_QUALITY } from "../core/quality.js";
import { createR3FMount, type R3FMount } from "./createR3FMount.js";
import type { GameCanvasProps } from "./GameCanvas.js";
import { renderPolicy } from "./renderPolicy.js";

export type ManagedGameCanvasProps = Pick<
  GameCanvasProps,
  | "active"
  | "quality"
  | "preserveDrawingBuffer"
  | "toneMappingExposure"
  | "hostProps"
  | "children"
  | "onContextLost"
  | "onContextRestored"
> & {
  /** R3F root configuration. Size and rendering quality belong to this component. */
  options?: Omit<NonNullable<Parameters<R3FMount["configure"]>[0]>, "size" | "dpr" | "gl">;
  /** Called before configuration. Save this handle and await retire() before disposing a world. */
  onMount: (mount: R3FMount) => void;
  /** Reports configuration or retirement failure. Defaults to console.error. */
  onError?: (error: unknown) => void;
};

function reportError(error: unknown): void {
  console.error("[game-mount] Canvas lifecycle failed:", error);
}

/**
 * A parent-sized canvas whose R3F root has one explicit lifetime owner. Unlike GameCanvas, it
 * exposes asynchronous retirement for scenes that depend on an externally disposed simulation.
 * The root's React tree is separate: pass scene dependencies as props, or provide their context
 * inside children. Options are R3F root options, not DOM Canvas props.
 */
export function ManagedGameCanvas(props: ManagedGameCanvasProps): ReactNode {
  const [generation, setGeneration] = useState(0);
  const restore = useCallback(() => setGeneration((value) => value + 1), []);
  return props.active ? (
    <ManagedCanvasGeneration key={generation} {...props} restore={restore} />
  ) : null;
}

function ManagedCanvasGeneration({
  restore,
  ...props
}: ManagedGameCanvasProps & { restore: () => void }): ReactNode {
  const host = useRef<HTMLDivElement>(null);
  const latest = useRef(props);
  latest.current = props;
  const update = useRef<(() => void) | undefined>(undefined);

  useLayoutEffect(() => {
    const element = host.current as HTMLDivElement;
    // A fresh canvas for each effect lifetime also makes StrictMode replay safe: a retiring root
    // never shares its canvas or context with the next generation.
    const canvas = document.createElement("canvas");
    canvas.style.cssText = "display:block;width:100%;height:100%";
    element.append(canvas);
    extend(THREE as unknown as Parameters<typeof extend>[0]);
    const mount = createR3FMount(canvas);
    let live = true;
    const error = (reason: unknown): void => (latest.current.onError ?? reportError)(reason);
    const lost = (event: Event): void => {
      if (mount.retiring) return;
      event.preventDefault();
      latest.current.onContextLost?.(canvas);
    };
    const restored = (): void => {
      if (mount.retiring) return;
      latest.current.onContextRestored?.(canvas);
      restore();
    };
    canvas.addEventListener("webglcontextlost", lost);
    canvas.addEventListener("webglcontextrestored", restored);
    const refresh = (): void => {
      if (mount.retiring) return;
      const { width, height, top, left } = element.getBoundingClientRect();
      if (width <= 0 || height <= 0) return;
      const {
        quality = DEFAULT_QUALITY,
        preserveDrawingBuffer = false,
        toneMappingExposure = 1,
        options,
      } = latest.current;
      void mount
        .configure({
          events,
          ...options,
          ...renderPolicy(quality, preserveDrawingBuffer, toneMappingExposure),
          size: { width, height, top, left },
        })
        .then(() => {
          if (live && !mount.retiring) mount.render(latest.current.children);
        })
        .catch(error);
    };
    const observer = new ResizeObserver(refresh);
    observer.observe(element);
    update.current = refresh;
    try {
      latest.current.onMount(mount);
    } catch (reason) {
      void mount.retire().catch(error);
      error(reason);
    }
    refresh();
    return () => {
      live = false;
      update.current = undefined;
      observer.disconnect();
      canvas.removeEventListener("webglcontextlost", lost);
      canvas.removeEventListener("webglcontextrestored", restored);
      canvas.remove();
      void mount.retire().catch(error);
    };
  }, [restore]);

  useLayoutEffect(() => update.current?.());
  const { className, style, ...attributes } = props.hostProps ?? {};
  return (
    <div
      ref={host}
      className={className ? `${GAME_CANVAS_HOST_CLASS} ${className}` : GAME_CANVAS_HOST_CLASS}
      style={style ? { ...gameCanvasHostStyle, ...style } : gameCanvasHostStyle}
      {...attributes}
    />
  );
}
