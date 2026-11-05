// Crabtopia — LivingCrab
// Single entry point for rendering a crab with the overhaul animation
// system. Every crab now resolves to a real frame-animated sprite sheet
// (see sheetResolver): dedicated sheets for gildclaw / warden / reaver /
// pincher, nearest-sheet + faction hue tint for bulwark / skitter /
// tidecaller / shellmender, kelp-tinted pincher sheet for rookies. The
// puppet rig (PuppetCrab) remains available as a standalone articulated
// layer, but no screen needs it as a fallback anymore — there is no static
// or procedural-blob rendering path left for crabs.

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
      isRookie={crab.isRookie}
      state={state}
      size={size}
      speed={speed}
      clocked={clocked}
      facing={facing}
      onAnimEvent={onAnimEvent}
    />
  );
}
