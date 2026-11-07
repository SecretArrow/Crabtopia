// Crabtopia — AnimatedCrab
// Real frame-by-frame sprite renderer. Loads a character's sprite-sheet
// definition from the atlas, drives an AnimationStateMachine with the
// desired gameplay state, and plays frames with an AnimationPlayer whose
// playhead is delta-time based (consistent at any refresh rate). Frame
// events (e.g. "hitMoment" on attacks) are forwarded via onAnimEvent.
//
// Atlas v2 richness, layered on top of the state machine without
// changing its contract (data-anim-state keeps reporting the machine
// state):
//   * Seeded idle variation — while idling, a crab deterministically
//     rotates between the base idle clip and the sheet's idleAlt*
//     variant clips on a schedule derived from `seedKey` (its crab id),
//     with a personal phase offset and ±8% rate jitter, so groups of
//     the same class never breathe in sync.
//   * Clip crossfades — when the playing clip changes, the previous
//     frame fades out over ~110ms (same clock as playback: battle
//     pause freezes the fade too).
//   * Procedural squash & stretch — anticipation/lunge/recoil/landing
//     transforms computed from state (see proceduralPose.ts).
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
import { idleClipForCycle, idleProfileFor } from "./idleVariation";
import { proceduralTransform } from "./proceduralPose";
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

const FADE_MS = 110;
const IDLE_VARIANT_KEYS = ["idleAlt1", "idleAlt2", "idleAlt3"] as const;

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
  /**
   * Seed for idle variation (usually the crab's id). Omit to fall back
   * to a per-instance id — either way, groups never idle in sync.
   */
  seedKey?: string;
  onAnimEvent?: (name: string, state: AnimState) => void;
}

interface DisplayState {
  frame: number;
  transform: string;
  fadeFrame: number | null;
  fadeOpacity: number;
}

