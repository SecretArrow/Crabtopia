// Crabtopia - Item market engine (pure; no store, no React)
// ---------------------------------------------------------------------------
// Dropped materials (data/materials.ts) are tradable in the Bazaar:
//
//   REFERENCE VALUE — every material carries a `baseValue`: the price
//   NPC shelf listings are based on (through the tokenomics price
//   index, like every system price), the anchor of the demand model,
//   the base of the player price cap, and the UI's "market price".
//
//   SELLING — the player lists a stack at a chosen per-unit price,
//   hard-capped at ITEM_PRICE_CAP_MULTIPLE × reference; the stack is
//   ESCROWED out of their inventory while listed. NPC demand is
//   simulated lazily by the store's tickTimers from elapsed time:
//   each listed stack sells with probability
//     1 − (1 − chancePerHour)^(elapsedHours)
//   where chancePerHour depends on price vs reference: at or below
//   reference buyers are eager (0.5/h), up to 2× reference they are
//   rare (0.1/h), and above 2× there is NO demand — overpricing past
//   the demand ceiling simply never sells. Player crab listings have
//   no equivalent background simulation (they wait for a buyer in the
//   UI), so item listings carry their own minimal version here; the
//   shape mirrors the crab flow (escrow out, fee on sale, full refund
//   on cancel) without inventing a second market.
//
//   MONEY — a sale settles through the EXISTING seller path: the
//   3.85% Bazaar fee is charged on the total, split by
//   applyMarketFeeSplit (1.00pp of price to the Tide Treasury, the
//   rest of the fee burned), and the proceeds are credited UNTITHED —
//   the market fee is the seller's tax (tokenomics v1 rule). Buying
//   is a transfer the other way. Neither direction mints or burns
//   beyond the fee's burn share, so the supply identity
//   circulating = INITIAL + minted − burned keeps holding.

import type { BazaarListing, PlayerProfile } from "../types";
import { MATERIALS, type MaterialId } from "../data/materials";
import { CONFIG, ITEM_PRICE_CAP_MULTIPLE, ITEM_SALE_CHANCE_PER_HOUR_ABOVE_REFERENCE, ITEM_SALE_CHANCE_PER_HOUR_AT_REFERENCE, ITEM_SALE_MAX_RATIO } from "./config";
import { applyMarketFeeSplit, effectiveListingPrice } from "./economy";
import { mulberry32, randInt } from "./rng";

/** The reference market value (GOLD) of one unit of a material. */
export function materialReferenceValue(materialId: MaterialId): number {
  return MATERIALS[materialId].baseValue;
}

/** The highest per-unit price a player may list this material at. */
export function maxItemUnitPrice(materialId: MaterialId): number {
  return Math.floor(materialReferenceValue(materialId) * ITEM_PRICE_CAP_MULTIPLE);
}

/** NPC demand rate (sales per hour) for a stack listed at `unitPrice`. */
export function itemSaleChancePerHour(
  unitPrice: number,
  materialId: MaterialId
): number {
  const ref = materialReferenceValue(materialId);
  if (!(ref > 0) || !Number.isFinite(unitPrice)) return 0;
  const ratio = unitPrice / ref;
  if (ratio <= 1) return ITEM_SALE_CHANCE_PER_HOUR_AT_REFERENCE;
  if (ratio <= ITEM_SALE_MAX_RATIO) return ITEM_SALE_CHANCE_PER_HOUR_ABOVE_REFERENCE;
  return 0;
}

/**
 * Probability that a stack listed at `unitPrice` sells at least once
 * over `elapsedMs` of NPC demand: 1 − (1 − p)^hours. Exactly 0 when
 * the price is past the demand ceiling; approaches 1 over long
 * elapsed times at any in-demand price.
 */
export function itemSaleProbability(
  unitPrice: number,
  materialId: MaterialId,
  elapsedMs: number
): number {
  const perHour = itemSaleChancePerHour(unitPrice, materialId);
  if (perHour <= 0 || elapsedMs <= 0) return 0;
  const hours = elapsedMs / (60 * 60 * 1000);
  return 1 - Math.pow(1 - perHour, hours);
}

/** What a buyer pays for a material listing right now: the per-unit
 *  price (indexed for NPC listings, fixed for player listings — via
 *  the shared effectiveListingPrice) times the stack size. */
export function itemListingTotalPrice(
  listing: BazaarListing,
  priceIndex: number
): number {
  return effectiveListingPrice(listing, priceIndex) * (listing.quantity ?? 1);
}

export interface ItemSaleSettlement {
  player: PlayerProfile;
  /** unitPrice × quantity, before the fee. */
  proceeds: number;
  /** The 3.85% Bazaar fee charged on the proceeds. */
  fee: number;
  /** What the seller actually receives (proceeds − fee, untithed). */
  net: number;
}

/**
 * Settle a material sale to an NPC buyer: fee split via the shared
 * market-fee helper, proceeds credited to the seller untithed.
 * (Escrowed materials simply leave with the buyer — the caller
 * removes the listing.)
 */
export function settleItemSale(
  player: PlayerProfile,
  listing: BazaarListing
): ItemSaleSettlement {
  const proceeds = Math.max(
    0,
    Math.round(listing.price) * Math.max(1, Math.floor(listing.quantity ?? 1))
  );
  const fee = Math.round(proceeds * CONFIG.bazaarFeePercent);
  const net = proceeds - fee;
  const split = applyMarketFeeSplit(player, proceeds, fee);
  return {
    player: { ...split.player, gold: split.player.gold + net },
    proceeds,
    fee,
    net,
  };
}

// NPC shelf stock: common materials appear more often than rare ones,
// mirroring the drop tables that produce them.
const NPC_STOCK_POOL: MaterialId[] = [
  "kelp_fiber", "kelp_fiber", "kelp_fiber",
  "iron_ore", "iron_ore",
  "pearl_shard", "pearl_shard",
  "crystal_dust",
  "gold_nugget",
  "abyssal_gem",
];

const NPC_SELLER_NAMES = [
  "Brinepinch", "Oldshell", "Tidecrest", "Goldfoot", "Riftclaw",
  "Kelpback", "Stormsnap", "Pearlhide", "Cinderjaw", "Mossclaw",
];

/**
 * A fresh rotation of NPC material listings for the Bazaar shelf:
 * base (unindexed) per-unit prices at the reference value — the
 * buyer's charged price floats with the price index at purchase
 * time, exactly like NPC crab listings. Deterministic per `seed`.
 */
export function generateNpcItemListings(
  now: number,
  count: number,
  seed: number
): BazaarListing[] {
  const rng = mulberry32(seed);
  const listings: BazaarListing[] = [];
  for (let i = 0; i < count; i++) {
    const materialId =
      NPC_STOCK_POOL[Math.floor(rng() * NPC_STOCK_POOL.length)];
    listings.push({
      id: `bazi_${seed}_${i}`,
      itemId: materialId,
      itemType: "material",
      sellerId: "npc",
      sellerName: NPC_SELLER_NAMES[Math.floor(rng() * NPC_SELLER_NAMES.length)],
      price: materialReferenceValue(materialId),
      quantity: randInt(1, 4, rng),
      listedAt: now,
      type: "fixed",
    });
  }
  return listings;
}

/** Count of NPC material listings currently on the shelf. */
export function npcItemStockCount(listings: readonly BazaarListing[]): number {
  return listings.filter(
    (l) => l.itemType === "material" && l.sellerId === "npc"
  ).length;
}
