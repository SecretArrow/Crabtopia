// Crabtopia - Main Game Shell with navigation.
"use client";

import { useEffect, useState } from "react";
import { useGame } from "../store/gameStore";
import ToastContainer from "./ToastContainer";
import OnboardingScreen from "./screens/OnboardingScreen";
import HomeScreen from "./screens/HomeScreen";
import MapScreen from "./screens/MapScreen";
import TeamsScreen from "./screens/TeamsScreen";
import HallScreen from "./screens/HallScreen";
import NurseryScreen from "./screens/NurseryScreen";
import BazaarScreen from "./screens/BazaarScreen";
import CodexScreen from "./screens/CodexScreen";
import ArenaController from "./arena/ArenaController";
import MiningScreen from "./activities/MiningScreen";
import ExplorationScreen from "./activities/ExplorationScreen";
import BreedingScreen from "./activities/BreedingScreen";
import CraftingScreen from "./activities/CraftingScreen";
import InventoryScreen from "./activities/InventoryScreen";
import NotificationCenterModal from "./NotificationCenterModal";
import TutorialGuide from "./TutorialGuide";
import { formatGold, GoldIcon, PlanktonField } from "./ui";

const NAV_ITEMS = [
  { id: "home", label: "Home", icon: "🏠" },
  { id: "arena", label: "Arena", icon: "⚔️" },
  { id: "teams", label: "Teams", icon: "🦀" },
  { id: "map", label: "Dive Map", icon: "🗺️" },
  { id: "mining", label: "Mining", icon: "⛏️" },
  { id: "exploration", label: "Explore", icon: "🧭" },
  { id: "breeding", label: "Breeding", icon: "🥚" },
  { id: "nursery", label: "Nursery", icon: "🥚" },
  { id: "crafting", label: "Crafting", icon: "🔨" },
  { id: "bazaar", label: "Bazaar", icon: "💰" },
  { id: "hall", label: "Hall", icon: "🪵" },
  { id: "inventory", label: "Inventory", icon: "🎒" },
  { id: "codex", label: "Codex", icon: "📖" },
];

// Mobile bottom nav: 5 primary items + More (which holds the remaining nav items)
const MOBILE_NAV = NAV_ITEMS.slice(0, 5);
const MOBILE_MORE = NAV_ITEMS.slice(5);

function Logo({ height }: { height: number }) {
  return (
    <img
      src="/art/ui/logo.png"
      alt="Crabtopia"
      height={height}
      style={{ height, width: "auto" }}
      draggable={false}
      className="object-contain"
    />
  );
}

