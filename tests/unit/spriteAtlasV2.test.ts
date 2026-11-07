// Crabtopia — Unit tests: Atlas v2 rich sheets + idle variation.
//
// The v2 pipeline (scripts/build_sprite_atlas_v2.py) replaced six
// classes' 4×4 sheets with rich named-clip atlases. These tests lock
// the v2 contract: every state-machine state resolves to a clip, the
// rich clip set exists, frame geometry is sane, attack-type clips
// carry hitMoment events (support casts do not), and the seeded
// idle-variation schedule is deterministic and desynchronising.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import atlasJson from "../../src/game/data/spriteAtlas.json";
import {
  hashSeed,
  idleClipForCycle,
  idleProfileFor,
} from "../../src/game/animation/idleVariation";
import { proceduralTransform } from "../../src/game/animation/proceduralPose";

const atlas = atlasJson as unknown as {
  version: number;
  sheets: Record<
    string,
    {
      src: string;
      frameWidth: number;
      frameHeight: number;
      cols: number;
      rows: number;
      rich?: boolean;
      animations: Record<
        string,
        { frames: number[]; fps: number; loop: string; events?: Record<string, string> }
      >;
    }
  >;
};

const RICH_CLASSES = [
  "bulwark",
  "pincher",
  "reaver",
  "skitter",
  "tidecaller",
  "shellmender",
];
const V1_CLASSES = ["warden", "gildclaw"];
const STATE_CLIPS = [
  "idle",
  "walk",
  "run",
  "attack",
  "combo",
  "skill",
  "defense",
  "hit",
  "dodge",
  "jump",
  "fall",
  "victory",
  "death",
];
const RICH_CLIPS = [
  "idleAlt1",
  "idleAlt2",
  "turn",
  "start",
  "stop",
  "cast",
  "hurt",
  "stagger",
  "sleep",
  "defeat",
];

describe("atlas v2 — rich class sheets", () => {
  it("bumps the atlas version to 2 and keeps v1 classes intact", () => {
    expect(atlas.version).toBe(2);
    for (const cls of V1_CLASSES) {
      expect(atlas.sheets[cls], cls).toBeDefined();
      expect(atlas.sheets[cls].rich).toBeUndefined();
      expect(atlas.sheets[cls].src).toBe(`/art/sprites/${cls}.png`);
    }
  });

  it("every rich class serves a -v2 sheet with all state + rich clips", () => {
    for (const cls of RICH_CLASSES) {
      const sheet = atlas.sheets[cls];
      expect(sheet, cls).toBeDefined();
      expect(sheet.rich, cls).toBe(true);
      expect(sheet.src, cls).toBe(`/art/sprites/${cls}-v2.png`);
      for (const clip of [...STATE_CLIPS, ...RICH_CLIPS]) {
        const def = sheet.animations[clip];
        expect(def, `${cls}.${clip}`).toBeDefined();
        expect(def.frames.length, `${cls}.${clip} frames`).toBeGreaterThan(0);
        expect(def.fps, `${cls}.${clip} fps`).toBeGreaterThan(0);
        for (const f of def.frames) {
          expect(f, `${cls}.${clip} frame ${f}`).toBeGreaterThanOrEqual(0);
          expect(f, `${cls}.${clip} frame ${f}`).toBeLessThan(sheet.cols * sheet.rows);
        }
      }
    }
  });

  it("rich cycle clips have real multi-frame cycles", () => {
    for (const cls of RICH_CLASSES) {
      const a = atlas.sheets[cls].animations;
      expect(a.idle.frames.length, `${cls} idle`).toBeGreaterThanOrEqual(5);
      expect(a.walk.frames.length, `${cls} walk`).toBeGreaterThanOrEqual(5);
      expect(a.run.frames.length, `${cls} run`).toBeGreaterThanOrEqual(5);
      expect(a.attack.frames.length, `${cls} attack`).toBeGreaterThanOrEqual(5);
      // Defeat ends on the on-back frame: the last defeat frame is the
      // same frame the death alias ends on.
      expect(a.defeat.frames.at(-1)).toBe(a.death.frames.at(-1));
    }
  });

  it("rich sheet PNGs exist on disk and are RGBA", () => {
    for (const cls of RICH_CLASSES) {
      const p = path.join(process.cwd(), "public", "art", "sprites", `${cls}-v2.png`);
      expect(existsSync(p), p).toBe(true);
      const buf = readFileSync(p);
      // PNG color type byte at offset 25: 6 = RGBA.
      expect(buf[25], `${cls} RGBA`).toBe(6);
    }
  });

  it("damage clips carry hitMoment; the Shellmender heal cast does not", () => {
    for (const cls of RICH_CLASSES) {
      const a = atlas.sheets[cls].animations;
      const attackEvents = Object.values(a.attack.events ?? {});
      expect(attackEvents, `${cls} attack events`).toContain("hitMoment");
      const comboEvents = Object.values(a.combo.events ?? {});
      expect(comboEvents.length, `${cls} combo events`).toBeGreaterThanOrEqual(2);
    }
    const sm = atlas.sheets.shellmender.animations;
    expect(Object.values(sm.skill.events ?? {})).not.toContain("hitMoment");
    expect(Object.values(sm.cast.events ?? {})).not.toContain("hitMoment");
    // …while a damage caster's skill does fire its moment.
    const tc = atlas.sheets.tidecaller.animations;
    expect(Object.values(tc.skill.events ?? {})).toContain("hitMoment");
  });

  it("the pipeline manifest covers exactly the rich classes", () => {
    const manifest = JSON.parse(
      readFileSync(
        path.join(process.cwd(), "scripts", "sprite_v2_manifest.json"),
        "utf8",
      ),
    ) as { classes: Record<string, { clips: Record<string, unknown> }> };
    expect(Object.keys(manifest.classes).sort()).toEqual([...RICH_CLASSES].sort());
    for (const cls of RICH_CLASSES) {
      expect(
        Object.keys(manifest.classes[cls].clips).length,
        `${cls} manifest clips`,
      ).toBeGreaterThanOrEqual(20);
    }
  });
});

