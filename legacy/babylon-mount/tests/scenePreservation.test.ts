import { describe, expect, it } from 'vitest';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine.js';
import { Scene } from '@babylonjs/core/scene.js';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';

// SceneRoot's promise: the Babylon Scene + Engine remain mounted across key
// changes; only per-key mesh subtrees mount/unmount. This test validates the
// property at the TransformNode level — disposing one key's root does NOT
// affect siblings or the scene itself. The React-component-level behavior is
// exercised indirectly when the renderer sees a key change.

describe('scene preservation across active-key changes', () => {
  it('disposing one key root leaves the scene + sibling roots alive', () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);

    const phaseA = new TransformNode('phase-a-root', scene);
    const phaseB = new TransformNode('phase-b-root', scene);
    const childA = new TransformNode('child-a', scene);
    childA.parent = phaseA;
    const childB = new TransformNode('child-b', scene);
    childB.parent = phaseB;

    expect(scene.transformNodes.length).toBeGreaterThanOrEqual(4);

    // Simulate a key change: dispose A entirely.
    phaseA.dispose(false, true);

    // Scene survives.
    expect(scene.isDisposed).toBe(false);
    // Sibling key root + its child survive.
    expect(scene.transformNodes).toContain(phaseB);
    expect(scene.transformNodes).toContain(childB);
    // Disposed root + its child are gone.
    expect(scene.transformNodes).not.toContain(phaseA);
    expect(scene.transformNodes).not.toContain(childA);
  });

  it('repeatedly mounting and unmounting the same key does not leak nodes', () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const baselineCount = scene.transformNodes.length;

    for (let i = 0; i < 10; i++) {
      const root = new TransformNode(`cycle-${i}`, scene);
      const child = new TransformNode(`cycle-${i}-child`, scene);
      child.parent = root;
      root.dispose(false, true);
    }

    // After 10 mount/unmount cycles, transform-node count is unchanged.
    expect(scene.transformNodes.length).toBe(baselineCount);
  });
});
