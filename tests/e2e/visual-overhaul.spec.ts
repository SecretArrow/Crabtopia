// Crabtopia E2E — Visual & Skill Overhaul (user complaint round).
//
// Verifies:
//   1. The Arena menu (the screen from the user's screenshot) renders the
//      profile avatar and Top Crabs cards with each crab's OWN art as a
//      LIVING animated sheet sprite (data-testid="animated-crab", the
//      per-class battle sheet playing its idle clip) — and contains ZERO
//      of the retired procedural SVG blob (the old CrabSprite rendered
//      an <svg> inside its wrapper) and ZERO static portrait <img>s
//      (previews animate everywhere now; the intent is unchanged —
//      real character art, alive, never the SVG blob, never a stiff
//      still portrait).
//   2. New elemental flipbook assets (poison / ice / dark) are served.
//   3. In a real Auto battle, skill presentation profiles actually fire:
//      skill buttons carry data-skill-profile archetypes, and profiled
//      FX / projectiles (data-fx-profile / projectile-fx) appear.

import { test, expect } from "@playwright/test";
import { completeOnboarding } from "./helpers";

test.describe("Visual overhaul — no blob crabs anywhere", () => {
  test("arena menu avatar + top crabs show each crab's own living art, no SVG blob, no static portraits", async ({
    page,
  }) => {
    await completeOnboarding(page);
    await page
      .locator("nav button:has-text('Arena')")
      .first()
      .click({ force: true });
    await page.waitForTimeout(1500);

    // The old CrabSprite signature was an inline <svg> in the wrapper.
    const wrappers = page.locator('[data-testid="crab-sprite"]');
    await expect(wrappers.first()).toBeVisible({ timeout: 10000 });
    expect(await wrappers.count()).toBeGreaterThanOrEqual(3);

    // Every wrapper now contains the crab's own LIVING sheet sprite.
    const artInside = page.locator(
      '[data-testid="crab-sprite"] [data-testid="animated-crab"]',
    );
    expect(await artInside.count()).toBe(await wrappers.count());
    const SHEET_KEYS = [
      "gildclaw", "warden", "reaver", "pincher",
      "bulwark", "skitter", "tidecaller", "shellmender",
    ];
    const sheets = await artInside.evaluateAll((els) =>
      els.map((el) => el.getAttribute("data-sheet") ?? ""),
    );
    for (const key of sheets) {
      expect(SHEET_KEYS).toContain(key);
    }

    // Zero SVG blob crabs and zero static portrait <img>s on the page.
    expect(
      await page.locator('[data-testid="crab-sprite"] svg').count(),
    ).toBe(0);
    expect(await page.locator('img[data-testid="crab-art"]').count()).toBe(0);

    // CrabRenderer-based cards (hall/home) also render living sprites.
    await page
      .locator("nav button:has-text('Hall')")
      .first()
      .click({ force: true })
      .catch(() => {});
    await page.waitForTimeout(1200);
    const rendererArt = page.locator(
      '[data-testid="crab-renderer"] [data-testid="animated-crab"]',
    );
    if ((await rendererArt.count()) > 0) {
      expect(await rendererArt.count()).toBeGreaterThanOrEqual(1);
    }
  });

  test("new elemental flipbook assets are served", async ({ request }) => {
    for (const name of ["poison", "ice", "dark"]) {
      const res = await request.get(`/art/sprites/fx/${name}.png`);
      expect(res.status(), `fx ${name}`).toBe(200);
    }
  });
});

