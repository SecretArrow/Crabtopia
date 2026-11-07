// Crabtopia — Real-Time Battle Simulator (Phase 2)
// ---------------------------------------------------------------------------
// THE one rules implementation for arena battles: watched and skipped
// battles run this exact simulation, so they can never diverge.
//
// Model: fixed-timestep simulation in BATTLE milliseconds. One tick =
// 50 battle-ms. The renderer feeds it BattleClock-scaled deltas (pause
// = scale 0 = the sim receives nothing and freezes exactly; x2/x3 feed
// it proportionally more). Skip = runSimToCompletion on the same sim.
//
// Determinism: every roll (damage variance, status tenacity) draws from
// the battle's ONE seeded stream (arenaEngine.drawBattleRandom) in a
// fixed order — per tick: units in slot order (player 0–4, enemy 0–4),
// then projectiles in spawn order; reward rolls (calculateRewards)
// draw last. The pilot (autoPilot.decideSimAction) rolls nothing.
// Same seed + same teams ⇒ identical event log (hash-testable).
//
// The sim owns positions, targets, cooldowns (battle-ms), statuses,
// projectiles and deaths, and emits a timestamped event queue the
// renderer consumes for poses / FX / damage numbers / the log. Damage
// lands when the event fires — melee at the strike moment, projectiles
// on arrival — never before the visual.

import {
  drawBattleRandom,
  effectiveAttackOf,
  findStatusEffect,
  positionDamageFactor,
  skillRange,
  type ArenaAction,
  type ArenaBattleState,
  type ArenaSkill,
  type Combatant,
  type StatusEffect,
  type StatusEffectId,
} from "./arenaEngine";
import { effectiveness } from "./elements";
import { decideSimAction, type PilotDecision } from "./autoPilot";
import type { ClassId } from "../types";

// ============================================================================
// CONSTANTS
// ============================================================================

export const TICK_MS = 50;
/** One old "round" in battle-ms (energy +2, cooldown & duration scale). */
export const ROUND_MS = 6000;
/** Battle cap: the old 30 rounds ≙ 180000 battle-ms, then HP-ratio decides. */
export const BATTLE_TIMEOUT_MS = 30 * ROUND_MS;

/** Melee stop distance to the target centre (field %). */
export const MELEE_STOP = 9.5;
/** A melee action may start within this distance. */
export const MELEE_REACH = 10.5;
/** Ranged (Warden) engagement band, field %. */
export const RANGED_BAND = { min: 25, max: 35 } as const;
/** Caster (Tidecaller) engagement band, field %. */
export const CASTER_BAND = { min: 23, max: 33 } as const;
/** Support damage casts reach at most this far (and never cross midfield). */
export const SUPPORT_CAST_RANGE = 30;
/** Heal / shield delivery range. */
export const ALLY_CAST_RANGE = 24;

/** Field clamps (field %): keep every unit's centre on the battlefield. */
export const FIELD = { minX: 10.8, maxX: 89.2, minY: 10, maxY: 90 } as const;
/** Personal space: steering pushes units apart to at least this distance. */
export const SEPARATION = 6.5;

/** Hard-CC fairness tuning (design §5.4). */
export const CC_BASE_DURATION_MS = 2000;
export const CC_DR_WINDOW_MS = 10000;
export const CC_DR_LADDER = [1, 0.5, 0.25] as const;
export const CC_IMMUNITY_MS = 5000;
export const CC_UPTIME_CAP_MS = 4000; // 40% of the 10000ms window
export const CLEANSE_IMMUNITY_MS = 1500;
export const SLOW_MAGNITUDE = 0.4;
/** Hesitation after a daze fumbles an offensive action start. */
export const DAZED_HESITATION_MS = 700;

const PROJECTILE_SPEED = 55; // field % per second
const ENERGY_PER_MS = 2 / ROUND_MS;
const COMBO_DECAY_MS = 3000;
const HITSTUN_MS = 200;
const DECISION_INTERVAL_MS = 250;

// ============================================================================
// TYPES
// ============================================================================

export type BattleRole =
  | "tank"
  | "melee"
  | "assassin"
  | "ranged"
  | "caster"
  | "support";

export function roleOf(classId: ClassId): BattleRole {
  switch (classId) {
    case "bulwark":
      return "tank";
    case "skitter":
      return "assassin";
    case "warden":
      return "ranged";
    case "tidecaller":
      return "caster";
    case "shellmender":
      return "support";
    default:
      return "melee"; // reaver, pincher, gildclaw, …
  }
}

export type UnitState =
  | "idle"
  | "seek"
  | "windup"
  | "cast"
  | "recover"
  | "hitstun"
  | "dead";

export interface SimIntent {
  skill: ArenaSkill;
  targetIds: string[];
  reason: PilotDecision["reason"];
}

interface PendingAction {
  skill: ArenaSkill;
  primaryTargetId: string | null;
  resolveAt: number;
  kind: "strike" | "cast";
  startedAt: number;
}

export interface SimUnit {
  c: Combatant;
  // Position & facing (field %; facing +1 = right, -1 = left).
  x: number;
  y: number;
  spawnX: number;
  spawnY: number;
  facing: 1 | -1;
  facingLockUntil: number;
  vx: number;
  vy: number;
  /** Current ground speed in field %/s — drives walk/run + stride sync. */
  speedNow: number;
  state: UnitState;
  recoverUntil: number;
  hitstunUntil: number;
  intent: SimIntent | null;
  /** Current focus target id (enemy or ally), mirrored from the intent. */
  targetId: string | null;
  pending: PendingAction | null;
  nextDecisionAt: number;
  /** Continuous energy (Combatant.energy mirrors its floor for the HUD). */
  energyF: number;
  basicReadyAt: number;
  skillReadyAt: Record<string, number>;
  lastHitTakenAt: number;
  // Regen bookkeeping (fractional heal accumulator + log chunking).
  regenAcc: number;
  regenLogAcc: number;
  regenLogAt: number;
  // Hard-CC fairness bookkeeping (per target).
  ccApplications: number[];
  ccIntervals: { start: number; end: number }[];
  ccImmuneUntil: number;
  /**
   * Post-freeze dizziness (common-sense logic): offensive action
   * starts this unit will still fumble after thawing from a freeze
   * that expired NATURALLY (1–2, rolled from the seeded stream at
   * expiry). A cleanse instead clears the head — no daze, and any
   * pending daze is wiped. Sim-internal only; not a status effect.
   */
  dazedActions: number;
  deathAt: number | null;
}

export interface SimProjectile {
  id: number;
  actorId: string;
  targetId: string;
  skill: ArenaSkill;
  x: number;
  y: number;
  spawnAt: number;
  /** Estimated flight time at spawn — the renderer's visual matches it. */
  travelMs: number;
}

