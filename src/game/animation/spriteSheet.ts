// Crabtopia - Sprite sheet math (pure, unit-testable).
//
// Everything in this module is a pure function of (definition, absolute
// time): no clocks, no DOM, no side effects. That makes playback fully
// deterministic in tests — AnimationPlayer (player.ts) owns the mutable
// playhead and builds on top of these helpers.

export type LoopMode = "loop" | "once" | "pingpong";

export interface AnimationDef {
  /** Sheet frame indices, in playback order. */
  frames: number[];
  /** Frames per second. */
  fps: number;
  loop: LoopMode;
  /**
   * Optional named events keyed by INDEX INTO `frames` (not by sheet
   * frame number): events[2] fires when playback enters frames[2].
   */
  events?: Record<number, string>;
}

export interface SpriteSheetDef {
  src: string;
  frameWidth: number;
  frameHeight: number;
  cols: number;
  rows: number;
  animations: Record<string, AnimationDef>;
}

/** A single-strip flipbook effect (slash, spark, heal, ...). */
export interface FxDef {
  src: string;
  frameWidth: number;
  frameHeight: number;
  /** Total frame count in the strip. */
  frames: number;
  fps: number;
}

export interface FrameAtTime {
  /** Index into def.frames for the current step. */
  index: number;
  /** Sheet frame number to draw (def.frames[index]). */
  frame: number;
  /** True once a "once" animation has played past its last frame. */
  finished: boolean;
  /**
   * Event attached to the CURRENT frame index, if any. Events that were
   * skipped over between two observations are NOT collected here — that
   * is what eventsBetween() is for (and what AnimationPlayer uses).
   */
  eventsFired: string[];
}

export interface FiredEvent {
  name: string;
  /** Index into def.frames whose entry fired the event. */
  index: number;
  /** Sheet frame number (def.frames[index]). */
  frame: number;
}

function frameDurationMs(def: AnimationDef): number {
  return def.fps > 0 ? 1000 / def.fps : Number.POSITIVE_INFINITY;
}

/** Total duration of one pass through the animation, in ms. */
export function animationDurationMs(def: AnimationDef): number {
  return def.frames.length * frameDurationMs(def);
}

/** Map an absolute step counter to an index into def.frames. */
export function indexAtStep(def: AnimationDef, step: number): number {
  const n = def.frames.length;
  if (n === 0) return 0;
  if (def.loop === "loop") {
    return ((step % n) + n) % n;
  }
  if (def.loop === "pingpong") {
    if (n === 1) return 0;
    const period = 2 * n - 2;
    const pos = ((step % period) + period) % period;
    return pos < n ? pos : period - pos;
  }
  // "once": clamp on the last frame.
  if (step < 0) return 0;
  return Math.min(step, n - 1);
}

/**
 * Frame state at an absolute time. `speed` multiplies time (2 = twice as
 * fast). Negative times clamp to the first frame.
 */
export function frameAtTime(
  def: AnimationDef,
  timeMs: number,
  speed = 1,
): FrameAtTime {
  const n = def.frames.length;
  if (n === 0) return { index: 0, frame: 0, finished: true, eventsFired: [] };
  const t = Math.max(0, timeMs * (speed > 0 ? speed : 0));
  const step = Math.floor(t / frameDurationMs(def));
  const index = indexAtStep(def, step);
  const finished = def.loop === "once" && step >= n;
  const ev = def.events?.[index];
  return {
    index,
    frame: def.frames[index],
    finished,
    eventsFired: ev ? [ev] : [],
  };
}

/**
 * Detailed events whose frames are ENTERED in the interval
 * (prevTimeMs, nextTimeMs] — i.e. stepping from the frame active at
 * prevTimeMs up to and including the frame active at nextTimeMs.
 * Handles loop wrap-around and pingpong reversal; for "once" it stops
 * at the last frame and never re-fires it. An event on frame 0 therefore
 * fires when a loop wraps back onto it, but not at time 0 itself
 * (nothing has been entered yet at the start of playback).
 */
export function collectEventsBetween(
  def: AnimationDef,
  prevTimeMs: number,
  nextTimeMs: number,
  speed = 1,
): FiredEvent[] {
  const out: FiredEvent[] = [];
  const n = def.frames.length;
  if (n === 0 || !def.events) return out;
  const mult = speed > 0 ? speed : 0;
  const prev = Math.max(0, prevTimeMs * mult);
  const next = Math.max(0, nextTimeMs * mult);
  if (next <= prev) return out;
  const dur = frameDurationMs(def);
  if (!Number.isFinite(dur)) return out;
  const startStep = Math.floor(prev / dur);
  let endStep = Math.floor(next / dur);
  if (def.loop === "once") endStep = Math.min(endStep, n - 1);
  // Safety cap against absurd intervals (e.g. a tab refocus after days):
  // at most 10k frame entries are scanned per call.
  const lastStep = Math.min(endStep, startStep + 10000);
  for (let step = startStep + 1; step <= lastStep; step++) {
    const index = indexAtStep(def, step);
    const name = def.events[index];
    if (name) out.push({ name, index, frame: def.frames[index] });
  }
  return out;
}

/** Names of the events triggered in (prevTimeMs, nextTimeMs]. */
export function eventsBetween(
  def: AnimationDef,
  prevTimeMs: number,
  nextTimeMs: number,
  speed = 1,
): string[] {
  return collectEventsBetween(def, prevTimeMs, nextTimeMs, speed).map(
    (e) => e.name,
  );
}

/** Pixel rectangle of a sheet frame inside the sheet image. */
export function frameRect(
  sheet: SpriteSheetDef,
  frameIndex: number,
): { x: number; y: number; w: number; h: number } {
  const cols = Math.max(1, sheet.cols);
  const col = ((frameIndex % cols) + cols) % cols;
  const row = Math.floor(Math.max(0, frameIndex) / cols);
  return {
    x: col * sheet.frameWidth,
    y: row * sheet.frameHeight,
    w: sheet.frameWidth,
    h: sheet.frameHeight,
  };
}

/**
 * CSS `background-size` companion for backgroundPosition(): the sheet
 * scaled so one frame exactly fills the element.
 */
export function backgroundSize(sheet: SpriteSheetDef): string {
  return `${sheet.cols * 100}% ${sheet.rows * 100}%`;
}

/**
 * CSS `background-position` string for showing `frameIndex`, assuming
 * `background-size: backgroundSize(sheet)` (cols*100% / rows*100%).
 * Percentages follow the standard sprite formula: 0% aligns the start
 * edge, 100% the end edge, so column c of C maps to c/(C-1)*100%.
 *
 * displayW/displayH are accepted for signature compatibility with
 * pixel-based renderers but are not needed by the percentage formula —
 * the browser scales the sheet to the element via background-size.
 */
export function backgroundPosition(
  sheet: SpriteSheetDef,
  frameIndex: number,
  displayW: number,
  displayH: number,
): string {
  void displayW;
  void displayH;
  const rect = frameRect(sheet, frameIndex);
  const col = sheet.frameWidth > 0 ? rect.x / sheet.frameWidth : 0;
  const row = sheet.frameHeight > 0 ? rect.y / sheet.frameHeight : 0;
  const xPct = sheet.cols > 1 ? (col / (sheet.cols - 1)) * 100 : 0;
  const yPct = sheet.rows > 1 ? (row / (sheet.rows - 1)) * 100 : 0;
  return `${xPct}% ${yPct}%`;
}
