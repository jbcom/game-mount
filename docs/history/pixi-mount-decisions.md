# Decisions

## 2026-10-07: moved out of on-the-ropes into its own repository

**Decision.** `@arcade-cabinet/pixi-mount` left `on-the-ropes/packages/pixi-mount` for
`arcade-cabinet/pixi-mount`, with its history (`git filter-repo --subdirectory-filter`).
on-the-ropes now installs it from the registry like any other consumer.

**Why.** The owner: "You shouldn't need other games as dependencies for shared packages."
bioluminescent-sea, stacken-ze-quacks and virtual-pet all consume it from the registry, yet it
could only be released through on-the-ropes' workspace and lockfile.

## The repository shape is the fleet package shape

Same as `arcade-cabinet/mobile`, `input-joystick` and `persistence-save`: `ci.yml` runs
`pnpm verify` on every push and pull request; `release.yml` runs release-please and a publish
job that reconciles the manifest version against tags and the registry, packs twice for byte
identity and proves the published version anonymously. Tags are plain `v<version>`.

Biome uses the style the source was written in (single quotes, semicolons, trailing commas on
every multi-line list, parenthesised arrow parameters), so the move did not reformat it beyond
what Biome 2.5's import ordering required.

## Toolchain: Node 26 and pnpm 12 to build, Node 24 as the floor to run

Built where the fleet is moving. `engines` is `>=24` with no ceiling and `@types/node` stays on
24: a library must not reach for an API its oldest supported consumer lacks. The source built on
TypeScript 6; here it builds on TypeScript 7, which removed `moduleResolution: node10`, so the
CommonJS pass resolves with `bundler` like the other fleet packages. The emitted layout
(`dist/esm`, `dist/cjs/*.cjs`, `dist/types`) and the `exports` map are unchanged. Dev dependencies
are exact, including `pixi.js` and `@pixi/react`, so the package is tested against a known Pixi;
the peer ranges are the ones the registry's 0.2.0 declared.

## The real-GPU gate moved from the host's Playwright suite into Vitest browser mode

In on-the-ropes the `@pixi/react` StrictMode gate was a Playwright spec that opened an HTML
fixture through the game's dev server and asserted a hardware GPU through the game's test
harness. A package repository has no game server and no GPU runner, so the same assertions run as
a Vitest browser-mode test (`tests/browser/pixi-react-mount.test.tsx`) in Chromium: one live
Application and canvas under StrictMode, a live (not lost) WebGL context, the renderer-before-reflow
resize ordering, and a fresh canvas after unmount and remount. It asserts a live context rather
than hardware, and launches Chromium with SwiftShader allowed so a GPU-less runner can run it.
CI and the release job's verify-at-tag step install Chromium before `pnpm verify`, so a runner
without it fails the gate instead of skipping it.

## The consumer smoke resolves `./pixi-react` under ESM instead of importing it

`@pixi/react` 8.0.5 imports `react-reconciler/constants` without a file extension, which strict
Node ESM refuses, so `import '@arcade-cabinet/pixi-mount/pixi-react'` cannot load in plain Node
whatever this package does; bundlers (the only supported host for a React canvas component) are
unaffected. The smoke `require`s it and exercises it, and under ESM it asserts the export
resolves to the right file. It also loads `.` and `./react` both ways and exercises
`getDpr`, `detectReduceMotion` and `applyFilterResolutionFix`.

## No `prepublishOnly`

Publishing is the release workflow's reconcile job, which verifies at the tag and publishes
the already-packed tarball (lifecycle scripts do not run for a tarball). `prepack` still builds,
so a bare `npm pack` can never ship a stale or missing `dist`.

## Versioning continues from the registry

0.2.0 was published from the game repository. The manifest starts at 0.2.0 with
`bootstrap-sha` on the last imported commit, so release-please computes the next version from
this repository's own commits; the `feat:` commit that created this repository proposes 0.3.0.
