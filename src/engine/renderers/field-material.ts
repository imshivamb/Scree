import * as THREE from "three";

import { pointerModeIndex, type MorphLook } from "../types";

export function createSharedFieldUniforms(look: MorphLook): {
  uProgress: { value: number };
  uTime: { value: number };
  uExpansionStrength: { value: number };
  uTurbulenceStrength: { value: number };
  uSynchronization: { value: number };
  uBehaviorWeightsA: { value: THREE.Vector3 };
  uBehaviorWeightsB: { value: THREE.Vector3 };
  uBehaviorStrength: { value: number };
  uPointer: { value: THREE.Vector2 };
  uPointerRadius: { value: number };
  uPointerStrength: { value: number };
  uPointerMode: { value: number };
  uParticleSize: { value: number };
  uOpacity: { value: number };
  uDpr: { value: number };
  uGlow: { value: number };
  uSourceScale: { value: THREE.Vector3 };
  uTargetScale: { value: THREE.Vector3 };
  uFlatOutput: { value: number };
} {
  return {
    uProgress: { value: 1 },
    uTime: { value: 0 },
    uExpansionStrength: { value: look.expansionStrength },
    uTurbulenceStrength: { value: look.turbulenceStrength },
    uSynchronization: { value: look.synchronization },
    uBehaviorWeightsA: {
      value: new THREE.Vector3(
        look.behaviorMix.settle,
        look.behaviorMix.expand,
        look.behaviorMix.scatter,
      ),
    },
    uBehaviorWeightsB: {
      value: new THREE.Vector3(
        look.behaviorMix.implode,
        look.behaviorMix.turbulence,
        look.behaviorMix.orbit,
      ),
    },
    uBehaviorStrength: { value: look.behaviorStrength },
    uPointer: { value: new THREE.Vector2(look.pointer.x, look.pointer.y) },
    uPointerRadius: { value: look.pointer.radius },
    uPointerStrength: { value: look.pointer.strength },
    uPointerMode: { value: pointerModeIndex(look.pointer.mode) },
    uParticleSize: { value: look.particleSize },
    uOpacity: { value: 1 },
    uDpr: { value: 1 },
    uGlow: { value: look.glow },
    uSourceScale: { value: new THREE.Vector3(1, 1, 1) },
    uTargetScale: { value: new THREE.Vector3(1, 1, 1) },
    // 1 while a style redraws the field: plain colour, coverage 1, no glow.
    uFlatOutput: { value: 0 },
  };
}

export function applyLook(
  uniforms: THREE.ShaderMaterial["uniforms"],
  look: MorphLook,
): void {
  uniforms.uExpansionStrength.value = look.expansionStrength;
  uniforms.uTurbulenceStrength.value = look.turbulenceStrength;
  uniforms.uSynchronization.value = look.synchronization;
  uniforms.uBehaviorWeightsA.value.set(
    look.behaviorMix.settle,
    look.behaviorMix.expand,
    look.behaviorMix.scatter,
  );
  uniforms.uBehaviorWeightsB.value.set(
    look.behaviorMix.implode,
    look.behaviorMix.turbulence,
    look.behaviorMix.orbit,
  );
  uniforms.uBehaviorStrength.value = look.behaviorStrength;
  uniforms.uPointer.value.set(look.pointer.x, look.pointer.y);
  uniforms.uPointerRadius.value = look.pointer.radius;
  uniforms.uPointerStrength.value = look.pointer.strength;
  uniforms.uPointerMode.value = pointerModeIndex(look.pointer.mode);
  uniforms.uGlow.value = look.glow;
}