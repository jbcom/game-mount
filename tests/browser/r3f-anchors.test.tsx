import { type RootState, useFrame } from "@react-three/fiber";
import { type ReactNode, StrictMode, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Vector3 } from "three";
import { afterEach, expect, test, vi } from "vitest";
import type { Vec3 } from "../../src/camera/index";
import {
  Anchor,
  AnchorLayer,
  AnchorProjector,
  type AnchorState,
  type AnchorTracker,
  createAnchorTracker,
  GameCanvas,
} from "../../src/r3f/index";

/**
 * The anchors in a real browser, through the real r3f frame loop, real layout and real hit testing.
 * Expectations are computed independently of the package: three's own `Vector3.project` for where a
 * point lands, and a bisection (not the package's ray formula) for where an indicator clamps.
 */

const WIDTH = 360;
const HEIGHT = 600;
const FOV = 60;

interface Harness {
  readonly host: HTMLElement;
  readonly state: RootState;
  readonly tracker: AnchorTracker;
  readonly root: Root;
  show(anchors: ReactNode, projector?: { insets?: number | object; max?: number }): void;
  /** Calls `fn` at the start of every frame, before anchors are projected (as a camera rig does). */
  everyFrame(fn: ((frame: number) => void) | null): void;
}

const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
const frames = async (count: number) => {
  for (let index = 0; index < count; index++) await frame();
};

const mounted: Harness[] = [];
afterEach(() => {
  for (const harness of mounted.splice(0)) {
    harness.root.unmount();
    harness.host.remove();
  }
});

function Rig({ drive }: { drive: { current: ((frame: number) => void) | null } }) {
  const count = useRef(0);
  useFrame(() => {
    drive.current?.(count.current++);
  }, -1);
  return null;
}

async function mount(): Promise<Harness> {
  const host = document.createElement("div");
  host.style.cssText = `position:relative;width:${WIDTH}px;height:${HEIGHT}px`;
  document.body.append(host);
  const root = createRoot(host);
  const tracker = createAnchorTracker();
  const drive = { current: null as ((frame: number) => void) | null };
  const states: RootState[] = [];
  let anchors: ReactNode = null;
  let projector: { insets?: number | object; max?: number } = {};
  const draw = () =>
    root.render(
      <StrictMode>
        <GameCanvas
          active
          camera={{ position: [0, 0, 0], fov: FOV, near: 0.1, far: 1000 }}
          onCreated={(created) => states.push(created)}
        >
          <Rig drive={drive} />
          <AnchorProjector
            tracker={tracker}
            insets={projector.insets as number}
            maxEdgeIndicators={projector.max}
          />
        </GameCanvas>
        <AnchorLayer tracker={tracker}>{anchors}</AnchorLayer>
      </StrictMode>
    );
  draw();
  await vi.waitFor(() => expect(states.length).toBeGreaterThan(0));
  const harness: Harness = {
    host,
    state: states.at(-1) as RootState,
    tracker,
    root,
    show(next, options = {}) {
      anchors = next;
      projector = options;
      draw();
    },
    everyFrame(fn) {
      drive.current = fn;
    },
  };
  mounted.push(harness);
  return harness;
}

function look(harness: Harness, from: Vec3, at: Vec3): void {
  const { camera } = harness.state;
  camera.position.set(...from);
  camera.lookAt(...at);
  camera.updateMatrixWorld(true);
}

/** Where three says a world point lands in the host box (CSS px, y down), and whether in front. */
function expected(harness: Harness, point: Vec3) {
  const { camera } = harness.state;
  camera.updateMatrixWorld(true);
  const ndc = new Vector3(...point).project(camera);
  const local = new Vector3(...point).applyMatrix4(camera.matrixWorldInverse);
  return {
    x: ((ndc.x + 1) / 2) * WIDTH,
    y: ((1 - ndc.y) / 2) * HEIGHT,
    inFront: local.z < 0,
  };
}

function centreOf(element: Element, host: HTMLElement) {
  const box = element.getBoundingClientRect();
  const origin = host.getBoundingClientRect();
  return { x: box.left + box.width / 2 - origin.left, y: box.top + box.height / 2 - origin.top };
}

