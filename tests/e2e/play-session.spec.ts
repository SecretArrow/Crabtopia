// Crabtopia E2E — Full play session (Scope B gap coverage).
//
// One continuous loop that no other spec covers end-to-end (smoke-tour
// only visits screens; genesis-market only DISPLAYS the Genesis tab;
// team-gameplay covers the banner + CTAs but never buys):
//   fresh save → trim roster to 4 (banner: "1 more crab")
//   → buy a Genesis crab via the banner CTA → roster back to 5,
//     banner gone → add the new crab to the team via the slot picker
//   → Arena: deploy the full team → auto battle at x3 → Skip
//   → result dialog with rewards → Continue.
// Gold is topped up through the established localStorage harness
// pattern (Genesis prices are rarity-based and exceed starter gold).
import { test, expect, type Page } from "@playwright/test";
import { completeOnboarding, skipTutorial } from "./helpers";

async function rosterSize(page: Page): Promise<number> {
  return page.evaluate(() => {
    const raw = localStorage.getItem("crabtopia-save");
    if (!raw) return -1;
    return JSON.parse(raw).state.player.crabs.length as number;
  });
}

async function rosterIds(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const raw = localStorage.getItem("crabtopia-save");
    if (!raw) return [];
    return (JSON.parse(raw).state.player.crabs as { id: string }[]).map(
      (c) => c.id,
    );
  });
}

test("full session: buy → complete team → arena battle to result", async ({
  page,
}) => {
  await completeOnboarding(page);

  // Trim the roster to 4 crabs and top up gold (harness pattern).
  // Teams live INSIDE the player profile — the persisted partialize
  // (player, worldSites, hallListings, bazaarListings, genesisSoldIds,
  // currentScreen) has no top-level "teams" key — so trim them there:
  // drop ids that leave the roster and re-pad to the fixed 5 slots
  // with "" (the app's own slot normalization).
  await page.evaluate(() => {
    const raw = localStorage.getItem("crabtopia-save");
    if (!raw) throw new Error("persisted save not found");
    const data = JSON.parse(raw);
    data.state.player.crabs = data.state.player.crabs.slice(0, 4);
    const keep = new Set(
      (data.state.player.crabs as { id: string }[]).map((c) => c.id),
    );
    for (const team of data.state.player.teams ?? []) {
      const filled = (team.crabIds ?? []).filter((id: string) =>
        keep.has(id),
      );
      team.crabIds = [...filled, "", "", "", "", ""].slice(0, 5);
    }
    data.state.player.gold = 100000;
    localStorage.setItem("crabtopia-save", JSON.stringify(data));
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  await skipTutorial(page);
  expect(await rosterSize(page)).toBe(4);
  const keptIds = await rosterIds(page);
  expect(keptIds.length).toBe(4);

  // --- Teams: the insufficient-roster banner is up. ---
  await page
    .locator("nav button:has-text('Teams'):visible")
    .first()
    .click({ force: true });
  const banner = page.locator('[data-testid="insufficient-crabs-banner"]');
  await expect(banner).toBeVisible({ timeout: 10000 });
  await expect(banner).toContainText("1 more crab");

  // --- Buy a Genesis crab through the banner CTA. ---
  await page.locator('[data-testid="buy-genesis-cta"]').click({ force: true });
  const genesisTab = page.locator(
    "button[role='tab']:has-text('Genesis Collection')",
  );
  await expect(genesisTab).toHaveAttribute("aria-selected", "true", {
    timeout: 10000,
  });

  const cards = page.locator('[data-testid="genesis-card"]');
  await expect(cards.first()).toBeVisible({ timeout: 10000 });
  let bought = false;
  const cardCount = await cards.count();
  for (let i = 0; i < cardCount; i++) {
    const buyBtn = cards
      .nth(i)
      .locator("button", { hasText: /Buy/ })
      .first();
    if (await buyBtn.isEnabled({ timeout: 500 }).catch(() => false)) {
      await buyBtn.click({ force: true });
      bought = true;
      break;
    }
  }
  expect(bought, "an affordable Genesis Buy button was clicked").toBe(true);
  await expect
    .poll(() => rosterSize(page), { timeout: 10000 })
    .toBe(5);
  // The bought crab is the roster member that was not kept after the
  // trim — the team evidence below must find THIS crab on a team.
  const boughtId = (await rosterIds(page)).find((id) => !keptIds.includes(id));
  expect(boughtId, "the bought Genesis crab is on the roster").toBeTruthy();

  // --- Teams again: banner gone, add the new crab to the empty slot. ---
  await page
    .locator("nav button:has-text('Teams'):visible")
    .first()
    .click({ force: true });
  await expect(banner).toHaveCount(0, { timeout: 10000 });

  const emptySlot = page
    .locator('button[aria-label^="Add crab to slot"]:visible')
    .first();
  await expect(emptySlot).toBeVisible({ timeout: 10000 });
  await emptySlot.click({ force: true });
  await page.waitForTimeout(600);
  const pickerRow = page
    .locator(
      "[data-radix-popper-content-wrapper] button:has([data-testid='crab-renderer'])",
    )
    .first();
  await expect(pickerRow).toBeVisible({ timeout: 8000 });
  await pickerRow.click({ force: true });

  // Team evidence from the real persisted shape: teams sit inside
  // state.player.teams and their crabIds are always 5 slots padded
  // with "", so count FILLED ids — and require the bought crab itself
  // to be one of them.
  await expect
    .poll(
      () =>
        page.evaluate((bought: string | undefined) => {
          const raw = localStorage.getItem("crabtopia-save");
          if (!raw) return { maxFilled: -1, joined: false };
          const teams = JSON.parse(raw).state.player.teams ?? [];
          const filled = teams.map((t: { crabIds?: string[] }) =>
            (t.crabIds ?? []).filter((id) => id.length > 0),
          ) as string[][];
          return {
            maxFilled: Math.max(0, ...filled.map((f) => f.length)),
            joined: bought ? filled.some((f) => f.includes(bought)) : false,
          };
        }, boughtId),
      { timeout: 10000 },
    )
    .toEqual({ maxFilled: 5, joined: true });

  // --- Arena: deploy the completed team and finish a battle. ---
  await page
    .locator("nav button:has-text('Arena'):visible")
    .first()
    .click({ force: true });
  await page
    .locator("button:has-text('Press to Dive')")
    .first()
    .click({ force: true });
  await page.waitForTimeout(1200);
  await page
    .locator("main button:has-text('FIGHT')")
    .first()
    .click({ force: true });
  await page.waitForTimeout(1200);
  const battleBtn = page
    .locator("button:has-text('Battle'):not(:has-text('Battle Log'))")
    .first();
  await expect(battleBtn).toBeEnabled({ timeout: 10000 });
  await battleBtn.click({ force: true });

  await expect(page.getByText("Deploy Your Tideguard")).toBeVisible({
    timeout: 15000,
  });
  await page
    .locator("button:has-text('Deploy')")
    .last()
    .click({ force: true });
  await expect(page.locator("text=/Turn \\d+/").first()).toBeVisible({
    timeout: 20000,
  });

  // Speed up, then skip to the result.
  await page
    .locator('[data-testid="battle-speed-btn"][data-speed="3"]')
    .click({ force: true });
  await page.getByTestId("battle-skip").click({ force: true });

  const result = page.getByRole("dialog", { name: /DEFEATED|VICTORY/ });
  await expect(result).toBeVisible({ timeout: 20000 });
  await expect(result).toContainText(/gold|xp|reward/i);
  await expect(
    page.locator("button:has-text('Continue')").first(),
  ).toBeVisible();
});
