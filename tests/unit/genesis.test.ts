// Unit tests for the Genesis Crab collection (engine/genesis.ts).
// Pure logic — the same module the Bazaar UI and the store action use.
import { describe, it, expect } from "vitest";
import {
  GENESIS_TOTAL,
  GENESIS_MARKET_PERCENT,
  GENESIS_MARKET_COUNT,
  GENESIS_RESERVE_COUNT,
  generateGenesisCrabs,
  getGenesisCrab,
  genesisAvailableListings,
  genesisToCrab,
  attemptGenesisPurchase,
} from "../../src/game/engine/genesis";
import { CONFIG } from "../../src/game/engine/config";

describe("Genesis constants", () => {
  it("total supply is exactly 333", () => {
    expect(GENESIS_TOTAL).toBe(333);
  });

  it("market share is 30% -> exactly 100 listed (rounded)", () => {
    expect(GENESIS_MARKET_PERCENT).toBe(0.3);
    expect(GENESIS_MARKET_COUNT).toBe(Math.round(GENESIS_TOTAL * GENESIS_MARKET_PERCENT));
    expect(GENESIS_MARKET_COUNT).toBe(100);
    expect(GENESIS_RESERVE_COUNT).toBe(233);
  });
});

describe("generateGenesisCrabs", () => {
  it("generates exactly 333 unique crabs numbered 1..333", () => {
    const all = generateGenesisCrabs();
    expect(all).toHaveLength(333);
    const numbers = all.map((g) => g.genesisNumber);
    expect(new Set(numbers).size).toBe(333);
    expect(Math.min(...numbers)).toBe(1);
    expect(Math.max(...numbers)).toBe(333);
    expect(new Set(all.map((g) => g.id)).size).toBe(333);
    for (const g of all) {
      expect(g.name).toBeTruthy();
      expect(g.breedId).toBeTruthy();
      expect(g.stats.hp).toBeGreaterThan(0);
      expect(g.stats.attack).toBeGreaterThan(0);
      expect(g.price).toBeGreaterThan(0);
    }
  });

  it("lists exactly 100 on the market and keeps 233 unlisted", () => {
    const all = generateGenesisCrabs();
    expect(all.filter((g) => g.listed)).toHaveLength(100);
    expect(all.filter((g) => !g.listed)).toHaveLength(233);
  });

  it("is deterministic — two generations are identical", () => {
    const a = generateGenesisCrabs();
    const b = generateGenesisCrabs();
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe("genesis purchase rules", () => {
  it("only listed crabs can be bought; buying removes the listing", () => {
    const listed = getGenesisCrab(1)!;
    expect(listed.listed).toBe(true);
    expect(genesisAvailableListings([])).toHaveLength(100);

    const res = attemptGenesisPurchase(10_000_000, [], 1);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.newGold).toBe(10_000_000 - listed.price);
      expect(res.fee).toBe(Math.round(listed.price * CONFIG.bazaarFeePercent));
      expect(res.newSoldIds).toContain(listed.id);
    }
    expect(genesisAvailableListings(res.ok ? res.newSoldIds : [])).toHaveLength(99);
  });

  it("rejects buying the same crab twice", () => {
    const first = attemptGenesisPurchase(10_000_000, [], 2);
    expect(first.ok).toBe(true);
    const second = attemptGenesisPurchase(10_000_000, first.ok ? first.newSoldIds : [], 2);
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.reason).toBe("already_sold");
  });

  it("rejects reserve (unlisted) crabs", () => {
    const reserve = getGenesisCrab(150)!;
    expect(reserve.listed).toBe(false);
    const res = attemptGenesisPurchase(10_000_000, [], 150);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("not_listed");
  });

  it("rejects insufficient gold with a clear reason", () => {
    const listed = getGenesisCrab(3)!;
    const res = attemptGenesisPurchase(listed.price - 1, [], 3);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("insufficient_gold");
  });

  it("genesisToCrab converts to a playable generation-0 crab", () => {
    const g = getGenesisCrab(7)!;
    const crab = genesisToCrab(g);
    expect(crab.id).toBe("genesis_crab_7");
    expect(crab.name).toBe(g.name);
    expect(crab.faction).toBe(g.faction);
    expect(crab.classId).toBe(g.classId);
    expect(crab.generation).toBe(0);
    expect(crab.ownerId).toBe("player");
    expect(crab.stats).toEqual(g.stats);
  });
});
