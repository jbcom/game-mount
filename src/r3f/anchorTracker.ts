import { type Camera, Matrix4 } from "three";
import {
  type AnchorProjection,
  type EdgeInsets,
  projectAnchor,
  type Vec3,
} from "../camera/index.js";

/**
 * Where an anchor is shown: `inside` is the full marker, `edge` is the off-screen indicator at the
 * border of the view, `hidden` is neither (no position, off screen with no indicator given, or
 * beaten for an indicator slot by nearer anchors).
 */
export type AnchorState = "inside" | "edge" | "hidden";

/** A world position, or a getter called every frame for a moving thing (return `null` for none). */
export type AnchorPosition = Vec3 | (() => Vec3 | null);

/** Everything the tracker reads from an anchor each frame. */
export interface AnchorSpec {
  readonly position: AnchorPosition;
  /** Screen offset in CSS pixels from the projected point, applied to the marker only. */
  readonly offset: readonly [x: number, y: number];
  /** Width and height of the marker's glyph box in CSS pixels, or a function of the distance. */
  readonly size: number | ((distance: number) => number) | undefined;
  /** Lower ranks win indicator slots first; ties go to the nearer anchor. */
  readonly edgeRank: number;
  /** Whether an off-screen indicator was supplied. */
  readonly edge: boolean;
}

/** The DOM an anchor hands over, and how the tracker reaches its latest props. */
export interface AnchorTarget {
  /** Zero-size origin element: carries `data-state` and the CSS variables. */
  readonly root: HTMLElement;
  /** The marker part, moved to the projected point and shown while the anchor is inside. */
  readonly marker: HTMLElement;
  /** The box inside the marker that `size` sets. */
  glyph(): HTMLElement;
  /** The edge part, moved to the border position and shown while the anchor is at the edge. */
  readonly edge: HTMLElement;
  spec(): AnchorSpec;
  notify(state: AnchorState): void;
}

/** What one frame of tracking needs: a camera, the canvas box and how to treat the border. */
export interface AnchorFrame {
  readonly camera: Camera;
  /** The canvas box in CSS pixels: r3f's `size`. A box with no area changes nothing. */
  readonly width: number;
  readonly height: number;
  /** Margins that HUD furniture takes; anchors under them get an edge indicator. Default none. */
  readonly insets?: number | Partial<EdgeInsets>;
  /** The most edge indicators shown at once. Default unlimited. */
  readonly maxEdgeIndicators?: number;
}

/**
 * Connects anchors (DOM, in the host's React tree) to the projector (inside the canvas). Create
 * one with `useAnchorTracker` or `createAnchorTracker` and pass it to `AnchorLayer` and
 * `AnchorProjector`.
 */
export interface AnchorTracker {
  /** Adds an anchor; the returned function removes it. */
  register(target: AnchorTarget): () => void;
  /**
   * Projects every registered anchor through the frame's camera and writes the result to the DOM.
   * `AnchorProjector` calls this every r3f frame. Call it yourself to drive anchors from another
   * loop. Throws `RangeError` for an inset that is negative or not finite.
   */
  update(frame: AnchorFrame): void;
  /**
   * Re-applies the latest frame once, soon: for an anchor that just mounted or changed its props
   * while the canvas is not drawing (`frameloop="demand"`). `Anchor` calls it after every commit.
   */
  refresh(): void;
}

interface Entry {
  readonly target: AnchorTarget;
  state: AnchorState;
  /** The glyph node the last size was written to. */
  glyph: HTMLElement | null;
  /** The last string written for each property, so an unchanged value costs no DOM write. */
  readonly written: Record<string, string>;
}

interface Row {
  readonly entry: Entry;
  readonly spec: AnchorSpec;
  readonly projection: AnchorProjection | null;
}

function write(entry: Entry, key: string, value: string, apply: (value: string) => void): void {
  if (entry.written[key] === value) return;
  entry.written[key] = value;
  apply(value);
}

function px(value: number): string {
  return `${Math.round(value * 100) / 100}px`;
}

function translate(x: number, y: number): string {
  return `translate3d(${px(x)},${px(y)},0) translate(-50%,-50%)`;
}

