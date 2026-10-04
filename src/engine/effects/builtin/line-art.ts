import { defineEffect } from "../registry";
import type { SurfaceShader } from "../../surface/registry";

export const shader: SurfaceShader = {
  id: "line-art",
  fragment: /* glsl */ `
float tone(vec2 p) {
  vec4 c = dstAt(p);
  return luma(c.rgb) * c.a + c.a * 0.5;
}

float edges(vec2 p) {
  vec2 e = uDstTexel * 1.5;
  float dx = tone(p + vec2(e.x, 0.0)) - tone(p - vec2(e.x, 0.0));
  float dy = tone(p + vec2(0.0, e.y)) - tone(p - vec2(0.0, e.y));
  return clamp(length(vec2(dx, dy)) * 4.0, 0.0, 1.0);
}

vec4 transition(vec2 p, float t) {
  vec2 uv = unionUv(p);
  float key = uv.x * 0.7 + (1.0 - uv.y) * 0.3 + (noise(uv * 12.0) - 0.5) * 0.08;
  float drawn = smoothstep(key - 0.04, key, t * 2.1 - 0.05);
  float fill = smoothstep(0.55, 0.95, t);
  vec4 old = srcAt(p);
  old.a *= 1.0 - smoothstep(0.0, 0.45, t);
  float line = edges(p) * drawn * uParams.x;
  vec4 sketch = vec4(mix(old.rgb, vec3(0.96, 0.94, 0.9), line), max(old.a, line));
  return blend(sketch, dstAt(p), fill);
}
`,
};

export const effect = defineEffect({
  id: "line-art",
  label: "Line-art draw-on",
  description: "The next picture is drawn in lines first, then filled in.",
  family: "surface",
  durationSeconds: 2.6,
  surface: { shader: "line-art", params: [1, 0, 0, 0] },
});
