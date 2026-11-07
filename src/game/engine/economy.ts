// Crabtopia - GOLD tokenomics engine (pure; no store, no React)
// ---------------------------------------------------------------------------
// Implements the tax mechanisms configured in engine/config.ts:
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
// …and, since tokenomics v2, the SUPPLY CONSTITUTION:
//
//   4. HARD CAP — circulating supply can never exceed MAX_SUPPLY_GOLD
//      (21B). Genesis circulation is INITIAL_SUPPLY_GOLD (10.5B, 50%).
//      Invariant at all times:
//        circulating = INITIAL + totalMinted − totalBurned  (≤ MAX)
//      Player mints/burns move `circulating` through the same helpers
//      that move the counters, so the identity holds by construction.
//      Treasury flows are transfers INSIDE circulating — no change.
//   5. REWARD-DRIVEN EMISSION, 3% SPEED LIMIT — there is NO emission
//      schedule and NO faucet of time: GOLD is created ONLY as
//      gameplay rewards through applyGoldCredit. The 3% is a speed
//      limit on that minting: in any rolling 365-day window, reward
//      mints may add at most TARGET_INFLATION_RATE × the supply the
//      window started with. Time alone mints nothing — a year of
//      silence changes supply by exactly zero.
//   6. EMISSION GATE — a reward credit is bounded by BOTH limits: the
//      remaining pace in the window and the headroom to the hard cap
//      (the absolute backstop). Any shortfall is paid from the Tide
//      Treasury when funded, else simply not created; the returned
//      net/tax always describe what actually happened.
//   7. PRICE INDEX — a slow stabilizer on SYSTEM prices (Genesis +
//      NPC Bazaar listings), adjusted on a rolling 30-day window from
//      realized supply growth — purely gameplay-driven (rewards
//      minted minus burns) — against the 3% pace, ±2% per step,
//      clamped to [0.5, 3.0] (applyPriceIndex).
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

import type { BazaarListing, EconomyLedger, PlayerProfile } from "../types";
import {
  CONFIG,
  EMISSION_WINDOW_MS,
  INITIAL_SUPPLY_GOLD,
  LEVIATHAN_TAPER_RATES,
  LEVIATHAN_WIN_GOLD,
  MARKET_FEE_TREASURY_POINTS,
  MAX_SUPPLY_GOLD,
  MS_PER_YEAR,
  PRICE_INDEX_MAX,
  PRICE_INDEX_MAX_STEP,
  PRICE_INDEX_MIN,
  PRICE_INDEX_WINDOW_MS,
  TARGET_INFLATION_RATE,
  TIDE_TAX_RATE,
  TIDE_TAX_WINDOW_MS,
  TITHE_BRACKETS,
  TITHE_BURN_SHARE,
} from "./config";

/** A fresh ledger. The Tide Tax anchor starts NOW, so nobody is ever
 *  taxed retroactively for time played before the ledger existed.
 *  The minting window also starts now, based on genesis circulation —
 *  the world is born at 50% of the cap with a full 3% pace allowance. */
export function defaultEconomy(now: number = Date.now()): EconomyLedger {
  return {
    totalMinted: 0,
    totalBurned: 0,
    totalTaxPaid: 0,
    treasury: 0,
    treasuryIn: 0,
    treasuryOut: 0,
    lastTideTaxAt: now,
    circulating: INITIAL_SUPPLY_GOLD,
    emissionWindowStartAt: now,
    windowBaseCirculating: INITIAL_SUPPLY_GOLD,
    emittedInWindow: 0,
    priceIndex: 1,
    circulatingAtIndex: INITIAL_SUPPLY_GOLD,
    lastIndexAt: now,
  };
}

/** Clamp a supply figure into its legal range [0, MAX_SUPPLY_GOLD]. */
export function clampSupply(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(MAX_SUPPLY_GOLD, Math.max(0, n));
}

/**
 * The player's ledger, materialized over safe defaults. Legacy saves
 * (and partially-written ones) read as an all-zero ledger whose Tide
 * Tax anchor is `now` — first sight never levies a tax.
 *
 * Pre-v2 saves (a v1 ledger with no supply fields) initialize their
 * world supply from the flows they already tracked —
 *   circulating = INITIAL + totalMinted − totalBurned
 * — and their minting window starts at `now` based on that supply:
 * nothing is granted or charged retroactively, ever.
 */
export function economyOf(
  player: PlayerProfile,
  now: number = Date.now()
): EconomyLedger {
  const raw = player.economy;
  const merged: EconomyLedger = { ...defaultEconomy(now), ...(raw ?? {}) };
  if (raw && typeof raw.circulating !== "number") {
    merged.circulating = clampSupply(
      INITIAL_SUPPLY_GOLD + (raw.totalMinted ?? 0) - (raw.totalBurned ?? 0)
    );
    merged.circulatingAtIndex = merged.circulating;
  }
  if (raw && typeof raw.windowBaseCirculating !== "number") {
    merged.windowBaseCirculating = merged.circulating;
  }
  return merged;
}

