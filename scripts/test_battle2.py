"""Test battle flow — click crab cards as buttons."""
import asyncio
from playwright.async_api import async_playwright

BASE = "http://localhost:3000"
OUT = "/tmp/arena_battle2"
import os
os.makedirs(OUT, exist_ok=True)

async def force_click(page, selector, timeout=3000):
    try:
        btn = page.locator(selector).first
        await btn.wait_for(state="attached", timeout=timeout)
        await btn.click(force=True, timeout=2000)
        return True
    except Exception as e:
        print(f"click failed ({selector}): {str(e)[:80]}")
        return False

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        ctx = await browser.new_context(viewport={"width": 1280, "height": 800})
        page = await ctx.new_page()

        await page.goto(BASE, wait_until="networkidle", timeout=60_000)
        await page.evaluate("localStorage.clear()")
        await page.reload(wait_until="networkidle", timeout=30_000)
        await page.wait_for_timeout(1500)

        # Onboarding
        for sel in ["button:has-text('Begin')", "button:has-text('Start')"]:
            if await force_click(page, sel, 2000): break
        await page.wait_for_timeout(1000)
        for _ in range(5):
            for sel in ["button:has-text('Skip')", "button:has-text('Continue')"]:
                if await force_click(page, sel, 1000): break
            await page.wait_for_timeout(500)
        for sel in ["button:has-text('Default Roster')", "button:has-text('Claim')", "button:has-text('Start')"]:
            if await force_click(page, sel, 2000): break
        await page.wait_for_timeout(2000)
        await force_click(page, "button:has-text('Skip tutorial')", 2000)
        await page.wait_for_timeout(800)

        # Arena flow
        await force_click(page, "nav button:has-text('Arena')", 3000)
        await page.wait_for_timeout(1500)
        await force_click(page, "button:has-text('Press to Dive')", 3000)
        await page.wait_for_timeout(2500)
        await force_click(page, "main button:has-text('FIGHT')", 3000)
        await page.wait_for_timeout(2000)

        # Click first Battle button (⚔️ Battle)
        btns = page.locator("main button")
        count = await btns.count()
        for i in range(count):
            b = btns.nth(i)
            txt = (await b.inner_text()).strip()
            if "Battle" in txt and "Log" not in txt and not (await b.is_disabled()):
                await b.click(force=True)
                print(f"Battle clicked: {txt[:20]}")
                break
        await page.wait_for_timeout(2000)
        await page.screenshot(path=f"{OUT}/01-team-builder.png")

        # Click crab cards — they're motion.button elements with aria-pressed
        # Find buttons with aria-pressed attribute
        crab_btns = page.locator("main button[aria-pressed]")
        count = await crab_btns.count()
        print(f"Crab buttons: {count}")
        for i in range(min(count, 3)):
            try:
                b = crab_btns.nth(i)
                if await b.is_visible():
                    await b.click(force=True, timeout=1500)
                    print(f"Crab {i} clicked")
                    await page.wait_for_timeout(400)
            except Exception as e:
                print(f"Crab {i} err: {str(e)[:60]}")
        await page.wait_for_timeout(500)
        await page.screenshot(path=f"{OUT}/02-team-filled.png")

        # Deploy
        btns = page.locator("main button")
        count = await btns.count()
        for i in range(count):
            b = btns.nth(i)
            txt = (await b.inner_text()).strip()
            if "Deploy" in txt and not (await b.is_disabled()):
                await b.click(force=True)
                print(f"Deploy clicked: {txt[:20]}")
                break
        await page.wait_for_timeout(2000)
        await page.screenshot(path=f"{OUT}/03-loading.png")
        await page.wait_for_timeout(3500)
        await page.screenshot(path=f"{OUT}/04-battle.png")
        await page.wait_for_timeout(3000)
        await page.screenshot(path=f"{OUT}/05-battle-2.png")
        await page.wait_for_timeout(4000)
        await page.screenshot(path=f"{OUT}/06-battle-3.png")
        # Wait longer
        await page.wait_for_timeout(8000)
        await page.screenshot(path=f"{OUT}/07-battle-late.png")

        await browser.close()

asyncio.run(main())
