// Crabtopia - Admin Console Modal (DEMO)
// Self-contained command center: economy dials, event scheduler, moderation,
// audit logs, and kill switches. Mock authentication only.
"use client";

import React, { useMemo, useState } from "react";
import { useGame } from "../store/gameStore";
import {
  GlassPanel,
  GlowButton,
  StatChip,
  SectionTitle,
  GoldIcon,
  formatGold,
  formatTime,
  EmptyState,
} from "./ui";

// ---------- TYPES ----------

interface AdminPlayer {
  id: string;
  name: string;
  level: number;
  gold: number;
  lastActive: number;
  flaggedReason?: string;
  tradeCount24h: number;
}

interface AuditEntry {
  id: string;
  action: string;
  adminName: string;
  targetName?: string;
  details: string;
  timestamp: number;
}

type EventType =
  | "gold_rush"
  | "breeding_bloom"
  | "leviathan_week"
  | "moonpool_masquerade"
  | "sink_event";

interface ScheduledEvent {
  id: string;
  name: string;
  type: EventType;
  startsAt: number;
  durationHours: number;
  bonus: string;
  status: "scheduled" | "live" | "completed";
}

type TabId =
  | "overview"
  | "economy"
  | "events"
  | "moderation"
  | "audit"
  | "kill-switches";

// ---------- CONSTANTS ----------

const NAVY_DEEP = "#06122B";
const NAVY_PANEL = "#0A1B3D";
const AMBER = "#FFC857";
const AMBER_DIM = "#B8862B";
const AMBER_GLOW = "rgba(255,200,87,0.35)";
const ROSE = "#FF6F91";
const GREEN = "#7CFFB4";

const TAB_LABELS: { id: TabId; label: string; icon: string }[] = [
  { id: "overview", label: "Overview", icon: "📊" },
  { id: "economy", label: "Economy", icon: "💰" },
  { id: "events", label: "Events", icon: "🗓️" },
  { id: "moderation", label: "Moderation", icon: "🛡️" },
  { id: "audit", label: "Audit", icon: "📜" },
  { id: "kill-switches", label: "Kill Switches", icon: "⛔" },
];

const EVENT_TYPE_META: Record<EventType, { label: string; color: string }> = {
  gold_rush: { label: "Gold Rush", color: "#FFD166" },
  breeding_bloom: { label: "Breeding Bloom", color: "#FF6F91" },
  leviathan_week: { label: "Leviathan Week", color: "#5C7CFF" },
  moonpool_masquerade: { label: "Moonpool Masquerade", color: "#7CF5E1" },
  sink_event: { label: "GOLD Sink", color: "#FF8A4C" },
};

const BAN_REASONS = ["cheating", "RMT", "multi-account", "harassment"] as const;
const SINK_TYPES = ["cosmetic shop", "reef renovation", "crafting week"] as const;

// ---------- MOCK DATA ----------

const NOW = Date.now();
const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;

function makeInitialPlayers(): AdminPlayer[] {
  const base: Omit<AdminPlayer, "id">[] = [
    { name: "Tidewatcher", level: 47, gold: 1240000, lastActive: NOW - 4 * 60 * 1000, tradeCount24h: 18 },
    { name: "CoralForger", level: 32, gold: 84200, lastActive: NOW - 12 * 60 * 1000, tradeCount24h: 4, flaggedReason: "multi-account suspicion" },
    { name: "ShellReaver", level: 51, gold: 990000, lastActive: NOW - 60 * 1000, tradeCount24h: 27 },
    { name: "Moonshell", level: 28, gold: 12450, lastActive: NOW - 2 * HOUR, tradeCount24h: 2 },
    { name: "Pinchstorm", level: 40, gold: 318000, lastActive: NOW - 90 * 1000, tradeCount24h: 11, flaggedReason: "bot-like timing" },
    { name: "GildedCrab", level: 55, gold: 4200000, lastActive: NOW - 3 * 60 * 1000, tradeCount24h: 42 },
    { name: "BulwarkBae", level: 19, gold: 880, lastActive: NOW - 6 * HOUR, tradeCount24h: 0 },
    { name: "DriftKing", level: 44, gold: 712000, lastActive: NOW - 25 * 60 * 1000, tradeCount24h: 9, flaggedReason: "RMT pattern" },
    { name: "Frostfang", level: 38, gold: 254000, lastActive: NOW - 8 * 60 * 1000, tradeCount24h: 6 },
    { name: "Cinderpinch", level: 49, gold: 1800000, lastActive: NOW - 15 * 60 * 1000, tradeCount24h: 14 },
    { name: "MangroveMaven", level: 36, gold: 96400, lastActive: NOW - 45 * 60 * 1000, tradeCount24h: 3 },
    { name: "Stormgill", level: 22, gold: 4200, lastActive: NOW - 18 * HOUR, tradeCount24h: 1 },
  ];
  return base.map((p, i) => ({ ...p, id: `p_${i + 1}` }));
}

function makeInitialAuditLog(): AuditEntry[] {
  return [
    { id: "a1", action: "BAN", adminName: "TideAdmin", targetName: "CoralForger", details: "30-day ban for multi-account suspicion", timestamp: NOW - 35 * 60 * 1000 },
    { id: "a2", action: "REFUND", adminName: "ReefOps", targetName: "Moonshell", details: "Refunded 1,200 GOLD — lost egg bug", timestamp: NOW - 2 * HOUR },
    { id: "a3", action: "EVENT_LIVE", adminName: "TideAdmin", details: "Forced Gold Rush event live", timestamp: NOW - 3 * HOUR },
    { id: "a4", action: "KILL_SWITCH", adminName: "ReefOps", details: "Disabled Leviathan raids (lag spike)", timestamp: NOW - 5 * HOUR },
    { id: "a5", action: "WARN", adminName: "ShellMod", targetName: "Pinchstorm", details: "Warning: bot-like timing detected", timestamp: NOW - 6 * HOUR },
    { id: "a6", action: "ECONOMY", adminName: "TideAdmin", details: "Dive reward multiplier set to 0.9x", timestamp: NOW - 9 * HOUR },
    { id: "a7", action: "REFUND", adminName: "ReefOps", targetName: "GildedCrab", details: "Refunded 50,000 GOLD — duplicate charge", timestamp: NOW - DAY },
    { id: "a8", action: "KILL_SWITCH", adminName: "TideAdmin", details: "Re-enabled Leviathan raids", timestamp: NOW - DAY - 2 * HOUR },
  ];
}