const part = (host: HTMLElement, name: "marker" | "edge", index = 0) =>
  host.querySelectorAll(`[data-anchor-part=${name}]`)[index] as HTMLElement;
const anchorAt = (host: HTMLElement, index = 0) =>
  host.querySelectorAll("[data-game-mount-anchor]")[index] as HTMLElement;

/** The point of the rectangle's border that a ray from its centre toward `target` leaves by. */
function clampedBySearch(
  target: { x: number; y: number },
  rect: { left: number; top: number; right: number; bottom: number }
) {
  const cx = (rect.left + rect.right) / 2;
  const cy = (rect.top + rect.bottom) / 2;
  const at = (t: number) => ({ x: cx + (target.x - cx) * t, y: cy + (target.y - cy) * t });
  const inside = (p: { x: number; y: number }) =>
    p.x >= rect.left - 1e-9 &&
    p.x <= rect.right + 1e-9 &&
    p.y >= rect.top - 1e-9 &&
    p.y <= rect.bottom + 1e-9;
  let low = 0;
  let high = 1;
  if (inside(at(1))) return at(1);
  for (let step = 0; step < 60; step++) {
    const mid = (low + high) / 2;
    if (inside(at(mid))) low = mid;
    else high = mid;
  }
  return at(low);
}

test("a marker follows its world point and keeps one screen size from 2 m to 100 m", async () => {
  const harness = await mount();
  const point: Vec3 = [1.5, 0.5, -10];
  harness.show(
    <Anchor position={point} size={28}>
      <svg width="100%" height="100%" aria-hidden="true">
        <circle cx="50%" cy="50%" r="40%" />
      </svg>
    </Anchor>
  );
  const sizes: number[] = [];
  for (const distance of [2, 8, 30, 100]) {
    look(harness, [0, 0, point[2] + distance], point);
    await frames(2);
    const marker = part(harness.host, "marker");
    expect(marker.hidden).toBe(false);
    const want = expected(harness, point);
    const got = centreOf(marker, harness.host);
    expect(Math.abs(got.x - want.x)).toBeLessThan(0.5);
    expect(Math.abs(got.y - want.y)).toBeLessThan(0.5);
    const glyph = marker.querySelector("svg") as SVGElement;
    sizes.push(glyph.getBoundingClientRect().width);
    expect(glyph.getBoundingClientRect().height).toBeCloseTo(28, 1);
    expect(anchorAt(harness.host).style.getPropertyValue("--anchor-distance")).toBe(
      String(distance)
    );
  }
  for (const width of sizes) expect(width).toBeCloseTo(28, 1);
});

test("a size function maps distance to pixels, and the glyph box follows it in the real layout", async () => {
  const harness = await mount();
  const bySize = (distance: number) => Math.max(24, Math.min(40, 48 - distance * 2));
  harness.show(
    <>
      <Anchor position={[0, 0, -3]} size={bySize}>
        <i style={{ display: "block", width: "100%", height: "100%" }} />
      </Anchor>
      <Anchor position={[0, 0, -9]} size={bySize}>
        <i style={{ display: "block", width: "100%", height: "100%" }} />
      </Anchor>
    </>
  );
  look(harness, [0, 0, 0], [0, 0, -1]);
  await frames(2);
  const widths = [0, 1].map(
    (index) =>
      (
        part(harness.host, "marker", index).querySelector("i") as HTMLElement
      ).getBoundingClientRect().width
  );
  expect(widths[0]).toBeCloseTo(40, 1);
  expect(widths[1]).toBeCloseTo(30, 1);
});

test("a marker has no frame lag: after each frame it matches that frame's camera", async () => {
  const harness = await mount();
  const point: Vec3 = [2, 1, -12];
  harness.show(
    <Anchor position={point} size={16}>
      <i />
    </Anchor>
  );
  const readings: Array<{ got: { x: number; y: number }; want: { x: number; y: number } }> = [];
  // A rig moves the camera at priority -1 every frame, before anchors are projected at 0.
  harness.everyFrame((index) => {
    look(harness, [index * 0.4, 0, index * 0.2], [0, 0, -20]);
  });
  for (let index = 0; index < 8; index++) {
    await frame();
    const marker = part(harness.host, "marker");
    if (marker.hidden) continue;
    // The camera is exactly where this frame's rig left it.
    readings.push({ got: centreOf(marker, harness.host), want: expected(harness, point) });
  }
  harness.everyFrame(null);
  expect(readings.length).toBeGreaterThanOrEqual(6);
  for (const { got, want } of readings) {
    expect(Math.abs(got.x - want.x)).toBeLessThan(0.75);
    expect(Math.abs(got.y - want.y)).toBeLessThan(0.75);
  }
});

