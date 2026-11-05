// Crabtopia - Leviathan World-Boss Co-op Raid Modal
// A self-contained 4-squad raid against a waking Leviathan with phase
// transitions, live damage leaderboard, loot chests, and accessibility hooks.
// All mock data (NPC teammates, boss) is local; only store actions are used.

"use client";

import React, { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useGame } from "../store/gameStore";
import { FACTIONS } from "../content/factions";
import { CLASSES } from "../content/classes";
import { Crab, FactionId, ClassId } from "../types";
import { crabBaseBP } from "../engine/bp";
import { generateCrab } from "../engine/crabs";
import { mulberry32, randInt } from "../engine/rng";
import {
  GlassPanel,
  GlowButton,
  StatChip,
  SectionTitle,
  GoldIcon,
  formatGold,
  formatBP,
  FactionBadge,
} from "./ui";
import TeamSelect from "./TeamSelect";
import {
  deploymentOrder,
  resolveTeamFormation,
} from "../engine/formation";
import {
  firstAvailableTeam,
  teamAvailability,
} from "../engine/teamEligibility";

// ============================ TYPES ============================

interface RaidMember {
  id: string;
  name: string;
  faction: FactionId;
  squadCrabs: Crab[];
  squadHP: number;
  squadMaxHP: number;
  contributionDamage: number;
  isPlayer: boolean;
  defending: boolean;
  defeated: boolean;
}

interface LogEntry {
  turn: number;
  actor: string;
  message: string;
}

// ============================ CONSTANTS ============================

const BOSS_MAX_HP = 1_000_000;
const PHASE_NAMES = ["Whelps", "Awakening", "Wrath", "Final Stand"] as const;
const PHASE_ABILITIES = ["Tail Sweep", "Tidal Roar", "Abyssal Slam", "Devouring Maw"];
const TURN_DELAY_MS = 600;
const RAID_COOLDOWN_LABEL = "5 min cooldown after";

const NPC_SQUAD_DEFS: { name: string; faction: FactionId }[] = [
  { name: "Brinepinch", faction: "stormwake" },
  { name: "Goldfoot", faction: "coral_court" },
  { name: "Frostgrip", faction: "frostshelf" },
];

const PHASE_COLORS: { dark: string; bright: string }[] = [
  { dark: "#0A4A66", bright: "#7CF5E1" },
  { dark: "#5C4A00", bright: "#FFD166" },
  { dark: "#5C1A00", bright: "#FF7A1A" },
  { dark: "#5C0A1F", bright: "#FF3D5A" },
];

const KEYFRAMES = `
@keyframes leviathanBob {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-6px); }
}
@keyframes leviathanExplode {
  0% { transform: scale(0.3); opacity: 0.9; }
  60% { transform: scale(1.4); opacity: 1; }
  100% { transform: scale(2); opacity: 0; }
}
@keyframes leviathanParticle {
  0% { transform: translate(0,0) scale(1); opacity: 1; }
  100% { transform: translate(var(--dx), var(--dy)) scale(0.2); opacity: 0; }
}
@keyframes leviathanPhaseFlash {
  0% { opacity: 0; transform: scale(0.85); }
  20% { opacity: 1; transform: scale(1.05); }
  100% { opacity: 0; transform: scale(1); }
}
@keyframes leviathanChestGlow {
  0% { transform: scale(0.55) rotate(-12deg); opacity: 0; }
  55% { transform: scale(1.15) rotate(5deg); opacity: 1; }
  100% { transform: scale(1) rotate(0deg); opacity: 1; }
}
@keyframes leviathanShake {
  0%, 100% { transform: translateX(0); }
  25% { transform: translateX(-5px); }
  75% { transform: translateX(5px); }
}
.leviathan-shake { animation: leviathanShake 0.45s ease-in-out; }
.leviathan-phase-banner { animation: leviathanPhaseFlash 1.8s ease-out forwards; }
.leviathan-chest { animation: leviathanChestGlow 0.9s ease-out forwards; }
`;

// ============================ HELPERS ============================

function buildNpcSquad(name: string, faction: FactionId, seed: number): Crab[] {
  const rng = mulberry32(seed);
  const classes: ClassId[] = ["reaver", "bulwark", "tidecaller"];
  const crabs: Crab[] = [];
  for (let i = 0; i < 3; i++) {
    const c = generateCrab({
      ownerId: "npc",
      faction,
      classId: classes[i],
      level: randInt(28, 36, rng),
      seed: seed * 7 + i,
      isRookie: false,
    });
    c.name = `${name}'s ${CLASSES[classes[i]].name}`;
    crabs.push(c);
  }
  return crabs;
}

function squadBP(crabs: Crab[]): number {
  return crabs.reduce((sum, c) => sum + crabBaseBP(c), 0);
}

// Subscribe to the prefers-reduced-motion media query via useSyncExternalStore
// (avoids setState-in-effect warnings and handles SSR hydration safely).
const REDUCED_MOTION_SUBSCRIBE = (callback: () => void): (() => void) => {
  if (typeof window === "undefined") return () => {};
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  mq.addEventListener?.("change", callback);
  return () => mq.removeEventListener?.("change", callback);
};
const REDUCED_MOTION_GET_SNAPSHOT = (): boolean => {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
};
const REDUCED_MOTION_GET_SERVER_SNAPSHOT = (): boolean => false;

function usePrefersReducedMotion(): boolean {
  return React.useSyncExternalStore(
    REDUCED_MOTION_SUBSCRIBE,
    REDUCED_MOTION_GET_SNAPSHOT,
    REDUCED_MOTION_GET_SERVER_SNAPSHOT
  );
}

// ============================ SUB-COMPONENTS ============================

