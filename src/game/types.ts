// Crabtopia - Core Type Definitions
// All types shared across the game engine and UI

export type FactionId =
  | "coral_court"
  | "cinderreef"
  | "frostshelf"
  | "mangrove"
  | "stormwake"
  | "moonpool";

export type ClassId =
  | "bulwark"
  | "reaver"
  | "skitter"
  | "tidecaller"
  | "shellmender"
  | "pincher"
  | "warden"
  | "gildclaw";

/** The 18 elements (engine/elements.ts) — original ocean-kingdom names. */
export type ElementId =
  | "vulkara" | "nerala" | "bentala" | "lintara" | "anila"
  | "himara" | "rimba" | "magmara" | "taufan" | "dentuma" | "vapora" | "lodara"
  | "pulvara" | "terika" | "obsidara" | "prismara" | "andhakara" | "waja";

export type BodyPartSlot =
  | "eyes"
  | "mouth"
  | "shell"
  | "claws"
  | "crest"
  | "legs";

export type Rarity = "common" | "uncommon" | "rare" | "epic" | "legendary";

export type Activity =
  | "idle"
  | "diving"
  | "raiding"
  | "hired"
  | "nursery"
  | "resting";

export interface GeneSlot {
  D: string;
  R1: string;
  R2: string;
  rarity: Rarity;
}

export interface CrabStats {
  hp: number;
  attack: number;
  defense: number;
  speed: number;
  skill: number;
}

export interface Crab {
  id: string;
  name: string;
  faction: FactionId;
  classId: ClassId;
  breedId: string;
  generation: number;
  level: number;
  xp: number;
  stats: CrabStats;
  genes: Record<BodyPartSlot, GeneSlot>;
  purity: number;
  breedCount: number;
  birthTime: number;
  parentIds: string[];
  visualSeed: number;
  activity: Activity;
  hireFee?: number;
  ownerId: string;
  isRookie: boolean;
  /**
   * The crab's element (engine/elements.ts). OPTIONAL + additive:
   * legacy saves without it stay valid — elementOf() derives the same
   * element deterministically from class/faction/breed.
   */
  element?: ElementId;
  hiredUntil?: number;
  masteryBadges: string[];
  moltTier: number;
}

export type FormationPresetId =
  | "balanced"
  | "offensive"
  | "defensive"
  | "frontline"
  | "backline"
  | "custom";

export interface Team {
  id: string;
  name: string;
  crabIds: string[];
  createdAt: number;
  /**
   * Saved tactical formation (front/mid/back crab-id rows). Optional and
   * additive: legacy saves without it derive a formation from the slot
   * order + formationPreset (see engine/formation.ts resolveTeamFormation).
   */
  formation?: Formation;
  /** Last preset applied to this team ("custom" after manual repositioning). */
  formationPreset?: FormationPresetId;
}

export type DiveState =
  | "deployed"
  | "raided"
  | "resolving"
  | "completed"
  | "claimed";

export interface DigSite {
  id: string;
  name: string;
  biome: FactionId;
  pos: { x: number; y: number };
  occupiedBy?: string;
  occupierName?: string;
  teamId?: string;
  deployTime?: number;
  durationMs: number;
  state: DiveState;
  baseReward: number;
  raidCount: number;
  rewardRemaining: number;
  raidShieldUntil?: number;
  isTutorial?: boolean;
  ownerIsPlayer?: boolean;
  bpBracket: number;
}

export interface Raid {
  id: string;
  siteId: string;
  raiderTeamId: string;
  raiderName: string;
  raiderCrabIds: string[];
  defenderCrabIds: string[];
  raiderReinforcementIds: string[];
  defenderReinforcementIds: string[];
  startTime: number;
  durationMs: number;
  state: "preparing" | "resolved" | "claimed";
  result?: RaidResult;
  tacticCard?: TacticCardId;
  defenderTactic?: TacticCardId;
  formation?: Formation;
}

export interface RaidResult {
  winner: "raider" | "defender";
  raiderBP: number;
  defenderBP: number;
  stolenAmount: number;
  participationReward: number;
  breakdown: BattleBreakdown;
  events: BattleEvent[];
  seed: number;
}

export interface BattleBreakdown {
  baseBP: { raider: number; defender: number };
  factionBonus: { raider: number; defender: number };
  classSynergy: { raider: number; defender: number };
  passiveBonus: { raider: number; defender: number };
  wheelModifier: { raider: number; defender: number };
  tacticModifier: { raider: number; defender: number };
  variance: { raider: number; defender: number };
  total: { raider: number; defender: number };
}

export interface BattleEvent {
  turn: number;
  actorId: string;
  actorSide: "raider" | "defender";
  skillId?: string;
  targetId?: string;
  targetSide?: "raider" | "defender";
  damage?: number;
  heal?: number;
  effect?: string;
  message: string;
}

export type TacticCardId =
  | "ambush"
  | "fortify"
  | "blitz"
  | "siphon"
  | "bait"
  | "counter";

export interface Formation {
  front: string[];
  mid: string[];
  back: string[];
}

export interface Egg {
  id: string;
  parentId: string[];
  faction: FactionId;
  classId: ClassId;
  /** Child element rolled at breed time (additive; old eggs derive it). */
  element?: ElementId;
  genePreview: Record<BodyPartSlot, GeneSlot>;
  hatchTime: number;
  createdTime: number;
  ownerId: string;
  name: string;
  isLegendaryCandidate: boolean;
}

export interface HallListing {
  id: string;
  crabId: string;
  ownerId: string;
  ownerName: string;
  hireFee: number;
  listedAt: number;
  restUntil?: number;
}

export interface BazaarListing {
  id: string;
  itemId: string;
  itemType: "crab" | "egg";
  sellerId: string;
  sellerName: string;
  price: number;
  listedAt: number;
  type: "fixed" | "auction";
  settlingUntil?: number;
}

export interface QuestProgress {
  questId: string;
  progress: number;
  target: number;
  claimed: boolean;
}

export interface PlayerProfile {
  id: string;
  name: string;
  gold: number;
  crabs: Crab[];
  teams: Team[];
  eggs: Egg[];
  digSites: DigSite[];
  hallListings: HallListing[];
  raids: Raid[];
  tidelordRank: number;
  shellwardenLevel: number;
  shellwardenXp: number;
  lastLogin: number;
  loginStreak: number;
  dailyDiveCount: number;
  dailyDiveResetAt: number;
  raidEnergy: number;
  raidEnergyResetAt: number;
  tutorialComplete: boolean;
  questProgress: QuestProgress[];
  discoveredBreeds: string[];
  discoveredLegendaries: string[];
  insuranceActive: boolean;
  guardPostLevel: number;
  ownedPlots: string[];
  createdAt: number;
}

export interface BattleConfig {
  diveDurationMs: number;
  tutorialDiveMs: number;
  raidDurationMs: number;
  raidWithReinforcementMs: number;
  baseDiveReward: number;
  raidStealPercent: number;
  raidParticipationPercent: number;
  defenderFloorPercent: number;
  hallFeePercent: number;
  bazaarFeePercent: number;
  maxBreedCount: number;
  eggHatchMs: number;
  maxReinforcements: number;
  dailyDiveCap: number;
  dailyRaidEnergy: number;
  legendaryPartChance: number;
  mutationChance: number;
  variancePercent: number;
  tideTaxThreshold: number;
}
