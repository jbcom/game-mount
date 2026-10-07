---
title: Decisions
description: Why game-mount is shaped the way it is, one decision at a time.
---

Each entry records a decision, the reason for it, and what it costs. The architecture these add
up to is in [Architecture](./ARCHITECTURE/).

## One package, renderer adapters as subpath exports

**Decision.** game-mount is one npm package. The renderer-neutral core is the root export; each
renderer is a subpath (`game-mount/pixi`, `game-mount/pixi/react`, `game-mount/pixi/pixi-react`,
`game-mount/r3f`, `game-mount/babylon`, `game-mount/babylon/havok`), with renderer-neutral React
pieces at `game-mount/react`. Every peer dependency is optional.

**Why.** It began as three packages, one per renderer, that had each grown its own copy of the same
policy: a DPR cap, reduced-motion detection, mobile detection, a parent-sized host. Three copies
drift; they already had (three different DPR rules, below). One package gives one policy, one
release, and one place to fix a bug. Subpaths keep the cost of that at zero for consumers: each
entry point's import graph reaches only its own renderer, so a Pixi game installs `pixi.js` and
nothing else.

**How it is held.** `tests/repository-contract.test.ts` walks each entry point's runtime imports
and fails if one reaches a peer outside its list. `scripts/consumer-smoke.mjs` installs the packed
tarball into one scratch project per entry point with only that entry's peers, checks the other
renderers are absent, and loads the entry under ESM and CommonJS.

## What the core holds, and what stays per renderer

**Decision.** The core holds the policy every renderer shares: `getDpr`/`dprRange`, `RenderQuality`
and the quality tiers, `isMobileDevice`, `detectReduceMotion`, the host contract
(`gameCanvasHostStyle`, `GAME_CANVAS_HOST_CLASS`, `styles.css`), `isActivePhase`, the
adaptive-resolution ladder (`stepPixelRatio`) and `classifyAssetError`. Mounting itself stays per
renderer.

**Why.** The renderers genuinely differ in who owns what. `mountPixi` creates and owns an
Application and its canvas; `@pixi/react` owns its Application and the component can only wrap it;
react-three-fiber and Reactylon own their canvas through React components. A shared `mount()`
abstraction over those would either hide the ownership differences that the StrictMode and
context-loss fixes depend on, or leak them back through options. So the adapters share policy
(numbers, rules, CSS), not lifecycle code.

## One DPR policy

**Decision.** The ratio a renderer draws at is `min(maxDpr, max(1, devicePixelRatio))`, from
`getDpr`. A `maxDpr` below 1 is allowed and wins over the floor. r3f receives the same rule as the
band `dprRange(maxDpr)`; Babylon receives it as `limitDeviceRatio` with `adaptToDeviceRatio: true`.

**Why.** The three predecessors disagreed. Pixi capped at `maxResolution` with no floor (its
documentation claimed a floor of 1). r3f used the band `[1, maxDpr]`. Babylon rendered at the full,
uncapped device ratio on desktop and at 1 on mobile, then offered `mobileHardwareScalingLevel()`,
which returned `devicePixelRatio / 2` (1.5 on a 3x phone). Babylon's hardware scaling level is the
inverse of a pixel ratio (render size is the canvas CSS size divided by the level), so applying it
rendered a 3x phone at two thirds of its CSS resolution, not at 2x as its documentation said.
`limitDeviceRatio` is Babylon's own cap on the ratio and gives the intended result directly, so
`mobileHardwareScalingLevel` is removed rather than fixed.

The floor of 1 exists because a zoomed-out browser reports a ratio below 1, and rendering below CSS
resolution there only blurs. A caller who wants to undersample on purpose (a weak device holding
frame rate) can set `maxDpr` below 1.

## Quality is one type in every adapter

**Decision.** `RenderQuality = { maxDpr, antialias }`, with three tiers: `low` (1, no MSAA),
`medium` (1.5, MSAA), `high` (2, MSAA, the default everywhere). Every adapter takes
`quality?: RenderQuality`. `detectQuality()` returns `low` on a mobile device and `high` elsewhere.
Pixi's `maxResolution` option is replaced by `quality`; `pixelSnap` still forces resolution 1 and
no antialiasing.

**Why.** All three renderers expose exactly these two knobs, and two of the three predecessors
already used this shape (r3f's `quality` prop, Babylon's mobile branch). One vocabulary means a
game's settings screen sets one value for whichever renderer it runs.

**Cost.** Babylon's previous mobile default kept antialiasing on when the device ratio was below 2;
the `low` tier turns it off. Pass `quality: QUALITY_TIERS.medium` (or your own) to keep it.

## Mobile detection is a render-budget heuristic

**Decision.** `isMobileDevice` moves to the core and widens: User-Agent Client Hints
(`navigator.userAgentData.mobile`), the iPhone/iPad/iPod/Android user agent, and iPadOS 13+, which
reports a desktop Safari user agent but has touch points. It takes an optional navigator, so it is
testable and usable outside the global one.

