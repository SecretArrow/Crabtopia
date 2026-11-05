// Unit tests for the Crabtopia arena battle engine (arenaEngine.ts).
// Pure logic testing — no React rendering.
import { describe, it, expect } from "vitest";
import {
  getSkillsForClass,
  makeCombatant,
  initBattle,
  resolveRound,
  pickAiTarget,
  pickAiSkill,
  applySkill,
  runBattle,
  calculateRewards,
  type ArenaBattleState,
  type Combatant,
  type ArenaSkill,
} from "../../src/game/engine/arenaEngine";
import { generateCrab } from "../../src/game/engine/crabs";
import type { ClassId } from "../../src/game/types";

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
    // NOTE: implementation starts turn at 0, increments at first resolveRound.
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

describe("determinism", () => {
  it("same seed produces same battle log", () => {
    const p = [1, 2, 3, 4, 5].map((lvl, i) =>
      generateCrab({ level: lvl, seed: 10 + i })
    );
    const e = [1, 2, 3, 4, 5].map((lvl, i) =>
      generateCrab({ level: lvl, seed: 20 + i })
    );
    const s1 = runBattle(initBattle(p, e, 999), 20);
    const s2 = runBattle(initBattle(p, e, 999), 20);
    expect(s1.log.length).toBe(s2.log.length);
    expect(s1.winner).toBe(s2.winner);
    expect(s1.log.map((a) => a.message)).toEqual(s2.log.map((a) => a.message));
  });
});

describe("runBattle", () => {
  it("produces a winner within maxTurns", () => {
    const p = [10, 12, 11, 13, 10].map((lvl, i) =>
      generateCrab({ level: lvl, seed: 10 + i })
    );
    const e = [5, 6, 5, 6, 5].map((lvl, i) =>
      generateCrab({ level: lvl, seed: 20 + i })
    );
    const state = runBattle(initBattle(p, e, 7), 30);
    expect(state.winner).not.toBeNull();
    // Player should win against weaker enemies
    expect(state.winner).toBe("player");
  });

  it("weaker player team loses to stronger enemy", () => {
    const p = [1, 1, 1, 1, 1].map((lvl, i) =>
      generateCrab({ level: lvl, seed: 10 + i })
    );
    const e = [20, 22, 21, 22, 20].map((lvl, i) =>
      generateCrab({ level: lvl, seed: 20 + i })
    );
    const state = runBattle(initBattle(p, e, 7), 30);
    expect(state.winner).toBe("enemy");
  });
});

describe("pickAiTarget", () => {
  it("targets the lowest-HP enemy for non-healer classes", () => {
    const p = [generateCrab({ classId: "reaver", level: 5, seed: 1 })];
    const e = [
      generateCrab({ classId: "bulwark", level: 5, seed: 2 }),
      generateCrab({ classId: "bulwark", level: 5, seed: 3 }),
      generateCrab({ classId: "bulwark", level: 5, seed: 4 }),
      generateCrab({ classId: "bulwark", level: 5, seed: 5 }),
      generateCrab({ classId: "bulwark", level: 5, seed: 6 }),
    ];
    const state = initBattle(p, e, 42);
    const actor = state.player[0];
    // Damage one enemy so it's clearly lowest HP.
    state.enemy[1].hp = 1;
    const target = pickAiTarget(actor, state);
    expect(target).not.toBeNull();
    expect(target?.crabId).toBe(state.enemy[1].crabId);
  });

  it("returns null when no enemies are alive", () => {
    const p = [generateCrab({ classId: "reaver", level: 5, seed: 1 })];
    const e = [generateCrab({ classId: "bulwark", level: 5, seed: 2 })];
    const state = initBattle(p, e, 42);
    for (const c of state.enemy) c.isDefeated = true;
    const target = pickAiTarget(state.player[0], state);
    expect(target).toBeNull();
  });
});

describe("pickAiSkill", () => {
  it("returns an affordable, off-cooldown skill", () => {
    const crab = generateCrab({ classId: "reaver", level: 5, seed: 1 });
    const c = makeCombatant(crab, "enemy", 0);
    const skill = pickAiSkill(c);
    expect(skill).toBeTruthy();
    expect(skill.energyCost).toBeLessThanOrEqual(c.energy);
  });

  it("falls back to claw strike when energy is low", () => {
    const crab = generateCrab({ classId: "reaver", level: 5, seed: 1 });
    const c = makeCombatant(crab, "enemy", 0);
    c.energy = 1; // only Claw Strike (cost 1) is affordable
    const skill = pickAiSkill(c);
    expect(skill.id).toBe("claw_strike");
  });

  it("prefers support skills for support classes when available", () => {
    const crab = generateCrab({ classId: "shellmender", level: 10, seed: 5 });
    const c = makeCombatant(crab, "player", 0);
    c.energy = c.maxEnergy; // full energy so all skills affordable
    const skill = pickAiSkill(c);
    // Shellmender has Mending Pearl (skill 2) which targets ally → support
    expect(["mend_pearl", "tide_sigil", "claw_strike"]).toContain(skill.id);
    // Should prefer support (not claw_strike)
    expect(skill.id).not.toBe("claw_strike");
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
    const state = runBattle(initBattle(p, e, 7), 30);
    const rewards = calculateRewards(state, 100);
    expect(rewards.winner).toBe("player");
    expect(rewards.goldReward).toBeGreaterThan(0);
    expect(rewards.xpReward).toBeGreaterThan(0);
  });

  it("defeat gives zero or minimal rewards", () => {
    const p = [1, 1, 1, 1, 1].map((lvl, i) =>
      generateCrab({ level: lvl, seed: 10 + i })
    );
    const e = [20, 22, 21, 22, 20].map((lvl, i) =>
      generateCrab({ level: lvl, seed: 20 + i })
    );
    const state = runBattle(initBattle(p, e, 7), 30);
    const rewards = calculateRewards(state, 100);
    expect(rewards.winner).toBe("enemy");
    expect(rewards.goldReward).toBe(0);
    expect(rewards.xpReward).toBe(0);
  });
});

