// Crabtopia - Daily Rewards modal ("Tidewell Rewards") — forgiving login streaks.
// Self-contained Glow-Tide modal with gold accents. All streak/calendar data is
// mocked locally; claims wire into the live game store (addGold / addXp / pushToast).
//
// Mount example:
//   import DailyRewardsModal from "../render/DailyRewardsModal";
//   {showDaily && <DailyRewardsModal onClose={() => setShowDaily(false)} />}
"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { useGame } from "../store/gameStore";
import {
  GlassPanel,
  GlowButton,
  GoldIcon,
  StatChip,
  SectionTitle,
  CountdownRing,
  formatGold,
  formatTime,
} from "./ui";

// ---------------- Types ----------------

type StreakTier = "ember" | "flame" | "blaze" | "inferno" | "tidal";

interface DayReward {
  day: number; // 1..7 position in the weekly cycle
  gold: number; // GOLD granted on claim
  xp: number; // bonus Shellwarden XP (0 = none)
  extras: string[]; // extra perk lines ("+ Rename Token", etc.)
  summary: string; // compact description used in toasts / CTA
}

interface TierInfo {
  id: StreakTier;
  name: string;
  icon: string;
  range: string;
  color: string;
  perks: string;
}

// ---------------- Helpers ----------------

// Asia/Jakarta is UTC+7 — the daily reset happens at Jakarta midnight.
const JAKARTA_OFFSET_MS = 7 * 60 * 60 * 1000;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function nextJakartaMidnight(now: number): number {
  const local = now + JAKARTA_OFFSET_MS;
  const startOfToday = Math.floor(local / ONE_DAY_MS) * ONE_DAY_MS;
  return startOfToday + ONE_DAY_MS - JAKARTA_OFFSET_MS;
}

function tierForStreak(s: number): StreakTier {
  if (s >= 30) return "tidal";
  if (s >= 14) return "inferno";
  if (s >= 7) return "blaze";
  if (s >= 4) return "flame";
  return "ember";
}

// ---------------- Mock data (self-contained) ----------------

// 7-day escalating reward track; the cycle repeats every 7 days while the streak keeps counting.
const REWARD_TRACK: DayReward[] = [
  { day: 1, gold: 100, xp: 0, extras: [], summary: "100 GOLD" },
  { day: 2, gold: 150, xp: 0, extras: [], summary: "150 GOLD" },
  { day: 3, gold: 200, xp: 50, extras: [], summary: "200 GOLD + 50 XP" },
  { day: 4, gold: 300, xp: 0, extras: [], summary: "300 GOLD" },
  { day: 5, gold: 400, xp: 0, extras: ["+ Rename Token ✏️"], summary: "400 GOLD + Rename Token" },
  { day: 6, gold: 500, xp: 0, extras: [], summary: "500 GOLD" },
  {
    day: 7,
    gold: 750,
    xp: 250,
    extras: ["+ Common Egg 🥚", "+ Style: Shell Trail ✨"],
    summary: "750 GOLD + 250 XP + Common Egg + Shell Trail style",
  },
];

const TIERS: TierInfo[] = [
  { id: "ember", name: "Ember", icon: "🔸", range: "1-3 days", color: "#FB923C", perks: "+5% dive rewards" },
  { id: "flame", name: "Flame", icon: "🔥", range: "4-6 days", color: "#FF6B35", perks: "+10% dive rewards" },
  { id: "blaze", name: "Blaze", icon: "🌋", range: "7-13 days", color: "#F87171", perks: "+10% dive + 1 free lottery ticket/day" },
  { id: "inferno", name: "Inferno", icon: "☄️", range: "14-29 days", color: "#A78BFA", perks: "+15% dive + 2 lottery tickets + 5% Coliseum XP" },
  { id: "tidal", name: "Tidal", icon: "🌊", range: "30+ days", color: "#2DD4BF", perks: "+20% all rewards + weekly rare egg discount" },
];

