import { canonicalOrder, permuteTarget } from "./order";
import { mulberry32 } from "./rng";
import type { ParticleTarget, TargetImage } from "./types";

export function normalizePositions(
  positions: Float32Array,
  maxExtent = 2,
): void {
  if (positions.length < 3) return;

  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;

  for (let index = 0; index < positions.length; index += 3) {
    const x = positions[index] ?? 0;
    const y = positions[index + 1] ?? 0;
    const z = positions[index + 2] ?? 0;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    minZ = Math.min(minZ, z);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
    maxZ = Math.max(maxZ, z);
  }

  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const centerZ = (minZ + maxZ) / 2;
  const span = Math.max(maxX - minX, maxY - minY, maxZ - minZ, 1e-6);
  const scale = maxExtent / span;

  for (let index = 0; index < positions.length; index += 3) {
    positions[index] = ((positions[index] ?? 0) - centerX) * scale;
    positions[index + 1] = ((positions[index + 1] ?? 0) - centerY) * scale;
    positions[index + 2] = ((positions[index + 2] ?? 0) - centerZ) * scale;
  }
}

export function flatNormals(count: number): Float32Array {
  const normals = new Float32Array(count * 3);
  for (let index = 0; index < count; index += 1) {
    normals[index * 3 + 2] = 1;
  }
  return normals;
}

export function fillSeeds(count: number, seed: number): Float32Array {
  const random = mulberry32(seed);
  const seeds = new Float32Array(count);
  for (let index = 0; index < count; index += 1) {
    seeds[index] = random();
  }
  return seeds;
}

export function fillColor(
  count: number,
  color: [number, number, number] = [0.92, 0.95, 0.98],
): Float32Array {
  const colors = new Float32Array(count * 3);
  for (let index = 0; index < count; index += 1) {
    const offset = index * 3;
    colors[offset] = color[0];
    colors[offset + 1] = color[1];
    colors[offset + 2] = color[2];
  }
  return colors;
}

export function finalizeTarget(input: {
  positions: Float32Array;
  colors?: Float32Array;
  seeds?: Float32Array;
  normals?: Float32Array;
  groupIds?: Uint16Array;
  image?: TargetImage;
  seed?: number;
  normalize?: boolean;
  maxExtent?: number;
  /** "spatial" (default) sorts along a Hilbert curve; "sampled" keeps input order. */
  order?: "spatial" | "sampled";
}): ParticleTarget {
  if (input.positions.length % 3 !== 0 || input.positions.length === 0) {
    throw new Error("Particle target positions must be a non-empty xyz buffer");
  }

  const count = input.positions.length / 3;
  if (input.normalize !== false) {
    normalizePositions(input.positions, input.maxExtent ?? 2);
  }

  const colors = input.colors ?? fillColor(count);
  const seeds = input.seeds ?? fillSeeds(count, input.seed ?? 1);
  const normals = input.normals ?? flatNormals(count);

  if (colors.length !== count * 3) {
    throw new Error("Particle target colors must match the particle count");
  }
  if (seeds.length !== count) {
    throw new Error("Particle target seeds must match the particle count");
  }
  if (normals.length !== count * 3) {
    throw new Error("Particle target normals must match the particle count");
  }
  if (input.groupIds && input.groupIds.length !== count) {
    throw new Error("Particle target group ids must match the particle count");
  }

  const target: ParticleTarget = {
    positions: input.positions,
    colors,
    seeds,
    normals,
    ...(input.groupIds ? { groupIds: input.groupIds } : {}),
    ...(input.image ? { image: input.image } : {}),
    count,
  };
  if (input.order === "sampled") return target;
  return permuteTarget(target, canonicalOrder(target.positions, target.groupIds));
}

export function rotatePositions(
  positions: Float32Array,
  normals: Float32Array,
  rotateX: number,
  rotateY: number,
): void {
  const cosX = Math.cos(rotateX);
  const sinX = Math.sin(rotateX);
  const cosY = Math.cos(rotateY);
  const sinY = Math.sin(rotateY);

  for (let index = 0; index < positions.length; index += 3) {
    let x = positions[index] ?? 0;
    let y = positions[index + 1] ?? 0;
    let z = positions[index + 2] ?? 0;
    let ny = y * cosX - z * sinX;
    let nz = y * sinX + z * cosX;
    y = ny;
    z = nz;
    let nx = x * cosY + z * sinY;
    nz = -x * sinY + z * cosY;
    x = nx;
    z = nz;
    positions[index] = x;
    positions[index + 1] = y;
    positions[index + 2] = z;

    x = normals[index] ?? 0;
    y = normals[index + 1] ?? 0;
    z = normals[index + 2] ?? 0;
    ny = y * cosX - z * sinX;
    nz = y * sinX + z * cosX;
    y = ny;
    z = nz;
    nx = x * cosY + z * sinY;
    nz = -x * sinY + z * cosY;
    normals[index] = nx;
    normals[index + 1] = y;
    normals[index + 2] = nz;
  }
}

export function targetDepthSpan(target: ParticleTarget): number {
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (let index = 2; index < target.positions.length; index += 3) {
    const z = target.positions[index] ?? 0;
    minZ = Math.min(minZ, z);
    maxZ = Math.max(maxZ, z);
  }
  return maxZ - minZ;
}

export function assertSameTargetCount(
  existing: ParticleTarget,
  incoming: ParticleTarget,
): void {
  if (existing.count !== incoming.count) {
    throw new Error("Particle targets must contain equal position counts");
  }
}
