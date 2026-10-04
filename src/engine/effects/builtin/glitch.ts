import { defineEffect } from "../registry";
import type { SurfaceShader } from "../../surface/registry";

/**
 * A real glitch shifts the pixels inside each band (not the band itself, which
 * would tear black gaps), splits the colour channels, and flickers between
 * the two pictures before every band settles on the new one.
 */
export const shader: SurfaceShader = {
  id: "glitch",
  fragment: /* glsl */ `
vec4 sampleSide(float useNew, vec2 q) {
  return useNew > 0.5 ? dstAt(q) : srcAt(q);
}

vec4 transition(vec2 p, float t) {
  vec2 uv = unionUv(p);
  float width = uUnion.z - uUnion.x;
  float bands = 34.0 * uParams.x;
  float band = floor(uv.y * bands);
  float tick = floor(t * 22.0);
  float intensity = sin(PI * t);

  // More bands misbehave as the glitch peaks.
  float glitching = step(1.0 - intensity * 0.85, hash12(vec2(band, tick)));
  float shift = (hash12(vec2(band, tick + 7.0)) - 0.5) * 0.22 * width * intensity * glitching;

  // Each band commits to the new picture at its own moment; glitching bands flicker back.
  float useNew = step(hash12(vec2(band, 3.3)) * 0.7 + 0.15, t);
  if (glitching > 0.5 && hash12(vec2(band, tick + 13.0)) > 0.6) useNew = 1.0 - useNew;

  // Keep shifted samples inside the picture so bands never tear open.
  vec4 rect = useNew > 0.5 ? uDstRect : uSrcRect;
  vec2 q = vec2(clamp(p.x + shift, rect.x + 1e-4, rect.z - 1e-4), p.y);
  float split = 0.012 * width * intensity * (0.35 + glitching);
  vec4 color = sampleSide(useNew, q);
  color.r = sampleSide(useNew, vec2(clamp(q.x + split, rect.x, rect.z), q.y)).r;
  color.b = sampleSide(useNew, vec2(clamp(q.x - split, rect.x, rect.z), q.y)).b;

  // Faint scanlines while it glitches.
  float scan = 0.5 + 0.5 * sin(uv.y * 900.0);
  color.rgb *= 1.0 - 0.12 * intensity * scan;
  return color;
}
`,
};

export const effect = defineEffect({
  id: "glitch",
  label: "Glitch slice",
  description: "Bands jump and split their colours, flicker between both pictures, then snap to the new one.",
  family: "surface",
  durationSeconds: 1.2,
  surface: { shader: "glitch", params: [1, 0, 0, 0] },
});
