/**
 * Device facts that change how much a renderer should ask of the GPU.
 *
 * `isMobileDevice` answers one question: is this a phone- or tablet-class GPU, so the render budget
 * should be lower? It is a render-budget heuristic, not a layout classifier; size the layout from
 * the viewport, not from this.
 */

/** The subset of `Navigator` the detection reads. */
export interface NavigatorLike {
  readonly userAgent?: string;
  readonly maxTouchPoints?: number;
  readonly userAgentData?: { readonly mobile?: boolean };
}

function globalNavigator(): NavigatorLike | undefined {
  return (globalThis as { navigator?: NavigatorLike }).navigator;
}

/**
 * True on a phone or tablet: User-Agent Client Hints say `mobile`, the user agent names iPhone,
 * iPad, iPod or Android, or a touch-capable "Macintosh" (iPadOS 13+ reports desktop Safari).
 * False where there is no navigator.
 */
export function isMobileDevice(navigator: NavigatorLike | undefined = globalNavigator()): boolean {
  if (navigator === undefined) return false;
  if (navigator.userAgentData?.mobile === true) return true;
  const userAgent = navigator.userAgent ?? "";
  if (/iPhone|iPad|iPod|Android/i.test(userAgent)) return true;
  return /Macintosh/.test(userAgent) && (navigator.maxTouchPoints ?? 0) > 1;
}
