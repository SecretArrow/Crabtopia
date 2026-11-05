// Unit tests for the sim pilot (engine/autoPilot.ts decideSimAction) —
// the AI that plays BOTH teams in the real-time auto battler: target
// legality under the position rules, the documented target priorities
// (finisher → element-weak → lowest HP), role behaviour (assassin
// flanks, warden hunts the carry, mender cleanses then heals),
// support/AoE choices, the freeze gate, determinism.
import { describe, it, expect } from "vitest";
import {
  getSkillsForClass,
  initBattle,
  legalEnemyTargets,
  makeCombatant,
  type ArenaBattleState,
  type Combatant,
} from "../../src/game/engine/arenaEngine";
import {
  createSim,
  runSimToCompletion,
  type SimState,
  type SimUnit,
} from "../../src/game/engine/battleSim";
import { decideSimAction, HEAL_THRESHOLD } from "../../src/game/engine/autoPilot";
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

function simOf(player: Combatant[], enemy: Combatant[]): SimState {
  const state = stateOf(player, enemy);
  const spawns: Record<string, { x: number; y: number }> = {};
  for (const c of [...player, ...enemy]) {
    spawns[c.crabId] = {
      x: c.side === "player" ? 20 : 80,
      y: 20 + c.slot * 15,
    };
  }
  return createSim(state, spawns);
}

function unitOf(sim: SimState, c: Combatant): SimUnit {
  return sim.units.find((u) => u.c === c)!;
}

