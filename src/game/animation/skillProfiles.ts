// Crabtopia — skillProfiles
// Presentation profiles that give EVERY battle skill a distinct animation
// identity, cleanly separated into the three layers the battle renderer
// keeps apart:
//
//   MOVEMENT  — the attacker's sprite-sheet state (attack / combo / skill /
//               jump…): pure body motion, no effects glued to it.
//   SKILL FX  — flipbook flip-effects, projectiles and screen shake that
//               belong to the skill being cast (this table).
//   AMBIENT   — bubbles / motes / status auras: handled by ParticleLayer
//               presets + status rows, never by this table.
//
// A profile combines: (a) attacker sheet clip, (b) impact flipbook,
// (c) particle preset, (d) optional projectile that travels attacker →
// target before the impact fires, (e) screen shake for heavy/ultimate,
// (f) the skill's element colour (also used to tint the skill button).
//
// Pure data + pure helpers — no React, no engine mutation. Battle mechanics
// are untouched; this only decides how an already-resolved action LOOKS.

import type { ArenaSkill } from "../engine/arenaEngine";
import type { ClassId } from "../types";
import type { AnimState } from "./stateMachine";

export type SkillArchetype =
  | "basic_claw"
  | "combo"
  | "heavy_slam"
  | "ranged_bolt"
  | "aoe"
  | "heal"
  | "shield_buff"
  | "debuff"
  | "drain"
  | "ultimate";

export interface ProjectileProfile {
  /** Atlas flipbook key drawn on the travelling projectile. */
  fx: string;
  /** Travel time attacker → target in ms (at battle speed 1). */
  durationMs: number;
  /** Parabolic arc height in px (0 = straight line). */
  arcHeight: number;
  /** Projectile sprite size in px. */
  size: number;
}

export interface SkillProfile {
  skillId: string;
  archetype: SkillArchetype;
  /** MOVEMENT layer: sheet state the attacker plays. */
  attackerAnim: AnimState;
  /** Playback-speed multiplier for the attacker's clip. */
  attackerSpeed: number;
  /** SKILL FX layer: impact flipbook key (atlas fx). */
  fx: string;
  /** Impact flipbook size in px. */
  fxSize: number;
  /** Impact flipbook repetitions (combo multi-hit reads as repeated slashes). */
  fxRepeats: number;
  /** Particle burst spawned with the impact (null = none for this skill). */
  particles: { preset: string; count: number; at: "target" | "actor" } | null;
  /** Ranged skills: projectile that flies before the impact flipbook. */
  projectile: ProjectileProfile | null;
  shake: "none" | "light" | "heavy";
  elementColor: string;
  /** Short UI tag shown on the skill button (e.g. "COMBO", "AOE"). */
  label: string;
}

/**
 * Point along a projectile's path at t ∈ [0,1]: linear travel with a
 * parabolic height offset. Pure — unit-tested.
 */
export function projectilePointAt(
  from: { x: number; y: number },
  to: { x: number; y: number },
  t: number,
  arcHeight: number,
): { x: number; y: number } {
  const clamped = Math.min(1, Math.max(0, t));
  return {
    x: from.x + (to.x - from.x) * clamped,
    y: from.y + (to.y - from.y) * clamped - Math.sin(Math.PI * clamped) * arcHeight,
  };
}

const BASE: Omit<
  SkillProfile,
  "skillId" | "archetype" | "attackerAnim" | "fx" | "elementColor" | "label"
> = {
  attackerSpeed: 1,
  fxSize: 120,
  fxRepeats: 1,
  particles: null,
  projectile: null,
  shake: "none",
};

function profile(p: SkillProfile): SkillProfile {
  return p;
}

