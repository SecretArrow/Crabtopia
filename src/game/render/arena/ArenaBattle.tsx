// Crabtopia - Arena Battle Screen (Task C, screen 3 of 4)
// The main 5v5 FULL AUTO BATTLER with full Framer Motion animations.
// There is no per-turn player input: after deployment the battle runs
// itself and the player watches with spectator controls (play/pause,
// speed x1/x2/x3, skip to result). BOTH teams are piloted by the one
// AutoPilot (engine/autoPilot.ts).
//
// Architecture:
// - `state` is held in a useState once (initBattle result); it is mutated in
//   place by applySkill/endRoundMaintenance (the engine's deterministic RNG
//   keys off the state object identity via a WeakMap, so we MUST preserve the
//   same reference across all mutations). A `tick` counter forces re-renders
//   after each mutation so HP bars / energy bars / status rows update.
// - A round is driven by `processActor(currentActorIdx)`. For each actor in
//   turn order (computed locally to mirror the engine), we either:
//     (a) skip if defeated or frozen (frozen → animate a "frozen" action),
//     (b) ask the AutoPilot for its decision (decideAction) and animate it.
// - The chosen action is passed to `animateAction(action, onDone)`, which:
//     1. sets the actor pose to attack_lunge/casting (350 battle-ms),
//     2. fires the visual effect at each target position,
//     3. sets each target pose to "hurt" if damaged,
//     4. spawns DamageNumber(s), ComboCounter, FloatingText for statuses,
//     5. after 800 battle-ms total, clears poses/fx and calls onDone.
//   All waits run on the shared BattleClock (animation/battleClock.ts):
//   pause sets its scale to 0 and freezes sprites, particles, FX,
//   projectiles and these waits together; x1/x2/x3 scales them all.
//   onDone advances to the next actor or ends the round.
// - End of round: replicate the engine's end-of-round maintenance (regen,
//   energy, cooldowns, status ticks, combo reset, winner check). Regen ticks
//   produce ArenaActions that we also animate. If winner is set, finish.
// - Position tracking: each crab slot registers a ref keyed by
//   `${side}-${c.slot}` (slot is the combatant's 0..N-1 index assigned by the
//   engine). `getCombatantPos(crabId)` resolves to the slot's center within
//   the arena container via getBoundingClientRect. Works for 3, 4, or 5 crabs
//   per side.
// - Layout (Option A — anchored slots): every combatant stands on a fixed
//   slot anchor from slotLayout.ts (the same map the deployment board
//   uses). Player defends the left half, enemy the mirrored right half;
//   formation rows are columns (back|mid|front), row members spread over
//   vertical lanes. Slot boxes are uniform and can never overlap, so
//   crabs never pile onto each other; attack lunges move a crab from its
//   anchor to the edge of the target's slot and back, and knockback is a
//   small flinch inside the target's own slot radius.
//
// NOTE on eslint disable: the arena engine (src/game/engine/arenaEngine.ts,
// owned by subagent A) mutates `ArenaBattleState` in place — this is by design
// (deterministic RNG via WeakMap keyed by state identity). The React Compiler's
// `react-hooks/refs` rule flags reads of the mutable `state` object during
// render, which conflicts with the engine's mutation-based design. We disable
// that one rule file-wide; the `rerender()` tick counter guarantees the UI
// stays in sync after every state change.

/* eslint-disable react-hooks/refs */

"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { Crab, ClassId, Formation } from "../../types";
import {
  initBattle,
  applySkill,
  runBattle,
  getSkillsForClass,
  calculateRewards,
  type ArenaBattleState,
  type ArenaAction,
  type ArenaSkill,
  type Combatant,
  type StatusEffectId,
} from "../../engine/arenaEngine";
import { decideAction } from "../../engine/autoPilot";
import { battleClock } from "../../animation/battleClock";
import { BUFFS_KEY } from "../useLocalStorage";
import CrabBattleSprite, { type CrabPose } from "../animations/CrabBattleSprite";
import {
  attackPoint,
  columnX,
  slotAnchor,
  slotKey,
  uniformSlotBox,
  type SlotAnchor,
  type SlotBoxSize,
} from "./slotLayout";
import FlipbookFx from "../../animation/FlipbookFx";
import ProjectileFx from "../../animation/ProjectileFx";
import {
  getSkillProfile,
  type SkillProfile,
} from "../../animation/skillProfiles";
import {
  elementBurstColors,
  fxTreatmentFor,
  profileFxElement,
} from "../../animation/elementFx";
import type { ElementId } from "../../engine/elements";
import ParticleLayer, {
  type ParticleBurst,
} from "../../animation/ParticleLayer";
import {
  EnergyBeam,
  LightningStrike,
  CrystalExplosion,
  HealAura,
  ShieldAura,
  GoldenShower,
  SlashEffect,
  ArenaBubbles,
} from "../animations/effects";
import {
  DamageNumber,
  FloatingText,
  ComboCounter,
  StatusEffectRow,
  HealthBar,
  EnergyBar,
  TurnIndicator,
} from "../animations/BattleFx";

// ---------------------------------------------------------------------------
// PROPS
// ---------------------------------------------------------------------------
export interface ArenaBattleProps {
  playerCrabs: Crab[];
  enemyCrabs: Crab[];
  seed: number;
  arenaId: string;
  entryCost: number;
  playerFormation?: Formation;
  enemyFormation?: Formation;
  /** Free-placement lanes (crabId → 0..4) chosen on the deployment board. */
  playerLanes?: Record<string, number>;
  /** Free-placement lanes for the enemy side (mirrors playerLanes). */
  enemyLanes?: Record<string, number>;
  onComplete: (result: {
    winner: "player" | "enemy";
    goldReward: number;
    xpReward: number;
    itemsFound: { itemId: string; count: number }[];
    arenaId: string;
  }) => void;
}

// ---------------------------------------------------------------------------
// LOCAL ENGINE HELPERS (mirror private functions in arenaEngine.ts)
// ---------------------------------------------------------------------------

const CLASS_ORDER: ClassId[] = [
  "skitter",
  "reaver",
  "gildclaw",
  "warden",
  "pincher",
  "tidecaller",
  "bulwark",
  "shellmender",
];

function classOrderIndex(classId: ClassId): number {
  const i = CLASS_ORDER.indexOf(classId);
  return i === -1 ? 99 : i;
}

// Battlefield layout is anchored (Option A): each combatant renders on
// its slot anchor for its formation row (Combatant.row — front/mid/back)
// with one uniform sprite size for the whole battle. See renderRowLayer
// and slotLayout.ts.

function computeTurnOrder(state: ArenaBattleState): Combatant[] {
  const alive = [...state.player, ...state.enemy].filter((c) => !c.isDefeated);
  alive.sort((a, b) => {
    if (b.speed !== a.speed) return b.speed - a.speed;
    return classOrderIndex(a.classId) - classOrderIndex(b.classId);
  });
  return alive;
}

function aliveOnSide(
  state: ArenaBattleState,
  side: "player" | "enemy",
): Combatant[] {
  return (side === "player" ? state.player : state.enemy).filter(
    (c) => !c.isDefeated,
  );
}

// Freeze handling at the start of an actor's turn.
function consumeFreeze(actor: Combatant): boolean {
  const freeze = actor.statuses.find((s) => s.id === "freeze");
  if (freeze && freeze.roundsRemaining > 0) {
    freeze.roundsRemaining -= 1;
    if (freeze.roundsRemaining <= 0) {
      actor.statuses = actor.statuses.filter((s) => s.id !== "freeze");
    }
    return true;
  }
  return false;
}

// End-of-round maintenance: regen, energy, cooldowns, status ticks, combo
// reset, winner check. Returns any regen_tick actions to animate.
function endRoundMaintenance(state: ArenaBattleState): ArenaAction[] {
  const newActions: ArenaAction[] = [];
  const all = [...state.player, ...state.enemy];

  // Regen
  for (const c of all) {
    if (c.isDefeated) continue;
    const regen = c.statuses.find((s) => s.id === "regen");
    if (regen) {
      const heal = Math.max(1, Math.round((c.maxHp * regen.magnitude) / 100));
      const before = c.hp;
      c.hp = Math.min(c.maxHp, c.hp + heal);
      const actual = c.hp - before;
      if (actual > 0) {
        const action: ArenaAction = {
          turn: state.turn,
          actorId: c.crabId,
          actorSide: c.side,
          skillId: "regen_tick",
          skillName: "Regen",
          targetIds: [c.crabId],
          targetSide: c.side,
          heal: actual,
          visual: "heal_pearl",
          message: `${c.name} regenerates ${actual} HP from a tide-pearl aura.`,
        };
        state.log.push(action);
        newActions.push(action);
      }
    }
  }

  // Energy regen
  for (const c of all) {
    if (c.isDefeated) continue;
    c.energy = Math.min(c.maxEnergy, c.energy + 2);
  }

  // Tick non-freeze statuses
  for (const c of all) {
    for (const s of c.statuses) {
      if (s.id === "freeze") continue;
      s.roundsRemaining -= 1;
    }
    c.statuses = c.statuses.filter(
      (s) => s.id === "freeze" || s.roundsRemaining > 0,
    );
  }

  // Tick cooldowns
  for (const c of all) {
    for (const id of Object.keys(c.cooldowns)) {
      if (c.cooldowns[id] > 0) c.cooldowns[id] -= 1;
      if (c.cooldowns[id] <= 0) delete c.cooldowns[id];
    }
  }

  // Reset combos
  for (const c of all) {
    c.comboCount = 0;
  }

  // Check winner
  if (state.winner === null) {
    const playerAlive = state.player.some((c) => !c.isDefeated);
    const enemyAlive = state.enemy.some((c) => !c.isDefeated);
    if (!playerAlive && !enemyAlive) state.winner = "enemy";
    else if (!playerAlive) state.winner = "enemy";
    else if (!enemyAlive) state.winner = "player";
  }

  return newActions;
}

