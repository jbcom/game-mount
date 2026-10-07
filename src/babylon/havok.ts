/**
 * game-mount/babylon/havok: `useHavokPhysics`. Needs `react`, `@babylonjs/core` and
 * `@babylonjs/havok`; it is its own entry point so a Babylon game without physics never installs
 * Havok.
 */

import { HavokPlugin } from "@babylonjs/core/Physics/v2/Plugins/havokPlugin.js";
import HavokPhysics from "@babylonjs/havok";
import { useEffect, useState } from "react";
// Registers Scene.prototype.enablePhysics / getPhysicsEngine: Babylon ships physics as an opt-in
// scene mixin to keep the core bundle small.
import "@babylonjs/core/Physics/v2/physicsEngineComponent.js";

// One Havok WASM load per page, cached at module scope: the first caller pays the download and
// every later mount (re-entering a level, a StrictMode remount) gets the same plugin at once.
let pluginPromise: Promise<HavokPlugin> | null = null;
let cachedWasmBaseUrl: string | null = null;

function loadHavokPlugin(wasmBaseUrl: string): Promise<HavokPlugin> {
  if (pluginPromise && cachedWasmBaseUrl === wasmBaseUrl) return pluginPromise;
  cachedWasmBaseUrl = wasmBaseUrl;
  const promise = (async () => {
    const havok = await HavokPhysics({ locateFile: (file: string) => `${wasmBaseUrl}${file}` });
    return new HavokPlugin(true, havok);
  })();
  pluginPromise = promise;
  // A failed load (offline, wrong base URL) must not be cached, or no later mount could retry.
  promise.catch(() => {
    if (pluginPromise === promise) {
      pluginPromise = null;
      cachedWasmBaseUrl = null;
    }
  });
  return promise;
}

export interface UseHavokPhysicsResult {
  /**
   * `null` until the WASM has loaded. Attach bodies and colliders once it is set; the scene can
   * render before then.
   */
  plugin: HavokPlugin | null;
  /** The load failure, if any. The next mount retries. */
  error: Error | null;
}

/**
 * Load the Havok physics plugin once per page and return it when ready.
 *
 * `wasmBaseUrl` is where `HavokPhysics.wasm` is served from, with a trailing slash; the default
 * `/havok/` matches a file copied to `public/havok/` in a Vite app. The game serves the file; this
 * package does not bundle it.
 *
 * Enabling physics on a scene stays with the caller (`scene.enablePhysics(gravity, plugin)`):
 * gravity and units are the game's.
 */
export function useHavokPhysics(wasmBaseUrl = "/havok/"): UseHavokPhysicsResult {
  const [plugin, setPlugin] = useState<HavokPlugin | null>(null);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadHavokPlugin(wasmBaseUrl).then(
      (loaded) => {
        if (!cancelled) setPlugin(loaded);
      },
      (reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason : new Error(String(reason)));
      }
    );
    return () => {
      cancelled = true;
    };
  }, [wasmBaseUrl]);

  return { plugin, error };
}

/** Forget the cached plugin, so the next mount loads Havok again. Meant for tests. */
export function _resetHavokPhysicsCache(): void {
  pluginPromise = null;
  cachedWasmBaseUrl = null;
}
