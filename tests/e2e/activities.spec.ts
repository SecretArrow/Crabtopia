// Crabtopia E2E — Activity screens smoke tests.
//
// Covers Mining, Exploration, the Nursery (breeding), Crafting, and
// Inventory. Each test
// completes onboarding (so the player has 2000 gold and 3 default crabs),
// clicks into the activity via the sidebar nav, and asserts the screen's
// key UI markers render. Where safe, we also drive one interaction and verify
// the resulting state change.

import { test, expect } from "@playwright/test";
import { completeOnboarding, skipTutorial } from "./helpers";

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

    // The click spends energy and starts the node cooldown up front
    // (the button label flips to "Cooling..." with a countdown) — the
    // watched dig that opens over it is presentation of the same run.
    await expect(page.locator("text=/Cooling|Cooldown/i").first()).toBeVisible({ timeout: 6000 });
  });

  test("mining plays out the dig and claims the haul from the finale", async ({ page }) => {
    await completeOnboarding(page);
    await page.locator("nav button:has-text('Mining')").first().click({ force: true });
    await page.waitForTimeout(1500);
    await expect(page.locator("text=/Crystal Mines/i").first()).toBeVisible({ timeout: 5000 });

    const mineBtn = page.locator("main button:has-text('Mine')").first();
    await mineBtn.click({ force: true });

    // The watched dig opens with the team's five real sprites digging.
    const scene = page.getByTestId("mining-scene");
    await expect(scene).toBeVisible({ timeout: 5000 });
    await expect(scene.getByTestId("animated-crab")).toHaveCount(5, { timeout: 5000 });

    // Skip the dig → the finale's claim action appears → claim.
    await scene.locator("button:has-text('Skip')").first().click({ force: true });
    const action = page.getByTestId("loot-reveal-action");
    await expect(action).toContainText(/Claim Loot/, { timeout: 8000 });
    await action.locator("button").click({ force: true });

    // The haul is granted through the normal path: the Mined toast
    // fires, the scene closes, and a material chip lands in the
    // inventory peek.
    await expect(page.locator("text=/Mined Kelp Ridge/i").first()).toBeVisible({ timeout: 5000 });
    await expect(scene).toBeHidden({ timeout: 5000 });
    await expect(page.locator("text=/×[1-9]/").first()).toBeVisible({ timeout: 5000 });
  });

  test("closing the dig scene claims nothing; the loot waits and can be claimed", async ({ page }) => {
    await completeOnboarding(page);
    await page.locator("nav button:has-text('Mining')").first().click({ force: true });
    await page.waitForTimeout(1500);
    await page.locator("main button:has-text('Mine')").first().click({ force: true });

    const scene = page.getByTestId("mining-scene");
    await expect(scene).toBeVisible({ timeout: 5000 });
    // Close mid-dig — no claim happens.
    await scene.locator("button[aria-label='Close without claiming']").click({ force: true });
    await expect(scene).toBeHidden({ timeout: 5000 });
    await expect(page.locator("text=/Mined Kelp Ridge/i")).toHaveCount(0);

    // The pending-loot banner offers Watch + Claim; claiming from the
    // banner grants the haul (toast fires exactly once).
    await expect(page.locator("text=/loot waiting/i").first()).toBeVisible({ timeout: 5000 });
    await page.locator("button:has-text('Claim Loot')").first().click({ force: true });
    await expect(page.locator("text=/Mined Kelp Ridge/i").first()).toBeVisible({ timeout: 5000 });
    await expect(page.locator("text=/loot waiting/i")).toHaveCount(0);
  });

  test("watch the dig on a completed dive, then claim from the finale", async ({ page }) => {
    await completeOnboarding(page);
    // Force the first free world site into a completed player dive in
    // the persisted save, then reload so the store rehydrates with it.
    await page.evaluate(() => {
      const raw = localStorage.getItem("crabtopia-save");
      if (!raw) throw new Error("persisted save not found");
      const data = JSON.parse(raw);
      const st = data.state;
      const teamId = st.player.teams[0].id;
      const site =
        st.worldSites.find((s: { occupiedBy?: string }) => !s.occupiedBy) ??
        st.worldSites[0];
      Object.assign(site, {
        occupiedBy: teamId,
        occupierName: st.player.name,
        teamId,
        ownerIsPlayer: true,
        state: "completed",
        baseReward: 500,
        rewardRemaining: 500,
        deployTime: Date.now() - 10 * 60 * 1000,
        raidCount: 0,
      });
      localStorage.setItem("crabtopia-save", JSON.stringify(data));
    });
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);
    await skipTutorial(page);

    await page.locator("nav button:has-text('Dive Map')").first().click({ force: true });
    await page.waitForTimeout(1000);
    const watchBtn = page.locator("button:has-text('Watch the Dig')").first();
    await expect(watchBtn).toBeVisible({ timeout: 5000 });
    await watchBtn.click({ force: true });

    const scene = page.getByTestId("mining-scene");
    await expect(scene).toBeVisible({ timeout: 5000 });
    await expect(scene.getByTestId("animated-crab")).toHaveCount(5, { timeout: 5000 });
    await scene.locator("button:has-text('Skip')").first().click({ force: true });

    const action = page.getByTestId("loot-reveal-action");
    await expect(action).toContainText(/Claim/, { timeout: 8000 });
    await action.locator("button").click({ force: true });

    // Watched ≡ direct claim: 500 gross at the 0% tithe bracket of a
    // fresh 2,000-gold balance lands as exactly +500, and the scene
    // closes because the site is now claimed.
    await expect(scene).toBeHidden({ timeout: 5000 });
    await expect
      .poll(
        async () =>
          page.evaluate(() => {
            const data = JSON.parse(
              localStorage.getItem("crabtopia-save") ?? "{}"
            );
            return data.state?.player?.gold;
          }),
        { timeout: 5000 }
      )
      .toBe(2500);
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
