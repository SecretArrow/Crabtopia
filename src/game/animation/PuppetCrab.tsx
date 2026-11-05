// Crabtopia — PuppetCrab
// Skeletal/puppet rendering for crabs that do not (yet) have a dedicated
// sprite sheet. The procedural CrabSprite is built from articulated SVG
// layer groups (legs / shell+body / claws / eyes); this component computes
// a per-bone rig pose from the same animation state machine vocabulary
// (computeRigPose: idle sway, claw snap on attack via two-bone IK timing,
// leg paddling on walk/run, recoil on hit) and applies it to those groups
// at ~20fps. Frame-based sheets remain the primary system; the rig is the
// hybrid layer the overhaul spec asks for "where appropriate".

"use client";

import React from "react";
import CrabSprite from "../render/CrabSprite";
import { computeRigPose, type RigPose } from "./puppetRig";
import type { AnimState } from "./stateMachine";
import type { Crab } from "../types";

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export interface PuppetCrabProps {
  crab: Crab;
  state: AnimState;
  size?: number;
  facing?: "right" | "left";
}

export default function PuppetCrab({
  crab,
  state,
  size = 120,
  facing = "right",
}: PuppetCrabProps): React.ReactNode {
  const stateRef = React.useRef(state);
  React.useEffect(() => {
    stateRef.current = state;
  });
  const [rig, setRig] = React.useState<RigPose>(() =>
    computeRigPose(state, 0, { facing: facing === "left" ? -1 : 1 }),
  );

  React.useEffect(() => {
    if (prefersReducedMotion()) {
      setRig(computeRigPose(stateRef.current, 0, { facing: facing === "left" ? -1 : 1 }));
      return;
    }
    let raf = 0;
    let last = 0;
    const start = performance.now();
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (now - last < 50) return; // ~20fps rig updates are plenty for sway
      last = now;
      setRig(
        computeRigPose(stateRef.current, now - start, {
          facing: facing === "left" ? -1 : 1,
        }),
      );
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [facing]);

  return (
    <div
      data-testid="puppet-crab"
      data-anim-state={state}
      style={{
        width: size,
        height: size,
        transform: facing === "left" ? "scaleX(-1)" : undefined,
      }}
    >
      <CrabSprite crab={crab} size={size} animated={false} rigPose={rig} />
    </div>
  );
}
