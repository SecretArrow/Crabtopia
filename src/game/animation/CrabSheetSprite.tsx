// Crabtopia — CrabSheetSprite
// Renders a crab identity (class + faction, no full Crab object required)
// through the frame-animated sprite-sheet system: resolves the sheet +
// faction hue tint via sheetResolver and plays it with AnimatedCrab.
// Used everywhere a crab portrait appears (cards, avatars, lists, codex,
// leaderboards) so NO screen falls back to static PNG art or the retired
// procedural SVG blob.

"use client";

import React from "react";
import AnimatedCrab from "./AnimatedCrab";
import {
  resolveSheetDescriptor,
  type CrabSheetIdentity,
} from "./sheetResolver";
import type { AnimState } from "./stateMachine";

export interface CrabSheetSpriteProps extends CrabSheetIdentity {
  size?: number;
  state?: AnimState;
  /** 0 freezes on the first frame (static thumbnail), 1 = full speed. */
  speed?: number;
  /** Run on the shared BattleClock (arena battles only). */
  clocked?: boolean;
  facing?: "right" | "left";
  onAnimEvent?: (name: string, state: AnimState) => void;
}

export default function CrabSheetSprite({
  classId,
  faction,
  size = 96,
  state = "idle",
  speed = 1,
  clocked = false,
  facing = "right",
  onAnimEvent,
}: CrabSheetSpriteProps): React.ReactNode {
  const desc = resolveSheetDescriptor({ classId, faction });
  const style: React.CSSProperties = {};
  const transforms: string[] = [];
  const filters: string[] = [];
  if (desc.hueRotate !== 0) filters.push(`hue-rotate(${desc.hueRotate}deg)`);
  if (desc.filterExtra) filters.push(desc.filterExtra);
  if (filters.length > 0) style.filter = filters.join(" ");
  if (facing === "left") transforms.push("scaleX(-1)");
  if (transforms.length > 0) style.transform = transforms.join(" ");
  return (
    <div data-testid="crab-sheet-sprite" data-sheet={desc.key} style={style}>
      <AnimatedCrab
        sheetKey={desc.key}
        state={state}
        size={size}
        speed={speed}
        clocked={clocked}
        onAnimEvent={onAnimEvent}
      />
    </div>
  );
}
