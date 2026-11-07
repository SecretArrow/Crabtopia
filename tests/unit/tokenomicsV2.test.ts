// Unit tests for GOLD tokenomics v2 — the capped-supply constitution
// (engine/economy.ts + engine/config.ts + store wiring):
//   * MAX SUPPLY 21,000,000,000 · INITIAL 10,500,000,000 · pace ≤3%/yr
//   * NO emission schedule: GOLD is created ONLY as gameplay rewards;
//     time alone mints nothing (proven by the year-of-silence test)
//   * the 3% is a SPEED LIMIT: a rolling 365-day window paces reward
//     minting (allowance = 3% of the window's starting supply)
//   * the supply identity: circulating = INITIAL + totalMinted
//     − totalBurned, always ≤ MAX_SUPPLY
//   * the emission gate (pace limit + hard-cap backstop, Treasury
//     funds the shortfall, then nothing)
//   * the price-index stabilizer (system prices only; realized growth
//     is purely gameplay-driven)
//   * the Leviathan faucet taper (daily firsts full, repeats tapered)
import { describe, it, expect, beforeEach } from "vitest";
import {
  applyGoldCredit,
  applyMarketFeeSplit,
  applyPriceIndex,
  applyTideTax,
  defaultEconomy,
  economyOf,
  effectiveEmissionWindow,
  effectiveListingPrice,
  emissionAllowanceOf,
  indexedPrice,
  leviathanWinAmount,
  leviathanWinsTodayOf,
  rollEmissionWindow,
  supplyInvariantHolds,
} from "../../src/game/engine/economy";
import {
  EMISSION_WINDOW_MS,
  INITIAL_SUPPLY_GOLD,
  LEVIATHAN_TAPER_RATES,
  LEVIATHAN_WIN_GOLD,
  MAX_SUPPLY_GOLD,
  MS_PER_YEAR,
  PRICE_INDEX_WINDOW_MS,
  TARGET_INFLATION_RATE,
} from "../../src/game/engine/config";
import {
  attemptGenesisPurchase,
  getGenesisCrab,
} from "../../src/game/engine/genesis";
import { useGame } from "../../src/game/store/gameStore";
import type { EconomyLedger, PlayerProfile } from "../../src/game/types";

const NOW = 1_700_000_000_000;
const DAY = 24 * 60 * 60 * 1000;

function stubPlayer(
  gold: number,
  economy?: EconomyLedger,
  extra: Partial<PlayerProfile> = {}
): PlayerProfile {
  return { gold, economy, ...extra } as unknown as PlayerProfile;
}

/** A supply-consistent ledger close to the cap: the world's growth so
 *  far is booked into totalMinted so the identity holds exactly. */
