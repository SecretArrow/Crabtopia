// Unit tests for battlefield position rules (arenaEngine rows + battle.ts).
// Rules under test (documented in README "Battlefield position rules"):
//  - melee single-target skills only reach the frontmost living enemy row
//  - ranged single-target skills reach any row
//  - frontline guard: front row takes ×0.9 damage from single-target skills
//  - backline protection: back row takes ×0.8 while its front row stands
//  - AoE ignores position factors
// Phase 2: the rules live on as targeting policy + damage factors inside
// the real-time sim — the damage comparison below runs through the sim.
import { describe, it, expect } from "vitest";
import {
  getSkillsForClass,
  initBattle,
  legalEnemyTargets,
  positionDamageFactor,
  skillRange,
  type ArenaBattleState,
} from "../../src/game/engine/arenaEngine";
import {
  createSim,
  stepSim,
  type SimState,
} from "../../src/game/engine/battleSim";
import { simulateBattle } from "../../src/game/engine/battle";
import { generateCrab } from "../../src/game/engine/crabs";
import type { ClassId, Crab, Formation } from "../../src/game/types";

function mkCrab(classId: ClassId, seed: number, stats?: Partial<Crab["stats"]>): Crab {
  const c = generateCrab({ classId, seed, level: 5, ownerId: "player" });
  return stats ? { ...c, stats: { ...c.stats, ...stats } } : c;
}

const BIG = { hp: 1000, attack: 50, defense: 10, speed: 10, skill: 50 };

function five(classId: ClassId, baseSeed: number): Crab[] {
  return [0, 1, 2, 3, 4].map((i) => mkCrab(classId, baseSeed + i, BIG));
}

function simFor(state: ArenaBattleState): SimState {
  const spawns: Record<string, { x: number; y: number }> = {};
  for (const c of [...state.player, ...state.enemy]) {
    spawns[c.crabId] = {
      x:
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
              : 90,
      y: 20 + c.slot * 15,
    };
  }
  return createSim(state, spawns);
}

describe("formation rows in initBattle", () => {
  it("assigns rows from the supplied formation", () => {
    const player = five("reaver", 100);
    const enemy = five("bulwark", 200);
    const formation: Formation = {
      front: [player[0].id],
      mid: [player[1].id, player[2].id],
      back: [player[3].id, player[4].id],
    };
    const state = initBattle(player, enemy, 42, { playerFormation: formation });
    expect(state.player.map((c) => c.row)).toEqual([
      "front",
      "mid",
      "mid",
      "back",
      "back",
    ]);
  });

  it("falls back to legacy rows (0-2 front, 3-4 back) without a formation", () => {
    const state = initBattle(five("reaver", 100), five("bulwark", 200), 42);
    expect(state.player.map((c) => c.row)).toEqual([
      "front",
      "front",
      "front",
      "back",
      "back",
    ]);
  });
});

describe("skillRange", () => {
  it("classifies claw strikes and claw specials as melee", () => {
    expect(skillRange(getSkillsForClass("reaver")[0])).toBe("melee");
    expect(skillRange(getSkillsForClass("reaver")[1])).toBe("melee");
    expect(skillRange(getSkillsForClass("pincher")[1])).toBe("melee");
  });

  it("classifies lightning casts as ranged and AoE specials as aoe", () => {
    expect(skillRange(getSkillsForClass("warden")[1])).toBe("ranged");
    expect(skillRange(getSkillsForClass("tidecaller")[1])).toBe("aoe");
    expect(skillRange(getSkillsForClass("bulwark")[1])).toBe("aoe");
    expect(skillRange(getSkillsForClass("shellmender")[1])).toBe("support");
  });
});

