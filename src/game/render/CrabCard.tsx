// Crabtopia - Unified Crab Card component.
// Compact reusable card showing: class art, name, faction emblem,
// class icon badge, BP (gold), purity, breed count dots, level, mastery stars.
// Hover lifts with faction glow; click opens CrabDetailModal.

"use client";

import { useState } from "react";
import { Crab } from "../types";
import { FACTIONS } from "../content/factions";
import { CLASSES } from "../content/classes";
import { BREEDS_BY_ID } from "../content/breeds";
import { crabBaseBP } from "../engine/bp";
import {
  formatBP,
  RarityBadge,
  FactionBadge,
  ClassIcon,
  BreedDots,
  MasteryStars,
  GoldIcon,
} from "./ui";
import CrabRenderer from "./CrabRenderer";
import ElementBadge from "./ElementBadge";
import { RARITY_COLORS, getGeneVariant, BODY_PART_SLOTS } from "../content/bodyparts";
import CrabDetailModal from "./CrabDetailModal";

interface Props {
  crab: Crab;
  onClick?: () => void;
  compact?: boolean;
  selected?: boolean;
  showStats?: boolean;
  size?: number; // image px override
}

export default function CrabCard({
  crab,
  onClick,
  compact = false,
  selected = false,
  showStats = true,
  size,
}: Props) {
  const faction = FACTIONS[crab.faction];
  const classDef = CLASSES[crab.classId];
  const breed = BREEDS_BY_ID[crab.breedId];
  const bp = crabBaseBP(crab);
  const [showDetail, setShowDetail] = useState(false);

  // dominant rarity
  let topRarity: "common" | "uncommon" | "rare" | "epic" | "legendary" = "common";
  const order = ["common", "uncommon", "rare", "epic", "legendary"] as const;
  for (const slot of BODY_PART_SLOTS) {
    const v = getGeneVariant(slot, crab.genes[slot].D);
    if (v && order.indexOf(v.rarity) > order.indexOf(topRarity)) topRarity = v.rarity;
  }

  const imgSize = size ?? (compact ? 96 : 140);

  const handleClick = () => {
    if (onClick) {
      onClick();
    } else {
      setShowDetail(true);
    }
  };

  return (
    <>
      <button
        onClick={handleClick}
        className={`crab-card relative w-full rounded-2xl overflow-hidden text-left transition-all duration-200 hover:-translate-y-1 hover:shadow-2xl active:scale-[0.97] focus:outline-none rarity-card rarity-${topRarity}`}
        style={{
          background: `linear-gradient(180deg, ${faction.colors.dark}f0 0%, ${faction.colors.primary}22 100%)`,
          border: `2px solid ${selected ? faction.colors.accent : faction.colors.primary + "55"}`,
          boxShadow: selected
            ? `0 0 22px ${faction.colors.accent}66`
            : `0 2px 10px rgba(0,0,0,0.35)`,
        }}
        aria-label={`${crab.name}, ${faction.name} ${classDef.name}, ${formatBP(bp)} BP`}
      >
        {/* Rarity inner frame */}
        {topRarity !== "common" && (
          <div
            className="absolute inset-0 pointer-events-none rounded-2xl"
            style={{
              boxShadow: `inset 0 0 14px ${RARITY_COLORS[topRarity]}55`,
              border: `1px solid ${RARITY_COLORS[topRarity]}aa`,
            }}
          />
        )}

        {/* Faction emblem badge top-right */}
        <div className="absolute top-1.5 right-1.5 z-10">
          <FactionBadge faction={crab.faction} size={compact ? 14 : 18} />
        </div>

        {/* Class icon badge top-left */}
        <div className="absolute top-1.5 left-1.5 z-10">
          <ClassIcon classId={crab.classId} size={compact ? 14 : 18} />
        </div>

        {/* Activity ribbon */}
        {crab.activity !== "idle" && (
          <div
            className="absolute top-1/2 left-0 -translate-y-1/2 z-10 px-1 py-0.5 text-[8px] uppercase font-bold tracking-wide"
            style={{
              background: faction.colors.accent,
              color: "#0A1B3D",
              borderTopRightRadius: 6,
              borderBottomRightRadius: 6,
            }}
          >
            {crab.activity}
          </div>
        )}

        {/* Crab art — hops happily on hover/focus (see .crab-card-art) */}
        <div className="crab-card-art flex justify-center pt-3 pb-1">
          <CrabRenderer
            crab={crab}
            size={imgSize}
            animate
            showEmblem={!compact}
            showLegendaryGlow
          />
        </div>

        {/* Rookie star */}
        {crab.isRookie && (
          <div className="absolute top-7 left-1/2 -translate-x-1/2 text-[8px] px-1.5 py-0.5 rounded-full bg-yellow-500/90 text-black font-bold uppercase tracking-wide z-10">
            Rookie
          </div>
        )}

        {/* Body */}
        <div className="px-2.5 pb-2.5 text-white">
          <div className="font-bold text-xs md:text-sm truncate font-display" style={{ color: faction.colors.light }}>
            {crab.name}
          </div>
          <div className="text-[10px] opacity-75 truncate mb-1">
            {classDef.name}
            {breed ? ` · ${breed.name}` : ""}
          </div>
          <div className="mb-1">
            <ElementBadge crab={crab} />
          </div>

          {showStats && (
            <>
              <div className="flex items-center justify-between text-[10px]">
                <span className="font-bold flex items-center gap-0.5" style={{ color: "#FFD166" }}>
                  <GoldIcon size={10} />
                  {formatBP(bp)}
                </span>
                <span className="opacity-70">Lv {crab.level}</span>
                <span className="opacity-70">{crab.purity}/18</span>
              </div>

              <div className="mt-1 flex items-center justify-between">
                <BreedDots count={crab.breedCount} max={5} />
                <div className="flex items-center gap-1">
                  <MasteryStars count={crab.masteryBadges.length} />
                  <RarityBadge rarity={topRarity} />
                </div>
              </div>
            </>
          )}
        </div>
      </button>

      {showDetail && (
        <CrabDetailModal crab={crab} onClose={() => setShowDetail(false)} />
      )}
    </>
  );
}