// CSS-built Leviathan silhouette: dark teal/navy blob with glowing eyes,
// mouth glow, and tentacle shapes. Phase drives eye + glow color.
function LeviathanSilhouette({
  phase,
  reduced,
  shaking = false,
}: {
  phase: number;
  reduced: boolean;
  shaking?: boolean;
}) {
  const eyeColor = phase >= 3 ? "#FF3D5A" : phase === 2 ? "#FFD166" : "#7CF5E1";
  const glowColor = PHASE_COLORS[phase - 1].bright;
  return (
    <div
      className={`relative w-full h-32 md:h-36 flex items-end justify-center ${shaking ? "leviathan-shake" : ""}`}
      aria-hidden="true"
    >
      <div
        className="absolute inset-0"
        style={{
          background: `radial-gradient(ellipse at 50% 70%, ${glowColor}33 0%, transparent 60%)`,
        }}
      />
      {/* Tentacles */}
      <div
        className="absolute bottom-0 left-1/2 -translate-x-1/2 flex gap-1.5 items-end"
        style={{ height: 36 }}
      >
        {[0, 1, 2, 3, 4].map((i) => (
          <span
            key={i}
            className="block"
            style={{
              width: 5,
              height: 16 + (i % 3) * 8,
              background: `linear-gradient(180deg, ${glowColor}66, transparent)`,
              borderRadius: 4,
              transform: `rotate(${(i - 2) * 14}deg)`,
              transformOrigin: "top center",
            }}
          />
        ))}
      </div>
      {/* Body blob */}
      <div
        className="relative"
        style={{
          width: 130,
          height: 84,
          background: `radial-gradient(ellipse at 50% 35%, #2a1a5e 0%, #0a0e1f 75%, transparent 100%)`,
          borderRadius: "60% 60% 50% 50% / 70% 70% 40% 40%",
          boxShadow: `0 0 28px ${glowColor}55, inset 0 -8px 18px rgba(0,0,0,0.7)`,
          animation: reduced ? "none" : "leviathanBob 3s ease-in-out infinite",
        }}
      >
        {/* Mouth */}
        <div
          className="absolute left-1/2 -translate-x-1/2"
          style={{
            bottom: 14,
            width: 50,
            height: 8,
            background: `linear-gradient(90deg, transparent, ${eyeColor}aa, transparent)`,
            borderRadius: 4,
            boxShadow: `0 0 6px ${eyeColor}`,
          }}
        />
        {/* Eyes */}
        <div className="absolute top-7 left-1/2 -translate-x-1/2 flex gap-4">
          <span
            className="rounded-full"
            style={{
              width: 9,
              height: 9,
              background: eyeColor,
              boxShadow: `0 0 10px ${eyeColor}, 0 0 3px ${eyeColor}`,
            }}
          />
          <span
            className="rounded-full"
            style={{
              width: 9,
              height: 9,
              background: eyeColor,
              boxShadow: `0 0 10px ${eyeColor}, 0 0 3px ${eyeColor}`,
            }}
          />
        </div>
      </div>
    </div>
  );
}

// CSS-only particle explosion for victory.
function BossExplosion({ reduced }: { reduced: boolean }) {
  if (reduced) {
    return (
      <div className="text-5xl text-center py-4" aria-hidden="true">
        💥
      </div>
    );
  }
  const particles = Array.from({ length: 28 });
  return (
    <div
      className="relative w-full h-32 flex items-center justify-center"
      aria-hidden="true"
    >
      <div
        className="absolute rounded-full"
        style={{
          width: 90,
          height: 90,
          background: "radial-gradient(circle, #FFD166 0%, #FF7A1A 40%, transparent 70%)",
          boxShadow: "0 0 40px #FFD166, 0 0 80px #FF7A1A",
          animation: "leviathanExplode 1.2s ease-out forwards",
        }}
      />
      {particles.map((_, i) => {
        const angle = (i / particles.length) * Math.PI * 2;
        const dist = 50 + (i % 5) * 22;
        const dx = Math.cos(angle) * dist;
        const dy = Math.sin(angle) * dist;
        const color = ["#FFD166", "#FF7A1A", "#FF3D5A", "#7A5CFF"][i % 4];
        return (
          <span
            key={i}
            className="absolute rounded-full"
            style={
              {
                width: 6,
                height: 6,
                background: color,
                boxShadow: `0 0 8px ${color}`,
                animation: `leviathanParticle 1.1s ease-out ${(i % 6) * 30}ms forwards`,
                "--dx": `${dx}px`,
                "--dy": `${dy}px`,
              } as React.CSSProperties
            }
          />
        );
      })}
    </div>
  );
}

function MiniCrabPortrait({ crab, size = 28 }: { crab: Crab; size?: number }) {
  const faction = FACTIONS[crab.faction];
  const classDef = CLASSES[crab.classId];
  return (
    <div
      className="rounded-full flex items-center justify-center shrink-0"
      style={{
        width: size,
        height: size,
        background: `linear-gradient(135deg, ${faction.colors.dark}, ${faction.colors.primary}33)`,
        border: `1.5px solid ${faction.colors.accent}99`,
        fontSize: size * 0.55,
        lineHeight: 1,
      }}
      title={`${crab.name} · ${classDef.name} · ${formatBP(crabBaseBP(crab))} BP`}
    >
      <span>{classDef.icon}</span>
    </div>
  );
}

