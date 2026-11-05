// Crabtopia E2E — shared onboarding helper.
//
// The game starts in an onboarding flow (splash → cinematic → name → tutorial).
// This helper walks the player through that flow as quickly as possible so each
// test can begin from the playable Home screen with 2000 gold and 3 default
// crabs.
//
// Onboarding button labels (verified against OnboardingScreen.tsx):
//   • Splash:        "🦀 Begin Your Tide"
//   • Cinematic:     "Continue →" (panels 0,1), "Claim Your Burrow →" (panel 2)
//                    + a small "Skip story" link that jumps straight to name phase
//   • Name phase:    "Start with Default Roster →" (no starter picked) OR
//                    "Begin Your Journey →" (if a starter was picked)
//
// After initPlayer runs, the TutorialGuide coachmark overlays the home screen
// at z-[90] and blocks clicks to underlying buttons. We dismiss it via the
// "Skip tutorial" button at the bottom of the coach card.

import type { Page } from "@playwright/test";

// Step 1: clear localStorage so the persisted Zustand save is wiped, then
// reload so onboarding begins from scratch. This guarantees a clean slate
// regardless of what previous tests left behind.
export async function resetGameSave(page: Page): Promise<void> {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.evaluate("localStorage.clear()");
  await page.reload({ waitUntil: "domcontentloaded" });
  // Give Next.js + Zustand a moment to hydrate.
  await page.waitForTimeout(800);
}

// Step 2: click through the onboarding phases. Each phase renders a different
// button; we probe for each likely label and click whatever is visible. Using
// `force: true` so that brief Framer Motion overlays during phase transitions
// don't reject the click.
export async function clickOnboardingButtons(page: Page): Promise<void> {
  // --- Splash: "Begin Your Tide" ---
  for (const sel of [
    "button:has-text('Begin Your Tide')",
    "button:has-text('Begin')",
    "button:has-text('Start')",
  ]) {
    const btn = page.locator(sel).first();
    if (await btn.isVisible({ timeout: 2500 }).catch(() => false)) {
      await btn.click({ force: true });
      break;
    }
  }
  await page.waitForTimeout(700);

  // --- Cinematic: prefer "Skip story" to jump straight to name phase,
  //     otherwise click "Continue" until we reach the final panel, then
  //     "Claim Your Burrow". Loop a handful of times to be safe.
  for (let i = 0; i < 6; i++) {
    let advanced = false;
    for (const sel of [
      "button:has-text('Skip story')",
      "button:has-text('Skip')",
      "button:has-text('Claim Your Burrow')",
      "button:has-text('Claim')",
      "button:has-text('Continue')",
    ]) {
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

  // --- Name phase: "Start with Default Roster" (no starter picked) or
  //     "Begin Your Journey" (starter picked). Either button calls
  //     initPlayer(name) which mounts the GameShell.
  for (const sel of [
    "button:has-text('Start with Default Roster')",
    "button:has-text('Default Roster')",
    "button:has-text('Begin Your Journey')",
    "button:has-text('Claim')",
    "button:has-text('Start')",
    "button:has-text('Begin')",
  ]) {
    const btn = page.locator(sel).first();
    if (await btn.isVisible({ timeout: 2500 }).catch(() => false)) {
      await btn.click({ force: true });
      break;
    }
  }
  // Wait for initPlayer to commit + GameShell to mount + home screen to render.
  await page.waitForTimeout(1500);
}

// Step 3: dismiss the TutorialGuide coachmark if it appeared. The coach card
// sits at z-[90] and intercepts clicks meant for the underlying nav buttons.
export async function skipTutorial(page: Page): Promise<void> {
  const skipBtn = page.locator("button:has-text('Skip tutorial')").first();
  if (await skipBtn.isVisible({ timeout: 2500 }).catch(() => false)) {
    await skipBtn.click({ force: true });
    await page.waitForTimeout(400);
  }
}

// Convenience wrapper: full onboarding → ready-to-play state.
export async function completeOnboarding(page: Page): Promise<void> {
  await resetGameSave(page);
  await clickOnboardingButtons(page);
  await skipTutorial(page);
}
