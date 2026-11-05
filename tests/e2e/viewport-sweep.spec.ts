// Crabtopia E2E — Viewport sweep (responsive hardening).
//
// For each main destination at phone / tablet / desktop sizes, assert:
//   1. The screen renders its identifying content.
//   2. There is NO page-level horizontal overflow
//      (documentElement.scrollWidth <= clientWidth + 1).
//   3. The screen's primary action is visible.
// Navigation always goes through the VISIBLE nav (desktop sidebar vs
// mobile bottom bar + its "More" popover), one page per viewport.
import { test, expect, type Page } from "@playwright/test";
import { completeOnboarding } from "./helpers";

const VIEWPORTS = [
  { name: "phone 390x844", width: 390, height: 844 },
  { name: "tablet 768x1024", width: 768, height: 1024 },
  { name: "desktop 1440x900", width: 1440, height: 900 },
] as const;

/** Click a nav destination, opening the mobile "More" popover if needed. */
async function goTo(page: Page, label: string): Promise<void> {
  const direct = page
    .locator(`nav button:has-text('${label}'):visible`)
    .first();
  if (await direct.isVisible({ timeout: 900 }).catch(() => false)) {
    await direct.click({ force: true });
    return;
  }
  const more = page.locator("nav button[aria-label='More']:visible").first();
  await more.click({ force: true });
  await page.waitForTimeout(350);
  await page
    .locator(`nav button:has-text('${label}'):visible`)
    .first()
    .click({ force: true });
}

async function expectNoHorizontalOverflow(page: Page, label: string) {
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow, `${label}: page-level horizontal overflow`).toBeLessThanOrEqual(1);
}

interface ScreenCase {
  nav: string;
  /** Identifying content for the screen (proven patterns). */
  identify: RegExp;
  /** Assert the screen's primary action/control is visible. */
  primary: (page: Page) => Promise<void>;
}

const SCREENS: ScreenCase[] = [
  {
    nav: "Home",
    identify: /Deploy a Dive|Welcome/i,
    primary: async (page) => {
      await expect(
        page.locator("main button:has-text('Deploy a Dive')").first(),
      ).toBeVisible();
    },
  },
  {
    nav: "Arena",
    identify: /Press to Dive|Arena/i,
    primary: async (page) => {
      await expect(
        page.locator("button:has-text('Press to Dive')").first(),
      ).toBeVisible();
    },
  },
  {
    nav: "Mining",
    identify: /Crystal Mines|Kelp Ridge/i,
    primary: async (page) => {
      await expect(
        page.locator('[data-testid="mining-team-select"]'),
      ).toBeVisible();
    },
  },
  {
    nav: "Explore",
    identify: /Tide Wilderness/i,
    primary: async (page) => {
      await expect(
        page.locator('[data-testid="exploration-team-select"]'),
      ).toBeVisible();
    },
  },
  // (No separate "Breeding" destination: breeding lives in the Nursery
  // below — one canonical surface, one nav entry.)
  {
    nav: "Crafting",
    identify: /Tide Forge|Recipes/i,
    primary: async (page) => {
      await expect(
        page.locator("main button:has-text('Recipes')").first(),
      ).toBeVisible();
    },
  },
  {
    nav: "Inventory",
    identify: /Vault|Materials/i,
    primary: async (page) => {
      await expect(
        page.locator("main button:has-text('Materials')").first(),
      ).toBeVisible();
    },
  },
  {
    nav: "Codex",
    identify: /Codex/i,
    primary: async (page) => {
      await expect(page.locator('[data-testid="codex-elements"]')).toBeVisible();
    },
  },
  {
    nav: "Dive Map",
    identify: /World|Site|Dive/i,
    primary: async (page) => {
      await expect(
        page.locator("main button:has-text('Deploy')").first(),
      ).toBeVisible();
    },
  },
  {
    nav: "Teams",
    identify: /Teams|formation/i,
    primary: async (page) => {
      await expect(
        page.locator('[data-testid="formation-board"]'),
      ).toBeVisible();
    },
  },
  {
    nav: "Hall",
    identify: /Driftwood Hall/i,
    primary: async (page) => {
      await expect(
        page.locator("main button:has-text('Hire')").first(),
      ).toBeVisible();
    },
  },
  {
    nav: "Nursery",
    identify: /Nursery/i,
    primary: async (page) => {
      await expect(page.locator("main")).toContainText(/Parent|Nursery/i);
    },
  },
  {
    nav: "Bazaar",
    identify: /Bazaar of Tides/i,
    primary: async (page) => {
      await expect(
        page.locator('[role="tablist"][aria-label="Bazaar sections"]'),
      ).toBeVisible();
    },
  },
];

for (const vp of VIEWPORTS) {
  test(`viewport sweep — all main screens fit ${vp.name}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await completeOnboarding(page);

    for (const screen of SCREENS) {
      await goTo(page, screen.nav);
      await page.waitForTimeout(900);
      await expect(
        page.locator("main"),
        `${screen.nav} @ ${vp.name}: identifying content`,
      ).toContainText(screen.identify, { timeout: 8000 });
      await screen.primary(page);
      await expectNoHorizontalOverflow(page, `${screen.nav} @ ${vp.name}`);
    }
  });
}
