import { isBehaviorId, type BehaviorId } from "./types";
import type { BehaviorMix, MotionSpec } from "./motion-field";
import { exclusiveBehavior, specFromMix } from "./motion-field";

export const TRANSITION_PRESET_IDS = [
  "organic",
  "flow",
  "dissolve",
  "explode",
  "implode",
  "vortex",
  "reveal",
  "disperse",
  "reassemble",
] as const;

export type TransitionPresetId = (typeof TRANSITION_PRESET_IDS)[number];

export const TRANSITION_PRESETS: Record<TransitionPresetId, MotionSpec> = {
  organic: { expand: 0.8, turbulence: 0.35, orbit: 0.15 },
  /** Pieces travel almost straight to their place: shows what moved. */
  flow: { settle: 0.6 },
  dissolve: { settle: 0.25, turbulence: 0.9 },
  explode: { expand: 1, scatter: 0.7 },
  implode: { implode: 1, turbulence: 0.25 },
  vortex: { orbit: 1, expand: 0.35 },
  reveal: { settle: 1, expand: 0.2 },
  disperse: { scatter: 1, turbulence: 0.4 },
  reassemble: { implode: 0.45, settle: 0.8 },
};

export type MotionInput =
  | BehaviorId
  | BehaviorMix
  | MotionSpec
  | TransitionPresetId;

export function isTransitionPresetId(value: string): value is TransitionPresetId {
  return (TRANSITION_PRESET_IDS as readonly string[]).includes(value);
}

export function isMotionEnvelope(value: unknown): value is { from?: number; to?: number } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function resolveMotion(input?: MotionInput): {
  spec: MotionSpec;
  preset?: TransitionPresetId;
} {
  if (!input) return { spec: { expand: 1 } };
  if (typeof input === "string") {
    if (isTransitionPresetId(input)) {
      return { spec: TRANSITION_PRESETS[input], preset: input };
    }
    if (isBehaviorId(input)) {
      return { spec: specFromMix(exclusiveBehavior(input)) };
    }
  }
  return { spec: input };
}
