// Crabtopia - Profile Modal (public profile, trophy shelf, favorite-crab showcase, stats)
// Self-contained: trophies / frames / fun-stats / activity feed are mock-local.
// Live player data comes from gameStore; showcase & bio persist to local state only.
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useGame } from "../store/gameStore";
import { FACTIONS, FACTION_LIST } from "../content/factions";
import { CLASSES } from "../content/classes";
import { Crab, FactionId, ClassId, Rarity } from "../types";
import { crabBaseBP } from "../engine/bp";
import CrabRenderer from "./CrabRenderer";
import { ClassArtImage } from "./CrabArtImage";
import {
  GlassPanel,
  GlowButton,
  GradientCard,
  StatChip,
  SectionTitle,
  GoldIcon,
  ClassIcon,
  formatGold,
  formatBP,
  EmptyState,
  FACTION_EMBLEM_ART,
  rarityColor,
  rarityGlow,
} from "./ui";

// ---------- LOCAL TYPES ----------------------------------------------------

type View = "profile" | "trophies" | "showcase" | "stats";

interface ProfileFrame {
  id: string;
  name: string;
  source: string;
  ring: string; // CSS background for the avatar ring
  glow: string; // ring outer glow color
  badge: string; // tiny emoji badge shown on the avatar
}

interface TrophyDef {
  id: string;
  name: string;
  icon: string;
  description: string;
  condition: string; // earn condition shown in tooltip
  rarity: Rarity;
  earned: boolean;
}

interface ActivityItem {
  icon: string;
  text: string;
  ago: string;
}

interface BarSegment {
  id: string;
  label: string;
  icon?: string;
  color: string;
  count: number;
  pct: number;
}

// ---------- MOCK DATA ------------------------------------------------------

// Matches gameStore.addXp curve: level N needs N * 500 XP.
const XP_PER_LEVEL = 500;
const JOINED_LABEL = "Nov 2025";
const DAYS_ACTIVE = 12;
const BIO_CHAR_LIMIT = 200;
const DEFAULT_BIO =
  "Shellwarden of the tide pools. I collect shiny shells and shinier crabs.";

const FRAMES: ProfileFrame[] = [
  {
    id: "default",
    name: "Default",
    source: "Starter",
    ring: "linear-gradient(135deg, #7CF5E1, #0A4A66)",
    glow: "rgba(124,245,225,0.35)",
    badge: "🫧",
  },
  {
    id: "coral_bloom",
    name: "Coral Bloom",
    source: "Tidepass Tier 5",
    ring: "linear-gradient(135deg, #FF6F91, #FFD166)",
    glow: "rgba(255,111,145,0.55)",
    badge: "🪸",
  },
  {
    id: "gilded_crown",
    name: "Gilded Crown",
    source: "Boutique",
    ring: "linear-gradient(135deg, #FFD166, #FF7A1A)",
    glow: "rgba(255,209,102,0.6)",
    badge: "👑",
  },
  {
    id: "leviathan_eye",
    name: "Leviathan Eye",
    source: "Leviathan raid drop",
    ring: "linear-gradient(135deg, #5C7CFF, #7CF5E1)",
    glow: "rgba(92,124,255,0.6)",
    badge: "👁️",
  },
  {
    id: "bloomtide_crown",
    name: "Bloomtide Crown",
    source: "Tidepass Supporter Tier 8",
    ring: "linear-gradient(135deg, #FF6F91, #7A5CFF)",
    glow: "rgba(255,111,145,0.5)",
    badge: "🌸",
  },
  {
    id: "tideswell_crown",
    name: "Tideswell Crown",
    source: "Tidepass Tier 10 (Legendary)",
    ring: "linear-gradient(135deg, #7CF5E1, #FFD166, #FF6F91)",
    glow: "rgba(255,209,102,0.7)",
    badge: "🏆",
  },
];

const TROPHIES: TrophyDef[] = [
  {
    id: "first_dive",
    name: "First Dive",
    icon: "🌊",
    description: "Deploy your first team on a dig site.",
    condition: "Deploy your first dive.",
    rarity: "common",
    earned: true,
  },
  {
    id: "first_raid_win",
    name: "First Raid Win",
    icon: "⚔️",
    description: "Steal a site's loot with a victorious raid.",
    condition: "Win 1 raid.",
    rarity: "rare",
    earned: true,
  },
  {
    id: "first_breed",
    name: "First Breed",
    icon: "🥚",
    description: "Pair two crabs at the nursery.",
    condition: "Breed your first pair.",
    rarity: "common",
    earned: true,
  },
  {
    id: "coliseum_rookie",
    name: "Coliseum Rookie",
    icon: "🏟️",
    description: "Fight your first Coliseum bracket.",
    condition: "Enter 1 Coliseum battle.",
    rarity: "common",
    earned: true,
  },
  {
    id: "level_10",
    name: "Level 10",
    icon: "🎖️",
    description: "Reach Shellwarden level 10.",
    condition: "Reach Shellwarden Lv 10.",
    rarity: "rare",
    earned: true,
  },
  {
    id: "level_25",
    name: "Level 25",
    icon: "🏅",
    description: "Reach Shellwarden level 25.",
    condition: "Reach Shellwarden Lv 25.",
    rarity: "epic",
    earned: false,
  },
  {
    id: "breed_master",
    name: "Breed Master",
    icon: "🧬",
    description: "Breed 50 crabs at the nursery.",
    condition: "Breed 50 crabs.",
    rarity: "epic",
    earned: false,
  },
  {
    id: "leviathan_slayer",
    name: "Leviathan Slayer",
    icon: "🐉",
    description: "Slay the seasonal Leviathan.",
    condition: "Win a Leviathan raid.",
    rarity: "legendary",
    earned: false,
  },
  {
    id: "tournament_champion",
    name: "Tournament Champion",
    icon: "👑",
    description: "Win a weekly Coliseum tournament.",
    condition: "Win 1 tournament.",
    rarity: "legendary",
    earned: false,
  },
  {
    id: "clan_founder",
    name: "Clan Founder",
    icon: "⚓",
    description: "Found your own clan.",
    condition: "Found a clan.",
    rarity: "rare",
    earned: false,
  },
  {
    id: "wealthy_warden",
    name: "Wealthy Warden",
    icon: "🪙",
    description: "Hold 100,000 GOLD at once.",
    condition: "Hold 100K GOLD.",
    rarity: "epic",
    earned: false,
  },
  {
    id: "codex_complete",
    name: "Codex Complete",
    icon: "📖",
    description: "Discover every breed in the Codex.",
    condition: "Discover all breeds.",
    rarity: "legendary",
    earned: false,
  },
];

