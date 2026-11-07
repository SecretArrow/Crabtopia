// Crabtopia - Arena Tidelord Leaderboard Screen
// Top 100 leaderboard (mocked but deterministic per day). Top-3 podium with
// gold/silver/bronze borders, sortable list of ranks 4..100, click-to-inspect
// detail popover, and the player's own row highlighted with a "YOU" badge.

"use client";

import React, { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  GlowButton,
  GlassPanel,
  GoldIcon,
  formatGold,
  FactionBadge,
  PlanktonField,
} from "../ui";
import CrabSprite from "../CrabSprite";
import { generateLeaderboard, Opponent } from "../../data/opponents";
import type { Crab } from "../../types";

export interface ArenaLeaderboardProps {
  onBack: () => void;
  playerRank: number;
  playerName: string;
}

type SortMode = "rank" | "wins" | "winRate";

const PODIUM_COLORS = ["#FFD166", "#C9D6EE", "#CD7F32", "#B87333", "#6B7280"]; // gold / silver / bronze / copper / iron
const PODIUM_LABELS = ["1st", "2nd", "3rd", "4th", "5th"];
const PODIUM_HEIGHTS = [110, 86, 70, 56, 44]; // px — first place tallest

// Derive a stable day seed (changes once per 24h).
function daySeedNow(): number {
  return Math.floor(Date.now() / 86_400_000);
}

// Pick the strongest crab from an opponent team by combined stats + level.
function strongestCrabOf(opp: Opponent): Crab | null {
  if (!opp.crabs || opp.crabs.length === 0) return null;
  const score = (c: Crab) =>
    c.stats.hp + c.stats.attack + c.stats.defense + c.stats.speed + c.stats.skill + c.level * 20;
  return [...opp.crabs].sort((a, b) => score(b) - score(a))[0];
}

// Compute a friendly fleet-strength bar percent vs a reference max.
const FLEET_MAX = 3500;
function fleetPct(opp: Opponent): number {
  return Math.max(2, Math.min(100, (opp.fleetStrength / FLEET_MAX) * 100));
}

// Decorated row type — original Opponent + an isPlayer flag.
interface Row {
  opp: Opponent;
  isPlayer: boolean;
}