export type SimEvent =
  | { type: "attackStart"; at: number; actorId: string; skillId: string }
  | { type: "strike"; at: number; actorId: string; skillId: string; targetId: string; damage: number; comboMult: number; defeated: boolean }
  | { type: "whiff"; at: number; actorId: string; skillId: string; targetId: string | null }
  | { type: "projectileSpawn"; at: number; id: number; actorId: string; targetId: string; skillId: string; travelMs: number }
  | { type: "projectileHit"; at: number; id: number; actorId: string; targetId: string; skillId: string; damage: number; comboMult: number; defeated: boolean }
  | { type: "projectileFizzle"; at: number; id: number; targetId: string }
  | { type: "cast"; at: number; actorId: string; skillId: string; targetIds: string[] }
  | { type: "heal"; at: number; actorId: string; skillId: string; targetId: string; amount: number }
  | { type: "regen"; at: number; targetId: string; amount: number }
  | { type: "statusApplied"; at: number; actorId: string; targetId: string; status: StatusEffectId; durationMs: number }
  | { type: "statusResisted"; at: number; actorId: string; targetId: string; convertedFrom: "freeze"; reason: "tenacity" | "dr" | "immune" | "uptime" }
  | { type: "statusExpired"; at: number; targetId: string; status: StatusEffectId }
  | { type: "dazed"; at: number; targetId: string; actions: number }
  | { type: "actionFumbled"; at: number; actorId: string; skillId: string; reason: "dazed"; remaining: number }
  | { type: "cleansed"; at: number; actorId: string; targetId: string; removed: StatusEffectId | null }
  | { type: "death"; at: number; targetId: string; x: number; y: number }
  | { type: "victory"; at: number; winner: "player" | "enemy" };

export interface SimState {
  battle: ArenaBattleState;
  units: SimUnit[];
  byId: Map<string, SimUnit>;
  timeMs: number;
  remainderMs: number;
  events: SimEvent[];
  projectiles: SimProjectile[];
  nextProjectileId: number;
  finished: boolean;
}

// ============================================================================
// CONSTRUCTION
// ============================================================================

const BASIC_CYCLE_MS: Partial<Record<ClassId, number>> = {
  skitter: 1400,
  reaver: 1600,
  pincher: 1700,
  gildclaw: 1800,
  warden: 1900,
  tidecaller: 2000,
  shellmender: 2000,
  bulwark: 2200,
};

const MOVE_SPEED: Partial<Record<ClassId, number>> = {
  skitter: 17,
  reaver: 13.5,
  pincher: 12.5,
  gildclaw: 11.5,
  warden: 10.5,
  tidecaller: 10.5,
  shellmender: 10.5,
  bulwark: 9.5,
};

/**
 * Create the simulator over an initBattle state. `spawns` maps crabId →
 * field-% position (the renderer passes the slotLayout anchors, so the
 * formation arranged on the deployment board is the spawn formation).
 */
export function createSim(
  battle: ArenaBattleState,
  spawns: Record<string, { x: number; y: number }>,
): SimState {
  const units: SimUnit[] = [];
  const byId = new Map<string, SimUnit>();
  const all = [...battle.player, ...battle.enemy];
  all.forEach((c, i) => {
    const spawn = spawns[c.crabId] ?? { x: c.side === "player" ? 26 : 74, y: 50 };
    const u: SimUnit = {
      c,
      x: spawn.x,
      y: spawn.y,
      spawnX: spawn.x,
      spawnY: spawn.y,
      facing: c.side === "player" ? 1 : -1,
      facingLockUntil: 0,
      vx: 0,
      vy: 0,
      speedNow: 0,
      state: "idle",
      recoverUntil: 0,
      hitstunUntil: 0,
      intent: null,
      targetId: null,
      pending: null,
      nextDecisionAt: i * 37, // staggered first decisions (design §5.2)
      energyF: c.energy,
      basicReadyAt: 0,
      skillReadyAt: {},
      lastHitTakenAt: -Infinity,
      regenAcc: 0,
      regenLogAcc: 0,
      regenLogAt: 0,
      ccApplications: [],
      ccIntervals: [],
      ccImmuneUntil: 0,
      dazedActions: 0,
      deathAt: null,
    };
    units.push(u);
    byId.set(c.crabId, u);
  });
  return {
    battle,
    units,
    byId,
    timeMs: 0,
    remainderMs: 0,
    events: [],
    projectiles: [],
    nextProjectileId: 1,
    finished: battle.winner !== null,
  };
}

/** The old round number a battle-ms timestamp belongs to (log display). */
export function simRoundAt(timeMs: number): number {
  return Math.floor(timeMs / ROUND_MS) + 1;
}

export function distanceBetween(
  a: { x: number; y: number },
  b: { x: number; y: number },
): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** FNV-1a hash of the canonical event stream — determinism fingerprint. */
export function hashSimEvents(events: SimEvent[]): string {
  let h = 2166136261;
  const mix = (s: string) => {
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
  };
  for (const e of events) mix(JSON.stringify(e));
  return (h >>> 0).toString(16).padStart(8, "0");
}

// ============================================================================
// STATUS FAIRNESS LAYER (design §5.4)
// ============================================================================

const CLASS_TENACITY: Partial<Record<ClassId, number>> = {
  bulwark: 0.15,
  warden: 0.05,
};

/**
 * Chance that `target` resists a hard CC from `attacker`:
 * base 5% + 1% per level of advantage + class tenacity, capped at 50%.
 */
export function tenacityChance(attacker: Combatant, target: Combatant): number {
  const raw =
    0.05 +
    0.01 * (target.level - attacker.level) +
    (CLASS_TENACITY[target.classId] ?? 0);
  return Math.min(0.5, Math.max(0, raw));
}

function pruneCcHistory(unit: SimUnit, now: number): void {
  const from = now - CC_DR_WINDOW_MS;
  unit.ccApplications = unit.ccApplications.filter((t) => t >= from);
  unit.ccIntervals = unit.ccIntervals.filter((iv) => iv.end > from);
}

function ccUptimeInWindow(unit: SimUnit, now: number): number {
  const from = now - CC_DR_WINDOW_MS;
  let used = 0;
  for (const iv of unit.ccIntervals) {
    used += Math.max(0, Math.min(iv.end, now) - Math.max(iv.start, from));
  }
  return used;
}

function setStatus(
  unit: SimUnit,
  status: StatusEffect,
): void {
  const existing = unit.c.statuses.findIndex((s) => s.id === status.id);
  if (existing >= 0) unit.c.statuses[existing] = status;
  else unit.c.statuses.push(status);
}

function applySlow(
  sim: SimState,
  source: SimUnit,
  target: SimUnit,
  durationMs: number,
): void {
  const now = sim.timeMs;
  const existing = findStatusEffect(target.c, "slow");
  setStatus(target, {
    id: "slow",
    durationMs: Math.max(existing?.durationMs ?? 0, durationMs),
    magnitude: SLOW_MAGNITUDE,
    sourceId: source.c.crabId,
    appliedAtMs: now,
  });
  sim.events.push({
    type: "statusApplied",
    at: now,
    actorId: source.c.crabId,
    targetId: target.c.crabId,
    status: "slow",
    durationMs,
  });
}

/**
 * The hard-CC pipeline (freeze). Every gate that converts the CC into
 * the resisted-slow outcome instead of a full disable, in order:
 * immunity (window or Bulwark shield) → tenacity roll → diminishing
 * returns ladder (2000/1000/500 → immune) → 40% uptime cap.
 * Returns "applied" when the freeze lands, "converted" when it becomes
 * a slow.
 */
