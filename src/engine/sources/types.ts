import type { ParticleQuality } from "../motion";

/** A named region of an image whose pieces should stay together, in unit coordinates (v up). */
export type ImageGroup = { id: string; u0: number; v0: number; u1: number; v1: number };

/** The real picture behind an image-based target, for effects that move pixels. */
export type TargetImage = {
  /** Full-resolution element when available (sharper textures). */
  element?: TexImageSource;
  /** The sampled RGBA pixels (top row first); always present. */
  pixels: PixelSource;
  /** Where the whole image sits in world space (y up). */
  rect: { left: number; right: number; bottom: number; top: number };
  /** Marked regions: a group present in both pictures travels as one block. */
  groups?: ImageGroup[];
  /** Pin what did not change: when both pictures set this, pieces that look the same in place stay still. */
  still?: boolean;
};

export type ParticleTarget = {
  positions: Float32Array;
  colors: Float32Array;
  seeds: Float32Array;
  normals: Float32Array;
  /** Optional part per particle (e.g. GLB sub-mesh). Parts stay contiguous. */
  groupIds?: Uint16Array;
  /** Present for image, SVG and text targets. */
  image?: TargetImage;
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
  /** Full-resolution element to keep with the target for pixel effects. */
  element?: TexImageSource;
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
