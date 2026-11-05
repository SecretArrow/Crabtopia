// Crabtopia E2E — Sprite & Animation Overhaul.
//
// Verifies the frame-based animation system end to end:
//   1. All sprite-sheet + FX flipbook assets are served (HTTP 200).
//   2. In a real battle, crab sprites render through the new system
//      (data-testid="animated-crab" for sheet crabs, "puppet-crab" for
//      rig crabs) and their data-anim-state leaves "idle" once battle
//      actions play out — the arena is a full auto battler, so actions
//      play by themselves with no input.
//   3. No sprite asset request fails (404) and the particle canvas mounts.

import { test, expect } from "@playwright/test";
import { completeOnboarding } from "./helpers";

const SHEETS = [
  "gildclaw",
  "warden",
  "reaver",
  "pincher",
  "bulwark",
  "skitter",
  "tidecaller",
  "shellmender",
];
const FX = [
  "slash",
  "spark",
  "lightning",
  "splash",
  "heal",
  "explosion",
  "shield",
  "levelup",
];

test.describe("Sprite animation system", () => {
  test("sprite sheet and flipbook assets are served", async ({ request }) => {
    for (const name of SHEETS) {
      const res = await request.get(`/art/sprites/${name}.png`);
      expect(res.status(), `sheet ${name}`).toBe(200);
    }
    for (const name of FX) {
      const res = await request.get(`/art/sprites/fx/${name}.png`);
      expect(res.status(), `fx ${name}`).toBe(200);
    }
  });

  test("battle renders animated sprites that change state, with no sprite 404s", async ({
    page,
  }) => {
    const failedSpriteRequests: string[] = [];
    page.on("response", (res) => {
      if (res.url().includes("/art/sprites/") && res.status() >= 400) {
        failedSpriteRequests.push(`${res.status()} ${res.url()}`);
      }
    });
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error" && /sprite|art\/sprites/i.test(msg.text())) {
        consoleErrors.push(msg.text());
      }
    });

    await completeOnboarding(page);
    await page.locator("nav button:has-text('Arena')").first().click({ force: true });
    await page.waitForTimeout(1500);
    await page.locator("button:has-text('Press to Dive')").first().click({ force: true });
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
    await page.locator("main button:has-text('Deploy')").first().click({ force: true });

    // Sample animation states from the moment the battle mounts — do
    // NOT sleep first. The battle is a real-time auto battler: units
    // MOVE on their own, so locomotion states (walk / run) must appear
    // — movement speed drives the animation state, there is no
    // static-image sliding. But the opening march is SHORT: the front
    // columns spawn 16% apart and close to the 9.5% contact stop in
    // well under a second at 9.5–17 %/s move speeds, and even
    // back-column units finish their crossing in ~2–4 s. The old flow
    // slept 6.5 s after Deploy (on top of the ~3.25 s loading
    // cinematic) before the first sample, so the march was over
    // before polling began — the old pass leaned on a steering
    // deadlock that kept a blocked unit reporting walk in place.
    // Polling therefore starts with the click; the locator is scoped
    // to the battle arena, which only exists once the battle mounts,
    // so deployment/loading sprites never pollute the sample.
    const sprites = page.locator(
      '[data-testid="battle-arena"] [data-testid="animated-crab"], ' +
        '[data-testid="battle-arena"] [data-testid="puppet-crab"]',
    );
    const seenStates = new Set<string>();
    await expect
      .poll(
        async () => {
          const states = await sprites.evaluateAll((els) =>
            els.map((el) => el.getAttribute("data-anim-state")),
          );
          for (const s of states) if (s) seenStates.add(s);
          return seenStates.has("walk") || seenStates.has("run");
        },
        { timeout: 30000, intervals: [300] },
      )
      .toBe(true);

    // Battle screen reached (the poll above can only succeed once the
    // arena mounted, but assert the spectator surface explicitly).
    await expect(page.getByTestId("battle-timer")).toBeVisible({ timeout: 10000 });

    // New-system sprites are on the field (sheet-animated and/or rig).
    await expect(sprites.first()).toBeVisible({ timeout: 10000 });
    expect(await sprites.count()).toBeGreaterThanOrEqual(5);

    // Particle canvas mounted in the arena.
    await expect(page.locator('[data-testid="particle-layer"]')).toBeAttached();

    expect(
      [...seenStates].some((s) => s !== "idle"),
    ).toBe(true);

    expect(failedSpriteRequests, failedSpriteRequests.join("\n")).toEqual([]);
    expect(consoleErrors, consoleErrors.join("\n")).toEqual([]);
  });
});
