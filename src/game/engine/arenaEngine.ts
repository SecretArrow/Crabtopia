// Crabtopia - Arena 5v5 Turn-Based Battle Engine
// Pure logic, deterministic by seed. No React, no UI.
// Implements: skills (3 per crab from class), status effects, combos, energy, AI.
// Five crabs per side (5v5) — see ARENA-GAME-SHARED.md for the full battle spec.

import { Crab, ClassId, ElementId, FactionId, Formation } from "../types";
import { CLASSES } from "../content/classes";
import { mulberry32 } from "./rng";
import { rowOf, type RowId } from "./formation";
import { effectiveness, elementOf } from "./elements";
import { ARENA_DROP_MATERIALS } from "../data/leaderboardNames";

export type { RowId };

// ============================================================================
// PUBLIC TYPES
// ============================================================================

export type StatusEffectId =
  | "weaken"
  | "freeze"
  | "defense_down"
  | "regen"
  | "shield";

export interface StatusEffect {
  id: StatusEffectId;
  roundsRemaining: number;
  magnitude: number;
  sourceId?: string;
}

export interface ArenaSkill {
  id: string;
  name: string;
  energyCost: number;
  cooldown: number;
  power: number;
  targetType: "enemy" | "ally" | "all_enemies" | "all_allies" | "self";
  effect?: {
    status: StatusEffectId;
    rounds: number;
    magnitude: number;
    applyTo: "target" | "all_allies" | "all_enemies";
  };
  description: string;
  visual:
    | "claw"
    | "magic"
    | "aoe_wave"
    | "heal_pearl"
    | "shield"
    | "lightning"
    | "crystal_burst"
    | "golden";
}

export interface Combatant {
  crabId: string;
  side: "player" | "enemy";
  slot: number; // 0..4 (5 crabs per side in 5v5)
  /**
   * Lane (vertical column index 0..4) the crab was freely placed in within
   * its battlefield row. Drives the battle renderer's Y position on a fixed
   * 5-lane grid (slotLayout.fixedSlotAnchor). Defaults to `slot` when no
   * free-placement lanes are supplied, preserving the legacy spread.
   */
  lane: number;
  /** Battlefield row from the team's formation — drives targeting & damage rules. */
  row: RowId;
  name: string;
  classId: ClassId;
  faction: FactionId;
  /** The combatant's element (engine/elements.ts) — drives damage effectiveness. */
  element: ElementId;
  level: number;
  maxHp: number;
  hp: number;
  energy: number;
  maxEnergy: number;
  attack: number;
  defense: number;
  speed: number;
  skill: number;
  isDefeated: boolean;
  statuses: StatusEffect[];
  cooldowns: Record<string, number>;
  comboCount: number;
}

export interface ArenaAction {
  turn: number;
  actorId: string;
  actorSide: "player" | "enemy";
  skillId: string;
  skillName: string;
  targetIds: string[];
  targetSide: "player" | "enemy";
  damage?: number;
  heal?: number;
  statusApplied?: { status: StatusEffectId; targetId: string }[];
  visual: ArenaSkill["visual"];
  message: string;
  combo?: number;
  defeated?: string[];
}

export interface ArenaBattleState {
  arenaId: string;
  seed: number;
  turn: number;
  player: Combatant[];
  enemy: Combatant[];
  log: ArenaAction[];
  winner: "player" | "enemy" | null;
  totalDamageDealt: { player: number; enemy: number };
  maxCombo: number;
}

// ============================================================================
// INTERNAL RNG (deterministic by state.seed, shared across calls via WeakMap)
// ============================================================================

const rngStore = new WeakMap<ArenaBattleState, () => number>();

function getRng(state: ArenaBattleState): () => number {
  let r = rngStore.get(state);
  if (!r) {
    r = mulberry32(state.seed ^ 0x9e3779b9);
    rngStore.set(state, r);
  }
  return r;
}

function roll(state: ArenaBattleState): number {
  return getRng(state)();
}

// ============================================================================
// SKILL DEFINITIONS
// ============================================================================

// Skill 1 — basic single-target attack, every crab has it
function makeClawStrike(): ArenaSkill {
  return {
    id: "claw_strike",
    name: "Claw Strike",
    energyCost: 1,
    cooldown: 0,
    power: 1.0,
    targetType: "enemy",
    description: "A basic claw strike. Reliable, low cost.",
    visual: "claw",
  };
}

