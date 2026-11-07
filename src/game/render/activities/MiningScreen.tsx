// Crabtopia - Mining activity screen ("Crystal Mines")
// Self-contained: uses useGame for pushToast/addGold only; mining state lives in
// localStorage via useLocalStorage. Fully playable — every Mine click yields real
// materials, consumes energy, and starts a node cooldown.
"use client";

import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useGame } from "../../store/gameStore";
import {
  GlowButton,
  GlassPanel,
  EmptyState,
  formatTime,
  rarityColor,
} from "../ui";
import { useLocalStorage } from "../useLocalStorage";
import {
  MINING_NODES,
  MATERIALS,
  rollNodeDrops,
  type MaterialId,
  type MiningNodeDef,
} from "../../data/materials";
import {
  MINING_KEY,
  DEFAULT_MINING,
  MAX_MINING_ENERGY,
  MINING_REGEN_MS,
  INV_KEY,
  DEFAULT_INVENTORY,
  addMaterials,
  type MiningState,
  type InventoryState,
} from "../useLocalStorage";
import { mulberry32 } from "../../engine/rng";
import TeamSelect from "../TeamSelect";
import CrabRenderer from "../CrabRenderer";
import { firstAvailableTeam } from "../../engine/teamEligibility";
import {
  expeditionStats,
  miningYieldBonus,
  applyMiningBonus,
} from "../../engine/expeditions";

// Format a drop preview line for a node card.
function dropPreview(node: MiningNodeDef): string {
  return node.drops
    .map((d) => `${MATERIALS[d.materialId].icon} ${MATERIALS[d.materialId].name}`)
    .join("  ");
}

interface FloatingGain {
  id: number;
  materialId: MaterialId;
  amount: number;
  x: number;
  y: number;
}

