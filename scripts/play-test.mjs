// Deep play-test: verify the bug fixes end-to-end in a real browser.
// 1. Arena full loop: deploy → skip → result → rewards actually applied
//    (gold + XP + battle log shows WIN for victory).
// 2. Graduate: rookie crab detail modal → Graduate button → becomes adult.
// 3. Hire: Hall listing → hire NPC crab → roster grows.
import { chromium } from "@playwright/test";

const BASE = "http://localhost:3000";

async function completeOnboarding(page) {
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.evaluate("localStorage.clear()");
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(800);
  for (const sel of ["button:has-text('Begin Your Tide')", "button:has-text('Begin')"]) {
    const btn = page.locator(sel).first();
    if (await btn.isVisible({ timeout: 2500 }).catch(() => false)) {
      await btn.click({ force: true });
      break;
    }
  }
  await page.waitForTimeout(700);
  for (let i = 0; i < 6; i++) {
    let advanced = false;
    for (const sel of ["button:has-text('Skip story')", "button:has-text('Claim Your Burrow')", "button:has-text('Continue')"]) {
      const btn = page.locator(sel).first();
      if (await btn.isVisible({ timeout: 600 }).catch(() => false)) {
        await btn.click({ force: true });
        advanced = true;
        await page.waitForTimeout(450);
        break;
      }
    }
    if (!advanced) break;
  }
  for (const sel of ["button:has-text('Start with Default Roster')", "button:has-text('Begin Your Journey')"]) {
    const btn = page.locator(sel).first();
    if (await btn.isVisible({ timeout: 2500 }).catch(() => false)) {
      await btn.click({ force: true });
      break;
    }
  }
  await page.waitForTimeout(1500);
  const skipBtn = page.locator("button:has-text('Skip tutorial')").first();
  if (await skipBtn.isVisible({ timeout: 2500 }).catch(() => false)) {
    await skipBtn.click({ force: true });
    await page.waitForTimeout(400);
  }
}

