"""Debug arena flow with detailed screenshots."""
import asyncio
from playwright.async_api import async_playwright

BASE = "http://localhost:3000"
OUT = "/tmp/arena_debug"
import os
os.makedirs(OUT, exist_ok=True)

async def click_btn(page, selector, timeout=3000):
    try:
        btn = page.locator(selector).first
        await btn.wait_for(state="visible", timeout=timeout)
        await btn.click(timeout=2000)
        return True
    except Exception as e:
        print(f"click failed ({selector}): {str(e)[:100]}")
        return False

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        ctx = await browser.new_context(viewport={"width": 1280, "height": 800})
        page = await ctx.new_page()

        await page.goto(BASE, wait_until="networkidle", timeout=60_000)
        await page.wait_for_timeout(1500)
        for sel in ["button:has-text('Begin')", "button:has-text('Start')"]:
            if await click_btn(page, sel, 1500): break
        await page.wait_for_timeout(800)
        for _ in range(4):
            for sel in ["button:has-text('Skip')", "button:has-text('Continue')"]:
                if await click_btn(page, sel, 1200): break
            await page.wait_for_timeout(500)
        for sel in ["button:has-text('Claim')", "button:has-text('Start with')"]:
            if await click_btn(page, sel, 2000): break
        await page.wait_for_timeout(1500)
        await click_btn(page, "button:has-text('Skip tutorial')", 2000)
        await page.wait_for_timeout(800)

        # Click Arena nav
        await click_btn(page, "nav button:has-text('Arena')", 3000)
        await page.wait_for_timeout(1500)
        await page.screenshot(path=f"{OUT}/01-splash.png")
        # Click Dive
        await click_btn(page, "button:has-text('Press to Dive')", 3000)
        await page.wait_for_timeout(2000)
        await page.screenshot(path=f"{OUT}/02-menu.png")

        # Get all visible buttons in main area
        btns_text = await page.locator("main button").all_inner_texts()
        print(f"Main buttons visible: {btns_text[:10]}")

        # Click Fight
        clicked = await click_btn(page, "main button:has-text('Fight')", 3000)
        print(f"Fight clicked: {clicked}")
        await page.wait_for_timeout(2000)
        await page.screenshot(path=f"{OUT}/03-after-fight.png")

        # Get all visible buttons now
        btns_text = await page.locator("main button").all_inner_texts()
        print(f"After Fight buttons: {btns_text[:10]}")

        # Try clicking Battle button
        battle_btns = page.locator("main button").filter(has_text="Battle")
        count = await battle_btns.count()
        print(f"Battle buttons found: {count}")
        if count > 0:
            for i in range(count):
                b = battle_btns.nth(i)
                if not await b.is_disabled():
                    txt = await b.inner_text()
                    print(f"Clicking: {txt[:30]}")
                    await b.click()
                    break
        await page.wait_for_timeout(2000)
        await page.screenshot(path=f"{OUT}/04-team-builder.png")

        btns_text = await page.locator("main button").all_inner_texts()
        print(f"TeamBuilder buttons: {btns_text[:10]}")

        # Try clicking roster cards (any clickable element in main that's not a button)
        cards = page.locator("main div[class*='cursor-pointer']")
        count = await cards.count()
        print(f"Roster cards: {count}")
        for i in range(min(count, 3)):
            try:
                c = cards.nth(i)
                if await c.is_visible():
                    await c.click(timeout=1500)
                    print(f"Clicked card {i}")
                    await page.wait_for_timeout(300)
            except Exception:
                pass
        await page.wait_for_timeout(500)
        await page.screenshot(path=f"{OUT}/05-team-filled.png")

        # Deploy
        await click_btn(page, "main button:has-text('Deploy')", 3000)
        await page.wait_for_timeout(2000)
        await page.screenshot(path=f"{OUT}/06-loading.png")
        await page.wait_for_timeout(3500)
        await page.screenshot(path=f"{OUT}/07-battle.png")
        await page.wait_for_timeout(2500)
        await page.screenshot(path=f"{OUT}/08-battle-2.png")

        await browser.close()

asyncio.run(main())
