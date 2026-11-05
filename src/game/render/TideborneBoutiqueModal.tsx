// Crabtopia - Tideborne Boutique Modal (real-money styles only)
// Self-contained: catalog, exchange rates, and spending trackers are mock-local.
// Connects to gameStore only for player identity, read-only GOLD balance display,
// and pushToast feedback.
//
// HARD RULES (Crabtopia spec §3 & §9):
//  - Real-money purchases NEVER buy GOLD and there is no premium currency.
//  - Styles only. NEVER power, crabs, eggs, breeding, raid advantages, or GOLD.
//  - No loot boxes. No randomized rewards for sale. No hidden odds.
//  - Spending limits, purchase confirmations, regional compliance toggles.
//  - Refunds reverse only the purchased styles.
"use client";

import { useState } from "react";
import { useGame } from "../store/gameStore";
import {
  GlassPanel,
  GlowButton,
  GoldIcon,
  SectionTitle,
  StatChip,
  formatGold,
  EmptyState,
} from "./ui";
import { FACTIONS } from "../content/factions";
import { FactionId, Rarity } from "../types";

// ---------- Currency --------------------------------------------------
type Currency = "USD" | "IDR" | "EUR" | "JPY" | "BRL";

const EXCHANGE_RATES: Record<Currency, number> = {
  USD: 1,
  IDR: 15800,
  EUR: 0.92,
  JPY: 158,
  BRL: 5.4,
};

const CURRENCY_META: Record<
  Currency,
  { symbol: string; label: string; locale: string; decimals: number }
> = {
  USD: { symbol: "$", label: "USD", locale: "en-US", decimals: 2 },
  IDR: { symbol: "Rp", label: "IDR", locale: "id-ID", decimals: 0 },
  EUR: { symbol: "€", label: "EUR", locale: "en-IE", decimals: 2 },
  JPY: { symbol: "¥", label: "JPY", locale: "ja-JP", decimals: 0 },
  BRL: { symbol: "R$", label: "BRL", locale: "pt-BR", decimals: 2 },
};

const CURRENCY_ORDER: Currency[] = ["USD", "IDR", "EUR", "JPY", "BRL"];

function formatPrice(priceUSD: number, currency: Currency): string {
  const meta = CURRENCY_META[currency];
  const converted = priceUSD * EXCHANGE_RATES[currency];
  if (currency === "USD") {
    return `${meta.symbol}${converted.toFixed(meta.decimals)}`;
  }
  const numStr =
    meta.decimals === 0
      ? Math.round(converted).toLocaleString(meta.locale)
      : converted.toLocaleString(meta.locale, {
          minimumFractionDigits: meta.decimals,
          maximumFractionDigits: meta.decimals,
        });
  return `${meta.symbol} ${numStr}`;
}

// ---------- Catalog ---------------------------------------------------
type Category = "frames" | "dances" | "trails" | "burrow" | "bundles";

interface BoutiqueItem {
  id: string;
  name: string;
  category: Category;
  priceUSD: number;
  faction?: FactionId;
  description: string;
  artHint: string; // emoji glyph for the CSS thumbnail
  artColor: string; // CSS color for the thumbnail ring
  rarity: Rarity;
  // bundle-only fields:
  bundleOriginalTotalUSD?: number;
  bundleSavingsPct?: number;
  bundleIncludes?: string[];
}