// Module-level helper to bump the turn counter on the mutable state object.
// Defined outside the component so the react-hooks/immutability rule doesn't
// flag the in-place mutation (it's intentional — the engine mutates state).
function bumpStateTurn(state: ArenaBattleState): void {
  state.turn += 1;
}

// Check if either side is fully defeated and set state.winner accordingly.
// Mirrors the engine's private checkWinner — called after each applySkill so
// the battle ends promptly mid-round (not just at end-of-round maintenance).
function checkWinner(state: ArenaBattleState): void {
  if (state.winner !== null) return;
  const playerAlive = state.player.some((c) => !c.isDefeated);
  const enemyAlive = state.enemy.some((c) => !c.isDefeated);
  if (!playerAlive && !enemyAlive) state.winner = "enemy";
  else if (!playerAlive) state.winner = "enemy";
  else if (!enemyAlive) state.winner = "player";
}

// ---------------------------------------------------------------------------
// VISUAL MAPPINGS
// ---------------------------------------------------------------------------
const STATUS_LABEL: Record<StatusEffectId, string> = {
  weaken: "Weakened!",
  freeze: "Frozen!",
  defense_down: "Defense Down!",
  regen: "Regenerating!",
  shield: "Shielded!",
};

const STATUS_COLOR: Record<StatusEffectId, string> = {
  weaken: "#7A5CFF",
  freeze: "#5CDEFF",
  defense_down: "#FF6F91",
  regen: "#7CF5E1",
  shield: "#FFD166",
};

// ---------------------------------------------------------------------------
// Fx instance types (for state arrays that drive AnimatePresence)
// ---------------------------------------------------------------------------
interface FxInstance {
  id: string;
  visual: ArenaSkill["visual"];
  actorPos: { x: number; y: number };
  targetPos: { x: number; y: number };
  /** Skill-profile overrides (skill overhaul): flipbook, size, archetype. */
  flipFx?: string;
  fxSize?: number;
  profile?: string;
  skillId?: string;
  /**
   * Element-driven VFX: the ATTACKER's element when this impact belongs
   * to a damage-archetype skill (elementFx) — the rendered flipbook is
   * colour-treated to it and carries data-fx-element. Absent for
   * support skills (heal/shield), which keep their theme colours.
   */
  fxElement?: ElementId;
}

/** A skill projectile in flight; on landing it spawns its impact FxInstance. */
interface ProjectileInstance {
  id: string;
  fx: string;
  from: { x: number; y: number };
  to: { x: number; y: number };
  durationMs: number;
  arcHeight: number;
  size: number;
  profile: string;
  skillId: string;
  /** Attacker's element for damage projectiles (see FxInstance). */
  fxElement?: ElementId;
  impact: FxInstance;
}

/** Skill visual → procedural flipbook overlay (sprite overhaul). The legacy
 *  SVG effect still renders underneath; the flipbook adds the frame-based
 *  impact flash synchronised to the same battle event. */
const FLIP_FOR_VISUAL: Record<ArenaSkill["visual"], string> = {
  claw: "slash",
  magic: "spark",
  aoe_wave: "splash",
  heal_pearl: "heal",
  shield: "shield",
  lightning: "lightning",
  crystal_burst: "explosion",
  golden: "levelup",
};

interface DmgInstance {
  id: string;
  value: number;
  x: number;
  y: number;
  variant: "damage" | "heal" | "crit";
}

interface TextInstance {
  id: string;
  text: string;
  x: number;
  y: number;
  color: string;
}

interface ComboInstance {
  id: string;
  count: number;
  x: number;
  y: number;
}

