// Crabtopia - Deterministic opponent roster generator for the Arena.
// Uses mulberry32(seed) for full determinism — same seed always produces the same opponents.

import { Crab, ClassId, FactionId } from "../types";
import { generateCrab } from "../engine/crabs";
import { mulberry32, randInt } from "../engine/rng";
import { makeOpponentName } from "./leaderboardNames";

export interface Opponent {
  id: string;
  name: string; // e.g. "Tideborn Reaver Vexis"
  rank: number; // 1..9999
  wins: number;
  losses: number;
  winRate: number; // 0..1
  entryCost: number; // gold
  rewardPreview: { gold: number; xp: number };
  crabs: Crab[]; // 5 crabs, levels scaled to rank
  fleetStrength: number; // sum of maxHp + attack + defense
}

// ============================================================================
// INTERNAL HELPERS
// ============================================================================

const FACTION_LIST: FactionId[] = [
  "coral_court",
  "cinderreef",
  "frostshelf",
  "mangrove",
  "stormwake",
  "moonpool",
];

const CLASS_LIST: ClassId[] = [
  "bulwark",
  "reaver",
  "skitter",
  "tidecaller",
  "shellmender",
  "pincher",
  "warden",
  "gildclaw",
];

const ALL_CLASS_IDS: ClassId[] = CLASS_LIST;

// 5v5 role-bucketed team composition. Each opponent team has five slots:
//   slot 0 → Tank        (bulwark)
//   slot 1 → Healer      (shellmender)
//   slot 2 → Mage/Controller (tidecaller or warden)
//   slot 3 → DPS         (reaver, pincher, skitter, gildclaw)
//   slot 4 → Flex        (any of the above except tank/healer for variety)
// This guarantees a balanced, tactical 5v5 roster (front tank, back healer,
// AoE mage, single-target DPS, and a flex pick) while remaining fully
// deterministic by seed.
const ROLE_BUCKETS: ClassId[][] = [
  ["bulwark"],
  ["shellmender"],
  ["tidecaller", "warden"],
  ["reaver", "pincher", "skitter", "gildclaw"],
  ["reaver", "pincher", "skitter", "gildclaw", "warden", "tidecaller"],
];

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function fleetStrengthOf(crabs: Crab[]): number {
  return crabs.reduce(
    (sum, c) => sum + c.stats.hp + c.stats.attack + c.stats.defense,
    0
  );
}

// Generate 5 crabs for an opponent team, given a base seed & target level.
// Each slot draws from a role bucket so the team has balanced composition
// (1 tank, 1 healer, 1 mage/controller, 1 DPS, 1 flex) — see ROLE_BUCKETS.
function generateOpponentTeam(
  baseSeed: number,
  level: number,
  rng: () => number
): Crab[] {
  const crabs: Crab[] = [];
  for (let i = 0; i < 5; i++) {
    // Each crab gets a unique derived seed, biased toward faction/class variety.
    const crabSeed = (baseSeed ^ ((i + 1) * 0x9e3779b9)) >>> 0;
    // Choose faction from the shared rng so the roster feels cohesive yet varied.
    const faction = FACTION_LIST[Math.floor(rng() * FACTION_LIST.length)];
    // Pick class from this slot's role bucket — preserves team-role balance
    // while still varying the exact class per seed.
    const bucket = ROLE_BUCKETS[i];
    const classId = bucket[Math.floor(rng() * bucket.length)];
    crabs.push(
      generateCrab({
        faction,
        classId,
        level,
        seed: crabSeed,
        ownerId: "opponent",
        isRookie: false,
      })
    );
  }
  return crabs;
}

// Compute wins/losses/winRate from a seed and rank. Higher rank → better record.
function recordFromRank(rank: number, rng: () => number): {
  wins: number;
  losses: number;
  winRate: number;
} {
  // Stronger opponents (lower rank number) win more.
  const tier = clamp(1 - (rank - 1) / 99, 0, 1); // 1 at rank 1, 0 at rank 100
  const wins = Math.round(20 + tier * 180 + rng() * 30);
  const losses = Math.round(5 + (1 - tier) * 35 + rng() * 15);
  const winRate = wins / Math.max(1, wins + losses);
  return { wins, losses, winRate };
}

// Entry cost: 50 + rank*2, capped at 500.
function entryCostFromRank(rank: number): number {
  return Math.min(500, 50 + rank * 2);
}

// Reward preview based on entry cost and average crab level.
function rewardPreviewOf(
  entryCost: number,
  avgCrabLevel: number,
  rng: () => number
): { gold: number; xp: number } {
  const gold = Math.round(entryCost * (1.5 + rng() * 0.5));
  const xp = Math.round(avgCrabLevel * 15);
  return { gold, xp };
}

// Convert a rank (1..100) into a leaderboard level (rank 1 = level 50, rank 100 = level 5).
function levelFromLeaderboardRank(rank: number): number {
  const lvl = Math.round(50 - ((rank - 1) * (50 - 5)) / 99);
  return clamp(lvl, 5, 50);
}

