// Crabtopia E2E — Free placement on the 5-lane deployment board.
//
// The deployment board is a 3-row × 5-lane cell grid per side. The player
// freely places their 5 crabs on ANY of the 15 cells:
//   1. The board renders 5 occupied player cells (slot-anchor) + 10 empty
//      tappable cells + 5 enemy preview anchors.
//   2. Tap-to-select then tap-an-empty-cell MOVES the crab to that cell.
//   3. Tap-to-select then tap-an-occupied-cell SWAPS the two crabs — both
//      survive (regression: a same-row swap bug used to erase one crab and
//      duplicate the other, dropping the board to 4 members).
//   4. The freely arranged formation still deploys into the live battle.
import { test, expect, type Page } from "@playwright/test";
import { completeOnboarding } from "./helpers";

async function enterArenaDeploy(page: Page) {
  await completeOnboarding(page);
  await page
    .locator("nav button:has-text('Arena'):visible")
    .first()
    .click({ force: true });
  await page.waitForTimeout(1500);
  await page
    .locator("button:has-text('Press to Dive')")
    .first()
    .click({ force: true });
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
  await expect(page.locator("text=Deploy Your Tideguard")).toBeVisible({
    timeout: 5000,
  });
}

test.describe("Free placement — 3-row × 5-lane deployment board", () => {
  test("board shows 15 cells: 5 occupied + 10 empty on the player side", async ({
    page,
  }) => {
    await enterArenaDeploy(page);

    const board = page.locator('[data-testid="deployment-board"]');
    await expect(board).toBeVisible();

    // 5 occupied player cells (member buttons with crab art).
    const playerAnchors = board.locator(
      'button[data-testid="slot-anchor"][data-slot^="player-"]',
    );
    await expect(playerAnchors).toHaveCount(5);

    // 5 enemy preview anchors (non-interactive divs).
    const enemyAnchors = board.locator(
      '[data-testid="slot-anchor"][data-slot^="enemy-"]',
    );
    await expect(enemyAnchors).toHaveCount(5);

    // 10 empty tappable cells on the player side (15 cells - 5 occupied).
    const emptyCells = board.locator(
      'button[data-testid="empty-cell"][data-cell^="player-"]',
    );
    await expect(emptyCells).toHaveCount(10);
  });

  test("tap-to-select + tap-empty-cell moves the crab to that cell", async ({
    page,
  }) => {
    await enterArenaDeploy(page);

    const board = page.locator('[data-testid="deployment-board"]');
    // Select the first member (topmost occupied cell).
    const first = board.locator(
      'button[data-testid="slot-anchor"][data-slot^="player-"]',
    );
    await first.first().click({ force: true });
    await expect(first.first()).toHaveAttribute("aria-pressed", "true");

    // Move it to an empty cell — back row, lane 5 (data-cell player-back-4).
    const target = board.locator(
      'button[data-testid="empty-cell"][data-cell="player-back-4"]',
    );
    await expect(target).toHaveCount(1);
    await target.click({ force: true });
    await page.waitForTimeout(300);

    // The crab now occupies the target cell (it renders as a member button
    // with the target's data-slot)…
    const movedIn = board.locator(
      'button[data-testid="slot-anchor"][data-slot="player-back-4"]',
    );
    await expect(movedIn).toHaveCount(1);
    // …and the total member count is still exactly 5 (nothing lost).
    await expect(
      board.locator('button[data-testid="slot-anchor"][data-slot^="player-"]'),
    ).toHaveCount(5);
    // Empty cells: still 10 (one gained, one freed).
    await expect(
      board.locator('button[data-testid="empty-cell"][data-cell^="player-"]'),
    ).toHaveCount(10);
  });

  test("tap-to-select + tap-occupied-cell swaps; same-row swap keeps 5 members (regression)", async ({
    page,
  }) => {
    await enterArenaDeploy(page);

    const board = page.locator('[data-testid="deployment-board"]');
    const members = board.locator(
      'button[data-testid="slot-anchor"][data-slot^="player-"]',
    );
    await expect(members).toHaveCount(5);

    // Swap the first two members (balanced preset puts both in the front
    // row — the exact same-row case that used to erase a crab).
    await members.nth(0).click({ force: true });
    await page.waitForTimeout(200);
    await members.nth(1).click({ force: true });
    await page.waitForTimeout(300);

    // Both crabs survive the swap: still exactly 5 members, 10 empties.
    await expect(members).toHaveCount(5);
    await expect(
      board.locator('button[data-testid="empty-cell"][data-cell^="player-"]'),
    ).toHaveCount(10);
    // And the two front cells are still occupied by (swapped) members.
    await expect(
      board.locator('button[data-testid="slot-anchor"][data-slot^="player-front-"]'),
    ).toHaveCount(2);
  });

  test("the freely arranged formation deploys into the live battle", async ({
    page,
  }) => {
    await enterArenaDeploy(page);

    const board = page.locator('[data-testid="deployment-board"]');
    // Move a front member to the back lane 5 cell…
    const first = board.locator(
      'button[data-testid="slot-anchor"][data-slot^="player-front-"]',
    );
    await first.first().click({ force: true });
    await board
      .locator('button[data-testid="empty-cell"][data-cell="player-back-4"]')
      .click({ force: true });
    await page.waitForTimeout(300);
    // …then deploy with the custom arrangement.
    await page
      .locator("main button:has-text('Deploy')")
      .first()
      .click({ force: true });
    await expect(page.getByTestId("battle-timer")).toBeVisible({
      timeout: 15000,
    });
  });
});
