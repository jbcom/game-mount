/**
 * GroundCameraRig against a fake r3f: useThree hands out a camera and a size, and useFrame hands the
 * per-frame callback to the test, which drives frames by hand. The pose maths is covered in
 * tests/camera; here the rig's own work is checked: easing, follow, clamping, and what it writes to
 * the camera and to the controller ref.
 */

import { cleanup, render } from "@testing-library/react";
import { PerspectiveCamera } from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clampState,
  easeToward,
  type GroundCameraLimits,
  type GroundCameraState,
  poseFor,
} from "../../src/camera/index.js";

interface FakeCamera {
  isPerspectiveCamera: boolean;
  fov: number;
  position: { set: ReturnType<typeof vi.fn> };
  lookAt: ReturnType<typeof vi.fn>;
  updateProjectionMatrix: ReturnType<typeof vi.fn>;
}

const fake = vi.hoisted(() => ({
  camera: null as unknown,
  size: { width: 390, height: 844 },
  frame: null as ((state: unknown, delta: number) => void) | null,
  priority: undefined as number | undefined,
}));

vi.mock("@react-three/fiber", () => ({
  useThree: (selector: (state: { camera: unknown; size: unknown }) => unknown) =>
    selector({ camera: fake.camera, size: fake.size }),
  useFrame: (callback: (state: unknown, delta: number) => void, priority?: number) => {
    fake.frame = callback;
    fake.priority = priority;
  },
}));

const { GroundCameraRig } = await import("../../src/r3f/index.js");

const DEG = Math.PI / 180;
const LIMITS: GroundCameraLimits = {
  bounds: [{ minX: -100, minZ: -100, maxX: 100, maxZ: 100 }],
  minSpan: 20,
  maxSpan: 200,
  pitch: { atMinSpan: 35 * DEG, atMaxSpan: 65 * DEG },
  fov: 40 * DEG,
};
const START: GroundCameraState = { x: 10, z: -20, span: 80, yaw: 0.3 };
const FRAME = 1 / 60;

function fakeCamera(): FakeCamera {
  return {
    isPerspectiveCamera: true,
    fov: 50,
    position: { set: vi.fn() },
    lookAt: vi.fn(),
    updateProjectionMatrix: vi.fn(),
  };
}

function aspect(): number {
  return fake.size.width / fake.size.height;
}

function frame(delta = FRAME): void {
  fake.frame?.({}, delta);
}

/** The last [x, y, z] the rig gave the camera. */
function lastCall(spy: ReturnType<typeof vi.fn>): number[] {
  return spy.mock.calls.at(-1) as number[];
}

beforeEach(() => {
  fake.camera = fakeCamera();
  fake.size = { width: 390, height: 844 };
  fake.frame = null;
  fake.priority = undefined;
});

afterEach(() => {
  cleanup();
});