// Convert player's strongest crab level into an opponent crab level (per shared spec).
function levelFromPlayer(playerMaxLevel: number, rng: () => number): number {
  return clamp(Math.round(playerMaxLevel * (0.85 + rng() * 0.4)), 1, 50);
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Generate a single opponent by rank.
 * Rank 1 = strongest (level 50). Rank 100 = weakest (level 5).
 * Used by the leaderboard and standalone generation.
 */
export function generateOpponent(rank: number, seed: number): Opponent {
  const rng = mulberry32(seed ^ (rank * 0x100000) >>> 0);
  const level = levelFromLeaderboardRank(rank);
  const name = makeOpponentName(rng);
  const crabs = generateOpponentTeam(seed, level, rng);
  const avgLevel = crabs.reduce((s, c) => s + c.level, 0) / crabs.length;
  const entryCost = entryCostFromRank(rank);
  const record = recordFromRank(rank, rng);
  const rewardPreview = rewardPreviewOf(entryCost, avgLevel, rng);
  const fleetStrength = fleetStrengthOf(crabs);

  return {
    id: `opp_${rank.toString(36)}_${(seed >>> 0).toString(36)}`,
    name,
    rank,
    wins: record.wins,
    losses: record.losses,
    winRate: record.winRate,
    entryCost,
    rewardPreview,
    crabs,
    fleetStrength,
  };
}

/**
 * Generate 5 opponents for the player to face, scaled to the player's strongest crab level.
 * Each opponent gets a small rank (1..100) for entry-cost variety, but crab levels
 * follow the shared spec: clamp(round(playerMaxLevel * (0.85 + rng()*0.4)), 1, 50).
 */
/**
 * Newcomer handicap: at low player levels the generated opponents roll
 * well-rounded teams (tank + warden + healer + DPS) that systematically
 * outstat the fixed starter roster (two glass cannons + healer + mage),
 * giving fresh players a ~16% arena win rate. Scaling enemy HP/ATK down
 * early restores a fair ~55-60% opener and fades to full strength by
 * player level 8 — measured over 200 seeded engine simulations:
 *   1.00x → 16.5% wins · 0.90x → 50% · 0.88x ≈ 57% (target).
 */
export function newcomerHandicap(playerMaxLevel: number): number {
  const t = Math.min(1, Math.max(0, (playerMaxLevel - 1) / 7));
  return 0.88 + 0.12 * t;
}

export function generateOpponents(
  playerMaxLevel: number,
  seed: number,
  count = 5
): Opponent[] {
  const rng = mulberry32(seed ^ 0xABCDEF);
  const opponents: Opponent[] = [];
  const handicap = newcomerHandicap(playerMaxLevel);

  for (let i = 0; i < count; i++) {
    // Derive a unique sub-seed per opponent.
    const subSeed = (seed ^ ((i + 1) * 0x27d4eb2d)) >>> 0;
    const subRng = mulberry32(subSeed);

    const rank = randInt(1, 100, subRng); // small range → entry-cost variety
    const level = levelFromPlayer(playerMaxLevel, subRng);
    const name = makeOpponentName(subRng);
    const crabs = generateOpponentTeam(subSeed, level, subRng).map((c) => ({
      ...c,
      stats: {
        ...c.stats,
        hp: Math.max(20, Math.round(c.stats.hp * handicap)),
        attack: Math.max(5, Math.round(c.stats.attack * handicap)),
      },
    }));
    const avgLevel = crabs.reduce((s, c) => s + c.level, 0) / crabs.length;
    const entryCost = entryCostFromRank(rank);
    const record = recordFromRank(rank, subRng);
    const rewardPreview = rewardPreviewOf(entryCost, avgLevel, subRng);
    const fleetStrength = fleetStrengthOf(crabs);

    opponents.push({
      id: `opp_${i.toString(36)}_${subSeed.toString(36)}`,
      name,
      rank,
      wins: record.wins,
      losses: record.losses,
      winRate: record.winRate,
      entryCost,
      rewardPreview,
      crabs,
      fleetStrength,
    });
  }

  // Sort by rank (strongest first) for nicer display.
  opponents.sort((a, b) => a.rank - b.rank);

  // Use the shared rng once so the chain advances (helps keep future calls deterministic
  // if this function is ever extended to draw from `rng` directly).
  void rng();

  return opponents;
}

/**
 * Reroll opponents with a new seed. Functionally identical to generateOpponents
 * — exposed as a separate export because the UI calls it with a fresh time-based seed
 * when the player taps "Refresh".
 */
export function rerollOpponents(
  playerMaxLevel: number,
  seed: number,
  count = 5
): Opponent[] {
  return generateOpponents(playerMaxLevel, seed, count);
}

/**
 * Generate the global leaderboard (top 100) — deterministic by day seed.
 * Rank 1 is the strongest NPC (level 50). The player's own row is inserted by the
 * UI layer at their actual tidelord rank; this function only returns the 100 NPCs.
 * Each NPC entry now fields a full 5-crab team (5v5).
 */
export function generateLeaderboard(daySeed: number): Opponent[] {
  const list: Opponent[] = [];
  for (let rank = 1; rank <= 100; rank++) {
    // Each leaderboard row gets a stable per-rank seed mixed with the day seed.
    const rowSeed = (daySeed ^ (rank * 0x1009) ^ 0xC0FFEE) >>> 0;
    list.push(generateOpponent(rank, rowSeed));
  }
  return list;
}
