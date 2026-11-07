// Unit tests for the GOLD tokenomics system (engine/economy.ts +
// the gameStore wiring): Tide Tithe brackets & rounding, the 50/50
// burn/treasury split, prize recycling out of the Tide Treasury,
// exemption paths, the weekly Tide Tax on hoards, and the Bazaar fee
// split — all pinned to the parameters in engine/config.ts.
import { describe, it, expect, beforeEach } from "vitest";
import {
  applyGoldCredit,
  applyMarketFeeSplit,
  applyTideTax,
  computeTithe,
  defaultEconomy,
  economyOf,
  titheRateFor,
} from "../../src/game/engine/economy";
import {
  CONFIG,
  MARKET_FEE_TREASURY_POINTS,
  TITHE_BRACKETS,
} from "../../src/game/engine/config";
import { useGame } from "../../src/game/store/gameStore";
import type { EconomyLedger, PlayerProfile } from "../../src/game/types";

function stubPlayer(gold: number, economy?: EconomyLedger): PlayerProfile {
  return { gold, economy } as unknown as PlayerProfile;
}

function freshStorePlayer() {
  useGame.getState().resetGame();
  useGame.getState().initPlayer("Tester");
  return useGame.getState().player!;
}

function patchPlayer(patch: Partial<PlayerProfile>) {
  const p = useGame.getState().player!;
  useGame.setState({ player: { ...p, ...patch } });
  return useGame.getState().player!;
}

beforeEach(() => {
  freshStorePlayer();
});

// ---------------------------------------------------------------------------
// Tide Tithe — brackets, rounding, split
// ---------------------------------------------------------------------------

describe("tithe brackets", () => {
  it("rate boundaries match the config table exactly", () => {
    expect(TITHE_BRACKETS.map((b) => b.minBalance)).toEqual([
      0, 25000, 100000, 500000,
    ]);
    expect(titheRateFor(0)).toBe(0);
    expect(titheRateFor(24999)).toBe(0);
    expect(titheRateFor(25000)).toBe(0.03);
    expect(titheRateFor(99999)).toBe(0.03);
    expect(titheRateFor(100000)).toBe(0.05);
    expect(titheRateFor(499999)).toBe(0.05);
    expect(titheRateFor(500000)).toBe(0.08);
    expect(titheRateFor(10_000_000)).toBe(0.08);
    // The top bracket is anchored to the Tide Tax threshold constant.
    expect(TITHE_BRACKETS[3].minBalance).toBe(CONFIG.tideTaxThreshold);
  });

  it("floor rounding: a 33g credit at 3% pays no tax", () => {
    const t = computeTithe(30000, 33);
    expect(t.tax).toBe(0);
    expect(t.net).toBe(33);
  });

  it("1000g at 5% → 50 tax, split 25 burned / 25 treasury", () => {
    const t = computeTithe(100000, 1000);
    expect(t.tax).toBe(50);
    expect(t.net).toBe(950);
    expect(t.burned).toBe(25);
    expect(t.treasuryShare).toBe(25);
  });

  it("odd tax: the odd gold goes to the Treasury (burned + share = tax)", () => {
    const t = computeTithe(100000, 1020); // floor(1020 × 5%) = 51
    expect(t.tax).toBe(51);
    expect(t.burned).toBe(25);
    expect(t.treasuryShare).toBe(26);
    expect(t.burned + t.treasuryShare).toBe(t.tax);
  });

  it("tax never exceeds the credit itself", () => {
    for (const amt of [1, 7, 100, 999]) {
      const t = computeTithe(600000, amt);
      expect(t.tax).toBeLessThanOrEqual(amt);
      expect(t.net).toBeGreaterThanOrEqual(0);
    }
  });

  it("balances under 25,000 are never tithed, however large the credit", () => {
    const t = computeTithe(24999, 1_000_000);
    expect(t.tax).toBe(0);
    expect(t.net).toBe(1_000_000);
  });
});

// ---------------------------------------------------------------------------
// applyGoldCredit — ledger consistency + prize recycling
// ---------------------------------------------------------------------------

