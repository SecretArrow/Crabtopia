// Crabtopia - Live Raid Spectate Modal
// Self-contained "live raid spectate" overlay: mocks 4 concurrent in-progress
// raids streamed via setInterval (game is client-only, no real WebSocket).
// Plays a scripted 8-15s cinematic per raid: skirmish -> reinforcement ->
// final defeat, then result banner. Streamer overlay + speed control + MVP.
// Spec section 4.5.1 & 10B problem 8.

"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useGame } from "../store/gameStore";
import { FACTIONS } from "../content/factions";
import { CLASSES } from "../content/classes";
import { FactionId, ClassId } from "../types";
import {
  GlassPanel,
  GlowButton,
  StatChip,
  SectionTitle,
  GoldIcon,
  formatGold,
  formatTime,
  EmptyState,
  FactionBadge,
  ClassIcon,
  emblemArt,
  factionColor,
  factionAccent,
} from "./ui";
import CrabSheetSprite from "../animation/CrabSheetSprite";

// ---------- LOCAL TYPES ----------

interface RaidCrab {
  id: string;
  name: string;
  classId: ClassId;
  faction: FactionId;
  bp: number;
  maxHp: number;
  hp: number;
  defeated: boolean;
  damageDealt: number;
  reinforced?: boolean;
}

interface LiveRaid {
  id: string;
  raiderName: string;
  raiderFaction: FactionId;
  raiderTeam: RaidCrab[];
  defenderName: string;
  defenderFaction: FactionId;
  defenderTeam: RaidCrab[];
  siteCoord: string;
  biomeName: string;
  potGold: number;
  startedAt: number;
  spectators: number;
  phase: "skirmish" | "reinforcement" | "final";
  raiderWins: boolean;
}

interface RaidEvent {
  id: string;
  t: number; // ms since start
  side: "raider" | "defender";
  actorName: string;
  classId: ClassId;
  skillName: string;
  targetName: string;
  targetSide: "raider" | "defender";
  targetIndex: number;
  damage?: number;
  heal?: number;
  effect?: "defeated" | "reinforced" | "stunned" | "shielded";
  message: string;
}

interface VfxInstance {
  id: string;
  targetSide: "raider" | "defender";
  targetIndex: number;
  type: "damage" | "heal" | "defeated";
  value: number;
}

// ---------- CONSTANTS ----------

const GOLD = "#FFD166";
const LIVE_RED = "#FF6F6F";
const TIDE_TEAL = "#7CF5E1";

const RAIDER_NAME_POOL = [
  "Saltspine Syndicate",
  "Cinder Brood",
  "Frost Vanguard",
  "Moonveil Band",
];
const DEFENDER_NAME_POOL = [
  "Coral Court",
  "Mossroot Watch",
  "Stormcall Cabal",
  "Emberpact",
];
const CRAB_NAME_FRAGMENTS = [
  "Brine",
  "Reef",
  "Tide",
  "Shell",
  "Storm",
  "Salt",
  "Coral",
  "Moss",
  "Lava",
  "Frost",
  "Moon",
  "Pinch",
  "Snap",
  "Claw",
  "Carve",
  "Rend",
];
const RESERVE_NAME = "Saltshell Reserve";

const ALL_CLASSES: ClassId[] = [
  "bulwark",
  "reaver",
  "skitter",
  "tidecaller",
  "shellmender",
  "pincher",
  "warden",
  "gildclaw",
];

const FACTION_LIST: FactionId[] = [
  "coral_court",
  "cinderreef",
  "frostshelf",
  "mangrove",
  "stormwake",
  "moonpool",
];

const BIOME_NAMES: Record<FactionId, string> = {
  coral_court: "Coral Court biome",
  cinderreef: "Cinderreef biome",
  frostshelf: "Frostshelf biome",
  mangrove: "Mangrove biome",
  stormwake: "Stormwake biome",
  moonpool: "Moonpool biome",
};

// ---------- MOCK DATA ----------

let crabIdCounter = 0;
function makeCrab(classId: ClassId, faction: FactionId, nameSeed: number): RaidCrab {
  const cls = CLASSES[classId];
  const hp = Math.round(cls.baseStats.hp * 1.4 + (nameSeed % 3) * 30);
  const bp = 1500 + (nameSeed % 5) * 180;
  const fragA = CRAB_NAME_FRAGMENTS[nameSeed % CRAB_NAME_FRAGMENTS.length];
  const fragB = CRAB_NAME_FRAGMENTS[(nameSeed * 7 + 3) % CRAB_NAME_FRAGMENTS.length];
  return {
    id: `crab-${crabIdCounter++}`,
    name: `${fragA}${fragB}`,
    classId,
    faction,
    bp,
    maxHp: hp,
    hp,
    defeated: false,
    damageDealt: 0,
  };
}

function makeTeam(faction: FactionId, seed: number): RaidCrab[] {
  // pick 3 distinct classes deterministically
  const picks: ClassId[] = [];
  for (let i = 0; i < 3; i++) {
    const idx = (seed * 3 + i * 5 + 1) % ALL_CLASSES.length;
    const c = ALL_CLASSES[idx];
    if (!picks.includes(c)) picks.push(c);
    else picks.push(ALL_CLASSES[(idx + 2) % ALL_CLASSES.length]);
  }
  return picks.map((c, i) => makeCrab(c, faction, seed * 3 + i));
}

function makeMockRaids(): LiveRaid[] {
  const now = Date.now();
  const configs: Array<{
    rName: string;
    rFac: FactionId;
    dName: string;
    dFac: FactionId;
    coord: string;
    pot: number;
    raiderWins: boolean;
    startedAgo: number;
    specs: number;
    phase: LiveRaid["phase"];
  }> = [
    {
      rName: RAIDER_NAME_POOL[0],
      rFac: "stormwake",
      dName: DEFENDER_NAME_POOL[0],
      dFac: "coral_court",
      coord: "Site C-3",
      pot: 4200,
      raiderWins: true,
      startedAgo: 42000,
      specs: 814,
      phase: "skirmish",
    },
    {
      rName: RAIDER_NAME_POOL[1],
      rFac: "cinderreef",
      dName: DEFENDER_NAME_POOL[1],
      dFac: "mangrove",
      coord: "Site V-7",
      pot: 6800,
      raiderWins: false,
      startedAgo: 67000,
      specs: 1247,
      phase: "reinforcement",
    },
    {
      rName: RAIDER_NAME_POOL[2],
      rFac: "frostshelf",
      dName: DEFENDER_NAME_POOL[2],
      dFac: "stormwake",
      coord: "Site F-2",
      pot: 5500,
      raiderWins: true,
      startedAgo: 91000,
      specs: 538,
      phase: "final",
    },
    {
      rName: RAIDER_NAME_POOL[3],
      rFac: "moonpool",
      dName: DEFENDER_NAME_POOL[3],
      dFac: "cinderreef",
      coord: "Site M-9",
      pot: 3400,
      raiderWins: false,
      startedAgo: 28000,
      specs: 248,
      phase: "skirmish",
    },
  ];
  return configs.map((c, i) => ({
    id: `live-raid-${i + 1}`,
    raiderName: c.rName,
    raiderFaction: c.rFac,
    raiderTeam: makeTeam(c.rFac, i * 11 + 3),
    defenderName: c.dName,
    defenderFaction: c.dFac,
    defenderTeam: makeTeam(c.dFac, i * 13 + 7),
    siteCoord: c.coord,
    biomeName: BIOME_NAMES[c.dFac],
    potGold: c.pot,
    startedAt: now - c.startedAgo,
    spectators: c.specs,
    phase: c.phase,
    raiderWins: c.raiderWins,
  }));
}

// ---------- SCRIPTED EVENT SEQUENCE ----------

