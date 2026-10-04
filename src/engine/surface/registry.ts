/**
 * A surface shader draws one moment of a transition between two images laid
 * on a plane. Write `vec4 transition(vec2 p, float t)` (p = world position,
 * t = 0..1) using the helpers in `SURFACE_COMMON`; the renderer guarantees
 * t = 0 shows the source and t = 1 the destination exactly.
 *
 * `layered` shaders (page peel) instead get a lifted source sheet over a flat
 * destination: write `vec3 deform(vec3 p, float t)` for the sheet and
 * `float revealed(vec2 p, float t)` (1 where the sheet has left).
 */
export type SurfaceShader = {
  id: string;
  fragment?: string;
  layered?: {
    deform: string;
    revealed: string;
  };
};

const shaders = new Map<string, SurfaceShader>();

export function registerSurfaceShader(shader: SurfaceShader): void {
  if (!shader.fragment && !shader.layered) {
    throw new Error(`Surface shader "${shader.id}" needs a fragment or layered deform`);
  }
  shaders.set(shader.id, shader);
}

export function getSurfaceShader(id: string): SurfaceShader | undefined {
  return shaders.get(id);
}
