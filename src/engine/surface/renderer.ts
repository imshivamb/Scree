import * as THREE from "three";

import type { EffectDefinition } from "../effects/types";
import { imageForTarget, textureFor } from "../pieces/textures";
import type { ParticleFieldBuffers, ParticleRenderer } from "../renderers/types";
import type { TargetImage } from "../sources/types";
import { SURFACE_COMMON } from "./common";
import { getSurfaceShader, type SurfaceShader } from "./registry";

const SEGMENTS = 120;

const FLAT_VERTEX = /* glsl */ `
varying vec2 vWorld;
void main() {
  vWorld = position.xy;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

function transitionFragment(shader: SurfaceShader): string {
  return /* glsl */ `
${SURFACE_COMMON}
uniform float uFlatOutput;
varying vec2 vWorld;
${shader.fragment ?? ""}
void main() {
  vec4 color = uProgress <= 0.0 ? srcAt(vWorld)
    : uProgress >= 1.0 ? dstAt(vWorld)
    : transition(vWorld, uProgress);
  if (color.a < 0.004) discard;
  gl_FragColor = uFlatOutput > 0.5 ? vec4(color.rgb, 1.0) : color;
}
`;
}

function sheetVertex(shader: SurfaceShader): string {
  return /* glsl */ `
${SURFACE_COMMON}
${shader.layered?.deform ?? ""}
varying vec2 vWorld;
varying float vLift;
void main() {
  vWorld = position.xy;
  vec3 moved = uProgress <= 0.0 ? position : deform(position, min(uProgress, 1.0));
  vLift = moved.z;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(moved, 1.0);
}
`;
}

const SHEET_FRAGMENT = /* glsl */ `
${SURFACE_COMMON}
uniform float uFlatOutput;
varying vec2 vWorld;
varying float vLift;
void main() {
  if (uProgress >= 1.0) discard;
  vec4 front = srcAt(vWorld);
  if (front.a < 0.004) discard;
  // The back of the sheet: a pale, faded print of the front.
  vec4 color = gl_FrontFacing ? front : vec4(mix(front.rgb, vec3(0.93, 0.91, 0.87), 0.72), front.a);
  color.rgb *= 1.0 - clamp(vLift * 0.6, 0.0, 0.25);
  gl_FragColor = uFlatOutput > 0.5 ? vec4(color.rgb, 1.0) : color;
}
`;

function groundFragment(shader: SurfaceShader): string {
  return /* glsl */ `
