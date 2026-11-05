// Unit tests for the arena AutoPilot (engine/autoPilot.ts) — the AI
// that plays BOTH teams in the full auto battler: target legality
// under the position rules, the documented target priorities
// (finisher → element-weak → lowest HP), healing below the threshold,
// support/AoE choices, determinism, and full-battle termination.
import { describe, it, expect } from "vitest";
import {
  applySkill,
  getSkillsForClass,
  initBattle,
  legalEnemyTargets,
  makeCombatant,
  type ArenaBattleState,
  type Combatant,
} from "../../src/game/engine/arenaEngine";
import { decideAction, HEAL_THRESHOLD } from "../../src/game/engine/autoPilot";
import { generateCrab } from "../../src/game/engine/crabs";
import type { ClassId, ElementId, FactionId } from "../../src/game/types";
import type { RowId } from "../../src/game/engine/formation";

let uid = 0;
function combatant(
  classId: ClassId,
  side: "player" | "enemy",
  slot: number,
  row: RowId,
  opts: {
    faction?: FactionId;
    element?: ElementId;
    hp?: number;
    attack?: number;
    energy?: number;
    level?: number;
  } = {},
): Combatant {
  uid += 1;
  const crab = generateCrab({
    classId,
    faction: opts.faction ?? "coral_court",
    level: opts.level ?? 10,
    seed: 5000 + uid,
  });
  if (opts.attack !== undefined) crab.stats.attack = opts.attack;
  const c = makeCombatant(crab, side, slot, row);
  if (opts.element) c.element = opts.element;
  if (opts.hp !== undefined) {
    c.maxHp = Math.max(opts.hp, c.maxHp);
    c.hp = opts.hp;
  }
  if (opts.energy !== undefined) c.energy = opts.energy;
  return c;
}

