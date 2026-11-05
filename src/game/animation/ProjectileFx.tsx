// Crabtopia — ProjectileFx
// A flipbook sprite that TRAVELS from the attacker to the target along a
// parabolic arc (skill-profile projectiles: frost bolts, lightning, magic).
// Frame playback reuses AnimationPlayer; position is computed with the pure
// projectilePointAt helper from skillProfiles. When travel completes,
// onDone fires — ArenaBattle then spawns the profile's impact flipbook at
// the target, so cause (cast) → flight → impact reads as one skill.

"use client";

import React from "react";
import { AnimationPlayer } from "./player";
import type { AnimationDef } from "./spriteSheet";
import { getFxDef } from "./AnimatedCrab";
import { battleClock } from "./battleClock";
import { projectilePointAt } from "./skillProfiles";

export interface ProjectileFxProps {
  fx: string; // atlas fx key drawn on the projectile
  from: { x: number; y: number };
  to: { x: number; y: number };
  durationMs: number;
  arcHeight?: number;
  size?: number;
  /** Skill-profile archetype + skill id, exposed for QA/e2e hooks. */
  profile?: string;
  skillId?: string;
  /**
   * Element-driven colour treatment (elementFx.fxTreatmentFor): a
   * static CSS filter landing the projectile sprite on the attacking
   * crab's element colour. Damage projectiles only; support casts
   * have no projectiles and never pass this.
   */
  filter?: string;
  /** Attacker's element id when element-driven → data-fx-element hook. */
  fxElement?: string;
  onDone?: () => void;
}

export default function ProjectileFx({
  fx,
  from,
  to,
  durationMs,
  arcHeight = 36,
  size = 64,
  profile,
  skillId,
  filter,
  fxElement,
  onDone,
}: ProjectileFxProps): React.ReactNode {
  const def = getFxDef(fx);
  const [frame, setFrame] = React.useState(0);
  const [pos, setPos] = React.useState(from);
  const [gone, setGone] = React.useState(false);
  const doneRef = React.useRef(false);
  const onDoneRef = React.useRef(onDone);
  React.useEffect(() => {
    onDoneRef.current = onDone;
  });

  React.useEffect(() => {
    if (!def) return;
    const anim: AnimationDef = {
      frames: Array.from({ length: def.frames }, (_, i) => i),
      fps: def.fps,
      loop: "loop",
    };
    const player = new AnimationPlayer(anim, {});
    let raf = 0;
    let last = performance.now();
    // Travel time accrues in BATTLE time (durationMs is a battle-time
    // budget): the projectile hangs mid-flight while the battle is
    // paused and flies faster at x2/x3.
    let travelMs = 0;
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const rawDt = Math.min(100, now - last);
      last = now;
      const dt = battleClock.scaleDt(rawDt);
      setFrame(player.update(dt));
      travelMs += dt;
      const t = travelMs / Math.max(1, durationMs);
      setPos(projectilePointAt(from, to, t, arcHeight));
      if (t >= 1 && !doneRef.current) {
        doneRef.current = true;
        setGone(true);
        cancelAnimationFrame(raf);
        onDoneRef.current?.();
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fx]);

  if (!def || gone) return null;
  const pct = def.frames <= 1 ? 0 : (frame / (def.frames - 1)) * 100;
  return (
    <div
      data-testid="projectile-fx"
      data-fx={fx}
      data-fx-profile={profile}
      data-skill-id={skillId}
      data-fx-element={fxElement}
      aria-hidden
      className="absolute pointer-events-none"
      style={{
        left: pos.x,
        top: pos.y,
        width: size,
        height: size,
        transform: "translate(-50%, -50%)",
        backgroundImage: `url(${def.src})`,
        backgroundSize: `${def.frames * 100}% 100%`,
        backgroundPosition: `${pct}% 0%`,
        backgroundRepeat: "no-repeat",
        filter,
        zIndex: 30,
      }}
    />
  );
}
