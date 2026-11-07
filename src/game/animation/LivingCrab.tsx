// Crabtopia — LivingCrab
// Single entry point for rendering a crab with the overhaul animation
// system. Every crab now resolves to a real frame-animated sprite sheet
// (see sheetResolver): every class has its own dedicated sheet, plus a
// faction hue tint. Rookie is a rank label only — it never changes a
// crab's sheet or artwork. There is no static or procedural-blob
// rendering path left for crabs (the old puppet rig was deleted in
// Phase 4 — it had no callers).

"use client";

import React from "react";
import CrabSheetSprite from "./CrabSheetSprite";
import type { AnimState } from "./stateMachine";
import type { Crab } from "../types";

export interface LivingCrabProps {
  crab: Crab;
  state?: AnimState;
  size?: number;
  facing?: "right" | "left";
  speed?: number;
  /** Run on the shared BattleClock (arena battles only). */
  clocked?: boolean;
  onAnimEvent?: (name: string, state: AnimState) => void;
}

export default function LivingCrab({
  crab,
  state = "idle",
  size = 120,
  facing = "right",
  speed = 1,
  clocked = false,
  onAnimEvent,
}: LivingCrabProps): React.ReactNode {
  return (
    <CrabSheetSprite
      classId={crab.classId}
      faction={crab.faction}
      state={state}
      size={size}
      speed={speed}
      clocked={clocked}
      facing={facing}
      seedKey={crab.id}
      onAnimEvent={onAnimEvent}
    />
  );
}
