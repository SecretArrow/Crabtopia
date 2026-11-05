"""Screenshot Onboarding cinematic flow + HomeScreen with 3 sections."""
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
        # Splash
        page.screenshot(path=str(OUT / "w4-onb-splash.png"))
        # Click Begin Your Tide
        click_text(page, "Begin Your Tide")
        page.wait_for_timeout(1200)
        # Cinematic panel 1
        page.screenshot(path=str(OUT / "w4-onb-cine1.png"))
        # Advance to panel 2
        click_text(page, "Continue")
        page.wait_for_timeout(800)
        page.screenshot(path=str(OUT / "w4-onb-cine2.png"))
        # Advance to panel 3
        click_text(page, "Continue")
        page.wait_for_timeout(800)
        page.screenshot(path=str(OUT / "w4-onb-cine3.png"))
        # Click Claim Your Burrow
        click_text(page, "Claim Your Burrow")
        page.wait_for_timeout(800)
        # Name phase
        page.screenshot(path=str(OUT / "w4-onb-name.png"))
        # Pick a starter
        click_text(page, "Coral Bulwark")
        page.wait_for_timeout(400)
        page.screenshot(path=str(OUT / "w4-onb-name-picked.png"))
        # Start
        click_text(page, "Begin Your Journey")
        page.wait_for_timeout(2500)
        # Scroll to bottom of home to see all 3 sections
        page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
        page.wait_for_timeout(700)
        page.screenshot(path=str(OUT / "w4-home-store.png"))
        # Scroll up a bit for World & Market
        page.evaluate("window.scrollTo(0, document.body.scrollHeight * 0.6)")
        page.wait_for_timeout(400)
        page.screenshot(path=str(OUT / "w4-home-world.png"))
        ctx.close()
        browser.close()
    print("done")

if __name__ == "__main__":
    main()
