// Crabtopia - Battle Visual Effects (Task E)
// Self-contained SVG + Framer Motion effect components for skill impacts.
// Each effect (except ArenaBubbles) is a one-shot: parent mounts it at the
// impact coordinate, it plays once, calls onComplete, and the parent unmounts.
// All coordinates are passed in by the parent (px within the arena container).

"use client";

import React, { useEffect, useMemo } from "react";
import { motion } from "framer-motion";

interface Point {
  x: number;
  y: number;
}

interface EffectProps {
  onComplete?: () => void;
}

// ---------------------------------------------------------------------------
// EnergyBeam — bright beam from actor to target. Draws in 200ms, holds, fades.
// ---------------------------------------------------------------------------
export function EnergyBeam({
  color = "#7CF5E1",
  from,
  to,
  onComplete,
}: {
  color?: string;
  from: Point;
  to: Point;
  onComplete?: () => void;
}): React.ReactNode {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;

  useEffect(() => {
    if (!onComplete) return;
    const t = setTimeout(onComplete, 400);
    return () => clearTimeout(t);
  }, [onComplete]);

  // Unique filter id so multiple beams don't clash.
  const filterId = useMemo(
    () => `beam-glow-${Math.floor(from.x)}-${Math.floor(from.y)}-${Math.floor(to.x)}-${Math.floor(to.y)}`,
    [from.x, from.y, to.x, to.y],
  );

  return (
    <svg
      className="absolute pointer-events-none"
      style={{ left: 0, top: 0, overflow: "visible", width: 1, height: 1 }}
      aria-hidden
    >
      <defs>
        <filter id={filterId} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <motion.line
        x1={from.x}
        y1={from.y}
        x2={to.x}
        y2={to.y}
        stroke={color}
        strokeWidth={6}
        strokeLinecap="round"
        filter={`url(#${filterId})`}
        strokeDasharray={len}
        initial={{ strokeDashoffset: len, opacity: 0 }}
        animate={{
          strokeDashoffset: [len, 0, 0],
          opacity: [0, 1, 1, 0],
        }}
        transition={{
          duration: 0.4,
          times: [0, 0.5, 0.75, 1],
          ease: "easeOut",
        }}
      />
      {/* Inner bright core */}
      <motion.line
        x1={from.x}
        y1={from.y}
        x2={to.x}
        y2={to.y}
        stroke="#FFFFFF"
        strokeWidth={2}
        strokeLinecap="round"
        strokeDasharray={len}
        initial={{ strokeDashoffset: len, opacity: 0 }}
        animate={{
          strokeDashoffset: [len, 0, 0],
          opacity: [0, 0.9, 0.9, 0],
        }}
        transition={{
          duration: 0.4,
          times: [0, 0.5, 0.75, 1],
          ease: "easeOut",
        }}
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// LightningStrike — zigzag bolt ending at (x, y) + white flash. 500ms total.
// ---------------------------------------------------------------------------
export function LightningStrike({
  x,
  y,
  onComplete,
}: {
  x: number;
  y: number;
  onComplete?: () => void;
} & EffectProps): React.ReactNode {
  useEffect(() => {
    if (!onComplete) return;
    const t = setTimeout(onComplete, 500);
    return () => clearTimeout(t);
  }, [onComplete]);

  // Zigzag from 70px above the target down to (x, y).
  const path = `M ${x - 10} ${y - 70} L ${x + 10} ${y - 50} L ${x - 7} ${y - 32} L ${x + 8} ${y - 16} L ${x} ${y}`;

  return (
    <svg
      className="absolute pointer-events-none"
      style={{ left: 0, top: 0, overflow: "visible", width: 1, height: 1 }}
      aria-hidden
    >
      <defs>
        <filter id={`light-glow-${Math.floor(x)}-${Math.floor(y)}`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <motion.path
        d={path}
        fill="none"
        stroke="#FFFFFF"
        strokeWidth={3}
        strokeLinecap="round"
        strokeLinejoin="round"
        filter={`url(#light-glow-${Math.floor(x)}-${Math.floor(y)})`}
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: [0, 1, 1, 0] }}
        transition={{ duration: 0.5, times: [0, 0.2, 0.7, 1], ease: "easeOut" }}
      />
      {/* Outer violet bolt for color */}
      <motion.path
        d={path}
        fill="none"
        stroke="#7A5CFF"
        strokeWidth={6}
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: [0, 0.5, 0.5, 0] }}
        transition={{ duration: 0.5, times: [0, 0.2, 0.7, 1], ease: "easeOut" }}
        style={{ transformOrigin: `${x}px ${y}px` }}
      />
      {/* Impact flash */}
      <motion.circle
        cx={x}
        cy={y}
        r={28}
        fill="#FFFFFF"
        initial={{ opacity: 0, scale: 0 }}
        animate={{ opacity: [0, 0.7, 0], scale: [0, 1.5, 2.2] }}
        transition={{ duration: 0.4, delay: 0.1, ease: "easeOut" }}
        style={{ transformOrigin: `${x}px ${y}px` }}
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// CrystalExplosion — 8 shards radiating outward. 600ms total.
// ---------------------------------------------------------------------------
export function CrystalExplosion({
  x,
  y,
  color = "#7A5CFF",
  onComplete,
}: {
  x: number;
  y: number;
  color?: string;
  onComplete?: () => void;
} & EffectProps): React.ReactNode {
  useEffect(() => {
    if (!onComplete) return;
    const t = setTimeout(onComplete, 600);
    return () => clearTimeout(t);
  }, [onComplete]);

  const shards = useMemo(
    () =>
      Array.from({ length: 8 }, (_, i) => {
        const angle = (i / 8) * Math.PI * 2;
        const dist = 55;
        return {
          dx: Math.cos(angle) * dist,
          dy: Math.sin(angle) * dist,
          rot: (i / 8) * 360,
        };
      }),
    [],
  );

  return (
    <div
      className="absolute pointer-events-none"
      style={{ left: x, top: y }}
      aria-hidden
    >
      {/* Center flash */}
      <motion.div
        className="absolute rounded-full"
        style={{
          width: 30,
          height: 30,
          left: -15,
          top: -15,
          background: `radial-gradient(circle, ${color}ff 0%, ${color}00 70%)`,
        }}
        initial={{ opacity: 0.9, scale: 0.4 }}
        animate={{ opacity: [0.9, 0.4, 0], scale: [0.4, 1.4, 1.8] }}
        transition={{ duration: 0.5, ease: "easeOut" }}
      />
      {shards.map((s, i) => (
        <motion.div
          key={i}
          className="absolute"
          style={{
            width: 14,
            height: 14,
            left: -7,
            top: -7,
            background: color,
            clipPath: "polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)",
            boxShadow: `0 0 8px ${color}`,
          }}
          initial={{ x: 0, y: 0, opacity: 1, rotate: 0, scale: 1 }}
          animate={{
            x: s.dx,
            y: s.dy,
            opacity: [1, 1, 0],
            rotate: s.rot + 180,
            scale: [1, 0.9, 0.4],
          }}
          transition={{ duration: 0.6, ease: "easeOut" }}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// HealAura — 6 rising sparkles (green/teal). 800ms total.
// ---------------------------------------------------------------------------
export function HealAura({
  x,
  y,
  onComplete,
}: {
  x: number;
  y: number;
  onComplete?: () => void;
} & EffectProps): React.ReactNode {
  useEffect(() => {
    if (!onComplete) return;
    const t = setTimeout(onComplete, 800);
    return () => clearTimeout(t);
  }, [onComplete]);

  const sparkles = useMemo(
    () =>
      Array.from({ length: 6 }, (_, i) => ({
        dx: (i - 2.5) * 12,
        delay: i * 0.08,
      })),
    [],
  );

  return (
    <div
      className="absolute pointer-events-none"
      style={{ left: x, top: y }}
      aria-hidden
    >
      {sparkles.map((s, i) => (
        <motion.div
          key={i}
          className="absolute font-bold"
          style={{
            left: s.dx - 8,
            top: -10,
            fontSize: 18,
            color: "#7CF5E1",
            textShadow: "0 0 6px #7CF5E1, 0 0 12px #12A7A0",
          }}
          initial={{ y: 0, opacity: 0, scale: 0 }}
          animate={{
            y: -50,
            opacity: [0, 1, 1, 0],
            scale: [0, 1.2, 1, 0.6],
          }}
          transition={{ duration: 0.7, delay: s.delay, ease: "easeOut" }}
        >
          ✨
        </motion.div>
      ))}
      {/* Soft heal halo */}
      <motion.div
        className="absolute rounded-full"
        style={{
          width: 60,
          height: 60,
          left: -30,
          top: -30,
          background:
            "radial-gradient(circle, rgba(124,245,225,0.35) 0%, rgba(124,245,225,0) 70%)",
        }}
        initial={{ opacity: 0, scale: 0.6 }}
        animate={{ opacity: [0, 0.9, 0], scale: [0.6, 1.3, 1.6] }}
        transition={{ duration: 0.8, ease: "easeOut" }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// ShieldAura — rotating dashed ring + inner glow. 1000ms (or persist if
// onComplete is omitted — caller may use it as a status aura).
// ---------------------------------------------------------------------------
export function ShieldAura({
  x,
  y,
  color = "#7CF5E1",
  onComplete,
}: {
  x: number;
  y: number;
  color?: string;
  onComplete?: () => void;
} & EffectProps): React.ReactNode {
  useEffect(() => {
    if (!onComplete) return;
    const t = setTimeout(onComplete, 1000);
    return () => clearTimeout(t);
  }, [onComplete]);

  const size = 80;
  const r = 34;
  const c = 2 * Math.PI * r;
  const filterId = useMemo(
    () => `shield-glow-${Math.floor(x)}-${Math.floor(y)}`,
    [x, y],
  );

  return (
    <div
      className="absolute pointer-events-none"
      style={{ left: x - size / 2, top: y - size / 2, width: size, height: size }}
      aria-hidden
    >
      <motion.svg
        width={size}
        height={size}
        style={{ transformOrigin: "center" }}
        animate={{ rotate: 360 }}
        transition={{ duration: 2.5, repeat: Infinity, ease: "linear" }}
      >
        <defs>
          <filter id={filterId} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="1.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={2.5}
          strokeDasharray={`${c * 0.3} ${c * 0.7}`}
          strokeLinecap="round"
          filter={`url(#${filterId})`}
          opacity={0.85}
        />
      </motion.svg>
      <motion.div
        className="absolute inset-0 rounded-full"
        style={{
          background: `radial-gradient(circle, ${color}33 0%, ${color}00 70%)`,
        }}
        initial={{ opacity: 0, scale: 0.5 }}
        animate={{ opacity: [0, 1, 0.6, 0], scale: [0.5, 1.2, 1, 1.1] }}
        transition={{ duration: 1, ease: "easeOut" }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// GoldenShower — 10 gold coins falling from top of parent to target y. 800ms.
// ---------------------------------------------------------------------------
export function GoldenShower({
  x,
  y,
  onComplete,
}: {
  x: number;
  y: number;
  onComplete?: () => void;
} & EffectProps): React.ReactNode {
  useEffect(() => {
    if (!onComplete) return;
    const t = setTimeout(onComplete, 800);
    return () => clearTimeout(t);
  }, [onComplete]);

  const coins = useMemo(
    () =>
      Array.from({ length: 10 }, (_, i) => ({
        delay: i * 0.05,
        dx: ((i % 5) - 2) * 8,
      })),
    [],
  );

  return (
    <div
      className="absolute pointer-events-none"
      style={{ left: x, top: 0 }}
      aria-hidden
    >
      {coins.map((cn, i) => (
        <motion.div
          key={i}
          className="absolute"
          style={{ fontSize: 18, lineHeight: 1 }}
          initial={{ x: cn.dx, y: 0, opacity: 0, rotate: 0 }}
          animate={{
            x: cn.dx,
            y,
            opacity: [0, 1, 1, 0],
            rotate: [0, 180, 360, 540],
          }}
          transition={{ duration: 0.7, delay: cn.delay, ease: "easeIn" }}
        >
          🪙
        </motion.div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SlashEffect — two parallel claw marks scaling in then fading. 400ms.
// ---------------------------------------------------------------------------
export function SlashEffect({
  x,
  y,
  color = "#FFD166",
  angle = 45,
  onComplete,
}: {
  x: number;
  y: number;
  color?: string;
  angle?: number;
  onComplete?: () => void;
} & EffectProps): React.ReactNode {
  useEffect(() => {
    if (!onComplete) return;
    const t = setTimeout(onComplete, 400);
    return () => clearTimeout(t);
  }, [onComplete]);

  const filterId = useMemo(
    () => `slash-glow-${Math.floor(x)}-${Math.floor(y)}`,
    [x, y],
  );

  return (
    <svg
      className="absolute pointer-events-none"
      style={{
        left: x - 30,
        top: y - 30,
        overflow: "visible",
        width: 60,
        height: 60,
        transform: `rotate(${angle}deg)`,
        transformOrigin: "30px 30px",
      }}
      aria-hidden
    >
      <defs>
        <filter id={filterId} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="1.5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <motion.line
        x1={4}
        y1={22}
        x2={56}
        y2={22}
        stroke={color}
        strokeWidth={4}
        strokeLinecap="round"
        filter={`url(#${filterId})`}
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ pathLength: [0, 1, 1], opacity: [0, 1, 0] }}
        transition={{ duration: 0.4, times: [0, 0.5, 1], ease: "easeOut" }}
      />
      <motion.line
        x1={4}
        y1={38}
        x2={56}
        y2={38}
        stroke={color}
        strokeWidth={4}
        strokeLinecap="round"
        filter={`url(#${filterId})`}
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ pathLength: [0, 1, 1], opacity: [0, 1, 0] }}
        transition={{
          duration: 0.4,
          times: [0, 0.5, 1],
          ease: "easeOut",
          delay: 0.06,
        }}
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// ArenaBubbles — persistent backdrop of bubbles rising from bottom to top.
// Deterministic by index (no hydration mismatch). Decorative / ambient.
// ---------------------------------------------------------------------------
export function ArenaBubbles({ count = 12 }: { count?: number }): React.ReactNode {
  const bubbles = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => {
        // Deterministic pseudo-random based on index only.
        const r1 = ((i * 9301 + 49297) % 233280) / 233280;
        const r2 = ((i * 7919 + 314159) % 233280) / 233280;
        const r3 = ((i * 6151 + 271828) % 233280) / 233280;
        return {
          left: ((i * 13 + r1 * 20) % 100),
          size: 4 + Math.floor(r2 * 8),
          duration: 4 + r3 * 4,
          delay: r1 * 4,
          opacity: 0.2 + r2 * 0.3,
        };
      }),
    [count],
  );

  return (
    <div
      className="absolute inset-0 pointer-events-none overflow-hidden"
      aria-hidden
    >
      {bubbles.map((b, i) => (
        <motion.div
          key={i}
          className="absolute rounded-full"
          style={{
            left: `${b.left}%`,
            bottom: -20,
            width: b.size,
            height: b.size,
            background: "rgba(124,245,225,0.45)",
            boxShadow: "0 0 6px rgba(124,245,225,0.5)",
            opacity: b.opacity,
          }}
          initial={{ y: 0 }}
          animate={{ y: [0, -700] }}
          transition={{
            duration: b.duration,
            delay: b.delay,
            repeat: Infinity,
            ease: "linear",
          }}
        />
      ))}
    </div>
  );
}
