/**
 * The parent-sized host contract: the element a canvas mounts into fills its parent, and the
 * renderer sizes itself from that element's box (a ResizeObserver), never from the window.
 *
 * A layout chain that satisfies it:
 *
 *   html, body { height: 100% }
 *     → #root { position: fixed; inset: 0; display: flex; flex-direction: column }
 *       → .screen { flex: 1 }
 *         → .game-canvas-host { flex: 1; width: 100%; height: 100%; min-height: 0 }
 *
 * `min-height: 0` is the rule people miss: a flex item's default `min-height: auto` lets a
 * `height: 100%` child refuse to shrink below its content, so docking a HUD panel beside or below
 * the canvas silently overflows. `display: flex` makes a renderer's own 100%-sized wrapper resolve
 * against a real box. Nothing here reads `vh`, `vw` or `window.innerWidth`.
 *
 * The contract ships twice and the two are kept identical by a test: as this inline style object
 * (no stylesheet import needed) and as `game-mount/styles.css`, which also styles the child canvas.
 */

/** The inline style of the host contract. Structurally a React `CSSProperties`. */
export interface GameCanvasHostStyle {
  readonly position: "relative";
  readonly flex: number;
  readonly display: "flex";
  readonly width: "100%";
  readonly height: "100%";
  readonly minHeight: number;
}

export const gameCanvasHostStyle: GameCanvasHostStyle = Object.freeze({
  position: "relative",
  flex: 1,
  display: "flex",
  width: "100%",
  height: "100%",
  minHeight: 0,
});

/** The class `styles.css` targets; `GameCanvas` puts it on its host element. */
export const GAME_CANVAS_HOST_CLASS = "game-canvas-host";
