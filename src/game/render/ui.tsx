// Crabtopia - UI helper utilities & shared primitives
// Formatters + reusable visual components (GlassPanel, GlowButton, GradientCard,
// CountdownRing, RarityBadge, FactionBadge, ClassIcon, GoldIcon, StatChip).

import React from "react";
import { FactionId, ClassId, Rarity } from "../types";
import { FACTIONS } from "../content/factions";
import { CLASSES } from "../content/classes";
import { RARITY_COLORS, RARITY_GLOW } from "../content/bodyparts";

// ---------- FORMATTERS ----------

export function formatTime(ms: number): string {
  if (ms <= 0) return "Ready";
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  const d = Math.floor(h / 24);
  return `${d}d ${h % 24}h`;
}

export function formatGold(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 10_000) return `${(n / 1000).toFixed(1)}K`;
  return Math.round(n).toLocaleString();
}

export function formatBP(bp: number): string {
  if (bp >= 10000) return `${(bp / 1000).toFixed(1)}K`;
  return bp.toLocaleString();
}

// ---------- COLOR / ASSET MAPS ----------

export function factionColor(f: FactionId): string {
  return FACTIONS[f].colors.primary;
}
export function factionAccent(f: FactionId): string {
  return FACTIONS[f].colors.accent;
}
export function factionBg(f: FactionId): string {
  return FACTIONS[f].colors.dark;
}
export function rarityColor(r: Rarity): string {
  return RARITY_COLORS[r];
}
export function rarityGlow(r: Rarity): string {
  return RARITY_GLOW[r];
}

// Class -> PNG art asset mapping (used across the app). Canonical
// definition lives in data/classArt.ts; re-exported here for the
// existing import paths.
export { CLASS_ART } from "../data/classArt";

export const FACTION_EMBLEM_ART: Record<FactionId, string> = {
  coral_court: "/art/ui/emblem-coral.png",
  cinderreef: "/art/ui/emblem-cinder.png",
  frostshelf: "/art/ui/emblem-frost.png",
  mangrove: "/art/ui/emblem-mangrove.png",
  stormwake: "/art/ui/emblem-storm.png",
  moonpool: "/art/ui/emblem-moon.png",
};

export const FACTION_BIOME_ART: Record<FactionId, string> = {
  coral_court: "/art/biome-coral.png",
  cinderreef: "/art/biome-cinder.png",
  frostshelf: "/art/biome-frost.png",
  mangrove: "/art/biome-mangrove.png",
  stormwake: "/art/biome-storm.png",
  moonpool: "/art/biome-moon.png",
};

export function classArt(c: ClassId): string {
  return CLASS_ART[c] ?? "/art/crabs/rookie-kelp.png";
}

export function classIcon(c: ClassId): string {
  return CLASSES[c].icon;
}

export function emblemArt(f: FactionId): string {
  return FACTION_EMBLEM_ART[f];
}

export function biomeImage(f: FactionId): string {
  return FACTION_BIOME_ART[f];
}

// ---------- SHARED PRIMITIVES ----------

