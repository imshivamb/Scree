/** Uniforms and helpers every surface shader can use. */
export const SURFACE_COMMON = /* glsl */ `
uniform sampler2D uSrcTex;
uniform sampler2D uDstTex;
uniform vec4 uSrcRect;   // left, bottom, right, top (world)
uniform vec4 uDstRect;
uniform vec4 uUnion;     // both rects together
uniform vec2 uSrcTexel;  // one texel in world units
uniform vec2 uDstTexel;
uniform float uProgress;
uniform float uTime;
uniform vec4 uParams;

const float PI = 3.14159265;

vec4 sampleRect(sampler2D image, vec4 rect, vec2 p) {
  vec2 uv = (p - rect.xy) / (rect.zw - rect.xy);
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return vec4(0.0);
  return texture2D(image, uv);
}
vec4 srcAt(vec2 p) { return sampleRect(uSrcTex, uSrcRect, p); }
vec4 dstAt(vec2 p) { return sampleRect(uDstTex, uDstRect, p); }

/** 0..1 across the union of both images. */
vec2 unionUv(vec2 p) { return (p - uUnion.xy) / (uUnion.zw - uUnion.xy); }

float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x),
             mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x), u.y);
}

float fbm(vec2 p) {
  float total = 0.0;
  float amplitude = 0.5;
  for (int octave = 0; octave < 5; octave++) {
    total += noise(p) * amplitude;
    p = p * 2.03 + 17.1;
    amplitude *= 0.5;
  }
  return total;
}

/** Straight-alpha blend of two samples (keeps transparent edges clean). */
vec4 blend(vec4 a, vec4 b, float m) {
  float alpha = mix(a.a, b.a, m);
  vec3 rgb = (a.rgb * a.a * (1.0 - m) + b.rgb * b.a * m) / max(alpha, 1e-4);
  return vec4(rgb, alpha);
}
`;
