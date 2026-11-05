// Crabtopia - Particle system (pure, unit-testable).
//
// Fixed-capacity pool: the Particle objects are allocated ONCE in the
// constructor and recycled forever — spawning never allocates and never
// exceeds capacity. No DOM/canvas here; a renderer reads `particles`
// each frame and draws the alive ones.
//
// Units: positions in px, velocities in px/second, gravity in
// px/second^2, lifetimes/ages in ms, rate in particles/second,
// rotation in degrees, rotationSpeed in degrees/second.

export interface EmitterConfig {
  /** Particles per second for continuous emitters (burst ignores it). */
  rate: number;
  /** [min, max] lifetime in ms, rolled per particle. */
  lifetime: [number, number];
  /** Per-axis velocity ranges in px/second, rolled per particle. */
  velocity: { x: [number, number]; y: [number, number] };
  /** Gravity in px/second^2 (positive pulls down, negative = buoyant). */
  gravity: number;
  /** Optional velocity damping per second (0 = none, 1 = strong). */
  drag?: number;
  /** [min, max] start size in px. */
  size: [number, number];
  /** Optional end size in px; size lerps start -> end over lifetime. */
  sizeEnd?: number;
  /** Optional [min, max] rotation speed in degrees/second. */
  rotationSpeed?: [number, number];
  /** Palette; one entry is picked per particle (empty = white). */
  colors: string[];
  /**
   * Optional direction jitter in degrees: each particle's velocity
   * vector is rotated by a random angle in [-spread/2, +spread/2].
   */
  spread?: number;
}

export interface Particle {
  alive: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Age in ms. */
  age: number;
  /** Lifetime in ms; particle dies when age >= lifetime. */
  lifetime: number;
  /** Current size in px (already lerped toward sizeEnd, if any). */
  size: number;
  /** Current rotation in degrees. */
  rotation: number;
  /** Rotation speed in degrees/second. */
  rotationSpeed: number;
  color: string;
}

interface LiveEmitter {
  cfg: EmitterConfig;
  x: number;
  y: number;
  /** Fractional spawn accumulator (particles owed). */
  carry: number;
  stopped: boolean;
}

export interface EmitterHandle {
  stop(): void;
}

export class ParticleSystem {
  readonly particles: Particle[];
  private readonly capacity: number;
  private readonly rng: () => number;
  // Parallel per-slot records for spawn-config values that are not part
  // of the Particle interface: start size (for the sizeEnd lerp) plus
  // the gravity / drag / sizeEnd of the config that spawned the slot.
  private readonly startSizes: number[];
  private readonly gravities: number[];
  private readonly drags: number[];
  private readonly sizeEnds: (number | undefined)[];
  private emitters: LiveEmitter[] = [];

  constructor(capacity: number, rng: () => number = Math.random) {
    this.capacity = Math.max(0, Math.floor(capacity));
    this.rng = rng;
    this.particles = [];
    this.startSizes = [];
    this.gravities = [];
    this.drags = [];
    this.sizeEnds = [];
    for (let i = 0; i < this.capacity; i++) {
      this.particles.push({
        alive: false,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        age: 0,
        lifetime: 0,
        size: 0,
        rotation: 0,
        rotationSpeed: 0,
        color: "#ffffff",
      });
      this.startSizes.push(0);
      this.gravities.push(0);
      this.drags.push(0);
      this.sizeEnds.push(undefined);
    }
  }

  get activeCount(): number {
    let count = 0;
    for (const p of this.particles) if (p.alive) count++;
    return count;
  }

  private range(range: [number, number]): number {
    return range[0] + this.rng() * (range[1] - range[0]);
  }

