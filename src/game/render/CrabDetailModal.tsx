// Crabtopia - Crab Detail Modal
// Shows full crab info: large art, stats, genes (per slot with rarity), breed, mastery,
// plus a collapsible lineage family tree (grandparents -> parents -> this crab -> offspring).

"use client";

import { useState } from "react";
import { Crab } from "../types";
import { FACTIONS } from "../content/factions";
import { CLASSES } from "../content/classes";
import { BREEDS_BY_ID } from "../content/breeds";
import { crabBaseBP } from "../engine/bp";
import { useGame } from "../store/gameStore";
import {
  formatBP,
  formatTime,
  GoldIcon,
  RarityBadge,
  FactionBadge,
  BreedDots,
  MasteryStars,
  classIcon,
} from "./ui";
import CrabRenderer from "./CrabRenderer";
import { ClassArtImage } from "./CrabArtImage";
import ElementBadge from "./ElementBadge";
import ElementAura from "./ElementAura";
import LivingCrab from "../animation/LivingCrab";
import { Modal } from "./Modal";
import {
  BODY_PART_SLOTS,
  RARITY_COLORS,
  getGeneVariant,
} from "../content/bodyparts";

// ---------- Lineage / Family Tree ----------

const LINE_COLOR = "rgba(124,245,225,0.3)";
const GP_NODE_W = 80; // small node width (grandparents / offspring)
const GP_GAP = 6;
const GP_PAIR_W = GP_NODE_W * 2 + GP_GAP; // width of one parent's block
const BLOCK_GAP = 12;
const TREE_W = GP_PAIR_W * 2 + BLOCK_GAP; // total tree width
const PARENT_W = 124;
const PARENT_MIN_H = 90;
const SMALL_MIN_H = 76;
const CUR_W = 140;
const MAX_CHILD_NODES = 9;
const MAX_SIBLING_CHIPS = 8;

// A grandparent slot: a real owned crab, a known-but-unowned crab, an unknown
// wild-caught ancestor, or a merged "wild stock" card for a known gen-0 parent.
type GPSlot =
  | { kind: "real"; crab: Crab }
  | { kind: "offmarket" }
  | { kind: "unknown" }
  | { kind: "wildstock" };

interface ParentBlock {
  key: string;
  role: "Sire" | "Dam";
  crab: Crab | null;
  gpSlots: GPSlot[];
  gpCells: number[];
}

// BusConnector: drops a tick from the center of each cell in the row above,
// joins the ticks with a horizontal bus line, then drops a single line down to
// the centered node below. Mirrors the fixed widths of the row above so the
// ticks always land exactly on the node centers.
function BusConnector({ cells, gap, height }: { cells: number[]; gap: number; height: number }) {
  const half = height / 2;
  const first = cells[0] / 2;
  const last = cells[cells.length - 1] / 2;
  const single = cells.length < 2 || last <= first;
  return (
    <div className="relative flex" style={{ gap, height, width: "fit-content" }}>
      {cells.map((w, i) => (
        <div key={i} className="shrink-0 flex justify-center" style={{ width: w }}>
          <div style={{ width: 2, height: half, background: LINE_COLOR }} />
        </div>
      ))}
      {!single && (
        <div
          className="absolute"
          style={{
            top: half - 1,
            left: first,
            width: last - first,
            height: 0,
            borderTop: `2px solid ${LINE_COLOR}`,
          }}
        />
      )}
      <div
        className="absolute"
        style={{
          top: half - 1,
          left: "50%",
          width: 0,
          marginLeft: -1,
          height: height - half + 2,
          borderLeft: `2px solid ${LINE_COLOR}`,
        }}
      />
    </div>
  );
}

function LineageArt({ crab: c, size }: { crab: Crab; size: number }) {
  return (
    <ClassArtImage
      classId={c.classId}
      faction={c.faction}
      isRookie={c.isRookie}
      size={size}
      speed={0}
    />
  );
}

function GenTag({ n }: { n: number }) {
  return (
    <span
      className="px-1 rounded text-[7px] font-bold"
      style={{ background: "rgba(255,255,255,0.07)", color: "rgba(234,246,255,0.75)" }}
    >
      Gen {n}
    </span>
  );
}

function GenLabel({ text }: { text: string }) {
  return (
    <div className="text-[7px] uppercase tracking-[0.2em] opacity-50 font-bold">{text}</div>
  );
}

