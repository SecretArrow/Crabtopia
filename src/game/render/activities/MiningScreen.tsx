// Crabtopia - Mining activity screen ("Crystal Mines")
// Mining's own state (energy, node cooldowns) lives in localStorage via
// useLocalStorage; materials land in the player profile (gainMaterials)
// and each run charges the team's stamina via the store. Fully playable —
// every Mine click rolls real materials, consumes energy, and starts a
// node cooldown.
//
// The haul is granted through the watched dig: a Mine click stores the
// rolled yields as a PendingDig and opens the MiningScene, where the
// team's own crabs dig the node face while the predetermined loot pops
// out. The scene's Claim (or the "loot waiting" banner's Claim) grants
// the yields exactly once via gainMaterials — closing the scene claims
// nothing, and the pending dig persists until claimed.
"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
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
  type MiningState,
} from "../useLocalStorage";
import { mulberry32 } from "../../engine/rng";
import { STAMINA_COSTS } from "../../engine/config";
import TeamSelect from "../TeamSelect";
import CrabRenderer from "../CrabRenderer";
import MiningScene, { MINING_NODE_THEMES } from "../MiningScene";
import type { LootRevealItem } from "../LootReveal";
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

export default function MiningScreen() {
  const setScreen = useGame((s) => s.setScreen);
  const pushToast = useGame((s) => s.pushToast);
  const player = useGame((s) => s.player);
  const gainMaterials = useGame((s) => s.gainMaterials);
  const chargeStamina = useGame((s) => s.chargeStamina);

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
  // Materials live in the player profile now (the Bazaar item market
  // escrows/settles against them); only mining's own energy/cooldown
  // state stays in its localStorage key.
  const inv = useMemo(
    () => ({
      materials: player?.materials ?? {},
      items: player?.items ?? {},
    }),
    [player]
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

  // Watched-dig state: the scene is open over the screen. The loot
  // itself lives in mining.pendingDig (persisted), NOT here — closing
  // the scene or leaving the screen can never lose it.
  const [watching, setWatching] = useState(false);
  const pendingDig = mining.pendingDig ?? null;
  const pendingNode = useMemo(
    () =>
      pendingDig
        ? MINING_NODES.find((n) => n.id === pendingDig.nodeId) ?? null
        : null,
    [pendingDig]
  );
  const pendingCrabs = useMemo(() => {
    if (!pendingDig) return teamCrabs;
    const resolved = pendingDig.crabIds
      .map((id) => crabsById.get(id))
      .filter(Boolean) as typeof crabs;
    return resolved.length > 0 ? resolved : teamCrabs;
  }, [pendingDig, crabsById, teamCrabs]);
  const pendingLoot = useMemo<LootRevealItem[]>(
    () =>
      pendingDig
        ? (Object.entries(pendingDig.yields) as [MaterialId, number][]).map(
            ([mid, amt]) => ({
              key: mid,
              name: MATERIALS[mid].name,
              amount: amt,
              icon: <span>{MATERIALS[mid].icon}</span>,
              tierValue: MATERIALS[mid].baseValue,
            })
          )
        : [],
    [pendingDig]
  );

  const energyPct = mining.energy / MAX_MINING_ENERGY;
  const msToNextEnergy = useMemo(() => {
    if (mining.energy >= MAX_MINING_ENERGY) return 0;
    const elapsed = now - mining.lastRegenAt;
    return Math.max(0, MINING_REGEN_MS - elapsed);
  }, [now, mining.lastRegenAt, mining.energy]);

  function handleMine(node: MiningNodeDef) {
    if (pendingDig) {
      pushToast({
        title: "Your last dig's loot is still waiting!",
        description: "Claim it (or watch the dig) before starting another.",
        variant: "warning",
      });
      return;
    }
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
    // Stamina: the expedition team pays STAMINA_COSTS.mining per crab
    // at the start of the run — atomic, so a refusal (exhausted or
    // wounded member; the action toasts the reason) spends no energy
    // and starts no cooldown.
    if (!chargeStamina(teamCrabs.map((c) => c.id), STAMINA_COSTS.mining)) {
      return;
    }
    // Spend energy + start cooldown + roll drops — all up front so state is consistent.
    const rng = mulberry32(Date.now() ^ (node.id.length * 2654435761));
    const yields = applyMiningBonus(rollNodeDrops(node, rng), yieldBonus);

    // If yields is empty (all rolls failed), give a consolation kelp_fiber so the
    // player never gets literally nothing.
    const finalYields =
      Object.keys(yields).length === 0
        ? { kelp_fiber: 1 } as Partial<Record<MaterialId, number>>
        : yields;

    // The haul is NOT granted yet: it becomes a pending dig and the
    // MiningScene plays it out. Claiming (scene finale or banner)
    // grants it exactly once — see claimPendingDig.
    setMining((prev) => ({
      ...prev,
      energy: prev.energy - node.energyCost,
      nodeCooldowns: {
        ...prev.nodeCooldowns,
        [node.id]: Date.now() + node.cooldownMs,
      },
      pendingDig: {
        nodeId: node.id,
        yields: finalYields,
        crabIds: teamCrabs.map((c) => c.id),
        bonusPct: yieldBonus,
      },
    }));
    setWatching(true);
  }

  // Grant the pending dig's predetermined yields — the one and only
  // grant path for a dig, identical from the scene finale and the
  // "loot waiting" banner. Clears the pending dig first, so no second
  // claim can ever pay out again.
  function claimPendingDig() {
    const pd = mining.pendingDig;
    if (!pd) return;
    const node = MINING_NODES.find((n) => n.id === pd.nodeId);
    setMining((prev) => ({ ...prev, pendingDig: null }));
    gainMaterials(pd.yields);
    const summary = (Object.entries(pd.yields) as [MaterialId, number][])
      .map(([mid, amt]) => `${MATERIALS[mid].icon} ${amt} ${MATERIALS[mid].name}`)
      .join(", ");
    pushToast({
      title: `Mined ${node?.name ?? "the dig"}!`,
      description:
        pd.bonusPct > 0
          ? `Found ${summary}. Team bonus +${Math.round(pd.bonusPct * 100)}%`
          : `Found ${summary}.`,
      variant: "success",
    });
    setWatching(false);
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
            staminaCost={STAMINA_COSTS.mining}
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
              pendingDig !== null ||
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
                      pendingDig
                        ? "Claim your waiting dig loot first"
                        : noTeam
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
                    {pendingDig
                      ? "🎁 Loot Waiting"
                      : onCooldown
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

        {/* Pending dig loot — rolled and paid for, waiting to be claimed */}
        {pendingDig && pendingNode && !watching && (
          <GlassPanel
            className="mt-4 px-3 py-3"
            style={{ border: "1px solid rgba(255,209,102,0.55)" }}
          >
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs font-bold" style={{ color: "#FFD166" }}>
                🎁 The dig at {pendingNode.name} is done — loot waiting!
              </div>
              <div className="flex gap-2">
                <GlowButton
                  variant="teal"
                  size="sm"
                  onClick={() => setWatching(true)}
                >
                  ▶ Watch the Dig
                </GlowButton>
                <GlowButton
                  variant="gold"
                  size="sm"
                  onClick={claimPendingDig}
                >
                  Claim Loot
                </GlowButton>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {pendingLoot.map((item) => (
                <div
                  key={item.key}
                  className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-bold"
                  style={{
                    background: "rgba(10,27,61,0.55)",
                    border: "1px solid rgba(255,209,102,0.4)",
                  }}
                >
                  {item.icon}
                  <span>
                    {item.name} ×{item.amount}
                  </span>
                </div>
              ))}
            </div>
          </GlassPanel>
        )}

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

      {/* Watched dig — the MiningScene plays out the pending haul */}
      {watching && pendingDig && pendingNode && (
        <MiningScene
          title={`Digging ${pendingNode.name}`}
          subtitle="Your team's haul, exactly as rolled — watch it come out of the rock."
          crabs={pendingCrabs}
          theme={MINING_NODE_THEMES[pendingNode.id] ?? MINING_NODE_THEMES.kelp_ridge}
          loot={pendingLoot}
          claimLabel="Claim Loot"
          finaleTitle={`${pendingNode.name} — haul complete!`}
          onClaim={claimPendingDig}
          onClose={() => setWatching(false)}
        />
      )}
    </div>
  );
}
