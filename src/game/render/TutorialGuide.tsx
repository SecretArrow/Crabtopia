// Crabtopia - TutorialGuide: guided coach-mark overlay for a brand-new player's
// first ("tutorial") dive. Fully self-contained: reads all state from the game
// store, renders null once the tutorial is complete, and never blocks the game
// UI (pointer-events-none base veil; only the coach card is interactive).
//
// Flow (6 steps):
//   0 Welcome        -> CTA navigates to the Dive Map
//   1 Pick a site    -> spotlight on a free map pin; advances when a dive is
//                       deployed (or the player confirms "I've deployed")
//   2 Waiting        -> live CountdownRing to the tutorial dive window end +
//                       rotating fun facts (every 5s); auto-advances at 0
//   3 Claim          -> spotlight on the Claim button; advances when claimed
//   4 Celebrate      -> CSS confetti burst + earned GOLD recap
//   5 What's next?   -> 3 quick links; any click completes the tutorial
//
// The step is derived during render from the store (dive deployed? completed?
// claimed?) plus a small user-driven base step, so game events auto-advance
// the tutorial without effect-driven setState cascades.
//
// Mounting: render <TutorialGuide /> inside GameShell's player branch, right
// before <ToastContainer /> (see agent-ctx notes).

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { useGame } from "../store/gameStore";
import { CONFIG } from "../engine/config";
import { CountdownRing, GlowButton, GoldIcon, formatTime } from "./ui";
import type { DigSite } from "../types";

type TutorialStep = 0 | 1 | 2 | 3 | 4 | 5;

const STEP_META: Record<TutorialStep, { label: string; title: string }> = {
  0: { label: "Welcome", title: "Welcome to Crabtopia!" },
  1: { label: "Pick a site", title: "Pick your first dig site" },
  2: { label: "Dive underway", title: "Your crabs are diving…" },
  3: { label: "Claim reward", title: "Your tutorial dive is ready!" },
  4: { label: "Celebrate", title: "First GOLD secured!" },
  5: { label: "What's next", title: "What's next?" },
};

// Rotated every 5s while waiting for the tutorial dive to surface.
const FUN_FACTS = [
  "Your crabs dig automatically — no input needed!",
  "Raids steal up to 65% of unclaimed digs — claim promptly!",
  "The Driftwood Hall lends idle crabs for GOLD.",
  "Gildclaw crabs sprinkle a +10% GOLD bonus on dives they join.",
  "Breed two crabs and the egg may hatch a rare mutation.",
  "Bigger Battle Power unlocks richer, deeper dig sites.",
];

// Faction primaries + a double scoop of gold for the celebration burst.
const PARTICLE_COLORS = [
  "#FFD166",
  "#FFD166",
  "#FF6F91", // coral court
  "#FF7A1A", // cinder reef
  "#7CF5E1", // frost shelf
  "#4FB477", // mangrove
  "#7A5CFF", // storm wake
  "#5C7CFF", // moon pool
];

const WHATS_NEXT_LINKS = [
  {
    icon: "🦀",
    title: "Build Teams",
    desc: "Shape 3-crab squads for richer dives",
    screen: "teams",
  },
  {
    icon: "🥚",
    title: "Breed Crabs",
    desc: "Hatch eggs with rare mutations",
    screen: "nursery",
  },
  {
    icon: "⚔️",
    title: "Raid a Rival",
    desc: "Plunder occupied sites for GOLD",
    screen: "map",
  },
];

/** Human-readable duration derived from config (demo timers are compressed). */
function humanDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} second${s === 1 ? "" : "s"}`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} minute${m === 1 ? "" : "s"}`;
  const h = Math.round(m / 60);
  return `${h} hour${h === 1 ? "" : "s"}`;
}

/** Deterministic 0..1 pseudo-random so particles do not reshuffle on re-render. */
function jitter(i: number, salt: number): number {
  const v = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453;
  return v - Math.floor(v);
}

