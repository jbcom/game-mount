#!/usr/bin/env node
// Dual-format build without a bundler: tsc emits ESM (+ .d.ts) and CommonJS (+ .d.cts) from two
// tsconfigs, one file per source module, so every subpath export maps to its own module and an
// adapter never pulls another renderer's code in.
//
// The CommonJS pass emits its OWN declarations rather than reusing the ESM ones. Pointing a
// "require" condition at a .d.ts inside a "type": "module" package makes TypeScript read those
// types as ESM while the runtime file is CommonJS ("Masquerading as ESM" in arethetypeswrong).
import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const pkgRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const require = createRequire(import.meta.url);
// TypeScript 7 exports no `bin/tsc` subpath; locate the bin from its manifest instead.
const tscBin = path.join(
  path.dirname(require.resolve("typescript/package.json")),
  require("typescript/package.json").bin.tsc
);

function run(args) {
  // Run TypeScript through the active Node executable, not the platform-specific .bin shim.
  execFileSync(process.execPath, [tscBin, ...args], { cwd: pkgRoot, stdio: "inherit" });
}

function walk(dir, visit) {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full, visit);
      continue;
    }
    visit(full, entry);
  }
}

// Longest suffix first, or a shorter one claims a file the longer one owns.
const CJS_RENAMES = [
  [".d.ts.map", ".d.cts.map"],
  [".d.ts", ".d.cts"],
  [".js.map", ".cjs.map"],
  [".js", ".cjs"],
];

function renameForCjs(dir) {
  walk(dir, (full, entry) => {
    for (const [from, to] of CJS_RENAMES) {
      if (entry.endsWith(from)) {
        renameSync(full, full.slice(0, -from.length) + to);
        return;
      }
    }
  });
}

// tsc writes `require("./x.js")`, `from "./x.js"` and `sourceMappingURL=x.js.map` whatever the
// emitted file names are; point each at the .cjs / .d.cts names the files now have.
function fixCjsSpecifiers(dir) {
  walk(dir, (full, entry) => {
    if (entry.endsWith(".d.cts")) {
      const src = readFileSync(full, "utf8");
      const fixed = src
        .replace(/(from\s*|import\s*\()(["'])(\.[^"']+)\.js\2/g, "$1$2$3.cjs$2")
        .replace(/(\/\/#\s*sourceMappingURL=)(\S+)\.d\.ts\.map/g, "$1$2.d.cts.map");
      if (fixed !== src) writeFileSync(full, fixed);
      return;
    }
    if (entry.endsWith(".cjs")) {
      const src = readFileSync(full, "utf8");
      const fixed = src
        .replace(/require\((["'])(\.[^"']+)\.js\1\)/g, "require($1$2.cjs$1)")
        .replace(/(\/\/#\s*sourceMappingURL=)(\S+)\.js\.map/g, "$1$2.cjs.map");
      if (fixed !== src) writeFileSync(full, fixed);
    }
  });
}

rmSync(path.join(pkgRoot, "dist"), { recursive: true, force: true });

run(["-p", "tsconfig.esm.json"]);
run(["-p", "tsconfig.cjs.json"]);

const cjsDir = path.join(pkgRoot, "dist", "cjs");
renameForCjs(cjsDir);
fixCjsSpecifiers(cjsDir);

// A "type": "module" package makes Node read a bare .js under dist/cjs as ESM; this manifest makes
// the whole directory CommonJS.
writeFileSync(
  path.join(cjsDir, "package.json"),
  `${JSON.stringify({ type: "commonjs" }, null, 2)}\n`
);

copyFileSync(path.join(pkgRoot, "src", "styles.css"), path.join(pkgRoot, "dist", "styles.css"));

console.log(
  "game-mount: built dist/esm (ESM + .d.ts), dist/cjs (CommonJS + .d.cts), dist/styles.css"
);
