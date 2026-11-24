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

## Camera: `game-mount/camera`

A bounded ground camera as pure maths, with no peers: it imports no renderer and no input library.
It suits a tilted view over a bounded piece of land. Feed it pixel deltas from any pointer source
and apply the pose to any renderer's camera. For react-three-fiber, `GroundCameraRig` in
`game-mount/r3f` does that.

World units are whatever your scene uses (this page says metres). The ground is the plane y = 0,
x points east and z south. A camera at yaw 0 looks toward −z; yaw grows clockwise seen from above.

### State and limits

`GroundCameraState` is `{ x, z, span, yaw }`: the ground point the camera looks at, the span in
world units visible across the short axis of the screen at that point, and the yaw in radians.
Zoom is the span, so a phone in portrait and a desktop monitor show the same amount of ground at
the same span.

`GroundCameraLimits` holds everything fixed about the view:

| Field | Meaning |
| --- | --- |
| `bounds` | `readonly Rect[]`: the target may be anywhere in the union of these rectangles. At least one |
| `minSpan`, `maxSpan` | Closest and farthest zoom. `0 < minSpan <= maxSpan`, both finite |
| `pitch` | Radians below horizontal, strictly between 0 and π/2. A number is fixed; `{ atMinSpan, atMaxSpan }` varies with zoom along a smoothstep over the geometric span range |
| `fov` | Vertical field of view in radians, strictly between 0 and π |
| `terrain?` | `{ height(x, z), clearance }`: the target sits on the ground there and the eye keeps `clearance` above the ground beneath it |

A `Rect` is `{ minX, minZ, maxX, maxZ }`. Limits are plain data: to open more ground (a base area
plus regions added later), pass a new limits object whose `bounds` came from `growBounds`.

### Bounds

| Export | Contract |
| --- | --- |
| `clampToBounds(bounds, x, z)` | The nearest point of the union. A point inside any rectangle is returned as is; otherwise the nearest per-rectangle projection wins, so a point pushed past an edge keeps its position along it (a drag slides). A point in the notch of an L-shaped union lands on the nearer inner edge. Equal distances go to the earlier rectangle. Throws `RangeError` for an empty union |
| `inflateRect(rect, margin)` | The rectangle grown by `margin` on every side |
| `growBounds(bounds, ...rects)` | A new union with the rectangles added; covered ones are dropped. The input is untouched |
| `clampState(state, limits)` | The state with its target in the bounds and its span between the limits. Yaw is untouched. Returns the same object when nothing changes. Throws `RangeError` for unusable span limits |

### Pose

`poseFor(state, limits, aspect)` returns `{ position, target, fov, pitch, distance }` in world
units for a screen aspect (width over height). It clamps the state first. Apply `position`,
`target` and `fov` to your camera; `fov` is in radians. Throws `RangeError` for a non-positive or
non-finite aspect, a bad `fov` or `pitch`, or unusable span limits.

The span is measured at the target. Across the screen's width it is exact. Down its height the
tilt stretches the ground by 1 / sin(pitch), so the span is the target's local scale there. The
camera frames the smaller of the two, which is the short axis of the visible ground. That choice
is continuous in the aspect, so a foldable that unfolds to a near-square screen does not jump.
With a terrain, the eye is lifted if it would sit below the clearance; the span is then measured
from the unlifted pose.

`pitchFor(limits, span)` is the pitch `poseFor` uses at a span.

### Gestures

Every gesture takes `(state, limits, viewport, ...)`, with the viewport in CSS pixels, and returns
a new state clamped to the limits. None of them reads a device or event.

| Export | Behavior |
| --- | --- |
| `screenToGround(state, limits, viewport, x, y)` | The ground point seen through a pixel, or `null` at or above the horizon |
| `dragGround(state, limits, viewport, from, to)` | Moves the ground so the point under `from` ends under `to`, at any tilt and yaw. Against a boundary it slides. A pixel above the horizon leaves the state unchanged |
| `panByPixels(state, limits, viewport, dx, dy)` | A drag by a finger at the screen centre: the ground follows, so a positive `dx` moves the camera toward the left of the screen |
| `zoomBy(state, limits, viewport, factor, anchor?)` | Multiplies the span by `factor` (above 1 zooms out), held between the limits. With an `anchor` pixel the ground under it stays under it. Throws `RangeError` for a factor that is not positive and finite |
| `rotateBy(state, limits, viewport, deltaYaw, anchor?)` | Turns by `deltaYaw`, keeping yaw in (−π, π]. With an `anchor` pixel the ground under it stays under it |

