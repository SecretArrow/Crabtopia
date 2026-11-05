// Unit tests for the tactical formation engine (engine/formation.ts),
// team availability rules (engine/teamEligibility.ts) and the shared team
// stats summary (engine/teams.ts teamStatsSummary).
import { describe, it, expect } from "vitest";
import {
  FORMATION_PRESETS,
  applyFormationPreset,
  cellOf,
  crabAtCell,
  deriveFormationForCrabs,
  flattenFormation,
  formationFromOrder,
  lanesFromFormation,
  moveCrabToRow,
  placeAtCell,
  resolveTeamFormation,
  rowOf,
  swapCrabs,
  validateFormation,
} from "../../src/game/engine/formation";
import {
  firstAvailableTeam,
  insufficientRosterMessage,
  rosterSufficiency,
  teamAvailability,
} from "../../src/game/engine/teamEligibility";
import { teamStatsSummary } from "../../src/game/engine/teams";
import { generateCrab } from "../../src/game/engine/crabs";
import type { ClassId, Crab, Team } from "../../src/game/types";

const IDS = ["a", "b", "c", "d", "e"];

function crab(classId: ClassId, seed: number): Crab {
  return generateCrab({ classId, seed, ownerId: "player" });
}

const team = (partial: Partial<Team>): Team => ({
  id: "t1",
  name: "Test",
  crabIds: IDS,
  createdAt: 0,
  ...partial,
});

describe("formation presets", () => {
  it("every preset distributes exactly 5 members across rows", () => {
    for (const p of Object.values(FORMATION_PRESETS)) {
      expect(p.rows.front + p.rows.mid + p.rows.back).toBe(5);
    }
  });

  it("formationFromOrder slices by preset row sizes", () => {
    expect(formationFromOrder(IDS, "balanced")).toEqual({
      front: ["a", "b"],
      mid: ["c"],
      back: ["d", "e"],
    });
    expect(formationFromOrder(IDS, "offensive")).toEqual({
      front: ["a", "b", "c"],
      mid: ["d"],
      back: ["e"],
    });
    expect(formationFromOrder(IDS, "frontline")).toEqual({
      front: ["a", "b", "c"],
      mid: ["d", "e"],
      back: [],
    });
    expect(formationFromOrder(IDS, "backline")).toEqual({
      front: ["a"],
      mid: ["b"],
      back: ["c", "d", "e"],
    });
  });

  it("applyFormationPreset preserves deployment order, changes only row sizes", () => {
    const start = formationFromOrder(IDS, "balanced");
    const offensive = applyFormationPreset(start, "offensive");
    expect(flattenFormation(offensive)).toEqual(IDS);
    expect(offensive.front).toHaveLength(3);
  });
});

describe("validateFormation / rowOf", () => {
  const f = formationFromOrder(IDS, "balanced");

  it("accepts a formation covering exactly the team members", () => {
    expect(validateFormation(f, IDS)).toBe(true);
  });

  it("rejects duplicates, strangers and short formations", () => {
    expect(
      validateFormation({ front: ["a", "a"], mid: ["c"], back: ["d", "e"] }, IDS)
    ).toBe(false);
    expect(
      validateFormation({ front: ["a", "b"], mid: ["c"], back: ["d", "z"] }, IDS)
    ).toBe(false);
    expect(
      validateFormation({ front: ["a", "b"], mid: ["c"], back: ["d"] }, IDS)
    ).toBe(false);
  });

  it("rowOf finds each member's row", () => {
    expect(rowOf(f, "a")).toBe("front");
    expect(rowOf(f, "c")).toBe("mid");
    expect(rowOf(f, "e")).toBe("back");
    expect(rowOf(f, "zzz")).toBeNull();
  });
});

