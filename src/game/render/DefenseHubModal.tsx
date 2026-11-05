// Crabtopia - Defense Hub Modal (self-contained, Glow-Tide + defensive teal/coral)
// Spec: section 10B problem 7 — "losing a raid feels terrible" fix.
// Combines Guard Posts + Dive Insurance + Bounty Board + Defense Log.
// All mock data is local; uses existing useGame selectors.
"use client";

import React, { useMemo, useState } from "react";
import { useGame } from "../store/gameStore";
import {
  GlassPanel,
  GlowButton,
  StatChip,
  SectionTitle,
  GoldIcon,
  formatGold,
  formatTime,
  EmptyState,
  CountdownRing,
} from "./ui";
import { FACTIONS } from "../content/factions";
import type { FactionId } from "../types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type GuardPostLevel = 0 | 1 | 2 | 3;

interface Bounty {
  id: string;
  postedBy: string;
  targetName: string;
  reward: number; // GOLD
  reason: string;
  claimed: boolean;
  postedAt: number;
}

interface DefenseLogEntry {
  id: string;
  raidId: string;
  outcome: "defended" | "lost";
  stolenAmount: number;
  date: number;
  opponentName: string;
  opponentBp: number;
  myBp: number;
  tips: string[];
}

type TabId = "guard-posts" | "insurance" | "bounty-board" | "defense-log";

// ---------------------------------------------------------------------------
// Static config
// ---------------------------------------------------------------------------

const THEFT_CAP_BASE = 65; // % of reward a successful raid can steal without defenses
const INSURANCE_CAP = 50; // % cap when dive is insured
const INSURANCE_RATE = 0.05; // 5% of expected reward
const INSURANCE_MIN = 50; // minimum GOLD
const INSURANCE_DURATION_MS = 1000 * 60 * 60 * 6; // 6h mock coverage

interface GuardPostTier {
  level: GuardPostLevel;
  name: string;
  reduction: number; // percent theft reduction
  cost: number; // GOLD to upgrade to this level (0 = free / starting)
  blurb: string;
  perks: string[];
}

const GUARD_POST_TIERS: GuardPostTier[] = [
  {
    level: 0,
    name: "No Guard Post",
    reduction: 0,
    cost: 0,
    blurb: "No Guard Post — raids steal up to 65%",
    perks: ["Burrow is undefended", "Full 65% theft exposure"],
  },
  {
    level: 1,
    name: "Wooden Palisade",
    reduction: 3,
    cost: 2000,
    blurb: "Wooden Palisade — reduces theft by 3%",
    perks: ["3% theft reduction", "Basic spike barrier"],
  },
  {
    level: 2,
    name: "Coral Watchtower",
    reduction: 5,
    cost: 6000,
    blurb: "Coral Watchtower — reduces theft by 5% + raid warnings",
    perks: ["5% theft reduction", "Raid warning alerts", "Lookout sees incoming raids"],
  },
  {
    level: 3,
    name: "Tidestone Bastion",
    reduction: 10,
    cost: 15000,
    blurb: "Tidestone Bastion — reduces theft by 10% + free defensive reinforcement slot",
    perks: ["10% theft reduction", "Raid warnings", "Free defensive reinforcement slot"],
  },
];

function tierFor(level: GuardPostLevel): GuardPostTier {
  return GUARD_POST_TIERS.find((t) => t.level === level) ?? GUARD_POST_TIERS[0];
}

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const NOW = Date.now();

const MOCK_BOUNTIES: Bounty[] = [
  {
    id: "mb1",
    postedBy: "TidecallerRia",
    targetName: "Brinefang",
    reward: 250,
    reason: "Stole 350 GOLD from me",
    claimed: false,
    postedAt: NOW - 1000 * 60 * 60 * 2,
  },
  {
    id: "mb2",
    postedBy: "CoralKnight",
    targetName: "Pinchscar",
    reward: 500,
    reason: "Raided my reef plot twice this week",
    claimed: false,
    postedAt: NOW - 1000 * 60 * 60 * 5,
  },
  {
    id: "mb3",
    postedBy: "MangroveMae",
    targetName: "Embertide",
    reward: 1000,
    reason: "Stole 1200 GOLD during my deep dive",
    claimed: false,
    postedAt: NOW - 1000 * 60 * 60 * 8,
  },
  {
    id: "mb4",
    postedBy: "Stormseeker",
    targetName: "Gloamshell",
    reward: 750,
    reason: "Wiped my defending team in under 30s",
    claimed: false,
    postedAt: NOW - 1000 * 60 * 60 * 26,
  },
  {
    id: "mb5",
    postedBy: "FrostWarden",
    targetName: "Kelpreaver",
    reward: 300,
    reason: "Stole 400 GOLD from my claim",
    claimed: false,
    postedAt: NOW - 1000 * 60 * 60 * 49,
  },
];

const LOST_TIPS = [
  "Your Front line lacked a Bulwark — try positioning a tank-class crab in Front.",
  "Your Back line was exposed — add a Tidecaller or Shellmender for ranged cover.",
  "No faction synergy bonus — fielding 2+ same-faction crabs gives +5% BP.",
  "Your formation was too slow — a Stormwake Skitter could disrupt their opener.",
  "No Tactic Card equipped — Fortify adds a defensive shield on turn 1.",
];

const WON_TIPS = [
  "Solid defense! Your {faction} faction bonus carried the win.",
  "Perfect formation — your Front Bulwark absorbed the burst cleanly.",
  "Great Tactic Card timing — Counter punished their aggressor.",
  "Faction wheel advantage held — keep exploiting matchups you beat.",
];

function pickTip(pool: string[], seed: number): string {
  return pool[seed % pool.length];
}

