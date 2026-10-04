import { finalizeTarget, flatNormals } from "./normalize";
import { resolveParticleCount, resolveSeed } from "./options";
import { clamp, mulberry32 } from "./rng";
import type { ParticleTarget, ParticleTargetOptions, PixelSource } from "./types";

export function buildParticleTarget(
  source: PixelSource,
  options: ParticleTargetOptions,
): ParticleTarget {
  const particleCount = resolveParticleCount(options);
  const visible: {
    x: number;
    y: number;
    r: number;
    g: number;
    b: number;
    lum: number;
    edge: boolean;
  }[] = [];
  let minX = source.width;
  let maxX = 0;
  let minY = source.height;
  let maxY = 0;

  const alphaAt = (x: number, y: number): number => {
    if (x < 0 || y < 0 || x >= source.width || y >= source.height) return 0;
    return source.data[(y * source.width + x) * 4 + 3] ?? 0;
  };

  for (let y = 0; y < source.height; y += 1) {
    const row = y * source.width;
    for (let x = 0; x < source.width; x += 1) {
      const offset = (row + x) * 4;
      const alpha = source.data[offset + 3] ?? 0;
      if (alpha < options.alphaThreshold) continue;

      const r = (source.data[offset] ?? 0) / 255;
      const g = (source.data[offset + 1] ?? 0) / 255;
      const b = (source.data[offset + 2] ?? 0) / 255;
      const edge =
        alphaAt(x - 1, y) < options.alphaThreshold ||
        alphaAt(x + 1, y) < options.alphaThreshold ||
        alphaAt(x, y - 1) < options.alphaThreshold ||
        alphaAt(x, y + 1) < options.alphaThreshold;
      visible.push({
        x,
        y,
        r,
        g,
        b,
        lum: r * 0.2126 + g * 0.7152 + b * 0.0722,
        edge,
      });
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  }

  if (visible.length === 0) {
    throw new Error("Particle target contains no visible pixels");
  }

  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const span = Math.max(maxX - minX + 1, maxY - minY + 1);
  const random = mulberry32(resolveSeed(options));
  const positions = new Float32Array(particleCount * 3);
  const colors = new Float32Array(particleCount * 3);
  const seeds = new Float32Array(particleCount);
  const edges = visible.filter((pixel) => pixel.edge);
  const fills = visible.filter((pixel) => !pixel.edge);

  const pickPixel = () => {
    if (!options.preferEdges || edges.length === 0) {
      return visible[Math.floor(random() * visible.length)] ?? visible[0]!;
    }
    const useEdge = fills.length === 0 || random() < 0.72;
    const pool = useEdge ? edges : fills;
    return pool[Math.floor(random() * pool.length)] ?? visible[0]!;
  };

  for (let index = 0; index < particleCount; index += 1) {
    const pixel = pickPixel();
    const offset = index * 3;
    const jitter = options.jitter ?? 0.65;
    const jitterX = (random() - 0.5) * jitter;
    const jitterY = (random() - 0.5) * jitter;
    const extent = options.extent ?? 2;
    positions[offset] = ((pixel.x + jitterX - centerX) * extent) / span;
    positions[offset + 1] = ((centerY - pixel.y - jitterY) * extent) / span;
    positions[offset + 2] = clamp(
      (pixel.lum - 0.5) * options.depth + (random() - 0.5) * options.depth * 0.35,
      -options.depth,
      options.depth,
    );
    colors[offset] = pixel.r;
    colors[offset + 1] = pixel.g;
    colors[offset + 2] = pixel.b;
    seeds[index] = random();
  }

  const extent = options.extent ?? 2;
  const toWorld = extent / span;
  return finalizeTarget({
    positions,
    colors,
    seeds,
    normals: flatNormals(particleCount),
    normalize: false,
    image: {
      ...(options.element ? { element: options.element } : {}),
      pixels: source,
      rect: {
        left: (0 - centerX) * toWorld,
        right: (source.width - centerX) * toWorld,
        top: centerY * toWorld,
        bottom: (centerY - source.height) * toWorld,
      },
    },
  });
}
