// Crabtopia - GOLD tokenomics engine (pure; no store, no React)
// ---------------------------------------------------------------------------
// Implements the three tax mechanisms configured in engine/config.ts:
//
//   1. TIDE TITHE — progressive levy on gameplay gold income. The rate is
//      set by the balance BEFORE the credit (0% under 25,000, so new and
//      small players are untouched). Of each tax: TITHE_BURN_SHARE is
//      burned forever, the rest flows into the Tide Treasury.
//   2. MARKET FEE SPLIT — the existing 3.85% Bazaar fee is unchanged for
//      the seller; its destination is accounted (1.00pp of price to the
//      Tide Treasury, the rest of the fee burned).
//   3. TIDE TAX — once per rolling 7 days, TIDE_TAX_RATE of the balance
//      ABOVE CONFIG.tideTaxThreshold, paid 100% into the Tide Treasury.
//      The first 500,000 GOLD can never be touched.
//
// Exemptions (never tithed, never counted as minted): escrow deposits
// and refunds, purchase refunds, seller proceeds at the moment of sale
// (the market fee is the seller's tax) and a player's own money coming
// back (e.g. hiring back your own Hall crab). Those paths simply do not
// call applyGoldCredit.
//
// The Tide Treasury is the developer-tax leg made visible: an in-game
// prize reserve. Real gold prizes (Tidewell Rewards daily claims) are
// paid out of it FIRST — only the shortfall is freshly minted — and the
// flows are tracked as treasuryIn / treasuryOut in the ledger.
//
// Every function here is pure: it takes a PlayerProfile and returns a
// new one, so the store can fold the result into its existing set()
// calls and unit tests can pin the math without a store.

import type { EconomyLedger, PlayerProfile } from "../types";
import {
  CONFIG,
  MARKET_FEE_TREASURY_POINTS,
  TIDE_TAX_RATE,
  TIDE_TAX_WINDOW_MS,
  TITHE_BRACKETS,
  TITHE_BURN_SHARE,
} from "./config";

/** A fresh ledger. The Tide Tax anchor starts NOW, so nobody is ever
 *  taxed retroactively for time played before the ledger existed. */
export function defaultEconomy(now: number = Date.now()): EconomyLedger {
  return {
    totalMinted: 0,
    totalBurned: 0,
    totalTaxPaid: 0,
    treasury: 0,
    treasuryIn: 0,
    treasuryOut: 0,
    lastTideTaxAt: now,
  };
}

/**
 * The player's ledger, materialized over safe defaults. Legacy saves
 * (and partially-written ones) read as an all-zero ledger whose Tide
 * Tax anchor is `now` — first sight never levies a tax.
 */
export function economyOf(
  player: PlayerProfile,
  now: number = Date.now()
): EconomyLedger {
  return { ...defaultEconomy(now), ...(player.economy ?? {}) };
}

/** The tithe rate for a balance (the highest bracket it reaches). */
export function titheRateFor(balance: number): number {
  let rate = 0;
  for (const b of TITHE_BRACKETS) {
    if (balance >= b.minBalance) rate = b.rate;
  }
  return rate;
}

/** Bracket info for UI display: current rate + the next threshold. */
export function describeTithe(balance: number): {
  rate: number;
  nextAt: number | null;
  nextRate: number | null;
} {
  let rate = 0;
  let nextAt: number | null = null;
  let nextRate: number | null = null;
  for (const b of TITHE_BRACKETS) {
    if (balance >= b.minBalance) {
      rate = b.rate;
    } else if (nextAt === null) {
      nextAt = b.minBalance;
      nextRate = b.rate;
    }
  }
  return { rate, nextAt, nextRate };
}

export interface TitheBreakdown {
  tax: number;
  net: number;
  burned: number;
  treasuryShare: number;
}

/**
 * The tithe on one credit of `amount` at balance `balanceBefore`:
 * tax = floor(amount × rate), capped at the credit itself. Of the tax,
 * TITHE_BURN_SHARE (rounded down) is burned; the rest — including any
 * odd gold — goes to the Treasury, so burned + treasuryShare = tax.
 */
export function computeTithe(
  balanceBefore: number,
  amount: number
): TitheBreakdown {
  const gross = Math.max(0, Math.floor(amount));
  const tax = Math.min(gross, Math.floor(gross * titheRateFor(balanceBefore)));
  const burned = Math.floor(tax * TITHE_BURN_SHARE);
  return { tax, net: gross - tax, burned, treasuryShare: tax - burned };
}

export interface CreditResult {
  player: PlayerProfile;
  gross: number;
  tax: number;
  net: number;
  /** Portion of the net paid out of the Tide Treasury (prize credits). */
  fromTreasury: number;
}

