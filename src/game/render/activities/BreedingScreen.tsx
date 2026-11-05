// Crabtopia - Breeding activity screen ("Nursery Spire")
// Pick two parents, pay 200g, breed a new tideborn crab. Uses generateCrab +
// useGame.setState to add the new crab and increment parents' breedCount.
// Cooldown persisted in localStorage (30s for playability).
"use client";

import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useGame } from "../../store/gameStore";
import { CONFIG } from "../../engine/config";
import {
  GlowButton,
  GlassPanel,
  GoldIcon,
  formatGold,
  formatTime,
  BreedDots,
  FactionBadge,
} from "../ui";
import CrabSprite from "../CrabSprite";
import { useLocalStorage } from "../useLocalStorage";
import {
  BREEDING_KEY,
  DEFAULT_BREEDING,
  BUFFS_KEY,
  DEFAULT_BUFFS,
  BREED_COOLDOWN_MS,
  BREED_COST,
  type BreedingState,
  type BuffsState,
} from "../useLocalStorage";
import { generateCrab } from "../../engine/crabs";
import { mulberry32, pick } from "../../engine/rng";
import ElementBadge from "../ElementBadge";
import {
  COMBINE_CHANCE,
  elementOf,
  previewBreedingElements,
  rollChildElement,
} from "../../engine/elements";
import type { Crab, FactionId, ClassId } from "../../types";

type Slot = "A" | "B";

interface BreedPhase {
  stage: "idle" | "merge" | "egg" | "hatch" | "done";
  newCrab: Crab | null;
}