export function applyHardCc(
  sim: SimState,
  source: SimUnit,
  target: SimUnit,
  baseDurationMs: number = CC_BASE_DURATION_MS,
): "applied" | "converted" {
  const now = sim.timeMs;
  const targetId = target.c.crabId;
  const sourceId = source.c.crabId;
  if (target.c.isDefeated) return "converted";
  pruneCcHistory(target, now);

  const convert = (reason: "tenacity" | "dr" | "immune" | "uptime") => {
    applySlow(sim, source, target, Math.round(baseDurationMs * SLOW_MAGNITUDE));
    sim.events.push({
      type: "statusResisted",
      at: now,
      actorId: sourceId,
      targetId,
      convertedFrom: "freeze",
      reason,
    });
    return "converted" as const;
  };

  // Immunity: DR window immunity, or a Bulwark shield still holding.
  const shield = findStatusEffect(target.c, "shield");
  if (now < target.ccImmuneUntil || (shield && shield.magnitude > 0)) {
    return convert("immune");
  }
  // Tenacity roll (the battle's seeded stream, fixed order).
  if (drawBattleRandom(sim.battle) < tenacityChance(source.c, target.c)) {
    return convert("tenacity");
  }
  // Diminishing returns: 4th application inside the window → immunity.
  const applications = target.ccApplications.length;
  if (applications >= CC_DR_LADDER.length) {
    target.ccImmuneUntil = now + CC_IMMUNITY_MS;
    return convert("dr");
  }
  // Uptime cap: no more than 40% of the rolling window under hard CC.
  const allowed = CC_UPTIME_CAP_MS - ccUptimeInWindow(target, now);
  if (allowed < 200) return convert("uptime");

  const duration = Math.min(
    Math.round(baseDurationMs * CC_DR_LADDER[applications]),
    allowed,
  );
  setStatus(target, {
    id: "freeze",
    durationMs: duration,
    magnitude: 0,
    sourceId,
    appliedAtMs: now,
  });
  target.ccApplications.push(now);
  target.ccIntervals.push({ start: now, end: now + duration });
  // Frozen mid-windup: the action is cancelled — freeze truly disables.
  target.pending = null;
  sim.events.push({
    type: "statusApplied",
    at: now,
    actorId: sourceId,
    targetId,
    status: "freeze",
    durationMs: duration,
  });
  return "applied";
}

/**
 * Soft debuffs (weaken / defense_down): always land, but their duration
 * scales with the target's tenacity, and refreshing is disciplined —
 * a refresh can never push the remaining duration past
 * (remaining + 50% of base), so single-source 100% uptime is impossible.
 */
export function applySoftStatus(
  sim: SimState,
  source: SimUnit,
  target: SimUnit,
  id: "weaken" | "defense_down",
  baseDurationMs: number,
  magnitude: number,
): void {
  const now = sim.timeMs;
  if (target.c.isDefeated) return;
  const scaled = Math.round(
    baseDurationMs * (1 - tenacityChance(source.c, target.c) / 2),
  );
  const existing = findStatusEffect(target.c, id);
  const durationMs = existing
    ? Math.min(existing.durationMs + Math.round(scaled / 2), scaled)
    : scaled;
  setStatus(target, {
    id,
    durationMs,
    magnitude: Math.max(existing?.magnitude ?? 0, magnitude),
    sourceId: source.c.crabId,
    appliedAtMs: now,
  });
  sim.events.push({
    type: "statusApplied",
    at: now,
    actorId: source.c.crabId,
    targetId: target.c.crabId,
    status: id,
    durationMs,
  });
}

function applyShieldStatus(
  sim: SimState,
  source: SimUnit,
  target: SimUnit,
  baseDurationMs: number,
  pool: number,
): void {
  const now = sim.timeMs;
  const existing = findStatusEffect(target.c, "shield");
  setStatus(target, {
    id: "shield",
    durationMs: Math.max(existing?.durationMs ?? 0, baseDurationMs),
    magnitude: (existing?.magnitude ?? 0) + pool, // pools stack (as before)
    sourceId: source.c.crabId,
    appliedAtMs: now,
  });
  sim.events.push({
    type: "statusApplied",
    at: now,
    actorId: source.c.crabId,
    targetId: target.c.crabId,
    status: "shield",
    durationMs: baseDurationMs,
  });
}

function applyRegenStatus(
  sim: SimState,
  source: SimUnit,
  target: SimUnit,
  baseDurationMs: number,
  magnitude: number,
): void {
  const now = sim.timeMs;
  const existing = findStatusEffect(target.c, "regen");
  setStatus(target, {
    id: "regen",
    durationMs: Math.max(existing?.durationMs ?? 0, baseDurationMs),
    magnitude: Math.max(existing?.magnitude ?? 0, magnitude),
    sourceId: source.c.crabId,
    appliedAtMs: now,
  });
  sim.events.push({
    type: "statusApplied",
    at: now,
    actorId: source.c.crabId,
    targetId: target.c.crabId,
    status: "regen",
    durationMs: baseDurationMs,
  });
}

const CLEANSABLE: readonly StatusEffectId[] = [
  "freeze",
  "slow",
  "weaken",
  "defense_down",
];

/**
 * Cleanse (Shellmender's heal): remove the target's MOST RECENT
 * debuff/CC and grant a short CC immunity. Returns the removed status
 * id, or null when there was nothing to remove.
 */
export function cleanseTarget(
  sim: SimState,
  source: SimUnit,
  target: SimUnit,
): StatusEffectId | null {
  const now = sim.timeMs;
  const candidates = target.c.statuses.filter((s) => CLEANSABLE.includes(s.id));
  let removed: StatusEffectId | null = null;
  if (candidates.length > 0) {
    const newest = [...candidates].sort(
      (a, b) => (b.appliedAtMs ?? 0) - (a.appliedAtMs ?? 0),
    )[0];
    removed = newest.id;
    target.c.statuses = target.c.statuses.filter((s) => s.id !== newest.id);
  }
  // A cleanse clears the head as well as the body: a freeze removed
  // this way never thaws into dizziness, and any daze the target was
  // already carrying is wiped.
  target.dazedActions = 0;
  target.ccImmuneUntil = Math.max(target.ccImmuneUntil, now + CLEANSE_IMMUNITY_MS);
  if (removed !== null) {
    sim.events.push({
      type: "cleansed",
      at: now,
      actorId: source.c.crabId,
      targetId: target.c.crabId,
      removed,
    });
  }
  return removed;
}

function isFrozen(unit: SimUnit): boolean {
  const f = findStatusEffect(unit.c, "freeze");
  return !!f && f.durationMs > 0;
}

function slowFactorOf(unit: SimUnit): number {
  const s = findStatusEffect(unit.c, "slow");
  return s && s.durationMs > 0 ? 1 - s.magnitude : 1;
}

// ============================================================================
// DAMAGE / HEAL CORE (mirrors the old applySkill math, resolved per hit)
// ============================================================================

interface ActionAccumulator {
  totalDamage: number;
  totalHeal: number;
  statusApplied: { status: StatusEffectId; targetId: string }[];
  defeated: string[];
  bestCombo: number;
}

function newAccumulator(): ActionAccumulator {
  return { totalDamage: 0, totalHeal: 0, statusApplied: [], defeated: [], bestCombo: 0 };
}

/** Shield absorbs first; returns HP actually removed. Marks death. */
function dealDamageSim(
  sim: SimState,
  actor: SimUnit,
  target: SimUnit,
  rawDmg: number,
): number {
  const now = sim.timeMs;
  const t = target.c;
  let remaining = Math.max(0, Math.round(rawDmg));
  const shield = findStatusEffect(t, "shield");
  if (shield) {
    const absorb = Math.min(shield.magnitude, remaining);
    shield.magnitude -= absorb;
    remaining -= absorb;
    if (shield.magnitude <= 0) {
      t.statuses = t.statuses.filter((s) => s.id !== "shield");
    }
  }
  if (remaining > 0) {
    t.hp = Math.max(0, t.hp - remaining);
  }
  // Stats: total damage rolled (incl. shield-absorbed), credited to the
  // attacker's side — identical bookkeeping to the old engine.
  sim.battle.totalDamageDealt[actor.c.side] += Math.round(rawDmg);

  if (t.hp <= 0 && !t.isDefeated) {
    t.isDefeated = true;
    t.hp = 0;
    t.statuses = [];
    target.state = "dead";
    target.deathAt = now;
    target.pending = null;
    target.intent = null;
    target.targetId = null;
    target.vx = 0;
    target.vy = 0;
    target.speedNow = 0;
    sim.events.push({
      type: "death",
      at: now,
      targetId: t.crabId,
      x: target.x,
      y: target.y,
    });
  }
  return remaining;
}

