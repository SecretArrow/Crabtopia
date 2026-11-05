#!/usr/bin/env python3
"""
Crabtopia preview-art pipeline — deterministic, re-runnable.

Re-crops EVERY class preview portrait from the user's reference-quality
character sheets, with the verified flood-fill chroma key from
build_sprite_atlas.py, so previews are TRANSPARENT (they blend into
cards) instead of the old solid light-blue RGB boxes:

  - Reference sheet (3x2): pincher, warden, gildclaw, reaver,
    shellmender, legendary/shadow.
  - Missing-classes sheet v2 (2x2, the CLEAN replacement — no held
    shield, no magic orb, no floating sparks; identity lives in the
    shell/body only): bulwark, tidecaller, skitter, rookie.
    The rejected first version (…c9795b24…) is intentionally NOT used.

Characters are segmented by connected components and assigned to the
nearest cell centre (Voronoi), so a claw crossing a nominal cell border
is never clipped. Each portrait is written tight + uniform padding on a
square canvas at source resolution.

Asserts: every output's four corners are transparent (alpha < 10) and
every output file differs (no two classes share art).

Usage: python3 scripts/build_preview_art.py
Requires: Pillow, numpy, scipy.
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_sprite_atlas import chroma_key, MEDIA_DIR  # noqa: E402

REPO_ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = REPO_ROOT / "public" / "art" / "crabs"

REFERENCE_SHEET = (
    "media-generation-arena-kepiting-character-sheet-0-"
    "f75e14e1-2cc5-49bb-ae71-efe2496b45e0.webp"
)
MISSING_SHEET = (
    "media-generation-character-sheet-missing-classe-0-"
    "3659b33c-88f9-4637-88a3-2bfce624cbac.webp"
)

# (col, row) -> output filename
REFERENCE_MAP = {
    (0, 0): "pincher-coral.png",
    (1, 0): "warden-frost.png",
    (2, 0): "gildclaw-cinder.png",
    (0, 1): "reaver-cinder.png",
    (1, 1): "shellmender-mangrove.png",
    (2, 1): "legendary-glow.png",
}
MISSING_MAP = {
    (0, 0): "bulwark-coral.png",
    (1, 0): "tidecaller-moon.png",
    (0, 1): "skitter-storm.png",
    (1, 1): "rookie-kelp.png",
}

PAD = 24


def extract_characters(src_name: str, cols: int, rows: int, mapping: dict):
    """Key a character sheet and cut one transparent portrait per cell."""
    src = MEDIA_DIR / src_name
    if not src.exists():
        raise FileNotFoundError(f"source sheet missing: {src}")
    img, bg = chroma_key(src)
    arr = np.asarray(img)
    alpha = arr[:, :, 3]
    mask = alpha > 32
    labels, count = ndimage.label(mask)
    sizes = ndimage.sum(mask, labels, range(1, count + 1))
    centroids = ndimage.center_of_mass(mask, labels, range(1, count + 1))
    h, w = mask.shape
    centers = {
        cell: ((cell[0] + 0.5) * w / cols, (cell[1] + 0.5) * h / rows)
        for cell in mapping
    }
    cell_labels: dict[tuple, list[int]] = {cell: [] for cell in mapping}
    for li in range(1, count + 1):
        if sizes[li - 1] < 40:
            continue
        cy, cx = centroids[li - 1]
        best = min(
            centers,
            key=lambda cell: (centers[cell][0] - cx) ** 2
            + (centers[cell][1] - cy) ** 2,
        )
        cell_labels[best].append(li)

    results = {}
    for cell, filename in mapping.items():
        lis = cell_labels[cell]
        assert lis, f"{src_name} cell {cell} ({filename}): no components"
        m = np.isin(labels, lis)
        ys, xs = np.where(m)
        y0, y1, x0, x1 = int(ys.min()), int(ys.max()) + 1, int(xs.min()), int(xs.max()) + 1
        crop = arr[y0:y1, x0:x1].copy()
        crop[~m[y0:y1, x0:x1]] = 0
        char_img = Image.fromarray(crop, "RGBA")
        side = max(char_img.width, char_img.height) + PAD * 2
        canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
        canvas.alpha_composite(
            char_img,
            ((side - char_img.width) // 2, (side - char_img.height) // 2),
        )
        results[filename] = canvas
        corners = [
            int(canvas.split()[3].getpixel(p))
            for p in [(2, 2), (side - 3, 2), (2, side - 3), (side - 3, side - 3)]
        ]
        print(
            f"[{filename}] from {src_name[:44]}… cell={cell} "
            f"content={char_img.width}x{char_img.height} canvas={side}x{side} "
            f"cornerAlphaMax={max(corners)} bg={bg}"
        )
        assert max(corners) < 10, f"{filename}: corner not transparent"
    return results


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    portraits = {}
    portraits.update(extract_characters(REFERENCE_SHEET, 3, 2, REFERENCE_MAP))
    portraits.update(extract_characters(MISSING_SHEET, 2, 2, MISSING_MAP))

    hashes = {}
    for filename, img in sorted(portraits.items()):
        dest = OUT_DIR / filename
        img.save(dest)
        hashes[filename] = hash(img.tobytes())
        print(f"wrote {dest.relative_to(REPO_ROOT)} ({img.width}x{img.height})")
    assert len(set(hashes.values())) == len(hashes), "duplicate portrait data!"

    report_path = REPO_ROOT / "scripts" / "preview_art_report.json"
    report_path.write_text(
        json.dumps(
            {
                "portraits": {
                    name: {"file": f"public/art/crabs/{name}"}
                    for name in portraits
                },
                "count": len(portraits),
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    print(f"report -> {report_path} ({len(portraits)} portraits)")


if __name__ == "__main__":
    main()
