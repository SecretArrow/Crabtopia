// Crabtopia E2E — Option A anchored slot layout.
//
// Verifies the AFK-Arena style battlefield the user picked:
//   1. The deployment board renders the SAME slot map as the battle
//      (10 slot anchors, unique data-slot keys, slot boxes that never
//      overlap, per-class original art in the member buttons).
//   2. In battle, all 10 crabs SPAWN on their anchors (the deployment
//      arrangement), then move freely — the sim's separation steering
//      keeps their centres apart while they fight.
//   3. Desktop 1440x900: battle sprites are large again (>= 115px wide,
//      up from the old fixed 72–92px).
//   4. Mobile 390x844: all 10 crabs stay inside the arena while moving, centres
//      never overlap.

import { test, expect, type Page } from "@playwright/test";
import { completeOnboarding } from "./helpers";

async function enterArenaDeploy(page: Page) {
  await completeOnboarding(page);
  // Two navs exist (desktop sidebar + mobile bottom bar); exactly one
  // is visible per viewport — click the visible Arena button.
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

async function deployToBattle(page: Page) {
  await enterArenaDeploy(page);
  await page
    .locator("main button:has-text('Deploy')")
    .first()
    .click({ force: true });
  await expect(page.getByTestId("battle-timer")).toBeVisible({
    timeout: 15000,
  });
  await page.waitForTimeout(1200);
}

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

function rectsOverlap(a: Rect, b: Rect, tol = 2): boolean {
  return (
    a.x < b.x + b.width - tol &&
    b.x < a.x + a.width - tol &&
    a.y < b.y + b.height - tol &&
    b.y < a.y + a.height - tol
  );
}

function anyOverlap(rects: Rect[], tol = 2): boolean {
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      if (rectsOverlap(rects[i], rects[j], tol)) return true;
    }
  }
  return false;
}

async function rectsOf(
  page: Page,
  selector: string,
): Promise<Rect[]> {
  return page.locator(selector).evaluateAll((els) =>
    els.map((el) => {
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    }),
  );
}