Anchoring and dragging cast their rays from the pose `poseFor` returns. They are exact on flat
ground and treat the ground as flat at the target's height, so over steep terrain they are
approximate.

### Easing

`easeToward(current, goal, deltaSeconds, smoothing = DEFAULT_SMOOTHING)` moves `current` toward
`goal` by `1 - exp(-deltaSeconds / smoothing)` of the gap, so the motion does not depend on the
frame rate (two half-steps equal one whole step) and never overshoots. The target eases linearly,
the span geometrically and the yaw along the shorter arc. `smoothing` is a time constant in
seconds (`DEFAULT_SMOOTHING` is 0.12); zero or less returns `goal`. A goal that moves, such as a
followed target, needs `clampState` on the eased result, since a straight line between two
allowed points can cross a notch of the union.

```ts
import { clampState, dragGround, easeToward, growBounds, inflateRect, poseFor } from "game-mount/camera";

let limits = {
  bounds: [inflateRect({ minX: 0, minZ: 0, maxX: 64, maxZ: 64 }, 8)],
  minSpan: 24,
  maxSpan: 160,
  pitch: { atMinSpan: 0.62, atMaxSpan: 1.1 },
  fov: 0.7,
};
let goal = { x: 32, z: 32, span: 60, yaw: 0 };
let shown = goal;
const viewport = { width: 390, height: 844 };

// From any pointer source: the ground under the finger stays under it.
goal = dragGround(goal, limits, viewport, { x: 200, y: 500 }, { x: 180, y: 520 });

// Each frame: ease, clamp, pose.
shown = clampState(easeToward(shown, goal, 1 / 60), limits);
const pose = poseFor(shown, limits, viewport.width / viewport.height);

// Open another region later.
limits = { ...limits, bounds: growBounds(limits.bounds, inflateRect({ minX: 64, minZ: 0, maxX: 128, maxZ: 64 }, 8)) };
```

### Screen projection

`projectAnchor(point, view, viewport, insets = 0)` is the maths behind HTML anchored to a world
point (a marker over a thing, a count on a part, an arrow at the screen edge). It attaches to no
renderer and works with any camera, ground camera or not. `game-mount/r3f`'s `Anchor` family is
built on it.

| Input | Meaning |
| --- | --- |
| `point` | `Vec3`, `[x, y, z]` in world units |
| `view` | `AnchorView`: `viewProjection` (the projection matrix times the inverse of the camera's world matrix, 16 numbers column-major, as three.js `Matrix4.elements`) and `eye` (the camera's world position). Perspective and orthographic projections both work |
| `viewport` | `Viewport` in CSS pixels |
| `insets` | A number for all four sides, or any of `top`, `right`, `bottom`, `left` (`EdgeInsets`): the margins HUD furniture takes |

It returns an `AnchorProjection`:

| Field | Meaning |
| --- | --- |
| `x`, `y` | The point's pixel (origin top left, y down). Behind the camera it equals `edge`, since the projected spot means nothing |
| `distance` | Straight-line distance from the eye to the point, in world units |
| `inFront` | The point is in front of the camera (clip `w` above zero) |
| `inside` | In front of the camera and inside the viewport shrunk by `insets`, border included |
| `edge` | `{ x, y, angle }`: where an indicator goes. The point itself when `inside`; otherwise the spot on the border of the inset rectangle along the ray from that rectangle's centre toward the point. `angle` is that ray's direction, `atan2(dy, dx)` with y down (0 points right, π/2 down) |

A point behind the camera points the way the camera would have to turn to face it, not the mirrored
way that dividing by a negative `w` would give; one straight behind points down. Insets larger than
the viewport leave a rectangle with no size, and every indicator sits at its centre. It throws
`RangeError` for a viewport that is not positive and finite, or an inset that is negative or not
finite. Where an anchor is under a HUD bar, `inside` is false and the indicator sits on the bar's
edge, so nothing is lost beneath furniture.

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

Requires React, Three and @react-three/fiber >=9.8.2. `GameCanvas` fills its parent with an inline host contract and an r3f Canvas. `GameCanvasProps` extends Canvas props except `dpr` and `gl`:

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

### Explicit scene lifetime

Use `ManagedGameCanvas` when a scene reads an external simulation that must outlive React cleanup.
It owns one imperative R3F root and one ResizeObserver. It shares `GameCanvas`'s host, quality,
rendering defaults and context recovery, and takes:

