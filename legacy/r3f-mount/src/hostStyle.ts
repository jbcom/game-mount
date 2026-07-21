import type { CSSProperties } from 'react';

/**
 * The `.cabinet-canvas-host` CSS contract — THE load-bearing piece of this
 * package. Generalized from welcoming-wilds' `.ww-canvas` rule, the cleanest
 * parent-sized (non-window) canvas chain in the fleet audit:
 *
 *   html,body { height: 100% }
 *     → #app { position: fixed; inset: 0; display: flex; flex-direction: column }
 *       → shell { flex: 1 }
 *         → .cabinet-canvas-host { flex: 1; width: 100%; height: 100%; min-height: 0 }
 *
 * `min-height: 0` is the #1 real-world footgun: a flex item's default
 * `min-height: auto` lets a `height: 100%` child refuse to shrink below its
 * content's intrinsic size, silently breaking any layout that later docks a
 * HUD panel beside/below the canvas. Every rule here is parent-derived —
 * zero vh/vw/window.innerWidth anywhere.
 *
 * `display: flex` on the host makes r3f's own wrapper div (100%/100%) resolve
 * against a real box, so r3f's ResizeObserver does all the sizing work.
 */
export const cabinetCanvasHostStyle: CSSProperties = {
  position: 'relative',
  flex: 1,
  display: 'flex',
  width: '100%',
  height: '100%',
  minHeight: 0,
};

/** Class name applied to the host div `CabinetCanvas` renders; the shipped
 * `styles.css` targets it. The inline `cabinetCanvasHostStyle` is applied
 * too, so the contract holds even without importing the stylesheet. */
export const CABINET_CANVAS_HOST_CLASS = 'cabinet-canvas-host';
