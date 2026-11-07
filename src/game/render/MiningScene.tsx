// Crabtopia - MiningScene ("Watch the Dig")
// The watched play-out for a dig whose loot is ALREADY determined: the
// deployed team's real crabs (their own class sprites, attack/skill
// clips as dig swings) work a themed node face — rocks shake, crack in
// stages and burst, and each predetermined loot item pops out and arcs
// into the loot counter. The finale hands over to LootReveal and its
// Claim button runs the caller's unchanged claim path.
//
// Watched ≡ direct claim, exactly like battle's watched ≡ Skip: the
// scene reads the predetermined loot, it never rolls or grants
// anything. Closing mid-scene claims NOTHING — the loot stays pending
// and can be claimed (or re-watched) later.
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import LivingCrab from "../animation/LivingCrab";
import type { Crab } from "../types";
import { buildRevealTimeline } from "../engine/lootReveal";
import LootReveal, { type LootRevealItem } from "./LootReveal";
import { GlowButton } from "./ui";

// ---------- Themes ----------

export interface MiningSceneTheme {
  id: string;
  skyTop: string;
  skyBottom: string;
  ground: string;
  rock: string;
  accent: string;
  decor: "kelp" | "pearl" | "crystal" | "bubbles";
}

export const MINING_NODE_THEMES: Record<string, MiningSceneTheme> = {
  kelp_ridge: {
    id: "kelp_ridge",
    skyTop: "#0E4D3A",
    skyBottom: "#07272B",
    ground: "#8A7B52",
    rock: "#5E6B5A",
    accent: "#7CF5E1",
    decor: "kelp",
  },
  pearl_cavern: {
    id: "pearl_cavern",
    skyTop: "#1B2340",
    skyBottom: "#0B1026",
    ground: "#3A4160",
    rock: "#4A5170",
    accent: "#FFD7F0",
    decor: "pearl",
  },
  crystal_vault: {
    id: "crystal_vault",
    skyTop: "#2A1650",
    skyBottom: "#120A2E",
    ground: "#3A2A66",
    rock: "#54447F",
    accent: "#7DD3FC",
    decor: "crystal",
  },
};

/** Dive sites theme from their faction biome colours. */
export function diveSiteTheme(colors: {
  dark: string;
  primary: string;
  accent: string;
}): MiningSceneTheme {
  return {
    id: "dive_site",
    skyTop: colors.dark,
    skyBottom: "#06122B",
    ground: colors.primary,
    rock: "#46536B",
    accent: colors.accent,
    decor: "bubbles",
  };
}

// ---------- Digging crab (attack/skill clips as dig swings) ----------

function DiggingCrab({
  crab,
  index,
}: {
  crab: Crab;
  index: number;
}): React.ReactNode {
  const [swing, setSwing] = useState(false);
  useEffect(() => {
    let alive = true;
    const timers: number[] = [];
    const period = 1250 + index * 130;
    const loop = () => {
      if (!alive) return;
      setSwing(true);
      timers.push(
        window.setTimeout(() => {
          if (!alive) return;
          setSwing(false);
          timers.push(window.setTimeout(loop, period - 660));
        }, 660)
      );
    };
    timers.push(window.setTimeout(loop, 200 + index * 230));
    return () => {
      alive = false;
      timers.forEach((t) => window.clearTimeout(t));
    };
  }, [index]);
  const caster = crab.classId === "tidecaller" || crab.classId === "shellmender";
  return (
    <LivingCrab
      crab={crab}
      size={86}
      state={swing ? (caster ? "skill" : "attack") : "idle"}
    />
  );
}

// ---------- Rock prop (cracks in stages, bursts on a find) ----------

