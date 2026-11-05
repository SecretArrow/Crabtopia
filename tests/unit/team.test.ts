// Unit tests for team validation (engine/teams.ts).
// One team = exactly 5 crabs in 5 slots. Create/edit flows must never
// produce a deployable team with fewer, more, or duplicate crabs.
import { describe, it, expect } from "vitest";
import {
  TEAM_SIZE,
  validateTeam,
  normalizeTeamSlots,
  toTeamSlots,
  isTeamDeployable,
} from "../../src/game/engine/teams";
import type { Team } from "../../src/game/types";

const team = (crabIds: string[]): Team => ({
  id: "t1",
  name: "Test",
  crabIds,
  createdAt: 0,
});

describe("TEAM_SIZE", () => {
  it("is 5", () => {
    expect(TEAM_SIZE).toBe(5);
  });
});

describe("validateTeam", () => {
  it("accepts exactly 5 unique crabs", () => {
    const v = validateTeam(["a", "b", "c", "d", "e"]);
    expect(v.valid).toBe(true);
    expect(v.filled).toBe(5);
    expect(v.errors).toEqual([]);
  });

  it("rejects fewer than 5 (including empty slots)", () => {
    expect(validateTeam(["a", "b", "c", "d"]).errors).toContain("too_few");
    expect(validateTeam(["a", "b", "", "", ""]).valid).toBe(false);
    expect(validateTeam([]).valid).toBe(false);
  });

  it("rejects more than 5", () => {
    const v = validateTeam(["a", "b", "c", "d", "e", "f"]);
    expect(v.valid).toBe(false);
    expect(v.errors).toContain("too_many");
  });

  it("rejects duplicate crabs in one team", () => {
    const v = validateTeam(["a", "b", "c", "d", "a"]);
    expect(v.valid).toBe(false);
    expect(v.errors).toContain("duplicate");
  });
});

describe("normalizeTeamSlots (legacy migration)", () => {
  it("pads a legacy short team to exactly 5 slots", () => {
    expect(normalizeTeamSlots([])).toEqual(["", "", "", "", ""]);
    expect(normalizeTeamSlots(["a", "b", "c"])).toEqual(["a", "b", "c", "", ""]);
  });

  it("deduplicates and truncates to 5", () => {
    expect(normalizeTeamSlots(["a", "a", "b", "c", "d", "e", "f"])).toEqual([
      "a",
      "b",
      "c",
      "d",
      "e",
    ]);
  });
});

describe("toTeamSlots (positional editing)", () => {
  it("preserves slot positions and pads to 5", () => {
    expect(toTeamSlots(["", "b"])).toEqual(["", "b", "", "", ""]);
    expect(toTeamSlots(["a", "b", "c", "d", "e"])).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("clears later duplicate slots", () => {
    expect(toTeamSlots(["a", "b", "a"])).toEqual(["a", "b", "", "", ""]);
  });
});

describe("isTeamDeployable", () => {
  it("only a full 5-crab team is deployable", () => {
    expect(isTeamDeployable(team(["a", "b", "c", "d", "e"]))).toBe(true);
    expect(isTeamDeployable(team(["a", "b", "c"]))).toBe(false);
    expect(isTeamDeployable(team(["a", "b", "c", "d", "d"]))).toBe(false);
  });
});
