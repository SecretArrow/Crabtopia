// Crabtopia - Materials, Recipes & Mining Nodes data
// Pure data module — no React, no client/server concerns.
// Consumed by MiningScreen, CraftingScreen, InventoryScreen, ExplorationScreen.

import type { Rarity } from "../types";

// ---------- TYPE DEFINITIONS ----------

export type MaterialId =
  | "kelp_fiber"
  | "pearl_shard"
  | "crystal_dust"
  | "iron_ore"
  | "gold_nugget"
  | "abyssal_gem";

export type ItemId =
  | "sharpening_stone"
  | "shell_polish"
  | "tide_amulet"
  | "energy_brew"
  | "lucky_charm"
  | "legendary_lure";

export interface MaterialDef {
  id: MaterialId;
  name: string;
  icon: string; // emoji
  rarity: Rarity;
  description: string;
  source: "mining" | "exploration" | "both";
  /**
   * Reference market value in GOLD per unit (engine/itemMarket.ts):
   * the price NPC Bazaar listings are based on, the anchor of the NPC
   * demand model, and the base of the 300% player price cap.
   */
  baseValue: number;
}

export type RecipeEffect =
  | {
      type: "stat_buff";
      stat: "attack" | "defense" | "hp" | "speed" | "skill";
      percent: number;
    }
  | {
      type: "energy_restore";
      amount: number;
    }
  | {
      type: "drop_rate";
      percent: number;
      charges: number;
    }
  | {
      type: "legendary_chance";
      percent: number;
      charges: number;
    };

export interface RecipeDef {
  id: ItemId;
  name: string;
  icon: string;
  rarity: Rarity;
  description: string;
  materials: Record<MaterialId, number>; // required counts
  effect: RecipeEffect;
}

export interface MiningNodeDef {
  id: string;
  name: string;
  icon: string;
  description: string;
  cooldownMs: number;
  energyCost: number;
  /** Minimum team power (teamBP) a mining team must have to work this node. */
  minTeamPower: number;
  drops: {
    materialId: MaterialId;
    min: number;
    max: number;
    chance: number; // 0..1 probability the drop occurs at all
  }[];
}

// ---------- MATERIAL DEFINITIONS ----------

export const MATERIALS: Record<MaterialId, MaterialDef> = {
  kelp_fiber: {
    id: "kelp_fiber",
    name: "Kelp Fiber",
    icon: "🌿",
    rarity: "common",
    description:
      "Tough thread-like strands harvested from the kelp forests. The backbone of crude crafting.",
    source: "mining",
    baseValue: 40,
  },
  pearl_shard: {
    id: "pearl_shard",
    name: "Pearl Shard",
    icon: "🫧",
    rarity: "uncommon",
    description:
      "Lustrous fragments of deep-sea pearls. Polishes shells to a mirror sheen.",
    source: "mining",
    baseValue: 120,
  },
  crystal_dust: {
    id: "crystal_dust",
    name: "Crystal Dust",
    icon: "💎",
    rarity: "rare",
    description:
      "Ground tide-crystals that hold a faint glow. A catalyst for enchanted crafts.",
    source: "mining",
    baseValue: 300,
  },
  iron_ore: {
    id: "iron_ore",
    name: "Iron Ore",
    icon: "⛏️",
    rarity: "uncommon",
    description:
      "Rust-flecked nodules mined from the ridge. Used to weight and sharpen claws.",
    source: "mining",
    baseValue: 90,
  },
  gold_nugget: {
    id: "gold_nugget",
    name: "Gold Nugget",
    icon: "🪙",
    rarity: "rare",
    description:
      "A weighty chip of pure tide-gold. Plundered from chests or sifted from rich veins.",
    source: "both",
    baseValue: 500,
  },
  abyssal_gem: {
    id: "abyssal_gem",
    name: "Abyssal Gem",
    icon: "🔮",
    rarity: "epic",
    description:
      "A gem cut from the lightless deep. Pulsing with raw tide-magic — rare and powerful.",
    source: "both",
    baseValue: 1200,
  },
};

export const MATERIAL_LIST: MaterialDef[] = Object.values(MATERIALS);

// ---------- RECIPE DEFINITIONS ----------

// Helper so recipe authors only list non-zero requirements; the type requires
// all six keys to be present (Record<MaterialId, number>).
function mat(
  partial: Partial<Record<MaterialId, number>>
): Record<MaterialId, number> {
  return {
    kelp_fiber: 0,
    pearl_shard: 0,
    crystal_dust: 0,
    iron_ore: 0,
    gold_nugget: 0,
    abyssal_gem: 0,
    ...partial,
  };
}

