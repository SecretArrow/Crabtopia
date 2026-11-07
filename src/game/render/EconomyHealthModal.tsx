// Crabtopia - Economy Health Modal
// Self-contained public dashboard that makes the game economy transparent.
// Implements spec §5 (Economic Design) & §10B problem 5 (Public Dashboard).
//
// Sections:
//   1. Header (title + tagline + time-range pills + last-updated + auto-refresh)
//   2. Top KPI row (4 StatChips: circulation, inflation, players, Gini)
//   3. Circulation chart (CSS bar chart, faucets vs sinks, net change line)
//   4. Issuance Budget panel (current epoch, budget cap, projection)
//   5. Faucets breakdown (stacked bar + legend)
//   6. Sinks breakdown (stacked bar + legend)
//   7. Gold Price Index panel (basket, trend, mini line chart)
//   8. Breeding Quota panel (daily eggs, waitlist)
//   9. Stability Events panel (status, past events log)
//  10. Player distribution panel (wealth tiers, simulator note)
//  11. Footer (docs link, subscribe, close)
//
// The global panels are an illustrative model, generated deterministically
// from a seed so re-renders stay consistent within a timeRange selection.
// The "Your Tide Ledger" panel is NOT model data: it renders this save's
// real tokenomics counters (engine/economy.ts) and the live config rules.

"use client";

import React, { useMemo, useState } from "react";
import { useGame } from "../store/gameStore";
import {
  CONFIG,
  MARKET_FEE_TREASURY_POINTS,
  TIDE_TAX_RATE,
  TIDE_TAX_WINDOW_MS,
  TITHE_BRACKETS,
  TITHE_BURN_SHARE,
} from "../engine/config";
import {
  defaultEconomy,
  describeTithe,
  economyOf,
} from "../engine/economy";
import {
  GlassPanel,
  GlowButton,
  StatChip,
  SectionTitle,
  GoldIcon,
  formatGold,
} from "./ui";

// ---------- TYPES ----------

type TimeRange = "24h" | "7d" | "30d" | "all";

interface DailyFlow {
  day: string;
  faucets: number; // GOLD entering (+)
  sinks: number; // GOLD leaving (-)
}

interface TierDef {
  label: string;
  share: number; // percent of total GOLD
  color: string;
}

interface BreakdownSlice {
  label: string;
  pct: number;
  color: string;
  note?: string;
}

interface PastEvent {
  name: string;
  range: string;
  effect: string;
  kind: "sink" | "bonus";
}

// ---------- COLORS (transparency-teal accent) ----------

const TEAL = "#7CF5E1";
const TEAL_DEEP = "#12A7A0";
const CORAL = "#FF6F91";
const GOLD = "#FFD166";
const VIOLET = "#7A5CFF";
const GREEN = "#22C55E";
const SLATE = "#5C7CFF";
const ROSE = "#C026D3";

// ---------- MOCK DATA (deterministic) ----------

const FAUCET_SLICES: BreakdownSlice[] = [
  { label: "Dive rewards", pct: 48, color: TEAL },
  { label: "Raid winnings", pct: 18, color: TEAL_DEEP },
  { label: "Quests", pct: 12, color: GOLD },
  { label: "Coliseum", pct: 10, color: SLATE },
  { label: "Tournaments", pct: 5, color: VIOLET },
  { label: "Events", pct: 4, color: ROSE },
  { label: "Other", pct: 3, color: "rgba(255,255,255,0.35)" },
];

const SINK_SLICES: BreakdownSlice[] = [
  { label: "Breeding costs", pct: 35, color: CORAL },
  { label: "Bazaar fees (3.85%)", pct: 18, color: "#E0486F" },
  { label: "Hall fees (half burned)", pct: 12, color: "#FF7A1A" },
  { label: "Gear crafting/repair", pct: 10, color: GOLD },
  { label: "Team slot purchases", pct: 8, color: SLATE },
  { label: "Plot upgrades", pct: 7, color: VIOLET },
  { label: "Cosmetics crafting", pct: 5, color: ROSE },
  { label: "Retirement sink", pct: 3, color: TEAL_DEEP },
  { label: "Tide Tax (high balances)", pct: 2, color: "rgba(255,255,255,0.35)" },
];

const WEALTH_TIERS: TierDef[] = [
  { label: "Top 1%", share: 12, color: GOLD },
  { label: "Next 9% (1–10%)", share: 26, color: CORAL },
  { label: "Next 40% (10–50%)", share: 40, color: SLATE },
  { label: "Bottom 50%", share: 22, color: TEAL },
];

