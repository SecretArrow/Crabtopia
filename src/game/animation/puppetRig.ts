// Crabtopia - Procedural puppet rig (pure, unit-testable).
//
// For crabs WITHOUT a dedicated sprite sheet, the renderer assembles a
// puppet from parts (body, two claws, two leg groups, eyes) and poses it
// with computeRigPose(): smooth sine-based poses per animation state,
// computed from the time spent in that state. No DOM, no allocation
// beyond the returned pose object.
//
// Pose units: rotate in degrees (positive = clockwise on screen),
// x/y in px offsets from the bone's rest position, scale unitless.
import type { AnimState } from "./stateMachine";

export type BoneId = "body" | "clawL" | "clawR" | "legL" | "legR" | "eyes";

export interface BonePose {
  rotate: number;
  x: number;
  y: number;
  scale?: number;
}

export type RigPose = Record<BoneId, BonePose>;

function pose(rotate: number, x: number, y: number, scale = 1): BonePose {
  return { rotate, x, y, scale };
}

function restPose(): RigPose {
  return {
    body: pose(0, 0, 0),
    clawL: pose(0, 0, 0),
    clawR: pose(0, 0, 0),
    legL: pose(0, 0, 0),
    legR: pose(0, 0, 0),
    eyes: pose(0, 0, 0),
  };
}

/** One-shot progress helper: 0..1 clamped, with a snap curve. */
function onceProgress(tMs: number, durationMs: number): number {
  return Math.min(1, Math.max(0, tMs / durationMs));
}

/**
 * Pose for `state` at `tMs` milliseconds into that state.
 * opts.facing (1 = facing right, -1 = facing left) picks the lead claw
 * for attacks and the direction of recoils/dodges.
 */