test("off-screen anchors show an indicator clamped to the border, on the ray toward them", async () => {
  const harness = await mount();
  look(harness, [0, 0, 0], [0, 0, -1]);
  const targets: Vec3[] = [
    [60, 0, -10], // right
    [-60, 0, -10], // left
    [0, 60, -10], // above
    [0, -60, -10], // below
    [50, 40, -10], // up and right
    [-35, -80, -40], // down and left
  ];
  const states: AnchorState[][] = targets.map(() => []);
  harness.show(
    targets.map((position, index) => (
      <Anchor
        key={position.join(",")}
        position={position}
        edge={<i style={{ display: "block", width: 12, height: 12 }} />}
        onStateChange={(state) => states[index]?.push(state)}
      >
        <i />
      </Anchor>
    ))
  );
  await frames(3);
  const rect = { left: 0, top: 0, right: WIDTH, bottom: HEIGHT };
  targets.forEach((target, index) => {
    expect(states[index]).toEqual(["edge"]);
    expect(part(harness.host, "marker", index).hidden).toBe(true);
    const indicator = part(harness.host, "edge", index);
    expect(indicator.hidden).toBe(false);
    const want = clampedBySearch(expected(harness, target), rect);
    const got = centreOf(indicator, harness.host);
    expect(Math.abs(got.x - want.x)).toBeLessThan(0.75);
    expect(Math.abs(got.y - want.y)).toBeLessThan(0.75);
    // The direction variable points from the centre toward the anchor.
    const angle = Number.parseFloat(
      anchorAt(harness.host, index).style.getPropertyValue("--anchor-angle")
    );
    const wantAngle = Math.atan2(want.y - HEIGHT / 2, want.x - WIDTH / 2);
    expect(Math.abs(angle - wantAngle)).toBeLessThan(1e-3);
  });
});

test("the insets keep indicators clear of furniture, and cover the band under it", async () => {
  const harness = await mount();
  look(harness, [0, 0, 0], [0, 0, -1]);
  const insets = { top: 96, bottom: 120, left: 8, right: 8 };
  const rect = { left: 8, top: 96, right: WIDTH - 8, bottom: HEIGHT - 120 };
  // On screen, but inside the 96 px top band: it needs an indicator on the rectangle's top border.
  const covered: Vec3 = [0, 4, -10];
  const off: Vec3 = [60, 0, -10];
  harness.show(
    <>
      <Anchor position={covered} edge={<i style={{ display: "block", width: 10, height: 10 }} />}>
        <i />
      </Anchor>
      <Anchor position={off} edge={<i style={{ display: "block", width: 10, height: 10 }} />}>
        <i />
      </Anchor>
    </>,
    { insets }
  );
  await frames(3);
  const coveredWant = expected(harness, covered);
  expect(coveredWant.y).toBeLessThan(96);
  expect(coveredWant.y).toBeGreaterThan(0);
  expect(anchorAt(harness.host, 0).dataset.state).toBe("edge");
  expect(centreOf(part(harness.host, "edge", 0), harness.host).y).toBeCloseTo(96, 0);
  const offGot = centreOf(part(harness.host, "edge", 1), harness.host);
  const offWant = clampedBySearch(expected(harness, off), rect);
  expect(Math.abs(offGot.x - offWant.x)).toBeLessThan(0.75);
  expect(Math.abs(offGot.y - offWant.y)).toBeLessThan(0.75);
});

