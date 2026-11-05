// Unit tests for the sprite animation engine (spriteSheet + player).
// Pure logic testing — no React rendering, no clocks: time advances
// only through explicit update(dtMs) calls.
import { describe, it, expect, vi } from "vitest";
import { AnimationPlayer } from "../../src/game/animation/player";
import {
  backgroundPosition,
  backgroundSize,
  eventsBetween,
  frameAtTime,
  frameRect,
} from "../../src/game/animation/spriteSheet";
import type {
  AnimationDef,
  SpriteSheetDef,
} from "../../src/game/animation/spriteSheet";

// 4 frames at 10fps => 100ms per frame, frames numbered 10..13 on the sheet.
const loopDef: AnimationDef = { frames: [10, 11, 12, 13], fps: 10, loop: "loop" };
const onceDef: AnimationDef = { frames: [10, 11, 12, 13], fps: 10, loop: "once" };

describe("frameAtTime", () => {
  it("advances frames according to fps", () => {
    expect(frameAtTime(loopDef, 0).frame).toBe(10);
    expect(frameAtTime(loopDef, 99).frame).toBe(10);
    expect(frameAtTime(loopDef, 100).frame).toBe(11);
    expect(frameAtTime(loopDef, 250).frame).toBe(12);
  });

  it("wraps loop animations and never finishes them", () => {
    expect(frameAtTime(loopDef, 400).frame).toBe(10);
    expect(frameAtTime(loopDef, 550).frame).toBe(11);
    expect(frameAtTime(loopDef, 100000).finished).toBe(false);
  });

  it("clamps once animations on the last frame and reports finished", () => {
    expect(frameAtTime(onceDef, 300).frame).toBe(13);
    expect(frameAtTime(onceDef, 399).finished).toBe(false);
    expect(frameAtTime(onceDef, 400).finished).toBe(true);
    expect(frameAtTime(onceDef, 99999).frame).toBe(13);
  });

  it("pingpong reverses at the ends", () => {
    const pp: AnimationDef = { frames: [0, 1, 2], fps: 10, loop: "pingpong" };
    const seq = [0, 100, 200, 300, 400, 500].map(
      (t) => frameAtTime(pp, t).frame,
    );
    expect(seq).toEqual([0, 1, 2, 1, 0, 1]);
  });
});

describe("eventsBetween", () => {
  const withEvents: AnimationDef = {
    frames: [0, 1, 2, 3],
    fps: 10,
    loop: "loop",
    events: { 1: "step", 0: "wrap" },
  };

  it("reports events for frames entered inside the interval", () => {
    expect(eventsBetween(withEvents, 0, 150)).toEqual(["step"]);
    expect(eventsBetween(withEvents, 0, 50)).toEqual([]);
  });

  it("reports the frame-0 event when a loop wraps onto it", () => {
    expect(eventsBetween(withEvents, 350, 450)).toEqual(["wrap"]);
  });

  it("does not re-fire the last frame of a once animation", () => {
    const onceEvents: AnimationDef = {
      frames: [0, 1, 2, 3],
      fps: 10,
      loop: "once",
      events: { 3: "end" },
    };
    expect(eventsBetween(onceEvents, 0, 10000)).toEqual(["end"]);
  });
});

describe("sheet geometry helpers", () => {
  const sheet: SpriteSheetDef = {
    src: "/sprites/test.png",
    frameWidth: 64,
    frameHeight: 48,
    cols: 4,
    rows: 4,
    animations: {},
  };

  it("frameRect maps frame index to a pixel rectangle", () => {
    expect(frameRect(sheet, 0)).toEqual({ x: 0, y: 0, w: 64, h: 48 });
    expect(frameRect(sheet, 5)).toEqual({ x: 64, y: 48, w: 64, h: 48 });
    expect(frameRect(sheet, 15)).toEqual({ x: 192, y: 144, w: 64, h: 48 });
  });

  it("background helpers follow the standard sprite CSS formula", () => {
    expect(backgroundSize(sheet)).toBe("400% 400%");
    expect(backgroundPosition(sheet, 0, 128, 128)).toBe("0% 0%");
    expect(backgroundPosition(sheet, 15, 128, 128)).toBe("100% 100%");
    expect(backgroundPosition(sheet, 5, 128, 128)).toBe(
      `${(1 / 3) * 100}% ${(1 / 3) * 100}%`,
    );
  });
});

