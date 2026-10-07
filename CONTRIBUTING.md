# Contributing

Discuss API or lifecycle changes in a [GitHub issue](https://github.com/jbcom/game-mount/issues) before implementation. Include a minimal reproduction for bugs, the renderer versions and the expected behavior.

## Development

Use Node 26 and the pnpm version pinned in `package.json`.

```sh
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
pnpm verify
pnpm docs:build
```

`pnpm verify` runs Biome, Markdown lint, TypeScript, unit coverage, the real-WebGL Chromium test, build, package validation and packed-consumer smoke tests. Source coverage must stay at 100% for statements, branches, functions and lines. Never skip or weaken a failing test.

## Changes

Keep the core renderer-neutral and each adapter's runtime import graph limited to its own peers. Keep peers optional and retain both ESM and CommonJS declarations. Consult [architecture](docs/ARCHITECTURE.md) and [decisions](docs/decisions.md) for lifecycle invariants.

Write new examples for this package using neutral names such as `GameCanvas`, `Player One` and `com.example.game`. Keep project-specific content out of documentation and fixtures. Browser tests must stay silent; any runtime mute must not change saved audio preferences.

Use Conventional Commits and keep Git hooks enabled. Submit a focused pull request with the behavior changed and the checks run. Add regression coverage for behavioral changes and prove that a new gate catches the defect it guards.

## Releases

Release Please manages versions and the changelog. The CD workflow handles subsequent npm releases through trusted publishing. Contributors should not create release tags or publish packages. Follow the [code of conduct](CODE_OF_CONDUCT.md) in all project spaces.
