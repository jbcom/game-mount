/**
 * SceneRoot and useBeforeRender against a real Babylon scene on the NullEngine. Only Reactylon's
 * useScene is replaced, so the components run without a Reactylon <Engine>.
 */

import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera.js";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { Scene } from "@babylonjs/core/scene.js";
import { act, cleanup, render } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sceneState: { current: Scene | null } = { current: null };

vi.mock("reactylon", () => ({
  useScene: () => sceneState.current,
}));

const { MAX_FRAME_DELTA, SceneRoot, useBeforeRender } = await import("../../src/babylon/index.js");

let engine: NullEngine;

beforeEach(() => {
  engine = new NullEngine();
  sceneState.current = new Scene(engine);
});

afterEach(() => {
  cleanup();
  sceneState.current?.dispose();
  engine.dispose();
});

function Crate({ root, name }: { root: import("@babylonjs/core").TransformNode; name: string }) {
  useEffect(() => {
    const mesh = new Mesh(name, root.getScene());
    mesh.parent = root;
  }, [root, name]);
  return null;
}

function meshNames(scene: Scene): string[] {
  return scene.meshes.map((mesh) => mesh.name).sort();
}

describe("SceneRoot", () => {
  it("creates a root only while the phase matches, and disposes its subtree when it ends", () => {
    const scene = sceneState.current as Scene;
    const view = render(
      <SceneRoot activeKey="title" matchKey="level">
        {(root) => <Crate root={root} name="level-crate" />}
      </SceneRoot>
    );
    expect(scene.transformNodes).toHaveLength(0);

    view.rerender(
      <SceneRoot activeKey="level" matchKey="level">
        {(root) => <Crate root={root} name="level-crate" />}
      </SceneRoot>
    );
    expect(scene.transformNodes.map((node) => node.name)).toEqual(["scene-root-level"]);
    expect(meshNames(scene)).toEqual(["level-crate"]);

    view.rerender(
      <SceneRoot activeKey="title" matchKey="level">
        {(root) => <Crate root={root} name="level-crate" />}
      </SceneRoot>
    );
    expect(scene.transformNodes).toHaveLength(0);
    expect(meshNames(scene)).toEqual([]);
    expect(scene.isDisposed).toBe(false);
  });

  it("keeps one root across the phases of a list, even with an inline array", () => {
    const scene = sceneState.current as Scene;
    const view = render(
      <SceneRoot activeKey="playing" matchKey={["playing", "paused"]}>
        {(root) => <Crate root={root} name="arena" />}
      </SceneRoot>
    );
    const first = scene.transformNodes[0];
    expect(first?.name).toBe("scene-root-playing+paused");
    view.rerender(
      <SceneRoot activeKey="paused" matchKey={["playing", "paused"]}>
        {(root) => <Crate root={root} name="arena" />}
      </SceneRoot>
    );
    expect(scene.transformNodes).toEqual([first]);
    expect(meshNames(scene)).toEqual(["arena"]);
  });

  it("leaves sibling roots alive and leaks nothing over repeated cycles", () => {
    const scene = sceneState.current as Scene;
    function Both({ phase }: { phase: string }) {
      return (
        <>
          <SceneRoot activeKey={phase} matchKey="a">
            {(root) => <Crate root={root} name="a-mesh" />}
          </SceneRoot>
          <SceneRoot activeKey="always" matchKey="always">
            {(root) => <Crate root={root} name="hud-anchor" />}
          </SceneRoot>
        </>
      );
    }
    const view = render(<Both phase="a" />);
    for (let i = 0; i < 5; i++) {
      view.rerender(<Both phase="b" />);
      view.rerender(<Both phase="a" />);
    }
    view.rerender(<Both phase="b" />);
    expect(meshNames(scene)).toEqual(["hud-anchor"]);
    expect(scene.transformNodes.map((node) => node.name)).toEqual(["scene-root-always"]);
  });

  it("renders nothing until there is a scene", () => {
    sceneState.current = null;
    const view = render(
      <SceneRoot activeKey={1} matchKey={1}>
        {() => <span data-testid="content" />}
      </SceneRoot>
    );
    expect(view.queryByTestId("content")).toBeNull();
  });
});

describe("useBeforeRender", () => {
  function Ticker({ onTick }: { onTick: (delta: number, scene: Scene) => void }) {
    useBeforeRender(onTick);
    return null;
  }

  it("runs the latest callback before each render with a clamped delta, and unsubscribes", async () => {
    const scene = sceneState.current as Scene;
    new FreeCamera("camera", Vector3.Zero(), scene);
    const first = vi.fn();
    const second = vi.fn();
    // Babylon registers observers of its own during the first render; count only ours.
    const baseline = scene.onBeforeRenderObservable.observers.length;
    vi.spyOn(engine, "getDeltaTime").mockReturnValue(16);
    const view = render(<Ticker onTick={first} />);
    expect(scene.onBeforeRenderObservable.observers).toHaveLength(baseline + 1);
    const ours = scene.onBeforeRenderObservable.observers.at(-1);

    act(() => scene.render());
    expect(first).toHaveBeenCalledWith(0.016, scene);

    view.rerender(<Ticker onTick={second} />);
    expect(scene.onBeforeRenderObservable.observers).toContain(ours);
    vi.spyOn(engine, "getDeltaTime").mockReturnValue(5000);
    act(() => scene.render());
    expect(second).toHaveBeenCalledWith(MAX_FRAME_DELTA, scene);
    expect(first).toHaveBeenCalledTimes(1);

    // Babylon defers removal to the next tick and skips a removed observer meanwhile.
    view.unmount();
    act(() => scene.render());
    expect(second).toHaveBeenCalledTimes(1);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(scene.onBeforeRenderObservable.observers).not.toContain(ours);
  });

  it("does nothing without a scene", () => {
    sceneState.current = null;
    const tick = vi.fn();
    expect(() => render(<Ticker onTick={tick} />)).not.toThrow();
    expect(tick).not.toHaveBeenCalled();
  });
});
