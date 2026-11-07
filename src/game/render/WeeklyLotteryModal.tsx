// Crabtopia - Weekly Lottery modal (self-contained, Glow-Tide + lucky-gold theme)
// Spec: section 4.9 & 10B of crabtopia.txt
// FREE entries only. 1 ticket per daily login, up to 7 per week.
// Tickets cannot be bought, sold, or traded. Not gambling.
// Verifiability: server publishes SHA-256 commitment of the seed BEFORE the
// draw and reveals the seed AFTER the draw, so any player can confirm fairness.
"use client";

import { useEffect, useMemo, useState } from "react";
import { useGame } from "../store/gameStore";
import {
  GlassPanel,
  GlowButton,
  SectionTitle,
  GoldIcon,
  formatGold,
  formatTime,
  CountdownRing,
} from "./ui";
import { FACTIONS } from "../content/factions";

// --- Time helpers (Asia/Jakarta == UTC+7) ---
const JAKARTA_OFFSET = 7 * 60 * 60 * 1000;
const ONE_DAY = 24 * 60 * 60 * 1000;
const DRAW_HOUR_JAKARTA = 20; // 20:00 local Jakarta wall-clock

function nextSundayJakarta8pm(now: number): number {
  const local = now + JAKARTA_OFFSET; // ms since epoch in Jakarta wall-clock
  const startOfToday = Math.floor(local / ONE_DAY) * ONE_DAY;
  const dow = new Date(local).getUTCDay(); // 0 Sun .. 6 Sat in Jakarta
  let daysUntilSunday = (0 - dow + 7) % 7;
  const drawTodayMs = startOfToday + DRAW_HOUR_JAKARTA * 60 * 60 * 1000;
  // If today is Sunday and we're already past 20:00 Jakarta, roll to next week.
  if (daysUntilSunday === 0 && local >= drawTodayMs) daysUntilSunday = 7;
  return drawTodayMs + daysUntilSunday * ONE_DAY - JAKARTA_OFFSET;
}

// --- Mock constants (would come from the server in production) ---
const COMMITTED_HASH =
  "a7c1f3b9d2e84a6c0b1f5e3d7a9c2b4e8f0a1d3c5e7b9d2f4a6c8e0b2d4f6a8"; // 64 hex
const LAST_DRAW_SEED = "1f4a9c8b2e7d3a6f5c0b8e1d4a7f2c9b"; // 32 hex
const LAST_DRAW_HASH =
  "b8d2e4ca1f9b3e7d6a5c4b3e2d1f0a9c8b7e6d5c4b3a2f1e0d9c8b7a6e5d4c3b"; // 64 hex
const LAST_DRAW_DATE = "Sunday, 3 Nov 2024";
const ESTIMATED_TOTAL_ENTRIES = 5000;

// --- Past 4 weekly draws (history) ---
interface PastDraw {
  date: string;
  totalEntries: number;
  winnersCount: number;
  yourResult: "Won" | "Lost";
}
const PAST_DRAWS: PastDraw[] = [
  { date: "Sun 27 Oct 2024", totalEntries: 4821, winnersCount: 564, yourResult: "Lost" },
  { date: "Sun 20 Oct 2024", totalEntries: 4510, winnersCount: 561, yourResult: "Won" },
  { date: "Sun 13 Oct 2024", totalEntries: 4302, winnersCount: 560, yourResult: "Lost" },
  { date: "Sun 6 Oct 2024", totalEntries: 4188, winnersCount: 558, yourResult: "Lost" },
];

