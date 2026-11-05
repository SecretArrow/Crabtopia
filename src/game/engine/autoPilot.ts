// Crabtopia — AutoPilot: the arena AI that plays BOTH teams
// ---------------------------------------------------------------------------
// Crabtopia's Arena is a FULL AUTO BATTLER: after deployment the battle
// runs itself. Every combatant, on both sides, is driven by this one
// pilot. The pilot is deterministic (no RNG): same sim state → same
// decision, so battles and tests are reproducible.
//
// In the real-time simulator (battleSim.ts) a "decision" is an INTENT —
// a skill plus its intended targets. The unit's steering then closes to
// the skill's engagement band and the sim starts the action; the pilot
// re-evaluates every 250 battle-ms while the unit is uncommitted.
//
// Decision policy (in priority order):
//   0. CLEANSE — a Shellmender whose heal is usable cleanses a
//      hard-CC'd ally (the heal removes the CC — see battleSim).
//   1. HEAL — if a healing skill is usable and any ally (including the
//      actor) is below HEAL_THRESHOLD (55%) max HP, cast the heal on
//      the lowest-HP% ally.
//   2. SUPPORT — a shield/regen sigil is cast when its status is not
//      already active on the team (shield → lowest-HP ally).
//   3. AoE — an all-enemies skill is cast when at least 2 enemies are
//      alive (the "big skill when it matters" rule).
//   4. FOCUSED DAMAGE — among damage skills and their LEGAL targets
//      (position rules via legalEnemyTargets: melee reaches only the
//      frontmost living row; backline protection applies), pick the
//      skill+target pair by: (a) a target that can be finished this
//      hit (estimated damage ≥ its HP), (b) highest estimated damage,
//      (c) higher energy cost ("bigger skill") as tiebreak.
//      Class flavour inside this step:
//        · Skitter (assassin) IGNORES the melee reach rule — its pool
//          is every living enemy, ranked finisher → lowest HP →
//          back-row first (it flanks to the squishy backline).
//        · Warden aims its freeze skills at the enemy CARRY (highest
//          attack) instead of the usual focus ranking.
//        · Bulwark (guard) prioritises enemies that are currently
//          engaging its back/mid-row allies within guard reach.
//   5. FALLBACK — Claw Strike on the policy target when nothing else
//      is usable (energy-starved moments).
//
// Damage estimation mirrors the simulator's deterministic factors
// (base stat × power × defence factor × position factor × element
// effectiveness) and ignores variance / status / combo multipliers —
// an estimate, documented as such.

import {
  findStatusEffect,
  getSkillsForClass,
  legalEnemyTargets,
  positionDamageFactor,
  type ArenaBattleState,
  type ArenaSkill,
  type Combatant,
} from "./arenaEngine";
import type { SimState, SimUnit } from "./battleSim";
import { effectiveness } from "./elements";

/** Heal when an ally drops below this fraction of max HP. */
export const HEAL_THRESHOLD = 0.55;

export interface PilotDecision {
  skill: ArenaSkill;
  targets: Combatant[];
  /** Machine-readable reason, for logs/tests. */
  reason: "heal" | "cleanse" | "support" | "aoe" | "damage" | "fallback";
}

function aliveOnSide(
  state: ArenaBattleState,
  side: "player" | "enemy",
): Combatant[] {
  return (side === "player" ? state.player : state.enemy).filter(
    (c) => !c.isDefeated,
  );
}

function baseStat(actor: Combatant): number {
  return actor.classId === "tidecaller" || actor.classId === "shellmender"
    ? actor.skill
    : actor.attack;
}

/** Deterministic damage estimate of `skill` from `actor` onto `target`. */
export function estimateDamage(
  state: ArenaBattleState,
  actor: Combatant,
  skill: ArenaSkill,
  target: Combatant,
): number {
  const defFactor = 1 - target.defense / (target.defense + 120);
  const aoeFactor = skill.targetType === "all_enemies" ? 0.85 : 1;
  return (
    baseStat(actor) *
    skill.power *
    defFactor *
    positionDamageFactor(state, target, skill) *
    effectiveness(actor.element, target.element) *
    aoeFactor
  );
}

const ROW_ORDER = { front: 0, mid: 1, back: 2 } as const;

/**
 * Rank legal targets for a single-target damage skill:
 * finisher (est. damage ≥ HP) → element-weak → lowest HP → frontmost
 * row → lowest slot. Returns a NEW sorted array.
 */
export function rankTargets(
  state: ArenaBattleState,
  actor: Combatant,
  skill: ArenaSkill,
  pool: Combatant[],
): Combatant[] {
  return [...pool].sort((a, b) => {
    const finA = estimateDamage(state, actor, skill, a) >= a.hp ? 0 : 1;
    const finB = estimateDamage(state, actor, skill, b) >= b.hp ? 0 : 1;
    if (finA !== finB) return finA - finB;
    const weakA = effectiveness(actor.element, a.element) > 1 ? 0 : 1;
    const weakB = effectiveness(actor.element, b.element) > 1 ? 0 : 1;
    if (weakA !== weakB) return weakA - weakB;
    if (a.hp !== b.hp) return a.hp - b.hp;
    if (ROW_ORDER[a.row] !== ROW_ORDER[b.row])
      return ROW_ORDER[a.row] - ROW_ORDER[b.row];
    return a.slot - b.slot;
  });
}

