---
title: API reference
description: Core policy, adapter exports and ownership contracts.
---

Each JavaScript entry point ships ESM and CommonJS with matching declarations. Peers are optional in the manifest; applications install the peers their chosen entry point requires. The core has no dependencies. See [Getting started](./getting-started/) for installation and complete host examples.

## Core: `game-mount`

### Pixel ratio

| Export | Contract |
| --- | --- |
| `DEFAULT_MAX_DPR` | `2` |
| `readDevicePixelRatio()` | Global positive finite ratio, otherwise `1` |
| `getDpr(maxDpr = 2, devicePixelRatio = readDevicePixelRatio())` | `min(maxDpr, max(1, devicePixelRatio))`; cap must be positive and finite or throws `RangeError` |
| `dprRange(maxDpr = 2)` | Readonly `[min(1, maxDpr), maxDpr]`; same cap validation |

A cap below 1 deliberately permits undersampling. Pass a valid device ratio when supplying the second `getDpr` argument explicitly.

### Quality and environment

`RenderQuality` has readonly `maxDpr: number` and `antialias: boolean`. `QualityTier` is `"low" | "medium" | "high"`.

| Tier | maxDpr | antialias |
| --- | --- | --- |
| `QUALITY_TIERS.low` | 1 | false |
| `QUALITY_TIERS.medium` | 1.5 | true |
| `QUALITY_TIERS.high` | 2 | true |

`DEFAULT_QUALITY` is `high`. `detectQualityTier(navigator?)` returns `low` on mobile and `high` elsewhere; `detectQuality(navigator?)` returns its quality object.

`isMobileDevice(navigator?)` uses Client Hints, a mobile user agent or touch-capable iPadOS detection. `NavigatorLike` contains optional `userAgent`, `maxTouchPoints` and `userAgentData.mobile`. This is a rendering-budget heuristic; use viewport measurements for layout.

`detectReduceMotion()` reads `prefers-reduced-motion: reduce`, returning false when unavailable or the query throws. It does not disable animations itself.

### Host and phase

`GAME_CANVAS_HOST_CLASS` is `"game-canvas-host"`. `gameCanvasHostStyle` supplies the parent-sized flex host contract; `GameCanvasHostStyle` is its type. The identical CSS contract is exported from `game-mount/styles.css`. The parent must have a resolved height.

`isActivePhase<T extends string | number>(current: T, match: T | readonly T[]): boolean` matches one phase or several.

### Adaptive-resolution ladder

`stepPixelRatio(input: StepPixelRatioInput): StepPixelRatioResult` is a pure state transition. Input fields are `avgFps`, `current`, `cap`, `consecutiveLow` and `consecutiveHigh`. Output fields are `next`, `consecutiveLow` and `consecutiveHigh`; feed the counters into the next call and apply `next` to the renderer.

- Two consecutive windows below `LADDER_LOW_FPS` (30) step down.
- Two above `LADDER_HIGH_FPS` (55) step up.
- Intermediate windows clear both counters.
- `LADDER_STEP` is 0.1 and `LADDER_FLOOR` is 0.5; upward steps stop at `cap`.

Provide valid finite samples and a current ratio within your intended bounds. The function performs transitions, not general input validation or normalization.

### Asset errors

`errorMessage(error: unknown): string` extracts an Error message or stringifies the thrown value. `classifyAssetError(error)` returns `{ url, assetType }`, with `"unknown"` when it cannot identify either. `AssetErrorClass` is `"model" | "texture" | "wasm" | "font" | "audio" | "unknown"`.

`AssetErrorReason` adds a `message: string` to that classification. Detection uses the first absolute or root-relative URL and its extension; it is best-effort, not a security or network-status classifier.

## React: `game-mount/react`

Requires React. `GameCanvasErrorBoundary` takes `GameCanvasErrorBoundaryProps`:

| Prop | Meaning |
| --- | --- |
| `children?` | Canvas subtree |
| `onError` | Required callback receiving `AssetErrorReason` |
| `fallback?` | React node shown after failure; defaults to nothing |

Place a DOM fallback outside the renderer's internal scene tree. To retry, remount the boundary with a new key. Error URLs and messages should be displayed as text.

## Pixi: `game-mount/pixi`

Requires PixiJS 8. `mountPixi(options?: MountOptions): Promise<PixiMountHandle>` resolves after Application initialization.

| Mount option | Default and behavior |
| --- | --- |
| `container?` | Parent for an owned canvas |
| `canvas?` | Omit for a fresh owned canvas; a supplied canvas stays in the DOM after destroy |
| `background?` | Near-black clear color; number or string |
| `quality?` | `DEFAULT_QUALITY` |
| `pixelSnap?` | false; true forces resolution 1, no antialiasing and rounded pixels |
| `reduceMotion?` | Detected preference |
| `resizeMode?` | `"observer"`; also `"resizeTo"` or `"manual"` |
| `resizeTarget?` | Container for an owned canvas, otherwise canvas |
| `onResize?` | `(width, height) => void`, after the renderer resizes |