// Skill 3 — "Tide Sigil": status applicator, role-based
function makeTideSigil(classId: ClassId): ArenaSkill {
  const base = {
    id: "tide_sigil",
    name: "Tide Sigil",
    energyCost: 5,
    cooldown: 3,
    power: 1.8,
    description: "Channel the tide to invoke a powerful sigil.",
    visual: "crystal_burst" as const,
  };

  switch (classId) {
    case "bulwark":
      // Tank: shield on lowest-HP ally
      return {
        ...base,
        visual: "shield",
        targetType: "ally",
        effect: {
          status: "shield",
          rounds: 2,
          magnitude: 0.45, // 45% of caster maxHp → stored as flat HP at apply time
          applyTo: "target",
        },
        description:
          "Conjure a protective sigil shielding the lowest-HP ally, absorbing incoming damage.",
      };
    case "shellmender":
      // Healer: regen on all allies
      return {
        ...base,
        visual: "heal_pearl",
        targetType: "self",
        effect: {
          status: "regen",
          rounds: 3,
          magnitude: 8, // 8% maxHp per round
          applyTo: "all_allies",
        },
        description:
          "Mend the whole squad with a regenerating tide-pearl aura.",
      };
    case "tidecaller":
      // Mage: weaken all enemies
      return {
        ...base,
        visual: "magic",
        targetType: "self",
        effect: {
          status: "weaken",
          rounds: 2,
          magnitude: 0.25, // -25% attack
          applyTo: "all_enemies",
        },
        description:
          "Curse all enemies with weakening tide-sigil, lowering their attack.",
      };
    case "warden":
      // Controller: freeze target for 2 turns — a frozen crab CANNOT act
      // (the skip is enforced both in resolveRound and in the AutoPilot's
      // decideAction, so neither battle path lets a frozen crab attack).
      return {
        ...base,
        visual: "lightning",
        targetType: "enemy",
        effect: {
          status: "freeze",
          rounds: 2,
          magnitude: 0,
          applyTo: "target",
        },
        description:
          "Bind the target in crystalline frost, freezing them for their next 2 turns.",
      };
    case "reaver":
    case "pincher":
    case "skitter":
    case "gildclaw":
    default:
      // DPS: defense_down on target
      return {
        ...base,
        visual: "crystal_burst",
        targetType: "enemy",
        effect: {
          status: "defense_down",
          rounds: 2,
          magnitude: 0.3, // +30% damage taken
          applyTo: "target",
        },
        description:
          "Shatter the target's shell with a sigil-burst, lowering their defense.",
      };
  }
}

// Skill 2 — derived from classDef.activeSkill, with role-appropriate target type & visual
function makeClassSpecial(classId: ClassId): ArenaSkill {
  const c = CLASSES[classId];
  const s = c.activeSkill;
  const common = {
    id: s.id,
    name: s.name,
    energyCost: s.energyCost,
    cooldown: s.cooldown,
    power: s.power,
    description: s.description,
  };
  switch (classId) {
    case "bulwark":
      return { ...common, targetType: "all_enemies", visual: "aoe_wave" };
    case "reaver":
      return { ...common, targetType: "enemy", visual: "claw" };
    case "skitter":
      return { ...common, targetType: "enemy", visual: "claw" };
    case "tidecaller":
      return { ...common, targetType: "all_enemies", visual: "magic" };
    case "shellmender":
      return { ...common, targetType: "ally", visual: "heal_pearl" };
    case "pincher":
      return { ...common, targetType: "enemy", visual: "claw" };
    case "warden":
      return {
        ...common,
        targetType: "enemy",
        visual: "lightning",
        effect: {
          status: "freeze",
          rounds: 2,
          magnitude: 0,
          applyTo: "target",
        },
      };
    case "gildclaw":
      return { ...common, targetType: "all_enemies", visual: "golden" };
    default:
      return { ...common, targetType: "enemy", visual: "claw" };
  }
}

/**
 * Build 3 skills for a crab based on its class.
 * Order: [Claw Strike, Class Special, Tide Sigil]
 * (Note: "3 skills" here refers to skills per crab, not crabs per team — the
 * team size is 5 per side in 5v5.)
 */
export function getSkillsForClass(classId: ClassId): ArenaSkill[] {
  return [makeClawStrike(), makeClassSpecial(classId), makeTideSigil(classId)];
}

// ============================================================================
// COMBATANT & BATTLE INIT
// ============================================================================

const MAX_ENERGY = 10;
const START_ENERGY = 3;
const ENERGY_PER_ROUND = 2;

/** Legacy row for a slot when no formation is supplied: slots 0-2 front, 3-4 back. */
export function defaultRowForSlot(slot: number): RowId {
  return slot <= 2 ? "front" : "back";
}

export function makeCombatant(
  crab: Crab,
  side: "player" | "enemy",
  slot: number,
  row: RowId = defaultRowForSlot(slot),
  lane: number = slot
): Combatant {
  return {
    crabId: crab.id,
    side,
    slot,
    lane,
    row,
    name: crab.name,
    classId: crab.classId,
    faction: crab.faction,
    element: elementOf(crab),
    level: crab.level,
    maxHp: crab.stats.hp,
    hp: crab.stats.hp,
    energy: START_ENERGY,
    maxEnergy: MAX_ENERGY,
    attack: crab.stats.attack,
    defense: crab.stats.defense,
    speed: crab.stats.speed,
    skill: crab.stats.skill,
    isDefeated: false,
    statuses: [],
    cooldowns: {},
    comboCount: 0,
  };
}

