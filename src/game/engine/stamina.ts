// Crabtopia - Stamina, wounds & recovery engine (pure; no store, no React)
// ---------------------------------------------------------------------------
// The per-crab exertion layer, configured in engine/config.ts:
//
//   STAMINA — every crab has 0..MAX_STAMINA. Activities charge it when
//   they START (STAMINA_COSTS); it regens passively at
//   STAMINA_REGEN_PER_HOUR while the crab rests, and the store's
//   tickTimers refills it to FULL at the daily reset — the exact same
//   lazy anchor the daily dive cap uses (`dailyDiveResetAt`). Regen
//   pauses while the crab is Wounded or away diving (it is working,
//   not resting). Regen is LAZY: `staminaOf` projects the current
//   value from the crab's `staminaUpdatedAt` anchor without mutating,
//   and `applyStaminaRegen` persists the projection on tick.
//
//   WOUNDS — a crab whose HP hits 0 in a plunder raid or the
//   Leviathan fight (engine/battle.ts flows, applied by the store at
//   the result layer — battle resolution itself is untouched) is
//   Wounded for WOUND_DURATION_MS: it cannot deploy and does not
//   regen. Arena defeats never wound; a fallen arena crab is WINDED
//   (−ARENA_WINDED_STAMINA stamina, no lockout). Wounds end by timer,
//   instantly by Coral Salve, and their countdown runs
//   ×RECOVERY_BOOST_MULTIPLIER while Second Wind is active. The daily
//   reset refills stamina but does NOT clear wounds.
//
//   RECOVERY SUPPLIES — bought with GOLD at the Bazaar's Supplies
//   shelf (the Tideborne Boutique is real-money styles-only by hard
//   design rule, so GOLD consumables live in the GOLD market). Prices
//   are SYSTEM prices (indexedPrice — index 1 = the listed price) and
//   100% of every purchase flows into the Tide Treasury: developer
//   revenue as a pure transfer. Player gold falls, Treasury rises,
//   circulating supply and the minted/burned counters never move.
//
// Every function is pure: PlayerProfile in, new PlayerProfile out, so
// the store can fold results into its set() calls and unit tests can
// pin the math without a store.

import type { Crab, PlayerProfile } from "../types";
import {
  ARENA_WINDED_STAMINA,
  MAX_STAMINA,
  RECOVERY_BOOST_DURATION_MS,
  RECOVERY_BOOST_MULTIPLIER,
  RECOVERY_ITEM_PRICES,
  STAMINA_REGEN_PER_HOUR,
  TIDE_TONIC_RESTORE,
  WOUND_DURATION_MS,
} from "./config";
import { applySinkSplit, economyOf, indexedPrice } from "./economy";

const MS_PER_HOUR = 60 * 60 * 1000;

function clampStamina(n: number): number {
  if (!Number.isFinite(n)) return MAX_STAMINA;
  return Math.min(MAX_STAMINA, Math.max(0, n));
}

/** Round persisted stamina to 2 decimals so float dust never accrues. */
function persist(n: number): number {
  return Math.round(clampStamina(n) * 100) / 100;
}

/** Is this crab wounded at `now`? */
export function isWounded(crab: Crab, now: number): boolean {
  return (crab.woundedUntil ?? 0) > now;
}

/** Milliseconds of wound remaining at `now` (0 when healthy). */
export function woundRemainingMs(crab: Crab, now: number): number {
  return Math.max(0, (crab.woundedUntil ?? 0) - now);
}

/** Is the player's Second Wind recovery boost active at `now`? */
export function recoveryBoostActive(player: PlayerProfile, now: number): boolean {
  return (player.recoveryBoostUntil ?? 0) > now;
}

/**
 * The crab's stamina at `now`, projected lazily from its anchor —
 * no mutation. Rules:
 *  - a missing stored value reads as FULL (legacy crabs start rested);
 *  - while Wounded, no regen accrues at all;
 *  - after a wound expires, regen accrues only from the heal moment
 *    (time spent wounded never counts as rest);
 *  - while diving, the crab is working, not resting — no accrual
 *    (the tick also keeps a diving crab's anchor fresh, and dive
 *    claim/retreat re-anchor it, so dive time is never credited);
 *  - while Second Wind is active, the boosted portion of the elapsed
 *    time accrues at ×RECOVERY_BOOST_MULTIPLIER.
 */
