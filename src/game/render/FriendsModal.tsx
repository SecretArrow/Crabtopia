// Crabtopia - Friends & Gifting Modal (spec 10B · problem 8)
// Self-contained modal: friends list, incoming requests, add-friend search,
// Burrow visits with favorite-crab showcase, and STYLES-ONLY gifting.
// Anti-RMT rule: gifting is limited to cosmetics (frames, dances, trails, decor).
// You can NEVER gift crabs, eggs, GOLD, or power items. All data is mocked locally.

"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useGame } from "../store/gameStore";
import { FACTIONS } from "../content/factions";
import { FactionId, ClassId } from "../types";
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
} from "./ui";
import { ClassArtImage } from "./CrabArtImage";

// ---------- LOCAL TYPES ----------

type View = "friends" | "requests" | "add-friend" | "visit" | "gift";

interface Friend {
  id: string;
  name: string;
  level: number;
  faction: FactionId;
  online: boolean;
  lastActive: string; // "2m ago"
  favoriteCrab: string; // breed name
  burrowDecor: string[]; // decor names
  mutualClan?: string;
}

interface FriendRequest {
  id: string;
  fromName: string;
  fromLevel: number;
  message?: string;
  sentAt: string;
}

interface FoundPlayer {
  id: string;
  name: string;
  level: number;
  faction: FactionId;
}

interface ShowcaseCrab {
  name: string;
  classId: ClassId;
  bp: number;
}

interface GiftItem {
  id: string;
  category: "Profile Frame" | "Victory Dance" | "Shell Trail" | "Burrow Decor";
  name: string;
  emoji: string;
  color: string;
  price: number; // GOLD — friend-gifting costs GOLD as a sink
  description: string;
}

interface GiftHistoryEntry {
  id: string;
  direction: "sent" | "received";
  text: string;
  ago: string;
}

// ---------- MOCK DATA ----------

const DAILY_GIFT_LIMIT = 3;
const MAX_FRIENDS = 50;

const INITIAL_FRIENDS: Friend[] = [
  {
    id: "friend_tidecrest",
    name: "Tidecrest",
    level: 24,
    faction: "moonpool",
    online: true,
    lastActive: "2m ago",
    favoriteCrab: "Moonlace Sentinel",
    burrowDecor: ["Kelp Garden", "Coral Throne", "Lantern Reef"],
    mutualClan: "Tidebound Brotherhood",
  },
  {
    id: "friend_mossmark",
    name: "Mossmark",
    level: 31,
    faction: "mangrove",
    online: true,
    lastActive: "5m ago",
    favoriteCrab: "Mangrove Colossus",
    burrowDecor: ["Tidepool Pavilion", "Driftwood Arch", "Moon Well"],
  },
  {
    id: "friend_brinelia",
    name: "Brinelia",
    level: 19,
    faction: "coral_court",
    online: true,
    lastActive: "12m ago",
    favoriteCrab: "Coral Bloom Sovereign",
    burrowDecor: ["Coral Throne", "Shell Fountain", "Pearl Arch"],
    mutualClan: "Coral Wardens",
  },
  {
    id: "friend_cinderpaw",
    name: "Cinderpaw",
    level: 27,
    faction: "cinderreef",
    online: false,
    lastActive: "1h ago",
    favoriteCrab: "Cinder Reaver",
    burrowDecor: ["Ember Brazier", "Basalt Pillar", "Lantern Reef"],
  },
  {
    id: "friend_frostwig",
    name: "Frostwig",
    level: 15,
    faction: "frostshelf",
    online: false,
    lastActive: "3h ago",
    favoriteCrab: "Glacier Warden",
    burrowDecor: ["Moon Well", "Ice Mural", "Pearl Arch"],
  },
  {
    id: "friend_voltaic",
    name: "Voltaic",
    level: 22,
    faction: "stormwake",
    online: false,
    lastActive: "1d ago",
    favoriteCrab: "Stormcaller Skitter",
    burrowDecor: ["Storm Totem", "Tidepool Pavilion", "Kelp Garden"],
  },
  {
    id: "friend_nettlespine",
    name: "Nettlespine",
    level: 33,
    faction: "mangrove",
    online: false,
    lastActive: "2d ago",
    favoriteCrab: "Thornback Bulwark",
    burrowDecor: ["Driftwood Arch", "Shell Fountain", "Kelp Garden"],
  },
  {
    id: "friend_lunaria",
    name: "Lunaria",
    level: 28,
    faction: "moonpool",
    online: false,
    lastActive: "4d ago",
    favoriteCrab: "Moonpool Oracle",
    burrowDecor: ["Moon Well", "Lantern Reef", "Coral Throne"],
    mutualClan: "Tidebound Brotherhood",
  },
];

const INITIAL_REQUESTS: FriendRequest[] = [
  {
    id: "req_pinchwhistle",
    fromName: "Pinchwhistle",
    fromLevel: 12,
    message: "Saw your raid replay — let's be friends!",
    sentAt: "2h ago",
  },
  {
    id: "req_umbrafin",
    fromName: "Umbrafin",
    fromLevel: 17,
    sentAt: "6h ago",
  },
  {
    id: "req_scorchclaw",
    fromName: "Scorchclaw",
    fromLevel: 9,
    message: "Nice Burrow! The kelp garden is glowing.",
    sentAt: "1d ago",
  },
];

const MOCK_SEARCH: FoundPlayer[] = [
  { id: "found_pinchwhistle", name: "Pinchwhistle", level: 12, faction: "coral_court" },
  { id: "found_umbrafin", name: "Umbrafin", level: 17, faction: "moonpool" },
  { id: "found_scorchclaw", name: "Scorchclaw", level: 9, faction: "cinderreef" },
  { id: "found_mistgill", name: "Mistgill", level: 21, faction: "frostshelf" },
];

