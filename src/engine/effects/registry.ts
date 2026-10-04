import type { EffectDefinition } from "./types";

const effects = new Map<string, EffectDefinition>();

/** Type-checks an effect definition. Pass it to `registerEffect` to make it available. */
export function defineEffect(effect: EffectDefinition): EffectDefinition {
  const family = effect.family;
  if (!effect[family]) {
    throw new Error(`Effect "${effect.id}" is a ${family} effect but has no "${family}" settings`);
  }
  return effect;
}

/** Make an effect available everywhere: engine, playground, Studio, export. */
export function registerEffect(effect: EffectDefinition): void {
  effects.set(effect.id, defineEffect(effect));
}

export function getEffect(id: string): EffectDefinition | undefined {
  return effects.get(id);
}

export function listEffects(): EffectDefinition[] {
  return [...effects.values()];
}

export function isEffectId(id: string): boolean {
  return effects.has(id);
}
