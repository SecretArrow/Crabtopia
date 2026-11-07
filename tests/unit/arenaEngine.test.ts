// Unit tests for the Crabtopia arena battle engine (arenaEngine.ts) +
// its real-time simulator (battleSim.ts). Pure logic — no React.
// The turn-based resolver was replaced by the fixed-timestep sim in
// Phase 2; battle-level assertions (determinism, winners, rewards,
// status behaviour) now run through createSim/runSimToCompletion —
// the same code path the watched battle and Skip both use.
import { describe, it, expect } from "vitest";
import {
  getSkillsForClass,
  makeCombatant,
  initBattle,
  calculateRewards,
  findStatusEffect,
  type ArenaBattleState,
} from "../../src/game/engine/arenaEngine";
import {
  createSim,
  runSimToCompletion,
  stepSim,
  hashSimEvents,
  type SimState,
} from "../../src/game/engine/battleSim";
import { generateCrab } from "../../src/game/engine/crabs";
import type { ClassId } from "../../src/game/types";

/** Spawn positions mirroring the renderer's slot anchors. */
export function spawnsFor(
  state: ArenaBattleState,
): Record<string, { x: number; y: number }> {
  const spawns: Record<string, { x: number; y: number }> = {};
  for (const c of [...state.player, ...state.enemy]) {
    const x =
      c.side === "player"
        ? c.row === "front"
          ? 42
          : c.row === "mid"
            ? 26
            : 10
        : c.row === "front"
          ? 58
          : c.row === "mid"
            ? 74
            : 90;
    spawns[c.crabId] = { x, y: 20 + c.slot * 15 };
  }
  return spawns;
}

export function simFor(state: ArenaBattleState): SimState {
  return createSim(state, spawnsFor(state));
}

describe("getSkillsForClass", () => {
  it("returns exactly 3 skills for every class", () => {
    const classes: ClassId[] = [
      "bulwark",
      "reaver",
      "skitter",
      "tidecaller",
      "shellmender",
      "pincher",
      "warden",
      "gildclaw",
    ];
    for (const c of classes) {
      const skills = getSkillsForClass(c);
      // Per shared spec: each crab has 3 skills (Claw Strike, Class Special, Tide Sigil).
      // Unrelated to 5v5 team size — skills-per-crab count is still 3.
      expect(skills.length).toBe(3);
      // Each skill has required fields
      for (const s of skills) {
        expect(s.id).toBeTruthy();
        expect(s.name).toBeTruthy();
        expect(s.energyCost).toBeGreaterThan(0);
        expect(s.power).toBeGreaterThan(0);
        expect(s.visual).toBeTruthy();
      }
    }
  });

  it("includes the class signature skill as skill 2", () => {
    // Reaver's skill 2 should be "Reaving Claw"
    const reaverSkills = getSkillsForClass("reaver");
    expect(reaverSkills[1].name.toLowerCase()).toContain("reaving");
  });

  it("skill 1 is always Claw Strike (basic, low cost)", () => {
    const skills = getSkillsForClass("bulwark");
    expect(skills[0].id).toBe("claw_strike");
    expect(skills[0].energyCost).toBe(1);
    expect(skills[0].cooldown).toBe(0);
  });

  it("skill 3 is always Tide Sigil (high cost, applies a status)", () => {
    const skills = getSkillsForClass("tidecaller");
    expect(skills[2].id).toBe("tide_sigil");
    expect(skills[2].energyCost).toBe(5);
    expect(skills[2].effect).toBeTruthy();
  });
});

describe("makeCombatant", () => {
  it("initializes HP and energy from crab", () => {
    const crab = generateCrab({ classId: "bulwark", level: 10, seed: 42 });
    const c = makeCombatant(crab, "player", 0);
    expect(c.crabId).toBe(crab.id);
    expect(c.side).toBe("player");
    expect(c.slot).toBe(0);
    expect(c.maxHp).toBeGreaterThan(0);
    expect(c.hp).toBe(c.maxHp);
    expect(c.energy).toBe(3); // START_ENERGY
    expect(c.maxEnergy).toBe(10); // MAX_ENERGY
    expect(c.isDefeated).toBe(false);
    expect(c.statuses).toEqual([]);
    expect(c.cooldowns).toEqual({});
    expect(c.comboCount).toBe(0);
  });

  it("copies attack/defense/speed/skill from crab stats", () => {
    const crab = generateCrab({ classId: "reaver", level: 7, seed: 9 });
    const c = makeCombatant(crab, "enemy", 2);
    expect(c.side).toBe("enemy");
    expect(c.slot).toBe(2);
    expect(c.attack).toBe(crab.stats.attack);
    expect(c.defense).toBe(crab.stats.defense);
    expect(c.speed).toBe(crab.stats.speed);
    expect(c.skill).toBe(crab.stats.skill);
  });
});

