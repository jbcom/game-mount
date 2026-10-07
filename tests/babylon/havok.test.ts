import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const pluginInstance = { mockHavokPlugin: true };

vi.mock("@babylonjs/havok", () => ({
  default: vi.fn(async (_options: { locateFile: (file: string) => string }) => ({
    mockHavokInstance: true,
  })),
}));

vi.mock("@babylonjs/core/Physics/v2/Plugins/havokPlugin.js", () => ({
  HavokPlugin: vi.fn().mockImplementation(function HavokPlugin() {
    return pluginInstance;
  }),
}));

vi.mock("@babylonjs/core/Physics/v2/physicsEngineComponent.js", () => ({}));

const HavokPhysics = vi.mocked((await import("@babylonjs/havok")).default);
const { useHavokPhysics, _resetHavokPhysicsCache } = await import("../../src/babylon/havok.js");

beforeEach(() => {
  _resetHavokPhysicsCache();
  vi.clearAllMocks();
});

afterEach(() => {
  _resetHavokPhysicsCache();
});

describe("useHavokPhysics", () => {
  it("starts null and resolves to the plugin, locating the WASM under the base URL", async () => {
    const { result } = renderHook(() => useHavokPhysics("/custom-havok/"));
    expect(result.current).toEqual({ plugin: null, error: null });
    await waitFor(() => expect(result.current.plugin).toBe(pluginInstance));
    const options = HavokPhysics.mock.calls[0]?.[0] as { locateFile: (file: string) => string };
    expect(options.locateFile("HavokPhysics.wasm")).toBe("/custom-havok/HavokPhysics.wasm");
  });

  it("loads the WASM once per page across hook instances", async () => {
    const first = renderHook(() => useHavokPhysics());
    await waitFor(() => expect(first.result.current.plugin).not.toBeNull());
    const second = renderHook(() => useHavokPhysics());
    await waitFor(() => expect(second.result.current.plugin).not.toBeNull());
    expect(HavokPhysics).toHaveBeenCalledTimes(1);
  });

  it("loads again for a different base URL", async () => {
    const first = renderHook(() => useHavokPhysics("/a/"));
    await waitFor(() => expect(first.result.current.plugin).not.toBeNull());
    const second = renderHook(() => useHavokPhysics("/b/"));
    await waitFor(() => expect(second.result.current.plugin).not.toBeNull());
    expect(HavokPhysics).toHaveBeenCalledTimes(2);
  });

  it("reports a failed load and lets the next mount retry", async () => {
    HavokPhysics.mockRejectedValueOnce(new Error("wasm 404"));
    const failed = renderHook(() => useHavokPhysics());
    await waitFor(() => expect(failed.result.current.error?.message).toBe("wasm 404"));
    expect(failed.result.current.plugin).toBeNull();

    const retried = renderHook(() => useHavokPhysics());
    await waitFor(() => expect(retried.result.current.plugin).toBe(pluginInstance));
    expect(HavokPhysics).toHaveBeenCalledTimes(2);
  });

  it("a stale failure does not clear the cache of a newer load", async () => {
    let rejectStale: (reason: Error) => void = () => undefined;
    HavokPhysics.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          rejectStale = reject;
        })
    );
    const stale = renderHook(() => useHavokPhysics("/old/"));
    const fresh = renderHook(() => useHavokPhysics("/new/"));
    await waitFor(() => expect(fresh.result.current.plugin).toBe(pluginInstance));
    rejectStale(new Error("old base failed"));
    await waitFor(() => expect(stale.result.current.error?.message).toBe("old base failed"));
    const again = renderHook(() => useHavokPhysics("/new/"));
    await waitFor(() => expect(again.result.current.plugin).toBe(pluginInstance));
    expect(HavokPhysics).toHaveBeenCalledTimes(2);
  });

  it("wraps a non-Error rejection", async () => {
    HavokPhysics.mockRejectedValueOnce("offline");
    const { result } = renderHook(() => useHavokPhysics());
    await waitFor(() => expect(result.current.error).toEqual(new Error("offline")));
  });

  it("ignores a load that settles after unmount", async () => {
    const { result, unmount } = renderHook(() => useHavokPhysics());
    unmount();
    await Promise.resolve();
    await Promise.resolve();
    expect(result.current.plugin).toBeNull();
    HavokPhysics.mockRejectedValueOnce(new Error("late"));
    _resetHavokPhysicsCache();
    const late = renderHook(() => useHavokPhysics());
    late.unmount();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(late.result.current.error).toBeNull();
  });
});
