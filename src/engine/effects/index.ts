import { registerSurfaceShader } from "../surface/registry";
import * as blinds from "./builtin/blinds";
import * as cardStack from "./builtin/card-stack";
import * as depth from "./builtin/depth";
import * as glitch from "./builtin/glitch";
import * as ink from "./builtin/ink";
import * as lightLeak from "./builtin/light-leak";
import * as lineArt from "./builtin/line-art";
import * as liquid from "./builtin/liquid";
import * as mosaicFlip from "./builtin/mosaic-flip";
import * as origami from "./builtin/origami";
import * as particles from "./builtin/particles";
import * as peel from "./builtin/peel";
import * as pieces from "./builtin/pieces";
import * as pixelSort from "./builtin/pixel-sort";
import * as shatter from "./builtin/shatter";
import * as slices from "./builtin/slices";
import * as typeShatter from "./builtin/type-shatter";
import { registerEffect } from "./registry";

export { defineEffect, getEffect, isEffectId, listEffects, registerEffect } from "./registry";
export type {
  EffectDefinition,
  EffectFamily,
  ParticleEffect,
  PieceCut,
  PieceEffect,
  PieceMotion,
  StaggerMode,
  SurfaceEffect,
} from "./types";
export { registerSurfaceShader } from "../surface/registry";
export type { SurfaceShader } from "../surface/registry";

/** The built-in library, in gallery order. Adding an effect = one file + one line here. */
const BUILT_IN = [
  pieces.effect,
  shatter.effect,
  slices.effect,
  blinds.effect,
  mosaicFlip.effect,
  glitch.effect,
  origami.effect,
  cardStack.effect,
  typeShatter.effect,
  peel.effect,
  liquid.effect,
  ink.effect,
  lightLeak.effect,
  pixelSort.effect,
  depth.effect,
  lineArt.effect,
  particles.dust,
  particles.magnetic,
  particles.gooey,
];

for (const shader of [
  peel.shader,
  liquid.shader,
  ink.shader,
  lightLeak.shader,
  pixelSort.shader,
  depth.shader,
  lineArt.shader,
  glitch.shader,
]) {
  registerSurfaceShader(shader);
}
for (const effect of BUILT_IN) registerEffect(effect);

export const BUILT_IN_EFFECT_IDS = BUILT_IN.map((effect) => effect.id);
