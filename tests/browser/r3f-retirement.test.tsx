import { extend, type RootState, useFrame } from "@react-three/fiber";
import { createElement, StrictMode, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { BoxGeometry, Mesh, MeshBasicMaterial, WebGLRenderer } from "three";
import { expect, test, vi } from "vitest";
import { commands } from "vitest/browser";

declare module "vitest/browser" {
  interface BrowserCommands {
    browserArguments(): Promise<{ args: string[]; headedRequired: boolean }>;
  }
}

test("Chromium runs silently and headed for acceptance", async () => {
  const { args, headedRequired } = await commands.browserArguments();
  expect(args).toContain("--mute-audio");
  if (headedRequired) expect(args.some((arg) => arg.startsWith("--headless"))).toBe(false);
  console.info("Chromium lifecycle gate:", { args, headedRequired });
});

import { createR3FMount, ManagedGameCanvas, type R3FMount } from "../../src/r3f/index";

extend({ Mesh, BoxGeometry, MeshBasicMaterial });

function Scene({ world }: { world: { disposed: boolean; frames: number; cleanups: number } }) {
  useFrame(() => {
    if (world.disposed) throw new Error("A frame read a disposed world");
    world.frames++;
  });
  useEffect(
    () => () => {
      if (world.disposed) throw new Error("Effect cleanup read a disposed world");
      world.cleanups++;
    },
    [world]
  );
  return createElement("primitive", {
    object: new Mesh(new BoxGeometry(), new MeshBasicMaterial({ color: "teal" })),
  });
}

const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

test("retirement drains prequeued frames and effects before disposing the world, then remounts", async () => {
  const host = document.createElement("div");
  host.style.cssText = "width:320px;height:240px";
  document.body.append(host);
  const dom = createRoot(host);
  const mounts: R3FMount[] = [];
  const states: RootState[] = [];
  const errors: unknown[] = [];
  const world = { disposed: false, frames: 0, cleanups: 0 };
  const onMount = (mount: R3FMount) => {
    mounts.push(mount);
  };
  const draw = (active: boolean) =>
    dom.render(
      <StrictMode>
        <ManagedGameCanvas
          active={active}
          onMount={onMount}
          onError={(error) => errors.push(error)}
          options={{
            frameloop: "demand",
            onCreated: (state) => {
              states.push(state);
            },
          }}
        >
          <Scene world={world} />
        </ManagedGameCanvas>
      </StrictMode>
    );
  try {
    draw(true);
    await vi.waitFor(() => expect(states.length).toBeGreaterThan(0));
    await vi.waitFor(() => expect(world.frames).toBeGreaterThan(0));
    const owner = mounts.at(-1) as R3FMount;
    const state = states.at(-1) as RootState;
    expect(state.gl.domElement).toBe(owner.canvas);
    state.invalidate(10);
    const retirement = owner.retire();
    expect(owner.retire()).toBe(retirement);
    // React removal happens concurrently with explicit retire: exactly one root owner retires it.
    draw(false);
    await retirement;
    expect(world.cleanups).toBeGreaterThan(0);
    const frames = world.frames;
    world.disposed = true;
    await frame();
    await frame();
    expect(world.frames).toBe(frames);
    expect(errors).toEqual([]);
    world.disposed = false;
    const previous = states.length;
    draw(true);
    await vi.waitFor(() => expect(states.length).toBeGreaterThan(previous));
    expect(mounts.at(-1)?.canvas).not.toBe(owner.canvas);
    const current = mounts.at(-1) as R3FMount;
    const restored = vi.fn();
    current.canvas.addEventListener("webglcontextrestored", restored);
    current.canvas.dispatchEvent(new Event("webglcontextrestored"));
    await vi.waitFor(() => expect(mounts.at(-1)?.canvas).not.toBe(current.canvas));
    await current.retire();
    expect(restored).toHaveBeenCalledOnce();
  } finally {
    dom.unmount();
    await Promise.all(mounts.map((mount) => mount.retire()));
    world.disposed = true;
    host.remove();
  }
});

test("pending asynchronous configuration and renderer disposal both delay retirement", async () => {
  const canvas = document.createElement("canvas");
  document.body.append(canvas);
  const mount = createR3FMount(canvas);
  let supplyRenderer!: (renderer: WebGLRenderer) => void;
  let releaseRenderer!: () => void;
  const disposalGate = new Promise<void>((resolve) => {
    releaseRenderer = resolve;
  });
  const released: string[] = [];
  const configured = mount.configure({
    size: { width: 160, height: 120, top: 0, left: 0 },
    gl: () =>
      new Promise<WebGLRenderer>((resolve) => {
        supplyRenderer = resolve;
      }),
  });
  mount.render(null);
  const retirement = mount.retire();
  void retirement.then(() => {
    released.push("retired");
  });
  await frame();
  expect(released).toEqual([]);
  const renderer = new WebGLRenderer({ canvas });
  const originalDispose = renderer.dispose.bind(renderer);
  renderer.dispose = () => {
    originalDispose();
    released.push("renderer cleanup");
    return disposalGate;
  };
  supplyRenderer(renderer);
  await configured;
  await vi.waitFor(() => expect(released).toEqual(["renderer cleanup"]));
  releaseRenderer();
  await retirement;
  expect(released).toEqual(["renderer cleanup", "retired"]);
  expect(() => mount.render(null)).toThrow("retiring");
  canvas.remove();
});
