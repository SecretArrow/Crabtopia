// Crabtopia - Battle UI Primitives (Task E)
// Floating damage numbers, combo counter, status effect icons, HP/Energy
// bars, turn indicator, speed control. Presentational only — all data via
// props. The parent is expected to manage AnimatePresence + keyed unmount
// for DamageNumber / FloatingText / ComboCounter.
//
// NOTE on StatusEffectId: the engine file (src/game/engine/arenaEngine.ts)
// is being authored in parallel by another subagent. To guarantee this file
// type-checks standalone, we declare a local stub with the same shape. When
// the engine ships, callers can use either type — they are structurally
// compatible.

"use client";

import React from "react";
import { motion, AnimatePresence } from "framer-motion";

// Local stub (matches engine/arenaEngine.ts which is built in parallel).
export type StatusEffectId =
  | "weaken"
  | "freeze"
  | "defense_down"
  | "regen"
  | "shield"
  | "slow";

// ---------------------------------------------------------------------------
// DamageNumber — floating number that rises and fades. Variant colors per
// spec. Parent should mount inside <AnimatePresence> keyed by `id` so the
// exit (auto-remove after duration) is handled cleanly.
// ---------------------------------------------------------------------------
const DAMAGE_COLORS: Record<string, string> = {
  damage: "#FF4D6D",
  heal: "#7CF5E1",
  crit: "#FFD166",
  miss: "#FFFFFF",
};