const CATALOG: BoutiqueItem[] = [
  // --- Profile Frames ---
  {
    id: "frame_coral_bloom",
    name: "Profile Frame: Coral Bloom",
    category: "frames",
    priceUSD: 2.99,
    faction: "coral_court",
    description: "Blossoming coral spires around your portrait.",
    artHint: "🪸",
    artColor: "#FF6F91",
    rarity: "uncommon",
  },
  {
    id: "frame_gilded_crown",
    name: "Profile Frame: Gilded Crown",
    category: "frames",
    priceUSD: 4.99,
    description: "Sun-gold filigree fit for a Tideband sovereign.",
    artHint: "👑",
    artColor: "#FFD166",
    rarity: "rare",
  },
  {
    id: "frame_leviathan_eye",
    name: "Profile Frame: Leviathan Eye",
    category: "frames",
    priceUSD: 7.99,
    faction: "stormwake",
    description: "A rift-touched eye that watches from the deep.",
    artHint: "👁️",
    artColor: "#7A5CFF",
    rarity: "epic",
  },
  // --- Victory Dances ---
  {
    id: "dance_wavebreaker",
    name: "Victory Dance: Wavebreaker",
    category: "dances",
    priceUSD: 3.99,
    faction: "frostshelf",
    description: "A triumphant shatter-wave stomp after every win.",
    artHint: "🌊",
    artColor: "#7CF5E1",
    rarity: "uncommon",
  },
  {
    id: "dance_coral_cascade",
    name: "Victory Dance: Coral Cascade",
    category: "dances",
    priceUSD: 3.99,
    faction: "coral_court",
    description: "Petals and plankton swirl around your team.",
    artHint: "💃",
    artColor: "#FFD166",
    rarity: "uncommon",
  },
  {
    id: "dance_stormstrike",
    name: "Victory Dance: Stormstrike",
    category: "dances",
    priceUSD: 4.99,
    faction: "stormwake",
    description: "Lightning crackles with every pincher click.",
    artHint: "⚡",
    artColor: "#C9D6EE",
    rarity: "rare",
  },
  // --- Shell Trails ---
  {
    id: "trail_plankton_glow",
    name: "Shell Trail: Plankton Glow",
    category: "trails",
    priceUSD: 2.99,
    faction: "moonpool",
    description: "Bioluminescent plankton drifts behind your crab.",
    artHint: "✨",
    artColor: "#5C7CFF",
    rarity: "uncommon",
  },
  {
    id: "trail_goldspark",
    name: "Shell Trail: Goldspark",
    category: "trails",
    priceUSD: 4.99,
    faction: "cinderreef",
    description: "Molten gold sparks trail from every step.",
    artHint: "🔥",
    artColor: "#FF7A1A",
    rarity: "rare",
  },
  // --- Burrow Decor ---
  {
    id: "burrow_kelp_garden",
    name: "Burrow Decor: Kelp Garden",
    category: "burrow",
    priceUSD: 5.99,
    faction: "mangrove",
    description: "A swaying kelp grove outside your burrow entrance.",
    artHint: "🌿",
    artColor: "#4FB477",
    rarity: "rare",
  },
  {
    id: "burrow_coral_throne",
    name: "Burrow Decor: Coral Throne",
    category: "burrow",
    priceUSD: 9.99,
    faction: "coral_court",
    description: "A carved coral throne where your crabs can rest.",
    artHint: "🪑",
    artColor: "#FF6F91",
    rarity: "epic",
  },
  {
    id: "burrow_tidepool_pavilion",
    name: "Burrow Decor: Tidepool Pavilion",
    category: "burrow",
    priceUSD: 14.99,
    faction: "moonpool",
    description: "A moonlit pavilion stretching across your tidepool.",
    artHint: "🏛️",
    artColor: "#5C7CFF",
    rarity: "legendary",
  },
  // --- Bundle ---
  {
    id: "bundle_bloomtide_collection",
    name: "Bloomtide Collection",
    category: "bundles",
    priceUSD: 24.99,
    faction: "coral_court",
    description: "Four signature styles bundled for the bloom season.",
    artHint: "🎀",
    artColor: "#FFD166",
    rarity: "legendary",
    bundleOriginalTotalUSD: 33.32,
    bundleSavingsPct: 25,
    bundleIncludes: [
      "Profile Frame: Leviathan Eye",
      "Victory Dance: Stormstrike",
      "Shell Trail: Goldspark",
      "Burrow Decor: Tidepool Pavilion",
    ],
  },
];

const CATEGORIES: { id: Category | "all"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "frames", label: "Frames" },
  { id: "dances", label: "Dances" },
  { id: "trails", label: "Trails" },
  { id: "burrow", label: "Burrow" },
  { id: "bundles", label: "Bundles" },
];

const RARITY_COLOR: Record<Rarity, string> = {
  common: "#B8C4D6",
  uncommon: "#4FB477",
  rare: "#5C7CFF",
  epic: "#A855F7",
  legendary: "#FFD166",
};

