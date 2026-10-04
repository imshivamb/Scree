import { defineEffect } from "../registry";
import type { SurfaceShader } from "../../surface/registry";

/** Shared by the sheet (deform) and the ground (revealed). */
const PEEL = /* glsl */ `
const vec2 PEEL_DIR = vec2(0.857, -0.514);

float peelRadius() {
  return (uUnion.z - uUnion.x) * 0.06 * uParams.x;
}

float peelAlong(vec2 p) {
  return dot(p - (uUnion.xy + uUnion.zw) * 0.5, PEEL_DIR);
}

float peelLine(float t) {
  vec2 halfSize = (uUnion.zw - uUnion.xy) * 0.5;
  float reach = abs(PEEL_DIR.x) * halfSize.x + abs(PEEL_DIR.y) * halfSize.y;
  float eased = t * t * (3.0 - 2.0 * t);
  return mix(reach + 0.01, -reach - PI * peelRadius() - 0.01, eased);
}
`;

export const shader: SurfaceShader = {
  id: "peel",
  layered: {
    deform: /* glsl */ `
${PEEL}
vec3 deform(vec3 p, float t) {
  float x = peelAlong(p.xy);
  float line = peelLine(t);
  if (x <= line) return p;
  float radius = peelRadius();
  float d = x - line;
  float angle = d / radius;
  float nx;
  float lift;
  if (angle < PI) {
    nx = line + radius * sin(angle);
    lift = radius * (1.0 - cos(angle));
  } else {
    nx = line - (d - PI * radius);
    lift = 2.0 * radius;
  }
  return vec3(p.xy + PEEL_DIR * (nx - x), p.z + lift);
}
`,
    revealed: /* glsl */ `
${PEEL}
float revealed(vec2 p, float t) {
  float d = peelAlong(p) - peelLine(t);
  if (d <= 0.0) return 0.0;
  return 0.3 + 0.7 * smoothstep(0.0, peelRadius() * 2.5, d);
}
`,
  },
};

export const effect = defineEffect({
  id: "peel",
  label: "Page peel",
  description: "The picture curls away like a page and reveals the next one underneath.",
  family: "surface",
  durationSeconds: 2,
  surface: { shader: "peel", params: [1, 0, 0, 0] },
});
