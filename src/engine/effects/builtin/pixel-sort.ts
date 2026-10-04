import { defineEffect } from "../registry";
import type { SurfaceShader } from "../../surface/registry";

export const shader: SurfaceShader = {
  id: "pixel-sort",
  fragment: /* glsl */ `
vec4 transition(vec2 p, float t) {
  vec2 uv = unionUv(p);
  float column = floor(uv.x * 140.0);
  float delay = hash12(vec2(column, 3.7)) * 0.45;
  float local = clamp((t - delay) / 0.55, 0.0, 1.0);
  float stream = sin(PI * local) * (uUnion.w - uUnion.y) * 0.45 * uParams.x;
  // Bright pixels run, dark pixels stay: the streaks of a pixel sort.
  vec4 from = srcAt(p + vec2(0.0, stream * smoothstep(0.35, 0.8, luma(srcAt(p).rgb))));
  vec4 to = dstAt(p - vec2(0.0, stream * smoothstep(0.35, 0.8, luma(dstAt(p).rgb))));
  return blend(from, to, smoothstep(0.4, 0.6, local));
}
`,
};

export const effect = defineEffect({
  id: "pixel-sort",
  label: "Pixel sort",
  description: "Bright pixels stream down in columns and settle as the next picture.",
  family: "surface",
  durationSeconds: 2,
  surface: { shader: "pixel-sort", params: [1, 0, 0, 0] },
});