export function staminaOf(
  crab: Crab,
  now: number,
  boostUntil: number = 0
): number {
  const base = clampStamina(crab.stamina ?? MAX_STAMINA);
  if (base >= MAX_STAMINA) return MAX_STAMINA;
  if (isWounded(crab, now)) return base;
  if (crab.activity === "diving") return base;
  let from = crab.staminaUpdatedAt ?? now;
  if ((crab.woundedUntil ?? 0) > from) from = crab.woundedUntil!;
  if (now <= from) return base;
  const elapsed = now - from;
  const boostMs = Math.max(0, Math.min(now, boostUntil) - from);
  const effectiveMs = elapsed + boostMs * (RECOVERY_BOOST_MULTIPLIER - 1);
  return clampStamina(
    base + (effectiveMs * STAMINA_REGEN_PER_HOUR) / MS_PER_HOUR
  );
}

/**
 * Persist lazy regen/wound progression onto every crab (the store's
 * tickTimers calls this each tick). Per crab:
 *  - Second Wind makes wound countdowns run fast: while boosted, the
 *    wound's end moves earlier by (MULTIPLIER − 1) × the boosted
 *    overlap since the anchor — so a wound fully inside the boost
 *    lasts a third of its normal span;
 *  - an expired wound is cleared and the regen anchor moves to the
 *    heal moment (wounded time is never credited as rest);
 *  - a diving crab's anchor simply advances (working, not resting).
 * Returns the SAME player reference when nothing changed.
 */
export function applyStaminaRegen(
  player: PlayerProfile,
  now: number
): PlayerProfile {
  const boostUntil = recoveryBoostActive(player, now)
    ? player.recoveryBoostUntil!
    : 0;
  let changed = false;
  const crabs = player.crabs.map((crab) => {
    const anchor = crab.staminaUpdatedAt ?? now;
    let woundedUntil = crab.woundedUntil;
    let regenFrom = anchor;

    if (woundedUntil !== undefined && woundedUntil > now && boostUntil > anchor) {
      // Accelerate the countdown for the boosted overlap since anchor.
      const boostMs = Math.max(0, Math.min(now, boostUntil) - anchor);
      if (boostMs > 0) {
        woundedUntil = woundedUntil - (RECOVERY_BOOST_MULTIPLIER - 1) * boostMs;
      }
    }
    if (woundedUntil !== undefined && woundedUntil <= now) {
      // The wound has healed (possibly early, under the boost): regen
      // may only accrue from the heal moment onward.
      regenFrom = Math.max(regenFrom, woundedUntil);
      woundedUntil = undefined;
    }

    const settled: Crab = {
      ...crab,
      woundedUntil,
      staminaUpdatedAt: regenFrom,
    };
    const projected =
      crab.activity === "diving"
        ? clampStamina(crab.stamina ?? MAX_STAMINA)
        : staminaOf(settled, now, boostUntil);

    // Only a material change is persisted — and base + anchor always
    // move together, so the lazy projection stays exact either way.
    if (
      persist(projected) === persist(crab.stamina ?? MAX_STAMINA) &&
      woundedUntil === crab.woundedUntil
    ) {
      return crab;
    }
    changed = true;
    return {
      ...crab,
      stamina: persist(projected),
      staminaUpdatedAt: now,
      woundedUntil,
    };
  });
  return changed ? { ...player, crabs } : player;
}

/** Refill every crab to full stamina (the daily reset). Wounds are
 *  deliberately untouched — only stamina refills. */
export function refillAllStamina(
  player: PlayerProfile,
  now: number
): PlayerProfile {
  return {
    ...player,
    crabs: player.crabs.map((c) => ({
      ...c,
      stamina: MAX_STAMINA,
      staminaUpdatedAt: now,
    })),
  };
}

export interface StaminaSpend {
  player: PlayerProfile;
  ok: boolean;
  /** Names of crabs that cannot afford the cost (empty when ok). */
  lacking: string[];
}

/**
 * Atomically charge `cost` stamina to each listed crab at activity
 * start: every crab is checked against its PROJECTED stamina first —
 * if any one cannot pay, nobody is charged.
 */
export function spendStamina(
  player: PlayerProfile,
  crabIds: readonly string[],
  cost: number,
  now: number
): StaminaSpend {
  const boostUntil = recoveryBoostActive(player, now)
    ? player.recoveryBoostUntil!
    : 0;
  const projected = new Map<string, number>();
  const lacking: string[] = [];
  for (const id of crabIds) {
    const crab = player.crabs.find((c) => c.id === id);
    if (!crab) continue;
    const value = staminaOf(crab, now, boostUntil);
    projected.set(id, value);
    if (value < cost) lacking.push(crab.name);
  }
  if (lacking.length > 0) return { player, ok: false, lacking };
  const crabs = player.crabs.map((c) =>
    projected.has(c.id)
      ? {
          ...c,
          stamina: persist(projected.get(c.id)! - cost),
          staminaUpdatedAt: now,
        }
      : c
  );
  return { player: { ...player, crabs }, ok: true, lacking: [] };
}