function nearCapEconomy(headroom: number, treasury = 0): EconomyLedger {
  return {
    ...defaultEconomy(NOW),
    circulating: MAX_SUPPLY_GOLD - headroom,
    circulatingAtIndex: MAX_SUPPLY_GOLD - headroom,
    totalMinted: MAX_SUPPLY_GOLD - headroom - INITIAL_SUPPLY_GOLD,
    treasury,
    treasuryIn: treasury,
  };
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
// The constitution — constants and initialization
// ---------------------------------------------------------------------------

describe("supply constitution constants", () => {
  it("match the user's numbers exactly", () => {
    expect(MAX_SUPPLY_GOLD).toBe(21_000_000_000);
    expect(INITIAL_SUPPLY_GOLD).toBe(10_500_000_000);
    expect(INITIAL_SUPPLY_GOLD).toBe(MAX_SUPPLY_GOLD / 2);
    expect(TARGET_INFLATION_RATE).toBe(0.03);
    expect(EMISSION_WINDOW_MS).toBe(MS_PER_YEAR); // rolling 365 days
    expect(LEVIATHAN_WIN_GOLD).toBe(5000);
    expect(LEVIATHAN_TAPER_RATES).toEqual([1, 0.5, 0.25]);
  });

  it("a new save starts at genesis: 10.5B circulating, index 1, fresh pace window", () => {
    const eco = defaultEconomy(NOW);
    expect(eco.circulating).toBe(INITIAL_SUPPLY_GOLD);
    expect(eco.priceIndex).toBe(1);
    expect(eco.circulatingAtIndex).toBe(INITIAL_SUPPLY_GOLD);
    expect(eco.lastIndexAt).toBe(NOW);
    expect(eco.emissionWindowStartAt).toBe(NOW);
    expect(eco.windowBaseCirculating).toBe(INITIAL_SUPPLY_GOLD);
    expect(eco.emittedInWindow).toBe(0);
    // Genesis allowance: 3% of 10.5B = 315,000,000 per window.
    expect(emissionAllowanceOf(eco)).toBe(315_000_000);
    expect(supplyInvariantHolds(eco)).toBe(true);
  });

  it("a fresh store player carries the genesis ledger", () => {
    const eco = economyOf(useGame.getState().player!);
    expect(eco.circulating).toBe(INITIAL_SUPPLY_GOLD);
    expect(supplyInvariantHolds(eco)).toBe(true);
  });

  it("legacy v1 ledger (no supply fields): initialized from its own counters, no charges", () => {
    const v1 = {
      totalMinted: 5000,
      totalBurned: 1200,
      totalTaxPaid: 300,
      treasury: 800,
      treasuryIn: 900,
      treasuryOut: 100,
      lastTideTaxAt: NOW,
    } as unknown as EconomyLedger;
    const eco = economyOf(stubPlayer(1234, v1), NOW);
    // circulating = INITIAL + minted − burned so far — the world's
    // history is honored, and nothing is charged for the migration.
    expect(eco.circulating).toBe(INITIAL_SUPPLY_GOLD + 5000 - 1200);
    expect(eco.priceIndex).toBe(1);
    // The pace window starts at first sight, based on that supply.
    expect(eco.windowBaseCirculating).toBe(eco.circulating);
    expect(eco.emittedInWindow).toBe(0);
    expect(supplyInvariantHolds(eco)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Reward-driven emission — the 3% speed limit (NO schedule)
// ---------------------------------------------------------------------------

describe("reward-minting speed limit", () => {
  it("reward mints increase circulating and consume window allowance 1:1", () => {
    const r = applyGoldCredit(stubPlayer(0, defaultEconomy(NOW)), 1000, {}, NOW);
    const eco = economyOf(r.player);
    expect(eco.circulating).toBe(INITIAL_SUPPLY_GOLD + 1000);
    expect(eco.emittedInWindow).toBe(1000);
    expect(supplyInvariantHolds(eco)).toBe(true);
  });

  it("the window meters NET creation: a tithed mint consumes created − burned", () => {
    // 100,000 balance → 5% bracket; 1,000 credit → tax 50 (25 burned).
    const r = applyGoldCredit(stubPlayer(100_000, defaultEconomy(NOW)), 1000, {}, NOW);
    const eco = economyOf(r.player);
    expect(eco.emittedInWindow).toBe(975); // 1,000 created − 25 burned
    expect(eco.circulating).toBe(INITIAL_SUPPLY_GOLD + 975);
    expect(supplyInvariantHolds(eco)).toBe(true);
  });

  it("burns do NOT consume allowance (fee split leaves emittedInWindow untouched)", () => {
    const p = applyGoldCredit(stubPlayer(0, defaultEconomy(NOW)), 1000, {}, NOW).player;
    const split = applyMarketFeeSplit(p, 10_000, 385);
    const eco = economyOf(split.player);
    expect(eco.emittedInWindow).toBe(1000);
    expect(eco.circulating).toBe(INITIAL_SUPPLY_GOLD + 1000 - 285);
    expect(supplyInvariantHolds(eco)).toBe(true);
  });

  it("near-exhausted window: a reward mint is capped at the remaining allowance", () => {
    // Window base 100,000 → allowance 3,000; 2,900 already emitted.
    const eco: EconomyLedger = {
      ...defaultEconomy(NOW),
      windowBaseCirculating: 100_000,
      emittedInWindow: 2_900,
    };
    const r = applyGoldCredit(stubPlayer(0, eco), 1000, {}, NOW);
    expect(r.capped).toBe(true);
    expect(r.net).toBe(100); // only the remaining pace is minted
    const after = economyOf(r.player);
    expect(after.emittedInWindow).toBe(3_000);
    expect(after.circulating).toBe(INITIAL_SUPPLY_GOLD + 100);
    expect(supplyInvariantHolds(after)).toBe(true);
  });

  it("near-exhausted window + funded Treasury: the shortfall is paid from the Treasury", () => {
    const eco: EconomyLedger = {
      ...defaultEconomy(NOW),
      windowBaseCirculating: 100_000,
      emittedInWindow: 2_900,
      treasury: 500,
      treasuryIn: 500,
    };
    const r = applyGoldCredit(stubPlayer(0, eco), 1000, {}, NOW);
    expect(r.capped).toBe(true);
    expect(r.net).toBe(600); // 100 minted + 500 transferred
    expect(r.fromTreasury).toBe(500);
    const after = economyOf(r.player);
    expect(after.treasury).toBe(0);
    expect(after.emittedInWindow).toBe(3_000); // transfers don't consume pace
    expect(after.circulating).toBe(INITIAL_SUPPLY_GOLD + 100);
    expect(supplyInvariantHolds(after)).toBe(true);
  });

  it("pace exhaustion redirects the tithe's Treasury share into the burn (tax still full)", () => {
    // Remaining pace: 1. Treasury-funded credit (Treasury 10,000) of
    // 1,000 at the 5% bracket: tax 50 (25 burn / 25 share), net 950 =
    // 1 minted + 949 from Treasury. Created = 51; net creation would
    // be 51 − 25 = 26 > pace 1, so the 25 share is burned instead of
    // created: totalBurned 50, Treasury receives 0 new gold.
    const eco: EconomyLedger = {
      ...defaultEconomy(NOW),
      windowBaseCirculating: 100_000,
      emittedInWindow: 2_999,
      treasury: 10_000,
      treasuryIn: 10_000,
    };
    const r = applyGoldCredit(stubPlayer(100_000, eco), 1000, {}, NOW);
    expect(r.tax).toBe(50);
    expect(r.net).toBe(950);
    const after = economyOf(r.player);
    expect(after.totalBurned).toBe(50);
    expect(after.treasury).toBe(10_000 - 949);
    expect(after.treasuryIn).toBe(10_000); // no new share landed
    expect(after.emittedInWindow).toBe(3_000); // exactly at the limit
    expect(after.circulating).toBe(INITIAL_SUPPLY_GOLD + 1);
    expect(supplyInvariantHolds(after)).toBe(true);
  });

  it("the window rolls after 365 days: allowance recomputed from CURRENT circulating", () => {
    const eco: EconomyLedger = {
      ...defaultEconomy(NOW),
      windowBaseCirculating: 100_000,
      emittedInWindow: 3_000, // exhausted
      emissionWindowStartAt: NOW - EMISSION_WINDOW_MS,
    };
    const r = rollEmissionWindow(stubPlayer(0, eco), NOW);
    expect(r.rolled).toBe(true);
    const after = economyOf(r.player);
    expect(after.emissionWindowStartAt).toBe(NOW);
    expect(after.emittedInWindow).toBe(0);
    expect(after.windowBaseCirculating).toBe(INITIAL_SUPPLY_GOLD);
    expect(emissionAllowanceOf(after)).toBe(315_000_000);
    // The roll itself minted nothing.
    expect(after.circulating).toBe(INITIAL_SUPPLY_GOLD);
    expect(supplyInvariantHolds(after)).toBe(true);
  });

  it("inside the window nothing rolls (same player reference)", () => {
    const player = stubPlayer(0, defaultEconomy(NOW));
    const r = rollEmissionWindow(player, NOW + 364 * DAY);
    expect(r.rolled).toBe(false);
    expect(r.player).toBe(player);
  });

  it("a credit after the window elapsed rolls first, then pays in full", () => {
    const eco: EconomyLedger = {
      ...defaultEconomy(NOW),
      windowBaseCirculating: 100_000,
      emittedInWindow: 3_000, // old window exhausted
      emissionWindowStartAt: NOW - EMISSION_WINDOW_MS - DAY,
    };
    const r = applyGoldCredit(stubPlayer(0, eco), 1000, {}, NOW);
    expect(r.capped).toBe(false);
    expect(r.net).toBe(1000);
    const after = economyOf(r.player);
    expect(after.emittedInWindow).toBe(1000); // counted in the NEW window
    expect(after.windowBaseCirculating).toBe(INITIAL_SUPPLY_GOLD);
    expect(supplyInvariantHolds(after)).toBe(true);
  });

  it("effectiveEmissionWindow shows the rolled view without persisting it", () => {
    const eco: EconomyLedger = {
      ...defaultEconomy(NOW),
      windowBaseCirculating: 100_000,
      emittedInWindow: 3_000,
      emissionWindowStartAt: NOW - EMISSION_WINDOW_MS,
    };
    const view = effectiveEmissionWindow(eco, NOW);
    expect(view.base).toBe(INITIAL_SUPPLY_GOLD);
    expect(view.emitted).toBe(0);
    expect(view.allowance).toBe(315_000_000);
    expect(view.remaining).toBe(315_000_000);
    expect(eco.emittedInWindow).toBe(3_000); // original untouched
  });

  it("admin addGold is counted in supply but does NOT consume pace allowance", () => {
    const s = useGame.getState();
    s.addGold(5000);
    const eco = economyOf(useGame.getState().player!);
    expect(eco.circulating).toBe(INITIAL_SUPPLY_GOLD + 5000);
    expect(eco.emittedInWindow).toBe(0);
    expect(supplyInvariantHolds(eco)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Player flows keep the identity
// ---------------------------------------------------------------------------

describe("player flows move circulating", () => {
  it("tithe: only the burned half leaves circulating; the Treasury half is a transfer", () => {
    const r = applyGoldCredit(stubPlayer(100_000, defaultEconomy(NOW)), 1000, {}, NOW);
    const eco = economyOf(r.player);
    expect(eco.treasury).toBe(25);
    expect(eco.circulating).toBe(INITIAL_SUPPLY_GOLD + 1000 - 25);
    expect(supplyInvariantHolds(eco)).toBe(true);
  });

  it("market fee split: the burn share leaves circulating, the Treasury share stays", () => {
    const split = applyMarketFeeSplit(
      stubPlayer(0, defaultEconomy(NOW)),
      10_000,
      385
    );
    const eco = economyOf(split.player);
    expect(split.burned).toBe(285);
    expect(eco.treasury).toBe(100);
    expect(eco.circulating).toBe(INITIAL_SUPPLY_GOLD - 285);
    expect(supplyInvariantHolds(eco)).toBe(true);
  });

  it("the Tide Tax is a pure transfer: circulating unchanged", () => {
    const whale = stubPlayer(600_000, {
      ...defaultEconomy(NOW),
      lastTideTaxAt: NOW - 8 * DAY,
    });
    const before = economyOf(whale).circulating;
    const r = applyTideTax(whale, NOW);
    expect(r.tax).toBe(2000);
    expect(economyOf(r.player).circulating).toBe(before);
    expect(supplyInvariantHolds(economyOf(r.player))).toBe(true);
  });

  it("the identity survives a mixed sequence of flows", () => {
    let p = stubPlayer(100_000, defaultEconomy(NOW - MS_PER_YEAR));
    p = applyGoldCredit(p, 5000, {}, NOW).player;
    expect(supplyInvariantHolds(economyOf(p))).toBe(true);
    p = applyMarketFeeSplit(p, 20_000, 770).player;
    expect(supplyInvariantHolds(economyOf(p))).toBe(true);
    p = rollEmissionWindow(p, NOW).player; // re-bases pace; no supply change
    expect(supplyInvariantHolds(economyOf(p))).toBe(true);
    p = applyPriceIndex(p, NOW).player; // moves prices, never supply
    expect(supplyInvariantHolds(economyOf(p))).toBe(true);
    p = applyTideTax(
      { ...p, gold: 900_000, economy: { ...economyOf(p), lastTideTaxAt: NOW - 8 * DAY } },
      NOW
    ).player;
    expect(supplyInvariantHolds(economyOf(p))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Emission gate at the hard cap (the absolute backstop)
// ---------------------------------------------------------------------------

describe("emission gate at the cap", () => {
  it("at the cap with an empty Treasury a credit mints nothing and pays 0", () => {
    const player = stubPlayer(0, nearCapEconomy(0, 0));
    const r = applyGoldCredit(player, 1000, {}, NOW);
    expect(r.capped).toBe(true);
    expect(r.net).toBe(0);
    expect(r.tax).toBe(0);
    expect(r.fromTreasury).toBe(0);
    expect(r.player.gold).toBe(0);
    const eco = economyOf(r.player);
    expect(eco.totalMinted).toBe(MAX_SUPPLY_GOLD - INITIAL_SUPPLY_GOLD);
    expect(eco.circulating).toBe(MAX_SUPPLY_GOLD);
    expect(supplyInvariantHolds(eco)).toBe(true);
  });

  it("at the cap a funded Treasury pays the credit as a transfer (no new supply)", () => {
    const player = stubPlayer(0, nearCapEconomy(0, 500));
    const r = applyGoldCredit(player, 1000, {}, NOW);
    expect(r.capped).toBe(true);
    expect(r.net).toBe(500);
    expect(r.fromTreasury).toBe(500);
    expect(r.player.gold).toBe(500);
    const eco = economyOf(r.player);
    expect(eco.treasury).toBe(0);
    expect(eco.treasuryOut).toBe(500);
    expect(eco.circulating).toBe(MAX_SUPPLY_GOLD); // transfer: unchanged
    expect(supplyInvariantHolds(eco)).toBe(true);
  });

  it("partial headroom: mint up to the cap, the rest is not created", () => {
    const player = stubPlayer(0, nearCapEconomy(300, 0));
    const r = applyGoldCredit(player, 1000, {}, NOW);
    expect(r.capped).toBe(true);
    expect(r.net).toBe(300);
    const eco = economyOf(r.player);
    expect(eco.circulating).toBe(MAX_SUPPLY_GOLD);
    expect(supplyInvariantHolds(eco)).toBe(true);
  });

  it("below the cap and inside the pace nothing is capped", () => {
    const r = applyGoldCredit(stubPlayer(0, defaultEconomy(NOW)), 1000, {}, NOW);
    expect(r.capped).toBe(false);
    expect(r.net).toBe(1000);
  });
});

// ---------------------------------------------------------------------------
// Price index stabilizer — realized growth is purely gameplay-driven
// ---------------------------------------------------------------------------

describe("price index", () => {
  it("indexedPrice: index 1 is identity; 1.5 scales and rounds", () => {
    expect(indexedPrice(1000, 1)).toBe(1000);
    expect(indexedPrice(1000, 1.5)).toBe(1500);
    expect(indexedPrice(333, 1.5)).toBe(500); // 499.5 rounds to 500
    expect(indexedPrice(0, 1.5)).toBe(0);
    expect(indexedPrice(-50, 1.5)).toBe(0);
  });

  it("effectiveListingPrice indexes NPC listings only — player prices never float", () => {
    const npc = { price: 1000, sellerId: "npc" };
    const own = { price: 1000, sellerId: "player" };
    expect(effectiveListingPrice(npc, 1.5)).toBe(1500);
    expect(effectiveListingPrice(own, 1.5)).toBe(1000);
    expect(effectiveListingPrice(npc, 1)).toBe(1000);
  });

  it("Genesis prices scale with the index (base price stays the base)", () => {
    const base = getGenesisCrab(1)!.price;
    const atOne = attemptGenesisPurchase(10_000_000, [], 1);
    const at15 = attemptGenesisPurchase(10_000_000, [], 1, 1.5);
    if (!atOne.ok || !at15.ok) throw new Error("expected purchases to succeed");
    expect(atOne.price).toBe(base);
    expect(at15.price).toBe(Math.round(base * 1.5));
    expect(at15.fee).toBe(Math.round(Math.round(base * 1.5) * 0.0385));
    expect(getGenesisCrab(1)!.price).toBe(base); // base untouched
  });

  it("windows shorter than 30 days never adjust", () => {
    const eco = { ...defaultEconomy(NOW), lastIndexAt: NOW - 10 * DAY };
    const player = stubPlayer(0, eco);
    const r = applyPriceIndex(player, NOW);
    expect(r.player).toBe(player);
    expect(r.priceIndex).toBe(1);
  });

  it("gameplay minting at exactly the 3% pace leaves the index at ~1", () => {
    // 40 days of rewards minted at exactly the pace:
    // 10.5B × 3% × 40/365 ≈ 34,520,548.
    const eco: EconomyLedger = {
      ...defaultEconomy(NOW),
      circulating: INITIAL_SUPPLY_GOLD + 34_520_548,
      totalMinted: 34_520_548,
      emittedInWindow: 34_520_548,
      lastIndexAt: NOW - 40 * DAY,
    };
    const r = applyPriceIndex(stubPlayer(0, eco), NOW);
    expect(Math.abs(r.priceIndex - 1)).toBeLessThan(0.0001);
    // The window closes: snapshot + anchor advance.
    const after = economyOf(r.player);
    expect(after.circulatingAtIndex).toBe(eco.circulating);
    expect(after.lastIndexAt).toBe(NOW);
  });

  it("zero gameplay growth softens the index by the full −2% step (no ambient prop-up)", () => {
    // Circulating identical to the snapshot after 40 days: realized
    // inflation is exactly 0 — there is NO ambient component — so the
    // index steps down toward scarcity pricing.
    const eco: EconomyLedger = {
      ...defaultEconomy(NOW),
      lastIndexAt: NOW - 40 * DAY,
    };
    const r = applyPriceIndex(stubPlayer(0, eco), NOW);
    expect(r.priceIndex).toBeCloseTo(0.98, 10);
  });

  it("front-loaded reward minting (a burst above pace) nudges the index up ≤ +2%", () => {
    const eco: EconomyLedger = {
      ...defaultEconomy(NOW),
      circulating: Math.floor(INITIAL_SUPPLY_GOLD * 1.1), // +10% in 40 days
      totalMinted: Math.floor(INITIAL_SUPPLY_GOLD * 0.1),
      lastIndexAt: NOW - 40 * DAY,
    };
    const r = applyPriceIndex(stubPlayer(0, eco), NOW);
    expect(r.priceIndex).toBeCloseTo(1.02, 10);
  });

  it("a gameplay-driven supply crash nudges the index down by at most −2%", () => {
    const eco: EconomyLedger = {
      ...defaultEconomy(NOW),
      circulating: Math.floor(INITIAL_SUPPLY_GOLD * 0.5),
      totalBurned: Math.floor(INITIAL_SUPPLY_GOLD * 0.5),
      lastIndexAt: NOW - 40 * DAY,
    };
    const r = applyPriceIndex(stubPlayer(0, eco), NOW);
    expect(r.priceIndex).toBeCloseTo(0.98, 10);
  });

  it("the index is clamped to [0.5, 3.0]", () => {
    const spike: EconomyLedger = {
      ...defaultEconomy(NOW),
      priceIndex: 2.99,
      circulating: Math.floor(INITIAL_SUPPLY_GOLD * 1.1),
      totalMinted: Math.floor(INITIAL_SUPPLY_GOLD * 0.1),
      lastIndexAt: NOW - 40 * DAY,
    };
    expect(applyPriceIndex(stubPlayer(0, spike), NOW).priceIndex).toBe(3);
    const crash: EconomyLedger = {
      ...defaultEconomy(NOW),
      priceIndex: 0.51,
      circulating: Math.floor(INITIAL_SUPPLY_GOLD * 0.5),
      totalBurned: Math.floor(INITIAL_SUPPLY_GOLD * 0.5),
      lastIndexAt: NOW - 40 * DAY,
    };
    expect(applyPriceIndex(stubPlayer(0, crash), NOW).priceIndex).toBe(0.5);
  });

  it("the window constant is 30 days", () => {
    expect(PRICE_INDEX_WINDOW_MS).toBe(30 * DAY);
  });
});

// ---------------------------------------------------------------------------
// Leviathan faucet taper
// ---------------------------------------------------------------------------

describe("leviathan taper", () => {
  it("amounts: 5,000 → 2,500 → 1,250 → 1,250 (floored at 25%)", () => {
    expect(leviathanWinAmount(0)).toBe(5000);
    expect(leviathanWinAmount(1)).toBe(2500);
    expect(leviathanWinAmount(2)).toBe(1250);
    expect(leviathanWinAmount(3)).toBe(1250);
    expect(leviathanWinAmount(99)).toBe(1250);
  });

  it("wins expire with the rolling 24h window", () => {
    const p = stubPlayer(0, undefined, {
      leviathanWinsToday: 3,
      leviathanWinsResetAt: NOW + DAY,
    });
    expect(leviathanWinsTodayOf(p, NOW)).toBe(3);
    expect(leviathanWinsTodayOf(p, NOW + DAY)).toBe(0);
    expect(leviathanWinsTodayOf(stubPlayer(0), NOW)).toBe(0);
  });

  it("store claims taper within the day and record the wins", () => {
    const s = useGame.getState();
    const g0 = s.player!.gold; // 2,000 — 0% tithe bracket throughout
    const c1 = s.claimLeviathanWin();
    expect(c1).toEqual({ amount: 5000, net: 5000, tax: 0 });
    const c2 = s.claimLeviathanWin();
    expect(c2.amount).toBe(2500);
    const c3 = s.claimLeviathanWin();
    expect(c3.amount).toBe(1250);
    const c4 = s.claimLeviathanWin();
    expect(c4.amount).toBe(1250);
    const p = useGame.getState().player!;
    expect(p.gold).toBe(g0 + 5000 + 2500 + 1250 + 1250);
    expect(p.leviathanWinsToday).toBe(4);
    expect(supplyInvariantHolds(economyOf(p))).toBe(true);
  });

  it("the taper resets once the daily anchor passes", () => {
    const s = useGame.getState();
    s.claimLeviathanWin();
    s.claimLeviathanWin();
    patchPlayer({ leviathanWinsResetAt: Date.now() - 1000 });
    const c = s.claimLeviathanWin();
    expect(c.amount).toBe(5000); // full value again
    expect(useGame.getState().player!.leviathanWinsToday).toBe(1);
  });

  it("tithe applies AFTER the taper (tax on the tapered amount)", () => {
    const s = useGame.getState();
    patchPlayer({ gold: 100_000 }); // 5% bracket
    const c1 = s.claimLeviathanWin();
    expect(c1.amount).toBe(5000);
    expect(c1.tax).toBe(250); // 5% of the tapered 5,000
    expect(c1.net).toBe(4750);
    const c2 = s.claimLeviathanWin();
    expect(c2.amount).toBe(2500);
    expect(c2.tax).toBe(125); // 5% of the tapered 2,500
    expect(c2.net).toBe(2375);
  });

  it("the consolation path (plain creditGold 100) is never tapered", () => {
    const s = useGame.getState();
    s.claimLeviathanWin();
    s.claimLeviathanWin();
    s.claimLeviathanWin();
    const g = useGame.getState().player!.gold;
    const r = s.creditGold(100);
    expect(r.net).toBe(100);
    expect(useGame.getState().player!.gold).toBe(g + 100);
  });
});

// ---------------------------------------------------------------------------
// Store tick integration: time alone changes NO supply
// ---------------------------------------------------------------------------

describe("tickTimers: no schedule, no ambient minting", () => {
  it("a year passes with no gameplay: supply is IDENTICAL; the pace window rolls; the index sees zero realized growth", () => {
    const yearAgo = Date.now() - MS_PER_YEAR;
    patchPlayer({ economy: defaultEconomy(yearAgo) });
    useGame.getState().tickTimers();
    const eco = economyOf(useGame.getState().player!);
    // THE pivot in one assertion: a year of silence minted nothing.
    expect(eco.circulating).toBe(INITIAL_SUPPLY_GOLD);
    expect(eco.totalMinted).toBe(0);
    expect(eco.emittedInWindow).toBe(0);
    expect(supplyInvariantHolds(eco)).toBe(true);
    // The window rolled and re-based on the (unchanged) supply.
    expect(eco.windowBaseCirculating).toBe(INITIAL_SUPPLY_GOLD);
    expect(eco.emissionWindowStartAt).toBeGreaterThan(Date.now() - 60_000);
    // Zero realized growth over the elapsed index window → −2% step.
    expect(eco.priceIndex).toBeCloseTo(0.98, 10);
  });

  it("tickTimers resets an expired Leviathan taper window", () => {
    patchPlayer({
      leviathanWinsToday: 3,
      leviathanWinsResetAt: Date.now() - 1000,
    });
    useGame.getState().tickTimers();
    const p = useGame.getState().player!;
    expect(p.leviathanWinsToday).toBe(0);
    expect(p.leviathanWinsResetAt).toBeGreaterThan(Date.now());
  });
});
