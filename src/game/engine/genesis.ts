// Crabtopia - Genesis Crab collection (limited original mint).
//
// Exactly 333 Genesis Crabs exist. 30% of the supply (100 crabs, rounded
// from 333 * 0.30 = 99.9) is listed on the Bazaar market; the remaining 233
// are held in reserve and are NOT for sale.
//
// The collection is generated deterministically from a fixed seed, so every
// client and every test run sees the exact same 333 crabs. Listing rule
// (documented, deterministic): Genesis #1..#100 are market-listed,
// Genesis #101..#333 are reserve/unlisted.
import type { Crab, CrabStats, FactionId, ClassId, Rarity } from "../types";
import { CLASSES } from "../content/classes";
import { BREEDS, BREEDS_BY_ID } from "../content/breeds";
import { FACTION_LIST } from "../content/factions";
import { mulberry32, pick, randInt, makeCrabName } from "./rng";
import { generateCrab } from "./crabs";
import { CONFIG } from "./config";

export const GENESIS_TOTAL = 333;
export const GENESIS_MARKET_PERCENT = 0.3;
export const GENESIS_MARKET_COUNT = Math.round(GENESIS_TOTAL * GENESIS_MARKET_PERCENT); // 100
export const GENESIS_RESERVE_COUNT = GENESIS_TOTAL - GENESIS_MARKET_COUNT; // 233
export const GENESIS_SEED = 20261105;

// Painted sprite art (also used for the Genesis cards). All character art
// comes from ONE clean 2D cartoon sheet (6 crabs); the remaining files are
// hue/flip variants of that same sheet produced in PIL — no other art style
// is used for characters.
export const GENESIS_ART_FILES = [
  "pincher-coral.png",
  "warden-frost.png",
  "gildclaw-cinder.png",
  "reaver-cinder.png",
  "shellmender-mangrove.png",
  "legendary-glow.png",
  "tidecaller-moon.png",
  "skitter-storm.png",
  "rookie-kelp.png",
  "bulwark-coral.png",
];

export interface GenesisCrab {
  genesisNumber: number; // 1..333
  id: string; // genesis_1 .. genesis_333
  name: string;
  faction: FactionId;
  classId: ClassId;
  breedId: string;
  breedName: string;
  rarity: Rarity;
  level: number;
  stats: CrabStats;
  price: number; // GOLD, only meaningful when listed
  listed: boolean;
  artFile: string;
  seed: number;
}

const RARITY_PRICE_BASE: Record<Rarity, number> = {
  common: 4000,
  uncommon: 7500,
  rare: 14000,
  epic: 26000,
  legendary: 52000,
};

const RARITY_LEVEL_RANGE: Record<Rarity, [number, number]> = {
  common: [10, 20],
  uncommon: [16, 26],
  rare: [24, 34],
  epic: [32, 42],
  legendary: [40, 50],
};

function rollRarity(rng: () => number): Rarity {
  const r = rng();
  if (r < 0.03) return "legendary";
  if (r < 0.13) return "epic";
  if (r < 0.38) return "rare";
  if (r < 0.68) return "uncommon";
  return "common";
}

