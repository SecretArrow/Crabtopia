# De-duplication Audit — One Canonical Surface per Feature

User rule: *there must be exactly ONE page/surface per feature — no
duplicate screens, duplicate flows, or duplicate nav entries.*

This document is the inventory that was audited, what counted as a true
duplicate, what was consolidated (and how capability was preserved),
and the borderline cases that were judged NOT duplicates, with
reasoning. Guard tests live in `tests/unit/navRegistry.test.ts`.

## 1. Inventory

### Nav entries (GameShell `NAV_ITEMS`, after consolidation)

| Nav label | Screen id | Component | Feature |
|---|---|---|---|
| Home | home | screens/HomeScreen | Dashboard / feature hub (opens modal features) |
| Arena | arena | arena/ArenaController | PvP auto-battler (menu → deploy → battle → results, ladder) |
| Teams | teams | screens/TeamsScreen | Team management (create/edit 5-crab teams, formations) |
| Dive Map | map | screens/MapScreen | World dive sites: deploy teams, launch site raids |
| Mining | mining | activities/MiningScreen | Mining nodes (team-power gated) |
| Explore | exploration | activities/ExplorationScreen | Wilderness exploration encounters |
| Nursery | nursery | screens/NurseryScreen | **Breeding (canonical)** + eggs, hatching, hatchlings |
| Crafting | crafting | activities/CraftingScreen | Item crafting (Tide Forge) |
| Bazaar | bazaar | screens/BazaarScreen | Player market + Genesis Collection |
| Hall | hall | screens/HallScreen | Driftwood Hall — hire mercenaries / list crabs for hire |
| Inventory | inventory | activities/InventoryScreen | Materials, items, consumable buffs |
| Codex | codex | screens/CodexScreen | Reference: classes, breeds, 18 elements + recipes |

Non-nav screens: OnboardingScreen (first-run only, replaces the shell
until a player exists).

### Modals (all opened from Home feature cards or in-flow)

| Modal | Feature | Opened from |
|---|---|---|
| AdminConsoleModal | Admin/dev console (feature flags, players, economy) | Home |
| BazaarAuctionsModal | Timed auctions (bid/buyout) | Home |
| CharterModal | Crab chartering contracts (hire-out terms) | Home |
| ClansModal | Clans (membership, clan pages) | Home |
| CrabDetailModal | Crab Dossier — THE crab detail view | Everywhere a crab is tapped |
| DailyRewardsModal | Daily login rewards calendar | Home |
| DefenseHubModal | Guard-post defense (base defense + upgrades) | Home |
| EconomyHealthModal | Economy dashboard (admin-facing metrics) | Home |
| FriendsModal | Friends list / gifting | Home |
| LeaderboardModal | Global standings (Shellwardens / Top Crabs / Clans / Faction War) | Home |
| LeviathanRaidModal | Leviathan boss encounter | Home |
| LiveRaidSpectateModal | Spectate live raids | Home |
| NotificationCenterModal | Notifications inbox | Shell top bar |
| ProfileModal | Player profile + crab showcase | Home / shell |
| QuestsModal | Quest list + progress | Home |
| RaidModal | Launch a raid on a specific dive site | Dive Map (per-site) |
| ReefPlotsModal | Reef plot management | Home |
| ReplayViewerModal | Watch recorded battle replays | Home |
| TideborneBoutiqueModal | Cosmetic store | Home |
| TidepassModal | Season pass (Tidepass) tracks | Home |
| TournamentModal | Tournament bracket + entry | Home |
| TutorialsModal | Tutorial catalog (reference) | Home |
| WeeklyLotteryModal | Weekly lottery | Home |
| (shell) Settings | Game settings | Shell top bar |
| TutorialGuide | First-run guided steps (overlay, not a modal feature) | Automatic |

Shared primitives (not features): `Modal` (one component, one file —
see §3.2), `TeamSelect` (shared team picker), `CrabCard` /
`CrabRenderer` / `CrabSprite` / `CrabArtImage` (one crab-rendering
family, different data shapes), `ElementBadge`, `ElementAura`.

## 2. True duplicate found & consolidated — Breeding (×2)

**Evidence.** Two complete, mutually inconsistent breeding
implementations existed:

