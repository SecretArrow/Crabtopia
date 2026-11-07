# Crabtopia Logic Audit — 2026-11-07

Full audit of game logic across `src/game` (engine, store, data, and the
render layer where it computes or displays numbers), run against `main`
at `0c9e8dc`. Mandate: every rule must match its own label/docs/UI text;
every cost must be checked and charged; no reward claimable twice or
without its condition; no balance creatable from nothing; every declared
cap/gate enforced; stated probabilities must be the real ones.

**Evidence standard:** every fix below has (a) file-level evidence and
(b) a regression test that failed before the fix and passes after.
Anything that could not be proven is listed under *Design decisions
flagged* or left alone — nothing was "fixed" on suspicion.

**Totals:** 21 findings fixed (18 defect families; the raid and
Bazaar/Hall families are itemized per sub-defect) in 12 commits.
Unit tests 356 → 392 (all
passing). Lint 0 errors / 4 warnings (baseline). `tsc --noEmit` error set
identical to the `0c9e8dc` baseline (25 pre-existing errors, same files).
Build OK. Targeted e2e 23/23 (activities, modal-sweep, team-builder,
team-gameplay, arena-flow, auto-battler, genesis-market).

---

## 1. Defects fixed

### Store — dive / team bookkeeping (`3fbbd95`)

1. **deployDive stranded crabs in "diving" forever.**
   `deployDive` never checked that the site exists in `worldSites` or is
   unoccupied. Deploying team B onto team A's site overwrote
   `occupiedBy`/`teamId`; team A's crabs stayed `activity: "diving"`
   forever (claim/retreat only free the site's *current* team). A bogus
   or tutorial site id (tutorial site lives in `player.digSites`) did
   the same to the deploying team. The UI only offers free sites; the
   store enforced nothing.
   *Fix:* reject (false + toast) when the site is missing or occupied.
   *Tests:* `gameStore.test.ts` — occupied-site and unknown-site deploys
   rejected, crabs stay idle, dive count unchanged.

2. **deleteTeam / removeCrabFromTeam stranded diving crabs.**
   `deleteTeam` had no deployed check: deleting a team referenced by a
   deployed site made `claimDive`/`retreatDive` unable to find the team,
   so its crabs were never freed (gold was still paid).
   `removeCrabFromTeam` could pull a currently-diving member out of the
   slots the claim resolves through.
   *Fix:* `deleteTeam` refuses while a deployed site references the
   team; `removeCrabFromTeam` refuses removing a diving crab.
   *Tests:* delete attempt mid-dive leaves the team intact and the
   subsequent claim frees all crabs; slot removal of a diving crab is
   refused.

### Store — Bazaar / Hall integrity (`a94c7aa`)

3. **Buying your own Bazaar listing duplicated the crab.**
   In `buyBazaarListing`, for a player-sold crab the listed crab is
   still in the seller's roster (listing only sets its activity), so the
   "transfer" appended a second copy with the same id — net cost was
   only the 3.85% fee. Self-buys of either item type also progressed
   the `bazaar_trade` quest for free (at price 1 the fee rounds to 0).
   *Fix:* self-purchases are rejected with a toast.
   *Test:* own listing purchase returns false; exactly one copy of the
   crab; gold unchanged.

4. **Unvalidated listing prices/fees created gold from nothing.**
   `listCrabInHall(crabId, fee)` accepted any fee; with a negative fee,
   `hireCrab` computed `ownerShare = fee − round(fee × 0.1)` and the
   hirer came out *ahead* — gold minted per hire. Bazaar prices were
   likewise unvalidated.
   *Fix:* finite price/fee ≥ 1 required (rounded to integer) in
   `listCrabInHall`, `listCrabInBazaar`, `listEggInBazaar`.
   *Tests:* negative hall fee creates no listing; non-positive bazaar
   price creates no listing.

5. **Self-hire farmed the Mercenary Captain quest.**
   `hireCrab` progressed `hire_crab` ("Hire 3 mercenaries", 600 GOLD)
   even when hiring back your own listed crab — ~5 GOLD of platform fee
   per progress point. (The hire itself is honest: gold is checked, an
   NPC crab really joins the roster.)
   *Fix:* quest progresses only for NPC-owned listings.
   *Test:* self-hire leaves quest progress at 0.

### Store — Shellwarden XP / level desync (`5c624bb`)

6. **Four XP grants never recomputed the level.**
   `addXp` derives `shellwardenLevel` from total XP (level L+1 at
   L×500 XP), but `claimDive` (+50), `launchRaid` (+80/+30), `breed`
   (+100) and `hatchEggNow` (+150) wrote `shellwardenXp` directly. The
   level is player-visible ("Level {n} · {xp} XP" on Home) and gates
   content (auctions at Lv10, clans, defense hub), so it silently
   lagged the XP total.
   *Fix:* one shared `withXp(player, amount)` helper; all five grant
   sites route through it.
   *Tests:* XP set to 480/450/400, then dive claim / breed / hatch each
   cross a threshold and yield level 2 (was: level 1).

### Store — raid validation + insurance party (`ed1051e`)

7. **Raiding your own site paid rewards from nothing.**
   `launchRaid` never checked `site.ownerIsPlayer`. Raiding your own
   deployed site always paid the participation reward
   (8% of base reward), win or lose, repeatable per raid energy. The UI
   excluded own sites; the store did not.
   *Fix:* own-site raids rejected.
   *Test:* raid on own deployed site returns null; gold and raid energy
   unchanged.

8. **Raid inputs were unvalidated.**
   Duplicate raider ids counted twice toward the required 5 (the check
   was a post-map `length !== 5`); raider crabs were never checked
   idle, so diving crabs could fight while deployed.
   `CONFIG.maxReinforcements = 2` was declared but never enforced —
   and duplicate/reinforcement-overlapping ids inflated BP.
   *Fix:* raiders must be 5 distinct idle crabs; reinforcements are
   sanitized (dedupe, exclude raiders, own crabs must be idle, cap at
   `CONFIG.maxReinforcements`); the Raid record stores the sanitized
   list.
   *Tests:* 6 reinforcement ids (incl. a duplicate and a raider id)
   sanitize to ≤ 2 unique non-raiders; an all-diving raider team is
   rejected.

9. **Insurance punished its buyer.**
   `stolenAmount` used the *raider's own* `player.insuranceActive` to
   halve what they stole (0.5 instead of `CONFIG.raidStealPercent`
   0.65). The 50% cap belongs to the *defender's* policy (cf.
   `INSURANCE_CAP` in DefenseHubModal); as written, buying insurance
   made the buyer strictly worse at raiding.
   *Fix:* steal always uses `CONFIG.raidStealPercent` against NPC
   sites.
   *Test:* insured raider with an overwhelming team steals exactly
   `round(10000 × 0.65) = 6500` (was 5000).