describe("applyGoldCredit", () => {
  it("a tithed credit moves every counter consistently", () => {
    const p = stubPlayer(100000, defaultEconomy(0));
    const r = applyGoldCredit(p, 1000);
    expect(r.player.gold).toBe(100950);
    const eco = economyOf(r.player);
    expect(eco.totalTaxPaid).toBe(50);
    expect(eco.totalBurned).toBe(25);
    expect(eco.treasury).toBe(25);
    expect(eco.treasuryIn).toBe(25);
    // v2 supply accounting: totalMinted counts gold CREATED (the full
    // 1,000 gross); the tithe's burned 25 is counted in totalBurned, so
    // created − burned = 975 = net 950 (player) + 25 (Treasury share).
    expect(eco.totalMinted).toBe(1000);
    expect(eco.treasuryOut).toBe(0);
  });

  it("materializes a ledger for legacy saves (no economy field)", () => {
    const p = stubPlayer(100);
    const r = applyGoldCredit(p, 500);
    expect(r.player.gold).toBe(600);
    const eco = economyOf(r.player);
    expect(eco.totalMinted).toBe(500);
    expect(eco.lastTideTaxAt).toBeGreaterThan(0);
  });

  it("prize credits are paid from the Treasury first; only the shortfall is minted", () => {
    const eco0 = { ...defaultEconomy(0), treasury: 500, treasuryIn: 500 };
    const p = stubPlayer(0, eco0); // 0% bracket: no tithe noise
    const r = applyGoldCredit(p, 800, { prize: true });
    expect(r.fromTreasury).toBe(500);
    expect(r.player.gold).toBe(800);
    const eco = economyOf(r.player);
    expect(eco.treasury).toBe(0);
    expect(eco.treasuryOut).toBe(500);
    expect(eco.totalMinted).toBe(300); // only the shortfall was created
  });

  it("prize + tithe: tithe is taken on the gross, sourcing uses the pre-credit Treasury", () => {
    const eco0 = { ...defaultEconomy(0), treasury: 100, treasuryIn: 100 };
    const p = stubPlayer(100000, eco0);
    const r = applyGoldCredit(p, 1000, { prize: true });
    expect(r.tax).toBe(50);
    expect(r.net).toBe(950);
    expect(r.fromTreasury).toBe(100); // pre-credit treasury only
    const eco = economyOf(r.player);
    expect(eco.treasury).toBe(25); // 100 − 100 paid out + 25 tithe share in
    expect(eco.treasuryOut).toBe(100);
    // v2: created = gross 1,000 − 100 sourced from the Treasury = 900
    // (the tithe share is created gold sitting in the Treasury; only
    // Treasury-SOURCED portions are transfers, not creation).
    expect(eco.totalMinted).toBe(900);
  });

  it("non-positive credits are a no-op (same player reference)", () => {
    const p = stubPlayer(1000, defaultEconomy(0));
    expect(applyGoldCredit(p, 0).player).toBe(p);
    expect(applyGoldCredit(p, -50).player).toBe(p);
  });
});

// ---------------------------------------------------------------------------
// Tide Tax — the hoard levy
// ---------------------------------------------------------------------------

describe("applyTideTax", () => {
  const WEEK = 7 * 24 * 60 * 60 * 1000;
  const now = 1_800_000_000_000;

  function richPlayer(gold: number, anchor: number) {
    return stubPlayer(gold, { ...defaultEconomy(anchor), lastTideTaxAt: anchor });
  }

  it("600,000 balance → exactly 2,000 to the Treasury, balance 598,000", () => {
    const r = applyTideTax(richPlayer(600000, now - WEEK - 1), now);
    expect(r.tax).toBe(2000); // 2% of the 100,000 above the threshold
    expect(r.player.gold).toBe(598000);
    const eco = economyOf(r.player);
    expect(eco.treasury).toBe(2000);
    expect(eco.treasuryIn).toBe(2000);
    expect(eco.totalTaxPaid).toBe(2000);
    expect(eco.lastTideTaxAt).toBe(now);
  });

  it("a second assessment inside the window levies nothing", () => {
    const first = applyTideTax(richPlayer(600000, now - WEEK - 1), now);
    expect(first.tax).toBe(2000);
    const second = applyTideTax(first.player, now + 1000);
    expect(second.tax).toBe(0);
    expect(second.player.gold).toBe(598000);
  });

  it("balances at or below the threshold are never touched", () => {
    expect(applyTideTax(richPlayer(500000, now - WEEK - 1), now).tax).toBe(0);
    expect(applyTideTax(richPlayer(400000, now - WEEK - 1), now).tax).toBe(0);
    expect(applyTideTax(richPlayer(400000, now - WEEK - 1), now).player.gold).toBe(400000);
  });

  it("inside the window even a whale pays nothing", () => {
    const r = applyTideTax(richPlayer(5_000_000, now - 1000), now);
    expect(r.tax).toBe(0);
    expect(r.player.gold).toBe(5_000_000);
  });

  it("legacy save (no ledger): no retroactive tax; the anchor is materialized", () => {
    const r = applyTideTax(stubPlayer(600000), now);
    expect(r.tax).toBe(0);
    expect(r.player.gold).toBe(600000);
    expect(economyOf(r.player, now).lastTideTaxAt).toBe(now);
  });
});

// ---------------------------------------------------------------------------
// Market fee split
// ---------------------------------------------------------------------------

describe("applyMarketFeeSplit", () => {
  it("a 10,000 sale at 3.85%: treasury +100 (1.00pp), burn +285 (2.85pp)", () => {
    const fee = Math.round(10000 * CONFIG.bazaarFeePercent);
    expect(fee).toBe(385);
    const p = stubPlayer(5000, defaultEconomy(0));
    const r = applyMarketFeeSplit(p, 10000, fee);
    expect(r.treasuryShare).toBe(100);
    expect(r.treasuryShare).toBe(Math.round(10000 * MARKET_FEE_TREASURY_POINTS));
    expect(r.burned).toBe(285);
    expect(r.treasuryShare + r.burned).toBe(fee);
    // The helper moves NO gold itself — the seller's proceeds are the
    // caller's business and are unchanged by the split.
    expect(r.player.gold).toBe(5000);
    const eco = economyOf(r.player);
    expect(eco.treasury).toBe(100);
    expect(eco.treasuryIn).toBe(100);
    expect(eco.totalBurned).toBe(285);
  });
});

