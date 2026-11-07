// Crabtopia - Tidepass (Seasonal Reward Track) Modal
// Self-contained: all season data is mock-local; only uses gameStore for
// gold/egg/cosmetic claim feedback via addGold + pushToast.
// Supporter lane is real-money cosmetic only — never GOLD, never combat power.
"use client";

import { useState } from "react";
import { useGame } from "../store/gameStore";
import { useLocalStorage } from "./useLocalStorage";
import {
  GlassPanel,
  GlowButton,
  GoldIcon,
  SectionTitle,
  StatChip,
  formatGold,
} from "./ui";

// ---------- Mock season metadata -----------------------------------------
const SEASON_NUMBER = 1;
const SEASON_NAME = "Tidewell Bloom";
const SEASON_WEEKS = 8;
const TIME_REMAINING = "4w 2d 14h";
const NEXT_SEASON_NAME = "Cinderforge Embers";

// Tidewell Bloom seasonal palette (coral + bloom-gold).
// Coral theme comes from the seasonal biome, not from a player faction.
const SEASON_ACCENT = "#FF6F91"; // coral bloom
const SEASON_ACCENT_2 = "#FFD166"; // bloom gold
const SEASON_DARK = "#5C1A38";

const XP_PER_TIER = 1000;
const TIERS = 10;

// ---------- Reward definitions -------------------------------------------
type FreeRewardKind = "gold" | "cosmetic" | "egg" | "token";

interface FreeReward {
  tier: number;
  kind: FreeRewardKind;
  name: string;
  emoji: string;
  gold?: number;
  eggRarity?: string;
}

const FREE_REWARDS: FreeReward[] = [
  { tier: 1, kind: "gold", name: "200 GOLD", emoji: "🪙", gold: 200 },
  { tier: 2, kind: "token", name: "Crab Rename Token", emoji: "🪪" },
  { tier: 3, kind: "gold", name: "500 GOLD", emoji: "🪙", gold: 500 },
  { tier: 4, kind: "egg", name: "Common Egg", emoji: "🥚", eggRarity: "Common" },
  { tier: 5, kind: "cosmetic", name: "Profile Frame: Coral", emoji: "🖼️" },
  { tier: 6, kind: "gold", name: "1,000 GOLD", emoji: "🪙", gold: 1000 },
  { tier: 7, kind: "egg", name: "Uncommon Egg", emoji: "🥚", eggRarity: "Uncommon" },
  { tier: 8, kind: "cosmetic", name: "Burrow Decor: Kelp Garden", emoji: "🌿" },
  { tier: 9, kind: "gold", name: "2,000 GOLD", emoji: "🪙", gold: 2000 },
  { tier: 10, kind: "cosmetic", name: "Tidewell Crest (Legendary Frame)", emoji: "🏆" },
];

interface SupporterReward {
  tier: number;
  name: string;
  emoji: string;
}

// Supporter rewards are strictly cosmetic — no GOLD, no eggs, no crabs,
// no combat power. Ever.
const SUPPORTER_REWARDS: SupporterReward[] = [
  { tier: 1, name: "Victory Dance: Wavebreaker", emoji: "💃" },
  { tier: 2, name: "Shell Trail: Plankton Glow", emoji: "✨" },
  { tier: 3, name: "Profile Frame: Gilded", emoji: "🖼️" },
  { tier: 4, name: "Burrow Decor: Coral Throne", emoji: "🪑" },
  { tier: 5, name: "Crab Skin: Bloomtide Hermit", emoji: "🦀" },
  { tier: 6, name: "Victory Dance: Coral Cascade", emoji: "🌊" },
  { tier: 7, name: "Shell Trail: Goldspark", emoji: "⚡" },
  { tier: 8, name: "Profile Frame: Bloomtide Crown", emoji: "👑" },
  { tier: 9, name: "Burrow Decor: Tidepool Pavilion", emoji: "🏛️" },
  { tier: 10, name: "Seasonal MVP Badge: Tidewell Sovereign", emoji: "🏅" },
];

interface XpSource {
  label: string;
  xp: number;
}
const XP_SOURCES: XpSource[] = [
  { label: "Complete 3 dives", xp: 50 },
  { label: "Win 1 raid", xp: 30 },
  { label: "Win 1 Coliseum battle", xp: 40 },
  { label: "Breed 1 crab", xp: 60 },
  { label: "Hatch 1 egg", xp: 80 },
  { label: "Donate to clan chest", xp: 20 },
  { label: "Daily login", xp: 10 },
  { label: "Win Leviathan raid", xp: 100 },
];