describe("GroundCameraRig", () => {
  it("renders nothing and runs before r3f renders, without taking over the loop", () => {
    const view = render(<GroundCameraRig limits={LIMITS} stateRef={{ current: START }} />);
    expect(view.container.innerHTML).toBe("");
    expect(fake.priority).toBe(-1);
  });

  it("takes a custom priority", () => {
    render(<GroundCameraRig limits={LIMITS} stateRef={{ current: START }} priority={-5} />);
    expect(fake.priority).toBe(-5);
  });

  it("starts on the pose of the goal rather than easing in from nowhere", () => {
    const camera = fake.camera as FakeCamera;
    render(<GroundCameraRig limits={LIMITS} stateRef={{ current: START }} />);
    frame();
    const pose = poseFor(START, LIMITS, aspect());
    expect(lastCall(camera.position.set)).toEqual([...pose.position]);
    expect(lastCall(camera.lookAt)).toEqual([...pose.target]);
    expect(camera.fov).toBeCloseTo(40, 9);
    expect(camera.updateProjectionMatrix).toHaveBeenCalledTimes(1);
  });

  it("updates the projection only when the field of view changes", () => {
    const camera = fake.camera as FakeCamera;
    render(<GroundCameraRig limits={LIMITS} stateRef={{ current: START }} />);
    frame();
    frame();
    frame();
    expect(camera.updateProjectionMatrix).toHaveBeenCalledTimes(1);
  });

  it("eases the camera toward a goal that input moved", () => {
    const camera = fake.camera as FakeCamera;
    const stateRef = { current: START };
    render(<GroundCameraRig limits={LIMITS} stateRef={stateRef} />);
    frame();
    const goal: GroundCameraState = { x: -40, z: 30, span: 150, yaw: -1 };
    stateRef.current = goal;
    frame(0.05);
    const eased = easeToward(START, goal, 0.05);
    const pose = poseFor(eased, LIMITS, aspect());
    expect(lastCall(camera.position.set)).toEqual([...pose.position]);
    // Part of the way: not the start, not the goal.
    expect(eased.x).toBeLessThan(START.x);
    expect(eased.x).toBeGreaterThan(goal.x);
  });

  it("arrives at the goal pose after enough frames", () => {
    const camera = fake.camera as FakeCamera;
    const stateRef = { current: START };
    render(<GroundCameraRig limits={LIMITS} stateRef={stateRef} />);
    frame();
    const goal: GroundCameraState = { x: -40, z: 30, span: 150, yaw: -1 };
    stateRef.current = goal;
    for (let i = 0; i < 300; i += 1) frame();
    const pose = poseFor(goal, LIMITS, aspect());
    for (const [index, value] of lastCall(camera.position.set).entries()) {
      expect(value).toBeCloseTo(pose.position[index] as number, 6);
    }
  });

  it("uses the smoothing it is given, and snaps at zero", () => {
    const camera = fake.camera as FakeCamera;
    const stateRef = { current: START };
    render(<GroundCameraRig limits={LIMITS} stateRef={stateRef} smoothing={0} />);
    frame();
    const goal: GroundCameraState = { x: -40, z: 30, span: 150, yaw: -1 };
    stateRef.current = goal;
    frame(0.001);
    const pose = poseFor(goal, LIMITS, aspect());
    expect(lastCall(camera.position.set)).toEqual([...pose.position]);
  });

  it("clamps the controller state to the limits and writes the result back", () => {
    const stateRef = { current: { x: 500, z: 3, span: 9999, yaw: 0 } };
    render(<GroundCameraRig limits={LIMITS} stateRef={stateRef} />);
    frame();
    expect(stateRef.current).toEqual({ x: 100, z: 3, span: 200, yaw: 0 });
  });

  it("re-clamps when the limits shrink under a camera already shown", () => {
    const camera = fake.camera as FakeCamera;
    const stateRef = { current: { x: 80, z: 0, span: 80, yaw: 0 } };
    const view = render(<GroundCameraRig limits={LIMITS} stateRef={stateRef} />);
    frame();
    const smaller: GroundCameraLimits = {
      ...LIMITS,
      bounds: [{ minX: -10, minZ: -10, maxX: 10, maxZ: 10 }],
    };
    view.rerender(<GroundCameraRig limits={smaller} stateRef={stateRef} />);
    frame();
    expect(stateRef.current.x).toBe(10);
    expect(lastCall(camera.lookAt)[0]).toBe(10);
  });

  it("uses newly opened ground the frame after the bounds grow", () => {
    const camera = fake.camera as FakeCamera;
    const narrow: GroundCameraLimits = {
      ...LIMITS,
      bounds: [{ minX: -10, minZ: -10, maxX: 10, maxZ: 10 }],
    };
    const stateRef = { current: { x: 50, z: 0, span: 80, yaw: 0 } };
    const view = render(<GroundCameraRig limits={narrow} stateRef={stateRef} />);
    frame();
    expect(stateRef.current.x).toBe(10);
    stateRef.current = { ...stateRef.current, x: 50 };
    view.rerender(<GroundCameraRig limits={LIMITS} stateRef={stateRef} />);
    for (let i = 0; i < 300; i += 1) frame();
    expect(stateRef.current.x).toBe(50);
    expect(lastCall(camera.lookAt)[0]).toBeCloseTo(50, 6);
  });

  describe("follow", () => {
    it("steers the goal to a followed point and eases to it", () => {
      const camera = fake.camera as FakeCamera;
      const stateRef = { current: START };
      render(<GroundCameraRig limits={LIMITS} stateRef={stateRef} follow={{ x: 60, z: 40 }} />);
      frame();
      // The first frame still starts on the goal, which already follows the point.
      expect(stateRef.current).toEqual({ ...START, x: 60, z: 40 });
      expect(lastCall(camera.lookAt)).toEqual([60, 0, 40]);
    });

    it("eases to a followed point that moves", () => {
      const camera = fake.camera as FakeCamera;
      const point = { x: 0, z: 0 };
      render(
        <GroundCameraRig
          limits={LIMITS}
          stateRef={{ current: START }}
          follow={() => point}
          smoothing={0.2}
        />
      );
      frame();
      point.x = 50;
      point.z = -50;
      frame(0.2);
      const k = 1 - Math.exp(-1);
      expect(lastCall(camera.lookAt)[0]).toBeCloseTo(50 * k, 9);
      expect(lastCall(camera.lookAt)[2]).toBeCloseTo(-50 * k, 9);
    });

    it("keeps the followed point inside the bounds", () => {
      const stateRef = { current: START };
      render(<GroundCameraRig limits={LIMITS} stateRef={stateRef} follow={{ x: 900, z: -3 }} />);
      frame();
      expect(stateRef.current.x).toBe(100);
      expect(stateRef.current.z).toBe(-3);
    });

    it("leaves the controller in charge when the getter returns null", () => {
      const stateRef = { current: START };
      render(<GroundCameraRig limits={LIMITS} stateRef={stateRef} follow={() => null} />);
      frame();
      expect(stateRef.current).toBe(START);
    });

    it("leaves the controller in charge when follow is null or absent", () => {
      const stateRef = { current: START };
      const view = render(<GroundCameraRig limits={LIMITS} stateRef={stateRef} follow={null} />);
      frame();
      view.rerender(<GroundCameraRig limits={LIMITS} stateRef={stateRef} />);
      frame();
      expect(stateRef.current).toBe(START);
    });
  });

  it("frames with the canvas aspect: a landscape canvas poses differently from a portrait one", () => {
    const camera = fake.camera as FakeCamera;
    fake.size = { width: 1280, height: 720 };
    render(<GroundCameraRig limits={LIMITS} stateRef={{ current: START }} />);
    frame();
    const pose = poseFor(START, LIMITS, 1280 / 720);
    expect(lastCall(camera.position.set)).toEqual([...pose.position]);
    expect(pose.distance).not.toBe(poseFor(START, LIMITS, 390 / 844).distance);
  });

  it("does nothing before the canvas has a size", () => {
    const camera = fake.camera as FakeCamera;
    const stateRef = { current: { x: 500, z: 0, span: 80, yaw: 0 } };
    fake.size = { width: 0, height: 0 };
    render(<GroundCameraRig limits={LIMITS} stateRef={stateRef} />);
    expect(() => frame()).not.toThrow();
    fake.size = { width: 390, height: 0 };
    expect(() => frame()).not.toThrow();
    expect(camera.position.set).not.toHaveBeenCalled();
    expect(stateRef.current.x).toBe(500);
  });

  it("leaves a camera that is not perspective alone", () => {
    const camera = { isOrthographicCamera: true, position: { set: vi.fn() }, lookAt: vi.fn() };
    fake.camera = camera;
    const stateRef = { current: { x: 500, z: 0, span: 80, yaw: 0 } };
    render(<GroundCameraRig limits={LIMITS} stateRef={stateRef} />);
    expect(() => frame()).not.toThrow();
    expect(camera.position.set).not.toHaveBeenCalled();
    expect(stateRef.current.x).toBe(500);
  });

  it("drives a real three PerspectiveCamera to the pose", () => {
    const camera = new PerspectiveCamera(50, 390 / 844, 0.1, 1000);
    fake.camera = camera;
    render(<GroundCameraRig limits={LIMITS} stateRef={{ current: START }} />);
    frame();
    const pose = poseFor(clampState(START, LIMITS), LIMITS, aspect());
    expect(camera.position.x).toBeCloseTo(pose.position[0], 9);
    expect(camera.position.y).toBeCloseTo(pose.position[1], 9);
    expect(camera.position.z).toBeCloseTo(pose.position[2], 9);
    expect(camera.fov).toBeCloseTo(40, 9);
    // It looks at the target: the target is straight ahead of the camera.
    const toTarget = camera.getWorldDirection(camera.position.clone());
    const expected = [
      pose.target[0] - pose.position[0],
      pose.target[1] - pose.position[1],
      pose.target[2] - pose.position[2],
    ];
    const length = Math.hypot(...expected);
    expect(toTarget.x).toBeCloseTo((expected[0] as number) / length, 9);
    expect(toTarget.y).toBeCloseTo((expected[1] as number) / length, 9);
    expect(toTarget.z).toBeCloseTo((expected[2] as number) / length, 9);
  });
});