function buildGenesisCrab(genesisNumber: number, rng: () => number): GenesisCrab {
  const faction = pick(FACTION_LIST.map((f) => f.id), rng);
  const classId = pick(Object.keys(CLASSES) as ClassId[], rng);
  const breed = pick(BREEDS.filter((b) => b.classId === classId), rng);
  const rarity = rollRarity(rng);
  const [lvlMin, lvlMax] = RARITY_LEVEL_RANGE[rarity];
  const level = randInt(lvlMin, lvlMax, rng);

  const classDef = CLASSES[classId];
  const stats: CrabStats = {
    hp: Math.round(classDef.baseStats.hp + breed.statMod.hp * 5 + classDef.growth.hp * (level - 1)),
    attack: Math.round(classDef.baseStats.attack + breed.statMod.attack + classDef.growth.attack * (level - 1)),
    defense: Math.round(classDef.baseStats.defense + breed.statMod.defense + classDef.growth.defense * (level - 1)),
    speed: Math.round(classDef.baseStats.speed + breed.statMod.speed + classDef.growth.speed * (level - 1)),
    skill: Math.round(classDef.baseStats.skill + breed.statMod.skill + classDef.growth.skill * (level - 1)),
  };

  const statSum = stats.hp / 10 + stats.attack + stats.defense + stats.speed + stats.skill;
  const jitter = 0.85 + rng() * 0.3; // ±15%
  const price = Math.round((RARITY_PRICE_BASE[rarity] * (0.7 + statSum / 400) * jitter) / 50) * 50;

  return {
    genesisNumber,
    id: `genesis_${genesisNumber}`,
    name: makeCrabName(rng),
    faction,
    classId,
    breedId: breed.id,
    breedName: BREEDS_BY_ID[breed.id]?.name ?? breed.name,
    rarity,
    level,
    stats,
    price,
    listed: genesisNumber <= GENESIS_MARKET_COUNT,
    artFile: pick(GENESIS_ART_FILES, rng),
    seed: GENESIS_SEED + genesisNumber * 7919,
  };
}

let cache: GenesisCrab[] | null = null;

/** The full 333-crab Genesis collection (deterministic, cached). */
export function generateGenesisCrabs(): GenesisCrab[] {
  if (cache) return cache;
  const rng = mulberry32(GENESIS_SEED);
  const out: GenesisCrab[] = [];
  for (let n = 1; n <= GENESIS_TOTAL; n++) {
    out.push(buildGenesisCrab(n, rng));
  }
  cache = out;
  return out;
}

export function getGenesisCrab(genesisNumber: number): GenesisCrab | undefined {
  return generateGenesisCrabs().find((g) => g.genesisNumber === genesisNumber);
}

/** Market-listed Genesis crabs that have not been sold yet. */
export function genesisAvailableListings(soldIds: readonly string[]): GenesisCrab[] {
  const sold = new Set(soldIds);
  return generateGenesisCrabs().filter((g) => g.listed && !sold.has(g.id));
}

/** Convert a Genesis entry into a playable Crab owned by the player. */
export function genesisToCrab(g: GenesisCrab): Crab {
  const crab = generateCrab({
    seed: g.seed,
    faction: g.faction,
    classId: g.classId,
    breedId: g.breedId,
    level: g.level,
    generation: 0,
    ownerId: "player",
  });
  return {
    ...crab,
    id: `genesis_crab_${g.genesisNumber}`,
    name: g.name,
    visualSeed: g.seed,
  };
}

export type GenesisPurchaseResult =
  | { ok: true; price: number; fee: number; newGold: number; newSoldIds: string[]; crab: GenesisCrab }
  | { ok: false; reason: "not_found" | "not_listed" | "already_sold" | "insufficient_gold" };

/**
 * Pure purchase logic shared by the store action and the unit tests.
 * Buyer pays the listed price; the bazaar fee (CONFIG.bazaarFeePercent) is
 * taken out of the sale proceeds as a sink, matching buyBazaarListing.
 *
 * Genesis crabs are SYSTEM goods: their price floats with the tokenomics
 * price index (economy.ts indexedPrice). `crab.price` stays the BASE
 * price; the effective price is round(base × priceIndex). The default
 * index of 1 reproduces the exact pre-v2 prices.
 */
export function attemptGenesisPurchase(
  gold: number,
  soldIds: readonly string[],
  genesisNumber: number,
  priceIndex: number = 1
): GenesisPurchaseResult {
  const crab = getGenesisCrab(genesisNumber);
  if (!crab) return { ok: false, reason: "not_found" };
  if (!crab.listed) return { ok: false, reason: "not_listed" };
  if (soldIds.includes(crab.id)) return { ok: false, reason: "already_sold" };
  const price = Math.max(0, Math.round(crab.price * priceIndex));
  if (gold < price) return { ok: false, reason: "insufficient_gold" };
  const fee = Math.round(price * CONFIG.bazaarFeePercent);
  return {
    ok: true,
    price,
    fee,
    newGold: gold - price,
    newSoldIds: [...soldIds, crab.id],
    crab,
  };
}