function buildScript(raid: LiveRaid): RaidEvent[] {
  const events: RaidEvent[] = [];
  let t = 0;
  let idx = 0;

  const mk = (e: Omit<RaidEvent, "id" | "t">): RaidEvent => ({
    ...e,
    id: `${raid.id}-evt-${idx++}`,
    t,
  });
  const advance = () => {
    t += 1400 + Math.floor(Math.random() * 400);
  };

  const rActors = raid.raiderTeam;
  const dActors = raid.defenderTeam;
  const killerSide: "raider" | "defender" = raid.raiderWins ? "raider" : "defender";
  const victimSide: "raider" | "defender" = raid.raiderWins ? "defender" : "raider";
  const killerTeam = killerSide === "raider" ? rActors : dActors;
  const victimTeam = victimSide === "raider" ? rActors : dActors;
  const killer = killerTeam[0];
  const victim = victimTeam[1] ?? victimTeam[0];

  // --- Phase 1: Skirmish (3 alternating damage events) ---
  for (let i = 0; i < 3; i++) {
    const side: "raider" | "defender" = i % 2 === 0 ? "raider" : "defender";
    const actorTeam = side === "raider" ? rActors : dActors;
    const actor = actorTeam[i % actorTeam.length];
    const tSide: "raider" | "defender" = side === "raider" ? "defender" : "raider";
    const tTeam = tSide === "raider" ? rActors : dActors;
    const target = tTeam[i % tTeam.length];
    const damage = 70 + Math.floor(Math.random() * 50);
    const skill = CLASSES[actor.classId].activeSkill.name;
    advance();
    events.push(
      mk({
        side,
        actorName: actor.name,
        classId: actor.classId,
        skillName: skill,
        targetName: target.name,
        targetSide: tSide,
        targetIndex: tTeam.indexOf(target),
        damage,
        message: `${actor.name} lands ${skill} on ${target.name} for ${damage} damage.`,
      }),
    );
  }

  // --- Phase 2: Reinforcement (1 reinforce + 2 damage) ---
  advance();
  events.push(
    mk({
      side: "raider",
      actorName: RESERVE_NAME,
      classId: "pincher",
      skillName: "Reinforce",
      targetName: raid.raiderName,
      targetSide: "raider",
      targetIndex: -1,
      effect: "reinforced",
      message: `${RESERVE_NAME} scuttles in from the flank to reinforce the raiders!`,
    }),
  );

  for (let i = 0; i < 2; i++) {
    const side: "raider" | "defender" = i % 2 === 0 ? "defender" : "raider";
    const actorTeam = side === "raider" ? rActors : dActors;
    const actor = actorTeam[(i + 1) % actorTeam.length];
    const tSide: "raider" | "defender" = side === "raider" ? "defender" : "raider";
    const tTeam = tSide === "raider" ? rActors : dActors;
    const target = tTeam[(i + 2) % tTeam.length];
    const damage = 90 + Math.floor(Math.random() * 70);
    const skill = CLASSES[actor.classId].activeSkill.name;
    advance();
    events.push(
      mk({
        side,
        actorName: actor.name,
        classId: actor.classId,
        skillName: skill,
        targetName: target.name,
        targetSide: tSide,
        targetIndex: tTeam.indexOf(target),
        damage,
        message: `${actor.name} unleashes ${skill} on ${target.name} for ${damage} damage.`,
      }),
    );
  }

  // --- Phase 3: Final (killing blow) ---
  advance();
  const skill = CLASSES[killer.classId].activeSkill.name;
  events.push(
    mk({
      side: killerSide,
      actorName: killer.name,
      classId: killer.classId,
      skillName: skill,
      targetName: victim.name,
      targetSide: victimSide,
      targetIndex: victimTeam.indexOf(victim),
      damage: 9999,
      effect: "defeated",
      message: `${killer.name} lands the killing blow on ${victim.name}! ${
        killerSide === "raider" ? raid.raiderName : raid.defenderName
      } wins the raid!`,
    }),
  );

  return events;
}

// Map script index -> raid phase
function phaseForScriptIndex(scriptLen: number, idx: number): LiveRaid["phase"] {
  // 3 skirmish + 1 reinforce + 2 damage + 1 final = 7 events
  if (idx < 3) return "skirmish";
  if (idx < 6) return "reinforcement";
  return "final";
}

// ---------- MAIN MODAL ----------

