import { defineEffect } from "../registry";
import type { SurfaceShader } from "../../surface/registry";

export const shader: SurfaceShader = {
  id: "ink",
  fragment: /* glsl */ `
vec4 transition(vec2 p, float t) {
  vec2 uv = unionUv(p);
  float spread = distance(uv, vec2(0.32, 0.58)) * 0.75 + (fbm(uv * 5.0) - 0.5) * 0.55;
  float edge = t * 1.45 - 0.1;
  float inside = 1.0 - smoothstep(edge - 0.06, edge, spread);
  vec4 from = srcAt(p);
  vec4 to = dstAt(p);
  vec4 color = blend(from, to, inside);
  // A dark, wet rim where the ink is still spreading.
  float rim = 1.0 - smoothstep(0.0, 0.05, abs(spread - edge + 0.03));
  float wet = rim * sin(PI * t) * uParams.x;
  color.rgb = mix(color.rgb, vec3(0.06, 0.05, 0.08), wet * 0.75);
  color.a = max(color.a, wet * 0.85 * max(from.a, to.a));
  return color;
}
`,
};

export const effect = defineEffect({
  id: "ink",
  label: "Ink bleed",
  description: "The next picture spreads through the page like ink.",
  family: "surface",
  durationSeconds: 2.2,
  surface: { shader: "ink", params: [1, 0, 0, 0] },
});
