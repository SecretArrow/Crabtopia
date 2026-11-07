# Crabtopia GOLD Tokenomics

GOLD is a single-player, off-chain game currency (no blockchain; saves are
local). Its tokenomics still matter: an unmetered faucet economy inflates
until prices, rewards and progression stop meaning anything. This document
is the canonical description of how GOLD is created, taxed, recycled and
destroyed. **Every parameter lives in `src/game/engine/config.ts`** and the
mechanics in `src/game/engine/economy.ts` — if a UI surface quotes a number
differently from those files, the UI is wrong.

Design goals:

1. **Inflation resistance** — every recurring faucet pays a progressive
   levy, and hoards decay; sinks scale with wealth instead of flat fees
   that only punish beginners.
2. **Mutual benefit** — the "developer tax" is an in-game **Tide Treasury**:
   a visible prize reserve funded by taxes and paid back out as prizes,
   not a black box. Half of the income levy is burned forever; the other
   half visibly funds prizes.
3. **Fairness** — new and small players are taxed 0%; only the *excess*
   over the hoard threshold is ever levied; a player's own money moving
   (escrow, refunds) is never taxed; nothing is ever deducted silently.

---

## 1. Faucet & sink inventory

### Faucets (gold creation) — all tithed via `creditGold` / `applyGoldCredit`

| Faucet | Where | Notes |
| --- | --- | --- |
| Dive claims (full + Gildclaw bonus) | `gameStore.claimDive` | base reward + 10%/Gildclaw |
| Dive retreat (partial) | `gameStore.retreatDive` | partial dive income, still a faucet |
| Raid winnings (steal + participation) | `gameStore.launchRaid` | steal = 65% of site pool |
| Quest rewards | `gameStore.claimQuest` | 400–2,000 per quest |
| Exploration gold (chests, battle wins) | `ExplorationScreen` | via `creditGold` |
| Arena (Coliseum) rewards | `ArenaController` | via `creditGold` |
| Leviathan raid prizes (5,000 win / 100 consolation) | `LeviathanRaidModal` | via `creditGold` |
| Daily rewards — **Tidewell Rewards** | `DailyRewardsModal` | **prize credit** (see §4) |
| Tidepass gold tiers | `TidepassModal` | via `creditGold` |
| Clan chest tiers | `ClansModal` | via `creditGold` |
| Charter settlements (renter + owner earnings) | `CharterModal` | via `creditGold` |
| Admin Console `addGold` | `gameStore.addGold` | cheat mint — untithed but **counted** as minted/burned in the ledger |

Mining pays materials, not GOLD, so it is not a gold faucet. Friends gifts
are style-only items bought with GOLD (a sink) — friends never send gold.

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

---

## 2. The Tide Tithe — tax on income

Applies to every gameplay gold **credit** (the faucets above) except the
exemptions in §5. Debits (spending) are never tithed.

The rate is set by the player's gold balance **before** the credit
(`TITHE_BRACKETS` in `engine/config.ts`):

| Balance before credit | Rate |
| --- | --- |
| < 25,000 | **0%** |
| 25,000 – 99,999 | 3% |
| 100,000 – 499,999 | 5% |
| ≥ 500,000 | 8% |

- `tax = floor(amount × rate)`, never more than the credit. Because of the
  floor, tiny earnings are effectively untouched (a 33 GOLD reward at 3%
  pays 0 tax; a 400 GOLD daily reward at the 5% bracket pays 20).
- Split of every tax (`TITHE_BURN_SHARE = 0.5`): the burned half is
  `floor(tax / 2)` and is destroyed forever; the remainder — including the
  odd gold on odd taxes — flows into the Tide Treasury.
- All faucet credits route through ONE helper: `applyGoldCredit` in
  `engine/economy.ts`, exposed to the render layer as the store action
  `creditGold(amount, opts)`.

**Why progressive:** a flat tax would either be invisible to whales or
crushing to beginners. At 0% under 25,000, the entire early game (starting
gold is 2,000) is tax-free; the levy only bites once a player is earning
from a position of wealth, and it scales with that wealth.

## 3. The Tide Tax — tax on hoards

The levy the Codex and Tutorials long documented is now real
(`applyTideTax`, assessed lazily by `gameStore.tickTimers`, the same tick
that runs the daily resets):

- **Once per rolling 7-day window** (`TIDE_TAX_WINDOW_MS`), anchored at a
  persisted timestamp (`economy.lastTideTaxAt`).
- **2%** (`TIDE_TAX_RATE`) of the balance **above** `tideTaxThreshold`
  (500,000) only. The first 500,000 is never touched: a 600,000 balance
  pays exactly 2,000; a 500,000 balance pays 0.
- **100% to the Tide Treasury** (it is a recycling levy on idle hoards,
  not a burn).
- **Never silent:** a levy fires a toast ("Tide Tax: −X GOLD to the Tide
  Treasury") and is visible in the Economy Health ledger (total tax paid,
  window anchor date).
