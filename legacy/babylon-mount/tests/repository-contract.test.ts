// @vitest-environment node
// The package's own repository is its only home: these assertions keep the manifest, the toolchain
// and the publish path pointing at it, so a copy-paste from a host repo cannot drift back in.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = path.resolve(import.meta.dirname, '..');
const read = (file: string) => readFileSync(path.join(root, file), 'utf8');
const manifest = JSON.parse(read('package.json')) as {
  version: string;
  repository: { type: string; url: string; directory?: string };
  bugs: { url: string };
  packageManager: string;
  engines: Record<string, string>;
  scripts: Record<string, string>;
  devDependencies: Record<string, string>;
};

describe('repository contract', () => {
  it('points at arcade-cabinet/babylon-mount and builds on the fleet toolchain', () => {
    expect(manifest.repository).toEqual({
      type: 'git',
      url: 'https://github.com/jbcom/babylon-mount.git',
    });
    expect(manifest.bugs.url).toBe(
      'https://github.com/jbcom/babylon-mount/issues',
    );
    expect(read('.node-version').trim()).toBe('26');
    expect(manifest.packageManager).toMatch(/^pnpm@12\.\d+\.\d+$/);
    expect(manifest.engines).toEqual({ node: '>=24' });
    expect(manifest.devDependencies['@types/node']).toMatch(/^\^?24\./);
  });

  it('carries no workspace wiring or host-repo paths', () => {
    const sources = [
      'package.json',
      'tsconfig.json',
      'tsconfig.esm.json',
      'tsconfig.cjs.json',
      'vitest.config.ts',
      'scripts/build.mjs',
      'scripts/consumer-smoke.mjs',
    ];
    for (const file of sources) {
      expect(read(file), file).not.toMatch(/workspace:|\.\.\/\.\./);
    }
  });

  it('verifies everything in CI, including the packed consumer', () => {
    expect(manifest.scripts.verify).toBe(
      'pnpm run lint && pnpm run typecheck && pnpm run test && pnpm run build && pnpm run smoke:consumer',
    );
    expect(read('.gitea/workflows/ci.yml')).toContain('run: pnpm verify');
  });

  it('publishes byte-identical packs with the package-only secret and proves them anonymously', () => {
    const release = read('.gitea/workflows/release.yml');
    expect(release).toContain('PACKAGE: "@arcade-cabinet/babylon-mount"');
    // Without these labels release-please cannot find a merged release PR, so it never tags: the
    // bootstrap must run, and run first.
    expect(release).toMatch(
      /run: node scripts\/ensure-release-labels\.mjs[\s\S]+?joaquinjsb\/gitea-release-please-action/,
    );
    const labels = read('scripts/ensure-release-labels.mjs');
    expect(labels).toContain("name: 'autorelease: pending'");
    expect(labels).toContain("name: 'autorelease: tagged'");
    expect(release).toMatch(/git checkout --detach "refs\/tags\/[^"]+"[\s\S]+?pnpm verify/);
    expect(release).toMatch(/cmp "\$\{RUNNER_TEMP\}"\/a\/\*\.tgz "\$\{RUNNER_TEMP\}"\/b\/\*\.tgz/);
    expect(release).toContain('secrets.NPM_TOKEN');
    expect(release).toMatch(
      /BABYLON_MOUNT_CONSUMER_SOURCE="\$\{PACKAGE\}@\$\{\{ steps\.target\.outputs\.version \}\}" pnpm smoke:consumer/,
    );
  });

  it("keeps release-please bootstrapped on this repository's own history", () => {
    const config = JSON.parse(read('release-please-config.json')) as {
      'bootstrap-sha': string;
      packages: Record<string, { 'package-name': string }>;
    };
    expect(config['bootstrap-sha']).toMatch(/^[0-9a-f]{40}$/);
    expect(config.packages['.']?.['package-name']).toBe('babylon-mount');
    // The manifest is the registry's latest, never 0.0.0 (which release-please reads as a 1.0.0).
    expect(JSON.parse(read('.release-please-manifest.json'))).toEqual({ '.': manifest.version });
  });
});