### Raid/leviathan engine — `src/game/engine/battle.ts` (`807dfa1`)

10. **Shellmender heals could exceed max HP.**
    The heal did `allyHP[healIdx] += heal` with no cap (max HP in this
    engine is `stats.hp + level × 20`); it preferentially targets the
    lowest-HP ally, which at battle start is a full-HP ally, and emitted
    a heal event regardless of effect. Regression evidence: a crab
    ended a seeded battle at **1568 HP against a 1314 max**.
    *Fix:* clamp to max HP, report the actual healed amount, skip the
    event when nothing was healed. The heal RNG roll is still consumed,
    so stream order/determinism is unchanged.
    *Test:* 150 seeds — no crab on either side ever ends above max HP;
    all heal events report > 0.

11. **`TACTIC_CARDS.oppMod` was dead data.**
    `oppMod` was defined for ambush (−0.02), siphon (−0.03), bait
    (−0.04) and counter (−0.03) but read nowhere; `tacticEffectiveness`
    applied only `selfMod` + counter bonus, capped at +0.12 with no
    floor (the header comment promises "capped at ±12%"). The printed
    card strengths only reconcile *with* oppMod (Ambush "+8%" = +6%
    self and −2% opponent).
    *Fix:* my effectiveness now includes the opponent card's `oppMod`;
    clamp is [−0.12, +0.12].
    *Test:* identical teams/cards except the raider's card — defender
    BP is identical vs Ambush and vs Fortify before the fix (7295 =
    7295) and strictly lower vs Ambush after; counter bonus still
    stacks on top.

### Modal claim family — real gold, ephemeral guards

All of these modals pay **real gold from the live store** while their
"already claimed" guards lived in `useState`. Closing and reopening the
modal (or leaving/rejoining) reset the guard and paid again, without
limit. Regression tests for the whole family live in
`tests/unit/modalClaims.test.tsx` (claim → unmount → remount → claim
again must pay 0).

12. **DailyRewardsModal — daily reward claimable per reopen** (`2e011af`).
    `claimedToday` was `useState(false)`; the claim pays
    `addGold(todayReward.gold)` (400 GOLD at the mock streak's cycle
    day 5). No persistence anywhere in the file.
    *Fix:* persist the Asia/Jakarta day index of the last claim (the
    file already had the Jakarta-midnight math) in localStorage;
    `claimedToday` derives from it.

