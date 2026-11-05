"""Screenshot Coliseum active battle flow."""
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
        page.wait_for_timeout(700)
        click_text(page, "Claim Your Burrow")
        page.wait_for_timeout(2200)
        # Navigate to Coliseum (Arena)
        click_text(page, "Arena")
        page.wait_for_timeout(1500)
        page.screenshot(path=str(OUT / "coliseum-entry-desk.png"))
        # Pick Story Reefs mode (likely already default)
        click_text(page, "Story Reefs")
        page.wait_for_timeout(400)
        # Click Enter the Coliseum
        click_text(page, "Enter the Coliseum")
        page.wait_for_timeout(2500)
        page.screenshot(path=str(OUT / "coliseum-active-desk.png"))
        # Try clicking a skill button
        try:
            page.get_by_role("button", name="Cast", exact=False).first.click(timeout=2000)
            page.wait_for_timeout(1500)
        except Exception:
            pass
        page.screenshot(path=str(OUT / "coliseum-cast-desk.png"))
        ctx.close()
        browser.close()
    print("done")

if __name__ == "__main__":
    main()