const save = (page) =>
  page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem("crabtopia-save") || "{}");
    const p = s?.state?.player ?? null;
    return {
      gold: p?.gold,
      xp: p?.shellwardenXp,
      level: p?.shellwardenLevel,
      crabs: p?.crabs?.length,
      rookies: p?.crabs?.filter((c) => c.isRookie).length,
    };
  });

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await completeOnboarding(page);
  const before = await save(page);
  console.log("BEFORE:", JSON.stringify(before));

  // ---- 1. ARENA FULL LOOP (retry until a victory is observed) ----
  await page.locator("nav button:has-text('Arena')").first().click({ force: true });
  await page.waitForTimeout(1500);
  await page.locator("button:has-text('Press to Dive')").first().click({ force: true });
  await page.waitForTimeout(1500);
  let won = false;
  let attempts = 0;
  while (!won && attempts < 5) {
    attempts++;
    await page.locator("main button:has-text('FIGHT')").click({ force: true });
    await page.waitForTimeout(2000);
    // Pick the WEAKEST opponent (highest rank number) so the starter team
    // can realistically win — the first card may be the strongest.
    const weakestIdx = await page.evaluate(() => {
      const cards = [...document.querySelectorAll("main .grid > div, main section .grid > *")];
      const ranks = [...document.querySelectorAll("main *")]
        .filter((el) => /^#\d+$/.test((el.textContent || "").trim()) && el.children.length === 0)
        .map((el) => Number((el.textContent || "").trim().slice(1)));
      if (ranks.length === 0) return 0;
      // Rank appears once per opponent card, in card order.
      const maxRank = Math.max(...ranks);
      return ranks.indexOf(maxRank);
    });
    const battleBtns = page.locator("main button").filter({ hasText: /Battle/ });
    const count = await battleBtns.count();
    const pick = Math.min(weakestIdx, Math.max(0, count - 1));
    for (let i = 0; i < count; i++) {
      const b = battleBtns.nth(i === 0 ? pick : i);
      const txt = (await b.innerText()).trim();
      if (/Battle/.test(txt) && !/Log/.test(txt) && !(await b.isDisabled())) {
        await b.click({ force: true });
        break;
      }
    }
    await page.waitForTimeout(2000);
    try {
      await page.locator("text=Deploy Your Tideguard").waitFor({ timeout: 8000 });
    } catch {
      const state = await save(page);
      const heading = await page.locator("h1, h2").first().innerText().catch(() => "(none)");
      console.log(
        `!! attempt ${attempts}: deploy board never appeared (heading="${heading}", gold=${state.gold})`,
      );
      break;
    }
    // Free-place a crab on the FIRST attempt only — SAME row, different
    // lane (a harmless move that exercises free placement without displacing
    // the tank: putting the bulwark in the back row drops the win rate to
    // ~0%, which the engine sim confirms).
    if (attempts === 1) {
      const mid = page.locator('button[data-testid="slot-anchor"][data-slot^="player-mid-"]').first();
      await mid.click({ force: true });
      await page.locator('button[data-testid="empty-cell"][data-cell="player-mid-3"]').click({ force: true });
      await page.waitForTimeout(300);
    }
    await page.locator("main button:has-text('Deploy')").first().click({ force: true });
    await page.locator("text=/Turn \\d+/").waitFor({ timeout: 15000 });
    // Skip to the result.
    await page.locator('[aria-label="Skip to the battle result"]').first().click({ force: true });
    await page.locator('[role="dialog"]').waitFor({ timeout: 20000 });
    const bodyText = await page.locator('[role="dialog"]').innerText().catch(() => "");
    won = /VICTORY/i.test(bodyText);
    console.log(`attempt ${attempts}: ${won ? "VICTORY" : "defeat"}`);
    await page.locator('button:has-text("Continue")').first().click({ force: true });
    await page.waitForTimeout(1000);
  }
  console.log(won ? "won a battle ✓" : "!! could not win in 5 attempts");

  const after = await save(page);
  console.log("AFTER ARENA:", JSON.stringify(after));
  console.log(
    after.gold !== before.gold || after.xp !== before.xp
      ? "rewards applied ✓"
      : "!! NO REWARD CHANGE ✗",
  );

  // Battle log badge: victory must show WIN (not LOSS).
  await page.locator("main button:has-text('Battle Log')").first().click({ force: true });
  await page.waitForTimeout(500);
  const logBadge = await page.evaluate(() => {
    const els = [...document.querySelectorAll("span")];
    const badge = els.find((e) => /^(WIN|LOSS)$/.test((e.textContent || "").trim()));
    return badge ? badge.textContent.trim() : "(no badge found)";
  });
  console.log("battle log badge:", logBadge, logBadge === "WIN" ? "✓" : "(defeat or missing — check)");

  // ---- 2. GRADUATE A ROOKIE (via the Arena menu showcase dossier) ----
  // We are still on the arena menu after the battle-log check.
  const showcase = page.locator('[aria-label^="Open dossier for"]').first();
  if (await showcase.isVisible({ timeout: 3000 }).catch(() => false)) {
    await showcase.click({ force: true });
    await page.waitForTimeout(800);
    const gradBtn = page.locator('[data-testid="graduate-crab"]');
    if (await gradBtn.isVisible({ timeout: 2500 }).catch(() => false)) {
      await gradBtn.click({ force: true });
      await page.waitForTimeout(800);
      const afterGrad = await save(page);
      console.log(
        `graduate: rookies ${before.rookies} -> ${afterGrad.rookies}`,
        afterGrad.rookies === before.rookies - 1 ? "✓" : "✗",
      );
    } else {
      console.log("dossier opened but no graduate button (crab not rookie?)");
    }
  } else {
    console.log("!! showcase dossier card not found on arena menu");
  }

  // ---- 3. HIRE FROM HALL ----
  await page.locator("nav button:has-text('Hall')").first().click({ force: true });
  await page.waitForTimeout(1000);
  const hireBtn = page.locator("button:has-text('Hire')").first();
  if (await hireBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    const beforeHire = await save(page);
    await hireBtn.click({ force: true });
    await page.waitForTimeout(800);
    const afterHire = await save(page);
    console.log(
      `hire: crabs ${beforeHire.crabs} -> ${afterHire.crabs}`,
      afterHire.crabs === beforeHire.crabs + 1 ? "✓ (crab joins roster)" : "✗ (crab lost!)",
    );
  } else {
    console.log("no Hire button visible in Hall");
  }

  await browser.close();
})().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
