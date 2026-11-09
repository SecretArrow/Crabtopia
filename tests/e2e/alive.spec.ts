// "Very alive" round (2026-11-08) e2e: ambient layer, living nest,
// hatch / craft / exploration / genesis reveals, leviathan spectacle.
import { test, expect, type Page } from "@playwright/test";
import { completeOnboarding, skipTutorial } from "./helpers";

// mulberry32 — the same deterministic rule as src/game/engine/rng.ts
// and ExplorationScreen's tileContent (replicated so the spec can
// find a chest tile for the current map seed without importing app code).
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function firstChestIdx(mapSeed: number): number {
  for (let idx = 0; idx < 25; idx++) {
    const rng = mulberry32((mapSeed * 7919 + idx * 2654435761) >>> 0);
    if (rng() < 0.25) return idx;
  }
  return -1;
}

async function crabCount(page: Page): Promise<number> {
  return page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem("crabtopia-save") ?? "{}");
    return data.state?.player?.crabs?.length ?? 0;
  });
}

async function seedReadyEgg(page: Page): Promise<void> {
  await page.evaluate(() => {
    const raw = localStorage.getItem("crabtopia-save");
    if (!raw) throw new Error("persisted save not found");
    const data = JSON.parse(raw);
    const p = data.state.player;
    const [c1, c2] = p.crabs;
    p.eggs.push({
      id: "egg_e2e_1",
      parentId: [c1.id, c2.id],
      faction: c1.faction,
      classId: c1.classId,
      genePreview: c1.genes,
      hatchTime: Date.now() - 1000,
      createdTime: Date.now() - 60000,
      ownerId: "player",
      name: "E2E Egg",
      isLegendaryCandidate: false,
    });
    localStorage.setItem("crabtopia-save", JSON.stringify(data));
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1200);
  await skipTutorial(page);
}

test.describe("very alive — ambient + nest + reveals + spectacle", () => {
  test("home shows the living nest (5 team sprites) and the ambient layer", async ({
    page,
  }) => {
    await completeOnboarding(page);
    const nest = page.getByTestId("home-nest");
    await expect(nest).toBeVisible({ timeout: 5000 });
    await expect(nest.getByTestId("animated-crab")).toHaveCount(5, {
      timeout: 5000,
    });
    await expect(nest).toContainText("Tideband");
    await expect(page.getByTestId("ambient-life")).toBeVisible({
      timeout: 5000,
    });
  });

  test("ambient layer is absent when reduced motion is on", async ({
    page,
  }) => {
    await completeOnboarding(page);
    await expect(page.getByTestId("ambient-life")).toBeVisible({
      timeout: 5000,
    });
    await page.evaluate(() => {
      localStorage.setItem(
        "crabtopia-settings",
        JSON.stringify({ reduceMotion: true, highContrast: false })
      );
    });
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);
    await skipTutorial(page);
    await expect(page.getByTestId("ambient-life")).toHaveCount(0);
  });

  test("hatching plays out and lands the same crab", async ({ page }) => {
    await completeOnboarding(page);
    await seedReadyEgg(page);
    await page.locator("nav button:has-text('Nursery')").first().click({ force: true });
    await page.waitForTimeout(1000);
    await page.locator("button:has-text('Hatch Now')").first().click({ force: true });

    const scene = page.getByTestId("hatch-scene");
    await expect(scene).toBeVisible({ timeout: 5000 });
    await scene.locator("button:has-text('Skip')").first().click({ force: true });
    await expect(scene).toContainText("It hatched!", { timeout: 5000 });
    await expect(scene.getByTestId("animated-crab")).toHaveCount(1, {
      timeout: 5000,
    });
    await scene.locator("button:has-text('Meet')").first().click({ force: true });
    await expect(scene).toBeHidden({ timeout: 5000 });
    await expect.poll(() => crabCount(page), { timeout: 5000 }).toBe(6);
  });

  test("crafting forges and reveals the item, granted exactly once", async ({
    page,
  }) => {
    await completeOnboarding(page);
    await page.evaluate(() => {
      const raw = localStorage.getItem("crabtopia-save");
      if (!raw) throw new Error("persisted save not found");
      const data = JSON.parse(raw);
      data.state.player.materials = {
        kelp_fiber: 10,
        iron_ore: 10,
        pearl_shard: 5,
        crystal_dust: 5,
      };
      localStorage.setItem("crabtopia-save", JSON.stringify(data));
    });
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1200);
    await skipTutorial(page);

    await page.locator("nav button:has-text('Crafting')").first().click({ force: true });
    await page.waitForTimeout(1000);
    await page.locator("button:has-text('🔨 Craft')").first().click({ force: true });

    const forge = page.getByTestId("forge-scene");
    await expect(forge).toBeVisible({ timeout: 5000 });
    await forge.locator("button:has-text('Skip')").first().click({ force: true });
    await expect(forge).toContainText("Sharpening Stone", { timeout: 5000 });
    await forge.locator("button:has-text('Collect')").first().click({ force: true });
    await expect(forge).toBeHidden({ timeout: 5000 });
    await expect
      .poll(
        async () =>
          page.evaluate(() => {
            const data = JSON.parse(
              localStorage.getItem("crabtopia-save") ?? "{}"
            );
            return {
              items: data.state?.player?.items ?? {},
              kelp: data.state?.player?.materials?.kelp_fiber,
              iron: data.state?.player?.materials?.iron_ore,
            };
          }),
        { timeout: 5000 }
      )
      .toEqual({ items: { sharpening_stone: 1 }, kelp: 7, iron: 8 });
  });

  test("exploration chest tile pops the loot", async ({ page }) => {
    await completeOnboarding(page);
    // The exploration key is created lazily when the screen first
    // mounts, so navigate there before reading its map seed.
    await page.locator("nav button:has-text('Explore')").first().click({ force: true });
    await page.waitForTimeout(1000);
    const chestIdx = await page.evaluate(() => {
      const raw = localStorage.getItem("crabtopia_exploration_v1");
      if (!raw) throw new Error("exploration state not found");
      return JSON.parse(raw).mapSeed as number;
    });
    const idx = firstChestIdx(chestIdx);
    expect(idx).toBeGreaterThanOrEqual(0);

    await page
      .locator("button[aria-label='Unexplored tile']")
      .nth(idx)
      .click({ force: true });

    const pop = page.getByTestId("exploration-loot-pop");
    await expect(pop).toBeVisible({ timeout: 8000 });
    await expect(pop).toContainText("Treasure chest!");
    const actionBtn = pop.locator("[data-testid='loot-reveal-action'] button");
    // The button reads "Skip ▸" until every card is revealed, then
    // becomes "Collect" — the label (not the click) settles the wait,
    // and each click either skips or collects; a single unconditional
    // click can land mid-reveal and leave the pop open. Click until
    // the label is Collect, then click Collect once.
    await expect(actionBtn).toHaveText("Collect", { timeout: 8000 });
    await actionBtn.click({ force: true });
    await expect(pop).toBeHidden({ timeout: 5000 });
    // The grant landed (gold above the fresh 2,000).
    await expect
      .poll(
        async () =>
          page.evaluate(() => {
            const data = JSON.parse(
              localStorage.getItem("crabtopia-save") ?? "{}"
            );
            return data.state?.player?.gold ?? 0;
          }),
        { timeout: 5000 }
      )
      .toBeGreaterThan(2000);
  });

  test("genesis purchase reveals the new crab", async ({ page }) => {
    await completeOnboarding(page);
    await page.evaluate(() => {
      const raw = localStorage.getItem("crabtopia-save");
      if (!raw) throw new Error("persisted save not found");
      const data = JSON.parse(raw);
      data.state.player.gold = 500000;
      localStorage.setItem("crabtopia-save", JSON.stringify(data));
    });
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1200);
    await skipTutorial(page);

    await page.locator("nav button:has-text('Bazaar')").first().click({ force: true });
    await page.waitForTimeout(1000);
    await page.locator("button:has-text('Genesis Collection')").first().click({ force: true });
    await page.waitForTimeout(1000);
    await page
      .locator("[data-testid='genesis-card'] button:has-text('Buy')")
      .first()
      .click({ force: true });

    const reveal = page.getByTestId("genesis-reveal");
    await expect(reveal).toBeVisible({ timeout: 5000 });
    // Burst stage auto-reveals after ~750ms; Skip if it is still there.
    const skipBtn = reveal.locator("button:has-text('Skip')").first();
    if (await skipBtn.isVisible({ timeout: 1500 }).catch(() => false)) {
      await skipBtn.click({ force: true });
    }
    await expect(reveal).toContainText("joins your roster!", { timeout: 8000 });
    await expect(reveal.getByTestId("animated-crab")).toHaveCount(1, {
      timeout: 5000,
    });
    await reveal.locator("button:has-text('Meet')").first().click({ force: true });
    await expect(reveal).toBeHidden({ timeout: 5000 });
    await expect.poll(() => crabCount(page), { timeout: 5000 }).toBe(6);
  });

  test("leviathan battle line plays the exchange", async ({ page }) => {
    await completeOnboarding(page);
    await page.locator("button:has-text('Leviathan Raid')").first().click({ force: true });
    await page.waitForTimeout(1000);
    await page.locator("button:has-text('Join Raid')").first().click({ force: true });

    const line = page.getByTestId("leviathan-battle-line");
    await expect(line).toBeVisible({ timeout: 5000 });
    await expect(line.getByTestId("animated-crab")).toHaveCount(5, {
      timeout: 5000,
    });

    await page.locator("button:has-text('Cast Skill')").first().click({ force: true });
    await page.waitForTimeout(500);
    await page.locator("button[aria-label^='Cast']").first().click({ force: true });
    // The turn's computed damage lands in the raid log.
    await expect(page.locator("text=/damage/").first()).toBeVisible({
      timeout: 8000,
    });

    await page.locator("button:has-text('Forfeit')").first().click({ force: true });
    await expect(page.locator("text=Raid Failed")).toBeVisible({
      timeout: 5000,
    });
  });
});