describe("melee reach & target legality", () => {
  function setup() {
    const player = [mkCrab("reaver", 1, BIG), mkCrab("warden", 2, BIG)];
    // Enemy: tank in front (huge HP), squishy in back (tiny HP).
    const tank = mkCrab("bulwark", 3, { ...BIG, hp: 5000 });
    const squishy = mkCrab("shellmender", 4, { ...BIG, hp: 30 });
    const mid = mkCrab("pincher", 5, { ...BIG, hp: 800 });
    const enemy = [tank, mid, squishy];
    const enemyFormation: Formation = {
      front: [tank.id],
      mid: [mid.id],
      back: [squishy.id],
    };
    const state = initBattle(player, enemy, 7, { enemyFormation });
    return { state, tank, squishy, mid };
  }

  it("melee skills can only target the frontmost living row", () => {
    const { state, tank } = setup();
    const actor = state.player[0];
    const claw = getSkillsForClass("reaver")[0];
    const legal = legalEnemyTargets(state, actor, claw);
    expect(legal.map((c) => c.crabId)).toEqual([tank.id]);
  });

  it("ranged skills may target any row, including the back", () => {
    const { state, squishy } = setup();
    const actor = state.player[1]; // warden
    const bolt = getSkillsForClass("warden")[1];
    const legal = legalEnemyTargets(state, actor, bolt);
    expect(legal.map((c) => c.crabId)).toContain(squishy.id);
  });

  it("when the front row falls, melee reach extends to the mid row", () => {
    const { state, mid } = setup();
    const front = state.enemy.find((c) => c.row === "front")!;
    front.isDefeated = true;
    front.hp = 0;
    const actor = state.player[0];
    const claw = getSkillsForClass("reaver")[0];
    const legal = legalEnemyTargets(state, actor, claw);
    expect(legal.map((c) => c.crabId)).toEqual([mid.id]);
  });

  it("ranged-profile classes strike the back row with their BASIC attack", () => {
    // Common-sense reach (design §5.2 amendment): Warden, Tidecaller
    // and Shellmender deliver their Claw Strike from their engagement
    // bands, so the basic attack is not frontmost-row-bound for them —
    // while a true contact class (Bulwark) stays frontmost-only.
    const rangedClasses: ClassId[] = ["warden", "tidecaller", "shellmender"];
    const player = [
      ...rangedClasses.map((c, i) => mkCrab(c, 40 + i, BIG)),
      mkCrab("bulwark", 49, BIG),
    ];
    const tank = mkCrab("bulwark", 3, { ...BIG, hp: 5000 });
    const squishy = mkCrab("shellmender", 4, { ...BIG, hp: 30 });
    const mid = mkCrab("pincher", 5, { ...BIG, hp: 800 });
    const enemyFormation: Formation = {
      front: [tank.id],
      mid: [mid.id],
      back: [squishy.id],
    };
    const state = initBattle(player, [tank, mid, squishy], 7, {
      enemyFormation,
    });
    const claw = getSkillsForClass("reaver")[0]; // Claw Strike, shared by all
    for (const actor of state.player.slice(0, 3)) {
      const legal = legalEnemyTargets(state, actor, claw);
      expect(legal.map((c) => c.crabId)).toContain(squishy.id);
      expect(legal.map((c) => c.crabId)).toContain(mid.id);
    }
    const bulwark = state.player[3];
    const legal = legalEnemyTargets(state, bulwark, claw);
    expect(legal.map((c) => c.crabId)).toEqual([tank.id]);
  });
});

