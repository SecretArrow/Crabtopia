// Crabtopia - Crab Renderer (preview art).
// ---------------------------------------------------------------------------
// Previews render the crab as a LIVING sprite: its own per-class
// battle sheet playing the idle clip (LivingCrab), wrapped in the
// element aura + faction backdrop + optional emblem/halo chrome.
// Every caller (Crab cards, detail modal, hall, bazaar, nursery,
// teams, map, raids) renders the living sprite. The legacy `animate`
// prop was removed in Phase 4 — it claimed a frozen render the
// component never produced; previews are always alive (the only
// frozen render is prefers-reduced-motion, honoured inside
// AnimatedCrab). `pose` lets showcase contexts pick a livelier
// looping clip (e.g. the home hero walks in place).
//
// Sizes: named sizes are viewport-stepped tokens (see SIZE_MAP:
// small/medium/large/full × phone/tablet/desktop), or any number via
// `size` for caller-explicit contexts.

"use client";

import { useEffect, useState } from "react";
import { Crab } from "../types";
import { FACTIONS } from "../content/factions";
import { CLASSES } from "../content/classes";
import { getGeneVariant, BODY_PART_SLOTS } from "../content/bodyparts";
import { FACTION_EMBLEM_ART } from "./ui";
import LivingCrab from "../animation/LivingCrab";
import type { AnimState } from "../animation/stateMachine";
import ElementAura from "./ElementAura";

type RenderSize = "small" | "medium" | "large" | "full" | number;

interface Props {
  crab: Crab;
  size?: RenderSize;
  /** Looping clip for showcase contexts (default idle). */
  pose?: AnimState;
  className?: string;
  showEmblem?: boolean;
  showLegendaryGlow?: boolean;
  onClick?: () => void;
}

// Named sizes are RESPONSIVE STEPS [phone <768, tablet <1280, desktop]:
// one coherent token system so characters stay generously sized on
// every device instead of shrinking to a fixed desktop-era pixel size
// on phones (the old fixed map rendered the same 56px "small" on a
// 360px phone as on a 1920px monitor). Numeric `size` props stay
// caller-explicit and are audited per call site.
const SIZE_MAP: Record<string, [number, number, number]> = {
  small: [64, 72, 80],
  medium: [104, 120, 136],
  large: [160, 184, 208],
  full: [224, 272, 320],
};

function viewportTier(): 0 | 1 | 2 {
  if (typeof window === "undefined") return 1;
  return window.innerWidth < 768 ? 0 : window.innerWidth < 1280 ? 1 : 2;
}

function useViewportTier(): 0 | 1 | 2 {
  const [tier, setTier] = useState<0 | 1 | 2>(viewportTier);
  useEffect(() => {
    const onResize = () => setTier(viewportTier());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return tier;
}

export default function CrabRenderer({
  crab,
  size = "medium",
  pose = "idle",
  className,
  showEmblem = false,
  showLegendaryGlow = true,
  onClick,
}: Props) {
  const tier = useViewportTier();
  const px =
    typeof size === "number" ? size : (SIZE_MAP[size] ?? SIZE_MAP.medium)[tier];
  const faction = FACTIONS[crab.faction];
  const classDef = CLASSES[crab.classId];

  // Determine highest rarity among dominant genes for legendary detection.
  let highestRarity: "common" | "uncommon" | "rare" | "epic" | "legendary" = "common";
  for (const slot of BODY_PART_SLOTS) {
    const v = getGeneVariant(slot, crab.genes[slot].D);
    if (v) {
      const order = ["common", "uncommon", "rare", "epic", "legendary"] as const;
      if (order.indexOf(v.rarity) > order.indexOf(highestRarity)) {
        highestRarity = v.rarity;
      }
    }
  }
  const isLegendary = highestRarity === "legendary";

  const emblemSize = Math.max(14, Math.round(px * 0.22));

  return (
    <div
      className={`relative inline-flex items-center justify-center ${className ?? ""}`}
      style={{ width: px, height: px }}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      aria-label={`${crab.name}, ${faction.name} ${classDef.name}`}
      data-testid="crab-renderer"
    >
      {/* Element aura layer — behind everything, art untouched */}
      <ElementAura crab={crab} />

      {/* Legendary halo */}
      {isLegendary && showLegendaryGlow && (
        <div
          className="absolute inset-0 rounded-full pointer-events-none"
          style={{
            background:
              "radial-gradient(circle, rgba(255,209,102,0.45) 0%, rgba(255,209,102,0.12) 45%, transparent 70%)",
            animation: "glowPulse 2.4s ease-in-out infinite",
          }}
          aria-hidden="true"
        />
      )}

      {/* Faction-tinted backdrop disk */}
      <div
        className="absolute rounded-full pointer-events-none"
        style={{
          inset: px * 0.08,
          background: `radial-gradient(circle, ${faction.colors.primary}33 0%, ${faction.colors.dark}55 60%, transparent 75%)`,
        }}
        aria-hidden="true"
      />

      {/* The crab — its own original per-class art (transparent) */}
      <div
        className="relative select-none"
        style={{
          filter: isLegendary
            ? `drop-shadow(0 0 6px ${faction.colors.accent}) drop-shadow(0 0 10px rgba(255,209,102,0.45))`
            : `drop-shadow(0 2px 6px rgba(0,0,0,0.4))`,
        }}
      >
        <LivingCrab crab={crab} size={px} state={pose} />
      </div>

      {/* Faction emblem badge (corner) */}
      {showEmblem && (
        <img
          src={FACTION_EMBLEM_ART[crab.faction]}
          alt={`${faction.name} emblem`}
          width={emblemSize}
          height={emblemSize}
          draggable={false}
          className="absolute object-contain"
          style={{
            right: -Math.round(px * 0.04),
            bottom: -Math.round(px * 0.02),
            filter: `drop-shadow(0 1px 3px rgba(0,0,0,0.6))`,
          }}
        />
      )}
    </div>
  );
}
