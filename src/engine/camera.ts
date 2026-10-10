import type { ParticleTarget } from "./target";

/** Where the camera sits for one form: a unit direction from the origin and a distance. */
export type Framing = {
  direction: [number, number, number];
  distance: number;
  /** Where the camera looks (x, y); the origin unless a picture is framed by its own edges. */
  center?: [number, number];
};

export const CAMERA_FOV_DEG = 42;
export const DEFAULT_FIT = 0.8;
/** Forms deeper than this (relative units) get a three-quarter view. */
const DEPTH_FOR_ANGLE = 0.42;
const ANGLED = normalize([0.92, 0.62, 2.85]);
const STRAIGHT: [number, number, number] = [0, 0, 1];

function normalize(v: [number, number, number]): [number, number, number] {
  const length = Math.hypot(...v) || 1;
  return [v[0] / length, v[1] / length, v[2] / length];
}

type Extent = { halfX: number; halfY: number; halfZ: number; deep: boolean };
const extents = new WeakMap<ParticleTarget, Extent>();

function extentOf(target: ParticleTarget): Extent {
  const cached = extents.get(target);
  if (cached) return cached;
  let halfX = 0;
  let halfY = 0;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (let index = 0; index < target.positions.length; index += 3) {
    halfX = Math.max(halfX, Math.abs(target.positions[index] ?? 0));
    halfY = Math.max(halfY, Math.abs(target.positions[index + 1] ?? 0));
    const z = target.positions[index + 2] ?? 0;
    minZ = Math.min(minZ, z);
    maxZ = Math.max(maxZ, z);
  }
  const extent = {
    halfX,
    halfY,
    halfZ: Math.max(Math.abs(minZ), Math.abs(maxZ)),
    deep: maxZ - minZ > DEPTH_FOR_ANGLE,
  };
  extents.set(target, extent);
  return extent;
}

/**
 * Frame a form so it fills `fit` of the view in either direction, for any
 * aspect. Flat forms are seen straight on; deep forms from a three-quarter angle.
 */
export function frameTarget(
  target: ParticleTarget,
  options: {
    aspect: number;
    fit?: number;
    scale?: [number, number, number];
    distance?: number;
    /** Frame the picture's own edges instead of its content, so a rest frame lands pixel for pixel. */
    picture?: boolean;
  },
): Framing {
  const rect = options.picture ? target.image?.rect : undefined;
  if (rect) {
    const halfX = ((rect.right - rect.left) / 2) * (options.scale?.[0] ?? 1);
    const halfY = ((rect.top - rect.bottom) / 2) * (options.scale?.[1] ?? 1);
    const fit = Math.min(1, Math.max(0.1, options.fit ?? DEFAULT_FIT));
    const tanHalf = Math.tan((CAMERA_FOV_DEG * Math.PI) / 360);
    const aspect = Math.max(0.05, options.aspect);
    return {
      direction: STRAIGHT,
      distance: options.distance ?? Math.max(halfY / (tanHalf * fit), halfX / (tanHalf * aspect * fit)),
      center: [(rect.left + rect.right) / 2, (rect.top + rect.bottom) / 2],
    };
  }
  const extent = extentOf(target);
  const [sx, sy, sz] = options.scale ?? [1, 1, 1];
  const fit = Math.min(1, Math.max(0.1, options.fit ?? DEFAULT_FIT));
  const tanHalf = Math.tan((CAMERA_FOV_DEG * Math.PI) / 360);
  const aspect = Math.max(0.05, options.aspect);

  if (extent.deep) {
    const radius = Math.max(extent.halfX * sx, extent.halfY * sy, extent.halfZ * sz);
    const distance = options.distance ?? radius / (tanHalf * Math.min(1, aspect) * fit) + radius * 0.5;
    return { direction: ANGLED, distance };
  }
  const halfX = extent.halfX * sx;
  const halfY = extent.halfY * sy;
  const distance =
    options.distance ??
    Math.max(halfY / (tanHalf * fit), halfX / (tanHalf * aspect * fit)) + extent.halfZ * sz;
  return { direction: STRAIGHT, distance: Math.max(0.5, distance) };
}

/** Blend two framings; the camera glides from one form's view to the next. */
export function blendFraming(from: Framing, to: Framing, t: number): Framing {
  const mix = (a: number, b: number) => a + (b - a) * t;
  return {
    direction: normalize([
      mix(from.direction[0], to.direction[0]),
      mix(from.direction[1], to.direction[1]),
      mix(from.direction[2], to.direction[2]),
    ]),
    distance: mix(from.distance, to.distance),
    ...(from.center || to.center
      ? {
          center: [
            mix(from.center?.[0] ?? 0, to.center?.[0] ?? 0),
            mix(from.center?.[1] ?? 0, to.center?.[1] ?? 0),
          ] as [number, number],
        }
      : {}),
  };
}