function makeInitialEvents(): ScheduledEvent[] {
  return [
    { id: "e1", name: "Spring Gold Rush", type: "gold_rush", startsAt: NOW + 2 * DAY, durationHours: 72, bonus: "+50% dive rewards globally", status: "scheduled" },
    { id: "e2", name: "Leviathan Awakening", type: "leviathan_week", startsAt: NOW + 5 * DAY, durationHours: 168, bonus: "Boss raids unlock + double shells", status: "scheduled" },
    { id: "e3", name: "Moonpool Masquerade", type: "moonpool_masquerade", startsAt: NOW + 9 * DAY, durationHours: 48, bonus: "Cosmetic drops + faction XP boost", status: "scheduled" },
  ];
}

const KILL_SWITCH_FEATURES: { key: string; label: string; desc: string }[] = [
  { key: "breeding", label: "Breeding", desc: "Egg creation & hatch timers" },
  { key: "bazaar", label: "Bazaar Trading", desc: "Player-to-player listings" },
  { key: "raids", label: "Raids", desc: "Standard raid energy & matchmaking" },
  { key: "coliseum", label: "Coliseum", desc: "Ranked PvP arena queue" },
  { key: "leviathan", label: "Leviathan Raids", desc: "World boss encounters" },
  { key: "lottery", label: "Weekly Lottery", desc: "Tidepass prize draw" },
  { key: "tidepass", label: "Tidepass Claims", desc: "Free + premium track claims" },
  { key: "registration", label: "New Account Registration", desc: "Signup gate for new players" },
];

function makeInitialKillSwitches(): Record<string, { enabled: boolean; lastToggledAt: number; adminName: string }> {
  const obj: Record<string, { enabled: boolean; lastToggledAt: number; adminName: string }> = {};
  for (const f of KILL_SWITCH_FEATURES) {
    obj[f.key] = { enabled: true, lastToggledAt: NOW - 2 * DAY, adminName: "TideAdmin" };
  }
  return obj;
}

// ---------- HELPERS ----------

