# Crabtopia GOLD Tokenomics — v2 (canonical)

GOLD is a single-player, off-chain game currency (no blockchain; saves are
local). Its tokenomics still matter: an unmetered faucet economy inflates
until prices, rewards and progression stop meaning anything. This document
is the canonical description of how GOLD is supplied, created, taxed,
recycled and destroyed. **Every parameter lives in
`src/game/engine/config.ts`** and the mechanics in
`src/game/engine/economy.ts` — if a UI surface quotes a number differently
from those files, the UI is wrong.

**v2 adds the supply constitution** on top of the v1 tax system: a hard
21-billion cap, a 10.5-billion genesis supply, reward-driven emission
paced by a 3%/year speed limit, a price-index stabilizer for system
prices, and tapered repeatable faucets so retention comes from daily
breadth, not from grinding one faucet.

Design goals:

1. **Controlled supply** — total GOLD can never exceed 21,000,000,000.
   New supply is created ONLY as gameplay rewards — there is no
   emission schedule and time alone mints nothing — and every mint is
   metered by the same ledger.
2. **Inflation resistance** — reward minting is paced at ≤3%/year by a
   rolling window, so supply growth has a hard speed limit regardless
   of how hard any faucet is farmed; every recurring faucet also pays
   a progressive levy, and hoards decay.
3. **Controlled prices** — system prices float with a bounded price
   index that only moves when player-driven flows bend realized growth
   off target; sinks and player-set prices never float, so planning
   stays predictable.
4. **Mutual benefit** — the "developer tax" is an in-game **Tide
   Treasury**: a visible prize reserve funded by taxes and paid back out
   as prizes, not a black box. Half of the income levy is burned
   forever; the other half visibly funds prizes.
5. **Fairness & retention** — new and small players are taxed 0%; only
   the *excess* over the hoard threshold is ever levied; a player's own
   money moving (escrow, refunds) is never taxed; nothing is ever
   deducted silently; and the best rewards each day are the *first*
   ones, so coming back daily beats grinding.

---

## 1. The supply constitution

### The three numbers

| Parameter | Value | Constant |
| --- | --- | --- |
| Max supply (hard cap) | **21,000,000,000 GOLD** | `MAX_SUPPLY_GOLD` |
| Initial (genesis) supply | **10,500,000,000 GOLD** (50% of max) | `INITIAL_SUPPLY_GOLD` |
| Reward mint pace (speed limit) | **≤3% per year** | `TARGET_INFLATION_RATE` |

The cap is a *rule of the code*, not a hope: the only path that creates
GOLD is the reward credit (§3), bounded by both the pace window (§2)
and the cap headroom, and the supply identity (§11) is asserted by unit
tests. There is no code path that can push circulating supply past
21,000,000,000 — and no path at all that mints from the passage of
time.

### Genesis allocation of the initial 10,500,000,000

| Allocation | Share | Amount | Purpose |
| --- | --- | --- | --- |
| Reef Market liquidity | 62% | 6,510,000,000 | NPC Bazaar / Hall pools — the gold NPCs "hold" so markets feel deep from day one |
| Faction treasuries | 20% | 2,100,000,000 | Clan / raid reward pools held by the six factions |
| Tide Treasury reserve | 10% | 1,050,000,000 | The developer fund at genesis — backs the prize system before taxes accumulate |
| Tidewell prize reserve | 8% | 840,000,000 | The standing prize pool behind Tidewell Rewards |

The other 10,500,000,000 — the **Emission Reserve** — does not exist
yet and is *never pre-mined*. It is released **only as game rewards**
(§2), paced at ≤3%/year and metered by the ledger. At genesis,
circulating supply is exactly the 10,500,000,000 above:
`circulating = 10,500,000,000`.

> **Accounting honesty:** the interactive **Tide Treasury** inside a
> player's save starts at **0** and accumulates from that save's taxes
> (§9). It is the player's-realm flow fund — the operational leg of the
> genesis Tide Treasury reserve above, not the reserve itself. The two
> are never added together anywhere; the dashboard shows the save's own
> Treasury, and this document is the only place the genesis allocation
> is stated. Claiming the save "holds" 1.05B would be fake accounting.

