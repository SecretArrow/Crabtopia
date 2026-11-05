// Crabtopia — CrabArtImage / ClassArtImage (preview art)
// ---------------------------------------------------------------------------
// Preview contexts (cards, avatars, lists, codex, bazaar, team select,
// deployment board, detail modal…) render the crab's OWN art as a
// LIVING, frame-animated sprite: the per-class battle sheet playing
// its idle clip at natural fps (LivingCrab / CrabSheetSprite). The
// dedicated sheets ARE each class's own artwork, so the "every crab
// shows its own art" rule holds — and no preview is ever a stiff
// static portrait again. The old transparent PNG portraits in
// public/art/crabs/ remain on disk as source/poster art only.
//
// The public API is unchanged from the static era (including the
// legacy `faction`/`speed` compat props): `speed` was already ignored
// by the static renderer and is still not forwarded — previews always
// play at the sheet's natural idle fps. prefers-reduced-motion still
// freezes the first frame (AnimatedCrab honours it) — that is an
// accessibility requirement, not a stiff render.

"use client";

import React from "react";
import type { Crab, ClassId, FactionId } from "../types";
import { artKeyForClass } from "../data/classArt";
import CrabSheetSprite from "../animation/CrabSheetSprite";
import { CLASS_HOME_FACTION } from "../animation/sheetResolver";

export interface ClassArtImageProps {
  classId: ClassId;
  size?: number;
  className?: string;
  /**
   * Legacy-compat props accepted for drop-in replacement of the old
   * static call sites. `faction` selects the sheet's faction tint
   * (defaults to the class's home faction = its native look);
   * `speed` is accepted and ignored — previews always animate.
   */
  faction?: FactionId;
  speed?: number;
}

export function ClassArtImage(props: ClassArtImageProps): React.ReactNode {
  const { classId, size = 96, className, faction } = props;
  return (
    <div
      className={className}
      data-art-class={artKeyForClass(classId)}
      style={{
        width: size,
        height: size,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <CrabSheetSprite
        classId={classId}
        faction={faction ?? CLASS_HOME_FACTION[classId]}
        size={size}
        state="idle"
      />
    </div>
  );
}

export interface CrabArtImageProps {
  crab: Crab;
  size?: number;
  className?: string;
}

export default function CrabArtImage({
  crab,
  size = 96,
  className,
}: CrabArtImageProps): React.ReactNode {
  return (
    <ClassArtImage
      classId={crab.classId}
      faction={crab.faction}
      size={size}
      className={className}
    />
  );
}
