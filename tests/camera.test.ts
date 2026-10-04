import { describe, expect, it } from "vitest";

import { blendFraming, CAMERA_FOV_DEG, frameTarget } from "../src/engine/camera";
import type { ParticleTarget } from "../src/engine/target";

function flatRect(halfX: number, halfY: number): ParticleTarget {
  const positions = new Float32Array([-halfX, -halfY, 0, halfX, halfY, 0, halfX, -halfY, 0.1]);
  return { positions, colors: new Float32Array(9), normals: new Float32Array(9), seeds: new Float32Array(3), count: 3 };
}

/** Fraction of the view's width and height the form covers at this framing. */
function coverage(halfX: number, halfY: number, distance: number, aspect: number) {
  const visibleHalfY = Math.tan((CAMERA_FOV_DEG * Math.PI) / 360) * distance;
  return { x: halfX / (visibleHalfY * aspect), y: halfY / visibleHalfY };
}

describe("camera framing", () => {
  it("fits a wide form by width in portrait and by height when tall", () => {
    const wide = flatRect(1, 0.6);
    const portrait = frameTarget(wide, { aspect: 9 / 16, fit: 0.8 });
    const c = coverage(1, 0.6, portrait.distance, 9 / 16);
    expect(c.x).toBeLessThanOrEqual(0.81);
    expect(c.x).toBeGreaterThan(0.7);

    const tall = flatRect(0.3, 1);
    const landscape = frameTarget(tall, { aspect: 16 / 9, fit: 0.8 });
    expect(coverage(0.3, 1, landscape.distance, 16 / 9).y).toBeLessThanOrEqual(0.81);
  });

  it("sees flat forms straight on", () => {
    expect(frameTarget(flatRect(1, 1), { aspect: 1 }).direction).toEqual([0, 0, 1]);
  });

  it("respects an explicit distance", () => {
    expect(frameTarget(flatRect(1, 1), { aspect: 1, distance: 4 }).distance).toBe(4);
  });

  it("blends distance and direction", () => {
    const a = { direction: [0, 0, 1] as [number, number, number], distance: 2 };
    const b = { direction: [0, 0, 1] as [number, number, number], distance: 4 };
    expect(blendFraming(a, b, 0.5).distance).toBe(3);
  });
});
