// Unit tests for the game store (src/game/store/gameStore.ts) — economy
// and bookkeeping invariants proven by the 2026-11-07 logic audit:
//  - dive/team bookkeeping can never strand a crab in "diving" forever
//  - the Bazaar cannot duplicate a crab via a self-purchase
//  - hall fees/prices are validated (no negative-fee gold creation)
//  - raids validate their inputs (own site, busy/duplicate crabs,
//    reinforcement cap) and insurance never punishes its buyer
//  - quest rewards are claimable exactly once per surface, and
//    shellwardenLevel always matches the XP curve
import { describe, it, expect, beforeEach } from "vitest";
import { useGame, NPC_CRAB_CACHE } from "../../src/game/store/gameStore";
import { deriveFormationForCrabs } from "../../src/game/engine/formation";
import { generateCrab } from "../../src/game/engine/crabs";
import type { Crab } from "../../src/game/types";

function freshPlayer() {
  useGame.getState().resetGame();
  useGame.getState().initPlayer("Tester");
  return useGame.getState();
}

function player() {
  return useGame.getState().player!;
}

function setPlayer(patch: Partial<ReturnType<typeof player>>) {
  const p = player();
  useGame.setState({ player: { ...p, ...patch } });
}

function starterTeam() {
  return player().teams[0];
}

function starterIds() {
  return starterTeam().crabIds.filter(Boolean) as string[];
}

beforeEach(() => {
  localStorage.clear();
  freshPlayer();
});

describe("dive / team bookkeeping", () => {
  it("deployDive rejects a site that is already occupied", () => {
    const s = useGame.getState();
    const occupied = s.worldSites.find((x) => x.occupiedBy);
    expect(occupied).toBeTruthy();
    const ok = s.deployDive(starterTeam().id, occupied!.id);
    expect(ok).toBe(false);
    expect(player().dailyDiveCount).toBe(0);
    expect(player().crabs.every((c) => c.activity === "idle")).toBe(true);
  });

  it("deployDive rejects an unknown site id instead of stranding the team", () => {
    const s = useGame.getState();
    const ok = s.deployDive(starterTeam().id, "site_does_not_exist");
    expect(ok).toBe(false);
    expect(player().crabs.every((c) => c.activity === "idle")).toBe(true);
    expect(player().dailyDiveCount).toBe(0);
  });

  it("a team with a deployed dive cannot be deleted mid-dive", () => {
    const s = useGame.getState();
    const free = s.worldSites.find((x) => !x.occupiedBy)!;
    expect(s.deployDive(starterTeam().id, free.id)).toBe(true);
    s.deleteTeam(starterTeam().id);
    // Team must survive while its dive is unresolved…
    expect(player().teams.some((t) => t.id === starterTeam().id)).toBe(true);
    // …so completing + claiming the dive frees the crabs again.
    useGame.setState({
      worldSites: useGame
        .getState()
        .worldSites.map((x) =>
          x.id === free.id ? { ...x, state: "completed" as const } : x
        ),
    });
    useGame.getState().claimDive(free.id);
    expect(player().crabs.every((c) => c.activity === "idle")).toBe(true);
  });

  it("a diving crab cannot be removed from its team mid-dive", () => {
    const s = useGame.getState();
    const free = s.worldSites.find((x) => !x.occupiedBy)!;
    expect(s.deployDive(starterTeam().id, free.id)).toBe(true);
    const divingId = starterIds()[0];
    s.removeCrabFromTeam(starterTeam().id, 0);
    expect(
      player().teams.find((t) => t.id === starterTeam().id)!.crabIds
    ).toContain(divingId);
  });
});

