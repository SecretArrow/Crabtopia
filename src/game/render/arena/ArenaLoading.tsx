// Crabtopia - Arena Loading Screen (Task C, screen 2 of 4)
// 3-second cinematic that runs between TeamBuilder and Battle.
// Up to 5 crabs per side slide in from opposite sides, "VS" pops, then a
// progress bar fills 0→100% over 3 seconds before calling onReady.

"use client";

import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import type { Crab } from "../../types";
import CrabSprite from "../CrabSprite";
import { ArenaBubbles } from "../animations/effects";

export interface ArenaLoadingProps {
  playerCrabs: Crab[];
  enemyCrabs: Crab[];
  onReady: () => void;
  arenaId: string;
}

const TOTAL_MS = 3000;

// Typewriter hook — reveals one character per tick.
function useTypewriter(text: string, charDelayMs = 60, startDelayMs = 200): string {
  const [out, setOut] = useState("");
  useEffect(() => {
    let i = 0;
    let mounted = true;
    const startTimer = setTimeout(() => {
      const interval = setInterval(() => {
        if (!mounted) return;
        i += 1;
        setOut(text.slice(0, i));
        if (i >= text.length) clearInterval(interval);
      }, charDelayMs);
    }, startDelayMs);
    return () => {
      mounted = false;
      clearTimeout(startTimer);
    };
  }, [text, charDelayMs, startDelayMs]);
  return out;
}

