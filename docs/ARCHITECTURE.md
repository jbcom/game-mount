---
title: Architecture
description: Module boundaries, the invariants each adapter keeps, and how they are tested.
---

game-mount puts a game renderer into a parent-sized box and applies one rendering policy to it,
whichever renderer it is. The reasons behind each choice below are in [Decisions](./decisions/).

## Layout

```text
src/
  index.ts            core barrel: game-mount
  core/               renderer-neutral policy, no dependencies
    dpr.ts            getDpr, dprRange, readDevicePixelRatio
    quality.ts        RenderQuality, QUALITY_TIERS, detectQuality
    device.ts         isMobileDevice
    motion.ts         detectReduceMotion
    host.ts           gameCanvasHostStyle, GAME_CANVAS_HOST_CLASS
    phase.ts          isActivePhase
    pixelRatioLadder.ts  stepPixelRatio
    assetError.ts     classifyAssetError
  styles.css          game-mount/styles.css, the host contract as CSS
  react/              game-mount/react: GameCanvasErrorBoundary (react)
  pixi/
    index.ts          game-mount/pixi: mountPixi, applyFilterResolutionFix (pixi.js)
    react.ts          game-mount/pixi/react: usePixiMount (pixi.js, react)
    pixi-react.tsx    game-mount/pixi/pixi-react: PixiReactMount (pixi.js, react, @pixi/react)
    shared.ts         measuring, resize sizing and render options both Pixi paths use
  r3f/                game-mount/r3f: GameCanvas, AdaptiveResolution (react, three, @react-three/fiber)
  babylon/
    index.ts          game-mount/babylon: babylonEngineOptions, SceneRoot, useBeforeRender
                      (react, @babylonjs/core, reactylon)
    havok.ts          game-mount/babylon/havok: useHavokPhysics (+ @babylonjs/havok)
```

## Dependency rule

```text
core  <-  react  <-  r3f
  ^         
  |-- pixi (mount.ts, shared.ts)  <-  pixi/react, pixi/pixi-react
  |-- babylon  <-  babylon/havok (imports nothing from babylon/index)
```

The core imports nothing. Adapters import the core and their own renderer, never another adapter's
renderer. Every peer is optional, and each entry point's runtime import graph reaches only the
peers listed for it; `tests/repository-contract.test.ts` enforces this from the source, and the
consumer smoke enforces it by installation.

## The policy every adapter applies

| Concern | Core export | Pixi | @pixi/react | r3f | Babylon |
| --- | --- | --- | --- | --- | --- |
| Pixel ratio | `getDpr`, `dprRange` | `resolution` | `resolution` | `dpr` band | `limitDeviceRatio` |
| Antialiasing | `RenderQuality.antialias` | `antialias` | `antialias` | `gl.antialias` | `antialias` |
| Default quality | `DEFAULT_QUALITY` (`high`) | yes | yes | yes | `detectQuality()` |
| Reduced motion | `detectReduceMotion` | on the handle | on the handle | game's call | game's call |
| Parent-sized host | `gameCanvasHostStyle`, `styles.css` | container | parent | built in | wrapping `<div>` |
| Phase gate | `isActivePhase` | render or not | render or not | `active` prop | `SceneRoot` |
| Runtime resolution | `stepPixelRatio` | caller drives it | caller drives it | `AdaptiveResolution` | caller drives it |
| Load failures | `classifyAssetError` | `GameCanvasErrorBoundary` | same | same | same |

Babylon's default is `detectQuality()` rather than the `high` tier because its engine options are
built once per engine and were always mobile-aware; the other adapters take an explicit tier from
the game.

## Invariants

Breaking one of these reintroduces the bug it exists to prevent.

1. **A Pixi Application never reuses a canvas another Application used.** Pixi's `destroy()` loses
   the WebGL context, and a canvas keeps a lost context forever. `mountPixi` owns a fresh canvas
   per Application by default and removes it on destroy; `usePixiMount` passes a container, not a
   canvas; `PixiReactMount` never creates an Application of its own.
2. **One resize pipeline per mount.** Every resize goes through `renderer.resize()`, and `onResize`
   runs from the renderer's own `resize` event, so scene reflow always follows the surface resize.
   There is never a second observer on the same element.
3. **`PixiReactMount` wires only a live Application.** On effect reconnect it rebinds only the
   Application `@pixi/react` still holds.
4. **A lost WebGL context is recovered by remounting.** `GameCanvas` calls `preventDefault` on
   `webglcontextlost` and remounts the `<Canvas>` on `webglcontextrestored`; three cannot
   repopulate a restored context in place.
5. **One DPR rule.** Every adapter's ratio comes from `getDpr`/`dprRange`; no adapter reads
   `devicePixelRatio` and applies it uncapped.
6. **The host contract has one source.** The stylesheet is checked declaration by declaration
   against `gameCanvasHostStyle`.
7. **Havok loads once per page, and a failure is retried.** The module-level promise is shared by
   every mount for the same base URL and dropped if it rejects.
8. **Nothing at module scope touches the DOM.** Every entry point loads in Node (the consumer smoke
   does exactly that), so server rendering and tests can import it.

## Tests

| Layer | Where | What it proves |
| --- | --- | --- |
| Unit (jsdom) | `tests/core`, `tests/react`, `tests/pixi`, `tests/r3f`, `tests/babylon` | Every branch of `src`, at 100% coverage; Babylon runs for real on `NullEngine` |
| Contract | `tests/repository-contract.test.ts` | Exports map, optional peers, peer isolation, CI installs Chromium |
| Real WebGL | `tests/browser/pixi-react-mount.test.tsx` | `@pixi/react` under StrictMode on a real context in Chromium |
| Package | `publint`, `attw` | The exports map and the ESM/CommonJS type layout |
| Consumer | `scripts/consumer-smoke.mjs` | Each entry point installs with only its peers and loads under ESM and CommonJS |

`pnpm verify` runs all of them, in that order after lint and typecheck.
