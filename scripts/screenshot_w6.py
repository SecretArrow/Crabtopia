"""Screenshot wave 6: tutorial overlay, new home sections, new modals."""
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
        page.wait_for_timeout(1000)
        # Skip story to go straight to name phase
        click_text(page, "Skip story")
        page.wait_for_timeout(700)
        click_text(page, "Start with Default Roster")
        page.wait_for_timeout(2500)
        # Tutorial guide step 0 should be visible on home
        page.screenshot(path=str(OUT / "w6-tutorial-step0.png"))
        # Advance tutorial step 0 → navigate to map
        click_text(page, "Go to Dive Map")
        page.wait_for_timeout(1500)
        page.screenshot(path=str(OUT / "w6-tutorial-step1.png"))
        # Skip tutorial to see plain home
        click_text(page, "Skip Tutorial")
        page.wait_for_timeout(800)
        # Scroll to bottom for new sections
        page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
        page.wait_for_timeout(700)
        page.screenshot(path=str(OUT / "w6-home-learn-watch.png"))
        page.evaluate("window.scrollTo(0, document.body.scrollHeight * 0.75)")
        page.wait_for_timeout(500)
        page.screenshot(path=str(OUT / "w6-home-community.png"))
        # Open Daily Rewards
        page.evaluate("window.scrollTo(0, document.body.scrollHeight * 0.75)")
        click_text(page, "Tidewell Rewards")
        page.wait_for_timeout(1400)
        page.screenshot(path=str(OUT / "w6-daily-rewards.png"))
        page.keyboard.press("Escape")
        page.wait_for_timeout(300)
        try: page.get_by_role("button", name="Close", exact=False).first.click(timeout=600)
        except: pass
        page.wait_for_timeout(400)
        # Open Tutorials
        page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
        click_text(page, "Tutorials")
        page.wait_for_timeout(1400)
        page.screenshot(path=str(OUT / "w6-tutorials.png"))
        page.keyboard.press("Escape")
        page.wait_for_timeout(300)
        try: page.get_by_role("button", name="Close", exact=False).first.click(timeout=600)
        except: pass
        page.wait_for_timeout(400)
        # Open Leaderboards
        page.evaluate("window.scrollTo(0, document.body.scrollHeight * 0.75)")
        click_text(page, "Leaderboards")
        page.wait_for_timeout(1400)
        page.screenshot(path=str(OUT / "w6-leaderboards.png"))
        ctx.close()
        browser.close()
    print("done")

if __name__ == "__main__":
    main()