describe("initBattle", () => {
  it("creates 5v5 battle state with arenaId and seed", () => {
    const player = [1, 2, 3, 4, 5].map((lvl, i) =>
      generateCrab({ level: lvl, seed: 100 + i })
    );
    const enemy = [1, 2, 3, 4, 5].map((lvl, i) =>
      generateCrab({ level: lvl, seed: 200 + i })
    );
    const state = initBattle(player, enemy, 12345);
    expect(state.arenaId).toMatch(/^ARENA-/);
    expect(state.seed).toBe(12345);
    expect(state.turn).toBe(0);
    expect(state.player).toHaveLength(5);
    expect(state.enemy).toHaveLength(5);
    expect(state.winner).toBeNull();
    expect(state.log).toEqual([]);
    expect(state.totalDamageDealt).toEqual({ player: 0, enemy: 0 });
    expect(state.maxCombo).toBe(0);
  });

  it("assigns distinct slots and sides to each combatant", () => {
    const p = [1, 2, 3, 4, 5].map((lvl, i) =>
      generateCrab({ level: lvl, seed: 10 + i })
    );
    const e = [1, 2, 3, 4, 5].map((lvl, i) =>
      generateCrab({ level: lvl, seed: 20 + i })
    );
    const state = initBattle(p, e, 7);
    expect(state.player.map((c) => c.slot)).toEqual([0, 1, 2, 3, 4]);
    expect(state.enemy.map((c) => c.slot)).toEqual([0, 1, 2, 3, 4]);
    expect(state.player.every((c) => c.side === "player")).toBe(true);
    expect(state.enemy.every((c) => c.side === "enemy")).toBe(true);
  });
});

describe("sim determinism", () => {
  it("same seed produces the same event stream, winner and log", () => {
    const p = [1, 2, 3, 4, 5].map((lvl, i) =>
      generateCrab({ level: lvl, seed: 10 + i })
    );
    const e = [1, 2, 3, 4, 5].map((lvl, i) =>
      generateCrab({ level: lvl, seed: 20 + i })
    );
    const s1 = runSimToCompletion(simFor(initBattle(p, e, 999)));
    const s2 = runSimToCompletion(simFor(initBattle(p, e, 999)));
    expect(hashSimEvents(s1.events)).toBe(hashSimEvents(s2.events));
    expect(s1.battle.winner).toBe(s2.battle.winner);
    expect(s1.battle.log.map((a) => a.message)).toEqual(
      s2.battle.log.map((a) => a.message),
    );
  });
});

describe("sim battles", () => {
  it("produces a winner; the stronger team wins", () => {
    const p = [10, 12, 11, 13, 10].map((lvl, i) =>
      generateCrab({ level: lvl, seed: 10 + i })
    );
    const e = [5, 6, 5, 6, 5].map((lvl, i) =>
      generateCrab({ level: lvl, seed: 20 + i })
    );
    const sim = runSimToCompletion(simFor(initBattle(p, e, 7)));
    expect(sim.battle.winner).toBe("player");
    expect(sim.timeMs).toBeLessThanOrEqual(180000);
  });

  it("weaker player team loses to stronger enemy", () => {
    const p = [1, 1, 1, 1, 1].map((lvl, i) =>
      generateCrab({ level: lvl, seed: 10 + i })
    );
    const e = [20, 22, 21, 22, 20].map((lvl, i) =>
      generateCrab({ level: lvl, seed: 20 + i })
    );
    const sim = runSimToCompletion(simFor(initBattle(p, e, 7)));
    expect(sim.battle.winner).toBe("enemy");
  });
});

describe("calculateRewards", () => {
  it("victory gives positive gold and XP", () => {
    const p = [10, 12, 11, 13, 10].map((lvl, i) =>
      generateCrab({ level: lvl, seed: 10 + i })
    );
    const e = [5, 6, 5, 6, 5].map((lvl, i) =>
      generateCrab({ level: lvl, seed: 20 + i })
    );
    const sim = runSimToCompletion(simFor(initBattle(p, e, 7)));
    const rewards = calculateRewards(sim.battle, 100);
    expect(rewards.winner).toBe("player");
    expect(rewards.goldReward).toBeGreaterThan(0);
    expect(rewards.xpReward).toBeGreaterThan(0);
  });

  it("defeat gives zero rewards", () => {
    const p = [1, 1, 1, 1, 1].map((lvl, i) =>
      generateCrab({ level: lvl, seed: 10 + i })
    );
    const e = [20, 22, 21, 22, 20].map((lvl, i) =>
      generateCrab({ level: lvl, seed: 20 + i })
    );
    const sim = runSimToCompletion(simFor(initBattle(p, e, 7)));
    const rewards = calculateRewards(sim.battle, 100);
    expect(rewards.winner).toBe("enemy");
    expect(rewards.goldReward).toBe(0);
    expect(rewards.xpReward).toBe(0);
  });
});

