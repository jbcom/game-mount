# @arcade-cabinet/r3f-mount

Parent-sized react-three-fiber `<Canvas>` mount, extracted from
welcoming-wilds-island-adventure (the r3f-mount tournament winner), with the
WebGL context-loss handling from blobolines and the error boundary +
adaptive-resolution ladder from bone-buster baked in. It first lived in
welcoming-wilds-island-adventure's `packages/r3f-mount` and moved here with its
history (see `docs/decisions.md`).

## Install

```sh
pnpm add @arcade-cabinet/r3f-mount
```

Served by the `arcade-cabinet` Gitea registry on a private network, read anonymously:

```ini
@arcade-cabinet:registry=https://registry.npmjs.org/
```

Peers: `@react-three/fiber` ^9, `react` ^18 or ^19, `three` >=0.160 (tested against three 0.184).

## THE CSS CONTRACT — read this first

**`min-height: 0` is the #1 footgun.** The whole package exists to ship this
rule:

```css
.cabinet-canvas-host {
  position: relative;
  flex: 1;
  display: flex;
  width: 100%;
  height: 100%;
  min-height: 0; /* ← load-bearing */
}

.cabinet-canvas-host canvas {
  width: 100%;
  height: 100%;
  display: block;
}
```

Why: a flex item's default is `min-height: auto`. Without an explicit
`min-height: 0`, a `height: 100%` child (the canvas) can refuse to shrink
below its content's intrinsic size — and the break is **silent**: the layout
looks fine until you dock a HUD panel beside or below the canvas, at which
point the canvas overflows instead of shrinking. Most repos in the fleet
audit omitted this one line.

The contract is **parent-derived all the way down** — zero `vh`/`vw`/
`window.innerWidth` anywhere. Sizing is 100% delegated to r3f's own
ResizeObserver against a parent this contract guarantees resolves correctly.
The full winning chain looks like:

```
html, body        { height: 100%; }
#app              { position: fixed; inset: 0; display: flex; flex-direction: column; }
your shell        { flex: 1; min-height: 0; }        ← YOUR half of the contract
.cabinet-canvas-host { flex: 1; …; min-height: 0; }  ← this package's half
```

`<CabinetCanvas>` renders the `.cabinet-canvas-host` div itself and applies
the rules **inline** (exported as `cabinetCanvasHostStyle`), so the contract
holds even if you never import the stylesheet. The stylesheet adds the
child-`canvas` rule and is there for apps mounting a raw `<Canvas>` in their
own host element:

```ts
import '@arcade-cabinet/r3f-mount/styles.css';
```

**You own the other half:** every ancestor between the page root and
`<CabinetCanvas>` must resolve to a real box height (a `flex: 1` +
`min-height: 0` chain, or a sized grid area). If the canvas renders 0-tall,
the missing `min-height: 0` (or an unsized ancestor) is the first thing to
check.

## CabinetCanvas

```tsx
import { CabinetCanvas } from '@arcade-cabinet/r3f-mount';

<CabinetCanvas
  active={phase === 'game'}                    // mount gate: menu pays no renderer cost
  quality={{ maxDpr: 2, antialias: true }}     // caller-resolved device tier
  shadows
  camera={{ position: [10, 8, 10], fov: 30 }}
  onContextLost={(canvas) => showReconnectOverlay()}
>
  <YourScene />
</CabinetCanvas>;
```

- **`active` (required)** — the canvas only renders while true; unmounting
  fully tears down the WebGL context. Menu/idle screens should not pay
  renderer cost (and on `menu` phases the DOM page's background is never
  painted over by the scene).
- **`quality`** — maps to `dpr={[1, maxDpr]}` and `gl.antialias`. Resolve the
  tier yourself (a `getQuality()`-style device read); high-DPI phones pay
  quadratic fill cost, so low tiers should clamp `maxDpr` and drop antialias.
- **Baked gl defaults** — ACES filmic tone mapping at exposure 1.0 (the
  canonical baseline: saturation belongs to scene lighting, not exposure),
  sRGB output, `powerPreference: 'high-performance'`.
  `preserveDrawingBuffer` is opt-in (screenshot/`toDataURL` pipelines only —
  it has a real mobile perf cost).
