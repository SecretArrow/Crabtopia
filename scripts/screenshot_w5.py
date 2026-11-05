"""Screenshot wave 5: home with Live & System section, notification bell, CrabDetail with procedural sprite."""
from pathlib import Path
from playwright.sync_api import sync_playwright

OUT = Path("/tmp/render")

def click_text(page, txt, timeout=3000):
    try:
        page.get_by_role("button", name=txt, exact=False).first.click(timeout=timeout)
        return True
    except Exception:
        try:
            page.get_by_text(txt, exact=False).first.click(timeout=2000)
            return True
        except Exception:
            return False

def main():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        ctx = browser.new_context(viewport={"width": 1280, "height": 900})
        page = ctx.new_page()
        page.goto("http://localhost:3000/", wait_until="networkidle", timeout=15000)
        page.wait_for_timeout(900)
        click_text(page, "Begin Your Tide")
        page.wait_for_timeout(1200)
        # New cinematic flow: click Continue twice, then Claim Your Burrow
        click_text(page, "Continue")
        page.wait_for_timeout(900)
        click_text(page, "Continue")
        page.wait_for_timeout(900)
        click_text(page, "Claim Your Burrow")
        page.wait_for_timeout(800)
        # Name phase — click "Start with Default Roster" (button text when no starter picked)
        click_text(page, "Start with Default Roster")
        page.wait_for_timeout(2500)
        # Scroll to bottom to see Live & System section
        page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
        page.wait_for_timeout(700)
        page.screenshot(path=str(OUT / "w5-home-live-system.png"))
        # Click Live Raid Spectate
        click_text(page, "Live Raid Spectate")
        page.wait_for_timeout(1800)
        page.screenshot(path=str(OUT / "w5-live-raid.png"))
        page.keyboard.press("Escape")
        page.wait_for_timeout(400)
        try: page.get_by_role("button", name="Close", exact=False).first.click(timeout=600)
        except: pass
        page.wait_for_timeout(400)
        # Click Admin Console
        page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
        page.wait_for_timeout(300)
        click_text(page, "Admin Console")
        page.wait_for_timeout(1200)
        page.screenshot(path=str(OUT / "w5-admin-gate.png"))
        # Authenticate
        try:
            page.get_by_role("button", name="Authenticate", exact=False).first.click(timeout=2000)
            page.wait_for_timeout(1200)
        except: pass
        page.screenshot(path=str(OUT / "w5-admin-overview.png"))
        page.keyboard.press("Escape")
        page.wait_for_timeout(400)
        try: page.get_by_role("button", name="Close", exact=False).first.click(timeout=600)
        except: pass
        page.wait_for_timeout(400)
        # Click notification bell (desktop sidebar) — use icon button
        try:
            page.locator("button[aria-label*='Notifications']").first.click(timeout=2000)
            page.wait_for_timeout(1200)
            page.screenshot(path=str(OUT / "w5-notif-center.png"))
            page.keyboard.press("Escape")
            page.wait_for_timeout(400)
            try: page.get_by_role("button", name="Close", exact=False).first.click(timeout=600)
            except: pass
            page.wait_for_timeout(400)
        except Exception as e:
            print("notif click err:", e)
        # Open a crab detail modal to test procedural sprite toggle
        # Navigate to Teams screen first
        click_text(page, "Teams")
        page.wait_for_timeout(1500)
        # Click on first crab card
        try:
            page.get_by_role("button", name="Details", exact=False).first.click(timeout=2000)
        except:
            try:
                page.locator("img").first.click(timeout=2000)
            except: pass
        page.wait_for_timeout(1500)
        page.screenshot(path=str(OUT / "w5-crabdetail-png.png"))
        # Toggle to procedural — use aria-label
        try:
            page.locator("button[aria-label='Toggle procedural sprite']").first.click(timeout=2000)
            page.wait_for_timeout(1000)
            page.screenshot(path=str(OUT / "w5-crabdetail-procedural.png"))
        except Exception as e:
            print("procedural toggle err:", e)
        ctx.close()
        browser.close()
    print("done")

if __name__ == "__main__":
    main()
