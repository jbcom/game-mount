#!/usr/bin/env node
// Built-tarball consumer smoke (fleet package contract): pack the package, install the tarball into a
// clean scratch consumer next to the pixi.js, React and @pixi/react it was tested against, then load the
// entry points (`.`, `./react`, `./pixi-react`) through CommonJS require and, where Node can, ESM import,
// and exercise them. Proves the exports map, the .cjs bundle, the types layout and the files list. With
// PIXI_MOUNT_CONSUMER_SOURCE=@arcade-cabinet/pixi-mount@<version> it installs that published version from
// the registry instead, with no credential in reach (the release workflow's last step).
//
// `./pixi-react` is checked by require, and by resolution only under ESM: @pixi/react 8.0.5 imports
// `react-reconciler/constants` without an extension, which strict Node ESM refuses. It is meant for a
// bundler, so Node ESM can load it only after upstream fixes that; resolving its export still proves ours.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REGISTRY = 'https://registry.npmjs.org/';
const NAME = '@arcade-cabinet/pixi-mount';
const packageRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const manifest = JSON.parse(readFileSync(path.join(packageRoot, 'package.json'), 'utf8'));
const scratch = mkdtempSync(path.join(tmpdir(), 'arcade-pixi-mount-smoke-'));
const registrySource = process.env.PIXI_MOUNT_CONSUMER_SOURCE;

try {
  if (
    registrySource &&
    !/^@arcade-cabinet\/pixi-mount@\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(registrySource)
  ) {
    throw new Error(`PIXI_MOUNT_CONSUMER_SOURCE must be an exact ${NAME}@<version> spec`);
  }
  const expectedVersion = registrySource ? registrySource.slice(NAME.length + 1) : manifest.version;
  let source = registrySource;
  if (!source) {
    execFileSync('npm', ['pack', '--pack-destination', scratch], {
      cwd: packageRoot,
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
    JSON.stringify({ name: 'pixi-mount-smoke-consumer', private: true, type: 'module' }),
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
  const dev = manifest.devDependencies;
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
      `pixi.js@${dev['pixi.js']}`,
      `@pixi/react@${dev['@pixi/react']}`,
      `react@${dev.react}`,
      `react-dom@${dev['react-dom']}`,
    ],
    { cwd: consumer, stdio: 'inherit', env: anonymousEnv },
  );

  const assertion = `
    if (pkg.version !== ${JSON.stringify(expectedVersion)}) throw new Error('version ' + pkg.version)
    for (const name of ['applyFilterResolutionFix', 'detectReduceMotion', 'getDpr', 'mountPixi']) {
      if (typeof api[name] !== 'function') throw new Error('missing export ' + name)
    }
    if (typeof hook.usePixiMount !== 'function') throw new Error('missing export usePixiMount')

    // Node has no devicePixelRatio or matchMedia: the helpers must degrade, not throw.
    if (api.getDpr(2) !== 1) throw new Error('getDpr without a window: ' + api.getDpr(2))
    if (api.detectReduceMotion() !== false) throw new Error('detectReduceMotion without matchMedia')
    globalThis.devicePixelRatio = 3
    if (api.getDpr() !== 2) throw new Error('getDpr default cap: ' + api.getDpr())
    if (api.getDpr(1.5) !== 1.5) throw new Error('getDpr explicit cap: ' + api.getDpr(1.5))
    delete globalThis.devicePixelRatio

    pixi.Filter.defaultOptions.resolution = 1
    api.applyFilterResolutionFix()
    if (pixi.Filter.defaultOptions.resolution !== 'inherit') {
      throw new Error('applyFilterResolutionFix did not set the filter resolution')
    }
  `;
  const esm = `
    import * as api from ${JSON.stringify(NAME)}
    import * as hook from ${JSON.stringify(`${NAME}/react`)}
    import * as pixi from 'pixi.js'
    import pkg from ${JSON.stringify(`${NAME}/package.json`)} with { type: 'json' }
    ${assertion}
    const adapter = import.meta.resolve(${JSON.stringify(`${NAME}/pixi-react`)})
    if (!adapter.endsWith('/dist/esm/pixi-react.js')) throw new Error('pixi-react resolves to ' + adapter)
    console.log('esm ok')
  `;
  const cjs = `
    const api = require(${JSON.stringify(NAME)})
    const hook = require(${JSON.stringify(`${NAME}/react`)})
    const adapter = require(${JSON.stringify(`${NAME}/pixi-react`)})
    const pixi = require('pixi.js')
    const pkg = require(${JSON.stringify(`${NAME}/package.json`)})
    ${assertion}
    if (typeof adapter.PixiReactMount !== 'function') throw new Error('missing export PixiReactMount')
    console.log('cjs ok')
  `;
  writeFileSync(path.join(consumer, 'esm.mjs'), esm);
  writeFileSync(path.join(consumer, 'cjs.cjs'), cjs);
  execFileSync(process.execPath, ['esm.mjs'], { cwd: consumer, stdio: 'inherit' });
  execFileSync(process.execPath, ['cjs.cjs'], { cwd: consumer, stdio: 'inherit' });
  console.info(
    `${NAME}: consumer smoke passed (ESM + CJS) from ${registrySource ?? 'the packed tarball'}`,
  );
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
