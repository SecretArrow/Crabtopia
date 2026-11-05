// Crabtopia - Bazaar of Tides screen (grid marketplace)
"use client";

import { useState, useMemo } from "react";
import { useGame, NPC_CRAB_CACHE, NPC_EGG_CACHE } from "../../store/gameStore";
import { FACTIONS, FACTION_LIST } from "../../content/factions";
import { CLASSES, CLASS_LIST } from "../../content/classes";
import { BREEDS_BY_ID } from "../../content/breeds";
import { crabBaseBP, formatBP } from "../../engine/bp";
import {
  formatGold,
  GoldIcon,
  GlowButton,
  GradientCard,
  FactionBadge,
  ClassIcon,
  BreedDots,
  EmptyState,
  FACTION_BIOME_ART,
} from "../ui";
import { CONFIG } from "../../engine/config";
import {
  GENESIS_TOTAL,
  GENESIS_MARKET_COUNT,
  GENESIS_RESERVE_COUNT,
  generateGenesisCrabs,
  type GenesisCrab,
} from "../../engine/genesis";
import CrabRenderer from "../CrabRenderer";
import { ClassArtImage } from "../CrabArtImage";
import ElementBadge from "../ElementBadge";
import { resolveElement } from "../../engine/elements";
import { Modal } from "./MapScreen";
import { getGeneVariant, BODY_PART_SLOTS, RARITY_ORDER } from "../../content/bodyparts";
import type { FactionId, ClassId, Crab, BazaarListing, Egg, Rarity } from "../../types";

type SortKey = "price" | "bp" | "rarity";

const PAGE_SIZE = 9;

// Rarity fill colors (single source of truth for the badge)
const RARITY_FILL: Record<Rarity, string> = {
  common: "#8B9EB5",
  uncommon: "#4FB477",
  rare: "#7CF5E1",
  epic: "#7A5CFF",
  legendary: "#FFD166",
};

// ---------- Local RarityBadge (consistent pill) ----------
function RarityBadge({ rarity, className = "" }: { rarity: Rarity; className?: string }) {
  const fill = RARITY_FILL[rarity];
  const isLegendary = rarity === "legendary";
  const background = isLegendary
    ? "linear-gradient(135deg, #FFE9A8 0%, #FFD166 45%, #FF7A1A 100%)"
    : fill;
  return (
    <span
      className={`inline-flex items-center px-1.5 h-[18px] rounded-full text-[10px] uppercase font-bold tracking-wide text-white whitespace-nowrap ${className}`}
      style={{
        background,
        color: isLegendary ? "#3D2400" : "#FFFFFF",
        boxShadow: isLegendary
          ? "0 0 8px rgba(255,209,102,0.7), 0 1px 2px rgba(0,0,0,0.4)"
          : `0 1px 3px rgba(0,0,0,0.45), 0 0 6px ${fill}66`,
        textShadow: isLegendary ? "none" : "0 1px 1px rgba(0,0,0,0.5)",
      }}
    >
      {rarity}
    </span>
  );
}

