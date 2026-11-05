#!/usr/bin/env python3
"""Convert all generated art files to true PNG format.
The z-ai SDK returns JPEG-encoded bytes; we re-encode as real PNG in place.
"""
import os
from PIL import Image

ROOT = "/home/z/my-project/download/art"
TARGETS = [
    "biomes/biome-coral.png", "biomes/biome-cinder.png", "biomes/biome-frost.png",
    "biomes/biome-mangrove.png", "biomes/biome-storm.png", "biomes/biome-moon.png",
    "biomes/dive-map.png", "biomes/crabtopia-city.png",
    "ui/logo.png", "ui/app-icon.png", "ui/emblem-coral.png", "ui/emblem-cinder.png",
    "ui/emblem-frost.png", "ui/emblem-mangrove.png", "ui/emblem-storm.png",
    "ui/emblem-moon.png", "ui/gold-coin.png", "ui/treasure-chest.png",
    "ui/ui-panel.png", "ui/loading-screen.png", "ui/empty-state.png",
]

ok = bad = 0
for rel in TARGETS:
    p = os.path.join(ROOT, rel)
    if not os.path.exists(p) or os.path.getsize(p) == 0:
        print(f"[MISS] {rel}")
        bad += 1
        continue
    before = os.path.getsize(p)
    try:
        img = Image.open(p)
        img.load()
        mode = img.mode
        # Force RGB (JPEG sources are RGB); PNG supports it losslessly.
        if mode not in ("RGB", "RGBA", "P", "L"):
            img = img.convert("RGB")
        img.save(p, format="PNG", optimize=True)
        after = os.path.getsize(p)
        print(f"[OK] {rel:32s} {before:>7} -> {after:>7} bytes  ({img.size[0]}x{img.size[1]} {mode})")
        ok += 1
    except Exception as e:
        print(f"[ERR] {rel}: {e}")
        bad += 1

print(f"----\nConverted OK: {ok} | Bad: {bad}")