const MOCK_SHOWCASE: Record<string, ShowcaseCrab[]> = {
  friend_tidecrest: [
    { name: "Tideshiver", classId: "tidecaller", bp: 4820 },
    { name: "Moonlace", classId: "warden", bp: 5310 },
    { name: "Pearlpinch", classId: "gildclaw", bp: 3960 },
  ],
  friend_mossmark: [
    { name: "Barkhide", classId: "bulwark", bp: 5610 },
    { name: "Rootgrip", classId: "shellmender", bp: 4180 },
    { name: "Thornclaw", classId: "reaver", bp: 4940 },
  ],
  friend_brinelia: [
    { name: "Bloomsong", classId: "tidecaller", bp: 4410 },
    { name: "Reefpetal", classId: "shellmender", bp: 3870 },
    { name: "Coralgash", classId: "pincher", bp: 4290 },
  ],
  friend_cinderpaw: [
    { name: "Emberjaw", classId: "reaver", bp: 5240 },
    { name: "Slagshell", classId: "bulwark", bp: 4760 },
    { name: "Ashskip", classId: "skitter", bp: 4020 },
  ],
  friend_frostwig: [
    { name: "Rimecarapace", classId: "warden", bp: 4530 },
    { name: "Chillnip", classId: "pincher", bp: 3790 },
    { name: "Glacia", classId: "tidecaller", bp: 4110 },
  ],
  friend_voltaic: [
    { name: "Thunderdash", classId: "skitter", bp: 5080 },
    { name: "Arcsnap", classId: "pincher", bp: 4620 },
    { name: "Galeward", classId: "gildclaw", bp: 4350 },
  ],
  friend_nettlespine: [
    { name: "Brambleback", classId: "bulwark", bp: 5890 },
    { name: "Stingmaw", classId: "reaver", bp: 5170 },
    { name: "Fernhide", classId: "shellmender", bp: 4440 },
  ],
  friend_lunaria: [
    { name: "Moonrip", classId: "gildclaw", bp: 5420 },
    { name: "Noctiluca", classId: "tidecaller", bp: 4880 },
    { name: "Starshell", classId: "warden", bp: 4630 },
  ],
};

const DEFAULT_SHOWCASE: ShowcaseCrab[] = [
  { name: "Reefdrifter", classId: "pincher", bp: 3600 },
  { name: "Tideflick", classId: "skitter", bp: 3300 },
  { name: "Shellnook", classId: "shellmender", bp: 3100 },
];

// Styles-only gift catalog. NO crabs, eggs, GOLD, or power items — ever.
const GIFT_CATALOG: GiftItem[] = [
  {
    id: "gift_frame_coral",
    category: "Profile Frame",
    name: "Coral Bloom",
    emoji: "🌸",
    color: "#FF6F91",
    price: 800,
    description: "A blooming coral ring around your portrait.",
  },
  {
    id: "gift_dance_wave",
    category: "Victory Dance",
    name: "Wavebreaker",
    emoji: "🌊",
    color: "#7CF5E1",
    price: 1200,
    description: "A triumphant surf-spin after every raid win.",
  },
  {
    id: "gift_trail_plankton",
    category: "Shell Trail",
    name: "Plankton Glow",
    emoji: "✨",
    color: "#6EE7B7",
    price: 600,
    description: "Your crab leaves a shimmering plankton wake.",
  },
  {
    id: "gift_decor_kelp",
    category: "Burrow Decor",
    name: "Kelp Garden",
    emoji: "🌿",
    color: "#34D399",
    price: 900,
    description: "A swaying kelp garden for your Burrow.",
  },
  {
    id: "gift_frame_crown",
    category: "Profile Frame",
    name: "Gilded Crown",
    emoji: "👑",
    color: "#FFD166",
    price: 2500,
    description: "A regal golden frame for true tide-lords.",
  },
  {
    id: "gift_dance_storm",
    category: "Victory Dance",
    name: "Stormstrike",
    emoji: "⚡",
    color: "#C084FC",
    price: 1500,
    description: "A lightning-crack victory stomp.",
  },
];

const INITIAL_GIFT_HISTORY: GiftHistoryEntry[] = [
  { id: "gh_1", direction: "sent", text: "You sent Wavebreaker to Tidecrest", ago: "3d ago" },
  { id: "gh_2", direction: "received", text: "Received Kelp Garden from Mossmark", ago: "1w ago" },
  { id: "gh_3", direction: "sent", text: "You sent Plankton Glow to Nettlespine", ago: "2w ago" },
];

const FACTION_CYCLE: FactionId[] = [
  "coral_court",
  "cinderreef",
  "frostshelf",
  "mangrove",
  "stormwake",
  "moonpool",
];

// Decor name -> simple CSS shape / emoji arrangement config.
const DECOR_ART: Record<string, { emoji: string; color: string }> = {
  "Kelp Garden": { emoji: "🌿", color: "#34D399" },
  "Coral Throne": { emoji: "👑", color: "#FF6F91" },
  "Tidepool Pavilion": { emoji: "⛱️", color: "#7CF5E1" },
  "Lantern Reef": { emoji: "🏮", color: "#FFD166" },
  "Moon Well": { emoji: "🌙", color: "#C7B8FF" },
  "Pearl Arch": { emoji: "🦪", color: "#EAF6FF" },
  "Shell Fountain": { emoji: "⛲", color: "#7CF5E1" },
  "Driftwood Arch": { emoji: "🪵", color: "#C97A3A" },
  "Ember Brazier": { emoji: "🔥", color: "#FF7A1A" },
  "Basalt Pillar": { emoji: "🗿", color: "#9AA5B1" },
  "Storm Totem": { emoji: "⚡", color: "#C084FC" },
  "Ice Mural": { emoji: "❄️", color: "#A5E8FF" },
};

const BUBBLES = [
  { x: 8, s: 5, d: 6.5, delay: 0 },
  { x: 19, s: 3, d: 8, delay: 1.4 },
  { x: 33, s: 4, d: 7.2, delay: 0.7 },
  { x: 56, s: 3, d: 9, delay: 2.1 },
  { x: 71, s: 5, d: 6.8, delay: 1 },
  { x: 87, s: 4, d: 7.6, delay: 0.4 },
] as const;

// Scoped keyframes + custom scrollbar (self-contained, no global CSS edits).
const FRIENDS_CSS = `
@keyframes friendBubble { 0% { transform: translateY(0); opacity: 0; } 12% { opacity: 0.7; } 100% { transform: translateY(-140px); opacity: 0; } }
@keyframes friendSway { 0%, 100% { transform: rotate(-5deg); } 50% { transform: rotate(5deg); } }
.friends-scroll::-webkit-scrollbar { width: 6px; }
.friends-scroll::-webkit-scrollbar-track { background: rgba(10,27,61,0.4); border-radius: 3px; }
.friends-scroll::-webkit-scrollbar-thumb { background: rgba(124,245,225,0.35); border-radius: 3px; }
.friends-scroll::-webkit-scrollbar-thumb:hover { background: rgba(124,245,225,0.55); }
.friends-scroll { scrollbar-width: thin; scrollbar-color: rgba(124,245,225,0.35) rgba(10,27,61,0.4); }
`;

// ---------- HELPERS ----------

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "??";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0].charAt(0) + parts[1].charAt(0)).toUpperCase();
}

function showcaseFor(friend: Friend): ShowcaseCrab[] {
  return MOCK_SHOWCASE[friend.id] ?? DEFAULT_SHOWCASE;
}

// ---------- SMALL PRESENTATIONAL COMPONENTS ----------

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className="px-3 py-1.5 text-xs font-bold rounded-lg transition-all"
      style={
        active
          ? {
              background: "linear-gradient(135deg, #12A7A0, #0A4A66)",
              color: "#EAF6FF",
              boxShadow: "0 2px 10px rgba(18,167,160,0.4)",
            }
          : { color: "rgba(234,246,255,0.6)" }
      }
    >
      {children}
    </button>
  );
}