function samePoint(a: { x: number; y: number }, b: { x: number; y: number }): boolean {
  return Math.abs(a.x - b.x) < 2 && Math.abs(a.y - b.y) < 2;
}

function elementCenter(el: Element): { x: number; y: number } {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

function isDiveUnderway(s: DigSite): boolean {
  return s.state === "deployed" || s.state === "raided" || s.state === "resolving";
}

export default function TutorialGuide() {
  // ---- store (selectors return stable refs so timer ticks do not re-render us) ----
  const tutorialComplete = useGame((s) => (s.player ? s.player.tutorialComplete : true));
  const tutorialSite = useGame(
    (s) => (s.player ? s.player.digSites.find((x) => x.isTutorial) ?? null : null)
  );
  const myDive = useGame(
    (s) =>
      s.worldSites.find(
        (x) =>
          x.ownerIsPlayer &&
          (x.state === "deployed" ||
            x.state === "raided" ||
            x.state === "resolving" ||
            x.state === "completed")
      ) ?? null
  );
  const claimedDive = useGame(
    (s) => s.worldSites.find((x) => x.ownerIsPlayer && x.state === "claimed") ?? null
  );
  const currentScreen = useGame((s) => s.currentScreen);
  const setScreen = useGame((s) => s.setScreen);
  const completeTutorial = useGame((s) => s.completeTutorial);
  const pushToast = useGame((s) => s.pushToast);

  // ---- local state (user-driven transitions only) ----
  const [baseStep, setBaseStep] = useState<TutorialStep>(0);
  // Fallback countdown anchor for players who confirm "I've deployed" before a
  // real dive exists in the store; otherwise the dive's own deployTime is used.
  const [manualAnchor, setManualAnchor] = useState<number | null>(null);
  const [now, setNow] = useState<number>(() => Date.now());
  const [spot, setSpot] = useState<{ x: number; y: number } | null>(null);
  const [lightVeil, setLightVeil] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
  const cardRef = useRef<HTMLDivElement | null>(null);

  // ---- derived tutorial state (pure; game events advance the steps here) ----
  const tutorialClaimed = tutorialSite?.state === "claimed";
  const anyClaimed = tutorialClaimed || claimedDive != null;

  // Countdown anchor: the deployed dive's start, else the manual fallback.
  const anchor = myDive?.deployTime ?? manualAnchor ?? null;
  // The tutorial dive window ends tutorialDiveMs after the anchor, capped by
  // the real dive's own completion (whichever comes first).
  const realEnd = myDive?.deployTime != null ? myDive.deployTime + myDive.durationMs : null;
  const endsAt =
    anchor != null
      ? realEnd != null
        ? Math.min(anchor + CONFIG.tutorialDiveMs, realEnd)
        : anchor + CONFIG.tutorialDiveMs
      : null;
  const remainingMs = endsAt != null ? Math.max(0, endsAt - now) : 0;
  const totalMs =
    endsAt != null && anchor != null
      ? Math.max(1, endsAt - anchor)
      : Math.max(1, CONFIG.tutorialDiveMs);
  const ringProgress = Math.min(1, Math.max(0, 1 - remainingMs / totalMs));

  // Effective step: start from the user-driven base, then fast-forward from
  // live game state. This also covers the mount-time cases (e.g. the tutorial
  // site already claimed -> jump straight to the celebration step).
  let step: TutorialStep = baseStep;
  if (anyClaimed) {
    if (step <= 3) step = 4;
  } else if (step === 0 || step === 1) {
    if (myDive) step = myDive.state === "completed" ? 3 : 2;
  } else if (step === 2) {
    const diveDone = myDive?.state === "completed";
    const timerDone = endsAt == null || now >= endsAt;
    if (diveDone || timerDone) step = 3;
  }

  // GOLD recap for the celebration step (site rewards persist after claiming).
  const earned = Math.max(
    1,
    Math.round(
      tutorialClaimed
        ? (tutorialSite?.rewardRemaining ?? 500)
        : (claimedDive?.rewardRemaining ?? 500)
    )
  );

  // Fun-fact index rotates with elapsed dive time (5s per fact).
  const factIndex =
    anchor != null
      ? Math.floor(Math.max(0, now - anchor) / 5000) % FUN_FACTS.length
      : 0;

  // ---- transitions (event handlers only) ----
  const goStep = useCallback((next: TutorialStep) => {
    if (next === 2) {
      const dive = useGame
        .getState()
        .worldSites.find((x) => x.ownerIsPlayer && isDiveUnderway(x));
      setManualAnchor(dive?.deployTime ?? Date.now());
    }
    setBaseStep(next);
  }, []);

  const handleSkip = useCallback(() => {
    completeTutorial();
    pushToast({ title: "Tutorial skipped — revisit from Tutorials", variant: "default" });
  }, [completeTutorial, pushToast]);

  const finishTutorial = useCallback(
    (screen: string) => {
      completeTutorial();
      setScreen(screen);
      pushToast({
        title: "Tutorial complete!",
        description: "Crabtopia is yours — happy digging.",
        variant: "success",
      });
    },
    [completeTutorial, setScreen, pushToast]
  );

  // ---- countdown clock (ticks only while waiting) ----
  useEffect(() => {
    if (step !== 2) return;
    const kickoff = window.setTimeout(() => setNow(Date.now()), 0);
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => {
      window.clearTimeout(kickoff);
      window.clearInterval(id);
    };
  }, [step]);

  // ---- spotlight target resolution (DOM polling with stable bail-outs) ----
  useEffect(() => {
    let alive = true;
    const resolve = () => {
      if (!alive) return;
      // The shared Modal renders at z-50 (below this overlay). Lighten the
      // veil while one is open so its content stays readable.
      const lowModalOpen = !!document.querySelector("div.fixed.inset-0.z-50");
      setLightVeil((prev) => (prev === lowModalOpen ? prev : lowModalOpen));

      let el: Element | null = null;
      if (step === 1) {
        // Point at the free site pin nearest the middle of the map.
        const free = useGame
          .getState()
          .worldSites.filter((x) => !x.occupiedBy && !x.ownerIsPlayer);
        const target = free.reduce<DigSite | null>((best, s) => {
          if (!best) return s;
          const d = (s.pos.x - 0.5) ** 2 + (s.pos.y - 0.5) ** 2;
          const bd = (best.pos.x - 0.5) ** 2 + (best.pos.y - 0.5) ** 2;
          return d < bd ? s : best;
        }, null);
        if (target) {
          el = document.querySelector(`button[aria-label="Site ${target.name}"]`);
        }
        if (!el) el = document.querySelector('button[aria-label^="Site "]');
      } else if (step === 3) {
        // Prefer the tutorial tidepool's "Claim +500" (Home burrow action row),
        // then any generic Claim button (e.g. a completed dive on the map).
        const buttons = Array.from(document.querySelectorAll("button"));
        el =
          buttons.find((b) => (b.textContent ?? "").includes("Claim +500")) ??
          buttons.find((b) => /^Claim\s/.test((b.textContent ?? "").trim())) ??
          null;
      }
      const next = el ? elementCenter(el) : null;
      setSpot((prev) => (prev && next && samePoint(prev, next) ? prev : next));
    };
    const raf = window.requestAnimationFrame(resolve);
    const id = window.setInterval(resolve, 600);
    window.addEventListener("resize", resolve);
    window.addEventListener("scroll", resolve, true);
    return () => {
      alive = false;
      window.cancelAnimationFrame(raf);
      window.clearInterval(id);
      window.removeEventListener("resize", resolve);
      window.removeEventListener("scroll", resolve, true);
    };
  }, [step, currentScreen]);

  // ---- accessibility: track reduced-motion preference + focus card per step ----
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(mq.matches);
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    cardRef.current?.focus({ preventScroll: true });
  }, [step]);

  // ---- per-step CTA (last hook — kept before the render gate) ----
  const cta = useMemo(() => {
    switch (step) {
      case 0:
        return {
          label: "Open the Dive Map →",
          variant: "gold" as const,
          action: () => {
            setScreen("map");
            setBaseStep(1);
          },
        };
      case 1:
        return currentScreen === "map"
          ? {
              label: "I've deployed ✓",
              variant: "teal" as const,
              action: () => goStep(2),
            }
          : {
              label: "Open the Dive Map →",
              variant: "teal" as const,
              action: () => setScreen("map"),
            };
      case 2:
        return currentScreen === "map"
          ? {
              label: "Peek at my crabs →",
              variant: "ghost" as const,
              action: () => setScreen("teams"),
            }
          : {
              label: "Watch the map →",
              variant: "ghost" as const,
              action: () => setScreen("map"),
            };
      case 3:
        return {
          label: "Show me the Claim →",
          variant: "gold" as const,
          action: () => setScreen("home"),
        };
      case 4:
        return {
          label: "What's next? →",
          variant: "teal" as const,
          action: () => setBaseStep(5),
        };
      default:
        return null;
    }
  }, [step, currentScreen, setScreen, goStep]);

  // ---- render gate: tutorial finished (or no player) -> nothing to guide ----
  if (tutorialComplete) return null;

  // ---- veil / spotlight ----
  const veilAlpha = lightVeil ? 0.18 : 0.75;
  const veilStyle: CSSProperties = spot
    ? {
        background: `radial-gradient(circle at ${Math.round(spot.x)}px ${Math.round(
          spot.y
        )}px, transparent 180px, rgba(4,12,32,${veilAlpha}) 320px)`,
      }
    : { background: `rgba(4,12,32,${veilAlpha})` };

  // Desktop: anchor the card on the side away from the spotlight target.
  const vw = typeof window !== "undefined" ? window.innerWidth : 1024;
  const spotOnRight = spot != null && spot.x > vw * 0.55;
  const positionClasses = spotOnRight
    ? "md:left-8 md:right-auto md:translate-x-0"
    : "md:left-auto md:right-8 md:translate-x-0";

  return (
    <div className="fixed inset-0 z-[90] pointer-events-none">
      {/* Dimmed spotlight veil (clicks pass through to the game) */}
      <div className="absolute inset-0" style={veilStyle} />

      {/* Pulsing ring around the current coach-mark target */}
      {spot != null && (step === 1 || step === 3) && !lightVeil && !reducedMotion && (
        <div
          aria-hidden="true"
          className="tutorial-target-pulse"
          style={{ left: spot.x, top: spot.y }}
        />
      )}

      {/* Celebration confetti burst (skipped for reduced motion) */}
      {step === 4 && !reducedMotion && (
        <div
          aria-hidden="true"
          className="absolute pointer-events-none"
          style={{ left: "50%", top: "42%" }}
        >
          {Array.from({ length: 20 }).map((_, i) => {
            const angle = (i / 20) * Math.PI * 2 + jitter(i, 1) * 0.6;
            const dist = 110 + jitter(i, 2) * 140;
            const dx = Math.cos(angle) * dist;
            const dy = Math.sin(angle) * dist - 60;
            const size = 5 + Math.round(jitter(i, 3) * 6);
            const color = PARTICLE_COLORS[i % PARTICLE_COLORS.length];
            const style = {
              width: size,
              height: size,
              background: color,
              boxShadow: `0 0 10px ${color}99`,
              animationDelay: `${Math.round(jitter(i, 4) * 320)}ms`,
              "--tx": `${Math.round(dx)}px`,
              "--ty": `${Math.round(dy)}px`,
            } as CSSProperties;
            return <span key={i} className="tutorial-particle" style={style} />;
          })}
        </div>
      )}

      {/* Coach-mark card: bottom-center on mobile, side-anchored on desktop */}
      <div
        className={`pointer-events-auto absolute z-10 left-1/2 -translate-x-1/2 bottom-[calc(96px_+_env(safe-area-inset-bottom))] w-[calc(100vw-2rem)] max-w-[400px] md:top-1/2 md:-translate-y-1/2 md:bottom-auto ${positionClasses}`}
      >
        <div
          key={step}
          ref={cardRef}
          role="dialog"
          aria-modal="false"
          aria-label={STEP_META[step].title}
          tabIndex={-1}
          className={`relative rounded-2xl p-4 md:p-5 outline-none md:max-h-[76vh] md:overflow-y-auto ${
            reducedMotion ? "" : "tutorial-card-in"
          }`}
          style={{
            background: "linear-gradient(180deg, #06122B 0%, #04101F 100%)",
            border: "1px solid rgba(124,245,225,0.30)",
            boxShadow: "0 18px 48px rgba(0,0,0,0.55), 0 0 28px rgba(18,167,160,0.22)",
          }}
        >
          {/* Step indicator */}
          <div className="flex items-center justify-between gap-3">
            <StepDots step={step} />
            <span
              className="text-[10px] uppercase tracking-widest font-semibold"
              style={{ color: "#7CF5E1" }}
            >
              {STEP_META[step].label}
            </span>
          </div>
          <span className="sr-only">Step {step + 1} of 6</span>

          <h3
            className="mt-2 text-lg font-bold font-display leading-tight"
            style={{ color: "#FFD166" }}
          >
            {STEP_META[step].title}
          </h3>

          {/* Step bodies */}
          {step === 0 && (
            <p className="mt-1 text-sm opacity-85 leading-relaxed">
              {
                "Let's send your first dive — your coach will point the way. It only takes a minute."
              }
            </p>
          )}

          {step === 1 && (
            <>
              <p className="mt-1 text-sm opacity-85 leading-relaxed">
                {`Pick any glowing FREE dig site. Your tutorial dive completes in just ${humanDuration(
                  CONFIG.tutorialDiveMs
                )}!`}
              </p>
              <p className="mt-2 text-[11px] leading-relaxed opacity-60">
                Tap a glowing pin on the map, choose the Tideband squad, then hit Deploy.
              </p>
            </>
          )}

          {step === 2 && (
            <div
              className="mt-3 flex items-center gap-3 rounded-xl p-3"
              style={{
                background: "rgba(255,209,102,0.08)",
                border: "1px solid rgba(255,209,102,0.28)",
              }}
            >
              <CountdownRing
                progress={ringProgress}
                size={64}
                stroke={6}
                color="#FFD166"
                glow
                label={<span style={{ fontSize: 11 }}>{formatTime(remainingMs)}</span>}
              />
              <div className="min-w-0 flex-1">
                <div className="text-[10px] uppercase tracking-widest opacity-60">
                  Dive surfaces in
                </div>
                <p
                  key={factIndex}
                  className="tutorial-fact mt-0.5 text-xs leading-snug opacity-90"
                >
                  {FUN_FACTS[factIndex]}
                </p>
              </div>
            </div>
          )}

          {step === 3 && (
            <p className="mt-1 text-sm opacity-85 leading-relaxed">
              Tap Claim to collect your GOLD — the glowing button is waiting on your Home
              burrow.
            </p>
          )}

          {step === 4 && (
            <>
              <p className="mt-1 text-sm opacity-85 leading-relaxed">
                {`You earned ${earned.toLocaleString()} GOLD! You're ready for real ${humanDuration(
                  CONFIG.diveDurationMs
                )} dives.`}
              </p>
              <div
                className="mt-3 flex items-center gap-2 rounded-xl px-3 py-2"
                style={{
                  background:
                    "linear-gradient(135deg, rgba(255,209,102,0.16), rgba(255,122,26,0.10))",
                  border: "1px solid rgba(255,209,102,0.40)",
                }}
              >
                <GoldIcon size={18} />
                <span className="font-bold font-display" style={{ color: "#FFD166" }}>
                  +{earned.toLocaleString()} GOLD
                </span>
              </div>
            </>
          )}

          {step === 5 && (
            <>
              <p className="mt-1 text-sm opacity-85 leading-relaxed">
                Crabtopia is your oyster — pick a path to dive deeper:
              </p>
              <div className="mt-3 grid grid-cols-1 gap-2">
                {WHATS_NEXT_LINKS.map((link) => (
                  <button
                    key={link.title}
                    type="button"
                    onClick={() => finishTutorial(link.screen)}
                    className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-all duration-150 hover:-translate-y-0.5 active:scale-[0.98]"
                    style={{
                      background: "rgba(18,167,160,0.10)",
                      border: "1px solid rgba(124,245,225,0.22)",
                      minHeight: 48,
                    }}
                  >
                    <span className="text-xl shrink-0" aria-hidden="true">
                      {link.icon}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-bold">
                        {link.title} <span className="opacity-40">→</span>
                      </span>
                      <span className="block text-[10px] opacity-60">{link.desc}</span>
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}

          {/* Footer: skip link + primary CTA */}
          {step < 5 && cta != null && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                onClick={handleSkip}
                className="text-[11px] underline underline-offset-2 opacity-50 hover:opacity-90 transition-opacity py-2"
              >
                Skip tutorial
              </button>
              <GlowButton variant={cta.variant} size="md" onClick={cta.action}>
                {cta.label}
              </GlowButton>
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes tutorialBurst {
          0% { transform: translate(-50%, -50%) scale(0.3); opacity: 0; }
          12% { opacity: 1; }
          100% { transform: translate(calc(-50% + var(--tx, 0px)), calc(-50% + var(--ty, 0px))) scale(1); opacity: 0; }
        }
        .tutorial-particle {
          position: absolute;
          left: 0;
          top: 0;
          border-radius: 9999px;
          opacity: 0;
          animation: tutorialBurst 1.5s cubic-bezier(0.16, 0.84, 0.44, 1) forwards;
        }
        @keyframes tutorialFactIn {
          from { opacity: 0; transform: translateY(5px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .tutorial-fact { animation: tutorialFactIn 0.6s ease both; }
        @keyframes tutorialCardIn {
          from { opacity: 0; transform: translateY(12px) scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        .tutorial-card-in { animation: tutorialCardIn 0.28s ease-out both; }
        @keyframes tutorialPulse {
          0%, 100% { transform: scale(1); opacity: 0.9; }
          50% { transform: scale(1.07); opacity: 0.35; }
        }
        .tutorial-target-pulse {
          position: absolute;
          width: 180px;
          height: 180px;
          margin-left: -90px;
          margin-top: -90px;
          border-radius: 9999px;
          border: 2px dashed rgba(124, 245, 225, 0.75);
          box-shadow: 0 0 26px rgba(124, 245, 225, 0.30), inset 0 0 22px rgba(124, 245, 225, 0.10);
          animation: tutorialPulse 1.7s ease-in-out infinite;
          pointer-events: none;
        }
      `}</style>
    </div>
  );
}

// ---------- Sub-components ----------

function StepDots({ step }: { step: TutorialStep }) {
  return (
    <div className="flex items-center gap-1.5" aria-hidden="true">
      {([0, 1, 2, 3, 4, 5] as TutorialStep[]).map((i) => (
        <span
          key={i}
          className="rounded-full transition-all duration-200"
          style={{
            width: i === step ? 18 : 6,
            height: 6,
            background:
              i === step
                ? "#FFD166"
                : i < step
                  ? "rgba(124,245,225,0.85)"
                  : "rgba(255,255,255,0.16)",
            boxShadow: i === step ? "0 0 8px rgba(255,209,102,0.55)" : undefined,
          }}
        />
      ))}
    </div>
  );
}
