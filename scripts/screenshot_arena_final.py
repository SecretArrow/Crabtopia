"""Final arena flow test with force-click to bypass overlays."""
import asyncio
from playwright.async_api import async_playwright

BASE = "http://localhost:3000"
OUT = "/tmp/arena_final"
import os
os.makedirs(OUT, exist_ok=True)

async def force_click(page, selector, timeout=3000):
    """Click with force=True to bypass overlay coverage checks."""
    try:
        btn = page.locator(selector).first
        await btn.wait_for(state="attached", timeout=timeout)
        await btn.click(force=True, timeout=2000)
        return True
    except Exception as e:
        print(f"click failed ({selector}): {str(e)[:100]}")
        return False

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        ctx = await browser.new_context(viewport={"width": 1280, "height": 800})
        page = await ctx.new_page()

        # Clear localStorage to start fresh
        await page.goto(BASE, wait_until="networkidle", timeout=60_000)
        await page.evaluate("localStorage.clear()")
        await page.reload(wait_until="networkidle", timeout=30_000)
        await page.wait_for_timeout(1500)

        # Onboarding
        await force_click(page, "button:has-text('Begin')", 3000)
        await page.wait_for_timeout(1000)
        # Skip cinematic
        for _ in range(4):
            await force_click(page, "button:has-text('Skip')", 1500)
            await force_click(page, "button:has-text('Continue')", 1500)
            await page.wait_for_timeout(500)
        # Pick default roster
        await force_click(page, "button:has-text('Default Roster')", 3000)
        await force_click(page, "button:has-text('Claim')", 3000)
        await force_click(page, "button:has-text('Start')", 3000)
        await page.wait_for_timeout(2000)
        # Skip tutorial
        await force_click(page, "button:has-text('Skip tutorial')", 3000)
        await page.wait_for_timeout(800)

        # Click Arena nav
        await force_click(page, "nav button:has-text('Arena')", 3000)
        await page.wait_for_timeout(1500)
        await page.screenshot(path=f"{OUT}/01-splash.png")

        # Press to Dive (use force to bypass any pulsing rings)
        await force_click(page, "button:has-text('Press to Dive')", 3000)
        await page.wait_for_timeout(2000)
        await page.screenshot(path=f"{OUT}/02-menu.png")

        # FIGHT button — force click to bypass overlay
        await force_click(page, "main button:has-text('FIGHT')", 3000)
        await page.wait_for_timeout(2000)
        await page.screenshot(path=f"{OUT}/03-opponent-list.png")

        # Find opponent Battle buttons (must start with "Battle " not "Battle Log")
        btns = page.locator("main button")
        count = await btns.count()
        print(f"Main buttons: {count}")
        clicked = False
        for i in range(count):
            b = btns.nth(i)
            txt = (await b.inner_text()).strip()
            if txt.startswith("Battle ") and "Log" not in txt:
                if not await b.is_disabled():
                    print(f"Clicking opponent: {txt[:50]}")
                    await b.click(force=True)
                    clicked = True
                    break
        if not clicked:
            print("No opponent Battle button found")
        await page.wait_for_timeout(2000)
        await page.screenshot(path=f"{OUT}/04-team-builder.png")

        # Click 3 roster crab cards
        cards = page.locator("main [class*='cursor-pointer']")
        count = await cards.count()
        print(f"Roster cards: {count}")
        for i in range(min(count, 3)):
            try:
                c = cards.nth(i)
                if await c.is_visible():
                    await c.click(force=True, timeout=1500)
                    print(f"Clicked card {i}")
                    await page.wait_for_timeout(300)
            except Exception as e:
                print(f"Card {i} err: {str(e)[:50]}")
        await page.wait_for_timeout(500)
        await page.screenshot(path=f"{OUT}/05-team-filled.png")

        # Deploy
        await force_click(page, "main button:has-text('Deploy')", 3000)
        await page.wait_for_timeout(2000)
        await page.screenshot(path=f"{OUT}/06-loading.png")
        await page.wait_for_timeout(3500)
        await page.screenshot(path=f"{OUT}/07-battle.png")
        await page.wait_for_timeout(2500)
        await page.screenshot(path=f"{OUT}/08-battle-2.png")
        await page.wait_for_timeout(3000)
        await page.screenshot(path=f"{OUT}/09-battle-3.png")

        # Activities
        await force_click(page, "nav button:has-text('Mining')", 3000)
        await page.wait_for_timeout(1500)
        # Try clicking Mine button to test it works
        await force_click(page, "main button:has-text('Mine')", 2000)
        await page.wait_for_timeout(2000)
        await page.screenshot(path=f"{OUT}/10-mining-after-mine.png")

        await force_click(page, "nav button:has-text('Explore')", 3000)
        await page.wait_for_timeout(1500)
        # Try clicking a tile
        tiles = page.locator("main button[class*='cursor-pointer'], main [class*='cursor-pointer']")
        count = await tiles.count()
        print(f"Exploration tiles: {count}")
        if count > 0:
            try:
                await tiles.nth(0).click(force=True, timeout=1500)
                await page.wait_for_timeout(1500)
            except Exception:
                pass
        await page.screenshot(path=f"{OUT}/11-exploration-after-reveal.png")

        await force_click(page, "nav button:has-text('Breeding')", 3000)
        await page.wait_for_timeout(1500)
        await page.screenshot(path=f"{OUT}/12-breeding.png")

        await force_click(page, "nav button:has-text('Crafting')", 3000)
        await page.wait_for_timeout(1500)
        await page.screenshot(path=f"{OUT}/13-crafting.png")

        await force_click(page, "nav button:has-text('Inventory')", 3000)
        await page.wait_for_timeout(1500)
        await page.screenshot(path=f"{OUT}/14-inventory.png")

        await browser.close()
        print(f"Screenshots saved to {OUT}")

asyncio.run(main())
