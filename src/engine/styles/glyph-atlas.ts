import * as THREE from "three";

/** Darkest to brightest. Index 0 is blank. */
export const ASCII_RAMP = " .:-=+*#%@";
const GLYPH_PX = 64;

/** One row of white glyphs on black, drawn once from a canvas. */
export function createGlyphAtlas(ramp: string = ASCII_RAMP): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = GLYPH_PX * ramp.length;
  canvas.height = GLYPH_PX;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("ASCII style needs a 2D canvas");
  context.fillStyle = "#000";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#fff";
  context.font = `700 ${Math.round(GLYPH_PX * 0.86)}px ui-monospace, Menlo, Consolas, monospace`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  [...ramp].forEach((glyph, index) => {
    context.fillText(glyph, index * GLYPH_PX + GLYPH_PX / 2, GLYPH_PX * 0.54);
  });
  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  return texture;
}
