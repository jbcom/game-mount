import type { CSSProperties, PointerEventHandler, ReactNode } from "react";
import { useEffect, useRef } from "react";
import { useLayerTracker } from "./AnchorLayer.js";
import type { AnchorPosition, AnchorSpec, AnchorState } from "./anchorTracker.js";

export interface AnchorProps {
  /** Where in the world the anchor sits: a point, or a getter called every frame (`null` hides). */
  position: AnchorPosition;
  /**
   * The marker, shown while the anchor is in view. Whatever the host passes is all that is drawn;
   * the package adds no glyph, text or default accessible name.
   */
  children?: ReactNode;
  /**
   * The indicator shown at the border of the view while the anchor is off screen or under the
   * insets. Omit it and the anchor is simply hidden there. The indicator's centre sits on the
   * border; the CSS variable `--anchor-angle` is the direction toward the anchor, so
   * `transform: rotate(var(--anchor-angle))` turns an arrow drawn pointing right.
   */
  edge?: ReactNode;
  /** Pixels to move the marker from the projected point, for example `[0, -24]` to sit above it. */
  offset?: readonly [x: number, y: number];
  /**
   * The marker's glyph box in CSS pixels: a number for a constant size at any distance, or a
   * function of the distance in world units for a size that varies by distance. It is also
   * published as `--anchor-size`. Omit it and the content sizes itself.
   */
  size?: number | ((distance: number) => number);
  /**
   * The smallest side of the marker's press target in CSS pixels. The glyph keeps its size and
   * sits centred in a target at least this big, so a small, far marker is still easy to hit.
   */
  minTarget?: number;
  /**
   * Lower ranks get the limited indicator slots first (`AnchorProjector`'s `maxEdgeIndicators`);
   * equal ranks go to the nearer anchor. Default 0.
   */
  edgeRank?: number;
  /** Makes the marker a `<button>`; called on click, Enter or Space. */
  onPress?: () => void;
  /**
   * Makes the marker a `<button>` and receives its pointer-down unchanged (never prevented), so a
   * press can start a drag the host owns. The press target has `touch-action: none`.
   */
  onPointerDown?: PointerEventHandler<HTMLElement>;
  /** The accessible name of the button, from the host's own words. Only used with a handler. */
  label?: string;
  /**
   * Called when the anchor moves between `inside`, `edge` and `hidden`, and only then (not every
   * frame), so the host can react without re-rendering at frame rate.
   */
  onStateChange?: (state: AnchorState) => void;
  className?: string;
  style?: CSSProperties;
}

const ORIGIN: readonly [number, number] = [0, 0];

const rootStyle: CSSProperties = {
  position: "absolute",
  left: 0,
  top: 0,
  width: 0,
  height: 0,
};

/** Parts start hidden and are moved to their spot by the tracker; `max-content` stops text wrapping. */
const partStyle: CSSProperties = {
  position: "absolute",
  left: 0,
  top: 0,
  width: "max-content",
};

const buttonReset: CSSProperties = {
  border: 0,
  padding: 0,
  margin: 0,
  background: "none",
  font: "inherit",
  color: "inherit",
  cursor: "pointer",
  pointerEvents: "auto",
  touchAction: "none",
};

function present(node: ReactNode): boolean {
  return node !== undefined && node !== null && typeof node !== "boolean";
}

/**
 * HTML anchored to a world position: a marker over a thing, a count on a part, a label. It follows
 * the position every frame, keeps the same size on screen at any distance (it is plain DOM, so
 * nothing about it scales with perspective) and, given `edge`, shows an indicator at the border of
 * the view for a position that is off screen.
 *
 * Render it inside an `AnchorLayer`, with an `AnchorProjector` inside the canvas driving the same
 * tracker. Its content is ordinary React in the host's tree. Placement is written straight to the
 * DOM each frame, so a moving marker costs no React render.
 *
 * Nothing here draws unless the host passes it, and nothing animates: bobbing or pulsing is the
 * host's styling, and the host's to switch off under reduced motion (see `detectReduceMotion`).
 * Overlays are drawn above the scene and are not hidden by objects in front of them.
 */
export function Anchor(props: AnchorProps): ReactNode {
  const tracker = useLayerTracker();
  const root = useRef<HTMLDivElement>(null);
  const marker = useRef<HTMLDivElement>(null);
  const glyph = useRef<HTMLDivElement>(null);
  const edge = useRef<HTMLDivElement>(null);
  const latest = useRef(props);
  latest.current = props;

  useEffect(
    () =>
      tracker.register({
        root: root.current as HTMLElement,
        marker: marker.current as HTMLElement,
        glyph: glyph.current as HTMLElement,
        edge: edge.current as HTMLElement,
        spec(): AnchorSpec {
          const { position, offset, size, edgeRank, edge: indicator } = latest.current;
          return {
            position,
            offset: offset ?? ORIGIN,
            size,
            edgeRank: edgeRank ?? 0,
            edge: present(indicator),
          };
        },
        notify(state) {
          latest.current.onStateChange?.(state);
        },
      }),
    [tracker]
  );
  // A prop that changed (a new position, size or indicator) is shown at once, even on an idle canvas.
  useEffect(() => tracker.refresh());

  const { children, edge: indicator, minTarget = 0, onPress, onPointerDown, label } = props;
  const targetStyle: CSSProperties = {
    display: "grid",
    placeItems: "center",
    minWidth: minTarget,
    minHeight: minTarget,
  };
  const content = (
    <div ref={glyph} style={{ display: "grid", placeItems: "center" }}>
      {children}
    </div>
  );
  return (
    <div
      ref={root}
      data-game-mount-anchor=""
      data-state="hidden"
      className={props.className}
      style={{ ...props.style, ...rootStyle }}
    >
      <div ref={marker} data-anchor-part="marker" hidden style={partStyle}>
        {onPress || onPointerDown ? (
          <button
            type="button"
            aria-label={label}
            onClick={onPress}
            onPointerDown={onPointerDown}
            style={{ ...targetStyle, ...buttonReset }}
          >
            {content}
          </button>
        ) : (
          <div style={targetStyle}>{content}</div>
        )}
      </div>
      <div ref={edge} data-anchor-part="edge" hidden style={partStyle}>
        {indicator}
      </div>
    </div>
  );
}
