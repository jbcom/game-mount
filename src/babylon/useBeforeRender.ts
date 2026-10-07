import type { Scene } from "@babylonjs/core/scene";
import { type DependencyList, useEffect, useLayoutEffect, useRef } from "react";
import { useScene } from "reactylon";

/**
 * The longest frame delta, in seconds, handed to a per-frame callback. A tab that was in the
 * background resumes with one huge delta; clamping it keeps a simulation step from tunnelling
 * through walls or firing a burst of timers.
 */
export const MAX_FRAME_DELTA = 0.05;

/**
 * Run `callback(delta, scene)` before every render of the current Reactylon scene, and remove the
 * observer on unmount. `delta` is in seconds, clamped to {@link MAX_FRAME_DELTA}.
 *
 * The callback is read through a ref, so the Babylon observer is registered again only when the
 * scene or one of `deps` changes, not on every React render.
 */
export function useBeforeRender(
  callback: (delta: number, scene: Scene) => void,
  deps: DependencyList = []
): void {
  const scene = useScene();
  const callbackRef = useRef(callback);
  useLayoutEffect(() => {
    callbackRef.current = callback;
  });
  useEffect(() => {
    if (!scene) return undefined;
    const observer = scene.onBeforeRenderObservable.add(() => {
      const delta = Math.min(scene.getEngine().getDeltaTime() / 1000, MAX_FRAME_DELTA);
      callbackRef.current(delta, scene);
    });
    return () => {
      scene.onBeforeRenderObservable.remove(observer);
    };
    // `deps` re-subscribe alongside the scene; the callback is read through the ref on purpose.
  }, [scene, ...deps]);
}
