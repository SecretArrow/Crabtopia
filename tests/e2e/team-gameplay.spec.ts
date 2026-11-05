// Crabtopia E2E — Team-based gameplay system.
//
// Verifies the unified flow the spec demands:
//   Choose Activity → Select Team → Start
// for Arena (deployment board + 5v5 row grid), Mining (team panel + power
// gates) and Exploration (team panel), plus the formation preset editor in
// Team Management. No step may ask the player to pick individual crabs.

import { test, expect } from "@playwright/test";
import { completeOnboarding, skipTutorial } from "./helpers";

async function enterArenaDeploy(page: import("@playwright/test").Page) {
  await completeOnboarding(page);
  await page.locator("nav button:has-text('Arena')").first().click({ force: true });
  await page.waitForTimeout(1500);
  await page.locator("button:has-text('Press to Dive')").first().click({ force: true });
  await page.waitForTimeout(1500);
  await page.locator("main button:has-text('FIGHT')").click({ force: true });
  await page.waitForTimeout(2000);
  const battleBtns = page.locator("main button").filter({ hasText: /Battle/ });
  const count = await battleBtns.count();
  for (let i = 0; i < count; i++) {
    const b = battleBtns.nth(i);
    const txt = (await b.innerText()).trim();
    if (/Battle/.test(txt) && !/Log/.test(txt) && !(await b.isDisabled())) {
      await b.click({ force: true });
      break;
    }
  }
  await page.waitForTimeout(2000);
  await expect(page.locator("text=Deploy Your Tideguard")).toBeVisible({ timeout: 5000 });
}

