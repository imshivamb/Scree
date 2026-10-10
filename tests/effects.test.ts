import { describe, expect, it } from "vitest";

import * as publicApi from "../src/engine";
import { BUILT_IN_EFFECT_IDS, defineEffect, getEffect, listEffects } from "../src/engine/effects";
import { buildPieces } from "../src/engine/pieces/build";
import { cutUnitSquare } from "../src/engine/pieces/cut";
import { getSurfaceShader } from "../src/engine/surface/registry";
import type { ParticleTarget, TargetImage } from "../src/engine/target";

/** Signed area of every triangle in a cut; an exact tiling covers the unit square once. */
function coveredArea(uv: Float32Array): number {
  let area = 0;
  for (let index = 0; index < uv.length; index += 6) {
    const [ax, ay, bx, by, cx, cy] = [...uv.slice(index, index + 6)] as number[];
    area += ((bx! - ax!) * (cy! - ay!) - (cx! - ax!) * (by! - ay!)) / 2;
  }
  return area;
}

function image(width: number, height: number, paint: (x: number, y: number) => [number, number, number]): TargetImage {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const [r, g, b] = paint(x, y);
      data.set([r, g, b, 255], (y * width + x) * 4);
    }
  }
  return { pixels: { width, height, data }, rect: { left: -1, right: 1, bottom: -0.6, top: 0.6 } };
}

describe("effect registry", () => {
  it("ships the built-in library, every effect complete", () => {
    expect(BUILT_IN_EFFECT_IDS.length).toBeGreaterThanOrEqual(19);
    for (const effect of listEffects()) {
      expect(effect[effect.family]).toBeDefined();
      if (effect.surface) expect(getSurfaceShader(effect.surface.shader)).toBeDefined();
    }
    expect(getEffect("pieces")?.family).toBe("pieces");
    expect(getEffect("peel")?.family).toBe("surface");
    expect(getEffect("gooey")?.particles?.style).toEqual({ id: "goo", cell: 6 });
  });

  it("refuses an effect without settings for its family", () => {
    expect(() =>
      defineEffect({ id: "broken", label: "", description: "", family: "pieces", durationSeconds: 1 }),
    ).toThrow(/no "pieces" settings/);
  });

  it("is public", () => {
    expect(publicApi).toHaveProperty("listEffects");
    expect(publicApi).toHaveProperty("registerEffect");
    expect(publicApi).not.toHaveProperty("PiecesRenderer");
  });
});

describe("warming a pair", () => {
  const target = (picture: TargetImage) =>
    ({ count: 0, image: picture, positions: new Float32Array(0), colors: new Float32Array(0) }) as unknown as ParticleTarget;

  it("cuts the pieces ahead of time, so showing the pair reuses them", async () => {
    const { PiecesRenderer } = await import("../src/engine/pieces/renderer");
    const first = image(32, 20, (x) => (x < 16 ? [200, 40, 40] : [40, 40, 200]));
    const second = image(32, 20, (x) => (x < 16 ? [40, 40, 200] : [200, 40, 40]));
    const field = { source: target(first), destination: target(second) };

    const warmed = new PiecesRenderer({ size: 1, opacity: 1 });
    expect(warmed.warm(field)).toEqual([first, second]);
    warmed.setField(field);

    // A second renderer asking for the same pair gets the very same cut, not a new one.
    const other = new PiecesRenderer({ size: 1, opacity: 1 });
    other.setField(field);
    expect(other.object.geometry.getAttribute("position").array).toBe(
      warmed.object.geometry.getAttribute("position").array,
    );
  });

  it("is public on the engine", () => {
    expect(typeof publicApi.Scree.prototype.warm).toBe("function");
  });
});

describe("piece cuts", () => {
  it("tile the image exactly, with counter-clockwise triangles", () => {
    const cuts = [
      cutUnitSquare({ kind: "grid", density: 300 }, 1.6),
      cutUnitSquare({ kind: "grid", columns: 1, rows: 16 }, 1.6),
      cutUnitSquare({ kind: "triangles", density: 500, jitter: 0.45 }, 1.6),
      cutUnitSquare({ kind: "triangles", columns: 4, rows: 3 }, 1),
    ];
    for (const cut of cuts) {
      expect(coveredArea(cut.uv)).toBeCloseTo(1, 5);
      for (let index = 0; index < cut.uv.length; index += 6) {
        expect(coveredArea(cut.uv.slice(index, index + 6))).toBeGreaterThan(0);
      }
    }
  });

  it("shapes the grid to the aspect", () => {
    const wide = cutUnitSquare({ kind: "grid", density: 400 }, 2);
    expect(wide.columns).toBeGreaterThan(wide.rows);
  });
});

