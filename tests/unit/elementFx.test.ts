// Unit tests for element-driven battle VFX (elementFx.ts).
// Guarantees: the pure treatment function covers all 18 elements ×
// all 11 atlas flipbooks; hue-rotation anchors land on the element hue
// (ice under vulkara rotates +165° to red); achromatic flipbooks
// (slash, spark) use the documented glow fallback and never rotate;
// the archetype gate keeps SUPPORT profiles (heal, shield_buff)
// theme-kept at profile-resolution level while every damage archetype
// is element-driven; burst palettes derive from the aura colours.
import { describe, it, expect } from "vitest";
import {
  FX_NATIVE_LOOK,
  elementBurstColors,
  fxTreatmentFor,
  hexToHue,
  isElementDrivenArchetype,
  mixWithWhite,
  profileFxElement,
} from "../../src/game/animation/elementFx";
import {
  getSkillProfile,
  type SkillArchetype,
} from "../../src/game/animation/skillProfiles";
import { ELEMENT_AURA } from "../../src/game/data/elementAura";
import { ELEMENTS, type ElementId } from "../../src/game/engine/elements";
import { getSkillsForClass } from "../../src/game/engine/arenaEngine";
import { CLASS_LIST } from "../../src/game/content/classes";
import atlasJson from "../../src/game/data/spriteAtlas.json";

const atlas = atlasJson as unknown as { fx: Record<string, unknown> };
const ALL_ELEMENT_IDS = Object.keys(ELEMENTS) as ElementId[];
const ALL_FX_KEYS = Object.keys(atlas.fx);

describe("elementFx — native look table", () => {
  it("covers exactly the flipbooks in the atlas", () => {
    expect(Object.keys(FX_NATIVE_LOOK).sort()).toEqual(
      [...ALL_FX_KEYS].sort(),
    );
    expect(ALL_FX_KEYS).toHaveLength(11);
    for (const key of ALL_FX_KEYS) {
      const look = FX_NATIVE_LOOK[key];
      expect(look.hue).toBeGreaterThanOrEqual(0);
      expect(look.hue).toBeLessThan(360);
      expect(look.saturation).toBeGreaterThanOrEqual(0);
      expect(look.saturation).toBeLessThanOrEqual(1);
    }
  });

  it("slash and spark are the documented glow-fallback flipbooks", () => {
    expect(FX_NATIVE_LOOK.slash.mode).toBe("glow");
    expect(FX_NATIVE_LOOK.slash.saturation).toBe(0);
    expect(FX_NATIVE_LOOK.spark.mode).toBe("glow");
    for (const key of ALL_FX_KEYS) {
      if (key === "slash" || key === "spark") continue;
      expect(FX_NATIVE_LOOK[key].mode, key).toBe("rotate");
    }
  });
});

describe("elementFx — hexToHue", () => {
  it("resolves primary hues and the aura palette anchors", () => {
    expect(hexToHue("#FF0000")).toBe(0);
    expect(hexToHue("#00FF00")).toBe(120);
    expect(hexToHue("#0000FF")).toBe(240);
    expect(hexToHue("#EF4444")).toBe(0); // vulkara aura red
    expect(hexToHue("#22D3EE")).toBeCloseTo(188, 0); // himara aura cyan
    expect(hexToHue("#808080")).toBe(0); // achromatic
  });
});