function Avatar({
  name,
  faction,
  online,
  size = 38,
}: {
  name: string;
  faction?: FactionId;
  online?: boolean;
  size?: number;
}) {
  const f = faction ? FACTIONS[faction] : null;
  const showDot = typeof online === "boolean";
  const dot = Math.max(9, Math.round(size * 0.26));
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <div
        className="w-full h-full flex items-center justify-center rounded-full font-bold"
        style={{
          background: f
            ? `linear-gradient(135deg, ${f.colors.dark}, ${f.colors.primary}66)`
            : "linear-gradient(135deg, #0A1B3D, rgba(18,167,160,0.35))",
          color: f ? f.colors.light : "#7CF5E1",
          border: `1px solid ${f ? f.colors.accent + "55" : "rgba(124,245,225,0.35)"}`,
          fontSize: Math.round(size * 0.34),
        }}
        aria-hidden
      >
        {initials(name)}
      </div>
      {showDot && (
        <span
          className="absolute rounded-full"
          style={{
            bottom: -1,
            right: -1,
            width: dot,
            height: dot,
            background: online ? "#4ADE80" : "#5B6B7F",
            boxShadow: online ? "0 0 6px rgba(74,222,128,0.8)" : "none",
            border: "2px solid #06122B",
          }}
          title={online ? "Online" : "Offline"}
        />
      )}
    </div>
  );
}

function LevelChip({ level }: { level: number }) {
  return (
    <span
      className="text-[9px] px-1.5 py-0.5 rounded-md font-bold shrink-0"
      style={{
        background: "rgba(124,245,225,0.12)",
        color: "#7CF5E1",
        border: "1px solid rgba(124,245,225,0.3)",
      }}
    >
      Lv {level}
    </span>
  );
}

// One decor item drawn as a simple CSS shape / emoji arrangement.
function DecorPiece({ name }: { name: string }) {
  const cfg = DECOR_ART[name] ?? { emoji: "🪸", color: "#7CF5E1" };
  return (
    <div className="flex flex-col items-center shrink-0 w-12 sm:w-14" title={name}>
      <div className="relative w-12 h-12 sm:w-14 sm:h-14 flex items-end justify-center">
        {name === "Kelp Garden" ? (
          // Swaying kelp stalks (pure CSS)
          <div className="absolute inset-x-1 bottom-0 top-1">
            <span
              className="absolute bottom-0 rounded-t-full"
              style={{
                left: 5,
                width: 5,
                height: "72%",
                background: "linear-gradient(180deg, #6EE7B7, #0E7C5A)",
                transformOrigin: "bottom center",
                animation: "friendSway 3.4s ease-in-out infinite",
              }}
            />
            <span
              className="absolute bottom-0 rounded-t-full"
              style={{
                left: "50%",
                marginLeft: -2.5,
                width: 5,
                height: "100%",
                background: "linear-gradient(180deg, #34D399, #0B5E45)",
                transformOrigin: "bottom center",
                animation: "friendSway 3s ease-in-out 0.4s infinite",
              }}
            />
            <span
              className="absolute bottom-0 rounded-t-full"
              style={{
                right: 5,
                width: 5,
                height: "62%",
                background: "linear-gradient(180deg, #A7F3D0, #0E7C5A)",
                transformOrigin: "bottom center",
                animation: "friendSway 3.8s ease-in-out 0.8s infinite",
              }}
            />
          </div>
        ) : (
          <>
            <span
              className="relative z-[1] text-xl sm:text-2xl leading-none mb-1"
              style={{ filter: `drop-shadow(0 0 6px ${cfg.color}99)` }}
              aria-hidden
            >
              {cfg.emoji}
            </span>
            <span
              className="absolute bottom-0 rounded-full"
              style={{
                width: 40,
                height: 9,
                background: `linear-gradient(180deg, ${cfg.color}66, ${cfg.color}22)`,
                boxShadow: `0 0 10px ${cfg.color}44`,
              }}
            />
          </>
        )}
      </div>
      <div
        className="text-[8px] font-bold text-center leading-tight w-full truncate"
        style={{ color: "rgba(234,246,255,0.8)" }}
      >
        {name}
      </div>
    </div>
  );
}

// CSS-built Burrow scene: dome + door + decor items arranged on the sand.
function BurrowScene({ friend }: { friend: Friend }) {
  const f = FACTIONS[friend.faction];
  const mid = Math.ceil(friend.burrowDecor.length / 2);
  const leftDecor = friend.burrowDecor.slice(0, mid);
  const rightDecor = friend.burrowDecor.slice(mid);
  return (
    <div
      className="relative rounded-xl overflow-hidden h-[190px] sm:h-[210px]"
      style={{
        background:
          "linear-gradient(180deg, #083250 0%, #0E4D63 40%, #17707C 68%, #C9A066 76%, #B8895A 100%)",
        border: "1px solid rgba(124,245,225,0.2)",
      }}
      role="img"
      aria-label={`${friend.name}'s Burrow decorated with ${friend.burrowDecor.join(", ")}`}
    >
      {/* light rays */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "linear-gradient(105deg, rgba(234,246,255,0.1) 0%, transparent 35%, rgba(124,245,225,0.07) 55%, transparent 85%)",
        }}
      />
      {/* rising bubbles */}
      {BUBBLES.map((b, i) => (
        <span
          key={i}
          className="absolute rounded-full pointer-events-none"
          style={{
            left: `${b.x}%`,
            bottom: 34,
            width: b.s,
            height: b.s,
            border: "1px solid rgba(234,246,255,0.45)",
            background: "rgba(234,246,255,0.1)",
            animation: `friendBubble ${b.d}s ease-in ${b.delay}s infinite`,
          }}
        />
      ))}
      {/* sand dome with door */}
      <div
        className="absolute"
        style={{
          left: "50%",
          transform: "translateX(-50%)",
          bottom: 26,
          width: 132,
          height: 76,
          borderRadius: "66px 66px 10px 10px",
          background: "linear-gradient(180deg, #EADBB8 0%, #C9A066 85%)",
          border: "2px solid #8C6B3F",
          boxShadow: "0 8px 22px rgba(0,0,0,0.4)",
        }}
      >
        {/* shell ridges */}
        <div
          className="absolute inset-0"
          style={{
            borderRadius: "inherit",
            background:
              "repeating-linear-gradient(90deg, transparent 0 15px, rgba(140,107,63,0.22) 15px 17px)",
          }}
        />
        {/* round windows */}
        <span
          className="absolute rounded-full"
          style={{
            left: 18,
            top: 24,
            width: 9,
            height: 9,
            background: "radial-gradient(circle, #FFE9A6, #FFB84D)",
            boxShadow: "0 0 8px rgba(255,209,102,0.7)",
            border: "1px solid #8C6B3F",
          }}
        />
        <span
          className="absolute rounded-full"
          style={{
            right: 18,
            top: 24,
            width: 9,
            height: 9,
            background: "radial-gradient(circle, #FFE9A6, #FFB84D)",
            boxShadow: "0 0 8px rgba(255,209,102,0.7)",
            border: "1px solid #8C6B3F",
          }}
        />
        {/* door */}
        <div
          className="absolute"
          style={{
            left: "50%",
            transform: "translateX(-50%)",
            bottom: -2,
            width: 36,
            height: 40,
            borderRadius: "18px 18px 4px 4px",
            background: "linear-gradient(180deg, #16405E, #06122B)",
            border: "2px solid #8C6B3F",
            boxShadow: "inset 0 0 14px rgba(255,209,102,0.4)",
          }}
        >
          <span
            className="absolute rounded-full"
            style={{
              left: "50%",
              top: 8,
              transform: "translateX(-50%)",
              width: 5,
              height: 5,
              background: "#FFD166",
              boxShadow: "0 0 6px #FFD166",
            }}
          />
        </div>
        {/* faction emblem plaque */}
        <img
          src={FACTION_EMBLEM_ART[friend.faction]}
          alt={f.name}
          width={24}
          height={24}
          className="absolute"
          style={{
            left: "50%",
            transform: "translateX(-50%)",
            top: -14,
            filter: `drop-shadow(0 0 5px ${f.colors.accent})`,
          }}
        />
      </div>
      {/* decor arranged around the dome */}
      <div className="absolute left-1 right-1 bottom-1 flex items-end justify-between gap-1 sm:gap-2">
        <div className="flex items-end gap-1 sm:gap-1.5 min-w-0 overflow-hidden">
          {leftDecor.map((d) => (
            <DecorPiece key={d} name={d} />
          ))}
        </div>
        <div className="shrink-0 w-[100px] sm:w-[138px]" aria-hidden />
        <div className="flex items-end gap-1 sm:gap-1.5 min-w-0 overflow-hidden">
          {rightDecor.map((d) => (
            <DecorPiece key={d} name={d} />
          ))}
        </div>
      </div>
    </div>
  );
}

