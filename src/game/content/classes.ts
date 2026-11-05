// Crabtopia - Eight Classes data
import { ClassId } from "../types";

export interface ClassDef {
  id: ClassId;
  name: string;
  icon: string; // single emoji glyph for quick display
  role: string;
  description: string;
  baseStats: {
    hp: number;
    attack: number;
    defense: number;
    speed: number;
    skill: number;
  };
  // per-level growth
  growth: {
    hp: number;
    attack: number;
    defense: number;
    speed: number;
    skill: number;
  };
  activeSkill: {
    id: string;
    name: string;
    energyCost: number;
    cooldown: number;
    description: string;
    power: number; // multiplier on attack/skill
  };
  passive: {
    id: string;
    name: string;
    description: string;
  };
  positioning: "front" | "mid" | "back" | "any";
}

export const CLASSES: Record<ClassId, ClassDef> = {
  bulwark: {
    id: "bulwark",
    name: "Bulwark",
    icon: "🛡️",
    role: "Tank",
    description: "Highest HP and defense. Taunts enemies to protect allies.",
    baseStats: { hp: 320, attack: 28, defense: 60, speed: 18, skill: 20 },
    growth: { hp: 28, attack: 2.2, defense: 4.5, speed: 1.2, skill: 1.5 },
    activeSkill: {
      id: "taunt_slam",
      name: "Bulwark Slam",
      energyCost: 3,
      cooldown: 2,
      description: "Slam the ground, taunting all enemies and dealing AoE damage.",
      power: 1.4,
    },
    passive: {
      id: "stone_skin",
      name: "Stone Skin",
      description: "Takes 15% reduced damage. Taunts naturally.",
    },
    positioning: "front",
  },
  reaver: {
    id: "reaver",
    name: "Reaver",
    icon: "⚔️",
    role: "DPS",
    description: "Highest attack. Big single-target damage.",
    baseStats: { hp: 180, attack: 75, defense: 28, speed: 35, skill: 30 },
    growth: { hp: 14, attack: 5.5, defense: 2, speed: 2.5, skill: 2.2 },
    activeSkill: {
      id: "reaving_claw",
      name: "Reaving Claw",
      energyCost: 4,
      cooldown: 3,
      description: "A devastating claw strike dealing massive single-target damage.",
      power: 2.2,
    },
    passive: {
      id: "bloodlust",
      name: "Bloodlust",
      description: "+10% attack for each enemy below 50% HP.",
    },
    positioning: "mid",
  },
  skitter: {
    id: "skitter",
    name: "Skitter",
    icon: "🏃",
    role: "Speedster",
    description: "Highest speed. Acts first, dodges attacks.",
    baseStats: { hp: 160, attack: 45, defense: 22, speed: 80, skill: 35 },
    growth: { hp: 12, attack: 3.5, defense: 1.8, speed: 5.5, skill: 2.5 },
    activeSkill: {
      id: "ripple_strike",
      name: "Ripple Strike",
      energyCost: 2,
      cooldown: 1,
      description: "Quick dual strike hitting twice for moderate damage.",
      power: 0.9,
    },
    passive: {
      id: "evade",
      name: "Evade",
      description: "20% dodge chance. Acts first each round.",
    },
    positioning: "any",
  },
  tidecaller: {
    id: "tidecaller",
    name: "Tidecaller",
    icon: "🌊",
    role: "Mage",
    description: "Magic damage, area water attacks.",
    baseStats: { hp: 170, attack: 30, defense: 25, speed: 40, skill: 75 },
    growth: { hp: 13, attack: 2.5, defense: 2, speed: 2.8, skill: 5.5 },
    activeSkill: {
      id: "tidal_burst",
      name: "Tidal Burst",
      energyCost: 5,
      cooldown: 3,
      description: "Conjure a wave of water hitting all enemies for magic damage.",
      power: 1.6,
    },
    passive: {
      id: "mana_tide",
      name: "Mana Tide",
      description: "+1 energy regen per round.",
    },
    positioning: "back",
  },
  shellmender: {
    id: "shellmender",
    name: "Shellmender",
    icon: "✨",
    role: "Healer",
    description: "Healing and shields for allies.",
    baseStats: { hp: 200, attack: 25, defense: 35, speed: 30, skill: 55 },
    growth: { hp: 16, attack: 2, defense: 3, speed: 2, skill: 4 },
    activeSkill: {
      id: "mend_pearl",
      name: "Mending Pearl",
      energyCost: 3,
      cooldown: 2,
      description: "Heal the lowest-HP ally and grant a shield.",
      power: 1.5,
    },
    passive: {
      id: "regen_aura",
      name: "Regen Aura",
      description: "Allies regenerate 4% HP each round.",
    },
    positioning: "back",
  },
  pincher: {
    id: "pincher",
    name: "Pincher",
    icon: "🦀",
    role: "All-rounder",
    description: "Balanced stats, combo damage.",
    baseStats: { hp: 220, attack: 50, defense: 40, speed: 45, skill: 40 },
    growth: { hp: 17, attack: 3.8, defense: 3, speed: 3, skill: 3 },
    activeSkill: {
      id: "combo_pinch",
      name: "Combo Pinch",
      energyCost: 3,
      cooldown: 2,
      description: "A three-hit combo dealing escalating damage.",
      power: 1.1,
    },
    passive: {
      id: "momentum",
      name: "Momentum",
      description: "+5% damage each consecutive attack (max +25%).",
    },
    positioning: "mid",
  },
  warden: {
    id: "warden",
    name: "Warden",
    icon: "🔱",
    role: "Controller",
    description: "Crowd control: stuns, silences.",
    baseStats: { hp: 210, attack: 40, defense: 45, speed: 35, skill: 50 },
    growth: { hp: 16, attack: 3, defense: 3.5, speed: 2.5, skill: 3.5 },
    activeSkill: {
      id: "binding_tide",
      name: "Binding Tide",
      energyCost: 4,
      cooldown: 3,
      description: "Stun a target for 1 round and silence adjacent enemies.",
      power: 0.8,
    },
    passive: {
      id: "watchful",
      name: "Watchful",
      description: "+15% effect duration on debuffs you apply.",
    },
    positioning: "mid",
  },
  gildclaw: {
    id: "gildclaw",
    name: "Gildclaw",
    icon: "💰",
    role: "Luck",
    description: "Luck-based. Boosts dig rewards and drop rates.",
    baseStats: { hp: 190, attack: 42, defense: 32, speed: 42, skill: 42 },
    growth: { hp: 15, attack: 3.2, defense: 2.5, speed: 3, skill: 3.2 },
    activeSkill: {
      id: "golden_shower",
      name: "Golden Shower",
      energyCost: 4,
      cooldown: 4,
      description: "Rain coins on enemies for damage and steal 5% of their gold.",
      power: 1.3,
    },
    passive: {
      id: "lucky_paw",
      name: "Lucky Paw",
      description: "+10% dig reward. +5% drop rate. +5% crit.",
    },
    positioning: "any",
  },
};

export const CLASS_LIST = Object.values(CLASSES);
