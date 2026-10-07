# Working on game-mount

Read `docs/decisions.md` and `docs/ARCHITECTURE.md` before changing an adapter. Preserve the renderer-neutral core and the isolated entry points. All peers remain optional.

## Verification

- Use Node 26 and pinned pnpm 12. Install with `pnpm install --frozen-lockfile`.
- Run `pnpm verify` and `pnpm docs:build` for release readiness.
- Keep hooks enabled and use Conventional Commits.
- Preserve 100% source coverage. Never skip or weaken tests.
- Prove new gates fail on an injected defect, then restore the original file byte-identical.
- Browser testing must be silent. A test mute must not overwrite saved player preferences.

## Boundaries

Examples, fixtures and docs use neutral names written for this package. Do not introduce game-specific content, local paths, private infrastructure or credentials. Do not put migration maps here.

The core imports no peers. Each adapter imports only its own renderer and shared policy. Do not add a second resize pipeline or reuse a destroyed Pixi canvas. Preserve the Havok entry point's side-effect declaration and retry-on-failure cache behavior.

`attw` uses `--profile node16 --exclude-entrypoints ./styles.css`. The @pixi/react Node ESM smoke is resolve-only because of an upstream import issue; the real browser test must still pass.

Release Please owns versioning. Do not create tags, releases or publish without explicit maintainer authorization.
