import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const mockPluginInstance = { __mockHavokPlugin: true };

vi.mock('@babylonjs/havok', () => ({
  default: vi.fn(async () => ({ __mockHavokInstance: true })),
}));

vi.mock('@babylonjs/core/Physics/v2/Plugins/havokPlugin.js', () => ({
  HavokPlugin: vi.fn().mockImplementation(function HavokPlugin() {
    return mockPluginInstance;
  }),
}));

vi.mock('@babylonjs/core/Physics/v2/physicsEngineComponent.js', () => ({}));

describe('useHavokPhysics', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('starts with a null plugin and resolves once WASM load settles', async () => {
    const { useHavokPhysics, _resetHavokPhysicsCache } = await import('../src/useHavokPhysics');
    _resetHavokPhysicsCache();

    const { result } = renderHook(() => useHavokPhysics('/custom-havok/'));
    expect(result.current.plugin).toBeNull();
    expect(result.current.error).toBeNull();

    await waitFor(() => {
      expect(result.current.plugin).not.toBeNull();
    });
    expect(result.current.plugin).toBe(mockPluginInstance);
  });

  it('caches the plugin promise across hook instances (idempotent load)', async () => {
    const HavokPhysics = (await import('@babylonjs/havok')).default;
    const { useHavokPhysics, _resetHavokPhysicsCache } = await import('../src/useHavokPhysics');
    _resetHavokPhysicsCache();
    vi.clearAllMocks();

    const first = renderHook(() => useHavokPhysics('/havok/'));
    await waitFor(() => expect(first.result.current.plugin).not.toBeNull());

    const second = renderHook(() => useHavokPhysics('/havok/'));
    await waitFor(() => expect(second.result.current.plugin).not.toBeNull());

    // The underlying WASM loader is invoked only once across both hook
    // instances — this is the "re-entering the surface scene doesn't
    // re-download the WASM" guarantee.
    expect(HavokPhysics).toHaveBeenCalledTimes(1);
  });
});
