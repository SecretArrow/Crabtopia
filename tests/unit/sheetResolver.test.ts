// Unit tests for sheetResolver (visual overhaul): EVERY class × faction
// combination must resolve to a real sprite sheet, so no
// screen can fall back to the retired procedural SVG blob or a static PNG.
import { describe, it, expect } from "vitest";
import {
  CLASS_HOME_FACTION,
  resolveSheetDescriptor,
  resolveSheetForCrab,
} from "../../src/game/animation/sheetResolver";
import { CLASS_LIST } from "../../src/game/content/classes";
import { FACTION_LIST } from "../../src/game/content/factions";
import atlasJson from "../../src/game/data/spriteAtlas.json";

const atlas = atlasJson as unknown as { sheets: Record<string, unknown> };

describe("sheetResolver", () => {
  it("resolves a valid atlas sheet for every class × faction", () => {
    for (const cls of CLASS_LIST) {
      for (const faction of FACTION_LIST) {
        const d = resolveSheetDescriptor({ classId: cls.id, faction: faction.id });
        expect(atlas.sheets[d.key], `${cls.id}/${faction.id}`).toBeDefined();
        expect(Number.isFinite(d.hueRotate)).toBe(true);
      }
    }
  });

  it("native class/faction pairings need no tint", () => {
    expect(
      resolveSheetDescriptor({ classId: "reaver", faction: "cinderreef" }).hueRotate,
    ).toBe(0);
    expect(
      resolveSheetDescriptor({ classId: "warden", faction: "frostshelf" }).hueRotate,
    ).toBe(0);
    expect(
      resolveSheetDescriptor({ classId: "pincher", faction: "stormwake" }).hueRotate,
    ).toBe(0);
    expect(
      resolveSheetDescriptor({ classId: "gildclaw", faction: "cinderreef" }).hueRotate,
    ).toBe(0);
    // Limitation fix: the four formerly-derived classes are drawn in
    // their home factions on their own sheets — no tint at home.
    expect(
      resolveSheetDescriptor({ classId: "bulwark", faction: "coral_court" }).hueRotate,
    ).toBe(0);
    expect(
      resolveSheetDescriptor({ classId: "skitter", faction: "stormwake" }).hueRotate,
    ).toBe(0);
    expect(
      resolveSheetDescriptor({ classId: "tidecaller", faction: "moonpool" }).hueRotate,
    ).toBe(0);
    expect(
      resolveSheetDescriptor({ classId: "shellmender", faction: "mangrove" }).hueRotate,
    ).toBe(0);
  });

  it("every class resolves to its OWN dedicated sheet", () => {
    for (const cls of CLASS_LIST) {
      expect(
        resolveSheetForCrab({ classId: cls.id, faction: CLASS_HOME_FACTION[cls.id] }),
        cls.id,
      ).toBe(cls.id);
    }
    // Formerly shared silhouettes (limitation fix): bulwark no longer
    // borrows gildclaw; skitter/tidecaller/shellmender no longer borrow
    // pincher — at ANY faction.
    for (const faction of FACTION_LIST) {
      expect(resolveSheetForCrab({ classId: "bulwark", faction: faction.id })).toBe("bulwark");
      expect(resolveSheetForCrab({ classId: "skitter", faction: faction.id })).toBe("skitter");
      expect(resolveSheetForCrab({ classId: "tidecaller", faction: faction.id })).toBe("tidecaller");
      expect(resolveSheetForCrab({ classId: "shellmender", faction: faction.id })).toBe("shellmender");
    }
  });

  it("off-native factions get a non-zero hue tint", () => {
    const d = resolveSheetDescriptor({ classId: "warden", faction: "cinderreef" });
    expect(d.key).toBe("warden");
    expect(d.hueRotate).not.toBe(0);
  });

  it("identity is class-only: every class resolves to its own sheet at every faction", () => {
    // Rookie rank is not a resolver input at all — the old rookie →
    // kelp-tinted pincher override is gone, so there is no path by
    // which a crab borrows another class's sheet. Pincher sheet is
    // returned for the pincher class only, and every other class
    // always gets its own dedicated sheet (rookie starters included).
    for (const cls of CLASS_LIST) {
      for (const faction of FACTION_LIST) {
        expect(
          resolveSheetForCrab({ classId: cls.id, faction: faction.id }),
          `${cls.id}/${faction.id}`,
        ).toBe(cls.id);
      }
    }
  });

  it("every class has a home faction defined", () => {
    for (const cls of CLASS_LIST) {
      expect(CLASS_HOME_FACTION[cls.id]).toBeTruthy();
    }
  });
});
