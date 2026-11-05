// Crabtopia - Onboarding with cinematic lore intro + starter crab selection
"use client";

import { useState, useEffect } from "react";
import { useGame } from "../../store/gameStore";
import { GlowButton, PlanktonField } from "../ui";
import { ClassArtImage } from "../CrabArtImage";
import type { ClassId, FactionId } from "../../types";

type Phase = "splash" | "cinematic" | "name";

const CINEMATIC_PANELS = [
  {
    art: "/art/crabtopia-city.png",
    title: "The Shellfolk Commonwealth",
    body: "Long ago, the hermit crabs of the Shellfolk Commonwealth lived under one banner. Crabs of every faction shared the tide gardens, traded in the bazaars, and dug for treasure side by side.",
    accent: "#7CF5E1",
  },
  {
    art: "/art/biome-coral.png",
    title: "The Great Reef Cracked",
    body: "Then the Great Coral Reef cracked open, spilling glittering Gold-veins into the sea. Six houses split apart to claim the treasure. Today every house digs, plunders, and trades while the veins run dry...",
    accent: "#FFD166",
  },
  {
    art: "/art/biome-storm.png",
    title: "A Burrow, A Tideband, A Destiny",
    body: "You inherit a small Burrow and five Rookie Crabs. Below, a legendary Leviathan stirs. Above, the Tidelord throne sits empty. Will you rise to claim it?",
    accent: "#7A5CFF",
  },
];

const STARTER_CRABS: {
  id: string;
  label: string;
  faction: string;
  classId: ClassId;
  factionId: FactionId;
  color: string;
  blurb: string;
}[] = [
  {
    id: "coral",
    label: "Coral Bulwark",
    faction: "Coral Court",
    classId: "bulwark",
    factionId: "coral_court",
    color: "#FF6F91",
    blurb: "Balanced, support synergy. A brave little tank.",
  },
  {
    id: "cinder",
    label: "Cinder Reaver",
    faction: "Cinderreef",
    classId: "reaver",
    factionId: "cinderreef",
    color: "#FF7A1A",
    blurb: "Burst damage. Spiky, asymmetric, fierce.",
  },
  {
    id: "storm",
    label: "Storm Skitter",
    faction: "Stormwake",
    classId: "skitter",
    factionId: "stormwake",
    color: "#7A5CFF",
    blurb: "Speed and crit. Small, long-legged, quick.",
  },
];

