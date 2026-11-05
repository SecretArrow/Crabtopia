// Crabtopia — the 18 Elements (original ocean-kingdom nature system)
// ---------------------------------------------------------------------------
// Every crab carries ONE element. Elements are an original system with
// ocean-kingdom names; the Indonesian kind label (Api, Air, …) is shown
// as a sub-label in UI ("Vulkara · Api").
//
//   Basic (5):    Vulkara (Api) · Nerala (Air) · Bentala (Tanah) ·
//                 Lintara (Petir) · Anila (Angin)
//   Combined (7): Himara (Es) = Nerala+Anila · Rimba (Kayu) = Nerala+Bentala ·
//                 Magmara (Lava) = Vulkara+Bentala · Taufan (Badai) = Nerala+Lintara ·
//                 Dentuma (Ledakan) = Lintara+Bentala · Vapora (Uap) = Vulkara+Nerala ·
//                 Lodara (Magnet) = Anila+Bentala
//   Special (6):  Pulvara (Debu) · Terika (Panas) · Obsidara (Api Hitam) ·
//                 Prismara (Kristal) · Andhakara (Kegelapan) · Waja (Baja)
//
// Elements come from three sources:
//   1. A stored `element` field on the crab (set at creation/breeding).
//   2. Deterministic derivation for legacy crabs without the field
//      (resolveElement — faction/class based, so old saves, opponents
//      and Genesis crabs are consistent forever).
//   3. Breeding rolls (rollChildElement): recipe pairs can produce the
//      combined element, children inherit or break down to components,
//      and special elements appear ONLY as rare mutations.
//
// Presentation rule: elements are UI badges + battle math only. Crab
// artwork is never redrawn with element props/effects baked in.

import type { ClassId, Crab, ElementId, FactionId } from "../types";

export type { ElementId };
export type BasicElementId = "vulkara" | "nerala" | "bentala" | "lintara" | "anila";
export type CombinedElementId =
  | "himara" | "rimba" | "magmara" | "taufan" | "dentuma" | "vapora" | "lodara";
export type SpecialElementId =
  | "pulvara" | "terika" | "obsidara" | "prismara" | "andhakara" | "waja";
export type ElementCategory = "basic" | "combined" | "special";

export interface ElementDef {
  id: ElementId;
  /** Original ocean-kingdom name, e.g. "Vulkara". */
  name: string;
  /** Indonesian kind label shown as sub-label, e.g. "Api". */
  kind: string;
  category: ElementCategory;
  /** Badge accent colour (hex). */
  color: string;
  /** The two basic components for combined elements. */
  components?: readonly [BasicElementId, BasicElementId];
}

export const ELEMENTS: Record<ElementId, ElementDef> = {
  // --- Basic -------------------------------------------------------------
  vulkara: { id: "vulkara", name: "Vulkara", kind: "Api", category: "basic", color: "#EF4444" },
  nerala: { id: "nerala", name: "Nerala", kind: "Air", category: "basic", color: "#3B82F6" },
  bentala: { id: "bentala", name: "Bentala", kind: "Tanah", category: "basic", color: "#B45309" },
  lintara: { id: "lintara", name: "Lintara", kind: "Petir", category: "basic", color: "#EAB308" },
  anila: { id: "anila", name: "Anila", kind: "Angin", category: "basic", color: "#10B981" },
  // --- Combined ------------------------------------------------------------
  himara: { id: "himara", name: "Himara", kind: "Es", category: "combined", color: "#22D3EE", components: ["nerala", "anila"] },
  rimba: { id: "rimba", name: "Rimba", kind: "Kayu", category: "combined", color: "#65A30D", components: ["nerala", "bentala"] },
  magmara: { id: "magmara", name: "Magmara", kind: "Lava", category: "combined", color: "#F97316", components: ["vulkara", "bentala"] },
  taufan: { id: "taufan", name: "Taufan", kind: "Badai", category: "combined", color: "#8B5CF6", components: ["nerala", "lintara"] },
  dentuma: { id: "dentuma", name: "Dentuma", kind: "Ledakan", category: "combined", color: "#EC4899", components: ["lintara", "bentala"] },
  vapora: { id: "vapora", name: "Vapora", kind: "Uap", category: "combined", color: "#CBD5E1", components: ["vulkara", "nerala"] },
  lodara: { id: "lodara", name: "Lodara", kind: "Magnet", category: "combined", color: "#64748B", components: ["anila", "bentala"] },
  // --- Special -------------------------------------------------------------
  pulvara: { id: "pulvara", name: "Pulvara", kind: "Debu", category: "special", color: "#A8A29E" },
  terika: { id: "terika", name: "Terika", kind: "Panas", category: "special", color: "#FF5C39" },
  obsidara: { id: "obsidara", name: "Obsidara", kind: "Api Hitam", category: "special", color: "#581C87" },
  prismara: { id: "prismara", name: "Prismara", kind: "Kristal", category: "special", color: "#D946EF" },
  andhakara: { id: "andhakara", name: "Andhakara", kind: "Kegelapan", category: "special", color: "#1F2937" },
  waja: { id: "waja", name: "Waja", kind: "Baja", category: "special", color: "#9CA3AF" },
};

