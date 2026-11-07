// Crabtopia - Arena Splash Screen
// Animated logo, rising bubble particles, drifting coral silhouettes.
// Auto-advances after 4 seconds OR on user click of the "Press to Dive" button.

"use client";

import React, { useEffect } from "react";
import { motion } from "framer-motion";
import { PlanktonField, GlowButton } from "../ui";

export interface ArenaSplashProps {
  onDive: () => void;
}

const BUBBLE_COUNT = 18;

// Pixel distance bubbles travel upward. Picked large enough that bubbles exit
// the viewport on all common screen sizes (mobile ~600-900px, desktop up to
// ~1440px) — overshoot is invisible because the parent container is
// overflow-hidden.
const BUBBLE_TRAVEL_PX = 1300;

interface BubbleSpec {
  leftPct: number;
  size: number;
  duration: number;
  delay: number;
  drift: number;
}

// Deterministic bubble layout — same set on every render so the screen is stable.
const BUBBLES: BubbleSpec[] = Array.from({ length: BUBBLE_COUNT }).map((_, i) => {
  const left = (i * 53 + 7) % 100;
  const size = 5 + (i % 4) * 4;
  const duration = 6 + (i % 5);
  const delay = (i % 4) * 0.8;
  const drift = ((i % 3) - 1) * 28; // horizontal drift px
  return { leftPct: left, size, duration, delay, drift };
});

