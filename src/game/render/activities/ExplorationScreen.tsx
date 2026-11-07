// Crabtopia - Exploration activity screen ("Tide Wilderness")
// 5x5 tile grid exploration. Each reveal costs 1 ticket. Tiles hold chests,
// enemies (mini auto-battle), traps, or nothing. Fully playable — every reveal
// produces real gold/materials/debuffs persisted to localStorage.
"use client";

import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useGame } from "../../store/gameStore";
import {
  GlowButton,
  GlassPanel,
  GoldIcon,
  formatGold,
  rarityColor,
} from "../ui";
import CrabSprite from "../CrabSprite";
import { useLocalStorage } from "../useLocalStorage";
import {
  MATERIALS,
  type MaterialId,
} from "../../data/materials";
import {
  EXPLORATION_KEY,
  DEFAULT_EXPLORATION,
  INV_KEY,
  DEFAULT_INVENTORY,
  BUFFS_KEY,
  DEFAULT_BUFFS,
  MAX_EXPLORATION_TICKETS,
  EXPLORATION_DAY_MS,
  addMaterials,
  type ExplorationState,
  type InventoryState,
  type BuffsState,
} from "../useLocalStorage";
import { mulberry32, randInt, pick } from "../../engine/rng";
import { generateCrab } from "../../engine/crabs";
import type { Crab } from "../../types";
import TeamSelect from "../TeamSelect";
import CrabRenderer from "../CrabRenderer";
import { firstAvailableTeam } from "../../engine/teamEligibility";
import {
  resolveTeamFormation,
  deploymentOrder,
} from "../../engine/formation";
import {
  resolveEncounter,
  encounterLevel,
} from "../../engine/expeditions";

// ---------- TILE CONTENT MODEL ----------

type TileContent = "chest" | "enemy" | "trap" | "empty";

const CONTENT_META: Record<
  TileContent,
  { icon: string; label: string; gradient: string }
> = {
  chest: {
    icon: "🪙",
    label: "Chest",
    gradient: "linear-gradient(160deg, #FFD16633, #FF7A1A22)",
  },
  enemy: {
    icon: "⚔️",
    label: "Foe",
    gradient: "linear-gradient(160deg, #FF4D6D33, #8C2D5222)",
  },
  trap: {
    icon: "🪤",
    label: "Trap",
    gradient: "linear-gradient(160deg, #7A5CFF33, #2A1A6B22)",
  },
  empty: {
    icon: "··",
    label: "Empty",
    gradient: "linear-gradient(160deg, #12A7A022, #0A4A6611)",
  },
};

function tileContent(seed: number, idx: number): TileContent {
  const rng = mulberry32((seed * 7919 + idx * 2654435761) >>> 0);
  const r = rng();
  if (r < 0.25) return "chest";
  if (r < 0.5) return "enemy";
  if (r < 0.7) return "trap";
  return "empty";
}

// Pick 1-2 mining-sourced materials for chest loot.
function chestMaterials(rng: () => number, count: number): Partial<Record<MaterialId, number>> {
  const pool: MaterialId[] = (Object.keys(MATERIALS) as MaterialId[]).filter(
    (m) => MATERIALS[m].source !== "exploration"
  );
  const out: Partial<Record<MaterialId, number>> = {};
  for (let i = 0; i < count; i++) {
    const m = pick(pool, rng);
    out[m] = (out[m] ?? 0) + 1;
  }
  return out;
}

// ---------- BATTLE MODEL ----------

interface BattleState {
  champion: Crab | null;
  enemy: Crab;
  champHp: number;
  champMaxHp: number;
  enemyHp: number;
  champDmgDealt: number;
  enemyDmgDealt: number;
  phase: "intro" | "enemyHit" | "champHit" | "done";
  winner: "champion" | "enemy" | "fled";
  teamName: string;
  teamMembers: Crab[];
}

// ---------- COMPONENT ----------

