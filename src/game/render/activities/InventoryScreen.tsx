// Crabtopia - Inventory activity screen ("Shellwarden's Vault")
// Materials + Items tabs. Items can be "Used": stat_buffs open a crab picker
// and permanently boost a crab's stat; energy_restore refills mining energy;
// drop_rate / legendary_chance set persistent buff flags.
"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useGame } from "../../store/gameStore";
import {
  GlowButton,
  GlassPanel,
  EmptyState,
  RarityBadge,
  GoldIcon,
  rarityColor,
} from "../ui";
import CrabSprite from "../CrabSprite";
import { useLocalStorage } from "../useLocalStorage";
import {
  MATERIAL_LIST,
  RECIPE_LIST,
  type MaterialId,
  type ItemId,
  type RecipeDef,
} from "../../data/materials";
import {
  MINING_KEY,
  DEFAULT_MINING,
  BUFFS_KEY,
  DEFAULT_BUFFS,
  MAX_MINING_ENERGY,
  type MiningState,
  type BuffsState,
} from "../useLocalStorage";
import {
  RECOVERY_ITEM_LIST,
  type RecoveryItemDef,
} from "../../engine/stamina";
import StaminaBar from "../StaminaBar";
import type { Crab, CrabStats } from "../../types";

type Tab = "materials" | "items";