function makeArenaId(seed: number): string {
  const a = String.fromCharCode(65 + (seed % 26));
  const b = String.fromCharCode(65 + ((seed >> 5) % 26));
  const digits = ((seed >> 10) % 10000).toString().padStart(4, "0");
  return `ARENA-${a}${b}${digits}`;
}

export interface InitBattleOptions {
  /** Saved formation of the player team (rows by crab id). */
  playerFormation?: Formation;
  /** Formation of the enemy team (rows by crab id). */
  enemyFormation?: Formation;
  /**
   * Free-placement lanes (0..4 within a row) for the player team, keyed by
   * crab id. Crabs not present in the map fall back to lane = slot. Lets the
   * deployment board's freely chosen cell positions carry into the battle.
   */
  playerLanes?: Record<string, number>;
  /** Free-placement lanes for the enemy team (mirrors playerLanes). */
  enemyLanes?: Record<string, number>;
}

export function initBattle(
  playerCrabs: Crab[],
  enemyCrabs: Crab[],
  seed: number,
  options: InitBattleOptions = {}
): ArenaBattleState {
  // Five crabs per side (5v5) — take the first 5 from each roster.
  // Extra crabs beyond slot 4 are ignored so callers can safely pass full rosters.
  const rowFor = (formation: Formation | undefined, crab: Crab, slot: number): RowId =>
    (formation ? rowOf(formation, crab.id) : null) ?? defaultRowForSlot(slot);
  const player = playerCrabs
    .slice(0, 5)
    .map((c, i) =>
      makeCombatant(
        c,
        "player",
        i,
        rowFor(options.playerFormation, c, i),
        options.playerLanes?.[c.id] ?? i,
      ),
    );
  const enemy = enemyCrabs
    .slice(0, 5)
    .map((c, i) =>
      makeCombatant(
        c,
        "enemy",
        i,
        rowFor(options.enemyFormation, c, i),
        options.enemyLanes?.[c.id] ?? i,
      ),
    );
  const state: ArenaBattleState = {
    arenaId: makeArenaId(seed),
    seed,
    turn: 0,
    player,
    enemy,
    log: [],
    winner: null,
    totalDamageDealt: { player: 0, enemy: 0 },
    maxCombo: 0,
  };
  // Prime the RNG so the arenaId-derived seed offset is consistent.
  // (We seed with state.seed ^ 0x9e3779b9 above; calling once establishes the chain.)
  getRng(state);
  return state;
}

// ============================================================================
// STATUS HELPERS
// ============================================================================

function findStatus(c: Combatant, id: StatusEffectId): StatusEffect | undefined {
  return c.statuses.find((s) => s.id === id);
}

function addStatus(
  c: Combatant,
  id: StatusEffectId,
  rounds: number,
  magnitude: number,
  sourceId?: string
): void {
  const existing = findStatus(c, id);
  if (existing) {
    existing.roundsRemaining = Math.max(existing.roundsRemaining, rounds);
    if (id === "shield") {
      // shields stack additively (absorb pool)
      existing.magnitude += magnitude;
    } else {
      existing.magnitude = Math.max(existing.magnitude, magnitude);
    }
    existing.sourceId = sourceId;
  } else {
    c.statuses.push({ id, roundsRemaining: rounds, magnitude, sourceId });
  }
}

// Tick weaken / defense_down / regen / shield durations at END of round.
// Freeze is NOT ticked here — it ticks when consumed at the start of a crab's turn.
function tickNonFreezeStatuses(state: ArenaBattleState): void {
  for (const c of allCombatants(state)) {
    for (const s of c.statuses) {
      if (s.id === "freeze") continue;
      s.roundsRemaining -= 1;
    }
    c.statuses = c.statuses.filter(
      (s) => s.id === "freeze" || s.roundsRemaining > 0
    );
  }
}

// Apply regen heals at END of round (before tick).
function applyRegenToAll(state: ArenaBattleState): void {
  for (const c of allCombatants(state)) {
    if (c.isDefeated) continue;
    const regen = findStatus(c, "regen");
    if (regen) {
      const heal = Math.max(1, Math.round((c.maxHp * regen.magnitude) / 100));
      const before = c.hp;
      c.hp = Math.min(c.maxHp, c.hp + heal);
      const actual = c.hp - before;
      if (actual > 0) {
        state.log.push({
          turn: state.turn,
          actorId: c.crabId,
          actorSide: c.side,
          skillId: "regen_tick",
          skillName: "Regen",
          targetIds: [c.crabId],
          targetSide: c.side,
          heal: actual,
          visual: "heal_pearl",
          message: `${c.name} regenerates ${actual} HP from a tide-pearl aura.`,
        });
      }
    }
  }
}

// ============================================================================
// DAMAGE / HEAL CORE
// ============================================================================

function allCombatants(state: ArenaBattleState): Combatant[] {
  return [...state.player, ...state.enemy];
}

