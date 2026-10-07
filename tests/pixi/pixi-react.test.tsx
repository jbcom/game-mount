/**
 * PixiReactMount unit contract.
 *
 * @pixi/react is mocked only at its Application boundary. The browser gate
 * exercises the actual reconciler and GPU; these tests pin the mount policy,
 * option mapping, resize ordering and StrictMode cleanup deterministically.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { __mockState, FakeResizeObserver, pixiMock } from "./_pixi-mock";

vi.mock("pixi.js", () => pixiMock());

// Knobs for the @pixi/react mock, reset before every test.
const behaviour = vi.hoisted(() => ({
  /** getCanvas() returns the canvas (true) or null. */
  exposeCanvas: true,
  /** Call onInit even when the Application was torn down before init resolved. */
  initAfterCleanup: false,
  /** Take the canvas out of the DOM just before onInit. */
  detachCanvas: false,
  /** Keep one Application across effect reconnects instead of recreating it. */
  persistApp: false,
  /** What onInit threw, if anything. */
  initErrors: [] as unknown[],
}));

vi.mock("@pixi/react", async () => {
  const React = await vi.importActual<typeof import("react")>("react");
  const Pixi = await import("pixi.js");

  const Application = React.forwardRef(function MockPixiReactApplication(
    props: {
      children?: React.ReactNode;
      className?: string;
      onInit?: (app: InstanceType<typeof Pixi.Application>) => void;
      [key: string]: unknown;
    },
    forwardedRef: React.ForwardedRef<{
      getApplication(): InstanceType<typeof Pixi.Application> | null;
      getCanvas(): HTMLCanvasElement | null;
    }>
  ): React.ReactElement {
    const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
    const appRef = React.useRef<InstanceType<typeof Pixi.Application> | null>(null);
    React.useImperativeHandle(forwardedRef, () => ({
      getApplication: () => appRef.current,
      getCanvas: () => (behaviour.exposeCanvas ? canvasRef.current : null),
    }));

    React.useLayoutEffect(() => {
      const canvas = canvasRef.current;
      if (canvas === null) throw new Error("mock @pixi/react canvas missing");
      if (behaviour.persistApp && appRef.current !== null) return undefined;
      const app = new Pixi.Application();
      appRef.current = app;
      let active = true;
      const { children: _children, className: _className, onInit, ...initOptions } = props;
      void app
        .init({ ...initOptions, canvas })
        .then(() => {
          if (!active && !behaviour.initAfterCleanup) return;
          if (behaviour.detachCanvas) canvas.remove();
          onInit?.(app);
        })
        .catch((error: unknown) => {
          behaviour.initErrors.push(error);
        });
      return () => {
        if (behaviour.persistApp) return;
        active = false;
        app.destroy();
      };
    }, []);

    return <canvas ref={canvasRef} className={props.className} />;
  });

  return { Application };
});

import { Activity, act, type ReactElement, StrictMode, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { PixiReactMount, type PixiReactMountHandle } from "../../src/pixi/pixi-react";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function sizedHost(width: number, height: number): HTMLDivElement {
  const host = document.createElement("div");
  Object.defineProperty(host, "clientWidth", { configurable: true, value: width });
  Object.defineProperty(host, "clientHeight", { configurable: true, value: height });
  document.body.appendChild(host);
  return host;
}

async function render(element: ReactElement, host: HTMLElement): Promise<Root> {
  const root = createRoot(host);
  await act(async () => root.render(element));
  await flush();
  return root;
}

beforeEach(() => {
  behaviour.exposeCanvas = true;
  behaviour.initAfterCleanup = false;
  behaviour.detachCanvas = false;
  behaviour.persistApp = false;
  behaviour.initErrors.length = 0;
  __mockState.reset();
  FakeResizeObserver.reset();
  document.body.innerHTML = "";
  vi.restoreAllMocks();
  Object.defineProperty(globalThis, "ResizeObserver", {
    configurable: true,
    value: FakeResizeObserver,
  });
  Object.defineProperty(window, "devicePixelRatio", { configurable: true, value: 3 });
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn(() => ({ matches: true })),
  });
});

