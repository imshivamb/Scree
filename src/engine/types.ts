import type { BehaviorWeights } from "./motion-field";
import type { ParticleQuality } from "./motion";
import type { ParticleTarget } from "./target";

/** Point skins (`points`, `sprites`, `shards`) plus the effect families that move real pixels. */
export type RendererId = "points" | "sprites" | "shards" | "pieces" | "surface";

export const BEHAVIOR_IDS = [
  "settle",
  "expand",
  "scatter",
  "implode",
  "turbulence",
  "orbit",
] as const;

export type BehaviorId = (typeof BEHAVIOR_IDS)[number];

export const DRIVER_IDS = ["auto", "manual", "scroll", "pointer"] as const;

export type DriverId = (typeof DRIVER_IDS)[number];

export type PointerMode = "off" | "repel" | "attract";

export type PointerField = {
  x: number;
  y: number;
  radius: number;
  strength: number;
  mode: PointerMode;
};

export type MorphLook = {
  expansionStrength: number;
  turbulenceStrength: number;
  synchronization: number;
  particleSize: number;
  glow: number;
  behaviorMix: BehaviorWeights;
  behaviorStrength: number;
  pointer: PointerField;
};

export function isBehaviorId(value: string): value is BehaviorId {
  return (BEHAVIOR_IDS as readonly string[]).includes(value);
}

export function isDriverId(value: string): value is DriverId {
  return (DRIVER_IDS as readonly string[]).includes(value);
}

export function pointerModeIndex(mode: PointerMode): number {
  switch (mode) {
    case "off":
      return 0;
    case "repel":
      return 1;
    case "attract":
      return 2;
    default: {
      const exhaustive: never = mode;
      throw new Error(`Unknown pointer mode "${String(exhaustive)}"`);
    }
  }
}

export const DEFAULT_POINTER: PointerField = {
  x: 0,
  y: 0,
  radius: 0.72,
  strength: 0.7,
  mode: "off",
};

export type RendererConfig = {
  size: number;
  opacity: number;
};

export type ParticleFieldState = {
  activeTarget: string | null;
  progress: number;
  quality: ParticleQuality;
  renderer: RendererId;
  driver: DriverId;
  behaviorMix: BehaviorWeights;
};

export type RegisteredTarget = {
  id: string;
  target: ParticleTarget;
};