| | A: `activities/BreedingScreen.tsx` (deleted) | B: `screens/NurseryScreen.tsx` (canonical) |
|---|---|---|
| Nav | "Breeding" | "Nursery" (same 🥚 icon) |
| Self-title | "Nursery Spire" (!) | "Nursery" |
| Engine | `generateCrab` with parents' faction/class picked at random | Genetics engine: body-part gene inheritance (`breedCrabs`), gene odds (`computeGeneOdds`) |
| Output | Instant crab, added directly to roster | Egg → incubation → hatch (`hatchEgg`), eggs sellable in Bazaar |
| Cost | Fixed 200g (`BREED_COST`, localStorage module) | `breedCost()` schedule by parents' breed counts |
| Cooldown | Own localStorage 30 s global cooldown (`BREEDING_KEY`) | Per-parent 30 s "nursery" activity lock in the store |
| Eligibility | Same-crab + breed-cap only (rookies & relatives allowed!) | `checkBreedingEligibility`: self, breed cap, parent/sibling, must be idle, rookies rejected |
| Progression | None | `breed_crab` quest progress, +100 Shellwarden XP, discovered-breeds/codex integration |
| Element child roll | `rollChildElement` at breed time | Same roll, inside `breedCrabs` (egg carries the element) |
| Element preview | Yes — "Child Element Possibilities" panel | Gene odds only (no element panel) |
| Legendary Lure buff | Consumed here (binary `allowLegendary`) | Ignored (item's promise silently dead on this path) |

**Decision.** B (Nursery/genetics) is canonical: it is wired into the
store, eggs, the Bazaar egg market, quests, XP and the Codex, and its
eligibility rules are the game's real rules. A was removed entirely.

**Capability preservation (before → after).**

| Capability | Before | After |
|---|---|---|
| Pick two parents & breed | A (roster grid) and B (popover picker) | B only (popover picker) |
| Child element possibilities preview | A only | **Added to B** — same engine preview, same `data-testid="breeding-element-preview"` |
| Legendary Lure ("+X% legendary chance for next breed", Inventory item) | A only, percent ignored | **B** — `breedCrabs`/`store.breed` take an additive `legendaryChanceBonus`; Nursery consumes one charge per successful breed and shows an "active" note; the percent is now honoured, not just the charge |
| Breed an egg / hatch / sell egg | B | B (unchanged) |
| Gene odds preview + full-odds modal | B | B (unchanged) |
| Instant (no-incubation) child | A | Retired deliberately: it bypassed the egg economy, quests and gene system; the capability "obtain a child from two parents" is fully preserved via B |
| A's extra 30 s global cooldown | A | Retired: duplicate restriction; B's per-parent lock + eligibility cooldowns remain |
| Arrive via old save `currentScreen="breeding"` | A | GameShell legacy alias: `case "breeding"` falls through to the Nursery render (single shared return) |
| Arrive via Arena menu activity tile | A | Tile retargeted: id/label/screen = Nursery |
| Admin feature-flag key "breeding" | — | Left as-is: an admin taxonomy key for the (now single) breeding feature, not a surface |

**Also removed with A:** its private localStorage exports
(`BREEDING_KEY`, `BreedingState`, `DEFAULT_BREEDING`,
`BREED_COOLDOWN_MS`, `BREED_COST` in `render/useLocalStorage.ts`) —
grep-verified to have no other consumers. `BUFFS_KEY` stays (Inventory
writes, Exploration + Nursery consume).

## 3. Other findings

### 3.1 Two nav entries, one feature family — resolved by §2
"Breeding" and "Nursery" sat side by side in the nav with the same 🥚
icon for what players experience as one feature (make/hatch crabs).
Now a single "Nursery" entry remains; the guard test locks it.

### 3.2 The shared `Modal` had two import paths — cleaned
`HallScreen`, `NurseryScreen`, `TeamsScreen`, `BazaarScreen` imported
`{ Modal }` from `./MapScreen`, which merely re-exported
`render/Modal.tsx` "for backward compatibility" — making one component
look like two sources. All importers now import `../Modal` directly
and the re-export is deleted. (One component all along; no behaviour
change.)

### 3.3 Naming alias: "Coliseum" — NOT a duplicate surface
"Coliseum" appears in the app meta description, an achievement id
(`coliseum_win`), engine comments, and the AdminConsole's feature
taxonomy ("Coliseum — Ranked PvP arena queue"). There is no Coliseum
screen, flow, or nav entry — the playable feature is the Arena
everywhere in gameplay UI. Judged a flavour alias in admin/meta text,
not a second implementation; left untouched (renaming admin flag keys
would orphan persisted flag state for zero player-facing gain).

## 4. Borderline cases judged NOT duplicates

| Pair | Why not a duplicate |
|---|---|
| LeaderboardModal vs arena/ArenaLeaderboard | Different scopes & jobs: the modal is read-only GLOBAL standings (players/crabs/clans/factions, season/weekly/all-time); ArenaLeaderboard is the Arena's own ladder integrated into the battle flow (inspect opponents → dossier → challenge). Neither can do the other's job. |
| HallScreen vs LeaderboardModal | Hall is not a leaderboard at all — it is the mercenary hire market (hire NPC crabs, list yours for hire income). No standings are shown. |
| BazaarScreen vs BazaarAuctionsModal | Different market mechanics on shared data: the screen is buy-now listings + the Genesis Collection; the modal is timed auctions (bids/buyouts). The Bazaar subtitle mentions auctions as part of the market family; auctions have exactly one implementation (the modal). |
| RaidModal vs LeviathanRaidModal vs LiveRaidSpectateModal vs ReplayViewerModal | Four distinct encounters/modes sharing the raid *simulator*, not one flow copied four times: site-raid launcher (per dive site), the Leviathan boss encounter, watching a raid live, and watching a recorded replay. |
| TeamSelect vs ArenaTeamBuilder vs TeamsScreen slot picker | Three different jobs on shared data: pick an existing team for an activity (TeamSelect, the single shared selector), arrange a formation on the deployment board before a battle (ArenaTeamBuilder), and edit a team's roster (TeamsScreen). No two do the same job. |
| CrabDetailModal vs ProfileModal showcase / picker rows | The Dossier is the single crab-detail implementation (ArenaMenu's own comment: "the ONLY place" a dossier opens from); pickers/showcases are selection lists that open it. |
| TutorialsModal vs TutorialGuide vs OnboardingScreen | Reference catalog vs in-context guided steps vs first-run account setup — three phases of help, not three copies of one. |
| DailyRewardsModal vs TidepassModal | Daily login calendar vs season-pass progression tracks. |
| DefenseHubModal vs RaidModal | Defense (your guard post, upgrades) vs offense (raiding others' sites) — opposite directions of one theme, separate systems. |
| CharterModal vs ClansModal vs HallScreen | Chartering = contract terms for hiring OUT a crab; Clans = guild membership; Hall = the hire marketplace itself. |
| AdminConsoleModal vs EconomyHealthModal | Console = controls (flags, players, actions); EconomyHealth = read-only metrics dashboard. |
| Codex teaser inside NurseryScreen | A summary card + "Open Codex →" deep-link to the canonical Codex — the sanctioned pattern (summary + deep-link), not a second codex. |
| Egg display in Nursery vs Inventory | Inventory has no egg UI at all (verified by grep); eggs live only in the Nursery. |

## 5. Guards & test updates

- **New unit suite** `tests/unit/navRegistry.test.ts`:
  - NAV_ITEMS ids and labels are each unique; exactly one Nursery
    entry; no Breeding entry (id or label).
  - `activities/BreedingScreen.tsx` does not exist and GameShell does
    not reference it.
  - Exactly one render file selects the store `breed` action
    (NurseryScreen).
  - The Nursery source carries `data-testid="breeding-element-preview"`.
  - The legacy `case "breeding"` alias exists and shares the Nursery's
    single render return.
- **E2E retargets (assertions' meaning preserved):**
  - `elements.spec.ts`: the child-element panel test now runs on the
    Nursery — it graduates two starters in the persisted save (the
    canonical picker rejects rookies), picks both parents via the
    popover, and makes the same badge/recipe/mutation assertions.
  - `activities.spec.ts`: the parent-slots + Breed-button test now
    targets the Nursery and is renamed to state the rule.
  - `buttons.spec.ts`: the "Breeding" case became "Nursery".
  - `smoke-tour.spec.ts`: duplicate "Breeding" stop removed from the
    nav tour (Nursery stop already existed); the playable-activities
    breeding step now visits the Nursery.
  - `viewport-sweep.spec.ts`: the "Breeding" destination was dropped —
    the Nursery destination already covered the surface, so the sweep
    now visits each feature exactly once.
