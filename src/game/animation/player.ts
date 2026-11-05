// Crabtopia - AnimationPlayer (pure, unit-testable).
//
// A mutable playhead over an AnimationDef. Time advances ONLY through
// update(dtMs) (delta-time accumulation) — never from a wall clock — so
// tests and replays are deterministic. Frame math and event collection
// are delegated to the pure helpers in spriteSheet.ts.
import {
  collectEventsBetween,
  frameAtTime,
} from "./spriteSheet";
import type { AnimationDef } from "./spriteSheet";

export interface AnimationPlayerOptions {
  /** Fired exactly when playback enters a frame carrying an event. */
  onEvent?: (name: string, frame: number) => void;
  /** Fired exactly once when a "once" animation reaches its end. */
  onComplete?: () => void;
  /** Playback speed multiplier (default 1). */
  speed?: number;
}

export class AnimationPlayer {
  private def: AnimationDef;
  private readonly onEvent?: (name: string, frame: number) => void;
  private readonly onComplete?: () => void;
  private speed: number;
  /** Effective playhead in ms (dt already scaled by speed). */
  private timeMs = 0;
  private isPlaying = true;
  private isFinished = false;
  private completeFired = false;

  constructor(def: AnimationDef, opts: AnimationPlayerOptions = {}) {
    this.def = def;
    this.onEvent = opts.onEvent;
    this.onComplete = opts.onComplete;
    this.speed = opts.speed !== undefined && opts.speed > 0 ? opts.speed : 1;
  }

  /**
   * Start (or restart) playback. With an argument, swaps the definition
   * and restarts; without one, restarts the current definition.
   */
  play(def?: AnimationDef): void {
    if (def) this.def = def;
    this.timeMs = 0;
    this.isFinished = false;
    this.completeFired = false;
    this.isPlaying = true;
  }

  pause(): void {
    this.isPlaying = false;
  }

  /** Resume after pause(). A finished "once" animation stays finished. */
  resume(): void {
    this.isPlaying = true;
  }

  /** Back to the first frame, playing, completion re-armed. */
  reset(): void {
    this.timeMs = 0;
    this.isFinished = false;
    this.completeFired = false;
    this.isPlaying = true;
  }

  setSpeed(n: number): void {
    this.speed = n > 0 ? n : 0;
  }

  get playing(): boolean {
    return this.isPlaying;
  }

  get finished(): boolean {
    return this.isFinished;
  }

  /** Index into def.frames of the frame currently shown. */
  get currentIndex(): number {
    return frameAtTime(this.def, this.timeMs).index;
  }

  /** Sheet frame number currently shown. */
  get currentFrame(): number {
    return frameAtTime(this.def, this.timeMs).frame;
  }

  /**
   * Advance by dtMs (wall delta from the caller's loop) and return the
   * sheet frame to draw now. Events for EVERY frame entered during this
   * step are fired in order — including several frames skipped by one
   * large dt and frames entered across a loop wrap. A "once" animation
   * stops on its last frame, marks itself finished, and fires
   * onComplete exactly once (later updates are no-ops).
   */
  update(dtMs: number): number {
    if (!this.isPlaying || this.isFinished || dtMs <= 0 || this.speed <= 0) {
      return this.currentFrame;
    }
    const prev = this.timeMs;
    const next = prev + dtMs * this.speed;
    this.timeMs = next;

    const fired = collectEventsBetween(this.def, prev, next);
    for (const ev of fired) {
      if (this.onEvent) this.onEvent(ev.name, ev.frame);
    }

    if (this.def.loop === "once") {
      const state = frameAtTime(this.def, next);
      if (state.finished) {
        this.isFinished = true;
        if (!this.completeFired) {
          this.completeFired = true;
          if (this.onComplete) this.onComplete();
        }
      }
    }
    return this.currentFrame;
  }
}