/** Profile for the Tide Sigil — same skill id, role depends on the caster. */
function tideSigilProfile(skill: ArenaSkill): SkillProfile {
  const status = skill.effect?.status;
  switch (status) {
    case "shield":
      return profile({
        ...BASE,
        skillId: skill.id,
        archetype: "shield_buff",
        attackerAnim: "skill",
        fx: "shield",
        fxSize: 130,
        particles: { preset: "ward", count: 12, at: "actor" },
        elementColor: "#FFD166",
        label: "SHIELD",
      });
    case "regen":
      return profile({
        ...BASE,
        skillId: skill.id,
        archetype: "heal",
        attackerAnim: "skill",
        fx: "heal",
        fxSize: 130,
        particles: { preset: "heal", count: 12, at: "target" },
        elementColor: "#7DFF9A",
        label: "REGEN",
      });
    case "freeze":
      return profile({
        ...BASE,
        skillId: skill.id,
        archetype: "ranged_bolt",
        attackerAnim: "skill",
        fx: "ice",
        fxSize: 130,
        particles: { preset: "frost", count: 12, at: "target" },
        projectile: { fx: "lightning", durationMs: 380, arcHeight: 10, size: 60 },
        elementColor: "#8FE8FF",
        label: "FREEZE",
      });
    case "weaken":
      return profile({
        ...BASE,
        skillId: skill.id,
        archetype: "debuff",
        attackerAnim: "skill",
        fx: "dark",
        fxSize: 140,
        particles: { preset: "shadow", count: 12, at: "target" },
        elementColor: "#7A5CFF",
        label: "CURSE",
      });
    case "defense_down":
    default:
      return profile({
        ...BASE,
        skillId: skill.id,
        archetype: "debuff",
        attackerAnim: "skill",
        fx: "spark",
        fxSize: 120,
        particles: { preset: "sparks", count: 12, at: "target" },
        elementColor: "#FF6F91",
        label: "SHATTER",
      });
  }
}

/**
 * Resolve the presentation profile for a concrete skill instance.
 * `classId` is the caster's class (Tide Sigil differs per role).
 * Never returns undefined: unknown skills fall back by their visual family,
 * still with an archetype-appropriate profile.
 */
export function getSkillProfile(
  skill: ArenaSkill,
  classId: ClassId,
): SkillProfile {
  void classId; // role variance is carried by skill.effect; kept for API clarity
  switch (skill.id) {
    case "claw_strike":
      return profile({
        ...BASE,
        skillId: skill.id,
        archetype: "basic_claw",
        attackerAnim: "attack",
        fx: "slash",
        particles: { preset: "sparks", count: 8, at: "target" },
        elementColor: "#FFD76A",
        label: "CLAW",
      });
    case "combo_pinch":
      return profile({
        ...BASE,
        skillId: skill.id,
        archetype: "combo",
        attackerAnim: "combo",
        attackerSpeed: 1.5,
        fx: "slash",
        fxRepeats: 3,
        particles: { preset: "sparks", count: 12, at: "target" },
        elementColor: "#FF9FF3",
        label: "COMBO ×3",
      });
    case "ripple_strike":
      return profile({
        ...BASE,
        skillId: skill.id,
        archetype: "combo",
        attackerAnim: "combo",
        attackerSpeed: 1.85,
        fx: "spark",
        fxRepeats: 3,
        particles: { preset: "splash", count: 8, at: "target" },
        elementColor: "#6FD8FF",
        label: "RAPID ×3",
      });
    case "reaving_claw":
      return profile({
        ...BASE,
        skillId: skill.id,
        archetype: "heavy_slam",
        attackerAnim: "jump",
        fx: "explosion",
        fxSize: 140,
        particles: { preset: "explosion", count: 12, at: "target" },
        shake: "light",
        elementColor: "#FF7A1A",
        label: "HEAVY",
      });
    case "taunt_slam":
      return profile({
        ...BASE,
        skillId: skill.id,
        archetype: "heavy_slam",
        attackerAnim: "jump",
        fx: "splash",
        fxSize: 160,
        particles: { preset: "splash", count: 18, at: "target" },
        shake: "heavy",
        elementColor: "#FF9F68",
        label: "SLAM · AOE",
      });
    case "tidal_burst":
      return profile({
        ...BASE,
        skillId: skill.id,
        archetype: "aoe",
        attackerAnim: "skill",
        fx: "splash",
        fxSize: 170,
        particles: { preset: "splash", count: 16, at: "target" },
        elementColor: "#4FC3FF",
        label: "AOE",
      });
    case "golden_shower":
      return profile({
        ...BASE,
        skillId: skill.id,
        archetype: "ultimate",
        attackerAnim: "skill",
        fx: "levelup",
        fxSize: 175,
        particles: { preset: "ward", count: 16, at: "target" },
        shake: "light",
        elementColor: "#FFD166",
        label: "ULTIMATE",
      });
    case "mend_pearl":
      return profile({
        ...BASE,
        skillId: skill.id,
        archetype: "heal",
        attackerAnim: "skill",
        fx: "heal",
        fxSize: 130,
        particles: { preset: "heal", count: 12, at: "target" },
        elementColor: "#7DFF9A",
        label: "HEAL",
      });
    case "binding_tide":
      return profile({
        ...BASE,
        skillId: skill.id,
        archetype: "ranged_bolt",
        attackerAnim: "skill",
        fx: "ice",
        fxSize: 130,
        particles: { preset: "frost", count: 12, at: "target" },
        projectile: { fx: "ice", durationMs: 430, arcHeight: 42, size: 64 },
        elementColor: "#8FE8FF",
        label: "FROST BOLT",
      });
    case "tide_sigil":
      return tideSigilProfile(skill);
    case "regen_tick":
      return profile({
        ...BASE,
        skillId: skill.id,
        archetype: "heal",
        attackerAnim: "idle",
        fx: "heal",
        fxSize: 84,
        particles: { preset: "heal", count: 6, at: "target" },
        elementColor: "#7DFF9A",
        label: "REGEN",
      });
    default:
      return fallbackProfile(skill);
  }
}

