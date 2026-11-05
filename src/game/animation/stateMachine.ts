// Crabtopia - Animation state machine (pure, unit-testable).
//
// Transition rules (documented policy — the machine knows animation
// semantics, NOT durations; the owner calls completeCurrent() when a
// "once" animation finishes):
//
//  - "death" can be entered from ANY state and locks the machine: once
//    dead, every further request is rejected.
//  - "hit" interrupts ANY state except "death", regardless of priority.
//  - Looping states (idle / walk / run / defense / fall) never block:
//    any request may interrupt them (subject to the priority of the
//    target itself — there is none: leaving a loop is always legal).
//  - One-shot states (attack / combo / skill / dodge / jump / hit /
//    victory) block while they are "current and not yet completed":
//    a request for a LOWER-priority state is rejected, a request for an
//    equal/higher-priority state interrupts immediately.
//  - Sole queue exception: attack -> combo with { queue: true } stores
//    ONE queued state instead of entering it now (an explicit queue
//    request wins over combo's higher priority); it runs when
//    completeCurrent() is called.
//  - completeCurrent(): queued state runs first; victory and death are
//    terminal and stay; anything else falls back to "idle".
export type AnimState =
  | "idle"
  | "walk"
  | "run"
  | "attack"
  | "combo"
  | "skill"
  | "defense"
  | "hit"
  | "dodge"
  | "jump"
  | "fall"
  | "victory"
  | "death";

/** Higher wins. death is absolute; idle is the floor. */
export const ANIM_PRIORITY: Record<AnimState, number> = {
  idle: 0,
  walk: 10,
  run: 20,
  fall: 30,
  jump: 35,
  dodge: 40,
  defense: 45,
  attack: 50,
  combo: 55,
  skill: 60,
  hit: 70,
  victory: 80,
  death: 100,
};

/** States whose animation plays once and blocks until completed. */
export const ONCE_STATES: ReadonlySet<AnimState> = new Set<AnimState>([
  "attack",
  "combo",
  "skill",
  "dodge",
  "jump",
  "hit",
  "victory",
  "death",
]);

/** States that hold until something else replaces them. */
export const TERMINAL_STATES: ReadonlySet<AnimState> = new Set<AnimState>([
  "victory",
  "death",
]);

/**
 * Can `state` be interrupted at all (by a suitable request)? Looping
 * states always can; one-shot states only via the priority / hit /
 * death rules in AnimationStateMachine.request (so, for a bare state
 * value with no requester context, one-shots report false); death never.
 */
export function isInterruptible(state: AnimState): boolean {
  if (state === "death") return false;
  return !ONCE_STATES.has(state);
}

export interface AnimationStateMachineOptions {
  onEnter?: (state: AnimState) => void;
  /** Initial state (default "idle"). Does NOT fire onEnter. */
  initial?: AnimState;
}

export class AnimationStateMachine {
  private state: AnimState;
  private queuedState: AnimState | null = null;
  private readonly onEnter?: (state: AnimState) => void;

  constructor(opts: AnimationStateMachineOptions = {}) {
    this.state = opts.initial ?? "idle";
    this.onEnter = opts.onEnter;
  }

  get current(): AnimState {
    return this.state;
  }

  /** The single queued state (attack -> combo), if any. */
  get queued(): AnimState | null {
    return this.queuedState;
  }

  /** Instance view of the standalone isInterruptible() helper. */
  isInterruptible(state?: AnimState): boolean {
    return isInterruptible(state ?? this.state);
  }

  private enter(next: AnimState): void {
    this.state = next;
    if (this.onEnter) this.onEnter(next);
  }

  /**
   * Ask to enter `state`. Returns true when the request is accepted —
   * either entered immediately or stored in the one-slot queue.
   * Requesting the current state is an accepted no-op (no onEnter).
   */
  request(state: AnimState, opts: { queue?: boolean } = {}): boolean {
    if (this.state === "death") return false; // death locks everything
    if (state === this.state) return true;
    if (state === "death") {
      this.queuedState = null;
      this.enter("death");
      return true;
    }
    if (state === "hit") {
      // Hit interrupts everything except death (handled above).
      this.queuedState = null;
      this.enter("hit");
      return true;
    }

    const currentBlocks = ONCE_STATES.has(this.state);
    if (!currentBlocks) {
      this.enter(state);
      return true;
    }

    // Current one-shot has not completed yet. An explicit queue request
    // for the one queueable case (attack -> combo) is stored, not run.
    if (opts.queue && this.state === "attack" && state === "combo") {
      if (this.queuedState !== null) return false; // the 1 slot is taken
      this.queuedState = state;
      return true;
    }
    if (ANIM_PRIORITY[state] >= ANIM_PRIORITY[this.state]) {
      this.enter(state);
      return true;
    }
    // Lower priority and not queueable: rejected.
    return false;
  }

  /**
   * Called by the owner when the current one-shot animation finishes.
   * Runs the queued state if any; victory/death stay; otherwise the
   * machine falls back to "idle".
   */
  completeCurrent(): void {
    if (this.queuedState !== null) {
      const next = this.queuedState;
      this.queuedState = null;
      this.enter(next);
      return;
    }
    if (TERMINAL_STATES.has(this.state)) return;
    if (this.state !== "idle") this.enter("idle");
  }
}