// ---------------------------------------------------------------------------
// Store wiring — creditGold / refundGold / quest claims / bazaar / tickTimers
// ---------------------------------------------------------------------------

describe("store wiring", () => {
  it("creditGold action applies the tithe and returns { net, tax }", () => {
    patchPlayer({ gold: 25000 });
    const r = useGame.getState().creditGold(1000);
    expect(r).toEqual({ net: 970, tax: 30 }); // 3% bracket
    expect(useGame.getState().player!.gold).toBe(25970);
  });

  it("a migrated faucet (quest claim) moves the counters consistently", () => {
    const p = useGame.getState().player!;
    patchPlayer({
      gold: 30000,
      questProgress: p.questProgress.map((q) =>
        q.questId === "first_dive" ? { ...q, progress: q.target } : q
      ),
    });
    useGame.getState().claimQuest("first_dive"); // 500 GOLD reward
    const after = useGame.getState().player!;
    // 3% of 500 = 15 tax → net 485; split 7 burned / 8 treasury.
    expect(after.gold).toBe(30485);
    const eco = economyOf(after);
    expect(eco.totalTaxPaid).toBe(15);
    expect(eco.totalBurned).toBe(7);
    expect(eco.treasury).toBe(8);
    expect(eco.treasuryIn).toBe(8);
    // v2: created = the full 500 gross (485 net + 15 tithe, of which 7
    // burned — counted in totalBurned — and 8 to the Treasury).
    expect(eco.totalMinted).toBe(500);
  });

  it("refundGold is exempt: no tithe and no minted counter, even at 600,000", () => {
    patchPlayer({ gold: 600000 });
    useGame.getState().refundGold(5000);
    const after = useGame.getState().player!;
    expect(after.gold).toBe(605000);
    const eco = economyOf(after);
    expect(eco.totalTaxPaid).toBe(0);
    expect(eco.totalMinted).toBe(0);
    expect(eco.totalBurned).toBe(0);
  });

  it("addGold (admin mint) is counted as minted, never tithed", () => {
    patchPlayer({ gold: 600000 });
    useGame.getState().addGold(10000);
    const after = useGame.getState().player!;
    expect(after.gold).toBe(610000);
    const eco = economyOf(after);
    expect(eco.totalMinted).toBe(10000);
    expect(eco.totalTaxPaid).toBe(0);
  });

  it("buying an NPC Bazaar listing splits the fee; buyer pays exactly the price", () => {
    patchPlayer({ gold: 1_000_000 });
    const listing = useGame
      .getState()
      .bazaarListings.filter((l) => l.sellerId !== "player")
      .sort((a, b) => a.price - b.price)[0];
    expect(listing).toBeTruthy();
    const fee = Math.round(listing.price * CONFIG.bazaarFeePercent);
    const share = Math.min(
      fee,
      Math.round(listing.price * MARKET_FEE_TREASURY_POINTS)
    );
    const ok = useGame.getState().buyBazaarListing(listing.id);
    expect(ok).toBe(true);
    const after = useGame.getState().player!;
    expect(after.gold).toBe(1_000_000 - listing.price);
    const eco = economyOf(after);
    expect(eco.treasury).toBe(share);
    expect(eco.treasuryIn).toBe(share);
    expect(eco.totalBurned).toBe(fee - share);
  });

  it("tickTimers levies the Tide Tax once the window has elapsed — and toasts it", () => {
    const WEEK = 7 * 24 * 60 * 60 * 1000;
    const anchor = Date.now() - WEEK - 1000;
    patchPlayer({
      gold: 600000,
      economy: { ...defaultEconomy(anchor), lastTideTaxAt: anchor },
    });
    useGame.getState().tickTimers();
    const after = useGame.getState().player!;
    expect(after.gold).toBe(598000);
    expect(economyOf(after).treasury).toBe(2000);
    const toasts = useGame.getState().toasts;
    expect(toasts.some((t) => t.title.includes("Tide Tax"))).toBe(true);
    // Second tick inside the fresh window: no further levy.
    useGame.getState().tickTimers();
    expect(useGame.getState().player!.gold).toBe(598000);
  });

  it("tickTimers on a legacy save (no ledger) never levies retroactively", () => {
    patchPlayer({ gold: 600000, economy: undefined });
    useGame.getState().tickTimers();
    const after = useGame.getState().player!;
    expect(after.gold).toBe(600000);
    expect(after.economy).toBeTruthy();
    expect(economyOf(after).treasury).toBe(0);
  });
});
