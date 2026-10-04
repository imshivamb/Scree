import { describe, expect, it } from "vitest";

import { isMatchStrategy, MatchCache, matchTargets, MATCH_STRATEGIES } from "../src/engine/match";
import { buildParticleTarget, type ParticleTarget, type PixelSource } from "../src/engine/target";

type Rgb = [number, number, number];

/** An opaque "screenshot": grey page with a coloured block at `left`. */
function screenshot(left: number, block: Rgb = [40, 90, 230]): PixelSource {
  const width = 96;
  const height = 48;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const inBlock = x >= left && x < left + 24 && y >= 12 && y < 36;
      const color = inBlock ? block : ([235, 235, 235] as Rgb);
      data[offset] = color[0];
      data[offset + 1] = color[1];
      data[offset + 2] = color[2];
      data[offset + 3] = 255;
    }
  }
  return { width, height, data };
}

/** A transparent canvas with a filled white square at `left`. */
function silhouette(left: number): PixelSource {
  const width = 64;
  const height = 32;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 4; y < 28; y += 1) {
    for (let x = left; x < left + 24; x += 1) {
      const offset = (y * width + x) * 4;
      data.fill(220, offset, offset + 3);
      data[offset + 3] = 255;
    }
  }
  return { width, height, data };
}

const options = { particleCount: 4_096, alphaThreshold: 20, depth: 0, jitter: 0 };

function meanTravel(a: ParticleTarget, b: ParticleTarget): number {
  let sum = 0;
  for (let index = 0; index < a.count; index += 1) {
    const o = index * 3;
    sum += Math.hypot(
      (b.positions[o] ?? 0) - (a.positions[o] ?? 0),
      (b.positions[o + 1] ?? 0) - (a.positions[o + 1] ?? 0),
    );
  }
  return sum / a.count;
}

/** Share of source points on the block that land on the block in the destination. */
function blockKept(a: ParticleTarget, b: ParticleTarget): number {
  let onBlock = 0;
  let kept = 0;
  for (let index = 0; index < a.count; index += 1) {
    const isBlock = (colors: Float32Array) => (colors[index * 3 + 2] ?? 0) > 0.8 && (colors[index * 3] ?? 0) < 0.3;
    if (!isBlock(a.colors)) continue;
    onBlock += 1;
    if (isBlock(b.colors)) kept += 1;
  }
  return kept / Math.max(onBlock, 1);
}

describe("match strategies", () => {
  it("lists transport, spatial, random", () => {
    expect(MATCH_STRATEGIES).toEqual(["transport", "spatial", "random"]);
    expect(isMatchStrategy("transport")).toBe(true);
    expect(isMatchStrategy("hilbert")).toBe(false);
  });

  it("spatial and transport travel far less than random on a shifted silhouette", () => {
    const a = buildParticleTarget(silhouette(4), { ...options, seed: 1 });
    const b = buildParticleTarget(silhouette(36), { ...options, seed: 2 });
    const random = meanTravel(a, matchTargets(a, b, "random"));
    const spatial = meanTravel(a, matchTargets(a, b, "spatial"));
    const transport = meanTravel(a, matchTargets(a, b, "transport"));

    expect(spatial).toBeLessThan(random * 0.3);
    expect(transport).toBeLessThan(random * 0.3);
  });

  it("transport carries a moved UI block to its new place; spatial does not", () => {
    const before = buildParticleTarget(screenshot(8), { ...options, seed: 1 });
    const after = buildParticleTarget(screenshot(64), { ...options, seed: 2 });

    const spatial = blockKept(before, matchTargets(before, after, "spatial"));
    const transport = blockKept(before, matchTargets(before, after, "transport"));

    expect(spatial).toBeLessThan(0.2);
    expect(transport).toBeGreaterThan(0.85);
  });

  it("returns a reordering of the destination, never new points", () => {
    const a = buildParticleTarget(screenshot(8), { ...options, seed: 1 });
    const b = buildParticleTarget(screenshot(64), { ...options, seed: 2 });
    for (const strategy of MATCH_STRATEGIES) {
      const matched = matchTargets(a, b, strategy);
      const tidy = (values: Float32Array) => [...values].map((value) => value + 0).sort();
      expect(tidy(matched.positions)).toEqual(tidy(b.positions));
    }
  });

  it("is deterministic", () => {
    const a = buildParticleTarget(screenshot(8), { ...options, seed: 1 });
    const b = buildParticleTarget(screenshot(64), { ...options, seed: 2 });
    expect(matchTargets(a, b, "transport")).toEqual(matchTargets(a, b, "transport"));
  });

  it("caches pairings", () => {
    const a = buildParticleTarget(silhouette(4), { ...options, seed: 1 });
    const b = buildParticleTarget(silhouette(36), { ...options, seed: 2 });
    const cache = new MatchCache();
    expect(cache.get(a, b, "transport")).toBe(cache.get(a, b, "transport"));
    expect(cache.get(a, a, "transport")).toBe(a);
  });

  it("matches 16k points fast enough for a click", () => {
    const big = { ...options, particleCount: 16_384 };
    const a = buildParticleTarget(screenshot(8), { ...big, seed: 1 });
    const b = buildParticleTarget(screenshot(64), { ...big, seed: 2 });
    const start = performance.now();
    matchTargets(a, b, "transport");
    const elapsed = performance.now() - start;
    console.info(`transport 16k: ${elapsed.toFixed(0)} ms`);
    expect(elapsed).toBeLessThan(1_500);
  });
});
