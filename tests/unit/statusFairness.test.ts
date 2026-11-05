// Unit tests for the sim's status-fairness layer (battleSim.ts):
// tenacity from class + level difference, the diminishing-returns
// ladder (2000 → 1000 → 500 → brief immunity), resisted hard CC
// converting to slow, the 40% hard-CC uptime cap, shield immunity,
// Shellmender cleanse + post-cleanse immunity, and determinism of
// resist rolls (same seed → same outcome).
import { describe, it, expect } from "vitest";
import {
  initBattle,
  findStatusEffect,
  makeCombatant,
  type ArenaBattleState,
  type Combatant,
} from "../../src/game/engine/arenaEngine";
import {
  createSim,
  applyHardCc,
  cleanseTarget,
  tenacityChance,
  CC_IMMUNITY_MS,
  CLEANSE_IMMUNITY_MS,
  type SimState,
  type SimUnit,
} from "../../src/game/engine/battleSim";
import { generateCrab } from "../../src/game/engine/crabs";
import type { ClassId, Crab } from "../../src/game/types";

let uid = 0;
function mkCrab(classId: ClassId, level = 10, isRookie = false): Crab {
  uid += 1;
  return generateCrab({ classId, level, seed: 9000 + uid, isRookie });
}

function combatant(classId: ClassId, side: "player" | "enemy", level = 10): Combatant {
  return makeCombatant(mkCrab(classId, level), side, 0);
}

/**
 * A rookie target. "Rookie" is NOT a class in this game's data model:
 * ClassId has eight members and BREEDS_BY_CLASS is built only from
 * those eight, so generateCrab({ classId: "rookie" }) crashes in the
 * breed pick (crabs.ts → rng pick of undefined). The game itself makes
 * rookies as a real class carrying the rookie flag (gameStore starter
 * generation: generateCrab({ classId, isRookie: true })). A pincher
 * rookie carries no class tenacity — exactly the zero-tenacity target
 * these tests want.
 *
 * Likewise, initBattle takes CRABS and builds the combatants itself
 * (the battleSim.test.ts pattern); the seed-shopping tests below pass
 * mkCrab results to initBattle and read state.player/enemy back out.
 */
function rookieCombatant(side: "player" | "enemy", level = 10): Combatant {
  return makeCombatant(mkCrab("pincher", level, true), side, 0);
}

function simOf(player: Combatant[], enemy: Combatant[]): SimState {
  const state: ArenaBattleState = {
    arenaId: "TEST",
    seed: 1,
    turn: 1,
    player,
    enemy,
    log: [],
    winner: null,
    totalDamageDealt: { player: 0, enemy: 0 },
    maxCombo: 0,
  };
  const spawns: Record<string, { x: number; y: number }> = {};
  for (const c of [...player, ...enemy]) {
    spawns[c.crabId] = { x: c.side === "player" ? 30 : 70, y: 50 };
  }
  return createSim(state, spawns);
}

function unitOf(sim: SimState, c: Combatant): SimUnit {
  return sim.units.find((u) => u.c === c)!;
}

function clearFreeze(c: Combatant) {
  c.statuses = c.statuses.filter((s) => s.id !== "freeze");
}

/**
 * Seed-shopping: build fresh sims with successive battle seeds until
 * `attempt` succeeds. The battle RNG is mulberry32(seed ^ 0x9e3779b9),
 * so the found seed — and therefore the whole test — is deterministic
 * across runs.
 */
function shop<T>(attempt: (seed: number) => T | null): T {
  for (let seed = 1; seed <= 500; seed++) {
    const r = attempt(seed);
    if (r !== null) return r;
  }
  throw new Error("seed shopping failed");
}