describe("elementFx — fxTreatmentFor", () => {
  it("produces a treatment for all 18 elements × all 11 flipbooks", () => {
    expect(ALL_ELEMENT_IDS).toHaveLength(18);
    for (const el of ALL_ELEMENT_IDS) {
      for (const key of ALL_FX_KEYS) {
        const t = fxTreatmentFor(key, el);
        expect(t.element, `${key}/${el}`).toBe(el);
        expect(t.color, `${key}/${el}`).toBe(ELEMENT_AURA[el]);
        expect(t.mode, `${key}/${el}`).toBe(FX_NATIVE_LOOK[key].mode);
        expect(t.filter.length, `${key}/${el}`).toBeGreaterThan(0);
        expect(t.filter, `${key}/${el}`).toContain(ELEMENT_AURA[el]);
      }
    }
  });

  it("anchor: ice under vulkara rotates +165° so its hue lands on red", () => {
    const t = fxTreatmentFor("ice", "vulkara");
    expect(t.mode).toBe("rotate");
    expect(t.hueRotateDeg).toBe(165);
    expect((195 + t.hueRotateDeg) % 360).toBe(hexToHue(ELEMENT_AURA.vulkara));
    expect(t.filter).toContain("hue-rotate(165deg)");
  });

  it("anchor: spark under himara uses the glow fallback, never rotates", () => {
    const t = fxTreatmentFor("spark", "himara");
    expect(t.mode).toBe("glow");
    expect(t.hueRotateDeg).toBe(0);
    expect(t.filter).not.toContain("hue-rotate");
    expect(t.filter).toContain("drop-shadow");
    expect(t.filter).toContain("#22D3EE"); // himara aura colour
  });

  it("slash is glow-treated under every element", () => {
    for (const el of ALL_ELEMENT_IDS) {
      const t = fxTreatmentFor("slash", el);
      expect(t.mode, el).toBe("glow");
      expect(t.filter, el).toContain(ELEMENT_AURA[el]);
    }
  });

  it("unknown flipbook keys fall back to a glow treatment (never throws)", () => {
    const t = fxTreatmentFor("no_such_fx", "magmara");
    expect(t.mode).toBe("glow");
    expect(t.color).toBe(ELEMENT_AURA.magmara);
  });
});

describe("elementFx — archetype gate (support stays theme-kept)", () => {
  it("only heal and shield_buff are theme-kept", () => {
    const kept: SkillArchetype[] = ["heal", "shield_buff"];
    const driven: SkillArchetype[] = [
      "basic_claw",
      "combo",
      "heavy_slam",
      "ranged_bolt",
      "aoe",
      "debuff",
      "drain",
      "ultimate",
    ];
    for (const a of kept) expect(isElementDrivenArchetype(a), a).toBe(false);
    for (const a of driven) expect(isElementDrivenArchetype(a), a).toBe(true);
  });

  const allSkills = CLASS_LIST.flatMap((c) =>
    getSkillsForClass(c.id).map((s) => ({ skill: s, classId: c.id })),
  );
  const profileOf = (skillId: string) => {
    const hit = allSkills.find((x) => x.skill.id === skillId);
    expect(hit, `skill ${skillId} exists`).toBeDefined();
    return getSkillProfile(hit!.skill, hit!.classId);
  };

  it("heal profile (mend_pearl) resolves to no driving element", () => {
    const p = profileOf("mend_pearl");
    expect(p.archetype).toBe("heal");
    expect(profileFxElement(p, "vulkara")).toBeNull();
  });

  it("shield profile (bulwark tide sigil) resolves to no driving element", () => {
    const sigil = allSkills.find(
      (x) => x.skill.id === "tide_sigil" && x.classId === "bulwark",
    )!;
    const p = getSkillProfile(sigil.skill, sigil.classId);
    expect(p.archetype).toBe("shield_buff");
    expect(profileFxElement(p, "himara")).toBeNull();
  });

  it("regen tide sigil (heal role) is also theme-kept", () => {
    const sigil = allSkills.find(
      (x) => x.skill.id === "tide_sigil" && x.classId === "shellmender",
    )!;
    const p = getSkillProfile(sigil.skill, sigil.classId);
    expect(p.archetype).toBe("heal");
    expect(profileFxElement(p, "nerala")).toBeNull();
  });

  it("damage profiles resolve to the attacker's element", () => {
    for (const id of ["claw_strike", "combo_pinch", "reaving_claw", "binding_tide", "tidal_burst", "golden_shower"]) {
      const p = profileOf(id);
      expect(profileFxElement(p, "obsidara"), id).toBe("obsidara");
    }
  });
});

describe("elementFx — burst colours", () => {
  it("mixWithWhite lightens toward white", () => {
    expect(mixWithWhite("#000000", 0.5)).toBe("#808080");
    expect(mixWithWhite("#EF4444", 0)).toBe("#ef4444");
    expect(mixWithWhite("#EF4444", 1)).toBe("#ffffff");
  });

  it("burst palette is the aura colour weighted against its tint", () => {
    for (const el of ALL_ELEMENT_IDS) {
      const colors = elementBurstColors(el);
      expect(colors, el).toHaveLength(3);
      expect(colors[0], el).toBe(ELEMENT_AURA[el]);
      expect(colors[2], el).toBe(ELEMENT_AURA[el]);
      expect(colors[1], el).toBe(mixWithWhite(ELEMENT_AURA[el], 0.45));
      for (const c of colors) expect(c, el).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
});
