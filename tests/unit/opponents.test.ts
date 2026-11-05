// Unit tests for the Crabtopia opponent generator (opponents.ts).
// Pure logic testing — no React rendering.
import { describe, it, expect } from "vitest";
import {
  generateOpponents,
  generateOpponent,
  generateLeaderboard,
  rerollOpponents,
  type Opponent,
} from "../../src/game/data/opponents";
import type { Crab } from "../../src/game/types";

function avgLevel(crabs: Crab[]): number {
  return crabs.reduce((s, c) => s + c.level, 0) / crabs.length;
}

describe("generateOpponents", () => {
  it("returns 5 opponents by default", () => {
    const opps = generateOpponents(10, 12345);
    expect(opps).toHaveLength(5);
  });

  it("respects the count argument", () => {
    // Use a non-default count (7) to verify the count param is honored —
    // distinct from the default (5) covered by the test above.
    const opps = generateOpponents(10, 12345, 7);
    expect(opps).toHaveLength(7);
  });

  it("opponents have valid structure", () => {
    const opps = generateOpponents(10, 12345);
    for (const o of opps) {
      expect(o.id).toBeTruthy();
      expect(o.name).toBeTruthy();
      expect(o.rank).toBeGreaterThan(0);
      expect(o.rank).toBeLessThanOrEqual(100);
      expect(o.crabs).toHaveLength(5);
      expect(o.entryCost).toBeGreaterThan(0);
      expect(o.entryCost).toBeLessThanOrEqual(500);
      expect(o.rewardPreview.gold).toBeGreaterThan(0);
      expect(o.rewardPreview.xp).toBeGreaterThan(0);
      expect(o.fleetStrength).toBeGreaterThan(0);
      expect(o.wins).toBeGreaterThanOrEqual(0);
      expect(o.losses).toBeGreaterThanOrEqual(0);
      expect(o.winRate).toBeGreaterThanOrEqual(0);
      expect(o.winRate).toBeLessThanOrEqual(1);
    }
  });

  it("is deterministic by seed", () => {
    const a = generateOpponents(10, 999);
    const b = generateOpponents(10, 999);
    expect(a.map((o) => o.id)).toEqual(b.map((o) => o.id));
    expect(a.map((o) => o.name)).toEqual(b.map((o) => o.name));
    expect(a.map((o) => o.rank)).toEqual(b.map((o) => o.rank));
    expect(a.map((o) => o.fleetStrength)).toEqual(
      b.map((o) => o.fleetStrength)
    );
  });

  it("different seeds produce different opponents", () => {
    const a = generateOpponents(10, 1);
    const b = generateOpponents(10, 2);
    // Names almost certainly differ between different seeds.
    expect(a.map((o) => o.name)).not.toEqual(b.map((o) => o.name));
  });

  it("scales crab levels with player max level", () => {
    const lowLevel = generateOpponents(5, 42);
    const highLevel = generateOpponents(40, 42);
    const lowAvg = avgLevel(lowLevel[0].crabs);
    const highAvg = avgLevel(highLevel[0].crabs);
    expect(highAvg).toBeGreaterThan(lowAvg);
  });

  it("sorts opponents by rank ascending (strongest first)", () => {
    const opps = generateOpponents(10, 12345);
    for (let i = 1; i < opps.length; i++) {
      expect(opps[i].rank).toBeGreaterThanOrEqual(opps[i - 1].rank);
    }
  });
});

describe("generateOpponent", () => {
  it("produces a single opponent with valid rank-based level", () => {
    const o: Opponent = generateOpponent(1, 12345);
    expect(o.rank).toBe(1);
    // Rank 1 → strongest → level 50.
    expect(o.crabs.every((c) => c.level === 50)).toBe(true);
  });

  it("rank 100 opponent has low-level crabs", () => {
    const o = generateOpponent(100, 12345);
    expect(o.rank).toBe(100);
    for (const c of o.crabs) {
      expect(c.level).toBeLessThanOrEqual(10);
    }
  });

  it("is deterministic by seed+rank", () => {
    const a = generateOpponent(7, 999);
    const b = generateOpponent(7, 999);
    expect(a.id).toBe(b.id);
    expect(a.name).toBe(b.name);
    expect(a.fleetStrength).toBe(b.fleetStrength);
  });
});

describe("rerollOpponents", () => {
  it("produces the same result as generateOpponents for the same inputs", () => {
    const a = generateOpponents(15, 4242);
    const b = rerollOpponents(15, 4242);
    expect(a.map((o) => o.id)).toEqual(b.map((o) => o.id));
    expect(a.map((o) => o.name)).toEqual(b.map((o) => o.name));
  });

  it("honors the count argument", () => {
    const opps = rerollOpponents(10, 7, 2);
    expect(opps).toHaveLength(2);
  });
});

describe("generateLeaderboard", () => {
  it("returns 100 entries", () => {
    const lb = generateLeaderboard(20200101);
    expect(lb).toHaveLength(100);
  });

  it("is sorted by rank (rank 1 first)", () => {
    const lb = generateLeaderboard(20200101);
    expect(lb[0].rank).toBe(1);
    expect(lb[99].rank).toBe(100);
  });

  it("higher rank = stronger fleet", () => {
    const lb = generateLeaderboard(20200101);
    expect(lb[0].fleetStrength).toBeGreaterThan(lb[99].fleetStrength);
  });

  it("every entry has 5 crabs and positive entry cost", () => {
    const lb = generateLeaderboard(20200101);
    for (const o of lb) {
      expect(o.crabs).toHaveLength(5);
      expect(o.entryCost).toBeGreaterThan(0);
    }
  });

  it("is deterministic by day seed", () => {
    const a = generateLeaderboard(20200101);
    const b = generateLeaderboard(20200101);
    expect(a.map((o) => o.id)).toEqual(b.map((o) => o.id));
    expect(a.map((o) => o.name)).toEqual(b.map((o) => o.name));
  });
});
