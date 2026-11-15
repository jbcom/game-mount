import { createRoot, unmountComponentAtNode } from "@react-three/fiber";
import type { ReactNode } from "react";

type FiberRoot = ReturnType<typeof createRoot>;

/** An exclusively owned canvas root with observable, asynchronous retirement. */
export interface R3FMount {
  /** The canvas uniquely owned by this root generation. */
  readonly canvas: HTMLCanvasElement;
  /** True from the first retire() call, including while cleanup is pending. */
  readonly retiring: boolean;
  /** Configure before rendering. Async renderer creation is included in the returned promise. */
  configure(options: Parameters<FiberRoot["configure"]>[0]): Promise<void>;
  /** Render or update the scene. Throws once retirement has started. */
  render(children: ReactNode): void;
  /**
   * Stop automatic frames and retire the renderer. Every call returns the same promise, resolved
   * only after React effect cleanup and R3F renderer release. Keep scene dependencies alive until
   * it resolves. A pending renderer factory must settle before retirement can finish.
   */
  retire(): Promise<void>;
}

// Keep ownership through asynchronous retirement. Reusing the root early cancels R3F's unmount
// callback, leaving consumers unable to know when it is safe to dispose their scene dependencies.
const owners = new WeakSet<HTMLCanvasElement>();

/**
 * Own an imperative R3F root. Do not also pass this canvas to Canvas, createRoot or
 * unmountComponentAtNode: all lifecycle calls must go through this handle. R3F 9.8.2 or newer is
 * required for its completion callback to include effect cleanup and renderer release.
 *
 * This handles root lifetime only; the caller still owns sizing, events and scene dependencies.
 * Prefer a fresh canvas after retirement because WebGL renderer release loses its context.
 */
export function createR3FMount(canvas: HTMLCanvasElement): R3FMount {
  if (owners.has(canvas)) throw new Error("[game-mount] This canvas already has a mount owner.");
  const root = createRoot(canvas);
  owners.add(canvas);
  let store: ReturnType<FiberRoot["render"]> | undefined;
  let retirement: Promise<void> | undefined;

  return {
    canvas,
    get retiring() {
      return retirement !== undefined;
    },
    configure(options) {
      if (retirement) return Promise.reject(new Error("[game-mount] The mount is retiring."));
      return Promise.resolve(root.configure(options)).then(() => {});
    },
    render(children) {
      if (retirement) throw new Error("[game-mount] The mount is retiring.");
      store = root.render(children);
    },
    retire() {
      if (retirement) return retirement;
      let complete!: () => void;
      let fail!: (error: unknown) => void;
      retirement = new Promise<void>((resolve, reject) => {
        complete = resolve;
        fail = reject;
      });
      try {
        // Public API, rather than mutating internal.active/frames. A queued invalidation must not
        // execute scene callbacks after the caller begins retiring the root.
        const state = store?.getState();
        if (state?.gl) state.setFrameloop("never");
        // root.unmount() returns void. Calling it as well would replace the callback's unmount
        // token, so this is the only unmount call for this owner, including concurrent retire().
        unmountComponentAtNode(canvas, () => {
          owners.delete(canvas);
          complete();
        });
      } catch (error) {
        // Failed cleanup cannot release ownership or claim scene dependencies are safe to destroy.
        fail(error);
      }
      return retirement;
    },
  };
}
