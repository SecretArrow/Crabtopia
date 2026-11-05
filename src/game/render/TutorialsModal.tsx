// Crabtopia - TutorialsModal: replayable Codex tutorials (spec §9).
// Tooltips, never walls of text: every system has a short, visual tutorial the
// player can replay anytime. Each tutorial is a deck of 3-5 slides with a big
// emoji art panel and 2-3 short sentences per slide.
//
// Views:
//   - Catalog: filter pills (All / Basics / Intermediate / Advanced), progress
//     banner ("N of 12 completed"), 2-col card grid with Start / Replay CTAs.
//   - Viewer: top bar (back, title, "Slide N of M"), progress dots, slide card
//     with art panel + short body, Previous / Next / Finish navigation,
//     "Skip to end" link, and a "Try it now ->" CTA on the final slide of any
//     tutorial tied to a real screen (launch).
//
// Completion is mocked in local state (no localStorage). Finishing a tutorial
// fires a toast: "Tutorial complete: {title}! +25 GOLD" (no real GOLD granted).
//
// Mounting: render <TutorialsModal onClose={() => setTutorialsOpen(false)} />
// from GameShell (or any header button) — see agent-ctx notes.

"use client";

import { useEffect, useMemo, useState } from "react";
import { useGame } from "../store/gameStore";
import { GlassPanel, GlowButton, StatChip, SectionTitle, EmptyState } from "./ui";

// ---------- TYPES ----------

type Difficulty = "basics" | "intermediate" | "advanced";
type FilterId = "all" | Difficulty;

interface Slide {
  title: string;
  /** 1-3 short paragraphs; 2-3 sentences total (never walls of text). */
  body: string[];
  /** Big emoji rendered as the slide's art panel centerpiece. */
  artHint?: string;
}

interface Tutorial {
  id: string;
  title: string;
  icon: string;
  /** Human read like "~2 min". */
  duration: string;
  difficulty: Difficulty;
  slides: Slide[];
  /** Screen id for the final slide's "Try it now ->" CTA. */
  launch?: string;
}

// ---------- COLORS (Glow-Tide palette; no blues/indigos) ----------

const TEAL = "#7CF5E1";
const TEAL_DEEP = "#12A7A0";
const GOLD = "#FFD166";
const CORAL = "#FF6F91";
const GREEN = "#22C55E";

const DIFFICULTY_META: Record<Difficulty, { label: string; color: string }> = {
  basics: { label: "Basics", color: TEAL },
  intermediate: { label: "Intermediate", color: GOLD },
  advanced: { label: "Advanced", color: CORAL },
};

const FILTERS: { id: FilterId; label: string }[] = [
  { id: "all", label: "All" },
  { id: "basics", label: "Basics" },
  { id: "intermediate", label: "Intermediate" },
  { id: "advanced", label: "Advanced" },
];

/** Friendly names for launchable screens (matches GameShell routing). */
const SCREEN_NAMES: Record<string, string> = {
  home: "Home",
  map: "Dive Map",
  teams: "Teams",
  hall: "Driftwood Hall",
  nursery: "Nursery",
  bazaar: "Bazaar",
  coliseum: "Coliseum",
  codex: "Codex",
};

// ---------- TUTORIAL CATALOG (12 guides, 3-5 slides each) ----------

