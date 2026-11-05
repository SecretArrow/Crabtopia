// Crabtopia - Crab generation factory
import {
  Crab,
  FactionId,
  ClassId,
  BodyPartSlot,
  GeneSlot,
  Rarity,
} from "../types";
import { CLASSES } from "../content/classes";
import { BREEDS_BY_CLASS } from "../content/breeds";
import {
  BODY_PART_SLOTS,
  GENE_POOL,
  LEGENDARY_GENES,
  pickWeightedRarity,
  getGeneVariant,
  computePurity,
} from "../content/bodyparts";
import { mulberry32, pick, randInt, makeCrabName } from "./rng";
import { CONFIG } from "./config";
import { resolveElement } from "./elements";

export interface GenerateOptions {
  faction?: FactionId;
  classId?: ClassId;
  breedId?: string;
  generation?: number;
  ownerId?: string;
  isRookie?: boolean;
  level?: number;
  parentIds?: string[];
  seed?: number;
  forcedRarity?: Rarity;
  allowLegendary?: boolean;
}

export function generateCrab(opts: GenerateOptions = {}): Crab {
  const seed = opts.seed ?? Math.floor(Math.random() * 2 ** 31);
  const rng = mulberry32(seed);

  const faction: FactionId =
    opts.faction ?? pick(
      [
        "coral_court",
        "cinderreef",
        "frostshelf",
        "mangrove",
        "stormwake",
        "moonpool",
      ] as FactionId[],
      rng
    );
  const classId: ClassId =
    opts.classId ??
    pick(
      [
        "bulwark",
        "reaver",
        "skitter",
        "tidecaller",
        "shellmender",
        "pincher",
        "warden",
        "gildclaw",
      ] as ClassId[],
      rng
    );

  const classBreeds = BREEDS_BY_CLASS[classId];
  const breed = opts.breedId
    ? classBreeds.find((b) => b.id === opts.breedId) ?? classBreeds[0]
    : pick(classBreeds, rng);

  // Build genes: dominant + 2 recessive per slot
  // Bias dominant gene toward matching faction/class for purity potential
  const genes: Record<BodyPartSlot, GeneSlot> = {} as Record<
    BodyPartSlot,
    GeneSlot
  >;
  for (const slot of BODY_PART_SLOTS) {
    genes[slot] = makeGeneSlot(slot, faction, classId, rng, opts.allowLegendary ?? false, opts.forcedRarity);
  }

  const purity = computePurity({ faction, classId, genes }, faction, classId);

  const level = opts.level ?? (opts.isRookie ? 1 : randInt(5, 25, rng));
  const classDef = CLASSES[classId];
  const baseStats = {
    hp: classDef.baseStats.hp + breed.statMod.hp * 5,
    attack: classDef.baseStats.attack + breed.statMod.attack,
    defense: classDef.baseStats.defense + breed.statMod.defense,
    speed: classDef.baseStats.speed + breed.statMod.speed,
    skill: classDef.baseStats.skill + breed.statMod.skill,
  };
  // apply level growth
  const stats = {
    hp: Math.round(baseStats.hp + classDef.growth.hp * (level - 1)),
    attack: Math.round(baseStats.attack + classDef.growth.attack * (level - 1)),
    defense: Math.round(
      baseStats.defense + classDef.growth.defense * (level - 1)
    ),
    speed: Math.round(baseStats.speed + classDef.growth.speed * (level - 1)),
    skill: Math.round(baseStats.skill + classDef.growth.skill * (level - 1)),
  };

  const id = `crab_${seed.toString(36)}_${Math.floor(rng() * 1e6).toString(36)}`;
  const name = makeCrabName(rng);

  return {
    id,
    name,
    faction,
    classId,
    breedId: breed.id,
    generation: opts.generation ?? 1,
    level,
    xp: 0,
    stats,
    genes,
    purity,
    breedCount: 0,
    birthTime: Date.now(),
    parentIds: opts.parentIds ?? [],
    visualSeed: seed,
    activity: "idle",
    ownerId: opts.ownerId ?? "player",
    isRookie: opts.isRookie ?? false,
    // Element: derived deterministically at creation (elements.ts).
    element: resolveElement({ classId, faction, breedId: breed.id }),
    masteryBadges: [],
    moltTier: 0,
  };
}

function makeGeneSlot(
  slot: BodyPartSlot,
  faction: FactionId,
  classId: ClassId,
  rng: () => number,
  allowLegendary: boolean,
  forcedRarity?: Rarity
): GeneSlot {
  // ~0.07% chance per part to be legendary if allowed
  let rarity: Rarity;
  if (forcedRarity) {
    rarity = forcedRarity;
  } else if (allowLegendary && rng() < CONFIG.legendaryPartChance) {
    rarity = "legendary";
  } else {
    rarity = pickWeightedRarity(rng, allowLegendary);
  }

  if (rarity === "legendary") {
    const leg = LEGENDARY_GENES[slot];
    // legendary gene in D slot; R1/R2 are random variants
    const pool = GENE_POOL[slot];
    const r1 = pick(pool, rng);
    const r2 = pick(pool, rng);
    return { D: leg.id, R1: r1.id, R2: r2.id, rarity: "legendary" };
  }

  // For non-legendary: bias dominant toward matching faction/class with some randomness
  const matchingGenes = GENE_POOL[slot].filter(
    (g) => g.faction === faction && g.classId === classId && g.rarity === rarity
  );
  const partialMatch = GENE_POOL[slot].filter(
    (g) => (g.faction === faction || g.classId === classId) && g.rarity === rarity
  );
  const pool = GENE_POOL[slot].filter((g) => g.rarity === rarity);

  const dGene =
    matchingGenes.length > 0 && rng() < 0.55
      ? pick(matchingGenes, rng)
      : partialMatch.length > 0 && rng() < 0.7
      ? pick(partialMatch, rng)
      : pick(pool, rng);

  const r1Gene = pick(pool, rng);
  const r2Gene = pick(pool, rng);

  return { D: dGene.id, R1: r1Gene.id, R2: r2Gene.id, rarity };
}

// Get a readable gene label
export function geneLabel(slot: BodyPartSlot, geneId: string): string {
  const v = getGeneVariant(slot, geneId);
  return v ? v.label : geneId;
}
