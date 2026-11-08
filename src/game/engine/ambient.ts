// Crabtopia — Ambient life layout (pure).
//
// Deterministic positions for the AmbientLife layer (bubbles, motes,
// light rays) so the backdrop never re-randomizes on re-render: the
// same seed always yields the same layout, on every client. Pure
// functions only — the component renders what these return.
//
// Counts are CAPPED per viewport so phones stay cheap: bubbles are
// transform-only CSS animations, motes are tiny dots, rays are two
// skewed gradient divs. Nothing here allocates per frame.

import { mulberry32 } from "./rng";

export interface AmbientBubble {
  /** % from the left edge of the shell. */
  leftPct: number;
  /** px diameter. */
  sizePx: number;
  /** seconds for one rise from the sea floor to above the surface. */
  durationS: number;
  /** seconds before the first rise starts. */
  delayS: number;
  /** px horizontal sway at the keyframe midpoints. */
  swayPx: number;
  opacity: number;
}

export interface AmbientMote {
  leftPct: number;
  topPct: number;
  sizePx: number;
  durationS: number;
  delayS: number;
}

/** Hard caps — the layer never renders more than these. */
export const AMBIENT_COUNTS = {
  phone: { bubbles: 10, motes: 8 },
  desktop: { bubbles: 14, motes: 12 },
} as const;

export function ambientBubbles(seed: number, count: number): AmbientBubble[] {
  const rng = mulberry32(seed >>> 0);
  const n = Math.max(0, Math.min(count, AMBIENT_COUNTS.desktop.bubbles));
  return Array.from({ length: n }, () => ({
    leftPct: 2 + rng() * 96,
    sizePx: Math.round(4 + rng() * 10),
    durationS: Math.round(14 + rng() * 12),
    delayS: Math.round(rng() * 12 * 10) / 10,
    swayPx: Math.round(8 + rng() * 16),
    opacity: Math.round((0.25 + rng() * 0.35) * 100) / 100,
  }));
}

export function ambientMotes(seed: number, count: number): AmbientMote[] {
  const rng = mulberry32((seed ^ 0x9e3779b9) >>> 0);
  const n = Math.max(0, Math.min(count, AMBIENT_COUNTS.desktop.motes));
  return Array.from({ length: n }, () => ({
    leftPct: Math.round(rng() * 1000) / 10,
    topPct: Math.round(rng() * 1000) / 10,
    sizePx: 2 + Math.floor(rng() * 4),
    durationS: Math.round(9 + rng() * 7),
    delayS: Math.round(rng() * 6 * 10) / 10,
  }));
}
