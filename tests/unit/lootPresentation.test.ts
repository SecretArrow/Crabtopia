// Unit tests for the watched-dig / loot-reveal round:
//  - rarity tiers by reference value (engine/lootReveal.ts)
//  - the reveal timeline: ~1s per item, bounded [4s, 12s], ordered
//  - gold pops split exactly
//  - peekDiveReward is PURE (the scene can open/close forever without
//    claiming) and its net is exactly what claimDive grants — watched
//    ≡ direct claim — and a dive still pays exactly once.
import { describe, it, expect, beforeEach } from "vitest";
import { useGame } from "../../src/game/store/gameStore";
import {
  lootTierForValue,
  buildRevealTimeline,
  splitGoldPops,
} from "../../src/game/engine/lootReveal";
import { peekDiveReward } from "../../src/game/engine/diveReward";

function freshPlayer() {
  useGame.getState().resetGame();
  useGame.getState().initPlayer("Tester");
  return useGame.getState();
}

function player() {
  return useGame.getState().player!;
}

beforeEach(() => {
  localStorage.clear();
  freshPlayer();
});

describe("loot rarity tiers (by reference value)", () => {
  it("maps the boundary values to the right tiers", () => {
    expect(lootTierForValue(0).id).toBe("common");
    expect(lootTierForValue(40).id).toBe("common"); // kelp fiber
    expect(lootTierForValue(99).id).toBe("common");
    expect(lootTierForValue(100).id).toBe("rare");
    expect(lootTierForValue(120).id).toBe("rare"); // pearl shard
    expect(lootTierForValue(299).id).toBe("rare");
    expect(lootTierForValue(300).id).toBe("epic"); // crystal dust
    expect(lootTierForValue(500).id).toBe("epic"); // gold nugget
    expect(lootTierForValue(799).id).toBe("epic");
    expect(lootTierForValue(800).id).toBe("legendary");
    expect(lootTierForValue(1200).id).toBe("legendary"); // abyssal gem
  });

  it("tiers carry distinct glow colours", () => {
    const colors = [0, 100, 300, 800].map((v) => lootTierForValue(v).color);
    expect(new Set(colors).size).toBe(4);
  });
});

describe("reveal timeline", () => {
  it("is bounded between 4s and 12s at the default (dig) pace", () => {
    expect(buildRevealTimeline(0).durationMs).toBe(4000);
    expect(buildRevealTimeline(1).durationMs).toBe(4000);
    expect(buildRevealTimeline(4).durationMs).toBe(4000);
    expect(buildRevealTimeline(8).durationMs).toBe(8000);
    expect(buildRevealTimeline(12).durationMs).toBe(12000);
    expect(buildRevealTimeline(60).durationMs).toBe(12000);
  });

  it("reveal times are ordered and inside the window", () => {
    for (const n of [1, 2, 3, 7, 20]) {
      const tl = buildRevealTimeline(n);
      expect(tl.revealAtMs).toHaveLength(n);
      for (let i = 0; i < n; i++) {
        expect(tl.revealAtMs[i]).toBeGreaterThanOrEqual(0);
        expect(tl.revealAtMs[i]).toBeLessThanOrEqual(tl.durationMs);
        if (i > 0) expect(tl.revealAtMs[i]).toBeGreaterThan(tl.revealAtMs[i - 1]);
      }
    }
  });

  it("honours a faster custom pace (raid spoils)", () => {
    const tl = buildRevealTimeline(1, { perItemMs: 450, minMs: 1400, maxMs: 5000 });
    expect(tl.durationMs).toBe(1400);
    const many = buildRevealTimeline(30, { perItemMs: 450, minMs: 1400, maxMs: 5000 });
    expect(many.durationMs).toBe(5000);
  });
});

describe("gold pops", () => {
  it("always sums back to the exact total", () => {
    for (const total of [1, 7, 40, 100, 500, 1234, 99999]) {
      const pops = splitGoldPops(total);
      expect(pops.reduce((a, b) => a + b, 0)).toBe(total);
      expect(pops.length).toBeGreaterThanOrEqual(1);
      expect(pops.length).toBeLessThanOrEqual(6);
      expect(pops.every((p) => p >= 1)).toBe(true);
    }
  });

  it("returns nothing for a non-positive total", () => {
    expect(splitGoldPops(0)).toEqual([]);
    expect(splitGoldPops(-50)).toEqual([]);
  });
});

/** Deploy the starter team to a free site and force it completed. */
function completedDive() {
  const s = useGame.getState();
  const team = player().teams[0];
  const free = s.worldSites.find((x) => !x.occupiedBy)!;
  expect(s.deployDive(team.id, free.id)).toBe(true);
  useGame.setState({
    worldSites: useGame
      .getState()
      .worldSites.map((x) =>
        x.id === free.id ? { ...x, state: "completed" as const } : x
      ),
  });
  return useGame.getState().worldSites.find((x) => x.id === free.id)!;
}

describe("dive reward peek ≡ claimDive", () => {
  it("peeking never claims: gold, site and crabs are untouched", () => {
    const site = completedDive();
    const goldBefore = player().gold;
    const peek1 = peekDiveReward(player(), site);
    const peek2 = peekDiveReward(player(), site);
    expect(peek1).toEqual(peek2);
    expect(peek1.net).toBeGreaterThan(0);
    expect(player().gold).toBe(goldBefore);
    // The site is still completed (unclaimed) and crabs still diving.
    expect(
      useGame.getState().worldSites.find((x) => x.id === site.id)?.state
    ).toBe("completed");
    expect(player().crabs.some((c) => c.activity === "diving")).toBe(true);
  });

  it("claimDive grants exactly the peeked net, and pays exactly once", () => {
    const site = completedDive();
    const peek = peekDiveReward(player(), site);
    expect(peek.gross).toBe(peek.reward + peek.bonus);
    const goldBefore = player().gold;
    useGame.getState().claimDive(site.id);
    expect(player().gold - goldBefore).toBe(peek.net);
    // Second claim: the site is claimed — no further gold moves.
    const goldAfterFirst = player().gold;
    useGame.getState().claimDive(site.id);
    expect(player().gold).toBe(goldAfterFirst);
  });

  it("includes the +10% Gildclaw bonus per gildclaw on the dive team", () => {
    const site = completedDive();
    const team = player().teams[0];
    const gildId = team.crabIds.filter(Boolean)[0] as string;
    useGame.setState({
      player: {
        ...player(),
        crabs: player().crabs.map((c) =>
          c.id === gildId ? { ...c, classId: "gildclaw" as const } : c
        ),
      },
    });
    const siteNow = useGame.getState().worldSites.find((x) => x.id === site.id)!;
    const peek = peekDiveReward(player(), siteNow);
    expect(peek.bonus).toBe(Math.round(peek.reward * 0.1));
    const goldBefore = player().gold;
    useGame.getState().claimDive(site.id);
    expect(player().gold - goldBefore).toBe(peek.net);
  });
});
