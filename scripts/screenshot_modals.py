"""Screenshot HomeScreen + open each Live Events modal."""
from pathlib import Path
from playwright.sync_api import sync_playwright

OUT = Path("/tmp/render")
OUT.mkdir(parents=True, exist_ok=True)

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
        for w, h, s in [(1280, 900, "desk"), (390, 844, "mob")]:
            ctx = browser.new_context(viewport={"width": w, "height": h})
            page = ctx.new_page()
            page.goto("http://localhost:3000/", wait_until="networkidle", timeout=15000)
            page.wait_for_timeout(900)
            click_text(page, "Begin Your Tide")
            page.wait_for_timeout(800)
            click_text(page, "Claim Your Burrow")
            page.wait_for_timeout(2500)
            # Scroll down to Live Events
            page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
            page.wait_for_timeout(700)
            page.screenshot(path=str(OUT / f"live-events-{s}.png"))

            # Click Quests & Codex
            click_text(page, "Quests & Codex")
            page.wait_for_timeout(1200)
            page.screenshot(path=str(OUT / f"quests-modal-{s}.png"))
            # Close via Escape
            page.keyboard.press("Escape")
            page.wait_for_timeout(400)
            try:
                page.get_by_role("button", name="Close", exact=False).first.click(timeout=800)
            except Exception:
                pass
            page.wait_for_timeout(400)

            # Click Clans
            click_text(page, "Clans")
            page.wait_for_timeout(1200)
            page.screenshot(path=str(OUT / f"clans-modal-{s}.png"))
            page.keyboard.press("Escape")
            page.wait_for_timeout(400)
            try:
                page.get_by_role("button", name="Close", exact=False).first.click(timeout=800)
            except Exception:
                pass
            page.wait_for_timeout(400)

            # Click Leviathan Raid
            click_text(page, "Leviathan Raid")
            page.wait_for_timeout(1200)
            page.screenshot(path=str(OUT / f"leviathan-modal-{s}.png"))
            ctx.close()
        browser.close()
    print("done")

if __name__ == "__main__":
    main()
