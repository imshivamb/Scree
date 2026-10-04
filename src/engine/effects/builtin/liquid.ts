import { defineEffect } from "../registry";
import type { SurfaceShader } from "../../surface/registry";

export const shader: SurfaceShader = {
  id: "liquid",
  fragment: /* glsl */ `
vec4 transition(vec2 p, float t) {
  float swell = sin(PI * t);
  vec2 q = unionUv(p) * 3.0;
  vec2 flow = vec2(fbm(q + vec2(uTime * 0.15, 0.0)), fbm(q + vec2(5.2, uTime * 0.12))) - 0.5;
  float amount = 0.35 * uParams.x;
  vec4 from = srcAt(p + flow * swell * amount);
  vec4 to = dstAt(p - flow * swell * amount);
  float field = fbm(unionUv(p) * 2.2 + 3.0);
  float m = smoothstep(field - 0.18, field + 0.18, t * 1.36 - 0.18);
  return blend(from, to, m);
}
`,
};

export const effect = defineEffect({
  id: "liquid",
  label: "Liquid",
  description: "The picture melts and ripples into the next one.",
  family: "surface",
  durationSeconds: 2,
  surface: { shader: "liquid", params: [1, 0, 0, 0] },
});