// ---------- Component -------------------------------------------------
export default function TideborneBoutiqueModal({
  onClose,
}: {
  onClose: () => void;
}) {
  const player = useGame((s) => s.player);
  const pushToast = useGame((s) => s.pushToast);

  const [currency, setCurrency] = useState<Currency>("IDR");
  const [category, setCategory] = useState<Category | "all">("all");
  const [ownedItems, setOwnedItems] = useState<Set<string>>(new Set());
  const [purchaseInProgress, setPurchaseInProgress] = useState<string | null>(
    null
  );
  const [showSpendingLimitModal, setShowSpendingLimitModal] = useState(false);
  const [pendingPurchase, setPendingPurchase] = useState<BoutiqueItem | null>(
    null
  );
  const [monthlySpent, setMonthlySpent] = useState(0);
  const [monthlyLimit, setMonthlyLimit] = useState(200);
  const [showLimitEditor, setShowLimitEditor] = useState(false);
  const [limitInput, setLimitInput] = useState("200");
  const [showParentalConsent, setShowParentalConsent] = useState(false);

  const filteredItems =
    category === "all"
      ? CATALOG
      : CATALOG.filter((i) => i.category === category);

  const spendRatio = Math.min(1, monthlySpent / monthlyLimit);
  const spendBarColor =
    spendRatio > 0.9 ? "#FF6F91" : spendRatio > 0.66 ? "#FFD166" : "#7CF5E1";

  function handleBuy(item: BoutiqueItem) {
    if (ownedItems.has(item.id) || purchaseInProgress) return;
    if (monthlySpent + item.priceUSD > monthlyLimit) {
      setPendingPurchase(item);
      setShowSpendingLimitModal(true);
      return;
    }
    setPurchaseInProgress(item.id);
    // Simulated checkout — purchase confirmation step.
    setTimeout(() => {
      setOwnedItems((prev) => {
        const next = new Set(prev);
        next.add(item.id);
        return next;
      });
      setMonthlySpent((prev) => prev + item.priceUSD);
      setPurchaseInProgress(null);
      pushToast({
        title: "Purchase complete!",
        description: `${item.name} — ${formatPrice(
          item.priceUSD,
          currency
        )}. Added to your inventory.`,
        variant: "success",
      });
    }, 1200);
  }

  function saveLimit() {
    const v = parseFloat(limitInput);
    if (Number.isFinite(v) && v > 0) {
      setMonthlyLimit(v);
      setShowLimitEditor(false);
      pushToast({
        title: "Spending limit updated",
        description: `Monthly limit set to ${formatPrice(v, "USD")} (${formatPrice(
          v,
          currency
        )}).`,
        variant: "default",
      });
    } else {
      pushToast({
        title: "Invalid limit",
        description: "Please enter a positive number.",
        variant: "error",
      });
    }
  }

  function openParentalConsent() {
    setShowParentalConsent(true);
  }

  function viewPurchaseHistory() {
    pushToast({
      title: "Purchase history",
      description:
        ownedItems.size > 0
          ? `${ownedItems.size} style(s) owned this session. Full history available in account settings.`
          : "No purchases yet this session. Full history available in account settings.",
      variant: "default",
    });
  }

  return (
    <div
      className="fixed inset-0 z-[150] flex items-center justify-center p-3 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="boutique-title"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0"
        style={{
          background: "rgba(5, 15, 35, 0.78)",
          backdropFilter: "blur(10px)",
        }}
        onClick={onClose}
      />

      {/* Card */}
      <GlassPanel
        className="relative w-full max-w-3xl max-h-[88vh] overflow-y-auto rounded-2xl flex flex-col"
        glow="rgba(255,209,102,0.22)"
        style={{
          background:
            "linear-gradient(165deg, rgba(10,27,61,0.96) 0%, rgba(18,167,160,0.10) 100%)",
          border: "1px solid rgba(255,209,102,0.30)",
        }}
      >
        {/* ===== Header ===== */}
        <div
          className="px-4 sm:px-6 pt-4 pb-3 sticky top-0 z-10"
          style={{
            background:
              "linear-gradient(180deg, rgba(10,27,61,0.98) 0%, rgba(10,27,61,0.92) 80%, rgba(10,27,61,0) 100%)",
            borderBottom: "1px solid rgba(255,209,102,0.18)",
          }}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2
                id="boutique-title"
                className="text-lg sm:text-xl font-bold flex items-center gap-2"
                style={{
                  fontFamily: "Fredoka, system-ui, sans-serif",
                  color: "#FFD166",
                }}
              >
                <span aria-hidden="true">🛍️</span>
                <span>Tideborne Boutique</span>
              </h2>
              <p className="text-[11px] sm:text-xs text-white/70 mt-0.5">
                Styles only. Never power. Never{" "}
                <span style={{ color: "#FFD166", fontWeight: 700 }}>GOLD</span>.
              </p>
            </div>
            <GlowButton
              variant="ghost"
              size="sm"
              onClick={onClose}
              title="Close store"
              aria-label="Close store"
            >
              ✕
            </GlowButton>
          </div>

          {/* Currency selector pills */}
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] uppercase tracking-wide text-white/55 mr-1">
              Currency:
            </span>
            {CURRENCY_ORDER.map((c) => {
              const active = currency === c;
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCurrency(c)}
                  className="px-2 py-0.5 rounded-full text-[10px] font-bold transition-all"
                  style={{
                    background: active
                      ? "linear-gradient(135deg, #FFD166, #FF7A1A)"
                      : "rgba(255,255,255,0.06)",
                    color: active ? "#0A1B3D" : "#EAF6FF",
                    border: active
                      ? "1px solid rgba(255,209,102,0.6)"
                      : "1px solid rgba(124,245,225,0.18)",
                    boxShadow: active
                      ? "0 2px 8px rgba(255,209,102,0.35)"
                      : "none",
                  }}
                  aria-pressed={active}
                >
                  {CURRENCY_META[c].label}
                </button>
              );
            })}
          </div>

          {/* Spending tracker + limit */}
          <div className="mt-3 flex flex-col sm:flex-row sm:items-center gap-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between text-[10px] text-white/65 mb-1">
                <span>
                  Spent{" "}
                  <span style={{ color: "#FFD166", fontWeight: 700 }}>
                    {formatPrice(monthlySpent, currency)}
                  </span>{" "}
                  this month
                </span>
                <span className="text-white/50">
                  Limit {formatPrice(monthlyLimit, currency)}
                </span>
              </div>
              <div
                className="h-2 rounded-full overflow-hidden"
                style={{ background: "rgba(255,255,255,0.10)" }}
                role="progressbar"
                aria-valuenow={Math.round(spendRatio * 100)}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Monthly spending"
              >
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{
                    width: `${Math.max(2, spendRatio * 100)}%`,
                    background: `linear-gradient(90deg, ${spendBarColor}, #FFD166)`,
                  }}
                />
              </div>
            </div>
            <GlowButton
              variant="ghost"
              size="sm"
              onClick={() => {
                setLimitInput(String(monthlyLimit));
                setShowLimitEditor(true);
              }}
              title="Adjust your monthly spending limit"
            >
              ⚙ Adjust limit
            </GlowButton>
          </div>

          {/* Inline limit editor */}
          {showLimitEditor && (
            <div
              className="mt-2 p-2.5 rounded-xl flex flex-wrap items-center gap-2"
              style={{
                background: "rgba(10,27,61,0.6)",
                border: "1px solid rgba(255,209,102,0.25)",
              }}
            >
              <span className="text-[11px] text-white/75">
                New monthly limit (USD):
              </span>
              <input
                type="number"
                min="1"
                step="1"
                value={limitInput}
                onChange={(e) => setLimitInput(e.target.value)}
                className="w-24 px-2 py-1 rounded-lg text-sm font-bold"
                style={{
                  background: "rgba(255,255,255,0.08)",
                  border: "1px solid rgba(124,245,225,0.3)",
                  color: "#EAF6FF",
                }}
                aria-label="Monthly spending limit in USD"
              />
              <GlowButton variant="gold" size="sm" onClick={saveLimit}>
                Save
              </GlowButton>
              <GlowButton
                variant="ghost"
                size="sm"
                onClick={() => setShowLimitEditor(false)}
              >
                Cancel
              </GlowButton>
            </div>
          )}

          {/* Player GOLD — read-only, reinforces "GOLD not accepted here" */}
          {player && (
            <div className="mt-2 flex items-center gap-2 flex-wrap">
              <StatChip
                label="Your GOLD"
                value={formatGold(player.gold)}
                color="#FFD166"
                icon={<GoldIcon size={14} />}
              />
              <span className="text-[10px] text-white/50 italic">
                GOLD is earned in-game only — it cannot be purchased or spent
                here.
              </span>
            </div>
          )}
        </div>

        {/* ===== Disclosure banner ===== */}
        <div className="px-4 sm:px-6 py-2.5">
          <div
            className="rounded-xl px-3 py-2 text-[11px] leading-relaxed"
            style={{
              background: "rgba(255,209,102,0.08)",
              border: "1px solid rgba(255,209,102,0.25)",
              color: "#FFE9B0",
            }}
            role="note"
          >
            <span style={{ fontWeight: 700 }} aria-hidden="true">
              ⓘ{" "}
            </span>
            All items are style-only. They do{" "}
            <strong>NOT</strong> affect combat stats, breeding odds, reward
            amounts, or GOLD earnings. No loot boxes. No randomized rewards for
            sale. Prices are in your local currency. Refundable within 14 days.
          </div>
        </div>

        {/* ===== Regional compliance note (IDR only) ===== */}
        {currency === "IDR" && (
          <div className="px-4 sm:px-6 pb-2">
            <div
              className="rounded-lg px-3 py-1.5 text-[10px] leading-relaxed text-white/65"
              style={{
                background: "rgba(124,245,225,0.06)",
                border: "1px solid rgba(124,245,225,0.18)",
              }}
            >
              Purchases processed via local Indonesian payment providers. Age
              gate required for under-18.
            </div>
          </div>
        )}

        {/* ===== Category filter ===== */}
        <div className="px-4 sm:px-6 pb-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {CATEGORIES.map((c) => {
              const active = category === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCategory(c.id)}
                  className="px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all"
                  style={{
                    background: active
                      ? "rgba(18,167,160,0.25)"
                      : "rgba(255,255,255,0.04)",
                    color: active ? "#7CF5E1" : "#EAF6FF",
                    border: active
                      ? "1px solid rgba(124,245,225,0.5)"
                      : "1px solid rgba(124,245,225,0.12)",
                  }}
                  aria-pressed={active}
                >
                  {c.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* ===== Item grid ===== */}
        <div className="px-4 sm:px-6 pb-4">
          {filteredItems.length === 0 ? (
            <EmptyState
              message="No styles in this category yet."
              hint="Check back each season for new frames, dances, and decor."
              compact
            />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {filteredItems.map((item) => (
                <ItemCard
                  key={item.id}
                  item={item}
                  currency={currency}
                  owned={ownedItems.has(item.id)}
                  purchasing={purchaseInProgress === item.id}
                  onBuy={() => handleBuy(item)}
                />
              ))}
            </div>
          )}
        </div>

        {/* ===== Footer ===== */}
        <div
          className="px-4 sm:px-6 py-3 mt-auto"
          style={{
            background: "rgba(10,27,61,0.5)",
            borderTop: "1px solid rgba(124,245,225,0.15)",
          }}
        >
          <div className="text-[10px] text-white/55 leading-relaxed space-y-1">
            <p>
              All prices include applicable taxes. Refunds available within 14
              days for unused styles — refunds reverse only the purchased
              styles, never GOLD or progress. Contact{" "}
              <span style={{ color: "#7CF5E1" }}>
                support@crabtopia.example
              </span>
              .
            </p>
            <p>
              No subscriptions. No auto-renewals. One-time purchases only.
            </p>
          </div>
          <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <button
              type="button"
              onClick={viewPurchaseHistory}
              className="text-[11px] font-semibold text-white/70 hover:text-white underline underline-offset-2 transition-colors"
            >
              View purchase history
            </button>
            <span className="text-white/20">·</span>
            <button
              type="button"
              onClick={openParentalConsent}
              className="text-[11px] font-semibold text-white/70 hover:text-white underline underline-offset-2 transition-colors"
            >
              I&apos;m under 18
            </button>
            <span className="ml-auto">
              <GlowButton variant="ghost" size="sm" onClick={onClose}>
                Close store
              </GlowButton>
            </span>
          </div>
        </div>
      </GlassPanel>

      {/* ===== Spending limit modal ===== */}
      {showSpendingLimitModal && pendingPurchase && (
        <div
          className="fixed inset-0 z-[160] flex items-center justify-center p-4"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="spend-limit-title"
        >
          <div
            className="absolute inset-0"
            style={{
              background: "rgba(5,15,35,0.82)",
              backdropFilter: "blur(6px)",
            }}
            onClick={() => {
              setShowSpendingLimitModal(false);
              setPendingPurchase(null);
            }}
          />
          <GlassPanel
            className="relative w-full max-w-sm p-5 rounded-2xl"
            glow="rgba(255,111,145,0.35)"
            style={{
              background:
                "linear-gradient(160deg, rgba(10,27,61,0.97) 0%, rgba(140,45,82,0.4) 100%)",
              border: "1px solid rgba(255,111,145,0.45)",
            }}
          >
            <h3
              id="spend-limit-title"
              className="text-base font-bold mb-2"
              style={{ color: "#FF6F91" }}
            >
              Spending limit reached
            </h3>
            <p className="text-sm text-white/85 leading-relaxed mb-1">
              You&apos;re about to exceed your monthly spending limit of{" "}
              <strong style={{ color: "#FFD166" }}>
                {formatPrice(monthlyLimit, currency)}
              </strong>
              .
            </p>
            <p className="text-[11px] text-white/60 mb-3">
              {pendingPurchase.name} costs{" "}
              {formatPrice(pendingPurchase.priceUSD, currency)}. You&apos;ve
              already spent {formatPrice(monthlySpent, currency)} this month.
            </p>
            <div className="flex gap-2 justify-end">
              <GlowButton
                variant="ghost"
                size="sm"
                onClick={() => {
                  setShowSpendingLimitModal(false);
                  setPendingPurchase(null);
                }}
              >
                Cancel purchase
              </GlowButton>
              <GlowButton
                variant="gold"
                size="sm"
                onClick={() => {
                  setShowSpendingLimitModal(false);
                  setPendingPurchase(null);
                  setLimitInput(String(monthlyLimit));
                  setShowLimitEditor(true);
                }}
              >
                Adjust limit
              </GlowButton>
            </div>
          </GlassPanel>
        </div>
      )}

      {/* ===== Parental consent notice ===== */}
      {showParentalConsent && (
        <div
          className="fixed inset-0 z-[160] flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="parental-title"
        >
          <div
            className="absolute inset-0"
            style={{
              background: "rgba(5,15,35,0.82)",
              backdropFilter: "blur(6px)",
            }}
            onClick={() => setShowParentalConsent(false)}
          />
          <GlassPanel
            className="relative w-full max-w-md p-5 rounded-2xl"
            glow="rgba(124,245,225,0.25)"
          >
            <h3
              id="parental-title"
              className="text-base font-bold mb-2"
              style={{ color: "#7CF5E1" }}
            >
              Parental consent required
            </h3>
            <div className="text-sm text-white/85 leading-relaxed space-y-2">
              <p>
                Players under 18 must have a parent or legal guardian review and
                approve any purchase in the Tideborne Boutique.
              </p>
              <p>
                Crabtopia enforces age gates in regions where required by law,
                including Indonesia, and never sells loot boxes or randomized
                rewards to minors.
              </p>
              <p className="text-[11px] text-white/60">
                All styles are one-time purchases with no auto-renewal.
                Guardians may request refunds within 14 days for unused
                styles.
              </p>
            </div>
            <div className="mt-3 flex justify-end">
              <GlowButton
                variant="teal"
                size="sm"
                onClick={() => setShowParentalConsent(false)}
              >
                I understand
              </GlowButton>
            </div>
          </GlassPanel>
        </div>
      )}
    </div>
  );
}

