/**
 * Phase gating: a renderer, or a part of a scene, exists only while the game is in a phase that
 * shows it. Menus and idle screens should not pay for a live WebGL context, and a scene subtree
 * that belongs to one phase should be disposed, not hidden, when the phase ends.
 *
 * `GameCanvas` takes the result as its `active` prop; Babylon's `SceneRoot` uses it to decide
 * whether its subtree exists. A game keeps one phase value and derives every gate from it.
 */
export function isActivePhase<T extends string | number>(
  current: T,
  match: T | readonly T[]
): boolean {
  return Array.isArray(match) ? match.includes(current) : current === match;
}