export default function GameShell() {
  const player = useGame((s) => s.player);
  const currentScreen = useGame((s) => s.currentScreen);
  const setScreen = useGame((s) => s.setScreen);
  const tickTimers = useGame((s) => s.tickTimers);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  // mock unread notification count (would come from store in production)
  const unreadNotifs = 3;

  // tick timers every second
  useEffect(() => {
    if (!player) return;
    const interval = setInterval(() => tickTimers(), 1000);
    return () => clearInterval(interval);
  }, [player, tickTimers]);

  if (!player) {
    return (
      <>
        <OnboardingScreen />
        <ToastContainer />
      </>
    );
  }

  const renderScreen = () => {
    switch (currentScreen) {
      case "home":
        return <HomeScreen />;
      case "arena":
        return <ArenaController />;
      case "mining":
        return <MiningScreen />;
      case "exploration":
        return <ExplorationScreen />;
      case "breeding":
        return <BreedingScreen />;
      case "crafting":
        return <CraftingScreen />;
      case "inventory":
        return <InventoryScreen />;
      case "map":
        return <MapScreen />;
      case "teams":
        return <TeamsScreen />;
      case "hall":
        return <HallScreen />;
      case "nursery":
        return <NurseryScreen />;
      case "bazaar":
        return <BazaarScreen />;
      case "codex":
        return <CodexScreen />;
      default:
        return <HomeScreen />;
    }
    };

  return (
    <div className="min-h-screen flex flex-col md:flex-row text-white relative">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex flex-col w-56 sticky top-0 h-screen p-3 gap-1 z-20 overflow-hidden" style={{
        background: "linear-gradient(180deg, #06122B 0%, #04101F 100%)",
        borderRight: "1px solid rgba(124,245,225,0.12)",
      }}>
        {/* Plankton backdrop */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-r-2xl">
          <PlanktonField count={10} />
        </div>

        {/* Logo + tagline */}
        <div className="relative z-10 px-2 pt-2 pb-2 mb-1 shrink-0">
          <Logo height={32} />
          <div className="text-[9px] opacity-40 leading-tight font-display mt-0.5 tracking-wide truncate">
            Glow-Tide Storybook
          </div>
        </div>

        {/* Player info compact */}
        <div className="relative z-10 px-2 py-2 rounded-xl shrink-0" style={{
          background: "rgba(124,245,225,0.06)",
          border: "1px solid rgba(124,245,225,0.14)",
        }}>
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="text-[9px] opacity-60 uppercase tracking-wide leading-tight">Shellwarden</div>
              <div className="font-bold text-sm truncate font-display leading-tight">{player.name}</div>
            </div>
            <div className="shrink-0 text-right">
              <div className="text-[9px] opacity-60 leading-tight">Lv {player.shellwardenLevel}</div>
              <div className="text-[10px] font-bold leading-tight" style={{ color: "#FFD166" }}>
                ⭐ {player.shellwardenXp}
              </div>
            </div>
          </div>
        </div>

        {/* Gold panel compact */}
        <div
          className="relative z-10 rounded-xl px-2 py-2 mb-1 overflow-hidden shrink-0"
          style={{
            background: "linear-gradient(135deg, rgba(255,209,102,0.18), rgba(255,122,26,0.12))",
            border: "1px solid rgba(255,209,102,0.40)",
            boxShadow: "0 0 12px rgba(255,209,102,0.10) inset",
          }}
        >
          {/* Subtle pattern overlay (no text) */}
          <div
            className="absolute inset-0 opacity-30 pointer-events-none"
            style={{
              background:
                "radial-gradient(circle at 20% 30%, rgba(255,209,102,0.20), transparent 40%), radial-gradient(circle at 80% 70%, rgba(255,122,26,0.18), transparent 40%)",
            }}
          />
          <div className="relative z-10 flex items-center gap-1.5">
            <GoldIcon size={18} />
            <div className="min-w-0">
              <div className="text-[9px] opacity-70 uppercase tracking-wide leading-tight">Gold</div>
              <div className="text-base font-bold font-display leading-tight" style={{ color: "#FFD166" }}>
                {formatGold(player.gold)}
              </div>
            </div>
          </div>
        </div>

        {/* Navigation - flex-1 to fill, scrollable */}
        <nav className="relative z-10 flex flex-col gap-1 flex-1 overflow-y-auto no-scrollbar min-h-0">
          {NAV_ITEMS.map((item) => {
            const active = currentScreen === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setScreen(item.id)}
                className={`group flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold transition-all duration-150 ${
                  active
                    ? "text-white"
                    : "text-white/65 hover:text-white hover:bg-white/5"
                }`}
                style={{
                  background: active ? "linear-gradient(135deg, #12A7A0, #0A4A66)" : undefined,
                  boxShadow: active ? "0 0 16px rgba(18,167,160,0.45)" : undefined,
                  transform: active ? "translateX(2px) scale(1.02)" : undefined,
                }}
              >
                <span className="text-base shrink-0">{item.icon}</span>
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}

        </nav>

        {/* Footer actions - shrink-0 so they never get clipped */}
        <div className="relative z-10 shrink-0 pt-2 mt-1 flex items-center justify-center gap-1" style={{ borderTop: "1px solid rgba(124,245,225,0.10)" }}>
          <button
            onClick={() => setNotifOpen(true)}
            title="Notifications"
            className="text-sm opacity-70 hover:opacity-100 px-2 py-1 rounded transition relative"
            aria-label={`Notifications (${unreadNotifs} unread)`}
          >
            🔔
            {unreadNotifs > 0 && (
              <span
                className="absolute -top-0 -right-0 text-[8px] font-bold rounded-full px-1 leading-tight"
                style={{
                  background: "#FF6F91",
                  color: "white",
                  minWidth: 12,
                  height: 12,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {unreadNotifs}
              </span>
            )}
          </button>
          <span className="text-white/10">·</span>
          <button
            onClick={() => setSettingsOpen(true)}
            title="Settings"
            className="text-sm opacity-60 hover:opacity-100 px-2 py-1 rounded transition"
            aria-label="Settings"
          >
            ⚙
          </button>
          <span className="text-white/10">·</span>
          <button
            onClick={() => {
              if (confirm("Reset game? This wipes your progress.")) {
                useGame.getState().resetGame();
              }
            }}
            title="Reset game"
            className="text-sm opacity-50 hover:opacity-100 px-2 py-1 rounded transition"
            aria-label="Reset game"
          >
            ↻
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-x-hidden relative min-w-0">
        {/* Plankton field on main content for desktop */}
        <div className="hidden md:block pointer-events-none absolute inset-0 overflow-hidden z-0">
          <PlanktonField count={8} />
        </div>

        {/* Mobile top bar */}
        <div className="md:hidden sticky top-0 z-30 flex items-center justify-between px-3 py-2 safe-area-top" style={{
          background: "linear-gradient(180deg, #06122B, #06122BBB)",
          borderBottom: "1px solid rgba(124,245,225,0.12)",
          backdropFilter: "blur(6px)",
        }}>
          <div className="flex items-center gap-2">
            <img
              src="/art/ui/app-icon.png"
              alt="Crabtopia"
              width={28}
              height={28}
              className="rounded-md object-contain"
              draggable={false}
            />
            <img
              src="/art/ui/logo.png"
              alt="Crabtopia"
              height={24}
              style={{ height: 24, width: "auto" }}
              draggable={false}
              className="object-contain"
            />
          </div>
          <div className="flex items-center gap-1.5">
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg" style={{
              background: "linear-gradient(135deg, #FFD16622, #FF7A1A22)",
              border: "1px solid #FFD16655",
            }}>
              <GoldIcon size={16} />
              <span className="text-xs font-bold font-display" style={{ color: "#FFD166" }}>
                {formatGold(player.gold)}
              </span>
            </div>
            <button
              onClick={() => setNotifOpen(true)}
              aria-label={`Notifications (${unreadNotifs} unread)`}
              className="relative w-10 h-10 rounded-lg flex items-center justify-center text-white/70 hover:text-white"
              style={{
                background: "rgba(124,245,225,0.10)",
                border: "1px solid rgba(124,245,225,0.20)",
              }}
            >
              🔔
              {unreadNotifs > 0 && (
                <span
                  className="absolute -top-1 -right-1 text-[8px] font-bold rounded-full flex items-center justify-center"
                  style={{
                    background: "#FF6F91",
                    color: "white",
                    minWidth: 14,
                    height: 14,
                  }}
                >
                  {unreadNotifs}
                </span>
              )}
            </button>
            <button
              onClick={() => setSettingsOpen(true)}
              aria-label="Settings"
              className="w-10 h-10 rounded-lg flex items-center justify-center text-white/70 hover:text-white"
              style={{
                background: "rgba(124,245,225,0.10)",
                border: "1px solid rgba(124,245,225,0.20)",
              }}
            >
              ⚙
            </button>
          </div>
        </div>

        <div key={currentScreen} className="relative z-10 pb-24 md:pb-6 p-3 md:p-6 min-h-screen screen-enter">
          {renderScreen()}
        </div>
      </main>

      {/* Mobile bottom nav */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 flex justify-around items-stretch safe-area-bottom"
        style={{
          background: "linear-gradient(180deg, #06122Bee, #04101Fff)",
          borderTop: "1px solid rgba(124,245,225,0.18)",
          backdropFilter: "blur(8px)",
        }}
      >
        {MOBILE_NAV.map((item) => {
          const active = currentScreen === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setScreen(item.id)}
              className="relative flex flex-col items-center justify-center py-1.5 px-1 flex-1 transition-colors"
              style={{ minHeight: 56 }}
              aria-label={item.label}
              aria-current={active ? "page" : undefined}
            >
              {active && (
                <span
                  className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-full"
                  style={{
                    background: "#7CF5E1",
                    boxShadow: "0 0 8px #12A7A0",
                  }}
                />
              )}
              <span
                className="text-[22px] leading-none transition-transform"
                style={{
                  transform: active ? "scale(1.15)" : undefined,
                  filter: active ? "drop-shadow(0 0 6px rgba(18,167,160,0.85))" : undefined,
                }}
              >
                {item.icon}
              </span>
              <span
                className="text-[10px] mt-0.5"
                style={{ color: active ? "#7CF5E1" : "rgba(234,246,255,0.55)" }}
              >
                {item.label}
              </span>
            </button>
          );
        })}
        {/* More button → opens small popover for remaining nav items */}
        <MoreButton
          items={MOBILE_MORE}
          activeId={currentScreen}
          onSelect={setScreen}
        />
      </nav>

      {/* Tutorial coach-mark overlay (first-dive guide) */}
      <TutorialGuide />

      <ToastContainer />

      {/* Settings modal */}
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}

      {/* Notification center modal */}
      {notifOpen && <NotificationCenterModal onClose={() => setNotifOpen(false)} />}
    </div>
  );
}

