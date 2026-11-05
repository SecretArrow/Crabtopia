// Unit tests for the Option A anchored slot layout (slotLayout.ts).
//
// The core guarantee under test: on the anchored battlefield, every crab
// owns a slot box and NO two slot boxes overlap — for every formation
// preset in the game, on both sides — so crabs can never pile on top of
// each other at rest again.
import { describe, it, expect } from "vitest";
import {
  SLOT_BOX,
  attackPoint,
  columnX,
  laneY,
  layoutForRows,
  pointInRect,
  rectsOverlap,
  slotAnchor,
  slotBoxRect,
  slotKey,
  uniformSlotBox,
  type BattleSide,
  type SlotRow,
} from "../../src/game/render/arena/slotLayout";
import { FORMATION_PRESET_LIST } from "../../src/game/engine/formation";

const SIDES: BattleSide[] = ["player", "enemy"];
const ROWS: SlotRow[] = ["front", "mid", "back"];

type RowCounts = Record<SlotRow, number>;

function allRects(playerRows: RowCounts, enemyRows: RowCounts) {
  const maxRow = Math.max(
    ...ROWS.map((r) => Math.max(playerRows[r], enemyRows[r])),
  );
  const box = uniformSlotBox(maxRow);
  const rects: { key: string; rect: ReturnType<typeof slotBoxRect> }[] = [];
  const sides: [BattleSide, RowCounts][] = [
    ["player", playerRows],
    ["enemy", enemyRows],
  ];
  for (const [side, rows] of sides) {
    for (const [key, anchor] of layoutForRows(side, rows)) {
      rects.push({ key: `${side}:${key}`, rect: slotBoxRect(anchor, box) });
    }
  }
  return rects;
}

function expectNoOverlap(playerRows: RowCounts, enemyRows: RowCounts) {
  const rects = allRects(playerRows, enemyRows);
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      expect(
        rectsOverlap(rects[i].rect, rects[j].rect),
        `${rects[i].key} overlaps ${rects[j].key}`,
      ).toBe(false);
    }
  }
  return rects;
}

describe("slotLayout — mirroring & facing", () => {
  it("player fronts sit left of centre, enemy fronts right, exactly mirrored", () => {
    for (const row of ROWS) {
      expect(columnX("enemy", row)).toBe(100 - columnX("player", row));
    }
    expect(columnX("player", "front")).toBeLessThan(50);
    expect(columnX("enemy", "front")).toBeGreaterThan(50);
  });

  it("player columns run back < mid < front toward the centre line", () => {
    expect(columnX("player", "back")).toBeLessThan(columnX("player", "mid"));
    expect(columnX("player", "mid")).toBeLessThan(columnX("player", "front"));
    // The two frontlines are the closest pair across the centre.
    const gap = columnX("enemy", "front") - columnX("player", "front");
    expect(gap).toBeGreaterThan(0);
    expect(gap).toBeLessThan(columnX("enemy", "mid") - columnX("player", "mid"));
  });

  it("anchors mirror exactly: enemy anchor = 100 - player anchor x, same y", () => {
    for (const row of ROWS) {
      for (let n = 1; n <= 3; n++) {
        for (let i = 0; i < n; i++) {
          const p = slotAnchor("player", row, i, n);
          const e = slotAnchor("enemy", row, i, n);
          expect(e.x).toBe(100 - p.x);
          expect(e.y).toBe(p.y);
          expect(e.lane).toBe(p.lane);
        }
      }
    }
  });
});

describe("slotLayout — lanes", () => {
  it("a single crab in a row sits at vertical centre", () => {
    expect(laneY(0, 1)).toBe(50);
  });

  it("lanes spread monotonically and symmetrically", () => {
    for (let n = 2; n <= 5; n++) {
      let prev = -Infinity;
      for (let i = 0; i < n; i++) {
        const y = laneY(i, n);
        expect(y).toBeGreaterThan(prev);
        prev = y;
        // Symmetric around the field centre.
        expect(laneY(i, n) + laneY(n - 1 - i, n)).toBeCloseTo(100, 9);
      }
    }
  });

  it("two-crab rows sit at the quarter points of the lane band", () => {
    expect(laneY(0, 2)).toBeCloseTo(31.25, 9);
    expect(laneY(1, 2)).toBeCloseTo(68.75, 9);
  });
});

