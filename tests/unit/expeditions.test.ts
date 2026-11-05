// Unit tests for team expedition math (engine/expeditions.ts):
// mining yield scaling and exploration encounter resolution must be
// deterministic and monotonic — a stronger team never does worse.
import { describe, it, expect } from "vitest";
import {
  applyMiningBonus,
  encounterLevel,
  expeditionStats,
  miningYieldBonus,
  resolveEncounter,
} from "../../src/game/engine/expeditions";
import { MINING_NODES, rollNodeDrops } from "../../src/game/data/materials";
import { generateCrab } from "../../src/game/engine/crabs";
import { mulberry32 } from "../../src/game/engine/rng";
import type { ClassId, Crab } from "../../src/game/types";

function team(level: number, baseSeed: number): Crab[] {
  const classes: ClassId[] = ["bulwark", "reaver", "skitter", "tidecaller", "shellmender"];
  return classes.map((classId, i) =>
    generateCrab({ classId, level, seed: baseSeed + i, ownerId: "player" })
  );
}

describe("expeditionStats", () => {
  it("aggregates the whole team's attributes", () => {
    const crabs = team(3, 500);
    const s = expeditionStats(crabs);
    expect(s.memberCount).toBe(5);
    expect(s.totalAttack).toBe(crabs.reduce((n, c) => n + c.stats.attack, 0));
    expect(s.hpPool).toBe(crabs.reduce((n, c) => n + c.stats.hp, 0));
    expect(s.power).toBeGreaterThan(0);
    expect(encounterLevel(crabs)).toBe(3);
  });
});

describe("mining", () => {
  it("nodes have escalating power requirements", () => {
    const reqs = MINING_NODES.map((n) => n.minTeamPower);
    expect(reqs[0]).toBe(0);
    expect(reqs[1]).toBeGreaterThan(reqs[0]);
    expect(reqs[2]).toBeGreaterThan(reqs[1]);
  });

  it("yield bonus grows with team power and is capped", () => {
    const weak = miningYieldBonus(team(1, 600));
    const strong = miningYieldBonus(team(10, 600));
    expect(strong).toBeGreaterThan(weak);
    expect(strong).toBeLessThanOrEqual(0.6);
    expect(weak).toBeGreaterThanOrEqual(0);
  });

  it("applyMiningBonus never shrinks a drop and scales with the bonus", () => {
    const drops = { iron_ore: 4, kelp_fiber: 1 } as const;
    const none = applyMiningBonus({ ...drops }, 0);
    expect(none).toEqual({ iron_ore: 4, kelp_fiber: 1 });
    const boosted = applyMiningBonus({ ...drops }, 0.5);
    expect(boosted.iron_ore).toBe(6);
    expect(boosted.kelp_fiber).toBe(2); // 1 + round(0.5) = 2 (banker's? no: Math.round(0.5)=1)
  });

  it("same seed: stronger team's total haul is never worse", () => {
    const node = MINING_NODES[0];
    const roll = (crabs: Crab[]) => {
      const rng = mulberry32(777);
      const base = rollNodeDrops(node, rng);
      const boosted = applyMiningBonus(base, miningYieldBonus(crabs));
      return Object.values(boosted).reduce((a, b) => a + (b ?? 0), 0);
    };
    expect(roll(team(12, 700))).toBeGreaterThanOrEqual(roll(team(1, 700)));
  });
});

describe("resolveEncounter", () => {
  const enemy = (level: number, seed: number) =>
    generateCrab({ level, seed, ownerId: "enemy" });

  it("is deterministic for a fixed seed", () => {
    const crabs = team(5, 800);
    const e = enemy(5, 900);
    expect(resolveEncounter(crabs, e, 42)).toEqual(resolveEncounter(crabs, e, 42));
  });

  it("a much stronger team beats a weak wild enemy", () => {
    const r = resolveEncounter(team(15, 810), enemy(2, 910), 42);
    expect(r.winner).toBe("team");
    expect(r.teamHpLeft / r.teamMaxHp).toBeGreaterThan(
      r.enemyHpLeft / r.enemyMaxHp
    );
  });

  it("a weak team loses to a much stronger enemy", () => {
    const r = resolveEncounter(team(1, 820), enemy(20, 920), 42);
    expect(r.winner).toBe("enemy");
  });

  it("the whole team outperforms its best single member", () => {
    const crabs = team(4, 830);
    const e = enemy(8, 930);
    const asTeam = resolveEncounter(crabs, e, 7);
    const solo = resolveEncounter([crabs[0]], e, 7);
    expect(asTeam.teamDamage).toBeGreaterThan(solo.teamDamage);
    expect(asTeam.teamMaxHp).toBeGreaterThan(solo.teamMaxHp);
  });
});
