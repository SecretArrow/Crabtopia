# Real-Time Battler — Phase 2 Design Audit & Proposal

Status: **audit complete, no implementation yet.** This note records how the
Arena battle works today (verified against the code at the Phase 1 baseline),
what is missing for the user's real-time overhaul mandate, and the concrete
design Phase 2 should implement. The user has explicitly authorised replacing
the battle system, so specs that encode turn-based behaviour may be rewritten.

Scope of the audit: `src/game/engine/arenaEngine.ts`,
`src/game/engine/autoPilot.ts`, `src/game/engine/battle.ts` (raid sim),
`src/game/render/arena/ArenaBattle.tsx`,
`src/game/render/arena/slotLayout.ts`,
`src/game/render/animations/CrabBattleSprite.tsx`,
`src/game/animation/battleClock.ts`.

---

## 1. How battles flow today

### 1.1 The model is round/turn-based, presented sequentially

- `arenaEngine.initBattle` builds 10 `Combatant`s (5 per side) from the two
  rosters: slot 0–4, formation row (front/mid/back), free-placement lane,
  stats copied from the crab, element resolved via `elementOf`, energy 3/10.
- A **round** is: every living crab acts exactly once, in speed order
  (speed desc, class-order tiebreak). `resolveRound` (engine) implements
  this; `runBattle` loops rounds to a 30-round cap, then decides by
  remaining-HP ratio (ties → defender/enemy wins).
- **The presented battle does not use `resolveRound`.** `ArenaBattle`
  re-implements the round loop in the component:
  `startNextRound → processActor(idx) → advanceActor → endRound →
  startNextRound`, with a locally computed turn order mirroring the
  engine's. Per actor it:
  1. skips if defeated;
  2. consumes freeze (see §2) and animates a "Frozen" skip action;
  3. waits a fixed **600 battle-ms** "thinking" beat;
  4. asks the AutoPilot (`decideAction`) for skill + targets;
  5. applies the skill **immediately** via `applySkill` (all damage/heal/
     status mutation happens up front, before any animation);
  6. plays the presentation in `animateAction`: pose at t=0, lunge
     displacement for melee profiles, FX/projectiles spawned at
     **+350 battle-ms**, hurt poses + knockback + damage numbers, defeated
     poses, and cleanup + next actor at **+800 battle-ms**.
- End-of-round maintenance (regen ticks, +2 energy, cooldown ticks, status
  duration ticks, combo reset, winner check) is **duplicated**: the engine
  has it inside `resolveRound`, and `ArenaBattle` carries its own copy
  (`endRoundMaintenance`) because the presented path never calls
  `resolveRound`. Two sources of truth for the same rules — a drift risk
  that has to be watched manually today.
- **Two different AIs exist.** The presented battle is piloted by
  `autoPilot.decideAction` (heal <55% → support upkeep → AoE ≥2 → focused
  damage by finisher/element-weak/lowest-HP → claw fallback; deterministic,
  no RNG). The **Skip** button instead calls the engine's `runBattle`,
  whose internal AI is the much simpler `pickAiSkill`/`pickAiTarget`
  (support-pref or highest power; lowest-HP target). A skipped battle can
  therefore play out differently from the same battle watched — same seed,
  different brains.

### 1.2 Event/animation coupling

- Engine and presentation are coupled through the `ArenaAction` record
  (actor, skill, target ids, damage/heal totals, statuses applied,
  defeated ids, visual family, message). `applySkill` computes everything
  synchronously; the renderer then *re-enacts* the finished outcome over
  800 battle-ms. Consequences:
  - Damage is already deducted before the lunge/projectile visually lands;
    the projectile is decorative — its arrival triggers only the impact
    flipbook, never the damage.
  - Multi-target damage numbers show the action's **total** damage at
    every target (the per-target split is not retained).
  - Nothing can interrupt, retarget, or miss: there is no concept of a
    target dying while a projectile is in flight.
