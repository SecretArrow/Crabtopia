// Crabtopia - Deterministic turn-based battle engine
// Used for raid resolution and Coliseum brawls
import { Crab, BattleEvent, TacticCardId, Formation } from "../types";
import { CLASSES } from "../content/classes";
import { mulberry32 } from "./rng";
import { crabBaseBP, teamBP } from "./bp";
import { rowOf, type RowId } from "./formation";
import { effectiveness, elementOf } from "./elements";

export interface BattleSide {
  crabs: Crab[];
  tacticCard?: TacticCardId;
  formation?: Formation;
  name: string;
}

export interface BattleResult {
  winner: "raider" | "defender";
  raiderTotalBP: number;
  defenderTotalBP: number;
  events: BattleEvent[];
  seed: number;
  // HP state at end
  finalHP: { raider: number[]; defender: number[] };
}

// Tactic card effects (capped at +/- 12% BP, simplified to flat modifiers)
export const TACTIC_CARDS: Record<
  TacticCardId,
  { name: string; description: string; selfMod: number; oppMod: number; counter?: TacticCardId }
> = {
  ambush: {
    name: "Ambush",
    description: "+8% if opponent hasn't scouted. Bonus vs Fortify.",
    selfMod: 0.06,
    oppMod: -0.02,
    counter: "fortify",
  },
  fortify: {
    name: "Fortify",
    description: "Defender bonus +6%. Bonus vs Blitz.",
    selfMod: 0.06,
    oppMod: 0,
    counter: "blitz",
  },
  blitz: {
    name: "Blitz",
    description: "Skitter bonus, faster raid +5%. Bonus vs Siphon.",
    selfMod: 0.05,
    oppMod: 0,
    counter: "siphon",
  },
  siphon: {
    name: "Siphon",
    description: "Reduces steal but guarantees participation +4%.",
    selfMod: 0.04,
    oppMod: -0.03,
    counter: "bait",
  },
  bait: {
    name: "Bait",
    description: "Misleads scouting. Bonus vs Counter.",
    selfMod: 0.03,
    oppMod: -0.04,
    counter: "counter",
  },
  counter: {
    name: "Counter Stance",
    description: "Bonus against the last tactic used +7%.",
    selfMod: 0.04,
    oppMod: -0.03,
    counter: "ambush",
  },
};

function tacticEffectiveness(myCard: TacticCardId | undefined, oppCard: TacticCardId | undefined): number {
  if (!myCard) return 0;
  const card = TACTIC_CARDS[myCard];
  let mod = card.selfMod;
  if (oppCard && card.counter === oppCard) mod += 0.04;
  // The opposing card's oppMod suppresses MY effectiveness. It was
  // declared in TACTIC_CARDS (ambush -0.02, siphon -0.03, bait -0.04,
  // counter -0.03) but never applied anywhere — dead data that made the
  // printed card strengths wrong (Ambush advertises "+8%", which is
  // exactly its +6% self and -2% opponent swing combined).
  if (oppCard) mod += TACTIC_CARDS[oppCard].oppMod;
  // Header contract: capped at +/- 12% — the floor was missing too.
  return Math.max(-0.12, Math.min(mod, 0.12));
}

