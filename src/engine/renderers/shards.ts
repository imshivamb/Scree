import * as THREE from "three";

import { FIELD_SAMPLE_GLSL } from "../field-motion";
import type { MorphLook, RendererConfig } from "../types";
import { applyLook, createSharedFieldUniforms } from "./field-material";
import { bindInstancedField, SHARD_DRAW_BUDGET, thinField } from "./instanced-field";
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
varying float vFlight;
varying float vSeed;

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
  float angle = aSeed * 6.28318 + field.flight * 3.4 + uTime * field.flight * 1.6;
  float cosine = cos(angle);
  float sine = sin(angle);
  vec2 local = vec2(
    cosine * position.x - sine * position.y,
    sine * position.x + cosine * position.y
  );
  float size = uParticleSize * (0.92 + aSeed * 0.12) * (1.0 + field.flight * 0.1);
  vec3 viewPosition = (modelViewMatrix * vec4(field.position, 1.0)).xyz;
  float depthScale = 2.2 / max(0.45, -viewPosition.z);
  viewPosition.xy += local * size * depthScale;
  viewPosition.z += (aSeed - 0.5) * size * 0.2;
  gl_Position = projectionMatrix * vec4(viewPosition, 1.0);
  vColor = field.color;
  vFlight = field.flight;
  vSeed = aSeed;
}
`;

const FRAGMENT = /* glsl */ `
uniform float uGlow;
uniform float uOpacity;
uniform float uFlatOutput;

varying vec3 vColor;
varying float vFlight;
varying float vSeed;

void main() {
  if (uFlatOutput > 0.5) {
    gl_FragColor = vec4(vColor, 1.0);
    return;
  }
  float facet = 0.67 + vSeed * 0.28 + vFlight * 0.12;
  vec3 color = vColor * facet + vec3(uGlow * 0.12);
  gl_FragColor = vec4(color, 0.84 * uOpacity);
}
`;

function createTriangleGeometry(): THREE.InstancedBufferGeometry {
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute([0, 0.58, 0, -0.5, -0.4, 0, 0.5, -0.4, 0], 3),
  );
  geometry.instanceCount = 0;
  return geometry;
}

export class ShardsRenderer implements ParticleRenderer {
  readonly id = "shards" as const;
  readonly object: THREE.Mesh;
  private readonly geometry = createTriangleGeometry();
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
      side: THREE.DoubleSide,
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
      thinField(field, SHARD_DRAW_BUDGET),
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
      id: "shards",
      particleCount: this.particleCount || 1,
      viewportWidth: this.viewport.width,
      viewportHeight: this.viewport.height,
      pointBaseSize: this.look.particleSize,
      sizeMultiplier: this.config.size,
    });
    this.material.uniforms.uOpacity.value = this.config.opacity;
  }
}