// Mini-calendar mock: November 2025 (Nov 1 = Saturday, 30 days, Sunday-first grid).
// Story: streak 5 = Nov 22-25 claimed + today (26). Misses on 13 / 20 / 21 dropped
// one tier each; the Nov 19 miss was absorbed by a Streak Shield.
const CAL_WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const CAL_LEADING_BLANKS = 6;
const CAL_DAYS = 30;
const CAL_TODAY = 26;
const CAL_CLAIMED = new Set<number>([
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 15, 16, 17, 18, 22, 23, 24, 25,
]);
const CAL_MISSED = new Set<number>([13, 19, 20, 21]);
const CAL_SHIELDED = new Set<number>([19]);

// Keyframes + custom scrollbars (scoped via drm- prefix, injected once per mount).
const KEYFRAMES_CSS = `
@keyframes drm-daypulse {
  0%, 100% { border-color: rgba(45,212,191,0.95); box-shadow: 0 0 16px rgba(45,212,191,0.5); }
  50% { border-color: rgba(45,212,191,0.4); box-shadow: 0 0 5px rgba(45,212,191,0.18); }
}
@keyframes drm-glow {
  0%, 100% { box-shadow: 0 0 16px rgba(255,209,102,0.45); }
  50% { box-shadow: 0 0 34px rgba(255,209,102,0.85); }
}
@keyframes drm-todaydot {
  0%, 100% { box-shadow: 0 0 0 0 rgba(45,212,191,0.6); }
  50% { box-shadow: 0 0 0 4px rgba(45,212,191,0); }
}
.drm-scroll { scrollbar-width: thin; scrollbar-color: rgba(18,167,160,0.55) rgba(10,27,61,0.4); }
.drm-scroll::-webkit-scrollbar { width: 8px; }
.drm-scroll::-webkit-scrollbar-track { background: rgba(10,27,61,0.4); border-radius: 8px; }
.drm-scroll::-webkit-scrollbar-thumb { background: rgba(18,167,160,0.55); border-radius: 8px; }
.drm-track { scrollbar-width: thin; scrollbar-color: rgba(255,209,102,0.4) transparent; }
.drm-track::-webkit-scrollbar { height: 6px; }
.drm-track::-webkit-scrollbar-thumb { background: rgba(255,209,102,0.4); border-radius: 6px; }
.drm-today-dot { animation: drm-todaydot 1.8s ease-in-out infinite; }
`;

// ---------------- Day card (one cell of the 7-day track) ----------------

