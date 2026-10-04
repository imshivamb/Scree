import { boundsOf, canonicalOrder, hilbertKeys, sortByKey } from "../sources/order";
import type { ParticleTarget } from "../sources/types";
import { solveAssignment } from "./hungarian";

const FEATURES = 6;
const MIN_CHUNK_POINTS = 16;
/** Runs up to this size are paired exactly; larger runs pair by place (cost grows with size³). */
const EXACT_RUN_LIMIT = 64;

export type TransportOptions = {
  /** Coarse pieces solved exactly. More = finer pairing, slower (cost grows with chunks³). */
  chunks?: number;
  /**
   * How much colour counts against distance. Both forms span about 2 units, so
   * at 2 a full colour change costs about as much as crossing the whole form.
   */
  colorWeight?: number;
};

export const DEFAULT_TRANSPORT: Required<TransportOptions> = {
  chunks: 256,
  colorWeight: 2,
};

/** Mean (position, weighted colour) of each run of `size` points along `rank`. */
function chunkCentroids(
  target: ParticleTarget,
  rank: Uint32Array,
  chunks: number,
  size: number,
  colorWeight: number,
): Float64Array {
  const out = new Float64Array(chunks * FEATURES);
  for (let chunk = 0; chunk < chunks; chunk += 1) {
    const offset = chunk * FEATURES;
    for (let step = 0; step < size; step += 1) {
      const point = (rank[chunk * size + step] ?? 0) * 3;
      out[offset] = (out[offset] ?? 0) + (target.positions[point] ?? 0);
      out[offset + 1] = (out[offset + 1] ?? 0) + (target.positions[point + 1] ?? 0);
      out[offset + 2] = (out[offset + 2] ?? 0) + (target.positions[point + 2] ?? 0);
      out[offset + 3] = (out[offset + 3] ?? 0) + (target.colors[point] ?? 0) * colorWeight;
      out[offset + 4] = (out[offset + 4] ?? 0) + (target.colors[point + 1] ?? 0) * colorWeight;
      out[offset + 5] = (out[offset + 5] ?? 0) + (target.colors[point + 2] ?? 0) * colorWeight;
    }
    for (let feature = 0; feature < FEATURES; feature += 1) {
      out[offset + feature] = (out[offset + feature] ?? 0) / size;
    }
  }
  return out;
}

function gather(target: ParticleTarget, indices: Uint32Array): Float32Array {
  const out = new Float32Array(indices.length * 3);
  for (let step = 0; step < indices.length; step += 1) {
    const point = (indices[step] ?? 0) * 3;
    out[step * 3] = target.positions[point] ?? 0;
    out[step * 3 + 1] = target.positions[point + 1] ?? 0;
    out[step * 3 + 2] = target.positions[point + 2] ?? 0;
  }
  return out;
}

/** Exact pairing of two small runs on (position, colour). */
function pairRunsExactly(
  source: ParticleTarget,
  sourceRun: Uint32Array,
  destination: ParticleTarget,
  destinationRun: Uint32Array,
  order: Uint32Array,
  colorWeight: number,
): void {
  const size = sourceRun.length;
  const cost = new Float64Array(size * size);
  const weight = colorWeight * colorWeight;
  for (let row = 0; row < size; row += 1) {
    const a = (sourceRun[row] ?? 0) * 3;
    for (let column = 0; column < size; column += 1) {
      const b = (destinationRun[column] ?? 0) * 3;
      let positionCost = 0;
      let colorCost = 0;
      for (let axis = 0; axis < 3; axis += 1) {
        const dp = (source.positions[a + axis] ?? 0) - (destination.positions[b + axis] ?? 0);
        const dc = (source.colors[a + axis] ?? 0) - (destination.colors[b + axis] ?? 0);
        positionCost += dp * dp;
        colorCost += dc * dc;
      }
      cost[row * size + column] = positionCost + weight * colorCost;
    }
  }
  const assignment = solveAssignment(cost, size);
  for (let row = 0; row < size; row += 1) {
    order[sourceRun[row] ?? 0] = destinationRun[assignment[row] ?? 0] ?? 0;
  }
}

/** Pair two equal runs of points by rank along a Hilbert curve on each run's own bounds. */
function pairRunsByPlace(
  source: ParticleTarget,
  sourceRun: Uint32Array,
  destination: ParticleTarget,
  destinationRun: Uint32Array,
  order: Uint32Array,
): void {
  const sourcePositions = gather(source, sourceRun);
  const destinationPositions = gather(destination, destinationRun);
  const sourceRank = sortByKey(hilbertKeys(sourcePositions, boundsOf(sourcePositions)));
  const destinationRank = sortByKey(
    hilbertKeys(destinationPositions, boundsOf(destinationPositions)),
  );
  for (let step = 0; step < sourceRun.length; step += 1) {
    const from = sourceRun[sourceRank[step] ?? 0] ?? 0;
    order[from] = destinationRun[destinationRank[step] ?? 0] ?? 0;
  }
}

/**
 * Approximate optimal transport between two point sets on (position, colour).
 * Each set is cut into compact runs along its own Hilbert curve; the runs are
 * assigned to each other exactly; points inside matched runs pair by relative
 * place. Returns `order` with `order[sourceIndex] = destinationIndex`.
 */
export function transportOrder(
  source: ParticleTarget,
  destination: ParticleTarget,
  options: TransportOptions = {},
): Uint32Array {
  const { chunks: wanted, colorWeight } = { ...DEFAULT_TRANSPORT, ...options };
  const count = source.count;
  if (destination.count !== count) {
    throw new Error("Particle targets must contain equal position counts");
  }

  const chunks = Math.max(1, Math.min(wanted, Math.floor(count / MIN_CHUNK_POINTS)));
  const size = Math.floor(count / chunks);
  const sourceRank = canonicalOrder(source.positions, source.groupIds);
  const destinationRank = canonicalOrder(destination.positions, destination.groupIds);
  const sourceCentroids = chunkCentroids(source, sourceRank, chunks, size, colorWeight);
  const destinationCentroids = chunkCentroids(
    destination,
    destinationRank,
    chunks,
    size,
    colorWeight,
  );

  const cost = new Float64Array(chunks * chunks);
  for (let row = 0; row < chunks; row += 1) {
    for (let column = 0; column < chunks; column += 1) {
      let sum = 0;
      for (let feature = 0; feature < FEATURES; feature += 1) {
        const delta =
          (sourceCentroids[row * FEATURES + feature] ?? 0) -
          (destinationCentroids[column * FEATURES + feature] ?? 0);
        sum += delta * delta;
      }
      cost[row * chunks + column] = sum;
    }
  }
  const assignment = solveAssignment(cost, chunks);

  const order = new Uint32Array(count);
  for (let chunk = 0; chunk < chunks; chunk += 1) {
    const match = assignment[chunk] ?? 0;
    const sourceRun = sourceRank.subarray(chunk * size, (chunk + 1) * size);
    const destinationRun = destinationRank.subarray(match * size, (match + 1) * size);
    if (size <= EXACT_RUN_LIMIT) {
      pairRunsExactly(source, sourceRun, destination, destinationRun, order, colorWeight);
    } else {
      pairRunsByPlace(source, sourceRun, destination, destinationRun, order);
    }
  }
  // Leftover points (count not divisible by chunks) pair by relative place.
  const tail = chunks * size;
  if (tail < count) {
    pairRunsByPlace(
      source,
      sourceRank.subarray(tail),
      destination,
      destinationRank.subarray(tail),
      order,
    );
  }
  return order;
}
