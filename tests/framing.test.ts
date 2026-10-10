import { describe, expect, it } from "vitest";

import { CAMERA_FOV_DEG, frameTarget } from "../src/engine/camera";
import type { ParticleTarget } from "../src/engine/target";

const picture = (rect: { left: number; right: number; bottom: number; top: number }) =>
  ({
    count: 1,
    positions: new Float32Array([0.2, 0.1, 0.3]),
    colors: new Float32Array(3),
    seeds: new Float32Array(1),
    normals: new Float32Array(3),
    image: { pixels: { width: 1, height: 1, data: new Uint8ClampedArray(4) }, rect },
  }) as ParticleTarget;

describe("picture framing", () => {
  it("looks at the picture's own centre and fits its edges exactly", () => {
    const rect = { left: -1.02, right: 0.98, bottom: -0.49, top: 0.51 };
    const aspect = 2;
    const framing = frameTarget(picture(rect), { aspect, fit: 1, picture: true });
    expect(framing.center?.[0]).toBeCloseTo(-0.02, 6);
    expect(framing.center?.[1]).toBeCloseTo(0.01, 6);
    // At that distance the view is exactly the picture's height (and, at this aspect, its width).
    const halfView = Math.tan((CAMERA_FOV_DEG * Math.PI) / 360) * framing.distance;
    expect(halfView).toBeCloseTo(0.5, 6);
    expect(halfView * aspect).toBeCloseTo(1, 6);
  });

  it("leaves content framing as it was", () => {
    const framing = frameTarget(picture({ left: -1, right: 1, bottom: -0.5, top: 0.5 }), { aspect: 2, fit: 1 });
    expect(framing.center).toBeUndefined();
  });
});