test.describe("Team-based gameplay", () => {
  test("arena: select a saved team on the deployment board, no individual crab picking", async ({ page }) => {
    await enterArenaDeploy(page);

    // Deployment board + shared team selector are the whole step.
    await expect(page.locator('[data-testid="deployment-board"]')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('[data-testid="arena-team-select"]')).toBeVisible({ timeout: 5000 });

    // The starter team is pre-selected and marked on its card.
    const selected = page.locator('[data-testid^="arena-team-select-card-"][data-selected="true"]');
    await expect(selected).toHaveCount(1);

    // Player deployment rows exist for all three lines.
    await expect(page.locator('[data-testid="deploy-row-front"]')).toBeVisible();
    await expect(page.locator('[data-testid="deploy-row-mid"]')).toBeVisible();
    await expect(page.locator('[data-testid="deploy-row-back"]')).toBeVisible();

    // Switching formation preset re-deploys the same 5 members.
    await page.locator('[data-testid="deploy-preset-backline"]').click({ force: true });
    await page.waitForTimeout(400);
    const backMembers = page.locator('[data-testid="deploy-row-back"] button[aria-pressed]');
    await expect(backMembers).toHaveCount(3);

    // Deploy starts the battle on the 5v5 row grid.
    await page.locator("main button:has-text('Deploy')").first().click({ force: true });
    await page.waitForTimeout(6500);
    await expect(page.getByTestId("battle-timer")).toBeVisible({ timeout: 10000 });
    await expect(page.locator('[data-testid="battle-row-player-front"]')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('[data-testid="battle-row-enemy-front"]')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('[data-testid="battle-row-player-back"]')).toBeVisible({ timeout: 5000 });
  });

  test("teams: formation preset editor redistributes the 5 members", async ({ page }) => {
    await completeOnboarding(page);
    await page.locator("nav button:has-text('Teams')").first().click({ force: true });
    await expect(page.locator("h1:has-text('Teams')").first()).toBeVisible({ timeout: 8000 });

    await expect(page.locator('[data-testid="formation-board"]')).toBeVisible({ timeout: 8000 });
    // Balanced default: 2 front / 1 mid / 2 back.
    await expect(page.locator('[data-testid="formation-row-front"] button')).toHaveCount(2);
    await expect(page.locator('[data-testid="formation-row-back"] button')).toHaveCount(2);

    // Offensive preset: 3 front / 1 mid / 1 back — same members, new rows.
    await page.locator('[data-testid="formation-preset-offensive"]').click({ force: true });
    await page.waitForTimeout(400);
    await expect(page.locator('[data-testid="formation-row-front"] button')).toHaveCount(3);
    await expect(page.locator('[data-testid="formation-row-back"] button')).toHaveCount(1);
  });

  test("mining: team panel with power gates per node", async ({ page }) => {
    await completeOnboarding(page);
    await page.locator("nav button:has-text('Mining')").first().click({ force: true });
    await page.waitForTimeout(1500);

    // Team selector present with the starter team pre-selected.
    await expect(page.locator('[data-testid="mining-team-select"]')).toBeVisible({ timeout: 5000 });
    await expect(
      page.locator('[data-testid^="mining-team-select-card-"][data-selected="true"]')
    ).toHaveCount(1);
    await expect(page.locator("text=/Team Power/").first()).toBeVisible({ timeout: 5000 });
    await expect(page.locator("text=/Yield Bonus/").first()).toBeVisible({ timeout: 5000 });

    // First node (Kelp Ridge, no requirement) is minable right away…
    const mineBtn = page.locator("main button:has-text('Mine')").first();
    await expect(mineBtn).toBeEnabled({ timeout: 5000 });

    // …while the Crystal Vault (3500 power) is locked for a fresh team.
    await expect(page.locator("main button:has-text('Need ⚔ 3500')").first()).toBeVisible({ timeout: 5000 });
    await expect(page.locator("main button:has-text('Need ⚔ 3500')").first()).toBeDisabled();
  });

  test("exploration: expedition team panel gates the wilderness", async ({ page }) => {
    await completeOnboarding(page);
    await page.locator("nav button:has-text('Explore')").first().click({ force: true });
    await page.waitForTimeout(1500);

    await expect(page.locator('[data-testid="exploration-team-select"]')).toBeVisible({ timeout: 5000 });
    await expect(
      page.locator('[data-testid^="exploration-team-select-card-"][data-selected="true"]')
    ).toHaveCount(1);
    // The 5x5 wilderness and ticket counter still render beneath the panel.
    await expect(page.locator("text=/Tide Wilderness/i").first()).toBeVisible({ timeout: 5000 });
    await expect(page.locator("text=/3\\/3/").first()).toBeVisible({ timeout: 5000 });
  });

  // ---- Insufficient roster → Market guidance ----
  // Simulate a brand-new player who owns only 3 crabs by trimming the
  // persisted save, then reload so the store rehydrates with the small
  // roster. Guidance must appear (never a dead end) and its CTA must land
  // on the Bazaar — the Genesis CTA directly on the Genesis tab.
  async function shrinkRosterToThree(page: import("@playwright/test").Page) {
    await page.evaluate(() => {
      const raw = localStorage.getItem("crabtopia-save");
      if (!raw) throw new Error("persisted save not found");
      const data = JSON.parse(raw);
      data.state.player.crabs = data.state.player.crabs.slice(0, 3);
      data.state.player.teams = data.state.player.teams.map(
        (t: { crabIds: string[] }) => ({ ...t, crabIds: t.crabIds.slice(0, 3) })
      );
      localStorage.setItem("crabtopia-save", JSON.stringify(data));
    });
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);
    await skipTutorial(page);
  }

  test("insufficient roster: Teams guides to the Market; CTA reaches the Bazaar", async ({ page }) => {
    await completeOnboarding(page);
    await shrinkRosterToThree(page);

    await page.locator("nav button:has-text('Teams')").first().click({ force: true });
    await page.waitForTimeout(1200);
    const banner = page.locator('[data-testid="insufficient-crabs-banner"]');
    await expect(banner).toBeVisible({ timeout: 10000 });
    await expect(banner).toContainText("2 more crabs");

    // Primary CTA → Bazaar.
    await page.locator('[data-testid="buy-crabs-cta"] button').click({ force: true });
    await expect(
      page.locator('[role="tablist"][aria-label="Bazaar sections"]')
    ).toBeVisible({ timeout: 10000 });

    // Genesis CTA → Bazaar opens directly on the Genesis Collection tab.
    await page.locator("nav button:has-text('Teams')").first().click({ force: true });
    await page.waitForTimeout(1200);
    await page.locator('[data-testid="buy-genesis-cta"] button').click({ force: true });
    const genesisTab = page.locator('[role="tab"]', { hasText: "Genesis Collection" });
    await expect(genesisTab).toHaveAttribute("aria-selected", "true", { timeout: 10000 });
  });

  test("insufficient roster: Mining team select shows the same Market guidance", async ({ page }) => {
    await completeOnboarding(page);
    await shrinkRosterToThree(page);

    await page.locator("nav button:has-text('Mining')").first().click({ force: true });
    await page.waitForTimeout(1500);
    const guidance = page.locator('[data-testid="mining-team-select-insufficient"]');
    await expect(guidance).toBeVisible({ timeout: 10000 });
    await expect(guidance).toContainText("2 more crabs");
    await guidance
      .locator("button", { hasText: "Buy Crabs in Market" })
      .click({ force: true });
    await expect(
      page.locator('[role="tablist"][aria-label="Bazaar sections"]')
    ).toBeVisible({ timeout: 10000 });
  });
});