- All presentation timing runs on the shared **BattleClock**
  (`animation/battleClock.ts`): one rAF loop advances battle time;
  scale 0 = pause (a true freeze of sprites, particles, flipbooks,
  projectiles and every wait), ×1/×2/×3 = spectator speed. Battle time is
  mirrored to `data-battle-clock-ms` for tests. **Exceptions that still run
  on wall time**: framer-motion tweens (damage-number float, current-actor
  bob, the tombstone swap exit, victory/defeat banners, the crab exit
  animation on death) — they keep moving while the battle is paused.
- Presentation cadence budget at ×1: ~600 ms think + 800 ms action per
  actor, up to 10 actors per round → a full round can take ~14 s of
  presentation; battles can run 30 rounds. This sequential cadence is
  exactly the "animations triggered in turns" feel the user rejected.

### 1.3 Where results and rewards are produced

- Winner: `checkWinner` (a side has no living combatants; mutual wipe →
  enemy). Timeout at 30 rounds → HP-ratio decision in `runBattle`
  (presented path: the round loop just ends when `state.winner` is set;
  the timeout rule lives only in the headless runner).
- `finishBattle` (ArenaBattle) calls `calculateRewards(state, entryCost)`:
  victory gold = entry cost + 50…245 by enemy average level; XP = enemy
  avg level × 15 × surviving player crabs; 30% chance of 1–2 material
  drops. All rolls come from the battle's seeded RNG stream.
- Contract out of the battle: `onComplete({ winner, goldReward,
  xpReward, itemsFound, arenaId })` → `ArenaController`/`ArenaResult`
  apply gold/XP/items to the save and show the result dialog (WIN/LOSS
  per the audit-fix round). **Flee** short-circuits with zero rewards;
  **Skip** resolves headlessly via `runBattle` then finishes through
  the same path.
- Determinism: engine RNG is `mulberry32(seed ^ 0x9e3779b9)`, held in a
  WeakMap keyed by the (mutated in place) state object. Variance rolls
  (0.85–1.15 per target hit) and reward rolls draw from this one stream,
  in call order. The AutoPilot itself rolls nothing.

### 1.4 Layout today (slotLayout)

- Percentage field (0–100 × 0–100). Columns: player back/mid/front at
  x = 10/26/42, enemy mirrored (90/74/58). Lanes spread over y ∈
  [12.5, 87.5]. Uniform slot boxes (15% × 24%, shrinking for 4–5-per-row)
  provably never overlap at rest. The deployment board's free-placement
  lanes (3 rows × 5 lanes) carry into the battle as each combatant's
  `lane`; the battle renderer positions by row order + lane order on the
  same map.
- Movement is fake: units never leave their anchor except the scripted
  lunge (to the target slot's edge via `attackPoint`, +1% margin) and a
  2–10 px knockback flinch; both are framer-motion tweens on the slot's
  wrapper and always return exactly to the anchor. Melee "reach" is a
  targeting rule (frontmost living row), not a distance.

---

## 2. Status effects — inventory, durations, and the fairness gaps

### 2.1 What exists (arena only)

| Status         | Source                                                   | Duration        | Magnitude / effect                                        | Tick / consumption                                   |
| -------------- | -------------------------------------------------------- | --------------- | --------------------------------------------------------- | ---------------------------------------------------- |
| `weaken`       | Tidecaller Tide Sigil (`applyTo: all_enemies`)           | 2 rounds        | −25% attack (`effectiveAtk`)                              | −1 at end of round                                   |
| `freeze`       | Warden Tide Sigil (single target); Warden class special  | 2 turns         | magnitude 0 — hard skip: the crab cannot act              | consumed one per skipped turn, at the start of the victim's turn (both in `resolveRound` and in ArenaBattle's `consumeFreeze`); AutoPilot also refuses frozen actors (`decideAction` → null) |
| `defense_down` | DPS classes' Tide Sigil (single target)                  | 2 rounds        | +30% damage taken                                         | −1 at end of round                                   |
| `regen`        | Shellmender Tide Sigil (`applyTo: all_allies`)           | 3 rounds        | heals 8% max HP at end of round                           | heal, then −1 at end of round                        |
| `shield`       | Bulwark Tide Sigil (lowest-HP ally)                      | 2 rounds        | absorb pool = 45% of caster max HP + 8 × caster level HP  | pool depletes on damage; duration −1 at end of round |

