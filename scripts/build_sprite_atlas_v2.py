#!/usr/bin/env python3
"""
Crabtopia sprite pipeline v2 — rich-clip atlases from the v3 sheets.

The v3 source sheets (master / locomotion / action per class) are neat
but NOT fixed grids: several sheets have irregular per-row pose counts
(reaver), so poses are segmented by image analysis, never by assuming
a grid:

  1. Chroma-key the uniform cream background (flood-fill key reused
     from the v1 pipeline, scripts/build_sprite_atlas.py).
  2. Segment poses: row bands from the horizontal alpha projection,
     column segments from the vertical projection inside each band,
     then connected components inside each segment — the pose is the
     largest component plus any component overlapping its bbox, so
     stray doodles (dizzy swirls, sparkles) drawn outside the body
     silhouette are discarded, pixels and all.
  3. Normalise every pose into a per-class atlas PNG: one shared cell
     size, horizontally centred, feet on a shared ground line.
  4. Emit atlas-v2 sheet entries (merged into spriteAtlas.json) whose
     animations are NAMED CLIPS from a hand-authored manifest
     (scripts/sprite_v2_manifest.json): idle, idleAlt*, walk, run,
     turn, start, stop, attack, combo, cast, dodge, jump, hurt,
     stagger, sleep, victory, defeat — plus the state-machine names
     (skill/hit/fall/death/defense) aliased onto the same frames so the
     existing runtime resolves v2 sheets with zero special cases.

All 8 classes are covered. Adding a class later: generate its 3
sheets, add a manifest entry, re-run this script. Nothing else
changes. Manifest authors: verify every referenced pose against a
per-pose dump first — segmentation can sever shiny detached parts
(a claw tip, a lone claw) into fragment poses that must never be
referenced (warden loco:9 / loco:15 / action:9, master:15).

Usage:
  python3 scripts/build_sprite_atlas_v2.py inspect   # annotated pose maps
  python3 scripts/build_sprite_atlas_v2.py build     # atlases + atlas JSON
Requires: Pillow, numpy, scipy. No network. Deterministic.
"""
import json
import os
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_sprite_atlas import chroma_key  # noqa: E402  (v1 flood-fill key)

REPO_ROOT = Path(__file__).resolve().parent.parent
MEDIA_DIR = Path(os.environ.get(
    "CRABTOPIA_MEDIA_DIR", Path.home() / "workspace" / "imagine_media"))
MANIFEST_PATH = REPO_ROOT / "scripts" / "sprite_v2_manifest.json"
ATLAS_PATH = REPO_ROOT / "src" / "game" / "data" / "spriteAtlas.json"
REPORT_PATH = REPO_ROOT / "scripts" / "sprite_v2_report.json"
INSPECT_DIR = REPO_ROOT / "scripts" / "v2_inspect"

ALPHA_MIN = 32          # pixel counts as body above this alpha
GAP_MERGE = 10          # projection gaps (px) smaller than this are bridged
MIN_AREA_FRAC = 0.015   # pose segments smaller than this share of the
                        # sheet's median pose area are doodle-only: dropped


# ------------------------------------------------------------ segmentation
def _valley_cuts(projection: np.ndarray, n_segments: int) -> list[int]:
    """Cut positions splitting a 1-D mass projection into n_segments.

    Each boundary is searched in a window around its equal-division
    position and placed at the smoothed projection's minimum — the
    valley between two poses — so touching poses (whose projections
    never reach zero) still split at the right place.
    """
    extent = len(projection)
    if n_segments <= 1 or extent == 0:
        return []
    cell = extent / n_segments
    win = max(3, int(cell / 10))
    kernel = np.ones(win) / win
    smooth = np.convolve(projection.astype(np.float64), kernel, mode="same")
    cuts = []
    prev = 0
    for k in range(1, n_segments):
        expected = int(round(cell * k))
        lo = max(prev + 8, expected - int(cell * 0.38))
        hi = min(extent - 8, expected + int(cell * 0.38))
        if hi <= lo:
            cut = expected
        else:
            cut = lo + int(np.argmin(smooth[lo:hi]))
        cuts.append(cut)
        prev = cut
    return cuts


def _ranges(cuts: list[int], extent: int) -> list[tuple[int, int]]:
    edges = [0] + cuts + [extent]
    return [(edges[i], edges[i + 1]) for i in range(len(edges) - 1)]


