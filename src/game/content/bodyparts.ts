// Crabtopia - Body Parts and Gene definitions
import { BodyPartSlot, Rarity, FactionId, ClassId } from "../types";

export const BODY_PART_SLOTS: BodyPartSlot[] = [
  "eyes",
  "mouth",
  "shell",
  "claws",
  "crest",
  "legs",
];

export const RARITY_ORDER: Rarity[] = [
  "common",
  "uncommon",
  "rare",
  "epic",
  "legendary",
];

export const RARITY_COLORS: Record<Rarity, string> = {
  common: "#9CA3AF",
  uncommon: "#4FB477",
  rare: "#5C7CFF",
  epic: "#A855F7",
  legendary: "#FFD166",
};

export const RARITY_GLOW: Record<Rarity, string> = {
  common: "rgba(156,163,175,0.4)",
  uncommon: "rgba(79,180,119,0.5)",
  rare: "rgba(92,124,255,0.55)",
  epic: "rgba(168,85,247,0.6)",
  legendary: "rgba(255,209,102,0.85)",
};

export const RARITY_WEIGHTS: Record<Rarity, number> = {
  common: 60,
  uncommon: 25,
  rare: 10,
  epic: 4,
  legendary: 1,
};

// Each body part has gene variants tagged by faction/class affinity
// The gene id encodes which faction/class it "matches" for purity scoring
export interface GeneVariant {
  id: string;
  label: string;
  faction: FactionId; // which faction this gene matches
  classId: ClassId; // which class this gene matches
  rarity: Rarity;
}

// Generate gene pool: for each part slot, 6 factions x 8 classes = 48 base variants + legendary variants
// Simplified: gene id format `${part}_${faction}_${class}_${rarity}`
const ALL_FACTIONS: FactionId[] = [
  "coral_court",
  "cinderreef",
  "frostshelf",
  "mangrove",
  "stormwake",
  "moonpool",
];

const ALL_CLASSES: ClassId[] = [
  "bulwark",
  "reaver",
  "skitter",
  "tidecaller",
  "shellmender",
  "pincher",
  "warden",
  "gildclaw",
];

export const GENE_POOL: Record<BodyPartSlot, GeneVariant[]> = (() => {
  const pool: Record<BodyPartSlot, GeneVariant[]> = {
    eyes: [],
    mouth: [],
    shell: [],
    claws: [],
    crest: [],
    legs: [],
  };
  const rarities: Rarity[] = ["common", "uncommon", "rare", "epic"];
  for (const slot of BODY_PART_SLOTS) {
    for (const f of ALL_FACTIONS) {
      for (const c of ALL_CLASSES) {
        // create one variant per rarity tier (excluding legendary - very rare)
        for (const r of rarities) {
          pool[slot].push({
            id: `${slot}_${f}_${c}_${r}`,
            label: `${r} ${slot}`,
            faction: f,
            classId: c,
            rarity: r,
          });
        }
      }
    }
  }
  return pool;
})();

// Legendary gene variants: one per slot, shared
export const LEGENDARY_GENES: Record<BodyPartSlot, GeneVariant> = {
  eyes: {
    id: "eyes_legendary_leviathan",
    label: "Leviathan Eye",
    faction: "moonpool",
    classId: "tidecaller",
    rarity: "legendary",
  },
  mouth: {
    id: "mouth_legendary_abyssmaw",
    label: "Abyssmaw",
    faction: "cinderreef",
    classId: "reaver",
    rarity: "legendary",
  },
  shell: {
    id: "shell_legendary_pearldome",
    label: "Pearl Dome of the First Tide",
    faction: "coral_court",
    classId: "bulwark",
    rarity: "legendary",
  },
  claws: {
    id: "claws_legendary_godcutter",
    label: "Godcutter Claws",
    faction: "stormwake",
    classId: "skitter",
    rarity: "legendary",
  },
  crest: {
    id: "crest_legendary_tidewarden",
    label: "Tidewarden Crest",
    faction: "mangrove",
    classId: "warden",
    rarity: "legendary",
  },
  legs: {
    id: "legs_legendary_worldstrider",
    label: "Worldstrider Legs",
    faction: "frostshelf",
    classId: "gildclaw",
    rarity: "legendary",
  },
};

export function pickWeightedRarity(rng: () => number, allowLegendary: boolean): Rarity {
  const weights = allowLegendary
    ? RARITY_WEIGHTS
    : { ...RARITY_WEIGHTS, legendary: 0 };
  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  let r = rng() * total;
  for (const rar of RARITY_ORDER) {
    r -= weights[rar];
    if (r <= 0) return rar;
  }
  return "common";
}

export function getGeneVariant(slot: BodyPartSlot, geneId: string): GeneVariant | null {
  if (geneId.startsWith(`${slot}_legendary_`)) {
    return LEGENDARY_GENES[slot];
  }
  return GENE_POOL[slot].find((g) => g.id === geneId) ?? null;
}

// Compute purity 0-18: count gene slots where faction/class matches the crab
export function computePurity(
  crab: { faction: FactionId; classId: ClassId; genes: Record<BodyPartSlot, { D: string; R1: string; R2: string }> },
  crabFaction: FactionId,
  crabClass: ClassId
): number {
  let count = 0;
  for (const slot of BODY_PART_SLOTS) {
    const g = crab.genes[slot];
    for (const geneId of [g.D, g.R1, g.R2]) {
      const v = getGeneVariant(slot, geneId);
      if (v && v.faction === crabFaction && v.classId === crabClass) {
        count++;
      }
    }
  }
  return count; // 0-18
}

export function rarityBonus(rarity: Rarity): number {
  switch (rarity) {
    case "common": return 0;
    case "uncommon": return 8;
    case "rare": return 18;
    case "epic": return 35;
    case "legendary": return 70;
  }
}

export function purityBonus(purity: number): number {
  // 18/18 purity = +90 BP bonus; scaled
  return Math.round((purity / 18) * 90);
}