/** All 18 elements in display order (basic → combined → special). */
export const ELEMENT_LIST: ElementDef[] = [
  ELEMENTS.vulkara, ELEMENTS.nerala, ELEMENTS.bentala, ELEMENTS.lintara, ELEMENTS.anila,
  ELEMENTS.himara, ELEMENTS.rimba, ELEMENTS.magmara, ELEMENTS.taufan, ELEMENTS.dentuma,
  ELEMENTS.vapora, ELEMENTS.lodara,
  ELEMENTS.pulvara, ELEMENTS.terika, ELEMENTS.obsidara, ELEMENTS.prismara,
  ELEMENTS.andhakara, ELEMENTS.waja,
];

export const BASIC_ELEMENTS: BasicElementId[] = [
  "vulkara", "nerala", "bentala", "lintara", "anila",
];

export function isBasic(id: ElementId): id is BasicElementId {
  return ELEMENTS[id].category === "basic";
}
export function isCombined(id: ElementId): id is CombinedElementId {
  return ELEMENTS[id].category === "combined";
}
export function isSpecial(id: ElementId): id is SpecialElementId {
  return ELEMENTS[id].category === "special";
}

/** Basic components of an element (a basic element is its own lineage). */
export function componentsOf(id: ElementId): BasicElementId[] {
  const def = ELEMENTS[id];
  if (def.category === "basic") return [id as BasicElementId];
  if (def.category === "combined" && def.components) return [...def.components];
  return [];
}

// ---------------------------------------------------------------------------
// Combination recipes (combined elements)
// ---------------------------------------------------------------------------

const RECIPE_TABLE: Record<string, CombinedElementId> = {};
for (const def of ELEMENT_LIST) {
  if (def.category === "combined" && def.components) {
    const [a, b] = def.components;
    RECIPE_TABLE[[a, b].sort().join("+")] = def.id as CombinedElementId;
  }
}

/** The combined element two DIFFERENT basic elements fuse into, if any. */
export function combinationOf(a: ElementId, b: ElementId): CombinedElementId | null {
  if (a === b || !isBasic(a) || !isBasic(b)) return null;
  return RECIPE_TABLE[[a, b].sort().join("+")] ?? null;
}

/** All 7 documented recipes, for the Codex and tests. */
export const COMBINATION_RECIPES: {
  result: CombinedElementId;
  components: readonly [BasicElementId, BasicElementId];
}[] = ELEMENT_LIST.filter(
  (d) => d.category === "combined" && d.components,
).map((d) => ({
  result: d.id as CombinedElementId,
  components: d.components!,
}));

// ---------------------------------------------------------------------------
// Special mutation affinities (breeding only)
// ---------------------------------------------------------------------------

/**
 * Which special elements a basic bloodline can mutate into while
 * breeding. Andhakara (Kegelapan) is special-cased: the deep-sea dark
 * can surface from ANY bloodline, so it is added to every pool.
 */
export const SPECIAL_MUTATIONS: Record<BasicElementId, SpecialElementId[]> = {
  vulkara: ["obsidara", "terika"],
  nerala: ["prismara"],
  bentala: ["pulvara", "waja"],
  lintara: ["terika"],
  anila: ["pulvara"],
};

/** The special-mutation pool for a pair of parent elements. */
export function mutationPoolFor(a: ElementId, b: ElementId): SpecialElementId[] {
  const pool = new Set<SpecialElementId>(["andhakara"]);
  for (const parent of [a, b]) {
    for (const basic of componentsOf(parent)) {
      for (const sp of SPECIAL_MUTATIONS[basic]) pool.add(sp);
    }
  }
  return [...pool];
}

