import type { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { TransformNode as BJSTransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import { type ReactNode, useEffect, useState } from 'react';
import { useScene } from 'reactylon';

/**
 * Mounts/unmounts a discriminant-scoped TransformNode and its children
 * when `activeKey === matchKey`. Sub-scenes hang meshes off the root
 * TransformNode and rely on the dispose chain to clean up on exit.
 *
 * The Babylon Scene + Engine are expected to remain mounted at a
 * higher level (e.g. a `<Engine><Scene>` wrapper) — this component only
 * owns the per-key mesh subtree, not the scene itself.
 *
 * Generalized over any discriminant key (menu/gameplay/game-over
 * "screens" sharing one Engine, encounter phases, etc.) — not tied to
 * any particular game's phase union.
 */
export function SceneRoot<T extends string | number>({
  activeKey,
  matchKey,
  children,
}: {
  activeKey: T;
  matchKey: T;
  children: (root: TransformNode) => ReactNode;
}) {
  const scene = useScene();
  const [root, setRoot] = useState<TransformNode | null>(null);

  const isActive = activeKey === matchKey;

  useEffect(() => {
    // Inactive (or no scene yet): nothing to mount. Any previously-active
    // root is torn down by that earlier effect run's own cleanup below —
    // this branch never needs to reach back into state itself.
    if (!scene || !isActive) return;
    const node = new BJSTransformNode(`scene-root-${String(matchKey)}`, scene);
    setRoot(node);
    return () => {
      node.dispose(false, true);
      setRoot(null);
    };
  }, [isActive, matchKey, scene]);

  if (!isActive || !root) return null;
  return <>{children(root)}</>;
}
