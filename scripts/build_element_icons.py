#!/usr/bin/env python3
"""
Crabtopia element icon pipeline — deterministic, re-runnable.

- Turns the 18 generated element medallions (gold ring + navy disc,
  varied canvas backgrounds: black / navy / light) in
  ~/workspace/imagine_media into transparent PNGs under
  public/art/elements/<id>.png.
- The medallion circle is DETECTED from the gold ring (gold-ish pixel
  mask -> bounding circle), with a centred inscribed-circle fallback;
  a circular alpha mask (1.5px feather) makes every corner fully
  transparent. A steam wisp crossing the ring (vapora) is clipped by
  the circle — accepted by design.
- Validates every output (corner alpha MUST be 0, centre opaque) and
  writes scripts/element_icon_report.json — the unit test locks that
  evidence like the sprite pipeline's validation report.
- Output size: 256x256 (badges render at 10-20px, Codex at ~14-28px).

Usage: python3 scripts/build_element_icons.py
Optional env: CRABTOPIA_MEDIA_DIR (default ~/workspace/imagine_media)
Requires: Pillow, numpy. No network.
"""
import glob
import json
import os
from pathlib import Path

import numpy as np
from PIL import Image

REPO_ROOT = Path(__file__).resolve().parent.parent
MEDIA_DIR = Path(os.environ.get(
    "CRABTOPIA_MEDIA_DIR", Path.home() / "workspace" / "imagine_media"))

ELEMENT_IDS = [
    "vulkara", "nerala", "bentala", "lintara", "anila",
    "himara", "rimba", "magmara", "taufan", "dentuma", "vapora",
    "lodara", "pulvara", "terika", "obsidara", "prismara",
    "andhakara", "waja",
]

OUT_SIZE = 256


def detect_circle(rgb: np.ndarray) -> tuple[float, float, float, bool]:
    """Bounding circle of the gold ring; fallback = inscribed circle."""
    h, w = rgb.shape[:2]
    r_ch = rgb[:, :, 0].astype(int)
    g_ch = rgb[:, :, 1].astype(int)
    b_ch = rgb[:, :, 2].astype(int)
    gold = (r_ch > 130) & (g_ch > 85) & (b_ch < 140) & ((r_ch - b_ch) > 50)
    ys, xs = np.where(gold)
    if len(xs) > 500:
        cx = (xs.min() + xs.max()) / 2.0
        cy = (ys.min() + ys.max()) / 2.0
        rad = max(xs.max() - xs.min(), ys.max() - ys.min()) / 2.0
        # Sanity: near-centred, near-inscribed — otherwise fall back.
        if (abs(cx - w / 2) < 0.06 * w and abs(cy - h / 2) < 0.06 * h
                and 0.38 * min(w, h) < rad < 0.52 * min(w, h)):
            return cx, cy, rad, True
    return w / 2.0, h / 2.0, min(w, h) / 2.0, False


def build_icon(src: Path) -> tuple[Image.Image, dict]:
    img = Image.open(src).convert("RGB")
    arr = np.asarray(img)
    cx, cy, rad, detected = detect_circle(arr)
    h, w = arr.shape[:2]
    yy, xx = np.mgrid[0:h, 0:w]
    dist = np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2)
    # Feathered circular mask: opaque inside rad-0.75, clear past rad+0.75.
    t = np.clip((rad + 0.75 - dist) / 1.5, 0.0, 1.0)
    alpha = (t * 255.0).round().astype(np.uint8)
    rgba = np.dstack([arr, alpha])
    out = Image.fromarray(rgba, "RGBA")
    # Tight crop to the circle, then normalise to OUT_SIZE.
    x0 = max(0, int(cx - rad))
    y0 = max(0, int(cy - rad))
    x1 = min(w, int(cx + rad) + 1)
    y1 = min(h, int(cy + rad) + 1)
    out = out.crop((x0, y0, x1, y1)).resize(
        (OUT_SIZE, OUT_SIZE), Image.LANCZOS
    )
    info = {
        "detected": detected,
        "center": [round(cx, 1), round(cy, 1)],
        "radius": round(rad, 1),
        "source": src.name,
    }
    return out, info


def main() -> None:
    out_dir = REPO_ROOT / "public" / "art" / "elements"
    out_dir.mkdir(parents=True, exist_ok=True)
    report = {"icons": {}}
    for eid in ELEMENT_IDS:
        matches = sorted(
            p for p in glob.glob(str(MEDIA_DIR / f"media-generation-element-{eid}-0-*.webp"))
        )
        assert len(matches) == 1, f"{eid}: expected 1 source, got {matches}"
        icon, info = build_icon(Path(matches[0]))
        dest = out_dir / f"{eid}.png"
        icon.save(dest)
        # Validate the SAVED file: corners fully transparent, centre solid.
        saved = np.asarray(Image.open(dest))
        corners = [
            int(saved[0, 0, 3]), int(saved[0, -1, 3]),
            int(saved[-1, 0, 3]), int(saved[-1, -1, 3]),
        ]
        centre = int(saved[OUT_SIZE // 2, OUT_SIZE // 2, 3])
        info["cornerAlphaMax"] = max(corners)
        info["centerAlpha"] = centre
        info["outputFile"] = f"public/art/elements/{eid}.png"
        report["icons"][eid] = info
        print(f"[{eid}] detected={info['detected']} r={info['radius']} "
              f"cornerAlphaMax={info['cornerAlphaMax']} centre={centre}")
        assert info["cornerAlphaMax"] == 0, f"{eid}: corner not transparent"
        assert centre == 255, f"{eid}: centre not opaque"
    report_path = REPO_ROOT / "scripts" / "element_icon_report.json"
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(f"report -> {report_path}")


if __name__ == "__main__":
    main()