${SURFACE_COMMON}
uniform float uFlatOutput;
varying vec2 vWorld;
${shader.layered?.revealed ?? ""}
void main() {
  if (uProgress <= 0.0) discard;
  float shown = uProgress >= 1.0 ? 1.0 : revealed(vWorld, uProgress);
  if (shown <= 0.0) discard;
  vec4 color = dstAt(vWorld);
  if (color.a < 0.004) discard;
  color.rgb *= mix(0.5, 1.0, shown);
  gl_FragColor = uFlatOutput > 0.5 ? vec4(color.rgb, 1.0) : color;
}
`;
}

type Uniforms = Record<string, THREE.IUniform>;

function rectVector(rect: TargetImage["rect"]): THREE.Vector4 {
  return new THREE.Vector4(rect.left, rect.bottom, rect.right, rect.top);
}

/** Draws transitions that work on whole images: liquid, ink, light, page peel… */
export class SurfaceRenderer implements ParticleRenderer {
  readonly id = "surface" as const;
  readonly pairsPoints = false;
  readonly object = new THREE.Group();
  private readonly uniforms: Uniforms = {
    uSrcTex: { value: null },
    uDstTex: { value: null },
    uSrcRect: { value: new THREE.Vector4(-1, -1, 1, 1) },
    uDstRect: { value: new THREE.Vector4(-1, -1, 1, 1) },
    uUnion: { value: new THREE.Vector4(-1, -1, 1, 1) },
    uSrcTexel: { value: new THREE.Vector2(0.01, 0.01) },
    uDstTexel: { value: new THREE.Vector2(0.01, 0.01) },
    uProgress: { value: 1 },
    uTime: { value: 0 },
    uParams: { value: new THREE.Vector4(1, 1, 1, 1) },
    uFlatOutput: { value: 0 },
  };
  private readonly meshes: THREE.Mesh[] = [];
  private shader: SurfaceShader | null = null;
  private geometry = new THREE.PlaneGeometry(2, 2, SEGMENTS, SEGMENTS);

  constructor() {
    this.object.frustumCulled = false;
  }

  setEffect(effect: EffectDefinition): void {
    if (!effect.surface) return;
    const shader = getSurfaceShader(effect.surface.shader);
    if (!shader) throw new Error(`Unknown surface shader "${effect.surface.shader}"`);
    const params = effect.surface.params ?? [1, 1, 1, 1];
    (this.uniforms.uParams.value as THREE.Vector4).set(...params);
    if (shader === this.shader) return;
    this.shader = shader;
    this.rebuildMeshes();
  }

  private rebuildMeshes(): void {
    for (const mesh of this.meshes) {
      this.object.remove(mesh);
      (mesh.material as THREE.Material).dispose();
    }
    this.meshes.length = 0;
    const shader = this.shader;
    if (!shader) return;
    const material = (vertexShader: string, fragmentShader: string, side: THREE.Side) =>
      new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader,
        uniforms: this.uniforms,
        transparent: true,
        depthTest: true,
        depthWrite: true,
        side,
      });
    if (shader.layered) {
      const ground = new THREE.Mesh(this.geometry, material(FLAT_VERTEX, groundFragment(shader), THREE.FrontSide));
      ground.position.z = -0.002;
      const sheet = new THREE.Mesh(this.geometry, material(sheetVertex(shader), SHEET_FRAGMENT, THREE.DoubleSide));
      this.meshes.push(ground, sheet);
    } else {
      this.meshes.push(new THREE.Mesh(this.geometry, material(FLAT_VERTEX, transitionFragment(shader), THREE.FrontSide)));
    }
    for (const mesh of this.meshes) {
      mesh.frustumCulled = false;
      this.object.add(mesh);
    }
  }

  warm(field: ParticleFieldBuffers): TargetImage[] {
    const source = imageForTarget(field.source);
    const destination = imageForTarget(field.destination);
    return source && destination ? [source, destination] : [];
  }

  setField(field: ParticleFieldBuffers): void {
    const source = imageForTarget(field.source);
    const destination = imageForTarget(field.destination);
    if (!source || !destination) return;
    const left = Math.min(source.rect.left, destination.rect.left);
    const right = Math.max(source.rect.right, destination.rect.right);
    const bottom = Math.min(source.rect.bottom, destination.rect.bottom);
    const top = Math.max(source.rect.top, destination.rect.top);
    this.geometry.dispose();
    this.geometry = new THREE.PlaneGeometry(right - left, top - bottom, SEGMENTS, SEGMENTS);
    this.geometry.translate((left + right) / 2, (bottom + top) / 2, 0);
    for (const mesh of this.meshes) mesh.geometry = this.geometry;

    this.uniforms.uSrcTex.value = textureFor(source);
    this.uniforms.uDstTex.value = textureFor(destination);
    this.uniforms.uSrcRect.value = rectVector(source.rect);
    this.uniforms.uDstRect.value = rectVector(destination.rect);
    (this.uniforms.uUnion.value as THREE.Vector4).set(left, bottom, right, top);
    const texel = (image: TargetImage) =>
      new THREE.Vector2(
        (image.rect.right - image.rect.left) / image.pixels.width,
        (image.rect.top - image.rect.bottom) / image.pixels.height,
      );
    this.uniforms.uSrcTexel.value = texel(source);
    this.uniforms.uDstTexel.value = texel(destination);
  }

  setProgress(progress: number): void {
    this.uniforms.uProgress.value = progress;
  }

  getProgress(): number {
    return this.uniforms.uProgress.value as number;
  }

  setTime(time: number): void {
    this.uniforms.uTime.value = time;
  }

  setFlatOutput(flat: boolean): void {
    this.uniforms.uFlatOutput.value = flat ? 1 : 0;
  }

  setConfig(): void {}
  setLook(): void {}
  setSourceScale(): void {}
  setTargetScale(): void {}
  setDpr(): void {}
  setViewport(): void {}

  dispose(): void {
    this.geometry.dispose();
    for (const mesh of this.meshes) (mesh.material as THREE.Material).dispose();
  }
}
