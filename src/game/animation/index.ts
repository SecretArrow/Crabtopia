// Crabtopia - Sprite animation engine (pure modules, no React/DOM).
// Barrel export: import { AnimationPlayer, ... } from "../animation"
// (or "../../game/animation" depending on the caller's depth).
export {
  animationDurationMs,
  backgroundPosition,
  backgroundSize,
  collectEventsBetween,
  eventsBetween,
  frameAtTime,
  frameRect,
  indexAtStep,
} from "./spriteSheet";
export type {
  AnimationDef,
  FiredEvent,
  FrameAtTime,
  FxDef,
  LoopMode,
  SpriteSheetDef,
} from "./spriteSheet";

export { AnimationPlayer } from "./player";
export type { AnimationPlayerOptions } from "./player";

export {
  ANIM_PRIORITY,
  AnimationStateMachine,
  ONCE_STATES,
  TERMINAL_STATES,
  isInterruptible,
} from "./stateMachine";
export type {
  AnimState,
  AnimationStateMachineOptions,
} from "./stateMachine";

export { PARTICLE_PRESETS, ParticleSystem } from "./particles";
export type {
  EmitterConfig,
  EmitterHandle,
  Particle,
} from "./particles";

export { AssetManager } from "./assetManager";
export type { AssetFactory } from "./assetManager";

export { computeRigPose, solveTwoBoneIK } from "./puppetRig";
export type { BoneId, BonePose, RigPose } from "./puppetRig";

export { getSkillProfile, projectilePointAt } from "./skillProfiles";
export type {
  ProjectileProfile,
  SkillArchetype,
  SkillProfile,
} from "./skillProfiles";

export {
  CLASS_HOME_FACTION,
  resolveSheetDescriptor,
  resolveSheetForCrab,
} from "./sheetResolver";
export type { SheetDescriptor, SheetKey } from "./sheetResolver";