// Small lineage node: 40px art + name + Gen tag, faction-colored border.
function SmallNode({ c }: { c: Crab }) {
  const f = FACTIONS[c.faction];
  return (
    <div
      className="rounded-lg p-1 flex flex-col items-center gap-0.5"
      style={{
        width: GP_NODE_W,
        minHeight: SMALL_MIN_H,
        background: `${f.colors.dark}aa`,
        border: `1px solid ${f.colors.primary}55`,
      }}
      title={`${c.name} · ${CLASSES[c.classId].name} · Gen ${c.generation}`}
    >
      <LineageArt crab={c} size={40} />
      <div className="text-[8px] font-bold truncate max-w-full">{c.name}</div>
      <GenTag n={c.generation} />
    </div>
  );
}

// Placeholder node for unknown / off-market ancestors.
function PseudoNode({ emoji, label, sub, width }: { emoji: string; label: string; sub: string; width: number }) {
  return (
    <div
      className="rounded-lg p-1 flex flex-col items-center justify-center gap-0.5"
      style={{
        width,
        minHeight: SMALL_MIN_H,
        background: "rgba(255,255,255,0.03)",
        border: "1px dashed rgba(124,245,225,0.22)",
      }}
    >
      <div
        className="flex items-center justify-center rounded-md"
        style={{ width: 40, height: 40, background: "rgba(255,255,255,0.04)" }}
      >
        <span style={{ fontSize: 18, opacity: 0.55 }}>{emoji}</span>
      </div>
      <div className="text-[8px] font-bold opacity-60 truncate max-w-full">{label}</div>
      <div className="text-[7px] opacity-40 truncate max-w-full">{sub}</div>
    </div>
  );
}

function GPSlotNode({ slot }: { slot: GPSlot }) {
  if (slot.kind === "real") return <SmallNode c={slot.crab} />;
  if (slot.kind === "offmarket")
    return <PseudoNode emoji="❓" label="Unknown" sub="off-market" width={GP_NODE_W} />;
  if (slot.kind === "wildstock")
    return <PseudoNode emoji="🌊" label="Wild-caught stock" sub="no recorded lineage" width={GP_PAIR_W} />;
  return <PseudoNode emoji="🌊" label="Unknown" sub="wild-caught" width={GP_NODE_W} />;
}

// Parent node: 40px art + name + faction + class + BP + gen.
function ParentNode({ c }: { c: Crab }) {
  const f = FACTIONS[c.faction];
  return (
    <div
      className="rounded-lg p-1.5 flex flex-col items-center gap-0.5"
      style={{
        width: PARENT_W,
        minHeight: PARENT_MIN_H,
        background: `${f.colors.dark}cc`,
        border: `1px solid ${f.colors.primary}77`,
      }}
      title={`${c.name} · ${f.name} · ${CLASSES[c.classId].name}`}
    >
      <LineageArt crab={c} size={40} />
      <div className="text-[9px] font-bold truncate max-w-full">{c.name}</div>
      <div className="text-[8px] opacity-70 truncate max-w-full">
        {f.shortName} · {CLASSES[c.classId].name}
      </div>
      <div className="text-[8px] font-bold" style={{ color: "#FFD166" }}>
        {formatBP(crabBaseBP(c))} BP · Gen {c.generation}
      </div>
    </div>
  );
}

// Ghost card for a parent whose ID is recorded but is not owned by the player.
function GhostParentNode({ role }: { role: "Sire" | "Dam" }) {
  return (
    <div
      className="rounded-lg p-1.5 flex flex-col items-center justify-center gap-0.5"
      style={{
        width: PARENT_W,
        minHeight: PARENT_MIN_H,
        background: "rgba(255,255,255,0.03)",
        border: "1px dashed rgba(124,245,225,0.25)",
      }}
    >
      <div
        className="flex items-center justify-center rounded-md"
        style={{ width: 40, height: 40, background: "rgba(255,255,255,0.04)" }}
      >
        <span style={{ fontSize: 18, opacity: 0.55 }}>❓</span>
      </div>
      <div className="text-[9px] font-bold opacity-70">Unknown {role}</div>
      <div className="text-[8px] opacity-45">Off-market</div>
    </div>
  );
}

