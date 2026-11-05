// Crabtopia - Tactical formation engine (pure, unit-testable).
//
// A team's 5 crabs deploy onto a battlefield in three rows:
//   front — frontline: meets melee attacks first, guarded (+defense)
//   mid   — midline: neutral
//   back  — backline: protected while the frontline stands, ranged home
//
// A Formation is stored per team (Team.formation) together with the last
// preset applied (Team.formationPreset). Legacy teams without a stored
// formation derive one deterministically from their slot order + preset.
import type { Crab, Formation, FormationPresetId, Team } from "../types";
import { TEAM_SIZE, filledCrabIds } from "./teams";

export type RowId = "front" | "mid" | "back";
export const ROWS: readonly RowId[] = ["front", "mid", "back"];

export interface FormationPreset {
  id: Exclude<FormationPresetId, "custom">;
  label: string;
  blurb: string;
  /** How many of the 5 members stand in each row. Always sums to 5. */
  rows: Record<RowId, number>;
}

export const FORMATION_PRESETS: Record<
  Exclude<FormationPresetId, "custom">,
  FormationPreset
> = {
  balanced: {
    id: "balanced",
    label: "Balanced",
    blurb: "2 front · 1 mid · 2 back. A guard, a flex, and a protected rear.",
    rows: { front: 2, mid: 1, back: 2 },
  },
  offensive: {
    id: "offensive",
    label: "Offensive",
    blurb: "3 front · 1 mid · 1 back. Maximum pressure on the enemy line.",
    rows: { front: 3, mid: 1, back: 1 },
  },
  defensive: {
    id: "defensive",
    label: "Defensive",
    blurb: "1 front · 2 mid · 2 back. Deep ranks, casters stay covered.",
    rows: { front: 1, mid: 2, back: 2 },
  },
  frontline: {
    id: "frontline",
    label: "Frontline",
    blurb: "3 front · 2 mid · 0 back. Everyone in the scrum — no hiding.",
    rows: { front: 3, mid: 2, back: 0 },
  },
  backline: {
    id: "backline",
    label: "Backline",
    blurb: "1 front · 1 mid · 3 back. One anchor, three protected casters.",
    rows: { front: 1, mid: 1, back: 3 },
  },
};

export const FORMATION_PRESET_LIST: FormationPreset[] = [
  FORMATION_PRESETS.balanced,
  FORMATION_PRESETS.offensive,
  FORMATION_PRESETS.defensive,
  FORMATION_PRESETS.frontline,
  FORMATION_PRESETS.backline,
];

/** Flatten a formation into deployment order: front row, then mid, then back. */
export function flattenFormation(f: Formation): string[] {
  return [...f.front, ...f.mid, ...f.back];
}

/** Deployment order = the order crabs enter battle (front first). */
export function deploymentOrder(f: Formation): string[] {
  return flattenFormation(f);
}

/** Which row a crab stands in, or null when it is not in the formation. */
export function rowOf(f: Formation, crabId: string): RowId | null {
  for (const row of ROWS) {
    if (f[row].includes(crabId)) return row;
  }
  return null;
}

/**
 * A formation is valid for a team when it contains exactly the team's
 * filled crab ids — every member exactly once, nobody else, 5 total.
 */
export function validateFormation(
  f: Formation,
  expectedIds: readonly string[]
): boolean {
  const flat = flattenFormation(f);
  if (flat.length !== TEAM_SIZE) return false;
  if (new Set(flat).size !== flat.length) return false;
  const expected = new Set(filledCrabIds(expectedIds));
  if (expected.size !== TEAM_SIZE) return false;
  return flat.every((id) => expected.has(id));
}

/** Slice an ordered list of 5 ids into rows using a preset's row sizes. */
export function formationFromOrder(
  orderedIds: readonly string[],
  preset: FormationPresetId
): Formation {
  const sizes =
    preset === "custom"
      ? FORMATION_PRESETS.balanced.rows
      : FORMATION_PRESETS[preset].rows;
  const ids = filledCrabIds(orderedIds).slice(0, TEAM_SIZE);
  return {
    front: ids.slice(0, sizes.front),
    mid: ids.slice(sizes.front, sizes.front + sizes.mid),
    back: ids.slice(sizes.front + sizes.mid, sizes.front + sizes.mid + sizes.back),
  };
}

/**
 * Re-slice an existing formation with a different preset. The current
 * deployment order (front→mid→back) is preserved; only the row sizes change.
 */
export function applyFormationPreset(
  current: Formation,
  preset: Exclude<FormationPresetId, "custom">
): Formation {
  return formationFromOrder(flattenFormation(current), preset);
}

/** Move one crab to a different row (appended to that row). Pure. */
export function moveCrabToRow(
  f: Formation,
  crabId: string,
  row: RowId
): Formation {
  const next: Formation = {
    front: f.front.filter((id) => id !== crabId),
    mid: f.mid.filter((id) => id !== crabId),
    back: f.back.filter((id) => id !== crabId),
  };
  next[row] = [...next[row], crabId];
  return next;
}

