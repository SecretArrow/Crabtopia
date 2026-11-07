// Crabtopia — Procedural squash & stretch.
//
// Frame art carries the poses; this layer adds the *physics feel* on
// top, computed purely from animation state: anticipation squash on
// attack wind-up, a lunge stretch at the strike, recoil on hit, a
// landing squash when a unit touches down from jump/fall/dodge, and a
// gentle celebratory bounce in victory. Transform-only (GPU-cheap),
// subtle by design — it must never fight the drawn pose. Returns a CSS
// transform string ("none" when neutral) so callers can diff cheaply.

import type { AnimState } from "./stateMachine";

export interface ProceduralPoseInput {
  state: AnimState;
  /** State the machine was in before the current one (landing checks). */
  prevState: AnimState | null;
  /** ms (same clock as playback) spent in the current state. */
  sinceChangeMs: number;
  /** 0..1 progress through the current once/loop clip. */
  progress: number;
}

const LANDING_FROM: ReadonlySet<AnimState> = new Set(["jump", "fall", "dodge"]);
const LANDING_INTO: ReadonlySet<AnimState> = new Set(["idle", "walk", "run"]);

function fmt(n: number): string {
  return n.toFixed(3);
}

export function proceduralTransform(input: ProceduralPoseInput): string {
  const { state, prevState, sinceChangeMs, progress } = input;

  // Landing squash: touched down from an airborne state <180ms ago.
  if (
    prevState !== null &&
    LANDING_FROM.has(prevState) &&
    LANDING_INTO.has(state) &&
    sinceChangeMs < 180
  ) {
    const k = 1 - sinceChangeMs / 180; // 1 → 0 decay
    return `scale(${fmt(1 + 0.08 * k)}, ${fmt(1 - 0.1 * k)})`;
  }

  switch (state) {
    case "attack":
    case "combo": {
      // Anticipation squash, then lunge stretch through the strike,
      // easing back to neutral for the recovery frames.
      if (progress < 0.3) {
        const k = progress / 0.3;
        return `scale(${fmt(1 + 0.03 * k)}, ${fmt(1 - 0.04 * k)})`;
      }
      if (progress < 0.62) {
        const k = 1 - (progress - 0.3) / 0.32;
        return `scale(${fmt(1 + 0.07 * k)}, ${fmt(1 - 0.045 * k)}) translateX(${fmt(2.5 * k)}%)`;
      }
      return "none";
    }
    case "skill": {
      // Casters rise slightly as the sigil peaks mid-clip.
      const bump = Math.sin(Math.min(1, Math.max(0, progress)) * Math.PI);
      return `scale(${fmt(1 + 0.02 * bump)}, ${fmt(1 + 0.02 * bump)}) translateY(${fmt(-2 * bump)}%)`;
    }
    case "hit": {
      if (sinceChangeMs < 220) {
        const k = 1 - sinceChangeMs / 220;
        return `scale(${fmt(1 - 0.05 * k)}, ${fmt(1 + 0.04 * k)}) translateX(${fmt(-2 * k)}%)`;
      }
      return "none";
    }
    case "victory": {
      // Gentle bounce, ~560ms period, ±2% — celebration without chaos.
      const b = Math.abs(Math.sin(sinceChangeMs / 280)) * 0.025;
      return `scale(${fmt(1 + b * 0.6)}, ${fmt(1 + b)}) translateY(${fmt(-b * 40)}%)`;
    }
    default:
      return "none";
  }
}
