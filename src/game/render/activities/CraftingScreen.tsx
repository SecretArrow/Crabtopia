// Crabtopia - Crafting activity screen ("Tide Forge")
// Materials + Recipes tabs. Crafting consumes materials from the
// player profile inventory and produces items. Forge animation plays
// on every craft.
"use client";

import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useGame } from "../../store/gameStore";
import {
  GlowButton,
  GlassPanel,
  RarityBadge,
  rarityColor,
} from "../ui";
import {
  MATERIAL_LIST,
  RECIPE_LIST,
  canCraft,
  type MaterialId,
  type RecipeDef,
} from "../../data/materials";

type Tab = "materials" | "recipes";

export default function CraftingScreen() {
  const setScreen = useGame((s) => s.setScreen);
  const pushToast = useGame((s) => s.pushToast);
  const player = useGame((s) => s.player);
  const spendMaterials = useGame((s) => s.spendMaterials);
  const gainItem = useGame((s) => s.gainItem);

  // Materials + items live in the player profile (item-market escrow
  // settles against the same stock).
  const inv = useMemo(
    () => ({
      materials: player?.materials ?? {},
      items: player?.items ?? {},
    }),
    [player]
  );
  const [tab, setTab] = useState<Tab>("recipes");
  const [crafting, setCrafting] = useState<RecipeDef | null>(null);

  function handleCraft(recipe: RecipeDef) {
    if (!canCraft(inv.materials, recipe)) {
      pushToast({
        title: `Not enough materials for ${recipe.name}.`,
        variant: "error",
      });
      return;
    }
    setCrafting(recipe);
    // Forge animation runs ~1s, then commit.
    setTimeout(() => {
      spendMaterials(recipe.materials);
      gainItem(recipe.id, 1);
      pushToast({
        title: `Crafted ${recipe.name}!`,
        description: `${recipe.icon} added to your vault.`,
        variant: "success",
      });
      setCrafting(null);
    }, 1000);
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
            🔨 Tide Forge
          </h1>
          <div className="w-[68px]" />
        </div>

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
            variant={tab === "recipes" ? "teal" : "ghost"}
            size="sm"
            onClick={() => setTab("recipes")}
          >
            📜 Recipes
          </GlowButton>
        </div>

        {tab === "materials" ? (
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
            {MATERIAL_LIST.map((m) => {
              const count = inv.materials[m.id] ?? 0;
              return (
                <GlassPanel
                  key={m.id}
                  className="p-3"
                  glow={count > 0 ? `${rarityColor(m.rarity)}33` : undefined}
                >
                  <div className="flex items-start justify-between">
                    <div className="text-3xl">{m.icon}</div>
                    <RarityBadge rarity={m.rarity} />
                  </div>
                  <div className="mt-1 text-xs font-bold">{m.name}</div>
                  <div className="text-[10px] text-white/50">
                    {m.source === "both" ? "Mine / Explore" : m.source}
                  </div>
                  <div className="mt-1 text-lg font-bold font-display" style={{ color: rarityColor(m.rarity) }}>
                    ×{count}
                  </div>
                  <div className="mt-1 text-[9px] leading-snug text-white/40">
                    {m.description}
                  </div>
                </GlassPanel>
              );
            })}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {RECIPE_LIST.map((recipe) => {
              const craftable = canCraft(inv.materials, recipe);
              const owned = inv.items[recipe.id] ?? 0;
              return (
                <GlassPanel
                  key={recipe.id}
                  className="p-3"
                  glow={craftable ? `${rarityColor(recipe.rarity)}33` : undefined}
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
                    </div>
                    {owned > 0 && (
                      <div className="text-xs font-bold" style={{ color: "#7CF5E1" }}>
                        ×{owned}
                      </div>
                    )}
                  </div>

                  {/* Required materials */}
                  <div className="mt-2 grid grid-cols-2 gap-1">
                    {(Object.keys(recipe.materials) as MaterialId[])
                      .filter((k) => recipe.materials[k] > 0)
                      .map((k) => {
                        const need = recipe.materials[k];
                        const have = inv.materials[k] ?? 0;
                        const ok = have >= need;
                        return (
                          <div
                            key={k}
                            className="flex items-center justify-between rounded-md px-1.5 py-0.5 text-[10px]"
                            style={{
                              background: "rgba(10,27,61,0.55)",
                              border: "1px solid rgba(124,245,225,0.12)",
                            }}
                          >
                            <span className="flex items-center gap-1 truncate">
                              {MATERIAL_LIST.find((m) => m.id === k)?.icon}{" "}
                              <span className="truncate">
                                {MATERIAL_LIST.find((m) => m.id === k)?.name}
                              </span>
                            </span>
                            <span
                              className="font-bold"
                              style={{ color: ok ? "#4FB477" : "#FF4D6D" }}
                            >
                              {have}/{need}
                            </span>
                          </div>
                        );
                      })}
                  </div>

                  <GlowButton
                    variant={craftable ? "gold" : "ghost"}
                    size="sm"
                    className="mt-2 w-full"
                    disabled={!craftable || crafting !== null}
                    onClick={() => handleCraft(recipe)}
                  >
                    🔨 Craft
                  </GlowButton>
                </GlassPanel>
              );
            })}
          </div>
        )}
      </div>

      {/* Forge animation overlay */}
      <AnimatePresence>
        {crafting && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center"
            style={{ background: "rgba(6,18,43,0.88)" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="flex flex-col items-center">
              <div className="mb-2 text-sm font-bold uppercase tracking-wide text-white/70">
                Forging {crafting.name}...
              </div>
              {/* Anvil + hammer */}
              <div className="relative h-40 w-40">
                {/* anvil */}
                <svg width={160} height={160} viewBox="0 0 160 160">
                  <rect x={40} y={110} width={80} height={20} rx={4} fill="#5C5C5C" />
                  <rect x={55} y={130} width={50} height={14} rx={4} fill="#444" />
                  <rect x={30} y={95} width={100} height={18} rx={6} fill="#6E6E6E" />
                  <rect x={20} y={88} width={30} height={14} rx={4} fill="#6E6E6E" />
                </svg>
                {/* hammer swing */}
                <motion.svg
                  width={80}
                  height={80}
                  viewBox="0 0 80 80"
                  className="absolute left-1/2 top-2"
                  style={{ transformOrigin: "40px 70px" }}
                  initial={{ rotate: -60 }}
                  animate={{ rotate: [-60, 10, -60, 10, -60] }}
                  transition={{ duration: 1, ease: "easeInOut" }}
                >
                  <rect x={36} y={20} width={8} height={50} rx={3} fill="#8B5A2B" />
                  <rect x={20} y={8} width={40} height={18} rx={4} fill="#888" stroke="#444" strokeWidth={2} />
                </motion.svg>
                {/* sparks */}
                {[0, 1, 2, 3, 4, 5, 6].map((i) => {
                  const angle = (i / 7) * Math.PI * 2;
                  return (
                    <motion.div
                      key={`spark-${i}`}
                      className="absolute left-1/2 top-[80px] rounded-full"
                      style={{
                        width: 6,
                        height: 6,
                        background: i % 2 ? "#FFD166" : "#FF7A1A",
                        boxShadow: "0 0 6px #FFD166",
                      }}
                      initial={{ x: 0, y: 0, opacity: 0 }}
                      animate={{
                        x: Math.cos(angle) * 50,
                        y: Math.sin(angle) * 30 - 20,
                        opacity: [0, 1, 0],
                      }}
                      transition={{
                        duration: 0.5,
                        delay: 0.2 + i * 0.06,
                        repeat: 1,
                      }}
                    />
                  );
                })}
              </div>
              <motion.div
                className="mt-2 text-5xl"
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: [0, 1.3, 1], opacity: [0, 1, 1] }}
                transition={{ duration: 0.6, delay: 0.6 }}
              >
                {crafting.icon}
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
