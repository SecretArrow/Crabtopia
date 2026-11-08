// Crabtopia — HatchScene ("Watch it hatch").
// The play-out for a hatched egg. The child crab is ALREADY created
// by hatchEggNow before this scene opens (hatchEgg is deterministic
// from the egg id — the scene visualizes the child, it never re-rolls
// or grants anything). The egg wiggles, cracks in stages, then bursts
// open and the child emerges with its real sprite + element aura.
//
// Skipping jumps straight to the reveal card; closing mid-scene is
// impossible (the crab already exists — there is nothing to lose or
// duplicate), so the only exit is the reveal's action button. With
// reduced motion the scene opens directly on the reveal.
"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import type { Crab, Egg } from "../types";
import { ELEMENTS, elementOf } from "../engine/elements";
import { FACTIONS } from "../content/factions";
import { CLASSES } from "../content/classes";
import CrabRenderer from "./CrabRenderer";
import ElementBadge from "./ElementBadge";
import { GlowButton } from "./ui";
import { useMotionAllowed } from "./AmbientLife";

type Stage = "wiggle" | "crack1" | "crack2" | "burst" | "reveal";

// ms per stage (bounded: ~3.5s total to the reveal).
const STAGE_MS: Record<Exclude<Stage, "reveal">, number> = {
  wiggle: 1400,
  crack1: 1000,
  crack2: 1000,
  burst: 700,
};

const NEXT_STAGE: Record<Exclude<Stage, "reveal">, Stage> = {
  wiggle: "crack1",
  crack1: "crack2",
  crack2: "burst",
  burst: "reveal",
};

export default function HatchScene({
  egg,
  crab,
  parents,
  onDone,
}: {
  egg: Egg;
  crab: Crab;
  parents: Crab[];
  onDone: () => void;
}): React.ReactNode {
  const motionAllowed = useMotionAllowed();
  const [stage, setStage] = useState<Stage>(
    motionAllowed ? "wiggle" : "reveal"
  );
  const timersRef = useRef<number[]>([]);

  useEffect(() => {
    if (stage === "reveal") return;
    const t = window.setTimeout(() => setStage(NEXT_STAGE[stage]), STAGE_MS[stage]);
    timersRef.current.push(t);
    return () => window.clearTimeout(t);
  }, [stage]);

  useEffect(
    () => () => {
      timersRef.current.forEach((t) => window.clearTimeout(t));
    },
    []
  );

  const skip = () => {
    timersRef.current.forEach((t) => window.clearTimeout(t));
    setStage("reveal");
  };

  const element = elementOf(crab);
  const elementColor = ELEMENTS[element].color;
  const faction = FACTIONS[crab.faction];
  const classDef = CLASSES[crab.classId];
  const cracking = stage === "crack1" || stage === "crack2" || stage === "burst";
  const parentNames = parents.map((p) => p.name).filter(Boolean);

  return (
    <div
      data-testid="hatch-scene"
      className="fixed inset-0 z-[70] flex items-center justify-center p-4"
      style={{ background: "rgba(6,18,43,0.88)", backdropFilter: "blur(4px)" }}
      role="dialog"
      aria-label="Egg hatching"
    >
      <div className="w-full max-w-sm text-center">
        <div className="text-lg font-bold" style={{ fontFamily: "Fredoka, system-ui, sans-serif" }}>
          {stage === "reveal" ? "It hatched!" : "Something stirs inside…"}
        </div>
        <div className="mt-0.5 text-xs text-white/60">
          {stage === "reveal"
            ? `${egg.name} · Child of ${parentNames.join(" & ") || "the tide"}`
            : egg.name}
        </div>

        {/* ---- Egg stages ---- */}
        {stage !== "reveal" && (
          <div className="relative mx-auto mt-6 h-44 w-44">
            {/* element glow */}
            <div
              className="absolute inset-0 rounded-full"
              style={{
                background: `radial-gradient(circle, ${elementColor}44 0%, transparent 65%)`,
                animation: "glowPulse 1.6s ease-in-out infinite",
              }}
              aria-hidden
            />
            <motion.img
              src="/art/crabs/egg-glowing.png"
              alt="Hatching egg"
              width={150}
              height={150}
              draggable={false}
              className="absolute left-1/2 top-1/2 object-contain"
              style={{
                x: "-50%",
                y: "-50%",
                filter: `drop-shadow(0 0 18px ${elementColor}99)`,
              }}
              animate={
                stage === "wiggle"
                  ? { rotate: [0, -9, 9, -6, 6, 0] }
                  : { rotate: cracking ? [0, -3, 3, 0] : 0, scale: stage === "burst" ? [1, 1.18, 0] : 1 }
              }
              transition={
                stage === "wiggle"
                  ? { duration: 1.3, repeat: Infinity, ease: "easeInOut" }
                  : { duration: 0.6, ease: "easeOut" }
              }
            />
            {/* Crack lines, appearing in stages */}
            {cracking && (
              <svg
                className="absolute left-1/2 top-1/2"
                style={{ x: "-50%", y: "-50%" }}
                width={150}
                height={150}
                viewBox="0 0 150 150"
                aria-hidden
              >
                <path
                  d="M75 18 L68 55 L80 82 L70 118"
                  stroke="#1A0E06"
                  strokeWidth={3}
                  fill="none"
                  strokeLinecap="round"
                  opacity={stage === "crack1" ? 0.85 : 1}
                />
                {stage !== "crack1" && (
                  <path
                    d="M40 60 L62 74 L58 96 M110 52 L92 70 L104 92"
                    stroke="#1A0E06"
                    strokeWidth={2.5}
                    fill="none"
                    strokeLinecap="round"
                  />
                )}
              </svg>
            )}
            {/* Burst particles (capped at 12) */}
            {stage === "burst" &&
              Array.from({ length: 12 }, (_, i) => {
                const angle = (i / 12) * Math.PI * 2 + 0.4;
                const dist = 56 + (i % 3) * 16;
                return (
                  <motion.span
                    key={i}
                    className="absolute left-1/2 top-1/2 rounded-full"
                    style={{
                      width: i % 3 === 0 ? 7 : 5,
                      height: i % 3 === 0 ? 7 : 5,
                      background: i % 2 ? elementColor : "#FFD166",
                      boxShadow: `0 0 8px ${elementColor}`,
                    }}
                    initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
                    animate={{
                      x: Math.cos(angle) * dist,
                      y: Math.sin(angle) * dist - 12,
                      opacity: 0,
                      scale: 0.4,
                    }}
                    transition={{ duration: 0.65, ease: "easeOut" }}
                  />
                );
              })}
          </div>
        )}

        {/* ---- Reveal ---- */}
        {stage === "reveal" && (
          <motion.div
            initial={{ scale: 0.7, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 260, damping: 18 }}
            className="mx-auto mt-4"
          >
            <CrabRenderer crab={crab} size="large" pose="idle" />
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
            {parentNames.length > 0 && (
              <div className="mt-2 text-[11px] text-white/55">
                Child of {parentNames.join(" & ")}
              </div>
            )}
          </motion.div>
        )}

        {/* ---- Actions ---- */}
        <div className="mt-6 flex items-center justify-center gap-3">
          {stage !== "reveal" ? (
            <GlowButton variant="gold" size="md" onClick={skip}>
              Skip ▸
            </GlowButton>
          ) : (
            <GlowButton variant="gold" size="md" onClick={onDone}>
              Meet {crab.name} →
            </GlowButton>
          )}
        </div>
      </div>
    </div>
  );
}
