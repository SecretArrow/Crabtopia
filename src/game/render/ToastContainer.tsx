// Crabtopia - Toast notification container (Glow-Tide styled, auto-dismiss handled by store).
"use client";
import { useEffect, useState } from "react";
import { useGame } from "../store/gameStore";

const VARIANT_STYLES: Record<string, { bg: string; border: string; icon: string; glow: string }> = {
  default:  { bg: "linear-gradient(135deg, #0A1B3D 0%, #06122B 100%)", border: "rgba(124,245,225,0.25)", icon: "💬", glow: "rgba(18,167,160,0.30)" },
  success:  { bg: "linear-gradient(135deg, #0E2A1F 0%, #06122B 100%)", border: "rgba(79,180,119,0.55)",  icon: "✅", glow: "rgba(79,180,119,0.40)" },
  error:    { bg: "linear-gradient(135deg, #2A1410 0%, #06122B 100%)", border: "rgba(255,122,26,0.55)",  icon: "⚠️", glow: "rgba(255,122,26,0.40)" },
  warning:  { bg: "linear-gradient(135deg, #2A2310 0%, #06122B 100%)", border: "rgba(255,209,102,0.55)", icon: "🔶", glow: "rgba(255,209,102,0.40)" },
};

export default function ToastContainer() {
  const toasts = useGame((s) => s.toasts);
  const dismiss = useGame((s) => s.dismissToast);

  // Track each toast's life for the progress bar
  const [, setTick] = useState(0);
  useEffect(() => {
    if (toasts.length === 0) return;
    const i = setInterval(() => setTick((t) => t + 1), 60);
    return () => clearInterval(i);
  }, [toasts.length]);

  return (
    // Toast cards are deliberately click-through (only the small
    // Dismiss button re-enables pointer events): this stack renders at
    // the root level, above screen content, and a card body that
    // swallows clicks will sit on top of a modal's own controls (the
    // stack overlaps a centred dialog's top-right corner, where its
    // close button lives) and block them. Toasts auto-dismiss after
    // 4s; the ✕ stays available for immediate dismissal.
    <div className="fixed top-3 right-3 z-[100] flex flex-col gap-2 max-w-[min(92vw,360px)] pointer-events-none">
      {toasts.map((t) => {
        const s = VARIANT_STYLES[t.variant] ?? VARIANT_STYLES.default;
        const age = Date.now() - (t.id.includes("_") ? Number(t.id.split("_")[1]) : Date.now());
        const lifePct = Math.max(0, Math.min(1, age / 4000));
        return (
          <div
            key={t.id}
            role="status"
            aria-live="polite"
            className="relative overflow-hidden rounded-xl px-3 py-2 text-white shadow-lg animate-toast-in"
            style={{
              background: s.bg,
              border: `1px solid ${s.border}`,
              boxShadow: `0 8px 24px ${s.glow}, 0 0 0 1px ${s.border} inset`,
              backdropFilter: "blur(8px)",
            }}
          >
            <div className="flex items-start gap-2">
              <span className="text-base leading-none mt-0.5">{s.icon}</span>
              <div className="min-w-0 flex-1">
                <div className="font-bold text-sm font-display leading-tight">{t.title}</div>
                {t.description && (
                  <div className="text-xs opacity-80 mt-0.5 leading-snug">{t.description}</div>
                )}
              </div>
              <button
                aria-label="Dismiss"
                onClick={(e) => {
                  e.stopPropagation();
                  dismiss(t.id);
                }}
                className="pointer-events-auto opacity-40 hover:opacity-100 text-xs leading-none -mr-1 -mt-1"
              >
                ✕
              </button>
            </div>
            {/* Life bar */}
            <div
              className="absolute left-0 right-0 bottom-0 h-0.5"
              style={{
                background: s.border,
                transformOrigin: "left",
                transform: `scaleX(${1 - lifePct})`,
                transition: "transform 60ms linear",
              }}
            />
          </div>
        );
      })}
      <style jsx>{`
        @keyframes toast-in {
          from { transform: translateX(120%) scale(0.9); opacity: 0; }
          to   { transform: translateX(0) scale(1); opacity: 1; }
        }
        .animate-toast-in { animation: toast-in 0.25s cubic-bezier(0.18, 0.89, 0.32, 1.28); }
      `}</style>
    </div>
  );
}