/**
 * The supply identity every flow in this module preserves:
 *   circulating ≟ INITIAL + totalMinted − totalBurned,
 *   and ≤ MAX_SUPPLY_GOLD.
 * Exposed for tests and the dashboard.
 */
export function expectedCirculating(eco: EconomyLedger): number {
  return INITIAL_SUPPLY_GOLD + eco.totalMinted - eco.totalBurned;
}

export function supplyInvariantHolds(eco: EconomyLedger): boolean {
  return (
    eco.circulating <= MAX_SUPPLY_GOLD &&
    eco.circulating >= 0 &&
    Math.abs(eco.circulating - expectedCirculating(eco)) < 1
  );
}

/** The current window's total minting allowance: the 3% speed limit
 *  applied to the supply the window started with. */
export function emissionAllowanceOf(eco: EconomyLedger): number {
  return Math.floor(TARGET_INFLATION_RATE * eco.windowBaseCirculating);
}

/**
 * The ledger with its minting window rolled forward if a full 365
 * days have elapsed: the new window starts NOW, based on the CURRENT
 * circulating supply, with nothing yet emitted in it. Rolling mints
 * nothing and moves no supply — it only re-bases the speed limit.
 * (Returns the same ledger object when the window is still open.)
 */
export function rollEmissionWindowEco(
  eco: EconomyLedger,
  now: number
): EconomyLedger {
  if (now - eco.emissionWindowStartAt < EMISSION_WINDOW_MS) return eco;
  return {
    ...eco,
    emissionWindowStartAt: now,
    windowBaseCirculating: eco.circulating,
    emittedInWindow: 0,
  };
}

/** Player-level window roll (used by the store's tickTimers). */
export function rollEmissionWindow(
  player: PlayerProfile,
  now: number
): { player: PlayerProfile; rolled: boolean } {
  const eco = economyOf(player, now);
  const rolledEco = rollEmissionWindowEco(eco, now);
  if (rolledEco === eco) return { player, rolled: false };
  return { player: { ...player, economy: rolledEco }, rolled: true };
}

/** Effective (roll-aware) window figures for dashboards: what the
 *  window looks like at `now`, whether or not a roll has been
 *  persisted yet. Purely a view — reading it changes nothing. */
export function effectiveEmissionWindow(
  eco: EconomyLedger,
  now: number
): {
  startAt: number;
  base: number;
  emitted: number;
  allowance: number;
  remaining: number;
} {
  const rolled = rollEmissionWindowEco(eco, now);
  const allowance = emissionAllowanceOf(rolled);
  return {
    startAt: rolled.emissionWindowStartAt,
    base: rolled.windowBaseCirculating,
    emitted: rolled.emittedInWindow,
    allowance,
    remaining: Math.max(0, allowance - rolled.emittedInWindow),
  };
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
  /** The amount actually processed (≤ the requested amount when the
   *  emission gate trimmed it at the pace limit or the supply cap). */
  gross: number;
  tax: number;
  net: number;
  /** Portion of the net paid out of the Tide Treasury (prize credits
   *  plus any emission-gate reserve funding). */
  fromTreasury: number;
  /** True when the pace limit or the supply cap trimmed this credit. */
  capped: boolean;
}

/**
 * THE gold-credit helper — and the ONLY way gameplay creates GOLD.
 * Every faucet credit routes through here (store action `creditGold`
 * for the render layer, directly for store-internal rewards):
 *  - applies the Tide Tithe at the pre-credit balance (opts.tithe=false
 *    for an exempt credit that should still be ledger-counted),
 *  - prize credits (opts.prize) are paid from the Tide Treasury first
 *    and only mint the shortfall, tracked as treasuryOut,
 *  - EMISSION GATE (dual limit): minting is bounded by the remaining
 *    pace in the rolling 365-day window (3% of the window's starting
 *    supply) AND by the headroom to the hard cap — the processed gross
 *    is at most (mint capacity + Treasury balance); beyond the mint
 *    capacity the Tide Treasury funds the payment out of existing
 *    supply, and anything beyond both is simply not created (the
 *    returned net/tax describe what ACTUALLY happened, so toasts stay
 *    truthful). The window rolls lazily here first if 365 days have
 *    elapsed — rolling itself mints nothing,
 *  - pace accounting: the window meters NET creation (created minus
 *    the tithe's burned share). If a Treasury-funded credit's tithe
 *    share would itself create gold past the remaining pace, that
 *    share is burned instead of created — the tax still applies in
 *    full; only creation is limited,
 *  - ledger accounting: totalMinted grows by the gold actually CREATED
 *    (processed gross minus every Treasury-sourced portion); the
 *    tithe's burned share grows totalBurned; `circulating` moves by
 *    created − burned, preserving the supply invariant exactly.
 * Non-positive or non-finite amounts are a no-op (same player ref).
 */
