// Unit tests for the element aura palette (data/elementAura.ts).
// The aura layer makes a crab's element readable from the character's
// own presentation (glow behind the art; the art itself stays clean).
// Locks: all 18 elements mapped, valid hex colours, every colour
// bright enough to actually glow (WCAG relative luminance floor —
// near-black badge colours like Andhakara's MUST use their documented
// brightened aura variant), the brightened set is exactly the four
// documented exceptions, and crab resolution reuses elementOf
// (stored element wins, legacy resolver otherwise).
import { describe, it, expect } from "vitest";
import {
  ELEMENT_AURA,
  AURA_BRIGHTENED,
  auraForElement,
  auraForCrab,
} from "../../src/game/data/elementAura";
import {
  ELEMENTS,
  ELEMENT_LIST,
  elementOf,
  type ElementId,
} from "../../src/game/engine/elements";
import type { Crab } from "../../src/game/types";

/** WCAG 2.x relative luminance of a #RRGGBB colour (0 = black). */
function relativeLuminance(hex: string): number {
  const channel = (i: number): number => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

const MIN_GLOW_LUMINANCE = 0.12;

describe("elementAura — palette completeness", () => {
  it("maps every one of the 18 elements to an aura colour", () => {
    expect(ELEMENT_LIST).toHaveLength(18);
    expect(Object.keys(ELEMENT_AURA).sort()).toEqual(
      ELEMENT_LIST.map((e) => e.id).sort(),
    );
    for (const el of ELEMENT_LIST) {
      expect(auraForElement(el.id), el.id).toBe(ELEMENT_AURA[el.id]);
    }
  });

  it("every aura colour is a valid 6-digit hex colour", () => {
    for (const el of ELEMENT_LIST) {
      expect(ELEMENT_AURA[el.id], el.id).toMatch(/^#[0-9A-F]{6}$/);
    }
  });
});

describe("elementAura — no invisible glows", () => {
  it("every aura colour clears the minimum glow luminance", () => {
    for (const el of ELEMENT_LIST) {
      expect(
        relativeLuminance(ELEMENT_AURA[el.id]),
        `${el.id} aura must be bright enough to glow`,
      ).toBeGreaterThanOrEqual(MIN_GLOW_LUMINANCE);
    }
  });

  it("the dark badge colours (andhakara, obsidara) use brightened aura variants", () => {
    for (const id of ["andhakara", "obsidara"] as ElementId[]) {
      // The badge colours themselves are below the glow floor…
      expect(relativeLuminance(ELEMENTS[id].color), `${id} badge`).toBeLessThan(
        MIN_GLOW_LUMINANCE,
      );
      // …so their aura colours must differ and clear it.
      expect(ELEMENT_AURA[id]).not.toBe(ELEMENTS[id].color);
      expect(relativeLuminance(ELEMENT_AURA[id])).toBeGreaterThanOrEqual(
        MIN_GLOW_LUMINANCE,
      );
    }
  });

  it("exactly the four documented elements deviate from their badge colour", () => {
    expect([...AURA_BRIGHTENED].sort()).toEqual(
      ["andhakara", "bentala", "lodara", "obsidara"].sort(),
    );
    for (const el of ELEMENT_LIST) {
      if (AURA_BRIGHTENED.includes(el.id)) {
        expect(ELEMENT_AURA[el.id], el.id).not.toBe(el.color);
      } else {
        expect(ELEMENT_AURA[el.id], `${el.id} aura == badge colour`).toBe(
          el.color,
        );
      }
    }
  });
});

describe("elementAura — crab resolution reuses elementOf", () => {
  it("a stored element wins for the aura, exactly like the badge", () => {
    const crab = {
      classId: "warden",
      faction: "frostshelf",
      breedId: "frost_warden",
      element: "obsidara",
    } as never as Crab;
    expect(elementOf(crab)).toBe("obsidara");
    expect(auraForCrab(crab)).toBe(ELEMENT_AURA.obsidara);
    // And it is the BRIGHTENED obsidara, not the near-black badge tone.
    expect(auraForCrab(crab)).not.toBe(ELEMENTS.obsidara.color);
  });

  it("legacy crabs resolve through the deterministic resolver", () => {
    const legacy = {
      classId: "warden",
      faction: "frostshelf",
      breedId: "frost_warden",
    } as never as Crab;
    expect(elementOf(legacy)).toBe("himara");
    expect(auraForCrab(legacy)).toBe(ELEMENT_AURA.himara);
  });

  it("the gildclaw absolute (Waja) carries through to the aura", () => {
    const gild = {
      classId: "gildclaw",
      faction: "cinderreef",
      breedId: "cinder_gildclaw",
    } as never as Crab;
    expect(auraForCrab(gild)).toBe(ELEMENT_AURA.waja);
  });
});