const MOCK_STATS = {
  totalDives: 34,
  totalRaids: 14,
  winRatePct: 61,
  eggsHatched: 9,
  crabsBred: 11,
  goldLifetime: 12400, // 12.4K
  bestDive: 480,
};

const RECENT_ACTIVITY: ActivityItem[] = [
  { icon: "🪙", text: "Claimed dive +300 GOLD", ago: "2h ago" },
  { icon: "⚔️", text: "Won raid vs Tidecrest", ago: "5h ago" },
  { icon: "🥚", text: "Hatched Moonpool egg", ago: "1d ago" },
  { icon: "🧬", text: "Bred a Pincher pair at the Nursery", ago: "1d ago" },
  { icon: "🏟️", text: "Coliseum bracket win (3-0)", ago: "2d ago" },
];

// 8 distinct data-viz colors for the class usage bar.
const CLASS_BAR_COLORS: Record<ClassId, string> = {
  bulwark: "#7CF5E1",
  reaver: "#FF7A1A",
  skitter: "#FFD166",
  tidecaller: "#5C7CFF",
  shellmender: "#4FB477",
  pincher: "#FF6F91",
  warden: "#C9D6EE",
  gildclaw: "#A855F7",
};

// ---------- HELPERS --------------------------------------------------------

function dominantFactionOf(crabs: Crab[]): FactionId {
  if (crabs.length === 0) return "coral_court";
  const counts: Record<string, number> = {};
  for (const c of crabs) counts[c.faction] = (counts[c.faction] ?? 0) + 1;
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return top[0] as FactionId;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// ---------- SMALL SHARED PIECES -------------------------------------------

function TabButton({
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
      type="button"
      onClick={onClick}
      className="px-3 py-1.5 text-xs font-bold rounded-lg transition-all whitespace-nowrap"
      style={{
        background: active ? "linear-gradient(135deg, #12A7A0, #0A4A66)" : "transparent",
        color: active ? "#EAF6FF" : "rgba(234,246,255,0.6)",
        boxShadow: active ? "0 4px 12px rgba(18,167,160,0.35)" : "none",
      }}
      aria-pressed={active}
    >
      {children}
    </button>
  );
}

function MiniBar({
  pct,
  color,
  height = 8,
}: {
  pct: number;
  color: string;
  height?: number;
}) {
  const clamped = Math.max(0, Math.min(1, pct));
  return (
    <div
      className="w-full rounded-full overflow-hidden"
      style={{ background: "rgba(255,255,255,0.08)", height }}
      role="progressbar"
      aria-valuenow={Math.round(clamped * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="h-full rounded-full transition-all duration-300"
        style={{
          width: `${clamped * 100}%`,
          background: `linear-gradient(90deg, ${color}, ${color}cc)`,
          boxShadow: `0 0 8px ${color}66`,
        }}
      />
    </div>
  );
}

// Avatar with the equipped frame's ring styling.
function ProfileAvatar({
  initial,
  frame,
  size = 72,
}: {
  initial: string;
  frame: ProfileFrame;
  size?: number;
}) {
  return (
    <div className="relative shrink-0">
      <div
        className="rounded-full flex items-center justify-center p-[3px]"
        style={{
          width: size + 8,
          height: size + 8,
          background: frame.ring,
          boxShadow: `0 0 18px ${frame.glow}`,
        }}
      >
        <div
          className="rounded-full flex items-center justify-center font-display font-bold select-none"
          style={{
            width: size,
            height: size,
            background: "linear-gradient(160deg, #0E2A4A, #06122B)",
            color: "#EAF6FF",
            fontSize: size * 0.42,
            border: "2px solid rgba(6,18,43,0.9)",
          }}
          aria-hidden="true"
        >
          {initial}
        </div>
      </div>
      <span
        className="absolute -bottom-1 -right-1 rounded-full flex items-center justify-center text-[12px]"
        style={{
          width: 22,
          height: 22,
          background: frame.ring,
          border: "1.5px solid rgba(6,18,43,0.9)",
          boxShadow: `0 0 8px ${frame.glow}`,
        }}
        title={`Frame: ${frame.name}`}
      >
        {frame.badge}
      </span>
    </div>
  );
}

// Frame picker (6 mock frames from Tidepass / Boutique).
function FramePicker({
  frames,
  selectedName,
  onSelect,
  onDone,
}: {
  frames: ProfileFrame[];
  selectedName: string;
  onSelect: (f: ProfileFrame) => void;
  onDone: () => void;
}) {
  return (
    <GlassPanel className="p-3" glow="rgba(255,209,102,0.25)">
      <SectionTitle
        icon={<span aria-hidden>🖼️</span>}
        title="Profile Frames"
        action={
          <GlowButton variant="ghost" size="sm" onClick={onDone}>
            Done
          </GlowButton>
        }
      />
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {frames.map((f) => {
          const equipped = f.name === selectedName;
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => onSelect(f)}
              className="rounded-xl p-2 flex flex-col items-center gap-1.5 transition-all hover:-translate-y-0.5 focus:outline-none focus:ring-1"
              style={{
                background: equipped ? "rgba(255,209,102,0.1)" : "rgba(10,27,61,0.45)",
                border: `1px solid ${equipped ? "#FFD16688" : "rgba(124,245,225,0.15)"}`,
                boxShadow: equipped ? "0 0 12px rgba(255,209,102,0.25)" : "none",
              }}
              aria-pressed={equipped}
            >
              <span
                className="rounded-full flex items-center justify-center p-[2px]"
                style={{
                  width: 44,
                  height: 44,
                  background: f.ring,
                  boxShadow: `0 0 10px ${f.glow}`,
                }}
              >
                <span
                  className="rounded-full flex items-center justify-center text-xs font-bold"
                  style={{
                    width: 36,
                    height: 36,
                    background: "linear-gradient(160deg, #0E2A4A, #06122B)",
                    color: "#EAF6FF",
                    border: "1.5px solid rgba(6,18,43,0.9)",
                  }}
                  aria-hidden="true"
                >
                  {f.badge}
                </span>
              </span>
              <span className="text-[10px] font-bold text-center leading-tight text-white/85">
                {f.name}
              </span>
              <span className="text-[8px] opacity-55 text-center leading-tight">{f.source}</span>
              {equipped && (
                <span className="text-[8px] font-bold uppercase tracking-wide" style={{ color: "#FFD166" }}>
                  Equipped
                </span>
              )}
            </button>
          );
        })}
      </div>
    </GlassPanel>
  );
}

// ---------- PROFILE VIEW ---------------------------------------------------

function ProfileView({
  playerName,
  level,
  xp,
  xpNeeded,
  xpPct,
  crabsCount,
  teamsCount,
  goldAmount,
  raidsWon,
  bannerColor,
  onBannerColor,
  equippedFrame,
  onFrameChange,
  pushToast,
}: {
  playerName: string;
  level: number;
  xp: number;
  xpNeeded: number;
  xpPct: number;
  crabsCount: number;
  teamsCount: number;
  goldAmount: number;
  raidsWon: number;
  bannerColor: FactionId;
  onBannerColor: (f: FactionId) => void;
  equippedFrame: ProfileFrame;
  onFrameChange: (name: string) => void;
  pushToast: (t: { title: string; description?: string; variant: "default" | "success" | "error" | "warning" }) => void;
}) {
  const [bio, setBio] = useState<string>(DEFAULT_BIO);
  const [bioDraft, setBioDraft] = useState<string>(DEFAULT_BIO);
  const [editingBio, setEditingBio] = useState(false);
  const [showFramePicker, setShowFramePicker] = useState(false);

  const f = FACTIONS[bannerColor];
  const initial = (playerName.trim()[0] ?? "C").toUpperCase();

  const shareProfile = () => {
    pushToast({
      title: `Profile link copied: crabtopia.example/u/${playerName}`,
      variant: "success",
    });
  };

  const saveBio = () => {
    setBio(bioDraft.slice(0, BIO_CHAR_LIMIT).trim());
    setEditingBio(false);
  };

  return (
    <div className="space-y-4">
      {/* ---- Header card with faction banner tint ---- */}
      <GlassPanel
        className="p-4 sm:p-5"
        glow={`${f.colors.primary}33`}
        style={{
          background: `linear-gradient(160deg, ${f.colors.dark}77 0%, ${f.colors.primary}1a 100%)`,
          border: `1px solid ${f.colors.primary}44`,
        }}
      >
        <div className="flex flex-col sm:flex-row gap-4 sm:items-center">
          <ProfileAvatar initial={initial} frame={equippedFrame} />

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3
                className="text-xl font-bold truncate"
                style={{ color: "#FFD166", fontFamily: "Fredoka, system-ui, sans-serif" }}
              >
                {playerName}
              </h3>
              <span
                className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide shrink-0"
                style={{
                  background: "rgba(124,245,225,0.12)",
                  color: "#7CF5E1",
                  border: "1px solid rgba(124,245,225,0.35)",
                }}
              >
                🐚 Shellwarden
              </span>
            </div>

            {/* Level + XP bar */}
            <div className="mt-2 flex items-center gap-2">
              <span
                className="px-2 py-0.5 rounded-lg text-[11px] font-bold shrink-0"
                style={{
                  background: "linear-gradient(135deg, #12A7A0, #0A4A66)",
                  color: "#EAF6FF",
                }}
              >
                Lv {level}
              </span>
              <div className="flex-1 min-w-0">
                <MiniBar pct={xpPct} color="#7CF5E1" />
              </div>
              <span className="text-[10px] opacity-70 shrink-0 whitespace-nowrap">
                Lv {level} · {xp.toLocaleString()} XP
              </span>
            </div>

            {/* Joined / active / frame */}
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] opacity-70">
              <span>📅 Joined {JOINED_LABEL}</span>
              <span>⏱️ {DAYS_ACTIVE} days active</span>
              <span>
                🖼️ Frame: <span style={{ color: "#FFD166" }}>{equippedFrame.name}</span>
              </span>
              <span className="inline-flex items-center gap-1">
                <img
                  src={FACTION_EMBLEM_ART[bannerColor]}
                  alt={f.name}
                  width={12}
                  height={12}
                  className="object-contain inline-block"
                />
                {f.shortName} banner
              </span>
            </div>

            {/* Banner tint picker */}
            <div className="mt-2 flex items-center gap-1.5 flex-wrap">
              <span className="text-[9px] uppercase tracking-wide opacity-50" aria-hidden>
                Banner tint
              </span>
              {FACTION_LIST.map((fa) => (
                <button
                  key={fa.id}
                  type="button"
                  onClick={() => onBannerColor(fa.id)}
                  className="rounded-full transition-transform hover:scale-110 focus:outline-none focus:ring-1"
                  style={{
                    width: 14,
                    height: 14,
                    background: fa.colors.primary,
                    border:
                      bannerColor === fa.id
                        ? "2px solid #EAF6FF"
                        : "1px solid rgba(255,255,255,0.25)",
                    boxShadow: bannerColor === fa.id ? `0 0 8px ${fa.colors.accent}` : "none",
                  }}
                  title={`Banner: ${fa.name}`}
                  aria-label={`Banner tint: ${fa.name}`}
                  aria-pressed={bannerColor === fa.id}
                />
              ))}
            </div>
          </div>
        </div>
      </GlassPanel>

      {/* ---- Quick stats row ---- */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <StatChip
          label="Crabs Owned"
          value={crabsCount}
          color="#7CF5E1"
          icon={<span aria-hidden>🦀</span>}
        />
        <StatChip
          label="Teams"
          value={teamsCount}
          color="#4FB477"
          icon={<span aria-hidden>🛡️</span>}
        />
        <StatChip
          label="Gold"
          value={formatGold(goldAmount)}
          color="#FFD166"
          icon={<GoldIcon size={14} />}
        />
        <StatChip
          label="Raids Won"
          value={raidsWon}
          color="#FF6F91"
          icon={<span aria-hidden>⚔️</span>}
        />
      </div>

      {/* ---- Bio ---- */}
      <GlassPanel className="p-3">
        <SectionTitle
          icon={<span aria-hidden>📝</span>}
          title="Bio"
          action={
            <span className="text-[9px] opacity-50">
              {editingBio ? `${bioDraft.length}/${BIO_CHAR_LIMIT}` : `${bio.length}/${BIO_CHAR_LIMIT}`}
            </span>
          }
        />
        {editingBio ? (
          <div className="space-y-2">
            <textarea
              value={bioDraft}
              onChange={(e) => setBioDraft(e.target.value.slice(0, BIO_CHAR_LIMIT))}
              maxLength={BIO_CHAR_LIMIT}
              rows={3}
              className="w-full rounded-xl px-3 py-2 text-xs text-white/90 outline-none resize-none"
              style={{
                background: "rgba(10,27,61,0.6)",
                border: "1px solid rgba(124,245,225,0.3)",
              }}
              placeholder="Tell the tide pools who you are..."
              aria-label="Edit bio"
              autoFocus
            />
            <div className="flex gap-2">
              <GlowButton size="sm" onClick={saveBio}>
                Save Bio
              </GlowButton>
              <GlowButton
                size="sm"
                variant="ghost"
                onClick={() => {
                  setBioDraft(bio);
                  setEditingBio(false);
                }}
              >
                Cancel
              </GlowButton>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setEditingBio(true)}
            className="w-full text-left rounded-xl px-3 py-2 transition-colors hover:bg-white/5 focus:outline-none focus:ring-1"
            style={{
              background: "rgba(10,27,61,0.45)",
              border: "1px dashed rgba(124,245,225,0.25)",
            }}
            aria-label="Tap to edit bio"
          >
            <span className="text-xs text-white/85 leading-relaxed block min-h-[18px]">
              {bio || "—"}
            </span>
            <span className="text-[9px] opacity-45 italic block mt-1">Tap to edit</span>
          </button>
        )}
      </GlassPanel>

      {/* ---- Frame picker ---- */}
      {showFramePicker && (
        <FramePicker
          frames={FRAMES}
          selectedName={equippedFrame.name}
          onSelect={(frame) => onFrameChange(frame.name)}
          onDone={() => setShowFramePicker(false)}
        />
      )}

      {/* ---- Actions ---- */}
      <div className="flex flex-wrap gap-2">
        <GlowButton
          variant={showFramePicker ? "ghost" : "teal"}
          size="sm"
          onClick={() => setShowFramePicker((v) => !v)}
        >
          🖼️ {showFramePicker ? "Hide Frames" : "Change Frame"}
        </GlowButton>
        <GlowButton variant="gold" size="sm" onClick={shareProfile}>
          🔗 Share Profile
        </GlowButton>
      </div>
      <p className="sr-only">Experience needed for next level: {xpNeeded} XP.</p>
    </div>
  );
}

