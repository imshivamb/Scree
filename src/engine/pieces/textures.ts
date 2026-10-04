import * as THREE from "three";

import type { ParticleTarget, TargetImage } from "../sources/types";

const textures = new WeakMap<TargetImage, THREE.Texture>();
const rasters = new WeakMap<ParticleTarget, TargetImage>();

/** A GPU texture for a target's picture (full-resolution element when there is one). */
export function textureFor(image: TargetImage): THREE.Texture {
  const cached = textures.get(image);
  if (cached) return cached;
  let texture: THREE.Texture;
  if (image.element) {
    texture = new THREE.Texture(image.element as THREE.Texture["image"]);
  } else {
    // Pixels are stored top row first; flip them so v = 0 is the bottom.
    const { width, height, data } = image.pixels;
    const flipped = new Uint8Array(data.length);
    const row = width * 4;
    for (let y = 0; y < height; y += 1) {
      flipped.set(data.subarray((height - 1 - y) * row, (height - y) * row), y * row);
    }
    texture = new THREE.DataTexture(flipped, width, height, THREE.RGBAFormat);
  }
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  textures.set(image, texture);
  return texture;
}

/**
 * Targets without a picture (meshes, procedural shapes, dust) get one by
 * drawing their points, so pixel effects still have something to move.
 */
export function imageForTarget(target: ParticleTarget): TargetImage | null {
  if (target.image) return target.image;
  const cached = rasters.get(target);
  if (cached) return cached;
  if (typeof document === "undefined") return null;

  let left = Infinity;
  let right = -Infinity;
  let bottom = Infinity;
  let top = -Infinity;
  for (let index = 0; index < target.count; index += 1) {
    const x = target.positions[index * 3] ?? 0;
    const y = target.positions[index * 3 + 1] ?? 0;
    left = Math.min(left, x);
    right = Math.max(right, x);
    bottom = Math.min(bottom, y);
    top = Math.max(top, y);
  }
  const pad = Math.max(right - left, top - bottom) * 0.04 + 1e-3;
  left -= pad;
  right += pad;
  bottom -= pad;
  top += pad;
  const longest = 384;
  const scale = longest / Math.max(right - left, top - bottom);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round((right - left) * scale));
  canvas.height = Math.max(1, Math.round((top - bottom) * scale));
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return null;
  const dot = Math.max(1.2, scale * 0.012);
  for (let index = 0; index < target.count; index += 1) {
    const x = ((target.positions[index * 3] ?? 0) - left) * scale;
    const y = (top - (target.positions[index * 3 + 1] ?? 0)) * scale;
    const r = Math.round((target.colors[index * 3] ?? 0) * 255);
    const g = Math.round((target.colors[index * 3 + 1] ?? 0) * 255);
    const b = Math.round((target.colors[index * 3 + 2] ?? 0) * 255);
    context.fillStyle = `rgb(${r},${g},${b})`;
    context.fillRect(x - dot / 2, y - dot / 2, dot, dot);
  }
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
  const image: TargetImage = {
    element: canvas,
    pixels: { width: pixels.width, height: pixels.height, data: pixels.data },
    rect: { left, right, bottom, top },
  };
  rasters.set(target, image);
  return image;
}
