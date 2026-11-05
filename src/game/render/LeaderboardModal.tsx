// Crabtopia - Leaderboards Modal
// Self-contained global + faction leaderboards: Shellwardens, Top Crabs, Clans,
// and the Faction War territory map. All ranked data is mocked locally via a
// seeded RNG so standings stay stable across renders.

"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useGame } from "../store/gameStore";
import { FACTIONS, FACTION_LIST } from "../content/factions";
import { CLASSES } from "../content/classes";
import { FactionId, ClassId } from "../types";
import { crabBaseBP } from "../engine/bp";
import { mulberry32, pick, randInt } from "../engine/rng";
import {
  GlassPanel,
  GlowButton,
  StatChip,
  SectionTitle,
  GoldIcon,
  formatGold,
  formatBP,
  EmptyState,
  FACTION_EMBLEM_ART,
  classIcon,
} from "./ui";
import { ClassArtImage } from "./CrabArtImage";

// ---------- LOCAL TYPES ----------

interface RankedPlayer {
  rank: number;
  name: string;
  faction: FactionId;
  level: number;
  gold: number;
  raidsWon: number;
  coliseumWins: number;
  trophies: number;
}

interface RankedCrab {
  rank: number;
  name: string;
  owner: string;
  faction: FactionId;
  classId: ClassId;
  bp: number;
  purity: string; // "18/18"
  generation: number;
}

interface RankedClan {
  rank: number;
  name: string;
  tag: string;
  faction: FactionId;
  members: number;
  clanPower: number;
  plotsHeld: number;
  chestProgress: number;
}

interface FactionWarEntry {
  faction: FactionId;
  warScore: number;
  territory: number;
  activeMembers: number;
}

type Board = "shellwardens" | "crabs" | "clans" | "factions";
type TimeRange = "season" | "weekly" | "all-time";
type CrabSort = "bp" | "purity";
type ClanSort = "power" | "plots" | "chest";

// ---------- THEME CONSTANTS ----------

const GOLD = "#FFD166";
const SILVER = "#C9D6EE";
const BRONZE = "#C97A3A";
const COPPER = "#B87333";
const IRON = "#6B7280";
const PODIUM_COLORS = [GOLD, SILVER, BRONZE, COPPER, IRON];
const FONT_DISPLAY = "Fredoka, system-ui, sans-serif";

// Player mock constants (spec: pinned player row at #342)
const MY_RANK = 342;
const TOTAL_RANKED = 2854;
const TOP_PCT = Math.ceil((MY_RANK / TOTAL_RANKED) * 100);
const MY_TROPHIES = 1847;
const MY_BEST_CRAB_RANK = 57;

// Time range scaling for seasonal numbers (weekly = this week's gains)
const TIME_SCALE: Record<TimeRange, number> = {
  season: 1,
  weekly: 0.32,
  "all-time": 1.6,
};

const BOARD_TABS: { id: Board; label: string; icon: string }[] = [
  { id: "shellwardens", label: "Shellwardens", icon: "🏆" },
  { id: "crabs", label: "Top Crabs", icon: "🦀" },
  { id: "clans", label: "Clans", icon: "🛡️" },
  { id: "factions", label: "Faction War", icon: "⚔️" },
];

const TIME_OPTIONS: { id: TimeRange; label: string }[] = [
  { id: "season", label: "Season" },
  { id: "weekly", label: "Weekly" },
  { id: "all-time", label: "All-time" },
];

const CRAB_SORT_OPTIONS: { id: CrabSort; label: string }[] = [
  { id: "bp", label: "BP" },
  { id: "purity", label: "Purity" },
];

const CLAN_SORT_OPTIONS: { id: ClanSort; label: string }[] = [
  { id: "power", label: "Power" },
  { id: "plots", label: "Plots" },
  { id: "chest", label: "Chest" },
];

const RANKED_COUNT_LABEL: Record<Board, string> = {
  shellwardens: "2,854 ranked",
  crabs: "1,204 crabs",
  clans: "8 clans",
  factions: "6 factions",
};

// ---------- MOCK DATA BUILDERS (seeded) ----------

const PLAYER_HEADS = [
  "Tide", "Reef", "Salt", "Moon", "Storm", "Deep", "Coral", "Ember",
  "Frost", "Moss", "Pearl", "Wave", "Abyss", "Kelp", "Drift", "Shell",
  "Brine", "Aurora", "Mist", "Lagoon", "Gilt", "Current", "Surge", "Plank",
];

const PLAYER_TAILS = [
  "warden", "seeker", "breaker", "mancer", "blade", "singer", "hunter", "raider",
  "tamer", "weaver", "striker", "champion", "scamp", "lord", "queen", "sage",
  "rogue", "viking", "mara", "oracle",
];

function buildMockPlayers(): RankedPlayer[] {
  const rng = mulberry32(0x5eed1a);
  const used = new Set<string>();
  const list: RankedPlayer[] = [];
  for (let i = 0; i < 50; i++) {
    let name = pick(PLAYER_HEADS, rng) + pick(PLAYER_TAILS, rng);
    if (used.has(name) || rng() < 0.3) name += String(randInt(2, 99, rng));
    while (used.has(name)) name += String(randInt(0, 9, rng));
    used.add(name);
    const decay = 50 - i;
    list.push({
      rank: i + 1,
      name,
      faction: FACTION_LIST[i % 6].id,
      level: Math.max(6, 45 - Math.floor(i / 2) - randInt(0, 3, rng)),
      gold: decay * 7400 + randInt(0, 5400, rng),
      raidsWon: Math.max(4, 152 - i * 2 - randInt(0, 7, rng)),
      coliseumWins: Math.max(2, 98 - Math.floor(i * 1.5) - randInt(0, 5, rng)),
      trophies: Math.max(420, 3420 - i * 41 - randInt(0, 18, rng)),
    });
  }
  return list;
}