export default function BreedingScreen() {
  const setScreen = useGame((s) => s.setScreen);
  const pushToast = useGame((s) => s.pushToast);
  const spendGold = useGame((s) => s.spendGold);
  const player = useGame((s) => s.player);

  const [breeding, setBreeding] = useLocalStorage<BreedingState>(
    BREEDING_KEY,
    DEFAULT_BREEDING
  );
  const [buffs, setBuffs] = useLocalStorage<BuffsState>(
    BUFFS_KEY,
    DEFAULT_BUFFS
  );

  const [slots, setSlots] = useState<{ A: Crab | null; B: Crab | null }>({
    A: null,
    B: null,
  });
  const [phase, setPhase] = useState<BreedPhase>({
    stage: "idle",
    newCrab: null,
  });

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);

  const cooldownRemaining = useMemo(
    () => Math.max(0, breeding.lastBreedAt + BREED_COOLDOWN_MS - now),
    [breeding.lastBreedAt, now]
  );

  const crabs = player?.crabs ?? [];

  function assignCrab(crab: Crab) {
    if (phase.stage !== "idle") return;
    // If already in a slot, unassign.
    if (slots.A?.id === crab.id) {
      setSlots((s) => ({ ...s, A: null }));
      return;
    }
    if (slots.B?.id === crab.id) {
      setSlots((s) => ({ ...s, B: null }));
      return;
    }
    // Otherwise fill next empty slot.
    setSlots((s) => {
      if (!s.A) return { ...s, A: crab };
      if (!s.B) return { ...s, B: crab };
      return s; // both full
    });
  }

  function clearSlot(slot: Slot) {
    if (phase.stage !== "idle") return;
    setSlots((s) => ({ ...s, [slot]: null }));
  }

  const bothFilled = !!(slots.A && slots.B);
  const sameCrab = slots.A && slots.B && slots.A.id === slots.B.id;
  const parentABusy = slots.A && slots.A.breedCount >= CONFIG.maxBreedCount;
  const parentBBusy = slots.B && slots.B.breedCount >= CONFIG.maxBreedCount;
  const canBreed =
    bothFilled &&
    !sameCrab &&
    !parentABusy &&
    !parentBBusy &&
    cooldownRemaining <= 0 &&
    phase.stage === "idle";

  // Element possibilities for the picked pair (panel under the slots).
  const elementPreview =
    slots.A && slots.B
      ? previewBreedingElements(elementOf(slots.A), elementOf(slots.B))
      : null;

  function handleBreed() {
    if (!slots.A || !slots.B) return;

    if (sameCrab) {
      pushToast({
        title: "Pick two different crabs.",
        variant: "error",
      });
      return;
    }
    if (parentABusy || parentBBusy) {
      pushToast({
        title: "A parent is spent (breed count maxed).",
        description: "Crabs can only breed 3 times.",
        variant: "error",
      });
      return;
    }
    if (cooldownRemaining > 0) {
      pushToast({
        title: "Nursery is resting.",
        description: `Breed again in ${formatTime(cooldownRemaining)}.`,
        variant: "warning",
      });
      return;
    }
    if (!spendGold(BREED_COST)) {
      pushToast({
        title: `Need ${BREED_COST} gold to breed.`,
        variant: "error",
      });
      return;
    }

    const a = slots.A;
    const b = slots.B;

    // Roll the new crab's lineage options.
    const rng = mulberry32((a.visualSeed ^ b.visualSeed ^ Date.now()) >>> 0);
    const faction: FactionId = pick([a.faction, b.faction], rng);
    const classId: ClassId = pick([a.classId, b.classId], rng);
    const level = Math.max(1, Math.max(a.level, b.level) - 5);
    const generation = Math.max(a.generation, b.generation) + 1;
    const seed = (Date.now() ^ a.visualSeed ^ b.visualSeed) >>> 0;

    // Consume legendary lure buff if active — enables legendary gene rolls.
    const lureActive =
      buffs.legendaryChance && buffs.legendaryChance.charges > 0;
    if (lureActive) {
      setBuffs((prev) => {
        if (!prev.legendaryChance) return prev;
        const charges = prev.legendaryChance.charges - 1;
        if (charges <= 0) {
          const next = { ...prev };
          delete next.legendaryChance;
          return next;
        }
        return {
          ...prev,
          legendaryChance: {
            percent: prev.legendaryChance.percent,
            charges,
          },
        };
      });
    }

    const newCrab = generateCrab({
      faction,
      classId,
      level,
      generation,
      parentIds: [a.id, b.id],
      ownerId: "player",
      seed,
      allowLegendary: !!lureActive,
    });
    // The child's ELEMENT is rolled from the PARENTS' elements (recipe
    // fusion / inheritance / rare special mutation — engine/elements.ts),
    // seeded deterministically from this breeding's seed.
    newCrab.element = rollChildElement(
      elementOf(a),
      elementOf(b),
      mulberry32((seed ^ 0xe1e7) >>> 0),
    );

    // Kick off the 2s animation.
    setPhase({ stage: "merge", newCrab });

    // Phase timings.
    setTimeout(() => setPhase((p) => ({ ...p, stage: "egg" })), 600);
    setTimeout(() => setPhase((p) => ({ ...p, stage: "hatch" })), 1200);
    setTimeout(() => {
      // Commit: add new crab + increment both parents' breedCount + set cooldown.
      useGame.setState((s) => {
        if (!s.player) return {} as Partial<typeof s>;
        const crabsList = s.player.crabs.map((c) =>
          c.id === a.id || c.id === b.id
            ? { ...c, breedCount: c.breedCount + 1 }
            : c
        );
        return {
          player: { ...s.player, crabs: [...crabsList, newCrab] },
        } as Partial<typeof s>;
      });
      setBreeding((prev) => ({ ...prev, lastBreedAt: Date.now() }));
      pushToast({
        title: `A new tideborn emerges: ${newCrab.name}!`,
        description: `Gen ${generation} · Lv ${level} · ${faction}`,
        variant: "success",
      });
      setPhase((p) => ({ ...p, stage: "done" }));
    }, 1700);
  }

  function closeAnimation() {
    setSlots({ A: null, B: null });
    setPhase({ stage: "idle", newCrab: null });
  }

  const inAnimation = phase.stage !== "idle";

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
            🥚 Nursery Spire
          </h1>
          <GlassPanel className="px-3 py-1.5">
            <div className="flex items-center gap-1 text-sm font-bold">
              <GoldIcon size={14} />
              <span className="font-display">
                {formatGold(player?.gold ?? 0)}
              </span>
            </div>
          </GlassPanel>
        </div>

        {/* Breed cost + cooldown banner */}
        <GlassPanel className="mb-4 px-3 py-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-white/60">
              Breed Cost: <GoldIcon size={12} />{" "}
              <span style={{ color: "#FFD166" }}>{BREED_COST}</span>
            </span>
            {cooldownRemaining > 0 ? (
              <span style={{ color: "#FF4D6D" }}>
                Resting: {formatTime(cooldownRemaining)}
              </span>
            ) : (
              <span style={{ color: "#7CF5E1" }}>Ready</span>
            )}
          </div>
        </GlassPanel>

        {/* Parent slots */}
        <div className="mb-4 grid grid-cols-2 gap-3">
          {(["A", "B"] as Slot[]).map((slot) => {
            const crab = slots[slot];
            return (
              <GlassPanel
                key={slot}
                className="flex min-h-[180px] flex-col items-center justify-center p-3"
                glow={crab ? "rgba(124,245,225,0.25)" : undefined}
              >
                <div className="mb-1 text-[10px] uppercase tracking-wide text-white/50">
                  Parent {slot}
                </div>
                {crab ? (
                  <>
                    <CrabSprite crab={crab} size={96} animated />
                    <div className="mt-1 text-xs font-bold text-center">
                      {crab.name}
                    </div>
                    <div className="text-[10px] text-white/60">
                      Lv {crab.level} · Gen {crab.generation}
                    </div>
                    <div className="mt-1 flex items-center gap-1">
                      <FactionBadge faction={crab.faction} showName size={14} />
                    </div>
                    <div className="mt-1">
                      <ElementBadge crab={crab} />
                    </div>
                    <div className="mt-1 flex items-center gap-1">
                      <span className="text-[9px] text-white/50">Breed</span>
                      <BreedDots count={crab.breedCount} max={CONFIG.maxBreedCount} />
                    </div>
                    {!inAnimation && (
                      <GlowButton
                        variant="ghost"
                        size="sm"
                        className="mt-2"
                        onClick={() => clearSlot(slot)}
                      >
                        Remove
                      </GlowButton>
                    )}
                  </>
                ) : (
                  <div className="flex flex-col items-center text-white/30">
                    <div className="text-3xl">＋</div>
                    <div className="text-[10px]">Pick from roster</div>
                  </div>
                )}
              </GlassPanel>
            );
          })}
        </div>

        {/* Child element possibilities (both parents picked) */}
        {elementPreview && !sameCrab && (
          <GlassPanel className="mb-4 px-3 py-3">
            <div data-testid="breeding-element-preview">
              <div className="mb-2 text-[10px] uppercase tracking-wide text-white/50">
                Child Element Possibilities
              </div>
              <div className="space-y-2 text-xs text-white/75">
                {elementPreview.recipe && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span>
                      Combination recipe ({Math.round(COMBINE_CHANCE * 100)}%
                      chance):
                    </span>
                    <ElementBadge element={elementPreview.recipe} />
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-1.5">
                  <span>Inheritance / base components:</span>
                  {elementPreview.inherit.map((el) => (
                    <ElementBadge key={el} element={el} />
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span>
                    Rare special mutation (
                    {Math.round(elementPreview.mutationChance * 100)}%):
                  </span>
                  {elementPreview.mutationPool.map((el) => (
                    <ElementBadge key={el} element={el} />
                  ))}
                </div>
              </div>
            </div>
          </GlassPanel>
        )}

        {/* Breed button */}
        <div className="mb-4 flex justify-center">
          <GlowButton
            variant="gold"
            size="lg"
            disabled={!canBreed}
            onClick={handleBreed}
          >
            🌊 Breed! <GoldIcon size={14} /> {BREED_COST}
          </GlowButton>
        </div>

        {/* Roster */}
        <GlassPanel className="px-3 py-3">
          <div className="mb-2 text-[10px] uppercase tracking-wide text-white/50">
            Roster ({crabs.length})
          </div>
          {crabs.length === 0 ? (
            <div className="py-4 text-center text-xs text-white/40">
              You have no crabs. Explore the wilderness to find some!
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
              {crabs.map((crab) => {
                const selectedA = slots.A?.id === crab.id;
                const selectedB = slots.B?.id === crab.id;
                const selected = selectedA || selectedB;
                const spent = crab.breedCount >= CONFIG.maxBreedCount;
                return (
                  <button
                    key={crab.id}
                    onClick={() => assignCrab(crab)}
                    disabled={inAnimation || (spent && !selected)}
                    className="relative flex flex-col items-center rounded-xl p-1.5 transition-all"
                    style={{
                      background: selected
                        ? "rgba(124,245,225,0.15)"
                        : "rgba(10,27,61,0.5)",
                      border: `1px solid ${
                        selected
                          ? "#7CF5E1"
                          : spent
                          ? "rgba(255,77,109,0.3)"
                          : "rgba(124,245,225,0.15)"
                      }`,
                      opacity: spent && !selected ? 0.5 : 1,
                    }}
                  >
                    <CrabSprite crab={crab} size={56} animated={false} />
                    <div className="mt-0.5 w-full truncate text-center text-[9px] font-bold">
                      {crab.name}
                    </div>
                    <div className="text-[8px] text-white/50">
                      Lv{crab.level}
                    </div>
                    {selected && (
                      <div className="absolute -right-1 -top-1 rounded-full bg-[#7CF5E1] px-1 text-[8px] font-bold text-[#0A1B3D]">
                        {selectedA ? "A" : "B"}
                      </div>
                    )}
                    {spent && (
                      <div className="absolute inset-0 flex items-center justify-center rounded-xl">
                        <span className="text-[8px] font-bold text-[#FF4D6D]">
                          SPENT
                        </span>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </GlassPanel>
      </div>

      {/* Breeding animation overlay */}
      <AnimatePresence>
        {inAnimation && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: "rgba(6,18,43,0.9)" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="relative flex h-80 w-full max-w-md flex-col items-center justify-center">
              {phase.stage === "merge" && slots.A && slots.B && (
                <>
                  <motion.div
                    className="absolute left-[15%] top-1/2"
                    initial={{ x: 0, y: "-50%" }}
                    animate={{ x: 80, y: "-50%" }}
                    transition={{ duration: 0.6, ease: "easeInOut" }}
                  >
                    <CrabSprite crab={slots.A} size={96} animated />
                  </motion.div>
                  <motion.div
                    className="absolute right-[15%] top-1/2"
                    initial={{ x: 0, y: "-50%" }}
                    animate={{ x: -80, y: "-50%" }}
                    transition={{ duration: 0.6, ease: "easeInOut" }}
                  >
                    <CrabSprite crab={slots.B} size={96} animated />
                  </motion.div>
                </>
              )}

              {phase.stage === "egg" && (
                <motion.div
                  className="text-7xl"
                  initial={{ scale: 0 }}
                  animate={{ scale: [0, 1.3, 1] }}
                  transition={{ duration: 0.5 }}
                >
                  🥚
                </motion.div>
              )}

              {phase.stage === "hatch" && (
                <>
                  <motion.div
                    className="absolute text-7xl"
                    initial={{ scale: 1, rotate: 0 }}
                    animate={{
                      scale: [1, 1.2, 1.4, 0],
                      rotate: [0, -8, 8, -12, 12, 0],
                    }}
                    transition={{ duration: 0.5 }}
                  >
                    🥚
                  </motion.div>
                  {/* Burst particles */}
                  {[0, 1, 2, 3, 4, 5].map((i) => {
                    const angle = (i / 6) * Math.PI * 2;
                    return (
                      <motion.div
                        key={`burst-${i}`}
                        className="absolute rounded-full"
                        style={{
                          width: 10,
                          height: 10,
                          background: "#FFD166",
                          boxShadow: "0 0 10px #FFD166",
                        }}
                        initial={{ x: 0, y: 0, opacity: 1 }}
                        animate={{
                          x: Math.cos(angle) * 90,
                          y: Math.sin(angle) * 90,
                          opacity: 0,
                          scale: 0,
                        }}
                        transition={{ duration: 0.5 }}
                      />
                    );
                  })}
                  {phase.newCrab && (
                    <motion.div
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: [0, 1.2, 1], opacity: [0, 1, 1] }}
                      transition={{ duration: 0.4, delay: 0.1 }}
                    >
                      <CrabSprite crab={phase.newCrab} size={120} animated />
                    </motion.div>
                  )}
                </>
              )}

              {phase.stage === "done" && phase.newCrab && (
                <motion.div
                  className="flex flex-col items-center"
                  initial={{ scale: 0.5, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ duration: 0.4 }}
                >
                  <CrabSprite crab={phase.newCrab} size={140} animated />
                  <div className="mt-2 text-sm font-bold">
                    {phase.newCrab.name}
                  </div>
                  <div className="text-[11px] text-white/60">
                    Gen {phase.newCrab.generation} · Lv {phase.newCrab.level}
                  </div>
                  <div className="mt-1.5" data-testid="breeding-result-element">
                    <ElementBadge crab={phase.newCrab} size="md" />
                  </div>
                  <GlowButton
                    variant="teal"
                    size="md"
                    className="mt-4"
                    onClick={closeAnimation}
                  >
                    Welcome!
                  </GlowButton>
                </motion.div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