// Current crab node: 60px art, gold border + glow, "YOU ARE HERE" badge.
function CurrentNode({ crab: c, bp }: { crab: Crab; bp: number }) {
  const f = FACTIONS[c.faction];
  return (
    <div
      className="relative rounded-xl p-2 flex flex-col items-center gap-0.5"
      style={{
        width: CUR_W,
        background: `linear-gradient(150deg, ${f.colors.dark}ee, ${f.colors.primary}33)`,
        border: "2px solid #FFD166",
        boxShadow: "0 0 18px rgba(255,209,102,0.35)",
      }}
    >
      <div
        className="absolute -top-2.5 left-1/2 -translate-x-1/2 px-1.5 py-px rounded-full text-[7px] font-bold tracking-widest whitespace-nowrap"
        style={{ background: "#FFD166", color: "#0A1B3D", boxShadow: "0 0 8px rgba(255,209,102,0.6)" }}
      >
        YOU ARE HERE
      </div>
      <LineageArt crab={c} size={60} />
      <div className="text-[10px] font-bold truncate max-w-full">{c.name}</div>
      <div className="text-[8px] opacity-75 truncate max-w-full">
        {f.shortName} · {CLASSES[c.classId].name}
      </div>
      <div className="text-[8px] font-bold" style={{ color: "#FFD166" }}>
        Gen {c.generation} · {formatBP(bp)} BP
      </div>
    </div>
  );
}

// "+N more" tile when offspring overflow the display cap.
function MoreNode({ count }: { count: number }) {
  return (
    <div
      className="rounded-lg flex items-center justify-center"
      style={{
        width: GP_NODE_W,
        minHeight: SMALL_MIN_H,
        background: "rgba(255,255,255,0.03)",
        border: "1px dashed rgba(124,245,225,0.22)",
      }}
    >
      <span className="text-[9px] font-bold opacity-60">+{count} more</span>
    </div>
  );
}

// Sibling chip: art thumb + name + class icon.
function SiblingChip({ c }: { c: Crab }) {
  const f = FACTIONS[c.faction];
  return (
    <div
      className="flex items-center gap-1.5 rounded-full pl-1 pr-2 py-0.5"
      style={{ background: `${f.colors.dark}aa`, border: `1px solid ${f.colors.primary}55` }}
      title={`${c.name} · ${CLASSES[c.classId].name} · Gen ${c.generation}`}
    >
      <ClassArtImage classId={c.classId} faction={c.faction} isRookie={c.isRookie} size={22} speed={0} />
      <span className="text-[9px] font-bold truncate" style={{ maxWidth: 76 }}>
        {c.name}
      </span>
      <span className="text-[9px]" title={CLASSES[c.classId].name}>
        {classIcon(c.classId)}
      </span>
    </div>
  );
}

// Pedigree stats row: generation, offspring, siblings, breed count + purity note.
function PedigreeStatsRow({
  crab: c,
  childCount,
  siblingCount,
}: {
  crab: Crab;
  childCount: number;
  siblingCount: number;
}) {
  return (
    <div className="pt-1.5 text-center" style={{ borderTop: "1px solid rgba(124,245,225,0.12)" }}>
      <div className="text-[9px] opacity-80">
        Generation {c.generation} · {childCount} offspring · {siblingCount} siblings · Breed count {c.breedCount}/5
      </div>
      <div className="text-[8px] mt-0.5" style={{ color: c.purity >= 18 ? "#FFD166" : "rgba(234,246,255,0.5)" }}>
        {c.purity >= 18
          ? "✨ Pure lineage (18/18) — commands higher Bazaar prices!"
          : "Pure-lineage crabs (18/18) command higher Bazaar prices."}
      </div>
    </div>
  );
}

interface Props {
  crab: Crab;
  onClose: () => void;
}

