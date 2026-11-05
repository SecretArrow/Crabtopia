// Crabtopia — element aura palette (presentation layer).
// ---------------------------------------------------------------------------
// The user wants a crab's ELEMENT to be readable from the character's
// own presentation, not only from its badge — while the standing
// layer-separation rule keeps the base artwork CLEAN (nothing baked
// into portraits or sprite sheets). The compromise is this AURA LAYER:
// a soft element-coloured glow rendered as a separate, absolutely
// positioned layer BEHIND/BESIDE the character by the render wrappers
// (ElementAura component). Artwork files are never modified.
//
// Colours derive from each element's established badge colour
// (engine/elements.ts ELEMENTS[id].color). Four badge colours are too
// dark or too desaturated to read as a glow at aura alphas, so they
// get a documented brighter aura variant:
//   bentala   #B45309 → #D97706  warm amber — the badge brown goes
//                                 muddy at glow alpha on dark arenas.
//   lodara    #64748B → #94A3B8  slate-400 — magnet steel needs a
//                                 lighter silver-blue to glow at all.
//   obsidara  #581C87 → #9333EA  black-flame violet, lifted so the
//                                 "black fire" still reads as fire.
//   andhakara #1F2937 → #7C3AED  deep violet — near-black cannot glow;
//                                 darkness is shown as a violet void.
// Every aura colour is locked by unit tests to a minimum WCAG relative
// luminance (>= 0.12) so no element can regress to an invisible glow.

import type { Crab } from "../types";
import { elementOf, type ElementId } from "../engine/elements";

/** Aura glow colour per element (hex). See header for derivations. */
export const ELEMENT_AURA: Record<ElementId, string> = {
  vulkara: "#EF4444",
  nerala: "#3B82F6",
  bentala: "#D97706",
  lintara: "#EAB308",
  anila: "#10B981",
  himara: "#22D3EE",
  rimba: "#65A30D",
  magmara: "#F97316",
  taufan: "#8B5CF6",
  dentuma: "#EC4899",
  vapora: "#CBD5E1",
  lodara: "#94A3B8",
  pulvara: "#A8A29E",
  terika: "#FF5C39",
  obsidara: "#9333EA",
  prismara: "#D946EF",
  andhakara: "#7C3AED",
  waja: "#9CA3AF",
};

/** Elements whose aura colour intentionally differs from the badge. */
export const AURA_BRIGHTENED: readonly ElementId[] = [
  "bentala",
  "lodara",
  "obsidara",
  "andhakara",
];

/** Aura glow colour for an element id. */
export function auraForElement(id: ElementId): string {
  return ELEMENT_AURA[id];
}

/**
 * Aura glow colour for a crab — resolves through elementOf, so the
 * stored element wins and legacy crabs use the deterministic
 * resolver, exactly like ElementBadge.
 */
export function auraForCrab(crab: Crab): string {
  return ELEMENT_AURA[elementOf(crab)];
}