// ---------------------------------------------------------------------------
// Deterministic resolution for crabs without a stored element
// ---------------------------------------------------------------------------

/** Home element per faction (the realm's dominant nature). */
export const FACTION_ELEMENT: Record<FactionId, ElementId> = {
  cinderreef: "vulkara",
  frostshelf: "himara",
  stormwake: "lintara",
  mangrove: "rimba",
  moonpool: "nerala",
  coral_court: "nerala",
};

export interface ElementIdentity {
  classId: ClassId;
  faction: FactionId;
  breedId?: string;
  isRookie?: boolean;
  /** The crab's own id — drives the per-crab legacy variation below. */
  id?: string;
}

/**
 * Per-crab variation options for legacy crabs (no stored element):
 * [home, home, neighbour] — the faction's home element stays the
 * majority outcome (2 of 3 slots); the neighbour is a flavoured
 * relative of home (a fusion containing it, one of its components,
 * or — for the Coral Court — the court's crystal).
 */
const LEGACY_ELEMENT_OPTIONS: Record<
  FactionId,
  [ElementId, ElementId, ElementId]
> = {
  cinderreef: ["vulkara", "vulkara", "magmara"],
  frostshelf: ["himara", "himara", "nerala"],
  stormwake: ["lintara", "lintara", "taufan"],
  mangrove: ["rimba", "rimba", "bentala"],
  moonpool: ["nerala", "nerala", "vapora"],
  coral_court: ["nerala", "nerala", "prismara"],
};

