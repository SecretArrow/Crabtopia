// Crabtopia — FlipbookFx
// Plays a procedural VFX flipbook strip (public/art/sprites/fx/*.png)
// exactly once, frame-by-frame via AnimationPlayer, positioned at a battle
// coordinate. Synchronised by the caller with real gameplay events (it is
// spawned by ArenaBattle at the moment an action's effects fire, and by
// AnimatedCrab hitMoment events for claw sparks).

"use client";

import React from "react";
import { AnimationPlayer } from "./player";
import type { AnimationDef } from "./spriteSheet";
import { getFxDef } from "./AnimatedCrab";
import { battleClock } from "./battleClock";

export interface FlipbookFxProps {
  fx: string; // atlas fx key: slash | spark | lightning | splash | heal | explosion | shield | levelup
  x: number;
  y: number;
  size?: number;
  /**
   * Element-driven colour treatment (elementFx.fxTreatmentFor): a
   * static CSS filter that lands this flipbook on the attacking crab's
   * element colour. Only ever passed for DAMAGE FX — support FX render
   * untreated, exactly as before.
   */
  filter?: string;
  /** Attacker's element id when element-driven → data-fx-element hook. */
  fxElement?: string;
  onDone?: () => void;
}

export default function FlipbookFx({
  fx,
  x,
  y,
  size = 120,
  filter,
  fxElement,
  onDone,
}: FlipbookFxProps): React.ReactNode {
  const def = getFxDef(fx);
  const [frame, setFrame] = React.useState(0);
  const [gone, setGone] = React.useState(false);
  const doneRef = React.useRef(false);

  React.useEffect(() => {
    if (!def) return;
    const anim: AnimationDef = {
      frames: Array.from({ length: def.frames }, (_, i) => i),
      fps: def.fps,
      loop: "once",
    };
    const player = new AnimationPlayer(anim, {
      onComplete: () => {
        if (!doneRef.current) {
          doneRef.current = true;
          setGone(true);
          onDone?.();
        }
      },
    });
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const rawDt = Math.min(100, now - last);
      last = now;
      // Flipbooks only play inside the arena battle → battle time:
      // frozen while paused (the effect hangs mid-flipbook), scaled
      // by the spectator speed otherwise.
      setFrame(player.update(battleClock.scaleDt(rawDt)));
      if (player.finished) cancelAnimationFrame(raf);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fx]);

  if (!def || gone) return null;
  const pct = def.frames <= 1 ? 0 : (frame / (def.frames - 1)) * 100;
  return (
    <div
      data-testid="flipbook-fx"
      data-fx={fx}
      data-fx-element={fxElement}
      aria-hidden
      className="absolute pointer-events-none"
      style={{
        left: x,
        top: y,
        width: size,
        height: size,
        transform: "translate(-50%, -50%)",
        backgroundImage: `url(${def.src})`,
        backgroundSize: `${def.frames * 100}% 100%`,
        backgroundPosition: `${pct}% 0%`,
        backgroundRepeat: "no-repeat",
        filter,
        zIndex: 40,
      }}
    />
  );
}
