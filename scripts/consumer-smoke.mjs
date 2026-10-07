#!/usr/bin/env node
// Packed-consumer smoke. Packs the package once, then for every entry point builds a scratch
// consumer that installs the tarball plus ONLY that entry point's peers from the public npm
// registry, with no credentials in reach. Each consumer proves three things:
//
//   1. the other renderers are not installed (a consumer of one renderer never needs the others);
//   2. the entry point loads through ESM `import` and CommonJS `require`;
//   3. its exports work, not merely exist.
//
// With GAME_MOUNT_CONSUMER_SOURCE=game-mount@<version> it installs that published version instead
// of the tarball: the cold-install proof after a release.
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const NAME = "game-mount";
const packageRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const manifest = JSON.parse(readFileSync(path.join(packageRoot, "package.json"), "utf8"));
const dev = manifest.devDependencies;
const registrySource = process.env.GAME_MOUNT_CONSUMER_SOURCE;
if (registrySource && !/^game-mount@\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(registrySource)) {
  throw new Error("GAME_MOUNT_CONSUMER_SOURCE must be an exact game-mount@<version> spec");
}
const expectedVersion = registrySource ? registrySource.slice(NAME.length + 1) : manifest.version;

/** Every renderer-side peer. Each scenario lists the ones it may have; the rest must be absent. */
const RENDERER_PEERS = [
  "react",
  "pixi.js",
  "@pixi/react",
  "three",
  "@react-three/fiber",
  "@babylonjs/core",
  "@babylonjs/havok",
  "reactylon",
];

const at = (name) => `${name}@${dev[name]}`;

