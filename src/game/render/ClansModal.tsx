// Crabtopia - Clans Modal
// Self-contained modal for browsing / joining / managing clans.
// All clan data is mocked locally — no clans slice exists in gameStore yet.

"use client";

import React, { useMemo, useState } from "react";
import { useGame } from "../store/gameStore";
import { FACTIONS, FACTION_LIST } from "../content/factions";
import { FactionId } from "../types";
import {
  GlassPanel,
  GlowButton,
  StatChip,
  SectionTitle,
  GoldIcon,
  formatGold,
  EmptyState,
} from "./ui";

// ---------- LOCAL TYPES ----------

type SortBy = "power" | "members" | "chest";
type ClanTab = "members" | "chest" | "quests" | "chat";
type MemberRole = "Leader" | "Officer" | "Member";

interface ClanMember {
  id: string;
  name: string;
  role: MemberRole;
  level: number;
  lastActiveAgo: string;
  contribution: number;
  isPlayer?: boolean;
}

interface ClanQuest {
  id: string;
  title: string;
  progress: number;
  goal: number;
  reward: number;
  expires: string;
}

interface Clan {
  id: string;
  name: string;
  tag: string;
  faction: FactionId;
  leaderName: string;
  memberCount: number;
  maxMembers: number;
  chestGoal: number;
  chestProgress: number;
  powerRanking: number;
  description: string;
  isOpen: boolean;
}

interface ChatMsg {
  id: string;
  author: string;
  message: string;
  ago: string;
  role: MemberRole;
}

// ---------- CLAN CHEST TIERS ----------

const CHEST_TIERS = [
  { threshold: 10000, reward: 2000, label: "Bronze", color: "#C97A3A" },
  { threshold: 25000, reward: 5000, label: "Silver", color: "#C9D6EE" },
  { threshold: 50000, reward: 12000, label: "Gold", color: "#FFD166" },
  { threshold: 100000, reward: 30000, label: "Tidal", color: "#7CF5E1" },
] as const;

const CONTRIBUTE_AMOUNTS = [100, 500, 1000, 5000];

function tierReached(total: number): number {
  let current = -1;
  for (let i = 0; i < CHEST_TIERS.length; i++) {
    if (total >= CHEST_TIERS[i].threshold) current = i;
  }
  return current;
}

function nextTierInfo(total: number): { index: number; tier: (typeof CHEST_TIERS)[number] } | null {
  for (let i = 0; i < CHEST_TIERS.length; i++) {
    if (total < CHEST_TIERS[i].threshold) {
      return { index: i, tier: CHEST_TIERS[i] };
    }
  }
  return null;
}

// ---------- MOCK DATA ----------

const INITIAL_CLANS: Clan[] = [
  {
    id: "clan_tidebound",
    name: "Tidebound Brotherhood",
    tag: "TBR",
    faction: "moonpool",
    leaderName: "Maris Tideborne",
    memberCount: 47,
    maxMembers: 50,
    chestGoal: 50000,
    chestProgress: 38400,
    powerRanking: 9420,
    description:
      "Moon-touched rogues who swear oaths beneath the spring tide. We strike from shadow and vanish into shimmer.",
    isOpen: true,
  },
  {
    id: "clan_coralwardens",
    name: "Coral Wardens",
    tag: "CRW",
    faction: "coral_court",
    leaderName: "Reefmaster Calan",
    memberCount: 50,
    maxMembers: 50,
    chestGoal: 50000,
    chestProgress: 51200,
    powerRanking: 12110,
    description:
      "Tide-gardeners of the coral spires. We turn war into ritual and trade shells like sonnets.",
    isOpen: false,
  },
  {
    id: "clan_cinderforge",
    name: "Cinderforge Pact",
    tag: "CIP",
    faction: "cinderreef",
    leaderName: "Emberon Ironshell",
    memberCount: 41,
    maxMembers: 50,
    chestGoal: 50000,
    chestProgress: 22800,
    powerRanking: 10350,
    description:
      "Forged in lava-glass and bad tempers. We pay in cinders and collect our debts in shell.",
    isOpen: true,
  },
  {
    id: "clan_frostwhisper",
    name: "Frostwhisper Cabal",
    tag: "FWC",
    faction: "frostshelf",
    leaderName: "Aurora Glaze",
    memberCount: 33,
    maxMembers: 50,
    chestGoal: 50000,
    chestProgress: 14600,
    powerRanking: 7890,
    description:
      "Aurora-touched wardens who freeze the tide itself. Slow to anger, slower still to thaw.",
    isOpen: true,
  },
  {
    id: "clan_mangrove",
    name: "Mangrove Vanguard",
    tag: "MGV",
    faction: "mangrove",
    leaderName: "Rootkeeper Vorn",
    memberCount: 38,
    maxMembers: 50,
    chestGoal: 50000,
    chestProgress: 30100,
    powerRanking: 8650,
    description:
      "Patient root-weavers who outlast any storm. Our roots drink the reef and our crabs never tire.",
    isOpen: true,
  },
  {
    id: "clan_stormcall",
    name: "Stormcall Syndicate",
    tag: "SCS",
    faction: "stormwake",
    leaderName: "Volt Krakenspire",
    memberCount: 44,
    maxMembers: 50,
    chestGoal: 50000,
    chestProgress: 41900,
    powerRanking: 11280,
    description:
      "Charged by the rifts, we strike before the thunder fades. Speed is faith; the bolt is law.",
    isOpen: true,
  },
  {
    id: "clan_moonpool",
    name: "Moonpool Circle",
    tag: "MPC",
    faction: "moonpool",
    leaderName: "Selene Shimmerby",
    memberCount: 29,
    maxMembers: 50,
    chestGoal: 50000,
    chestProgress: 9700,
    powerRanking: 6420,
    description:
      "A circle of plankton-glow seers who read the tides in moonlit pools. Small, clever, and quiet.",
    isOpen: true,
  },
  {
    id: "clan_driftwood",
    name: "Driftwood Corsairs",
    tag: "DWC",
    faction: "cinderreef",
    leaderName: "Captain Rusk",
    memberCount: 36,
    maxMembers: 50,
    chestGoal: 50000,
    chestProgress: 19300,
    powerRanking: 9510,
    description:
      "Wreck-divers and reef pirates. We salvage what the tide forgets and sell it back twice.",
    isOpen: false,
  },
];