describe("calculateRewards — exact doc-comment values (audit 2026-11-07)", () => {
  // Build a state directly: winner forced, survivors controlled. The
  // reward formula must match its own documentation EXACTLY:
  //   gold = entryCost + 50..245 (enemy avg level 1..50)
  //   XP   = round(enemyAvgLevel * 15) per surviving player crab
  //   30% chance of 1-2 materials; defeat = nothing.
  function rewardState(enemyLevel: number, survivors: number, seed: number) {
    const p = [0, 1, 2, 3, 4].map((i) =>
      generateCrab({ level: 10, seed: 3100 + i })
    );
    const e = [0, 1, 2, 3, 4].map((i) =>
      generateCrab({ level: enemyLevel, seed: 3200 + i })
    );
    const state = initBattle(p, e, seed);
    state.winner = "player";
    state.player.forEach((c, i) => {
      c.isDefeated = i >= survivors;
    });
    return state;
  }

  it("gold bonus is exactly +50 at enemy avg level 1 and +245 at 50", () => {
    expect(calculateRewards(rewardState(1, 5, 11), 100).goldReward).toBe(150);
    expect(calculateRewards(rewardState(50, 5, 12), 100).goldReward).toBe(345);
    expect(calculateRewards(rewardState(50, 5, 13), 0).goldReward).toBe(245);
  });

  it("XP is round(avg level x 15) per surviving crab", () => {
    // avg 10 -> 150 per survivor; 3 survivors -> 450
    expect(calculateRewards(rewardState(10, 3, 14), 100).xpReward).toBe(450);
    // avg 1 -> 15 per survivor; 5 survivors -> 75
    expect(calculateRewards(rewardState(1, 5, 15), 100).xpReward).toBe(75);
  });

  it("material drops land near the documented 30% (400 seeded states)", () => {
    let drops = 0;
    let totalItems = 0;
    for (let seed = 1; seed <= 400; seed++) {
      const r = calculateRewards(rewardState(10, 5, 10000 + seed), 100);
      if (r.itemsFound.length > 0) drops++;
      totalItems += r.itemsFound.reduce((s, it) => s + it.count, 0);
    }
    const rate = drops / 400;
    expect(rate).toBeGreaterThan(0.23);
    expect(rate).toBeLessThan(0.37);
    // When a drop happens it is 1-2 items, so totals stay bounded.
    expect(totalItems).toBeGreaterThanOrEqual(drops);
    expect(totalItems).toBeLessThanOrEqual(drops * 2);
  });
});

describe("status effects in the sim", () => {
  it("warden freeze skills carry a 2-round base (converted to 2000 battle-ms by the fairness layer)", () => {
    const skills = getSkillsForClass("warden");
    const freezeSkills = skills.filter(
      (s) => s.effect?.status === "freeze",
    );
    expect(freezeSkills.length).toBeGreaterThanOrEqual(1);
    for (const s of freezeSkills) {
      expect(s.effect?.rounds).toBe(2);
    }
  });

  it("a frozen crab lands no strikes while frozen, and acts again after expiry", () => {
    const player = [generateCrab({ classId: "reaver", level: 10, seed: 101 })];
    const enemy = [generateCrab({ classId: "bulwark", level: 10, seed: 201 })];
    const state = initBattle(player, enemy, 42);
    const frozen = state.player[0];
    frozen.statuses.push({ id: "freeze", durationMs: 3000, magnitude: 0 });
    const sim = simFor(state);
    stepSim(sim, 2000);
    const strikesWhileFrozen = sim.events.filter(
      (e) => e.type === "strike" && e.actorId === frozen.crabId,
    );
    expect(strikesWhileFrozen).toHaveLength(0);
    // Freeze was genuinely active for part of that window.
    expect(findStatusEffect(frozen, "freeze")).toBeDefined();
    stepSim(sim, 6000);
    const strikesAfter = sim.events.filter(
      (e) => e.type === "strike" && e.actorId === frozen.crabId,
    );
    expect(strikesAfter.length).toBeGreaterThan(0);
    expect(findStatusEffect(frozen, "freeze")).toBeUndefined();
  });

  it("weaken magnitude 1.0 reduces the weakened crab's damage to zero", () => {
    const mk = (weakened: boolean) => {
      const player = [
        generateCrab({ classId: "reaver", level: 10, seed: 101 }),
      ];
      const enemy = [
        generateCrab({ classId: "bulwark", level: 10, seed: 201 }),
      ];
      // Huge HP pool so nobody dies during the probe window.
      const state = initBattle(player, enemy, 999);
      state.enemy[0].maxHp = 100000;
      state.enemy[0].hp = 100000;
      if (weakened) {
        state.player[0].statuses.push({
          id: "weaken",
          durationMs: 60000,
          magnitude: 1.0,
        });
      }
      const sim = simFor(state);
      stepSim(sim, 6000);
      return sim.events
        .filter(
          (e) =>
            e.type === "strike" && e.actorId === state.player[0].crabId,
        )
        .reduce((sum, e) => sum + (e.type === "strike" ? e.damage : 0), 0);
    };
    expect(mk(false)).toBeGreaterThan(0);
    expect(mk(true)).toBe(0);
  });
});
