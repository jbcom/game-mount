/**
 * True when the environment reports `prefers-reduced-motion: reduce`. False where there is no
 * `matchMedia` (Node, workers) or the query throws.
 *
 * Adapters read this once per mount and hand it back on their handle; what "reduced" means for a
 * scene (no screen shake, no parallax, shorter tweens) is the game's call.
 */
export function detectReduceMotion(): boolean {
  const matchMedia = (globalThis as { matchMedia?: (query: string) => { matches: boolean } })
    .matchMedia;
  if (typeof matchMedia !== "function") return false;
  try {
    return matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}
