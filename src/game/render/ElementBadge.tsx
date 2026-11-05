// Crabtopia — ElementBadge
// A small coloured chip showing a crab's element: medallion icon +
// "Vulkara · Api". UI ONLY (layer-separation rule): the badge never
// alters crab artwork; elements live in badges and battle math, not
// baked into portraits.

"use client";

import React from "react";
import type { Crab } from "../types";
import { ELEMENTS, elementOf, type ElementId } from "../engine/elements";
import { artForElement } from "../data/elementArt";

function inkFor(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.62 ? "#14202E" : "#FFFFFF";
}

export interface ElementBadgeProps {
  /** Element id directly, or pass a crab instead. */
  element?: ElementId;
  crab?: Crab;
  size?: "sm" | "md";
  /** Name-only micro chip for narrow thumbnails (full label in title). */
  compact?: boolean;
  className?: string;
}

export default function ElementBadge({
  element,
  crab,
  size = "sm",
  compact = false,
  className,
}: ElementBadgeProps): React.ReactNode {
  const id = element ?? (crab ? elementOf(crab) : undefined);
  if (!id) return null;
  const def = ELEMENTS[id];
  return (
    <span
      data-testid="element-badge"
      data-element={id}
      title={`${def.name} · ${def.kind} (${def.category})`}
      className={`inline-flex items-center gap-1 rounded-full font-bold whitespace-nowrap ${className ?? ""}`}
      style={{
        background: def.color,
        color: inkFor(def.color),
        fontSize: compact ? 8 : size === "sm" ? 9 : 11,
        padding: compact ? "0px 5px" : size === "sm" ? "1px 7px" : "2px 10px",
        boxShadow: "0 1px 4px rgba(0,0,0,0.35)",
      }}
    >
      <img
        src={artForElement(id)}
        alt=""
        aria-hidden
        draggable={false}
        className="rounded-full shrink-0"
        style={{
          width: compact ? 10 : size === "sm" ? 13 : 16,
          height: compact ? 10 : size === "sm" ? 13 : 16,
        }}
      />
      {compact ? def.name : `${def.name} · ${def.kind}`}
    </span>
  );
}
