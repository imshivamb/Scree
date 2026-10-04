import { buildParticleTarget } from "./from-pixels";
import { resolveParticleCount, resolveSeed } from "./options";
import type { ImageTargetOptions, ParticleTarget, PixelSource } from "./types";

const MAX_SOURCE_DIMENSION = 512;
const MIN_SOURCE_DIMENSION = 96;

function pixelSourceFromImage(
  image: CanvasImageSource,
  width: number,
  height: number,
): PixelSource {
  const canvas = document.createElement("canvas");
  const longest = Math.max(width, height, 1);
  const scale =
    longest > MAX_SOURCE_DIMENSION
      ? MAX_SOURCE_DIMENSION / longest
      : longest < MIN_SOURCE_DIMENSION
        ? MIN_SOURCE_DIMENSION / longest
        : 1;
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    throw new Error("Particle target image could not be sampled");
  }
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  return {
    width: imageData.width,
    height: imageData.height,
    data: imageData.data,
  };
}

function loadHtmlImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () =>
      reject(new Error("Particle target image could not be sampled"));
    image.src = src;
  });
}

function imageOptions(options: ImageTargetOptions, element?: TexImageSource) {
  return {
    particleCount: resolveParticleCount(options),
    seed: resolveSeed(options),
    alphaThreshold: options.alphaThreshold ?? 24,
    depth: options.depth ?? 0.22,
    ...(element ? { element } : {}),
  };
}

export async function createImageTarget(
  src: string | File,
  options: ImageTargetOptions = {},
): Promise<ParticleTarget> {
  if (typeof src !== "string") {
    return createImageTargetFromFile(src, options);
  }
  const image = await loadHtmlImage(src);
  return buildParticleTarget(
    pixelSourceFromImage(image, image.naturalWidth, image.naturalHeight),
    imageOptions(options, image),
  );
}

export async function createImageTargetFromFile(
  file: File,
  options: ImageTargetOptions = {},
): Promise<ParticleTarget> {
  const objectUrl = URL.createObjectURL(file);
  try {
    return await createImageTarget(objectUrl, options);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export const createSvgTarget = createImageTarget;
export const loadParticleTargetFromUrl = createImageTarget;
export const loadParticleTargetFromFile = createImageTargetFromFile;
