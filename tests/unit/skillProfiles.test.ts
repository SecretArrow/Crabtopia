// Unit tests for the skill presentation profiles (skill overhaul).
// Guarantees: every skill in the game data resolves to a profile; the
// profile only references flipbooks/particle presets that actually exist;
// archetypes differ on their key fields (projectile only on ranged bolts,
// shake only on heavy/ultimate, repeats only on combos); the Tide Sigil
// differs per caster role; projectile path math is correct.
import { describe, it, expect } from "vitest";
import {
  getSkillProfile,
  projectilePointAt,
} from "../../src/game/animation/skillProfiles";
import { PARTICLE_PRESETS } from "../../src/game/animation/particles";
import { getSkillsForClass } from "../../src/game/engine/arenaEngine";
import { CLASS_LIST } from "../../src/game/content/classes";
import atlasJson from "../../src/game/data/spriteAtlas.json";

const atlas = atlasJson as unknown as {
  fx: Record<string, unknown>;
};

const ALL_STATES = [
  "idle", "walk", "run", "attack", "combo", "skill", "defense",
  "hit", "dodge", "jump", "fall", "victory", "death",
];

describe("skillProfiles — coverage", () => {
  it("every skill of every class resolves to a complete, valid profile", () => {
    for (const cls of CLASS_LIST) {
      const skills = getSkillsForClass(cls.id);
      expect(skills.length).toBe(3);
      for (const skill of skills) {
        const p = getSkillProfile(skill, cls.id);
        expect(p.skillId, `${cls.id}/${skill.id}`).toBe(skill.id);
        expect(p.archetype).toBeTruthy();
        expect(ALL_STATES).toContain(p.attackerAnim);
        // Impact flipbook must exist in the atlas.
        expect(atlas.fx[p.fx], `${skill.id} fx ${p.fx}`).toBeDefined();
        // Particle preset must exist when defined.
        if (p.particles) {
          expect(
            PARTICLE_PRESETS[p.particles.preset],
            `${skill.id} preset ${p.particles.preset}`,
          ).toBeDefined();
          expect(p.particles.count).toBeGreaterThan(0);
        }
        // Projectile flipbook must exist when defined.
        if (p.projectile) {
          expect(atlas.fx[p.projectile.fx]).toBeDefined();
          expect(p.projectile.durationMs).toBeGreaterThan(0);
        }
        expect(p.elementColor).toMatch(/^#[0-9A-Fa-f]{6}$/);
        expect(p.label.length).toBeGreaterThan(0);
      }
    }
  });

  it("no two class special skills share the exact same profile signature", () => {
    const signatures = new Map<string, string>();
    for (const cls of CLASS_LIST) {
      const special = getSkillsForClass(cls.id)[1];
      const p = getSkillProfile(special, cls.id);
      const sig = [
        p.archetype,
        p.attackerAnim,
        p.attackerSpeed,
        p.fx,
        p.fxRepeats,
        p.particles?.preset ?? "-",
        p.projectile?.fx ?? "-",
        p.shake,
      ].join("|");
      expect(signatures.has(sig), `${cls.id} duplicates ${signatures.get(sig)}`).toBe(false);
      signatures.set(sig, cls.id);
    }
  });
});

describe("skillProfiles — archetype key fields", () => {
  const byId = (classId: Parameters<typeof getSkillsForClass>[0], idx: number) =>
    getSkillsForClass(classId)[idx];

  it("basic claw: melee, no projectile, no shake", () => {
    const p = getSkillProfile(byId("reaver", 0), "reaver");
    expect(p.archetype).toBe("basic_claw");
    expect(p.attackerAnim).toBe("attack");
    expect(p.projectile).toBeNull();
    expect(p.shake).toBe("none");
    expect(p.fxRepeats).toBe(1);
  });

  it("combo skills: combo clip, faster playback, repeated impacts", () => {
    const pinch = getSkillProfile(byId("pincher", 1), "pincher");
    expect(pinch.archetype).toBe("combo");
    expect(pinch.attackerAnim).toBe("combo");
    expect(pinch.fxRepeats).toBeGreaterThan(1);
    expect(pinch.attackerSpeed).toBeGreaterThan(1);
    const ripple = getSkillProfile(byId("skitter", 1), "skitter");
    expect(ripple.archetype).toBe("combo");
    expect(ripple.attackerSpeed).toBeGreaterThan(pinch.attackerSpeed);
    expect(ripple.fx).not.toBe(pinch.fx);
  });

  it("heavy slams: jump clip + shake; only the AoE slam shakes heavy", () => {
    const slam = getSkillProfile(byId("bulwark", 1), "bulwark");
    expect(slam.archetype).toBe("heavy_slam");
    expect(slam.attackerAnim).toBe("jump");
    expect(slam.shake).toBe("heavy");
    const reave = getSkillProfile(byId("reaver", 1), "reaver");
    expect(reave.archetype).toBe("heavy_slam");
    expect(reave.shake).toBe("light");
  });

  it("ranged bolt: projectile with travel time; freeze bolt uses ice", () => {
    const bolt = getSkillProfile(byId("warden", 1), "warden");
    expect(bolt.archetype).toBe("ranged_bolt");
    expect(bolt.projectile).not.toBeNull();
    expect(bolt.projectile?.fx).toBe("ice");
    expect(bolt.fx).toBe("ice");
  });

  it("heal / ultimate archetypes resolve distinctly", () => {
    const heal = getSkillProfile(byId("shellmender", 1), "shellmender");
    expect(heal.archetype).toBe("heal");
    expect(heal.fx).toBe("heal");
    const ult = getSkillProfile(byId("gildclaw", 1), "gildclaw");
    expect(ult.archetype).toBe("ultimate");
    expect(ult.shake).toBe("light");
  });

  it("tide sigil differs per caster role", () => {
    const sigil = (c: Parameters<typeof getSkillsForClass>[0]) =>
      getSkillProfile(getSkillsForClass(c)[2], c);
    expect(sigil("bulwark").archetype).toBe("shield_buff");
    expect(sigil("bulwark").particles?.at).toBe("actor");
    expect(sigil("shellmender").archetype).toBe("heal");
    expect(sigil("tidecaller").archetype).toBe("debuff");
    expect(sigil("tidecaller").fx).toBe("dark");
    expect(sigil("warden").archetype).toBe("ranged_bolt");
    expect(sigil("warden").projectile).not.toBeNull();
    expect(sigil("reaver").archetype).toBe("debuff");
    expect(sigil("reaver").fx).toBe("spark");
    expect(sigil("reaver").fx).not.toBe(sigil("tidecaller").fx);
  });

  it("regen_tick (end-of-round synthetic action) has a heal profile", () => {
    const p = getSkillProfile(
      {
        id: "regen_tick",
        name: "Regen",
        energyCost: 0,
        cooldown: 0,
        power: 0,
        targetType: "self",
        description: "",
        visual: "heal_pearl",
      },
      "shellmender",
    );
    expect(p.archetype).toBe("heal");
  });
});

describe("projectilePointAt", () => {
  const from = { x: 10, y: 100 };
  const to = { x: 210, y: 100 };

  it("starts at the attacker and lands exactly on the target", () => {
    expect(projectilePointAt(from, to, 0, 40)).toEqual({ x: 10, y: 100 });
    expect(projectilePointAt(from, to, 1, 40)).toEqual({ x: 210, y: 100 });
  });

  it("arcs upward mid-flight and clamps outside [0,1]", () => {
    const mid = projectilePointAt(from, to, 0.5, 40);
    expect(mid.x).toBe(110);
    expect(mid.y).toBe(60); // 100 - sin(pi/2)*40
    expect(projectilePointAt(from, to, -2, 40)).toEqual({ x: 10, y: 100 });
    expect(projectilePointAt(from, to, 3, 40)).toEqual({ x: 210, y: 100 });
  });

  it("zero arc height is a straight line", () => {
    expect(projectilePointAt(from, to, 0.5, 0)).toEqual({ x: 110, y: 100 });
  });
});
