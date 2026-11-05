// Crabtopia E2E — Genesis Collection in the Bazaar.
//
// Verifies: Bazaar opens, the Genesis tab shows the full collection stats
// (333 total supply, 100 listed = 30%, 233 reserve), and listed Genesis
// cards render with prices and Buy buttons.
import { test, expect } from "@playwright/test";
import { completeOnboarding } from "./helpers";

test.describe("Genesis market", () => {
  test("Bazaar Genesis tab shows supply 333, 100 listed, cards for sale", async ({ page }) => {
    await completeOnboarding(page);

    await page.locator("nav button:has-text('Bazaar')").first().click({ force: true });
    await expect(page.locator("text=Bazaar of Tides").first()).toBeVisible({ timeout: 8000 });

    // Switch to the Genesis tab.
    await page.locator("button:has-text('Genesis Collection')").first().click({ force: true });

    const section = page.locator("[data-testid='genesis-section']");
    await expect(section).toBeVisible({ timeout: 8000 });

    // Supply stats: 333 total, 100 listed (30%), 233 reserve.
    await expect(section.locator("text=Total Supply")).toBeVisible();
    await expect(section.locator("text=333").first()).toBeVisible();
    await expect(section.locator("text=Listed on Market (30%)")).toBeVisible();
    await expect(section.locator("text=100").first()).toBeVisible();
    await expect(section.locator("text=233").first()).toBeVisible();
    await expect(section.locator("text=Reserve · Not for Sale")).toBeVisible();

    // First page renders Genesis cards (9 per page) with Buy buttons.
    const cards = page.locator("[data-testid='genesis-card']");
    await expect(cards.first()).toBeVisible({ timeout: 8000 });
    expect(await cards.count()).toBeGreaterThanOrEqual(9);
    await expect(section.locator("button:has-text('Buy')").first()).toBeVisible();
  });
});