function DayCard({
  reward,
  state,
  isDay7,
  onClaim,
}: {
  reward: DayReward;
  state: "claimed" | "today" | "locked";
  isDay7: boolean;
  onClaim: () => void;
}) {
  const style: CSSProperties = isDay7
    ? {
        // Weekly milestone: bigger card with a permanent golden glow.
        background: "linear-gradient(160deg, rgba(255,209,102,0.16) 0%, rgba(255,122,26,0.10) 100%)",
        border: "1.5px solid rgba(255,209,102,0.65)",
        animation: "drm-glow 2.4s ease-in-out infinite",
      }
    : {
        background: "rgba(10,27,61,0.55)",
        border: "1px solid rgba(124,245,225,0.16)",
      };

  if (state === "claimed") {
    style.background = "rgba(255,209,102,0.10)";
    style.border = "1px solid rgba(255,209,102,0.5)";
    style.animation = undefined;
  } else if (state === "today") {
    style.background = "rgba(45,212,191,0.10)";
    style.border = "1.5px solid rgba(45,212,191,0.9)";
    style.animation = "drm-daypulse 1.6s ease-in-out infinite";
  } else if (!isDay7) {
    // Locked (day 7 stays glowy even when locked — the prize on the horizon).
    style.opacity = 0.55;
    style.border = "1px dashed rgba(124,245,225,0.22)";
  }

  return (
    <div
      className={`relative shrink-0 rounded-xl p-2 flex flex-col items-center text-center gap-1 w-[82px] sm:w-[92px] ${
        isDay7 ? "w-[128px] sm:w-[148px] min-h-[172px]" : "min-h-[152px]"
      }`}
      style={style}
      aria-label={`Day ${reward.day} reward: ${reward.summary}`}
    >
      {state === "claimed" && (
        <span
          className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold"
          style={{
            background: "linear-gradient(135deg, #FFD166, #FF7A1A)",
            color: "#0A1B3D",
            boxShadow: "0 2px 8px rgba(255,209,102,0.55)",
          }}
          title="Claimed"
        >
          ✓
        </span>
      )}
      {state === "today" && (
        <span
          className="absolute -top-1.5 left-1/2 -translate-x-1/2 px-1.5 py-0.5 rounded-md text-[8px] font-bold tracking-widest whitespace-nowrap"
          style={{ background: "#2DD4BF", color: "#04122B", boxShadow: "0 2px 8px rgba(45,212,191,0.5)" }}
        >
          TODAY
        </span>
      )}
      {isDay7 && (
        <div className="text-[8px] font-bold tracking-wide" style={{ color: "#FFD166" }}>
          ★ WEEKLY MILESTONE ★
        </div>
      )}
      <div className="text-[9px] uppercase tracking-wider font-bold text-white/60">Day {reward.day}</div>
      <div
        className="flex items-center justify-center gap-1 font-bold leading-none"
        style={{ fontSize: isDay7 ? 15 : 12, color: state === "claimed" ? "rgba(255,209,102,0.75)" : "#FFD166" }}
      >
        <GoldIcon size={isDay7 ? 15 : 12} />
        {formatGold(reward.gold)}
      </div>
      {reward.xp > 0 && (
        <div className="text-[9px] font-bold" style={{ color: "#7CF5E1" }}>
          +{reward.xp} XP
        </div>
      )}
      {reward.extras.map((ex) => (
        <div key={ex} className="text-[8px] leading-tight text-white/70">
          {ex}
        </div>
      ))}
      <div className="mt-auto w-full pt-1.5">
        {state === "claimed" && (
          <div className="text-[9px] font-bold" style={{ color: "rgba(255,209,102,0.85)" }}>
            ✓ Claimed
          </div>
        )}
        {state === "today" && (
          <GlowButton variant="gold" size="sm" className="w-full" onClick={onClaim}>
            Claim
          </GlowButton>
        )}
        {state === "locked" && (
          <div className="text-sm" aria-label="Locked">
            🔒
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------- Main modal ----------------

export default function DailyRewardsModal({ onClose }: { onClose: () => void }) {
  const player = useGame((s) => s.player);
  const addGold = useGame((s) => s.addGold);
  const addXp = useGame((s) => s.addXp);
  const pushToast = useGame((s) => s.pushToast);

  // ---- Mock streak state (self-contained demo data) ----
  const [streak] = useState(5);
  const [bestStreak] = useState(23);
  const [streakShields] = useState(1); // 1 shield charge per month
  const [claimedToday, setClaimedToday] = useState(false);

  // ---- Live countdown to the next Asia/Jakarta midnight ----
  const [nextResetAt] = useState<number>(() => nextJakartaMidnight(Date.now()));
  const [now, setNow] = useState<number>(() => Date.now());

  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);

  // Escape closes the modal.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // ---- Derived values ----
  const streakTier = tierForStreak(streak);
  const tierInfo = TIERS.find((t) => t.id === streakTier) ?? TIERS[0];
  const cycleDay = ((streak - 1) % 7) + 1; // position in the current 7-day cycle
  const todayReward = REWARD_TRACK[cycleDay - 1];
  const remainingMs = Math.max(0, nextResetAt - now);
  const dayProgress = Math.min(1, Math.max(0, 1 - remainingMs / ONE_DAY_MS));

  function handleClaim() {
    if (claimedToday) return;
    addGold(todayReward.gold);
    if (todayReward.xp > 0) addXp(todayReward.xp);
    setClaimedToday(true);
    pushToast({
      title: `Day ${todayReward.day} claimed: ${todayReward.summary}!`,
      description: "Streak secured. Next reward unlocks at Jakarta midnight.",
      variant: "success",
    });
  }

  return (
    <div
      className="modal-backdrop-enter fixed inset-0 z-[150] flex items-center justify-center p-3 sm:p-4"
      style={{ background: "rgba(4,12,32,0.78)", backdropFilter: "blur(10px)" }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="daily-rewards-title"
    >
      <style>{KEYFRAMES_CSS}</style>
      <div
        className="drm-scroll relative w-full max-w-2xl max-h-[88vh] overflow-y-auto rounded-2xl"
        style={{
          background: "linear-gradient(170deg, #06122B 0%, #0A1B3D 55%, #051028 100%)",
          border: "1px solid rgba(255,209,102,0.45)",
          boxShadow:
            "0 16px 70px rgba(18,167,160,0.32), 0 0 42px rgba(255,209,102,0.14), inset 0 0 0 1px rgba(255,209,102,0.08)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ---------- Sticky header ---------- */}
        <div
          className="sticky top-0 z-10 px-4 sm:px-6 pt-4 pb-3"
          style={{
            background: "linear-gradient(180deg, #06122B 78%, rgba(6,18,43,0))",
            borderBottom: "1px solid rgba(255,209,102,0.2)",
          }}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-xl shrink-0" aria-hidden>
                🌊
              </span>
              <h2
                id="daily-rewards-title"
                className="font-display text-lg sm:text-xl font-bold truncate"
                style={{ color: "#FFD166", textShadow: "0 0 12px rgba(255,209,102,0.4)" }}
              >
                Tidewell Rewards
              </h2>
            </div>
            <button
              onClick={onClose}
              aria-label="Close daily rewards"
              className="text-white/60 hover:text-white w-8 h-8 shrink-0 flex items-center justify-center rounded-md hover:bg-white/10 transition-colors"
            >
              ✕
            </button>
          </div>

          <p className="mt-1 text-[11px] sm:text-xs text-white/65 leading-relaxed">
            Check in daily for GOLD, XP, and style rewards. Forgiving streaks — miss a day and you only
            drop one tier, not to zero.
          </p>

          {/* Streak hero + countdown */}
          <div className="mt-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <span className="text-4xl leading-none shrink-0" role="img" aria-label="streak flame">
                🔥
              </span>
              <div className="min-w-0">
                <div className="flex items-baseline gap-2">
                  <span
                    className="text-4xl font-bold font-display leading-none"
                    style={{ color: "#FFD166", textShadow: `0 0 18px ${tierInfo.color}80` }}
                  >
                    {streak}
                  </span>
                  <span className="text-[9px] uppercase tracking-[0.2em] text-white/55 font-bold">
                    day streak
                  </span>
                </div>
                <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                  <span
                    className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide"
                    style={{
                      background: `${tierInfo.color}22`,
                      color: tierInfo.color,
                      border: `1px solid ${tierInfo.color}66`,
                    }}
                  >
                    {tierInfo.icon} {tierInfo.name} Tier
                  </span>
                  <span className="text-[10px] text-white/60 font-semibold">
                    Best: {bestStreak} days · Shields: {streakShields}/1
                  </span>
                </div>
              </div>
            </div>

            {/* Countdown to next claim */}
            <div
              className="flex items-center gap-3 rounded-xl px-3 py-2 shrink-0"
              style={{ background: "rgba(10,27,61,0.6)", border: "1px solid rgba(255,209,102,0.25)" }}
            >
              <CountdownRing
                progress={dayProgress}
                size={52}
                stroke={5}
                color="#FFD166"
                glow
                label={<span className="text-[9px]">{Math.floor(remainingMs / 3_600_000)}h</span>}
              />
              <div className="min-w-0">
                <div className="text-[11px] font-bold" style={{ color: "#7CF5E1" }}>
                  Next reward resets in {formatTime(remainingMs)}
                </div>
                <div className="text-[9px] text-white/45">Midnight · Asia/Jakarta (GMT+7)</div>
              </div>
            </div>
          </div>

          {/* Live player chips */}
          {player && (
            <div className="mt-3 flex flex-wrap gap-2">
              <StatChip
                label="Gold"
                value={formatGold(player.gold)}
                color="#FFD166"
                icon={<GoldIcon size={13} />}
              />
              <StatChip
                label="Shellwarden"
                value={`Lv ${player.shellwardenLevel}`}
                color="#7CF5E1"
                icon={
                  <span className="text-[10px]" aria-hidden>
                    🦀
                  </span>
                }
              />
              <StatChip
                label="Cycle Day"
                value={`${cycleDay} / 7`}
                color={tierInfo.color}
                icon={
                  <span className="text-[10px]" aria-hidden>
                    🗓️
                  </span>
                }
              />
            </div>
          )}
        </div>

        {/* ---------- Body ---------- */}
        <div className="px-4 sm:px-6 py-4 space-y-6">
          {/* ===== 7-day reward track ===== */}
          <section aria-label="7-day reward track">
            <SectionTitle
              icon={
                <span aria-hidden>
                  <span className="text-xs">🗓️</span>
                </span>
              }
              title="7-Day Reward Track"
              action={<span className="text-[10px] text-white/45">Cycle repeats every 7 days</span>}
            />
            <div
              className="drm-track flex items-stretch gap-2 overflow-x-auto p-2 pt-3 rounded-xl"
              style={{ background: "rgba(10,27,61,0.35)", border: "1px solid rgba(124,245,225,0.12)" }}
            >
              {REWARD_TRACK.map((r) => {
                const state: "claimed" | "today" | "locked" =
                  r.day === cycleDay ? (claimedToday ? "claimed" : "today") : r.day < cycleDay ? "claimed" : "locked";
                return (
                  <DayCard
                    key={r.day}
                    reward={r}
                    state={state}
                    isDay7={r.day === 7}
                    onClaim={handleClaim}
                  />
                );
              })}
            </div>
            <p className="mt-2 text-[10px] text-white/50 leading-relaxed">
              🔄 Day 8 wraps back to Day 1 rewards — but your streak keeps counting toward Tidal (30+).
            </p>

            {/* Primary claim CTA (big touch target) */}
            {!claimedToday ? (
              <GlassPanel className="mt-3 p-3 sm:p-4 flex items-center justify-between gap-3" glow="rgba(255,209,102,0.18)">
                <div className="min-w-0">
                  <div className="text-[10px] uppercase tracking-wide text-white/50 font-bold">
                    Today&apos;s reward — Day {cycleDay} of cycle
                  </div>
                  <div className="text-sm sm:text-base font-bold mt-0.5 truncate" style={{ color: "#FFD166" }}>
                    {todayReward.summary}
                  </div>
                </div>
                <GlowButton variant="gold" size="lg" onClick={handleClaim} className="shrink-0">
                  Claim Reward
                </GlowButton>
              </GlassPanel>
            ) : (
              <GlassPanel className="mt-3 p-3 sm:p-4 flex items-center gap-3">
                <span
                  className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
                  style={{ background: "linear-gradient(135deg, #FFD166, #FF7A1A)", color: "#0A1B3D" }}
                  aria-hidden
                >
                  ✓
                </span>
                <div className="min-w-0">
                  <div className="text-sm font-bold" style={{ color: "#FFD166" }}>
                    Day {cycleDay} claimed today!
                  </div>
                  <div className="text-[11px] text-white/60">
                    Next reward unlocks in {formatTime(remainingMs)} — the tide rewards patience.
                  </div>
                </div>
              </GlassPanel>
            )}
          </section>

          {/* ===== Streak tier benefits ===== */}
          <section aria-label="Streak tier benefits">
            <SectionTitle
              icon={
                <span aria-hidden>
                  <span className="text-xs">⚡</span>
                </span>
              }
              title="Streak Tier Benefits"
            />
            <GlassPanel className="p-2.5 sm:p-3 space-y-1.5">
              {TIERS.map((t) => {
                const current = t.id === streakTier;
                return (
                  <div
                    key={t.id}
                    className="flex items-center gap-2.5 sm:gap-3 rounded-xl px-2.5 py-2"
                    style={{
                      background: current
                        ? `linear-gradient(90deg, ${t.color}26, rgba(10,27,61,0.55) 70%)`
                        : "rgba(10,27,61,0.45)",
                      border: `1px solid ${current ? `${t.color}aa` : "rgba(124,245,225,0.13)"}`,
                      boxShadow: current ? `0 0 16px ${t.color}40` : undefined,
                    }}
                  >
                    <span
                      className="w-8 h-8 sm:w-9 sm:h-9 shrink-0 rounded-lg flex items-center justify-center text-base sm:text-lg"
                      style={{ background: `${t.color}1f`, border: `1px solid ${t.color}55` }}
                      aria-hidden
                    >
                      {t.icon}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-bold" style={{ color: t.color }}>
                          {t.name}
                        </span>
                        <span className="text-[10px] text-white/50 font-semibold">{t.range}</span>
                        {current && (
                          <span
                            className="px-1.5 py-0.5 rounded-md text-[8px] font-bold tracking-widest"
                            style={{ background: "#FFD166", color: "#0A1B3D" }}
                          >
                            ▼ YOU ARE HERE
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-white/75 leading-snug mt-0.5">{t.perks}</div>
                    </div>
                  </div>
                );
              })}
            </GlassPanel>
          </section>

          {/* ===== Forgiveness explainer ===== */}
          <section aria-label="How forgiving streaks work">
            <SectionTitle
              icon={
                <span aria-hidden>
                  <span className="text-xs">🛟</span>
                </span>
              }
              title="How Forgiving Streaks Work"
            />
            <GlassPanel className="p-3 sm:p-4">
              <ul className="space-y-2.5">
                <li className="flex items-start gap-2.5">
                  <span
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-sm shrink-0"
                    style={{ background: "rgba(255,111,145,0.12)", border: "1px solid rgba(255,111,145,0.35)" }}
                    aria-hidden
                  >
                    ⏭️
                  </span>
                  <p className="text-[11px] sm:text-xs text-white/75 leading-relaxed">
                    Miss a day → your streak drops just{" "}
                    <strong style={{ color: "#FFD166" }}>ONE tier</strong> (e.g., Blaze 7 → Flame 6), never to
                    zero.
                  </p>
                </li>
                <li className="flex items-start gap-2.5">
                  <span
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-sm shrink-0"
                    style={{ background: "rgba(255,209,102,0.12)", border: "1px solid rgba(255,209,102,0.35)" }}
                    aria-hidden
                  >
                    🛡️
                  </span>
                  <p className="text-[11px] sm:text-xs text-white/75 leading-relaxed">
                    Streak Shield (1/month) → protects a missed day completely. Earned at 7-day monthly
                    activity.
                  </p>
                </li>
                <li className="flex items-start gap-2.5">
                  <span
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-sm shrink-0"
                    style={{ background: "rgba(124,245,225,0.1)", border: "1px solid rgba(124,245,225,0.3)" }}
                    aria-hidden
                  >
                    🏆
                  </span>
                  <p className="text-[11px] sm:text-xs text-white/75 leading-relaxed">
                    Best streak is remembered forever for bragging rights.
                  </p>
                </li>
              </ul>
            </GlassPanel>
          </section>

          {/* ===== Calendar mini-view ===== */}
          <section aria-label="Monthly check-in calendar">
            <SectionTitle
              icon={
                <span aria-hidden>
                  <span className="text-xs">📅</span>
                </span>
              }
              title="This Month — November 2025"
              action={<span className="text-[10px] text-white/45">{CAL_CLAIMED.size} check-ins</span>}
            />
            <GlassPanel className="p-3 sm:p-4">
              <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
                {CAL_WEEKDAYS.map((w) => (
                  <div key={w} className="text-center text-[9px] font-bold text-white/40 uppercase" aria-hidden>
                    {w}
                  </div>
                ))}
                {Array.from({ length: CAL_LEADING_BLANKS }).map((_, i) => (
                  <div key={`cal-blank-${i}`} aria-hidden />
                ))}
                {Array.from({ length: CAL_DAYS }).map((_, i) => {
                  const day = i + 1;
                  const isToday = day === CAL_TODAY;
                  const claimed = CAL_CLAIMED.has(day);
                  const missed = CAL_MISSED.has(day);
                  const shielded = CAL_SHIELDED.has(day);
                  const future = day > CAL_TODAY;
                  const cellTitle = missed
                    ? shielded
                      ? "Missed — Streak Shield protected the streak"
                      : "Missed — streak dropped one tier"
                    : claimed
                      ? "Checked in"
                      : isToday
                        ? "Today — claim your reward"
                        : "Upcoming";
                  return (
                    <div
                      key={day}
                      className="relative aspect-square rounded-lg flex items-center justify-center text-[11px] font-bold"
                      style={{
                        background: isToday
                          ? "rgba(45,212,191,0.16)"
                          : claimed
                            ? "rgba(255,209,102,0.12)"
                            : missed
                              ? "rgba(255,111,145,0.08)"
                              : "rgba(10,27,61,0.5)",
                        border: isToday
                          ? "1.5px solid rgba(45,212,191,0.9)"
                          : claimed
                            ? "1px solid rgba(255,209,102,0.4)"
                            : "1px solid rgba(124,245,225,0.1)",
                        color: isToday
                          ? "#7CF5E1"
                          : claimed
                            ? "#FFD166"
                            : missed
                              ? "#FF6F91"
                              : "rgba(255,255,255,0.35)",
                        opacity: future ? 0.7 : 1,
                        animation: isToday ? "drm-daypulse 1.6s ease-in-out infinite" : undefined,
                      }}
                      title={cellTitle}
                    >
                      {day}
                      {claimed && (
                        <span
                          className="absolute bottom-0.5 w-1.5 h-1.5 rounded-full"
                          style={{ background: "#FFD166", boxShadow: "0 0 4px rgba(255,209,102,0.9)" }}
                        />
                      )}
                      {missed && (
                        <span
                          className="absolute left-1/2 top-1/2 pointer-events-none"
                          style={{
                            width: "70%",
                            height: 2,
                            background: "rgba(255,111,145,0.75)",
                            borderRadius: 2,
                            transform: "translate(-50%, -50%) rotate(-45deg)",
                          }}
                        />
                      )}
                      {shielded && (
                        <span
                          className="absolute -top-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center text-[8px]"
                          style={{ background: "#0A1B3D", border: "1px solid rgba(255,209,102,0.5)" }}
                          title="Streak Shield used — streak fully protected"
                        >
                          🛡️
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
              {/* Legend */}
              <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[9px] text-white/55">
                <span className="flex items-center gap-1">
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ background: "#FFD166", boxShadow: "0 0 4px rgba(255,209,102,0.8)" }}
                  />
                  Claimed
                </span>
                <span className="flex items-center gap-1">
                  <span className="drm-today-dot w-2 h-2 rounded-full" style={{ background: "#2DD4BF" }} />
                  Today
                </span>
                <span className="flex items-center gap-1">
                  <span className="relative inline-block w-2.5 h-2.5 rounded-[3px]" style={{ border: "1px solid rgba(255,111,145,0.6)" }}>
                    <span
                      style={{
                        position: "absolute",
                        left: "10%",
                        top: "45%",
                        width: "80%",
                        height: 1.5,
                        background: "rgba(255,111,145,0.8)",
                        transform: "rotate(-45deg)",
                      }}
                    />
                  </span>
                  Missed (−1 tier)
                </span>
                <span className="flex items-center gap-1">🛡️ Shield protected</span>
              </div>
            </GlassPanel>
          </section>
        </div>

        {/* ---------- Footer ---------- */}
        <div
          className="px-4 sm:px-6 py-4"
          style={{
            borderTop: "1px solid rgba(124,245,225,0.15)",
            background: "linear-gradient(180deg, rgba(4,12,32,0.2), rgba(4,12,32,0.6))",
          }}
        >
          <div className="flex flex-col-reverse sm:flex-row items-center justify-between gap-3">
            <p className="text-[10px] text-white/50 text-center sm:text-left leading-relaxed">
              💛 Rewards are free. Streaks are forgiving. No purchase affects streaks.
            </p>
            <GlowButton variant="teal" onClick={onClose} className="shrink-0">
              Close
            </GlowButton>
          </div>
        </div>
      </div>
    </div>
  );
}
