import type { ParticleTarget } from "./types";

const HILBERT_BITS = 10;
const AXIS_MAX = (1 << HILBERT_BITS) - 1;
const GROUP_STRIDE = 2 ** (HILBERT_BITS * 3);
/** Below this depth/width ratio a target is ordered as a flat (x, y) shape. */
const FLAT_DEPTH_RATIO = 0.35;

function quantize(value: number): number {
  const clamped = Math.min(1, Math.max(0, value));
  return Math.min(AXIS_MAX, Math.floor(clamped * (AXIS_MAX + 1)));
}

/**
 * Hilbert index of a point in the unit cube (Skilling's transpose method).
 * Neighbouring keys are always neighbouring cells, so the curve never jumps.
 */
export function hilbertKey3(x: number, y: number, z: number): number {
  let a = quantize(x);
  let b = quantize(y);
  let c = quantize(z);
  const top = 1 << (HILBERT_BITS - 1);

  for (let q = top; q > 1; q >>= 1) {
    const p = q - 1;
    if ((a & q) !== 0) a ^= p;
    if ((b & q) !== 0) {
      a ^= p;
    } else {
      const swap = (a ^ b) & p;
      a ^= swap;
      b ^= swap;
    }
    if ((c & q) !== 0) {
      a ^= p;
    } else {
      const swap = (a ^ c) & p;
      a ^= swap;
      c ^= swap;
    }
  }
  b ^= a;
  c ^= b;
  let flip = 0;
  for (let q = top; q > 1; q >>= 1) {
    if ((c & q) !== 0) flip ^= q - 1;
  }
  a ^= flip;
  b ^= flip;
  c ^= flip;

  let key = 0;
  for (let bit = HILBERT_BITS - 1; bit >= 0; bit -= 1) {
    key = key * 8 + ((a >> bit) & 1) * 4 + ((b >> bit) & 1) * 2 + ((c >> bit) & 1);
  }
  return key;
}

export type Bounds = {
  min: [number, number, number];
  span: number;
  flat: boolean;
};

export function boundsOf(...sets: Float32Array[]): Bounds {
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (const positions of sets) {
    for (let index = 0; index < positions.length; index += 3) {
      for (let axis = 0; axis < 3; axis += 1) {
        const value = positions[index + axis] ?? 0;
        if (value < min[axis]!) min[axis] = value;
        if (value > max[axis]!) max[axis] = value;
      }
    }
  }
  const spanX = max[0] - min[0];
  const spanY = max[1] - min[1];
  const spanZ = max[2] - min[2];
  const span = Math.max(spanX, spanY, spanZ, 1e-6);
  return { min, span, flat: spanZ < Math.max(spanX, spanY) * FLAT_DEPTH_RATIO };
}

/** Hilbert key of every point on shared bounds (uniform scale keeps aspect). */
export function hilbertKeys(positions: Float32Array, bounds: Bounds): Float64Array {
  const count = positions.length / 3;
  const keys = new Float64Array(count);
  for (let index = 0; index < count; index += 1) {
    const offset = index * 3;
    const x = ((positions[offset] ?? 0) - bounds.min[0]) / bounds.span;
    const y = ((positions[offset + 1] ?? 0) - bounds.min[1]) / bounds.span;
    const z = bounds.flat
      ? 0
      : ((positions[offset + 2] ?? 0) - bounds.min[2]) / bounds.span;
    keys[index] = hilbertKey3(x, y, z);
  }
  return keys;
}

/** Indices sorted by key, ties broken by original index. */
export function sortByKey(keys: Float64Array): Uint32Array {
  const order = new Uint32Array(keys.length);
  for (let index = 0; index < order.length; index += 1) order[index] = index;
  order.sort((a, b) => (keys[a] ?? 0) - (keys[b] ?? 0) || a - b);
  return order;
}

/**
 * Canonical order of a target: by group, then along a Hilbert curve on the
 * target's own bounds. `order[newIndex] = oldIndex`.
 */
export function canonicalOrder(
  positions: Float32Array,
  groupIds?: Uint16Array,
): Uint32Array {
  const keys = hilbertKeys(positions, boundsOf(positions));
  if (groupIds) {
    for (let index = 0; index < keys.length; index += 1) {
      keys[index] = (groupIds[index] ?? 0) * GROUP_STRIDE + (keys[index] ?? 0);
    }
  }
  return sortByKey(keys);
}

function permute3(source: Float32Array, order: Uint32Array): Float32Array {
  const out = new Float32Array(source.length);
  for (let index = 0; index < order.length; index += 1) {
    const from = (order[index] ?? 0) * 3;
    const to = index * 3;
    out[to] = source[from] ?? 0;
    out[to + 1] = source[from + 1] ?? 0;
    out[to + 2] = source[from + 2] ?? 0;
  }
  return out;
}

/** Reorder every attribute together. `order[newIndex] = oldIndex`. */
export function permuteTarget(
  target: ParticleTarget,
  order: Uint32Array,
): ParticleTarget {
  const seeds = new Float32Array(target.count);
  const groupIds = target.groupIds ? new Uint16Array(target.count) : undefined;
  for (let index = 0; index < order.length; index += 1) {
    const from = order[index] ?? 0;
    seeds[index] = target.seeds[from] ?? 0;
    if (groupIds) groupIds[index] = target.groupIds?.[from] ?? 0;
  }
  return {
    positions: permute3(target.positions, order),
    colors: permute3(target.colors, order),
    normals: permute3(target.normals, order),
    seeds,
    ...(groupIds ? { groupIds } : {}),
    ...(target.image ? { image: target.image } : {}),
    count: target.count,
  };
}