## 2. Emission is 100% reward-driven — the 3% speed limit

There is **no emission schedule**: no faucet drips GOLD for existing,
no ambient world growth accrues offline, and the passage of time mints
exactly zero. GOLD enters circulation in exactly one way — **gameplay
rewards** paid through `applyGoldCredit` (dives, raids, quests, arena,
Leviathan, Tidewell prizes, …). If nobody plays, supply does not move;
this is asserted by a unit test that ticks a year of simulated time
and requires the supply to be bit-for-bit identical.

What the 3% *is*, then, is a **speed limit on reward minting**,
enforced by a rolling 365-day window in the ledger
(`emissionWindowStartAt` / `windowBaseCirculating` / `emittedInWindow`):

```
allowance       = 3% × windowBaseCirculating   (supply at window start)
pace remaining  = allowance − emittedInWindow
```

- Every reward mint consumes allowance by its **net creation**
  (minted minus the tithe's immediately-burned share). At genesis the
  allowance is 315,000,000 GOLD per window — a single player's rewards
  (hundreds to thousands at a time) are dust against it, exactly like
  a real economy: the limit binds farming *strategies*, not play.
- When a reward would exceed the remaining pace, only the remainder
  is minted; the shortfall is paid from the **Tide Treasury** if
  funded (a transfer, consuming no pace), and anything beyond both is
  simply not paid — the credit result reports the actual net, so
  toasts stay truthful.
- The window anchor advances **only** when a full 365 days have
  elapsed (lazily, on the next credit or store tick); the new window
  re-bases its allowance on the *then-current* circulating supply.
  Rolling the window mints nothing.
- Burns never consume allowance — destroying GOLD is always allowed.
- **How long the reserve lasts:** at the *maximum* pace — rewards
  minting a full 3% of supply every year, compounding — supply would
  double from 10.5B to the 21B cap in ln 2 / ln 1.03 ≈ **23.4 years**,
  so the Emission Reserve funds **≥ ~23 years of rewards even in the
  fastest possible world**. The actual pace depends entirely on play,
  and every burn stretches it further.

## 3. The emission gate — both limits enforced at every reward

`applyGoldCredit` enforces the constitution on every credit:

```
mint capacity   = min(cap headroom, pace remaining)
processed gross = min(requested, mint capacity + Treasury balance)
```

- Normally neither limit binds (headroom ~10.5B, pace ~315M/window)
  and credits behave exactly as in v1.
- If a credit would cross either limit, the minted portion stops at
  the capacity; any remainder is paid out of the **Tide Treasury**
  (a transfer — no new supply); if the Treasury is empty too, the
  remainder is simply not created. The credit result reports
  `capped: true` and the actual net.
- The Tide Tithe (§7) is computed on the *processed* gross, and the
  window meters net creation — if a Treasury-funded credit's tithe
  share would itself create gold past the remaining pace, that share
  is burned instead of created (the tax still applies in full; only
  creation is limited). All ledger identities hold exactly in every
  branch.
- The gate is practically unreachable in a single-player lifetime —
  it exists so the limits are proven rules, and they are proven: unit
  tests seed near-cap and near-exhausted-window ledgers and assert
  mint-to-the-limit, Treasury-funded payment, and pay-nothing
  behavior.

## 4. Price control — the price-index stabilizer

System prices must not silently rot as supply grows, but they must not
whipsaw either. The ledger carries a **price index** (`priceIndex`,
starts at **1.0**), re-read on a rolling 30-day window
(`PRICE_INDEX_WINDOW_MS`, anchor `lastIndexAt`, snapshot
`circulatingAtIndex`) by `applyPriceIndex` in the same store tick:

```
realized  = (circulating / snapshot − 1) annualized over the window
step      = clamp(realized − 3% pace, −2%, +2%)
priceIndex ← clamp(priceIndex × (1 + step), 0.5, 3.0)
```

- Realized growth is **purely gameplay-driven**: since circulating
  moves only through reward mints and burns (§2), there is no ambient
  component to subtract — the number *is* the players' collective
  mint/burn pressure.
- Rewards minted at exactly the 3% pace adjust by ~0 and the index
  stays put. Front-loaded minting (a burst of rewards annualizes far
  above the pace) nudges system prices **up**, absorbing the surplus;
  a quiet month or heavy burning nudges them **down**, softening
  prices when gold is scarce. Maximum movement is ±2% per 30-day
  window, and the index is clamped to [×0.5, ×3.0]: no spiral in
  either direction.
- **What floats** (via `indexedPrice(base) = round(base × priceIndex)`):
  **Genesis crab prices** and **NPC/system Bazaar listing prices**
  (`effectiveListingPrice`). At index 1.00 these are exactly the
  pre-v2 prices — the existing price tests pin that.
- **What never floats:** player-set Bazaar prices (a player's listed
  price is their own), team slot costs, crafting/breeding fees,
  insurance, hire fees, and every tax parameter. Sinks stay predictable
  so players can plan; only goods prices absorb inflation.

## 5. Faucet taper & the retention design

Repeatable faucets are where single-player economies go to die: one
optimal grind, repeated forever, prints the currency into worthlessness
and bores the player doing it. v2's answer is **daily firsts**:

- **Full value the first time each day, tapered repeats.** The
  Leviathan win — flagged by the logic audit as a free, repeatable
  +5,000 faucet — now pays through `claimLeviathanWin`:
  win #1 today **5,000**, #2 **2,500** (50%), #3 and beyond **1,250**
  (25%, floor). The window is a rolling 24h anchor
  (`leviathanWinsToday` / `leviathanWinsResetAt`, the store's existing
  daily pattern), the taper applies **before** the Tide Tithe, and the
  100 GOLD consolation is deliberately **not** tapered — losing should
  never feel taxed. The Leviathan modal shows the live rule: *"Next
  win today: X GOLD — first win each day pays full 5,000."*
- **Breadth over depth:** daily rewards, the daily dive cap, quest
  chains and first-clear bonuses all pay full value once per day/cycle.
  Engagement comes from *many* daily firsts across systems, not from
  the 40th repetition of one — each system's first daily reward is the
  reason to open it, and the taper makes the marginal grind
  self-limiting without a hard lockout.
- **Never tapered:** one-time rewards (quests, achievements, first
  clears — they are finite by construction) and entry-fee'd activities
  (the Arena charges entry; its faucet is already gated by its sink).

## 6. Faucet & sink inventory

### Faucets (gold creation) — all tithed via `creditGold` / `applyGoldCredit`, all gated by §3

| Faucet | Where | Notes |
| --- | --- | --- |
| Dive claims (full + Gildclaw bonus) | `gameStore.claimDive` | base reward + 10%/Gildclaw |
| Dive retreat (partial) | `gameStore.retreatDive` | partial dive income, still a faucet |
| Raid winnings (steal + participation) | `gameStore.launchRaid` | steal = 65% of site pool |
| Quest rewards | `gameStore.claimQuest` | 400–2,000 per quest |
| Exploration gold (chests, battle wins) | `ExplorationScreen` | via `creditGold` |
| Arena (Coliseum) rewards | `ArenaController` | via `creditGold` |
| Leviathan raid prizes | `LeviathanRaidModal` → `claimLeviathanWin` | win tapered daily (§5): 5,000 / 2,500 / 1,250; consolation 100 untapered |
| Daily rewards — **Tidewell Rewards** | `DailyRewardsModal` | **prize credit** (see §9) |
| Tidepass gold tiers | `TidepassModal` | via `creditGold` |
| Clan chest tiers | `ClansModal` | via `creditGold` |
| Charter settlements (renter + owner earnings) | `CharterModal` | via `creditGold` |
| Admin Console `addGold` | `gameStore.addGold` | cheat mint — untithed but **counted**; its ledger supply delta is clamped to the cap |

Mining pays materials, not GOLD, so it is not a gold faucet. Friends
gifts are style-only items bought with GOLD (a sink) — friends never
send gold.

### Sinks (gold destruction / removal)

| Sink | Rate | Destination |
| --- | --- | --- |
| Tide Tithe (income levy) | 0/3/5/8% progressive | 50% burned, 50% Tide Treasury |
| Tide Tax (hoard levy) | 2% of balance above 500,000, weekly | 100% Tide Treasury |
| Bazaar sale fee | 3.85% of price (seller) | 1.00pp of price → Treasury, rest burned |
| Genesis sale fee | 3.85% of price (in the price) | same split as Bazaar |
| Hall hire fee | 10% of hire fee | half burned, half Tide Treasury |
| Breeding | 2,500 → 70,000 by breed count | destroyed |
| Team slots 6–7 | 50,000 / 120,000 | destroyed |
| Crafting, upgrades, guard posts, reef plots, charters' fees, insurance, exploration entry, arena entry/refresh, style gifts | various | destroyed (spending is never tithed) |
| Auction escrow | temporary | **not a sink** — refunded in full (exempt) |

Sink *rates* are never price-indexed (§4): a fee quoted today is the
fee forever, so the sink side of the economy stays exactly as planned
while the goods side absorbs inflation.

---

## 7. The Tide Tithe — tax on income

Applies to every gameplay gold **credit** (the faucets above) except the
exemptions in §10. Debits (spending) are never tithed.

The rate is set by the player's gold balance **before** the credit
(`TITHE_BRACKETS` in `engine/config.ts`):

| Balance before credit | Rate |
| --- | --- |
| < 25,000 | **0%** |
| 25,000 – 99,999 | 3% |
| 100,000 – 499,999 | 5% |
| ≥ 500,000 | 8% |

- `tax = floor(amount × rate)`, never more than the credit. Because of
  the floor, tiny earnings are effectively untouched (a 33 GOLD reward
  at 3% pays 0 tax; a 400 GOLD daily reward at the 5% bracket pays 20).
- Split of every tax (`TITHE_BURN_SHARE = 0.5`): the burned half is
  `floor(tax / 2)` and is destroyed forever (it also leaves circulating
  supply, §11); the remainder — including the odd gold on odd taxes —
  flows into the Tide Treasury (a transfer inside circulating).
- All faucet credits route through ONE helper: `applyGoldCredit` in
  `engine/economy.ts`, exposed to the render layer as the store action
  `creditGold(amount, opts)`.

**Why progressive:** a flat tax would either be invisible to whales or
crushing to beginners. At 0% under 25,000, the entire early game
(starting gold is 2,000) is tax-free; the levy only bites once a player
is earning from a position of wealth, and it scales with that wealth.

## 8. The Tide Tax — tax on hoards

The levy the Codex and Tutorials long documented is real
(`applyTideTax`, assessed lazily by `gameStore.tickTimers`, the same
tick that runs the daily resets):

- **Once per rolling 7-day window** (`TIDE_TAX_WINDOW_MS`), anchored at
  a persisted timestamp (`economy.lastTideTaxAt`).
- **2%** (`TIDE_TAX_RATE`) of the balance **above** `tideTaxThreshold`
  (500,000) only. The first 500,000 is never touched: a 600,000 balance
  pays exactly 2,000; a 500,000 balance pays 0.
- **100% to the Tide Treasury** (it is a recycling levy on idle hoards,
  not a burn) — a transfer inside circulating supply, so the Tide Tax
  never changes circulating either way.
- **Never silent:** a levy fires a toast ("Tide Tax: −X GOLD to the
  Tide Treasury") and is visible in the Economy Health ledger (total
  tax paid, window anchor date).
- **Never retroactive:** saves that predate the ledger materialize
  their anchor at first sight and are not taxed for time already
  played. The anchor only advances when a levy is actually collected,
  so dipping below the threshold during an assessment doesn't shield a
  later hoard.

## 9. The Tide Treasury — the recycling loop

The Treasury is the developer-tax leg, made visible and accountable:

- **In:** 50% of every Tide Tithe, the 1.00pp share of every market
  fee, half of every Hall platform fee, and 100% of every Tide Tax.
- **Out:** real gold prizes are paid from the Treasury **first**; only
  the shortfall is freshly minted (and at the cap, the Treasury is
  also the emission gate's reserve, §3). Today the live prize path is
  **Tidewell Rewards** (the Daily Rewards modal): its claims pass
  `{ prize: true }` to `creditGold`, and the ledger tracks
  `treasuryOut` so players can see prizes were tax-funded rather than
  printed.
- **The Weekly Lottery currently pays no real gold** — its winners and
  prize table are a provably-fair *display* (seeded, hash-committed)
  and its tickets are free. There is therefore no honest way to "top
  up" its pool: the Treasury stands behind it as the accounted prize
  reserve, and the moment a real draw payout ships, it plugs into the
  same `{ prize: true }` path and `treasuryOut` starts moving for it
  too. Inventing a payout the game doesn't have would be worse than
  honest accounting.
- **Market fees:** the seller's total fee is unchanged (3.85%, charged
  to the seller, out of the sale proceeds). Only its *destination* is
  new accounting: of the price, 1.00 percentage point → Treasury, the
  remaining 2.85 points of fee → burned (`applyMarketFeeSplit`).
  Genesis sales carry the same fee and the same split. The auction
  modal's "3.85% fee" is copy in mock flows — no real gold fee exists
  there to split (its only real money movement is escrow, which is
  exempt and refunded in full).

## 10. Exemptions — never tithed, never taxed

- **Auction escrow deposits and refunds** (`refundGold`): the gold was
  the player's all along; the deposit debit is not counted as burned
  and the refund is not counted as minted.
- **Purchase refunds** generally.
- **Seller proceeds at the moment of sale:** the market fee (§9) is the
  seller's tax; proceeds are credited whole.
- **Starting gold** (2,000 at account creation) and the player's **own
  money returning** — e.g. the owner share when hiring back your own
  Hall-listed crab.
- **Spending** of any kind (debits are sinks, not income).

## 11. The economy ledger & the supply invariants

Additive save state on the player profile (`economy?: EconomyLedger`,
materialized over safe defaults for pre-tokenomics saves):

| Field | Meaning |
| --- | --- |
| `totalMinted` | Gold **created** by faucet credits (gross of tithe; Treasury-sourced portions excluded — they are transfers) + admin mints (supply-clamped) |
| `totalBurned` | Gold permanently destroyed via tax/fee burn shares + admin removals |
| `totalTaxPaid` | All Tide Tithe + Tide Tax this player has paid |
| `treasury` | Current Tide Treasury balance (starts 0 in a save; see §1) |
| `treasuryIn` / `treasuryOut` | Lifetime Treasury inflow / outflow (prizes + gate funding) |
| `lastTideTaxAt` | Rolling 7-day Tide Tax anchor (ms epoch) |
| `circulating` | GOLD in circulation worldwide (genesis: 10,500,000,000) |
| `emissionWindowStartAt` | Anchor of the rolling 365-day minting window (ms epoch) |
| `windowBaseCirculating` | Supply the current window started with (allowance = 3% of this) |
| `emittedInWindow` | Net GOLD created by reward mints inside the current window |
| `priceIndex` | The stabilizer multiplier for system prices (starts 1.0) |
| `circulatingAtIndex` | Supply snapshot at the last index adjustment |
| `lastIndexAt` | Price-index anchor (ms epoch) |

Plus, on the profile itself: `leviathanWinsToday` /
`leviathanWinsResetAt` — the Leviathan taper's rolling daily window.

**The invariants** (asserted in `tests/unit/tokenomicsV2.test.ts` after
every kind of flow, and checked by `supplyInvariantHolds`):

1. `circulating ≤ MAX_SUPPLY_GOLD` (21,000,000,000) — at all times, on
   every path, including admin mints (whose *ledger* delta is clamped;
   an admin's own balance is their business, the world's books are
   constitutional).
2. `circulating = INITIAL_SUPPLY + totalMinted − totalBurned` —
   exactly. Treasury movements are transfers *inside* circulating and
   never appear in the identity; only creation (rewards, counted
   admin mints) and destruction move supply. The passage of time is
   not a term in this identity — it appears nowhere, because it
   creates nothing.
3. Burns decrease circulating; Treasury transfers never do; the
   tithe's burned half decreases it and its Treasury half does not.
4. `emittedInWindow ≤ 3% × windowBaseCirculating` in every window:
   reward minting never outruns the speed limit, and the window rolls
   only after a full 365 days, re-based on current supply.

Every migrated path updates the counters in the same `set()` as the
gold itself, so the ledger can never drift from the balance it
describes. The Economy Health modal renders these numbers live: the
**Your Tide Ledger** panel (the save's own flows) and the **GOLD
Supply** panel (circulating vs the cap with a progress bar, the live
minting-window usage, the price index, and the pace note), next to the exact
rules — which the Codex also quotes, including the three headline
numbers, interpolated from the same constants.

Deliberately uncounted: generic `spendGold` debits (purchases are
removals, not burns-with-a-destination, and the same action serves many
sinks; a purchase removes gold from the *player*, and in this
single-save world model the NPC side of the trade is not a tracked
supply — player-side supply accounting is defined over creation and
destruction events, which is what the invariant measures), the NPC-side
economy (NPC gold is not tracked anywhere in the game), and the dead
seller-credit branch in `buyBazaarListing` (unreachable since
self-purchases are rejected; if it ever becomes reachable it is exempt
by rule, §10).

## 12. Fairness rationale, in one place

- New players pay **nothing** until 25,000 GOLD — well past the
  tutorial economy (start: 2,000).
- The hoard tax can only ever touch the **excess over 500,000**, and
  only **2% of that excess, weekly** — it trims idle hoards; it cannot
  impoverish.
- Taxes are **floored**, so small rewards round down to no tax.
- Your own money (escrow, refunds, sale proceeds, self-hire returns)
  is **never** income and never taxed.
- Every levy is **visible**: claim toasts show net amounts and tithe
  deductions, the Tide Tax announces itself, and the ledger + Economy
  Health panels publish the player's own numbers, the Treasury's, and
  the world's supply.
- The tax **funds the players back**: half is burned against
  inflation, half returns as prizes through the Treasury.
- Supply is **capped and paced**: no hidden mint exists and no
  schedule prints gold for existing; the only creation path is
  gameplay rewards through the gate, paced at ≤3%/year — and it is
  all in this document.
- The best gold each day is the **first** gold (§5): the game rewards
  showing up, across many systems, instead of rewarding whoever
  grinds a single faucet the longest.

## 13. Tuning

All parameters are named constants in `src/game/engine/config.ts`:
`MAX_SUPPLY_GOLD`, `INITIAL_SUPPLY_GOLD`, `TARGET_INFLATION_RATE`,
`EMISSION_WINDOW_MS`, `PRICE_INDEX_WINDOW_MS`, `PRICE_INDEX_MAX_STEP`,
`PRICE_INDEX_MIN` / `PRICE_INDEX_MAX`, `LEVIATHAN_WIN_GOLD`,
`LEVIATHAN_CONSOLATION_GOLD`,
`LEVIATHAN_TAPER_RATES`, `TITHE_BRACKETS`, `TITHE_BURN_SHARE`,
`MARKET_FEE_TREASURY_POINTS`, `TIDE_TAX_RATE`, `TIDE_TAX_WINDOW_MS`,
and `CONFIG.tideTaxThreshold` / `CONFIG.bazaarFeePercent` /
`CONFIG.hallFeePercent`. Change them there only — engine, store and UI
all read from that one source, and `tests/unit/economy.test.ts` +
`tests/unit/tokenomicsV2.test.ts` pin the shipped values.
