import { defineEffect } from "../registry";
import type { SurfaceShader } from "../../surface/registry";

export const shader: SurfaceShader = {
  id: "depth",
  fragment: /* glsl */ `
vec4 transition(vec2 p, float t) {
  float swell = sin(PI * t);
  vec2 center = (uUnion.xy + uUnion.zw) * 0.5;
  vec2 q = center + (p - center) * (1.0 - 0.08 * swell);
  vec2 direction = vec2(1.0, 0.28);
  float strength = 0.35 * uParams.x * swell;
  float fromDepth = luma(srcAt(q).rgb);
  float toDepth = luma(dstAt(q).rgb);
  // Brightness is height: light parts swing further than dark ones.
  vec4 from = srcAt(q + direction * (fromDepth - 0.5) * strength);
  vec4 to = dstAt(q - direction * (toDepth - 0.5) * strength);
  // The new picture rises from its highlights first.
  float key = 1.0 - toDepth;
  float m = smoothstep(key - 0.2, key + 0.2, t * 1.4 - 0.2);
  vec4 color = blend(from, to, m);
  color.rgb = mix(color.rgb, color.rgb * vec3(0.72, 0.8, 1.0), 0.35 * swell);
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
