// Crabtopia - Nursery screen (breeding & eggs)
"use client";

import { useState } from "react";
import { Heart } from "lucide-react";
import { useGame } from "../../store/gameStore";
import { FACTIONS } from "../../content/factions";
import { CLASSES } from "../../content/classes";
import { crabBaseBP, formatBP } from "../../engine/bp";
import {
  formatTime,
  GoldIcon,
  GlowButton,
  GlassPanel,
  CountdownRing,
  FactionBadge,
  EmptyState,
  SectionTitle,
  BreedDots,
} from "../ui";
import { CONFIG } from "../../engine/config";
import { checkBreedingEligibility, breedCost, computeGeneOdds } from "../../engine/genetics";
import { Crab, BodyPartSlot } from "../../types";
import CrabRenderer from "../CrabRenderer";
import CrabCard from "../CrabCard";
import ElementBadge from "../ElementBadge";
import { Modal } from "./MapScreen";
import { BODY_PART_SLOTS, getGeneVariant, RARITY_COLORS } from "../../content/bodyparts";
import { BREEDS } from "../../content/breeds";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const SLOT_LABELS: Record<BodyPartSlot, string> = {
  eyes: "Eyes",
  mouth: "Mouth",
  shell: "Shell",
  claws: "Claws",
  crest: "Crest",
  legs: "Legs",
};

// True if `a` cannot be paired with `b` due to parent/sibling/identity rules.
function isRelatedTo(a: Crab, b: Crab | undefined): boolean {
  if (!b) return false;
  if (a.id === b.id) return true;
  if (b.parentIds.includes(a.id)) return true;
  if (a.parentIds.includes(b.id)) return true;
  if (
    a.parentIds.length > 0 &&
    b.parentIds.length > 0 &&
    a.parentIds.some((p) => b.parentIds.includes(p))
  ) {
    return true;
  }
  return false;
}

function eligiblePickerCrabs(pool: Crab[], other: Crab | undefined): Crab[] {
  return pool.filter((c) => {
    if (c.activity !== "idle") return false;
    if (c.isRookie) return false;
    if (c.breedCount >= CONFIG.maxBreedCount) return false;
    if (isRelatedTo(c, other)) return false;
    return true;
  });
}

