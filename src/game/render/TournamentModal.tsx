// Crabtopia - Coral Crown Tournament Modal
// Self-contained competitive tournament modal: brackets, live spectate with
// streamer overlay, auto-clipped highlights, and team registration with
// creator-code + referral support (spec §4.10 & §10B problem 8).
// All tournament data is mocked locally — no tournament slice exists in gameStore.

"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useGame } from "../store/gameStore";
import { FACTIONS } from "../content/factions";
import { Crab, Team, FactionId, ClassId } from "../types";
import TeamSelect from "./TeamSelect";
import {
  firstAvailableTeam,
  teamAvailability,
} from "../engine/teamEligibility";
import {
  GlassPanel,
  GlowButton,
  StatChip,
  SectionTitle,
  GoldIcon,
  formatGold,
  EmptyState,
  FactionBadge,
  ClassIcon,
} from "./ui";
import CrabSheetSprite from "../animation/CrabSheetSprite";

// ---------- LOCAL TYPES ----------

interface TournamentTeam {
  name: string;
  faction: FactionId;
  seed: number;
  bp: number;
}

interface TournamentMatch {
  id: string;
  round: number; // 1=Quarter, 2=Semi, 3=Final
  teamA: TournamentTeam;
  teamB: TournamentTeam;
  winner?: "A" | "B";
  scoreA?: number;
  scoreB?: number;
  status: "scheduled" | "live" | "completed";
  scheduledAt: number;
  spectators?: number;
}

interface CrabCardInfo {
  name: string;
  classId: ClassId;
  faction: FactionId;
  bp: number;
  hp: number;
  maxHp: number;
}

interface LiveTeam {
  name: string;
  faction: FactionId;
  seed: number;
  bp: number;
  crabs: CrabCardInfo[];
}

interface LiveMatchState {
  teamA: LiveTeam;
  teamB: LiveTeam;
  scoreA: number;
  scoreB: number;
  turn: number;
  spectators: number;
  timeLeft: number; // seconds left in current turn
}

interface Highlight {
  id: string;
  title: string;
  matchInfo: string;
  durationSec: number;
  views: number;
  createdAt: number;
  faction: FactionId;
  category: "upset" | "raid_win" | "clutch" | "combo";
}

// ---------- MOCK DATA ----------

function makeMockMatches(): TournamentMatch[] {
  const now = Date.now();
  return [
    // Quarterfinals (round 1) — all completed
    {
      id: "qf1",
      round: 1,
      teamA: { name: "Tidecrest Brood", faction: "frostshelf", seed: 1, bp: 9120 },
      teamB: { name: "Mossback Gang", faction: "mangrove", seed: 8, bp: 6800 },
      winner: "A",
      scoreA: 2,
      scoreB: 0,
      status: "completed",
      scheduledAt: now - 3600_000,
      spectators: 820,
    },
    {
      id: "qf2",
      round: 1,
      teamA: { name: "Cinderfang Pack", faction: "cinderreef", seed: 4, bp: 8100 },
      teamB: { name: "Stormcall Pact", faction: "stormwake", seed: 5, bp: 7950 },
      winner: "B",
      scoreA: 1,
      scoreB: 2,
      status: "completed",
      scheduledAt: now - 3500_000,
      spectators: 1100,
    },
    {
      id: "qf3",
      round: 1,
      teamA: { name: "Coral Vanguard", faction: "coral_court", seed: 2, bp: 8800 },
      teamB: { name: "Moonveil Coven", faction: "moonpool", seed: 7, bp: 7100 },
      winner: "A",
      scoreA: 2,
      scoreB: 1,
      status: "completed",
      scheduledAt: now - 3400_000,
      spectators: 950,
    },
    {
      id: "qf4",
      round: 1,
      teamA: { name: "Gilded Sable", faction: "cinderreef", seed: 3, bp: 8400 },
      teamB: { name: "Frostwhisper", faction: "frostshelf", seed: 6, bp: 7500 },
      winner: "A",
      scoreA: 2,
      scoreB: 0,
      status: "completed",
      scheduledAt: now - 3300_000,
      spectators: 880,
    },
    // Semifinals (round 2) — 1 live, 1 scheduled
    {
      id: "sf1",
      round: 2,
      teamA: { name: "Tidecrest Brood", faction: "frostshelf", seed: 1, bp: 9120 },
      teamB: { name: "Stormcall Pact", faction: "stormwake", seed: 5, bp: 7950 },
      scoreA: 1,
      scoreB: 1,
      status: "live",
      scheduledAt: now - 300_000,
      spectators: 1247,
    },
    {
      id: "sf2",
      round: 2,
      teamA: { name: "Coral Vanguard", faction: "coral_court", seed: 2, bp: 8800 },
      teamB: { name: "Gilded Sable", faction: "cinderreef", seed: 3, bp: 8400 },
      status: "scheduled",
      scheduledAt: now + 1800_000,
    },
    // Finals (round 3) — scheduled, teams TBD
    {
      id: "fn1",
      round: 3,
      teamA: { name: "TBD", faction: "mangrove", seed: 0, bp: 0 },
      teamB: { name: "TBD", faction: "mangrove", seed: 0, bp: 0 },
      status: "scheduled",
      scheduledAt: now + 7200_000,
    },
  ];
}

const INITIAL_LIVE_MATCH: LiveMatchState = {
  teamA: {
    name: "Tidecrest Brood",
    faction: "frostshelf",
    seed: 1,
    bp: 9120,
    crabs: [
      { name: "Pincher", classId: "pincher", faction: "frostshelf", bp: 3200, hp: 280, maxHp: 540 },
      { name: "Warden", classId: "warden", faction: "frostshelf", bp: 2900, hp: 410, maxHp: 540 },
      { name: "Tidecaller", classId: "tidecaller", faction: "frostshelf", bp: 3020, hp: 540, maxHp: 540 },
    ],
  },
  teamB: {
    name: "Stormcall Pact",
    faction: "stormwake",
    seed: 5,
    bp: 7950,
    crabs: [
      { name: "Skitter", classId: "skitter", faction: "stormwake", bp: 2800, hp: 220, maxHp: 480 },
      { name: "Reaver", classId: "reaver", faction: "stormwake", bp: 2650, hp: 0, maxHp: 480 },
      { name: "Bulwark", classId: "bulwark", faction: "stormwake", bp: 2500, hp: 380, maxHp: 600 },
    ],
  },
  scoreA: 1,
  scoreB: 1,
  turn: 7,
  spectators: 1247,
  timeLeft: 18,
};