export function applyGoldCredit(
  player: PlayerProfile,
  amount: number,
  opts: { tithe?: boolean; prize?: boolean } = {},
  now: number = Date.now()
): CreditResult {
  const requested = Math.floor(amount);
  if (!Number.isFinite(requested) || requested <= 0) {
    return { player, gross: 0, tax: 0, net: 0, fromTreasury: 0, capped: false };
  }
  // The minting window rolls before any pacing math (mints nothing).
  const eco = rollEmissionWindowEco(economyOf(player, now), now);

  // EMISSION GATE — mint capacity is the tighter of the two limits:
  // the hard cap's headroom and the window's remaining pace. The
  // processed gross can additionally draw on the Treasury reserve,
  // which funds payments out of EXISTING supply (a transfer).
  const capHeadroom = Math.max(0, MAX_SUPPLY_GOLD - eco.circulating);
  const allowance = emissionAllowanceOf(eco);
  const paceRemaining = Math.max(0, allowance - eco.emittedInWindow);
  const mintCapacity = Math.min(capHeadroom, paceRemaining);
  const gross = Math.min(requested, mintCapacity + eco.treasury);
  if (gross <= 0) {
    // No mint capacity and an empty reserve: nothing can be paid.
    // (The rolled window still persists so the new window is real.)
    return {
      player: { ...player, economy: eco },
      gross: 0,
      tax: 0,
      net: 0,
      fromTreasury: 0,
      capped: true,
    };
  }
  const capped = gross < requested;

  const t =
    opts.tithe === false
      ? { tax: 0, net: gross, burned: 0, treasuryShare: 0 }
      : computeTithe(player.gold, gross);

  // Source the net: prize credits draw the Treasury first (as it stood
  // BEFORE this credit's own tithe share lands — prizes are funded by
  // past collections); minting covers the next slice up to the mint
  // capacity; beyond it, the Treasury funds the remainder.
  let fromTreasury = 0;
  if (opts.prize) {
    fromTreasury = Math.min(eco.treasury, t.net);
  }
  const mintUsed = Math.min(t.net - fromTreasury, mintCapacity);
  const gateTreasury = t.net - fromTreasury - mintUsed;
  fromTreasury += gateTreasury;

  const created = gross - fromTreasury; // gold minted by this credit

  // Pace metering on NET creation (created − burned = mintUsed +
  // tithe share). The only way net creation can exceed the remaining
  // pace is the tithe share of a Treasury-funded credit — redirect
  // that excess share from creation into the burn: the player still
  // pays the full tax, the Treasury simply doesn't receive new gold.
  let { burned, treasuryShare } = t;
  let netCreation = created - burned;
  if (netCreation > paceRemaining) {
    const excess = netCreation - paceRemaining;
    treasuryShare -= excess;
    burned += excess;
    netCreation = paceRemaining;
  }

  const treasury = eco.treasury - fromTreasury + treasuryShare;

  const next: PlayerProfile = {
    ...player,
    gold: player.gold + t.net,
    economy: {
      ...eco,
      totalMinted: eco.totalMinted + created,
      totalBurned: eco.totalBurned + burned,
      totalTaxPaid: eco.totalTaxPaid + t.tax,
      treasury,
      treasuryIn: eco.treasuryIn + treasuryShare,
      treasuryOut: eco.treasuryOut + fromTreasury,
      circulating: clampSupply(eco.circulating + created - burned),
      emittedInWindow: eco.emittedInWindow + netCreation,
    },
  };
  return { player: next, gross, tax: t.tax, net: t.net, fromTreasury, capped };
}

/**
 * Counter-only sink split: routes `treasuryShare` of an already-charged
 * fee into the Tide Treasury and counts `burned` as destroyed. Gold
 * itself is moved by the caller (the fee is part of a larger set()).
 * The Treasury share is a transfer INSIDE circulating; the burned
 * share leaves it — `circulating` falls by exactly the burn.
 */
