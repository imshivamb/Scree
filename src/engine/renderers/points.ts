import * as THREE from "three";

import { FIELD_SAMPLE_GLSL } from "../field-motion";
import type { MorphLook, RendererConfig } from "../types";
import { applyLook, createSharedFieldUniforms } from "./field-material";
import { POINT_KEEP_RATIO, thinField } from "./instanced-field";
import { resolveRendererSize } from "./sizing";
import type { ParticleFieldBuffers, ParticleRenderer } from "./types";

const VERTEX = /* glsl */ `
${FIELD_SAMPLE_GLSL}
uniform float uParticleSize;
uniform float uDpr;

attribute vec3 aTargetPosition;
attribute vec3 aSourceColor;
attribute vec3 aTargetColor;
attribute vec3 aSourceNormal;
attribute vec3 aTargetNormal;
attribute float aSeed;

varying vec3 vColor;
varying float vFlight;

void main() {
  FieldSample field = sampleField(
    position,
    aTargetPosition,
    aSourceColor,
    aTargetColor,
    aSourceNormal,
    aTargetNormal,
    aSeed
  );
  vec4 viewPosition = modelViewMatrix * vec4(field.position, 1.0);
  gl_Position = projectionMatrix * viewPosition;
  gl_PointSize = uParticleSize * uDpr * (1.0 + field.flight * 0.35) * (2.1 / max(0.35, -viewPosition.z));
  vColor = field.color;
  vFlight = field.flight;
}
`;

const FRAGMENT = /* glsl */ `
uniform float uGlow;
uniform float uOpacity;
uniform float uFlatOutput;

varying vec3 vColor;
varying float vFlight;

void main() {
  vec2 point = gl_PointCoord * 2.0 - 1.0;
  float radius = length(point);
  if (radius > 1.0) discard;
  if (uFlatOutput > 0.5) {
    gl_FragColor = vec4(vColor, 1.0);
    return;
  }

  float core = smoothstep(1.0, 0.18, radius);
  float halo = smoothstep(1.0, 0.0, radius) * uGlow * (0.45 + vFlight * 0.35);
  vec3 color = vColor * (0.72 + core * 0.55) + vec3(halo);
  float alpha = (core * 0.92 + halo * 0.35) * uOpacity;
  gl_FragColor = vec4(color, alpha);
}
`;

export class PointsRenderer implements ParticleRenderer {
  readonly id = "points" as const;
  readonly pairsPoints = true;
  readonly object: THREE.Points;
  private readonly geometry = new THREE.BufferGeometry();
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
      blending: THREE.AdditiveBlending,
    });
    this.material.uniforms.uDpr.value = dpr;
    this.object = new THREE.Points(this.geometry, this.material);
    // The shader moves every point; CPU bounds are meaningless (and start empty).
    this.object.frustumCulled = false;
    this.refreshSize();
  }

  setField(field: ParticleFieldBuffers): void {
    const drawn = thinField(
      field,
      Math.max(1, Math.floor(field.source.seeds.length * POINT_KEEP_RATIO)),
    );
    this.particleCount = drawn.source.seeds.length;
    this.geometry.setAttribute(
      "position",
      new THREE.BufferAttribute(drawn.source.positions, 3),
    );
    this.geometry.setAttribute(
      "aTargetPosition",
      new THREE.BufferAttribute(drawn.destination.positions, 3),
    );
    this.geometry.setAttribute(
      "aSourceColor",
      new THREE.BufferAttribute(drawn.source.colors, 3),
    );
    this.geometry.setAttribute(
      "aTargetColor",
      new THREE.BufferAttribute(drawn.destination.colors, 3),
    );
    this.geometry.setAttribute(
      "aSourceNormal",
      new THREE.BufferAttribute(drawn.source.normals, 3),
    );
    this.geometry.setAttribute(
      "aTargetNormal",
      new THREE.BufferAttribute(drawn.destination.normals, 3),
    );
    this.geometry.setAttribute(
      "aSeed",
      new THREE.BufferAttribute(drawn.source.seeds, 1),
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
    this.material.uniforms.uOpacity.value = config.opacity;
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
      id: "points",
      particleCount: this.particleCount || 1,
      viewportWidth: this.viewport.width,
      viewportHeight: this.viewport.height,
      pointBaseSize: this.look.particleSize,
      sizeMultiplier: this.config.size,
    });
    this.material.uniforms.uOpacity.value = this.config.opacity;
  }
}