describe("positionDamageFactor", () => {
  function setup() {
    const player = five("reaver", 300);
    const enemy = five("bulwark", 400);
    const formation: Formation = {
      front: [enemy[0].id],
      mid: [enemy[1].id],
      back: [enemy[2].id, enemy[3].id, enemy[4].id],
    };
    const state = initBattle(player, enemy, 9, { enemyFormation: formation });
    const byRow = (row: string) => state.enemy.find((c) => c.row === row)!;
    return { state, byRow };
  }
  const claw = getSkillsForClass("reaver")[0];
  const aoe = getSkillsForClass("tidecaller")[1];

  it("front row takes ×0.9 from single-target skills", () => {
    const { state, byRow } = setup();
    expect(positionDamageFactor(state, byRow("front"), claw)).toBeCloseTo(0.9);
  });

  it("mid row is neutral", () => {
    const { state, byRow } = setup();
    expect(positionDamageFactor(state, byRow("mid"), claw)).toBe(1);
  });

  it("back row takes ×0.8 while its front stands, ×1 once the front falls", () => {
    const { state, byRow } = setup();
    expect(positionDamageFactor(state, byRow("back"), claw)).toBeCloseTo(0.8);
    const front = byRow("front");
    front.isDefeated = true;
    front.hp = 0;
    expect(positionDamageFactor(state, byRow("back"), claw)).toBe(1);
  });

  it("AoE ignores position factors entirely", () => {
    const { state, byRow } = setup();
    expect(positionDamageFactor(state, byRow("front"), aoe)).toBe(1);
    expect(positionDamageFactor(state, byRow("back"), aoe)).toBe(1);
  });

  it("in the sim, a guarded front target takes less per-hit damage than an exposed back target", () => {
    // Average the attacker's strike damage over a long sim window in
    // two mirrored setups; only the position factor differs (×0.9
    // front-guard vs ×1.0 back-with-front-fallen), so the averages
    // must land near that ratio despite per-hit variance.
    const avgStrikeDamage = (targetRow: "front" | "back"): number => {
      // Attacker is unkillable so both windows run their full length.
      const player = [mkCrab("reaver", 1, { ...BIG, hp: 100000 })];
      const target = mkCrab("bulwark", 2, { ...BIG, hp: 100000 });
      const filler = mkCrab("bulwark", 3, { ...BIG, hp: 100000, attack: 1 });
      const enemyFormation: Formation =
        targetRow === "front"
          ? { front: [target.id], mid: [], back: [filler.id] }
          : { front: [filler.id], mid: [], back: [target.id] };
      const state = initBattle(player, [target, filler], 123, {
        enemyFormation,
      });
      if (targetRow === "back") {
        // Remove the front guard so only the row factor differs.
        const front = state.enemy.find((c) => c.row === "front")!;
        front.isDefeated = true;
        front.hp = 0;
      }
      const sim = simFor(state);
      stepSim(sim, 60000);
      const strikes = sim.events.filter(
        (e) =>
          e.type === "strike" &&
          e.actorId === state.player[0].crabId &&
          e.targetId === target.id,
      );
      expect(strikes.length).toBeGreaterThan(5);
      const total = strikes.reduce(
        (s, e) => s + (e.type === "strike" ? e.damage : 0),
        0,
      );
      return total / strikes.length;
    };
    const frontAvg = avgStrikeDamage("front");
    const backAvg = avgStrikeDamage("back");
    expect(frontAvg).toBeGreaterThan(0);
    expect(backAvg).toBeGreaterThan(0);
    expect(frontAvg).toBeLessThan(backAvg);
    const ratio = frontAvg / backAvg;
    expect(ratio).toBeGreaterThan(0.78);
    expect(ratio).toBeLessThan(1.0);
  });
});

describe("battle.ts (raid sim) formation targeting", () => {
  it("melee raiders cannot bypass a living front line to hit the back row", () => {
    const tank = mkCrab("bulwark", 21, { hp: 100000, attack: 5, defense: 50, speed: 1, skill: 5 });
    const squishy = mkCrab("shellmender", 22, { hp: 40, attack: 5, defense: 0, speed: 1, skill: 5 });
    const fillers = [23, 24, 25].map((s) =>
      mkCrab("bulwark", s, { hp: 100000, attack: 5, defense: 50, speed: 1, skill: 5 })
    );
    const defenderCrabs = [tank, ...fillers, squishy];
    const formation: Formation = {
      front: [tank.id, fillers[0].id, fillers[1].id, fillers[2].id],
      mid: [],
      back: [squishy.id],
    };
    const raiders = [31, 32, 33, 34, 35].map((s) =>
      mkCrab("reaver", s, { hp: 5000, attack: 60, defense: 10, speed: 20, skill: 10 })
    );
    const result = simulateBattle(
      { crabs: raiders, name: "Raiders" },
      { crabs: defenderCrabs, name: "Defenders", formation },
      555
    );
    const damageEvents = result.events.filter(
      (e) => e.actorSide === "raider" && typeof e.damage === "number"
    );
    expect(damageEvents.length).toBeGreaterThan(0);
    // Every raider damage event must land on a front-row crab: the squishy
    // back-row healer is unreachable for melee while the front stands, and
    // the front (100k HP) cannot fall inside the short sim.
    for (const e of damageEvents) {
      expect(e.targetId).not.toBe(squishy.id);
      expect(formation.front).toContain(e.targetId);
    }
  });
});
