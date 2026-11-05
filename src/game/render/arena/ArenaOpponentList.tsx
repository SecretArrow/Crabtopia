// Crabtopia - Arena Opponent Selection Screen
// Lists 5 opponent cards with team preview (up to 5 crab thumbnails each),
// entry cost, reward preview, and a Battle button. Refresh button rerolls
// opponents (costs gold) with a 30s cooldown enforced by the parent
// (refreshCooldownUntil).

"use client";

import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  GlowButton,
  GlassPanel,
  GoldIcon,
  formatGold,
  CountdownRing,
  ClassIcon,
  FactionBadge,
  PlanktonField,
} from "../ui";
import CrabSprite from "../CrabSprite";
import ElementBadge from "../ElementBadge";
import type { Opponent } from "../../data/opponents";
import type { Crab } from "../../types";

export interface ArenaOpponentListProps {
  opponents: Opponent[];
  onPick: (opp: Opponent) => void;
  onRefresh: () => void;
  onBack: () => void;
  refreshCost: number;
  refreshCooldownUntil: number;
  playerGold: number;
}

// Arena flow uses a 30-second refresh cooldown (per shared spec). The parent
// passes refreshCooldownUntil (ms epoch) — we display the remaining time as a
// CountdownRing and lock the button until it elapses.
const COOLDOWN_MS = 30_000;

// Maximum fleet strength used to scale the per-card fleet strength bar.
const FLEET_MAX = 3500;

function fleetPct(opp: Opponent): number {
  return Math.max(2, Math.min(100, (opp.fleetStrength / FLEET_MAX) * 100));
}

// Per-crab stat preview — find strongest of the team for highlighting.
function strongestOfTeam(crabs: Crab[]): Crab | null {
  if (!crabs || crabs.length === 0) return null;
  const score = (c: Crab) =>
    c.stats.hp + c.stats.attack + c.stats.defense + c.stats.speed + c.stats.skill;
  return [...crabs].sort((a, b) => score(b) - score(a))[0];
}

