// Crabtopia - Team validation rules (pure, unit-testable).
//
// One team is ALWAYS exactly 5 crabs in 5 slots. A team may be created and
// edited freely, but it can only be saved/deployed as a fighting team when
// all 5 slots are filled with 5 distinct crabs.
import type { Crab, Team } from "../types";
import { crabBaseBP, teamBP } from "./bp";

export const TEAM_SIZE = 5;

export type TeamValidationError = "too_few" | "too_many" | "duplicate";

export interface TeamValidation {
  valid: boolean;
  filled: number;
  errors: TeamValidationError[];
}

/** Distinct, non-empty crab ids in slot order. */
export function filledCrabIds(crabIds: readonly string[]): string[] {
  return crabIds.filter((id) => typeof id === "string" && id.length > 0);
}

/**
 * Normalize any stored crabIds array into exactly TEAM_SIZE slots:
 * duplicates removed (first occurrence wins), missing slots padded with "",
 * extra entries beyond 5 slots dropped. Used to migrate legacy teams that
 * were saved with fewer than 5 slots.
 */
export function normalizeTeamSlots(crabIds: readonly string[]): string[] {
  const seen = new Set<string>();
  const slots: string[] = [];
  for (const id of crabIds) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    slots.push(id);
    if (slots.length === TEAM_SIZE) break;
  }
  while (slots.length < TEAM_SIZE) slots.push("");
  return slots;
}

/**
 * Positional view of a team's slots: always exactly TEAM_SIZE entries,
 * preserving slot positions ("" = empty slot). Duplicate ids keep only
 * their first slot; later duplicates are cleared. Used by slot-based
 * editors (Teams screen) where positions matter.
 */
export function toTeamSlots(crabIds: readonly string[]): string[] {
  const slots: string[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < TEAM_SIZE; i++) {
    const id = crabIds[i] ?? "";
    if (id && !seen.has(id)) {
      seen.add(id);
      slots.push(id);
    } else {
      slots.push("");
    }
  }
  return slots;
}

export function validateTeam(crabIds: readonly string[]): TeamValidation {
  const errors: TeamValidationError[] = [];
  const filled = filledCrabIds(crabIds);
  const unique = new Set(filled);
  if (unique.size !== filled.length) errors.push("duplicate");
  if (crabIds.length > TEAM_SIZE || filled.length > TEAM_SIZE) errors.push("too_many");
  if (filled.length < TEAM_SIZE) errors.push("too_few");
  return { valid: errors.length === 0, filled: filled.length, errors };
}

export function isTeamDeployable(team: Pick<Team, "crabIds">): boolean {
  return validateTeam(team.crabIds).valid;
}

export interface TeamStatsSummary {
  count: number;
  totalHp: number;
  totalAttack: number;
  totalDefense: number;
  totalSpeed: number;
  totalSkill: number;
  avgLevel: number;
  /** Overall power: full teamBP for a complete team, raw BP sum otherwise. */
  power: number;
}

/**
 * Aggregate stats for a group of crabs — the single source every team card,
 * activity gate and outcome calculation reads from, so numbers always agree.
 * Recomputed from the live crab objects on every call: editing a member,
 * its level or its stats is reflected everywhere immediately.
 */
export function teamStatsSummary(crabs: readonly Crab[]): TeamStatsSummary {
  const sum = (fn: (c: Crab) => number) =>
    crabs.reduce((s, c) => s + fn(c), 0);
  const power =
    crabs.length === TEAM_SIZE
      ? teamBP([...crabs]).total
      : crabs.reduce((s, c) => s + crabBaseBP(c), 0);
  return {
    count: crabs.length,
    totalHp: sum((c) => c.stats.hp),
    totalAttack: sum((c) => c.stats.attack),
    totalDefense: sum((c) => c.stats.defense),
    totalSpeed: sum((c) => c.stats.speed),
    totalSkill: sum((c) => c.stats.skill),
    avgLevel: crabs.length
      ? Math.round((sum((c) => c.level) / crabs.length) * 10) / 10
      : 0,
    power,
  };
}