/**
 * THE gold-credit helper. Every gameplay faucet credit routes through
 * here (store action `creditGold` for the render layer, directly for
 * store-internal rewards):
 *  - applies the Tide Tithe at the pre-credit balance (opts.tithe=false
 *    for an exempt credit that should still be ledger-counted),
 *  - counts the net as minted — except prize credits (opts.prize),
 *    which are paid from the Tide Treasury first and only mint the
 *    shortfall, tracked as treasuryOut,
 *  - folds the tithe split into totalBurned / treasury / treasuryIn /
 *    totalTaxPaid.
 * Non-positive or non-finite amounts are a no-op.
 */
export function applyGoldCredit(
  player: PlayerProfile,
  amount: number,
  opts: { tithe?: boolean; prize?: boolean } = {}
): CreditResult {
  const gross = Math.floor(amount);
  if (!Number.isFinite(gross) || gross <= 0) {
    return { player, gross: 0, tax: 0, net: 0, fromTreasury: 0 };
  }
  const eco = economyOf(player);
  const t =
    opts.tithe === false
      ? { tax: 0, net: gross, burned: 0, treasuryShare: 0 }
      : computeTithe(player.gold, gross);

  let treasury = eco.treasury + t.treasuryShare;
  let treasuryOut = eco.treasuryOut;
  let fromTreasury = 0;
  if (opts.prize) {
    // Paid from the Treasury as it stood BEFORE this credit's own tithe
    // share lands — prizes are funded by past collections.
    fromTreasury = Math.min(eco.treasury, t.net);
    treasury = eco.treasury - fromTreasury + t.treasuryShare;
    treasuryOut += fromTreasury;
  }

  const next: PlayerProfile = {
    ...player,
    gold: player.gold + t.net,
    economy: {
      ...eco,
      totalMinted: eco.totalMinted + (t.net - fromTreasury),
      totalBurned: eco.totalBurned + t.burned,
      totalTaxPaid: eco.totalTaxPaid + t.tax,
      treasury,
      treasuryIn: eco.treasuryIn + t.treasuryShare,
      treasuryOut,
    },
  };
  return { player: next, gross, tax: t.tax, net: t.net, fromTreasury };
}

/**
 * Counter-only sink split: routes `treasuryShare` of an already-charged
 * fee into the Tide Treasury and counts `burned` as destroyed. Gold
 * itself is moved by the caller (the fee is part of a larger set()).
 */
export function applySinkSplit(
  player: PlayerProfile,
  treasuryShare: number,
  burned: number
): PlayerProfile {
  const eco = economyOf(player);
  return {
    ...player,
    economy: {
      ...eco,
      totalBurned: eco.totalBurned + Math.max(0, burned),
      treasury: eco.treasury + Math.max(0, treasuryShare),
      treasuryIn: eco.treasuryIn + Math.max(0, treasuryShare),
    },
  };
}

/**
 * The market-fee split for a sale: of the fee charged on `price`,
 * MARKET_FEE_TREASURY_POINTS of the price goes to the Tide Treasury and
 * the remainder of the fee is burned. The seller's proceeds are computed
 * by the caller exactly as before (price − fee) — this only accounts
 * for where the fee went.
 */
export function applyMarketFeeSplit(
  player: PlayerProfile,
  price: number,
  fee: number
): { player: PlayerProfile; treasuryShare: number; burned: number } {
  const treasuryShare = Math.min(
    Math.max(0, fee),
    Math.round(price * MARKET_FEE_TREASURY_POINTS)
  );
  const burned = Math.max(0, fee) - treasuryShare;
  return {
    player: applySinkSplit(player, treasuryShare, burned),
    treasuryShare,
    burned,
  };
}

/**
 * The Tide Tax (hoard tax). If the rolling window has elapsed, levy
 * TIDE_TAX_RATE of the balance above CONFIG.tideTaxThreshold — 100% to
 * the Tide Treasury — and re-anchor the window. Returns the tax levied
 * (0 when inside the window, at/below the threshold, or on first sight
 * of a legacy save, which only materializes the anchor). The caller is
 * responsible for surfacing a levy > 0 (toast) — never silent.
 */
export function applyTideTax(
  player: PlayerProfile,
  now: number
): { player: PlayerProfile; tax: number } {
  const hadAnchor =
    !!player.economy &&
    typeof player.economy.lastTideTaxAt === "number";
  const eco = economyOf(player, now);
  if (!hadAnchor) {
    // Legacy save: materialize the ledger with the anchor at first
    // sight. No retroactive tax — the window starts now.
    return { player: { ...player, economy: eco }, tax: 0 };
  }
  if (now - eco.lastTideTaxAt < TIDE_TAX_WINDOW_MS) {
    return { player, tax: 0 };
  }
  const excess = Math.max(0, player.gold - CONFIG.tideTaxThreshold);
  const tax = Math.floor(excess * TIDE_TAX_RATE);
  if (tax <= 0) return { player, tax: 0 };
  return {
    player: {
      ...player,
      gold: player.gold - tax,
      economy: {
        ...eco,
        totalTaxPaid: eco.totalTaxPaid + tax,
        treasury: eco.treasury + tax,
        treasuryIn: eco.treasuryIn + tax,
        lastTideTaxAt: now,
      },
    },
    tax,
  };
}