export default function ExplorationScreen() {
  const setScreen = useGame((s) => s.setScreen);
  const pushToast = useGame((s) => s.pushToast);
  const creditGold = useGame((s) => s.creditGold);
  const spendGold = useGame((s) => s.spendGold);
  const player = useGame((s) => s.player);

  const [expl, setExpl] = useLocalStorage<ExplorationState>(
    EXPLORATION_KEY,
    DEFAULT_EXPLORATION
  );
  const [inv, setInv] = useLocalStorage<InventoryState>(
    INV_KEY,
    DEFAULT_INVENTORY
  );
  const [buffs, setBuffs] = useLocalStorage<BuffsState>(
    BUFFS_KEY,
    DEFAULT_BUFFS
  );

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Daily ticket refresh.
  useEffect(() => {
    if (now - expl.lastResetAt >= EXPLORATION_DAY_MS && expl.tickets < MAX_EXPLORATION_TICKETS) {
      setExpl((prev) => ({
        ...prev,
        tickets: MAX_EXPLORATION_TICKETS,
        lastResetAt: Date.now(),
      }));
      pushToast({
        title: "Exploration tickets refreshed!",
        description: "3 new tickets granted.",
        variant: "success",
      });
    }
  }, [now]);

  // Active reveal animation + outcome.
  const [revealingIdx, setRevealingIdx] = useState<number | null>(null);
  const [battle, setBattle] = useState<BattleState | null>(null);
  const [trapFlash, setTrapFlash] = useState(false);

  // Expedition team: a saved team, auto-selected to the first available
  // team so a new player can explore immediately.
  const teams = useMemo(() => player?.teams ?? [], [player]);
  const crabs = useMemo(() => player?.crabs ?? [], [player]);
  const crabsById = useMemo(
    () => new Map(crabs.map((c) => [c.id, c] as const)),
    [crabs]
  );
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(
    () => firstAvailableTeam(teams, crabsById)?.id ?? null
  );
  const selectedTeam = useMemo(
    () => teams.find((t) => t.id === selectedTeamId) ?? null,
    [teams, selectedTeamId]
  );
  const teamCrabs = useMemo(
    () =>
      selectedTeam
        ? selectedTeam.crabIds
            .filter(Boolean)
            .map((id) => crabsById.get(id as string))
            .filter(Boolean) as Crab[]
        : [],
    [selectedTeam, crabsById]
  );

  const tiles = useMemo(
    () =>
      Array.from({ length: 25 }, (_, i) => ({
        idx: i,
        content: tileContent(expl.mapSeed, i),
        revealed: !!expl.revealed[i],
      })),
    [expl.mapSeed, expl.revealed]
  );

  function handleResetMap() {
    if (!spendGold(100)) {
      pushToast({
        title: "Need 100 gold to reset the map.",
        variant: "error",
      });
      return;
    }
    setExpl((prev) => ({
      ...prev,
      mapSeed: Math.floor(Math.random() * 1_000_000),
      revealed: {},
    }));
    pushToast({
      title: "New wilderness charted!",
      description: "A fresh 5x5 map awaits.",
      variant: "success",
    });
  }

  function handleReveal(idx: number) {
    if (expl.revealed[idx]) return;
    if (revealingIdx !== null || battle !== null) return;
    if (!selectedTeam || teamCrabs.length === 0) {
      pushToast({
        title: "Select an available team first",
        description: "Exploration needs an available team of 5 idle crabs.",
        variant: "error",
      });
      return;
    }
    if (expl.tickets <= 0) {
      pushToast({
        title: "No tickets left!",
        description: "Wait for daily refresh or reset the map.",
        variant: "error",
      });
      return;
    }
    if (expl.revealed[idx]) return;
    if (revealingIdx !== null || battle !== null) return;

    // Spend a ticket + mark revealed.
    setExpl((prev) => ({
      ...prev,
      tickets: prev.tickets - 1,
      revealed: { ...prev.revealed, [idx]: true },
    }));
    setRevealingIdx(idx);

    const content = tileContent(expl.mapSeed, idx);

    // After the flip animation (300ms), resolve content.
    setTimeout(() => {
      resolveTile(idx, content);
    }, 320);
  }

  function resolveTile(idx: number, content: TileContent) {
    const rng = mulberry32((expl.mapSeed * 31 + idx * 40503) >>> 0);

    if (content === "chest") {
      const gold = randInt(50, 200, rng);
      let matCount = randInt(1, 2, rng);
      // Apply Lucky Charm buff: +1 material per chest while charges remain.
      if (buffs.dropRate && buffs.dropRate.charges > 0) {
        matCount += 1;
        setBuffs((prev) => {
          if (!prev.dropRate) return prev;
          const charges = prev.dropRate.charges - 1;
          if (charges <= 0) {
            const next = { ...prev };
            delete next.dropRate;
            return next;
          }
          return {
            ...prev,
            dropRate: { percent: prev.dropRate.percent, charges },
          };
        });
      }
      const mats = chestMaterials(rng, matCount);
      creditGold(gold);
      setInv((prev) => addMaterials(prev, mats));
      const matSummary = Object.entries(mats)
        .map(([mid, n]) => `${MATERIALS[mid as MaterialId].icon} ×${n}`)
        .join(" ");
      pushToast({
        title: "Treasure chest!",
        description: `Found ${formatGold(gold)} gold, ${matSummary}.`,
        variant: "success",
      });
      setRevealingIdx(null);
    } else if (content === "enemy") {
      // Spawn an enemy crab scaled to the expedition team's level.
      const enemySeed = (expl.mapSeed * 31 + idx * 40503) >>> 0;
      const enemy = generateCrab({
        seed: enemySeed,
        level: Math.max(
          1,
          (teamCrabs.length > 0 ? encounterLevel(teamCrabs) : 5) +
            randInt(-2, 2, rng)
        ),
        ownerId: "enemy",
      });
      if (!selectedTeam || teamCrabs.length === 0) {
        // No expedition team — fled with no loot.
        setBattle({
          champion: null,
          enemy,
          champHp: 0,
          champMaxHp: 1,
          enemyHp: enemy.stats.hp,
          champDmgDealt: 0,
          enemyDmgDealt: 0,
          phase: "done",
          winner: "fled",
          teamName: "",
          teamMembers: [],
        });
        return;
      }
      const result = resolveEncounter(teamCrabs, enemy, enemySeed);
      const orderedMembers = deploymentOrder(
        resolveTeamFormation(selectedTeam)
      )
        .map((id) => crabsById.get(id))
        .filter(Boolean) as Crab[];
      const face = orderedMembers[0] ?? teamCrabs[0];

      setBattle({
        champion: face,
        enemy,
        champHp: result.teamHpLeft,
        champMaxHp: result.teamMaxHp,
        enemyHp: result.enemyHpLeft,
        champDmgDealt: result.teamDamage,
        enemyDmgDealt: result.enemyDamage,
        phase: "intro",
        winner: result.winner === "team" ? "champion" : "enemy",
        teamName: selectedTeam.name,
        teamMembers: orderedMembers.length > 0 ? orderedMembers : teamCrabs,
      });
      // The battle overlay itself drives the phased animation + rewards.
    } else if (content === "trap") {
      setTrapFlash(true);
      setBuffs((prev) => ({ ...prev, trapDebuff: true }));
      setTimeout(() => setTrapFlash(false), 600);
      pushToast({
        title: "🪤 Trap sprung!",
        description: "Expedition team takes -20% HP next arena battle",
        variant: "error",
      });
      setRevealingIdx(null);
    } else {
      pushToast({
        title: "Nothing here...",
        description: "The tide washed this tile bare.",
        variant: "default",
      });
      setRevealingIdx(null);
    }
  }

  // Drive the phased battle animation + rewards once a battle is set.
  useEffect(() => {
    if (!battle || battle.phase === "done") return;
    const timers: number[] = [];
    if (battle.phase === "intro") {
      timers.push(
        window.setTimeout(
          () => setBattle((b) => (b ? { ...b, phase: "enemyHit" } : b)),
          700
        )
      );
    }
    if (battle.phase === "enemyHit") {
      timers.push(
        window.setTimeout(
          () => setBattle((b) => (b ? { ...b, phase: "champHit" } : b)),
          700
        )
      );
    }
    if (battle.phase === "champHit") {
      timers.push(
        window.setTimeout(() => {
          // Resolve rewards.
          if (battle.winner === "champion" && battle.champion) {
            const rng = mulberry32(
              (expl.mapSeed * 131 + battle.champion.visualSeed) >>> 0
            );
            const gold = randInt(80, 250, rng);
            const mats = chestMaterials(rng, randInt(1, 3, rng));
            creditGold(gold);
            setInv((prev) => addMaterials(prev, mats));
            const matSummary = Object.entries(mats)
              .map(([mid, n]) => `${MATERIALS[mid as MaterialId].icon} ×${n}`)
              .join(" ");
            pushToast({
              title: `${battle.teamName || battle.champion.name} triumphed!`,
              description: `Loot: ${formatGold(gold)} gold, ${matSummary}.`,
              variant: "success",
            });
          } else if (battle.winner === "enemy") {
            pushToast({
              title: "Your expedition team was driven back...",
              description: "No loot recovered.",
              variant: "error",
            });
          } else {
            pushToast({
              title: "No champion available — you fled!",
              variant: "warning",
            });
          }
          setBattle((b) => (b ? { ...b, phase: "done" } : b));
        }, 900)
      );
    }
    return () => timers.forEach(clearTimeout);
  }, [battle?.phase]);

  function closeBattle() {
    setBattle(null);
    setRevealingIdx(null);
  }

  return (
    <div
      className="min-h-screen w-full text-[#EAF6FF]"
      style={{
        background: "linear-gradient(180deg, #0A1B3D 0%, #06122B 100%)",
      }}
    >
      {/* Trap red flash overlay */}
      <AnimatePresence>
        {trapFlash && (
          <motion.div
            className="fixed inset-0 z-50 pointer-events-none"
            style={{ background: "#FF4D6D" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 0.35, 0] }}
            transition={{ duration: 0.6 }}
          />
        )}
      </AnimatePresence>

      <div className="mx-auto max-w-3xl px-3 py-4 md:px-6 md:py-6">
        {/* Header */}
        <div className="mb-4 flex items-center justify-between gap-2">
          <GlowButton
            variant="ghost"
            size="sm"
            onClick={() => setScreen("arena")}
          >
            ← Back
          </GlowButton>
          <h1
            className="flex-1 text-center text-xl md:text-2xl font-bold"
            style={{ fontFamily: "Fredoka, system-ui, sans-serif" }}
          >
            🗺️ Tide Wilderness
          </h1>
          <GlassPanel className="px-3 py-1.5">
            <div className="flex items-center gap-1.5 text-sm font-bold">
              <span style={{ color: "#FFD166" }}>🎟️</span>
              <span className="font-display">
                {expl.tickets}/{MAX_EXPLORATION_TICKETS}
              </span>
            </div>
          </GlassPanel>
        </div>

        {/* Sub-header: reset map */}
        <div className="mb-4 flex items-center justify-between gap-2">
          <div className="text-[11px] text-white/60">
            {now - expl.lastResetAt >= EXPLORATION_DAY_MS
              ? "Tickets ready to refresh!"
              : `Tickets refresh in ${Math.max(
                  0,
                  Math.ceil(
                    (EXPLORATION_DAY_MS - (now - expl.lastResetAt)) / 3600000
                  )
                )}h`}
          </div>
          <GlowButton
            variant="gold"
            size="sm"
            onClick={handleResetMap}
            disabled={revealingIdx !== null || battle !== null}
          >
            🔄 Reset Map <GoldIcon size={12} /> 100
          </GlowButton>
        </div>

        {/* Expedition team */}
        <GlassPanel className="mb-4 px-3 py-3">
          <div className="mb-2 text-xs font-bold uppercase tracking-wide text-white/70">
            🧭 Expedition Team
          </div>
          <TeamSelect
            teams={teams}
            crabs={crabs}
            selectedTeamId={selectedTeamId}
            onSelect={setSelectedTeamId}
            requireIdle={true}
            testIdPrefix="exploration-team-select"
          />
          {!selectedTeam && (
            <div
              className="mt-2 text-[11px] font-bold"
              style={{ color: "#FF6F91" }}
            >
              Select an available team first — exploration needs a team of 5
              idle crabs.
            </div>
          )}
        </GlassPanel>

        {/* 5x5 grid */}
        <div
          className="grid grid-cols-5 gap-1.5 md:gap-2"
          style={{ perspective: "600px" }}
        >
          {tiles.map((tile) => {
            const isRevealing = revealingIdx === tile.idx;
            const meta = CONTENT_META[tile.content];
            const disabled =
              tile.revealed ||
              expl.tickets <= 0 ||
              revealingIdx !== null ||
              battle !== null;
            return (
              <button
                key={tile.idx}
                onClick={() => handleReveal(tile.idx)}
                disabled={disabled}
                className="relative aspect-square w-full"
                style={{ transformStyle: "preserve-3d" }}
                aria-label={
                  tile.revealed
                    ? `${meta.label} tile`
                    : "Unexplored tile"
                }
              >
                {!tile.revealed && !isRevealing && (
                  <motion.div
                    className="absolute inset-0 flex items-center justify-center rounded-lg text-lg font-bold"
                    style={{
                      background:
                        "linear-gradient(160deg, rgba(10,27,61,0.85), rgba(6,18,43,0.95))",
                      border: "1px solid rgba(124,245,225,0.18)",
                      color: "rgba(124,245,225,0.55)",
                    }}
                    whileHover={
                      disabled ? undefined : { y: -3, scale: 1.04 }
                    }
                    transition={{ duration: 0.15 }}
                  >
                    ?
                  </motion.div>
                )}
                {(tile.revealed || isRevealing) && (
                  <motion.div
                    className="absolute inset-0 flex flex-col items-center justify-center rounded-lg text-base md:text-lg"
                    style={{
                      background: meta.gradient,
                      border: `1px solid ${
                        tile.content === "chest"
                          ? "#FFD16655"
                          : tile.content === "enemy"
                          ? "#FF4D6D55"
                          : tile.content === "trap"
                          ? "#7A5CFF55"
                          : "rgba(124,245,225,0.18)"
                      }`,
                    }}
                    initial={{ rotateY: 90, opacity: 0 }}
                    animate={{ rotateY: 0, opacity: 1 }}
                    transition={{ duration: 0.3 }}
                  >
                    <span style={{ filter: "drop-shadow(0 0 4px rgba(0,0,0,0.5))" }}>
                      {meta.icon}
                    </span>
                  </motion.div>
                )}
              </button>
            );
          })}
        </div>

        {/* Legend */}
        <GlassPanel className="mt-4 px-3 py-2">
          <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[10px] text-white/60">
            <span>🪙 Chest</span>
            <span>⚔️ Foe</span>
            <span>🪤 Trap</span>
            <span>·· Empty</span>
          </div>
        </GlassPanel>
      </div>

      {/* Battle overlay */}
      <AnimatePresence>
        {battle && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center p-3"
            style={{ background: "rgba(6,18,43,0.88)" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <GlassPanel className="w-full max-w-md p-4" glow="rgba(255,77,109,0.4)">
              <div className="mb-3 text-center text-sm font-bold uppercase tracking-wide text-white/70">
                {battle.phase === "done"
                  ? battle.winner === "champion"
                    ? "Victory!"
                    : battle.winner === "enemy"
                    ? "Defeat..."
                    : "Fled"
                  : "Wild Encounter"}
              </div>

              <div className="flex items-center justify-between gap-2">
                {/* Expedition team (champion = first deployed member, as the face) */}
                <div className="flex flex-1 flex-col items-center">
                  <div className="text-[10px] uppercase text-white/50">
                    Team
                  </div>
                  {battle.champion ? (
                    <>
                      {battle.teamMembers.length > 0 ? (
                        <div className="flex flex-wrap items-center justify-center gap-1 max-w-[180px]">
                          {battle.teamMembers.map((c) => (
                            <CrabRenderer
                              key={c.id}
                              crab={c}
                              size={44}
                            />
                          ))}
                        </div>
                      ) : (
                        <CrabSprite crab={battle.champion} size={96} />
                      )}
                      <div className="mt-1 text-xs font-bold text-center">
                        {battle.teamName || battle.champion.name}
                      </div>
                      <div className="text-[9px] uppercase tracking-wide text-white/50">
                        Team HP
                      </div>
                      <HpBar
                        current={Math.max(0, battle.champHp)}
                        max={battle.champMaxHp || battle.champion.stats.hp}
                      />
                    </>
                  ) : (
                    <div className="flex h-24 items-center text-xs text-white/40">
                      No crab
                    </div>
                  )}
                </div>

                <div className="self-center text-xl">⚡</div>

                {/* Enemy */}
                <div className="flex flex-1 flex-col items-center">
                  <div className="text-[10px] uppercase text-white/50">Foe</div>
                  <CrabSprite crab={battle.enemy} size={96} />
                  <div className="mt-1 text-xs font-bold text-center">
                    {battle.enemy.name}
                  </div>
                  <HpBar
                    current={Math.max(0, battle.enemyHp)}
                    max={battle.enemy.stats.hp}
                  />
                </div>
              </div>

              {/* Damage numbers */}
              <div className="mt-3 flex h-6 items-center justify-center gap-6 text-sm font-bold">
                {battle.phase !== "intro" &&
                  battle.phase !== "done" &&
                  battle.enemyDmgDealt > 0 && (
                    <motion.span
                      key={`ed-${battle.phase}`}
                      initial={{ y: 0, opacity: 0 }}
                      animate={{ y: -16, opacity: [0, 1, 0] }}
                      transition={{ duration: 0.7 }}
                      style={{ color: "#FF4D6D" }}
                    >
                      -{battle.enemyDmgDealt}
                    </motion.span>
                  )}
                {battle.phase === "champHit" &&
                  battle.champDmgDealt > 0 && (
                    <motion.span
                      key={`cd-${battle.phase}`}
                      initial={{ y: 0, opacity: 0 }}
                      animate={{ y: -16, opacity: [0, 1, 0] }}
                      transition={{ duration: 0.7 }}
                      style={{ color: "#FFD166" }}
                    >
                      -{battle.champDmgDealt}
                    </motion.span>
                  )}
              </div>

              {battle.phase === "done" && (
                <GlowButton
                  variant="teal"
                  size="md"
                  className="mt-2 w-full"
                  onClick={closeBattle}
                >
                  Continue
                </GlowButton>
              )}
            </GlassPanel>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ---------- HP BAR ----------

function HpBar({ current, max }: { current: number; max: number }) {
  const pct = Math.max(0, Math.min(1, current / max));
  return (
    <div className="mt-1 h-2 w-24 overflow-hidden rounded-full" style={{ background: "rgba(255,255,255,0.1)" }}>
      <motion.div
        className="h-full rounded-full"
        style={{
          background:
            pct > 0.5
              ? "linear-gradient(90deg,#4FB477,#7CF5E1)"
              : pct > 0.2
              ? "linear-gradient(90deg,#FFD166,#FF7A1A)"
              : "#FF4D6D",
        }}
        animate={{ width: `${pct * 100}%` }}
        transition={{ duration: 0.4 }}
      />
    </div>
  );
}