const TUTORIALS: Tutorial[] = [
  {
    id: "diving-101",
    title: "Diving 101",
    icon: "🤿",
    duration: "~2 min",
    difficulty: "basics",
    launch: "map",
    slides: [
      {
        title: "Grab five crabs",
        artHint: "🦀",
        body: [
          "A dive team needs exactly 5 crabs. Only idle crabs can deploy — busy ones are grayed out.",
          "Higher team Battle Power unlocks richer sites.",
        ],
      },
      {
        title: "Drop them on a site",
        artHint: "🗺️",
        body: [
          "Open the Dive Map and tap any free pin to deploy your team.",
          "Digs take a few minutes; deeper pins pay more but demand more BP.",
        ],
      },
      {
        title: "Claim the GOLD",
        artHint: "💰",
        body: [
          "When the timer hits zero, tap Claim to bank the reward.",
          "Unclaimed loot can be raided for up to 65% — claim promptly.",
        ],
      },
    ],
  },
  {
    id: "raiding-plunder",
    title: "Raiding & Plunder",
    icon: "🏴‍☠️",
    duration: "~3 min",
    difficulty: "intermediate",
    launch: "map",
    slides: [
      {
        title: "Spot a target",
        artHint: "🎯",
        body: [
          "Occupied sites flash a raid icon on the map.",
          "You need 5 free crabs and spare raid energy to hit one.",
        ],
      },
      {
        title: "BP brackets",
        artHint: "⚔️",
        body: [
          "Raiders only see targets inside their Battle Power bracket.",
          "Climb a bracket and richer hoards open up.",
        ],
      },
      {
        title: "Play a tactic card",
        artHint: "🃏",
        body: [
          "Before the auto-battle resolves, commit one tactic card.",
          "Counters beat raw power — hover a card to read its tooltip.",
        ],
      },
      {
        title: "The 65% rule",
        artHint: "🪙",
        body: [
          "A successful raid steals up to 65% of the target's unclaimed dive rewards.",
          "Guard Posts and fast claiming cut that share down.",
        ],
      },
    ],
  },
  {
    id: "reinforcements",
    title: "Reinforcements",
    icon: "📣",
    duration: "~2 min",
    difficulty: "intermediate",
    launch: "hall",
    slides: [
      {
        title: "When you're short",
        artHint: "🤙",
        body: [
          "Need bodies for a dive or raid? Call reinforcements to borrow crabs for one job.",
          "Rented crabs return home automatically afterwards.",
        ],
      },
      {
        title: "Driftwood Hall",
        artHint: "🏛️",
        body: [
          "The Hall lists idle crabs for hire — NPC and player-owned alike.",
          "Owners earn rent; renters get instant muscle.",
        ],
      },
      {
        title: "Hire smart",
        artHint: "🤝",
        body: [
          "Compare BP, class and daily rate before signing.",
          "A cheap Bulwark can anchor your front line all day.",
        ],
      },
    ],
  },
  {
    id: "breeding-genetics",
    title: "Breeding & Genetics",
    icon: "🧬",
    duration: "~4 min",
    difficulty: "advanced",
    launch: "nursery",
    slides: [
      {
        title: "Three gene slots",
        artHint: "🧬",
        body: [
          "Every crab carries three gene slots: Dominant (D), R1 and R2.",
          "The dominant gene drives looks, stats and battle style.",
        ],
      },
      {
        title: "Read the odds",
        artHint: "📊",
        body: [
          "The odds screen previews every possible egg before you confirm a pairing.",
          "Breeding is never a blind gamble — check the numbers first.",
        ],
      },
      {
        title: "Stack purity",
        artHint: "✨",
        body: [
          "Matching gene slots between parents boost the odds of passing rare traits.",
          "Pure lines command premium prices at the Bazaar.",
        ],
      },
      {
        title: "The rarity ladder",
        artHint: "🌟",
        body: [
          "Eggs roll rarity from Common upward through Rare and Epic.",
          "Legendary crabs hatch at just 0.07% — about 1 in 1,400 eggs.",
        ],
      },
      {
        title: "Hatch & graduate",
        artHint: "🥚",
        body: [
          "Eggs incubate in the nursery and hatch on a timer.",
          "Hatchlings dive as rookies, then graduate into tradable adults.",
        ],
      },
    ],
  },
  {
    id: "bazaar-trading",
    title: "Bazaar Trading",
    icon: "🏪",
    duration: "~3 min",
    difficulty: "intermediate",
    launch: "bazaar",
    slides: [
      {
        title: "Fixed listings",
        artHint: "🏷️",
        body: [
          "List graduated crabs or eggs at a fixed price.",
          "Rookies and busy crabs cannot be traded.",
        ],
      },
      {
        title: "Auctions",
        artHint: "🔨",
        body: [
          "Put rare specimens up for auction and let bidders fight it out.",
          "The highest bid at the hammer takes it home.",
        ],
      },
      {
        title: "Direct offers",
        artHint: "📜",
        body: [
          "Spot an overpriced listing? Send the seller a direct offer.",
          "Negotiation is free — the worst they can say is no.",
        ],
      },
      {
        title: "Fees & unlock",
        artHint: "💸",
        body: [
          "Every finished sale pays a 3.85% marketplace fee.",
          "The Bazaar itself unlocks at Shellwarden level 10.",
        ],
      },
    ],
  },
  {
    id: "arena-combat",
    title: "Arena Combat",
    icon: "⚔️",
    duration: "~2 min",
    difficulty: "basics",
    launch: "arena",
    slides: [
      {
        title: "5v5, turn-based",
        artHint: "🥊",
        body: [
          "Arena matches are 5v5 and fully turn-based.",
          "You pick the squad — the engine rolls the exchanges.",
        ],
      },
      {
        title: "Energy & cooldowns",
        artHint: "⚡",
        body: [
          "Moves cost energy; heavy ones add cooldowns.",
          "Dump everything early and you'll be passing turns later.",
        ],
      },
      {
        title: "Where they stand",
        artHint: "🛡️",
        body: [
          "Front soaks damage, mid deals it, back heals and buffs.",
          "Same crabs, different row — a very different battle.",
        ],
      },
      {
        title: "Take the prize",
        artHint: "🏆",
        body: [
          "Wins award ranking points and seasonal prizes.",
          "Losses still teach — spectate replays to study tactics.",
        ],
      },
    ],
  },
  {
    id: "formations-tactics",
    title: "Formations & Tactics",
    icon: "🧭",
    duration: "~3 min",
    difficulty: "advanced",
    launch: "arena",
    slides: [
      {
        title: "Front / Mid / Back",
        artHint: "🧭",
        body: [
          "The three rows decide what each crab does in battle.",
          "Place by class role, not by rarity shine.",
        ],
      },
      {
        title: "Class bonuses",
        artHint: "💫",
        body: [
          "Certain class combos grant formation bonuses.",
          "A Bulwark up front empowers back-row casters — watch the bonus chips.",
        ],
      },
      {
        title: "Counter the card",
        artHint: "🃏",
        body: [
          "Every tactic card has a counter card.",
          "Read the enemy formation before locking yours — one counter flips an auto-battle.",
        ],
      },
    ],
  },
  {
    id: "charters-lending",
    title: "Charters & Lending",
    icon: "📜",
    duration: "~3 min",
    difficulty: "advanced",
    slides: [
      {
        title: "Charter a team",
        artHint: "📜",
        body: [
          "Owners charter whole teams to other players for a fixed term and rate.",
          "Think of it as a rental contract with teeth.",
        ],
      },
      {
        title: "The 60% cap",
        artHint: "⚖️",
        body: [
          "Owners always keep at least a 60% share of charter earnings — the system enforces it.",
          "Renter rights keep borrowed crabs safe from reckless use.",
        ],
      },
      {
        title: "Settling up",
        artHint: "🤝",
        body: [
          "When the term ends, earnings settle instantly and crabs walk home.",
          "Break the charter early and a penalty bites.",
        ],
      },
    ],
  },
  {
    id: "economy-sinks",
    title: "Economy & Sinks",
    icon: "🌊",
    duration: "~3 min",
    difficulty: "advanced",
    slides: [
      {
        title: "Faucets vs sinks",
        artHint: "🌊",
        body: [
          "GOLD flows in from dives, raids and quests — the faucets.",
          "It drains out through breeding, fees and insurance — the sinks.",
        ],
      },
      {
        title: "Issuance budget",
        artHint: "📉",
        body: [
          "Daily dive payouts draw from a global issuance budget.",
          "When the budget tightens, reward rates scale down automatically.",
        ],
      },
      {
        title: "Gold Price Index",
        artHint: "📈",
        body: [
          "The GPI tracks a basket of crab and item prices.",
          "A rising GPI means your GOLD buys less — watch the Economy dashboard.",
        ],
      },
      {
        title: "Tide Tax",
        artHint: "🧾",
        body: [
          "Large treasury transfers pay the Tide Tax, a progressive sink.",
          "Split whale-sized transfers to stay under the waves.",
        ],
      },
    ],
  },
  {
    id: "clans-chest",
    title: "Clans & Clan Chest",
    icon: "🏰",
    duration: "~2 min",
    difficulty: "basics",
    slides: [
      {
        title: "Join a banner",
        artHint: "🏰",
        body: [
          "Clans are crews of Shellwardens sharing one banner.",
          "Join from the Clans panel — plenty recruit rookies.",
        ],
      },
      {
        title: "Feed the chest",
        artHint: "🎁",
        body: [
          "Contribute GOLD or items to the clan chest.",
          "Every contribution lifts your rank and the clan's tier.",
        ],
      },
      {
        title: "Tiers pay out",
        artHint: "🎖️",
        body: [
          "Higher clan tiers unlock more chest slots and richer weekly payouts.",
          "Top contributors get first pick of the loot.",
        ],
      },
    ],
  },
  {
    id: "leviathan-raids",
    title: "Leviathan Raids",
    icon: "🐋",
    duration: "~4 min",
    difficulty: "advanced",
    slides: [
      {
        title: "Phased fight",
        artHint: "🐋",
        body: [
          "Leviathan battles run in phases — each shifts the boss's attacks and weak points.",
          "Squads regroup between phases.",
        ],
      },
      {
        title: "Squad roles",
        artHint: "🎯",
        body: [
          "Raids field three squads of five crabs each.",
          "One tanks the maw, one harasses the flanks, one heals from the back.",
        ],
      },
      {
        title: "It fights back",
        artHint: "🛡️",
        body: [
          "The Leviathan retaliates hard during deep phases.",
          "Guard Posts and shield rotations keep your squads standing.",
        ],
      },
      {
        title: "The hoard",
        artHint: "💎",
        body: [
          "A slain Leviathan drops relic parts plus a GOLD hoard split by contribution.",
          "Even a failed raid pays out scrap.",
        ],
      },
    ],
  },
  {
    id: "defense-insurance",
    title: "Defense & Insurance",
    icon: "🗼",
    duration: "~2 min",
    difficulty: "intermediate",
    slides: [
      {
        title: "Guard Posts",
        artHint: "🗼",
        body: [
          "Station crabs at your dig sites as a standing garrison.",
          "A strong post makes raiders think twice — or fail trying.",
        ],
      },
      {
        title: "Dive Insurance",
        artHint: "🛟",
        body: [
          "Insure a dive before deploying it.",
          "If you get raided, insurance refunds part of the loss — payouts are capped per dive tier.",
        ],
      },
      {
        title: "Bounties",
        artHint: "🔍",
        body: [
          "Wronged by a raider? Post a bounty on their head.",
          "Other players hunt them down for the reward — vengeance, outsourced.",
        ],
      },
    ],
  },
];

