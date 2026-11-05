#!/usr/bin/env python3
"""
Crabtopia sprite asset pipeline (Phase A) — deterministic, re-runnable.

- Chroma-keys 4 character sprite sheets (light-blue solid background WebP)
  into transparent PNGs under public/art/sprites/<char>.png
- Validates every frame (4x4 equal grid): alpha coverage + content bbox,
  flags suspicious frames, writes scripts/sprite_validation_report.json
- Generates 8 procedural FX flipbooks (PIL drawing, transparent,
  horizontal strip 1x8 frames @ 256px = 2048x256) under
  public/art/sprites/fx/<name>.png
- Writes atlas metadata to src/game/data/spriteAtlas.json

Usage: python3 scripts/build_sprite_atlas.py
Optional env: CRABTOPIA_MEDIA_DIR (default ~/workspace/imagine_media)
Requires: Pillow, numpy. No network, no randomness without fixed seeds.
"""
import json
import math
import os
import random
import zlib
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

REPO_ROOT = Path(__file__).resolve().parent.parent
MEDIA_DIR = Path(os.environ.get(
    "CRABTOPIA_MEDIA_DIR", Path.home() / "workspace" / "imagine_media"))

SHEETS = {
    "gildclaw": "media-generation-spritesheet-gildclaw-gold-0-34605d45-e14d-4df3-b717-4e0b7af828fe.webp",
    # v2 sheets (reference-quality redraws, generated from the user's
    # character sheet). Pincher v2 frame 8 and warden v2 frame 8 contain a
    # WRONG character (rogue generation) — the frame maps below never
    # reference frame 8 for those two sheets.
    "warden":   "media-generation-spritesheet-warden-v2-detailed-0-b5cd5e8d-93fd-4286-9cd6-c7097072fc50.webp",
    "reaver":   "media-generation-spritesheet-reaver-v2-detailed-0-da60eb4f-3ed3-47f9-a146-a5e1b7b1dab6.webp",
    "pincher":  "media-generation-spritesheet-pincher-v2-detaile-0-4ae7d489-8984-4d5a-9e89-3533abf1c677.webp",
    # Per-class sheets (limitation-fix round): bulwark / skitter /
    # tidecaller / shellmender stop sharing the gildclaw / pincher
    # silhouettes in battle and get dedicated sheets of their own.
    "bulwark":     "media-generation-spritesheet-bulwark-v1-0-c60d8caf-eef2-4409-9225-2e895788a461.webp",
    "skitter":     "media-generation-spritesheet-skitter-v1-0-9ddd5e48-eacd-4a55-bea3-81e1ca9042da.webp",
    "tidecaller":  "media-generation-spritesheet-tidecaller-v1-0-51958e97-13c1-4a74-bd12-240d3fa9a727.webp",
    "shellmender": "media-generation-spritesheet-shellmender-v1-0-ec3c364d-b23e-44ac-ba2b-132c47fc39c0.webp",
}

COLS, ROWS = 4, 4

# Supplement strips composited onto a sheet as one extra row
# (limitation-fix round): the warden v2 sheet had no dedicated
# defense/death frames, so a parent-generated 2x2 strip supplies them.
# Cell map (row-major): 0 = defense primary (claws crossed, side view),
# 1 = defense alt (front guard), 2 = DEATH (collapsed, eyes closed),
# 3 = strong hurt flinch. They become atlas frames 12-15 (4th row).
SUPPLEMENTS = {
    "warden": {
        "file": "media-generation-spritesheet-warden-supplement-0-0f487892-1cc2-4af1-93c0-c18204cace9d.webp",
        "cols": 2,
        "rows": 2,
    },
}

