# Decisions

## 2026-10-07: moved out of welcoming-wilds-island-adventure into its own repository

**Decision.** `@arcade-cabinet/r3f-mount` left
`welcoming-wilds-island-adventure/packages/r3f-mount` for `arcade-cabinet/r3f-mount`, with its
history (`git filter-repo --subdirectory-filter`). welcoming-wilds-island-adventure now installs
it from the registry like any other consumer.

**Why.** The owner: "You shouldn't need other games as dependencies for shared packages."
Six other games (otterly-chaotic, syntheteria, shadow-and-gold, grave-shift, rolling-thunder,
the-ants-go-marching) already install it from the registry; inside the island game it could only
be released through that game's lockfile, workspace and release-please, and every consumer was
depending on a game for its canvas mount.

## The repository shape is the fleet package shape

Same as `arcade-cabinet/mobile` and `input-joystick`: `ci.yml` runs `pnpm verify` on every push
and pull request; `release.yml` runs release-please and a publish job that reconciles the
manifest version against tags and the registry, packs twice for byte identity and proves the
published version anonymously. Tags are plain `v<version>`.

Biome uses the style the source was written in (single quotes, semicolons, trailing commas), so
the move did not reformat it; the source already had Biome's import order.

## Toolchain: Node 26 and pnpm 12 to build, Node 24 as the floor to run

Built where the fleet is moving. `engines` is `>=24` with no ceiling and `@types/node` moved from
25 to 24: a library must not reach for an API its oldest supported consumer lacks. The emit
configs name `types: []` so the published declarations never depend on Node types.

## The consumer smoke pins the public surface

`scripts/consumer-smoke.mjs` packs the package, installs the tarball next to the peers it was
tested against (react-three-fiber 9, React 19, three 0.184), loads it through both ESM `import`
and CommonJS `require`, and fails when the export set drifts from the list it holds. It also
resolves the `./styles.css` subpath export and checks the `min-height: 0` rule survived, since
that rule is the reason the package exists. The CommonJS entry is the check that matters most for
this build: `tsc` emits `require("./x.js")`, the build renames the files to `.cjs` and rewrites
those specifiers, and only a real `require()` from a clean install proves they resolve to the
CommonJS files rather than the ESM ones.

## The manifest starts at the registry's latest, not 0.0.0

0.1.0 was published from the game. `package.json` and `.release-please-manifest.json` both say
0.1.0 and `bootstrap-sha` is the last imported commit, so the first `feat:` here makes
release-please propose the next minor. A 0.0.0 manifest would be read as "never released" and
propose 1.0.0.

## `repository` is new

0.1.0 shipped without a `repository` field. This repository adds it (and `bugs`), so the
registry page for the next version links back here.
