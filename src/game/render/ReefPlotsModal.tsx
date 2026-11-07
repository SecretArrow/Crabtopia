// Crabtopia - Reef Plots Modal
// Self-contained modal for persistent reef land ownership (spec §4.10 & §10B).
// Players browse a 6×4 reef map, buy plots, build upgrades (Training Pool,
// Gold Garden, Gear Forge, Hatchery), earn passive GOLD/hr, and trade plots.
// All plot data is mocked locally — no plots slice exists in gameStore yet.

"use client";

import React, { useMemo, useState } from "react";
import { useGame } from "../store/gameStore";
import { FACTIONS, FACTION_LIST } from "../content/factions";
import { FactionId } from "../types";
import {
  GlassPanel,
  GlowButton,
  StatChip,
  SectionTitle,
  GoldIcon,
  formatGold,
  EmptyState,
} from "./ui";

// ---------- LOCAL TYPES ----------

type UpgradeId = "training_pool" | "gold_garden" | "gear_forge" | "hatchery";
type ViewKind = "map" | "mine" | "market";
type MarketSub = "buy" | "lease";
type SortMode = "price_asc" | "income_desc";

interface PlotUpgrade {
  id: UpgradeId;
  name: string;
  icon: string;
  cost: number;
  bonusDesc: string;
  level: 1 | 2 | 3;
}

interface Plot {
  id: string;
  coord: { x: number; y: number };
  biome: FactionId;
  ownerName: string | null;
  price: number;
  upgrades: PlotUpgrade[];
  incomePerHour: number;
  forSale: boolean;
  leasePrice?: number | null;
}

// ---------- UPGRADE DEFINITIONS ----------

interface UpgradeDef {
  id: UpgradeId;
  name: string;
  icon: string;
  bonusPerLevel: string;
  costs: [number, number, number]; // cost to reach L1, L2, L3
}

const UPGRADE_DEFS: Record<UpgradeId, UpgradeDef> = {
  training_pool: {
    id: "training_pool",
    name: "Training Pool",
    icon: "🏋️",
    bonusPerLevel: "+5% Coliseum XP per level",
    costs: [2000, 5000, 12000],
  },
  gold_garden: {
    id: "gold_garden",
    name: "Gold Garden",
    icon: "🌷",
    bonusPerLevel: "+50 GOLD/hr per level",
    costs: [2000, 5000, 12000],
  },
  gear_forge: {
    id: "gear_forge",
    name: "Gear Forge",
    icon: "⚒️",
    bonusPerLevel: "+5% gear drop chance per level",
    costs: [2500, 6000, 14000],
  },
  hatchery: {
    id: "hatchery",
    name: "Hatchery",
    icon: "🥚",
    bonusPerLevel: "-8% egg hatch time per level",
    costs: [3000, 7000, 16000],
  },
};

const UPGRADE_ORDER: UpgradeId[] = [
  "training_pool",
  "gold_garden",
  "gear_forge",
  "hatchery",
];

function upgradeCost(id: UpgradeId, currentLevel: number): number {
  if (currentLevel >= 3) return 0;
  return UPGRADE_DEFS[id].costs[currentLevel];
}

function upgradeLevelOf(plot: Plot, id: UpgradeId): number {
  const up = plot.upgrades.find((u) => u.id === id);
  return up ? up.level : 0;
}

// ---------- HELPERS ----------

const FACTION_ORDER: FactionId[] = [
  "coral_court",
  "cinderreef",
  "frostshelf",
  "mangrove",
  "stormwake",
  "moonpool",
];

const NPC_NAMES = [
  "Maris Tideborne",
  "Emberon Ironshell",
  "Aurora Glaze",
  "Rootkeeper Vorn",
  "Volt Krakenspire",
  "Selene Shimmerby",
  "Captain Rusk",
  "Reefmaster Calan",
];

const TOTAL_COLS = 6;
const TOTAL_ROWS = 4;

function coordLabel(p: Pick<Plot, "coord">): string {
  const colLetter = String.fromCharCode(65 + p.coord.x); // A-F
  return `${colLetter}-${p.coord.y + 1}`;
}

function hexAlpha(hex: string, alphaTwo: string): string {
  return `${hex}${alphaTwo}`;
}

function biomeGradient(biome: FactionId): string {
  const f = FACTIONS[biome];
  return `linear-gradient(150deg, ${f.colors.dark} 0%, ${hexAlpha(f.colors.primary, "33")} 60%, ${hexAlpha(f.colors.accent, "22")} 100%)`;
}

// ---------- MOCK DATA ----------

