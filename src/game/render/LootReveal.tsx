// Crabtopia - LootReveal
// Reusable loot presentation: a CSS chest that bursts open (no art
// assets, no emoji stand-ins) and the loot revealed one by one as
// cards with a rarity glow from the item's reference value
// (engine/lootReveal tiers), ending in a count-up total.
//
// PRESENTATION ONLY. Whatever granted the loot (claimDive,
// gainMaterials, launchRaid) has either already run or runs from the
// action button through the exact same store path as always — this
// component owns no reward state, so skipping or closing it can never
// duplicate or lose a reward.
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  buildRevealTimeline,
  lootTierForValue,
  type RevealPace,
} from "../engine/lootReveal";
import { GlowButton } from "./ui";

export interface LootRevealItem {
  key: string;
  name: string;
  amount: number;
  icon?: React.ReactNode;
  /** Material reference value (GOLD) — drives the rarity-tier glow. */
  tierValue?: number;
  /** Explicit accent colour; overrides the tier colour (e.g. gold). */
  accent?: string;
  /** Amount rendering; defaults to `×N`. */
  amountLabel?: string;
}

export interface LootRevealProps {
  title: string;
  subtitle?: string;
  items: LootRevealItem[];
  /** "chest" opens with the chest burst; "summary" reveals directly. */
  variant?: "chest" | "summary";
  totalLabel?: string;
  totalAmount?: number;
  totalIcon?: React.ReactNode;
  totalFormat?: (n: number) => string;
  notes?: string[];
  actionLabel: string;
  onAction: () => void;
  /** Ghost exit that does NOT take the action (loot stays claimable). */
  onDismiss?: () => void;
  dismissLabel?: string;
  pace?: RevealPace;
}

function CountUp({
  value,
  format,
}: {
  value: number;
  format?: (n: number) => string;
}): React.ReactNode {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const dur = 650;
    const stepFn = (now: number) => {
      const t = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(value * eased));
      if (t < 1) raf = requestAnimationFrame(stepFn);
    };
    raf = requestAnimationFrame(stepFn);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <>{(format ?? ((n: number) => n.toLocaleString()))(display)}</>;
}