describe("bazaar / hall integrity", () => {
  it("buying your own Bazaar listing is rejected (no crab duplication)", () => {
    const s = useGame.getState();
    const crabId = starterIds()[0];
    s.graduateCrab(crabId); // rookies cannot be listed
    s.listCrabInBazaar(crabId, 1000);
    const listing = useGame
      .getState()
      .bazaarListings.find((l) => l.itemId === crabId && l.sellerId === "player");
    expect(listing).toBeTruthy();
    const goldBefore = player().gold;
    const ok = s.buyBazaarListing(listing!.id);
    expect(ok).toBe(false);
    expect(player().crabs.filter((c) => c.id === crabId)).toHaveLength(1);
    expect(player().gold).toBe(goldBefore);
  });

  it("listCrabInBazaar rejects a non-positive price", () => {
    const s = useGame.getState();
    const crabId = starterIds()[0];
    s.graduateCrab(crabId);
    const before = useGame.getState().bazaarListings.length;
    s.listCrabInBazaar(crabId, -1000);
    s.listCrabInBazaar(crabId, 0);
    expect(useGame.getState().bazaarListings.length).toBe(before);
    expect(player().crabs.find((c) => c.id === crabId)!.activity).toBe("idle");
  });

  it("listCrabInHall rejects a negative fee (no gold from nothing)", () => {
    const s = useGame.getState();
    const crabId = starterIds()[0];
    const before = useGame.getState().hallListings.length;
    s.listCrabInHall(crabId, -500);
    expect(useGame.getState().hallListings.length).toBe(before);
    expect(player().crabs.find((c) => c.id === crabId)!.activity).toBe("idle");
  });

  it("hiring back your own hall crab does not progress the Mercenary Captain quest", () => {
    const s = useGame.getState();
    const crabId = starterIds()[0];
    s.listCrabInHall(crabId, 100);
    const listing = useGame
      .getState()
      .hallListings.find((l) => l.crabId === crabId && l.ownerId === "player");
    expect(listing).toBeTruthy();
    const hired = s.hireCrab(listing!.id);
    expect(hired).toBeTruthy();
    const qp = player().questProgress.find((q) => q.questId === "hire_crab");
    expect(qp!.progress).toBe(0);
  });
});

describe("quest claims and the two Home surfaces", () => {
  it("tutorial dive reward and First Dive quest are separate one-time rewards", () => {
    const s = useGame.getState();
    s.completeTutorial(); // first_dive progress -> 1 (target)
    const g0 = player().gold;
    s.claimDive("site_tutorial"); // dive loot: +500, exactly once
    expect(player().gold).toBe(g0 + 500);
    s.claimDive("site_tutorial");
    expect(player().gold).toBe(g0 + 500);
    s.claimQuest("first_dive"); // quest bounty: +500, exactly once
    expect(player().gold).toBe(g0 + 1000);
    s.claimQuest("first_dive");
    expect(player().gold).toBe(g0 + 1000);
  });

  it("claimQuest never pays twice and never pays early", () => {
    const s = useGame.getState();
    const g0 = player().gold;
    s.claimQuest("first_dive"); // progress 0 < target 1
    expect(player().gold).toBe(g0);
    s.progressQuest("first_dive");
    s.claimQuest("first_dive");
    expect(player().gold).toBe(g0 + 500);
    s.claimQuest("first_dive");
    expect(player().gold).toBe(g0 + 500);
  });
});

describe("shellwarden XP / level consistency", () => {
  it("dive claim XP also advances the level curve", () => {
    const s = useGame.getState();
    setPlayer({ shellwardenXp: 480, shellwardenLevel: 1 });
    s.claimDive("site_tutorial"); // +50 XP -> 530 total
    expect(player().shellwardenXp).toBe(530);
    expect(player().shellwardenLevel).toBe(2);
  });

  it("breeding XP also advances the level curve", () => {
    const s = useGame.getState();
    const crabs = player().crabs.map((c) => ({
      ...c,
      isRookie: false,
      activity: "idle" as const,
      breedCount: 0,
      parentIds: [] as string[],
    }));
    setPlayer({ crabs, gold: 100000, shellwardenXp: 450, shellwardenLevel: 1 });
    const egg = s.breed(crabs[0].id, crabs[1].id);
    expect(egg).toBeTruthy();
    expect(player().shellwardenXp).toBe(550);
    expect(player().shellwardenLevel).toBe(2);
  });

  it("hatching XP also advances the level curve", () => {
    const s = useGame.getState();
    const egg = {
      id: "egg_test_xp",
      parentId: [] as string[],
      faction: "coral_court" as const,
      classId: "bulwark" as const,
      genePreview: player().crabs[0].genes,
      hatchTime: Date.now() - 1000,
      createdTime: Date.now() - 2000,
      ownerId: "player",
      name: "Test Egg",
      isLegendaryCandidate: false,
    };
    setPlayer({
      eggs: [egg as never],
      shellwardenXp: 400,
      shellwardenLevel: 1,
    });
    s.hatchEggNow("egg_test_xp"); // +150 XP -> 550 total
    expect(player().shellwardenXp).toBe(550);
    expect(player().shellwardenLevel).toBe(2);
  });
});