function buildInitialPlots(): Plot[] {
  const plots: Plot[] = [];
  // Deterministic distribution across 24 tiles.
  // 0..7  -> unowned & for sale   (8 tiles, appear in Market Buy)
  // 8..15 -> NPC-owned, some for-sale (Make Offer or Buy)
  // 16..23 -> NPC-owned & listed for lease (Market Lease)
  for (let y = 0; y < TOTAL_ROWS; y++) {
    for (let x = 0; x < TOTAL_COLS; x++) {
      const idx = y * TOTAL_COLS + x;
      const biome = FACTION_ORDER[(x * 2 + y * 3) % 6];
      const baseIncome = 40 + ((x + 1) * 13 + (y + 1) * 17) % 120; // 40..160
      let ownerName: string | null = null;
      let forSale = false;
      let leasePrice: number | null = null;
      let price = 1500 + ((x + 1) * 423 + (y + 1) * 619) % 4800; // 1500..6300

      // A couple of NPC-owned plots already have an upgrade or two.
      const upgrades: PlotUpgrade[] = [];

      if (idx < 8) {
        // Unowned & for sale.
        ownerName = null;
        forSale = true;
      } else if (idx < 16) {
        // NPC owned.
        ownerName = NPC_NAMES[idx % NPC_NAMES.length];
        forSale = idx % 5 === 0; // a few also for sale
        if (idx % 3 === 0) {
          upgrades.push(makeUpgrade("gold_garden", 1));
        }
        if (idx % 4 === 0) {
          upgrades.push(makeUpgrade("training_pool", 1));
        }
      } else {
        // NPC owned & listed for lease.
        ownerName = NPC_NAMES[(idx + 3) % NPC_NAMES.length];
        forSale = false;
        leasePrice = 180 + (idx - 16) * 65;
        if (idx % 2 === 0) {
          upgrades.push(makeUpgrade("gold_garden", 1));
        }
      }

      // Recompute income including Gold Garden bonus.
      const income = baseIncome + upgradeLevelOf({ upgrades } as Plot, "gold_garden") * 50;

      plots.push({
        id: `plot_${coordLabelFromXY(x, y)}`,
        coord: { x, y },
        biome,
        ownerName,
        price,
        upgrades,
        incomePerHour: income,
        forSale,
        leasePrice,
      });
    }
  }
  return plots;
}

function coordLabelFromXY(x: number, y: number): string {
  return `${String.fromCharCode(65 + x)}-${y + 1}`;
}

function makeUpgrade(id: UpgradeId, level: 1 | 2 | 3): PlotUpgrade {
  const def = UPGRADE_DEFS[id];
  return {
    id,
    name: def.name,
    icon: def.icon,
    cost: upgradeCost(id, level),
    bonusDesc: def.bonusPerLevel,
    level,
  };
}

// ---------- SUB-COMPONENTS ----------

function PlotTile({
  plot,
  ownedByPlayer,
  onClick,
}: {
  plot: Plot;
  ownedByPlayer: boolean;
  onClick: () => void;
}) {
  const f = FACTIONS[plot.biome];
  let icon = "🪸";
  let iconTitle = "Unowned";
  if (ownedByPlayer) {
    icon = "🏠";
    iconTitle = "Your plot";
  } else if (plot.forSale && !plot.ownerName) {
    icon = "💰";
    iconTitle = "For sale";
  } else if (plot.ownerName) {
    icon = "🦀";
    iconTitle = `Owned by ${plot.ownerName}`;
  }
  return (
    <button
      onClick={onClick}
      title={`${coordLabel(plot)} · ${iconTitle}`}
      className="relative aspect-square rounded-xl flex flex-col items-center justify-center transition-all duration-150 hover:-translate-y-0.5 hover:shadow-lg active:scale-95"
      style={{
        background: hexAlpha(f.colors.primary, "4D"),
        border: `1.5px solid ${hexAlpha(f.colors.accent, "66")}`,
        boxShadow: ownedByPlayer ? `0 0 12px ${f.colors.accent}66` : undefined,
      }}
    >
      <span className="text-base sm:text-lg leading-none">{icon}</span>
      <span
        className="text-[9px] font-bold mt-0.5"
        style={{ color: f.colors.light }}
      >
        {coordLabel(plot)}
      </span>
      {ownedByPlayer && (
        <span
          className="absolute -top-1 -right-1 w-2 h-2 rounded-full"
          style={{ background: f.colors.accent, boxShadow: `0 0 6px ${f.colors.accent}` }}
        />
      )}
    </button>
  );
}

function PlotCard({
  plot,
  ownedByPlayer,
  onPrimary,
  primaryLabel,
  primaryVariant = "teal",
  primaryDisabled,
  footer,
}: {
  plot: Plot;
  ownedByPlayer: boolean;
  onPrimary: () => void;
  primaryLabel: string;
  primaryVariant?: "teal" | "gold" | "rose" | "violet";
  primaryDisabled?: boolean;
  footer?: React.ReactNode;
}) {
  const f = FACTIONS[plot.biome];
  return (
    <GlassPanel className="p-3 flex flex-col gap-2" glow={`${f.colors.primary}33`}>
      <div className="flex items-start gap-2">
        <div
          className="w-9 h-9 rounded-lg flex items-center justify-center text-lg shrink-0"
          style={{
            background: hexAlpha(f.colors.primary, "33"),
            border: `1px solid ${hexAlpha(f.colors.accent, "55")}`,
          }}
          title={f.name}
        >
          {f.emblem}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-sm font-bold font-display">{coordLabel(plot)}</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded-md" style={{ background: hexAlpha(f.colors.primary, "33"), color: f.colors.accent }}>
              {f.shortName}
            </span>
            {ownedByPlayer && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-[#FFD166]/20 text-[#FFD166] font-bold">
                YOURS
              </span>
            )}
            {plot.ownerName && !ownedByPlayer && (
              <span className="text-[10px] text-white/55 truncate">
                {plot.ownerName}
              </span>
            )}
          </div>
          <div className="text-[11px] text-white/60 mt-0.5">{f.name}</div>
        </div>
      </div>

      <div className="flex items-center gap-1.5 flex-wrap">
        <StatChip
          label="Income"
          value={
            <span className="inline-flex items-center gap-1">
              <GoldIcon size={11} />
              {formatGold(plot.incomePerHour)}/hr
            </span>
          }
          color="#FFD166"
        />
        <StatChip
          label="Price"
          value={
            <span className="inline-flex items-center gap-1">
              <GoldIcon size={11} />
              {formatGold(plot.price)}
            </span>
          }
          color="#7CF5E1"
        />
        {plot.upgrades.length > 0 && (
          <div className="flex items-center gap-0.5">
            {plot.upgrades.map((u) => (
              <span
                key={u.id}
                className="inline-flex items-center justify-center rounded-md text-[11px] px-1"
                style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(124,245,225,0.18)" }}
                title={`${u.name} L${u.level}`}
              >
                {u.icon}
                <span className="ml-0.5 text-[8px] font-bold text-[#FFD166]">{u.level}</span>
              </span>
            ))}
          </div>
        )}
      </div>

      {footer}

      <GlowButton variant={primaryVariant} size="sm" onClick={onPrimary} disabled={primaryDisabled} className="w-full">
        {primaryLabel}
      </GlowButton>
    </GlassPanel>
  );
}

