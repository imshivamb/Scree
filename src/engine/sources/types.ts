import type { ParticleQuality } from "../motion";

export type ParticleTarget = {
  positions: Float32Array;
  colors: Float32Array;
  seeds: Float32Array;
  normals: Float32Array;
  /** Optional part per particle (e.g. GLB sub-mesh). Parts stay contiguous. */
  groupIds?: Uint16Array;
  count: number;
};

export type PixelSource = {
  width: number;
  height: number;
  data: Uint8ClampedArray;
};

export type TargetQuality = ParticleQuality;

export type BaseTargetOptions = {
  particleCount?: number;
  quality?: TargetQuality;
  seed?: number;
};

export type ParticleTargetOptions = BaseTargetOptions & {
  particleCount: number;
  alphaThreshold: number;
  depth: number;
  jitter?: number;
  extent?: number;
  preferEdges?: boolean;
};

export type ImageTargetOptions = BaseTargetOptions & {
  alphaThreshold?: number;
  depth?: number;
};

export type TextTargetOptions = ImageTargetOptions & {
  font?: string;
  weight?: string | number;
  size?: number;
  letterSpacing?: number;
  lineHeight?: number;
  align?: CanvasTextAlign;
  color?: string;
};

export type MeshTargetOptions = BaseTargetOptions & {
  color?: [number, number, number];
};