describe("raid validation", () => {
  it("raiding your own deployed site is rejected (no free participation gold)", () => {
    const s = useGame.getState();
    const free = s.worldSites.find((x) => !x.occupiedBy)!;
    expect(s.deployDive(starterTeam().id, free.id)).toBe(true);
    const goldBefore = player().gold;
    const energyBefore = player().raidEnergy;
    const raid = s.launchRaid(
      free.id,
      starterTeam().id,
      starterIds(),
      "ambush",
      deriveFormationForCrabs(player().crabs),
      []
    );
    expect(raid).toBeNull();
    expect(player().gold).toBe(goldBefore);
    expect(player().raidEnergy).toBe(energyBefore);
  });

  it("reinforcements are capped at CONFIG.maxReinforcements and de-duplicated", () => {
    const s = useGame.getState();
    const npcSite = s.worldSites.find((x) => x.occupiedBy && !x.ownerIsPlayer)!;
    const npcIds = Object.keys(NPC_CRAB_CACHE).slice(0, 4);
    expect(npcIds.length).toBe(4);
    const raid = s.launchRaid(
      npcSite.id,
      starterTeam().id,
      starterIds(),
      "ambush",
      deriveFormationForCrabs(player().crabs),
      [...npcIds, npcIds[0], starterIds()[0]]
    );
    expect(raid).toBeTruthy();
    expect(raid!.raiderReinforcementIds.length).toBeLessThanOrEqual(2);
    expect(new Set(raid!.raiderReinforcementIds).size).toBe(
      raid!.raiderReinforcementIds.length
    );
    expect(raid!.raiderReinforcementIds).not.toContain(starterIds()[0]);
  });

  it("busy (diving) crabs cannot be sent as raiders", () => {
    const s = useGame.getState();
    const free = s.worldSites.find((x) => !x.occupiedBy)!;
    expect(s.deployDive(starterTeam().id, free.id)).toBe(true);
    const npcSite = s.worldSites.find(
      (x) => x.occupiedBy && !x.ownerIsPlayer && x.id !== free.id
    )!;
    const raid = s.launchRaid(
      npcSite.id,
      starterTeam().id,
      starterIds(), // all currently diving
      "ambush",
      deriveFormationForCrabs(player().crabs),
      []
    );
    expect(raid).toBeNull();
  });

  it("the raider's own insurance never reduces what they steal", () => {
    const s = useGame.getState();
    // Overwhelming raider team so the BP winner is not in doubt.
    const strong: Crab[] = [0, 1, 2, 3, 4].map((i) =>
      generateCrab({ ownerId: "player", level: 50, seed: 4242 + i })
    );
    const team = {
      id: "team_strong",
      name: "Strong",
      crabIds: strong.map((c) => c.id),
      createdAt: Date.now(),
    };
    const npcSite = s.worldSites
      .filter((x) => x.occupiedBy && !x.ownerIsPlayer)
      .sort((a, b) => a.bpBracket - b.bpBracket)[0];
    setPlayer({
      crabs: [...player().crabs, ...strong],
      teams: [...player().teams, team],
      insuranceActive: true,
      gold: 100000,
    });
    useGame.setState({
      worldSites: useGame
        .getState()
        .worldSites.map((x) =>
          x.id === npcSite.id ? { ...x, rewardRemaining: 10000 } : x
        ),
    });
    const raid = s.launchRaid(
      npcSite.id,
      team.id,
      strong.map((c) => c.id),
      "ambush",
      deriveFormationForCrabs(strong),
      []
    );
    expect(raid).toBeTruthy();
    expect(raid!.result!.winner).toBe("raider");
    // CONFIG.raidStealPercent = 0.65 — the defender-side insurance cap
    // must not be keyed off the ATTACKER's insurance flag.
    expect(raid!.result!.stolenAmount).toBe(Math.round(10000 * 0.65));
  });
});
