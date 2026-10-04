import { mulberry32 } from "../sources/rng";
import type { PieceCut } from "../effects/types";

/**
 * A cut of the unit square (u right, v up) into pieces that tile it exactly.
 * Every piece has the same number of vertices, listed as counter-clockwise triangles.
 */
export type Cut = {
  count: number;
  vertsPerPiece: number;
  /** uv per vertex, `count * vertsPerPiece * 2`. */
  uv: Float32Array;
  columns: number;
  rows: number;
};

/** Grid size for a cut, shaped to the aspect (width / height) when only a density is given. */
export function gridFor(cut: PieceCut, aspect: number): { columns: number; rows: number } {
  if (cut.columns && cut.rows) return { columns: cut.columns, rows: cut.rows };
  const density = Math.max(1, cut.density ?? 600);
  const cellsPerPiece = cut.kind === "triangles" ? 2 : 1;
  const cells = density / cellsPerPiece;
  if (cut.columns) return { columns: cut.columns, rows: Math.max(1, Math.round(cells / cut.columns)) };
  if (cut.rows) return { columns: Math.max(1, Math.round(cells / cut.rows)), rows: cut.rows };
  const columns = Math.max(1, Math.round(Math.sqrt(cells * Math.max(aspect, 0.05))));
  return { columns, rows: Math.max(1, Math.round(cells / columns)) };
}

/** Corner grid with inner corners jittered; corners are shared, so the tiling has no gaps. */
function corners(columns: number, rows: number, jitter: number, seed: number): Float32Array {
  const random = mulberry32(seed);
  const points = new Float32Array((columns + 1) * (rows + 1) * 2);
  for (let y = 0; y <= rows; y += 1) {
    for (let x = 0; x <= columns; x += 1) {
      const inner = x > 0 && x < columns && y > 0 && y < rows;
      const offset = (y * (columns + 1) + x) * 2;
      points[offset] = (x + (inner ? (random() - 0.5) * 2 * jitter : 0)) / columns;
      points[offset + 1] = (y + (inner ? (random() - 0.5) * 2 * jitter : 0)) / rows;
    }
  }
  return points;
}

export function cutUnitSquare(cut: PieceCut, aspect: number, seed = 1): Cut {
  const { columns, rows } = gridFor(cut, aspect);
  // Beyond ~0.28 a jittered corner can cross a diagonal and turn a triangle inside out.
  const jitter = Math.min(0.28, Math.max(0, cut.jitter ?? 0));
  const grid = corners(columns, rows, jitter, seed);
  const at = (x: number, y: number): [number, number] => {
    const offset = (y * (columns + 1) + x) * 2;
    return [grid[offset] ?? 0, grid[offset + 1] ?? 0];
  };
  const random = mulberry32(seed + 17);

  if (cut.kind === "grid") {
    const uv = new Float32Array(columns * rows * 12);
    let write = 0;
    for (let y = 0; y < rows; y += 1) {
      for (let x = 0; x < columns; x += 1) {
        const a = at(x, y);
        const b = at(x + 1, y);
        const c = at(x + 1, y + 1);
        const d = at(x, y + 1);
        for (const point of [a, b, c, a, c, d]) {
          uv[write++] = point[0];
          uv[write++] = point[1];
        }
      }
    }
    return { count: columns * rows, vertsPerPiece: 6, uv, columns, rows };
  }

  const uv = new Float32Array(columns * rows * 2 * 6);
  let write = 0;
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < columns; x += 1) {
      const a = at(x, y);
      const b = at(x + 1, y);
      const c = at(x + 1, y + 1);
      const d = at(x, y + 1);
      // Alternate the diagonal (seeded) so shards don't all lean one way.
      const triangles = random() < 0.5 ? [[a, b, c], [a, c, d]] : [[a, b, d], [b, c, d]];
      for (const triangle of triangles) {
        for (const point of triangle) {
          uv[write++] = point[0];
          uv[write++] = point[1];
        }
      }
    }
  }
  return { count: columns * rows * 2, vertsPerPiece: 3, uv, columns, rows };
}
