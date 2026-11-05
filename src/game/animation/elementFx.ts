// Crabtopia — elementFx: ELEMENT-DRIVEN battle VFX (presentation layer).
// ---------------------------------------------------------------------------
// User decision: battle effects take their FORM from the skill and their
// COLOUR/ENERGY from the ATTACKING crab's element — "bentuk dari skill,
// warna dari elemen penyerang". A Magmara crab's claw strike burns
// orange, a Himara crab's bolt freezes pale cyan, an Obsidara crab's
// burst turns violet-black — for all 18 elements.
//
// Rules (locked by unit tests):
//   * DAMAGE archetypes are element-driven: basic_claw, combo,
//     heavy_slam, ranged_bolt, aoe, debuff, drain, ultimate. Their
//     impact flipbook is colour-treated to the attacker's element, and
//     their projectile + impact particle bursts use the element colour.
//   * SUPPORT archetypes keep the skill's theme colour everywhere:
//     heal and shield_buff (incl. the Tide Sigil's shield/regen roles).
//     Their flipbooks, projectiles and particles render exactly as
//     before, so team effects stay readable. No data-fx-element hook.
//   * Layer separation holds: the flipbook PNG assets are NEVER
//     redrawn — the element is applied at render time as a CSS filter
//     treatment (this module) plus element-coloured particles.
//
// Treatment technique, per flipbook:
//   * "rotate" flipbooks carry a real native hue (measured below), so
//     the treatment hue-rotates from the native hue to the element hue
//     and adds an element-coloured drop-shadow glow as reinforcement.
//   * "glow" flipbooks are white/achromatic energy (slash) or
//     white-hot cores (spark): hue-rotate cannot move near-white
//     pixels, so the element is carried by a two-layer element-coloured
//     drop-shadow glow around the silhouette (plus the element-coloured
//     impact burst that always accompanies a damage impact).
// Everything here is pure and static — no animation, no wall clock —
// so the BattleClock pause freeze is untouched.

import type { ElementId } from "../engine/elements";
import { ELEMENT_AURA } from "../data/elementAura";
import type { SkillArchetype, SkillProfile } from "./skillProfiles";

export type FxTreatmentMode = "rotate" | "glow";

export interface FxNativeLook {
  /** Dominant hue in degrees (0–360), measured with PIL as the
   *  alpha-weighted circular mean hue over saturated pixels
   *  (s ≥ 0.25, a ≥ 40) of the actual strip in public/art/sprites/fx. */
  hue: number;
  /** Mean saturation (0–1) over those saturated pixels. */
  saturation: number;
  mode: FxTreatmentMode;
}

/**
 * Native look of the 11 atlas flipbooks (measured 2026-11-05 from the
 * committed PNGs). `slash` has ZERO saturated pixels — a pure white
 * slash — and `spark` is a white-hot star burst (golden fringe only),
 * hence the "glow" fallback for both. heal/shield are support
 * flipbooks: their rows complete the table, but treatments are never
 * applied to them while their archetypes stay theme-kept.
 */
export const FX_NATIVE_LOOK: Record<string, FxNativeLook> = {
  slash: { hue: 0, saturation: 0.0, mode: "glow" },
  spark: { hue: 45, saturation: 0.55, mode: "glow" },
  explosion: { hue: 30, saturation: 0.66, mode: "rotate" },
  levelup: { hue: 45, saturation: 0.7, mode: "rotate" },
  poison: { hue: 118, saturation: 0.62, mode: "rotate" },
  heal: { hue: 139, saturation: 0.59, mode: "rotate" },
  ice: { hue: 195, saturation: 0.27, mode: "rotate" },
  shield: { hue: 207, saturation: 0.63, mode: "rotate" },
  splash: { hue: 205, saturation: 0.55, mode: "rotate" },
  lightning: { hue: 213, saturation: 0.48, mode: "rotate" },
  dark: { hue: 259, saturation: 0.66, mode: "rotate" },
};

/** Hue (degrees, 0–360) of a #RRGGBB colour; achromatic → 0. */
export function hexToHue(hex: string): number {
  const n = hex.replace("#", "");
  const r = parseInt(n.slice(0, 2), 16) / 255;
  const g = parseInt(n.slice(2, 4), 16) / 255;
  const b = parseInt(n.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d === 0) return 0;
  let h: number;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h *= 60;
  return (h + 360) % 360;
}

export interface FxTreatment {
  /** The attacker's element driving this treatment. */
  element: ElementId;
  /** The element's aura colour (ELEMENT_AURA) — also the glow colour. */
  color: string;
  mode: FxTreatmentMode;
  /** hue-rotate degrees for "rotate" mode (0 for "glow" mode). */
  hueRotateDeg: number;
  /** Complete CSS `filter` value for the flipbook/projectile node. */
  filter: string;
}

/**
 * Colour treatment that lands flipbook `fxKey` on `element`'s hue.
 * Pure: same inputs → same treatment (unit-locked, incl. anchors:
 * ice under vulkara rotates +165° toward red; spark under any element
 * uses the glow fallback and never hue-rotates).
 */
export function fxTreatmentFor(fxKey: string, element: ElementId): FxTreatment {
  const color = ELEMENT_AURA[element];
  const look: FxNativeLook = FX_NATIVE_LOOK[fxKey] ?? {
    hue: 0,
    saturation: 0,
    mode: "glow",
  };
  if (look.mode === "glow") {
    return {
      element,
      color,
      mode: "glow",
      hueRotateDeg: 0,
      filter: `drop-shadow(0 0 6px ${color}) drop-shadow(0 0 16px ${color})`,
    };
  }
  const target = hexToHue(color);
  const deg = Math.round(((target - look.hue + 540) % 360) - 180);
  return {
    element,
    color,
    mode: "rotate",
    hueRotateDeg: deg,
    // saturate(1.15) is the guardrail for pale strips (ice, sat 0.27):
    // rotation alone would leave them washed out.
    filter: `hue-rotate(${deg}deg) saturate(1.15) drop-shadow(0 0 10px ${color})`,
  };
}

/**
 * The ONE archetype gate: every archetype except the two support
 * archetypes is element-driven. Debuff and drain are offensive (they
 * target enemies), so they are driven; golden_shower's "ultimate" is a
 * damage ultimate, also driven.
 */
export function isElementDrivenArchetype(archetype: SkillArchetype): boolean {
  return archetype !== "heal" && archetype !== "shield_buff";
}

/**
 * Profile-level resolution: the element that should drive this skill
 * profile's FX when cast by a crab of `attackerElement`, or null when
 * the profile is theme-kept (support) and must render untreated.
 */
export function profileFxElement(
  profile: SkillProfile,
  attackerElement: ElementId,
): ElementId | null {
  return isElementDrivenArchetype(profile.archetype) ? attackerElement : null;
}

/** Mix a #RRGGBB colour toward white by `amount` (0–1). Pure. */
export function mixWithWhite(hex: string, amount: number): string {
  const n = hex.replace("#", "");
  const ch = (i: number) => {
    const v = parseInt(n.slice(i, i + 2), 16);
    return Math.round(v + (255 - v) * amount)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${ch(0)}${ch(2)}${ch(4)}`;
}

/**
 * Particle palette for an element-driven impact burst: the element
 * colour weighted 2:1 against its own lightened tint (the particle
 * pool picks one palette entry per particle, so the duplicate base
 * entry weights the burst toward the true element colour).
 */
export function elementBurstColors(element: ElementId): string[] {
  const base = ELEMENT_AURA[element];
  return [base, mixWithWhite(base, 0.45), base];
}