test("an anchor behind the camera points toward the side it is on, never mirrored", async () => {
  const harness = await mount();
  look(harness, [0, 0, 0], [0, 0, -1]);
  const behindRight: Vec3 = [30, 0, 10];
  const behindLeft: Vec3 = [-30, 0, 10];
  const straightBehind: Vec3 = [0, 0, 10];
  expect(expected(harness, behindRight).inFront).toBe(false);
  harness.show(
    [behindRight, behindLeft, straightBehind].map((position) => (
      <Anchor
        key={position.join(",")}
        position={position}
        edge={<i style={{ display: "block", width: 8, height: 8 }} />}
      >
        <i />
      </Anchor>
    ))
  );
  await frames(3);
  const [right, left, behind] = [0, 1, 2].map((index) => ({
    state: anchorAt(harness.host, index).dataset.state,
    at: centreOf(part(harness.host, "edge", index), harness.host),
    angle: Number.parseFloat(
      anchorAt(harness.host, index).style.getPropertyValue("--anchor-angle")
    ),
  }));
  expect(right?.state).toBe("edge");
  expect(right?.at.x).toBeCloseTo(WIDTH, 0);
  expect(right?.angle).toBeCloseTo(0, 3);
  expect(left?.at.x).toBeCloseTo(0, 0);
  expect(Math.abs(left?.angle ?? 0)).toBeCloseTo(Math.PI, 3);
  expect(behind?.at.y).toBeCloseTo(HEIGHT, 0);
  expect(behind?.angle).toBeCloseTo(Math.PI / 2, 3);
});

test("only the most urgent, nearest indicators are shown when the count is capped", async () => {
  const harness = await mount();
  look(harness, [0, 0, 0], [0, 0, -1]);
  const edge = <i style={{ display: "block", width: 8, height: 8 }} />;
  harness.show(
    <>
      <Anchor position={[60, 0, -50]} edge={edge} />
      <Anchor position={[60, 0, -10]} edge={edge} />
      <Anchor position={[-60, 0, -90]} edge={edge} edgeRank={-1} />
      <Anchor position={[0, 60, -20]} edge={edge} />
    </>,
    { max: 3 }
  );
  await frames(3);
  const shown = [0, 1, 2, 3].map((index) => anchorAt(harness.host, index).dataset.state);
  // The far one on the right loses; the left one outranks the rest, then nearer beats farther.
  expect(shown).toEqual(["hidden", "edge", "edge", "edge"]);
});

test("a far, small marker has a 48 px press target that real hit testing finds and a click reaches", async () => {
  const harness = await mount();
  const onPress = vi.fn();
  const point: Vec3 = [1, 0, -100];
  harness.show(
    <Anchor position={point} size={20} minTarget={48} onPress={onPress} label="Confirm">
      <i style={{ display: "block", width: "100%", height: "100%" }} />
    </Anchor>
  );
  look(harness, [0, 0, 0], [0, 0, -1]);
  await frames(2);
  const button = harness.host.querySelector("button") as HTMLButtonElement;
  const box = button.getBoundingClientRect();
  expect(box.width).toBeGreaterThanOrEqual(48);
  expect(box.height).toBeGreaterThanOrEqual(48);
  const glyph = button.querySelector("i") as HTMLElement;
  expect(glyph.getBoundingClientRect().width).toBeCloseTo(20, 1);
  const centre = { x: box.left + box.width / 2, y: box.top + box.height / 2 };
  // 18 px off centre is outside the 20 px glyph (10 px radius) and inside the 48 px target.
  expect(document.elementFromPoint(centre.x + 18, centre.y)).toBe(button);
  // Far from any anchor, pointers reach the canvas under the layer.
  const canvas = harness.host.querySelector("canvas") as HTMLCanvasElement;
  expect(document.elementFromPoint(box.left - 60, box.top - 60)).toBe(canvas);
  button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  expect(onPress).toHaveBeenCalledTimes(1);
});

test("a marker renders no animation of its own", async () => {
  const harness = await mount();
  harness.show(
    <Anchor position={[0, 0, -10]} size={24}>
      <i />
    </Anchor>
  );
  look(harness, [0, 0, 0], [0, 0, -1]);
  await frames(2);
  for (const element of harness.host.querySelectorAll(
    "[data-game-mount-anchor], [data-game-mount-anchor] *"
  )) {
    const style = getComputedStyle(element);
    expect(style.animationName).toBe("none");
    expect(style.transitionDuration).toBe("0s");
  }
});
