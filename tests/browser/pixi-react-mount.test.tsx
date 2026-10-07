// Real-Chromium gate for @arcade-cabinet/pixi-mount/pixi-react: a real @pixi/react Application on a
// real WebGL context under React StrictMode. jsdom cannot provide either, and the failure this guards
// against (StrictMode's mount, cleanup, mount cycle booting the second Application onto a lost
// context, a black canvas) only exists with a real context. Runs through vitest.browser.config.ts;
// install the browser with `pnpm exec playwright install chromium`.
import { extend } from '@pixi/react';
import { Graphics } from 'pixi.js';
import { StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { PixiReactMount, type PixiReactMountHandle } from '../../src/pixi-react';

extend({ Graphics });

interface ReadyRecord {
  readonly handle: PixiReactMountHandle;
  readonly contextLosses: { count: number };
}

interface ResizeRecord {
  readonly callbackWidth: number;
  readonly callbackHeight: number;
  readonly rendererWidth: number;
  readonly rendererHeight: number;
}

let stage: HTMLDivElement;
let root: Root;
let generation: number;
let ready: ReadyRecord[];
let resizes: ResizeRecord[];
// The Application whose onReady most recently fired. The first resize of a mount fires before its
// own onReady, so a stale handle from a destroyed generation must never be read.
let current: PixiReactMountHandle | null;

function renderStage(mounted: boolean): void {
  if (!mounted) current = null;
  root.render(
    <StrictMode>
      {mounted ? (
        <PixiReactMount
          key={generation}
          className="fixture-canvas"
          background={0x102030}
          maxResolution={2}
          resizeMode="observer"
          onReady={(handle) => {
            const contextLosses = { count: 0 };
            handle.canvas.addEventListener('webglcontextlost', () => {
              contextLosses.count += 1;
            });
            current = handle;
            ready.push({ handle, contextLosses });
          }}
          onResize={(width, height) => {
            resizes.push({
              callbackWidth: width,
              callbackHeight: height,
              rendererWidth: current?.app.screen.width ?? width,
              rendererHeight: current?.app.screen.height ?? height,
            });
          }}
        >
          <pixiGraphics
            draw={(graphics) => {
              graphics.clear().rect(40, 40, 240, 140).fill(0x4fd1c5);
            }}
          />
        </PixiReactMount>
      ) : null}
    </StrictMode>,
  );
}

function liveApplications(): number {
  return ready.filter(({ handle }) => {
    const stageObject = handle.app.stage as { destroyed?: boolean };
    return handle.app.renderer != null && stageObject.destroyed !== true;
  }).length;
}

function glContextIsLive(canvas: HTMLCanvasElement): boolean {
  // Pixi already created the context on this canvas; getContext hands the same one back.
  const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
  return gl !== null && !gl.isContextLost();
}

beforeEach(() => {
  generation = 1;
  ready = [];
  resizes = [];
  current = null;
  stage = document.createElement('div');
  stage.style.cssText = 'width:640px;height:360px;position:relative;';
  document.body.append(stage);
  root = createRoot(stage);
});

afterEach(() => {
  root.unmount();
  stage.remove();
});

test('StrictMode keeps one healthy Application and remounts on a fresh canvas', async () => {
  renderStage(true);
  await vi.waitFor(() => expect(ready.length).toBeGreaterThan(0), { timeout: 10_000 });
  await vi.waitFor(() => expect(stage.querySelectorAll('canvas')).toHaveLength(1));

  const first = ready.at(-1);
  expect(first).toBeDefined();
  if (!first) return;
  expect(liveApplications()).toBe(1);
  expect(stage.querySelector('canvas')).toBe(first.handle.canvas);
  expect(glContextIsLive(first.handle.canvas)).toBe(true);
  expect(first.contextLosses.count).toBe(0);
  expect(first.handle.width).toBe(640);
  expect(first.handle.height).toBe(360);
  expect(new Set(ready.map(({ handle }) => handle.canvas)).size).toBe(ready.length);

  resizes.length = 0;
  first.handle.resize(577.9, 311.9);
  await vi.waitFor(() =>
    expect(resizes.at(-1)).toEqual({
      callbackWidth: 577,
      callbackHeight: 311,
      rendererWidth: 577,
      rendererHeight: 311,
    }),
  );

  renderStage(false);
  await vi.waitFor(() => expect(stage.querySelectorAll('canvas')).toHaveLength(0));
  await vi.waitFor(() => expect(liveApplications()).toBe(0));

  generation += 1;
  const readyBeforeRemount = ready.length;
  renderStage(true);
  await vi.waitFor(() => expect(ready.length).toBeGreaterThan(readyBeforeRemount), {
    timeout: 10_000,
  });
  await vi.waitFor(() => expect(stage.querySelectorAll('canvas')).toHaveLength(1));

  const second = ready.at(-1);
  expect(second).toBeDefined();
  if (!second) return;
  expect(second.handle.canvas).not.toBe(first.handle.canvas);
  expect(liveApplications()).toBe(1);
  expect(glContextIsLive(second.handle.canvas)).toBe(true);
  expect(second.contextLosses.count).toBe(0);
  expect(new Set(ready.map(({ handle }) => handle.canvas)).size).toBe(ready.length);
});