/**
 * Assassin ranking (Skitter): finisher → lowest HP → BACK row first →
 * lowest slot. The backline preference is the flank: the assassin runs
 * past the frontline to the squishy casters behind it.
 */
export function rankFlankTargets(
  state: ArenaBattleState,
  actor: Combatant,
  skill: ArenaSkill,
  pool: Combatant[],
): Combatant[] {
  return [...pool].sort((a, b) => {
    const finA = estimateDamage(state, actor, skill, a) >= a.hp ? 0 : 1;
    const finB = estimateDamage(state, actor, skill, b) >= b.hp ? 0 : 1;
    if (finA !== finB) return finA - finB;
    if (a.hp !== b.hp) return a.hp - b.hp;
    if (ROW_ORDER[a.row] !== ROW_ORDER[b.row])
      return ROW_ORDER[b.row] - ROW_ORDER[a.row];
    return a.slot - b.slot;
  });
}

function isHealSkill(skill: ArenaSkill): boolean {
  return skill.targetType === "ally" && skill.visual === "heal_pearl";
}

function isSupportSkill(skill: ArenaSkill): boolean {
  // Shield on an ally, or a team status applied to all allies
  // (regen aura / team sigils delivered via self-cast).
  if (!skill.effect) return false;
  if (skill.effect.status === "shield") return true;
  return skill.effect.applyTo === "all_allies";
}

function targetsFor(
  state: ArenaBattleState,
  actor: Combatant,
  skill: ArenaSkill,
  chosen?: Combatant,
): Combatant[] {
  switch (skill.targetType) {
    case "enemy":
      return chosen ? [chosen] : [];
    case "all_enemies":
      return aliveOnSide(state, actor.side === "player" ? "enemy" : "player");
    case "ally":
      return chosen ? [chosen] : [];
    case "all_allies":
      return aliveOnSide(state, actor.side);
    case "self":
      return [actor];
  }
}

/** Is this combatant currently hard-CC'd (frozen) in sim terms? */
export function isHardCcd(c: Combatant): boolean {
  const freeze = findStatusEffect(c, "freeze");
  return !!freeze && freeze.durationMs > 0;
}

/** A skill the unit can start right now (energy + sim cooldown clocks). */
function usableSkills(sim: SimState, unit: SimUnit): ArenaSkill[] {
  const actor = unit.c;
  return getSkillsForClass(actor.classId).filter((s) => {
    if (unit.energyF < s.energyCost) return false;
    if (s.id === "claw_strike") return sim.timeMs >= unit.basicReadyAt;
    return sim.timeMs >= (unit.skillReadyAt[s.id] ?? 0);
  });
}

/** The target pool for a single-target enemy skill under the pilot policy. */
function targetPool(
  sim: SimState,
  unit: SimUnit,
  skill: ArenaSkill,
): Combatant[] {
  const state = sim.battle;
  const actor = unit.c;
  // Assassins flank: the reach rule does not bind the Skitter — its
  // pool is every living enemy and its steering runs to the victim.
  if (actor.classId === "skitter") {
    return aliveOnSide(state, actor.side === "player" ? "enemy" : "player");
  }
  return legalEnemyTargets(state, actor, skill);
}

function rankFor(
  sim: SimState,
  unit: SimUnit,
  skill: ArenaSkill,
  pool: Combatant[],
): Combatant[] {
  const state = sim.battle;
  const actor = unit.c;
  // Warden: freeze skills hunt the enemy carry (highest attack).
  if (skill.effect?.status === "freeze") {
    return [...pool].sort(
      (a, b) => b.attack - a.attack || a.hp - b.hp || a.slot - b.slot,
    );
  }
  if (actor.classId === "skitter") {
    return rankFlankTargets(state, actor, skill, pool);
  }
  const ranked = rankTargets(state, actor, skill, pool);
  // Bulwark guard: enemies currently engaging its back/mid-row allies
  // within guard reach jump the queue (a target-selection weight, not
  // a hard taunt).
  if (actor.classId === "bulwark") {
    const guardOf = (t: Combatant): number => {
      const foe = sim.byId.get(t.crabId);
      if (!foe || !foe.targetId) return 1;
      const victim = sim.byId.get(foe.targetId);
      if (!victim || victim.c.side !== actor.side) return 1;
      if (victim.c.row === "front") return 1;
      const d = Math.hypot(victim.x - unit.x, victim.y - unit.y);
      return d <= 40 ? 0 : 1;
    };
    return ranked.sort((a, b) => guardOf(a) - guardOf(b));
  }
  return ranked;
}

/**
 * Decide the current INTENT for `unit` in the simulator. Returns null
 * only when there is nobody to act on (battle effectively over) or the
 * unit is incapacitated (frozen crabs never receive a decision).
 */
