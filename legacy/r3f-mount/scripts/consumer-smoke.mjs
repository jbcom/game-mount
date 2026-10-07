#!/usr/bin/env node
// Built-tarball consumer smoke (fleet package contract): pack the package, install the tarball into a
// clean scratch consumer next to the peers it was tested against, then load the entry point through
// both ESM import and CommonJS require, pin the exact export set, exercise the pure exports and
// resolve the shipped stylesheet. Proves the exports map, the .cjs rewrite and the files list. With
// R3F_MOUNT_CONSUMER_SOURCE=@arcade-cabinet/r3f-mount@<version> it installs that published version
// from the registry instead, with no credential in reach (the release workflow's last step).
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REGISTRY = 'https://registry.npmjs.org/';
const pkgRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const scratch = mkdtempSync(path.join(tmpdir(), 'arcade-r3f-mount-smoke-'));
const registrySource = process.env.R3F_MOUNT_CONSUMER_SOURCE;

// The whole public surface: a removed or renamed export fails here before a consumer finds it.
const EXPORTS = [
  'AdaptiveResolution',
  'CABINET_CANVAS_HOST_CLASS',
  'CabinetCanvas',
  'CabinetCanvasErrorBoundary',
  'cabinetCanvasHostStyle',
  'classifyAssetError',
  'stepPixelRatio',
];

// Run inside the consumer against the stylesheet its own `./styles.css` subpath resolved to: the
// load-bearing rule must sit in the host rule itself, not merely in the explanatory comment above it.
const CSS_CHECK = `const rule = css.replace(/\\/\\*[\\s\\S]*?\\*\\//g, '').match(/\\.cabinet-canvas-host\\s*\\{[^}]*\\}/);
if (!rule || !/min-height:\\s*0\\s*;/.test(rule[0])) throw new Error('styles.css lost the min-height contract');`;

try {
  if (
    registrySource &&
    !/^@arcade-cabinet\/r3f-mount@\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(registrySource)
  ) {
    throw new Error(
      'R3F_MOUNT_CONSUMER_SOURCE must be an exact @arcade-cabinet/r3f-mount@<version> spec',
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
    JSON.stringify({ name: 'r3f-mount-smoke-consumer', private: true, type: 'module' }),
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
      '@react-three/fiber@9',
      'react@19',
      'react-dom@19',
      'three@0.184',
    ],
    { cwd: consumer, stdio: 'inherit', env: anonymousEnv },
  );

  const checks = (mod, label) => `
    const expected = ${JSON.stringify(EXPORTS)};
    const actual = Object.keys(${mod}).filter((name) => name !== 'default' && name !== '__esModule').sort();
    if (JSON.stringify(actual) !== JSON.stringify([...expected].sort())) {
      throw new Error('${label} export set drifted: ' + actual.join(', '));
    }
    if (${mod}.CABINET_CANVAS_HOST_CLASS !== 'cabinet-canvas-host') throw new Error('${label} host class');
    if (${mod}.cabinetCanvasHostStyle.minHeight !== 0) throw new Error('${label} min-height contract');
    for (const name of ['AdaptiveResolution', 'CabinetCanvas', 'classifyAssetError', 'stepPixelRatio']) {
      if (typeof ${mod}[name] !== 'function') throw new Error('${label} ' + name + ' is not a function');
    }
    if (typeof ${mod}.CabinetCanvasErrorBoundary !== 'function') throw new Error('${label} error boundary');
    const stepped = ${mod}.stepPixelRatio({ avgFps: 20, current: 1.5, cap: 1.5, consecutiveLow: 1, consecutiveHigh: 0 });
    if (Math.abs(stepped.next - 1.4) > 1e-9) throw new Error('${label} stepPixelRatio: ' + JSON.stringify(stepped));
    const classified = ${mod}.classifyAssetError(new Error('Could not load /models/boat.glb: 404'));
    if (classified.assetType !== 'glb') throw new Error('${label} classifyAssetError: ' + JSON.stringify(classified));
    console.log('${label} ok');
  `;
  writeFileSync(
    path.join(consumer, 'esm.mjs'),
    `import * as mount from '@arcade-cabinet/r3f-mount';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const css = readFileSync(fileURLToPath(import.meta.resolve('@arcade-cabinet/r3f-mount/styles.css')), 'utf8');
${CSS_CHECK}
${checks('mount', 'esm')}`,
  );
  writeFileSync(
    path.join(consumer, 'cjs.cjs'),
    `const mount = require('@arcade-cabinet/r3f-mount');
const { readFileSync } = require('node:fs');
const css = readFileSync(require.resolve('@arcade-cabinet/r3f-mount/styles.css'), 'utf8');
${CSS_CHECK}
${checks('mount', 'cjs')}`,
  );
  execFileSync(process.execPath, ['esm.mjs'], { cwd: consumer, stdio: 'inherit' });
  execFileSync(process.execPath, ['cjs.cjs'], { cwd: consumer, stdio: 'inherit' });
  console.info(
    `@arcade-cabinet/r3f-mount: consumer smoke passed (ESM + CJS) from ${registrySource ?? 'the packed tarball'}`,
  );
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
