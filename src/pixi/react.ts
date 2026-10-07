/**
 * game-mount/pixi/react: `usePixiMount`, a React hook over `mountPixi`. Needs `pixi.js` and `react`.
 */

import { type RefObject, useEffect, useRef, useState } from "react";
import { type MountOptions, mountPixi, type PixiMountHandle } from "./mount.js";

/**
 * Mount a Pixi Application into the referenced element; `null` until Pixi has initialised.
 *
 * Pass a ref to a container element (a `<div>`), not to a `<canvas>`: the mount then creates a
 * fresh canvas for every Application, which is what makes StrictMode's mount, cleanup, mount cycle
 * safe (see `mountPixi`). A canvas ref works in trees that mount once, but under StrictMode the
 * second Application boots onto the first one's lost context.
 *
 * `options` are read when the mount effect runs; changing them later does not remount. Remount
 * deliberately by changing the component's `key`.
 */
export function usePixiMount(
  ref: RefObject<HTMLCanvasElement | HTMLElement | null>,
  options: MountOptions = {}
): PixiMountHandle | null {
  const [handle, setHandle] = useState<PixiMountHandle | null>(null);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    const element = ref.current;
    if (element === null) return undefined;
    let disposed = false;
    let mounted: PixiMountHandle | null = null;
    const base = optionsRef.current;
    const mountOptions: MountOptions =
      element instanceof HTMLCanvasElement
        ? { ...base, canvas: element }
        : { ...base, container: element };
    void mountPixi(mountOptions).then((next) => {
      // StrictMode may have run the cleanup before Pixi finished initialising.
      if (disposed) {
        next.destroy();
        return;
      }
      mounted = next;
      setHandle(next);
    });
    return () => {
      disposed = true;
      mounted?.destroy();
      setHandle(null);
    };
  }, [ref]);

  return handle;
}
