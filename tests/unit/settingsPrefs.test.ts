// Crabtopia — Unit tests: settings preferences (Phase 4).
// The Settings "Reduce motion" / "High contrast" toggles used to be
// dead local state; they now persist outside the game save and apply
// as <html> classes. These tests lock the storage round-trip, the
// corruption fallback, and the class application.
import { describe, expect, it } from "vitest";
import {
  DEFAULT_PREFS,
  applySettingsPrefs,
  loadSettingsPrefs,
  motionReduced,
  saveSettingsPrefs,
} from "../../src/game/render/settingsPrefs";

function fakeStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => {
      map.set(k, v);
    },
    map,
  };
}

function fakeRoot() {
  const classes = new Set<string>();
  return {
    classList: {
      toggle: (name: string, force?: boolean) => {
        if (force) classes.add(name);
        else classes.delete(name);
        return force ?? false;
      },
      contains: (name: string) => classes.has(name),
    },
    classes,
  };
}

describe("settingsPrefs", () => {
  it("defaults when storage is empty or unavailable", () => {
    expect(loadSettingsPrefs(fakeStorage())).toEqual(DEFAULT_PREFS);
    expect(loadSettingsPrefs(null)).toEqual(DEFAULT_PREFS);
    expect(loadSettingsPrefs(undefined)).toEqual(DEFAULT_PREFS);
  });

  it("round-trips through storage", () => {
    const storage = fakeStorage();
    saveSettingsPrefs(storage, { reduceMotion: true, highContrast: false });
    expect(loadSettingsPrefs(storage)).toEqual({
      reduceMotion: true,
      highContrast: false,
    });
  });

  it("survives corrupted storage and coerces non-booleans off", () => {
    expect(
      loadSettingsPrefs(fakeStorage({ "crabtopia-settings": "{oops" })),
    ).toEqual(DEFAULT_PREFS);
    expect(
      loadSettingsPrefs(
        fakeStorage({
          "crabtopia-settings": JSON.stringify({ reduceMotion: "yes" }),
        }),
      ),
    ).toEqual(DEFAULT_PREFS);
  });

  it("applies and clears the <html> classes", () => {
    const root = fakeRoot();
    applySettingsPrefs({ reduceMotion: true, highContrast: true }, root);
    expect(root.classes.has("reduce-motion")).toBe(true);
    expect(root.classes.has("high-contrast")).toBe(true);
    applySettingsPrefs({ reduceMotion: false, highContrast: false }, root);
    expect(root.classes.size).toBe(0);
    applySettingsPrefs({ reduceMotion: true, highContrast: true }, null);
  });

  it("motionReduced honours OS setting OR the in-game class", () => {
    const root = fakeRoot();
    expect(motionReduced(root, false)).toBe(false);
    expect(motionReduced(root, true)).toBe(true);
    applySettingsPrefs({ reduceMotion: true, highContrast: false }, root);
    expect(motionReduced(root, false)).toBe(true);
    expect(motionReduced(null, false)).toBe(false);
  });
});
