"""Screenshot Home + open each of the 7 Live Events/World modals."""
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
        page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
        page.wait_for_timeout(600)
        page.screenshot(path=str(OUT / "w3-home-bottom.png"))

        targets = [
            ("Tidepass & Seasons", "w3-tidepass"),
            ("Reef Plots",         "w3-reef"),
            ("Bazaar Auctions",    "w3-auctions"),
            ("Weekly Lottery",     "w3-lottery"),
        ]
        for label, name in targets:
            # ensure scrolled to top so card is visible
            page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
            page.wait_for_timeout(300)
            ok = click_text(page, label)
            page.wait_for_timeout(1400)
            page.screenshot(path=str(OUT / f"{name}.png"))
            # close modal via Escape
            page.keyboard.press("Escape")
            page.wait_for_timeout(300)
            # fallback: click any Close button
            try:
                page.get_by_role("button", name="Close", exact=False).first.click(timeout=600)
                page.wait_for_timeout(300)
            except Exception:
                pass
            print(f"{name}: clicked={ok}")
        ctx.close()
        browser.close()
    print("done")

if __name__ == "__main__":
    main()