const PAST_EVENTS: PastEvent[] = [
  {
    name: "Gold Rush Week",
    range: "Sep 15–22",
    effect: "+20% dive rewards (cold-economy bonus)",
    kind: "bonus",
  },
  {
    name: "Reef Renovation Contest",
    range: "Aug 28–Sep 4",
    effect: "−180K GOLD burned via themed crafting week",
    kind: "sink",
  },
  {
    name: "Limited Cosmetic Shop",
    range: "Aug 10–17",
    effect: "−95K GOLD spent on exclusive shells",
    kind: "sink",
  },
];

// Deterministic seeded RNG so mock values stay stable across re-renders
// within a given timeRange.
function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const RANGE_LABELS: Record<TimeRange, string> = {
  "24h": "24 hours",
  "7d": "7 days",
  "30d": "30 days",
  all: "All time",
};

// Build the daily faucet/sink series for a given range.
// We always show 7 bars on the chart; the values are scaled/flavored per range.
function buildDailyFlow(range: TimeRange): DailyFlow[] {
  const seed =
    range === "24h"
      ? 11
      : range === "7d"
      ? 23
      : range === "30d"
      ? 37
      : 53;
  const rng = mulberry32(seed);
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  // Base magnitude differs per range to feel like a real zoom level.
  const base = range === "24h" ? 65_000 : range === "7d" ? 95_000 : range === "30d" ? 320_000 : 1_400_000;
  return days.map((d) => {
    const fJ = 0.7 + rng() * 0.55;
    const sJ = 0.55 + rng() * 0.55;
    return {
      day: d,
      faucets: Math.round(base * fJ),
      sinks: Math.round(base * sJ),
    };
  });
}

// Mini-line-chart series for the Gold Price Index (7 points).
function buildPriceIndexSeries(): number[] {
  const rng = mulberry32(89);
  const out: number[] = [];
  let v = 1820;
  for (let i = 0; i < 7; i++) {
    v += (rng() - 0.45) * 30;
    out.push(Math.round(v));
  }
  out[out.length - 1] = 1847; // pin the last point to the headline number
  return out;
}

// ---------- SUB-COMPONENTS ----------

function TimeRangePill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className="px-3 py-1 rounded-lg text-xs font-bold transition-all duration-150 hover:-translate-y-0.5 active:scale-95"
      style={{
        background: active
          ? "linear-gradient(135deg, #12A7A0, #0A4A66)"
          : "rgba(255,255,255,0.06)",
        color: active ? "#EAF6FF" : "rgba(234,246,255,0.7)",
        border: active
          ? "1px solid rgba(124,245,225,0.55)"
          : "1px solid rgba(124,245,225,0.18)",
        boxShadow: active ? "0 0 12px rgba(18,167,160,0.4)" : "none",
      }}
    >
      {children}
    </button>
  );
}