describe("slotLayout — anti-overlap guarantee", () => {
  it("column and lane spacing exceed the slot box size for presets", () => {
    const colGap = columnX("player", "mid") - columnX("player", "back");
    expect(colGap).toBeGreaterThanOrEqual(SLOT_BOX.widthPct);
    const laneGap3 = laneY(1, 3) - laneY(0, 3);
    expect(laneGap3).toBeGreaterThanOrEqual(SLOT_BOX.heightPct);
  });

  it("no slot overlap for ANY formation preset, either side", () => {
    for (const preset of FORMATION_PRESET_LIST) {
      const rows = preset.rows as RowCounts;
      const rects = expectNoOverlap(rows, rows);
      // A full team is 5 per side → 10 slots on the field.
      expect(rects.length, preset.id).toBe(10);
    }
  });

  it("no slot overlap for mixed preset matchups", () => {
    const byId = new Map(FORMATION_PRESET_LIST.map((p) => [p.id, p.rows as RowCounts]));
    expectNoOverlap(byId.get("frontline")!, byId.get("backline")!);
    expectNoOverlap(byId.get("backline")!, byId.get("offensive")!);
    expectNoOverlap(byId.get("defensive")!, byId.get("frontline")!);
  });

  it("no slot overlap for every legal 5-crab row distribution", () => {
    for (let f = 0; f <= 5; f++) {
      for (let m = 0; m <= 5 - f; m++) {
        const b = 5 - f - m;
        expectNoOverlap(
          { front: f, mid: m, back: b },
          { front: f, mid: m, back: b },
        );
      }
    }
  });

  it("slot keys are unique across a full 10-crab field", () => {
    const keys = new Set<string>();
    for (const side of SIDES) {
      for (const row of ROWS) {
        for (let i = 0; i < 3; i++) keys.add(slotKey(side, row, i));
      }
    }
    expect(keys.size).toBe(18);
    expect(slotKey("player", "front", 0)).toBe("player-front-0");
  });
});

describe("slotLayout — attack point", () => {
  it("stops OUTSIDE the target slot box, on the actor→target axis", () => {
    const cases: [SlotAnchor, SlotAnchor][] = [
      // Frontline clash across the centre.
      [slotAnchor("player", "front", 0, 2), slotAnchor("enemy", "front", 0, 2)],
      // Backline snipe across the whole field.
      [slotAnchor("player", "back", 1, 2), slotAnchor("enemy", "front", 0, 2)],
      // Cross-lane diagonal.
      [slotAnchor("player", "mid", 0, 1), slotAnchor("enemy", "back", 2, 3)],
      // Same-side geometry (heal positioning uses the same helper space).
      [slotAnchor("player", "back", 0, 2), slotAnchor("player", "front", 1, 2)],
    ];
    for (const [actor, target] of cases) {
      const pt = attackPoint(actor, target);
      expect(pointInRect(pt, slotBoxRect(target))).toBe(false);
      // On the segment: cross product ≈ 0 and between actor and target.
      const cross =
        (pt.x - actor.x) * (target.y - actor.y) -
        (pt.y - actor.y) * (target.x - actor.x);
      expect(Math.abs(cross)).toBeLessThan(1e-6);
      const dActor = Math.hypot(pt.x - actor.x, pt.y - actor.y);
      const dTarget = Math.hypot(pt.x - target.x, pt.y - target.y);
      const dFull = Math.hypot(target.x - actor.x, target.y - actor.y);
      expect(dActor).toBeLessThan(dFull);
      expect(dTarget).toBeGreaterThan(0);
      expect(dActor + dTarget).toBeCloseTo(dFull, 6);
    }
  });
});