function stateOf(player: Combatant[], enemy: Combatant[]): ArenaBattleState {
  return {
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
}

describe("autoPilot — target legality (position rules)", () => {
  it("melee actors only ever target the frontmost living row", () => {
    const actor = combatant("reaver", "player", 0, "front", { energy: 10 });
    const front = combatant("bulwark", "enemy", 0, "front");
    const back = combatant("tidecaller", "enemy", 1, "back", { hp: 10 });
    const state = stateOf([actor], [front, back]);
    const decision = decideAction(state, actor);
    expect(decision).not.toBeNull();
    // Even though the back crab is nearly dead, melee cannot reach it.
    if (decision!.skill.targetType === "enemy") {
      expect(decision!.targets).toEqual([front]);
    }
  });

  it("every single-target decision stays inside legalEnemyTargets (matrix)", () => {
    const rowSets: RowId[][] = [
      ["front"],
      ["back"],
      ["mid", "back"],
      ["front", "mid", "back"],
      ["back", "back"],
    ];
    for (const rows of rowSets) {
      for (const cls of ["reaver", "warden", "pincher"] as ClassId[]) {
        const actor = combatant(cls, "player", 0, "front", { energy: 10 });
        const enemies = rows.map((r, i) =>
          combatant("bulwark", "enemy", i, r, { hp: 60 + i * 40 }),
        );
        const state = stateOf([actor], enemies);
        const decision = decideAction(state, actor);
        expect(decision, `${cls} vs ${rows}`).not.toBeNull();
        if (decision!.skill.targetType === "enemy") {
          const legal = legalEnemyTargets(state, actor, decision!.skill);
          for (const t of decision!.targets) {
            expect(legal).toContain(t);
          }
        } else if (decision!.skill.targetType === "all_enemies") {
          expect(decision!.targets.length).toBe(enemies.length);
        }
      }
    }
  });
});

describe("autoPilot — target priorities", () => {
  it("finishers beat everything: a killable target is chosen", () => {
    const actor = combatant("reaver", "player", 0, "front", {
      energy: 10,
      attack: 60,
    });
    const dying = combatant("pincher", "enemy", 0, "front", { hp: 8 });
    const healthy = combatant("bulwark", "enemy", 1, "front", { hp: 400 });
    const state = stateOf([actor], [healthy, dying]);
    const decision = decideAction(state, actor);
    expect(decision!.reason).toBe("damage");
    expect(decision!.targets).toEqual([dying]);
  });

  it("element-weak targets outrank lower-HP neutral targets", () => {
    // Nerala attacker: strong vs Vulkara, weak vs Bentala.
    const actor = combatant("pincher", "player", 0, "front", {
      energy: 10,
      attack: 18,
      element: "nerala",
    });
    const weak = combatant("reaver", "enemy", 0, "front", {
      hp: 400,
      element: "vulkara",
    });
    const neutralLow = combatant("warden", "enemy", 1, "front", {
      hp: 120,
      element: "bentala",
    });
    const state = stateOf([actor], [weak, neutralLow]);
    const decision = decideAction(state, actor);
    expect(decision!.targets[0]).toBe(weak);
  });

  it("is deterministic: same state, same decision", () => {
    const actor = combatant("skitter", "player", 0, "mid", { energy: 10 });
    const enemies = [
      combatant("bulwark", "enemy", 0, "front"),
      combatant("pincher", "enemy", 1, "back", { hp: 30 }),
    ];
    const state = stateOf([actor], enemies);
    const a = decideAction(state, actor);
    const b = decideAction(state, actor);
    expect(a?.skill.id).toBe(b?.skill.id);
    expect(a?.targets.map((t) => t.crabId)).toEqual(
      b?.targets.map((t) => t.crabId),
    );
  });
});

describe("autoPilot — heal & support & AoE", () => {
  it("heals the lowest ally when below the 55% threshold", () => {
    const mender = combatant("shellmender", "player", 0, "back", {
      energy: 10,
    });
    const hurt = combatant("bulwark", "player", 1, "front");
    hurt.hp = Math.floor(hurt.maxHp * (HEAL_THRESHOLD - 0.15));
    const enemy = combatant("reaver", "enemy", 0, "front");
    const state = stateOf([mender, hurt], [enemy]);
    const decision = decideAction(state, mender);
    expect(decision!.reason).toBe("heal");
    expect(decision!.targets).toEqual([hurt]);
  });

  it("does not heal when everyone is healthy", () => {
    const mender = combatant("shellmender", "player", 0, "back", {
      energy: 10,
    });
    const ally = combatant("bulwark", "player", 1, "front");
    const enemy = combatant("reaver", "enemy", 0, "front");
    const state = stateOf([mender, ally], [enemy]);
    const decision = decideAction(state, mender);
    expect(decision!.reason).not.toBe("heal");
  });

  it("bulwark raises its shield sigil while no ally is shielded", () => {
    const tank = combatant("bulwark", "player", 0, "front", { energy: 10 });
    const ally = combatant("pincher", "player", 1, "mid");
    const enemy = combatant("reaver", "enemy", 0, "front");
    const state = stateOf([tank, ally], [enemy]);
    const decision = decideAction(state, tank);
    expect(decision!.reason).toBe("support");
    expect(decision!.skill.id).toBe("tide_sigil");
  });

  it("casts AoE when at least two enemies stand", () => {
    const mage = combatant("tidecaller", "player", 0, "back", { energy: 10 });
    const e1 = combatant("reaver", "enemy", 0, "front");
    const e2 = combatant("pincher", "enemy", 1, "front");
    const state = stateOf([mage], [e1, e2]);
    const decision = decideAction(state, mage);
    expect(decision!.reason).toBe("aoe");
    expect(decision!.targets.length).toBe(2);
  });
});

describe("autoPilot — full battles always end", () => {
  function runPilotedBattle(
    playerCrabs: ReturnType<typeof generateCrab>[],
    enemyCrabs: ReturnType<typeof generateCrab>[],
  ): ArenaBattleState {
    const state = initBattle(playerCrabs, enemyCrabs, 42);
    const alive = (side: "player" | "enemy") =>
      (side === "player" ? state.player : state.enemy).some(
        (c) => !c.isDefeated,
      );
    let rounds = 0;
    while (alive("player") && alive("enemy") && rounds < 30) {
      rounds += 1;
      state.turn += 1;
      const order = [...state.player, ...state.enemy]
        .filter((c) => !c.isDefeated)
        .sort((a, b) => b.speed - a.speed);
      for (const actor of order) {
        if (actor.isDefeated) continue;
        if (!alive("player") || !alive("enemy")) break;
        const decision = decideAction(state, actor);
        if (decision) applySkill(state, actor, decision.skill, decision.targets);
      }
      // End-of-round lite: energy regen + cooldown ticks.
      for (const c of [...state.player, ...state.enemy]) {
        c.energy = Math.min(c.maxEnergy, c.energy + 2);
        for (const k of Object.keys(c.cooldowns)) {
          if (c.cooldowns[k] > 0) c.cooldowns[k] -= 1;
        }
      }
    }
    if (!alive("enemy")) state.winner = "player";
    else if (!alive("player")) state.winner = "enemy";
    else {
      // Round-cap tiebreak, mirroring runBattle: more HP remaining wins.
      const hp = (list: Combatant[]) =>
        list.reduce((s, c) => s + (c.isDefeated ? 0 : c.hp), 0);
      state.winner = hp(state.player) >= hp(state.enemy) ? "player" : "enemy";
    }
    return state;
  }

  it("resolves mixed teams, including combined-element crabs", () => {
    const mk = (faction: FactionId, cls: ClassId, seed: number) =>
      generateCrab({ faction, classId: cls, level: 12, seed });
    const player = [
      mk("frostshelf", "warden", 11), // Himara (combined)
      mk("cinderreef", "reaver", 12),
      mk("mangrove", "shellmender", 13), // Rimba (combined)
      mk("stormwake", "skitter", 14),
      mk("coral_court", "pincher", 15),
    ];
    const enemy = [
      mk("moonpool", "tidecaller", 21),
      mk("cinderreef", "bulwark", 22),
      mk("frostshelf", "warden", 23),
      mk("mangrove", "pincher", 24),
      mk("stormwake", "gildclaw", 25),
    ];
    const state = runPilotedBattle(player, enemy);
    expect(state.winner).not.toBeNull();
    expect(state.turn).toBeLessThanOrEqual(30);
    expect(state.log.length).toBeGreaterThan(10);
    // The pilot respects its own skills list (sanity: known skill ids).
    const known = new Set(
      (["warden", "reaver", "shellmender", "skitter", "pincher", "tidecaller", "bulwark", "gildclaw"] as ClassId[]).flatMap(
        (c) => getSkillsForClass(c).map((s) => s.id),
      ),
    );
    for (const action of state.log) {
      expect(known.has(action.skillId)).toBe(true);
    }
  });
});

describe("autoPilot — incapacitation gate (freeze)", () => {
  it("decideAction returns null for a frozen crab (defense-in-depth)", () => {
    // A frozen crab must NOT receive a real decision from the AutoPilot,
    // even if a caller forgets to consumeFreeze first. This is the
    // defense-in-depth guard that ensures frozen crabs never attack.
    const actor = combatant("reaver", "player", 0, "front", { energy: 10 });
    const enemy = combatant("bulwark", "enemy", 0, "front", { hp: 100 });
    const state = stateOf([actor], [enemy]);
    // Freeze the actor for 2 rounds.
    actor.statuses.push({ id: "freeze", roundsRemaining: 2, magnitude: 0 });
    const decision = decideAction(state, actor);
    expect(decision).toBeNull();
  });

  it("decideAction resumes real decisions once freeze is consumed", () => {
    // After the freeze status is cleared, the pilot decides normally again.
    const actor = combatant("reaver", "player", 0, "front", { energy: 10 });
    const enemy = combatant("bulwark", "enemy", 0, "front", { hp: 100 });
    const state = stateOf([actor], [enemy]);
    actor.statuses.push({ id: "freeze", roundsRemaining: 2, magnitude: 0 });
    expect(decideAction(state, actor)).toBeNull();
    // Consume the freeze (mirrors consumeFreeze in ArenaBattle).
    actor.statuses = [];
    const decision = decideAction(state, actor);
    expect(decision).not.toBeNull();
  });
});