- **Never retroactive:** saves that predate the ledger materialize their
  anchor at first sight and are not taxed for time already played. The
  anchor only advances when a levy is actually collected, so dipping
  below the threshold during an assessment doesn't shield a later hoard.

## 4. The Tide Treasury — the recycling loop

The Treasury is the developer-tax leg, made visible and accountable:

- **In:** 50% of every Tide Tithe, the 1.00pp share of every market fee,
  half of every Hall platform fee, and 100% of every Tide Tax.
- **Out:** real gold prizes are paid from the Treasury **first**; only the
  shortfall is freshly minted. Today the live prize path is **Tidewell
  Rewards** (the Daily Rewards modal): its claims pass `{ prize: true }`
  to `creditGold`, and the ledger tracks `treasuryOut` so players can see
  prizes were tax-funded rather than printed.
- **The Weekly Lottery currently pays no real gold** — its winners and
  prize table are a provably-fair *display* (seeded, hash-committed) and
  its tickets are free. There is therefore no honest way to "top up" its
  pool this round: the Treasury stands behind it as the accounted prize
  reserve, and the moment a real draw payout ships, it plugs into the
  same `{ prize: true }` path and `treasuryOut` starts moving for it too.
  Inventing a payout the game doesn't have would be worse than honest
  accounting.
- **Market fees:** the seller's total fee is unchanged (3.85%, charged to
  the seller, out of the sale proceeds). Only its *destination* is new
  accounting: of the price, 1.00 percentage point → Treasury, the
  remaining 2.85 points of fee → burned (`applyMarketFeeSplit`).
  Genesis sales carry the same fee and the same split. The auction
  modal's "3.85% fee" is copy in mock flows — no real gold fee exists
  there to split (its only real money movement is escrow, which is
  exempt and refunded in full).

## 5. Exemptions — never tithed, never taxed

- **Auction escrow deposits and refunds** (`refundGold`): the gold was
  the player's all along; the deposit debit is not counted as burned and
  the refund is not counted as minted.
- **Purchase refunds** generally.
- **Seller proceeds at the moment of sale:** the market fee (§4) is the
  seller's tax; proceeds are credited whole.
- **Starting gold** (2,000 at account creation) and the player's **own
  money returning** — e.g. the owner share when hiring back your own
  Hall-listed crab.
- **Spending** of any kind (debits are sinks, not income).

## 6. The economy ledger

Additive save state on the player profile (`economy?: EconomyLedger`,
materialized over safe defaults for pre-tokenomics saves):

| Field | Meaning |
| --- | --- |
| `totalMinted` | Net gold created by faucet credits (+ admin mints) |
| `totalBurned` | Gold permanently destroyed via tax/fee burn shares (+ admin removals) |
| `totalTaxPaid` | All Tide Tithe + Tide Tax this player has paid |
| `treasury` | Current Tide Treasury balance |
| `treasuryIn` / `treasuryOut` | Lifetime Treasury inflow / prize outflow |
| `lastTideTaxAt` | Rolling 7-day Tide Tax anchor (ms epoch) |

Every migrated path updates the counters in the same `set()` as the gold
itself, so the ledger can never drift from the balance it describes. The
Economy Health modal's **Your Tide Ledger** panel renders these numbers
live, next to the player's current tithe bracket and the exact rules.

Deliberately uncounted: generic `spendGold` debits (purchases are removals,
not burns-with-a-destination, and the same action serves many sinks), the
NPC-side economy (NPC gold is not tracked anywhere in the game), and the
dead seller-credit branch in `buyBazaarListing` (unreachable since
self-purchases are rejected; if it ever becomes reachable it is exempt by
rule, §5).

## 7. Fairness rationale, in one place

- New players pay **nothing** until 25,000 GOLD — well past the tutorial
  economy (start: 2,000).
- The hoard tax can only ever touch the **excess over 500,000**, and only
  **2% of that excess, weekly** — it trims idle hoards; it cannot impoverish.
- Taxes are **floored**, so small rewards round down to no tax.
- Your own money (escrow, refunds, sale proceeds, self-hire returns) is
  **never** income and never taxed.
- Every levy is **visible**: claim toasts show net amounts and tithe
  deductions, the Tide Tax announces itself, and the ledger + Economy
  Health panel publish the player's own numbers and the Treasury's.
- The tax **funds the players back**: half is burned against inflation,
  half returns as prizes through the Treasury.

## 8. Tuning

All parameters are named constants in `src/game/engine/config.ts`:
`TITHE_BRACKETS`, `TITHE_BURN_SHARE`, `MARKET_FEE_TREASURY_POINTS`,
`TIDE_TAX_RATE`, `TIDE_TAX_WINDOW_MS`, and `CONFIG.tideTaxThreshold` /
`CONFIG.bazaarFeePercent` / `CONFIG.hallFeePercent`. Change them there
only — engine, store and UI all read from that one source, and
`tests/unit/economy.test.ts` pins the shipped values.
