# Decisions

## 2026-10-07: moved out of martian-trail into its own repository

**Decision.** `@arcade-cabinet/babylon-mount` left `martian-trail/packages/babylon-mount` for
`arcade-cabinet/babylon-mount`, with its history (`git filter-repo --subdirectory-filter`).
martian-trail now installs it from the registry like any other consumer.

**Why.** The owner: "You shouldn't need other games as dependencies for shared packages."
Inside the game it could only be released through the game's lockfile, workspace and
release-please, and a second game could not take it without depending on martian-trail.

## The repository shape is the fleet package shape

Same as `arcade-cabinet/mobile` and `input-joystick`: `ci.yml` runs `pnpm verify` on every push
and pull request; `release.yml` runs release-please and a publish job that reconciles the
manifest version against tags and the registry, packs twice for byte identity and proves the
published version anonymously. Tags are plain `v<version>`.

Biome uses the style the source was written in (single quotes, semicolons, trailing commas), so
the move did not reformat it. The only source edits are the import order Biome's
`organizeImports` asks for, and one stale `eslint-disable` comment in `useBeforeRender` that
named a linter this repository does not run (the reason it carried is kept as a plain comment).

## Toolchain: Node 26 and pnpm 12 to build, Node 24 as the floor to run

Built where the fleet is moving. `engines` is `>=24` with no ceiling and `@types/node` is on 24:
a library must not reach for an API its oldest supported consumer lacks. `tsconfig.json` now
names `types: ["node"]` (TypeScript 6 no longer includes every `@types` package on its own),
and the two emit configs name `types: []` so the published declarations never depend on Node
types.

## The consumer smoke pins the public surface

`scripts/consumer-smoke.mjs` packs the package, installs the tarball next to the peers it was
tested against (Babylon core 9, Havok 1, React 19, Reactylon 3), loads it through both ESM
`import` and CommonJS `require`, and fails when the export set drifts from the list it holds.
The CommonJS entry is the check that matters most for this build: `tsc` emits
`require("./x.js")`, the build renames the files to `.cjs` and rewrites those specifiers, and
only a real `require()` from a clean install proves they resolve to the CommonJS files rather
than the ESM ones.

## The manifest starts at the registry's latest, not 0.0.0

0.1.0 was published from the game. `package.json` and `.release-please-manifest.json` both say
0.1.0 and `bootstrap-sha` is the last imported commit, so the first `feat:` here makes
release-please propose the next minor. A 0.0.0 manifest would be read as "never released" and
propose 1.0.0.

## `repository` is new

0.1.0 shipped without a `repository` field. This repository adds it (and `bugs`), so the
registry page for the next version links back here.