| Prop | Behavior |
| --- | --- |
| `active`, `children`, `quality?`, `hostProps?` | Same host and quality contract as `GameCanvas` |
| `preserveDrawingBuffer?`, `toneMappingExposure?` | Same renderer defaults as `GameCanvas` |
| `onContextLost?`, `onContextRestored?` | Optional canvas callbacks; restore creates a fresh canvas |
| `onMount` | Receives the root's `R3FMount` before configuration, even before the scene is ready |
| `options?` | R3F root options such as camera, frameloop, shadows and onCreated; size, dpr and gl are owned here |
| `onError?` | Configuration/retirement failures; defaults to console.error |

The scene has its own React root: pass dependencies as props or provide context inside children.
DOM attributes belong in `hostProps`. `GameCanvas` remains available for scenes using R3F's Canvas
and its automatic React context bridge; its unmount is not an asynchronous disposal signal.

`createR3FMount(canvas)` supplies the same ownership contract for imperative hosts. Its `R3FMount`
has readonly `canvas` and `retiring`, `configure(options): Promise<void>`, `render(children): void`
and `retire(): Promise<void>`. Configure before rendering; the caller owns sizing and events.

Every retire call returns the same promise. It blocks further configuration/rendering, stops
normal frame callbacks through public `setFrameloop("never")`, and resolves only after R3F's
unmount callback, including React effect cleanup and renderer release. Keep simulation/world
resources alive until that promise resolves. Pending renderer factories and asynchronous renderer
disposal delay resolution; a factory that never settles also prevents retirement from completing.
Do not call manual `advance()` against a retiring root.

Save each handle from `onMount` by its canvas, including StrictMode and context-restore generations.
Stop the presentation, await all their retire promises, then dispose shared simulation resources.
React removal also retires the root idempotently. If the retirement call throws, its promise rejects and retains canvas ownership. R3F reports
third-party cleanup errors it catches through console warnings; completion is not a guarantee
that every renderer resource was successfully released.

Never mix this owner with R3F's `Canvas`, `createRoot` or `unmountComponentAtNode` on the same canvas.
A second owner is refused until retirement finishes. Prefer a fresh canvas after retirement because
renderer release loses its WebGL context. No private R3F state is read or written.

`AdaptiveResolution` takes `AdaptiveResolutionProps`: `maxDpr = 2`, `startDpr = 1.5`, `priority = 0` and `onUpdate?`. Place it inside GameCanvas and pass the same quality cap. It samples 60-frame windows with a two-second settling period and drives the shared ladder.

`onUpdate` receives `AdaptiveResolutionInfo`: `fps`, `pixelRatio`, and optional peak `drawCalls` and `triangles`. A positive priority disables r3f automatic rendering; use it only when another component owns rendering manually. Prefer ESM because Three's CommonJS build emits a deprecation warning.

### Ground camera rig

`GroundCameraRig` applies the ground camera of `game-mount/camera` to the canvas's perspective
camera. It renders nothing, reads no input and depends on no input library: write the goal from
whichever source the game uses. Props (`GroundCameraRigProps`):

| Prop | Behavior |
| --- | --- |
| `limits` | `GroundCameraLimits`. Changing it re-clamps on the next frame, so ground opened later is usable at once |
| `stateRef` | `{ current: GroundCameraState }`, the goal. Input handlers write it; each frame the rig clamps it to `limits` (and to `follow`) and writes it back, so it never holds an unreachable position |
| `follow?` | A `{ x, z }` point, or a getter called every frame for a moving target (return `null` for none). While it gives a point it overrides the goal's centre; pass `null` or leave it out to hand control back |
| `smoothing?` | Easing time constant in seconds, default `DEFAULT_SMOOTHING`; 0 snaps |
| `priority?` | `useFrame` priority, default -1: the camera moves before priority-0 readers, without taking over rendering |

The first frame starts on the goal. Later frames ease the shown state toward it with `easeToward`
(exponential, frame-rate independent, yaw along the shorter arc), clamp it, then set the camera's
position, look-at target and field of view, calling `updateProjectionMatrix` only when the field of
view changes. A canvas with no size yet, or a camera that is not a `PerspectiveCamera`, is left
alone. It assumes r3f's continuous frame loop; with `frameloop="demand"` call `invalidate()`.