function applyHealSim(target: SimUnit, amount: number): number {
  const t = target.c;
  if (t.isDefeated) return 0;
  const before = t.hp;
  t.hp = Math.min(t.maxHp, t.hp + Math.round(amount));
  return t.hp - before;
}

/**
 * One hit of `skill` from `actor` onto `target`: the old damage formula
 * (variance roll from the seeded stream, defence factor, defense_down,
 * combo multiplier, AoE falloff, position factors, element
 * effectiveness), resolved at the hit moment.
 */
function strikeDamage(
  sim: SimState,
  actor: SimUnit,
  skill: ArenaSkill,
  target: SimUnit,
  acc: ActionAccumulator,
  viaProjectileId?: number,
): void {
  const now = sim.timeMs;
  const a = actor.c;
  const t = target.c;
  if (t.isDefeated) return;

  t.comboCount += 1;
  target.lastHitTakenAt = now;
  const comboMult = t.comboCount >= 2 ? 1 + 0.2 * (t.comboCount - 1) : 1;
  if (comboMult > acc.bestCombo) acc.bestCombo = comboMult;

  const variance = 0.85 + drawBattleRandom(sim.battle) * 0.3;
  const defFactor = 1 - t.defense / (t.defense + 120);
  const aoeFactor = skill.targetType === "all_enemies" ? 0.85 : 1;
  const dDown = findStatusEffect(t, "defense_down");
  const statusMod = dDown ? 1 + dDown.magnitude : 1;
  const posFactor = positionDamageFactor(sim.battle, t, skill);
  const elemFactor = effectiveness(a.element, t.element);
  const rawDmg =
    effectiveAttackOf(a) *
    skill.power *
    variance *
    defFactor *
    statusMod *
    comboMult *
    aoeFactor *
    posFactor *
    elemFactor;

  dealDamageSim(sim, actor, target, rawDmg);
  acc.totalDamage += Math.round(rawDmg);
  const defeated = t.isDefeated && target.deathAt === now;
  if (defeated) acc.defeated.push(t.crabId);

  if (viaProjectileId !== undefined) {
    sim.events.push({
      type: "projectileHit",
      at: now,
      id: viaProjectileId,
      actorId: a.crabId,
      targetId: t.crabId,
      skillId: skill.id,
      damage: Math.round(rawDmg),
      comboMult,
      defeated,
    });
  } else {
    sim.events.push({
      type: "strike",
      at: now,
      actorId: a.crabId,
      skillId: skill.id,
      targetId: t.crabId,
      damage: Math.round(rawDmg),
      comboMult,
      defeated,
    });
  }

  // Hitstun: a landed hit staggers an uncommitted target briefly.
  if (!t.isDefeated && target.pending === null) {
    target.hitstunUntil = Math.max(target.hitstunUntil, now + HITSTUN_MS);
  }
}

/** Apply a skill's status effect to its recipients (fairness-aware). */
function applySkillEffect(
  sim: SimState,
  actor: SimUnit,
  skill: ArenaSkill,
  acc: ActionAccumulator,
): void {
  const eff = skill.effect;
  if (!eff) return;
  const enemySide = actor.c.side === "player" ? "enemy" : "player";
  let recipients: SimUnit[] = [];
  if (eff.applyTo === "all_allies") {
    recipients = sim.units.filter(
      (u) => u.c.side === actor.c.side && !u.c.isDefeated,
    );
  } else if (eff.applyTo === "all_enemies") {
    recipients = sim.units.filter(
      (u) => u.c.side === enemySide && !u.c.isDefeated,
    );
  }
  for (const r of recipients) {
    applyEffectTo(sim, actor, eff.status, eff.rounds, eff.magnitude, r, acc);
  }
}

function applyEffectTo(
  sim: SimState,
  actor: SimUnit,
  status: StatusEffectId,
  rounds: number,
  magnitude: number,
  target: SimUnit,
  acc: ActionAccumulator,
): void {
  if (target.c.isDefeated) return;
  if (status === "freeze") {
    // Freeze base duration is the fairness layer's 2000ms, NOT
    // rounds × 6000 (design §5.4).
    const result = applyHardCc(sim, actor, target);
    acc.statusApplied.push({
      status: result === "applied" ? "freeze" : "slow",
      targetId: target.c.crabId,
    });
  } else if (status === "shield") {
    const pool = Math.round(actor.c.maxHp * magnitude + actor.c.level * 8);
    applyShieldStatus(sim, actor, target, rounds * ROUND_MS, pool);
    acc.statusApplied.push({ status, targetId: target.c.crabId });
  } else if (status === "regen") {
    applyRegenStatus(sim, actor, target, rounds * ROUND_MS, magnitude);
    acc.statusApplied.push({ status, targetId: target.c.crabId });
  } else if (status === "weaken" || status === "defense_down") {
    applySoftStatus(sim, actor, target, status, rounds * ROUND_MS, magnitude);
    acc.statusApplied.push({ status, targetId: target.c.crabId });
  }
}

function comboLabel(comboMult: number): number {
  return Math.round((comboMult - 1) / 0.2) + 1;
}

/** Push the battle-log entry for a resolved action (old message format). */
function pushActionLog(
  sim: SimState,
  actor: SimUnit,
  skill: ArenaSkill,
  targetIds: string[],
  acc: ActionAccumulator,
): void {
  const battle = sim.battle;
  const a = actor.c;
  if (acc.bestCombo > battle.maxCombo) battle.maxCombo = acc.bestCombo;
  const names = targetIds
    .map((id) => sim.byId.get(id)?.c.name ?? id)
    .join(", ");
  let message = `${a.name} casts ${skill.name}`;
  if (acc.totalDamage > 0) message += ` on ${names} for ${acc.totalDamage} damage`;
  else if (acc.totalHeal > 0)
    message += ` on ${names}, restoring ${acc.totalHeal} HP`;
  else message += ` to channel a sigil`;
  if (acc.statusApplied.length > 0) {
    const statuses = Array.from(new Set(acc.statusApplied.map((s) => s.status))).join(", ");
    message += ` (${statuses})`;
  }
  if (acc.defeated.length > 0) {
    message += ` — ${acc.defeated.length} foe${acc.defeated.length > 1 ? "s" : ""} defeated!`;
  }
  if (acc.bestCombo >= 1.2) {
    message += ` [Combo x${comboLabel(acc.bestCombo)}!]`;
  }
  const targetSide: "player" | "enemy" =
    skill.targetType === "self" ||
    skill.targetType === "ally" ||
    skill.targetType === "all_allies"
      ? a.side
      : a.side === "player"
        ? "enemy"
        : "player";
  const action: ArenaAction = {
    turn: simRoundAt(sim.timeMs),
    actorId: a.crabId,
    actorSide: a.side,
    skillId: skill.id,
    skillName: skill.name,
    targetIds,
    targetSide,
    visual: skill.visual,
    message,
  };
  if (acc.totalDamage > 0) action.damage = acc.totalDamage;
  if (acc.totalHeal > 0) action.heal = acc.totalHeal;
  if (acc.statusApplied.length > 0) action.statusApplied = acc.statusApplied;
  if (acc.bestCombo >= 1.2) action.combo = acc.bestCombo;
  if (acc.defeated.length > 0) action.defeated = acc.defeated;
  battle.log.push(action);
  battle.turn = action.turn;
}