function sideOf(state: ArenaBattleState, side: "player" | "enemy"): Combatant[] {
  return side === "player" ? state.player : state.enemy;
}

// Mage & healer classes use the "skill" stat as their base damage/heal stat.
function baseStat(actor: Combatant): number {
  if (actor.classId === "tidecaller" || actor.classId === "shellmender") {
    return actor.skill;
  }
  return actor.attack;
}

// Effective attack accounting for weaken debuff on the actor.
function effectiveAtk(actor: Combatant): number {
  const weaken = findStatus(actor, "weaken");
  const mult = weaken ? 1 - weaken.magnitude : 1;
  return baseStat(actor) * mult;
}

// Apply damage to a single target. Shield absorbs first.
// Returns the amount of HP actually removed (after shield).
function dealDamage(
  state: ArenaBattleState,
  target: Combatant,
  rawDmg: number
): number {
  let remaining = Math.max(0, Math.round(rawDmg));
  const shield = findStatus(target, "shield");
  if (shield) {
    const absorb = Math.min(shield.magnitude, remaining);
    shield.magnitude -= absorb;
    remaining -= absorb;
    if (shield.magnitude <= 0) {
      target.statuses = target.statuses.filter((s) => s.id !== "shield");
    }
  }
  if (remaining > 0) {
    target.hp = Math.max(0, target.hp - remaining);
    if (target.hp <= 0) {
      target.isDefeated = true;
    }
  }
  // Track total damage rolled (includes shield-absorbed) for stats.
  state.totalDamageDealt[dealSourceSide(state, target)] += Math.round(rawDmg);
  return remaining;
}

// Whose damage is this? The "player" total tracks damage dealt BY player crabs.
// `target` is on the opposite side of the attacker, so dealSourceSide = opposite of target.side.
function dealSourceSide(state: ArenaBattleState, target: Combatant): "player" | "enemy" {
  return target.side === "player" ? "enemy" : "player";
}

function applyHeal(target: Combatant, amount: number): number {
  if (target.isDefeated) return 0;
  const before = target.hp;
  target.hp = Math.min(target.maxHp, target.hp + Math.round(amount));
  return target.hp - before;
}

// ============================================================================
// TARGET SELECTION (AI)
// ============================================================================

function aliveOnSide(state: ArenaBattleState, side: "player" | "enemy"): Combatant[] {
  return sideOf(state, side).filter((c) => !c.isDefeated);
}

// ============================================================================
// POSITION RULES (formation rows) — see README "Battlefield position rules"
// ============================================================================
//
// 1. REACH: single-target MELEE skills can only strike the frontmost living
//    enemy row (front while any front stands, then mid, then back). RANGED
//    skills (lightning/magic casts) reach any row. AoE hits every row.
// 2. FRONTLINE GUARD: front-row combatants take 10% less damage from
//    single-target skills — they are built to hold the line.
// 3. BACKLINE PROTECTION: back-row combatants take 20% less damage from
//    single-target skills while any of their front-row allies still stands.
// Mid-row is neutral. AoE and ally/self skills ignore these factors.

export const FRONTLINE_GUARD_FACTOR = 0.9;
export const BACKLINE_PROTECTION_FACTOR = 0.8;

export type SkillRange = "melee" | "ranged" | "aoe" | "support";

/** Tactical range of a skill, derived from its targeting + visual language. */
export function skillRange(skill: ArenaSkill): SkillRange {
  if (skill.targetType === "all_enemies") return "aoe";
  if (skill.targetType !== "enemy") return "support";
  return skill.visual === "lightning" || skill.visual === "magic"
    ? "ranged"
    : "melee";
}

/** The frontmost row of `side` that still has a living combatant. */
export function frontmostAliveRow(
  state: ArenaBattleState,
  side: "player" | "enemy"
): RowId | null {
  const alive = aliveOnSide(state, side);
  for (const row of ["front", "mid", "back"] as RowId[]) {
    if (alive.some((c) => c.row === row)) return row;
  }
  return null;
}

/** Enemies `actor` may legally strike with `skill` right now. */
export function legalEnemyTargets(
  state: ArenaBattleState,
  actor: Combatant,
  skill: ArenaSkill
): Combatant[] {
  const enemySide: "player" | "enemy" =
    actor.side === "player" ? "enemy" : "player";
  const enemies = aliveOnSide(state, enemySide);
  if (skillRange(skill) !== "melee") return enemies;
  const row = frontmostAliveRow(state, enemySide);
  return row ? enemies.filter((c) => c.row === row) : enemies;
}

/** Damage multiplier from the target's row for a single-target enemy skill. */
export function positionDamageFactor(
  state: ArenaBattleState,
  target: Combatant,
  skill: ArenaSkill
): number {
  if (skill.targetType !== "enemy") return 1;
  let factor = 1;
  if (target.row === "front") factor *= FRONTLINE_GUARD_FACTOR;
  if (target.row === "back") {
    const frontStanding = aliveOnSide(state, target.side).some(
      (c) => c.row === "front"
    );
    if (frontStanding) factor *= BACKLINE_PROTECTION_FACTOR;
  }
  return factor;
}

