// Crabtopia - Game configuration
import { BattleConfig } from "../types";

export const CONFIG: BattleConfig = {
  // Demo uses compressed timers so the game is playable in a session.
  // Real spec values are noted in comments.
  diveDurationMs: 4 * 60 * 1000, // spec: 4 hours; demo: 4 minutes
  tutorialDiveMs: 30 * 1000, // tutorial dive: 30 seconds
  raidDurationMs: 60 * 1000, // spec: 1 hour; demo: 1 minute
  raidWithReinforcementMs: 90 * 1000, // spec: up to 2.5 hours; demo: 90 sec
  baseDiveReward: 300, // 300 GOLD per team per dive
  raidStealPercent: 0.65, // 65%
  raidParticipationPercent: 0.08, // 8%
  defenderFloorPercent: 0.35, // 35%
  hallFeePercent: 0.1, // 10%
  bazaarFeePercent: 0.0385, // 3.85%
  maxBreedCount: 5,
  eggHatchMs: 5 * 60 * 1000, // spec: 5 days; demo: 5 minutes
  maxReinforcements: 2,
  dailyDiveCap: 6,
  dailyRaidEnergy: 10,
  legendaryPartChance: 0.0007, // 0.07%
  mutationChance: 0.01, // 1%
  variancePercent: 0.05, // +/- 5%
  tideTaxThreshold: 500000, // progressive tax above 500k
};

export const BREED_COST_SCHEDULE = [
  2500, 8000, 18000, 35000, 70000, // 1st through 5th breed
];

// ---------------------------------------------------------------------------
// GOLD TOKENOMICS — the single source for every economy parameter.
// Implemented by src/game/engine/economy.ts; every UI surface that quotes
// these numbers must import them from here, never restate them as literals.
// See docs/tokenomics.md for the full faucet/sink inventory and rationale.
// ---------------------------------------------------------------------------

/**
 * TIDE TITHE — a progressive levy on gameplay gold INCOME (faucet credits:
 * dive/mining/explore claims, arena & raid rewards, quests, daily rewards,
 * tidepass tiers, clan chests, charter settlements, leviathan prizes).
 * The rate is set by the player's gold balance BEFORE the credit:
 *   < 25,000 → 0% · 25,000–99,999 → 3% · 100,000–499,999 → 5% · ≥ 500,000 → 8%
 * tax = floor(amount × rate), never more than the credit itself, so small
 * earnings (1–33 GOLD at 3%) round down to no tax at all. Spending is
 * never tithed. Escrow deposits/refunds, purchase refunds, seller
 * proceeds and starting gold are exempt (see economy.ts).
 */
export const TITHE_BRACKETS: readonly { minBalance: number; rate: number }[] = [
  { minBalance: 0, rate: 0 },
  { minBalance: 25000, rate: 0.03 },
  { minBalance: 100000, rate: 0.05 },
  { minBalance: CONFIG.tideTaxThreshold, rate: 0.08 },
];

/**
 * Where each tithe gold goes: this share is BURNED forever (permanent
 * sink); the remainder flows into the Tide Treasury (prize reserve).
 */
export const TITHE_BURN_SHARE = 0.5;

/**
 * MARKET FEE SPLIT — the existing Bazaar fee (bazaarFeePercent, charged
 * to the seller) is unchanged in total; of the sale price, this many
 * percentage POINTS are routed to the Tide Treasury and the rest of the
 * fee is burned. (1.00pp treasury / 2.85pp burned of the 3.85% fee.)
 */
export const MARKET_FEE_TREASURY_POINTS = 0.01;

/**
 * TIDE TAX — the hoard tax the Codex/Tutorials have long documented:
 * once per rolling window, this rate is charged on the balance ABOVE
 * CONFIG.tideTaxThreshold only (the first 500,000 is never touched) and
 * paid 100% into the Tide Treasury. Applied lazily by the store's
 * tickTimers and always surfaced with a toast — never silent.
 */
export const TIDE_TAX_RATE = 0.02;
export const TIDE_TAX_WINDOW_MS = 7 * 24 * 60 * 60 * 1000; // rolling 7 days

// ---------------------------------------------------------------------------
// SUPPLY CONSTITUTION (tokenomics v2) — the hard monetary law of GOLD.
// Implemented by src/game/engine/economy.ts; see docs/tokenomics.md §9+.
// ---------------------------------------------------------------------------

