// Crabtopia - StaminaBar: shared stamina + wound indicator.
// Reads the lazy projection from engine/stamina.ts (no mutation): the
// bar shows the crab's stamina as of `now`, green/amber/red by level,
// and a wounded badge with the heal countdown while a wound lasts.
"use client";

import type { Crab } from "../types";
import { MAX_STAMINA } from "../engine/config";
import { isWounded, staminaOf, woundRemainingMs } from "../engine/stamina";

/** Stamina level color: green ≥ 50, amber 25–49, red < 25. */
export function staminaColor(value: number): string {
  if (value >= 50) return "#4FB477";
  if (value >= 25) return "#FFD166";
  return "#FF6F91";
}

interface Props {
  crab: Crab;
  now?: number;
  /** Player's Second Wind expiry (projection runs ×3 under it). */
  boostUntil?: number;
  /** Hide the ⚡ numeric label (dense grids). */
  compact?: boolean;
}

export default function StaminaBar({
  crab,
  now,
  boostUntil = 0,
  compact = false,
}: Props) {
  const t = now ?? Date.now();
  const wounded = isWounded(crab, t);
  const value = Math.floor(staminaOf(crab, t, boostUntil));
  const pct = Math.max(0, Math.min(100, (value / MAX_STAMINA) * 100));
  const color = staminaColor(value);

  return (
    <div className="w-full">
      <div className="flex items-center gap-1">
        {!compact && (
          <span className="text-[9px] font-bold" style={{ color }}>
            ⚡{value}
          </span>
        )}
        <div
          className="flex-1 h-[5px] rounded-full overflow-hidden"
          style={{ background: "rgba(255,255,255,0.12)" }}
          role="progressbar"
          aria-valuenow={value}
          aria-valuemin={0}
          aria-valuemax={MAX_STAMINA}
          aria-label={`Stamina ${value} of ${MAX_STAMINA}`}
        >
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${pct}%`, background: color }}
          />
        </div>
        {compact && (
          <span className="text-[9px] font-bold" style={{ color }}>
            {value}
          </span>
        )}
      </div>
      {wounded && (
        <div
          className="mt-0.5 inline-flex items-center gap-0.5 px-1 py-px rounded text-[8px] font-bold uppercase tracking-wide"
          style={{
            background: "rgba(255,77,109,0.18)",
            color: "#FF8FA3",
            border: "1px solid rgba(255,77,109,0.45)",
          }}
          title="Wounded: cannot deploy and stamina does not regen until healed. Coral Salve cures instantly."
        >
          🩹 Wounded · {Math.ceil(woundRemainingMs(crab, t) / 60000)}m
        </div>
      )}
    </div>
  );
}
