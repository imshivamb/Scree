import type { MorphLook, RendererConfig, RendererId } from "../types";
import { PiecesRenderer } from "../pieces/renderer";
import { SurfaceRenderer } from "../surface/renderer";
import { PointsRenderer } from "./points";
import { ShardsRenderer } from "./shards";
import { SpritesRenderer } from "./sprites";
import type { ParticleRenderer } from "./types";

export function createParticleRenderer(
  id: RendererId,
  look: MorphLook,
  config: RendererConfig,
  dpr: number,
): ParticleRenderer {
  switch (id) {
    case "points":
      return new PointsRenderer(look, config, dpr);
    case "sprites":
      return new SpritesRenderer(look, config, dpr);
    case "shards":
      return new ShardsRenderer(look, config, dpr);
    case "pieces":
      return new PiecesRenderer(config);
    case "surface":
      return new SurfaceRenderer();
    default: {
      const exhaustive: never = id;
      throw new Error(`Unknown renderer "${String(exhaustive)}"`);
    }
  }
}
