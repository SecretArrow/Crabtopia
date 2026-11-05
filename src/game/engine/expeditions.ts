// Crabtopia - Team expedition math (pure, unit-testable).
//
// Mining and Exploration are team activities: the whole saved team of five
// goes together, and outcomes are computed from the team's real attributes
// (the same live crab objects every other system reads). A stronger team
// never does worse than a weaker one on the same seed.
import type { Crab } from "../types";
import { teamStatsSummary } from "./teams";
import { mulberry32 } from "./rng";

export interface ExpeditionStats {
  memberCount: number;
  /** Overall team power (teamBP for a full team). */
  power: number;
  totalAttack: number;
  totalDefense: number;
  avgDefense: number;
  totalSpeed: number;
  hpPool: number;
  avgLevel: number;
}

export function expeditionStats(crabs: readonly Crab[]): ExpeditionStats {
  const s = teamStatsSummary(crabs);
  return {
    memberCount: s.count,
    power: s.power,
    totalAttack: s.totalAttack,
    totalDefense: s.totalDefense,
    avgDefense: s.count ? Math.round(s.totalDefense / s.count) : 0,
    totalSpeed: s.totalSpeed,
    hpPool: s.totalHp,
    avgLevel: s.avgLevel,
  };
}

// ============================================================================
// MINING
// ============================================================================

/**
 * Yield bonus fraction from team power: 0% for a brand-new team, growing
 * with power, capped at +60%. Digging is driven by the whole team's
 * combined strength, so leveling members visibly improves every haul.
 */
export function miningYieldBonus(crabs: readonly Crab[]): number {
  const { power } = expeditionStats(crabs);
  // A fresh starter team (power ≈ 2.2k) earns ~+12%; the +60% cap is
  // reached around power 5.1k (a levelled, well-bred team).
  const bonus = (power - 1500) / 6000;
  return Math.min(0.6, Math.max(0, Math.round(bonus * 100) / 100));
}

/**
 * Scale a rolled drop table by the team's yield bonus. Deterministic for a
 * given (drops, bonus): every material grows by round(amount × bonus),
 * never shrinks — a stronger team never mines less on the same roll.
 */
export function applyMiningBonus<T extends string>(
  drops: Partial<Record<T, number>>,
  bonus: number
): Partial<Record<T, number>> {
  const out: Partial<Record<T, number>> = {};
  for (const k of Object.keys(drops) as T[]) {
    const amount = drops[k] ?? 0;
    out[k] = amount + Math.round(amount * Math.max(0, bonus));
  }
  return out;
}

// ============================================================================
// EXPLORATION ENCOUNTERS
// ============================================================================

export interface EncounterResult {
  winner: "team" | "enemy";
  /** Team HP pool remaining (of hpPool × TEAM_HP_FACTOR). */
  teamHpLeft: number;
  teamMaxHp: number;
  enemyHpLeft: number;
  enemyMaxHp: number;
  /** Damage the team dealt in its decisive strike. */
  teamDamage: number;
  /** Damage the enemy dealt in its decisive strike. */
  enemyDamage: number;
}

// The team fights as one expedition unit: it strikes with a share of its
// combined attack and soaks damage across a share of its combined HP, so a
// full strong team outperforms any single crab without being invincible.
export const TEAM_ATTACK_FACTOR = 0.35;
export const TEAM_HP_FACTOR = 0.6;

function damageDealt(atk: number, def: number, rng: () => number): number {
  return Math.max(
    1,
    Math.round(atk * (0.85 + rng() * 0.3) * (1 - def / (def + 120)))
  );
}

/**
 * Resolve one exploration encounter: team vs a single wild enemy, as a
 * simultaneous decisive trade (mirrors the exploration screen's original
 * one-exchange resolution, scaled from one champion to the whole team).
 * Deterministic for a given seed.
 */
export function resolveEncounter(
  crabs: readonly Crab[],
  enemy: Crab,
  seed: number
): EncounterResult {
  const stats = expeditionStats(crabs);
  const rng = mulberry32(seed);
  const teamMaxHp = Math.max(1, Math.round(stats.hpPool * TEAM_HP_FACTOR));
  const enemyMaxHp = enemy.stats.hp;

  const teamDamage = damageDealt(
    stats.totalAttack * TEAM_ATTACK_FACTOR,
    enemy.stats.defense,
    rng
  );
  const enemyDamage = damageDealt(
    enemy.stats.attack,
    stats.avgDefense,
    rng
  );

  const teamHpLeft = teamMaxHp - enemyDamage;
  const enemyHpLeft = enemyMaxHp - teamDamage;

  const teamAlive = teamHpLeft > 0;
  const enemyAlive = enemyHpLeft > 0;
  let winner: "team" | "enemy";
  if (teamAlive && !enemyAlive) winner = "team";
  else if (!teamAlive && enemyAlive) winner = "enemy";
  else if (teamAlive && enemyAlive) {
    // Both standing — the side with more HP fraction left wins the field.
    winner =
      teamHpLeft / teamMaxHp >= enemyHpLeft / enemyMaxHp ? "team" : "enemy";
  } else {
    winner = "team"; // mutual fall — expedition holds the field (home advantage)
  }

  return {
    winner,
    teamHpLeft: Math.max(0, teamHpLeft),
    teamMaxHp,
    enemyHpLeft: Math.max(0, enemyHpLeft),
    enemyMaxHp,
    teamDamage,
    enemyDamage,
  };
}

/**
 * Recommended enemy level for an expedition encounter: around the team's
 * average level so encounters scale with the team you actually send.
 */
export function encounterLevel(crabs: readonly Crab[]): number {
  const { avgLevel } = expeditionStats(crabs);
  return Math.max(1, Math.round(avgLevel));
}
