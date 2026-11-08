// Crabtopia - Crafting activity screen ("Tide Forge")
// Materials + Recipes tabs. Crafting consumes materials from the
// player profile inventory and produces items. Forge animation plays
// on every craft.
"use client";

import { useEffect, useMemo, useState } from "react";
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
  // Forge play-out: materials spiral into the forge, the hammer falls,
  // then the crafted item is revealed as a card. NOTHING is spent or
  // granted until the player taps Collect on the reveal — closing or
  // cancelling mid-forge spends nothing, and the item is granted
  // exactly once through the same spendMaterials/gainItem path as
  // before (just deferred to the reveal's action).
  const [forge, setForge] = useState<{
    recipe: RecipeDef;
    stage: "forging" | "revealed";
  } | null>(null);

  // Forging runs ~1.9s, then the reveal card appears on its own.
  useEffect(() => {
    if (!forge || forge.stage !== "forging") return;
    const t = window.setTimeout(
      () => setForge((f) => (f ? { ...f, stage: "revealed" } : f)),
      1900
    );
    return () => window.clearTimeout(t);
  }, [forge?.stage]);

  function handleCraft(recipe: RecipeDef) {
    if (!canCraft(inv.materials, recipe)) {
      pushToast({
        title: `Not enough materials for ${recipe.name}.`,
        variant: "error",
      });
      return;
    }
    setForge({ recipe, stage: "forging" });
  }

  function collectCrafted() {
    if (!forge) return;
    const recipe = forge.recipe;
    spendMaterials(recipe.materials);
    gainItem(recipe.id, 1);
    pushToast({
      title: `Crafted ${recipe.name}!`,
      description: `${recipe.icon} added to your vault.`,
      variant: "success",
    });
    setForge(null);
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
                    disabled={!craftable || forge !== null}
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

      {/* Forge play-out overlay */}
      <AnimatePresence>
        {forge && (
          <motion.div
            data-testid="forge-scene"
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: "rgba(6,18,43,0.88)" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="flex flex-col items-center w-full max-w-sm">
              {forge.stage === "forging" ? (
                <>
                  <div className="mb-2 text-sm font-bold uppercase tracking-wide text-white/70">
                    Forging {forge.recipe.name}...
                  </div>
                  {/* Anvil + hammer + spiralling materials */}
                  <div className="relative h-40 w-40">
                    {/* forge glow */}
                    <motion.div
                      className="absolute left-1/2 top-1/2 rounded-full"
                      style={{
                        width: 150,
                        height: 150,
                        x: "-50%",
                        y: "-50%",
                        background:
                          "radial-gradient(circle, rgba(255,122,26,0.35) 0%, rgba(255,209,102,0.12) 55%, transparent 75%)",
                      }}
                      animate={{ scale: [1, 1.15, 1], opacity: [0.7, 1, 0.7] }}
                      transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
                    />
                    {/* anvil */}
                    <svg width={160} height={160} viewBox="0 0 160 160" className="relative">
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
                    {/* consumed materials spiral into the forge */}
                    {(Object.keys(forge.recipe.materials) as MaterialId[])
                      .filter((k) => forge.recipe.materials[k] > 0)
                      .map((k, i, arr) => {
                        const angle = (i / Math.max(1, arr.length)) * Math.PI * 2 - Math.PI / 2;
                        const startX = Math.cos(angle) * 95;
                        const startY = Math.sin(angle) * 70;
                        return (
                          <motion.span
                            key={k}
                            className="absolute left-1/2 top-[80px] text-2xl"
                            style={{ filter: "drop-shadow(0 0 6px rgba(255,209,102,0.8))" }}
                            initial={{ x: startX, y: startY, opacity: 0, scale: 0.6 }}
                            animate={{ x: [startX, startX * 0.4, 0], y: [startY, startY * 0.4, 0], opacity: [0, 1, 0], scale: [0.6, 1.15, 0.3] }}
                            transition={{ duration: 1.1, delay: 0.15 + i * 0.14, ease: "easeIn" }}
                          >
                            {MATERIAL_LIST.find((m) => m.id === k)?.icon}
                          </motion.span>
                        );
                      })}
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
                  <div className="mt-4 flex items-center gap-3">
                    <GlowButton
                      variant="gold"
                      size="sm"
                      onClick={() => setForge((f) => (f ? { ...f, stage: "revealed" } : f))}
                    >
                      Skip ▸
                    </GlowButton>
                    <button
                      type="button"
                      onClick={() => setForge(null)}
                      className="text-xs font-bold text-white/55 underline-offset-2 hover:text-white hover:underline"
                    >
                      Cancel — keep materials
                    </button>
                  </div>
                </>
              ) : (
                <>
                  {/* Reveal card: the forged item */}
                  <motion.div
                    initial={{ scale: 0.7, opacity: 0, rotateY: 70 }}
                    animate={{ scale: 1, opacity: 1, rotateY: 0 }}
                    transition={{ type: "spring", stiffness: 240, damping: 18 }}
                    className="w-full rounded-2xl p-4 text-center"
                    style={{
                      background: "rgba(10,27,61,0.85)",
                      border: `2px solid ${rarityColor(forge.recipe.rarity)}`,
                      boxShadow: `0 0 24px ${rarityColor(forge.recipe.rarity)}55`,
                    }}
                  >
                    <div className="text-5xl mb-2">{forge.recipe.icon}</div>
                    <div className="text-lg font-bold" style={{ fontFamily: "Fredoka, system-ui, sans-serif" }}>
                      {forge.recipe.name}
                    </div>
                    <div className="mt-1 flex justify-center">
                      <RarityBadge rarity={forge.recipe.rarity} />
                    </div>
                    <div className="mt-2 text-xs text-white/65 leading-snug">
                      {forge.recipe.description}
                    </div>
                    <div className="mt-1 text-[10px] text-white/45">
                      Forged from{" "}
                      {(Object.keys(forge.recipe.materials) as MaterialId[])
                        .filter((k) => forge.recipe.materials[k] > 0)
                        .map(
                          (k) =>
                            `${MATERIAL_LIST.find((m) => m.id === k)?.icon} ${MATERIAL_LIST.find((m) => m.id === k)?.name} ×${forge.recipe.materials[k]}`
                        )
                        .join(" · ")}
                    </div>
                  </motion.div>
                  <div className="mt-4 flex items-center gap-3">
                    <GlowButton variant="gold" size="md" onClick={collectCrafted}>
                      Collect →
                    </GlowButton>
                    <button
                      type="button"
                      onClick={() => setForge(null)}
                      className="text-xs font-bold text-white/55 underline-offset-2 hover:text-white hover:underline"
                    >
                      Not now
                    </button>
                  </div>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
