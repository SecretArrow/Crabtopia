# Crabtopia

![CI](https://github.com/SecretArrow/Crabtopia/actions/workflows/ci.yml/badge.svg)
![E2E Tests](https://github.com/SecretArrow/Crabtopia/actions/workflows/e2e.yml/badge.svg)

**Crabtopia** is an underwater crab-kingdom **auto battler** for the web.
Collect and breed painted crab warriors, build 5-crab teams with real
formation tactics, and send them into arena battles that play themselves —
then dive for treasure, raid rivals, mine the reef, and trade on the
Bazaar of Tides.

Every crab carries one of **18 original ocean-kingdom elements**, and the
element is visible everywhere it matters: a gold medallion icon on its
badge, an aura of coloured light around the crab itself, and the colour
of the energy in every attack it makes.

---

## Table of contents

- [Game overview](#game-overview)
- [Combat: the auto battler](#combat-the-auto-battler)
- [The 18 elements](#the-18-elements)
- [How elements are shown (art layer rules)](#how-elements-are-shown-art-layer-rules)
- [Teams & formations](#teams--formations)
- [Activities & game modes](#activities--game-modes)
- [The Genesis Collection](#the-genesis-collection)
- [Classes & factions](#classes--factions)
- [Skills & battle presentation](#skills--battle-presentation)
- [Art & animation system](#art--animation-system)
- [Tech stack](#tech-stack)
- [Getting started](#getting-started)
- [Project structure](#project-structure)
- [Save data](#save-data)
- [Testing & CI/CD](#testing--cicd)
- [Asset pipelines](#asset-pipelines)
- [Development conventions](#development-conventions)

---

## Game overview

**Genre.** Full auto battler with team-building, breeding and an
idle-expedition layer. You make the strategic decisions — roster,
formation, breeding, equipment of your time — the battles themselves
are piloted by an AI on both sides while you spectate.

**The loop.**

1. **Start** with a team of 5 starter crabs (onboarding walks you
   through your first team).
2. **Fight** in the Arena: pick an opponent, deploy your saved team on
   the formation board, and watch the auto battle. Wins earn gold, XP
   and ladder standing.
3. **Grow** the roster: buy crabs on the Bazaar (including the limited
   Genesis Collection), hire mercenaries at the Driftwood Hall, and
   breed new crabs — breeding is the only way to reach the combined and
   special elements.
4. **Send teams out**: dives, raids, the Leviathan boss, tournaments,
   mining and exploration all consume whole teams and return loot.
5. **Refine**: edit teams (exactly 5 crabs, always), change formations,
   check the Codex for classes, breeds and all 18 elements.

**Roster rule.** Activities require a full team of 5. If you own fewer
than 5 crabs, the Teams screen and the team selector show a banner that
sends you straight to the Bazaar / Genesis Collection to complete your
roster — it disappears automatically once you own 5 or more.

---

## Combat: the auto battler

Battles are **5 vs 5** and fully automatic after deployment. One
deterministic AutoPilot (`src/game/engine/autoPilot.ts`) pilots **both**
teams with the same rules and no hidden RNG:

1. **Heal** the lowest-HP ally when it is below 55% HP and a heal skill
   is ready.
2. **Upkeep** shield/regen buffs and the team-sigil debuff while they
   are not active.
3. **AoE** when at least 2 enemies are alive and in reach.
4. **Focused damage** — only ever at position-legal targets, in
   priority order: finisher (estimated damage ≥ target HP) →
   element-weak target → lowest HP → frontmost row → smallest slot.
   Damage estimates mirror the real damage formula, including element
   effectiveness and row modifiers.
5. **Fallback** to the basic Claw Strike.

**Spectator controls.** Play/Pause, speed ×1/×2/×3, and Skip (resolves
the rest of the battle headlessly through the same engine and rewards
path). Fleeing is always available. A single **BattleClock**
(`src/game/animation/battleClock.ts`) drives sprites, particles,
projectiles and every AI timer in battle time, so **Pause is a true
freeze** — the battle clock provably does not advance while paused.

**Battlefield layout.** Both the battle and the deployment board use
one anchored slot map (`src/game/render/arena/slotLayout.ts`): columns
for back/mid/front rows (player at 10%/26%/42% width, enemy mirrored),
lanes spread evenly over the field height, one uniform slot box per
crab. Slots provably never overlap for any legal formation; attackers
lunge to the edge of the target's slot and return to their anchor. The
arena scales responsively — large on desktop, compact but readable on
a phone.

### Position rules (real combat rules, not cosmetics)

Implemented once in `src/game/engine/arenaEngine.ts` and mirrored in
the raid simulator `src/game/engine/battle.ts`:

| Rule | Effect |
|---|---|
| **Reach** | Single-target *melee* skills can only strike the frontmost living enemy row (front → mid → back). *Ranged* skills reach any row. AoE hits all rows. |
| **Frontline Guard** | Front-row crabs take **×0.9** damage from single-target skills. |
| **Backline Protection** | Back-row crabs take **×0.8** damage from single-target skills while any front-row ally stands. |
| Mid row | Neutral. AoE, heals and ally skills ignore row factors. |

---

## The 18 elements

Every crab has exactly one element (`src/game/engine/elements.ts`).
Names are original to Crabtopia's ocean kingdom; the Indonesian kind
label is shown as a sub-label in game (e.g. "Vulkara · Api").

### Basic elements (5)

| Element | Kind | Notes |
|---|---|---|
| **Vulkara** | Api (fire) | Home of the Cinderreef faction |
| **Nerala** | Air (water) | Home of Moonpool & Coral Court |
| **Bentala** | Tanah (earth) | |
| **Lintara** | Petir (lightning) | Home of the Stormwake faction |
| **Anila** | Angin (wind) | |

### Combined elements (7) — exact breeding recipes

| Element | Kind | Recipe |
|---|---|---|
| **Himara** | Es (ice) | Nerala + Anila |
| **Rimba** | Kayu (wood) | Nerala + Bentala |
| **Magmara** | Lava | Vulkara + Bentala |
| **Taufan** | Badai (storm) | Nerala + Lintara |
| **Dentuma** | Ledakan (explosion) | Lintara + Bentala |
| **Vapora** | Uap (steam) | Vulkara + Nerala |
| **Lodara** | Magnet | Anila + Bentala |

### Special elements (6) — breeding mutations only

**Pulvara** (Debu · dust), **Terika** (Panas · heat), **Obsidara**
(Api Hitam · black fire), **Prismara** (Kristal · crystal),
**Andhakara** (Kegelapan · darkness), **Waja** (Baja · steel).
No recipe produces them; they appear only as rare mutations (below).

### Effectiveness

Damage uses one shared helper in arena and raid battles:

- Basic cycle: **Vulkara → Anila → Lintara → Bentala → Nerala →
  Vulkara** (each beats the next). Strong hit **×1.15**, weak hit
  **×0.90**.
- Combined elements strike through **both** component basics; a
  strong+weak conflict cancels to neutral.
- Each special has exactly one documented strong edge (Obsidara >
  Vulkara, Terika > Anila, Prismara > Bentala, Pulvara > Lintara,
  Waja > Himara); Andhakara is strong against all basics.
- The chart is perfectly antisymmetric — `edge(a, d) = −edge(d, a)` —
  and unit-tested for all 18×18 pairs.

### Where a crab's element comes from

1. A **stored** element (bred crabs, purchased Genesis crabs) always
   wins.
2. Absolute identities: Gildclaw is always **Waja**; shadow/legendary
   breeds are always **Andhakara**.
3. Otherwise a deterministic **per-crab variation**: an FNV-1a hash of
   the crab's id picks from its faction's `[home, home, neighbour]`
   options — e.g. Cinderreef crabs are mostly Vulkara, some Magmara —
   so two crabs of the same class and faction can differ, stably, for
   the life of the save. No save migration is involved.

### Breeding element rules

Resolved by `rollChildElement` when an egg is created:

1. **Special mutation first**: 3% chance (6% if any parent is combined
   or special), drawn from the parents' lineage pools (e.g. a Vulkara
   lineage can mutate to Obsidara or Terika; Andhakara can arise from
   any lineage).
2. **Recipe fusion**: two different basic parents with a recipe fuse
   into the combined element at **40%**; otherwise the child inherits
   one parent's element.
3. **Weighted inheritance** otherwise: a parent's own element weighs
   ×3, a combined parent's basic components weigh ×1 each.

The Breeding screen shows a **"Kemungkinan Elemen Anak"** (possible
child elements) panel before you confirm, and the child's element on
the result. The full chart, including the recipe table, lives in the
in-game **Codex → Elemen (18)**.

---

## How elements are shown (art layer rules)

Crabtopia keeps a strict **layer separation**: base character art is
clean — no shields, orbs, weapons or spell effects baked into the crab.
Identity comes from body, shell and colour. Everything element- or
skill-related is a separate layer on top, in three places:

1. **Badge + medallion icon** (`ElementBadge`): every crab card, detail
   modal, team slot, Bazaar/Genesis listing and opponent entry shows
   its element as a gold-medallion icon (18 original icons in
   `public/art/elements/`, combined elements drawn as a fusion of their
   two parents) plus the name label.
2. **Element aura** (`src/game/data/elementAura.ts`,
   `src/game/render/ElementAura.tsx`): a soft halo/disc of the crab's
   element colour behind the character on cards, modals, menus and in
   battle. Colours match the badges, except four dark badge colours
   (Bentala, Lodara, Obsidara, Andhakara) use brightened aura variants
   that pass a tested WCAG luminance floor so they stay visible.
3. **Element-driven skill FX** (`src/game/animation/elementFx.ts`):
   in battle, the *form* of an effect comes from the skill, the
   *colour/energy* from the attacker's element. Damage flipbooks are
   hue-rotated from their measured native hue to the attacker's
   element hue (near-achromatic strips — slash, spark — are carried by
   an element-coloured glow instead), and projectiles and impact
   particle bursts use the element's aura colour. Heal/shield/buff
   skills deliberately keep their own theme colours so support effects
   never masquerade as attacks.

Class-only art surfaces (Codex class entries, gene thumbnails) show no
aura — there is no individual crab there to have an element.

---

## Teams & formations

**One team = exactly 5 crabs.** Validation rejects fewer, more, or
duplicated members (`src/game/engine/teams.ts`). Every activity starts
the same way — **Choose Activity → Select Team → Start** — through one
shared selector (`src/game/render/TeamSelect.tsx`) used by the Arena,
Dive, Raid, Leviathan, Tournament, Mining and Exploration. Players
never pick individual crabs to start an activity; individual selection
lives only in Team Management.

- **Team Management**: create up to 7 teams (extra teams cost GOLD),
  rename, delete, and edit the 5 positional slots. Stats, faction bonus
  and class synergy recompute live from the actual crabs.
- **Formations** (`src/game/engine/formation.ts`): each team saves a
  formation (front/mid/back distribution). Presets: **Balanced** 2/1/2,
  **Offensive** 3/1/1, **Defensive** 1/2/2, **Frontline** 3/2/0,
  **Backline** 1/1/3, plus **Custom** via click-to-move/swap on the
  deployment board — the same anchored slot map the battle renders.
- **Eligibility** (`src/game/engine/teamEligibility.ts`): incomplete
  teams and teams with busy members (diving, raiding, hired out,
  resting) are disabled in the selector with the exact reasons listed.
  Owning fewer than 5 crabs triggers the roster banner described above.

---

## Activities & game modes

| Mode | What it is |
|---|---|
| **Arena** | The core auto battler. Pick a foe, deploy, spectate; ladder, gold and XP rewards. |
| **Dive Map** | Team expeditions across dive zones for treasure. |
| **Raids** | Plunder raids against rival teams, resolved by the raid simulator with the same position and element rules. |
| **Leviathan (boss)** | Register a saved team against the boss; spectate/replay support. |
| **Tournament** | Bracket competition with a registered team. |
| **Mining** | Team-power gated nodes — **Kelp Ridge** (0), **Pearl Cavern** (1000), **Crystal Vault** (3500). Yields scale with team power, bonus capped at **+60%** (`src/game/engine/expeditions.ts`). |
| **Exploration** | The whole team expeditions together; wild encounters resolve from team aggregates against an enemy scaled to the team's average level (deterministic per tile seed). |
| **Breeding & Nursery** | Genetics-based breeding (body parts, genes, elements) → eggs → hatching. The only source of combined/special elements. |
| **Crafting** | Per-crab crafting activities from gathered materials. |
| **Driftwood Hall** | Hire NPC mercenary crabs, browse the leaderboard. |
| **Bazaar of Tides** | The player market: list and buy crabs and items. A **3.85%** fee applies to trades (`bazaarFeePercent` in `src/game/engine/config.ts`). Includes auctions and the Genesis Collection tab. |

Around that core sits the game shell: quests, daily rewards, the
Tidepass, a weekly lottery, clans, friends, leaderboards, battle
replays and live raid spectating, a notification centre, and player
profiles — all reachable from the main shell (`GameShell`).

---

## The Genesis Collection

A fixed, deterministic collection of **333 Genesis Crabs**
(`src/game/engine/genesis.ts`):

- **#1–#100 (30%)** are listed for sale on the Bazaar's **Genesis
  Collection** tab.
- **#101–#333 (233)** are reserve stock and are never sold.
- Buying a listed Genesis Crab charges its listed price (the 3.85%
  bazaar fee is sunk from the proceeds, as in normal trades), adds the
  crab to your roster as a generation-0 crab, and marks the listing
  **Sold** — it cannot be bought twice. Sold state persists in the
  save.

---

## Classes & factions

**10 classes**, each with its own preview art and its own dedicated
battle sprite sheet (Rookie is the starter form and shares the Pincher
sheet with a kelp tint):

| Class | Role in battle |
|---|---|
| **Bulwark** | Front-line tank — taunts and slams |
| **Reaver** | Heavy melee — explosive claw slams |
| **Skitter** | Fast striker — rapid combo ripples, evasive |
| **Tidecaller** | Caster — AoE tidal bursts |
| **Shellmender** | Healer — mending pearls and regeneration |
| **Pincher** | Combo brawler — multi-hit pinches |
| **Warden** | Controller — ranged freezing bolts and binds |
| **Gildclaw** | Golden elite — radiant ultimate, always Waja |
| **Rookie** | Starter crab — grows into its lineage |
| **Legendary** | Rare shadow-touched breed — always Andhakara |

**6 factions** give each crab its home element and team bonuses:
**Coral Court** and **Moonpool** (Nerala), **Cinderreef** (Vulkara),
**Frostshelf** (Himara), **Stormwake** (Lintara), **Mangrove** (Rimba).

---

## Skills & battle presentation

Battle presentation is three strictly separated layers: **movement**
(the attacker's sprite-sheet clip), **ambient FX** (bubbles, motes,
status auras), and **skill FX** (flipbooks, projectiles, particles,
screen shake). The skill layer is data-driven by
`src/game/animation/skillProfiles.ts`: every skill resolves to a unique
profile — 15 profiles for the game's skill set, with the Tide Sigil
varying by the caster's class. Unknown/future skills fall back by their
legacy visual family with an archetype-appropriate profile, so no skill
ever renders "generic".

| Skill | Archetype | Attacker clip | Impact FX | Particles | Extras |
|---|---|---|---|---|---|
| Claw Strike (all) | basic_claw | attack | slash | sparks | — |
| Combo Pinch (pincher) | combo | combo @1.5× | slash ×3 | sparks | hit repeats |
| Ripple Strike (skitter) | combo | combo @1.85× | spark ×3 | splash | fastest combo |
| Reaving Claw (reaver) | heavy_slam | jump | explosion | explosion | light shake |
| Bulwark Slam (bulwark) | heavy_slam | jump | splash | splash | heavy shake, AoE |
| Tidal Burst (tidecaller) | aoe | skill | splash | splash | AoE |
| Golden Shower (gildclaw) | ultimate | skill | levelup | ward | light shake, AoE |
| Mending Pearl (shellmender) | heal | skill | heal | heal | — |
| Binding Tide (warden) | ranged_bolt | skill | ice | frost | ice projectile, arced |
| Tide Sigil — bulwark | shield_buff | skill | shield | ward @self | — |
| Tide Sigil — shellmender | heal | skill | heal | heal | regen |
| Tide Sigil — tidecaller | debuff | skill | dark | shadow | weaken |
| Tide Sigil — warden | ranged_bolt | skill | ice | frost | lightning projectile |
| Tide Sigil — DPS classes | debuff | skill | spark | sparks | defense-down shatter |
| Regen tick (synthetic) | heal | idle | heal | heal | small |

Damage-archetype rows are element-driven (see
[How elements are shown](#how-elements-are-shown-art-layer-rules));
heal and shield_buff rows keep their theme colours. Treated FX nodes
carry `data-fx-element="<elementId>"` in the DOM, which the e2e suite
uses to prove real battles show multiple attacker elements.

---

## Art & animation system

Characters are animated with a real frame-based sprite system — no
static images with CSS wobble for character motion.

**Assets.**

- `public/art/crabs/` — **10 preview portraits**, one unique file per
  class, chroma-keyed to true transparency (the pipeline hard-asserts
  every frame's corner alpha). Rendered by `CrabArtImage` on cards,
  menus, modals, Bazaar/Genesis listings, leaderboards and profiles.
- `public/art/sprites/` — **8 battle sprite sheets** (gildclaw, warden,
  reaver, pincher, bulwark, skitter, tidecaller, shellmender), each
  frame-mapped individually in `src/game/data/spriteAtlas.json`.
- `public/art/sprites/fx/` — **11 VFX flipbook strips** (slash, spark,
  lightning, splash, heal, explosion, shield, levelup, poison, ice,
  dark), 8 frames each, drawn procedurally.
- `public/art/elements/` — **18 element medallion icons** (256×256,
  transparent).
- Backdrops: the grand arena (`public/art/arena.png`), the bazaar
  (`public/art/market.png`) and the crab-city heroes
  (`public/art/city-hero.png`, `public/art/crabtopia-city.png`).
- Sizes are responsive: battle sprites are measured from their slot
  box (±123px on a desktop arena, ±58px on a phone) and card art uses
  stepped sizes (56/112/184/272px). `prefers-reduced-motion` freezes
  sprites on their first frame and disables ambient particles and
  decor; living decor (rising bubbles, shimmer) respects it everywhere.

**Engine** (`src/game/animation/`, pure TypeScript, unit-tested):
`spriteSheet.ts` (frame timing), `player.ts` (delta-time
`AnimationPlayer` with frame events), `stateMachine.ts` (13 states —
Idle/Walk/Run/Attack/Combo/Skill/Defense/Hit/Dodge/Jump/Fall/Victory/
Death — with explicit priorities and an Attack→Combo queue),
`particles.ts` (pooled `ParticleSystem`, global cap 600, presets),
`assetManager.ts` (preload/cache/dedupe), `battleClock.ts` (the shared
battle-time clock), `sheetResolver.ts` (class × faction → sheet),
`skillProfiles.ts` and `elementFx.ts` (above), plus a two-bone-IK
`puppetRig.ts` kept as a standalone rig demo outside the render path.
Jump/Fall surface as lunge/knockback arcs — this is an arena battler,
not a platformer.

**Adding a character/animation**: drop a new sheet PNG + atlas entry
(or extend a frame map), add the class/faction mapping in
`sheetResolver.ts`, and the state machine/player handle the rest; add
the sheet key to the sprite-animation e2e asset list.

---

## Tech stack

- **Next.js** (App Router) + **React** + **TypeScript**
- **Tailwind CSS** with a centralised design-token layer
  (`src/app/globals.css`: tiered frame language — standard / premium /
  legendary) and **Framer Motion** for UI motion
- **Zustand** (with persistence) for game state; **Prisma** is part of
  the app scaffold — gameplay itself is fully client-side and the save
  lives in the browser (see [Save data](#save-data))
- **Bun** as the runtime/package manager
- **Vitest** (unit) + **Playwright** (e2e), orchestrated by GitHub
  Actions

---

## Getting started

```bash
bun install
bun run dev        # dev server on port 3000
```

Other scripts:

```bash
bun run build      # production build (standalone output)
bun run start      # serve the production build
bun run lint       # ESLint
bun run typecheck  # tsc --noEmit
bun run test:unit  # Vitest (tests/unit/)
bun run test:e2e   # Playwright (tests/e2e/) — needs a dev/prod server
```

You do not need to run the build locally to contribute: every push to
`main` is verified by GitHub Actions (see below).

---

## Project structure

```
src/
  app/                 Next.js routes, layout, global styles/tokens
  game/
    engine/            Pure game logic (unit-tested): arenaEngine,
                       autoPilot, battle (raid sim), elements, genesis,
                       teams, formation, teamEligibility, expeditions,
                       genetics, crabs, bp, config, rng
    animation/         Sprite engine: player, stateMachine, particles,
                       battleClock, sheetResolver, skillProfiles,
                       elementFx, assetManager
    data/              spriteAtlas.json, classArt, elementArt,
                       elementAura
    content/           Static content: classes, factions, breeds,
                       body parts
    render/            React UI: GameShell, screens/ (Home, Teams,
                       Bazaar, Nursery, Hall, Map, Codex, Onboarding),
                       activities/ (Breeding, Crafting, Exploration,
                       Inventory, Mining), arena/ (battle + slotLayout),
                       cards/modals/badges/aura components
    store/             Zustand game store (persisted save)
public/art/            Game art: crabs/ (previews), sprites/ (+ fx/),
                       elements/ (icons), backdrops
scripts/               Asset pipelines (Python/PIL, see below)
tests/
  unit/                Vitest suites for the engine/animation modules
  e2e/                 Playwright specs (11 files + helpers)
.github/workflows/     ci.yml, e2e.yml
```

---

## Save data

- The save is a single persisted Zustand store in browser
  `localStorage` under the key **`crabtopia-save`**.
- Save changes are **additive only**: new fields are optional and old
  saves keep working (e.g. `Crab.element` is optional — legacy crabs
  resolve their element deterministically at read time; teams saved
  before formations derive one from slot order; Genesis sold state is
  stored as a set of sold ids).

---

## Testing & CI/CD

Every push to `main` runs GitHub Actions — this is the project's only
verification gate:

- **CI** (`.github/workflows/ci.yml`): ESLint, typecheck, **unit
  tests** (Vitest, ~296 tests over the pure engine/animation modules:
  genesis supply/market rules, team validation, position rules,
  element chart/breeding odds, slot-layout non-overlap proofs,
  BattleClock freeze semantics, skill profiles, element FX treatments,
  aura palette luminance…) and a production build.
- **E2E Tests** (`.github/workflows/e2e.yml`): Playwright specs
  covering onboarding, the arena flow and auto-battler controls, slot
  layout on desktop + mobile, team gameplay and the formation editor,
  activities, the Genesis market, elements (badges, auras, codex,
  battle FX element markers), and sprite animation assets.

House rule: **every feature ships with tests**, and existing specs
pass unmodified unless a feature deliberately replaces the behaviour
they specify (as happened when manual battles became the auto
battler — those specs were rewritten with the feature).

---

## Asset pipelines

Re-runnable Python/PIL scripts in `scripts/` regenerate the derived
art from the source sheets in `~/workspace/imagine_media/` (kept
outside the repo):

- `build_sprite_atlas.py` — chroma-keys character sheets (edge
  flood-fill + defringe), repacks frames, validates alpha, writes
  `public/art/sprites/*.png` and the atlas frame maps.
- `build_preview_art.py` — crops the per-class preview portraits into
  `public/art/crabs/` with the same corner-alpha assertions.
- `build_element_icons.py` — detects each medallion's ring and crops
  the 18 element icons into `public/art/elements/` (report:
  `scripts/element_icon_report.json`).

---

## Development conventions

- **Pull before you start, push to `main` when a phase is done.**
- **No local builds** — verification happens exclusively through
  GitHub Actions CI + E2E; both must be green for a change to count
  as done.
- **Art layer separation** (see
  [How elements are shown](#how-elements-are-shown-art-layer-rules)):
  base character art stays clean; elements and effects live in their
  own layers.
- **Save compatibility**: additive fields only; never break an
  existing player's save.
