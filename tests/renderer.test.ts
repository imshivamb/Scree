import { describe, expect, it } from "vitest";

import { FIELD_SAMPLE_GLSL } from "../src/engine/field-motion";
import {
  BEHAVIOR_IDS,
  isBehaviorId,
} from "../src/engine/types";
import {
  isRendererId,
  RENDERER_IDS,
  resolveRendererSize,
} from "../src/engine/renderers";
import {
  POINT_KEEP_RATIO,
  SPRITE_DRAW_BUDGET,
  thinField,
} from "../src/engine/renderers/instanced-field";

describe("renderers", () => {
  it("exposes the point skins and the pixel effect families", () => {
    expect(RENDERER_IDS).toEqual(["points", "sprites", "shards", "pieces", "surface"]);
  });

  it("accepts only known renderer ids", () => {
    expect(isRendererId("points")).toBe(true);
    expect(isRendererId("sprites")).toBe(true);
    expect(isRendererId("shards")).toBe(true);
    expect(isRendererId("ribbons")).toBe(false);
  });

  it("keeps morph math in one shared field sample", () => {
    expect(FIELD_SAMPLE_GLSL).toContain("FieldSample sampleField");
    expect(FIELD_SAMPLE_GLSL).toContain("uBehaviorWeightsA");
    expect(FIELD_SAMPLE_GLSL).toContain("composeInfluences");
    expect(FIELD_SAMPLE_GLSL).toContain("pointerInfluence");
    expect(FIELD_SAMPLE_GLSL).not.toContain("gl_PointSize");
    expect(FIELD_SAMPLE_GLSL).not.toContain("InstancedBuffer");
  });

  it("exposes the six motion behaviors", () => {
    expect(BEHAVIOR_IDS).toEqual([
      "settle",
      "expand",
      "scatter",
      "implode",
      "turbulence",
      "orbit",
    ]);
    expect(isBehaviorId("orbit")).toBe(true);
    expect(isBehaviorId("swirl")).toBe(false);
  });

  it("keeps sprite and shard size tied to the point look, not the draw count", () => {
    const base = {
      viewportWidth: 900,
      viewportHeight: 900,
      pointBaseSize: 2.9,
      sizeMultiplier: 1,
    };

    const sprites = resolveRendererSize({
      ...base,
      id: "sprites",
      particleCount: 4_096,
    });
    const shards = resolveRendererSize({
      ...base,
      id: "shards",
      particleCount: 4_096,
    });

    expect(sprites).toBeCloseTo(
      resolveRendererSize({ ...base, id: "sprites", particleCount: 65_536 }),
    );
    expect(shards).toBeCloseTo(
      resolveRendererSize({ ...base, id: "shards", particleCount: 65_536 }),
    );
    expect(
      resolveRendererSize({ ...base, id: "points", particleCount: 16_384 }),
    ).toBeCloseTo(2.9);
    // World units: slightly larger than the ~2 CSS-px point, not stamp-sized.
    expect(sprites).toBeGreaterThan(0.005);
    expect(sprites).toBeLessThan(0.012);
    expect(shards).toBeGreaterThan(sprites);
    expect(shards).toBeLessThan(0.014);
  });

  it("thins dense fields so sprites do not draw every particle", () => {
    const count = 20_000;
    const field = {
      source: {
        positions: new Float32Array(count * 3),
        colors: new Float32Array(count * 3),
        seeds: new Float32Array(count).map((_, index) => index / count),
        normals: new Float32Array(count * 3),
        count,
      },
      destination: {
        positions: new Float32Array(count * 3),
        colors: new Float32Array(count * 3),
        seeds: new Float32Array(count),
        normals: new Float32Array(count * 3),
        count,
      },
    };

    const thinned = thinField(field, SPRITE_DRAW_BUDGET);
    expect(thinned.source.seeds.length).toBe(SPRITE_DRAW_BUDGET);
    expect(thinned.source.seeds.length).toBeLessThan(count);
  });

  it("thins points only slightly and keeps them denser than sprites", () => {
    const count = 16_384;
    expect(Math.floor(count * POINT_KEEP_RATIO)).toBe(15_073);
    expect(Math.floor(count * POINT_KEEP_RATIO)).toBeGreaterThan(
      SPRITE_DRAW_BUDGET,
    );
  });
});

describe("renderer culling", () => {
  it("never frustum-culls the field (the shader moves the points)", async () => {
    const { createParticleRenderer } = await import("../src/engine/renderers/create-renderer");
    const look = {
      expansionStrength: 0.5,
      turbulenceStrength: 0.5,
      synchronization: 0.7,
      particleSize: 3,
      glow: 0.4,
      behaviorMix: { settle: 0, expand: 1, scatter: 0, implode: 0, turbulence: 0, orbit: 0 },
      behaviorStrength: 1,
      pointer: { x: 0, y: 0, radius: 0.7, strength: 0.7, mode: "off" as const },
    };
    for (const id of ["points", "sprites", "shards"] as const) {
      const renderer = createParticleRenderer(id, look, { size: 1, opacity: 1 }, 1);
      expect(renderer.object.frustumCulled).toBe(false);
      renderer.dispose();
    }
  });
});