export function DamageNumber({
  value,
  x,
  y,
  variant = "damage",
  id,
}: {
  value: number;
  x: number;
  y: number;
  variant?: "damage" | "heal" | "crit" | "miss";
  id: string;
}): React.ReactNode {
  const color = DAMAGE_COLORS[variant] ?? DAMAGE_COLORS.damage;
  const text =
    variant === "miss"
      ? "MISS"
      : variant === "crit"
        ? `CRIT! ${value}`
        : `${value}`;
  const fontSize = variant === "crit" ? 32 : variant === "miss" ? 20 : 24;

  return (
    <motion.div
      key={id}
      className="absolute pointer-events-none select-none font-display font-black"
      style={{
        left: x,
        top: y,
        color,
        fontSize,
        textShadow: `0 0 10px ${color}, 0 2px 4px rgba(0,0,0,0.85)`,
        transform: "translate(-50%, -50%)",
        whiteSpace: "nowrap",
      }}
      initial={{ y: 0, opacity: 0, scale: 0.5 }}
      animate={{
        y: [0, -20, -40, -60],
        opacity: [0, 1, 1, 0],
        scale: [0.5, 1.2, 1, 0.9],
      }}
      exit={{ opacity: 0 }}
      transition={{ duration: 1.2, ease: "easeOut" }}
    >
      {text}
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// FloatingText — generic floating text (for "Blocked!", "Resisted!", etc.)
// ---------------------------------------------------------------------------
export function FloatingText({
  text,
  x,
  y,
  color = "#FFFFFF",
}: {
  text: string;
  x: number;
  y: number;
  color?: string;
}): React.ReactNode {
  return (
    <motion.div
      className="absolute pointer-events-none select-none font-display font-bold"
      style={{
        left: x,
        top: y,
        color,
        fontSize: 18,
        textShadow: `0 0 8px ${color}, 0 2px 4px rgba(0,0,0,0.85)`,
        transform: "translate(-50%, -50%)",
        whiteSpace: "nowrap",
      }}
      initial={{ y: 0, opacity: 0, scale: 0.6 }}
      animate={{
        y: [0, -24, -48],
        opacity: [0, 1, 1, 0],
        scale: [0.6, 1.1, 1, 0.9],
      }}
      transition={{ duration: 1.2, ease: "easeOut" }}
    >
      {text}
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// ComboCounter — "Combo x{count}!" with gold gradient. Shows when count>=2.
// ---------------------------------------------------------------------------
export function ComboCounter({
  count,
  x,
  y,
}: {
  count: number;
  x: number;
  y: number;
}): React.ReactNode {
  if (count < 2) return null;
  return (
    <motion.div
      className="absolute pointer-events-none select-none font-display font-black"
      style={{
        left: x,
        top: y,
        fontSize: 36,
        transform: "translate(-50%, -50%)",
        whiteSpace: "nowrap",
      }}
      initial={{ scale: 0, rotate: -15, opacity: 0 }}
      animate={{
        scale: [0, 1.3, 1],
        rotate: [-15, 5, 0],
        opacity: [0, 1, 1, 0],
      }}
      transition={{ duration: 1.1, ease: "backOut" }}
    >
      <span
        style={{
          background: "linear-gradient(135deg, #FFD166 0%, #FF7A1A 100%)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          backgroundClip: "text",
          filter: "drop-shadow(0 2px 6px rgba(255,209,102,0.45))",
        }}
      >
        Combo x{count}!
      </span>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// StatusEffectIcon — small badge with icon + rounds remaining.
// ---------------------------------------------------------------------------
const STATUS_ICONS: Record<StatusEffectId, string> = {
  weaken: "🌑",
  freeze: "❄️",
  defense_down: "🛡️↓",
  regen: "✨",
  shield: "🛡️",
  slow: "🐌",
};

export function StatusEffectIcon({
  status,
  durationMs,
}: {
  status: StatusEffectId;
  /** Remaining duration in battle-ms — displayed as whole seconds. */
  durationMs: number;
}): React.ReactNode {
  const seconds = Math.max(1, Math.ceil(durationMs / 1000));
  return (
    <motion.div
      className="rounded-md flex items-center justify-center"
      style={{
        width: 26,
        height: 22,
        background: "rgba(10,27,61,0.75)",
        border: "1px solid rgba(124,245,225,0.3)",
        fontSize: 11,
        color: "#EAF6FF",
      }}
      animate={{ scale: [1, 1.08, 1] }}
      transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
      title={`${status} — ${seconds}s remaining`}
    >
      <span aria-hidden>{STATUS_ICONS[status]}</span>
      <span
        className="ml-0.5 text-[9px] font-bold"
        style={{ color: "rgba(234,246,255,0.7)" }}
      >
        {seconds}s
      </span>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// StatusEffectRow — horizontal row of status effect icons. Max 5 visible.
// ---------------------------------------------------------------------------
export function StatusEffectRow({
  statuses,
}: {
  statuses: { id: StatusEffectId; durationMs: number }[];
}): React.ReactNode {
  const visible = statuses.slice(0, 5);
  const overflow = statuses.length - visible.length;
  return (
    <div className="flex gap-1 flex-wrap" style={{ maxWidth: 160 }}>
      {visible.map((s, i) => (
        <StatusEffectIcon
          key={`${s.id}-${i}`}
          status={s.id}
          durationMs={s.durationMs}
        />
      ))}
      {overflow > 0 && (
        <div
          className="rounded-md flex items-center justify-center text-[9px] font-bold text-white/60"
          style={{
            width: 22,
            height: 22,
            background: "rgba(10,27,61,0.6)",
            border: "1px solid rgba(124,245,225,0.2)",
          }}
        >
          +{overflow}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// HealthBar — animated HP bar. Width animates 0.4s ease. Low HP (<30%)
// triggers a pulsing red glow on the fill.
// ---------------------------------------------------------------------------
export function HealthBar({
  current,
  max,
  side,
}: {
  current: number;
  max: number;
  side: "player" | "enemy";
}): React.ReactNode {
  const safeMax = Math.max(1, max);
  const pct = Math.max(0, Math.min(1, current / safeMax));
  const lowHp = pct < 0.3 && pct > 0;
  const fill =
    side === "player"
      ? "linear-gradient(90deg, #0A4A66 0%, #12A7A0 50%, #7CF5E1 100%)"
      : "linear-gradient(90deg, #C026D3 0%, #FF4D6D 50%, #FF6F91 100%)";

  return (
    <div className="w-full">
      <div
        className="relative w-full rounded-full overflow-hidden"
        style={{
          height: 12,
          background: "rgba(10,27,61,0.7)",
          border: "1px solid rgba(124,245,225,0.2)",
        }}
      >
        <motion.div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{ background: fill }}
          initial={false}
          animate={{
            width: `${pct * 100}%`,
            boxShadow: lowHp
              ? ["0 0 4px #FF4D6D", "0 0 12px #FF4D6D", "0 0 4px #FF4D6D"]
              : "0 0 0px rgba(0,0,0,0)",
          }}
          transition={{
            width: { duration: 0.4, ease: "easeOut" },
            boxShadow: lowHp
              ? { duration: 0.8, repeat: Infinity, ease: "easeInOut" }
              : { duration: 0.3 },
          }}
        />
        {/* Subtle shimmer overlay */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "linear-gradient(180deg, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0) 50%)",
          }}
        />
      </div>
      <div
        className="text-[10px] font-bold text-center mt-0.5 font-display"
        style={{ color: "rgba(234,246,255,0.85)" }}
      >
        {Math.max(0, Math.round(current))}/{Math.round(max)}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// EnergyBar — smaller blue/violet bar with current/max readout.
// ---------------------------------------------------------------------------
export function EnergyBar({
  current,
  max,
}: {
  current: number;
  max: number;
}): React.ReactNode {
  const safeMax = Math.max(1, max);
  const pct = Math.max(0, Math.min(1, current / safeMax));
  return (
    <div className="w-full">
      <div
        className="relative w-full rounded-full overflow-hidden"
        style={{
          height: 8,
          background: "rgba(10,27,61,0.7)",
          border: "1px solid rgba(122,92,255,0.3)",
        }}
      >
        <motion.div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{ background: "linear-gradient(90deg, #5C7CFF 0%, #7A5CFF 100%)" }}
          initial={false}
          animate={{ width: `${pct * 100}%` }}
          transition={{ duration: 0.3, ease: "easeOut" }}
        />
      </div>
      <div
        className="text-[9px] font-bold text-center mt-0.5 font-display"
        style={{ color: "rgba(234,246,255,0.75)" }}
      >
        {Math.max(0, Math.round(current))}/{Math.round(max)} ⚡
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// TurnIndicator — pill at top of battle showing current turn + arena id.
// Re-keyed by `turn` so each new turn pops in.
// ---------------------------------------------------------------------------
export function TurnIndicator({
  turn,
  arenaId,
}: {
  turn: number;
  arenaId: string;
}): React.ReactNode {
  const shortId = arenaId.length > 8 ? arenaId.slice(-6) : arenaId;
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={turn}
        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full"
        style={{
          background: "rgba(10,27,61,0.75)",
          border: "1px solid rgba(124,245,225,0.3)",
          backdropFilter: "blur(6px)",
        }}
        initial={{ scale: 0.85, opacity: 0, y: -4 }}
        animate={{
          scale: [0.85, 1.06, 1],
          opacity: [0, 1, 1],
          y: 0,
        }}
        exit={{ opacity: 0, y: -4 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
      >
        <motion.span
          className="text-xs font-bold font-display"
          style={{ color: "#FFD166" }}
          animate={{ textShadow: ["0 0 4px rgba(255,209,102,0.4)", "0 0 10px rgba(255,209,102,0.7)", "0 0 4px rgba(255,209,102,0.4)"] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
        >
          Turn {turn}
        </motion.span>
        <span
          className="text-[10px] font-mono"
          style={{ color: "rgba(234,246,255,0.5)" }}
        >
          Arena #{shortId}
        </span>
      </motion.div>
    </AnimatePresence>
  );
}

// ---------------------------------------------------------------------------
// SpeedControl — x1 / x2 / x3 buttons + Auto toggle.
// ---------------------------------------------------------------------------
export function SpeedControl({
  speed,
  onSpeedChange,
  auto,
  onAutoToggle,
}: {
  speed: 1 | 2 | 3;
  onSpeedChange: (s: 1 | 2 | 3) => void;
  auto: boolean;
  onAutoToggle: () => void;
}): React.ReactNode {
  const speedBtn = (s: 1 | 2 | 3) => {
    const active = speed === s;
    return (
      <button
        type="button"
        onClick={() => onSpeedChange(s)}
        aria-pressed={active}
        className="px-2 py-0.5 text-[10px] font-bold rounded-md transition-all"
        style={{
          background: active ? "rgba(124,245,225,0.2)" : "transparent",
          color: active ? "#7CF5E1" : "rgba(234,246,255,0.6)",
          boxShadow: active ? "0 0 8px rgba(124,245,225,0.5)" : "none",
          border: active
            ? "1px solid rgba(124,245,225,0.45)"
            : "1px solid transparent",
          minWidth: 28,
        }}
      >
        x{s}
      </button>
    );
  };

  return (
    <div
      className="inline-flex items-center gap-1 px-2 py-1 rounded-full"
      style={{
        background: "rgba(10,27,61,0.75)",
        border: "1px solid rgba(124,245,225,0.2)",
        backdropFilter: "blur(6px)",
      }}
    >
      {speedBtn(1)}
      {speedBtn(2)}
      {speedBtn(3)}
      <div
        style={{
          width: 1,
          height: 16,
          background: "rgba(124,245,225,0.25)",
          margin: "0 2px",
        }}
      />
      <button
        type="button"
        onClick={onAutoToggle}
        aria-pressed={auto}
        className="px-2 py-0.5 text-[10px] font-bold rounded-md transition-all"
        style={{
          background: auto ? "rgba(255,209,102,0.2)" : "transparent",
          color: auto ? "#FFD166" : "rgba(234,246,255,0.6)",
          border: auto
            ? "1px solid rgba(255,209,102,0.45)"
            : "1px solid transparent",
          boxShadow: auto ? "0 0 8px rgba(255,209,102,0.4)" : "none",
        }}
      >
        Auto
      </button>
    </div>
  );
}