describe("free placement — cellOf / placeAtCell / lanesFromFormation", () => {
  const f = formationFromOrder(IDS, "balanced");

  it("cellOf reports the row + lane a crab occupies", () => {
    // Balanced preset: front=[a,b], mid=[c], back=[d,e]. Lanes are the
    // index within the row array (0,1,...).
    expect(cellOf(f, "a")).toEqual({ row: "front", lane: 0 });
    expect(cellOf(f, "b")).toEqual({ row: "front", lane: 1 });
    expect(cellOf(f, "c")).toEqual({ row: "mid", lane: 0 });
    expect(cellOf(f, "d")).toEqual({ row: "back", lane: 0 });
    expect(cellOf(f, "e")).toEqual({ row: "back", lane: 1 });
    expect(cellOf(f, "zzz")).toBeNull();
  });

  it("crabAtCell looks up the occupant of a (row, lane) cell", () => {
    expect(crabAtCell(f, "front", 0)).toBe("a");
    expect(crabAtCell(f, "front", 1)).toBe("b");
    expect(crabAtCell(f, "back", 1)).toBe("e");
    expect(crabAtCell(f, "mid", 5)).toBeNull();
    expect(crabAtCell(f, "back", 2)).toBeNull();
  });

  it("placeAtCell moves a crab to a chosen lane in a new row", () => {
    // Place "a" (front lane 0) into back lane 2 — a gap cell.
    const placed = placeAtCell(f, "a", "back", 2);
    expect(rowOf(placed, "a")).toBe("back");
    // The crab's lane within the back row reflects the chosen cell.
    const cell = cellOf(placed, "a");
    expect(cell?.row).toBe("back");
    // Formation stays valid (same 5 members, once each).
    expect(validateFormation(placed, IDS)).toBe(true);
  });

  it("placeAtCell is pure — original formation is untouched", () => {
    const before = JSON.parse(JSON.stringify(f));
    placeAtCell(f, "a", "back", 3);
    expect(JSON.parse(JSON.stringify(f))).toEqual(before);
  });

  it("lanesFromFormation maps each crab to its lane within its row", () => {
    const lanes = lanesFromFormation(f);
    expect(lanes["a"]).toBe(0);
    expect(lanes["b"]).toBe(1);
    expect(lanes["c"]).toBe(0);
    expect(lanes["d"]).toBe(0);
    expect(lanes["e"]).toBe(1);
  });

  it("a crab placed at a high lane keeps a stable lane assignment via lanesFromFormation", () => {
    // Place "a" into back lane 4, then read lanes from the result. The packed
    // formation records membership order (not the free-placement gap): with
    // back=[d,e] already present, "a" appends as the third member (index 2).
    // The actual free-placement cell (lane 4) is carried separately by the
    // deployment board's lanes map into initBattle's playerLanes.
    const placed = placeAtCell(f, "a", "back", 4);
    const lanes = lanesFromFormation(placed);
    expect(rowOf(placed, "a")).toBe("back");
    expect(lanes["a"]).toBe(2);
    expect(validateFormation(placed, IDS)).toBe(true);
  });
});

describe("moveCrabToRow / swapCrabs", () => {
  const f = formationFromOrder(IDS, "balanced");
  it("moving a crab keeps exactly the same 5 members", () => {
    const moved = moveCrabToRow(f, "a", "back");
    expect(rowOf(moved, "a")).toBe("back");
    expect(validateFormation(moved, IDS)).toBe(true);
    // original untouched (pure)
    expect(rowOf(f, "a")).toBe("front");
  });

  it("swapping crosses rows and stays valid", () => {
    const swapped = swapCrabs(f, "a", "e");
    expect(rowOf(swapped, "a")).toBe("back");
    expect(rowOf(swapped, "e")).toBe("front");
    expect(validateFormation(swapped, IDS)).toBe(true);
  });

  it("swapping WITHIN one row trades positions without duplicating or losing crabs", () => {
    // Regression: two sequential maps on the same row array used to turn
    // [a, b] into [b, b] then [a, a] — erasing one crab and duplicating the
    // other. A same-row swap must be a single-pass position trade.
    const swapped = swapCrabs(f, "a", "b"); // both in front
    expect(swapped.front).toEqual(["b", "a"]);
    expect(rowOf(swapped, "a")).toBe("front");
    expect(rowOf(swapped, "b")).toBe("front");
    expect(validateFormation(swapped, IDS)).toBe(true);
    // Original untouched (pure).
    expect(f.front).toEqual(["a", "b"]);
    // Same-row swap in the back row too.
    const swappedBack = swapCrabs(f, "d", "e");
    expect(swappedBack.back).toEqual(["e", "d"]);
    expect(validateFormation(swappedBack, IDS)).toBe(true);
  });
});