// ---------- TROPHIES VIEW --------------------------------------------------

function TrophyItem({
  trophy,
  isHovered,
  isTapped,
  onHover,
  onTap,
}: {
  trophy: TrophyDef;
  isHovered: boolean;
  isTapped: boolean;
  onHover: (v: boolean) => void;
  onTap: () => void;
}) {
  const earned = trophy.earned;
  const color = earned ? rarityColor(trophy.rarity) : "#71809B";
  const showTip = isHovered || isTapped;

  return (
    <button
      type="button"
      className="relative flex flex-col items-center gap-1 px-0.5 py-1 rounded-lg transition-transform hover:-translate-y-0.5 focus:outline-none focus:ring-1 focus:ring-white/30"
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      onClick={onTap}
      aria-label={`${trophy.name} trophy. ${trophy.condition} ${earned ? "Earned." : "Locked."}`}
      aria-expanded={showTip}
    >
      {/* Tooltip (hover on desktop, tap on mobile) */}
      {showTip && (
        <div
          className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-36 sm:w-40 z-30 rounded-lg px-2.5 py-2 text-left pointer-events-none"
          style={{
            background: "rgba(6,18,43,0.97)",
            border: `1px solid ${color}66`,
            boxShadow: `0 6px 18px rgba(0,0,0,0.5)${earned ? `, 0 0 10px ${rarityGlow(trophy.rarity)}` : ""}`,
          }}
          role="tooltip"
        >
          <div className="text-[10px] font-bold leading-tight" style={{ color }}>
            {trophy.icon} {trophy.name}
          </div>
          <div className="text-[9px] text-white/70 leading-snug mt-0.5">{trophy.condition}</div>
          <div
            className="text-[8px] uppercase tracking-wide font-bold mt-1"
            style={{ color: earned ? "#4FB477" : "#9CA3AF" }}
          >
            {earned ? "✔ Earned" : "🔒 Locked"}
          </div>
        </div>
      )}

      {/* Trophy pedestal */}
      <div
        className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center text-2xl select-none"
        style={{
          background: earned ? `${color}1c` : "rgba(255,255,255,0.05)",
          border: `1px solid ${earned ? `${color}66` : "rgba(255,255,255,0.1)"}`,
          boxShadow: earned
            ? `0 0 14px ${rarityGlow(trophy.rarity)}, inset 0 0 8px ${color}14`
            : "none",
          filter: earned ? undefined : "grayscale(0.8) opacity(0.55)",
        }}
        aria-hidden="true"
      >
        {earned ? trophy.icon : "🔒"}
      </div>
      <div
        className="text-[8px] sm:text-[9px] font-bold leading-tight text-center w-full line-clamp-2"
        style={{ color: earned ? color : "rgba(234,246,255,0.4)" }}
      >
        {trophy.name}
      </div>
    </button>
  );
}

