// Unit tests validating the shared sprite atlas data file
// (src/game/data/spriteAtlas.json, produced alongside the sprite sheets).
// This guards the contract the animation engine and renderers rely on:
// every sheet must define the full state set and only reference frames
// that exist inside its grid; every flipbook FX must be present.
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import atlasJson from "../../src/game/data/spriteAtlas.json";
import reportJson from "../../scripts/sprite_validation_report.json";

interface AtlasAnimation {
  frames: number[];
  fps: number;
  loop: string;
}
interface AtlasSheet {
  src: string;
  frameWidth: number;
  frameHeight: number;
  cols: number;
  rows: number;
  animations: Record<string, AtlasAnimation>;
}
interface AtlasFx {
  src: string;
  frameWidth: number;
  frameHeight: number;
  frames: number;
  fps: number;
}
interface Atlas {
  sheets: Record<string, AtlasSheet>;
  fx: Record<string, AtlasFx>;
}

const atlas = atlasJson as unknown as Atlas;

const SHEET_NAMES = [
  "gildclaw",
  "warden",
  "reaver",
  "pincher",
  "bulwark",
  "skitter",
  "tidecaller",
  "shellmender",
];
const REQUIRED_STATES = [
  "idle",
  "walk",
  "run",
  "attack",
  "combo",
  "skill",
  "defense",
  "hit",
  "jump",
  "fall",
  "victory",
  "death",
];
const FX_NAMES = [
  "slash",
  "spark",
  "lightning",
  "splash",
  "heal",
  "explosion",
  "shield",
  "levelup",
  "poison",
  "ice",
  "dark",
];
const LOOP_MODES = ["loop", "once", "pingpong"];

describe("spriteAtlas.json", () => {
  it("contains all eight character sheets", () => {
    expect(atlas.sheets).toBeTruthy();
    for (const name of SHEET_NAMES) {
      expect(atlas.sheets[name], `sheet ${name}`).toBeTruthy();
    }
  });

  it("every sheet has a valid grid and image geometry", () => {
    for (const name of SHEET_NAMES) {
      const sheet = atlas.sheets[name];
      expect(sheet.src, `${name}.src`).toBeTruthy();
      expect(sheet.frameWidth).toBeGreaterThan(0);
      expect(sheet.frameHeight).toBeGreaterThan(0);
      expect(sheet.cols).toBeGreaterThan(0);
      expect(sheet.rows).toBeGreaterThan(0);
    }
  });

  it("every sheet defines the full required animation state set", () => {
    for (const name of SHEET_NAMES) {
      const sheet = atlas.sheets[name];
      for (const state of REQUIRED_STATES) {
        expect(
          sheet.animations[state],
          `${name}.animations.${state}`,
        ).toBeTruthy();
      }
    }
  });

  it("every animation is playable and references only in-grid frames", () => {
    for (const name of SHEET_NAMES) {
      const sheet = atlas.sheets[name];
      const maxFrame = sheet.cols * sheet.rows;
      for (const [animName, anim] of Object.entries(sheet.animations)) {
        const label = `${name}.${animName}`;
        expect(anim.frames.length, label).toBeGreaterThan(0);
        expect(anim.fps, label).toBeGreaterThan(0);
        expect(LOOP_MODES, label).toContain(anim.loop);
        for (const frame of anim.frames) {
          expect(Number.isInteger(frame), label).toBe(true);
          expect(frame, label).toBeGreaterThanOrEqual(0);
          expect(frame, label).toBeLessThan(maxFrame);
        }
      }
    }
  });

  it("every sheet PNG exists in public/ and is RGBA", () => {
    for (const name of SHEET_NAMES) {
      const rel = atlas.sheets[name].src.replace(/^\//, "");
      const path = join(process.cwd(), "public", rel);
      expect(existsSync(path), rel).toBe(true);
      const buf = readFileSync(path);
      expect(buf.subarray(1, 4).toString("latin1")).toBe("PNG");
      // PNG IHDR byte 25 = color type (6 = RGBA, real alpha channel).
      expect(buf[25], `${rel} must be RGBA`).toBe(6);
    }
  });

  it("pipeline validation report proves transparent frame corners", () => {
    // scripts/build_sprite_atlas.py asserts this at build time and
    // records it per sheet/frame; lock the committed evidence so a
    // sheet whose background survived keying can never ship silently.
    const report = reportJson as unknown as {
      sheets: Record<
        string,
        { cornerAlphaMax: number; frames: { cornerAlphaMax: number }[] }
      >;
    };
    for (const name of SHEET_NAMES) {
      const sheet = report.sheets[name];
      expect(sheet, `report sheet ${name}`).toBeTruthy();
      expect(sheet.cornerAlphaMax, `${name} cornerAlphaMax`).toBe(0);
      for (const frame of sheet.frames) {
        expect(frame.cornerAlphaMax, `${name} frame corner`).toBeLessThan(10);
      }
    }
  });

  it("contains all eleven flipbook FX with valid geometry", () => {
    expect(atlas.fx).toBeTruthy();
    for (const name of FX_NAMES) {
      const fx = atlas.fx[name];
      expect(fx, `fx ${name}`).toBeTruthy();
      expect(fx.src, `fx ${name}.src`).toBeTruthy();
      expect(fx.frames).toBeGreaterThan(0);
      expect(fx.fps).toBeGreaterThan(0);
      expect(fx.frameWidth).toBeGreaterThan(0);
      expect(fx.frameHeight).toBeGreaterThan(0);
    }
  });
});
