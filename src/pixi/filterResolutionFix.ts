import { Filter } from "pixi.js";

/**
 * Make every Pixi filter created from now on inherit the renderer's resolution instead of
 * defaulting to 1. Without it, a filter at resolution 1 on a 2x canvas renders to a half-size
 * texture and composites into the upper-left quadrant (pixijs/pixijs#11467; `'inherit'` is the
 * upstream-recommended setting).
 *
 * Call it once, from code that is guaranteed to run (for example right before the first
 * `mountPixi`). It is a function rather than an import side effect because bundlers may drop a
 * module-scope assignment to an imported object during tree shaking.
 */
export function applyFilterResolutionFix(): void {
  Filter.defaultOptions.resolution = "inherit";
}
