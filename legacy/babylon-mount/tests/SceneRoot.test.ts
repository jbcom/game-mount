import { NullEngine } from '@babylonjs/core/Engines/nullEngine.js';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import { Scene } from '@babylonjs/core/scene.js';
import { describe, expect, it } from 'vitest';

// SceneRoot mount/unmount semantics: this suite asserts the pure-Babylon
// TransformNode chain that SceneRoot relies on. The React wrapper itself is
// covered indirectly when phase-scoped sub-scenes mount/unmount in
// consuming-app integration tests.

function rig() {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  return { engine, scene };
}

describe('TransformNode dispose chain (the SceneRoot foundation)', () => {
  it('disposes children when the parent root is disposed', () => {
    const { scene } = rig();
    const root = new TransformNode('root', scene);
    const child = new TransformNode('child', scene);
    child.parent = root;

    expect(scene.transformNodes).toContain(root);
    expect(scene.transformNodes).toContain(child);

    root.dispose(false, true);

    expect(scene.transformNodes).not.toContain(root);
    expect(scene.transformNodes).not.toContain(child);
  });

  it('does not affect siblings outside its subtree', () => {
    const { scene } = rig();
    const phaseA = new TransformNode('phaseA', scene);
    const phaseB = new TransformNode('phaseB', scene);
    const aChild = new TransformNode('aChild', scene);
    aChild.parent = phaseA;

    phaseA.dispose(false, true);

    expect(scene.transformNodes).not.toContain(phaseA);
    expect(scene.transformNodes).not.toContain(aChild);
    expect(scene.transformNodes).toContain(phaseB);
  });
});