function buildMockDefenseLog(playerFactionName: string): DefenseLogEntry[] {
  return [
    {
      id: "mdl1",
      raidId: "r_mock_1",
      outcome: "lost",
      stolenAmount: 422,
      date: NOW - 1000 * 60 * 60 * 3,
      opponentName: "Brinefang",
      opponentBp: 1840,
      myBp: 1620,
      tips: [pickTip(LOST_TIPS, 0)],
    },
    {
      id: "mdl2",
      raidId: "r_mock_2",
      outcome: "defended",
      stolenAmount: 0,
      date: NOW - 1000 * 60 * 60 * 8,
      opponentName: "Pinchscar",
      opponentBp: 1500,
      myBp: 1820,
      tips: [WON_TIPS[0].replace("{faction}", playerFactionName)],
    },
    {
      id: "mdl3",
      raidId: "r_mock_3",
      outcome: "lost",
      stolenAmount: 612,
      date: NOW - 1000 * 60 * 60 * 30,
      opponentName: "Embertide",
      opponentBp: 2110,
      myBp: 1740,
      tips: [pickTip(LOST_TIPS, 2)],
    },
    {
      id: "mdl4",
      raidId: "r_mock_4",
      outcome: "defended",
      stolenAmount: 0,
      date: NOW - 1000 * 60 * 60 * 50,
      opponentName: "Gloamshell",
      opponentBp: 1480,
      myBp: 1900,
      tips: [WON_TIPS[1]],
    },
    {
      id: "mdl5",
      raidId: "r_mock_5",
      outcome: "lost",
      stolenAmount: 285,
      date: NOW - 1000 * 60 * 60 * 120,
      opponentName: "Kelpreaver",
      opponentBp: 1690,
      myBp: 1550,
      tips: [pickTip(LOST_TIPS, 4)],
    },
  ];
}

// ---------------------------------------------------------------------------
// Sub-component: CSS-built guard post illustration
// ---------------------------------------------------------------------------

function GuardPostArt({ level }: { level: GuardPostLevel }) {
  // Plot ground is always rendered; fortification grows with level.
  return (
    <div
      className="relative rounded-xl overflow-hidden mx-auto"
      style={{
        width: 220,
        height: 130,
        background:
          "linear-gradient(180deg, rgba(10,27,61,0.35) 0%, rgba(18,167,160,0.18) 60%, rgba(124,245,225,0.08) 100%)",
        border: "1px solid rgba(124,245,225,0.2)",
      }}
      aria-label={`Guard post level ${level} illustration`}
    >
      {/* sand floor */}
      <div
        className="absolute bottom-0 left-0 right-0"
        style={{
          height: 34,
          background: "linear-gradient(180deg, #2a3b1f 0%, #1a2410 100%)",
          borderTop: "1px solid rgba(184,216,105,0.35)",
        }}
      />
      {/* water shimmer */}
      <div
        className="absolute inset-x-0 top-0 opacity-40"
        style={{
          height: 40,
          background:
            "repeating-linear-gradient(90deg, rgba(124,245,225,0.08) 0 8px, transparent 8px 16px)",
        }}
      />

      {level === 0 && (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-xs text-white/50 italic">Empty plot</span>
        </div>
      )}

      {level >= 1 && (
        // Wooden spikes
        <div className="absolute bottom-[28px] left-1/2 -translate-x-1/2 flex items-end gap-1.5">
          {[0, 1, 2, 3, 4].map((i) => (
            <div
              key={i}
              style={{
                width: 6,
                height: 26 + (i % 3) * 6,
                background: "linear-gradient(180deg, #8a5a2b 0%, #5c3a17 100%)",
                clipPath: "polygon(50% 0, 100% 100%, 0 100%)",
                borderRadius: 1,
              }}
            />
          ))}
        </div>
      )}

      {level >= 2 && (
        // Coral watchtower: a taller central tower with a window
        <div className="absolute bottom-[28px] left-1/2 -translate-x-1/2">
          <div
            style={{
              width: 48,
              height: 70,
              background: "linear-gradient(180deg, #FF6F91 0%, #8C2D52 100%)",
              borderRadius: 6,
              border: "1px solid rgba(255,209,102,0.5)",
              boxShadow: "0 0 12px rgba(255,111,145,0.45)",
            }}
          >
            {/* window */}
            <div
              className="absolute"
              style={{
                top: 16,
                left: "50%",
                transform: "translateX(-50%)",
                width: 14,
                height: 14,
                background: "rgba(255,209,102,0.85)",
                borderRadius: 3,
                boxShadow: "0 0 6px rgba(255,209,102,0.8)",
              }}
            />
          </div>
        </div>
      )}

      {level >= 3 && (
        // Tidestone Bastion: fortified tower + crenellations + banner
        <div className="absolute bottom-[28px] left-1/2 -translate-x-1/2">
          <div
            style={{
              width: 64,
              height: 78,
              background: "linear-gradient(180deg, #7CF5E1 0%, #0A4A66 100%)",
              borderRadius: 6,
              border: "2px solid rgba(124,245,225,0.8)",
              boxShadow: "0 0 16px rgba(124,245,225,0.55)",
            }}
          >
            {/* crenellations */}
            <div className="flex absolute top-0 left-0 right-0 justify-between px-[2px]">
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  style={{
                    width: 12,
                    height: 8,
                    background: "#7CF5E1",
                    borderRadius: 1,
                  }}
                />
              ))}
            </div>
            {/* reinforced door */}
            <div
              className="absolute"
              style={{
                bottom: 0,
                left: "50%",
                transform: "translateX(-50%)",
                width: 18,
                height: 24,
                background: "#0A1B3D",
                border: "1px solid rgba(124,245,225,0.6)",
                borderRadius: 2,
              }}
            />
            {/* banner pole + flag */}
            <div
              className="absolute"
              style={{
                top: -28,
                left: "50%",
                transform: "translateX(-50%)",
                width: 2,
                height: 28,
                background: "#FFD166",
              }}
            />
            <div
              className="absolute"
              style={{
                top: -26,
                left: "calc(50% + 1px)",
                width: 18,
                height: 12,
                background: "linear-gradient(90deg, #FF6F91 0%, #FFD166 100%)",
                clipPath: "polygon(0 0, 100% 0, 75% 50%, 100% 100%, 0 100%)",
                boxShadow: "0 0 6px rgba(255,111,145,0.6)",
              }}
            />
          </div>
        </div>
      )}

      {/* level badge */}
      <div
        className="absolute top-1.5 right-1.5 text-[9px] font-bold px-1.5 py-0.5 rounded"
        style={{
          background: "rgba(10,27,61,0.7)",
          color: "#7CF5E1",
          border: "1px solid rgba(124,245,225,0.3)",
        }}
      >
        L{level}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab button