function UpgradeSlot({
  plot,
  upgradeId,
  onUpgrade,
}: {
  plot: Plot;
  upgradeId: UpgradeId;
  onUpgrade: (id: UpgradeId, cost: number, nextLevel: 1 | 2 | 3) => void;
}) {
  const def = UPGRADE_DEFS[upgradeId];
  const currentLevel = upgradeLevelOf(plot, upgradeId);
  const maxed = currentLevel >= 3;
  const cost = upgradeCost(upgradeId, currentLevel);
  const nextLevel = (Math.min(3, currentLevel + 1) as 1 | 2 | 3);

  return (
    <GlassPanel className="p-2.5 flex items-center gap-2">
      <div
        className="w-9 h-9 rounded-lg flex items-center justify-center text-lg shrink-0"
        style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(124,245,225,0.18)" }}
      >
        {def.icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-bold">{def.name}</span>
          <span className="inline-flex items-center gap-0.5">
            {[1, 2, 3].map((lvl) => (
              <span
                key={lvl}
                className="w-1.5 h-1.5 rounded-full"
                style={{
                  background: lvl <= currentLevel ? "#FFD166" : "rgba(255,255,255,0.18)",
                  boxShadow: lvl <= currentLevel ? "0 0 4px #FFD166" : undefined,
                }}
              />
            ))}
          </span>
        </div>
        <div className="text-[10px] text-white/60 leading-tight">{def.bonusPerLevel}</div>
      </div>
      {maxed ? (
        <span className="text-[10px] font-bold px-2 py-1 rounded-md bg-[#FFD166]/15 text-[#FFD166]">
          MAX
        </span>
      ) : (
        <GlowButton
          variant="gold"
          size="sm"
          onClick={() => onUpgrade(upgradeId, cost, nextLevel)}
          className="shrink-0"
        >
          <span className="inline-flex items-center gap-1">
            L{nextLevel}
            <GoldIcon size={11} />
            {formatGold(cost)}
          </span>
        </GlowButton>
      )}
    </GlassPanel>
  );
}

// ---------- MAIN COMPONENT ----------

export default function ReefPlotsModal({ onClose }: { onClose: () => void }) {
  const player = useGame((s) => s.player);
  const spendGold = useGame((s) => s.spendGold);
  const pushToast = useGame((s) => s.pushToast);
  const setScreen = useGame((s) => s.setScreen);

  const playerName = player?.name ?? "You";

  const [view, setView] = useState<ViewKind>("map");
  const [marketSub, setMarketSub] = useState<MarketSub>("buy");
  const [mockPlots, setMockPlots] = useState<Plot[]>(() => buildInitialPlots());
  const [ownedPlots, setOwnedPlots] = useState<Plot[]>([]);
  const [selectedPlotId, setSelectedPlotId] = useState<string | null>(null);
  const [drawerPlotId, setDrawerPlotId] = useState<string | null>(null);
  const [managePlotId, setManagePlotId] = useState<string | null>(null);
  const [leaseFormPlotId, setLeaseFormPlotId] = useState<string | null>(null);
  const [sellFormPlotId, setSellFormPlotId] = useState<string | null>(null);
  const [leasePriceInput, setLeasePriceInput] = useState<string>("500");
  const [sellPriceInput, setSellPriceInput] = useState<string>("2000");

  const [biomeFilter, setBiomeFilter] = useState<FactionId | "all">("all");
  const [sortMode, setSortMode] = useState<SortMode>("price_asc");

  const mockMarket = useMemo(
    () => mockPlots.filter((p) => p.forSale && !p.ownerName),
    [mockPlots]
  );
  const leaseMarket = useMemo(
    () => mockPlots.filter((p) => p.leasePrice && p.ownerName),
    [mockPlots]
  );

  const totalIncome = ownedPlots.reduce((sum, p) => sum + p.incomePerHour, 0);

  const isOwnedByPlayer = (plot: Plot): boolean =>
    ownedPlots.some((p) => p.id === plot.id);

  function findPlot(id: string | null): Plot | undefined {
    if (!id) return undefined;
    return (
      ownedPlots.find((p) => p.id === id) ??
      mockPlots.find((p) => p.id === id)
    );
  }

  // ---------- ACTIONS ----------

  function buyPlot(plot: Plot) {
    if (isOwnedByPlayer(plot)) {
      pushToast({ title: "You already own this plot.", variant: "warning" });
      return;
    }
    if (!spendGold(plot.price)) {
      pushToast({ title: "Not enough GOLD.", variant: "error" });
      return;
    }
    // Remove from mockPlots market pool (mark as owned + not for sale) and
    // add to ownedPlots.
    const acquired: Plot = {
      ...plot,
      ownerName: playerName,
      forSale: false,
      leasePrice: null,
    };
    setOwnedPlots((prev) => [...prev, acquired]);
    setMockPlots((prev) => prev.filter((p) => p.id !== plot.id));
    setDrawerPlotId(null);
    pushToast({
      title: `Plot ${coordLabel(plot)} acquired!`,
      description: `Now earning ${formatGold(plot.incomePerHour)} GOLD/hr.`,
      variant: "success",
    });
  }

  function leasePlot(plot: Plot) {
    const weekly = plot.leasePrice ?? 0;
    if (!spendGold(weekly)) {
      pushToast({ title: "Not enough GOLD.", variant: "error" });
      return;
    }
    pushToast({
      title: `Leased ${coordLabel(plot)} for 7 days.`,
      description: `Paid ${formatGold(weekly)} GOLD to ${plot.ownerName}.`,
      variant: "success",
    });
  }

  function makeOffer(plot: Plot) {
    pushToast({
      title: `Offer sent to ${plot.ownerName}.`,
      description: `You'll be notified if they accept.`,
      variant: "default",
    });
    setDrawerPlotId(null);
  }

  function upgradePlot(plot: Plot, id: UpgradeId, cost: number, nextLevel: 1 | 2 | 3) {
    if (!spendGold(cost)) {
      pushToast({ title: "Not enough GOLD.", variant: "error" });
      return;
    }
    const def = UPGRADE_DEFS[id];
    setOwnedPlots((prev) =>
      prev.map((p) => {
        if (p.id !== plot.id) return p;
        const others = p.upgrades.filter((u) => u.id !== id);
        const newUpgrade: PlotUpgrade = {
          id,
          name: def.name,
          icon: def.icon,
          cost: upgradeCost(id, nextLevel),
          bonusDesc: def.bonusPerLevel,
          level: nextLevel,
        };
        const incomeBump = id === "gold_garden" ? 50 : 0;
        return {
          ...p,
          upgrades: [...others, newUpgrade],
          incomePerHour: p.incomePerHour + incomeBump,
        };
      })
    );
    pushToast({
      title: `Upgraded ${def.name} to L${nextLevel}!`,
      description: def.bonusPerLevel,
      variant: "success",
    });
  }

  function listForLease(plot: Plot, weekly: number) {
    setOwnedPlots((prev) =>
      prev.map((p) => (p.id === plot.id ? { ...p, leasePrice: weekly } : p))
    );
    setLeaseFormPlotId(null);
    pushToast({
      title: `Plot listed for lease.`,
      description: `${coordLabel(plot)} · ${formatGold(weekly)} GOLD/week.`,
      variant: "success",
    });
  }

  function listForSale(plot: Plot, price: number) {
    setOwnedPlots((prev) =>
      prev.map((p) => (p.id === plot.id ? { ...p, forSale: true, price } : p))
    );
    setSellFormPlotId(null);
    pushToast({
      title: `Plot listed for sale.`,
      description: `${coordLabel(plot)} · ${formatGold(price)} GOLD.`,
      variant: "success",
    });
  }

  // ---------- RENDER ----------

  const drawerPlot = findPlot(drawerPlotId);
  const managePlot = findPlot(managePlotId);
  const leaseFormPlot = findPlot(leaseFormPlotId);
  const sellFormPlot = findPlot(sellFormPlotId);

  const tabs: Array<{ id: ViewKind; label: string; icon: string }> = [
    { id: "map", label: "Reef Map", icon: "🗺️" },
    { id: "mine", label: "My Plots", icon: "🏠" },
    { id: "market", label: "Plot Market", icon: "💰" },
  ];

  return (
    <div
      className="modal-backdrop-enter fixed inset-0 z-[150] flex items-center justify-center p-3 sm:p-4"
      style={{ background: "rgba(2,12,28,0.78)", backdropFilter: "blur(8px)" }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Reef Plots"
    >
      <div
        className="w-full max-w-3xl max-h-[88vh] overflow-y-auto rounded-3xl"
        style={{
          borderColor: "rgba(124,245,225,0.22)",
          background: "linear-gradient(180deg, rgba(6,18,43,0.97), rgba(4,12,30,0.93))",
          backdropFilter: "blur(6px)",
          boxShadow: "0 16px 80px rgba(18,167,160,0.28), 0 0 40px rgba(124,245,225,0.08)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 z-20 flex items-center justify-between gap-2 px-4 py-3 border-b border-white/10"
          style={{ background: "rgba(6,18,43,0.92)", backdropFilter: "blur(6px)" }}
        >
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-xl">🪸</span>
            <div className="min-w-0">
              <div className="font-bold font-display text-sm sm:text-base truncate">Reef Plots</div>
              <div className="text-[10px] text-white/55 truncate">
                Persistent reef land · {ownedPlots.length} held · {formatGold(totalIncome)} GOLD/hr
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <StatChip
              label="Balance"
              value={
                <span className="inline-flex items-center gap-1">
                  <GoldIcon size={12} />
                  {formatGold(player?.gold ?? 0)}
                </span>
              }
              color="#FFD166"
            />
            <button
              onClick={onClose}
              className="text-white/60 hover:text-white w-8 h-8 flex items-center justify-center rounded-md hover:bg-white/10"
              aria-label="Close"
            >
              ✕
            </button>
          </div>
        </div>

        {/* View tabs */}
        <div className="px-4 pt-3">
          <div className="flex flex-wrap gap-1.5">
            {tabs.map((t) => (
              <button
                key={t.id}
                onClick={() => setView(t.id)}
                className="px-3 py-1.5 rounded-xl text-xs font-bold transition-all"
                style={{
                  background: view === t.id ? "linear-gradient(135deg, #12A7A0, #0A4A66)" : "rgba(255,255,255,0.05)",
                  color: view === t.id ? "#EAF6FF" : "rgba(234,246,255,0.7)",
                  border: view === t.id ? "none" : "1px solid rgba(124,245,225,0.15)",
                  boxShadow: view === t.id ? "0 4px 14px rgba(18,167,160,0.4)" : "none",
                }}
              >
                <span className="mr-1">{t.icon}</span>
                {t.label}
                {t.id === "mine" && ownedPlots.length > 0 && (
                  <span className="ml-1 text-[9px] px-1 rounded bg-[#FFD166]/25 text-[#FFD166]">
                    {ownedPlots.length}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Body */}
        <div className="p-4">
          {view === "map" && (
            <ReefMapView
              mockPlots={mockPlots}
              ownedPlots={ownedPlots}
              totalIncome={totalIncome}
              onTileClick={(id) => setDrawerPlotId(id)}
            />
          )}

          {view === "mine" && (
            <MyPlotsView
              ownedPlots={ownedPlots}
              totalIncome={totalIncome}
              onManage={(id) => {
                setSelectedPlotId(id);
                setManagePlotId(id);
              }}
              onGoToMarket={() => setView("market")}
            />
          )}

          {view === "market" && (
            <PlotMarketView
              sub={marketSub}
              setSub={setMarketSub}
              mockMarket={mockMarket}
              leaseMarket={leaseMarket}
              biomeFilter={biomeFilter}
              setBiomeFilter={setBiomeFilter}
              sortMode={sortMode}
              setSortMode={setSortMode}
              onBuy={buyPlot}
              onLease={leasePlot}
            />
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-white/10 flex items-center justify-between gap-3 sticky bottom-0"
          style={{ background: "rgba(6,18,43,0.92)", backdropFilter: "blur(6px)" }}
        >
          <div className="text-[10px] text-white/45 leading-tight max-w-[60%]">
            Reef Plots are server-persisted. Trades are atomic. Anti-laundering caps apply.
          </div>
          <div className="flex items-center gap-2">
            <GlowButton variant="ghost" size="sm" onClick={() => setScreen("map")}>
              Open Reef Map
            </GlowButton>
            <GlowButton variant="teal" size="sm" onClick={onClose}>
              Close
            </GlowButton>
          </div>
        </div>
      </div>

      {/* Plot detail drawer (from map click) */}
      {drawerPlot && (
        <PlotDetailDrawer
          plot={drawerPlot}
          ownedByPlayer={isOwnedByPlayer(drawerPlot)}
          onClose={() => setDrawerPlotId(null)}
          onBuy={() => buyPlot(drawerPlot)}
          onManage={() => {
            setSelectedPlotId(drawerPlot.id);
            setManagePlotId(drawerPlot.id);
            setView("mine");
            setDrawerPlotId(null);
          }}
          onMakeOffer={() => makeOffer(drawerPlot)}
        />
      )}

      {/* Manage panel (overlay) */}
      {managePlot && (
        <ManageOverlay
          plot={managePlot}
          onClose={() => setManagePlotId(null)}
          onUpgrade={(id, cost, lvl) => upgradePlot(managePlot, id, cost, lvl)}
          onOpenLeaseForm={() => {
            setLeasePriceInput("500");
            setLeaseFormPlotId(managePlot.id);
          }}
          onOpenSellForm={() => {
            setSellPriceInput(String(managePlot.price));
            setSellFormPlotId(managePlot.id);
          }}
        />
      )}

      {/* Lease form */}
      {leaseFormPlot && (
        <PriceFormOverlay
          title={`List ${coordLabel(leaseFormPlot)} for lease`}
          description="Set a weekly lease price. Other players can rent your plot for 7 days."
          initialPrice={leasePriceInput}
          onPriceChange={setLeasePriceInput}
          submitLabel="List for lease"
          submitVariant="teal"
          onClose={() => setLeaseFormPlotId(null)}
          onSubmit={() => {
            const v = parseInt(leasePriceInput, 10);
            if (!Number.isFinite(v) || v <= 0) {
              pushToast({ title: "Enter a valid weekly price.", variant: "error" });
              return;
            }
            listForLease(leaseFormPlot, v);
          }}
        />
      )}

      {/* Sell form */}
      {sellFormPlot && (
        <PriceFormOverlay
          title={`List ${coordLabel(sellFormPlot)} for sale`}
          description="Set a sale price. The plot will appear in the Plot Market for other players."
          initialPrice={sellPriceInput}
          onPriceChange={setSellPriceInput}
          submitLabel="List for sale"
          submitVariant="gold"
          onClose={() => setSellFormPlotId(null)}
          onSubmit={() => {
            const v = parseInt(sellPriceInput, 10);
            if (!Number.isFinite(v) || v <= 0) {
              pushToast({ title: "Enter a valid sale price.", variant: "error" });
              return;
            }
            listForSale(sellFormPlot, v);
          }}
        />
      )}
    </div>
  );
}

// ---------- VIEW: REEF MAP ----------

function ReefMapView({
  mockPlots,
  ownedPlots,
  totalIncome,
  onTileClick,
}: {
  mockPlots: Plot[];
  ownedPlots: Plot[];
  totalIncome: number;
  onTileClick: (id: string) => void;
}) {
  const ownedIds = useMemo(() => new Set(ownedPlots.map((p) => p.id)), [ownedPlots]);

  const legend = [
    { icon: "🏠", label: "Owned", color: "#FFD166" },
    { icon: "💰", label: "For sale", color: "#7CF5E1" },
    { icon: "🦀", label: "NPC-owned", color: "#FF6F91" },
    { icon: "🪸", label: "Unowned", color: "#5C7CFF" },
  ];

  return (
    <div className="flex flex-col gap-3">
      <GlassPanel className="p-3 flex items-center justify-between gap-2 flex-wrap" glow="rgba(18,167,160,0.25)">
        <div className="text-xs">
          <span className="text-white/60">Your holdings: </span>
          <span className="font-bold text-[#FFD166]">{ownedPlots.length}</span>
          <span className="text-white/60"> plots · </span>
          <span className="font-bold text-[#7CF5E1] inline-flex items-center gap-1">
            <GoldIcon size={12} />
            {formatGold(totalIncome)}
          </span>
          <span className="text-white/60">/hr passive income</span>
        </div>
        <div className="text-[10px] text-white/55">
          Total income: {formatGold(totalIncome)} GOLD/hr · Next collection in 1h 23m
        </div>
      </GlassPanel>

      <SectionTitle
        icon={<span>🗺️</span>}
        title="Reef Map"
        action={
          <div className="flex items-center gap-2 flex-wrap">
            {legend.map((l) => (
              <span key={l.label} className="inline-flex items-center gap-1 text-[10px] text-white/70">
                <span>{l.icon}</span>
                <span style={{ color: l.color }}>{l.label}</span>
              </span>
            ))}
          </div>
        }
      />

      <div
        className="grid gap-2"
        style={{ gridTemplateColumns: "repeat(6, minmax(0, 1fr))" }}
      >
        {mockPlots.map((p) => (
          <PlotTile
            key={p.id}
            plot={p}
            ownedByPlayer={ownedIds.has(p.id)}
            onClick={() => onTileClick(p.id)}
          />
        ))}
      </div>

      <div className="text-[10px] text-white/45 text-center">
        Click any tile to inspect. {mockPlots.length} plots across the reef.
      </div>
    </div>
  );
}

// ---------- VIEW: MY PLOTS ----------

function MyPlotsView({
  ownedPlots,
  totalIncome,
  onManage,
  onGoToMarket,
}: {
  ownedPlots: Plot[];
  totalIncome: number;
  onManage: (id: string) => void;
  onGoToMarket: () => void;
}) {
  if (ownedPlots.length === 0) {
    return (
      <EmptyState
        message="You don't own any reef plots yet."
        hint="Visit the Plot Market to claim your first plot and start earning passive GOLD/hr."
        cta={
          <GlowButton variant="gold" size="sm" onClick={onGoToMarket}>
            Go to Plot Market
          </GlowButton>
        }
      />
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <GlassPanel className="p-3 flex items-center justify-between gap-2 flex-wrap" glow="rgba(255,209,102,0.18)">
        <SectionTitle
          icon={<span>🏠</span>}
          title={`My Plots (${ownedPlots.length})`}
        />
        <div className="text-[10px] text-white/55">
          Total income: <span className="text-[#FFD166] font-bold inline-flex items-center gap-1">
            <GoldIcon size={11} />
            {formatGold(totalIncome)}
          </span> /hr · Next collection in 1h 23m
        </div>
      </GlassPanel>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {ownedPlots.map((p) => (
          <PlotCard
            key={p.id}
            plot={p}
            ownedByPlayer
            onPrimary={() => onManage(p.id)}
            primaryLabel="Manage"
            primaryVariant="teal"
          />
        ))}
      </div>
    </div>
  );
}

// ---------- VIEW: PLOT MARKET ----------

function PlotMarketView({
  sub,
  setSub,
  mockMarket,
  leaseMarket,
  biomeFilter,
  setBiomeFilter,
  sortMode,
  setSortMode,
  onBuy,
  onLease,
}: {
  sub: MarketSub;
  setSub: (s: MarketSub) => void;
  mockMarket: Plot[];
  leaseMarket: Plot[];
  biomeFilter: FactionId | "all";
  setBiomeFilter: (f: FactionId | "all") => void;
  sortMode: SortMode;
  setSortMode: (s: SortMode) => void;
  onBuy: (p: Plot) => void;
  onLease: (p: Plot) => void;
}) {
  const buyList = useMemo(() => {
    let list = biomeFilter === "all"
      ? [...mockMarket]
      : mockMarket.filter((p) => p.biome === biomeFilter);
    if (sortMode === "price_asc") list.sort((a, b) => a.price - b.price);
    else list.sort((a, b) => b.incomePerHour - a.incomePerHour);
    return list;
  }, [mockMarket, biomeFilter, sortMode]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-1.5">
        <button
          onClick={() => setSub("buy")}
          className="px-3 py-1.5 rounded-lg text-xs font-bold transition-all"
          style={{
            background: sub === "buy" ? "linear-gradient(135deg, #12A7A0, #0A4A66)" : "rgba(255,255,255,0.05)",
            color: sub === "buy" ? "#EAF6FF" : "rgba(234,246,255,0.7)",
            border: sub === "buy" ? "none" : "1px solid rgba(124,245,225,0.15)",
          }}
        >
          💰 Buy ({mockMarket.length})
        </button>
        <button
          onClick={() => setSub("lease")}
          className="px-3 py-1.5 rounded-lg text-xs font-bold transition-all"
          style={{
            background: sub === "lease" ? "linear-gradient(135deg, #7A5CFF, #5C7CFF)" : "rgba(255,255,255,0.05)",
            color: sub === "lease" ? "#FFFFFF" : "rgba(234,246,255,0.7)",
            border: sub === "lease" ? "none" : "1px solid rgba(124,245,225,0.15)",
          }}
        >
          📜 Lease Available ({leaseMarket.length})
        </button>
      </div>

      {sub === "buy" && (
        <>
          <GlassPanel className="p-2.5 flex items-center gap-2 flex-wrap">
            <span className="text-[10px] text-white/55 uppercase tracking-wide">Biome</span>
            <select
              value={biomeFilter}
              onChange={(e) => setBiomeFilter(e.target.value as FactionId | "all")}
              className="text-xs rounded-md px-2 py-1 bg-[#0A1B3D] border border-white/15 text-white"
            >
              <option value="all">All biomes</option>
              {FACTION_LIST.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
            <span className="text-[10px] text-white/55 uppercase tracking-wide ml-2">Sort</span>
            <select
              value={sortMode}
              onChange={(e) => setSortMode(e.target.value as SortMode)}
              className="text-xs rounded-md px-2 py-1 bg-[#0A1B3D] border border-white/15 text-white"
            >
              <option value="price_asc">Price: low → high</option>
              <option value="income_desc">Income: high → low</option>
            </select>
          </GlassPanel>

          {buyList.length === 0 ? (
            <EmptyState
              compact
              message="No plots match your filters."
              hint="Try a different biome or check back later."
            />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {buyList.map((p) => (
                <PlotCard
                  key={p.id}
                  plot={p}
                  ownedByPlayer={false}
                  onPrimary={() => onBuy(p)}
                  primaryLabel={`Buy for ${formatGold(p.price)} GOLD`}
                  primaryVariant="gold"
                />
              ))}
            </div>
          )}
        </>
      )}

      {sub === "lease" && (
        <>
          {leaseMarket.length === 0 ? (
            <EmptyState
              compact
              message="No plots available for lease right now."
              hint="Other players' lease listings will appear here."
            />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {leaseMarket.map((p) => (
                <PlotCard
                  key={p.id}
                  plot={p}
                  ownedByPlayer={false}
                  onPrimary={() => onLease(p)}
                  primaryLabel={`Lease · ${formatGold(p.leasePrice ?? 0)}/wk`}
                  primaryVariant="violet"
                  footer={
                    <div className="text-[10px] text-white/55">
                      Leased by {p.ownerName}
                    </div>
                  }
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ---------- OVERLAY: PLOT DETAIL DRAWER ----------

function PlotDetailDrawer({
  plot,
  ownedByPlayer,
  onClose,
  onBuy,
  onManage,
  onMakeOffer,
}: {
  plot: Plot;
  ownedByPlayer: boolean;
  onClose: () => void;
  onBuy: () => void;
  onManage: () => void;
  onMakeOffer: () => void;
}) {
  const f = FACTIONS[plot.biome];
  const forSale = plot.forSale && !plot.ownerName;
  const npcOwned = !!plot.ownerName && !ownedByPlayer && !plot.forSale;

  return (
    <div
      className="modal-backdrop-enter fixed inset-0 z-[160] flex items-center justify-center p-3"
      style={{ background: "rgba(2,12,28,0.6)", backdropFilter: "blur(4px)" }}
      onClick={onClose}
    >
      <GlassPanel
        className="w-full max-w-md p-0 overflow-y-auto max-h-[88vh]"
        glow={`${f.colors.primary}55`}
      >
        {/* Biome art header */}
        <div
          className="h-28 relative"
          style={{ background: biomeGradient(plot.biome) }}
        >
          <div className="absolute inset-0 flex items-center justify-center text-5xl opacity-90">
            {f.emblem}
          </div>
          <button
            onClick={onClose}
            className="absolute top-2 right-2 text-white/70 hover:text-white w-7 h-7 flex items-center justify-center rounded-md bg-black/30 hover:bg-black/50"
            aria-label="Close"
          >
            ✕
          </button>
          <div
            className="absolute bottom-2 left-3 px-2 py-0.5 rounded-md text-xs font-bold"
            style={{ background: hexAlpha(f.colors.dark, "CC"), color: f.colors.light }}
          >
            {coordLabel(plot)}
          </div>
        </div>

        <div className="p-3 flex flex-col gap-2.5">
          <div>
            <div className="text-sm font-bold font-display flex items-center gap-2">
              <span>{f.name}</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded-md" style={{ background: hexAlpha(f.colors.primary, "33"), color: f.colors.accent }}>
                {f.biome}
              </span>
            </div>
            <div className="text-[11px] text-white/55 mt-0.5">
              Owner: {ownedByPlayer ? "You" : plot.ownerName ?? "Unowned"}
            </div>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            <StatChip
              label="Income"
              value={
                <span className="inline-flex items-center gap-1">
                  <GoldIcon size={11} />
                  {formatGold(plot.incomePerHour)}/hr
                </span>
              }
              color="#FFD166"
            />
            {forSale && (
              <StatChip
                label="Price"
                value={
                  <span className="inline-flex items-center gap-1">
                    <GoldIcon size={11} />
                    {formatGold(plot.price)}
                  </span>
                }
                color="#7CF5E1"
              />
            )}
            {plot.leasePrice && (
              <StatChip
                label="Lease"
                value={
                  <span className="inline-flex items-center gap-1">
                    <GoldIcon size={11} />
                    {formatGold(plot.leasePrice)}/wk
                  </span>
                }
                color="#7A5CFF"
              />
            )}
          </div>

          <div>
            <div className="text-[10px] uppercase tracking-wide text-white/55 mb-1">Upgrades</div>
            {plot.upgrades.length === 0 ? (
              <div className="text-[11px] text-white/45 italic">No upgrades built yet.</div>
            ) : (
              <div className="flex items-center gap-1.5 flex-wrap">
                {plot.upgrades.map((u) => (
                  <span
                    key={u.id}
                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[11px]"
                    style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(124,245,225,0.18)" }}
                    title={`${u.name} L${u.level} · ${u.bonusDesc}`}
                  >
                    {u.icon}
                    <span className="text-[9px] font-bold text-[#FFD166]">L{u.level}</span>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-1.5 mt-1">
            {ownedByPlayer && (
              <GlowButton variant="teal" onClick={onManage} className="w-full">
                Manage plot
              </GlowButton>
            )}
            {forSale && (
              <GlowButton variant="gold" onClick={onBuy} className="w-full">
                <span className="inline-flex items-center gap-1">
                  Buy for {formatGold(plot.price)} GOLD
                  <GoldIcon size={13} />
                </span>
              </GlowButton>
            )}
            {npcOwned && (
              <GlowButton variant="violet" onClick={onMakeOffer} className="w-full">
                Make offer to {plot.ownerName}
              </GlowButton>
            )}
            <GlowButton variant="ghost" size="sm" onClick={onClose} className="w-full">
              Back to map
            </GlowButton>
          </div>
        </div>
      </GlassPanel>
    </div>
  );
}

// ---------- OVERLAY: MANAGE PANEL ----------

function ManageOverlay({
  plot,
  onClose,
  onUpgrade,
  onOpenLeaseForm,
  onOpenSellForm,
}: {
  plot: Plot;
  onClose: () => void;
  onUpgrade: (id: UpgradeId, cost: number, nextLevel: 1 | 2 | 3) => void;
  onOpenLeaseForm: () => void;
  onOpenSellForm: () => void;
}) {
  const f = FACTIONS[plot.biome];
  return (
    <div
      className="modal-backdrop-enter fixed inset-0 z-[160] flex items-center justify-center p-3"
      style={{ background: "rgba(2,12,28,0.7)", backdropFilter: "blur(4px)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg max-h-[88vh] overflow-y-auto rounded-2xl"
        style={{
          background: "linear-gradient(180deg, rgba(6,18,43,0.97), rgba(4,12,30,0.93))",
          border: `1px solid ${hexAlpha(f.colors.accent, "44")}`,
          boxShadow: `0 16px 60px ${hexAlpha(f.colors.primary, "44")}`,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="h-16 relative flex items-end px-3 pb-1.5"
          style={{ background: biomeGradient(plot.biome) }}
        >
          <div className="text-2xl mr-2">{f.emblem}</div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-bold font-display" style={{ color: f.colors.light }}>
              {coordLabel(plot)} · {f.shortName}
            </div>
            <div className="text-[10px]" style={{ color: f.colors.light, opacity: 0.8 }}>
              Income {formatGold(plot.incomePerHour)} GOLD/hr
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-white/70 hover:text-white w-7 h-7 flex items-center justify-center rounded-md bg-black/30 hover:bg-black/50"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="p-3 flex flex-col gap-3">
          <SectionTitle
            icon={<span>⚒️</span>}
            title="Upgrades"
            action={
              <span className="text-[10px] text-white/55">
                {plot.upgrades.length}/4 built
              </span>
            }
          />
          <div className="flex flex-col gap-2">
            {UPGRADE_ORDER.map((id) => (
              <UpgradeSlot
                key={id}
                plot={plot}
                upgradeId={id}
                onUpgrade={onUpgrade}
              />
            ))}
          </div>

          <SectionTitle icon={<span>🔄</span>} title="Trade" />
          <div className="grid grid-cols-2 gap-2">
            <GlowButton variant="teal" size="sm" onClick={onOpenLeaseForm}>
              Lease this plot
            </GlowButton>
            <GlowButton variant="rose" size="sm" onClick={onOpenSellForm}>
              Sell this plot
            </GlowButton>
          </div>

          <div className="text-[10px] text-white/45 text-center pt-1">
            Upgrades apply instantly. Trade listings are public to all reef citizens.
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------- OVERLAY: PRICE FORM (lease / sell) ----------

function PriceFormOverlay({
  title,
  description,
  initialPrice,
  onPriceChange,
  submitLabel,
  submitVariant,
  onClose,
  onSubmit,
}: {
  title: string;
  description: string;
  initialPrice: string;
  onPriceChange: (v: string) => void;
  submitLabel: string;
  submitVariant: "teal" | "gold";
  onClose: () => void;
  onSubmit: () => void;
}) {
  return (
    <div
      className="modal-backdrop-enter fixed inset-0 z-[170] flex items-center justify-center p-3"
      style={{ background: "rgba(2,12,28,0.7)", backdropFilter: "blur(4px)" }}
      onClick={onClose}
    >
      <GlassPanel className="w-full max-w-sm p-4" glow="rgba(124,245,225,0.25)">
        <SectionTitle icon={<span>🪙</span>} title={title} />
        <p className="text-[11px] text-white/60 mb-2">{description}</p>
        <label className="block text-[10px] uppercase tracking-wide text-white/55 mb-1">
          Price (GOLD)
        </label>
        <div className="flex items-center gap-2 mb-3">
          <GoldIcon size={16} />
          <input
            type="number"
            min={1}
            value={initialPrice}
            onChange={(e) => onPriceChange(e.target.value)}
            className="flex-1 rounded-md px-2 py-1.5 text-sm bg-[#0A1B3D] border border-white/15 text-white font-bold"
            autoFocus
          />
        </div>
        <div className="flex items-center gap-2">
          <GlowButton variant="ghost" size="sm" onClick={onClose} className="flex-1">
            Cancel
          </GlowButton>
          <GlowButton variant={submitVariant} size="sm" onClick={onSubmit} className="flex-1">
            {submitLabel}
          </GlowButton>
        </div>
      </GlassPanel>
    </div>
  );
}
