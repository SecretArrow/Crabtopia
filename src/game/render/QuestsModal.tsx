// Crabtopia - Quests & Codex modal (self-contained, Glow-Tide theme)
"use client";

import { useMemo, useState } from "react";
import { useGame } from "../store/gameStore";
import { QUESTS } from "../engine/config";
import {
  GlassPanel,
  GlowButton,
  GoldIcon,
  formatGold,
  formatTime,
  EmptyState,
} from "./ui";

type Tab = "daily" | "weekly" | "achievement";

// QUESTS carries no `category` field, so we assign categories locally
// to split the canonical list across the Daily / Weekly tabs.
const QUEST_CATEGORY: Record<string, "daily" | "weekly"> = {
  first_dive: "daily",
  hire_crab: "daily",
  list_crab: "daily",
  bazaar_trade: "daily",
  claim_dive: "weekly",
  win_raid: "weekly",
  defend_raid: "weekly",
  breed_crab: "weekly",
  hatch_egg: "weekly",
  coliseum_win: "weekly",
};

interface MetaAchievement {
  id: string;
  title: string;
  description: string;
  target: number;
  reward: string; // cosmetic reward label
  progress: number; // derived from player state
}

// --- Reset-window helpers (Asia/Jakarta == UTC+7) ---
const JAKARTA_OFFSET = 7 * 60 * 60 * 1000;
const ONE_DAY = 24 * 60 * 60 * 1000;

function nextJakartaMidnight(now: number): number {
  const local = now + JAKARTA_OFFSET;
  const startOfToday = Math.floor(local / ONE_DAY) * ONE_DAY;
  return startOfToday + ONE_DAY - JAKARTA_OFFSET;
}

function nextMondayJakartaMidnight(now: number): number {
  const local = now + JAKARTA_OFFSET;
  const startOfToday = Math.floor(local / ONE_DAY) * ONE_DAY;
  // getUTCDay on the shifted ms gives Jakarta's wall-clock weekday (0 Sun .. 6 Sat)
  const dow = new Date(local).getUTCDay();
  let daysUntilMonday = (1 - dow + 7) % 7;
  if (daysUntilMonday === 0) daysUntilMonday = 7; // already Monday -> next week
  return startOfToday + daysUntilMonday * ONE_DAY - JAKARTA_OFFSET;
}

