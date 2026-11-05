"""Take screenshots of the Crabtopia game after entering gameplay and switching screens."""
from pathlib import Path
from playwright.sync_api import sync_playwright

OUT = Path("/tmp/render")
OUT.mkdir(parents=True, exist_ok=True)

# desktop sidebar nav ids, in order
NAV_IDS = ["home", "map", "teams", "hall", "nursery", "bazaar", "coliseum", "codex"]

def click_by_text(page, txt, timeout=4000):
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
        for w, h, suffix in [(1280, 900, "desk"), (390, 844, "mob")]:
            ctx = browser.new_context(viewport={"width": w, "height": h}, device_scale_factor=1)
            page = ctx.new_page()
            try:
                page.goto("http://localhost:3000/", wait_until="networkidle", timeout=20000)
            except Exception as e:
                print("goto err:", e)
            page.wait_for_timeout(1200)
            # Click "Begin Your Tide" to enter game
            click_by_text(page, "Begin Your Tide")
            page.wait_for_timeout(1000)
            # Then click "Claim Your Burrow" (the name input defaults to "Shellwarden")
            click_by_text(page, "Claim Your Burrow")
            page.wait_for_timeout(3000)
            # Screenshot the home (now playing)
            page.screenshot(path=str(OUT / f"play-home-{suffix}.png"), full_page=False)
            # Switch through nav items
            for nav_id in NAV_IDS[1:]:
                # Mobile uses bottom nav + More popover; Desktop uses sidebar.
                # Try clicking by visible text label first.
                label_map = {
                    "map": "Dive Map", "teams": "Teams", "hall": "Hall",
                    "nursery": "Nursery", "bazaar": "Bazaar",
                    "coliseum": "Arena", "codex": "Codex",
                }
                clicked = click_by_text(page, label_map[nav_id], timeout=1800)
                if not clicked and suffix == "mob" and nav_id in ("coliseum", "codex"):
                    # open More
                    click_by_text(page, "More", timeout=1500)
                    page.wait_for_timeout(400)
                    click_by_text(page, label_map[nav_id], timeout=1500)
                page.wait_for_timeout(1500)
                page.screenshot(path=str(OUT / f"play-{nav_id}-{suffix}.png"), full_page=False)
            ctx.close()
        browser.close()
    print("done")

if __name__ == "__main__":
    main()
