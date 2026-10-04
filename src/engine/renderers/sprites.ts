import * as THREE from "three";

import { FIELD_SAMPLE_GLSL } from "../field-motion";
import type { MorphLook, RendererConfig } from "../types";
import { applyLook, createSharedFieldUniforms } from "./field-material";
import { bindInstancedField, SPRITE_DRAW_BUDGET, thinField } from "./instanced-field";
import { resolveRendererSize } from "./sizing";
import type { ParticleFieldBuffers, ParticleRenderer } from "./types";

const VERTEX = /* glsl */ `
${FIELD_SAMPLE_GLSL}
uniform float uParticleSize;

attribute vec3 aSourcePosition;
attribute vec3 aTargetPosition;
attribute vec3 aSourceColor;
attribute vec3 aTargetColor;
attribute vec3 aSourceNormal;
attribute vec3 aTargetNormal;
attribute float aSeed;

varying vec3 vColor;
varying vec2 vUv;
varying float vFlight;

void main() {
  FieldSample field = sampleField(
    aSourcePosition,
    aTargetPosition,
    aSourceColor,
    aTargetColor,
    aSourceNormal,
    aTargetNormal,
    aSeed
  );
  float size = uParticleSize * (0.94 + aSeed * 0.08) * (1.0 + field.flight * 0.08);
  vec3 viewPosition = (modelViewMatrix * vec4(field.position, 1.0)).xyz;
  float depthScale = 2.2 / max(0.45, -viewPosition.z);
  viewPosition.xy += position.xy * size * depthScale;
  gl_Position = projectionMatrix * vec4(viewPosition, 1.0);
  vColor = field.color;
  vUv = position.xy + 0.5;
  vFlight = field.flight;
}
`;

const FRAGMENT = /* glsl */ `
uniform float uGlow;
uniform float uOpacity;
uniform float uFlatOutput;

varying vec3 vColor;
varying vec2 vUv;
varying float vFlight;

void main() {
  vec2 point = vUv * 2.0 - 1.0;
  float radius = length(point);
  if (radius > 1.0) discard;
  if (uFlatOutput > 0.5) {
    gl_FragColor = vec4(vColor, 1.0);
    return;
  }

  float fill = smoothstep(1.0, 0.38, radius);
  float halo = smoothstep(1.0, 0.62, radius) * uGlow * 0.12;
  float alpha = (fill * 0.55 + halo * 0.08) * uOpacity;
  gl_FragColor = vec4(vColor * (0.78 + fill * 0.18), alpha);
}
`;

function createQuadGeometry(): THREE.InstancedBufferGeometry {
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(
      [-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0],
      3,
    ),
  );
  geometry.instanceCount = 0;
  return geometry;
}

export class SpritesRenderer implements ParticleRenderer {
  readonly id = "sprites" as const;
  readonly object: THREE.Mesh;
  private readonly geometry = createQuadGeometry();
  private readonly material: THREE.ShaderMaterial;
  private look: MorphLook;
  private config: RendererConfig;
  private particleCount = 0;
  private viewport = { width: 900, height: 900 };

  constructor(look: MorphLook, config: RendererConfig, dpr: number) {
    this.look = look;
    this.config = config;
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      uniforms: createSharedFieldUniforms(look),
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
    });
    this.material.uniforms.uDpr.value = dpr;
    this.object = new THREE.Mesh(this.geometry, this.material);
    // The shader moves every point; CPU bounds are meaningless (and start empty).
    this.object.frustumCulled = false;
    this.object.frustumCulled = false;
  }

  setField(field: ParticleFieldBuffers): void {
    this.particleCount = bindInstancedField(
      this.geometry,
      thinField(field, SPRITE_DRAW_BUDGET),
    );
    this.refreshSize();
  }

  setProgress(progress: number): void {
    this.material.uniforms.uProgress.value = progress;
  }

  setTime(time: number): void {
    this.material.uniforms.uTime.value = time;
  }

  setLook(look: MorphLook): void {
    this.look = look;
    applyLook(this.material.uniforms, look);
    this.refreshSize();
  }

  setSourceScale(scale: THREE.Vector3): void {
    this.material.uniforms.uSourceScale.value.copy(scale);
  }

  setTargetScale(scale: THREE.Vector3): void {
    this.material.uniforms.uTargetScale.value.copy(scale);
  }

  setDpr(dpr: number): void {
    this.material.uniforms.uDpr.value = dpr;
  }

  setViewport(width: number, height: number): void {
    this.viewport = { width, height };
    this.refreshSize();
  }

  setConfig(config: RendererConfig): void {
    this.config = config;
    this.refreshSize();
  }

  setFlatOutput(flat: boolean): void {
    this.material.uniforms.uFlatOutput.value = flat ? 1 : 0;
  }

  getProgress(): number {
    return this.material.uniforms.uProgress.value as number;
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }

  private refreshSize(): void {
    this.material.uniforms.uParticleSize.value = resolveRendererSize({
      id: "sprites",
      particleCount: this.particleCount || 1,
      viewportWidth: this.viewport.width,
      viewportHeight: this.viewport.height,
      pointBaseSize: this.look.particleSize,
      sizeMultiplier: this.config.size,
    });
    this.material.uniforms.uOpacity.value = this.config.opacity;
  }
}