/**
 * Pick a target for `skill`, respecting position reach. For single-target
 * enemy skills the pool is restricted to legal targets (melee → frontmost
 * row); the lowest-HP enemy in the pool wins, with the same back-row
 * near-tie preference as pickAiTarget. Other skills delegate to pickAiTarget.
 */
export function pickTargetForSkill(
  state: ArenaBattleState,
  actor: Combatant,
  skill: ArenaSkill
): Combatant | null {
  if (skill.targetType !== "enemy") return pickAiTarget(actor, state);
  const pool = legalEnemyTargets(state, actor, skill);
  if (pool.length === 0) return null;
  return pool.reduce((low, c) => {
    const lowRatio = low.hp / low.maxHp;
    const cRatio = c.hp / c.maxHp;
    if (cRatio < lowRatio - 0.02) return c;
    if (Math.abs(cRatio - lowRatio) <= 0.02 && c.slot > low.slot) return c;
    return low;
  }, pool[0]);
}

/**
 * Pick a target for an AI-controlled crab.
 * Healers (shellmender) target the lowest-HP ally; everyone else targets the lowest-HP enemy.
 *
 * 5v5 note: with five crabs per side, HP-ratio ties are more common. On near-ties
 * (within 2% of max HP) we prefer the back-row crab (higher slot index) — back-row
 * slots conventionally hold mages/healers who are easier to focus down. This is a
 * subtle tactical preference; it does NOT override a clearly lower-HP target.
 */
export function pickAiTarget(
  actor: Combatant,
  state: ArenaBattleState
): Combatant | null {
  const enemySide: "player" | "enemy" =
    actor.side === "player" ? "enemy" : "player";

  const isHealer = actor.classId === "shellmender";
  if (isHealer) {
    // Heal lowest-HP ally (not self unless self is the only one)
    const allies = aliveOnSide(state, actor.side);
    const candidates = allies.filter((c) => c.crabId !== actor.crabId);
    const pool = candidates.length > 0 ? candidates : allies;
    if (pool.length === 0) return null;
    return pool.reduce((low, c) => {
      const lowRatio = low.hp / low.maxHp;
      const cRatio = c.hp / c.maxHp;
      if (cRatio < lowRatio - 0.02) return c;
      if (Math.abs(cRatio - lowRatio) <= 0.02 && c.slot > low.slot) return c;
      return low;
    }, pool[0]);
  }

  // Lowest-HP enemy, with a back-row tiebreak on near-ties.
  const enemies = aliveOnSide(state, enemySide);
  if (enemies.length === 0) return null;
  return enemies.reduce((low, c) => {
    const lowRatio = low.hp / low.maxHp;
    const cRatio = c.hp / c.maxHp;
    if (cRatio < lowRatio - 0.02) return c;
    if (Math.abs(cRatio - lowRatio) <= 0.02 && c.slot > low.slot) return c;
    return low;
  }, enemies[0]);
}

/**
 * Pick the best skill for an AI crab.
 * Healers/tanks prefer support skills; otherwise, the highest-damage affordable & off-cooldown skill.
 * Always returns something usable (falls back to Claw Strike which has cost 1 & cooldown 0).
 */
export function pickAiSkill(actor: Combatant): ArenaSkill {
  const skills = getSkillsForClass(actor.classId);
  const usable = skills.filter(
    (s) =>
      actor.energy >= s.energyCost && (actor.cooldowns[s.id] ?? 0) <= 0
  );

  if (usable.length === 0) {
    // Shouldn't happen because Claw Strike costs 1 & has no cooldown,
    // but guard anyway: use Claw Strike.
    return skills[0];
  }

  // Support classes prefer support skills when available.
  const isSupport =
    actor.classId === "shellmender" || actor.classId === "bulwark";
  if (isSupport) {
    const support = usable.find(
      (s) =>
        s.targetType === "ally" ||
        s.targetType === "self" ||
        s.targetType === "all_allies"
    );
    if (support) return support;
  }

  // Otherwise: highest expected damage roll = baseStat * power.
  // We approximate using actor.attack for everyone; mages will be slightly underestimated
  // but the relative ordering between their own skills remains correct since power dominates.
  return usable.reduce((best, s) =>
    s.power * actor.attack > best.power * actor.attack ? s : best
  );
}

// Build the target list for a skill based on its targetType.
function resolveTargets(
  state: ArenaBattleState,
  actor: Combatant,
  skill: ArenaSkill
): Combatant[] {
  const enemySide: "player" | "enemy" =
    actor.side === "player" ? "enemy" : "player";

  switch (skill.targetType) {
    case "enemy": {
      const t = pickTargetForSkill(state, actor, skill);
      return t ? [t] : [];
    }
    case "all_enemies":
      return aliveOnSide(state, enemySide);
    case "ally": {
      // Lowest-HP ally (excluding self if others alive)
      const allies = aliveOnSide(state, actor.side);
      const candidates = allies.filter((c) => c.crabId !== actor.crabId);
      const pool = candidates.length > 0 ? candidates : allies;
      if (pool.length === 0) return [];
      return [
        pool.reduce((low, c) =>
          c.hp / c.maxHp < low.hp / low.maxHp ? c : low
        , pool[0]),
      ];
    }
    case "all_allies":
      return aliveOnSide(state, actor.side);
    case "self":
      return [actor];
    default:
      return [];
  }
}