// ---------- Settings Modal ----------
function SettingsModal({ onClose }: { onClose: () => void }) {
  const player = useGame((s) => s.player)!;
  const resetGame = useGame((s) => s.resetGame);
  const [musicOn, setMusicOn] = useState(true);
  const [sfxOn, setSfxOn] = useState(true);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [highContrast, setHighContrast] = useState(false);

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div
        className="relative w-full max-w-md rounded-2xl overflow-hidden p-5 max-h-[88vh] overflow-y-auto"
        style={{
          background: "linear-gradient(180deg, #06122B 0%, #04101F 100%)",
          border: "1px solid rgba(124,245,225,0.30)",
          boxShadow: "0 16px 48px rgba(18,167,160,0.30)",
        }}
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold font-display" style={{ color: "#7CF5E1" }}>Settings</h2>
          <button onClick={onClose} aria-label="Close" className="text-white/50 hover:text-white text-xl w-10 h-10 -my-1 flex items-center justify-center rounded-md hover:bg-white/10">✕</button>
        </div>

        <div className="text-xs opacity-60 mb-4">
          Crabtopia · v1.0 — Glow-Tide Storybook build
        </div>

        <div className="space-y-2">
          <SettingsRow label="Music" desc="Ambient ocean pads and faction motifs" on={musicOn} onToggle={() => setMusicOn((v) => !v)} />
          <SettingsRow label="Sound effects" desc="Claw clacks, coin rain, egg shimmer" on={sfxOn} onToggle={() => setSfxOn((v) => !v)} />
          <SettingsRow label="Reduce motion" desc="Fewer particles and animations" on={reduceMotion} onToggle={() => setReduceMotion((v) => !v)} />
          <SettingsRow label="High contrast" desc="Boost text and border contrast" on={highContrast} onToggle={() => setHighContrast((v) => !v)} />
        </div>

        <div className="mt-4 pt-3 border-t border-white/10 space-y-2 text-xs">
          <div className="flex justify-between"><span className="opacity-60">Shellwarden</span><span className="font-bold">{player.name}</span></div>
          <div className="flex justify-between"><span className="opacity-60">Level</span><span className="font-bold">{player.shellwardenLevel}</span></div>
          <div className="flex justify-between"><span className="opacity-60">Crabs owned</span><span className="font-bold">{player.crabs.length}</span></div>
          <div className="flex justify-between"><span className="opacity-60">Teams</span><span className="font-bold">{player.teams.length}</span></div>
        </div>

        <div className="mt-4 pt-3 border-t border-white/10 text-[10px] opacity-50 leading-relaxed">
          Free to play · No blockchain · Cross-platform (Web · Android · iOS).
          Gold is game-only and cannot be bought or cashed out.
        </div>

        <button
          onClick={() => {
            if (confirm("Reset all progress? This wipes crabs, teams, gold, eggs.")) {
              resetGame();
              onClose();
            }
          }}
          className="mt-4 w-full rounded-xl px-4 py-2 text-sm font-bold transition"
          style={{
            background: "rgba(255,122,26,0.10)",
            border: "1px solid rgba(255,122,26,0.40)",
            color: "#FF7A1A",
          }}
        >
          ↻ Reset all progress
        </button>
      </div>
    </div>
  );
}