```tsx
import { type GroundCameraLimits, type GroundCameraState, zoomBy } from "game-mount/camera";
import { GameCanvas, GroundCameraRig } from "game-mount/r3f";
import { useRef, type WheelEvent } from "react";

const limits: GroundCameraLimits = {
  bounds: [{ minX: 0, minZ: 0, maxX: 64, maxZ: 64 }],
  minSpan: 24,
  maxSpan: 160,
  pitch: { atMinSpan: 0.62, atMaxSpan: 1.1 },
  fov: 0.7,
};

export function GroundView() {
  const goal = useRef<GroundCameraState>({ x: 32, z: 32, span: 60, yaw: 0 });
  // Any input source writes the goal; here the wheel zooms toward the pointer.
  const onWheel = (event: WheelEvent<HTMLElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    goal.current = zoomBy(
      goal.current,
      limits,
      { width: box.width, height: box.height },
      1.0015 ** event.deltaY,
      { x: event.clientX - box.left, y: event.clientY - box.top }
    );
  };
  return (
    <main style={{ height: 480, display: "flex" }} onWheel={onWheel}>
      <GameCanvas active>
        <GroundCameraRig limits={limits} stateRef={goal} />
      </GameCanvas>
    </main>
  );
}
```

### World-anchored markers

HTML that follows a world position, keeps one size on screen at any distance, and shows an
indicator at the border of the view while its anchor is off screen: a marker over a thing, a count
on a part, a label, an arrow. It is plain DOM in the host's own React tree, so the host's context,
styles and focus order reach it. Placement is written straight to the DOM each frame; a moving
marker costs no React render.

It takes three pieces that share one tracker, because a `<div>` cannot render inside the canvas's
own React root:

| Piece | Where | Role |
| --- | --- | --- |
| `useAnchorTracker()` or `createAnchorTracker()` | Host's tree | The `AnchorTracker` that joins the other two |
| `AnchorProjector` | Inside the canvas | Projects every anchor through the canvas camera each frame |
| `AnchorLayer` and `Anchor` | Host's tree, over the canvas | The overlay and the markers in it |

`AnchorProjectorProps`: `tracker`, `insets?` (a number, or any of `top`, `right`, `bottom`,
`left`: the margins HUD furniture takes, so an anchor under a bar gets its indicator on the bar's
edge instead of being lost beneath it), `maxEdgeIndicators?` (default unlimited) and `priority?`
(default 0; keep it at or below 0, so it runs after a camera rig at -1 and never takes over
rendering). It reads the canvas's own `size`. It re-reads the camera's matrices itself, so a marker
is exact in the frame the camera moved, not one frame behind. With `frameloop="demand"`, call
`invalidate()` when a position changes.

`AnchorLayer` takes `tracker`, `children` and any div attributes. It fills its nearest positioned
ancestor (`position: absolute; inset: 0; overflow: hidden`) and lets every pointer through except
to an anchor that asked for one. Put it in the same box as the canvas, after it:

`AnchorProps`:

| Prop | Behavior |
| --- | --- |
| `position` | Required. `[x, y, z]`, or a getter called every frame for a moving thing (`null` hides) |
| `children?` | The marker, shown while the anchor is in view. Only what the host passes is drawn: no default glyph, text or accessible name |
| `edge?` | The indicator shown at the border while the anchor is off screen or under the insets. Omit it and the anchor is hidden there. Its centre sits on the border |
| `offset?` | `[x, y]` pixels from the projected point, applied to the marker only, for example `[0, -24]` to sit above a thing |
| `size?` | The glyph box in pixels: a number for a constant size at any distance, or `(distance) => px` (world units in) for a size that varies by distance, such as 24 to 40. Also published as `--anchor-size`. Omit it and the content sizes itself |
| `minTarget?` | Smallest side of the press target in pixels (48, or 64 with large targets on). The glyph keeps its size, centred in the target |
| `edgeRank?` | Lower ranks get limited indicator slots first; equal ranks go to the nearer anchor. Default 0 |
| `onPress?` | Makes the marker a `<button>` (click, Enter, Space) |
| `onPointerDown?` | Makes the marker a `<button>`; receives the pointer-down unchanged and never prevented, so a press can start a drag the host owns. The button has `touch-action: none` |
| `label?` | `aria-label` of the button, from the host's own words |
| `onStateChange?` | `(state: "inside" \| "edge" \| "hidden") => void`, called on a change only, not every frame |
| `className?`, `style?` | On the anchor's zero-size origin element; the layout contract wins over `style` |

