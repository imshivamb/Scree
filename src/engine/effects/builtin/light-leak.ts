import { defineEffect } from "../registry";
import type { SurfaceShader } from "../../surface/registry";

export const shader: SurfaceShader = {
  id: "light-leak",
  fragment: /* glsl */ `
vec4 transition(vec2 p, float t) {
  vec2 uv = unionUv(p);
  float along = dot(uv, vec2(0.944, 0.33));
  float sweep = mix(-0.35, 1.65, t);
  float behind = 1.0 - smoothstep(sweep - 0.12, sweep + 0.12, along);
  vec4 color = blend(srcAt(p), dstAt(p), behind);
  float glow = exp(-pow((along - sweep) / 0.16, 2.0)) * sin(PI * t) * uParams.x;
  vec3 warm = mix(vec3(1.0, 0.42, 0.18), vec3(1.0, 0.86, 0.6), glow);
  color.rgb = min(color.rgb + warm * glow * 0.9, vec3(1.0));
  return color;
}
`,
};

export const effect = defineEffect({
  id: "light-leak",
  label: "Light leak",
  description: "A warm burn of light sweeps across and leaves the new picture behind.",
  family: "surface",
  durationSeconds: 1.8,
  surface: { shader: "light-leak", params: [1, 0, 0, 0] },
});