// GlassPanel - frosted underwater glass card with subtle teal tint.
export function GlassPanel({
  children,
  className = "",
  glow,
  style,
}: {
  children: React.ReactNode;
  className?: string;
  glow?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className={`rounded-2xl ${className}`}
      style={{
        background: "rgba(18,167,160,0.08)",
        border: "1px solid rgba(124,245,225,0.2)",
        backdropFilter: "blur(8px)",
        boxShadow: glow ? `0 0 24px ${glow}` : undefined,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

// GradientCard - faction-tinted card with hover lift.
export function GradientCard({
  children,
  faction,
  selected = false,
  className = "",
  onClick,
  style,
}: {
  children: React.ReactNode;
  faction?: FactionId;
  selected?: boolean;
  className?: string;
  onClick?: () => void;
  style?: React.CSSProperties;
}) {
  const accent = faction ? FACTIONS[faction].colors.accent : "#7CF5E1";
  const primary = faction ? FACTIONS[faction].colors.primary : "#12A7A0";
  const dark = faction ? FACTIONS[faction].colors.dark : "#0A1B3D";
  return (
    <div
      onClick={onClick}
      className={`relative rounded-2xl overflow-hidden transition-all duration-200 ${className} ${
        onClick ? "cursor-pointer hover:-translate-y-1 hover:shadow-2xl active:scale-[0.98]" : ""
      }`}
      style={{
        background: `linear-gradient(160deg, ${dark}cc 0%, ${primary}1f 100%)`,
        border: `2px solid ${selected ? accent : primary + "55"}`,
        boxShadow: selected ? `0 0 24px ${accent}66` : `0 2px 12px ${dark}55`,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

// GlowButton - CTA button with gradient and glow.
export function GlowButton({
  children,
  onClick,
  variant = "teal",
  disabled = false,
  className = "",
  size = "md",
  type = "button",
  title,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: "teal" | "gold" | "rose" | "ghost" | "violet";
  disabled?: boolean;
  className?: string;
  size?: "sm" | "md" | "lg";
  type?: "button" | "submit";
  title?: string;
}) {
  const palettes: Record<string, { bg: string; color: string; glow: string }> = {
    teal: { bg: "linear-gradient(135deg, #12A7A0, #0A4A66)", color: "#EAF6FF", glow: "rgba(18,167,160,0.45)" },
    gold: { bg: "linear-gradient(135deg, #FFD166, #FF7A1A)", color: "#0A1B3D", glow: "rgba(255,209,102,0.5)" },
    rose: { bg: "linear-gradient(135deg, #FF6F91, #C026D3)", color: "#FFFFFF", glow: "rgba(255,111,145,0.45)" },
    violet: { bg: "linear-gradient(135deg, #7A5CFF, #5C7CFF)", color: "#FFFFFF", glow: "rgba(122,92,255,0.45)" },
    ghost: { bg: "rgba(255,255,255,0.06)", color: "#EAF6FF", glow: "transparent" },
  };
  const p = palettes[variant];
  const sizes = {
    sm: "px-3 py-1 text-xs rounded-lg",
    md: "px-4 py-2 text-sm rounded-xl",
    lg: "px-6 py-3 text-base rounded-xl",
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`font-bold transition-all duration-150 hover:-translate-y-0.5 hover:shadow-xl active:scale-95 disabled:opacity-40 disabled:hover:translate-y-0 disabled:hover:shadow-none ${sizes[size]} ${className}`}
      style={{
        background: p.bg,
        color: p.color,
        boxShadow: disabled ? "none" : `0 4px 16px ${p.glow}`,
        border: variant === "ghost" ? "1px solid rgba(124,245,225,0.25)" : "none",
      }}
    >
      {children}
    </button>
  );
}

// CountdownRing - SVG circular progress with optional label inside.
export function CountdownRing({
  progress,
  size = 56,
  stroke = 5,
  color = "#7CF5E1",
  trackColor = "rgba(255,255,255,0.12)",
  label,
  glow,
}: {
  progress: number; // 0..1
  size?: number;
  stroke?: number;
  color?: string;
  trackColor?: string;
  label?: React.ReactNode;
  glow?: boolean;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(1, progress));
  const dash = c * clamped;
  return (
    <div
      className="relative flex items-center justify-center"
      style={{ width: size, height: size, filter: glow ? `drop-shadow(0 0 6px ${color})` : undefined }}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={trackColor} strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c - dash}`}
          style={{ transition: "stroke-dasharray 0.4s ease" }}
        />
      </svg>
      {label !== undefined && (
        <div className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-white/90">
          {label}
        </div>
      )}
    </div>
  );
}

// RarityBadge - colored pill for rarity tier.
export function RarityBadge({ rarity, className = "" }: { rarity: Rarity; className?: string }) {
  const c = RARITY_COLORS[rarity];
  return (
    <span
      className={`inline-block px-1.5 py-0.5 rounded-md text-[9px] uppercase font-bold tracking-wide ${className}`}
      style={{ background: c + "22", color: c, border: `1px solid ${c}55` }}
    >
      {rarity}
    </span>
  );
}

// FactionBadge - small chip with emblem image + faction name.
export function FactionBadge({
  faction,
  size = 16,
  showName = false,
  glow = false,
}: {
  faction: FactionId;
  size?: number;
  showName?: boolean;
  glow?: boolean;
}) {
  const f = FACTIONS[faction];
  return (
    <span className="inline-flex items-center gap-1">
      <img
        src={FACTION_EMBLEM_ART[faction]}
        alt={f.name}
        width={size}
        height={size}
        style={{ filter: glow ? `drop-shadow(0 0 4px ${f.colors.accent})` : undefined }}
        className="object-contain"
      />
      {showName && (
        <span className="text-[10px] font-bold" style={{ color: f.colors.accent }}>
          {f.shortName}
        </span>
      )}
    </span>
  );
}

// ClassIcon - emoji glyph in a small tinted chip.
export function ClassIcon({ classId, size = 18 }: { classId: ClassId; size?: number }) {
  const c = CLASSES[classId];
  return (
    <span
      className="inline-flex items-center justify-center rounded-md"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.6,
        background: "rgba(255,255,255,0.06)",
        border: "1px solid rgba(124,245,225,0.18)",
      }}
      title={c.name}
    >
      {c.icon}
    </span>
  );
}

// GoldIcon - the gold-coin PNG as an inline image.
export function GoldIcon({ size = 16, className = "" }: { size?: number; className?: string }) {
  return (
    <img
      src="/art/ui/gold-coin.png"
      alt="GOLD"
      width={size}
      height={size}
      className={`object-contain inline-block align-middle ${className}`}
      style={{ verticalAlign: "middle" }}
    />
  );
}

// StatChip - compact rounded stat display.
export function StatChip({
  label,
  value,
  color = "#7CF5E1",
  icon,
}: {
  label: string;
  value: React.ReactNode;
  color?: string;
  icon?: React.ReactNode;
}) {
  return (
    <div
      className="rounded-xl px-2.5 py-1.5 flex items-center gap-1.5 min-w-0"
      style={{
        background: "rgba(10,27,61,0.55)",
        border: "1px solid rgba(124,245,225,0.18)",
      }}
    >
      {icon && (
        <span className="shrink-0 flex items-center justify-center" style={{ width: 16, height: 16 }}>
          {icon}
        </span>
      )}
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-wide text-white/60 leading-tight">{label}</div>
        <div className="text-sm font-bold leading-tight truncate font-display" style={{ color }}>
          {value}
        </div>
      </div>
    </div>
  );
}

// BreedDots - ●●●○○ for breed count
export function BreedDots({ count, max = 5 }: { count: number; max?: number }) {
  return (
    <span className="inline-flex gap-0.5" title={`Breed count: ${count}/${max}`}>
      {Array.from({ length: max }).map((_, i) => (
        <span
          key={i}
          className="inline-block rounded-full"
          style={{
            width: 6,
            height: 6,
            background: i < count ? "#FFD166" : "rgba(255,255,255,0.18)",
          }}
        />
      ))}
    </span>
  );
}

// MasteryStars - small ★ row
export function MasteryStars({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="inline-flex" title={`Mastery: ${count}`}>
      {Array.from({ length: Math.min(3, count) }).map((_, i) => (
        <span key={i} className="text-[9px]" style={{ color: "#FFD166" }}>
          ★
        </span>
      ))}
    </span>
  );
}

// PlanktonField - CSS-only floating particle backdrop (decorative).
export function PlanktonField({ count = 12, className = "" }: { count?: number; className?: string }) {
  return (
    <div className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`} aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => {
        const left = (i * 37 + 11) % 100;
        const top = (i * 53 + 7) % 100;
        const dur = 7 + (i % 5);
        const delay = (i % 4) * 1.2;
        const sz = 3 + (i % 4) * 2;
        const hue = ["#7CF5E1", "#FFD166", "#5C7CFF", "#FF6F91"][i % 4];
        return (
          <span
            key={i}
            className="absolute rounded-full plankton-dot"
            style={{
              left: `${left}%`,
              top: `${top}%`,
              width: sz,
              height: sz,
              background: hue,
              opacity: 0.45,
              boxShadow: `0 0 6px ${hue}`,
              animation: `planktonFloat ${dur}s ease-in-out ${delay}s infinite`,
            }}
          />
        );
      })}
    </div>
  );
}

// SectionTitle - consistent section heading.
export function SectionTitle({ icon, title, action }: { icon?: React.ReactNode; title: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-2">
      <h2 className="text-sm md:text-base font-bold flex items-center gap-1.5" style={{ fontFamily: "Fredoka, system-ui, sans-serif" }}>
        {icon && <span>{icon}</span>}
        <span>{title}</span>
      </h2>
      {action}
    </div>
  );
}

// EmptyState - centered empty-state illustration + message.
export function EmptyState({
  message,
  hint,
  cta,
  compact = false,
}: {
  message: string;
  hint?: string;
  cta?: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={`text-center ${compact ? "py-3 px-3" : "py-6 px-4"} rounded-2xl`} style={{ background: "rgba(10,27,61,0.4)", border: "1px dashed rgba(124,245,225,0.25)" }}>
      {!compact && (
        <img
          src="/art/ui/empty-state.png"
          alt=""
          width={72}
          height={72}
          className="mx-auto mb-2 opacity-80"
          style={{ filter: "drop-shadow(0 4px 12px rgba(124,245,225,0.25))" }}
        />
      )}
      <div className="text-sm font-bold" style={{ color: "#FFD166" }}>
        {message}
      </div>
      {hint && <div className="text-xs opacity-70 mt-1">{hint}</div>}
      {cta && <div className="mt-2">{cta}</div>}
    </div>
  );
}
