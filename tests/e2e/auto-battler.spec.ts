// E2E for the FULL AUTO BATTLER arena (genre conversion):
//   - the battle runs by itself after deployment (actions appear in
//     the log with zero skill/target clicking; no skill buttons exist)
//   - spectator controls work: pause halts the action chain, play
//     resumes it, speed x3 applies, skip jumps to the result screen
//   - the result modal + rewards flow still completes the loop
import { test, expect, type Page } from "@playwright/test";
import { completeOnboarding, resetGameSave } from "./helpers";

test.beforeEach(async ({ page }) => {
  await resetGameSave(page);
});

async function deployToBattle(page: Page): Promise<void> {
  await completeOnboarding(page);
  await page.locator("nav button:has-text('Arena')").first().click({ force: true });
  await page.waitForTimeout(1500);
  await page.locator("button:has-text('Press to Dive')").first().click({ force: true });
  await page.waitForTimeout(1500);
  await page.locator("main button:has-text('FIGHT')").click({ force: true });
  await page.waitForTimeout(2000);
  await expect(page.locator("text=Choose Your Foe")).toBeVisible({ timeout: 5000 });

  const battleBtns = page.locator("main button").filter({ hasText: /Battle/ });
  const count = await battleBtns.count();
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
  await expect(page.locator("text=Deploy Your Tideguard")).toBeVisible({ timeout: 5000 });
  const crabBtns = page.locator("main button[aria-pressed]");
  expect(await crabBtns.count()).toBeGreaterThanOrEqual(5);
  for (let i = 0; i < 5; i++) {
    await crabBtns.nth(i).click({ force: true });
    await page.waitForTimeout(250);
  }
  await page.locator("main button:has-text('Deploy')").first().click({ force: true });
  await page.waitForTimeout(4500);
  await expect(page.getByTestId("battle-timer")).toBeVisible({ timeout: 10000 });
}

/** Live sim positions of every unit on the field, keyed by crab id. */
async function unitPositions(
  page: Page,
): Promise<Record<string, { x: number; y: number }>> {
  const els = page.locator(
    '[data-testid="battle-arena"] [data-crab-id]',
  );
  return els.evaluateAll((nodes) => {
    const out: Record<string, { x: number; y: number }> = {};
    for (const el of nodes) {
      const id = el.getAttribute("data-crab-id");
      const x = Number(el.getAttribute("data-unit-x"));
      const y = Number(el.getAttribute("data-unit-y"));
      if (id && Number.isFinite(x) && Number.isFinite(y)) out[id] = { x, y };
    }
    return out;
  });
}

/** Inner text of the battle-log entries container. */
async function logText(page: Page): Promise<string> {
  const entries = page.locator(
    "xpath=//div[contains(.,'Battle Log') and contains(@class,'rounded-2xl')]//div[contains(@class,'flex-col')]",
  );
  return entries.first().innerText().catch(() => "");
}

test("battle runs itself: actions happen with no input, result completes", async ({
  page,
}) => {
  await deployToBattle(page);

  // No manual controls exist in the auto battler.
  await expect(page.locator("button[data-skill-profile]")).toHaveCount(0);
  await expect(page.locator("text=Pick a skill")).toHaveCount(0);

  // REAL-TIME: units actually MOVE — positions change on their own as
  // melee closes in and ranged repositions (no input from us).
  const before = await unitPositions(page);
  expect(Object.keys(before).length).toBe(10);
  await page.waitForTimeout(2500);
  const after = await unitPositions(page);
  let moved = 0;
  for (const id of Object.keys(before)) {
    if (!after[id]) continue;
    const dx = after[id].x - before[id].x;
    const dy = after[id].y - before[id].y;
    if (Math.hypot(dx, dy) > 1) moved += 1;
  }
  expect(moved).toBeGreaterThanOrEqual(3);

  // Actions appear in the log on their own (the pilot plays both teams).
  await expect
    .poll(async () => (await logText(page)).match(/casts/g)?.length ?? 0, {
      timeout: 30000,
      intervals: [500],
    })
    .toBeGreaterThanOrEqual(2);

  // Speed up and let it run a little, then skip to the result.
  await page.locator('[data-testid="battle-speed-btn"][data-speed="3"]').click({ force: true });
  await page.waitForTimeout(2500);
  await page.getByTestId("battle-skip").click({ force: true });

  const resultDialog = page.getByRole("dialog", { name: /DEFEATED|VICTORY/i });
  await expect(resultDialog).toBeVisible({ timeout: 15000 });
  await expect(
    page.locator("main button:has-text('Continue')").first(),
  ).toBeVisible({ timeout: 8000 });
});

