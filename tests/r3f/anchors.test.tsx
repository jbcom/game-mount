/**
 * World-anchored markers against real three.js cameras and real DOM. A PerspectiveCamera is the
 * oracle for where a point lands (tests/camera/anchor.test.ts holds the maths); here the tracker's
 * DOM work is checked: state, transforms, CSS variables, indicator slots, and what `Anchor` renders.
 */

import { act, cleanup, render } from "@testing-library/react";
import { createElement, type ReactNode, useRef } from "react";
import { Group, PerspectiveCamera } from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Vec3 } from "../../src/camera/index.js";
import { Anchor } from "../../src/r3f/Anchor.js";
import { AnchorLayer, useAnchorTracker } from "../../src/r3f/AnchorLayer.js";
import {
  type AnchorFrame,
  type AnchorTarget,
  createAnchorTracker,
} from "../../src/r3f/anchorTracker.js";

const fake = vi.hoisted(() => ({
  camera: null as unknown,
  size: { width: 400, height: 800 },
  frame: null as (() => void) | null,
  priority: undefined as number | undefined,
}));

vi.mock("@react-three/fiber", () => ({
  useThree: (selector: (state: { camera: unknown; size: unknown }) => unknown) =>
    selector({ camera: fake.camera, size: fake.size }),
  useFrame: (callback: () => void, priority?: number) => {
    fake.frame = callback;
    fake.priority = priority;
  },
}));

const { AnchorProjector } = await import("../../src/r3f/AnchorProjector.js");

afterEach(cleanup);

function camera(): PerspectiveCamera {
  const value = new PerspectiveCamera(90, 400 / 800, 0.1, 1000);
  value.updateMatrixWorld(true);
  value.updateProjectionMatrix();
  return value;
}

const frame = (overrides: Partial<AnchorFrame> = {}): AnchorFrame => ({
  camera: camera(),
  width: 400,
  height: 800,
  ...overrides,
});

interface Parts extends AnchorTarget {
  states: string[];
  /** The node `glyph()` currently returns; a test can swap it as React does. */
  glyphNode: HTMLElement;
}

function parts(): Parts {
  const root = document.createElement("div");
  const marker = document.createElement("div");
  const edge = document.createElement("div");
  marker.hidden = true;
  edge.hidden = true;
  const states: string[] = [];
  const target: Parts = {
    root,
    marker,
    glyph: () => target.glyphNode,
    glyphNode: document.createElement("div"),
    edge,
    states,
    spec: () => {
      throw new Error("a test supplies its own spec");
    },
    notify: (state) => states.push(state),
  };
  return target;
}

function register(
  tracker: ReturnType<typeof createAnchorTracker>,
  position: Vec3 | (() => Vec3 | null),
  spec: Partial<ReturnType<AnchorTarget["spec"]>> = {}
): Parts {
  const target = parts();
  target.spec = () => ({
    position,
    offset: [0, 0],
    size: undefined,
    edgeRank: 0,
    edge: false,
    ...spec,
  });
  tracker.register(target);
  return target;
}