Refresh rule (`addStatus`): re-applying takes `max(rounds, new)`,
`max(magnitude, new)` — except shield, whose pool **stacks additively**.
Statuses apply with **100% probability**; there is no roll.

Nothing else exists: **no sleep, stun, slow, silence, poison, or burn**
anywhere in the game. The raid simulator (`engine/battle.ts`) has **no
status system at all** — it is a BP-based exchange with element
effectiveness and position factors only.

### 2.2 Fairness mechanics that are ABSENT (user §7)

- **No resistance / tenacity.** No stat, level, class, or equipment input
  reduces application chance or duration. A level-1 Warden freezes a
  level-50 target for the full 2 turns, guaranteed.
- **No diminishing returns.** Freeze can be re-applied the moment it
  expires; with two Wardens alternating sigils (3-round cooldown, cost 5,
  +2 energy/round) a single target can be kept out of the fight for most
  of a battle. Nothing escalates or caps this.
- **No immunity windows and no uptime cap.** Hard-CC uptime per target is
  unbounded in principle.
- **No cleanse.** No skill removes a status from an ally. Heals restore
  HP only; a frozen ally simply waits. There is no counterplay decision
  for the pilot (or a future player) to make against CC.
- **No application chance / partial resistance.** Effects are binary and
  total: freeze always fully skips, weaken always −25%.
- Freeze is also the only *incapacitation* concept: there is no generic
  "cannot act" gate — it is special-cased in three places (engine round
  resolver, ArenaBattle's `consumeFreeze`, AutoPilot's guard).

### 2.3 Presentation of statuses today

`StatusEffectRow` (BattleFx) renders small chips under each crab inside
its slot card; application shows a floating text label ("Frozen!",
"Weakened!", …) and freeze shows a lightning flipbook + "FROZEN!" text on
the skipped turn. There is no persistent on-sprite CC visual (e.g. ice
encasement tint) beyond the chip row.

---

## 3. Death and the tombstone today

- Death is the engine flag `isDefeated`, set inside `dealDamage` the
  moment HP reaches 0. From that instant the combatant is excluded from
  turn order, targeting pools (`aliveOnSide`), AutoPilot decisions, and
  heals — **combat-logic sync is already correct**: the dead never act,
  move, or get targeted.
- Presentation sequence (animated path): `applySkill` returns
  `action.defeated[]` → at +350 battle-ms the renderer sets pose
  `defeated` (the sheet's **death clip** plays — every sheet has mapped
  death frames) → at +950 battle-ms a BattleClock timer sets
  `showTombstone`, and `CrabBattleSprite` swaps the crab for the
  `Tombstone` component (AnimatePresence cross-fade; the crab's exit is a
  0.4 s **wall-clock** framer tween — sink + shrink + fade).
- The tombstone itself is a small hand-drawn **generic grey SVG cross on
  a sand mound** with inscription lines and cracks. It is not themed to
  the underwater crab kingdom (no shell/stone-carving/pearl/seaweed
  language), and its idle sway + bounce-in run on framer-motion wall
  time, so it keeps swaying while the battle is paused.
- **Dead-pose leakage — the Skip path:** `handleSkip` resolves the battle
  headlessly (`runBattle`) and jumps straight to `finishBattle`. Any crab
  defeated inside that headless run has **no pose and no tombstone
  recorded** (those live only in the animated path), so during the
  ~1600 ms victory/defeat celebration the renderer shows it as a living
  idle crab with a 0 HP bar (its slot marker dims to 0.3 opacity — the
  only death cue). The same applies to any crab already defeated before
  the skip whose tombstone timer hadn't fired.
- The state machine treats `death` as terminal by design;
  `CrabBattleSprite` remounts the sprite (epoch bump) if a pose ever
  leaves `defeated` (new battle reuse).

---

## 4. Card chrome around battle units — Phase 2 removal list

The user's §9: while a unit moves/attacks it must read as a creature on
the field, not a card being carried around. Inventory of what wraps a
battle unit today (`ArenaBattle.tsx`, `CrabSlot` + row layers):

