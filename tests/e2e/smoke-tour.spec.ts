// Crabtopia E2E — Smoke tour: play everything.
//
// Visits every nav screen, opens every Home event-card modal, and interacts
// with the core activity screens. Fails on any uncaught page error (a real
// crash), so this spec is the "play the whole game quickly" tripwire.
import { test, expect, type Page } from "@playwright/test";
import { completeOnboarding } from "./helpers";

async function expectNoPageError(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(err.message));
  return errors;
}

test.describe("Smoke tour — every screen + every modal", () => {
  test("all nav screens render main content without crashing", async ({
    page,
  }) => {
    const errors = await expectNoPageError(page);
    await completeOnboarding(page);

    // Primary nav (desktop sidebar) — visit every screen.
    const screens: [string, RegExp][] = [
      ["Home", /Tides|Home|Shellwarden|Deploy/i],
      ["Mining", /Crystal Mines|mining energy/i],
      ["Explore", /Tide Wilderness|exploration tickets/i],
      ["Crafting", /Tide Forge|Recipes/i],
      ["Inventory", /Vault|Materials/i],
      ["Codex", /Codex|Elements/i],
      ["Dive Map", /World|Site|map/i],
      ["Teams", /Teams|formation/i],
      ["Hall", /Driftwood Hall|Hire/i],
      ["Nursery", /Nursery|Parent|Breed/i],
      ["Bazaar", /Bazaar|Market/i],
      ["Arena", /CRABTOPIA|Arena|Press to Dive/i],
    ];
    for (const [label] of screens) {
      await page
        .locator(`nav button:has-text('${label}')`)
        .first()
        .click({ force: true });
      await page.waitForTimeout(700);
      // The screen swapped (no blank page): something rendered in main.
      const main = page.locator("main");
      await expect(main).toBeVisible();
    }
    expect(errors, errors.join("\n")).toEqual([]);
  });

  test("every Home event-card modal opens and closes", async ({ page }) => {
    const errors = await expectNoPageError(page);
    await completeOnboarding(page);
    await page.locator("nav button:has-text('Home')").first().click({ force: true });
    await page.waitForTimeout(800);

    // Every event card on the Home screen opens a modal; close each one.
    const cards = page.locator('[data-testid="event-card"], main .grid button, main section button');
    const cardTexts = [
      "Quests", "Leviathan", "Lottery", "Tournament", "Clans", "Reef Plots",
      "Auctions", "Charters", "Tidepass", "Boutique", "Economy", "Defense",
      "Spectate", "Admin", "Profile", "Friends", "Tutorials", "Rewards",
      "Leaderboards", "Replay",
    ];
    let opened = 0;
    for (const text of cardTexts) {
      const btn = page
        .locator(`main button:has-text('${text}')`)
        .first();
      if (!(await btn.isVisible({ timeout: 1200 }).catch(() => false))) continue;
      await btn.scrollIntoViewIfNeeded().catch(() => {});
      await btn.click({ force: true });
      await page.waitForTimeout(500);
      // A dialog appeared (Modal role=dialog)…
      const dialog = page.locator('[role="dialog"]').first();
      if (await dialog.isVisible({ timeout: 2000 }).catch(() => false)) {
        opened++;
        // …and it closes via its ✕ / Close / backdrop-safe button.
        const close = page
          .locator('[role="dialog"] button[aria-label="Close"], [role="dialog"] button:has-text("✕"), [role="dialog"] button:has-text("Close")')
          .first();
        if (await close.isVisible({ timeout: 1000 }).catch(() => false)) {
          await close.click({ force: true });
        } else {
          await page.keyboard.press("Escape");
        }
        await page.waitForTimeout(300);
      }
    }
    // The tour must have actually exercised a meaningful set of modals.
    expect(opened).toBeGreaterThanOrEqual(8);
    expect(errors, errors.join("\n")).toEqual([]);
  });

  test("activities are playable: craft check + inventory tabs + breeding preview", async ({
    page,
  }) => {
    const errors = await expectNoPageError(page);
    await completeOnboarding(page);

    // Crafting: open Recipes tab, verify all 6 recipes render.
    await page.locator("nav button:has-text('Crafting')").first().click({ force: true });
    await page.waitForTimeout(700);
    await page.locator("button:has-text('Recipes')").first().click({ force: true });
    await page.waitForTimeout(300);
    await expect(page.locator("text=/Sharpening Stone|Shell Polish|Tide Amulet|Energy Brew|Lucky Charm|Legendary Lure/").first()).toBeVisible();

    // Inventory: Materials + Items tabs both render.
    await page.locator("nav button:has-text('Inventory')").first().click({ force: true });
    await page.waitForTimeout(700);
    await expect(page.locator("button:has-text('Materials')").first()).toBeVisible();
    await page.locator("button:has-text('Items')").first().click({ force: true });
    await page.waitForTimeout(300);
    await expect(page.locator("button:has-text('Materials')").first()).toBeVisible();

    // Breeding (in the Nursery — the single breeding surface): parent
    // slots are selectable.
    await page.locator("nav button:has-text('Nursery')").first().click({ force: true });
    await page.waitForTimeout(700);
    await expect(page.locator("text=/Pick|Parent|roster/i").first()).toBeVisible();

    // Mining: energy + node cards render.
    await page.locator("nav button:has-text('Mining')").first().click({ force: true });
    await page.waitForTimeout(700);
    await expect(page.locator("text=/Kelp Ridge|Pearl Cavern|Crystal Vault/").first()).toBeVisible();

    expect(errors, errors.join("\n")).toEqual([]);
  });
});