`PixiMountHandle` exposes readonly `app`, `canvas`, `reduceMotion`, `width`, `height`, plus `resize(width, height)` and idempotent `destroy()`. Sizes are integer CSS pixels, at least 1×1. Same-size requests are ignored. Destroy detaches wiring, destroys scene children while keeping shared textures, and removes only an owned canvas.

`applyFilterResolutionFix()` sets Pixi's default filter resolution to `"inherit"` for filters created afterward. Call explicitly before creating filters when needed; it changes the global Pixi default.

## Pixi hook: `game-mount/pixi/react`

Requires React and PixiJS 8. `usePixiMount(ref, options?: MountOptions): PixiMountHandle | null` mounts into a referenced element and cleans up on unmount. Prefer an HTMLElement container ref, so StrictMode always gets a fresh canvas. A canvas ref is unsafe for remounts after destruction.

The handle is null until asynchronous initialization completes. Options are read when the mount effect runs; changing options does not remount. Change the component key to rebuild with new options.

## @pixi/react: `game-mount/pixi/pixi-react`

Requires React, PixiJS 8 and @pixi/react 8. `PixiReactMount` wraps the Application owned by @pixi/react. It never creates another Application.

`PixiReactMountProps` includes `children`, `className`, `background`, `quality`, `pixelSnap`, `reduceMotion`, `resizeMode`, `resizeTarget`, `onResize` and `onReady`. Defaults match imperative Pixi. `PixiReactResizeTarget` accepts an HTMLElement, Window or HTMLElement ref; by default the parent sets the size.

`onReady(handle)` receives a `PixiReactMountHandle` with `app`, `canvas`, `reduceMotion`, `width`, `height` and `resize()`. It has no `destroy()` because React owns teardown. Mount options are captured for the component lifetime; change its key to rebuild. Callbacks use their latest props.

Use a browser bundler: @pixi/react 8.0.5's extensionless dependency import prevents plain Node ESM loading. The packed smoke resolves ESM and loads CommonJS; the real-WebGL browser test loads the actual component.

## r3f: `game-mount/r3f`

Requires React, Three and @react-three/fiber 9. `GameCanvas` fills its parent with an inline host contract and an r3f Canvas. `GameCanvasProps` extends Canvas props except `dpr` and `gl`:

| Prop | Default and behavior |
| --- | --- |
| `active` | Required; false unmounts the canvas |
| `children` | Required scene children |
| `quality?` | `DEFAULT_QUALITY` |
| `onContextLost?`, `onContextRestored?` | Canvas callbacks; defaults log warnings |
| `preserveDrawingBuffer?` | false; enable only for readback |
| `toneMappingExposure?` | 1 |
| `hostProps?` | Div attributes, merged class name and overriding styles; `GameCanvasHostProps` supports `data-*` |

The renderer uses ACES filmic tone mapping, sRGB output and high-performance power preference. Context loss calls `preventDefault`; restoration remounts the canvas. Keep persistent state outside scene children.

`AdaptiveResolution` takes `AdaptiveResolutionProps`: `maxDpr = 2`, `startDpr = 1.5`, `priority = 0` and `onUpdate?`. Place it inside GameCanvas and pass the same quality cap. It samples 60-frame windows with a two-second settling period and drives the shared ladder.

`onUpdate` receives `AdaptiveResolutionInfo`: `fps`, `pixelRatio`, and optional peak `drawCalls` and `triangles`. A positive priority disables r3f automatic rendering; use it only when another component owns rendering manually. Prefer ESM because Three's CommonJS build emits a deprecation warning.

## Babylon: `game-mount/babylon`

Requires React, Babylon core and Reactylon.

`babylonEngineOptions(input?: BabylonEngineOptionsInput)` returns EngineOptions. Input accepts `quality?`, `navigator?` and `overrides?`. Quality defaults to detected low on mobile, high elsewhere. Options cap the device ratio, enable adaptation, disable preserved drawing buffers, and select mobile low-power/no-stencil or desktop high-performance/stencil. Overrides are spread last and can replace policy values.

`SceneRoot<T>` takes `SceneRootProps<T>`: `activeKey`, `matchKey` (one key or a readonly list) and `children(root: TransformNode)`. It creates a root while matched and disposes it and parented content on exit. Keep Engine and Scene mounted above it. Parent meshes to the supplied root.

`useBeforeRender(callback, deps = [])` registers a Reactylon scene observer and removes it on unmount. The callback receives `(deltaSeconds, scene)` with delta capped at `MAX_FRAME_DELTA` (0.05 seconds). The latest callback is used without resubscribing unless scene or dependencies change.

## Havok: `game-mount/babylon/havok`

Requires React, Babylon core and Havok. `useHavokPhysics(wasmBaseUrl = "/havok/"): UseHavokPhysicsResult` returns `{ plugin: HavokPlugin | null, error: Error | null }`.

Serve `HavokPhysics.wasm` yourself; custom base URLs need a trailing slash. Enable physics on the scene and choose gravity/units in application code once the plugin is available. Loads are cached by the current base URL; a failed load clears its cache for a later mount to retry. This entry registers Babylon's physics scene component on import.

`_resetHavokPhysicsCache()` clears the cache for tests. It is not an application lifecycle primitive.