const BATTLE_LOG_EVENTS: string[] = [
  "Tidecrest's Pincher casts Ripple Strike on Stormcall's Skitter for 87 damage",
  "Stormcall's Warden taunts — +5% defense for 2 turns",
  "Tidecrest's Tidecaller channels Tidal Surge — 124 damage to all enemies",
  "Stormcall's Skitter triggers Double-Strike on Tidecaller (62 + 48 damage)",
  "Stormcall's Reaver is downed by Ripple Strike",
  "Tidecrest's Warden raises Aegis — +25% defense for 2 turns",
  "Stormcall's Bulwark lands a critical Shell Slam (156 damage)",
  "Tidecrest's Pincher dodges Bulwark's Slam",
];

const MOCK_HIGHLIGHTS: Highlight[] = [
  {
    id: "h1",
    title: "Biggest Upset: #8 seed beats #1 seed",
    matchInfo: "QF · Mossback vs Gilded Sable",
    durationSec: 8,
    views: 4820,
    createdAt: Date.now() - 3600_000,
    faction: "mangrove",
    category: "upset",
  },
  {
    id: "h2",
    title: "Best Raid Win: 3-crab sweep in 18s",
    matchInfo: "SF · Tidecrest vs Stormcall",
    durationSec: 12,
    views: 3910,
    createdAt: Date.now() - 5400_000,
    faction: "frostshelf",
    category: "raid_win",
  },
  {
    id: "h3",
    title: "Clutch Dodge: 1 HP comeback",
    matchInfo: "QF · Coral vs Moonveil",
    durationSec: 6,
    views: 2740,
    createdAt: Date.now() - 7200_000,
    faction: "coral_court",
    category: "clutch",
  },
  {
    id: "h4",
    title: "Triple Combo: Tidal Surge → Ripple → Crit",
    matchInfo: "SF · Tidecrest vs Stormcall",
    durationSec: 9,
    views: 2180,
    createdAt: Date.now() - 9000_000,
    faction: "frostshelf",
    category: "combo",
  },
  {
    id: "h5",
    title: "Final Stand: Bulwark solos last 2 crabs",
    matchInfo: "QF · Cinderfang vs Stormcall",
    durationSec: 14,
    views: 1650,
    createdAt: Date.now() - 10800_000,
    faction: "cinderreef",
    category: "clutch",
  },
  {
    id: "h6",
    title: "Upset Alert: #7 Moonveil pushes #2 Coral to game 5",
    matchInfo: "QF · Coral vs Moonveil",
    durationSec: 7,
    views: 1320,
    createdAt: Date.now() - 12600_000,
    faction: "moonpool",
    category: "upset",
  },
];

// ---------- HELPERS ----------

const GOLD = "#FFD166";
const BRONZE = "#CD7F32";

const ROUND_LABELS: Record<number, string> = {
  1: "Quarterfinals",
  2: "Semifinals",
  3: "Finals",
};

