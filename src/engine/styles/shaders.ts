import type { StyleId } from "./types";

export const STYLE_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

/** Shared helpers: average one cell of the rendered field and colour it. */
const COMMON = /* glsl */ `
uniform sampler2D tScene;
uniform vec2 uResolution;
uniform float uCell;
uniform float uGain;
uniform int uPalette;
uniform vec3 uInk;
uniform vec3 uShade;
varying vec2 vUv;

// The field is drawn flat (colour, coverage 1), so in each mip texel
// rgb / a is the mean colour and a is how much of the cell is covered.
// The mip level whose texels are one cell wide gives the cell average for free.
vec4 cellSample(vec2 centerPx) {
  vec4 s = textureLod(tScene, centerPx / uResolution, log2(max(uCell, 1.0)));
  float presence = clamp(s.a * uGain, 0.0, 1.0);
  vec3 color = s.a > 1e-4 ? clamp(s.rgb / s.a, 0.0, 1.0) : vec3(0.0);
  return vec4(color, presence);
}

float luma(vec3 c) {
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

// Brightness to draw with: present-but-dark regions still show, faintly.
float cellValue(vec4 s) {
  return smoothstep(0.05, 0.55, s.a) * mix(0.3, 1.0, luma(s.rgb));
}

vec3 paint(vec3 color, float value) {
  if (uPalette == 1) return uInk;
  if (uPalette == 2) return mix(uShade, uInk, value);
  return color * mix(0.7, 1.15, value);
}

vec2 cellCenter(vec2 px) {
  return (floor(px / uCell) + 0.5) * uCell;
}
`;

const DITHER = /* glsl */ `
float bayer2(vec2 a) { a = floor(a); return fract(dot(a, vec2(0.5, a.y * 0.75))); }
float bayer4(vec2 a) { return bayer2(0.5 * a) * 0.25 + bayer2(a); }
float bayer8(vec2 a) { return bayer4(0.5 * a) * 0.25 + bayer2(a); }

void main() {
  vec2 px = vUv * uResolution;
  vec4 s = cellSample(cellCenter(px));
  float value = cellValue(s);
  float threshold = bayer8(floor(px / uCell));
  if (s.a < 0.02 || value <= threshold * 0.92 + 0.04) {
    gl_FragColor = vec4(0.0);
    return;
  }
  gl_FragColor = vec4(paint(s.rgb, value), 1.0);
}
`;

const HALFTONE = /* glsl */ `
const float ANGLE = 0.4;

void main() {
  vec2 px = vUv * uResolution;
  mat2 turn = mat2(cos(ANGLE), -sin(ANGLE), sin(ANGLE), cos(ANGLE));
  vec2 rotated = turn * px;
  vec2 centerRotated = cellCenter(rotated);
  vec2 center = transpose(turn) * centerRotated;
  vec4 s = cellSample(center);
  float value = cellValue(s);
  float radius = sqrt(value) * uCell * 0.62;
  float distanceToCenter = length(rotated - centerRotated);
  float coverage = 1.0 - smoothstep(radius - 0.75, radius + 0.75, distanceToCenter);
  if (radius < 0.35) coverage = 0.0;
  gl_FragColor = vec4(paint(s.rgb, value) * coverage, coverage);
}
`;

const ASCII = /* glsl */ `
uniform sampler2D tGlyphs;
uniform float uGlyphCount;

void main() {
  vec2 px = vUv * uResolution;
  vec4 s = cellSample(cellCenter(px));
  float value = cellValue(s);
  float glyph = floor(value * (uGlyphCount - 1.0) + 0.5);
  if (glyph < 1.0) {
    gl_FragColor = vec4(0.0);
    return;
  }
  vec2 local = fract(px / uCell);
  float ink = texture2D(tGlyphs, vec2((glyph + local.x) / uGlyphCount, local.y)).r;
  gl_FragColor = vec4(paint(s.rgb, value) * ink, ink);
}
`;

const PIXEL = /* glsl */ `
void main() {
  vec2 px = vUv * uResolution;
  vec4 s = cellSample(cellCenter(px));
  float value = cellValue(s);
  vec2 inCell = fract(px / uCell) * uCell;
  bool gap = uCell >= 4.0 && (inCell.x < 1.0 || inCell.y < 1.0);
  if (s.a < 0.08 || gap) {
    gl_FragColor = vec4(0.0);
    return;
  }
  vec3 color = floor(paint(s.rgb, value) * 6.0 + 0.5) / 6.0;
  gl_FragColor = vec4(color, 1.0);
}
`;

export function styleFragment(id: Exclude<StyleId, "none">): string {
  switch (id) {
    case "dither":
      return COMMON + DITHER;
    case "halftone":
      return COMMON + HALFTONE;
    case "ascii":
      return COMMON + ASCII;
    case "pixel":
      return COMMON + PIXEL;
    default: {
      const exhaustive: never = id;
      throw new Error(`Unknown style "${String(exhaustive)}"`);
    }
  }
}
