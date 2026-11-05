// Crabtopia E2E — Button functionality smoke tests.
//
// Verifies that every primary nav button switches to the expected screen,
// that the arena splash auto-advances after 4s, that the in-battle Flee /
// speed / pause spectator controls respond (full auto battler — there is
// no Auto toggle anymore), and that the activity Back buttons return
// to the Arena screen.

import { test, expect } from "@playwright/test";
import { completeOnboarding } from "./helpers";

// Shared helper: complete onboarding then dive the splash screen into the
// arena menu. Used by the arena-specific tests below.
async function enterArenaMenu(page: import("@playwright/test").Page): Promise<void> {
  await completeOnboarding(page);
  await page.locator("nav button:has-text('Arena')").first().click({ force: true });
  await page.waitForTimeout(1500);
  // Dive past the splash (auto-advances after 4s but we click for speed).
  await page.locator("button:has-text('Press to Dive')").first().click({ force: true });
  await page.waitForTimeout(1500);
  await expect(page.locator("main button:has-text('FIGHT')")).toBeVisible({ timeout: 5000 });
}

// Shared helper: drive the arena flow all the way to the Battle screen so we
// can probe the Flee / speed / pause spectator controls.
async function enterArenaBattle(page: import("@playwright/test").Page): Promise<void> {
  await enterArenaMenu(page);

  // FIGHT → opponent list.
  await page.locator("main button:has-text('FIGHT')").click({ force: true });
  await page.waitForTimeout(2000);
  await expect(page.locator("text=Choose Your Foe")).toBeVisible({ timeout: 5000 });

  // Pick the first enabled Battle button that isn't "Battle Log".
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

  // Team builder: pick first 5 crabs.
  await expect(page.locator("text=Deploy Your Tideguard")).toBeVisible({ timeout: 5000 });
  const crabBtns = page.locator("main button[aria-pressed]");
  for (let i = 0; i < 5; i++) {
    await crabBtns.nth(i).click({ force: true });
    await page.waitForTimeout(250);
  }
  await page.locator("main button:has-text('Deploy')").first().click({ force: true });

  // Loading auto-advances after ~3.25s.
  await page.waitForTimeout(4000);

  // Battle screen.
  await expect(page.getByTestId("battle-timer")).toBeVisible({ timeout: 10000 });
}

