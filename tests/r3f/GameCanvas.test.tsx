/**
 * GameCanvas contract in jsdom: the r3f `<Canvas>` is mocked to a prop-recording passthrough,
 * since jsdom has no WebGL.
 *
 * Pins:
 *  - `active` gates the mount entirely (no host div, no Canvas).
 *  - The host div carries the .game-canvas-host class AND the inline contract style (min-height: 0,
 *    flex: 1, 100%/100%), plus caller-provided hostProps (class merge, data-* attributes).
 *  - Quality maps to dpr [1, maxDpr] + gl.antialias; ACES/sRGB are set.
 *  - onCreated registers webglcontextlost/restored listeners that preventDefault and route to the
 *    caller's handlers, including handlers swapped in after mount, falling back to console.warn.
 */

import type { CanvasProps, RootState } from "@react-three/fiber";
import { cleanup, render } from "@testing-library/react";
import { useEffect } from "react";
import { ACESFilmicToneMapping, SRGBColorSpace } from "three";
import { afterEach, describe, expect, it, vi } from "vitest";

const recordedCanvasProps: CanvasProps[] = [];
let mountCount = 0;

vi.mock("@react-three/fiber", () => ({
  Canvas: (props: CanvasProps) => {
    recordedCanvasProps.push(props);
    useEffect(() => {
      mountCount += 1;
    }, []);
    return <canvas data-testid="mock-canvas" />;
  },
}));

// Import AFTER the mock so GameCanvas binds to the stub.
const { GameCanvas } = await import("../../src/r3f/GameCanvas.js");
const { GAME_CANVAS_HOST_CLASS, QUALITY_TIERS } = await import("../../src/index.js");

afterEach(() => {
  cleanup();
  recordedCanvasProps.length = 0;
  mountCount = 0;
  vi.restoreAllMocks();
});

function lastCanvasProps(): CanvasProps {
  const props = recordedCanvasProps.at(-1);
  if (!props) throw new Error("Canvas never rendered");
  return props;
}

/** Drive the recorded onCreated with a fake RootState around a real jsdom
 * canvas element, so the context-loss listeners attach to something we can
 * dispatch events on. */
function createdWithCanvas(): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  const state = { gl: { domElement: canvas } } as unknown as RootState;
  lastCanvasProps().onCreated?.(state);
  return canvas;
}