def segment_poses(rgba: Image.Image, layout: list[int]) -> list[dict]:
    """Segment a chroma-keyed sheet into poses (row-major order).

    `layout` = pose count per row (manifest, authored by visual
    inspection — several sheets have irregular rows). Rows and columns
    are found by valley cuts on the alpha mass projections; inside each
    cell the pose is the largest connected component plus any component
    overlapping its bbox or at least 10% of its size. Everything else
    in the cell — a neighbour's spilling claw tip, a stray doodle
    (swirl / sparkle / motion mark) outside the body silhouette — is
    discarded, pixels and all. Returns [{bbox, image, row}].
    """
    from scipy import ndimage

    arr = np.asarray(rgba)
    mask = arr[:, :, 3] > ALPHA_MIN
    labels, _n = ndimage.label(mask)
    h, w = mask.shape
    row_ranges = _ranges(
        _valley_cuts(mask.sum(axis=1), len(layout)), h)
    poses: list[dict] = []
    for ri, (ry0, ry1) in enumerate(row_ranges):
        band = mask[ry0:ry1, :]
        col_ranges = _ranges(_valley_cuts(band.sum(axis=0), layout[ri]), w)
        for cx0, cx1 in col_ranges:
            cell_labels = labels[ry0:ry1, cx0:cx1]
            present = [li for li in np.unique(cell_labels) if li != 0]
            if not present:
                continue
            sizes = {li: int((cell_labels == li).sum()) for li in present}
            main = max(sizes, key=lambda li: sizes[li])
            ys, xs = np.where(cell_labels == main)
            bx0, by0 = int(xs.min()), int(ys.min())
            bx1, by1 = int(xs.max()) + 1, int(ys.max()) + 1
            keep = [main]
            for li in present:
                if li == main:
                    continue
                if sizes[li] >= 0.05 * sizes[main]:
                    # Substantial detached part of THIS pose (e.g. a far-
                    # extended claw drawn as its own island). Doodles are
                    # ~1% line-work and never reach this size.
                    keep.append(li)
                    continue
                ys2, xs2 = np.where(cell_labels == li)
                if (int(xs2.min()) >= bx0 - 6 and int(xs2.max()) < bx1 + 6
                        and int(ys2.min()) >= by0 - 6
                        and int(ys2.max()) < by1 + 6):
                    keep.append(li)
            kept = np.isin(cell_labels, keep)
            ys, xs = np.where(kept)
            x0, x1 = cx0 + int(xs.min()), cx0 + int(xs.max()) + 1
            y0, y1 = ry0 + int(ys.min()), ry0 + int(ys.max()) + 1
            crop = arr[y0:y1, x0:x1].copy()
            crop[~kept[int(ys.min()):int(ys.max()) + 1,
                       int(xs.min()):int(xs.max()) + 1]] = 0
            poses.append({
                "bbox": (x0, y0, x1, y1),
                "image": Image.fromarray(crop, "RGBA"),
                "row": ri,
                "area": int(kept.sum()),
            })
    return poses


def load_sheet_poses(filename: str,
                     layout: list[int]) -> tuple[list[dict], tuple]:
    src = MEDIA_DIR / filename
    if not src.exists():
        raise FileNotFoundError(f"source sheet missing: {src}")
    rgba, bg = chroma_key(src)
    return segment_poses(rgba, layout), bg


# ---------------------------------------------------------------- inspect
def cmd_inspect() -> None:
    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    INSPECT_DIR.mkdir(parents=True, exist_ok=True)
    summary: dict[str, dict[str, list[int]]] = {}
    for cls, entry in manifest["classes"].items():
        summary[cls] = {}
        for alias, filename in entry["sheets"].items():
            layout = entry.get("layouts", {}).get(alias, [6, 6, 6, 6])
            poses, bg = load_sheet_poses(filename, layout)
            rows: dict[int, int] = {}
            for p in poses:
                rows[p["row"]] = rows.get(p["row"], 0) + 1
            summary[cls][alias] = [rows[r] for r in sorted(rows)]
            # Annotated view: source art + numbered pose boxes.
            src = Image.open(MEDIA_DIR / filename).convert("RGB")
            d = ImageDraw.Draw(src)
            for i, p in enumerate(poses):
                x0, y0, x1, y1 = p["bbox"]
                d.rectangle([x0, y0, x1, y1], outline=(255, 0, 0), width=4)
                d.rectangle([x0, y0, x0 + 54, y0 + 40], fill=(255, 0, 0))
                d.text((x0 + 8, y0 + 8), str(i), fill=(255, 255, 255))
            out = INSPECT_DIR / f"{cls}_{alias}.png"
            src.save(out)
            print(f"[{cls}/{alias}] bg={bg} poses={len(poses)} "
                  f"rows={summary[cls][alias]} -> {out.name}")
    (INSPECT_DIR / "summary.json").write_text(
        json.dumps(summary, indent=2) + "\n", encoding="utf-8")


# ------------------------------------------------------------------ build
CELL_PAD = 10
ATLAS_COLS = 6


