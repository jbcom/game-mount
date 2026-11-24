import { Matrix4, OrthographicCamera, PerspectiveCamera, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import {
  type AnchorView,
  projectAnchor,
  type Vec3,
  type Viewport,
} from "../../src/camera/index.js";

const VIEWPORT: Viewport = { width: 400, height: 800 };

/**
 * A real three.js camera at the origin looking down -z, 90 degrees tall, is the oracle: its own
 * `Vector3.project` gives the expected pixel, so the module's matrix handling cannot hide behind the
 * same mistake in the test.
 */
function perspective(viewport: Viewport = VIEWPORT, eye: Vec3 = [0, 0, 0]): PerspectiveCamera {
  const camera = new PerspectiveCamera(90, viewport.width / viewport.height, 0.1, 1000);
  camera.position.set(...eye);
  camera.updateMatrixWorld(true);
  camera.updateProjectionMatrix();
  return camera;
}

function viewOf(camera: PerspectiveCamera | OrthographicCamera): AnchorView {
  const viewProjection = new Matrix4().multiplyMatrices(
    camera.projectionMatrix,
    camera.matrixWorldInverse
  );
  const eye = new Vector3().setFromMatrixPosition(camera.matrixWorld);
  return { viewProjection: viewProjection.elements, eye: [eye.x, eye.y, eye.z] };
}

function pixelOf(camera: PerspectiveCamera | OrthographicCamera, viewport: Viewport, point: Vec3) {
  const ndc = new Vector3(...point).project(camera);
  return { x: ((ndc.x + 1) / 2) * viewport.width, y: ((1 - ndc.y) / 2) * viewport.height };
}

describe("projectAnchor", () => {
  it("puts a point straight ahead at the centre of the viewport, inside", () => {
    const projection = projectAnchor([0, 0, -10], viewOf(perspective()), VIEWPORT);
    expect(projection.x).toBeCloseTo(200, 9);
    expect(projection.y).toBeCloseTo(400, 9);
    expect(projection.distance).toBeCloseTo(10, 12);
    expect(projection.inFront).toBe(true);
    expect(projection.inside).toBe(true);
    expect(projection.edge.x).toBe(projection.x);
    expect(projection.edge.y).toBe(projection.y);
  });

  it("agrees with three's own projection over a spread of points and eyes", () => {
    const eyes: Vec3[] = [
      [0, 0, 0],
      [3, 12, 5],
      [-40, 2, 90],
    ];
    const points: Vec3[] = [
      [1, 2, -10],
      [-4, 0.5, -30],
      [6, -3, -80],
      [0, 8, -300],
    ];
    for (const eye of eyes) {
      const camera = perspective(VIEWPORT, eye);
      const view = viewOf(camera);
      for (const point of points) {
        const world: Vec3 = [point[0] + eye[0], point[1] + eye[1], point[2] + eye[2]];
        const got = projectAnchor(world, view, VIEWPORT);
        const want = pixelOf(camera, VIEWPORT, world);
        expect(got.x).toBeCloseTo(want.x, 6);
        expect(got.y).toBeCloseTo(want.y, 6);
        expect(got.distance).toBeCloseTo(Math.hypot(...point), 9);
      }
    }
  });

  it("agrees with three's projection for an orthographic camera", () => {
    const camera = new OrthographicCamera(-20, 20, 40, -40, 0.1, 100);
    camera.position.set(0, 0, 10);
    camera.updateMatrixWorld(true);
    camera.updateProjectionMatrix();
    const point: Vec3 = [5, -10, -3];
    const got = projectAnchor(point, viewOf(camera), VIEWPORT);
    const want = pixelOf(camera, VIEWPORT, point);
    expect(got.x).toBeCloseTo(want.x, 9);
    expect(got.y).toBeCloseTo(want.y, 9);
    expect(got.inFront).toBe(true);
  });

  it("keeps a constant meaning for the pixel: the same point twice gives the same result", () => {
    const view = viewOf(perspective());
    expect(projectAnchor([2, 1, -9], view, VIEWPORT)).toEqual(
      projectAnchor([2, 1, -9], view, VIEWPORT)
    );
  });

  describe("off-screen indicators", () => {
    const view = viewOf(perspective());

    it("clamps a point past the right edge to the right border, pointing right", () => {
      const projection = projectAnchor([40, 0, -10], view, VIEWPORT);
      expect(projection.inside).toBe(false);
      expect(projection.inFront).toBe(true);
      expect(projection.edge.x).toBeCloseTo(400, 9);
      expect(projection.edge.y).toBeCloseTo(400, 9);
      expect(projection.edge.angle).toBeCloseTo(0, 9);
      // The true projected position is still reported.
      expect(projection.x).toBeGreaterThan(400);
    });

    it("clamps left, above and below the same way, with the matching angle", () => {
      const left = projectAnchor([-40, 0, -10], view, VIEWPORT);
      expect(left.edge.x).toBeCloseTo(0, 9);
      expect(Math.abs(left.edge.angle)).toBeCloseTo(Math.PI, 9);

      const above = projectAnchor([0, 90, -10], view, VIEWPORT);
      expect(above.edge.x).toBeCloseTo(200, 9);
      expect(above.edge.y).toBeCloseTo(0, 9);
      expect(above.edge.angle).toBeCloseTo(-Math.PI / 2, 9);

      const below = projectAnchor([0, -90, -10], view, VIEWPORT);
      expect(below.edge.y).toBeCloseTo(800, 9);
      expect(below.edge.angle).toBeCloseTo(Math.PI / 2, 9);
    });

    it("places the indicator on the ray from the centre to the point, inside the viewport", () => {
      const projection = projectAnchor([30, 25, -10], view, VIEWPORT);
      expect(projection.inside).toBe(false);
      const toPoint = { x: projection.x - 200, y: projection.y - 400 };
      const toEdge = { x: projection.edge.x - 200, y: projection.edge.y - 400 };
      // Collinear with the centre and pointing the same way.
      expect(toPoint.x * toEdge.y - toPoint.y * toEdge.x).toBeCloseTo(0, 6);
      expect(toPoint.x * toEdge.x + toPoint.y * toEdge.y).toBeGreaterThan(0);
      const onBorder =
        Math.abs(projection.edge.x - 200) > 199.999 || Math.abs(projection.edge.y - 400) > 399.999;
      expect(onBorder).toBe(true);
      expect(projection.edge.x).toBeGreaterThanOrEqual(0);
      expect(projection.edge.x).toBeLessThanOrEqual(400);
      expect(projection.edge.y).toBeGreaterThanOrEqual(0);
      expect(projection.edge.y).toBeLessThanOrEqual(800);
    });

    it("treats the border itself as inside", () => {
      // An orthographic view 40 wide puts x = 20 exactly on the right edge, in exact arithmetic.
      const camera = new OrthographicCamera(-20, 20, 40, -40, 0.1, 100);
      camera.position.set(0, 0, 10);
      camera.updateMatrixWorld(true);
      camera.updateProjectionMatrix();
      const ortho = viewOf(camera);
      const on = projectAnchor([20, 0, -3], ortho, VIEWPORT);
      expect(on.x).toBe(400);
      expect(on.inside).toBe(true);
      expect(projectAnchor([20.01, 0, -3], ortho, VIEWPORT).inside).toBe(false);
      // An inset moves the border: the same point is now past it.
      expect(projectAnchor([20, 0, -3], ortho, VIEWPORT, { right: 1 }).inside).toBe(false);
      expect(projectAnchor([19.9, 0, -3], ortho, VIEWPORT, { right: 1 }).inside).toBe(true);
    });
  });

  describe("behind the camera", () => {
    const view = viewOf(perspective());

    it("points toward the side the point is on, not the mirrored one", () => {
      // Behind and to the right: turning right reaches it, so the arrow points right, not left.
      const right = projectAnchor([10, 0, 10], view, VIEWPORT);
      expect(right.inFront).toBe(false);
      expect(right.inside).toBe(false);
      expect(right.edge.angle).toBeCloseTo(0, 9);
      expect(right.edge.x).toBeCloseTo(400, 9);

      const left = projectAnchor([-10, 0, 10], view, VIEWPORT);
      expect(Math.abs(left.edge.angle)).toBeCloseTo(Math.PI, 9);
      expect(left.edge.x).toBeCloseTo(0, 9);

      const above = projectAnchor([0, 10, 10], view, VIEWPORT);
      expect(above.edge.angle).toBeCloseTo(-Math.PI / 2, 9);
      expect(above.edge.y).toBeCloseTo(0, 9);
    });

    it("points down for a point straight behind", () => {
      const projection = projectAnchor([0, 0, 10], view, VIEWPORT);
      expect(projection.inFront).toBe(false);
      expect(projection.edge.angle).toBeCloseTo(Math.PI / 2, 9);
      expect(projection.edge.x).toBeCloseTo(200, 9);
      expect(projection.edge.y).toBeCloseTo(800, 9);
    });

    it("reports x and y as the edge position, since the projected spot means nothing", () => {
      const projection = projectAnchor([10, 3, 10], view, VIEWPORT);
      expect(projection.x).toBe(projection.edge.x);
      expect(projection.y).toBe(projection.edge.y);
    });

    it("keeps the distance of a point behind the eye", () => {
      expect(projectAnchor([0, 0, 25], view, VIEWPORT).distance).toBeCloseTo(25, 12);
    });
  });

  describe("insets", () => {
    const view = viewOf(perspective());

    it("moves the border in on the sides that have furniture", () => {
      const insets = { top: 120, bottom: 160, left: 10, right: 30 };
      const right = projectAnchor([40, 0, -10], view, VIEWPORT, insets);
      expect(right.edge.x).toBeCloseTo(370, 9);
      const below = projectAnchor([0, -90, -10], view, VIEWPORT, insets);
      expect(below.edge.y).toBeCloseTo(640, 9);
      const above = projectAnchor([0, 90, -10], view, VIEWPORT, insets);
      expect(above.edge.y).toBeCloseTo(120, 9);
      const left = projectAnchor([-40, 0, -10], view, VIEWPORT, insets);
      expect(left.edge.x).toBeCloseTo(10, 9);
    });

    it("treats a point on screen but under furniture as outside, with an indicator on its border", () => {
      // y is 0 of 800 at the top edge; with a 120 px top inset this point is under the bar.
      const point: Vec3 = [0, 6, -10];
      const bare = projectAnchor(point, view, VIEWPORT);
      expect(bare.inside).toBe(true);
      const covered = projectAnchor(point, view, VIEWPORT, { top: 400 });
      expect(covered.inside).toBe(false);
      expect(covered.inFront).toBe(true);
      expect(covered.edge.y).toBeCloseTo(400, 9);
    });

    it("takes one number for every side", () => {
      const projection = projectAnchor([40, 0, -10], view, VIEWPORT, 16);
      expect(projection.edge.x).toBeCloseTo(384, 9);
      const above = projectAnchor([0, 90, -10], view, VIEWPORT, 16);
      expect(above.edge.y).toBeCloseTo(16, 9);
    });

    it("puts every indicator at the centre of an inset rectangle with no size", () => {
      const projection = projectAnchor([40, 5, -10], view, VIEWPORT, { left: 300, right: 300 });
      expect(projection.inside).toBe(false);
      expect(projection.edge.x).toBe(300);
      expect(projection.edge.y).toBeCloseTo(400, 9);
      const behind = projectAnchor([0, 0, 10], view, VIEWPORT, { left: 300, right: 300 });
      expect(Number.isFinite(behind.edge.x)).toBe(true);
    });

    it("has no ray to walk for a point exactly at the centre of an empty rectangle", () => {
      const empty = { left: 250, right: 250 };
      // The rectangle collapses to x = 250; this point projects to (250, 400), exactly on it.
      const projection = projectAnchor([1.25, 0, -10], view, VIEWPORT, empty);
      expect(projection.x).toBeCloseTo(250, 9);
      expect(projection.inside).toBe(false);
      expect(projection.edge.x).toBeCloseTo(250, 9);
      expect(projection.edge.y).toBeCloseTo(400, 9);
    });
  });

  describe("validation", () => {
    const view = viewOf(perspective());

    it("rejects a viewport that is not positive and finite", () => {
      for (const bad of [
        { width: 0, height: 100 },
        { width: 100, height: -1 },
        { width: Number.NaN, height: 100 },
        { width: 100, height: Number.POSITIVE_INFINITY },
      ]) {
        expect(() => projectAnchor([0, 0, -1], view, bad)).toThrow(RangeError);
      }
    });

    it("rejects an inset that is negative or not finite", () => {
      expect(() => projectAnchor([0, 0, -1], view, VIEWPORT, -1)).toThrow(RangeError);
      expect(() => projectAnchor([0, 0, -1], view, VIEWPORT, { top: Number.NaN })).toThrow(
        RangeError
      );
      expect(() => projectAnchor([0, 0, -1], view, VIEWPORT, { left: 1, bottom: -2 })).toThrow(
        /bottom/
      );
      expect(() =>
        projectAnchor([0, 0, -1], view, VIEWPORT, { right: Number.POSITIVE_INFINITY })
      ).toThrow(/right/);
    });
  });
});
