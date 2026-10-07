/**
 * The host contract ships twice, as an inline style object and as styles.css. This pins both and
 * derives the expected stylesheet declarations from the object, so neither can drift from the
 * other or lose `min-height: 0`.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { GAME_CANVAS_HOST_CLASS, gameCanvasHostStyle } from "../../src/index.js";

const css = readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), "../../src/styles.css"),
  "utf8"
);

function declarations(selector: string): Map<string, string> {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const body = css.match(new RegExp(`(?:^|\\n)${escaped}\\s*\\{([^}]*)\\}`))?.[1];
  if (body === undefined) throw new Error(`styles.css has no rule for ${selector}`);
  return new Map(
    body
      .split(";")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [property = "", ...value] = line.split(":");
        return [property.trim(), value.join(":").trim()] as const;
      })
  );
}

function kebab(property: string): string {
  return property.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

describe("game-canvas-host contract", () => {
  it("the inline style carries the full parent-fill contract", () => {
    expect(gameCanvasHostStyle).toEqual({
      position: "relative",
      flex: 1,
      display: "flex",
      width: "100%",
      height: "100%",
      minHeight: 0,
    });
    expect(Object.isFrozen(gameCanvasHostStyle)).toBe(true);
  });

  it("the stylesheet's host rule declares exactly the inline style", () => {
    const expected = new Map(
      Object.entries(gameCanvasHostStyle).map(([property, value]) => [
        kebab(property),
        String(value),
      ])
    );
    expect(declarations(`.${GAME_CANVAS_HOST_CLASS}`)).toEqual(expected);
  });

  it("the stylesheet styles the child canvas as a full-bleed block", () => {
    expect(declarations(`.${GAME_CANVAS_HOST_CLASS} canvas`)).toEqual(
      new Map([
        ["width", "100%"],
        ["height", "100%"],
        ["display", "block"],
      ])
    );
  });

  it("the class name is the neutral one the stylesheet targets", () => {
    expect(GAME_CANVAS_HOST_CLASS).toBe("game-canvas-host");
  });
});
