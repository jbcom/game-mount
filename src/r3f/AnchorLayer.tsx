import type { CSSProperties, HTMLAttributes, ReactNode } from "react";
import { createContext, useContext, useState } from "react";
import { type AnchorTracker, createAnchorTracker } from "./anchorTracker.js";

const AnchorTrackerContext = createContext<AnchorTracker | null>(null);

/** The tracker of the nearest `AnchorLayer`; throws outside one. For `Anchor`. */
export function useLayerTracker(): AnchorTracker {
  const tracker = useContext(AnchorTrackerContext);
  if (!tracker) throw new Error("[game-mount] <Anchor> must be rendered inside an <AnchorLayer>.");
  return tracker;
}

/** A tracker that lives as long as the component that calls this. Pass it to both halves. */
export function useAnchorTracker(): AnchorTracker {
  const [tracker] = useState(createAnchorTracker);
  return tracker;
}

export interface AnchorLayerProps extends Omit<HTMLAttributes<HTMLDivElement>, "children"> {
  /** The tracker an `AnchorProjector` inside the canvas drives. */
  tracker: AnchorTracker;
  /** `Anchor`s. They are ordinary React children of the host's tree, so its context reaches them. */
  children?: ReactNode;
}

const layerStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  overflow: "hidden",
  pointerEvents: "none",
};

/**
 * The overlay that holds `Anchor`s: an absolutely positioned box that fills its nearest positioned
 * ancestor and lets every pointer through except to an anchor that asked for one. Put it in the
 * same box as the canvas, after it, so both share one coordinate space:
 *
 * ```tsx
 * <div style={{ position: "relative", height: 480 }}>
 *   <GameCanvas active>…<AnchorProjector tracker={tracker} /></GameCanvas>
 *   <AnchorLayer tracker={tracker}><Anchor position={…}>…</Anchor></AnchorLayer>
 * </div>
 * ```
 *
 * It draws and animates nothing of its own. Stack it with `style.zIndex` or `className` as the
 * interface needs.
 */
export function AnchorLayer({ tracker, style, children, ...rest }: AnchorLayerProps): ReactNode {
  return (
    <AnchorTrackerContext.Provider value={tracker}>
      <div data-game-mount-anchor-layer="" {...rest} style={{ ...style, ...layerStyle }}>
        {children}
      </div>
    </AnchorTrackerContext.Provider>
  );
}
