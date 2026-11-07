// Crabtopia - Team availability rules (pure, unit-testable).
//
// Every activity in the game starts from a saved team. This module answers
// the single shared question — "can this team start an activity right now,
// and if not, why not?" — so Arena, Dives, Raids, Mining, Exploration,
// Tournaments and boss raids all show the same, explicit reasons.
import type { Activity, Crab, Team } from "../types";
import { TEAM_SIZE, validateTeam } from "./teams";
import { isWounded, staminaOf, woundRemainingMs } from "./stamina";

export interface TeamAvailability {
  available: boolean;
  /** Human-readable reasons the team cannot start (empty when available). */
  reasons: string[];
  filledCount: number;
}

const ACTIVITY_LABEL: Record<Activity, string> = {
  idle: "idle",
  diving: "on a dive",
  raiding: "raiding",
  hired: "hired out",
  nursery: "in the nursery",
  resting: "resting",
};

export interface TeamAvailabilityOptions {
  /**
   * When true (default), every member must be idle — a crab that is diving,
   * raiding, hired out or resting cannot start another activity.
   */
  requireIdle?: boolean;
  /**
   * Per-crab stamina cost of the activity being gated (STAMINA_COSTS).
   * When set, a member whose projected stamina is below the cost blocks
   * the team with an "exhausted" reason. When omitted, stamina is not
   * gated here (the store still charges it authoritatively at start).
   */
  staminaCost?: number;
  /** Evaluation time for wound/stamina projection (defaults to now). */
  now?: number;
  /** Player's Second Wind expiry — stamina projection runs ×3 under it. */
  recoveryBoostUntil?: number;
}

export function teamAvailability(
  team: Team,
  crabsById: ReadonlyMap<string, Crab>,
  opts: TeamAvailabilityOptions = {}
): TeamAvailability {
  const requireIdle = opts.requireIdle ?? true;
  const now = opts.now ?? Date.now();
  const boostUntil = opts.recoveryBoostUntil ?? 0;
  const reasons: string[] = [];
  const validation = validateTeam(team.crabIds);

  if (!validation.valid) {
    if (validation.errors.includes("duplicate")) {
      reasons.push("Team has a duplicate member");
    }
    if (validation.errors.includes("too_few")) {
      reasons.push(
        `Needs ${TEAM_SIZE - validation.filled} more crab${
          TEAM_SIZE - validation.filled === 1 ? "" : "s"
        } (${validation.filled}/${TEAM_SIZE})`
      );
    }
    if (validation.errors.includes("too_many")) {
      reasons.push(`Team has more than ${TEAM_SIZE} members`);
    }
  }

  for (const id of team.crabIds) {
    if (!id) continue;
    const crab = crabsById.get(id);
    if (!crab) {
      reasons.push("A member is no longer in your roster");
      continue;
    }
    if (requireIdle && crab.activity !== "idle") {
      reasons.push(`${crab.name} is ${ACTIVITY_LABEL[crab.activity]}`);
    }
    // Wounds block EVERY deployment (even non-idle-gated surfaces): a
    // wounded crab is home healing, full stop.
    if (isWounded(crab, now)) {
      const mins = Math.ceil(woundRemainingMs(crab, now) / 60000);
      reasons.push(
        `${crab.name} is wounded — healing (${mins} min left)`
      );
    } else if (
      opts.staminaCost !== undefined &&
      staminaOf(crab, now, boostUntil) < opts.staminaCost
    ) {
      reasons.push(
        `${crab.name} is exhausted — needs rest or a tonic`
      );
    }
  }

  return {
    available: reasons.length === 0,
    reasons,
    filledCount: validation.filled,
  };
}

export interface RosterSufficiency {
  /** Total crabs the player owns. */
  ownedCount: number;
  /** Owned crabs currently idle (not diving/raiding/hired/resting). */
  idleCount: number;
  /** How many more crabs must be owned to field one full team (0 when enough). */
  neededForFullTeam: number;
  /** True when owning fewer than TEAM_SIZE crabs makes a full team impossible. */
  insufficient: boolean;
}

/**
 * Can this roster ever fill a team? Owning fewer than 5 crabs is a
 * *roster* problem (fix: buy crabs at the Market), distinct from a team
 * being incomplete or its members being busy — UIs use this to show the
 * "buy more crabs" guidance instead of a dead end.
 */
export function rosterSufficiency(crabs: readonly Crab[]): RosterSufficiency {
  const ownedCount = crabs.length;
  const idleCount = crabs.filter((c) => c.activity === "idle").length;
  const neededForFullTeam = Math.max(0, TEAM_SIZE - ownedCount);
  return {
    ownedCount,
    idleCount,
    neededForFullTeam,
    insufficient: neededForFullTeam > 0,
  };
}

/** Concrete guidance sentence for an insufficient roster, or null when sufficient. */
export function insufficientRosterMessage(crabs: readonly Crab[]): string | null {
  const s = rosterSufficiency(crabs);
  if (!s.insufficient) return null;
  return `You need ${s.neededForFullTeam} more crab${
    s.neededForFullTeam === 1 ? "" : "s"
  } to field a full team of ${TEAM_SIZE}.`;
}

/** First team (in saved order) that can start an activity, or null. */
export function firstAvailableTeam(
  teams: readonly Team[],
  crabsById: ReadonlyMap<string, Crab>,
  opts: TeamAvailabilityOptions = {}
): Team | null {
  for (const t of teams) {
    if (teamAvailability(t, crabsById, opts).available) return t;
  }
  return null;
}

/** Dominant faction of a team's members (for emblems); ties break by first member. */
export function dominantFaction(
  team: Team,
  crabsById: ReadonlyMap<string, Crab>
): Crab["faction"] | null {
  const counts = new Map<string, number>();
  let best: Crab["faction"] | null = null;
  let bestCount = 0;
  for (const id of team.crabIds) {
    const crab = id ? crabsById.get(id) : undefined;
    if (!crab) continue;
    const n = (counts.get(crab.faction) ?? 0) + 1;
    counts.set(crab.faction, n);
    if (n > bestCount) {
      bestCount = n;
      best = crab.faction;
    }
  }
  return best;
}