// ---------- Item card sub-component -----------------------------------
function ItemCard({
  item,
  currency,
  owned,
  purchasing,
  onBuy,
}: {
  item: BoutiqueItem;
  currency: Currency;
  owned: boolean;
  purchasing: boolean;
  onBuy: () => void;
}) {
  const isBundle = item.category === "bundles";
  const rarityColor = RARITY_COLOR[item.rarity];
  const faction = item.faction ? FACTIONS[item.faction] : null;

  return (
    <div
      className="relative rounded-2xl p-3 flex flex-col"
      style={{
        background: isBundle
          ? "linear-gradient(160deg, rgba(92,26,56,0.55) 0%, rgba(255,209,102,0.10) 100%)"
          : "linear-gradient(160deg, rgba(10,27,61,0.55) 0%, rgba(18,167,160,0.08) 100%)",
        border: isBundle
          ? "1px solid rgba(255,209,102,0.45)"
          : "1px solid rgba(124,245,225,0.18)",
        boxShadow: isBundle ? "0 0 18px rgba(255,209,102,0.18)" : "none",
      }}
    >
      {/* Bundle badge */}
      {isBundle && (
        <span
          className="absolute -top-2 -right-2 px-2 py-0.5 rounded-full text-[9px] font-bold tracking-wide"
          style={{
            background: "linear-gradient(135deg, #FFD166, #FF7A1A)",
            color: "#0A1B3D",
            boxShadow: "0 2px 8px rgba(255,209,102,0.5)",
          }}
        >
          BUNDLE
        </span>
      )}

      {/* Thumbnail + rarity + faction */}
      <div className="flex items-center gap-2 mb-2">
        <div
          className="flex items-center justify-center shrink-0"
          style={{
            width: 44,
            height: 44,
            borderRadius: "50%",
            background: `radial-gradient(circle at 30% 30%, ${item.artColor}cc, ${item.artColor}33 70%)`,
            border: `2px solid ${item.artColor}88`,
            boxShadow: `0 0 10px ${item.artColor}55`,
            fontSize: 22,
            lineHeight: 1,
          }}
          aria-hidden="true"
        >
          <span>{item.artHint}</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span
              className="inline-block px-1.5 py-0.5 rounded-md text-[8px] uppercase font-bold tracking-wide"
              style={{
                background: rarityColor + "22",
                color: rarityColor,
                border: `1px solid ${rarityColor}55`,
              }}
            >
              {item.rarity}
            </span>
            {faction && (
              <span
                className="inline-flex items-center gap-0.5 text-[10px] font-bold"
                style={{ color: faction.colors.accent }}
                title={faction.name}
              >
                <span aria-hidden="true">{faction.emblem}</span>
                <span>{faction.shortName}</span>
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Name + description */}
      <h4
        className="text-sm font-bold leading-tight mb-0.5"
        style={{ color: "#EAF6FF" }}
      >
        {item.name}
      </h4>
      <p className="text-[11px] text-white/60 leading-snug mb-2 flex-1">
        {item.description}
      </p>

      {/* Bundle includes list */}
      {isBundle && item.bundleIncludes && (
        <ul className="mb-2 space-y-0.5">
          {item.bundleIncludes.map((inc) => (
            <li
              key={inc}
              className="text-[10px] text-white/65 flex items-start gap-1"
            >
              <span style={{ color: "#FFD166" }} aria-hidden="true">
                ✓
              </span>
              <span>{inc}</span>
            </li>
          ))}
        </ul>
      )}

      {/* Price + buy */}
      <div className="mt-auto">
        {isBundle && item.bundleOriginalTotalUSD && item.bundleSavingsPct ? (
          <div className="mb-1.5 flex items-center gap-1.5 flex-wrap">
            <span
              className="text-[11px] line-through text-white/40"
              aria-label="Original total"
            >
              {formatPrice(item.bundleOriginalTotalUSD, currency)}
            </span>
            <span
              className="px-1.5 py-0.5 rounded-md text-[9px] font-bold"
              style={{
                background: "rgba(75,180,119,0.18)",
                color: "#4FB477",
                border: "1px solid rgba(75,180,119,0.4)",
              }}
            >
              Save {item.bundleSavingsPct}%
            </span>
          </div>
        ) : null}

        <div className="flex items-center justify-between gap-2">
          <span
            className="text-sm font-bold"
            style={{ color: "#FFD166" }}
            aria-label={`Price ${formatPrice(item.priceUSD, currency)}`}
          >
            {formatPrice(item.priceUSD, currency)}
          </span>
          {owned ? (
            <span
              className="px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1"
              style={{
                background: "rgba(75,180,119,0.15)",
                color: "#4FB477",
                border: "1px solid rgba(75,180,119,0.35)",
              }}
              aria-label="Owned"
            >
              ✓ Owned
            </span>
          ) : (
            <GlowButton
              variant="gold"
              size="sm"
              onClick={onBuy}
              disabled={purchasing}
              title={`Buy ${item.name} for ${formatPrice(
                item.priceUSD,
                currency
              )}`}
            >
              {purchasing ? "Processing…" : "Buy"}
            </GlowButton>
          )}
        </div>
      </div>
    </div>
  );
}