/** Wound the listed crabs for WOUND_DURATION_MS from `now` (a fresh
 *  wound never shortens an existing longer one). Stamina settles at
 *  its projected value — regen pauses from here. */
export function woundCrabs(
  player: PlayerProfile,
  crabIds: readonly string[],
  now: number
): PlayerProfile {
  const ids = new Set(crabIds);
  if (ids.size === 0) return player;
  const boostUntil = recoveryBoostActive(player, now)
    ? player.recoveryBoostUntil!
    : 0;
  return {
    ...player,
    crabs: player.crabs.map((c) =>
      ids.has(c.id)
        ? {
            ...c,
            stamina: persist(staminaOf(c, now, boostUntil)),
            staminaUpdatedAt: now,
            woundedUntil: Math.max(c.woundedUntil ?? 0, now + WOUND_DURATION_MS),
          }
        : c
    ),
  };
}

/** Wind the listed crabs (arena defeats): −ARENA_WINDED_STAMINA
 *  stamina each, clamped at 0. No wound, no lockout. */
export function windCrabs(
  player: PlayerProfile,
  crabIds: readonly string[],
  now: number
): PlayerProfile {
  const ids = new Set(crabIds);
  if (ids.size === 0) return player;
  const boostUntil = recoveryBoostActive(player, now)
    ? player.recoveryBoostUntil!
    : 0;
  return {
    ...player,
    crabs: player.crabs.map((c) =>
      ids.has(c.id)
        ? {
            ...c,
            stamina: persist(
              staminaOf(c, now, boostUntil) - ARENA_WINDED_STAMINA
            ),
            staminaUpdatedAt: now,
          }
        : c
    ),
  };
}

// ===========================================================================
// RECOVERY SUPPLIES — the Bazaar's GOLD shelf (dev revenue → Treasury)
// ===========================================================================

export type RecoveryItemId =
  | "tide_tonic"
  | "tide_elixir"
  | "coral_salve"
  | "second_wind_incense";

export interface RecoveryItemDef {
  id: RecoveryItemId;
  name: string;
  icon: string;
  description: string;
  /** Base GOLD price from config (a SYSTEM price: indexedPrice applies). */
  basePrice: number;
  /** Whether using the item needs a target crab. */
  needsTarget: boolean;
}

export const RECOVERY_ITEMS: Record<RecoveryItemId, RecoveryItemDef> = {
  tide_tonic: {
    id: "tide_tonic",
    name: "Tide Tonic",
    icon: "🧪",
    description: `Restores ${TIDE_TONIC_RESTORE} stamina to one crab.`,
    basePrice: RECOVERY_ITEM_PRICES.tide_tonic,
    needsTarget: true,
  },
  tide_elixir: {
    id: "tide_elixir",
    name: "Tide Elixir",
    icon: "⚗️",
    description: "Restores one crab's stamina to full.",
    basePrice: RECOVERY_ITEM_PRICES.tide_elixir,
    needsTarget: true,
  },
  coral_salve: {
    id: "coral_salve",
    name: "Coral Salve",
    icon: "🩹",
    description: "Cures one crab's wound instantly.",
    basePrice: RECOVERY_ITEM_PRICES.coral_salve,
    needsTarget: true,
  },
  second_wind_incense: {
    id: "second_wind_incense",
    name: "Second Wind Incense",
    icon: "🕯️",
    description: `ALL recovery ×${RECOVERY_BOOST_MULTIPLIER} for 2 hours — stamina regen and wound countdowns alike.`,
    basePrice: RECOVERY_ITEM_PRICES.second_wind_incense,
    needsTarget: false,
  },
};

export const RECOVERY_ITEM_LIST: RecoveryItemDef[] =
  Object.values(RECOVERY_ITEMS);

/** The price the Supplies shelf charges right now (system price). */
export function recoveryItemPrice(
  player: PlayerProfile,
  itemId: RecoveryItemId
): number {
  return indexedPrice(
    RECOVERY_ITEMS[itemId].basePrice,
    economyOf(player).priceIndex
  );
}

/** How many of an item the player holds (recovery + crafted share one record). */
export function itemCountOf(player: PlayerProfile, itemId: string): number {
  return Math.max(0, Math.floor(player.items?.[itemId] ?? 0));
}

function withItemCount(
  player: PlayerProfile,
  itemId: string,
  count: number
): PlayerProfile {
  return {
    ...player,
    items: { ...(player.items ?? {}), [itemId]: Math.max(0, Math.floor(count)) },
  };
}

export interface PurchaseResult {
  player: PlayerProfile;
  ok: boolean;
  price: number;
  reason?: string;
}

