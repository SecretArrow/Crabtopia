"""Screenshot the new Arena flow — tutorial dismissed, real flow."""
import asyncio
from playwright.async_api import async_playwright

BASE = "http://localhost:3000"
OUT = "/tmp/arena_shots2"
import os
os.makedirs(OUT, exist_ok=True)

async def click_text(page, text, timeout=3000):
    btn = page.get_by_role("button", name=text, exact=False).first
    try:
        await btn.wait_for(state="visible", timeout=timeout)
        await btn.click()
        return True
    except Exception:
        try:
            el = page.get_by_text(text, exact=False).first
            await el.wait_for(state="visible", timeout=1500)
            await el.click()
            return True
        except Exception:
            return False

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        ctx = await browser.new_context(viewport={"width": 1280, "height": 800})
        page = await ctx.new_page()

        await page.goto(BASE, wait_until="networkidle", timeout=60_000)
        await page.wait_for_timeout(1500)
        # Skip onboarding cinematic — click through quickly
        for txt in ["Begin Your Tide", "Begin", "Start", "Dive In"]:
            if await click_text(page, txt, 2000):
                break
        await page.wait_for_timeout(800)
        # Click Skip on cinematic if present
        for _ in range(3):
            for txt in ["Skip", "Continue", "Next"]:
                if await click_text(page, txt, 1200):
                    break
            await page.wait_for_timeout(500)
        # Pick starter / default roster
        for txt in ["Claim Your Burrow", "Start with Default Roster", "Start", "Claim", "Continue"]:
            if await click_text(page, txt, 2000):
                break
        await page.wait_for_timeout(1500)
        # Skip tutorial if visible
        for txt in ["Skip tutorial", "Skip Tutorial"]:
            if await click_text(page, txt, 2000):
                break
        await page.wait_for_timeout(800)
        await page.screenshot(path=f"{OUT}/00-home-no-tutorial.png")

        # ===== ARENA FLOW =====
        # Click Arena nav
        await page.get_by_role("button", name="Arena").first.click()
        await page.wait_for_timeout(1500)
        await page.screenshot(path=f"{OUT}/01-arena-splash.png")
        # Click Dive
        for txt in ["Press to Dive", "Dive", "Dive In"]:
            if await click_text(page, txt, 3000):
                break
        await page.wait_for_timeout(1500)
        await page.screenshot(path=f"{OUT}/02-arena-menu.png")
        # Click Fight
        for txt in ["Fight", "FIGHT"]:
            if await click_text(page, txt, 3000):
                break
        await page.wait_for_timeout(1500)
        await page.screenshot(path=f"{OUT}/03-arena-opponent-list.png")

        # Click first opponent's Battle button (label is "Battle <name>")
        # Use a broader selector
        try:
            # find any button whose name starts with "Battle"
            btns = page.get_by_role("button")
            count = await btns.count()
            for i in range(count):
                b = btns.nth(i)
                name = await b.get_attribute("aria-label") or await b.inner_text()
                if name and name.strip().startswith("Battle"):
                    # check not disabled
                    disabled = await b.is_disabled()
                    if not disabled:
                        await b.click()
                        print(f"Clicked Battle button: {name.strip()[:40]}")
                        break
        except Exception as e:
            print(f"Battle click failed: {e}")
        await page.wait_for_timeout(1500)
        await page.screenshot(path=f"{OUT}/04-arena-team-builder.png")

        # Click 3 crab cards in roster to fill team
        try:
            # roster cards are clickable divs with crab previews
            # find by selector that matches roster card pattern
            cards = page.locator("div[class*='cursor-pointer']")
            count = await cards.count()
            print(f"Found {count} clickable cards")
            clicked = 0
            for i in range(min(count, 8)):
                try:
                    c = cards.nth(i)
                    # only click if visible and not the deploy button
                    if await c.is_visible():
                        await c.click(timeout=1000)
                        clicked += 1
                        await page.wait_for_timeout(300)
                        if clicked >= 3:
                            break
                except Exception:
                    continue
            print(f"Clicked {clicked} cards")
        except Exception as e:
            print(f"Card click failed: {e}")
        await page.wait_for_timeout(500)
        await page.screenshot(path=f"{OUT}/05-arena-team-filled.png")

        # Click Deploy
        for txt in ["Deploy", "Deploy!", "DEPLOY"]:
            if await click_text(page, txt, 2000):
                break
        await page.wait_for_timeout(1500)
        await page.screenshot(path=f"{OUT}/06-arena-loading.png")
        # Wait for loading to finish (3 seconds)
        await page.wait_for_timeout(3500)
        await page.screenshot(path=f"{OUT}/07-arena-battle.png")
        # Wait 2 more seconds to see animations
        await page.wait_for_timeout(2000)
        await page.screenshot(path=f"{OUT}/08-arena-battle-2.png")

        # ===== ACTIVITIES =====
        # Mining
        await page.get_by_role("button", name="Mining").first.click()
        await page.wait_for_timeout(1500)
        await page.screenshot(path=f"{OUT}/09-mining.png")

        # Exploration
        await page.get_by_role("button", name="Explore").first.click()
        await page.wait_for_timeout(1500)
        await page.screenshot(path=f"{OUT}/10-exploration.png")

        # Breeding
        await page.get_by_role("button", name="Breeding").first.click()
        await page.wait_for_timeout(1500)
        await page.screenshot(path=f"{OUT}/11-breeding.png")

        # Crafting
        await page.get_by_role("button", name="Crafting").first.click()
        await page.wait_for_timeout(1500)
        await page.screenshot(path=f"{OUT}/12-crafting.png")

        # Inventory
        await page.get_by_role("button", name="Inventory").first.click()
        await page.wait_for_timeout(1500)
        await page.screenshot(path=f"{OUT}/13-inventory.png")

        await browser.close()
        print(f"Screenshots saved to {OUT}")

asyncio.run(main())