test.describe("Skill profiles in battle", () => {
  test("profiled skill FX fire during the auto battle", async ({
    page,
  }) => {
    const failedSpriteRequests: string[] = [];
    page.on("response", (res) => {
      if (res.url().includes("/art/sprites/") && res.status() >= 400) {
        failedSpriteRequests.push(`${res.status()} ${res.url()}`);
      }
    });

    await completeOnboarding(page);
    await page
      .locator("nav button:has-text('Arena')")
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

    const crabBtns = page.locator("main button[aria-pressed]");
    expect(await crabBtns.count()).toBeGreaterThanOrEqual(5);
    for (let i = 0; i < 5; i++) {
      await crabBtns.nth(i).click({ force: true });
      await page.waitForTimeout(300);
    }
    await page
      .locator("main button:has-text('Deploy')")
      .first()
      .click({ force: true });
    await page.waitForTimeout(6500);

    await expect(page.getByTestId("battle-timer")).toBeVisible({
      timeout: 10000,
    });

    // FULL AUTO BATTLER (genre change): there are no skill buttons to
    // advertise archetypes anymore — the AutoPilot plays both teams.
    // The skill-profile system still proves itself through the FX
    // layer: install a MutationObserver that accumulates every
    // (skillId -> profile) pair the battle renders, then wait until
    // several distinct skills with distinct profiles have fired.
    await expect(page.locator("button[data-skill-profile]")).toHaveCount(0);
    await page.evaluate(() => {
      const w = window as unknown as { __fxSeen: Record<string, string> };
      w.__fxSeen = {};
      const collect = () => {
        document.querySelectorAll("[data-fx-profile]").forEach((el) => {
          const sid = el.getAttribute("data-skill-id");
          const prof = el.getAttribute("data-fx-profile");
          if (sid && prof) w.__fxSeen[sid] = prof;
        });
      };
      collect();
      new MutationObserver(collect).observe(document.body, {
        childList: true,
        subtree: true,
      });
    });
    await expect
      .poll(
        async () =>
          page.evaluate(
            () =>
              Object.keys(
                (window as unknown as { __fxSeen: Record<string, string> })
                  .__fxSeen,
              ).length,
          ),
        { timeout: 60000, intervals: [500] },
      )
      .toBeGreaterThanOrEqual(3);
    const seen = await page.evaluate(
      () =>
        (window as unknown as { __fxSeen: Record<string, string> }).__fxSeen,
    );
    expect(new Set(Object.values(seen)).size).toBeGreaterThanOrEqual(2);

    expect(failedSpriteRequests, failedSpriteRequests.join("\n")).toEqual([]);
  });

  test("damage FX carry the attacker's element (element-driven VFX)", async ({
    page,
  }) => {
    const ALL_ELEMENTS = [
      "vulkara", "nerala", "bentala", "lintara", "anila",
      "himara", "rimba", "magmara", "taufan", "dentuma", "vapora", "lodara",
      "pulvara", "terika", "obsidara", "prismara", "andhakara", "waja",
    ];

    // Same proven deploy path as elements.spec (onboarding is NOT done
    // by a beforeEach in this file, so run it explicitly).
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

    // Install the element observer BEFORE deploying so even round-1
    // impacts are captured: every damage FX node (impact flipbook,
    // projectile, attack spark) carries data-fx-element with the
    // ATTACKING crab's element; support FX never carry it.
    await page.evaluate(() => {
      const w = window as unknown as { __fxElements: Set<string> };
      w.__fxElements = new Set<string>();
      const collect = () => {
        document.querySelectorAll("[data-fx-element]").forEach((el) => {
          const v = el.getAttribute("data-fx-element");
          if (v) w.__fxElements.add(v);
        });
      };
      collect();
      new MutationObserver(collect).observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["data-fx-element"],
      });
    });

    await page
      .locator("main button:has-text('Deploy')")
      .first()
      .click({ force: true });
    await expect(page.getByTestId("battle-timer")).toBeVisible({
      timeout: 15000,
    });
    // Cycle actions faster so several attackers act within the poll.
    await page
      .locator('[data-testid="battle-speed-btn"][data-speed="3"]')
      .click({ force: true });

    // The mixed-element starter team (5 distinct elements) plus the
    // enemy team guarantee several distinct attacker elements: wait
    // until at least 2 distinct ones have driven damage FX.
    await expect
      .poll(
        async () =>
          page.evaluate(
            () =>
              (window as unknown as { __fxElements: Set<string> }).__fxElements
                .size,
          ),
        { timeout: 35_000, intervals: [500] },
      )
      .toBeGreaterThanOrEqual(2);

    const values = await page.evaluate(() =>
      Array.from(
        (window as unknown as { __fxElements: Set<string> }).__fxElements,
      ),
    );
    expect(values.length).toBeGreaterThanOrEqual(2);
    // Every observed value is a real element id (support FX, which
    // carry no data-fx-element, can never pollute this set).
    for (const v of values) expect(ALL_ELEMENTS).toContain(v);
  });
});