function Rock({
  color,
  accent,
  crack,
  bursting,
}: {
  color: string;
  accent: string;
  crack: number;
  bursting: boolean;
}): React.ReactNode {
  return (
    <motion.div
      className="relative"
      style={{ width: 74, height: 52 }}
      animate={
        bursting
          ? { scale: [1, 1.18, 0.55], rotate: [0, -3, 5], opacity: [1, 1, 0] }
          : { scale: 1, rotate: 0, opacity: 1 }
      }
      transition={{ duration: bursting ? 0.45 : 0.2 }}
      aria-hidden
    >
      <div
        className="absolute inset-0"
        style={{
          borderRadius: "48% 52% 55% 45% / 62% 62% 38% 38%",
          background: `linear-gradient(160deg, ${color} 0%, #232B3A 130%)`,
          border: "2px solid rgba(0,0,0,0.35)",
          boxShadow: `inset 0 -8px 14px rgba(0,0,0,0.35), inset 0 6px 10px rgba(255,255,255,0.14), 0 4px 10px rgba(0,0,0,0.4)`,
        }}
      />
      {/* ore glints in the theme accent */}
      <div
        className="absolute rounded-full"
        style={{
          width: 9,
          height: 9,
          left: 16,
          top: 12,
          background: accent,
          opacity: 0.75,
          boxShadow: `0 0 8px ${accent}`,
        }}
      />
      <div
        className="absolute rounded-full"
        style={{
          width: 6,
          height: 6,
          right: 14,
          bottom: 12,
          background: accent,
          opacity: 0.5,
          boxShadow: `0 0 6px ${accent}`,
        }}
      />
      {/* crack stages */}
      <svg
        viewBox="0 0 74 52"
        className="absolute inset-0"
        style={{ opacity: crack === 0 ? 0 : 0.85 }}
      >
        {crack >= 1 && (
          <path d="M37 4 L33 16 L39 24" stroke="#141A26" strokeWidth="2.4" fill="none" strokeLinecap="round" />
        )}
        {crack >= 2 && (
          <path d="M39 24 L31 33 L36 44" stroke="#141A26" strokeWidth="2.4" fill="none" strokeLinecap="round" />
        )}
        {crack >= 3 && (
          <path d="M39 24 L52 30 L58 42 M33 16 L20 22" stroke="#141A26" strokeWidth="2.2" fill="none" strokeLinecap="round" />
        )}
      </svg>
    </motion.div>
  );
}

// ---------- Backdrop decor (procedural, per theme; capped counts) ----------

function SceneDecor({ theme }: { theme: MiningSceneTheme }): React.ReactNode {
  if (theme.decor === "kelp") {
    return (
      <>
        {[6, 22, 41, 63, 82, 93].map((left, i) => (
          <motion.div
            key={left}
            className="absolute"
            style={{
              left: `${left}%`,
              bottom: 58,
              width: 13,
              height: 110 + (i % 3) * 34,
              borderRadius: 999,
              background:
                "linear-gradient(180deg, rgba(64,200,140,0.0), rgba(46,160,105,0.75))",
              transformOrigin: "bottom center",
              opacity: 0.7,
            }}
            animate={{ rotate: [-3, 3, -3] }}
            transition={{ duration: 3 + i * 0.45, repeat: Infinity, ease: "easeInOut" }}
          />
        ))}
      </>
    );
  }
  if (theme.decor === "pearl") {
    return (
      <>
        {[12, 33, 55, 74, 90].map((left, i) => (
          <motion.div
            key={left}
            className="absolute rounded-full"
            style={{
              left: `${left}%`,
              top: 52 + (i % 3) * 36,
              width: 15 + (i % 3) * 7,
              height: 15 + (i % 3) * 7,
              background:
                "radial-gradient(circle at 35% 30%, #FFFFFF, #FFD7F0 55%, #C99BD8)",
              boxShadow: "0 0 18px rgba(255,215,240,0.75)",
            }}
            animate={{ y: [0, -9, 0] }}
            transition={{ duration: 2.6 + i * 0.5, repeat: Infinity, ease: "easeInOut" }}
          />
        ))}
      </>
    );
  }
  if (theme.decor === "crystal") {
    return (
      <>
        {[4, 26, 48, 70, 90].map((left, i) => (
          <motion.div
            key={left}
            className="absolute"
            style={{
              left: `${left}%`,
              bottom: 58,
              width: 30 + (i % 3) * 12,
              height: 62 + (i % 3) * 30,
              clipPath: "polygon(50% 0%, 88% 100%, 12% 100%)",
              background:
                i % 2
                  ? "linear-gradient(180deg, rgba(125,211,252,0.9), rgba(56,130,246,0.35))"
                  : "linear-gradient(180deg, rgba(216,180,254,0.9), rgba(147,51,234,0.35))",
              filter: "drop-shadow(0 0 10px rgba(125,211,252,0.55))",
              opacity: 0.8,
            }}
            animate={{ opacity: [0.65, 0.95, 0.65] }}
            transition={{ duration: 2.4 + i * 0.6, repeat: Infinity, ease: "easeInOut" }}
          />
        ))}
      </>
    );
  }
  // bubbles (dive sites)
  return (
    <>
      {[10, 28, 47, 66, 84, 93, 58, 37].map((left, i) => (
        <motion.div
          key={left}
          className="absolute rounded-full"
          style={{
            left: `${left}%`,
            bottom: 66,
            width: 6 + (i % 3) * 3,
            height: 6 + (i % 3) * 3,
            border: "1.5px solid rgba(190,240,255,0.75)",
            background: "rgba(190,240,255,0.12)",
          }}
          animate={{ y: [0, -190], opacity: [0, 0.85, 0] }}
          transition={{
            duration: 3.4 + (i % 4) * 0.7,
            repeat: Infinity,
            delay: i * 0.55,
            ease: "easeIn",
          }}
        />
      ))}
    </>
  );
}

