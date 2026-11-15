import { act, cleanup, render } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, expect, it, type Mock, vi } from "vitest";

const mocks = vi.hoisted(() => ({ create: vi.fn(), extend: vi.fn() }));
vi.mock("@react-three/fiber", () => ({ events: () => ({}), extend: mocks.extend }));
vi.mock("../../src/r3f/createR3FMount.js", () => ({ createR3FMount: mocks.create }));
const { ManagedGameCanvas } = await import("../../src/r3f/ManagedGameCanvas.js");

function at<T>(items: T[], index = 0): T {
  const item = items[index];
  if (!item) throw new Error("Expected a lifecycle record");
  return item;
}

const owners: {
  canvas: HTMLCanvasElement;
  retiring: boolean;
  configure: Mock<() => Promise<void>>;
  render: Mock<(children: unknown) => void>;
  retire: Mock<() => Promise<void>>;
}[] = [];
const observers: { callback: () => void; disconnect: ReturnType<typeof vi.fn> }[] = [];
let width = 320;
let configureError: Error | undefined;
let retireError: Error | undefined;

beforeEach(() => {
  width = 320;
  configureError = undefined;
  retireError = undefined;
  mocks.create.mockImplementation((canvas: HTMLCanvasElement) => {
    const owner = {
      canvas,
      retiring: false,
      configure: vi.fn(() => (configureError ? Promise.reject(configureError) : Promise.resolve())),
      render: vi.fn(),
      retire: vi.fn(() => {
        owner.retiring = true;
        return retireError ? Promise.reject(retireError) : Promise.resolve();
      }),
    };
    owners.push(owner);
    return owner;
  });
  vi.stubGlobal(
    "ResizeObserver",
    class {
      disconnect = vi.fn();
      constructor(callback: () => void) {
        observers.push({ callback, disconnect: this.disconnect });
      }
      observe = vi.fn();
    }
  );
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    () => ({ width, height: 240, top: 3, left: 4 }) as DOMRect
  );
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  owners.length = 0;
  observers.length = 0;
});
const tick = () =>
  act(async () => {
    await Promise.resolve();
  });

it("does not allocate an inactive root", () => {
  const { container } = render(
    <ManagedGameCanvas active={false} onMount={vi.fn()}>
      {null}
    </ManagedGameCanvas>
  );
  expect(container.firstChild).toBeNull();
});

it("owns a single resize path and preserves rendering/host policy and latest children", async () => {
  const mounted = vi.fn();
  const { container, rerender, unmount } = render(
    <ManagedGameCanvas
      active
      onMount={mounted}
      hostProps={{ className: "scene", style: { position: "absolute" }, "data-layer": "world" }}
      quality={{ maxDpr: 1.25, antialias: false }}
      preserveDrawingBuffer
      toneMappingExposure={1.1}
      options={{ frameloop: "demand" }}
    >
      first
    </ManagedGameCanvas>
  );
  await tick();
  const owner = at(owners);
  expect(mounted).toHaveBeenCalledWith(owner);
  expect(owner.configure).toHaveBeenLastCalledWith(
    expect.objectContaining({
      dpr: [1, 1.25],
      size: { width: 320, height: 240, top: 3, left: 4 },
      frameloop: "demand",
      gl: expect.objectContaining({
        antialias: false,
        preserveDrawingBuffer: true,
        toneMappingExposure: 1.1,
      }),
    })
  );
  const element = container.firstElementChild as HTMLElement;
  expect(element.className).toBe("game-canvas-host scene");
  expect(element.style.position).toBe("absolute");
  expect(element.dataset.layer).toBe("world");
  rerender(
    <ManagedGameCanvas active onMount={vi.fn()}>
      second
    </ManagedGameCanvas>
  );
  await tick();
  expect(owners).toHaveLength(1);
  expect(owner.render).toHaveBeenLastCalledWith("second");
  expect(owner.configure).toHaveBeenLastCalledWith(
    expect.objectContaining({
      dpr: [1, 2],
      gl: expect.objectContaining({ preserveDrawingBuffer: false, toneMappingExposure: 1 }),
    })
  );
  const count = owner.configure.mock.calls.length;
  width = 0;
  at(observers).callback();
  expect(owner.configure).toHaveBeenCalledTimes(count);
  width = 400;
  at(observers).callback();
  await tick();
  expect(owner.configure).toHaveBeenCalledTimes(count + 1);
  await owner.retire();
  owner.canvas.dispatchEvent(new Event("webglcontextlost"));
  owner.canvas.dispatchEvent(new Event("webglcontextrestored"));
  expect(owners).toHaveLength(1);
  at(observers).callback();
  expect(owner.configure).toHaveBeenCalledTimes(count + 1);
  unmount();
  expect(at(observers).disconnect).toHaveBeenCalledOnce();
  expect(owner.canvas.isConnected).toBe(false);
});