// ============================================================================
// SKILL APPLICATION
// ============================================================================

/**
 * Apply a skill — mutates state and returns the resulting ArenaAction.
 */
export function applySkill(
  state: ArenaBattleState,
  actor: Combatant,
  skill: ArenaSkill,
  targets: Combatant[]
): ArenaAction {
  // Pay energy & set cooldown.
  actor.energy = Math.max(0, actor.energy - skill.energyCost);
  if (skill.cooldown > 0) {
    actor.cooldowns[skill.id] = skill.cooldown;
  }

  const atk = effectiveAtk(actor);
  const targetSide: "player" | "enemy" =
    skill.targetType === "self" || skill.targetType === "ally" || skill.targetType === "all_allies"
      ? actor.side
      : actor.side === "player"
      ? "enemy"
      : "player";

  let totalDamage = 0;
  let totalHeal = 0;
  const statusApplied: { status: StatusEffectId; targetId: string }[] = [];
  const defeated: string[] = [];
  let bestCombo = 0;

  for (const target of targets) {
    if (target.isDefeated) continue;

    const isAllyTarget =
      target.side === actor.side &&
      (skill.targetType === "ally" || skill.targetType === "all_allies");

    if (skill.targetType === "self") {
      // Self-cast skills: only apply status (effect.applyTo covers allies/enemies,
      // not the caster themselves unless they're included via all_allies below).
      // No damage / heal to self.
    } else if (isAllyTarget) {
      // Healing skill on ally: heal instead of damage.
      // Use skill.power as the heal multiplier on the caster's base stat.
      const variance = 0.85 + roll(state) * 0.3;
      const healAmount = atk * skill.power * variance;
      const healed = applyHeal(target, healAmount);
      totalHeal += healed;
    } else {
      // Damage to enemy.
      // Increment combo count on this target (per-round).
      target.comboCount += 1;
      const comboMult =
        target.comboCount >= 2 ? 1 + 0.2 * (target.comboCount - 1) : 1;
      if (comboMult > 1 && comboMult > bestCombo) {
        bestCombo = comboMult;
      }

      const variance = 0.85 + roll(state) * 0.3;
      const def = target.defense;
      const defFactor = 1 - def / (def + 120);

      // AoE falloff: in 5v5, all_enemies skills hit up to 5 targets — without
      // adjustment they would deal ~67% more total damage than against a smaller
      // team. Apply a flat 15% per-target reduction so AoE remains useful but
      // can't one-shot an entire team. Single-target skills are unaffected.
      const aoeFactor = skill.targetType === "all_enemies" ? 0.85 : 1.0;

      // Status mod: defense_down on target → +30% damage taken.
      const dDown = findStatus(target, "defense_down");
      const statusMod = dDown ? 1 + dDown.magnitude : 1;

      // Position mod: frontline guard / backline protection (single-target only).
      const posFactor = positionDamageFactor(state, target, skill);

      // Element mod: attacker element vs target element (elements.ts —
      // strong x1.15, weak x0.90, neutral x1.0).
      const elemFactor = effectiveness(actor.element, target.element);

      const rawDmg =
        atk * skill.power * variance * defFactor * statusMod * comboMult * aoeFactor * posFactor * elemFactor;

      const hpRemoved = dealDamage(state, target, rawDmg);
      totalDamage += Math.round(rawDmg);

      if (hpRemoved > 0 && target.hp <= 0 && target.isDefeated) {
        defeated.push(target.crabId);
      }
    }

    // Apply status effect from the skill (if any) to the appropriate recipients.
    if (skill.effect) {
      const eff = skill.effect;
      let recipients: Combatant[] = [];
      if (eff.applyTo === "target") {
        recipients = [target];
      } else if (eff.applyTo === "all_allies") {
        recipients = aliveOnSide(state, actor.side);
      } else if (eff.applyTo === "all_enemies") {
        const oppSide: "player" | "enemy" =
          actor.side === "player" ? "enemy" : "player";
        recipients = aliveOnSide(state, oppSide);
      }
      for (const r of recipients) {
        if (r.isDefeated) continue;
        // Compute the actual magnitude for shield: fraction of caster maxHp.
        let mag = eff.magnitude;
        if (eff.status === "shield") {
          mag = Math.round(actor.maxHp * eff.magnitude + actor.level * 8);
        }
        addStatus(r, eff.status, eff.rounds, mag, actor.crabId);
        statusApplied.push({ status: eff.status, targetId: r.crabId });
      }
    }
  }

  if (bestCombo > state.maxCombo) {
    state.maxCombo = bestCombo;
  }

  // Build a human-readable message.
  const targetNames = targets.map((t) => t.name).join(", ");
  let message = `${actor.name} casts ${skill.name}`;
  if (totalDamage > 0) message += ` on ${targetNames} for ${totalDamage} damage`;
  else if (totalHeal > 0) message += ` on ${targetNames}, restoring ${totalHeal} HP`;
  else message += ` to channel a sigil`;
  if (statusApplied.length > 0) {
    const statuses = Array.from(new Set(statusApplied.map((s) => s.status))).join(", ");
    message += ` (${statuses})`;
  }
  if (defeated.length > 0) {
    message += ` — ${defeated.length} foe${defeated.length > 1 ? "s" : ""} defeated!`;
  }
  if (bestCombo >= 1.2) {
    message += ` [Combo x${targetHitsLabel(bestCombo)}!]`;
  }

  const action: ArenaAction = {
    turn: state.turn,
    actorId: actor.crabId,
    actorSide: actor.side,
    skillId: skill.id,
    skillName: skill.name,
    targetIds: targets.map((t) => t.crabId),
    targetSide,
    visual: skill.visual,
    message,
  };
  if (totalDamage > 0) action.damage = totalDamage;
  if (totalHeal > 0) action.heal = totalHeal;
  if (statusApplied.length > 0) action.statusApplied = statusApplied;
  if (bestCombo >= 1.2) action.combo = bestCombo;
  if (defeated.length > 0) action.defeated = defeated;

  state.log.push(action);
  return action;
}