export function applySinkSplit(
  player: PlayerProfile,
  treasuryShare: number,
  burned: number
): PlayerProfile {
  const eco = economyOf(player);
  const burn = Math.max(0, burned);
  return {
    ...player,
    economy: {
      ...eco,
      totalBurned: eco.totalBurned + burn,
      treasury: eco.treasury + Math.max(0, treasuryShare),
      treasuryIn: eco.treasuryIn + Math.max(0, treasuryShare),
      circulating: clampSupply(eco.circulating - burn),
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

// ===========================================================================
// SUPPLY CONSTITUTION — price index & system prices
// (Emission itself lives in applyGoldCredit above: rewards only,
//  paced by the rolling window. NOTHING in this module mints from
//  the passage of time.)
// ===========================================================================

/**
 * The price-index stabilizer. On each elapsed 30-day window it compares
 * the REALIZED annualized supply growth since the last snapshot with
 * the 3% pace and nudges the index by the difference, capped at
 * ±PRICE_INDEX_MAX_STEP and clamped to [PRICE_INDEX_MIN, PRICE_INDEX_MAX]:
 *
 *   realized  = (circulating / snapshot − 1) / yearsElapsed
 *   index    ×= 1 + clamp(realized − TARGET_INFLATION_RATE, −2%, +2%)
 *
 * Realized growth is PURELY gameplay-driven — circulating only ever
 * moves through reward mints and burns (there is no ambient component
 * to subtract). Minting exactly at the 3% pace adjusts by ~0 and the
 * index stays put; front-loaded minting (a burst of rewards early in
 * the pace window annualizes far above 3%) nudges system prices up,
 * absorbing the surplus; a quiet world with little minting — or heavy
 * burning — nudges them down, softening prices when gold is scarce.
 * Windows shorter than PRICE_INDEX_WINDOW_MS never adjust.
 */
export function applyPriceIndex(
  player: PlayerProfile,
  now: number
): { player: PlayerProfile; priceIndex: number } {
  const hadAnchor =
    !!player.economy && typeof player.economy.lastIndexAt === "number";
  const eco = economyOf(player, now);
  if (!hadAnchor) {
    return { player: { ...player, economy: eco }, priceIndex: eco.priceIndex };
  }
  const elapsed = now - eco.lastIndexAt;
  if (elapsed < PRICE_INDEX_WINDOW_MS) {
    return { player, priceIndex: eco.priceIndex };
  }
  const snapshot = eco.circulatingAtIndex > 0 ? eco.circulatingAtIndex : eco.circulating;
  const years = elapsed / MS_PER_YEAR;
  const realized =
    snapshot > 0 && years > 0
      ? (eco.circulating / snapshot - 1) / years
      : TARGET_INFLATION_RATE;
  const step = Math.max(
    -PRICE_INDEX_MAX_STEP,
    Math.min(PRICE_INDEX_MAX_STEP, realized - TARGET_INFLATION_RATE)
  );
  const priceIndex = Math.max(
    PRICE_INDEX_MIN,
    Math.min(PRICE_INDEX_MAX, eco.priceIndex * (1 + step))
  );
  return {
    player: {
      ...player,
      economy: {
        ...eco,
        priceIndex,
        circulatingAtIndex: eco.circulating,
        lastIndexAt: now,
      },
    },
    priceIndex,
  };
}

/** A SYSTEM price under the stabilizer: round(base × priceIndex). */
export function indexedPrice(base: number, priceIndex: number): number {
  if (!Number.isFinite(base) || base <= 0) return 0;
  return Math.max(0, Math.round(base * priceIndex));
}

/**
 * The price a buyer actually pays for a Bazaar listing: SYSTEM (NPC)
 * listings float with the price index; player-set prices NEVER float —
 * a player's listed price is their own.
 */
export function effectiveListingPrice(
  listing: Pick<BazaarListing, "price" | "sellerId">,
  priceIndex: number
): number {
  return listing.sellerId === "npc"
    ? indexedPrice(listing.price, priceIndex)
    : listing.price;
}

// ===========================================================================
// LEVIATHAN FAUCET TAPER — retention through daily firsts
// ===========================================================================

/** The gold a Leviathan win pays after `winsToday` wins already
 *  claimed in the current daily window: 100% → 50% → 25% (floor). */
export function leviathanWinAmount(winsToday: number): number {
  const idx = Math.min(
    Math.max(0, Math.floor(winsToday)),
    LEVIATHAN_TAPER_RATES.length - 1
  );
  return Math.floor(LEVIATHAN_WIN_GOLD * LEVIATHAN_TAPER_RATES[idx]);
}

/** Leviathan wins still in force at `now` (0 once the rolling 24h
 *  window has expired) — the same lazy-reset pattern as daily dives. */
export function leviathanWinsTodayOf(player: PlayerProfile, now: number): number {
  const resetAt = player.leviathanWinsResetAt ?? 0;
  if (now >= resetAt) return 0;
  return Math.max(0, Math.floor(player.leviathanWinsToday ?? 0));
}
