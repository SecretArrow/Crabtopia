// Crabtopia - Shared localStorage hook + inventory key constants
// Used by all activity screens (Mining, Exploration, Crafting, Inventory, Breeding).
"use client";

import { useState, useEffect, useCallback } from "react";
import type { MaterialId, ItemId } from "../data/materials";

/**
 * Persistent state hook backed by localStorage. SSR-safe: returns `initial`
 * on the server and hydrates from storage on the client (initial state is read
 * lazily inside useState so it doesn't re-render).
 */
export function useLocalStorage<T>(
  key: string,
  initial: T
): [T, (v: T | ((prev: T) => T)) => void] {
  const [state, setState] = useState<T>(() => {
    if (typeof window === "undefined") return initial;
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : initial;
    } catch {
      return initial;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(state));
    } catch {
      // ignore quota / serialization errors
    }
  }, [key, state]);

  const set = useCallback((v: T | ((prev: T) => T)) => {
    setState((prev) =>
      typeof v === "function" ? (v as (p: T) => T)(prev) : v
    );
  }, []);

  return [state, set];
}

// ---------- SHARED STORAGE KEYS ----------

/** Inventory: materials + item counts. */
export const INV_KEY = "crabtopia_inventory_v1";

/** Mining state: energy, last-regen timestamp, per-node cooldown ends. */
export const MINING_KEY = "crabtopia_mining_v1";

/** Exploration state: tickets, last-reset timestamp, map seed, revealed tiles. */
export const EXPLORATION_KEY = "crabtopia_exploration_v1";

/** Temporary buffs (drop rate, legendary chance, trap debuff). */
export const BUFFS_KEY = "crabtopia_buffs_v1";

// ---------- SHARED STATE SHAPES ----------

export interface InventoryState {
  materials: Partial<Record<MaterialId, number>>;
  items: Partial<Record<ItemId, number>>;
}

export interface MiningState {
  energy: number;
  lastRegenAt: number; // ms timestamp of last energy regen tick
  nodeCooldowns: Record<string, number>; // nodeId -> cooldown end ms
}

export interface ExplorationState {
  tickets: number;
  lastResetAt: number; // ms timestamp; tickets refresh once per day
  mapSeed: number;
  revealed: Record<number, boolean>; // tileIndex -> revealed
}

export interface BuffsState {
  // Lucky Charm: +1 bonus material per treasure chest for the next N
  // chests (charges are spent per chest in ExplorationScreen; the
  // legacy `percent` field is carried in the data but drives nothing)
  dropRate?: { percent: number; charges: number };
  // Legendary Lure: +legendary chance for next breed
  legendaryChance?: { percent: number; charges: number };
  // Trap debuff: -20% HP on strongest crab next arena battle (clears after one battle)
  trapDebuff?: boolean;
}

// ---------- DEFAULTS ----------

export const MAX_MINING_ENERGY = 10;
export const MINING_REGEN_MS = 5 * 60 * 1000; // 1 energy per 5 min
export const MAX_EXPLORATION_TICKETS = 3;
export const EXPLORATION_DAY_MS = 24 * 60 * 60 * 1000;

export const DEFAULT_INVENTORY: InventoryState = {
  materials: {},
  items: {},
};

export const DEFAULT_MINING: MiningState = {
  energy: MAX_MINING_ENERGY,
  lastRegenAt: Date.now(),
  nodeCooldowns: {},
};

export const DEFAULT_EXPLORATION: ExplorationState = {
  tickets: MAX_EXPLORATION_TICKETS,
  lastResetAt: Date.now(),
  mapSeed: Math.floor(Math.random() * 1_000_000),
  revealed: {},
};

export const DEFAULT_BUFFS: BuffsState = {};

// ---------- INVENTORY MUTATION HELPERS ----------
// Pure functions that produce a new InventoryState; screens call setInv with these.

export function addMaterials(
  inv: InventoryState,
  gains: Partial<Record<MaterialId, number>>
): InventoryState {
  const materials: Partial<Record<MaterialId, number>> = { ...inv.materials };
  for (const k of Object.keys(gains) as MaterialId[]) {
    materials[k] = (materials[k] ?? 0) + (gains[k] ?? 0);
  }
  return { ...inv, materials };
}

export function consumeMaterials(
  inv: InventoryState,
  cost: Record<MaterialId, number>
): InventoryState {
  const materials: Partial<Record<MaterialId, number>> = { ...inv.materials };
  for (const k of Object.keys(cost) as MaterialId[]) {
    const need = cost[k];
    if (need > 0) {
      materials[k] = Math.max(0, (materials[k] ?? 0) - need);
    }
  }
  return { ...inv, materials };
}

export function addItem(
  inv: InventoryState,
  itemId: ItemId,
  count = 1
): InventoryState {
  const items: Partial<Record<ItemId, number>> = { ...inv.items };
  items[itemId] = (items[itemId] ?? 0) + count;
  return { ...inv, items };
}

export function consumeItem(
  inv: InventoryState,
  itemId: ItemId,
  count = 1
): InventoryState {
  const items: Partial<Record<ItemId, number>> = { ...inv.items };
  items[itemId] = Math.max(0, (items[itemId] ?? 0) - count);
  return { ...inv, items };
}
