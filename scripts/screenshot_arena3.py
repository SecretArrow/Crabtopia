"""Verify arena flow by waiting for auto-advance (4s) instead of clicking."""
import asyncio
from playwright.async_api import async_playwright

BASE = "http://localhost:3000"
OUT = "/tmp/arena_shots3"
import os
os.makedirs(OUT, exist_ok=True)

async def click_btn(page, selector, timeout=3000):
    try:
        btn = page.locator(selector).first
        await btn.wait_for(state="visible", timeout=timeout)
        await btn.click()
        return True
    except Exception as e:
        print(f"click failed ({selector}): {e}")
        return False

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        ctx = await browser.new_context(viewport={"width": 1280, "height": 800})
        page = await ctx.new_page()

        await page.goto(BASE, wait_until="networkidle", timeout=60_000)
        await page.wait_for_timeout(1500)
        # Onboarding: click begin
        for sel in ["button:has-text('Begin')", "button:has-text('Start')", "button:has-text('Dive In')"]:
            if await click_btn(page, sel, 1500):
                break
        await page.wait_for_timeout(800)
        # Click through cinematic
        for _ in range(4):
            for sel in ["button:has-text('Skip')", "button:has-text('Continue')", "button:has-text('Next')"]:
                if await click_btn(page, sel, 1200):
                    break
            await page.wait_for_timeout(500)
        # Pick starter
        for sel in ["button:has-text('Claim')", "button:has-text('Start with')", "button:has-text('Start')"]:
            if await click_btn(page, sel, 2000):
                break
        await page.wait_for_timeout(1500)
        # Skip tutorial
        await click_btn(page, "button:has-text('Skip tutorial')", 2000)
        await page.wait_for_timeout(800)

        # Click Arena nav (specific selector to avoid Dive Map match)
        await click_btn(page, "nav button:has-text('Arena')", 3000)
        await page.wait_for_timeout(1500)
        await page.screenshot(path=f"{OUT}/01-arena-splash.png")

        # Click Press to Dive (specific button text)
        await click_btn(page, "button:has-text('Press to Dive')", 3000)
        await page.wait_for_timeout(2000)
        await page.screenshot(path=f"{OUT}/02-arena-menu.png")

        # Click Fight
        await click_btn(page, "button:has-text('Fight')", 3000)
        await page.wait_for_timeout(2000)
        await page.screenshot(path=f"{OUT}/03-arena-opponent-list.png")

        # Click first Battle button (starts with "Battle")
        try:
            btns = page.locator("button")
            count = await btns.count()
            clicked = False
            for i in range(count):
                b = btns.nth(i)
                txt = (await b.inner_text()).strip()
                if txt.startswith("Battle") and not (await b.is_disabled()):
                    await b.click()
                    print(f"Clicked: {txt[:40]}")
                    clicked = True
                    break
            if not clicked:
                print("No Battle button found")
        except Exception as e:
            print(f"Battle btn err: {e}")
        await page.wait_for_timeout(2000)
        await page.screenshot(path=f"{OUT}/04-arena-team-builder.png")

        # Click 3 roster crabs (specific to roster grid - they're cards in main area)
        try:
            # Look for clickable elements in the main content area (not sidebar)
            main = page.locator("main").first
            cards = main.locator("[class*='cursor-pointer']")
            count = await cards.count()
            print(f"Found {count} clickable cards in main")
            for i in range(min(count, 3)):
                c = cards.nth(i)
                if await c.is_visible():
                    await c.click(timeout=1500)
                    await page.wait_for_timeout(300)
        except Exception as e:
            print(f"Card click err: {e}")
        await page.wait_for_timeout(500)
        await page.screenshot(path=f"{OUT}/05-arena-team-filled.png")

        # Deploy
        await click_btn(page, "button:has-text('Deploy')", 3000)
        await page.wait_for_timeout(2000)
        await page.screenshot(path=f"{OUT}/06-arena-loading.png")
        # Wait for loading to finish
        await page.wait_for_timeout(3500)
        await page.screenshot(path=f"{OUT}/07-arena-battle.png")
        await page.wait_for_timeout(2500)
        await page.screenshot(path=f"{OUT}/08-arena-battle-2.png")

        # Activities
        await click_btn(page, "nav button:has-text('Mining')", 3000)
        await page.wait_for_timeout(1500)
        await page.screenshot(path=f"{OUT}/09-mining.png")
        await click_btn(page, "nav button:has-text('Explore')", 3000)
        await page.wait_for_timeout(1500)
        await page.screenshot(path=f"{OUT}/10-exploration.png")
        await click_btn(page, "nav button:has-text('Breeding')", 3000)
        await page.wait_for_timeout(1500)
        await page.screenshot(path=f"{OUT}/11-breeding.png")
        await click_btn(page, "nav button:has-text('Crafting')", 3000)
        await page.wait_for_timeout(1500)
        await page.screenshot(path=f"{OUT}/12-crafting.png")
        await click_btn(page, "nav button:has-text('Inventory')", 3000)
        await page.wait_for_timeout(1500)
        await page.screenshot(path=f"{OUT}/13-inventory.png")

        await browser.close()
        print(f"Screenshots saved to {OUT}")

asyncio.run(main())