describe("idle variation — deterministic and desynchronising", () => {
  it("hashSeed is stable and seed-sensitive", () => {
    expect(hashSeed("crab-1")).toBe(hashSeed("crab-1"));
    expect(hashSeed("crab-1")).not.toBe(hashSeed("crab-2"));
  });

  it("profiles are deterministic, with jitter inside ±8% + phase spread", () => {
    const a = idleProfileFor("crab-xyz");
    expect(idleProfileFor("crab-xyz")).toEqual(a);
    expect(a.speedFactor).toBeGreaterThanOrEqual(0.92);
    expect(a.speedFactor).toBeLessThanOrEqual(1.08);
    const phases = new Set(
      Array.from({ length: 40 }, (_, i) => idleProfileFor(`crab-${i}`).phaseMs),
    );
    expect(phases.size).toBeGreaterThan(30);
  });

  it("the schedule is deterministic per (seed, cycle)", () => {
    const variants = ["idleAlt1", "idleAlt2"];
    for (let c = 0; c < 24; c++) {
      expect(idleClipForCycle("crab-7", c, variants)).toBe(
        idleClipForCycle("crab-7", c, variants),
      );
    }
  });

  it("base idle dominates but variants do appear over many cycles", () => {
    const variants = ["idleAlt1", "idleAlt2"];
    let base = 0;
    let alt = 0;
    for (let c = 0; c < 200; c++) {
      if (idleClipForCycle("crab-7", c, variants) === "idle") base++;
      else alt++;
    }
    expect(base).toBeGreaterThan(alt);
    expect(alt).toBeGreaterThan(20);
  });

  it("different crabs run different schedules (no group sync)", () => {
    const variants = ["idleAlt1", "idleAlt2"];
    const schedules = new Set(
      Array.from({ length: 12 }, (_, i) =>
        Array.from({ length: 16 }, (_, c) =>
          idleClipForCycle(`crab-${i}`, c, variants),
        ).join(","),
      ),
    );
    expect(schedules.size).toBeGreaterThan(8);
  });

  it("no variants → always the base idle clip", () => {
    for (let c = 0; c < 10; c++) {
      expect(idleClipForCycle("crab-1", c, [])).toBe("idle");
    }
  });
});

describe("procedural pose — squash & stretch", () => {
  const base = { prevState: null, sinceChangeMs: 0, progress: 0 } as const;

  it("neutral states produce no transform", () => {
    expect(proceduralTransform({ ...base, state: "idle" })).toBe("none");
    expect(proceduralTransform({ ...base, state: "walk", progress: 0.5 })).toBe("none");
  });

  it("attacks squash in anticipation, then stretch at the strike", () => {
    const windup = proceduralTransform({ ...base, state: "attack", progress: 0.15 });
    expect(windup).toContain("scale(1.0");
    const strike = proceduralTransform({ ...base, state: "attack", progress: 0.35 });
    expect(strike).toContain("translateX(");
    expect(proceduralTransform({ ...base, state: "attack", progress: 0.9 })).toBe("none");
  });

  it("landing from jump/fall/dodge squashes briefly, then releases", () => {
    const landed = proceduralTransform({
      state: "idle",
      prevState: "jump",
      sinceChangeMs: 10,
      progress: 0,
    });
    expect(landed).not.toBe("none");
    expect(
      proceduralTransform({
        state: "idle",
        prevState: "jump",
        sinceChangeMs: 500,
        progress: 0,
      }),
    ).toBe("none");
    // Walking in from a walk is not a landing.
    expect(
      proceduralTransform({
        state: "idle",
        prevState: "walk",
        sinceChangeMs: 10,
        progress: 0,
      }),
    ).toBe("none");
  });

  it("hit recoil decays; victory bounces", () => {
    expect(
      proceduralTransform({ ...base, state: "hit", sinceChangeMs: 30 }),
    ).toContain("translateX(-");
    expect(
      proceduralTransform({ ...base, state: "hit", sinceChangeMs: 900 }),
    ).toBe("none");
    expect(
      proceduralTransform({ ...base, state: "victory", sinceChangeMs: 140 }),
    ).not.toBe("none");
  });
});
