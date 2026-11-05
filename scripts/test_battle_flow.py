"""Final test of arena battle flow — click Battle button by emoji text."""
import asyncio
from playwright.async_api import async_playwright

BASE = "http://localhost:3000"
OUT = "/tmp/arena_battle_test"
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

        # Onboarding (use any clickable button to advance)
        for sel in ["button:has-text('Begin')", "button:has-text('Start')", "button:has-text('Dive')"]:
            if await force_click(page, sel, 2000): break
        await page.wait_for_timeout(1000)
        # Skip cinematic
        for _ in range(5):
            for sel in ["button:has-text('Skip')", "button:has-text('Continue')"]:
                if await force_click(page, sel, 1000): break
            await page.wait_for_timeout(500)
        # Pick default roster
        for sel in ["button:has-text('Default Roster')", "button:has-text('Claim')", "button:has-text('Start')"]:
            if await force_click(page, sel, 2000): break
        await page.wait_for_timeout(2000)
        await force_click(page, "button:has-text('Skip tutorial')", 2000)
        await page.wait_for_timeout(800)

        # Arena nav
        await force_click(page, "nav button:has-text('Arena')", 3000)
        await page.wait_for_timeout(1500)
        # Wait for auto-advance OR click
        await force_click(page, "button:has-text('Press to Dive')", 3000)
        await page.wait_for_timeout(2500)

        # FIGHT
        await force_click(page, "main button:has-text('FIGHT')", 3000)
        await page.wait_for_timeout(2000)
        await page.screenshot(path=f"{OUT}/01-opponent-list.png")

        # Click first ⚔️ Battle button (text contains "Battle" not "Battle Log")
        btns = page.locator("main button")
        count = await btns.count()
        print(f"Buttons in main: {count}")
        clicked = False
        for i in range(count):
            b = btns.nth(i)
            txt = (await b.inner_text()).strip()
            # Match "⚔️ Battle" or "Battle" but exclude "Battle Log"
            if "Battle" in txt and "Log" not in txt:
                disabled = await b.is_disabled()
                print(f"  btn[{i}] = '{txt[:30]}' disabled={disabled}")
                if not disabled:
                    await b.click(force=True)
                    clicked = True
                    print(f"  clicked!")
                    break
        if not clicked:
            print("No Battle button clicked")
        await page.wait_for_timeout(2000)
        await page.screenshot(path=f"{OUT}/02-team-builder.png")

        # Click 3 crab cards in roster
        # Cards are usually divs with onClick — find them by class patterns
        cards = page.locator("main div[class*='cursor-pointer']")
        count = await cards.count()
        print(f"Roster cards: {count}")
        # Also try button elements that look like cards
        if count == 0:
            cards = page.locator("main button[class*='cursor-pointer']")
            count = await cards.count()
            print(f"Button cards: {count}")
        # Last resort: any clickable element in main that's not a primary button
        if count == 0:
            # Look for elements with role or class that suggests clickability
            cards = page.locator("main [class*='hover:']")
            count = await cards.count()
            print(f"Hover cards: {count}")

        for i in range(min(count, 3)):
            try:
                c = cards.nth(i)
                if await c.is_visible():
                    await c.click(force=True, timeout=1500)
                    print(f"Card {i} clicked")
                    await page.wait_for_timeout(400)
            except Exception as e:
                print(f"Card {i} err: {str(e)[:60]}")
        await page.wait_for_timeout(500)
        await page.screenshot(path=f"{OUT}/03-team-filled.png")

        # Deploy
        await force_click(page, "main button:has-text('Deploy')", 3000)
        await page.wait_for_timeout(2000)
        await page.screenshot(path=f"{OUT}/04-loading.png")
        await page.wait_for_timeout(3500)
        await page.screenshot(path=f"{OUT}/05-battle-start.png")
        await page.wait_for_timeout(2500)
        await page.screenshot(path=f"{OUT}/06-battle-2.png")
        await page.wait_for_timeout(3000)
        await page.screenshot(path=f"{OUT}/07-battle-3.png")
        # Wait longer for battle to progress
        await page.wait_for_timeout(5000)
        await page.screenshot(path=f"{OUT}/08-battle-4.png")

        await browser.close()

asyncio.run(main())
