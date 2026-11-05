// E2E for the 18-element system: element badges on cards and the
// detail modal, the "Child Element Possibilities" panel in the Nursery
// (the game's ONE breeding surface; recipe-aware, computed from the
// actual parents picked), and the Codex elements section listing all
// 18 elements + recipe table.
import { test, expect, type Page } from "@playwright/test";
import { completeOnboarding, resetGameSave, skipTutorial } from "./helpers";

test.beforeEach(async ({ page }) => {
  await resetGameSave(page);
  await completeOnboarding(page);
});

const RECIPES: Record<string, string> = {
  "anila+nerala": "himara",
  "bentala+nerala": "rimba",
  "bentala+vulkara": "magmara",
  "lintara+nerala": "taufan",
  "bentala+lintara": "dentuma",
  "nerala+vulkara": "vapora",
  "anila+bentala": "lodara",
};

const ALL_ELEMENTS = [
  "vulkara", "nerala", "bentala", "lintara", "anila",
  "himara", "rimba", "magmara", "taufan", "dentuma", "vapora", "lodara",
  "pulvara", "terika", "obsidara", "prismara", "andhakara", "waja",
];

test("nursery (the one breeding surface) shows parent elements and the child-possibilities panel", async ({
  page,
}) => {
  // A fresh save fields only ROOKIES, and the canonical Nursery flow
  // rejects rookies — graduate the first two starters in the persisted
  // save (same save-edit pattern as the CrabCard test below) so the
  // parent picker offers them.
  await page.evaluate(() => {
    const raw = localStorage.getItem("crabtopia-save");
    if (!raw) throw new Error("persisted save not found");
    const data = JSON.parse(raw);
    const crabs = data.state.player.crabs as Array<{ isRookie: boolean }>;
    crabs[0].isRookie = false;
    crabs[1].isRookie = false;
    localStorage.setItem("crabtopia-save", JSON.stringify(data));
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  await skipTutorial(page);

  await page.getByText("Nursery", { exact: true }).first().click();

  // Pick both parents through the canonical Radix popover picker
  // (rows are buttons wrapping a crab renderer; the already-picked
  // parent is excluded from the second picker's list).
  const rows = page.locator(
    "[data-radix-popper-content-wrapper] button:has([data-testid='crab-renderer'])",
  );
  await page.getByRole("button", { name: "Pick Parent A" }).click();
  await expect(rows.first()).toBeVisible({ timeout: 10_000 });
  await rows.nth(0).click();
  await page.getByRole("button", { name: "Pick Parent B" }).click();
  await expect(rows.first()).toBeVisible({ timeout: 10_000 });
  await rows.nth(0).click();

  // Both parent slots now carry an element badge (first two badges in
  // DOM order are the Parent A / Parent B slots).
  const badges = page.locator("[data-testid='element-badge']");
  await expect(badges.nth(1)).toBeVisible({ timeout: 10_000 });
  const elA = await badges.nth(0).getAttribute("data-element");
  const elB = await badges.nth(1).getAttribute("data-element");
  expect(elA).toBeTruthy();
  expect(elB).toBeTruthy();

  // The possibilities panel appears with the mutation note; when the
  // picked pair matches a recipe, the combined element is offered.
  const panel = page.getByTestId("breeding-element-preview");
  await expect(panel).toBeVisible();
  await expect(panel).toContainText("Rare special mutation");
  const key = [elA, elB].sort().join("+");
  const recipe = RECIPES[key];
  if (recipe) {
    await expect(
      panel.locator(`[data-testid='element-badge'][data-element='${recipe}']`),
    ).toHaveCount(1);
    await expect(panel).toContainText("Combination recipe");
  } else {
    // No recipe: both parent elements are listed as inheritance options.
    await expect(
      panel.locator(`[data-testid='element-badge'][data-element='${elA}']`),
    ).not.toHaveCount(0);
    await expect(
      panel.locator(`[data-testid='element-badge'][data-element='${elB}']`),
    ).not.toHaveCount(0);
  }
});

test("element badges show on crab cards and in the detail modal", async ({
  page,
}) => {
  // Fresh saves field all 5 starters in the default team, leaving the
  // Teams "Available Crabs" grid (the CrabCard surface) empty — and the
  // Nursery picker rejects rookies, so no CrabCard is reachable there
  // either. Duplicate one roster crab in the persisted save so exactly
  // one spare CrabCard exists (same save-edit pattern as
  // team-gameplay.spec's roster shrink).
  await page.evaluate(() => {
    const raw = localStorage.getItem("crabtopia-save");
    if (!raw) throw new Error("persisted save not found");
    const data = JSON.parse(raw);
    const crabs = data.state.player.crabs as Array<{ id: string }>;
    crabs.push({ ...crabs[0], id: `${crabs[0].id}-spare` });
    localStorage.setItem("crabtopia-save", JSON.stringify(data));
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  await skipTutorial(page);

  await page
    .locator("nav button:has-text('Teams')")
    .first()
    .click({ force: true });

  // The spare crab renders as a CrabCard (button wrapping the crab's
  // renderer) in the Available Crabs section, carrying exactly its own
  // element badge.
  const available = page
    .locator("section")
    .filter({ hasText: "Available Crabs" });
  const card = available
    .locator("button:has([data-testid='crab-renderer'])")
    .first();
  await expect(card).toBeVisible({ timeout: 20_000 });
  await expect(card.locator("[data-testid='element-badge']")).toHaveCount(1);

  // The card's character wears exactly one element AURA layer, and it
  // names the same element as the card's badge.
  await expect(card.locator("[data-element-aura]")).toHaveCount(1);

  // Clicking the card opens the Crab Dossier detail modal — the badge
  // is there too: the modal adds exactly one more badge to the page,
  // rendered last (portal), with the same element as the card's.
  const cardElement = await card
    .locator("[data-testid='element-badge']")
    .getAttribute("data-element");
  const badges = page.locator("[data-testid='element-badge']");
  const badgeCountBefore = await badges.count();
  await card.click();
  await expect(page.getByText("Crab Dossier")).toBeVisible({
    timeout: 10_000,
  });
  await expect(badges).toHaveCount(badgeCountBefore + 1, {
    timeout: 10_000,
  });
  await expect(badges.last()).toBeVisible();
  expect(await badges.last().getAttribute("data-element")).toBe(cardElement);

  // The card's aura names the badge's element…
  expect(
    await card.locator("[data-element-aura]").getAttribute("data-element-aura"),
  ).toBe(cardElement);

  // …and the detail modal's portrait carries the same aura (rendered
  // last, inside the portal, like its badge).
  const pageAuras = page.locator("[data-element-aura]");
  await expect(pageAuras.last()).toBeVisible();
  expect(await pageAuras.last().getAttribute("data-element-aura")).toBe(
    cardElement,
  );
});

// Deploy into a running auto battle (same proven path as
// slot-layout.spec; onboarding is already done by the beforeEach).
async function deployToAutoBattle(page: Page) {
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
  await page
    .locator("main button:has-text('Deploy')")
    .first()
    .click({ force: true });
  await expect(page.getByTestId("battle-timer")).toBeVisible({
    timeout: 15000,
  });
}

test("battle crabs wear an aura of their own element", async ({ page }) => {
  await deployToAutoBattle(page);

  // All 10 deployed crabs (5 per side) carry exactly one aura layer
  // each, and every aura names a real element. Poll briefly: the
  // assertion runs at battle start, before any crab can fall.
  const auras = page
    .getByTestId("battle-arena")
    .locator("[data-element-aura]");
  await expect
    .poll(async () => auras.count(), { timeout: 15_000, intervals: [250] })
    .toBe(10);
  const values = await auras.evaluateAll((els) =>
    els.map((el) => el.getAttribute("data-element-aura")),
  );
  expect(values).toHaveLength(10);
  for (const v of values) expect(ALL_ELEMENTS).toContain(v);
});

test("Codex lists all 18 elements and the combination table", async ({
  page,
}) => {
  await page.getByText("Codex", { exact: true }).first().click();
  const section = page.getByTestId("codex-elements");
  await expect(section).toBeVisible({ timeout: 20_000 });

  const ids = await section
    .locator("[data-testid='element-badge']")
    .evaluateAll((els) =>
      els.map((el) => el.getAttribute("data-element")),
    );
  for (const id of ALL_ELEMENTS) {
    expect(ids, `Codex should list element ${id}`).toContain(id);
  }
  await expect(section).toContainText("Breeding Combination Table");
  await expect(section).toContainText("Himara");

  // Element icons: every badge in the section (element list + recipe
  // table rows) renders its medallion icon image from /art/elements/.
  const icons = section.locator(
    "[data-testid='element-badge'] img[src*='/art/elements/']",
  );
  expect(await icons.count()).toBeGreaterThan(0);
  expect(await icons.count()).toBe(
    await section.locator("[data-testid='element-badge']").count(),
  );
  await expect(icons.first()).toBeVisible();
});
