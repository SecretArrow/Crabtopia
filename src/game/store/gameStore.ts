// Crabtopia - Main game store (Zustand + localStorage)
"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import {
  Crab,
  Team,
  DigSite,
  Raid,
  Egg,
  HallListing,
  BazaarListing,
  PlayerProfile,
  FactionId,
  ClassId,
  TacticCardId,
  Formation,
  FormationPresetId,
} from "../types";
import { generateCrab } from "../engine/crabs";
import { CONFIG, QUESTS, TEAM_SLOT_COSTS, TIDE_TAX_RATE } from "../engine/config";
import {
  applyGoldCredit,
  applyMarketFeeSplit,
  applyPriceIndex,
  applySinkSplit,
  applyTideTax,
  clampSupply,
  defaultEconomy,
  economyOf,
  effectiveListingPrice,
  leviathanWinAmount,
  leviathanWinsTodayOf,
  rollEmissionWindow,
} from "../engine/economy";
import { simulateBattle, BattleSide, TACTIC_CARDS } from "../engine/battle";
import { crabBaseBP, teamBP } from "../engine/bp";
import {
  breedCrabs,
  checkBreedingEligibility,
  breedCost,
  computeGeneOdds,
  hatchEgg,
} from "../engine/genetics";
import { mulberry32, pick, randInt } from "../engine/rng";
import { FACTIONS } from "../content/factions";
import { CLASSES } from "../content/classes";
import { attemptGenesisPurchase, genesisToCrab } from "../engine/genesis";
import { filledCrabIds, normalizeTeamSlots, toTeamSlots, validateTeam } from "../engine/teams";
import { validateFormation } from "../engine/formation";

interface Toast {
  id: string;
  title: string;
  description?: string;
  variant: "default" | "success" | "error" | "warning";
}

interface GameState {
  player: PlayerProfile | null;
  worldSites: DigSite[]; // shared world dig sites (NPC + player)
  hallListings: HallListing[]; // global hall (NPC + player)
  bazaarListings: BazaarListing[]; // global bazaar (NPC + player)
  genesisSoldIds: string[]; // Genesis Crab ids already sold from the market
  activeRaidTargets: DigSite[]; // sites currently raidable
  toasts: Toast[];
  currentScreen: string;
  selectedCrabId: string | null;
  selectedTeamId: string | null;
  battleReplay: Raid | null;
  // actions
  initPlayer: (name: string) => void;
  resetGame: () => void;
  setScreen: (s: string) => void;
  selectCrab: (id: string | null) => void;
  selectTeam: (id: string | null) => void;
  pushToast: (t: Omit<Toast, "id">) => void;
  dismissToast: (id: string) => void;

  // team ops
  createTeam: (name: string) => string;
  deleteTeam: (id: string) => void;
  renameTeam: (id: string, name: string) => void;
  addCrabToTeam: (teamId: string, crabId: string, slot: number) => void;
  removeCrabFromTeam: (teamId: string, slot: number) => void;
  setTeamFormation: (
    teamId: string,
    formation: Formation,
    preset: FormationPresetId
  ) => void;

  // dive ops
  deployDive: (teamId: string, siteId: string) => boolean;
  claimDive: (siteId: string) => void;
  retreatDive: (siteId: string) => void;
  refreshWorld: () => void;

  // raid ops
  launchRaid: (
    siteId: string,
    raiderTeamId: string,
    raiderCrabIds: string[],
    tacticCard: TacticCardId,
    formation: Formation,
    reinforcements: string[]
  ) => Raid | null;

  // hall ops
  listCrabInHall: (crabId: string, fee: number) => void;
  unlistCrabFromHall: (crabId: string) => void;
  hireCrab: (listingId: string) => Crab | null;

  // breeding ops
  // `legendaryChanceBonus` carries the Inventory's Legendary Lure buff
  // (additive legendary-part chance for this one breed, 0..1).
  breed: (aId: string, bId: string, legendaryChanceBonus?: number) => Egg | null;
  hatchEggNow: (eggId: string) => void;

  // bazaar ops
  listCrabInBazaar: (crabId: string, price: number) => void;
  listEggInBazaar: (eggId: string, price: number) => void;
  buyBazaarListing: (listingId: string) => boolean;
  buyGenesisCrab: (genesisNumber: number) => boolean;

  // progression
  addGold: (amount: number) => void;
  /**
   * THE faucet-credit action (tokenomics, engine/economy.ts): applies
   * the Tide Tithe at the pre-credit balance and folds the credit into
   * the economy ledger. Render-layer reward claims must use this, not
   * addGold. opts.prize pays the net out of the Tide Treasury first.
   * Returns what the player actually received ({ net, tax }).
   */
  creditGold: (
    amount: number,
    opts?: { tithe?: boolean; prize?: boolean }
  ) => { net: number; tax: number };
  /**
   * Exempt own-money return (auction escrow refunds): never tithed and
   * never counted as minted — the gold was the player's all along.
   */
  refundGold: (amount: number) => void;
  /**
   * Claim a Leviathan raid WIN: pays the daily-tapered faucet amount
   * (win #1 today 100%, #2 50%, #3+ 25% of 5,000) through creditGold —
   * so the Tide Tithe applies AFTER the taper — and records the win in
   * the rolling 24h taper window. Returns { amount, net, tax } where
   * amount is the tapered gross. The 100g consolation is NOT tapered
   * and keeps using creditGold directly.
   */
  claimLeviathanWin: () => { amount: number; net: number; tax: number };
  spendGold: (amount: number) => boolean;
  setGuardPostLevel: (level: number) => void;
  addXp: (amount: number) => void;
  claimQuest: (questId: string) => void;
  /** Bump a quest's progress by `amount` (clamped at target). Generic hook so
   *  screens (arena victory, leviathan repel, …) can progress quests without
   *  duplicating the map/spread dance. */
  progressQuest: (questId: string, amount?: number) => void;
  tickTimers: () => void;

  // tutorial
  completeTutorial: () => void;
  graduateCrab: (crabId: string) => void;
}

let toastCounter = 0;

