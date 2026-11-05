// Crabtopia - Arena Battle Screen (Real-Time Auto Battler)
// The main 5v5 FULL AUTO BATTLER. There is no per-turn player input:
// after deployment the battle runs itself in CONTINUOUS time and the
// player watches with spectator controls (play/pause, speed x1/x2/x3,
// skip to result). BOTH teams are piloted by the simulator's AI.
//
// Architecture (Phase 2 — see docs/realtime-battler-design.md):
// - The battle is owned by engine/battleSim.ts: a deterministic,
//   fixed-timestep (50 battle-ms) simulation holding positions,
//   steering, cooldowns, projectiles, statuses and deaths. This
//   component is a RENDERER: it advances the shared BattleClock each
//   animation frame, steps the sim by the same battle-time delta, and
//   translates the sim's event stream into the existing FX machinery
//   (flipbooks, homing ProjectileFx visuals, particles, damage numbers).
// - Pause = BattleClock scale 0: the sim receives zero battle-time, so
//   units, projectiles, statuses and tombstone rises all freeze
//   together; x1/x2/x3 scales battle-time for everything at once.
// - Skip = runSimToCompletion(sim): the SAME sim, the SAME seeded RNG
//   stream — the result (winner, rewards via calculateRewards) is
//   identical to watching, and the final field (incl. tombstones for
//   every fallen crab) is shown before the result hand-off.
// - Units render BARE on the field: no card chrome — a slim floating
//   HP bar + status icons above the sprite, on the subtle ground
//   ellipse. (The deployment board keeps its cards; only the live
//   battle field is bare.)
// - `state` (the ArenaBattleState inside the sim) is created once via
//   initBattle and mutated in place by the sim — the engine's
//   deterministic RNG keys off the state object identity via a WeakMap,
//   so the reference must never change.
//
// NOTE on eslint disable: the sim mutates the battle state in place by
// design (see above). The React Compiler's `react-hooks/refs` rule
// flags reads of the mutable state during render; the per-frame
// re-render below keeps the UI in sync. We disable that one rule
// file-wide.

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
  getSkillsForClass,
  calculateRewards,
  type ArenaBattleState,
  type ArenaSkill,
  type StatusEffectId,
} from "../../engine/arenaEngine";
import {
  createSim,
  stepSim,
  runSimToCompletion,
  type SimEvent,
  type SimState,
  type SimUnit,
} from "../../engine/battleSim";
import { battleClock } from "../../animation/battleClock";
import { BUFFS_KEY } from "../useLocalStorage";
import CrabBattleSprite, { type CrabPose } from "../animations/CrabBattleSprite";
import {
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
// VISUAL MAPPINGS
// ---------------------------------------------------------------------------
const STATUS_LABEL: Record<StatusEffectId, string> = {
  weaken: "Weakened!",
  freeze: "Frozen!",
  defense_down: "Defense Down!",
  regen: "Regenerating!",
  shield: "Shielded!",
  slow: "Slowed!",
};

const STATUS_COLOR: Record<StatusEffectId, string> = {
  weaken: "#7A5CFF",
  freeze: "#5CDEFF",
  defense_down: "#FF6F91",
  regen: "#7CF5E1",
  shield: "#FFD166",
  slow: "#5EEAD4",
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

/** Sheet-clip pose for a skill's windup, keyed by profile attackerAnim. */
const POSE_FOR_ANIM: Record<string, CrabPose> = {
  attack: "attack_lunge",
  combo: "combo",
  skill: "casting",
  jump: "attack_lunge",
};

/** How long after a sim death event the corpse swaps to its tombstone
 *  (battle-ms) — long enough for the death clip to read. */
const TOMBSTONE_DELAY_MS = 600;

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
  // ----- Battle state (held once, mutated in place by the sim) -----
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

  // ----- Slot layout: spawn anchors (deployment arrangement) -----
  // Row membership never changes, so this is computed once. Each row's
  // members are spread evenly over the lane band by their in-row ORDER
  // (the free-placement lane order from the deployment board), so what
  // the player arranged top-to-bottom is what spawns. The sim starts
  // every unit on its anchor; from there units move freely.
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

  // ----- The simulation (held once; stepped by the clock driver) -----
  const [sim] = useState<SimState>(() => {
    const spawns: Record<string, { x: number; y: number }> = {};
    for (const [crabId, entry] of layoutData.anchors) {
      spawns[crabId] = { x: entry.anchor.x, y: entry.anchor.y };
    }
    return createSim(state, spawns);
  });
  const simById = useMemo(() => {
    const m = new Map<string, SimUnit>();
    for (const u of sim.units) m.set(u.c.crabId, u);
    return m;
  }, [sim]);

  // ----- UI state -----
  const [speed, setSpeed] = useState<1 | 2 | 3>(1);
  // Full auto battler: the battle plays itself; the player only
  // watches. `paused` sets the shared BattleClock's scale to 0 — a
  // REAL freeze of the sim and of every animation system at once.
  const [paused, setPaused] = useState(false);
  const [activeFx, setActiveFx] = useState<FxInstance[]>([]);
  const [projectiles, setProjectiles] = useState<ProjectileInstance[]>([]);
  const [shaking, setShaking] = useState<"light" | "heavy" | null>(null);
  const [particleBursts, setParticleBursts] = useState<ParticleBurst[]>([]);
  const burstIdRef = useRef(0);
  const [damageNumbers, setDamageNumbers] = useState<DmgInstance[]>([]);
  const [floatingTexts, setFloatingTexts] = useState<TextInstance[]>([]);
  const [comboCounters, setComboCounters] = useState<ComboInstance[]>([]);
  const [ended, setEnded] = useState(false);
  // Per-frame re-render: the sim mutates in place, so the driver bumps
  // this counter every animation frame and the field re-derives from
  // live sim state (positions, HP, statuses, poses).
  const [, setFrame] = useState(0);

  // ----- Refs -----
  const arenaRef = useRef<HTMLDivElement>(null);
  const cancelledRef = useRef(false);
  const endedRef = useRef(false);
  const pausedRef = useRef(false);
  const finishScheduledRef = useRef(false);
  /** Index into sim.events already translated into FX. */
  const drainedRef = useRef(0);
  /** crabId → battle-ms moment its hurt pose ends (renderer feedback). */
  const hurtUntilRef = useRef<Record<string, number>>({});
  /** crabId → battle-ms moment its tombstone appears (death + delay). */
  const tombstoneAtRef = useRef<Record<string, number>>({});

  // ----- Battle clock timers (FX lifetimes etc.) -----
  const battleTimeout = useCallback((cb: () => void, ms: number): number => {
    return battleClock.setTimeout(() => {
      if (cancelledRef.current) return;
      cb();
    }, ms);
  }, []);

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

  // ----- Arena size (measured) → positions in px + one sprite size -----
  const [arenaSize, setArenaSize] = useState<{ w: number; h: number }>({
    w: 0,
    h: 0,
  });
  const arenaSizeRef = useRef(arenaSize);
  useEffect(() => {
    arenaSizeRef.current = arenaSize;
  }, [arenaSize]);
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
  // Sprite size: the slot BOXES are the spawn-layout invariant (they
  // never overlap — see slotLayout), but the sprite art itself may
  // breathe past its box width (×1.45): frames are depth-sorted by
  // lane, so a crab spilling a few px into a neighbour's frame reads as
  // depth, not collision. Without the breathing factor a phone's
  // 15%-wide slot capped sprites at ~58px — far too small to enjoy.
  // Desktop is height-bound (~123px at 1440×900). On a 390×844 phone
  // the arena runs full-bleed (the -mx-3 below reclaims the shell's
  // 12px side padding, so the arena is the full 390px wide) and the
  // width term gives floor(390 × 15% × 1.45) = 84px. The containment
  // cap floor(w × 0.2) + 8 keeps a centred sprite inside the arena
  // horizontally (outermost anchors sit at 10% of the width).
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

  // ----- Position helper: sim % → arena px (event FX placement) -----
  const unitPosPx = useCallback(
    (u: SimUnit): { x: number; y: number } => {
      const { w, h } = arenaSizeRef.current;
      return { x: (u.x / 100) * w, y: (u.y / 100) * h - 12 };
    },
    [],
  );

  // Unique id generator for fx instances.
  const fxId = useRef(0);
  const nextFxId = useCallback(() => `fx-${fxId.current++}`, []);

  // ----- Skill presentation profile for a sim skill -----
  const profileFor = useCallback(
    (skill: ArenaSkill, classId: ClassId): SkillProfile =>
      getSkillProfile(skill, classId),
    [],
  );

  // Sim events carry skill ids; resolve the full def from the actor's
  // class skill list (the same list the sim itself uses).
  const skillById = useCallback(
    (actor: SimUnit, skillId: string): ArenaSkill => {
      const def = getSkillsForClass(actor.c.classId).find(
        (s) => s.id === skillId,
      );
      return (
        def ??
        ({
          id: skillId,
          name: skillId,
          energyCost: 0,
          cooldown: 0,
          power: 1,
          targetType: "enemy",
          description: "",
          visual: "claw",
        } as ArenaSkill)
      );
    },
    [],
  );

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

  // ----- FX spawners (shared by the sim-event handlers) -----
  const spawnDamageNumber = useCallback(
    (value: number, pos: { x: number; y: number }, variant: "damage" | "heal" | "crit") => {
      const d: DmgInstance = {
        id: nextFxId(),
        value,
        x: pos.x,
        y: pos.y - 30,
        variant,
      };
      setDamageNumbers((prev) => [...prev, d]);
      battleTimeout(() => {
        setDamageNumbers((prev) => prev.filter((x) => x.id !== d.id));
      }, 1300);
    },
    [nextFxId, battleTimeout],
  );

  const spawnFloatingText = useCallback(
    (text: string, pos: { x: number; y: number }, color: string) => {
      const t: TextInstance = {
        id: nextFxId(),
        text,
        x: pos.x,
        y: pos.y - 50,
        color,
      };
      setFloatingTexts((prev) => [...prev, t]);
      battleTimeout(() => {
        setFloatingTexts((prev) => prev.filter((x) => x.id !== t.id));
      }, 1300);
    },
    [nextFxId, battleTimeout],
  );

  const spawnBursts = useCallback((bursts: ParticleBurst[]) => {
    if (bursts.length > 0) {
      setParticleBursts((prev) => [...prev.slice(-18), ...bursts]);
    }
  }, []);

  /**
   * Spawn the impact FX (+ particles) for one hit landing on a target:
   * the skill profile's flipbook treatment, element-driven for damage
   * archetypes, theme colours for support. Used for melee strikes, AoE
   * hits and cast resolutions — projectile impacts arrive via
   * ProjectileFx.onDone instead (flight first, impact on landing).
   */
  const spawnImpact = useCallback(
    (
      actor: SimUnit,
      skill: ArenaSkill,
      target: SimUnit,
      withParticles: boolean,
    ) => {
      const prof = profileFor(skill, actor.c.classId);
      const fxElement = profileFxElement(prof, actor.c.element) ?? undefined;
      const burstColors = fxElement
        ? elementBurstColors(fxElement)
        : undefined;
      const actorPos = unitPosPx(actor);
      const targetPos = unitPosPx(target);
      const newFx: FxInstance[] = [];
      for (let r = 0; r < prof.fxRepeats; r++) {
        const off =
          prof.fxRepeats > 1 ? (r - (prof.fxRepeats - 1) / 2) * 22 : 0;
        newFx.push({
          id: nextFxId(),
          visual: skill.visual,
          actorPos,
          targetPos: { x: targetPos.x + off, y: targetPos.y },
          flipFx: prof.fx,
          fxSize: prof.fxSize,
          profile: prof.archetype,
          skillId: skill.id,
          fxElement,
        });
      }
      setActiveFx((prev) => [...prev, ...newFx]);
      if (!withParticles) return;
      const bursts: ParticleBurst[] = [];
      if (prof.particles) {
        const spots =
          prof.particles.at === "actor" ? [actorPos] : [targetPos];
        for (const s of spots) {
          bursts.push({
            id: ++burstIdRef.current,
            preset: prof.particles.preset,
            x: s.x,
            y: s.y,
            count: prof.particles.count,
            colors: burstColors,
          });
        }
      } else if (skill.targetType !== "ally" && skill.targetType !== "all_allies") {
        bursts.push({
          id: ++burstIdRef.current,
          preset: "sparks",
          x: targetPos.x,
          y: targetPos.y,
          count: 14,
          colors: burstColors,
        });
        if (skill.visual === "aoe_wave") {
          bursts.push({
            id: ++burstIdRef.current,
            preset: "splash",
            x: targetPos.x,
            y: targetPos.y,
            count: 16,
            colors: burstColors,
          });
        }
        if (skill.visual === "crystal_burst") {
          bursts.push({
            id: ++burstIdRef.current,
            preset: "explosion",
            x: targetPos.x,
            y: targetPos.y,
            count: 16,
            colors: burstColors,
          });
        }
      }
      spawnBursts(bursts);
    },
    [profileFor, unitPosPx, nextFxId, spawnBursts],
  );

  // ----- Finish the battle (identical rewards contract) -----
  const finishBattle = useCallback(() => {
    if (endedRef.current) return;
    endedRef.current = true;
    setEnded(true);
    const rewards = calculateRewards(state, entryCost);
    // After the celebration, hand the result to the controller exactly
    // as the turn-based version did.
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
  }, [state, entryCost, onComplete, arenaId, battleTimeout]);
  const finishBattleRef = useRef(finishBattle);
  useEffect(() => {
    finishBattleRef.current = finishBattle;
  }, [finishBattle]);

  // ----- Sim event → FX translation -----
  const handleSimEvent = useCallback(
    (ev: SimEvent) => {
      const unit = (id: string) => simById.get(id);
      switch (ev.type) {
        case "attackStart": {
          const actor = unit(ev.actorId);
          if (!actor) return;
          const prof = profileFor(skillById(actor, ev.skillId), actor.c.classId);
          if (prof.shake !== "none") {
            setShaking(prof.shake);
            battleTimeout(() => setShaking(null), 420);
          }
          return;
        }
        case "strike": {
          const actor = unit(ev.actorId);
          const target = unit(ev.targetId);
          if (!actor || !target) return;
          hurtUntilRef.current[ev.targetId] = battleClock.elapsedMs + 350;
          spawnImpact(actor, skillById(actor, ev.skillId), target, true);
          const pos = unitPosPx(target);
          if (ev.damage > 0) {
            spawnDamageNumber(
              ev.damage,
              pos,
              ev.comboMult >= 1.2 ? "crit" : "damage",
            );
          }
          if (ev.comboMult >= 1.2) {
            const count = Math.round((ev.comboMult - 1) / 0.2) + 1;
            const c: ComboInstance = {
              id: nextFxId(),
              count,
              x: pos.x,
              y: pos.y - 60,
            };
            setComboCounters((prev) => [...prev, c]);
            battleTimeout(() => {
              setComboCounters((prev) => prev.filter((x) => x.id !== c.id));
            }, 1200);
          }
          return;
        }
        case "whiff": {
          const target = ev.targetId ? unit(ev.targetId) : undefined;
          if (!target) return;
          spawnFloatingText("MISS", unitPosPx(target), "#FFFFFF");
          return;
        }
        case "projectileSpawn": {
          const actor = unit(ev.actorId);
          const target = unit(ev.targetId);
          if (!actor || !target) return;
          const skill = skillById(actor, ev.skillId);
          const prof = profileFor(skill, actor.c.classId);
          const fxElement =
            profileFxElement(prof, actor.c.element) ?? undefined;
          const from = unitPosPx(actor);
          const to = unitPosPx(target);
          const impact: FxInstance = {
            id: nextFxId(),
            visual: skill.visual,
            actorPos: from,
            targetPos: to,
            flipFx: prof.fx,
            fxSize: prof.fxSize,
            profile: prof.archetype,
            skillId: skill.id,
            fxElement,
          };
          setProjectiles((prev) => [
            ...prev,
            {
              id: `proj-${ev.id}`,
              fx: prof.projectile?.fx ?? prof.fx,
              from,
              to,
              durationMs: Math.max(60, ev.travelMs),
              arcHeight: prof.projectile?.arcHeight ?? 36,
              size: prof.projectile?.size ?? 64,
              profile: prof.archetype,
              skillId: skill.id,
              fxElement,
              impact,
            },
          ]);
          return;
        }
        case "projectileHit": {
          const target = unit(ev.targetId);
          if (!target) return;
          hurtUntilRef.current[ev.targetId] = battleClock.elapsedMs + 350;
          const pos = unitPosPx(target);
          if (ev.damage > 0) {
            spawnDamageNumber(
              ev.damage,
              pos,
              ev.comboMult >= 1.2 ? "crit" : "damage",
            );
          }
          return;
        }
        case "projectileFizzle":
          return;
        case "cast": {
          const actor = unit(ev.actorId);
          if (!actor) return;
          const skill = skillById(actor, ev.skillId);
          for (const tid of ev.targetIds) {
            const target = unit(tid);
            if (target) spawnImpact(actor, skill, target, true);
          }
          return;
        }
        case "heal": {
          const target = unit(ev.targetId);
          if (!target) return;
          spawnDamageNumber(ev.amount, unitPosPx(target), "heal");
          return;
        }
        case "regen": {
          const target = unit(ev.targetId);
          if (!target) return;
          spawnDamageNumber(ev.amount, unitPosPx(target), "heal");
          return;
        }
        case "statusApplied": {
          const target = unit(ev.targetId);
          if (!target) return;
          spawnFloatingText(
            STATUS_LABEL[ev.status],
            unitPosPx(target),
            STATUS_COLOR[ev.status],
          );
          return;
        }
        case "statusResisted": {
          const target = unit(ev.targetId);
          if (!target) return;
          spawnFloatingText("Resisted!", unitPosPx(target), "#FFD166");
          return;
        }
        case "cleansed": {
          const target = unit(ev.targetId);
          if (!target) return;
          spawnFloatingText("Cleansed!", unitPosPx(target), "#7CF5E1");
          return;
        }
        case "statusExpired":
          return;
        case "death": {
          const target = unit(ev.targetId);
          tombstoneAtRef.current[ev.targetId] =
            ev.at + TOMBSTONE_DELAY_MS;
          if (target) {
            const pos = unitPosPx(target);
            spawnBursts([
              {
                id: ++burstIdRef.current,
                preset: "explosion",
                x: pos.x,
                y: pos.y,
                count: 12,
              },
            ]);
          }
          return;
        }
        case "victory":
          return;
      }
    },
    [
      simById,
      profileFor,
      skillById,
      battleTimeout,
      spawnImpact,
      spawnDamageNumber,
      spawnFloatingText,
      spawnBursts,
      unitPosPx,
      nextFxId,
    ],
  );

  const drainEvents = useCallback(() => {
    while (drainedRef.current < sim.events.length) {
      const ev = sim.events[drainedRef.current];
      drainedRef.current += 1;
      handleSimEvent(ev);
    }
  }, [sim, handleSimEvent]);

  // ----- Clock driver: advance clock + sim together, every frame -----
  useEffect(() => {
    battleClock.reset();
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(100, now - last);
      last = now;
      battleClock.advance(dt);
      if (!endedRef.current) {
        // The sim consumes BATTLE time (post-scale), so pause (scale 0)
        // freezes it completely and x2/x3 run it faster — the same
        // delta every clocked animation system sees.
        stepSim(sim, battleClock.scaleDt(dt));
        drainEvents();
        if (sim.battle.winner !== null && !finishScheduledRef.current) {
          finishScheduledRef.current = true;
          finishBattleRef.current();
        }
      }
      const el = arenaRef.current;
      if (el) {
        el.dataset.battleClockMs = String(Math.floor(battleClock.elapsedMs));
      }
      setFrame((f) => f + 1);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      // Leave the shared clock running (x1, no timers) for any other
      // battle-clocked render still on screen.
      battleClock.reset();
    };
  }, [sim, drainEvents]);

  // Pause / speed → clock scale (0 freezes everything at once).
  useEffect(() => {
    battleClock.setScale(paused ? 0 : speed);
  }, [paused, speed]);

  // ----- Spectator controls: play / pause -----
  const togglePause = useCallback(() => {
    if (endedRef.current) return;
    const next = !pausedRef.current;
    pausedRef.current = next;
    setPaused(next);
  }, []);

  // ----- Spectator controls: skip to the final result -----
  const handleSkip = useCallback(() => {
    if (endedRef.current) return;
    // Run the SAME seeded sim headlessly to completion — identical
    // winner and rewards to watching — then show the final field
    // (every fallen crab already a tombstone) through the normal
    // finish path. Skip also ends the freeze: if the battle was
    // paused, the clock must run again or finishBattle's completion
    // timer could never fire.
    pausedRef.current = false;
    setPaused(false);
    battleClock.setScale(speed);
    runSimToCompletion(sim);
    drainedRef.current = sim.events.length; // no FX replay for skipped time
    for (const u of sim.units) {
      if (u.c.isDefeated) {
        // Long past → the tombstone renders fully risen.
        tombstoneAtRef.current[u.c.crabId] = -100000;
      }
    }
    finishScheduledRef.current = true;
    finishBattleRef.current();
  }, [sim, speed]);

  // ----- Flee -----
  const handleFlee = useCallback(() => {
    if (endedRef.current) return;
    endedRef.current = true;
    setEnded(true);
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

  // ----- Derived display values -----
  const recentLog = state.log.slice(-6).reverse();
  const logStartIndex = state.log.length - Math.min(6, state.log.length);
  const latestLog = state.log[state.log.length - 1];
  const elapsedSec = Math.floor(sim.timeMs / 1000);
  const timerText = `⏱ ${Math.floor(elapsedSec / 60)}:${String(elapsedSec % 60).padStart(2, "0")}`;

  /** Frozen solid right now? (sim status with time remaining). */
  const isFrozenUnit = (u: SimUnit): boolean =>
    u.c.statuses.some((s) => s.id === "freeze" && s.durationMs > 0);

  /** Pose for one unit, derived from live sim state each frame. */
  const poseFor = (u: SimUnit): CrabPose => {
    const c = u.c;
    if (ended && state.winner === "player" && c.side === "player" && !c.isDefeated) {
      return "victory";
    }
    if (c.isDefeated) return "defeated";
    if (isFrozenUnit(u)) return "idle"; // frozen solid — the tint carries it
    if (u.pending) {
      const prof = profileFor(u.pending.skill, c.classId);
      return POSE_FOR_ANIM[prof.attackerAnim] ?? "casting";
    }
    if (
      u.state === "hitstun" ||
      (hurtUntilRef.current[c.crabId] ?? 0) > battleClock.elapsedMs
    ) {
      return "hurt";
    }
    if (u.speedNow >= 14) return "run";
    if (u.speedNow > 0.5) return "walk";
    return "idle";
  };

  // Render one battlefield row layer for a side. The layer is only a
  // grouping container (kept for layout/QA structure): every crab is
  // positioned ABSOLUTELY at its LIVE sim position inside its spawn
  // row's layer, rendered BARE — slim floating HP bar + status icons
  // above the sprite, subtle ground ellipse beneath. No card chrome.
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
          const u = simById.get(c.crabId);
          if (!crab || !u) return <div key={c.crabId} />;
          const entry = layoutData.anchors.get(c.crabId);
          if (!entry) return <div key={c.crabId} />;
          const tombAt = tombstoneAtRef.current[c.crabId];
          const showTombstone =
            tombAt !== undefined && battleClock.elapsedMs >= tombAt;
          const markerColor =
            side === "player" ? "56,189,248" : "248,113,113";
          const statuses = c.statuses
            .filter((s) => s.durationMs > 0)
            .map((s) => ({ id: s.id, durationMs: s.durationMs }));
          const strideScale =
            u.speedNow > 0.5
              ? Math.min(1.8, Math.max(0.6, u.speedNow / 11))
              : 1;
          return (
            <div
              key={c.crabId}
              data-testid={showTombstone ? "tombstone" : "slot-anchor"}
              data-slot={entry.key}
              data-side={side}
              data-row={row}
              data-crab-id={c.crabId}
              data-unit-x={u.x.toFixed(1)}
              data-unit-y={u.y.toFixed(1)}
              className="absolute"
              style={{
                left: `${u.x}%`,
                top: `${u.y}%`,
                width: `${box.widthPct}%`,
                height: `${box.heightPct}%`,
                transform: "translate(-50%, -50%)",
                zIndex: 10 + Math.round(u.y),
              }}
            >
              {/* Ground marker — a subtle ellipse the crab stands on */}
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
                  background: `radial-gradient(ellipse, rgba(${markerColor},0.4) 0%, rgba(${markerColor},0.1) 58%, transparent 76%)`,
                  border: `1px solid rgba(${markerColor},0.3)`,
                  boxShadow: `0 0 8px rgba(${markerColor},0.2)`,
                  opacity: c.isDefeated ? 0.3 : 0.65,
                }}
              />
              <div className="absolute inset-0 pointer-events-auto flex flex-col items-center justify-start">
                {/* Floating status + HP (no name plate, no card) */}
                <div
                  className="flex flex-col items-center gap-0.5"
                  style={{ width: Math.max(56, spritePx * 0.82), maxWidth: "96%" }}
                >
                  {statuses.length > 0 && (
                    <StatusEffectRow statuses={statuses} />
                  )}
                  {!showTombstone && (
                    <div style={{ width: "100%" }}>
                      <HealthBar current={c.hp} max={c.maxHp} side={c.side} />
                    </div>
                  )}
                </div>
                <CrabBattleSprite
                  crab={crab}
                  pose={poseFor(u)}
                  size={spritePx}
                  facing={u.facing === 1 ? "right" : "left"}
                  showTombstone={showTombstone}
                  speedScale={strideScale}
                  frozen={isFrozenUnit(u)}
                  tombstoneSinceMs={tombAt}
                />
              </div>
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
        <div
          data-testid="battle-timer"
          className="flex items-center gap-2 text-xs font-bold"
          style={{ color: "#EAF6FF" }}
        >
          <span>{timerText}</span>
          <span
            className="text-[10px] font-bold uppercase tracking-wide"
            style={{ color: "rgba(234,246,255,0.55)" }}
          >
            {arenaId.replace(/_/g, " ")}
          </span>
        </div>
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

        {/* Battlefield — the player holds the LEFT half, the enemy the
            mirrored RIGHT half; units SPAWN on their deployment anchors
            and then move freely under the simulator. */}
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
        {/* Spectator status panel — the simulator pilots both teams;
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
          ) : (
            <div className="text-center">
              <div
                className="text-xs font-bold"
                style={{ color: "rgba(234,246,255,0.75)" }}
              >
                ⚔️ Auto Battle — real-time
                {latestLog ? ` · ${latestLog.message}` : ""}
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
                  key={`${logStartIndex + (recentLog.length - 1 - i)}-${a.skillId}`}
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