export default function ArenaLeaderboard({
  onBack,
  playerRank,
  playerName,
}: ArenaLeaderboardProps): React.ReactNode {
  const [sortMode, setSortMode] = useState<SortMode>("rank");
  const [selected, setSelected] = useState<Opponent | null>(null);

  // Cache the leaderboard per day seed so we don't regenerate on every render.
  // A 60s interval checks whether the day has rolled over and refreshes the
  // cache if so. setState happens inside the interval callback (not synchronously
  // in the effect body) so this doesn't trigger cascading renders.
  const [cachedDaySeed, setCachedDaySeed] = useState<number>(() => daySeedNow());
  const [cachedList, setCachedList] = useState<Opponent[]>(() =>
    generateLeaderboard(daySeedNow())
  );

  useEffect(() => {
    const id = window.setInterval(() => {
      const today = daySeedNow();
      setCachedDaySeed((prev) => {
        if (prev === today) return prev;
        setCachedList(generateLeaderboard(today));
        return today;
      });
    }, 60_000);
    return () => window.clearInterval(id);
  }, []);

  // Decorate the cached list — mark the player's row (replace its name with
  // the actual player's name) when their rank falls in 1..100.
  const decorated: Row[] = useMemo(() => {
    return cachedList.map((opp) => {
      const isPlayer = playerRank >= 1 && playerRank <= 100 && opp.rank === playerRank;
      return {
        opp: isPlayer ? { ...opp, name: playerName || opp.name } : opp,
        isPlayer,
      };
    });
  }, [cachedList, playerRank, playerName]);

  // Sort the displayed list by the current mode.
  const sorted: Row[] = useMemo(() => {
    const arr = [...decorated];
    if (sortMode === "rank") {
      arr.sort((a, b) => a.opp.rank - b.opp.rank);
    } else if (sortMode === "wins") {
      arr.sort((a, b) => b.opp.wins - a.opp.wins);
    } else {
      arr.sort((a, b) => b.opp.winRate - a.opp.winRate);
    }
    return arr;
  }, [decorated, sortMode]);

  const podium = sorted.slice(0, 5);
  const rest = sorted.slice(5);

  // Podium visual order: 4th | 2nd | 1st | 3rd | 5th — peak in center, descends outward.
  const podiumDisplayOrder = [podium[3], podium[1], podium[0], podium[2], podium[4]].filter(Boolean) as Row[];

  return (
    <div
      className="screen-enter relative w-full min-h-[100svh] flex flex-col"
      style={{ background: "linear-gradient(180deg, #0A1B3D 0%, #06122B 100%)" }}
    >
      <PlanktonField count={8} />

      {/* Header */}
      <header className="relative px-3 sm:px-4 pt-4 pb-2 max-w-3xl w-full mx-auto">
        <div className="flex items-center gap-2">
          <GlowButton variant="ghost" size="sm" onClick={onBack} title="Back to Arena Menu">
            ← Back
          </GlowButton>
          <div className="flex-1 text-center">
            <h1
              className="font-display text-lg sm:text-2xl font-extrabold tracking-wide"
              style={{
                background: "linear-gradient(180deg, #FFE9A8 0%, #FFD166 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              🏆 Tidelord Ranking
            </h1>
            <p className="text-[10px] text-white/55 uppercase tracking-wider">
              Day #{cachedDaySeed} • Top 100 Tideborn
            </p>
          </div>
          <div style={{ width: 64 }} aria-hidden="true" />
        </div>
      </header>

      {/* Body — scrollable */}
      <main className="relative flex-1 overflow-y-auto px-3 sm:px-4 pb-6 max-w-3xl w-full mx-auto">
        {/* ---------- PODIUM ---------- */}
        <section
          className="flex items-end justify-center gap-1 sm:gap-2 mt-2"
          aria-label="Top 5 podium"
        >
          {podiumDisplayOrder.map((row, displayIdx) => {
            // Determine the original podium position (gold=0, silver=1, bronze=2, copper=3, iron=4)
            const realPos = podium.indexOf(row);
            const accent = PODIUM_COLORS[realPos];
            const label = PODIUM_LABELS[realPos];
            const height = PODIUM_HEIGHTS[realPos];
            const isCenter = realPos === 0;
            return (
              <motion.button
                key={row.opp.id}
                onClick={() => setSelected(row.opp)}
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.45, delay: displayIdx * 0.12, ease: "easeOut" }}
                whileHover={{ y: -3 }}
                className="relative flex flex-col items-center rounded-2xl px-2 py-2 sm:px-3 sm:py-3 cursor-pointer"
                style={{
                  width: "20%",
                  maxWidth: 110,
                  minHeight: height + 60,
                  background: `linear-gradient(180deg, ${accent}22 0%, rgba(10,27,61,0.7) 100%)`,
                  border: `2px solid ${accent}`,
                  boxShadow: `0 0 18px ${accent}55`,
                }}
                title={`Inspect ${row.opp.name}`}
              >
                {/* Rank crown */}
                <div
                  className="absolute -top-2 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-full text-[9px] font-extrabold"
                  style={{ background: accent, color: "#0A1B3D" }}
                >
                  {label}
                </div>
                {/* Crab avatar */}
                <div
                  className="rounded-full overflow-hidden mt-1"
                  style={{
                    width: isCenter ? 64 : 52,
                    height: isCenter ? 64 : 52,
                    background: "radial-gradient(circle at 50% 60%, rgba(124,245,225,0.18), rgba(10,27,61,0.6))",
                    border: `1px solid ${accent}`,
                  }}
                >
                  {(() => {
                    const c = strongestCrabOf(row.opp);
                    return c ? (
                      <CrabSprite crab={c} size={isCenter ? 80 : 64} />
                    ) : (
                      <div className="flex items-center justify-center h-full text-xl">🦀</div>
                    );
                  })()}
                </div>
                {/* Name */}
                <div
                  className="mt-1.5 text-[10px] sm:text-xs font-bold text-center truncate w-full"
                  style={{ color: row.isPlayer ? accent : "#EAF6FF" }}
                >
                  {row.isPlayer && (
                    <span
                      className="inline-block mr-1 px-1 rounded text-[8px] font-bold align-middle"
                      style={{ background: "#7CF5E1", color: "#0A1B3D" }}
                    >
                      YOU
                    </span>
                  )}
                  {row.opp.name}
                </div>
                {/* Stats row */}
                <div className="mt-1 text-center text-[9px] text-white/60 leading-tight">
                  <div>
                    <span className="font-bold" style={{ color: "#7CF5E1" }}>
                      {row.opp.wins}
                    </span>
                    W –{" "}
                    <span className="font-bold" style={{ color: "#FF4D6D" }}>
                      {row.opp.losses}
                    </span>
                    L
                  </div>
                  <div className="mt-0.5">
                    WR{" "}
                    <span className="font-bold" style={{ color: "#FFD166" }}>
                      {(row.opp.winRate * 100).toFixed(1)}%
                    </span>
                  </div>
                </div>
                {/* Fleet strength mini bar */}
                <div className="mt-1.5 w-full">
                  <div className="h-1 rounded-full bg-white/10 overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${fleetPct(row.opp)}%`, background: accent }}
                    />
                  </div>
                </div>
              </motion.button>
            );
          })}
        </section>

        {/* ---------- SORT TOGGLES ---------- */}
        <section className="mt-5 flex items-center justify-center gap-1.5 flex-wrap">
          {([
            { id: "rank" as const, label: "By Rank" },
            { id: "wins" as const, label: "By Wins" },
            { id: "winRate" as const, label: "By Win Rate" },
          ]).map((m) => {
            const active = sortMode === m.id;
            return (
              <GlowButton
                key={m.id}
                variant={active ? "gold" : "ghost"}
                size="sm"
                onClick={() => setSortMode(m.id)}
              >
                {m.label}
              </GlowButton>
            );
          })}
        </section>

        {/* ---------- SCROLLABLE LIST (positions 4..100) ---------- */}
        <section className="mt-4">
          <ul className="space-y-1.5">
            {rest.map((row, i) => {
              const accent = row.isPlayer ? "#7CF5E1" : "rgba(124,245,225,0.20)";
              return (
                <motion.li
                  key={row.opp.id}
                  initial={{ opacity: 0, x: 12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.25, delay: Math.min(0.3, i * 0.015) }}
                >
                  <button
                    onClick={() => setSelected(row.opp)}
                    className="w-full flex items-center gap-2 px-2.5 py-2 rounded-xl text-left transition-all duration-150 hover:-translate-y-0.5"
                    style={{
                      background: row.isPlayer
                        ? "rgba(124,245,225,0.10)"
                        : "rgba(10,27,61,0.55)",
                      border: `1px solid ${accent}`,
                      boxShadow: row.isPlayer ? "0 0 14px rgba(124,245,225,0.45)" : "none",
                    }}
                    title={`Inspect ${row.opp.name}`}
                  >
                    {/* Rank # */}
                    <div
                      className="shrink-0 w-8 text-center font-display font-bold text-sm"
                      style={{ color: row.isPlayer ? "#7CF5E1" : "#EAF6FF" }}
                    >
                      {row.opp.rank}
                    </div>

                    {/* Name + record */}
                    <div className="flex-1 min-w-0">
                      <div
                        className="text-xs font-bold truncate flex items-center gap-1"
                        style={{ color: row.isPlayer ? "#7CF5E1" : "#EAF6FF" }}
                      >
                        {row.isPlayer && (
                          <span
                            className="inline-block px-1 rounded text-[8px] font-bold"
                            style={{ background: "#7CF5E1", color: "#0A1B3D" }}
                          >
                            YOU
                          </span>
                        )}
                        {row.opp.name}
                      </div>
                      <div className="text-[10px] text-white/55">
                        {row.opp.wins}W – {row.opp.losses}L
                      </div>
                    </div>

                    {/* Win rate */}
                    <div className="shrink-0 text-right">
                      <div className="text-[10px] text-white/55 uppercase">WR</div>
                      <div
                        className="text-xs font-bold font-display"
                        style={{ color: "#FFD166" }}
                      >
                        {(row.opp.winRate * 100).toFixed(0)}%
                      </div>
                    </div>

                    {/* Fleet strength bar */}
                    <div className="shrink-0 w-16 sm:w-20">
                      <div className="text-[9px] text-white/55 mb-0.5">Fleet</div>
                      <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${fleetPct(row.opp)}%`,
                            background: row.isPlayer ? "#7CF5E1" : "#12A7A0",
                          }}
                        />
                      </div>
                    </div>

                    {/* Inspect chevron */}
                    <div className="shrink-0 text-white/30 text-xs">›</div>
                  </button>
                </motion.li>
              );
            })}
          </ul>
        </section>

        {/* ---------- PLAYER RANK OUTSIDE TOP 100 ---------- */}
        {(playerRank <= 0 || playerRank > 100) && (
          <section className="mt-5">
            <GlassPanel className="p-3 text-center" glow="rgba(124,245,225,0.18)">
              <div className="text-xs text-white/60">
                {playerRank <= 0
                  ? "You are currently unranked — win arena battles to enter the leaderboard."
                  : `Your global rank is #${playerRank.toLocaleString()} — keep fighting to break the Top 100!`}
              </div>
            </GlassPanel>
          </section>
        )}
      </main>

      {/* ---------- INSPECT POPOVER ---------- */}
      <AnimatePresence>
        {selected && (
          <InspectPopover
            opp={selected}
            onClose={() => setSelected(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inspect Popover — shows the strongest crab of the clicked leaderboard row.
// ---------------------------------------------------------------------------

function InspectPopover({
  opp,
  onClose,
}: {
  opp: Opponent;
  onClose: () => void;
}): React.ReactNode {
  const strongest = strongestCrabOf(opp);
  const factions = Array.from(new Set(opp.crabs.map((c) => c.faction)));
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: "rgba(4,16,31,0.78)" }}
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.92, y: 16, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={{ scale: 0.92, y: 16, opacity: 0 }}
        transition={{ duration: 0.25, ease: "easeOut" }}
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
        className="w-full max-w-sm"
      >
        <GlassPanel className="p-5" glow="rgba(124,245,225,0.35)">
          <div className="flex items-start justify-between mb-3">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-white/55">
                Rank #{opp.rank}
              </div>
              <div
                className="font-display text-lg font-extrabold"
                style={{ color: "#FFD166" }}
              >
                {opp.name}
              </div>
            </div>
            <GlowButton variant="ghost" size="sm" onClick={onClose} title="Close">
              ✕
            </GlowButton>
          </div>

          {/* Avatar */}
          <div className="flex justify-center my-2">
            <div
              className="rounded-2xl px-3 py-2"
              style={{
                background: "radial-gradient(circle at 50% 60%, rgba(124,245,225,0.18), rgba(10,27,61,0.6))",
                border: "1px solid rgba(124,245,225,0.35)",
              }}
            >
              {strongest ? (
                <CrabSprite crab={strongest} size={120} />
              ) : (
                <div className="text-3xl">🦀</div>
              )}
            </div>
          </div>

          {strongest && (
            <div className="text-center text-xs text-white/70 mt-1">
              <span className="font-bold" style={{ color: "#EAF6FF" }}>{strongest.name}</span>
              <span className="text-white/45"> • Lv.{strongest.level} • Gen {strongest.generation}</span>
            </div>
          )}

          {/* Faction row */}
          <div className="flex items-center justify-center gap-1.5 mt-2 flex-wrap">
            {factions.map((f) => (
              <FactionBadge key={f} faction={f} size={14} showName />
            ))}
          </div>

          {/* Stats grid */}
          <div className="grid grid-cols-3 gap-2 mt-4">
            <StatCell label="Wins" value={opp.wins} color="#4FB477" />
            <StatCell label="Losses" value={opp.losses} color="#FF4D6D" />
            <StatCell
              label="Win Rate"
              value={`${(opp.winRate * 100).toFixed(1)}%`}
              color="#FFD166"
            />
            <StatCell
              label="Fleet Str"
              value={opp.fleetStrength.toLocaleString()}
              color="#7CF5E1"
            />
            <StatCell
              label="Entry Cost"
              value={
                <span className="inline-flex items-center gap-0.5">
                  <GoldIcon size={11} />
                  {formatGold(opp.entryCost)}
                </span>
              }
              color="#FFD166"
            />
            <StatCell
              label="Reward"
              value={
                <span className="inline-flex items-center gap-0.5">
                  <GoldIcon size={11} />
                  {formatGold(opp.rewardPreview.gold)}
                </span>
              }
              color="#FFD166"
            />
          </div>

          <div className="mt-4 text-center text-[10px] text-white/45 italic">
            Inspection only — no battle action from the leaderboard.
          </div>
        </GlassPanel>
      </motion.div>
    </motion.div>
  );
}

function StatCell({
  label,
  value,
  color,
}: {
  label: string;
  value: React.ReactNode;
  color: string;
}): React.ReactNode {
  return (
    <div
      className="rounded-lg px-2 py-1.5 text-center"
      style={{ background: "rgba(10,27,61,0.55)", border: "1px solid rgba(124,245,225,0.18)" }}
    >
      <div className="text-[9px] uppercase tracking-wide text-white/55">{label}</div>
      <div className="text-sm font-bold font-display" style={{ color }}>
        {value}
      </div>
    </div>
  );
}