describe("autoPilot — target legality (position rules)", () => {
  it("melee actors only ever target the frontmost living row", () => {
    const actor = combatant("reaver", "player", 0, "front", { energy: 10 });
    const front = combatant("bulwark", "enemy", 0, "front");
    const back = combatant("tidecaller", "enemy", 1, "back", { hp: 10 });
    const sim = simOf([actor], [front, back]);
    const decision = decideSimAction(sim, unitOf(sim, actor));
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
        const sim = simOf([actor], enemies);
        const decision = decideSimAction(sim, unitOf(sim, actor));
        expect(decision, `${cls} vs ${rows}`).not.toBeNull();
        if (decision!.skill.targetType === "enemy") {
          const legal = legalEnemyTargets(sim.battle, actor, decision!.skill);
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
    // Energy 4: the class special (cost 4) is affordable, the 5-cost
    // debuff sigil is not — so the damage branch is what decides.
    const actor = combatant("reaver", "player", 0, "front", {
      energy: 4,
      attack: 60,
    });
    const dying = combatant("pincher", "enemy", 0, "front", { hp: 8 });
    const healthy = combatant("bulwark", "enemy", 1, "front", { hp: 400 });
    const sim = simOf([actor], [healthy, dying]);
    const decision = decideSimAction(sim, unitOf(sim, actor));
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
    const sim = simOf([actor], [weak, neutralLow]);
    const decision = decideSimAction(sim, unitOf(sim, actor));
    expect(decision!.targets[0]).toBe(weak);
  });

  it("is deterministic: same state, same decision", () => {
    const actor = combatant("skitter", "player", 0, "mid", { energy: 10 });
    const enemies = [
      combatant("bulwark", "enemy", 0, "front"),
      combatant("pincher", "enemy", 1, "back", { hp: 30 }),
    ];
    const sim = simOf([actor], enemies);
    const a = decideSimAction(sim, unitOf(sim, actor));
    const b = decideSimAction(sim, unitOf(sim, actor));
    expect(a?.skill.id).toBe(b?.skill.id);
    expect(a?.targets.map((t) => t.crabId)).toEqual(
      b?.targets.map((t) => t.crabId),
    );
  });
});

describe("autoPilot — role behaviour", () => {
  it("skitter flanks: it hunts the back row, ignoring the front tank", () => {
    // Energy 4: special affordable, 5-cost sigil not — pure damage pick.
    const actor = combatant("skitter", "player", 0, "mid", { energy: 4 });
    const tank = combatant("bulwark", "enemy", 0, "front", { hp: 900 });
    const backline = combatant("tidecaller", "enemy", 1, "back", { hp: 60 });
    const sim = simOf([actor], [tank, backline]);
    const decision = decideSimAction(sim, unitOf(sim, actor));
    expect(decision!.reason).toBe("damage");
    expect(decision!.targets).toEqual([backline]);
  });

  it("warden aims its freeze at the enemy carry (highest attack)", () => {
    const actor = combatant("warden", "player", 0, "back", { energy: 10 });
    const meatshield = combatant("bulwark", "enemy", 0, "front", {
      attack: 5,
    });
    const carry = combatant("tidecaller", "enemy", 1, "back", {
      attack: 80,
    });
    const sim = simOf([actor], [meatshield, carry]);
    const decision = decideSimAction(sim, unitOf(sim, actor));
    expect(decision!.skill.effect?.status).toBe("freeze");
    expect(decision!.targets[0]).toBe(carry);
  });

  it("shellmender cleanses a hard-CC'd ally before anything else", () => {
    const mender = combatant("shellmender", "player", 0, "back", {
      energy: 10,
    });
    const frozenAlly = combatant("bulwark", "player", 1, "front");
    frozenAlly.statuses.push({
      id: "freeze",
      durationMs: 2000,
      magnitude: 0,
    });
    const enemy = combatant("reaver", "enemy", 0, "front");
    const sim = simOf([mender, frozenAlly], [enemy]);
    const decision = decideSimAction(sim, unitOf(sim, mender));
    expect(decision!.reason).toBe("cleanse");
    expect(decision!.skill.id).toBe("mend_pearl");
    expect(decision!.targets).toEqual([frozenAlly]);
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
    const sim = simOf([mender, hurt], [enemy]);
    const decision = decideSimAction(sim, unitOf(sim, mender));
    expect(decision!.reason).toBe("heal");
    expect(decision!.targets).toEqual([hurt]);
  });

  it("does not heal when everyone is healthy", () => {
    const mender = combatant("shellmender", "player", 0, "back", {
      energy: 10,
    });
    const ally = combatant("bulwark", "player", 1, "front");
    const enemy = combatant("reaver", "enemy", 0, "front");
    const sim = simOf([mender, ally], [enemy]);
    const decision = decideSimAction(sim, unitOf(sim, mender));
    expect(decision!.reason).not.toBe("heal");
  });

  it("bulwark raises its shield sigil while no ally is shielded", () => {
    const tank = combatant("bulwark", "player", 0, "front", { energy: 10 });
    const ally = combatant("pincher", "player", 1, "mid");
    const enemy = combatant("reaver", "enemy", 0, "front");
    const sim = simOf([tank, ally], [enemy]);
    const decision = decideSimAction(sim, unitOf(sim, tank));
    expect(decision!.reason).toBe("support");
    expect(decision!.skill.id).toBe("tide_sigil");
  });

  it("casts AoE when at least two enemies stand", () => {
    const mage = combatant("tidecaller", "player", 0, "back", { energy: 10 });
    const e1 = combatant("reaver", "enemy", 0, "front");
    const e2 = combatant("pincher", "enemy", 1, "front");
    const sim = simOf([mage], [e1, e2]);
    const decision = decideSimAction(sim, unitOf(sim, mage));
    expect(decision!.reason).toBe("aoe");
    expect(decision!.targets.length).toBe(2);
  });
});

describe("autoPilot — full battles always end", () => {
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
    const state = initBattle(player, enemy, 42);
    const spawns: Record<string, { x: number; y: number }> = {};
    for (const c of [...state.player, ...state.enemy]) {
      spawns[c.crabId] = {
        x: c.side === "player" ? 20 : 80,
        y: 20 + c.slot * 15,
      };
    }
    const sim = runSimToCompletion(createSim(state, spawns));
    expect(sim.battle.winner).not.toBeNull();
    expect(sim.timeMs).toBeLessThanOrEqual(180000);
    expect(sim.battle.log.length).toBeGreaterThan(10);
    // The pilot respects its own skills list (sanity: known skill ids,
    // plus the sim's regen-tick bookkeeping entries).
    const known = new Set(
      (["warden", "reaver", "shellmender", "skitter", "pincher", "tidecaller", "bulwark", "gildclaw"] as ClassId[]).flatMap(
        (c) => getSkillsForClass(c).map((s) => s.id),
      ),
    );
    known.add("regen_tick");
    for (const action of sim.battle.log) {
      expect(known.has(action.skillId)).toBe(true);
    }
  });
});

describe("autoPilot — incapacitation gate (freeze)", () => {
  it("decideSimAction returns null for a frozen crab (defense-in-depth)", () => {
    // A frozen crab must NOT receive a real decision from the pilot,
    // even if a caller forgets to check the freeze first.
    const actor = combatant("reaver", "player", 0, "front", { energy: 10 });
    const enemy = combatant("bulwark", "enemy", 0, "front", { hp: 100 });
    actor.statuses.push({ id: "freeze", durationMs: 2000, magnitude: 0 });
    const sim = simOf([actor], [enemy]);
    expect(decideSimAction(sim, unitOf(sim, actor))).toBeNull();
  });

  it("decideSimAction resumes real decisions once freeze is gone", () => {
    const actor = combatant("reaver", "player", 0, "front", { energy: 10 });
    const enemy = combatant("bulwark", "enemy", 0, "front", { hp: 100 });
    const sim = simOf([actor], [enemy]);
    actor.statuses.push({ id: "freeze", durationMs: 2000, magnitude: 0 });
    expect(decideSimAction(sim, unitOf(sim, actor))).toBeNull();
    actor.statuses = [];
    expect(decideSimAction(sim, unitOf(sim, actor))).not.toBeNull();
  });
});