def build_class(cls: str, entry: dict) -> tuple[dict, dict]:
    """Assemble one class atlas; returns (atlas sheet entry, report)."""
    poses_by_ref: dict[str, dict] = {}
    for alias, filename in entry["sheets"].items():
        layout = entry.get("layouts", {}).get(alias, [6, 6, 6, 6])
        poses, _bg = load_sheet_poses(filename, layout)
        for i, p in enumerate(poses):
            poses_by_ref[f"{alias}:{i}"] = p
        print(f"[{cls}/{alias}] {len(poses)} poses")

    # Lay out frames in the order clips first reference them.
    frame_order: list[str] = []
    animations: dict[str, dict] = {}
    for clip, spec in entry["clips"].items():
        indices = []
        for ref in spec["frames"]:
            if ref not in poses_by_ref:
                raise KeyError(f"{cls}: clip {clip} references missing pose {ref}")
            if ref not in frame_order:
                frame_order.append(ref)
            indices.append(frame_order.index(ref))
        anim = {"frames": indices, "fps": spec["fps"], "loop": spec["loop"]}
        if spec.get("events"):
            anim["events"] = spec["events"]
        animations[clip] = anim

    cell_w = max(poses_by_ref[r]["image"].width for r in frame_order) + CELL_PAD * 2
    cell_h = max(poses_by_ref[r]["image"].height for r in frame_order) + CELL_PAD * 2
    rows = (len(frame_order) + ATLAS_COLS - 1) // ATLAS_COLS
    sheet = Image.new(
        "RGBA", (cell_w * ATLAS_COLS, cell_h * rows), (0, 0, 0, 0))
    for fi, ref in enumerate(frame_order):
        img = poses_by_ref[ref]["image"]
        r, c = divmod(fi, ATLAS_COLS)
        x = c * cell_w + (cell_w - img.width) // 2
        y = r * cell_h + cell_h - CELL_PAD - img.height  # shared ground line
        sheet.alpha_composite(img, (x, y))

    dest = REPO_ROOT / "public" / "art" / "sprites" / f"{cls}-v2.png"
    sheet.save(dest)
    print(f"[{cls}] atlas {sheet.width}x{sheet.height} cell {cell_w}x{cell_h} "
          f"frames={len(frame_order)} -> {dest.relative_to(REPO_ROOT)}")

    # Validation: every cell corner transparent + every frame has content.
    alpha = np.asarray(sheet.split()[3])
    frames_rep = []
    for fi in range(ATLAS_COLS * rows):
        r, c = divmod(fi, ATLAS_COLS)
        cell = alpha[r * cell_h:(r + 1) * cell_h, c * cell_w:(c + 1) * cell_w]
        corners = [int(cell[2, 2]), int(cell[2, -3]),
                   int(cell[-3, 2]), int(cell[-3, -3])]
        frames_rep.append({
            "index": fi,
            "cornerAlphaMax": max(corners),
            "alphaCoveragePct": round(float((cell > ALPHA_MIN).mean() * 100), 2),
            "used": fi < len(frame_order),
        })
    used = [f for f in frames_rep if f["used"]]
    assert all(f["cornerAlphaMax"] < 10 for f in frames_rep), \
        f"{cls}: non-transparent atlas corner"
    assert all(f["alphaCoveragePct"] > 1.0 for f in used), \
        f"{cls}: empty used frame"

    sheet_entry = {
        "src": f"/art/sprites/{cls}-v2.png",
        "frameWidth": cell_w,
        "frameHeight": cell_h,
        "cols": ATLAS_COLS,
        "rows": rows,
        "rich": True,
        "animations": animations,
    }
    report = {
        "frames": len(frame_order),
        "frameOrder": frame_order,
        "cellWidth": cell_w,
        "cellHeight": cell_h,
        "cornerAlphaMax": max(f["cornerAlphaMax"] for f in frames_rep),
        "minCoveragePct": min(f["alphaCoveragePct"] for f in used),
        "validationFrames": frames_rep,
    }
    return sheet_entry, report


def cmd_build() -> None:
    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    atlas = json.loads(ATLAS_PATH.read_text(encoding="utf-8"))
    atlas["version"] = 2
    report: dict[str, dict] = {}
    for cls, entry in manifest["classes"].items():
        sheet_entry, rep = build_class(cls, entry)
        atlas["sheets"][cls] = sheet_entry
        report[cls] = rep
    ATLAS_PATH.write_text(json.dumps(atlas, indent=2) + "\n", encoding="utf-8")
    REPORT_PATH.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(f"atlas v2 -> {ATLAS_PATH}")
    print(f"report -> {REPORT_PATH}")


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "build"
    if cmd == "inspect":
        cmd_inspect()
    elif cmd == "build":
        cmd_build()
    else:
        raise SystemExit(f"unknown command: {cmd}")
