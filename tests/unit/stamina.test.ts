// Unit tests for the stamina / wounds / recovery / item-market round
// (engine/stamina.ts, engine/itemMarket.ts, store wiring):
//  - stamina spend per activity + atomic insufficient-stamina blocks
//    with the availability reasons surfaced
//  - regen math (×3 Second Wind boost, pause while wounded/diving)
//  - daily-reset refill (same anchor as the dive cap; wounds survive)
//  - wounds from raid defeats (never from arena — winded instead),
//    salve cure, wound expiry, boosted wound countdowns
//  - recovery purchases: gold → Tide Treasury transfer, indexed
//    prices, insufficient-funds no-op; use rules with refusals that
//    never consume the item
//  - item market: escrow on list, cancel returns, forced NPC sale
//    paying proceeds minus the 3.85% fee with the correct split,
//    self-buy blocked, 300% price cap enforced
import { describe, it, expect, beforeEach } from "vitest";
import { useGame } from "../../src/game/store/gameStore";
import { generateCrab } from "../../src/game/engine/crabs";
import { deriveFormationForCrabs } from "../../src/game/engine/formation";
import { teamAvailability } from "../../src/game/engine/teamEligibility";
import {
  applyRecoveryPurchase,
  applyRecoveryUse,
  applyStaminaRegen,
  isWounded,
  refillAllStamina,
  spendStamina,
  staminaOf,
  windCrabs as windCrabsPure,
  woundCrabs as woundCrabsPure,
  woundRemainingMs,
} from "../../src/game/engine/stamina";
import {
  itemSaleChancePerHour,
  itemSaleProbability,
  materialReferenceValue,
  maxItemUnitPrice,
} from "../../src/game/engine/itemMarket";
import { economyOf, supplyInvariantHolds } from "../../src/game/engine/economy";
import {
  INITIAL_SUPPLY_GOLD,
  MAX_STAMINA,
  STAMINA_COSTS,
  WOUND_DURATION_MS,
} from "../../src/game/engine/config";
import type { Crab, PlayerProfile, Team } from "../../src/game/types";

const HOUR = 60 * 60 * 1000;
const MIN = 60 * 1000;
const T0 = 1_700_000_000_000;

function freshPlayer() {
  useGame.getState().resetGame();
  useGame.getState().initPlayer("Tester");
  return useGame.getState();
}

function player() {
  return useGame.getState().player!;
}

function setPlayer(patch: Partial<PlayerProfile>) {
  const p = player();
  useGame.setState({ player: { ...p, ...patch } });
}

function starterTeam() {
  return player().teams[0];
}

function starterIds() {
  return starterTeam().crabIds.filter(Boolean) as string[];
}

function barePlayer(patch: Partial<PlayerProfile> = {}): PlayerProfile {
  return {
    id: "player",
    name: "T",
    gold: 2000,
    crabs: [],
    teams: [],
    eggs: [],
    digSites: [],
    hallListings: [],
    raids: [],
    tidelordRank: 1,
    shellwardenLevel: 1,
    shellwardenXp: 0,
    lastLogin: T0,
    loginStreak: 1,
    dailyDiveCount: 0,
    dailyDiveResetAt: T0 + 24 * HOUR,
    raidEnergy: 10,
    raidEnergyResetAt: T0 + 24 * HOUR,
    tutorialComplete: false,
    questProgress: [],
    discoveredBreeds: [],
    discoveredLegendaries: [],
    insuranceActive: false,
    guardPostLevel: 0,
    ownedPlots: [],
    createdAt: T0,
    materials: {},
    items: {},
    ...patch,
  } as PlayerProfile;
}

function bareCrab(patch: Partial<Crab> = {}): Crab {
  const c = generateCrab({ ownerId: "player", level: 5, seed: 777 });
  return { ...c, ...patch };
}

beforeEach(() => {
  localStorage.clear();
  freshPlayer();
});

