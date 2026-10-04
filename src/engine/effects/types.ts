import type { MatchStrategy } from "../match";
import type { StyleInput } from "../styles";
import type { MotionInput } from "../transitions";
import type { RendererId } from "../types";

/** Which renderer family draws an effect. */
export type EffectFamily = "particles" | "pieces" | "surface";

/** How an image is cut into pieces. Both images use the same cut, so pieces pair one to one. */
export type PieceCut = {
  /** "grid" = rectangles; "triangles" = each grid cell split in two (jitter makes shards). */
  kind: "grid" | "triangles";
  /** Fixed grid, or `density` (≈ number of pieces) shaped to the images' aspect. */
  columns?: number;
  rows?: number;
  density?: number;
  /** 0–0.28: how far inner grid corners wander (shards). Pieces still tile exactly. */
  jitter?: number;
};

/** Order in which pieces start moving. */
export type StaggerMode = "random" | "x" | "y" | "radial" | "travel" | "index";

export type PieceMotion = {
  /** 0–0.85: share of the clip over which piece starts are spread. */
  stagger: number;
  staggerBy: StaggerMode;
  /** How high pieces lift toward the camera mid-flight (world units). */
  lift: number;
  /** Sideways bow of each path. */
  arc: number;
  /** Max tumble in radians mid-flight (random axis per piece). */
  tilt: number;
  /** Turn each piece over (180°) on the way, showing the new image on its back. */
  flip?: "none" | "x" | "y" | "random";
  /**
   * 0–1: how much the drama (lift, arc, tumble) goes only to pieces that travel far.
   * 0 = every piece moves the same; 1 = pieces that stay put barely stir.
   */
  focus?: number;
  /** Landslide: pieces fall under gravity onto a heap, rest, then rise into place (heap height 0–1.5). */
  gravity?: number;
  /** 0–1: glassy glint on pieces as they turn in flight (helps dark pieces read). */
  gloss?: number;
  /** Shrink at mid-flight (0 = none, 0.5 = half size). */
  dip?: number;
  /** Glitch: pieces jump sideways in steps while travelling. */
  jolt?: number;
  /** Glitch: red/blue channel split while travelling. */
  rgbSplit?: number;
  /** Ease past the end and settle back (card stack). */
  overshoot?: number;
  /** When the picture on a piece changes: a crossfade window over its own flight (0–1). */
  swap?: [number, number];
};

export type PieceEffect = {
  cut: PieceCut;
  motion: PieceMotion;
  /** Lock the pairing (e.g. blinds flip in place). Otherwise the engine's match is used. */
  match?: MatchStrategy;
};

export type SurfaceEffect = {
  /** Registered surface shader id. */
  shader: string;
  /** Free parameters the shader reads as uParams.xyzw. */
  params?: [number, number, number, number];
};

export type ParticleEffect = {
  renderer: Extract<RendererId, "points" | "sprites" | "shards">;
  /** Point size multiplier: below 1 for fine sand, above 1 for chunky pieces. */
  size?: number;
  motion: MotionInput;
  style?: StyleInput;
};

export type EffectDefinition = {
  id: string;
  label: string;
  description: string;
  family: EffectFamily;
  /** Suggested morph length in seconds. */
  durationSeconds: number;
  pieces?: PieceEffect;
  surface?: SurfaceEffect;
  particles?: ParticleEffect;
};
