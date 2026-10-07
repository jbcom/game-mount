# @arcade-cabinet/babylon-mount

Companion primitives for Reactylon (React renderer for Babylon.js) games: a per-frame hook, a
phase-gated scene subtree, a cached Havok physics loader, mobile-aware engine options and a
safe-area inset reader for Babylon GUI. Extracted from martian-trail, where it first lived in
`packages/babylon-mount` before moving here with its history (see `docs/decisions.md`).

## Install

```sh
pnpm add @arcade-cabinet/babylon-mount
```

Served by the `arcade-cabinet` Gitea registry on a private network, read anonymously:

```ini
@arcade-cabinet:registry=https://registry.npmjs.org/
```

Peers: `@babylonjs/core` ^7, ^8 or ^9 (tested against 9), `@babylonjs/havok` ^1, `react` ^18 or ^19,
`reactylon` ^3.

## API

| Export | What it does |
| --- | --- |
| `useBeforeRender(callback, deps?)` | Subscribes to the active scene's `onBeforeRenderObservable` and removes the observer on unmount. The callback gets `(delta, scene)` with `delta` in seconds, clamped to 50 ms so a backgrounded tab cannot spike the simulation. The latest callback is read through a ref, so only the scene and explicit `deps` re-subscribe |
| `SceneRoot({ activeKey, matchKey, children })` | Mounts a `TransformNode` and its children while `activeKey === matchKey`, and disposes the subtree on exit. The Engine and Scene stay mounted above it, so menu, gameplay and game-over screens can share one engine. `children` is `(root) => ReactNode` |
| `useHavokPhysics(wasmBaseUrl = '/havok/')` | Loads the Havok WASM once per process (the promise is cached at module scope) and returns `{ plugin, error }`. Enabling physics and choosing gravity stay with the caller |
| `mobileEngineOptions(overrides?)` | Babylon `EngineOptions` tuned for mobile (no stencil, no antialias on high-DPI, low-power preference), with `overrides` spread last |
| `mobileHardwareScalingLevel()` | The scaling level to pass to `engine.setHardwareScalingLevel()` on mobile screens above DPR 2 (1 elsewhere) |
| `isMobileDevice()` | The user-agent sniff the two above share |
| `getSafeAreaInsets()` / `resetSafeAreaCache()` | `env(safe-area-inset-*)` resolved to pixel numbers through a hidden probe, for HUD offsets that CSS cannot reach because Babylon GUI draws on the canvas. Cached until reset; zeros on the server and where there is no notch |

```tsx
import { Engine } from 'reactylon/web';
import { Scene } from 'reactylon';
import {
  SceneRoot,
  mobileEngineOptions,
  useBeforeRender,
} from '@arcade-cabinet/babylon-mount';

<Engine engineOptions={mobileEngineOptions({ preserveDrawingBuffer: true })}>
  <Scene>
    <SceneRoot activeKey={phase} matchKey="gameplay">
      {(root) => <Level parent={root} />}
    </SceneRoot>
  </Scene>
</Engine>;
```

## Develop and release

Built on the fleet toolchain, Node 26 (`.node-version`) and pnpm 12 (`packageManager`, through
Corepack); the package itself runs on Node 24 and later.

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm verify   # Biome, tsc, Vitest (jsdom, Babylon NullEngine), the dual ESM/CJS build, a packed-tarball consumer smoke
```

Conventional Commits drive release-please; merging its release pull request tags `v<version>`.
The publish job in `.gitea/workflows/release.yml` reconciles on every `main` run: when the manifest
version is tagged but absent from the registry, it verifies at the tag, packs twice and requires byte
identity, publishes those bytes with the organisation secret `NPM_TOKEN` from a
throwaway npmrc, then reruns the consumer smoke against the published version with
`BABYLON_MOUNT_CONSUMER_SOURCE=@arcade-cabinet/babylon-mount@<version>` and an anonymous npm config.
Never edit the `version` field by hand.
