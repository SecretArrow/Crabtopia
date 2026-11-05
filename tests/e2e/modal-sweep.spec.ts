// Crabtopia E2E — Modal sweep (responsive hardening).
//
// From a fresh save, open every modal the shell exposes (all Home
// event cards + GameShell Settings + Notifications) at phone and
// desktop sizes and assert the dialog PANEL fits inside the viewport
// (2px tolerance on every side) — i.e. the dialog can never be wider
// or taller than the device screen, and its content scrolls inside.
// Each modal is closed again (✕ / Cancel / backdrop corner) before
// the next opens. Modals not reachable from a fresh save are listed
// in the run output rather than forced.
import { test, expect, type Page, type Locator } from "@playwright/test";
import { completeOnboarding } from "./helpers";

interface ModalTarget {
  name: string;
  /** How to open it from the Home screen / shell chrome. */
  open: (page: Page) => Promise<void>;
}

function openViaCard(text: string) {
  return async (page: Page) => {
    const btn = page.locator(`main button:has-text('${text}')`).first();
    await btn.scrollIntoViewIfNeeded().catch(() => {});
    await btn.click({ force: true });
  };
}

const TARGETS: ModalTarget[] = [
  { name: "Quests", open: openViaCard("Quests") },
  { name: "Leviathan Raid", open: openViaCard("Leviathan") },
  { name: "Weekly Lottery", open: openViaCard("Lottery") },
  { name: "Tournament", open: openViaCard("Tournament") },
  { name: "Clans", open: openViaCard("Clans") },
  { name: "Reef Plots", open: openViaCard("Reef Plots") },
  { name: "Bazaar Auctions", open: openViaCard("Auctions") },
  { name: "Charters", open: openViaCard("Charters") },
  { name: "Tidepass", open: openViaCard("Tidepass") },
  { name: "Tideborne Boutique", open: openViaCard("Boutique") },
  { name: "Economy Health", open: openViaCard("Economy") },
  { name: "Burrow Defense", open: openViaCard("Defense") },
  { name: "Live Raid Spectate", open: openViaCard("Spectate") },
  { name: "Admin Console (auth gate)", open: openViaCard("Admin") },
  { name: "Tidewell Rewards", open: openViaCard("Rewards") },
  { name: "Shellwarden Profile", open: openViaCard("Profile") },
  { name: "Friends", open: openViaCard("Friends") },
  { name: "Tutorials", open: openViaCard("Tutorials") },
  { name: "Leaderboards", open: openViaCard("Leaderboards") },
  { name: "Replay Archive", open: openViaCard("Replay") },
  {
    name: "Notifications (shell)",
    open: async (page) => {
      await page
        .locator("button[aria-label^='Notifications']:visible")
        .first()
        .click({ force: true });
    },
  },
  {
    name: "Settings (shell)",
    open: async (page) => {
      await page
        .locator("button[aria-label='Settings']:visible")
        .first()
        .click({ force: true });
    },
  },
];

/** The topmost VISIBLE fixed overlay currently on screen, if any. */
function topOverlay(page: Page): Locator {
  return page.locator("div.fixed.inset-0:visible").last();
}

/**
 * Bounding box of the dialog PANEL inside the overlay: the largest
 * child that does not cover (nearly) the whole viewport (that would
 * be a backdrop layer, e.g. the Boutique's separate backdrop div).
 */
async function panelBox(
  overlay: Locator,
  vw: number,
  vh: number,
): Promise<{ x: number; y: number; width: number; height: number } | null> {
  return overlay.evaluate(
    (el, [w, h]) => {
      const kids = Array.from(el.children) as HTMLElement[];
      let best: DOMRect | null = null;
      for (const k of kids) {
        const r = k.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        if (r.width >= w * 0.98 && r.height >= h * 0.98) continue; // backdrop
        if (!best || r.width * r.height > best.width * best.height) best = r;
      }
      const r = best ?? el.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    },
    [vw, vh] as const,
  );
}

async function closeTopModal(page: Page): Promise<boolean> {
  if ((await topOverlay(page).count()) === 0) return false;
  // A click is not proof of closure: transient chrome can consume it
  // (a toast card once overlapped a panel's close button and ate the
  // click, dismissing itself instead). Try each strategy in turn and
  // verify the overlay actually left before declaring success; the
  // caller's count assertion remains the final strict check.
  const gone = async (): Promise<boolean> =>
    expect(topOverlay(page))
      .toHaveCount(0, { timeout: 900 })
      .then(() => true)
      .catch(() => false);

  const tryButton = async (loc: Locator, timeout: number) => {
    if (await loc.isVisible({ timeout }).catch(() => false)) {
      await loc.click({ force: true });
      return gone();
    }
    return false;
  };

  for (let round = 0; round < 2; round++) {
    const overlay = topOverlay(page);
    // 1) A labelled ✕ / Close inside the overlay.
    const closeBtn = overlay
      .locator(
        'button[aria-label^="Close"], button[aria-label="Cancel"], button:has-text("✕")',
      )
      .first();
    if (await tryButton(closeBtn, 700)) return true;
    if (round === 0) {
      // 2) A "Cancel" text button (e.g. the admin auth gate).
      const cancel = overlay.locator('button:has-text("Cancel")').first();
      if (await tryButton(cancel, 500)) return true;
      // 3) Backdrop corner click (overlays close on backdrop click;
      //    the panel stopPropagation keeps panel clicks safe).
      await page.mouse.click(6, 6);
      if (await gone()) return true;
    }
  }
  return false;
}

for (const vp of [
  { name: "phone 390x844", width: 390, height: 844 },
  { name: "desktop 1440x900", width: 1440, height: 900 },
]) {
  test(`modal sweep — every shell modal fits ${vp.name}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await completeOnboarding(page);
    // Start from Home (all event cards live there).
    await page
      .locator("nav button:has-text('Home'):visible")
      .first()
      .click({ force: true });
    await page.waitForTimeout(800);

    const opened: string[] = [];
    const skipped: string[] = [];

    for (const target of TARGETS) {
      await target.open(page).catch(() => {});
      await page.waitForTimeout(650);

      const overlay = topOverlay(page);
      const visible =
        (await overlay.count()) > 0 &&
        (await overlay.isVisible().catch(() => false));
      if (!visible) {
        skipped.push(target.name);
        continue;
      }
      opened.push(target.name);

      const box = await panelBox(overlay, vp.width, vp.height);
      expect(box, `${target.name}: panel box`).toBeTruthy();
      const TOL = 2;
      expect(box!.x, `${target.name}: left edge`).toBeGreaterThanOrEqual(-TOL);
      expect(box!.y, `${target.name}: top edge`).toBeGreaterThanOrEqual(-TOL);
      expect(
        box!.x + box!.width,
        `${target.name}: right edge`,
      ).toBeLessThanOrEqual(vp.width + TOL);
      expect(
        box!.y + box!.height,
        `${target.name}: bottom edge`,
      ).toBeLessThanOrEqual(vp.height + TOL);

      await closeTopModal(page);
      await page.waitForTimeout(350);
      // The overlay must be gone before the next target opens.
      await expect(topOverlay(page)).toHaveCount(0, { timeout: 4000 });
    }

    console.log(
      `modal sweep @ ${vp.name}: opened=${opened.length} [${opened.join(", ")}] skipped=[${skipped.join(", ")}]`,
    );
    // The tour must actually exercise the overwhelming majority.
    expect(opened.length).toBeGreaterThanOrEqual(18);
  });
}
