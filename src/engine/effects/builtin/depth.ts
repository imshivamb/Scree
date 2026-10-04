import { defineEffect } from "../registry";
import type { SurfaceShader } from "../../surface/registry";

export const shader: SurfaceShader = {
  id: "depth",
  fragment: /* glsl */ `
vec4 transition(vec2 p, float t) {
  float swell = sin(PI * t);
  vec2 center = (uUnion.xy + uUnion.zw) * 0.5;
  vec2 q = center + (p - center) * (1.0 - 0.06 * swell);
  vec2 direction = vec2(cos(t * PI * 0.8), sin(t * PI * 0.8));
  float strength = 0.09 * uParams.x * swell;
  // Brightness is depth: light parts move more than dark parts.
  vec4 from = srcAt(q + direction * (luma(srcAt(q).rgb) - 0.5) * strength);
  vec4 to = dstAt(q - direction * (luma(dstAt(q).rgb) - 0.5) * strength);
  vec4 color = blend(from, to, smoothstep(0.3, 0.7, t));
  color.rgb *= 1.0 - 0.18 * swell;
  return color;
}
`,
};

export const effect = defineEffect({
  id: "depth",
  label: "Depth parallax",
  description: "Brightness becomes depth; the picture tilts in space and turns into the next.",
  family: "surface",
  durationSeconds: 2,
  surface: { shader: "depth", params: [1, 0, 0, 0] },
});