export default function LiveRaidSpectateModal({
  onClose,
}: {
  onClose: () => void;
}) {
  const player = useGame((s) => s.player);
  const pushToast = useGame((s) => s.pushToast);

  const [liveRaids] = useState<LiveRaid[]>(() => makeMockRaids());
  const [selectedRaidId, setSelectedRaidId] = useState<string | null>(null);
  const [phase, setPhase] = useState<"listing" | "spectating" | "result">(
    "listing",
  );
  const [eventLog, setEventLog] = useState<RaidEvent[]>([]);
  const [spectators, setSpectators] = useState<number>(0);
  const [elapsedMs, setElapsedMs] = useState<number>(0);
  const [raiderTeamLive, setRaiderTeamLive] = useState<RaidCrab[]>([]);
  const [defenderTeamLive, setDefenderTeamLive] = useState<RaidCrab[]>([]);
  const [activeVfx, setActiveVfx] = useState<VfxInstance[]>([]);
  const [speedMultiplier, setSpeedMultiplier] = useState<1 | 2 | 3>(1);
  const [streamerMode, setStreamerMode] = useState<boolean>(false);
  const [winnerSide, setWinnerSide] = useState<"raider" | "defender" | null>(
    null,
  );
  const [now, setNow] = useState<number>(Date.now());

  const scriptRef = useRef<RaidEvent[]>([]);
  const scriptIndexRef = useRef<number>(0);
  const logScrollRef = useRef<HTMLDivElement | null>(null);

  const selectedRaid = useMemo(
    () => liveRaids.find((r) => r.id === selectedRaidId) ?? null,
    [liveRaids, selectedRaidId],
  );

  // Tick `now` every 1s for listing-view elapsed times
  useEffect(() => {
    const i = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(i);
  }, []);

  // Escape key closes
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Reset state when selectedRaidId changes
  useEffect(() => {
    if (!selectedRaidId) {
      setPhase("listing");
      setEventLog([]);
      setElapsedMs(0);
      setSpectators(0);
      setRaiderTeamLive([]);
      setDefenderTeamLive([]);
      setActiveVfx([]);
      setWinnerSide(null);
      scriptRef.current = [];
      scriptIndexRef.current = 0;
      return;
    }
    const raid = liveRaids.find((r) => r.id === selectedRaidId);
    if (!raid) return;
    setRaiderTeamLive(raid.raiderTeam.map((c) => ({ ...c, hp: c.maxHp, defeated: false, damageDealt: 0 })));
    setDefenderTeamLive(raid.defenderTeam.map((c) => ({ ...c, hp: c.maxHp, defeated: false, damageDealt: 0 })));
    setEventLog([]);
    setElapsedMs(0);
    setSpectators(raid.spectators);
    setActiveVfx([]);
    setWinnerSide(null);
    scriptRef.current = buildScript(raid);
    scriptIndexRef.current = 0;
    setPhase("spectating");
  }, [selectedRaidId, liveRaids]);

  // Trigger VFX for an event
  const triggerVfx = useCallback((evt: RaidEvent) => {
    if (evt.effect === "reinforced") return;
    const id = `${evt.id}-vfx-${Math.random().toString(36).slice(2, 8)}`;
    const type: VfxInstance["type"] =
      evt.effect === "defeated" ? "defeated" : evt.damage ? "damage" : "heal";
    const value = evt.damage ?? evt.heal ?? 0;
    const inst: VfxInstance = {
      id,
      targetSide: evt.targetSide,
      targetIndex: evt.targetIndex,
      type,
      value,
    };
    setActiveVfx((v) => [...v, inst]);
    setTimeout(() => {
      setActiveVfx((v) => v.filter((x) => x.id !== id));
    }, 900);
  }, []);

  // Dequeue next scripted event + apply state changes
  const dequeueNext = useCallback(() => {
    const script = scriptRef.current;
    const i = scriptIndexRef.current;
    if (i >= script.length) return;
    const evt = script[i];
    scriptIndexRef.current = i + 1;

    if (evt.effect === "reinforced") {
      // Add a reinforcement crab to raider team
      const reserveClass: ClassId = "pincher";
      const newCrab: RaidCrab = {
        id: `reserve-${Date.now()}`,
        name: RESERVE_NAME,
        classId: reserveClass,
        faction: selectedRaid?.raiderFaction ?? "stormwake",
        bp: 1650,
        maxHp: 460,
        hp: 460,
        defeated: false,
        damageDealt: 0,
        reinforced: true,
      };
      setRaiderTeamLive((team) => [...team, newCrab]);
    } else if (evt.damage && evt.damage > 0) {
      const dmg = evt.damage;
      const applyDamage = (team: RaidCrab[]) =>
        team.map((c, idx) => {
          if (idx !== evt.targetIndex) return c;
          const newHp = Math.max(0, c.hp - dmg);
          const defeated = newHp <= 0 || evt.effect === "defeated";
          return { ...c, hp: newHp, defeated };
        });
      if (evt.targetSide === "raider") {
        setRaiderTeamLive(applyDamage);
      } else {
        setDefenderTeamLive(applyDamage);
      }
    } else if (evt.heal && evt.heal > 0) {
      const heal = evt.heal;
      const applyHeal = (team: RaidCrab[]) =>
        team.map((c, idx) => {
          if (idx !== evt.targetIndex) return c;
          const newHp = Math.min(c.maxHp, c.hp + heal);
          return { ...c, hp: newHp };
        });
      if (evt.targetSide === "raider") setRaiderTeamLive(applyHeal);
      else setDefenderTeamLive(applyHeal);
    }

    // Track damage dealer
    if (evt.damage) {
      const dmg = evt.damage;
      const creditDamage = (team: RaidCrab[]) =>
        team.map((c) =>
          c.name === evt.actorName
            ? { ...c, damageDealt: c.damageDealt + Math.min(dmg, 600) }
            : c,
        );
      if (evt.side === "raider") setRaiderTeamLive(creditDamage);
      else setDefenderTeamLive(creditDamage);
    }

    // Trigger VFX
    triggerVfx(evt);

    // Append to log (keep last 8)
    setEventLog((log) => [...log.slice(-7), evt]);

    // Phase transition on final event
    if (evt.effect === "defeated" || i + 1 >= script.length) {
      const winner: "raider" | "defender" = evt.side;
      setWinnerSide(winner);
      setPhase("result");
      setTimeout(() => {
        pushToast({
          title: "Highlight auto-clipped",
          description: "Biggest upset of the day!",
          variant: "success",
        });
      }, 1500);
    }
  }, [selectedRaid, triggerVfx, pushToast]);

  // Spectator tick (every 3s / speed)
  useEffect(() => {
    if (phase !== "spectating" || !selectedRaidId) return;
    const i = setInterval(() => {
      setSpectators((s) => s + Math.floor(1 + Math.random() * 3));
    }, 3000 / speedMultiplier);
    return () => clearInterval(i);
  }, [phase, selectedRaidId, speedMultiplier]);

  // Elapsed timer (every 1s / speed)
  useEffect(() => {
    if (phase !== "spectating" || !selectedRaidId) return;
    const i = setInterval(() => {
      setElapsedMs((e) => e + 1000);
    }, 1000 / speedMultiplier);
    return () => clearInterval(i);
  }, [phase, selectedRaidId, speedMultiplier]);

  // Event dequeue (recursive timeout, randomized 1200-1800ms / speed)
  useEffect(() => {
    if (phase !== "spectating" || !selectedRaidId) return;
    let cancelled = false;
    let evtTimeout: ReturnType<typeof setTimeout>;
    const scheduleNext = () => {
      const delay = (1200 + Math.random() * 600) / speedMultiplier;
      evtTimeout = setTimeout(() => {
        if (cancelled) return;
        dequeueNext();
        scheduleNext();
      }, delay);
    };
    scheduleNext();
    return () => {
      cancelled = true;
      clearTimeout(evtTimeout);
    };
  }, [phase, selectedRaidId, speedMultiplier, dequeueNext]);

  // Auto-scroll event log to bottom
  useEffect(() => {
    if (logScrollRef.current) {
      logScrollRef.current.scrollTop = logScrollRef.current.scrollHeight;
    }
  }, [eventLog]);

  // Derived: current scripted phase
  const currentRaidPhase: LiveRaid["phase"] = useMemo(() => {
    if (!selectedRaid) return "skirmish";
    if (phase === "result") return "final";
    return phaseForScriptIndex(scriptRef.current.length, scriptIndexRef.current);
  }, [selectedRaid, phase, eventLog]);

  // Handlers
  const handleWatchLive = (raidId: string) => {
    setSelectedRaidId(raidId);
    setStreamerMode(false);
    setSpeedMultiplier(1);
    pushToast({
      title: "Joining live spectate",
      description: "Streaming compact event log from server...",
      variant: "default",
    });
  };

  const handleShareReplay = () => {
    if (!selectedRaid) return;
    pushToast({
      title: "Replay link copied",
      description: `crabtopia.example/r/${selectedRaid.id}`,
      variant: "success",
    });
  };

  const handleBackToListing = () => {
    setSelectedRaidId(null);
  };

  const handleWatchAgain = () => {
    if (!selectedRaid) return;
    // Re-init script for the same raid
    setRaiderTeamLive(
      selectedRaid.raiderTeam.map((c) => ({
        ...c,
        hp: c.maxHp,
        defeated: false,
        damageDealt: 0,
      })),
    );
    setDefenderTeamLive(
      selectedRaid.defenderTeam.map((c) => ({
        ...c,
        hp: c.maxHp,
        defeated: false,
        damageDealt: 0,
      })),
    );
    setEventLog([]);
    setElapsedMs(0);
    setSpectators(selectedRaid.spectators);
    setActiveVfx([]);
    setWinnerSide(null);
    scriptRef.current = buildScript(selectedRaid);
    scriptIndexRef.current = 0;
    setPhase("spectating");
  };

  // Aggregate stats for header
  const totalSpectators = useMemo(
    () => liveRaids.reduce((sum, r) => sum + r.spectators, 0),
    [liveRaids],
  );

  return (
    <div
      className="modal-backdrop-enter fixed inset-0 z-[150] flex items-center justify-center p-2 sm:p-4"
      style={{
        background: "rgba(4,16,32,0.78)",
        backdropFilter: "blur(8px)",
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Live Raid Spectate"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <style>{`
        @keyframes crab-scuttle-in {
          0% { transform: translateX(-180%) rotate(-8deg); opacity: 0; }
          60% { transform: translateX(12%) rotate(2deg); opacity: 1; }
          100% { transform: translateX(0) rotate(0deg); opacity: 1; }
        }
        @keyframes vfx-float-up {
          0% { transform: translate(-50%, 0) scale(0.8); opacity: 0; }
          15% { transform: translate(-50%, -8px) scale(1.15); opacity: 1; }
          100% { transform: translate(-50%, -56px) scale(1); opacity: 0; }
        }
        @keyframes event-row-in {
          0% { transform: translateY(8px); opacity: 0; }
          100% { transform: translateY(0); opacity: 1; }
        }
        @keyframes live-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.55; transform: scale(0.94); }
        }
        @keyframes result-banner-in {
          0% { transform: scale(0.7) rotate(-3deg); opacity: 0; }
          60% { transform: scale(1.08) rotate(1deg); opacity: 1; }
          100% { transform: scale(1) rotate(0deg); opacity: 1; }
        }
        @keyframes flash-damage {
          0%, 100% { background-color: transparent; }
          40% { background-color: rgba(255,80,80,0.45); }
        }
        @keyframes flash-heal {
          0%, 100% { background-color: transparent; }
          40% { background-color: rgba(120,255,160,0.45); }
        }
        @keyframes flash-defeated {
          0%, 100% { background-color: transparent; }
          50% { background-color: rgba(255,255,255,0.6); }
        }
        .live-pulse-dot { animation: live-pulse 1.2s ease-in-out infinite; }
        .crab-scuttle-in { animation: crab-scuttle-in 0.6s ease-out; }
        .event-row-in { animation: event-row-in 0.35s ease-out; }
        .vfx-float-up { animation: vfx-float-up 0.9s ease-out forwards; }
        .result-banner-in { animation: result-banner-in 0.6s cubic-bezier(.34,1.56,.64,1); }
        .flash-dmg { animation: flash-damage 0.5s ease-out; }
        .flash-heal { animation: flash-heal 0.5s ease-out; }
        .flash-def { animation: flash-defeated 0.6s ease-out; }
      `}</style>

      <GlassPanel
        className="w-full max-w-3xl max-h-[88vh] overflow-y-auto flex flex-col"
        glow={`0 0 32px ${LIVE_RED}33, 0 0 64px ${TIDE_TEAL}22`}
        style={{
          background:
            "linear-gradient(180deg, rgba(10,27,61,0.96) 0%, rgba(4,16,32,0.97) 100%)",
          border: `1px solid ${LIVE_RED}55`,
          boxShadow: `0 0 32px ${LIVE_RED}33, 0 0 64px ${TIDE_TEAL}22`,
        }}
      >
        {/* ---------- HEADER ---------- */}
        <div
          className="px-4 sm:px-6 py-3 sticky top-0 z-10"
          style={{
            background: "rgba(4,16,32,0.92)",
            borderBottom: `1px solid ${LIVE_RED}33`,
          }}
        >
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2 min-w-0">
              <span
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider"
                style={{
                  background: `${LIVE_RED}22`,
                  color: LIVE_RED,
                  border: `1px solid ${LIVE_RED}55`,
                }}
              >
                <span
                  className="inline-block rounded-full live-pulse-dot"
                  style={{
                    width: 8,
                    height: 8,
                    background: LIVE_RED,
                    boxShadow: `0 0 8px ${LIVE_RED}`,
                  }}
                />
                LIVE
              </span>
              <h1
                className="text-base sm:text-lg font-bold truncate"
                style={{
                  fontFamily: "Fredoka, system-ui, sans-serif",
                  color: TIDE_TEAL,
                }}
              >
                Live Raid Spectate
              </h1>
            </div>
            <button
              onClick={onClose}
              aria-label="Close live raid spectate"
              className="text-white/60 hover:text-white text-lg leading-none px-2"
              style={{ background: "transparent" }}
            >
              ×
            </button>
          </div>
          <div className="text-[11px] text-white/55 mt-1 leading-snug">
            Watch real-time raids unfold. Compact event log streamed from
            server. 8&ndash;15s cinematic.
          </div>
          <div className="flex items-center gap-3 mt-1.5 text-[10px] text-white/60 flex-wrap">
            <span>
              <span style={{ color: LIVE_RED, fontWeight: 700 }}>
                {liveRaids.length}
              </span>{" "}
              raids live
            </span>
            <span style={{ color: "rgba(124,245,225,0.35)" }}>·</span>
            <span>
              <span style={{ color: GOLD, fontWeight: 700 }}>
                {totalSpectators.toLocaleString()}
              </span>{" "}
              total spectators
            </span>
            <span style={{ color: "rgba(124,245,225,0.35)" }}>·</span>
            <span>
              <span style={{ color: TIDE_TEAL, fontWeight: 700 }}>12</span> raids
              completed today
            </span>
            {player?.name && (
              <>
                <span style={{ color: "rgba(124,245,225,0.35)" }}>·</span>
                <span>
                  Watching as{" "}
                  <span style={{ color: TIDE_TEAL, fontWeight: 700 }}>
                    {player.name}
                  </span>
                </span>
              </>
            )}
          </div>
        </div>

        {/* ---------- BODY ---------- */}
        <div className="px-4 sm:px-6 py-4 flex-1">
          {phase === "listing" && (
            <ListingView
              raids={liveRaids}
              now={now}
              onWatch={handleWatchLive}
              pushToast={pushToast}
            />
          )}

          {phase === "spectating" && selectedRaid && (
            <SpectatingView
              raid={selectedRaid}
              raiderTeamLive={raiderTeamLive}
              defenderTeamLive={defenderTeamLive}
              eventLog={eventLog}
              spectators={spectators}
              elapsedMs={elapsedMs}
              activeVfx={activeVfx}
              streamerMode={streamerMode}
              onToggleStreamer={() => setStreamerMode((s) => !s)}
              speedMultiplier={speedMultiplier}
              onSpeedChange={setSpeedMultiplier}
              currentPhase={currentRaidPhase}
              onShare={handleShareReplay}
              onBack={handleBackToListing}
              logScrollRef={logScrollRef}
            />
          )}

          {phase === "result" && selectedRaid && winnerSide && (
            <ResultView
              raid={selectedRaid}
              winnerSide={winnerSide}
              raiderTeamLive={raiderTeamLive}
              defenderTeamLive={defenderTeamLive}
              onWatchAgain={handleWatchAgain}
              onBack={handleBackToListing}
            />
          )}
        </div>

        {/* ---------- FOOTER ---------- */}
        <div
          className="px-4 sm:px-6 py-3 mt-auto sticky bottom-0"
          style={{
            background: "rgba(4,16,32,0.92)",
            borderTop: "1px solid rgba(124,245,225,0.18)",
          }}
        >
          <div className="text-[10px] text-white/55 leading-relaxed mb-1">
            All raids are server-authoritative. Event log is compact
            (&lt;300 KB per replay). Deterministic seed verified
            client+server.
          </div>
          <div className="text-[10px] text-white/45 leading-relaxed mb-2">
            Replays expire after 30 days. Spectate is free and unlimited.
          </div>
          <div className="flex justify-end">
            <GlowButton variant="ghost" size="sm" onClick={onClose}>
              Close
            </GlowButton>
          </div>
        </div>
      </GlassPanel>
    </div>
  );
}

// ---------- LISTING VIEW ----------

function ListingView({
  raids,
  now,
  onWatch,
  pushToast,
}: {
  raids: LiveRaid[];
  now: number;
  onWatch: (id: string) => void;
  pushToast: (t: {
    title: string;
    description?: string;
    variant: "default" | "success" | "error" | "warning";
  }) => void;
}) {
  return (
    <div className="space-y-3">
      <SectionTitle
        icon={<span style={{ color: LIVE_RED }}>📡</span>}
        title="Raids in progress right now"
        action={
          <span className="text-[10px] text-white/45">
            Click &ldquo;Watch Live&rdquo; to spectate
          </span>
        }
      />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {raids.map((raid) => (
          <LiveRaidCard
            key={raid.id}
            raid={raid}
            now={now}
            onWatch={() => onWatch(raid.id)}
          />
        ))}
      </div>
      <div className="pt-1 flex justify-center">
        <button
          type="button"
          onClick={() =>
            pushToast({
              title: "Loading replay archive...",
              description: "30-day replay vault coming soon.",
              variant: "default",
            })
          }
          className="text-[11px] underline decoration-dotted text-white/55 hover:text-white/80"
        >
          Past replays →
        </button>
      </div>
    </div>
  );
}

function LiveRaidCard({
  raid,
  now,
  onWatch,
}: {
  raid: LiveRaid;
  now: number;
  onWatch: () => void;
}) {
  const elapsedMs = Math.max(0, now - raid.startedAt);
  const phaseProgress =
    raid.phase === "skirmish" ? 0.33 : raid.phase === "reinforcement" ? 0.66 : 1;
  const phaseLabel =
    raid.phase === "skirmish"
      ? "Skirmish"
      : raid.phase === "reinforcement"
        ? "Reinforcement"
        : "Final";

  return (
    <div
      className="rounded-2xl p-3 sm:p-4 flex flex-col gap-2.5"
      style={{
        background:
          "linear-gradient(160deg, rgba(10,27,61,0.85) 0%, rgba(18,167,160,0.06) 100%)",
        border: "1px solid rgba(124,245,225,0.22)",
      }}
    >
      {/* VS row */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <FactionBadge faction={raid.raiderFaction} size={22} glow />
          <span
            className="text-xs font-bold truncate"
            style={{ color: factionAccent(raid.raiderFaction) }}
          >
            {raid.raiderName}
          </span>
        </div>
        <span
          className="text-[10px] font-black px-1.5 py-0.5 rounded"
          style={{
            background: `${LIVE_RED}22`,
            color: LIVE_RED,
            border: `1px solid ${LIVE_RED}55`,
          }}
        >
          VS
        </span>
        <div className="flex items-center gap-1.5 min-w-0 justify-end">
          <span
            className="text-xs font-bold truncate"
            style={{ color: factionAccent(raid.defenderFaction) }}
          >
            {raid.defenderName}
          </span>
          <FactionBadge faction={raid.defenderFaction} size={22} glow />
        </div>
      </div>

      {/* Site coord */}
      <div className="text-[10px] text-white/55 truncate">
        📍 {raid.siteCoord} · {raid.biomeName}
      </div>

      {/* Pot */}
      <div className="flex items-center gap-1.5 text-xs">
        <GoldIcon size={14} />
        <span style={{ color: GOLD, fontWeight: 700 }}>
          {formatGold(raid.potGold)}
        </span>
        <span className="text-white/55">GOLD at stake</span>
      </div>

      {/* Phase progress */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] uppercase tracking-wide text-white/55">
            Phase
          </span>
          <span
            className="text-[10px] font-bold"
            style={{ color: TIDE_TEAL }}
          >
            {phaseLabel}
          </span>
        </div>
        <div
          className="h-1.5 rounded-full overflow-hidden"
          style={{ background: "rgba(255,255,255,0.08)" }}
        >
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${phaseProgress * 100}%`,
              background: `linear-gradient(90deg, ${TIDE_TEAL}, ${GOLD})`,
              boxShadow: `0 0 8px ${TIDE_TEAL}88`,
            }}
          />
        </div>
      </div>

      {/* Spectators + elapsed */}
      <div className="flex items-center justify-between gap-2 text-[10px]">
        <span className="inline-flex items-center gap-1 text-white/65">
          <span aria-hidden>👁</span>
          <span style={{ color: GOLD, fontWeight: 700 }}>
            {raid.spectators.toLocaleString()}
          </span>
          <span className="text-white/45">watching</span>
        </span>
        <span className="text-white/55">
          ⏱ {formatTime(elapsedMs)} elapsed
        </span>
      </div>

      {/* Watch button */}
      <GlowButton
        variant="teal"
        size="sm"
        onClick={onWatch}
        className="w-full"
      >
        ▶ Watch Live
      </GlowButton>
    </div>
  );
}

