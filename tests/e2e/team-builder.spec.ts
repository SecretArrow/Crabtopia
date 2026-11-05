// Crabtopia E2E — Team builder enforces 1 Team = 5 Crabs.
//
// Verifies the Teams screen: the starter team renders exactly 5 slots and
// is deploy-ready at 5/5; a newly created team renders exactly 5 empty
// slots and stays non-deployable (incomplete status) until filled.
import { test, expect } from "@playwright/test";
import { completeOnboarding } from "./helpers";

async function enterTeams(page: import("@playwright/test").Page): Promise<void> {
  await completeOnboarding(page);
  await page.locator("nav button:has-text('Teams')").first().click({ force: true });
  await expect(page.locator("h1:has-text('Teams')").first()).toBeVisible({ timeout: 8000 });
}

test.describe("Team builder (5 slots)", () => {
  test("starter team shows exactly 5 slots and deploy-ready status", async ({ page }) => {
    await enterTeams(page);

    // Exactly 5 slot cells in the builder grid.
    const slots = page.locator("[data-testid='team-slots'] > div");
    await expect(slots).toHaveCount(5);

    // Starter team is full: 5/5, deploy-ready.
    await expect(page.locator("[data-testid='team-ready']")).toBeVisible({ timeout: 8000 });
    await expect(page.locator("text=(5/5)").first()).toBeVisible();
  });

  test("new team starts with 5 empty slots and is not deployable", async ({ page }) => {
    await enterTeams(page);

    // Create a new team. The header button can sit under animated overlays,
    // so fall back to a DOM click if the modal does not open.
    await page.locator("button:has-text('New Team')").first().click({ force: true });
    const nameInput = page.locator("input[placeholder='Team name...']");
    if (!(await nameInput.isVisible({ timeout: 3000 }).catch(() => false))) {
      await page.evaluate(() => {
        const b = [...document.querySelectorAll("button")].find((x) =>
          x.textContent?.includes("New Team")
        );
        b?.click();
      });
    }
    await expect(nameInput).toBeVisible({ timeout: 8000 });
    await nameInput.fill("E2E Squad");
    await page
      .locator(".fixed.inset-0 button:has-text('Create')")
      .first()
      .click({ force: true });
    await page.waitForTimeout(800);

    // Exactly 5 slots, all empty ("Add Crab"), incomplete status 0/5.
    const slots = page.locator("[data-testid='team-slots'] > div");
    await expect(slots).toHaveCount(5);
    await expect(page.locator("button[aria-label^='Add crab to slot']")).toHaveCount(5);
    await expect(page.locator("[data-testid='team-incomplete']")).toBeVisible({ timeout: 8000 });
    await expect(page.locator("text=0/5 slots filled").first()).toBeVisible();
    await expect(page.locator("[data-testid='team-ready']")).toHaveCount(0);
  });
});