function relativeTime(ms: number): string {
  const diff = Date.now() - ms;
  if (diff < 60_000) return "just now";
  if (diff < HOUR) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)}h ago`;
  return `${Math.floor(diff / DAY)}d ago`;
}

function countdownTo(ms: number): string {
  const diff = ms - Date.now();
  if (diff <= 0) return "starting…";
  return formatTime(diff);
}

function uid(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

// ---------- MINI SPARKLINE (mock) ----------

function MiniSparkline({ color, up }: { color: string; up: boolean }) {
  const pts = up ? [8, 6, 9, 5, 11, 7, 13, 10, 14] : [14, 12, 13, 9, 11, 7, 8, 6, 5];
  const max = Math.max(...pts);
  const w = 60;
  const h = 18;
  const step = w / (pts.length - 1);
  const path = pts
    .map((p, i) => `${i === 0 ? "M" : "L"}${(i * step).toFixed(1)},${(h - (p / max) * h).toFixed(1)}`)
    .join(" ");
  return (
    <svg width={w} height={h} className="opacity-90">
      <path d={path} fill="none" stroke={color} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ---------- MAIN COMPONENT ----------

export function AdminConsoleModal({ onClose }: { onClose: () => void }) {
  const player = useGame((s) => s.player);
  const pushToast = useGame((s) => s.pushToast);
  const addGold = useGame((s) => s.addGold);

  const [authenticated, setAuthenticated] = useState(false);
  const [password, setPassword] = useState("");
  const [authing, setAuthing] = useState(false);
  const [tab, setTab] = useState<TabId>("overview");

  const [mockPlayers, setMockPlayers] = useState<AdminPlayer[]>(makeInitialPlayers);
  const [mockAuditLog, setMockAuditLog] = useState<AuditEntry[]>(makeInitialAuditLog);
  const [scheduledEvents, setScheduledEvents] = useState<ScheduledEvent[]>(makeInitialEvents);
  const [killSwitches, setKillSwitches] = useState(makeInitialKillSwitches);

  const [selectedPlayer, setSelectedPlayer] = useState<AdminPlayer | null>(null);
  const [playerSearch, setPlayerSearch] = useState("");
  const [auditFilter, setAuditFilter] = useState("ALL");

  // economy controls
  const [diveMultiplier, setDiveMultiplier] = useState(1.0);
  const [sinkType, setSinkType] = useState<string>(SINK_TYPES[0]);
  const [eggQuota, setEggQuota] = useState(3);

  // event form
  const [evName, setEvName] = useState("");
  const [evType, setEvType] = useState<EventType>("gold_rush");
  const [evStart, setEvStart] = useState("");
  const [evDuration, setEvDuration] = useState(48);
  const [evBonus, setEvBonus] = useState("");

  // kill all confirm
  const [killAllConfirm, setKillAllConfirm] = useState(false);

  const adminName = player?.name ?? "demo-admin";

  function appendAudit(entry: Omit<AuditEntry, "id" | "timestamp" | "adminName">) {
    setMockAuditLog((prev) => [
      { ...entry, id: uid("a"), timestamp: Date.now(), adminName },
      ...prev,
    ]);
  }

  function handleAuthenticate() {
    setAuthing(true);
    setTimeout(() => {
      setAuthing(false);
      setAuthenticated(true);
      pushToast({ title: "Admin session started", description: "Demo mode — no real auth.", variant: "success" });
    }, 700);
  }

  function handleSignOut() {
    setAuthenticated(false);
    setPassword("");
    pushToast({ title: "Admin session ended", variant: "default" });
  }

  // -------- ECONOMY HANDLERS --------
  function applyDiveMultiplier() {
    pushToast({ title: `Dive rewards adjusted to ${diveMultiplier.toFixed(2)}x globally`, variant: "success" });
    appendAudit({ action: "ECONOMY", details: `Dive reward multiplier set to ${diveMultiplier.toFixed(2)}x` });
  }
  function scheduleSink() {
    pushToast({ title: `GOLD sink event scheduled: ${sinkType}`, variant: "success" });
    appendAudit({ action: "ECONOMY", details: `Injected GOLD sink event: ${sinkType}` });
  }
  function toggleBreedingPause() {
    const next = !killSwitches.breeding.enabled;
    setKillSwitches((prev) => ({
      ...prev,
      breeding: { enabled: next, lastToggledAt: Date.now(), adminName },
    }));
    pushToast({ title: `Breeding ${next ? "resumed" : "paused"} (kill switch mirror)`, variant: next ? "success" : "warning" });
    appendAudit({ action: "KILL_SWITCH", details: `Breeding ${next ? "enabled" : "disabled"} via economy panel` });
  }
  function forceEggQuota() {
    pushToast({ title: `Egg quota forced to ${eggQuota} per player`, variant: "success" });
    appendAudit({ action: "ECONOMY", details: `Force egg quota set to ${eggQuota}` });
  }

  // -------- EVENT HANDLERS --------
  function scheduleNewEvent() {
    if (!evName.trim()) {
      pushToast({ title: "Event needs a name", variant: "error" });
      return;
    }
    const startMs = evStart ? new Date(evStart).getTime() : Date.now() + DAY;
    const ev: ScheduledEvent = {
      id: uid("e"),
      name: evName.trim(),
      type: evType,
      startsAt: startMs,
      durationHours: Math.max(1, evDuration),
      bonus: evBonus.trim() || EVENT_TYPE_META[evType].label,
      status: "scheduled",
    };
    setScheduledEvents((prev) => [...prev, ev]);
    pushToast({ title: `Event scheduled: ${ev.name}`, variant: "success" });
    appendAudit({ action: "EVENT_SCHEDULE", details: `Scheduled ${ev.name} (${EVENT_TYPE_META[ev.type].label})` });
    setEvName("");
    setEvBonus("");
    setEvDuration(48);
  }
  function cancelEvent(id: string) {
    const ev = scheduledEvents.find((e) => e.id === id);
    setScheduledEvents((prev) => prev.filter((e) => e.id !== id));
    if (ev) {
      pushToast({ title: `Event cancelled: ${ev.name}`, variant: "warning" });
      appendAudit({ action: "EVENT_CANCEL", details: `Cancelled scheduled event: ${ev.name}` });
    }
  }
  function goLiveNow(id: string) {
    const ev = scheduledEvents.find((e) => e.id === id);
    setScheduledEvents((prev) =>
      prev.map((e) => (e.id === id ? { ...e, status: "live", startsAt: Date.now() } : e))
    );
    if (ev) {
      pushToast({ title: `Event now LIVE: ${ev.name}`, variant: "success" });
      appendAudit({ action: "EVENT_LIVE", details: `Forced event live: ${ev.name}` });
    }
  }

  // -------- MODERATION HANDLERS --------
  function banPlayer(p: AdminPlayer, reason: string) {
    pushToast({ title: `${p.name} banned for ${reason}`, variant: "warning" });
    appendAudit({ action: "BAN", targetName: p.name, details: `Banned for ${reason}` });
    setSelectedPlayer(null);
  }
  function refundPlayer(p: AdminPlayer, amount: number) {
    if (amount <= 0) {
      pushToast({ title: "Enter a refund amount > 0", variant: "error" });
      return;
    }
    addGold(amount);
    setMockPlayers((prev) =>
      prev.map((x) => (x.id === p.id ? { ...x, gold: x.gold + amount } : x))
    );
    setSelectedPlayer((prev) => (prev ? { ...prev, gold: prev.gold + amount } : prev));
    pushToast({ title: `Refunded ${formatGold(amount)} GOLD to ${p.name}`, variant: "success" });
    appendAudit({ action: "REFUND", targetName: p.name, details: `Refunded ${amount} GOLD` });
  }
  function reverseTrade(p: AdminPlayer) {
    pushToast({ title: `Last trade reversed for ${p.name} (mock)`, variant: "default" });
    appendAudit({ action: "TRADE_REVERSE", targetName: p.name, details: "Reversed most recent trade (mock)" });
  }
  function toggleFlag(p: AdminPlayer) {
    const newFlag = p.flaggedReason ? undefined : "Manual review pending";
    setMockPlayers((prev) =>
      prev.map((x) => (x.id === p.id ? { ...x, flaggedReason: newFlag } : x))
    );
    setSelectedPlayer((prev) => (prev ? { ...prev, flaggedReason: newFlag } : prev));
    pushToast({
      title: newFlag ? `${p.name} flagged for review` : `Flag cleared on ${p.name}`,
      variant: newFlag ? "warning" : "success",
    });
    appendAudit({ action: "FLAG", targetName: p.name, details: newFlag ? "Flagged for manual review" : "Flag cleared" });
  }
  function resetRaidShield(p: AdminPlayer) {
    pushToast({ title: `Raid shield reset for ${p.name}`, variant: "success" });
    appendAudit({ action: "SHIELD_RESET", targetName: p.name, details: "Raid shield cooldown reset" });
  }
  function sendWarning(p: AdminPlayer, msg: string) {
    if (!msg.trim()) {
      pushToast({ title: "Warning message required", variant: "error" });
      return;
    }
    pushToast({ title: `Warning sent to ${p.name}`, variant: "warning" });
    appendAudit({ action: "WARN", targetName: p.name, details: `Warning: ${msg.slice(0, 80)}` });
  }

  // -------- KILL SWITCH HANDLERS --------
  function toggleFeature(key: string, label: string) {
    setKillSwitches((prev) => {
      const cur = prev[key];
      const next = !cur.enabled;
      pushToast({
        title: `Feature ${label} ${next ? "enabled" : "disabled"}`,
        variant: next ? "success" : "warning",
      });
      appendAudit({ action: "KILL_SWITCH", details: `${label} ${next ? "enabled" : "disabled"}` });
      return { ...prev, [key]: { enabled: next, lastToggledAt: Date.now(), adminName } };
    });
  }
  function killAllTrading() {
    setKillSwitches((prev) => {
      const next: typeof prev = { ...prev };
      for (const f of ["bazaar", "raids", "coliseum", "leviathan"]) {
        next[f] = { enabled: false, lastToggledAt: Date.now(), adminName };
      }
      return next;
    });
    setKillAllConfirm(false);
    pushToast({ title: "EMERGENCY: All trading halted", description: "Bazaar, raids, coliseum & leviathan disabled.", variant: "error" });
    appendAudit({ action: "KILL_SWITCH", details: "EMERGENCY: All trading features disabled" });
  }

  function exportAudit() {
    pushToast({ title: `Audit log exported (CSV, ${mockAuditLog.length} entries)`, variant: "success" });
  }

  const filteredPlayers = useMemo(() => {
    const q = playerSearch.trim().toLowerCase();
    if (!q) return mockPlayers;
    return mockPlayers.filter((p) => p.name.toLowerCase().includes(q));
  }, [mockPlayers, playerSearch]);

  const filteredAudit = useMemo(() => {
    if (auditFilter === "ALL") return mockAuditLog;
    return mockAuditLog.filter((e) => e.action === auditFilter);
  }, [mockAuditLog, auditFilter]);

  const auditActionTypes = useMemo(() => {
    return ["ALL", ...Array.from(new Set(mockAuditLog.map((e) => e.action)))];
  }, [mockAuditLog]);

  // ---------- AUTH GATE ----------

  if (!authenticated) {
    return (
      <div
        className="fixed inset-0 z-[150] flex items-center justify-center p-4"
        style={{ background: "rgba(2,8,20,0.85)", backdropFilter: "blur(10px)" }}
        onClick={onClose}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-md rounded-2xl overflow-hidden"
          style={{
            background: `linear-gradient(160deg, ${NAVY_DEEP} 0%, ${NAVY_PANEL} 100%)`,
            border: `1px solid ${AMBER}55`,
            boxShadow: `0 12px 60px ${AMBER_GLOW}`,
          }}
        >
          <div className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center text-xl"
                style={{ background: `${AMBER}22`, border: `1px solid ${AMBER}66` }}
              >
                🛡️
              </div>
              <div>
                <h2 className="text-lg font-bold" style={{ color: AMBER }}>
                  Admin Mode
                </h2>
                <p className="text-xs text-white/60">Crabtopia Command Center</p>
              </div>
            </div>

            <div
              className="rounded-lg px-3 py-2 mb-4 text-[11px] font-semibold"
              style={{
                background: `${AMBER}1a`,
                border: `1px solid ${AMBER}55`,
                color: AMBER,
              }}
            >
              ⚠ DEMO MODE — Real admin requires server-side 2FA + role-based access
            </div>

            <label className="block text-[11px] uppercase tracking-wide text-white/60 mb-1">
              Admin passphrase
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAuthenticate();
              }}
              placeholder="any value works (mock)"
              className="w-full rounded-lg px-3 py-2 text-sm mb-3 outline-none"
              style={{
                background: "rgba(0,0,0,0.35)",
                border: `1px solid rgba(255,200,87,0.3)`,
                color: "#EAF6FF",
              }}
              autoFocus
            />

            <GlowButton variant="gold" className="w-full" onClick={handleAuthenticate} disabled={authing}>
              {authing ? "Authenticating…" : "Authenticate"}
            </GlowButton>

            <div className="flex items-center justify-between mt-4">
              <button
                onClick={onClose}
                className="text-xs text-white/50 hover:text-white/80 underline underline-offset-2"
              >
                Cancel
              </button>
              <span className="text-[10px] text-white/40">
                Shellwarden Lvl {player?.shellwardenLevel ?? 1}
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ---------- CONSOLE ----------

  return (
    <div
      className="fixed inset-0 z-[150] flex items-center justify-center p-2 sm:p-4"
      style={{ background: "rgba(2,8,20,0.85)", backdropFilter: "blur(10px)" }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-4xl max-h-[88vh] overflow-y-auto rounded-2xl"
        style={{
          background: `linear-gradient(160deg, ${NAVY_DEEP} 0%, ${NAVY_PANEL} 100%)`,
          border: `1px solid ${AMBER}44`,
          boxShadow: `0 12px 60px ${AMBER_GLOW}`,
        }}
      >
        {/* HEADER */}
        <div
          className="sticky top-0 z-10 px-4 py-3 flex items-center justify-between flex-wrap gap-2"
          style={{
            background: `linear-gradient(160deg, ${NAVY_DEEP} 0%, ${NAVY_PANEL} 100%)`,
            borderBottom: `1px solid ${AMBER}33`,
          }}
        >
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xl">🛡️</span>
            <h2 className="text-base sm:text-lg font-bold" style={{ color: AMBER }}>
              Crabtopia Admin Console
            </h2>
            <span
              className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded"
              style={{ background: `${AMBER}22`, color: AMBER, border: `1px solid ${AMBER}55` }}
            >
              DEMO
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] sm:text-xs text-white/60">
              Signed in as: <span style={{ color: AMBER }}>{adminName}</span> (demo admin)
            </span>
            <button
              onClick={onClose}
              className="w-7 h-7 flex items-center justify-center rounded-md text-white/60 hover:text-white hover:bg-white/10"
              aria-label="Close"
            >
              ✕
            </button>
          </div>
        </div>

        {/* TABS */}
        <div className="px-3 py-2 flex flex-wrap gap-1" style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
          {TAB_LABELS.map((t) => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className="px-2.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 transition-all"
                style={{
                  background: active ? `${AMBER}22` : "rgba(255,255,255,0.04)",
                  color: active ? AMBER : "rgba(255,255,255,0.65)",
                  border: active ? `1px solid ${AMBER}66` : "1px solid transparent",
                }}
              >
                <span>{t.icon}</span>
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>

        {/* BODY */}
        <div className="p-3 sm:p-4 space-y-4">
          {/* DEMO BANNER */}
          <div
            className="rounded-lg px-3 py-1.5 text-[10px] font-semibold"
            style={{ background: `${AMBER}14`, border: `1px solid ${AMBER}33`, color: AMBER }}
          >
            ⚠ DEMO MODE — Real admin requires server-side 2FA + role-based access
          </div>

          {/* ---------- OVERVIEW TAB ---------- */}
          {tab === "overview" && (
            <>
              <SectionTitle title="Live Dials (24h)" icon={<span>📡</span>} />
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                <StatChip label="Active Players 24h" value={<span>12,847 ▲</span>} color={GREEN} icon={<MiniSparkline color={GREEN} up />} />
                <StatChip label="GOLD in Circulation" value={<>4.82M</>} color={AMBER} icon={<GoldIcon size={16} />} />
                <StatChip label="Weekly Inflation" value={<span style={{ color: GREEN }}>+1.7% ✓</span>} color={GREEN} icon={<MiniSparkline color={GREEN} up />} />
                <StatChip label="Open Trades" value="1,234" color="#7CF5E1" icon={<MiniSparkline color="#7CF5E1" up />} />
                <StatChip label="Live Raids" value="47" color="#FF6F91" icon={<MiniSparkline color="#FF6F91" up />} />
                <StatChip label="Pending Tickets" value="8" color="#FFD166" icon={<MiniSparkline color="#FFD166" up />} />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <GlassPanel className="p-3">
                  <SectionTitle title="System Health" icon={<span>⚙️</span>} />
                  <div className="space-y-1.5">
                    {[
                      { k: "Server load", v: "31%", c: GREEN },
                      { k: "DB latency (p95)", v: "12ms", c: GREEN },
                      { k: "WebSocket connections", v: "4,210", c: GREEN },
                      { k: "Queue depth", v: "0", c: GREEN },
                    ].map((row) => (
                      <div key={row.k} className="flex items-center justify-between text-xs">
                        <span className="text-white/65">{row.k}</span>
                        <span className="font-bold" style={{ color: row.c }}>
                          {row.v} ✓
                        </span>
                      </div>
                    ))}
                  </div>
                </GlassPanel>

                <GlassPanel className="p-3">
                  <SectionTitle title="Alerts" icon={<span>🚨</span>} />
                  <div className="space-y-2">
                    {[
                      { t: "Economy running cold — schedule bonus event?", c: AMBER },
                      { t: "Multi-account cluster detected: 4 accounts on device X", c: ROSE },
                      { t: "Trade volume spike: Bazaar up 23% vs 7-day avg", c: "#FFD166" },
                    ].map((a, i) => (
                      <div
                        key={i}
                        className="rounded-lg px-2.5 py-1.5 text-[11px] flex items-start gap-2"
                        style={{ background: "rgba(0,0,0,0.25)", border: `1px solid ${a.c}33` }}
                      >
                        <span style={{ color: a.c }}>●</span>
                        <span className="text-white/85">{a.t}</span>
                      </div>
                    ))}
                  </div>
                </GlassPanel>
              </div>
            </>
          )}

          {/* ---------- ECONOMY TAB ---------- */}
          {tab === "economy" && (
            <>
              <SectionTitle title="Faucets vs Sinks (7d)" icon={<span>💰</span>} />
              <GlassPanel className="p-3">
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <div className="text-white/60 mb-1">Faucets (in)</div>
                    {[
                      { k: "Dive rewards", v: 1_820_000 },
                      { k: "Raid loot", v: 980_000 },
                      { k: "Quests", v: 410_000 },
                      { k: "Daily login", v: 220_000 },
                    ].map((r) => (
                      <div key={r.k} className="flex justify-between py-0.5">
                        <span className="text-white/70">{r.k}</span>
                        <span style={{ color: GREEN }}>+{formatGold(r.v)}</span>
                      </div>
                    ))}
                  </div>
                  <div>
                    <div className="text-white/60 mb-1">Sinks (out)</div>
                    {[
                      { k: "Breeding fees", v: 760_000 },
                      { k: "Bazaar tax (5%)", v: 412_000 },
                      { k: "Cosmetic shop", v: 188_000 },
                      { k: "Raid entry", v: 95_000 },
                    ].map((r) => (
                      <div key={r.k} className="flex justify-between py-0.5">
                        <span className="text-white/70">{r.k}</span>
                        <span style={{ color: ROSE }}>-{formatGold(r.v)}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="mt-2 pt-2 border-t border-white/10 flex justify-between text-xs font-bold">
                  <span className="text-white/70">Net faucet (7d)</span>
                  <span style={{ color: AMBER }}>+1,875K GOLD</span>
                </div>
              </GlassPanel>

              <SectionTitle title="Manual Intervention" icon={<span>🛠️</span>} />
              <GlassPanel className="p-3 space-y-4">
                {/* dive multiplier */}
                <div>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-white/70">Dive reward multiplier</span>
                    <span className="font-bold" style={{ color: AMBER }}>
                      {diveMultiplier.toFixed(2)}x
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.5}
                    max={1.5}
                    step={0.05}
                    value={diveMultiplier}
                    onChange={(e) => setDiveMultiplier(parseFloat(e.target.value))}
                    className="w-full accent-amber-400"
                    style={{ accentColor: AMBER }}
                  />
                  <div className="flex justify-between text-[9px] text-white/40 mt-0.5">
                    <span>0.5x</span>
                    <span>1.0x</span>
                    <span>1.5x</span>
                  </div>
                  <GlowButton variant="gold" size="sm" className="mt-2" onClick={applyDiveMultiplier}>
                    Apply
                  </GlowButton>
                </div>

                {/* sink event */}
                <div className="pt-3 border-t border-white/10">
                  <div className="text-xs text-white/70 mb-1">Inject GOLD sink event</div>
                  <div className="flex gap-2 flex-wrap">
                    <select
                      value={sinkType}
                      onChange={(e) => setSinkType(e.target.value)}
                      className="rounded-lg px-2 py-1 text-xs flex-1 min-w-[160px]"
                      style={{
                        background: "rgba(0,0,0,0.35)",
                        border: `1px solid ${AMBER}33`,
                        color: "#EAF6FF",
                      }}
                    >
                      {SINK_TYPES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                    <GlowButton variant="gold" size="sm" onClick={scheduleSink}>
                      Schedule
                    </GlowButton>
                  </div>
                </div>

                {/* breeding toggle */}
                <div className="pt-3 border-t border-white/10 flex items-center justify-between">
                  <div>
                    <div className="text-xs text-white/70">Pause breeding</div>
                    <div className="text-[10px] text-white/40">Mirrors the breeding kill switch</div>
                  </div>
                  <button
                    onClick={toggleBreedingPause}
                    className="relative w-12 h-6 rounded-full transition-all"
                    style={{
                      background: killSwitches.breeding.enabled ? `${GREEN}33` : `${ROSE}33`,
                      border: `1px solid ${killSwitches.breeding.enabled ? GREEN : ROSE}66`,
                    }}
                  >
                    <span
                      className="absolute top-0.5 w-4 h-4 rounded-full transition-all"
                      style={{
                        left: killSwitches.breeding.enabled ? "26px" : "2px",
                        background: killSwitches.breeding.enabled ? GREEN : ROSE,
                      }}
                    />
                  </button>
                </div>

                {/* egg quota */}
                <div className="pt-3 border-t border-white/10">
                  <div className="text-xs text-white/70 mb-1">Force egg quota (per player)</div>
                  <div className="flex gap-2 items-center">
                    <input
                      type="number"
                      min={0}
                      max={10}
                      value={eggQuota}
                      onChange={(e) => setEggQuota(Math.max(0, parseInt(e.target.value || "0", 10)))}
                      className="rounded-lg px-2 py-1 text-xs w-24"
                      style={{
                        background: "rgba(0,0,0,0.35)",
                        border: `1px solid ${AMBER}33`,
                        color: "#EAF6FF",
                      }}
                    />
                    <GlowButton variant="gold" size="sm" onClick={forceEggQuota}>
                      Apply
                    </GlowButton>
                  </div>
                </div>
              </GlassPanel>
            </>
          )}

          {/* ---------- EVENTS TAB ---------- */}
          {tab === "events" && (
            <>
              <SectionTitle title="Scheduled Events" icon={<span>🗓️</span>} />
              <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                {scheduledEvents.length === 0 ? (
                  <EmptyState message="No events scheduled" hint="Schedule a new event below." compact />
                ) : (
                  scheduledEvents.map((ev) => {
                    const meta = EVENT_TYPE_META[ev.type];
                    const isLive = ev.status === "live";
                    return (
                      <GlassPanel key={ev.id} className="p-3">
                        <div className="flex items-start justify-between gap-2 flex-wrap">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-bold text-sm" style={{ color: AMBER }}>
                                {ev.name}
                              </span>
                              <span
                                className="text-[9px] font-bold px-1.5 py-0.5 rounded"
                                style={{ background: `${meta.color}22`, color: meta.color, border: `1px solid ${meta.color}55` }}
                              >
                                {meta.label}
                              </span>
                              <span
                                className="text-[9px] font-bold px-1.5 py-0.5 rounded"
                                style={{
                                  background: isLive ? `${GREEN}22` : ev.status === "completed" ? "rgba(255,255,255,0.08)" : `${AMBER}22`,
                                  color: isLive ? GREEN : ev.status === "completed" ? "rgba(255,255,255,0.55)" : AMBER,
                                  border: `1px solid ${isLive ? GREEN : ev.status === "completed" ? "rgba(255,255,255,0.2)" : AMBER}55`,
                                }}
                              >
                                {ev.status.toUpperCase()}
                              </span>
                            </div>
                            <div className="text-[11px] text-white/60 mt-1">
                              Starts {new Date(ev.startsAt).toLocaleString()} · {ev.durationHours}h · {ev.bonus}
                            </div>
                            {!isLive && ev.status === "scheduled" && (
                              <div className="text-[10px] mt-0.5" style={{ color: AMBER }}>
                                ⏳ Starts in {countdownTo(ev.startsAt)}
                              </div>
                            )}
                          </div>
                          {ev.status === "scheduled" && (
                            <div className="flex gap-1 flex-shrink-0">
                              <GlowButton variant="gold" size="sm" onClick={() => goLiveNow(ev.id)}>
                                Go Live
                              </GlowButton>
                              <GlowButton variant="rose" size="sm" onClick={() => cancelEvent(ev.id)}>
                                Cancel
                              </GlowButton>
                            </div>
                          )}
                        </div>
                      </GlassPanel>
                    );
                  })
                )}
              </div>

              <SectionTitle title="Schedule New Event" icon={<span>➕</span>} />
              <GlassPanel className="p-3 space-y-2">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <input
                    type="text"
                    value={evName}
                    onChange={(e) => setEvName(e.target.value)}
                    placeholder="Event name"
                    className="rounded-lg px-2 py-1.5 text-xs"
                    style={{ background: "rgba(0,0,0,0.35)", border: `1px solid ${AMBER}33`, color: "#EAF6FF" }}
                  />
                  <select
                    value={evType}
                    onChange={(e) => setEvType(e.target.value as EventType)}
                    className="rounded-lg px-2 py-1.5 text-xs"
                    style={{ background: "rgba(0,0,0,0.35)", border: `1px solid ${AMBER}33`, color: "#EAF6FF" }}
                  >
                    {Object.entries(EVENT_TYPE_META).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v.label}
                      </option>
                    ))}
                  </select>
                  <input
                    type="datetime-local"
                    value={evStart}
                    onChange={(e) => setEvStart(e.target.value)}
                    className="rounded-lg px-2 py-1.5 text-xs"
                    style={{ background: "rgba(0,0,0,0.35)", border: `1px solid ${AMBER}33`, color: "#EAF6FF" }}
                  />
                  <input
                    type="number"
                    min={1}
                    value={evDuration}
                    onChange={(e) => setEvDuration(Math.max(1, parseInt(e.target.value || "1", 10)))}
                    placeholder="Duration (hours)"
                    className="rounded-lg px-2 py-1.5 text-xs"
                    style={{ background: "rgba(0,0,0,0.35)", border: `1px solid ${AMBER}33`, color: "#EAF6FF" }}
                  />
                </div>
                <input
                  type="text"
                  value={evBonus}
                  onChange={(e) => setEvBonus(e.target.value)}
                  placeholder="Bonus description"
                  className="w-full rounded-lg px-2 py-1.5 text-xs"
                  style={{ background: "rgba(0,0,0,0.35)", border: `1px solid ${AMBER}33`, color: "#EAF6FF" }}
                />
                <GlowButton variant="gold" size="sm" onClick={scheduleNewEvent}>
                  Schedule Event
                </GlowButton>
              </GlassPanel>
            </>
          )}

          {/* ---------- MODERATION TAB ---------- */}
          {tab === "moderation" && (
            <>
              <SectionTitle
                title="Player Moderation"
                icon={<span>🛡️</span>}
                action={
                  <input
                    type="text"
                    value={playerSearch}
                    onChange={(e) => setPlayerSearch(e.target.value)}
                    placeholder="Search name…"
                    className="rounded-lg px-2 py-1 text-xs w-32 sm:w-44"
                    style={{ background: "rgba(0,0,0,0.35)", border: `1px solid ${AMBER}33`, color: "#EAF6FF" }}
                  />
                }
              />
              <GlassPanel className="p-0 overflow-hidden">
                <div className="max-h-80 overflow-auto">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0" style={{ background: NAVY_DEEP }}>
                      <tr className="text-white/60 text-[10px] uppercase tracking-wide">
                        <th className="text-left px-2 py-1.5">Name</th>
                        <th className="text-right px-2 py-1.5">Lvl</th>
                        <th className="text-right px-2 py-1.5">GOLD</th>
                        <th className="text-right px-2 py-1.5 hidden sm:table-cell">Trades 24h</th>
                        <th className="text-left px-2 py-1.5 hidden sm:table-cell">Last Active</th>
                        <th className="text-left px-2 py-1.5">Flag</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredPlayers.map((p) => (
                        <tr
                          key={p.id}
                          onClick={() => setSelectedPlayer(p)}
                          className="cursor-pointer hover:bg-white/5 border-t border-white/5"
                        >
                          <td className="px-2 py-1.5 font-bold text-white/90">{p.name}</td>
                          <td className="px-2 py-1.5 text-right text-white/70">{p.level}</td>
                          <td className="px-2 py-1.5 text-right" style={{ color: AMBER }}>
                            {formatGold(p.gold)}
                          </td>
                          <td className="px-2 py-1.5 text-right text-white/70 hidden sm:table-cell">{p.tradeCount24h}</td>
                          <td className="px-2 py-1.5 text-white/60 hidden sm:table-cell">{relativeTime(p.lastActive)}</td>
                          <td className="px-2 py-1.5">
                            {p.flaggedReason ? (
                              <span
                                className="text-[9px] font-bold px-1.5 py-0.5 rounded"
                                style={{ background: `${ROSE}22`, color: ROSE, border: `1px solid ${ROSE}55` }}
                              >
                                {p.flaggedReason.split(" ")[0]}
                              </span>
                            ) : (
                              <span className="text-white/30">—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {filteredPlayers.length === 0 && (
                    <div className="p-4">
                      <EmptyState message="No players match search" compact />
                    </div>
                  )}
                </div>
              </GlassPanel>
              <p className="text-[10px] text-white/40">Click a row to open player detail drawer.</p>
            </>
          )}

          {/* ---------- AUDIT TAB ---------- */}
          {tab === "audit" && (
            <>
              <SectionTitle
                title="Audit Log (immutable)"
                icon={<span>📜</span>}
                action={
                  <div className="flex gap-1">
                    <select
                      value={auditFilter}
                      onChange={(e) => setAuditFilter(e.target.value)}
                      className="rounded-lg px-2 py-1 text-[11px]"
                      style={{ background: "rgba(0,0,0,0.35)", border: `1px solid ${AMBER}33`, color: "#EAF6FF" }}
                    >
                      {auditActionTypes.map((a) => (
                        <option key={a} value={a}>
                          {a}
                        </option>
                      ))}
                    </select>
                    <GlowButton variant="ghost" size="sm" onClick={exportAudit}>
                      Export CSV
                    </GlowButton>
                  </div>
                }
              />
              <GlassPanel className="p-0 overflow-hidden">
                <div className="max-h-96 overflow-y-auto divide-y divide-white/5">
                  {filteredAudit.map((e) => (
                    <div key={e.id} className="px-3 py-2 text-xs">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold" style={{ color: AMBER }}>
                          {e.action}
                        </span>
                        <span className="text-white/40 text-[10px]">{relativeTime(e.timestamp)}</span>
                        <span className="text-white/60">by {e.adminName}</span>
                        {e.targetName && (
                          <span className="text-white/70">→ {e.targetName}</span>
                        )}
                      </div>
                      <div className="text-white/75 mt-0.5">{e.details}</div>
                    </div>
                  ))}
                  {filteredAudit.length === 0 && (
                    <div className="p-4">
                      <EmptyState message="No entries for this filter" compact />
                    </div>
                  )}
                </div>
              </GlassPanel>
              <p className="text-[10px] text-white/40">Read-only. New admin actions append automatically.</p>
            </>
          )}

          {/* ---------- KILL SWITCHES TAB ---------- */}
          {tab === "kill-switches" && (
            <>
              <SectionTitle title="Feature Kill Switches" icon={<span>⛔</span>} />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {KILL_SWITCH_FEATURES.map((f) => {
                  const s = killSwitches[f.key];
                  const on = s.enabled;
                  return (
                    <GlassPanel key={f.key} className="p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-sm font-bold text-white/90">{f.label}</div>
                          <div className="text-[10px] text-white/50">{f.desc}</div>
                          <div className="text-[9px] text-white/40 mt-1">
                            {on ? "Enabled" : "Disabled"} · {relativeTime(s.lastToggledAt)} by {s.adminName}
                          </div>
                        </div>
                        <button
                          onClick={() => toggleFeature(f.key, f.label)}
                          className="relative w-12 h-6 rounded-full transition-all flex-shrink-0"
                          style={{
                            background: on ? `${GREEN}33` : `${ROSE}33`,
                            border: `1px solid ${on ? GREEN : ROSE}66`,
                          }}
                          aria-label={`Toggle ${f.label}`}
                        >
                          <span
                            className="absolute top-0.5 w-4 h-4 rounded-full transition-all"
                            style={{
                              left: on ? "26px" : "2px",
                              background: on ? GREEN : ROSE,
                            }}
                          />
                        </button>
                      </div>
                    </GlassPanel>
                  );
                })}
              </div>

              {/* EMERGENCY */}
              <GlassPanel className="p-3" glow="rgba(255,111,145,0.2)">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div>
                    <div className="text-sm font-bold" style={{ color: ROSE }}>
                      ⚠ EMERGENCY: Kill all trading
                    </div>
                    <div className="text-[10px] text-white/55">
                      Instantly disables Bazaar, raids, coliseum & leviathan raids.
                    </div>
                  </div>
                  {!killAllConfirm ? (
                    <GlowButton variant="rose" size="sm" onClick={() => setKillAllConfirm(true)}>
                      Halt Trading
                    </GlowButton>
                  ) : (
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] text-white/70">Confirm?</span>
                      <GlowButton variant="rose" size="sm" onClick={killAllTrading}>
                        Yes, halt
                      </GlowButton>
                      <GlowButton variant="ghost" size="sm" onClick={() => setKillAllConfirm(false)}>
                        Cancel
                      </GlowButton>
                    </div>
                  )}
                </div>
              </GlassPanel>
            </>
          )}
        </div>

        {/* FOOTER */}
        <div
          className="px-4 py-3 mt-2 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2"
          style={{
            background: NAVY_DEEP,
            borderTop: `1px solid ${AMBER}22`,
          }}
        >
          <div className="text-[10px] text-white/55 leading-snug">
            <div>All admin actions are logged immutably. Role-based access enforced server-side. 2FA required for production.</div>
            <div style={{ color: AMBER_DIM }}>This console is a DEMO. Real admin tools require server-side authentication.</div>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            <GlowButton variant="ghost" size="sm" onClick={handleSignOut}>
              Sign out
            </GlowButton>
            <GlowButton variant="gold" size="sm" onClick={onClose}>
              Close
            </GlowButton>
          </div>
        </div>
      </div>

      {/* ---------- PLAYER DETAIL DRAWER ---------- */}
      {selectedPlayer && (
        <PlayerDetailDrawer
          player={selectedPlayer}
          onClose={() => setSelectedPlayer(null)}
          onBan={banPlayer}
          onRefund={refundPlayer}
          onReverseTrade={reverseTrade}
          onToggleFlag={toggleFlag}
          onResetShield={resetRaidShield}
          onWarn={sendWarning}
        />
      )}
    </div>
  );
}

// ---------- PLAYER DETAIL DRAWER ----------

function PlayerDetailDrawer({
  player,
  onClose,
  onBan,
  onRefund,
  onReverseTrade,
  onToggleFlag,
  onResetShield,
  onWarn,
}: {
  player: AdminPlayer;
  onClose: () => void;
  onBan: (p: AdminPlayer, reason: string) => void;
  onRefund: (p: AdminPlayer, amount: number) => void;
  onReverseTrade: (p: AdminPlayer) => void;
  onToggleFlag: (p: AdminPlayer) => void;
  onResetShield: (p: AdminPlayer) => void;
  onWarn: (p: AdminPlayer, msg: string) => void;
}) {
  const [banReason, setBanReason] = useState<string>(BAN_REASONS[0]);
  const [refundAmount, setRefundAmount] = useState<number>(1000);
  const [warnMsg, setWarnMsg] = useState("");

  // mock recent trades
  const recentTrades = [
    { id: "t1", item: "Coral Reaver (Lv 40)", partner: "DriftKing", amount: 85000, time: Date.now() - 30 * 60_000 },
    { id: "t2", item: "Gilded Egg", partner: "GildedCrab", amount: 220000, time: Date.now() - 2 * 3600_000 },
    { id: "t3", item: "Frost Bulwark", partner: "Frostfang", amount: 64000, time: Date.now() - 5 * 3600_000 },
    { id: "t4", item: "Storm Skitter", partner: "Pinchstorm", amount: 38000, time: Date.now() - 9 * 3600_000 },
    { id: "t5", item: "Mangrove Shellmender", partner: "MangroveMaven", amount: 12000, time: Date.now() - 18 * 3600_000 },
  ];

  return (
    <div
      className="fixed inset-0 z-[160] flex items-center justify-end"
      style={{ background: "rgba(0,0,0,0.5)" }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm h-full overflow-y-auto p-4"
        style={{
          background: `linear-gradient(160deg, ${NAVY_DEEP} 0%, ${NAVY_PANEL} 100%)`,
          borderLeft: `1px solid ${AMBER}44`,
          boxShadow: `0 0 40px ${AMBER_GLOW}`,
        }}
      >
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="text-xs text-white/50">Player Detail</div>
            <h3 className="text-base font-bold" style={{ color: AMBER }}>
              {player.name}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-md text-white/60 hover:text-white hover:bg-white/10"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-1.5 mb-3">
          <StatChip label="Level" value={player.level} color={AMBER} />
          <StatChip label="GOLD" value={formatGold(player.gold)} color={AMBER} icon={<GoldIcon size={14} />} />
          <StatChip label="Trades 24h" value={player.tradeCount24h} color="#7CF5E1" />
          <StatChip label="Last Active" value={relativeTime(player.lastActive)} color="#7CF5E1" />
        </div>

        {/* Flag */}
        <div className="mb-3">
          <div className="text-[10px] uppercase text-white/50 mb-1">Flag status</div>
          {player.flaggedReason ? (
            <div
              className="rounded-lg px-2 py-1.5 text-[11px]"
              style={{ background: `${ROSE}1a`, border: `1px solid ${ROSE}55`, color: ROSE }}
            >
              ⚑ {player.flaggedReason}
            </div>
          ) : (
            <div className="text-[11px] text-white/50">No active flags</div>
          )}
          <GlowButton variant="ghost" size="sm" className="mt-1" onClick={() => onToggleFlag(player)}>
            {player.flaggedReason ? "Clear flag" : "Flag for review"}
          </GlowButton>
        </div>

        {/* Recent trades */}
        <div className="mb-3">
          <div className="text-[10px] uppercase text-white/50 mb-1">Recent trades (mock 5)</div>
          <div className="space-y-1">
            {recentTrades.map((t) => (
              <div
                key={t.id}
                className="rounded-lg px-2 py-1 text-[11px] flex items-center justify-between"
                style={{ background: "rgba(0,0,0,0.25)", border: "1px solid rgba(255,255,255,0.06)" }}
              >
                <div className="min-w-0">
                  <div className="text-white/85 truncate">{t.item}</div>
                  <div className="text-white/40 text-[9px]">
                    {t.partner} · {relativeTime(t.time)}
                  </div>
                </div>
                <span style={{ color: AMBER }} className="font-bold">
                  {formatGold(t.amount)}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="space-y-3">
          {/* Ban */}
          <div className="pt-2 border-t border-white/10">
            <div className="text-[10px] uppercase text-white/50 mb-1">Ban account</div>
            <div className="flex gap-1 flex-wrap">
              <select
                value={banReason}
                onChange={(e) => setBanReason(e.target.value)}
                className="rounded-lg px-2 py-1 text-[11px] flex-1 min-w-[120px]"
                style={{ background: "rgba(0,0,0,0.35)", border: `1px solid ${ROSE}44`, color: "#EAF6FF" }}
              >
                {BAN_REASONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
              <GlowButton variant="rose" size="sm" onClick={() => onBan(player, banReason)}>
                Ban
              </GlowButton>
            </div>
          </div>

          {/* Refund */}
          <div className="pt-2 border-t border-white/10">
            <div className="text-[10px] uppercase text-white/50 mb-1">Refund GOLD</div>
            <div className="flex gap-1 items-center">
              <input
                type="number"
                min={0}
                value={refundAmount}
                onChange={(e) => setRefundAmount(Math.max(0, parseInt(e.target.value || "0", 10)))}
                className="rounded-lg px-2 py-1 text-[11px] w-24"
                style={{ background: "rgba(0,0,0,0.35)", border: `1px solid ${AMBER}33`, color: "#EAF6FF" }}
              />
              <GlowButton variant="gold" size="sm" onClick={() => onRefund(player, refundAmount)}>
                Refund
              </GlowButton>
            </div>
          </div>

          {/* Warning */}
          <div className="pt-2 border-t border-white/10">
            <div className="text-[10px] uppercase text-white/50 mb-1">Send warning</div>
            <input
              type="text"
              value={warnMsg}
              onChange={(e) => setWarnMsg(e.target.value)}
              placeholder="Warning message…"
              className="w-full rounded-lg px-2 py-1 text-[11px] mb-1"
              style={{ background: "rgba(0,0,0,0.35)", border: `1px solid ${AMBER}33`, color: "#EAF6FF" }}
            />
            <GlowButton variant="gold" size="sm" onClick={() => onWarn(player, warnMsg)}>
              Send warning
            </GlowButton>
          </div>

          {/* Misc actions */}
          <div className="pt-2 border-t border-white/10 flex gap-1 flex-wrap">
            <GlowButton variant="ghost" size="sm" onClick={() => onReverseTrade(player)}>
              Reverse trade
            </GlowButton>
            <GlowButton variant="ghost" size="sm" onClick={() => onResetShield(player)}>
              Reset raid shield
            </GlowButton>
          </div>
        </div>
      </div>
    </div>
  );
}

export default AdminConsoleModal;