test.describe("Option A — anchored slot layout", () => {
  test("deployment board uses the battle slot map with original art", async ({
    page,
  }) => {
    await enterArenaDeploy(page);

    const board = page.locator('[data-testid="deployment-board"]');
    await expect(board).toBeVisible();
    const anchors = board.locator('[data-testid="slot-anchor"]');
    await expect(anchors).toHaveCount(10);

    const keys = await anchors.evaluateAll((els) =>
      els.map((el) => el.getAttribute("data-slot") ?? ""),
    );
    expect(new Set(keys).size).toBe(10);
    expect(keys.filter((k) => k.startsWith("player-")).length).toBe(5);
    expect(keys.filter((k) => k.startsWith("enemy-")).length).toBe(5);

    // Slot boxes on the board never overlap (deterministic layout).
    const rects = await rectsOf(
      page,
      '[data-testid="deployment-board"] [data-testid="slot-anchor"]',
    );
    expect(rects.length).toBe(10);
    expect(anyOverlap(rects)).toBe(false);

    // Member buttons + team-select cards show each crab's own LIVING
    // art (animated sheet sprite — previews animate everywhere now).
    const memberArt = board.locator(
      'button[data-testid="slot-anchor"] [data-testid="animated-crab"]',
    );
    await expect(memberArt).toHaveCount(5);
    const teamArt = page.locator(
      '[data-testid="arena-team-select"] [data-testid="animated-crab"]',
    );
    expect(await teamArt.count()).toBeGreaterThanOrEqual(1);
    const SHEET_KEYS = [
      "gildclaw", "warden", "reaver", "pincher",
      "bulwark", "skitter", "tidecaller", "shellmender",
    ];
    const sheet = await memberArt.first().getAttribute("data-sheet");
    expect(SHEET_KEYS).toContain(sheet);
    // No static portrait <img> renders on the board anymore.
    expect(await board.locator('img[data-testid="crab-art"]').count()).toBe(0);
  });

  test("battle: units spawn on their anchors, then move with separation", async ({
    page,
  }) => {
    await deployToBattle(page);

    const units = page.locator(
      '[data-testid="battle-arena"] [data-crab-id]',
    );
    await expect(units).toHaveCount(10);
    const keys = await units.evaluateAll((els) =>
      els.map((el) => el.getAttribute("data-slot") ?? ""),
    );
    expect(new Set(keys).size).toBe(10);

    // Slot markers are rendered under every crab.
    await expect(
      page.locator('[data-testid="battle-arena"] [data-testid="slot-marker"]'),
    ).toHaveCount(10);

    // Spawn sanity (positions sampled shortly after deploy — units may
    // already be stepping, so assert the formation's ordering rather
    // than exact pixels): each side holds its own half, and a side's
    // front row is closer to the centre line than its back row.
    const spawn = await units.evaluateAll((els) =>
      els.map((el) => ({
        side: el.getAttribute("data-side"),
        row: el.getAttribute("data-row"),
        x: Number(el.getAttribute("data-unit-x")),
      })),
    );
    for (const u of spawn) {
      if (u.side === "player") expect(u.x).toBeLessThan(58);
      else expect(u.x).toBeGreaterThan(42);
    }
    for (const side of ["player", "enemy"] as const) {
      const front = spawn.filter((u) => u.side === side && u.row === "front");
      const back = spawn.filter((u) => u.side === side && u.row === "back");
      if (front.length && back.length) {
        const f = Math.min(...front.map((u) => Math.abs(u.x - 50)));
        const b = Math.min(...back.map((u) => Math.abs(u.x - 50)));
        expect(f).toBeLessThan(b);
      }
    }

    // While the fight runs, the sim's separation steering keeps unit
    // CENTRES at least ~24px apart at every sampled moment (units may
    // press into melee range, but they never stack onto one point).
    const centres = async (): Promise<{ x: number; y: number }[]> =>
      units.evaluateAll((els) =>
        els.map((el) => {
          const r = el.getBoundingClientRect();
          return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
        }),
      );
    for (let s = 0; s < 6; s++) {
      const pts = await centres();
      expect(pts.length).toBe(10);
      for (let i = 0; i < pts.length; i++) {
        for (let j = i + 1; j < pts.length; j++) {
          const d = Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y);
          expect(d).toBeGreaterThanOrEqual(22);
        }
      }
      await page.waitForTimeout(700);
    }
  });

  test("desktop 1440x900: battle sprites are large", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await deployToBattle(page);
    await expect(
      page.locator(
        '[data-testid="battle-arena"] [data-testid="animated-crab"]',
      ),
    ).toHaveCount(10, { timeout: 10000 });
    const sprites = await rectsOf(
      page,
      '[data-testid="battle-arena"] [data-testid="animated-crab"]',
    );
    expect(sprites.length).toBe(10);
    for (const s of sprites) {
      expect(s.width).toBeGreaterThanOrEqual(115);
    }
  });

  test("mobile 390x844: all crabs inside the arena, centres separated", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await deployToBattle(page);

    const arena = await page
      .locator('[data-testid="battle-arena"]')
      .boundingBox();
    expect(arena).toBeTruthy();

    // Units move freely now, but the sim's field clamps + separation
    // keep every unit inside the arena and off its neighbours.
    const unitRects = await rectsOf(
      page,
      '[data-testid="battle-arena"] [data-crab-id]',
    );
    expect(unitRects.length).toBe(10);
    const centres = unitRects.map((r) => ({
      x: r.x + r.width / 2,
      y: r.y + r.height / 2,
    }));
    for (let i = 0; i < centres.length; i++) {
      for (let j = i + 1; j < centres.length; j++) {
        const d = Math.hypot(
          centres[i].x - centres[j].x,
          centres[i].y - centres[j].y,
        );
        expect(d).toBeGreaterThanOrEqual(20);
      }
    }

    const sprites = await rectsOf(
      page,
      '[data-testid="battle-arena"] [data-testid="animated-crab"]',
    );
    expect(sprites.length).toBe(10);
    for (const s of sprites) {
      expect(s.x).toBeGreaterThanOrEqual(arena!.x - 4);
      expect(s.y).toBeGreaterThanOrEqual(arena!.y - 4);
      expect(s.x + s.width).toBeLessThanOrEqual(
        arena!.x + arena!.width + 4,
      );
      expect(s.y + s.height).toBeLessThanOrEqual(
        arena!.y + arena!.height + 4,
      );
      // Responsive sizing floor: battle crabs are no longer tiny on a
      // phone — sprites breathe past their slot-box width (the boxes
      // themselves never overlap; sprites are lane depth-sorted) and
      // must reach at least 80px at 390×844.
      expect(s.width).toBeGreaterThanOrEqual(80);
    }
  });
});
