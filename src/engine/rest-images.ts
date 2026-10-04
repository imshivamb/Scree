import * as THREE from "three";

import { imageForTarget, textureFor } from "./pieces/textures";
import type { ParticleTarget, TargetImage } from "./sources/types";

/** How far into the morph the real pictures hand over to the points (and back). */
const HANDOFF = 0.16;

const VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const FRAGMENT = /* glsl */ `
uniform sampler2D uImage;
uniform float uAlpha;
uniform float uFlatOutput;
varying vec2 vUv;
void main() {
  vec4 color = texture2D(uImage, vUv);
  float alpha = color.a * uAlpha;
  if (alpha < 0.004) discard;
  gl_FragColor = uFlatOutput > 0.5 ? vec4(color.rgb, 1.0) : vec4(color.rgb, alpha);
}
`;

function plane(): THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial> {
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      uniforms: { uImage: { value: null }, uAlpha: { value: 0 }, uFlatOutput: { value: 0 } },
      transparent: true,
      depthTest: false,
      depthWrite: false,
    }),
  );
  mesh.frustumCulled = false;
  mesh.renderOrder = -1;
  return mesh;
}

function place(mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>, image: TargetImage | null): void {
  mesh.visible = Boolean(image);
  if (!image) return;
  const { left, right, bottom, top } = image.rect;
  mesh.scale.set(right - left, top - bottom, 1);
  mesh.position.set((left + right) / 2, (bottom + top) / 2, -0.001);
  mesh.material.uniforms.uImage.value = textureFor(image);
}

const smoothstep = (edge0: number, edge1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

/**
 * For point effects: the real source picture at the start and the real
 * destination picture at the end, so a dissolve begins and ends crisp.
 */
export class RestImages {
  readonly object = new THREE.Group();
  private readonly from = plane();
  private readonly to = plane();
  private enabled = false;

  constructor() {
    this.object.add(this.from, this.to);
    this.object.visible = false;
  }

  /** Point at a source/destination pair. Targets without a picture just show points. */
  setField(source: ParticleTarget, destination: ParticleTarget, enabled: boolean): void {
    this.enabled = enabled;
    this.object.visible = enabled;
    if (!enabled) return;
    place(this.from, source.image ? imageForTarget(source) : null);
    place(this.to, destination.image ? imageForTarget(destination) : null);
  }

  /**
   * Show the pictures near the ends and return how visible the points should
   * be (0 at the very ends when a picture covers them, 1 mid-flight).
   */
  setProgress(progress: number): number {
    if (!this.enabled) return 1;
    const fromAlpha = this.from.visible ? 1 - smoothstep(0, HANDOFF, progress) : 0;
    const toAlpha = this.to.visible ? smoothstep(1 - HANDOFF, 1, progress) : 0;
    this.from.material.uniforms.uAlpha.value = fromAlpha;
    this.to.material.uniforms.uAlpha.value = toAlpha;
    return 1 - Math.max(fromAlpha, toAlpha);
  }

  setFlatOutput(flat: boolean): void {
    for (const mesh of [this.from, this.to]) mesh.material.uniforms.uFlatOutput.value = flat ? 1 : 0;
  }

  dispose(): void {
    for (const mesh of [this.from, this.to]) {
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
  }
}