**Why.** It answers "should this device get a smaller GPU budget?", which is what `detectQuality`
and the Babylon engine options need. It is deliberately not a layout classifier; sizing a layout by
form factor (phone, unfolded foldable, tablet) is a different question, answered from viewport
facts by a device-profile library.

## No safe-area reader here

**Decision.** game-mount ships no safe-area inset reader. The Babylon predecessor's
`getSafeAreaInsets` and `resetSafeAreaCache` are removed. Read insets with the `mobile` package
(`readSafeAreaInsets`, or `watchSafeArea` to follow rotation and fold changes).

**Why.** That package measures `env(safe-area-inset-*)` through the same hidden-probe technique,
and it also re-measures on resize, orientation change, visual-viewport resize and fold posture
change, which the removed reader could not do (it cached its first reading until told to reset).
Two readers would be the duplication this package exists to remove. game-mount does not depend on
it either: mounting a renderer does not need insets, and a dependency would make every consumer
install a device library to draw a canvas.

## Neutral names, no aliases

**Decision.** Public names describe what a thing is, not where it came from: `GameCanvas`,
`GameCanvasErrorBoundary`, `GameCanvasHostProps`, `gameCanvasHostStyle`, `GAME_CANVAS_HOST_CLASS`
and the `game-canvas-host` class. No deprecated aliases for the predecessors' names ship.

**Why.** This is a new package at 0.1.0 with no published history under this name, so there is no
installed base to keep compiling. Aliases would carry the old names into the public API for good.
Moving a consumer is a mechanical rename, and every consumer has to change its import path anyway.

## The host contract is renderer-neutral

**Decision.** The parent-sized host contract (style object, class name, `styles.css`) lives in the
core and is exported as `game-mount/styles.css`. `GameCanvas` applies it inline.

**Why.** Nothing in it is specific to react-three-fiber: a container for `mountPixi`, or the
`<div>` around a Reactylon `<Engine>`, needs the same `flex: 1; min-height: 0` chain. A test derives
the stylesheet's declarations from the style object, so the two copies cannot drift.

## The adaptive-resolution ladder is core; its ceiling is the shared cap

**Decision.** `stepPixelRatio` (two slow windows step down by 0.1 to a floor of 0.5, two fast
windows step up) is a pure core function. r3f's `AdaptiveResolution` component drives it and takes
`maxDpr` (its ceiling, through `getDpr`) and `startDpr` (renamed from `startCap`). Steps are
computed in tenths, so repeated steps land exactly on 1.4, not 1.4000000000000001.

**Why.** The ladder is renderer-neutral logic that any frame loop can feed. Its previous ceiling was
the raw device ratio, so on a 3x phone it could climb past the canvas's own `maxDpr` and undo the
quality tier; the ceiling is now the same capped ratio the canvas uses.

## Asset-error classification is core; the boundary is React-neutral

**Decision.** `classifyAssetError` moves to the core and classifies models broadly (`.glb`,
`.gltf`, `.obj`, `.fbx`, `.babylon` are all `"model"`, replacing `"glb"`), and adds `"audio"`.
`GameCanvasErrorBoundary` moves to `game-mount/react`.

**Why.** Every renderer's loaders throw errors that name a URL; none of that is specific to three.
The boundary is a plain React error boundary, useful around a `PixiReactMount` as much as a
`GameCanvas`, so it needs only `react`.

## Phase gating takes one phase or several

**Decision.** `isActivePhase(current, match)` accepts one phase or a list. `GameCanvas` keeps its
boolean `active` prop; Babylon's `SceneRoot` accepts `matchKey` as one key or a list, and keeps one
root across all of them.

**Why.** "Exists only in these phases" is the shared concept; a subtree that spans playing and
paused should not be torn down and rebuilt between them. The root's name, not the array's
identity, keys its lifetime, so an inline array literal does not recreate it every render.

## Havok is its own entry point, and a failed load is not cached

**Decision.** `useHavokPhysics` lives at `game-mount/babylon/havok`. A rejected WASM load clears
the module cache so the next mount retries, unless a newer load has already replaced it.

**Why.** Many Babylon games have no physics; importing `@babylonjs/havok` from `game-mount/babylon`
would force every one of them to install it. Before, a single failed download (offline, wrong base
URL) was cached for the life of the page. The module is listed in `sideEffects` because it
registers Babylon's physics scene component on import.

## `PixiReactMount` rewires only the Application `@pixi/react` still holds

**Decision.** When React reconnects effects (StrictMode, a hidden `<Activity>` shown again), the
component rebinds its resize wiring only if `@pixi/react`'s ref still returns the same Application;
a replaced Application is wired by its own `onInit`. Window targets are detected by
`target.window === target`, not `instanceof Window`.

**Why.** Before, the reconnect path rebound whatever runtime it last had, which after an
`<Activity>` hide/show could be an Application `@pixi/react` had already destroyed; a resize in the
gap before the new `onInit` would call into a dead renderer. `instanceof Window` is false for a
window from another realm (an iframe, a test DOM).

