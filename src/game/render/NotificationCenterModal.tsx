// Crabtopia - In-App Notification Center (section 9 & 10B problem 10)
// Self-contained modal: feed, settings, quiet hours. Mock push toggles —
// production would integrate Web Push API + service worker + FCM/APNs.
"use client";

import React, { useMemo, useState } from "react";
import { useGame } from "../store/gameStore";
import {
  GlassPanel,
  GlowButton,
  SectionTitle,
  EmptyState,
} from "./ui";

// ---------- types ----------
type NotifType =
  | "dive_complete"
  | "raid_incoming"
  | "raid_result"
  | "egg_hatched"
  | "hire_income"
  | "event_start";

type ActionType = "claim" | "redeploy" | "reinforce" | "view";

interface NotifAction {
  label: string;
  actionType: ActionType;
}

interface AppNotification {
  id: string;
  type: NotifType;
  title: string;
  body: string;
  timestamp: number;
  read: boolean;
  actions?: NotifAction[];
  priority: "low" | "normal" | "high";
}

const TYPE_META: Record<NotifType, { icon: string; name: string; desc: string }> = {
  dive_complete: { icon: "⛏️", name: "Dive complete", desc: "When your dive expedition finishes" },
  raid_incoming: { icon: "⚔️", name: "Raid incoming", desc: "When another player raids your dig site" },
  raid_result: { icon: "🏆", name: "Raid result", desc: "Win or loss outcome of your raids" },
  egg_hatched: { icon: "🥚", name: "Egg hatched", desc: "When a bred egg completes its 5-day hatch" },
  hire_income: { icon: "🪙", name: "Hire income", desc: "When a listed Hall crab earns hire fees" },
  event_start: { icon: "🎉", name: "Event start", desc: "When a scheduled event goes live" },
};

// mock recent notifications — relative to now
function makeMockNotifications(now: number): AppNotification[] {
  return [
    {
      id: "n1",
      type: "raid_incoming",
      title: "Raid incoming!",
      body: "Coral raiders spotted near your Tidal Plateau dig site. 4m to respond.",
      timestamp: now - 1000 * 30,
      read: false,
      priority: "high",
      actions: [
        { label: "Add Reinforcement", actionType: "reinforce" },
        { label: "View", actionType: "view" },
      ],
    },
    {
      id: "n2",
      type: "dive_complete",
      title: "Dive complete: Coral Gardens",
      body: "Your team returned with 1,240 GOLD and 3 shell shards.",
      timestamp: now - 1000 * 60 * 2,
      read: false,
      priority: "normal",
      actions: [
        { label: "Claim", actionType: "claim" },
        { label: "Redeploy", actionType: "redeploy" },
      ],
    },
    {
      id: "n3",
      type: "egg_hatched",
      title: "Egg hatched!",
      body: "A Reaver egg from (Coral × Cinder) finished its 5-day hatch.",
      timestamp: now - 1000 * 60 * 18,
      read: false,
      priority: "normal",
      actions: [{ label: "View", actionType: "view" }],
    },
    {
      id: "n4",
      type: "raid_result",
      title: "Raid won!",
      body: "You raided CinderReef Outpost — victory! +860 GOLD, 1 tactic shard.",
      timestamp: now - 1000 * 60 * 60,
      read: true,
      priority: "high",
      actions: [{ label: "View", actionType: "view" }],
    },
    {
      id: "n5",
      type: "hire_income",
      title: "Hire income received",
      body: "'Tidewarden Xar' earned 320 GOLD in hire fees over 6 hours.",
      timestamp: now - 1000 * 60 * 60 * 3,
      read: true,
      priority: "low",
      actions: [{ label: "Claim", actionType: "claim" }],
    },
    {
      id: "n6",
      type: "event_start",
      title: "Event live: Tidal Festival",
      body: "Bonus dive rewards active for the next 24h. Dive now!",
      timestamp: now - 1000 * 60 * 60 * 5,
      read: true,
      priority: "normal",
      actions: [{ label: "View", actionType: "view" }],
    },
  ];
}

