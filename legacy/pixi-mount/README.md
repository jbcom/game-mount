# @arcade-cabinet/pixi-mount

Pixi 8 Application mount/unmount lifecycle, extracted from
[on-the-ropes](https://github.com/jbcom/on-the-ropes)'
`src/rendering/ring/RingRenderer.ts` + `show-mode-controller.ts` — the
tournament-winning `pixi-mount` pattern across the arcade-cabinet fleet —
with the runner-ups' hardest-won lessons folded in:

- **Fresh canvas per Application (default)** — illinois-jim's StrictMode
  fix. A WebGL context is bound to its canvas ELEMENT for the element's
  lifetime; after `app.destroy()` the context is lost forever on that
  element, so React StrictMode's mount→cleanup→mount cycle boots the
  second app onto a dead context (`checkMaxIfStatementsInShader` throw,
  black canvas). Omit `canvas` and pass a `container`: every mount mints a
  virgin `<canvas>`, destroy removes it, the container is reusable.
- **ONE resize pipeline** — the source game ran two ResizeObservers on the
  same canvas (renderer surface resize + scene reflow) that only ordered
  correctly by registration accident. Here a single observer drives
  `renderer.resize()` and then your `onResize(width, height)` reflow hook —
  the ordering is a structural contract.
- **`applyFilterResolutionFix()`** — bioluminescent-sea's documented
  workaround for [pixijs/pixijs#11467](https://github.com/pixijs/pixijs/issues/11467)
  (`Filter.defaultOptions.resolution = 'inherit'`), shipped as an explicit
  call because bundlers tree-shake module-scope namespace mutations.
- DPR capped at 2 by default (`maxResolution`), `autoDensity`, a
  `pixelSnap` mode (roundPixels + antialias off + resolution 1 — the
  "1993 mode"), and a `prefers-reduced-motion` gate baked into the mount
  layer (`reduceMotion` auto-detects when omitted).

Zero framework coupling: element in, handle out. The optional React hook
lives at `@arcade-cabinet/pixi-mount/react` (react is an optional peer).

## Install

```sh
pnpm add @arcade-cabinet/pixi-mount pixi.js
```

`pixi.js` (^8) is a peer dependency — bring your own pinned version.

## Usage

```ts
import { applyFilterResolutionFix, mountPixi } from '@arcade-cabinet/pixi-mount';

applyFilterResolutionFix(); // once, before the first mount, if you use filters

const handle = await mountPixi({
  container: document.querySelector('#stage')!, // fresh canvas minted inside
  background: 0x080810,
  pixelSnap: false,
  onResize: (w, h) => scene.layout(w, h), // reflow, AFTER renderer.resize()
});

handle.app.stage.addChild(myLayers);
// … later
handle.destroy(); // idempotent; removes the owned canvas
```

### Resize modes

| mode | wiring |
|------|--------|
| `'observer'` (default) | ONE ResizeObserver on the sizing element (container for owned canvases, canvas otherwise, `resizeTarget` overrides) |
| `'resizeTo'` | Pixi's push-based `resizeTo: element`; `onResize` still fires via the renderer's `resize` event |
| `'manual'` | you call `handle.resize(w, h)` |

All three funnel through the same pipeline: `renderer.resize()` first,
`onResize` second, deduped on identical dimensions.

### React

```tsx
import { useRef } from 'react';
import { usePixiMount } from '@arcade-cabinet/pixi-mount/react';

function Stage() {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const handle = usePixiMount(hostRef, { background: 0x080810 });
  // handle is null until Pixi's async init resolves
  return <div ref={hostRef} style={{ position: 'relative', width: '100%', height: '100%' }} />;
}
```

Pass a **container** ref (recommended, StrictMode-safe). A canvas ref works
for single-mount trees but carries the lost-context hazard under StrictMode.

## Test

```sh
pnpm --filter @arcade-cabinet/pixi-mount test
```

jsdom + a pixi.js mock mirroring the exact surface the mount touches
(including Pixi 8's renderer `resize` event). The real-GPU regression tests
for the fresh-canvas contract live in illinois-jim's
`tests/browser/pixiStrictMode.test.ts`.
