// Crabtopia - Dive reward peek (pure).
//
// claimDive (store) resolves a completed dive's gold at claim time:
// the site's remaining reward, a +10% bonus per Gildclaw on the dive
// team, then the tokenomics credit (Tide Tithe / emission gate) via
// applyGoldCredit. The "Watch the Dig" scene needs to SHOW that exact
// outcome before the player commits to claiming — so the math lives
// here, pure, and the scene's Claim button still runs the real
// claimDive path. peekDiveReward never mutates anything: calling it
// any number of times leaves gold, sites and crabs untouched, and its
// `net` is exactly the gold delta a subsequent claimDive produces on
// the same state (pinned by unit tests).

import type { DigSite, PlayerProfile } from "../types";
import { applyGoldCredit } from "./economy";

export interface DiveRewardPeek {
  /** The site's remaining reward, rounded as claimDive rounds it. */
  reward: number;
  /** +10%-of-reward per Gildclaw on the dive team. */
  bonus: number;
  /** reward + bonus — the gross amount handed to the credit path. */
  gross: number;
  /** Tide Tithe withheld by the credit path at the current balance. */
  tax: number;
  /** What the player's gold actually increases by on claim. */
  net: number;
  /** Flat XP claimDive grants alongside the gold. */
  xp: number;
}

export function peekDiveReward(
  player: PlayerProfile,
  site: DigSite
): DiveRewardPeek {
  const reward = Math.round(site.rewardRemaining);
  const team = player.teams.find((t) => t.id === site.teamId);
  let bonus = 0;
  if (team) {
    for (const cid of team.crabIds) {
      const c = player.crabs.find((x) => x.id === cid);
      if (c?.classId === "gildclaw") bonus += Math.round(reward * 0.1);
    }
  }
  const gross = reward + bonus;
  const credited = applyGoldCredit(player, gross);
  return { reward, bonus, gross, tax: credited.tax, net: credited.net, xp: 50 };
}
