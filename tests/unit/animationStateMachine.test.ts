// Unit tests for the animation state machine.
// Pure logic testing — no React rendering.
import { describe, it, expect, vi } from "vitest";
import {
  ANIM_PRIORITY,
  AnimationStateMachine,
  isInterruptible,
} from "../../src/game/animation/stateMachine";

describe("AnimationStateMachine", () => {
  it("starts in idle and accepts free transitions between looping states", () => {
    const sm = new AnimationStateMachine();
    expect(sm.current).toBe("idle");
    expect(sm.request("walk")).toBe(true);
    expect(sm.current).toBe("walk");
    expect(sm.request("run")).toBe(true);
    expect(sm.current).toBe("run");
    expect(sm.request("idle")).toBe(true);
    expect(sm.current).toBe("idle");
  });

  it("rejects a lower-priority request while a one-shot is unfinished", () => {
    const sm = new AnimationStateMachine();
    expect(sm.request("attack")).toBe(true);
    // walk (10) < attack (50) and attack has not completed: rejected.
    expect(sm.request("walk")).toBe(false);
    expect(sm.current).toBe("attack");
    expect(sm.request("defense")).toBe(false);
    expect(sm.current).toBe("attack");
  });

  it("allows equal/higher-priority one-shots to interrupt a one-shot", () => {
    const sm = new AnimationStateMachine();
    sm.request("attack");
    expect(sm.request("skill")).toBe(true); // 60 >= 50
    expect(sm.current).toBe("skill");
  });

  it("hit interrupts attack despite the one-shot block", () => {
    const sm = new AnimationStateMachine();
    sm.request("attack");
    expect(sm.request("hit")).toBe(true);
    expect(sm.current).toBe("hit");
  });

  it("death can be entered from any state and then locks the machine", () => {
    const sm = new AnimationStateMachine();
    sm.request("attack");
    expect(sm.request("death")).toBe(true);
    expect(sm.current).toBe("death");
    expect(sm.request("idle")).toBe(false);
    expect(sm.request("hit")).toBe(false);
    expect(sm.request("victory")).toBe(false);
    sm.completeCurrent();
    expect(sm.current).toBe("death");
  });

  it("hit does not interrupt death", () => {
    const sm = new AnimationStateMachine();
    sm.request("death");
    expect(sm.request("hit")).toBe(false);
    expect(sm.current).toBe("death");
  });

  it("queues attack -> combo with { queue: true } and runs it on completeCurrent", () => {
    const onEnter = vi.fn();
    const sm = new AnimationStateMachine({ onEnter });
    sm.request("attack");
    // { queue: true } stores the combo behind the running attack instead
    // of letting combo's higher priority cut the attack short.
    expect(sm.request("combo", { queue: true })).toBe(true);
    expect(sm.current).toBe("attack");
    expect(sm.queued).toBe("combo");
    sm.completeCurrent();
    expect(sm.current).toBe("combo");
    expect(sm.queued).toBe(null);
    expect(onEnter).toHaveBeenCalledWith("combo");
  });

  it("completeCurrent returns a finished one-shot to idle", () => {
    const sm = new AnimationStateMachine();
    sm.request("attack");
    sm.completeCurrent();
    expect(sm.current).toBe("idle");
    // Completing idle itself is a harmless no-op.
    sm.completeCurrent();
    expect(sm.current).toBe("idle");
  });

  it("victory is terminal: completeCurrent keeps it", () => {
    const sm = new AnimationStateMachine();
    sm.request("victory");
    sm.completeCurrent();
    expect(sm.current).toBe("victory");
  });

  it("requesting the current state is an accepted no-op", () => {
    const onEnter = vi.fn();
    const sm = new AnimationStateMachine({ onEnter });
    expect(sm.request("idle")).toBe(true);
    expect(sm.current).toBe("idle");
    expect(onEnter).not.toHaveBeenCalled();
  });

  it("fires onEnter on real transitions only", () => {
    const onEnter = vi.fn();
    const sm = new AnimationStateMachine({ onEnter });
    sm.request("walk");
    sm.request("walk");
    expect(onEnter).toHaveBeenCalledTimes(1);
    expect(onEnter).toHaveBeenCalledWith("walk");
  });

  it("priorities are ordered death > hit > skill > attack > idle", () => {
    expect(ANIM_PRIORITY.death).toBeGreaterThan(ANIM_PRIORITY.hit);
    expect(ANIM_PRIORITY.hit).toBeGreaterThan(ANIM_PRIORITY.skill);
    expect(ANIM_PRIORITY.skill).toBeGreaterThan(ANIM_PRIORITY.attack);
    expect(ANIM_PRIORITY.attack).toBeGreaterThan(ANIM_PRIORITY.idle);
    expect(ANIM_PRIORITY.idle).toBe(0);
  });

  it("isInterruptible: looping states yes, one-shots no, death never", () => {
    expect(isInterruptible("idle")).toBe(true);
    expect(isInterruptible("walk")).toBe(true);
    expect(isInterruptible("attack")).toBe(false);
    expect(isInterruptible("death")).toBe(false);
    const sm = new AnimationStateMachine();
    expect(sm.isInterruptible()).toBe(true); // idle
    sm.request("death");
    expect(sm.isInterruptible()).toBe(false);
  });
});
