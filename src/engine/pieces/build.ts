import type { PieceCut } from "../effects/types";
import { matchOrder, type MatchStrategy } from "../match";
import type { ParticleTarget, TargetImage } from "../sources/types";
import { cutUnitSquare, type Cut } from "./cut";

/** Per-vertex buffers for the pieces mesh. Every piece's vertices sit next to each other. */
export type PieceGeometry = {
  vertexCount: number;
  pieceCount: number;
  srcPosition: Float32Array; // vec3
  dstPosition: Float32Array; // vec3
  srcUv: Float32Array; // vec2
  dstUv: Float32Array; // vec2
  srcCenter: Float32Array; // vec3
  dstCenter: Float32Array; // vec3
  /** seed, random, x, y — the stagger keys that don't depend on the pairing. */
  keysA: Float32Array; // vec4
  /** radial, travel, index, unused. */
  keysB: Float32Array; // vec4
};

type Rect = TargetImage["rect"];

function toWorld(rect: Rect, u: number, v: number): [number, number] {
  return [rect.left + u * (rect.right - rect.left), rect.bottom + v * (rect.top - rect.bottom)];
}

/** Mean colour of a piece from the image's sampled pixels (premultiplied, so empty reads dark). */
function pieceColor(image: TargetImage, cut: Cut, piece: number): [number, number, number] {
  const { width, height, data } = image.pixels;
  const base = piece * cut.vertsPerPiece * 2;
  let cu = 0;
  let cv = 0;
  for (let vertex = 0; vertex < cut.vertsPerPiece; vertex += 1) {
    cu += cut.uv[base + vertex * 2] ?? 0;
    cv += cut.uv[base + vertex * 2 + 1] ?? 0;
  }
  cu /= cut.vertsPerPiece;
  cv /= cut.vertsPerPiece;
  let r = 0;
  let g = 0;
  let b = 0;
  let samples = 0;
  for (let vertex = 0; vertex <= cut.vertsPerPiece; vertex += 1) {
    // The centre plus points halfway toward each vertex.
    const u = vertex === cut.vertsPerPiece ? cu : (cu + (cut.uv[base + vertex * 2] ?? 0)) / 2;
    const v = vertex === cut.vertsPerPiece ? cv : (cv + (cut.uv[base + vertex * 2 + 1] ?? 0)) / 2;
    const x = Math.min(width - 1, Math.max(0, Math.floor(u * width)));
    const y = Math.min(height - 1, Math.max(0, Math.floor((1 - v) * height)));
    const offset = (y * width + x) * 4;
    const alpha = (data[offset + 3] ?? 0) / 255;
    r += ((data[offset] ?? 0) / 255) * alpha;
    g += ((data[offset + 1] ?? 0) / 255) * alpha;
    b += ((data[offset + 2] ?? 0) / 255) * alpha;
    samples += 1;
  }
  return [r / samples, g / samples, b / samples];
}

/** Piece centres and colours as a point target, so the usual matchers can pair pieces. */
function pieceTarget(image: TargetImage, cut: Cut): { target: ParticleTarget; centers: Float32Array } {
  const centers = new Float32Array(cut.count * 3);
  const colors = new Float32Array(cut.count * 3);
  for (let piece = 0; piece < cut.count; piece += 1) {
    let u = 0;
    let v = 0;
    const base = piece * cut.vertsPerPiece * 2;
    for (let vertex = 0; vertex < cut.vertsPerPiece; vertex += 1) {
      u += cut.uv[base + vertex * 2] ?? 0;
      v += cut.uv[base + vertex * 2 + 1] ?? 0;
    }
    const [x, y] = toWorld(image.rect, u / cut.vertsPerPiece, v / cut.vertsPerPiece);
    centers[piece * 3] = x;
    centers[piece * 3 + 1] = y;
    const color = pieceColor(image, cut, piece);
    colors.set(color, piece * 3);
  }
  return {
    centers,
    target: {
      positions: centers,
      colors,
      normals: new Float32Array(cut.count * 3),
      seeds: new Float32Array(cut.count),
      count: cut.count,
    },
  };
}