# Frame maps — FINAL, visually verified against the actual sheet contents.
# Frame index = row-major 0..15. Format: name -> (frames, fps, loop, events?)
ANIMATIONS = {
    "gildclaw": {
        "idle":    ([0, 1, 2, 3], 5, "loop", None),
        "walk":    ([4, 5, 6, 7], 8, "loop", None),
        "run":     ([4, 5, 6, 7], 13, "loop", None),
        "attack":  ([8, 9, 10, 11], 12, "once", {"2": "hitMoment"}),
        "combo":   ([9, 10, 9, 10], 14, "once", {"1": "hitMoment", "3": "hitMoment"}),
        "skill":   ([8, 9, 10], 10, "once", {"2": "hitMoment"}),
        "defense": ([8], 1, "loop", None),
        "hit":     ([12, 13], 8, "once", None),
        "jump":    ([9], 1, "once", None),
        "fall":    ([12], 1, "once", None),
        "victory": ([14, 15], 6, "loop", None),
        "death":   ([13], 1, "once", None),
    },
    # Warden v2 (visually inspected): row 1 idle stances, row 2 braced
    # steps, frame 8 = WRONG content (red crab + shield scene — unused),
    # frame 9 claw strike w/ impact star, frame 10 dizzy/hurt,
    # frame 11 front-facing victory stance. Row 4 (frames 12-15) comes
    # from the supplement strip: 12 = defense side view (claws crossed;
    # a grey sparkle remnant survived keying at the crystal tip, so per
    # the QA rule it is NOT the primary), 13 = dedicated defense
    # primary (front guard, perfectly clean), 14 = dedicated DEATH
    # (collapsed, eyes closed), 15 = strong hurt flinch — the flinch
    # reads far better than the old dizzy frame, so `hit` uses it and
    # frame 10 remains only as the knock-down `fall`.
    "warden": {
        "idle":    ([0, 1, 2, 3], 5, "loop", None),
        "walk":    ([4, 5, 6, 7], 8, "loop", None),
        "run":     ([4, 5, 6, 7], 13, "loop", None),
        "attack":  ([9], 10, "once", {"0": "hitMoment"}),
        "combo":   ([7, 9, 7, 9], 13, "once", {"1": "hitMoment", "3": "hitMoment"}),
        "skill":   ([9], 9, "once", {"0": "hitMoment"}),
        "defense": ([13], 1, "loop", None),
        "hit":     ([15], 8, "once", None),
        "jump":    ([9], 1, "once", None),
        "fall":    ([10], 1, "once", None),
        "victory": ([11], 4, "loop", None),
        "death":   ([14], 1, "once", None),
    },
    # Reaver v2 (visually inspected): rows 1-2 idle/walk, frames 8-10 are
    # fire-blast attack bursts of the SAME crab (usable), frame 11 dented
    # hurt stance, frames 12-13 knocked-over hurt, 14-15 defeated.
    "reaver": {
        "idle":    ([0, 1, 2, 3], 5, "loop", None),
        "walk":    ([4, 5, 6, 7], 8, "loop", None),
        "run":     ([4, 5, 6, 7], 13, "loop", None),
        "attack":  ([9, 10], 11, "once", {"1": "hitMoment"}),
        "combo":   ([8, 9, 10], 13, "once", {"1": "hitMoment", "2": "hitMoment"}),
        "skill":   ([10], 9, "once", {"0": "hitMoment"}),
        "defense": ([11], 1, "loop", None),
        "hit":     ([12, 13], 8, "once", None),
        "jump":    ([9], 1, "once", None),
        "fall":    ([12], 1, "once", None),
        "victory": ([3, 1], 5, "loop", None),
        "death":   ([14, 15], 6, "once", None),
    },
    # Pincher v2 (visually inspected): row 1 idle, row 2 scuttle stances,
    # frame 8 = WRONG character (brown crab — unused), frames 9-10 attack
    # lunges, frame 11 stance, frames 12-13 dizzy/hurt, frame 14 defeated
    # (X eyes), frame 15 victory (raised claw, sparkles).
    "pincher": {
        "idle":    ([0, 1, 2, 3], 5, "loop", None),
        "walk":    ([4, 5, 6, 7], 8, "loop", None),
        "run":     ([4, 5, 6, 7], 13, "loop", None),
        "attack":  ([9, 10, 11], 12, "once", {"2": "hitMoment"}),
        "combo":   ([9, 10, 9, 10], 14, "once", {"1": "hitMoment", "3": "hitMoment"}),
        "skill":   ([9, 10], 10, "once", {"1": "hitMoment"}),
        "defense": ([9], 1, "loop", None),
        "hit":     ([12, 13], 8, "once", None),
        "jump":    ([10], 1, "once", None),
        "fall":    ([12], 1, "once", None),
        "victory": ([15], 4, "loop", None),
        "death":   ([14], 1, "once", None),
    },
    # Bulwark v1 (parent-verified map): row 1 idle, row 2 walk, frames
    # 8-10 attack swings, frame 11 braced defense, frame 12 hurt,
    # frame 13 defeated, frames 14-15 victory.
    "bulwark": {
        "idle":    ([0, 1, 2, 3], 5, "loop", None),
        "walk":    ([4, 5, 6, 7], 8, "loop", None),
        "run":     ([4, 5, 6, 7], 13, "loop", None),
        "attack":  ([8, 9, 10], 12, "once", {"2": "hitMoment"}),
        "combo":   ([9, 10, 9, 10], 14, "once", {"1": "hitMoment", "3": "hitMoment"}),
        "skill":   ([8, 9, 10], 10, "once", {"2": "hitMoment"}),
        "defense": ([11], 1, "loop", None),
        "hit":     ([12], 8, "once", None),
        "jump":    ([9], 1, "once", None),
        "fall":    ([12], 1, "once", None),
        "victory": ([14, 15], 6, "loop", None),
        "death":   ([13], 1, "once", None),
    },
    # Skitter v1 (parent-verified map): row 1 idle, row 2 walk WITH
    # motion-blur streaks baked in, frame 8 stretched jab (skill only),
    # frame 9 odd curled top-view (NEVER used), frame 10 strike
    # (attack), frame 11 defense, frame 12 hurt, frame 13 defeated,
    # frames 14-15 victory.
    # WALK DECISION (pixel-inspected on the keyed output): all four
    # walk frames carry a heavy baked-in blur mass on the trailing
    # side. Frames 6 and 7 are the tightest (compact smear, sharp
    # body); frame 5 is the cleaner of 4/5 (frame 4 has the longest
    # streak lines). Walk/run therefore use [6, 7, 5] and skip frame 4.
    "skitter": {
        "idle":    ([0, 1, 2, 3], 5, "loop", None),
        "walk":    ([6, 7, 5], 8, "loop", None),
        "run":     ([6, 7, 5], 13, "loop", None),
        "attack":  ([10], 12, "once", {"0": "hitMoment"}),
        "combo":   ([7, 10, 7, 10], 14, "once", {"1": "hitMoment", "3": "hitMoment"}),
        "skill":   ([8], 10, "once", {"0": "hitMoment"}),
        "defense": ([11], 1, "loop", None),
        "hit":     ([12], 8, "once", None),
        "jump":    ([10], 1, "once", None),
        "fall":    ([12], 1, "once", None),
        "victory": ([14, 15], 6, "loop", None),
        "death":   ([13], 1, "once", None),
    },
    # Tidecaller v1 (parent-verified map): row 1 idle, row 2 walk,
    # frames 8-10 casting attacks, frame 11 crossed-claw defense,
    # frame 12 hurt, frame 13 defeated, frames 14-15 victory.
    "tidecaller": {
        "idle":    ([0, 1, 2, 3], 5, "loop", None),
        "walk":    ([4, 5, 6, 7], 8, "loop", None),
        "run":     ([4, 5, 6, 7], 13, "loop", None),
        "attack":  ([8, 9, 10], 12, "once", {"2": "hitMoment"}),
        "combo":   ([9, 10, 9, 10], 14, "once", {"1": "hitMoment", "3": "hitMoment"}),
        "skill":   ([8, 9, 10], 10, "once", {"2": "hitMoment"}),
        "defense": ([11], 1, "loop", None),
        "hit":     ([12], 8, "once", None),
        "jump":    ([9], 1, "once", None),
        "fall":    ([12], 1, "once", None),
        "victory": ([14, 15], 6, "loop", None),
        "death":   ([13], 1, "once", None),
    },
    # Shellmender v1 (parent-verified map): row 1 idle, row 2 walk,
    # frames 8-10 attack, frame 8 doubles as the eyes-closed brace
    # (defense), frame 11 joyful hug = heal/skill pose (no hitMoment —
    # a heal must not fire the claw spark), frame 12 hurt, frame 13
    # defeated, frames 14-15 victory.
    "shellmender": {
        "idle":    ([0, 1, 2, 3], 5, "loop", None),
        "walk":    ([4, 5, 6, 7], 8, "loop", None),
        "run":     ([4, 5, 6, 7], 13, "loop", None),
        "attack":  ([8, 9, 10], 12, "once", {"2": "hitMoment"}),
        "combo":   ([9, 10, 9, 10], 14, "once", {"1": "hitMoment", "3": "hitMoment"}),
        "skill":   ([11], 9, "once", None),
        "defense": ([8], 1, "loop", None),
        "hit":     ([12], 8, "once", None),
        "jump":    ([9], 1, "once", None),
        "fall":    ([12], 1, "once", None),
        "victory": ([14, 15], 6, "loop", None),
        "death":   ([13], 1, "once", None),
    },
}