const CRAB_HEADS = [
  "Abyss", "Ember", "Frost", "Storm", "Moon", "Coral", "Moss", "Pearl",
  "Deep", "Rift", "Gilt", "Brine", "Aurora", "Salt", "Wave", "Maw",
  "Shard", "Thorn", "Drift", "Cinder",
];

const CRAB_TAILS = [
  "maw", "fang", "song", "crest", "warden", "shard", "veil", "maul",
  "gale", "brand", "thorn", "spire", "coil", "howl", "snap", "watch",
  "grip", "bind", "bloom", "roar",
];

function buildMockCrabs(players: RankedPlayer[]): RankedCrab[] {
  const rng = mulberry32(0xc4ab50);
  const allClasses = Object.keys(CLASSES) as ClassId[];
  // Rank 1 is fixed by spec: Tidebreaker, 2,412 BP, 18/18 pure, Gen 4.
  const list: RankedCrab[] = [
    {
      rank: 1,
      name: "Tidebreaker",
      owner: players[0].name,
      faction: "cinderreef",
      classId: "reaver",
      bp: 2412,
      purity: "18/18",
      generation: 4,
    },
  ];
  const used = new Set(["Tidebreaker"]);
  for (let i = 1; i < 20; i++) {
    let name = pick(CRAB_HEADS, rng) + pick(CRAB_TAILS, rng);
    if (used.has(name) || rng() < 0.2) name += String(randInt(2, 99, rng));
    while (used.has(name)) name += String(randInt(0, 9, rng));
    used.add(name);
    const pureGenes = Math.min(18, Math.max(12, 18 - Math.floor(i / 6) - randInt(0, 2, rng)));
    list.push({
      rank: i + 1,
      name,
      owner: pick(players, rng).name,
      faction: FACTION_LIST[i % 6].id,
      classId: allClasses[i % allClasses.length],
      bp: Math.max(1805, 2384 - (i - 1) * 28 - randInt(0, 12, rng)),
      purity: `${pureGenes}/18`,
      generation: randInt(2, 9, rng),
    });
  }
  return list;
}

const CLAN_DEFS: { name: string; tag: string; faction: FactionId }[] = [
  { name: "Tidebound Sovereigns", tag: "TIDE", faction: "coral_court" },
  { name: "Ember Covenant", tag: "MBER", faction: "cinderreef" },
  { name: "Glacial Vanguard", tag: "FROST", faction: "frostshelf" },
  { name: "Rootbound Circle", tag: "ROOT", faction: "mangrove" },
  { name: "Tempest Syndicate", tag: "STRM", faction: "stormwake" },
  { name: "Moonlit Cabal", tag: "MOON", faction: "moonpool" },
  { name: "Gilded Reefwatch", tag: "GILD", faction: "coral_court" },
  { name: "Ashen Depthkeepers", tag: "ASHN", faction: "cinderreef" },
];

function buildMockClans(): RankedClan[] {
  const rng = mulberry32(0xc1a457);
  return CLAN_DEFS.map((def, i) => ({
    rank: i + 1,
    name: def.name,
    tag: def.tag,
    faction: def.faction,
    members: Math.min(50, Math.max(28, 50 - i * 2 - randInt(0, 2, rng))),
    clanPower: 214000 - i * 17500 - randInt(0, 8000, rng),
    plotsHeld: Math.max(2, 16 - i * 2 - randInt(0, 2, rng)),
    chestProgress: Math.min(0.98, Math.max(0.12, 0.94 - i * 0.09 + rng() * 0.08)),
  }));
}

// Faction War standings (territory shares sum to 100%)
const FACTION_WAR: FactionWarEntry[] = [
  { faction: "coral_court", warScore: 187400, territory: 22, activeMembers: 1243 },
  { faction: "stormwake", warScore: 161850, territory: 19, activeMembers: 1187 },
  { faction: "cinderreef", warScore: 144300, territory: 17, activeMembers: 1021 },
  { faction: "moonpool", warScore: 128750, territory: 15, activeMembers: 984 },
  { faction: "frostshelf", warScore: 119200, territory: 14, activeMembers: 876 },
  { faction: "mangrove", warScore: 110600, territory: 13, activeMembers: 812 },
];

const MAX_TERRITORY = Math.max(...FACTION_WAR.map((e) => e.territory));
const TOTAL_WARDENS = FACTION_WAR.reduce((sum, e) => sum + e.activeMembers, 0);

function purityNum(purity: string): number {
  return Number(purity.split("/")[0]) || 0;
}

// ---------- SMALL PRESENTATIONAL PIECES ----------

