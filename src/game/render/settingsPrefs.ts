// Crabtopia — Settings preferences (Reduce motion / High contrast).
//
// The Settings modal toggles live OUTSIDE the game save: a dedicated
// localStorage key, applied as classes on <html> that globals.css
// honours (.reduce-motion mirrors the OS prefers-reduced-motion rules;
// .high-contrast lifts dim text and borders). Applied on shell mount
// and immediately when a toggle flips, so the settings actually do
// something — previously the toggles were dead local state.

export interface SettingsPrefs {
  reduceMotion: boolean;
  highContrast: boolean;
}

const STORAGE_KEY = "crabtopia-settings";
export const DEFAULT_PREFS: SettingsPrefs = {
  reduceMotion: false,
  highContrast: false,
};

export function loadSettingsPrefs(
  storage: Pick<Storage, "getItem"> | null | undefined,
): SettingsPrefs {
  if (!storage) return { ...DEFAULT_PREFS };
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_PREFS };
    const parsed = JSON.parse(raw) as Partial<SettingsPrefs>;
    return {
      reduceMotion: parsed.reduceMotion === true,
      highContrast: parsed.highContrast === true,
    };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function saveSettingsPrefs(
  storage: Pick<Storage, "setItem"> | null | undefined,
  prefs: SettingsPrefs,
): void {
  if (!storage) return;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Storage full/blocked — the classes still apply for this session.
  }
}

/** Reflect the prefs onto <html> (idempotent). */
export function applySettingsPrefs(
  prefs: SettingsPrefs,
  root: { classList: Pick<DOMTokenList, "toggle"> } | null | undefined,
): void {
  if (!root) return;
  root.classList.toggle("reduce-motion", prefs.reduceMotion);
  root.classList.toggle("high-contrast", prefs.highContrast);
}

/** True when the user asked for reduced motion in-game or via the OS. */
export function motionReduced(
  root: { classList: Pick<DOMTokenList, "contains"> } | null | undefined,
  osReduced: boolean,
): boolean {
  return osReduced || (root?.classList.contains("reduce-motion") ?? false);
}
