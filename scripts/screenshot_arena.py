"""Screenshot the new Arena flow for visual verification."""
import asyncio
from playwright.async_api import async_playwright

BASE = "http://localhost:3000"
OUT = "/tmp/arena_shots"
import os
os.makedirs(OUT, exist_ok=True)

async def click_text(page, text, timeout=5000):
    btn = page.get_by_role("button", name=text).first
    try:
        await btn.wait_for(state="visible", timeout=timeout)
        await btn.click()
        return True
    except Exception:
        # fallback to text-only selector
        try:
            await page.get_by_text(text, exact=False).first.click(timeout=2000)
            return True
        except Exception:
            return False

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        ctx = await browser.new_context(viewport={"width": 1280, "height": 800})
        page = await ctx.new_page()

        # Onboarding flow
        await page.goto(BASE, wait_until="networkidle", timeout=60_000)
        await page.wait_for_timeout(1500)
        await page.screenshot(path=f"{OUT}/01-onboarding-splash.png")
        # Start onboarding - click "Begin Your Tide" or similar
        for txt in ["Begin Your Tide", "Begin", "Start", "Dive In", "Continue"]:
            if await click_text(page, txt, 2000):
                break
        await page.wait_for_timeout(1500)
        # Click through cinematic
        for _ in range(3):
            for txt in ["Continue", "Skip", "Next"]:
                if await click_text(page, txt, 1500):
                    break
            await page.wait_for_timeout(800)
        # Pick starter
        for txt in ["Claim Your Burrow", "Start with Default Roster", "Start", "Claim"]:
            if await click_text(page, txt, 2000):
                break
        await page.wait_for_timeout(2000)
        await page.screenshot(path=f"{OUT}/02-home.png")

        # Navigate to Arena
        # Click sidebar "Arena" button
        arena_btn = page.get_by_role("button", name="Arena").first
        try:
            await arena_btn.click(timeout=5000)
        except Exception:
            # try text
            await page.get_by_text("Arena", exact=False).first.click()
        await page.wait_for_timeout(1500)
        await page.screenshot(path=f"{OUT}/03-arena-splash.png")

        # Click "Press to Dive"
        for txt in ["Press to Dive", "Dive", "Dive In"]:
            if await click_text(page, txt, 3000):
                break
        await page.wait_for_timeout(1500)
        await page.screenshot(path=f"{OUT}/04-arena-menu.png")

        # Click Fight → opponent list
        for txt in ["Fight", "FIGHT"]:
            if await click_text(page, txt, 3000):
                break
        await page.wait_for_timeout(1500)
        await page.screenshot(path=f"{OUT}/05-arena-opponent-list.png")

        # Click first Battle button → team builder
        try:
            battle_btn = page.get_by_role("button", name="Battle").first
            await battle_btn.wait_for(state="visible", timeout=3000)
            await battle_btn.click()
            await page.wait_for_timeout(1500)
            await page.screenshot(path=f"{OUT}/06-arena-team-builder.png")
        except Exception as e:
            print(f"Battle button click failed: {e}")

        # Try clicking crabs to fill team
        try:
            crab_cards = page.locator("[class*='cursor-pointer']").all()
            count = await page.locator("[class*='cursor-pointer']").count()
            print(f"Found {count} clickable elements")
        except Exception:
            pass

        # Try Deploy
        for txt in ["Deploy", "Deploy!", "DEPLOY"]:
            if await click_text(page, txt, 2000):
                break
        await page.wait_for_timeout(1500)
        await page.screenshot(path=f"{OUT}/07-arena-loading.png")

        # Wait for battle to start
        await page.wait_for_timeout(4000)
        await page.screenshot(path=f"{OUT}/08-arena-battle.png")
        await page.wait_for_timeout(2000)
        await page.screenshot(path=f"{OUT}/09-arena-battle-2.png")

        # Navigate to activities from menu - go back to home first
        for txt in ["Continue", "Back"]:
            if await click_text(page, txt, 1500):
                break
        await page.wait_for_timeout(500)

        # Mining screen
        await page.goto(BASE, wait_until="networkidle", timeout=30_000)
        await page.wait_for_timeout(1000)
        mining_btn = page.get_by_role("button", name="Mining").first
        try:
            await mining_btn.click(timeout=3000)
        except Exception:
            await page.get_by_text("Mining", exact=False).first.click()
        await page.wait_for_timeout(1500)
        await page.screenshot(path=f"{OUT}/10-mining.png")

        # Exploration
        explore_btn = page.get_by_role("button", name="Explore").first
        try:
            await explore_btn.click(timeout=3000)
        except Exception:
            await page.get_by_text("Explore", exact=False).first.click()
        await page.wait_for_timeout(1500)
        await page.screenshot(path=f"{OUT}/11-exploration.png")

        # Breeding
        breed_btn = page.get_by_role("button", name="Breeding").first
        try:
            await breed_btn.click(timeout=3000)
        except Exception:
            await page.get_by_text("Breeding", exact=False).first.click()
        await page.wait_for_timeout(1500)
        await page.screenshot(path=f"{OUT}/12-breeding.png")

        # Crafting
        craft_btn = page.get_by_role("button", name="Crafting").first
        try:
            await craft_btn.click(timeout=3000)
        except Exception:
            await page.get_by_text("Crafting", exact=False).first.click()
        await page.wait_for_timeout(1500)
        await page.screenshot(path=f"{OUT}/13-crafting.png")

        # Inventory
        inv_btn = page.get_by_role("button", name="Inventory").first
        try:
            await inv_btn.click(timeout=3000)
        except Exception:
            await page.get_by_text("Inventory", exact=False).first.click()
        await page.wait_for_timeout(1500)
        await page.screenshot(path=f"{OUT}/14-inventory.png")

        await browser.close()
        print(f"Screenshots saved to {OUT}")

asyncio.run(main())
