// Crabtopia - Arena Flow Orchestrator
// Owns the arena step state machine. Mounts the right screen for each step.
"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import type { Formation } from "../../types";
import { deriveFormationForCrabs } from "../../engine/formation";
import { useGame } from "../../store/gameStore";
import { generateOpponents, rerollOpponents, Opponent } from "../../data/opponents";
import { useLocalStorage, INV_KEY, DEFAULT_INVENTORY, addMaterials, type InventoryState } from "../useLocalStorage";
import ArenaSplash from "./ArenaSplash";
import ArenaMenu from "./ArenaMenu";
import ArenaLeaderboard from "./ArenaLeaderboard";
import ArenaOpponentList from "./ArenaOpponentList";
import ArenaTeamBuilder from "./ArenaTeamBuilder";
import ArenaLoading from "./ArenaLoading";
import ArenaBattle from "./ArenaBattle";
import ArenaResult from "./ArenaResult";
import { mulberry32 } from "../../engine/rng";

type ArenaStep =
  | "splash"
  | "menu"
  | "leaderboard"
  | "opponent_list"
  | "team_builder"
  | "loading"
  | "battle"
  | "result";

interface ArenaRewards {
  winner: "player" | "enemy";
  goldReward: number;
  xpReward: number;
  itemsFound: { itemId: string; count: number }[];
  arenaId: string;
  /** Factual post-battle insight lines (ArenaBattle computes them). */
  insights?: string[];
}

interface BattleLogEntry {
  arenaId: string;
  timestamp: number;
  opponentName: string;
  outcome: "victory" | "defeat";
  goldReward: number;
  xpReward: number;
}

const BATTLE_LOG_KEY = "crabtopia_battle_log_v1";
const REFRESH_COST = 50;
const REFRESH_COOLDOWN_MS = 30_000;

