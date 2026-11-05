// Unit tests for the pooled particle system.
// Pure logic testing — a seeded rng stub keeps rolls deterministic.
import { describe, it, expect } from "vitest";
import {
  PARTICLE_PRESETS,
  ParticleSystem,
} from "../../src/game/animation/particles";
import type { EmitterConfig } from "../../src/game/animation/particles";

/** Deterministic rng: always returns the midpoint of every range. */
const mid = () => 0.5;

const cfg: EmitterConfig = {
  rate: 10,
  lifetime: [1000, 1000],
  velocity: { x: [0, 0], y: [0, 0] },
  gravity: 0,
  size: [4, 4],
  colors: ["#ffffff"],
};

describe("ParticleSystem", () => {
  it("burst spawns the requested count", () => {
    const ps = new ParticleSystem(10, mid);
    expect(ps.spawnBurst(cfg, 5, 7, 3)).toBe(3);
    expect(ps.activeCount).toBe(3);
    const alive = ps.particles.filter((p) => p.alive);
    expect(alive[0].x).toBe(5);
    expect(alive[0].y).toBe(7);
  });

  it("burst never exceeds capacity and reuses dead slots", () => {
    const ps = new ParticleSystem(4, mid);
    expect(ps.spawnBurst(cfg, 0, 0, 10)).toBe(4);
    expect(ps.activeCount).toBe(4);
    expect(ps.particles.length).toBe(4);
    // Pool full: further bursts spawn nothing.
    expect(ps.spawnBurst(cfg, 0, 0, 3)).toBe(0);
    // Kill everything via lifetime, then slots are reusable.
    ps.update(1000);
    expect(ps.activeCount).toBe(0);
    expect(ps.spawnBurst(cfg, 0, 0, 2)).toBe(2);
    expect(ps.activeCount).toBe(2);
  });

  it("lifetime kills particles exactly when age reaches it", () => {
    const ps = new ParticleSystem(4, mid);
    ps.spawnBurst(cfg, 0, 0, 1);
    ps.update(999);
    expect(ps.activeCount).toBe(1);
    ps.update(1);
    expect(ps.activeCount).toBe(0);
  });

  it("gravity accelerates vy downward over time", () => {
    const gravityCfg: EmitterConfig = { ...cfg, gravity: 100, lifetime: [10000, 10000] };
    const ps = new ParticleSystem(4, mid);
    ps.spawnBurst(gravityCfg, 0, 0, 1);
    const p = ps.particles[0];
    expect(p.vy).toBe(0);
    ps.update(1000); // 1s at 100 px/s^2
    expect(p.vy).toBeCloseTo(100);
    expect(p.y).toBeCloseTo(100);
    ps.update(1000);
    expect(p.vy).toBeCloseTo(200);
  });

  it("negative gravity (bubbles) makes particles float up", () => {
    const ps = new ParticleSystem(4, mid);
    ps.spawnBurst({ ...cfg, gravity: -50, lifetime: [10000, 10000] }, 0, 100, 1);
    ps.update(1000);
    expect(ps.particles[0].vy).toBeCloseTo(-50);
    expect(ps.particles[0].y).toBeLessThan(100);
  });

  it("emitter accumulates fractional rate across updates", () => {
    // rate 10/s => one particle per 100ms; five 50ms updates = 2.5 owed
    // => 2 spawned, with 0.5 carried (proven by one more 50ms update).
    const ps = new ParticleSystem(20, mid);
    const handle = ps.emitter(cfg, 0, 0);
    for (let i = 0; i < 5; i++) ps.update(50);
    expect(ps.activeCount).toBe(2);
    ps.update(50);
    expect(ps.activeCount).toBe(3);
    handle.stop();
    ps.update(500);
    expect(ps.activeCount).toBe(3); // stopped: no new spawns
  });

  it("sizeEnd shrinks a particle over its lifetime", () => {
    const ps = new ParticleSystem(4, mid);
    ps.spawnBurst({ ...cfg, sizeEnd: 0 }, 0, 0, 1);
    const p = ps.particles[0];
    expect(p.size).toBe(4);
    ps.update(500); // halfway through its 1000ms life
    expect(p.size).toBeCloseTo(2);
  });

  it("clear kills all particles and stops emitters", () => {
    const ps = new ParticleSystem(8, mid);
    ps.emitter(cfg, 0, 0);
    ps.spawnBurst(cfg, 0, 0, 3);
    ps.clear();
    expect(ps.activeCount).toBe(0);
    ps.update(1000);
    expect(ps.activeCount).toBe(0);
  });

  it("ships the underwater preset set", () => {
    for (const name of [
      "bubbles",
      "splash",
      "sparks",
      "motes",
      "explosion",
      "heal",
      "trail",
    ]) {
      const preset = PARTICLE_PRESETS[name];
      expect(preset).toBeTruthy();
      expect(preset.rate).toBeGreaterThan(0);
      expect(preset.colors.length).toBeGreaterThan(0);
      expect(preset.lifetime[1]).toBeGreaterThanOrEqual(preset.lifetime[0]);
    }
    // Bubbles rise: buoyant (negative) gravity and upward velocity.
    expect(PARTICLE_PRESETS.bubbles.gravity).toBeLessThan(0);
    expect(PARTICLE_PRESETS.bubbles.velocity.y[1]).toBeLessThan(0);
  });
});
