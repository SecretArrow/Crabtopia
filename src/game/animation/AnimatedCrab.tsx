// Crabtopia — AnimatedCrab
// Real frame-by-frame sprite renderer. Loads a character's sprite-sheet
// definition from the atlas, drives an AnimationStateMachine with the
// desired gameplay state, and plays frames with an AnimationPlayer whose
// playhead is delta-time based (consistent at any refresh rate). Frame
// events (e.g. "hitMoment" on attacks) are forwarded via onAnimEvent.
//
// Flicker control: the current background-position is computed from the
// player each animation frame and only written to React state when the
// sheet frame actually changes; the element is promoted with
// transform: translateZ(0).

"use client";

import React from "react";
import atlasJson from "../data/spriteAtlas.json";
import { AnimationPlayer } from "./player";
import { battleClock } from "./battleClock";
import {
  AnimationStateMachine,
  type AnimState,
} from "./stateMachine";
import {
  backgroundPosition,
  backgroundSize,
  type SpriteSheetDef,
} from "./spriteSheet";
import type { SheetKey } from "./sheetResolver";

interface AtlasShape {
  version: number;
  sheets: Record<string, SpriteSheetDef>;
  fx: Record<
    string,
    { src: string; frameWidth: number; frameHeight: number; frames: number; fps: number }
  >;
}

export const SPRITE_ATLAS = atlasJson as unknown as AtlasShape;

export function getSheetDef(key: SheetKey): SpriteSheetDef {
  return SPRITE_ATLAS.sheets[key];
}

export function getFxDef(name: string) {
  return SPRITE_ATLAS.fx[name];
}

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export interface AnimatedCrabProps {
  sheetKey: SheetKey;
  /** Desired animation state, driven by real gameplay events. */
  state: AnimState;
  size?: number;
  /** Multiplier on top of each animation's fps (battle speed). */
  speed?: number;
  /**
   * Run on the shared BattleClock (arena battles): frame advance is
   * scaled by the clock — frozen while the battle is paused, sped up
   * at x2/x3. Non-battle renders leave this off and use real time.
   */
  clocked?: boolean;
  onAnimEvent?: (name: string, state: AnimState) => void;
}

export default function AnimatedCrab({
  sheetKey,
  state,
  size = 120,
  speed = 1,
  clocked = false,
  onAnimEvent,
}: AnimatedCrabProps): React.ReactNode {
  const sheet = getSheetDef(sheetKey);
  const desiredRef = React.useRef<AnimState>(state);
  const speedRef = React.useRef(speed);
  const clockedRef = React.useRef(clocked);
  const eventRef = React.useRef(onAnimEvent);
  // Keep the loop's view of the props current (refs must not be written
  // during render — react-hooks lint).
  React.useEffect(() => {
    desiredRef.current = state;
    speedRef.current = speed;
    clockedRef.current = clocked;
    eventRef.current = onAnimEvent;
  });

  const smRef = React.useRef<AnimationStateMachine | null>(null);
  if (smRef.current === null) smRef.current = new AnimationStateMachine();
  const playerRef = React.useRef<AnimationPlayer | null>(null);
  const playerAnimRef = React.useRef<string>("");

  const [frame, setFrame] = React.useState<number>(
    () => sheet.animations.idle?.frames[0] ?? 0,
  );
  const [animState, setAnimState] = React.useState<AnimState>("idle");
  const frameRef = React.useRef(frame);
  const animStateRef = React.useRef<AnimState>("idle");

  React.useEffect(() => {
    if (prefersReducedMotion()) {
      const def = sheet.animations[state] ?? sheet.animations.idle;
      setFrame(def?.frames[0] ?? 0);
      setAnimState(state);
      return;
    }
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const rawDt = Math.min(100, now - last);
      last = now;
      // Battle-clocked sprites advance on battle time: scale 0 (pause)
      // freezes the playhead exactly where it is.
      const dt = clockedRef.current ? battleClock.scaleDt(rawDt) : rawDt;
      const sm = smRef.current!;
      // Follow the desired gameplay state whenever the machine allows it.
      if (desiredRef.current !== sm.current) {
        sm.request(desiredRef.current, {
          queue: desiredRef.current === "combo",
        });
      }
      const current = sm.current;
      const def = sheet.animations[current] ?? sheet.animations.idle;
      if (!def) return;
      if (playerAnimRef.current !== current || playerRef.current === null) {
        playerAnimRef.current = current;
        playerRef.current = new AnimationPlayer(def, {
          speed: speedRef.current,
          onEvent: (name) => eventRef.current?.(name, current),
          onComplete: () => sm.completeCurrent(),
        });
      } else {
        playerRef.current.setSpeed(speedRef.current);
      }
      const f = playerRef.current.update(dt);
      if (f !== frameRef.current || current !== animStateRef.current) {
        frameRef.current = f;
        animStateRef.current = current;
        setFrame(f);
        setAnimState(current);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [sheet, sheetKey]);

  const height = Math.round((size * sheet.frameHeight) / sheet.frameWidth);
  return (
    <div
      data-testid="animated-crab"
      data-sheet={sheetKey}
      data-anim-state={animState}
      aria-hidden
      style={{
        width: size,
        height,
        backgroundImage: `url(${sheet.src})`,
        backgroundSize: backgroundSize(sheet),
        backgroundPosition: backgroundPosition(sheet, frame, size, height),
        backgroundRepeat: "no-repeat",
        transform: "translateZ(0)",
        willChange: "background-position",
        imageRendering: "auto",
      }}
    />
  );
}
