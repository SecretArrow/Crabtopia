// Crabtopia - Genetics engine for breeding
import {
  Crab,
  Egg,
  BodyPartSlot,
  GeneSlot,
  FactionId,
  ClassId,
} from "../types";
import {
  BODY_PART_SLOTS,
  getGeneVariant,
  computePurity,
  GENE_POOL,
  LEGENDARY_GENES,
  pickWeightedRarity,
} from "../content/bodyparts";
import { BREEDS_BY_CLASS } from "../content/breeds";
import { mulberry32, pick, makeCrabName } from "./rng";
import { CONFIG, BREED_COST_SCHEDULE } from "./config";
import { generateCrab } from "./crabs";
import { elementOf, resolveElement, rollChildElement } from "./elements";

export interface BreedingEligibility {
  eligible: boolean;
  reasons: string[];
}

export function checkBreedingEligibility(a: Crab, b: Crab): BreedingEligibility {
  const reasons: string[] = [];
  if (a.id === b.id) reasons.push("Cannot breed a crab with itself.");
  if (a.breedCount >= CONFIG.maxBreedCount)
    reasons.push(`${a.name} has reached the max breed count (5).`);
  if (b.breedCount >= CONFIG.maxBreedCount)
    reasons.push(`${b.name} has reached the max breed count (5).`);
  // incest check
  if (
    a.parentIds.includes(b.id) ||
    b.parentIds.includes(a.id) ||
    (a.parentIds.length > 0 &&
      b.parentIds.length > 0 &&
      a.parentIds.some((p) => b.parentIds.includes(p)))
  ) {
    reasons.push("Crabs are too closely related (parent/sibling).");
  }
  if (a.activity !== "idle" || b.activity !== "idle") {
    reasons.push("Both crabs must be idle to breed.");
  }
  if (a.isRookie || b.isRookie) {
    reasons.push("Rookie crabs cannot be bred. Graduate them first.");
  }
  return { eligible: reasons.length === 0, reasons };
}

export function breedCost(a: Crab, b: Crab): number {
  const maxCount = Math.max(a.breedCount, b.breedCount);
  return BREED_COST_SCHEDULE[Math.min(maxCount, BREED_COST_SCHEDULE.length - 1)];
}

// Probability distribution for inheriting each gene slot
// Child's D gene comes from: 60% parent A's D, 25% parent A's R1, 15% parent A's R2 OR same from B
// Simplified: 50/50 which parent, then weighted gene pick
const INHERIT_WEIGHTS = { D: 0.6, R1: 0.25, R2: 0.15 };

// Compute gene odds for the Gene Odds screen (display purposes)
export interface GeneOdds {
  slot: BodyPartSlot;
  odds: Array<{ geneId: string; label: string; chance: number; rarity: string }>;
  legendaryChance: number;
  mutationChance: number;
}

export function computeGeneOdds(a: Crab, b: Crab): GeneOdds[] {
  return BODY_PART_SLOTS.map((slot) => {
    const oddsMap = new Map<string, { chance: number; label: string; rarity: string }>();

    // each parent contributes 50%
    for (const parent of [a, b]) {
      const slotGenes = parent.genes[slot];
      const genes = [
        { id: slotGenes.D, weight: INHERIT_WEIGHTS.D },
        { id: slotGenes.R1, weight: INHERIT_WEIGHTS.R1 },
        { id: slotGenes.R2, weight: INHERIT_WEIGHTS.R2 },
      ];
      for (const g of genes) {
        const v = getGeneVariant(slot, g.id);
        const label = v ? v.label : g.id;
        const rarity = v ? v.rarity : "common";
        const existing = oddsMap.get(g.id);
        const chance = 0.5 * g.weight;
        if (existing) {
          existing.chance += chance;
        } else {
          oddsMap.set(g.id, { chance, label, rarity });
        }
      }
    }

    const legendaryChance = CONFIG.legendaryPartChance;
    const mutationChance = CONFIG.mutationChance;

    // normalize and subtract legendary chance from the rest
    const oddsArr = Array.from(oddsMap.entries()).map(([geneId, v]) => ({
      geneId,
      label: v.label,
      chance: v.chance * (1 - legendaryChance) * (1 - mutationChance),
      rarity: v.rarity,
    }));

    return {
      slot,
      odds: oddsArr.sort((x, y) => y.chance - x.chance),
      legendaryChance,
      mutationChance,
    };
  });
}

