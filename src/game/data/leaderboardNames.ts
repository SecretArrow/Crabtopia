// Crabtopia - Original NPC names for leaderboard & opponent generation
// No real-world names, no existing game character names.
// ~50 unique proper names; combine with faction adjectives & class names for full opponent handles.

export const FACTION_ADJECTIVES: string[] = [
  "Tideborn",
  "Coral",
  "Cinder",
  "Frost",
  "Mangrove",
  "Storm",
  "Moonpool",
  "Brinesworn",
  "Reefbound",
  "Saltforged",
  "Kelpshadow",
  "Pearlwoken",
  "Deepward",
  "Aurora-Touched",
  "Driftmarked",
  "Vent-Glow",
];

// Class-flavored role nouns (used as the second word in opponent handles, e.g. "Tideborn Reaver Vexis")
export const CLASS_NOUNS: string[] = [
  "Reaver",
  "Bulwark",
  "Skitter",
  "Tidecaller",
  "Shellmender",
  "Pincher",
  "Warden",
  "Gildclaw",
  "Stormcaller",
  "Reefkeeper",
  "Tidehand",
  "Saltblade",
  "Crestward",
  "Mendirge",
  "Vortexborn",
  "Abysswalker",
];

// 50 original proper names for NPCs (no Pokemon, no real people, no existing game chars)
export const NPC_NAMES: string[] = [
  "Vexis",
  "Mirabel",
  "Thalos",
  "Korrick",
  "Nerida",
  "Brakon",
  "Sylpha",
  "Drennar",
  "Velora",
  "Karnath",
  "Ophirael",
  "Tessel",
  "Rynwick",
  "Halvorin",
  "Cyrra",
  "Mystraen",
  "Quoril",
  "Dravenmoor",
  "Lyssael",
  "Garnoth",
  "Pythira",
  "Sorrekh",
  "Velikar",
  "Naevia",
  "Torbin",
  "Yssara",
  "Korrin",
  "Drasill",
  "Morwenne",
  "Halcyra",
  "Brindle",
  "Orran",
  "Veshna",
  "Kellvar",
  "Aldrych",
  "Sylthari",
  "Vaelith",
  "Tovarr",
  "Izeth",
  "Morrivar",
  "Thessaly",
  "Drakonn",
  "Bryelle",
  "Quarren",
  "Saelith",
  "Vorrak",
  "Tylarra",
  "Dreyik",
  "Kholis",
  "Wyndrae",
  "Morvael",
];

// Material item ids that can drop from arena rewards (kept in sync with src/game/data/materials.ts)
export const ARENA_DROP_MATERIALS: string[] = [
  "kelp_fiber",
  "pearl_shard",
  "crystal_dust",
  "iron_ore",
  "gold_nugget",
  "abyssal_gem",
];

// Pick a deterministic combination of adjective + noun + proper name from the lists above.
// `rng` is the caller's seeded PRNG so the result is deterministic.
export function makeOpponentName(rng: () => number): string {
  const adj = FACTION_ADJECTIVES[Math.floor(rng() * FACTION_ADJECTIVES.length)];
  const noun = CLASS_NOUNS[Math.floor(rng() * CLASS_NOUNS.length)];
  const proper = NPC_NAMES[Math.floor(rng() * NPC_NAMES.length)];
  return `${adj} ${noun} ${proper}`;
}
