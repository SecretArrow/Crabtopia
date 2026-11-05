// Crabtopia — BattleClock
// ONE shared clock for the whole arena battle presentation layer.
//
// Every battle animation system advances on battle time, never on the
// wall clock directly:
//   - AnimationPlayer frame advance (AnimatedCrab, battle-clocked),
//   - the pooled ParticleSystem (ParticleLayer),
//   - FlipbookFx frame advance and ProjectileFx travel time,
//   - lunge / knockback commands (issued by clock timers in ArenaBattle),
//   - the auto-battle loop's timed waits (ArenaBattle's action chain).
//
// `scale` is the effective timeScale: 0 while paused (a REAL freeze —
// nothing above advances), otherwise the spectator speed (x1/x2/x3).
// ArenaBattle owns the singleton's lifecycle: it resets it on mount,
// drives advance() from one requestAnimationFrame loop, mirrors
// pause/speed into setScale, and exposes the accumulated battle time
// as data-battle-clock-ms on the arena element for tests.
//
// The class is pure and deterministic — advance(dt) is called by hand
// in unit tests; no wall clock is read anywhere in this module.

interface ClockTimer {
  id: number;
  fireAt: number;
  cb: () => void;
}

export class BattleClock {
  private scaleValue = 1;
  private elapsedValue = 0;
  private timers: ClockTimer[] = [];
  private nextId = 1;

  /** Effective timeScale: 0 = paused, otherwise the speed multiplier. */
  get scale(): number {
    return this.scaleValue;
  }

  /** Accumulated battle time in ms (only advances while scale > 0). */
  get elapsedMs(): number {
    return this.elapsedValue;
  }

  setScale(n: number): void {
    this.scaleValue = Number.isFinite(n) && n > 0 ? n : 0;
  }

  /** Back to a fresh battle: elapsed 0, no pending timers, scale x1. */
  reset(): void {
    this.scaleValue = 1;
    this.elapsedValue = 0;
    this.timers = [];
    this.nextId = 1;
  }

  /**
   * Schedule a callback in BATTLE milliseconds from now. While paused
   * it cannot fire (battle time does not advance); changing speed
   * stretches/shrinks the remaining wait proportionally.
   */
  setTimeout(cb: () => void, delayMs: number): number {
    const id = this.nextId++;
    this.timers.push({
      id,
      fireAt: this.elapsedValue + Math.max(0, delayMs),
      cb,
    });
    return id;
  }

  clearTimeout(id: number): void {
    this.timers = this.timers.filter((t) => t.id !== id);
  }

  /** Scale a raw frame delta (ms) into battle time. */
  scaleDt(dtMs: number): number {
    return dtMs * this.scaleValue;
  }

  /**
   * Advance the clock by a wall-clock delta: battle time accrues at
   * the current scale, STEPPING THROUGH each due timer's own moment —
   * the clock moves to a timer's fireAt before firing it, so a
   * callback that schedules a follow-up measures its delay from when
   * IT fired. Chains therefore land in true chronological order
   * within the same advance. While paused (scale 0) nothing advances
   * and nothing fires: a real freeze.
   */
  advance(wallDtMs: number): void {
    if (this.scaleValue <= 0) return;
    const target =
      this.elapsedValue + (wallDtMs > 0 ? wallDtMs * this.scaleValue : 0);
    for (;;) {
      let dueIdx = -1;
      for (let i = 0; i < this.timers.length; i++) {
        const t = this.timers[i];
        if (
          t.fireAt <= target &&
          (dueIdx === -1 ||
            t.fireAt < this.timers[dueIdx].fireAt ||
            (t.fireAt === this.timers[dueIdx].fireAt &&
              t.id < this.timers[dueIdx].id))
        ) {
          dueIdx = i;
        }
      }
      if (dueIdx === -1) break;
      const [timer] = this.timers.splice(dueIdx, 1);
      if (timer.fireAt > this.elapsedValue) {
        this.elapsedValue = timer.fireAt;
      }
      timer.cb();
    }
    this.elapsedValue = target;
  }
}

/** The arena battle's shared clock (module singleton). */
export const battleClock = new BattleClock();