export function decideSimAction(
  sim: SimState,
  unit: SimUnit,
): PilotDecision | null {
  const state = sim.battle;
  const actor = unit.c;
  if (actor.isDefeated) return null;
  // Incapacitation gate: a frozen crab CANNOT act.
  if (isHardCcd(actor)) return null;
  const usable = usableSkills(sim, unit);
  const allies = aliveOnSide(state, actor.side);
  const enemies = aliveOnSide(state, actor.side === "player" ? "enemy" : "player");
  if (enemies.length === 0) return null;

  const lowestAlly = [...allies].sort(
    (a, b) => a.hp / a.maxHp - b.hp / b.maxHp || a.slot - b.slot,
  )[0];

  const heal = usable.find(isHealSkill);

  // 0) CLEANSE — an ally is hard-CC'd and this unit's heal cleanses.
  if (heal && actor.classId === "shellmender") {
    const ccd = allies
      .filter((a) => isHardCcd(a))
      .sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp || a.slot - b.slot)[0];
    if (ccd) return { skill: heal, targets: [ccd], reason: "cleanse" };
  }

  // 1) HEAL — an ally is critical and a heal is usable.
  if (heal && lowestAlly && lowestAlly.hp / lowestAlly.maxHp < HEAL_THRESHOLD) {
    return { skill: heal, targets: [lowestAlly], reason: "heal" };
  }

  // 2) SUPPORT — shield/regen sigil while its status is missing.
  const support = usable.find(isSupportSkill);
  if (support && support.effect) {
    const status = support.effect.status;
    const alreadyActive = allies.some((c) =>
      c.statuses.some((s) => s.id === status),
    );
    if (!alreadyActive) {
      const target =
        support.targetType === "ally" ? lowestAlly : undefined;
      const targets = targetsFor(state, actor, support, target);
      if (targets.length > 0) return { skill: support, targets, reason: "support" };
    }
  }

  // 3) AoE — a big all-enemies skill with at least 2 targets standing.
  const aoe = usable
    .filter((s) => s.targetType === "all_enemies")
    .sort((a, b) => b.power - a.power || b.energyCost - a.energyCost)[0];
  if (aoe && enemies.length >= 2) {
    return { skill: aoe, targets: enemies, reason: "aoe" };
  }

  // 3b) DEBUFF — a team-wide enemy sigil (self-cast) while its status
  // is not already on the enemy team.
  const debuff = usable.find(
    (s) =>
      s.targetType === "self" &&
      s.effect &&
      s.effect.applyTo === "all_enemies",
  );
  if (debuff?.effect) {
    const status = debuff.effect.status;
    const alreadyActive = enemies.some((c) =>
      c.statuses.some((s) => s.id === status),
    );
    if (!alreadyActive) {
      return { skill: debuff, targets: [actor], reason: "support" };
    }
  }

  // 4) FOCUSED DAMAGE — best skill+target by the documented policy.
  const damageSkills = usable.filter(
    (s) =>
      (s.targetType === "enemy" || s.targetType === "all_enemies") &&
      !isSupportSkill(s),
  );
  let best: { skill: ArenaSkill; target: Combatant; est: number; finisher: boolean } | null =
    null;
  for (const skill of damageSkills) {
    if (skill.targetType === "all_enemies") {
      // Single remaining enemy: value the AoE by its hit on the best target.
      const ranked = rankFor(sim, unit, skill, enemies);
      const target = ranked[0];
      const est = estimateDamage(state, actor, skill, target);
      const cand = { skill, target, est, finisher: est >= target.hp };
      if (
        !best ||
        (cand.finisher && !best.finisher) ||
        (cand.finisher === best.finisher && cand.est > best.est)
      ) {
        best = cand;
      }
      continue;
    }
    const legal = targetPool(sim, unit, skill);
    if (legal.length === 0) continue;
    const target = rankFor(sim, unit, skill, legal)[0];
    const est = estimateDamage(state, actor, skill, target);
    const cand = { skill, target, est, finisher: est >= target.hp };
    if (
      !best ||
      (cand.finisher && !best.finisher) ||
      (cand.finisher === best.finisher &&
        (cand.est > best.est ||
          (cand.est === best.est && skill.energyCost > best.skill.energyCost)))
    ) {
      best = cand;
    }
  }
  if (best) {
    const targets =
      best.skill.targetType === "all_enemies"
        ? enemies
        : [best.target];
    return { skill: best.skill, targets, reason: "damage" };
  }

  // 5) FALLBACK — Claw Strike at the policy target (energy-starved).
  // (Only reachable when the claw itself is on its basic cycle clock —
  // otherwise the claw was already among the damage skills above.)
  const claw = getSkillsForClass(actor.classId)[0];
  const legal = targetPool(sim, unit, claw);
  if (legal.length === 0) return null;
  const target = rankFor(sim, unit, claw, legal)[0];
  return { skill: claw, targets: [target], reason: "fallback" };
}
