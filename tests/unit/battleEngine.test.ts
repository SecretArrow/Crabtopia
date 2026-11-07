// Unit tests for the turn-based raid/leviathan engine
// (src/game/engine/battle.ts) — defects proven by the 2026-11-07 audit:
//  - Shellmender heals could push an ally ABOVE its max HP (no cap)
//  - TACTIC_CARDS oppMod was declared for 4 of 6 cards but never applied
//    anywhere, so the printed card strengths (e.g. Ambush "+8%") were
//    not the strengths the engine actually used
import { describe, it, expect } from "vitest";
import {
  simulateBattle,
  type BattleSide,
} from "../../src/game/engine/battle";
import { generateCrab } from "../../src/game/engine/crabs";
import type { Crab } from "../../src/game/types";

const maxHp = (c: Crab) => c.stats.hp + c.level * 20;

function side(crabs: Crab[], tacticCard?: BattleSide["tacticCard"]): BattleSide {
  return { crabs, tacticCard, name: "side" };
}

describe("shellmender heals", () => {
  it("never heal any crab above its max HP (150 seeds)", () => {
    const menderTeam: Crab[] = [
      generateCrab({ classId: "shellmender", level: 30, seed: 777 }),
      ...[0, 1, 2, 3].map((i) =>
        generateCrab({ classId: "bulwark", level: 30, seed: 780 + i })
      ),
    ];
    const weakTeam: Crab[] = [0, 1, 2, 3, 4].map((i) =>
      generateCrab({ classId: "skitter", level: 1, seed: 900 + i })
    );
    for (let seed = 1; seed <= 150; seed++) {
      const r = simulateBattle(side(menderTeam), side(weakTeam), seed);
      r.finalHP.raider.forEach((hp, i) => {
        expect(hp).toBeLessThanOrEqual(maxHp(menderTeam[i]));
      });
      r.finalHP.defender.forEach((hp, i) => {
        expect(hp).toBeLessThanOrEqual(maxHp(weakTeam[i]));
      });
      // Heal events must also report the amount actually healed.
      for (const e of r.events) {
        if (e.heal !== undefined) expect(e.heal).toBeGreaterThan(0);
      }
    }
  });
});

describe("tactic cards", () => {
  const raiders: Crab[] = [0, 1, 2, 3, 4].map((i) =>
    generateCrab({ level: 20, seed: 500 + i })
  );
  const defenders: Crab[] = [0, 1, 2, 3, 4].map((i) =>
    generateCrab({ level: 20, seed: 600 + i })
  );

  it("the opponent's oppMod actually suppresses my BP (Ambush -2% vs none)", () => {
    // Defender plays Blitz (selfMod only). If the raider plays Ambush,
    // Ambush's oppMod (-0.02) must reduce the DEFENDER's effectiveness;
    // Fortify has oppMod 0, so defender BP must be strictly lower
    // against Ambush than against Fortify, all else identical.
    const vsAmbush = simulateBattle(
      side(raiders, "ambush"),
      side(defenders, "blitz"),
      42
    );
    const vsFortify = simulateBattle(
      side(raiders, "fortify"),
      side(defenders, "blitz"),
      42
    );
    expect(vsAmbush.defenderTotalBP).toBeLessThan(vsFortify.defenderTotalBP);
  });

  it("counter bonus still applies on top (Ambush vs Fortify)", () => {
    // Ambush counters Fortify: ambush mod = 0.06 self + 0.04 counter +
    // fortify oppMod 0 = 0.10. Fortify's own mod = 0.06 + ambush
    // oppMod -0.02 = 0.04. Identical teams on both sides isolate the
    // tactic swing: the ambush side must out-BP the fortify side.
    const team: Crab[] = [0, 1, 2, 3, 4].map((i) =>
      generateCrab({ level: 20, seed: 700 + i })
    );
    const r = simulateBattle(side(team, "ambush"), side(team, "fortify"), 7);
    expect(r.raiderTotalBP).toBeGreaterThan(r.defenderTotalBP);
  });
});