13. **TidepassModal — season tiers re-claimable per reopen** (`2e011af`).
    `claimedFree`/`claimedSupporter` were `useState` Sets; gold tiers
    (200 + 500) re-paid on every mount.
    *Fix:* both sets persist per season in localStorage; the claim
    handlers themselves now refuse already-claimed or not-yet-unlocked
    tiers (previously only the button state gated them).

14. **FriendsModal — daily gift limit reset per reopen** (`2e011af`).
    `giftsSentToday` was `useState`; the stated "3 style gifts per day"
    cap (a gold sink) reset on remount.
    *Fix:* count persists with its Jakarta day stamp; a new day resets
    to the mock baseline (1 already sent), matching the seeded gift
    history.

15. **ClansModal — chest tiers farmable via leave/rejoin** (`db5d442`).
    `claimedTiers` was `useState([])` and `handleLeave`/`handleJoin`
    explicitly reset it. Joinable clans start with progressed chests
    (Stormcall Syndicate 41,900 → Bronze 2,000 + Silver 5,000 reached),
    so each leave→rejoin cycle netted **+6,000 GOLD** (7,000 claimed −
    1,000 join fee), unlimited, in one session. `handleClaim` also had
    no reached-tier check of its own.
    *Fix:* claimed tiers persist **per clan id** in localStorage;
    join/leave no longer reset them; `handleClaim` verifies the tier
    was reached.

16. **CharterModal — settled charters resurrected per reopen** (`db5d442`).
    `myActiveCharters` was seeded from `INITIAL_MY_ACTIVE` on every
    mount. Once the seeded charters' terms end, each reopen re-offered
    both settlements — renter 640 + owner 410 = **+1,050 GOLD per
    open**, forever.
    *Fix:* settled/ended/revoked charter ids persist in localStorage
    and filter the seed on mount; all three close handlers record the
    id.