export const RECIPES: Record<ItemId, RecipeDef> = {
  sharpening_stone: {
    id: "sharpening_stone",
    name: "Sharpening Stone",
    icon: "🪨",
    rarity: "common",
    description:
      "A weighted whetstone that hones a crab's claws. +5% Attack when applied.",
    materials: mat({ kelp_fiber: 3, iron_ore: 2 }),
    effect: { type: "stat_buff", stat: "attack", percent: 5 },
  },
  shell_polish: {
    id: "shell_polish",
    name: "Shell Polish",
    icon: "✨",
    rarity: "uncommon",
    description:
      "A pearlescent lacquer that hardens the carapace. +5% Defense when applied.",
    materials: mat({ pearl_shard: 2, crystal_dust: 1 }),
    effect: { type: "stat_buff", stat: "defense", percent: 5 },
  },
  tide_amulet: {
    id: "tide_amulet",
    name: "Tide Amulet",
    icon: "🧿",
    rarity: "rare",
    description:
      "An abyssal charm that swells a crab's vitality. +10% HP when applied.",
    materials: mat({ abyssal_gem: 1, pearl_shard: 3 }),
    effect: { type: "stat_buff", stat: "hp", percent: 10 },
  },
  energy_brew: {
    id: "energy_brew",
    name: "Energy Brew",
    icon: "⚗️",
    rarity: "common",
    description:
      "A fizzing kelp tonic. Restores 3 mining energy when consumed.",
    materials: mat({ kelp_fiber: 4 }),
    effect: { type: "energy_restore", amount: 3 },
  },
  lucky_charm: {
    id: "lucky_charm",
    name: "Lucky Charm",
    icon: "🍀",
    rarity: "rare",
    description:
      "A gilded talisman that tilts fortune. +1 bonus material from each of the next 3 treasure chests.",
    materials: mat({ gold_nugget: 2, crystal_dust: 1 }),
    effect: { type: "drop_rate", percent: 5, charges: 3 },
  },
  legendary_lure: {
    id: "legendary_lure",
    name: "Legendary Lure",
    icon: "🎣",
    rarity: "epic",
    description:
      "A lure woven from abyssal thread. +10% legendary chance for the next breed.",
    materials: mat({ abyssal_gem: 1, gold_nugget: 5 }),
    effect: { type: "legendary_chance", percent: 10, charges: 1 },
  },
};

export const RECIPE_LIST: RecipeDef[] = Object.values(RECIPES);

// ---------- MINING NODE DEFINITIONS ----------

export const MINING_NODES: MiningNodeDef[] = [
  {
    id: "kelp_ridge",
    name: "Kelp Ridge",
    icon: "🌿",
    description:
      "A shallow kelp-covered ridge. Yields common fibers and iron — quick to mine.",
    cooldownMs: 60_000, // 1 minute
    energyCost: 1,
    minTeamPower: 0,
    drops: [
      { materialId: "kelp_fiber", min: 1, max: 3, chance: 0.85 },
      { materialId: "iron_ore", min: 1, max: 2, chance: 0.4 },
    ],
  },
  {
    id: "pearl_cavern",
    name: "Pearl Cavern",
    icon: "🫧",
    description:
      "A glistening cavern of suspended pearls. Yields uncommon shards and rare dust.",
    cooldownMs: 180_000, // 3 minutes
    energyCost: 1,
    minTeamPower: 1000,
    drops: [
      { materialId: "pearl_shard", min: 1, max: 2, chance: 0.75 },
      { materialId: "crystal_dust", min: 1, max: 1, chance: 0.25 },
    ],
  },
  {
    id: "crystal_vault",
    name: "Crystal Vault",
    icon: "💎",
    description:
      "A deep vault of pulsing crystals. Yields rare dust, gold nuggets, and epic gems.",
    cooldownMs: 600_000, // 10 minutes
    energyCost: 1,
    minTeamPower: 3500,
    drops: [
      { materialId: "crystal_dust", min: 1, max: 2, chance: 0.6 },
      { materialId: "gold_nugget", min: 1, max: 1, chance: 0.2 },
      { materialId: "abyssal_gem", min: 1, max: 1, chance: 0.15 },
    ],
  },
];

// ---------- HELPERS ----------

/** Roll a single mining node's drop table into a concrete material yield. */
export function rollNodeDrops(
  node: MiningNodeDef,
  rng: () => number
): Partial<Record<MaterialId, number>> {
  const out: Partial<Record<MaterialId, number>> = {};
  for (const drop of node.drops) {
    if (rng() < drop.chance) {
      const amount =
        drop.min +
        Math.floor(rng() * (drop.max - drop.min + 1));
      out[drop.materialId] = (out[drop.materialId] ?? 0) + amount;
    }
  }
  return out;
}

/** Sum two partial material count maps. */
export function mergeMaterials(
  a: Partial<Record<MaterialId, number>>,
  b: Partial<Record<MaterialId, number>>
): Partial<Record<MaterialId, number>> {
  const out: Partial<Record<MaterialId, number>> = { ...a };
  for (const k of Object.keys(b) as MaterialId[]) {
    out[k] = (out[k] ?? 0) + (b[k] ?? 0);
  }
  return out;
}

/** True if the inventory holds enough of every required material. */
export function canCraft(
  inventory: Partial<Record<MaterialId, number>>,
  recipe: RecipeDef
): boolean {
  for (const k of Object.keys(recipe.materials) as MaterialId[]) {
    const need = recipe.materials[k];
    if (need > 0 && (inventory[k] ?? 0) < need) return false;
  }
  return true;
}
