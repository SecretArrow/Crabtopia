// Crabtopia — Slot Layout (Option A: AFK-Arena style anchored slots)
// ---------------------------------------------------------------------------
// Single source of truth for WHERE a combatant stands on the battlefield.
// Both the deployment board (ArenaTeamBuilder) and the live battle
// (ArenaBattle) render from these exact functions, so the formation a
// player arranges is pixel-for-pixel the formation that fights.
//
// The field is a percentage coordinate space (0..100 on both axes):
//   - X = formation-row columns. The player defends the LEFT half, the
//     enemy the RIGHT half, mirrored exactly: back is furthest from the
//     centre line, mid in between, front closest to the centre — so the
//     two frontlines face each other across the middle.
//   - Y = vertical lanes. Crabs sharing a row are spread evenly over the
//     lane band, same order on both sides, so lane i faces lane i.
//
// Every crab owns a SLOT BOX of uniform size (see uniformSlotBox). Column
// and lane spacing are chosen so slot boxes can NEVER overlap at rest:
// neighbouring column centres are 16% apart (box width 15%), neighbouring
// lane centres at most 3-per-row are 25% apart (box height 24%). Attack
// lunges are the only intended excursions, and they stop at the edge of
// the target's slot box (see attackPoint).
//
// Pure functions only — no DOM, no engine state. Presentation layer: the
// combat rules (targeting, row damage factors) live in the engine and are
// NOT affected by anything in this file.

import type { RowId } from "../../engine/formation";

export type BattleSide = "player" | "enemy";
export type SlotRow = RowId; // "front" | "mid" | "back"

export const SLOT_ROWS: readonly SlotRow[] = ["front", "mid", "back"];

/** Lane band: lane centres live inside [LANE_BAND_TOP, LANE_BAND_BOTTOM]. */
export const LANE_BAND_TOP = 12.5;
export const LANE_BAND_BOTTOM = 87.5;

/** Column centres (x %) for the player. Enemy columns mirror these. */
const PLAYER_COLUMN_X: Record<SlotRow, number> = {
  back: 10,
  mid: 26,
  front: 42,
};

export const CENTER_X = 50;

export interface SlotBoxSize {
  widthPct: number;
  heightPct: number;
}

/**
 * Uniform slot box for a whole battle/board. Width never changes (column
 * spacing is fixed). Height is 24% while no row holds more than 3 crabs
 * (every formation preset); exotic hand-built rows of 4–5 shrink the box
 * height to the lane gap minus slack so boxes still cannot overlap.
 */
export function uniformSlotBox(maxRowCount: number): SlotBoxSize {
  if (maxRowCount <= 3) return { widthPct: 15, heightPct: 24 };
  const laneGap = (LANE_BAND_BOTTOM - LANE_BAND_TOP) / maxRowCount;
  return { widthPct: 15, heightPct: Math.max(8, laneGap - 1.5) };
}

/** Default slot box (preset formations, max 3 per row). */
export const SLOT_BOX: SlotBoxSize = uniformSlotBox(3);

// ---------------------------------------------------------------------------
// FIXED 5-LANE GRID (free placement)
// ---------------------------------------------------------------------------
// The deployment board is a free-placement grid: 3 rows (front/mid/back) ×
// 5 lanes. A crab can be placed in ANY of the 15 cells per side, and its
// lane carries into battle so the renderer shows it exactly where the user
// put it. Fixed lane positions (independent of how many crabs share a row)
// keep cells stable — empty cells stay put so the player can tap them.

/** Number of lanes per row in the free-placement grid. */
export const FIXED_LANE_COUNT = 5;

/** Slot box for the fixed 5-lane grid (height fits 5 lanes in the band). */
export const FIXED_SLOT_BOX: SlotBoxSize = uniformSlotBox(FIXED_LANE_COUNT);

/** Y centre (%) of lane `lane` (0..4) on the FIXED 5-lane grid. */
export function fixedLaneY(lane: number): number {
  const i = Math.min(Math.max(0, Math.floor(lane)), FIXED_LANE_COUNT - 1);
  return laneY(i, FIXED_LANE_COUNT);
}

/**
 * Anchor for a crab freely placed at (row, lane) on the fixed 5-lane grid.
 * Used by BOTH the deployment board and the live battle so a formation
 * arranged by the player is pixel-for-pixel the formation that fights.
 */