## Build: one module per source file, ESM and CommonJS, no bundler

**Decision.** `tsc` emits `dist/esm` (`.js` + `.d.ts`) and `dist/cjs` (`.cjs` + `.d.cts`) with one
output file per source file; `scripts/build.mjs` renames the CommonJS output and rewrites its
relative specifiers.

**Why.** Bundling each entry point separately would copy shared modules into each bundle, and a
module with state (the Havok cache) must exist once. Separate `.d.cts` declarations keep CommonJS
consumers from reading ESM types ("masquerading as ESM" in arethetypeswrong).

**Notes.** arethetypeswrong runs with the `node16` profile: TypeScript 7 removed `node10`
resolution, so the legacy profile checks a resolver no supported toolchain uses. `styles.css` is
excluded from it because a stylesheet has no types.

## The consumer smoke loads each entry point the way a consumer would

**Decision.** `scripts/consumer-smoke.mjs` packs once and installs the tarball into one scratch
project per entry point, against the public registry with an empty npm configuration, with only
that entry's peers. Each project imports its entry under ESM and requires it under CommonJS and
exercises it. With `GAME_MOUNT_CONSUMER_SOURCE=game-mount@<version>` it installs the published
version instead: the cold-install check after a release.

**Known upstream limits.**

- `@pixi/react` 8.0.5 imports `react-reconciler/constants` without a file extension, which strict
  Node ESM refuses, so `game-mount/pixi/pixi-react` cannot be loaded by plain Node ESM whatever this
  package does. The smoke resolves it under ESM and loads it fully under CommonJS; bundlers, the
  only realistic host for a React canvas component, are unaffected.
- three 0.186 warns that its CommonJS build is deprecated. `@react-three/fiber`'s own CommonJS build
  requires it, so the warning comes with any CommonJS use of `game-mount/r3f`. ESM is the supported
  path for the r3f adapter.

## The real-WebGL gate runs in Vitest browser mode

**Decision.** `tests/browser/pixi-react-mount.test.tsx` mounts a real `@pixi/react` Application on
a real WebGL context in Chromium under StrictMode: one live Application and canvas, a live (not
lost) context, renderer-before-reflow resize ordering, a fresh canvas after unmount and remount.
CI installs Chromium before `pnpm verify`, so a runner without it fails rather than skips.

**Why.** The failure it guards (StrictMode booting a second Application onto a lost context, a
black canvas) only exists with a real context. CI runners have no GPU, so Chromium may use
SwiftShader; the gate asserts a live context, not GPU hardware.

## Coverage is 100% of `src`

Every source module except the re-exporting barrels is held to 100% statements, branches,
functions and lines in the jsdom suite. Renderers that need WebGL are mocked at their boundary
(`pixi.js`, `@pixi/react`, `@react-three/fiber`); Babylon runs for real on its `NullEngine`. The
`@pixi/react` mock has switches for the lifecycles the real library can produce (late init after
unmount, an Application kept across effect reconnects, a canvas with no parent), so every branch is
reached by a scenario rather than excluded.

## History

The repository keeps all three predecessors' commits. Each was cloned fresh, rewritten into
`legacy/<name>/` and sanitised with `git filter-repo`, then merged with
`--allow-unrelated-histories`; the next commit moves every file into the unified tree with
`git mv`, so `git log --follow` reaches each file's origin.

## Toolchain and release

Node.js 22, 24 and 26 are supported with pnpm 12; `engines.node` is `>=22`. Development defaults
to Node 26 (`.nvmrc`, `mise.toml`, `packageManager`), and CI runs all three Node lines on Ubuntu.
The Node 22 floor is verified by the unit suite and packed-consumer smoke; no exact Node patch
version is required. There is no Windows leg: the package is browser code and
touches no paths or processes. TypeScript 7, Biome, Vitest 4. Release Please owns versions and the
changelog, starting from 0.1.0; `.github/workflows/cd.yml` publishes later releases by npm trusted
publishing (OIDC).

## Repository integrity gates

`CI / gate` always runs after every CI job, including all verify matrix legs. It accepts only
`success` or `skipped`; a failed or cancelled job blocks merging. `tests/ci-gate.test.ts` exercises
the workflow's actual shell step and checks that its dependencies cover every other job.

Maintainers can apply the canonical OSS rulesets with `node scripts/apply-branch-ruleset.mjs`.
Its defaults target `jbcom/game-mount` and require `CI / gate`, `title`, `Repository Policy / gate`
and `Dependency Review / gate`. Arguments override the repository name and semicolon-separated
checks. The rules protect main, enforce Conventional Commits on other branches, and protect
release tags. They add no Copilot review or Code Quality rule, since both spend AI credits.
The script is an explicit administrative action, never part of verification or installation.
Its canonical formatting is preserved by a file-specific formatter override; lint still applies.