export function simulateBattle(
  raider: BattleSide,
  defender: BattleSide,
  seed: number
): BattleResult {
  const rng = mulberry32(seed);

  const raiderTacticMod = tacticEffectiveness(raider.tacticCard, defender.tacticCard);
  const defenderTacticMod = tacticEffectiveness(defender.tacticCard, raider.tacticCard);

  const raiderBP = teamBP(raider.crabs, defender.crabs, seed, raiderTacticMod, raider.formation);
  const defenderBP = teamBP(defender.crabs, raider.crabs, seed + 1, defenderTacticMod, defender.formation);

  // Simulate a short turn-based fight for the event log
  const events: BattleEvent[] = [];
  const raiderHP = raider.crabs.map((c) => c.stats.hp + c.level * 20);
  const defenderHP = defender.crabs.map((c) => c.stats.hp + c.level * 20);

  // Formation rows per side (fall back to the legacy 3-front/2-back layout
  // when a side has no formation). Position rules mirror arenaEngine:
  // melee strikes only reach the frontmost living row; the front row takes
  // 10% less damage; the back row takes 20% less while its front stands.
  const rowsFor = (side: BattleSide, crabs: Crab[]): RowId[] =>
    crabs.map(
      (c, i) =>
        (side.formation ? rowOf(side.formation, c.id) : null) ??
        (i <= 2 ? "front" : "back")
    );
  const raiderRows = rowsFor(raider, raider.crabs);
  const defenderRows = rowsFor(defender, defender.crabs);
  const rowsOf = (side: "raider" | "defender") =>
    side === "raider" ? raiderRows : defenderRows;
  const isCaster = (c: Crab) =>
    c.classId === "tidecaller" || c.classId === "shellmender";

  // Build turn order: all crabs sorted by speed (descending)
  type Actor = { crab: Crab; side: "raider" | "defender"; index: number };
  const allActors: Actor[] = [
    ...raider.crabs.map((c, i) => ({ crab: c, side: "raider" as const, index: i })),
    ...defender.crabs.map((c, i) => ({ crab: c, side: "defender" as const, index: i })),
  ].sort((a, b) => b.crab.stats.speed - a.crab.stats.speed);

  let turn = 1;
  const maxTurns = 12;

  for (let t = 0; t < maxTurns; t++) {
    let anyAlive = true;
    for (const actor of allActors) {
      const hpArr = actor.side === "raider" ? raiderHP : defenderHP;
      if (hpArr[actor.index] <= 0) continue;
      const oppHP = actor.side === "raider" ? defenderHP : raiderHP;
      const oppCrabs = actor.side === "raider" ? defender.crabs : raider.crabs;
      const oppSide = actor.side === "raider" ? "defender" : "raider";
      const oppRows = rowsOf(oppSide as "raider" | "defender");
      // find target: lowest HP opponent among the rows this actor can reach.
      // Melee actors are blocked by the frontmost living row; casters reach all.
      let reachRow: RowId | null = null;
      if (!isCaster(actor.crab)) {
        for (const row of ["front", "mid", "back"] as RowId[]) {
          if (oppHP.some((h, i) => h > 0 && oppRows[i] === row)) {
            reachRow = row;
            break;
          }
        }
      }
      let targetIdx = -1;
      let lowestHP = Infinity;
      for (let i = 0; i < oppHP.length; i++) {
        if (reachRow && oppRows[i] !== reachRow) continue;
        if (oppHP[i] > 0 && oppHP[i] < lowestHP) {
          lowestHP = oppHP[i];
          targetIdx = i;
        }
      }
      if (targetIdx < 0) {
        anyAlive = false;
        break;
      }
      const classDef = CLASSES[actor.crab.classId];
      const target = oppCrabs[targetIdx];
      // damage calculation
      const baseDmg =
        actor.crab.classId === "tidecaller" || actor.crab.classId === "shellmender"
          ? actor.crab.stats.skill * 0.9
          : actor.crab.stats.attack * 1.0;
      // Position factor: frontline guard (×0.9); backline protection (×0.8
      // while any front-row ally of the target is still standing).
      let posFactor = 1;
      const targetRow = oppRows[targetIdx];
      if (targetRow === "front") posFactor *= 0.9;
      if (
        targetRow === "back" &&
        oppHP.some((h, i) => h > 0 && oppRows[i] === "front")
      ) {
        posFactor *= 0.8;
      }
      // Element mod: same shared helper as the arena engine
      // (elements.ts — strong x1.15, weak x0.90, neutral x1.0).
      const elemFactor = effectiveness(
        elementOf(actor.crab),
        elementOf(target)
      );
      const dmg = Math.max(
        1,
        Math.round(
          baseDmg *
            (0.8 + rng() * 0.4) * // variance
            (1 - target.stats.defense / (target.stats.defense + 100)) *
            posFactor *
            elemFactor
        )
      );
      oppHP[targetIdx] -= dmg;

      const skillName = classDef.activeSkill.name;
      events.push({
        turn,
        actorId: actor.crab.id,
        actorSide: actor.side,
        skillId: classDef.activeSkill.id,
        targetId: target.id,
        targetSide: actor.side === "raider" ? "defender" : "raider",
        damage: dmg,
        message: `${actor.crab.name} casts ${skillName} on ${target.name} for ${dmg} damage.`,
      });

      // healers occasionally heal
      if (actor.crab.classId === "shellmender" && rng() < 0.5) {
        const allyHP = actor.side === "raider" ? raiderHP : defenderHP;
        const allyCrabs = actor.side === "raider" ? raider.crabs : defender.crabs;
        let healIdx = -1;
        let lowHP = Infinity;
        for (let i = 0; i < allyHP.length; i++) {
          if (allyHP[i] > 0 && allyHP[i] < lowHP) {
            lowHP = allyHP[i];
            healIdx = i;
          }
        }
        if (healIdx >= 0) {
          const heal = Math.round(actor.crab.stats.skill * 1.2);
          // Cap at max HP (stats.hp + level * 20, the same pool the HP
          // arrays start from): the uncapped heal pushed full-HP allies
          // above their maximum. The event reports the amount ACTUALLY
          // healed and is skipped when nothing was healed. The heal roll
          // above is still consumed, so the RNG stream is unchanged.
          const target = allyCrabs[healIdx];
          const maxHP = target.stats.hp + target.level * 20;
          const actualHeal = Math.min(heal, Math.max(0, maxHP - allyHP[healIdx]));
          if (actualHeal > 0) {
            allyHP[healIdx] += actualHeal;
            events.push({
              turn,
              actorId: actor.crab.id,
              actorSide: actor.side,
              targetId: target.id,
              targetSide: actor.side,
              heal: actualHeal,
              message: `${actor.crab.name} mends ${target.name} for ${actualHeal} HP.`,
            });
          }
        }
      }

      if (oppHP[targetIdx] <= 0) {
        events.push({
          turn,
          actorId: actor.crab.id,
          actorSide: actor.side,
          targetId: target.id,
          targetSide: actor.side === "raider" ? "defender" : "raider",
          effect: "defeated",
          message: `${target.name} is defeated!`,
        });
      }
    }
    turn++;
    // check if either side is wiped
    const raiderAlive = raiderHP.some((h) => h > 0);
    const defenderAlive = defenderHP.some((h) => h > 0);
    if (!raiderAlive || !defenderAlive) break;
  }

  // Winner determined by BP (the turn-based sim is for narrative/replay)
  // but if one side was wiped in sim, that side loses
  const raiderAliveCount = raiderHP.filter((h) => h > 0).length;
  const defenderAliveCount = defenderHP.filter((h) => h > 0).length;

  let winner: "raider" | "defender";
  if (raiderAliveCount === 0 && defenderAliveCount > 0) {
    winner = "defender";
  } else if (defenderAliveCount === 0 && raiderAliveCount > 0) {
    winner = "raider";
  } else {
    winner = raiderBP.total >= defenderBP.total ? "raider" : "defender";
  }

  return {
    winner,
    raiderTotalBP: raiderBP.total,
    defenderTotalBP: defenderBP.total,
    events,
    seed,
    finalHP: { raider: raiderHP, defender: defenderHP },
  };
}