describe("tenacityChance", () => {
  it("combines a 5% base, class tenacity and level difference", () => {
    const attacker = combatant("warden", "player", 10);
    const bulwark = combatant("bulwark", "enemy", 10);
    // 0.05 base + 0.15 bulwark, same level.
    expect(tenacityChance(attacker, bulwark)).toBeCloseTo(0.2);
    const rookie = rookieCombatant("enemy", 10);
    expect(tenacityChance(attacker, rookie)).toBeCloseTo(0.05);
  });

  it("grows with level advantage and is capped at 50%", () => {
    const attacker = combatant("warden", "player", 10);
    const veteran = combatant("bulwark", "enemy", 30);
    // 0.05 + 0.15 + 0.01 × 20 = 0.40
    expect(tenacityChance(attacker, veteran)).toBeCloseTo(0.4);
    const ancient = combatant("bulwark", "enemy", 200);
    expect(tenacityChance(attacker, ancient)).toBe(0.5);
    const outlevelled = combatant("bulwark", "enemy", 1);
    expect(tenacityChance(attacker, outlevelled)).toBeGreaterThanOrEqual(0);
  });
});

describe("diminishing returns ladder", () => {
  it("2000 → 1000 → 500 ms, then immunity converts the 4th to slow", () => {
    const outcome = shop((seed) => {
      const warden = mkCrab("warden");
      const target = mkCrab("pincher", 10, true);
      const state = initBattle([warden], [target], seed);
      const spawns = { [warden.id]: { x: 30, y: 50 }, [target.id]: { x: 70, y: 50 } };
      const sim = createSim(state, spawns);
      const src = unitOf(sim, state.player[0]);
      const tgt = unitOf(sim, state.enemy[0]);
      const durations: number[] = [];
      for (let i = 0; i < 3; i++) {
        if (applyHardCc(sim, src, tgt) !== "applied") return null;
        durations.push(findStatusEffect(tgt.c, "freeze")?.durationMs ?? -1);
        clearFreeze(tgt.c);
      }
      const fourth = applyHardCc(sim, src, tgt);
      // The ladder's 4th step is specifically the DR-immunity
      // conversion — keep shopping if a tenacity roll (5% for this
      // target) happened to convert it first instead.
      if (fourth !== "converted" || tgt.ccImmuneUntil !== CC_IMMUNITY_MS) {
        return null;
      }
      return { sim, tgt, durations, fourth };
    });
    expect(outcome.durations).toEqual([2000, 1000, 500]);
    expect(outcome.fourth).toBe("converted");
    // Immunity window is running and the conversion is a slow.
    expect(outcome.tgt.ccImmuneUntil).toBe(CC_IMMUNITY_MS);
    expect(findStatusEffect(outcome.tgt.c, "freeze")).toBeUndefined();
    const slow = findStatusEffect(outcome.tgt.c, "slow");
    expect(slow).toBeDefined();
    expect(slow?.durationMs).toBe(800); // 40% of the 2000ms base
    expect(slow?.magnitude).toBeCloseTo(0.4);
  });

  it("a shielded target is CC-immune: freeze converts to slow instead", () => {
    const warden = combatant("warden", "player");
    const target = rookieCombatant("enemy");
    target.statuses.push({
      id: "shield",
      durationMs: 60000,
      magnitude: 500, // shield POOL (see dealDamageSim shield absorb)
    });
    const sim = simOf([warden], [target]);
    const result = applyHardCc(sim, unitOf(sim, warden), unitOf(sim, target));
    expect(result).toBe("converted");
    expect(findStatusEffect(target, "freeze")).toBeUndefined();
    expect(findStatusEffect(target, "slow")).toBeDefined();
  });
});