// Each probe runs twice, with `m` bound by `import * as m` and by `require`. It must throw on any
// failure.
const SCENARIOS = [
  {
    name: "core",
    peers: [],
    entries: [
      {
        specifier: NAME,
        probe: `
          if (m.getDpr(2, 3) !== 2 || m.getDpr(undefined, 0.5) !== 1) throw new Error("getDpr");
          if (m.getDpr() !== 1) throw new Error("getDpr without a window: " + m.getDpr());
          if (JSON.stringify(m.dprRange(1.5)) !== "[1,1.5]") throw new Error("dprRange");
          if (m.detectQuality() !== m.QUALITY_TIERS.high) throw new Error("detectQuality in Node");
          if (m.detectQualityTier({ userAgent: "Android" }) !== "low") throw new Error("tier");
          if (m.detectReduceMotion() !== false) throw new Error("detectReduceMotion in Node");
          if (!m.isActivePhase("paused", ["playing", "paused"])) throw new Error("isActivePhase");
          if (m.stepPixelRatio({ avgFps: 10, current: 1.5, cap: 2, consecutiveLow: 1, consecutiveHigh: 0 }).next !== 1.4) throw new Error("ladder");
          if (m.classifyAssetError(new Error("404 /models/crate.glb")).assetType !== "model") throw new Error("classify");
          if (m.gameCanvasHostStyle.minHeight !== 0 || m.GAME_CANVAS_HOST_CLASS !== "game-canvas-host") throw new Error("host");
        `,
      },
    ],
    extra: `
      const css = require("node:fs").readFileSync(require.resolve("game-mount/styles.css"), "utf8");
      if (!css.includes(".game-canvas-host")) throw new Error("styles.css");
    `,
  },
  {
    name: "react",
    peers: ["react"],
    entries: [
      {
        specifier: `${NAME}/react`,
        probe: `
          const React = await load("react");
          const boundary = new m.GameCanvasErrorBoundary({ onError() {} });
          if (!(boundary instanceof React.Component)) throw new Error("not a React component");
          if (m.GameCanvasErrorBoundary.getDerivedStateFromError().hasError !== true) throw new Error("state");
        `,
      },
    ],
  },
  {
    name: "pixi",
    peers: ["pixi.js"],
    entries: [
      {
        specifier: `${NAME}/pixi`,
        probe: `
          const { Filter } = await load("pixi.js");
          if (typeof m.mountPixi !== "function") throw new Error("mountPixi");
          Filter.defaultOptions.resolution = 1;
          m.applyFilterResolutionFix();
          if (Filter.defaultOptions.resolution !== "inherit") throw new Error("filter fix");
          const options = m.pixiRenderOptions({ maxDpr: 2, antialias: true }, true);
          if (options.resolution !== 1 || options.antialias !== false) throw new Error("render options");
        `,
      },
    ],
  },
  {
    name: "pixi/react",
    peers: ["pixi.js", "react"],
    entries: [
      {
        specifier: `${NAME}/pixi/react`,
        probe: `if (typeof m.usePixiMount !== "function") throw new Error("usePixiMount");`,
      },
    ],
  },
  {
    name: "pixi/pixi-react",
    peers: ["pixi.js", "react", "@pixi/react"],
    entries: [
      {
        specifier: `${NAME}/pixi/pixi-react`,
        // @pixi/react 8.0.5 imports `react-reconciler/constants` without a file extension, which
        // strict Node ESM refuses, so under ESM the entry is resolved rather than loaded. Bundlers
        // (the only host for a React canvas component) are unaffected; CommonJS loads it fully.
        esm: "resolve",
        probe: `if (typeof m.PixiReactMount !== "function") throw new Error("PixiReactMount");`,
      },
    ],
  },
  {
    name: "r3f",
    // react-dom is an optional peer of @react-three/fiber that every web app has.
    peers: ["react", "react-dom", "three", "@react-three/fiber"],
    entries: [
      {
        specifier: `${NAME}/r3f`,
        probe: `
          if (typeof m.GameCanvas !== "function") throw new Error("GameCanvas");
          if (typeof m.AdaptiveResolution !== "function") throw new Error("AdaptiveResolution");
          const { createElement } = await load("react");
          const { renderToStaticMarkup } = await load("react-dom/server");
          const html = renderToStaticMarkup(createElement(m.GameCanvas, { active: false }, null));
          if (html !== "") throw new Error("an inactive GameCanvas rendered " + html);
        `,
      },
    ],
  },
  {
    name: "babylon",
    peers: ["react", "@babylonjs/core", "reactylon"],
    entries: [
      {
        specifier: `${NAME}/babylon`,
        probe: `
          for (const name of ["SceneRoot", "useBeforeRender"]) {
            if (typeof m[name] !== "function") throw new Error(name);
          }
          const options = m.babylonEngineOptions({ navigator: { userAgent: "iPhone" } });
          if (options.limitDeviceRatio !== 1 || options.powerPreference !== "low-power") {
            throw new Error("engine options " + JSON.stringify(options));
          }
          if (m.MAX_FRAME_DELTA !== 0.05) throw new Error("MAX_FRAME_DELTA");
        `,
      },
    ],
  },
  {
    name: "babylon/havok",
    peers: ["react", "@babylonjs/core", "@babylonjs/havok"],
    entries: [
      {
        specifier: `${NAME}/babylon/havok`,
        probe: `
          if (typeof m.useHavokPhysics !== "function") throw new Error("useHavokPhysics");
          m._resetHavokPhysicsCache();
        `,
      },
    ],
  },
];

const scratch = mkdtempSync(path.join(tmpdir(), "game-mount-smoke-"));

// Anonymous: a user config naming the public registry and nothing else, an empty global config,
// and no inherited npm_config_* or credential-looking variables (pnpm run exports npm_config_*).
const userConfig = path.join(scratch, "anonymous.npmrc");
const globalConfig = path.join(scratch, "empty-global.npmrc");
writeFileSync(userConfig, "registry=https://registry.npmjs.org/\n");
writeFileSync(globalConfig, "");
const anonymousEnv = Object.fromEntries(
  Object.entries(process.env).filter(
    ([key]) => !/^npm_config_/i.test(key) && !/auth|token|secret|password|credential/i.test(key)
  )
);