/** Archetype fallback by the skill's legacy visual family. */
function fallbackProfile(skill: ArenaSkill): SkillProfile {
  const byVisual: Record<ArenaSkill["visual"], SkillProfile> = {
    claw: {
      ...BASE,
      skillId: skill.id,
      archetype: "basic_claw",
      attackerAnim: "attack",
      fx: "slash",
      particles: { preset: "sparks", count: 8, at: "target" },
      elementColor: "#FFD76A",
      label: "CLAW",
    },
    magic: {
      ...BASE,
      skillId: skill.id,
      archetype: "ranged_bolt",
      attackerAnim: "skill",
      fx: "spark",
      particles: { preset: "motes", count: 10, at: "target" },
      projectile: { fx: "spark", durationMs: 400, arcHeight: 30, size: 56 },
      elementColor: "#7CF5E1",
      label: "BOLT",
    },
    aoe_wave: {
      ...BASE,
      skillId: skill.id,
      archetype: "aoe",
      attackerAnim: "skill",
      fx: "splash",
      fxSize: 160,
      particles: { preset: "splash", count: 14, at: "target" },
      elementColor: "#4FC3FF",
      label: "AOE",
    },
    heal_pearl: {
      ...BASE,
      skillId: skill.id,
      archetype: "heal",
      attackerAnim: "skill",
      fx: "heal",
      particles: { preset: "heal", count: 10, at: "target" },
      elementColor: "#7DFF9A",
      label: "HEAL",
    },
    shield: {
      ...BASE,
      skillId: skill.id,
      archetype: "shield_buff",
      attackerAnim: "skill",
      fx: "shield",
      particles: { preset: "ward", count: 10, at: "actor" },
      elementColor: "#FFD166",
      label: "SHIELD",
    },
    lightning: {
      ...BASE,
      skillId: skill.id,
      archetype: "ranged_bolt",
      attackerAnim: "skill",
      fx: "lightning",
      particles: { preset: "sparks", count: 10, at: "target" },
      projectile: { fx: "lightning", durationMs: 360, arcHeight: 8, size: 60 },
      elementColor: "#FFE95C",
      label: "BOLT",
    },
    crystal_burst: {
      ...BASE,
      skillId: skill.id,
      archetype: "debuff",
      attackerAnim: "skill",
      fx: "explosion",
      particles: { preset: "explosion", count: 10, at: "target" },
      elementColor: "#FF6F91",
      label: "BURST",
    },
    golden: {
      ...BASE,
      skillId: skill.id,
      archetype: "ultimate",
      attackerAnim: "skill",
      fx: "levelup",
      fxSize: 160,
      particles: { preset: "ward", count: 14, at: "target" },
      shake: "light",
      elementColor: "#FFD166",
      label: "ULTIMATE",
    },
  };
  return byVisual[skill.visual];
}