FX_FPS = {
    "slash": 18, "spark": 16, "lightning": 14, "splash": 14,
    "heal": 10, "explosion": 12, "shield": 12, "levelup": 10,
    "poison": 12, "ice": 14, "dark": 10,
}
FX_SIZE = 256
FX_FRAMES = 8

# Chroma-key thresholds (Euclidean RGB distance to sampled background).
DIST_LOW = 30.0    # below -> fully transparent
DIST_HIGH = 95.0   # above -> fully opaque


# ---------------------------------------------------------------- chroma key
def sample_background(rgb: Image.Image) -> tuple:
    """Median colour of 16x16 patches in the four corners."""
    w, h = rgb.size
    patches = []
    for box in [(0, 0, 16, 16), (w - 16, 0, w, 16),
                (0, h - 16, 16, h), (w - 16, h - 16, w, h)]:
        patches.append(np.asarray(rgb.crop(box), dtype=np.float64).reshape(-1, 3))
    allpx = np.concatenate(patches, axis=0)
    med = np.median(allpx, axis=0)
    return tuple(int(round(c)) for c in med)


def chroma_key(src_path: Path) -> tuple:
    """Return (RGBA image, bg colour). Flood-fill chroma key + defringe.

    The background mask is the low-distance region CONNECTED to the image
    border (flood fill), so background-coloured details INSIDE a character
    (crystal highlights, pale bellies) are never punched transparent —
    only the true exterior background is removed. Alpha inside the flood
    region follows the distance smoothstep; everything outside it is
    fully opaque.
    """
    from scipy import ndimage

    rgb = Image.open(src_path).convert("RGB")
    bg = sample_background(rgb)
    arr = np.asarray(rgb).astype(np.float64)
    bgv = np.array(bg, dtype=np.float64)
    dist = np.sqrt(((arr - bgv) ** 2).sum(axis=2))
    candidate = dist < DIST_HIGH
    labels, _ = ndimage.label(candidate)
    border_labels = set(
        np.unique(
            np.concatenate(
                [labels[0, :], labels[-1, :], labels[:, 0], labels[:, -1]]
            )
        ).tolist()
    )
    border_labels.discard(0)
    bg_region = np.isin(labels, list(border_labels))
    t = np.clip((dist - DIST_LOW) / (DIST_HIGH - DIST_LOW), 0.0, 1.0)
    smooth = t * t * (3.0 - 2.0 * t)  # smoothstep
    alpha_f = np.where(bg_region, smooth, 1.0)
    alpha = Image.fromarray((alpha_f * 255.0).round().astype(np.uint8), "L")
    # Defringe step 1: erode alpha by 1px to eat the background halo.
    alpha = alpha.filter(ImageFilter.MinFilter(3))
    a = np.asarray(alpha).astype(np.float64)
    # Defringe step 2: for semi-transparent pixels, un-blend the background
    # colour (pushes edge colours away from the background colour).
    out = arr.copy()
    semi = (a > 0) & (a < 255)
    if semi.any():
        af = (a[semi] / 255.0)[:, None]
        unblended = (arr[semi] - (1.0 - af) * bgv[None, :]) / np.maximum(af, 1e-6)
        out[semi] = np.clip(unblended, 0, 255)
    rgba = np.dstack([out, a]).round().astype(np.uint8)
    return Image.fromarray(rgba, "RGBA"), bg


# ----------------------------------------------------------------- repack
# Sheets whose frames carry NO legitimate detached details, so small
# parts floating away from the body are always foreign fragments.
FRAGMENT_DROP_SHEETS = {"skitter"}