/** Swap the positions of two crabs (possibly in different rows). Pure. */
export function swapCrabs(f: Formation, a: string, b: string): Formation {
  if (a === b) return f;
  const ra = rowOf(f, a);
  const rb = rowOf(f, b);
  if (!ra || !rb) return f;
  const next: Formation = {
    front: [...f.front],
    mid: [...f.mid],
    back: [...f.back],
  };
  if (ra === rb) {
    // Same row: ONE pass swaps both ids. Two sequential maps on the same
    // array used to turn [a, b] into [b, b] and then [a, a] — duplicating
    // one crab and ERASING the other (crabs vanished from the deployment
    // board; validateFormation then rejected the persist).
    next[ra] = next[ra].map((id) => (id === a ? b : id === b ? a : id));
  } else {
    next[ra] = next[ra].map((id) => (id === a ? b : id));
    next[rb] = next[rb].map((id) => (id === b ? a : id));
  }
  return next;
}

// ---------------------------------------------------------------------------
// FREE PLACEMENT — 5-lane × 3-row cell grid
// ---------------------------------------------------------------------------
// A crab's lane within its row is its index in the row array. The deployment
// board lets the player drop a crab on any of 5 lanes per row; these helpers
// move crabs to a chosen (row, lane) cell, keeping each row's array sorted by
// lane so the order always reflects the on-board left-to-right layout.

/** The {row, lane} cell a crab occupies, or null when it is not placed. */
export function cellOf(
  f: Formation,
  crabId: string,
): { row: RowId; lane: number } | null {
  for (const row of ROWS) {
    const lane = f[row].indexOf(crabId);
    if (lane >= 0) return { row, lane };
  }
  return null;
}

/** Lane (index within row) of a crab, or null when not placed. */
export function laneOf(f: Formation, crabId: string): number | null {
  const cell = cellOf(f, crabId);
  return cell ? cell.lane : null;
}

/** The crab id occupying (row, lane), or null when the cell is empty. */
export function crabAtCell(
  f: Formation,
  row: RowId,
  lane: number,
): string | null {
  const arr = f[row];
  if (lane < 0 || lane >= arr.length) return null;
  return arr[lane] ?? null;
}

/**
 * Move `crabId` to (row, lane), shifting the row's crabs to keep the array
 * sorted by lane. Other rows simply lose the crab. Pure — returns a new
 * Formation. Used by the deployment board's tap-to-place interaction.
 *
 * If the target cell is occupied, the occupying crab is bumped to the next
 * free lane in the same row (so neither crab is lost).
 */
export function placeAtCell(
  f: Formation,
  crabId: string,
  row: RowId,
  lane: number,
): Formation {
  // Remove the crab from its current row.
  const next: Formation = {
    front: f.front.filter((id) => id !== crabId),
    mid: f.mid.filter((id) => id !== crabId),
    back: f.back.filter((id) => id !== crabId),
  };
  const clampedLane = Math.min(Math.max(0, Math.floor(lane)), 4);
  const target = [...next[row]];
  // Insert at the position that keeps the row sorted by lane. Existing
  // members keep their relative order; the new crab slots before the first
  // member currently at or past the chosen lane.
  let insertAt = target.length;
  for (let i = 0; i < target.length; i++) {
    if (i >= clampedLane) {
      insertAt = i;
      break;
    }
  }
  target.splice(insertAt, 0, crabId);
  next[row] = target;
  return next;
}

/**
 * Build a lane map (crabId → lane within its row) from a formation. Used to
 * pass free-placement positions into initBattle so the battle renderer can
 * place each crab at its chosen lane on the fixed 5-lane grid.
 */
export function lanesFromFormation(f: Formation): Record<string, number> {
  const out: Record<string, number> = {};
  for (const row of ROWS) {
    f[row].forEach((id, lane) => {
      if (id) out[id] = lane;
    });
  }
  return out;
}

// Class row preference for smart default formations (NPC/opponent teams and
// any roster without a saved formation): 0 = wants front, 1 = mid, 2 = back.
const CLASS_ROW_SCORE: Record<string, number> = {
  bulwark: 0, // Tank
  warden: 0, // Controller — tanky binder
  reaver: 1, // DPS
  pincher: 1, // All-rounder
  gildclaw: 1, // Luck DPS
  skitter: 1, // Speedster
  tidecaller: 2, // Mage
  shellmender: 2, // Healer
};

/**
 * Derive a formation for an arbitrary roster (used for opponent teams):
 * members are stably sorted by class row preference, then sliced by preset.
 */
export function deriveFormationForCrabs(
  crabs: readonly Crab[],
  preset: FormationPresetId = "balanced"
): Formation {
  const sorted = [...crabs].sort(
    (a, b) =>
      (CLASS_ROW_SCORE[a.classId] ?? 1) - (CLASS_ROW_SCORE[b.classId] ?? 1)
  );
  return formationFromOrder(
    sorted.map((c) => c.id),
    preset
  );
}

/**
 * The authoritative formation for a saved team:
 * 1. the stored Team.formation, when it still matches the team's members;
 * 2. otherwise derived from slot order with the team's saved preset
 *    (default Balanced). Never mutates the team.
 */
export function resolveTeamFormation(team: Team): Formation {
  const ids = filledCrabIds(team.crabIds);
  if (team.formation && validateFormation(team.formation, ids)) {
    return team.formation;
  }
  return formationFromOrder(ids, team.formationPreset ?? "balanced");
}