/** Hard cap: GOLD supply can NEVER exceed 21 billion. */
export const MAX_SUPPLY_GOLD = 21_000_000_000;
/** Genesis circulation: exactly 50% of the cap exists at genesis. */
export const INITIAL_SUPPLY_GOLD = 10_500_000_000;
/**
 * The 3% SPEED LIMIT on reward minting: there is NO emission schedule
 * and NO faucet of time — GOLD is created ONLY as gameplay rewards.
 * In any rolling 365-day window, reward mints may add at most this
 * share of the supply the window started with. Time alone mints
 * nothing; the limit only paces what play can create.
 */
export const TARGET_INFLATION_RATE = 0.03;
/** Milliseconds in a 365-day year — the pace window's time unit. */
export const MS_PER_YEAR = 365 * 24 * 60 * 60 * 1000;
/** The rolling reward-minting window: 365 days. */
export const EMISSION_WINDOW_MS = MS_PER_YEAR;

/**
 * PRICE INDEX — the stabilizer on SYSTEM prices (Genesis + NPC Bazaar
 * listings; never player-set prices, never sinks/fees). Recomputed on a
 * rolling 30-day anchor from realized supply growth — which is purely
 * gameplay-driven (rewards minted minus burns) — against the 3% pace;
 * each adjustment is capped at ±2% and the index itself is clamped to
 * [0.5, 3.0], so goods prices can never lurch. Minting exactly at the
 * pace leaves the index untouched.
 */
export const PRICE_INDEX_WINDOW_MS = 30 * 24 * 60 * 60 * 1000; // rolling 30 days
export const PRICE_INDEX_MAX_STEP = 0.02;
export const PRICE_INDEX_MIN = 0.5;
export const PRICE_INDEX_MAX = 3.0;

/**
 * LEVIATHAN faucet taper — retention design: the first win each day
 * pays in full; grinding the same faucet the same day tapers off.
 * Win #1 → 100%, #2 → 50%, #3 and beyond → 25% (of LEVIATHAN_WIN_GOLD).
 * The consolation prize is never tapered. One-time rewards (quests,
 * achievements) are never tapered either.
 */
export const LEVIATHAN_WIN_GOLD = 5000;
export const LEVIATHAN_CONSOLATION_GOLD = 100;
export const LEVIATHAN_TAPER_RATES: readonly number[] = [1, 0.5, 0.25];

// ---------------------------------------------------------------------------
// STAMINA, WOUNDS & RECOVERY — the per-crab exertion layer.
// Implemented by src/game/engine/stamina.ts; store wiring in gameStore.ts.
// ---------------------------------------------------------------------------

/** Every crab's stamina pool. Legacy crabs (no stored value) read as full. */
export const MAX_STAMINA = 100;
/** Passive rest regen: 20 stamina per hour (1 point per 3 minutes). */
export const STAMINA_REGEN_PER_HOUR = 20;
/**
 * Stamina charged per crab when an activity STARTS. Existing per-day
 * limits (dive cap, raid energy, exploration tickets, mining energy)
 * stay as they are — stamina is the per-crab layer beneath them.
 * Costs are deliberately low: a fresh crab can do ~7–10 activities.
 */
export const STAMINA_COSTS = {
  dive: 15,
  mining: 15,
  arena: 10,
  raid: 20,
  exploration: 15,
  leviathan: 20,
  tournament: 15,
  breeding: 10, // per parent
} as const;
export type StaminaActivity = keyof typeof STAMINA_COSTS;
/**
 * Arena defeats never wound (the arena is a sport) — a player crab
 * whose HP hits 0 there is WINDED instead: this much extra stamina
 * is drained, with no deployment lockout.
 */
export const ARENA_WINDED_STAMINA = 10;
/**
 * A crab whose HP hits 0 in a plunder raid or the Leviathan fight is
 * WOUNDED for this long: it cannot deploy and its stamina does not
 * regen until the wound heals (timer, Coral Salve, or a boosted
 * countdown). The daily reset does NOT clear wounds.
 */
export const WOUND_DURATION_MS = 45 * 60 * 1000; // 45 minutes
/** Second Wind Incense: every recovery process runs this fast. */
export const RECOVERY_BOOST_MULTIPLIER = 3;
/** …for this long (player-wide buff, `recoveryBoostUntil`). */
export const RECOVERY_BOOST_DURATION_MS = 2 * 60 * 60 * 1000; // 2 hours
/** Tide Tonic restores this much stamina; the Elixir restores to full
 *  and refuses when it would restore LESS than a Tonic would. */