// --- Prize tier definitions ---
interface PrizeTier {
  id: string;
  name: string;
  winners: number;
  reward: string;
  gold: number;
  accent: string;
}
const PRIZE_TIERS: PrizeTier[] = [
  {
    id: "grand_tide",
    name: "Grand Tide",
    winners: 1,
    reward: "Pure 18/18 Legendary crab (faction of winner's choice) + Tideswell Crown cosmetic",
    gold: 5000,
    accent: "#FFD166",
  },
  {
    id: "coral_bloom",
    name: "Coral Bloom",
    winners: 3,
    reward: "Rare egg with boosted legendary odds (5%)",
    gold: 1000,
    accent: "#FF6F91",
  },
  {
    id: "shellgift",
    name: "Shellgift",
    winners: 10,
    reward: "Crab rename token",
    gold: 500,
    accent: "#7CF5E1",
  },
  {
    id: "plankton",
    name: "Plankton Prize",
    winners: 50,
    reward: "Plain GOLD payout",
    gold: 100,
    accent: "#B8D869",
  },
  {
    id: "consolation",
    name: "Consolation",
    winners: 500,
    reward: "Tiny thanks-for-playing GOLD",
    gold: 10,
    accent: "#C9D6EE",
  },
];

interface LastWinner {
  rank: number;
  name: string;
  prize: string;
  ticketCount: number;
}

// CSS-only golden shell emblem (scallop + radial ribs)
function GoldenShellEmblem({ size = 64 }: { size?: number }) {
  return (
    <div
      className="relative shrink-0"
      style={{ width: size, height: size, filter: "drop-shadow(0 0 10px rgba(255,209,102,0.55))" }}
      aria-hidden="true"
    >
      {/* outer golden ring */}
      <div
        className="absolute inset-0 rounded-full"
        style={{
          background:
            "conic-gradient(from 35deg, #FFE08A, #FFD166, #FF9D3D, #FFD166, #FFE08A, #FF9D3D, #FFE08A, #FFD166)",
          boxShadow: "inset 0 0 8px rgba(92,40,0,0.45)",
        }}
      />
      {/* inner scalloped shell face */}
      <div
        className="absolute rounded-full"
        style={{
          inset: size * 0.12,
          background:
            "radial-gradient(circle at 50% 35%, #FFF3CC 0%, #FFD166 45%, #C9881A 100%)",
          boxShadow: "inset 0 -2px 6px rgba(92,40,0,0.35)",
        }}
      />
      {/* shell ribs */}
      <svg
        viewBox="0 0 24 24"
        width={size * 0.62}
        height={size * 0.62}
        className="absolute"
        style={{ left: size * 0.19, top: size * 0.19 }}
        fill="none"
        stroke="#8C5A0A"
        strokeLinecap="round"
        strokeWidth={1.4}
      >
        <path d="M12 22 L12 3" opacity={0.75} />
        <path d="M12 22 L7 4" opacity={0.6} />
        <path d="M12 22 L17 4" opacity={0.6} />
        <path d="M12 22 L4 8" opacity={0.45} />
        <path d="M12 22 L20 8" opacity={0.45} />
        <path d="M12 22 L9 3.5" opacity={0.5} />
        <path d="M12 22 L15 3.5" opacity={0.5} />
      </svg>
      {/* center glint */}
      <div
        className="absolute rounded-full"
        style={{
          width: size * 0.16,
          height: size * 0.16,
          left: size * 0.42,
          top: size * 0.3,
          background: "rgba(255,255,255,0.85)",
          filter: "blur(1px)",
        }}
      />
    </div>
  );
}