// ---------------------------------------------------------------------------
// CrabSlot — one crab's display cell inside the arena (HP/Energy/sprite/statuses).
// `slotRef` is the callback ref the parent uses to register this slot's div.
// In the anchored layout (Option A) the slot fills its slot box: no min
// width, no panel background — the glowing slot ellipse under the crab is
// the slot's visual identity; the panel chrome only appears for the
// current-actor state.
// ---------------------------------------------------------------------------
function CrabSlot({
  combatant,
  crab,
  pose,
  facing,
  showTombstone,
  isCurrentActor,
  slotRef,
  spriteSize = 96,
  anchored = false,
}: {
  combatant: Combatant;
  crab: Crab;
  pose: CrabPose;
  facing: "left" | "right";
  showTombstone: boolean;
  isCurrentActor: boolean;
  slotRef: (el: HTMLDivElement | null) => void;
  spriteSize?: number;
  /** Fill the slot box (anchored battlefield) instead of sizing to content. */
  anchored?: boolean;
}): React.ReactNode {
  const minWidth = anchored ? undefined : spriteSize >= 96 ? 90 : 70;
  return (
    <div
      ref={slotRef}
      className="relative flex flex-col items-center p-1 rounded-xl"
      style={{
        minWidth,
        width: anchored ? "100%" : undefined,
        background: isCurrentActor
          ? "rgba(124,245,225,0.12)"
          : anchored
            ? "transparent"
            : "rgba(10,27,61,0.25)",
        border: isCurrentActor
          ? "2px solid rgba(124,245,225,0.7)"
          : anchored
            ? "1px solid transparent"
            : "1px solid rgba(124,245,225,0.15)",
        boxShadow: isCurrentActor
          ? "0 0 14px rgba(124,245,225,0.4)"
          : "none",
        transition: "all 0.2s ease",
      }}
    >
      {/* Name + level */}
      <div className="flex items-center gap-1 mb-0.5 w-full justify-center">
        <span
          className="text-[9px] font-bold truncate max-w-[80px]"
          style={{ color: "#EAF6FF" }}
          title={combatant.name}
        >
          {combatant.name}
        </span>
        <span
          className="text-[8px] font-bold rounded px-0.5"
          style={{ background: "rgba(255,255,255,0.08)", color: "#FFD166" }}
        >
          L{combatant.level}
        </span>
      </div>
      {/* HP */}
      <div style={{ width: "90%" }}>
        <HealthBar
          current={combatant.hp}
          max={combatant.maxHp}
          side={combatant.side}
        />
      </div>
      {/* Energy */}
      <div style={{ width: "70%" }} className="mt-0.5">
        <EnergyBar current={combatant.energy} max={combatant.maxEnergy} />
      </div>
      {/* Sprite */}
      <motion.div
        animate={
          isCurrentActor && !combatant.isDefeated
            ? { y: [0, -3, 0] }
            : { y: 0 }
        }
        transition={{ duration: 0.8, repeat: Infinity, ease: "easeInOut" }}
      >
        <CrabBattleSprite
          crab={crab}
          pose={pose}
          size={spriteSize}
          facing={facing}
          glowColor={isCurrentActor ? "#FFD166" : undefined}
          showTombstone={showTombstone}
        />
      </motion.div>
      {/* Status row */}
      <div
        className={`mt-0.5 flex justify-center ${anchored ? "min-h-[14px]" : "min-h-[22px]"}`}
      >
        <StatusEffectRow statuses={combatant.statuses} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// MAIN COMPONENT
// ---------------------------------------------------------------------------
export default function ArenaBattle({
  playerCrabs,
  enemyCrabs,
  seed,
  arenaId,
  entryCost,
  onComplete,
  playerFormation,
  enemyFormation,
  playerLanes,
  enemyLanes,
}: ArenaBattleProps): React.ReactNode {
  // ----- Battle state (held once, mutated in place) -----
  const [state] = useState<ArenaBattleState>(() => {
    const s = initBattle(playerCrabs, enemyCrabs, seed, {
      playerFormation,
      enemyFormation,
      playerLanes,
      enemyLanes,
    });
    // Exploration trap debuff: "−20% HP on the strongest crab's next arena
    // battle", consumed on application. It used to be set by the
    // Exploration screen and displayed in Inventory but never applied —
    // a dead buff that persisted forever. Apply it once, then clear it.
    try {
      const raw = localStorage.getItem(BUFFS_KEY);
      if (raw) {
        const buffs = JSON.parse(raw) as { trapDebuff?: boolean };
        if (buffs?.trapDebuff) {
          const strongest = [...s.player].sort(
            (a, b) => b.maxHp - a.maxHp,
          )[0];
          if (strongest) {
            const cut = Math.max(1, Math.round(strongest.maxHp * 0.2));
            strongest.maxHp -= cut;
            strongest.hp = Math.max(1, strongest.hp - cut);
          }
          delete buffs.trapDebuff;
          localStorage.setItem(BUFFS_KEY, JSON.stringify(buffs));
        }
      }
    } catch {
      // localStorage unavailable or corrupt — ignore the debuff.
    }
    return s;
  });
  const [, setTick] = useState(0);
  const rerender = useCallback(() => setTick((t) => t + 1), []);

  // ----- UI state -----
  const [speed, setSpeed] = useState<1 | 2 | 3>(1);
  // Full auto battler: the battle plays itself; the player only
  // watches. `paused` sets the shared BattleClock's scale to 0 — a
  // REAL freeze of every animation system and timed wait, not just a
  // gate at decision points (the gates in processActor/advanceActor
  // remain as a second layer so no new decision is computed either).
  const [paused, setPaused] = useState(false);
  const [poses, setPoses] = useState<Record<string, CrabPose>>({});
  const [tombstones, setTombstones] = useState<Record<string, boolean>>({});
  const [activeFx, setActiveFx] = useState<FxInstance[]>([]);
  const [projectiles, setProjectiles] = useState<ProjectileInstance[]>([]);
  const [shaking, setShaking] = useState<"light" | "heavy" | null>(null);
  const [particleBursts, setParticleBursts] = useState<ParticleBurst[]>([]);
  const burstIdRef = useRef(0);
  const [damageNumbers, setDamageNumbers] = useState<DmgInstance[]>([]);
  const [floatingTexts, setFloatingTexts] = useState<TextInstance[]>([]);
  const [comboCounters, setComboCounters] = useState<ComboInstance[]>([]);
  const [thinking, setThinking] = useState<string | null>(null);
  const [ended, setEnded] = useState(false);

  // ----- Refs -----
  const arenaRef = useRef<HTMLDivElement>(null);
  const slotRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const cancelledRef = useRef(false);
  const turnOrderRef = useRef<Combatant[]>([]);
  const actorIdxRef = useRef(0);
  const pausedRef = useRef(false);
  // Step deferred by the pause gate; Play runs it.
  const pendingStepRef = useRef<(() => void) | null>(null);
  const endedRef = useRef(false);

  // Refs that hold the latest copies of the mutually-recursive phase functions
  // (advanceActor / processActor / endRound / startNextRound / finishBattle).
  // They reference each other, so we route calls through these refs to avoid
  // "accessed before declared" / stale-closure issues. The refs are synced in
  // a layout effect below after every render.
  const advanceActorRef = useRef<() => void>(() => {});
  const processActorRef = useRef<() => void>(() => {});
  const endRoundRef = useRef<() => void>(() => {});
  const startNextRoundRef = useRef<() => void>(() => {});
  const finishBattleRef = useRef<() => void>(() => {});

  // ----- Battle clock (Task 3: one shared clock for the whole battle) --
  // Every timed wait in this component is a BattleClock timer and every
  // animation system (sprites, particles, flipbooks, projectiles) reads
  // the same clock, so pause = timeScale 0 freezes ALL of them mid-
  // flight, and x1/x2/x3 scales all of them together. Durations below
  // are therefore written at x1 (battle milliseconds) — the clock does
  // the scaling the old code did by hand with speed multipliers.
  const battleTimeout = useCallback((cb: () => void, ms: number): number => {
    return battleClock.setTimeout(() => {
      if (cancelledRef.current) return;
      cb();
    }, ms);
  }, []);

  // Clock driver: one rAF loop advances the shared clock and mirrors
  // the accumulated battle time onto the arena element for tests/QA.
  useEffect(() => {
    battleClock.reset();
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(100, now - last);
      last = now;
      battleClock.advance(dt);
      const el = arenaRef.current;
      if (el) {
        el.dataset.battleClockMs = String(Math.floor(battleClock.elapsedMs));
      }
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      // Leave the shared clock running (x1, no timers) for any other
      // battle-clocked render still on screen.
      battleClock.reset();
    };
  }, []);

  // Pause / speed → clock scale (0 freezes everything at once).
  useEffect(() => {
    battleClock.setScale(paused ? 0 : speed);
  }, [paused, speed]);

  // ----- Crab id → Crab lookup (for CrabBattleSprite) -----
  const crabMap = useMemo(() => {
    const m = new Map<string, Crab>();
    for (const c of playerCrabs) m.set(c.id, c);
    for (const c of enemyCrabs) m.set(c.id, c);
    return m;
  }, [playerCrabs, enemyCrabs]);

  // ----- Cleanup on unmount -----
  useEffect(() => {
    return () => {
      cancelledRef.current = true;
    };
  }, []);

  // ----- Slot layout: one anchor per combatant -----
  // Row membership never changes mid-battle, so this is computed once.
  // Each row's members are spread evenly over the lane band by their
  // in-row ORDER (index) — that order is exactly the free-placement lane
  // order arranged on the deployment board (formation rows are kept sorted
  // by lane), so what the player arranged top-to-bottom is what fights.
  // Dynamic spacing (not the fixed 5-lane grid) keeps slot boxes large when
  // rows are small — big sprites on desktop, overlap-free by construction.
  const layoutData = useMemo(() => {
    const anchors = new Map<string, { anchor: SlotAnchor; key: string }>();
    let maxRow = 0;
    for (const side of ["player", "enemy"] as const) {
      const list = side === "player" ? state.player : state.enemy;
      for (const row of ["front", "mid", "back"] as const) {
        const inRow = list.filter((c) => c.row === row);
        maxRow = Math.max(maxRow, inRow.length);
        inRow.forEach((c, i) => {
          anchors.set(c.crabId, {
            anchor: slotAnchor(side, row, i, inRow.length),
            key: slotKey(side, row, i),
          });
        });
      }
    }
    const box: SlotBoxSize = uniformSlotBox(maxRow);
    return { anchors, box, maxRow };
  }, [state]);
  const layoutRef = useRef(layoutData);
  useEffect(() => {
    layoutRef.current = layoutData;
  }, [layoutData]);

  // ----- Arena size (measured) → one uniform sprite size fitting the slot box.
  // Desktop arenas are large, so sprites grow well past the old 72–92px;
  // on phones the same percentage map simply scales down, still overlap-free.
  const [arenaSize, setArenaSize] = useState<{ w: number; h: number }>({
    w: 0,
    h: 0,
  });
  useEffect(() => {
    const el = arenaRef.current;
    if (!el) return;
    const update = () => {
      const r = el.getBoundingClientRect();
      setArenaSize({ w: r.width, h: r.height });
    };
    update();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // Sprite size: the slot BOXES are the layout invariant (they never
  // overlap — see slotLayout), but the sprite art itself may breathe
  // past its box width (×1.45): frames are depth-sorted by lane, so a
  // crab spilling a few px into a neighbour's frame reads as depth,
  // not collision. Without the breathing factor a phone's 15%-wide
  // slot capped sprites at ~58px — far too small to enjoy. Desktop is
  // height-bound and unchanged (~123px at 1440×900). On a 390×844
  // phone the arena runs full-bleed (see the -mx-3 on the arena
  // element below: it reclaims the shell's 12px side padding, so the
  // arena is the full 390px wide) and the width term gives
  // floor(390 × 15% × 1.45) = 84px. The containment cap
  // floor(w × 0.2) + 8 is the exact bound that keeps a centred sprite
  // inside the arena horizontally: the outermost (back) anchors sit
  // at 10% of the width, so sprite ≤ 2 × (0.10w + 4px tolerance);
  // it is a no-op at 390px (cap 86 > 84) and on desktop (cap ≥ 200
  // vs the ~123px height bound), and only bites at in-between widths
  // where the raw width term could otherwise poke a few px past the
  // arena edge. Rows stacked 4–5 high (free placement) use the
  // true lane pitch for their height term so plates stay readable.
  const heightTerm =
    layoutData.maxRow >= 4
      ? (arenaSize.h * (75 / layoutData.maxRow)) / 100 - 36
      : (arenaSize.h * layoutData.box.heightPct) / 100 - 40;
  const spritePx =
    arenaSize.w === 0
      ? 88
      : Math.max(
          40,
          Math.min(
            132,
            Math.floor(arenaSize.w * 0.2) + 8,
            Math.floor(
              Math.min(
                (arenaSize.w * layoutData.box.widthPct * 1.45) / 100,
                heightTerm,
              ),
            ),
          ),
        );

  // ----- Lunge / knockback displacements (px offsets from the anchor) -----
  const [displacements, setDisplacements] = useState<
    Record<string, { x: number; y: number }>
  >({});

  // ----- Position helper -----
  const getCombatantPos = useCallback(
    (crabId: string): { x: number; y: number } => {
      const all = [...state.player, ...state.enemy];
      const c = all.find((cc) => cc.crabId === crabId);
      if (!c) return { x: 0, y: 0 };
      const key = `${c.side}-${c.slot}`;
      const el = slotRefs.current[key];
      const arena = arenaRef.current;
      if (!el || !arena) return { x: 0, y: 0 };
      const elRect = el.getBoundingClientRect();
      const arenaRect = arena.getBoundingClientRect();
      return {
        x: elRect.left - arenaRect.left + elRect.width / 2,
        y: elRect.top - arenaRect.top + elRect.height / 2 - 12,
      };
    },
    [state],
  );

  // ----- Skill profile for an action (presentation layer only) -----
  const getProfileForAction = useCallback(
    (action: ArenaAction): SkillProfile => {
      const actor = [...state.player, ...state.enemy].find(
        (c) => c.crabId === action.actorId,
      );
      const classId = actor?.classId ?? "pincher";
      const def = actor
        ? getSkillsForClass(actor.classId).find((s) => s.id === action.skillId)
        : undefined;
      const skill: ArenaSkill =
        def ??
        ({
          id: action.skillId,
          name: action.skillName,
          energyCost: 0,
          cooldown: 0,
          power: 1,
          targetType: "enemy",
          description: "",
          visual: action.visual,
        } as ArenaSkill);
      return getSkillProfile(skill, classId);
    },
    [state],
  );

  // The acting crab's element (engine-resolved on the combatant) — the
  // colour source for element-driven damage FX (elementFx.ts).
  const getActorElement = useCallback(
    (action: ArenaAction): ElementId | undefined =>
      [...state.player, ...state.enemy].find((c) => c.crabId === action.actorId)
        ?.element,
    [state],
  );

  // ----- Pose / fx mutators -----
  const setPose = useCallback((crabId: string, pose: CrabPose) => {
    setPoses((prev) => ({ ...prev, [crabId]: pose }));
  }, []);

  const clearPose = useCallback((crabId: string) => {
    setPoses((prev) => {
      const next = { ...prev };
      delete next[crabId];
      return next;
    });
  }, []);

  const setTombstone = useCallback((crabId: string) => {
    setTombstones((prev) => ({ ...prev, [crabId]: true }));
  }, []);

  // Unique id generator for fx instances.
  const fxId = useRef(0);
  const nextFxId = useCallback(() => `fx-${fxId.current++}`, []);

  // ----- Effect renderer for a single visual at a target -----
  const renderVisualEffect = useCallback(
    (fx: FxInstance): React.ReactNode => {
      const onComplete = () =>
        setActiveFx((prev) => prev.filter((f) => f.id !== fx.id));
      switch (fx.visual) {
        case "claw":
          return (
            <SlashEffect
              key={fx.id}
              x={fx.targetPos.x}
              y={fx.targetPos.y}
              onComplete={onComplete}
            />
          );
        case "magic":
          return (
            <EnergyBeam
              key={fx.id}
              from={fx.actorPos}
              to={fx.targetPos}
              onComplete={onComplete}
            />
          );
        case "aoe_wave":
          return (
            <EnergyBeam
              key={fx.id}
              from={fx.actorPos}
              to={fx.targetPos}
              color="#7A5CFF"
              onComplete={onComplete}
            />
          );
        case "heal_pearl":
          return (
            <HealAura
              key={fx.id}
              x={fx.targetPos.x}
              y={fx.targetPos.y}
              onComplete={onComplete}
            />
          );
        case "shield":
          return (
            <ShieldAura
              key={fx.id}
              x={fx.targetPos.x}
              y={fx.targetPos.y}
              onComplete={onComplete}
            />
          );
        case "lightning":
          return (
            <LightningStrike
              key={fx.id}
              x={fx.targetPos.x}
              y={fx.targetPos.y}
              onComplete={onComplete}
            />
          );
        case "crystal_burst":
          return (
            <CrystalExplosion
              key={fx.id}
              x={fx.targetPos.x}
              y={fx.targetPos.y}
              onComplete={onComplete}
            />
          );
        case "golden":
          return (
            <GoldenShower
              key={fx.id}
              x={fx.targetPos.x}
              y={fx.targetPos.y}
              onComplete={onComplete}
            />
          );
      }
    },
    [],
  );

  // ----- Spawn visual effects for an action -----
  const spawnEffectsForAction = useCallback(
    (action: ArenaAction) => {
      const actorPos = getCombatantPos(action.actorId);
      const targets = action.targetIds.map((id) => ({
        id,
        pos: getCombatantPos(id),
      }));

      // SKILL FX layer — driven by the skill's presentation profile
      // (skillProfiles.ts): each skill gets its own impact flipbook,
      // repetitions (combo), and — for ranged archetypes — a projectile
      // that flies actor → target and only then spawns the impact.
      const prof = getProfileForAction(action);
      // ELEMENT-DRIVEN VFX: damage archetypes adopt the ATTACKER's
      // element (flipbook treatment + projectile + burst colours);
      // support archetypes resolve to null and keep theme colours.
      const actorElement = getActorElement(action);
      const fxElement = actorElement
        ? (profileFxElement(prof, actorElement) ?? undefined)
        : undefined;
      const burstColors = fxElement ? elementBurstColors(fxElement) : undefined;
      const makeImpact = (t: { id: string; pos: { x: number; y: number } }): FxInstance => ({
        id: nextFxId(),
        visual: action.visual,
        actorPos,
        targetPos: t.pos,
        flipFx: prof.fx,
        fxSize: prof.fxSize,
        profile: prof.archetype,
        skillId: action.skillId,
        fxElement,
      });
      const newFx: FxInstance[] = [];
      const newProjectiles: ProjectileInstance[] = [];
      if (prof.projectile && targets.length === 1) {
        const t = targets[0];
        newProjectiles.push({
          id: nextFxId(),
          fx: prof.projectile.fx,
          from: actorPos,
          to: t.pos,
          durationMs: prof.projectile.durationMs,
          arcHeight: prof.projectile.arcHeight,
          size: prof.projectile.size,
          profile: prof.archetype,
          skillId: action.skillId,
          fxElement,
          impact: makeImpact(t),
        });
      } else {
        for (const t of targets) {
          for (let r = 0; r < prof.fxRepeats; r++) {
            const off = prof.fxRepeats > 1 ? (r - (prof.fxRepeats - 1) / 2) * 22 : 0;
            const imp = makeImpact(t);
            imp.targetPos = { x: t.pos.x + off, y: t.pos.y };
            newFx.push(imp);
          }
        }
      }
      if (newFx.length > 0) setActiveFx((prev) => [...prev, ...newFx]);
      if (newProjectiles.length > 0)
        setProjectiles((prev) => [...prev, ...newProjectiles]);

      // Particle bursts: the profile's preset when the skill defines one;
      // otherwise the base system's damage/heal feedback bursts.
      const bursts: ParticleBurst[] = [];
      if (prof.particles) {
        const spots =
          prof.particles.at === "actor"
            ? [actorPos]
            : targets.map((t) => t.pos);
        for (const s of spots) {
          bursts.push({
            id: ++burstIdRef.current,
            preset: prof.particles.preset,
            x: s.x,
            y: s.y,
            count: prof.particles.count,
            // Element-driven actions burst in the attacker's element
            // colours; support actions pass undefined → preset palette.
            colors: burstColors,
          });
        }
      } else {
        if (action.damage !== undefined && action.damage > 0) {
          for (const t of targets) {
            bursts.push({
              id: ++burstIdRef.current,
              preset: "sparks",
              x: t.pos.x,
              y: t.pos.y,
              count: 14,
              colors: burstColors,
            });
          }
        }
        if (action.heal !== undefined && action.heal > 0) {
          for (const t of targets) {
            bursts.push({
              id: ++burstIdRef.current,
              preset: "heal",
              x: t.pos.x,
              y: t.pos.y,
              count: 10,
              colors: burstColors,
            });
          }
        }
        if (action.visual === "aoe_wave" && targets[0]) {
          bursts.push({
            id: ++burstIdRef.current,
            preset: "splash",
            x: targets[0].pos.x,
            y: targets[0].pos.y,
            count: 16,
            colors: burstColors,
          });
        }
        if (action.visual === "crystal_burst" && targets[0]) {
          bursts.push({
            id: ++burstIdRef.current,
            preset: "explosion",
            x: targets[0].pos.x,
            y: targets[0].pos.y,
            count: 16,
            colors: burstColors,
          });
        }
      }
      if (bursts.length > 0) {
        setParticleBursts((prev) => [...prev.slice(-18), ...bursts]);
      }

      // Damage numbers / heal numbers (one per target).
      if (action.damage !== undefined && action.damage > 0) {
        const isCrit = (action.combo ?? 0) >= 1.2;
        const newDmg: DmgInstance[] = targets.map((t) => ({
          id: nextFxId(),
          value: action.damage ?? 0,
          x: t.pos.x,
          y: t.pos.y - 30,
          variant: isCrit ? "crit" : "damage",
        }));
        setDamageNumbers((prev) => [...prev, ...newDmg]);
        // Auto-remove after 1.2s.
        battleTimeout(() => {
          if (cancelledRef.current) return;
          setDamageNumbers((prev) =>
            prev.filter((d) => !newDmg.some((nd) => nd.id === d.id)),
          );
        }, 1300);
      }
      if (action.heal !== undefined && action.heal > 0) {
        const newDmg: DmgInstance[] = targets.map((t) => ({
          id: nextFxId(),
          value: action.heal ?? 0,
          x: t.pos.x,
          y: t.pos.y - 30,
          variant: "heal",
        }));
        setDamageNumbers((prev) => [...prev, ...newDmg]);
        battleTimeout(() => {
          if (cancelledRef.current) return;
          setDamageNumbers((prev) =>
            prev.filter((d) => !newDmg.some((nd) => nd.id === d.id)),
          );
        }, 1300);
      }

      // Combo counter (single, near first target).
      if ((action.combo ?? 0) >= 1.2) {
        const count = Math.round(((action.combo ?? 0) - 1) / 0.2) + 1;
        if (targets.length > 0) {
          const c: ComboInstance = {
            id: nextFxId(),
            count,
            x: targets[0].pos.x,
            y: targets[0].pos.y - 60,
          };
          setComboCounters((prev) => [...prev, c]);
          battleTimeout(() => {
            if (cancelledRef.current) return;
            setComboCounters((prev) => prev.filter((cc) => cc.id !== c.id));
          }, 1200);
        }
      }

      // Status effect floating text (one per unique status/target).
      if (action.statusApplied && action.statusApplied.length > 0) {
        const newTexts: TextInstance[] = [];
        const seen = new Set<string>();
        for (const sa of action.statusApplied) {
          const key = `${sa.targetId}-${sa.status}`;
          if (seen.has(key)) continue;
          seen.add(key);
          const pos = getCombatantPos(sa.targetId);
          newTexts.push({
            id: nextFxId(),
            text: STATUS_LABEL[sa.status],
            x: pos.x,
            y: pos.y - 50,
            color: STATUS_COLOR[sa.status],
          });
        }
        if (newTexts.length > 0) {
          setFloatingTexts((prev) => [...prev, ...newTexts]);
          battleTimeout(() => {
            if (cancelledRef.current) return;
            setFloatingTexts((prev) =>
              prev.filter((t) => !newTexts.some((nt) => nt.id === t.id)),
            );
          }, 1300);
        }
      }
    },
    [getCombatantPos, nextFxId, getProfileForAction, getActorElement, battleTimeout],
  );

  // ----- Animate one action: pose changes + fx + cleanup, then onDone -----
  const animateAction = useCallback(
    (action: ArenaAction, onDone: () => void) => {
      const LUNGE_MS = 350;
      const TOTAL_MS = 800;

      // MOVEMENT layer — the actor's pose comes from the skill profile's
      // sheet clip (attack / combo / skill-cast / jump for heavy slams),
      // keeping body motion cleanly separated from FX and particles.
      const prof = getProfileForAction(action);
      const poseForAnim: Record<string, CrabPose> = {
        attack: "attack_lunge",
        combo: "combo",
        skill: "casting",
        jump: "attack_lunge",
      };
      setPose(action.actorId, poseForAnim[prof.attackerAnim] ?? "casting");

      // Heavy / ultimate skills shake the arena (screen feedback layer).
      if (prof.shake !== "none") {
        setShaking(prof.shake);
        battleTimeout(() => {
          if (!cancelledRef.current) setShaking(null);
        }, 420);
      }

      // POSITIONAL layer (Option A) — melee-style attackers physically
      // lunge from their anchor to the EDGE of the target's slot box and
      // then return; knockback is a small flinch inside the target's own
      // slot radius. Ranged/projectile and support profiles stay on their
      // anchor (their projectile/FX layer carries the motion instead).
      // Reduced motion skips the travel — poses and FX still play.
      const reducedMotion =
        typeof window !== "undefined" &&
        typeof window.matchMedia === "function" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const arenaRect = arenaRef.current?.getBoundingClientRect();
      const actorCombatant = [...state.player, ...state.enemy].find(
        (c) => c.crabId === action.actorId,
      );
      const actorAnchor = layoutRef.current.anchors.get(action.actorId)?.anchor;
      let lungedId: string | null = null;
      const knockedIds: string[] = [];
      const meleeAnim =
        prof.attackerAnim === "attack" ||
        prof.attackerAnim === "combo" ||
        prof.attackerAnim === "jump";
      if (
        !reducedMotion &&
        arenaRect &&
        actorCombatant &&
        actorAnchor &&
        meleeAnim &&
        !prof.projectile
      ) {
        const foe = action.targetIds
          .map((id) => ({
            id,
            c: [...state.player, ...state.enemy].find(
              (cc) => cc.crabId === id,
            ),
            a: layoutRef.current.anchors.get(id)?.anchor,
          }))
          .find((t) => t.c && t.a && t.c.side !== actorCombatant.side);
        if (foe && foe.a) {
          const pt = attackPoint(actorAnchor, foe.a, layoutRef.current.box);
          setDisplacements((prev) => ({
            ...prev,
            [action.actorId]: {
              x: ((pt.x - actorAnchor.x) / 100) * arenaRect.width,
              y: ((pt.y - actorAnchor.y) / 100) * arenaRect.height,
            },
          }));
          lungedId = action.actorId;
        }
      }

      // After LUNGE_MS, fire effects + target poses.
      battleTimeout(() => {
        if (cancelledRef.current) return;
        spawnEffectsForAction(action);

        // Target pose → hurt for damage actions.
        if (action.damage !== undefined && action.damage > 0) {
          for (const tid of action.targetIds) {
            // Don't override defeated pose.
            const c = [...state.player, ...state.enemy].find(
              (cc) => cc.crabId === tid,
            );
            if (c && !c.isDefeated) setPose(tid, "hurt");
          }
        }

        // Knockback flinch — damaged crabs are pushed a few px away from
        // the attacker, capped far inside their own slot (never enough
        // to reach a neighbour's box).
        if (
          !reducedMotion &&
          arenaRect &&
          actorAnchor &&
          action.damage !== undefined &&
          action.damage > 0
        ) {
          const mag = Math.max(2, Math.min(10, arenaRect.width * 0.008));
          const entries: Record<string, { x: number; y: number }> = {};
          for (const tid of action.targetIds) {
            const ta = layoutRef.current.anchors.get(tid)?.anchor;
            const tc = [...state.player, ...state.enemy].find(
              (cc) => cc.crabId === tid,
            );
            if (!ta || !tc || tc.isDefeated) continue;
            const dx = ta.x - actorAnchor.x;
            const dy = ta.y - actorAnchor.y;
            const len = Math.hypot(dx, dy) || 1;
            entries[tid] = { x: (dx / len) * mag, y: (dy / len) * mag };
            knockedIds.push(tid);
          }
          if (Object.keys(entries).length > 0) {
            setDisplacements((prev) => ({ ...prev, ...entries }));
          }
        }

        // Defeated → pose "defeated" then showTombstone.
        if (action.defeated && action.defeated.length > 0) {
          for (const tid of action.defeated) {
            setPose(tid, "defeated");
            // After 600ms (scaled), show tombstone.
            battleTimeout(() => {
              if (cancelledRef.current) return;
              setTombstone(tid);
              clearPose(tid);
            }, 600);
          }
        }
      }, LUNGE_MS);

      // After TOTAL_MS, reset actor pose + clear target hurt poses, then onDone.
      battleTimeout(() => {
        if (cancelledRef.current) return;
        // Reset actor pose unless this was a self-action (regen etc).
        clearPose(action.actorId);
        // Reset target hurt poses (non-defeated ones).
        if (action.damage !== undefined && action.damage > 0) {
          for (const tid of action.targetIds) {
            const c = [...state.player, ...state.enemy].find(
              (cc) => cc.crabId === tid,
            );
            if (c && !c.isDefeated) clearPose(tid);
          }
        }
        // Everyone returns exactly to their slot anchor.
        if (lungedId || knockedIds.length > 0) {
          setDisplacements((prev) => {
            const next = { ...prev };
            if (lungedId) delete next[lungedId];
            for (const id of knockedIds) delete next[id];
            return next;
          });
        }
        onDone();
      }, TOTAL_MS);
    },
    [setPose, clearPose, setTombstone, spawnEffectsForAction, state, getProfileForAction, battleTimeout],
  );

  // ----- Advance to next actor / end round -----
  const advanceActor = useCallback(() => {
    if (cancelledRef.current || endedRef.current) return;
    // Pause gate: defer the advance until Play is pressed.
    if (pausedRef.current) {
      pendingStepRef.current = () => advanceActorRef.current();
      return;
    }
    actorIdxRef.current += 1;
    if (actorIdxRef.current >= turnOrderRef.current.length) {
      // End of round.
      endRoundRef.current();
    } else {
      processActorRef.current();
    }
  }, []);

  // ----- Process the current actor (by index) -----
  const processActor = useCallback(() => {
    if (cancelledRef.current || endedRef.current) return;
    // Pause gate: hold here until Play resumes the chain.
    if (pausedRef.current) {
      pendingStepRef.current = () => processActorRef.current();
      setThinking("Paused");
      return;
    }
    if (state.winner !== null) {
      finishBattleRef.current();
      return;
    }
    const order = turnOrderRef.current;
    let idx = actorIdxRef.current;

    // Skip defeated actors.
    while (idx < order.length && order[idx].isDefeated) {
      idx += 1;
    }
    if (idx >= order.length) {
      actorIdxRef.current = idx;
      endRoundRef.current();
      return;
    }
    actorIdxRef.current = idx;
    const actor = order[idx];

    // Freeze check.
    if (consumeFreeze(actor)) {
      rerender();
      const frozenAction: ArenaAction = {
        turn: state.turn,
        actorId: actor.crabId,
        actorSide: actor.side,
        skillId: "frozen",
        skillName: "Frozen",
        targetIds: [actor.crabId],
        targetSide: actor.side,
        visual: "lightning",
        message: `${actor.name} is frozen solid and skips the turn!`,
      };
      state.log.push(frozenAction);
      setThinking(
        `${actor.name} is frozen!`,
      );
      battleTimeout(() => {
        if (cancelledRef.current) return;
        setThinking(null);
        // Animate a quick lightning on self + "FROZEN!" floating text.
        const pos = getCombatantPos(actor.crabId);
        const fx: FxInstance = {
          id: nextFxId(),
          visual: "lightning",
          actorPos: pos,
          targetPos: pos,
        };
        setActiveFx((prev) => [...prev, fx]);
        const txt: TextInstance = {
          id: nextFxId(),
          text: "FROZEN!",
          x: pos.x,
          y: pos.y - 50,
          color: STATUS_COLOR.freeze,
        };
        setFloatingTexts((prev) => [...prev, txt]);
        battleTimeout(() => {
          if (cancelledRef.current) return;
          setActiveFx((prev) => prev.filter((f) => f.id !== fx.id));
          setFloatingTexts((prev) => prev.filter((t) => t.id !== txt.id));
          advanceActorRef.current();
        }, 700);
      }, 400);
      return;
    }

    // FULL AUTO BATTLER: the AutoPilot decides for BOTH sides — there
    // is no manual skill/target input in the Arena anymore.
    setThinking(`${actor.name} is choosing…`);
    rerender();

    const thinkMs = 600;
    battleTimeout(() => {
      if (cancelledRef.current || endedRef.current) return;
      // Paused during the think window: re-enter and let the gate hold.
      if (pausedRef.current) {
        processActorRef.current();
        return;
      }
      if (state.winner !== null) {
        finishBattleRef.current();
        return;
      }
      const decision = decideAction(state, actor);
      if (!decision || decision.targets.length === 0) {
        // Nobody the pilot can act on → skip silently.
        setThinking(null);
        advanceActorRef.current();
        return;
      }
      const action = applySkill(state, actor, decision.skill, decision.targets);
      checkWinner(state);
      rerender();
      setThinking(null);
      animateAction(action, () => advanceActorRef.current());
    }, thinkMs);
  }, [state, animateAction, getCombatantPos, nextFxId, rerender, battleTimeout]);

  // ----- End of round: maintenance + animate regen ticks + start next round -----
  const endRound = useCallback(() => {
    if (cancelledRef.current || endedRef.current) return;
    if (state.winner !== null) {
      finishBattleRef.current();
      return;
    }
    // Run maintenance — produces regen_tick actions to animate.
    const regenActions = endRoundMaintenance(state);
    rerender();

    if (state.winner !== null) {
      // Winner decided by end-of-round check (e.g. last enemy defeated by
      // status tick). Skip regen animation and finish.
      finishBattleRef.current();
      return;
    }

    if (regenActions.length > 0) {
      // Animate regen ticks simultaneously (they're all small heals).
      for (const a of regenActions) {
        spawnEffectsForAction(a);
      }
      const waitMs = 900;
      battleTimeout(() => {
        if (cancelledRef.current) return;
        startNextRoundRef.current();
      }, waitMs);
    } else {
      // Small breather between rounds.
      const waitMs = 250;
      battleTimeout(() => {
        if (cancelledRef.current) return;
        startNextRoundRef.current();
      }, waitMs);
    }
  }, [state, spawnEffectsForAction, rerender, battleTimeout]);

  // ----- Start a fresh round -----
  const startNextRound = useCallback(() => {
    if (cancelledRef.current || endedRef.current) return;
    // Pause gate: hold the new round until Play resumes the chain.
    if (pausedRef.current) {
      pendingStepRef.current = () => startNextRoundRef.current();
      return;
    }
    if (state.winner !== null) {
      finishBattleRef.current();
      return;
    }
    bumpStateTurn(state);
    turnOrderRef.current = computeTurnOrder(state);
    actorIdxRef.current = 0;
    rerender();
    processActorRef.current();
  }, [state, rerender]);

  // ----- Finish the battle -----
  const finishBattle = useCallback(() => {
    if (endedRef.current) return;
    endedRef.current = true;
    setEnded(true);
    setThinking(null);

    const rewards = calculateRewards(state, entryCost);

    if (state.winner === "player") {
      // Victory poses for surviving player crabs.
      for (const c of state.player) {
        if (!c.isDefeated) setPose(c.crabId, "victory");
      }
    }
    rerender();

    // After celebration, call onComplete.
    battleTimeout(() => {
      if (cancelledRef.current) return;
      onComplete({
        winner: state.winner ?? "enemy",
        goldReward: rewards.goldReward,
        xpReward: rewards.xpReward,
        itemsFound: rewards.itemsFound,
        arenaId,
      });
    }, 1600);
  }, [state, entryCost, onComplete, arenaId, setPose, rerender, battleTimeout]);

  // Sync the phase-function refs after every render so the latest closures
  // are always reachable from clock-timer callbacks and from each other.
  useEffect(() => {
    advanceActorRef.current = advanceActor;
    processActorRef.current = processActor;
    endRoundRef.current = endRound;
    startNextRoundRef.current = startNextRound;
    finishBattleRef.current = finishBattle;
  });

  // ----- Spectator controls: play / pause -----
  const togglePause = useCallback(() => {
    if (endedRef.current) return;
    const next = !pausedRef.current;
    pausedRef.current = next;
    setPaused(next);
    if (next) {
      setThinking("Paused");
    } else {
      setThinking(null);
      const step = pendingStepRef.current;
      pendingStepRef.current = null;
      if (step) step();
    }
  }, []);

  // ----- Spectator controls: skip to the final result -----
  const handleSkip = useCallback(() => {
    if (endedRef.current) return;
    // Halt the animated chain, resolve the battle headlessly with the
    // engine runner (30-round cap + HP tiebreak), then finish through
    // the normal path so rewards/result are identical. Stale timeouts
    // are neutralised by the ended flag finishBattle sets first.
    // Skip also ends the freeze: if the battle was paused, the clock
    // must run again or finishBattle's completion timer could never
    // fire — skipping is an explicit "end this now" either way.
    pausedRef.current = false;
    setPaused(false);
    battleClock.setScale(speed);
    cancelledRef.current = true;
    runBattle(state);
    finishBattleRef.current();
    cancelledRef.current = false;
  }, [state, speed]);

  // ----- Flee -----
  const handleFlee = useCallback(() => {
    if (endedRef.current) return;
    endedRef.current = true;
    setEnded(true);
    setThinking(null);
    // Fleeing ends the freeze too — the exit timer below is a clock
    // timer and must be able to fire even from a paused battle.
    pausedRef.current = false;
    setPaused(false);
    battleClock.setScale(speed);
    // Zero rewards on flee.
    battleTimeout(() => {
      if (cancelledRef.current) return;
      onComplete({
        winner: "enemy",
        goldReward: 0,
        xpReward: 0,
        itemsFound: [],
        arenaId,
      });
    }, 300);
  }, [onComplete, arenaId, battleTimeout, speed]);

  // ----- Bootstrap: start the first round on mount -----
  useEffect(() => {
    // Tiny delay so refs are populated before first positions are read.
    const t = battleTimeout(() => {
      if (cancelledRef.current) return;
      startNextRoundRef.current();
    }, 200);
    return () => battleClock.clearTimeout(t);
  }, []);

  // ----- Derived display values -----
  const currentActor =
    actorIdxRef.current < turnOrderRef.current.length
      ? turnOrderRef.current[actorIdxRef.current]
      : null;

  const recentLog = state.log.slice(-6).reverse();

  // Render one battlefield row layer for a side (Option A). Every crab is
  // positioned ABSOLUTELY on its slot anchor from slotLayout.ts — the
  // wrapper IS the slot box (uniform %, never overlapping), with a
  // glowing ellipse marker under the crab (blue = player, red = enemy,
  // brighter while the crab is acting or being targeted). Lunge/knockback
  // displacements translate only the inner motion layer; at rest every
  // crab sits exactly on its anchor.
  const renderRowLayer = (
    side: "player" | "enemy",
    row: "front" | "mid" | "back",
  ): React.ReactNode => {
    const list = (side === "player" ? state.player : state.enemy).filter(
      (c) => c.row === row,
    );
    if (list.length === 0) return null;
    const { box } = layoutData;
    return (
      <div
        data-testid={`battle-row-${side}-${row}`}
        className="absolute inset-0 pointer-events-none"
      >
        <span
          aria-hidden
          className="absolute text-[8px] font-black uppercase tracking-widest"
          style={{
            left: `${columnX(side, row)}%`,
            top: 2,
            transform: "translateX(-50%)",
            color: "rgba(234,246,255,0.4)",
          }}
        >
          {row}
        </span>
        {list.map((c) => {
          const crab = crabMap.get(c.crabId);
          if (!crab) return <div key={c.crabId} />;
          const entry = layoutData.anchors.get(c.crabId);
          if (!entry) return <div key={c.crabId} />;
          const { anchor } = entry;
          const isCurrent = currentActor?.crabId === c.crabId;
          const disp = displacements[c.crabId];
          const highlighted = isCurrent;
          const markerColor =
            side === "player" ? "56,189,248" : "248,113,113";
          return (
            <div
              key={c.crabId}
              data-testid="slot-anchor"
              data-slot={entry.key}
              data-side={side}
              data-row={row}
              className="absolute"
              style={{
                left: `${anchor.x}%`,
                top: `${anchor.y}%`,
                width: `${box.widthPct}%`,
                height: `${box.heightPct}%`,
                transform: "translate(-50%, -50%)",
                zIndex: disp ? 95 : 10 + Math.round(anchor.y),
              }}
            >
              {/* Slot marker — glowing ellipse the crab stands on */}
              <div
                aria-hidden
                data-testid="slot-marker"
                className="absolute pointer-events-none"
                style={{
                  left: "50%",
                  bottom: "1%",
                  transform: "translateX(-50%)",
                  width: "84%",
                  height: "17%",
                  borderRadius: "50%",
                  background: `radial-gradient(ellipse, rgba(${markerColor},0.55) 0%, rgba(${markerColor},0.14) 58%, transparent 76%)`,
                  border: `1px solid rgba(${markerColor},${highlighted ? 0.85 : 0.35})`,
                  boxShadow: highlighted
                    ? `0 0 20px rgba(${markerColor},0.85)`
                    : `0 0 8px rgba(${markerColor},0.25)`,
                  opacity: c.isDefeated ? 0.3 : highlighted ? 1 : 0.7,
                  transition: "all 0.2s ease",
                }}
              />
              <motion.div
                className="absolute inset-0 pointer-events-auto flex items-start justify-center"
                animate={{ x: disp?.x ?? 0, y: disp?.y ?? 0 }}
                transition={{ type: "tween", duration: 0.16, ease: "easeOut" }}
              >
                <CrabSlot
                  combatant={c}
                  crab={crab}
                  pose={poses[c.crabId] ?? "idle"}
                  facing={side === "enemy" ? "left" : "right"}
                  showTombstone={tombstones[c.crabId] ?? false}
                  isCurrentActor={isCurrent}
                  spriteSize={spritePx}
                  anchored
                  slotRef={(el) => {
                    slotRefs.current[`${side}-${c.slot}`] = el;
                  }}
                />
              </motion.div>
            </div>
          );
        })}
      </div>
    );
  };

  // ----- Render -----
  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ background: "linear-gradient(180deg, #0A1B3D 0%, #06122B 100%)" }}
    >
      {/* ---------- TOP BAR ---------- */}
      <header
        className="px-3 py-2 flex items-center justify-between gap-2 border-b sticky top-0 z-20"
        style={{
          borderColor: "rgba(124,245,225,0.2)",
          background: "rgba(6,18,43,0.85)",
          backdropFilter: "blur(8px)",
        }}
      >
        <TurnIndicator turn={state.turn} arenaId={arenaId} />
        <div className="flex items-center gap-2">
          {/* Spectator controls — full auto battler: play/pause, speed, skip */}
          <div
            className="flex items-center gap-1 rounded-lg px-1 py-0.5"
            style={{
              background: "rgba(10,27,61,0.6)",
              border: "1px solid rgba(124,245,225,0.25)",
            }}
          >
            <button
              type="button"
              data-testid="battle-pause-toggle"
              onClick={togglePause}
              disabled={ended}
              aria-pressed={paused}
              aria-label={paused ? "Resume the battle" : "Pause the battle"}
              className="px-2 py-0.5 text-[10px] font-bold rounded-md"
              style={{
                background: paused ? "rgba(255,209,102,0.25)" : "transparent",
                color: paused ? "#FFD166" : "#7CF5E1",
                opacity: ended ? 0.4 : 1,
                cursor: ended ? "not-allowed" : "pointer",
              }}
            >
              {paused ? "▶ Play" : "⏸ Pause"}
            </button>
            {([1, 2, 3] as const).map((s) => (
              <button
                key={s}
                type="button"
                data-testid="battle-speed-btn"
                data-speed={s}
                onClick={() => setSpeed(s)}
                aria-pressed={speed === s}
                aria-label={`Battle speed x${s}`}
                className="px-2 py-0.5 text-[10px] font-bold rounded-md transition-all"
                style={{
                  background:
                    speed === s ? "rgba(124,245,225,0.2)" : "transparent",
                  color:
                    speed === s ? "#7CF5E1" : "rgba(234,246,255,0.6)",
                  boxShadow:
                    speed === s ? "0 0 8px rgba(124,245,225,0.5)" : "none",
                  border:
                    speed === s
                      ? "1px solid rgba(124,245,225,0.45)"
                      : "1px solid transparent",
                  minWidth: 28,
                }}
              >
                x{s}
              </button>
            ))}
            <button
              type="button"
              data-testid="battle-skip"
              onClick={handleSkip}
              disabled={ended}
              aria-label="Skip to the battle result"
              className="px-2 py-0.5 text-[10px] font-bold rounded-md"
              style={{
                background: "transparent",
                color: "#EAF6FF",
                opacity: ended ? 0.4 : 1,
                cursor: ended ? "not-allowed" : "pointer",
              }}
            >
              ⏭ Skip
            </button>
          </div>
          <button
            type="button"
            onClick={handleFlee}
            disabled={ended}
            aria-label="Flee the battle"
            className="px-2 py-1 text-[10px] font-bold rounded-lg"
            style={{
              background: "rgba(255,77,109,0.18)",
              color: "#FF4D6D",
              border: "1px solid rgba(255,77,109,0.4)",
              opacity: ended ? 0.4 : 1,
              cursor: ended ? "not-allowed" : "pointer",
            }}
          >
            ⚐ Flee
          </button>
        </div>
      </header>

      {/* ---------- ARENA ---------- */}
      <div
        ref={arenaRef}
        data-testid="battle-arena"
        data-battle-paused={paused ? "true" : "false"}
        data-battle-clock-ms={0}
        className={`relative overflow-hidden -mx-3 md:mx-0${
          shaking === "heavy"
            ? " arena-shake-heavy"
            : shaking === "light"
              ? " arena-shake-light"
              : ""
        }`}
        style={{
          height: "min(76vh, 680px)",
          minHeight: 420,
          background:
            "linear-gradient(180deg, #06122B 0%, #0A1B3D 45%, #1A2F4A 75%, #2A2415 100%)",
          borderBottom: "2px solid rgba(124,245,225,0.15)",
        }}
      >
        {/* Ambient bubbles */}
        <ArenaBubbles count={14} />

        {/* Pooled particle system: ambient bubbles + battle bursts */}
        <ParticleLayer bursts={particleBursts} />

        {/* Sand floor */}
        <div
          className="absolute bottom-0 left-0 right-0"
          aria-hidden
          style={{
            height: "18%",
            background:
              "linear-gradient(180deg, rgba(58,47,31,0) 0%, #3a2f1f 60%, #2a2415 100%)",
          }}
        />
        {/* Rock silhouettes (left + right) */}
        <div
          aria-hidden
          className="absolute bottom-0 left-0"
          style={{
            width: 60,
            height: 80,
            background:
              "radial-gradient(circle at 30% 80%, #1f1a12 0%, transparent 70%)",
          }}
        />
        <div
          aria-hidden
          className="absolute bottom-0 right-0"
          style={{
            width: 60,
            height: 80,
            background:
              "radial-gradient(circle at 70% 80%, #1f1a12 0%, transparent 70%)",
          }}
        />

        {/* Battlefield (Option A) — the player holds the LEFT half, the
            enemy the mirrored RIGHT half; formation rows are columns and
            the two frontlines face each other across the centre line.
            Every crab stands on its slot anchor (slotLayout.ts). */}
        <div
          aria-hidden
          className="absolute right-2 top-1 text-[9px] font-black uppercase tracking-widest"
          style={{ color: "rgba(255,111,145,0.65)" }}
        >
          Enemy Waters
        </div>
        <div
          aria-hidden
          className="absolute left-2 bottom-1 text-[9px] font-black uppercase tracking-widest"
          style={{ color: "rgba(124,245,225,0.65)" }}
        >
          Your Waters
        </div>
        <div
          aria-hidden
          className="absolute top-0 bottom-0"
          style={{
            left: "50%",
            borderLeft: "1px dashed rgba(124,245,225,0.3)",
          }}
        />
        {renderRowLayer("enemy", "back")}
        {renderRowLayer("enemy", "mid")}
        {renderRowLayer("enemy", "front")}
        {renderRowLayer("player", "front")}
        {renderRowLayer("player", "mid")}
        {renderRowLayer("player", "back")}

        {/* Effects layer (overlay, pointer-events-none via each effect) */}
        <div className="absolute inset-0 pointer-events-none">
          <AnimatePresence>
            {activeFx.map((fx) => renderVisualEffect(fx))}
            {activeFx.map((fx) => {
              const flipKey = fx.flipFx ?? FLIP_FOR_VISUAL[fx.visual];
              // Element-driven damage impacts are colour-treated to
              // the ATTACKER's element; support impacts pass no
              // treatment and render in the skill's theme colours.
              const treatment = fx.fxElement
                ? fxTreatmentFor(flipKey, fx.fxElement)
                : undefined;
              return (
                <div
                  key={`flip-${fx.id}`}
                  style={{ display: "contents" }}
                  data-fx-profile={fx.profile}
                  data-skill-id={fx.skillId}
                >
                  <FlipbookFx
                    fx={flipKey}
                    x={fx.targetPos.x}
                    y={fx.targetPos.y}
                    size={fx.fxSize ?? (fx.visual === "aoe_wave" ? 170 : 120)}
                    filter={treatment?.filter}
                    fxElement={fx.fxElement}
                  />
                </div>
              );
            })}
            {projectiles.map((p) => {
              const treatment = p.fxElement
                ? fxTreatmentFor(p.fx, p.fxElement)
                : undefined;
              return (
                <ProjectileFx
                  key={`proj-${p.id}`}
                  fx={p.fx}
                  from={p.from}
                  to={p.to}
                  durationMs={p.durationMs}
                  arcHeight={p.arcHeight}
                  size={p.size}
                  profile={p.profile}
                  skillId={p.skillId}
                  filter={treatment?.filter}
                  fxElement={p.fxElement}
                  onDone={() => {
                    setProjectiles((prev) => prev.filter((q) => q.id !== p.id));
                    setActiveFx((prev) => [...prev, p.impact]);
                  }}
                />
              );
            })}
          </AnimatePresence>
          <AnimatePresence>
            {damageNumbers.map((d) => (
              <DamageNumber
                key={d.id}
                id={d.id}
                value={d.value}
                x={d.x}
                y={d.y}
                variant={d.variant}
              />
            ))}
          </AnimatePresence>
          <AnimatePresence>
            {floatingTexts.map((t) => (
              <FloatingText
                key={t.id}
                text={t.text}
                x={t.x}
                y={t.y}
                color={t.color}
              />
            ))}
          </AnimatePresence>
          <AnimatePresence>
            {comboCounters.map((c) => (
              <ComboCounter
                key={c.id}
                count={c.count}
                x={c.x}
                y={c.y}
              />
            ))}
          </AnimatePresence>
        </div>

        {/* Thinking indicator */}
        {thinking && !ended && (
          <motion.div
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 px-3 py-1.5 rounded-full text-xs font-bold"
            style={{
              background: "rgba(6,18,43,0.92)",
              border: "1px solid rgba(124,245,225,0.4)",
              color: "#7CF5E1",
              boxShadow: "0 0 16px rgba(124,245,225,0.35)",
            }}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
          >
            {thinking}
            <motion.span
              animate={{ opacity: [0, 1, 0] }}
              transition={{ duration: 1, repeat: Infinity }}
            >
              …
            </motion.span>
          </motion.div>
        )}

        {/* Battle-ended overlay (victory celebration) */}
        {ended && state.winner === "player" && (
          <motion.div
            className="absolute inset-0 flex items-center justify-center pointer-events-none"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
          >
            <motion.div
              className="text-4xl md:text-6xl font-black font-display"
              style={{
                background: "linear-gradient(135deg, #FFD166 0%, #FF7A1A 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
                filter: "drop-shadow(0 0 16px rgba(255,209,102,0.7))",
                fontFamily: "Fredoka, system-ui, sans-serif",
              }}
              initial={{ scale: 0, rotate: -10 }}
              animate={{ scale: [0, 1.2, 1], rotate: [-10, 5, 0] }}
              transition={{ type: "spring", bounce: 0.5, duration: 0.8 }}
            >
              VICTORY!
            </motion.div>
          </motion.div>
        )}
        {ended && state.winner === "enemy" && (
          <motion.div
            className="absolute inset-0 flex items-center justify-center pointer-events-none"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
          >
            <motion.div
              className="text-4xl md:text-6xl font-black font-display"
              style={{
                background: "linear-gradient(135deg, #FF4D6D 0%, #C026D3 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
                filter: "drop-shadow(0 0 16px rgba(255,77,109,0.6))",
                fontFamily: "Fredoka, system-ui, sans-serif",
              }}
              initial={{ scale: 0, rotate: 10 }}
              animate={{ scale: [0, 1.2, 1], rotate: [10, -5, 0] }}
              transition={{ type: "spring", bounce: 0.5, duration: 0.8 }}
            >
              DEFEAT…
            </motion.div>
          </motion.div>
        )}
      </div>

      {/* ---------- BOTTOM PANEL ---------- */}
      <div
        className="flex-1 flex flex-col md:flex-row gap-2 px-3 py-2 overflow-hidden"
        style={{ background: "rgba(6,18,43,0.6)" }}
      >
        {/* Spectator status panel — the AutoPilot plays both teams;
            the player watches (controls live in the header). */}
        <div
          className="flex-1 rounded-2xl p-3 flex flex-col justify-center min-h-[120px]"
          style={{
            background: "rgba(10,27,61,0.5)",
            border: "1px solid rgba(124,245,225,0.18)",
          }}
        >
          {ended ? (
            <div
              className="text-center text-sm font-bold"
              style={{ color: "rgba(234,246,255,0.7)" }}
            >
              Battle complete — tallying rewards…
            </div>
          ) : paused ? (
            <div className="text-center">
              <div
                className="text-sm font-bold"
                style={{ color: "#FFD166" }}
              >
                ⏸ Paused
              </div>
              <div
                className="text-[10px] mt-1"
                style={{ color: "rgba(234,246,255,0.6)" }}
              >
                Press Play to resume the auto battle.
              </div>
            </div>
          ) : thinking ? (
            <div
              className="text-center text-sm font-bold"
              style={{ color: "rgba(234,246,255,0.75)" }}
            >
              {thinking}
              <motion.span
                animate={{ opacity: [0, 1, 0] }}
                transition={{ duration: 1, repeat: Infinity }}
              >
                …
              </motion.span>
            </div>
          ) : (
            <div className="text-center">
              <div
                className="text-xs font-bold"
                style={{ color: "rgba(234,246,255,0.75)" }}
              >
                ⚔️ Auto Battle
                {currentActor ? ` — ${currentActor.name} is acting` : ""}
              </div>
              <div
                className="text-[10px] mt-1"
                style={{ color: "rgba(234,246,255,0.5)" }}
              >
                Both teams are piloted by the arena AI. Sit back and watch —
                pause, change speed, or skip from the top bar.
              </div>
            </div>
          )}
        </div>

        {/* Action log */}
        <div
          className="rounded-2xl p-2 md:w-64 max-h-32 md:max-h-full overflow-y-auto"
          style={{
            background: "rgba(10,27,61,0.5)",
            border: "1px solid rgba(124,245,225,0.18)",
          }}
        >
          <div
            className="text-[10px] font-bold uppercase tracking-wide mb-1 sticky top-0"
            style={{ color: "rgba(234,246,255,0.55)" }}
          >
            Battle Log
          </div>
          <div className="flex flex-col gap-1">
            <AnimatePresence initial={false}>
              {recentLog.map((a, i) => (
                <motion.div
                  key={`${state.log.length - 6 + i}-${a.skillId}-${i}`}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0 }}
                  className="text-[10px] leading-snug"
                  style={{
                    color:
                      a.actorSide === "player" ? "#7CF5E1" : "#FF6F91",
                    fontFamily: "ui-monospace, monospace",
                  }}
                >
                  <span style={{ color: "rgba(234,246,255,0.45)" }}>
                    T{a.turn}
                  </span>{" "}
                  {a.message}
                </motion.div>
              ))}
            </AnimatePresence>
            {recentLog.length === 0 && (
              <div
                className="text-[10px]"
                style={{ color: "rgba(234,246,255,0.4)" }}
              >
                Battle begins…
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
