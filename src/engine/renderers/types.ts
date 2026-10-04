import type { Object3D, Vector3 } from "three";

import type { MorphLook, RendererConfig, RendererId } from "../types";
import type { ParticleTarget } from "../target";

export type ParticleFieldBuffers = {
  source: ParticleTarget;
  destination: ParticleTarget;
};

export interface ParticleRenderer {
  readonly id: RendererId;
  readonly object: Object3D;
  setField(field: ParticleFieldBuffers): void;
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