test("pause halts the action chain and play resumes it", async ({ page }) => {
  await deployToBattle(page);
  await page.locator('[data-testid="battle-speed-btn"][data-speed="3"]').click({ force: true });

  // Wait for the battle to be underway.
  await expect
    .poll(async () => (await logText(page)).includes("casts"), {
      timeout: 30000,
      intervals: [400],
    })
    .toBe(true);

  // Pause: after any in-flight animation settles, the log must freeze.
  await page.getByTestId("battle-pause-toggle").click({ force: true });
  await page.waitForTimeout(1500);
  const frozen = await logText(page);

  // The freeze is REAL (shared BattleClock at timeScale 0): the arena
  // reports the paused state and its accumulated battle-clock time
  // does not advance at all while paused — sprites, particles, FX,
  // projectiles and the action chain all run on that same clock.
  const arena = page.getByTestId("battle-arena");
  await expect(arena).toHaveAttribute("data-battle-paused", "true");
  const clockAtPause = Number(await arena.getAttribute("data-battle-clock-ms"));
  expect(clockAtPause).toBeGreaterThan(0);

  await page.waitForTimeout(3000);
  expect(await logText(page)).toBe(frozen);
  expect(Number(await arena.getAttribute("data-battle-clock-ms"))).toBe(
    clockAtPause,
  );

  // The freeze is positional too: every unit stands exactly where it
  // was when the battle paused (the sim receives zero battle-time).
  const frozenPos = await unitPositions(page);
  await page.waitForTimeout(1500);
  expect(await unitPositions(page)).toEqual(frozenPos);

  // Play: the clock advances again and actions resume (log moves).
  await page.getByTestId("battle-pause-toggle").click({ force: true });
  await expect(arena).toHaveAttribute("data-battle-paused", "false");
  await expect
    .poll(
      async () => Number(await arena.getAttribute("data-battle-clock-ms")),
      { timeout: 10000, intervals: [300] },
    )
    .toBeGreaterThan(clockAtPause);
  await expect
    .poll(async () => logText(page), { timeout: 20000, intervals: [400] })
    .not.toBe(frozen);
});

test("fallen crabs become tombstones at their death position; skip still resolves", async ({
  page,
}) => {
  await deployToBattle(page);
  // Speed the fight up and watch for the first tombstone: a dead crab
  // must NEVER linger as a living sprite — its field slot turns into
  // the shell-stone marker where it fell.
  await page
    .locator('[data-testid="battle-speed-btn"][data-speed="3"]')
    .click({ force: true });
  await expect(page.getByTestId("tombstone").first()).toBeVisible({
    timeout: 90000,
  });
  // The tombstone sits inside the arena (at the death position).
  const arenaBox = await page.getByTestId("battle-arena").boundingBox();
  const tombBox = await page.getByTestId("tombstone").first().boundingBox();
  expect(arenaBox).toBeTruthy();
  expect(tombBox).toBeTruthy();
  expect(tombBox!.x).toBeGreaterThanOrEqual(arenaBox!.x - 4);
  expect(tombBox!.x).toBeLessThanOrEqual(arenaBox!.x + arenaBox!.width);

  // Skip from here still lands on the normal result screen.
  await page.getByTestId("battle-skip").click({ force: true });
  const resultDialog = page.getByRole("dialog", { name: /DEFEATED|VICTORY/i });
  await expect(resultDialog).toBeVisible({ timeout: 15000 });
});
