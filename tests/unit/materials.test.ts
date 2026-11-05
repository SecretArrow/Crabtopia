// Unit tests for materials data (materials.ts).
// Pure logic testing — no React rendering.
import { describe, it, expect } from "vitest";
import {
  MATERIALS,
  RECIPES,
  MINING_NODES,
  MATERIAL_LIST,
  RECIPE_LIST,
  rollNodeDrops,
  canCraft,
  mergeMaterials,
  type MaterialId,
  type ItemId,
} from "../../src/game/data/materials";
import { mulberry32 } from "../../src/game/engine/rng";

describe("MATERIALS", () => {
  it("has 6 materials", () => {
    expect(MATERIAL_LIST).toHaveLength(6);
  });

  it("all materials have valid fields", () => {
    for (const m of MATERIAL_LIST) {
      expect(m.id).toBeTruthy();
      expect(m.name).toBeTruthy();
      expect(m.icon).toBeTruthy();
      expect(m.rarity).toBeTruthy();
      expect(m.description).toBeTruthy();
      expect(m.source).toBeTruthy();
    }
  });

  it("covers the 6 spec'd material ids", () => {
    const ids = MATERIAL_LIST.map((m) => m.id).sort();
    expect(ids).toEqual(
      [
        "abyssal_gem",
        "crystal_dust",
        "gold_nugget",
        "iron_ore",
        "kelp_fiber",
        "pearl_shard",
      ].sort()
    );
  });
});

describe("RECIPES", () => {
  it("has 6 recipes", () => {
    expect(RECIPE_LIST).toHaveLength(6);
  });

  it("every recipe requires at least 1 material", () => {
    for (const r of RECIPE_LIST) {
      const totalMats = Object.values(r.materials).reduce((s, n) => s + n, 0);
      expect(totalMats).toBeGreaterThan(0);
    }
  });

  it("every recipe has an effect", () => {
    for (const r of RECIPE_LIST) {
      expect(r.effect).toBeTruthy();
      expect(r.effect.type).toBeTruthy();
    }
  });

  it("covers the 6 spec'd item ids", () => {
    const ids = RECIPE_LIST.map((r) => r.id).sort();
    expect(ids).toEqual(
      [
        "energy_brew",
        "legendary_lure",
        "lucky_charm",
        "shell_polish",
        "sharpening_stone",
        "tide_amulet",
      ].sort()
    );
  });
});

describe("MINING_NODES", () => {
  it("has 3 mining nodes", () => {
    expect(MINING_NODES).toHaveLength(3);
  });

  it("every node has drops, energy cost, and cooldown", () => {
    for (const n of MINING_NODES) {
      expect(n.drops.length).toBeGreaterThan(0);
      expect(n.energyCost).toBeGreaterThan(0);
      expect(n.cooldownMs).toBeGreaterThan(0);
    }
  });

  it("covers the 3 spec'd node ids", () => {
    const ids = MINING_NODES.map((n) => n.id).sort();
    expect(ids).toEqual(
      ["crystal_vault", "kelp_ridge", "pearl_cavern"].sort()
    );
  });
});

describe("rollNodeDrops", () => {
  it("returns an object map of materialId → count", () => {
    const node = MINING_NODES[0];
    for (let i = 0; i < 10; i++) {
      const rng = mulberry32(i);
      const drops = rollNodeDrops(node, rng);
      // Each drop entry should have a valid materialId and a positive count.
      for (const [materialId, count] of Object.entries(drops)) {
        expect(materialId).toBeTruthy();
        expect(count).toBeGreaterThan(0);
      }
    }
  });

  it("only yields materials declared in the node's drop table", () => {
    const node = MINING_NODES[0];
    const validIds = new Set(node.drops.map((d) => d.materialId));
    const rng = mulberry32(123);
    const drops = rollNodeDrops(node, rng);
    for (const materialId of Object.keys(drops)) {
      expect(validIds.has(materialId as MaterialId)).toBe(true);
    }
  });

  it("is deterministic given the same rng", () => {
    const node = MINING_NODES[1];
    const drops1 = rollNodeDrops(node, mulberry32(77));
    const drops2 = rollNodeDrops(node, mulberry32(77));
    expect(drops1).toEqual(drops2);
  });
});

describe("canCraft", () => {
  it("returns true when inventory has enough materials", () => {
    const recipe = RECIPE_LIST[0];
    // Build inventory that exactly satisfies this recipe.
    const inventory = { ...recipe.materials };
    expect(canCraft(inventory, recipe)).toBe(true);
  });

  it("returns false when inventory lacks materials", () => {
    const recipe = RECIPE_LIST[0];
    const emptyInventory: Partial<Record<MaterialId, number>> = {};
    expect(canCraft(emptyInventory, recipe)).toBe(false);
  });

  it("returns true when inventory exceeds requirements", () => {
    const recipe = RECIPE_LIST[0];
    const inventory: Partial<Record<MaterialId, number>> = {};
    // Provide more than enough of every required material.
    for (const [k, v] of Object.entries(recipe.materials) as [
      MaterialId,
      number
    ][]) {
      if (v > 0) inventory[k] = v + 10;
    }
    expect(canCraft(inventory, recipe)).toBe(true);
  });
});

describe("mergeMaterials", () => {
  it("sums counts of the same material across both maps", () => {
    const a: Partial<Record<MaterialId, number>> = { kelp_fiber: 2, iron_ore: 1 };
    const b: Partial<Record<MaterialId, number>> = { kelp_fiber: 3, pearl_shard: 4 };
    const merged = mergeMaterials(a, b);
    expect(merged.kelp_fiber).toBe(5);
    expect(merged.iron_ore).toBe(1);
    expect(merged.pearl_shard).toBe(4);
  });

  it("handles empty inputs", () => {
    expect(mergeMaterials({}, {})).toEqual({});
    expect(mergeMaterials({ kelp_fiber: 5 }, {})).toEqual({ kelp_fiber: 5 });
  });
});