function RankBadge({ rank, you = false }: { rank: number; you?: boolean }) {
  if (rank <= 3) {
    const c = PODIUM_COLORS[rank - 1];
    return (
      <div
        className="relative shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-[11px] font-extrabold"
        style={{ background: `${c}26`, border: `1px solid ${c}`, color: c, boxShadow: `0 0 8px ${c}44` }}
        title={`Rank ${rank}`}
      >
        {rank}
        <span
          className="absolute -top-1.5 -right-1.5 text-[8px] leading-none"
          style={{ filter: "drop-shadow(0 0 3px rgba(255,209,102,0.6))" }}
          aria-hidden="true"
        >
          👑
        </span>
      </div>
    );
  }
  const base: React.CSSProperties = you
    ? { background: "rgba(255,209,102,0.14)", border: "1px solid rgba(255,209,102,0.6)", color: GOLD }
    : { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.55)" };
  return (
    <div
      className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-bold"
      style={base}
      title={`Rank ${rank}`}
    >
      {rank > 999 ? `${(rank / 1000).toFixed(1)}k` : rank}
    </div>
  );
}

function PlayerAvatar({ name, faction, size = 36 }: { name: string; faction: FactionId; size?: number }) {
  const f = FACTIONS[faction];
  return (
    <div
      className="relative shrink-0 rounded-full flex items-center justify-center"
      style={{ width: size, height: size, background: `${f.colors.dark}cc`, border: `2px solid ${f.colors.primary}` }}
      aria-hidden="true"
    >
      <span className="text-sm font-extrabold" style={{ color: f.colors.accent }}>
        {name.charAt(0).toUpperCase()}
      </span>
      <img
        src={FACTION_EMBLEM_ART[faction]}
        alt={f.name}
        width={14}
        height={14}
        className="absolute -bottom-1 -right-1 object-contain"
        style={{ filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.6))" }}
      />
    </div>
  );
}

function MiniStat({ label, value, color }: { label: string; value: React.ReactNode; color: string }) {
  return (
    <div className="text-right">
      <div className="text-[9px] uppercase tracking-wide text-white/45 leading-none">{label}</div>
      <div className="text-xs font-bold leading-tight" style={{ color }}>
        {value}
      </div>
    </div>
  );
}

function FilterPill({
  active,
  onClick,
  label,
  icon,
  activeColor,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  icon?: React.ReactNode;
  activeColor?: string;
}) {
  const c = activeColor ?? "#7CF5E1";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold transition-all duration-150 hover:-translate-y-px ${
        active ? "" : "text-white/55 hover:text-white/85"
      }`}
      style={
        active
          ? { background: `${c}1f`, border: `1px solid ${c}88`, color: c }
          : { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)" }
      }
    >
      {icon && <span className="text-[10px] leading-none flex items-center justify-center">{icon}</span>}
      {label}
    </button>
  );
}

function FactionPills({ value, onChange }: { value: FactionId | "all"; onChange: (v: FactionId | "all") => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      <FilterPill active={value === "all"} onClick={() => onChange("all")} label="All Factions" />
      {FACTION_LIST.map((f) => (
        <FilterPill
          key={f.id}
          active={value === f.id}
          onClick={() => onChange(f.id)}
          label={f.shortName}
          icon={<img src={FACTION_EMBLEM_ART[f.id]} alt="" width={14} height={14} className="object-contain" />}
          activeColor={f.colors.accent}
        />
      ))}
    </div>
  );
}

function ClassPills({ value, onChange }: { value: ClassId | "all"; onChange: (v: ClassId | "all") => void }) {
  const ids = Object.keys(CLASSES) as ClassId[];
  return (
    <div className="flex flex-wrap gap-1.5">
      <FilterPill active={value === "all"} onClick={() => onChange("all")} label="All Classes" />
      {ids.map((id) => (
        <FilterPill
          key={id}
          active={value === id}
          onClick={() => onChange(id)}
          label={CLASSES[id].name}
          icon={<span>{classIcon(id)}</span>}
        />
      ))}
    </div>
  );
}

function SegPills<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { id: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div
      className="inline-flex items-center gap-1 p-0.5 rounded-full"
      style={{ background: "rgba(10,27,61,0.6)", border: "1px solid rgba(124,245,225,0.15)" }}
      role="group"
    >
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onChange(o.id)}
          aria-pressed={value === o.id}
          className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold transition-all duration-150 ${
            value === o.id ? "" : "text-white/55 hover:text-white/85"
          }`}
          style={
            value === o.id
              ? { background: "linear-gradient(135deg, #FFD166, #FF7A1A)", color: "#0A1B3D" }
              : undefined
          }
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ---------- BOARD ROW COMPONENTS ----------