export const TIDE_TONIC_RESTORE = 50;
/**
 * Recovery supply prices (GOLD) — SYSTEM prices: they pass through
 * `indexedPrice`, so index 1 yields exactly these. 100% of every sale
 * flows into the Tide Treasury (developer revenue, a pure transfer —
 * circulating supply never changes).
 */
export const RECOVERY_ITEM_PRICES = {
  tide_tonic: 300,
  tide_elixir: 550,
  coral_salve: 400,
  second_wind_incense: 800,
} as const;

// ---------------------------------------------------------------------------
// ITEM MARKET — dropped materials are tradable in the Bazaar.
// Implemented by src/game/engine/itemMarket.ts.
// ---------------------------------------------------------------------------

/** A player may ask at most this multiple of a material's reference
 *  value (data/materials.ts `baseValue`) per unit. */
export const ITEM_PRICE_CAP_MULTIPLE = 3;
/**
 * NPC demand for player item listings, per elapsed hour, by the
 * listing's price relative to the reference value: at or below
 * reference buyers are eager; up to ITEM_SALE_MAX_RATIO × reference
 * they are rare; above that there is no demand at all.
 */
export const ITEM_SALE_CHANCE_PER_HOUR_AT_REFERENCE = 0.5;
export const ITEM_SALE_CHANCE_PER_HOUR_ABOVE_REFERENCE = 0.1;
export const ITEM_SALE_MAX_RATIO = 2;
/** NPC material stock the Bazaar keeps on the shelf (restocked as a
 *  fresh rotation once it sells out). */
export const NPC_ITEM_STOCK = 8;

// Paid team slots: the first 5 team slots are free; slot 6 costs
// 50,000 and slot 7 costs 120,000 (team cap = 5 + this list's length).
// This is the single source — the store and TeamsScreen both import it.
// (It previously declared four prices "for slots 4-7" that no code
// imported and that contradicted the live 5-free-slots behavior.)
export const TEAM_SLOT_COSTS = [50000, 120000];

export const QUESTS = [
  {
    id: "first_dive",
    name: "First Dive",
    description: "Send a team on your first dive expedition.",
    target: 1,
    reward: 500,
  },
  {
    id: "claim_dive",
    name: "Treasure Hunter",
    description: "Claim 3 completed dives.",
    target: 3,
    reward: 800,
  },
  {
    id: "win_raid",
    name: "Plunderer",
    description: "Win 2 plunder raids.",
    target: 2,
    reward: 1200,
  },
  {
    id: "defend_raid",
    name: "Stalwart Defender",
    description: "Repel the Leviathan raid 2 times.",
    target: 2,
    reward: 1000,
  },
  {
    id: "breed_crab",
    name: "First Egg",
    description: "Breed your first crab egg.",
    target: 1,
    reward: 1500,
  },
  {
    id: "hatch_egg",
    name: "New Life",
    description: "Hatch an egg into a new crab.",
    target: 1,
    reward: 2000,
  },
  {
    id: "hire_crab",
    name: "Mercenary Captain",
    description: "Hire 3 mercenaries from Driftwood Hall.",
    target: 3,
    reward: 600,
  },
  {
    id: "coliseum_win",
    name: "Brawler",
    description: "Win 3 Arena battles.",
    target: 3,
    reward: 1500,
  },
  {
    id: "list_crab",
    name: "Lender",
    description: "List a crab in the Driftwood Hall.",
    target: 1,
    reward: 400,
  },
  {
    id: "bazaar_trade",
    name: "Trader",
    description: "Complete a Bazaar trade.",
    target: 1,
    reward: 700,
  },
];

export const TIDELORD_RANKS = [
  { rank: 1, name: "Shellwarden", xpRequired: 0 },
  { rank: 5, name: "Tidehand", xpRequired: 1000 },
  { rank: 10, name: "Reefkeeper", xpRequired: 5000 },
  { rank: 15, name: "Stormcaller", xpRequired: 12000 },
  { rank: 20, name: "Tidelord", xpRequired: 25000 },
  { rank: 30, name: "High Tidelord", xpRequired: 60000 },
  { rank: 50, name: "Sovereign of Tides", xpRequired: 200000 },
  { rank: 100, name: "Leviathan-Born", xpRequired: 1000000 },
];

export function getRank(xp: number): { rank: number; name: string } {
  let current = TIDELORD_RANKS[0];
  for (const r of TIDELORD_RANKS) {
    if (xp >= r.xpRequired) current = r;
  }
  return { rank: current.rank, name: current.name };
}
