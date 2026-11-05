// Crabtopia — sheetResolver
// Maps ANY crab (class + faction) to a frame-animated sprite sheet from the
// overhaul atlas. Every class resolves to a sheet — crabs are NEVER rendered
// as the old procedural SVG blob or a static PNG again:
//
//   - EVERY class has its own dedicated sheet: gildclaw (gold horned),
//     warden (blue crystal), reaver (magma), pincher (magenta spiky),
//     bulwark (coral stone tank), skitter (storm-violet speedster),
//     tidecaller (moon-coral mage), shellmender (mangrove healer).
//     (Bulwark/skitter/tidecaller/shellmender originally shared the
//     gildclaw/pincher silhouettes in battle; the limitation-fix round
//     gave them dedicated sheets — previews were always their own art.)
//
// Faction variants are produced with a CSS hue-rotate tint computed from the
// sheet's native faction, so a Frostshelf Warden reads icy-blue (native,
// shift 0) while a Cinderreef Warden reads warm orange-red. Rookies use the
// pincher sheet with a kelp-green tint (their classic rookie-kelp look).

import type { ClassId, FactionId } from "../types";

export type SheetKey =
  | "gildclaw"
  | "warden"
  | "reaver"
  | "pincher"
  | "bulwark"
  | "skitter"
  | "tidecaller"
  | "shellmender";

export interface SheetDescriptor {
  key: SheetKey;
  /** CSS hue-rotate degrees to apply over the sheet (0 = native colors). */
  hueRotate: number;
  /** Extra CSS filter (saturate/brightness) for identity tuning. */
  filterExtra?: string;
}

/** Representative "home" faction per class (matches the classic class art). */
export const CLASS_HOME_FACTION: Record<ClassId, FactionId> = {
  bulwark: "coral_court",
  reaver: "cinderreef",
  skitter: "stormwake",
  tidecaller: "moonpool",
  shellmender: "mangrove",
  pincher: "coral_court",
  warden: "frostshelf",
  gildclaw: "cinderreef",
};

/** Every class resolves to its OWN dedicated sheet (limitation fix). */
const CLASS_SHEET: Record<ClassId, SheetKey> = {
  gildclaw: "gildclaw",
  warden: "warden",
  reaver: "reaver",
  pincher: "pincher",
  bulwark: "bulwark",
  skitter: "skitter",
  tidecaller: "tidecaller",
  shellmender: "shellmender",
};

/** The faction each generated sheet was drawn in (shift 0). */
const SHEET_NATIVE_FACTION: Record<SheetKey, FactionId> = {
  gildclaw: "cinderreef",
  warden: "frostshelf",
  reaver: "cinderreef",
  pincher: "stormwake",
  bulwark: "coral_court",
  skitter: "stormwake",
  tidecaller: "moonpool",
  shellmender: "mangrove",
};

/**
 * Hue-rotate (degrees) to recolor a sheet from its native faction to the
 * target faction. Values are approximate color-family shifts: warm reds ≈
 * -20…-45 from an orange/red native, greens ≈ +80…+110, icy blues ≈ +175,
 * storm violet ≈ +250, moon indigo ≈ +290.
 */
const FACTION_HUE: Record<SheetKey, Record<FactionId, number>> = {
  gildclaw: {
    cinderreef: 0,
    coral_court: -15,
    mangrove: 45,
    frostshelf: 170,
    stormwake: 250,
    moonpool: 290,
  },
  warden: {
    frostshelf: 0,
    coral_court: -170,
    cinderreef: 150,
    mangrove: 90,
    stormwake: 60,
    moonpool: 40,
  },
  reaver: {
    cinderreef: 0,
    coral_court: -20,
    mangrove: 80,
    frostshelf: 180,
    stormwake: 255,
    moonpool: 295,
  },
  pincher: {
    stormwake: 0,
    coral_court: -45,
    cinderreef: -80,
    mangrove: 110,
    frostshelf: 55,
    moonpool: 25,
  },
  // New dedicated sheets (limitation-fix round). Shifts computed from
  // each sheet's measured native hue toward the same target families
  // as the tables above (cinderreef ≈ 15, coral_court ≈ 355, mangrove
  // ≈ 115, frostshelf ≈ 205, stormwake ≈ 268, moonpool ≈ 242),
  // normalised to [-180, 180]; approximations in the house style.
  bulwark: {
    // native: warm coral-red ≈ 11 (drawn in Coral Court colours)
    coral_court: 0,
    cinderreef: 5,
    mangrove: 105,
    frostshelf: -166,
    stormwake: -103,
    moonpool: -129,
  },
  skitter: {
    // native: storm violet body ≈ 265 with gold lightning veins
    stormwake: 0,
    coral_court: 90,
    cinderreef: 110,
    mangrove: -150,
    frostshelf: -60,
    moonpool: -23,
  },
  tidecaller: {
    // native: moon indigo ≈ 236 (drawn in Moonpool colours)
    moonpool: 0,
    coral_court: 119,
    cinderreef: 139,
    mangrove: -121,
    frostshelf: -31,
    stormwake: 32,
  },
  shellmender: {
    // native: mangrove green ≈ 90-115 (drawn in Mangrove colours)
    mangrove: 0,
    coral_court: -95,
    cinderreef: -75,
    frostshelf: 115,
    stormwake: 178,
    moonpool: 152,
  },
};

/** Kelp-green tint for rookie crabs (pincher sheet → rookie-kelp look). */
export const ROOKIE_HUE_ROTATE = 110;

export interface CrabSheetIdentity {
  classId: ClassId;
  faction: FactionId;
  isRookie?: boolean;
}

/** Resolve the sheet + tint for any crab identity. Never returns null. */
export function resolveSheetDescriptor(
  crab: CrabSheetIdentity,
): SheetDescriptor {
  if (crab.isRookie) {
    return { key: "pincher", hueRotate: ROOKIE_HUE_ROTATE };
  }
  const key = CLASS_SHEET[crab.classId];
  const hueRotate =
    crab.faction === SHEET_NATIVE_FACTION[key]
      ? 0
      : (FACTION_HUE[key][crab.faction] ?? 0);
  return { key, hueRotate };
}

/** Back-compat helper: just the sheet key for a crab. Always resolves. */
export function resolveSheetForCrab(crab: CrabSheetIdentity): SheetKey {
  return resolveSheetDescriptor(crab).key;
}