function formatClock(ts: number): string {
  const diff = ts - Date.now();
  if (Math.abs(diff) < 60_000) return "now";
  if (diff > 0) {
    const mins = Math.floor(diff / 60_000);
    if (mins < 60) return `in ${mins}m`;
    const hrs = Math.floor(mins / 60);
    return `in ${hrs}h ${mins % 60}m`;
  }
  const mins = Math.floor(-diff / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ago`;
}

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatViews(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return n.toString();
}

function hpColor(pct: number): string {
  if (pct > 0.5) return "#4FB477";
  if (pct > 0.2) return "#FFD166";
  return "#FF6F91";
}

// ---------- SUB-COMPONENTS ----------

function BracketTeamRow({
  team,
  isWinner,
  completed,
  score,
}: {
  team: TournamentTeam;
  isWinner: boolean;
  completed: boolean;
  score?: number;
}) {
  const dim = completed && !isWinner;
  const f = FACTIONS[team.faction];
  return (
    <div
      className="flex items-center justify-between gap-2 px-2 py-1 rounded-md"
      style={{
        background: isWinner ? `${f.colors.accent}1a` : "rgba(0,0,0,0.18)",
        opacity: dim ? 0.45 : 1,
        border: isWinner ? `1px solid ${f.colors.accent}66` : "1px solid transparent",
      }}
    >
      <div className="flex items-center gap-1.5 min-w-0">
        <FactionBadge faction={team.faction} size={14} />
        <span
          className="text-xs truncate font-semibold"
          style={{ color: isWinner ? GOLD : "#EAF6FF" }}
        >
          {team.name}
        </span>
        {team.seed > 0 && (
          <span className="text-[9px] text-white/40 shrink-0">#{team.seed}</span>
        )}
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        {team.bp > 0 && (
          <span className="text-[9px] text-white/45">{formatGold(team.bp)} BP</span>
        )}
        {score !== undefined && (
          <span
            className="text-sm font-bold tabular-nums"
            style={{ color: isWinner ? GOLD : "#EAF6FF" }}
          >
            {score}
          </span>
        )}
      </div>
    </div>
  );
}

function BracketMatchCard({
  match,
  onClick,
}: {
  match: TournamentMatch;
  onClick: () => void;
}) {
  const isLive = match.status === "live";
  const isCompleted = match.status === "completed";
  const isScheduled = match.status === "scheduled";
  const winnerA = match.winner === "A";
  const winnerB = match.winner === "B";

  const clickable = isLive || isCompleted;

  return (
    <button
      type="button"
      onClick={clickable ? onClick : undefined}
      disabled={!clickable}
      aria-label={`Match ${match.id}: ${match.teamA.name} vs ${match.teamB.name}, ${match.status}`}
      className="w-full text-left rounded-xl p-2.5 transition-all"
      style={{
        background: isLive
          ? "linear-gradient(160deg, rgba(255,80,80,0.18), rgba(10,27,61,0.6))"
          : "rgba(10,27,61,0.55)",
        border: isLive
          ? "1px solid rgba(255,80,80,0.55)"
          : `1px solid rgba(124,245,225,0.18)`,
        boxShadow: isLive ? "0 0 14px rgba(255,80,80,0.25)" : undefined,
        cursor: clickable ? "pointer" : "default",
      }}
    >
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[9px] uppercase tracking-wide text-white/45 font-bold">
          {ROUND_LABELS[match.round]}
        </span>
        {isLive && (
          <span
            className="px-1.5 py-0.5 rounded text-[9px] font-bold"
            style={{
              background: "rgba(255,80,80,0.25)",
              color: "#FF7A7A",
              border: "1px solid rgba(255,80,80,0.55)",
            }}
          >
            ● LIVE
          </span>
        )}
        {isCompleted && (
          <span className="text-[9px] font-bold text-white/50">FINAL SCORE</span>
        )}
        {isScheduled && (
          <span className="text-[9px] text-white/45">{formatClock(match.scheduledAt)}</span>
        )}
      </div>
      <BracketTeamRow
        team={match.teamA}
        isWinner={winnerA}
        completed={isCompleted}
        score={match.scoreA}
      />
      <div className="text-center text-[9px] text-white/35 my-0.5 font-bold">VS</div>
      <BracketTeamRow
        team={match.teamB}
        isWinner={winnerB}
        completed={isCompleted}
        score={match.scoreB}
      />
      {(isLive || (isCompleted && match.spectators)) && (
        <div className="mt-1 text-[9px] text-white/40 text-right">
          {match.spectators ? `${match.spectators.toLocaleString()} viewers` : ""}
        </div>
      )}
    </button>
  );
}

function LiveCrabCard({
  crab,
  reverse,
}: {
  crab: CrabCardInfo;
  reverse?: boolean;
}) {
  const pct = crab.maxHp > 0 ? crab.hp / crab.maxHp : 0;
  const isDead = crab.hp <= 0;
  const f = FACTIONS[crab.faction];
  return (
    <div
      className="rounded-lg p-2"
      style={{
        background: "rgba(0,0,0,0.28)",
        border: `1px solid ${f.colors.accent}${isDead ? "22" : "55"}`,
        opacity: isDead ? 0.55 : 1,
      }}
    >
      <div
        className={`flex items-center gap-1.5 ${reverse ? "flex-row-reverse" : ""}`}
      >
        <CrabSheetSprite
          classId={crab.classId}
          faction={crab.faction}
          size={34}
          state={isDead ? "death" : "idle"}
          seedKey={crab.name}
        />
        <div className={`min-w-0 flex-1 ${reverse ? "text-right" : ""}`}>
          <div className="text-xs font-bold truncate">{crab.name}</div>
          <div className="text-[9px] text-white/50">
            {formatGold(crab.bp)} BP{isDead ? " · DOWN" : ""}
          </div>
        </div>
      </div>
      <div
        className="mt-1 h-1.5 rounded-full overflow-hidden"
        style={{ background: "rgba(0,0,0,0.5)" }}
      >
        <div
          role="progressbar"
          aria-valuenow={Math.round(crab.hp)}
          aria-valuemin={0}
          aria-valuemax={crab.maxHp}
          aria-label={`${crab.name} HP`}
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: `${Math.max(0, pct) * 100}%`,
            background: hpColor(pct),
            marginLeft: reverse ? "auto" : 0,
          }}
        />
      </div>
    </div>
  );
}

function LiveTeamColumn({
  team,
  score,
  reverse,
}: {
  team: LiveTeam;
  score: number;
  reverse?: boolean;
}) {
  const f = FACTIONS[team.faction];
  return (
    <div
      className="rounded-xl p-3"
      style={{
        background: `linear-gradient(160deg, ${f.colors.dark}cc, ${f.colors.primary}1f)`,
        border: `1px solid ${f.colors.accent}55`,
      }}
    >
      <div className={`flex items-center gap-2 mb-2 ${reverse ? "flex-row-reverse" : ""}`}>
        <FactionBadge faction={team.faction} size={28} glow />
        <div className={`min-w-0 flex-1 ${reverse ? "text-right" : ""}`}>
          <div
            className="text-sm font-bold truncate"
            style={{ color: f.colors.accent }}
          >
            {team.name}
          </div>
          <div className="text-[10px] text-white/55">
            Seed #{team.seed} · {formatGold(team.bp)} BP
          </div>
        </div>
        <div
          className="text-3xl font-bold tabular-nums font-display"
          style={{ color: GOLD }}
        >
          {score}
        </div>
      </div>
      <div className="space-y-1.5">
        {team.crabs.map((c, i) => (
          <LiveCrabCard key={i} crab={c} reverse={reverse} />
        ))}
      </div>
    </div>
  );
}

function StreamerOverlay({
  match,
  battleLog,
  creatorCode,
}: {
  match: LiveMatchState;
  battleLog: string[];
  creatorCode: string;
}) {
  const fA = FACTIONS[match.teamA.faction];
  const fB = FACTIONS[match.teamB.faction];
  const latest = battleLog[battleLog.length - 1] ?? "";
  const code = creatorCode.trim().toUpperCase() || "SHELLWARDEN";
  return (
    <div
      className="relative w-full overflow-hidden rounded-xl"
      style={{
        aspectRatio: "16 / 9",
        background:
          "linear-gradient(135deg, #0A1B3D 0%, #0A4A66 50%, #1F1A6B 100%)",
        border: "1px solid rgba(124,245,225,0.2)",
      }}
    >
      {/* Top-left: team A */}
      <div className="absolute top-3 left-3 flex items-center gap-2">
        <FactionBadge faction={match.teamA.faction} size={36} glow />
        <div>
          <div
            className="text-sm font-bold leading-tight"
            style={{ color: fA.colors.accent }}
          >
            {match.teamA.name}
          </div>
          <div
            className="text-3xl font-bold leading-none font-display tabular-nums"
            style={{ color: GOLD }}
          >
            {match.scoreA}
          </div>
        </div>
      </div>

      {/* Top-right: team B */}
      <div className="absolute top-3 right-3 flex items-center gap-2 flex-row-reverse">
        <FactionBadge faction={match.teamB.faction} size={36} glow />
        <div className="text-right">
          <div
            className="text-sm font-bold leading-tight"
            style={{ color: fB.colors.accent }}
          >
            {match.teamB.name}
          </div>
          <div
            className="text-3xl font-bold leading-none font-display tabular-nums"
            style={{ color: GOLD }}
          >
            {match.scoreB}
          </div>
        </div>
      </div>

      {/* Center: VS + turn + spectators */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="text-center">
          <div className="text-xl font-bold text-white/40">VS</div>
          <div className="text-xs text-white/65 mt-0.5">
            Turn {match.turn} · {match.timeLeft}s
          </div>
          <div className="text-[10px] text-white/40 mt-0.5">
            {match.spectators.toLocaleString()} watching
          </div>
        </div>
      </div>

      {/* Bottom-left: caster info */}
      <div className="absolute left-3" style={{ bottom: 28 }}>
        <div
          className="flex items-center gap-1.5 rounded-md px-2 py-1"
          style={{
            background: "rgba(255,80,80,0.22)",
            border: "1px solid rgba(255,80,80,0.55)",
          }}
        >
          <span
            className="inline-block w-1.5 h-1.5 rounded-full"
            style={{
              background: "#FF5050",
              animation: "tpulse 1.1s ease-in-out infinite",
            }}
          />
          <span className="text-[10px] font-bold text-white whitespace-nowrap">
            Live on Crabtopia TV
          </span>
        </div>
      </div>

      {/* Bottom-right: sponsor + creator code */}
      <div className="absolute right-3 text-right" style={{ bottom: 28 }}>
        <div className="text-[10px] text-white/55 whitespace-nowrap">
          Sponsored by Shellwarden Supply
        </div>
        <div
          className="text-xs font-bold whitespace-nowrap"
          style={{ color: GOLD }}
        >
          Use code {code}
        </div>
      </div>

      {/* Bottom: battle log ticker */}
      <div
        className="absolute bottom-0 left-0 right-0 h-6 flex items-center px-3 overflow-hidden"
        style={{ background: "rgba(0,0,0,0.78)" }}
      >
        <div className="text-[10px] text-white/85 truncate font-mono">
          <span style={{ color: GOLD }}>›</span> {latest}
        </div>
      </div>

      {/* Local keyframes injected via style tag */}
      <style>{`@keyframes tpulse{0%,100%{opacity:1}50%{opacity:0.35}}`}</style>
    </div>
  );
}

function HighlightCard({
  hl,
  onClick,
}: {
  hl: Highlight;
  onClick: () => void;
}) {
  const f = FACTIONS[hl.faction];
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Play highlight: ${hl.title}`}
      className="group relative rounded-xl overflow-hidden text-left transition-all hover:-translate-y-1 hover:shadow-xl active:scale-[0.98]"
      style={{
        background: `linear-gradient(160deg, ${f.colors.dark}cc, ${f.colors.primary}33)`,
        border: `1px solid ${f.colors.accent}44`,
      }}
    >
      {/* Thumbnail (faction-tinted) */}
      <div
        className="relative h-24 flex items-center justify-center"
        style={{
          background: `radial-gradient(circle at 50% 40%, ${f.colors.accent}55, ${f.colors.dark}aa)`,
        }}
      >
        <FactionBadge faction={hl.faction} size={36} glow />
        <span
          className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded text-[8px] uppercase font-bold tracking-wide"
          style={{
            background: "rgba(0,0,0,0.55)",
            color: f.colors.accent,
            border: `1px solid ${f.colors.accent}55`,
          }}
        >
          {hl.category.replace("_", " ")}
        </span>
        <span
          className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 rounded text-[10px] font-bold tabular-nums"
          style={{
            background: "rgba(0,0,0,0.7)",
            color: "#EAF6FF",
          }}
        >
          {formatDuration(hl.durationSec)}
        </span>
        <span
          className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ color: GOLD, fontSize: 28 }}
          aria-hidden
        >
          ▶
        </span>
      </div>
      <div className="p-2.5">
        <div
          className="text-xs font-bold leading-tight line-clamp-2"
          style={{ color: "#EAF6FF" }}
        >
          {hl.title}
        </div>
        <div className="text-[10px] text-white/50 mt-1">{hl.matchInfo}</div>
        <div className="text-[10px] text-white/45 mt-0.5">
          {formatViews(hl.views)} views · {formatClock(hl.createdAt)}
        </div>
      </div>
    </button>
  );
}

