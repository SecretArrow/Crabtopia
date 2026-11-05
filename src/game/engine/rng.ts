// Crabtopia - Seeded RNG (mulberry32) for deterministic battles and procedural art
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function pick<T>(arr: T[], rng: () => number): T {
  return arr[Math.floor(rng() * arr.length)];
}

export function randInt(min: number, max: number, rng: () => number): number {
  return Math.floor(rng() * (max - min + 1)) + min;
}

// Names for procedural crab generation
export const CRAB_NAME_PREFIXES = [
  "Tide", "Coral", "Brine", "Shell", "Wave", "Salt", "Reef", "Pearl",
  "Sand", "Kelp", "Gilt", "Storm", "Moon", "Frost", "Ember", "Moss",
  "Barnacle", "Drift", "Glow", "Aurora", "Deep", "Coast", "Mist", "Lagoon",
  "Anchor", "Cinder", "Rift", "Plankton", "Tidepool", "Current", "Surge", "Vein",
];

export const CRAB_NAME_SUFFIXES = [
  "snap", "claw", "shell", "pinch", "scuttle", "warden", "guard", "tide",
  "stride", "watch", "song", "crest", "bloom", "wave", "rift", "glow",
  "mender", "reaver", "bulwark", "skitter", "caller", "pincher", "gild", "ward",
  "heart", "spire", "dom", "vault", "mark", "chain", "bind", "roam",
];

export function makeCrabName(rng: () => number): string {
  const p = pick(CRAB_NAME_PREFIXES, rng);
  const s = pick(CRAB_NAME_SUFFIXES, rng);
  return p + s;
}
