// Crabtopia — canonical class preview-art mapping.
//
// EVERY class owns exactly one preview portrait: its own reference art
// in public/art/crabs/*.png (transparent RGBA, re-cropped from the
// user's character sheets by scripts/build_preview_art.py). No two
// classes share a file, and previews never borrow another class's
// silhouette with a hue tint — each crab's identity lives in its own
// art. Battle is different: in-arena animation uses the sprite sheets
// (see animation/sheetResolver.ts); this module is previews only.

import type { ClassId } from "../types";

export const CLASS_ART: Record<ClassId, string> = {
  bulwark: "/art/crabs/bulwark-coral.png",
  reaver: "/art/crabs/reaver-cinder.png",
  skitter: "/art/crabs/skitter-storm.png",
  tidecaller: "/art/crabs/tidecaller-moon.png",
  shellmender: "/art/crabs/shellmender-mangrove.png",
  pincher: "/art/crabs/pincher-coral.png",
  warden: "/art/crabs/warden-frost.png",
  gildclaw: "/art/crabs/gildclaw-cinder.png",
};

/**
 * The kelp-green rookie portrait file. Retained as a generic placeholder
 * asset (genesis filename list, unknown-class fallback in render/ui) —
 * it is NOT a crab visual identity: a crab always renders with its own
 * class's art, rookie or not.
 */
export const ROOKIE_ART = "/art/crabs/rookie-kelp.png";

/** The shadow/legendary portrait from the reference sheet. */
export const LEGENDARY_ART = "/art/crabs/legendary-glow.png";

/**
 * Preview art path for a class identity. The class decides — always:
 * a crab's rookie rank is a label, never an artwork override.
 */
export function artForClass(classId: ClassId): string {
  return CLASS_ART[classId];
}

/** Stable key for data attributes / tests (always the class id). */
export function artKeyForClass(classId: ClassId): string {
  return classId;
}