function SquadCard({ member }: { member: RaidMember }) {
  const faction = FACTIONS[member.faction];
  const hpRatio = member.squadMaxHP > 0 ? member.squadHP / member.squadMaxHP : 0;
  return (
    <div
      className={`rounded-xl p-2 transition-all ${member.defeated ? "opacity-50 grayscale" : ""}`}
      style={{
        background: `linear-gradient(160deg, ${faction.colors.dark}cc, ${faction.colors.primary}0f)`,
        border: member.isPlayer ? "2px solid #FFD166" : `1px solid ${faction.colors.primary}55`,
        boxShadow: member.isPlayer
          ? "0 0 14px rgba(255,209,102,0.4)"
          : `0 2px 8px rgba(0,0,0,0.3)`,
      }}
    >
      <div className="flex items-center justify-between mb-1 gap-1">
        <div className="flex items-center gap-1 min-w-0">
          <FactionBadge faction={member.faction} size={14} />
          <span
            className="text-[11px] font-bold truncate"
            style={{ color: member.isPlayer ? "#FFD166" : "#fff" }}
          >
            {member.isPlayer ? "★ You" : member.name}
          </span>
        </div>
        {member.defending && (
          <span title="Defending this turn" className="text-xs shrink-0" aria-label="Defending">
            🛡️
          </span>
        )}
      </div>
      <div className="flex gap-1 mb-1.5">
        {member.squadCrabs.map((c, j) => (
          <MiniCrabPortrait key={j} crab={c} size={22} />
        ))}
      </div>
      <div
        className="h-1.5 rounded-full overflow-hidden mb-1"
        style={{ background: "rgba(0,0,0,0.5)" }}
        role="progressbar"
        aria-valuenow={Math.round(hpRatio * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${member.isPlayer ? "Your squad" : member.name + " squad"} HP`}
      >
        <div
          className="h-full transition-all duration-300"
          style={{
            width: `${hpRatio * 100}%`,
            background: hpRatio > 0.5 ? "#4FB477" : hpRatio > 0.25 ? "#FFD166" : "#FF3D5A",
          }}
        />
      </div>
      <div className="flex items-center justify-between text-[10px]">
        <span className="opacity-60">DMG</span>
        <span className="font-bold" style={{ color: "#FFD166" }}>
          {formatGold(member.contributionDamage)}
        </span>
      </div>
      {member.defeated && (
        <div className="text-[10px] text-rose-400 text-center mt-1 font-bold tracking-wide">
          WIPED
        </div>
      )}
    </div>
  );
}

function RewardCard({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div
      className="rounded-xl p-3 text-center"
      style={{
        background: `linear-gradient(160deg, ${color}11, ${color}33)`,
        border: `1px solid ${color}55`,
        boxShadow: `0 0 10px ${color}22`,
      }}
    >
      <div className="text-2xl mb-1 flex items-center justify-center">{icon}</div>
      <div className="text-[9px] uppercase tracking-wide opacity-70">{label}</div>
      <div className="text-sm font-bold" style={{ color }}>
        {value}
      </div>
    </div>
  );
}

// ============================ MAIN COMPONENT ============================

export default function LeviathanRaidModal({ onClose }: { onClose: () => void }) {
  const player = useGame((s) => s.player)!;
  const addGold = useGame((s) => s.addGold);
  const addXp = useGame((s) => s.addXp);
  const progressQuest = useGame((s) => s.progressQuest);
  const pushToast = useGame((s) => s.pushToast);

  const reducedMotion = usePrefersReducedMotion();
  const mountedRef = useRef(true);
  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // ----- LOCAL STATE -----
  const [raidState, setRaidState] = useState<"briefing" | "active" | "victory" | "defeat">("briefing");
  const [phase, setPhase] = useState<1 | 2 | 3 | 4>(1);
  const [bossHP, setBossHP] = useState<number>(BOSS_MAX_HP);
  const [turn, setTurn] = useState<number>(0);
  const [raidMembers, setRaidMembers] = useState<RaidMember[]>([]);
  const [raidLog, setRaidLog] = useState<LogEntry[]>([]);
  const [autoPlay, setAutoPlay] = useState<boolean>(false);
  const [phaseBanner, setPhaseBanner] = useState<{ phase: number; label: string } | null>(null);
  const [castPickerOpen, setCastPickerOpen] = useState<boolean>(false);
  // Auto-select the first available saved team so a player whose starter
  // team is idle can join immediately.
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(() => {
    const byId = new Map(player.crabs.map((c) => [c.id, c] as const));
    return firstAvailableTeam(player.teams, byId)?.id ?? null;
  });
  const [shakeBoss, setShakeBoss] = useState<boolean>(false);

  // ----- REFS (avoid stale closures in setTimeout) -----
  const stateRef = useRef({ raidState, phase, bossHP, turn, raidMembers });
  useEffect(() => {
    stateRef.current = { raidState, phase, bossHP, turn, raidMembers };
  }, [raidState, phase, bossHP, turn, raidMembers]);

  // ----- DERIVED -----
  const crabsById = useMemo(
    () => new Map(player.crabs.map((c) => [c.id, c] as const)),
    [player.crabs]
  );
  const selectedTeam = useMemo(
    () => player.teams.find((t) => t.id === selectedTeamId) ?? null,
    [player.teams, selectedTeamId]
  );
  const selectedTeamAvailability = useMemo(
    () =>
      selectedTeam
        ? teamAvailability(selectedTeam, crabsById)
        : { available: false, reasons: ["No team selected"], filledCount: 0 },
    [selectedTeam, crabsById]
  );

  const playerSquad = useMemo(() => {
    if (!selectedTeam) return [];
    return deploymentOrder(resolveTeamFormation(selectedTeam))
      .map((id) => crabsById.get(id))
      .filter(Boolean) as Crab[];
  }, [selectedTeam, crabsById]);

  const playerBP = useMemo(() => squadBP(playerSquad), [playerSquad]);

  // NPC squads (stable for component lifetime)
  const npcSquads = useMemo(() => {
    return NPC_SQUAD_DEFS.map((def, i) => ({
      name: def.name,
      faction: def.faction,
      crabs: buildNpcSquad(def.name, def.faction, 1234 + i * 1000),
    }));
  }, []);

  // ----- REWARD EFFECT (claim once on terminal state) -----
  const rewardsClaimedRef = useRef(false);
  useEffect(() => {
    if (rewardsClaimedRef.current) return;
    if (raidState === "victory") {
      rewardsClaimedRef.current = true;
      addGold(5000);
      addXp(1000);
      // Stalwart Defender quest: repelling the Leviathan IS the raid
      // defense fantasy (NPC raids on player sites don't exist).
      progressQuest("defend_raid");
      pushToast({
        title: "Received Leviathan Banner cosmetic!",
        description: "A banner of the fallen world-boss, hung in your hall.",
        variant: "success",
      });
    } else if (raidState === "defeat") {
      rewardsClaimedRef.current = true;
      addGold(100);
      pushToast({
        title: "Consolation: 100 GOLD",
        description: "The tide returns what the Leviathan took.",
        variant: "warning",
      });
    }
  }, [raidState, addGold, addXp, progressQuest, pushToast]);

  // ----- JOIN RAID -----
  const handleJoinRaid = () => {
    if (!selectedTeamAvailability.available) return;
    if (playerSquad.length !== 5) return;

    const npcMembers: RaidMember[] = npcSquads.map((s, i) => {
      const bp = squadBP(s.crabs);
      const hp = 1000 + Math.round(bp * 0.05);
      return {
        id: `npc_${i}`,
        name: s.name,
        faction: s.faction,
        squadCrabs: s.crabs,
        squadHP: hp,
        squadMaxHP: hp,
        contributionDamage: 0,
        isPlayer: false,
        defending: false,
        defeated: false,
      };
    });

    const playerHP = 1000 + Math.round(playerBP * 0.05);
    const dominantFaction: FactionId = playerSquad[0]?.faction ?? "moonpool";
    const playerMember: RaidMember = {
      id: "player",
      name: player.name || "You",
      faction: dominantFaction,
      squadCrabs: playerSquad,
      squadHP: playerHP,
      squadMaxHP: playerHP,
      contributionDamage: 0,
      isPlayer: true,
      defending: false,
      defeated: false,
    };

    setRaidMembers([playerMember, ...npcMembers]);
    setRaidState("active");
    setPhase(1);
    setBossHP(BOSS_MAX_HP);
    setTurn(1);
    setAutoPlay(false);
    setRaidLog([
      {
        turn: 0,
        actor: "System",
        message: "The Leviathan awakens. The raid begins!",
      },
    ]);
  };

  // ----- PROCESS TURN -----
  const processTurn = useCallback(
    (playerAction: "attack" | "defend", pickedCrabIndex = 0) => {
      const {
        raidState: rs,
        bossHP: hp,
        raidMembers: members,
        phase: p,
        turn: t,
      } = stateRef.current;
      if (rs !== "active") return;

      let currentBossHP = hp;
      const currentMembers = members.map((m) => ({ ...m }));
      const currentPhase = p;
      const turnNum = t;
      const logs: LogEntry[] = [];

      // Player action
      const pMember = currentMembers[0];
      if (pMember && !pMember.defeated) {
        if (playerAction === "attack") {
          const picked = pMember.squadCrabs[pickedCrabIndex] ?? pMember.squadCrabs[0];
          if (picked) {
            const classDef = CLASSES[picked.classId];
            const crabBP = crabBaseBP(picked);
            const classMod = classDef.activeSkill.power;
            const dmg = Math.max(
              1,
              Math.round(crabBP * classMod * 3 + Math.random() * crabBP * 0.6)
            );
            currentBossHP = Math.max(0, currentBossHP - dmg);
            pMember.contributionDamage += dmg;
            logs.push({
              turn: turnNum,
              actor: pMember.name,
              message: `${classDef.name} casts ${classDef.activeSkill.name} — ${formatGold(dmg)} damage`,
            });
          }
        } else if (playerAction === "defend") {
          pMember.defending = true;
          logs.push({
            turn: turnNum,
            actor: pMember.name,
            message: "raises defenses (−50% boss damage this turn)",
          });
        }
      }

      // NPC squads attack
      for (let i = 1; i < currentMembers.length; i++) {
        const m = currentMembers[i];
        if (m.defeated) continue;
        const bp = squadBP(m.squadCrabs);
        const dmg = Math.max(1, Math.round(bp * 4 * (0.7 + Math.random() * 0.6)));
        currentBossHP = Math.max(0, currentBossHP - dmg);
        m.contributionDamage += dmg;
        logs.push({
          turn: turnNum,
          actor: m.name,
          message: `strikes for ${formatGold(dmg)} damage`,
        });
      }

      // Boss attack
      if (currentBossHP > 0) {
        const alive = currentMembers.filter((m) => !m.defeated);
        if (alive.length > 0) {
          const target = alive[Math.floor(Math.random() * alive.length)];
          const baseDmg = 80 + currentPhase * 50;
          const variance = 0.8 + Math.random() * 0.5;
          const defendMod = target.defending ? 0.5 : 1;
          const dmg = Math.max(1, Math.round(baseDmg * variance * defendMod));
          target.squadHP = Math.max(0, target.squadHP - dmg);
          logs.push({
            turn: turnNum,
            actor: "Leviathan",
            message: `${PHASE_ABILITIES[currentPhase - 1]} hits ${
              target.isPlayer ? "your squad" : target.name
            } for ${dmg}${target.defending ? " (halved by Defend)" : ""}`,
          });
          if (target.squadHP <= 0) {
            target.defeated = true;
            logs.push({
              turn: turnNum,
              actor: "System",
              message: `${
                target.isPlayer ? "Your squad" : target.name + "'s squad"
              } is wiped out!`,
            });
          }
        }
        // Clear defending for all (was only for this turn)
        currentMembers.forEach((m) => {
          m.defending = false;
        });
      }

      // Phase transition check
      const hpRatio = currentBossHP / BOSS_MAX_HP;
      let newPhase: 1 | 2 | 3 | 4 = currentPhase;
      if (hpRatio <= 0.25 && currentPhase < 4) newPhase = 4;
      else if (hpRatio <= 0.5 && currentPhase < 3) newPhase = 3;
      else if (hpRatio <= 0.75 && currentPhase < 2) newPhase = 2;

      if (newPhase > currentPhase) {
        setPhase(newPhase);
        const label = PHASE_NAMES[newPhase - 1];
        setPhaseBanner({ phase: newPhase, label });
        logs.push({
          turn: turnNum,
          actor: "Leviathan",
          message: `enters Phase ${newPhase}: ${label} — gains ${PHASE_ABILITIES[newPhase - 1]}!`,
        });
        // Brief boss shake on phase transition
        if (!reducedMotion && mountedRef.current) {
          setShakeBoss(true);
          setTimeout(() => {
            if (mountedRef.current) setShakeBoss(false);
          }, 450);
        }
        if (mountedRef.current) {
          setTimeout(() => {
            if (mountedRef.current) setPhaseBanner(null);
          }, 1800);
        }
      }

      // End-state check
      let nextState: "active" | "victory" | "defeat" = "active";
      if (currentBossHP <= 0) nextState = "victory";
      else if (currentMembers.every((m) => m.defeated)) nextState = "defeat";

      // Commit
      setBossHP(currentBossHP);
      setRaidMembers(currentMembers);
      setRaidLog((prev) => [...prev, ...logs].slice(-40));
      setTurn((t2) => t2 + 1);

      if (nextState !== "active" && mountedRef.current) {
        setTimeout(() => {
          if (mountedRef.current) setRaidState(nextState);
        }, 600);
      }
    },
    [reducedMotion]
  );

  // ----- AUTO-PLAY EFFECT -----
  useEffect(() => {
    if (!autoPlay || raidState !== "active") return;
    const timeout = setTimeout(() => {
      processTurn("attack");
    }, TURN_DELAY_MS);
    return () => clearTimeout(timeout);
  }, [autoPlay, raidState, turn, raidMembers, processTurn]);

  // ----- ACTION HANDLERS -----
  const handleCastSkill = (crabIndex: number) => {
    setCastPickerOpen(false);
    processTurn("attack", crabIndex);
  };

  const handleDefend = () => {
    processTurn("defend");
  };

  const handleForfeit = () => {
    if (mountedRef.current) setRaidState("defeat");
  };

  // ----- LOG ACTOR COLOR -----
  const actorColor = (actor: string): string => {
    if (actor === "Leviathan") return "#FF3D5A";
    if (actor === "System") return "#7A5CFF";
    if (actor === player.name) return "#FFD166";
    return "#7CF5E1";
  };

  const hpRatio = bossHP / BOSS_MAX_HP;
  const playerMember = raidMembers[0];
  const playerDefeated = playerMember?.defeated === true;
  const rankedMembers = [...raidMembers].sort(
    (a, b) => b.contributionDamage - a.contributionDamage
  );
  const mvp = rankedMembers[0];

  // ============================ RENDER ============================

  return (
    <div
      className="fixed inset-0 z-[150] flex items-center justify-center p-3 md:p-6"
      style={{
        background: "rgba(4, 6, 18, 0.82)",
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
      }}
      onClick={onClose}
    >
      <style>{KEYFRAMES}</style>
      <div
        className="relative w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-2xl"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "linear-gradient(160deg, #06091c 0%, #0e1230 60%, #1a0e3a 100%)",
          border: "1px solid rgba(122,92,255,0.35)",
          boxShadow:
            "0 16px 64px rgba(122,92,255,0.35), inset 0 0 80px rgba(122,92,255,0.08)",
        }}
        role="dialog"
        aria-modal="true"
        aria-label="Leviathan World-Boss Raid"
      >
        {/* HEADER */}
        <div
          className="sticky top-0 z-10 flex items-center justify-between px-4 py-2"
          style={{
            background: "rgba(6,9,28,0.92)",
            borderBottom: "1px solid rgba(122,92,255,0.25)",
            backdropFilter: "blur(6px)",
          }}
        >
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-base shrink-0">🐉</span>
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-[0.18em] text-violet-300/70 truncate">
                World Boss Raid · Co-op
              </div>
              <div className="text-sm font-bold truncate" style={{ color: "#EAF6FF" }}>
                Leviathan of the Abyss
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-md text-white/60 hover:text-white hover:bg-white/10 shrink-0"
            aria-label="Close Leviathan raid modal"
          >
            ✕
          </button>
        </div>

        <div className="p-4">
          {/* ============== BRIEFING ============== */}
          {raidState === "briefing" && (
            <div className="space-y-3">
              {/* Hero banner */}
              <div
                className="relative rounded-2xl overflow-hidden p-4 md:p-5"
                style={{
                  background:
                    "linear-gradient(135deg, #06091c 0%, #1a1040 60%, #2a1a5e 100%)",
                  border: "1px solid rgba(122,92,255,0.4)",
                  boxShadow:
                    "0 0 24px rgba(122,92,255,0.25), inset 0 0 60px rgba(122,92,255,0.15)",
                }}
              >
                <div
                  className="absolute -top-12 -right-12 w-48 h-48 rounded-full pointer-events-none"
                  style={{
                    background:
                      "radial-gradient(circle, rgba(122,92,255,0.4), transparent 70%)",
                  }}
                  aria-hidden="true"
                />
                <div className="relative flex flex-col md:flex-row items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-[10px] uppercase tracking-[0.2em] text-violet-300/80 mb-1">
                      World Boss · Co-op Raid
                    </div>
                    <h2
                      className="text-2xl md:text-3xl font-bold mb-1.5"
                      style={{
                        fontFamily: "Fredoka, system-ui, sans-serif",
                        background:
                          "linear-gradient(135deg, #FFD166, #FF7A1A, #FF3D5A)",
                        WebkitBackgroundClip: "text",
                        WebkitTextFillColor: "transparent",
                        backgroundClip: "text",
                      }}
                    >
                      The Leviathan Stirs
                    </h2>
                    <p className="text-xs md:text-sm text-white/70 mb-3 max-w-md">
                      A slumbering titan wakens in the abyssal trench. Four squads
                      must answer the call before it surfaces and devours the reef.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <StatChip label="Boss HP" value={formatGold(BOSS_MAX_HP)} color="#FF3D5A" />
                      <StatChip label="Phases" value="4" color="#7A5CFF" />
                      <StatChip label="Recommended BP" value="4,000+" color="#FFD166" />
                    </div>
                  </div>
                  <div className="w-full md:w-56 shrink-0">
                    <LeviathanSilhouette phase={1} reduced={reducedMotion} />
                  </div>
                </div>
              </div>

              {/* Rewards pool */}
              <div
                className="rounded-xl p-3"
                style={{
                  background: "rgba(255,209,102,0.06)",
                  border: "1px solid rgba(255,209,102,0.18)",
                }}
              >
                <div className="text-[10px] uppercase tracking-wide text-amber-300/80 mb-1">
                  Rewards Pool
                </div>
                <div className="text-xs flex flex-wrap gap-x-3 gap-y-1 items-center">
                  <span>🥚 Legendary Egg shard</span>
                  <span className="flex items-center gap-0.5">
                    <GoldIcon size={12} /> 5,000 GOLD
                  </span>
                  <span>✨ 1,000 XP</span>
                  <span>🎏 Leviathan Banner cosmetic</span>
                </div>
              </div>

              {/* Squad picker — saved team via shared TeamSelect */}
              <div>
                <SectionTitle
                  icon={<span>🦀</span>}
                  title="Choose your raid team"
                />
                <TeamSelect
                  teams={player.teams}
                  crabs={player.crabs}
                  selectedTeamId={selectedTeamId}
                  onSelect={setSelectedTeamId}
                  requireIdle={true}
                  testIdPrefix="leviathan-team-select"
                />
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] font-bold">
                  <span style={{ color: "#FFD166" }}>
                    Squad BP {formatBP(playerBP)}
                  </span>
                  <span className="text-white/60">
                    {playerSquad.length}/5 members
                    {selectedTeam ? ` · ${selectedTeam.name}` : ""}
                  </span>
                  {!selectedTeamAvailability.available && (
                    <span style={{ color: "#FF6F91" }}>
                      {selectedTeamAvailability.reasons[0] ??
                        "No available team"}
                    </span>
                  )}
                </div>
              </div>

              {/* Co-op teammate preview */}
              <div>
                <SectionTitle icon={<span>🤝</span>} title="Co-op Teammates (NPC)" />
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {npcSquads.map((s, i) => {
                    const faction = FACTIONS[s.faction];
                    const bp = squadBP(s.crabs);
                    return (
                      <div
                        key={i}
                        className="rounded-xl p-2"
                        style={{
                          background: `linear-gradient(135deg, ${faction.colors.dark}cc, ${faction.colors.primary}11)`,
                          border: `1px solid ${faction.colors.primary}55`,
                        }}
                      >
                        <div className="flex items-center gap-1 mb-1">
                          <FactionBadge faction={s.faction} size={16} />
                          <span className="text-xs font-bold truncate">{s.name}</span>
                        </div>
                        <div className="text-[10px] opacity-70 mb-1 truncate">
                          {faction.name}
                        </div>
                        <div className="flex items-center justify-between">
                          <div className="flex gap-1">
                            {s.crabs.map((c, j) => (
                              <MiniCrabPortrait key={j} crab={c} size={20} />
                            ))}
                          </div>
                          <span
                            className="text-[10px] font-bold"
                            style={{ color: "#FFD166" }}
                          >
                            {formatBP(bp)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* CTA */}
              <div>
                <GlowButton
                  variant="violet"
                  size="lg"
                  onClick={handleJoinRaid}
                  disabled={
                    !selectedTeamAvailability.available ||
                    playerSquad.length !== 5
                  }
                  className="w-full"
                  title="Join the co-op raid"
                >
                  ⚔️ Join Raid ({RAID_COOLDOWN_LABEL})
                </GlowButton>
                {!selectedTeamAvailability.available && (
                  <div className="text-[10px] text-white/50 text-center mt-1">
                    {selectedTeamAvailability.reasons[0] ??
                      "Select an available team to join"}{" "}
                    ({playerSquad.length}/5)
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ============== ACTIVE ============== */}
          {raidState === "active" && (
            <div className="space-y-3">
              {/* Boss panel */}
              <div
                className="relative rounded-2xl overflow-hidden p-3"
                style={{
                  background:
                    "linear-gradient(160deg, #06091c 0%, #0e1230 60%, #1a0e3a 100%)",
                  border: `1px solid ${PHASE_COLORS[phase - 1].bright}55`,
                  boxShadow: `0 0 20px ${PHASE_COLORS[phase - 1].bright}33`,
                }}
              >
                {phaseBanner && (
                  <div
                    className="leviathan-phase-banner absolute inset-0 z-10 flex items-center justify-center pointer-events-none"
                    aria-live="assertive"
                  >
                    <div
                      className="px-4 py-1.5 rounded-xl text-center"
                      style={{
                        background: "rgba(0,0,0,0.65)",
                        border: `2px solid ${PHASE_COLORS[phaseBanner.phase - 1].bright}`,
                        boxShadow: `0 0 24px ${PHASE_COLORS[phaseBanner.phase - 1].bright}99`,
                      }}
                    >
                      <div className="text-[10px] uppercase tracking-[0.2em] text-white/70">
                        Phase {phaseBanner.phase}
                      </div>
                      <div
                        className="text-lg font-bold"
                        style={{
                          color: PHASE_COLORS[phaseBanner.phase - 1].bright,
                          fontFamily: "Fredoka, system-ui, sans-serif",
                        }}
                      >
                        {phaseBanner.label}!
                      </div>
                    </div>
                  </div>
                )}
                <LeviathanSilhouette
                  phase={phase}
                  reduced={reducedMotion}
                  shaking={shakeBoss}
                />
                <div className="mt-2">
                  <div className="flex items-end justify-between mb-1">
                    <div
                      className="text-sm font-bold tracking-wide"
                      style={{ color: PHASE_COLORS[phase - 1].bright }}
                    >
                      THE LEVIATHAN
                    </div>
                    <div className="text-[11px] text-white/70">
                      {formatGold(bossHP)} / {formatGold(BOSS_MAX_HP)} HP
                    </div>
                  </div>
                  <div
                    className="relative h-6 rounded-full overflow-hidden"
                    style={{
                      background: "rgba(0,0,0,0.55)",
                      border: "1px solid rgba(122,92,255,0.4)",
                      boxShadow: "inset 0 0 8px rgba(0,0,0,0.8)",
                    }}
                    role="progressbar"
                    aria-valuenow={Math.round(hpRatio * 100)}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label="Leviathan HP"
                  >
                    <div
                      className="h-full transition-all duration-500 ease-out"
                      style={{
                        width: `${hpRatio * 100}%`,
                        background: `linear-gradient(90deg, ${
                          PHASE_COLORS[phase - 1].dark
                        } 0%, ${PHASE_COLORS[phase - 1].bright} 100%)`,
                        boxShadow: `0 0 12px ${PHASE_COLORS[phase - 1].bright}`,
                      }}
                    />
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <div className="flex gap-1.5 items-center flex-wrap">
                      {[1, 2, 3, 4].map((p) => (
                        <div key={p} className="flex items-center gap-1">
                          <span
                            className="rounded-full transition-all"
                            style={{
                              width: phase === p ? 12 : 8,
                              height: phase === p ? 12 : 8,
                              background:
                                phase === p
                                  ? PHASE_COLORS[p - 1].bright
                                  : phase > p
                                  ? "rgba(255,255,255,0.2)"
                                  : "rgba(255,255,255,0.4)",
                              boxShadow:
                                phase === p
                                  ? `0 0 8px ${PHASE_COLORS[p - 1].bright}`
                                  : "none",
                            }}
                          />
                          <span
                            className="text-[9px] uppercase tracking-wide"
                            style={{
                              color:
                                phase === p
                                  ? PHASE_COLORS[p - 1].bright
                                  : "rgba(255,255,255,0.4)",
                            }}
                          >
                            {PHASE_NAMES[p - 1]}
                          </span>
                        </div>
                      ))}
                    </div>
                    <div className="text-[11px] text-white/60 shrink-0 ml-2">
                      Turn {turn}
                    </div>
                  </div>
                </div>
              </div>

              {/* Squad cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {raidMembers.map((m) => (
                  <SquadCard key={m.id} member={m} />
                ))}
              </div>

              {/* Action bar */}
              <GlassPanel className="p-3" glow="rgba(122,92,255,0.2)">
                {castPickerOpen && !playerDefeated && !autoPlay && (
                  <div className="mb-2 grid grid-cols-5 gap-1">
                    {playerSquad.map((c, i) => {
                      const classDef = CLASSES[c.classId];
                      return (
                        <button
                          key={c.id}
                          onClick={() => handleCastSkill(i)}
                          className="rounded-lg p-2 text-left transition-all hover:-translate-y-0.5"
                          style={{
                            background: "rgba(122,92,255,0.12)",
                            border: "1px solid rgba(122,92,255,0.3)",
                          }}
                          aria-label={`Cast ${classDef.activeSkill.name} with ${c.name}`}
                        >
                          <div className="flex items-center gap-1 mb-0.5">
                            <MiniCrabPortrait crab={c} size={20} />
                            <span className="text-[10px] font-bold truncate">
                              {c.name}
                            </span>
                          </div>
                          <div className="text-[9px] opacity-70 truncate">
                            ⚡ {classDef.activeSkill.name}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => setAutoPlay((a) => !a)}
                    className="px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1 transition-all"
                    style={{
                      background: autoPlay ? "rgba(255,209,102,0.2)" : "rgba(255,255,255,0.06)",
                      border: `1px solid ${autoPlay ? "#FFD166" : "rgba(255,255,255,0.18)"}`,
                      color: autoPlay ? "#FFD166" : "#EAF6FF",
                    }}
                    aria-label={`Auto-raid ${autoPlay ? "on" : "off"}`}
                    aria-pressed={autoPlay}
                  >
                    <span className={autoPlay ? "" : "opacity-50"}>▶</span>
                    Auto-raid
                  </button>
                  <GlowButton
                    variant="gold"
                    size="sm"
                    onClick={() => setCastPickerOpen((o) => !o)}
                    disabled={autoPlay || playerDefeated}
                    title="Cast a crab skill (pick which crab attacks)"
                    className="flex-1 min-w-[100px]"
                  >
                    ⚡ Cast Skill
                  </GlowButton>
                  <GlowButton
                    variant="teal"
                    size="sm"
                    onClick={handleDefend}
                    disabled={autoPlay || playerDefeated}
                    title="Defend: halve incoming boss damage this turn"
                    className="flex-1 min-w-[90px]"
                  >
                    🛡️ Defend
                  </GlowButton>
                  <GlowButton
                    variant="rose"
                    size="sm"
                    onClick={handleForfeit}
                    disabled={autoPlay}
                    title="Forfeit the raid"
                  >
                    🏳️ Forfeit
                  </GlowButton>
                </div>
              </GlassPanel>

              {/* Raid log */}
              <GlassPanel className="p-2">
                <div className="text-[10px] uppercase tracking-wide text-white/50 mb-1">
                  Raid Log
                </div>
                <div
                  className="max-h-32 overflow-y-auto text-[11px] space-y-0.5 pr-1"
                  style={{
                    scrollbarWidth: "thin",
                  }}
                >
                  {raidLog
                    .slice()
                    .reverse()
                    .map((entry, i) => (
                      <div key={i} className="flex gap-1.5 leading-snug">
                        <span className="text-white/40 shrink-0">T{entry.turn}</span>
                        <span
                          className="font-bold shrink-0"
                          style={{ color: actorColor(entry.actor) }}
                        >
                          {entry.actor}:
                        </span>
                        <span className="text-white/80">{entry.message}</span>
                      </div>
                    ))}
                  {raidLog.length === 0 && (
                    <div className="text-white/40 text-[10px]">
                      Awaiting first move...
                    </div>
                  )}
                </div>
              </GlassPanel>
            </div>
          )}

          {/* ============== VICTORY ============== */}
          {raidState === "victory" && (
            <div className="text-center py-3">
              <BossExplosion reduced={reducedMotion} />
              <h2
                className="text-3xl md:text-4xl font-bold mb-1"
                style={{
                  fontFamily: "Fredoka, system-ui, sans-serif",
                  background: "linear-gradient(135deg, #FFD166, #FF7A1A)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                }}
              >
                RAID VICTORY
              </h2>
              <p className="text-sm text-white/70 mb-4">
                The Leviathan falls. The abyssal trench grows still.
              </p>

              {/* Leaderboard */}
              <div
                className="rounded-2xl p-3 mb-4 text-left"
                style={{
                  background: "rgba(15,20,45,0.6)",
                  border: "1px solid rgba(255,209,102,0.3)",
                }}
              >
                <div className="text-[10px] uppercase tracking-wide text-amber-300/80 mb-2">
                  Damage Leaderboard
                </div>
                <div className="space-y-1">
                  {rankedMembers.map((m, i) => (
                    <div
                      key={m.id}
                      className="flex items-center gap-2 px-2 py-1.5 rounded-lg"
                      style={{
                        background:
                          i === 0 ? "rgba(255,209,102,0.12)" : "rgba(255,255,255,0.03)",
                        border:
                          i === 0
                            ? "1px solid rgba(255,209,102,0.4)"
                            : "1px solid transparent",
                      }}
                    >
                      <span
                        className="text-xs font-bold w-6 text-left shrink-0"
                        style={{ color: i === 0 ? "#FFD166" : "#fff" }}
                      >
                        #{i + 1}
                      </span>
                      <FactionBadge faction={m.faction} size={16} />
                      <span className="text-xs font-bold flex-1 text-left truncate min-w-0">
                        {m.isPlayer ? "★ You" : m.name}
                        {i === 0 && mvp && (
                          <span
                            className="ml-2 text-[9px] px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wide"
                            style={{ background: "#FFD166", color: "#0A1B3D" }}
                          >
                            MVP
                          </span>
                        )}
                      </span>
                      <span
                        className="text-xs font-bold shrink-0"
                        style={{ color: "#FFD166" }}
                      >
                        {formatGold(m.contributionDamage)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Loot chest reveal */}
              <div className="mb-3">
                <img
                  src="/art/ui/treasure-chest.png"
                  alt="Loot chest"
                  width={88}
                  height={88}
                  className={reducedMotion ? "mx-auto" : "mx-auto leviathan-chest"}
                  style={{
                    filter: "drop-shadow(0 0 16px rgba(255,209,102,0.7))",
                  }}
                />
                <div className="text-[10px] uppercase tracking-wide text-amber-300/80 mt-1">
                  Loot Chest
                </div>
              </div>

              {/* Reward cards */}
              <div className="grid grid-cols-3 gap-2 mb-4">
                <RewardCard
                  icon={<GoldIcon size={22} />}
                  label="Gold"
                  value="5,000"
                  color="#FFD166"
                />
                <RewardCard
                  icon={<span className="text-2xl">✨</span>}
                  label="XP"
                  value="1,000"
                  color="#7A5CFF"
                />
                <RewardCard
                  icon={<span className="text-2xl">🎏</span>}
                  label="Cosmetic"
                  value="Banner"
                  color="#FF7A1A"
                />
              </div>

              <GlowButton
                variant="gold"
                size="lg"
                onClick={onClose}
                className="w-full"
                title="Close the raid modal"
              >
                Close
              </GlowButton>
            </div>
          )}

          {/* ============== DEFEAT ============== */}
          {raidState === "defeat" && (
            <div className="text-center py-3">
              <div className="text-5xl mb-2" aria-hidden="true">
                💀
              </div>
              <h2
                className="text-3xl font-bold mb-2"
                style={{ color: "#FF3D5A" }}
              >
                Raid Failed
              </h2>
              <p className="text-sm text-white/70 mb-4 max-w-md mx-auto">
                The Leviathan drove you back. Try again with a stronger squad.
              </p>

              <div
                className="rounded-xl p-3 mb-4 text-left max-w-md mx-auto"
                style={{
                  background: "rgba(15,20,45,0.6)",
                  border: "1px solid rgba(255,111,145,0.3)",
                }}
              >
                <div className="text-[10px] uppercase tracking-wide text-rose-300/80 mb-2">
                  Tips for next time
                </div>
                <ul className="text-xs text-white/80 space-y-1">
                  <li>• Bring a healer (Shellmender) to sustain through phase 3+</li>
                  <li>• Aim for 4,000+ team BP to break phase-2 armor</li>
                  <li>• Coordinate Defend when the Leviathan's eyes turn crimson</li>
                </ul>
              </div>

              <div className="text-xs text-white/60 mb-3">
                Consolation: 100 GOLD has been added to your vault.
              </div>

              <GlowButton
                variant="ghost"
                size="lg"
                onClick={onClose}
                className="w-full"
                title="Close the raid modal"
              >
                Close
              </GlowButton>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