describe("hard-CC uptime cap (40% of the rolling 10s window)", () => {
  it("a target already frozen 3.9s in-window can only be slowed", () => {
    const warden = combatant("warden", "player");
    const target = rookieCombatant("enemy");
    const sim = simOf([warden], [target]);
    const tgt = unitOf(sim, target);
    // 3900ms of the last 10s already spent frozen → 100ms of budget
    // left, below the 200ms minimum → conversion.
    tgt.ccIntervals.push({ start: -3900, end: 0 });
    const result = applyHardCc(sim, unitOf(sim, warden), tgt);
    expect(result).toBe("converted");
    expect(findStatusEffect(target, "freeze")).toBeUndefined();
    expect(findStatusEffect(target, "slow")).toBeDefined();
  });

  it("with 200ms of budget left, the freeze lands capped at 200ms", () => {
    const applied = shop((seed) => {
      const warden = mkCrab("warden");
      const target = mkCrab("pincher", 10, true);
      const state = initBattle([warden], [target], seed);
      const spawns = { [warden.id]: { x: 30, y: 50 }, [target.id]: { x: 70, y: 50 } };
      const sim = createSim(state, spawns);
      const tgt = unitOf(sim, state.enemy[0]);
      tgt.ccIntervals.push({ start: -3800, end: 0 });
      const result = applyHardCc(sim, unitOf(sim, state.player[0]), tgt);
      if (result !== "applied") return null;
      return findStatusEffect(tgt.c, "freeze")?.durationMs ?? null;
    });
    expect(applied).toBe(200);
  });
});

describe("tenacity resist", () => {
  it("a resisted freeze converts to slow and consumes no DR step", () => {
    const outcome = shop((seed) => {
      const warden = mkCrab("warden");
      // Bulwark: 20% tenacity at equal level — findable by seed.
      const target = mkCrab("bulwark");
      const state = initBattle([warden], [target], seed);
      const spawns = { [warden.id]: { x: 30, y: 50 }, [target.id]: { x: 70, y: 50 } };
      const sim = createSim(state, spawns);
      const tgt = unitOf(sim, state.enemy[0]);
      const result = applyHardCc(sim, unitOf(sim, state.player[0]), tgt);
      if (result !== "converted") return null;
      if (findStatusEffect(tgt.c, "slow") === undefined) return null;
      if (findStatusEffect(tgt.c, "freeze") !== undefined) return null;
      return { sim, tgt };
    });
    // A resist is not an application: the DR ladder has not advanced.
    expect(outcome.tgt.ccApplications).toHaveLength(0);
    const resisted = outcome.sim.events.filter(
      (e) => e.type === "statusResisted",
    );
    expect(resisted.length).toBe(1);
  });

  it("resist rolls are deterministic for a fixed seed", () => {
    const run = (seed: number) => {
      const warden = mkCrab("warden");
      const target = mkCrab("bulwark");
      const state = initBattle([warden], [target], seed);
      const spawns = { [warden.id]: { x: 30, y: 50 }, [target.id]: { x: 70, y: 50 } };
      const sim = createSim(state, spawns);
      return applyHardCc(sim, unitOf(sim, state.player[0]), unitOf(sim, state.enemy[0]));
    };
    for (const seed of [3, 17, 42, 99]) {
      expect(run(seed)).toBe(run(seed));
    }
  });
});

describe("cleanse", () => {
  it("removes the NEWEST cleansable status and grants brief immunity", () => {
    const mender = combatant("shellmender", "player");
    const ally = combatant("bulwark", "player");
    const foe = combatant("reaver", "enemy");
    ally.statuses.push(
      { id: "weaken", durationMs: 4000, magnitude: 0.25, appliedAtMs: 50 },
      { id: "freeze", durationMs: 2000, magnitude: 0, appliedAtMs: 100 },
    );
    const sim = simOf([mender, ally], [foe]);
    const src = unitOf(sim, mender);
    const tgt = unitOf(sim, ally);
    const first = cleanseTarget(sim, src, tgt);
    expect(first).toBe("freeze"); // newest first
    expect(findStatusEffect(ally, "freeze")).toBeUndefined();
    expect(findStatusEffect(ally, "weaken")).toBeDefined();
    expect(tgt.ccImmuneUntil).toBe(CLEANSE_IMMUNITY_MS);
    const second = cleanseTarget(sim, src, tgt);
    expect(second).toBe("weaken");
    const third = cleanseTarget(sim, src, tgt);
    expect(third).toBeNull();
    const cleansed = sim.events.filter((e) => e.type === "cleansed");
    expect(cleansed).toHaveLength(2);
  });
});