1. **The `CrabSlot` panel itself.** In anchored battle mode its resting
   state is chrome-free (transparent background, transparent border) —
   but the **current actor** gets `background: rgba(124,245,225,0.12)`,
   a **2 px solid glowing border** and a box-shadow: a literal card box
   appears around whichever crab is acting.
2. **The whole card travels.** The lunge/knockback displacement is
   applied to the `motion.div` that wraps `CrabSlot`, so when a crab
   lunges, its **name plate, level badge, HP bar, energy bar, status
   chips and (for the actor) the glowing border all fly across the
   field with it**, and knocked-back targets likewise slide with their
   full furniture. This is the single biggest "card being moved" cue.
3. **Card furniture stacked inside the slot** (also at rest): name +
   `L{level}` badge row, HP bar (90% width), energy bar (70%), status
   chip row — a vertical card layout that happens to contain a crab.
   Auto-battler convention is a slim floating HP bar (and CC icons)
   above the unit; name/level/energy belong to inspection UI, not the
   moving unit.
4. **The slot-marker ellipse**: a glowing radial "plate" with a border
   under every crab at its anchor. It does not travel (it stays at the
   anchor while the crab lunges), but it is a base-plate look Phase 2
   should consciously keep (as a subtle ground shadow/ring) or drop —
   it must not read as a card base during movement.
5. Not unit chrome (out of scope, keep): the arena frame, header
   (turn indicator + spectator controls), thinking pill, bottom status
   panel and battle log.

Deployment-board cards (`ArenaTeamBuilder`) are a planning UI and keep
their card treatment — §9 targets the live battlefield only.

---

## 5. Phase 2 — the real-time design

### 5.1 Simulation core

- **Fixed-timestep simulation in battle-ms.** Tick = **50 battle-ms**
  (20 ticks/s). `BattleClock` remains the one presentation clock: an
  accumulator in the same rAF loop feeds whole ticks to the sim, so
  pause (scale 0) freezes the sim exactly, ×2/×3 fast-forward it, and
  `data-battle-clock-ms` keeps its meaning. Rendering interpolates or
  samples unit positions per frame from sim state.
- **The sim is the only rules implementation.** It owns positions, HP,
  energy, cooldowns (in battle-ms), statuses, projectiles, and the win
  check. `resolveRound`, `pickAiSkill`, and ArenaBattle's duplicated
  `endRoundMaintenance` are deleted. Skip = run the same sim headlessly
  at unbounded speed to completion (identical decisions, identical RNG
  stream) — one brain for watched and skipped battles.
- **Determinism.** All rolls (damage variance, status application,
  reward rolls) draw from the existing seeded stream
  (`mulberry32(seed ^ 0x9e3779b9)`) in a fixed order: per tick, units act
  in slot order (player 0–4, enemy 0–4), projectiles resolve in spawn
  order, reward rolls last. No `Math.random`, no wall-clock reads inside
  the sim. Same seed + same teams ⇒ identical event log (hash-testable).