function npm(args, cwd) {
  execFileSync("npm", [...args, "--userconfig", userConfig, "--globalconfig", globalConfig], {
    cwd,
    stdio: ["ignore", "ignore", "inherit"],
    env: anonymousEnv,
  });
}

function node(file, cwd) {
  execFileSync(process.execPath, [file], { cwd, stdio: "inherit", env: anonymousEnv });
}

try {
  let source = registrySource;
  if (!source) {
    npm(["pack", "--pack-destination", scratch, "--ignore-scripts"], packageRoot);
    const tarball = readdirSync(scratch).find((file) => file.endsWith(".tgz"));
    if (!tarball) throw new Error("npm pack produced no tarball");
    source = path.join(scratch, tarball);
  }

  for (const scenario of SCENARIOS) {
    const consumer = path.join(scratch, scenario.name.replace("/", "-"));
    mkdirSync(consumer);
    writeFileSync(
      path.join(consumer, "package.json"),
      JSON.stringify({ name: "smoke-consumer", private: true, type: "module" })
    );
    npm(
      ["install", "--no-audit", "--no-fund", "--ignore-scripts", source, ...scenario.peers.map(at)],
      consumer
    );

    const absent = RENDERER_PEERS.filter((peer) => !scenario.peers.includes(peer));
    const preamble = `
      const pkg = require("game-mount/package.json");
      if (pkg.version !== ${JSON.stringify(expectedVersion)}) throw new Error("version " + pkg.version);
      for (const peer of ${JSON.stringify(absent)}) {
        // A directory check, not require.resolve: some packages do not export ./package.json.
        if (require("node:fs").existsSync(require("node:path").join(process.cwd(), "node_modules", peer))) {
          throw new Error(peer + " is installed in the ${scenario.name} consumer");
        }
      }
      ${scenario.extra ?? ""}
    `;

    // `load` fetches a peer the same way the entry under test did (import under ESM, require under
    // CommonJS), so a probe never compares objects across the two copies of a dual package.
    const esmLines = [
      `import { createRequire } from "node:module";`,
      `const require = createRequire(import.meta.url);`,
      `const load = (name) => import(name);`,
      preamble,
    ];
    const cjsLines = [`const load = async (name) => require(name);`, preamble, `(async () => {`];
    scenario.entries.forEach((entry, index) => {
      const specifier = JSON.stringify(entry.specifier);
      if (entry.esm === "resolve") {
        esmLines.push(
          `if (!import.meta.resolve(${specifier}).includes("/dist/esm/")) throw new Error("esm resolve ${entry.specifier}");`
        );
      } else {
        esmLines.push(`import * as m${index} from ${specifier};`);
        esmLines.push(`{ const m = m${index}; ${entry.probe} }`);
      }
      cjsLines.push(`{ const m = require(${specifier}); ${entry.probe} }`);
    });
    cjsLines.push(`console.log("cjs ok");`);
    cjsLines.push(`})().catch((error) => { console.error(error); process.exit(1); });`);
    // Static imports are hoisted, so their position among the checks does not matter.
    writeFileSync(
      path.join(consumer, "esm.mjs"),
      `${esmLines.join("\n")}\nconsole.log("esm ok");\n`
    );
    writeFileSync(path.join(consumer, "cjs.cjs"), `${cjsLines.join("\n")}\n`);
    process.stdout.write(`${scenario.name}: `);
    node("esm.mjs", consumer);
    process.stdout.write(`${scenario.name}: `);
    node("cjs.cjs", consumer);
  }

  console.info(
    `${NAME}: consumer smoke passed for ${SCENARIOS.length} entry points (ESM + CJS), each with only its own peers, from ${registrySource ?? "the packed tarball"}`
  );
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