export default function ArenaSplash({ onDive }: ArenaSplashProps): React.ReactNode {
  // Auto-advance after 4 seconds.
  useEffect(() => {
    const t = window.setTimeout(() => onDive(), 4000);
    return () => window.clearTimeout(t);
  }, [onDive]);

  return (
    <div
      className="screen-enter relative w-full overflow-hidden flex flex-col items-center justify-center px-4 py-10"
      style={{
        minHeight: "100svh",
        background:
          "radial-gradient(circle at 50% 28%, #0A1B3D 0%, #06122B 65%, #04101F 100%)",
      }}
      role="main"
      aria-label="Crabtopia Arena splash"
    >
      <PlanktonField count={16} />

      {/* Rising bubble particles */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        {BUBBLES.map((b, i) => (
          <motion.span
            key={`bubble-${i}`}
            className="absolute rounded-full"
            style={{
              left: `${b.leftPct}%`,
              bottom: -b.size,
              width: b.size,
              height: b.size,
              background: "rgba(124,245,225,0.16)",
              border: "1px solid rgba(124,245,225,0.55)",
              boxShadow: "0 0 6px rgba(124,245,225,0.4)",
            }}
            initial={{ y: 0, x: 0, opacity: 0 }}
            animate={{
              y: -BUBBLE_TRAVEL_PX,
              x: b.drift,
              opacity: [0, 0.7, 0.7, 0],
            }}
            transition={{
              duration: b.duration,
              delay: b.delay,
              repeat: Infinity,
              ease: "easeInOut",
              times: [0, 0.15, 0.85, 1],
            }}
          />
        ))}
      </div>

      {/* Drifting coral silhouettes along the seafloor */}
      <div
        className="pointer-events-none absolute bottom-0 left-0 right-0 overflow-hidden"
        style={{ height: 140 }}
        aria-hidden="true"
      >
        <svg
          width="100%"
          height="140"
          viewBox="0 0 1440 140"
          preserveAspectRatio="xMidYMax slice"
        >
          <defs>
            <linearGradient id="coralGrad" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="rgba(10,74,102,0.0)" />
              <stop offset="100%" stopColor="rgba(10,74,102,0.85)" />
            </linearGradient>
          </defs>
          <motion.g
            animate={{ x: [0, 18, 0] }}
            transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}
          >
            {/* Coral mound 1 */}
            <path
              d="M0 140 L0 90 Q40 60 70 78 Q90 50 120 70 Q150 40 180 78 Q210 60 240 90 L240 140 Z"
              fill="url(#coralGrad)"
            />
          </motion.g>
          <motion.g
            animate={{ x: [0, -22, 0] }}
            transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
          >
            {/* Coral mound 2 */}
            <path
              d="M260 140 L260 96 Q300 70 340 88 Q380 56 420 82 Q470 50 510 84 Q560 70 600 96 L600 140 Z"
              fill="url(#coralGrad)"
            />
          </motion.g>
          <motion.g
            animate={{ x: [0, 24, 0] }}
            transition={{ duration: 16, repeat: Infinity, ease: "easeInOut" }}
          >
            {/* Coral mound 3 */}
            <path
              d="M620 140 L620 92 Q680 64 730 80 Q790 48 840 78 Q900 60 960 92 L960 140 Z"
              fill="url(#coralGrad)"
            />
          </motion.g>
          <motion.g
            animate={{ x: [0, -18, 0] }}
            transition={{ duration: 20, repeat: Infinity, ease: "easeInOut" }}
          >
            {/* Coral mound 4 */}
            <path
              d="M980 140 L980 98 Q1040 70 1100 86 Q1160 56 1220 84 Q1280 60 1340 92 Q1390 80 1440 98 L1440 140 Z"
              fill="url(#coralGrad)"
            />
          </motion.g>
          {/* Seafloor highlight strip */}
          <rect x="0" y="132" width="1440" height="8" fill="rgba(124,245,225,0.12)" />
        </svg>
      </div>

      {/* Wordmark */}
      <motion.h1
        initial={{ opacity: 0, y: 28, scale: 0.92 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 1.1, ease: "easeOut" }}
        className="relative font-display text-5xl sm:text-7xl font-extrabold tracking-[0.04em] text-center select-none"
        aria-label="Crabtopia"
      >
        <motion.span
          className="block"
          animate={{
            filter: [
              "drop-shadow(0 0 10px rgba(255,209,102,0.45))",
              "drop-shadow(0 0 26px rgba(255,209,102,0.85))",
              "drop-shadow(0 0 10px rgba(255,209,102,0.45))",
            ],
          }}
          transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
          style={{
            background: "linear-gradient(180deg, #FFE9A8 0%, #FFD166 45%, #FF7A1A 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
          }}
        >
          CRABTOPIA
        </motion.span>
      </motion.h1>

      {/* Tagline */}
      <motion.p
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1, delay: 0.45 }}
        className="mt-3 text-xs sm:text-base tracking-[0.32em] uppercase font-semibold select-none"
        style={{ color: "#7CF5E1" }}
      >
        Arena of the Tideborn
      </motion.p>

      {/* Underline divider */}
      <motion.div
        initial={{ width: 0, opacity: 0 }}
        animate={{ width: 220, opacity: 1 }}
        transition={{ duration: 0.9, delay: 0.8, ease: "easeOut" }}
        className="mt-5 h-px"
        style={{
          background:
            "linear-gradient(90deg, transparent 0%, rgba(124,245,225,0.65) 50%, transparent 100%)",
        }}
      />

      {/* Dive button */}
      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, delay: 1.0 }}
        className="relative mt-9"
      >
        <motion.div
          animate={{ scale: [1, 1.045, 1] }}
          transition={{ duration: 1.7, repeat: Infinity, ease: "easeInOut" }}
        >
          <GlowButton
            variant="gold"
            size="lg"
            onClick={onDive}
            className="px-10 py-4 text-base sm:text-lg tracking-wider"
            title="Enter the Crabtopia Arena"
          >
            ⬇ Press to Dive
          </GlowButton>
        </motion.div>

        {/* Pulsing rings around the button */}
        <motion.span
          aria-hidden="true"
          className="absolute inset-0 rounded-xl pointer-events-none"
          style={{ border: "2px solid rgba(255,209,102,0.55)" }}
          animate={{ scale: [1, 1.35], opacity: [0.55, 0] }}
          transition={{ duration: 1.9, repeat: Infinity, ease: "easeOut" }}
        />
        <motion.span
          aria-hidden="true"
          className="absolute inset-0 rounded-xl pointer-events-none"
          style={{ border: "2px solid rgba(255,209,102,0.35)" }}
          animate={{ scale: [1, 1.55], opacity: [0.45, 0] }}
          transition={{ duration: 1.9, delay: 0.5, repeat: Infinity, ease: "easeOut" }}
        />
      </motion.div>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1, delay: 1.6 }}
        className="mt-6 text-[10px] sm:text-xs text-white/45 tracking-widest uppercase"
      >
        Auto-diving in 4s…
      </motion.p>
    </div>
  );
}