/**
 * Buy one recovery supply: the player pays the indexed price and
 * 100% of it flows into the Tide Treasury (developer revenue) via
 * applySinkSplit — a pure transfer: gold moves player → Treasury,
 * circulating supply and minted/burned counters never change.
 * Insufficient gold changes nothing.
 */
export function applyRecoveryPurchase(
  player: PlayerProfile,
  itemId: RecoveryItemId
): PurchaseResult {
  const price = recoveryItemPrice(player, itemId);
  if (player.gold < price) {
    return { player, ok: false, price, reason: "Not enough GOLD." };
  }
  const debited: PlayerProfile = { ...player, gold: player.gold - price };
  const funded = applySinkSplit(debited, price, 0);
  return {
    player: withItemCount(funded, itemId, itemCountOf(funded, itemId) + 1),
    ok: true,
    price,
  };
}

export interface UseResult {
  player: PlayerProfile;
  ok: boolean;
  /** Success headline for the toast (when ok). */
  message?: string;
  /** Why the use was refused (item NOT consumed) when !ok. */
  reason?: string;
}

/**
 * Use one recovery supply. Rules are common-sense and enforced here —
 * a refused use never consumes the item:
 *  - Tonic: target crab, +TIDE_TONIC_RESTORE clamped at MAX; refuses
 *    at full stamina.
 *  - Elixir: target crab, restores to full; refuses when it would
 *    restore LESS than a Tonic (missing < TIDE_TONIC_RESTORE).
 *  - Salve: target must actually be Wounded; clears the wound and
 *    restarts the regen clock from now.
 *  - Incense: no target; (re)starts the player-wide ×3 recovery
 *    window — re-using while active simply resets the 2h from now
 *    (no stacking beyond one window).
 */
export function applyRecoveryUse(
  player: PlayerProfile,
  itemId: RecoveryItemId,
  crabId: string | undefined,
  now: number
): UseResult {
  const def = RECOVERY_ITEMS[itemId];
  if (itemCountOf(player, itemId) <= 0) {
    return { player, ok: false, reason: `You have no ${def.name}.` };
  }
  const boostUntil = recoveryBoostActive(player, now)
    ? player.recoveryBoostUntil!
    : 0;

  if (itemId === "second_wind_incense") {
    const next: PlayerProfile = {
      ...player,
      recoveryBoostUntil: now + RECOVERY_BOOST_DURATION_MS,
    };
    return {
      player: withItemCount(next, itemId, itemCountOf(next, itemId) - 1),
      ok: true,
      message: `Second Wind lit! All recovery ×${RECOVERY_BOOST_MULTIPLIER} for 2 hours.`,
    };
  }

  const crab = crabId
    ? player.crabs.find((c) => c.id === crabId)
    : undefined;
  if (!crab) {
    return { player, ok: false, reason: "Pick a crab first." };
  }

  const patchCrab = (patch: Partial<Crab>): PlayerProfile => ({
    ...player,
    crabs: player.crabs.map((c) => (c.id === crab.id ? { ...c, ...patch } : c)),
  });
  const consume = (p: PlayerProfile): PlayerProfile =>
    withItemCount(p, itemId, itemCountOf(p, itemId) - 1);

  if (itemId === "tide_tonic" || itemId === "tide_elixir") {
    const current = staminaOf(crab, now, boostUntil);
    if (current >= MAX_STAMINA) {
      return {
        player,
        ok: false,
        reason: `${crab.name} is already at full stamina.`,
      };
    }
    if (itemId === "tide_elixir" && MAX_STAMINA - current < TIDE_TONIC_RESTORE) {
      return {
        player,
        ok: false,
        reason: `${crab.name} is only missing ${Math.floor(
          MAX_STAMINA - current
        )} stamina — a Tide Tonic is the better buy.`,
      };
    }
    const restored =
      itemId === "tide_tonic"
        ? Math.min(MAX_STAMINA, current + TIDE_TONIC_RESTORE)
        : MAX_STAMINA;
    return {
      player: consume(
        patchCrab({ stamina: persist(restored), staminaUpdatedAt: now })
      ),
      ok: true,
      message: `${def.name} used on ${crab.name}: stamina ${Math.floor(
        current
      )} → ${Math.floor(restored)}.`,
    };
  }

  // coral_salve
  if (!isWounded(crab, now)) {
    return {
      player,
      ok: false,
      reason: `${crab.name} is not wounded — salve would be wasted.`,
    };
  }
  return {
    player: consume(
      patchCrab({
        woundedUntil: undefined,
        stamina: persist(staminaOf(crab, now, boostUntil)),
        staminaUpdatedAt: now,
      })
    ),
    ok: true,
    message: `${crab.name}'s wound is healed! Back to the tides.`,
  };
}
