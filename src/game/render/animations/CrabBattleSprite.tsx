// Crabtopia - Battle Sprite (Sprite & Animation Overhaul)
// CrabBattleSprite renders through the real animation system:
// frame-by-frame sprite sheets (AnimatedCrab) driven by the
// AnimationStateMachine fed from the simulator's unit state (the `pose`
// prop — including walk/run locomotion in the real-time battler). A
// themed shell-stone Tombstone replaces the crab after its Death
// animation when ArenaBattle sets showTombstone; the tombstone's rise
// is driven by the shared BattleClock (battle-ms), so pausing the
// battle freezes the rise mid-animation like everything else.
// Presentational only — no game state reads.

"use client";

import React from "react";
import { motion } from "framer-motion";
import LivingCrab from "../../animation/LivingCrab";
import FlipbookFx from "../../animation/FlipbookFx";
import { battleClock } from "../../animation/battleClock";
import { fxTreatmentFor } from "../../animation/elementFx";
import { elementOf } from "../../engine/elements";
import ElementAura from "../ElementAura";
import type { AnimState } from "../../animation/stateMachine";
import type { Crab } from "../../types";

export type CrabPose =
  | "idle"
  | "walk"
  | "run"
  | "attack_lunge"
  | "combo"
  | "hurt"
  | "victory"
  | "defeated"
  | "casting";

export interface CrabBattleSpriteProps {
  crab: Crab;
  pose: CrabPose;
  size?: number; // default 120
  facing?: "right" | "left"; // default right (enemy crabs face left)
  glowColor?: string; // optional aura color
  showTombstone?: boolean; // when crab is defeated, show tombstone instead
  /** Playback-rate multiplier for the sheet clip (stride sync). */
  speedScale?: number;
  /** Frozen solid: ice tint over the sprite (sim status, unmistakable). */
  frozen?: boolean;
  /** Battle-ms moment the tombstone appeared — drives its clocked rise. */
  tombstoneSinceMs?: number;
}

/** Battle pose (game event vocabulary) → animation state machine state. */
const POSE_TO_STATE: Record<CrabPose, AnimState> = {
  idle: "idle",
  walk: "walk",
  run: "run",
  attack_lunge: "attack",
  combo: "combo",
  hurt: "hit",
  casting: "skill",
  victory: "victory",
  defeated: "death",
};

// Aura glow — soft radial pulse behind the crab. Used for casting / buffs.
function AuraGlow({ color, size }: { color: string; size: number }) {
  return (
    <motion.div
      aria-hidden
      className="absolute rounded-full pointer-events-none"
      style={{
        width: size * 1.4,
        height: size * 1.4,
        left: "50%",
        top: "50%",
        translateX: "-50%",
        translateY: "-50%",
        background: `radial-gradient(circle at center, ${color}aa 0%, ${color}44 35%, ${color}00 65%)`,
        zIndex: 0,
      }}
      animate={{ opacity: [0.5, 0.95, 0.5], scale: [0.95, 1.08, 0.95] }}
      transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
    />
  );
}

