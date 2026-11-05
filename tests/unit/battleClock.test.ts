// Unit tests for the shared BattleClock (Task 3 — real pause freeze).
// The clock is pure: tests drive advance() by hand, so no wall clock,
// no timers, no randomness are involved.
import { describe, it, expect } from "vitest";
import { BattleClock } from "../../src/game/animation/battleClock";

describe("BattleClock", () => {
  it("accumulates battle time at the current scale", () => {
    const clock = new BattleClock();
    clock.advance(100);
    expect(clock.elapsedMs).toBe(100);
    clock.setScale(3);
    clock.advance(100);
    expect(clock.elapsedMs).toBe(400);
    clock.setScale(0.5);
    clock.advance(100);
    expect(clock.elapsedMs).toBe(450);
  });

  it("scale 0 is a real freeze: no elapsed time, no timer fires", () => {
    const clock = new BattleClock();
    let fired = 0;
    clock.setTimeout(() => {
      fired += 1;
    }, 500);
    clock.advance(400);
    clock.setScale(0);
    clock.advance(10_000);
    expect(clock.elapsedMs).toBe(400);
    expect(fired).toBe(0);
    // Resuming lets the pending wait complete with only the
    // remaining battle time.
    clock.setScale(1);
    clock.advance(99);
    expect(fired).toBe(0);
    clock.advance(1);
    expect(fired).toBe(1);
  });

  it("speed scales pending waits (x3 fires a 600ms wait after 200ms wall)", () => {
    const clock = new BattleClock();
    let fired = false;
    clock.setTimeout(() => {
      fired = true;
    }, 600);
    clock.setScale(3);
    clock.advance(199);
    expect(fired).toBe(false);
    clock.advance(1);
    expect(fired).toBe(true);
  });

  it("timers fire in schedule order and can chain", () => {
    const clock = new BattleClock();
    const order: string[] = [];
    clock.setTimeout(() => {
      order.push("late");
    }, 300);
    clock.setTimeout(() => {
      order.push("early");
      clock.setTimeout(() => {
        order.push("chained");
      }, 0);
    }, 100);
    clock.advance(500);
    expect(order).toEqual(["early", "chained", "late"]);
  });

  it("clearTimeout cancels a pending wait; reset restores x1 and clears all", () => {
    const clock = new BattleClock();
    let fired = 0;
    const id = clock.setTimeout(() => {
      fired += 1;
    }, 100);
    clock.clearTimeout(id);
    clock.advance(1000);
    expect(fired).toBe(0);

    clock.setScale(0);
    clock.setTimeout(() => {
      fired += 1;
    }, 100);
    clock.reset();
    expect(clock.scale).toBe(1);
    expect(clock.elapsedMs).toBe(0);
    clock.advance(1000);
    expect(fired).toBe(0);
  });

  it("scaleDt maps frame deltas into battle time", () => {
    const clock = new BattleClock();
    expect(clock.scaleDt(16)).toBe(16);
    clock.setScale(2);
    expect(clock.scaleDt(16)).toBe(32);
    clock.setScale(0);
    expect(clock.scaleDt(16)).toBe(0);
  });
});