export default function CrabDetailModal({ crab, onClose }: Props) {
  const faction = FACTIONS[crab.faction];
  const classDef = CLASSES[crab.classId];
  const breed = BREEDS_BY_ID[crab.breedId];
  const bp = crabBaseBP(crab);
  const [useProcedural, setUseProcedural] = useState(false);
  const [lineageOpen, setLineageOpen] = useState(false);
  const graduateCrab = useGame((s) => s.graduateCrab);

  // ---- Lineage data (resolved against the player's owned crabs only) ----
  const player = useGame((s) => s.player);
  const ownedCrabs = player?.crabs ?? [];
  const crabMap = new Map<string, Crab>();
  for (const c of ownedCrabs) crabMap.set(c.id, c);

  const parentIds = crab.parentIds ?? [];
  const parentBlocks: ParentBlock[] = parentIds.slice(0, 2).map((pid, i) => {
    const pc = crabMap.get(pid) ?? null;
    let gpSlots: GPSlot[] = [{ kind: "unknown" }, { kind: "unknown" }];
    if (pc) {
      const gpIds = pc.parentIds.slice(0, 2);
      if (gpIds.length === 0) {
        // Known parent that is itself wild-caught (gen 0).
        gpSlots = [{ kind: "wildstock" }];
      } else {
        gpSlots = [0, 1].map((j): GPSlot => {
          const gid = gpIds[j];
          if (!gid) return { kind: "unknown" };
          const g = crabMap.get(gid);
          return g ? { kind: "real", crab: g } : { kind: "offmarket" };
        });
      }
    }
    return {
      key: `${i}-${pid}`,
      role: i === 0 ? "Sire" : "Dam",
      crab: pc,
      gpSlots,
      gpCells: gpSlots.map((s) => (s.kind === "wildstock" ? GP_PAIR_W : GP_NODE_W)),
    };
  });

  // Offspring: owned crabs listing this crab as a parent.
  const children = ownedCrabs.filter((c) => c.id !== crab.id && c.parentIds.includes(crab.id));
  // Siblings: owned crabs sharing at least one parent with this crab.
  const siblings =
    parentIds.length > 0
      ? ownedCrabs.filter((c) => c.id !== crab.id && c.parentIds.some((p) => parentIds.includes(p)))
      : [];
  // Eggs in the nursery carrying this crab's genes.
  const pendingEggs = (player?.eggs ?? []).filter((e) => e.parentId.includes(crab.id));

  const hasLineage = parentBlocks.length > 0 || children.length > 0 || pendingEggs.length > 0;
  const summaryParts: string[] = [];
  if (parentBlocks.length > 0) summaryParts.push(`${parentBlocks.length} parents`);
  if (children.length > 0) summaryParts.push(`${children.length} offspring`);
  if (pendingEggs.length > 0) summaryParts.push(`${pendingEggs.length} eggs`);

  let topRarity: "common" | "uncommon" | "rare" | "epic" | "legendary" = "common";
  const order = ["common", "uncommon", "rare", "epic", "legendary"] as const;
  for (const slot of BODY_PART_SLOTS) {
    const v = getGeneVariant(slot, crab.genes[slot].D);
    if (v && order.indexOf(v.rarity) > order.indexOf(topRarity)) topRarity = v.rarity;
  }

  const ageMs = Date.now() - crab.birthTime;
  const stats = crab.stats;

  return (
    <Modal
      title="Crab Dossier"
      onClose={onClose}
      maxWidth="max-w-lg"
    >
      <div className="space-y-3">
        {/* Header */}
        <div
          className="rounded-xl p-3 flex items-center gap-3"
          style={{
            background: `linear-gradient(135deg, ${faction.colors.dark}cc, ${faction.colors.primary}22)`,
            border: `1px solid ${faction.colors.primary}55`,
          }}
        >
          <div className="relative flex flex-col items-center gap-1">
            {useProcedural ? (
              <div className="relative" style={{ width: 144, height: 144 }}>
                {/* Same aura layer as the portrait view (CrabRenderer) */}
                <ElementAura crab={crab} />
                <LivingCrab crab={crab} size={144} />
              </div>
            ) : (
              <CrabRenderer crab={crab} size={144} animate showEmblem />
            )}
            <button
              onClick={() => setUseProcedural((v) => !v)}
              className="text-[9px] opacity-60 hover:opacity-100 uppercase tracking-wide transition"
              aria-label="Toggle portrait view"
              title="Toggle between the crab's portrait art and its animated battle sprite sheet"
            >
              {useProcedural ? "← Portrait art" : "Animated sheet →"}
            </button>
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-bold text-lg font-display" style={{ color: faction.colors.light }}>
              {crab.name}
            </div>
            <div className="text-xs opacity-80 mb-1">
              {classDef.name} · {faction.name}
            </div>
            <div className="mb-1">
              <ElementBadge crab={crab} size="md" />
            </div>
            {breed && (
              <div className="text-[10px] opacity-70 mb-2 italic">{breed.lore}</div>
            )}
            <div className="flex flex-wrap items-center gap-2 text-[10px]">
              <span className="font-bold flex items-center gap-0.5" style={{ color: "#FFD166" }}>
                <GoldIcon size={12} /> {formatBP(bp)} BP
              </span>
              <span className="opacity-70">Lv {crab.level}</span>
              <RarityBadge rarity={topRarity} />
              <FactionBadge faction={crab.faction} size={14} showName />
            </div>
            <div className="mt-1 flex items-center gap-2 text-[10px]">
              <span className="opacity-70">Purity {crab.purity}/18</span>
              <BreedDots count={crab.breedCount} />
              <MasteryStars count={crab.masteryBadges.length} />
            </div>
            {/* Rookie graduation — unlocks breeding + trading for starter
                crabs. Previously graduateCrab had NO caller anywhere, so the
                five rookie starters could never breed or be sold (a dead end). */}
            {crab.isRookie && crab.ownerId === "player" && (
              <button
                type="button"
                data-testid="graduate-crab"
                onClick={() => graduateCrab(crab.id)}
                className="mt-2 w-full rounded-lg px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wide transition"
                style={{
                  background: "rgba(255,209,102,0.15)",
                  border: "1px solid rgba(255,209,102,0.5)",
                  color: "#FFD166",
                  cursor: "pointer",
                }}
                title="Graduate this rookie: it leaves the brooding nest and becomes a full adult — eligible for breeding and trading."
              >
                🎓 Graduate to Adult — unlock breeding & trading
              </button>
            )}
          </div>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-5 gap-1.5 text-center">
          {([
            ["HP", stats.hp, "#FF6F91"],
            ["ATK", stats.attack, "#FF7A1A"],
            ["DEF", stats.defense, "#7CF5E1"],
            ["SPD", stats.speed, "#7A5CFF"],
            ["SKL", stats.skill, "#FFD166"],
          ] as const).map(([label, value, color]) => (
            <div
              key={label}
              className="rounded-lg p-1.5"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(124,245,225,0.15)" }}
            >
              <div className="text-[9px] uppercase opacity-70">{label}</div>
              <div className="text-sm font-bold" style={{ color }}>
                {value}
              </div>
            </div>
          ))}
        </div>

        {/* Gene expression table */}
        <div className="rounded-xl p-2" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(124,245,225,0.12)" }}>
          <div className="text-[10px] uppercase tracking-wide opacity-70 mb-1.5">Gene Expression</div>
          <div className="space-y-1">
            {BODY_PART_SLOTS.map((slot) => {
              const vD = getGeneVariant(slot, crab.genes[slot].D);
              const vR1 = getGeneVariant(slot, crab.genes[slot].R1);
              const vR2 = getGeneVariant(slot, crab.genes[slot].R2);
              return (
                <div key={slot} className="flex items-center gap-2 text-[10px]">
                  <span className="w-12 capitalize opacity-80">{slot}</span>
                  <span className="flex-1 truncate font-bold" style={{ color: vD ? RARITY_COLORS[vD.rarity] : "#888" }}>
                    {vD?.label ?? crab.genes[slot].D}
                  </span>
                  <RarityBadge rarity={crab.genes[slot].rarity} />
                  <span className="opacity-60 text-[9px]">
                    R: {vR1?.label ?? "—"} / {vR2?.label ?? "—"}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Class skills */}
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg p-2" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(124,245,225,0.12)" }}>
            <div className="text-[9px] uppercase opacity-70">Active Skill</div>
            <div className="text-xs font-bold">{classDef.activeSkill.name}</div>
            <div className="text-[9px] opacity-70">
              {classDef.activeSkill.energyCost} energy · CD {classDef.activeSkill.cooldown}
            </div>
            <div className="text-[10px] opacity-80 mt-1">{classDef.activeSkill.description}</div>
          </div>
          <div className="rounded-lg p-2" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(124,245,225,0.12)" }}>
            <div className="text-[9px] uppercase opacity-70">Passive</div>
            <div className="text-xs font-bold">{classDef.passive.name}</div>
            <div className="text-[10px] opacity-80 mt-1">{classDef.passive.description}</div>
          </div>
        </div>

        {/* Lineage / family tree (collapsible) */}
        <div
          className="rounded-xl p-2"
          style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(124,245,225,0.12)" }}
        >
          <div className="text-[10px] uppercase tracking-wide opacity-70 mb-1.5">Lineage</div>

          {!hasLineage ? (
            <>
              <div
                className="rounded-lg px-3 py-3 text-center"
                style={{ background: "rgba(255,255,255,0.03)", border: "1px dashed rgba(124,245,225,0.25)" }}
              >
                <div className="text-xs font-bold" style={{ color: "#FFD166" }}>
                  🐚 Wild-caught lineage
                </div>
                <div className="text-[10px] opacity-70 mt-0.5">
                  Breed this crab in the Nursery to start a family tree!
                </div>
              </div>
              <div className="mt-2">
                <PedigreeStatsRow crab={crab} childCount={children.length} siblingCount={siblings.length} />
              </div>
            </>
          ) : (
            <>
              <button
                onClick={() => setLineageOpen((v) => !v)}
                aria-expanded={lineageOpen}
                className="w-full flex items-center justify-between rounded-lg px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wide transition hover:bg-white/5"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(124,245,225,0.15)" }}
              >
                <span className="flex items-center gap-1.5 min-w-0">
                  <span>👪 Family Tree</span>
                  {summaryParts.length > 0 && (
                    <span className="normal-case font-normal opacity-60 truncate">
                      {summaryParts.join(" · ")}
                    </span>
                  )}
                </span>
                <span
                  className={`inline-block transition-transform duration-200 ${lineageOpen ? "rotate-180" : ""}`}
                  aria-hidden="true"
                >
                  ▼
                </span>
              </button>

              {lineageOpen && (
                <div className="mt-2 space-y-2">
                  {/* The tree (scrolls horizontally on narrow screens) */}
                  <div className="overflow-x-auto pb-1">
                    <div
                      className="mx-auto flex flex-col items-center"
                      style={{ width: TREE_W }}
                      aria-label="Family tree"
                    >
                      {parentBlocks.length > 0 && (
                        <>
                          <GenLabel text="Grandparents" />
                          <div className="flex" style={{ gap: BLOCK_GAP }}>
                            {parentBlocks.map((b) => (
                              <div
                                key={b.key}
                                className="flex flex-col items-center"
                                style={{ width: GP_PAIR_W }}
                              >
                                <div className="flex" style={{ gap: GP_GAP }}>
                                  {b.gpSlots.map((s, j) => (
                                    <GPSlotNode key={j} slot={s} />
                                  ))}
                                </div>
                                <BusConnector cells={b.gpCells} gap={GP_GAP} height={14} />
                                {b.crab ? <ParentNode c={b.crab} /> : <GhostParentNode role={b.role} />}
                              </div>
                            ))}
                          </div>
                          <BusConnector
                            cells={parentBlocks.map(() => GP_PAIR_W)}
                            gap={BLOCK_GAP}
                            height={18}
                          />
                        </>
                      )}

                      <CurrentNode crab={crab} bp={bp} />

                      {children.length > 0 && (
                        <>
                          <div style={{ width: 2, height: 12, background: LINE_COLOR }} />
                          <GenLabel text={`Offspring · Gen ${crab.generation + 1}`} />
                          <div className="flex flex-wrap justify-center" style={{ gap: GP_GAP, width: "100%" }}>
                            {children.slice(0, MAX_CHILD_NODES).map((ch) => (
                              <SmallNode key={ch.id} c={ch} />
                            ))}
                            {children.length > MAX_CHILD_NODES && (
                              <MoreNode count={children.length - MAX_CHILD_NODES} />
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Offspring hint */}
                  {children.length === 0 && (
                    <div
                      className="rounded-lg px-2 py-1.5 text-center text-[10px] opacity-75"
                      style={{ background: "rgba(255,255,255,0.03)", border: "1px dashed rgba(124,245,225,0.22)" }}
                    >
                      {pendingEggs.length > 0
                        ? `🥚 ${pendingEggs.length} egg${pendingEggs.length > 1 ? "s" : ""} incubating in the Nursery — offspring incoming!`
                        : "🌿 No offspring yet — visit the Nursery"}
                    </div>
                  )}

                  {/* Siblings */}
                  {siblings.length > 0 && (
                    <div>
                      <div className="text-[9px] uppercase tracking-wide opacity-60 mb-1">
                        Siblings ({siblings.length})
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {siblings.slice(0, MAX_SIBLING_CHIPS).map((s) => (
                          <SiblingChip key={s.id} c={s} />
                        ))}
                        {siblings.length > MAX_SIBLING_CHIPS && (
                          <span className="text-[9px] opacity-60 self-center">
                            +{siblings.length - MAX_SIBLING_CHIPS} more
                          </span>
                        )}
                      </div>
                      <div
                        className="text-[8px] italic mt-1.5 text-center"
                        style={{ color: "rgba(255,209,102,0.65)" }}
                      >
                        ⚠ Bloodline rule: parents and siblings can never breed with this crab.
                      </div>
                    </div>
                  )}

                  <PedigreeStatsRow crab={crab} childCount={children.length} siblingCount={siblings.length} />
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between text-[10px] opacity-70 pt-1">
          <span>Gen {crab.generation} · Age {formatTime(ageMs)}</span>
          <span>Activity: {crab.activity}</span>
        </div>
      </div>
    </Modal>
  );
}
