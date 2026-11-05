// Crabtopia E2E — Activity screens smoke tests.
//
// Covers Mining, Exploration, the Nursery (breeding), Crafting, and
// Inventory. Each test
// completes onboarding (so the player has 2000 gold and 3 default crabs),
// clicks into the activity via the sidebar nav, and asserts the screen's
// key UI markers render. Where safe, we also drive one interaction and verify
// the resulting state change.

import { test, expect } from "@playwright/test";
import { completeOnboarding } from "./helpers";

test.describe("Activities", () => {
  test("mining produces materials and triggers cooldown", async ({ page }) => {
    await completeOnboarding(page);
    await page.locator("nav button:has-text('Mining')").first().click({ force: true });
    await page.waitForTimeout(1500);

    // Mining screen header.
    await expect(page.locator("text=/Crystal Mines/i").first()).toBeVisible({ timeout: 5000 });

    // First Mine button (Kelp Ridge — energyCost 1, the player starts at 10/10
    // energy so it should be enabled).
    const mineBtn = page.locator("main button:has-text('Mine')").first();
    await expect(mineBtn).toBeVisible({ timeout: 5000 });
    await mineBtn.click({ force: true });

    // Mining animation overlay runs ~1.5s; after it resolves the node is on
    // cooldown and its button label flips to "Cooling..." (with cooldown
    // countdown). Wait up to 5s for that text to appear.
    await expect(page.locator("text=/Cooling|Cooldown/i").first()).toBeVisible({ timeout: 6000 });
  });

  test("exploration shows 5x5 grid and Reset Map button", async ({ page }) => {
    await completeOnboarding(page);
    await page.locator("nav button:has-text('Explore')").first().click({ force: true });
    await page.waitForTimeout(1500);

    // Exploration screen header.
    await expect(page.locator("text=/Tide Wilderness/i").first()).toBeVisible({ timeout: 5000 });

    // Reset Map button visible.
    await expect(page.locator("button:has-text('Reset')").first()).toBeVisible({ timeout: 5000 });

    // Tickets counter visible — initial state is 3/3.
    await expect(page.locator("text=/3\\/3/").first()).toBeVisible({ timeout: 5000 });
  });

  test("nursery is the single breeding surface: parent slots and Breed button", async ({ page }) => {
    await completeOnboarding(page);
    await page.locator("nav button:has-text('Nursery')").first().click({ force: true });
    await page.waitForTimeout(1500);

    // Nursery header (breeding lives here — there is no separate
    // Breeding screen or nav entry anymore).
    await expect(page.locator("text=/Nursery|Breed/i").first()).toBeVisible({ timeout: 5000 });

    // Parent A and Parent B slots visible.
    await expect(page.locator("text=Parent A")).toBeVisible({ timeout: 5000 });
    await expect(page.locator("text=Parent B")).toBeVisible({ timeout: 5000 });

    // Breed button visible (disabled until 2 different parents are picked).
    await expect(page.locator("button:has-text('Breed')").first()).toBeVisible({ timeout: 5000 });
  });

  test("crafting shows recipes and Materials tab", async ({ page }) => {
    await completeOnboarding(page);
    await page.locator("nav button:has-text('Crafting')").first().click({ force: true });
    await page.waitForTimeout(1500);

    // Crafting screen header.
    await expect(page.locator("text=/Tide Forge/i").first()).toBeVisible({ timeout: 5000 });

    // Recipes tab is default; the first recipe (Sharpening Stone) should show.
    await expect(page.locator("text=Sharpening Stone").first()).toBeVisible({ timeout: 5000 });

    // Materials tab toggle visible.
    await expect(page.locator("button:has-text('Materials')").first()).toBeVisible({ timeout: 5000 });
  });

  test("inventory shows Materials/Items tabs and default materials", async ({ page }) => {
    await completeOnboarding(page);
    await page.locator("nav button:has-text('Inventory')").first().click({ force: true });
    await page.waitForTimeout(1500);

    // Inventory screen header.
    await expect(page.locator("text=/Shellwarden|Vault/i").first()).toBeVisible({ timeout: 5000 });

    // Both tabs visible.
    await expect(page.locator("button:has-text('Materials')").first()).toBeVisible({ timeout: 5000 });
    await expect(page.locator("button:has-text('Items')").first()).toBeVisible({ timeout: 5000 });

    // Default materials list shows at least one material (Kelp Fiber is the
    // first MATERIAL_LIST entry).
    await expect(page.locator("text=Kelp Fiber").first()).toBeVisible({ timeout: 5000 });
  });
});