export default function MiningScreen() {
  const setScreen = useGame((s) => s.setScreen);
  const pushToast = useGame((s) => s.pushToast);
  const player = useGame((s) => s.player);

  const teams = useMemo(() => player?.teams ?? [], [player]);
  const crabs = useMemo(() => player?.crabs ?? [], [player]);
  const crabsById = useMemo(
    () => new Map(crabs.map((c) => [c.id, c] as const)),
    [crabs]
  );
  // Auto-select the first available team so a new player (starter
  // "Tideband" of 5 idle rookies) can mine immediately.
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
            .filter(Boolean) as typeof crabs
        : [],
    [selectedTeam, crabsById]
  );
  const teamStats = useMemo(() => expeditionStats(teamCrabs), [teamCrabs]);
  const yieldBonus = useMemo(() => miningYieldBonus(teamCrabs), [teamCrabs]);
  const hasAvailableTeam = useMemo(
    () => firstAvailableTeam(teams, crabsById) !== null,
    [teams, crabsById]
  );

  const [mining, setMining] = useLocalStorage<MiningState>(
    MINING_KEY,
    DEFAULT_MINING
  );
  const [inv, setInv] = useLocalStorage<InventoryState>(
    INV_KEY,
    DEFAULT_INVENTORY
  );

  // Live "now" tick so countdowns update every second.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Energy regen: while enough time has passed since lastRegenAt, add energy.
  useEffect(() => {
    if (mining.energy >= MAX_MINING_ENERGY) return;
    const elapsed = Date.now() - mining.lastRegenAt;
    if (elapsed >= MINING_REGEN_MS) {
      const gained = Math.floor(elapsed / MINING_REGEN_MS);
      setMining((prev) => {
        const newEnergy = Math.min(
          MAX_MINING_ENERGY,
          prev.energy + gained
        );
        // If we hit max, reset lastRegenAt to now so the timer resets cleanly.
        // Otherwise advance it by the consumed regen time.
        const consumedMs = gained * MINING_REGEN_MS;
        return {
          ...prev,
          energy: newEnergy,
          lastRegenAt:
            newEnergy >= MAX_MINING_ENERGY
              ? Date.now()
              : prev.lastRegenAt + consumedMs,
        };
      });
    }
  }, [now]);

  // Mining animation state.
  const [activeNode, setActiveNode] = useState<MiningNodeDef | null>(null);
  const [gains, setGains] = useState<FloatingGain[]>([]);
  const [lastYields, setLastYields] = useState<
    Partial<Record<MaterialId, number>> | null
  >(null);
  const gainIdRef = useState({ v: 0 })[0];

  const energyPct = mining.energy / MAX_MINING_ENERGY;
  const msToNextEnergy = useMemo(() => {
    if (mining.energy >= MAX_MINING_ENERGY) return 0;
    const elapsed = now - mining.lastRegenAt;
    return Math.max(0, MINING_REGEN_MS - elapsed);
  }, [now, mining.lastRegenAt, mining.energy]);

  function handleMine(node: MiningNodeDef) {
    if (!selectedTeam || teamCrabs.length === 0) {
      pushToast({
        title: "No available mining team!",
        description: "Select an available team of 5 idle crabs first.",
        variant: "error",
      });
      return;
    }
    if (teamStats.power < node.minTeamPower) {
      pushToast({
        title: `Team Power too low for ${node.name}.`,
        description: `You need ⚔ ${node.minTeamPower} — your team has ⚔ ${teamStats.power}.`,
        variant: "warning",
      });
      return;
    }
    if (mining.energy < node.energyCost) {
      pushToast({
        title: "Not enough mining energy!",
        description: `You need ⚡${node.energyCost} to mine ${node.name}.`,
        variant: "error",
      });
      return;
    }
    const cdEnd = mining.nodeCooldowns[node.id] ?? 0;
    if (now < cdEnd) {
      pushToast({
        title: `${node.name} is still cooling down.`,
        variant: "warning",
      });
      return;
    }
    // Spend energy + start cooldown + roll drops — all up front so state is consistent.
    const rng = mulberry32(Date.now() ^ (node.id.length * 2654435761));
    const yields = applyMiningBonus(rollNodeDrops(node, rng), yieldBonus);

    setMining((prev) => ({
      ...prev,
      energy: prev.energy - node.energyCost,
      nodeCooldowns: {
        ...prev.nodeCooldowns,
        [node.id]: Date.now() + node.cooldownMs,
      },
    }));

    // If yields is empty (all rolls failed), give a consolation kelp_fiber so the
    // player never gets literally nothing.
    const finalYields =
      Object.keys(yields).length === 0
        ? { kelp_fiber: 1 } as Partial<Record<MaterialId, number>>
        : yields;

    setInv((prev) => addMaterials(prev, finalYields));

    // Kick off the animation overlay.
    setActiveNode(node);
    setLastYields(finalYields);

    // Spawn floating gain particles after the pickaxe swing (1.0s in).
    setTimeout(() => {
      const entries = Object.entries(finalYields) as [MaterialId, number][];
      const next: FloatingGain[] = entries.map(([mid, amt], i) => ({
        id: ++gainIdRef.v,
        materialId: mid,
        amount: amt,
        x: 50 + (i - (entries.length - 1) / 2) * 18,
        y: 50,
      }));
      setGains(next);
    }, 1000);

    // End the animation overlay (1.5s) and confirm.
    setTimeout(() => {
      const summary = (Object.entries(finalYields) as [MaterialId, number][])
        .map(
          ([mid, amt]) =>
            `${MATERIALS[mid].icon} ${amt} ${MATERIALS[mid].name}`
        )
        .join(", ");
      pushToast({
        title: `Mined ${node.name}!`,
        description:
          yieldBonus > 0
            ? `Found ${summary}. Team bonus +${Math.round(yieldBonus * 100)}%`
            : `Found ${summary}.`,
        variant: "success",
      });
      setActiveNode(null);
      setGains([]);
      setLastYields(null);
    }, 1500);
  }

  return (
    <div
      className="min-h-screen w-full text-[#EAF6FF]"
      style={{
        background: "linear-gradient(180deg, #0A1B3D 0%, #06122B 100%)",
      }}
    >
      <div className="mx-auto max-w-3xl px-3 py-4 md:px-6 md:py-6">
        {/* Header row: Back + Title + Energy */}
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
            ⛏️ Crystal Mines
          </h1>
          <GlassPanel className="px-3 py-1.5">
            <div className="flex items-center gap-1.5 text-sm font-bold">
              <span style={{ color: "#FFD166" }}>⚡</span>
              <span className="font-display">
                {mining.energy}/{MAX_MINING_ENERGY}
              </span>
            </div>
          </GlassPanel>
        </div>

        {/* Energy regen progress bar */}
        <GlassPanel className="mb-4 px-3 py-2">
          <div className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-wide text-white/60">
            <span>Energy</span>
            <span>
              {mining.energy >= MAX_MINING_ENERGY
                ? "Full"
                : `Next in ${formatTime(msToNextEnergy)}`}
            </span>
          </div>
          <div
            className="h-2 w-full overflow-hidden rounded-full"
            style={{ background: "rgba(255,255,255,0.08)" }}
          >
            <motion.div
              className="h-full rounded-full"
              style={{
                background:
                  "linear-gradient(90deg, #FFD166, #FF7A1A)",
                boxShadow: "0 0 8px rgba(255,209,102,0.6)",
              }}
              animate={{ width: `${energyPct * 100}%` }}
              transition={{ duration: 0.4, ease: "easeOut" }}
            />
          </div>
        </GlassPanel>

        {/* Mining team */}
        <GlassPanel className="mb-4 px-3 py-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs font-bold uppercase tracking-wide text-white/70">
              ⛏️ Mining Team
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] font-bold">
              <span style={{ color: "#FFD166" }}>
                ⚔ Team Power {teamStats.power.toLocaleString()}
              </span>
              <span style={{ color: "#7CF5E1" }}>
                Yield Bonus +{Math.round(yieldBonus * 100)}%
              </span>
            </div>
          </div>
          <TeamSelect
            teams={teams}
            crabs={crabs}
            selectedTeamId={selectedTeamId}
            onSelect={setSelectedTeamId}
            requireIdle={true}
            testIdPrefix="mining-team-select"
          />
          {!hasAvailableTeam && (
            <div
              className="mt-2 text-[11px] font-bold"
              style={{ color: "#FF6F91" }}
            >
              No available team — free up a full team of 5 idle crabs to mine.
            </div>
          )}
          {teamCrabs.length > 0 && (
            <div className="mt-2 flex items-center gap-1.5">
              <span className="text-[10px] uppercase tracking-wide text-white/50 mr-1">
                Active team
              </span>
              {teamCrabs.map((c) => (
                <CrabRenderer key={c.id} crab={c} size={48} />
              ))}
            </div>
          )}
        </GlassPanel>

        {/* Mining node cards */}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {MINING_NODES.map((node) => {
            const cdEnd = mining.nodeCooldowns[node.id] ?? 0;
            const remaining = Math.max(0, cdEnd - now);
            const onCooldown = remaining > 0;
            const noEnergy = mining.energy < node.energyCost;
            const noTeam = !selectedTeam || teamCrabs.length === 0;
            const powerLocked = !noTeam && teamStats.power < node.minTeamPower;
            const disabled =
              onCooldown ||
              noEnergy ||
              activeNode !== null ||
              noTeam ||
              powerLocked;
            const cdProgress = onCooldown
              ? 1 - remaining / node.cooldownMs
              : 1;
            return (
              <GlassPanel
                key={node.id}
                className="overflow-hidden"
                style={
                  powerLocked || noTeam ? { opacity: 0.65 } : undefined
                }
              >
                <div className="p-4">
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <div className="text-4xl">{node.icon}</div>
                    {onCooldown ? (
                      <div className="text-right">
                        <div className="text-[9px] uppercase tracking-wide text-white/50">
                          Cooldown
                        </div>
                        <div
                          className="text-xs font-bold"
                          style={{ color: "#FF4D6D" }}
                        >
                          {formatTime(remaining)}
                        </div>
                      </div>
                    ) : (
                      <div className="text-right">
                        <div className="text-[9px] uppercase tracking-wide text-white/50">
                          Cost
                        </div>
                        <div
                          className="text-xs font-bold"
                          style={{ color: "#FFD166" }}
                        >
                          ⚡{node.energyCost}
                        </div>
                      </div>
                    )}
                  </div>
                  <h3 className="text-sm font-bold leading-tight">
                    {node.name}
                  </h3>
                  <p className="mt-1 text-[11px] leading-snug text-white/60">
                    {node.description}
                  </p>
                  <div className="mt-2 text-[10px] text-white/50">
                    Drops: {dropPreview(node)}
                  </div>
                  <div
                    className="mt-1 text-[10px] font-bold"
                    style={{
                      color: powerLocked ? "#FF6F91" : "rgba(255,255,255,0.6)",
                    }}
                  >
                    {node.minTeamPower > 0
                      ? `⚔ Team Power ≥ ${node.minTeamPower}`
                      : "Any team"}
                  </div>

                  {/* Cooldown progress bar */}
                  {onCooldown && (
                    <div
                      className="mt-2 h-1 w-full overflow-hidden rounded-full"
                      style={{ background: "rgba(255,255,255,0.08)" }}
                    >
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${cdProgress * 100}%`,
                          background:
                            "linear-gradient(90deg, #7CF5E1, #12A7A0)",
                          transition: "width 1s linear",
                        }}
                      />
                    </div>
                  )}

                  <GlowButton
                    variant="teal"
                    size="sm"
                    className="mt-3 w-full"
                    disabled={disabled}
                    onClick={() => handleMine(node)}
                    title={
                      noTeam
                        ? "No available team"
                        : powerLocked
                        ? `Need ⚔ ${node.minTeamPower} team power`
                        : noEnergy
                        ? "Not enough energy"
                        : onCooldown
                        ? "On cooldown"
                        : `Mine ${node.name}`
                    }
                  >
                    {onCooldown
                      ? "Cooling..."
                      : noTeam
                      ? "No Team"
                      : powerLocked
                      ? `Need ⚔ ${node.minTeamPower}`
                      : noEnergy
                      ? "No Energy"
                      : "⛏️ Mine"}
                  </GlowButton>
                </div>
              </GlassPanel>
            );
          })}
        </div>

        {/* Quick inventory peek */}
        <GlassPanel className="mt-4 px-3 py-3">
          <div className="mb-2 text-[10px] uppercase tracking-wide text-white/50">
            Inventory
          </div>
          <div className="flex flex-wrap gap-2">
            {Object.entries(inv.materials).length === 0 && (
              <EmptyState
                compact
                message="No materials yet"
                hint="Mine a node to start your stockpile."
              />
            )}
            {Object.entries(inv.materials).map(([mid, count]) => {
              const m = MATERIALS[mid as MaterialId];
              if (!m || !count) return null;
              return (
                <div
                  key={mid}
                  className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-bold"
                  style={{
                    background: "rgba(10,27,61,0.55)",
                    border: `1px solid ${rarityColor(m.rarity)}55`,
                  }}
                >
                  <span>{m.icon}</span>
                  <span style={{ color: rarityColor(m.rarity) }}>×{count}</span>
                </div>
              );
            })}
          </div>
        </GlassPanel>
      </div>

      {/* Mining animation overlay */}
      <AnimatePresence>
        {activeNode && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center"
            style={{ background: "rgba(6,18,43,0.78)" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <div className="relative flex h-64 w-full max-w-md flex-col items-center justify-center">
              <div className="mb-3 text-6xl">{activeNode.icon}</div>

              {/* Pickaxe swing */}
              <motion.svg
                width={120}
                height={120}
                viewBox="0 0 120 120"
                initial={{ rotate: -45, opacity: 0 }}
                animate={{
                  rotate: [0, -35, 25, -10, 0],
                  opacity: [0, 1, 1, 1, 0.85],
                }}
                transition={{
                  duration: 1.0,
                  times: [0, 0.2, 0.5, 0.75, 1],
                  ease: "easeInOut",
                }}
                style={{ transformOrigin: "60px 60px" }}
              >
                {/* handle */}
                <rect
                  x={56}
                  y={20}
                  width={8}
                  height={70}
                  rx={4}
                  fill="#8B5A2B"
                  transform="rotate(45 60 60)"
                />
                {/* head */}
                <path
                  d="M 30 40 Q 60 25 90 40 L 80 52 Q 60 42 40 52 Z"
                  fill="#C0C0C0"
                  stroke="#666"
                  strokeWidth={2}
                />
                <circle cx={60} cy={46} r={4} fill="#FFD166" />
              </motion.svg>

              {/* Spark particles (5 dots flying outward at swing impact ~0.5s) */}
              <AnimatePresence>
                {gains.length === 0 && activeNode && (
                  <>
                    {[0, 1, 2, 3, 4].map((i) => {
                      const angle = (i / 5) * Math.PI * 2;
                      return (
                        <motion.div
                          key={`spark-${i}`}
                          className="absolute rounded-full"
                          style={{
                            width: 8,
                            height: 8,
                            background: "#FFD166",
                            boxShadow: "0 0 8px #FFD166",
                            left: "50%",
                            top: "55%",
                          }}
                          initial={{ x: 0, y: 0, opacity: 0, scale: 0 }}
                          animate={{
                            x: Math.cos(angle) * 60,
                            y: Math.sin(angle) * 60,
                            opacity: [0, 1, 0],
                            scale: [0, 1.2, 0],
                          }}
                          transition={{
                            duration: 0.6,
                            delay: 0.45 + i * 0.02,
                            ease: "easeOut",
                          }}
                        />
                      );
                    })}
                  </>
                )}
              </AnimatePresence>

              {/* Floating "+N material" text after the swing */}
              <AnimatePresence>
                {gains.map((g) => {
                  const m = MATERIALS[g.materialId];
                  return (
                    <motion.div
                      key={g.id}
                      className="absolute flex items-center gap-1 rounded-full px-3 py-1 text-sm font-bold"
                      style={{
                        left: `${g.x}%`,
                        top: `${g.y}%`,
                        background: "rgba(10,27,61,0.85)",
                        border: `1px solid ${rarityColor(m.rarity)}`,
                        color: rarityColor(m.rarity),
                      }}
                      initial={{ y: 0, opacity: 0, scale: 0.6 }}
                      animate={{ y: -80, opacity: [0, 1, 1, 0], scale: 1 }}
                      transition={{ duration: 0.9, ease: "easeOut" }}
                    >
                      <span>{m.icon}</span>
                      <span>+{g.amount}</span>
                    </motion.div>
                  );
                })}
              </AnimatePresence>

              {/* Summary line once drops are known */}
              {lastYields && gains.length > 0 && (
                <motion.div
                  className="absolute bottom-0 text-center text-xs text-white/70"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 1.05 }}
                >
                  {Object.entries(lastYields).map(
                    ([mid, amt]) =>
                      `${MATERIALS[mid as MaterialId].icon} +${amt}`
                  ).join("  ")}
                </motion.div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