describe("status effects", () => {
  it("freeze prevents a crab from acting", () => {
    const player = [1, 2, 3, 4, 5].map((i) =>
      generateCrab({ classId: "reaver", level: 5, seed: 100 + i })
    );
    const enemy = [1, 2, 3, 4, 5].map((i) =>
      generateCrab({ classId: "bulwark", level: 5, seed: 200 + i })
    );
    const state = initBattle(player, enemy, 42);
    const frozen = state.player[0];
    // Manually apply freeze to the first player crab.
    frozen.statuses.push({
      id: "freeze",
      roundsRemaining: 1,
      magnitude: 0,
    });
    resolveRound(state);

    // The frozen crab should have produced exactly one log entry,
    // and it must be the "frozen" skip entry (no damage/heal action).
    const frozenActions = state.log.filter(
      (a) => a.actorId === frozen.crabId
    );
    expect(frozenActions.length).toBe(1);
    expect(frozenActions[0].skillId).toBe("frozen");
    expect(frozenActions[0].message).toMatch(/frozen/i);
    // No damage / heal should have been recorded for the frozen crab.
    expect(frozenActions[0].damage).toBeUndefined();
    expect(frozenActions[0].heal).toBeUndefined();
  });

  it("warden freeze lasts 2 turns (frozen crab skips 2 consecutive turns)", () => {
    // A frozen crab must NOT be able to attack. The freeze duration is 2
    // rounds so the skip is unmissable — a crab frozen this round also
    // skips the next. Both warden skills (Class Special + Tide Sigil) carry
    // the 2-round freeze.
    const skills = getSkillsForClass("warden");
    const freezeSkills = skills.filter(
      (s) => s.effect?.status === "freeze",
    );
    expect(freezeSkills.length).toBeGreaterThanOrEqual(1);
    for (const s of freezeSkills) {
      expect(s.effect?.rounds).toBe(2);
    }

    // End-to-end: a crab frozen for 2 rounds skips the first turn AND still
    // carries a remaining freeze tick (roundsRemaining drops to 1, not 0),
    // so it will skip the next turn too. We only run ONE round so the frozen
    // crab is guaranteed to survive to act (the existing 1-round freeze test
    // above confirms a single skip; this confirms the duration is > 1).
    const player = [1, 2, 3, 4, 5].map((i) =>
      generateCrab({ classId: "reaver", level: 5, seed: 100 + i })
    );
    const enemy = [1, 2, 3, 4, 5].map((i) =>
      generateCrab({ classId: "bulwark", level: 5, seed: 200 + i })
    );
    const state = initBattle(player, enemy, 7);
    const frozen = state.player[0];
    frozen.statuses.push({
      id: "freeze",
      roundsRemaining: 2,
      magnitude: 0,
    });
    resolveRound(state);
    const skips = state.log.filter(
      (a) => a.actorId === frozen.crabId && a.skillId === "frozen",
    ).length;
    const attacks = state.log.filter(
      (a) => a.actorId === frozen.crabId && a.skillId !== "frozen",
    ).length;
    expect(skips).toBe(1);
    expect(attacks).toBe(0);
    // The freeze was consumed by ONE (roundsRemaining 2 → 1) and is STILL
    // active — proving the 2-round duration. A 1-round freeze would be gone.
    const remainingFreeze = frozen.statuses.find((s) => s.id === "freeze");
    expect(remainingFreeze).toBeDefined();
    expect(remainingFreeze?.roundsRemaining).toBe(1);
  });

  it("weaken reduces damage dealt", () => {
    // Two fresh states with identical seeds → identical RNG rolls.
    // In state2 we apply weaken (magnitude 1.0 → -100% attack) before attacking.
    // Damage should drop to zero (action.damage becomes undefined).
    const player = [1, 2, 3, 4, 5].map((i) =>
      generateCrab({ classId: "reaver", level: 10, seed: 100 + i })
    );
    const enemy = [1, 2, 3, 4, 5].map((i) =>
      generateCrab({ classId: "bulwark", level: 10, seed: 200 + i })
    );

    // Without weaken.
    const state1 = initBattle(player, enemy, 999);
    const actor1 = state1.player[0];
    const target1 = state1.enemy[0];
    const clawStrike: ArenaSkill = getSkillsForClass(actor1.classId)[0];
    const action1 = applySkill(state1, actor1, clawStrike, [target1]);
    expect(action1.damage).toBeGreaterThan(0);

    // With weaken magnitude = 1.0 → effectiveAtk = 0 → damage = 0.
    const state2 = initBattle(player, enemy, 999);
    const actor2 = state2.player[0];
    const target2 = state2.enemy[0];
    actor2.statuses.push({
      id: "weaken",
      roundsRemaining: 2,
      magnitude: 1.0,
    });
    const action2 = applySkill(state2, actor2, clawStrike, [target2]);
    // With magnitude 1.0, rawDmg is exactly 0 → damage field is omitted.
    expect(action2.damage).toBeUndefined();
    // Target HP should not have changed.
    expect(target2.hp).toBe(target2.maxHp);
  });
});
