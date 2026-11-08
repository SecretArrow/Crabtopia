// Crabtopia — AmbientLife layer.
// The "very alive" backdrop behind the main screens: drifting bubbles
// rising from the sea floor, plankton motes, and a slow light-ray
// sweep. Transform-only CSS animations (no per-frame JS), counts
// capped per viewport (see engine/ambient.ts), positions seeded so
// the layout is stable across re-renders.
//
// Motion gating: renders NOTHING when motion is reduced — either via
// the OS media query or the in-game "Reduce motion" toggle (which
// adds .reduce-motion to <html>). The CSS .reduce-motion rule would
// also freeze these keyframes, but returning null keeps the layer
// out of the DOM entirely (and makes the behaviour testable).
// Never mounted inside battle (GameShell skips it on the arena
// screen — the battle has its own presentation) and never blocks
// taps (pointer-events: none).
"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import {
  AMBIENT_COUNTS,
  ambientBubbles,
  ambientMotes,
} from "../engine/ambient";
import { motionReduced } from "./settingsPrefs";

const AMBIENT_KEYFRAMES = `
@keyframes ambientBubble {
  0% { transform: translate(0, 0); }
  25% { transform: translate(var(--sway), -27vh); }
  50% { transform: translate(calc(var(--sway) * -1), -54vh); }
  75% { transform: translate(var(--sway), -81vh); }
  100% { transform: translate(0, -108vh); }
}
@keyframes ambientMote {
  0%, 100% { transform: translate(0, 0); opacity: 0.35; }
  50% { transform: translate(6px, -18px); opacity: 0.7; }
}
@keyframes ambientRay {
  0% { transform: translateX(-46px) rotate(16deg); opacity: 0.5; }
  100% { transform: translateX(46px) rotate(20deg); opacity: 1; }
}
`;

// Subscribe to both motion signals: the OS media query and the
// in-game toggle (a class flip on <html>).
function subscribeMotion(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  mq.addEventListener?.("change", callback);
  const observer = new MutationObserver(callback);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"],
  });
  return () => {
    mq.removeEventListener?.("change", callback);
    observer.disconnect();
  };
}

function getMotionAllowed(): boolean {
  if (typeof window === "undefined") return true;
  return !motionReduced(
    document.documentElement,
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/** True unless the user (or OS) asked for reduced motion. */
export function useMotionAllowed(): boolean {
  return useSyncExternalStore(subscribeMotion, getMotionAllowed, () => true);
}

function useIsPhone(): boolean {
  const [isPhone, setIsPhone] = useState(
    () => typeof window !== "undefined" && window.innerWidth < 768
  );
  useEffect(() => {
    const onResize = () => setIsPhone(window.innerWidth < 768);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return isPhone;
}

export default function AmbientLife(): React.ReactNode {
  const motionAllowed = useMotionAllowed();
  const isPhone = useIsPhone();
  const counts = isPhone ? AMBIENT_COUNTS.phone : AMBIENT_COUNTS.desktop;
  // Fixed seeds: the layout is identical on every mount.
  const bubbles = ambientBubbles(0xC0FFEE, counts.bubbles);
  const motes = ambientMotes(0xBADA55, counts.motes);
  if (!motionAllowed) return null;
  return (
    <div
      data-testid="ambient-life"
      className="pointer-events-none absolute inset-0 overflow-hidden"
      aria-hidden="true"
    >
      <style>{AMBIENT_KEYFRAMES}</style>
      {/* Light-ray sweep */}
      {[
        { left: "12%", width: 110, delay: 0 },
        { left: "68%", width: 150, delay: -14 },
      ].map((ray, i) => (
        <div
          key={`ray-${i}`}
          className="absolute"
          style={{
            left: ray.left,
            top: "-20%",
            height: "140%",
            width: ray.width,
            background:
              "linear-gradient(180deg, rgba(124,245,225,0.10) 0%, rgba(124,245,225,0.02) 55%, transparent 75%)",
            animation: `ambientRay 32s ease-in-out ${ray.delay}s infinite alternate`,
          }}
        />
      ))}
      {/* Rising bubbles */}
      {bubbles.map((b, i) => (
        <span
          key={`bubble-${i}`}
          className="absolute rounded-full"
          style={
            {
              left: `${b.leftPct}%`,
              bottom: -24,
              width: b.sizePx,
              height: b.sizePx,
              opacity: b.opacity,
              background:
                "radial-gradient(circle at 35% 30%, rgba(255,255,255,0.75) 0%, rgba(124,245,225,0.25) 45%, rgba(124,245,225,0.05) 100%)",
              border: "1px solid rgba(255,255,255,0.35)",
              boxShadow: "0 0 6px rgba(124,245,225,0.35)",
              animation: `ambientBubble ${b.durationS}s linear ${b.delayS}s infinite`,
              "--sway": `${b.swayPx}px`,
            } as React.CSSProperties
          }
        />
      ))}
      {/* Drifting motes */}
      {motes.map((m, i) => (
        <span
          key={`mote-${i}`}
          className="absolute rounded-full"
          style={{
            left: `${m.leftPct}%`,
            top: `${m.topPct}%`,
            width: m.sizePx,
            height: m.sizePx,
            background: i % 3 === 0 ? "#FFD166" : "#7CF5E1",
            boxShadow: `0 0 6px ${i % 3 === 0 ? "#FFD166" : "#7CF5E1"}`,
            animation: `ambientMote ${m.durationS}s ease-in-out ${m.delayS}s infinite`,
          }}
        />
      ))}
    </div>
  );
}
