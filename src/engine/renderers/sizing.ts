import type { RendererId } from "../types";

/** Match the Scree camera and the points `gl_PointSize` falloff. */
const CAMERA_FOV_DEG = 42;
const CAMERA_Z = 3.1;
const POINT_PERSPECTIVE = 2.1;
const SPRITE_TO_POINT = 1.577;
const SHARD_TO_POINT = 1.752;

function pointScreenPixels(input: {
  viewportWidth: number;
  viewportHeight: number;
  pointBaseSize: number;
  sizeMultiplier: number;
}): number {
  const viewportMin = Math.max(
    1,
    Math.min(input.viewportWidth, input.viewportHeight),
  );
  return (
    input.pointBaseSize *
    (viewportMin / 900) *
    input.sizeMultiplier *
    (POINT_PERSPECTIVE / CAMERA_Z)
  );
}

function worldSizeFromPointLook(
  input: {
    viewportWidth: number;
    viewportHeight: number;
    pointBaseSize: number;
    sizeMultiplier: number;
  },
  toPoint: number,
): number {
  const visibleHeight =
    2 * Math.tan((CAMERA_FOV_DEG * Math.PI) / 360) * CAMERA_Z;
  return (
    (pointScreenPixels(input) * toPoint * visibleHeight) /
    Math.max(1, input.viewportHeight)
  );
}

export function resolveRendererSize(input: {
  id: RendererId;
  particleCount: number;
  viewportWidth: number;
  viewportHeight: number;
  pointBaseSize: number;
  sizeMultiplier: number;
}): number {
  const viewportMin = Math.max(
    1,
    Math.min(input.viewportWidth, input.viewportHeight),
  );
  const viewportFactor = viewportMin / 900;
  const multiplier = input.sizeMultiplier;

  switch (input.id) {
    case "points":
      return input.pointBaseSize * viewportFactor * multiplier;
    case "sprites":
      return worldSizeFromPointLook(input, SPRITE_TO_POINT);
    case "shards":
      return worldSizeFromPointLook(input, SHARD_TO_POINT);
    case "pieces":
    case "surface":
      return 1;
    default: {
      const exhaustive: never = input.id;
      throw new Error(`Unknown renderer "${String(exhaustive)}"`);
    }
  }
}