describe("the tracker", () => {
  it("shows an anchor in view as a marker at its projected point and publishes its distance", () => {
    const tracker = createAnchorTracker();
    const target = register(tracker, [0, 0, -10]);
    tracker.update(frame());
    expect(target.root.dataset.state).toBe("inside");
    expect(target.marker.hidden).toBe(false);
    expect(target.edge.hidden).toBe(true);
    expect(target.marker.style.transform).toBe("translate3d(200px,400px,0) translate(-50%,-50%)");
    expect(target.root.style.getPropertyValue("--anchor-distance")).toBe("10");
    expect(target.states).toEqual(["inside"]);
  });

  it("notifies only when the state changes", () => {
    const tracker = createAnchorTracker();
    let x = 0;
    const target = register(tracker, () => [x, 0, -10], { edge: true });
    tracker.update(frame());
    tracker.update(frame());
    x = 90;
    tracker.update(frame());
    tracker.update(frame());
    x = 0;
    tracker.update(frame());
    expect(target.states).toEqual(["inside", "edge", "inside"]);
  });

  it("applies the offset to the marker and a constant size to the glyph", () => {
    const tracker = createAnchorTracker();
    const target = register(tracker, [0, 0, -10], { offset: [4, -24], size: 30 });
    tracker.update(frame());
    expect(target.marker.style.transform).toBe("translate3d(204px,376px,0) translate(-50%,-50%)");
    expect(target.glyphNode.style.width).toBe("30px");
    expect(target.glyphNode.style.height).toBe("30px");
    expect(target.root.style.getPropertyValue("--anchor-size")).toBe("30px");
  });

  it("derives the size from the distance when given a function", () => {
    const tracker = createAnchorTracker();
    const size = vi.fn((distance: number) => 40 - distance);
    const near = register(tracker, [0, 0, -10], { size });
    const far = register(tracker, [0, 0, -30], { size });
    tracker.update(frame());
    expect(near.glyphNode.style.width).toBe("30px");
    expect(far.glyphNode.style.width).toBe("10px");
    expect(size).toHaveBeenCalledWith(10);
    expect(size).toHaveBeenCalledWith(30);
  });

  it("puts the indicator on the border, pointing at the anchor, and hides the marker", () => {
    const tracker = createAnchorTracker();
    const target = register(tracker, [40, 0, -10], { edge: true });
    tracker.update(frame());
    expect(target.root.dataset.state).toBe("edge");
    expect(target.marker.hidden).toBe(true);
    expect(target.edge.hidden).toBe(false);
    expect(target.edge.style.transform).toBe("translate3d(400px,400px,0) translate(-50%,-50%)");
    expect(target.root.style.getPropertyValue("--anchor-angle")).toBe("0rad");
  });

  it("keeps indicators clear of the insets and treats the covered band as off screen", () => {
    const tracker = createAnchorTracker();
    const target = register(tracker, [0, 6, -10], { edge: true });
    tracker.update(frame());
    expect(target.root.dataset.state).toBe("inside");
    tracker.update(frame({ insets: { top: 400 } }));
    expect(target.root.dataset.state).toBe("edge");
    expect(target.edge.style.transform).toBe("translate3d(200px,400px,0) translate(-50%,-50%)");
  });

  it("points an indicator for an anchor behind the camera toward the side it is on", () => {
    const tracker = createAnchorTracker();
    const target = register(tracker, [10, 0, 10], { edge: true });
    tracker.update(frame());
    expect(target.root.dataset.state).toBe("edge");
    expect(target.root.style.getPropertyValue("--anchor-angle")).toBe("0rad");
  });

  it("hides an off-screen anchor that has no indicator, and one with no position", () => {
    const tracker = createAnchorTracker();
    const off = register(tracker, [40, 0, -10]);
    const none = register(tracker, () => null, { edge: true });
    tracker.update(frame());
    expect(off.root.dataset.state).toBe("hidden");
    expect(off.marker.hidden).toBe(true);
    expect(off.edge.hidden).toBe(true);
    expect(none.marker.hidden).toBe(true);
    expect(none.edge.hidden).toBe(true);
  });

  it("hides a marker again when its position goes away", () => {
    const tracker = createAnchorTracker();
    let point: Vec3 | null = [0, 0, -10];
    const target = register(tracker, () => point);
    tracker.update(frame());
    expect(target.marker.hidden).toBe(false);
    point = null;
    tracker.update(frame());
    expect(target.marker.hidden).toBe(true);
    expect(target.root.dataset.state).toBe("hidden");
    expect(target.states).toEqual(["inside", "hidden"]);
  });

  it("gives limited indicator slots by rank, then by nearness", () => {
    const tracker = createAnchorTracker();
    const far = register(tracker, [80, 0, -40], { edge: true });
    const near = register(tracker, [60, 0, -10], { edge: true });
    const urgent = register(tracker, [70, 0, -90], { edge: true, edgeRank: -1 });
    tracker.update(frame({ maxEdgeIndicators: 2 }));
    expect(urgent.root.dataset.state).toBe("edge");
    expect(near.root.dataset.state).toBe("edge");
    expect(far.states).toEqual([]);
    expect(far.edge.hidden).toBe(true);
    tracker.update(frame({ maxEdgeIndicators: 0 }));
    expect(urgent.root.dataset.state).toBe("hidden");
    tracker.update(frame());
    expect(far.root.dataset.state).toBe("edge");
  });

  it("never spends a slot on an anchor that is in view", () => {
    const tracker = createAnchorTracker();
    const inView = register(tracker, [0, 0, -10], { edge: true });
    const off = register(tracker, [60, 0, -10], { edge: true });
    tracker.update(frame({ maxEdgeIndicators: 1 }));
    expect(inView.root.dataset.state).toBe("inside");
    expect(off.root.dataset.state).toBe("edge");
  });

  it("follows a moving camera within the same frame, not one frame late", () => {
    const tracker = createAnchorTracker();
    const target = register(tracker, [0, 0, -10]);
    const view = camera();
    tracker.update(frame({ camera: view }));
    // Moving the camera without rendering leaves its matrixWorldInverse stale; update must refresh it.
    view.position.set(0, 0, 10);
    tracker.update(frame({ camera: view }));
    expect(target.root.style.getPropertyValue("--anchor-distance")).toBe("20");
  });

  it("does nothing for a canvas with no area or no anchors", () => {
    const tracker = createAnchorTracker();
    const view = camera();
    const spy = vi.spyOn(view, "updateWorldMatrix");
    tracker.update(frame({ camera: view }));
    expect(spy).not.toHaveBeenCalled();
    const target = register(tracker, [0, 0, -10]);
    tracker.update(frame({ camera: view, width: 0 }));
    tracker.update(frame({ camera: view, height: 0 }));
    expect(spy).not.toHaveBeenCalled();
    expect(target.marker.hidden).toBe(true);
  });

  it("resets an element that is registered again to hidden, so the DOM matches the new entry", () => {
    const first = createAnchorTracker();
    const target = register(first, [0, 0, -10]);
    first.update(frame());
    expect(target.marker.hidden).toBe(false);
    // The same element handed to another tracker whose anchor is not in view must not stay shown.
    const second = createAnchorTracker();
    target.spec = () => ({
      position: [0, 0, 10],
      offset: [0, 0],
      size: undefined,
      edgeRank: 0,
      edge: false,
    });
    second.register(target);
    expect(target.marker.hidden).toBe(true);
    expect(target.edge.hidden).toBe(true);
    expect(target.root.dataset.state).toBe("hidden");
    second.update(frame());
    expect(target.marker.hidden).toBe(true);
  });

  it("stops updating an anchor that was removed", () => {
    const tracker = createAnchorTracker();
    const target = parts();
    const spec = vi.fn(() => ({
      position: [0, 0, -10] as Vec3,
      offset: [0, 0] as const,
      size: undefined,
      edgeRank: 0,
      edge: false,
    }));
    target.spec = spec;
    const remove = tracker.register(target);
    tracker.update(frame());
    expect(spec).toHaveBeenCalledTimes(1);
    remove();
    tracker.update(frame());
    expect(spec).toHaveBeenCalledTimes(1);
  });

  it("writes only what changed", () => {
    const tracker = createAnchorTracker();
    const target = register(tracker, [0, 0, -10], { size: 24 });
    tracker.update(frame());
    // Overwrite the DOM behind the tracker's back: an unchanged value must not be written again.
    target.marker.style.transform = "translate(1px,2px)";
    target.glyphNode.style.width = "1px";
    tracker.update(frame());
    expect(target.marker.style.transform).toBe("translate(1px,2px)");
    expect(target.glyphNode.style.width).toBe("1px");
  });

  it("sizes the new glyph node when React replaces it, even at an unchanged size", () => {
    const tracker = createAnchorTracker();
    const target = register(tracker, [0, 0, -10], { size: 24 });
    tracker.update(frame());
    expect(target.glyphNode.style.width).toBe("24px");
    target.glyphNode = document.createElement("div");
    tracker.update(frame());
    expect(target.glyphNode.style.width).toBe("24px");
  });

  it("treats a position with a NaN or infinite component as none", () => {
    const tracker = createAnchorTracker();
    const nan = register(tracker, [Number.NaN, 0, -10], { edge: true });
    const infinite = register(tracker, [Number.POSITIVE_INFINITY, 0, -10], { edge: true });
    tracker.update(frame());
    for (const target of [nan, infinite]) {
      expect(target.states).toEqual([]);
      expect(target.marker.hidden).toBe(true);
      expect(target.edge.hidden).toBe(true);
    }
  });

  it("sees a camera inside a group that moved this frame", () => {
    const tracker = createAnchorTracker();
    const target = register(tracker, [0, 0, -10]);
    const group = new Group();
    const view = camera();
    group.add(view);
    group.updateMatrixWorld(true);
    tracker.update(frame({ camera: view }));
    expect(target.root.style.getPropertyValue("--anchor-distance")).toBe("10");
    group.position.set(0, 0, 10);
    tracker.update(frame({ camera: view }));
    expect(target.root.style.getPropertyValue("--anchor-distance")).toBe("20");
  });

  it("re-applies the latest frame on refresh, coalescing calls into one", async () => {
    const tracker = createAnchorTracker();
    tracker.refresh();
    await Promise.resolve();
    let x = 0;
    const target = register(tracker, () => [x, 0, -10]);
    tracker.update(frame());
    const before = target.marker.style.transform;
    x = 2;
    tracker.refresh();
    tracker.refresh();
    expect(target.marker.style.transform).toBe(before);
    await Promise.resolve();
    expect(target.marker.style.transform).not.toBe(before);
  });

  it("rejects a bad inset rather than drawing at nonsense", () => {
    const tracker = createAnchorTracker();
    register(tracker, [0, 0, -10]);
    expect(() => tracker.update(frame({ insets: -1 }))).toThrow(RangeError);
  });
});