describe("piece pairing", () => {
  it("sends a coloured block to where it moved", () => {
    const block = (left: number) => image(64, 40, (x, y) => (x >= left && x < left + 16 && y >= 12 && y < 28 ? [40, 90, 230] : [235, 235, 235]));
    const pieces = buildPieces(block(4), block(44), { kind: "grid", columns: 16, rows: 10 }, "transport");
    // Pieces starting on the left block (x < -0.5) should mostly end on the right block (x > 0.3).
    let onBlock = 0;
    let arrived = 0;
    for (let vertex = 0; vertex < pieces.vertexCount; vertex += 6) {
      const sx = pieces.srcCenter[vertex * 3] ?? 0;
      const sy = pieces.srcCenter[vertex * 3 + 1] ?? 0;
      if (sx > -0.85 && sx < -0.45 && Math.abs(sy) < 0.2) {
        onBlock += 1;
        if ((pieces.dstCenter[vertex * 3] ?? 0) > 0.3) arrived += 1;
      }
    }
    expect(onBlock).toBeGreaterThan(4);
    expect(arrived / onBlock).toBeGreaterThan(0.7);
  });

  it("keeps a marked group together, whatever the strategy", () => {
    const block = (left: number) =>
      image(64, 40, (x, y) => (x >= left && x < left + 16 && y >= 12 && y < 28 ? [40, 90, 230] : [235, 235, 235]));
    const group = (left: number) => ({ id: "card", u0: left / 64, u1: (left + 16) / 64, v0: 1 - 28 / 40, v1: 1 - 12 / 40 });
    const from = { ...block(4), groups: [group(4)] };
    const to = { ...block(44), groups: [group(44)] };
    const cut = { kind: "grid", columns: 16, rows: 10 } as const;

    const pieces = buildPieces(from, to, cut, "random");
    let inGroup = 0;
    let together = 0;
    let ordered = 0;
    for (let vertex = 0; vertex < pieces.vertexCount; vertex += 6) {
      const sx = pieces.srcCenter[vertex * 3] ?? 0;
      const sy = pieces.srcCenter[vertex * 3 + 1] ?? 0;
      const dx = pieces.dstCenter[vertex * 3] ?? 0;
      if (sx > -0.85 && sx < -0.45 && Math.abs(sy) < 0.2) {
        inGroup += 1;
        if (dx > 0.3) together += 1;
        // The left edge of the block stays the left edge.
        if (sx < -0.7 && dx < 0.5) ordered += 1;
      }
    }
    expect(inGroup).toBeGreaterThan(4);
    expect(together / inGroup).toBeGreaterThan(0.95);
    expect(ordered).toBeGreaterThan(0);

    // Still a one-to-one pairing: every destination piece is used once.
    const used = new Set<string>();
    for (let vertex = 0; vertex < pieces.vertexCount; vertex += 6) {
      used.add(`${pieces.dstCenter[vertex * 3]},${pieces.dstCenter[vertex * 3 + 1]}`);
    }
    expect(used.size).toBe(pieces.pieceCount);
  });

  it("covers the source rect exactly at rest", () => {
    const flat = image(32, 20, () => [200, 200, 200]);
    const pieces = buildPieces(flat, flat, { kind: "triangles", density: 200, jitter: 0.4 }, "spatial");
    let area = 0;
    for (let index = 0; index < pieces.vertexCount * 3; index += 9) {
      const [ax, ay, , bx, by, , cx, cy] = [...pieces.srcPosition.slice(index, index + 9)] as number[];
      area += Math.abs(((bx! - ax!) * (cy! - ay!) - (cx! - ax!) * (by! - ay!)) / 2);
    }
    expect(area).toBeCloseTo(2 * 1.2, 4);
  });
});