export default function InventoryScreen() {
  const setScreen = useGame((s) => s.setScreen);
  const pushToast = useGame((s) => s.pushToast);
  const player = useGame((s) => s.player);
  const consumeItemCount = useGame((s) => s.consumeItemCount);
  const useRecoveryItem = useGame((s) => s.useRecoveryItem);

  // Materials + items live in the player profile (the Bazaar item
  // market escrows against the same stock).
  const inv = {
    materials: player?.materials ?? {},
    items: player?.items ?? {},
  };
  const [mining, setMining] = useLocalStorage<MiningState>(
    MINING_KEY,
    DEFAULT_MINING
  );
  const [buffs, setBuffs] = useLocalStorage<BuffsState>(
    BUFFS_KEY,
    DEFAULT_BUFFS
  );

  const [tab, setTab] = useState<Tab>("materials");
  const [pickerFor, setPickerFor] = useState<RecipeDef | null>(null);
  const [recoveryPickerFor, setRecoveryPickerFor] =
    useState<RecoveryItemDef | null>(null);

  const crabs = player?.crabs ?? [];

  function handleUseRecovery(def: RecoveryItemDef) {
    const count = inv.items[def.id] ?? 0;
    if (count <= 0) {
      pushToast({
        title: `You have no ${def.name}.`,
        description: "Stock up at the Bazaar's Items & Supplies shelf.",
        variant: "error",
      });
      return;
    }
    if (def.needsTarget) {
      if (crabs.length === 0) {
        pushToast({ title: "You have no crabs.", variant: "error" });
        return;
      }
      setRecoveryPickerFor(def);
      return;
    }
    useRecoveryItem(def.id);
  }

  function applyItemToCrab(recipe: RecipeDef, crab: Crab) {
    if (recipe.effect.type !== "stat_buff") return;
    const { stat, percent } = recipe.effect;
    const factor = percent / 100;
    useGame.setState((s) => {
      if (!s.player) return {} as Partial<typeof s>;
      const crabsList = s.player.crabs.map((c) => {
        if (c.id !== crab.id) return c;
        const stats: CrabStats = { ...c.stats };
        stats[stat] = Math.round(stats[stat] * (1 + factor));
        return { ...c, stats };
      });
      return {
        player: { ...s.player, crabs: crabsList },
      } as Partial<typeof s>;
    });
    consumeItemCount(recipe.id, 1);
    pushToast({
      title: `${recipe.name} applied to ${crab.name}!`,
      description: `+${percent}% ${stat.toUpperCase()} permanently.`,
      variant: "success",
    });
    setPickerFor(null);
  }

  function applyItemNoTarget(recipe: RecipeDef) {
    const e = recipe.effect;
    if (e.type === "energy_restore") {
      const before = mining.energy;
      const restored = Math.min(MAX_MINING_ENERGY, before + e.amount);
      setMining((prev) => ({
        ...prev,
        energy: Math.min(MAX_MINING_ENERGY, prev.energy + e.amount),
      }));
      consumeItemCount(recipe.id, 1);
      pushToast({
        title: `Quaffed ${recipe.name}!`,
        description: `+${e.amount} mining energy (${before} → ${restored}).`,
        variant: "success",
      });
      return;
    }
    if (e.type === "drop_rate") {
      setBuffs((prev) => ({
        ...prev,
        dropRate: {
          percent: e.percent,
          charges: e.charges,
        },
      }));
      consumeItemCount(recipe.id, 1);
      pushToast({
        title: `${recipe.name} armed!`,
        description: `+1 bonus material from each of the next ${e.charges} treasure chests.`,
        variant: "success",
      });
      return;
    }
    if (e.type === "legendary_chance") {
      setBuffs((prev) => ({
        ...prev,
        legendaryChance: {
          percent: e.percent,
          charges: e.charges,
        },
      }));
      consumeItemCount(recipe.id, 1);
      pushToast({
        title: `${recipe.name} primed!`,
        description: `+${e.percent}% legendary chance for next breed.`,
        variant: "success",
      });
      return;
    }
  }

  function handleUse(recipe: RecipeDef) {
    const count = inv.items[recipe.id] ?? 0;
    if (count <= 0) {
      pushToast({
        title: `You have no ${recipe.name}.`,
        variant: "error",
      });
      return;
    }
    if (recipe.effect.type === "stat_buff") {
      if (crabs.length === 0) {
        pushToast({
          title: "You have no crabs to apply this to.",
          variant: "error",
        });
        return;
      }
      setPickerFor(recipe);
      return;
    }
    applyItemNoTarget(recipe);
  }

  return (
    <div
      className="min-h-screen w-full text-[#EAF6FF]"
      style={{
        background: "linear-gradient(180deg, #0A1B3D 0%, #06122B 100%)",
      }}
    >
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
            🎒 Shellwarden&apos;s Vault
          </h1>
          <div className="w-[68px]" />
        </div>

        {/* Active buffs summary */}
        <GlassPanel className="mb-3 px-3 py-2">
          <div className="flex flex-wrap items-center gap-3 text-[10px]">
            <span className="uppercase tracking-wide text-white/50">
              Active Buffs
            </span>
            {buffs.dropRate ? (
              <span style={{ color: "#7CF5E1" }}>
                🍀 +1 material/chest ({buffs.dropRate.charges} left)
              </span>
            ) : null}
            {buffs.legendaryChance ? (
              <span style={{ color: "#FFD166" }}>
                🎣 +{buffs.legendaryChance.percent}% leg (
                {buffs.legendaryChance.charges})
              </span>
            ) : null}
            {buffs.trapDebuff ? (
              <span style={{ color: "#FF4D6D" }}>
                🪤 -20% HP next battle
              </span>
            ) : null}
            {player?.recoveryBoostUntil &&
            player.recoveryBoostUntil > Date.now() ? (
              <span style={{ color: "#FFD166" }}>
                🕯️ Recovery ×3 (
                {Math.ceil((player.recoveryBoostUntil - Date.now()) / 60000)}m
                left)
              </span>
            ) : null}
            {!buffs.dropRate &&
            !buffs.legendaryChance &&
            !buffs.trapDebuff &&
            !(
              player?.recoveryBoostUntil &&
              player.recoveryBoostUntil > Date.now()
            ) ? (
              <span className="text-white/40">None</span>
            ) : null}
          </div>
        </GlassPanel>

        {/* Tabs */}
        <div className="mb-4 flex gap-2">
          <GlowButton
            variant={tab === "materials" ? "teal" : "ghost"}
            size="sm"
            onClick={() => setTab("materials")}
          >
            🌿 Materials
          </GlowButton>
          <GlowButton
            variant={tab === "items" ? "teal" : "ghost"}
            size="sm"
            onClick={() => setTab("items")}
          >
            🧪 Items
          </GlowButton>
        </div>

        {tab === "materials" ? (
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
            {MATERIAL_LIST.map((m) => {
              const count = inv.materials[m.id] ?? 0;
              return (
                <div
                  key={m.id}
                  className="group relative rounded-2xl p-3"
                  style={{
                    background: "rgba(18,167,160,0.08)",
                    border: `1px solid ${rarityColor(m.rarity)}55`,
                    backdropFilter: "blur(8px)",
                  }}
                >
                  <div className="flex items-start justify-between">
                    <div className="text-3xl">{m.icon}</div>
                    <RarityBadge rarity={m.rarity} />
                  </div>
                  <div className="mt-1 text-xs font-bold">{m.name}</div>
                  <div className="mt-1 text-lg font-bold font-display" style={{ color: rarityColor(m.rarity) }}>
                    ×{count}
                  </div>
                  {/* Hover tooltip */}
                  <div className="pointer-events-none absolute left-1/2 top-full z-20 mt-1 w-48 -translate-x-1/2 rounded-lg p-2 text-[10px] leading-snug opacity-0 transition-opacity group-hover:opacity-100"
                    style={{
                      background: "rgba(6,18,43,0.95)",
                      border: "1px solid rgba(124,245,225,0.25)",
                    }}
                  >
                    {m.description}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {RECIPE_LIST.map((recipe) => {
              const count = inv.items[recipe.id] ?? 0;
              const effectLabel = effectSummary(recipe);
              return (
                <GlassPanel
                  key={recipe.id}
                  className="p-3"
                  glow={count > 0 ? `${rarityColor(recipe.rarity)}33` : undefined}
                >
                  <div className="flex items-start gap-2">
                    <div className="text-3xl">{recipe.icon}</div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold truncate">
                          {recipe.name}
                        </span>
                        <RarityBadge rarity={recipe.rarity} />
                      </div>
                      <div className="text-[10px] leading-snug text-white/55">
                        {recipe.description}
                      </div>
                      <div className="mt-0.5 text-[10px] font-bold" style={{ color: "#7CF5E1" }}>
                        {effectLabel}
                      </div>
                    </div>
                    <div
                      className="text-sm font-bold font-display"
                      style={{ color: rarityColor(recipe.rarity) }}
                    >
                      ×{count}
                    </div>
                  </div>
                  <GlowButton
                    variant={count > 0 ? "gold" : "ghost"}
                    size="sm"
                    className="mt-2 w-full"
                    disabled={count <= 0}
                    onClick={() => handleUse(recipe)}
                  >
                    {count > 0 ? "Use" : "None"}
                  </GlowButton>
                </GlassPanel>
              );
            })}
          </div>

          {/* Recovery supplies (Bazaar Supplies shelf stock) */}
          <div className="mt-4 mb-2 text-xs font-bold uppercase tracking-wide text-white/60">
            🩹 Recovery Supplies
          </div>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {RECOVERY_ITEM_LIST.map((def) => {
              const count = inv.items[def.id] ?? 0;
              return (
                <GlassPanel key={def.id} className="p-3">
                  <div className="flex items-start gap-2">
                    <div className="text-3xl">{def.icon}</div>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-bold">{def.name}</div>
                      <div className="text-[10px] leading-snug text-white/55">
                        {def.description}
                      </div>
                    </div>
                    <div
                      className="text-sm font-bold font-display"
                      style={{ color: "#7CF5E1" }}
                    >
                      ×{count}
                    </div>
                  </div>
                  <GlowButton
                    variant={count > 0 ? "gold" : "ghost"}
                    size="sm"
                    className="mt-2 w-full"
                    disabled={count <= 0}
                    onClick={() => handleUseRecovery(def)}
                  >
                    {count > 0 ? "Use" : "None — Bazaar ▸ Items & Supplies"}
                  </GlowButton>
                </GlassPanel>
              );
            })}
          </div>
          </>
        )}
      </div>

      {/* Crab picker modal */}
      <AnimatePresence>
        {pickerFor && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center p-3"
            style={{ background: "rgba(6,18,43,0.88)" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setPickerFor(null)}
          >
            <GlassPanel
              className="w-full max-w-md p-4"
              glow="rgba(124,245,225,0.3)"
              // stop click bubbling so selecting inside doesn't close
            >
              <div onClick={(e) => e.stopPropagation()}>
                <div className="mb-2 flex items-center justify-between">
                  <div className="text-sm font-bold">
                    Apply {pickerFor.icon} {pickerFor.name} to...
                  </div>
                  <GlowButton
                    variant="ghost"
                    size="sm"
                    onClick={() => setPickerFor(null)}
                  >
                    ✕
                  </GlowButton>
                </div>
                {crabs.length === 0 ? (
                  <EmptyState
                    compact
                    message="No crabs available"
                    hint="Every crab is busy or already boosted."
                  />
                ) : (
                  <div className="grid max-h-72 grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-4">
                    {crabs.map((crab) => {
                      const statKey =
                        pickerFor.effect.type === "stat_buff"
                          ? pickerFor.effect.stat
                          : null;
                      const currentVal =
                        statKey ? crab.stats[statKey] : null;
                      return (
                        <button
                          key={crab.id}
                          onClick={() => applyItemToCrab(pickerFor, crab)}
                          className="flex flex-col items-center rounded-xl p-1.5 transition-all hover:-translate-y-0.5"
                          style={{
                            background: "rgba(10,27,61,0.55)",
                            border: "1px solid rgba(124,245,225,0.18)",
                          }}
                        >
                          <CrabSprite crab={crab} size={56} />
                          <div className="mt-0.5 w-full truncate text-center text-[9px] font-bold">
                            {crab.name}
                          </div>
                          <div className="text-[8px] text-white/55">
                            Lv{crab.level}
                          </div>
                          {statKey && currentVal !== null && (
                            <div className="text-[8px]" style={{ color: "#7CF5E1" }}>
                              {statKey.toUpperCase()} {currentVal}
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </GlassPanel>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Recovery item crab picker */}
      <AnimatePresence>
        {recoveryPickerFor && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center p-3"
            style={{ background: "rgba(6,18,43,0.88)" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setRecoveryPickerFor(null)}
          >
            <GlassPanel
              className="w-full max-w-md p-4"
              glow="rgba(255,209,102,0.3)"
            >
              <div onClick={(e) => e.stopPropagation()}>
                <div className="mb-2 flex items-center justify-between">
                  <div className="text-sm font-bold">
                    Use {recoveryPickerFor.icon} {recoveryPickerFor.name} on...
                  </div>
                  <GlowButton
                    variant="ghost"
                    size="sm"
                    onClick={() => setRecoveryPickerFor(null)}
                  >
                    ✕
                  </GlowButton>
                </div>
                <div className="grid max-h-72 grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-4">
                  {crabs.map((crab) => (
                    <button
                      key={crab.id}
                      onClick={() => {
                        if (useRecoveryItem(recoveryPickerFor.id, crab.id)) {
                          setRecoveryPickerFor(null);
                        }
                      }}
                      className="flex flex-col items-center rounded-xl p-1.5 transition-all hover:-translate-y-0.5"
                      style={{
                        background: "rgba(10,27,61,0.55)",
                        border: "1px solid rgba(124,245,225,0.18)",
                      }}
                    >
                      <CrabSprite crab={crab} size={56} />
                      <div className="mt-0.5 w-full truncate text-center text-[9px] font-bold">
                        {crab.name}
                      </div>
                      <div className="w-full px-0.5">
                        <StaminaBar
                          crab={crab}
                          boostUntil={player?.recoveryBoostUntil ?? 0}
                          compact
                        />
                      </div>
                    </button>
                  ))}
                </div>
                <div className="mt-2 text-[10px] text-white/50">
                  A refused use (full stamina, no wound) never consumes the
                  item.
                </div>
              </div>
            </GlassPanel>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function effectSummary(recipe: RecipeDef): string {
  const e = recipe.effect;
  switch (e.type) {
    case "stat_buff":
      return `+${e.percent}% ${e.stat.toUpperCase()}`;
    case "energy_restore":
      return `+${e.amount} mining energy`;
    case "drop_rate":
      return `+${e.percent}% drop ×${e.charges}`;
    case "legendary_chance":
      return `+${e.percent}% leg ×${e.charges}`;
    default:
      return "";
  }
}