// ---------- MAIN MODAL ----------

type ViewKind = "bracket" | "spectate" | "highlights" | "register";
type SortMode = "views" | "recent" | "upset";

const TABS: { id: ViewKind; label: string }[] = [
  { id: "bracket", label: "Bracket" },
  { id: "spectate", label: "Spectate" },
  { id: "highlights", label: "Highlights" },
  { id: "register", label: "Register" },
];

const SORT_LABELS: Record<SortMode, string> = {
  views: "Most viewed",
  recent: "Most recent",
  upset: "Biggest upset",
};

export default function TournamentModal({
  onClose,
}: {
  onClose: () => void;
}) {
  const player = useGame((s) => s.player);
  const pushToast = useGame((s) => s.pushToast);

  const [view, setView] = useState<ViewKind>("bracket");
  const [currentRound] = useState<number>(3);
  const [selectedMatch, setSelectedMatch] = useState<string | null>(null);
  const [streamerMode, setStreamerMode] = useState<boolean>(false);
  const [creatorCode, setCreatorCode] = useState<string>("");
  const [mockMatches] = useState<TournamentMatch[]>(() => makeMockMatches());
  const [mockLiveMatch, setMockLiveMatch] = useState<LiveMatchState>(INITIAL_LIVE_MATCH);
  const [battleLog, setBattleLog] = useState<string[]>(() =>
    BATTLE_LOG_EVENTS.slice(0, 4)
  );
  const [highlightSort, setHighlightSort] = useState<SortMode>("views");
  // Registered team: a saved team, auto-selected to the first available
  // (requireIdle) team so registration is one click for a ready player.
  const [registeredTeamId, setRegisteredTeamId] = useState<string | null>(
    () => {
      if (!player) return null;
      const byId = new Map(player.crabs.map((c) => [c.id, c] as const));
      return firstAvailableTeam(player.teams, byId)?.id ?? null;
    }
  );

  const crabsById = useMemo(
    () =>
      new Map((player?.crabs ?? []).map((c) => [c.id, c] as const)),
    [player]
  );
  const registeredTeam = useMemo(
    () => player?.teams.find((t) => t.id === registeredTeamId) ?? null,
    [player, registeredTeamId]
  );
  const registeredTeamAvailability = useMemo(
    () =>
      registeredTeam
        ? teamAvailability(registeredTeam, crabsById)
        : {
            available: false,
            reasons: ["Select an available team first"],
            filledCount: 0,
          },
    [registeredTeam, crabsById]
  );

  // Live HP ticking — every 1.5s, damage random alive crabs and append a log line.
  useEffect(() => {
    if (view !== "spectate") return;
    const interval = setInterval(() => {
      setMockLiveMatch((prev) => {
        const cloneTeam = (t: LiveTeam): LiveTeam => ({
          ...t,
          crabs: t.crabs.map((c) => ({ ...c })),
        });
        const next: LiveMatchState = {
          ...prev,
          teamA: cloneTeam(prev.teamA),
          teamB: cloneTeam(prev.teamB),
        };
        const aliveA = next.teamA.crabs.filter((c) => c.hp > 0);
        const aliveB = next.teamB.crabs.filter((c) => c.hp > 0);
        if (aliveA.length && aliveB.length) {
          const atk = aliveA[Math.floor(Math.random() * aliveA.length)];
          const tgt = aliveB[Math.floor(Math.random() * aliveB.length)];
          const dmg = 28 + Math.floor(Math.random() * 80);
          tgt.hp = Math.max(0, tgt.hp - dmg);
        }
        if (Math.random() < 0.55 && aliveA.length && aliveB.length) {
          const atk = aliveB[Math.floor(Math.random() * aliveB.length)];
          const tgt = aliveA[Math.floor(Math.random() * aliveA.length)];
          const dmg = 18 + Math.floor(Math.random() * 60);
          tgt.hp = Math.max(0, tgt.hp - dmg);
        }
        next.timeLeft = prev.timeLeft > 1 ? prev.timeLeft - 1 : 30;
        return next;
      });
      setBattleLog((prev) => {
        const next = [
          ...prev,
          BATTLE_LOG_EVENTS[Math.floor(Math.random() * BATTLE_LOG_EVENTS.length)],
        ];
        return next.slice(-12);
      });
    }, 1500);
    return () => clearInterval(interval);
  }, [view]);

  const qfMatches = useMemo(
    () => mockMatches.filter((m) => m.round === 1),
    [mockMatches]
  );
  const sfMatches = useMemo(
    () => mockMatches.filter((m) => m.round === 2),
    [mockMatches]
  );
  const fnMatches = useMemo(
    () => mockMatches.filter((m) => m.round === 3),
    [mockMatches]
  );

  const sortedHighlights = useMemo(() => {
    const arr = [...MOCK_HIGHLIGHTS];
    if (highlightSort === "views") arr.sort((a, b) => b.views - a.views);
    else if (highlightSort === "recent")
      arr.sort((a, b) => b.createdAt - a.createdAt);
    else if (highlightSort === "upset")
      arr.sort((a, b) => {
        const w = (h: Highlight) =>
          h.category === "upset" ? 1 : h.category === "clutch" ? 0.5 : 0;
        return w(b) - w(a) || b.views - a.views;
      });
    return arr;
  }, [highlightSort]);

  const eligible = (player?.shellwardenLevel ?? 0) >= 10;

  // Round progress dots: QF complete, SF live, Final scheduled
  const roundDots: { label: string; state: "done" | "live" | "scheduled" }[] = [
    { label: "QF", state: "done" },
    { label: "SF", state: "live" },
    { label: "Final", state: "scheduled" },
  ];

  function handleMatchClick(m: TournamentMatch) {
    if (m.status === "live") {
      setSelectedMatch(m.id);
      setView("spectate");
      pushToast({
        title: "Joining spectate",
        description: `Watching ${m.teamA.name} vs ${m.teamB.name}`,
        variant: "default",
      });
    } else if (m.status === "completed") {
      pushToast({
        title: "Replay link copied",
        description: `crabtopia.example/r/${m.id}`,
        variant: "success",
      });
    }
  }

  function handleRegister() {
    if (!eligible) {
      pushToast({
        title: "Not eligible",
        description: "Reach Shellwarden Level 10 to enter.",
        variant: "error",
      });
      return;
    }
    if (!registeredTeam || !registeredTeamAvailability.available) {
      pushToast({
        title: "Team not available",
        description:
          registeredTeamAvailability.reasons[0] ??
          "Select an available team first.",
        variant: "warning",
      });
      return;
    }
    pushToast({
      title: "Team registered for Coral Crown Tournament!",
      description: "Check bracket in 1 hour.",
      variant: "success",
    });
    setRegisteredTeamId(null);
  }

  return (
    <div
      className="modal-backdrop-enter fixed inset-0 z-[150] flex items-center justify-center p-2 sm:p-4"
      style={{
        background: "rgba(4,16,32,0.78)",
        backdropFilter: "blur(8px)",
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Coral Crown Tournament"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <GlassPanel
        className="w-full max-w-3xl max-h-[88vh] overflow-y-auto flex flex-col"
        glow="rgba(255,209,102,0.22)"
      >
        {/* ---------- HEADER ---------- */}
        <div
          className="px-4 sm:px-6 pt-4 pb-3 sticky top-0 z-10"
          style={{
            background:
              "linear-gradient(160deg, rgba(10,27,61,0.95), rgba(18,167,160,0.18))",
            borderBottom: "1px solid rgba(255,209,102,0.22)",
          }}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2
                className="text-lg sm:text-xl font-bold leading-tight"
                style={{
                  fontFamily: "Fredoka, system-ui, sans-serif",
                  color: GOLD,
                }}
              >
                Coral Crown Tournament
              </h2>
              <div className="text-[11px] text-white/65 mt-0.5">
                Season 1 · Week 5 of 8 · Single elimination
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close tournament modal"
              className="shrink-0 rounded-lg w-8 h-8 flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 transition-colors"
            >
              ✕
            </button>
          </div>

          {/* Round progress dots */}
          <div className="flex items-center gap-1.5 mt-2.5">
            {roundDots.map((d, i) => (
              <React.Fragment key={d.label}>
                <div
                  className="flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold"
                  style={{
                    background:
                      d.state === "live"
                        ? "rgba(255,80,80,0.2)"
                        : d.state === "done"
                          ? "rgba(79,180,119,0.18)"
                          : "rgba(255,255,255,0.06)",
                    border:
                      d.state === "live"
                        ? "1px solid rgba(255,80,80,0.5)"
                        : d.state === "done"
                          ? "1px solid rgba(79,180,119,0.5)"
                          : "1px solid rgba(255,255,255,0.18)",
                    color:
                      d.state === "live"
                        ? "#FF7A7A"
                        : d.state === "done"
                          ? "#9FE3B4"
                          : "rgba(234,246,255,0.7)",
                  }}
                >
                  {d.state === "done" ? "✓" : d.state === "live" ? "●" : "○"}
                  <span>{d.label}</span>
                </div>
                {i < roundDots.length - 1 && (
                  <span className="text-white/30 text-[10px]">→</span>
                )}
              </React.Fragment>
            ))}
            <span className="ml-auto text-[10px] text-white/45">
              Round {currentRound} of 3
            </span>
          </div>

          {/* Prize pool */}
          <div
            className="mt-2.5 rounded-lg px-2.5 py-1.5 text-[11px] flex items-center gap-1.5 flex-wrap"
            style={{
              background: `linear-gradient(135deg, ${GOLD}22, ${BRONZE}1a)`,
              border: `1px solid ${GOLD}44`,
            }}
          >
            <GoldIcon size={14} />
            <span className="font-bold" style={{ color: GOLD }}>
              10,000 GOLD
            </span>
            <span className="text-white/55">+ 6 Legendary eggs</span>
            <span className="text-white/55">+ Tideswell Crown cosmetics</span>
            <span className="text-white/45">· Top 8 split</span>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 mt-3 flex-wrap">
            {TABS.map((t) => {
              const active = view === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setView(t.id)}
                  aria-pressed={active}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold transition-all"
                  style={{
                    background: active
                      ? "linear-gradient(135deg, #FFD166, #FF7A1A)"
                      : "rgba(255,255,255,0.06)",
                    color: active ? "#0A1B3D" : "#EAF6FF",
                    border: active
                      ? "none"
                      : "1px solid rgba(124,245,225,0.2)",
                    boxShadow: active
                      ? "0 2px 10px rgba(255,209,102,0.4)"
                      : "none",
                  }}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* ---------- BODY ---------- */}
        <div className="px-4 sm:px-6 py-4 flex-1">
          {view === "bracket" && (
            <BracketView
              qfMatches={qfMatches}
              sfMatches={sfMatches}
              fnMatches={fnMatches}
              onMatchClick={handleMatchClick}
            />
          )}

          {view === "spectate" && (
            <SpectateView
              match={mockLiveMatch}
              battleLog={battleLog}
              streamerMode={streamerMode}
              onToggleStreamer={() => setStreamerMode((s) => !s)}
              creatorCode={creatorCode}
              pushToast={pushToast}
              selectedMatch={selectedMatch}
            />
          )}

          {view === "highlights" && (
            <HighlightsView
              highlights={sortedHighlights}
              sortMode={highlightSort}
              onSortChange={setHighlightSort}
              pushToast={pushToast}
            />
          )}

          {view === "register" && (
            <RegisterView
              eligible={eligible}
              shellwardenLevel={player?.shellwardenLevel ?? 0}
              teams={player?.teams ?? []}
              crabs={player?.crabs ?? []}
              selectedTeamId={registeredTeamId}
              onSelectTeam={setRegisteredTeamId}
              creatorCode={creatorCode}
              onCreatorCodeChange={setCreatorCode}
              onRegister={handleRegister}
              pushToast={pushToast}
            />
          )}
        </div>

        {/* ---------- FOOTER ---------- */}
        <div
          className="px-4 sm:px-6 py-3 mt-auto sticky bottom-0"
          style={{
            background: "rgba(4,16,32,0.92)",
            borderTop: "1px solid rgba(124,245,225,0.18)",
          }}
        >
          <div className="text-[10px] text-white/55 leading-relaxed mb-1">
            Tournaments run weekly. Brackets are fair-matched by BP. Replays are
            deterministic and shareable.
          </div>
          <div className="text-[10px] text-white/45 leading-relaxed mb-2">
            Creator codes give 5% of tournament fees back to creators. Referral
            codes give you 200 GOLD on first entry.
          </div>
          <div className="flex justify-end">
            <GlowButton variant="ghost" size="sm" onClick={onClose}>
              Close
            </GlowButton>
          </div>
        </div>
      </GlassPanel>
    </div>
  );
}

// ---------- VIEW COMPONENTS ----------

function BracketView({
  qfMatches,
  sfMatches,
  fnMatches,
  onMatchClick,
}: {
  qfMatches: TournamentMatch[];
  sfMatches: TournamentMatch[];
  fnMatches: TournamentMatch[];
  onMatchClick: (m: TournamentMatch) => void;
}) {
  return (
    <div className="space-y-3">
      <SectionTitle
        icon={<span style={{ color: GOLD }}>🏆</span>}
        title="Single Elimination Bracket"
        action={
          <span className="text-[10px] text-white/45">
            Click a LIVE match to spectate · Click a completed match for replay
          </span>
        }
      />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-5 items-start">
        <div className="space-y-2.5">
          <div className="text-[10px] uppercase tracking-wide text-white/55 text-center font-bold">
            Quarterfinals
          </div>
          {qfMatches.map((m) => (
            <BracketMatchCard
              key={m.id}
              match={m}
              onClick={() => onMatchClick(m)}
            />
          ))}
        </div>
        <div className="space-y-2.5 md:mt-8">
          <div className="text-[10px] uppercase tracking-wide text-white/55 text-center font-bold">
            Semifinals
          </div>
          {sfMatches.map((m) => (
            <BracketMatchCard
              key={m.id}
              match={m}
              onClick={() => onMatchClick(m)}
            />
          ))}
        </div>
        <div className="space-y-2.5 md:mt-16">
          <div className="text-[10px] uppercase tracking-wide text-white/55 text-center font-bold">
            Finals
          </div>
          {fnMatches.map((m) => (
            <BracketMatchCard
              key={m.id}
              match={m}
              onClick={() => onMatchClick(m)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function SpectateView({
  match,
  battleLog,
  streamerMode,
  onToggleStreamer,
  creatorCode,
  pushToast,
  selectedMatch,
}: {
  match: LiveMatchState;
  battleLog: string[];
  streamerMode: boolean;
  onToggleStreamer: () => void;
  creatorCode: string;
  pushToast: (t: {
    title: string;
    description?: string;
    variant: "default" | "success" | "error" | "warning";
  }) => void;
  selectedMatch: string | null;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <SectionTitle
          icon={<span style={{ color: "#FF7A7A" }}>📡</span>}
          title="Live Spectate"
          action={
            <span className="text-[10px] text-white/45">
              {selectedMatch ? `Match ${selectedMatch}` : "SF · Match 1"}
            </span>
          }
        />
        <button
          type="button"
          onClick={onToggleStreamer}
          aria-pressed={streamerMode}
          className="px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all"
          style={{
            background: streamerMode
              ? "linear-gradient(135deg, #7A5CFF, #5C7CFF)"
              : "rgba(255,255,255,0.06)",
            color: streamerMode ? "#FFFFFF" : "#EAF6FF",
            border: streamerMode
              ? "none"
              : "1px solid rgba(124,245,225,0.25)",
          }}
        >
          {streamerMode ? "✓ Streamer Mode" : "Streamer Mode"}
        </button>
      </div>

      {streamerMode ? (
        <StreamerOverlay
          match={match}
          battleLog={battleLog}
          creatorCode={creatorCode}
        />
      ) : null}

      {/* Live stats bar */}
      <div className="flex flex-wrap gap-2">
        <StatChip
          label="Spectators"
          value={`${match.spectators.toLocaleString()} watching`}
          color={GOLD}
        />
        <StatChip label="Turn" value={match.turn} color="#7CF5E1" />
        <StatChip
          label="Time Left"
          value={`${match.timeLeft}s`}
          color={match.timeLeft < 10 ? "#FF6F91" : "#7CF5E1"}
        />
        <StatChip
          label="Score"
          value={`${match.scoreA} - ${match.scoreB}`}
          color={GOLD}
        />
      </div>

      {!streamerMode && (
        <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-3 items-center">
          <LiveTeamColumn team={match.teamA} score={match.scoreA} />
          <div className="text-center">
            <div className="text-2xl font-bold text-white/40">VS</div>
            <div
              className="text-3xl font-bold tabular-nums font-display"
              style={{ color: GOLD }}
            >
              {match.scoreA}-{match.scoreB}
            </div>
          </div>
          <LiveTeamColumn team={match.teamB} score={match.scoreB} reverse />
        </div>
      )}

      {/* Battle log */}
      <div
        className="rounded-xl p-3 max-h-48 overflow-y-auto"
        style={{
          background: "rgba(10,27,61,0.6)",
          border: "1px solid rgba(124,245,225,0.15)",
        }}
      >
        <div className="text-[10px] uppercase tracking-wide text-white/55 mb-1.5 font-bold">
          Battle Log
        </div>
        <div className="space-y-1">
          {battleLog.map((line, i) => (
            <div
              key={i}
              className="text-xs font-mono leading-relaxed"
              style={{ color: "rgba(234,246,255,0.82)" }}
            >
              <span style={{ color: GOLD }} className="mr-1.5">
                ›
              </span>
              {line}
            </div>
          ))}
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex gap-2 flex-wrap">
        <GlowButton
          variant="gold"
          size="sm"
          onClick={() =>
            pushToast({
              title: "Replay link copied",
              description: "crabtopia.example/r/sf1",
              variant: "success",
            })
          }
        >
          Share Replay
        </GlowButton>
        <GlowButton
          variant="rose"
          size="sm"
          onClick={() =>
            pushToast({
              title: "Highlight clipped!",
              description: "Will appear in Highlights tab after match.",
              variant: "success",
            })
          }
        >
          Clip this moment
        </GlowButton>
        <GlowButton
          variant="ghost"
          size="sm"
          onClick={() =>
            pushToast({
              title: "Replay link copied",
              description: "Shareable link in your clipboard.",
              variant: "success",
            })
          }
        >
          Copy Shareable Link
        </GlowButton>
      </div>
    </div>
  );
}

function HighlightsView({
  highlights,
  sortMode,
  onSortChange,
  pushToast,
}: {
  highlights: Highlight[];
  sortMode: SortMode;
  onSortChange: (m: SortMode) => void;
  pushToast: (t: {
    title: string;
    description?: string;
    variant: "default" | "success" | "error" | "warning";
  }) => void;
}) {
  const sortModes: SortMode[] = ["views", "recent", "upset"];
  return (
    <div className="space-y-3">
      <SectionTitle
        icon={<span style={{ color: GOLD }}>🎬</span>}
        title="Auto-Clipped Highlights"
        action={
          <div className="flex gap-1">
            {sortModes.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => onSortChange(m)}
                aria-pressed={sortMode === m}
                className="px-2 py-0.5 rounded-md text-[10px] font-bold transition-all"
                style={{
                  background:
                    sortMode === m
                      ? "rgba(255,209,102,0.2)"
                      : "rgba(255,255,255,0.05)",
                  color: sortMode === m ? GOLD : "rgba(234,246,255,0.7)",
                  border:
                    sortMode === m
                      ? `1px solid ${GOLD}55`
                      : "1px solid rgba(124,245,225,0.18)",
                }}
              >
                {SORT_LABELS[m]}
              </button>
            ))}
          </div>
        }
      />
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5">
        {highlights.map((hl) => (
          <HighlightCard
            key={hl.id}
            hl={hl}
            onClick={() =>
              pushToast({
                title: "Playing highlight...",
                description: hl.title,
                variant: "default",
              })
            }
          />
        ))}
      </div>
      {highlights.length === 0 && (
        <EmptyState
          message="No highlights yet"
          hint="Highlights are auto-clipped during live tournament matches."
        />
      )}
    </div>
  );
}

function RegisterView({
  eligible,
  shellwardenLevel,
  teams,
  crabs,
  selectedTeamId,
  onSelectTeam,
  creatorCode,
  onCreatorCodeChange,
  onRegister,
  pushToast,
}: {
  eligible: boolean;
  shellwardenLevel: number;
  teams: Team[];
  crabs: Crab[];
  selectedTeamId: string | null;
  onSelectTeam: (id: string) => void;
  creatorCode: string;
  onCreatorCodeChange: (v: string) => void;
  onRegister: () => void;
  pushToast: (t: {
    title: string;
    description?: string;
    variant: "default" | "success" | "error" | "warning";
  }) => void;
}) {
  const crabsById = new Map(crabs.map((c) => [c.id, c] as const));
  const selectedTeam = teams.find((t) => t.id === selectedTeamId) ?? null;
  const availability = selectedTeam
    ? teamAvailability(selectedTeam, crabsById)
    : {
        available: false,
        reasons: ["Select an available team first"],
        filledCount: 0,
      };
  return (
    <div className="space-y-3">
      <SectionTitle
        icon={<span style={{ color: GOLD }}>⚔️</span>}
        title="Register Your Team"
      />

      {/* Tournament info chips */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <StatChip
          icon={<GoldIcon size={14} />}
          label="Entry Fee"
          value="500 GOLD"
          color={GOLD}
        />
        <StatChip
          label="Required Level"
          value="SW 10+"
          color={eligible ? "#4FB477" : "#FF6F91"}
        />
        <StatChip label="Team Size" value="5 crabs" color="#7CF5E1" />
        <StatChip label="Format" value="Single elim" color="#7CF5E1" />
      </div>

      {/* Eligibility banner */}
      {!eligible && (
        <div
          className="rounded-xl p-3"
          style={{
            background: "rgba(255,80,80,0.12)",
            border: "1px solid rgba(255,80,80,0.4)",
          }}
        >
          <div
            className="text-sm font-bold"
            style={{ color: "#FF6F91" }}
          >
            ⛔ Not eligible yet
          </div>
          <div className="text-xs text-white/70 mt-0.5">
            Reach Shellwarden Level 10 to enter. You&apos;re at Level{" "}
            {shellwardenLevel} — {Math.max(0, 10 - shellwardenLevel)} more to go.
          </div>
        </div>
      )}

      {/* Team picker — saved teams via the shared TeamSelect */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-bold">Pick Your Saved Team</h3>
          <span className="text-[10px] text-white/55">
            {availability.filledCount}/5 selected
          </span>
        </div>
        <TeamSelect
          teams={teams}
          crabs={crabs}
          selectedTeamId={selectedTeamId}
          onSelect={onSelectTeam}
          requireIdle={true}
          testIdPrefix="tournament-team-select"
        />
        {!selectedTeam && (
          <div className="mt-2 text-[11px] font-bold" style={{ color: "#FF6F91" }}>
            Select an available team first — registration needs a team of 5
            idle crabs.
          </div>
        )}
      </div>

      {/* Creator code */}
      <div>
        <div className="text-sm font-bold mb-1">Support a Creator (optional)</div>
        <input
          value={creatorCode}
          onChange={(e) => onCreatorCodeChange(e.target.value)}
          placeholder="e.g. SHELLWARDEN"
          maxLength={20}
          className="w-full rounded-xl px-3 py-2 text-sm"
          style={{
            background: "rgba(10,27,61,0.6)",
            border: "1px solid rgba(124,245,225,0.25)",
            color: "#EAF6FF",
          }}
          aria-label="Creator code"
        />
        <div className="text-[10px] text-white/55 mt-1">
          Creator codes give 5% of tournament fees back to creators. Referral
          codes give you 200 GOLD on first entry.
        </div>
      </div>

      {/* Register button */}
      <GlowButton
        variant="gold"
        size="lg"
        disabled={!eligible || !availability.available}
        onClick={onRegister}
        className="w-full"
        title={
          !eligible
            ? "Reach Shellwarden Level 10 to register"
            : !availability.available
              ? (availability.reasons[0] ?? "Select an available team")
              : "Register your team"
        }
      >
        Register Team (500 GOLD)
      </GlowButton>

      {/* Tournament rules link */}
      <button
        type="button"
        onClick={() =>
          pushToast({
            title: "Tournament rules",
            description:
              "Single elimination, fair-matched by BP. Best-of-3 quarters & semis, best-of-5 finals. Replays are deterministic.",
            variant: "default",
          })
        }
        className="text-xs text-white/55 underline hover:text-white/80 transition-colors"
      >
        Read full tournament rules →
      </button>
    </div>
  );
}