  private spawnOne(cfg: EmitterConfig, x: number, y: number): boolean {
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      if (p.alive) continue;
      let vx = this.range(cfg.velocity.x);
      let vy = this.range(cfg.velocity.y);
      if (cfg.spread) {
        const angle = ((this.rng() - 0.5) * cfg.spread * Math.PI) / 180;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const rx = vx * cos - vy * sin;
        const ry = vx * sin + vy * cos;
        vx = rx;
        vy = ry;
      }
      p.alive = true;
      p.x = x;
      p.y = y;
      p.vx = vx;
      p.vy = vy;
      p.age = 0;
      p.lifetime = Math.max(1, this.range(cfg.lifetime));
      p.size = this.range(cfg.size);
      this.startSizes[i] = p.size;
      this.gravities[i] = cfg.gravity;
      this.drags[i] = cfg.drag ?? 0;
      this.sizeEnds[i] = cfg.sizeEnd;
      p.rotation = this.rng() * 360;
      p.rotationSpeed = cfg.rotationSpeed
        ? this.range(cfg.rotationSpeed)
        : 0;
      p.color =
        cfg.colors.length > 0
          ? cfg.colors[Math.floor(this.rng() * cfg.colors.length)]
          : "#ffffff";
      return true;
    }
    return false; // pool exhausted — capacity is a hard ceiling
  }

  /** Spawn up to `count` particles at (x, y). Returns how many spawned. */
  spawnBurst(cfg: EmitterConfig, x: number, y: number, count: number): number {
    let spawned = 0;
    const wanted = Math.max(0, Math.floor(count));
    for (let i = 0; i < wanted; i++) {
      if (!this.spawnOne(cfg, x, y)) break;
      spawned++;
    }
    return spawned;
  }

  /** Start a continuous emitter at (x, y); stop it via the handle. */
  emitter(cfg: EmitterConfig, x: number, y: number): EmitterHandle {
    const live: LiveEmitter = { cfg, x, y, carry: 0, stopped: false };
    this.emitters.push(live);
    return {
      stop(): void {
        live.stopped = true;
      },
    };
  }

  update(dtMs: number): void {
    if (dtMs <= 0) return;
    const dt = dtMs / 1000;

    // Continuous emission: accumulate rate*dt, keep the fraction.
    for (const em of this.emitters) {
      if (em.stopped) continue;
      em.carry += em.cfg.rate * dt;
      const count = Math.floor(em.carry);
      if (count > 0) {
        em.carry -= count;
        this.spawnBurst(em.cfg, em.x, em.y, count);
      }
    }
    if (this.emitters.some((e) => e.stopped)) {
      this.emitters = this.emitters.filter((e) => !e.stopped);
    }

    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      if (!p.alive) continue;
      p.age += dtMs;
      if (p.age >= p.lifetime) {
        p.alive = false;
        continue;
      }
      p.vy += (this.gravities[i] ?? 0) * dt;
      const drag = this.drags[i] ?? 0;
      if (drag > 0) {
        const factor = Math.max(0, 1 - drag * dt);
        p.vx *= factor;
        p.vy *= factor;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rotation += p.rotationSpeed * dt;
      const sizeEnd = this.sizeEnds[i];
      if (sizeEnd !== undefined) {
        const frac = Math.min(1, p.age / p.lifetime);
        p.size = this.startSizes[i] + (sizeEnd - this.startSizes[i]) * frac;
      }
    }
  }

  /** Kill every particle and stop every emitter (pool is kept). */
  clear(): void {
    for (const p of this.particles) p.alive = false;
    this.emitters = [];
  }
}