// ============================================================================
// ACTION LIFECYCLE
// ============================================================================

const WINDUP_MS = { strike: 260, cast: 460, aoeCast: 520 } as const;
const RECOVER_MS = { strike: 400, cast: 340, aoeCast: 380 } as const;

function skillReady(sim: SimState, unit: SimUnit, skill: ArenaSkill): boolean {
  if (unit.energyF < skill.energyCost) return false;
  if (skill.id === "claw_strike") return sim.timeMs >= unit.basicReadyAt;
  return sim.timeMs >= (unit.skillReadyAt[skill.id] ?? 0);
}

function startAction(sim: SimState, unit: SimUnit, intent: SimIntent): void {
  const now = sim.timeMs;
  const skill = intent.skill;
  const slow = slowFactorOf(unit);
  unit.energyF = Math.max(0, unit.energyF - skill.energyCost);
  unit.c.energy = Math.floor(unit.energyF);
  if (skill.id === "claw_strike") {
    const cycle = BASIC_CYCLE_MS[unit.c.classId] ?? 1800;
    unit.basicReadyAt = now + Math.round(cycle / slow);
  } else if (skill.cooldown > 0) {
    unit.skillReadyAt[skill.id] = now + skill.cooldown * ROUND_MS;
  }
  // Delivery follows the unit's range profile: contact-band classes
  // strike in melee, while ranged/caster classes (Warden bolts,
  // Tidecaller casts — design §5.2) deliver even a melee-profile
  // single-target skill as a projectile, so its damage lands on
  // arrival at band range instead of striking instantly from 30%+
  // away. (Without this, a Warden drip-spends its energy on 1-cost
  // basics and its cost-4/5 cast skills never become usable — it
  // would never fire a projectile at all.)
  const role = roleOf(unit.c.classId);
  const isMeleeHit =
    skill.targetType === "enemy" &&
    skillRange(skill) === "melee" &&
    role !== "ranged" &&
    role !== "caster";
  const isAoe = skill.targetType === "all_enemies";
  const windup = isMeleeHit
    ? WINDUP_MS.strike
    : isAoe
      ? WINDUP_MS.aoeCast
      : WINDUP_MS.cast;
  unit.pending = {
    skill,
    primaryTargetId: intent.targetIds[0] ?? null,
    resolveAt: now + Math.round(windup / slow),
    kind: isMeleeHit ? "strike" : "cast",
    startedAt: now,
  };
  unit.state = isMeleeHit ? "windup" : "cast";
  sim.events.push({
    type: "attackStart",
    at: now,
    actorId: unit.c.crabId,
    skillId: skill.id,
  });
}

function endAction(sim: SimState, unit: SimUnit, kind: "strike" | "cast", aoe: boolean): void {
  const slow = slowFactorOf(unit);
  const recover = kind === "strike"
    ? RECOVER_MS.strike
    : aoe
      ? RECOVER_MS.aoeCast
      : RECOVER_MS.cast;
  unit.recoverUntil = sim.timeMs + Math.round(recover / slow);
  unit.state = "recover";
  unit.pending = null;
}

function resolvePending(sim: SimState, unit: SimUnit): void {
  const pending = unit.pending;
  if (!pending) return;
  const skill = pending.skill;
  const actor = unit.c;
  const now = sim.timeMs;
  if (actor.isDefeated) {
    unit.pending = null;
    return;
  }
  const acc = newAccumulator();
  const enemySide = actor.side === "player" ? "enemy" : "player";

  if (pending.kind === "strike") {
    // Melee: the hit lands NOW, on the windup's target.
    const target = pending.primaryTargetId
      ? sim.byId.get(pending.primaryTargetId)
      : undefined;
    if (!target || target.c.isDefeated) {
      sim.events.push({ type: "whiff", at: now, actorId: actor.crabId, skillId: skill.id, targetId: pending.primaryTargetId });
    } else {
      strikeDamage(sim, unit, skill, target, acc);
      if (skill.effect && skill.effect.applyTo === "target") {
        applyEffectTo(sim, unit, skill.effect.status, skill.effect.rounds, skill.effect.magnitude, target, acc);
      }
      pushActionLog(sim, unit, skill, [target.c.crabId], acc);
    }
    endAction(sim, unit, "strike", false);
    return;
  }

  // Cast resolution.
  switch (skill.targetType) {
    case "enemy": {
      // Ranged single-target: the projectile flies; damage on arrival.
      const target = pending.primaryTargetId
        ? sim.byId.get(pending.primaryTargetId)
        : undefined;
      if (!target || target.c.isDefeated) {
        sim.events.push({ type: "whiff", at: now, actorId: actor.crabId, skillId: skill.id, targetId: pending.primaryTargetId });
        break;
      }
      const dist = distanceBetween(unit, target);
      const travelMs = Math.max(
        120,
        Math.round((dist / PROJECTILE_SPEED) * 1000),
      );
      const p: SimProjectile = {
        id: sim.nextProjectileId++,
        actorId: actor.crabId,
        targetId: target.c.crabId,
        skill,
        x: unit.x,
        y: unit.y,
        spawnAt: now,
        travelMs,
      };
      sim.projectiles.push(p);
      sim.events.push({
        type: "projectileSpawn",
        at: now,
        id: p.id,
        actorId: actor.crabId,
        targetId: target.c.crabId,
        skillId: skill.id,
        travelMs,
      });
      break;
    }
    case "all_enemies": {
      const targets = sim.units.filter(
        (u) => u.c.side === enemySide && !u.c.isDefeated,
      );
      if (targets.length === 0) {
        sim.events.push({ type: "whiff", at: now, actorId: actor.crabId, skillId: skill.id, targetId: null });
        break;
      }
      for (const t of targets) strikeDamage(sim, unit, skill, t, acc);
      applySkillEffect(sim, unit, skill, acc);
      sim.events.push({
        type: "cast",
        at: now,
        actorId: actor.crabId,
        skillId: skill.id,
        targetIds: targets.map((t) => t.c.crabId),
      });
      pushActionLog(sim, unit, skill, targets.map((t) => t.c.crabId), acc);
      break;
    }
    case "ally": {
      const target = pending.primaryTargetId
        ? sim.byId.get(pending.primaryTargetId)
        : undefined;
      if (!target || target.c.isDefeated) {
        sim.events.push({ type: "whiff", at: now, actorId: actor.crabId, skillId: skill.id, targetId: pending.primaryTargetId });
        break;
      }
      if (skill.effect?.status === "shield") {
        // Bulwark Tide Sigil: shield, no heal.
        applyEffectTo(sim, unit, "shield", skill.effect.rounds, skill.effect.magnitude, target, acc);
      } else {
        // Heal (Shellmender's Mending Pearl): heal + cleanse.
        const variance = 0.85 + drawBattleRandom(sim.battle) * 0.3;
        const healed = applyHealSim(target, effectiveAttackOf(actor) * skill.power * variance);
        acc.totalHeal += healed;
        if (healed > 0) {
          sim.events.push({
            type: "heal",
            at: now,
            actorId: actor.crabId,
            skillId: skill.id,
            targetId: target.c.crabId,
            amount: healed,
          });
        }
        if (actor.classId === "shellmender") {
          cleanseTarget(sim, unit, target);
        }
        if (skill.effect) {
          applySkillEffect(sim, unit, skill, acc);
        }
      }
      sim.events.push({
        type: "cast",
        at: now,
        actorId: actor.crabId,
        skillId: skill.id,
        targetIds: [target.c.crabId],
      });
      pushActionLog(sim, unit, skill, [target.c.crabId], acc);
      break;
    }
    case "all_allies": {
      const targets = sim.units.filter(
        (u) => u.c.side === actor.side && !u.c.isDefeated,
      );
      applySkillEffect(sim, unit, skill, acc);
      sim.events.push({
        type: "cast",
        at: now,
        actorId: actor.crabId,
        skillId: skill.id,
        targetIds: targets.map((t) => t.c.crabId),
      });
      pushActionLog(sim, unit, skill, targets.map((t) => t.c.crabId), acc);
      break;
    }
    case "self": {
      // Self-cast sigils: the effect fans out per its applyTo rule.
      applySkillEffect(sim, unit, skill, acc);
      sim.events.push({
        type: "cast",
        at: now,
        actorId: actor.crabId,
        skillId: skill.id,
        targetIds: [actor.crabId],
      });
      pushActionLog(sim, unit, skill, [actor.crabId], acc);
      break;
    }
  }
  endAction(sim, unit, "cast", skill.targetType === "all_enemies");
}

