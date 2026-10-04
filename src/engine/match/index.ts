import { canonicalOrder, permuteTarget } from "../sources/order";
import { mulberry32 } from "../sources/rng";
import type { ParticleTarget } from "../sources/types";
import { transportOrder, type TransportOptions } from "./transport";

export { DEFAULT_TRANSPORT, transportOrder } from "./transport";
export type { TransportOptions } from "./transport";

/**
 * How points in one form pair with points in the next.
 * - `transport`: by place and colour — regions flow to their counterparts.
 * - `spatial`: by relative place only.
 * - `random`: no pairing — the classic dissolve.
 */
export const MATCH_STRATEGIES = ["transport", "spatial", "random"] as const;
export type MatchStrategy = (typeof MATCH_STRATEGIES)[number];
export const DEFAULT_MATCH: MatchStrategy = "transport";

export function isMatchStrategy(value: string): value is MatchStrategy {
  return (MATCH_STRATEGIES as readonly string[]).includes(value);
}

const RANDOM_SEED = 0x5c2ee;

function shuffledOrder(count: number): Uint32Array {
  const order = new Uint32Array(count);
  for (let index = 0; index < count; index += 1) order[index] = index;
  const random = mulberry32(RANDOM_SEED);
  for (let index = count - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    const held = order[index] ?? 0;
    order[index] = order[swap] ?? 0;
    order[swap] = held;
  }
  return order;
}

/** Pair by rank along each target's own Hilbert curve. */
function spatialOrder(source: ParticleTarget, destination: ParticleTarget): Uint32Array {
  const sourceRank = canonicalOrder(source.positions, source.groupIds);
  const destinationRank = canonicalOrder(destination.positions, destination.groupIds);
  const order = new Uint32Array(source.count);
  for (let rank = 0; rank < source.count; rank += 1) {
    order[sourceRank[rank] ?? 0] = destinationRank[rank] ?? 0;
  }
  return order;
}

/** `order[sourceIndex] = destinationIndex` for a strategy. */
export function matchOrder(
  source: ParticleTarget,
  destination: ParticleTarget,
  strategy: MatchStrategy = DEFAULT_MATCH,
  options: TransportOptions = {},
): Uint32Array {
  if (source.count !== destination.count) {
    throw new Error("Particle targets must contain equal position counts");
  }
  switch (strategy) {
    case "random":
      return shuffledOrder(destination.count);
    case "spatial":
      return spatialOrder(source, destination);
    case "transport":
      return transportOrder(source, destination, options);
    default: {
      const exhaustive: never = strategy;
      throw new Error(`Unknown match strategy "${String(exhaustive)}"`);
    }
  }
}

/**
 * Reorder `destination` so that index *i* is the point that source point *i*
 * should travel to. Positions, colours and normals move together.
 */
export function matchTargets(
  source: ParticleTarget,
  destination: ParticleTarget,
  strategy: MatchStrategy = DEFAULT_MATCH,
  options: TransportOptions = {},
): ParticleTarget {
  return permuteTarget(destination, matchOrder(source, destination, strategy, options));
}

/** Computes a pairing somewhere else (e.g. a Web Worker) and resolves with it. */
export type MatchCompute = (
  source: ParticleTarget,
  destination: ParticleTarget,
  strategy: MatchStrategy,
) => Promise<ParticleTarget>;

/** Remembers each (source, destination, strategy) pairing so replays are free. */
export class MatchCache {
  private readonly pairs = new WeakMap<
    ParticleTarget,
    WeakMap<ParticleTarget, Map<MatchStrategy, ParticleTarget>>
  >();

  get(
    source: ParticleTarget,
    destination: ParticleTarget,
    strategy: MatchStrategy,
  ): ParticleTarget {
    if (source === destination) return destination;
    let byDestination = this.pairs.get(source);
    if (!byDestination) {
      byDestination = new WeakMap();
      this.pairs.set(source, byDestination);
    }
    let byStrategy = byDestination.get(destination);
    if (!byStrategy) {
      byStrategy = new Map();
      byDestination.set(destination, byStrategy);
    }
    const cached = byStrategy.get(strategy);
    if (cached) return cached;
    const matched = matchTargets(source, destination, strategy);
    byStrategy.set(strategy, matched);
    return matched;
  }

  has(source: ParticleTarget, destination: ParticleTarget, strategy: MatchStrategy): boolean {
    return source === destination || Boolean(this.pairs.get(source)?.get(destination)?.has(strategy));
  }

  /** Store a pairing computed elsewhere. */
  set(
    source: ParticleTarget,
    destination: ParticleTarget,
    strategy: MatchStrategy,
    matched: ParticleTarget,
  ): void {
    let byDestination = this.pairs.get(source);
    if (!byDestination) {
      byDestination = new WeakMap();
      this.pairs.set(source, byDestination);
    }
    let byStrategy = byDestination.get(destination);
    if (!byStrategy) {
      byStrategy = new Map();
      byDestination.set(destination, byStrategy);
    }
    byStrategy.set(strategy, matched);
  }
}