function SettingsRow({ label, desc, on, onToggle }: { label: string; desc: string; on: boolean; onToggle: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 p-2 rounded-lg" style={{ background: "rgba(124,245,225,0.05)" }}>
      <div className="min-w-0">
        <div className="text-sm font-semibold">{label}</div>
        <div className="text-[10px] opacity-60 truncate">{desc}</div>
      </div>
      <button
        role="switch"
        aria-checked={on}
        aria-label={label}
        onClick={onToggle}
        className="relative w-10 h-6 rounded-full transition shrink-0"
        style={{
          background: on ? "linear-gradient(135deg, #12A7A0, #0A4A66)" : "rgba(255,255,255,0.10)",
          boxShadow: on ? "0 0 10px rgba(18,167,160,0.50)" : undefined,
        }}
      >
        <span
          className="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform"
          style={{ transform: on ? "translateX(16px)" : "translateX(0)" }}
        />
      </button>
    </div>
  );
}

function MoreButton({
  items,
  activeId,
  onSelect,
}: {
  items: typeof NAV_ITEMS;
  activeId: string;
  onSelect: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const anyActive = items.some((i) => i.id === activeId);
  return (
    <div className="relative flex-1">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full relative flex flex-col items-center justify-center py-1.5 px-1 transition-colors"
        style={{ minHeight: 56 }}
        aria-label="More"
        aria-current={anyActive ? "page" : undefined}
        aria-expanded={open}
      >
        {anyActive && (
          <span
            className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-full"
            style={{ background: "#7CF5E1", boxShadow: "0 0 8px #12A7A0" }}
          />
        )}
        <span
          className="text-[22px] leading-none transition-transform"
          style={{
            transform: open || anyActive ? "scale(1.15)" : undefined,
            filter: open || anyActive ? "drop-shadow(0 0 6px rgba(18,167,160,0.85))" : undefined,
          }}
        >
          •••
        </span>
        <span
          className="text-[10px] mt-0.5"
          style={{ color: open || anyActive ? "#7CF5E1" : "rgba(234,246,255,0.55)" }}
        >
          More
        </span>
      </button>
      {open && (
        <>
          <button
            aria-label="Close menu"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 bg-transparent"
            style={{ top: 0, left: 0, right: 0, bottom: 0 }}
            tabIndex={-1}
          />
          <div
            className="absolute bottom-full mb-1 right-0 left-0 mx-auto w-40 rounded-xl overflow-hidden z-50 animate-slide-up"
            style={{
              background: "linear-gradient(180deg, #06122B, #04101F)",
              border: "1px solid rgba(124,245,225,0.25)",
              boxShadow: "0 -8px 24px rgba(18,167,160,0.25)",
            }}
          >
            {items.map((item) => {
              const active = activeId === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    onSelect(item.id);
                    setOpen(false);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold transition-colors hover:bg-white/5"
                  style={{
                    background: active ? "rgba(18,167,160,0.2)" : undefined,
                    color: active ? "#7CF5E1" : "#EAF6FF",
                  }}
                >
                  <span className="text-base">{item.icon}</span>
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
