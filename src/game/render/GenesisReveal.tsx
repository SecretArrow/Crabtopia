// Crabtopia — GenesisReveal.
// The play-out for a Genesis purchase. The crab is ALREADY created
// by buyGenesisCrab (escrow/fee logic untouched) — this scene only
// presents it: a burst of light, a card flip, then the new crab with
// its real sprite + element aura + name and number.
//
// Skipping jumps straight to the reveal card; the crab already
// exists, so closing early can never lose or duplicate it. With
// reduced motion the scene opens directly on the reveal.
"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import type { Crab } from "../types";
import { elementOf } from "../engine/elements";
import { FACTIONS } from "../content/factions";
import { CLASSES } from "../content/classes";
import CrabRenderer from "./CrabRenderer";
import ElementBadge from "./ElementBadge";
import { GlowButton, GoldIcon, formatGold } from "./ui";
import { useMotionAllowed } from "./AmbientLife";

export default function GenesisReveal({
  crab,
  genesisNumber,
  price,
  fee,
  onDone,
}: {
  crab: Crab;
  genesisNumber: number;
  price: number;
  fee: number;
  onDone: () => void;
}): React.ReactNode {
  const motionAllowed = useMotionAllowed();
  const [revealed, setRevealed] = useState(!motionAllowed);
  const timersRef = useRef<number[]>([]);

  useEffect(() => {
    if (revealed) return;
    const t = window.setTimeout(() => setRevealed(true), 750);
    timersRef.current.push(t);
    return () => window.clearTimeout(t);
  }, [revealed]);

  useEffect(
    () => () => {
      timersRef.current.forEach((t) => window.clearTimeout(t));
    },
    []
  );

  const skip = () => {
    timersRef.current.forEach((t) => window.clearTimeout(t));
    setRevealed(true);
  };

  const element = elementOf(crab);
  const faction = FACTIONS[crab.faction];
  const classDef = CLASSES[crab.classId];

  return (
    <div
      data-testid="genesis-reveal"
      className="fixed inset-0 z-[70] flex items-center justify-center p-4"
      style={{ background: "rgba(6,18,43,0.88)", backdropFilter: "blur(4px)" }}
      role="dialog"
      aria-label="Genesis crab reveal"
    >
      <div className="w-full max-w-sm text-center">
        {!revealed ? (
          <>
            <div className="text-lg font-bold" style={{ fontFamily: "Fredoka, system-ui, sans-serif" }}>
              Genesis #{genesisNumber} is yours!
            </div>
            {/* Burst of light */}
            <div className="relative mx-auto mt-6 h-44 w-44">
              <motion.div
                className="absolute inset-0 rounded-full"
                style={{
                  background:
                    "radial-gradient(circle, rgba(255,209,102,0.85) 0%, rgba(255,122,26,0.35) 45%, transparent 70%)",
                  boxShadow: "0 0 60px rgba(255,209,102,0.7)",
                }}
                initial={{ scale: 0.3, opacity: 0.6 }}
                animate={{ scale: 1.5, opacity: 1 }}
                transition={{ duration: 0.7, ease: "easeOut" }}
              />
              {Array.from({ length: 12 }, (_, i) => {
                const angle = (i / 12) * Math.PI * 2 + 0.3;
                const dist = 60 + (i % 3) * 18;
                return (
                  <motion.span
                    key={i}
                    className="absolute left-1/2 top-1/2 rounded-full"
                    style={{
                      width: i % 3 === 0 ? 7 : 5,
                      height: i % 3 === 0 ? 7 : 5,
                      background: i % 2 ? "#FFD166" : "#7CF5E1",
                      boxShadow: "0 0 8px rgba(255,209,102,0.9)",
                    }}
                    initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
                    animate={{
                      x: Math.cos(angle) * dist,
                      y: Math.sin(angle) * dist - 14,
                      opacity: 0,
                      scale: 0.4,
                    }}
                    transition={{ duration: 0.7, ease: "easeOut" }}
                  />
                );
              })}
              <div className="absolute inset-0 flex items-center justify-center text-5xl">
                ✨
              </div>
            </div>
            <div className="mt-6">
              <GlowButton variant="gold" size="md" onClick={skip}>
                Skip ▸
              </GlowButton>
            </div>
          </>
        ) : (
          <motion.div
            initial={{ rotateY: 75, scale: 0.85, opacity: 0 }}
            animate={{ rotateY: 0, scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 220, damping: 18 }}
          >
            <div className="text-lg font-bold" style={{ fontFamily: "Fredoka, system-ui, sans-serif" }}>
              Genesis #{genesisNumber} joins your roster!
            </div>
            <div className="mx-auto mt-4 w-fit">
              <CrabRenderer crab={crab} size="large" pose="idle" />
            </div>
            <div className="mt-2 text-xl font-bold" style={{ fontFamily: "Fredoka, system-ui, sans-serif" }}>
              {crab.name}
            </div>
            <div className="mt-1 flex flex-wrap items-center justify-center gap-1.5">
              <ElementBadge element={element} />
              <span
                className="text-[11px] font-bold px-2 py-0.5 rounded-full"
                style={{ background: `${faction.colors.primary}33`, color: faction.colors.light }}
              >
                {classDef.icon} {classDef.name}
              </span>
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-white/10">
                {faction.name} · Lv {crab.level}
              </span>
            </div>
            <div className="mt-2 text-[11px] text-white/55 flex items-center justify-center gap-1">
              <GoldIcon size={11} /> {formatGold(price)} paid
              <span className="opacity-60">· fee {formatGold(fee)} sunk</span>
            </div>
            <div className="mt-6">
              <GlowButton variant="gold" size="md" onClick={onDone}>
                Meet {crab.name} →
              </GlowButton>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}