// ---------- The scene ----------

interface Fly {
  id: number;
  lootIndex: number;
  station: number;
}

export interface MiningSceneProps {
  title: string;
  subtitle?: string;
  crabs: Crab[];
  theme: MiningSceneTheme;
  /** Predetermined loot, in reveal order. */
  loot: LootRevealItem[];
  claimLabel: string;
  finaleTitle: string;
  finaleNotes?: string[];
  totalLabel?: string;
  totalAmount?: number;
  totalIcon?: React.ReactNode;
  totalFormat?: (n: number) => string;
  onClaim: () => void;
  onClose: () => void;
}

export default function MiningScene({
  title,
  subtitle,
  crabs,
  theme,
  loot,
  claimLabel,
  finaleTitle,
  finaleNotes,
  totalLabel,
  totalAmount,
  totalIcon,
  totalFormat,
  onClaim,
  onClose,
}: MiningSceneProps): React.ReactNode {
  const stations = Math.max(1, crabs.length);
  const timeline = useMemo(() => buildRevealTimeline(loot.length), [loot.length]);
  const durationMs = loot.length === 0 ? 1200 : timeline.durationMs;

  const [phase, setPhase] = useState<"digging" | "finale">("digging");
  const [popped, setPopped] = useState(0);
  const [landed, setLanded] = useState<Record<string, number>>({});
  const [flies, setFlies] = useState<Fly[]>([]);
  const [cracks, setCracks] = useState<number[]>(() =>
    Array.from({ length: stations }, () => 0)
  );
  const [burstStation, setBurstStation] = useState(-1);

  const timersRef = useRef<number[]>([]);
  const flyIdRef = useRef(0);

  // Dig driver: pops fire on the predetermined timeline; cracks advance
  // on a steady tick rotating across stations.
  useEffect(() => {
    if (phase !== "digging") return;
    const start = performance.now();
    let poppedCount = 0;
    let tick = 0;
    const later = (fn: () => void, ms: number) => {
      const t = window.setTimeout(fn, ms);
      timersRef.current.push(t);
    };
    const spawnPop = (lootIndex: number) => {
      const station = stations > 0 ? lootIndex % stations : 0;
      setBurstStation(station);
      setCracks((prev) =>
        prev.map((c, i) => (i === station ? 0 : c))
      );
      later(() => setBurstStation(-1), 480);
      const fly: Fly = { id: ++flyIdRef.current, lootIndex, station };
      setFlies((prev) => [...prev.slice(-7), fly]);
      later(() => {
        setFlies((prev) => prev.filter((f) => f.id !== fly.id));
        const item = loot[lootIndex];
        if (item) {
          setLanded((prev) => ({
            ...prev,
            [item.key]: (prev[item.key] ?? 0) + item.amount,
          }));
        }
      }, 880);
    };
    const iv = window.setInterval(() => {
      const elapsed = performance.now() - start;
      tick += 1;
      if (tick % 5 === 0) {
        const station = Math.floor(tick / 5) % stations;
        setCracks((prev) =>
          prev.map((c, i) => (i === station ? (c + 1) % 4 : c))
        );
      }
      while (
        poppedCount < loot.length &&
        (timeline.revealAtMs[poppedCount] ?? Infinity) <= elapsed
      ) {
        spawnPop(poppedCount);
        poppedCount += 1;
        setPopped(poppedCount);
      }
      if (elapsed >= durationMs + 950) {
        window.clearInterval(iv);
        setPhase("finale");
      }
    }, 100);
    return () => {
      window.clearInterval(iv);
      timersRef.current.forEach((t) => window.clearTimeout(t));
      timersRef.current = [];
    };
  }, [phase, durationMs]);

  const skipToFinale = () => setPhase("finale");

  const stationLeft = (i: number) => ((i + 0.5) / stations) * 100;
  const distinctLoot = useMemo(() => {
    const seen = new Map<string, LootRevealItem>();
    for (const item of loot) if (!seen.has(item.key)) seen.set(item.key, item);
    return [...seen.values()];
  }, [loot]);

  return (
    <motion.div
      data-testid="mining-scene"
      className="fixed inset-0 z-[70] flex items-center justify-center p-3"
      style={{ background: "rgba(6,18,43,0.84)" }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      role="dialog"
      aria-label={title}
    >
      <div className="w-full max-w-2xl">
        {phase === "finale" ? (
          <div
            className="rounded-3xl p-4 md:p-5"
            style={{
              background: "linear-gradient(180deg, #0A1B3D 0%, #06122B 100%)",
              border: "1px solid rgba(124,245,225,0.25)",
              boxShadow: "0 24px 60px rgba(0,0,0,0.55)",
            }}
          >
            <LootReveal
              variant="summary"
              title={finaleTitle}
              subtitle={subtitle}
              items={loot}
              notes={finaleNotes}
              totalLabel={totalLabel}
              totalAmount={totalAmount}
              totalIcon={totalIcon}
              totalFormat={totalFormat}
              actionLabel={claimLabel}
              onAction={onClaim}
              onDismiss={onClose}
              pace={{ perItemMs: 350, minMs: 900, maxMs: 3500 }}
            />
          </div>
        ) : (
          <div
            className="relative overflow-hidden rounded-3xl"
            style={{
              height: 400,
              background: `linear-gradient(180deg, ${theme.skyTop} 0%, ${theme.skyBottom} 78%)`,
              border: "1px solid rgba(124,245,225,0.25)",
              boxShadow: "0 24px 60px rgba(0,0,0,0.55)",
            }}
          >
            <SceneDecor theme={theme} />

            {/* Header */}
            <div className="absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-2 p-3">
              <div>
                <div
                  className="text-base font-bold leading-tight"
                  style={{ fontFamily: "Fredoka, system-ui, sans-serif" }}
                >
                  {title}
                </div>
                {subtitle && (
                  <div className="text-[11px] text-white/60">{subtitle}</div>
                )}
                <div className="mt-0.5 text-[11px] font-bold" style={{ color: theme.accent }}>
                  ⛏️ Digging… {popped}/{loot.length} finds
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close without claiming"
                className="rounded-full bg-black/40 px-2.5 py-1 text-sm font-bold text-white/70 hover:text-white"
              >
                ✕
              </button>
            </div>

            {/* Loot counter */}
            <div className="absolute right-3 top-16 z-20 flex max-w-[46%] flex-wrap justify-end gap-1.5">
              {distinctLoot.map((item) => (
                <div
                  key={item.key}
                  className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold"
                  style={{
                    background: "rgba(6,18,43,0.8)",
                    border: "1px solid rgba(255,255,255,0.22)",
                    color: "#EAF6FF",
                  }}
                >
                  {item.icon}
                  <span>×{landed[item.key] ?? 0}</span>
                </div>
              ))}
            </div>

            {/* Ground */}
            <div
              className="absolute inset-x-0 bottom-0"
              style={{
                height: 64,
                background: `linear-gradient(180deg, ${theme.ground} 0%, rgba(0,0,0,0.45) 130%)`,
                borderTop: "2px solid rgba(255,255,255,0.16)",
              }}
            />

            {/* Stations: crab + its rock */}
            <div className="absolute inset-x-0 bottom-[38px] z-10 flex items-end justify-around px-2">
              {crabs.map((crab, i) => (
                <div
                  key={crab.id}
                  className="relative flex flex-col items-center"
                  style={{ width: `${100 / stations}%` }}
                >
                  <DiggingCrab crab={crab} index={i} />
                  <div style={{ marginTop: -30 }}>
                    <Rock
                      color={theme.rock}
                      accent={theme.accent}
                      crack={cracks[i] ?? 0}
                      bursting={burstStation === i}
                    />
                  </div>
                </div>
              ))}
              {crabs.length === 0 && (
                <div className="pb-16 text-sm text-white/60">
                  The team is digging…
                </div>
              )}
            </div>

            {/* Flying loot (arcs from the bursting rock to the counter) */}
            <div className="pointer-events-none absolute inset-0 z-30">
              {flies.map((fly) => {
                const item = loot[fly.lootIndex];
                if (!item) return null;
                const fromLeft = stationLeft(fly.station);
                return (
                  <motion.span
                    key={fly.id}
                    className="absolute flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-black"
                    style={{
                      background: "rgba(6,18,43,0.88)",
                      border: "1px solid rgba(255,209,102,0.8)",
                      color: "#FFD166",
                      marginLeft: -18,
                    }}
                    initial={{ left: `${fromLeft}%`, top: "64%", scale: 0.5, opacity: 0 }}
                    animate={{
                      left: [`${fromLeft}%`, `${fromLeft + (93 - fromLeft) * 0.5}%`, "93%"],
                      top: ["64%", "30%", "9%"],
                      scale: [0.6, 1.15, 0.7],
                      opacity: [0, 1, 0.9],
                    }}
                    transition={{ duration: 0.85, ease: "easeOut", times: [0, 0.55, 1] }}
                  >
                    {item.icon}
                    <span>+{item.amount}</span>
                  </motion.span>
                );
              })}
            </div>

            {/* Footer controls */}
            <div className="absolute inset-x-0 bottom-0 z-20 flex items-end justify-between gap-2 p-3">
              <div className="max-w-[55%] text-[10px] leading-snug text-white/55">
                Closing won&apos;t claim — the loot waits for you.
              </div>
              <GlowButton variant="gold" size="sm" onClick={skipToFinale}>
                Skip ▸
              </GlowButton>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}
