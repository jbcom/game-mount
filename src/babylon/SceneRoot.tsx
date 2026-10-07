import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import { type ReactNode, useEffect, useState } from "react";
import { useScene } from "reactylon";
import { isActivePhase } from "../core/phase.js";

export interface SceneRootProps<T extends string | number> {
  /** The game's current phase. */
  activeKey: T;
  /** The phase, or phases, this subtree belongs to. */
  matchKey: T | readonly T[];
  /** Renders the subtree; hang meshes off `root` so disposing it disposes them. */
  children: (root: TransformNode) => ReactNode;
}

/**
 * A phase-scoped subtree of one Babylon scene. While `activeKey` matches `matchKey` (see
 * `isActivePhase`) it creates a `TransformNode` root and renders `children(root)`; when the phase
 * ends it disposes the root and everything parented to it.
 *
 * The Engine and Scene stay mounted above it (Reactylon's `<Engine><Scene>`), so moving between,
 * say, a title screen and a level swaps subtrees without recreating the GPU context.
 */
export function SceneRoot<T extends string | number>({
  activeKey,
  matchKey,
  children,
}: SceneRootProps<T>): ReactNode {
  const scene = useScene();
  const [root, setRoot] = useState<TransformNode | null>(null);

  const isActive = isActivePhase(activeKey, matchKey);
  // A stable string, so an inline array literal for matchKey does not recreate the root every render.
  const rootName = `scene-root-${Array.isArray(matchKey) ? matchKey.join("+") : String(matchKey)}`;

  useEffect(() => {
    // Inactive, or no scene yet: nothing to create. A root from an earlier active run was already
    // disposed by that run's cleanup.
    if (!scene || !isActive) return undefined;
    const node = new TransformNode(rootName, scene);
    setRoot(node);
    return () => {
      node.dispose(false, true);
      setRoot(null);
    };
  }, [isActive, rootName, scene]);

  if (!isActive || !root) return null;
  return children(root);
}
