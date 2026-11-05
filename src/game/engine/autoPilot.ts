// Crabtopia — AutoPilot: the arena AI that plays BOTH teams
// ---------------------------------------------------------------------------
// Crabtopia's Arena is a FULL AUTO BATTLER: after deployment the battle
// runs itself. Every combatant, on both sides, is driven by this one
// pilot. The pilot is deterministic (no RNG): same state → same
// decision, so battles and tests are reproducible.
//
// Decision policy (in priority order):
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
//      turn (estimated damage ≥ its HP), (b) highest estimated damage,
//      (c) higher energy cost ("bigger skill") as tiebreak.
//      Target ranking inside one skill: finisher first → element-weak
//      target (effectiveness table) → lowest HP → frontmost row →
//      lowest slot. Deterministic tiebreaks everywhere.
//   5. FALLBACK — Claw Strike on the policy target when nothing else
//      is usable (energy-starved turns).
//
// Damage estimation mirrors applySkill's deterministic factors
// (base stat × power × defence factor × position factor × element
// effectiveness) and ignores variance / status / combo multipliers —
// an estimate, documented as such.

import {
  getSkillsForClass,
  legalEnemyTargets,
  positionDamageFactor,
  type ArenaBattleState,
  type ArenaSkill,
  type Combatant,
} from "./arenaEngine";
import { effectiveness } from "./elements";

/** Heal when an ally drops below this fraction of max HP. */
export const HEAL_THRESHOLD = 0.55;

export interface PilotDecision {
  skill: ArenaSkill;
  targets: Combatant[];
  /** Machine-readable reason, for logs/tests: heal|support|aoe|damage|fallback. */
  reason: "heal" | "support" | "aoe" | "damage" | "fallback";
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

/**
 * Decide the action for `actor` in `state`. Returns null only when
 * there is nobody to act on (battle effectively over).
 */
export function decideAction(
  state: ArenaBattleState,
  actor: Combatant,
): PilotDecision | null {
  if (actor.isDefeated) return null;
  // Incapacitation gate: a frozen crab CANNOT act. The ArenaBattle UI also
  // consumes the freeze at the start of an actor's turn (consumeFreeze) and
  // emits the "Frozen" skip action; this guard is defense-in-depth so that
  // even a caller who forgets the consume step never gets a real decision
  // for a frozen crab. Stun/dizzy ("pusing") statuses, if introduced later,
  // should hook in here too.
  const freeze = actor.statuses.find(
    (s) => s.id === "freeze" && s.roundsRemaining > 0,
  );
  if (freeze) return null;
  const skills = getSkillsForClass(actor.classId);
  const usable = skills.filter(
    (s) => actor.energy >= s.energyCost && (actor.cooldowns[s.id] ?? 0) <= 0,
  );
  const allies = aliveOnSide(state, actor.side);
  const enemies = aliveOnSide(state, actor.side === "player" ? "enemy" : "player");
  if (enemies.length === 0) return null;

  const lowestAlly = [...allies].sort(
    (a, b) => a.hp / a.maxHp - b.hp / b.maxHp || a.slot - b.slot,
  )[0];

  // 1) HEAL — an ally is critical and a heal is usable.
  const heal = usable.find(isHealSkill);
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
      const ranked = rankTargets(state, actor, skill, enemies);
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
    const legal = legalEnemyTargets(state, actor, skill);
    if (legal.length === 0) continue;
    const target = rankTargets(state, actor, skill, legal)[0];
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
  const claw = skills[0];
  const legal = legalEnemyTargets(state, actor, claw);
  if (legal.length === 0) return null;
  const target = rankTargets(state, actor, claw, legal)[0];
  return { skill: claw, targets: [target], reason: "fallback" };
}
