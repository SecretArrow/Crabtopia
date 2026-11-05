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

/** Rookie crabs have their own portrait (not a class portrait). */
export const ROOKIE_ART = "/art/crabs/rookie-kelp.png";

/** The shadow/legendary portrait from the reference sheet. */
export const LEGENDARY_ART = "/art/crabs/legendary-glow.png";

/** Preview art path for a class identity (rookies get the rookie art). */
export function artForClass(classId: ClassId, isRookie?: boolean): string {
  return isRookie ? ROOKIE_ART : CLASS_ART[classId];
}

/** Stable key for data attributes / tests ("rookie" or the class id). */
export function artKeyForClass(classId: ClassId, isRookie?: boolean): string {
  return isRookie ? "rookie" : classId;
}