The anchor's origin element carries `data-state` (`inside`, `edge`, `hidden`) and three CSS
variables for the host's styling: `--anchor-distance` (world units), `--anchor-size` (with `size`)
and `--anchor-angle` (radians toward the anchor, while at the edge: `transform:
rotate(var(--anchor-angle))` turns an arrow drawn pointing right). The marker part and the edge
part are marked `data-anchor-part="marker"` and `"edge"`; the hidden one has the `hidden`
attribute. `hidden` also covers an anchor with no position and one that lost an indicator slot to
`maxEdgeIndicators`.

What the package leaves to the host: choosing which things get markers, ordering and capping them
(it publishes `--anchor-distance` and takes `edgeRank` so the host decides), the words and glyphs,
and motion. It animates nothing, so a marker never bobs or pulses by itself; a host that adds
motion should gate it on `detectReduceMotion()` or its own setting. Anchors are overlays drawn
above the scene and are not hidden by objects in front of them. An anchor behind the camera points
the way the camera would turn to face it.

`createAnchorTracker()` returns an `AnchorTracker` with `register(target)`, `update(frame)` and
`refresh()`. `update` is what `AnchorProjector` calls each frame; call it from another loop with an
`AnchorFrame` (`camera`, `width`, `height`, `insets?`, `maxEdgeIndicators?`) to drive anchors
without the component. `Anchor` calls `refresh()` after every commit so a changed prop shows at
once on an idle canvas. A negative or non-finite inset throws `RangeError`.

```tsx
import { Anchor, AnchorLayer, AnchorProjector, GameCanvas, useAnchorTracker } from "game-mount/r3f";

export function Field({ things }: { things: readonly { id: string; at: [number, number, number]; label: string }[] }) {
  const tracker = useAnchorTracker();
  return (
    <div style={{ position: "relative", height: 480 }}>
      <GameCanvas active>
        <AnchorProjector tracker={tracker} insets={{ top: 96, bottom: 120 }} maxEdgeIndicators={3} />
      </GameCanvas>
      <AnchorLayer tracker={tracker}>
        {things.map((thing) => (
          <Anchor
            key={thing.id}
            position={thing.at}
            offset={[0, -24]}
            size={(distance) => Math.max(24, Math.min(40, 48 - distance * 2))}
            minTarget={48}
            label={thing.label}
            onPress={() => console.info(thing.id)}
            edge={<span style={{ display: "block", transform: "rotate(var(--anchor-angle))" }}>➤</span>}
          >
            <span>{thing.label}</span>
          </Anchor>
        ))}
      </AnchorLayer>
    </div>
  );
}
```

`projectAnchor` in `game-mount/camera` is the maths underneath, usable from any renderer.

## Babylon: `game-mount/babylon`

Requires React, Babylon core and Reactylon.

`babylonEngineOptions(input?: BabylonEngineOptionsInput)` returns EngineOptions. Input accepts `quality?`, `navigator?` and `overrides?`. Quality defaults to detected low on mobile, high elsewhere. Options cap the device ratio, enable adaptation, disable preserved drawing buffers, and select mobile low-power/no-stencil or desktop high-performance/stencil. Overrides are spread last and can replace policy values.

`SceneRoot<T>` takes `SceneRootProps<T>`: `activeKey`, `matchKey` (one key or a readonly list) and `children(root: TransformNode)`. It creates a root while matched and disposes it and parented content on exit. Keep Engine and Scene mounted above it. Parent meshes to the supplied root.

`useBeforeRender(callback, deps = [])` registers a Reactylon scene observer and removes it on unmount. The callback receives `(deltaSeconds, scene)` with delta capped at `MAX_FRAME_DELTA` (0.05 seconds). The latest callback is used without resubscribing unless scene or dependencies change.

## Havok: `game-mount/babylon/havok`

Requires React, Babylon core and Havok. `useHavokPhysics(wasmBaseUrl = "/havok/"): UseHavokPhysicsResult` returns `{ plugin: HavokPlugin | null, error: Error | null }`.

Serve `HavokPhysics.wasm` yourself; custom base URLs need a trailing slash. Enable physics on the scene and choose gravity/units in application code once the plugin is available. Loads are cached by the current base URL; a failed load clears its cache for a later mount to retry. This entry registers Babylon's physics scene component on import.

`_resetHavokPhysicsCache()` clears the cache for tests. It is not an application lifecycle primitive.