describe("Anchor", () => {
  function Scene({ children }: { children: ReactNode }): ReactNode {
    const tracker = useAnchorTracker();
    sceneTracker.current = tracker;
    return <AnchorLayer tracker={tracker}>{children}</AnchorLayer>;
  }
  const sceneTracker: { current: ReturnType<typeof createAnchorTracker> | null } = {
    current: null,
  };

  it("renders only what the host passes, hidden until projected", () => {
    const { container } = render(
      <Scene>
        <Anchor position={[0, 0, -10]} edge={<i data-testid="arrow" />} />
      </Scene>
    );
    const anchor = container.querySelector("[data-game-mount-anchor]") as HTMLElement;
    expect(anchor.dataset.state).toBe("hidden");
    expect(anchor.textContent).toBe("");
    expect(container.querySelector("[data-anchor-part=marker]")?.hasAttribute("hidden")).toBe(true);
    expect(container.querySelector("[data-anchor-part=edge]")?.hasAttribute("hidden")).toBe(true);
    expect(container.querySelector("button")).toBeNull();
    expect(container.querySelector("[aria-label]")).toBeNull();
  });

  it("lays the layer over its box and lets pointers through", () => {
    const { container } = render(
      <Scene>
        <Anchor position={[0, 0, -10]} />
      </Scene>
    );
    const layer = container.querySelector("[data-game-mount-anchor-layer]") as HTMLElement;
    expect(layer.style.position).toBe("absolute");
    expect(layer.style.pointerEvents).toBe("none");
    expect(layer.style.overflow).toBe("hidden");
  });

  it("merges the host's class, style and attributes without losing the layout contract", () => {
    const tracker = createAnchorTracker();
    const { container } = render(
      <AnchorLayer
        tracker={tracker}
        className="over"
        style={{ zIndex: 3, position: "fixed" }}
        id="field"
      >
        <Anchor
          position={[0, 0, -10]}
          className="pin"
          style={{ color: "red", position: "fixed" }}
        />
      </AnchorLayer>
    );
    const layer = container.querySelector("#field") as HTMLElement;
    expect(layer.className).toBe("over");
    expect(layer.style.zIndex).toBe("3");
    expect(layer.style.position).toBe("absolute");
    const anchor = container.querySelector("[data-game-mount-anchor]") as HTMLElement;
    expect(anchor.className).toBe("pin");
    expect(anchor.style.color).toBe("red");
    expect(anchor.style.position).toBe("absolute");
  });

  it("shows the marker and the indicator the host gave, in the right states", async () => {
    const { container } = render(
      <Scene>
        <Anchor position={() => point.current} edge={<i data-testid="arrow" />}>
          <b data-testid="glyph" />
        </Anchor>
      </Scene>
    );
    const tracker = sceneTracker.current as ReturnType<typeof createAnchorTracker>;
    point.current = [0, 0, -10];
    act(() => tracker.update(frame()));
    const anchor = container.querySelector("[data-game-mount-anchor]") as HTMLElement;
    expect(anchor.dataset.state).toBe("inside");
    point.current = [60, 0, -10];
    act(() => tracker.update(frame()));
    expect(anchor.dataset.state).toBe("edge");
    expect(container.querySelector("[data-anchor-part=edge] [data-testid=arrow]")).not.toBeNull();
    expect(container.querySelector("[data-anchor-part=marker] [data-testid=glyph]")).not.toBeNull();
  });
  const point: { current: Vec3 | null } = { current: [0, 0, -10] };

  it("projects a changed prop at once on an idle canvas", async () => {
    const view = frame();
    const { container, rerender } = render(
      <Scene>
        <Anchor position={[0, 0, -10]} />
      </Scene>
    );
    const tracker = sceneTracker.current as ReturnType<typeof createAnchorTracker>;
    act(() => tracker.update(view));
    const marker = container.querySelector("[data-anchor-part=marker]") as HTMLElement;
    const before = marker.style.transform;
    rerender(
      <Scene>
        <Anchor position={[1, 0, -10]} offset={[0, -10]} />
      </Scene>
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(marker.style.transform).not.toBe(before);
  });

  it("keeps the glyph sized when the marker becomes a button while in view", async () => {
    const { container, rerender } = render(
      <Scene>
        <Anchor position={[0, 0, -10]} size={20} />
      </Scene>
    );
    const tracker = sceneTracker.current as ReturnType<typeof createAnchorTracker>;
    act(() => tracker.update(frame()));
    const glyphWidth = () =>
      (
        [...container.querySelectorAll("[data-anchor-part=marker] [style*=place-items]")].at(
          -1
        ) as HTMLElement
      ).style.width;
    expect(glyphWidth()).toBe("20px");
    rerender(
      <Scene>
        <Anchor position={[0, 0, -10]} size={20} onPress={() => undefined} />
      </Scene>
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(container.querySelector("button")).not.toBeNull();
    expect(glyphWidth()).toBe("20px");
  });

  it("makes the marker a labelled button with a press target at least minTarget on each side", () => {
    const onPress = vi.fn();
    const { container } = render(
      <Scene>
        <Anchor position={[0, 0, -10]} onPress={onPress} label="Confirm" minTarget={48} size={20}>
          <span>3</span>
        </Anchor>
      </Scene>
    );
    const button = container.querySelector("button") as HTMLButtonElement;
    expect(button.getAttribute("aria-label")).toBe("Confirm");
    expect(button.type).toBe("button");
    expect(button.style.minWidth).toBe("48px");
    expect(button.style.minHeight).toBe("48px");
    expect(button.style.pointerEvents).toBe("auto");
    expect(button.style.touchAction).toBe("none");
    button.click();
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("hands the pointer-down through untouched so the host can start a drag", () => {
    const seen: boolean[] = [];
    const { container } = render(
      <Scene>
        <Anchor
          position={[0, 0, -10]}
          onPointerDown={(event) => seen.push(event.defaultPrevented)}
        />
      </Scene>
    );
    const button = container.querySelector("button") as HTMLButtonElement;
    button.dispatchEvent(new Event("pointerdown", { bubbles: true, cancelable: true }));
    expect(seen).toEqual([false]);
  });

  it("is not a button, and passes no pointers, without a handler", () => {
    const { container } = render(
      <Scene>
        <Anchor position={[0, 0, -10]} minTarget={0}>
          <span>label</span>
        </Anchor>
      </Scene>
    );
    expect(container.querySelector("button")).toBeNull();
    expect(
      (container.querySelector("[data-anchor-part=marker] > div") as HTMLElement).style
        .pointerEvents
    ).toBe("");
  });

  it("reports state changes to the latest onStateChange", () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = render(
      <Scene>
        <Anchor position={[0, 0, -10]} onStateChange={first} />
      </Scene>
    );
    const tracker = sceneTracker.current as ReturnType<typeof createAnchorTracker>;
    rerender(
      <Scene>
        <Anchor position={[0, 0, -10]} onStateChange={second} />
      </Scene>
    );
    act(() => tracker.update(frame()));
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith("inside");
  });

  it("throws outside an AnchorLayer", () => {
    const quiet = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(() => render(<Anchor position={[0, 0, 0]} />)).toThrow(/inside an <AnchorLayer>/);
    quiet.mockRestore();
  });

  it("counts a boolean or empty indicator as none", () => {
    const tracker = createAnchorTracker();
    function Holder({ edge }: { edge: ReactNode }): ReactNode {
      const ref = useRef(tracker);
      return (
        <AnchorLayer tracker={ref.current}>
          <Anchor position={[60, 0, -10]} edge={edge} />
        </AnchorLayer>
      );
    }
    const { container, rerender } = render(<Holder edge={false} />);
    const anchor = container.querySelector("[data-game-mount-anchor]") as HTMLElement;
    act(() => tracker.update(frame()));
    expect(anchor.dataset.state).toBe("hidden");
    rerender(<Holder edge={null} />);
    act(() => tracker.update(frame()));
    expect(anchor.dataset.state).toBe("hidden");
    rerender(<Holder edge={true} />);
    act(() => tracker.update(frame()));
    expect(anchor.dataset.state).toBe("hidden");
    rerender(<Holder edge="arrow" />);
    act(() => tracker.update(frame()));
    expect(anchor.dataset.state).toBe("edge");
  });
});

describe("useAnchorTracker", () => {
  it("returns one tracker for the life of the component", () => {
    const seen = new Set<unknown>();
    function Probe(): ReactNode {
      seen.add(useAnchorTracker());
      return null;
    }
    const { rerender } = render(createElement(Probe));
    rerender(createElement(Probe));
    expect(seen.size).toBe(1);
  });
});

describe("AnchorProjector", () => {
  it("projects the tracker through the canvas camera and size every frame", () => {
    const tracker = createAnchorTracker();
    const update = vi.spyOn(tracker, "update");
    fake.camera = camera();
    fake.size = { width: 320, height: 240 };
    render(<AnchorProjector tracker={tracker} insets={12} maxEdgeIndicators={3} />);
    expect(fake.priority).toBe(0);
    (fake.frame as () => void)();
    expect(update).toHaveBeenCalledWith({
      camera: fake.camera,
      width: 320,
      height: 240,
      insets: 12,
      maxEdgeIndicators: 3,
    });
  });

  it("passes the requested priority", () => {
    fake.camera = camera();
    render(<AnchorProjector tracker={createAnchorTracker()} priority={-2} />);
    expect(fake.priority).toBe(-2);
  });
});
