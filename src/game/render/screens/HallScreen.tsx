// Crabtopia - Driftwood Hall screen (lending & hiring) - polished list view
"use client";

import { useState, useMemo, useEffect } from "react";
import { ArrowUp, ArrowDown, ChevronLeft, ChevronRight } from "lucide-react";
import { useGame, NPC_CRAB_CACHE } from "../../store/gameStore";
import { FACTIONS, FACTION_LIST } from "../../content/factions";
import { CLASSES, CLASS_LIST } from "../../content/classes";
import { crabBaseBP, formatBP } from "../../engine/bp";
import {
  formatGold,
  GoldIcon,
  GlowButton,
  GradientCard,
  FactionBadge,
  EmptyState,
  SectionTitle,
  StatChip,
} from "../ui";
import { CONFIG } from "../../engine/config";
import CrabRenderer from "../CrabRenderer";
import { Modal } from "../Modal";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import type { ClassId, FactionId } from "../../types";

type SortOrder = "asc" | "desc";
const PAGE_SIZE = 6;

export default function HallScreen() {
  const player = useGame((s) => s.player)!;
  const hallListings = useGame((s) => s.hallListings);
  const listCrabInHall = useGame((s) => s.listCrabInHall);
  const unlistCrabFromHall = useGame((s) => s.unlistCrabFromHall);
  const hireCrab = useGame((s) => s.hireCrab);

  const [showList, setShowList] = useState(false);
  const [selectedCrabId, setSelectedCrabId] = useState<string | null>(null);
  const [fee, setFee] = useState(100);
  const [classFilter, setClassFilter] = useState<ClassId | "all">("all");
  const [factionFilter, setFactionFilter] = useState<FactionId | "all">("all");
  const [sortOrder, setSortOrder] = useState<SortOrder>("asc");
  const [page, setPage] = useState(1);

  const myListings = player.hallListings;
  const otherListings = hallListings.filter((l) => l.ownerId !== "player");

  // Filtered + sorted by hire fee asc/desc
  const filteredListings = useMemo(() => {
    let list = otherListings.slice();
    if (classFilter !== "all") {
      list = list.filter((l) => {
        const c = NPC_CRAB_CACHE[l.crabId];
        return c?.classId === classFilter;
      });
    }
    if (factionFilter !== "all") {
      list = list.filter((l) => {
        const c = NPC_CRAB_CACHE[l.crabId];
        return c?.faction === factionFilter;
      });
    }
    list.sort((a, b) =>
      sortOrder === "asc" ? a.hireFee - b.hireFee : b.hireFee - a.hireFee
    );
    return list;
  }, [otherListings, classFilter, factionFilter, sortOrder]);

  // Market summary stats (over the full unfiltered pool)
  const totalCount = otherListings.length;
  const avgFee = totalCount
    ? Math.round(
        otherListings.reduce((s, l) => s + l.hireFee, 0) / totalCount
      )
    : 0;
  const floorFee = totalCount
    ? otherListings.reduce((m, l) => Math.min(m, l.hireFee), Infinity)
    : 0;

  // Pagination
  const totalPages = Math.max(
    1,
    Math.ceil(filteredListings.length / PAGE_SIZE)
  );
  const safePage = Math.min(Math.max(1, page), totalPages);
  const startIdx = (safePage - 1) * PAGE_SIZE;
  const pageListings = filteredListings.slice(
    startIdx,
    startIdx + PAGE_SIZE
  );

  // Reset to page 1 whenever filters/sort change
  useEffect(() => {
    setPage(1);
  }, [classFilter, factionFilter, sortOrder]);

  const handleList = () => {
    if (!selectedCrabId) return;
    listCrabInHall(selectedCrabId, fee);
    setShowList(false);
    setSelectedCrabId(null);
  };

  return (
    <div className="space-y-4 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-xl md:text-2xl font-bold font-display">
            Driftwood Hall
          </h1>
          <p className="text-xs opacity-70">
            Hire mercenaries · List your idle crabs for hire income
          </p>
        </div>
        <GlowButton variant="teal" size="sm" onClick={() => setShowList(true)}>
          + List a Crab
        </GlowButton>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2">
        <StatBox label="Your listings" value={myListings.length} />
        <StatBox label="Available to hire" value={totalCount} />
        <StatBox
          label="Hall fee"
          value={`${CONFIG.hallFeePercent * 100}%`}
          sub="(half burned)"
        />
      </div>

      {/* Market summary banner */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] uppercase opacity-60 mr-1">Market</span>
        <StatChip label="Listings" value={totalCount} color="#7CF5E1" />
        <StatChip
          label="Avg fee"
          value={
            <span className="inline-flex items-center gap-0.5">
              <GoldIcon size={10} />
              {formatGold(avgFee)}
            </span>
          }
          color="#FFD166"
        />
        <StatChip
          label="Floor"
          value={
            <span className="inline-flex items-center gap-0.5">
              <GoldIcon size={10} />
              {formatGold(floorFee)}
            </span>
          }
          color="#FFD166"
        />
      </div>

      {/* Filter + sort bar */}
      <div
        className="flex flex-wrap items-center gap-2 p-2 rounded-xl"
        style={{
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(124,245,225,0.14)",
        }}
      >
        <span className="text-[10px] opacity-70 uppercase">Class</span>
        <Select
          value={classFilter}
          onValueChange={(v) => setClassFilter(v as ClassId | "all")}
        >
          <SelectTrigger
            size="sm"
            className="h-8 text-xs w-[140px]"
            aria-label="Filter by class"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All classes</SelectItem>
            {CLASS_LIST.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.icon} {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <span className="text-[10px] opacity-70 uppercase ml-1">Faction</span>
        <Select
          value={factionFilter}
          onValueChange={(v) => setFactionFilter(v as FactionId | "all")}
        >
          <SelectTrigger
            size="sm"
            className="h-8 text-xs w-[140px]"
            aria-label="Filter by faction"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All factions</SelectItem>
            {FACTION_LIST.map((f) => (
              <SelectItem key={f.id} value={f.id}>
                {f.emblem} {f.shortName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <span className="text-[10px] opacity-70 uppercase ml-1">Sort</span>
        <ToggleGroup
          type="single"
          value={sortOrder}
          onValueChange={(v) => {
            if (v) setSortOrder(v as SortOrder);
          }}
          aria-label="Sort by price order"
          className="rounded-md overflow-hidden"
        >
          <ToggleGroupItem
            value="asc"
            aria-label="Price ascending"
            className="h-8 px-2 text-xs border border-white/15 data-[state=on]:bg-[#12A7A0]/30 data-[state=on]:text-[#7CF5E1]"
          >
            <ArrowUp className="size-3 mr-0.5" /> Price ↑
          </ToggleGroupItem>
          <ToggleGroupItem
            value="desc"
            aria-label="Price descending"
            className="h-8 px-2 text-xs border border-white/15 border-l-0 data-[state=on]:bg-[#12A7A0]/30 data-[state=on]:text-[#7CF5E1]"
          >
            <ArrowDown className="size-3 mr-0.5" /> Price ↓
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      {/* Your listings (separate panel) */}
      {myListings.length > 0 && (
        <section>
          <SectionTitle title="Your Listings" icon={<span>📋</span>} />
          <div className="space-y-2">
            {myListings.map((l) => {
              const crab = player.crabs.find((c) => c.id === l.crabId);
              if (!crab) return null;
              const faction = FACTIONS[crab.faction];
              const classDef = CLASSES[crab.classId];
              return (
                <div
                  key={l.id}
                  className="grid grid-cols-[auto_1fr_auto] gap-3 items-center rounded-xl p-2"
                  style={{
                    background: `linear-gradient(90deg, ${faction.colors.dark}aa, ${faction.colors.primary}11)`,
                    border: `1px solid ${faction.colors.primary}44`,
                    minHeight: 72,
                  }}
                >
                  <div
                    className="flex items-center justify-center shrink-0"
                    style={{ width: 56, height: 56 }}
                  >
                    <CrabRenderer
                      crab={crab}
                      size={56}
                      animate={false}
                      showEmblem
                    />
                  </div>
                  <div className="min-w-0">
                    <div
                      className="font-bold text-sm truncate font-display"
                      style={{ color: faction.colors.light }}
                    >
                      {crab.name}
                    </div>
                    <div className="text-[10px] opacity-70">
                      {classDef.icon} {classDef.name} · Lv {crab.level} · BP{" "}
                      {formatBP(crabBaseBP(crab))}
                    </div>
                    <div
                      className="text-[10px] flex items-center gap-0.5"
                      style={{ color: "#FFD166" }}
                    >
                      Listed: <GoldIcon size={10} /> {l.hireFee}
                    </div>
                  </div>
                  <GlowButton
                    variant="ghost"
                    size="sm"
                    onClick={() => unlistCrabFromHall(l.crabId)}
                  >
                    Delist
                  </GlowButton>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Hire list */}
      <section>
        <SectionTitle title="Mercenaries for Hire" icon={<span>🪵</span>} />
        {filteredListings.length === 0 ? (
          <EmptyState
            message={
              totalCount === 0
                ? "No listings yet, be the first!"
                : "No listings match your filters."
            }
            hint={
              totalCount === 0
                ? "List an idle crab to earn GOLD passively."
                : "Try clearing the class or faction filters."
            }
            cta={
              <GlowButton
                variant="teal"
                size="sm"
                onClick={() => setShowList(true)}
              >
                + List a Crab
              </GlowButton>
            }
          />
        ) : (
          <>
            <div className="space-y-2">
              {pageListings.map((l) => {
                const crab = NPC_CRAB_CACHE[l.crabId];
                if (!crab) return null;
                const bp = crabBaseBP(crab);
                const faction = FACTIONS[crab.faction];
                const classDef = CLASSES[crab.classId];
                const canAfford = player.gold >= l.hireFee;
                return (
                  <GradientCard
                    key={l.id}
                    faction={crab.faction}
                    className="p-2.5"
                  >
                    <div
                      className="grid grid-cols-[auto_1fr_auto_auto] gap-3 items-center"
                      style={{ minHeight: 88, maxHeight: 96 }}
                    >
                      {/* col 1: ~80px crab thumb */}
                      <div
                        className="flex items-center justify-center shrink-0"
                        style={{ width: 80, height: 80 }}
                      >
                        <CrabRenderer
                          crab={crab}
                          size={72}
                          animate={false}
                          showEmblem
                        />
                      </div>

                      {/* col 2: name + class + faction emblem + owner under name */}
                      <div className="min-w-0 flex flex-col gap-0.5">
                        <div className="flex items-center gap-1.5">
                          <span
                            className="font-bold text-sm truncate font-display"
                            style={{ color: faction.colors.light }}
                          >
                            {crab.name}
                          </span>
                          <FactionBadge faction={crab.faction} size={16} />
                        </div>
                        <div className="text-[10px] opacity-75 truncate">
                          {classDef.icon} {classDef.name} · Lv {crab.level} ·{" "}
                          {crab.purity}/18 purity
                        </div>
                        {/* Owner label, under name, with faction-tinted avatar */}
                        <div className="flex items-center gap-1 text-[11px] text-white/70 mt-0.5">
                          <span
                            className="inline-flex items-center justify-center rounded-full font-bold text-[9px] shrink-0"
                            style={{
                              width: 16,
                              height: 16,
                              background: faction.colors.primary + "33",
                              color: faction.colors.light,
                              border: `1px solid ${faction.colors.primary}66`,
                            }}
                            aria-hidden="true"
                          >
                            {l.ownerName.charAt(0).toUpperCase()}
                          </span>
                          <span className="truncate">{l.ownerName}</span>
                        </div>
                      </div>

                      {/* col 3: BP chip (hidden on small screens to keep row tidy) */}
                      <div className="hidden sm:block">
                        <StatChip
                          label="BP"
                          value={formatBP(bp)}
                          color="#FFD166"
                          icon={<GoldIcon size={10} />}
                        />
                      </div>

                      {/* col 4: fee + Hire button (right-aligned stack) */}
                      <div className="flex flex-col items-end gap-1 min-w-[100px] sm:min-w-[110px]">
                        <div
                          className="font-bold flex items-center gap-0.5 text-sm"
                          style={{ color: "#FFD166" }}
                        >
                          <GoldIcon size={14} />
                          {formatGold(l.hireFee)}
                        </div>
                        <GlowButton
                          variant={canAfford ? "gold" : "ghost"}
                          size="sm"
                          disabled={!canAfford}
                          onClick={() => hireCrab(l.id)}
                        >
                          Hire
                        </GlowButton>
                      </div>
                    </div>
                  </GradientCard>
                );
              })}
            </div>

            {/* Pagination footer */}
            <div className="flex items-center justify-between gap-2 mt-3 px-1">
              <span className="text-[11px] opacity-70">
                Page {safePage} of {totalPages} · {filteredListings.length}{" "}
                listings
              </span>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={safePage <= 1}
                  aria-label="Previous page"
                >
                  <ChevronLeft className="size-4" />
                  Prev
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setPage((p) => Math.min(totalPages, p + 1))
                  }
                  disabled={safePage >= totalPages}
                  aria-label="Next page"
                >
                  Next
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            </div>
          </>
        )}
      </section>

      {/* List modal */}
      {showList && (
        <Modal title="List Crab for Hire" onClose={() => setShowList(false)}>
          <div className="space-y-3">
            <div className="text-xs opacity-70">
              Pick an idle crab and set a hire fee. You earn the fee minus 10%
              platform fee (half burned).
              {avgFee > 0 && (
                <span className="block mt-1 text-[#7CF5E1]">
                  Market average: {formatGold(avgFee)} GOLD · Floor:{" "}
                  {formatGold(floorFee)} GOLD
                </span>
              )}
            </div>
            <div className="grid grid-cols-3 gap-2 max-h-[40vh] overflow-y-auto pr-1">
              {player.crabs
                .filter((c) => c.activity === "idle")
                .map((c) => {
                  const bp = crabBaseBP(c);
                  return (
                    <button
                      key={c.id}
                      onClick={() => {
                        setSelectedCrabId(c.id);
                        setFee(Math.max(50, Math.round(bp * 1.2)));
                      }}
                      className={`rounded-lg p-1 border transition-colors ${
                        selectedCrabId === c.id
                          ? "bg-[#12A7A0]/20 border-[#7CF5E1]"
                          : "bg-white/5 border-white/10"
                      }`}
                    >
                      <CrabRenderer crab={c} size={56} animate={false} />
                      <div className="text-[9px] truncate mt-1">{c.name}</div>
                      <div className="text-[9px] opacity-60">
                        BP {formatBP(bp)}
                      </div>
                    </button>
                  );
                })}
            </div>
            {selectedCrabId && (
              <div>
                <label className="text-xs opacity-70">Hire fee (GOLD)</label>
                <input
                  type="number"
                  value={fee}
                  onChange={(e) =>
                    setFee(Math.max(1, parseInt(e.target.value) || 0))
                  }
                  className="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white focus:outline-none focus:border-[#7CF5E1]"
                />
                <div className="text-[10px] opacity-60 mt-1">
                  You earn: {Math.round(fee * 0.9)} · Platform fee:{" "}
                  {Math.round(fee * 0.1)} (half burned)
                </div>
              </div>
            )}
            <GlowButton
              variant="teal"
              size="md"
              className="w-full"
              disabled={!selectedCrabId}
              onClick={handleList}
            >
              List for {fee} GOLD
            </GlowButton>
          </div>
        </Modal>
      )}
    </div>
  );
}

function StatBox({
  label,
  value,
  sub,
}: {
  label: string;
  value: React.ReactNode;
  sub?: string;
}) {
  return (
    <div
      className="rounded-lg p-2"
      style={{
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(124,245,225,0.14)",
      }}
    >
      <div className="text-[10px] opacity-60 uppercase">{label}</div>
      <div className="text-sm font-bold">{value}</div>
      {sub && <div className="text-[9px] opacity-50">{sub}</div>}
    </div>
  );
}