function ShowcaseCard({ crab, faction }: { crab: ShowcaseCrab; faction: FactionId }) {
  return (
    <div
      className="rounded-xl p-2 text-center"
      style={{ background: "rgba(10,27,61,0.55)", border: "1px solid rgba(124,245,225,0.18)" }}
    >
      <div
        className="mx-auto w-fit"
        style={{ filter: "drop-shadow(0 4px 10px rgba(0,0,0,0.5))" }}
      >
        <ClassArtImage classId={crab.classId} faction={faction} size={60} />
      </div>
      <div className="text-[11px] font-bold truncate mt-1">{crab.name}</div>
      <div className="text-[9px] font-bold" style={{ color: "#FFD166" }}>
        BP {formatBP(crab.bp)}
      </div>
    </div>
  );
}

function ConfirmDialog({
  icon,
  title,
  message,
  confirmLabel,
  confirmVariant = "teal",
  onConfirm,
  onCancel,
}: {
  icon?: string;
  title: string;
  message: string;
  confirmLabel: string;
  confirmVariant?: "teal" | "gold" | "rose";
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[160] flex items-center justify-center p-4"
      style={{ background: "rgba(2,12,28,0.7)", backdropFilter: "blur(4px)" }}
      onClick={onCancel}
      role="alertdialog"
      aria-modal="true"
      aria-label={title}
    >
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-xs">
        <GlassPanel className="p-4" glow="rgba(18,167,160,0.3)">
          <div className="flex items-start gap-2.5">
            {icon && (
              <span className="text-xl leading-none mt-0.5 shrink-0" aria-hidden>
                {icon}
              </span>
            )}
            <div className="min-w-0">
              <div className="text-sm font-bold" style={{ color: "#7CF5E1" }}>
                {title}
              </div>
              <div className="text-xs opacity-80 mt-1 leading-snug">{message}</div>
            </div>
          </div>
          <div className="flex gap-2 justify-end mt-3">
            <GlowButton variant="ghost" size="sm" onClick={onCancel}>
              Cancel
            </GlowButton>
            <GlowButton variant={confirmVariant} size="sm" onClick={onConfirm}>
              {confirmLabel}
            </GlowButton>
          </div>
        </GlassPanel>
      </div>
    </div>
  );
}

// ---------- MAIN MODAL ----------