// ---------------------------------------------------------------------------

function TabButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: string;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 px-3 py-2 text-xs md:text-sm font-bold rounded-lg transition-all whitespace-nowrap"
      style={{
        background: active ? "rgba(18,167,160,0.25)" : "rgba(255,255,255,0.04)",
        border: `1px solid ${active ? "rgba(124,245,225,0.55)" : "rgba(124,245,225,0.15)"}`,
        color: active ? "#7CF5E1" : "rgba(234,246,255,0.7)",
        boxShadow: active ? "0 0 12px rgba(18,167,160,0.35)" : "none",
      }}
      aria-pressed={active}
    >
      <span aria-hidden>{icon}</span>
      <span>{label}</span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Main modal
// ---------------------------------------------------------------------------

export function DefenseHubModal({ onClose }: { onClose: () => void }) {
  // ---- store selectors ---------------------------------------------------
  const player = useGame((s) => s.player);
  const worldSites = useGame((s) => s.worldSites);
  const spendGold = useGame((s) => s.spendGold);
  const pushToast = useGame((s) => s.pushToast);

  // ---- local state -------------------------------------------------------
  const [tab, setTab] = useState<TabId>("guard-posts");
  const [guardPostLevel, setGuardPostLevel] = useState<GuardPostLevel>(
    Math.max(0, Math.min(3, player?.guardPostLevel ?? 0)) as GuardPostLevel
  );
  const [activeInsurancePolicies, setActiveInsurancePolicies] = useState<
    { siteId: string; expiresAt: number; price: number }[]
  >([]);
  const [mockBounties] = useState<Bounty[]>(MOCK_BOUNTIES);
  const [myPostedBounties, setMyPostedBounties] = useState<Bounty[]>([]);

  // bounty form state
  const [bountyTarget, setBountyTarget] = useState("");
  const [bountyReward, setBountyReward] = useState(100);
  const [bountyReason, setBountyReason] = useState("");

  // ---- derived: player faction + name -----------------------------------
  const playerName = player?.name ?? "Shellwarden";
  const shellwardenLevel = player?.shellwardenLevel ?? 1;
  const playerFaction: FactionId =
    player?.crabs?.[0]?.faction ?? "coral_court";
  const playerFactionName = FACTIONS[playerFaction].name;

  // ---- derived: defense log (from player.raids or mock fallback) ---------
  const defenseLog = useMemo<DefenseLogEntry[]>(() => {
    const raids = player?.raids ?? [];
    const fromRaids: DefenseLogEntry[] = raids
      .filter((r) => r.state === "resolved" && r.result)
      .map((r, i) => {
        const result = r.result!;
        const defended = result.winner === "defender";
        const tip = defended
          ? WON_TIPS[i % WON_TIPS.length].replace("{faction}", playerFactionName)
          : pickTip(LOST_TIPS, i);
        const outcome: "defended" | "lost" = defended ? "defended" : "lost";
        return {
          id: `dl_${r.id}`,
          raidId: r.id,
          outcome,
          stolenAmount: result.stolenAmount,
          date: r.startTime,
          opponentName: r.raiderName,
          opponentBp: result.raiderBP,
          myBp: result.defenderBP,
          tips: [tip],
        };
      })
      .slice(0, 12);
    if (fromRaids.length > 0) return fromRaids;
    return buildMockDefenseLog(playerFactionName);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player?.raids, playerFactionName]);

  // ---- derived: active player dives (deployed) --------------------------
  const activeDives = useMemo(
    () => worldSites.filter((s) => s.ownerIsPlayer && s.state === "deployed"),
    [worldSites]
  );

  // ---- derived: summary stats (last 7 days) ------------------------------
  const sevenDaysMs = 1000 * 60 * 60 * 24 * 7;
  const cutoff = Date.now() - sevenDaysMs;
  const recent = defenseLog.filter((e) => e.date >= cutoff);
  const wins = recent.filter((e) => e.outcome === "defended").length;
  const losses = recent.filter((e) => e.outcome === "lost").length;
  const stolenTotal = recent.reduce((s, e) => s + e.stolenAmount, 0);
  // Gold "defended" = mock estimate of gold saved on successful defenses.
  const defendedTotal = recent
    .filter((e) => e.outcome === "defended")
    .reduce((s, e) => s + Math.round(e.myBp * 0.4), 0);

  // ---- guard post handlers ----------------------------------------------
  const currentTier = tierFor(guardPostLevel);
  const nextTier = tierFor((guardPostLevel + 1) as GuardPostLevel);
  const canUpgrade = guardPostLevel < 3;
  const theftCap = THEFT_CAP_BASE - currentTier.reduction;

  const handleUpgradeGuardPost = () => {
    if (!canUpgrade) {
      pushToast({
        title: "Guard Post maxed out!",
        description: "Tidestone Bastion is the strongest fortification.",
        variant: "warning",
      });
      return;
    }
    const target = nextTier;
    if (spendGold(target.cost)) {
      setGuardPostLevel(target.level);
      pushToast({
        title: `Guard Post upgraded to L${target.level}!`,
        description: target.blurb,
        variant: "success",
      });
    } else {
      pushToast({
        title: "Not enough GOLD",
        description: `Need ${formatGold(target.cost)} GOLD to build ${target.name}.`,
        variant: "error",
      });
    }
  };

  // ---- insurance handlers ------------------------------------------------
  const expectedRewardFor = (siteId: string): number => {
    const s = worldSites.find((w) => w.id === siteId);
    if (!s) return 0;
    return s.rewardRemaining > 0 ? s.rewardRemaining : s.baseReward;
  };

  const insurancePriceFor = (siteId: string): number => {
    return Math.max(INSURANCE_MIN, Math.round(expectedRewardFor(siteId) * INSURANCE_RATE));
  };

  const isInsured = (siteId: string): boolean => {
    return activeInsurancePolicies.some(
      (p) => p.siteId === siteId && p.expiresAt > Date.now()
    );
  };

  const handleInsureDive = (siteId: string) => {
    const price = insurancePriceFor(siteId);
    if (isInsured(siteId)) {
      pushToast({
        title: "Dive already insured",
        description: "This dive already has active insurance.",
        variant: "warning",
      });
      return;
    }
    if (spendGold(price)) {
      setActiveInsurancePolicies((prev) => [
        ...prev,
        { siteId, expiresAt: Date.now() + INSURANCE_DURATION_MS, price },
      ]);
      pushToast({
        title: "Dive insured!",
        description: `Maximum theft capped at ${INSURANCE_CAP}%.`,
        variant: "success",
      });
    } else {
      pushToast({
        title: "Not enough GOLD",
        description: `Need ${formatGold(price)} GOLD for dive insurance.`,
        variant: "error",
      });
    }
  };

  const handleInsureAll = () => {
    const uninsurable = activeDives.filter((s) => !isInsured(s.id));
    if (uninsurable.length === 0) {
      pushToast({
        title: "Nothing to insure",
        description: "All active dives are already insured.",
        variant: "warning",
      });
      return;
    }
    const totalRaw = uninsurable.reduce((s, site) => s + insurancePriceFor(site.id), 0);
    const total = Math.round(totalRaw * 0.9); // 10% bulk savings
    if (spendGold(total)) {
      const newPolicies = uninsurable.map((site) => ({
        siteId: site.id,
        expiresAt: Date.now() + INSURANCE_DURATION_MS,
        price: insurancePriceFor(site.id),
      }));
      setActiveInsurancePolicies((prev) => [...prev, ...newPolicies]);
      pushToast({
        title: `Insured ${uninsurable.length} dives!`,
        description: `Bulk discount applied. Paid ${formatGold(total)} GOLD. Max theft capped at ${INSURANCE_CAP}%.`,
        variant: "success",
      });
    } else {
      pushToast({
        title: "Not enough GOLD",
        description: `Need ${formatGold(total)} GOLD to insure all dives.`,
        variant: "error",
      });
    }
  };

  // ---- bounty handlers ---------------------------------------------------
  const handleHuntBounty = (b: Bounty) => {
    pushToast({
      title: "Bounty accepted!",
      description: `Beat ${b.targetName} in a revenge raid to claim ${formatGold(b.reward)} GOLD.`,
      variant: "default",
    });
  };

  const handlePostBounty = () => {
    const target = bountyTarget.trim();
    if (target.length === 0) {
      pushToast({
        title: "Bounty needs a target",
        description: "Enter or pick a target name first.",
        variant: "error",
      });
      return;
    }
    if (bountyReward < 50 || bountyReward > 5000) {
      pushToast({
        title: "Invalid reward",
        description: "Reward must be between 50 and 5,000 GOLD.",
        variant: "error",
      });
      return;
    }
    if (spendGold(bountyReward)) {
      const newBounty: Bounty = {
        id: `pb_${Date.now()}`,
        postedBy: playerName,
        targetName: target,
        reward: bountyReward,
        reason: bountyReason.slice(0, 100) || `Stole GOLD from ${playerName}`,
        claimed: false,
        postedAt: Date.now(),
      };
      setMyPostedBounties((prev) => [newBounty, ...prev]);
      setBountyTarget("");
      setBountyReward(100);
      setBountyReason("");
      pushToast({
        title: "Bounty posted!",
        description: `Other Shellwardens can hunt ${target}.`,
        variant: "success",
      });
    } else {
      pushToast({
        title: "Not enough GOLD",
        description: `Need ${formatGold(bountyReward)} GOLD to post this bounty.`,
        variant: "error",
      });
    }
  };

  const handleCancelBounty = (id: string) => {
    const b = myPostedBounties.find((x) => x.id === id);
    setMyPostedBounties((prev) => prev.filter((x) => x.id !== id));
    pushToast({
      title: "Bounty cancelled",
      description: b ? `${formatGold(b.reward)} GOLD bounty on ${b.targetName} withdrawn.` : "Bounty withdrawn.",
      variant: "warning",
    });
  };

  // ---- revenge + replay handlers ----------------------------------------
  const handleRevenge = (opponentName: string) => {
    pushToast({
      title: "Revenge raid launched!",
      description: `+10% BP bonus against ${opponentName}.`,
      variant: "default",
    });
  };

  const handleWatchReplay = (raidId: string) => {
    pushToast({
      title: "Replay loading...",
      description: `Rendering battle replay for raid ${raidId}.`,
      variant: "default",
    });
  };

  // ---- unique opponents from defense log (for revenge + bounty pick) ----
  const opponentNames = useMemo(() => {
    const seen = new Set<string>();
    const list: string[] = [];
    for (const e of defenseLog) {
      if (!seen.has(e.opponentName)) {
        seen.add(e.opponentName);
        list.push(e.opponentName);
      }
    }
    return list;
  }, [defenseLog]);

  // =========================================================================
  // Render
  // =========================================================================

  const gold = player?.gold ?? 0;

  return (
    <div
      className="fixed inset-0 z-[150] flex items-center justify-center p-3 md:p-6 bg-black/70 backdrop-blur-md"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Burrow Defense Hub"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-3xl max-h-[88vh] flex flex-col rounded-2xl overflow-hidden animate-slide-up"
        style={{
          background:
            "linear-gradient(160deg, rgba(6,18,43,0.97) 0%, rgba(10,74,102,0.85) 100%)",
          border: "1px solid rgba(124,245,225,0.35)",
          boxShadow:
            "0 12px 60px rgba(18,167,160,0.35), 0 0 24px rgba(255,111,145,0.12)",
        }}
      >
        {/* Header */}
        <header
          className="flex-shrink-0 px-4 md:px-6 pt-4 pb-3 border-b sticky top-0 z-10"
          style={{
            borderColor: "rgba(124,245,225,0.18)",
            background: "rgba(6,18,43,0.85)",
            backdropFilter: "blur(8px)",
          }}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h1
                className="text-lg md:text-xl font-bold flex items-center gap-2"
                style={{ fontFamily: "Fredoka, system-ui, sans-serif" }}
              >
                <span aria-hidden>🛡️</span>
                <span style={{ color: "#7CF5E1" }}>Burrow Defense</span>
              </h1>
              <p className="text-[11px] md:text-xs text-white/60 mt-0.5">
                Guard Posts · Dive Insurance · Bounty Board · Defense Log
              </p>
            </div>
            <div className="flex items-center gap-2">
              <StatChip
                label="Gold"
                value={
                  <span className="inline-flex items-center gap-1">
                    <GoldIcon size={12} />
                    {formatGold(gold)}
                  </span>
                }
                color="#FFD166"
              />
              <StatChip
                label="Warden"
                value={`Lv ${shellwardenLevel}`}
                color="#7CF5E1"
              />
              <button
                onClick={onClose}
                className="text-white/60 hover:text-white w-8 h-8 flex items-center justify-center rounded-md hover:bg-white/10 transition-colors"
                aria-label="Close Defense Hub"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Tabs */}
          <nav className="flex gap-1.5 mt-3 overflow-x-auto pb-1" aria-label="Defense Hub tabs">
            <TabButton active={tab === "guard-posts"} onClick={() => setTab("guard-posts")} icon="🛡️" label="Guard Posts" />
            <TabButton active={tab === "insurance"} onClick={() => setTab("insurance")} icon="🛟" label="Dive Insurance" />
            <TabButton active={tab === "bounty-board"} onClick={() => setTab("bounty-board")} icon="💀" label="Bounty Board" />
            <TabButton active={tab === "defense-log"} onClick={() => setTab("defense-log")} icon="📜" label="Defense Log" />
          </nav>
        </header>

        {/* Body */}
        <main className="flex-1 overflow-y-auto px-4 md:px-6 py-4 md:py-5">
          {/* ============== GUARD POSTS TAB ============== */}
          {tab === "guard-posts" && (
            <section aria-label="Guard Posts" className="space-y-4">
              <SectionTitle
                icon={<span aria-hidden>🛡️</span>}
                title="Your Guard Post"
                action={
                  <div
                    className="text-[10px] md:text-xs px-2 py-1 rounded-md font-bold"
                    style={{
                      background: "rgba(255,111,145,0.12)",
                      color: "#FF6F91",
                      border: "1px solid rgba(255,111,145,0.4)",
                    }}
                  >
                    Current theft cap: {theftCap}%
                  </div>
                }
              />

              <GlassPanel className="p-4 md:p-5">
                <div className="flex flex-col md:flex-row gap-4 items-center md:items-start">
                  <GuardPostArt level={guardPostLevel} />
                  <div className="flex-1 min-w-0 w-full">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className="text-xs font-bold px-2 py-0.5 rounded"
                        style={{
                          background: "rgba(124,245,225,0.15)",
                          color: "#7CF5E1",
                          border: "1px solid rgba(124,245,225,0.35)",
                        }}
                      >
                        Level {guardPostLevel}
                      </span>
                      <h3 className="text-base font-bold" style={{ color: "#EAF6FF" }}>
                        {currentTier.name}
                      </h3>
                    </div>
                    <p className="text-sm mt-1.5 text-white/75">{currentTier.blurb}</p>
                    <ul className="mt-2 space-y-1">
                      {currentTier.perks.map((perk, i) => (
                        <li key={i} className="text-xs text-white/65 flex items-start gap-1.5">
                          <span style={{ color: "#7CF5E1" }}>▸</span>
                          <span>{perk}</span>
                        </li>
                      ))}
                    </ul>

                    {/* Active buff */}
                    <div
                      className="mt-3 rounded-lg p-2.5 flex items-center gap-2 flex-wrap"
                      style={{
                        background: "rgba(10,74,102,0.45)",
                        border: "1px solid rgba(124,245,225,0.25)",
                      }}
                    >
                      <span className="text-[10px] uppercase tracking-wide text-white/55">
                        Active buff
                      </span>
                      <span className="text-sm font-bold" style={{ color: "#7CF5E1" }}>
                        Current theft cap: {theftCap}%
                      </span>
                      <span className="text-[10px] text-white/50">
                        (base {THEFT_CAP_BASE}% − {currentTier.reduction}% guard reduction)
                      </span>
                    </div>
                  </div>
                </div>
              </GlassPanel>

              {/* Upgrade path */}
              <SectionTitle icon={<span aria-hidden>⬆️</span>} title="Upgrade Path" />
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {GUARD_POST_TIERS.slice(1).map((t) => {
                  const isCurrent = t.level === guardPostLevel;
                  const isNext = t.level === guardPostLevel + 1;
                  const isLocked = t.level > guardPostLevel + 1;
                  return (
                    <GlassPanel
                      key={t.level}
                      className="p-3 flex flex-col gap-2"
                      glow={isNext ? "rgba(124,245,225,0.25)" : undefined}
                      style={{
                        opacity: isLocked ? 0.55 : 1,
                        borderColor: isCurrent
                          ? "rgba(124,245,225,0.55)"
                          : isNext
                            ? "rgba(255,209,102,0.45)"
                            : undefined,
                      }}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: "rgba(124,245,225,0.15)", color: "#7CF5E1" }}>
                          L{t.level}
                        </span>
                        {isCurrent && (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ background: "rgba(124,245,225,0.2)", color: "#7CF5E1" }}>
                            BUILT
                          </span>
                        )}
                        {isLocked && (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded text-white/50" style={{ background: "rgba(255,255,255,0.06)" }}>
                            LOCKED
                          </span>
                        )}
                      </div>
                      <h4 className="text-sm font-bold" style={{ color: "#EAF6FF" }}>{t.name}</h4>
                      <p className="text-[11px] text-white/60 leading-snug">{t.blurb}</p>
                      <div className="flex items-center gap-1 mt-auto">
                        <GoldIcon size={12} />
                        <span className="text-xs font-bold" style={{ color: "#FFD166" }}>{formatGold(t.cost)}</span>
                      </div>
                      {isNext && (
                        <GlowButton variant="teal" size="sm" onClick={handleUpgradeGuardPost} className="w-full mt-1">
                          Upgrade to L{t.level}
                        </GlowButton>
                      )}
                    </GlassPanel>
                  );
                })}
              </div>

              <div
                className="text-[11px] text-white/55 px-3 py-2 rounded-lg"
                style={{ background: "rgba(10,27,61,0.4)", border: "1px dashed rgba(124,245,225,0.2)" }}
              >
                💡 Guard Posts are persistent Burrow or Reef Plot upgrades. They reduce
                theft on every raid against you, automatically. Reach L3 to unlock a free
                defensive reinforcement slot in your formation.
              </div>
            </section>
          )}

          {/* ============== DIVE INSURANCE TAB ============== */}
          {tab === "insurance" && (
            <section aria-label="Dive Insurance" className="space-y-4">
              <SectionTitle icon={<span aria-hidden>🛟</span>} title="Dive Insurance" />

              <GlassPanel className="p-3.5">
                <p className="text-sm text-white/80 leading-relaxed">
                  Dive Insurance is an optional pre-dive fee that caps maximum theft at{" "}
                  <span className="font-bold" style={{ color: "#7CF5E1" }}>{INSURANCE_CAP}%</span>{" "}
                  (instead of <span className="font-bold" style={{ color: "#FF6F91" }}>{THEFT_CAP_BASE}%</span>).
                  Price is shown up front based on your dig&apos;s expected reward.
                </p>
              </GlassPanel>

              {/* Payout example */}
              <GlassPanel className="p-3.5" glow="rgba(255,209,102,0.15)">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <span aria-hidden>💡</span>
                  <span className="text-xs font-bold" style={{ color: "#FFD166" }}>Payout Example</span>
                </div>
                <p className="text-[12px] text-white/75 leading-relaxed">
                  If your <span className="font-bold text-white">1,000 GOLD</span> dig is raided,
                  without insurance you lose up to <span className="font-bold" style={{ color: "#FF6F91" }}>650 GOLD</span>.
                  With insurance, you lose max <span className="font-bold" style={{ color: "#7CF5E1" }}>500 GOLD</span>.
                  Insurance cost: <span className="font-bold" style={{ color: "#FFD166" }}>50 GOLD</span>.
                  Net savings if raided: <span className="font-bold" style={{ color: "#7CF5E1" }}>100 GOLD</span>.
                </p>
              </GlassPanel>

              {/* Active policies */}
              <SectionTitle icon={<span aria-hidden>📋</span>} title="Active Policies" />
              {activeInsurancePolicies.length === 0 ? (
                <EmptyState
                  compact
                  message="No active insurance policies"
                  hint="Insure a dive below to cap theft at 50%."
                />
              ) : (
                <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                  {activeInsurancePolicies.map((p) => {
                    const site = worldSites.find((w) => w.id === p.siteId);
                    const total = INSURANCE_DURATION_MS;
                    const remaining = Math.max(0, p.expiresAt - Date.now());
                    const progress = remaining / total;
                    const expired = remaining <= 0;
                    return (
                      <GlassPanel key={p.siteId} className="p-3 flex items-center gap-3">
                        <CountdownRing
                          progress={progress}
                          size={44}
                          color={expired ? "#FF6F91" : "#7CF5E1"}
                          glow={!expired}
                          label={<span className="text-[9px]">{formatTime(remaining)}</span>}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-bold truncate" style={{ color: "#EAF6FF" }}>
                            {site?.name ?? p.siteId}
                          </div>
                          <div className="text-[11px] text-white/60">
                            Expires in {formatTime(remaining)} · Paid {formatGold(p.price)} GOLD
                          </div>
                        </div>
                        <span
                          className="text-[9px] font-bold px-2 py-1 rounded uppercase tracking-wide"
                          style={{
                            background: expired ? "rgba(255,111,145,0.18)" : "rgba(124,245,225,0.18)",
                            color: expired ? "#FF6F91" : "#7CF5E1",
                            border: `1px solid ${expired ? "rgba(255,111,145,0.4)" : "rgba(124,245,225,0.4)"}`,
                          }}
                        >
                          {expired ? "Expired" : "Protected"}
                        </span>
                      </GlassPanel>
                    );
                  })}
                </div>
              )}

              {/* Active dives to insure */}
              <SectionTitle
                icon={<span aria-hidden>🌊</span>}
                title="Your Active Dives"
                action={
                  activeDives.length > 0 ? (
                    <GlowButton variant="gold" size="sm" onClick={handleInsureAll}>
                      Insure all (−10%)
                    </GlowButton>
                  ) : undefined
                }
              />
              {activeDives.length === 0 ? (
                <EmptyState
                  compact
                  message="No active dives deployed"
                  hint="Deploy a team to a dig site to enable per-dive insurance."
                />
              ) : (
                <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                  {activeDives.map((site) => {
                    const expected = expectedRewardFor(site.id);
                    const price = insurancePriceFor(site.id);
                    const insured = isInsured(site.id);
                    return (
                      <GlassPanel key={site.id} className="p-3 flex flex-col sm:flex-row sm:items-center gap-2.5">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-bold truncate" style={{ color: "#EAF6FF" }}>{site.name}</span>
                            {insured && (
                              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ background: "rgba(124,245,225,0.18)", color: "#7CF5E1", border: "1px solid rgba(124,245,225,0.4)" }}>
                                INSURED
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-white/60 mt-0.5 flex items-center gap-3 flex-wrap">
                            <span>Expected: <GoldIcon size={11} /> <span className="font-bold" style={{ color: "#FFD166" }}>{formatGold(expected)}</span></span>
                            <span>Insurance: <GoldIcon size={11} /> <span className="font-bold" style={{ color: "#FFD166" }}>{formatGold(price)}</span></span>
                          </div>
                        </div>
                        <GlowButton
                          variant={insured ? "ghost" : "teal"}
                          size="sm"
                          disabled={insured}
                          onClick={() => handleInsureDive(site.id)}
                          className="sm:w-auto w-full"
                        >
                          {insured ? "Covered" : `Insure Dive`}
                        </GlowButton>
                      </GlassPanel>
                    );
                  })}
                </div>
              )}
            </section>
          )}

          {/* ============== BOUNTY BOARD TAB ============== */}
          {tab === "bounty-board" && (
            <section aria-label="Bounty Board" className="space-y-5">
              {/* Open Bounties */}
              <div>
                <SectionTitle
                  icon={<span aria-hidden>💀</span>}
                  title="Open Bounties"
                  action={<span className="text-[11px] text-white/55">{mockBounties.length} posted</span>}
                />
                <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                  {mockBounties.map((b) => (
                    <GlassPanel key={b.id} className="p-3 flex items-center gap-3">
                      <div
                        className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-base"
                        style={{ background: "rgba(255,111,145,0.15)", border: "1px solid rgba(255,111,145,0.4)" }}
                        aria-hidden
                      >
                        💀
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-bold truncate" style={{ color: "#FF6F91" }}>{b.targetName}</span>
                          <span className="text-[10px] text-white/45">by {b.postedBy}</span>
                        </div>
                        <div className="text-[11px] text-white/60 truncate">{b.reason}</div>
                        <div className="text-[10px] text-white/40 mt-0.5">Posted {formatTime(Date.now() - b.postedAt)} ago</div>
                      </div>
                      <div className="flex flex-col items-end gap-1 flex-shrink-0">
                        <span className="inline-flex items-center gap-1 text-sm font-bold" style={{ color: "#FFD166" }}>
                          <GoldIcon size={12} />{formatGold(b.reward)}
                        </span>
                        <GlowButton variant="rose" size="sm" onClick={() => handleHuntBounty(b)}>
                          Hunt
                        </GlowButton>
                      </div>
                    </GlassPanel>
                  ))}
                </div>
              </div>

              {/* Post a Bounty */}
              <div>
                <SectionTitle icon={<span aria-hidden>📌</span>} title="Post a Bounty" />
                <GlassPanel className="p-3.5 space-y-3">
                  <div>
                    <label className="text-[10px] uppercase tracking-wide text-white/55 block mb-1">Target name</label>
                    <input
                      type="text"
                      value={bountyTarget}
                      onChange={(e) => setBountyTarget(e.target.value)}
                      placeholder="Enter raider name..."
                      className="w-full text-sm px-3 py-2 rounded-lg outline-none"
                      style={{
                        background: "rgba(10,27,61,0.6)",
                        border: "1px solid rgba(124,245,225,0.25)",
                        color: "#EAF6FF",
                      }}
                    />
                    {opponentNames.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        <span className="text-[10px] text-white/45 self-center">From log:</span>
                        {opponentNames.slice(0, 4).map((n) => (
                          <button
                            key={n}
                            onClick={() => setBountyTarget(n)}
                            className="text-[10px] px-1.5 py-0.5 rounded transition-colors hover:bg-white/10"
                            style={{
                              background: "rgba(255,111,145,0.1)",
                              border: "1px solid rgba(255,111,145,0.3)",
                              color: "#FF6F91",
                            }}
                          >
                            {n}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="text-[10px] uppercase tracking-wide text-white/55 block mb-1">
                      Reward: <span style={{ color: "#FFD166" }}>{formatGold(bountyReward)} GOLD</span> (50–5,000)
                    </label>
                    <input
                      type="range"
                      min={50}
                      max={5000}
                      step={50}
                      value={bountyReward}
                      onChange={(e) => setBountyReward(Number(e.target.value))}
                      className="w-full accent-amber-400"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] uppercase tracking-wide text-white/55 block mb-1">
                      Reason ({bountyReason.length}/100)
                    </label>
                    <textarea
                      value={bountyReason}
                      onChange={(e) => setBountyReason(e.target.value.slice(0, 100))}
                      placeholder="Stole GOLD from me..."
                      rows={2}
                      className="w-full text-sm px-3 py-2 rounded-lg outline-none resize-none"
                      style={{
                        background: "rgba(10,27,61,0.6)",
                        border: "1px solid rgba(124,245,225,0.25)",
                        color: "#EAF6FF",
                      }}
                    />
                  </div>

                  <GlowButton variant="gold" onClick={handlePostBounty} className="w-full">
                    Post Bounty (cost: {formatGold(bountyReward)})
                  </GlowButton>
                </GlassPanel>
              </div>

              {/* My Posted Bounties */}
              <div>
                <SectionTitle icon={<span aria-hidden>🗂️</span>} title="My Posted Bounties" />
                {myPostedBounties.length === 0 ? (
                  <EmptyState compact message="No bounties posted yet" hint="Post a bounty above to enlist other Shellwardens." />
                ) : (
                  <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                    {myPostedBounties.map((b) => (
                      <GlassPanel key={b.id} className="p-3 flex items-center gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-bold truncate" style={{ color: "#FF6F91" }}>{b.targetName}</span>
                            <span
                              className="text-[9px] font-bold px-1.5 py-0.5 rounded uppercase"
                              style={{
                                background: "rgba(124,245,225,0.15)",
                                color: "#7CF5E1",
                                border: "1px solid rgba(124,245,225,0.35)",
                              }}
                            >
                              Open
                            </span>
                          </div>
                          <div className="text-[11px] text-white/60 truncate">{b.reason}</div>
                        </div>
                        <span className="inline-flex items-center gap-1 text-sm font-bold flex-shrink-0" style={{ color: "#FFD166" }}>
                          <GoldIcon size={12} />{formatGold(b.reward)}
                        </span>
                        <GlowButton variant="ghost" size="sm" onClick={() => handleCancelBounty(b.id)}>
                          Cancel
                        </GlowButton>
                      </GlassPanel>
                    ))}
                  </div>
                )}
              </div>

              {/* Revenge Raids */}
              <div>
                <SectionTitle icon={<span aria-hidden>⚔️</span>} title="Revenge Raids" />
                {opponentNames.length === 0 ? (
                  <EmptyState compact message="No recent opponents" hint="Defend or lose a raid to unlock revenge targets." />
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {opponentNames.map((n) => (
                      <GlassPanel key={n} className="p-2.5 flex items-center justify-between gap-2">
                        <span className="text-sm font-bold truncate" style={{ color: "#FF6F91" }}>{n}</span>
                        <GlowButton variant="rose" size="sm" onClick={() => handleRevenge(n)}>
                          Revenge Raid
                        </GlowButton>
                      </GlassPanel>
                    ))}
                  </div>
                )}
              </div>
            </section>
          )}

          {/* ============== DEFENSE LOG TAB ============== */}
          {tab === "defense-log" && (
            <section aria-label="Defense Log" className="space-y-4">
              {/* Summary stats */}
              <GlassPanel className="p-3.5" glow="rgba(124,245,225,0.15)">
                <div className="flex items-center gap-2 flex-wrap text-xs md:text-sm">
                  <span className="text-white/55 font-bold">Last 7 days:</span>
                  <span className="font-bold" style={{ color: "#7CF5E1" }}>{wins}W</span>
                  <span className="text-white/40">/</span>
                  <span className="font-bold" style={{ color: "#FF6F91" }}>{losses}L</span>
                  <span className="text-white/30">·</span>
                  <span className="inline-flex items-center gap-1 text-white/75">
                    <GoldIcon size={11} />
                    <span className="font-bold" style={{ color: "#FF6F91" }}>{formatGold(stolenTotal)}</span>
                    <span className="text-white/55">stolen</span>
                  </span>
                  <span className="text-white/30">·</span>
                  <span className="inline-flex items-center gap-1 text-white/75">
                    <GoldIcon size={11} />
                    <span className="font-bold" style={{ color: "#7CF5E1" }}>{formatGold(defendedTotal)}</span>
                    <span className="text-white/55">defended</span>
                  </span>
                </div>
              </GlassPanel>

              <SectionTitle icon={<span aria-hidden>📜</span>} title="Recent Raids" />

              {defenseLog.length === 0 ? (
                <EmptyState message="No raids logged yet" hint="Once you defend or lose a raid, it will appear here with replays and tips." />
              ) : (
                <div className="space-y-2.5 max-h-[52vh] overflow-y-auto pr-1">
                  {defenseLog.map((entry) => {
                    const defended = entry.outcome === "defended";
                    const accent = defended ? "#7CF5E1" : "#FF6F91";
                    return (
                      <GlassPanel key={entry.id} className="p-3">
                        {/* Header row */}
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <div className="flex items-center gap-2">
                            <span
                              className="text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide"
                              style={{
                                background: accent + "22",
                                color: accent,
                                border: `1px solid ${accent}55`,
                              }}
                            >
                              {defended ? "Defended" : "Lost"}
                            </span>
                            <span className="text-xs text-white/55">{formatTime(Date.now() - entry.date)} ago</span>
                          </div>
                          <GlowButton variant="ghost" size="sm" onClick={() => handleWatchReplay(entry.raidId)}>
                            ▶ Watch Replay
                          </GlowButton>
                        </div>

                        {/* Opponent + BP */}
                        <div className="mt-2 grid grid-cols-2 gap-2">
                          <div className="rounded-lg p-2" style={{ background: "rgba(255,111,145,0.08)", border: "1px solid rgba(255,111,145,0.25)" }}>
                            <div className="text-[10px] uppercase tracking-wide text-white/45">Opponent</div>
                            <div className="text-sm font-bold truncate" style={{ color: "#FF6F91" }}>{entry.opponentName}</div>
                            <div className="text-[10px] text-white/55">BP {entry.opponentBp.toLocaleString()}</div>
                          </div>
                          <div className="rounded-lg p-2" style={{ background: "rgba(124,245,225,0.08)", border: "1px solid rgba(124,245,225,0.25)" }}>
                            <div className="text-[10px] uppercase tracking-wide text-white/45">Your Defense</div>
                            <div className="text-sm font-bold" style={{ color: "#7CF5E1" }}>BP {entry.myBp.toLocaleString()}</div>
                            <div className="text-[10px] text-white/55">
                              {entry.stolenAmount > 0 ? (
                                <span className="inline-flex items-center gap-0.5">
                                  <GoldIcon size={10} /> {formatGold(entry.stolenAmount)} stolen
                                </span>
                              ) : (
                                "0 stolen"
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Tips */}
                        {entry.tips.length > 0 && (
                          <div
                            className="mt-2 rounded-lg p-2 text-[11px] leading-snug"
                            style={{
                              background: defended ? "rgba(124,245,225,0.08)" : "rgba(255,209,102,0.08)",
                              border: `1px solid ${defended ? "rgba(124,245,225,0.25)" : "rgba(255,209,102,0.3)"}`,
                              color: "#EAF6FF",
                            }}
                          >
                            {entry.tips.map((t, i) => (
                              <div key={i}>{t}</div>
                            ))}
                          </div>
                        )}
                      </GlassPanel>
                    );
                  })}
                </div>
              )}

              <div
                className="text-[11px] text-white/55 px-3 py-2 rounded-lg"
                style={{ background: "rgba(10,27,61,0.4)", border: "1px dashed rgba(124,245,225,0.2)" }}
              >
                💡 Replays always show what to change. Defeat screens are short, kind,
                and action-oriented — never just &quot;you lost.&quot;
              </div>
            </section>
          )}
        </main>

        {/* Footer */}
        <footer
          className="flex-shrink-0 px-4 md:px-6 py-3 border-t flex items-center justify-between gap-3"
          style={{ borderColor: "rgba(124,245,225,0.15)", background: "rgba(6,18,43,0.6)" }}
        >
          <p className="text-[10px] md:text-[11px] text-white/55 leading-snug max-w-prose">
            Defense Hub is your anti-frustration toolkit. Guard Posts are persistent
            upgrades. Dive Insurance is per-dive. Bounties are community-driven. Replays
            always show what to change.
          </p>
          <GlowButton variant="ghost" size="sm" onClick={onClose} className="flex-shrink-0">
            Close
          </GlowButton>
        </footer>
      </div>
    </div>
  );
}

export default DefenseHubModal;