// ============================================================================
// STEERING
// ============================================================================

function moveSpeedOf(unit: SimUnit): number {
  const base = MOVE_SPEED[unit.c.classId] ?? 11;
  const statFactor = Math.min(1.25, Math.max(0.9, 0.9 + unit.c.speed * 0.004));
  return base * statFactor * slowFactorOf(unit);
}

/** The engagement band check for STARTING an action with `intent`. */
function inBandForAction(sim: SimState, unit: SimUnit, intent: SimIntent): boolean {
  const skill = intent.skill;
  const role = roleOf(unit.c.classId);
  if (skill.targetType === "self" || skill.targetType === "all_allies") {
    return true;
  }
  if (skill.targetType === "ally") {
    const t = intent.targetIds[0] ? sim.byId.get(intent.targetIds[0]) : undefined;
    if (!t || t.c.isDefeated) return false;
    return distanceBetween(unit, t) <= ALLY_CAST_RANGE;
  }
  // Enemy-facing: reference = primary target (nearest enemy for AoE).
  const ref = movementReference(sim, unit, intent);
  if (!ref) return false;
  const dist = distanceBetween(unit, ref);
  switch (role) {
    case "tank":
    case "melee":
    case "assassin":
      return dist <= MELEE_REACH;
    case "ranged":
      return dist <= RANGED_BAND.max;
    case "caster":
      return dist <= CASTER_BAND.max;
    case "support":
      return dist <= SUPPORT_CAST_RANGE;
  }
}

function movementReference(
  sim: SimState,
  unit: SimUnit,
  intent: SimIntent,
): SimUnit | null {
  const skill = intent.skill;
  if (skill.targetType === "all_enemies") {
    // Nearest living enemy steers AoE positioning.
    let best: SimUnit | null = null;
    let bestDist = Infinity;
    for (const u of sim.units) {
      if (u.c.side === unit.c.side || u.c.isDefeated) continue;
      const d = distanceBetween(unit, u);
      if (d < bestDist) {
        bestDist = d;
        best = u;
      }
    }
    return best;
  }
  const id = intent.targetIds[0];
  if (!id) return null;
  const t = sim.byId.get(id);
  return t && !t.c.isDefeated ? t : null;
}

/**
 * Compute this tick's movement for an uncommitted unit and integrate it.
 * Sets vx/vy/speedNow, position (with separation + field clamps) and
 * facing (velocity-driven, flip-locked so it never strobes).
 */
function moveUnit(sim: SimState, unit: SimUnit, dtMs: number): void {
  const now = sim.timeMs;
  let goal: { x: number; y: number } | null = null;
  let stopDist = 0;

  const intent = unit.intent;
  if (intent) {
    const skill = intent.skill;
    const role = roleOf(unit.c.classId);
    if (skill.targetType === "enemy" || skill.targetType === "all_enemies") {
      const ref = movementReference(sim, unit, intent);
      if (ref) {
        const dist = distanceBetween(unit, ref);
        if (role === "tank" || role === "melee" || role === "assassin") {
          if (dist > MELEE_STOP) {
            goal = { x: ref.x, y: ref.y };
            stopDist = MELEE_STOP;
          }
        } else if (role === "ranged" || role === "caster") {
          const band = role === "ranged" ? RANGED_BAND : CASTER_BAND;
          if (dist > band.max) {
            goal = { x: ref.x, y: ref.y };
            stopDist = band.max - 2;
          } else if (dist < band.min) {
            // Kite: back directly away from the threat.
            const dx = unit.x - ref.x;
            const dy = unit.y - ref.y;
            const len = Math.hypot(dx, dy) || 1;
            goal = {
              x: unit.x + (dx / len) * (band.min + 2 - dist),
              y: unit.y + (dy / len) * (band.min + 2 - dist),
            };
            stopDist = 0;
          }
        } else {
          // Support: close to cast range but stay on its own half —
          // the goal is clamped at the centre line.
          if (dist > SUPPORT_CAST_RANGE - 2) {
            goal = {
              x:
                unit.c.side === "player"
                  ? Math.min(ref.x, 53)
                  : Math.max(ref.x, 47),
              y: ref.y,
            };
            stopDist = SUPPORT_CAST_RANGE - 2;
            // If even the midfield-clamped goal can't reach cast range,
            // the support holds position instead of pressing the line.
            const clampedDist = Math.hypot(goal.x - ref.x, goal.y - ref.y);
            if (clampedDist > SUPPORT_CAST_RANGE) goal = null;
          }
        }
      }
    } else if (skill.targetType === "ally") {
      const t = intent.targetIds[0] ? sim.byId.get(intent.targetIds[0]) : undefined;
      if (t && !t.c.isDefeated && distanceBetween(unit, t) > ALLY_CAST_RANGE - 2) {
        goal = { x: t.x, y: t.y };
        stopDist = ALLY_CAST_RANGE - 2;
      }
    }
  }

  // Support tether: with no actionable goal, a Shellmender drifts to
  // the lowest-HP ally's shoulder (toward its own side).
  if (!goal && unit.c.classId === "shellmender") {
    let lowest: SimUnit | null = null;
    for (const u of sim.units) {
      if (u.c.side !== unit.c.side || u.c.isDefeated || u === unit) continue;
      if (!lowest || u.c.hp / u.c.maxHp < lowest.c.hp / lowest.c.maxHp) lowest = u;
    }
    if (lowest) {
      const shoulder = {
        x: lowest.x + (unit.c.side === "player" ? -8 : 8),
        y: lowest.y,
      };
      if (distanceBetween(unit, shoulder) > 4) {
        goal = shoulder;
        stopDist = 2;
      }
    }
  }

  if (!goal) {
    unit.vx = 0;
    unit.vy = 0;
    unit.speedNow = 0;
    if (unit.state === "seek") unit.state = "idle";
    return;
  }

  const dx = goal.x - unit.x;
  const dy = goal.y - unit.y;
  const dist = Math.hypot(dx, dy);
  const remaining = Math.max(0, dist - stopDist);
  const speed = moveSpeedOf(unit);
  // Arrive damp: slow down inside the last few % so feet don't skate
  // through the stop point.
  const effSpeed = Math.min(speed, Math.max(remaining * 2.2, remaining > 0 ? 1.2 : 0));
  if (remaining <= 0.05 || effSpeed <= 0) {
    unit.vx = 0;
    unit.vy = 0;
    unit.speedNow = 0;
    if (unit.state === "seek") unit.state = "idle";
    return;
  }
  const vx = (dx / dist) * effSpeed;
  const vy = (dy / dist) * effSpeed;
  unit.vx = vx;
  unit.vy = vy;
  unit.speedNow = Math.hypot(vx, vy);
  unit.state = "seek";

  let nx = unit.x + (vx * dtMs) / 1000;
  let ny = unit.y + (vy * dtMs) / 1000;

  // Separation: never stack — push out of every neighbour's radius.
  for (const other of sim.units) {
    if (other === unit || other.c.isDefeated) continue;
    const ddx = nx - other.x;
    const ddy = ny - other.y;
    const d = Math.hypot(ddx, ddy);
    if (d < SEPARATION) {
      if (d < 1e-6) {
        nx = other.x + SEPARATION;
      } else {
        nx = other.x + (ddx / d) * SEPARATION;
        ny = other.y + (ddy / d) * SEPARATION;
        // Tangential slide: a purely radial push deadlocks head-on —
        // a unit whose goal lies directly behind a blocker is snapped
        // back to the identical point every tick and never gets past
        // (an assassin could never reach the backline, design §5.2).
        // Slide along the blocker's circle toward the goal instead.
        // The side comes from the goal direction, with a stable
        // slot-parity tiebreak for perfectly collinear approaches —
        // no RNG, so determinism is preserved.
        const tx = -ddy / d;
        const ty = ddx / d;
        const toward = tx * (goal.x - nx) + ty * (goal.y - ny);
        const dir =
          toward !== 0 ? Math.sign(toward) : unit.c.slot % 2 === 0 ? 1 : -1;
        const slide = Math.min((speed * dtMs) / 1000, SEPARATION * 0.6);
        nx += tx * dir * slide;
        ny += ty * dir * slide;
      }
    }
  }

  unit.x = Math.min(FIELD.maxX, Math.max(FIELD.minX, nx));
  unit.y = Math.min(FIELD.maxY, Math.max(FIELD.minY, ny));

  // Facing follows horizontal velocity, with a flip lock (no strobing).
  if (Math.abs(vx) > 1 && now >= unit.facingLockUntil) {
    const want: 1 | -1 = vx > 0 ? 1 : -1;
    if (want !== unit.facing) {
      unit.facing = want;
      unit.facingLockUntil = now + 150;
    }
  }
}

