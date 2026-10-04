import * as THREE from "three";

import type { EffectDefinition, PieceEffect, StaggerMode } from "../effects/types";
import type { MatchStrategy } from "../match";
import type { ParticleFieldBuffers, ParticleRenderer } from "../renderers/types";
import type { TargetImage } from "../sources/types";
import type { RendererConfig } from "../types";
import { buildPieces, type PieceGeometry } from "./build";
import { PIECES_FRAGMENT, PIECES_VERTEX } from "./shader";
import { imageForTarget, textureFor } from "./textures";

const STAGGER: Record<StaggerMode, number> = { random: 0, x: 1, y: 2, radial: 3, travel: 4, index: 5 };
const FLIP = { none: 0, x: 1, y: 2, random: 3 } as const;

const DEFAULT_EFFECT: PieceEffect = {
  cut: { kind: "grid", density: 600 },
  motion: { stagger: 0.3, staggerBy: "random", lift: 0.3, arc: 0.15, tilt: 0.6, swap: [0.35, 0.65] },
};

const built = new WeakMap<TargetImage, WeakMap<TargetImage, Map<string, PieceGeometry>>>();

function cachedPieces(
  source: TargetImage,
  destination: TargetImage,
  effect: PieceEffect,
  match: MatchStrategy,
): PieceGeometry {
  const key = `${JSON.stringify(effect.cut)}|${match}`;
  let byDestination = built.get(source);
  if (!byDestination) {
    byDestination = new WeakMap();
    built.set(source, byDestination);
  }
  let byKey = byDestination.get(destination);
  if (!byKey) {
    byKey = new Map();
    byDestination.set(destination, byKey);
  }
  const hit = byKey.get(key);
  if (hit) return hit;
  const pieces = buildPieces(source, destination, effect.cut, match);
  byKey.set(key, pieces);
  return pieces;
}

/** Draws the source image cut into pieces that travel to their matched places in the destination. */
export class PiecesRenderer implements ParticleRenderer {
  readonly id = "pieces" as const;
  readonly pairsPoints = false;
  readonly object: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private effect: PieceEffect = DEFAULT_EFFECT;
  private match: MatchStrategy = "transport";
  private field: ParticleFieldBuffers | null = null;

  constructor(config: RendererConfig) {
    const material = new THREE.ShaderMaterial({
      vertexShader: PIECES_VERTEX,
      fragmentShader: PIECES_FRAGMENT,
      uniforms: {
        uProgress: { value: 1 },
        uStagger: { value: 0 },
        uStaggerBy: { value: 0 },
        uLift: { value: 0 },
        uArc: { value: 0 },
        uTilt: { value: 0 },
        uFlip: { value: 0 },
        uDip: { value: 0 },
        uJolt: { value: 0 },
        uOvershoot: { value: 0 },
        uFocus: { value: 0 },
        uGloss: { value: 0 },
        uSwap: { value: new THREE.Vector2(0.35, 0.65) },
        uSrcTex: { value: null },
        uDstTex: { value: null },
        uOpacity: { value: Math.max(config.opacity, 0.999) },
        uRgbSplit: { value: 0 },
        uFlatOutput: { value: 0 },
      },
      transparent: true,
      depthTest: true,
      depthWrite: true,
      side: THREE.DoubleSide,
    });
    this.object = new THREE.Mesh(new THREE.BufferGeometry(), material);
    this.object.frustumCulled = false;
    this.applyMotion();
  }

  setEffect(effect: EffectDefinition): void {
    if (!effect.pieces) return;
    const cutChanged = JSON.stringify(effect.pieces.cut) !== JSON.stringify(this.effect.cut);
    const matchChanged = effect.pieces.match !== this.effect.match;
    this.effect = effect.pieces;
    this.applyMotion();
    if ((cutChanged || matchChanged) && this.field) this.setField(this.field);
  }

  setMatch(strategy: MatchStrategy): void {
    if (strategy === this.match) return;
    this.match = strategy;
    if (!this.effect.match && this.field) this.setField(this.field);
  }

  setField(field: ParticleFieldBuffers): void {
    this.field = field;
    const source = imageForTarget(field.source);
    const destination = imageForTarget(field.destination);
    if (!source || !destination) return;
    const pieces = cachedPieces(source, destination, this.effect, this.effect.match ?? this.match);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(pieces.srcPosition, 3));
    geometry.setAttribute("aDstPosition", new THREE.BufferAttribute(pieces.dstPosition, 3));
    geometry.setAttribute("aSrcUv", new THREE.BufferAttribute(pieces.srcUv, 2));
    geometry.setAttribute("aDstUv", new THREE.BufferAttribute(pieces.dstUv, 2));
    geometry.setAttribute("aSrcCenter", new THREE.BufferAttribute(pieces.srcCenter, 3));
    geometry.setAttribute("aDstCenter", new THREE.BufferAttribute(pieces.dstCenter, 3));
    geometry.setAttribute("aKeysA", new THREE.BufferAttribute(pieces.keysA, 4));
    geometry.setAttribute("aKeysB", new THREE.BufferAttribute(pieces.keysB, 4));
    this.object.geometry.dispose();
    this.object.geometry = geometry;
    const uniforms = this.object.material.uniforms;
    uniforms.uSrcTex.value = textureFor(source);
    uniforms.uDstTex.value = textureFor(destination);
  }

  private applyMotion(): void {
    const motion = this.effect.motion;
    const uniforms = this.object.material.uniforms;
    uniforms.uStagger.value = Math.min(0.85, Math.max(0, motion.stagger));
    uniforms.uStaggerBy.value = STAGGER[motion.staggerBy];
    uniforms.uLift.value = motion.lift;
    uniforms.uArc.value = motion.arc;
    uniforms.uTilt.value = motion.tilt;
    uniforms.uFlip.value = FLIP[motion.flip ?? "none"];
    uniforms.uDip.value = motion.dip ?? 0;
    uniforms.uJolt.value = motion.jolt ?? 0;
    uniforms.uRgbSplit.value = motion.rgbSplit ?? 0;
    uniforms.uOvershoot.value = motion.overshoot ?? 0;
    uniforms.uFocus.value = motion.focus ?? 0;
    uniforms.uGloss.value = motion.gloss ?? 0;
    const swap = motion.swap ?? [0.35, 0.65];
    uniforms.uSwap.value.set(swap[0], swap[1]);
  }

  setProgress(progress: number): void {
    this.object.material.uniforms.uProgress.value = progress;
  }

  getProgress(): number {
    return this.object.material.uniforms.uProgress.value as number;
  }

  setConfig(config: RendererConfig): void {
    this.object.material.uniforms.uOpacity.value = Math.max(config.opacity, 0.999);
  }

  setFlatOutput(flat: boolean): void {
    this.object.material.uniforms.uFlatOutput.value = flat ? 1 : 0;
  }

  setTime(): void {}
  setLook(): void {}
  setSourceScale(): void {}
  setTargetScale(): void {}
  setDpr(): void {}
  setViewport(): void {}

  dispose(): void {
    this.object.geometry.dispose();
    this.object.material.dispose();
  }
}