export default function AnimatedCrab({
  sheetKey,
  state,
  size = 120,
  speed = 1,
  clocked = false,
  seedKey,
  onAnimEvent,
}: AnimatedCrabProps): React.ReactNode {
  const sheet = getSheetDef(sheetKey);
  const fallbackSeed = React.useId();
  const seed = seedKey ?? fallbackSeed;
  const profile = React.useMemo(() => idleProfileFor(seed), [seed]);
  const idleVariants = React.useMemo(
    () => IDLE_VARIANT_KEYS.filter((k) => sheet.animations[k]),
    [sheet],
  );

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
  const playerClipRef = React.useRef<string>("");
  const mountedPlayerRef = React.useRef(false);

  // Idle-variation bookkeeping (all in playback-clock ms).
  const idleClipRef = React.useRef<string>("idle");
  const idleTimeRef = React.useRef<number | null>(null);
  // State timing for procedural pose.
  const prevStateRef = React.useRef<AnimState | null>(null);
  const stateMsRef = React.useRef(0);
  // Crossfade bookkeeping.
  const fadeRef = React.useRef<{ frame: number; elapsed: number } | null>(null);
  const initialDisplay: DisplayState = {
    frame: sheet.animations.idle?.frames[0] ?? 0,
    transform: "none",
    fadeFrame: null,
    fadeOpacity: 0,
  };
  const displayRef = React.useRef<DisplayState>(initialDisplay);

  const [display, setDisplay] = React.useState<DisplayState>(initialDisplay);
  const [animState, setAnimState] = React.useState<AnimState>("idle");
  const animStateRef = React.useRef<AnimState>("idle");

  React.useEffect(() => {
    if (prefersReducedMotion()) {
      const def = sheet.animations[state] ?? sheet.animations.idle;
      const first = def?.frames[0] ?? 0;
      displayRef.current = {
        frame: first,
        transform: "none",
        fadeFrame: null,
        fadeOpacity: 0,
      };
      setDisplay(displayRef.current);
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

      // State timing (procedural pose + landing detection).
      if (current !== animStateRef.current) {
        prevStateRef.current = animStateRef.current;
        stateMsRef.current = 0;
      } else {
        stateMsRef.current += dt;
      }

      // Idle variation: advance the personal schedule while idling and
      // pick the clip for the current cycle.
      let clipName: string = current;
      if (current === "idle" && idleVariants.length > 0) {
        if (idleTimeRef.current === null) {
          idleTimeRef.current = profile.phaseMs;
        }
        idleTimeRef.current += dt;
        const baseIdle = sheet.animations.idle;
        const cycleMs =
          ((baseIdle.frames.length / baseIdle.fps) * 1000) /
          Math.max(0.1, speedRef.current * profile.speedFactor);
        const cycle = Math.floor(idleTimeRef.current / cycleMs);
        clipName = idleClipForCycle(seed, cycle, idleVariants);
        idleClipRef.current = clipName;
      }

      const def =
        sheet.animations[clipName] ??
        sheet.animations[current] ??
        sheet.animations.idle;
      if (!def) return;
      const effectiveSpeed =
        speedRef.current * (current === "idle" ? profile.speedFactor : 1);

      if (playerClipRef.current !== clipName || playerRef.current === null) {
        // Clip change → crossfade from the frame on screen right now.
        if (playerRef.current !== null && dt > 0) {
          fadeRef.current = { frame: displayRef.current.frame, elapsed: 0 };
        }
        playerClipRef.current = clipName;
        playerRef.current = new AnimationPlayer(def, {
          speed: effectiveSpeed,
          onEvent: (name) => eventRef.current?.(name, current),
          onComplete: () => sm.completeCurrent(),
        });
        if (!mountedPlayerRef.current) {
          mountedPlayerRef.current = true;
          // Personal phase: start mid-cycle so a freshly mounted group
          // is desynchronised from the very first frame.
          if (current === "idle" && idleTimeRef.current !== null) {
            const baseIdle = sheet.animations.idle;
            const cycleMs =
              ((baseIdle.frames.length / baseIdle.fps) * 1000) /
              Math.max(0.1, effectiveSpeed);
            const within = idleTimeRef.current % cycleMs;
            if (within > 0) playerRef.current.update(within);
          }
        }
      } else {
        playerRef.current.setSpeed(effectiveSpeed);
      }
      const f = playerRef.current.update(dt);

      // Crossfade progress (same scaled dt — pause freezes the fade).
      let fadeFrame: number | null = null;
      let fadeOpacity = 0;
      if (fadeRef.current) {
        fadeRef.current.elapsed += dt;
        if (fadeRef.current.elapsed >= FADE_MS) {
          fadeRef.current = null;
        } else {
          fadeFrame = fadeRef.current.frame;
          fadeOpacity = 1 - fadeRef.current.elapsed / FADE_MS;
        }
      }

      // Procedural squash & stretch from state.
      const idx = def.frames.indexOf(f);
      const progress =
        def.frames.length <= 1
          ? 1
          : def.loop === "once"
            ? idx / (def.frames.length - 1)
            : (idx + 1) / def.frames.length;
      const transform = proceduralTransform({
        state: current,
        prevState: prevStateRef.current,
        sinceChangeMs: stateMsRef.current,
        progress: Math.max(0, progress),
      });

      const prev = displayRef.current;
      if (
        f !== prev.frame ||
        transform !== prev.transform ||
        fadeFrame !== prev.fadeFrame ||
        Math.abs(fadeOpacity - prev.fadeOpacity) > 0.02 ||
        current !== animStateRef.current
      ) {
        const next: DisplayState = { frame: f, transform, fadeFrame, fadeOpacity };
        displayRef.current = next;
        setDisplay(next);
        if (current !== animStateRef.current) {
          animStateRef.current = current;
          setAnimState(current);
        }
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [sheet, sheetKey, idleVariants, profile, seed]);

  const height = Math.round((size * sheet.frameHeight) / sheet.frameWidth);
  const bg = (frame: number) => ({
    backgroundImage: `url(${sheet.src})`,
    backgroundSize: backgroundSize(sheet),
    backgroundPosition: backgroundPosition(sheet, frame, size, height),
    backgroundRepeat: "no-repeat" as const,
  });
  return (
    <div
      data-testid="animated-crab"
      data-sheet={sheetKey}
      data-anim-state={animState}
      aria-hidden
      style={{
        position: "relative",
        width: size,
        height,
        ...bg(display.frame),
        transform:
          display.transform === "none"
            ? "translateZ(0)"
            : `${display.transform} translateZ(0)`,
        transformOrigin: "50% 88%",
        willChange: "background-position",
        imageRendering: "auto",
      }}
    >
      {display.fadeFrame !== null && (
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            ...bg(display.fadeFrame),
            opacity: display.fadeOpacity,
            pointerEvents: "none",
          }}
        />
      )}
    </div>
  );
}