def repack_sheet(img: Image.Image, cols: int, nominal_rows: int,
                 drop_distant: bool = False):
    """Rebuild a uniform grid from a keyed sheet whose generated frames
    bleed across nominal cell borders (v2 sheets: legs/flames cross the
    quarter lines, and warden v2 only has 3 content rows, not 4).

    Connected components of opaque pixels are assigned to the nearest
    nominal cell centre; each frame is re-composed from ONLY its own
    pixels into a uniform cell (horizontally centred, bottom-aligned),
    so no frame can contain a sliver of its neighbour.
    Returns (sheet_image, frame_w, frame_h, rows, missing_frames).
    """
    from scipy import ndimage

    arr = np.asarray(img)
    alpha = arr[:, :, 3]
    mask = alpha > 32
    labels, count = ndimage.label(mask)
    sizes = ndimage.sum(mask, labels, range(1, count + 1))
    centroids = ndimage.center_of_mass(mask, labels, range(1, count + 1))
    h, w = mask.shape
    centers = [
        ((c + 0.5) * w / cols, (r + 0.5) * h / nominal_rows)
        for r in range(nominal_rows)
        for c in range(cols)
    ]
    frame_labels: dict[int, list[int]] = {
        i: [] for i in range(cols * nominal_rows)
    }
    big = 0
    # Merged-component splitting: in the per-class sheets (bulwark attack
    # row, skitter jab row) neighbouring crabs physically TOUCH, so one
    # connected component spans 2-3 nominal cells and centroid assignment
    # would steal a whole frame (and balloon the cell size). Components
    # whose bbox exceeds 1.3x the nominal cell are split at the nominal
    # grid lines instead; per cell only the largest split part is kept
    # (a foreign claw tip entering the cell is dropped). Ordinary
    # components — including the v2 sheets' small border bleeds — keep
    # the centroid assignment above, byte-identical to before.
    cell_w, cell_h = w / cols, h / nominal_rows
    slices = ndimage.find_objects(labels)
    split_parts: dict[int, tuple[int, tuple[int, int, int, int]]] = {}
    for li in range(1, count + 1):
        if sizes[li - 1] < 40:
            continue  # keying noise / stray specks
        if sizes[li - 1] > 20000:
            big += 1
        sl = slices[li - 1]
        bw = sl[1].stop - sl[1].start
        bh = sl[0].stop - sl[0].start
        if bw > 1.3 * cell_w or bh > 1.3 * cell_h:
            comp = labels == li
            c0 = max(0, int(sl[1].start // cell_w))
            c1 = min(cols - 1, int((sl[1].stop - 1) // cell_w))
            r0 = max(0, int(sl[0].start // cell_h))
            r1 = min(nominal_rows - 1, int((sl[0].stop - 1) // cell_h))
            for r in range(r0, r1 + 1):
                for c in range(c0, c1 + 1):
                    x0, x1 = int(c * cell_w), int((c + 1) * cell_w)
                    y0, y1 = int(r * cell_h), int((r + 1) * cell_h)
                    part = int(comp[y0:y1, x0:x1].sum())
                    if part < 40:
                        continue
                    fi = r * cols + c
                    prev = split_parts.get(fi)
                    if prev is None or part > prev[0]:
                        split_parts[fi] = (part, (x0, y0, x1, y1), li)
            continue
        cy, cx = centroids[li - 1]
        best = min(
            range(len(centers)),
            key=lambda i: (centers[i][0] - cx) ** 2 + (centers[i][1] - cy) ** 2,
        )
        frame_labels[best].append(li)
    if split_parts:
        print(f"    repack: split merged components into frames "
              f"{sorted(split_parts)}")

    crops: dict[int, Image.Image] = {}
    maxw = maxh = 0
    for fi, lis in frame_labels.items():
        if not lis and fi not in split_parts:
            continue
        m = np.isin(labels, lis)
        if fi in split_parts:
            _, (x0, y0, x1, y1), li = split_parts[fi]
            cell_mask = np.zeros_like(m)
            cell_mask[y0:y1, x0:x1] = labels[y0:y1, x0:x1] == li
            m = m | cell_mask
        # Drop foreign fragments: small parts separated from the frame's
        # main body — e.g. a neighbour crab's claw tips that crossed the
        # nominal border and keyed as their own tiny components (skitter
        # frame 11 carried frame 10's claw tips, 15-22px away from the
        # defense crab). Two strengths:
        #   - every sheet: drop parts whose bbox is diagonally disjoint
        #     from the body's bbox (removes e.g. pincher f12's trapped
        #     86px fragment; sparkles/steam share an axis range and stay).
        #   - sheets in FRAGMENT_DROP_SHEETS (skitter): also drop small
        #     parts floating >8px from the body — that sheet's frames
        #     have no legitimate detached details to lose.
        lab2, n2 = ndimage.label(m)
        if n2 > 1:
            sizes2 = ndimage.sum(m, lab2, range(1, n2 + 1))
            main2 = int(np.argmax(sizes2)) + 1
            mys, mxs = np.where(lab2 == main2)
            mb = (int(mxs.min()), int(mys.min()), int(mxs.max()), int(mys.max()))
            dist2 = (
                ndimage.distance_transform_edt(lab2 != main2)
                if drop_distant else None
            )
            keep2 = [main2]
            for li2 in range(1, n2 + 1):
                if li2 == main2:
                    continue
                if sizes2[li2 - 1] >= 0.10 * sizes2[main2 - 1]:
                    keep2.append(li2)
                    continue
                part2 = lab2 == li2
                ys2, xs2 = np.where(part2)
                disjoint = (
                    int(xs2.max()) < mb[0] - 4 or int(xs2.min()) > mb[2] + 4
                    or int(ys2.max()) < mb[1] - 4 or int(ys2.min()) > mb[3] + 4
                )
                distant = dist2 is not None and float(dist2[part2].min()) > 8.0
                if not disjoint and not distant:
                    keep2.append(li2)
            m = np.isin(lab2, keep2)
        ys, xs = np.where(m)
        y0, y1, x0, x1 = int(ys.min()), int(ys.max()) + 1, int(xs.min()), int(xs.max()) + 1
        crop = arr[y0:y1, x0:x1].copy()
        crop[~m[y0:y1, x0:x1]] = 0
        crops[fi] = Image.fromarray(crop, "RGBA")
        maxw = max(maxw, crop.shape[1])
        maxh = max(maxh, crop.shape[0])

    pad = 8
    fw, fh = maxw + pad * 2, maxh + pad * 2
    rows = (max(crops) // cols) + 1 if crops else nominal_rows
    sheet = Image.new("RGBA", (fw * cols, fh * rows), (0, 0, 0, 0))
    for fi, crop in crops.items():
        r, c = divmod(fi, cols)
        x = c * fw + (fw - crop.width) // 2
        y = r * fh + fh - pad - crop.height
        sheet.alpha_composite(crop, (x, y))
    missing = [fi for fi in range(cols * rows) if fi not in crops]
    print(f"    repack: {big} big components, cell {fw}x{fh}, rows={rows}, "
          f"missing={missing}")
    return sheet, fw, fh, rows, missing


# --------------------------------------------------------------- validation
def validate_sheet(img: Image.Image, fw: int, fh: int,
                   cols: int = COLS, rows: int = ROWS) -> dict:
    alpha = np.asarray(img.split()[3])
    frames = []
    for idx in range(cols * rows):
        r, c = divmod(idx, cols)
        cell = alpha[r * fh:(r + 1) * fh, c * fw:(c + 1) * fw]
        mask = cell > 32
        coverage = round(float(mask.mean() * 100.0), 2)
        # Corner transparency assertion data: the 4 corners of every frame
        # MUST be (near-)transparent — a solid background colour surviving
        # in a corner means the chroma key failed for this sheet.
        corners = [
            int(cell[2, 2]), int(cell[2, -3]),
            int(cell[-3, 2]), int(cell[-3, -3]),
        ]
        corner_max = max(corners)
        bbox = None
        flags = []
        if corner_max >= 10:
            flags.append("corner_not_transparent")
        if mask.any():
            ys, xs = np.where(mask)
            bbox = [int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1]
            # Extreme edge contact: content flush with the cell border.
            if bbox[0] <= 1 or bbox[1] <= 1 or bbox[2] >= fw - 1 or bbox[3] >= fh - 1:
                flags.append("bbox_touches_edge")
        if coverage < 3.0:
            flags.append("coverage_too_low")
        if coverage > 92.0:
            flags.append("coverage_too_high")
        frames.append({"index": idx, "alphaCoveragePct": coverage,
                       "cornerAlphaMax": corner_max,
                       "bbox": bbox, "flags": flags, "suspicious": bool(flags)})
    covs = [f["alphaCoveragePct"] for f in frames]
    return {
        "frameWidth": fw, "frameHeight": fh,
        "minCoveragePct": min(covs), "maxCoveragePct": max(covs),
        "flaggedFrames": [f["index"] for f in frames if f["suspicious"]],
        "frames": frames,
    }


# --------------------------------------------------------------------- FX
def _lerp(a, b, t):
    return a + (b - a) * t


def _fade(t, peak=0.45):
    """0 at t=0, 1 near peak, back down at t=1 (smooth-ish triangular)."""
    if t < peak:
        return t / peak
    return max(0.0, 1.0 - (t - peak) / (1.0 - peak))


def _star(d, cx, cy, r, color):
    pts = []
    for i in range(10):
        ang = -math.pi / 2 + i * math.pi / 5
        rad = r if i % 2 == 0 else r * 0.45
        pts.append((cx + rad * math.cos(ang), cy + rad * math.sin(ang)))
    d.polygon(pts, fill=color)


def fx_slash(t, d, rng):
    cx, cy, S = 128, 128, 256
    base = -140 + t * 150  # sweeping rotation (degrees)
    alpha = int(235 * (0.30 + 0.70 * _fade(t, 0.35)))  # floor: no empty frames
    radius = 55 + t * 55
    for k, (wdt, mul) in enumerate([(16, 0.35), (9, 0.65), (4, 1.0)]):
        a = max(0, int(alpha * mul))
        d.arc([cx - radius, cy - radius, cx + radius, cy + radius],
              start=base - 55 + k * 7, end=base + 25 + k * 7,
              fill=(235, 245, 255, a), width=wdt)
    # trailing sparks
    for i in range(5):
        ang = math.radians(base - 40 + i * 14)
        rr = radius + 6 + i * 4
        x, y = cx + rr * math.cos(ang), cy + rr * math.sin(ang)
        d.ellipse([x - 3, y - 3, x + 3, y + 3], fill=(255, 255, 255, alpha // 2))


def fx_spark(t, d, rng):
    cx, cy = 128, 128
    alpha = int(255 * (1.0 - t * 0.75))
    for i in range(12):
        ang = i * math.pi / 6 + 0.13
        length = 18 + t * (78 + (i % 3) * 14)
        x2, y2 = cx + length * math.cos(ang), cy + length * math.sin(ang)
        col = (255, 214, 90, alpha) if i % 2 else (255, 240, 190, alpha)
        d.line([cx, cy, x2, y2], fill=col, width=4 if i % 2 else 3)
        d.ellipse([x2 - 4, y2 - 4, x2 + 4, y2 + 4], fill=(255, 230, 150, alpha))
    for i in range(10):  # scattered dots
        ang = rng.uniform(0, math.tau)
        dist = 12 + t * rng.uniform(55, 105)
        x, y = cx + dist * math.cos(ang), cy + dist * math.sin(ang)
        d.ellipse([x - 3, y - 3, x + 3, y + 3], fill=(255, 205, 80, alpha))
    d.ellipse([cx - 9, cy - 9, cx + 9, cy + 9], fill=(255, 255, 230, alpha))


def fx_lightning(t, d, rng):
    alpha = int(255 * (1.0 - t * 0.55))
    pts = []
    x, y = 128.0, 14.0
    pts.append((x, y))
    while y < 238:
        y += rng.uniform(22, 34)
        x += rng.uniform(-30, 30)
        x = max(30.0, min(226.0, x))
        pts.append((x, min(y, 242.0)))
    # glow pass then core pass, plus one branch
    for width, col in [(13, (110, 170, 255, alpha // 4)),
                       (6, (150, 200, 255, alpha // 2)),
                       (3, (245, 250, 255, alpha))]:
        d.line(pts, fill=col, width=width, joint="curve")
    bx, by = pts[2]
    branch = [(bx, by)]
    for _ in range(3):
        bx += rng.uniform(14, 30); by += rng.uniform(14, 26)
        branch.append((bx, by))
    d.line(branch, fill=(170, 210, 255, alpha // 2), width=3)


def fx_splash(t, d, rng):
    cx, base_y = 128, 196
    alpha = int(240 * (1.0 - t * 0.45))
    for i in range(14):  # droplets: up then down (parabola)
        ang = -math.pi / 2 + (i - 6.5) * 0.16
        speed = 58 + (i % 5) * 13
        vx, vy = speed * math.cos(ang), speed * math.sin(ang)
        tt = t * 1.35
        x = cx + vx * tt
        y = base_y + vy * tt + 78 * tt * tt
        r = 4.5 - (i % 3)
        d.ellipse([x - r, y - r, x + r, y + r], fill=(90, 180, 255, alpha))
    for k in range(2):  # expanding ripple ellipses
        rt = (t + k * 0.22) % 1.0
        rw, rh = 18 + rt * 82, 6 + rt * 26
        a = int(alpha * (1.0 - rt))
        d.ellipse([cx - rw, base_y + 12 - rh, cx + rw, base_y + 12 + rh],
                  outline=(140, 210, 255, a), width=4)


def fx_heal(t, d, rng):
    cx = 128
    for i in range(7):  # rising plus-sparkles
        x = 52 + i * 25 + rng.uniform(-7, 7)
        y = 218 - t * 130 - (i % 3) * 22
        s = 7 + (i % 3) * 2.5
        a = int(230 * _fade((t + i * 0.07) % 1.0, 0.4))
        col = (120, 255, 160, a)
        d.rectangle([x - s, y - s * 0.32, x + s, y + s * 0.32], fill=col)
        d.rectangle([x - s * 0.32, y - s, x + s * 0.32, y + s], fill=col)
    for i in range(5):  # soft green rising circles
        x = cx + math.sin(t * 5 + i * 1.7) * 46
        y = 226 - ((t * 120 + i * 34) % 150)
        r = 9 + (i % 3) * 4
        d.ellipse([x - r, y - r, x + r, y + r], fill=(90, 240, 140, 70))


def fx_explosion(t, d, rng):
    cx, cy = 128, 128
    radius = 16 + t * 78
    # colour: bright yellow -> orange -> grey smoke
    if t < 0.5:
        col = (int(_lerp(255, 255, t * 2)), int(_lerp(215, 120, t * 2)),
               int(_lerp(90, 30, t * 2)))
    else:
        u = (t - 0.5) * 2
        col = (int(_lerp(255, 130, u)), int(_lerp(120, 125, u)), int(_lerp(30, 130, u)))
    a = int(235 * (1.0 - t * 0.35))
    d.ellipse([cx - radius, cy - radius, cx + radius, cy + radius],
              fill=col + (a,))
    inner = radius * 0.55
    d.ellipse([cx - inner, cy - inner, cx + inner, cy + inner],
              fill=(255, 235, 170, a))
    for i in range(12):  # flying embers / smoke puffs
        ang = i * math.tau / 12 + 0.21
        dist = radius + 6 + t * 42
        x, y = cx + dist * math.cos(ang), cy + dist * math.sin(ang)
        r = 5 + (i % 4) * 2 + t * 7
        c = (255, 160, 60, a) if i % 3 else (120, 120, 120, a // 2)
        d.ellipse([x - r, y - r, x + r, y + r], fill=c)


def fx_shield(t, d, rng):
    cx, cy = 128, 128
    radius = 26 + t * 78
    a = int(235 * (1.0 - t * 0.65))
    for k, (wdt, mul, off) in enumerate([(10, 0.35, 0), (5, 0.8, 22), (3, 1.0, -18)]):
        d.arc([cx - radius, cy - radius, cx + radius, cy + radius],
              start=-90 + off + t * 40, end=200 + off + t * 40,
              fill=(90, 180, 255, max(0, int(a * mul))), width=wdt)
    d.ellipse([cx - radius, cy - radius, cx + radius, cy + radius],
              outline=(170, 220, 255, a // 3), width=2)
    for i in range(4):
        ang = math.radians(-70 + i * 62 + t * 40)
        x, y = cx + radius * math.cos(ang), cy + radius * math.sin(ang)
        d.ellipse([x - 4, y - 4, x + 4, y + 4], fill=(200, 235, 255, a))


def fx_levelup(t, d, rng):
    cx = 128
    for i in range(8):  # upward gold rays
        x = 34 + i * 27
        length = 60 + t * 110
        a = int(190 * _fade(t, 0.5))
        d.line([x, 244, x + (x - cx) * 0.12, 244 - length],
               fill=(255, 205, 70, a), width=5)
    for i in range(6):  # rising stars
        x = cx + math.sin(i * 2.1) * 62 + rng.uniform(-6, 6)
        y = 232 - ((t * 150 + i * 30) % 175)
        r = 9 + (i % 3) * 3.5
        a = int(245 * _fade((t + i * 0.11) % 1.0, 0.35))
        _star(d, x, y, r, (255, 215, 80, a))
    _star(d, cx, 96 - t * 22, 17,
          (255, 225, 110, int(250 * (0.35 + 0.65 * _fade(t, 0.4)))))


def fx_poison(t, d, rng):
    """Toxic green bubbles rising + dripping splats (poison/debuff)."""
    cx, cy = 128, 128
    for i in range(9):  # rising toxic bubbles
        x = 48 + i * 20 + rng.uniform(-8, 8)
        y = 226 - ((t * 150 + i * 26) % 165)
        r = 5 + (i % 4) * 2.2
        a = int(220 * _fade((t + i * 0.09) % 1.0, 0.4))
        d.ellipse([x - r, y - r, x + r, y + r], fill=(110, 230, 90, a))
        d.ellipse([x - r * 0.4, y - r * 0.5, x + r * 0.1, y - r * 0.1],
                  fill=(210, 255, 190, a // 2))
    for i in range(5):  # dripping splats at the base
        x = 58 + i * 36 + rng.uniform(-6, 6)
        drop = (t * 90 + i * 30) % 110
        y = 96 + drop
        a = int(200 * (1.0 - drop / 130))
        d.ellipse([x - 4, y - 7, x + 4, y + 7], fill=(80, 200, 70, a))
    # central toxic cloud pulse
    r = 30 + t * 46
    d.ellipse([cx - r, cy - r * 0.7, cx + r, cy + r * 0.7],
              fill=(70, 190, 80, int(60 * (1.0 - t * 0.5))))


def fx_ice(t, d, rng):
    """Crystalline frost burst: expanding shard ring + frost ring (freeze)."""
    cx, cy = 128, 128
    a = int(235 * (0.35 + 0.65 * _fade(t, 0.35)))
    ring = 18 + t * 74
    d.ellipse([cx - ring, cy - ring, cx + ring, cy + ring],
              outline=(170, 230, 255, a // 2), width=3)
    for i in range(8):  # ice shards flying outward
        ang = i * math.tau / 8 + 0.39
        dist = 14 + t * 78
        x, y = cx + dist * math.cos(ang), cy + dist * math.sin(ang)
        L = 15 + (i % 3) * 6
        ux, uy = math.cos(ang), math.sin(ang)
        px, py = -uy, ux
        pts = [(x + ux * L, y + uy * L), (x - ux * L * 0.5 + px * 5, y - uy * L * 0.5 + py * 5),
               (x - ux * L, y - uy * L), (x - ux * L * 0.5 - px * 5, y - uy * L * 0.5 - py * 5)]
        d.polygon(pts, fill=(190, 240, 255, a))
    for i in range(6):  # central crystal spikes growing then still
        ang = -math.pi / 2 + (i - 2.5) * 0.42
        L = (26 + (i % 3) * 13) * min(1.0, t * 2.2)
        x, y = cx + L * math.cos(ang), cy + L * math.sin(ang)
        d.line([cx, cy, x, y], fill=(225, 250, 255, a), width=5)
        d.ellipse([x - 3, y - 3, x + 3, y + 3], fill=(255, 255, 255, a))


def fx_dark(t, d, rng):
    """Shadow curse wisps: dark violet tendrils + sinking motes (debuff)."""
    cx, cy = 128, 122
    for i in range(5):  # swirling tendrils
        phase = i * 1.256 + t * 4.2
        r = 24 + i * 13 + t * 22
        x = cx + r * math.cos(phase)
        y = cy + r * 0.62 * math.sin(phase)
        s = 13 - i * 1.6
        a = int(190 * _fade((t + i * 0.13) % 1.0, 0.45))
        d.ellipse([x - s, y - s * 0.7, x + s, y + s * 0.7], fill=(88, 52, 160, a))
        d.ellipse([x - s * 0.5, y - s * 0.35, x + s * 0.5, y + s * 0.35],
                  fill=(140, 100, 220, a // 2))
    for i in range(7):  # sinking dark motes
        x = 52 + i * 25 + rng.uniform(-7, 7)
        y = 40 + ((t * 120 + i * 31) % 160)
        a = int(200 * (1.0 - ((t * 120 + i * 31) % 160) / 190))
        d.ellipse([x - 3.5, y - 3.5, x + 3.5, y + 3.5], fill=(60, 30, 120, a))
    # hollow curse ring closing in
    r = 96 - t * 48
    d.ellipse([cx - r, cy - r, cx + r, cy + r],
              outline=(120, 80, 220, int(170 * (0.4 + 0.6 * t))), width=3)


FX_DRAWERS = {
    "slash": fx_slash, "spark": fx_spark, "lightning": fx_lightning,
    "splash": fx_splash, "heal": fx_heal, "explosion": fx_explosion,
    "shield": fx_shield, "levelup": fx_levelup,
    "poison": fx_poison, "ice": fx_ice, "dark": fx_dark,
}


def build_fx(name: str) -> Image.Image:
    strip = Image.new("RGBA", (FX_SIZE * FX_FRAMES, FX_SIZE), (0, 0, 0, 0))
    for i in range(FX_FRAMES):
        t = i / (FX_FRAMES - 1)
        frame = Image.new("RGBA", (FX_SIZE, FX_SIZE), (0, 0, 0, 0))
        d = ImageDraw.Draw(frame)
        # crc32 seed: stable across processes (unlike hash(), which is salted)
        rng = random.Random(zlib.crc32(name.encode("utf-8")) * 31 + i)
        FX_DRAWERS[name](t, d, rng)
        if name in ("heal", "explosion"):  # soften the glow-heavy FX a touch
            frame = frame.filter(ImageFilter.GaussianBlur(0.6))
        strip.paste(frame, (i * FX_SIZE, 0))
    return strip


# --------------------------------------------------------------------- main
def main():
    out_dir = REPO_ROOT / "public" / "art" / "sprites"
    fx_dir = out_dir / "fx"
    out_dir.mkdir(parents=True, exist_ok=True)
    fx_dir.mkdir(parents=True, exist_ok=True)

    report = {"sheets": {}}
    atlas = {"version": 1, "sheets": {}, "fx": {}}

    for char, filename in SHEETS.items():
        src = MEDIA_DIR / filename
        if not src.exists():
            raise FileNotFoundError(f"source sheet missing: {src}")
        img, bg = chroma_key(src)
        # v2 sheets bleed across nominal cells (warden v2 has only 3
        # content rows) → repack by connected components. Gildclaw's
        # original sheet is a clean 4x4 grid and stays on the grid path.
        if char == "gildclaw":
            fw, fh = img.width // COLS, img.height // ROWS
            sheet_cols, sheet_rows = COLS, ROWS
        else:
            nominal_rows = 3 if char == "warden" else 4
            img, fw, fh, sheet_rows, missing = repack_sheet(
                img, COLS, nominal_rows,
                drop_distant=char in FRAGMENT_DROP_SHEETS,
            )
            sheet_cols = COLS
            assert not missing, f"{char}: frames with no content: {missing}"
            if char in SUPPLEMENTS:
                sup = SUPPLEMENTS[char]
                simg, _sbg = chroma_key(MEDIA_DIR / sup["file"])
                simg, sfw, sfh, _sr, smissing = repack_sheet(
                    simg, sup["cols"], sup["rows"]
                )
                assert not smissing, (
                    f"{char} supplement: frames with no content: {smissing}"
                )
                extended = Image.new(
                    "RGBA", (fw * COLS, fh * (sheet_rows + 1)), (0, 0, 0, 0)
                )
                extended.alpha_composite(img, (0, 0))
                for i in range(sup["cols"] * sup["rows"]):
                    r, c = divmod(i, sup["cols"])
                    frame = simg.crop(
                        (c * sfw, r * sfh, (c + 1) * sfw, (r + 1) * sfh)
                    )
                    scale = min(
                        (fw - 16) / frame.width, (fh - 16) / frame.height
                    )
                    nw = max(1, round(frame.width * scale))
                    nh = max(1, round(frame.height * scale))
                    frame = frame.resize((nw, nh), Image.LANCZOS)
                    x = i * fw + (fw - nw) // 2
                    y = sheet_rows * fh + fh - 8 - nh
                    extended.alpha_composite(frame, (x, y))
                img = extended
                sheet_rows += 1
                print(f"    supplement: +{sup['cols'] * sup['rows']} frames "
                      f"as row {sheet_rows} (frames "
                      f"{(sheet_rows - 1) * COLS}-{(sheet_rows - 1) * COLS + sup['cols'] * sup['rows'] - 1})")
        dest = out_dir / f"{char}.png"
        img.save(dest)
        rep = validate_sheet(img, fw, fh, sheet_cols, sheet_rows)
        rep["backgroundSampled"] = list(bg)
        rep["sourceSize"] = [img.width, img.height]
        rep["outputFile"] = f"public/art/sprites/{char}.png"
        report["sheets"][char] = rep

        anims = {}
        for name, (frames, fps, loop, events) in ANIMATIONS[char].items():
            entry = {"frames": frames, "fps": fps, "loop": loop}
            if events:
                entry["events"] = events
            anims[name] = entry
        atlas["sheets"][char] = {
            "src": f"/art/sprites/{char}.png",
            "frameWidth": fw, "frameHeight": fh,
            "cols": sheet_cols, "rows": sheet_rows, "animations": anims,
        }
        corner_max = max(f["cornerAlphaMax"] for f in rep["frames"])
        rep["cornerAlphaMax"] = corner_max
        print(f"[{char}] {img.width}x{img.height} frame {fw}x{fh} bg={bg} "
              f"coverage min={rep['minCoveragePct']}% max={rep['maxCoveragePct']}% "
              f"cornerAlphaMax={corner_max} flagged={rep['flaggedFrames']}")
        # Hard assertion: every frame corner of every sheet transparent.
        assert corner_max < 10, (
            f"{char}: frame corner alpha {corner_max} >= 10 — "
            "chroma key failed, background survived in a corner"
        )

    for name, fps in FX_FPS.items():
        strip = build_fx(name)
        strip.save(fx_dir / f"{name}.png")
        atlas["fx"][name] = {
            "src": f"/art/sprites/fx/{name}.png",
            "frameWidth": FX_SIZE, "frameHeight": FX_SIZE,
            "frames": FX_FRAMES, "fps": fps,
        }
        print(f"[fx:{name}] strip {strip.width}x{strip.height} fps={fps}")

    atlas_path = REPO_ROOT / "src" / "game" / "data" / "spriteAtlas.json"
    atlas_path.parent.mkdir(parents=True, exist_ok=True)
    atlas_path.write_text(json.dumps(atlas, indent=2) + "\n", encoding="utf-8")

    report_path = REPO_ROOT / "scripts" / "sprite_validation_report.json"
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    flagged_total = sum(len(s["flaggedFrames"]) for s in report["sheets"].values())
    print(f"atlas -> {atlas_path}")
    print(f"report -> {report_path} (flagged frames total: {flagged_total})")


if __name__ == "__main__":
    main()
