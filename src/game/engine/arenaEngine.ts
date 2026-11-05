// Crabtopia - Arena 5v5 battle vocabulary & contracts
// Pure logic, deterministic by seed. No React, no UI.
// Holds: skills (3 per crab from class), combatant/battle construction,
// the shared seeded RNG stream, formation position rules, and the
// rewards contract. The real-time RULES implementation (movement,
// cooldowns, statuses, damage resolution) lives in battleSim.ts —
// this module no longer resolves battles itself.
// Five crabs per side (5v5) — see ARENA-GAME-SHARED.md for the full battle spec.

import { Crab, ClassId, ElementId, FactionId, Formation } from "../types";
import { CLASSES } from "../content/classes";
import { mulberry32 } from "./rng";
import { rowOf, type RowId } from "./formation";
import { elementOf } from "./elements";
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
  | "shield"
  | "slow";

/**
 * Hard crowd-control statuses — they fully disable the victim while
 * active and are governed by the fairness layer (tenacity, diminishing
 * returns, uptime cap, cleanse). Today only `freeze` is hard CC; the
 * category machinery in battleSim.ts is generic so sleep/stun can slot
 * in later without rework.
 */
export type HardCcId = "freeze";

/** Statuses a cleanse can remove (debuffs + hard CC + slow). */
export type CleansableId = "weaken" | "defense_down" | "freeze" | "slow";

export interface StatusEffect {
  id: StatusEffectId;
  /** Remaining duration in BATTLE milliseconds (the sim ticks it down). */
  durationMs: number;
  magnitude: number;
  sourceId?: string;
  /** Battle-ms timestamp of (re)application — cleanse removes the newest. */
  appliedAtMs?: number;
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
      // Controller: freeze the target — a frozen crab CANNOT act. In the
      // real-time sim freeze is hard CC metered by the fairness layer
      // (battleSim.ts): 2000 battle-ms base, tenacity/DR/uptime-capped.
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
// SHARED COMBAT PRIMITIVES (used by the real-time simulator, battleSim.ts)
// ============================================================================
//
// The turn-based round resolver is gone: battleSim.ts is the ONE rules
// implementation for watched and skipped battles alike. What remains here
// is the shared vocabulary both layers build on — skill definitions,
// combatant construction, the seeded RNG stream, the position rules, and
// the rewards contract.

/** Find a combatant's active status instance, if any. */
export function findStatusEffect(
  c: Combatant,
  id: StatusEffectId,
): StatusEffect | undefined {
  return c.statuses.find((s) => s.id === id);
}

// Mage & healer classes use the "skill" stat as their base damage/heal stat.
export function baseStatOf(actor: Combatant): number {
  if (actor.classId === "tidecaller" || actor.classId === "shellmender") {
    return actor.skill;
  }
  return actor.attack;
}

// Effective attack accounting for the weaken debuff on the actor and the
// slow status (slowed attackers also swing slower — the simulator folds
// slow into action durations; the attack VALUE only reflects weaken).
export function effectiveAttackOf(actor: Combatant): number {
  const weaken = findStatusEffect(actor, "weaken");
  const mult = weaken ? 1 - weaken.magnitude : 1;
  return baseStatOf(actor) * mult;
}

/**
 * Draw the next value from the battle's ONE seeded RNG stream
 * (mulberry32(seed ^ 0x9e3779b9)). The simulator draws every variance /
 * status roll from this stream in fixed tick order and calculateRewards
 * draws last, so a watched battle and a skipped battle with the same
 * seed consume the identical stream and produce identical rewards.
 */
export function drawBattleRandom(state: ArenaBattleState): number {
  return roll(state);
}

function aliveOnSide(state: ArenaBattleState, side: "player" | "enemy"): Combatant[] {
  return (side === "player" ? state.player : state.enemy).filter(
    (c) => !c.isDefeated,
  );
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
