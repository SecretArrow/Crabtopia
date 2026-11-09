// "Very alive" round (2026-11-08): ambient layout determinism +
// hatching exactly-once at the store level.
import { describe, it, expect, beforeEach } from "vitest";
import {
  ambientBubbles,
  ambientMotes,
  AMBIENT_COUNTS,
} from "../../src/game/engine/ambient";
import { useGame } from "../../src/game/store/gameStore";
import type { Egg } from "../../src/game/types";

describe("ambient layout (engine/ambient.ts)", () => {
  it("is deterministic for the same seed", () => {
    expect(ambientBubbles(1234, 10)).toEqual(ambientBubbles(1234, 10));
    expect(ambientMotes(999, 8)).toEqual(ambientMotes(999, 8));
  });

  it("differs across seeds", () => {
    expect(ambientBubbles(1, 10)).not.toEqual(ambientBubbles(2, 10));
  });

  it("caps counts at the desktop maximums", () => {
    expect(ambientBubbles(7, 99)).toHaveLength(
      AMBIENT_COUNTS.desktop.bubbles
    );
    expect(ambientMotes(7, 99)).toHaveLength(AMBIENT_COUNTS.desktop.motes);
    expect(ambientBubbles(7, 0)).toHaveLength(0);
  });

  it("keeps every bubble in range", () => {
    for (const b of ambientBubbles(42, 14)) {
      expect(b.leftPct).toBeGreaterThanOrEqual(0);
      expect(b.leftPct).toBeLessThanOrEqual(100);
      expect(b.sizePx).toBeGreaterThanOrEqual(4);
      expect(b.sizePx).toBeLessThanOrEqual(14);
      expect(b.durationS).toBeGreaterThanOrEqual(14);
      expect(b.durationS).toBeLessThanOrEqual(26);
      expect(b.delayS).toBeGreaterThanOrEqual(0);
      expect(b.delayS).toBeLessThanOrEqual(12);
      expect(b.opacity).toBeGreaterThanOrEqual(0.25);
      expect(b.opacity).toBeLessThanOrEqual(0.6);
    }
  });
});

describe("hatching exactly-once (store hatchEggNow)", () => {
  function setupPlayerWithEgg(): Egg {
    localStorage.clear();
    useGame.getState().resetGame();
    useGame.getState().initPlayer("Tester");
    const p = useGame.getState().player!;
    const [c1, c2] = p.crabs;
    const egg: Egg = {
      id: "egg_test_1",
      parentId: [c1.id, c2.id],
      faction: c1.faction,
      classId: c1.classId,
      genePreview: c1.genes,
      hatchTime: Date.now() - 1000,
      createdTime: Date.now() - 60000,
      ownerId: "player",
      name: "Test Egg",
      isLegendaryCandidate: false,
    };
    useGame.setState({ player: { ...p, eggs: [egg] } });
    return egg;
  }

  beforeEach(() => {
    localStorage.clear();
  });

  it("hatches exactly one crab; a second hatch of the same egg is a no-op", () => {
    const egg = setupPlayerWithEgg();
    const before = useGame.getState().player!.crabs.length;
    useGame.getState().hatchEggNow(egg.id);
    const afterFirst = useGame.getState().player!;
    expect(afterFirst.crabs).toHaveLength(before + 1);
    expect(afterFirst.eggs).toHaveLength(0);
    const child = afterFirst.crabs[afterFirst.crabs.length - 1];
    expect(child.id).toBe(`crab_hatched_${egg.id}`);
    // The egg is gone, so hatching again must create nothing.
    useGame.getState().hatchEggNow(egg.id);
    expect(useGame.getState().player!.crabs).toHaveLength(before + 1);
  });

  it("the hatched child is deterministic from the egg id", () => {
    const egg = setupPlayerWithEgg();
    useGame.getState().hatchEggNow(egg.id);
    const childA = useGame.getState().player!.crabs.at(-1)!;
    // Fresh player, the IDENTICAL egg object (starter crabs are
    // randomly generated per initPlayer, so re-deriving the egg would
    // change its gene preview — hold the egg constant instead).
    localStorage.clear();
    useGame.getState().resetGame();
    useGame.getState().initPlayer("Tester");
    const p = useGame.getState().player!;
    useGame.setState({ player: { ...p, eggs: [egg] } });
    useGame.getState().hatchEggNow(egg.id);
    const childB = useGame.getState().player!.crabs.at(-1)!;
    expect(childB.genes).toEqual(childA.genes);
    expect(childB.classId).toBe(childA.classId);
    expect(childB.name).toBe(childA.name);
  });
});