it("cancels pending rendering on cleanup and uses a fresh StrictMode canvas", async () => {
  const { unmount } = render(
    <StrictMode>
      <ManagedGameCanvas active onMount={vi.fn()}>
        {null}
      </ManagedGameCanvas>
    </StrictMode>
  );
  unmount();
  await tick();
  expect(owners).toHaveLength(2);
  expect(at(owners).canvas).not.toBe(at(owners, 1).canvas);
  for (const owner of owners) {
    expect(owner.render).not.toHaveBeenCalled();
    expect(owner.retire).toHaveBeenCalledOnce();
  }
});

it("handles context loss and creates a fresh root on restore with current callbacks", async () => {
  const lost = vi.fn();
  const restored = vi.fn();
  const { rerender } = render(
    <ManagedGameCanvas active onMount={vi.fn()}>
      {null}
    </ManagedGameCanvas>
  );
  const original = at(owners);
  const event = new Event("webglcontextlost", { cancelable: true });
  original.canvas.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(true);
  rerender(
    <ManagedGameCanvas active onMount={vi.fn()} onContextLost={lost} onContextRestored={restored}>
      {null}
    </ManagedGameCanvas>
  );
  original.canvas.dispatchEvent(new Event("webglcontextlost", { cancelable: true }));
  expect(lost).toHaveBeenCalledWith(original.canvas);
  act(() => original.canvas.dispatchEvent(new Event("webglcontextrestored")));
  expect(restored).toHaveBeenCalledWith(original.canvas);
  expect(owners).toHaveLength(2);
  expect(original.retire).toHaveBeenCalledOnce();
  act(() => at(owners, 1).canvas.dispatchEvent(new Event("webglcontextrestored")));
  expect(owners).toHaveLength(3);
  await tick();
});

it("supports restoration without a caller callback", async () => {
  render(
    <ManagedGameCanvas active onMount={vi.fn()}>
      {null}
    </ManagedGameCanvas>
  );
  act(() => at(owners).canvas.dispatchEvent(new Event("webglcontextrestored")));
  await tick();
  expect(owners).toHaveLength(2);
});

it("does not render when retired while configuration is pending", async () => {
  render(
    <ManagedGameCanvas
      active
      onMount={(mount) => {
        void mount.retire();
      }}
    >
      {null}
    </ManagedGameCanvas>
  );
  await tick();
  expect(at(owners).configure).not.toHaveBeenCalled();
  expect(at(owners).render).not.toHaveBeenCalled();
});

it("reports configure and retirement errors through the callback", async () => {
  configureError = new Error("configure failed");
  const error = vi.fn();
  const { unmount } = render(
    <ManagedGameCanvas active onMount={vi.fn()} onError={error}>
      {null}
    </ManagedGameCanvas>
  );
  await tick();
  expect(error).toHaveBeenCalledWith(configureError);
  retireError = new Error("retire failed");
  unmount();
  await tick();
  expect(error).toHaveBeenCalledWith(retireError);
});

it("reports lifecycle errors to the console without an error callback", async () => {
  const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  configureError = new Error("configure failed");
  render(
    <ManagedGameCanvas active onMount={vi.fn()}>
      {null}
    </ManagedGameCanvas>
  );
  await tick();
  expect(consoleError).toHaveBeenCalledWith(
    "[game-mount] Canvas lifecycle failed:",
    configureError
  );
});

it("skips a configured scene if the owner retires before the configuration continuation", async () => {
  render(
    <ManagedGameCanvas active onMount={vi.fn()}>
      {null}
    </ManagedGameCanvas>
  );
  void at(owners).retire();
  await tick();
  expect(at(owners).render).not.toHaveBeenCalled();
});

it("retires the root if the owner callback throws", async () => {
  const error = new Error("owner failed");
  const report = vi.fn();
  render(
    <ManagedGameCanvas
      active
      onMount={() => {
        throw error;
      }}
      onError={report}
    >
      {null}
    </ManagedGameCanvas>
  );
  await tick();
  expect(report).toHaveBeenCalledWith(error);
  expect(at(owners).retire).toHaveBeenCalledOnce();
  expect(at(owners).configure).not.toHaveBeenCalled();
});

it("initiates retirement while its canvas is still attached", () => {
  const { unmount } = render(
    <ManagedGameCanvas active onMount={vi.fn()}>
      {null}
    </ManagedGameCanvas>
  );
  const owner = at(owners);
  owner.retire.mockImplementation(() => {
    expect(owner.canvas.isConnected).toBe(true);
    owner.retiring = true;
    return Promise.resolve();
  });
  unmount();
  expect(owner.retire).toHaveBeenCalledOnce();
  expect(owner.canvas.isConnected).toBe(false);
});