// One wooden shelf (CSS-built plank + lip) with trophies standing on it.
function Shelf({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative">
      <div className="grid grid-cols-4 gap-1 sm:gap-2 items-end px-1 sm:px-3">{children}</div>
      <div
        className="h-2.5 rounded-full"
        style={{
          background: "linear-gradient(180deg, #A9744A 0%, #7A4E2A 55%, #5C3A1E 100%)",
          boxShadow: "0 6px 14px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.25)",
        }}
        aria-hidden="true"
      />
      <div
        className="h-1.5 mx-4 rounded-b-md"
        style={{ background: "linear-gradient(180deg, #4A2E17, #33200E)" }}
        aria-hidden="true"
      />
    </div>
  );
}

function TrophiesView() {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [tappedId, setTappedId] = useState<string | null>(null);

  const earnedCount = TROPHIES.filter((t) => t.earned).length;
  const pct = Math.round((earnedCount / TROPHIES.length) * 100);
  const shelves = chunk(TROPHIES, 4);

  return (
    <div className="space-y-4">
      {/* Progress header */}
      <GlassPanel className="p-3" glow="rgba(255,209,102,0.25)">
        <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
          <SectionTitle
            icon={<span aria-hidden>🏆</span>}
            title="Trophy Shelf"
            action={
              <span className="text-[10px] opacity-70">
                <span style={{ color: "#FFD166" }}>{earnedCount}</span> of{" "}
                {TROPHIES.length} earned
              </span>
            }
          />
        </div>
        <div className="flex items-center gap-2">
          <div className="flex-1">
            <MiniBar pct={earnedCount / TROPHIES.length} color="#FFD166" height={10} />
          </div>
          <span className="text-[11px] font-bold shrink-0" style={{ color: "#FFD166" }}>
            {pct}%
          </span>
        </div>
        <div className="text-[10px] opacity-60 mt-1.5">
          {earnedCount} of {TROPHIES.length} trophies earned · {pct}% — hover or tap a trophy to
          see how to earn it.
        </div>
      </GlassPanel>

      {/* The shelf wall */}
      <div
        className="rounded-2xl p-3 sm:p-4 space-y-5"
        style={{
          background:
            "linear-gradient(180deg, rgba(10,27,61,0.55), rgba(6,18,43,0.75))",
          border: "1px solid rgba(124,245,225,0.18)",
          boxShadow: "inset 0 0 30px rgba(0,0,0,0.35)",
        }}
      >
        {shelves.map((shelfTrophies, i) => (
          <Shelf key={i}>
            {shelfTrophies.map((t) => (
              <TrophyItem
                key={t.id}
                trophy={t}
                isHovered={hoveredId === t.id}
                isTapped={tappedId === t.id}
                onHover={(v) => setHoveredId(v ? t.id : null)}
                onTap={() => setTappedId((prev) => (prev === t.id ? null : t.id))}
              />
            ))}
          </Shelf>
        ))}
      </div>
    </div>
  );
}