describe("resolveTeamFormation", () => {
  it("derives from slot order + balanced preset for legacy teams", () => {
    expect(resolveTeamFormation(team({}))).toEqual(
      formationFromOrder(IDS, "balanced")
    );
  });

  it("honours the saved preset when deriving", () => {
    expect(resolveTeamFormation(team({ formationPreset: "backline" }))).toEqual(
      formationFromOrder(IDS, "backline")
    );
  });

  it("uses a stored formation when it still matches the members", () => {
    const stored = { front: ["e"], mid: ["d", "c"], back: ["b", "a"] };
    expect(resolveTeamFormation(team({ formation: stored }))).toEqual(stored);
  });

  it("ignores a stale stored formation (member replaced)", () => {
    const stored = { front: ["e"], mid: ["d", "c"], back: ["b", "a"] };
    const t = team({ formation: stored, crabIds: ["a", "b", "c", "d", "x"] });
    expect(resolveTeamFormation(t)).toEqual(
      formationFromOrder(["a", "b", "c", "d", "x"], "balanced")
    );
  });
});

describe("deriveFormationForCrabs", () => {
  it("puts tanks in front and casters/healers in back", () => {
    const crabs = [
      crab("shellmender", 11),
      crab("tidecaller", 12),
      crab("bulwark", 13),
      crab("reaver", 14),
      crab("pincher", 15),
    ];
    const f = deriveFormationForCrabs(crabs, "balanced");
    expect(f.front).toContain(crabs[2].id); // bulwark
    expect(f.back).toContain(crabs[0].id); // shellmender
    expect(f.back).toContain(crabs[1].id); // tidecaller
    expect(validateFormation(f, crabs.map((c) => c.id))).toBe(true);
  });
});

describe("teamAvailability", () => {
  function roster(): Map<string, Crab> {
    const classes: ClassId[] = ["bulwark", "reaver", "skitter", "tidecaller", "shellmender"];
    const m = new Map<string, Crab>();
    IDS.forEach((id, i) => {
      const c = crab(classes[i], 100 + i);
      m.set(id, { ...c, id });
    });
    return m;
  }

  it("a full idle team is available with no reasons", () => {
    const a = teamAvailability(team({}), roster());
    expect(a.available).toBe(true);
    expect(a.reasons).toEqual([]);
    expect(a.filledCount).toBe(5);
  });

  it("an incomplete team reports how many crabs are missing", () => {
    const a = teamAvailability(team({ crabIds: ["a", "b", "", "", ""] }), roster());
    expect(a.available).toBe(false);
    expect(a.reasons.join(" ")).toMatch(/3 more crabs/);
  });

  it("a busy member blocks the team and is named with its activity", () => {
    const m = roster();
    const busy = m.get("c")!;
    m.set("c", { ...busy, activity: "diving" });
    const a = teamAvailability(team({}), m);
    expect(a.available).toBe(false);
    expect(a.reasons.join(" ")).toContain(busy.name);
    expect(a.reasons.join(" ")).toContain("dive");
  });

  it("requireIdle=false ignores member activities", () => {
    const m = roster();
    const busy = m.get("c")!;
    m.set("c", { ...busy, activity: "diving" });
    expect(teamAvailability(team({}), m, { requireIdle: false }).available).toBe(true);
  });

  it("firstAvailableTeam skips blocked teams", () => {
    const m = roster();
    const busy = m.get("a")!;
    m.set("a", { ...busy, activity: "raiding" });
    const t1 = team({ id: "blocked" });
    const t2 = team({ id: "also-blocked", crabIds: ["b", "c", "d", "e", "a"] });
    // Both teams contain the busy crab → nothing is available.
    expect(firstAvailableTeam([t1, t2], m)).toBeNull();
    // Once the crab is idle again, the first team in saved order wins.
    const m2 = new Map(m);
    m2.set("a", { ...busy, activity: "idle" });
    expect(firstAvailableTeam([t1, t2], m2)?.id).toBe("blocked");
  });
});

