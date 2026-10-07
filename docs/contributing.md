---
title: Contributing
description: Development setup, invariants and verification.
---

Use Node.js 22, 24 or 26 and the pinned pnpm 12 version. Development defaults to Node 26;
CI verifies all three lines. Keep Git hooks enabled.

```sh
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
pnpm verify
pnpm docs:build
```

Verification includes 100% unit coverage, a real-WebGL Chromium test and packed-consumer checks for all eight JavaScript entry points. Do not weaken tests or skip a gate. Keep browser sessions silent.

Keep examples neutral and specific to this package. Preserve optional peers, renderer isolation and the lifecycle contracts in [Architecture](./ARCHITECTURE/). API decisions belong in [Decisions](./decisions/).

Use Conventional Commits. Include behavior and validation evidence in a focused pull request. See the full [contribution guide](https://github.com/jbcom/game-mount/blob/main/CONTRIBUTING.md), [code of conduct](https://github.com/jbcom/game-mount/blob/main/CODE_OF_CONDUCT.md) and [security policy](https://github.com/jbcom/game-mount/security/policy).