export default function ArenaLoading({
  playerCrabs,
  enemyCrabs,
  onReady,
  arenaId,
}: ArenaLoadingProps): React.ReactNode {
  const [progress, setProgress] = useState(0);
  const title = useTypewriter("ASSEMBLING TIDEGUARD", 55, 250);

  // Drive the 0→100% progress bar over TOTAL_MS; call onReady at the end.
  useEffect(() => {
    const start = performance.now();
    let raf = 0;
    let finishTimer: ReturnType<typeof setTimeout> | undefined;
    const tick = (now: number) => {
      const elapsed = now - start;
      const pct = Math.min(100, (elapsed / TOTAL_MS) * 100);
      setProgress(pct);
      if (pct < 100) {
        raf = requestAnimationFrame(tick);
      } else {
        // Tiny pause so the player sees "100%" before transition.
        finishTimer = setTimeout(onReady, 250);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      if (finishTimer) clearTimeout(finishTimer);
    };
  }, [onReady]);

  const pCrabs = playerCrabs.slice(0, 5);
  const eCrabs = enemyCrabs.slice(0, 5);

  return (
    <div
      className="min-h-screen relative flex flex-col items-center justify-center overflow-hidden px-3 py-6"
      style={{ background: "linear-gradient(180deg, #0A1B3D 0%, #06122B 100%)" }}
      role="status"
      aria-live="polite"
    >
      {/* Ambient bubbles */}
      <ArenaBubbles count={18} />

      {/* Title */}
      <motion.h1
        className="text-base md:text-2xl font-black font-display tracking-[0.2em] mb-6 md:mb-10 relative z-10"
        style={{
          color: "#7CF5E1",
          textShadow: "0 0 16px rgba(124,245,225,0.7), 0 0 32px rgba(124,245,225,0.35)",
          fontFamily: "Fredoka, system-ui, sans-serif",
        }}
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        {title}
        <motion.span
          aria-hidden
          animate={{ opacity: [1, 0, 1] }}
          transition={{ duration: 0.6, repeat: Infinity, ease: "easeInOut" }}
        >
          ▍
        </motion.span>
      </motion.h1>

      {/* VS layout: 5 crabs per side.
          - Desktop (md+): crabs arranged in a vertical stack on each side,
            with VS centered between. Sprite size 64 so 5 stack comfortably.
          - Mobile (<md): crabs arranged in a 2-column mini-grid per side
            (3+2) so all 5 fit at 360px width. Sprite size 48.
      */}
      <div className="flex items-center justify-center gap-1.5 sm:gap-2 md:gap-6 w-full max-w-3xl relative z-10">
        {/* Player side (slides from left) */}
        <div className="flex-1 flex justify-end">
          <div className="grid grid-cols-2 gap-1 md:gap-1.5 max-w-[160px] md:max-w-none">
            {pCrabs.map((c, i) => (
              <motion.div
                key={c.id}
                className="flex items-center gap-1 md:gap-2"
                initial={{ x: -360, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{
                  delay: 0.2 + i * 0.12,
                  type: "spring",
                  bounce: 0.45,
                  duration: 0.7,
                }}
              >
                <div
                  className="text-[8px] md:text-[11px] font-bold text-right truncate max-w-[60px] md:max-w-[90px] order-1"
                  style={{ color: "#7CF5E1" }}
                  title={c.name}
                >
                  {c.name}
                  <div className="text-[7px] md:text-[8px]" style={{ color: "rgba(234,246,255,0.55)" }}>
                    Lv {c.level}
                  </div>
                </div>
                <div
                  className="rounded-xl p-1 order-2"
                  style={{
                    background: "rgba(124,245,225,0.08)",
                    border: "1px solid rgba(124,245,225,0.3)",
                    boxShadow: "0 0 12px rgba(124,245,225,0.2)",
                  }}
                >
                  {/* Sprite sized for mobile (48); scaled up on md+ for visual breathing room */}
                  <div className="md:scale-125 md:origin-center">
                    <CrabSprite crab={c} size={48} />
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        {/* VS */}
        <motion.div
          className="flex-shrink-0"
          initial={{ scale: 0, rotate: -90, opacity: 0 }}
          animate={{ scale: 1, rotate: 0, opacity: 1 }}
          transition={{ delay: 0.9, type: "spring", bounce: 0.6, duration: 0.7 }}
        >
          <div
            className="text-2xl md:text-6xl font-black font-display px-0.5 md:px-2"
            style={{
              background: "linear-gradient(135deg, #FFD166 0%, #FF7A1A 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
              filter: "drop-shadow(0 0 12px rgba(255,209,102,0.6))",
              fontFamily: "Fredoka, system-ui, sans-serif",
            }}
          >
            VS
          </div>
        </motion.div>

        {/* Enemy side (slides from right, horizontally flipped to face left) */}
        <div className="flex-1 flex justify-start">
          <div className="grid grid-cols-2 gap-1 md:gap-1.5 max-w-[160px] md:max-w-none">
            {eCrabs.map((c, i) => (
              <motion.div
                key={c.id}
                className="flex items-center gap-1 md:gap-2"
                initial={{ x: 360, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{
                  delay: 0.35 + i * 0.12,
                  type: "spring",
                  bounce: 0.45,
                  duration: 0.7,
                }}
              >
                <div
                  style={{
                    transform: "scaleX(-1)",
                    background: "rgba(255,77,109,0.08)",
                    border: "1px solid rgba(255,111,145,0.3)",
                    boxShadow: "0 0 12px rgba(255,111,145,0.2)",
                    borderRadius: 12,
                    padding: 4,
                  }}
                >
                  <CrabSprite crab={c} size={48} />
                </div>
                <div
                  className="text-[8px] md:text-[11px] font-bold text-left truncate max-w-[60px] md:max-w-[90px]"
                  style={{ color: "#FF6F91" }}
                  title={c.name}
                >
                  {c.name}
                  <div className="text-[7px] md:text-[8px]" style={{ color: "rgba(234,246,255,0.55)" }}>
                    Lv {c.level}
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>

      {/* Arena ID */}
      <motion.div
        className="mt-6 md:mt-10 text-[10px] md:text-xs font-mono relative z-10"
        style={{ color: "rgba(234,246,255,0.55)" }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.2 }}
      >
        Arena ID: <span style={{ color: "#FFD166" }}>{arenaId}</span>
      </motion.div>

      {/* Progress bar */}
      <div className="mt-3 w-64 md:w-80 relative z-10">
        <div
          className="w-full rounded-full overflow-hidden"
          style={{
            height: 8,
            background: "rgba(10,27,61,0.8)",
            border: "1px solid rgba(124,245,225,0.25)",
          }}
        >
          <motion.div
            className="h-full rounded-full"
            style={{
              width: `${progress}%`,
              background: "linear-gradient(90deg, #0A4A66 0%, #12A7A0 50%, #7CF5E1 100%)",
              boxShadow: "0 0 8px rgba(124,245,225,0.55)",
            }}
            transition={{ duration: 0.05, ease: "linear" }}
          />
        </div>
        <div className="flex items-center justify-between mt-1">
          <span className="text-[9px] font-bold" style={{ color: "rgba(234,246,255,0.5)" }}>
            Preparing arena…
          </span>
          <span
            className="text-[10px] font-black font-display"
            style={{ color: "#7CF5E1" }}
          >
            {Math.round(progress)}%
          </span>
        </div>
      </div>
    </div>
  );
}
