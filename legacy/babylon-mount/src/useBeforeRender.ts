import { useEffect, useLayoutEffect, useRef, type DependencyList } from 'react';
import { useScene } from 'reactylon';
import type { Scene } from '@babylonjs/core/scene';

/**
 * Subscribes to the active Babylon scene's onBeforeRenderObservable
 * and removes the observer on unmount. Provides the per-frame delta
 * (clamped to 50ms, protecting sim code from tab-backgrounding spikes)
 * and the active scene as arguments.
 *
 * This is the React-aware replacement for direct
 * `scene.onBeforeRenderObservable.add(...)` calls scattered through
 * imperative scene setup. Cleanup is handled automatically.
 *
 * The callback is kept fresh via a ref updated in `useLayoutEffect`, so
 * the underlying Babylon observer is only registered/removed when the
 * scene itself (or an explicit dep) changes — not on every render.
 *
 * Reactylon does not currently ship a `useBeforeRender` of its own;
 * this is a thin, framework-agnostic-at-the-callback-level wrapper.
 */
export function useBeforeRender(
  callback: (delta: number, scene: Scene) => void,
  deps: DependencyList = [],
): void {
  const scene = useScene();
  const callbackRef = useRef(callback);
  // useLayoutEffect (not render body) keeps the latest callback addressable
  // by the per-frame closure without violating react-hooks/refs.
  useLayoutEffect(() => {
    callbackRef.current = callback;
  });
  useEffect(() => {
    if (!scene) return;
    const observer = scene.onBeforeRenderObservable.add(() => {
      const delta = Math.min(scene.getEngine().getDeltaTime() / 1000, 0.05);
      callbackRef.current(delta, scene);
    });
    return () => {
      if (observer) scene.onBeforeRenderObservable.remove(observer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene, ...deps]);
}