function PlayerRow({
  p,
  scale,
  isYou = false,
  onClick,
}: {
  p: RankedPlayer;
  scale: number;
  isYou?: boolean;
  onClick?: () => void;
}) {
  const f = FACTIONS[p.faction];
  const gold = Math.round(p.gold * scale);
  const trophies = Math.round(p.trophies * scale);
  return (
    <div
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={(e) => {
        if (onClick && (e.key === "Enter" || e.key === " ")) onClick();
      }}
      className={`w-full flex items-center gap-2 sm:gap-3 px-2.5 py-2 rounded-xl transition-all duration-150 ${
        onClick ? "cursor-pointer hover:bg-white/5 active:scale-[0.99]" : ""
      } ${isYou ? "" : ""}`}
      style={
        isYou
          ? {
              border: "1.5px solid #FFD166",
              background: "rgba(255,209,102,0.08)",
              boxShadow: "0 0 14px rgba(255,209,102,0.18)",
            }
          : undefined
      }
    >
      <RankBadge rank={p.rank} you={isYou} />
      <PlayerAvatar name={p.name} faction={p.faction} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-sm font-bold truncate">{p.name}</span>
          {isYou && (
            <span
              className="shrink-0 px-1.5 py-0.5 rounded-md text-[8px] font-extrabold tracking-widest"
              style={{ background: "linear-gradient(135deg, #FFD166, #FF7A1A)", color: "#0A1B3D" }}
            >
              YOU
            </span>
          )}
        </div>
        <div className="text-[10px] text-white/50 flex items-center gap-1 min-w-0">
          <span className="shrink-0">Lv {p.level}</span>
          <span className="lg:hidden shrink-0">·</span>
          <span className="lg:hidden inline-flex items-center gap-0.5 shrink-0">
            <GoldIcon size={10} />
            {formatGold(gold)}
          </span>
          <span className="hidden lg:inline truncate">· {f.shortName}</span>
        </div>
      </div>
      <div className="hidden lg:flex items-center gap-3 shrink-0">
        <MiniStat
          label="GOLD"
          value={
            <span className="inline-flex items-center gap-0.5">
              <GoldIcon size={11} />
              {formatGold(gold)}
            </span>
          }
          color={GOLD}
        />
        <MiniStat label="RAIDS WON" value={p.raidsWon} color="#FF6F91" />
        <MiniStat label="COLISEUM" value={p.coliseumWins} color="#7CF5E1" />
      </div>
      <div className="shrink-0 text-right min-w-[60px]">
        <div className="text-sm font-extrabold leading-none" style={{ color: GOLD }}>
          {trophies.toLocaleString()}
        </div>
        <div className="text-[9px] text-white/45 mt-0.5 uppercase tracking-wide">
          {trophies > 0 ? "trophies" : "—"}
        </div>
      </div>
    </div>
  );
}