test.describe("Button functionality", () => {
  test("every sidebar nav button switches screen", async ({ page }) => {
    await completeOnboarding(page);

    // (nav button label, getter that resolves the unique marker element on
    // the corresponding screen). Using getByText with a regex / string
    // avoids Playwright's quirky `text=...` selector parsing of pipe-OR
    // patterns and matches either plain substrings or regex.
    const cases: [string, (p: import("@playwright/test").Page) => import("@playwright/test").Locator][] = [
      ["Home", (p) => p.getByText(/Welcome to your burrow|Welcome back/i)],
      ["Arena", (p) => p.getByText("Press to Dive")],
      ["Mining", (p) => p.getByText(/Crystal Mines/i)],
      ["Explore", (p) => p.getByText(/Tide Wilderness/i)],
      ["Nursery", (p) => p.getByText(/Breeding Pair|Parent A/i)],
      ["Crafting", (p) => p.getByText(/Tide Forge/i)],
      ["Inventory", (p) => p.getByText(/Shellwarden/i)],
      ["Codex", (p) => p.getByText("Codex", { exact: false })],
    ];

    for (const [navLabel, getMarker] of cases) {
      await page.locator(`nav button:has-text('${navLabel}')`).first().click({ force: true });
      // Allow time for screen mount + intro animations.
      await page.waitForTimeout(1500);
      await expect(getMarker(page).first()).toBeVisible({ timeout: 5000 });
    }
  });

  test("arena splash auto-advances after 4 seconds", async ({ page }) => {
    await completeOnboarding(page);
    await page.locator("nav button:has-text('Arena')").first().click({ force: true });
    await page.waitForTimeout(1500);

    // Confirm splash mounted.
    await expect(page.locator("button:has-text('Press to Dive')")).toBeVisible({ timeout: 5000 });

    // Wait 6 seconds WITHOUT clicking — splash should auto-advance to menu.
    await page.waitForTimeout(6000);

    // Menu visible via FIGHT button.
    await expect(page.locator("main button:has-text('FIGHT')")).toBeVisible({ timeout: 5000 });
  });

  test("arena battle Flee button ends the battle", async ({ page }) => {
    await enterArenaBattle(page);

    // The Flee button is in the sticky battle header.
    const fleeBtn = page.locator("button[aria-label='Flee the battle']").first();
    await expect(fleeBtn).toBeVisible({ timeout: 5000 });
    await fleeBtn.click({ force: true });

    // After fleeing, ArenaController transitions to the Result step. The
    // ArenaResult banner is a motion.h1 with `transform: scale(0)` initial
    // state + a spring animation that Playwright's visibility check (which
    // inspects the bounding box) doesn't reliably see as visible. The result
    // dialog wrapper itself is a fixed inset-0 overlay with role="dialog" —
    // that wrapper is unconditionally visible. We assert via the dialog role.
    const resultDialog = page.getByRole("dialog", { name: /DEFEATED|VICTORY/i });
    await expect(resultDialog).toBeVisible({ timeout: 8000 });

    // The Continue CTA on the result screen is a GlowButton. It mounts inside
    // a motion.div that fades in 1s after the result dialog appears.
    await expect(page.locator("main button:has-text('Continue')").first()).toBeVisible({
      timeout: 8000,
    });
  });

  test("arena battle speed controls and pause toggle are clickable", async ({ page }) => {
    await enterArenaBattle(page);

    // Spectator controls: x1 / x2 / x3 speed buttons with aria-pressed
    // reflecting the active speed. We click each and assert the click
    // is accepted (aria-pressed flips).
    const speedContainer = page.locator(
      "header >> button[aria-pressed]",
    );
    await expect(speedContainer.nth(0)).toBeVisible({ timeout: 5000 });

    // Click x2 then x3 then x1 — verify aria-pressed flips on each.
    for (const target of ["x2", "x3", "x1"]) {
      const btn = page.locator(`header button:has-text('${target}')`).first();
      await btn.click({ force: true });
      await page.waitForTimeout(150);
      // After click, this button's aria-pressed should be "true".
      const pressed = await btn.getAttribute("aria-pressed");
      expect(pressed).toBe("true");
    }

    // Pause toggle: pressing it pauses the auto battle (aria-pressed
    // true, label flips to Play); pressing again resumes.
    const pauseBtn = page.getByTestId("battle-pause-toggle");
    await pauseBtn.click({ force: true });
    await page.waitForTimeout(150);
    expect(await pauseBtn.getAttribute("aria-pressed")).toBe("true");
    await expect(pauseBtn).toContainText("Play");
    await pauseBtn.click({ force: true });
    await page.waitForTimeout(150);
    expect(await pauseBtn.getAttribute("aria-pressed")).toBe("false");
    await expect(pauseBtn).toContainText("Pause");
  });

  test("mining Back button returns to Arena", async ({ page }) => {
    await completeOnboarding(page);
    await page.locator("nav button:has-text('Mining')").first().click({ force: true });
    await page.waitForTimeout(1500);

    // Mining screen visible.
    await expect(page.locator("text=/Crystal Mines/i").first()).toBeVisible({ timeout: 5000 });

    // Click Back.
    await page.locator("button:has-text('Back')").first().click({ force: true });
    await page.waitForTimeout(1500);

    // Back from a mining screen routes to the Arena. ArenaController mounts
    // splash by default — so the Press to Dive button should reappear.
    await expect(page.locator("button:has-text('Press to Dive')")).toBeVisible({ timeout: 5000 });
  });
});