/**
 * Standing personal-space constraint, applied once per tick after every
 * unit has moved. moveUnit's separation only resolves the MOVER against
 * where its neighbours were at move time, so several attackers parking
 * at contact range around the same target converge into a stack over a
 * few ticks — nobody owns the pairwise distance once everyone arrives.
 * This pass owns it: every living pair is kept at least SEPARATION
 * apart, the correction split evenly between both units.
 *
 * Deterministic by construction: pairs are visited in fixed slot order
 * (sim.units order), corrections are purely positional (no RNG, no
 * velocity/state changes — a corrected unit does not gain or lose
 * speedNow, so poses never fake locomotion), and a few relaxation
 * passes let a cluster settle into a ring instead of a pile. Contact
 * geometry is compatible: melee stop distance (9.5) already exceeds
 * SEPARATION (6.5), so a ring around a target satisfies both.
 */
function resolveSeparation(sim: SimState): void {
  for (let pass = 0; pass < 3; pass++) {
    let corrected = false;
    for (let i = 0; i < sim.units.length; i++) {
      const a = sim.units[i];
      if (a.c.isDefeated) continue;
      for (let j = i + 1; j < sim.units.length; j++) {
        const b = sim.units[j];
        if (b.c.isDefeated) continue;
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let d = Math.hypot(dx, dy);
        if (d >= SEPARATION) continue;
        const push = (SEPARATION - d) / 2;
        if (d < 1e-6) {
          // Exactly stacked: separate along the pair's spawn axis
          // (deterministic), falling back to the field's x axis.
          dx = b.spawnX - a.spawnX;
          dy = b.spawnY - a.spawnY;
          d = Math.hypot(dx, dy);
          if (d < 1e-6) {
            dx = 1;
            dy = 0;
            d = 1;
          }
        }
        const ux = dx / d;
        const uy = dy / d;
        a.x = Math.min(FIELD.maxX, Math.max(FIELD.minX, a.x - ux * push));
        a.y = Math.min(FIELD.maxY, Math.max(FIELD.minY, a.y - uy * push));
        b.x = Math.min(FIELD.maxX, Math.max(FIELD.minX, b.x + ux * push));
        b.y = Math.min(FIELD.maxY, Math.max(FIELD.minY, b.y + uy * push));
        corrected = true;
      }
    }
    if (!corrected) break;
  }
}

// ============================================================================
// PER-TICK PROCESSING
// ============================================================================

function tickStatuses(sim: SimState, unit: SimUnit): void {
  const now = sim.timeMs;
  const c = unit.c;
  if (c.statuses.length === 0) return;
  const kept: StatusEffect[] = [];
  for (const s of c.statuses) {
    const next = { ...s, durationMs: s.durationMs - TICK_MS };
    if (next.durationMs <= 0) {
      if (s.id === "freeze" || s.id === "slow") {
        sim.events.push({
          type: "statusExpired",
          at: now,
          targetId: c.crabId,
          status: s.id,
        });
      }
      if (s.id === "freeze") {
        // Thawing naturally leaves the crab dizzy: it will fumble
        // its next 1–2 offensive action starts (common-sense logic —
        // a cleanse, by contrast, clears the head with no daze).
        // The count roll draws from the battle's seeded stream here,
        // in fixed per-tick unit order, so Skip ≡ watched holds.
        unit.dazedActions = 1 + (drawBattleRandom(sim.battle) < 0.5 ? 1 : 0);
        sim.events.push({
          type: "dazed",
          at: now,
          targetId: c.crabId,
          actions: unit.dazedActions,
        });
      }
      continue;
    }
    kept.push(next);
  }
  c.statuses = kept;
}

function tickRegen(sim: SimState, unit: SimUnit): void {
  const now = sim.timeMs;
  const regen = findStatusEffect(unit.c, "regen");
  if (!regen || regen.durationMs <= 0) return;
  // magnitude = % of max HP per ROUND_MS, accrued fractionally per tick
  // and applied in whole-HP chunks.
  unit.regenAcc +=
    ((unit.c.maxHp * regen.magnitude) / 100) * (TICK_MS / ROUND_MS);
  const healed = Math.floor(unit.regenAcc);
  if (healed <= 0) return;
  unit.regenAcc -= healed;
  const actual = applyHealSim(unit, healed);
  if (actual <= 0) return;
  sim.events.push({ type: "regen", at: now, targetId: unit.c.crabId, amount: actual });
  unit.regenLogAcc += actual;
  if (now - unit.regenLogAt >= ROUND_MS) {
    unit.regenLogAt = now;
    const amount = unit.regenLogAcc;
    unit.regenLogAcc = 0;
    if (amount > 0) {
      sim.battle.log.push({
        turn: simRoundAt(now),
        actorId: unit.c.crabId,
        actorSide: unit.c.side,
        skillId: "regen_tick",
        skillName: "Regen",
        targetIds: [unit.c.crabId],
        targetSide: unit.c.side,
        heal: amount,
        visual: "heal_pearl",
        message: `${unit.c.name} regenerates ${amount} HP from a tide-pearl aura.`,
      });
    }
  }
}