// relative time label: "just now" / "2m ago" / "1h ago"
function relTime(ts: number, now: number): string {
  const diff = Math.max(0, now - ts);
  const s = Math.floor(diff / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

// 12h friendly format from "HH:MM" (e.g. "22:00" → "10:00 PM")
function to12h(t: string): string {
  const [hStr, mStr] = t.split(":");
  const h = parseInt(hStr ?? "0", 10);
  const m = mStr ?? "00";
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m} ${ampm}`;
}

// Toggle switch — small controlled component
function Toggle({
  checked,
  onChange,
  disabled = false,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      className="relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50"
      style={{
        background: checked
          ? "linear-gradient(135deg, #12A7A0, #0A4A66)"
          : "rgba(255,255,255,0.12)",
        boxShadow: checked ? "0 0 12px rgba(18,167,160,0.45)" : "none",
        border: "1px solid rgba(124,245,225,0.25)",
      }}
    >
      <span
        className="inline-block h-5 w-5 rounded-full bg-white transition-transform"
        style={{ transform: checked ? "translateX(22px)" : "translateX(2px)" }}
      />
    </button>
  );
}

export default function NotificationCenterModal({
  onClose,
}: {
  onClose: () => void;
}) {
  const pushToast = useGame((s) => s.pushToast);
  const playerName = useGame((s) => s.player?.name ?? "Captain");

  const now = Date.now();
  const [view, setView] = useState<"feed" | "settings" | "quiet-hours">("feed");
  const [notifications, setNotifications] = useState<AppNotification[]>(() =>
    makeMockNotifications(now)
  );
  const [toggles, setToggles] = useState<Record<NotifType, boolean>>({
    dive_complete: true,
    raid_incoming: true,
    raid_result: true,
    egg_hatched: true,
    hire_income: false,
    event_start: true,
  });
  const [quietHoursStart, setQuietHoursStart] = useState("22:00");
  const [quietHoursEnd, setQuietHoursEnd] = useState("07:00");
  const [quietHoursEnabled, setQuietHoursEnabled] = useState(true);
  const [smartBatching, setSmartBatching] = useState(true);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [emailEnabled, setEmailEnabled] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [exceptions, setExceptions] = useState<Record<NotifType, boolean>>({
    dive_complete: false,
    raid_incoming: true,
    raid_result: true,
    egg_hatched: false,
    hire_income: false,
    event_start: false,
  });

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.read).length,
    [notifications]
  );
  const sortedNotifs = useMemo(
    () => [...notifications].sort((a, b) => b.timestamp - a.timestamp),
    [notifications]
  );

  function markRead(id: string) {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
  }
  function dismiss(id: string) {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }
  function markAllRead() {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }
  function clearAll() {
    setNotifications([]);
    setConfirmClear(false);
  }

  function handleAction(n: AppNotification, a: NotifAction) {
    switch (a.actionType) {
      case "claim":
        pushToast({ title: "Claimed!", description: n.title, variant: "success" });
        break;
      case "redeploy":
        pushToast({ title: "Redeploying team...", description: n.title, variant: "default" });
        break;
      case "reinforce":
        pushToast({ title: "Reinforcement picker opened", description: n.title, variant: "default" });
        break;
      case "view":
        pushToast({ title: "Opening...", description: n.title, variant: "default" });
        break;
    }
    markRead(n.id);
  }

  const exceptionNames = (Object.keys(exceptions) as NotifType[]).filter(
    (k) => exceptions[k]
  );
  const previewText = quietHoursEnabled
    ? `During quiet hours (${to12h(quietHoursStart)} - ${to12h(
        quietHoursEnd
      )} Jakarta), you'll only receive: ${
        exceptionNames.length
          ? exceptionNames.map((k) => TYPE_META[k].name).join(", ")
          : "nothing"
      }. All others batch and deliver at ${to12h(quietHoursEnd)}.`
    : "Quiet hours disabled. All enabled notifications deliver in real time.";

  const tabs: { key: typeof view; label: string }[] = [
    { key: "feed", label: "Feed" },
    { key: "settings", label: "Settings" },
    { key: "quiet-hours", label: "Quiet Hours" },
  ];

  function actionVariant(
    a: ActionType
  ): "gold" | "teal" | "rose" | "ghost" {
    if (a === "claim") return "gold";
    if (a === "reinforce") return "rose";
    if (a === "redeploy") return "teal";
    return "ghost";
  }

  return (
    <div
      className="modal-backdrop-enter fixed inset-0 z-[150] flex items-center justify-center p-3 sm:p-6"
      style={{ background: "rgba(5,10,30,0.65)", backdropFilter: "blur(6px)" }}
      onClick={onClose}
    >
      <GlassPanel
        className="w-full max-w-2xl max-h-[88vh] overflow-y-auto flex flex-col"
        glow="rgba(124,245,225,0.25)"
        style={{ background: "rgba(10,27,61,0.95)" }}
      >
        <div className="p-4 sm:p-6 pb-3" onClick={(e) => e.stopPropagation()}>
          {/* Header */}
          <div className="flex items-start justify-between mb-3">
            <div className="min-w-0">
              <h1
                className="text-xl sm:text-2xl font-bold flex items-center gap-2 flex-wrap"
                style={{
                  fontFamily: "Fredoka, system-ui, sans-serif",
                  color: "#EAF6FF",
                }}
              >
                <span aria-hidden>🔔</span>
                <span>Notifications</span>
                {unreadCount > 0 && (
                  <span
                    className="ml-1 inline-flex items-center justify-center rounded-full text-[10px] font-bold px-1.5 py-0.5"
                    style={{
                      background: "#FF6F91",
                      color: "#fff",
                      boxShadow: "0 0 8px rgba(255,111,145,0.6)",
                    }}
                    aria-label={`${unreadCount} unread`}
                  >
                    {unreadCount}
                  </span>
                )}
              </h1>
              <p className="text-xs opacity-70 mt-0.5">
                Hi {playerName} — your latest reef alerts.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="shrink-0 rounded-lg p-1.5 hover:bg-white/10 transition-colors"
              aria-label="Close"
              style={{ color: "#EAF6FF" }}
            >
              ✕
            </button>
          </div>

          {/* Tabs */}
          <div
            className="flex gap-1 mb-4 p-1 rounded-xl"
            style={{
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(124,245,225,0.15)",
            }}
          >
            {tabs.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setView(t.key)}
                className="flex-1 rounded-lg px-3 py-1.5 text-xs sm:text-sm font-bold transition-all"
                style={{
                  background:
                    view === t.key
                      ? "linear-gradient(135deg, #12A7A0, #0A4A66)"
                      : "transparent",
                  color:
                    view === t.key ? "#EAF6FF" : "rgba(234,246,255,0.7)",
                  boxShadow:
                    view === t.key ? "0 0 12px rgba(18,167,160,0.4)" : "none",
                }}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* ---------- Feed view ---------- */}
          {view === "feed" && (
            <div className="space-y-3">
              <SectionTitle
                icon={<span aria-hidden>📬</span>}
                title={`Recent (${notifications.length})`}
                action={
                  <div className="flex gap-2 flex-wrap">
                    <GlowButton
                      size="sm"
                      variant="ghost"
                      onClick={markAllRead}
                      disabled={unreadCount === 0}
                    >
                      Mark all read
                    </GlowButton>
                    {confirmClear ? (
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] opacity-80">Sure?</span>
                        <GlowButton size="sm" variant="rose" onClick={clearAll}>
                          Yes
                        </GlowButton>
                        <GlowButton
                          size="sm"
                          variant="ghost"
                          onClick={() => setConfirmClear(false)}
                        >
                          No
                        </GlowButton>
                      </div>
                    ) : (
                      <GlowButton
                        size="sm"
                        variant="ghost"
                        onClick={() => setConfirmClear(true)}
                        disabled={notifications.length === 0}
                      >
                        Clear all
                      </GlowButton>
                    )}
                  </div>
                }
              />

              {sortedNotifs.length === 0 ? (
                <EmptyState
                  message="No notifications. You're all caught up!"
                  hint="New alerts will appear here in real time."
                />
              ) : (
                <ul className="space-y-2">
                  {sortedNotifs.map((n) => {
                    const meta = TYPE_META[n.type];
                    const priorityColor =
                      n.priority === "high"
                        ? "#FF6F91"
                        : n.priority === "normal"
                        ? "#7CF5E1"
                        : null;
                    return (
                      <li key={n.id}>
                        <GlassPanel
                          className={`p-3 sm:p-4 relative ${n.read ? "opacity-70" : ""}`}
                          style={{
                            border: n.read
                              ? "1px solid rgba(124,245,225,0.12)"
                              : "1px solid rgba(124,245,225,0.35)",
                            background: n.read
                              ? "rgba(10,27,61,0.4)"
                              : "rgba(18,167,160,0.1)",
                          }}
                        >
                          <div className="flex items-start gap-3">
                            <div
                              className="shrink-0 flex items-center justify-center rounded-xl text-xl"
                              style={{
                                width: 40,
                                height: 40,
                                background: "rgba(255,255,255,0.06)",
                                border: "1px solid rgba(124,245,225,0.2)",
                              }}
                              aria-hidden
                            >
                              {meta.icon}
                            </div>

                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm font-bold text-white truncate">
                                  {n.title}
                                </span>
                                {priorityColor && (
                                  <span
                                    className="inline-block rounded-full"
                                    style={{
                                      width: 7,
                                      height: 7,
                                      background: priorityColor,
                                      boxShadow: `0 0 6px ${priorityColor}`,
                                    }}
                                    title={`${n.priority} priority`}
                                    aria-label={`${n.priority} priority`}
                                  />
                                )}
                                {!n.read && priorityColor === null && (
                                  <span
                                    className="inline-block rounded-full"
                                    style={{
                                      width: 6,
                                      height: 6,
                                      background: "rgba(255,255,255,0.4)",
                                    }}
                                    title="Unread"
                                    aria-label="Unread"
                                  />
                                )}
                              </div>
                              <p className="text-xs opacity-80 mt-0.5 leading-snug">
                                {n.body}
                              </p>
                              <div className="text-[10px] opacity-50 mt-1">
                                {relTime(n.timestamp, now)}
                              </div>

                              {n.actions && n.actions.length > 0 && (
                                <div className="flex flex-wrap gap-1.5 mt-2">
                                  {n.actions.map((a) => (
                                    <GlowButton
                                      key={a.actionType + a.label}
                                      size="sm"
                                      variant={actionVariant(a.actionType)}
                                      onClick={() => handleAction(n, a)}
                                    >
                                      {a.label}
                                    </GlowButton>
                                  ))}
                                </div>
                              )}
                            </div>

                            <button
                              type="button"
                              onClick={() => dismiss(n.id)}
                              className="shrink-0 rounded-md p-1 hover:bg-white/10 transition-colors text-xs opacity-60 hover:opacity-100"
                              aria-label="Dismiss notification"
                              title="Dismiss"
                            >
                              ✕
                            </button>
                          </div>
                        </GlassPanel>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}

          {/* ---------- Settings view ---------- */}
          {view === "settings" && (
            <div className="space-y-5">
              <section>
                <SectionTitle icon={<span aria-hidden>🎛️</span>} title="Notification types" />
                <GlassPanel className="p-3 sm:p-4 space-y-3">
                  {(Object.keys(TYPE_META) as NotifType[]).map((k) => {
                    const meta = TYPE_META[k];
                    return (
                      <div key={k} className="flex items-center gap-3">
                        <span className="text-xl shrink-0" aria-hidden>
                          {meta.icon}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-bold text-white">
                            {meta.name}
                          </div>
                          <div className="text-[11px] opacity-70 leading-snug">
                            {meta.desc}
                          </div>
                        </div>
                        <Toggle
                          checked={toggles[k]}
                          onChange={(v) =>
                            setToggles((p) => ({ ...p, [k]: v }))
                          }
                        />
                      </div>
                    );
                  })}
                </GlassPanel>
              </section>

              <section>
                <SectionTitle icon={<span aria-hidden>📡</span>} title="Delivery method" />
                <GlassPanel className="p-3 sm:p-4 space-y-3">
                  <div className="flex items-center gap-3">
                    <span className="text-xl shrink-0" aria-hidden>📱</span>
                    <div className="flex-1">
                      <div className="text-sm font-bold text-white">In-app</div>
                      <div className="text-[11px] opacity-70">
                        Always on. Toasts + this center.
                      </div>
                    </div>
                    <Toggle checked={true} onChange={() => {}} disabled />
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xl shrink-0" aria-hidden>🔔</span>
                    <div className="flex-1">
                      <div className="text-sm font-bold text-white">
                        Push (browser)
                      </div>
                      <div className="text-[11px] opacity-70">
                        Web Push API + service worker required.
                      </div>
                    </div>
                    <Toggle
                      checked={pushEnabled}
                      onChange={(v) => {
                        setPushEnabled(v);
                        if (v) {
                          pushToast({
                            title: "Browser push would be requested here.",
                            description:
                              "Web Push API + service worker required for production.",
                            variant: "warning",
                          });
                        }
                      }}
                    />
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xl shrink-0" aria-hidden>✉️</span>
                    <div className="flex-1">
                      <div className="text-sm font-bold text-white">Email</div>
                      <div className="text-[11px] opacity-70">
                        Daily digest of activity (mock).
                      </div>
                    </div>
                    <Toggle checked={emailEnabled} onChange={setEmailEnabled} />
                  </div>
                </GlassPanel>
              </section>

              <section>
                <SectionTitle icon={<span aria-hidden>🧠</span>} title="Smart batching" />
                <GlassPanel className="p-3 sm:p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex-1">
                      <div className="text-sm font-bold text-white">
                        Group similar notifications
                      </div>
                      <div className="text-[11px] opacity-70 leading-snug">
                        E.g. 3 dive completes in 1 hour → 1 notification.
                        Reduces noise.
                      </div>
                    </div>
                    <Toggle checked={smartBatching} onChange={setSmartBatching} />
                  </div>
                </GlassPanel>
              </section>

              <button
                type="button"
                className="text-[11px] opacity-60 hover:opacity-100 underline underline-offset-2"
                onClick={() =>
                  pushToast({
                    title: "Per-device settings",
                    description: "Sync across web, Android, iOS — mock.",
                    variant: "default",
                  })
                }
              >
                Per-device settings →
              </button>
            </div>
          )}

          {/* ---------- Quiet Hours view ---------- */}
          {view === "quiet-hours" && (
            <div className="space-y-5">
              <section>
                <SectionTitle icon={<span aria-hidden>🌙</span>} title="Quiet hours" />
                <GlassPanel className="p-3 sm:p-4 space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="flex-1">
                      <div className="text-sm font-bold text-white">
                        Enable quiet hours
                      </div>
                      <div className="text-[11px] opacity-70 leading-snug">
                        Suppresses non-critical notifications during the window.
                      </div>
                    </div>
                    <Toggle
                      checked={quietHoursEnabled}
                      onChange={setQuietHoursEnabled}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <label className="block">
                      <span className="text-[10px] uppercase tracking-wide opacity-70">
                        Start
                      </span>
                      <input
                        type="time"
                        value={quietHoursStart}
                        onChange={(e) => setQuietHoursStart(e.target.value)}
                        disabled={!quietHoursEnabled}
                        className="mt-1 w-full rounded-lg px-3 py-2 text-sm font-bold text-white disabled:opacity-50"
                        style={{
                          background: "rgba(10,27,61,0.7)",
                          border: "1px solid rgba(124,245,225,0.25)",
                        }}
                      />
                    </label>
                    <label className="block">
                      <span className="text-[10px] uppercase tracking-wide opacity-70">
                        End
                      </span>
                      <input
                        type="time"
                        value={quietHoursEnd}
                        onChange={(e) => setQuietHoursEnd(e.target.value)}
                        disabled={!quietHoursEnabled}
                        className="mt-1 w-full rounded-lg px-3 py-2 text-sm font-bold text-white disabled:opacity-50"
                        style={{
                          background: "rgba(10,27,61,0.7)",
                          border: "1px solid rgba(124,245,225,0.25)",
                        }}
                      />
                    </label>
                  </div>

                  <div className="text-[11px] opacity-70 flex items-center gap-1.5">
                    <span aria-hidden>🌍</span>
                    <span>
                      Timezone:{" "}
                      <span className="font-bold text-white/90">
                        Asia/Jakarta (UTC+7)
                      </span>
                    </span>
                  </div>

                  <div
                    className="text-[11px] rounded-lg px-3 py-2"
                    style={{
                      background: "rgba(255,209,102,0.08)",
                      border: "1px solid rgba(255,209,102,0.25)",
                      color: "#FFD166",
                    }}
                  >
                    ⚠️ Critical notifications always come through.
                  </div>
                </GlassPanel>
              </section>

              <section>
                <SectionTitle icon={<span aria-hidden>🛡️</span>} title="Exceptions / 例外" />
                <GlassPanel className="p-3 sm:p-4">
                  <p className="text-[11px] opacity-70 mb-3">
                    Choose which types bypass quiet hours:
                  </p>
                  <div className="space-y-1">
                    {(Object.keys(TYPE_META) as NotifType[]).map((k) => {
                      const meta = TYPE_META[k];
                      const isCritical =
                        k === "raid_incoming" || k === "raid_result";
                      return (
                        <label
                          key={k}
                          className="flex items-center gap-3 p-2 rounded-lg hover:bg-white/5 cursor-pointer"
                          style={{ opacity: quietHoursEnabled ? 1 : 0.5 }}
                        >
                          <input
                            type="checkbox"
                            checked={exceptions[k]}
                            disabled={!quietHoursEnabled}
                            onChange={(e) =>
                              setExceptions((p) => ({
                                ...p,
                                [k]: e.target.checked,
                              }))
                            }
                            className="w-4 h-4"
                            style={{ accentColor: "#12A7A0" }}
                          />
                          <span className="text-base" aria-hidden>
                            {meta.icon}
                          </span>
                          <span className="text-sm font-bold text-white flex-1">
                            {meta.name}
                          </span>
                          {isCritical && (
                            <span
                              className="text-[9px] uppercase font-bold px-1.5 py-0.5 rounded-md"
                              style={{
                                background: "rgba(255,111,145,0.15)",
                                color: "#FF6F91",
                                border: "1px solid rgba(255,111,145,0.35)",
                              }}
                            >
                              Critical
                            </span>
                          )}
                        </label>
                      );
                    })}
                  </div>
                </GlassPanel>
              </section>

              <section>
                <GlassPanel className="p-3 sm:p-4" glow="rgba(124,245,225,0.15)">
                  <div className="text-[10px] uppercase tracking-wide opacity-60 mb-1">
                    Preview
                  </div>
                  <p className="text-xs text-white/90 leading-relaxed">
                    {previewText}
                  </p>
                </GlassPanel>
              </section>
            </div>
          )}

          {/* ---------- Footer ---------- */}
          <footer className="mt-5 pt-3 border-t border-white/10 space-y-1">
            <p className="text-[10px] opacity-60 leading-relaxed">
              Notifications are opt-in. We never send marketing. Unsubscribe
              anytime.
            </p>
            <p className="text-[10px] opacity-60 leading-relaxed">
              Push notifications require browser permission. Mobile apps
              (Android/iOS) use native push via FCM/APNs.
            </p>
            <p className="text-[10px] opacity-60 leading-relaxed">
              Widgets and lock-screen live activities available on iOS 16.1+
              and Android 12+.
            </p>
            <div className="pt-2">
              <GlowButton
                variant="teal"
                onClick={onClose}
                className="w-full"
              >
                Close
              </GlowButton>
            </div>
          </footer>
        </div>
      </GlassPanel>
    </div>
  );
}