// A horizontal stacked-bar (faucets or sinks).
function StackedBreakdown({
  slices,
  accentLabel,
}: {
  slices: BreakdownSlice[];
  accentLabel: string;
}) {
  const total = slices.reduce((s, x) => s + x.pct, 0);
  return (
    <div className="flex flex-col gap-2">
      <div
        className="flex h-3 w-full rounded-full overflow-hidden"
        style={{ border: "1px solid rgba(124,245,225,0.18)" }}
        title={accentLabel}
      >
        {slices.map((s) => (
          <div
            key={s.label}
            style={{
              width: `${(s.pct / total) * 100}%`,
              background: s.color,
            }}
            title={`${s.label} — ${s.pct}%`}
          />
        ))}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-3 gap-y-1">
        {slices.map((s) => (
          <div key={s.label} className="flex items-center gap-1.5 min-w-0">
            <span
              className="inline-block w-2 h-2 rounded-sm shrink-0"
              style={{ background: s.color }}
            />
            <span className="text-[10px] text-white/75 truncate">
              {s.label}
            </span>
            <span
              className="text-[10px] font-bold ml-auto shrink-0"
              style={{ color: s.color }}
            >
              {s.pct}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Vertical bar chart: 7 daily columns of faucets (+) and sinks (-),
// with an overlaid net-change polyline.
function CirculationChart({ flow }: { flow: DailyFlow[] }) {
  const maxAbs = Math.max(...flow.flatMap((d) => [d.faucets, d.sinks]));
  // Each column is split: top half = faucets, bottom half = sinks.
  // A column is 100% tall; axis runs at 50%.
  const colHeightPct = (v: number) => (v / maxAbs) * 50; // half-height share

  // Net change polyline points (top-of-faucet relative to axis).
  // We use SVG overlay spanning the chart area.
  const netValues = flow.map((d) => d.faucets - d.sinks);
  const netMax = Math.max(...netValues.map((n) => Math.abs(n))) || 1;

  // Chart is laid out as a 7-column grid; the SVG overlay is absolutely
  // positioned over it. Each net point sits at column center.
  const W = 100; // viewBox width units (percent)
  const H = 100; // viewBox height units (percent)
  // Map net (in [-netMax, +netMax]) → y in [0..100]; 50 = axis.
  const pts = netValues
    .map((n, i) => {
      const x = ((i + 0.5) / flow.length) * W;
      const y = 50 - (n / netMax) * 40; // ±40 around axis
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");

  return (
    <div className="flex flex-col gap-2">
      <div
        className="relative grid gap-1.5 sm:gap-2"
        style={{ gridTemplateColumns: `repeat(${flow.length}, 1fr)` }}
      >
        {/* SVG overlay for the net-change line + axis */}
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="absolute inset-0 w-full h-full pointer-events-none"
        >
          {/* Zero axis */}
          <line
            x1="0"
            y1="50"
            x2="100"
            y2="50"
            stroke="rgba(255,255,255,0.18)"
            strokeWidth="0.4"
            strokeDasharray="2 2"
          />
          {/* Net change polyline */}
          <polyline
            points={pts}
            fill="none"
            stroke={GOLD}
            strokeWidth="0.8"
            strokeLinejoin="round"
            strokeLinecap="round"
            style={{ filter: "drop-shadow(0 0 4px rgba(255,209,102,0.5))" }}
          />
          {netValues.map((n, i) => {
            const x = ((i + 0.5) / flow.length) * 100;
            const y = 50 - (n / netMax) * 40;
            return (
              <circle
                key={i}
                cx={x}
                cy={y}
                r="0.9"
                fill={GOLD}
                style={{ filter: "drop-shadow(0 0 3px rgba(255,209,102,0.7))" }}
              />
            );
          })}
        </svg>

        {flow.map((d) => (
          <div
            key={d.day}
            className="flex flex-col items-center justify-center gap-0.5"
            style={{ height: 180 }}
          >
            {/* Faucet bar (grows upward from axis at 50%) */}
            <div
              className="w-full max-w-[26px] rounded-t-md"
              style={{
                height: `${colHeightPct(d.faucets)}%`,
                background: `linear-gradient(180deg, ${TEAL}, ${TEAL_DEEP})`,
                boxShadow: `0 0 8px ${TEAL}66`,
                alignSelf: "center",
                marginTop: `${50 - colHeightPct(d.faucets)}%`,
              }}
              title={`Faucets: +${formatGold(d.faucets)} GOLD`}
            />
            {/* Sink bar (grows downward from axis at 50%) */}
            <div
              className="w-full max-w-[26px] rounded-b-md"
              style={{
                height: `${colHeightPct(d.sinks)}%`,
                background: `linear-gradient(180deg, ${CORAL}, #E0486F)`,
                boxShadow: `0 0 8px ${CORAL}55`,
                alignSelf: "center",
              }}
              title={`Sinks: −${formatGold(d.sinks)} GOLD`}
            />
          </div>
        ))}
      </div>

      {/* Day labels */}
      <div
        className="grid gap-1.5 sm:gap-2"
        style={{ gridTemplateColumns: `repeat(${flow.length}, 1fr)` }}
      >
        {flow.map((d) => (
          <div key={d.day} className="text-[10px] text-white/55 text-center">
            {d.day}
          </div>
        ))}
      </div>
    </div>
  );
}

// Mini SVG line chart for the Gold Price Index.
function MiniLineChart({
  values,
  color = GOLD,
}: {
  values: number[];
  color?: string;
}) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const W = 100;
  const H = 32;
  const pts = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * W;
      const y = H - ((v - min) / span) * H;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className="w-full h-12"
    >
      <polyline
        points={pts}
        fill="none"
        stroke={color}
        strokeWidth="1.4"
        strokeLinejoin="round"
        strokeLinecap="round"
        style={{ filter: `drop-shadow(0 0 3px ${color}66)` }}
      />
      {values.map((v, i) => {
        const x = (i / (values.length - 1)) * W;
        const y = H - ((v - min) / span) * H;
        return <circle key={i} cx={x} cy={y} r="0.8" fill={color} />;
      })}
    </svg>
  );
}

// Issuance Budget bar with cap line + projection marker.
function IssuanceBudgetBar({
  budget,
  issued,
  projected,
}: {
  budget: number;
  issued: number;
  projected: number;
}) {
  const issuedPct = Math.min((issued / budget) * 100, 100);
  const projectedPct = Math.min((projected / budget) * 100, 130); // allow overflow visually
  const capVisiblePct = 100;
  return (
    <div className="relative h-6 w-full rounded-full overflow-hidden"
      style={{ background: "rgba(10,27,61,0.6)", border: "1px solid rgba(124,245,225,0.2)" }}
    >
      {/* Issued so far */}
      <div
        className="absolute top-0 left-0 h-full rounded-l-full"
        style={{
          width: `${issuedPct}%`,
          background: `linear-gradient(90deg, ${TEAL_DEEP}, ${TEAL})`,
          boxShadow: `0 0 10px ${TEAL}66`,
        }}
      />
      {/* Budget cap line at 100% */}
      <div
        className="absolute top-0 h-full"
        style={{
          left: `${capVisiblePct}%`,
          width: 2,
          background: GOLD,
          boxShadow: `0 0 6px ${GOLD}`,
        }}
        title="Weekly budget cap"
      />
      {/* Projection marker */}
      <div
        className="absolute -top-1"
        style={{
          left: `calc(${Math.min(projectedPct, 100)}% - 6px)`,
          width: 0,
          height: 0,
          borderLeft: "6px solid transparent",
          borderRight: "6px solid transparent",
          borderTop: `8px solid ${VIOLET}`,
          filter: `drop-shadow(0 0 4px ${VIOLET}88)`,
        }}
        title={`Projected: ${formatGold(projected)} GOLD`}
      />
    </div>
  );
}

// ---------- MAIN COMPONENT ----------

export default function EconomyHealthModal({
  onClose,
}: {
  onClose: () => void;
}) {
  const player = useGame((s) => s.player);
  const pushToast = useGame((s) => s.pushToast);

  // --- Your Tide Ledger: REAL tokenomics state from this save ---
  const eco = player ? economyOf(player) : defaultEconomy();
  const tithe = describeTithe(player?.gold ?? 0);
  const bracketLine = TITHE_BRACKETS.map(
    (b, i) =>
      `${Math.round(b.rate * 100)}% ${i === 0 ? "under" : "from"} ${formatGold(
        i === 0 ? TITHE_BRACKETS[1].minBalance : b.minBalance
      )}`
  ).join(" · ");
  const tideTaxWindowDays = Math.round(TIDE_TAX_WINDOW_MS / (24 * 60 * 60 * 1000));

  const [timeRange, setTimeRange] = useState<TimeRange>("7d");

  // All mock data is derived from timeRange so a range switch feels meaningful.
  const flow = useMemo(() => buildDailyFlow(timeRange), [timeRange]);
  const priceSeries = useMemo(() => buildPriceIndexSeries(), []);

  // Headline numbers (kept stable; range only reshapes the chart).
  const totalCirculation = 4_820_000;
  const weeklyInflationPct = 1.7;
  const activePlayers24h = 12_847;
  const gini = 0.54;

  // Issuance budget figures
  const epoch = { season: 1, week: 5 };
  const weeklyBudget = 850_000;
  const issuedSoFar = 612_400;
  const daysRemaining = 4;
  const projected = 855_000;
  const issuedPct = Math.round((issuedSoFar / weeklyBudget) * 100);

  // Breeding quota
  const eggQuota = 8_400;
  const eggsIssued = 6_127;
  const eggPct = Math.round((eggsIssued / eggQuota) * 100);

  // Stability
  const nextCheckHours = 18;

  // Subscribe no-op
  function onSubscribe() {
    pushToast({
      title: "Economy alerts subscribed",
      description: "You'll be pinged when sink or bonus events open.",
      variant: "success",
    });
  }

  return (
    <div
      className="modal-backdrop-enter fixed inset-0 z-[150] flex items-center justify-center p-3 sm:p-4"
      style={{
        background: "rgba(2,12,28,0.78)",
        backdropFilter: "blur(8px)",
      }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Economy Health dashboard"
    >
      <div
        className="w-full max-w-3xl max-h-[88vh] overflow-y-auto rounded-3xl"
        style={{
          borderColor: "rgba(124,245,225,0.22)",
          background:
            "linear-gradient(180deg, rgba(6,18,43,0.97), rgba(4,12,30,0.93))",
          backdropFilter: "blur(6px)",
          boxShadow:
            "0 16px 80px rgba(18,167,160,0.28), 0 0 40px rgba(124,245,225,0.08)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ---------- HEADER ---------- */}
        <div
          className="sticky top-0 z-20 px-4 py-3 border-b border-white/10"
          style={{
            background: "rgba(6,18,43,0.92)",
            backdropFilter: "blur(6px)",
          }}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span
                className="text-xl shrink-0"
                style={{ filter: "drop-shadow(0 0 6px rgba(124,245,225,0.5))" }}
                aria-hidden
              >
                📊
              </span>
              <div className="min-w-0">
                <div className="font-bold font-display text-sm sm:text-base truncate">
                  Economy Health
                </div>
                <div className="text-[10px] text-white/55 truncate">
                  Public dashboard · Updated hourly · All formulas published
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <StatChip
                label="Balance"
                value={
                  <span className="inline-flex items-center gap-1">
                    <GoldIcon size={12} />
                    {formatGold(player?.gold ?? 0)}
                  </span>
                }
                color={GOLD}
              />
              <button
                onClick={onClose}
                className="text-white/60 hover:text-white w-8 h-8 flex items-center justify-center rounded-md hover:bg-white/10"
                aria-label="Close"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Time range pills + last-updated */}
          <div className="flex items-center justify-between gap-2 mt-3 flex-wrap">
            <div className="flex items-center gap-1.5 flex-wrap">
              {(["24h", "7d", "30d", "all"] as TimeRange[]).map((r) => (
                <TimeRangePill
                  key={r}
                  active={timeRange === r}
                  onClick={() => setTimeRange(r)}
                >
                  {r === "24h"
                    ? "24H"
                    : r === "7d"
                    ? "7D"
                    : r === "30d"
                    ? "30D"
                    : "All"}
                </TimeRangePill>
              ))}
            </div>
            <div className="flex items-center gap-2 text-[10px] text-white/55">
              <span className="inline-flex items-center gap-1">
                <span
                  className="inline-block w-1.5 h-1.5 rounded-full"
                  style={{
                    background: GREEN,
                    boxShadow: `0 0 6px ${GREEN}`,
                    animation: "planktonPulse 2.4s ease-in-out infinite",
                  }}
                />
                Auto-refresh on
              </span>
              <span>·</span>
              <span>Updated 2 minutes ago</span>
            </div>
          </div>
        </div>

        {/* ---------- BODY ---------- */}
        <div className="px-4 py-4 flex flex-col gap-4">
          {/* 2. Top KPI row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <StatChip
              label="GOLD in circulation"
              value={
                <span className="inline-flex items-center gap-1">
                  <GoldIcon size={12} />
                  {formatGold(totalCirculation)}
                </span>
              }
              color={GOLD}
            />
            <StatChip
              label="Weekly inflation"
              value={
                <span className="inline-flex items-center gap-1">
                  +{weeklyInflationPct}%
                  <span className="text-[10px]" style={{ color: GREEN }}>
                    ✓
                  </span>
                </span>
              }
              color={TEAL}
            />
            <StatChip
              label="Active players (24h)"
              value={activePlayers24h.toLocaleString()}
              color={SLATE}
            />
            <StatChip
              label="Gini coefficient"
              value={
                <span className="inline-flex items-center gap-1">
                  {gini.toFixed(2)}
                  <span className="text-[10px]" style={{ color: GREEN }}>
                    ✓
                  </span>
                </span>
              }
              color={VIOLET}
            />
          </div>
          <div className="text-[10px] text-white/45 -mt-1">
            Inflation target &lt; 3% · Gini target &lt; 0.60 — both within
            bounds.
          </div>

          {/* 2b. YOUR TIDE LEDGER — real counters from this save */}
          <GlassPanel className="p-4" glow={`${GOLD}22`}>
            <SectionTitle
              icon={<span aria-hidden>🧾</span>}
              title="Your Tide Ledger"
              action={
                <span className="text-[10px] text-white/55">
                  Live from your save — not a model
                </span>
              }
            />
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <StatChip
                label="Tide Treasury"
                value={
                  <span className="inline-flex items-center gap-1">
                    <GoldIcon size={12} />
                    {formatGold(eco.treasury)}
                  </span>
                }
                color={TEAL}
              />
              <StatChip
                label="GOLD burned (your taxes)"
                value={
                  <span className="inline-flex items-center gap-1">
                    <GoldIcon size={12} />
                    {formatGold(eco.totalBurned)}
                  </span>
                }
                color={CORAL}
              />
              <StatChip
                label="Tax you have paid"
                value={
                  <span className="inline-flex items-center gap-1">
                    <GoldIcon size={12} />
                    {formatGold(eco.totalTaxPaid)}
                  </span>
                }
                color={GOLD}
              />
              <StatChip
                label="Prizes paid from Treasury"
                value={
                  <span className="inline-flex items-center gap-1">
                    <GoldIcon size={12} />
                    {formatGold(eco.treasuryOut)}
                  </span>
                }
                color={GREEN}
              />
            </div>
            <div className="mt-3 space-y-1.5 text-[11px] text-white/75">
              <div>
                <span className="text-white font-semibold">
                  Your Tide Tithe rate: {Math.round(tithe.rate * 100)}%
                </span>{" "}
                on gold you earn (dives, raids, quests, arena, claims).
                Brackets: {bracketLine}. Spending is never tithed, and
                earnings under the first bracket pay nothing.
              </div>
              <div>
                <span className="text-white font-semibold">Tide Tax:</span>{" "}
                {Math.round(TIDE_TAX_RATE * 100)}% of only the balance
                above {formatGold(CONFIG.tideTaxThreshold)}, once every{" "}
                {tideTaxWindowDays} days — your first{" "}
                {formatGold(CONFIG.tideTaxThreshold)} is never taxed.
                Window anchored{" "}
                {new Date(eco.lastTideTaxAt).toLocaleDateString()}.
              </div>
              <div>
                <span className="text-white font-semibold">
                  Where the tax goes:
                </span>{" "}
                {Math.round(TITHE_BURN_SHARE * 100)}% of every tithe is
                burned forever (a permanent sink that fights inflation);
                the rest flows into the Tide Treasury, the prize reserve
                that pays Tidewell Rewards before any new GOLD is minted.
                Market sales split their{" "}
                {Math.round(CONFIG.bazaarFeePercent * 10000) / 100}% fee
                the same way: {Math.round(MARKET_FEE_TREASURY_POINTS * 100)}{" "}
                point to the Treasury, the rest burned. Escrow, refunds
                and your own money moving are never taxed.
              </div>
            </div>
          </GlassPanel>

          {/* 3. Circulation chart */}
          <GlassPanel className="p-4" glow={`${TEAL}22`}>
            <SectionTitle
              icon={<span aria-hidden>🌊</span>}
              title="GOLD circulation (last 7 days)"
              action={
                <span className="text-[10px] text-white/55">
                  Range: {RANGE_LABELS[timeRange]}
                </span>
              }
            />
            <CirculationChart flow={flow} />
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2 text-[10px]">
              <div className="flex items-center gap-1.5">
                <span
                  className="inline-block w-2.5 h-2.5 rounded-sm"
                  style={{ background: TEAL }}
                />
                <span className="text-white/75">
                  Faucets — dives + raids + quests + coliseum
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span
                  className="inline-block w-2.5 h-2.5 rounded-sm"
                  style={{ background: CORAL }}
                />
                <span className="text-white/75">
                  Sinks — breeding + fees + upgrades + retirement
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span
                  className="inline-block w-2.5 h-2.5 rounded-full"
                  style={{ background: GOLD, boxShadow: `0 0 6px ${GOLD}` }}
                />
                <span className="text-white/75">Net change line (faucets − sinks)</span>
              </div>
            </div>
          </GlassPanel>

          {/* 4. Issuance budget */}
          <GlassPanel className="p-4" glow={`${TEAL}22`}>
            <SectionTitle
              icon={<span aria-hidden>📜</span>}
              title="Issuance Budget"
              action={
                <span
                  className="text-[10px] px-2 py-0.5 rounded-md"
                  style={{
                    background: "rgba(124,245,225,0.12)",
                    color: TEAL,
                    border: `1px solid ${TEAL}44`,
                  }}
                >
                  Epoch {epoch.season}.{epoch.week}
                </span>
              }
            />
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
              <StatChip
                label="Week budget"
                value={
                  <span className="inline-flex items-center gap-1">
                    <GoldIcon size={12} />
                    {formatGold(weeklyBudget)}
                  </span>
                }
                color={GOLD}
              />
              <StatChip
                label="Issued so far"
                value={`${issuedPct}%`}
                color={TEAL}
              />
              <StatChip
                label="Days remaining"
                value={daysRemaining}
                color={SLATE}
              />
              <StatChip
                label="Projected total"
                value={
                  <span className="inline-flex items-center gap-1">
                    <GoldIcon size={12} />
                    {formatGold(projected)}
                  </span>
                }
                color={VIOLET}
              />
            </div>
            <IssuanceBudgetBar
              budget={weeklyBudget}
              issued={issuedSoFar}
              projected={projected}
            />
            <div className="flex justify-between mt-1.5 text-[10px] text-white/55">
              <span>0</span>
              <span style={{ color: GOLD }}>Budget cap · {formatGold(weeklyBudget)}</span>
              <span>+15% cap · {formatGold(Math.round(weeklyBudget * 1.15))}</span>
            </div>
            <p className="mt-2 text-[11px] text-white/65 leading-snug">
              If too much GOLD enters, rewards per dive shrink gradually. If too
              little, they grow. Within ±15% per epoch.
            </p>
          </GlassPanel>

          {/* 5 + 6. Faucets & Sinks side-by-side */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <GlassPanel className="p-4" glow={`${TEAL}22`}>
              <SectionTitle icon={<span aria-hidden>🚰</span>} title="Faucets breakdown" />
              <StackedBreakdown
                slices={FAUCET_SLICES}
                accentLabel="Where GOLD enters the world"
              />
            </GlassPanel>
            <GlassPanel className="p-4" glow={`${CORAL}22`}>
              <SectionTitle icon={<span aria-hidden>🕳️</span>} title="Sinks breakdown" />
              <StackedBreakdown
                slices={SINK_SLICES}
                accentLabel="Where GOLD leaves the world"
              />
            </GlassPanel>
          </div>

          {/* 7. Gold Price Index */}
          <GlassPanel className="p-4" glow={`${GOLD}22`}>
            <SectionTitle
              icon={<span aria-hidden>🏷️</span>}
              title="Gold Price Index"
              action={
                <span className="text-[10px] text-white/55">
                  Standard basket
                </span>
              }
            />
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-center">
              <div className="flex flex-col gap-1">
                <div className="text-[10px] uppercase tracking-wide text-white/55">
                  Basket median
                </div>
                <div
                  className="text-2xl font-bold font-display inline-flex items-center gap-1.5"
                  style={{ color: GOLD }}
                >
                  <GoldIcon size={18} />
                  {(1847).toLocaleString()}
                </div>
                <div className="text-[10px] text-white/55">
                  1× L30 pure crab + 1× egg + 1× gear set
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase text-white/55">
                    7-day trend
                  </span>
                  <span className="text-xs font-bold" style={{ color: GREEN }}>
                    +2.3%
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase text-white/55">
                    30-day trend
                  </span>
                  <span className="text-xs font-bold" style={{ color: CORAL }}>
                    −1.1%
                  </span>
                </div>
                <div className="text-[10px] text-white/55 mt-0.5">
                  Median of Bazaar prices across the basket.
                </div>
              </div>
              <div className="min-w-0">
                <MiniLineChart values={priceSeries} color={GOLD} />
                <div className="text-[10px] text-white/55 text-center">
                  last 7 readings
                </div>
              </div>
            </div>
            <p className="mt-2 text-[11px] text-white/65 leading-snug">
              Used to tune dive rewards. When the index rises, rewards shrink;
              when it falls, rewards grow.
            </p>
          </GlassPanel>

          {/* 8 + 9. Breeding Quota & Stability side-by-side */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <GlassPanel className="p-4" glow={`${ROSE}22`}>
              <SectionTitle
                icon={<span aria-hidden>🥚</span>}
                title="Breeding Quota"
              />
              <div className="grid grid-cols-2 gap-2 mb-2">
                <StatChip
                  label="Daily egg quota"
                  value={eggQuota.toLocaleString()}
                  color={ROSE}
                />
                <StatChip
                  label="Issued today"
                  value={`${eggPct}%`}
                  color={TEAL}
                />
              </div>
              <div
                className="h-2 w-full rounded-full overflow-hidden"
                style={{
                  background: "rgba(10,27,61,0.6)",
                  border: "1px solid rgba(124,245,225,0.18)",
                }}
              >
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${eggPct}%`,
                    background: `linear-gradient(90deg, ${VIOLET}, ${ROSE})`,
                    boxShadow: `0 0 8px ${ROSE}55`,
                  }}
                />
              </div>
              <div className="flex justify-between mt-1 text-[10px] text-white/55">
                <span>0</span>
                <span>Quota resets in 8h 23m</span>
                <span>{eggQuota.toLocaleString()}</span>
              </div>
              <p className="mt-2 text-[11px] text-white/65 leading-snug">
                When quota is full, breeding joins a fair waitlist. No click
                races.
              </p>
              <div className="mt-2 text-[11px]">
                <span className="text-white/55">Waitlist status: </span>
                <span className="font-bold" style={{ color: GREEN }}>
                  Currently no waitlist
                </span>
              </div>
            </GlassPanel>

            <GlassPanel className="p-4" glow={`${GREEN}22`}>
              <SectionTitle
                icon={<span aria-hidden>⚖️</span>}
                title="Stability Events"
                action={
                  <span
                    className="text-[10px] px-2 py-0.5 rounded-md font-bold"
                    style={{
                      background: "rgba(34,197,94,0.15)",
                      color: GREEN,
                      border: `1px solid ${GREEN}55`,
                    }}
                  >
                    ● Stable
                  </span>
                }
              />
              <div className="text-[11px] text-white/70 mb-2">
                <span className="text-white/55">Active events: </span>
                <span className="font-bold" style={{ color: TEAL }}>
                  None
                </span>
              </div>
              <div className="text-[11px] text-white/70 mb-2">
                <span className="text-white/55">Next scheduled check: </span>
                <span className="font-bold">in {nextCheckHours}h</span>
              </div>
              <p className="text-[11px] text-white/65 leading-snug">
                When the economy runs hot, the game schedules sink events
                (limited cosmetic shops, Reef Renovation contests, themed
                crafting weeks). When cold, bonus reward events.
              </p>
              <div className="mt-2">
                <div className="text-[10px] uppercase tracking-wide text-white/55 mb-1">
                  Past events
                </div>
                <div className="flex flex-col gap-1.5 max-h-32 overflow-y-auto pr-1">
                  {PAST_EVENTS.map((e) => (
                    <div
                      key={e.name}
                      className="rounded-lg px-2 py-1.5"
                      style={{
                        background: "rgba(10,27,61,0.55)",
                        border: `1px solid ${
                          e.kind === "sink" ? `${CORAL}33` : `${TEAL}33`
                        }`,
                      }}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-bold truncate">
                          {e.name}
                        </span>
                        <span
                          className="text-[10px] px-1.5 py-0.5 rounded-md font-bold shrink-0"
                          style={{
                            background:
                              e.kind === "sink"
                                ? `${CORAL}22`
                                : `${TEAL}22`,
                            color: e.kind === "sink" ? CORAL : TEAL,
                          }}
                        >
                          {e.kind === "sink" ? "SINK" : "BONUS"}
                        </span>
                      </div>
                      <div className="text-[10px] text-white/55">
                        {e.range} · {e.effect}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </GlassPanel>
          </div>

          {/* 10. Player distribution */}
          <GlassPanel className="p-4" glow={`${SLATE}22`}>
            <SectionTitle
              icon={<span aria-hidden>👥</span>}
              title="Player distribution"
              action={
                <span className="text-[10px] text-white/55">
                  Gini {gini.toFixed(2)} · target &lt; 0.60
                </span>
              }
            />
            {/* Stacked wealth-tier bar */}
            <div
              className="flex h-4 w-full rounded-full overflow-hidden mb-2"
              style={{ border: "1px solid rgba(124,245,225,0.18)" }}
            >
              {WEALTH_TIERS.map((t) => (
                <div
                  key={t.label}
                  style={{
                    width: `${t.share}%`,
                    background: t.color,
                  }}
                  title={`${t.label} — ${t.share}%`}
                />
              ))}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {WEALTH_TIERS.map((t) => (
                <div
                  key={t.label}
                  className="rounded-lg px-2 py-1.5"
                  style={{
                    background: "rgba(10,27,61,0.55)",
                    border: `1px solid ${t.color}33`,
                  }}
                >
                  <div className="text-[10px] text-white/55 truncate">
                    {t.label}
                  </div>
                  <div
                    className="text-sm font-bold font-display"
                    style={{ color: t.color }}
                  >
                    holds {t.share}%
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-white/65 leading-snug">
              <p>
                Gini {gini.toFixed(2)} (target &lt; 0.60). No single behavior
                type earns &gt; 2.5× median per hour.
              </p>
              <p>
                Econ simulator: 20,000 virtual players over 180 days,
                stress-tested with player doubling, 50% drop, and bot wave — all
                targets met.
              </p>
            </div>
          </GlassPanel>

          {/* ---------- FOOTER ---------- */}
          <div
            className="rounded-2xl px-4 py-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3"
            style={{
              background: "rgba(10,27,61,0.55)",
              border: "1px solid rgba(124,245,225,0.18)",
            }}
          >
            <div className="text-[11px] text-white/65 leading-snug max-w-xl">
              This dashboard is public so players can make informed decisions.
              All formulas are in{" "}
              <code
                className="px-1 rounded"
                style={{
                  background: "rgba(124,245,225,0.12)",
                  color: TEAL,
                }}
              >
                /docs/ECONOMY.md
              </code>
              . The econ simulator is open-source at{" "}
              <span style={{ color: TEAL }}>
                github.com/crabtopia/econ-sim
              </span>
              .
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <GlowButton
                variant="ghost"
                size="sm"
                onClick={onSubscribe}
                title="Subscribe to economy alerts"
              >
                🔔 Subscribe
              </GlowButton>
              <GlowButton variant="teal" size="sm" onClick={onClose}>
                Close
              </GlowButton>
            </div>
          </div>
        </div>
      </div>

      {/* Local keyframe for the auto-refresh pulse dot. */}
      <style>{`
        @keyframes planktonPulse {
          0%, 100% { opacity: 0.55; transform: scale(0.9); }
          50% { opacity: 1; transform: scale(1.15); }
        }
      `}</style>
    </div>
  );
}