export default function NurseryScreen() {
  const player = useGame((s) => s.player)!;
  const breed = useGame((s) => s.breed);
  const hatchEggNow = useGame((s) => s.hatchEggNow);
  const listEggInBazaar = useGame((s) => s.listEggInBazaar);
  const setScreen = useGame((s) => s.setScreen);

  const [parentA, setParentA] = useState<string | null>(null);
  const [parentB, setParentB] = useState<string | null>(null);
  const [pickerAOpen, setPickerAOpen] = useState(false);
  const [pickerBOpen, setPickerBOpen] = useState(false);
  const [showOdds, setShowOdds] = useState(false);
  const [sellEggId, setSellEggId] = useState<string | null>(null);
  const [sellPrice, setSellPrice] = useState(5000);

  const crabA = player.crabs.find((c) => c.id === parentA);
  const crabB = player.crabs.find((c) => c.id === parentB);
  const elig = crabA && crabB
    ? checkBreedingEligibility(crabA, crabB)
    : { eligible: false, reasons: ["Select two crabs."] };
  const cost = crabA && crabB ? breedCost(crabA, crabB) : 0;

  const readyEggs = player.eggs.filter((e) => Date.now() >= e.hatchTime);
  const incubatingEggs = player.eggs.filter((e) => Date.now() < e.hatchTime);
  const recentHatchlings = player.crabs
    .filter((c) => !c.isRookie && Date.now() - c.birthTime < 60 * 60 * 1000)
    .sort((a, b) => b.birthTime - a.birthTime)
    .slice(0, 5);

  const eligibleA = eligiblePickerCrabs(player.crabs, crabB);
  const eligibleB = eligiblePickerCrabs(player.crabs, crabA);

  const handleBreed = () => {
    if (!crabA || !crabB) return;
    breed(crabA.id, crabB.id);
    setParentA(null);
    setParentB(null);
    setShowOdds(false);
  };

  // CTA disabled state + tooltip reason
  let ctaDisabled = true;
  let ctaTitle: string | undefined = "Need two eligible parents";
  if (crabA && crabB) {
    if (crabA.breedCount >= CONFIG.maxBreedCount || crabB.breedCount >= CONFIG.maxBreedCount) {
      ctaDisabled = true;
      ctaTitle = "Already at breed cap";
    } else if (!elig.eligible) {
      ctaDisabled = true;
      ctaTitle = elig.reasons[0] || "Not eligible";
    } else if (player.gold < cost) {
      ctaDisabled = true;
      ctaTitle = "Not enough GOLD";
    } else {
      ctaDisabled = false;
      ctaTitle = undefined;
    }
  }

  const discoveredCount = player.discoveredBreeds.length;
  const totalBreeds = BREEDS.length;

  return (
    <div className="space-y-4 max-w-5xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-xl md:text-2xl font-bold font-display">Nursery</h1>
        <p className="text-xs opacity-70">
          Breed two crabs · Eggs hatch in {Math.round(CONFIG.eggHatchMs / 60000)} min (demo)
        </p>
      </div>

      {/* Breeding section */}
      <GlassPanel glow="rgba(255,111,145,0.18)" className="p-4">
        <SectionTitle icon={<span>💕</span>} title="Breeding Pair" />
        <div className="grid grid-cols-[1fr_auto_1fr] gap-3 items-stretch">
          {/* Parent A */}
          <ParentSlot
            label="Parent A"
            color="#FF6F91"
            crab={crabA}
            eligibleCrabs={eligibleA}
            open={pickerAOpen}
            onOpenChange={setPickerAOpen}
            onPick={(id) => {
              setParentA(id);
              setPickerAOpen(false);
            }}
            onClear={() => setParentA(null)}
          />

          {/* Heart / cost / breed CTA */}
          <div className="flex flex-col items-center justify-center gap-2 min-w-[150px] py-2 text-center">
            <Heart
              size={28}
              fill="#FF6F91"
              stroke="#FF6F91"
              strokeWidth={0}
              className="animate-bob"
              aria-hidden
            />
            {crabA && crabB ? (
              <div className="text-[10px] opacity-80 flex items-center justify-center gap-0.5" style={{ color: "#FFD166" }}>
                <GoldIcon size={11} /> {cost}
              </div>
            ) : (
              <div className="text-[10px] opacity-50 max-w-[140px]">
                Tap a slot to pick a parent.
              </div>
            )}
            <GlowButton
              variant="gold"
              size="md"
              disabled={ctaDisabled}
              title={ctaTitle}
              onClick={handleBreed}
            >
              Breed ❤ ({cost || 0} GOLD)
            </GlowButton>
            {crabA && crabB && elig.eligible && (
              <GlowButton variant="ghost" size="sm" onClick={() => setShowOdds(true)}>
                Full odds
              </GlowButton>
            )}
          </div>

          {/* Parent B */}
          <ParentSlot
            label="Parent B"
            color="#FF6F91"
            crab={crabB}
            eligibleCrabs={eligibleB}
            open={pickerBOpen}
            onOpenChange={setPickerBOpen}
            onPick={(id) => {
              setParentB(id);
              setPickerBOpen(false);
            }}
            onClear={() => setParentB(null)}
          />
        </div>
      </GlassPanel>

      {/* Gene odds preview (inline once both parents picked) */}
      {crabA && crabB && <GeneOddsPreview crabA={crabA} crabB={crabB} />}

      {/* Eggs section */}
      <section>
        <SectionTitle icon={<span>🥚</span>} title={`Eggs (${player.eggs.length})`} />
        {player.eggs.length === 0 ? (
          <EmptyState
            message="No eggs incubating"
            hint="Breed two crabs to start!"
          />
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {[...readyEggs, ...incubatingEggs].map((egg) => {
              const isReady = Date.now() >= egg.hatchTime;
              const remaining = Math.max(0, egg.hatchTime - Date.now());
              const total = CONFIG.eggHatchMs;
              const progress = 1 - remaining / total;
              const faction = FACTIONS[egg.faction];
              const classDef = CLASSES[egg.classId];
              return (
                <div
                  key={egg.id}
                  className="rounded-xl p-2 text-center"
                  style={{
                    background: `linear-gradient(135deg, ${faction.colors.dark}cc, ${faction.colors.primary}22)`,
                    border: `1px solid ${faction.colors.primary}44`,
                  }}
                >
                  <div className="flex justify-center mb-1">
                    <img
                      src="/art/crabs/egg-glowing.png"
                      alt=""
                      width={48}
                      height={48}
                      draggable={false}
                      className="object-contain egg-rock"
                      style={{
                        filter: isReady
                          ? "drop-shadow(0 0 10px rgba(255,209,102,0.85))"
                          : "saturate(0.55) brightness(0.8)",
                        animation: isReady ? "glowPulse 1.8s ease-in-out infinite" : undefined,
                      }}
                    />
                  </div>
                  <div className="font-bold text-xs truncate font-display">{egg.name}</div>
                  <div className="text-[10px] opacity-70 flex items-center justify-center gap-1">
                    <FactionBadge faction={egg.faction} size={12} />
                    {classDef.icon}
                  </div>
                  {egg.element && (
                    <div className="mt-0.5 flex justify-center">
                      <ElementBadge element={egg.element} />
                    </div>
                  )}
                  {egg.isLegendaryCandidate && (
                    <div className="text-[9px] mt-0.5 px-1 rounded inline-block" style={{ background: "#FFD166", color: "#000" }}>
                      ★ Legendary candidate
                    </div>
                  )}
                  {isReady ? (
                    <>
                      <div className="text-[10px] mt-1" style={{ color: "#FFD166" }}>Ready!</div>
                      <GlowButton variant="gold" size="sm" className="w-full mt-1" onClick={() => hatchEggNow(egg.id)}>
                        Hatch Now
                      </GlowButton>
                      <GlowButton variant="ghost" size="sm" className="w-full mt-1" onClick={() => { setSellEggId(egg.id); setSellPrice(5000); }}>
                        Sell in Bazaar
                      </GlowButton>
                    </>
                  ) : (
                    <div className="flex justify-center mt-1">
                      <CountdownRing
                        progress={progress}
                        size={42}
                        color={faction.colors.accent}
                        label={<span style={{ color: faction.colors.accent }}>{formatTime(remaining).split(" ")[0]}</span>}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Recent hatchlings */}
      {recentHatchlings.length > 0 && (
        <section>
          <SectionTitle icon={<span>🐣</span>} title="Recent Hatchlings" />
          <div className="grid grid-cols-3 gap-2">
            {recentHatchlings.map((c) => (
              <CrabCard key={c.id} crab={c} compact size={88} />
            ))}
          </div>
        </section>
      )}

      {/* Codex / Collection teaser */}
      <GlassPanel className="p-4 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-2xl shrink-0">📖</span>
          <div className="min-w-0">
            <div className="font-bold text-sm font-display">Codex / Collection</div>
            <div className="text-xs opacity-70">
              Discovered:{" "}
              <span className="font-bold" style={{ color: "#FFD166" }}>{discoveredCount}</span>
              {" / "}
              {totalBreeds} breeds
            </div>
          </div>
        </div>
        <GlowButton variant="teal" size="md" onClick={() => setScreen("codex")}>
          Open Codex →
        </GlowButton>
      </GlassPanel>

      {/* Gene odds modal (full breakdown) */}
      {showOdds && crabA && crabB && (
        <GeneOddsModal
          crabA={crabA}
          crabB={crabB}
          cost={cost}
          canAfford={player.gold >= cost}
          onConfirm={handleBreed}
          onClose={() => setShowOdds(false)}
        />
      )}

      {/* Sell egg modal */}
      {sellEggId && (
        <Modal title="List Egg for Sale" onClose={() => setSellEggId(null)}>
          <div className="space-y-3">
            <div className="text-xs opacity-70">Set a sale price (GOLD). Bazaar fee: {CONFIG.bazaarFeePercent * 100}%.</div>
            <input
              type="number"
              value={sellPrice}
              onChange={(e) => setSellPrice(Math.max(1, parseInt(e.target.value) || 0))}
              className="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white focus:outline-none focus:border-[#7CF5E1]"
              autoFocus
            />
            <div className="text-[10px] opacity-60">
              You receive: {Math.round(sellPrice * (1 - CONFIG.bazaarFeePercent))} · Fee: {Math.round(sellPrice * CONFIG.bazaarFeePercent)}
            </div>
            <GlowButton
              variant="gold"
              size="md"
              className="w-full"
              onClick={() => {
                listEggInBazaar(sellEggId, sellPrice);
                setSellEggId(null);
              }}
            >
              List for {sellPrice} GOLD
            </GlowButton>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ---------------- Parent slot with Radix Popover picker ----------------

function ParentSlot({
  label,
  color,
  crab,
  eligibleCrabs,
  open,
  onOpenChange,
  onPick,
  onClear,
}: {
  label: string;
  color: string;
  crab?: Crab;
  eligibleCrabs: Crab[];
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onPick: (id: string) => void;
  onClear: () => void;
}) {
  if (crab) {
    return (
      <div className="relative w-full max-w-[220px] mx-auto" style={{ minHeight: 180 }}>
        <div className="rounded-xl overflow-hidden">
          <CrabCard crab={crab} compact size={96} />
        </div>
        <button
          onClick={onClear}
          className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-rose-600 text-white text-xs flex items-center justify-center z-20 hover:bg-rose-500 transition-colors"
          aria-label={`Remove ${label}`}
        >
          ✕
        </button>
      </div>
    );
  }

  return (
    <div className="w-full" style={{ minHeight: 180 }}>
      <Popover open={open} onOpenChange={onOpenChange}>
        <PopoverTrigger asChild>
          <button
            className="w-full rounded-xl border-2 border-dashed flex flex-col items-center justify-center text-white/45 hover:text-white hover:border-white/45 transition-colors p-3 gap-2"
            style={{ borderColor: color + "55", minHeight: 180 }}
            aria-label={`Pick ${label}`}
          >
            <span
              className="w-16 h-16 rounded-full border-2 border-dashed flex items-center justify-center text-3xl font-light"
              style={{ borderColor: color + "99" }}
            >
              +
            </span>
            <span className="text-[11px] font-bold opacity-90">{label}</span>
            <span className="text-[9px] opacity-55">Tap to pick</span>
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="center"
          sideOffset={6}
          className="w-80 max-w-[92vw] p-0 border-white/15"
          style={{ background: "rgba(10,27,61,0.97)", color: "#EAF6FF" }}
        >
          <div className="px-3 pt-3 pb-2 border-b border-white/10">
            <div className="text-xs font-bold" style={{ color: "#FFD166" }}>
              Pick {label}
            </div>
            <div className="text-[10px] opacity-70 mt-0.5">
              Idle, non-Rookie, breed count &lt; 5, not related to the other parent.
            </div>
          </div>
          <div className="max-h-[280px] overflow-y-auto p-1.5 space-y-0.5">
            {eligibleCrabs.length === 0 ? (
              <div className="text-xs opacity-60 py-4 text-center">
                No eligible crabs. Lower other parent&apos;s cooldown or graduate a rookie.
              </div>
            ) : (
              eligibleCrabs.map((c) => {
                const f = FACTIONS[c.faction];
                return (
                  <button
                    key={c.id}
                    onClick={() => onPick(c.id)}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-white/10 transition-colors text-left"
                  >
                    <div
                      className="shrink-0 rounded-md overflow-hidden"
                      style={{ background: `${f.colors.dark}55`, border: `1px solid ${f.colors.primary}44` }}
                    >
                      <CrabRenderer crab={c} size={44} animate={false} showEmblem={false} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-bold truncate" style={{ color: f.colors.light }}>
                        {c.name}
                      </div>
                      <div className="text-[10px] opacity-70 truncate">
                        {CLASSES[c.classId].icon} {CLASSES[c.classId].name}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span className="text-[10px] font-bold flex items-center gap-0.5" style={{ color: "#FFD166" }}>
                        <GoldIcon size={10} /> {formatBP(crabBaseBP(c))}
                      </span>
                      <BreedDots count={c.breedCount} max={5} />
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

// ---------------- Gene odds preview (compact inline) ----------------

function GeneOddsPreview({ crabA, crabB }: { crabA: Crab; crabB: Crab }) {
  const odds = computeGeneOdds(crabA, crabB);
  return (
    <GlassPanel className="p-4">
      <SectionTitle
        icon={<span>🧬</span>}
        title="Gene Odds Preview"
        action={
          <span className="text-[10px] opacity-60">
            Per body part · inheritance odds
          </span>
        }
      />
      <div className="space-y-1.5">
        {odds.map((o) => {
          const slot = o.slot as BodyPartSlot;
          const aD = crabA.genes[slot].D;
          const bD = crabB.genes[slot].D;
          const va = getGeneVariant(slot, aD);
          const vb = getGeneVariant(slot, bD);
          const aChance = o.odds.find((g) => g.geneId === aD)?.chance ?? 0;
          const bChance = o.odds.find((g) => g.geneId === bD)?.chance ?? 0;
          const mutChance = o.mutationChance;
          const sameD = aD === bD;
          const mergedPct = ((aChance + bChance) * 100).toFixed(0);
          const aPct = (aChance * 100).toFixed(0);
          const bPct = (bChance * 100).toFixed(0);
          const mutPct = (mutChance * 100).toFixed(0);
          return (
            <div
              key={slot}
              className="grid grid-cols-[56px_1fr_1fr_auto] items-center gap-2 text-[11px] px-2 py-1.5 rounded-lg"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(124,245,225,0.10)" }}
            >
              <div className="font-bold" style={{ color: "#7CF5E1" }}>
                {SLOT_LABELS[slot]}
              </div>
              <div className="min-w-0">
                <div className="text-[9px] uppercase tracking-wide opacity-55">Parent A</div>
                <div className="truncate flex items-center gap-1">
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ background: va ? RARITY_COLORS[va.rarity] : "#888" }}
                  />
                  <span className="truncate">{va?.label ?? aD}</span>
                </div>
              </div>
              <div className="min-w-0">
                <div className="text-[9px] uppercase tracking-wide opacity-55">Parent B</div>
                <div className="truncate flex items-center gap-1">
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ background: vb ? RARITY_COLORS[vb.rarity] : "#888" }}
                  />
                  <span className="truncate">{vb?.label ?? bD}</span>
                </div>
              </div>
              <div className="text-right shrink-0">
                {sameD ? (
                  <div className="font-bold" style={{ color: "#FFD166" }}>{mergedPct}%</div>
                ) : (
                  <div className="font-bold opacity-90">
                    <span style={{ color: "#FF6F91" }}>{aPct}%</span>
                    {" · "}
                    <span style={{ color: "#7CF5E1" }}>{bPct}%</span>
                  </div>
                )}
                <div className="text-[9px] opacity-55">+ {mutPct}% mut</div>
              </div>
            </div>
          );
        })}
        <div className="text-[10px] opacity-70 pt-1 px-2 flex items-center gap-1">
          <span style={{ color: "#FFD166" }}>★</span>
          Legendary chance: {(CONFIG.legendaryPartChance * 100).toFixed(2)}% per part
        </div>
      </div>
    </GlassPanel>
  );
}

// ---------------- Gene odds modal (full breakdown) ----------------

function GeneOddsModal({
  crabA,
  crabB,
  cost,
  canAfford,
  onConfirm,
  onClose,
}: {
  crabA: Crab;
  crabB: Crab;
  cost: number;
  canAfford: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const odds = computeGeneOdds(crabA, crabB);
  return (
    <Modal title="Gene Odds (transparent)" onClose={onClose} maxWidth="max-w-lg">
      <div className="space-y-3 text-xs">
        <div className="opacity-70">
          The child inherits each gene slot from either parent with documented weights:
          Dominant 60%, Recessive 1: 25%, Recessive 2: 15%. Legendary chance: 0.07% per part. Mutation: 1%.
        </div>
        {odds.map((o) => {
          const slot = o.slot as BodyPartSlot;
          return (
            <div key={slot} className="bg-white/5 rounded-lg p-2">
              <div className="font-bold mb-1" style={{ color: "#7CF5E1" }}>
                {SLOT_LABELS[slot]}
              </div>
              <div className="space-y-0.5">
                {o.odds.slice(0, 4).map((g) => {
                  const v = getGeneVariant(slot, g.geneId);
                  const color = v ? RARITY_COLORS[v.rarity] : "#888";
                  return (
                    <div key={g.geneId} className="flex items-center justify-between">
                      <span className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full" style={{ background: color }} />
                        {g.label}
                      </span>
                      <span className="opacity-70">{(g.chance * 100).toFixed(1)}%</span>
                    </div>
                  );
                })}
              </div>
              <div className="text-[10px] opacity-60 mt-1">
                ★ Legendary: {(o.legendaryChance * 100).toFixed(2)}% · Mutation: {(o.mutationChance * 100).toFixed(0)}%
              </div>
            </div>
          );
        })}
        <GlowButton
          variant="rose"
          size="md"
          className="w-full"
          disabled={!canAfford}
          onClick={onConfirm}
          title={!canAfford ? "Not enough GOLD" : undefined}
        >
          Confirmed — Breed for {cost} GOLD
        </GlowButton>
      </div>
    </Modal>
  );
}
