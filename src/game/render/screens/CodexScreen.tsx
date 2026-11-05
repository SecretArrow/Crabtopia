// Crabtopia - Codex screen (collection, factions, classes, breeds, economy)
"use client";

import { useMemo, useState } from "react";
import { useGame } from "../../store/gameStore";
import { FACTIONS, FACTION_LIST } from "../../content/factions";
import { CLASSES, CLASS_LIST } from "../../content/classes";
import { BREEDS, BREEDS_BY_CLASS, type BreedDef } from "../../content/breeds";
import { QUESTS } from "../../engine/config";
import {
  BreedDots,
  EmptyState,
  GlassPanel,
  GradientCard,
  GlowButton,
  GoldIcon,
  SectionTitle,
  formatGold,
  FACTION_EMBLEM_ART,
} from "../ui";
import { ClassArtImage } from "../CrabArtImage";
import ElementBadge from "../ElementBadge";
import {
  COMBINATION_RECIPES,
  ELEMENTS,
  ELEMENT_LIST,
} from "../../engine/elements";
import { CLASS_HOME_FACTION } from "../../animation/sheetResolver";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { ClassId, FactionId, PlayerProfile } from "../../types";

type Tab = "crabs" | "breeds" | "achievements" | "economy";
type BreedFilter = "all" | "owned" | "undiscovered";

// Class -> representative faction (inferred from starter art asset naming).
// Used only for the "Discover More" hint and per-faction breed totals.
const CLASS_FACTION_HINT: Record<ClassId, FactionId> = {
  bulwark: "coral_court",
  reaver: "cinderreef",
  skitter: "stormwake",
  tidecaller: "moonpool",
  shellmender: "mangrove",
  pincher: "coral_court",
  warden: "frostshelf",
  gildclaw: "cinderreef",
};

// Reverse mapping: faction -> classes whose breeds count toward that faction.
const FACTION_CLASSES: Record<FactionId, ClassId[]> = (() => {
  const map = {} as Record<FactionId, ClassId[]>;
  (Object.keys(CLASS_FACTION_HINT) as ClassId[]).forEach((cid) => {
    const fid = CLASS_FACTION_HINT[cid];
    (map[fid] ??= []).push(cid);
  });
  return map;
})();