// Convert a combo multiplier (1.2, 1.4, ...) into a friendly "x2", "x3" label.
function targetHitsLabel(comboMult: number): number {
  // 1.2 → 2, 1.4 → 3, 1.6 → 4 ...
  return Math.round((comboMult - 1) / 0.2) + 1;
}

// ============================================================================
// ROUND RESOLUTION
// ============================================================================

// Turn order: alive crabs sorted by speed desc; ties broken by class order in CLASSES.
const CLASS_ORDER: ClassId[] = [
  "skitter",
  "reaver",
  "gildclaw",
  "warden",
  "pincher",
  "tidecaller",
  "bulwark",
  "shellmender",
];

function classOrderIndex(classId: ClassId): number {
  const i = CLASS_ORDER.indexOf(classId);
  return i === -1 ? 99 : i;
}

function turnOrder(state: ArenaBattleState): Combatant[] {
  const alive = allCombatants(state).filter((c) => !c.isDefeated);
  alive.sort((a, b) => {
    if (b.speed !== a.speed) return b.speed - a.speed;
    return classOrderIndex(a.classId) - classOrderIndex(b.classId);
  });
  return alive;
}

function checkWinner(state: ArenaBattleState): void {
  if (state.winner !== null) return;
  const playerAlive = state.player.some((c) => !c.isDefeated);
  const enemyAlive = state.enemy.some((c) => !c.isDefeated);
  if (!playerAlive && !enemyAlive) {
    state.winner = "enemy"; // mutual wipe → defender wins
  } else if (!playerAlive) {
    state.winner = "enemy";
  } else if (!enemyAlive) {
    state.winner = "player";
  }
}

function regenEnergy(state: ArenaBattleState): void {
  for (const c of allCombatants(state)) {
    if (c.isDefeated) continue;
    c.energy = Math.min(c.maxEnergy, c.energy + ENERGY_PER_ROUND);
  }
}

function tickCooldowns(state: ArenaBattleState): void {
  for (const c of allCombatants(state)) {
    for (const id of Object.keys(c.cooldowns)) {
      if (c.cooldowns[id] > 0) c.cooldowns[id] -= 1;
      if (c.cooldowns[id] <= 0) delete c.cooldowns[id];
    }
  }
}

function resetCombos(state: ArenaBattleState): void {
  for (const c of allCombatants(state)) {
    c.comboCount = 0;
  }
}

/**
 * Resolve one full round: every alive crab acts once in speed order.
 * Returns the actions produced this round. Mutates state in place.
 */
