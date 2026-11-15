import { beforeEach, describe, expect, it, vi } from "vitest";

const fiber = vi.hoisted(() => ({
  configure: vi.fn(),
  render: vi.fn(),
  unmount: vi.fn(),
  createRoot: vi.fn(),
  setFrameloop: vi.fn(),
}));
vi.mock("@react-three/fiber", () => ({
  createRoot: fiber.createRoot,
  unmountComponentAtNode: fiber.unmount,
}));
const { createR3FMount } = await import("../../src/r3f/createR3FMount.js");

beforeEach(() => {
  vi.resetAllMocks();
  fiber.createRoot.mockReturnValue({ configure: fiber.configure, render: fiber.render });
  fiber.render.mockReturnValue({ getState: () => ({ gl: {}, setFrameloop: fiber.setFrameloop }) });
});

describe("createR3FMount", () => {
  it("forwards configuration and scene updates without exposing the unmanaged root", async () => {
    const canvas = document.createElement("canvas");
    const mount = createR3FMount(canvas);
    expect(fiber.createRoot).toHaveBeenCalledWith(canvas);
    expect(mount.canvas).toBe(canvas);
    expect(mount.retiring).toBe(false);
    await expect(mount.configure({ frameloop: "demand" })).resolves.toBeUndefined();
    expect(fiber.configure).toHaveBeenCalledWith({ frameloop: "demand" });
    mount.render(null);
    expect(fiber.render).toHaveBeenCalledWith(null);
    expect(() => createR3FMount(canvas)).toThrow("already has a mount owner");
  });

  it("shares one pending retirement and waits for the real completion callback", async () => {
    const canvas = document.createElement("canvas");
    const mount = createR3FMount(canvas);
    mount.render(null);
    const retired = vi.fn();
    const promise = mount.retire();
    expect(mount.retiring).toBe(true);
    void promise.then(retired);
    expect(mount.retire()).toBe(promise);
    expect(fiber.unmount).toHaveBeenCalledTimes(1);
    expect(fiber.setFrameloop).toHaveBeenCalledWith("never");
    expect(fiber.setFrameloop.mock.invocationCallOrder[0]).toBeLessThan(
      fiber.unmount.mock.invocationCallOrder[0] as number
    );
    await Promise.resolve();
    expect(retired).not.toHaveBeenCalled();
    expect(() => mount.render(null)).toThrow("retiring");
    await expect(mount.configure({})).rejects.toThrow("retiring");
    expect(() => createR3FMount(canvas)).toThrow("already has a mount owner");
    fiber.unmount.mock.calls[0]?.[1](canvas);
    await promise;
    expect(retired).toHaveBeenCalledOnce();
    expect(mount.retire()).toBe(promise);
    expect(() => createR3FMount(canvas)).not.toThrow();
  });

  it("can retire before rendering, including while configuration is pending", async () => {
    let configured!: () => void;
    fiber.configure.mockReturnValue(
      new Promise<void>((resolve) => {
        configured = resolve;
      })
    );
    const canvas = document.createElement("canvas");
    const mount = createR3FMount(canvas);
    const configuration = mount.configure({});
    const retirement = mount.retire();
    expect(fiber.unmount).toHaveBeenCalledOnce();
    expect(fiber.setFrameloop).not.toHaveBeenCalled();
    configured();
    await configuration;
    fiber.unmount.mock.calls[0]?.[1](canvas);
    await retirement;
  });

  it("does not change a frame loop before an async renderer exists", async () => {
    fiber.render.mockReturnValue({ getState: () => ({ gl: null }) });
    fiber.unmount.mockImplementation((_canvas, done) => done());
    const mount = createR3FMount(document.createElement("canvas"));
    mount.render(null);
    await mount.retire();
    expect(fiber.setFrameloop).not.toHaveBeenCalled();
  });

  it("propagates configuration failure and still permits retirement", async () => {
    fiber.configure.mockRejectedValue(new Error("renderer failed"));
    const canvas = document.createElement("canvas");
    const mount = createR3FMount(canvas);
    await expect(mount.configure({})).rejects.toThrow("renderer failed");
    fiber.unmount.mockImplementation((_canvas, done) => done());
    await mount.retire();
  });

  it("rejects incomplete teardown and retains exclusive ownership", async () => {
    fiber.unmount.mockImplementation(() => {
      throw new Error("cleanup failed");
    });
    const canvas = document.createElement("canvas");
    const mount = createR3FMount(canvas);
    const promise = mount.retire();
    expect(mount.retiring).toBe(true);
    await expect(promise).rejects.toThrow("cleanup failed");
    expect(mount.retire()).toBe(promise);
    expect(() => createR3FMount(canvas)).toThrow("already has a mount owner");
  });
});