describe("PixiReactMount", () => {
  it("delegates Application ownership instead of importing the imperative mount or constructing one", () => {
    const source = readFileSync(resolve(process.cwd(), "src/pixi/pixi-react.tsx"), "utf8");
    expect(source).not.toMatch(/import\s+\{[^}]*\bmountPixi\b[^}]*\}/s);
    expect(source).not.toMatch(/from\s+["']\.\/mount\.js["']/);
    expect(source).not.toMatch(/\bnew\s+Application\s*\(/);
    expect(source.match(/<PixiReactApplication\b/g)).toHaveLength(1);
  });

  it("keeps one Application/canvas under StrictMode and applies the mount options", async () => {
    const host = sizedHost(640, 360);
    const ready: PixiReactMountHandle[] = [];
    const resized: Array<[number, number]> = [];
    const root = await render(
      <StrictMode>
        <PixiReactMount
          className="game-canvas"
          background={0x123456}
          quality={{ maxDpr: 2, antialias: true }}
          onReady={(handle) => ready.push(handle)}
          onResize={(width, height) => resized.push([width, height])}
        />
      </StrictMode>,
      host
    );

    expect(host.querySelectorAll("canvas")).toHaveLength(1);
    expect(__mockState.apps.filter((app) => !app.destroyed)).toHaveLength(1);
    expect(ready).toHaveLength(1);
    expect(ready[0]?.canvas).toBe(host.querySelector("canvas"));
    expect(ready[0]?.reduceMotion).toBe(true);
    expect(ready[0]?.width).toBe(640);
    expect(ready[0]?.height).toBe(360);
    expect(resized).toEqual([[640, 360]]);

    const live = __mockState.apps.find((app) => !app.destroyed);
    expect(live?.initOptions).toMatchObject({
      width: 800,
      height: 450,
      background: 0x123456,
      antialias: true,
      resolution: 2,
      autoDensity: true,
      roundPixels: false,
    });
    expect(live?.resizeCalls).toEqual([[640, 360]]);
    expect(live?.resizeListenerCount).toBe(1);
    expect(ready[0]?.canvas.style.display).toBe("block");
    expect(ready[0]?.canvas.style.width).toBe("100%");
    expect(ready[0]?.canvas.style.height).toBe("100%");

    const observer = FakeResizeObserver.instances.find((candidate) => !candidate.disconnected);
    expect(observer?.observed).toEqual([host]);
    observer?.fire(701.8, 401.9);
    expect(live?.resizeCalls.at(-1)).toEqual([701, 401]);
    expect(resized.at(-1)).toEqual([701, 401]);
    expect(ready[0]?.width).toBe(701);
    expect(ready[0]?.height).toBe(401);

    await act(async () => root.unmount());
    expect(__mockState.apps.every((app) => app.destroyed)).toBe(true);
    expect(live?.resizeListenerCount).toBe(0);
    expect(FakeResizeObserver.instances.every((candidate) => candidate.disconnected)).toBe(true);
    expect(document.querySelectorAll("canvas")).toHaveLength(0);
  });

  it("manual mode dedupes resize and invokes reflow after renderer resize", async () => {
    const host = sizedHost(500, 300);
    let handle: PixiReactMountHandle | null = null;
    const callbackSnapshots: Array<{ size: [number, number]; lastRendererCall: [number, number] }> =
      [];
    const root = await render(
      <PixiReactMount
        pixelSnap={true}
        reduceMotion={false}
        resizeMode="manual"
        onReady={(value) => {
          handle = value;
        }}
        onResize={(width, height) => {
          const live = __mockState.apps.find((app) => !app.destroyed);
          callbackSnapshots.push({
            size: [width, height],
            lastRendererCall: live?.resizeCalls.at(-1) ?? [-1, -1],
          });
        }}
      />,
      host
    );

    expect(handle).not.toBeNull();
    expect(FakeResizeObserver.instances).toHaveLength(0);
    const live = __mockState.apps.find((app) => !app.destroyed);
    expect(live?.initOptions).toMatchObject({ antialias: false, resolution: 1, roundPixels: true });
    expect((handle as PixiReactMountHandle | null)?.reduceMotion).toBe(false);

    (handle as PixiReactMountHandle | null)?.resize(333.9, 222.9);
    (handle as PixiReactMountHandle | null)?.resize(333, 222);
    expect(live?.resizeCalls).toEqual([[333, 222]]);
    expect(callbackSnapshots).toEqual([{ size: [333, 222], lastRendererCall: [333, 222] }]);

    await act(async () => root.unmount());
  });

  it("resizeTo uses the explicit target without creating a second observer", async () => {
    const host = sizedHost(500, 300);
    const target = sizedHost(720, 405);
    let handle: PixiReactMountHandle | null = null;
    const root = await render(
      <PixiReactMount
        resizeMode="resizeTo"
        resizeTarget={target}
        onReady={(value) => {
          handle = value;
        }}
      />,
      host
    );

    const live = __mockState.apps.find((app) => !app.destroyed);
    expect(FakeResizeObserver.instances).toHaveLength(0);
    expect((handle as PixiReactMountHandle | null)?.width).toBe(720);
    expect((handle as PixiReactMountHandle | null)?.height).toBe(405);
    expect(live?.resizeCalls).toEqual([[720, 405]]);

    await act(async () => root.unmount());
  });

  it("observer mode on a window target listens to window resize and detaches on unmount", async () => {
    const host = sizedHost(500, 300);
    const add = vi.spyOn(window, "addEventListener");
    const remove = vi.spyOn(window, "removeEventListener");
    let handle: PixiReactMountHandle | null = null;
    const root = await render(
      <PixiReactMount resizeTarget={window} onReady={(value) => (handle = value)} />,
      host
    );
    expect(FakeResizeObserver.instances).toHaveLength(0);
    expect((handle as PixiReactMountHandle | null)?.width).toBe(window.innerWidth);

    Object.defineProperty(window, "innerWidth", { configurable: true, value: 900 });
    window.dispatchEvent(new Event("resize"));
    expect((handle as PixiReactMountHandle | null)?.width).toBe(900);

    const listener = add.mock.calls.find(([type]) => type === "resize")?.[1];
    await act(async () => root.unmount());
    expect(remove).toHaveBeenCalledWith("resize", listener);
  });

  it("resolves a ref resize target", async () => {
    const host = sizedHost(500, 300);
    const target = sizedHost(321, 123);
    function WithRef(): ReactElement {
      const ref = useRef<HTMLElement | null>(target);
      return <PixiReactMount resizeTarget={ref} />;
    }
    const root = await render(<WithRef />, host);
    expect(FakeResizeObserver.instances[0]?.observed).toEqual([target]);
    expect(__mockState.apps.find((app) => !app.destroyed)?.resizeCalls).toEqual([[321, 123]]);
    await act(async () => root.unmount());
  });

  it("sizes once from the parent when ResizeObserver is unavailable", async () => {
    Object.defineProperty(globalThis, "ResizeObserver", { configurable: true, value: undefined });
    const host = sizedHost(410, 230);
    const root = await render(<PixiReactMount />, host);
    expect(__mockState.apps.find((app) => !app.destroyed)?.resizeCalls).toEqual([[410, 230]]);
    await act(async () => root.unmount());
  });

  it("falls back to the canvas's own size when the canvas has no parent", async () => {
    behaviour.detachCanvas = true;
    const host = sizedHost(500, 300);
    let handle: PixiReactMountHandle | null = null;
    const root = await render(<PixiReactMount onReady={(value) => (handle = value)} />, host);
    const canvas = (handle as PixiReactMountHandle | null)?.canvas;
    expect(FakeResizeObserver.instances[0]?.observed).toEqual([canvas]);
    // jsdom lays nothing out, so the canvas's backing size (300x150) is the measurement.
    expect((handle as PixiReactMountHandle | null)?.width).toBe(300);
    // Put the canvas back so React can unmount it.
    if (canvas) host.appendChild(canvas);
    await act(async () => root.unmount());
  });

  it("refuses an initialised Application without a canvas", async () => {
    behaviour.exposeCanvas = false;
    const host = sizedHost(500, 300);
    const onReady = vi.fn();
    const root = await render(<PixiReactMount onReady={onReady} />, host);
    expect(onReady).not.toHaveBeenCalled();
    expect(String(behaviour.initErrors[0])).toContain("without exposing its canvas");
    await act(async () => root.unmount());
  });

  it("ignores an init that resolves after the component unmounted", async () => {
    behaviour.initAfterCleanup = true;
    const host = sizedHost(500, 300);
    const onReady = vi.fn();
    const root = createRoot(host);
    // Synchronous act: effects run, but Pixi's init promise cannot resolve before the unmount.
    act(() => root.render(<PixiReactMount onReady={onReady} />));
    act(() => root.unmount());
    await flush();
    expect(onReady).not.toHaveBeenCalled();
    expect(__mockState.apps.every((app) => app.resizeListenerCount === 0)).toBe(true);
  });

  it("unwires on hide and wires the replacement Application on show (<Activity>)", async () => {
    const host = sizedHost(640, 360);
    const ready: PixiReactMountHandle[] = [];
    const tree = (mode: "visible" | "hidden") => (
      <Activity mode={mode}>
        <PixiReactMount onReady={(handle) => ready.push(handle)} />
      </Activity>
    );
    const root = await render(tree("visible"), host);
    const first = __mockState.apps.find((app) => !app.destroyed);
    expect(first?.resizeListenerCount).toBe(1);

    await act(async () => root.render(tree("hidden")));
    await flush();
    expect(first?.resizeListenerCount).toBe(0);
    expect(FakeResizeObserver.instances.every((observer) => observer.disconnected)).toBe(true);

    await act(async () => root.render(tree("visible")));
    await flush();
    const live = __mockState.apps.filter((app) => !app.destroyed);
    expect(live).toHaveLength(1);
    expect(live[0]).not.toBe(first);
    expect(live[0]?.resizeListenerCount).toBe(1);
    // The destroyed Application was never rewired.
    expect(first?.resizeListenerCount).toBe(0);
    expect(ready).toHaveLength(2);

    await act(async () => root.unmount());
  });

  it("rewires the same Application when effects reconnect and @pixi/react kept it", async () => {
    behaviour.persistApp = true;
    const host = sizedHost(640, 360);
    const onReady = vi.fn();
    const tree = (mode: "visible" | "hidden") => (
      <Activity mode={mode}>
        <PixiReactMount onReady={onReady} />
      </Activity>
    );
    const root = await render(tree("visible"), host);
    const only = __mockState.apps[0];
    await act(async () => root.render(tree("hidden")));
    expect(only?.resizeListenerCount).toBe(0);
    await act(async () => root.render(tree("visible")));
    await flush();
    expect(__mockState.apps).toHaveLength(1);
    expect(only?.resizeListenerCount).toBe(1);
    expect(onReady).toHaveBeenCalledTimes(1);
    await act(async () => root.unmount());
    expect(only?.resizeListenerCount).toBe(0);
  });
});