export default function CodexScreen() {
  const player = useGame((s) => s.player)!;
  const hallListingsCount = useGame((s) => s.hallListings).length;
  const bazaarListingsCount = useGame((s) => s.bazaarListings).length;
  const worldSites = useGame((s) => s.worldSites);
  const setScreen = useGame((s) => s.setScreen);
  const [tab, setTab] = useState<Tab>("crabs");
  const [selectedFaction, setSelectedFaction] = useState<FactionId | null>(null);
  const [selectedClass, setSelectedClass] = useState<ClassId | null>(null);
  const [breedFilter, setBreedFilter] = useState<BreedFilter>("all");

  const avgDigReward = worldSites.length
    ? Math.round(worldSites.reduce((s, x) => s + x.baseReward, 0) / worldSites.length)
    : 0;

  // ---- Codex breed state (memoized) ----
  const discoveredSet = useMemo(
    () => new Set(player.discoveredBreeds),
    [player.discoveredBreeds]
  );
  const ownedBreedIds = useMemo(
    () => new Set(player.crabs.map((c) => c.breedId)),
    [player.crabs]
  );

  // Counts for the legend bar.
  const breedCounts = useMemo(() => {
    let owned = 0;
    let discoveredOnly = 0;
    let undiscovered = 0;
    for (const b of BREEDS) {
      const isOwned = ownedBreedIds.has(b.id);
      const isDiscovered = discoveredSet.has(b.id);
      if (isOwned) owned += 1;
      else if (isDiscovered) discoveredOnly += 1;
      else undiscovered += 1;
    }
    return { owned, discoveredOnly, undiscovered };
  }, [discoveredSet, ownedBreedIds]);

  // Rarest undiscovered breed: highest absolute stat-mod sum (most extreme).
  const rarestUndiscovered = useMemo(() => {
    const candidates = BREEDS.filter((b) => !discoveredSet.has(b.id));
    if (!candidates.length) return null;
    let best = candidates[0];
    let bestScore = -1;
    for (const b of candidates) {
      const score =
        Math.abs(b.statMod.hp) +
        Math.abs(b.statMod.attack) +
        Math.abs(b.statMod.defense) +
        Math.abs(b.statMod.speed) +
        Math.abs(b.statMod.skill);
      if (score > bestScore) {
        bestScore = score;
        best = b;
      }
    }
    return best;
  }, [discoveredSet]);

  return (
    <div className="space-y-3 max-w-5xl mx-auto">
      {/* Header + breadcrumb back nav */}
      <SectionTitle
        title="Codex"
        icon={<span>📖</span>}
        action={
          <button
            onClick={() => setScreen("home")}
            className="text-xs opacity-70 hover:opacity-100 transition-opacity flex items-center gap-1 px-2.5 py-1 rounded-lg"
            style={{
              border: "1px solid rgba(124,245,225,0.18)",
              background: "rgba(255,255,255,0.04)",
            }}
            aria-label="Back to Home"
          >
            <span aria-hidden>←</span> Back to Home
          </button>
        }
      />
      <p className="text-xs opacity-70 -mt-1">
        Crabs · Breeds · Achievements · Economy Health
      </p>

      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto no-scrollbar p-1 rounded-xl" style={{
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(124,245,225,0.14)",
      }}>
        {([
          { id: "crabs", label: "🦀 Crabs (8)" },
          { id: "breeds", label: "🧬 Breeds (64)" },
          { id: "achievements", label: "🏆 Achievements" },
          { id: "economy", label: "📊 Economy Health" },
        ] as { id: Tab; label: string }[]).map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-3 py-1.5 rounded-lg text-xs whitespace-nowrap font-bold transition-all ${active ? "text-white" : "text-white/60 hover:text-white"}`}
              style={{
                background: active ? "linear-gradient(135deg, #12A7A0, #0A4A66)" : "transparent",
                boxShadow: active ? "0 0 12px rgba(18,167,160,0.4)" : undefined,
              }}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {/* CRABS TAB */}
      {tab === "crabs" && (
        <div className="space-y-3">
          <SectionTitle title={`Crab Classes (${CLASS_LIST.length})`} icon={<span>🦀</span>} />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {CLASS_LIST.map((c) => {
              const owned = player.crabs.some((pc) => pc.classId === c.id);
              const active = selectedClass === c.id;
              return (
                <GradientCard
                  key={c.id}
                  onClick={() => setSelectedClass(active ? null : c.id)}
                  selected={active}
                  className="p-3"
                >
                  <div className="flex flex-col items-center">
                    {/* Unified image frame: rounded-xl, overflow-hidden, aspect-[4/3] */}
                    <div
                      className="relative rounded-xl overflow-hidden aspect-[4/3] w-full bg-black/30 flex items-center justify-center mb-1"
                      style={{ filter: owned ? undefined : "grayscale(1) brightness(0.5)" }}
                    >
                      <ClassArtImage
                        classId={c.id}
                        faction={CLASS_HOME_FACTION[c.id]}
                        size={120}
                      />
                      {!owned && (
                        <div className="absolute inset-0 flex items-center justify-center text-2xl">
                          🔒
                        </div>
                      )}
                    </div>
                    <div className="font-bold text-sm font-display">{c.name}</div>
                    <div className="text-[10px] opacity-70">{c.role}</div>
                    <div className="text-[10px] mt-1">
                      HP {c.baseStats.hp} · ATK {c.baseStats.attack}
                    </div>
                    {owned && (
                      <div className="text-[9px] mt-1 px-1.5 py-0.5 rounded" style={{ background: "#4FB47733", color: "#4FB477" }}>
                        Owned
                      </div>
                    )}
                  </div>
                </GradientCard>
              );
            })}
          </div>

          {selectedClass && (
            <GlassPanel className="p-4">
              {(() => {
                const c = CLASSES[selectedClass];
                return (
                  <div>
                    <div className="text-lg font-bold font-display flex items-center gap-2">
                      {c.icon} {c.name}
                    </div>
                    <div className="text-xs opacity-70 mb-2">{c.role} · Best position: {c.positioning}</div>
                    <div className="text-sm opacity-90 mb-3">{c.description}</div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="bg-black/30 rounded-lg p-2">
                        <div className="opacity-60 text-[10px] uppercase">Active Skill</div>
                        <div className="font-bold">{c.activeSkill.name}</div>
                        <div className="text-[10px] opacity-70">{c.activeSkill.energyCost} energy · CD {c.activeSkill.cooldown}</div>
                        <div className="text-[10px] mt-1">{c.activeSkill.description}</div>
                      </div>
                      <div className="bg-black/30 rounded-lg p-2">
                        <div className="opacity-60 text-[10px] uppercase">Passive</div>
                        <div className="font-bold">{c.passive.name}</div>
                        <div className="text-[10px] mt-1">{c.passive.description}</div>
                      </div>
                    </div>
                    <div className="mt-2 grid grid-cols-5 gap-1 text-center text-[10px]">
                      {(["hp", "attack", "defense", "speed", "skill"] as const).map((s) => (
                        <div key={s} className="bg-black/30 rounded p-1">
                          <div className="opacity-60 uppercase">{s}</div>
                          <div className="font-bold">{c.baseStats[s]}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </GlassPanel>
          )}

          {/* Faction summary - equal-sized square tiles */}
          <SectionTitle title="Factions (6)" icon={<span>🪸</span>} />
          <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
            {FACTION_LIST.map((f) => {
              const active = selectedFaction === f.id;
              // Breeds attributable to this faction (by class hint).
              const factionClasses = FACTION_CLASSES[f.id] ?? [];
              const totalForFaction = factionClasses.reduce(
                (n, cid) => n + (BREEDS_BY_CLASS[cid]?.length ?? 0),
                0
              );
              const discoveredForFaction = BREEDS.filter(
                (b) =>
                  factionClasses.includes(b.classId) &&
                  discoveredSet.has(b.id)
              ).length;
              return (
                <GradientCard
                  key={f.id}
                  faction={f.id}
                  onClick={() => setSelectedFaction(active ? null : f.id)}
                  selected={active}
                  className="p-2 aspect-square"
                >
                  <div className="flex flex-col items-center justify-center text-center gap-1 h-full">
                    <img
                      src={FACTION_EMBLEM_ART[f.id]}
                      alt={f.name}
                      width={28}
                      height={28}
                      draggable={false}
                      className="object-contain"
                    />
                    <div
                      className="font-bold text-[10px] font-display truncate w-full"
                      style={{ color: f.colors.accent }}
                    >
                      {f.shortName}
                    </div>
                    <div className="text-[9px] opacity-70 leading-tight">
                      {discoveredForFaction}/{totalForFaction} breeds
                    </div>
                  </div>
                </GradientCard>
              );
            })}
          </div>

          {selectedFaction && (
            <GlassPanel className="p-4">
              {(() => {
                const f = FACTIONS[selectedFaction];
                return (
                  <div>
                    <div className="text-lg font-bold font-display" style={{ color: f.colors.accent }}>{f.name}</div>
                    <div className="text-xs italic opacity-80 mb-2">"{f.motto}"</div>
                    <div className="text-sm opacity-90 mb-3">{f.lore}</div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="bg-black/30 rounded p-2">
                        <div className="opacity-60 text-[10px]">2 same faction</div>
                        <div>{f.bonus.twoSame}</div>
                      </div>
                      <div className="bg-black/30 rounded p-2">
                        <div className="opacity-60 text-[10px]">3 same faction</div>
                        <div>{f.bonus.threeSame}</div>
                      </div>
                    </div>
                    <div className="mt-2 text-[10px] opacity-70">
                      Wheel advantage: <span style={{ color: f.colors.accent }}>{f.name}</span> beats{" "}
                      <span style={{ color: FACTIONS[f.beats].colors.accent }}>{FACTIONS[f.beats].name}</span> (+8% BP)
                    </div>
                  </div>
                );
              })()}
            </GlassPanel>
          )}

          {/* Elements — the 18 ocean-kingdom natures (engine/elements.ts).
              Badges + battle math only; element art is never baked into
              crab portraits (layer-separation rule). */}
          <div data-testid="codex-elements">
            <SectionTitle title="Elemen (18)" icon={<span>🌊</span>} />
            <GlassPanel className="p-3">
              {(["basic", "combined", "special"] as const).map((cat) => (
                <div key={cat} className="mb-3 last:mb-0">
                  <div className="text-[10px] uppercase tracking-wide text-white/50 mb-1.5">
                    {cat === "basic"
                      ? "Elemen Dasar (5)"
                      : cat === "combined"
                        ? "Elemen Gabungan (7) — dari breeding dua elemen dasar"
                        : "Elemen Khusus (6) — hanya dari mutasi langka saat breeding"}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {ELEMENT_LIST.filter((e) => e.category === cat).map(
                      (e) => (
                        <span
                          key={e.id}
                          className="inline-flex items-center gap-1.5 text-[11px] text-white/80"
                        >
                          <ElementBadge element={e.id} />
                          {e.category === "combined" && e.components && (
                            <span className="text-white/50">
                              = {ELEMENTS[e.components[0]].name} +{" "}
                              {ELEMENTS[e.components[1]].name}
                            </span>
                          )}
                        </span>
                      ),
                    )}
                  </div>
                </div>
              ))}
              <div className="mt-2 border-t border-white/10 pt-2">
                <div className="text-[10px] uppercase tracking-wide text-white/50 mb-1.5">
                  Breeding Combination Table (7 recipes)
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-[11px] text-white/80">
                  {COMBINATION_RECIPES.map((r) => (
                    <div
                      key={r.result}
                      className="flex items-center gap-1.5 flex-wrap"
                    >
                      <ElementBadge element={r.components[0]} compact />
                      <span className="text-white/40">+</span>
                      <ElementBadge element={r.components[1]} compact />
                      <span className="text-white/40">→</span>
                      <ElementBadge element={r.result} />
                    </div>
                  ))}
                </div>
                <div className="mt-2 text-[10px] text-white/55 leading-relaxed">
                  Siklus kekuatan dasar: Vulkara mengalahkan Anila, Anila
                  mengalahkan Lintara, Lintara mengalahkan Bentala, Bentala
                  mengalahkan Nerala, Nerala mengalahkan Vulkara (damage
                  ×1,15 saat kuat, ×0,90 saat lemah). Pasangan beresep
                  berpeluang 40% menghasilkan elemen gabungan; elemen
                  khusus muncul sebagai mutasi langka (3%, atau 6% bila
                  induk berelemen gabungan/khusus).
                </div>
              </div>
            </GlassPanel>
          </div>

          {/* Discover More - fills the empty region below Factions.
              Surfaces the rarest undiscovered breed with a hint + Nursery CTA. */}
          {rarestUndiscovered && (
            <GlassPanel className="p-4" glow="rgba(255,209,102,0.18)">
              <SectionTitle
                title="Discover More"
                icon={<span>🔮</span>}
                action={
                  <span className="text-[10px] opacity-60">
                    {BREEDS.length - player.discoveredBreeds.length} left
                  </span>
                }
              />
              <div className="flex items-center gap-3">
                <div className="rounded-xl overflow-hidden aspect-[4/3] w-24 sm:w-28 bg-black/30 flex items-center justify-center shrink-0">
                  <span className="text-3xl opacity-70" aria-hidden>
                    ❓
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold font-display" style={{ color: "#FFD166" }}>
                    Rare Undiscovered Breed
                  </div>
                  {(() => {
                    const fc = CLASSES[rarestUndiscovered.classId];
                    const fid = CLASS_FACTION_HINT[rarestUndiscovered.classId];
                    const fname = FACTIONS[fid].name;
                    return (
                      <div className="text-xs opacity-80 mt-0.5">
                        Hint: Breed a{" "}
                        <span style={{ color: FACTIONS[fid].colors.accent }}>{fname}</span>{" "}
                        <span style={{ color: "#7CF5E1" }}>{fc.name}</span>{" "}
                        to discover this breed.
                      </div>
                    );
                  })()}
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <GlowButton size="sm" variant="teal" onClick={() => setScreen("nursery")}>
                      Open Nursery →
                    </GlowButton>
                    <span className="text-[10px] opacity-50">
                      Highest stat spread of remaining breeds.
                    </span>
                  </div>
                </div>
              </div>
            </GlassPanel>
          )}
        </div>
      )}

      {/* BREEDS TAB */}
      {tab === "breeds" && (
        <div className="space-y-3">
          {/* All 64 Breeds gallery — full filterable/sortable collection view */}
          <AllBreedsGallery
            player={player}
            discoveredSet={discoveredSet}
            ownedBreedIds={ownedBreedIds}
            setScreen={setScreen}
          />
          <SectionTitle
            title={`${BREEDS.length} Breed Types`}
            icon={<span>🧬</span>}
            action={
              <ToggleGroup
                type="single"
                value={breedFilter}
                onValueChange={(v) => {
                  if (v) setBreedFilter(v as BreedFilter);
                }}
                aria-label="Filter breeds"
                className="rounded-md overflow-hidden"
              >
                <ToggleGroupItem
                  value="all"
                  aria-label="Show all breeds"
                  className="h-7 px-2 text-[10px] border border-white/15 data-[state=on]:bg-[#12A7A0]/30 data-[state=on]:text-[#7CF5E1]"
                >
                  All
                </ToggleGroupItem>
                <ToggleGroupItem
                  value="owned"
                  aria-label="Show only owned breeds"
                  className="h-7 px-2 text-[10px] border border-white/15 border-l-0 data-[state=on]:bg-[#12A7A0]/30 data-[state=on]:text-[#7CF5E1]"
                >
                  Owned
                </ToggleGroupItem>
                <ToggleGroupItem
                  value="undiscovered"
                  aria-label="Show only undiscovered breeds"
                  className="h-7 px-2 text-[10px] border border-white/15 border-l-0 data-[state=on]:bg-[#12A7A0]/30 data-[state=on]:text-[#7CF5E1]"
                >
                  Undiscovered
                </ToggleGroupItem>
              </ToggleGroup>
            }
          />

          {/* Legend bar with live counts */}
          <div
            className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] px-3 py-1.5 rounded-lg"
            style={{
              background: "rgba(10,27,61,0.45)",
              border: "1px solid rgba(124,245,225,0.16)",
            }}
            aria-live="polite"
          >
            <span className="flex items-center gap-1">
              <span
                className="inline-block w-2 h-2 rounded-full"
                style={{ background: "#4FB477" }}
                aria-hidden
              />
              Owned ({breedCounts.owned})
            </span>
            <span className="opacity-40" aria-hidden>·</span>
            <span className="flex items-center gap-1">
              <span aria-hidden>🔓</span>
              Discovered ({breedCounts.discoveredOnly})
            </span>
            <span className="opacity-40" aria-hidden>·</span>
            <span className="flex items-center gap-1">
              <span aria-hidden>🔒</span>
              Undiscovered ({breedCounts.undiscovered})
            </span>
          </div>

          {CLASS_LIST.map((c) => {
            const breeds = BREEDS_BY_CLASS[c.id];
            const visibleBreeds = breeds.filter((b) => {
              if (breedFilter === "all") return true;
              const isOwned = ownedBreedIds.has(b.id);
              const isDiscovered = discoveredSet.has(b.id);
              if (breedFilter === "owned") return isOwned;
              if (breedFilter === "undiscovered") return !isDiscovered;
              return true;
            });
            // Skip class sections that have nothing to show under the filter.
            if (visibleBreeds.length === 0) return null;
            return (
              <div
                key={c.id}
                className="rounded-xl p-3"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(124,245,225,0.12)" }}
              >
                <div className="font-bold text-sm mb-2 font-display flex items-center gap-1">
                  <ClassArtImage classId={c.id} faction={CLASS_HOME_FACTION[c.id]} size={20} speed={0} />
                  {c.name} Breeds
                  <span className="ml-auto text-[10px] opacity-60 font-normal">
                    {visibleBreeds.length}/{breeds.length}
                  </span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {visibleBreeds.map((b) => {
                    const discovered = discoveredSet.has(b.id);
                    const isOwned = ownedBreedIds.has(b.id);
                    return (
                      <div
                        key={b.id}
                        className="rounded-lg p-2 border text-xs"
                        style={{
                          background: isOwned
                            ? "rgba(79,180,119,0.12)"
                            : discovered
                            ? "rgba(255,209,102,0.08)"
                            : "rgba(0,0,0,0.2)",
                          borderColor: isOwned
                            ? "rgba(79,180,119,0.45)"
                            : discovered
                            ? "rgba(255,209,102,0.35)"
                            : "rgba(255,255,255,0.05)",
                          opacity: discovered ? 1 : 0.65,
                        }}
                      >
                        <div className="flex items-center gap-1">
                          <span className="font-bold">{discovered ? b.name : "???"}</span>
                          {isOwned && <span style={{ color: "#4FB477" }}>✓</span>}
                          {!isOwned && discovered && <span style={{ color: "#FFD166" }}>🔓</span>}
                        </div>
                        <div className="text-[9px] opacity-70 mt-0.5">{discovered ? b.lore : "Undiscovered"}</div>
                        {discovered && (
                          <div className="text-[9px] opacity-60 mt-1">
                            HP {b.statMod.hp > 0 ? "+" : ""}{b.statMod.hp} · ATK {b.statMod.attack > 0 ? "+" : ""}{b.statMod.attack}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ACHIEVEMENTS TAB */}
      {tab === "achievements" && (
        <div className="space-y-3">
          <SectionTitle title="Shellwarden Progress" icon={<span>🏆</span>} />
          <GlassPanel className="p-4">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs">
              <Stat label="Level" value={player.shellwardenLevel.toString()} />
              <Stat label="XP" value={player.shellwardenXp.toString()} />
              <Stat label="Crabs Owned" value={player.crabs.length.toString()} />
              <Stat label="Teams" value={player.teams.length.toString()} />
              <Stat label="Eggs" value={player.eggs.length.toString()} />
              <Stat label="Gold" value={formatGold(player.gold)} />
              <Stat label="Breeds Discovered" value={`${player.discoveredBreeds.length}/${BREEDS.length}`} />
              <Stat label="Legendaries Found" value={player.discoveredLegendaries.length.toString()} />
              <Stat label="Raids Done" value={player.raids.length.toString()} />
              <Stat label="Login Streak" value={`${player.loginStreak} days`} />
            </div>
          </GlassPanel>

          <SectionTitle title="Quests" icon={<span>📜</span>} />
          <GlassPanel className="p-3">
            <div className="space-y-1">
              {player.questProgress.map((qp) => {
                const q = QUESTS.find((x) => x.id === qp.questId);
                if (!q) return null;
                const pct = Math.min(100, (qp.progress / qp.target) * 100);
                return (
                  <div key={qp.questId} className="text-xs bg-black/20 rounded px-2 py-1.5">
                    <div className="flex justify-between items-center">
                      <div>
                        <span className="font-bold">{q.name}</span>
                        {qp.claimed && <span className="ml-1" style={{ color: "#4FB477" }}>✓</span>}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="opacity-70">{qp.progress}/{qp.target}</span>
                        <span className="flex items-center gap-0.5" style={{ color: "#FFD166" }}>
                          <GoldIcon size={10} /> {q.reward}
                        </span>
                      </div>
                    </div>
                    <div className="text-[10px] opacity-70 mt-0.5">{q.description}</div>
                    <div className="mt-1 h-1 bg-white/10 rounded-full overflow-hidden">
                      <div className="h-full" style={{ width: `${pct}%`, background: qp.claimed ? "#4FB477" : "linear-gradient(90deg, #12A7A0, #7CF5E1)" }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </GlassPanel>
        </div>
      )}

      {/* ECONOMY TAB */}
      {tab === "economy" && (
        <div className="space-y-3">
          <SectionTitle title="Economy Health" icon={<span>📊</span>} />
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            <Stat
              label="GOLD in Circulation"
              value={formatGold(player.gold)}
              icon={<GoldIcon size={14} />}
              color="#FFD166"
            />
            <Stat
              label="Hall Listings"
              value={hallListingsCount.toString()}
              color="#7CF5E1"
            />
            <Stat
              label="Bazaar Listings"
              value={bazaarListingsCount.toString()}
              color="#7CF5E1"
            />
            <Stat
              label="Avg Dig Reward"
              value={avgDigReward.toString()}
              color="#FFD166"
            />
            <Stat
              label="Tide Tax Threshold"
              value={formatGold(500000)}
              color="#FF6F91"
            />
            <Stat
              label="Egg Quota"
              value={`${player.eggs.length} incubating`}
              color="#FF6F91"
            />
          </div>

          <GlassPanel className="p-3 text-xs">
            <div className="font-bold mb-1 font-display">Sink Volume</div>
            <div className="opacity-80 space-y-1">
              <div>• Hall fee: {CONFIG_HALL_FEE * 100}% per hire (half burned, half to pool).</div>
              <div>• Bazaar fee: {CONFIG_BAZAAR_FEE * 100}% per trade (removed entirely).</div>
              <div>• Breed cost: 2.5K → 70K GOLD by breed count.</div>
              <div>• Tide Tax: progressive above {formatGold(500000)} GOLD.</div>
              <div>• Extra team slots: 50K → 500K GOLD each (slots 4-7).</div>
            </div>
          </GlassPanel>

          <GlassPanel className="p-3 text-xs">
            <div className="font-bold mb-1 font-display">Faucets</div>
            <div className="opacity-80 space-y-1">
              <div>• Dive rewards: ~{formatGold(300)} base per team per dive.</div>
              <div>• Raid participation: 8% of base reward.</div>
              <div>• Raid steal: 65% of remaining (35% defender floor).</div>
              <div>• Coliseum rewards: 300 / 700 / 1500 GOLD by difficulty.</div>
              <div>• Quest rewards: 400 - 2000 GOLD.</div>
            </div>
          </GlassPanel>
        </div>
      )}
    </div>
  );
}

// Constants imported once at module top
const CONFIG_HALL_FEE = 0.1;
const CONFIG_BAZAAR_FEE = 0.0385;

function Stat({ label, value, color, icon }: { label: string; value: string; color?: string; icon?: React.ReactNode }) {
  return (
    <div className="bg-black/30 rounded-lg p-2">
      <div className="opacity-60 text-[10px] uppercase">{label}</div>
      <div className="font-bold flex items-center gap-0.5" style={{ color: color ?? undefined }}>
        {icon}
        {value}
      </div>
    </div>
  );
}

// ============================================================================
// All 64 Breeds Gallery
// A full collection view over the 64 breed types (8 classes x 8 breeds), with
// class/rarity filters, name search, sort modes, per-breed discovery state,
// stat mini-bars, ownership dots, and a discovery-encouragement banner.
// ============================================================================

type GalleryRarity = "common" | "uncommon" | "rare" | "epic" | "legendary";
type GallerySort = "class" | "name" | "rarity" | "discovery";
type GalleryClassFilter = "all" | ClassId;
type GalleryRarityFilter = "all" | GalleryRarity;

const GALLERY_RARITY_ORDER: Record<GalleryRarity, number> = {
  common: 0,
  uncommon: 1,
  rare: 2,
  epic: 3,
  legendary: 4,
};
const GALLERY_RARITY_COLORS: Record<GalleryRarity, string> = {
  common: "#9CA3AF",
  uncommon: "#4FB477",
  rare: "#5C7CFF",
  epic: "#C026D3",
  legendary: "#FFD166",
};
const GALLERY_RARITY_LABELS: GalleryRarity[] = [
  "common",
  "uncommon",
  "rare",
  "epic",
  "legendary",
];

// Derive a breed's rarity from its index within its class (0..7).
// First two breeds -> Common, next two -> Uncommon, next two -> Rare,
// the 7th -> Epic, and the 8th (ultimate) -> Legendary.
function breedRarity(breed: BreedDef): GalleryRarity {
  const siblings = BREEDS_BY_CLASS[breed.classId];
  const idx = siblings.findIndex((b) => b.id === breed.id);
  if (idx <= 1) return "common";
  if (idx <= 3) return "uncommon";
  if (idx <= 5) return "rare";
  if (idx === 6) return "epic";
  return "legendary";
}

const STAT_KEYS = ["hp", "attack", "defense", "speed", "skill"] as const;
const STAT_LABELS: Record<(typeof STAT_KEYS)[number], string> = {
  hp: "HP",
  attack: "ATK",
  defense: "DEF",
  speed: "SPD",
  skill: "SKL",
};

// StatMiniBars - five tiny vertical bars showing a breed's stat spread,
// normalized to that breed's largest absolute stat modifier.
function StatMiniBars({
  statMod,
  color,
}: {
  statMod: BreedDef["statMod"];
  color: string;
}) {
  const vals = STAT_KEYS.map((k) => statMod[k]);
  const maxAbs = Math.max(1, ...vals.map((v) => Math.abs(v)));
  return (
    <div className="flex items-end gap-1 h-5" aria-hidden>
      {STAT_KEYS.map((k, i) => {
        const v = vals[i];
        const h = Math.max(2, (Math.abs(v) / maxAbs) * 16);
        const positive = v >= 0;
        return (
          <div
            key={k}
            className="flex flex-col items-center gap-0.5"
            title={`${STAT_LABELS[k]} ${v >= 0 ? "+" : ""}${v}`}
          >
            <div
              className="rounded-sm"
              style={{
                width: 4,
                height: h,
                background: color,
                opacity: positive ? 0.95 : 0.4,
              }}
            />
            <span className="text-[7px] opacity-50 leading-none">
              {STAT_LABELS[k]}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function AllBreedsGallery({
  player,
  discoveredSet,
  ownedBreedIds,
  setScreen,
}: {
  player: PlayerProfile;
  discoveredSet: Set<string>;
  ownedBreedIds: Set<string>;
  setScreen: (s: string) => void;
}) {
  const [classFilter, setClassFilter] = useState<GalleryClassFilter>("all");
  const [rarityFilter, setRarityFilter] = useState<GalleryRarityFilter>("all");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<GallerySort>("class");
  const [openBreedId, setOpenBreedId] = useState<string | null>(null);

  // Per-breed ownership counts (drives the ●●●○○ indicator, capped at 5).
  const breedOwnedCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of player.crabs) {
      m.set(c.breedId, (m.get(c.breedId) ?? 0) + 1);
    }
    return m;
  }, [player.crabs]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = BREEDS.filter((b) => {
      if (classFilter !== "all" && b.classId !== classFilter) return false;
      if (rarityFilter !== "all" && breedRarity(b) !== rarityFilter) return false;
      if (q) {
        const cls = CLASSES[b.classId];
        const fname = FACTIONS[CLASS_FACTION_HINT[b.classId]].name;
        const hay = `${b.name} ${cls.name} ${fname} ${b.lore}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    list.sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name);
      if (sort === "rarity")
        return (
          GALLERY_RARITY_ORDER[breedRarity(a)] - GALLERY_RARITY_ORDER[breedRarity(b)]
        );
      if (sort === "discovery") {
        const rank = (id: string) =>
          ownedBreedIds.has(id) ? 0 : discoveredSet.has(id) ? 1 : 2;
        const ra = rank(a.id);
        const rb = rank(b.id);
        if (ra !== rb) return ra - rb;
        return a.name.localeCompare(b.name);
      }
      // sort === "class"
      const ca = CLASS_LIST.findIndex((c) => c.id === a.classId);
      const cb = CLASS_LIST.findIndex((c) => c.id === b.classId);
      if (ca !== cb) return ca - cb;
      return (
        GALLERY_RARITY_ORDER[breedRarity(a)] - GALLERY_RARITY_ORDER[breedRarity(b)]
      );
    });
    return list;
  }, [classFilter, rarityFilter, search, sort, ownedBreedIds, discoveredSet]);

  // Summary stats.
  const totalDiscovered = useMemo(() => {
    let n = 0;
    for (const b of BREEDS) {
      if (ownedBreedIds.has(b.id) || discoveredSet.has(b.id)) n += 1;
    }
    return n;
  }, [ownedBreedIds, discoveredSet]);
  const ownedTotal = useMemo(() => {
    let n = 0;
    for (const b of BREEDS) if (ownedBreedIds.has(b.id)) n += 1;
    return n;
  }, [ownedBreedIds]);
  const undiscoveredTotal = BREEDS.length - totalDiscovered;
  const progressPct = Math.round((totalDiscovered / BREEDS.length) * 100);

  // Class-header rows: only when class filter is "all" and sort is "class".
  const showClassHeaders = classFilter === "all" && sort === "class";
  const groupedByClass = useMemo(() => {
    if (!showClassHeaders) return null;
    const map = new Map<ClassId, BreedDef[]>();
    for (const b of filtered) {
      const arr = map.get(b.classId) ?? [];
      arr.push(b);
      map.set(b.classId, arr);
    }
    return CLASS_LIST.map((c) => ({
      cls: c,
      breeds: map.get(c.id) ?? [],
    })).filter((g) => g.breeds.length > 0);
  }, [filtered, showClassHeaders]);

  const rarityPill = (r: GalleryRarityFilter, label: string) => {
    const active = rarityFilter === r;
    const color = r === "all" ? "#7CF5E1" : GALLERY_RARITY_COLORS[r];
    return (
      <button
        key={r}
        onClick={() => setRarityFilter(r)}
        className="px-2 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap transition-all"
        style={{
          background: active ? color + "22" : "rgba(255,255,255,0.04)",
          color: active ? color : "rgba(255,255,255,0.65)",
          border: `1px solid ${active ? color + "88" : "rgba(124,245,225,0.14)"}`,
        }}
      >
        {label}
      </button>
    );
  };

  const classPill = (c: GalleryClassFilter, label: string, icon?: string) => {
    const active = classFilter === c;
    return (
      <button
        key={c}
        onClick={() => setClassFilter(c)}
        className="px-2 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap transition-all flex items-center gap-1"
        style={{
          background: active ? "rgba(18,167,160,0.22)" : "rgba(255,255,255,0.04)",
          color: active ? "#7CF5E1" : "rgba(255,255,255,0.65)",
          border: `1px solid ${active ? "rgba(124,245,225,0.55)" : "rgba(124,245,225,0.14)"}`,
        }}
      >
        {icon && <span aria-hidden>{icon}</span>}
        {label}
      </button>
    );
  };

  const renderBreedCard = (b: BreedDef) => {
    const cls = CLASSES[b.classId];
    const fid = CLASS_FACTION_HINT[b.classId];
    const faction = FACTIONS[fid];
    const isOwned = ownedBreedIds.has(b.id);
    const isDiscovered = discoveredSet.has(b.id) || isOwned;
    const rarity = breedRarity(b);
    const ownedCount = Math.min(5, breedOwnedCounts.get(b.id) ?? 0);
    const borderColor = faction.colors.primary;
    const isOpen = openBreedId === b.id;

    const tooltipText = isDiscovered
      ? `${b.name} — ${cls.name} · ${faction.name}. ` +
        `HP ${b.statMod.hp >= 0 ? "+" : ""}${b.statMod.hp}, ` +
        `ATK ${b.statMod.attack >= 0 ? "+" : ""}${b.statMod.attack}, ` +
        `DEF ${b.statMod.defense >= 0 ? "+" : ""}${b.statMod.defense}, ` +
        `SPD ${b.statMod.speed >= 0 ? "+" : ""}${b.statMod.speed}, ` +
        `SKL ${b.statMod.skill >= 0 ? "+" : ""}${b.statMod.skill}. ` +
        `Skill: ${b.skillFlavor}. Art: ${b.artNotes}.`
      : `${cls.name} breed — undiscovered. Hatch or breed a ${faction.name} ${cls.name} to reveal.`;

    return (
      <div
        key={b.id}
        title={tooltipText}
        onClick={() => setOpenBreedId(isOpen ? null : b.id)}
        className="relative rounded-xl p-2 cursor-pointer transition-all hover:-translate-y-0.5"
        style={{
          background: isOwned
            ? "rgba(79,180,119,0.10)"
            : isDiscovered
            ? "rgba(124,245,225,0.06)"
            : "rgba(0,0,0,0.28)",
          border: `1.5px solid ${
            isOwned
              ? "rgba(79,180,119,0.55)"
              : borderColor + (isDiscovered ? "66" : "22")
          }`,
          opacity: isDiscovered ? 1 : 0.7,
        }}
      >
        {/* Faction emblem top-right */}
        <img
          src={FACTION_EMBLEM_ART[fid]}
          alt={faction.name}
          width={16}
          height={16}
          draggable={false}
          className="absolute top-1.5 right-1.5 object-contain opacity-80"
          aria-hidden
        />
        {/* Rarity pip top-left */}
        <span
          className="absolute top-1.5 left-1.5 rounded-full"
          style={{
            width: 6,
            height: 6,
            background: GALLERY_RARITY_COLORS[rarity],
            boxShadow: `0 0 4px ${GALLERY_RARITY_COLORS[rarity]}`,
          }}
          aria-hidden
        />

        {/* Breed art */}
        <div
          className="relative rounded-lg overflow-hidden aspect-[4/3] w-full bg-black/30 flex items-center justify-center mb-1.5 mt-2"
          style={{ filter: isDiscovered ? undefined : "grayscale(1) brightness(0.45)" }}
        >
          <ClassArtImage
            classId={b.classId}
            faction={CLASS_HOME_FACTION[b.classId]}
            size={76}
            speed={0}
          />
          {!isDiscovered && (
            <span className="absolute text-lg" aria-hidden>
              🔒
            </span>
          )}
        </div>

        {/* Breed name */}
        <div
          className="font-bold text-[13px] leading-tight font-display truncate"
          style={{ color: isDiscovered ? "#EAF6FF" : "rgba(255,255,255,0.55)" }}
        >
          {isDiscovered ? b.name : "???"}
        </div>
        {/* Class + faction line */}
        <div className="text-[10px] opacity-70 truncate">
          {cls.name} · {faction.shortName}
        </div>
        {/* Lore line */}
        <div
          className="text-[10px] italic opacity-60 leading-tight mt-0.5 line-clamp-2"
          style={{ minHeight: 24 }}
        >
          {isDiscovered ? `\"${b.lore}\"` : "???"}
        </div>

        {/* Stat mini-bars (only when discovered) */}
        {isDiscovered && (
          <div className="mt-1.5">
            <StatMiniBars statMod={b.statMod} color={borderColor} />
          </div>
        )}

        {/* Discovery badge + count dots */}
        <div className="mt-1.5 flex items-center justify-between gap-1">
          {isOwned ? (
            <span
              className="text-[9px] font-bold px-1.5 py-0.5 rounded"
              style={{ background: "rgba(79,180,119,0.18)", color: "#4FB477" }}
            >
              ✓ Owned
            </span>
          ) : isDiscovered ? (
            <span
              className="text-[9px] font-bold px-1.5 py-0.5 rounded"
              style={{ background: "rgba(124,245,225,0.14)", color: "#7CF5E1" }}
            >
              🔓 Discovered
            </span>
          ) : (
            <span
              className="text-[9px] font-bold px-1.5 py-0.5 rounded"
              style={{
                background: "rgba(255,255,255,0.06)",
                color: "rgba(255,255,255,0.55)",
              }}
            >
              🔒 Undiscovered
            </span>
          )}
          <BreedDots count={ownedCount} max={5} />
        </div>

        {/* Inline detail popover (click / mobile tap) */}
        {isOpen && isDiscovered && (
          <div
            className="mt-2 rounded-lg p-2 text-[10px] space-y-1"
            style={{
              background: "rgba(10,27,61,0.85)",
              border: "1px solid rgba(124,245,225,0.25)",
            }}
          >
            <div className="flex items-center gap-1">
              <span
                className="px-1.5 py-0.5 rounded font-bold uppercase"
                style={{
                  background: GALLERY_RARITY_COLORS[rarity] + "22",
                  color: GALLERY_RARITY_COLORS[rarity],
                }}
              >
                {rarity}
              </span>
              <span className="opacity-60">·</span>
              <span className="opacity-80">{cls.role}</span>
            </div>
            <div className="opacity-80">
              <span className="opacity-60">Skill:</span> {b.skillFlavor}
            </div>
            <div className="opacity-70 italic">{b.artNotes}</div>
            <div className="grid grid-cols-5 gap-1 text-center">
              {STAT_KEYS.map((k) => (
                <div key={k} className="bg-black/30 rounded py-0.5">
                  <div className="opacity-60 text-[8px] uppercase">{STAT_LABELS[k]}</div>
                  <div className="font-bold">
                    {b.statMod[k] >= 0 ? "+" : ""}
                    {b.statMod[k]}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <GlassPanel className="p-4 space-y-3">
      {/* Section title */}
      <SectionTitle
        title="All 64 Breeds"
        icon={<span>🦀</span>}
        action={
          <span className="text-[10px] opacity-70 font-bold">
            {totalDiscovered}/{BREEDS.length} discovered
          </span>
        }
      />

      {/* Stats summary banner */}
      <div
        className="rounded-xl px-3 py-2"
        style={{
          background: "rgba(10,27,61,0.45)",
          border: "1px solid rgba(124,245,225,0.16)",
        }}
      >
        <div className="text-[11px] opacity-85">
          Total: <span className="font-bold">{BREEDS.length}</span> breeds across{" "}
          <span className="font-bold">{CLASS_LIST.length}</span> classes · You own{" "}
          <span className="font-bold" style={{ color: "#4FB477" }}>
            {ownedTotal}
          </span>{" "}
          · Discovered{" "}
          <span className="font-bold" style={{ color: "#7CF5E1" }}>
            {totalDiscovered}
          </span>{" "}
          · Undiscovered{" "}
          <span className="font-bold" style={{ color: "#FFD166" }}>
            {undiscoveredTotal}
          </span>
        </div>
        <div
          className="mt-1.5 h-1.5 rounded-full overflow-hidden"
          style={{ background: "rgba(255,255,255,0.10)" }}
        >
          <div
            className="h-full rounded-full"
            style={{
              width: `${progressPct}%`,
              background: "linear-gradient(90deg, #12A7A0, #7CF5E1, #FFD166)",
            }}
          />
        </div>
      </div>

      {/* Filter bar */}
      <div className="space-y-1.5">
        {/* Class pills */}
        <div className="flex flex-wrap items-center gap-1">
          {classPill("all", "All")}
          {CLASS_LIST.map((c) => classPill(c.id, c.name, c.icon))}
        </div>
        {/* Rarity pills + search + sort */}
        <div className="flex flex-wrap items-center gap-1.5">
          {rarityPill("all", "All")}
          {GALLERY_RARITY_LABELS.map((r) =>
            rarityPill(r, r.charAt(0).toUpperCase() + r.slice(1))
          )}
          <div className="ml-auto flex items-center gap-1.5">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search breeds…"
              className="px-2 py-1 rounded-lg text-[11px] w-32 sm:w-40 bg-black/30 outline-none"
              style={{
                border: "1px solid rgba(124,245,225,0.18)",
                color: "#EAF6FF",
              }}
              aria-label="Search breeds by name"
            />
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as GallerySort)}
              className="px-2 py-1 rounded-lg text-[11px] bg-black/30 outline-none"
              style={{
                border: "1px solid rgba(124,245,225,0.18)",
                color: "#EAF6FF",
              }}
              aria-label="Sort breeds"
            >
              <option value="class">Sort: Class</option>
              <option value="name">Sort: Name</option>
              <option value="rarity">Sort: Rarity</option>
              <option value="discovery">Sort: Discovery</option>
            </select>
          </div>
        </div>
      </div>

      {/* Grid / class-grouped grid / empty state */}
      {filtered.length === 0 ? (
        <EmptyState
          message="No breeds match your filter."
          hint="Try clearing the search or widening the filters."
          compact
        />
      ) : showClassHeaders && groupedByClass ? (
        <div className="space-y-3">
          {groupedByClass.map(({ cls, breeds }) => {
            const classTotal = BREEDS_BY_CLASS[cls.id].length;
            const fullClassDiscovered = BREEDS_BY_CLASS[cls.id].filter(
              (b) => ownedBreedIds.has(b.id) || discoveredSet.has(b.id)
            ).length;
            return (
              <div key={cls.id}>
                <div
                  className="flex items-center gap-1.5 mb-1.5 px-2 py-1 rounded-lg"
                  style={{
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(124,245,225,0.12)",
                  }}
                >
                  <span className="text-base" aria-hidden>
                    {cls.icon}
                  </span>
                  <span className="font-bold text-xs font-display">{cls.name}</span>
                  <span className="ml-auto text-[10px] opacity-60">
                    {fullClassDiscovered}/{classTotal} discovered
                  </span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {breeds.map(renderBreedCard)}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {filtered.map(renderBreedCard)}
        </div>
      )}

      {/* Discovery encouragement */}
      {undiscoveredTotal > 0 && (
        <div
          className="rounded-xl px-3 py-2 text-[11px] flex items-center gap-2 flex-wrap"
          style={{
            background: "rgba(255,209,102,0.08)",
            border: "1px solid rgba(255,209,102,0.25)",
          }}
        >
          <span aria-hidden>🔑</span>
          <span>
            Discover{" "}
            <span className="font-bold" style={{ color: "#FFD166" }}>
              {undiscoveredTotal}
            </span>{" "}
            more breeds by breeding crabs with different gene combinations.
            Visit the Nursery to start.
          </span>
          <GlowButton
            size="sm"
            variant="gold"
            onClick={() => setScreen("nursery")}
            className="ml-auto"
          >
            Open Nursery →
          </GlowButton>
        </div>
      )}
    </GlassPanel>
  );
}
