/**
 * CabinetCanvas contract (jsdom — the r3f `<Canvas>` is mocked to a
 * prop-recording passthrough, since jsdom has no WebGL; the real-browser
 * mount is exercised by the host repo's tests/browser/island-viewport-mount
 * suite, which mounts IslandViewport through this package against headless
 * Chromium).
 *
 * Pins:
 *  - `active` gates the mount entirely (no host div, no Canvas).
 *  - The host div carries the .cabinet-canvas-host class AND the inline
 *    contract style (min-height: 0 — the #1 footgun — flex:1, 100%/100%),
 *    plus caller-provided hostProps (class merge, data-* attributes).
 *  - Quality tier maps to dpr [1, maxDpr] + gl.antialias; ACES/sRGB baked.
 *  - onCreated wiring registers webglcontextlost/restored listeners that
 *    preventDefault (blobolines' recovery contract) and route to the
 *    caller's handlers — including handlers swapped in AFTER mount (the
 *    ref-forwarding pin), falling back to console.warn.
 */

import type { CanvasProps, RootState } from '@react-three/fiber';
import { cleanup, render } from '@testing-library/react';
import { ACESFilmicToneMapping, SRGBColorSpace } from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';

const recordedCanvasProps: CanvasProps[] = [];

vi.mock('@react-three/fiber', () => ({
  Canvas: (props: CanvasProps) => {
    recordedCanvasProps.push(props);
    return <canvas data-testid="mock-canvas" />;
  },
}));

// Import AFTER the mock so CabinetCanvas binds to the stub.
const { CabinetCanvas } = await import('../src/CabinetCanvas.js');
const { CABINET_CANVAS_HOST_CLASS } = await import('../src/hostStyle.js');

afterEach(() => {
  cleanup();
  recordedCanvasProps.length = 0;
  vi.restoreAllMocks();
});

function lastCanvasProps(): CanvasProps {
  const props = recordedCanvasProps.at(-1);
  if (!props) throw new Error('Canvas never rendered');
  return props;
}

/** Drive the recorded onCreated with a fake RootState around a real jsdom
 * canvas element, so the context-loss listeners attach to something we can
 * dispatch events on. */
function createdWithCanvas(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  const state = { gl: { domElement: canvas } } as unknown as RootState;
  lastCanvasProps().onCreated?.(state);
  return canvas;
}

describe('CabinetCanvas', () => {
  it('renders nothing while inactive — no host div, no Canvas', () => {
    const { container } = render(
      <CabinetCanvas active={false}>
        <group />
      </CabinetCanvas>,
    );
    expect(container.firstChild).toBeNull();
    expect(recordedCanvasProps).toHaveLength(0);
  });

  it('renders the host div with the contract class + inline style (min-height:0)', () => {
    const { container } = render(
      <CabinetCanvas active>
        <group />
      </CabinetCanvas>,
    );
    const host = container.firstChild as HTMLElement;
    expect(host.classList.contains(CABINET_CANVAS_HOST_CLASS)).toBe(true);
    expect(host.style.minHeight).toBe('0px');
    expect(host.style.flex).toBe('1 1 0%');
    expect(host.style.width).toBe('100%');
    expect(host.style.height).toBe('100%');
    expect(host.querySelector('[data-testid="mock-canvas"]')).not.toBeNull();
  });

  it('merges hostProps: extra class + data attributes land on the host div', () => {
    const { container } = render(
      <CabinetCanvas active hostProps={{ className: 'ww-fx', 'data-impact': 'odd' }}>
        <group />
      </CabinetCanvas>,
    );
    const host = container.firstChild as HTMLElement;
    expect(host.classList.contains(CABINET_CANVAS_HOST_CLASS)).toBe(true);
    expect(host.classList.contains('ww-fx')).toBe(true);
    expect(host.getAttribute('data-impact')).toBe('odd');
  });

  it('maps the quality tier to dpr [1, maxDpr] + antialias, with ACES/sRGB baked', () => {
    render(
      <CabinetCanvas active quality={{ maxDpr: 1.25, antialias: false }} shadows>
        <group />
      </CabinetCanvas>,
    );
    const props = lastCanvasProps();
    expect(props.dpr).toEqual([1, 1.25]);
    const gl = props.gl as Record<string, unknown>;
    expect(gl.antialias).toBe(false);
    expect(gl.toneMapping).toBe(ACESFilmicToneMapping);
    expect(gl.toneMappingExposure).toBe(1.0);
    expect(gl.outputColorSpace).toBe(SRGBColorSpace);
    expect(gl.preserveDrawingBuffer).toBe(false);
    // Passthrough of remaining CanvasProps survives.
    expect(props.shadows).toBe(true);
  });

  it('preserveDrawingBuffer + toneMappingExposure props reach the gl config', () => {
    render(
      <CabinetCanvas active preserveDrawingBuffer toneMappingExposure={1.1}>
        <group />
      </CabinetCanvas>,
    );
    const gl = lastCanvasProps().gl as Record<string, unknown>;
    expect(gl.preserveDrawingBuffer).toBe(true);
    expect(gl.toneMappingExposure).toBe(1.1);
  });

  it('context loss: preventDefaults and routes to onContextLost/onContextRestored with the canvas', () => {
    const onLost = vi.fn();
    const onRestored = vi.fn();
    render(
      <CabinetCanvas active onContextLost={onLost} onContextRestored={onRestored}>
        <group />
      </CabinetCanvas>,
    );
    const canvas = createdWithCanvas();

    const lost = new Event('webglcontextlost', { cancelable: true });
    canvas.dispatchEvent(lost);
    // preventDefault is the recovery contract: it tells the browser we'll
    // restore, so the canvas doesn't stay permanently blank.
    expect(lost.defaultPrevented).toBe(true);
    expect(onLost).toHaveBeenCalledWith(canvas);

    canvas.dispatchEvent(new Event('webglcontextrestored'));
    expect(onRestored).toHaveBeenCalledWith(canvas);
  });

  it('context loss without handlers: preventDefaults and warns', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    render(
      <CabinetCanvas active>
        <group />
      </CabinetCanvas>,
    );
    const canvas = createdWithCanvas();

    const lost = new Event('webglcontextlost', { cancelable: true });
    canvas.dispatchEvent(lost);
    expect(lost.defaultPrevented).toBe(true);
    canvas.dispatchEvent(new Event('webglcontextrestored'));
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it('handlers swapped in after mount are still reached (ref forwarding)', () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = render(
      <CabinetCanvas active onContextLost={first}>
        <group />
      </CabinetCanvas>,
    );
    const canvas = createdWithCanvas();

    rerender(
      <CabinetCanvas active onContextLost={second}>
        <group />
      </CabinetCanvas>,
    );
    canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith(canvas);
  });

  it('chains a caller-supplied onCreated after wiring the listeners', () => {
    const onCreated = vi.fn();
    render(
      <CabinetCanvas active onCreated={onCreated}>
        <group />
      </CabinetCanvas>,
    );
    const canvas = document.createElement('canvas');
    const state = { gl: { domElement: canvas } } as unknown as RootState;
    lastCanvasProps().onCreated?.(state);
    expect(onCreated).toHaveBeenCalledWith(state);
  });
});
