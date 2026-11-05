// Crabtopia - Arena Result Screen (Task C, screen 4 of 4)
// Victory / Defeat overlay shown after the battle resolves. Displays the
// rewards (gold + XP + items), ambient particle effects, and two CTA buttons.

"use client";

import React, { useMemo } from "react";
import { motion } from "framer-motion";
import { MATERIALS, type MaterialId } from "../../data/materials";
import {
  GlowButton,
  GlassPanel,
  GoldIcon,
  formatGold,
} from "../ui";

export interface ArenaResultProps {
  result: {
    winner: "player" | "enemy";
    goldReward: number;
    xpReward: number;
    itemsFound: { itemId: string; count: number }[];
    arenaId: string;
  };
  opponentName: string;
  onContinue: () => void;
  onBattleLog: () => void;
}

const isVictory = (winner: "player" | "enemy"): boolean => winner === "player";

// ---------------------------------------------------------------------------
// ConfettiBurst — one-shot particle burst at banner center.
// `kind` = "gold" (victory) or "ash" (defeat).
// ---------------------------------------------------------------------------
function ConfettiBurst({ kind }: { kind: "gold" | "ash" }): React.ReactNode {
  const colors =
    kind === "gold"
      ? ["#FFD166", "#FF7A1A", "#FFE08A", "#FFC04A"]
      : ["#3a2f1f", "#5d4d33", "#1f1a12", "#6b6b6b"];
  const particles = useMemo(
    () =>
      Array.from({ length: 28 }, (_, i) => {
        const angle = (i / 28) * Math.PI * 2;
        const dist = 120 + ((i * 53) % 90);
        const delay = (i % 6) * 0.04;
        const size = 6 + ((i * 7) % 6);
        return {
          dx: Math.cos(angle) * dist,
          dy: Math.sin(angle) * dist - 40,
          color: colors[i % colors.length],
          delay,
          size,
          rot: (i * 47) % 360,
        };
      }),
    [colors],
  );

  return (
    <div
      className="absolute left-1/2 top-1/2 pointer-events-none"
      style={{ transform: "translate(-50%, -50%)" }}
      aria-hidden
    >
      {particles.map((p, i) => (
        <motion.div
          key={i}
          className="absolute rounded-sm"
          style={{
            width: p.size,
            height: p.size * 1.6,
            background: p.color,
            left: 0,
            top: 0,
            boxShadow: kind === "gold" ? `0 0 6px ${p.color}` : "none",
          }}
          initial={{ x: 0, y: 0, opacity: 1, rotate: 0, scale: 1 }}
          animate={{
            x: p.dx,
            y: [p.dy, p.dy + 200],
            opacity: [1, 1, 0],
            rotate: [0, p.rot, p.rot + 180],
            scale: [1, 0.9, 0.6],
          }}
          transition={{
            duration: 1.4,
            delay: p.delay,
            ease: "easeOut",
            times: [0, 0.5, 1],
          }}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// VictoryRain — ongoing golden particles falling for the victory ambient.
// ---------------------------------------------------------------------------
function VictoryRain(): React.ReactNode {
  const drops = useMemo(
    () =>
      Array.from({ length: 18 }, (_, i) => {
        const r1 = ((i * 9301 + 49297) % 233280) / 233280;
        const r2 = ((i * 7919 + 314159) % 233280) / 233280;
        return {
          left: ((i * 13 + r1 * 20) % 100),
          size: 4 + Math.floor(r2 * 6),
          duration: 3 + r1 * 3,
          delay: r2 * 3,
          char: i % 3 === 0 ? "✨" : i % 3 === 1 ? "🪙" : "⭐",
        };
      }),
    [],
  );
  return (
    <div
      className="absolute inset-0 pointer-events-none overflow-hidden"
      aria-hidden
    >
      {drops.map((d, i) => (
        <motion.div
          key={i}
          className="absolute"
          style={{
            left: `${d.left}%`,
            top: -20,
            fontSize: d.size + 8,
          }}
          initial={{ y: 0, opacity: 0, rotate: 0 }}
          animate={{
            y: [0, 600],
            opacity: [0, 1, 1, 0],
            rotate: [0, 180, 360],
          }}
          transition={{
            duration: d.duration,
            delay: d.delay,
            repeat: Infinity,
            ease: "easeIn",
          }}
        >
          {d.char}
        </motion.div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// DefeatVignette — subtle red pulsing overlay.
// ---------------------------------------------------------------------------
function DefeatVignette(): React.ReactNode {
  return (
    <div
      className="absolute inset-0 pointer-events-none"
      aria-hidden
      style={{
        background:
          "radial-gradient(ellipse at center, transparent 30%, rgba(255,77,109,0.18) 90%)",
      }}
    >
      <motion.div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.35) 100%)",
        }}
        animate={{ opacity: [0.6, 0.85, 0.6] }}
        transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// RewardRow — single material / item reward.
// ---------------------------------------------------------------------------
function RewardRow({
  itemId,
  count,
}: {
  itemId: string;
  count: number;
}): React.ReactNode {
  const mat = MATERIALS[itemId as MaterialId];
  const name = mat?.name ?? itemId;
  const icon = mat?.icon ?? "📦";
  const rarity = mat?.rarity;
  const rarityColor =
    rarity === "legendary"
      ? "#FFD166"
      : rarity === "epic"
        ? "#7A5CFF"
        : rarity === "rare"
          ? "#5C7CFF"
          : rarity === "uncommon"
            ? "#7CF5E1"
            : "#9CA3AF";
  return (
    <motion.div
      layout
      className="flex items-center gap-2 rounded-xl px-2.5 py-1.5"
      style={{
        background: "rgba(10,27,61,0.55)",
        border: `1px solid ${rarityColor}55`,
      }}
      initial={{ x: -16, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={{ type: "spring", bounce: 0.3, duration: 0.5 }}
    >
      <span className="text-xl" aria-hidden>
        {icon}
      </span>
      <div className="flex-1 min-w-0">
        <div
          className="text-xs font-bold truncate"
          style={{ color: "#EAF6FF" }}
          title={name}
        >
          {name}
        </div>
        {rarity && (
          <div
            className="text-[9px] uppercase font-bold tracking-wide"
            style={{ color: rarityColor }}
          >
            {rarity}
          </div>
        )}
      </div>
      <motion.div
        className="text-sm font-black font-display"
        style={{ color: "#FFD166" }}
        initial={{ scale: 0 }}
        animate={{ scale: [0, 1.3, 1] }}
        transition={{ type: "spring", bounce: 0.5, duration: 0.6, delay: 0.2 }}
      >
        ×{count}
      </motion.div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// MAIN
// ---------------------------------------------------------------------------
export default function ArenaResult({
  result,
  opponentName,
  onContinue,
  onBattleLog,
}: ArenaResultProps): React.ReactNode {
  const victory = isVictory(result.winner);

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center px-4 py-6 overflow-hidden"
      style={{
        background:
          "linear-gradient(180deg, rgba(10,27,61,0.97) 0%, rgba(6,18,43,0.99) 100%)",
        backdropFilter: "blur(6px)",
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="arena-result-banner"
    >
      {/* Ambient */}
      {victory ? <VictoryRain /> : <DefeatVignette />}

      {/* Banner with confetti burst */}
      <div className="relative mb-4" style={{ minHeight: 90 }}>
        <ConfettiBurst kind={victory ? "gold" : "ash"} />
        <motion.h1
          id="arena-result-banner"
          className="text-5xl md:text-7xl font-black font-display text-center relative z-10"
          style={{
            background: victory
              ? "linear-gradient(135deg, #FFD166 0%, #FF7A1A 100%)"
              : "linear-gradient(135deg, #FF4D6D 0%, #C026D3 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
            filter: victory
              ? "drop-shadow(0 0 18px rgba(255,209,102,0.7))"
              : "drop-shadow(0 0 18px rgba(255,77,109,0.6))",
            fontFamily: "Fredoka, system-ui, sans-serif",
            letterSpacing: "0.04em",
          }}
          initial={{ scale: 0, rotate: victory ? -10 : 10, opacity: 0 }}
          animate={{
            scale: [0, 1.25, 1],
            rotate: [victory ? -10 : 10, victory ? 5 : -5, 0],
            opacity: [0, 1, 1],
          }}
          transition={{ type: "spring", bounce: 0.55, duration: 0.85 }}
        >
          {victory ? "VICTORY!" : "DEFEATED"}
        </motion.h1>
      </div>

      {/* Arena ID + opponent name */}
      <motion.div
        className="text-center mb-4"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
      >
        <div
          className="text-[11px] font-mono"
          style={{ color: "rgba(234,246,255,0.55)" }}
        >
          Arena ID:{" "}
          <span style={{ color: "#FFD166" }}>{result.arenaId}</span>
        </div>
        <div
          className="text-sm font-bold mt-0.5"
          style={{ color: "rgba(234,246,255,0.8)" }}
        >
          vs{" "}
          <span style={{ color: victory ? "#7CF5E1" : "#FF6F91" }}>
            {opponentName}
          </span>
        </div>
      </motion.div>

      {/* Rewards panel */}
      <motion.div
        className="w-full max-w-md"
        initial={{ opacity: 0, y: 20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ delay: 0.55, type: "spring", bounce: 0.3, duration: 0.6 }}
      >
        <GlassPanel className="p-4" glow={victory ? "rgba(255,209,102,0.25)" : "rgba(255,77,109,0.18)"}>
          <div
            className="text-[11px] font-bold uppercase tracking-wide mb-2"
            style={{ color: "rgba(234,246,255,0.6)" }}
          >
            Rewards
          </div>

          {victory ? (
            <>
              {/* Gold + XP row */}
              <div className="grid grid-cols-2 gap-2 mb-3">
                <motion.div
                  className="rounded-xl px-3 py-2 flex items-center gap-2"
                  style={{
                    background:
                      "linear-gradient(135deg, rgba(255,209,102,0.18) 0%, rgba(255,122,26,0.12) 100%)",
                    border: "1px solid rgba(255,209,102,0.4)",
                  }}
                  initial={{ x: -20, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  transition={{ delay: 0.7 }}
                >
                  <GoldIcon size={22} />
                  <div>
                    <div
                      className="text-[9px] uppercase font-bold tracking-wide"
                      style={{ color: "rgba(234,246,255,0.6)" }}
                    >
                      Gold
                    </div>
                    <motion.div
                      className="text-base font-black font-display"
                      style={{ color: "#FFD166" }}
                      initial={{ scale: 0 }}
                      animate={{ scale: [0, 1.3, 1] }}
                      transition={{
                        type: "spring",
                        bounce: 0.5,
                        duration: 0.6,
                        delay: 0.85,
                      }}
                    >
                      +{formatGold(result.goldReward)}
                    </motion.div>
                  </div>
                </motion.div>
                <motion.div
                  className="rounded-xl px-3 py-2 flex items-center gap-2"
                  style={{
                    background:
                      "linear-gradient(135deg, rgba(124,245,225,0.16) 0%, rgba(18,167,160,0.12) 100%)",
                    border: "1px solid rgba(124,245,225,0.4)",
                  }}
                  initial={{ x: 20, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  transition={{ delay: 0.75 }}
                >
                  <span className="text-xl" aria-hidden>
                    ⭐
                  </span>
                  <div>
                    <div
                      className="text-[9px] uppercase font-bold tracking-wide"
                      style={{ color: "rgba(234,246,255,0.6)" }}
                    >
                      XP
                    </div>
                    <motion.div
                      className="text-base font-black font-display"
                      style={{ color: "#7CF5E1" }}
                      initial={{ scale: 0 }}
                      animate={{ scale: [0, 1.3, 1] }}
                      transition={{
                        type: "spring",
                        bounce: 0.5,
                        duration: 0.6,
                        delay: 0.9,
                      }}
                    >
                      +{result.xpReward.toLocaleString()}
                    </motion.div>
                  </div>
                </motion.div>
              </div>

              {/* Items found */}
              <div>
                <div
                  className="text-[10px] font-bold uppercase tracking-wide mb-1.5"
                  style={{ color: "rgba(234,246,255,0.55)" }}
                >
                  Items Found ({result.itemsFound.reduce((s, i) => s + i.count, 0)})
                </div>
                {result.itemsFound.length > 0 ? (
                  <div className="flex flex-col gap-1.5 max-h-44 overflow-y-auto pr-1">
                    {result.itemsFound.map((it) => (
                      <RewardRow
                        key={it.itemId}
                        itemId={it.itemId}
                        count={it.count}
                      />
                    ))}
                  </div>
                ) : (
                  <div
                    className="text-xs italic rounded-xl px-3 py-2 text-center"
                    style={{
                      color: "rgba(234,246,255,0.45)",
                      background: "rgba(10,27,61,0.4)",
                      border: "1px dashed rgba(124,245,225,0.18)",
                    }}
                  >
                    No items dropped this time.
                  </div>
                )}
              </div>
            </>
          ) : (
            <motion.div
              className="text-center py-4"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.7 }}
            >
              <div
                className="text-3xl mb-1"
                aria-hidden
              >
                💔
              </div>
              <div
                className="text-sm font-bold"
                style={{ color: "#FF6F91" }}
              >
                No rewards — try again!
              </div>
              <div
                className="text-[11px] mt-1"
                style={{ color: "rgba(234,246,255,0.55)" }}
              >
                Your Tideguard was overwhelmed. Rebuild and challenge{" "}
                <span style={{ color: "#FF6F91" }}>{opponentName}</span> again.
              </div>
            </motion.div>
          )}
        </GlassPanel>
      </motion.div>

      {/* CTA buttons */}
      <motion.div
        className="flex items-center gap-2 mt-5 w-full max-w-md"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.0 }}
      >
        <GlowButton
          variant="gold"
          size="lg"
          onClick={onContinue}
          className="flex-1"
          title="Return to the arena menu"
        >
          Continue
        </GlowButton>
        <GlowButton
          variant="teal"
          size="lg"
          onClick={onBattleLog}
          className="flex-1"
          title="View the battle log"
        >
          Battle Log
        </GlowButton>
      </motion.div>
    </div>
  );
}
