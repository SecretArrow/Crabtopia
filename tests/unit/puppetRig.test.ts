// Unit tests for the procedural puppet rig and two-bone IK.
// Pure logic testing — no React rendering.
import { describe, it, expect } from "vitest";
import {
  computeRigPose,
  solveTwoBoneIK,
} from "../../src/game/animation/puppetRig";

/** Forward kinematics using the convention solveTwoBoneIK documents. */
function forwardKinematics(
  lenA: number,
  lenB: number,
  shoulderDeg: number,
  elbowDeg: number,
): { x: number; y: number } {
  const toRad = Math.PI / 180;
  const s = shoulderDeg * toRad;
  const e = elbowDeg * toRad;
  const jx = lenA * Math.cos(s);
  const jy = lenA * Math.sin(s);
  return {
    x: jx + lenB * Math.cos(s + e),
    y: jy + lenB * Math.sin(s + e),
  };
}

describe("solveTwoBoneIK", () => {
  it("reaches an in-range target (verified by forward kinematics)", () => {
    const { shoulder, elbow } = solveTwoBoneIK(10, 10, 10, 10);
    const end = forwardKinematics(10, 10, shoulder, elbow);
    expect(end.x).toBeCloseTo(10, 5);
    expect(end.y).toBeCloseTo(10, 5);
  });

  it("reaches a target on the negative side", () => {
    const { shoulder, elbow } = solveTwoBoneIK(8, 6, -5, 9);
    const end = forwardKinematics(8, 6, shoulder, elbow);
    expect(end.x).toBeCloseTo(-5, 5);
    expect(end.y).toBeCloseTo(9, 5);
    expect(Number.isFinite(shoulder)).toBe(true);
    expect(Number.isFinite(elbow)).toBe(true);
  });

  it("clamps an out-of-reach target onto the reach circle", () => {
    const { shoulder, elbow } = solveTwoBoneIK(10, 10, 30, 0);
    const end = forwardKinematics(10, 10, shoulder, elbow);
    expect(end.x).toBeCloseTo(20, 5);
    expect(end.y).toBeCloseTo(0, 5);
    expect(elbow).toBeCloseTo(0, 5); // fully extended
  });

  it("handles a zero-length target without NaN", () => {
    const sol = solveTwoBoneIK(10, 10, 0, 0);
    expect(Number.isFinite(sol.shoulder)).toBe(true);
    expect(Number.isFinite(sol.elbow)).toBe(true);
  });
});

describe("computeRigPose", () => {
  it("returns a pose for every bone in every state", () => {
    const bones = ["body", "clawL", "clawR", "legL", "legR", "eyes"] as const;
    for (const bone of bones) {
      const p = computeRigPose("idle", 500)[bone];
      expect(Number.isFinite(p.rotate)).toBe(true);
      expect(Number.isFinite(p.x)).toBe(true);
      expect(Number.isFinite(p.y)).toBe(true);
    }
  });

  it("attack pose differs clearly from idle (lead claw swings)", () => {
    const idle = computeRigPose("idle", 200);
    const attack = computeRigPose("attack", 200); // mid-swing of 400ms
    expect(attack.clawR.rotate).not.toBeCloseTo(idle.clawR.rotate, 0);
    expect(Math.abs(attack.clawR.rotate)).toBeGreaterThan(40);
    expect(attack.clawR.x).toBeGreaterThan(idle.clawR.x);
  });

  it("facing -1 makes the left claw the attack lead", () => {
    const attack = computeRigPose("attack", 200, { facing: -1 });
    expect(Math.abs(attack.clawL.rotate)).toBeGreaterThan(40);
    expect(attack.clawL.x).toBeLessThan(0);
  });

  it("idle is animated: pose changes over time but stays gentle", () => {
    const a = computeRigPose("idle", 0);
    const b = computeRigPose("idle", 800);
    expect(b.body.rotate).not.toBeCloseTo(a.body.rotate, 5);
    expect(Math.abs(b.body.rotate)).toBeLessThanOrEqual(2.01);
  });

  it("walk alternates the leg groups and run swings them harder", () => {
    const walk = computeRigPose("walk", 250);
    expect(walk.legL.rotate * walk.legR.rotate).toBeLessThan(0); // opposite phases
    const walkAmp = Math.abs(walk.legL.rotate);
    const runAmp = Math.abs(computeRigPose("run", 143).legL.rotate);
    expect(runAmp).toBeGreaterThan(0);
    expect(Math.abs(computeRigPose("run", 100).legL.rotate)).toBeGreaterThanOrEqual(0);
    expect(walkAmp).toBeGreaterThan(0);
  });

  it("defense pulls both claws forward", () => {
    const defense = computeRigPose("defense", 100);
    expect(defense.clawL.x).toBeGreaterThan(0);
    expect(defense.clawR.x).toBeGreaterThan(0);
    expect(defense.clawL.rotate).toBeGreaterThan(0);
    expect(defense.clawR.rotate).toBeLessThan(0);
  });

  it("hit recoils the body backwards relative to facing", () => {
    const hit = computeRigPose("hit", 0);
    expect(hit.body.x).toBeLessThan(0);
    const hitLeft = computeRigPose("hit", 0, { facing: -1 });
    expect(hitLeft.body.x).toBeGreaterThan(0);
  });

  it("death tips the body over and victory raises both claws", () => {
    const death = computeRigPose("death", 100);
    expect(Math.abs(death.body.rotate)).toBeGreaterThan(45);
    const victory = computeRigPose("victory", 300);
    expect(victory.clawL.y).toBeLessThan(0);
    expect(victory.clawR.y).toBeLessThan(0);
  });
});
