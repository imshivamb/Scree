import type { RendererId } from "./types";

export { createParticleRenderer } from "./renderers/create-renderer";
export { resolveRendererSize } from "./renderers/sizing";
export type { ParticleRenderer } from "./renderers/types";

export const RENDERER_IDS = ["points", "sprites", "shards", "pieces", "surface"] as const;

export function isRendererId(value: string): value is RendererId {
  return (RENDERER_IDS as readonly string[]).includes(value);
}