export default function FriendsModal({ onClose }: { onClose: () => void }) {
  const player = useGame((s) => s.player);
  const spendGold = useGame((s) => s.spendGold);
  const pushToast = useGame((s) => s.pushToast);

  // View state
  const [view, setView] = useState<View>("friends");
  const [friends, setFriends] = useState<Friend[]>(INITIAL_FRIENDS);
  const [pendingRequests, setPendingRequests] = useState<FriendRequest[]>(INITIAL_REQUESTS);

  // Add-friend state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<FoundPlayer[]>([]);
  const [sentRequestIds, setSentRequestIds] = useState<string[]>([]);

  // Visit / gift state
  const [visitingFriend, setVisitingFriend] = useState<Friend | null>(null);
  const [giftingFriend, setGiftingFriend] = useState<Friend | null>(null);
  const [selectedGiftId, setSelectedGiftId] = useState<string | null>(null);
  const [confirmGift, setConfirmGift] = useState<GiftItem | null>(null);
  const [removeTarget, setRemoveTarget] = useState<Friend | null>(null);

  // Gift economy state (1 already sent today -> 2 remaining)
  const [giftsSentToday, setGiftsSentToday] = useState(1);
  const [giftHistory, setGiftHistory] = useState<GiftHistoryEntry[]>(INITIAL_GIFT_HISTORY);

  const playerName = player?.name ?? "Shellwarden";
  const playerGold = player?.gold ?? 0;
  const myShellId = `SHELL-${playerName}-0451`;
  const onlineCount = friends.filter((f) => f.online).length;
  const giftsRemaining = Math.max(0, DAILY_GIFT_LIMIT - giftsSentToday);

  // Online friends sorted first
  const sortedFriends = useMemo(() => {
    return friends
      .slice()
      .sort((a, b) => {
        if (a.online !== b.online) return a.online ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
  }, [friends]);

  // ---------- ACTIONS ----------

  const backToFriends = () => {
    setView("friends");
    setVisitingFriend(null);
    setGiftingFriend(null);
    setSelectedGiftId(null);
  };

  const handleAccept = (req: FriendRequest) => {
    const newFriend: Friend = {
      id: req.id,
      name: req.fromName,
      level: req.fromLevel,
      faction: FACTION_CYCLE[req.fromName.length % FACTION_CYCLE.length],
      online: false,
      lastActive: "just now",
      favoriteCrab: "Reefdrifter",
      burrowDecor: ["Lantern Reef", "Shell Fountain"],
    };
    setFriends((prev) => [newFriend, ...prev]);
    setPendingRequests((prev) => prev.filter((r) => r.id !== req.id));
    pushToast({ title: `You're now friends with ${req.fromName}!`, variant: "success" });
  };

  const handleDecline = (req: FriendRequest) => {
    setPendingRequests((prev) => prev.filter((r) => r.id !== req.id));
    pushToast({ title: `Friend request from ${req.fromName} declined.`, variant: "warning" });
  };

  const handleRemoveFriend = () => {
    if (!removeTarget) return;
    setFriends((prev) => prev.filter((f) => f.id !== removeTarget.id));
    pushToast({ title: `${removeTarget.name} removed from friends.`, variant: "warning" });
    setRemoveTarget(null);
  };

  const handleSendRequest = (p: FoundPlayer) => {
    setSentRequestIds((prev) => [...prev, p.id]);
    pushToast({ title: `Friend request sent to ${p.name}`, variant: "success" });
  };

  const handleCopyId = async () => {
    try {
      await navigator.clipboard.writeText(myShellId);
    } catch {
      // Clipboard may be unavailable in some sandboxes — the toast still confirms intent.
    }
    pushToast({ title: "ID copied!", variant: "success" });
  };

  const handleWave = () => {
    if (!visitingFriend) return;
    pushToast({ title: `You waved at ${visitingFriend.name}!`, variant: "default" });
  };

  const handleCompliment = () => {
    pushToast({ title: "Compliment sent! +5 friend XP", variant: "success" });
  };

  const openGiftConfirm = (item: GiftItem) => {
    if (giftsRemaining <= 0) {
      pushToast({
        title: "Daily gift limit reached",
        description: "You can send 3 style gifts per day.",
        variant: "warning",
      });
      return;
    }
    setSelectedGiftId(item.id);
    setConfirmGift(item);
  };

  const handleConfirmGift = () => {
    if (!confirmGift || !giftingFriend) return;
    if (!spendGold(confirmGift.price)) {
      pushToast({
        title: "Not enough GOLD",
        description: `${confirmGift.name} costs ${formatGold(confirmGift.price)} GOLD.`,
        variant: "error",
      });
      setConfirmGift(null);
      return;
    }
    setGiftsSentToday((n) => Math.min(DAILY_GIFT_LIMIT, n + 1));
    setGiftHistory((prev) => [
      {
        id: `gh_${Date.now()}`,
        direction: "sent",
        text: `You sent ${confirmGift.name} to ${giftingFriend.name}`,
        ago: "just now",
      },
      ...prev,
    ]);
    pushToast({
      title: `${confirmGift.name} sent to ${giftingFriend.name}!`,
      description: `-${formatGold(confirmGift.price)} GOLD · styles-only gift`,
      variant: "success",
    });
    setConfirmGift(null);
    setSelectedGiftId(null);
  };

  // ---------- RENDER ----------

  const vf = visitingFriend;
  const gf = giftingFriend;

  return (
    <div
      className="fixed inset-0 z-[150] flex items-center justify-center p-3 sm:p-4"
      style={{ background: "rgba(2,12,28,0.78)", backdropFilter: "blur(8px)" }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Friends and Gifting"
    >
      <style>{FRIENDS_CSS}</style>
      <div
        className="w-full max-w-2xl max-h-[88vh] overflow-y-auto rounded-2xl friends-scroll"
        style={{
          background: "linear-gradient(180deg, #06122B 0%, #0A1B3D 100%)",
          border: "1px solid rgba(124,245,225,0.3)",
          boxShadow: "0 12px 60px rgba(18,167,160,0.35), 0 0 40px rgba(124,245,225,0.12)",
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
            <span className="text-lg" aria-hidden>
              🤝
            </span>
            <div className="min-w-0">
              <h2
                className="text-sm sm:text-base font-bold truncate"
                style={{ fontFamily: "Fredoka, system-ui, sans-serif", color: "#7CF5E1" }}
              >
                Friends &amp; Gifting
              </h2>
              <div className="text-[10px] opacity-60 truncate">
                Burrow visits · styles-only gifts · friend codes
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

        {/* View toggle (main views only) */}
        {(view === "friends" || view === "requests" || view === "add-friend") && (
          <div className="px-4 sm:px-6 pt-3">
            <div
              className="inline-flex rounded-xl p-1"
              style={{ background: "rgba(10,27,61,0.6)", border: "1px solid rgba(124,245,225,0.18)" }}
            >
              <TabButton active={view === "friends"} onClick={() => setView("friends")}>
                🤝 Friends
              </TabButton>
              <TabButton active={view === "requests"} onClick={() => setView("requests")}>
                <span className="inline-flex items-center gap-1">
                  ✉️ Requests
                  {pendingRequests.length > 0 && (
                    <span
                      className="px-1.5 py-0.5 rounded-full text-[9px] font-bold"
                      style={{
                        background: "rgba(255,209,102,0.2)",
                        color: "#FFD166",
                        border: "1px solid rgba(255,209,102,0.4)",
                      }}
                    >
                      {pendingRequests.length}
                    </span>
                  )}
                </span>
              </TabButton>
            </div>
          </div>
        )}

        {/* Body */}
        <div className="px-4 sm:px-6 py-4 space-y-3">
          {/* ================= FRIENDS VIEW ================= */}
          {view === "friends" && (
            <>
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="text-xs opacity-75">
                  {friends.length} friends · {onlineCount} online · {pendingRequests.length} pending{" "}
                  {pendingRequests.length === 1 ? "request" : "requests"}
                </div>
                <GlowButton size="sm" onClick={() => setView("add-friend")}>
                  + Add Friend
                </GlowButton>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <StatChip label="Friends" value={`${friends.length}/${MAX_FRIENDS}`} color="#7CF5E1" icon={<span aria-hidden>🤝</span>} />
                <StatChip label="Online" value={onlineCount} color="#4ADE80" icon={<span aria-hidden>🟢</span>} />
                <StatChip label="Requests" value={pendingRequests.length} color="#FFD166" icon={<span aria-hidden>✉️</span>} />
                <StatChip label="Gifts Left" value={giftsRemaining} color="#FF6F91" icon={<span aria-hidden>🎁</span>} />
              </div>

              <GlassPanel className="p-3">
                <SectionTitle
                  icon={<span aria-hidden>🤝</span>}
                  title="Your Friends"
                  action={<span className="text-[10px] opacity-60">Online first</span>}
                />
                {sortedFriends.length === 0 ? (
                  <EmptyState
                    message="No friends yet."
                    hint="Add a Shellwarden to visit their Burrow and swap style gifts."
                    cta={
                      <GlowButton size="sm" onClick={() => setView("add-friend")}>
                        + Add Friend
                      </GlowButton>
                    }
                  />
                ) : (
                  <div className="space-y-2 max-h-96 overflow-y-auto pr-1 friends-scroll">
                    {sortedFriends.map((f) => {
                      const show = showcaseFor(f);
                      return (
                        <div
                          key={f.id}
                          className="rounded-xl p-2.5 sm:p-3 flex items-center gap-2.5 sm:gap-3"
                          style={{ background: "rgba(10,27,61,0.45)", border: "1px solid rgba(124,245,225,0.12)" }}
                        >
                          <Avatar name={f.name} faction={f.faction} online={f.online} size={38} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-sm font-bold truncate" style={{ color: "#EAF6FF" }}>
                                {f.name}
                              </span>
                              <LevelChip level={f.level} />
                              <img
                                src={FACTION_EMBLEM_ART[f.faction]}
                                alt={FACTIONS[f.faction].name}
                                width={16}
                                height={16}
                                className="object-contain shrink-0"
                                title={FACTIONS[f.faction].name}
                              />
                              {f.mutualClan && (
                                <span
                                  className="text-[8px] px-1.5 py-0.5 rounded-md font-bold truncate max-w-[110px]"
                                  style={{
                                    background: "rgba(124,245,225,0.12)",
                                    color: "#7CF5E1",
                                    border: "1px solid rgba(124,245,225,0.3)",
                                  }}
                                  title={`Mutual clan: ${f.mutualClan}`}
                                >
                                  ⚓ {f.mutualClan}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5 mt-1 min-w-0">
                              <span
                                className="shrink-0"
                                style={{ filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.5))" }}
                              >
                                <ClassArtImage
                                  classId={show[0].classId}
                                  faction={f.faction}
                                  size={22}
                                  speed={0}
                                />
                              </span>
                              <span
                                className="text-[10px] opacity-70 truncate max-w-[100px]"
                                title={`Favorite crab: ${f.favoriteCrab}`}
                              >
                                {f.favoriteCrab}
                              </span>
                              <span className="text-[10px] opacity-40 shrink-0">·</span>
                              <span
                                className="text-[10px] font-bold shrink-0"
                                style={{ color: f.online ? "#4ADE80" : "rgba(234,246,255,0.5)" }}
                              >
                                {f.online ? "online now" : f.lastActive}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 flex-wrap justify-end shrink-0">
                            <GlowButton
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setVisitingFriend(f);
                                setView("visit");
                              }}
                              title={`Visit ${f.name}'s Burrow`}
                            >
                              Visit
                            </GlowButton>
                            <GlowButton
                              variant="gold"
                              size="sm"
                              onClick={() => {
                                setGiftingFriend(f);
                                setSelectedGiftId(null);
                                setView("gift");
                              }}
                              title={`Send a style gift to ${f.name}`}
                            >
                              Gift
                            </GlowButton>
                            <button
                              onClick={() => setRemoveTarget(f)}
                              className="px-3 py-1 text-xs font-bold rounded-lg transition-all hover:-translate-y-0.5 active:scale-95"
                              style={{
                                background: "rgba(255,111,145,0.12)",
                                color: "#FF6F91",
                                border: "1px solid rgba(255,111,145,0.35)",
                              }}
                              title={`Remove ${f.name} from friends`}
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </GlassPanel>
            </>
          )}

          {/* ================= REQUESTS VIEW ================= */}
          {view === "requests" && (
            <GlassPanel className="p-3">
              <SectionTitle
                icon={<span aria-hidden>✉️</span>}
                title="Incoming Friend Requests"
                action={<span className="text-[10px] opacity-60">{pendingRequests.length} pending</span>}
              />
              {pendingRequests.length === 0 ? (
                <EmptyState
                  compact
                  message="No pending requests."
                  hint="When Shellwardens send you invites, they'll appear here."
                />
              ) : (
                <div className="space-y-2">
                  {pendingRequests.map((r) => (
                    <div
                      key={r.id}
                      className="rounded-xl p-2.5 sm:p-3 flex items-start sm:items-center gap-2.5 sm:gap-3"
                      style={{ background: "rgba(10,27,61,0.45)", border: "1px solid rgba(124,245,225,0.12)" }}
                    >
                      <Avatar name={r.fromName} size={38} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-sm font-bold truncate" style={{ color: "#EAF6FF" }}>
                            {r.fromName}
                          </span>
                          <LevelChip level={r.fromLevel} />
                          <span className="text-[9px] opacity-50">{r.sentAt}</span>
                        </div>
                        {r.message ? (
                          <div className="text-[11px] italic opacity-75 mt-0.5 leading-snug">
                            &ldquo;{r.message}&rdquo;
                          </div>
                        ) : (
                          <div className="text-[11px] opacity-55 mt-0.5">Wants to be your friend.</div>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <GlowButton variant="teal" size="sm" onClick={() => handleAccept(r)}>
                          Accept
                        </GlowButton>
                        <GlowButton variant="ghost" size="sm" onClick={() => handleDecline(r)}>
                          Decline
                        </GlowButton>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </GlassPanel>
          )}

          {/* ================= ADD-FRIEND VIEW ================= */}
          {view === "add-friend" && (
            <>
              <GlassPanel className="p-3">
                <SectionTitle
                  icon={<span aria-hidden>🔍</span>}
                  title="Find Shellwardens"
                  action={<span className="text-[10px] opacity-60">By name or ID</span>}
                />
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    setSearchResults(searchQuery.trim().length > 0 ? MOCK_SEARCH : []);
                  }}
                  className="mb-3"
                >
                  <input
                    value={searchQuery}
                    onChange={(e) => {
                      const v = e.target.value;
                      setSearchQuery(v);
                      setSearchResults(v.trim().length > 0 ? MOCK_SEARCH : []);
                    }}
                    placeholder="Search by name or Shellwarden ID…"
                    className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                    style={{
                      background: "rgba(10,27,61,0.6)",
                      border: "1px solid rgba(124,245,225,0.25)",
                      color: "#EAF6FF",
                    }}
                    aria-label="Search players by name or Shellwarden ID"
                  />
                </form>
                {searchQuery.trim().length === 0 ? (
                  <div
                    className="text-xs opacity-60 text-center py-4 rounded-xl"
                    style={{
                      background: "rgba(10,27,61,0.4)",
                      border: "1px dashed rgba(124,245,225,0.25)",
                    }}
                  >
                    Type a name or Shellwarden ID to search the reef.
                  </div>
                ) : (
                  <div className="space-y-2 max-h-64 overflow-y-auto pr-1 friends-scroll">
                    {searchResults.map((p) => {
                      const sent = sentRequestIds.includes(p.id);
                      return (
                        <div
                          key={p.id}
                          className="rounded-xl p-2.5 flex items-center gap-2.5"
                          style={{ background: "rgba(10,27,61,0.45)", border: "1px solid rgba(124,245,225,0.12)" }}
                        >
                          <Avatar name={p.name} faction={p.faction} size={34} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="text-sm font-bold truncate" style={{ color: "#EAF6FF" }}>
                                {p.name}
                              </span>
                              <LevelChip level={p.level} />
                            </div>
                            <div className="flex items-center gap-1 mt-0.5">
                              <img
                                src={FACTION_EMBLEM_ART[p.faction]}
                                alt={FACTIONS[p.faction].name}
                                width={12}
                                height={12}
                                className="object-contain"
                              />
                              <span
                                className="text-[10px] font-bold"
                                style={{ color: FACTIONS[p.faction].colors.accent }}
                              >
                                {FACTIONS[p.faction].shortName}
                              </span>
                            </div>
                          </div>
                          <GlowButton
                            size="sm"
                            variant={sent ? "ghost" : "teal"}
                            disabled={sent}
                            onClick={() => handleSendRequest(p)}
                          >
                            {sent ? "Sent ✓" : "Add"}
                          </GlowButton>
                        </div>
                      );
                    })}
                  </div>
                )}
              </GlassPanel>

              <GlassPanel className="p-3">
                <SectionTitle icon={<span aria-hidden>🆔</span>} title="Share Your ID" />
                <div
                  className="flex items-center gap-2 flex-wrap rounded-lg px-3 py-2"
                  style={{ background: "rgba(10,27,61,0.5)", border: "1px dashed rgba(124,245,225,0.3)" }}
                >
                  <span className="text-xs opacity-60 shrink-0">Your ID:</span>
                  <span className="text-sm font-bold tracking-wide" style={{ color: "#7CF5E1" }}>
                    {myShellId}
                  </span>
                  <GlowButton size="sm" variant="ghost" className="ml-auto" onClick={handleCopyId}>
                    📋 Copy
                  </GlowButton>
                </div>
                <div className="text-[10px] opacity-60 mt-2">
                  You can hold up to {MAX_FRIENDS} friends.
                </div>
              </GlassPanel>
            </>
          )}

          {/* ================= VISIT VIEW ================= */}
          {view === "visit" &&
            (vf ? (
              <>
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <GlowButton variant="ghost" size="sm" onClick={backToFriends}>
                    ← Back to Friends
                  </GlowButton>
                  <span className="text-[10px] opacity-60">Public profile preview</span>
                </div>

                <GlassPanel className="p-3 flex items-center gap-3" glow="rgba(18,167,160,0.25)">
                  <Avatar name={vf.name} faction={vf.faction} online={vf.online} size={44} />
                  <div className="flex-1 min-w-0">
                    <div
                      className="text-sm sm:text-base font-bold truncate"
                      style={{ fontFamily: "Fredoka, system-ui, sans-serif", color: "#7CF5E1" }}
                    >
                      Visiting {vf.name}&apos;s Burrow
                    </div>
                    <div className="text-[10px] opacity-70 truncate">
                      Lv {vf.level} · {FACTIONS[vf.faction].name} ·{" "}
                      {vf.online ? "online now" : `last active ${vf.lastActive}`}
                      {vf.mutualClan ? ` · ⚓ ${vf.mutualClan}` : ""}
                    </div>
                  </div>
                  <img
                    src={FACTION_EMBLEM_ART[vf.faction]}
                    alt={FACTIONS[vf.faction].name}
                    width={28}
                    height={28}
                    className="object-contain shrink-0"
                    style={{ filter: `drop-shadow(0 0 5px ${FACTIONS[vf.faction].colors.accent})` }}
                  />
                </GlassPanel>

                <BurrowScene friend={vf} />

                <GlassPanel className="p-3">
                  <SectionTitle
                    icon={<span aria-hidden>🦀</span>}
                    title="Showcase — Favorite Crabs"
                    action={<span className="text-[10px] opacity-60">{vf.favoriteCrab} bloodline</span>}
                  />
                  <div className="grid grid-cols-3 gap-2">
                    {showcaseFor(vf).map((c) => (
                      <ShowcaseCard key={c.name} crab={c} faction={vf.faction} />
                    ))}
                  </div>
                </GlassPanel>

                <div className="flex flex-wrap gap-2">
                  <GlowButton variant="ghost" size="md" onClick={handleWave}>
                    Wave 👋
                  </GlowButton>
                  <GlowButton variant="teal" size="md" onClick={handleCompliment}>
                    Leave a compliment
                  </GlowButton>
                </div>
              </>
            ) : (
              <EmptyState
                message="No Burrow selected."
                hint="Pick a friend to visit their tide-dome."
                cta={
                  <GlowButton size="sm" onClick={backToFriends}>
                    ← Back to Friends
                  </GlowButton>
                }
              />
            ))}

          {/* ================= GIFT VIEW ================= */}
          {view === "gift" &&
            (gf ? (
              <>
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <GlowButton variant="ghost" size="sm" onClick={backToFriends}>
                    ← Back to Friends
                  </GlowButton>
                  <span
                    className="text-[10px] font-bold"
                    style={{ color: giftsRemaining > 0 ? "#FFD166" : "#FF6F91" }}
                  >
                    🎁 {DAILY_GIFT_LIMIT} gifts per day ({giftsRemaining} remaining)
                  </span>
                </div>

                {/* CRITICAL RULE — styles only, anti-RMT */}
                <GlassPanel
                  className="p-3"
                  glow="rgba(255,111,145,0.28)"
                  style={{ background: "rgba(255,111,145,0.08)", border: "1px solid rgba(255,111,145,0.4)" }}
                >
                  <div className="flex items-start gap-2.5">
                    <span className="text-xl shrink-0" aria-hidden>
                      🛡️
                    </span>
                    <div>
                      <div
                        className="text-xs font-bold"
                        style={{ color: "#FF6F91", fontFamily: "Fredoka, system-ui, sans-serif" }}
                      >
                        Gifting is for STYLES only
                      </div>
                      <div className="text-[11px] leading-snug opacity-90 mt-0.5">
                        Gifting is for STYLES only (frames, dances, trails, decor). You can NEVER gift
                        crabs, eggs, GOLD, or anything that affects gameplay power. This keeps trading
                        fair.
                      </div>
                    </div>
                  </div>
                </GlassPanel>

                {/* Gifting-to banner */}
                <GlassPanel className="p-3 flex items-center gap-3">
                  <Avatar name={gf.name} faction={gf.faction} online={gf.online} size={40} />
                  <div className="flex-1 min-w-0">
                    <div className="text-[10px] uppercase tracking-wide opacity-60">Gifting to</div>
                    <div className="text-sm font-bold truncate" style={{ color: "#7CF5E1" }}>
                      {gf.name} · Lv {gf.level}
                    </div>
                  </div>
                  <span className="text-[10px] font-bold flex items-center gap-0.5 shrink-0" style={{ color: "#FFD166" }}>
                    <GoldIcon size={11} /> {formatGold(playerGold)}
                  </span>
                </GlassPanel>

                {/* Style gift catalog */}
                <GlassPanel className="p-3">
                  <SectionTitle
                    icon={<span aria-hidden>🎁</span>}
                    title="Style Gift Catalog"
                    action={
                      <span
                        className="flex items-center gap-1"
                        title={`${giftsSentToday} of ${DAILY_GIFT_LIMIT} daily gifts sent`}
                      >
                        {Array.from({ length: DAILY_GIFT_LIMIT }).map((_, i) => (
                          <span
                            key={i}
                            className="rounded-full"
                            style={{
                              width: 7,
                              height: 7,
                              background: i < giftsSentToday ? "#FFD166" : "rgba(255,255,255,0.18)",
                              boxShadow: i < giftsSentToday ? "0 0 5px rgba(255,209,102,0.6)" : "none",
                            }}
                          />
                        ))}
                      </span>
                    }
                  />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {GIFT_CATALOG.map((item) => {
                      const affordable = playerGold >= item.price;
                      const soldOut = giftsRemaining <= 0;
                      const selected = selectedGiftId === item.id;
                      return (
                        <div
                          key={item.id}
                          className="rounded-xl p-2.5 sm:p-3 flex items-center gap-2.5"
                          style={{
                            background: selected
                              ? "linear-gradient(135deg, rgba(124,245,225,0.14), rgba(10,27,61,0.5))"
                              : "rgba(10,27,61,0.45)",
                            border: `1px solid ${selected ? "rgba(124,245,225,0.55)" : "rgba(124,245,225,0.14)"}`,
                            boxShadow: selected ? "0 0 14px rgba(124,245,225,0.25)" : "none",
                          }}
                        >
                          <span
                            className="shrink-0 flex items-center justify-center rounded-lg text-xl sm:text-2xl"
                            style={{
                              width: 42,
                              height: 42,
                              background: `${item.color}1f`,
                              border: `1px solid ${item.color}55`,
                              filter: `drop-shadow(0 0 5px ${item.color}66)`,
                            }}
                            aria-hidden
                          >
                            {item.emoji}
                          </span>
                          <div className="flex-1 min-w-0">
                            <div
                              className="text-[9px] uppercase tracking-wide font-bold"
                              style={{ color: item.color }}
                            >
                              {item.category}
                            </div>
                            <div className="text-sm font-bold truncate">{item.name}</div>
                            <div className="text-[10px] opacity-60 truncate" title={item.description}>
                              {item.description}
                            </div>
                            <div
                              className="text-[11px] font-bold flex items-center gap-0.5 mt-0.5"
                              style={{ color: "#FFD166" }}
                            >
                              <GoldIcon size={11} /> {formatGold(item.price)}
                            </div>
                          </div>
                          <GlowButton
                            variant="gold"
                            size="sm"
                            disabled={soldOut || !affordable}
                            onClick={() => openGiftConfirm(item)}
                            title={
                              soldOut
                                ? "Daily gift limit reached"
                                : !affordable
                                  ? `Need ${formatGold(item.price)} GOLD`
                                  : `Gift ${item.name}`
                            }
                          >
                            Gift
                          </GlowButton>
                        </div>
                      );
                    })}
                  </div>
                  <div className="text-[10px] text-center opacity-65 mt-2.5">
                    ❌ Never giftable: Crabs · Eggs · GOLD · Power items — style gifts only.
                  </div>
                </GlassPanel>

                {/* Gift history */}
                <GlassPanel className="p-3">
                  <SectionTitle
                    icon={<span aria-hidden>🗂️</span>}
                    title="Gift History"
                    action={<span className="text-[10px] opacity-60">Styles only</span>}
                  />
                  <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1 friends-scroll">
                    {giftHistory.map((h) => (
                      <div
                        key={h.id}
                        className="flex items-center gap-2 rounded-lg px-2.5 py-1.5"
                        style={{ background: "rgba(10,27,61,0.4)", border: "1px solid rgba(124,245,225,0.12)" }}
                      >
                        <span aria-hidden>{h.direction === "sent" ? "📤" : "📥"}</span>
                        <span className="text-[11px] flex-1 min-w-0 truncate">{h.text}</span>
                        <span className="text-[9px] opacity-60 shrink-0">({h.ago})</span>
                      </div>
                    ))}
                  </div>
                </GlassPanel>
              </>
            ) : (
              <EmptyState
                message="Select a friend to gift."
                hint="Style gifts only — frames, dances, trails, and decor."
                cta={
                  <GlowButton size="sm" onClick={backToFriends}>
                    ← Back to Friends
                  </GlowButton>
                }
              />
            ))}

          {/* ================= FOOTER ================= */}
        </div>

        {/* Modal footer */}
        <div
          className="px-4 sm:px-6 py-3 border-t safe-area-bottom"
          style={{ borderColor: "rgba(124,245,225,0.15)", background: "rgba(6,18,43,0.6)" }}
        >
          <div className="flex flex-col sm:flex-row sm:items-center gap-2.5">
            <div className="text-[10px] opacity-65 leading-relaxed min-w-0">
              <div>🎁 Friend codes give you both 200 GOLD when your friend reaches Level 5.</div>
              <div>🛡️ Gifting is styles-only. RMT (real-money trading) is banned.</div>
            </div>
            <GlowButton variant="ghost" size="sm" onClick={onClose} className="sm:ml-auto shrink-0">
              Close
            </GlowButton>
          </div>
        </div>
      </div>

      {/* Remove-friend confirm */}
      {removeTarget && (
        <ConfirmDialog
          icon="💔"
          title="Remove Friend"
          message={`Remove ${removeTarget.name} from your friends list? You can re-add them anytime with a new request.`}
          confirmLabel="Remove"
          confirmVariant="rose"
          onConfirm={handleRemoveFriend}
          onCancel={() => setRemoveTarget(null)}
        />
      )}

      {/* Gift confirm — styles only, GOLD sink */}
      {confirmGift && gf && (
        <ConfirmDialog
          icon="🎁"
          title="Send Gift?"
          message={`Send ${confirmGift.name} to ${gf.name} for ${formatGold(confirmGift.price)} GOLD? Style gifts are permanent and cannot be refunded.`}
          confirmLabel="Send Gift"
          confirmVariant="gold"
          onConfirm={handleConfirmGift}
          onCancel={() => {
            setConfirmGift(null);
            setSelectedGiftId(null);
          }}
        />
      )}
    </div>
  );
}
