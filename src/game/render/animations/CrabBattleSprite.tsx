// Crabtopia - Battle Sprite (Sprite & Animation Overhaul)
// CrabBattleSprite now renders through the real animation system:
// frame-by-frame sprite sheets (AnimatedCrab) for crabs that have one, the
// articulated puppet rig (PuppetCrab) for the rest — both driven by the
// AnimationStateMachine fed from ArenaBattle's real battle events (the
// `pose` prop). The old CSS/framer pose transforms on a static image are
// gone; framer-motion is only used for the tombstone swap. A Tombstone
// still replaces the crab after its Death animation when ArenaBattle sets
// showTombstone. Presentational only — no game state reads.

"use client";

import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import LivingCrab from "../../animation/LivingCrab";
import FlipbookFx from "../../animation/FlipbookFx";
import { fxTreatmentFor } from "../../animation/elementFx";
import { elementOf } from "../../engine/elements";
import ElementAura from "../ElementAura";
import type { AnimState } from "../../animation/stateMachine";
import type { Crab } from "../../types";

export type CrabPose =
  | "idle"
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
}

/** Battle pose (game event vocabulary) → animation state machine state. */
const POSE_TO_STATE: Record<CrabPose, AnimState> = {
  idle: "idle",
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

  return (
    <div
      className="relative inline-flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      <AnimatePresence mode="wait">
        {showTombstone ? (
          <motion.div
            key="tomb"
            className="flex items-center justify-center"
            style={{ width: size, height: size }}
          >
            <Tombstone size={Math.max(60, size * 0.7)} />
          </motion.div>
        ) : (
          <motion.div
            key="crab"
            className="relative flex items-center justify-center"
            style={{ width: size, height: size, zIndex: 1 }}
            initial={false}
            animate={{ opacity: 1 }}
            exit={{
              opacity: 0,
              y: 30,
              scale: 0.7,
              transition: { duration: 0.4, ease: "easeIn" },
            }}
          >
            {/* Persistent element aura — STATIC (BattleClock-safe),
                behind the sprite; the animated AuraGlow below is the
                separate temporary casting/buff effect. */}
            <ElementAura crab={crab} variant="battle" />
            {glowColor && <AuraGlow color={glowColor} size={size} />}
            <div className="relative" style={{ zIndex: 2 }}>
              <LivingCrab
                key={epoch}
                crab={crab}
                state={animState}
                size={size}
                facing={facing}
                clocked
                onAnimEvent={handleAnimEvent}
              />
            </div>
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
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tombstone — small SVG cross on a sand mound. Bounces in, then idle sways.
// ---------------------------------------------------------------------------
export function Tombstone({ size = 80 }: { size?: number }): React.ReactNode {
  return (
    <motion.div
      className="inline-block"
      style={{ width: size, height: size }}
      initial={{ scale: 0, opacity: 0 }}
      animate={{
        scale: 1,
        opacity: 1,
        rotate: [0, 1, -1, 0],
      }}
      transition={{
        scale: { type: "spring", bounce: 0.4, duration: 0.5 },
        opacity: { duration: 0.5 },
        rotate: {
          duration: 4,
          repeat: Infinity,
          ease: "easeInOut",
          delay: 0.5,
        },
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
        <ellipse cx="40" cy="70" rx="30" ry="7" fill="#3a2f1f" />
        <ellipse cx="40" cy="67" rx="22" ry="5" fill="#4d3f29" />
        <ellipse cx="40" cy="66" rx="14" ry="3" fill="#5d4d33" />
        {/* Cross stem */}
        <rect x="34" y="18" width="12" height="46" rx="2" fill="#6b6b6b" />
        {/* Cross arm */}
        <rect x="20" y="32" width="40" height="12" rx="2" fill="#6b6b6b" />
        {/* Stone highlight */}
        <rect x="36" y="20" width="3" height="42" fill="#9a9a9a" opacity="0.55" />
        <rect x="22" y="34" width="36" height="2" fill="#9a9a9a" opacity="0.45" />
        {/* Inscription lines */}
        <line
          x1="36"
          y1="38"
          x2="44"
          y2="38"
          stroke="#2a2a2a"
          strokeWidth="1.2"
        />
        <line
          x1="36"
          y1="42"
          x2="44"
          y2="42"
          stroke="#2a2a2a"
          strokeWidth="1.2"
        />
        <line
          x1="36"
          y1="46"
          x2="42"
          y2="46"
          stroke="#2a2a2a"
          strokeWidth="1.2"
        />
        {/* Tiny cracks */}
        <line
          x1="40"
          y1="50"
          x2="38"
          y2="58"
          stroke="#3a3a3a"
          strokeWidth="0.8"
        />
      </svg>
    </motion.div>
  );
}