describe("teamStatsSummary", () => {
  it("aggregates stats and power from the live crabs", () => {
    const crabs = [crab("bulwark", 1), crab("reaver", 2), crab("skitter", 3), crab("tidecaller", 4), crab("shellmender", 5)];
    const s = teamStatsSummary(crabs);
    expect(s.count).toBe(5);
    expect(s.totalAttack).toBe(crabs.reduce((n, c) => n + c.stats.attack, 0));
    expect(s.totalHp).toBe(crabs.reduce((n, c) => n + c.stats.hp, 0));
    expect(s.power).toBeGreaterThan(0);
  });

  it("reflects edits immediately (stats are recomputed, never cached)", () => {
    const crabs = [crab("bulwark", 1), crab("reaver", 2), crab("skitter", 3), crab("tidecaller", 4), crab("shellmender", 5)];
    const before = teamStatsSummary(crabs).totalAttack;
    const edited = crabs.map((c, i) =>
      i === 0 ? { ...c, stats: { ...c.stats, attack: c.stats.attack + 50 } } : c
    );
    expect(teamStatsSummary(edited).totalAttack).toBe(before + 50);
  });
});

describe("rosterSufficiency (insufficient-crabs detection)", () => {
  const roster = (n: number): Crab[] =>
    Array.from({ length: n }, (_, i) => crab("bulwark", 7000 + i));

  it("0 owned → needs 5, insufficient", () => {
    const s = rosterSufficiency([]);
    expect(s).toEqual({
      ownedCount: 0,
      idleCount: 0,
      neededForFullTeam: 5,
      insufficient: true,
    });
  });

  it("4 owned → needs exactly 1 more", () => {
    const s = rosterSufficiency(roster(4));
    expect(s.neededForFullTeam).toBe(1);
    expect(s.insufficient).toBe(true);
  });

  it("5 owned → sufficient, needs 0", () => {
    const s = rosterSufficiency(roster(5));
    expect(s.neededForFullTeam).toBe(0);
    expect(s.insufficient).toBe(false);
  });

  it("more than 5 owned → still sufficient", () => {
    expect(rosterSufficiency(roster(8)).insufficient).toBe(false);
  });

  it("insufficiency is about OWNED crabs, not idle ones", () => {
    // 5 owned but 3 busy: roster is sufficient (busy is a different problem).
    const busy = roster(5).map((c, i) =>
      i < 3 ? { ...c, activity: "diving" as Crab["activity"] } : c
    );
    const s = rosterSufficiency(busy);
    expect(s.ownedCount).toBe(5);
    expect(s.idleCount).toBe(2);
    expect(s.insufficient).toBe(false);
  });

  it("message states the concrete missing count and clears at 5", () => {
    expect(insufficientRosterMessage(roster(3))).toBe(
      "You need 2 more crabs to field a full team of 5."
    );
    expect(insufficientRosterMessage(roster(4))).toBe(
      "You need 1 more crab to field a full team of 5."
    );
    expect(insufficientRosterMessage(roster(5))).toBeNull();
  });
});
