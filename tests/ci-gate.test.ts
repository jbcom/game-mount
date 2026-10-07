import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), "../.github/workflows/ci.yml"),
  "utf8"
);
const gate = workflow.split("\n  gate:\n")[1] ?? "";
const results = ["VERIFY_RESULT", "DOCS_RESULT", "SONARCLOUD_RESULT", "PRE_COMMIT_RESULT"];
const shell = gate.split("        run: |\n")[1]?.replace(/^ {10}/gm, "") ?? "exit 1";

describe("CI aggregate gate", () => {
  it("always runs and depends on every other CI job", () => {
    const jobs = [...(workflow.split("\njobs:\n")[1] ?? "").matchAll(/^ {2}([\w-]+):$/gm)]
      .map((match) => match[1])
      .filter((job) => job !== "gate");
    const needs = gate
      .match(/needs: \[([^\]]+)\]/)?.[1]
      ?.split(",")
      .map((job) => job.trim());
    expect(needs?.sort()).toEqual(jobs.sort());
    expect(gate).toContain("    if: always()\n");
  });

  it.each(["success", "skipped"])("accepts %s results", (result) => {
    const env = Object.fromEntries(results.map((name) => [name, result]));
    expect(spawnSync("sh", ["-c", shell], { env }).status).toBe(0);
  });

  for (const name of results) {
    it.each(["failure", "cancelled", ""])(`rejects ${name} = %s`, (result) => {
      const env = Object.fromEntries(results.map((key) => [key, "success"]));
      env[name] = result;
      expect(spawnSync("sh", ["-c", shell], { env }).status).not.toBe(0);
    });
  }
});