const MOCK_QUESTS: ClanQuest[] = [
  {
    id: "q_raids",
    title: "Win 10 raids as a clan this week",
    progress: 7,
    goal: 10,
    reward: 3000,
    expires: "in 3d 4h",
  },
  {
    id: "q_chest",
    title: "Fill the clan chest to 50K GOLD",
    progress: 38,
    goal: 50,
    reward: 5000,
    expires: "in 5d",
  },
  {
    id: "q_eggs",
    title: "Hatch 5 eggs collectively",
    progress: 3,
    goal: 5,
    reward: 1500,
    expires: "in 2d 9h",
  },
  {
    id: "q_bosses",
    title: "Defeat 3 rival clan bosses",
    progress: 1,
    goal: 3,
    reward: 4500,
    expires: "in 6d",
  },
];

const MOCK_CHAT: ChatMsg[] = [
  {
    id: "c1",
    author: "Maris Tideborne",
    role: "Leader",
    message: "Raid night Thursday — bring your fastest skitters. We hit Cinderforge.",
    ago: "12m ago",
  },
  {
    id: "c2",
    author: "Selene Shimmerby",
    role: "Officer",
    message: "Chest is one big contribute away from Silver. Who's got spare GOLD?",
    ago: "1h ago",
  },
  {
    id: "c3",
    author: "Bramble Kelp",
    role: "Member",
    message: "I'll throw in 500 once my dive resolves. Anyone got a tidecaller to lend?",
    ago: "3h ago",
  },
  {
    id: "c4",
    author: "Maris Tideborne",
    role: "Leader",
    message: "Welcome aboard, new shells! Read the pinned Reef Plot before posting.",
    ago: "1d ago",
  },
];

const MEMBER_NAMES: { name: string; role: MemberRole; level: number; ago: string; contribution: number }[] = [
  { name: "Maris Tideborne", role: "Leader", level: 42, ago: "5m ago", contribution: 18400 },
  { name: "Selene Shimmerby", role: "Officer", level: 33, ago: "1h ago", contribution: 9200 },
  { name: "Bramble Kelp", role: "Officer", level: 28, ago: "3h ago", contribution: 6100 },
  { name: "Coralline Vex", role: "Member", level: 21, ago: "6h ago", contribution: 2400 },
  { name: "Tideborn Pell", role: "Member", level: 19, ago: "8h ago", contribution: 1800 },
  { name: "Shimmermoth Jib", role: "Member", level: 17, ago: "12h ago", contribution: 1200 },
  { name: "Riftwalker Noll", role: "Member", level: 15, ago: "1d ago", contribution: 900 },
  { name: "Glassfin Daro", role: "Member", level: 14, ago: "2d ago", contribution: 600 },
  { name: "Planktide Rusk", role: "Member", level: 12, ago: "2d ago", contribution: 400 },
  { name: "Moonlett Vera", role: "Member", level: 10, ago: "3d ago", contribution: 200 },
];

// ---------- HELPERS ----------

function roleColor(role: MemberRole): string {
  if (role === "Leader") return "#FFD166";
  if (role === "Officer") return "#7CF5E1";
  return "#C9D6EE";
}

function initials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function buildMembers(leaderName: string, playerName: string, playerLevel: number): ClanMember[] {
  const roster: ClanMember[] = MEMBER_NAMES.map((m, i) => ({
    id: `m_${i}`,
    name: m.name,
    role: m.role,
    level: m.level,
    lastActiveAgo: m.ago,
    contribution: m.contribution,
  }));
  // Override leader if this is the player's own created clan
  if (leaderName === playerName) {
    roster[0] = {
      ...roster[0],
      name: playerName,
      level: playerLevel,
      lastActiveAgo: "just now",
      contribution: 0,
      isPlayer: true,
    };
  } else {
    // Insert the player as a regular member near the middle
    roster.push({
      id: "m_player",
      name: playerName,
      role: "Member",
      level: playerLevel,
      lastActiveAgo: "just now",
      contribution: 0,
      isPlayer: true,
    });
  }
  return roster;
}

// ---------- COMPONENT ----------

