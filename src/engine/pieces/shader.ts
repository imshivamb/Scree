/** Pieces: real fragments of the source image travel to their matched place in the destination. */

export const PIECES_VERTEX = /* glsl */ `
uniform float uProgress;
uniform float uStagger;
uniform int uStaggerBy;
uniform float uLift;
uniform float uArc;
uniform float uTilt;
uniform int uFlip;
uniform float uDip;
uniform float uJolt;
uniform float uOvershoot;
uniform float uFocus;
uniform vec2 uSwap;

attribute vec3 aDstPosition;
attribute vec2 aSrcUv;
attribute vec2 aDstUv;
attribute vec3 aSrcCenter;
attribute vec3 aDstCenter;
attribute vec4 aKeysA; // seed, random, x, y
attribute vec4 aKeysB; // radial, travel, index, -

varying vec2 vSrcUv;
varying vec2 vDstUv;
varying float vSwap;
varying float vFlight;
varying vec3 vNormal;

const float PI = 3.14159265;

vec3 rotateAxis(vec3 v, vec3 axis, float angle) {
  float c = cos(angle);
  float s = sin(angle);
  return v * c + cross(axis, v) * s + axis * dot(axis, v) * (1.0 - c);
}

float staggerKey() {
  if (uStaggerBy == 1) return aKeysA.z;
  if (uStaggerBy == 2) return aKeysA.w;
  if (uStaggerBy == 3) return aKeysB.x;
  if (uStaggerBy == 4) return aKeysB.y;
  if (uStaggerBy == 5) return aKeysB.z;
  return aKeysA.y;
}

void main() {
  float start = staggerKey() * uStagger;
  float local = clamp((uProgress - start) / max(1.0 - uStagger, 1e-3), 0.0, 1.0);
  vSrcUv = aSrcUv;
  vDstUv = aDstUv;
  vSwap = smoothstep(uSwap.x, uSwap.y, local);

  // Rest frames are exact: every piece sits precisely in its image.
  if (local <= 0.0 || local >= 1.0) {
    vFlight = 0.0;
    vNormal = vec3(0.0, 0.0, 1.0);
    vec3 rest = local <= 0.0 ? position : aDstPosition;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(rest, 1.0);
    return;
  }

  float eased = local * local * (3.0 - 2.0 * local);
  if (uOvershoot > 0.0) {
    float t = local - 1.0;
    float s = 1.70158 * uOvershoot;
    eased = 1.0 + (s + 1.0) * t * t * t + s * t * t;
  }
  float flight = sin(PI * local);
  vFlight = flight;
  // Pieces that travel far carry the drama; pieces that stay put barely stir.
  float energy = mix(1.0, 0.12 + 0.88 * aKeysB.y, uFocus);

  vec3 center = mix(aSrcCenter, aDstCenter, eased);
  vec2 path = aDstCenter.xy - aSrcCenter.xy;
  float pathLength = length(path);
  vec2 side = pathLength > 1e-5 ? vec2(-path.y, path.x) / pathLength : vec2(0.0, 1.0);
  center.xy += side * flight * uArc * energy * (aKeysA.x * 2.0 - 1.0) * max(pathLength, 0.2);
  center.z += flight * uLift * energy * (0.55 + 0.45 * aKeysA.y);
  if (uJolt > 0.0) {
    float step = floor(local * 7.0 + aKeysA.x * 3.0);
    float jump = fract(sin(step * 91.7 + aKeysA.x * 317.3) * 43758.5453) - 0.5;
    center.x += jump * uJolt * flight;
  }

  vec3 local0 = position - aSrcCenter;
  vec3 local1 = aDstPosition - aDstCenter;
  vec3 offset = mix(local0, local1, eased);
  vec3 normal = vec3(0.0, 0.0, 1.0);
  if (uFlip > 0) {
    vec3 axis = uFlip == 1 ? vec3(1.0, 0.0, 0.0) : uFlip == 2 ? vec3(0.0, 1.0, 0.0)
      : vec3(cos(aKeysA.x * 6.2831), sin(aKeysA.x * 6.2831), 0.0);
    // Pre-turn the destination shape so a half turn lands it the right way round.
    vec3 landed = rotateAxis(local1, axis, PI);
    offset = rotateAxis(mix(local0, landed, eased), axis, PI * eased);
    normal = rotateAxis(normal, axis, PI * eased);
  }
  vec3 tumbleAxis = normalize(vec3(aKeysA.x - 0.5, aKeysA.y - 0.5, 0.35));
  float tumble = flight * uTilt * energy * (aKeysA.y * 2.0 - 1.0);
  offset = rotateAxis(offset, tumbleAxis, tumble);
  normal = rotateAxis(normal, tumbleAxis, tumble);
  offset *= 1.0 - flight * uDip;

  vNormal = normal;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(center + offset, 1.0);
}
`;

export const PIECES_FRAGMENT = /* glsl */ `
uniform sampler2D uSrcTex;
uniform sampler2D uDstTex;
uniform float uOpacity;
uniform float uRgbSplit;
uniform float uFlatOutput;
uniform int uFlip;

varying vec2 vSrcUv;
varying vec2 vDstUv;
varying float vSwap;
varying float vFlight;
varying vec3 vNormal;

vec4 sampleSplit(sampler2D image, vec2 uv) {
  vec4 color = texture2D(image, uv);
  if (uRgbSplit > 0.0) {
    float shift = uRgbSplit * vFlight;
    color.r = texture2D(image, uv + vec2(shift, 0.0)).r;
    color.b = texture2D(image, uv - vec2(shift, 0.0)).b;
  }
  return color;
}

void main() {
  // Flipping pieces show the old image on the front and the new one on the back.
  float toNew = uFlip > 0 ? (gl_FrontFacing ? 0.0 : 1.0) : vSwap;
  vec4 color = mix(sampleSplit(uSrcTex, vSrcUv), sampleSplit(uDstTex, vDstUv), toNew);
  if (color.a < 0.01) discard;

  vec3 normal = gl_FrontFacing ? vNormal : -vNormal;
  float light = 0.8 + 0.28 * max(dot(normalize(normal), normalize(vec3(-0.35, 0.55, 0.76))), 0.0);
  color.rgb *= mix(1.0, light, vFlight);

  if (uFlatOutput > 0.5) {
    gl_FragColor = vec4(color.rgb, 1.0);
    return;
  }
  gl_FragColor = vec4(color.rgb, color.a * uOpacity);
}
`;