/** Mock completion state (local only, no localStorage): 8 of 12 done. */
const INITIAL_COMPLETED: string[] = [
  "diving-101",
  "coliseum-combat",
  "clans-chest",
  "raiding-plunder",
  "reinforcements",
  "bazaar-trading",
  "formations-tactics",
  "defense-insurance",
];

// ---------- SMALL SUBCOMPONENTS ----------

function DifficultyBadge({ difficulty }: { difficulty: Difficulty }) {
  const meta = DIFFICULTY_META[difficulty];
  return (
    <span
      className="px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wide whitespace-nowrap"
      style={{ background: meta.color + "1f", color: meta.color, border: `1px solid ${meta.color}44` }}
    >
      {meta.label}
    </span>
  );
}

function TutorialCard({
  tutorial,
  isDone,
  onStart,
}: {
  tutorial: Tutorial;
  isDone: boolean;
  onStart: () => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`Open tutorial: ${tutorial.title}`}
      onClick={onStart}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onStart();
        }
      }}
      className="outline-none focus-visible:ring-2 focus-visible:ring-[#7CF5E1]/60 rounded-2xl transition-transform"
    >
      <GlassPanel className="p-3 sm:p-4 h-full flex flex-col gap-2 cursor-pointer hover:-translate-y-0.5 transition-all duration-200">
        {/* Icon + title + difficulty */}
        <div className="flex items-start gap-2.5">
          <span
            className="shrink-0 flex items-center justify-center rounded-xl text-2xl"
            style={{
              width: 44,
              height: 44,
              background: "rgba(124,245,225,0.10)",
              border: "1px solid rgba(124,245,225,0.20)",
            }}
            aria-hidden="true"
          >
            {tutorial.icon}
          </span>
          <div className="min-w-0 flex-1">
            <div className="font-bold text-sm font-display leading-tight truncate">{tutorial.title}</div>
            <div className="text-[10px] opacity-60 mt-0.5">⏱ {tutorial.duration}</div>
          </div>
          <DifficultyBadge difficulty={tutorial.difficulty} />
        </div>

        {/* Status row */}
        <div className="flex items-center justify-between gap-2 text-[10px]">
          {isDone ? (
            <span className="font-bold" style={{ color: GREEN }}>
              ✓ Completed
            </span>
          ) : (
            <span className="opacity-50">Not started</span>
          )}
          <span className="opacity-50">{tutorial.slides.length} slides</span>
        </div>

        {/* CTA */}
        <div className="mt-auto pt-1">
          <GlowButton size="sm" variant={isDone ? "ghost" : "teal"} onClick={onStart}>
            {isDone ? "↺ Replay" : "▶ Start"}
          </GlowButton>
        </div>
      </GlassPanel>
    </div>
  );
}