// ---------- SHOWCASE VIEW --------------------------------------------------

function ShowcaseSlot({
  crab,
  onClear,
  onAdd,
}: {
  crab?: Crab;
  onClear: () => void;
  onAdd?: () => void;
}) {
  if (!crab) {
    return (
      <button
        type="button"
        onClick={onAdd}
        className="rounded-2xl min-h-[150px] flex flex-col items-center justify-center gap-1 transition-all hover:-translate-y-0.5 focus:outline-none focus:ring-1 focus:ring-white/30"
        style={{
          background: "rgba(10,27,61,0.35)",
          border: "2px dashed rgba(124,245,225,0.3)",
        }}
        aria-label="Empty showcase slot"
      >
        <span className="text-2xl opacity-50" aria-hidden>
          ＋
        </span>
        <span className="text-[10px] font-bold opacity-50">Add</span>
      </button>
    );
  }

  const f = FACTIONS[crab.faction];
  return (
    <GradientCard faction={crab.faction} className="p-3 relative">
      <button
        type="button"
        onClick={onClear}
        className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold transition-colors hover:bg-white/15 focus:outline-none focus:ring-1 focus:ring-white/40"
        style={{
          background: "rgba(6,18,43,0.75)",
          border: "1px solid rgba(255,255,255,0.25)",
          color: "#EAF6FF",
        }}
        title={`Remove ${crab.name} from showcase`}
        aria-label={`Clear ${crab.name} from showcase`}
      >
        ✕
      </button>

      <div
        className="mx-auto w-fit"
        style={{ filter: `drop-shadow(0 4px 10px ${f.colors.primary}88)` }}
      >
        <CrabRenderer crab={crab} size={112} />
      </div>
      <div
        className="text-xs font-bold text-center truncate mt-1"
        style={{ color: f.colors.light, fontFamily: "Fredoka, system-ui, sans-serif" }}
      >
        {crab.name}
      </div>
      <div className="flex items-center justify-center gap-1.5 mt-1 flex-wrap">
        <img
          src={FACTION_EMBLEM_ART[crab.faction]}
          alt={f.name}
          width={14}
          height={14}
          className="object-contain inline-block"
        />
        <span className="text-[9px] font-bold" style={{ color: f.colors.accent }}>
          {f.shortName}
        </span>
        <ClassIcon classId={crab.classId} size={16} />
        <span className="text-[9px] opacity-70">{CLASSES[crab.classId].name}</span>
      </div>
      <div
        className="text-[10px] font-bold text-center mt-1.5 rounded-lg py-0.5"
        style={{
          background: "rgba(10,27,61,0.6)",
          border: "1px solid rgba(124,245,225,0.2)",
          color: "#7CF5E1",
        }}
      >
        ⚡ BP {formatBP(crabBaseBP(crab))}
      </div>
    </GradientCard>
  );
}