function makeId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`;
}

/**
 * Apply Shellwarden XP and derive the level from the same curve addXp
 * uses (level L+1 at L*500 total XP). EVERY XP grant must go through
 * here: four call sites used to add XP without recomputing the level,
 * so the displayed/gating level silently lagged behind the XP total.
 */
function withXp(player: PlayerProfile, amount: number): PlayerProfile {
  const shellwardenXp = player.shellwardenXp + amount;
  let shellwardenLevel = player.shellwardenLevel;
  while (shellwardenXp >= shellwardenLevel * 500) {
    shellwardenLevel++;
  }
  return { ...player, shellwardenXp, shellwardenLevel };
}

// NPC name generator
const NPC_NAMES = [
  "Brinepinch", "Oldshell", "Tidecrest", "Goldfoot", "Riftclaw",
  "Kelpback", "Stormsnap", "Pearlhide", "Cinderjaw", "Mossclaw",
  "Frostgrip", "Moonwarden", "Driftwhisk", "Saltreaver", "Currentleaper",
];

function generateNpcTeam(seed: number, bracket: number): { crabs: Crab[]; name: string } {
  const rng = mulberry32(seed);
  const crabs: Crab[] = [];
  for (let i = 0; i < 5; i++) {
    const c = generateCrab({
      ownerId: "npc",
      level: randInt(Math.max(5, bracket - 5), bracket + 5, rng),
      seed: seed * 7 + i,
    });
    crabs.push(c);
  }
  const name = pick(NPC_NAMES, rng);
  return { crabs, name };
}

function generateWorldSites(): DigSite[] {
  const sites: DigSite[] = [];
  const factions = Object.keys(FACTIONS) as FactionId[];
  for (let i = 0; i < 12; i++) {
    const rng = mulberry32(1000 + i);
    const faction = factions[i % factions.length];
    // 50% occupied, 50% free for good mix
    const isOccupied = rng() < 0.5;
    const bracket = randInt(10, 50, rng);
    let occupier: { crabs: Crab[]; name: string } | null = null;
    if (isOccupied) {
      occupier = generateNpcTeam(2000 + i, bracket);
    }
    const baseReward = CONFIG.baseDiveReward + randInt(-50, 100, rng);
    sites.push({
      id: `site_${i}`,
      name: `${FACTIONS[faction].shortName} Site ${i + 1}`,
      biome: faction,
      pos: {
        x: 0.1 + (i % 4) * 0.25 + rng() * 0.05,
        y: 0.15 + Math.floor(i / 4) * 0.25 + rng() * 0.05,
      },
      occupiedBy: occupier ? `npc_team_${i}` : undefined,
      occupierName: occupier?.name,
      teamId: occupier ? `npc_team_${i}` : undefined,
      deployTime: occupier ? Date.now() - rng() * CONFIG.diveDurationMs : undefined,
      durationMs: CONFIG.diveDurationMs,
      state: occupier ? "deployed" : "completed",
      baseReward,
      raidCount: 0,
      rewardRemaining: baseReward,
      raidShieldUntil: undefined,
      ownerIsPlayer: false,
      bpBracket: bracket,
    });
  }
  // Ensure at least 4 free sites
  const freeCount = sites.filter((s) => !s.occupiedBy).length;
  if (freeCount < 4) {
    const occupied = sites.filter((s) => s.occupiedBy);
    for (let i = 0; i < 4 - freeCount && i < occupied.length; i++) {
      occupied[i].occupiedBy = undefined;
      occupied[i].occupierName = undefined;
      occupied[i].teamId = undefined;
      occupied[i].deployTime = undefined;
      occupied[i].state = "completed";
    }
  }
  return sites;
}

function generateHallListings(): HallListing[] {
  const listings: HallListing[] = [];
  for (let i = 0; i < 8; i++) {
    const rng = mulberry32(3000 + i);
    const crab = generateCrab({
      ownerId: "npc",
      level: randInt(10, 40, rng),
      seed: 4000 + i,
    });
    crab.activity = "hired";
    const bp = crabBaseBP(crab);
    const fee = Math.max(50, Math.round(bp * 1.2));
    listings.push({
      id: `hall_${i}`,
      crabId: crab.id,
      ownerId: "npc",
      ownerName: pick(NPC_NAMES, rng),
      hireFee: fee,
      listedAt: Date.now(),
    });
    // store crab in a global crab cache (we'll store NPCs via bazaarListings hack: actually we need a separate NPC crab store)
    // For simplicity, the listing references crabId and the Crab object is stored in a side map.
    (listings as any)._npcCrabs = (listings as any)._npcCrabs || {};
    (listings as any)._npcCrabs[crab.id] = crab;
  }
  return listings;
}

function generateBazaarListings(): BazaarListing[] {
  const listings: BazaarListing[] = [];
  for (let i = 0; i < 10; i++) {
    const rng = mulberry32(5000 + i);
    const isEgg = rng() < 0.3;
    const level = randInt(10, 40, rng);
    const crab = generateCrab({
      ownerId: "npc",
      level,
      seed: 6000 + i,
    });
    const bp = crabBaseBP(crab);
    const price = Math.max(1000, Math.round(bp * 15 + level * 200));
    listings.push({
      id: `baz_${i}`,
      itemId: isEgg ? `egg_npc_${i}` : crab.id,
      itemType: isEgg ? "egg" : "crab",
      sellerId: "npc",
      sellerName: pick(NPC_NAMES, rng),
      price,
      listedAt: Date.now(),
      type: "fixed",
    });
    (listings as any)._npcCrabs = (listings as any)._npcCrabs || {};
    (listings as any)._npcCrabs[crab.id] = crab;
  }
  return listings;
}

// We need a way to look up NPC crabs. Store them in a module-level cache.
export const NPC_CRAB_CACHE: Record<string, Crab> = {};
export const NPC_EGG_CACHE: Record<string, Egg> = {};

function populateNpcCache() {
  // Generate a pool of NPC crabs for the world
  for (let i = 0; i < 30; i++) {
    const rng = mulberry32(7000 + i);
    const c = generateCrab({ ownerId: "npc", level: randInt(8, 45, rng), seed: 8000 + i });
    NPC_CRAB_CACHE[c.id] = c;
  }
}

// Initial player setup — 5 starter crabs for 5v5 arena deployment
function createStarterPlayer(name: string): PlayerProfile {
  const rng = mulberry32(Date.now());
  const starterCrabs: Crab[] = [];
  const factions: FactionId[] = [
    "coral_court",
    "cinderreef",
    "frostshelf",
    "mangrove",
    "stormwake",
  ];
  const classes: ClassId[] = [
    "bulwark",
    "reaver",
    "skitter",
    "shellmender",
    "tidecaller",
  ];
  for (let i = 0; i < 5; i++) {
    const c = generateCrab({
      faction: factions[i],
      classId: classes[i],
      ownerId: "player",
      isRookie: true,
      level: 1,
      seed: Math.floor(rng() * 2 ** 31),
    });
    starterCrabs.push(c);
  }

  // Tutorial dig site that's free
  const tutorialSite: DigSite = {
    id: "site_tutorial",
    name: "Tutorial Tidepool",
    biome: "coral_court",
    pos: { x: 0.5, y: 0.5 },
    state: "completed",
    baseReward: 500,
    raidCount: 0,
    rewardRemaining: 500,
    durationMs: CONFIG.tutorialDiveMs,
    isTutorial: true,
    ownerIsPlayer: true,
    bpBracket: 5,
  };

  const teams: Team[] = [
    {
      id: "team_starter",
      name: "Tideband",
      crabIds: starterCrabs.map((c) => c.id),
      createdAt: Date.now(),
    },
  ];

  return {
    id: "player",
    name,
    gold: 2000,
    economy: defaultEconomy(),
    crabs: starterCrabs,
    teams,
    eggs: [],
    digSites: [tutorialSite],
    hallListings: [],
    raids: [],
    tidelordRank: 1,
    shellwardenLevel: 1,
    shellwardenXp: 0,
    lastLogin: Date.now(),
    loginStreak: 1,
    dailyDiveCount: 0,
    dailyDiveResetAt: Date.now() + 24 * 60 * 60 * 1000,
    raidEnergy: CONFIG.dailyRaidEnergy,
    raidEnergyResetAt: Date.now() + 24 * 60 * 60 * 1000,
    leviathanWinsToday: 0,
    leviathanWinsResetAt: Date.now() + 24 * 60 * 60 * 1000,
    tutorialComplete: false,
    questProgress: QUESTS.map((q) => ({
      questId: q.id,
      progress: 0,
      target: q.target,
      claimed: false,
    })),
    discoveredBreeds: [],
    discoveredLegendaries: [],
    insuranceActive: false,
    guardPostLevel: 0,
    ownedPlots: [],
    createdAt: Date.now(),
  };
}

export const useGame = create<GameState>()(
  persist(
    (set, get) => ({
      player: null,
      worldSites: [],
      hallListings: [],
      bazaarListings: [],
      genesisSoldIds: [],
      activeRaidTargets: [],
      toasts: [],
      currentScreen: "home",
      selectedCrabId: null,
      selectedTeamId: null,
      battleReplay: null,

      initPlayer: (name: string) => {
        populateNpcCache();
        const player = createStarterPlayer(name);
        const worldSites = generateWorldSites();
        const hallListings = generateHallListings();
        // populate NPC crab cache from hall listings
        for (const l of hallListings) {
          // need the crab - regenerate based on listing id
          const rng = mulberry32(parseInt(l.id.replace("hall_", ""), 10) + 4000);
          const crab = generateCrab({
            ownerId: "npc",
            level: randInt(10, 40, rng),
            seed: 4000 + parseInt(l.id.replace("hall_", ""), 10),
          });
          crab.id = l.crabId;
          crab.activity = "hired";
          crab.hireFee = l.hireFee;
          NPC_CRAB_CACHE[l.crabId] = crab;
        }
        const bazaarListings = generateBazaarListings();
        for (const l of bazaarListings) {
          if (l.itemType === "crab") {
            const idx = parseInt(l.id.replace("baz_", ""), 10);
            const rng = mulberry32(5000 + idx);
            const crab = generateCrab({
              ownerId: "npc",
              level: randInt(10, 40, rng),
              seed: 6000 + idx,
            });
            crab.id = l.itemId;
            NPC_CRAB_CACHE[l.itemId] = crab;
          } else {
            // NPC egg
            const rng = mulberry32(9000 + parseInt(l.id.replace("baz_", ""), 10));
            const egg: Egg = {
              id: l.itemId,
              parentId: [],
              faction: pick(["coral_court", "cinderreef", "frostshelf", "mangrove", "stormwake", "moonpool"] as FactionId[], rng),
              classId: pick(["bulwark", "reaver", "skitter", "tidecaller", "shellmender", "pincher", "warden", "gildclaw"] as ClassId[], rng),
              genePreview: {} as any,
              hatchTime: Date.now() + CONFIG.eggHatchMs,
              createdTime: Date.now(),
              ownerId: "npc",
              name: "Mystery Egg",
              isLegendaryCandidate: false,
            };
            NPC_EGG_CACHE[l.itemId] = egg;
          }
        }
        set({
          player,
          worldSites,
          hallListings,
          bazaarListings,
          currentScreen: "home",
        });
        get().pushToast({
          title: name.trim() && name !== "Shellwarden"
            ? `Welcome, Shellwarden ${name}!`
            : `Welcome to Crabtopia!`,
          description: "You inherited 5 Rookie Crabs and 2000 GOLD. Send your first dive!",
          variant: "success",
        });
      },

      resetGame: () => {
        set({
          player: null,
          worldSites: [],
          hallListings: [],
          bazaarListings: [],
          genesisSoldIds: [],
          toasts: [],
          currentScreen: "home",
          selectedCrabId: null,
          selectedTeamId: null,
          battleReplay: null,
        });
        // clear cache
        for (const k of Object.keys(NPC_CRAB_CACHE)) delete NPC_CRAB_CACHE[k];
        for (const k of Object.keys(NPC_EGG_CACHE)) delete NPC_EGG_CACHE[k];
      },

      setScreen: (s) => set({ currentScreen: s }),
      selectCrab: (id) => set({ selectedCrabId: id }),
      selectTeam: (id) => set({ selectedTeamId: id }),

      pushToast: (t) => {
        // The id embeds the creation timestamp: ToastContainer parses
        // Number(id.split("_")[1]) to drive the toast's life bar. A plain
        // counter used to make the parsed "timestamp" ~0, so the bar was
        // permanently stuck (scaleX(0)) instead of draining over 4s.
        const id = `toast_${Date.now()}_${toastCounter++}`;
        set((state) => ({ toasts: [...state.toasts, { ...t, id }] }));
        setTimeout(() => {
          set((state) => ({ toasts: state.toasts.filter((x) => x.id !== id) }));
        }, 4000);
      },
      dismissToast: (id) =>
        set((state) => ({ toasts: state.toasts.filter((x) => x.id !== id) })),

      createTeam: (name) => {
        const id = makeId("team");
        const player = get().player;
        if (!player) return "";
        if (player.teams.length >= 5 + TEAM_SLOT_COSTS.length) {
          get().pushToast({ title: `Team limit reached (${5 + TEAM_SLOT_COSTS.length}).`, variant: "error" });
          return "";
        }
        // extra slots beyond 5 cost gold (schedule: engine/config)
        if (player.teams.length >= 5) {
          const cost = TEAM_SLOT_COSTS[player.teams.length - 5];
          if (player.gold < cost) {
            get().pushToast({ title: `Need ${cost} GOLD for extra team slot.`, variant: "error" });
            return "";
          }
          set({ player: { ...player, gold: player.gold - cost, teams: [...player.teams, { id, name, crabIds: normalizeTeamSlots([]), createdAt: Date.now() }] } });
        } else {
          set({ player: { ...player, teams: [...player.teams, { id, name, crabIds: normalizeTeamSlots([]), createdAt: Date.now() }] } });
        }
        return id;
      },

      deleteTeam: (id) => {
        const player = get().player;
        if (!player) return;
        // A team with a deployed (unclaimed) dive must survive until the
        // dive resolves: claim/retreat locate the team through the site,
        // and deleting it here would strand its crabs in "diving" forever.
        const deployed = get().worldSites.some(
          (s) => s.teamId === id && s.state === "deployed"
        );
        if (deployed) {
          get().pushToast({ title: "That team is out on a dive — claim or retreat it first.", variant: "warning" });
          return;
        }
        set({ player: { ...player, teams: player.teams.filter((t) => t.id !== id) } });
      },

      renameTeam: (id, name) => {
        const player = get().player;
        if (!player) return;
        const trimmed = name.trim().slice(0, 24);
        if (!trimmed) return;
        set({
          player: {
            ...player,
            teams: player.teams.map((t) =>
              t.id === id ? { ...t, name: trimmed } : t
            ),
          },
        });
      },

      setTeamFormation: (teamId, formation, preset) => {
        const player = get().player;
        if (!player) return;
        const team = player.teams.find((t) => t.id === teamId);
        if (!team) return;
        // Only persist formations that exactly cover the team's members;
        // anything else would silently break deployment later.
        if (!validateFormation(formation, filledCrabIds(team.crabIds))) return;
        set({
          player: {
            ...player,
            teams: player.teams.map((t) =>
              t.id === teamId ? { ...t, formation, formationPreset: preset } : t
            ),
          },
        });
      },

      addCrabToTeam: (teamId, crabId, slot) => {
        const player = get().player;
        if (!player) return;
        if (!Number.isInteger(slot) || slot < 0 || slot > 4) return; // teams always have exactly 5 slots (0-4)
        const crab = player.crabs.find((c) => c.id === crabId);
        if (!crab) return;
        if (crab.activity !== "idle") {
          get().pushToast({ title: `${crab.name} is busy (${crab.activity}).`, variant: "error" });
          return;
        }
        const teams = player.teams.map((t) => {
          if (t.id !== teamId) return t;
          // Positional 5-slot view (migrates legacy short arrays); moving a
          // crab that is already in this team clears its previous slot, so a
          // crab can never occupy two slots in the same team.
          const newIds = toTeamSlots(t.crabIds);
          for (let i = 0; i < newIds.length; i++) {
            if (newIds[i] === crabId) newIds[i] = "";
          }
          newIds[slot] = crabId;
          // A stored formation that no longer matches the members is stale —
          // drop it (the preset survives and re-derives a valid formation).
          const formation =
            t.formation && validateFormation(t.formation, filledCrabIds(newIds))
              ? t.formation
              : undefined;
          return { ...t, crabIds: newIds, formation };
        });
        set({ player: { ...player, teams } });
      },

      removeCrabFromTeam: (teamId, slot) => {
        const player = get().player;
        if (!player) return;
        if (!Number.isInteger(slot) || slot < 0 || slot > 4) return;
        // A diving crab is resolved through this team's slots when its
        // dive is claimed; pulling it out mid-dive would strand it.
        const teamNow = player.teams.find((t) => t.id === teamId);
        const outgoing = teamNow
          ? player.crabs.find((c) => c.id === toTeamSlots(teamNow.crabIds)[slot])
          : undefined;
        if (outgoing && outgoing.activity === "diving") {
          get().pushToast({ title: "That crab is out on a dive — claim or retreat it first.", variant: "warning" });
          return;
        }
        const teams = player.teams.map((t) => {
          if (t.id !== teamId) return t;
          const newIds = toTeamSlots(t.crabIds);
          newIds[slot] = "";
          const formation =
            t.formation && validateFormation(t.formation, filledCrabIds(newIds))
              ? t.formation
              : undefined;
          return { ...t, crabIds: newIds, formation };
        });
        set({ player: { ...player, teams } });
      },

      deployDive: (teamId, siteId) => {
        const player = get().player;
        if (!player) return false;
        const team = player.teams.find((t) => t.id === teamId);
        if (!team || !validateTeam(team.crabIds).valid) {
          get().pushToast({ title: "Team needs exactly 5 crabs.", variant: "error" });
          return false;
        }
        // check daily cap
        if (player.dailyDiveCount >= CONFIG.dailyDiveCap) {
          get().pushToast({ title: "Daily dive cap reached (6).", variant: "warning" });
          return false;
        }
        // check crabs are idle
        for (const cid of team.crabIds) {
          const c = player.crabs.find((x) => x.id === cid);
          if (!c || c.activity !== "idle") {
            get().pushToast({ title: `${c?.name} is busy.`, variant: "error" });
            return false;
          }
        }
        // The site must exist in worldSites and be unoccupied. Deploying
        // onto a taken site would overwrite its occupancy and strand the
        // first team's crabs in "diving" forever (claim/retreat only free
        // the site's current team); a site unknown to worldSites would
        // strand this team the same way.
        const targetSite = get().worldSites.find((s) => s.id === siteId);
        if (!targetSite) {
          get().pushToast({ title: "That dive site no longer exists.", variant: "error" });
          return false;
        }
        if (targetSite.occupiedBy) {
          get().pushToast({ title: "That dive site is already occupied.", variant: "warning" });
          return false;
        }
        // occupy site
        const sites = get().worldSites.map((s) => {
          if (s.id !== siteId) return s;
          return {
            ...s,
            occupiedBy: teamId,
            occupierName: player.name,
            teamId,
            deployTime: Date.now(),
            state: "deployed" as const,
            rewardRemaining: s.baseReward,
            ownerIsPlayer: true,
            raidCount: 0,
          };
        });
        // mark crabs as diving
        const crabs = player.crabs.map((c) =>
          team.crabIds.includes(c.id) ? { ...c, activity: "diving" as const } : c
        );
        set({
          worldSites: sites,
          player: { ...player, crabs, dailyDiveCount: player.dailyDiveCount + 1 },
        });
        get().pushToast({
          title: "Dive deployed!",
          description: `Team will return in ${Math.round(CONFIG.diveDurationMs / 60000)} min.`,
          variant: "success",
        });
        get().tickTimers();
        return true;
      },

      claimDive: (siteId) => {
        const player = get().player;
        if (!player) return;
        const site = get().worldSites.find((s) => s.id === siteId) ?? player.digSites.find((s) => s.id === siteId);
        if (!site || site.state !== "completed") {
          get().pushToast({ title: "Dive not complete yet.", variant: "error" });
          return;
        }
        if (!site.ownerIsPlayer) {
          get().pushToast({ title: "Not your dive.", variant: "error" });
          return;
        }
        const reward = Math.round(site.rewardRemaining);
        const team = player.teams.find((t) => t.id === site.teamId);
        const crabs = player.crabs.map((c) =>
          team?.crabIds.includes(c.id) ? { ...c, activity: "idle" as const } : c
        );
        // mark site as claimed
        const newWorldSites = get().worldSites.map((s) =>
          s.id === siteId
            ? { ...s, state: "claimed" as const, occupiedBy: undefined, teamId: undefined, occupierName: undefined, deployTime: undefined }
            : s
        );
        // also tutorial site
        const digSites = player.digSites.map((s) =>
          s.id === siteId ? { ...s, state: "claimed" as const } : s
        );
        // update quest progress
        const qp = player.questProgress.map((q) => {
          if (q.questId === "claim_dive") return { ...q, progress: Math.min(q.target, q.progress + 1) };
          return q;
        });
        // Gildclaw bonus
        let bonus = 0;
        if (team) {
          for (const cid of team.crabIds) {
            const c = crabs.find((x) => x.id === cid);
            if (c?.classId === "gildclaw") bonus += Math.round(reward * 0.1);
          }
        }
        const totalReward = reward + bonus;
        // Faucet credit → routed through the tokenomics helper (Tide
        // Tithe at the pre-credit balance + economy ledger counters).
        const credited = applyGoldCredit(player, totalReward);
        set({
          worldSites: newWorldSites,
          player: withXp(
            {
              ...credited.player,
              crabs,
              digSites,
              questProgress: qp,
            },
            50
          ),
        });
        const notes: string[] = [];
        if (bonus > 0) notes.push(`Gildclaw bonus: +${bonus}`);
        if (credited.tax > 0) notes.push(`Tide Tithe: −${credited.tax}`);
        get().pushToast({
          title: `+${credited.net} GOLD claimed!`,
          description: notes.length ? notes.join(" · ") : undefined,
          variant: "success",
        });
      },

      retreatDive: (siteId) => {
        const player = get().player;
        if (!player) return;
        const site = get().worldSites.find((s) => s.id === siteId);
        if (!site || !site.ownerIsPlayer || site.state !== "deployed") return;
        const elapsed = Date.now() - (site.deployTime ?? Date.now());
        const partial = Math.round((elapsed / site.durationMs) * site.baseReward * 0.5);
        const team = player.teams.find((t) => t.id === site.teamId);
        const crabs = player.crabs.map((c) =>
          team?.crabIds.includes(c.id) ? { ...c, activity: "idle" as const } : c
        );
        const newWorldSites = get().worldSites.map((s) =>
          s.id === siteId
            ? { ...s, state: "claimed" as const, occupiedBy: undefined, teamId: undefined }
            : s
        );
        // Partial dive income is still a faucet credit → tithed/ledgered
        // like a full claim.
        const credited = applyGoldCredit(player, partial);
        set({
          worldSites: newWorldSites,
          player: { ...credited.player, crabs },
        });
        get().pushToast({
          title: `Retreated with ${credited.net} GOLD (partial).`,
          description:
            credited.tax > 0 ? `Tide Tithe: −${credited.tax}` : undefined,
          variant: "warning",
        });
      },

      refreshWorld: () => {
        // Periodically regenerate empty world sites to keep things fresh
        const sites = get().worldSites;
        const player = get().player;
        if (!player) return;
        let updated = sites.map((s) => {
          // NPC completed sites: free them up so players can deploy
          if (s.state === "completed" && !s.ownerIsPlayer && s.occupiedBy) {
            return {
              ...s,
              occupiedBy: undefined,
              occupierName: undefined,
              teamId: undefined,
              deployTime: undefined,
              state: "completed" as const,
              raidCount: 0,
              rewardRemaining: s.baseReward,
            };
          }
          // Free sites (completed, no occupier): NPC may claim them
          if ((s.state === "completed" || s.state === "claimed") && !s.occupiedBy && !s.ownerIsPlayer) {
            if (Math.random() < 0.3) {
              const bracket = randInt(10, 50, Math.random);
              const npc = generateNpcTeam(Date.now() + Math.random() * 1000, bracket);
              return {
                ...s,
                occupiedBy: `npc_team_${s.id}`,
                occupierName: npc.name,
                teamId: `npc_team_${s.id}`,
                deployTime: Date.now(),
                state: "deployed" as const,
                raidCount: 0,
                rewardRemaining: s.baseReward,
                bpBracket: bracket,
              };
            }
          }
          return s;
        });
        // Ensure at least 3 free sites always
        const freeCount = updated.filter((s) => !s.occupiedBy).length;
        if (freeCount < 3) {
          const occupied = updated.filter((s) => s.occupiedBy && !s.ownerIsPlayer);
          for (let i = 0; i < 3 - freeCount && i < occupied.length; i++) {
            updated = updated.map((s) =>
              s.id === occupied[i].id
                ? { ...s, occupiedBy: undefined, occupierName: undefined, teamId: undefined, deployTime: undefined, state: "completed" as const, raidCount: 0, rewardRemaining: s.baseReward }
                : s
            );
          }
        }
        set({ worldSites: updated });
      },

      launchRaid: (siteId, raiderTeamId, raiderCrabIds, tacticCard, formation, reinforcements) => {
        const player = get().player;
        if (!player) return null;
        if (player.raidEnergy <= 0) {
          get().pushToast({ title: "No raid energy left.", variant: "error" });
          return null;
        }
        const site = get().worldSites.find((s) => s.id === siteId);
        if (!site || !site.occupiedBy || site.raidCount >= 2) {
          get().pushToast({ title: "Site not raidable.", variant: "error" });
          return null;
        }
        // You cannot raid your own deployed site: the participation reward
        // (and a possible "steal" from your own reward pool) would be gold
        // created from nothing, repeatable per raid energy.
        if (site.ownerIsPlayer) {
          get().pushToast({ title: "You can't raid your own dive site.", variant: "warning" });
          return null;
        }
        // get defender crabs - they're NPC crabs
        const defenderSeed = parseInt(site.id.replace("site_", ""), 10) + 2000;
        const defenderTeam = generateNpcTeam(defenderSeed, site.bpBracket);
        // Raiders: exactly 5 DISTINCT crabs, and each must be idle — a
        // duplicated id used to be counted twice toward the 5, and busy
        // (e.g. diving) crabs could fight while deployed elsewhere.
        const uniqueRaiderIds = [...new Set(raiderCrabIds)];
        const raiderCrabs = uniqueRaiderIds
          .map((id) => player.crabs.find((c) => c.id === id))
          .filter(Boolean) as Crab[];
        if (raiderCrabs.length !== 5) {
          get().pushToast({ title: "Need 5 distinct raider crabs.", variant: "error" });
          return null;
        }
        if (raiderCrabs.some((c) => c.activity !== "idle")) {
          get().pushToast({ title: "Raiders must be idle — some are busy.", variant: "error" });
          return null;
        }
        // Reinforcements (player's own idle crabs or hired NPCs): capped at
        // CONFIG.maxReinforcements (the cap was declared but never enforced
        // here), de-duplicated, and never overlapping the raider five.
        const reinforcementCrabs: Crab[] = [];
        for (const rid of reinforcements) {
          if (reinforcementCrabs.length >= CONFIG.maxReinforcements) break;
          if (uniqueRaiderIds.includes(rid)) continue;
          if (reinforcementCrabs.some((c) => c.id === rid)) continue;
          const own = player.crabs.find((c) => c.id === rid);
          if (own) {
            if (own.activity === "idle") reinforcementCrabs.push(own);
          } else if (NPC_CRAB_CACHE[rid]) {
            reinforcementCrabs.push(NPC_CRAB_CACHE[rid]);
          }
        }
        const allRaider = [...raiderCrabs, ...reinforcementCrabs];

        // Simulate
        const seed = Date.now();
        const raiderSide: BattleSide = {
          crabs: allRaider,
          tacticCard,
          formation,
          name: player.name,
        };
        const defenderSide: BattleSide = {
          crabs: defenderTeam.crabs,
          tacticCard: "fortify", // NPCs default to fortify
          name: defenderTeam.name,
        };
        const result = simulateBattle(raiderSide, defenderSide, seed);

        // Determine rewards. The steal rate is CONFIG.raidStealPercent,
        // full stop: the 50% insurance cap belongs to the DEFENDER's
        // policy (see DefenseHubModal), and keying it off the ATTACKER's
        // insuranceActive flag punished the buyer for insuring.
        const stolenAmount = result.winner === "raider"
          ? Math.round(site.rewardRemaining * CONFIG.raidStealPercent)
          : 0;
        const participationReward = Math.round(site.baseReward * CONFIG.raidParticipationPercent);
        const totalRaiderReward = stolenAmount + participationReward;

        // Build the Raid object
        const raid: Raid = {
          id: makeId("raid"),
          siteId,
          raiderTeamId,
          raiderName: player.name,
          raiderCrabIds: raiderCrabIds,
          defenderCrabIds: defenderTeam.crabs.map((c) => c.id),
          raiderReinforcementIds: reinforcementCrabs.map((c) => c.id),
          defenderReinforcementIds: [],
          startTime: Date.now(),
          durationMs: CONFIG.raidDurationMs,
          state: "resolved",
          result: {
            winner: result.winner,
            raiderBP: result.raiderTotalBP,
            defenderBP: result.defenderTotalBP,
            stolenAmount,
            participationReward,
            breakdown: {
              baseBP: { raider: 0, defender: 0 },
              factionBonus: { raider: 0, defender: 0 },
              classSynergy: { raider: 0, defender: 0 },
              passiveBonus: { raider: 0, defender: 0 },
              wheelModifier: { raider: 0, defender: 0 },
              tacticModifier: { raider: 0, defender: 0 },
              variance: { raider: 0, defender: 0 },
              total: { raider: result.raiderTotalBP, defender: result.defenderTotalBP },
            },
            events: result.events,
            seed,
          },
          tacticCard,
          defenderTactic: "fortify",
          formation,
        };

        // Apply effects
        const newWorldSites = get().worldSites.map((s) => {
          if (s.id !== siteId) return s;
          const newRewardRemaining = Math.max(
            Math.round(s.rewardRemaining * CONFIG.defenderFloorPercent),
            s.rewardRemaining - stolenAmount
          );
          return {
            ...s,
            raidCount: s.raidCount + 1,
            rewardRemaining: newRewardRemaining,
            state: result.winner === "raider" ? "raided" : s.state,
          };
        });

        // update quest progress
        const qp = player.questProgress.map((q) => {
          if (q.questId === "win_raid" && result.winner === "raider") {
            return { ...q, progress: Math.min(q.target, q.progress + 1) };
          }
          return q;
        });

        // Raid winnings (steal + participation) are a faucet credit →
        // tithed/ledgered via the tokenomics helper.
        const credited = applyGoldCredit(player, totalRaiderReward);
        set({
          worldSites: newWorldSites,
          player: withXp(
            {
              ...credited.player,
              raidEnergy: player.raidEnergy - 1,
              raids: [raid, ...player.raids].slice(0, 20),
              questProgress: qp,
            },
            result.winner === "raider" ? 80 : 30
          ),
          battleReplay: raid,
        });

        get().pushToast({
          title: result.winner === "raider" ? `Raid won! +${credited.net} GOLD` : `Raid lost. +${credited.net} GOLD participation`,
          description: `Raider BP ${result.raiderTotalBP} vs Defender BP ${result.defenderTotalBP}${credited.tax > 0 ? ` · Tide Tithe: −${credited.tax}` : ""}`,
          variant: result.winner === "raider" ? "success" : "warning",
        });
        return raid;
      },

      listCrabInHall: (crabId, fee) => {
        const player = get().player;
        if (!player) return;
        // A hire fee below 1 is meaningless — and a NEGATIVE fee would make
        // hireCrab pay the hirer (owner share exceeds the fee charged).
        if (!Number.isFinite(fee) || fee < 1) {
          get().pushToast({ title: "Hire fee must be at least 1 GOLD.", variant: "error" });
          return;
        }
        fee = Math.round(fee);
        const crab = player.crabs.find((c) => c.id === crabId);
        if (!crab || crab.activity !== "idle") {
          get().pushToast({ title: "Crab not available.", variant: "error" });
          return;
        }
        const listing: HallListing = {
          id: makeId("hall"),
          crabId,
          ownerId: player.id,
          ownerName: player.name,
          hireFee: fee,
          listedAt: Date.now(),
        };
        const crabs = player.crabs.map((c) =>
          c.id === crabId ? { ...c, activity: "hired" as const, hireFee: fee } : c
        );
        set({
          hallListings: [listing, ...get().hallListings],
          player: { ...player, crabs, hallListings: [listing, ...player.hallListings] },
        });
        // quest
        const qp = player.questProgress.map((q) =>
          q.questId === "list_crab" ? { ...q, progress: Math.min(q.target, q.progress + 1) } : q
        );
        set({ player: { ...get().player!, questProgress: qp } });
        get().pushToast({ title: `${crab.name} listed in Driftwood Hall.`, variant: "success" });
      },

      unlistCrabFromHall: (crabId) => {
        const player = get().player;
        if (!player) return;
        const crabs = player.crabs.map((c) =>
          c.id === crabId ? { ...c, activity: "idle" as const, hireFee: undefined } : c
        );
        const hallListings = player.hallListings.filter((l) => l.crabId !== crabId);
        const globalHall = get().hallListings.filter((l) => l.crabId !== crabId);
        set({
          hallListings: globalHall,
          player: { ...player, crabs, hallListings },
        });
      },

      hireCrab: (listingId) => {
        const listing = get().hallListings.find((l) => l.id === listingId);
        if (!listing) return null;
        const player = get().player;
        if (!player) return null;
        if (player.gold < listing.hireFee) {
          get().pushToast({ title: "Not enough GOLD.", variant: "error" });
          return null;
        }
        // find crab (NPC cache or player's own)
        let crab = NPC_CRAB_CACHE[listing.crabId];
        if (!crab) crab = player.crabs.find((c) => c.id === listing.crabId);
        if (!crab) return null;
        // pay
        const fee = listing.hireFee;
        const platformFee = Math.round(fee * CONFIG.hallFeePercent);
        const ownerShare = fee - platformFee;
        // Fee destination, now ledgered (tokenomics): half of the
        // platform fee is burned, the other half flows to the Tide
        // Treasury (the "community pool" this comment used to hand-wave).
        const burned = Math.round(platformFee / 2);
        set({
          player: applySinkSplit(
            { ...player, gold: player.gold - fee },
            platformFee - burned,
            burned
          ),
          hallListings: get().hallListings.filter((l) => l.id !== listingId),
        });
        // if owned by NPC, owner share is sunk (no actual player to credit). For player-owned, credit them.
        // TOKENOMICS EXEMPTION: this credit is only reachable on a
        // self-hire (hiring back your own listed crab) — it is the
        // player's own money coming back, not faucet income, so it is
        // never tithed and never counted as minted.
        if (listing.ownerId === "player") {
          const player2 = get().player!;
          const newListings = player2.hallListings.filter((l) => l.id !== listingId);
          set({
            player: {
              ...player2,
              gold: player2.gold + ownerShare,
              hallListings: newListings,
            },
          });
        }
        // quest — hiring a MERCENARY means someone else's crab; hiring
        // back your own listed crab must not farm the quest.
        if (listing.ownerId !== "player") {
          const qp = get().player!.questProgress.map((q) =>
            q.questId === "hire_crab" ? { ...q, progress: Math.min(q.target, q.progress + 1) } : q
          );
          set({ player: { ...get().player!, questProgress: qp } });
        }
        // A hired NPC crab actually JOINS the player's roster. Previously
        // the fee was paid and the listing removed but the crab was never
        // delivered (a pure gold sink). Self-hires (hiring back your own
        // listed crab) keep the crab in the roster, so only NPC hires add.
        const alreadyOwned =
          listing.ownerId === "player" ||
          player.crabs.some((c) => c.id === crab!.id);
        if (!alreadyOwned) {
          const hired: Crab = {
            ...crab,
            ownerId: "player",
            activity: "idle",
          };
          const p = get().player!;
          set({ player: { ...p, crabs: [...p.crabs, hired] } });
        }
        get().pushToast({
          title: `Hired ${crab.name} for ${fee} GOLD!`,
          description: alreadyOwned
            ? `Platform fee: ${platformFee} (${burned} burned)`
            : `${crab.name} joined your roster · Platform fee: ${platformFee} (${burned} burned)`,
          variant: "success",
        });
        return crab;
      },

      breed: (aId, bId, legendaryChanceBonus = 0) => {
        const player = get().player;
        if (!player) return null;
        const a = player.crabs.find((c) => c.id === aId);
        const b = player.crabs.find((c) => c.id === bId);
        if (!a || !b) return null;
        const elig = checkBreedingEligibility(a, b);
        if (!elig.eligible) {
          get().pushToast({ title: "Cannot breed.", description: elig.reasons.join(" "), variant: "error" });
          return null;
        }
        const cost = breedCost(a, b);
        if (player.gold < cost) {
          get().pushToast({ title: `Need ${cost} GOLD to breed.`, variant: "error" });
          return null;
        }
        const egg = breedCrabs(a, b, player.id, undefined, legendaryChanceBonus);
        // increment breed counts
        const crabs = player.crabs.map((c) =>
          c.id === aId || c.id === bId ? { ...c, breedCount: c.breedCount + 1, activity: "nursery" as const } : c
        );
        // schedule restore to idle after 1 min (nursery)
        setTimeout(() => {
          const p = get().player;
          if (!p) return;
          set({
            player: {
              ...p,
              crabs: p.crabs.map((c) =>
                c.id === aId || c.id === bId ? { ...c, activity: "idle" as const } : c
              ),
            },
          });
        }, 30 * 1000);
        const qp = player.questProgress.map((q) =>
          q.questId === "breed_crab" ? { ...q, progress: Math.min(q.target, q.progress + 1) } : q
        );
        set({
          player: withXp(
            {
              ...player,
              gold: player.gold - cost,
              crabs,
              eggs: [...player.eggs, egg],
              questProgress: qp,
            },
            100
          ),
        });
        get().pushToast({
          title: `Egg created! Hatches in ${Math.round(CONFIG.eggHatchMs / 60000)} min.`,
          description: `Cost: ${cost} GOLD`,
          variant: "success",
        });
        return egg;
      },

      hatchEggNow: (eggId) => {
        const player = get().player;
        if (!player) return;
        const egg = player.eggs.find((e) => e.id === eggId);
        if (!egg) return;
        if (Date.now() < egg.hatchTime) {
          get().pushToast({ title: "Egg not ready to hatch.", variant: "error" });
          return;
        }
        const crab = hatchEgg(egg);
        const qp = player.questProgress.map((q) =>
          q.questId === "hatch_egg" ? { ...q, progress: Math.min(q.target, q.progress + 1) } : q
        );
        set({
          player: withXp(
            {
              ...player,
              crabs: [...player.crabs, crab],
              eggs: player.eggs.filter((e) => e.id !== eggId),
              questProgress: qp,
              discoveredBreeds: [...new Set([...player.discoveredBreeds, crab.breedId])],
            },
            150
          ),
        });
        get().pushToast({
          title: `${crab.name} hatched!`,
          description: `${FACTIONS[crab.faction].name} ${CLASSES[crab.classId].name}`,
          variant: "success",
        });
      },

      listCrabInBazaar: (crabId, price) => {
        const player = get().player;
        if (!player) return;
        // Prices must be real: a non-positive price would hand the item
        // away for free (or worse, pay the buyer via the seller credit).
        if (!Number.isFinite(price) || price < 1) {
          get().pushToast({ title: "Price must be at least 1 GOLD.", variant: "error" });
          return;
        }
        price = Math.round(price);
        const crab = player.crabs.find((c) => c.id === crabId);
        if (!crab || crab.activity !== "idle") {
          get().pushToast({ title: "Crab not available.", variant: "error" });
          return;
        }
        if (crab.isRookie) {
          get().pushToast({ title: "Rookie crabs cannot be traded.", variant: "error" });
          return;
        }
        const listing: BazaarListing = {
          id: makeId("baz"),
          itemId: crabId,
          itemType: "crab",
          sellerId: player.id,
          sellerName: player.name,
          price,
          listedAt: Date.now(),
          type: "fixed",
        };
        const crabs = player.crabs.map((c) =>
          c.id === crabId ? { ...c, activity: "hired" as const } : c
        );
        set({
          bazaarListings: [listing, ...get().bazaarListings],
          player: { ...player, crabs },
        });
        get().pushToast({ title: `${crab.name} listed for ${price} GOLD.`, variant: "success" });
      },

      listEggInBazaar: (eggId, price) => {
        const player = get().player;
        if (!player) return;
        if (!Number.isFinite(price) || price < 1) {
          get().pushToast({ title: "Price must be at least 1 GOLD.", variant: "error" });
          return;
        }
        price = Math.round(price);
        const egg = player.eggs.find((e) => e.id === eggId);
        if (!egg) return;
        const listing: BazaarListing = {
          id: makeId("baz"),
          itemId: eggId,
          itemType: "egg",
          sellerId: player.id,
          sellerName: player.name,
          price,
          listedAt: Date.now(),
          type: "fixed",
        };
        set({
          bazaarListings: [listing, ...get().bazaarListings],
          player: { ...player, eggs: player.eggs.filter((e) => e.id !== eggId) },
        });
        get().pushToast({ title: `Egg listed for ${price} GOLD.`, variant: "success" });
      },

      buyBazaarListing: (listingId) => {
        const player = get().player;
        if (!player) return false;
        const listing = get().bazaarListings.find((l) => l.id === listingId);
        if (!listing) return false;
        // You cannot buy your own listing. For a crab, the listed crab is
        // still in your roster, so a self-purchase appended a second copy
        // of it (net cost: the fee only); for either item type it also
        // farmed the bazaar_trade quest for free.
        if (listing.sellerId === "player") {
          get().pushToast({ title: "You can't buy your own listing.", variant: "warning" });
          return false;
        }
        // SYSTEM (NPC) listings float with the price index; player-set
        // prices never do. At index 1 the price is exactly as listed.
        const price = effectiveListingPrice(
          listing,
          economyOf(player).priceIndex
        );
        if (player.gold < price) {
          get().pushToast({ title: "Not enough GOLD.", variant: "error" });
          return false;
        }
        const fee = Math.round(price * CONFIG.bazaarFeePercent);
        const sellerShare = price - fee;
        // transfer item
        if (listing.itemType === "crab") {
          let crab = NPC_CRAB_CACHE[listing.itemId];
          if (!crab) crab = player.crabs.find((c) => c.id === listing.itemId);
          if (!crab) return false;
          // reassign ownership
          const newCrab = { ...crab, ownerId: player.id, activity: "idle" as const, hireFee: undefined };
          set({
            player: {
              ...player,
              gold: player.gold - price,
              crabs: [...player.crabs, newCrab],
            },
          });
        } else {
          // egg
          let egg = NPC_EGG_CACHE[listing.itemId];
          if (!egg) {
            const p = get().player!;
            egg = p.eggs.find((e) => e.id === listing.itemId);
          }
          if (!egg) return false;
          const newEgg = { ...egg, ownerId: player.id };
          set({
            player: {
              ...player,
              gold: player.gold - price,
              eggs: [...player.eggs, newEgg],
            },
          });
        }
        // Market fee split (tokenomics): the fee total is unchanged
        // (seller still nets price − fee); of the price, 1.00pp flows
        // to the Tide Treasury and the remainder of the fee is burned.
        {
          const current = get().player!;
          const split = applyMarketFeeSplit(current, price, fee);
          if (split.treasuryShare > 0 || split.burned > 0) {
            set({ player: split.player });
          }
        }
        // if seller was player, credit them
        // TOKENOMICS EXEMPTION: seller proceeds are never tithed — the
        // market fee above is the seller's tax. (Unreachable today:
        // self-purchases are rejected above.)
        if (listing.sellerId === "player") {
          const p = get().player!;
          set({ player: { ...p, gold: p.gold + sellerShare } });
        }
        // remove listing
        set({ bazaarListings: get().bazaarListings.filter((l) => l.id !== listingId) });
        // quest
        const qp = get().player!.questProgress.map((q) =>
          q.questId === "bazaar_trade" ? { ...q, progress: Math.min(q.target, q.progress + 1) } : q
        );
        set({ player: { ...get().player!, questProgress: qp } });
        get().pushToast({
          title: `Purchase complete! -${price} GOLD`,
          description: `Fee: ${fee}`,
          variant: "success",
        });
        return true;
      },

      buyGenesisCrab: (genesisNumber) => {
        const player = get().player;
        if (!player) return false;
        // Genesis prices are system prices: they float with the
        // tokenomics price index (base price × index, index 1 = base).
        const priceIndex = economyOf(player).priceIndex;
        const result = attemptGenesisPurchase(player.gold, get().genesisSoldIds, genesisNumber, priceIndex);
        if (!result.ok) {
          const messages: Record<string, string> = {
            not_found: "Genesis Crab not found.",
            not_listed: "This Genesis Crab is in the reserve — not for sale.",
            already_sold: "This Genesis Crab has already been sold.",
          };
          if (result.reason === "insufficient_gold") {
            const g = attemptGenesisPurchase(Number.MAX_SAFE_INTEGER, [], genesisNumber, priceIndex);
            get().pushToast({
              title: "Not enough GOLD.",
              description: g.ok ? `This Genesis Crab costs ${g.price} GOLD — you have ${player.gold}.` : undefined,
              variant: "error",
            });
          } else {
            get().pushToast({ title: messages[result.reason], variant: "error" });
          }
          return false;
        }
        const newCrab = genesisToCrab(result.crab);
        const qp = player.questProgress.map((q) =>
          q.questId === "bazaar_trade" ? { ...q, progress: Math.min(q.target, q.progress + 1) } : q
        );
        // The Genesis sale carries the same Bazaar fee as a listing
        // sale → same tokenomics split (1.00pp of price to the Tide
        // Treasury, rest of the fee burned), folded into the ledger.
        const split = applyMarketFeeSplit(player, result.price, result.fee);
        set({
          genesisSoldIds: result.newSoldIds,
          player: {
            ...split.player,
            gold: result.newGold,
            crabs: [...player.crabs, newCrab],
            questProgress: qp,
            discoveredBreeds: [...new Set([...player.discoveredBreeds, result.crab.breedId])],
          },
        });
        get().pushToast({
          title: `Genesis #${result.crab.genesisNumber} is yours! -${result.price} GOLD`,
          description: `${result.crab.name} joins your roster. Bazaar fee sunk: ${result.fee} GOLD.`,
          variant: "success",
        });
        return true;
      },

      addGold: (amount) => {
        // Admin/debug mint (Admin Console). Left functional and NEVER
        // tithed, but it is not invisible money: positive amounts are
        // counted in the ledger as minted, negative as burned, so the
        // Economy Health numbers stay honest even for cheat gold.
        // Gameplay rewards must use creditGold instead. The supply
        // counters follow the CLAMPED supply delta, so even cheat gold
        // cannot push the ledger's circulating past the 21B cap (the
        // player's own balance is the admin's business; the world's
        // books stay constitutional).
        const player = get().player;
        if (!player) return;
        if (!Number.isFinite(amount) || amount === 0) return;
        const eco = economyOf(player);
        const appliedDelta = clampSupply(eco.circulating + amount) - eco.circulating;
        set({
          player: {
            ...player,
            gold: player.gold + amount,
            economy: {
              ...eco,
              totalMinted: eco.totalMinted + Math.max(0, appliedDelta),
              totalBurned: eco.totalBurned + Math.max(0, -appliedDelta),
              circulating: eco.circulating + appliedDelta,
            },
          },
        });
      },

      creditGold: (amount, opts) => {
        const player = get().player;
        if (!player) return { net: 0, tax: 0 };
        const r = applyGoldCredit(player, amount, opts);
        if (r.player !== player) set({ player: r.player });
        return { net: r.net, tax: r.tax };
      },

      claimLeviathanWin: () => {
        const player = get().player;
        if (!player) return { amount: 0, net: 0, tax: 0 };
        const now = Date.now();
        // Rolling 24h taper window — same lazy-reset pattern as the
        // daily dive cap. The tapered gross is credited through
        // applyGoldCredit, so the Tide Tithe applies AFTER the taper.
        const wins = leviathanWinsTodayOf(player, now);
        const resetAt =
          player.leviathanWinsResetAt && player.leviathanWinsResetAt > now
            ? player.leviathanWinsResetAt
            : now + 24 * 60 * 60 * 1000;
        const amount = leviathanWinAmount(wins);
        const r = applyGoldCredit(player, amount);
        set({
          player: {
            ...r.player,
            leviathanWinsToday: wins + 1,
            leviathanWinsResetAt: resetAt,
          },
        });
        return { amount, net: r.net, tax: r.tax };
      },

      refundGold: (amount) => {
        // Exempt own-money return (e.g. auction escrow refunds): the
        // debit that parked the gold was never counted as burned, so
        // the return is never counted as minted — and never tithed.
        const player = get().player;
        if (!player) return;
        if (!Number.isFinite(amount) || amount <= 0) return;
        set({ player: { ...player, gold: player.gold + amount } });
      },

      spendGold: (amount) => {
        const player = get().player;
        if (!player) return false;
        if (player.gold < amount) return false;
        set({ player: { ...player, gold: player.gold - amount } });
        return true;
      },

      // Guard Post level lives in the profile (persisted save). The
      // Defense Hub used to keep upgrades in modal-local state only, so
      // a paid upgrade silently evaporated when the modal closed.
      setGuardPostLevel: (level) => {
        const player = get().player;
        if (!player) return;
        const clamped = Math.max(0, Math.min(3, Math.floor(level)));
        set({ player: { ...player, guardPostLevel: clamped } });
      },

      addXp: (amount) => {
        const player = get().player;
        if (!player) return;
        set({ player: withXp(player, amount) });
      },

      claimQuest: (questId) => {
        const player = get().player;
        if (!player) return;
        const q = QUESTS.find((x) => x.id === questId);
        if (!q) return;
        const qp = player.questProgress.find((x) => x.questId === questId);
        if (!qp || qp.claimed || qp.progress < qp.target) return;
        // Quest rewards are faucet income → tithed/ledgered.
        const credited = applyGoldCredit(player, q.reward);
        set({
          player: {
            ...credited.player,
            questProgress: player.questProgress.map((x) =>
              x.questId === questId ? { ...x, claimed: true } : x
            ),
          },
        });
        get().pushToast({
          title: `Quest complete: +${credited.net} GOLD!`,
          description:
            credited.tax > 0 ? `Tide Tithe: −${credited.tax}` : undefined,
          variant: "success",
        });
      },

      progressQuest: (questId, amount = 1) => {
        const player = get().player;
        if (!player) return;
        const qp = player.questProgress.find((x) => x.questId === questId);
        if (!qp || qp.claimed) return;
        set({
          player: {
            ...player,
            questProgress: player.questProgress.map((x) =>
              x.questId === questId
                ? { ...x, progress: Math.min(x.target, x.progress + amount) }
                : x
            ),
          },
        });
      },

      tickTimers: () => {
        const player = get().player;
        if (!player) return;
        const now = Date.now();
        // check world sites for completion
        const newWorldSites = get().worldSites.map((s) => {
          if (s.state === "deployed" && s.deployTime && now >= s.deployTime + s.durationMs) {
            return { ...s, state: "completed" as const };
          }
          return s;
        });
        // check eggs for hatch readiness (auto-hatch not, just notify)
        const readyEggs = player.eggs.filter((e) => now >= e.hatchTime);
        // daily reset
        let dailyDiveCount = player.dailyDiveCount;
        let dailyDiveResetAt = player.dailyDiveResetAt;
        let raidEnergy = player.raidEnergy;
        let raidEnergyResetAt = player.raidEnergyResetAt;
        if (now >= dailyDiveResetAt) {
          dailyDiveCount = 0;
          dailyDiveResetAt = now + 24 * 60 * 60 * 1000;
        }
        if (now >= raidEnergyResetAt) {
          raidEnergy = CONFIG.dailyRaidEnergy;
          raidEnergyResetAt = now + 24 * 60 * 60 * 1000;
        }
        // TIDE TAX (hoard tax): lazily assessed on this same tick —
        // once per rolling 7-day window, TIDE_TAX_RATE of the balance
        // above CONFIG.tideTaxThreshold, 100% to the Tide Treasury.
        // Always surfaced with a toast when levied; never silent.
        const tide = applyTideTax(
          {
            ...player,
            dailyDiveCount,
            dailyDiveResetAt,
            raidEnergy,
            raidEnergyResetAt,
          },
          now
        );
        // LEVIATHAN TAPER window: rolling 24h, same lazy-reset pattern
        // as the daily dive cap. Expired window → wins back to 0 and
        // the first win of the new window pays in full again.
        let leviathanPlayer = tide.player;
        if (
          !leviathanPlayer.leviathanWinsResetAt ||
          now >= leviathanPlayer.leviathanWinsResetAt
        ) {
          leviathanPlayer = {
            ...leviathanPlayer,
            leviathanWinsToday: 0,
            leviathanWinsResetAt: now + 24 * 60 * 60 * 1000,
          };
        }
        // SUPPLY CONSTITUTION (tokenomics v2): NOTHING is minted by
        // the passage of time — GOLD is created only as gameplay
        // rewards. This tick merely (a) rolls the 365-day minting
        // window when it has elapsed (re-basing the 3% speed limit on
        // current supply; the roll itself creates nothing) and
        // (b) lets the price index re-read realized, purely
        // gameplay-driven growth on its 30-day window. The Economy
        // Health dashboard publishes the resulting numbers.
        const rolled = rollEmissionWindow(leviathanPlayer, now);
        const indexed = applyPriceIndex(rolled.player, now);
        set({
          worldSites: newWorldSites,
          player: indexed.player,
        });
        if (tide.tax > 0) {
          get().pushToast({
            title: `Tide Tax: −${tide.tax.toLocaleString()} GOLD to the Tide Treasury`,
            description: `Weekly levy: ${Math.round(TIDE_TAX_RATE * 100)}% of your balance above ${CONFIG.tideTaxThreshold.toLocaleString()} GOLD. Your first ${CONFIG.tideTaxThreshold.toLocaleString()} is never taxed.`,
            variant: "warning",
          });
        }
      },

      completeTutorial: () => {
        const player = get().player;
        if (!player) return;
        const qp = player.questProgress.map((q) =>
          q.questId === "first_dive" ? { ...q, progress: Math.min(q.target, q.progress + 1) } : q
        );
        set({ player: { ...player, tutorialComplete: true, questProgress: qp } });
      },

      graduateCrab: (crabId) => {
        const player = get().player;
        if (!player) return;
        const crabs = player.crabs.map((c) =>
          c.id === crabId ? { ...c, isRookie: false } : c
        );
        set({ player: { ...player, crabs } });
        get().pushToast({ title: "Crab graduated! Now fully tradable.", variant: "success" });
      },
    }),
    {
      name: "crabtopia-save",
      storage: createJSONStorage(() => {
        if (typeof window === "undefined") {
          return {
            getItem: () => null,
            setItem: () => {},
            removeItem: () => {},
          };
        }
        return window.localStorage;
      }),
      partialize: (state) => ({
        player: state.player,
        worldSites: state.worldSites,
        hallListings: state.hallListings,
        bazaarListings: state.bazaarListings,
        genesisSoldIds: state.genesisSoldIds,
        currentScreen: state.currentScreen,
      }),
      // The store's breed() returns nursery parents to idle via a 30s
      // setTimeout. A page reload inside that window loses the timeout and
      // used to leave the parents stuck in "nursery" forever (they could
      // never be deployed, bred, or sold again). On rehydrate, any crab
      // still marked "nursery" is released to idle — the rest period is
      // far shorter than any reload, so this is always the correct call.
      onRehydrateStorage: () => {
        return (state) => {
          if (!state?.player) return;
          const hasStuck = state.player.crabs.some(
            (c) => c.activity === "nursery",
          );
          if (!hasStuck) return;
          useGame.setState({
            player: {
              ...state.player,
              crabs: state.player.crabs.map((c) =>
                c.activity === "nursery"
                  ? { ...c, activity: "idle" as const }
                  : c
              ),
            },
          });
        };
      },
    }
  )
);

// Helper hook to get crabs for display (player + selected NPC)
export function getCrabById(id: string, player: PlayerProfile | null): Crab | null {
  if (!player) return null;
  const own = player.crabs.find((c) => c.id === id);
  if (own) return own;
  return NPC_CRAB_CACHE[id] ?? null;
}