/** Decorative art panel: big emoji centerpiece over a soft radial glow + bubbles. */
function SlideArt({ emoji }: { emoji: string }) {
  return (
    <div
      className="relative overflow-hidden rounded-xl flex items-center justify-center mb-4"
      style={{
        height: 132,
        background:
          "radial-gradient(circle at 50% 32%, rgba(124,245,225,0.16), rgba(10,27,61,0.45) 72%)",
        border: "1px solid rgba(124,245,225,0.16)",
      }}
      aria-hidden="true"
    >
      {/* rising bubbles */}
      {[0, 1, 2, 3, 4].map((i) => (
        <span
          key={i}
          className="absolute rounded-full"
          style={{
            left: `${10 + i * 19}%`,
            bottom: `${(i % 3) * 18}%`,
            width: 5 + (i % 3) * 4,
            height: 5 + (i % 3) * 4,
            background: "rgba(124,245,225,0.22)",
            boxShadow: "0 0 8px rgba(124,245,225,0.30)",
            animation: `planktonFloat ${7 + i}s ease-in-out ${i * 1.1}s infinite`,
          }}
        />
      ))}
      <span
        className="text-6xl leading-none select-none"
        style={{ filter: "drop-shadow(0 8px 18px rgba(0,0,0,0.45))" }}
      >
        {emoji}
      </span>
    </div>
  );
}