function ShowcaseView({
  crabs,
  favoriteCrabIds,
  setFavoriteCrabIds,
  pushToast,
}: {
  crabs: Crab[];
  favoriteCrabIds: string[];
  setFavoriteCrabIds: React.Dispatch<React.SetStateAction<string[]>>;
  pushToast: (t: { title: string; description?: string; variant: "default" | "success" | "error" | "warning" }) => void;
}) {
  const showcaseCrabs = favoriteCrabIds
    .map((id) => crabs.find((c) => c.id === id))
    .filter((c): c is Crab => Boolean(c));

  // Clicking a picker crab assigns to the first empty slot (or swaps the last
  // slot if all 5 are filled). Clicking an already-showcased crab removes it.
  const assignShowcase = (crabId: string) => {
    setFavoriteCrabIds((prev) => {
      if (prev.includes(crabId)) return prev.filter((id) => id !== crabId);
      if (prev.length < 5) return [...prev, crabId];
      return [prev[1], prev[2], prev[3], prev[4], crabId];
    });
  };

  const saveShowcase = () => {
    pushToast({ title: "Showcase saved!", variant: "success" });
  };

  // Empty-slot tap: the picker below is where crabs are chosen from —
  // bring it into view (and focus it) instead of leaving a dead button.
  const pickerRef = useRef<HTMLDivElement>(null);
  const focusPicker = () => {
    const el = pickerRef.current;
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.focus({ preventScroll: true });
  };

  return (
    <div className="space-y-4">
      <p className="text-xs opacity-75">
        Pick up to <span style={{ color: "#FFD166" }}>5 favorite crabs</span> to display on your
        public profile.
      </p>

      {/* Slots */}
      <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
        {[0, 1, 2, 3, 4].map((slot) => {
          const crab = showcaseCrabs[slot];
          return (
            <ShowcaseSlot
              key={slot}
              crab={crab}
              onAdd={focusPicker}
              onClear={() =>
                setFavoriteCrabIds((prev) => {
                  const next = [...prev];
                  next.splice(slot, 1);
                  return next;
                })
              }
            />
          );
        })}
      </div>

      {/* Picker grid */}
      <div ref={pickerRef} tabIndex={-1} className="outline-none">
        <SectionTitle
          icon={<span aria-hidden>🦀</span>}
          title={`Your Crabs (${crabs.length})`}
          action={
            <span className="text-[9px] opacity-55">
              {favoriteCrabIds.length}/3 picked
            </span>
          }
        />
        {crabs.length === 0 ? (
          <EmptyState
            compact
            message="No crabs yet"
            hint="Dive, hatch, or adopt your first crab to build a showcase."
          />
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2 max-h-72 overflow-y-auto pr-1">
            {crabs.map((c) => {
              const picked = favoriteCrabIds.includes(c.id);
              const f = FACTIONS[c.faction];
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => assignShowcase(c.id)}
                  className="rounded-xl p-1.5 flex flex-col items-center transition-all hover:-translate-y-0.5 focus:outline-none focus:ring-1 focus:ring-white/30"
                  style={{
                    background: picked ? `${f.colors.primary}22` : "rgba(10,27,61,0.45)",
                    border: `1px solid ${picked ? f.colors.accent + "88" : "rgba(124,245,225,0.12)"}`,
                    boxShadow: picked ? `0 0 10px ${f.colors.primary}44` : "none",
                  }}
                  aria-pressed={picked}
                  aria-label={`${picked ? "Remove" : "Add"} ${c.name} ${picked ? "from" : "to"} showcase`}
                >
                  <ClassArtImage
                    classId={c.classId}
                    faction={c.faction}
                    size={40}
                  />
                  <span className="text-[9px] font-bold truncate w-full text-center text-white/85">
                    {c.name}
                  </span>
                  <span className="text-[8px] opacity-60">BP {formatBP(crabBaseBP(c))}</span>
                  {picked && (
                    <span className="text-[8px] font-bold" style={{ color: f.colors.accent }}>
                      ★ Picked
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="flex justify-end">
        <GlowButton variant="gold" size="sm" onClick={saveShowcase}>
          💾 Save Showcase
        </GlowButton>
      </div>
    </div>
  );
}

// ---------- STATS VIEW -----------------------------------------------------

function StackedBar({ segments }: { segments: BarSegment[] }) {
  const active = segments.filter((s) => s.count > 0);
  return (
    <div>
      <div
        className="flex h-4 rounded-full overflow-hidden"
        style={{
          background: "rgba(255,255,255,0.06)",
          border: "1px solid rgba(124,245,225,0.15)",
        }}
        role="img"
        aria-label={segments
          .filter((s) => s.count > 0)
          .map((s) => `${s.label} ${Math.round(s.pct * 100)}%`)
          .join(", ")}
      >
        {active.map((s) => (
          <div
            key={s.id}
            className="h-full transition-all duration-300"
            style={{
              width: `${s.pct * 100}%`,
              background: s.color,
              boxShadow: "inset 0 0 6px rgba(0,0,0,0.25)",
            }}
            title={`${s.label}: ${s.count} (${Math.round(s.pct * 100)}%)`}
          />
        ))}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-3 gap-y-1 mt-2">
        {segments.map((s) => (
          <div key={s.id} className="flex items-center gap-1.5 text-[10px] min-w-0">
            <span
              className="w-2 h-2 rounded-full shrink-0"
              style={{ background: s.color, opacity: s.count > 0 ? 1 : 0.25 }}
              aria-hidden
            />
            <span
              className="truncate"
              style={{ color: s.count > 0 ? "#EAF6FF" : "rgba(234,246,255,0.4)" }}
            >
              {s.icon ? `${s.icon} ` : ""}
              {s.label}
            </span>
            <span className="ml-auto opacity-60 shrink-0">
              {s.count > 0 ? `${Math.round(s.pct * 100)}%` : "—"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function StatsView({
  crabs,
  raidsCount,
  discoveredBreedsCount,
}: {
  crabs: Crab[];
  raidsCount: number;
  discoveredBreedsCount: number;
}) {
  const factionSegments = useMemo<BarSegment[]>(() => {
    const total = crabs.length || 1;
    return FACTION_LIST.map((f) => {
      const count = crabs.filter((c) => c.faction === f.id).length;
      return {
        id: f.id,
        label: f.shortName,
        icon: f.emblem,
        color: f.colors.primary,
        count,
        pct: count / total,
      };
    });
  }, [crabs]);

  const classSegments = useMemo<BarSegment[]>(() => {
    const total = crabs.length || 1;
    return (Object.keys(CLASSES) as ClassId[]).map((cid) => {
      const count = crabs.filter((c) => c.classId === cid).length;
      return {
        id: cid,
        label: CLASSES[cid].name,
        icon: CLASSES[cid].icon,
        color: CLASS_BAR_COLORS[cid],
        count,
        pct: count / total,
      };
    });
  }, [crabs]);

  return (
    <div className="space-y-4">
      {/* Fun stats grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <StatChip label="Total Dives" value={MOCK_STATS.totalDives} color="#7CF5E1" icon={<span aria-hidden>🌊</span>} />
        <StatChip label="Total Raids" value={MOCK_STATS.totalRaids} color="#FF6F91" icon={<span aria-hidden>⚔️</span>} />
        <StatChip label="Win Rate" value={`${MOCK_STATS.winRatePct}%`} color="#4FB477" icon={<span aria-hidden>📈</span>} />
        <StatChip label="Eggs Hatched" value={MOCK_STATS.eggsHatched} color="#A855F7" icon={<span aria-hidden>🥚</span>} />
        <StatChip label="Crabs Bred" value={MOCK_STATS.crabsBred} color="#FF7A1A" icon={<span aria-hidden>🧬</span>} />
        <StatChip
          label="Gold Lifetime"
          value={formatGold(MOCK_STATS.goldLifetime)}
          color="#FFD166"
          icon={<GoldIcon size={14} />}
        />
        <StatChip
          label="Best Dive"
          value={`${MOCK_STATS.bestDive} 🪙`}
          color="#FFD166"
          icon={<span aria-hidden>⭐</span>}
        />
        <StatChip label="Days Played" value={DAYS_ACTIVE} color="#C9D6EE" icon={<span aria-hidden>📅</span>} />
      </div>

      {/* Faction affinity */}
      <GlassPanel className="p-3">
        <SectionTitle
          icon={<span aria-hidden>🪸</span>}
          title="Faction Affinity"
          action={<span className="text-[10px] opacity-60">{crabs.length} crabs</span>}
        />
        <StackedBar segments={factionSegments} />
      </GlassPanel>

      {/* Class usage */}
      <GlassPanel className="p-3">
        <SectionTitle icon={<span aria-hidden>⚔️</span>} title="Class Usage" />
        <StackedBar segments={classSegments} />
      </GlassPanel>

      {/* Codex + raids note */}
      <div className="flex flex-wrap gap-2">
        <StatChip label="Codex Breeds" value={discoveredBreedsCount} color="#4FB477" icon={<span aria-hidden>📖</span>} />
        <StatChip label="Raid Log" value={raidsCount} color="#5C7CFF" icon={<span aria-hidden>📜</span>} />
      </div>

      {/* Recent activity */}
      <GlassPanel className="p-3">
        <SectionTitle icon={<span aria-hidden>📣</span>} title="Recent Activity" />
        <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
          {RECENT_ACTIVITY.map((a, i) => (
            <div
              key={i}
              className="flex items-center gap-2 rounded-lg px-2 py-1.5"
              style={{
                background: "rgba(10,27,61,0.4)",
                border: "1px solid rgba(124,245,225,0.1)",
              }}
            >
              <span
                className="w-6 h-6 rounded-md flex items-center justify-center text-[12px] shrink-0"
                style={{
                  background: "rgba(255,255,255,0.06)",
                  border: "1px solid rgba(124,245,225,0.18)",
                }}
                aria-hidden
              >
                {a.icon}
              </span>
              <span className="text-[11px] text-white/85 truncate flex-1">{a.text}</span>
              <span className="text-[9px] opacity-50 shrink-0">{a.ago}</span>
            </div>
          ))}
        </div>
      </GlassPanel>
    </div>
  );
}

// ---------- MAIN MODAL -----------------------------------------------------

export default function ProfileModal({ onClose }: { onClose: () => void }) {
  const player = useGame((s) => s.player);
  const pushToast = useGame((s) => s.pushToast);

  // View state
  const [view, setView] = useState<View>("profile");

  // Showcase (up to 5 favorite crabs — mock-seeded with first 5 crabs).
  // Seeded lazily from the store so the modal mounts with live player data
  // (the modal is only ever opened in-game, after player init).
  const [favoriteCrabIds, setFavoriteCrabIds] = useState<string[]>(() => {
    const p = useGame.getState().player;
    return p ? p.crabs.slice(0, 5).map((c) => c.id) : [];
  });

  // Profile frame (mock: Coral Bloom equipped)
  const [selectedFrame, setSelectedFrame] = useState<string>("Coral Bloom");

  // Profile banner tint (player's most-common crab faction)
  const [bannerColor, setBannerColor] = useState<FactionId>(() => {
    const p = useGame.getState().player;
    return p ? dominantFactionOf(p.crabs) : "coral_court";
  });

  // Escape closes the modal.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const raidsWon = useMemo(
    () => (player?.raids ?? []).filter((r) => r.result?.winner === "raider").length,
    [player]
  );

  if (!player) return null;

  const playerName = player.name;
  const level = player.shellwardenLevel;
  const xp = player.shellwardenXp;
  const xpNeeded = level * XP_PER_LEVEL;
  const xpPct = Math.max(0, Math.min(1, xp / xpNeeded));
  const equippedFrame = FRAMES.find((f) => f.name === selectedFrame) ?? FRAMES[0];

  const TABS: { id: View; label: string; icon: string }[] = [
    { id: "profile", label: "Profile", icon: "👤" },
    { id: "trophies", label: "Trophies", icon: "🏆" },
    { id: "showcase", label: "Showcase", icon: "🦀" },
    { id: "stats", label: "Stats", icon: "📊" },
  ];

  return (
    <div
      className="modal-backdrop-enter fixed inset-0 z-[150] flex items-center justify-center p-3 sm:p-4"
      style={{ background: "rgba(2,12,28,0.78)", backdropFilter: "blur(8px)" }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Shellwarden profile"
    >
      <div
        className="w-full max-w-2xl max-h-[88vh] overflow-y-auto rounded-2xl"
        style={{
          background: "linear-gradient(180deg, #06122B 0%, #0A1B3D 100%)",
          border: "1px solid rgba(124,245,225,0.3)",
          boxShadow: "0 12px 60px rgba(18,167,160,0.35)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal header */}
        <div
          className="sticky top-0 z-20 flex items-center justify-between px-4 sm:px-6 py-3 border-b"
          style={{
            borderColor: "rgba(124,245,225,0.18)",
            background: "linear-gradient(180deg, rgba(6,18,43,0.96), rgba(6,18,43,0.86))",
            backdropFilter: "blur(6px)",
          }}
        >
          <h2
            className="text-base sm:text-lg font-bold flex items-center gap-2"
            style={{ fontFamily: "Fredoka, system-ui, sans-serif", color: "#EAF6FF" }}
          >
            <span aria-hidden>🐚</span> Shellwarden Profile
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold transition-colors hover:bg-white/10 focus:outline-none focus:ring-1 focus:ring-white/40"
            style={{
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(124,245,225,0.2)",
              color: "#EAF6FF",
            }}
            aria-label="Close profile"
          >
            ✕
          </button>
        </div>

        {/* Tabs */}
        <div
          className="sticky top-[49px] sm:top-[53px] z-10 flex gap-1.5 px-3 sm:px-6 py-2 border-b overflow-x-auto no-scrollbar"
          style={{
            borderColor: "rgba(124,245,225,0.12)",
            background: "rgba(6,18,43,0.92)",
            backdropFilter: "blur(6px)",
          }}
          role="tablist"
          aria-label="Profile sections"
        >
          {TABS.map((t) => (
            <TabButton key={t.id} active={view === t.id} onClick={() => setView(t.id)}>
              <span aria-hidden>{t.icon}</span> {t.label}
            </TabButton>
          ))}
        </div>

        {/* Content */}
        <div className="p-3 sm:p-6">
          {view === "profile" && (
            <ProfileView
              playerName={playerName}
              level={level}
              xp={xp}
              xpNeeded={xpNeeded}
              xpPct={xpPct}
              crabsCount={player.crabs.length}
              teamsCount={player.teams.length}
              goldAmount={player.gold}
              raidsWon={raidsWon}
              bannerColor={bannerColor}
              onBannerColor={setBannerColor}
              equippedFrame={equippedFrame}
              onFrameChange={setSelectedFrame}
              pushToast={pushToast}
            />
          )}

          {view === "trophies" && <TrophiesView />}

          {view === "showcase" && (
            <ShowcaseView
              crabs={player.crabs}
              favoriteCrabIds={favoriteCrabIds}
              setFavoriteCrabIds={setFavoriteCrabIds}
              pushToast={pushToast}
            />
          )}

          {view === "stats" && (
            <StatsView
              crabs={player.crabs}
              raidsCount={player.raids.length}
              discoveredBreedsCount={player.discoveredBreeds.length}
            />
          )}
        </div>

        {/* Footer */}
        <div
          className="sticky bottom-0 z-20 px-4 sm:px-6 py-3 border-t"
          style={{
            borderColor: "rgba(124,245,225,0.18)",
            background: "linear-gradient(0deg, rgba(6,18,43,0.96), rgba(6,18,43,0.86))",
            backdropFilter: "blur(6px)",
          }}
        >
          <div className="flex flex-col sm:flex-row items-center justify-between gap-2">
            <div className="text-[10px] text-center sm:text-left opacity-60 leading-relaxed min-w-0">
              <span className="block">
                Profiles are public. Show off your trophies and favorite crabs!
              </span>
              <button
                type="button"
                onClick={() =>
                  pushToast({
                    title: "Privacy",
                    description: "Hide-profile toggle lives in Settings.",
                    variant: "default",
                  })
                }
                className="underline underline-offset-2 hover:text-white/80 transition-colors focus:outline-none focus:ring-1 focus:ring-white/30 rounded"
              >
                Privacy: hide profile in Settings
              </button>
            </div>
            <GlowButton onClick={onClose} size="sm">
              Close
            </GlowButton>
          </div>
        </div>
      </div>
    </div>
  );
}