export default function OnboardingScreen() {
  const initPlayer = useGame((s) => s.initPlayer);
  const [phase, setPhase] = useState<Phase>("splash");
  const [panelIdx, setPanelIdx] = useState(0);
  const [name, setName] = useState("");
  const [pickedStarter, setPickedStarter] = useState<string | null>(null);

  // Auto-advance cinematic panels every 7s if user doesn't click
  useEffect(() => {
    if (phase !== "cinematic") return;
    const t = setTimeout(() => {
      if (panelIdx < CINEMATIC_PANELS.length - 1) {
        setPanelIdx((i) => i + 1);
      }
    }, 7000);
    return () => clearTimeout(t);
  }, [phase, panelIdx]);

  const handleStart = () => {
    const finalName = name.trim() || "Shellwarden";
    initPlayer(finalName);
  };

  const panel = CINEMATIC_PANELS[panelIdx];

  // ---------------- SPLASH PHASE ----------------
  if (phase === "splash") {
    return (
      <Shell
        heroArt="/art/crabtopia-city.png"
        accent="#7CF5E1"
      >
        <div className="relative z-10 max-w-3xl w-full text-center">
          <img
            src="/art/ui/logo.png"
            alt="Crabtopia"
            height={80}
            style={{ height: 80, width: "auto", margin: "0 auto" }}
            draggable={false}
            className="mb-3 animate-bob"
          />
          <p className="text-base md:text-xl mb-1 font-display" style={{ color: "#7CF5E1" }}>
            Dive. Plunder. Breed. Battle.
          </p>
          <p className="text-xs md:text-sm opacity-70 mb-6 max-w-xl mx-auto">
            An idle PvP crab-collecting world. Send teams on dive expeditions, raid rivals,
            breed legendary crabs, and battle in the coliseum. Six factions. Eight classes.
            Sixty-four breeds. One currency: GOLD.
          </p>

          <GlowButton
            variant="gold"
            size="lg"
            onClick={() => {
              setPhase("cinematic");
              setPanelIdx(0);
            }}
          >
            🦀 Begin Your Tide
          </GlowButton>

          {/* Starter crab preview */}
          <div className="flex justify-center gap-2 mt-6">
            {STARTER_CRABS.map((c) => (
              <div
                key={c.id}
                className="relative rounded-xl p-2"
                style={{
                  background: `linear-gradient(180deg, ${c.color}22, transparent)`,
                  border: `1px solid ${c.color}44`,
                }}
              >
                <div
                  style={{ filter: `drop-shadow(0 4px 10px ${c.color}66)` }}
                  role="img"
                  aria-label={c.label}
                >
                  <ClassArtImage classId={c.classId} faction={c.factionId} size={80} />
                </div>
                <div className="text-[10px] mt-1 font-bold" style={{ color: c.color }}>
                  {c.label}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 text-[10px] opacity-50">
            Free to play · No blockchain · Cross-platform (Web · Android · iOS)
          </div>
        </div>
      </Shell>
    );
  }

  // ---------------- CINEMATIC PHASE ----------------
  if (phase === "cinematic") {
    return (
      <Shell heroArt={panel.art} accent={panel.accent}>
        <div className="relative z-10 max-w-2xl w-full">
          {/* Panel progress dots */}
          <div className="flex justify-center gap-2 mb-6">
            {CINEMATIC_PANELS.map((_, i) => (
              <button
                key={i}
                onClick={() => setPanelIdx(i)}
                aria-label={`Story panel ${i + 1}`}
                className="rounded-full transition-all"
                style={{
                  width: i === panelIdx ? 28 : 10,
                  height: 10,
                  background:
                    i === panelIdx
                      ? panel.accent
                      : i < panelIdx
                      ? "rgba(255,255,255,0.55)"
                      : "rgba(255,255,255,0.20)",
                  boxShadow: i === panelIdx ? `0 0 12px ${panel.accent}aa` : undefined,
                }}
              />
            ))}
          </div>

          {/* Cinematic panel */}
          <div
            key={panelIdx}
            className="rounded-2xl p-6 md:p-8 text-center animate-fade-in-up"
            style={{
              background: "rgba(6,18,43,0.78)",
              backdropFilter: "blur(12px)",
              border: `1px solid ${panel.accent}55`,
              boxShadow: `0 16px 60px ${panel.accent}33, inset 0 0 0 1px rgba(255,255,255,0.04)`,
            }}
          >
            <h2
              className="text-2xl md:text-3xl font-bold mb-3 font-display"
              style={{ color: panel.accent, textShadow: `0 0 24px ${panel.accent}55` }}
            >
              {panel.title}
            </h2>
            <p className="text-sm md:text-base opacity-85 leading-relaxed mb-6 max-w-lg mx-auto">
              {panel.body}
            </p>

            <div className="flex items-center justify-center gap-3">
              {panelIdx > 0 && (
                <GlowButton
                  variant="ghost"
                  size="md"
                  onClick={() => setPanelIdx((i) => Math.max(0, i - 1))}
                >
                  ← Back
                </GlowButton>
              )}
              {panelIdx < CINEMATIC_PANELS.length - 1 ? (
                <GlowButton
                  variant="teal"
                  size="md"
                  onClick={() => setPanelIdx((i) => i + 1)}
                >
                  Continue →
                </GlowButton>
              ) : (
                <GlowButton
                  variant="gold"
                  size="md"
                  onClick={() => setPhase("name")}
                >
                  Claim Your Burrow →
                </GlowButton>
              )}
            </div>

            <button
              onClick={() => setPhase("name")}
              className="mt-4 text-[11px] opacity-50 hover:opacity-100 underline-offset-2 hover:underline"
            >
              Skip story
            </button>
          </div>
        </div>

        <style jsx>{`
          @keyframes fadeInUp {
            from { opacity: 0; transform: translateY(12px); }
            to   { opacity: 1; transform: translateY(0); }
          }
          .animate-fade-in-up { animation: fadeInUp 0.5s ease-out; }
        `}</style>
      </Shell>
    );
  }

  // ---------------- NAME PHASE ----------------
  return (
    <Shell heroArt="/art/crabtopia-city.png" accent="#FFD166">
      <div className="relative z-10 max-w-2xl w-full">
        <div
          className="rounded-2xl p-5 max-w-md mx-auto"
          style={{
            background: "rgba(6,18,43,0.85)",
            backdropFilter: "blur(10px)",
            border: "2px solid rgba(255,209,102,0.35)",
            boxShadow: "0 12px 40px rgba(255,209,102,0.18)",
          }}
        >
          <div className="text-sm mb-2 opacity-90 text-center">
            You inherit 5 Rookie Crabs and 2000 GOLD. What is your Shellwarden name?
          </div>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Enter your name..."
            maxLength={20}
            className="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white placeholder-white/40 text-center mb-3 focus:outline-none focus:border-[#FFD166]"
            autoFocus
            onKeyDown={(e) => e.key === "Enter" && handleStart()}
          />

          <div className="text-[11px] opacity-70 mb-2 text-center uppercase tracking-wide">
            Pick your first crab
          </div>
          <div className="grid grid-cols-3 gap-2 mb-3">
            {STARTER_CRABS.map((c) => {
              const picked = pickedStarter === c.id;
              return (
                <button
                  key={c.id}
                  onClick={() => setPickedStarter(c.id)}
                  className="rounded-lg p-2 text-center transition-all"
                  style={{
                    background: picked
                      ? `linear-gradient(180deg, ${c.color}33, ${c.color}11)`
                      : "rgba(255,255,255,0.04)",
                    border: `1px solid ${picked ? c.color : "rgba(255,255,255,0.10)"}`,
                    boxShadow: picked ? `0 0 16px ${c.color}66` : undefined,
                    transform: picked ? "scale(1.04)" : undefined,
                  }}
                >
                  <div
                    className="mx-auto w-fit"
                    style={{ filter: `drop-shadow(0 2px 6px ${c.color}66)` }}
                    role="img"
                    aria-label={c.label}
                  >
                    <ClassArtImage classId={c.classId} faction={c.factionId} size={48} />
                  </div>
                  <div className="text-[10px] font-bold mt-1" style={{ color: c.color }}>
                    {c.label}
                  </div>
                  <div className="text-[9px] opacity-60 leading-tight mt-0.5 hidden md:block">
                    {c.blurb}
                  </div>
                </button>
              );
            })}
          </div>

          <GlowButton
            variant="teal"
            size="md"
            className="w-full"
            onClick={handleStart}
          >
            {pickedStarter ? "Begin Your Journey →" : "Start with Default Roster →"}
          </GlowButton>

          <div className="text-[10px] opacity-50 text-center mt-3">
            (You'll get all 3 starters — this just picks who appears first on your home screen.)
          </div>
        </div>
      </div>
    </Shell>
  );
}

// ---------------- SHARED SHELL ----------------
function Shell({
  children,
  heroArt,
  accent,
}: {
  children: React.ReactNode;
  heroArt: string;
  accent: string;
}) {
  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center p-4 text-white relative overflow-hidden"
      style={{ background: "linear-gradient(180deg, #0A1B3D 0%, #06122B 60%, #04101F 100%)" }}
    >
      <div
        className="absolute inset-0 bg-cover bg-center opacity-40 transition-all duration-700"
        style={{ backgroundImage: `url(${heroArt})` }}
      />
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, rgba(10,27,61,0.55), rgba(6,18,43,0.92))",
        }}
      />
      {/* Accent glow blob */}
      <div
        className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[600px] rounded-full opacity-20 pointer-events-none transition-all duration-700"
        style={{
          background: `radial-gradient(circle, ${accent}, transparent 60%)`,
        }}
      />
      <PlanktonField count={14} />
      {children}
    </div>
  );
}