function tickUnit(sim: SimState, unit: SimUnit): void {
  const now = sim.timeMs;
  const c = unit.c;
  if (c.isDefeated) {
    unit.state = "dead";
    return;
  }

  tickStatuses(sim, unit);
  tickRegen(sim, unit);

  // Continuous energy regen: +2 per round.
  unit.energyF = Math.min(c.maxEnergy, unit.energyF + ENERGY_PER_MS * TICK_MS);
  c.energy = Math.floor(unit.energyF);

  // Combo decay.
  if (c.comboCount > 0 && now - unit.lastHitTakenAt > COMBO_DECAY_MS) {
    c.comboCount = 0;
  }

  // Resolve a pending action whose hit moment has arrived.
  if (unit.pending && now >= unit.pending.resolveAt) {
    resolvePending(sim, unit);
    if (sim.finished) return;
  }

  const frozen = isFrozen(unit);
  const committed = unit.pending !== null;
  const recovering = now < unit.recoverUntil;
  const stunned = now < unit.hitstunUntil;

  if (!committed) {
    if (frozen) unit.state = "idle";
    else if (recovering) unit.state = "recover";
    else if (stunned) unit.state = "hitstun";
    else if (
      unit.state === "windup" ||
      unit.state === "cast" ||
      unit.state === "recover"
    ) {
      unit.state = "idle";
    }
  }

  // Decisions + action starts (never while frozen/committed/stunned).
  if (!frozen && !committed && !stunned) {
    if (now >= unit.nextDecisionAt) {
      unit.nextDecisionAt = now + DECISION_INTERVAL_MS;
      const decision = decideSimAction(sim, unit);
      unit.intent = decision
        ? {
            skill: decision.skill,
            targetIds: decision.targets.map((t) => t.crabId),
            reason: decision.reason,
          }
        : null;
      unit.targetId = decision?.targets[0]?.crabId ?? null;
    }
    if (unit.intent && !recovering) {
      // Validate the intent's primary target is still alive.
      const primary = unit.intent.targetIds[0]
        ? sim.byId.get(unit.intent.targetIds[0])
        : undefined;
      const targetGone =
        unit.intent.skill.targetType !== "self" &&
        unit.intent.skill.targetType !== "all_allies" &&
        unit.intent.skill.targetType !== "all_enemies" &&
        (!primary || primary.c.isDefeated);
      if (!targetGone && skillReady(sim, unit, unit.intent.skill) && inBandForAction(sim, unit, unit.intent)) {
        // DAZE (common-sense logic): a crab still dizzy from a
        // naturally-expired freeze fumbles OFFENSIVE action starts —
        // it hesitates, loses the action, but spends no energy and
        // triggers no cooldown (nothing was actually attempted).
        // Support / heal / self actions are never fumbled: the rule
        // is about attacking ("takkan menyerang").
        const skill = unit.intent.skill;
        if (
          unit.dazedActions > 0 &&
          (skill.targetType === "enemy" || skill.targetType === "all_enemies")
        ) {
          unit.dazedActions -= 1;
          sim.events.push({
            type: "actionFumbled",
            at: now,
            actorId: c.crabId,
            skillId: skill.id,
            reason: "dazed",
            remaining: unit.dazedActions,
          });
          unit.intent = null;
          unit.targetId = null;
          unit.recoverUntil = now + DAZED_HESITATION_MS;
          unit.state = "hitstun"; // stagger look for this tick
          return; // no movement on a fumbled start either
        }
        startAction(sim, unit, unit.intent);
        return; // no movement on the tick an action starts
      }
    }
  }

  // Movement: only for uncommitted, unstunned, unfrozen units.
  if (!frozen && !committed && !stunned && !recovering) {
    moveUnit(sim, unit, TICK_MS);
  } else {
    unit.vx = 0;
    unit.vy = 0;
    unit.speedNow = 0;
    if (unit.state === "seek") unit.state = "idle";
  }
}

function tickProjectile(sim: SimState, p: SimProjectile): void {
  const now = sim.timeMs;
  const target = sim.byId.get(p.targetId);
  const actor = sim.byId.get(p.actorId);
  if (!target || target.c.isDefeated || !actor) {
    sim.events.push({ type: "projectileFizzle", at: now, id: p.id, targetId: p.targetId });
    sim.projectiles = sim.projectiles.filter((q) => q.id !== p.id);
    return;
  }
  const dx = target.x - p.x;
  const dy = target.y - p.y;
  const dist = Math.hypot(dx, dy);
  const step = (PROJECTILE_SPEED * TICK_MS) / 1000;
  if (dist <= Math.max(3, step)) {
    // Arrival: the damage lands NOW, with the visual.
    const acc = newAccumulator();
    strikeDamage(sim, actor, p.skill, target, acc, p.id);
    if (p.skill.effect && p.skill.effect.applyTo === "target") {
      applyEffectTo(sim, actor, p.skill.effect.status, p.skill.effect.rounds, p.skill.effect.magnitude, target, acc);
    }
    pushActionLog(sim, actor, p.skill, [target.c.crabId], acc);
    sim.projectiles = sim.projectiles.filter((q) => q.id !== p.id);
    return;
  }
  p.x += (dx / dist) * step;
  p.y += (dy / dist) * step;
}

function checkBattleEnd(sim: SimState): void {
  if (sim.finished) return;
  const battle = sim.battle;
  const playerAlive = battle.player.some((c) => !c.isDefeated);
  const enemyAlive = battle.enemy.some((c) => !c.isDefeated);
  let winner: "player" | "enemy" | null = null;
  if (!playerAlive && !enemyAlive) winner = "enemy"; // mutual wipe → defender
  else if (!playerAlive) winner = "enemy";
  else if (!enemyAlive) winner = "player";
  else if (sim.timeMs >= BATTLE_TIMEOUT_MS) {
    const hpOf = (list: Combatant[]) =>
      list.reduce((sum, c) => sum + (c.isDefeated ? 0 : c.hp), 0);
    winner = hpOf(battle.player) > hpOf(battle.enemy) ? "player" : "enemy";
  }
  if (winner !== null) {
    battle.winner = winner;
    sim.finished = true;
    sim.events.push({ type: "victory", at: sim.timeMs, winner });
  }
}

function tick(sim: SimState): void {
  sim.timeMs += TICK_MS;
  sim.battle.turn = simRoundAt(sim.timeMs);
  for (const unit of sim.units) {
    if (sim.finished) break;
    tickUnit(sim, unit);
    checkBattleEnd(sim);
  }
  // Standing separation: after all movement for this tick, restore the
  // pairwise personal-space minimum (a scrum rings its target instead
  // of stacking onto it). Positional only — no events, no RNG.
  resolveSeparation(sim);
  if (!sim.finished) {
    // Projectiles resolve in spawn order.
    for (const p of [...sim.projectiles]) {
      if (sim.finished) break;
      tickProjectile(sim, p);
      checkBattleEnd(sim);
    }
  }
  checkBattleEnd(sim);
}

/**
 * Advance the simulation by `dtMs` of BATTLE time, consuming whole
 * 50ms ticks (the remainder carries over). Feeding 0 (paused clock)
 * advances nothing.
 */
export function stepSim(sim: SimState, dtMs: number): void {
  if (sim.finished || dtMs <= 0) return;
  sim.remainderMs += dtMs;
  let guard = 0;
  while (sim.remainderMs >= TICK_MS && !sim.finished && guard < 400) {
    sim.remainderMs -= TICK_MS;
    tick(sim);
    guard += 1;
  }
}

/**
 * Run the same sim headlessly to completion — this IS the Skip path:
 * identical decisions, identical RNG stream, identical outcome as the
 * watched battle from the same state.
 */
export function runSimToCompletion(sim: SimState): SimState {
  let guard = 0;
  while (!sim.finished && guard < 10000) {
    stepSim(sim, 500);
    guard += 1;
  }
  return sim;
}