/** Pure-CSS treasure chest (the game has no chest art asset). */
function CssChest({ open }: { open: boolean }): React.ReactNode {
  return (
    <div
      className="relative mx-auto"
      style={{ width: 168, height: 138 }}
      aria-hidden
    >
      {/* halo */}
      <motion.div
        className="absolute left-1/2 top-1/2 rounded-full"
        style={{
          width: 200,
          height: 200,
          x: "-50%",
          y: "-50%",
          background:
            "radial-gradient(circle, rgba(255,209,102,0.55) 0%, rgba(255,209,102,0) 65%)",
        }}
        animate={{ scale: open ? 1.3 : 0.65, opacity: open ? 1 : 0.35 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
      />
      {/* light column once open */}
      {open && (
        <motion.div
          className="absolute left-1/2"
          style={{
            width: 74,
            height: 92,
            bottom: 66,
            x: "-50%",
            background:
              "linear-gradient(180deg, rgba(255,236,170,0) 0%, rgba(255,236,170,0.75) 100%)",
            clipPath: "polygon(18% 100%, 82% 100%, 100% 0%, 0% 0%)",
            filter: "blur(1px)",
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.35 }}
        />
      )}
      {/* body */}
      <div
        className="absolute bottom-0 left-0"
        style={{
          width: 168,
          height: 84,
          borderRadius: 14,
          background:
            "linear-gradient(180deg, #9A6A35 0%, #7C5227 55%, #5E3D1E 100%)",
          border: "2px solid #3E2812",
          boxShadow:
            "inset 0 0 0 2px rgba(255,209,102,0.22), 0 12px 26px rgba(0,0,0,0.45)",
        }}
      >
        {/* gold bands */}
        {[26, 132].map((left) => (
          <div
            key={left}
            className="absolute top-0 h-full"
            style={{
              left,
              width: 10,
              background:
                "linear-gradient(180deg, #FFE9A8, #D9A441 60%, #A8742A)",
              borderLeft: "1px solid #3E2812",
              borderRight: "1px solid #3E2812",
            }}
          />
        ))}
        {/* lock */}
        <div
          className="absolute left-1/2 top-1/2 flex items-center justify-center rounded-full"
          style={{
            width: 30,
            height: 30,
            transform: "translate(-50%, -50%)",
            background: "radial-gradient(circle at 35% 30%, #FFE9A8, #D9A441 70%)",
            border: "2px solid #3E2812",
            boxShadow: "0 2px 8px rgba(0,0,0,0.5)",
          }}
        >
          <div
            style={{
              width: 6,
              height: 10,
              borderRadius: 3,
              background: "#3E2812",
            }}
          />
        </div>
      </div>
      {/* lid */}
      <motion.div
        className="absolute left-0"
        style={{
          width: 168,
          height: 52,
          bottom: 80,
          borderRadius: "18px 18px 8px 8px",
          background: "linear-gradient(180deg, #B07F42, #8A5E2C)",
          border: "2px solid #3E2812",
          transformOrigin: "10% 100%",
          zIndex: 2,
          overflow: "hidden",
        }}
        animate={open ? { rotate: -26, y: -16 } : { rotate: 0, y: 0 }}
        transition={{ type: "spring", stiffness: 170, damping: 15 }}
      >
        <div
          className="absolute left-0 w-full"
          style={{
            bottom: 10,
            height: 9,
            background:
              "linear-gradient(180deg, #FFE9A8, #D9A441 60%, #A8742A)",
            borderTop: "1px solid #3E2812",
            borderBottom: "1px solid #3E2812",
          }}
        />
      </motion.div>
      {/* burst particles (capped at 12) */}
      {open &&
        Array.from({ length: 12 }, (_, i) => {
          const angle = (i / 12) * Math.PI * 2 + 0.35;
          const dist = 52 + (i % 3) * 18;
          return (
            <motion.span
              key={i}
              className="absolute rounded-full"
              style={{
                width: i % 3 === 0 ? 7 : 5,
                height: i % 3 === 0 ? 7 : 5,
                left: "50%",
                top: 44,
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
              transition={{ duration: 0.75, ease: "easeOut" }}
            />
          );
        })}
    </div>
  );
}

export default function LootReveal({
  title,
  subtitle,
  items,
  variant = "chest",
  totalLabel,
  totalAmount,
  totalIcon,
  totalFormat,
  notes,
  actionLabel,
  onAction,
  onDismiss,
  dismissLabel = "Close — claim later",
  pace,
}: LootRevealProps): React.ReactNode {
  const perItemMs = pace?.perItemMs ?? 450;
  const minMs = pace?.minMs ?? 1400;
  const maxMs = pace?.maxMs ?? 5000;
  const [chestOpen, setChestOpen] = useState(variant === "summary");
  const [revealed, setRevealed] = useState(0);
  const [done, setDone] = useState(false);
  const timersRef = useRef<number[]>([]);
  const scheduledRef = useRef(false);

  const timeline = useMemo(
    () =>
      buildRevealTimeline(items.length, {
        perItemMs,
        minMs,
        maxMs,
      }),
    [items.length, perItemMs, minMs, maxMs]
  );

  // Chest auto-opens shortly after mount (or on click, below).
  useEffect(() => {
    if (variant !== "chest" || chestOpen) return;
    const t = window.setTimeout(() => setChestOpen(true), 950);
    timersRef.current.push(t);
    return () => window.clearTimeout(t);
  }, [variant, chestOpen]);

  // Schedule the staggered reveal once the chest is open.
  useEffect(() => {
    if (!chestOpen || scheduledRef.current) return;
    scheduledRef.current = true;
    items.forEach((_, i) => {
      const t = window.setTimeout(
        () => setRevealed(i + 1),
        timeline.revealAtMs[i] ?? 0
      );
      timersRef.current.push(t);
    });
    const end = window.setTimeout(() => setDone(true), timeline.durationMs);
    timersRef.current.push(end);
  }, [chestOpen, items, timeline]);

  useEffect(
    () => () => {
      timersRef.current.forEach((t) => window.clearTimeout(t));
    },
    []
  );

  const skip = () => {
    timersRef.current.forEach((t) => window.clearTimeout(t));
    setChestOpen(true);
    setRevealed(items.length);
    setDone(true);
  };

  return (
    <div data-testid="loot-reveal" className="w-full">
      <div className="text-center">
        <div
          className="text-lg font-bold"
          style={{ fontFamily: "Fredoka, system-ui, sans-serif" }}
        >
          {title}
        </div>
        {subtitle && (
          <div className="mt-0.5 text-xs text-white/60">{subtitle}</div>
        )}
      </div>

      {variant === "chest" && (
        <button
          type="button"
          aria-label={chestOpen ? "Chest open" : "Open the chest"}
          onClick={() => setChestOpen(true)}
          className="mx-auto mt-2 block cursor-pointer"
          style={{ background: "none", border: "none", padding: 0 }}
        >
          <CssChest open={chestOpen} />
        </button>
      )}

      {/* Revealed loot cards */}
      <div className="mt-3 flex flex-wrap justify-center gap-2">
        {items.slice(0, revealed).map((item) => {
          const tier = lootTierForValue(item.tierValue ?? 0);
          const accent = item.accent ?? tier.color;
          return (
            <motion.div
              key={item.key}
              className="flex items-center gap-2 rounded-xl px-3 py-2"
              style={{
                background: "rgba(10,27,61,0.78)",
                border: `2px solid ${accent}`,
                boxShadow: `0 0 16px ${accent}55`,
              }}
              initial={{ scale: 0.55, y: 16, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              transition={{ type: "spring", stiffness: 320, damping: 20 }}
            >
              {item.icon && (
                <span
                  className="flex h-9 w-9 items-center justify-center rounded-full text-lg"
                  style={{ background: `${accent}26` }}
                >
                  {item.icon}
                </span>
              )}
              <span className="text-left leading-tight">
                <span className="block text-xs font-bold">{item.name}</span>
                <span
                  className="block text-[10px] font-bold uppercase tracking-wide"
                  style={{ color: accent }}
                >
                  {item.tierValue !== undefined
                    ? tier.label
                    : "Spoils"}
                </span>
              </span>
              <span
                className="text-base font-black"
                style={{ color: accent }}
              >
                {item.amountLabel ?? `×${item.amount}`}
              </span>
            </motion.div>
          );
        })}
        {revealed === 0 && chestOpen && (
          <div className="text-xs text-white/50">Revealing…</div>
        )}
      </div>

      {/* Total + notes once the reveal completes */}
      {done && totalAmount !== undefined && (
        <motion.div
          className="mt-3 flex items-center justify-center gap-2 text-sm font-bold"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
        >
          {totalIcon}
          <span className="text-white/70">{totalLabel ?? "Total"}:</span>
          <span style={{ color: "#FFD166" }}>
            <CountUp value={totalAmount} format={totalFormat} />
          </span>
        </motion.div>
      )}
      {done && notes && notes.length > 0 && (
        <div className="mt-1.5 space-y-0.5 text-center text-[11px] text-white/55">
          {notes.map((n) => (
            <div key={n}>{n}</div>
          ))}
        </div>
      )}

      {/* Actions: Skip is always available; it becomes the real action
          once everything is revealed. */}
      <div className="mt-4 flex items-center justify-between gap-2">
        {onDismiss ? (
          <button
            type="button"
            onClick={onDismiss}
            className="text-xs font-bold text-white/55 underline-offset-2 hover:text-white hover:underline"
          >
            {dismissLabel}
          </button>
        ) : (
          <span />
        )}
        <span data-testid="loot-reveal-action">
          <GlowButton
            variant="gold"
            size="sm"
            onClick={done ? onAction : skip}
          >
            {done ? actionLabel : "Skip ▸"}
          </GlowButton>
        </span>
      </div>
    </div>
  );
}
