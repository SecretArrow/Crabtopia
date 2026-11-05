// Crabtopia - Arena Main Menu Hub
// Player header card (avatar, gold, level, rank) + top 5 crabs showcase +
// 4 primary buttons (Fight / Ranking / Battle Log / History) + activities row.
// Battle Log & History are inline expandable panels backed by localStorage.

"use client";

import React, { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useGame } from "../../store/gameStore";
import {
  GlowButton,
  GlassPanel,
  GoldIcon,
  formatGold,
  FactionBadge,
  RarityBadge,
  ClassIcon,
  PlanktonField,
} from "../ui";
import CrabSprite from "../CrabSprite";
import CrabDetailModal from "../CrabDetailModal";
import { useLocalStorage } from "../useLocalStorage";
import type { Crab } from "../../types";

export interface ArenaMenuProps {
  onFight: () => void;
  onRanking: () => void;
  onBattleLog: () => void;
  onHistory: () => void;
}

// localStorage shape — written by the ArenaController after each battle resolves.
// outcome uses "victory" | "defeat" (exactly what ArenaController writes at
// result time; a previous "win" comparison made every entry render as LOSS).
interface BattleLogEntry {
  arenaId: string;
  timestamp: number;
  opponentName: string;
  outcome: "victory" | "defeat";
  goldReward: number;
  xpReward: number;
}

const BATTLE_LOG_KEY = "crabtopia_battle_log_v1";

const ACTIVITIES: { id: string; label: string; icon: string; screen: string }[] = [
  { id: "mining", label: "Mining", icon: "⛏️", screen: "mining" },
  { id: "exploration", label: "Explore", icon: "🧭", screen: "exploration" },
  { id: "breeding", label: "Breeding", icon: "🥚", screen: "breeding" },
  { id: "crafting", label: "Crafting", icon: "🔧", screen: "crafting" },
  { id: "inventory", label: "Inventory", icon: "🎒", screen: "inventory" },
];