export default function WeeklyLotteryModal({ onClose }: { onClose: () => void }) {
  const player = useGame((s) => s.player);
  const pushToast = useGame((s) => s.pushToast);

  const playerName = player?.name ?? "Tidewalker";

  // --- Local state (mock; in production this would come from server) ---
  const [tickets, setTickets] = useState(4);
  const maxTicketsPerWeek = 7;
  const [daysClaimedToday, setDaysClaimedToday] = useState(false);
  const [mineEntries, setMineEntries] = useState(4);

  const [nextDrawAt, setNextDrawAt] = useState(() => nextSundayJakarta8pm(Date.now()));
  const [nowTick, setNowTick] = useState(Date.now());

  // Re-compute next draw if the prior slot has passed.
  useEffect(() => {
    if (Date.now() >= nextDrawAt) {
      setNextDrawAt(nextSundayJakarta8pm(Date.now() + 1000));
    }
  }, [nextDrawAt]);

  // 1-second tick so the countdown ring updates.
  useEffect(() => {
    const id = window.setInterval(() => setNowTick(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const committedHash = COMMITTED_HASH;
  const revealedSeed: string | null = null; // upcoming draw has not happened yet
  const lastDrawResult = useMemo<{ winners: LastWinner[]; seed: string; hash: string }>(
    () => ({
      seed: LAST_DRAW_SEED,
      hash: LAST_DRAW_HASH,
      winners: [
        {
          rank: 1,
          name: "Tidecaller Nereus",
          prize: "Grand Tide — Pure 18/18 Legendary + 5,000 GOLD + Tideswell Crown",
          ticketCount: 6,
        },
        {
          rank: 2,
          name: playerName, // mock: current player is a Coral Bloom winner
          prize: "Coral Bloom — Rare egg (5% legendary odds) + 1,000 GOLD",
          ticketCount: 4,
        },
        {
          rank: 3,
          name: "Saltgrip Marisol",
          prize: "Coral Bloom — Rare egg + 1,000 GOLD",
          ticketCount: 3,
        },
        {
          rank: 4,
          name: "Dunevka Shellsong",
          prize: "Shellgift — 500 GOLD + Rename token",
          ticketCount: 5,
        },
        {
          rank: 5,
          name: "Brimshaw Oyston",
          prize: "Shellgift — 500 GOLD + Rename token",
          ticketCount: 2,
        },
      ],
    }),
    [playerName],
  );

  const [showHistory, setShowHistory] = useState(false);

  // --- Derived countdown ---
  const msUntilDraw = Math.max(0, nextDrawAt - nowTick);
  //一周时间窗口用作倒计时环的进度
  const weekWindowMs = 7 * ONE_DAY;
  const progress = 1 - msUntilDraw / weekWindowMs; // 0 -> 1 as draw approaches

  const oddsGrand = (() => {
    if (mineEntries <= 0) return 0;
    // 1 winner out of (estimated total entries / mineEntries) approx
    return 1 / Math.max(1, Math.round(ESTIMATED_TOTAL_ENTRIES / mineEntries));
  })();

  // --- Handlers ---
  function handleClaimDaily() {
    if (daysClaimedToday) return;
    if (tickets >= maxTicketsPerWeek) {
      pushToast({
        title: "Weekly ticket cap reached (7).",
        description: "Come back next week — your existing tickets are already entered.",
        variant: "warning",
      });
      return;
    }
    setTickets((n) => Math.min(maxTicketsPerWeek, n + 1));
    setMineEntries((n) => n + 1);
    setDaysClaimedToday(true);
    pushToast({
      title: "Daily ticket claimed!",
      description: "Come back tomorrow for another free entry.",
      variant: "success",
    });
  }

  async function copyToClipboard(text: string, toastTitle: string) {
    try {
      await navigator.clipboard.writeText(text);
      pushToast({ title: toastTitle, variant: "success" });
    } catch {
      pushToast({ title: "Clipboard unavailable. Long-press to copy.", variant: "error" });
    }
  }

  function handleVerifyYourself() {
    if (!lastDrawResult) return;
    const snippet =
      `sha256("${lastDrawResult.seed}").then(h => ` +
      `console.log(h === "${lastDrawResult.hash}" ? "Fair ✓" : "Tampered ✗"))`;
    copyToClipboard(snippet, "Verification snippet copied to clipboard.");
  }

  const jakartaDrawDateLabel = useMemo(() => {
    // Format the upcoming draw date in Jakarta wall-clock terms.
    const local = nextDrawAt + JAKARTA_OFFSET;
    const d = new Date(local);
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return `${days[d.getUTCDay()]} ${d.getUTCDate()} ${months[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  }, [nextDrawAt]);

  return (
    <div
      className="modal-backdrop-enter fixed inset-0 z-[150] flex items-center justify-center p-3 sm:p-4"
      style={{
        background:
          "radial-gradient(circle at 50% 0%, rgba(255,209,102,0.12) 0%, rgba(6,18,43,0.86) 45%, rgba(6,18,43,0.94) 100%)",
        backdropFilter: "blur(8px)",
      }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="tideswell-lottery-title"
    >
      <div
        className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl"
        style={{
          background:
            "linear-gradient(180deg, rgba(10,27,61,0.96) 0%, rgba(6,18,43,0.98) 100%)",
          border: "1px solid rgba(255,209,102,0.45)",
          boxShadow:
            "0 0 0 1px rgba(255,209,102,0.15), 0 24px 80px rgba(0,0,0,0.6), inset 0 0 40px rgba(255,209,102,0.06)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ---- HEADER BANNER ---- */}
        <div
          className="sticky top-0 z-10 px-5 sm:px-6 pt-5 pb-4"
          style={{
            background:
              "linear-gradient(180deg, rgba(255,209,102,0.10) 0%, rgba(10,27,61,0.0) 100%)",
            borderBottom: "1px solid rgba(255,209,102,0.18)",
          }}
        >
          <div className="flex items-start gap-3 sm:gap-4">
            <GoldenShellEmblem size={64} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h1
                  id="tideswell-lottery-title"
                  className="text-xl sm:text-2xl font-bold leading-tight"
                  style={{
                    fontFamily: "Fredoka, system-ui, sans-serif",
                    color: "#FFD166",
                    textShadow: "0 0 18px rgba(255,209,102,0.4)",
                  }}
                >
                  Tideswell Lottery
                </h1>
                <span
                  className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-md"
                  style={{
                    background: "rgba(255,209,102,0.15)",
                    color: "#FFD166",
                    border: "1px solid rgba(255,209,102,0.4)",
                  }}
                >
                  Free · No Gambling
                </span>
              </div>
              <p className="text-xs sm:text-sm text-white/75 mt-1 leading-snug">
                Free entries only. 1 ticket per daily login. Up to 7 per week.
                Tickets can never be bought, sold, or traded.
              </p>
            </div>
            <button
              onClick={onClose}
              aria-label="Close"
              className="shrink-0 w-8 h-8 flex items-center justify-center rounded-md text-white/60 hover:text-white hover:bg-white/10 transition-colors"
            >
              ✕
            </button>
          </div>

          {/* Tickets counter + claim button */}
          <div className="mt-4 flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between">
            <div className="flex items-center gap-2 flex-wrap">
              <div
                className="rounded-xl px-3 py-1.5"
                style={{
                  background: "rgba(255,209,102,0.10)",
                  border: "1px solid rgba(255,209,102,0.35)",
                }}
              >
                <div className="text-[10px] uppercase tracking-wide text-white/60 leading-tight">
                  Your tickets
                </div>
                <div className="text-base font-bold leading-tight" style={{ color: "#FFD166" }}>
                  {tickets} <span className="text-white/50 text-xs">/ {maxTicketsPerWeek} this week</span>
                </div>
              </div>
              <div className="flex gap-0.5" aria-hidden="true">
                {Array.from({ length: maxTicketsPerWeek }).map((_, i) => (
                  <span
                    key={i}
                    className="text-base"
                    style={{
                      filter: i < tickets ? "drop-shadow(0 0 4px rgba(255,209,102,0.55))" : "grayscale(1)",
                      opacity: i < tickets ? 1 : 0.35,
                    }}
                  >
                    🎫
                  </span>
                ))}
              </div>
            </div>

            {daysClaimedToday ? (
              <GlowButton variant="ghost" disabled size="md" className="cursor-default">
                ✓ Claimed today
              </GlowButton>
            ) : (
              <GlowButton
                variant="gold"
                size="md"
                onClick={handleClaimDaily}
                disabled={tickets >= maxTicketsPerWeek}
                title={
                  tickets >= maxTicketsPerWeek
                    ? "Weekly cap reached (7)."
                    : "Claim your free daily ticket."
                }
              >
                🎫 Claim today's free ticket
              </GlowButton>
            )}
          </div>
        </div>

        {/* ---- BODY ---- */}
        <div className="px-5 sm:px-6 py-5 space-y-5">
          {/* ===== NEXT DRAW ===== */}
          <section>
            <SectionTitle
              icon={<span style={{ color: "#FFD166" }}>⏳</span>}
              title="Next Draw"
            />
            <GlassPanel className="p-4" glow="rgba(255,209,102,0.15)">
              <div className="flex items-center gap-4">
                <CountdownRing
                  progress={progress}
                  size={64}
                  stroke={6}
                  color="#FFD166"
                  glow
                  label={
                    <span className="text-[10px] font-bold" style={{ color: "#FFD166" }}>
                      {formatTime(msUntilDraw)}
                    </span>
                  }
                />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-bold text-white/90">
                    Next draw: Sunday 20:00 (Asia/Jakarta)
                  </div>
                  <div className="text-xs text-white/65 mt-0.5">
                    {jakartaDrawDateLabel} · in{" "}
                    <span style={{ color: "#FFD166", fontWeight: 700 }}>
                      {formatTime(msUntilDraw)}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                    <span className="text-[10px] uppercase tracking-wide text-white/55">
                      Your entries in next draw:
                    </span>
                    <span className="text-sm font-bold" style={{ color: "#FFD166" }}>
                      {mineEntries}
                    </span>
                    <span className="flex gap-0.5" aria-hidden="true">
                      {Array.from({ length: Math.min(mineEntries, 7) }).map((_, i) => (
                        <span
                          key={i}
                          className="text-xs"
                          style={{ filter: "drop-shadow(0 0 3px rgba(255,209,102,0.55))" }}
                        >
                          🎫
                        </span>
                      ))}
                    </span>
                  </div>
                </div>
              </div>

              {/* Committed hash block */}
              <div className="mt-4">
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="text-[10px] uppercase tracking-wide text-white/55">
                    Server seed commitment (SHA-256)
                  </span>
                  <span
                    className="text-[9px] px-1 py-0.5 rounded"
                    style={{
                      background: "rgba(124,245,225,0.12)",
                      color: "#7CF5E1",
                      border: "1px solid rgba(124,245,225,0.3)",
                    }}
                    title="This hash was published before the draw. The seed will be revealed after the draw so you can verify the result was fair."
                  >
                    published pre-draw
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <code
                    className="text-[10px] sm:text-xs font-mono break-all leading-snug px-2 py-1.5 rounded-md flex-1"
                    style={{
                      background: "rgba(0,0,0,0.35)",
                      border: "1px solid rgba(124,245,225,0.18)",
                      color: "#7CF5E1",
                    }}
                  >
                    {committedHash}
                  </code>
                  <GlowButton
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      copyToClipboard(committedHash, "Committed hash copied to clipboard.")
                    }
                    title="Copy committed hash"
                  >
                    Copy
                  </GlowButton>
                </div>
                <p className="text-[10px] text-white/45 mt-1.5 leading-snug">
                  This hash was published before the draw. The seed will be revealed after the
                  draw so you can verify the result was fair.
                </p>
                {revealedSeed && (
                  <div className="mt-2 text-[10px] font-mono text-white/70">
                    Revealed seed: {revealedSeed}
                  </div>
                )}
              </div>
            </GlassPanel>
          </section>

          {/* ===== PRIZE TIERS ===== */}
          <section>
            <SectionTitle
              icon={<span style={{ color: "#FFD166" }}>🏆</span>}
              title="Prize Tiers"
              action={
                <span className="text-[10px] text-white/55">
                  611 winners · 5,890 GOLD total
                </span>
              }
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {PRIZE_TIERS.map((tier) => (
                <GlassPanel
                  key={tier.id}
                  className="p-3"
                  glow={`rgba(255,209,102,0.08)`}
                  style={{ borderColor: tier.accent + "55" }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div
                        className="text-sm font-bold leading-tight"
                        style={{ color: tier.accent }}
                      >
                        {tier.name}
                      </div>
                      <div className="text-[10px] uppercase tracking-wide text-white/55 mt-0.5">
                        {tier.winners.toLocaleString()} winner{tier.winners === 1 ? "" : "s"}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <GoldIcon size={14} />
                      <span className="text-xs font-bold" style={{ color: "#FFD166" }}>
                        {formatGold(tier.gold)}
                      </span>
                    </div>
                  </div>
                  <p className="text-[11px] text-white/70 mt-1.5 leading-snug">
                    {tier.reward}
                  </p>
                  {tier.id === "grand_tide" && (
                    <div className="mt-2 flex items-center gap-1 flex-wrap">
                      <span className="text-[9px] uppercase text-white/45">Faction of choice:</span>
                      {Object.values(FACTIONS).map((f) => (
                        <span
                          key={f.id}
                          className="text-sm"
                          title={f.name}
                          aria-label={f.name}
                        >
                          {f.emblem}
                        </span>
                      ))}
                    </div>
                  )}
                </GlassPanel>
              ))}
            </div>

            <div
              className="mt-3 rounded-xl px-3 py-2 text-xs text-white/75"
              style={{
                background: "rgba(255,209,102,0.06)",
                border: "1px solid rgba(255,209,102,0.25)",
              }}
            >
              <span className="font-bold" style={{ color: "#FFD166" }}>
                Total prize pool:
              </span>{" "}
              1 pure legendary crab · 3 rare eggs · 5,890 GOLD · 10 cosmetics · 611 winners.
            </div>
            <p className="text-[10px] text-white/55 mt-2 leading-snug">
              Odds depend on entries. With {mineEntries} ticket{mineEntries === 1 ? "" : "s"} out
              of an estimated {ESTIMATED_TOTAL_ENTRIES.toLocaleString()} total entries, your
              chance of Grand Tide is roughly{" "}
              <span style={{ color: "#FFD166", fontWeight: 700 }}>
                1 in {Math.round(1 / Math.max(oddsGrand, 1e-6)).toLocaleString()}
              </span>
              .
            </p>
          </section>

          {/* ===== LAST DRAW VERIFIABILITY ===== */}
          {lastDrawResult && (
            <section>
              <SectionTitle
                icon={<span style={{ color: "#7CF5E1" }}>🔓</span>}
                title="Past Draw · Verifiability"
              />
              <GlassPanel className="p-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="text-sm font-bold text-white/90">
                    Last draw — <span className="text-white/70">{LAST_DRAW_DATE}</span>
                  </div>
                  <span
                    className="text-[10px] font-bold px-2 py-0.5 rounded-md"
                    style={{
                      background: "rgba(76,200,120,0.15)",
                      color: "#5CFFB0",
                      border: "1px solid rgba(76,200,120,0.4)",
                    }}
                  >
                    ✓ Hash matches commitment
                  </span>
                </div>

                <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div
                    className="rounded-md px-2 py-1.5"
                    style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(124,245,225,0.18)" }}
                  >
                    <div className="text-[9px] uppercase tracking-wide text-white/50">
                      Revealed seed
                    </div>
                    <code className="text-[10px] font-mono break-all" style={{ color: "#7CF5E1" }}>
                      {lastDrawResult.seed}
                    </code>
                  </div>
                  <div
                    className="rounded-md px-2 py-1.5"
                    style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(124,245,225,0.18)" }}
                  >
                    <div className="text-[9px] uppercase tracking-wide text-white/50">
                      Committed hash (SHA-256)
                    </div>
                    <code className="text-[10px] font-mono break-all" style={{ color: "#7CF5E1" }}>
                      {lastDrawResult.hash}
                    </code>
                  </div>
                </div>

                {/* Winners list */}
                <div className="mt-3">
                  <div className="text-[10px] uppercase tracking-wide text-white/55 mb-1.5">
                    Top winners
                  </div>
                  <div className="max-h-56 overflow-y-auto pr-1 space-y-1.5" style={{ scrollbarWidth: "thin" }}>
                    {lastDrawResult.winners.map((w) => {
                      const isYou = w.name === playerName;
                      return (
                        <div
                          key={w.rank}
                          className="flex items-center gap-2 px-2 py-1.5 rounded-lg"
                          style={{
                            background: isYou ? "rgba(255,209,102,0.14)" : "rgba(255,255,255,0.03)",
                            border: isYou
                              ? "1px solid rgba(255,209,102,0.55)"
                              : "1px solid rgba(255,255,255,0.06)",
                          }}
                        >
                          <span
                            className="shrink-0 w-6 h-6 flex items-center justify-center rounded-md text-[11px] font-bold"
                            style={{
                              background: "rgba(255,209,102,0.15)",
                              color: "#FFD166",
                              border: "1px solid rgba(255,209,102,0.35)",
                            }}
                          >
                            #{w.rank}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="text-xs font-bold text-white/90 truncate">
                              {w.name}
                              {isYou && (
                                <span
                                  className="ml-1.5 text-[9px] uppercase font-bold px-1 py-0.5 rounded"
                                  style={{
                                    background: "rgba(255,209,102,0.25)",
                                    color: "#FFD166",
                                  }}
                                >
                                  You
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] text-white/60 truncate">{w.prize}</div>
                          </div>
                          <span className="shrink-0 text-[10px] text-white/55">
                            🎫 × {w.ticketCount}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="mt-3 flex items-center justify-end">
                  <GlowButton
                    variant="teal"
                    size="sm"
                    onClick={handleVerifyYourself}
                    title="Copy a JS snippet that re-hashes the seed and checks it against the committed hash."
                  >
                    🔍 Verify yourself
                  </GlowButton>
                </div>
              </GlassPanel>
            </section>
          )}

          {/* ===== PAST 4 DRAWS (COLLAPSIBLE) ===== */}
          <section>
            <button
              onClick={() => setShowHistory((v) => !v)}
              className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-sm font-bold"
              style={{
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(124,245,225,0.18)",
                color: "#EAF6FF",
              }}
              aria-expanded={showHistory}
            >
              <span className="flex items-center gap-1.5">
                <span style={{ color: "#7CF5E1" }}>📜</span>
                Past 4 draws history
              </span>
              <span className="text-white/55 text-xs">{showHistory ? "▲ Hide" : "▼ Show"}</span>
            </button>
            {showHistory && (
              <div className="mt-2 space-y-1.5">
                {PAST_DRAWS.map((d) => (
                  <div
                    key={d.date}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs"
                    style={{
                      background: "rgba(255,255,255,0.03)",
                      border: "1px solid rgba(255,255,255,0.06)",
                    }}
                  >
                    <span className="font-bold text-white/85 shrink-0">{d.date}</span>
                    <span className="text-white/55">
                      · {d.totalEntries.toLocaleString()} entries · {d.winnersCount} winners
                    </span>
                    <span
                      className="ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded-md"
                      style={
                        d.yourResult === "Won"
                          ? {
                              background: "rgba(255,209,102,0.18)",
                              color: "#FFD166",
                              border: "1px solid rgba(255,209,102,0.45)",
                            }
                          : {
                              background: "rgba(255,255,255,0.05)",
                              color: "rgba(255,255,255,0.55)",
                              border: "1px solid rgba(255,255,255,0.08)",
                            }
                      }
                    >
                      {d.yourResult === "Won" ? "Won ✓" : "Lost"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* ---- FOOTER ---- */}
        <footer
          className="px-5 sm:px-6 py-4 mt-1"
          style={{
            borderTop: "1px solid rgba(255,209,102,0.18)",
            background: "rgba(255,209,102,0.04)",
          }}
        >
          <p className="text-[11px] text-white/65 leading-snug">
            <span className="font-bold" style={{ color: "#FFD166" }}>
              Lottery is 100% free.
            </span>{" "}
            No paid entries. No tickets can be bought, sold, or traded. This is not gambling —
            entries cost nothing and have no real-money value.
          </p>
          <p className="text-[10px] text-white/45 mt-1.5 leading-snug">
            Winners are drawn from a SHA-256 hash of{" "}
            <code className="font-mono" style={{ color: "#7CF5E1" }}>(committed_seed + entry_id)</code>.
            Full source code is in <code className="font-mono">/packages/sim</code>.
          </p>
          <div className="mt-3 flex justify-end">
            <GlowButton variant="ghost" size="md" onClick={onClose}>
              Close
            </GlowButton>
          </div>
        </footer>
      </div>
    </div>
  );
}
