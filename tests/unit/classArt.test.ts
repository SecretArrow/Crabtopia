// Unit tests for the canonical preview-art mapping (data/classArt.ts).
//
// The user's rule under test: EVERY class preview shows that class's OWN
// original art — one unique, transparent file per class, present in
// public/art/crabs/. No two classes may share a file (no borrowed
// silhouettes), and every file must carry a real alpha channel.
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  CLASS_ART,
  LEGENDARY_ART,
  ROOKIE_ART,
  artForClass,
} from "../../src/game/data/classArt";
import { CLASS_LIST } from "../../src/game/content/classes";

const PUBLIC_DIR = join(process.cwd(), "public");

function pngColorType(filePath: string): number {
  // PNG IHDR: bytes 24 = bit depth, 25 = color type (6 = RGBA).
  const buf = readFileSync(filePath);
  expect(buf.subarray(1, 4).toString("latin1")).toBe("PNG");
  return buf[25];
}

describe("classArt — every class owns its preview art", () => {
  it("maps every game class to an art file", () => {
    for (const cls of CLASS_LIST) {
      expect(CLASS_ART[cls.id], cls.id).toBeTruthy();
    }
    expect(Object.keys(CLASS_ART).sort()).toEqual(
      CLASS_LIST.map((c) => c.id).sort(),
    );
  });

  it("no two classes share the same art file", () => {
    const files = Object.values(CLASS_ART);
    expect(new Set(files).size).toBe(files.length);
    expect(files).not.toContain(ROOKIE_ART);
    expect(files).not.toContain(LEGENDARY_ART);
    expect(ROOKIE_ART).not.toBe(LEGENDARY_ART);
  });

  it("every mapped file exists in public/ and is a transparent PNG", () => {
    const all = [...Object.values(CLASS_ART), ROOKIE_ART, LEGENDARY_ART];
    for (const rel of all) {
      const path = join(PUBLIC_DIR, rel.replace(/^\//, ""));
      expect(existsSync(path), rel).toBe(true);
      expect(pngColorType(path), `${rel} must be RGBA (alpha channel)`).toBe(6);
    }
  });

  it("rookies resolve to the rookie art, classes to their own", () => {
    for (const cls of CLASS_LIST) {
      expect(artForClass(cls.id)).toBe(CLASS_ART[cls.id]);
      expect(artForClass(cls.id, true)).toBe(ROOKIE_ART);
    }
  });
});