// Actually breed two crabs into an egg
export function breedCrabs(a: Crab, b: Crab, ownerId: string, seed?: number): Egg {
  const s = seed ?? Math.floor(Math.random() * 2 ** 31);
  const rng = mulberry32(s);

  const genePreview: Record<BodyPartSlot, GeneSlot> = {} as Record<
    BodyPartSlot,
    GeneSlot
  >;

  // Determine child faction/class from dominant genes (weighted by parent factions)
  // Simplified: 50/50 between parents' factions, same for class
  const childFaction: FactionId = rng() < 0.5 ? a.faction : b.faction;
  const childClass: ClassId = rng() < 0.5 ? a.classId : b.classId;

  for (const slot of BODY_PART_SLOTS) {
    // mutation chance: replace with random variant
    if (rng() < CONFIG.mutationChance) {
      const pool = GENE_POOL[slot];
      const mut = pick(pool, rng);
      genePreview[slot] = {
        D: mut.id,
        R1: pick(pool, rng).id,
        R2: pick(pool, rng).id,
        rarity: mut.rarity,
      };
      continue;
    }
    // legendary chance
    if (rng() < CONFIG.legendaryPartChance) {
      const leg = LEGENDARY_GENES[slot];
      const pool = GENE_POOL[slot];
      genePreview[slot] = {
        D: leg.id,
        R1: pick(pool, rng).id,
        R2: pick(pool, rng).id,
        rarity: "legendary",
      };
      continue;
    }

    // inherit from random parent
    const parent = rng() < 0.5 ? a : b;
    const slotGenes = parent.genes[slot];
    const r = rng();
    let dGene: string;
    if (r < INHERIT_WEIGHTS.D) dGene = slotGenes.D;
    else if (r < INHERIT_WEIGHTS.D + INHERIT_WEIGHTS.R1) dGene = slotGenes.R1;
    else dGene = slotGenes.R2;

    // R1/R2 from either parent's genes randomly
    const otherParent = parent === a ? b : a;
    const allGenes = [
      slotGenes.D,
      slotGenes.R1,
      slotGenes.R2,
      otherParent.genes[slot].D,
      otherParent.genes[slot].R1,
      otherParent.genes[slot].R2,
    ];
    const r1 = pick(allGenes, rng);
    const r2 = pick(allGenes, rng);
    const v = getGeneVariant(slot, dGene);
    genePreview[slot] = {
      D: dGene,
      R1: r1,
      R2: r2,
      rarity: v ? v.rarity : "common",
    };
  }

  const isLegendaryCandidate = BODY_PART_SLOTS.some(
    (s) => genePreview[s].rarity === "legendary"
  );

  const id = `egg_${s.toString(36)}_${Math.floor(rng() * 1e6).toString(36)}`;
  // Element roll LAST, after every other rng draw, so existing seeded
  // gene outcomes are undisturbed: recipe fusion / inheritance /
  // breakdown / rare special mutation (see engine/elements.ts).
  const childElement = rollChildElement(elementOf(a), elementOf(b), rng);
  return {
    id,
    parentId: [a.id, b.id],
    faction: childFaction,
    classId: childClass,
    element: childElement,
    genePreview,
    hatchTime: Date.now() + CONFIG.eggHatchMs,
    createdTime: Date.now(),
    ownerId,
    name: makeCrabName(rng),
    isLegendaryCandidate,
  };
}

// Hatch an egg into a crab
export function hatchEgg(egg: Egg): Crab {
  const rng = mulberry32(hashStr(egg.id));
  const classBreeds = BREEDS_BY_CLASS[egg.classId];
  const breed = pick(classBreeds, rng);

  // Use the gene preview as the hatched crab's genes
  const purity = computePurity(
    { faction: egg.faction, classId: egg.classId, genes: egg.genePreview },
    egg.faction,
    egg.classId
  );

  // build stats similar to generateCrab but using egg's faction/class
  // Actually simpler: use generateCrab then override genes/faction/class
  const crab: Crab = generateCrab({
    faction: egg.faction,
    classId: egg.classId,
    breedId: breed.id,
    generation: 2, // bred crabs are generation 2+
    ownerId: egg.ownerId,
    level: 1,
    parentIds: egg.parentId,
    seed: hashStr(egg.id),
  });
  crab.genes = egg.genePreview;
  crab.purity = purity;
  crab.name = egg.name;
  crab.birthTime = Date.now();
  crab.id = `crab_hatched_${egg.id}`;
  // The element rolled at breed time hatches with the crab; eggs laid
  // before the element system derive it deterministically instead.
  crab.element = egg.element ?? resolveElement(crab);

  return crab;
}

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