/** FNV-1a 32-bit hash of a crab id (stable across runs and platforms). */
function hashCrabId(id: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Deterministic element for any crab identity. Rules, in order:
 *   1. Shadow/legendary breeds → Andhakara (Kegelapan). Absolute.
 *   2. Gildclaw class exception → Waja (Baja): the golden steel-clawed.
 *      Absolute.
 *   3. With an id: per-crab variation — an FNV-1a hash of the id picks
 *      from the faction's [home, home, neighbour] options, so two
 *      legacy crabs of the same faction + class usually share the home
 *      element but CAN differ. Pure function of the crab: stable
 *      across reloads, no save migration (the stored `element` field,
 *      when present, still wins via elementOf).
 *   4. Without an id: the faction's home element.
 */
export function resolveElement(identity: ElementIdentity): ElementId {
  if (identity.breedId && /shadow|legendary/i.test(identity.breedId)) {
    return "andhakara";
  }
  if (identity.classId === "gildclaw") return "waja";
  if (identity.id) {
    const options = LEGACY_ELEMENT_OPTIONS[identity.faction];
    return options[hashCrabId(identity.id) % options.length];
  }
  return FACTION_ELEMENT[identity.faction];
}

/** A crab's element: the stored field when present, else derived. */
export function elementOf(crab: Crab): ElementId {
  return crab.element ?? resolveElement(crab);
}

// ---------------------------------------------------------------------------
// Effectiveness (damage) — one helper shared by arena + raid engines
// ---------------------------------------------------------------------------

/**
 * Basic cycle: Vulkara > Anila > Lintara > Bentala > Nerala > Vulkara.
 * (Api mengalahkan Angin, Angin mengalahkan Petir, Petir mengalahkan
 * Tanah, Tanah mengalahkan Air, Air mengalahkan Api.)
 */
const BASIC_BEATS: Record<BasicElementId, BasicElementId> = {
  vulkara: "anila",
  anila: "lintara",
  lintara: "bentala",
  bentala: "nerala",
  nerala: "vulkara",
};

/**
 * Documented special-element edges (exactly one strong target each,
 * plus Andhakara's darkness over all basic elements). Specials are
 * otherwise neutral — they are rare, not overpowered.
 */
const SPECIAL_STRONG: Partial<Record<SpecialElementId, ElementId[]>> = {
  obsidara: ["vulkara"],
  terika: ["anila"],
  prismara: ["bentala"],
  pulvara: ["lintara"],
  waja: ["himara"],
  andhakara: [],
};

/**
 * Edge of attacker over defender: +1 strong, -1 weak, 0 neutral.
 * Combined elements strike with both components: strong if any
 * component beats the defender's element(s), weak if any of the
 * defender's components beats any of the attacker's — conflicting
 * components cancel to neutral. The relation is antisymmetric:
 * edge(a, d) === -edge(d, a).
 */
export function elementEdge(attacker: ElementId, defender: ElementId): 1 | 0 | -1 {
  if (isSpecial(attacker) || isSpecial(defender)) {
    if (isSpecial(attacker) && SPECIAL_STRONG[attacker]?.includes(defender)) return 1;
    if (isSpecial(defender) && SPECIAL_STRONG[defender]?.includes(attacker)) return -1;
    if (attacker === "andhakara" && isBasic(defender)) return 1;
    if (defender === "andhakara" && isBasic(attacker)) return -1;
    return 0;
  }
  const atkParts = componentsOf(attacker);
  const defParts = componentsOf(defender);
  let strong = false;
  let weak = false;
  for (const x of atkParts) {
    for (const y of defParts) {
      if (BASIC_BEATS[x] === y) strong = true;
      if (BASIC_BEATS[y] === x) weak = true;
    }
  }
  if (strong && !weak) return 1;
  if (weak && !strong) return -1;
  return 0;
}

export const STRONG_MULTIPLIER = 1.15;
export const WEAK_MULTIPLIER = 0.9;

/** Damage multiplier of an attacker element against a defender element. */
export function effectiveness(attacker: ElementId, defender: ElementId): number {
  const edge = elementEdge(attacker, defender);
  return edge === 1 ? STRONG_MULTIPLIER : edge === -1 ? WEAK_MULTIPLIER : 1;
}

// ---------------------------------------------------------------------------
// Breeding rolls
// ---------------------------------------------------------------------------

/** Chance two different basics with a recipe fuse into the combined element. */
export const COMBINE_CHANCE = 0.4;
/** Rare special-mutation chance while breeding. */
export const SPECIAL_MUTATION_CHANCE = 0.03;
/** Boosted mutation chance when a parent carries a combined/special element. */
export const SPECIAL_MUTATION_CHANCE_BOOSTED = 0.06;

export function specialMutationChance(a: ElementId, b: ElementId): number {
  return isBasic(a) && isBasic(b)
    ? SPECIAL_MUTATION_CHANCE
    : SPECIAL_MUTATION_CHANCE_BOOSTED;
}

/**
 * Roll a child's element from its parents' elements (seeded rng).
 * Order of resolution:
 *   1. Special mutation (3%, or 6% with a combined/special parent):
 *      a special from the parents' bloodline pool.
 *   2. Recipe: two different basics with a recipe fuse at 40%;
 *      otherwise the child inherits one of the two basics (50/50).
 *   3. Same element → that element.
 *   4. General inheritance: each parent's own element weighs 3, each
 *      basic component of a combined parent weighs 1 — children of
 *      combined parents often keep the fusion, sometimes break it
 *      back down to a component. Special parents pass their element
 *      by the same weight (they have no components).
 * The result is ALWAYS one of the 18 elements.
 */
export function rollChildElement(
  a: ElementId,
  b: ElementId,
  rng: () => number,
): ElementId {
  const mutChance = specialMutationChance(a, b);
  if (rng() < mutChance) {
    const pool = mutationPoolFor(a, b);
    if (pool.length > 0) return pool[Math.floor(rng() * pool.length)];
  }
  const recipe = combinationOf(a, b);
  if (recipe) {
    if (rng() < COMBINE_CHANCE) return recipe;
    return rng() < 0.5 ? a : b;
  }
  if (a === b) return a;
  const weighted: ElementId[] = [a, a, a, b, b, b];
  for (const parent of [a, b]) {
    for (const comp of componentsOf(parent)) {
      if (comp !== parent) weighted.push(comp);
    }
  }
  return weighted[Math.floor(rng() * weighted.length)];
}

/** What the Breeding screen shows before confirming a pairing. */
export interface BreedingElementPreview {
  recipe: CombinedElementId | null;
  /** Elements reachable by plain inheritance (incl. breakdown). */
  inherit: ElementId[];
  mutationChance: number;
  mutationPool: SpecialElementId[];
}

export function previewBreedingElements(
  a: ElementId,
  b: ElementId,
): BreedingElementPreview {
  const inherit = new Set<ElementId>([a, b]);
  for (const parent of [a, b]) {
    for (const comp of componentsOf(parent)) inherit.add(comp);
  }
  return {
    recipe: combinationOf(a, b),
    inherit: [...inherit],
    mutationChance: specialMutationChance(a, b),
    mutationPool: mutationPoolFor(a, b),
  };
}
