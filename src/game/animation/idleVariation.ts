// Crabtopia — Seeded idle variation.
//
// Groups of same-class crabs must never idle in sync: every crab picks
// its idle variants and micro timing offsets DETERMINISTICALLY from a
// seed (its crab id), so a roster of six Pinchers breathes, glances
// and stretches on six different schedules — on every client, every
// render, with no stored state. Pure functions only; AnimatedCrab
// drives the schedule from accumulated (clock-scaled) idle time, so
// pausing the battle clock freezes the schedule with everything else.

/** FNV-1a 32-bit hash — stable across runs and platforms. */
export function hashSeed(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export interface IdleProfile {
  /** ms offset into the idle cycle schedule — crabs start mid-cycle. */
  phaseMs: number;
  /** Playback-rate jitter for idle clips, 0.92–1.08. */
  speedFactor: number;
  /** 0..1 personality roll reused by the variant schedule. */
  roll: number;
}

export function idleProfileFor(seed: string): IdleProfile {
  const h = hashSeed(seed);
  return {
    phaseMs: h % 4000,
    speedFactor: 0.92 + ((h >>> 8) % 17) / 100, // 0.92 … 1.08
    roll: ((h >>> 16) % 1000) / 1000,
  };
}

/**
 * Which idle clip should play during idle cycle `cycleIndex` (0-based)?
 * The base "idle" clip dominates (~60% of cycles); the rest split
 * across the sheet's variant clips (idleAlt1, idleAlt2, …) in a
 * seed-dependent order. Deterministic for (seed, cycleIndex).
 */
export function idleClipForCycle(
  seed: string,
  cycleIndex: number,
  variants: readonly string[],
): string {
  if (variants.length === 0) return "idle";
  const h = hashSeed(`${seed}#idle#${cycleIndex}`);
  const r = h % 100;
  if (r < 60) return "idle";
  const pick = (h >>> 8) % variants.length;
  return variants[pick];
}