export default function ArenaController() {
  const player = useGame((s) => s.player);
  const addGold = useGame((s) => s.addGold);
  const addXp = useGame((s) => s.addXp);
  const progressQuest = useGame((s) => s.progressQuest);
  const spendGold = useGame((s) => s.spendGold);
  const pushToast = useGame((s) => s.pushToast);
  const setScreen = useGame((s) => s.setScreen);

  const [step, setStep] = useState<ArenaStep>("splash");
  const [selectedOpponent, setSelectedOpponent] = useState<Opponent | null>(null);
  const [selectedTeamCrabIds, setSelectedTeamCrabIds] = useState<string[]>([]);
  const [selectedFormation, setSelectedFormation] = useState<Formation | null>(null);
  // Free-placement lanes (crabId → 0..4 within its row) chosen on the
  // deployment board. Carried into initBattle so the battle renderer places
  // each crab at its freely chosen cell, not the legacy auto-spread.
  const [selectedLanes, setSelectedLanes] = useState<Record<string, number> | null>(null);
  const [lastResult, setLastResult] = useState<ArenaRewards | null>(null);
  const [opponentSeed, setOpponentSeed] = useState<number>(() =>
    Math.floor(Math.random() * 2 ** 31)
  );
  const [refreshCooldownUntil, setRefreshCooldownUntil] = useState<number>(0);

  const [battleLog, setBattleLog] = useLocalStorage<BattleLogEntry[]>(
    BATTLE_LOG_KEY,
    []
  );
  // Activity inventory (materials + items) — the same store Mining/
  // Exploration/Crafting/Inventory read and write. Arena item drops are
  // deposited here so victory spoils actually reach the player's vault.
  const [, setInventory] = useLocalStorage<InventoryState>(
    INV_KEY,
    DEFAULT_INVENTORY
  );

  // Derive opponents from seed (cached in state to avoid recompute on every render)
  const [opponentsCache, setOpponentsCache] = useState<Opponent[] | null>(null);
  useEffect(() => {
    if (!player) return;
    const playerMaxLevel = Math.max(
      1,
      ...player.crabs.map((c) => c.level)
    );
    setOpponentsCache(generateOpponents(playerMaxLevel, opponentSeed, 5));
  }, [player, opponentSeed]);

  // ---- Splash ----
  const handleDive = useCallback(() => {
    setStep("menu");
  }, []);

  // ---- Menu navigation ----
  const handleFight = useCallback(() => {
    setStep("opponent_list");
  }, []);
  const handleRanking = useCallback(() => {
    setStep("leaderboard");
  }, []);
  const handleBattleLog = useCallback(() => {
    // Battle log is inline in ArenaMenu; this is a no-op fallback
    pushToast({
      title: "Battle Log",
      description: "Scroll the menu to see your recent battles.",
      variant: "default",
    });
  }, [pushToast]);
  const handleHistory = useCallback(() => {
    pushToast({
      title: "Match History",
      description: `${battleLog.length} battles on record.`,
      variant: "default",
    });
  }, [pushToast, battleLog.length]);

  // ---- Leaderboard ----
  const handleLeaderboardBack = useCallback(() => setStep("menu"), []);

  // ---- Opponent list ----
  const handlePickOpponent = useCallback((opp: Opponent) => {
    if (!player) return;
    if (player.gold < opp.entryCost) {
      pushToast({
        title: "Insufficient Gold",
        description: `Need ${opp.entryCost}g to challenge ${opp.name}.`,
        variant: "error",
      });
      return;
    }
    setSelectedOpponent(opp);
    setStep("team_builder");
  }, [player, pushToast]);

  const handleRefreshOpponents = useCallback(() => {
    if (!player) return;
    if (player.gold < REFRESH_COST) {
      pushToast({
        title: "Insufficient Gold",
        description: `Refresh costs ${REFRESH_COST}g.`,
        variant: "error",
      });
      return;
    }
    if (Date.now() < refreshCooldownUntil) {
      pushToast({
        title: "Refresh on Cooldown",
        description: "Wait a moment before refreshing again.",
        variant: "warning",
      });
      return;
    }
    const ok = spendGold(REFRESH_COST);
    if (!ok) {
      pushToast({
        title: "Gold spend failed.",
        variant: "error",
      });
      return;
    }
    const newSeed = Math.floor(Math.random() * 2 ** 31);
    setOpponentSeed(newSeed);
    setRefreshCooldownUntil(Date.now() + REFRESH_COOLDOWN_MS);
    pushToast({
      title: "Tides Shift",
      description: "New challengers approach.",
      variant: "success",
    });
  }, [player, refreshCooldownUntil, spendGold, pushToast]);

  const handleOpponentListBack = useCallback(() => setStep("menu"), []);

  // Enemy formation for the battle, derived from the opponent roster.
  const enemyFormation = useMemo(
    () =>
      selectedOpponent
        ? deriveFormationForCrabs(selectedOpponent.crabs)
        : undefined,
    [selectedOpponent]
  );

  // ---- Team builder ----
  const handleDeploy = useCallback(
    (crabIds: string[], formation: Formation, lanes: Record<string, number>) => {
      if (!selectedOpponent || !player) return;
      // Charge entry cost
      const ok = spendGold(selectedOpponent.entryCost);
      if (!ok) {
        pushToast({
          title: "Insufficient Gold",
          description: `Need ${selectedOpponent.entryCost}g entry fee.`,
          variant: "error",
        });
        return;
      }
      setSelectedTeamCrabIds(crabIds);
      setSelectedFormation(formation);
      setSelectedLanes(lanes);
      setStep("loading");
    },
    [selectedOpponent, player, spendGold, pushToast]
  );

  const handleTeamBuilderBack = useCallback(() => setStep("opponent_list"), []);

  // ---- Loading ----
  const handleLoadingReady = useCallback(() => {
    setStep("battle");
  }, []);

  // ---- Battle ----
  const handleBattleComplete = useCallback(
    (result: ArenaRewards) => {
      if (!player || !selectedOpponent) return;
      // Award rewards
      if (result.winner === "player") {
        addGold(result.goldReward);
        // XP is real: calculateRewards sizes it (enemy avg level × 15 per
        // surviving crab) and it feeds the Shellwarden level curve.
        addXp(result.xpReward);
        // Item drops land in the shared activity inventory (the same store
        // Mining/Exploration/Crafting/Inventory use), not just the result
        // screen.
        if (result.itemsFound.length > 0) {
          const gains: Parameters<typeof addMaterials>[1] = {};
          for (const it of result.itemsFound) {
            gains[it.itemId as keyof typeof gains] =
              (gains[it.itemId as keyof typeof gains] ?? 0) + it.count;
          }
          setInventory((prev) => addMaterials(prev, gains));
        }
        // Brawler quest: an Arena victory (the Coliseum's successor).
        progressQuest("coliseum_win");
        pushToast({
          title: "Victory Spoils",
          description: `+${result.goldReward}g, +${result.xpReward} XP${
            result.itemsFound.length > 0
              ? `, ${result.itemsFound
                  .map((i) => `${i.count}× ${i.itemId}`)
                  .join(", ")}`
              : ""
          }.`,
          variant: "success",
        });
      } else {
        pushToast({
          title: "Defeated",
          description: "Your tideguard fell. No spoils.",
          variant: "error",
        });
      }
      // Record to battle log
      const entry: BattleLogEntry = {
        arenaId: result.arenaId,
        timestamp: Date.now(),
        opponentName: selectedOpponent.name,
        outcome: result.winner === "player" ? "victory" : "defeat",
        goldReward: result.winner === "player" ? result.goldReward : 0,
        xpReward: result.winner === "player" ? result.xpReward : 0,
      };
      setBattleLog((prev) => [entry, ...prev].slice(0, 50));
      setLastResult(result);
      setStep("result");
    },
    [player, selectedOpponent, addGold, addXp, progressQuest, pushToast, setBattleLog, setInventory]
  );

  // ---- Result ----
  const handleContinue = useCallback(() => {
    setLastResult(null);
    setSelectedOpponent(null);
    setSelectedTeamCrabIds([]);
    setSelectedFormation(null);
    setSelectedLanes(null);
    setStep("menu");
  }, []);

  const handleResultBattleLog = useCallback(() => {
    // Show toast with last battle info
    if (lastResult) {
      pushToast({
        title: `Arena ${lastResult.arenaId}`,
        description: `${lastResult.winner === "player" ? "Victory" : "Defeat"} — ${lastResult.goldReward}g, ${lastResult.xpReward} XP`,
        variant: "default",
      });
    }
  }, [lastResult, pushToast]);

  // ---- Render the right screen ----
  if (!player) {
    return null;
  }

  // Fallback: if we somehow have no opponents cached yet, show loading state
  if (step === "opponent_list" && !opponentsCache) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 text-white">
        <div
          className="w-10 h-10 rounded-full border-2 border-white/15 animate-spin"
          style={{ borderTopColor: "#7CF5E1" }}
          aria-hidden
        />
        <div className="animate-pulse text-sm">Summoning challengers...</div>
      </div>
    );
  }

  switch (step) {
    case "splash":
      return <ArenaSplash onDive={handleDive} />;

    case "menu":
      return (
        <ArenaMenu
          onFight={handleFight}
          onRanking={handleRanking}
          onBattleLog={handleBattleLog}
          onHistory={handleHistory}
        />
      );

    case "leaderboard":
      return (
        <ArenaLeaderboard
          onBack={handleLeaderboardBack}
          playerRank={player.tidelordRank || 9999}
          playerName={player.name}
        />
      );

    case "opponent_list":
      return (
        <ArenaOpponentList
          opponents={opponentsCache!}
          onPick={handlePickOpponent}
          onRefresh={handleRefreshOpponents}
          onBack={handleOpponentListBack}
          refreshCost={REFRESH_COST}
          refreshCooldownUntil={refreshCooldownUntil}
          playerGold={player.gold}
        />
      );

    case "team_builder":
      if (!selectedOpponent) {
        setStep("opponent_list");
        return null;
      }
      return (
        <ArenaTeamBuilder
          opponent={selectedOpponent}
          playerCrabs={player.crabs}
          onDeploy={handleDeploy}
          onBack={handleTeamBuilderBack}
        />
      );

    case "loading": {
      if (!selectedOpponent) {
        setStep("opponent_list");
        return null;
      }
      const playerTeam = player.crabs.filter((c) =>
        selectedTeamCrabIds.includes(c.id)
      );
      // Sort by selected order
      const orderedPlayer = selectedTeamCrabIds
        .map((id) => playerTeam.find((c) => c.id === id))
        .filter(Boolean) as typeof playerTeam;
      const arenaId = `ARENA-${selectedOpponent.id.slice(0, 4).toUpperCase()}-${Math.floor(
        Date.now() / 1000
      )
        .toString(36)
        .toUpperCase()
        .slice(-4)}`;
      return (
        <ArenaLoading
          playerCrabs={orderedPlayer}
          enemyCrabs={selectedOpponent.crabs}
          arenaId={arenaId}
          onReady={handleLoadingReady}
        />
      );
    }

    case "battle": {
      if (!selectedOpponent) {
        setStep("opponent_list");
        return null;
      }
      const playerTeam = player.crabs.filter((c) =>
        selectedTeamCrabIds.includes(c.id)
      );
      const orderedPlayer = selectedTeamCrabIds
        .map((id) => playerTeam.find((c) => c.id === id))
        .filter(Boolean) as typeof playerTeam;
      const arenaId = `ARENA-${selectedOpponent.id.slice(0, 4).toUpperCase()}-${Math.floor(
        Date.now() / 1000
      )
        .toString(36)
        .toUpperCase()
        .slice(-4)}`;
      const seed =
        (selectedOpponent.id.charCodeAt(0) << 24) ^
        (selectedOpponent.id.charCodeAt(1) << 16) ^
        Date.now() ^
        Math.floor(Math.random() * 1e6);
      return (
        <ArenaBattle
          playerCrabs={orderedPlayer}
          enemyCrabs={selectedOpponent.crabs}
          seed={seed}
          arenaId={arenaId}
          entryCost={selectedOpponent.entryCost}
          onComplete={handleBattleComplete}
          playerFormation={selectedFormation ?? undefined}
          enemyFormation={enemyFormation}
          playerLanes={selectedLanes ?? undefined}
        />
      );
    }

    case "result":
      if (!lastResult || !selectedOpponent) {
        setStep("menu");
        return null;
      }
      return (
        <ArenaResult
          result={lastResult}
          opponentName={selectedOpponent.name}
          onContinue={handleContinue}
          onBattleLog={handleResultBattleLog}
        />
      );

    default:
      return <ArenaSplash onDive={handleDive} />;
  }
}