function Podium({ players, scale }: { players: RankedPlayer[]; scale: number }) {
  const [first, second, third, fourth, fifth] = players;
  // Visual order: 4th | 2nd | 1st | 3rd | 5th — peak in center, descends outward.
  const spots: { p: RankedPlayer; h: string; color: string; place: number }[] = [
    { p: fourth, h: "h-10 sm:h-12", color: COPPER, place: 4 },
    { p: second, h: "h-16 sm:h-20", color: SILVER, place: 2 },
    { p: first, h: "h-24 sm:h-28", color: GOLD, place: 1 },
    { p: third, h: "h-12 sm:h-16", color: BRONZE, place: 3 },
    { p: fifth, h: "h-8 sm:h-10", color: IRON, place: 5 },
  ].filter((s) => s.p);
  return (
    <div className="grid grid-cols-5 gap-1 sm:gap-2 items-end mt-3 mb-1">
      {spots.map(({ p, h, color, place }) => (
        <div key={place} className="flex flex-col items-center min-w-0">
          {place === 1 && (
            <span
              className="text-lg leading-none mb-0.5"
              style={{ filter: "drop-shadow(0 0 6px rgba(255,209,102,0.7))" }}
              aria-label="Champion"
            >
              👑
            </span>
          )}
          <PlayerAvatar name={p.name} faction={p.faction} size={place === 1 ? 42 : 32} />
          <div className="text-[10px] sm:text-[11px] font-bold truncate w-full text-center mt-1">{p.name}</div>
          <div className="text-[9px] sm:text-[10px] font-extrabold" style={{ color }}>
            {Math.round(p.trophies * scale).toLocaleString()} 🏆
          </div>
          <div
            className={`${h} w-full rounded-t-xl mt-1 flex items-start justify-center pt-1`}
            style={{
              background: `linear-gradient(180deg, ${color}55, ${color}18)`,
              border: `1px solid ${color}66`,
              borderBottom: "none",
            }}
          >
            <span className="text-xs sm:text-sm font-extrabold" style={{ color }}>
              {place}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

function CrabRow({ c }: { c: RankedCrab }) {
  const f = FACTIONS[c.faction];
  const isPure = c.purity === "18/18";
  return (
    <div className="w-full flex items-center gap-2 sm:gap-3 px-2.5 py-2 rounded-xl">
      <RankBadge rank={c.rank} />
      <div
        className="w-11 h-11 rounded-xl overflow-hidden shrink-0 flex items-center justify-center"
        style={{ background: `${f.colors.dark}aa`, border: `1px solid ${f.colors.primary}55` }}
      >
        <ClassArtImage classId={c.classId} faction={c.faction} size={40} speed={0} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1 min-w-0">
          <span className="text-sm font-bold truncate">{c.name}</span>
          {isPure && (
            <span className="text-[10px] shrink-0" style={{ color: GOLD }} title="Legendary parts">
              ✨
            </span>
          )}
        </div>
        <div className="text-[10px] text-white/50 truncate">
          by {c.owner} · Gen {c.generation}
        </div>
      </div>
      <div className="hidden sm:flex items-center gap-1.5 shrink-0">
        <img src={FACTION_EMBLEM_ART[c.faction]} alt={f.name} width={16} height={16} className="object-contain" title={f.name} />
        <span className="text-[10px] font-bold" style={{ color: f.colors.accent }}>
          {f.shortName}
        </span>
        <span
          className="inline-flex items-center justify-center rounded-md w-[18px] h-[18px] text-[10px]"
          style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(124,245,225,0.18)" }}
          title={CLASSES[c.classId].name}
        >
          {classIcon(c.classId)}
        </span>
      </div>
      <div className="shrink-0 text-right min-w-[84px]">
        <div className="text-base font-extrabold leading-none" style={{ color: GOLD }}>
          {formatBP(c.bp)} <span className="text-[9px] text-white/50 font-bold">BP</span>
        </div>
        <span
          className="inline-block px-1.5 py-0.5 rounded-md text-[9px] font-bold mt-1"
          style={
            isPure
              ? { background: `${GOLD}22`, border: `1px solid ${GOLD}`, color: GOLD }
              : { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.6)" }
          }
          title={`Purity: ${c.purity} dominant genes`}
        >
          {isPure ? "✨ 18/18 pure" : c.purity}
        </span>
      </div>
    </div>
  );
}

function ClanRow({ clan, onClick }: { clan: RankedClan; onClick: () => void }) {
  const f = FACTIONS[clan.faction];
  const isTop = clan.rank === 1;
  const chestPct = Math.round(clan.chestProgress * 100);
  const chestColor = clan.chestProgress < 0.5 ? "#7CF5E1" : clan.chestProgress < 0.9 ? "#C9D6EE" : GOLD;
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onClick();
      }}
      className={`w-full flex items-center gap-2 sm:gap-3 px-2.5 py-2 rounded-xl cursor-pointer transition-all duration-150 hover:bg-white/5 active:scale-[0.99] ${
        isTop ? "" : ""
      }`}
      style={
        isTop
          ? { border: `1.5px solid ${GOLD}`, background: "rgba(255,209,102,0.07)" }
          : undefined
      }
    >
      <RankBadge rank={clan.rank} />
      <div
        className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
        style={{ background: `${f.colors.dark}cc`, border: `2px solid ${f.colors.primary}` }}
      >
        <img src={FACTION_EMBLEM_ART[clan.faction]} alt={f.name} width={22} height={22} className="object-contain" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-sm font-bold truncate">{clan.name}</span>
          {isTop && (
            <span
              className="shrink-0 px-1.5 py-0.5 rounded-md text-[8px] font-extrabold tracking-widest"
              style={{ background: "linear-gradient(135deg, #FFD166, #FF7A1A)", color: "#0A1B3D" }}
            >
              REIGNING
            </span>
          )}
        </div>
        <div className="text-[10px] text-white/50 truncate">
          [{clan.tag}] · {clan.members}/50 members
          <span className="sm:hidden"> · 🪸×{clan.plotsHeld}</span>
        </div>
      </div>
      <div className="shrink-0 text-center hidden sm:block min-w-[52px]">
        <div className="text-xs font-bold" style={{ color: "#FF9D6B" }}>
          🪸 ×{clan.plotsHeld}
        </div>
        <div className="text-[9px] text-white/45 uppercase tracking-wide">plots</div>
      </div>
      <div className="shrink-0 text-right min-w-[64px]">
        <div className="text-sm font-extrabold leading-none" style={{ color: f.colors.accent }}>
          {formatGold(clan.clanPower)}
        </div>
        <div className="text-[9px] text-white/45 mt-0.5 uppercase tracking-wide">clan power</div>
      </div>
      <div className="shrink-0 w-20 hidden md:block">
        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.1)" }}>
          <div
            className="h-full rounded-full transition-all duration-300"
            style={{ width: `${chestPct}%`, background: `linear-gradient(90deg, #12A7A0, ${chestColor})` }}
          />
        </div>
        <div className="text-[9px] text-white/45 mt-0.5 text-right">chest {chestPct}%</div>
      </div>
    </div>
  );
}

function FactionWarCard({ entry, leading }: { entry: FactionWarEntry; leading: boolean }) {
  const f = FACTIONS[entry.faction];
  return (
    <div
      className="relative rounded-2xl p-3"
      style={{
        background: `linear-gradient(160deg, ${f.colors.dark}dd, ${f.colors.primary}22)`,
        border: `1.5px solid ${leading ? f.colors.accent : `${f.colors.primary}55`}`,
      }}
    >
      {leading && (
        <span
          className="absolute inset-0 rounded-2xl animate-pulse pointer-events-none"
          style={{ boxShadow: `inset 0 0 20px ${f.colors.accent}55` }}
          aria-hidden="true"
        />
      )}
      {leading && (
        <span
          className="absolute top-2 right-2 px-1.5 py-0.5 rounded-md text-[8px] font-extrabold tracking-widest"
          style={{ background: f.colors.accent, color: f.colors.dark }}
        >
          LEADING
        </span>
      )}
      <div className="flex items-center gap-2">
        <img src={FACTION_EMBLEM_ART[entry.faction]} alt={f.name} width={32} height={32} className="object-contain shrink-0" />
        <div className="text-xs font-bold leading-tight min-w-0" style={{ color: f.colors.accent }}>
          {f.name}
        </div>
      </div>
      <div className="mt-2">
        <div className="text-xl font-extrabold leading-none text-white">{formatGold(entry.warScore)}</div>
        <div className="text-[9px] uppercase tracking-wide text-white/45 mt-0.5">war score</div>
      </div>
      <div className="mt-2">
        <div className="flex items-center justify-between text-[10px]">
          <span className="font-bold" style={{ color: f.colors.accent }}>
            {entry.territory}% reef
          </span>
          <span className="text-white/45">{formatGold(entry.activeMembers)} active</span>
        </div>
        <div className="h-1.5 rounded-full mt-1 overflow-hidden" style={{ background: "rgba(255,255,255,0.1)" }}>
          <div
            className="h-full rounded-full"
            style={{
              width: `${(entry.territory / MAX_TERRITORY) * 100}%`,
              background: `linear-gradient(90deg, ${f.colors.primary}, ${f.colors.accent})`,
            }}
          />
        </div>
      </div>
    </div>
  );
}

// ---------- MAIN MODAL ----------

export default function LeaderboardModal({ onClose }: { onClose: () => void }) {
  const player = useGame((s) => s.player);
  const pushToast = useGame((s) => s.pushToast);

  // Board / filter / sort state
  const [board, setBoard] = useState<Board>("shellwardens");
  const [factionFilter, setFactionFilter] = useState<FactionId | "all">("all");
  const [classFilter, setClassFilter] = useState<ClassId | "all">("all");
  const [timeRange, setTimeRange] = useState<TimeRange>("season");
  const [crabSort, setCrabSort] = useState<CrabSort>("bp");
  const [clanSort, setClanSort] = useState<ClanSort>("power");

  // Seeded mock standings (stable across renders)
  const [mockPlayers] = useState<RankedPlayer[]>(() => buildMockPlayers());
  const [mockCrabs] = useState<RankedCrab[]>(() => buildMockCrabs(mockPlayers));
  const [mockClans] = useState<RankedClan[]>(() => buildMockClans());

  const scale = TIME_SCALE[timeRange];

  // Escape to close
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Derived: filtered + sorted lists
  const filteredPlayers = useMemo(
    () => (factionFilter === "all" ? mockPlayers : mockPlayers.filter((p) => p.faction === factionFilter)),
    [mockPlayers, factionFilter]
  );

  const filteredCrabs = useMemo(() => {
    const list = mockCrabs.filter(
      (c) =>
        (factionFilter === "all" || c.faction === factionFilter) &&
        (classFilter === "all" || c.classId === classFilter)
    );
    if (crabSort === "purity") {
      list.sort((a, b) => purityNum(b.purity) - purityNum(a.purity) || b.bp - a.bp);
    } else {
      list.sort((a, b) => b.bp - a.bp);
    }
    return list;
  }, [mockCrabs, factionFilter, classFilter, crabSort]);

  const sortedClans = useMemo(() => {
    const list = [...mockClans];
    if (clanSort === "plots") list.sort((a, b) => b.plotsHeld - a.plotsHeld);
    else if (clanSort === "chest") list.sort((a, b) => b.chestProgress - a.chestProgress);
    else list.sort((a, b) => b.clanPower - a.clanPower);
    return list;
  }, [mockClans, clanSort]);

  // Player-derived info (dominant faction of their crabs, best crab by BP)
  const playerFaction = useMemo<FactionId>(() => {
    if (!player || player.crabs.length === 0) return "coral_court";
    const counts: Partial<Record<FactionId, number>> = {};
    for (const c of player.crabs) counts[c.faction] = (counts[c.faction] ?? 0) + 1;
    const top = Object.entries(counts).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))[0];
    return (top?.[0] as FactionId) ?? "coral_court";
  }, [player]);

  const bestCrab = useMemo(() => {
    if (!player || player.crabs.length === 0) return null;
    return player.crabs.reduce(
      (best, c) => (crabBaseBP(c) > crabBaseBP(best) ? c : best),
      player.crabs[0]
    );
  }, [player]);
  const bestCrabBP = bestCrab ? crabBaseBP(bestCrab) : 0;

  // Pinned "you" row (mock rank #342)
  const youRow: RankedPlayer = {
    rank: MY_RANK,
    name: player?.name ?? "You",
    faction: playerFaction,
    level: player?.shellwardenLevel ?? 1,
    gold: player?.gold ?? 0,
    raidsWon: 12,
    coliseumWins: 7,
    trophies: MY_TROPHIES,
  };
  const showYou = factionFilter === "all" || factionFilter === playerFaction;
  const gapCount = factionFilter === "all" ? MY_RANK - 21 : 57;

  // Toasts
  const viewProfile = (p: RankedPlayer) => {
    pushToast({
      title: `Viewing ${p.name}'s profile...`,
      description: "Public profiles coming.",
      variant: "default",
    });
  };
  const viewClan = (clan: RankedClan) => {
    pushToast({
      title: `Viewing ${clan.name}'s clan page...`,
      description: "Clan halls and war logs coming soon.",
      variant: "default",
    });
  };
  const youToast = () => {
    pushToast({
      title: `You're ranked #${MY_RANK} of ${TOTAL_RANKED.toLocaleString()}!`,
      description: "Win raids and Coliseum bouts to climb the tide.",
      variant: "success",
    });
  };
  const joinClanToast = () => {
    pushToast({
      title: "Clan halls await!",
      description: "Open the Clans screen from the harbor to join one.",
      variant: "default",
    });
  };

  const top20Cutoff = mockPlayers[19]?.trophies ?? 0;

  return (
    <div
      className="fixed inset-0 z-[150] flex items-center justify-center p-2 sm:p-4"
      style={{ background: "rgba(4,16,32,0.78)", backdropFilter: "blur(8px)" }}
      role="dialog"
      aria-modal="true"
      aria-label="Leaderboards"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <GlassPanel
        className="w-full max-w-2xl max-h-[88vh] overflow-y-auto flex flex-col [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-white/15"
        glow="rgba(255,209,102,0.25)"
      >
        {/* ---------- HEADER ---------- */}
        <div
          className="px-4 sm:px-6 pt-4 pb-3 sticky top-0 z-10"
          style={{
            background: "linear-gradient(160deg, rgba(10,27,61,0.96), rgba(18,167,160,0.18))",
            borderBottom: "1px solid rgba(255,209,102,0.22)",
          }}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2
                className="text-lg sm:text-xl font-bold leading-tight flex items-center gap-1.5"
                style={{ fontFamily: FONT_DISPLAY, color: GOLD }}
              >
                <span aria-hidden="true">🏆</span> Leaderboards
              </h2>
              <div className="text-[11px] text-white/65 mt-0.5">
                Season 1 · Week 5 of 8 · Resets in 23d
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close leaderboards"
              className="shrink-0 rounded-lg w-8 h-8 flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 transition-colors"
            >
              ✕
            </button>
          </div>

          {/* Board tabs */}
          <div className="flex items-center gap-1.5 mt-2.5 flex-wrap">
            {BOARD_TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setBoard(t.id)}
                aria-pressed={board === t.id}
                className={`px-2.5 sm:px-3 py-1 rounded-lg text-[11px] font-bold transition-all duration-150 ${
                  board === t.id ? "" : "text-white/60 hover:text-white hover:bg-white/5"
                }`}
                style={
                  board === t.id
                    ? {
                        background: "linear-gradient(135deg, #FFD166, #FF7A1A)",
                        color: "#0A1B3D",
                        boxShadow: "0 2px 10px rgba(255,209,102,0.35)",
                      }
                    : { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }
                }
              >
                <span className="mr-1" aria-hidden="true">
                  {t.icon}
                </span>
                {t.label}
              </button>
            ))}
          </div>

          {/* Time range + ranked count */}
          <div className="flex items-center justify-between gap-2 mt-2 flex-wrap">
            <div className={board === "factions" ? "opacity-40 pointer-events-none transition-opacity" : "transition-opacity"}>
              <SegPills options={TIME_OPTIONS} value={timeRange} onChange={setTimeRange} />
            </div>
            <span className="text-[10px] text-white/40 shrink-0">{RANKED_COUNT_LABEL[board]}</span>
          </div>
        </div>

        {/* ---------- BOARD BODY ---------- */}
        <div className="px-4 sm:px-6 py-3 sm:py-4">
          {board === "shellwardens" && (
            <section aria-label="Shellwarden rankings">
              <SectionTitle
                icon="🏆"
                title="Shellwarden Rankings"
                action={<span className="text-[10px] text-white/45">By trophies · top 20</span>}
              />
              <div className="grid grid-cols-3 gap-2 mb-3">
                <StatChip label="Ranked" value={TOTAL_RANKED.toLocaleString()} color="#7CF5E1" icon={<span>🧭</span>} />
                <StatChip
                  label="Top-20 bar"
                  value={Math.round(top20Cutoff * scale).toLocaleString()}
                  color={GOLD}
                  icon={<span>🏆</span>}
                />
                <StatChip label="Your trophies" value={MY_TROPHIES.toLocaleString()} color="#FF6F91" icon={<span>⭐</span>} />
              </div>
              <FactionPills value={factionFilter} onChange={setFactionFilter} />
              {filteredPlayers.length >= 3 && <Podium players={filteredPlayers.slice(0, 5)} scale={scale} />}
              <div className="flex flex-col gap-1 mt-2">
                {filteredPlayers.slice(0, 20).map((p) => (
                  <PlayerRow key={p.rank} p={p} scale={scale} onClick={() => viewProfile(p)} />
                ))}
                {showYou && (
                  <>
                    <div className="flex items-center gap-2 py-1 px-1">
                      <div className="flex-1 h-px" style={{ background: "linear-gradient(90deg, transparent, rgba(255,209,102,0.25))" }} />
                      <span className="text-[10px] text-white/40 shrink-0">
                        {gapCount} between here and your rank
                      </span>
                      <div className="flex-1 h-px" style={{ background: "linear-gradient(90deg, rgba(255,209,102,0.25), transparent)" }} />
                    </div>
                    <PlayerRow p={youRow} scale={1} isYou onClick={youToast} />
                  </>
                )}
              </div>
            </section>
          )}

          {board === "crabs" && (
            <section aria-label="Top crabs leaderboard">
              <SectionTitle
                icon="🦀"
                title="Top Crabs — Global BP"
                action={<SegPills options={CRAB_SORT_OPTIONS} value={crabSort} onChange={setCrabSort} />}
              />
              <p className="text-[10px] text-white/45 mb-2">
                ✨ Legendary-part crabs are marked with a sparkle. Purity counts pure dominant genes (18/18 max).
              </p>
              <FactionPills value={factionFilter} onChange={setFactionFilter} />
              <div className="mt-2">
                <ClassPills value={classFilter} onChange={setClassFilter} />
              </div>
              <div className="flex flex-col gap-1 mt-2">
                {filteredCrabs.length === 0 ? (
                  <EmptyState
                    compact
                    message="No crabs match those filters."
                    hint="Try All Factions and All Classes."
                  />
                ) : (
                  filteredCrabs.map((c) => <CrabRow key={`${c.rank}-${c.name}`} c={c} />)
                )}
              </div>
            </section>
          )}

          {board === "clans" && (
            <section aria-label="Clan power rankings">
              <SectionTitle
                icon="🛡️"
                title="Clan Power Rankings"
                action={<SegPills options={CLAN_SORT_OPTIONS} value={clanSort} onChange={setClanSort} />}
              />
              <p className="text-[10px] text-white/45 mb-2">
                Clan Power = combined member BP + Reef Plot control. Clan chests fill from weekly contributions.
              </p>
              <div className="flex flex-col gap-1">
                {sortedClans.map((clan) => (
                  <ClanRow key={clan.rank} clan={clan} onClick={() => viewClan(clan)} />
                ))}
              </div>
            </section>
          )}

          {board === "factions" && (
            <section aria-label="Faction war territory map">
              <SectionTitle
                icon="⚔️"
                title="Faction War — Reef Territories"
                action={
                  <span className="text-[10px] font-bold" style={{ color: GOLD }}>
                    Prize: +10% dive rewards
                  </span>
                }
              />
              <p className="text-[11px] text-white/60 leading-relaxed mb-3">
                Faction War: cumulative member performance this season. Winning faction gets{" "}
                <b style={{ color: GOLD }}>+10% dive rewards next week</b> for ALL its members.
              </p>
              <div className="grid grid-cols-3 gap-2 mb-3">
                <StatChip label="Factions at war" value="6" color="#FF6F91" icon={<span>⚔️</span>} />
                <StatChip label="Active wardens" value={formatGold(TOTAL_WARDENS)} color="#7CF5E1" icon={<span>🌊</span>} />
                <StatChip label="Season ends" value="23d" color={GOLD} icon={<span>⏳</span>} />
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {FACTION_WAR.map((entry, i) => (
                  <FactionWarCard key={entry.faction} entry={entry} leading={i === 0} />
                ))}
              </div>
              {/* Territory standings bar */}
              <div className="mt-3">
                <div className="text-[10px] uppercase tracking-wide text-white/50 mb-1">Reef territory control</div>
                <div
                  className="flex h-3 rounded-full overflow-hidden"
                  style={{ border: "1px solid rgba(255,255,255,0.12)" }}
                  role="img"
                  aria-label="Faction territory shares"
                >
                  {FACTION_WAR.map((e) => (
                    <div
                      key={e.faction}
                      className="h-full"
                      style={{ width: `${e.territory}%`, background: FACTIONS[e.faction].colors.primary }}
                      title={`${FACTIONS[e.faction].name}: ${e.territory}%`}
                    />
                  ))}
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5">
                  {FACTION_WAR.map((e) => (
                    <span key={e.faction} className="inline-flex items-center gap-1 text-[10px] text-white/60">
                      <span
                        className="w-2 h-2 rounded-sm shrink-0"
                        style={{ background: FACTIONS[e.faction].colors.primary }}
                      />
                      {FACTIONS[e.faction].shortName}{" "}
                      <b className="text-white/85">{e.territory}%</b>
                    </span>
                  ))}
                </div>
              </div>
            </section>
          )}
        </div>

        {/* ---------- YOUR RANKING PANEL ---------- */}
        <div className="px-4 sm:px-6 pb-2">
          <GlassPanel className="p-3" glow="rgba(255,209,102,0.15)">
            <div className="flex items-center justify-between gap-2 mb-2">
              <div
                className="text-xs font-bold flex items-center gap-1.5"
                style={{ fontFamily: FONT_DISPLAY, color: GOLD }}
              >
                <span aria-hidden="true">📊</span> Your Standings
              </div>
              <GlowButton size="sm" variant="gold" onClick={joinClanToast}>
                Join a Clan
              </GlowButton>
            </div>
            <div className="grid gap-1 text-[11px] leading-relaxed text-white/75">
              <div>
                <span className="text-white/50">Your rank:</span>{" "}
                <b style={{ color: GOLD }}>#{MY_RANK}</b> Shellwardens · Top <b>{TOP_PCT}%</b> ·{" "}
                <b style={{ color: GOLD }}>{MY_TROPHIES.toLocaleString()}</b> trophies
              </div>
              <div>
                <span className="text-white/50">Your best crab:</span>{" "}
                {bestCrab ? (
                  <>
                    <b>{bestCrab.name}</b> ({bestCrabBP.toLocaleString()} BP) — rank{" "}
                    <b style={{ color: GOLD }}>#{MY_BEST_CRAB_RANK}</b> globally
                  </>
                ) : (
                  <b>None yet — hatch and raise a champion!</b>
                )}
              </div>
              <div>
                <span className="text-white/50">Your clan:</span> <b>None — join one!</b> — rank{" "}
                <b className="text-white/40">#—</b>
              </div>
            </div>
          </GlassPanel>
        </div>

        {/* ---------- FOOTER ---------- */}
        <div
          className="px-4 sm:px-6 py-3 mt-auto"
          style={{
            borderTop: "1px solid rgba(255,209,102,0.18)",
            background: "rgba(10,27,61,0.6)",
          }}
        >
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <p className="text-[10px] text-white/50 leading-snug max-w-md">
              Leaderboards reset weekly (Wednesdays 20:00 Jakarta) except All-time. Fair-play enforced: bots and
              multi-accounters removed.
            </p>
            <GlowButton variant="gold" onClick={onClose}>
              Close
            </GlowButton>
          </div>
        </div>
      </GlassPanel>
    </div>
  );
}