function hash(value: number): number {
  const s = Math.sin(value * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/** Cut both images the same way, pair the pieces, and lay out the vertex buffers. */
export function buildPieces(
  source: TargetImage,
  destination: TargetImage,
  cut: PieceCut,
  strategy: MatchStrategy,
): PieceGeometry {
  const aspect = (a: TargetImage) => (a.rect.right - a.rect.left) / Math.max(1e-6, a.rect.top - a.rect.bottom);
  const shared = cutUnitSquare(cut, (aspect(source) + aspect(destination)) / 2, 7);
  const from = pieceTarget(source, shared);
  const to = pieceTarget(destination, shared);
  const order = matchOrder(from.target, to.target, strategy);

  const count = shared.count;
  const perPiece = shared.vertsPerPiece;
  const vertexCount = count * perPiece;
  const geometry: PieceGeometry = {
    vertexCount,
    pieceCount: count,
    srcPosition: new Float32Array(vertexCount * 3),
    dstPosition: new Float32Array(vertexCount * 3),
    srcUv: new Float32Array(vertexCount * 2),
    dstUv: new Float32Array(vertexCount * 2),
    srcCenter: new Float32Array(vertexCount * 3),
    dstCenter: new Float32Array(vertexCount * 3),
    keysA: new Float32Array(vertexCount * 4),
    keysB: new Float32Array(vertexCount * 4),
  };

  const bounds = source.rect;
  const width = Math.max(1e-6, bounds.right - bounds.left);
  const height = Math.max(1e-6, bounds.top - bounds.bottom);
  const travel = new Float32Array(count);
  let maxTravel = 1e-6;
  for (let piece = 0; piece < count; piece += 1) {
    const match = order[piece] ?? piece;
    travel[piece] = Math.hypot(
      (to.centers[match * 3] ?? 0) - (from.centers[piece * 3] ?? 0),
      (to.centers[match * 3 + 1] ?? 0) - (from.centers[piece * 3 + 1] ?? 0),
    );
    maxTravel = Math.max(maxTravel, travel[piece] ?? 0);
  }

  for (let piece = 0; piece < count; piece += 1) {
    const match = order[piece] ?? piece;
    const sx = from.centers[piece * 3] ?? 0;
    const sy = from.centers[piece * 3 + 1] ?? 0;
    const dx = to.centers[match * 3] ?? 0;
    const dy = to.centers[match * 3 + 1] ?? 0;
    const nx = (sx - bounds.left) / width;
    const ny = (bounds.top - sy) / height;
    const radial = Math.min(1, Math.hypot(nx - 0.5, ny - 0.5) / Math.SQRT1_2);
    for (let vertex = 0; vertex < perPiece; vertex += 1) {
      const at = piece * perPiece + vertex;
      const su = shared.uv[(piece * perPiece + vertex) * 2] ?? 0;
      const sv = shared.uv[(piece * perPiece + vertex) * 2 + 1] ?? 0;
      const du = shared.uv[(match * perPiece + vertex) * 2] ?? 0;
      const dv = shared.uv[(match * perPiece + vertex) * 2 + 1] ?? 0;
      const [spx, spy] = toWorld(source.rect, su, sv);
      const [dpx, dpy] = toWorld(destination.rect, du, dv);
      geometry.srcPosition.set([spx, spy, 0], at * 3);
      geometry.dstPosition.set([dpx, dpy, 0], at * 3);
      geometry.srcUv.set([su, sv], at * 2);
      geometry.dstUv.set([du, dv], at * 2);
      geometry.srcCenter.set([sx, sy, 0], at * 3);
      geometry.dstCenter.set([dx, dy, 0], at * 3);
      geometry.keysA.set([hash(piece + 0.5), hash(piece * 3.7 + 1.3), nx, ny], at * 4);
      geometry.keysB.set([radial, (travel[piece] ?? 0) / maxTravel, piece / Math.max(1, count - 1), 0], at * 4);
    }
  }
  return geometry;
}
