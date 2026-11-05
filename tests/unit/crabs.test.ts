// Unit tests for crab generation (crabs.ts).
// Pure logic testing — no React rendering.
import { describe, it, expect } from "vitest";
import { generateCrab } from "../../src/game/engine/crabs";
import type { FactionId, ClassId } from "../../src/game/types";

describe("generateCrab", () => {
  it("produces a valid Crab object", () => {
    const c = generateCrab({ seed: 42 });
    expect(c.id).toBeTruthy();
    expect(c.name).toBeTruthy();
    expect(c.faction).toBeTruthy();
    expect(c.classId).toBeTruthy();
    expect(c.breedId).toBeTruthy();
    expect(c.level).toBeGreaterThan(0);
    expect(c.stats.hp).toBeGreaterThan(0);
    expect(c.stats.attack).toBeGreaterThan(0);
    expect(c.stats.defense).toBeGreaterThan(0);
    expect(c.stats.speed).toBeGreaterThan(0);
    expect(c.stats.skill).toBeGreaterThan(0);
    expect(c.genes).toBeTruthy();
    expect(c.visualSeed).toBe(42);
  });

  it("is deterministic by seed", () => {
    const a = generateCrab({ seed: 123 });
    const b = generateCrab({ seed: 123 });
    expect(a.id).toBe(b.id);
    expect(a.name).toBe(b.name);
    expect(a.faction).toBe(b.faction);
    expect(a.classId).toBe(b.classId);
    expect(a.breedId).toBe(b.breedId);
    expect(a.stats).toEqual(b.stats);
  });

  it("different seeds produce different crabs", () => {
    const a = generateCrab({ seed: 1 });
    const b = generateCrab({ seed: 2 });
    expect(a.id).not.toBe(b.id);
  });

  it("respects forced faction and class", () => {
    const faction: FactionId = "coral_court";
    const classId: ClassId = "bulwark";
    const c = generateCrab({ seed: 99, faction, classId });
    expect(c.faction).toBe(faction);
    expect(c.classId).toBe(classId);
  });

  it("level scales stats upward", () => {
    const lvl1 = generateCrab({ seed: 5, level: 1 });
    const lvl20 = generateCrab({ seed: 5, level: 20 });
    expect(lvl20.stats.hp).toBeGreaterThan(lvl1.stats.hp);
    expect(lvl20.stats.attack).toBeGreaterThanOrEqual(lvl1.stats.attack);
  });

  it("respects isRookie flag (level 1)", () => {
    const c = generateCrab({ seed: 7, isRookie: true });
    expect(c.level).toBe(1);
    expect(c.isRookie).toBe(true);
  });

  it("records parentIds when provided", () => {
    const c = generateCrab({
      seed: 11,
      parentIds: ["crab_a", "crab_b"],
    });
    expect(c.parentIds).toEqual(["crab_a", "crab_b"]);
  });

  it("records generation when provided", () => {
    const c = generateCrab({ seed: 13, generation: 3 });
    expect(c.generation).toBe(3);
  });
});