// ---------- CSS-built bloom emblem ---------------------------------------
// Pure-CSS flower/coral sigil — no external assets.
function BloomEmblem({ size = 56 }: { size?: number }) {
  const petalColors = [
    SEASON_ACCENT,
    SEASON_ACCENT_2,
    "#FF8FB3",
    SEASON_ACCENT,
    SEASON_ACCENT_2,
    "#FF8FB3",
  ];
  return (
    <div
      className="relative shrink-0"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      {petalColors.map((c, i) => {
        const angle = (i * 360) / petalColors.length;
        return (
          <span
            key={i}
            className="absolute left-1/2 top-1/2"
            style={{
              width: size * 0.44,
              height: size * 0.24,
              borderRadius: "50%",
              background: `radial-gradient(ellipse at center, ${c} 0%, ${c}aa 100%)`,
              transform: `translate(-50%, -50%) rotate(${angle}deg) translateY(-${size * 0.27}px)`,
              boxShadow: `0 0 ${size * 0.16}px ${c}77`,
            }}
          />
        );
      })}
      <span
        className="absolute left-1/2 top-1/2 rounded-full"
        style={{
          width: size * 0.32,
          height: size * 0.32,
          transform: "translate(-50%, -50%)",
          background: `radial-gradient(circle, ${SEASON_ACCENT_2} 0%, ${SEASON_ACCENT} 100%)`,
          boxShadow: `0 0 ${size * 0.22}px ${SEASON_ACCENT_2}`,
        }}
      />
    </div>
  );
}

// ---------- Tier card ----------------------------------------------------
interface TierCardProps {
  tier: number;
  emoji: string;
  name: string;
  claimable: boolean;
  claimed: boolean;
  onClaim: () => void;
  theme: { accent: string; bg: string; border: string; locked: string };
  laneLabel: string;
}

function TierCard({
  tier,
  emoji,
  name,
  claimable,
  claimed,
  onClaim,
  theme,
  laneLabel,
}: TierCardProps) {
  const locked = !claimable && !claimed;
  return (
    <div
      className="relative rounded-xl p-2 flex flex-col items-center text-center min-w-[92px] max-w-[110px] flex-1"
      style={{
        background: claimed ? theme.bg : locked ? "rgba(10,27,61,0.35)" : theme.bg,
        border: `1.5px solid ${claimed ? theme.accent : locked ? theme.locked : theme.border}`,
        opacity: locked ? 0.62 : 1,
        boxShadow: claimed ? `0 0 14px ${theme.accent}55` : "none",
      }}
    >
      <div
        className="absolute -top-2 left-1 px-1.5 py-0.5 rounded-md text-[9px] font-bold"
        style={{ background: theme.accent, color: "#0A1B3D" }}
      >
        T{tier}
      </div>
      <div
        className="absolute -top-2 right-1 px-1 py-0.5 rounded-md text-[8px] font-bold uppercase tracking-wide"
        style={{ background: "rgba(10,27,61,0.85)", color: theme.accent }}
      >
        {laneLabel}
      </div>
      <div
        className="text-2xl mt-2 mb-1"
        style={{
          filter: claimed
            ? `drop-shadow(0 0 6px ${theme.accent})`
            : locked
              ? "grayscale(1)"
              : "none",
        }}
      >
        {emoji}
      </div>
      <div
        className="text-[10px] font-bold leading-tight min-h-[28px] flex items-center justify-center px-0.5"
        style={{ color: claimed ? theme.accent : "#EAF6FF" }}
      >
        {name}
      </div>
      <div className="mt-1 w-full">
        {claimed ? (
          <div
            className="text-[10px] font-bold py-1 rounded-md"
            style={{ background: theme.accent + "22", color: theme.accent }}
          >
            ✓ Claimed
          </div>
        ) : claimable ? (
          <button
            onClick={onClaim}
            className="w-full text-[10px] font-bold py-1 rounded-md transition-all duration-150 hover:-translate-y-0.5 active:scale-95"
            style={{
              background: "linear-gradient(135deg, #FFD166, #FF7A1A)",
              color: "#0A1B3D",
              boxShadow: "0 0 12px rgba(255,209,102,0.5)",
            }}
          >
            Claim
          </button>
        ) : (
          <div
            className="text-[9px] font-bold py-1 rounded-md text-white/40"
            style={{ background: "rgba(255,255,255,0.04)" }}
          >
            🔒 Locked
          </div>
        )}
      </div>
    </div>
  );
}