// ---------- SPECTATING VIEW ----------

function SpectatingView({
  raid,
  raiderTeamLive,
  defenderTeamLive,
  eventLog,
  spectators,
  elapsedMs,
  activeVfx,
  streamerMode,
  onToggleStreamer,
  speedMultiplier,
  onSpeedChange,
  currentPhase,
  onShare,
  onBack,
  logScrollRef,
}: {
  raid: LiveRaid;
  raiderTeamLive: RaidCrab[];
  defenderTeamLive: RaidCrab[];
  eventLog: RaidEvent[];
  spectators: number;
  elapsedMs: number;
  activeVfx: VfxInstance[];
  streamerMode: boolean;
  onToggleStreamer: () => void;
  speedMultiplier: 1 | 2 | 3;
  onSpeedChange: (s: 1 | 2 | 3) => void;
  currentPhase: LiveRaid["phase"];
  onShare: () => void;
  onBack: () => void;
  logScrollRef: React.MutableRefObject<HTMLDivElement | null>;
}) {
  const raiderScore = raiderTeamLive.filter((c) => !c.defeated).length;
  const defenderScore = defenderTeamLive.filter((c) => !c.defeated).length;
  const raiderHpPct =
    raiderTeamLive.length > 0
      ? Math.round(
          (raiderTeamLive.reduce((s, c) => s + c.hp, 0) /
            raiderTeamLive.reduce((s, c) => s + c.maxHp, 0)) *
            100,
        )
      : 0;
  const defenderHpPct =
    defenderTeamLive.length > 0
      ? Math.round(
          (defenderTeamLive.reduce((s, c) => s + c.hp, 0) /
            defenderTeamLive.reduce((s, c) => s + c.maxHp, 0)) *
            100,
        )
      : 0;

  return (
    <div className="space-y-3">
      {/* Top bar */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to live raids listing"
          className="inline-flex items-center gap-1 text-[11px] text-white/65 hover:text-white px-2 py-1 rounded-lg"
          style={{ background: "rgba(255,255,255,0.06)" }}
        >
          ← Back
        </button>
        <div className="flex items-center gap-1.5 min-w-0">
          <span
            className="text-xs sm:text-sm font-bold truncate"
            style={{ color: factionAccent(raid.raiderFaction) }}
          >
            {raid.raiderName}
          </span>
          <span
            className="text-[10px] font-black px-1.5 py-0.5 rounded"
            style={{
              background: `${LIVE_RED}22`,
              color: LIVE_RED,
              border: `1px solid ${LIVE_RED}55`,
            }}
          >
            VS
          </span>
          <span
            className="text-xs sm:text-sm font-bold truncate"
            style={{ color: factionAccent(raid.defenderFaction) }}
          >
            {raid.defenderName}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="inline-flex items-center gap-1 text-[10px] text-white/65">
            <span aria-hidden>👁</span>
            <span style={{ color: GOLD, fontWeight: 700 }}>
              {spectators.toLocaleString()}
            </span>
          </span>
          <span className="text-[10px] text-white/55">
            ⏱ {formatTime(elapsedMs)}
          </span>
        </div>
      </div>

      {/* Action row */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1">
          <span className="text-[10px] uppercase tracking-wide text-white/55 mr-1">
            Speed
          </span>
          {([1, 2, 3] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onSpeedChange(s)}
              aria-pressed={speedMultiplier === s}
              className="px-2 py-0.5 rounded-md text-[10px] font-bold transition-all"
              style={{
                background:
                  speedMultiplier === s
                    ? `linear-gradient(135deg, ${TIDE_TEAL}, ${factionColor("frostshelf")})`
                    : "rgba(255,255,255,0.06)",
                color: speedMultiplier === s ? "#0A1B3D" : "#EAF6FF",
                border:
                  speedMultiplier === s
                    ? "none"
                    : "1px solid rgba(124,245,225,0.25)",
              }}
            >
              ×{s}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onToggleStreamer}
            aria-pressed={streamerMode}
            className="px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all"
            style={{
              background: streamerMode
                ? "linear-gradient(135deg, #7A5CFF, #5C7CFF)"
                : "rgba(255,255,255,0.06)",
              color: streamerMode ? "#FFFFFF" : "#EAF6FF",
              border: streamerMode
                ? "none"
                : "1px solid rgba(124,245,225,0.25)",
            }}
          >
            {streamerMode ? "✓ Streamer Mode" : "Streamer Mode"}
          </button>
          <GlowButton variant="gold" size="sm" onClick={onShare}>
            🔗 Share replay
          </GlowButton>
        </div>
      </div>

      {/* Streamer overlay OR regular arena */}
      {streamerMode ? (
        <StreamerOverlay
          raid={raid}
          raiderTeamLive={raiderTeamLive}
          defenderTeamLive={defenderTeamLive}
          raiderScore={raiderScore}
          defenderScore={defenderScore}
          raiderHpPct={raiderHpPct}
          defenderHpPct={defenderHpPct}
          eventLog={eventLog}
          spectators={spectators}
          elapsedMs={elapsedMs}
          activeVfx={activeVfx}
          currentPhase={currentPhase}
        />
      ) : (
        <>
          {/* Phase dots */}
          <PhaseDots currentPhase={currentPhase} />

          {/* Seabed arena */}
          <SeabedArena
            raid={raid}
            raiderTeamLive={raiderTeamLive}
            defenderTeamLive={defenderTeamLive}
            activeVfx={activeVfx}
          />

          {/* Event log */}
          <EventLogView
            eventLog={eventLog}
            raid={raid}
            logScrollRef={logScrollRef}
          />
        </>
      )}
    </div>
  );
}

// ---------- PHASE DOTS ----------

function PhaseDots({ currentPhase }: { currentPhase: LiveRaid["phase"] }) {
  const phases: Array<{ id: LiveRaid["phase"]; label: string }> = [
    { id: "skirmish", label: "Skirmish" },
    { id: "reinforcement", label: "Reinforcement" },
    { id: "final", label: "Final" },
  ];
  const currentIdx = phases.findIndex((p) => p.id === currentPhase);
  return (
    <div className="flex items-center justify-center gap-2 sm:gap-4 py-1">
      {phases.map((p, i) => {
        const completed = i < currentIdx;
        const active = i === currentIdx;
        const color = completed ? GOLD : active ? TIDE_TEAL : "rgba(255,255,255,0.35)";
        return (
          <div key={p.id} className="flex items-center gap-1.5">
            <div className="flex flex-col items-center gap-1">
              <span
                className="inline-block rounded-full"
                style={{
                  width: active ? 12 : 10,
                  height: active ? 12 : 10,
                  background: color,
                  boxShadow: active ? `0 0 10px ${color}` : "none",
                  animation: active ? "live-pulse 1.2s ease-in-out infinite" : undefined,
                }}
              />
              <span
                className="text-[9px] uppercase tracking-wide font-bold"
                style={{ color }}
              >
                {p.label}
              </span>
            </div>
            {i < phases.length - 1 && (
              <div
                className="h-px"
                style={{
                  width: 24,
                  background: i < currentIdx ? GOLD : "rgba(255,255,255,0.18)",
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------- SEABED ARENA ----------

function SeabedArena({
  raid,
  raiderTeamLive,
  defenderTeamLive,
  activeVfx,
}: {
  raid: LiveRaid;
  raiderTeamLive: RaidCrab[];
  defenderTeamLive: RaidCrab[];
  activeVfx: VfxInstance[];
}) {
  return (
    <div
      className="rounded-2xl p-3 sm:p-4 relative overflow-hidden"
      style={{
        background:
          "radial-gradient(ellipse at center, rgba(18,167,160,0.10) 0%, rgba(4,16,32,0.85) 70%)",
        border: "1px solid rgba(124,245,225,0.22)",
        minHeight: 220,
      }}
    >
      {/* Seabed decorations */}
      <div
        aria-hidden
        className="absolute inset-x-0 bottom-0 h-8"
        style={{
          background:
            "linear-gradient(180deg, transparent 0%, rgba(10,27,61,0.6) 100%)",
        }}
      />
      {/* Bubbles */}
      {[12, 38, 64, 86].map((left, i) => (
        <span
          key={i}
          aria-hidden
          className="absolute rounded-full"
          style={{
            left: `${left}%`,
            bottom: 6,
            width: 4 + (i % 3) * 2,
            height: 4 + (i % 3) * 2,
            background: "rgba(124,245,225,0.25)",
            animation: `live-pulse ${2 + i * 0.5}s ease-in-out infinite`,
          }}
        />
      ))}

      <div className="relative grid grid-cols-[1fr_auto_1fr] gap-2 sm:gap-3 items-start">
        {/* Raider team (left) */}
        <div className="flex flex-col gap-2">
          <div
            className="text-[10px] uppercase tracking-wide font-bold text-center"
            style={{ color: factionAccent(raid.raiderFaction) }}
          >
            ◀ {raid.raiderName}
          </div>
          <div className="flex flex-col gap-1.5">
            {raiderTeamLive.map((crab, idx) => (
              <CrabSilhouette
                key={crab.id}
                crab={crab}
                side="raider"
                index={idx}
                vfx={activeVfx.filter(
                  (v) => v.targetSide === "raider" && v.targetIndex === idx,
                )}
              />
            ))}
            {raiderTeamLive.length === 0 && (
              <div className="text-[10px] text-white/35 text-center py-4">
                No crabs
              </div>
            )}
          </div>
        </div>

        {/* VS divider */}
        <div className="flex flex-col items-center justify-center gap-1 self-stretch min-w-[44px]">
          <div className="flex-1" />
          <span
            className="text-[11px] font-black px-2 py-1 rounded-md"
            style={{
              background: `${LIVE_RED}22`,
              color: LIVE_RED,
              border: `1px solid ${LIVE_RED}55`,
            }}
          >
            VS
          </span>
          <div className="text-[9px] text-white/45 mt-1 text-center leading-tight">
            seabed
            <br />
            arena
          </div>
          <div className="flex-1" />
        </div>

        {/* Defender team (right, mirrored) */}
        <div className="flex flex-col gap-2">
          <div
            className="text-[10px] uppercase tracking-wide font-bold text-center"
            style={{ color: factionAccent(raid.defenderFaction) }}
          >
            {raid.defenderName} ▶
          </div>
          <div className="flex flex-col gap-1.5">
            {defenderTeamLive.map((crab, idx) => (
              <CrabSilhouette
                key={crab.id}
                crab={crab}
                side="defender"
                index={idx}
                mirrored
                vfx={activeVfx.filter(
                  (v) => v.targetSide === "defender" && v.targetIndex === idx,
                )}
              />
            ))}
            {defenderTeamLive.length === 0 && (
              <div className="text-[10px] text-white/35 text-center py-4">
                No crabs
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------- CRAB SILHOUETTE ----------

function CrabSilhouette({
  crab,
  side,
  index,
  mirrored,
  vfx,
}: {
  crab: RaidCrab;
  side: "raider" | "defender";
  index: number;
  mirrored?: boolean;
  vfx: VfxInstance[];
}) {
  const hpPct = crab.maxHp > 0 ? crab.hp / crab.maxHp : 0;
  const hpColor =
    hpPct > 0.5 ? "#4FB477" : hpPct > 0.25 ? GOLD : "#FF6F6F";
  const factionCol = factionColor(crab.faction);
  const factionAcc = factionAccent(crab.faction);
  const hasDmgVfx = vfx.some((v) => v.type === "damage");
  const hasHealVfx = vfx.some((v) => v.type === "heal");
  const hasDefVfx = vfx.some((v) => v.type === "defeated");
  const flashClass = hasDefVfx
    ? "flash-def"
    : hasDmgVfx
      ? "flash-dmg"
      : hasHealVfx
        ? "flash-heal"
        : "";

  return (
    <div
      className={`relative rounded-xl p-1.5 sm:p-2 ${crab.reinforced ? "crab-scuttle-in" : ""} ${flashClass}`}
      style={{
        background: crab.defeated
          ? "rgba(40,40,40,0.55)"
          : `linear-gradient(${mirrored ? "250deg" : "110deg"}, ${factionCol}33 0%, ${factionCol}11 100%)`,
        border: `1px solid ${crab.defeated ? "rgba(255,255,255,0.12)" : factionAcc + "55"}`,
        opacity: crab.defeated ? 0.55 : 1,
        // NOTE: no scaleX(-1) here — flipping the whole card also
        // mirrored its name/HP text (unreadable). Facing is applied
        // to the crab sprite itself below.
      }}
      aria-label={`${crab.name} (${CLASSES[crab.classId].name}) — HP ${Math.round(crab.hp)}/${crab.maxHp}${crab.defeated ? ", defeated" : ""}`}
    >
      {/* Top row: class icon + name + BP */}
      <div className="flex items-center gap-1.5">
        <ClassIcon classId={crab.classId} size={18} />
        <div className="min-w-0 flex-1">
          <div
            className="text-[10px] font-bold truncate"
            style={{ color: crab.defeated ? "rgba(255,255,255,0.5)" : "#EAF6FF" }}
          >
            {crab.name}
          </div>
          <div className="text-[9px] text-white/45">BP {crab.bp.toLocaleString()}</div>
        </div>
        {crab.reinforced && !crab.defeated && (
          <span
            className="text-[8px] px-1 py-0.5 rounded font-bold"
            style={{ background: `${TIDE_TEAL}22`, color: TIDE_TEAL }}
          >
            +
          </span>
        )}
      </div>

      {/* Crab portrait disc — the crab's own living sheet sprite */}
      <div className="relative flex items-center justify-center my-1">
        <div
          className="relative rounded-full flex items-center justify-center overflow-hidden"
          style={{
            width: 46,
            height: 46,
            background: crab.defeated
              ? "rgba(60,60,60,0.4)"
              : `radial-gradient(circle at 50% 40%, ${factionCol}66 0%, ${factionCol}22 70%)`,
            border: `2px solid ${crab.defeated ? "rgba(255,255,255,0.15)" : factionAcc + "88"}`,
            boxShadow: crab.defeated
              ? "none"
              : `0 0 10px ${factionCol}55, inset 0 0 8px ${factionAcc}33`,
            filter: crab.defeated ? "grayscale(0.9)" : "none",
          }}
        >
          <CrabSheetSprite
            classId={crab.classId}
            faction={crab.faction}
            size={42}
            state={crab.defeated ? "death" : "idle"}
            facing={mirrored ? "left" : "right"}
            seedKey={crab.id}
          />
          {crab.defeated && (
            <span
              className="absolute inset-0 flex items-center justify-center text-lg font-black"
              style={{ color: LIVE_RED, textShadow: "0 0 6px #000" }}
              aria-label="defeated"
            >
              ✕
            </span>
          )}
        </div>

        {/* Floating VFX numbers */}
        {vfx.map((v) => (
          <span
            key={v.id}
            className="absolute left-1/2 top-0 vfx-float-up font-black text-sm pointer-events-none"
            style={{
              color:
                v.type === "damage"
                  ? "#FF8585"
                  : v.type === "heal"
                    ? "#9BFFB0"
                    : "#FFFFFF",
              textShadow: "0 0 6px #000, 0 0 2px #000",
            }}
          >
            {v.type === "heal" ? "+" : "-"}
            {v.value > 900 ? "∞" : v.value}
          </span>
        ))}
      </div>

      {/* HP bar */}
      <div
        className="h-1.5 rounded-full overflow-hidden"
        style={{ background: "rgba(255,255,255,0.1)" }}
        role="progressbar"
        aria-valuenow={Math.round(crab.hp)}
        aria-valuemin={0}
        aria-valuemax={crab.maxHp}
        aria-label={`${crab.name} HP`}
      >
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{
            width: `${hpPct * 100}%`,
            background: hpColor,
            boxShadow: `0 0 4px ${hpColor}`,
          }}
        />
      </div>
      <div className="text-[8px] text-white/45 mt-0.5 text-center">
        {Math.round(crab.hp)} / {crab.maxHp}
      </div>
    </div>
  );
}

// ---------- EVENT LOG VIEW ----------

function EventLogView({
  eventLog,
  raid,
  logScrollRef,
}: {
  eventLog: RaidEvent[];
  raid: LiveRaid;
  logScrollRef: React.MutableRefObject<HTMLDivElement | null>;
}) {
  return (
    <div>
      <SectionTitle
        icon={<span style={{ color: TIDE_TEAL }}>📜</span>}
        title="Streaming event log"
        action={
          <span className="text-[10px] text-white/45">
            Last {Math.min(8, eventLog.length)} events · compact &lt;300 KB
          </span>
        }
      />
      <div
        ref={logScrollRef}
        className="rounded-xl max-h-44 overflow-y-auto"
        style={{
          background: "rgba(4,16,32,0.6)",
          border: "1px solid rgba(124,245,225,0.18)",
          padding: 4,
        }}
      >
        {eventLog.length === 0 ? (
          <div className="text-[11px] text-white/45 text-center py-6">
            Waiting for first event from server...
          </div>
        ) : (
          <ul className="space-y-1">
            {eventLog.map((evt) => {
              const actorFaction =
                evt.side === "raider"
                  ? raid.raiderFaction
                  : raid.defenderFaction;
              const targetFaction =
                evt.targetSide === "raider"
                  ? raid.raiderFaction
                  : raid.defenderFaction;
              const tSec = (evt.t / 1000).toFixed(1);
              return (
                <li
                  key={evt.id}
                  className="event-row-in text-[11px] leading-snug px-2 py-1 rounded-md"
                  style={{
                    background: "rgba(124,245,225,0.04)",
                    borderLeft: `2px solid ${factionColor(actorFaction)}`,
                  }}
                >
                  <span
                    className="font-mono text-[10px]"
                    style={{ color: GOLD }}
                  >
                    t.{tSec}s
                  </span>{" "}
                  <span style={{ color: factionAccent(actorFaction), fontWeight: 700 }}>
                    {evt.actorName}
                  </span>{" "}
                  <span style={{ color: TIDE_TEAL }}>{evt.skillName}</span>{" "}
                  <span className="text-white/45">→</span>{" "}
                  <span style={{ color: factionAccent(targetFaction), fontWeight: 700 }}>
                    {evt.targetName}
                  </span>
                  {evt.damage && (
                    <span
                      className="ml-1.5 font-bold"
                      style={{ color: "#FF8585" }}
                    >
                      [{evt.damage > 900 ? "KO" : `-${evt.damage}`}]
                    </span>
                  )}
                  {evt.heal && (
                    <span
                      className="ml-1.5 font-bold"
                      style={{ color: "#9BFFB0" }}
                    >
                      [+{evt.heal}]
                    </span>
                  )}
                  {evt.effect === "reinforced" && (
                    <span
                      className="ml-1.5 font-bold"
                      style={{ color: TIDE_TEAL }}
                    >
                      [REINFORCE]
                    </span>
                  )}
                  <div className="text-white/55 text-[10px] mt-0.5">
                    {evt.message}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

// ---------- STREAMER OVERLAY ----------

function StreamerOverlay({
  raid,
  raiderTeamLive,
  defenderTeamLive,
  raiderScore,
  defenderScore,
  raiderHpPct,
  defenderHpPct,
  eventLog,
  spectators,
  elapsedMs,
  activeVfx,
  currentPhase,
}: {
  raid: LiveRaid;
  raiderTeamLive: RaidCrab[];
  defenderTeamLive: RaidCrab[];
  raiderScore: number;
  defenderScore: number;
  raiderHpPct: number;
  defenderHpPct: number;
  eventLog: RaidEvent[];
  spectators: number;
  elapsedMs: number;
  activeVfx: VfxInstance[];
  currentPhase: LiveRaid["phase"];
}) {
  const latestEvent = eventLog[eventLog.length - 1];
  return (
    <div className="space-y-2">
      <div
        className="relative w-full rounded-xl overflow-hidden"
        style={{
          aspectRatio: "16 / 9",
          background:
            "radial-gradient(ellipse at center, rgba(18,167,160,0.18) 0%, rgba(4,16,32,0.95) 70%)",
          border: `1px solid ${LIVE_RED}44`,
        }}
      >
        {/* Top-left: raider team */}
        <div
          className="absolute top-2 left-2 flex items-center gap-1.5 px-2 py-1 rounded-lg max-w-[42%]"
          style={{
            background: "rgba(4,16,32,0.85)",
            border: `1px solid ${factionAccent(raid.raiderFaction)}66`,
          }}
        >
          <FactionBadge faction={raid.raiderFaction} size={20} glow />
          <div className="min-w-0">
            <div
              className="text-[10px] font-bold truncate"
              style={{ color: factionAccent(raid.raiderFaction) }}
            >
              {raid.raiderName}
            </div>
            <div className="text-[9px] text-white/55">
              {raiderHpPct}% HP · {raiderScore} alive
            </div>
          </div>
          <div
            className="ml-1 text-base font-black"
            style={{ color: GOLD, textShadow: "0 0 6px #000" }}
          >
            {raiderScore}
          </div>
        </div>

        {/* Top-right: defender team */}
        <div
          className="absolute top-2 right-2 flex items-center gap-1.5 px-2 py-1 rounded-lg max-w-[42%]"
          style={{
            background: "rgba(4,16,32,0.85)",
            border: `1px solid ${factionAccent(raid.defenderFaction)}66`,
          }}
        >
          <div
            className="mr-1 text-base font-black"
            style={{ color: GOLD, textShadow: "0 0 6px #000" }}
          >
            {defenderScore}
          </div>
          <div className="min-w-0 text-right">
            <div
              className="text-[10px] font-bold truncate"
              style={{ color: factionAccent(raid.defenderFaction) }}
            >
              {raid.defenderName}
            </div>
            <div className="text-[9px] text-white/55">
              {defenderHpPct}% HP · {defenderScore} alive
            </div>
          </div>
          <FactionBadge faction={raid.defenderFaction} size={20} glow />
        </div>

        {/* Center: phase + elapsed */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-center">
            <div
              className="text-[10px] font-black tracking-wider uppercase mb-1"
              style={{
                color: currentPhase === "final" ? LIVE_RED : TIDE_TEAL,
              }}
            >
              {currentPhase}
            </div>
            <div
              className="text-2xl font-black"
              style={{
                color: "#FFFFFF",
                textShadow: "0 0 10px #000, 0 0 4px #000",
                fontFamily: "Fredoka, system-ui, sans-serif",
              }}
            >
              {raiderScore}{" "}
              <span style={{ color: LIVE_RED }}>: </span>
              {defenderScore}
            </div>
            <div className="text-[10px] text-white/65 mt-1">
              ⏱ {formatTime(elapsedMs)} · 👁 {spectators.toLocaleString()}
            </div>
          </div>
        </div>

        {/* Mini arena inside streamer view */}
        <div className="absolute inset-x-3 top-12 bottom-12 flex items-center justify-center gap-2">
          <div className="flex gap-1.5">
            {raiderTeamLive.slice(0, 4).map((crab, idx) => (
              <MiniCrabDot
                key={crab.id}
                crab={crab}
                vfx={activeVfx.filter(
                  (v) => v.targetSide === "raider" && v.targetIndex === idx,
                )}
              />
            ))}
          </div>
          <div
            className="text-[10px] font-black px-1.5 py-0.5 rounded"
            style={{
              background: `${LIVE_RED}22`,
              color: LIVE_RED,
              border: `1px solid ${LIVE_RED}55`,
            }}
          >
            VS
          </div>
          <div className="flex gap-1.5">
            {defenderTeamLive.slice(0, 4).map((crab, idx) => (
              <MiniCrabDot
                key={crab.id}
                crab={crab}
                mirrored
                vfx={activeVfx.filter(
                  (v) => v.targetSide === "defender" && v.targetIndex === idx,
                )}
              />
            ))}
          </div>
        </div>

        {/* Bottom-left: LIVE badge */}
        <div className="absolute bottom-9 left-2 flex items-center gap-1">
          <span
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider"
            style={{
              background: LIVE_RED,
              color: "#FFFFFF",
              boxShadow: `0 0 8px ${LIVE_RED}`,
            }}
          >
            <span
              className="inline-block rounded-full live-pulse-dot"
              style={{ width: 6, height: 6, background: "#FFFFFF" }}
            />
            LIVE on Crabtopia TV
          </span>
        </div>

        {/* Bottom-right: sponsor */}
        <div className="absolute bottom-9 right-2">
          <div
            className="px-2 py-0.5 rounded-md text-[9px] font-bold"
            style={{
              background: "rgba(4,16,32,0.85)",
              color: GOLD,
              border: `1px solid ${GOLD}55`,
            }}
          >
            Use code <span style={{ color: "#FFFFFF" }}>SHELLWARDEN</span>
          </div>
        </div>

        {/* Bottom ticker strip */}
        <div
          className="absolute inset-x-0 bottom-0 px-2 py-1 overflow-hidden"
          style={{
            background: "rgba(4,16,32,0.92)",
            borderTop: `1px solid ${TIDE_TEAL}33`,
          }}
        >
          <div
            className="text-[10px] text-white/75 truncate"
            style={{ fontFamily: "monospace" }}
          >
            {latestEvent ? (
              <>
                <span style={{ color: GOLD }}>
                  t.{(latestEvent.t / 1000).toFixed(1)}s
                </span>{" "}
                {latestEvent.message}
              </>
            ) : (
              <span style={{ color: TIDE_TEAL }}>
                ▶ Stream starting — Crabtopia live raid broadcast...
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Below overlay: condensed event log */}
      <div
        ref={undefined}
        className="rounded-xl max-h-24 overflow-y-auto"
        style={{
          background: "rgba(4,16,32,0.6)",
          border: "1px solid rgba(124,245,225,0.18)",
          padding: 4,
        }}
      >
        {eventLog.length === 0 ? (
          <div className="text-[10px] text-white/45 text-center py-3">
            Waiting for events...
          </div>
        ) : (
          <ul className="space-y-0.5">
            {eventLog.slice(-5).map((evt) => {
              const actorFaction =
                evt.side === "raider" ? raid.raiderFaction : raid.defenderFaction;
              return (
                <li
                  key={evt.id}
                  className="event-row-in text-[10px] leading-snug px-1.5 py-0.5 rounded"
                  style={{
                    background: "rgba(124,245,225,0.04)",
                    borderLeft: `2px solid ${factionColor(actorFaction)}`,
                  }}
                >
                  <span className="font-mono" style={{ color: GOLD }}>
                    t.{(evt.t / 1000).toFixed(1)}s
                  </span>{" "}
                  <span style={{ color: factionAccent(actorFaction), fontWeight: 700 }}>
                    {evt.actorName}
                  </span>{" "}
                  <span style={{ color: TIDE_TEAL }}>{evt.skillName}</span>
                  {evt.damage && (
                    <span style={{ color: "#FF8585", fontWeight: 700 }}>
                      {" "}
                      [{evt.damage > 900 ? "KO" : `-${evt.damage}`}]
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function MiniCrabDot({
  crab,
  mirrored,
  vfx,
}: {
  crab: RaidCrab;
  mirrored?: boolean;
  vfx: VfxInstance[];
}) {
  const hpPct = crab.maxHp > 0 ? crab.hp / crab.maxHp : 0;
  const hpColor = hpPct > 0.5 ? "#4FB477" : hpPct > 0.25 ? GOLD : "#FF6F6F";
  const hasDefVfx = vfx.some((v) => v.type === "defeated");
  const hasDmgVfx = vfx.some((v) => v.type === "damage");
  const flashClass = hasDefVfx
    ? "flash-def"
    : hasDmgVfx
      ? "flash-dmg"
      : "";
  return (
    <div
      className={`relative rounded-lg p-1 ${crab.reinforced ? "crab-scuttle-in" : ""} ${flashClass}`}
      style={{
        background: crab.defeated
          ? "rgba(40,40,40,0.55)"
          : `${factionColor(crab.faction)}22`,
        border: `1px solid ${factionAccent(crab.faction)}55`,
        opacity: crab.defeated ? 0.55 : 1,
        transform: mirrored ? "scaleX(-1)" : undefined,
        width: 36,
      }}
    >
      <div className="flex items-center gap-1">
        <span style={{ fontSize: 14 }} aria-hidden>
          {CLASSES[crab.classId].icon}
        </span>
        {crab.defeated && (
          <span
            className="text-xs font-black"
            style={{ color: LIVE_RED }}
            aria-label="defeated"
          >
            ✕
          </span>
        )}
      </div>
      <div
        className="h-1 rounded-full overflow-hidden mt-0.5"
        style={{ background: "rgba(255,255,255,0.1)" }}
      >
        <div
          className="h-full"
          style={{
            width: `${hpPct * 100}%`,
            background: hpColor,
          }}
        />
      </div>
      {vfx.map((v) => (
        <span
          key={v.id}
          className="absolute left-1/2 top-0 vfx-float-up font-black text-[10px] pointer-events-none"
          style={{
            color:
              v.type === "damage"
                ? "#FF8585"
                : v.type === "heal"
                  ? "#9BFFB0"
                  : "#FFFFFF",
            textShadow: "0 0 4px #000",
            transform: mirrored ? "scaleX(-1)" : undefined,
          }}
        >
          {v.type === "heal" ? "+" : "-"}
          {v.value > 900 ? "∞" : v.value}
        </span>
      ))}
    </div>
  );
}

// ---------- RESULT VIEW ----------

function ResultView({
  raid,
  winnerSide,
  raiderTeamLive,
  defenderTeamLive,
  onWatchAgain,
  onBack,
}: {
  raid: LiveRaid;
  winnerSide: "raider" | "defender";
  raiderTeamLive: RaidCrab[];
  defenderTeamLive: RaidCrab[];
  onWatchAgain: () => void;
  onBack: () => void;
}) {
  const winnerName =
    winnerSide === "raider" ? raid.raiderName : raid.defenderName;
  const winnerFaction =
    winnerSide === "raider" ? raid.raiderFaction : raid.defenderFaction;
  const loserFaction =
    winnerSide === "raider" ? raid.defenderFaction : raid.raiderFaction;
  const winnerColor = factionAccent(winnerFaction);
  const winnerStolen = Math.round(raid.potGold * 0.65);
  const loserKept = Math.round(raid.potGold * 0.35);

  // MVP — highest damageDealt across both teams
  const allCrabs = [...raiderTeamLive, ...defenderTeamLive];
  const mvp = allCrabs.reduce(
    (best, c) => (c.damageDealt > (best?.damageDealt ?? 0) ? c : best),
    allCrabs[0],
  );
  const mvpFaction = mvp?.faction ?? winnerFaction;

  return (
    <div className="space-y-3">
      {/* Banner */}
      <div className="text-center py-3">
        <div
          className="result-banner-in inline-block px-4 sm:px-6 py-2 sm:py-3 rounded-xl"
          style={{
            background: `linear-gradient(135deg, ${factionColor(winnerFaction)}33 0%, ${winnerColor}22 100%)`,
            border: `2px solid ${winnerColor}`,
            boxShadow: `0 0 24px ${winnerColor}88`,
          }}
        >
          <div
            className="text-[10px] uppercase tracking-widest font-bold mb-0.5"
            style={{ color: GOLD }}
          >
            Raid Complete
          </div>
          <div
            className="text-xl sm:text-2xl font-black"
            style={{
              color: winnerColor,
              fontFamily: "Fredoka, system-ui, sans-serif",
              textShadow: `0 0 10px ${winnerColor}88`,
            }}
          >
            {winnerSide === "raider" ? "RAIDER" : "DEFENDER"} WINS
          </div>
          <div className="text-[11px] text-white/75 mt-1">
            {winnerName}
          </div>
        </div>
      </div>

      {/* Spoils summary */}
      <div
        className="rounded-xl p-3"
        style={{
          background: "rgba(10,27,61,0.55)",
          border: "1px solid rgba(124,245,225,0.18)",
        }}
      >
        <div className="text-[10px] uppercase tracking-wide text-white/55 mb-2 text-center">
          Spoils
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div
            className="rounded-lg p-2 text-center"
            style={{
              background: `${factionColor(winnerFaction)}1a`,
              border: `1px solid ${winnerColor}44`,
            }}
          >
            <div className="text-[10px] text-white/55 mb-0.5">
              {winnerName} stole
            </div>
            <div className="flex items-center justify-center gap-1">
              <GoldIcon size={14} />
              <span
                className="text-sm font-black"
                style={{ color: GOLD }}
              >
                {formatGold(winnerStolen)}
              </span>
            </div>
            <div className="text-[9px] text-white/45 mt-0.5">GOLD</div>
          </div>
          <div
            className="rounded-lg p-2 text-center"
            style={{
              background: `${factionColor(loserFaction)}1a`,
              border: `1px solid ${factionAccent(loserFaction)}44`,
            }}
          >
            <div className="text-[10px] text-white/55 mb-0.5">
              {winnerSide === "raider" ? raid.defenderName : raid.raiderName} kept
            </div>
            <div className="flex items-center justify-center gap-1">
              <GoldIcon size={14} />
              <span
                className="text-sm font-black"
                style={{ color: factionAccent(loserFaction) }}
              >
                {formatGold(loserKept)}
              </span>
            </div>
            <div className="text-[9px] text-white/45 mt-0.5">GOLD</div>
          </div>
        </div>
      </div>

      {/* MVP card */}
      {mvp && (
        <div
          className="rounded-xl p-3 relative overflow-hidden"
          style={{
            background: `linear-gradient(135deg, ${factionColor(mvpFaction)}22 0%, rgba(10,27,61,0.55) 100%)`,
            border: `1px solid ${factionAccent(mvpFaction)}55`,
          }}
        >
          <div
            className="absolute top-0 right-0 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider rounded-bl-lg"
            style={{
              background: GOLD,
              color: "#0A1B3D",
            }}
          >
            ★ MVP
          </div>
          <div className="flex items-center gap-3">
            <div
              className="rounded-full flex items-center justify-center shrink-0"
              style={{
                width: 48,
                height: 48,
                background: `radial-gradient(circle, ${factionColor(mvpFaction)}55 0%, ${factionColor(mvpFaction)}22 70%)`,
                border: `2px solid ${factionAccent(mvpFaction)}`,
                fontSize: 24,
              }}
            >
              <span aria-hidden>{CLASSES[mvp.classId].icon}</span>
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span
                  className="text-sm font-bold truncate"
                  style={{ color: factionAccent(mvpFaction) }}
                >
                  {mvp.name}
                </span>
                <ClassIcon classId={mvp.classId} size={14} />
              </div>
              <div className="text-[10px] text-white/55">
                {CLASSES[mvp.classId].name} · {FACTIONS[mvpFaction].name} · BP{" "}
                {mvp.bp.toLocaleString()}
              </div>
              <div className="text-[10px] mt-0.5">
                <span className="text-white/55">Total damage dealt:</span>{" "}
                <span style={{ color: "#FF8585", fontWeight: 700 }}>
                  {mvp.damageDealt.toLocaleString()}
                </span>
              </div>
            </div>
            <FactionBadge faction={mvpFaction} size={24} glow />
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex items-center justify-center gap-2 pt-1">
        <GlowButton variant="teal" size="sm" onClick={onWatchAgain}>
          ▶ Watch again
        </GlowButton>
        <GlowButton variant="ghost" size="sm" onClick={onBack}>
          ← Back to live raids
        </GlowButton>
      </div>
    </div>
  );
}
