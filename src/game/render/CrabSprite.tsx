// Crabtopia - CrabSprite (preview art)
// ---------------------------------------------------------------------------
// HISTORY: this component used to compose a crab from layered procedural
// SVG shapes (the "blob" look), then rendered the static per-class
// portrait. Previews now render the crab as a LIVING sprite — its own
// per-class battle sheet playing the idle clip (LivingCrab) — so no
// preview anywhere is a stiff still image.
//
// The public props API is UNCHANGED so every caller (arena menu avatar &
// Top Crabs, team builder, breeding, exploration, inventory, leaderboards,
// loading screens…) upgraded automatically. `animated` and `rigPose` are
// still accepted for API compatibility; previews are always alive now
// (prefers-reduced-motion excepted, honoured inside AnimatedCrab).

"use client";

import React from "react";
import type { Crab, Rarity } from "../types";
import { FACTIONS } from "../content/factions";
import { CLASSES } from "../content/classes";
import {
  BODY_PART_SLOTS,
  RARITY_COLORS,
  RARITY_GLOW,
  getGeneVariant,
} from "../content/bodyparts";
import LivingCrab from "../animation/LivingCrab";
import ElementAura from "./ElementAura";

// ----------------------------------------------------------------------------
// Legend (shown when showLegend=true)
// ----------------------------------------------------------------------------

function renderLegend(crab: Crab): React.ReactNode {
  return (
    <div className="mt-2 grid grid-cols-3 gap-1 text-[9px] leading-tight" aria-label="Body part legend">
      {BODY_PART_SLOTS.map((slot) => {
        const gene = crab.genes[slot];
        const variant = getGeneVariant(slot, gene.D);
        const rarity: Rarity = variant?.rarity ?? "common";
        const color = RARITY_COLORS[rarity];
        return (
          <div
            key={slot}
            className="flex items-center gap-1 rounded px-1 py-0.5"
            style={{ background: `${color}22`, border: `1px solid ${color}55` }}
            title={`${slot} · ${variant?.label ?? "unknown"} · ${rarity}`}
          >
            <span
              className="inline-block h-2 w-2 rounded-full flex-shrink-0"
              style={{ background: color, boxShadow: `0 0 4px ${RARITY_GLOW[rarity]}` }}
            />
            <span className="truncate text-white/80 capitalize">{slot}</span>
          </div>
        );
      })}
    </div>
  );
}

// ----------------------------------------------------------------------------
// Placeholder (crab null/undefined) — the game's empty-state art, not an SVG.
// ----------------------------------------------------------------------------

function PlaceholderSprite({ size }: { size: number }): React.ReactNode {
  return (
    <img
      src="/art/ui/empty-crab.png"
      alt="Empty crab slot"
      width={size}
      height={size}
      draggable={false}
      className="object-contain opacity-70"
      style={{ width: size, height: size }}
    />
  );
}

// ----------------------------------------------------------------------------
// Main component
// ----------------------------------------------------------------------------

export interface CrabSpriteProps {
  crab: Crab | null | undefined;
  size?: number;
  animated?: boolean;
  showLegend?: boolean;
  className?: string;
  /**
   * Legacy puppet-rig pose hook (kept for API compatibility with
   * PuppetCrab). Ignored by the sheet renderer.
   */
  rigPose?: import("../animation/puppetRig").RigPose;
}

export default function CrabSprite({
  crab,
  size = 120,
  showLegend = false,
  className,
}: CrabSpriteProps): React.ReactNode {
  if (!crab) {
    return (
      <div
        className={className}
        data-testid="crab-sprite"
        style={{ width: size, height: size }}
      >
        <PlaceholderSprite size={size} />
        {showLegend && (
          <div className="mt-2 text-[9px] text-white/50">No crab data</div>
        )}
      </div>
    );
  }

  return (
    <div
      className={className}
      data-testid="crab-sprite"
      role="img"
      aria-label={`${crab.name} — ${FACTIONS[crab.faction].name} ${CLASSES[crab.classId].name}`}
      style={{ display: "inline-flex", flexDirection: "column", alignItems: "center" }}
    >
      <div className="relative" style={{ width: size, height: size }}>
        {/* Element aura layer — behind the crab, art untouched */}
        <ElementAura crab={crab} />
        <div className="absolute inset-0 flex items-center justify-center">
          <LivingCrab crab={crab} size={size} />
        </div>
      </div>
      {showLegend && renderLegend(crab)}
    </div>
  );
}
