// Crabtopia - Faction Emblem component (uses PNG art assets).
"use client";

import { FactionId } from "../types";
import { FACTIONS } from "../content/factions";
import { FACTION_EMBLEM_ART } from "./ui";

interface Props {
  faction: FactionId;
  size?: number;
  glow?: boolean;
  className?: string;
}

export default function FactionEmblem({ faction, size = 24, glow = false, className }: Props) {
  const f = FACTIONS[faction];
  return (
    <img
      src={FACTION_EMBLEM_ART[faction]}
      alt={`${f.name} emblem`}
      width={size}
      height={size}
      className={`object-contain inline-block ${className ?? ""}`}
      style={{
        filter: glow
          ? `drop-shadow(0 0 4px ${f.colors.accent}) drop-shadow(0 0 8px ${f.colors.primary}88)`
          : undefined,
      }}
      draggable={false}
    />
  );
}