// ---------------------------------------------------------------------------
describe("stamina projection & regen math", () => {
  it("legacy crabs (no stamina fields) read as fully rested", () => {
    const c = bareCrab();
    expect(c.stamina).toBeUndefined();
    expect(staminaOf(c, T0)).toBe(MAX_STAMINA);
    expect(isWounded(c, T0)).toBe(false);
  });

  it("regens 20 per hour while resting", () => {
    const c = bareCrab({ stamina: 40, staminaUpdatedAt: T0 });
    expect(staminaOf(c, T0 + HOUR)).toBe(60);
    expect(staminaOf(c, T0 + 30 * MIN)).toBe(50);
    expect(staminaOf(c, T0 + 10 * HOUR)).toBe(MAX_STAMINA); // clamped
  });

  it("Second Wind triples the regen rate", () => {
    const c = bareCrab({ stamina: 10, staminaUpdatedAt: T0 });
    expect(staminaOf(c, T0 + HOUR, T0 + 2 * HOUR)).toBe(70);
    // Boost covering only half the window: 30m ×1 + 30m ×3 = 2h worth.
    expect(staminaOf(c, T0 + HOUR, T0 + 30 * MIN)).toBe(50);
  });

  it("no regen while wounded, and wounded time never counts as rest", () => {
    const wounded = bareCrab({
      stamina: 40,
      staminaUpdatedAt: T0,
      woundedUntil: T0 + 45 * MIN,
    });
    expect(staminaOf(wounded, T0 + 30 * MIN)).toBe(40);
    // 2h after the anchor the wound has been healed for 75 minutes:
    // only those 75 minutes accrue (40 + 25).
    expect(staminaOf(wounded, T0 + 2 * HOUR)).toBe(65);
  });

  it("no regen while diving (working, not resting)", () => {
    const diving = bareCrab({
      stamina: 40,
      staminaUpdatedAt: T0,
      activity: "diving",
    });
    expect(staminaOf(diving, T0 + 3 * HOUR)).toBe(40);
  });

  it("applyStaminaRegen persists the projection and clears expired wounds", () => {
    const c = bareCrab({
      stamina: 40,
      staminaUpdatedAt: T0,
      woundedUntil: T0 + 45 * MIN,
    });
    const p = barePlayer({ crabs: [c] });
    const next = applyStaminaRegen(p, T0 + 2 * HOUR);
    const after = next.crabs[0];
    expect(after.woundedUntil).toBeUndefined();
    expect(after.stamina).toBe(65);
    expect(after.staminaUpdatedAt).toBe(T0 + 2 * HOUR);
  });

  it("Second Wind runs wound countdowns at ×3 (45 min heals in 15)", () => {
    const c = bareCrab({
      stamina: 50,
      staminaUpdatedAt: T0,
      woundedUntil: T0 + WOUND_DURATION_MS,
    });
    const p = barePlayer({
      crabs: [c],
      recoveryBoostUntil: T0 + 2 * HOUR,
    });
    const at5 = applyStaminaRegen(p, T0 + 5 * MIN);
    expect(woundRemainingMs(at5.crabs[0], T0 + 5 * MIN)).toBe(30 * MIN);
    const at15 = applyStaminaRegen(p, T0 + 15 * MIN);
    expect(isWounded(at15.crabs[0], T0 + 15 * MIN)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
describe("stamina spend (atomic) + availability reasons", () => {
  it("charges every crab on success and nobody on failure", () => {
    const a = bareCrab({ id: "a", stamina: 100, staminaUpdatedAt: T0 });
    const b = bareCrab({ id: "b", stamina: 10, staminaUpdatedAt: T0 });
    const p = barePlayer({ crabs: [a, b] });

    const ok = spendStamina(p, ["a"], STAMINA_COSTS.dive, T0);
    expect(ok.ok).toBe(true);
    expect(ok.player.crabs[0].stamina).toBe(100 - STAMINA_COSTS.dive);

    const fail = spendStamina(p, ["a", "b"], STAMINA_COSTS.dive, T0);
    expect(fail.ok).toBe(false);
    expect(fail.lacking).toEqual([b.name]);
    expect(fail.player).toBe(p); // untouched
  });

  it("teamAvailability surfaces the exhausted and wounded reasons", () => {
    const crabs = [0, 1, 2, 3, 4].map((i) =>
      bareCrab({ id: `c${i}`, stamina: 100, staminaUpdatedAt: T0 })
    );
    const team: Team = {
      id: "t",
      name: "T",
      crabIds: crabs.map((c) => c.id),
      createdAt: T0,
    };
    const byId = new Map(crabs.map((c) => [c.id, c] as const));

    const tired = crabs.map((c, i) =>
      i === 2 ? { ...c, stamina: 5 } : c
    );
    const tiredById = new Map(tired.map((c) => [c.id, c] as const));
    const gated = teamAvailability(team, tiredById, {
      staminaCost: STAMINA_COSTS.dive,
      now: T0,
    });
    expect(gated.available).toBe(false);
    expect(gated.reasons.join(" ")).toContain(
      "exhausted — needs rest or a tonic"
    );
    // Without a stamina cost the same team is not stamina-gated.
    expect(teamAvailability(team, tiredById, { now: T0 }).available).toBe(true);

    const wounded = crabs.map((c, i) =>
      i === 1 ? { ...c, woundedUntil: T0 + 30 * MIN } : c
    );
    const woundedById = new Map(wounded.map((c) => [c.id, c] as const));
    const wg = teamAvailability(team, woundedById, { now: T0 });
    expect(wg.available).toBe(false);
    expect(wg.reasons.join(" ")).toContain("wounded — healing");
    void byId;
  });

  it("deployDive charges 15 per crab; one exhausted crab blocks atomically", () => {
    const s = useGame.getState();
    const free = s.worldSites.find((x) => !x.occupiedBy)!;
    expect(s.deployDive(starterTeam().id, free.id)).toBe(true);
    for (const c of player().crabs) {
      expect(c.stamina).toBe(100 - STAMINA_COSTS.dive);
    }
  });

  it("deployDive refuses when any member is exhausted or wounded", () => {
    const s = useGame.getState();
    const target = starterIds()[0];
    setPlayer({
      crabs: player().crabs.map((c) =>
        c.id === target
          ? { ...c, stamina: 10, staminaUpdatedAt: Date.now() }
          : c
      ),
    });
    const free = s.worldSites.find((x) => !x.occupiedBy)!;
    expect(s.deployDive(starterTeam().id, free.id)).toBe(false);
    expect(player().dailyDiveCount).toBe(0);
    // Nobody was charged: the other crabs are still untouched/full.
    for (const c of player().crabs) {
      if (c.id !== target) expect(c.stamina ?? 100).toBe(100);
    }

    setPlayer({
      crabs: player().crabs.map((c) =>
        c.id === target
          ? { ...c, stamina: 100, woundedUntil: Date.now() + 30 * MIN }
          : c
      ),
    });
    expect(s.deployDive(starterTeam().id, free.id)).toBe(false);
    expect(player().dailyDiveCount).toBe(0);
  });

  it("breeding charges 10 per parent and refuses an exhausted parent", () => {
    const s = useGame.getState();
    const crabs = player().crabs.map((c) => ({
      ...c,
      isRookie: false,
      activity: "idle" as const,
      breedCount: 0,
      parentIds: [] as string[],
    }));
    setPlayer({ crabs, gold: 100000 });
    const egg = s.breed(crabs[0].id, crabs[1].id);
    expect(egg).toBeTruthy();
    const parents = player().crabs.filter(
      (c) => c.id === crabs[0].id || c.id === crabs[1].id
    );
    for (const p of parents) {
      expect(p.stamina).toBe(100 - STAMINA_COSTS.breeding);
    }

    // Exhausted parent: breed refuses, gold untouched.
    const goldBefore = player().gold;
    setPlayer({
      crabs: player().crabs.map((c) =>
        c.id === crabs[2].id
          ? { ...c, stamina: 5, staminaUpdatedAt: Date.now(), activity: "idle" as const }
          : c
      ),
    });
    expect(s.breed(crabs[2].id, crabs[3].id)).toBeNull();
    expect(player().gold).toBe(goldBefore);
  });
});

// ---------------------------------------------------------------------------
describe("daily reset + tickTimers regen", () => {
  it("tickTimers settles passive regen onto the roster", () => {
    const now = Date.now();
    const target = starterIds()[0];
    setPlayer({
      crabs: player().crabs.map((c) =>
        c.id === target
          ? { ...c, stamina: 50, staminaUpdatedAt: now - HOUR }
          : c
      ),
      lastItemMarketTickAt: now,
    });
    useGame.getState().tickTimers();
    const after = player().crabs.find((c) => c.id === target)!;
    expect(after.stamina).toBe(70);
  });

  it("the daily reset refills stamina to full but never clears wounds", () => {
    const now = Date.now();
    const target = starterIds()[0];
    setPlayer({
      dailyDiveCount: 4,
      dailyDiveResetAt: now - 1000, // anchor elapsed
      crabs: player().crabs.map((c) =>
        c.id === target
          ? {
              ...c,
              stamina: 5,
              staminaUpdatedAt: now,
              woundedUntil: now + 30 * MIN,
            }
          : c
      ),
      lastItemMarketTickAt: now,
    });
    useGame.getState().tickTimers();
    const after = player().crabs.find((c) => c.id === target)!;
    expect(after.stamina).toBe(MAX_STAMINA);
    expect(isWounded(after, now)).toBe(true); // wound survives the reset
    expect(player().dailyDiveCount).toBe(0);
  });

  it("refillAllStamina keeps wounds intact (pure)", () => {
    const c = bareCrab({
      stamina: 0,
      staminaUpdatedAt: T0,
      woundedUntil: T0 + 10 * MIN,
    });
    const next = refillAllStamina(barePlayer({ crabs: [c] }), T0);
    expect(next.crabs[0].stamina).toBe(MAX_STAMINA);
    expect(next.crabs[0].woundedUntil).toBe(T0 + 10 * MIN);
  });
});

// ---------------------------------------------------------------------------
describe("wounds & winded", () => {
  it("a raid whose sim drops player crabs to 0 HP wounds them (45 min)", () => {
    const s = useGame.getState();
    // Glass raiders: 21-HP pools against a top-bracket defense — the
    // sim is guaranteed to drop them (every defender hit deals ≥ 39).
    const weak: Crab[] = starterIds().map((id, i) => {
      const c = player().crabs.find((x) => x.id === id)!;
      return {
        ...c,
        level: 1,
        stats: { hp: 1, attack: 1, defense: 0, speed: 1, skill: 1 },
        activity: "idle" as const,
      };
      void i;
    });
    setPlayer({ crabs: weak });
    const npcSite = s.worldSites
      .filter((x) => x.occupiedBy && !x.ownerIsPlayer)
      .sort((a, b) => b.bpBracket - a.bpBracket)[0];
    const raid = s.launchRaid(
      npcSite.id,
      starterTeam().id,
      starterIds(),
      "ambush",
      deriveFormationForCrabs(weak),
      []
    );
    expect(raid).toBeTruthy();
    const now = Date.now();
    const wounded = player().crabs.filter((c) => isWounded(c, now));
    expect(wounded.length).toBeGreaterThanOrEqual(1);
    for (const w of wounded) {
      expect(woundRemainingMs(w, now)).toBeGreaterThan(40 * MIN);
      expect(woundRemainingMs(w, now)).toBeLessThanOrEqual(WOUND_DURATION_MS);
    }
    // Raiders paid the raid stamina cost at launch.
    for (const c of player().crabs) {
      expect(c.stamina).toBe(100 - STAMINA_COSTS.raid);
    }
  });

  it("launchRaid refuses wounded or exhausted raiders (energy untouched)", () => {
    const s = useGame.getState();
    const npcSite = s.worldSites.find((x) => x.occupiedBy && !x.ownerIsPlayer)!;
    const target = starterIds()[0];
    setPlayer({
      crabs: player().crabs.map((c) =>
        c.id === target
          ? { ...c, stamina: 10, staminaUpdatedAt: Date.now() }
          : c
      ),
    });
    const raid = s.launchRaid(
      npcSite.id,
      starterTeam().id,
      starterIds(),
      "ambush",
      deriveFormationForCrabs(player().crabs),
      []
    );
    expect(raid).toBeNull();
    expect(player().raidEnergy).toBe(10);
  });

  it("windCrabs drains 10 stamina and never wounds (arena aftermath)", () => {
    const c = bareCrab({ stamina: 50, staminaUpdatedAt: T0 });
    const next = windCrabsPure(barePlayer({ crabs: [c] }), [c.id], T0);
    expect(next.crabs[0].stamina).toBe(40);
    expect(next.crabs[0].woundedUntil).toBeUndefined();
    const floored = windCrabsPure(
      barePlayer({ crabs: [{ ...c, stamina: 5 }] }),
      [c.id],
      T0
    );
    expect(floored.crabs[0].stamina).toBe(0); // clamped, never negative
  });

  it("woundCrabs sets a 45-minute wound (pure)", () => {
    const c = bareCrab({ stamina: 80, staminaUpdatedAt: T0 });
    const next = woundCrabsPure(barePlayer({ crabs: [c] }), [c.id], T0);
    expect(next.crabs[0].woundedUntil).toBe(T0 + WOUND_DURATION_MS);
  });

  it("store woundCrabs/chargeStamina: a wounded crab cannot be charged", () => {
    const s = useGame.getState();
    const target = starterIds()[0];
    s.woundCrabs([target]);
    expect(isWounded(player().crabs.find((c) => c.id === target)!, Date.now())).toBe(true);
    expect(s.chargeStamina([target], STAMINA_COSTS.arena)).toBe(false);
    expect(s.chargeStamina(starterIds().slice(1), STAMINA_COSTS.arena)).toBe(true);
    const charged = player().crabs.find((c) => c.id === starterIds()[1])!;
    expect(charged.stamina).toBe(100 - STAMINA_COSTS.arena);
  });
});

// ---------------------------------------------------------------------------
describe("recovery supplies — purchase (dev revenue) & use rules", () => {
  it("purchase moves gold 100% into the Tide Treasury; supply untouched", () => {
    const s = useGame.getState();
    const before = economyOf(player());
    expect(s.buyRecoveryItem("tide_tonic")).toBe(true);
    expect(player().gold).toBe(2000 - 300);
    expect(player().items?.tide_tonic).toBe(1);
    const after = economyOf(player());
    expect(after.treasury).toBe(before.treasury + 300);
    expect(after.treasuryIn).toBe(before.treasuryIn + 300);
    // A pure transfer: no minting, no burning, identity intact.
    expect(after.totalMinted).toBe(before.totalMinted);
    expect(after.totalBurned).toBe(before.totalBurned);
    expect(after.circulating).toBe(INITIAL_SUPPLY_GOLD);
    expect(supplyInvariantHolds(after)).toBe(true);
  });

  it("purchase prices pass through the price index (1.5 → tonic 450)", () => {
    const p = barePlayer({ gold: 5000 });
    const eco = economyOf(p);
    const rich: PlayerProfile = {
      ...p,
      economy: { ...eco, priceIndex: 1.5 },
    };
    const r = applyRecoveryPurchase(rich, "tide_tonic");
    expect(r.ok).toBe(true);
    expect(r.price).toBe(450);
    expect(r.player.gold).toBe(5000 - 450);
    expect(economyOf(r.player).treasury).toBe(450);
    // Index 1 yields exactly the listed price.
    expect(applyRecoveryPurchase(barePlayer({ gold: 5000 }), "coral_salve").price).toBe(400);
  });

  it("insufficient gold: purchase refused, nothing changes", () => {
    const s = useGame.getState();
    setPlayer({ gold: 100 });
    expect(s.buyRecoveryItem("tide_elixir")).toBe(false);
    expect(player().gold).toBe(100);
    expect(player().items?.tide_elixir ?? 0).toBe(0);
    expect(economyOf(player()).treasury).toBe(0);
  });

  it("tonic restores 50 clamped; refuses at full stamina without consuming", () => {
    const c = bareCrab({ id: "x", stamina: 30, staminaUpdatedAt: T0 });
    const p = barePlayer({ crabs: [c], items: { tide_tonic: 2 } });
    const used = applyRecoveryUse(p, "tide_tonic", "x", T0);
    expect(used.ok).toBe(true);
    expect(used.player.crabs[0].stamina).toBe(80);
    expect(used.player.items?.tide_tonic).toBe(1);

    const clamped = applyRecoveryUse(
      barePlayer({ crabs: [{ ...c, stamina: 70 }], items: { tide_tonic: 1 } }),
      "tide_tonic",
      "x",
      T0
    );
    expect(clamped.player.crabs[0].stamina).toBe(MAX_STAMINA);

    const full = applyRecoveryUse(
      barePlayer({ crabs: [{ ...c, stamina: 100 }], items: { tide_tonic: 1 } }),
      "tide_tonic",
      "x",
      T0
    );
    expect(full.ok).toBe(false);
    expect(full.player.items?.tide_tonic).toBe(1); // not consumed
  });

  it("elixir refuses when it would restore less than a tonic", () => {
    const c = bareCrab({ id: "x", stamina: 80, staminaUpdatedAt: T0 });
    const p = barePlayer({ crabs: [c], items: { tide_elixir: 1 } });
    const refused = applyRecoveryUse(p, "tide_elixir", "x", T0);
    expect(refused.ok).toBe(false);
    expect(refused.player.items?.tide_elixir).toBe(1);
    // Missing exactly 50 is fine — restores to full.
    const okUse = applyRecoveryUse(
      barePlayer({ crabs: [{ ...c, stamina: 50 }], items: { tide_elixir: 1 } }),
      "tide_elixir",
      "x",
      T0
    );
    expect(okUse.ok).toBe(true);
    expect(okUse.player.crabs[0].stamina).toBe(MAX_STAMINA);
  });

  it("salve cures a wound instantly; refuses on a healthy crab", () => {
    const c = bareCrab({
      id: "x",
      stamina: 60,
      staminaUpdatedAt: T0,
      woundedUntil: T0 + 30 * MIN,
    });
    const p = barePlayer({ crabs: [c], items: { coral_salve: 1 } });
    const cured = applyRecoveryUse(p, "coral_salve", "x", T0);
    expect(cured.ok).toBe(true);
    expect(cured.player.crabs[0].woundedUntil).toBeUndefined();
    expect(cured.player.items?.coral_salve).toBe(0);

    const refused = applyRecoveryUse(
      barePlayer({ crabs: [{ ...c, woundedUntil: undefined }], items: { coral_salve: 1 } }),
      "coral_salve",
      "x",
      T0
    );
    expect(refused.ok).toBe(false);
    expect(refused.player.items?.coral_salve).toBe(1);
  });

  it("incense (re)starts the 2h ×3 window — refresh resets, never stacks", () => {
    const p = barePlayer({
      items: { second_wind_incense: 1 },
      recoveryBoostUntil: T0 + HOUR, // 1h already remaining
    });
    const r = applyRecoveryUse(p, "second_wind_incense", undefined, T0);
    expect(r.ok).toBe(true);
    expect(r.player.recoveryBoostUntil).toBe(T0 + 2 * HOUR);
    expect(r.player.items?.second_wind_incense).toBe(0);
  });

  it("store useRecoveryItem: salve cures a store-wounded crab end-to-end", () => {
    const s = useGame.getState();
    const target = starterIds()[0];
    s.woundCrabs([target]);
    s.gainItem("coral_salve", 1);
    expect(s.useRecoveryItem("coral_salve", target)).toBe(true);
    const after = player().crabs.find((c) => c.id === target)!;
    expect(isWounded(after, Date.now())).toBe(false);
    expect(player().items?.coral_salve).toBe(0);
    // Second use with no salve left refuses.
    expect(s.useRecoveryItem("coral_salve", target)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
describe("item market", () => {
  it("reference values and the 300% cap come from the material defs", () => {
    expect(materialReferenceValue("kelp_fiber")).toBe(40);
    expect(materialReferenceValue("abyssal_gem")).toBe(1200);
    expect(maxItemUnitPrice("kelp_fiber")).toBe(120);
  });

  it("demand model: eager at reference, rare to 2×, none above", () => {
    expect(itemSaleChancePerHour(40, "kelp_fiber")).toBe(0.5);
    expect(itemSaleChancePerHour(30, "kelp_fiber")).toBe(0.5);
    expect(itemSaleChancePerHour(60, "kelp_fiber")).toBe(0.1);
    expect(itemSaleChancePerHour(80, "kelp_fiber")).toBe(0.1);
    expect(itemSaleChancePerHour(81, "kelp_fiber")).toBe(0);
    expect(itemSaleProbability(81, "kelp_fiber", 365 * 24 * HOUR)).toBe(0);
    expect(itemSaleProbability(40, "kelp_fiber", 30 * 24 * HOUR)).toBe(1);
  });

  it("listing escrows the stack; cancel returns it in full", () => {
    const s = useGame.getState();
    s.gainMaterials({ kelp_fiber: 5 });
    expect(s.listItemForSale("kelp_fiber", 3, 40)).toBe(true);
    expect(player().materials?.kelp_fiber).toBe(2);
    const listing = useGame
      .getState()
      .bazaarListings.find((l) => l.itemType === "material" && l.sellerId === "player")!;
    expect(listing.quantity).toBe(3);
    expect(s.cancelItemListing(listing.id)).toBe(true);
    expect(player().materials?.kelp_fiber).toBe(5);
    expect(
      useGame.getState().bazaarListings.some((l) => l.id === listing.id)
    ).toBe(false);
  });

  it("the 300% price cap is enforced; failed lists escrow nothing", () => {
    const s = useGame.getState();
    s.gainMaterials({ kelp_fiber: 2 });
    expect(s.listItemForSale("kelp_fiber", 1, 121)).toBe(false); // cap is 120
    expect(player().materials?.kelp_fiber).toBe(2);
    expect(s.listItemForSale("kelp_fiber", 1, 120)).toBe(true); // at cap: fine
    expect(s.listItemForSale("kelp_fiber", 5, 40)).toBe(false); // only 1 left
  });

  it("an NPC sale pays proceeds minus the 3.85% fee, split 1pp treasury / rest burned", () => {
    const s = useGame.getState();
    s.gainMaterials({ kelp_fiber: 5 });
    expect(s.listItemForSale("kelp_fiber", 3, 40)).toBe(true); // total 120
    const goldBefore = player().gold;
    const ecoBefore = economyOf(player());
    // 30 days of demand at reference price → sale is a certainty
    // (probability 1 − 0.5^720 saturates to exactly 1).
    setPlayer({ lastItemMarketTickAt: Date.now() - 30 * 24 * HOUR });
    s.tickTimers();
    expect(
      useGame
        .getState()
        .bazaarListings.some((l) => l.itemType === "material" && l.sellerId === "player")
    ).toBe(false);
    // fee = round(120 × 3.85%) = 5 → seller nets 115, untithed.
    expect(player().gold).toBe(goldBefore + 115);
    const eco = economyOf(player());
    expect(eco.treasury).toBe(ecoBefore.treasury + 1); // round(120 × 1pp)
    expect(eco.totalBurned).toBe(ecoBefore.totalBurned + 4); // 5 − 1
    expect(supplyInvariantHolds(eco)).toBe(true);
    // The escrowed stack is gone for good; the unsold remainder stays.
    expect(player().materials?.kelp_fiber).toBe(2);
    // A Bazaar trade progressed the Trader quest.
    const q = player().questProgress.find((x) => x.questId === "bazaar_trade");
    expect(q?.progress).toBe(1);
  });

  it("no demand above 200% of reference: the stack simply never sells", () => {
    const s = useGame.getState();
    s.gainMaterials({ kelp_fiber: 2 });
    expect(s.listItemForSale("kelp_fiber", 1, 100)).toBe(true); // 250% of 40
    const goldBefore = player().gold;
    setPlayer({ lastItemMarketTickAt: Date.now() - 30 * 24 * HOUR });
    s.tickTimers();
    expect(
      useGame
        .getState()
        .bazaarListings.some((l) => l.itemType === "material" && l.sellerId === "player")
    ).toBe(true);
    expect(player().gold).toBe(goldBefore);
  });

  it("buying your own listing is blocked; buying the NPC shelf works", () => {
    const s = useGame.getState();
    s.gainMaterials({ pearl_shard: 2 });
    expect(s.listItemForSale("pearl_shard", 1, 120)).toBe(true);
    const mine = useGame
      .getState()
      .bazaarListings.find((l) => l.itemType === "material" && l.sellerId === "player")!;
    expect(s.buyItemListing(mine.id)).toBe(false);
    expect(player().materials?.pearl_shard).toBe(1); // still escrowed

    const npc = useGame
      .getState()
      .bazaarListings.find((l) => l.itemType === "material" && l.sellerId === "npc")!;
    setPlayer({ gold: 100000 });
    const goldBefore = player().gold;
    const total = npc.price * (npc.quantity ?? 1); // price index is 1
    expect(s.buyItemListing(npc.id)).toBe(true);
    expect(player().gold).toBe(goldBefore - total);
    expect(player().materials?.[npc.itemId as "kelp_fiber"]).toBe(npc.quantity ?? 1);
    expect(useGame.getState().bazaarListings.some((l) => l.id === npc.id)).toBe(false);
    expect(supplyInvariantHolds(economyOf(player()))).toBe(true);
  });
});