export function fixedSlotAnchor(
  side: BattleSide,
  row: SlotRow,
  lane: number,
): SlotAnchor {
  return {
    x: columnX(side, row),
    y: fixedLaneY(lane),
    lane,
  };
}

/** Stable unique key for a fixed-grid cell, e.g. "player-front-2". */
export function fixedSlotKey(
  side: BattleSide,
  row: SlotRow,
  lane: number,
): string {
  return `${side}-${row}-${lane}`;
}

/** X centre (%) of a row's column for a side. Enemy mirrors the player. */
export function columnX(side: BattleSide, row: SlotRow): number {
  const x = PLAYER_COLUMN_X[row];
  return side === "player" ? x : 100 - x;
}

/** Y centre (%) of lane `indexInRow` within a row of `rowCount` crabs. */
export function laneY(indexInRow: number, rowCount: number): number {
  const n = Math.max(1, rowCount);
  const i = Math.min(Math.max(0, indexInRow), n - 1);
  const band = LANE_BAND_BOTTOM - LANE_BAND_TOP;
  return LANE_BAND_TOP + ((i + 0.5) / n) * band;
}

export interface SlotAnchor {
  /** Slot box centre, % of field width. */
  x: number;
  /** Slot box centre, % of field height. */
  y: number;
  /** Lane index within the row (0 = topmost). */
  lane: number;
}

/** Anchor (slot-box centre) for one combatant. */
export function slotAnchor(
  side: BattleSide,
  row: SlotRow,
  indexInRow: number,
  rowCount: number,
): SlotAnchor {
  const n = Math.max(1, rowCount);
  const lane = Math.min(Math.max(0, indexInRow), n - 1);
  return { x: columnX(side, row), y: laneY(lane, n), lane };
}

/** Stable unique key for a slot, e.g. "player-front-0". */
export function slotKey(
  side: BattleSide,
  row: SlotRow,
  indexInRow: number,
): string {
  return `${side}-${row}-${indexInRow}`;
}

export interface SlotRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** The slot box rectangle (%) around an anchor. */
export function slotBoxRect(
  anchor: SlotAnchor,
  box: SlotBoxSize = SLOT_BOX,
): SlotRect {
  return {
    left: anchor.x - box.widthPct / 2,
    top: anchor.y - box.heightPct / 2,
    right: anchor.x + box.widthPct / 2,
    bottom: anchor.y + box.heightPct / 2,
  };
}

/** True when two % rectangles strictly intersect (touching is allowed). */
export function rectsOverlap(a: SlotRect, b: SlotRect): boolean {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}

/** True when a point lies strictly inside a rectangle. */
export function pointInRect(
  p: { x: number; y: number },
  r: SlotRect,
): boolean {
  return p.x > r.left && p.x < r.right && p.y > r.top && p.y < r.bottom;
}

/**
 * Anchors for a full side given its row sizes, keyed by slotKey.
 * `rows` maps each row to its member count.
 */
export function layoutForRows(
  side: BattleSide,
  rows: Record<SlotRow, number>,
): Map<string, SlotAnchor> {
  const out = new Map<string, SlotAnchor>();
  for (const row of SLOT_ROWS) {
    const count = rows[row] ?? 0;
    for (let i = 0; i < count; i++) {
      out.set(slotKey(side, row, i), slotAnchor(side, row, i, count));
    }
  }
  return out;
}

/**
 * The point an attacker lunges to: on the actor→target axis, stopping at
 * the EDGE of the target's slot box (plus a small margin), never entering
 * it. Returned in field % coordinates.
 */
export function attackPoint(
  actor: SlotAnchor,
  target: SlotAnchor,
  box: SlotBoxSize = SLOT_BOX,
  marginPct = 1,
): { x: number; y: number } {
  const dx = target.x - actor.x;
  const dy = target.y - actor.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 1e-6) return { x: actor.x, y: actor.y };
  const ux = dx / dist;
  const uy = dy / dist;
  // Distance from the target centre back along -u to the box boundary
  // (slab method), so the stop point sits exactly on the box edge.
  const sx = Math.abs(ux) > 1e-9 ? box.widthPct / 2 / Math.abs(ux) : Infinity;
  const sy = Math.abs(uy) > 1e-9 ? box.heightPct / 2 / Math.abs(uy) : Infinity;
  const back = Math.min(sx, sy) + marginPct;
  return { x: target.x - ux * back, y: target.y - uy * back };
}