export function QuestsModal({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<Tab>("daily");
  const [claimedMeta, setClaimedMeta] = useState<Set<string>>(new Set());

  const player = useGame((s) => s.player);
  const claimQuest = useGame((s) => s.claimQuest);
  const pushToast = useGame((s) => s.pushToast);

  const now = Date.now();
  const dailyResetMs = nextJakartaMidnight(now) - now;
  const weeklyResetMs = nextMondayJakartaMidnight(now) - now;

  // Join canonical QUESTS defs with the player's questProgress.
  const questRows = useMemo(() => {
    if (!player) return [];
    return QUESTS.map((q) => {
      const qp = player.questProgress.find((x) => x.questId === q.id);
      return {
        id: q.id,
        title: q.name,
        description: q.description,
        target: q.target,
        progress: qp?.progress ?? 0,
        claimed: qp?.claimed ?? false,
        rewardGold: q.reward,
        category: QUEST_CATEGORY[q.id] ?? "daily",
      };
    });
  }, [player]);

  // Hardcoded meta-achievements (not in QUESTS) derived from live player state.
  const metaAchievements: MetaAchievement[] = useMemo(() => {
    if (!player) return [];
    const raidWins = player.raids.filter(
      (r) => r.result?.winner === "raider"
    ).length;
    const totalBreeds = player.crabs.reduce(
      (s, c) => s + (c.breedCount || 0),
      0
    );
    const firstDiveProgress =
      player.questProgress.find((x) => x.questId === "first_dive")?.progress ?? 0;
    return [
      {
        id: "meta_first_dive",
        title: "First Dive",
        description: "Complete your very first dive expedition.",
        target: 1,
        reward: "Profile Frame: Coral",
        progress: Math.min(1, firstDiveProgress),
      },
      {
        id: "meta_first_raid_win",
        title: "First Raid Win",
        description: "Win your first plunder raid.",
        target: 1,
        reward: "Banner: Raider's Crest",
        progress: raidWins,
      },
      {
        id: "meta_breed_5",
        title: "Breed 5 Crabs",
        description: "Accumulate 5 successful breeds across your bloodline.",
        target: 5,
        reward: "Title: Bloodline Architect",
        progress: totalBreeds,
      },
      {
        id: "meta_level_10",
        title: "Reach Level 10",
        description: "Raise your Shellwarden to level 10.",
        target: 10,
        reward: "Avatar Aura: Tidecaller",
        progress: player.shellwardenLevel,
      },
      {
        id: "meta_collect_10",
        title: "Collect 10 Crabs",
        description: "Own 10 crabs at once.",
        target: 10,
        reward: "Crab Skin: Golden Shell",
        progress: player.crabs.length,
      },
      {
        id: "meta_win_10_coliseum",
        title: "Win 10 Coliseum Battles",
        description: "Triumph in 10 coliseum brawls.",
        target: 10,
        reward: "Banner: Champion's Mark",
        progress: raidWins,
      },
      {
        id: "meta_discover_16",
        title: "Discover 16 Breeds",
        description: "Discover 16 distinct crab breeds.",
        target: 16,
        reward: "Profile Frame: Prismatic",
        progress: player.discoveredBreeds.length,
      },
      {
        id: "meta_earn_100k",
        title: "Earn 100K Gold Total",
        description: "Amass 100,000 GOLD.",
        target: 100000,
        reward: "Title: Tidebaron",
        progress: player.gold,
      },
    ];
  }, [player]);

  const dailyQuests = questRows.filter((q) => q.category === "daily");
  const weeklyQuests = questRows.filter((q) => q.category === "weekly");

  const totalClaimed =
    questRows.filter((q) => q.claimed).length + claimedMeta.size;
  const totalQuests = QUESTS.length + metaAchievements.length;

  function handleClaimMeta(m: MetaAchievement) {
    if (claimedMeta.has(m.id) || m.progress < m.target) return;
    setClaimedMeta((prev) => {
      const next = new Set(prev);
      next.add(m.id);
      return next;
    });
    pushToast({
      title: "Achievement unlocked!",
      description: `Reward: ${m.reward}`,
      variant: "success",
    });
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: "daily", label: "Daily" },
    { id: "weekly", label: "Weekly" },
    { id: "achievement", label: "Achievements" },
  ];

  return (
    <div
      className="modal-backdrop-enter fixed inset-0 z-[150] flex items-center justify-center p-3 sm:p-4"
      style={{ background: "rgba(4,12,32,0.78)", backdropFilter: "blur(10px)" }}
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-2xl max-h-[88vh] overflow-y-auto rounded-2xl"
        style={{
          background:
            "linear-gradient(170deg, #06122B 0%, #0A1B3D 55%, #051028 100%)",
          border: "1px solid rgba(18,167,160,0.45)",
          boxShadow:
            "0 16px 70px rgba(18,167,160,0.35), inset 0 0 0 1px rgba(255,209,102,0.08)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="sticky top-0 z-10 px-4 sm:px-6 pt-5 pb-3"
          style={{
            background:
              "linear-gradient(180deg, #06122B 70%, rgba(6,18,43,0))",
            borderBottom: "1px solid rgba(124,245,225,0.18)",
          }}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xl" aria-hidden>
                📜
              </span>
              <h2
                className="font-display text-lg sm:text-xl font-bold"
                style={{
                  color: "#FFD166",
                  textShadow: "0 0 12px rgba(255,209,102,0.35)",
                }}
              >
                Quests &amp; Codex
              </h2>
            </div>
            <button
              onClick={onClose}
              className="text-white/60 hover:text-white w-8 h-8 flex items-center justify-center rounded-md hover:bg-white/10"
              aria-label="Close"
            >
              ✕
            </button>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 mt-3" role="tablist">
            {tabs.map((t) => {
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  role="tab"
                  aria-selected={active}
                  onClick={() => setTab(t.id)}
                  className="relative px-3 sm:px-4 py-1.5 text-sm font-bold transition-colors"
                  style={{
                    color: active ? "#7CF5E1" : "rgba(234,246,255,0.55)",
                  }}
                >
                  {t.label}
                  {active && (
                    <span
                      className="absolute left-1 right-1 -bottom-px h-[2px] rounded-full"
                      style={{
                        background:
                          "linear-gradient(90deg, #12A7A0, #7CF5E1)",
                        boxShadow: "0 0 8px rgba(124,245,225,0.6)",
                      }}
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Body */}
        <div className="px-4 sm:px-6 py-4 space-y-3">
          {tab === "daily" && (
            <>
              <div
                className="text-xs flex items-center gap-1.5"
                style={{ color: "rgba(124,245,225,0.85)" }}
              >
                <span aria-hidden>⏳</span>
                <span>Resets in {formatTime(dailyResetMs)}</span>
              </div>
              {dailyQuests.length === 0 ? (
                <EmptyState message="No quests right now — check back tomorrow!" />
              ) : (
                dailyQuests.map((q) => (
                  <QuestRow
                    key={q.id}
                    title={q.title}
                    description={q.description}
                    progress={q.progress}
                    target={q.target}
                    rewardGold={q.rewardGold}
                    claimed={q.claimed}
                    onClaim={() => claimQuest(q.id)}
                  />
                ))
              )}
            </>
          )}

          {tab === "weekly" && (
            <>
              <div
                className="text-xs flex items-center gap-1.5"
                style={{ color: "rgba(124,245,225,0.85)" }}
              >
                <span aria-hidden>⏳</span>
                <span>Resets in {formatTime(weeklyResetMs)}</span>
              </div>
              {weeklyQuests.length === 0 ? (
                <EmptyState message="No quests right now — check back tomorrow!" />
              ) : (
                weeklyQuests.map((q) => (
                  <QuestRow
                    key={q.id}
                    title={q.title}
                    description={q.description}
                    progress={q.progress}
                    target={q.target}
                    rewardGold={q.rewardGold}
                    claimed={q.claimed}
                    onClaim={() => claimQuest(q.id)}
                  />
                ))
              )}
            </>
          )}

          {tab === "achievement" && (
            <>
              {metaAchievements.length === 0 ? (
                <EmptyState message="No quests right now — check back tomorrow!" />
              ) : (
                metaAchievements.map((m) => {
                  const claimed = claimedMeta.has(m.id);
                  const done = m.progress >= m.target;
                  return (
                    <MetaRow
                      key={m.id}
                      title={m.title}
                      description={m.description}
                      progress={m.progress}
                      target={m.target}
                      rewardLabel={m.reward}
                      claimed={claimed}
                      done={done}
                      onClaim={() => handleClaimMeta(m)}
                    />
                  );
                })
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div
          className="sticky bottom-0 px-4 sm:px-6 py-3 flex items-center justify-between gap-3"
          style={{
            background:
              "linear-gradient(0deg, #06122B 70%, rgba(6,18,43,0))",
            borderTop: "1px solid rgba(124,245,225,0.18)",
          }}
        >
          <div className="text-xs" style={{ color: "rgba(234,246,255,0.65)" }}>
            Total claimed:{" "}
            <span className="font-bold" style={{ color: "#FFD166" }}>
              {totalClaimed}
            </span>{" "}
            / {totalQuests}
          </div>
          <GlowButton variant="teal" size="sm" onClick={onClose}>
            Close
          </GlowButton>
        </div>
      </div>
    </div>
  );
}

// --- Quest row (canonical QUESTS-based; gold reward via claimQuest) ---
function QuestRow({
  title,
  description,
  progress,
  target,
  rewardGold,
  claimed,
  onClaim,
}: {
  title: string;
  description: string;
  progress: number;
  target: number;
  rewardGold: number;
  claimed: boolean;
  onClaim: () => void;
}) {
  const pct = Math.max(0, Math.min(100, (progress / target) * 100));
  const done = progress >= target;
  return (
    <GlassPanel className="p-3 sm:p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div
            className="font-display font-bold text-sm sm:text-base"
            style={{ color: "#EAF6FF" }}
          >
            {title}
          </div>
          <div className="text-[11px] sm:text-xs mt-0.5 opacity-70">
            {description}
          </div>
        </div>
        <div className="shrink-0 flex flex-col items-end gap-1">
          <span
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold whitespace-nowrap"
            style={{
              background: "rgba(255,209,102,0.12)",
              color: "#FFD166",
              border: "1px solid rgba(255,209,102,0.3)",
            }}
          >
            <GoldIcon size={12} /> +{formatGold(rewardGold)} GOLD
          </span>
        </div>
      </div>

      <div className="mt-2.5 flex items-center gap-3">
        <div
          className="relative flex-1 h-2.5 rounded-full overflow-hidden"
          style={{
            background: "rgba(255,255,255,0.08)",
            border: "1px solid rgba(124,245,225,0.18)",
          }}
        >
          <div
            className="absolute inset-y-0 left-0 rounded-full"
            style={{
              width: `${pct}%`,
              background:
                "linear-gradient(90deg, #12A7A0 0%, #7CF5E1 50%, #FFD166 100%)",
              boxShadow: "0 0 10px rgba(124,245,225,0.45)",
              transition: "width 0.4s ease",
            }}
          />
        </div>
        <div
          className="text-[11px] font-bold tabular-nums whitespace-nowrap"
          style={{ color: "rgba(234,246,255,0.85)" }}
        >
          {Math.min(progress, target)}/{target}
        </div>
        <div className="shrink-0 w-[92px] flex justify-end">
          {claimed ? (
            <span
              className="text-[11px] font-bold px-2 py-1 rounded-md whitespace-nowrap"
              style={{
                color: "rgba(124,245,225,0.85)",
                background: "rgba(18,167,160,0.12)",
                border: "1px solid rgba(124,245,225,0.25)",
              }}
            >
              ✓ Claimed
            </span>
          ) : done ? (
            <GlowButton variant="gold" size="sm" onClick={onClaim}>
              Claim
            </GlowButton>
          ) : (
            <span
              className="text-[11px] font-bold px-2 py-1 rounded-md opacity-70 whitespace-nowrap"
              style={{ color: "rgba(234,246,255,0.7)" }}
            >
              In Progress
            </span>
          )}
        </div>
      </div>
    </GlassPanel>
  );
}

// --- Meta achievement row (cosmetic reward; claim handled locally) ---
function MetaRow({
  title,
  description,
  progress,
  target,
  rewardLabel,
  claimed,
  done,
  onClaim,
}: {
  title: string;
  description: string;
  progress: number;
  target: number;
  rewardLabel: string;
  claimed: boolean;
  done: boolean;
  onClaim: () => void;
}) {
  const pct = Math.max(0, Math.min(100, (progress / target) * 100));
  const progDisplay =
    target >= 1000
      ? `${formatGold(progress)}/${formatGold(target)}`
      : `${Math.min(progress, target)}/${target}`;
  return (
    <GlassPanel className="p-3 sm:p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div
            className="font-display font-bold text-sm sm:text-base flex items-center gap-1.5"
            style={{ color: "#EAF6FF" }}
          >
            <span aria-hidden>🏆</span>
            <span>{title}</span>
          </div>
          <div className="text-[11px] sm:text-xs mt-0.5 opacity-70">
            {description}
          </div>
        </div>
        <div className="shrink-0 flex flex-col items-end gap-1">
          <span
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold whitespace-nowrap"
            style={{
              background: "rgba(122,92,255,0.14)",
              color: "#9B8CFF",
              border: "1px solid rgba(122,92,255,0.35)",
            }}
          >
            ✦ {rewardLabel}
          </span>
        </div>
      </div>

      <div className="mt-2.5 flex items-center gap-3">
        <div
          className="relative flex-1 h-2.5 rounded-full overflow-hidden"
          style={{
            background: "rgba(255,255,255,0.08)",
            border: "1px solid rgba(124,245,225,0.18)",
          }}
        >
          <div
            className="absolute inset-y-0 left-0 rounded-full"
            style={{
              width: `${pct}%`,
              background:
                "linear-gradient(90deg, #12A7A0 0%, #7CF5E1 50%, #FFD166 100%)",
              boxShadow: "0 0 10px rgba(124,245,225,0.45)",
              transition: "width 0.4s ease",
            }}
          />
        </div>
        <div
          className="text-[11px] font-bold tabular-nums whitespace-nowrap"
          style={{ color: "rgba(234,246,255,0.85)" }}
        >
          {progDisplay}
        </div>
        <div className="shrink-0 w-[92px] flex justify-end">
          {claimed ? (
            <span
              className="text-[11px] font-bold px-2 py-1 rounded-md whitespace-nowrap"
              style={{
                color: "rgba(124,245,225,0.85)",
                background: "rgba(18,167,160,0.12)",
                border: "1px solid rgba(124,245,225,0.25)",
              }}
            >
              ✓ Claimed
            </span>
          ) : done ? (
            <GlowButton variant="gold" size="sm" onClick={onClaim}>
              Claim
            </GlowButton>
          ) : (
            <span
              className="text-[11px] font-bold px-2 py-1 rounded-md opacity-70 whitespace-nowrap"
              style={{ color: "rgba(234,246,255,0.7)" }}
            >
              In Progress
            </span>
          )}
        </div>
      </div>
    </GlassPanel>
  );
}

export default QuestsModal;