export function computeRigPose(
  state: AnimState,
  tMs: number,
  opts: { facing?: 1 | -1 } = {},
): RigPose {
  const facing: 1 | -1 = opts.facing === -1 ? -1 : 1;
  const t = Math.max(0, tMs) / 1000; // seconds
  const out = restPose();
  // Lead claw = the claw on the side the crab faces.
  const lead: BoneId = facing === 1 ? "clawR" : "clawL";
  const off: BoneId = facing === 1 ? "clawL" : "clawR";

  switch (state) {
    case "idle": {
      const sway = Math.sin(t * 2);
      out.body = pose(2 * sway, 0, 1.5 * Math.sin(t * 2 + 1));
      // Claws gently open/close, mirrored.
      out.clawL = pose(-6 - 4 * Math.sin(t * 1.6), -1, 0);
      out.clawR = pose(6 + 4 * Math.sin(t * 1.6), 1, 0);
      out.eyes = pose(0, 1.5 * Math.sin(t * 0.7), 0);
      break;
    }
    case "walk": {
      const step = Math.sin(t * 6);
      out.legL = pose(18 * step, 0, 0);
      out.legR = pose(-18 * step, 0, 0);
      out.body = pose(3 * step, 0, -2 * Math.abs(Math.cos(t * 6)));
      out.clawL = pose(-6 + 5 * step, 0, 0);
      out.clawR = pose(6 - 5 * step, 0, 0);
      break;
    }
    case "run": {
      const step = Math.sin(t * 11);
      out.legL = pose(34 * step, 0, 0);
      out.legR = pose(-34 * step, 0, 0);
      out.body = pose(
        5 * step + 4 * facing,
        2 * facing,
        -3.5 * Math.abs(Math.cos(t * 11)),
      );
      out.clawL = pose(-10 + 9 * step, 0, 0);
      out.clawR = pose(10 - 9 * step, 0, 0);
      break;
    }
    case "attack": {
      // 400ms: wind up, then snap forward (sin curve peaks mid-swing;
      // the snap is the steep second half of the curve).
      const p = onceProgress(tMs, 400);
      const swing = Math.sin(p * Math.PI);
      out[lead] = pose(
        (lead === "clawR" ? 1 : -1) * -85 * swing,
        12 * facing * swing,
        -4 * swing,
      );
      out[off] = pose((off === "clawR" ? 1 : -1) * 14 * swing, 0, 0);
      out.body = pose(7 * facing * swing, 3 * facing * swing, 0);
      out.legL = pose(10, 0, 0);
      out.legR = pose(-10, 0, 0);
      break;
    }
    case "combo": {
      // Two alternating snaps over ~600ms.
      const p = onceProgress(tMs, 600);
      const a = Math.sin(Math.min(1, p * 2) * Math.PI); // first claw
      const b = Math.sin(Math.max(0, p * 2 - 1) * Math.PI); // second claw
      out.clawR = pose(-80 * Math.max(a, 0) + -30 * b, 10 * a, -3 * a);
      out.clawL = pose(30 * a + 80 * Math.max(b, 0), -10 * b, -3 * b);
      out.body = pose(6 * Math.sin(p * Math.PI * 2), 0, -2 * Math.sin(p * Math.PI));
      break;
    }
    case "skill": {
      const pulse = 0.5 + 0.5 * Math.sin(t * 6);
      out.body = pose(0, 0, -3, 1 + 0.06 * pulse);
      out.clawL = pose(55, -4, -10);
      out.clawR = pose(-55, 4, -10);
      out.eyes = pose(0, 0, -1, 1 + 0.25 * pulse);
      out.legL = pose(8, 0, 0);
      out.legR = pose(-8, 0, 0);
      break;
    }
    case "defense": {
      // Both claws pulled forward and closed like a shield.
      out.clawL = pose(38, 8 * facing, 2);
      out.clawR = pose(-38, 8 * facing, 2);
      out.body = pose(0, -1 * facing, 3);
      out.legL = pose(12, 0, 0);
      out.legR = pose(-12, 0, 0);
      out.eyes = pose(0, 1 * facing, 1);
      break;
    }
    case "hit": {
      // 300ms decaying recoil away from the facing direction.
      const p = onceProgress(tMs, 300);
      const decay = 1 - p;
      out.body = pose(-11 * facing * decay, -9 * facing * decay, 1);
      out.clawL = pose(24 * decay, -3 * facing * decay, 0);
      out.clawR = pose(-24 * decay, -3 * facing * decay, 0);
      out.eyes = pose(0, 0, 0, 1 - 0.3 * decay);
      break;
    }
    case "dodge": {
      const p = onceProgress(tMs, 350);
      const out2 = Math.sin(p * Math.PI);
      out.body = pose(-14 * facing * out2, -16 * facing * out2, 0);
      out.legL = pose(22 * out2, 0, 0);
      out.legR = pose(22 * out2, 0, 0);
      out.clawL = pose(16 * out2, 0, 0);
      out.clawR = pose(-16 * out2, 0, 0);
      break;
    }
    case "jump": {
      const rise = Math.sin(Math.min(1, tMs / 500) * Math.PI);
      out.body = pose(0, 0, -12 * rise);
      out.legL = pose(16, 0, 2);
      out.legR = pose(16, 0, 2);
      out.clawL = pose(30, 0, -6 * rise);
      out.clawR = pose(-30, 0, -6 * rise);
      break;
    }
    case "fall": {
      out.body = pose(9 * Math.sin(t * 5), 0, 5);
      out.legL = pose(-14, 0, 3);
      out.legR = pose(-14, 0, 3);
      out.clawL = pose(34 + 6 * Math.sin(t * 7), 0, -4);
      out.clawR = pose(-34 - 6 * Math.sin(t * 7), 0, -4);
      break;
    }
    case "victory": {
      const bounce = Math.abs(Math.sin(t * 5));
      out.body = pose(0, 0, -5 * bounce);
      out.clawL = pose(48 + 10 * Math.sin(t * 5), -2, -12);
      out.clawR = pose(-48 - 10 * Math.sin(t * 5), 2, -12);
      out.eyes = pose(0, 0, -1, 1.1);
      break;
    }
    case "death": {
      // Everything goes limp and the body tips over.
      out.body = pose(82 * facing, 0, 9, 0.96);
      out.clawL = pose(42, -2, 7);
      out.clawR = pose(-42, 2, 7);
      out.legL = pose(28, 0, 3);
      out.legR = pose(-28, 0, 3);
      out.eyes = pose(0, 0, 1, 0.25);
      break;
    }
  }
  return out;
}

/**
 * Two-bone IK via the law of cosines. Angles in DEGREES, returned for
 * this forward-kinematics convention:
 *   joint = A * (cos shoulder, sin shoulder)
 *   end   = joint + B * (cos(shoulder + elbow), sin(shoulder + elbow))
 * Targets beyond reach are clamped onto the reach circle (|end| <=
 * lenA + lenB); the elbow takes the positive-bend branch.
 */
export function solveTwoBoneIK(
  lenA: number,
  lenB: number,
  tx: number,
  ty: number,
): { shoulder: number; elbow: number } {
  const a = Math.max(0, lenA);
  const b = Math.max(0, lenB);
  const dist = Math.hypot(tx, ty);
  if (dist < 1e-9 || a + b < 1e-9) {
    return { shoulder: 0, elbow: 0 };
  }
  const d = Math.min(dist, a + b);
  const cosElbow = (d * d - a * a - b * b) / (2 * a * b || 1);
  const elbowRad = Math.acos(Math.min(1, Math.max(-1, cosElbow)));
  const targetAngle = Math.atan2(ty, tx);
  const shoulderRad =
    targetAngle -
    Math.atan2(b * Math.sin(elbowRad), a + b * Math.cos(elbowRad));
  const toDeg = 180 / Math.PI;
  return { shoulder: shoulderRad * toDeg, elbow: elbowRad * toDeg };
}
