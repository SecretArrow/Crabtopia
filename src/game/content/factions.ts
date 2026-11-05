// Crabtopia - Six Factions data
import { FactionId } from "../types";

export interface FactionDef {
  id: FactionId;
  name: string;
  shortName: string;
  motto: string;
  colors: { primary: string; accent: string; dark: string; light: string };
  biome: string;
  emblem: string; // emoji-like symbol for quick render
  style: string;
  lore: string;
  bonus: {
    twoSame: string;
    threeSame: string;
  };
  // faction wheel advantage: this faction beats the listed one
  beats: FactionId;
}

export const FACTIONS: Record<FactionId, FactionDef> = {
  coral_court: {
    id: "coral_court",
    name: "Coral Court",
    shortName: "Coral",
    motto: "Grace in the current, strength in the reef.",
    colors: {
      primary: "#FF6F91",
      accent: "#FFD166",
      dark: "#8C2D52",
      light: "#FFD6E5",
    },
    biome: "reef",
    emblem: "🪸",
    style: "Balanced, support synergy",
    lore: "Tide-gardeners of the coral spires who turn war into ritual.",
    bonus: {
      twoSame: "+5% BP, +10% healing received",
      threeSame: "+10% BP, +20% healing, shields regenerate",
    },
    beats: "stormwake",
  },
  cinderreef: {
    id: "cinderreef",
    name: "Cinderreef",
    shortName: "Cinder",
    motto: "From the vent, we burn.",
    colors: {
      primary: "#FF7A1A",
      accent: "#FFD166",
      dark: "#5C1A00",
      light: "#FFD9B3",
    },
    biome: "vent",
    emblem: "🌋",
    style: "Burst damage",
    lore: "Forged in lava-glass, they strike fast and hot.",
    bonus: {
      twoSame: "+8% attack, +5% crit chance",
      threeSame: "+15% attack, +10% crit, burn on hit",
    },
    beats: "mangrove",
  },
  frostshelf: {
    id: "frostshelf",
    name: "Frostshelf",
    shortName: "Frost",
    motto: "The shelf endures.",
    colors: {
      primary: "#7CF5E1",
      accent: "#C9D6EE",
      dark: "#0A4A66",
      light: "#EAF6FF",
    },
    biome: "ice",
    emblem: "❄️",
    style: "Control and defense",
    lore: "Aurora-touched guardians who freeze the tide itself.",
    bonus: {
      twoSame: "+10% defense, +8% freeze chance",
      threeSame: "+20% defense, +15% freeze, shield on start",
    },
    beats: "cinderreef",
  },
  mangrove: {
    id: "mangrove",
    name: "Mangrove Wardens",
    shortName: "Mangrove",
    motto: "Roots hold the world.",
    colors: {
      primary: "#4FB477",
      accent: "#B8D869",
      dark: "#1F4A2A",
      light: "#D4EBC8",
    },
    biome: "swamp",
    emblem: "🌱",
    style: "Regeneration and endurance",
    lore: "Patient root-weavers who outlast any storm.",
    bonus: {
      twoSame: "+12% HP, regen 3%/turn",
      threeSame: "+25% HP, regen 6%/turn, cleanse on hurt",
    },
    beats: "frostshelf",
  },
  stormwake: {
    id: "stormwake",
    name: "Stormwake",
    shortName: "Storm",
    motto: "Ride the lightning.",
    colors: {
      primary: "#7A5CFF",
      accent: "#C9D6EE",
      dark: "#2A1A6B",
      light: "#D6CCFF",
    },
    biome: "rift",
    emblem: "⚡",
    style: "Speed and crit",
    lore: "Charged by the rifts, they strike before the thunder fades.",
    bonus: {
      twoSame: "+10% speed, +8% crit",
      threeSame: "+20% speed, +15% crit, double-strike chance",
    },
    beats: "moonpool",
  },
  moonpool: {
    id: "moonpool",
    name: "Moonpool",
    shortName: "Moon",
    motto: "Tide and trick.",
    colors: {
      primary: "#5C7CFF",
      accent: "#C9D6EE",
      dark: "#0A1B3D",
      light: "#E0E6FF",
    },
    biome: "pool",
    emblem: "🌙",
    style: "Trickery, evasion, debuffs",
    lore: "Plankton-glow tricksters who vanish into moon-shimmer.",
    bonus: {
      twoSame: "+10% dodge, +8% silence chance",
      threeSame: "+20% dodge, +15% silence, mirror damage",
    },
    beats: "coral_court",
  },
};

export const FACTION_LIST = Object.values(FACTIONS);

// Faction wheel: A beats B means A gets +8% BP vs B
// Cinderreef > Mangrove > Frostshelf > Cinderreef
// Stormwake > Moonpool > Coral Court > Stormwake
export function factionMatchupBonus(
  attacker: FactionId,
  defender: FactionId
): number {
  if (FACTIONS[attacker].beats === defender) return 0.08;
  if (FACTIONS[defender].beats === attacker) return -0.08;
  return 0;
}
