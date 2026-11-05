// Unit tests for the real-time battle simulator (engine/battleSim.ts):
// determinism, Skip-equivalence (watch-in-chunks ≡ run headless),
// role movement behaviour (melee closes, warden kites a slower chaser,
// mender heals, skitter's first strike lands on the backline), death
// semantics (death events, corpses never targeted again), timeout rule.
import { describe, it, expect } from "vitest";
import { initBattle } from "../../src/game/engine/arenaEngine";
import {
  createSim,
  stepSim,
  runSimToCompletion,
  hashSimEvents,
  distanceBetween,
  MELEE_REACH,
  SEPARATION,
  type SimEvent,
  type SimState,
  type SimUnit,
} from "../../src/game/engine/battleSim";
import { generateCrab } from "../../src/game/engine/crabs";
import type { ClassId, Crab } from "../../src/game/types";

function mk(
  classId: ClassId,
  seed: number,
  level = 10,
  stats?: Partial<Crab["stats"]>,
): Crab {
  const c = generateCrab({ classId, seed, level });
  return stats ? { ...c, stats: { ...c.stats, ...stats } } : c;
}

function simOf(
  player: Crab[],
  enemy: Crab[],
  seed = 42,
  spawns?: Record<string, { x: number; y: number }>,
): SimState {
  const state = initBattle(player, enemy, seed);
  const sp: Record<string, { x: number; y: number }> = spawns ?? {};
  if (!spawns) {
    for (const c of [...state.player, ...state.enemy]) {
      sp[c.crabId] = {
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
  }
  return createSim(state, sp);
}

function unit(sim: SimState, crabId: string): SimUnit {
  return sim.units.find((u) => u.c.crabId === crabId)!;
}

describe("battleSim — determinism", () => {
  it("same seed → identical event hash and winner", () => {
    const p = [0, 1, 2, 3, 4].map((i) => mk("reaver", 10 + i, 10));
    const e = [0, 1, 2, 3, 4].map((i) => mk("bulwark", 20 + i, 10));
    const a = runSimToCompletion(simOf(p, e, 777));
    const b = runSimToCompletion(simOf(p, e, 777));
    expect(hashSimEvents(a.events)).toBe(hashSimEvents(b.events));
    expect(a.battle.winner).toBe(b.battle.winner);
  });

  it("different seeds → different event streams", () => {
    const p = [0, 1, 2, 3, 4].map((i) => mk("reaver", 10 + i, 10));
    const e = [0, 1, 2, 3, 4].map((i) => mk("bulwark", 20 + i, 10));
    const a = runSimToCompletion(simOf(p, e, 1));
    const b = runSimToCompletion(simOf(p, e, 2));
    expect(hashSimEvents(a.events)).not.toBe(hashSimEvents(b.events));
  });
});

describe("battleSim — Skip equivalence", () => {
  it("watching in chunks then skipping ≡ running headless from the start", () => {
    const p = [0, 1, 2, 3, 4].map((i) => mk("pincher", 30 + i, 12));
    const e = [0, 1, 2, 3, 4].map((i) => mk("warden", 40 + i, 11));
    const watched = simOf(p, e, 31415);
    // "Watch" three seconds in small steps, then Skip.
    for (let t = 0; t < 3000; t += 50) stepSim(watched, 50);
    runSimToCompletion(watched);
    const headless = runSimToCompletion(simOf(p, e, 31415));
    expect(watched.battle.winner).toBe(headless.battle.winner);
    expect(hashSimEvents(watched.events)).toBe(
      hashSimEvents(headless.events),
    );
    expect(watched.timeMs).toBe(headless.timeMs);
    for (let i = 0; i < watched.units.length; i++) {
      expect(watched.units[i].c.hp).toBeCloseTo(headless.units[i].c.hp, 6);
    }
  });
});

describe("battleSim — role movement", () => {
  it("melee closes the distance and only strikes inside melee reach", () => {
    const reaver = mk("reaver", 1, 10);
    const dummy = mk("bulwark", 2, 10, { attack: 1 });
    const sim = simOf([reaver], [dummy], 5, {
      [reaver.id]: { x: 15, y: 50 },
      [dummy.id]: { x: 85, y: 50 },
    });
    const a = unit(sim, reaver.id);
    const b = unit(sim, dummy.id);
    expect(distanceBetween(a, b)).toBeGreaterThan(60);
    let strikeDistance = -1;
    for (let t = 0; t < 20000 && strikeDistance < 0; t += 50) {
      const before = sim.events.length;
      stepSim(sim, 50);
      for (let i = before; i < sim.events.length; i++) {
        const ev = sim.events[i];
        if (ev.type === "strike" && ev.actorId === reaver.id) {
          strikeDistance = distanceBetween(a, b);
        }
      }
    }
    expect(strikeDistance).toBeGreaterThan(0);
    // The hit landed at contact range (plus at most one tick of drift).
    expect(strikeDistance).toBeLessThanOrEqual(MELEE_REACH + 2.5);
  });

  it("a warden holds its engagement band against an approaching enemy", () => {
    const warden = mk("warden", 3, 12);
    // An approaching support: it advances to its own cast range and
    // holds there (it never crosses midfield), unkillable so the
    // sampling window runs its full length.
    const approacher = mk("shellmender", 4, 12, {
      hp: 100000,
      attack: 5,
    });
    const sim = simOf([warden], [approacher], 9, {
      [warden.id]: { x: 30, y: 50 },
      [approacher.id]: { x: 70, y: 50 },
    });
    const w = unit(sim, warden.id);
    const c = unit(sim, approacher.id);
    // Engage: run until the warden has fired at least one projectile.
    let engaged = false;
    for (let t = 0; t < 15000 && !engaged; t += 50) {
      stepSim(sim, 50);
      engaged = sim.events.some((e) => e.type === "projectileSpawn");
    }
    expect(engaged).toBe(true);
    // Sample the distance for 20 battle-seconds after engagement.
    let samples = 0;
    let inBand = 0;
    for (let t = 0; t < 20000; t += 50) {
      stepSim(sim, 50);
      const d = distanceBetween(w, c);
      samples += 1;
      if (d >= 18) inBand += 1;
    }
    expect(samples).toBeGreaterThan(300);
    // The pair settles at the warden's band instead of collapsing
    // into melee range.
    expect(inBand / samples).toBeGreaterThanOrEqual(0.8);
  });

  it("shellmender moves to its hurt ally and heals it", () => {
    const tank = mk("bulwark", 5, 10);
    const mender = mk("shellmender", 6, 10);
    const foe = mk("reaver", 7, 5, { attack: 5 });
    const state = initBattle([tank, mender], [foe], 11);
    const hurtTank = state.player.find((c) => c.classId === "bulwark")!;
    hurtTank.hp = Math.floor(hurtTank.maxHp * 0.4);
    const spawns: Record<string, { x: number; y: number }> = {};
    for (const c of [...state.player, ...state.enemy]) {
      spawns[c.crabId] = {
        x: c.side === "player" ? (c.row === "front" ? 42 : 10) : 58,
        y: 50,
      };
    }
    const sim = createSim(state, spawns);
    stepSim(sim, 15000);
    const heals = sim.events.filter(
      (e): e is Extract<SimEvent, { type: "heal" }> =>
        e.type === "heal" && e.actorId === mender.id,
    );
    expect(heals.length).toBeGreaterThanOrEqual(1);
    expect(heals[0].targetId).toBe(tank.id);
  });

  it("skitter's first strike lands on the backline, past the front tank", () => {
    const skitter = mk("skitter", 8, 15);
    const tank = mk("bulwark", 9, 5, { hp: 5000, attack: 5 });
    const backline = mk("tidecaller", 10, 5);
    const state = initBattle([skitter], [tank, backline], 13);
    const back = state.enemy.find((c) => c.classId === "tidecaller")!;
    back.hp = 40; // clearly the flank target: lowest HP, back row
    const spawns: Record<string, { x: number; y: number }> = {
      [skitter.id]: { x: 15, y: 50 },
      [tank.id]: { x: 58, y: 50 },
      [backline.id]: { x: 85, y: 50 },
    };
    const sim = createSim(state, spawns);
    let firstStrike: string | null = null;
    for (let t = 0; t < 45000 && firstStrike === null; t += 50) {
      const before = sim.events.length;
      stepSim(sim, 50);
      for (let i = before; i < sim.events.length; i++) {
        const ev = sim.events[i];
        if (ev.type === "strike" && ev.actorId === skitter.id) {
          firstStrike = ev.targetId;
        }
      }
    }
    expect(firstStrike).toBe(backline.id);
  });
});

describe("battleSim — standing separation", () => {
  it("attackers converging on one target ring it instead of stacking", () => {
    const attackers = [0, 1, 2].map((i) => mk("reaver", 50 + i, 10));
    // Unkillable target so the scrum persists for the whole sample.
    const target = mk("bulwark", 60, 10, { hp: 100000, attack: 1 });
    const sim = simOf(attackers, [target], 17, {
      [attackers[0].id]: { x: 20, y: 35 },
      [attackers[1].id]: { x: 20, y: 50 },
      [attackers[2].id]: { x: 20, y: 65 },
      [target.id]: { x: 60, y: 50 },
    });
    // Let the scrum form, then sample the closing seconds: the
    // standing per-tick separation must hold EVERY living pair at
    // personal-space distance while the attackers stay in contact
    // range of their shared target (a ring, not a pile and not a
    // shove-off).
    stepSim(sim, 6000);
    let minPair = Infinity;
    let maxToTarget = 0;
    for (let t = 0; t < 4000; t += 50) {
      stepSim(sim, 50);
      const alive = sim.units.filter((u) => !u.c.isDefeated);
      for (let i = 0; i < alive.length; i++) {
        for (let j = i + 1; j < alive.length; j++) {
          minPair = Math.min(minPair, distanceBetween(alive[i], alive[j]));
        }
      }
      const tgt = unit(sim, target.id);
      for (const atk of attackers) {
        maxToTarget = Math.max(
          maxToTarget,
          distanceBetween(unit(sim, atk.id), tgt),
        );
      }
    }
    expect(minPair).toBeGreaterThanOrEqual(SEPARATION - 0.05);
    expect(maxToTarget).toBeLessThanOrEqual(16);
  });
});

describe("battleSim — death semantics", () => {
  it("emits a death event with position; the corpse is never targeted again", () => {
    const killer = mk("reaver", 21, 20, { attack: 80 });
    const victim = mk("pincher", 22, 1, { hp: 30 });
    const sim = runSimToCompletion(simOf([killer], [victim], 21));
    expect(sim.battle.winner).toBe("player");
    const death = sim.events.find(
      (e) => e.type === "death" && e.targetId === victim.id,
    );
    expect(death).toBeDefined();
    if (death && death.type === "death") {
      expect(death.x).toBeGreaterThan(0);
      expect(death.y).toBeGreaterThan(0);
      // Nothing targets the corpse after the death moment.
      const after = sim.events.filter(
        (e) => e.at > death.at && "targetId" in e && e.targetId === victim.id,
      );
      expect(after).toHaveLength(0);
      // And the dead unit itself never acts again.
      const acts = sim.events.filter(
        (e) => e.at > death.at && "actorId" in e && e.actorId === victim.id,
      );
      expect(acts).toHaveLength(0);
    }
    const v = unit(sim, victim.id);
    expect(v.state).toBe("dead");
    expect(v.c.isDefeated).toBe(true);
  });

  it("in-flight projectiles fizzle when their target dies first", () => {
    // Warden (projectile class) + a fast killer vs one fragile target:
    // across the battle, any projectile aimed at the victim that is
    // still flying when the victim dies must fizzle, never hit.
    const warden = mk("warden", 31, 15);
    const killer = mk("reaver", 32, 20, { attack: 90 });
    const victim = mk("pincher", 33, 1, { hp: 25 });
    const sim = runSimToCompletion(simOf([warden, killer], [victim], 33));
    const death = sim.events.find(
      (e) => e.type === "death" && e.targetId === victim.id,
    );
    expect(death).toBeDefined();
    const hitsAfterDeath = sim.events.filter(
      (e) =>
        e.type === "projectileHit" &&
        death !== undefined &&
        e.at > death.at &&
        e.targetId === victim.id,
    );
    expect(hitsAfterDeath).toHaveLength(0);
  });
});

describe("battleSim — timeout", () => {
  it("two unkillable tanks end at the 180s cap with an HP-ratio winner", () => {
    const a = mk("bulwark", 41, 10, { hp: 100000, attack: 1 });
    const b = mk("bulwark", 42, 10, { hp: 100000, attack: 1 });
    const sim = runSimToCompletion(simOf([a], [b], 41));
    expect(sim.battle.winner).not.toBeNull();
    expect(sim.timeMs).toBeGreaterThanOrEqual(179000);
    expect(sim.timeMs).toBeLessThanOrEqual(180050);
  });
});
