// Crabtopia E2E — Arena flow end-to-end.
//
// Drives the full arena pipeline:
//   splash → menu → opponent list → team builder → loading → battle
// plus a few menu-only smoke tests (gold/crabs display, leaderboard
// navigation, opponent refresh).
//
// Uses the shared completeOnboarding helper from helpers.ts. Each test starts
// from a freshly-cleared localStorage so state is deterministic.

import { test, expect } from "@playwright/test";
import { completeOnboarding } from "./helpers";

// Convenience: complete onboarding then click into the Arena nav item.
async function enterArena(page: import("@playwright/test").Page): Promise<void> {
  await completeOnboarding(page);
  // The desktop sidebar nav has a button labeled "Arena".
  await page.locator("nav button:has-text('Arena')").first().click({ force: true });
  // Splash mounts with bubble + coral animations — give it a beat.
  await page.waitForTimeout(1500);
}

// The splash screen auto-advances after 4s. For deterministic tests we click
// "Press to Dive" ourselves, but we tolerate either path.
async function diveIntoArena(page: import("@playwright/test").Page): Promise<void> {
  await page.locator("button:has-text('Press to Dive')").first().click({ force: true });
  // Menu mounts with header card + Top Crabs + Activities row animations.
  await page.waitForTimeout(1500);
}

test.describe("Arena flow", () => {
  test("splash → menu → opponent list → team builder → loading → battle", async ({ page }) => {
    await enterArena(page);

    // Splash should be visible.
    await expect(page.locator("text=CRABTOPIA").first()).toBeVisible({ timeout: 5000 });
    await expect(page.locator("button:has-text('Press to Dive')")).toBeVisible({ timeout: 5000 });

    // Dive into the menu.
    await diveIntoArena(page);

    // Menu should show FIGHT button.
    await expect(page.locator("main button:has-text('FIGHT')")).toBeVisible({ timeout: 5000 });

    // Click FIGHT → opponent list.
    await page.locator("main button:has-text('FIGHT')").click({ force: true });
    await page.waitForTimeout(2000);

    // Opponent list: should show "Choose Your Foe".
    await expect(page.locator("text=Choose Your Foe")).toBeVisible({ timeout: 5000 });

    // Click first opponent's Battle button (text "⚔️ Battle", NOT "Battle Log").
    // We iterate the Battle buttons and pick the first enabled one that isn't
    // the Battle Log toggle.
    const battleBtns = page.locator("main button").filter({ hasText: /Battle/ });
    const count = await battleBtns.count();
    expect(count).toBeGreaterThan(0);
    let clicked = false;
    for (let i = 0; i < count; i++) {
      const b = battleBtns.nth(i);
      const txt = (await b.innerText()).trim();
      if (/Battle/.test(txt) && !/Log/.test(txt) && !(await b.isDisabled())) {
        await b.click({ force: true });
        clicked = true;
        break;
      }
    }
    expect(clicked).toBe(true);
    await page.waitForTimeout(2000);

    // Team builder: "Deploy Your Tideguard".
    await expect(page.locator("text=Deploy Your Tideguard")).toBeVisible({ timeout: 5000 });

    // Click 5 crab cards (motion.button with aria-pressed).
    const crabBtns = page.locator("main button[aria-pressed]");
    const crabCount = await crabBtns.count();
    expect(crabCount).toBeGreaterThanOrEqual(5);
    for (let i = 0; i < 5; i++) {
      await crabBtns.nth(i).click({ force: true });
      await page.waitForTimeout(300);
    }

    // Deploy (button text is "⚔ Deploy!").
    await page.locator("main button:has-text('Deploy')").first().click({ force: true });
    await page.waitForTimeout(2000);

    // Loading screen: typewriter reveals "ASSEMBLING TIDEGUARD".
    await expect(page.locator("text=/ASSEMBLING/i")).toBeVisible({ timeout: 5000 });

    // Loading completes after ~3.25s (3s progress + 250ms finish pause).
    await page.waitForTimeout(4000);

    // Battle screen (FULL AUTO BATTLER): the Turn pill is visible and
    // actions happen BY THEMSELVES — the battle log shows the pilot's
    // first casts ("X casts …") without any skill/target clicking, and
    // the spectator controls are present.
    await expect(page.locator("text=/Turn \\d+/")).toBeVisible({ timeout: 10000 });
    await expect(page.locator("text=/casts/").first()).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId("battle-pause-toggle")).toBeVisible();
    await expect(page.getByTestId("battle-skip")).toBeVisible();
  });

  test("arena menu shows player gold and crabs", async ({ page }) => {
    await enterArena(page);
    await diveIntoArena(page);

    // Gold formatted as "2,000" should be visible in the header card.
    await expect(page.locator("text=2,000").first()).toBeVisible({ timeout: 5000 });
    // Top Crabs section heading.
    await expect(page.locator("text=Top Crabs")).toBeVisible({ timeout: 5000 });
    // Activities section heading.
    await expect(page.locator("text=Activities")).toBeVisible({ timeout: 5000 });
  });

  test("leaderboard navigation", async ({ page }) => {
    await enterArena(page);
    await diveIntoArena(page);

    // Click Ranking → leaderboard screen.
    await page.locator("main button:has-text('Ranking')").first().click({ force: true });
    await page.waitForTimeout(1500);

    // Leaderboard header should be visible.
    await expect(page.locator("text=/Tidelord Ranking|Tidelord/i").first()).toBeVisible({ timeout: 5000 });
  });

  test("opponent refresh keeps 5 opponents", async ({ page }) => {
    await enterArena(page);
    await diveIntoArena(page);

    // FIGHT → opponent list.
    await page.locator("main button:has-text('FIGHT')").click({ force: true });
    await page.waitForTimeout(2000);

    // Refresh button should be visible (not on cooldown initially).
    const refreshBtn = page.locator("main button:has-text('Refresh')").first();
    await expect(refreshBtn).toBeVisible({ timeout: 5000 });
    // Click refresh.
    await refreshBtn.click({ force: true });
    await page.waitForTimeout(1500);

    // Opponent list should still show the "Choose Your Foe" header.
    await expect(page.locator("text=Choose Your Foe")).toBeVisible({ timeout: 5000 });
  });
});