/** Ready-made configs tuned for an underwater arena. */
export const PARTICLE_PRESETS: Record<string, EmitterConfig> = {
  bubbles: {
    rate: 12,
    lifetime: [900, 2200],
    velocity: { x: [-8, 8], y: [-55, -25] },
    gravity: -30,
    drag: 0.1,
    size: [2, 6],
    sizeEnd: 8,
    rotationSpeed: [-20, 20],
    colors: ["#bfefff", "#dff8ff", "#ffffff"],
    spread: 20,
  },
  splash: {
    rate: 60,
    lifetime: [300, 800],
    velocity: { x: [-90, 90], y: [-160, -40] },
    gravity: 420,
    size: [2, 5],
    colors: ["#9fd8ff", "#d6f1ff", "#ffffff"],
    spread: 35,
  },
  sparks: {
    rate: 90,
    lifetime: [200, 600],
    velocity: { x: [-220, 220], y: [-220, 220] },
    gravity: 120,
    drag: 1.2,
    size: [1, 3],
    sizeEnd: 0,
    colors: ["#ffd76a", "#ffb347", "#fff3b0"],
    spread: 180,
  },
  motes: {
    rate: 6,
    lifetime: [2500, 5000],
    velocity: { x: [-12, 12], y: [-10, 6] },
    gravity: -4,
    drag: 0.05,
    size: [1, 3],
    colors: ["#cfe8d8", "#eaf7ee", "#b8dcc8"],
    spread: 180,
  },
  explosion: {
    rate: 140,
    lifetime: [350, 1000],
    velocity: { x: [-300, 300], y: [-300, 300] },
    gravity: 60,
    drag: 1.6,
    size: [3, 9],
    sizeEnd: 0,
    rotationSpeed: [-240, 240],
    colors: ["#ff9a3c", "#ff5d3c", "#ffd76a", "#8a8a8a"],
    spread: 180,
  },
  heal: {
    rate: 26,
    lifetime: [700, 1500],
    velocity: { x: [-18, 18], y: [-70, -30] },
    gravity: -18,
    size: [2, 5],
    sizeEnd: 1,
    rotationSpeed: [-45, 45],
    colors: ["#7dff9a", "#baffc9", "#eaffea"],
    spread: 25,
  },
  trail: {
    rate: 40,
    lifetime: [250, 600],
    velocity: { x: [-14, 14], y: [-14, 14] },
    gravity: 0,
    drag: 0.8,
    size: [3, 7],
    sizeEnd: 0,
    colors: ["#9fd8ff", "#6fb7e8", "#d6f1ff"],
    spread: 180,
  },
  // --- Skill-profile presets (skill overhaul) ---
  frost: {
    rate: 50,
    lifetime: [400, 1000],
    velocity: { x: [-60, 60], y: [-30, 90] },
    gravity: 150,
    drag: 0.4,
    size: [2, 5],
    sizeEnd: 1,
    rotationSpeed: [-120, 120],
    colors: ["#bdefff", "#e6fbff", "#8fd8ff", "#ffffff"],
    spread: 60,
  },
  venom: {
    rate: 55,
    lifetime: [400, 1100],
    velocity: { x: [-35, 35], y: [-90, -30] },
    gravity: -22,
    drag: 0.15,
    size: [2, 6],
    sizeEnd: 8,
    colors: ["#6ee65a", "#a5f28a", "#3fae4a", "#d8ffb0"],
    spread: 30,
  },
  shadow: {
    rate: 30,
    lifetime: [800, 1800],
    velocity: { x: [-25, 25], y: [15, 55] },
    gravity: 12,
    drag: 0.2,
    size: [3, 7],
    sizeEnd: 1,
    colors: ["#7a5cff", "#4b2f9e", "#9d86ff", "#2c1a5e"],
    spread: 180,
  },
  ward: {
    rate: 24,
    lifetime: [800, 1600],
    velocity: { x: [-16, 16], y: [-55, -20] },
    gravity: -12,
    drag: 0.1,
    size: [2, 5],
    sizeEnd: 1,
    rotationSpeed: [-40, 40],
    colors: ["#ffd166", "#ffe9a8", "#7cdeff", "#ffffff"],
    spread: 25,
  },
  drain: {
    rate: 46,
    lifetime: [300, 700],
    velocity: { x: [-30, 30], y: [-120, -50] },
    gravity: -60,
    drag: 0.3,
    size: [2, 5],
    sizeEnd: 0,
    colors: ["#ff6f91", "#ffb3c6", "#e6396b", "#ffd6de"],
    spread: 40,
  },
};