- **Context loss is handled for you** (ported from blobolines, the only
  fleet game that had it): mobile GPUs drop the WebGL context on
  backgrounding/memory pressure; the baked listener `preventDefault`s
  `webglcontextlost` (telling the browser we'll recover — without it the
  canvas stays permanently blank) and three re-initializes on
  `webglcontextrestored`. Override `onContextLost`/`onContextRestored` to
  drive a "reconnecting" overlay; the defaults log a `console.warn`.
- **`hostProps`** — extra class/`data-*` attributes for the host div (e.g.
  an animation hook), merged over the contract style.
- Everything else in `CanvasProps` (minus `dpr`/`gl`, which this component
  owns) passes through to `<Canvas>`.

## CabinetCanvasErrorBoundary

drei's `useGLTF`/`useTexture` throw on a failed load; the rejection
propagates as a render error, and without a boundary React unmounts the
subtree → a **silent blank canvas**. Ship this as a sibling around the
canvas (from bone-buster's `AssetErrorBoundary`):

```tsx
<CabinetCanvasErrorBoundary onError={({ url, assetType, message }) => setAssetError(...)}>
  <CabinetCanvas active>…</CabinetCanvas>
</CabinetCanvasErrorBoundary>
```

`onError` receives a classified reason (`url` extracted from the loader
message — ports survive, trailing `: 404` statuses are stripped — and
`assetType` of `glb | texture | wasm | font | unknown`). Render the visible
error modal as a DOM sibling driven by the lifted state; `fallback` (default
`null`) replaces the dead subtree. `classifyAssetError` is exported for
reuse in your own load-failure telemetry.

## AdaptiveResolution

The fleet's strongest runtime perf-tiering (bone-buster): a 60-frame rolling
FPS window drives a `gl.setPixelRatio()` ladder — below 30 FPS for 2
consecutive windows drops the ratio by 0.1 (floor 0.5); above 55 raises it
(cap `devicePixelRatio`); the 2-window hysteresis absorbs transient spikes
(GLB loads, audio warmup), and the first window after mount is skipped.

```tsx
<CabinetCanvas active quality={{ maxDpr: 1.5, antialias: false }}>
  <AdaptiveResolution startCap={1.5} onUpdate={({ fps, pixelRatio }) => hud.set(...)} />
  <YourScene />
</CabinetCanvas>
```

Match `startCap` to your dpr band's max. **`priority` warning:** the default
(0) samples draw-call/triangle stats one frame late, which is fine for a
debug HUD. Only pass a positive `priority` (e.g. `2`) when something else
already owns the render loop (an EffectComposer at priority 1, as in
bone-buster) — in a plain auto-rendering Canvas, ANY positive useFrame
priority tells r3f you render manually and the scene goes black.

The ladder's state machine is exported pure as `stepPixelRatio` (unit-tested
without mounting r3f).

## Testing your mount

jsdom can't create a WebGL context. Pin your mount the way the source repo
does: a real-Chromium (vitest browser mode / Playwright) test that renders
the component, waits ~800ms, asserts `canvas.getContext('webgl2') ??
canvas.getContext('webgl')` is non-null, and captures a boot screenshot.

## Develop and release

Built on the fleet toolchain, Node 26 (`.node-version`) and pnpm 12 (`packageManager`, through
Corepack); the package itself runs on Node 24 and later.

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm verify   # Biome, tsc, Vitest (jsdom), the dual ESM/CJS build, a packed-tarball consumer smoke
```

Conventional Commits drive release-please; merging its release pull request tags `v<version>`.
The publish job in `.gitea/workflows/release.yml` reconciles on every `main` run: when the manifest
version is tagged but absent from the registry, it verifies at the tag, packs twice and requires byte
identity, publishes those bytes with the organisation secret `NPM_TOKEN` from a
throwaway npmrc, then reruns the consumer smoke against the published version with
`R3F_MOUNT_CONSUMER_SOURCE=@arcade-cabinet/r3f-mount@<version>` and an anonymous npm config. Never edit
the `version` field by hand.