function ModalFooter({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="mt-4 pt-3 flex items-center justify-between gap-3"
      style={{ borderTop: "1px solid rgba(124,245,225,0.12)" }}
    >
      <p className="text-[10px] sm:text-[11px] opacity-55 leading-tight">
        Tutorials are replayable. New tutorials unlock as features roll out.
      </p>
      <GlowButton variant="ghost" size="sm" onClick={onClose} title="Close tutorials">
        ✕ Close
      </GlowButton>
    </div>
  );
}

// ---------- MAIN COMPONENT ----------

export default function TutorialsModal({ onClose }: { onClose: () => void }) {
  const setScreen = useGame((s) => s.setScreen);
  const pushToast = useGame((s) => s.pushToast);

  const [activeTutorial, setActiveTutorial] = useState<string | null>(null);
  const [tutorialStep, setTutorialStep] = useState(0);
  const [completed, setCompleted] = useState<Set<string>>(() => new Set(INITIAL_COMPLETED));
  const [filter, setFilter] = useState<FilterId>("all");

  const tutorial = useMemo(
    () => TUTORIALS.find((t) => t.id === activeTutorial) ?? null,
    [activeTutorial]
  );
  const filtered = useMemo(
    () => (filter === "all" ? TUTORIALS : TUTORIALS.filter((t) => t.difficulty === filter)),
    [filter]
  );

  // Escape: leave the viewer first, close the modal second.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (activeTutorial) {
          setActiveTutorial(null);
          setTutorialStep(0);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeTutorial, onClose]);

  const openTutorial = (id: string) => {
    setActiveTutorial(id);
    setTutorialStep(0);
  };

  const backToCatalog = () => {
    setActiveTutorial(null);
    setTutorialStep(0);
  };

  const finishTutorial = () => {
    if (!tutorial) return;
    setCompleted((prev) => {
      const next = new Set(prev);
      next.add(tutorial.id);
      return next;
    });
    pushToast({
      title: `Tutorial complete: ${tutorial.title}! +25 GOLD`,
      variant: "success",
    });
    backToCatalog();
  };

  const tryItNow = () => {
    if (!tutorial?.launch) return;
    setScreen(tutorial.launch);
    onClose();
  };

  const progressPct = Math.round((completed.size / TUTORIALS.length) * 100);
  const step = tutorial ? Math.min(tutorialStep, tutorial.slides.length - 1) : 0;
  const isLast = tutorial ? step >= tutorial.slides.length - 1 : false;
  const slide = tutorial?.slides[step] ?? null;

  // ---------- RENDER ----------

  return (
    <div
      className="fixed inset-0 z-[150] flex items-center justify-center p-3 sm:p-4 bg-black/70 backdrop-blur-md"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Tutorials and Codex guides"
    >
      <div className="w-full max-w-2xl" onClick={(e) => e.stopPropagation()}>
        <GlassPanel
          className="relative max-h-[88vh] overflow-y-auto"
          glow="rgba(18,167,160,0.28)"
          style={{
            background: "linear-gradient(165deg, rgba(10,27,61,0.97) 0%, rgba(4,16,31,0.97) 100%)",
          }}
        >
          {tutorial && slide ? (
            // ================= TUTORIAL VIEWER =================
            <div className="p-4 sm:p-6">
              {/* Top bar: back / title / step indicator */}
              <div className="flex items-center gap-2 sm:gap-3 mb-3">
                <GlowButton variant="ghost" size="sm" onClick={backToCatalog} title="Back to catalog">
                  ← Back
                </GlowButton>
                <span className="text-xl shrink-0" aria-hidden="true">
                  {tutorial.icon}
                </span>
                <h3 className="flex-1 min-w-0 font-bold font-display text-sm sm:text-base truncate">
                  {tutorial.title}
                </h3>
                <span className="text-[11px] opacity-60 whitespace-nowrap">
                  Slide {step + 1} of {tutorial.slides.length}
                </span>
              </div>

              {/* Meta chips + progress dots */}
              <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
                <div className="flex gap-2 flex-wrap">
                  <StatChip
                    label="Level"
                    value={DIFFICULTY_META[tutorial.difficulty].label}
                    color={DIFFICULTY_META[tutorial.difficulty].color}
                  />
                  <StatChip label="Length" value={tutorial.duration} color={GOLD} />
                </div>
                <div className="flex items-center gap-1.5" aria-label="Slide progress">
                  {tutorial.slides.map((_, i) => (
                    <span
                      key={i}
                      className="rounded-full transition-all duration-300"
                      style={{
                        width: i === step ? 14 : 7,
                        height: 7,
                        background: i <= step ? TEAL : "rgba(255,255,255,0.18)",
                        boxShadow: i === step ? `0 0 8px ${TEAL}88` : undefined,
                      }}
                    />
                  ))}
                </div>
              </div>

              {/* Slide card */}
              <GlassPanel className="p-4 sm:p-6" glow="rgba(124,245,225,0.10)">
                <SlideArt emoji={slide.artHint ?? tutorial.icon} />
                <h4 className="text-lg font-bold font-display mb-2 leading-snug">{slide.title}</h4>
                <div className="space-y-2 max-w-[52ch]">
                  {slide.body.map((para, i) => (
                    <p key={i} className="text-sm opacity-85 leading-relaxed">
                      {para}
                    </p>
                  ))}
                </div>
              </GlassPanel>

              {/* Launch CTA on the final slide */}
              {isLast && tutorial.launch && (
                <GlassPanel className="mt-3 p-3 flex items-center justify-between gap-3">
                  <span className="text-xs opacity-75">
                    Ready to practice at the {SCREEN_NAMES[tutorial.launch] ?? "relevant screen"}?
                  </span>
                  <GlowButton variant="teal" size="sm" onClick={tryItNow}>
                    Try it now →
                  </GlowButton>
                </GlassPanel>
              )}

              {/* Navigation */}
              <div className="mt-4 flex items-center justify-between gap-2">
                <GlowButton
                  variant="ghost"
                  size="sm"
                  disabled={step === 0}
                  onClick={() => setTutorialStep((s) => Math.max(0, s - 1))}
                >
                  ← Previous
                </GlowButton>
                <button
                  type="button"
                  className="text-[11px] opacity-60 hover:opacity-100 underline underline-offset-2 transition-opacity"
                  onClick={() => setTutorialStep(tutorial.slides.length - 1)}
                >
                  Skip to end
                </button>
                {isLast ? (
                  <GlowButton variant="gold" size="sm" onClick={finishTutorial}>
                    ✓ Finish
                  </GlowButton>
                ) : (
                  <GlowButton
                    variant="teal"
                    size="sm"
                    onClick={() => setTutorialStep((s) => Math.min(tutorial.slides.length - 1, s + 1))}
                  >
                    Next →
                  </GlowButton>
                )}
              </div>

              <ModalFooter onClose={onClose} />
            </div>
          ) : (
            // ================= CATALOG VIEW =================
            <div className="p-4 sm:p-6">
              {/* Header */}
              <div className="flex items-start justify-between gap-3 mb-4">
                <div className="min-w-0">
                  <h2 className="text-lg sm:text-xl font-bold font-display leading-tight flex items-center gap-2">
                    <span aria-hidden="true">🎓</span> Tutorials &amp; Codex Guides
                  </h2>
                  <p className="text-xs sm:text-sm opacity-70 mt-0.5">
                    Replay any tutorial anytime. Short, visual, no walls of text.
                  </p>
                </div>
                <GlowButton variant="ghost" size="sm" onClick={onClose} title="Close tutorials">
                  ✕
                </GlowButton>
              </div>

              {/* Filter pills */}
              <div className="flex flex-wrap gap-2 mb-3" role="group" aria-label="Filter tutorials by difficulty">
                {FILTERS.map((f) => {
                  const active = filter === f.id;
                  const color = f.id === "all" ? TEAL : DIFFICULTY_META[f.id].color;
                  return (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setFilter(f.id)}
                      aria-pressed={active}
                      className="px-3 py-1 rounded-full text-xs font-bold transition-all duration-150"
                      style={
                        active
                          ? {
                              background: `linear-gradient(135deg, ${TEAL_DEEP}, #0A4A66)`,
                              color: "#EAF6FF",
                              boxShadow: `0 2px 10px ${color}55`,
                              border: `1px solid ${color}66`,
                            }
                          : {
                              background: "rgba(255,255,255,0.06)",
                              color: "rgba(234,246,255,0.75)",
                              border: "1px solid rgba(124,245,225,0.18)",
                            }
                      }
                    >
                      {f.label}
                    </button>
                  );
                })}
              </div>

              {/* Progress banner */}
              <GlassPanel className="p-3 mb-4">
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <span className="font-bold font-display">
                    {completed.size} of {TUTORIALS.length} completed
                  </span>
                  <span className="opacity-60">{progressPct}%</span>
                </div>
                <div
                  className="h-2 rounded-full overflow-hidden"
                  style={{ background: "rgba(255,255,255,0.08)" }}
                  role="progressbar"
                  aria-valuenow={completed.size}
                  aria-valuemin={0}
                  aria-valuemax={TUTORIALS.length}
                  aria-label="Tutorials completed"
                >
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${progressPct}%`,
                      background: `linear-gradient(90deg, ${TEAL_DEEP}, ${TEAL})`,
                      boxShadow: `0 0 8px ${TEAL}88`,
                    }}
                  />
                </div>
              </GlassPanel>

              {/* Grid */}
              <SectionTitle
                icon="📚"
                title={
                  filter === "all" ? "All guides" : `${DIFFICULTY_META[filter].label} guides`
                }
              />
              {filtered.length === 0 ? (
                <EmptyState
                  message="No tutorials here yet."
                  hint="New guides arrive as features roll out."
                />
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {filtered.map((t) => (
                    <TutorialCard
                      key={t.id}
                      tutorial={t}
                      isDone={completed.has(t.id)}
                      onStart={() => openTutorial(t.id)}
                    />
                  ))}
                </div>
              )}

              <ModalFooter onClose={onClose} />
            </div>
          )}
        </GlassPanel>
      </div>
    </div>
  );
}