export default function CrabBattleSprite({
  crab,
  pose,
  size = 120,
  facing = "right",
  glowColor,
  showTombstone = false,
  speedScale = 1,
  frozen = false,
  tombstoneSinceMs,
}: CrabBattleSpriteProps): React.ReactNode {
  const animState = POSE_TO_STATE[pose];
  // Remount the animated sprite when a crab returns from defeat (new
  // battle): the state machine treats death as terminal by design.
  const [epoch, setEpoch] = React.useState(0);
  const prevPoseRef = React.useRef<CrabPose>(pose);
  React.useEffect(() => {
    if (prevPoseRef.current === "defeated" && pose !== "defeated") {
      setEpoch((e) => e + 1);
    }
    prevPoseRef.current = pose;
  }, [pose]);

  // Synchronised claw spark: fired by the sheet's own "hitMoment" frame
  // event while attacking, rendered at the attacker's front.
  // ELEMENT-DRIVEN VFX: on attack poses (attack_lunge / combo) the spark
  // is the attacker's own claw energy, so it is colour-treated to the
  // crab's element. The "casting" pose also covers SUPPORT casts
  // (shield sigil), whose FX stay theme-kept — there the spark renders
  // untreated and carries no data-fx-element.
  const crabElement = elementOf(crab);
  const sparkTreatment =
    pose === "attack_lunge" || pose === "combo"
      ? fxTreatmentFor("spark", crabElement)
      : undefined;
  const [spark, setSpark] = React.useState(0);
  const handleAnimEvent = React.useCallback(
    (name: string) => {
      if (name === "hitMoment") setSpark((s) => s + 1);
    },
    [],
  );

  if (showTombstone) {
    // The death clip already played (the renderer holds the swap for
    // ~600 battle-ms after the sim's death event); the tombstone swap
    // itself is instant and its rise is BattleClock-driven.
    return (
      <div
        className="relative inline-flex items-center justify-center"
        style={{ width: size, height: size }}
      >
        <Tombstone
          size={Math.max(60, size * 0.7)}
          sinceMs={tombstoneSinceMs}
        />
      </div>
    );
  }

  return (
    <div
      className="relative inline-flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      <div
        className="relative flex items-center justify-center"
        style={{ width: size, height: size, zIndex: 1 }}
      >
        {/* Persistent element aura — STATIC (BattleClock-safe),
            behind the sprite; the animated AuraGlow below is the
            separate temporary casting/buff effect. */}
        <ElementAura crab={crab} variant="battle" />
        {glowColor && <AuraGlow color={glowColor} size={size} />}
        <div
          className="relative"
          style={{
            zIndex: 2,
            // Frozen solid: an unmistakable ice cast over the sprite —
            // desaturated, brightened, blue-shifted while the sim's
            // freeze status lasts.
            filter: frozen
              ? "brightness(1.18) saturate(0.55) hue-rotate(-14deg)"
              : undefined,
          }}
        >
          <LivingCrab
            key={epoch}
            crab={crab}
            state={animState}
            size={size}
            facing={facing}
            speed={speedScale}
            clocked
            onAnimEvent={handleAnimEvent}
          />
        </div>
        {frozen && (
          <div
            aria-hidden
            className="absolute pointer-events-none"
            style={{
              width: size * 0.92,
              height: size * 0.92,
              borderRadius: "38% 38% 44% 44%",
              background:
                "radial-gradient(circle at 50% 38%, rgba(165,225,255,0.34) 0%, rgba(120,200,255,0.16) 55%, rgba(120,200,255,0) 78%)",
              boxShadow: "inset 0 0 18px rgba(165,225,255,0.45)",
              zIndex: 3,
            }}
          />
        )}
        {spark > 0 && (
          <FlipbookFx
            key={spark}
            fx="spark"
            x={size / 2 + (facing === "left" ? -size * 0.32 : size * 0.32)}
            y={size / 2}
            size={Math.round(size * 0.85)}
            filter={sparkTreatment?.filter}
            fxElement={sparkTreatment ? crabElement : undefined}
            onDone={() => setSpark(0)}
          />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tombstone — a carved SHELL-STONE marker in the ocean kingdom's language:
// a domed crab-shell silhouette with a claw glyph, a pearl inlay and
// seaweed at its base, planted in a sand mound. It RISES and settles on
// the shared BattleClock: `sinceMs` is the battle-ms moment it appeared,
// and the entrance transform is a pure function of accumulated battle
// time — pause the battle and the rise freezes mid-way, exactly like
// every other battle animation. (The death-event sand/bubble puff is a
// ParticleLayer burst fired by ArenaBattle, not part of this marker.)
// ---------------------------------------------------------------------------
export function Tombstone({
  size = 80,
  sinceMs,
}: {
  size?: number;
  /** Battle-ms timestamp the tombstone appeared (rise starts then). */
  sinceMs?: number;
}): React.ReactNode {
  const age =
    sinceMs === undefined
      ? Number.POSITIVE_INFINITY
      : Math.max(0, battleClock.elapsedMs - sinceMs);
  const p = Math.min(1, age / 500);
  // Ease-out rise with a small settle overshoot in the last stretch.
  const eased = 1 - Math.pow(1 - p, 3);
  const settle = p >= 1 ? 0 : Math.sin(p * Math.PI) * 0.05;
  const transform = `translateY(${((1 - eased) * 20).toFixed(2)}px) scale(${(
    0.55 +
    0.45 * eased +
    settle
  ).toFixed(3)})`;
  const opacity = Math.min(1, age / 180);
  return (
    <div
      className="inline-block"
      style={{
        width: size,
        height: size,
        transform,
        opacity,
        transformOrigin: "50% 88%",
      }}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 80 80"
        aria-label="Defeated"
        role="img"
      >
        {/* Sand mound */}
        <ellipse cx="40" cy="71" rx="31" ry="7" fill="#3a2f1f" />
        <ellipse cx="40" cy="68" rx="23" ry="5" fill="#4d3f29" />
        <ellipse cx="40" cy="67" rx="15" ry="3" fill="#5d4d33" />
        {/* Seaweed at the base */}
        <path
          d="M12 70 Q9 62 12 56 Q15 62 13 70 Z"
          fill="#2e7d5b"
        />
        <path
          d="M18 71 Q16 65 19 60 Q21 66 19 71 Z"
          fill="#35976e"
        />
        <path
          d="M66 70 Q69 62 66 56 Q63 62 65 70 Z"
          fill="#2e7d5b"
        />
        {/* Shell-stone: domed crab-shell silhouette */}
        <path
          d="M40 8
             C 56 8 66 20 66 36
             C 66 50 60 60 54 66
             L 26 66
             C 20 60 14 50 14 36
             C 14 20 24 8 40 8 Z"
          fill="#7d7468"
          stroke="#575046"
          strokeWidth="2"
        />
        {/* Shell ridge carving */}
        <path
          d="M40 12 C 40 24 40 44 40 62"
          stroke="#575046"
          strokeWidth="1.4"
          opacity="0.6"
          fill="none"
        />
        <path
          d="M27 18 C 30 28 31 44 30 60 M53 18 C 50 28 49 44 50 60"
          stroke="#575046"
          strokeWidth="1.2"
          opacity="0.45"
          fill="none"
        />
        {/* Stone highlight */}
        <path
          d="M24 22 C 27 15 33 11 38 10"
          stroke="#a89d8c"
          strokeWidth="2.4"
          opacity="0.7"
          fill="none"
          strokeLinecap="round"
        />
        {/* Pearl inlay */}
        <circle cx="40" cy="20" r="4.4" fill="#f3e9d2" />
        <circle cx="38.6" cy="18.6" r="1.5" fill="#ffffff" />
        {/* Claw glyph carved into the stone */}
        <path
          d="M40 30
             C 33 30 29 36 29 42
             C 29 49 34 53 40 53
             C 44 53 47 51 48.6 48.4
             L 44.6 44.8
             C 44 46 42.4 47 40.6 46.6
             C 37.6 46 36.4 43.4 37.2 40.6
             C 37.9 38.2 39.8 36.8 42 37.2
             L 47.8 39.4
             C 46.8 33.8 44 30 40 30 Z"
          fill="#575046"
        />
        {/* Tiny cracks */}
        <path
          d="M55 52 L52 58 L54 62"
          stroke="#463f35"
          strokeWidth="0.9"
          fill="none"
        />
        <path
          d="M24 46 L27 51"
          stroke="#463f35"
          strokeWidth="0.9"
          fill="none"
        />
      </svg>
    </div>
  );
}
