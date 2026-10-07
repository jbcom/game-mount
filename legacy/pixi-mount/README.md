# @arcade-cabinet/pixi-mount

Pixi 8 Application mount/unmount lifecycle. It began in
[on-the-ropes](https://github.com/jbcom/on-the-ropes)'
`src/rendering/ring/RingRenderer.ts` + `show-mode-controller.ts` — the
`pixi-mount` pattern the arcade-cabinet fleet standardised on —
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

The core remains framework-neutral: element in, handle out. The optional React
hook lives at `@arcade-cabinet/pixi-mount/react`. A separate
`@arcade-cabinet/pixi-mount/pixi-react` component lets `@pixi/react` own the
one Application while preserving the same fleet mount policy.

## Install

```sh
pnpm add @arcade-cabinet/pixi-mount pixi.js
```

`pixi.js` (^8) is a peer dependency — bring your own pinned version.

The package is served by the `arcade-cabinet` Gitea registry on a private network:

```ini
@arcade-cabinet:registry=https://registry.npmjs.org/
```

Registry reads are anonymous. Publishing remains credentialed.

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

### `@pixi/react`

`@pixi/react` v8 cannot adopt an Application created by `mountPixi()`. Never
call both APIs on the same canvas. Install the React renderer and use the
dedicated adapter instead:

```sh
pnpm add @arcade-cabinet/pixi-mount @pixi/react pixi.js react react-dom
```

```tsx
import { extend } from '@pixi/react';
import { Container, Sprite } from 'pixi.js';
import { PixiReactMount } from '@arcade-cabinet/pixi-mount/pixi-react';

extend({ Container, Sprite });

export function Stage() {
  return (
    <PixiReactMount
      className="game-canvas"
      background={0x080810}
      maxResolution={2}
      resizeMode="observer"
      onResize={(width, height) => layout(width, height)}
      onReady={({ app, canvas, reduceMotion }) => {
        // One @pixi/react-owned Application and its React-owned canvas.
        console.log(app, canvas, reduceMotion);
      }}
    >
      <pixiContainer>{/* declarative Pixi children */}</pixiContainer>
    </PixiReactMount>
  );
}
```

The adapter wraps `@pixi/react`'s supported `<Application>` component. It does
not call `mountPixi`, create another Application, or pretend the v8 reconciler
can adopt an existing stage. It applies `autoDensity`, DPR capping,
`pixelSnap`, reduced-motion detection, the three resize modes, renderer-before-
reflow ordering and React-owned teardown to the one upstream Application.

`@pixi/react@8.0.5` owns teardown and calls `Application.destroy()` once when
its component unmounts; that release does not expose custom destroy options.
The adapter therefore cleans its observer/listener wiring idempotently and
leaves Application/display-tree destruction to the upstream owner instead of
adding a competing destroy path.

Mount policy is captured for the component lifetime; change the component key
to rebuild deliberately. `onResize` and `onReady` always use their latest
callbacks. The canvas defaults to filling its parent, which is also the default
resize target. In `manual` mode call `handle.resize(width, height)`.

## Development

Built on the fleet toolchain, Node 26 (`.node-version`) and pnpm 12 (`packageManager`, through
Corepack); the package itself runs on Node 24 and later.

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm exec playwright install chromium   # the StrictMode gate runs in real Chromium
pnpm verify   # Biome, tsc, jsdom and Chromium tests, the ESM/CJS/types build, a packed-tarball consumer smoke
```

Unit tests (`pnpm test:jsdom`) use jsdom plus a Pixi mock mirroring the exact mount surface,
including Pixi 8's renderer `resize` event. The browser gate (`pnpm test:browser`, Vitest browser
mode in Chromium) mounts the real `@pixi/react` adapter under React StrictMode, verifies one live
canvas/Application and a healthy WebGL context, resizes through the renderer-before-reflow
pipeline, then unmounts/remounts and proves the replacement canvas is fresh. It asserts a live
context, not a GPU: CI runners fall back to software WebGL.

`pnpm smoke:consumer` packs the tarball, installs it anonymously into a scratch project next to
the `pixi.js`, React and `@pixi/react` the package is tested against, and loads `.`, `./react`
and `./pixi-react` through `require` and `import`. `./pixi-react` is only resolved under Node ESM,
because `@pixi/react` 8.0.5 imports `react-reconciler/constants` without an extension; it is meant
for a bundler.

## Release

Conventional Commits drive release-please; merging its release pull request tags `v<version>`.
The publish job in `.gitea/workflows/release.yml` reconciles on every `main` run: when the manifest
version is tagged but absent from the registry, it verifies at the tag, packs twice and requires byte
identity, publishes those bytes with the organisation secret `NPM_TOKEN` from a
throwaway npmrc, then reruns the consumer smoke against the published version with
`PIXI_MOUNT_CONSUMER_SOURCE=@arcade-cabinet/pixi-mount@<version>` and an anonymous npm config.
Never edit the `version` field by hand. Why the repository is shaped this way: `docs/decisions.md`.
