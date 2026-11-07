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
import { CONFIG, QUESTS } from "../engine/config";
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
  spendGold: (amount: number) => boolean;
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
        if (player.teams.length >= 7) {
          get().pushToast({ title: "Team limit reached (7).", variant: "error" });
          return "";
        }
        // extra slots beyond 5 cost gold
        if (player.teams.length >= 5) {
          const cost = [50000, 120000][player.teams.length - 5];
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
        set({
          worldSites: newWorldSites,
          player: {
            ...player,
            gold: player.gold + totalReward,
            crabs,
            digSites,
            questProgress: qp,
            shellwardenXp: player.shellwardenXp + 50,
          },
        });
        get().pushToast({
          title: `+${totalReward} GOLD claimed!`,
          description: bonus > 0 ? `Gildclaw bonus: +${bonus}` : undefined,
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
        set({
          worldSites: newWorldSites,
          player: { ...player, gold: player.gold + partial, crabs },
        });
        get().pushToast({
          title: `Retreated with ${partial} GOLD (partial).`,
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
        // get defender crabs - they're NPC crabs
        const defenderSeed = parseInt(site.id.replace("site_", ""), 10) + 2000;
        const defenderTeam = generateNpcTeam(defenderSeed, site.bpBracket);
        // for player raids, get player crabs
        const raiderCrabs = raiderCrabIds
          .map((id) => player.crabs.find((c) => c.id === id))
          .filter(Boolean) as Crab[];
        if (raiderCrabs.length !== 5) {
          get().pushToast({ title: "Need 5 raider crabs.", variant: "error" });
          return null;
        }
        // add reinforcements (player's own or hired NPC)
        const reinforcementCrabs: Crab[] = [];
        for (const rid of reinforcements) {
          const own = player.crabs.find((c) => c.id === rid);
          if (own) reinforcementCrabs.push(own);
          else if (NPC_CRAB_CACHE[rid]) reinforcementCrabs.push(NPC_CRAB_CACHE[rid]);
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

        // Determine rewards
        const stolenAmount = result.winner === "raider"
          ? Math.round(site.rewardRemaining * (player.insuranceActive ? 0.5 : CONFIG.raidStealPercent))
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
          raiderReinforcementIds: reinforcements,
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

        set({
          worldSites: newWorldSites,
          player: {
            ...player,
            gold: player.gold + totalRaiderReward,
            raidEnergy: player.raidEnergy - 1,
            raids: [raid, ...player.raids].slice(0, 20),
            questProgress: qp,
            shellwardenXp: player.shellwardenXp + (result.winner === "raider" ? 80 : 30),
          },
          battleReplay: raid,
        });

        get().pushToast({
          title: result.winner === "raider" ? `Raid won! +${totalRaiderReward} GOLD` : `Raid lost. +${participationReward} GOLD participation`,
          description: `Raider BP ${result.raiderTotalBP} vs Defender BP ${result.defenderTotalBP}`,
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
        // burn half of platform fee, half to community pool (we just remove it)
        const burned = Math.round(platformFee / 2);
        set({
          player: { ...player, gold: player.gold - fee },
          hallListings: get().hallListings.filter((l) => l.id !== listingId),
        });
        // if owned by NPC, owner share is sunk (no actual player to credit). For player-owned, credit them.
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
          player: {
            ...player,
            gold: player.gold - cost,
            crabs,
            eggs: [...player.eggs, egg],
            questProgress: qp,
            shellwardenXp: player.shellwardenXp + 100,
          },
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
          player: {
            ...player,
            crabs: [...player.crabs, crab],
            eggs: player.eggs.filter((e) => e.id !== eggId),
            questProgress: qp,
            shellwardenXp: player.shellwardenXp + 150,
            discoveredBreeds: [...new Set([...player.discoveredBreeds, crab.breedId])],
          },
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
        if (player.gold < listing.price) {
          get().pushToast({ title: "Not enough GOLD.", variant: "error" });
          return false;
        }
        const fee = Math.round(listing.price * CONFIG.bazaarFeePercent);
        const sellerShare = listing.price - fee;
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
              gold: player.gold - listing.price,
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
              gold: player.gold - listing.price,
              eggs: [...player.eggs, newEgg],
            },
          });
        }
        // if seller was player, credit them
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
          title: `Purchase complete! -${listing.price} GOLD`,
          description: `Fee: ${fee}`,
          variant: "success",
        });
        return true;
      },

      buyGenesisCrab: (genesisNumber) => {
        const player = get().player;
        if (!player) return false;
        const result = attemptGenesisPurchase(player.gold, get().genesisSoldIds, genesisNumber);
        if (!result.ok) {
          const messages: Record<string, string> = {
            not_found: "Genesis Crab not found.",
            not_listed: "This Genesis Crab is in the reserve — not for sale.",
            already_sold: "This Genesis Crab has already been sold.",
          };
          if (result.reason === "insufficient_gold") {
            const g = attemptGenesisPurchase(Number.MAX_SAFE_INTEGER, [], genesisNumber);
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
        set({
          genesisSoldIds: result.newSoldIds,
          player: {
            ...player,
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
        const player = get().player;
        if (!player) return;
        set({ player: { ...player, gold: player.gold + amount } });
      },

      spendGold: (amount) => {
        const player = get().player;
        if (!player) return false;
        if (player.gold < amount) return false;
        set({ player: { ...player, gold: player.gold - amount } });
        return true;
      },

      addXp: (amount) => {
        const player = get().player;
        if (!player) return;
        const newXp = player.shellwardenXp + amount;
        let newLevel = player.shellwardenLevel;
        while (newXp >= newLevel * 500) {
          newLevel++;
        }
        set({ player: { ...player, shellwardenXp: newXp, shellwardenLevel: newLevel } });
      },

      claimQuest: (questId) => {
        const player = get().player;
        if (!player) return;
        const q = QUESTS.find((x) => x.id === questId);
        if (!q) return;
        const qp = player.questProgress.find((x) => x.questId === questId);
        if (!qp || qp.claimed || qp.progress < qp.target) return;
        set({
          player: {
            ...player,
            gold: player.gold + q.reward,
            questProgress: player.questProgress.map((x) =>
              x.questId === questId ? { ...x, claimed: true } : x
            ),
          },
        });
        get().pushToast({ title: `Quest complete: +${q.reward} GOLD!`, variant: "success" });
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
        set({
          worldSites: newWorldSites,
          player: {
            ...player,
            dailyDiveCount,
            dailyDiveResetAt,
            raidEnergy,
            raidEnergyResetAt,
          },
        });
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