17. **BazaarAuctionsModal — bid escrow was a one-way sink** (`d943c00`).
    `placeBid` charged the **full** bid amount every time: being outbid
    (the modal's own outbid simulation) never refunded, raising your
    own bid charged the full new amount on top of the old escrow,
    Buy-It-Now forfeited escrow held on that auction, and closing the
    modal forfeited all outstanding escrow (`playerBids` recorded the
    amounts; nothing ever read them back).
    *Fix:* raising a bid charges only the delta over held escrow;
    outbid refunds immediately; Buy-It-Now releases escrow into the
    purchase; unmount refunds every outstanding escrow.
    *Tests:* bid 380 → raise to 430 costs +50 total (was +430 more);
    close refunds to the starting balance; a deterministic outbid
    (fake timers, stubbed RNG) refunds in full.

18. **DefenseHubModal — paid purchases evaporated** (`bd1e697`).
    Guard Post upgrades (2,000 / 6,000 / 15,000 GOLD) only called the
    modal-local setter: `player.guardPostLevel` was read on open but
    never written, so reopening reset the level and the gold was gone.
    Insurance policies likewise reset to `[]` on every mount.
    *Fix:* new store action `setGuardPostLevel` writes upgrades
    through to the persisted profile; policies persist (with expiry)
    in localStorage.

### UI ↔ engine consistency (`c01df11`, `9d19ea9`)

19. **Weekly Lottery numbers contradicted its own table.**
    The header and prize-pool summary hardcoded "611 winners · 5,890
    GOLD total" directly above a `PRIZE_TIERS` table summing to **564
    winners and 23,000 GOLD** (1×5000 + 3×1000 + 10×500 + 50×100 +
    500×10); the most recent past draw (564 winners) agrees with the
    table. Separately, the "✓ Hash matches commitment" badge rendered
    unconditionally over a `LAST_DRAW_HASH` that was **not** the
    sha256 of the revealed seed shown next to it.
    *Fix:* both totals are derived from `PRIZE_TIERS`; `LAST_DRAW_HASH`
    is now the true `sha256(LAST_DRAW_SEED)`, pinned by
    `tests/unit/lottery.test.ts` (node:crypto digest equality + totals).

20. **Lucky Charm copy ≠ its only implementation.**
    Item description, use-toast and buff chip all promised "+5% drop
    rate for the next 3 explorations"; `ExplorationScreen` implements
    **+1 bonus material per treasure chest**, spends one charge per
    chest, and the `percent` field is read nowhere.
    *Fix (copy only, no balance change):* all three surfaces now say
    "+1 bonus material from each of the next 3 treasure chests";
    pinned by `tests/unit/luckyCharm.test.ts`.

21. **`TEAM_SLOT_COSTS` had drifted from reality.**
    `config.ts` exported `[50000, 120000, 250000, 500000]` ("slots
    4-7") — imported nowhere. Live behavior agreed everywhere else: 5
    free slots, then 50,000 / 120,000, cap 7 teams — hardcoded
    *separately* in `gameStore.createTeam` and in `TeamsScreen`.
    *Fix:* the constant now holds the real schedule with a corrected
    comment; store and screen import it; the cap is derived as
    `5 + TEAM_SLOT_COSTS.length`. No player-facing behavior change;
    a store test pins the full price ladder + cap.

---

## 2. Verified sound

Checked and found correct (with the proof noted). No changes made.

**Economy & claims**
- **Home double-claim suspicion — DISPROVEN.** "Tutorial dive
  complete! Claim +500" calls `claimDive(tutorialSite.id)` and pays the
  site's `rewardRemaining` (500), guarded by the completed→claimed
  state transition. "First Dive — Claim +500" calls
  `claimQuest("first_dive")`, guarded by `questProgress.claimed`. They
  are genuinely separate one-time rewards (1,000 total, each payable
  exactly once). Pinned by store tests.
- `claimQuest`/`progressQuest`: idempotent — claimed flag required,
  progress must reach target, progress clamps at target.
- **Bazaar fee 3.85%** (`bazaarFeePercent`): applied exactly once;
  buyer pays full price, seller (when an NPC sale settles to the
  player) is credited price − fee; rounding via `Math.round` is sane.
- **Genesis**: exactly 333 crabs, deterministic seed;
  `GENESIS_MARKET_COUNT = round(333 × 0.30) = 100` listed;
  `attemptGenesisPurchase` guards not_found / not_listed /
  already_sold / insufficient_gold — no double-sell (existing
  `genesis.test.ts` + store path).
- **Arena money flow**: entry cost charged exactly once in
  `ArenaController.handleDeploy` via checked `spendGold`;
  `ArenaBattle` completion is guarded by `endedRef`, so `onComplete`
  (and rewards) fire exactly once per battle, including Skip/Flee.
  Opponent refresh (50 GOLD + 30 s cooldown) is checked.

**Arena battle rewards** (pinned by new exact-value tests in
`arenaEngine.test.ts`)
- `calculateRewards` matches its doc comment to the digit: bonus =
  `50 + round(((max(1, avgLvl) − 1) / 49) × 195)` → +50 at avg 1, +245
  at avg 50; XP = `max(1, round(avgLvl × 15)) × survivors`; material
  drop measured at the documented 30% over 400 seeded states, 1–2
  items per drop; defeat pays exactly zero.

**Elements & breeding** (already covered exhaustively by
`elements.test.ts`; re-verified by reading)
- `effectiveness` is antisymmetric across all 18×18 pairs
  (×1.15 ⟺ reverse ×0.90); basic cycle and the specials' single edges
  match the design; combined-vs-combined component conflicts cancel.
- `rollChildElement` branch order matches its documentation: special
  mutation first (3%, 6% if either parent is combined/special), recipe
  pair → 40% combined else 50/50 inherit, weighted inheritance
  (own ×3, basic components ×1) — with deterministic branch tests and
  a seeded distribution test.
- Genetics eligibility blocks self-breeding, parent/sibling incest,
  non-idle and rookie parents, and `breedCount ≥ 5`; `breedCost`
  follows `BREED_COST_SCHEDULE[min(maxParentCount, 4)]`, so the 5th
  breed costs 70,000 as documented. `computeGeneOdds` display math
  exactly equals the sequential rolls in `breedCrabs`.
- **Legendary Lure works as stated**: +10% legendary chance flows
  Inventory → `buffs.legendaryChance` → Nursery → `breedCrabs`
  (capped at 1), and the charge is consumed only when `breed()`
  actually produces an egg.

**Activities & progression**
- Expedition power gates (0 / 1000 / 3500) are enforced inside
  `MiningScreen.handleMine`, not only greyed in the UI; energy and
  node cooldowns persist via localStorage; mining yield bonus =
  `min(0.6, (power − 1500) / 6000)` — the +60% cap and the ≈+12%
  fresh-team figure in the comment both check out; yields never go
  negative or shrink.
- Exploration: ticket spent and tile marked revealed *before*
  resolution (no re-roll farming); chest/enemy rewards are seeded per
  (mapSeed, tile); the trap debuff (−20% HP next arena battle) is
  genuinely consumed in `ArenaBattle` and deleted after use; map reset
  costs 100 via checked `spendGold`.
- Team selection for expeditions is safe: `TeamSelect` with
  `requireIdle` disables unavailable teams, and screens unmount on
  navigation, so no stale selection is reachable.
- Crafting: `canCraft` gate + in-flight disable + clamped material
  consumption — no double-craft race. Stat-buff items multiply by
  (1 + percent/100), rounded, permanent, item consumed — matches the
  "+X% permanently" copy.
- Store timers: `tickTimers` uses rolling-24h windows anchored on
  persisted timestamps (`dailyDiveResetAt`, `raidEnergyResetAt`) —
  reload-safe. Dive limit 6/day and raid energy are enforced in the
  store, not just the UI. Raid defender floor
  (`max(round(remaining × 0.35), remaining − stolen)`) is consistent
  with the 65% steal rate.

**Raid engine (otherwise)**
- Dead actors are skipped; targeting and healing only consider living
  crabs (no resurrection); this engine has no CC system, so no
  act-while-CC'd case exists. `teamBP` applies tactic modifiers
  multiplicatively to the team's own base — sound.

---

## 3. Design decisions flagged (unchanged)

These are questionable but arguably intentional; changing them is a
design/balance act, so they are documented here, **not** silently
changed.

1. **Tide Tax is documented but unimplemented.** `CONFIG.
   tideTaxThreshold = 500000`, the Codex and Tutorials describe a
   progressive tax above 500,000 GOLD, but no code anywhere charges
   it. *Recommendation:* either implement it where gold is granted, or
   remove the documentation so players aren't promised a sink that
   doesn't exist.
2. **Leviathan Raid is freely repeatable.** Entry has no cost or
   cooldown; victory pays +5,000 GOLD / +1,000 XP, defeat +100,
   guarded once-per-mount by a ref. Each repeat requires actually
   winning the raid battle, so this is gameplay-gated farming — a
   balance question. *Recommendation:* a daily cap or entry cost if
   the faucet feels too strong. (Its victory also progresses the
   `defend_raid` quest — commented in code as intentional, since NPC
   raids on player sites don't exist.)
3. **Admin Console is a demo cheat surface.** Mock authentication
   ("Demo mode — no real auth") in front of arbitrary `addGold`.
   Deliberate for a demo build; must not ship as-is.
4. **Dead profile field `insuranceActive`.** After fix #9 nothing
   reads it and nothing sets it. Dive insurance itself now works
   through the Defense Hub's persisted per-site policies. *Recommend:*
   delete the field, or wire it to a real NPC-raids-on-player
   simulation.
5. **Auction Buy-It-Now toast overpromises.** It says "Item delivered
   to your inventory", but the mock auction items are never delivered
   anywhere. Fix #17 only repaired the gold side. *Recommendation:*
   deliver the item or soften the copy.
6. **Weekly Lottery tickets are pure mock.** Ticket state is
   `useState` starting at 4 tickets; no gold is charged or paid. The
   objective contradictions (totals, hash) were fixed in #19; making
   tickets real economy is a design decision.
7. **Charter toast overpromises.** "…joined your roster" — the
   chartered crab never enters the player's roster (mock surface).
8. **Day boundaries differ per system.** Store resets roll on 24h
   anchors; Daily Rewards use Asia/Jakarta midnight; exploration
   tickets roll on 24h; the lottery draws Sunday 20:00 Jakarta. Each
   is internally consistent and reload-safe; unifying them is a
   product decision.
9. **Stat-of-1 rounding edge.** A +X% permanent stat item used on a
   stat of 1 rounds to no change but is still consumed. Rare and
   arguably fair (the item was used); flagged for awareness.

---

## Verification

| Check | Result |
|---|---|
| `bun run lint` | 0 errors, 4 warnings (baseline) |
| `bun x tsc --noEmit --skipLibCheck` | 25 errors — set identical to `0c9e8dc` baseline (verified via worktree diff) |
| `bun run test:unit` | **392/392 passing** (356 baseline + 36 new) |
| `bun run build` | OK |
| Targeted e2e | **23/23** — activities, modal-sweep (22 modals, phone + desktop), team-builder, team-gameplay, arena-flow, auto-battler, genesis-market |

Commits: `3fbbd95`, `a94c7aa`, `5c624bb`, `ed1051e`, `807dfa1`,
`aece961`, `2e011af`, `db5d442`, `d943c00`, `bd1e697`, `c01df11`,
`9d19ea9` (on top of `0c9e8dc`).