// Stat bar used in the top-5 crabs showcase.
function MiniStatBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = Math.max(0, Math.min(100, (value / Math.max(1, max)) * 100));
  return (
    <div className="flex items-center gap-1 text-[9px]">
      <span className="w-6 text-white/55 uppercase tracking-wide">{label}</span>
      <div className="flex-1 h-1 rounded-full bg-white/10 overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

// Rank badge text e.g. "Tidelord #1234"
function formatTidelordRank(rank: number): string {
  if (!rank || rank <= 0) return "Unranked";
  return `Tidelord #${rank.toLocaleString()}`;
}

// Pick the strongest crab by sum of stats (hp + atk + def + spd + skill) + level.
function pickStrongestCrab(crabs: Crab[] | undefined): Crab | null {
  if (!crabs || crabs.length === 0) return null;
  const score = (c: Crab) =>
    c.stats.hp + c.stats.attack + c.stats.defense + c.stats.speed + c.stats.skill + c.level * 20;
  return [...crabs].sort((a, b) => score(b) - score(a))[0];
}

function pickTopFiveCrabs(crabs: Crab[] | undefined): Crab[] {
  if (!crabs || crabs.length === 0) return [];
  const score = (c: Crab) =>
    c.stats.hp + c.stats.attack + c.stats.defense + c.stats.speed + c.stats.skill + c.level * 20;
  return [...crabs].sort((a, b) => score(b) - score(a)).slice(0, 5);
}

export default function ArenaMenu({
  onFight,
  onRanking,
  onBattleLog,
  onHistory,
}: ArenaMenuProps): React.ReactNode {
  const player = useGame((s) => s.player);
  const setScreen = useGame((s) => s.setScreen);

  const [battleLog] = useLocalStorage<BattleLogEntry[]>(BATTLE_LOG_KEY, []);
  const [battleLogOpen, setBattleLogOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  // Dossier for a tapped showcase crab — the ONLY place a fresh save can
  // inspect (and graduate) its rookie starter crabs.
  const [detailCrab, setDetailCrab] = useState<Crab | null>(null);

  const strongest = useMemo(() => pickStrongestCrab(player?.crabs), [player?.crabs]);
  const topFive = useMemo(() => pickTopFiveCrabs(player?.crabs), [player?.crabs]);

  const recentFive = useMemo(
    () => [...battleLog].sort((a, b) => b.timestamp - a.timestamp).slice(0, 5),
    [battleLog]
  );
  const fullHistory = useMemo(
    () => [...battleLog].sort((a, b) => b.timestamp - a.timestamp),
    [battleLog]
  );

  // No player profile yet — show a minimal empty state.
  if (!player) {
    return (
      <div
        className="relative w-full min-h-[100svh] flex items-center justify-center px-4"
        style={{ background: "linear-gradient(180deg, #0A1B3D 0%, #06122B 100%)" }}
      >
        <GlassPanel className="p-6 text-center max-w-sm">
          <p className="text-base font-bold text-white/85">No Tideborn profile loaded</p>
          <p className="text-xs text-white/55 mt-2">
            Initialize a player from the Onboarding screen first.
          </p>
          <div className="mt-4">
            <GlowButton variant="ghost" size="md" onClick={() => setScreen("home")}>
              ← Back to Home
            </GlowButton>
          </div>
        </GlassPanel>
      </div>
    );
  }

  const playerName = player.name;
  const gold = player.gold ?? 0;
  const shellwardenLevel = player.shellwardenLevel ?? 1;
  const tidelordRank = player.tidelordRank ?? 0;

  return (
    <div
      className="relative w-full min-h-[100svh] flex flex-col"
      style={{ background: "linear-gradient(180deg, #0A1B3D 0%, #06122B 100%)" }}
    >
      <PlanktonField count={10} />

      {/* Scrollable content area */}
      <main className="relative flex-1 overflow-y-auto px-3 sm:px-4 py-4 sm:py-6 max-w-3xl w-full mx-auto">
        {/* ---------- HEADER CARD ---------- */}
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45 }}
        >
          <GlassPanel className="p-4 sm:p-5" glow="rgba(124,245,225,0.18)">
            <div className="flex items-center gap-3 sm:gap-4">
              {/* Avatar */}
              <div
                className="relative shrink-0 rounded-2xl overflow-hidden"
                style={{
                  width: 72,
                  height: 72,
                  background: "radial-gradient(circle at 50% 60%, rgba(124,245,225,0.18), rgba(10,27,61,0.6))",
                  border: "1px solid rgba(124,245,225,0.35)",
                }}
              >
                {strongest ? (
                  <CrabSprite crab={strongest} size={96} animated />
                ) : (
                  <div className="flex items-center justify-center h-full text-2xl">🦀</div>
                )}
              </div>

              {/* Identity + badges */}
              <div className="flex-1 min-w-0">
                <h1 className="text-lg sm:text-xl font-bold truncate" style={{ color: "#EAF6FF" }}>
                  {playerName}
                </h1>
                <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                  <span
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold"
                    style={{
                      background: "rgba(124,245,225,0.14)",
                      color: "#7CF5E1",
                      border: "1px solid rgba(124,245,225,0.35)",
                    }}
                    title="Shellwarden level"
                  >
                    🔱 Shellwarden Lv.{shellwardenLevel}
                  </span>
                  <span
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold"
                    style={{
                      background: "rgba(255,209,102,0.14)",
                      color: "#FFD166",
                      border: "1px solid rgba(255,209,102,0.35)",
                    }}
                    title="Global Tidelord rank"
                  >
                    🏆 {formatTidelordRank(tidelordRank)}
                  </span>
                </div>
              </div>

              {/* Gold balance */}
              <div
                className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl"
                style={{
                  background: "rgba(255,209,102,0.10)",
                  border: "1px solid rgba(255,209,102,0.30)",
                }}
              >
                <GoldIcon size={18} />
                <span
                  className="font-display font-bold text-sm sm:text-base"
                  style={{ color: "#FFD166" }}
                >
                  {formatGold(gold)}
                </span>
              </div>
            </div>
          </GlassPanel>
        </motion.section>

        {/* ---------- TOP 5 CRABS SHOWCASE ---------- */}
        {topFive.length > 0 && (
          <motion.section
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.1 }}
            className="mt-4"
          >
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-bold tracking-wide" style={{ color: "#7CF5E1" }}>
                ⭐ Top Crabs
              </h2>
              <span className="text-[10px] text-white/45 uppercase tracking-wide">← swipe →</span>
            </div>
            <div className="-mx-3 px-3 overflow-x-auto pb-2" style={{ scrollbarWidth: "thin" }}>
              <div className="flex gap-3 min-w-min">
                {topFive.map((c, i) => (
                  <motion.div
                    key={c.id}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.4, delay: 0.15 + i * 0.08 }}
                    className="shrink-0 cursor-pointer"
                    style={{ width: 168 }}
                    onClick={() => setDetailCrab(c)}
                    role="button"
                    tabIndex={0}
                    aria-label={`Open dossier for ${c.name}`}
                    title={`${c.name} — tap for the full dossier`}
                  >
                    <GlassPanel className="p-3 h-full flex flex-col items-center">
                      <div className="relative">
                        <CrabSprite crab={c} size={96} animated />
                        <span
                          className="absolute -top-1 -left-1 rounded-full text-[10px] font-bold w-5 h-5 flex items-center justify-center"
                          style={{
                            background: i === 0 ? "#FFD166" : i === 1 ? "#C9D6EE" : "#CD7F32",
                            color: "#0A1B3D",
                          }}
                        >
                          {i + 1}
                        </span>
                      </div>
                      <div className="mt-1 text-xs font-bold text-center truncate max-w-full" style={{ color: "#EAF6FF" }}>
                        {c.name}
                      </div>
                      <div className="text-[10px] text-white/55 mb-1.5">Lv.{c.level} • Gen {c.generation}</div>
                      <div className="flex items-center gap-1 mb-2">
                        <FactionBadge faction={c.faction} size={14} showName />
                        <RarityBadge rarity={c.genes.shell.rarity} />
                      </div>
                      <div className="w-full space-y-1">
                        <MiniStatBar label="HP" value={c.stats.hp} max={500} color="#4FB477" />
                        <MiniStatBar label="ATK" value={c.stats.attack} max={120} color="#FF7A1A" />
                        <MiniStatBar label="DEF" value={c.stats.defense} max={120} color="#7CF5E1" />
                        <MiniStatBar label="SPD" value={c.stats.speed} max={120} color="#7A5CFF" />
                      </div>
                    </GlassPanel>
                  </motion.div>
                ))}
              </div>
            </div>
          </motion.section>
        )}

        {/* ---------- PRIMARY BUTTONS GRID 2x2 ---------- */}
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.2 }}
          className="mt-4"
        >
          <div className="grid grid-cols-2 gap-3">
            {/* Fight — main CTA, glowing */}
            <motion.div
              animate={{ scale: [1, 1.02, 1] }}
              transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
              className="col-span-2 sm:col-span-2"
            >
              <GlowButton
                variant="gold"
                size="lg"
                onClick={onFight}
                className="w-full text-base sm:text-lg tracking-wide"
                title="Choose an opponent to battle"
              >
                ⚔️ FIGHT
              </GlowButton>
            </motion.div>

            <GlowButton
              variant="teal"
              size="lg"
              onClick={onRanking}
              className="w-full"
              title="View the Tidelord leaderboard"
            >
              🏆 Ranking
            </GlowButton>

            <GlowButton
              variant="teal"
              size="lg"
              onClick={() => setBattleLogOpen((v) => !v)}
              className="w-full"
              title="Show your last 5 battles"
            >
              📜 Battle Log {battleLogOpen ? "▲" : "▼"}
            </GlowButton>

            <GlowButton
              variant="teal"
              size="lg"
              onClick={() => setHistoryOpen((v) => !v)}
              className="col-span-2 w-full"
              title="Show your full match history"
            >
              📚 History {historyOpen ? "▲" : "▼"}
            </GlowButton>
          </div>

          {/* Inline Battle Log panel (last 5) */}
          <AnimatePresence initial={false}>
            {battleLogOpen && (
              <motion.div
                key="blog-panel"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.25, ease: "easeInOut" }}
                className="overflow-hidden mt-3"
              >
                <GlassPanel className="p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold uppercase tracking-wide" style={{ color: "#7CF5E1" }}>
                      Recent Battles
                    </span>
                    <GlowButton variant="ghost" size="sm" onClick={onBattleLog}>
                      View All →
                    </GlowButton>
                  </div>
                  {recentFive.length === 0 ? (
                    <div className="text-center py-4 text-xs text-white/50">
                      No battles yet — tap <span className="text-[#FFD166] font-bold">FIGHT</span> to start.
                    </div>
                  ) : (
                    <ul className="space-y-1.5">
                      {recentFive.map((e) => (
                        <li
                          key={e.arenaId + e.timestamp}
                          className="flex items-center gap-2 px-2 py-1.5 rounded-lg"
                          style={{ background: "rgba(10,27,61,0.55)" }}
                        >
                          <span
                            className="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-bold"
                            style={{
                              background:
                                e.outcome === "victory"
                                  ? "rgba(79,180,119,0.20)"
                                  : "rgba(255,77,109,0.20)",
                              color: e.outcome === "victory" ? "#4FB477" : "#FF4D6D",
                            }}
                          >
                            {e.outcome === "victory" ? "WIN" : "LOSS"}
                          </span>
                          <span className="flex-1 min-w-0 truncate text-xs" style={{ color: "#EAF6FF" }}>
                            vs {e.opponentName}
                          </span>
                          <span className="shrink-0 inline-flex items-center gap-0.5 text-[11px] font-bold" style={{ color: "#FFD166" }}>
                            <GoldIcon size={12} />+{formatGold(e.goldReward)}
                          </span>
                          <span className="shrink-0 text-[10px] text-white/45">
                            {new Date(e.timestamp).toLocaleDateString()}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </GlassPanel>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Inline History panel (full, scrollable) */}
          <AnimatePresence initial={false}>
            {historyOpen && (
              <motion.div
                key="hist-panel"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.25, ease: "easeInOut" }}
                className="overflow-hidden mt-3"
              >
                <GlassPanel className="p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold uppercase tracking-wide" style={{ color: "#7CF5E1" }}>
                      Match History ({fullHistory.length})
                    </span>
                    <GlowButton variant="ghost" size="sm" onClick={onHistory}>
                      Full View →
                    </GlowButton>
                  </div>
                  {fullHistory.length === 0 ? (
                    <div className="text-center py-4 text-xs text-white/50">
                      No matches recorded yet.
                    </div>
                  ) : (
                    <ul
                      className="space-y-1.5 max-h-72 overflow-y-auto pr-1"
                      style={{ scrollbarWidth: "thin" }}
                    >
                      {fullHistory.map((e) => (
                        <li
                          key={e.arenaId + e.timestamp}
                          className="flex items-center gap-2 px-2 py-1.5 rounded-lg"
                          style={{ background: "rgba(10,27,61,0.55)" }}
                        >
                          <span
                            className="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-bold"
                            style={{
                              background:
                                e.outcome === "victory"
                                  ? "rgba(79,180,119,0.20)"
                                  : "rgba(255,77,109,0.20)",
                              color: e.outcome === "victory" ? "#4FB477" : "#FF4D6D",
                            }}
                          >
                            {e.outcome === "victory" ? "WIN" : "LOSS"}
                          </span>
                          <span className="flex-1 min-w-0 truncate text-xs" style={{ color: "#EAF6FF" }}>
                            vs {e.opponentName}
                          </span>
                          <span className="shrink-0 inline-flex items-center gap-0.5 text-[11px] font-bold" style={{ color: "#FFD166" }}>
                            <GoldIcon size={12} />+{formatGold(e.goldReward)}
                          </span>
                          <span className="shrink-0 text-[11px] font-bold" style={{ color: "#7CF5E1" }}>
                            +{e.xpReward}xp
                          </span>
                          <span className="shrink-0 text-[10px] text-white/45">
                            {new Date(e.timestamp).toLocaleString()}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </GlassPanel>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.section>

        {/* ---------- ACTIVITIES ROW ---------- */}
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.3 }}
          className="mt-5"
        >
          <h2 className="text-sm font-bold tracking-wide mb-2" style={{ color: "#7CF5E1" }}>
            🌊 Activities
          </h2>
          <div className="-mx-3 px-3 overflow-x-auto pb-1" style={{ scrollbarWidth: "thin" }}>
            <div className="flex gap-2 min-w-min">
              {ACTIVITIES.map((a) => (
                <motion.button
                  key={a.id}
                  whileTap={{ scale: 0.95 }}
                  whileHover={{ y: -2 }}
                  onClick={() => setScreen(a.screen)}
                  className="shrink-0 flex flex-col items-center justify-center gap-1 px-4 py-3 rounded-xl"
                  style={{
                    background: "rgba(18,167,160,0.08)",
                    border: "1px solid rgba(124,245,225,0.22)",
                    minWidth: 78,
                  }}
                  title={a.label}
                >
                  <span className="text-2xl leading-none">{a.icon}</span>
                  <span className="text-[10px] font-bold uppercase tracking-wide" style={{ color: "#EAF6FF" }}>
                    {a.label}
                  </span>
                </motion.button>
              ))}
            </div>
          </div>
        </motion.section>

        {/* ---------- BACK TO HOME ---------- */}
        <motion.section
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.4 }}
          className="mt-6 mb-2"
        >
          <div className="flex justify-center">
            <GlowButton variant="ghost" size="sm" onClick={() => setScreen("home")}>
              ← Back to Home
            </GlowButton>
          </div>
        </motion.section>
      </main>

      {/* Dossier for a tapped showcase crab. On a fresh save this is the
          only surface where the five rookie starters can be inspected —
          and graduated (unlocking breeding + trading). */}
      {detailCrab && (
        <CrabDetailModal crab={detailCrab} onClose={() => setDetailCrab(null)} />
      )}
    </div>
  );
}