export default function ClansModal({ onClose }: { onClose: () => void }) {
  const player = useGame((s) => s.player);
  const spendGold = useGame((s) => s.spendGold);
  const addGold = useGame((s) => s.addGold);
  const pushToast = useGame((s) => s.pushToast);

  // View state
  const [view, setView] = useState<"browse" | "mine">("browse");
  const [myClanId, setMyClanId] = useState<string | null>(null);
  const [clanChestContrib, setClanChestContrib] = useState(0);
  const [claimedTiers, setClaimedTiers] = useState<number[]>([]);
  const [mockClans, setMockClans] = useState<Clan[]>(INITIAL_CLANS);

  // Browse filters
  const [factionFilter, setFactionFilter] = useState<FactionId | "all">("all");
  const [openOnly, setOpenOnly] = useState(false);
  const [sortBy, setSortBy] = useState<SortBy>("power");

  // Create-clan form
  const [showCreate, setShowCreate] = useState(false);
  const [newClanName, setNewClanName] = useState("");
  const [newClanFaction, setNewClanFaction] = useState<FactionId>("coral_court");

  // My clan tabs
  const [tab, setTab] = useState<ClanTab>("members");

  // Leave confirm
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);

  const playerName = player?.name ?? "Wanderer";
  const playerLevel = player?.shellwardenLevel ?? 1;
  const playerGold = player?.gold ?? 0;

  const myClan = useMemo(
    () => mockClans.find((c) => c.id === myClanId) ?? null,
    [mockClans, myClanId]
  );

  const filteredClans = useMemo(() => {
    let list = mockClans.slice();
    if (factionFilter !== "all") list = list.filter((c) => c.faction === factionFilter);
    if (openOnly) list = list.filter((c) => c.isOpen);
    list.sort((a, b) => {
      if (sortBy === "power") return b.powerRanking - a.powerRanking;
      if (sortBy === "members") return b.memberCount - a.memberCount;
      return b.chestProgress - a.chestProgress;
    });
    return list;
  }, [mockClans, factionFilter, openOnly, sortBy]);

  // Chest totals — clan's prior progress + player's contributions since joining
  const chestTotal = (myClan?.chestProgress ?? 0) + clanChestContrib;
  const currentTierIdx = tierReached(chestTotal);
  const nextTier = nextTierInfo(chestTotal);

  // ---------- ACTIONS ----------

  const handleJoin = (clan: Clan) => {
    if (!clan.isOpen) return;
    if (clan.memberCount >= clan.maxMembers) return;
    if (!spendGold(1000)) {
      pushToast({
        title: "Not enough GOLD",
        description: "Joining a clan costs 1,000 GOLD.",
        variant: "error",
      });
      return;
    }
    setMockClans((prev) =>
      prev.map((c) => (c.id === clan.id ? { ...c, memberCount: c.memberCount + 1 } : c))
    );
    setMyClanId(clan.id);
    setView("mine");
    setTab("members");
    setClaimedTiers([]);
    setClanChestContrib(0);
    pushToast({
      title: `Welcome to ${clan.name}!`,
      description: "-1,000 GOLD joining fee paid.",
      variant: "success",
    });
  };

  const handleCreate = () => {
    const trimmed = newClanName.trim();
    if (trimmed.length < 5) {
      pushToast({
        title: "Clan name too short",
        description: "Pick a name with at least 5 characters.",
        variant: "error",
      });
      return;
    }
    if (!spendGold(5000)) {
      pushToast({
        title: "Not enough GOLD",
        description: "Founding a clan costs 5,000 GOLD.",
        variant: "error",
      });
      return;
    }
    const tagRaw =
      trimmed
        .replace(/[^a-zA-Z]/g, "")
        .slice(0, 5)
        .toUpperCase() || "NEW";
    const id = `clan_${Date.now()}`;
    const newClan: Clan = {
      id,
      name: trimmed,
      tag: tagRaw,
      faction: newClanFaction,
      leaderName: playerName,
      memberCount: 1,
      maxMembers: 50,
      chestGoal: 50000,
      chestProgress: 0,
      powerRanking: 100 + Math.floor(Math.random() * 200),
      description: "A freshly founded clan bound for the reef wars.",
      isOpen: true,
    };
    setMockClans((prev) => [newClan, ...prev]);
    setMyClanId(id);
    setView("mine");
    setTab("members");
    setShowCreate(false);
    setNewClanName("");
    setClaimedTiers([]);
    setClanChestContrib(0);
    pushToast({
      title: `Clan "${trimmed}" founded!`,
      description: "-5,000 GOLD",
      variant: "success",
    });
  };

  const handleLeave = () => {
    if (!myClan) return;
    const leftName = myClan.name;
    setMockClans((prev) =>
      prev.map((c) =>
        c.id === myClan.id ? { ...c, memberCount: Math.max(0, c.memberCount - 1) } : c
      )
    );
    setMyClanId(null);
    setShowLeaveConfirm(false);
    setClanChestContrib(0);
    setClaimedTiers([]);
    setView("browse");
    pushToast({
      title: `You left ${leftName}.`,
      variant: "warning",
    });
  };

  const handleContribute = (amount: number) => {
    if (!spendGold(amount)) {
      pushToast({
        title: "Not enough GOLD",
        description: `You need ${formatGold(amount)} GOLD to contribute.`,
        variant: "error",
      });
      return;
    }
    setClanChestContrib((p) => p + amount);
    pushToast({
      title: `Contributed ${formatGold(amount)} GOLD to clan chest!`,
      variant: "success",
    });
  };

  const handleClaim = (tierIdx: number) => {
    if (claimedTiers.includes(tierIdx)) return;
    if (tierIdx < 0 || tierIdx >= CHEST_TIERS.length) return;
    const tier = CHEST_TIERS[tierIdx];
    addGold(tier.reward);
    setClaimedTiers((p) => [...p, tierIdx]);
    pushToast({
      title: `Claimed ${tier.label} chest reward!`,
      description: `+${formatGold(tier.reward)} GOLD`,
      variant: "success",
    });
  };

  // ---------- RENDER ----------

  return (
    <div
      className="fixed inset-0 z-[150] flex items-center justify-center p-3 sm:p-4"
      style={{ background: "rgba(2,12,28,0.78)", backdropFilter: "blur(8px)" }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Clans"
    >
      <div
        className="w-full max-w-3xl max-h-[88vh] overflow-y-auto rounded-2xl"
        style={{
          background: "linear-gradient(180deg, #06122B 0%, #0A1B3D 100%)",
          border: "1px solid rgba(124,245,225,0.3)",
          boxShadow: "0 12px 60px rgba(18,167,160,0.35)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal header */}
        <div
          className="sticky top-0 z-10 flex items-center justify-between px-4 sm:px-6 py-3 border-b"
          style={{
            borderColor: "rgba(124,245,225,0.18)",
            background: "linear-gradient(180deg, rgba(6,18,43,0.96), rgba(6,18,43,0.86))",
            backdropFilter: "blur(6px)",
          }}
        >
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-lg" aria-hidden>🏰</span>
            <div className="min-w-0">
              <h2
                className="text-sm sm:text-base font-bold truncate"
                style={{ fontFamily: "Fredoka, system-ui, sans-serif", color: "#7CF5E1" }}
              >
                Clans of Crabtopia
              </h2>
              <div className="text-[10px] opacity-60 truncate">
                Share chests · wage Reef Plot wars · earn clan bonuses
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 w-8 h-8 flex items-center justify-center rounded-md text-white/70 hover:text-white hover:bg-white/10 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* View toggle */}
        <div className="px-4 sm:px-6 pt-3">
          <div
            className="inline-flex rounded-xl p-1"
            style={{ background: "rgba(10,27,61,0.6)", border: "1px solid rgba(124,245,225,0.18)" }}
          >
            <ToggleButton active={view === "browse"} onClick={() => setView("browse")}>
              Browse Clans
            </ToggleButton>
            <ToggleButton active={view === "mine"} onClick={() => setView("mine")}>
              My Clan
            </ToggleButton>
          </div>
        </div>

        {/* Body */}
        <div className="px-4 sm:px-6 py-4">
          {view === "browse" ? (
            <BrowseView
              clans={filteredClans}
              totalCount={mockClans.length}
              factionFilter={factionFilter}
              setFactionFilter={setFactionFilter}
              openOnly={openOnly}
              setOpenOnly={setOpenOnly}
              sortBy={sortBy}
              setSortBy={setSortBy}
              onJoin={handleJoin}
              showCreate={showCreate}
              setShowCreate={setShowCreate}
              newClanName={newClanName}
              setNewClanName={setNewClanName}
              newClanFaction={newClanFaction}
              setNewClanFaction={setNewClanFaction}
              onCreate={handleCreate}
              playerGold={playerGold}
              myClanId={myClanId}
            />
          ) : myClan ? (
            <MyClanView
              clan={myClan}
              tab={tab}
              setTab={setTab}
              onLeave={() => setShowLeaveConfirm(true)}
              showLeaveConfirm={showLeaveConfirm}
              onConfirmLeave={handleLeave}
              onCancelLeave={() => setShowLeaveConfirm(false)}
              playerName={playerName}
              playerLevel={playerLevel}
              chestTotal={chestTotal}
              clanChestContrib={clanChestContrib}
              currentTierIdx={currentTierIdx}
              nextTier={nextTier}
              claimedTiers={claimedTiers}
              onContribute={handleContribute}
              onClaim={handleClaim}
              playerGold={playerGold}
            />
          ) : (
            <EmptyState
              message="You haven't joined a clan yet"
              hint="Browse the reef and pledge your shell to a brotherhood."
              cta={
                <GlowButton variant="teal" onClick={() => setView("browse")}>
                  Browse Clans
                </GlowButton>
              }
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ---------- SUB-COMPONENTS ----------

function ToggleButton({
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
      className="px-3 py-1.5 text-xs font-bold rounded-lg transition-all"
      style={{
        background: active ? "linear-gradient(135deg, #12A7A0, #0A4A66)" : "transparent",
        color: active ? "#EAF6FF" : "rgba(234,246,255,0.6)",
        boxShadow: active ? "0 4px 12px rgba(18,167,160,0.35)" : "none",
      }}
    >
      {children}
    </button>
  );
}

function FactionEmblemBadge({ faction, size = 28 }: { faction: FactionId; size?: number }) {
  const f = FACTIONS[faction];
  return (
    <div
      className="flex items-center justify-center rounded-lg shrink-0"
      style={{
        width: size + 8,
        height: size + 8,
        background: `linear-gradient(135deg, ${f.colors.dark}cc, ${f.colors.primary}33)`,
        border: `1px solid ${f.colors.primary}66`,
        boxShadow: `0 0 10px ${f.colors.accent}33`,
        fontSize: size * 0.8,
      }}
      aria-hidden
    >
      {f.emblem}
    </div>
  );
}

function ProgressBar({
  value,
  max,
  color = "#7CF5E1",
  trackColor = "rgba(255,255,255,0.1)",
  height = 8,
}: {
  value: number;
  max: number;
  color?: string;
  trackColor?: string;
  height?: number;
}) {
  const pct = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  return (
    <div
      className="w-full rounded-full overflow-hidden"
      style={{ background: trackColor, height }}
    >
      <div
        className="h-full rounded-full transition-all duration-300"
        style={{
          width: `${pct * 100}%`,
          background: `linear-gradient(90deg, ${color}, ${color}cc)`,
          boxShadow: `0 0 8px ${color}66`,
        }}
      />
    </div>
  );
}

// ---------- BROWSE VIEW ----------

function BrowseView({
  clans,
  totalCount,
  factionFilter,
  setFactionFilter,
  openOnly,
  setOpenOnly,
  sortBy,
  setSortBy,
  onJoin,
  showCreate,
  setShowCreate,
  newClanName,
  setNewClanName,
  newClanFaction,
  setNewClanFaction,
  onCreate,
  playerGold,
  myClanId,
}: {
  clans: Clan[];
  totalCount: number;
  factionFilter: FactionId | "all";
  setFactionFilter: (f: FactionId | "all") => void;
  openOnly: boolean;
  setOpenOnly: (b: boolean) => void;
  sortBy: SortBy;
  setSortBy: (s: SortBy) => void;
  onJoin: (c: Clan) => void;
  showCreate: boolean;
  setShowCreate: (b: boolean) => void;
  newClanName: string;
  setNewClanName: (s: string) => void;
  newClanFaction: FactionId;
  setNewClanFaction: (f: FactionId) => void;
  onCreate: () => void;
  playerGold: number;
  myClanId: string | null;
}) {
  return (
    <div className="space-y-4">
      {/* Top row: create + summary */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SectionTitle
          icon={<span aria-hidden>⚓</span>}
          title={`Available Clans (${clans.length} / ${totalCount})`}
        />
        <GlowButton
          variant={showCreate ? "ghost" : "gold"}
          size="sm"
          onClick={() => setShowCreate(!showCreate)}
        >
          {showCreate ? "Cancel" : "✦ Found a Clan (5K)"}
        </GlowButton>
      </div>

      {/* Create form */}
      {showCreate && (
        <GlassPanel className="p-3" glow="rgba(255,209,102,0.25)">
          <div className="text-xs font-bold mb-2" style={{ color: "#FFD166" }}>
            Found a new clan — costs 5,000 GOLD
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              value={newClanName}
              onChange={(e) => setNewClanName(e.target.value)}
              placeholder="Clan name (min 3 chars)"
              maxLength={28}
              className="flex-1 px-3 py-2 text-sm rounded-lg outline-none"
              style={{
                background: "rgba(10,27,61,0.6)",
                border: "1px solid rgba(124,245,225,0.25)",
                color: "#EAF6FF",
              }}
            />
            <NativeFactionSelect
              value={newClanFaction}
              onChange={(f) => f && setNewClanFaction(f)}
            />
            <GlowButton
              variant="gold"
              size="sm"
              onClick={onCreate}
              disabled={playerGold < 5000 || newClanName.trim().length < 5}
              title={
                playerGold < 5000
                  ? "Not enough GOLD"
                  : newClanName.trim().length < 5
                  ? "Name too short"
                  : "Found clan"
              }
            >
              Found — 5,000 <GoldIcon size={12} className="ml-1" />
            </GlowButton>
          </div>
          <div className="text-[10px] opacity-60 mt-2">
            Your gold: <GoldIcon size={11} className="inline align-middle" />{" "}
            {formatGold(playerGold)}
          </div>
        </GlassPanel>
      )}

      {/* Filters */}
      <GlassPanel className="p-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-wide text-white/60">Faction</span>
            <NativeFactionSelect
              value={factionFilter === "all" ? null : factionFilter}
              onChange={(f) => setFactionFilter(f ?? "all")}
              allowAll
            />
          </div>

          <label
            className="flex items-center gap-1.5 text-xs cursor-pointer select-none"
            style={{ color: openOnly ? "#7CF5E1" : "rgba(234,246,255,0.7)" }}
          >
            <input
              type="checkbox"
              checked={openOnly}
              onChange={(e) => setOpenOnly(e.target.checked)}
              className="accent-teal-400"
            />
            Open only
          </label>

          <div className="ml-auto flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-wide text-white/60">Sort</span>
            <div
              className="inline-flex rounded-lg p-0.5"
              style={{ background: "rgba(10,27,61,0.6)", border: "1px solid rgba(124,245,225,0.18)" }}
            >
              {(["power", "members", "chest"] as SortBy[]).map((s) => (
                <button
                  key={s}
                  onClick={() => setSortBy(s)}
                  className="px-2 py-1 text-[11px] font-bold rounded-md capitalize transition-colors"
                  style={{
                    background: sortBy === s ? "rgba(18,167,160,0.5)" : "transparent",
                    color: sortBy === s ? "#EAF6FF" : "rgba(234,246,255,0.55)",
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        </div>
      </GlassPanel>

      {/* Clan grid */}
      {clans.length === 0 ? (
        <EmptyState
          compact
          message="No clans match your filters"
          hint="Try widening your search."
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {clans.map((clan) => (
            <ClanCard
              key={clan.id}
              clan={clan}
              onJoin={() => onJoin(clan)}
              isMine={clan.id === myClanId}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ClanCard({
  clan,
  onJoin,
  isMine,
}: {
  clan: Clan;
  onJoin: () => void;
  isMine: boolean;
}) {
  const f = FACTIONS[clan.faction];
  const full = clan.memberCount >= clan.maxMembers;
  const joinable = clan.isOpen && !full && !isMine;
  return (
    <GlassPanel className="p-3 h-full flex flex-col" glow={`${f.colors.accent}22`}>
      {/* Header row */}
      <div className="flex items-start gap-2 mb-2">
        <FactionEmblemBadge faction={clan.faction} size={26} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <div
              className="text-sm font-bold truncate"
              style={{ color: f.colors.light, fontFamily: "Fredoka, system-ui, sans-serif" }}
            >
              {clan.name}
            </div>
            <span
              className="px-1 py-0.5 rounded text-[9px] font-bold tracking-wider shrink-0"
              style={{
                background: `${f.colors.primary}22`,
                color: f.colors.accent,
                border: `1px solid ${f.colors.primary}55`,
              }}
            >
              [{clan.tag}]
            </span>
          </div>
          <div className="text-[10px] opacity-70 truncate">
            {f.name} · led by {clan.leaderName}
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-1.5 mb-2">
        <StatChip
          label="Members"
          value={`${clan.memberCount}/${clan.maxMembers}`}
          color={full ? "#FF6F91" : "#EAF6FF"}
        />
        <StatChip
          label="Power"
          value={formatGold(clan.powerRanking)}
          color="#FFD166"
        />
        <StatChip
          label="Chest"
          value={formatGold(clan.chestProgress)}
          color="#7CF5E1"
        />
      </div>

      {/* Chest progress */}
      <div className="mb-2">
        <div className="flex justify-between text-[9px] opacity-70 mb-1">
          <span>Clan Chest</span>
          <span>
            {formatGold(clan.chestProgress)} / {formatGold(clan.chestGoal)}
          </span>
        </div>
        <ProgressBar value={clan.chestProgress} max={clan.chestGoal} color={f.colors.accent} />
      </div>

      {/* Description */}
      <p className="text-[11px] opacity-75 italic mb-3 line-clamp-2 flex-1">{clan.description}</p>

      {/* Status + action */}
      <div className="flex items-center justify-between gap-2">
        <span
          className="text-[10px] font-bold px-2 py-0.5 rounded-md"
          style={{
            background: clan.isOpen ? "rgba(76,243,193,0.12)" : "rgba(255,111,145,0.12)",
            color: clan.isOpen ? "#7CF5E1" : "#FF6F91",
            border: `1px solid ${clan.isOpen ? "rgba(124,245,225,0.3)" : "rgba(255,111,145,0.3)"}`,
          }}
        >
          {clan.isOpen ? "Open" : "Closed"}
        </span>
        {isMine ? (
          <span className="text-[11px] font-bold px-3 py-1.5 rounded-lg" style={{ color: "#FFD166" }}>
            ✓ Joined
          </span>
        ) : (
          <GlowButton
            variant="teal"
            size="sm"
            disabled={!joinable}
            onClick={onJoin}
            title={
              full ? "Clan is full" : !clan.isOpen ? "Clan is closed" : "Join (1,000 GOLD)"
            }
          >
            Join · 1K <GoldIcon size={11} className="ml-1 inline align-middle" />
          </GlowButton>
        )}
      </div>
    </GlassPanel>
  );
}

// ---------- MY CLAN VIEW ----------

function MyClanView({
  clan,
  tab,
  setTab,
  onLeave,
  showLeaveConfirm,
  onConfirmLeave,
  onCancelLeave,
  playerName,
  playerLevel,
  chestTotal,
  clanChestContrib,
  currentTierIdx,
  nextTier,
  claimedTiers,
  onContribute,
  onClaim,
  playerGold,
}: {
  clan: Clan;
  tab: ClanTab;
  setTab: (t: ClanTab) => void;
  onLeave: () => void;
  showLeaveConfirm: boolean;
  onConfirmLeave: () => void;
  onCancelLeave: () => void;
  playerName: string;
  playerLevel: number;
  chestTotal: number;
  clanChestContrib: number;
  currentTierIdx: number;
  nextTier: { index: number; tier: (typeof CHEST_TIERS)[number] } | null;
  claimedTiers: number[];
  onContribute: (n: number) => void;
  onClaim: (i: number) => void;
  playerGold: number;
}) {
  const f = FACTIONS[clan.faction];
  const members = useMemo(
    () => buildMembers(clan.leaderName, playerName, playerLevel),
    [clan.leaderName, playerName, playerLevel]
  );

  return (
    <div className="space-y-4">
      {/* Clan header */}
      <GlassPanel className="p-4" glow={`${f.colors.accent}33`}>
        <div className="flex items-start gap-3">
          <FactionEmblemBadge faction={clan.faction} size={36} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h3
                className="text-base sm:text-lg font-bold truncate"
                style={{ color: f.colors.light, fontFamily: "Fredoka, system-ui, sans-serif" }}
              >
                {clan.name}
              </h3>
              <span
                className="px-1.5 py-0.5 rounded text-[10px] font-bold tracking-wider"
                style={{
                  background: `${f.colors.primary}22`,
                  color: f.colors.accent,
                  border: `1px solid ${f.colors.primary}55`,
                }}
              >
                [{clan.tag}]
              </span>
            </div>
            <div className="text-[11px] opacity-75 mt-0.5">
              {f.name} · {clan.memberCount}/{clan.maxMembers} members · Power{" "}
              {formatGold(clan.powerRanking)}
            </div>
          </div>
          {showLeaveConfirm ? (
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="text-[11px] text-white/80 hidden sm:inline">Leave?</span>
              <GlowButton variant="rose" size="sm" onClick={onConfirmLeave}>
                Confirm
              </GlowButton>
              <GlowButton variant="ghost" size="sm" onClick={onCancelLeave}>
                Stay
              </GlowButton>
            </div>
          ) : (
            <GlowButton variant="ghost" size="sm" onClick={onLeave} className="shrink-0">
              Leave Clan
            </GlowButton>
          )}
        </div>
      </GlassPanel>

      {/* Tabs */}
      <div
        className="flex gap-1 overflow-x-auto rounded-xl p-1"
        style={{ background: "rgba(10,27,61,0.6)", border: "1px solid rgba(124,245,225,0.18)" }}
      >
        {(["members", "chest", "quests", "chat"] as ClanTab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="px-3 py-1.5 text-xs font-bold rounded-lg capitalize transition-all whitespace-nowrap"
            style={{
              background: tab === t ? "linear-gradient(135deg, #12A7A0, #0A4A66)" : "transparent",
              color: tab === t ? "#EAF6FF" : "rgba(234,246,255,0.6)",
              boxShadow: tab === t ? "0 4px 10px rgba(18,167,160,0.3)" : "none",
            }}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "members" && <MembersTab members={members} faction={clan.faction} />}
      {tab === "chest" && (
        <ChestTab
          faction={clan.faction}
          chestTotal={chestTotal}
          clanChestContrib={clanChestContrib}
          currentTierIdx={currentTierIdx}
          nextTier={nextTier}
          claimedTiers={claimedTiers}
          onContribute={onContribute}
          onClaim={onClaim}
          playerGold={playerGold}
        />
      )}
      {tab === "quests" && <QuestsTab />}
      {tab === "chat" && <ChatTab faction={clan.faction} />}
    </div>
  );
}

// ---------- MEMBERS TAB ----------

function MembersTab({
  members,
  faction,
}: {
  members: ClanMember[];
  faction: FactionId;
}) {
  const f = FACTIONS[faction];
  // Sort: Leader, Officer, Member; player pinned appropriately by role
  const order: Record<MemberRole, number> = { Leader: 0, Officer: 1, Member: 2 };
  const sorted = [...members].sort((a, b) => {
    if (a.isPlayer) return -1;
    if (b.isPlayer) return 1;
    return order[a.role] - order[b.role] || b.contribution - a.contribution;
  });

  return (
    <GlassPanel className="p-3">
      <SectionTitle
        icon={<span aria-hidden>👥</span>}
        title={`Roster (${members.length})`}
        action={
          <span className="text-[10px] opacity-60">
            Roles: <span style={{ color: "#FFD166" }}>Leader</span> ·{" "}
            <span style={{ color: "#7CF5E1" }}>Officer</span> · Member
          </span>
        }
      />
      <div className="space-y-1.5 max-h-96 overflow-y-auto pr-1 clan-scroll">
        {sorted.map((m) => (
          <div
            key={m.id}
            className="flex items-center gap-2 rounded-lg px-2 py-1.5"
            style={{
              background: m.isPlayer
                ? `linear-gradient(90deg, ${f.colors.primary}33, transparent)`
                : "rgba(10,27,61,0.4)",
              border: m.isPlayer
                ? `1px solid ${f.colors.accent}55`
                : "1px solid rgba(124,245,225,0.1)",
            }}
          >
            {/* Avatar */}
            <div
              className="shrink-0 flex items-center justify-center rounded-full text-[11px] font-bold"
              style={{
                width: 30,
                height: 30,
                background: `linear-gradient(135deg, ${f.colors.dark}, ${f.colors.primary}55)`,
                color: f.colors.light,
                border: `1px solid ${f.colors.accent}44`,
              }}
            >
              {initials(m.name)}
            </div>

            {/* Name + role */}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-bold truncate" style={{ color: f.colors.light }}>
                  {m.name}
                </span>
                {m.isPlayer && (
                  <span
                    className="text-[8px] px-1 py-0.5 rounded font-bold"
                    style={{ background: `${f.colors.accent}22`, color: f.colors.accent }}
                  >
                    YOU
                  </span>
                )}
              </div>
              <div className="text-[9px] opacity-60">
                Lv {m.level} · active {m.lastActiveAgo}
              </div>
            </div>

            {/* Contribution */}
            <div className="text-right shrink-0">
              <div className="text-[9px] uppercase opacity-50">Contrib</div>
              <div className="text-[11px] font-bold flex items-center justify-end gap-0.5" style={{ color: "#FFD166" }}>
                <GoldIcon size={10} />
                {formatGold(m.contribution)}
              </div>
            </div>

            {/* Role badge */}
            <span
              className="shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded-md uppercase tracking-wide"
              style={{
                background: `${roleColor(m.role)}22`,
                color: roleColor(m.role),
                border: `1px solid ${roleColor(m.role)}55`,
                minWidth: 56,
                textAlign: "center",
              }}
            >
              {m.role}
            </span>
          </div>
        ))}
      </div>
    </GlassPanel>
  );
}

// ---------- CHEST TAB ----------

function ChestTab({
  faction,
  chestTotal,
  clanChestContrib,
  currentTierIdx,
  nextTier,
  claimedTiers,
  onContribute,
  onClaim,
  playerGold,
}: {
  faction: FactionId;
  chestTotal: number;
  clanChestContrib: number;
  currentTierIdx: number;
  nextTier: { index: number; tier: (typeof CHEST_TIERS)[number] } | null;
  claimedTiers: number[];
  onContribute: (n: number) => void;
  onClaim: (i: number) => void;
  playerGold: number;
}) {
  const f = FACTIONS[faction];
  const next = nextTier;
  const progressMax = next ? next.tier.threshold : CHEST_TIERS[CHEST_TIERS.length - 1].threshold;
  const progressBase = currentTierIdx >= 0 ? CHEST_TIERS[currentTierIdx].threshold : 0;
  const pct =
    next
      ? Math.min(1, Math.max(0, (chestTotal - progressBase) / (next.tier.threshold - progressBase)))
      : 1;

  return (
    <div className="space-y-3">
      {/* Chest visual */}
      <GlassPanel className="p-4 text-center" glow="rgba(255,209,102,0.3)">
        <ChestArt />
        <div className="mt-2">
          <div className="text-sm font-bold" style={{ color: "#FFD166" }}>
            Clan Chest
          </div>
          <div className="text-xs opacity-75">
            Total: <GoldIcon size={11} className="inline align-middle" />{" "}
            {formatGold(chestTotal)} GOLD
          </div>
          <div className="text-[10px] opacity-60 mt-0.5">
            Your contributions: <GoldIcon size={10} className="inline align-middle" />{" "}
            {formatGold(clanChestContrib)}
          </div>
        </div>
      </GlassPanel>

      {/* Tier progress */}
      <GlassPanel className="p-3">
        <div className="flex justify-between items-center mb-2">
          <span className="text-xs font-bold" style={{ color: "#FFD166" }}>
            {currentTierIdx >= 0
              ? `${CHEST_TIERS[currentTierIdx].label} Tier reached`
              : "No tier reached yet"}
          </span>
          {next ? (
            <span className="text-[10px] opacity-70">
              Next: <span style={{ color: next.tier.color }}>{next.tier.label}</span> at{" "}
              {formatGold(next.tier.threshold)} GOLD
            </span>
          ) : (
            <span className="text-[10px] opacity-70" style={{ color: "#7CF5E1" }}>
              Max tier reached!
            </span>
          )}
        </div>

        {next ? (
          <>
            <ProgressBar
              value={chestTotal - progressBase}
              max={next.tier.threshold - progressBase}
              color={next.tier.color}
              height={10}
            />
            <div className="flex justify-between text-[9px] opacity-60 mt-1">
              <span>{formatGold(progressBase)}</span>
              <span>
                {formatGold(next.tier.threshold - chestTotal)} GOLD to {next.tier.label}
              </span>
              <span>{formatGold(next.tier.threshold)}</span>
            </div>
          </>
        ) : (
          <ProgressBar value={1} max={1} color="#7CF5E1" height={10} />
        )}

        {/* Tier ladder */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3">
          {CHEST_TIERS.map((tier, idx) => {
            const reached = chestTotal >= tier.threshold;
            const claimed = claimedTiers.includes(idx);
            const claimable = reached && !claimed;
            return (
              <div
                key={tier.label}
                className="rounded-lg p-2 text-center"
                style={{
                  background: reached
                    ? `linear-gradient(135deg, ${tier.color}22, transparent)`
                    : "rgba(10,27,61,0.4)",
                  border: `1px solid ${reached ? tier.color + "66" : "rgba(124,245,225,0.12)"}`,
                }}
              >
                <div
                  className="text-[10px] font-bold uppercase tracking-wide"
                  style={{ color: tier.color }}
                >
                  {tier.label}
                </div>
                <div className="text-[9px] opacity-70 mt-0.5">
                  {formatGold(tier.threshold)} GOLD
                </div>
                <div className="text-[10px] font-bold mt-1 flex items-center justify-center gap-0.5" style={{ color: "#FFD166" }}>
                  <GoldIcon size={10} />
                  {formatGold(tier.reward)}
                </div>
                <GlowButton
                  variant={claimable ? "gold" : "ghost"}
                  size="sm"
                  disabled={!claimable}
                  onClick={() => onClaim(idx)}
                  className="mt-1 w-full"
                >
                  {claimed ? "Claimed ✓" : reached ? "Claim" : "Locked"}
                </GlowButton>
              </div>
            );
          })}
        </div>
      </GlassPanel>

      {/* Contribute */}
      <GlassPanel className="p-3">
        <SectionTitle
          icon={<span aria-hidden>💰</span>}
          title="Contribute to the Chest"
          action={
            <span className="text-[10px] opacity-60 flex items-center gap-0.5">
              You have <GoldIcon size={11} /> {formatGold(playerGold)}
            </span>
          }
        />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {CONTRIBUTE_AMOUNTS.map((amt) => (
            <GlowButton
              key={amt}
              variant="gold"
              size="md"
              disabled={playerGold < amt}
              onClick={() => onContribute(amt)}
              className="w-full"
              title={playerGold < amt ? "Not enough GOLD" : `Contribute ${formatGold(amt)} GOLD`}
            >
              +{amt >= 1000 ? `${amt / 1000}K` : amt}
              <GoldIcon size={12} className="ml-1 inline align-middle" />
            </GlowButton>
          ))}
        </div>
      </GlassPanel>
    </div>
  );
}

// CSS-built treasure chest
function ChestArt() {
  return (
    <div
      className="mx-auto relative"
      style={{ width: 180, height: 130 }}
      aria-hidden
    >
      {/* Glow halo */}
      <div
        className="absolute inset-0 rounded-full"
        style={{
          background:
            "radial-gradient(ellipse at center 70%, rgba(255,209,102,0.35) 0%, transparent 65%)",
        }}
      />
      {/* Lid */}
      <div
        className="absolute left-0 right-0"
        style={{
          top: 8,
          height: 56,
          background: "linear-gradient(180deg, #FFD166 0%, #C9882A 100%)",
          borderRadius: "90px 90px 10px 10px",
          border: "2px solid #8C5A1A",
          boxShadow: "0 6px 18px rgba(255,209,102,0.35), inset 0 -6px 12px rgba(92,58,10,0.4)",
        }}
      >
        {/* Lid band */}
        <div
          className="absolute left-0 right-0"
          style={{
            bottom: 6,
            height: 6,
            background: "rgba(140,90,26,0.5)",
          }}
        />
      </div>
      {/* Body */}
      <div
        className="absolute left-0 right-0"
        style={{
          top: 50,
          bottom: 0,
          background: "linear-gradient(180deg, #8C5A1A 0%, #5C3A0A 100%)",
          borderRadius: "6px 6px 14px 14px",
          border: "2px solid #8C5A1A",
          boxShadow: "inset 0 6px 12px rgba(0,0,0,0.4)",
        }}
      >
        {/* Lock */}
        <div
          className="absolute left-1/2"
          style={{
            top: -6,
            transform: "translateX(-50%)",
            width: 28,
            height: 36,
            background: "linear-gradient(180deg, #FFD166, #B8801A)",
            borderRadius: 6,
            border: "2px solid #5C3A0A",
            boxShadow: "0 0 10px rgba(255,209,102,0.6)",
          }}
        >
          <div
            className="absolute left-1/2 top-1/2"
            style={{
              transform: "translate(-50%, -50%)",
              width: 8,
              height: 10,
              borderRadius: 4,
              background: "#5C3A0A",
            }}
          />
        </div>
        {/* Bands */}
        <div className="absolute left-0 right-0 top-1/2" style={{ height: 6, background: "rgba(0,0,0,0.25)" }} />
      </div>
      {/* Coin sparkle */}
      <div
        className="absolute"
        style={{
          top: 0,
          left: 18,
          width: 8,
          height: 8,
          background: "#FFD166",
          borderRadius: "50%",
          boxShadow: "0 0 8px #FFD166",
          opacity: 0.85,
        }}
      />
      <div
        className="absolute"
        style={{
          top: 14,
          right: 24,
          width: 6,
          height: 6,
          background: "#FFE9A6",
          borderRadius: "50%",
          boxShadow: "0 0 6px #FFD166",
          opacity: 0.7,
        }}
      />
    </div>
  );
}

// ---------- QUESTS TAB ----------

function QuestsTab() {
  return (
    <GlassPanel className="p-3">
      <SectionTitle
        icon={<span aria-hidden>📜</span>}
        title="Weekly Clan Quests"
        action={<span className="text-[10px] opacity-60">Resets Mon 00:00</span>}
      />
      <div className="space-y-2 max-h-96 overflow-y-auto pr-1 clan-scroll">
        {MOCK_QUESTS.map((q) => {
          const done = q.progress >= q.goal;
          return (
            <div
              key={q.id}
              className="rounded-lg p-2.5"
              style={{
                background: done
                  ? "linear-gradient(90deg, rgba(124,245,225,0.15), transparent)"
                  : "rgba(10,27,61,0.4)",
                border: done
                  ? "1px solid rgba(124,245,225,0.4)"
                  : "1px solid rgba(124,245,225,0.12)",
              }}
            >
              <div className="flex items-start justify-between gap-2 mb-1.5">
                <div className="min-w-0">
                  <div className="text-xs font-bold" style={{ color: done ? "#7CF5E1" : "#EAF6FF" }}>
                    {q.title}
                  </div>
                  <div className="text-[10px] opacity-60">Expires {q.expires}</div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-[10px] font-bold flex items-center gap-0.5" style={{ color: "#FFD166" }}>
                    <GoldIcon size={11} />
                    {formatGold(q.reward)}
                  </div>
                  {done && (
                    <div className="text-[9px] font-bold mt-0.5" style={{ color: "#7CF5E1" }}>
                      ✓ Complete
                    </div>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <ProgressBar
                  value={q.progress}
                  max={q.goal}
                  color={done ? "#7CF5E1" : "#FFD166"}
                  height={6}
                />
                <span className="text-[10px] font-bold opacity-80 shrink-0">
                  {q.progress}/{q.goal}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </GlassPanel>
  );
}

// ---------- CHAT TAB ----------

function ChatTab({ faction }: { faction: FactionId }) {
  const f = FACTIONS[faction];
  return (
    <GlassPanel className="p-3">
      <SectionTitle
        icon={<span aria-hidden>💬</span>}
        title="Clan Chat"
        action={
          <span className="text-[10px] opacity-60">Reef Plot channel</span>
        }
      />
      <div className="space-y-2 max-h-72 overflow-y-auto pr-1 mb-2 clan-scroll">
        {MOCK_CHAT.map((m) => (
          <div key={m.id} className="flex items-start gap-2">
            <div
              className="shrink-0 flex items-center justify-center rounded-full text-[10px] font-bold"
              style={{
                width: 26,
                height: 26,
                background: `linear-gradient(135deg, ${f.colors.dark}, ${f.colors.primary}55)`,
                color: f.colors.light,
                border: `1px solid ${f.colors.accent}44`,
              }}
            >
              {initials(m.author)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-xs font-bold" style={{ color: f.colors.light }}>
                  {m.author}
                </span>
                <span
                  className="text-[8px] px-1 py-0.5 rounded uppercase font-bold tracking-wide"
                  style={{
                    background: `${roleColor(m.role)}22`,
                    color: roleColor(m.role),
                    border: `1px solid ${roleColor(m.role)}55`,
                  }}
                >
                  {m.role}
                </span>
                <span className="text-[9px] opacity-50">{m.ago}</span>
              </div>
              <div className="text-[12px] opacity-85 leading-snug">{m.message}</div>
            </div>
          </div>
        ))}
      </div>
      {/* Disabled input */}
      <div
        className="flex items-center gap-2 rounded-lg px-3 py-2"
        style={{
          background: "rgba(10,27,61,0.5)",
          border: "1px solid rgba(124,245,225,0.15)",
          opacity: 0.65,
        }}
      >
        <input
          disabled
          placeholder="Sign in to chat…"
          className="flex-1 bg-transparent outline-none text-sm"
          style={{ color: "rgba(234,246,255,0.6)" }}
        />
        <GlowButton variant="ghost" size="sm" disabled>
          Send
        </GlowButton>
      </div>
      <div className="text-[10px] opacity-50 mt-1.5 text-center">
        Live chat requires a backend — coming soon to the reef.
      </div>
    </GlassPanel>
  );
}

// ---------- NATIVE FACTION SELECT ----------

function NativeFactionSelect({
  value,
  onChange,
  allowAll = false,
}: {
  value: FactionId | null;
  onChange: (f: FactionId | null) => void;
  allowAll?: boolean;
}) {
  return (
    <select
      value={value ?? "all"}
      onChange={(e) => {
        const v = e.target.value;
        onChange(v === "all" ? null : (v as FactionId));
      }}
      className="px-3 py-2 text-xs rounded-lg outline-none cursor-pointer"
      style={{
        background: "rgba(10,27,61,0.6)",
        border: "1px solid rgba(124,245,225,0.25)",
        color: "#EAF6FF",
      }}
    >
      {allowAll && <option value="all">All Factions</option>}
      {FACTION_LIST.map((f) => (
        <option key={f.id} value={f.id}>
          {f.emblem} {f.name}
        </option>
      ))}
    </select>
  );
}
