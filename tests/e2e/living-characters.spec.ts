// Crabtopia E2E — Living characters (Scope E proof).
//
// Characters must be ALIVE everywhere: every preview renders the
// animated sheet sprite playing its idle clip — never a stiff static
// portrait. For each surface we sample the crabs' background-position
// and poll until at least one crab has CHANGED frame, and we assert
// ZERO static crab portrait <img>s render. The poll (250ms interval,
// ~8s budget) matters: under CI load the dev server runs dozens of
// rAF loops at once and a starved loop may not advance a 5fps idle
// frame inside any single fixed window — a fixed 750ms two-sample
// check proved that the hard way. Polling until a change is observed
// keeps the meaning identical (a truly frozen render still fails)
// while removing the scheduling lottery.
// (prefers-reduced-motion keeps the frozen-first-frame behaviour —
// that is an accessibility requirement, so this spec explicitly
// requests no-preference motion.)
import { test, expect, type Page, type Locator } from "@playwright/test";
import { completeOnboarding, skipTutorial } from "./helpers";

test.use({ reducedMotion: "no-preference" });

async function frameSignatures(scope: Locator): Promise<string[]> {
  return scope.evaluateAll((els) =>
    els.map(
      (el) =>
        (el as HTMLElement).style.backgroundPosition ||
        el.getAttribute("data-anim-state") ||
        "",
    ),
  );
}

async function expectAlive(scope: Locator, label: string): Promise<void> {
  await expect(scope.first(), `${label}: a living crab is present`).toBeVisible({
    timeout: 10000,
  });
  const before = await frameSignatures(scope);
  expect(before.length, `${label}: crabs sampled`).toBeGreaterThanOrEqual(1);
  const beforeMultiset = [...before].sort();
  // Poll for a frame change: any sampled crab's signature differing
  // from its baseline (same index), or the signature multiset itself
  // changing (guards against list re-ordering between samples).
  await expect
    .poll(
      async () => {
        const now = await frameSignatures(scope);
        if (now.some((sig, i) => sig !== before[i])) return true;
        const sorted = [...now].sort();
        return sorted.some((sig, i) => sig !== beforeMultiset[i]);
      },
      { timeout: 8000, intervals: [250] },
    )
    .toBe(true);
}

async function expectNoStaticPortraits(page: Page, label: string) {
  expect(
    await page.locator('img[data-testid="crab-art"]').count(),
    `${label}: zero static crab portrait <img>s`,
  ).toBe(0);
}

test.describe("Living characters — previews animate everywhere", () => {
  test("arena menu (avatar + top crabs) is alive", async ({ page }) => {
    await completeOnboarding(page);
    await page
      .locator("nav button:has-text('Arena'):visible")
      .first()
      .click({ force: true });
    await page.waitForTimeout(1500);
    await expectAlive(
      page.locator(
        '[data-testid="crab-sprite"] [data-testid="animated-crab"]',
      ),
      "arena menu",
    );
    await expectNoStaticPortraits(page, "arena menu");
  });

  test("teams screen cards are alive", async ({ page }) => {
    await completeOnboarding(page);
    await page
      .locator("nav button:has-text('Teams'):visible")
      .first()
      .click({ force: true });
    await page.waitForTimeout(1200);
    await expectAlive(
      page.locator("main [data-testid='animated-crab']"),
      "teams screen",
    );
    await expectNoStaticPortraits(page, "teams screen");
  });

  test("bazaar listings + genesis cards are alive", async ({ page }) => {
    await completeOnboarding(page);
    await page
      .locator("nav button:has-text('Bazaar'):visible")
      .first()
      .click({ force: true });
    await expect(
      page.locator("text=Bazaar of Tides").first(),
    ).toBeVisible({ timeout: 8000 });
    await expectAlive(
      page.locator("main [data-testid='animated-crab']"),
      "bazaar listings",
    );
    await expectNoStaticPortraits(page, "bazaar listings");

    // Genesis Collection tab — living crabs like every other card.
    await page
      .locator("button:has-text('Genesis Collection')")
      .first()
      .click({ force: true });
    const genesisCrabs = page.locator(
      '[data-testid="genesis-card"] [data-testid="animated-crab"]',
    );
    await expect(genesisCrabs.first()).toBeVisible({ timeout: 8000 });
    await expectAlive(genesisCrabs, "genesis cards");
    await expectNoStaticPortraits(page, "genesis cards");
  });

  test("detail modal hero is alive", async ({ page }) => {
    await completeOnboarding(page);
    // Add a spare crab so the Teams "Available Crabs" grid has a card
    // (fresh-save starters are all inside the default team).
    await page.evaluate(() => {
      const raw = localStorage.getItem("crabtopia-save");
      if (!raw) throw new Error("persisted save not found");
      const data = JSON.parse(raw);
      const crabs = data.state.player.crabs;
      crabs.push({ ...crabs[0], id: `${crabs[0].id}-spare` });
      localStorage.setItem("crabtopia-save", JSON.stringify(data));
    });
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);
    await skipTutorial(page);

    await page
      .locator("nav button:has-text('Teams'):visible")
      .first()
      .click({ force: true });
    await page.waitForTimeout(1200);

    const available = page
      .locator("section")
      .filter({ hasText: "Available Crabs" });
    const card = available
      .locator("button:has([data-testid='crab-renderer'])")
      .first();
    await expect(card).toBeVisible({ timeout: 20000 });
    await card.click();

    await expect(page.getByText("Crab Dossier")).toBeVisible({
      timeout: 10000,
    });
    // The modal hero (144px animated sheet) — sample only crabs inside
    // the modal's fixed overlay.
    const overlayCrabs = page.locator(
      "div.fixed.inset-0 [data-testid='animated-crab']",
    );
    await expectAlive(overlayCrabs, "detail modal");
    expect(
      await page
        .locator("div.fixed.inset-0")
        .locator('img[data-testid="crab-art"]')
        .count(),
      "detail modal: zero static crab portrait <img>s",
    ).toBe(0);
  });
});
