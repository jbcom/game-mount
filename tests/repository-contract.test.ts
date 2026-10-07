/**
 * Repository contract: the promises the package makes about its shape, checked against the source
 * tree rather than a build.
 *
 * - Peer isolation. Each entry point's runtime import graph reaches only the peers that entry
 *   declares, so a consumer of one renderer never needs another installed. (The packed-consumer
 *   smoke proves the same thing by installation; this pins it at the source, where a stray import
 *   is introduced.)
 * - Every exported subpath maps to a source module, and every peer is optional.
 * - CI installs Chromium before `pnpm verify`, so the WebGL gate fails rather than skips without it.
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")) as {
  engines: { node: string };
  exports: Record<string, unknown>;
  peerDependencies: Record<string, string>;
  peerDependenciesMeta: Record<string, { optional?: boolean }>;
};

/** The peers each entry point may reach at runtime. This is the public contract. */
const ENTRY_PEERS: Record<string, readonly string[]> = {
  ".": [],
  "./react": ["react"],
  "./pixi": ["pixi.js"],
  "./pixi/react": ["pixi.js", "react"],
  "./pixi/pixi-react": ["pixi.js", "react", "@pixi/react"],
  "./r3f": ["react", "three", "@react-three/fiber"],
  "./babylon": ["react", "@babylonjs/core", "reactylon"],
  "./babylon/havok": ["react", "@babylonjs/core", "@babylonjs/havok"],
};

function sourceOf(subpath: string): string {
  const base = subpath === "." ? "index" : subpath.slice(2);
  for (const candidate of [`${base}.ts`, `${base}.tsx`, `${base}/index.ts`]) {
    const file = path.join(root, "src", candidate);
    if (existsSync(file)) return file;
  }
  throw new Error(`no source module for export ${subpath}`);
}

function packageName(specifier: string): string {
  const parts = specifier.split("/");
  return specifier.startsWith("@") ? parts.slice(0, 2).join("/") : (parts[0] as string);
}

const IMPORT = /(?:^|\n)\s*(import|export)\s+(type\s+)?(?:([^'";]*?)\s+from\s+)?["']([^"']+)["']/g;

/** Runtime (not type-only) bare package imports reachable from a module, following relative ones. */
function runtimePeers(entry: string): Set<string> {
  const seen = new Set<string>();
  const peers = new Set<string>();
  const visit = (file: string): void => {
    if (seen.has(file)) return;
    seen.add(file);
    const source = readFileSync(file, "utf8");
    // The react-jsx transform imports react/jsx-runtime from every .tsx module.
    if (file.endsWith(".tsx")) peers.add("react");
    for (const match of source.matchAll(IMPORT)) {
      const [, , typeOnly, clause, specifier] = match as unknown as [
        string,
        string,
        string | undefined,
        string | undefined,
        string,
      ];
      const allTypes =
        typeOnly !== undefined ||
        (clause !== undefined &&
          /^\{[^}]*\}$/.test(clause.trim()) &&
          clause
            .trim()
            .slice(1, -1)
            .split(",")
            .map((name) => name.trim())
            .filter(Boolean)
            .every((name) => name.startsWith("type ")));
      if (allTypes) continue;
      if (specifier.startsWith(".")) {
        const resolved = path.resolve(path.dirname(file), specifier).replace(/\.js$/, "");
        visit(existsSync(`${resolved}.ts`) ? `${resolved}.ts` : `${resolved}.tsx`);
      } else {
        peers.add(packageName(specifier));
      }
    }
  };
  visit(entry);
  return peers;
}

describe("exports", () => {
  it("lists exactly the entry points of the contract, plus the stylesheet and manifest", () => {
    expect(Object.keys(manifest.exports).sort()).toEqual(
      [...Object.keys(ENTRY_PEERS), "./styles.css", "./package.json"].sort()
    );
  });

  it("every peer is optional", () => {
    for (const peer of Object.keys(manifest.peerDependencies)) {
      expect(manifest.peerDependenciesMeta[peer]?.optional, peer).toBe(true);
    }
  });
});

describe("peer isolation", () => {
  for (const [subpath, allowed] of Object.entries(ENTRY_PEERS)) {
    it(`${subpath} reaches only ${allowed.length ? allowed.join(", ") : "no peers"}`, () => {
      // A subset, not equality: an entry may need a peer only through another (the @pixi/react
      // component touches pixi.js through @pixi/react), but it may never reach outside its list.
      const reached = [...runtimePeers(sourceOf(subpath))].sort();
      expect(reached.filter((peer) => !allowed.includes(peer))).toEqual([]);
      for (const peer of reached) expect(manifest.peerDependencies).toHaveProperty(peer);
    });
  }
});

describe("CI", () => {
  it("supports and verifies every maintained Node line without patch pins", () => {
    expect(manifest.engines.node).toBe(">=22");
    const text = readFileSync(path.join(root, ".github/workflows/ci.yml"), "utf8");
    expect([...text.matchAll(/^ {12}node: "([^"]+)"$/gm)].map((match) => match[1])).toEqual([
      "22",
      "24",
      "26",
    ]);
    expect(readFileSync(path.join(root, ".nvmrc"), "utf8").trim()).toBe("26");
  });

  it("installs Chromium before every pnpm verify", () => {
    for (const workflow of ["ci.yml", "cd.yml"]) {
      const text = readFileSync(path.join(root, ".github/workflows", workflow), "utf8");
      const install = text.indexOf("playwright install --with-deps chromium");
      const verify = text.indexOf("pnpm verify");
      expect(install, workflow).toBeGreaterThan(-1);
      expect(install, workflow).toBeLessThan(verify);
    }
  });
});