- **Event queue out.** The sim emits timestamped events (`attackStart`,
  `hitMoment`, `projectileSpawn`, `projectileHit`, `damage`, `heal`,
  `statusApplied`, `statusExpired`, `cleansed`, `death`, `victory`…)
  which the renderer consumes to drive poses, FX, projectiles, damage
  numbers and the log. Damage lands **when the event fires** (melee:
  the sheet's `hitMoment` frame; projectile: arrival), never before.

### 5.2 Units, steering, ranges

- Units spawn at their slotLayout anchors (formation + free-placement
  lanes are the starting arrangement) and then **move freely** in the
  same % field. Each unit has: position, facing (flip by velocity x with
  a turn-rate limit — no instant mirroring mid-stride), state machine
  (`idle / seek / windup / strike / recover / cast / hitstun / dead`),
  current target, and per-skill cooldown/energy as today.
- **Steering:** seek the target until inside the unit's engagement band,
  then hold (strafe slightly to keep facing). Separation steering
  between all pairs (personal radius ≈ half slot width) prevents
  stacking; an arrive damp prevents sliding through the stop point.
  Animation state follows ground speed: `walk` below ~6 %/s, `run`
  above; **playback rate is matched to ground speed** (stride sync) so
  feet don't skate. Attack animations carry anticipation (windup frames)
  → strike (hitMoment) → recovery, per the existing sheet clips.
- **Engagement bands by role/range** (field-% distances to target
  centre, tuned against slot geometry — front columns start 16% apart):
  - Melee (claw classes, Bulwark slam): stop at target's slot-edge ring
    (reuse `attackPoint` geometry ≈ 8–10% from centre).
  - Ranged (Warden bolts, lightning/magic profiles): hold 26–36%.
  - Caster/AoE (Tidecaller): hold 24–34%, prefer midline of own half.
  - Support (Shellmender, Bulwark sigil): stay within 18% of the
    lowest-HP ally / team centroid; never cross the centre line unless
    no ally needs them.
  - Skitter (assassin profile): target selection prefers back-row /
    lowest-HP targets and its seek path may route around the frontline
    (target the chosen victim directly instead of the frontmost row —
    see §5.3 for how this interacts with the reach rule).
- **Cooldown-based cadence** (replaces rounds): basic attack cycle per
  class ≈ 1400–2200 battle-ms (windup ~25%, recovery ~35%); energy
  regen continuous at +2 per 6000 battle-ms (the old +2/round); skill
  cooldowns convert 1 round ≈ 6000 battle-ms (Tide Sigil 3 rounds →
  18000 battle-ms). Decision ticks: each unit re-evaluates its pilot
  policy every 250 battle-ms, staggered by slot index (slot × 37 ms
  offset) so the whole field doesn't change its mind on the same tick.
- The **position rules survive as tactics, not geometry locks**: melee
  targeting still prefers the frontmost living row (the reach rule
  becomes the default target policy), Frontline Guard ×0.9 / Backline
  Protection ×0.8 stay as damage factors while formation rows remain a
  unit property. Ranged/AoE ignore reach as today. Damage formula,
  element effectiveness, combo counter, AoE 0.85 factor and shield
  absorption carry over unchanged.
- **Amendment (common-sense battle logic round): basic-attack reach
  follows the class profile, not the skill visual.** Claw Strike's
  visual is a claw for every class, which used to bind even band
  classes to the frontmost-row pool. `BASIC_ATTACK_RANGE` in
  arenaEngine now classifies the basic attack by actor class: Warden,
  Tidecaller and Shellmender basics are ranged (any row targetable,
  delivered from their bands as before); contact classes stay melee.
  Backline Protection ×0.8 still applies to back-row targets while
  their front stands — reach changed, protection did not.

### 5.3 Pilot (AI) per unit

Port `decideAction`'s priority ladder to a per-unit decision function
over sim state: heal (<55% ally) → cleanse (ally hard-CC'd, §5.4) →
support upkeep → AoE (≥2 in range band) → focused damage (finisher →
element-weak → lowest HP → frontmost) → basic attack. Class flavour:
Warden holds range and prioritises sigil on the enemy carry (highest
attack); Bulwark bodies toward the enemy nearest its lowest-HP ally
(guard positioning) and taunts by target-preference (enemies whose
policy target is a back-row ally within Bulwark's guard radius get
redirected — implement as target-selection weight, not a hard taunt
status, for v1); Skitter flanks per §5.2. All decisions remain
RNG-free (variance lives in damage rolls only), preserving
reproducibility.

### 5.4 Status fairness (implements user §7)

Keep the five existing statuses (converted to battle-ms durations:
weaken 12000, defense_down 12000, regen 18000, shield 12000 + pool,
freeze ≤ 2000 per application — see below) and add the missing fairness
layer:

- **Resistance (tenacity).** Hard-CC application rolls against the
  target's tenacity: `resistChance = clamp(0.05 + 0.01 × (targetLevel −
  attackerLevel) + classTenacity, 0, 0.50)`, classTenacity: Bulwark
  +0.15, Warden +0.05, others 0. A resisted freeze applies a 40%-duration
  **slow** instead (new status: −40% move/attack speed) — a partial
  effect, never a full whiff for the caster. Soft debuffs
  (weaken/defense_down) always apply but their duration scales by
  (1 − tenacity/2).
- **Diminishing returns (per target, per CC category).** Hard-CC
  applications within a rolling 10000 battle-ms window scale duration
  ×1 → ×0.5 → ×0.25 → **immune**; immunity lasts 5000 battle-ms after
  the last application and shows as a small shield icon. Freeze base
  duration becomes 2000 battle-ms so the ladder is 2000/1000/500/0.
- **Uptime cap.** A unit cannot spend more than 40% of any rolling
  10000 battle-ms window under hard CC; applications that would breach
  the cap are converted to the resisted-slow outcome.
- **Counterplay — cleanse & immunity.** Shellmender's heal also
  **cleanses** its target (removes the most recent debuff or CC and
  grants 1500 battle-ms CC immunity); the pilot's cleanse priority
  (§5.3) makes this happen without player input. Bulwark's Tide Sigil
  shield additionally grants CC immunity while the shield holds.
- **Refresh discipline.** Re-applying a soft debuff refreshes duration
  to at most (remaining + 50% of base) instead of a flat max, so
  permanent 100% uptime of weaken/defense_down needs two sources.
- Sleep/stun/silence/poison/burn are **not** added in Phase 2 v1 — the
  fairness machinery (categories, DR, tenacity, cleanse) is built
  generically over a `ccCategory` field so they can slot in later
  without rework.
- Visual contract: CC'd units get an on-sprite treatment (ice tint +
  icon for freeze, purple for weaken — via the existing status chip +
  a sprite overlay tint), DR/immunity shows the immunity icon; all
  status visuals are driven by sim events so they stay in sync under
  pause/speed.

### 5.5 Death & tombstone sync

- Sim marks the unit dead **in the same tick** the lethal damage event
  resolves: it leaves all targeting/decision pools instantly (as
  `isDefeated` does today) and its state becomes `dead`.
- Renderer: plays the sheet's death clip (~600 battle-ms, clock-driven),
  then swaps in the **new themed tombstone** (Phase 2 art task: a carved
  shell-stone marker — domed crab-shell silhouette, claw glyph, pearl
  inlay, seaweed at the base — replacing the generic grey cross SVG),
  entering with a rise-and-settle + sand/bubble particle puff, all timed
  in battle-ms (no wall-clock framer exit; pause freezes the whole
  sequence). The tombstone persists at the death position for the rest
  of the battle and is purely decorative (no collision, no targeting).
- Skip/headless runs produce the same death events; the celebration
  screen renders tombstones for every defeated combatant from the final
  sim state — closing today's "alive-looking corpse after Skip" hole.

### 5.6 Renderer changes (ArenaBattle)

- Delete the processActor/animateAction chain, the local turn order,
  `consumeFreeze`, and the duplicated `endRoundMaintenance`. The
  component becomes a view: spawn from anchors → per-frame unit
  transforms from sim state → poses from unit states → FX/projectiles
  from the event queue → HUD (elapsed battle time replaces "Turn N";
  the log becomes an event feed).
- **Chrome removal per §4:** no panel/border around units at any time
  (the current-actor box goes); the acting/targeted highlight becomes a
  ground ring + slight scale/glow on the sprite itself. Name/level/
  energy leave the moving unit; a slim HP bar + status icons float
  above the sprite, parented to the unit so they follow smoothly
  (they are information, not a card — no background panel, no border).
  What lunges is the crab (plus its HP sliver), never a card.
- BattleClock, spectator controls (pause/speed/skip/flee), element-
  driven FX, skill profiles, aura layer and the slotLayout spawn map
  are all retained.

### 5.7 Rewards & results

Unchanged contract: winner determination (wipe, or HP-ratio at the
180000 battle-ms cap ≙ the old 30 rounds), `calculateRewards` as-is
(its rolls come last in the seeded stream), `onComplete` payload
identical, flee = zero rewards. Raid/Leviathan instant sims
(`engine/battle.ts`) are **out of Phase 2 scope** — they keep the
current BP model until a later phase decides whether they adopt the
real-time sim.

### 5.8 Specs that will need rewriting (authorised by the user)

Unit:
- `tests/unit/arenaEngine.test.ts` — turn order / `resolveRound` /
  `pickAiSkill` behaviours are replaced by sim tests (fixed-timestep
  determinism: same seed ⇒ identical event-log hash; steering/range
  rules; cooldown cadence).
- `tests/unit/autoPilot.test.ts` — `decideAction` ports to the per-unit
  decision function; priority-ladder tests carry over with sim-state
  fixtures; add cleanse-priority cases.
- `tests/unit/positionRules.test.ts` — reach/Guard/Protection survive
  as policy + damage factors; assertions re-based on the sim APIs.
- New: status-fairness suite (tenacity rolls, DR ladder 2000/1000/500/
  immune, uptime cap, cleanse, shield-immunity) — none of this is
  testable today because none of it exists.
- `tests/unit/battleClock.test.ts` — clock unchanged; keep as-is.

E2E:
- `tests/e2e/auto-battler.spec.ts` — asserts the "Turn N" indicator and
  turn-shaped log behaviour; turns disappear. Pause/freeze assertions
  via `data-battle-paused` + `data-battle-clock-ms` remain the right
  idea and should be kept against the new HUD.
- `tests/e2e/slot-layout.spec.ts` — battle half asserts anchored rest
  positions and box non-overlap *during* battle; units now move.
  Re-scope: deployment/board assertions unchanged; battle assertions
  become spawn-formation = anchors + separation/no-stacking checks +
  the ≥80 px phone size floor.
- `tests/e2e/sprite-animation.spec.ts` — asserts `data-anim-state`
  leaves "idle" in battle; still true, but the vocabulary grows
  (walk/run/cast) — widen expectations and add a "units actually
  change position" assertion.
- `tests/e2e/visual-overhaul.spec.ts` and the battle parts of
  `tests/e2e/elements.spec.ts` — FX observation via MutationObserver
  still applies; real-time cadence changes how quickly skills appear —
  re-time the polling windows.
- `tests/e2e/play-session.spec.ts` — the buy → team → battle → result
  loop stays; Skip becomes sim fast-forward (same result contract),
  waits/assertions on battle internals need updating.
- `tests/e2e/arena-flow.spec.ts`, `tests/e2e/free-placement.spec.ts` —
  navigation/deployment mostly unaffected; any assertion that waits on
  turn structure must be re-checked.
- `tests/e2e/living-characters.spec.ts`, viewport/modal sweeps,
  smoke-tour — unaffected (menus/previews), no changes expected.

---

## 6. Audit conclusions in one page

1. Today's Arena is a **turn-based engine with a sequential animation
   re-enactment**, not a real-time battler: outcomes are computed
   instantly per action and then played back at ~1400 battle-ms per
   actor. The fix is a fixed-timestep sim (50 battle-ms ticks on the
   existing BattleClock) with an event queue — BattleClock, slotLayout
   spawns, skill profiles, element FX and the rewards contract all
   survive the migration.
2. There are **two AIs and two round implementations** (presented vs
   Skip). Phase 2 must land on exactly one sim + one pilot.
3. Statuses are **five, arena-only, and completely unfair by design**:
   guaranteed application, no resistance, no DR, no cleanse, chain-
   freeze possible. §5.4 adds tenacity, a DR ladder, an uptime cap,
   and cleanse/immunity counterplay without new status types.
4. Death logic is sync-correct; death **presentation** is not: the
   tombstone is a generic grey cross on wall-clock animation, and the
   Skip path shows defeated crabs alive at 0 HP. Both are fixed by
   making death a sim event with a themed, clock-driven tombstone.
5. The "card" feel comes from **`CrabSlot`'s travelling furniture**:
   the acting crab's glowing border box plus name/HP/energy/status
   stacked in the slot that lunges across the field. Removing the box
   and slimming the in-field readout to a floating HP sliver + status
   icons is a renderer-only change, independent of the sim work.
