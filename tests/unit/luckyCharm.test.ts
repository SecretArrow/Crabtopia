// Lucky Charm copy vs effect (2026-11-07 logic audit): the item
// promised "+5% drop rate for the next 3 explorations", but the only
// implementation (ExplorationScreen) grants +1 bonus material per
// treasure chest and spends one charge per CHEST — the percent value
// is never read anywhere. Copy was aligned to the implemented effect
// (no balance change); this test pins the item description to it.
import { describe, it, expect } from "vitest";
import { RECIPES } from "../../src/game/data/materials";

describe("lucky_charm", () => {
  it("description states the implemented effect, not a drop-rate percent", () => {
    const desc = RECIPES.lucky_charm.description;
    expect(desc).not.toMatch(/drop rate/i);
    expect(desc).not.toMatch(/%/);
    expect(desc).toMatch(/\+1 bonus material/i);
    expect(desc).toMatch(/3 treasure chests/i);
  });

  it("still carries 3 charges", () => {
    const effect = RECIPES.lucky_charm.effect;
    expect(effect.type).toBe("drop_rate");
    if (effect.type === "drop_rate") expect(effect.charges).toBe(3);
  });
});
