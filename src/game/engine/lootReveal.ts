// Crabtopia - Loot presentation math (pure, unit-testable).
//
// The mining scene and the LootReveal component are PRESENTATION ONLY:
// rewards are always resolved by the existing store paths (gainMaterials
// for a dig, claimDive for a dive, launchRaid for a raid). This module
// holds the shared math that presentation needs so it can be tested
// without rendering:
//
//   * rarity tiers for loot, derived from a material's reference market
//     value (data/materials.ts `baseValue`) — ONE tier table reused by
//     the mining finale, dive reveals and raid spoils alike;
//   * the reveal timeline: when each predetermined loot item pops out
//     during a watched play-out, bounded so a scene never drags;
//   * splitting a gold total into coin "pops" that sum back EXACTLY
//     (the scene animates chunks; the claim still grants the total
//     through the untouched store path).

// ---------- Rarity tiers (by reference value in GOLD) ----------

export type LootTierId = "common" | "rare" | "epic" | "legendary";

export interface LootTier {
  id: LootTierId;
  label: string;
  /** Border / glow / text accent for the tier. */
  color: string;
  /** Smallest reference value (inclusive) that earns this tier. */
  minValue: number;
}

/** Highest first — the first tier whose minValue is met wins. */
export const LOOT_TIERS: readonly LootTier[] = [
  { id: "legendary", label: "Legendary", color: "#FFB020", minValue: 800 },
  { id: "epic", label: "Epic", color: "#C084FC", minValue: 300 },
  { id: "rare", label: "Rare", color: "#38BDF8", minValue: 100 },
  { id: "common", label: "Common", color: "#94A3B8", minValue: 0 },
];

/**
 * Tier for a loot item by its reference value: <100 common (slate),
 * 100–299 rare (blue), 300–799 epic (purple), ≥800 legendary (amber).
 */
export function lootTierForValue(value: number): LootTier {
  const v = Number.isFinite(value) ? value : 0;
  for (const tier of LOOT_TIERS) {
    if (v >= tier.minValue) return tier;
  }
  return LOOT_TIERS[LOOT_TIERS.length - 1];
}

// ---------- Reveal timeline ----------

export interface RevealPace {
  /** Target ms per loot item. */
  perItemMs?: number;
  /** Shortest total scene/reveal duration. */
  minMs?: number;
  /** Longest total scene/reveal duration. */
  maxMs?: number;
}

export interface RevealTimeline {
  durationMs: number;
  /** Ms offset (from phase start) at which each item is revealed. */
  revealAtMs: number[];
}

/**
 * Schedule `itemCount` reveals inside a bounded window. With the
 * default pace this is the watched-dig timing: ~1s per loot item,
 * never shorter than 4s, never longer than 12s. Callers presenting a
 * quicker reveal (e.g. raid spoils) pass a faster pace.
 */
export function buildRevealTimeline(
  itemCount: number,
  pace: RevealPace = {}
): RevealTimeline {
  const perItemMs = pace.perItemMs ?? 1000;
  const minMs = pace.minMs ?? 4000;
  const maxMs = pace.maxMs ?? 12000;
  const count = Math.max(0, Math.floor(itemCount));
  const durationMs = Math.min(
    maxMs,
    Math.max(minMs, Math.round(count * perItemMs))
  );
  if (count === 0) return { durationMs, revealAtMs: [] };
  if (count === 1) return { durationMs, revealAtMs: [Math.round(durationMs * 0.45)] };
  // First pop lands early (the scene is already moving), the last one
  // leaves a short tail before the finale.
  const start = Math.min(900, durationMs * 0.2);
  const end = durationMs - Math.min(700, durationMs * 0.18);
  const step = (end - start) / (count - 1);
  const revealAtMs = Array.from({ length: count }, (_, i) =>
    Math.round(start + step * i)
  );
  return { durationMs, revealAtMs };
}

// ---------- Gold pops ----------

/**
 * Split a gold total into at most `maxPops` coin chunks for the scene
 * to animate. The chunks always sum back to the exact total and every
 * chunk is ≥ 1 while the total allows it.
 */
export function splitGoldPops(total: number, maxPops = 6): number[] {
  const t = Math.floor(total);
  if (!Number.isFinite(t) || t <= 0) return [];
  const bySize = Math.ceil(t / 40); // ~40 GOLD per coin pop
  const k = Math.max(1, Math.min(maxPops, bySize, t));
  const base = Math.floor(t / k);
  const remainder = t - base * k;
  return Array.from({ length: k }, (_, i) => base + (i < remainder ? 1 : 0));
}
