// Unit tests for the canonical element icon mapping (data/elementArt.ts),
// mirroring the classArt locks: EVERY element maps to its OWN medallion
// icon file, present in public/art/elements/, transparent PNG (RGBA),
// and the build pipeline's committed report proves corner alpha = 0
// for all 18 (varied canvas backgrounds must never leak into corners).
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ELEMENT_ART, artForElement } from "../../src/game/data/elementArt";
import { ELEMENT_LIST } from "../../src/game/engine/elements";
import reportJson from "../../scripts/element_icon_report.json";

const PUBLIC_DIR = join(process.cwd(), "public");

function pngColorType(filePath: string): number {
  // PNG IHDR: bytes 24 = bit depth, 25 = color type (6 = RGBA).
  const buf = readFileSync(filePath);
  expect(buf.subarray(1, 4).toString("latin1")).toBe("PNG");
  return buf[25];
}

describe("elementArt — every element owns its medallion icon", () => {
  it("maps every one of the 18 elements to an icon file", () => {
    expect(ELEMENT_LIST).toHaveLength(18);
    for (const el of ELEMENT_LIST) {
      expect(ELEMENT_ART[el.id], el.id).toBeTruthy();
      expect(artForElement(el.id)).toBe(ELEMENT_ART[el.id]);
    }
    expect(Object.keys(ELEMENT_ART).sort()).toEqual(
      ELEMENT_LIST.map((e) => e.id).sort(),
    );
  });

  it("no two elements share the same icon file", () => {
    const files = Object.values(ELEMENT_ART);
    expect(new Set(files).size).toBe(files.length);
  });

  it("every mapped file exists in public/ and is a transparent PNG", () => {
    for (const rel of Object.values(ELEMENT_ART)) {
      const path = join(PUBLIC_DIR, rel.replace(/^\//, ""));
      expect(existsSync(path), rel).toBe(true);
      expect(pngColorType(path), `${rel} must be RGBA (alpha channel)`).toBe(6);
    }
  });

  it("pipeline report proves transparent corners for all 18 icons", () => {
    const report = reportJson as unknown as {
      icons: Record<string, { cornerAlphaMax: number; centerAlpha: number }>;
    };
    for (const el of ELEMENT_LIST) {
      const entry = report.icons[el.id];
      expect(entry, `report icon ${el.id}`).toBeTruthy();
      expect(entry.cornerAlphaMax, `${el.id} cornerAlphaMax`).toBe(0);
      expect(entry.centerAlpha, `${el.id} centerAlpha`).toBe(255);
    }
  });
});
