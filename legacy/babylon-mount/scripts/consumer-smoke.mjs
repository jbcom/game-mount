#!/usr/bin/env node
// Built-tarball consumer smoke (fleet package contract): pack the package, install the tarball into a
// clean scratch consumer next to the peers it was tested against, then load the entry point through
// both ESM import and CommonJS require, pin the exact export set and exercise the pure exports.
// Proves the exports map, the .cjs rewrite and the files list. With BABYLON_MOUNT_CONSUMER_SOURCE=
// @arcade-cabinet/babylon-mount@<version> it installs that published version from the registry
// instead, with no credential in reach (the release workflow's last step).
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REGISTRY = 'https://registry.npmjs.org/';
const pkgRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const scratch = mkdtempSync(path.join(tmpdir(), 'arcade-babylon-mount-smoke-'));
const registrySource = process.env.BABYLON_MOUNT_CONSUMER_SOURCE;

// The whole public surface: a removed or renamed export fails here before a consumer finds it.
const EXPORTS = [
  '_resetHavokPhysicsCache',
  'getSafeAreaInsets',
  'isMobileDevice',
  'mobileEngineOptions',
  'mobileHardwareScalingLevel',
  'resetSafeAreaCache',
  'SceneRoot',
  'useBeforeRender',
  'useHavokPhysics',
];

try {
  if (
    registrySource &&
    !/^@arcade-cabinet\/babylon-mount@\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(registrySource)
  ) {
    throw new Error(
      'BABYLON_MOUNT_CONSUMER_SOURCE must be an exact @arcade-cabinet/babylon-mount@<version> spec',
    );
  }
  let source = registrySource;
  if (!source) {
    execFileSync('npm', ['pack', '--pack-destination', scratch], {
      cwd: pkgRoot,
      stdio: 'inherit',
    });
    const tarball = readdirSync(scratch).find((file) => file.endsWith('.tgz'));
    if (!tarball) throw new Error('npm pack produced no tarball');
    source = path.join(scratch, tarball);
  }

  const consumer = path.join(scratch, 'consumer');
  mkdirSync(consumer, { recursive: true });
  writeFileSync(
    path.join(consumer, 'package.json'),
    JSON.stringify({ name: 'babylon-mount-smoke-consumer', private: true, type: 'module' }),
  );
  // Anonymous: a user config with the public registry plus the fleet scope and nothing else, an
  // empty global config, and no inherited npm_config_* or credential-looking variables (pnpm run
  // exports npm_config_* into scripts), so no token on the machine can authenticate this install.
  const userConfig = path.join(scratch, 'anonymous.npmrc');
  const globalConfig = path.join(scratch, 'empty-global.npmrc');
  writeFileSync(
    userConfig,
    `registry=https://registry.npmjs.org/\n@arcade-cabinet:registry=${REGISTRY}\n`,
  );
  writeFileSync(globalConfig, '');
  const anonymousEnv = Object.fromEntries(
    Object.entries(process.env).filter(
      ([key]) => !/^npm_config_/i.test(key) && !/auth|token|secret|password|credential/i.test(key),
    ),
  );
  execFileSync(
    'npm',
    [
      'install',
      '--no-audit',
      '--no-fund',
      '--ignore-scripts',
      '--userconfig',
      userConfig,
      '--globalconfig',
      globalConfig,
      source,
      '@babylonjs/core@9',
      '@babylonjs/havok@1',
      'react@19',
      'reactylon@3',
    ],
    { cwd: consumer, stdio: 'inherit', env: anonymousEnv },
  );

  const checks = (mod, label) => `
    const expected = ${JSON.stringify(EXPORTS)};
    const actual = Object.keys(${mod}).filter((name) => name !== 'default' && name !== '__esModule').sort();
    if (JSON.stringify(actual) !== JSON.stringify([...expected].sort())) {
      throw new Error('${label} export set drifted: ' + actual.join(', '));
    }
    for (const name of expected) {
      if (typeof ${mod}[name] !== 'function') throw new Error('${label} ' + name + ' is not a function');
    }
    if (${mod}.isMobileDevice() !== false) throw new Error('${label} isMobileDevice under Node');
    const options = ${mod}.mobileEngineOptions({ preserveDrawingBuffer: true });
    if (options.preserveDrawingBuffer !== true || options.powerPreference !== 'high-performance') {
      throw new Error('${label} mobileEngineOptions: ' + JSON.stringify(options));
    }
    if (${mod}.mobileHardwareScalingLevel() !== 1) throw new Error('${label} scaling level');
    const insets = ${mod}.getSafeAreaInsets();
    if (JSON.stringify(insets) !== JSON.stringify({ top: 0, right: 0, bottom: 0, left: 0 })) {
      throw new Error('${label} safe-area insets: ' + JSON.stringify(insets));
    }
    console.log('${label} ok');
  `;
  writeFileSync(
    path.join(consumer, 'esm.mjs'),
    `import * as mount from '@arcade-cabinet/babylon-mount';\n${checks('mount', 'esm')}`,
  );
  writeFileSync(
    path.join(consumer, 'cjs.cjs'),
    `const mount = require('@arcade-cabinet/babylon-mount');\n${checks('mount', 'cjs')}`,
  );
  execFileSync(process.execPath, ['esm.mjs'], { cwd: consumer, stdio: 'inherit' });
  execFileSync(process.execPath, ['cjs.cjs'], { cwd: consumer, stdio: 'inherit' });
  console.info(
    `@arcade-cabinet/babylon-mount: consumer smoke passed (ESM + CJS) from ${registrySource ?? 'the packed tarball'}`,
  );
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