export default function ArenaOpponentList({
  opponents,
  onPick,
  onRefresh,
  onBack,
  refreshCost,
  refreshCooldownUntil,
  playerGold,
}: ArenaOpponentListProps): React.ReactNode {
  // Tick "now" every 250ms so cooldown ring updates smoothly.
  const [now, setNow] = useState<number>(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, []);

  const remainingMs = Math.max(0, refreshCooldownUntil - now);
  const onCooldown = remainingMs > 0;
  const canAffordRefresh = playerGold >= refreshCost;
  const canRefresh = !onCooldown && canAffordRefresh;
  const ringProgress = onCooldown ? Math.min(1, Math.max(0, remainingMs / COOLDOWN_MS)) : 0;
  const cooldownSeconds = onCooldown ? Math.ceil(remainingMs / 1000) : 0;

  return (
    <div
      className="relative w-full min-h-[100svh] flex flex-col"
      style={{ background: "linear-gradient(180deg, #0A1B3D 0%, #06122B 100%)" }}
    >
      <PlanktonField count={8} />

      {/* ---------- HEADER ---------- */}
      <header className="relative px-3 sm:px-4 pt-4 pb-2 max-w-3xl w-full mx-auto">
        <div className="flex items-center gap-2">
          <GlowButton variant="ghost" size="sm" onClick={onBack} title="Back to Arena Menu">
            ← Back
          </GlowButton>
          <div className="flex-1 text-center">
            <h1
              className="font-display text-base sm:text-xl font-extrabold tracking-wide"
              style={{
                background: "linear-gradient(180deg, #FFE9A8 0%, #FFD166 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              ⚔️ Choose Your Foe
            </h1>
          </div>

          {/* Player gold display */}
          <div
            className="shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl"
            style={{
              background: "rgba(255,209,102,0.10)",
              border: "1px solid rgba(255,209,102,0.30)",
            }}
          >
            <GoldIcon size={16} />
            <span
              className="font-display font-bold text-sm"
              style={{ color: "#FFD166" }}
            >
              {formatGold(playerGold)}
            </span>
          </div>
        </div>

        {/* Refresh row */}
        <div className="flex items-center justify-end mt-2">
          <RefreshButton
            onRefresh={onRefresh}
            onCooldown={onCooldown}
            canAfford={canAffordRefresh}
            canRefresh={canRefresh}
            cost={refreshCost}
            ringProgress={ringProgress}
            cooldownSeconds={cooldownSeconds}
          />
        </div>
      </header>

      {/* ---------- OPPONENT LIST ---------- */}
      <main className="relative flex-1 overflow-y-auto px-3 sm:px-4 pb-6 max-w-3xl w-full mx-auto">
        {opponents.length === 0 ? (
          <GlassPanel className="p-6 text-center">
            <div className="text-base font-bold" style={{ color: "#FFD166" }}>
              No opponents available
            </div>
            <div className="text-xs text-white/55 mt-1">
              Tap the refresh button above to summon new foes.
            </div>
          </GlassPanel>
        ) : (
          <ul className="space-y-3">
            {opponents.map((opp, i) => (
              <OpponentCard
                key={opp.id}
                opp={opp}
                index={i}
                playerGold={playerGold}
                onPick={onPick}
              />
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Refresh button — shows cost when ready, countdown ring when on cooldown.
// ---------------------------------------------------------------------------

function RefreshButton({
  onRefresh,
  onCooldown,
  canAfford,
  canRefresh,
  cost,
  ringProgress,
  cooldownSeconds,
}: {
  onRefresh: () => void;
  onCooldown: boolean;
  canAfford: boolean;
  canRefresh: boolean;
  cost: number;
  ringProgress: number;
  cooldownSeconds: number;
}): React.ReactNode {
  if (onCooldown) {
    return (
      <div
        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl"
        style={{
          background: "rgba(10,27,61,0.55)",
          border: "1px solid rgba(124,245,225,0.25)",
        }}
        title="Refresh on cooldown"
      >
        <CountdownRing
          progress={ringProgress}
          size={32}
          stroke={3}
          color="#7CF5E1"
          glow
          label={`${cooldownSeconds}s`}
        />
        <span className="text-xs font-bold text-white/70">Cooling down…</span>
      </div>
    );
  }

  return (
    <GlowButton
      variant={canAfford ? "teal" : "ghost"}
      size="sm"
      onClick={onRefresh}
      disabled={!canRefresh}
      title={canAfford ? `Reroll opponents for ${cost} gold` : `Need ${cost} gold to reroll`}
    >
      <span className="inline-flex items-center gap-1.5">
        <span>↻</span>
        <span>Refresh</span>
        <span className="inline-flex items-center gap-0.5">
          <GoldIcon size={12} />
          {formatGold(cost)}
        </span>
      </span>
    </GlowButton>
  );
}

// ---------------------------------------------------------------------------
// Single opponent card.
// ---------------------------------------------------------------------------

function OpponentCard({
  opp,
  index,
  playerGold,
  onPick,
}: {
  opp: Opponent;
  index: number;
  playerGold: number;
  onPick: (opp: Opponent) => void;
}): React.ReactNode {
  const canAffordBattle = playerGold >= opp.entryCost;
  const strongest = strongestOfTeam(opp.crabs);

  return (
    <motion.li
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: Math.min(0.3, index * 0.08), ease: "easeOut" }}
    >
      <motion.div
        whileHover={{ y: -3 }}
        transition={{ duration: 0.18 }}
        className="rounded-2xl overflow-hidden"
        style={{
          background: "linear-gradient(135deg, rgba(18,167,160,0.10) 0%, rgba(10,27,61,0.7) 100%)",
          border: `1px solid ${canAffordBattle ? "rgba(124,245,225,0.30)" : "rgba(255,77,109,0.30)"}`,
          boxShadow: canAffordBattle
            ? "0 4px 16px rgba(10,27,61,0.55)"
            : "0 4px 14px rgba(255,77,109,0.18)",
        }}
      >
        <div className="p-3 sm:p-4">
          {/* Top row: identity + rank + record */}
          <div className="flex items-start gap-2 mb-3">
            {/* Rank badge */}
            <div
              className="shrink-0 rounded-lg px-2 py-1 text-center min-w-[44px]"
              style={{
                background: "rgba(255,209,102,0.10)",
                border: "1px solid rgba(255,209,102,0.35)",
              }}
            >
              <div className="text-[8px] uppercase tracking-wide text-white/55 leading-none">Rank</div>
              <div className="font-display font-bold text-sm leading-tight" style={{ color: "#FFD166" }}>
                #{opp.rank}
              </div>
            </div>

            {/* Name + record */}
            <div className="flex-1 min-w-0">
              <div className="text-sm font-bold truncate" style={{ color: "#EAF6FF" }}>
                {opp.name}
              </div>
              <div className="flex items-center gap-2 mt-0.5 text-[10px]">
                <span style={{ color: "#4FB477" }}>
                  <span className="font-bold">{opp.wins}</span>W
                </span>
                <span style={{ color: "#FF4D6D" }}>
                  <span className="font-bold">{opp.losses}</span>L
                </span>
                <span className="text-white/55">•</span>
                <span style={{ color: "#FFD166" }}>
                  WR <span className="font-bold">{(opp.winRate * 100).toFixed(0)}%</span>
                </span>
              </div>
            </div>

            {/* Reward preview (compact) */}
            <div className="shrink-0 text-right">
              <div className="text-[8px] uppercase tracking-wide text-white/55 leading-none">Reward</div>
              <div className="text-[11px] font-bold inline-flex items-center gap-0.5" style={{ color: "#FFD166" }}>
                <GoldIcon size={11} />
                {formatGold(opp.rewardPreview.gold)}
              </div>
              <div className="text-[10px] font-bold" style={{ color: "#7CF5E1" }}>
                +{opp.rewardPreview.xp}xp
              </div>
            </div>
          </div>

          {/* Crab thumbnails row (up to 5 per opponent) */}
          <div className="flex items-center justify-center gap-0.5 sm:gap-1.5 mb-3">
            {opp.crabs.slice(0, 5).map((c, ci) => {
              const isStrongest = strongest?.id === c.id;
              return (
                <motion.div
                  key={c.id}
                  whileHover={{ scale: 1.05 }}
                  className="relative rounded-lg p-0.5"
                  style={{
                    background: isStrongest
                      ? "rgba(255,209,102,0.10)"
                      : "rgba(10,27,61,0.55)",
                    border: `1px solid ${isStrongest ? "rgba(255,209,102,0.55)" : "rgba(124,245,225,0.18)"}`,
                  }}
                  title={`${c.name} — Lv.${c.level} ${c.classId}`}
                >
                  <div className="flex justify-center">
                    <CrabSprite crab={c} size={52} animated={false} />
                  </div>
                  <div className="flex items-center justify-center gap-0.5 mt-0.5">
                    <ClassIcon classId={c.classId} size={12} />
                    <span className="text-[9px] font-bold" style={{ color: "#EAF6FF" }}>
                      {c.level}
                    </span>
                  </div>
                  <div className="flex justify-center">
                    <FactionBadge faction={c.faction} size={10} />
                  </div>
                  <div className="flex justify-center mt-0.5">
                    <ElementBadge crab={c} compact />
                  </div>
                  {/* positional index dot */}
                  <span
                    className="absolute -top-1 -left-1 rounded-full text-[7px] font-bold w-3.5 h-3.5 flex items-center justify-center"
                    style={{
                      background: "rgba(10,27,61,0.9)",
                      color: "#7CF5E1",
                      border: "1px solid rgba(124,245,225,0.35)",
                    }}
                  >
                    {ci + 1}
                  </span>
                </motion.div>
              );
            })}
          </div>

          {/* Fleet strength bar */}
          <div className="mb-3">
            <div className="flex items-center justify-between text-[9px] mb-0.5">
              <span className="uppercase tracking-wide text-white/55">Fleet Strength</span>
              <span className="font-bold" style={{ color: "#7CF5E1" }}>
                {opp.fleetStrength.toLocaleString()}
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${fleetPct(opp)}%` }}
                transition={{ duration: 0.6, ease: "easeOut", delay: 0.1 + index * 0.08 }}
                className="h-full rounded-full"
                style={{ background: "linear-gradient(90deg, #12A7A0, #7CF5E1)" }}
              />
            </div>
          </div>

          {/* Bottom row: entry cost + Battle button */}
          <div className="flex items-center gap-2">
            <div
              className="flex-1 rounded-xl px-3 py-2"
              style={{
                background: canAffordBattle ? "rgba(255,209,102,0.10)" : "rgba(255,77,109,0.10)",
                border: `1px solid ${canAffordBattle ? "rgba(255,209,102,0.30)" : "rgba(255,77,109,0.30)"}`,
              }}
            >
              <div className="text-[9px] uppercase tracking-wide text-white/55 leading-none">Entry Cost</div>
              <div className="inline-flex items-center gap-1 mt-0.5">
                <GoldIcon size={14} />
                <span
                  className="font-display font-bold text-sm"
                  style={{ color: canAffordBattle ? "#FFD166" : "#FF4D6D" }}
                >
                  {formatGold(opp.entryCost)}
                </span>
              </div>
            </div>

            <GlowButton
              variant={canAffordBattle ? "teal" : "rose"}
              size="lg"
              onClick={() => onPick(opp)}
              disabled={!canAffordBattle}
              className="flex-shrink-0"
              title={
                canAffordBattle
                  ? `Battle ${opp.name}`
                  : `Need ${opp.entryCost - playerGold} more gold to battle ${opp.name}`
              }
            >
              {canAffordBattle ? "⚔️ Battle" : "Locked"}
            </GlowButton>
          </div>

          {/* Insufficient-funds hint */}
          {!canAffordBattle && (
            <div className="mt-2 text-center text-[10px]" style={{ color: "#FF4D6D" }}>
              Not enough gold — short by {formatGold(opp.entryCost - playerGold)}g
            </div>
          )}
        </div>
      </motion.div>
    </motion.li>
  );
}