describe("AnimationPlayer", () => {
  it("advances frames in order according to fps", () => {
    const p = new AnimationPlayer(loopDef);
    expect(p.currentFrame).toBe(10);
    expect(p.update(100)).toBe(11);
    expect(p.update(100)).toBe(12);
    expect(p.currentIndex).toBe(2);
  });

  it("wraps around on loop animations", () => {
    const p = new AnimationPlayer(loopDef);
    p.update(300);
    expect(p.currentFrame).toBe(13);
    expect(p.update(100)).toBe(10);
    expect(p.finished).toBe(false);
  });

  it("finishes once animations and fires onComplete exactly once", () => {
    const onComplete = vi.fn();
    const p = new AnimationPlayer(onceDef, { onComplete });
    p.update(1000);
    expect(p.currentFrame).toBe(13);
    expect(p.finished).toBe(true);
    expect(onComplete).toHaveBeenCalledTimes(1);
    // Later updates are no-ops and must not re-fire onComplete.
    p.update(1000);
    expect(p.currentFrame).toBe(13);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("fires frame events when their frame is entered", () => {
    const onEvent = vi.fn();
    const def: AnimationDef = {
      frames: [20, 21, 22, 23],
      fps: 10,
      loop: "once",
      events: { 2: "hitMoment" },
    };
    const p = new AnimationPlayer(def, { onEvent });
    p.update(100); // enters frame index 1 — no event
    expect(onEvent).not.toHaveBeenCalled();
    p.update(100); // enters frame index 2 — hitMoment on sheet frame 22
    expect(onEvent).toHaveBeenCalledTimes(1);
    expect(onEvent).toHaveBeenCalledWith("hitMoment", 22);
  });

  it("fires events for several frames skipped by one large update", () => {
    const onEvent = vi.fn();
    const def: AnimationDef = {
      frames: [0, 1, 2, 3],
      fps: 10,
      loop: "loop",
      events: { 1: "a", 3: "b" },
    };
    const p = new AnimationPlayer(def, { onEvent });
    p.update(350);
    expect(onEvent.mock.calls).toEqual([
      ["a", 1],
      ["b", 3],
    ]);
  });

  it("speed 2x advances playback twice as fast", () => {
    const p = new AnimationPlayer(loopDef, { speed: 2 });
    expect(p.update(50)).toBe(11); // 50ms * 2 = 100ms of animation time
    const q = new AnimationPlayer(loopDef);
    q.setSpeed(2);
    expect(q.update(100)).toBe(12);
  });

  it("pause freezes the playhead and resume continues it", () => {
    const p = new AnimationPlayer(loopDef);
    p.update(100);
    p.pause();
    expect(p.playing).toBe(false);
    expect(p.update(500)).toBe(11);
    p.resume();
    expect(p.update(100)).toBe(12);
  });

  it("play() with a new definition restarts on that definition", () => {
    const p = new AnimationPlayer(loopDef);
    p.update(200);
    p.play({ frames: [7, 8], fps: 10, loop: "loop" });
    expect(p.currentFrame).toBe(7);
    expect(p.finished).toBe(false);
    expect(p.update(100)).toBe(8);
  });

  it("reset returns to the first frame and re-arms completion", () => {
    const onComplete = vi.fn();
    const p = new AnimationPlayer(onceDef, { onComplete });
    p.update(1000);
    expect(onComplete).toHaveBeenCalledTimes(1);
    p.reset();
    expect(p.currentFrame).toBe(10);
    expect(p.finished).toBe(false);
    p.update(1000);
    expect(onComplete).toHaveBeenCalledTimes(2);
  });
});
