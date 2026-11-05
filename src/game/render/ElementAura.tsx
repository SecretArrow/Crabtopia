// Crabtopia — ElementAura
// The element AURA LAYER: a soft glow in the crab's element colour,
// rendered as a separate layer behind the character by the shared
// render wrappers (CrabRenderer, CrabSprite, CrabBattleSprite, the
// detail modal). This is how a crab's element reads from the
// character itself — the base artwork stays clean and untouched
// (layer-separation rule); the aura is pure presentation, absolutely
// positioned, pointer-events-none, and adds no layout geometry.
//
// Variants:
//   "preview" — halo + element-tinted backdrop disc + a thin element
//               ring framing the portrait (cards, modal, lists).
//   "battle"  — a wider, softer halo + ground disc behind the battle
//               sprite. Fully STATIC (no animation): the battle runs
//               on the shared BattleClock, and pause must remain a
//               real freeze, so the persistent aura never pulses.
//               (The brighter animated casting glow in
//               CrabBattleSprite is a separate temporary effect.)
//
// Testable surface: data-testid="element-aura" and
// data-element-aura="<elementId>" on the layer root.

"use client";

import React from "react";
import type { Crab } from "../types";
import { elementOf, type ElementId } from "../engine/elements";
import { auraForElement } from "../data/elementAura";

export interface ElementAuraProps {
  /** Element id directly, or pass a crab instead. */
  element?: ElementId;
  crab?: Crab;
  variant?: "preview" | "battle";
}

export default function ElementAura({
  element,
  crab,
  variant = "preview",
}: ElementAuraProps): React.ReactNode {
  const id = element ?? (crab ? elementOf(crab) : undefined);
  if (!id) return null;
  const color = auraForElement(id);

  if (variant === "battle") {
    return (
      <div
        data-testid="element-aura"
        data-element-aura={id}
        aria-hidden="true"
        className="absolute inset-0 pointer-events-none"
      >
        {/* Wide soft halo behind the sprite */}
        <div
          className="absolute rounded-full"
          style={{
            inset: "-24%",
            background: `radial-gradient(circle, ${color}59 0%, ${color}2e 45%, transparent 70%)`,
          }}
        />
        {/* Ground disc the crab stands in */}
        <div
          className="absolute rounded-full"
          style={{
            inset: "4% 0% -2% 0%",
            background: `radial-gradient(circle, ${color}30 0%, transparent 68%)`,
          }}
        />
      </div>
    );
  }

  return (
    <div
      data-testid="element-aura"
      data-element-aura={id}
      aria-hidden="true"
      className="absolute inset-0 pointer-events-none"
    >
      {/* Glow halo behind the portrait — gently pulses in preview
          contexts (menus are not BattleClock-bound; the battle variant
          above stays fully static for pause-freeze integrity) */}
      <div
        className="absolute rounded-full aura-pulse"
        style={{
          inset: "-6%",
          background: `radial-gradient(circle, ${color}52 0%, ${color}29 48%, transparent 72%)`,
        }}
      />
      {/* Element-tinted backdrop disc */}
      <div
        className="absolute rounded-full"
        style={{
          inset: "5%",
          background: `radial-gradient(circle, ${color}47 0%, ${color}21 58%, transparent 80%)`,
        }}
      />
      {/* Thin element ring framing the portrait */}
      <div
        className="absolute rounded-full"
        style={{
          inset: "1%",
          border: `2px solid ${color}66`,
          boxShadow: `0 0 14px ${color}40, inset 0 0 10px ${color}30`,
        }}
      />
    </div>
  );
}
