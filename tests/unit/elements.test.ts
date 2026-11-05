// Unit tests for the 18-element system (engine/elements.ts):
// definitions, combination recipes, deterministic resolution, breeding
// rolls (fusion / inheritance / breakdown / special mutation), and the
// damage-effectiveness table shared by the arena and raid engines.
import { describe, it, expect } from "vitest";
import {
  COMBINATION_RECIPES,
  COMBINE_CHANCE,
  ELEMENTS,
  ELEMENT_LIST,
  SPECIAL_MUTATION_CHANCE,
  SPECIAL_MUTATION_CHANCE_BOOSTED,
  combinationOf,
  effectiveness,
  elementEdge,
  elementOf,
  isBasic,
  isCombined,
  isSpecial,
  mutationPoolFor,
  previewBreedingElements,
  resolveElement,
  rollChildElement,
} from "../../src/game/engine/elements";
import { mulberry32 } from "../../src/game/engine/rng";
import type { ElementId } from "../../src/game/types";

/** RNG that returns the given values in order, then 0.99 forever. */
function seqRng(values: number[]): () => number {
  let i = 0;
  return () => (i < values.length ? values[i++] : 0.99);
}

describe("element definitions", () => {
  it("defines exactly 18 elements: 5 basic, 7 combined, 6 special", () => {
    expect(ELEMENT_LIST.length).toBe(18);
    expect(ELEMENT_LIST.filter((e) => e.category === "basic").length).toBe(5);
    expect(ELEMENT_LIST.filter((e) => e.category === "combined").length).toBe(7);
    expect(ELEMENT_LIST.filter((e) => e.category === "special").length).toBe(6);
    for (const def of ELEMENT_LIST) {
      expect(ELEMENTS[def.id]).toBe(def);
      expect(def.name.length).toBeGreaterThan(2);
      expect(def.kind.length).toBeGreaterThan(0);
      expect(def.color).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });

  it("keeps Lodara (Magnet) and Pulvara (Debu) as distinct elements", () => {
    expect(ELEMENTS.lodara.kind).toBe("Magnet");
    expect(ELEMENTS.pulvara.kind).toBe("Debu");
    expect(ELEMENTS.lodara.category).toBe("combined");
    expect(ELEMENTS.pulvara.category).toBe("special");
  });
});

describe("combination recipes", () => {
  it("has exactly the 7 documented recipes", () => {
    expect(COMBINATION_RECIPES.length).toBe(7);
    const expected: [string, string, string][] = [
      ["nerala", "anila", "himara"],
      ["nerala", "bentala", "rimba"],
      ["vulkara", "bentala", "magmara"],
      ["nerala", "lintara", "taufan"],
      ["lintara", "bentala", "dentuma"],
      ["vulkara", "nerala", "vapora"],
      ["anila", "bentala", "lodara"],
    ];
    for (const [a, b, result] of expected) {
      expect(combinationOf(a as ElementId, b as ElementId)).toBe(result);
      // Order-insensitive.
      expect(combinationOf(b as ElementId, a as ElementId)).toBe(result);
    }
  });

  it("basic pairs without a recipe, same pairs and non-basics yield null", () => {
    expect(combinationOf("vulkara", "lintara")).toBeNull();
    expect(combinationOf("vulkara", "anila")).toBeNull();
    expect(combinationOf("lintara", "anila")).toBeNull();
    expect(combinationOf("vulkara", "vulkara")).toBeNull();
    expect(combinationOf("himara", "nerala")).toBeNull();
    expect(combinationOf("waja", "nerala")).toBeNull();
  });
});

describe("resolveElement — deterministic derivation", () => {
  it("maps every faction to its documented home element", () => {
    const cases = [
      ["cinderreef", "vulkara"],
      ["frostshelf", "himara"],
      ["stormwake", "lintara"],
      ["mangrove", "rimba"],
      ["moonpool", "nerala"],
      ["coral_court", "nerala"],
    ] as const;
    for (const [faction, expected] of cases) {
      expect(
        resolveElement({ classId: "pincher", faction }),
        faction,
      ).toBe(expected);
    }
  });

  it("gildclaw is the class exception (Waja), shadow breeds are Andhakara", () => {
    expect(
      resolveElement({ classId: "gildclaw", faction: "coral_court" }),
    ).toBe("waja");
    expect(
      resolveElement({
        classId: "pincher",
        faction: "coral_court",
        breedId: "shadow_reaver_x",
      }),
    ).toBe("andhakara");
  });

  it("per-crab variation: same id always resolves the same element", () => {
    for (const id of ["crab-alpha", "crab-beta", "crab-gamma", "npc-42", "gen-7"]) {
      const identity = { classId: "pincher", faction: "cinderreef", id } as const;
      expect(resolveElement(identity), id).toBe(resolveElement(identity));
    }
  });

  it("per-crab variation: two ids of the same faction + class CAN differ", () => {
    // FNV-1a vectors: "crab-beta" lands on a home slot, "crab-gamma"
    // on the neighbour slot of cinderreef's [vulkara, vulkara, magmara].
    expect(
      resolveElement({ classId: "pincher", faction: "cinderreef", id: "crab-beta" }),
    ).toBe("vulkara");
    expect(
      resolveElement({ classId: "pincher", faction: "cinderreef", id: "crab-gamma" }),
    ).toBe("magmara");
  });

  it("per-crab variation: home stays the plurality over 300 ids", () => {
    const counts = new Map<string, number>();
    for (let i = 0; i < 300; i++) {
      const el = resolveElement({
        classId: "warden",
        faction: "cinderreef",
        id: `legacy-crab-${i}`,
      });
      counts.set(el, (counts.get(el) ?? 0) + 1);
    }
    // Only the faction's option set ever appears…
    expect([...counts.keys()].sort()).toEqual(["magmara", "vulkara"]);
    // …the result is not all-identical…
    expect(counts.get("magmara") ?? 0).toBeGreaterThan(0);
    // …and today's mapping (home) remains the plurality.
    expect(counts.get("vulkara") ?? 0).toBeGreaterThan(counts.get("magmara") ?? 0);
  });

  it("per-crab variation: the absolutes stay absolute even with ids", () => {
    // "crab-gamma" would land on the neighbour slot — gildclaw and
    // shadow breeds must ignore the variation entirely.
    expect(
      resolveElement({ classId: "gildclaw", faction: "cinderreef", id: "crab-gamma" }),
    ).toBe("waja");
    expect(
      resolveElement({
        classId: "pincher",
        faction: "cinderreef",
        breedId: "shadow_x",
        id: "crab-gamma",
      }),
    ).toBe("andhakara");
  });

  it("is deterministic and elementOf prefers the stored field", () => {
    const identity = { classId: "warden", faction: "frostshelf" } as const;
    expect(resolveElement(identity)).toBe(resolveElement(identity));
    const crab = {
      ...identity,
      breedId: "frost_warden",
      element: "dentuma",
    } as never;
    expect(elementOf(crab)).toBe("dentuma");
    const legacy = { ...identity, breedId: "frost_warden" } as never;
    expect(elementOf(legacy)).toBe("himara");
  });
});

describe("rollChildElement — breeding", () => {
  it("every recipe pair can fuse into its combined element (forced roll)", () => {
    for (const recipe of COMBINATION_RECIPES) {
      const [a, b] = recipe.components;
      // rng: no mutation (0.99), then a combine roll under COMBINE_CHANCE.
      const child = rollChildElement(a, b, seqRng([0.99, COMBINE_CHANCE / 2]));
      expect(child, `${a}+${b}`).toBe(recipe.result);
    }
  });

  it("recipe pairs otherwise inherit one of the parent basics", () => {
    // No mutation, combine roll fails (0.99), inherit roll picks a / b.
    expect(rollChildElement("vulkara", "nerala", seqRng([0.99, 0.99, 0.3]))).toBe("vulkara");
    expect(rollChildElement("vulkara", "nerala", seqRng([0.99, 0.99, 0.7]))).toBe("nerala");
  });

  it("same-element parents pass the element on", () => {
    expect(rollChildElement("bentala", "bentala", seqRng([0.99]))).toBe("bentala");
    expect(rollChildElement("himara", "himara", seqRng([0.99]))).toBe("himara");
  });

  it("children of a combined parent can inherit it or break it down", () => {
    // himara + vulkara: weighted list is
    // [himara x3, vulkara x3, nerala, anila] (8 entries).
    expect(rollChildElement("himara", "vulkara", seqRng([0.99, 0.0]))).toBe("himara");
    expect(rollChildElement("himara", "vulkara", seqRng([0.99, 0.99]))).toBe("anila");
    expect(rollChildElement("himara", "vulkara", seqRng([0.99, 0.8]))).toBe("nerala");
  });

  it("special mutation can fire and only yields pool specials", () => {
    const pool = mutationPoolFor("vulkara", "nerala");
    expect(pool).toContain("andhakara");
    expect(pool).toContain("obsidara");
    expect(pool).toContain("prismara");
    // Force the mutation roll, take the first pool entry.
    const child = rollChildElement("vulkara", "nerala", seqRng([0.001, 0.0]));
    expect(isSpecial(child)).toBe(true);
    expect(pool).toContain(child);
  });

  it("mutation chance is 3% for basic pairs, 6% with a combined/special parent", () => {
    expect(previewBreedingElements("vulkara", "nerala").mutationChance).toBe(
      SPECIAL_MUTATION_CHANCE,
    );
    expect(previewBreedingElements("himara", "nerala").mutationChance).toBe(
      SPECIAL_MUTATION_CHANCE_BOOSTED,
    );
    expect(previewBreedingElements("waja", "nerala").mutationChance).toBe(
      SPECIAL_MUTATION_CHANCE_BOOSTED,
    );
    expect(previewBreedingElements("vulkara", "nerala").recipe).toBe("vapora");
  });

  it("results always stay within the 18 elements (500 seeded rolls)", () => {
    const pairs: [ElementId, ElementId][] = [
      ["vulkara", "nerala"], ["himara", "taufan"], ["waja", "obsidara"],
      ["bentala", "anila"], ["rimba", "lintara"], ["vapora", "vapora"],
    ];
    for (let seed = 0; seed < 500; seed++) {
      const [a, b] = pairs[seed % pairs.length];
      const child = rollChildElement(a, b, mulberry32(seed * 7 + 1));
      expect(ELEMENTS[child], `seed ${seed}`).toBeTruthy();
    }
  });

  it("seeded distribution roughly matches the documented odds", () => {
    const rng = mulberry32(20261105);
    const N = 4000;
    let combined = 0;
    let special = 0;
    for (let i = 0; i < N; i++) {
      const child = rollChildElement("vulkara", "nerala", rng);
      if (isCombined(child)) combined++;
      if (isSpecial(child)) special++;
    }
    // Recipe fusion ≈ 40% of the non-mutation outcomes (≈ 0.388 overall).
    expect(combined / N).toBeGreaterThan(0.32);
    expect(combined / N).toBeLessThan(0.46);
    // Special mutation ≈ 3%.
    expect(special / N).toBeGreaterThan(0.01);
    expect(special / N).toBeLessThan(0.06);
    expect(isBasic("vulkara")).toBe(true);
  });
});

describe("effectiveness — damage table", () => {
  it("follows the basic cycle: Vulkara>Anila>Lintara>Bentala>Nerala>Vulkara", () => {
    expect(effectiveness("vulkara", "anila")).toBe(1.15);
    expect(effectiveness("anila", "lintara")).toBe(1.15);
    expect(effectiveness("lintara", "bentala")).toBe(1.15);
    expect(effectiveness("bentala", "nerala")).toBe(1.15);
    expect(effectiveness("nerala", "vulkara")).toBe(1.15);
    expect(effectiveness("anila", "vulkara")).toBe(0.9);
    expect(effectiveness("vulkara", "nerala")).toBe(0.9);
    expect(effectiveness("vulkara", "lintara")).toBe(1);
    expect(effectiveness("vulkara", "vulkara")).toBe(1);
  });

  it("is antisymmetric for every pair of the 18 elements", () => {
    for (const a of ELEMENT_LIST) {
      for (const d of ELEMENT_LIST) {
        expect(
          elementEdge(a.id, d.id) + elementEdge(d.id, a.id),
          `${a.id} vs ${d.id}`,
        ).toBe(0);
      }
    }
  });

  it("combined elements strike through their components, conflicts cancel", () => {
    // Magmara (Vulkara+Bentala) vs Anila: Vulkara beats Anila and Anila
    // beats neither component → strong only.
    expect(effectiveness("magmara", "anila")).toBe(1.15);
    // Magmara vs Nerala: Bentala beats Nerala (strong) but Nerala beats
    // Vulkara (weak) → conflict → neutral.
    expect(effectiveness("magmara", "nerala")).toBe(1);
    // Magmara vs Lintara: Lintara beats Bentala → weak only.
    expect(effectiveness("magmara", "lintara")).toBe(0.9);
    // Himara (Nerala+Anila) vs Vulkara: Nerala beats Vulkara (strong) but
    // Vulkara beats Anila (weak) → conflict → neutral.
    expect(effectiveness("himara", "vulkara")).toBe(1);
  });

  it("specials have exactly their documented edges, otherwise neutral", () => {
    expect(effectiveness("obsidara", "vulkara")).toBe(1.15);
    expect(effectiveness("vulkara", "obsidara")).toBe(0.9);
    expect(effectiveness("waja", "himara")).toBe(1.15);
    expect(effectiveness("himara", "waja")).toBe(0.9);
    expect(effectiveness("terika", "bentala")).toBe(1);
    // Andhakara: strong over every basic, weak against none of them,
    // neutral against combined and special elements.
    for (const basic of ["vulkara", "nerala", "bentala", "lintara", "anila"] as ElementId[]) {
      expect(effectiveness("andhakara", basic)).toBe(1.15);
      expect(effectiveness(basic, "andhakara")).toBe(0.9);
    }
    expect(effectiveness("andhakara", "himara")).toBe(1);
    expect(effectiveness("andhakara", "waja")).toBe(1);
  });
});
