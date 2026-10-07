import { HavokPlugin } from '@babylonjs/core/Physics/v2/Plugins/havokPlugin.js';
import HavokPhysics from '@babylonjs/havok';
import { useEffect, useState } from 'react';
// Side-effect import: registers `Scene.prototype.enablePhysics` /
// `getPhysicsEngine` (Babylon ships physics as an opt-in scene mixin
// to keep the core engine bundle small).
import '@babylonjs/core/Physics/v2/physicsEngineComponent.js';

/**
 * One Havok WASM load per process. `wasmBaseUrl` defaults to `/havok/`
 * (matching Vite's `import.meta.env.BASE_URL` convention when the WASM
 * is served from `public/havok/`); pass an explicit base for a
 * different asset layout.
 *
 * The promise is cached at module scope, not per-hook-instance, so the
 * first caller pays the WASM fetch and every subsequent mount (or
 * remount, e.g. re-entering a scene) resolves instantly to the same
 * plugin instance instead of re-downloading.
 */
let pluginPromise: Promise<HavokPlugin> | null = null;
let cachedWasmBaseUrl: string | null = null;

function loadHavokPlugin(wasmBaseUrl: string): Promise<HavokPlugin> {
  if (pluginPromise && cachedWasmBaseUrl === wasmBaseUrl) return pluginPromise;
  cachedWasmBaseUrl = wasmBaseUrl;
  pluginPromise = (async () => {
    const hk = await HavokPhysics({
      locateFile: (file: string) => `${wasmBaseUrl}${file}`,
    });
    return new HavokPlugin(true, hk);
  })();
  return pluginPromise;
}

export interface UseHavokPhysicsResult {
  /** `null` until the WASM has loaded — gate physics-body/collider
   *  attachment on this, while the visual scene renders immediately
   *  ("paint first, physics catches up"). */
  plugin: HavokPlugin | null;
  error: Error | null;
}

/**
 * Loads the Havok physics plugin (idempotent/cached at module scope)
 * and returns it once ready. Callers still call `scene.enablePhysics`
 * themselves with their own gravity vector — this hook only owns WASM
 * bootstrap, not per-scene physics activation, since gravity/units are
 * game-specific (Mars gravity, zero-g, etc).
 */
export function useHavokPhysics(wasmBaseUrl = '/havok/'): UseHavokPhysicsResult {
  const [plugin, setPlugin] = useState<HavokPlugin | null>(null);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadHavokPlugin(wasmBaseUrl).then(
      (loaded) => {
        if (!cancelled) setPlugin(loaded);
      },
      (err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err : new Error(String(err)));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [wasmBaseUrl]);

  return { plugin, error };
}

/** Test-only: reset the module-level plugin cache. */
export function _resetHavokPhysicsCache(): void {
  pluginPromise = null;
  cachedWasmBaseUrl = null;
}
