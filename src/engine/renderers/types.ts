import type { Object3D, Vector3 } from "three";

import type { EffectDefinition } from "../effects/types";
import type { MatchStrategy } from "../match";
import type { MorphLook, RendererConfig, RendererId } from "../types";
import type { ParticleTarget, TargetImage } from "../target";

export type ParticleFieldBuffers = {
  source: ParticleTarget;
  destination: ParticleTarget;
};

export interface ParticleRenderer {
  readonly id: RendererId;
  readonly object: Object3D;
  /** True when the renderer draws the point field, so points must be paired first. */
  readonly pairsPoints: boolean;
  /** Effect settings for pixel renderers (pieces, surface). */
  setEffect?(effect: EffectDefinition): void;
  /** How pieces pair up when the effect does not lock it. */
  setMatch?(strategy: MatchStrategy): void;
  setField(field: ParticleFieldBuffers): void;
  /**
   * Do the expensive work for `field` ahead of time (piece layouts, textures)
   * so showing it later costs nothing. Returns the pictures to upload to the GPU.
   */
  warm?(field: ParticleFieldBuffers): TargetImage[];
  setProgress(progress: number): void;
  setTime(time: number): void;
  setLook(look: MorphLook): void;
  setSourceScale(scale: Vector3): void;
  setTargetScale(scale: Vector3): void;
  setDpr(dpr: number): void;
  setViewport(width: number, height: number): void;
  setConfig(config: RendererConfig): void;
  /** While a style redraws the field, write plain colour with coverage 1. */
  setFlatOutput(flat: boolean): void;
  getProgress(): number;
  dispose(): void;
}