function place(row: Row, state: AnchorState): void {
  const { entry, spec, projection } = row;
  const { root, marker, edge } = entry.target;
  if (state !== entry.state) {
    entry.state = state;
    root.dataset.state = state;
    marker.hidden = state !== "inside";
    edge.hidden = state !== "edge";
    entry.target.notify(state);
  }
  if (!projection || state === "hidden") return;
  write(entry, "distance", String(Math.round(projection.distance * 100) / 100), (value) =>
    root.style.setProperty("--anchor-distance", value)
  );
  if (state === "inside") {
    const size = typeof spec.size === "function" ? spec.size(projection.distance) : spec.size;
    // The glyph node is replaced when the marker becomes or stops being a button; a size written
    // to the old node is gone, so forget it.
    const glyph = entry.target.glyph();
    if (entry.glyph !== glyph) {
      entry.glyph = glyph;
      delete entry.written.size;
    }
    if (size !== undefined) {
      write(entry, "size", px(size), (value) => {
        glyph.style.width = value;
        glyph.style.height = value;
        root.style.setProperty("--anchor-size", value);
      });
    }
    write(
      entry,
      "marker",
      translate(projection.x + spec.offset[0], projection.y + spec.offset[1]),
      (value) => {
        marker.style.transform = value;
      }
    );
    return;
  }
  write(entry, "edge", translate(projection.edge.x, projection.edge.y), (value) => {
    edge.style.transform = value;
  });
  write(entry, "angle", `${Math.round(projection.edge.angle * 1e4) / 1e4}rad`, (value) =>
    root.style.setProperty("--anchor-angle", value)
  );
}

/** A tracker with no anchors and no frame yet. */
export function createAnchorTracker(): AnchorTracker {
  const entries = new Set<Entry>();
  // One per tracker, so two trackers never share a matrix whatever order they update in.
  const viewProjection = new Matrix4();
  let latest: AnchorFrame | null = null;
  let refreshQueued = false;

  const update = (frame: AnchorFrame): void => {
    latest = frame;
    const { camera, width, height, insets, maxEdgeIndicators = Number.POSITIVE_INFINITY } = frame;
    if (entries.size === 0 || !(width > 0 && height > 0)) return;
    // The rig that moves the camera (or a group it sits in) runs earlier this frame; the renderer
    // would refresh the matrices only when it draws, a frame late. This brings the parents, the
    // camera's world matrix and its inverse up to date.
    camera.updateWorldMatrix(true, false);
    viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    const world = camera.matrixWorld.elements;
    const view = {
      viewProjection: viewProjection.elements,
      eye: [world[12] as number, world[13] as number, world[14] as number] as const,
    };
    const viewport = { width, height };

    const rows: Row[] = [];
    for (const entry of entries) {
      const spec = entry.target.spec();
      const point = typeof spec.position === "function" ? spec.position() : spec.position;
      // A position with a NaN or infinite component (a thing that has none yet) is no position.
      const usable = point?.every(Number.isFinite);
      rows.push({
        entry,
        spec,
        projection: point && usable ? projectAnchor(point, view, viewport, insets) : null,
      });
    }

    const wanted = rows
      .filter((row) => row.projection && !row.projection.inside && row.spec.edge)
      .sort(
        (a, b) =>
          a.spec.edgeRank - b.spec.edgeRank ||
          (a.projection as AnchorProjection).distance - (b.projection as AnchorProjection).distance
      );
    const shown = new Set(wanted.slice(0, Math.max(0, maxEdgeIndicators)));
    for (const row of rows) {
      const { projection } = row;
      const state: AnchorState = !projection
        ? "hidden"
        : projection.inside
          ? "inside"
          : shown.has(row)
            ? "edge"
            : "hidden";
      place(row, state);
    }
  };

  return {
    register(target) {
      const entry: Entry = { target, state: "hidden", glyph: null, written: {} };
      // An element that outlived an earlier registration (a replayed effect, a swapped tracker)
      // may still show its last state; the entry starts from hidden, so make the DOM agree.
      target.root.dataset.state = "hidden";
      target.marker.hidden = true;
      target.edge.hidden = true;
      entries.add(entry);
      return () => {
        entries.delete(entry);
      };
    },
    update,
    refresh() {
      if (refreshQueued) return;
      refreshQueued = true;
      queueMicrotask(() => {
        refreshQueued = false;
        if (latest) update(latest);
      });
    },
  };
}
