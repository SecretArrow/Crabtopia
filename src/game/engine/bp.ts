// Crabtopia - Battle Points (BP) calculation
import { Crab, FactionId, BattleBreakdown } from "../types";
import { CLASSES } from "../content/classes";
import { FACTIONS, factionMatchupBonus } from "../content/factions";
import {
  getGeneVariant,
  rarityBonus,
  purityBonus,
  BODY_PART_SLOTS,
} from "../content/bodyparts";
import { mulberry32 } from "./rng";

// Compute base BP for a single crab
export function crabBaseBP(crab: Crab): number {
  const stats = crab.stats;
  const levelBonus = crab.level * 8;
  const statBP =
    stats.hp * 0.4 +
    stats.attack * 2.2 +
    stats.defense * 1.6 +
    stats.speed * 1.4 +
    stats.skill * 1.6;
  const purity = purityBonus(crab.purity);

  // part rarity bonuses (sum of dominant gene rarities)
  let partBonus = 0;
  for (const slot of BODY_PART_SLOTS) {
    const v = getGeneVariant(slot, crab.genes[slot].D);
    if (v) partBonus += rarityBonus(v.rarity);
  }

  return Math.round(statBP + levelBonus + purity + partBonus);
}

// Faction bonus for a team of crabs
export function factionBonus(crabs: Crab[]): { bonus: number; label: string } {
  if (crabs.length === 0) return { bonus: 0, label: "Empty" };
  const counts: Record<string, number> = {};
  for (const c of crabs) counts[c.faction] = (counts[c.faction] ?? 0) + 1;
  const max = Math.max(...Object.values(counts));
  if (max >= 3) {
    return { bonus: 0.1, label: "Triple Faction (+10%)" };
  }
  if (max >= 2) {
    return { bonus: 0.05, label: "Pair Faction (+5%)" };
  }
  return { bonus: 0.02, label: "Wanderer (+2%)" };
}

// Class synergy bonus - reward diverse roles
export function classSynergy(crabs: Crab[]): { bonus: number; label: string } {
  const classSet = new Set(crabs.map((c) => c.classId));
  if (classSet.size >= 3) return { bonus: 0.05, label: "Diverse (+5%)" };
  if (classSet.size === 2) return { bonus: 0.03, label: "Paired (+3%)" };
  // all same class - small bonus for specialization
  return { bonus: 0.04, label: "Specialist (+4%)" };
}

// Positioning bonus: Bulwark in front, Tidecaller/Shellmender in back
export function positioningBonus(crabs: Crab[], formation?: { front: string[]; mid: string[]; back: string[] }): number {
  if (!formation) return 0;
  let bonus = 0;
  const byId = new Map(crabs.map((c) => [c.id, c]));
  for (const id of formation.front) {
    const c = byId.get(id);
    if (c?.classId === "bulwark") bonus += 0.04;
  }
  for (const id of formation.back) {
    const c = byId.get(id);
    if (c?.classId === "tidecaller" || c?.classId === "shellmender") bonus += 0.03;
  }
  return Math.min(bonus, 0.1);
}

// Compute team total BP with breakdown
export function teamBP(
  crabs: Crab[],
  opponentCrabs: Crab[] = [],
  seed = 1,
  tacticMod = 0,
  formation?: { front: string[]; mid: string[]; back: string[] }
): { total: number; breakdown: Omit<BattleBreakdown, "total" | "variance"> & { variance: number; total: number } } {
  const base = crabs.reduce((sum, c) => sum + crabBaseBP(c), 0);
  const fb = factionBonus(crabs);
  const cs = classSynergy(crabs);
  const pos = positioningBonus(crabs, formation);

  // dominant faction for wheel matchup
  const fCounts: Record<string, number> = {};
  for (const c of crabs) fCounts[c.faction] = (fCounts[c.faction] ?? 0) + 1;
  const domFaction = Object.entries(fCounts).sort((a, b) => b[1] - a[1])[0]?.[0] as FactionId | undefined;

  const oppFCounts: Record<string, number> = {};
  for (const c of opponentCrabs) oppFCounts[c.faction] = (oppFCounts[c.faction] ?? 0) + 1;
  const oppDomFaction = Object.entries(oppFCounts).sort((a, b) => b[1] - a[1])[0]?.[0] as FactionId | undefined;

  let wheelMod = 0;
  if (domFaction && oppDomFaction) {
    wheelMod = factionMatchupBonus(domFaction, oppDomFaction);
  }

  // passive bonuses summed (simplified: each class passive gives ~2% bonus)
  const passiveBonus = crabs.length * 0.02;

  // variance +/- 5%
  const rng = mulberry32(seed);
  const variance = (rng() - 0.5) * 2 * 0.05;

  const factionBp = base * fb.bonus;
  const synergyBp = base * (cs.bonus + pos);
  const passiveBp = base * passiveBonus;
  const wheelBp = base * wheelMod;
  const tacticBp = base * tacticMod;
  const varianceBp = base * variance;

  const total = Math.max(
    1,
    Math.round(base + factionBp + synergyBp + passiveBp + wheelBp + tacticBp + varianceBp)
  );

  return {
    total,
    breakdown: {
      baseBP: base,
      factionBonus: Math.round(factionBp),
      classSynergy: Math.round(synergyBp),
      passiveBonus: Math.round(passiveBp),
      wheelModifier: Math.round(wheelBp),
      tacticModifier: Math.round(tacticBp),
      variance: Math.round(varianceBp),
      total,
    },
  };
}

// Format BP for display
export function formatBP(bp: number): string {
  if (bp >= 10000) return `${(bp / 1000).toFixed(1)}k`;
  return bp.toString();
}