export default function BazaarScreen() {
  const player = useGame((s) => s.player)!;
  const bazaarListings = useGame((s) => s.bazaarListings);
  const buyBazaarListing = useGame((s) => s.buyBazaarListing);
  const listCrabInBazaar = useGame((s) => s.listCrabInBazaar);
  const listEggInBazaar = useGame((s) => s.listEggInBazaar);
  const genesisSoldIds = useGame((s) => s.genesisSoldIds);
  const buyGenesisCrab = useGame((s) => s.buyGenesisCrab);
  // Deep-link: "insufficient crabs" guidance CTAs may request the Genesis
  // tab directly via a one-shot sessionStorage flag.
  const [tab, setTab] = useState<"market" | "genesis">(() => {
    try {
      const requested = sessionStorage.getItem("crabtopia-bazaar-tab");
      if (requested) {
        sessionStorage.removeItem("crabtopia-bazaar-tab");
        return requested === "genesis" ? "genesis" : "market";
      }
    } catch {
      // storage unavailable — default tab.
    }
    return "market";
  });

  // Search + filters (compact horizontal sticky bar)
  const [search, setSearch] = useState("");
  const [itemType, setItemType] = useState<"all" | "crab" | "egg">("all");
  const [factionFilter, setFactionFilter] = useState<FactionId | "all">("all");
  const [classFilter, setClassFilter] = useState<ClassId | "all">("all");
  const [rarityFilter, setRarityFilter] = useState<Rarity | "all">("all");
  const [sortKey, setSortKey] = useState<SortKey>("price");

  const [showSell, setShowSell] = useState(false);
  const [sellType, setSellType] = useState<"crab" | "egg">("crab");
  const [selectedCrabId, setSelectedCrabId] = useState<string | null>(null);
  const [selectedEggId, setSelectedEggId] = useState<string | null>(null);
  const [price, setPrice] = useState(5000);
  const [page, setPage] = useState(1);

  const filteredListings = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = bazaarListings.slice();
    if (itemType !== "all") list = list.filter((l) => l.itemType === itemType);

    list = list.filter((l) => {
      if (q) {
        const name = itemNameOf(l).toLowerCase();
        if (!name.includes(q)) return false;
      }
      if (l.itemType === "crab") {
        const c = NPC_CRAB_CACHE[l.itemId];
        if (!c) return false;
        if (factionFilter !== "all" && c.faction !== factionFilter) return false;
        if (classFilter !== "all" && c.classId !== classFilter) return false;
        if (rarityFilter !== "all" && topRarityOf(l) !== rarityFilter) return false;
      } else {
        // eggs: rarity filter only applies to legendary candidate eggs
        if (rarityFilter !== "all") {
          const e = NPC_EGG_CACHE[l.itemId];
          const isLeg = e?.isLegendaryCandidate ? "legendary" : "common";
          if (isLeg !== rarityFilter) return false;
        }
        if (factionFilter !== "all") {
          const e = NPC_EGG_CACHE[l.itemId];
          if (!e || e.faction !== factionFilter) return false;
        }
        if (classFilter !== "all") {
          const e = NPC_EGG_CACHE[l.itemId];
          if (!e || e.classId !== classFilter) return false;
        }
      }
      return true;
    });

    list.sort((a, b) => {
      if (sortKey === "price") return a.price - b.price;
      if (sortKey === "bp") {
        const ca = NPC_CRAB_CACHE[a.itemId];
        const cb = NPC_CRAB_CACHE[b.itemId];
        const bpa = ca ? crabBaseBP(ca) : 0;
        const bpb = cb ? crabBaseBP(cb) : 0;
        return bpb - bpa;
      }
      // rarity (descending)
      const ra = topRarityOf(a);
      const rb = topRarityOf(b);
      return RARITY_ORDER.indexOf(rb) - RARITY_ORDER.indexOf(ra);
    });
    return list;
  }, [bazaarListings, search, itemType, factionFilter, classFilter, rarityFilter, sortKey]);

  // Reset to page 1 whenever filters change
  const totalPages = Math.max(1, Math.ceil(filteredListings.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageItems = filteredListings.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE
  );

  // Recent activity feed: store does not expose recent sales, so derive a
  // "Recently listed" feed from the freshest bazaarListings (newest first).
  const recentFeed = useMemo(
    () =>
      [...bazaarListings]
        .sort((a, b) => b.listedAt - a.listedAt)
        .slice(0, 5)
        .map((l) => ({
          id: l.id,
          name: itemNameOf(l),
          price: l.price,
          ts: l.listedAt,
          itemType: l.itemType,
        })),
    [bazaarListings]
  );

  const resetFilters = () => {
    setSearch("");
    setItemType("all");
    setFactionFilter("all");
    setClassFilter("all");
    setRarityFilter("all");
    setSortKey("price");
    setPage(1);
  };

  const handleSell = () => {
    if (sellType === "crab" && selectedCrabId) {
      listCrabInBazaar(selectedCrabId, price);
    } else if (sellType === "egg" && selectedEggId) {
      listEggInBazaar(selectedEggId, price);
    }
    setShowSell(false);
    setSelectedCrabId(null);
    setSelectedEggId(null);
  };

  return (
    <div className="min-h-screen flex flex-col">
      <div className="space-y-3 max-w-6xl mx-auto w-full flex-1">
        {/* Header */}
        <div className="flex items-center justify-between gap-2">
          <div>
            <h1 className="text-xl md:text-2xl font-bold font-display">Bazaar of Tides</h1>
            <p className="text-xs opacity-70">
              Trade crabs &amp; eggs · {CONFIG.bazaarFeePercent * 100}% fee (sink)
            </p>
          </div>
          <GlowButton variant="gold" size="sm" onClick={() => setShowSell(true)}>
            + List Item
          </GlowButton>
        </div>

        {/* Market hero banner (new painted art) + living bubbles */}
        <div className="relative overflow-hidden rounded-xl h-24 md:h-32" aria-hidden="true">
          <img src="/art/market.png" alt="" className="absolute inset-0 w-full h-full object-cover" draggable={false} />
          <div className="absolute inset-0" style={{ background: "linear-gradient(90deg, rgba(4,16,31,0.75), transparent 60%)" }} />
          <Bubbles />
          <div className="relative z-10 h-full flex flex-col justify-center px-4">
            <div className="font-display font-bold text-white text-base md:text-xl" style={{ textShadow: "0 2px 8px rgba(0,0,0,0.6)" }}>
              Bazaar of Tides
            </div>
            <div className="text-[11px] text-white/85">Player market · Genesis Collection · auctions</div>
          </div>
        </div>

        {/* Tabs: player market / Genesis collection */}
        <div className="flex gap-2" role="tablist" aria-label="Bazaar sections">
          <button
            role="tab"
            aria-selected={tab === "market"}
            onClick={() => setTab("market")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${tab === "market" ? "text-white" : "text-white/65 hover:text-white"}`}
            style={{
              background: tab === "market" ? "linear-gradient(135deg, #12A7A0, #0A4A66)" : "rgba(255,255,255,0.05)",
              borderColor: tab === "market" ? "#7CF5E1" : "rgba(124,245,225,0.18)",
            }}
          >
            Market
          </button>
          <button
            role="tab"
            aria-selected={tab === "genesis"}
            onClick={() => setTab("genesis")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${tab === "genesis" ? "text-[#3D2400]" : "text-white/65 hover:text-white"}`}
            style={{
              background: tab === "genesis" ? "linear-gradient(135deg, #FFE9A8, #FFD166 55%, #FF7A1A)" : "rgba(255,255,255,0.05)",
              borderColor: tab === "genesis" ? "#FFD166" : "rgba(124,245,225,0.18)",
              boxShadow: tab === "genesis" ? "0 0 14px rgba(255,209,102,0.45)" : undefined,
            }}
          >
            ✨ Genesis Collection
          </button>
        </div>

        {tab === "market" && (
        <>
        {/* Stats */}
        <div className="grid grid-cols-3 gap-2">
          <StatBox label="Listings" value={bazaarListings.length} />
          <StatBox label="Your Gold" value={formatGold(player.gold)} gold />
          <StatBox label="Fee" value={`${CONFIG.bazaarFeePercent * 100}%`} />
        </div>

        {/* Recent sales banner (mobile) / sticky horizontal filter bar (all sizes) */}
        <RecentSalesBanner items={recentFeed} />

        {/* Sticky horizontal filter bar */}
        <div
          className="sticky top-0 z-10 rounded-xl p-2 flex flex-wrap gap-2 items-center"
          style={{
            background: "rgba(6,18,43,0.85)",
            backdropFilter: "blur(8px)",
            border: "1px solid rgba(124,245,225,0.18)",
          }}
        >
          {/* Search */}
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search…"
            className="h-8 text-xs px-2 rounded-md bg-white/10 border border-white/15 focus:outline-none focus:border-[#7CF5E1] min-w-[120px] flex-1"
          />

          {/* Type select */}
          <CompactSelect
            value={itemType}
            onChange={(v) => {
              setItemType(v as "all" | "crab" | "egg");
              setPage(1);
            }}
            options={[
              { value: "all", label: "All Types" },
              { value: "crab", label: "🦀 Crabs" },
              { value: "egg", label: "🥚 Eggs" },
            ]}
          />

          {/* Faction select */}
          <CompactSelect
            value={factionFilter}
            onChange={(v) => {
              setFactionFilter(v as FactionId | "all");
              setPage(1);
            }}
            options={[
              { value: "all", label: "All Factions" },
              ...FACTION_LIST.map((f) => ({ value: f.id, label: `${f.emblem} ${f.shortName}` })),
            ]}
          />

          {/* Class select */}
          <CompactSelect
            value={classFilter}
            onChange={(v) => {
              setClassFilter(v as ClassId | "all");
              setPage(1);
            }}
            options={[
              { value: "all", label: "All Classes" },
              ...CLASS_LIST.map((c) => ({ value: c.id, label: `${c.icon} ${c.name}` })),
            ]}
          />

          {/* Rarity select */}
          <CompactSelect
            value={rarityFilter}
            onChange={(v) => {
              setRarityFilter(v as Rarity | "all");
              setPage(1);
            }}
            options={[
              { value: "all", label: "All Rarities" },
              ...RARITY_ORDER.map((r) => ({ value: r, label: r[0].toUpperCase() + r.slice(1) })),
            ]}
          />

          {/* Sort select */}
          <CompactSelect
            value={sortKey}
            onChange={(v) => setSortKey(v as SortKey)}
            options={[
              { value: "price", label: "Price ↑" },
              { value: "bp", label: "BP ↓" },
              { value: "rarity", label: "Rarity ↓" },
            ]}
          />

          <button
            onClick={resetFilters}
            className="h-8 text-xs px-2 rounded-md bg-white/5 border border-white/10 hover:bg-white/10 transition-colors"
          >
            Reset
          </button>
        </div>

        {/* Main layout: listings grid + Recent Sales sidebar (desktop) */}
        <div className="flex gap-4 items-start">
          {/* Listings grid */}
          <div className="flex-1 min-w-0">
            {filteredListings.length === 0 ? (
              <EmptyState message="No listings match" hint="Try widening your filters." />
            ) : (
              <>
                <div className="text-xs opacity-60 mb-2">
                  {filteredListings.length} listing{filteredListings.length !== 1 ? "s" : ""}
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {pageItems.map((l) => (
                    <ListingCard
                      key={l.id}
                      listing={l}
                      playerGold={player.gold}
                      onBuy={() => buyBazaarListing(l.id)}
                    />
                  ))}
                </div>

                {/* Pagination footer */}
                <div className="flex items-center justify-between mt-3 pt-2 border-t border-white/10">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={safePage <= 1}
                    className="h-8 text-xs px-3 rounded-md bg-white/5 border border-white/10 disabled:opacity-40 hover:bg-white/10 transition-colors"
                  >
                    ← Prev
                  </button>
                  <span className="text-xs opacity-70">
                    Page {safePage} of {totalPages}
                  </span>
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={safePage >= totalPages}
                    className="h-8 text-xs px-3 rounded-md bg-white/5 border border-white/10 disabled:opacity-40 hover:bg-white/10 transition-colors"
                  >
                    Next →
                  </button>
                </div>
              </>
            )}
          </div>

          {/* Recent Sales sidebar (desktop) */}
          <aside className="hidden md:block w-56 shrink-0">
            <div
              className="rounded-xl p-3 sticky top-16"
              style={{
                background: "rgba(10,27,61,0.55)",
                border: "1px solid rgba(124,245,225,0.18)",
              }}
            >
              <div className="font-bold text-sm mb-2 font-display flex items-center gap-1">
                <span>📜</span> Recent Activity
              </div>
              <div className="space-y-2">
                {recentFeed.length === 0 ? (
                  <div className="text-xs opacity-60 py-2">No activity yet.</div>
                ) : (
                  recentFeed.map((it) => (
                    <div
                      key={it.id}
                      className="rounded-lg p-2"
                      style={{ background: "rgba(255,255,255,0.04)" }}
                    >
                      <div className="flex items-center gap-1 text-[11px]">
                        <span>{it.itemType === "egg" ? "🥚" : "🦀"}</span>
                        <span className="truncate font-semibold flex-1 min-w-0">{it.name}</span>
                      </div>
                      <div className="flex items-center justify-between mt-0.5">
                        <span
                          className="text-[11px] font-bold flex items-center gap-0.5"
                          style={{ color: "#FFD166" }}
                        >
                          <GoldIcon size={10} />
                          {formatGold(it.price)}
                        </span>
                        <span className="text-[9px] opacity-50">{timeAgo(it.ts)}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </aside>
        </div>
        </>
        )}
        {tab === "genesis" && (
          <GenesisPanel
            playerGold={player.gold}
            soldIds={genesisSoldIds}
            onBuy={buyGenesisCrab}
          />
        )}
      </div>

      {/* Sell modal */}
      {showSell && (
        <Modal title="List an Item" onClose={() => setShowSell(false)}>
          <div className="space-y-3">
            <div className="flex gap-2">
              <button
                onClick={() => setSellType("crab")}
                className={`flex-1 px-3 py-1.5 rounded-lg text-xs ${sellType === "crab" ? "bg-[#12A7A0] text-white" : "bg-white/5"}`}
              >
                🦀 Crab
              </button>
              <button
                onClick={() => setSellType("egg")}
                className={`flex-1 px-3 py-1.5 rounded-lg text-xs ${sellType === "egg" ? "bg-[#12A7A0] text-white" : "bg-white/5"}`}
              >
                🥚 Egg
              </button>
            </div>
            {sellType === "crab" ? (
              <>
                <div className="text-xs opacity-70">
                  Pick an idle, non-Rookie crab. Sale fee: {CONFIG.bazaarFeePercent * 100}% (removed from economy).
                </div>
                <div className="grid grid-cols-3 gap-2 max-h-[40vh] overflow-y-auto pr-1">
                  {player.crabs
                    .filter((c) => c.activity === "idle" && !c.isRookie)
                    .map((c) => {
                      const bp = crabBaseBP(c);
                      return (
                        <button
                          key={c.id}
                          onClick={() => {
                            setSelectedCrabId(c.id);
                            setPrice(Math.max(1000, Math.round(bp * 15)));
                          }}
                          className={`rounded-lg p-1 border transition-colors ${
                            selectedCrabId === c.id
                              ? "bg-[#12A7A0]/20 border-[#7CF5E1]"
                              : "bg-white/5 border-white/10"
                          }`}
                        >
                          <CrabRenderer crab={c} size={56} animate={false} />
                          <div className="text-[9px] truncate">{c.name}</div>
                          <div className="text-[9px] opacity-60">BP {formatBP(bp)}</div>
                        </button>
                      );
                    })}
                </div>
              </>
            ) : (
              <>
                <div className="text-xs opacity-70">Pick a ready-to-hatch egg or any egg to list.</div>
                {player.eggs.length === 0 ? (
                  <EmptyState message="No eggs to sell" hint="Breed crabs to create eggs." />
                ) : (
                  <div className="grid grid-cols-3 gap-2 max-h-[40vh] overflow-y-auto pr-1">
                    {player.eggs.map((e) => (
                      <button
                        key={e.id}
                        onClick={() => {
                          setSelectedEggId(e.id);
                          setPrice(5000);
                        }}
                        className={`rounded-lg p-1 border transition-colors ${
                          selectedEggId === e.id ? "bg-[#FFD166]/20 border-[#FFD166]" : "bg-white/5 border-white/10"
                        }`}
                      >
                        <EggArt size={40} legendary={e.isLegendaryCandidate} />
                        <div className="text-[9px] truncate">{e.name}</div>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
            {(selectedCrabId || selectedEggId) && (
              <div>
                <label className="text-xs opacity-70">Price (GOLD)</label>
                <input
                  type="number"
                  value={price}
                  onChange={(e) => setPrice(Math.max(1, parseInt(e.target.value) || 0))}
                  className="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white focus:outline-none focus:border-[#7CF5E1]"
                />
                <div className="text-[10px] opacity-60 mt-1">
                  You receive: {Math.round(price * (1 - CONFIG.bazaarFeePercent))} · Fee:{" "}
                  {Math.round(price * CONFIG.bazaarFeePercent)}
                </div>
              </div>
            )}
            <GlowButton
              variant="gold"
              size="md"
              className="w-full"
              disabled={!selectedCrabId && !selectedEggId}
              onClick={handleSell}
            >
              List for {price} GOLD
            </GlowButton>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ---------- Genesis Collection ----------

// Lightweight rising-bubble decoration (CSS animation, reduced-motion safe
// via the global prefers-reduced-motion rules in globals.css).
function Bubbles() {
  const bubbles = [
    { left: "6%", size: 10, delay: "0s", dur: "7s" },
    { left: "18%", size: 6, delay: "1.2s", dur: "9s" },
    { left: "34%", size: 14, delay: "0.6s", dur: "8s" },
    { left: "52%", size: 7, delay: "2s", dur: "10s" },
    { left: "68%", size: 11, delay: "0.3s", dur: "7.5s" },
    { left: "82%", size: 6, delay: "1.6s", dur: "9.5s" },
    { left: "93%", size: 9, delay: "2.4s", dur: "8.5s" },
  ];
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
      {bubbles.map((b, i) => (
        <span
          key={i}
          className="bubble-rise"
          style={{
            left: b.left,
            width: b.size,
            height: b.size,
            animationDelay: b.delay,
            animationDuration: b.dur,
          }}
        />
      ))}
    </div>
  );
}

function GenesisPanel({
  playerGold,
  soldIds,
  onBuy,
}: {
  playerGold: number;
  soldIds: string[];
  onBuy: (genesisNumber: number) => boolean;
}) {
  const [gPage, setGPage] = useState(1);
  const all = generateGenesisCrabs();
  const listed = all.filter((g) => g.listed);
  const soldSet = new Set(soldIds);
  const availableCount = listed.filter((g) => !soldSet.has(g.id)).length;
  const totalPages = Math.max(1, Math.ceil(listed.length / PAGE_SIZE));
  const safePage = Math.min(gPage, totalPages);
  const pageItems = listed.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  return (
    <section data-testid="genesis-section" className="space-y-3">
      <div>
        <h2 className="text-lg md:text-xl font-bold font-display">✨ Genesis Collection</h2>
        <p className="text-xs opacity-70">
          The original 333 Genesis Crabs. Only 30% (100) were ever listed on the
          market — the other 233 stay in the reserve vault and are not for sale.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <StatBox label="Total Supply" value={GENESIS_TOTAL} />
        <StatBox label="Listed on Market (30%)" value={GENESIS_MARKET_COUNT} />
        <StatBox label="Still Available" value={availableCount} />
        <StatBox label="Reserve · Not for Sale" value={GENESIS_RESERVE_COUNT} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {pageItems.map((g) => (
          <GenesisCard
            key={g.id}
            genesis={g}
            sold={soldSet.has(g.id)}
            playerGold={playerGold}
            onBuy={() => onBuy(g.genesisNumber)}
          />
        ))}
      </div>

      <div className="flex items-center justify-between mt-1 pt-2 border-t border-white/10">
        <button
          onClick={() => setGPage((p) => Math.max(1, p - 1))}
          disabled={safePage <= 1}
          className="h-8 text-xs px-3 rounded-md bg-white/5 border border-white/10 disabled:opacity-40 hover:bg-white/10 transition-colors"
        >
          ← Prev
        </button>
        <span className="text-xs opacity-70">
          Page {safePage} of {totalPages} · {GENESIS_MARKET_COUNT} listed Genesis Crabs
        </span>
        <button
          onClick={() => setGPage((p) => Math.min(totalPages, p + 1))}
          disabled={safePage >= totalPages}
          className="h-8 text-xs px-3 rounded-md bg-white/5 border border-white/10 disabled:opacity-40 hover:bg-white/10 transition-colors"
        >
          Next →
        </button>
      </div>

      <p className="text-[11px] opacity-60">
        Genesis #101–#333 are reserve stock: they are never listed, never
        discounted, and cannot be bought here. Buying a listed Genesis Crab
        pays the listed price; the {CONFIG.bazaarFeePercent * 100}% bazaar fee
        is sunk from the proceeds, exactly like a normal Bazaar trade.
      </p>
    </section>
  );
}

function GenesisCard({
  genesis,
  sold,
  playerGold,
  onBuy,
}: {
  genesis: GenesisCrab;
  sold: boolean;
  playerGold: number;
  onBuy: () => void;
}) {
  const faction = FACTIONS[genesis.faction];
  const classDef = CLASSES[genesis.classId];
  const fee = Math.round(genesis.price * CONFIG.bazaarFeePercent);
  const canAfford = playerGold >= genesis.price;
  const isLegendary = genesis.rarity === "legendary";

  return (
    <div
      className={`relative overflow-hidden rounded-xl border genesis-card ${
        isLegendary ? "legendary-shimmer animate-glow-pulse" : ""
      }`}
      style={{
        background: "rgba(10,27,61,0.6)",
        borderColor: isLegendary ? "#FFD166" : "rgba(255,209,102,0.35)",
      }}
      data-testid="genesis-card"
    >
      <div className="relative h-[110px] flex items-center justify-center overflow-hidden">
        <img
          src={FACTION_BIOME_ART[genesis.faction]}
          alt=""
          className="absolute inset-0 w-full h-full object-cover opacity-20 biome-vivid"
          draggable={false}
        />
        <div
          className="relative"
          style={{ filter: "drop-shadow(0 6px 10px rgba(0,0,0,0.45))" }}
          role="img"
          aria-label={genesis.name}
        >
          <ClassArtImage
            classId={genesis.classId}
            faction={genesis.faction}
            size={96}
          />
        </div>
        <div
          className="absolute top-1 left-1 px-1.5 py-0.5 rounded-md text-[10px] font-black"
          style={{ background: "#FFD166", color: "#3D2400" }}
        >
          #{genesis.genesisNumber}
        </div>
        {sold && (
          <div
            className="absolute top-1 right-1 px-1.5 py-0.5 rounded-md text-[10px] font-black uppercase"
            style={{ background: "#FF6F91", color: "#fff" }}
          >
            Sold
          </div>
        )}
      </div>
      <div className="p-2 space-y-1">
        <div className="flex items-center gap-1.5 min-w-0">
          <RarityBadge rarity={genesis.rarity} />
          <span
            className="text-sm font-bold font-display truncate"
            style={{ color: faction.colors.light }}
            title={genesis.name}
          >
            {genesis.name}
          </span>
        </div>
        <div className="text-[10px] opacity-70 truncate">
          {classDef.icon} {classDef.name} · {genesis.breedName} · {faction.emblem} {faction.shortName} · Lv {genesis.level}
        </div>
        <div>
          <ElementBadge
            element={resolveElement({
              classId: genesis.classId,
              faction: genesis.faction,
              breedId: genesis.breedId,
            })}
          />
        </div>
        <div className="flex items-center justify-between gap-2 pt-0.5">
          <span className="text-[11px] font-bold flex items-center gap-0.5" style={{ color: "#FFD166" }}>
            <GoldIcon size={11} />
            {formatGold(genesis.price)}
            <span className="text-[9px] opacity-50">fee {formatGold(fee)}</span>
          </span>
          {sold ? (
            <GlowButton variant="ghost" size="sm" disabled>
              Sold
            </GlowButton>
          ) : (
            <GlowButton
              variant={canAfford ? "gold" : "ghost"}
              size="sm"
              disabled={!canAfford}
              onClick={onBuy}
              title={canAfford ? `Buy Genesis #${genesis.genesisNumber}` : `Need ${formatGold(genesis.price)} GOLD`}
            >
              Buy
            </GlowButton>
          )}
        </div>
        {!sold && !canAfford && (
          <div className="text-[9px]" style={{ color: "#FF6F91" }}>
            Not enough GOLD — need {formatGold(genesis.price)}.
          </div>
        )}
      </div>
    </div>
  );
}

// ---------- Sub-components ----------

function StatBox({
  label,
  value,
  gold,
}: {
  label: string;
  value: React.ReactNode;
  gold?: boolean;
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
      <div
        className="text-sm font-bold flex items-center gap-0.5"
        style={{ color: gold ? "#FFD166" : undefined }}
      >
        {gold && <GoldIcon size={12} />}
        {value}
      </div>
    </div>
  );
}

function CompactSelect({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-8 text-xs px-2 rounded-md bg-white/10 border border-white/15 focus:outline-none focus:border-[#7CF5E1] max-w-[140px] truncate"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

function RecentSalesBanner({
  items,
}: {
  items: { id: string; name: string; price: number; ts: number; itemType: string }[];
}) {
  if (items.length === 0) return null;
  return (
    <div
      className="md:hidden rounded-xl p-2 flex items-center gap-2 overflow-x-auto"
      style={{
        background: "rgba(10,27,61,0.55)",
        border: "1px solid rgba(124,245,225,0.18)",
      }}
    >
      <span className="text-[10px] opacity-60 uppercase shrink-0">Recent</span>
      {items.map((it) => (
        <div
          key={it.id}
          className="shrink-0 rounded-md px-2 py-1 flex items-center gap-1"
          style={{ background: "rgba(255,255,255,0.05)" }}
        >
          <span className="text-[11px]">{it.itemType === "egg" ? "🥚" : "🦀"}</span>
          <span className="text-[11px] font-semibold truncate max-w-[80px]">{it.name}</span>
          <span className="text-[11px] font-bold flex items-center gap-0.5" style={{ color: "#FFD166" }}>
            <GoldIcon size={9} />
            {formatGold(it.price)}
          </span>
          <span className="text-[9px] opacity-50">{timeAgo(it.ts)}</span>
        </div>
      ))}
    </div>
  );
}

// CSS-built egg illustration (no image file). Ellipse with a glowing gradient
// background and a small crack overlay. Scales toward gold glow for rare eggs.
function EggArt({
  size = 120,
  legendary = false,
}: {
  size?: number;
  legendary?: boolean;
}) {
  const h = size;
  const w = Math.round(size * 0.78);
  const glow = legendary ? 22 : 12;
  const glowColor = legendary ? "rgba(255,209,102,0.85)" : "rgba(255,179,71,0.55)";
  return (
    <div
      className="relative animate-bob flex items-center justify-center"
      style={{ width: w, height: h, filter: `drop-shadow(0 0 ${glow}px ${glowColor})` }}
      aria-hidden="true"
    >
      {/* egg body: vertical gradient ellipse */}
      <div
        className="absolute inset-0 rounded-[50%]"
        style={{
          background: legendary
            ? "linear-gradient(180deg, #FFF3C8 0%, #FFE9A8 30%, #FFB347 75%, #FF7A1A 100%)"
            : "linear-gradient(180deg, #FFE9A8 0%, #FFB347 100%)",
          boxShadow: `inset 0 ${Math.round(size * 0.12)}px ${Math.round(
            size * 0.18
          )}px rgba(255,255,255,0.45), inset 0 -${Math.round(size * 0.08)}px ${Math.round(
            size * 0.16
          )}px rgba(120,60,0,0.35)`,
        }}
      />
      {/* highlight */}
      <div
        className="absolute rounded-[50%]"
        style={{
          width: Math.round(w * 0.28),
          height: Math.round(h * 0.32),
          top: Math.round(h * 0.14),
          left: Math.round(w * 0.22),
          background: "rgba(255,255,255,0.7)",
          filter: "blur(2px)",
        }}
      />
      {/* small crack overlay */}
      <svg
        className="absolute"
        width={w}
        height={h}
        viewBox={`0 0 ${w} ${h}`}
        style={{ overflow: "visible" }}
      >
        <path
          d={`M ${Math.round(w * 0.55)} ${Math.round(h * 0.35)} L ${Math.round(
            w * 0.62
          )} ${Math.round(h * 0.5)} L ${Math.round(w * 0.55)} ${Math.round(
            h * 0.62
          )} L ${Math.round(w * 0.62)} ${Math.round(h * 0.75)}`}
          stroke="rgba(60,30,0,0.35)"
          strokeWidth={Math.max(1, Math.round(size * 0.012))}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {/* fallback emoji, hidden behind CSS but present for screen readers / no-CSS */}
      <span className="sr-only">🥚</span>
    </div>
  );
}

function itemNameOf(l: BazaarListing): string {
  if (l.itemType === "crab") {
    return NPC_CRAB_CACHE[l.itemId]?.name ?? "Unknown Crab";
  }
  return NPC_EGG_CACHE[l.itemId]?.name ?? "Mystery Egg";
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}

function topRarityOf(l: BazaarListing): Rarity {
  if (l.itemType !== "crab") return "common";
  const c = NPC_CRAB_CACHE[l.itemId];
  if (!c) return "common";
  let top: Rarity = "common";
  for (const slot of BODY_PART_SLOTS) {
    const v = getGeneVariant(slot, c.genes[slot].D);
    if (v && RARITY_ORDER.indexOf(v.rarity) > RARITY_ORDER.indexOf(top)) {
      top = v.rarity;
    }
  }
  return top;
}

function ListingCard({
  listing,
  playerGold,
  onBuy,
}: {
  listing: BazaarListing;
  playerGold: number;
  onBuy: () => void;
}) {
  if (listing.itemType === "crab") {
    const crab = NPC_CRAB_CACHE[listing.itemId];
    if (!crab) return null;
    return <CrabListingCard listing={listing} crab={crab} playerGold={playerGold} onBuy={onBuy} />;
  }
  const egg = NPC_EGG_CACHE[listing.itemId];
  if (!egg) return null;
  return <EggListingCard listing={listing} egg={egg} playerGold={playerGold} onBuy={onBuy} />;
}

function CrabListingCard({
  listing,
  crab,
  playerGold,
  onBuy,
}: {
  listing: BazaarListing;
  crab: Crab;
  playerGold: number;
  onBuy: () => void;
}) {
  const bp = crabBaseBP(crab);
  const faction = FACTIONS[crab.faction];
  const classDef = CLASSES[crab.classId];
  const breed = BREEDS_BY_ID[crab.breedId];
  const fee = Math.round(listing.price * CONFIG.bazaarFeePercent);
  const canAfford = playerGold >= listing.price;

  // top rarity across gene slots
  let topRarity: Rarity = "common";
  for (const slot of BODY_PART_SLOTS) {
    const v = getGeneVariant(slot, crab.genes[slot].D);
    if (v && RARITY_ORDER.indexOf(v.rarity) > RARITY_ORDER.indexOf(topRarity)) {
      topRarity = v.rarity;
    }
  }

  return (
    <GradientCard faction={crab.faction} className="overflow-hidden" style={{ maxHeight: 220 }}>
      {/* Art area with badges */}
      <div className="relative h-[88px] flex items-center justify-center overflow-hidden">
        <img
          src={FACTION_BIOME_ART[faction.id]}
          alt=""
          className="absolute inset-0 w-full h-full object-cover opacity-15"
          draggable={false}
        />
        <CrabRenderer crab={crab} size={96} animate={false} />
        {/* faction emblem top-left */}
        <div className="absolute top-1 left-1">
          <FactionBadge faction={crab.faction} size={16} glow />
        </div>
        {/* BP badge top-right */}
        <div
          className="absolute top-1 right-1 px-1.5 py-0.5 rounded-md text-[10px] font-bold flex items-center gap-0.5"
          style={{ background: "#FFD166", color: "#0A1B3D" }}
        >
          <GoldIcon size={9} />
          {formatBP(bp)}
        </div>
      </div>

      {/* Body — grid layout: [info 1fr] [buy auto], all centered */}
      <div className="p-2 grid grid-cols-[auto_1fr_auto] gap-2 items-center">
        {/* col 1: rarity badge (auto) */}
        <RarityBadge rarity={topRarity} />

        {/* col 2: info (1fr) */}
        <div className="min-w-0">
          <div
            className="text-base font-bold font-display truncate leading-tight"
            style={{ color: faction.colors.light }}
            title={crab.name}
          >
            {crab.name}
          </div>
          <div className="text-[10px] opacity-70 flex items-center gap-1 truncate">
            <ClassIcon classId={crab.classId} size={12} />
            {classDef.name}
            {breed && <span className="opacity-60">· {breed.name}</span>}
          </div>
          <div className="mt-0.5">
            <ElementBadge crab={crab} />
          </div>
          <div className="text-[10px] opacity-60 flex items-center gap-1">
            <BreedDots count={crab.breedCount} />
            <span>
              Lv {crab.level} · {crab.purity}/18
            </span>
          </div>
          <div
            className="text-[11px] font-bold flex items-center gap-0.5 mt-0.5"
            style={{ color: "#FFD166" }}
          >
            <GoldIcon size={11} />
            {formatGold(listing.price)}
            <span className="text-[9px] opacity-50 ml-1">
              +{formatGold(fee)} fee · {listing.sellerName}
            </span>
          </div>
        </div>

        {/* col 3: Buy button (auto, vertically centered) */}
        <GlowButton
          variant={canAfford ? "teal" : "ghost"}
          size="sm"
          disabled={!canAfford}
          onClick={onBuy}
        >
          Buy
        </GlowButton>
      </div>
    </GradientCard>
  );
}

function EggListingCard({
  listing,
  egg,
  playerGold,
  onBuy,
}: {
  listing: BazaarListing;
  egg: Egg;
  playerGold: number;
  onBuy: () => void;
}) {
  const faction = FACTIONS[egg.faction];
  const classDef = CLASSES[egg.classId];
  const fee = Math.round(listing.price * CONFIG.bazaarFeePercent);
  const canAfford = playerGold >= listing.price;
  const rarity: Rarity = egg.isLegendaryCandidate ? "legendary" : "common";

  return (
    <GradientCard faction={egg.faction} className="overflow-hidden" style={{ maxHeight: 220 }}>
      <div className="relative h-[88px] flex items-center justify-center overflow-hidden">
        <img
          src={FACTION_BIOME_ART[faction.id]}
          alt=""
          className="absolute inset-0 w-full h-full object-cover opacity-15"
          draggable={false}
        />
        {/* CSS-built egg art instead of broken image */}
        <EggArt size={72} legendary={egg.isLegendaryCandidate} />
        <div className="absolute top-1 left-1">
          <FactionBadge faction={egg.faction} size={16} glow />
        </div>
        {egg.isLegendaryCandidate && (
          <div
            className="absolute top-1 right-1 px-1.5 py-0.5 rounded-md text-[9px] font-bold"
            style={{ background: "#FFD166", color: "#000" }}
          >
            ★ Leg.
          </div>
        )}
      </div>

      <div className="p-2 grid grid-cols-[auto_1fr_auto] gap-2 items-center">
        <RarityBadge rarity={rarity} />

        <div className="min-w-0">
          <div
            className="text-base font-bold font-display truncate leading-tight"
            style={{ color: faction.colors.light }}
            title={egg.name}
          >
            {egg.name}
          </div>
          <div className="text-[10px] opacity-70 flex items-center gap-1 truncate">
            <ClassIcon classId={egg.classId} size={12} />
            {classDef.name}
          </div>
          <div className="text-[10px] opacity-60">Mystery egg</div>
          <div
            className="text-[11px] font-bold flex items-center gap-0.5 mt-0.5"
            style={{ color: "#FFD166" }}
          >
            <GoldIcon size={11} />
            {formatGold(listing.price)}
            <span className="text-[9px] opacity-50 ml-1">
              +{formatGold(fee)} fee · {listing.sellerName}
            </span>
          </div>
        </div>

        <GlowButton
          variant={canAfford ? "teal" : "ghost"}
          size="sm"
          disabled={!canAfford}
          onClick={onBuy}
        >
          Buy
        </GlowButton>
      </div>
    </GradientCard>
  );
}
