// Crabtopia — AnimatedNumber
// A number that TICKS to its new value (ease-out cubic, ~600ms)
// instead of teleporting — gold/XP changes read as gains and losses,
// not rendering glitches. The first mount renders the real value
// immediately (no from-zero theatrics on load); reduced-motion users
// (OS setting or the in-game toggle) get the instant value.

"use client";

import React from "react";

export interface AnimatedNumberProps {
  value: number;
  format?: (n: number) => string;
  durationMs?: number;
  className?: string;
  style?: React.CSSProperties;
}

export default function AnimatedNumber({
  value,
  format,
  durationMs = 600,
  className,
  style,
}: AnimatedNumberProps): React.ReactNode {
  const [display, setDisplay] = React.useState(value);
  const displayRef = React.useRef(value);

  React.useEffect(() => {
    const from = displayRef.current;
    const to = value;
    if (from === to) {
      setDisplay(to);
      return;
    }
    const reduced =
      typeof window !== "undefined" &&
      (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ||
        document.documentElement.classList.contains("reduce-motion"));
    if (reduced || durationMs <= 0) {
      displayRef.current = to;
      setDisplay(to);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      const v = Math.round(from + (to - from) * eased);
      displayRef.current = v;
      setDisplay(v);
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, durationMs]);

  const fmt = format ?? ((n: number) => n.toLocaleString());
  return (
    <span className={className} style={style} data-animated-number>
      {fmt(display)}
    </span>
  );
}