describe("GameCanvas", () => {
  it("renders nothing while inactive — no host div, no Canvas", () => {
    const { container } = render(
      <GameCanvas active={false}>
        <group />
      </GameCanvas>
    );
    expect(container.firstChild).toBeNull();
    expect(recordedCanvasProps).toHaveLength(0);
  });

  it("renders the host div with the contract class + inline style (min-height:0)", () => {
    const { container } = render(
      <GameCanvas active>
        <group />
      </GameCanvas>
    );
    const host = container.firstChild as HTMLElement;
    expect(host.classList.contains(GAME_CANVAS_HOST_CLASS)).toBe(true);
    expect(host.style.minHeight).toBe("0px");
    expect(host.style.flex).toBe("1 1 0%");
    expect(host.style.width).toBe("100%");
    expect(host.style.height).toBe("100%");
    expect(host.querySelector('[data-testid="mock-canvas"]')).not.toBeNull();
  });

  it("merges hostProps: extra class + data attributes land on the host div", () => {
    const { container } = render(
      <GameCanvas active hostProps={{ className: "with-hud", "data-layer": "world" }}>
        <group />
      </GameCanvas>
    );
    const host = container.firstChild as HTMLElement;
    expect(host.classList.contains(GAME_CANVAS_HOST_CLASS)).toBe(true);
    expect(host.classList.contains("with-hud")).toBe(true);
    expect(host.getAttribute("data-layer")).toBe("world");
  });

  it("hostProps.style overrides the contract per property and keeps the rest", () => {
    const { container } = render(
      <GameCanvas active hostProps={{ style: { position: "absolute", inset: 0 } }}>
        <group />
      </GameCanvas>
    );
    const host = container.firstChild as HTMLElement;
    expect(host.style.position).toBe("absolute");
    expect(host.style.inset).toBe("0px");
    expect(host.style.minHeight).toBe("0px");
  });

  it("maps the quality tier to dpr [1, maxDpr] + antialias, with ACES/sRGB baked", () => {
    render(
      <GameCanvas active quality={{ maxDpr: 1.25, antialias: false }} shadows>
        <group />
      </GameCanvas>
    );
    const props = lastCanvasProps();
    expect(props.dpr).toEqual([1, 1.25]);
    // Defaults to the high tier; a sub-1 cap moves the floor down with it.
    render(
      <GameCanvas active>
        <group />
      </GameCanvas>
    );
    expect(lastCanvasProps().dpr).toEqual([1, QUALITY_TIERS.high.maxDpr]);
    expect((lastCanvasProps().gl as Record<string, unknown>).antialias).toBe(true);
    render(
      <GameCanvas active quality={{ maxDpr: 0.75, antialias: false }}>
        <group />
      </GameCanvas>
    );
    expect(lastCanvasProps().dpr).toEqual([0.75, 0.75]);
    const gl = props.gl as Record<string, unknown>;
    expect(gl.antialias).toBe(false);
    expect(gl.toneMapping).toBe(ACESFilmicToneMapping);
    expect(gl.toneMappingExposure).toBe(1.0);
    expect(gl.outputColorSpace).toBe(SRGBColorSpace);
    expect(gl.preserveDrawingBuffer).toBe(false);
    // Passthrough of remaining CanvasProps survives.
    expect(props.shadows).toBe(true);
  });

  it("preserveDrawingBuffer + toneMappingExposure props reach the gl config", () => {
    render(
      <GameCanvas active preserveDrawingBuffer toneMappingExposure={1.1}>
        <group />
      </GameCanvas>
    );
    const gl = lastCanvasProps().gl as Record<string, unknown>;
    expect(gl.preserveDrawingBuffer).toBe(true);
    expect(gl.toneMappingExposure).toBe(1.1);
  });

  it("context loss: preventDefaults and routes to onContextLost/onContextRestored with the canvas", () => {
    const onLost = vi.fn();
    const onRestored = vi.fn();
    render(
      <GameCanvas active onContextLost={onLost} onContextRestored={onRestored}>
        <group />
      </GameCanvas>
    );
    const canvas = createdWithCanvas();

    const lost = new Event("webglcontextlost", { cancelable: true });
    canvas.dispatchEvent(lost);
    // preventDefault is the recovery contract: it tells the browser we'll
    // restore, so the canvas doesn't stay permanently blank.
    expect(lost.defaultPrevented).toBe(true);
    expect(onLost).toHaveBeenCalledWith(canvas);

    canvas.dispatchEvent(new Event("webglcontextrestored"));
    expect(onRestored).toHaveBeenCalledWith(canvas);
  });

  it("context restore forces a real remount, not just a callback — preventDefault alone leaves the GL context empty", async () => {
    render(
      <GameCanvas active>
        <group />
      </GameCanvas>
    );
    const canvas = createdWithCanvas();
    expect(mountCount).toBe(1);

    canvas.dispatchEvent(new Event("webglcontextlost", { cancelable: true }));
    canvas.dispatchEvent(new Event("webglcontextrestored"));

    // The remount's state update happens inside a native DOM event
    // listener, outside React's synchronous act() batching — flush a tick
    // so the resulting re-render (with a bumped key) actually commits.
    await new Promise((resolve) => setTimeout(resolve, 50));

    // A remount tears down and recreates the mock Canvas instance, so the
    // effect-based mount probe fires again — proving the fix is a real
    // remount, not merely invoking onContextRestored.
    expect(mountCount).toBe(2);
  });

  it("context loss without handlers: preventDefaults and warns", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    render(
      <GameCanvas active>
        <group />
      </GameCanvas>
    );
    const canvas = createdWithCanvas();

    const lost = new Event("webglcontextlost", { cancelable: true });
    canvas.dispatchEvent(lost);
    expect(lost.defaultPrevented).toBe(true);
    canvas.dispatchEvent(new Event("webglcontextrestored"));
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it("handlers swapped in after mount are still reached (ref forwarding)", () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = render(
      <GameCanvas active onContextLost={first}>
        <group />
      </GameCanvas>
    );
    const canvas = createdWithCanvas();

    rerender(
      <GameCanvas active onContextLost={second}>
        <group />
      </GameCanvas>
    );
    canvas.dispatchEvent(new Event("webglcontextlost", { cancelable: true }));
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith(canvas);
  });

  it("chains a caller-supplied onCreated after wiring the listeners", () => {
    const onCreated = vi.fn();
    render(
      <GameCanvas active onCreated={onCreated}>
        <group />
      </GameCanvas>
    );
    const canvas = document.createElement("canvas");
    const state = { gl: { domElement: canvas } } as unknown as RootState;
    lastCanvasProps().onCreated?.(state);
    expect(onCreated).toHaveBeenCalledWith(state);
  });
});