// ---------- Main modal ---------------------------------------------------
export function TidepassModal({ onClose }: { onClose: () => void }) {
  // --- Local mock state (the real game would source this from a backend) ---
  const [seasonWeek] = useState<number>(3);
  const [seasonXp] = useState<number>(4250);
  const [seasonXpMax] = useState<number>(XP_PER_TIER * TIERS);
  // Claimed tiers pay REAL gold from the store, so they must persist
  // across modal opens — they were ephemeral useState Sets, and every
  // reopen re-paid every unlocked gold tier. Stored per season.
  const [claimedFreeArr, setClaimedFreeArr] = useLocalStorage<number[]>(
    `crabtopia_tidepass_free_s${SEASON_NUMBER}_v1`,
    []
  );
  const [claimedSupporterArr, setClaimedSupporterArr] = useLocalStorage<number[]>(
    `crabtopia_tidepass_supporter_s${SEASON_NUMBER}_v1`,
    []
  );
  const claimedFree = new Set(claimedFreeArr);
  const claimedSupporter = new Set(claimedSupporterArr);
  const setClaimedFree = (updater: (prev: Set<number>) => Set<number>) =>
    setClaimedFreeArr([...updater(new Set(claimedFreeArr))]);
  const setClaimedSupporter = (updater: (prev: Set<number>) => Set<number>) =>
    setClaimedSupporterArr([...updater(new Set(claimedSupporterArr))]);
  const [supporterUnlocked, setSupporterUnlocked] = useState<boolean>(false);
  const [showXpSources, setShowXpSources] = useState<boolean>(false);

  // --- Store hooks (claim flow only) ---
  const addGold = useGame((s) => s.addGold);
  const pushToast = useGame((s) => s.pushToast);

  const xpPct = Math.min(100, (seasonXp / seasonXpMax) * 100);
  const currentTier = Math.floor(seasonXp / XP_PER_TIER);

  const freeTheme = {
    accent: "#7CF5E1",
    bg: "rgba(18,167,160,0.14)",
    border: "rgba(124,245,225,0.5)",
    locked: "rgba(124,245,225,0.2)",
  };
  const supTheme = {
    accent: SEASON_ACCENT_2,
    bg: "rgba(255,209,102,0.12)",
    border: "rgba(255,209,102,0.55)",
    locked: "rgba(255,209,102,0.2)",
  };

  function claimFree(tier: number) {
    const r = FREE_REWARDS.find((x) => x.tier === tier);
    if (!r) return;
    if (claimedFree.has(tier)) return; // already claimed (persisted)
    if (tier > currentTier) return; // tier not unlocked yet
    setClaimedFree((prev) => new Set(prev).add(tier));
    if (r.kind === "gold" && r.gold) {
      addGold(r.gold);
      pushToast({
        title: `+${formatGold(r.gold)} GOLD`,
        description: r.name,
        variant: "success",
      });
    } else if (r.kind === "egg") {
      pushToast({
        title: `Received: ${r.eggRarity ?? ""} egg`.trim(),
        description: `${r.name} — egg added in the breeding module`,
        variant: "success",
      });
    } else {
      pushToast({
        title: `Received: ${r.name}`,
        description: "Cosmetic reward added to your collection",
        variant: "success",
      });
    }
  }

  function claimSupporter(tier: number) {
    const r = SUPPORTER_REWARDS.find((x) => x.tier === tier);
    if (!r) return;
    if (claimedSupporter.has(tier)) return; // already claimed (persisted)
    if (tier > currentTier) return; // tier not unlocked yet
    setClaimedSupporter((prev) => new Set(prev).add(tier));
    pushToast({
      title: `Received: ${r.name}`,
      description: "Cosmetic reward added to your collection",
      variant: "success",
    });
  }

  function unlockSupporter() {
    pushToast({
      title: "Store checkout (mock)",
      description: "Supporter lane would unlock here",
      variant: "default",
    });
    setSupporterUnlocked(true);
  }

  function viewRealMoneyItems() {
    pushToast({
      title: "Store (mock)",
      description: "All real-money cosmetic items would open here",
      variant: "default",
    });
  }

  function openPastSeasons() {
    pushToast({
      title: "Past seasons",
      description: "Season archive would open here (mock)",
      variant: "default",
    });
  }

  return (
    <div
      className="modal-backdrop-enter fixed inset-0 z-[150] flex items-center justify-center p-3 sm:p-4"
      style={{ background: "rgba(4,12,32,0.78)", backdropFilter: "blur(10px)" }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Season ${SEASON_NUMBER}: ${SEASON_NAME} Tidepass`}
    >
      <div
        className="relative w-full max-w-3xl max-h-[88vh] overflow-y-auto rounded-2xl"
        style={{
          background: `linear-gradient(170deg, #1A0712 0%, #0A1B3D 55%, #06122B 100%)`,
          border: `1px solid ${SEASON_ACCENT}77`,
          boxShadow: `0 16px 70px ${SEASON_ACCENT}44, inset 0 0 0 1px rgba(255,209,102,0.08)`,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ============ HEADER ============ */}
        <div
          className="sticky top-0 z-10 px-4 sm:px-6 pt-5 pb-3"
          style={{
            background: `linear-gradient(180deg, #1A0712 60%, rgba(6,18,43,0))`,
            borderBottom: "1px solid rgba(124,245,225,0.18)",
          }}
        >
          <div className="flex items-start gap-3">
            <BloomEmblem size={56} />
            <div className="min-w-0 flex-1">
              <h1
                className="text-xl sm:text-2xl font-bold leading-tight"
                style={{
                  fontFamily: "Fredoka, system-ui, sans-serif",
                  color: SEASON_ACCENT,
                }}
              >
                Season {SEASON_NUMBER}: {SEASON_NAME}
              </h1>
              <p className="text-xs sm:text-sm text-white/70 mt-0.5">
                {SEASON_WEEKS}-week seasonal event · Week {seasonWeek} of {SEASON_WEEKS}
              </p>
            </div>
            <button
              onClick={onClose}
              className="shrink-0 rounded-lg px-2 py-1 text-white/70 hover:text-white hover:bg-white/10 transition-colors text-lg leading-none"
              aria-label="Close tidepass"
              title="Close"
            >
              ✕
            </button>
          </div>

          {/* Week progress dots */}
          <div className="flex items-center gap-1.5 mt-3" aria-label="Season week progress">
            {Array.from({ length: SEASON_WEEKS }).map((_, i) => {
              const week = i + 1;
              const isPast = week < seasonWeek;
              const isCurrent = week === seasonWeek;
              return (
                <span
                  key={i}
                  className="rounded-full"
                  style={{
                    width: isCurrent ? 14 : 10,
                    height: isCurrent ? 14 : 10,
                    background: isPast ? SEASON_ACCENT_2 : isCurrent ? SEASON_ACCENT : "rgba(255,255,255,0.18)",
                    boxShadow: isPast
                      ? `0 0 6px ${SEASON_ACCENT_2}88`
                      : isCurrent
                        ? `0 0 10px ${SEASON_ACCENT}`
                        : "none",
                    transition: "all 0.2s",
                  }}
                  title={`Week ${week}${isCurrent ? " (current)" : isPast ? " (completed)" : ""}`}
                />
              );
            })}
            <span className="ml-2 text-[11px] text-white/60">
              {seasonWeek - 1}/{SEASON_WEEKS} weeks completed
            </span>
          </div>

          {/* Season XP bar */}
          <div className="mt-3">
            <div className="flex items-center justify-between text-[11px] mb-1">
              <span className="font-bold text-white/85">Season XP</span>
              <span className="text-white/60">
                {seasonXp.toLocaleString()} / {seasonXpMax.toLocaleString()} · Tier {Math.min(TIERS, currentTier)}/{TIERS}
              </span>
            </div>
            <div
              className="relative h-2.5 rounded-full overflow-hidden"
              style={{ background: "rgba(255,255,255,0.08)" }}
            >
              <div
                className="absolute inset-y-0 left-0 rounded-full"
                style={{
                  width: `${xpPct}%`,
                  background: `linear-gradient(90deg, ${SEASON_ACCENT} 0%, ${SEASON_ACCENT_2} 100%)`,
                  boxShadow: `0 0 10px ${SEASON_ACCENT}88`,
                  transition: "width 0.4s ease",
                }}
              />
              {/* Tier tick marks */}
              {Array.from({ length: TIERS + 1 }).map((_, i) => (
                <span
                  key={i}
                  className="absolute top-0 bottom-0 w-px"
                  style={{
                    left: `${(i / TIERS) * 100}%`,
                    background: "rgba(10,27,61,0.6)",
                  }}
                />
              ))}
            </div>
          </div>

          {/* Time remaining */}
          <div className="flex items-center justify-between mt-3 flex-wrap gap-2">
            <StatChip
              label="Time remaining"
              value={TIME_REMAINING}
              color={SEASON_ACCENT_2}
              icon={<span>⏳</span>}
            />
            <StatChip
              label="Season XP / week"
              value={`${Math.round(seasonXp / Math.max(1, seasonWeek - 1)).toLocaleString()} avg`}
              color={SEASON_ACCENT}
              icon={<span>✦</span>}
            />
          </div>
        </div>

        {/* ============ BODY ============ */}
        <div className="px-4 sm:px-6 py-4 space-y-5">
          {/* Unlock supporter banner (when not unlocked) */}
          {!supporterUnlocked && (
            <GlassPanel
              glow={`${SEASON_ACCENT_2}33`}
              className="p-4"
              style={{
                background: `linear-gradient(135deg, ${SEASON_DARK}66 0%, ${SEASON_ACCENT}14 100%)`,
                border: `1px solid ${SEASON_ACCENT_2}66`,
              }}
            >
              <div className="flex items-start gap-3 flex-wrap">
                <div className="text-3xl shrink-0" aria-hidden="true">🎟️</div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-bold" style={{ color: SEASON_ACCENT_2 }}>
                    Unlock the Supporter Lane
                  </div>
                  <p className="text-[12px] text-white/80 leading-relaxed mt-1">
                    A one-time seasonal purchase that unlocks <b>10 additional cosmetic
                    rewards</b> on the gold track below. Real-money only. <b>Never gives
                    GOLD, crabs, eggs, or combat power</b> — cosmetics only. Refundable
                    within 14 days.
                  </p>
                  <div className="flex items-center gap-3 mt-2 flex-wrap">
                    <GlowButton variant="gold" size="sm" onClick={unlockSupporter}>
                      Unlock for $9.99
                    </GlowButton>
                    <button
                      onClick={viewRealMoneyItems}
                      className="text-[11px] font-bold underline-offset-2 hover:underline"
                      style={{ color: SEASON_ACCENT_2 }}
                    >
                      View all real-money items →
                    </button>
                  </div>
                </div>
              </div>
            </GlassPanel>
          )}

          {/* Reward track: two lanes side-by-side (stack on mobile) */}
          <div>
            <SectionTitle
              icon={<span>🌊</span>}
              title="Reward Track"
              action={
                <span className="text-[11px] text-white/60">
                  1 tier = {XP_PER_TIER.toLocaleString()} Season XP
                </span>
              }
            />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Free Lane */}
              <GlassPanel className="p-3" style={{ border: `1px solid ${freeTheme.border}` }}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5">
                    <span className="text-base">🐚</span>
                    <span className="text-sm font-bold" style={{ color: freeTheme.accent }}>
                      Free Lane
                    </span>
                  </div>
                  <span className="text-[10px] text-white/50">GOLD · eggs · cosmetics</span>
                </div>
                <div
                  className="flex gap-2 overflow-x-auto pb-2 pr-1"
                  style={{ scrollbarWidth: "thin" }}
                >
                  {FREE_REWARDS.map((r) => {
                    const claimable = seasonXp >= r.tier * XP_PER_TIER && !claimedFree.has(r.tier);
                    return (
                      <TierCard
                        key={r.tier}
                        tier={r.tier}
                        emoji={r.emoji}
                        name={r.name}
                        claimable={claimable}
                        claimed={claimedFree.has(r.tier)}
                        onClaim={() => claimFree(r.tier)}
                        theme={freeTheme}
                        laneLabel="Free"
                      />
                    );
                  })}
                </div>
              </GlassPanel>

              {/* Supporter Lane */}
              <GlassPanel
                className="p-3"
                style={{ border: `1px solid ${supTheme.border}` }}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5">
                    <span className="text-base">✨</span>
                    <span className="text-sm font-bold" style={{ color: supTheme.accent }}>
                      Supporter Lane
                    </span>
                    {!supporterUnlocked && (
                      <span
                        className="text-[9px] px-1.5 py-0.5 rounded-md font-bold uppercase"
                        style={{
                          background: supTheme.accent + "22",
                          color: supTheme.accent,
                          border: `1px solid ${supTheme.accent}55`,
                        }}
                      >
                        🔒 Locked
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] text-white/50">Cosmetics only</span>
                </div>
                <div
                  className="flex gap-2 overflow-x-auto pb-2 pr-1"
                  style={{ scrollbarWidth: "thin" }}
                >
                  {SUPPORTER_REWARDS.map((r) => {
                    const claimable =
                      supporterUnlocked &&
                      seasonXp >= r.tier * XP_PER_TIER &&
                      !claimedSupporter.has(r.tier);
                    const claimed = claimedSupporter.has(r.tier);
                    return (
                      <TierCard
                        key={r.tier}
                        tier={r.tier}
                        emoji={r.emoji}
                        name={r.name}
                        claimable={claimable}
                        claimed={claimed}
                        onClaim={() => claimSupporter(r.tier)}
                        theme={supTheme}
                        laneLabel="Sup"
                      />
                    );
                  })}
                </div>
                {!supporterUnlocked && (
                  <div className="mt-2 text-center">
                    <button
                      onClick={unlockSupporter}
                      className="text-[11px] font-bold underline-offset-2 hover:underline"
                      style={{ color: supTheme.accent }}
                    >
                      Unlock Supporter Lane for $9.99 →
                    </button>
                  </div>
                )}
              </GlassPanel>
            </div>
          </div>

          {/* Daily season XP sources — collapsible */}
          <GlassPanel className="p-3">
            <button
              onClick={() => setShowXpSources((v) => !v)}
              className="w-full flex items-center justify-between text-left"
              aria-expanded={showXpSources}
            >
              <div className="flex items-center gap-1.5">
                <span className="text-base">⚡</span>
                <span className="text-sm font-bold text-white/90">
                  Earn Season XP by
                </span>
              </div>
              <span className="text-white/60 text-xs">{showXpSources ? "▲ Hide" : "▼ Show"}</span>
            </button>
            {showXpSources && (
              <div className="mt-3 flex flex-wrap gap-2">
                {XP_SOURCES.map((s) => (
                  <span
                    key={s.label}
                    className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold"
                    style={{
                      background: `${SEASON_ACCENT}1f`,
                      color: "#EAF6FF",
                      border: `1px solid ${SEASON_ACCENT}55`,
                    }}
                  >
                    <span style={{ color: SEASON_ACCENT_2 }}>+{s.xp}</span>
                    <span className="text-white/85">{s.label}</span>
                  </span>
                ))}
              </div>
            )}
            {!showXpSources && (
              <div className="mt-2 text-[11px] text-white/55">
                Tap to expand — dive, raid, breed, hatch, and more each day for season XP.
              </div>
            )}
          </GlassPanel>
        </div>

        {/* ============ FOOTER ============ */}
        <div
          className="sticky bottom-0 px-4 sm:px-6 py-3 flex items-center justify-between gap-3 flex-wrap"
          style={{
            background: "linear-gradient(0deg, #06122B 60%, rgba(6,18,43,0))",
            borderTop: "1px solid rgba(124,245,225,0.18)",
          }}
        >
          <div className="min-w-0">
            <div className="text-[11px] text-white/60">
              Next season: Season 2 — {NEXT_SEASON_NAME}
            </div>
            <div className="text-[11px] font-bold" style={{ color: SEASON_ACCENT_2 }}>
              Starts in 4w 2d
            </div>
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <button
              onClick={openPastSeasons}
              className="text-[11px] font-bold text-white/70 hover:text-white underline-offset-2 hover:underline"
            >
              Past seasons
            </button>
            <GlowButton variant="teal" size="sm" onClick={onClose}>
              Close
            </GlowButton>
          </div>
        </div>
      </div>
    </div>
  );
}

export default TidepassModal;