export function resolveRound(state: ArenaBattleState): ArenaAction[] {
  if (state.winner !== null) return [];
  state.turn += 1;
  const roundLogStart = state.log.length;

  // Energy regen happens at END of round (so round 1 starts at the 3-energy floor
  // defined by makeCombatant; round 2 onwards benefits from the +2 boost).

  for (const actor of turnOrder(state)) {
    if (state.winner !== null) break;
    if (actor.isDefeated) continue;

    // Freeze: if frozen, skip this turn and consume the freeze.
    const freeze = findStatus(actor, "freeze");
    if (freeze && freeze.roundsRemaining > 0) {
      freeze.roundsRemaining -= 1;
      if (freeze.roundsRemaining <= 0) {
        actor.statuses = actor.statuses.filter((s) => s.id !== "freeze");
      }
      state.log.push({
        turn: state.turn,
        actorId: actor.crabId,
        actorSide: actor.side,
        skillId: "frozen",
        skillName: "Frozen",
        targetIds: [actor.crabId],
        targetSide: actor.side,
        visual: "lightning",
        message: `${actor.name} is frozen solid and skips the turn!`,
      });
      continue;
    }

    const skill = pickAiSkill(actor);
    let targets = resolveTargets(state, actor, skill);

    if (targets.length === 0) {
      // Fallback: cast Claw Strike on the lowest-HP enemy.
      const fallback = getSkillsForClass(actor.classId)[0];
      const t = pickAiTarget(actor, state);
      if (t) {
        targets = [t];
        applySkill(state, actor, fallback, targets);
      }
      // If no target at all, skip silently.
      continue;
    }

    applySkill(state, actor, skill, targets);

    checkWinner(state);
  }

  // End-of-round maintenance.
  applyRegenToAll(state);
  regenEnergy(state);
  tickNonFreezeStatuses(state);
  tickCooldowns(state);
  resetCombos(state);
  checkWinner(state);

  return state.log.slice(roundLogStart);
}

// ============================================================================
// FULL BATTLE RUNNER
// ============================================================================

/**
 * Run the full battle to completion. Used for "auto" mode and final resolution.
 * Stops when a winner is determined or maxTurns is reached (default 30).
 *
 * 5v5 note: with five crabs per side, each round produces ~67% more actions than
 * a smaller-team format, but total team HP and total team DPS scale by the same
 * factor — so the expected number of rounds to resolve a battle is unchanged.
 * The default cap of 30 rounds remains sufficient; callers may pass a smaller
 * cap for faster sim.
 */
export function runBattle(
  state: ArenaBattleState,
  maxTurns = 30
): ArenaBattleState {
  while (state.winner === null && state.turn < maxTurns) {
    resolveRound(state);
  }
  if (state.winner === null) {
    // Time-out: decide by remaining HP ratio.
    const playerHpLeft = state.player.reduce(
      (sum, c) => sum + (c.isDefeated ? 0 : c.hp),
      0
    );
    const enemyHpLeft = state.enemy.reduce(
      (sum, c) => sum + (c.isDefeated ? 0 : c.hp),
      0
    );
    if (playerHpLeft > enemyHpLeft) state.winner = "player";
    else if (enemyHpLeft > playerHpLeft) state.winner = "enemy";
    else state.winner = "enemy"; // defender wins ties
  }
  return state;
}

// ============================================================================
// REWARDS
// ============================================================================

/**
 * Calculate XP and gold rewards based on outcome.
 * - Victory: goldReward = entryCost + bonus (50..245 based on enemy avg level)
 *   xpReward = enemyAvgLevel * 15 (per surviving player crab)
 *   30% chance of 1-2 random materials
 * - Defeat: nothing.
 *
 * 5v5 note: victory gold bonus is scaled ~30% above the per-crab baseline
 * (max additional 195 vs 150) — five defeated crabs yield more loot.
 * XP per surviving crab is unchanged since survivors count is naturally higher.
 */
export function calculateRewards(
  state: ArenaBattleState,
  entryCost: number
): {
  winner: "player" | "enemy";
  goldReward: number;
  xpReward: number;
  itemsFound: { itemId: string; count: number }[];
} {
  const enemyAvgLevel =
    state.enemy.reduce((s, c) => s + c.level, 0) / Math.max(1, state.enemy.length);

  if (state.winner !== "player") {
    return {
      winner: state.winner ?? "enemy",
      goldReward: 0,
      xpReward: 0,
      itemsFound: [],
    };
  }

  // Bonus gold 50..245 based on enemy avg level (1..50 → 50..245).
  // Scaled ~30% above the per-crab baseline (max additional 195 vs 150) to
  // reward five-crab victories.
  const bonus =
    50 + Math.round(((Math.max(1, enemyAvgLevel) - 1) / 49) * 195);
  const goldReward = Math.round(entryCost) + bonus;

  // XP per surviving player crab.
  const survivors = state.player.filter((c) => !c.isDefeated).length;
  const xpReward = Math.max(1, Math.round(enemyAvgLevel * 15)) * Math.max(1, survivors);

  // 30% chance of 1-2 random materials.
  const itemsFound: { itemId: string; count: number }[] = [];
  const r = roll(state);
  if (r < 0.3) {
    const count = roll(state) < 0.5 ? 1 : 2;
    for (let i = 0; i < count; i++) {
      const idx = Math.floor(roll(state) * ARENA_DROP_MATERIALS.length);
      const itemId = ARENA_DROP_MATERIALS[idx];
      const existing = itemsFound.find((it) => it.itemId === itemId);
      if (existing) existing.count += 1;
      else itemsFound.push({ itemId, count: 1 });
    }
  }

  return {
    winner: "player",
    goldReward,
    xpReward,
    itemsFound,
  };
}
