// Crabtopia - CharterModal
// Built-in charters: fair crab lending with an enforced revenue split.
// Owner share capped at 60%. Renter can leave anytime. No crab seizure.
// Self-contained modal — uses existing useGame selectors + UI primitives.

"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useGame } from "../store/gameStore";
import { useLocalStorage } from "./useLocalStorage";
import { FactionId, ClassId } from "../types";
import { FACTIONS, FACTION_LIST } from "../content/factions";
import { CLASSES } from "../content/classes";
import { crabBaseBP } from "../engine/bp";
import {
  GlassPanel,
  GlowButton,
  StatChip,
  SectionTitle,
  GoldIcon,
  formatGold,
  formatTime,
  EmptyState,
  FactionBadge,
  ClassIcon,
} from "./ui";

// ---------- LOCAL TYPES ----------

interface CharterOffer {
  id: string;
  crabId: string;
  crabName: string;
  faction: FactionId;
  classId: ClassId;
  bp: number;
  ownerName: string;
  termDays: 7 | 14 | 30;
  weeklyFee: number; // GOLD per week
  ownerSharePct: number; // 30-60
  renterSharePct: number; // 40-70 (100 - ownerShare)
  performanceStats: { dives: number; raids: number; wins: number };
}

interface ActiveCharter {
  id: string;
  crabId: string;
  crabName: string;
  faction: FactionId;
  classId: ClassId;
  role: "owner" | "renter";
  counterpartyName: string;
  startedAt: number;
  endsAt: number;
  ownerSharePct: number;
  weeklyFee: number;
  earningsToOwner: number;
  earningsToRenter: number;
  performance: { dives: number; raids: number; wins: number };
  inActiveOp: boolean; // crab currently mid-dive/raid (blocks revoke)
}

type View = "browse" | "my-charters" | "create" | "active";

// ---------- MOCK DATA ----------

const MOCK_OPEN_CHARTERS: CharterOffer[] = [
  {
    id: "co_0",
    crabId: "mc_coralpinch",
    crabName: "Coralpinch",
    faction: "coral_court",
    classId: "shellmender",
    bp: 1240,
    ownerName: "Brinepinch",
    termDays: 14,
    weeklyFee: 480,
    ownerSharePct: 45,
    renterSharePct: 55,
    performanceStats: { dives: 18, raids: 6, wins: 4 },
  },
  {
    id: "co_1",
    crabId: "mc_cinderjaw",
    crabName: "Cinderjaw",
    faction: "cinderreef",
    classId: "reaver",
    bp: 2180,
    ownerName: "Oldshell",
    termDays: 7,
    weeklyFee: 1250,
    ownerSharePct: 55,
    renterSharePct: 45,
    performanceStats: { dives: 31, raids: 12, wins: 9 },
  },
  {
    id: "co_2",
    crabId: "mc_frostgrip",
    crabName: "Frostgrip",
    faction: "frostshelf",
    classId: "bulwark",
    bp: 1850,
    ownerName: "Tidecrest",
    termDays: 30,
    weeklyFee: 720,
    ownerSharePct: 40,
    renterSharePct: 60,
    performanceStats: { dives: 22, raids: 9, wins: 7 },
  },
  {
    id: "co_3",
    crabId: "mc_mossclaw",
    crabName: "Mossclaw",
    faction: "mangrove",
    classId: "warden",
    bp: 980,
    ownerName: "Goldfoot",
    termDays: 14,
    weeklyFee: 260,
    ownerSharePct: 30,
    renterSharePct: 70,
    performanceStats: { dives: 12, raids: 3, wins: 2 },
  },
  {
    id: "co_4",
    crabId: "mc_stormsnap",
    crabName: "Stormsnap",
    faction: "stormwake",
    classId: "skitter",
    bp: 2680,
    ownerName: "Riftclaw",
    termDays: 7,
    weeklyFee: 1800,
    ownerSharePct: 60,
    renterSharePct: 40,
    performanceStats: { dives: 27, raids: 15, wins: 11 },
  },
  {
    id: "co_5",
    crabId: "mc_moonwarden",
    crabName: "Moonwarden",
    faction: "moonpool",
    classId: "tidecaller",
    bp: 1560,
    ownerName: "Kelpback",
    termDays: 30,
    weeklyFee: 540,
    ownerSharePct: 50,
    renterSharePct: 50,
    performanceStats: { dives: 16, raids: 7, wins: 5 },
  },
];

const NOW = Date.now();
const DAY = 86_400_000;

const INITIAL_MY_ACTIVE: ActiveCharter[] = [
  {
    id: "ac_rent_0",
    crabId: "mc_borrowedpinch",
    crabName: "Borrowedpinch",
    faction: "cinderreef",
    classId: "reaver",
    role: "renter",
    counterpartyName: "Stormsnap",
    startedAt: NOW - 2 * DAY,
    endsAt: NOW + 5 * DAY,
    ownerSharePct: 50,
    weeklyFee: 900,
    earningsToOwner: 640,
    earningsToRenter: 640,
    performance: { dives: 9, raids: 4, wins: 3 },
    inActiveOp: false,
  },
  {
    id: "ac_own_0",
    crabId: "mc_lentilguard",
    crabName: "Lentilguard",
    faction: "frostshelf",
    classId: "bulwark",
    role: "owner",
    counterpartyName: "Driftwhisk",
    startedAt: NOW - 4 * DAY,
    endsAt: NOW + 10 * DAY,
    ownerSharePct: 45,
    weeklyFee: 760,
    earningsToOwner: 410,
    earningsToRenter: 500,
    performance: { dives: 7, raids: 2, wins: 1 },
    inActiveOp: true,
  },
];

// ---------- HELPERS ----------

// Projected weekly gross earnings from a crab's BP (rough heuristic).
function projectWeekly(bp: number): number {
  return Math.round(bp * 0.9 + 120);
}

// Deterministic 7-day mock earnings series for the bar chart.
function weeklySeries(seed: string): number[] {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const out: number[] = [];
  for (let i = 0; i < 7; i++) {
    h = (h * 1103515245 + 12345) >>> 0;
    out.push(80 + (h % 220));
  }
  return out;
}

function clampOwnerShare(v: number): number {
  return Math.max(30, Math.min(60, Math.round(v)));
}

// ---------- COMPONENT ----------

export default function CharterModal({ onClose }: { onClose: () => void }) {
  const player = useGame((s) => s.player);
  const pushToast = useGame((s) => s.pushToast);
  const spendGold = useGame((s) => s.spendGold);
  const addGold = useGame((s) => s.addGold);

  const [view, setView] = useState<View>("browse");
  const [mockOpenCharters, setMockOpenCharters] = useState<CharterOffer[]>(MOCK_OPEN_CHARTERS);
  // Closed (settled / ended / revoked) charter ids persist: the seeded
  // active charters used to be re-seeded from INITIAL_MY_ACTIVE on every
  // mount, so once their terms ended they could be settled again for
  // +1,050 GOLD on every single reopen.
  const [closedCharterIds, setClosedCharterIds] = useLocalStorage<string[]>(
    "crabtopia_charter_closed_v1",
    []
  );
  const [myActiveCharters, setMyActiveCharters] = useState<ActiveCharter[]>(() =>
    INITIAL_MY_ACTIVE.filter((c) => !closedCharterIds.includes(c.id))
  );
  const closeCharter = (id: string) =>
    setClosedCharterIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
  const [filterFaction, setFilterFaction] = useState<FactionId | "all">("all");
  const [sortBy, setSortBy] = useState<"bp" | "weeklyFee" | "ownerShare">("bp");

  // Create flow
  const [createForm, setCreateForm] = useState<{
    crabId: string;
    termDays: 7 | 14 | 30;
    ownerSharePct: number;
    weeklyFee: number;
  }>({
    crabId: "",
    termDays: 7,
    ownerSharePct: 40,
    weeklyFee: 500,
  });
  const [createStep, setCreateStep] = useState<1 | 2 | 3>(1);

  // Dialogs
  const [confirmOffer, setConfirmOffer] = useState<CharterOffer | null>(null);
  const [endCharterId, setEndCharterId] = useState<string | null>(null);
  const [revokeCharterId, setRevokeCharterId] = useState<string | null>(null);
  const [settleCharterId, setSettleCharterId] = useState<string | null>(null);
  const [expandedPerfId, setExpandedPerfId] = useState<string | null>(null);

  // Live countdown tick (active view)
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 1000);
    return () => window.clearInterval(id);
  }, []);

  const eligibleCrabs = useMemo(() => {
    if (!player) return [];
    return player.crabs
      .filter((c) => !c.isRookie && c.activity === "idle")
      .map((c) => ({
        id: c.id,
        name: c.name,
        faction: c.faction,
        classId: c.classId,
        level: c.level,
        bp: crabBaseBP(c),
      }));
  }, [player]);

  // Derived offers list (hook must run before any early return).
  const visibleOffers = useMemo(() => {
    let list = mockOpenCharters;
    if (filterFaction !== "all") list = list.filter((c) => c.faction === filterFaction);
    list = [...list];
    list.sort((a, b) => {
      if (sortBy === "bp") return b.bp - a.bp;
      if (sortBy === "weeklyFee") return a.weeklyFee - b.weeklyFee;
      return a.ownerSharePct - b.ownerSharePct;
    });
    return list;
  }, [mockOpenCharters, filterFaction, sortBy]);

  if (!player) return null;
  const safePlayer = player;

  // ---- Actions ----

  function handleConfirmCharter(offer: CharterOffer) {
    if (!spendGold(offer.weeklyFee)) {
      pushToast({
        title: "Not enough GOLD.",
        description: `You need ${offer.weeklyFee} GOLD for the first week's fee.`,
        variant: "error",
      });
      return;
    }
    const startedAt = Date.now();
    const newActive: ActiveCharter = {
      id: `ac_${offer.id}_${startedAt}`,
      crabId: offer.crabId,
      crabName: offer.crabName,
      faction: offer.faction,
      classId: offer.classId,
      role: "renter",
      counterpartyName: offer.ownerName,
      startedAt,
      endsAt: startedAt + offer.termDays * DAY,
      ownerSharePct: offer.ownerSharePct,
      weeklyFee: offer.weeklyFee,
      earningsToOwner: 0,
      earningsToRenter: 0,
      performance: { ...offer.performanceStats },
      inActiveOp: false,
    };
    setMyActiveCharters((prev) => [newActive, ...prev]);
    setMockOpenCharters((prev) => prev.filter((c) => c.id !== offer.id));
    setConfirmOffer(null);
    pushToast({
      title: `Charter signed!`,
      description: `${offer.crabName} joined your roster for ${offer.termDays} days.`,
      variant: "success",
    });
    setView("my-charters");
  }

  function handleEndEarly(id: string) {
    closeCharter(id);
    setMyActiveCharters((prev) => prev.filter((c) => c.id !== id));
    setEndCharterId(null);
    pushToast({
      title: "Charter ended.",
      description: "Crab returned to owner. No penalty.",
      variant: "default",
    });
  }

  function handleRevoke(id: string) {
    closeCharter(id);
    setMyActiveCharters((prev) => prev.filter((c) => c.id !== id));
    setRevokeCharterId(null);
    pushToast({
      title: "Charter revoked.",
      description: "Renter has a 24h grace period to find a replacement.",
      variant: "warning",
    });
  }

  function handleSettle(id: string) {
    const c = myActiveCharters.find((x) => x.id === id);
    if (!c) return;
    const amount = c.role === "renter" ? c.earningsToRenter : c.earningsToOwner;
    if (amount > 0) addGold(amount);
    closeCharter(id);
    setMyActiveCharters((prev) => prev.filter((x) => x.id !== id));
    setSettleCharterId(null);
    pushToast({
      title: "Charter settled!",
      description: `Received ${formatGold(amount)} GOLD.`,
      variant: "success",
    });
  }

  function handlePublishCharter() {
    const crab = safePlayer.crabs.find((c) => c.id === createForm.crabId);
    if (!crab) return;
    const ownerShare = clampOwnerShare(createForm.ownerSharePct);
    const offer: CharterOffer = {
      id: `co_pub_${Date.now()}`,
      crabId: crab.id,
      crabName: crab.name,
      faction: crab.faction,
      classId: crab.classId,
      bp: crabBaseBP(crab),
      ownerName: safePlayer.name,
      termDays: createForm.termDays,
      weeklyFee: createForm.weeklyFee,
      ownerSharePct: ownerShare,
      renterSharePct: 100 - ownerShare,
      performanceStats: { dives: 0, raids: 0, wins: 0 },
    };
    setMockOpenCharters((prev) => [offer, ...prev]);
    pushToast({
      title: "Charter published!",
      description: `${crab.name} is now available in Browse.`,
      variant: "success",
    });
    setCreateStep(1);
    setCreateForm({ crabId: "", termDays: 7, ownerSharePct: 40, weeklyFee: 500 });
    setView("browse");
  }

  // ---------- RENDER ----------

  const tabs: { id: View; label: string }[] = [
    { id: "browse", label: "Browse" },
    { id: "my-charters", label: "My Charters" },
    { id: "create", label: "Create" },
    { id: "active", label: "Active" },
  ];

  return (
    <div
      className="modal-backdrop-enter fixed inset-0 z-[150] flex items-center justify-center p-3"
      style={{ background: "rgba(4,12,28,0.72)", backdropFilter: "blur(6px)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl max-h-[88vh] overflow-y-auto rounded-2xl"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "linear-gradient(160deg, #0A1B3D 0%, #0A4A66cc 60%, #12A7A022 100%)",
          border: "1px solid rgba(124,245,225,0.28)",
          boxShadow: "0 0 40px rgba(18,167,160,0.35)",
        }}
      >
        {/* Header */}
        <div className="p-4 md:p-5 sticky top-0 z-10" style={{ background: "rgba(10,27,61,0.85)", borderBottom: "1px solid rgba(124,245,225,0.18)" }}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-xl md:text-2xl font-bold font-display flex items-center gap-2" style={{ color: "#7CF5E1" }}>
                <span>📜</span>
                <span>Charters</span>
              </h1>
              <p className="text-xs md:text-sm text-white/70 mt-0.5">
                Fair crab lending. Owner share capped at 60%. Renter can leave anytime.
              </p>
            </div>
            <button
              onClick={onClose}
              className="shrink-0 rounded-lg px-2 py-1 text-white/70 hover:text-white hover:bg-white/10 transition"
              aria-label="Close"
            >
              ✕
            </button>
          </div>

          {/* Tabs */}
          <div className="flex flex-wrap gap-1.5 mt-3">
            {tabs.map((t) => (
              <button
                key={t.id}
                onClick={() => setView(t.id)}
                className="px-3 py-1.5 rounded-lg text-xs font-bold transition"
                style={{
                  background: view === t.id ? "linear-gradient(135deg, #12A7A0, #0A4A66)" : "rgba(255,255,255,0.06)",
                  color: view === t.id ? "#EAF6FF" : "rgba(234,246,255,0.7)",
                  border: view === t.id ? "none" : "1px solid rgba(124,245,225,0.2)",
                }}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Fairness chip */}
          <div className="mt-3">
            <span
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold"
              style={{
                background: "rgba(255,209,102,0.12)",
                color: "#FFD166",
                border: "1px solid rgba(255,209,102,0.35)",
              }}
            >
              ⚖️ Owner max 60% · Renter keeps 40%+ · No crab seizure
            </span>
          </div>
        </div>

        {/* Body */}
        <div className="p-4 md:p-5 space-y-4">
          {view === "browse" && (
            <BrowseView
              offers={visibleOffers}
              filterFaction={filterFaction}
              setFilterFaction={setFilterFaction}
              sortBy={sortBy}
              setSortBy={setSortBy}
              onCharter={(o) => setConfirmOffer(o)}
            />
          )}

          {view === "my-charters" && (
            <MyChartersView
              charters={myActiveCharters}
              expandedPerfId={expandedPerfId}
              setExpandedPerfId={setExpandedPerfId}
              onEndEarly={(id) => setEndCharterId(id)}
              onRevoke={(id) => setRevokeCharterId(id)}
              onGoBrowse={() => setView("browse")}
              onGoCreate={() => setView("create")}
            />
          )}

          {view === "create" && (
            <CreateView
              eligibleCrabs={eligibleCrabs}
              createForm={createForm}
              setCreateForm={setCreateForm}
              createStep={createStep}
              setCreateStep={setCreateStep}
              onPublish={handlePublishCharter}
              playerGold={player.gold}
            />
          )}

          {view === "active" && (
            <ActiveView
              charters={myActiveCharters}
              onSettle={(id) => setSettleCharterId(id)}
            />
          )}
        </div>

        {/* Footer */}
        <div className="px-4 md:px-5 pb-4 md:pb-5 pt-2">
          <div className="rounded-xl p-3 text-[10px] text-white/65 leading-relaxed" style={{ background: "rgba(10,27,61,0.5)", border: "1px solid rgba(124,245,225,0.12)" }}>
            <span className="font-bold" style={{ color: "#7CF5E1" }}>Fair by design:</span>{" "}
            owner share capped at 60%, renter can leave anytime, no crab seizure, performance
            transparent. <span className="font-bold" style={{ color: "#FFD166" }}>Anti-abuse:</span>{" "}
            same-pair repeated charters are flagged.
          </div>
          <div className="mt-3 flex justify-end">
            <GlowButton variant="ghost" size="sm" onClick={onClose}>
              Close
            </GlowButton>
          </div>
        </div>
      </div>

      {/* Confirm dialog */}
      {confirmOffer && (
        <ConfirmDialog
          title={`Charter ${confirmOffer.crabName}?`}
          onClose={() => setConfirmOffer(null)}
          onConfirm={() => handleConfirmCharter(confirmOffer)}
          confirmLabel="Sign Charter"
        >
          <p className="text-sm text-white/85">
            You'll pay{" "}
            <span className="font-bold" style={{ color: "#FFD166" }}>
              {formatGold(confirmOffer.weeklyFee)} <GoldIcon size={12} className="inline" /> GOLD
            </span>
            /week for{" "}
            <span className="font-bold">{confirmOffer.termDays} days</span>.{" "}
            <span className="font-bold">{confirmOffer.ownerSharePct}%</span> of dive/raid earnings
            go to {confirmOffer.ownerName}. You keep{" "}
            <span className="font-bold" style={{ color: "#7CF5E1" }}>
              {confirmOffer.renterSharePct}%
            </span>
            . You can leave any time without penalty.
          </p>
          <div className="mt-2 grid grid-cols-3 gap-2 text-[10px]">
            <StatChip label="BP" value={confirmOffer.bp} color="#FFD166" />
            <StatChip label="Term" value={`${confirmOffer.termDays}d`} />
            <StatChip label="Split" value={`${confirmOffer.ownerSharePct}/${confirmOffer.renterSharePct}`} color="#7CF5E1" />
          </div>
        </ConfirmDialog>
      )}

      {/* End early dialog */}
      {endCharterId && (
        <ConfirmDialog
          title="End charter early?"
          onClose={() => setEndCharterId(null)}
          onConfirm={() => handleEndEarly(endCharterId)}
          confirmLabel="End Charter"
        >
          <p className="text-sm text-white/85">
            No penalty. Crab returns to owner immediately. Any accrued earnings are settled to both
            sides at the agreed split.
          </p>
        </ConfirmDialog>
      )}

      {/* Revoke dialog */}
      {revokeCharterId && (
        <ConfirmDialog
          title="Revoke charter?"
          onClose={() => setRevokeCharterId(null)}
          onConfirm={() => handleRevoke(revokeCharterId)}
          confirmLabel="Revoke"
        >
          <p className="text-sm text-white/85">
            Renter has a 24h grace period to find a replacement before the crab returns to your
            roster.
          </p>
        </ConfirmDialog>
      )}

      {/* Settle dialog */}
      {settleCharterId && (
        <ConfirmDialog
          title="Settle this charter?"
          onClose={() => setSettleCharterId(null)}
          onConfirm={() => handleSettle(settleCharterId)}
          confirmLabel="Settle & Claim"
        >
          <SettleBody
            charter={myActiveCharters.find((c) => c.id === settleCharterId)}
          />
        </ConfirmDialog>
      )}
    </div>
  );
}

// ---------- SUB-VIEWS ----------

function BrowseView({
  offers,
  filterFaction,
  setFilterFaction,
  sortBy,
  setSortBy,
  onCharter,
}: {
  offers: CharterOffer[];
  filterFaction: FactionId | "all";
  setFilterFaction: (f: FactionId | "all") => void;
  sortBy: "bp" | "weeklyFee" | "ownerShare";
  setSortBy: (s: "bp" | "weeklyFee" | "ownerShare") => void;
  onCharter: (o: CharterOffer) => void;
}) {
  return (
    <div className="space-y-3">
      <SectionTitle title="Available Charters" />

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1">
          <FilterPill active={filterFaction === "all"} onClick={() => setFilterFaction("all")}>
            All
          </FilterPill>
          {FACTION_LIST.map((f) => (
            <FilterPill
              key={f.id}
              active={filterFaction === f.id}
              onClick={() => setFilterFaction(f.id)}
              color={f.colors.accent}
            >
              {f.shortName}
            </FilterPill>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-1 text-[10px]">
          <span className="text-white/50">Sort:</span>
          {(["bp", "weeklyFee", "ownerShare"] as const).map((s) => (
            <FilterPill key={s} active={sortBy === s} onClick={() => setSortBy(s)}>
              {s === "bp" ? "BP" : s === "weeklyFee" ? "Fee" : "Share"}
            </FilterPill>
          ))}
        </div>
      </div>

      {offers.length === 0 ? (
        <EmptyState message="No charters match your filter." hint="Try another faction or sort." />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {offers.map((o) => (
            <OfferCard key={o.id} offer={o} onCharter={() => onCharter(o)} />
          ))}
        </div>
      )}
    </div>
  );
}

function OfferCard({ offer, onCharter }: { offer: CharterOffer; onCharter: () => void }) {
  const f = FACTIONS[offer.faction];
  const cls = CLASSES[offer.classId];
  return (
    <GlassPanel className="p-3" glow={`${f.colors.accent}22`}>
      <div className="flex items-start gap-3">
        {/* Avatar */}
        <div
          className="shrink-0 rounded-xl flex items-center justify-center"
          style={{
            width: 56,
            height: 56,
            background: `linear-gradient(160deg, ${f.colors.dark}cc, ${f.colors.primary}33)`,
            border: `1px solid ${f.colors.accent}55`,
            fontSize: 28,
          }}
        >
          {f.emblem}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="font-bold text-sm font-display truncate" style={{ color: f.colors.light }}>
              {offer.crabName}
            </span>
            <FactionBadge faction={offer.faction} size={14} />
            <ClassIcon classId={offer.classId} size={16} />
          </div>
          <div className="text-[10px] text-white/60 truncate">
            {cls.name} · {f.name} · owned by {offer.ownerName}
          </div>

          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <StatChip label="BP" value={offer.bp} color="#FFD166" />
            <StatChip label="Term" value={`${offer.termDays}d`} />
            <span className="inline-flex items-center gap-0.5 px-2 py-1 rounded-xl text-[10px] font-bold" style={{ background: "rgba(10,27,61,0.55)", border: "1px solid rgba(255,209,102,0.3)", color: "#FFD166" }}>
              <GoldIcon size={10} /> {formatGold(offer.weeklyFee)}/wk
            </span>
            <span className="px-2 py-1 rounded-xl text-[10px] font-bold" style={{ background: "rgba(124,245,225,0.1)", border: "1px solid rgba(124,245,225,0.3)", color: "#7CF5E1" }}>
              {offer.ownerSharePct}/{offer.renterSharePct} split
            </span>
          </div>

          <div className="mt-1.5 text-[10px] text-white/55">
            {offer.performanceStats.dives} dives · {offer.performanceStats.raids} raids ·{" "}
            {offer.performanceStats.wins} wins
          </div>
        </div>
      </div>

      <div className="mt-2.5 flex justify-end">
        <GlowButton variant="teal" size="sm" onClick={onCharter}>
          Charter
        </GlowButton>
      </div>
    </GlassPanel>
  );
}

function MyChartersView({
  charters,
  expandedPerfId,
  setExpandedPerfId,
  onEndEarly,
  onRevoke,
  onGoBrowse,
  onGoCreate,
}: {
  charters: ActiveCharter[];
  expandedPerfId: string | null;
  setExpandedPerfId: (id: string | null) => void;
  onEndEarly: (id: string) => void;
  onRevoke: (id: string) => void;
  onGoBrowse: () => void;
  onGoCreate: () => void;
}) {
  if (charters.length === 0) {
    return (
      <EmptyState
        message="You have no active charters."
        hint="Browse available crabs or lend out your own."
        cta={
          <div className="flex gap-2 justify-center">
            <GlowButton variant="teal" size="sm" onClick={onGoBrowse}>
              Browse Charters
            </GlowButton>
            <GlowButton variant="gold" size="sm" onClick={onGoCreate}>
              Lend a Crab
            </GlowButton>
          </div>
        }
      />
    );
  }
  return (
    <div className="space-y-3">
      <SectionTitle title="My Charters" />
      {charters.map((c) => {
        const f = FACTIONS[c.faction];
        const remaining = c.endsAt - Date.now();
        const expanded = expandedPerfId === c.id;
        return (
          <GlassPanel key={c.id} className="p-3">
            <div className="flex items-start gap-3">
              <div
                className="shrink-0 rounded-xl flex items-center justify-center"
                style={{
                  width: 48,
                  height: 48,
                  background: `linear-gradient(160deg, ${f.colors.dark}cc, ${f.colors.primary}33)`,
                  border: `1px solid ${f.colors.accent}55`,
                  fontSize: 24,
                }}
              >
                {f.emblem}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="font-bold text-sm font-display" style={{ color: f.colors.light }}>
                    {c.crabName}
                  </span>
                  <RoleBadge role={c.role} />
                  <FactionBadge faction={c.faction} size={14} />
                  <ClassIcon classId={c.classId} size={16} />
                </div>
                <div className="text-[10px] text-white/60">
                  {c.role === "renter" ? "Lending from" : "Lent to"}{" "}
                  <span className="font-bold text-white/85">{c.counterpartyName}</span>
                </div>

                <div className="mt-1.5 grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                  <StatChip
                    label="Time left"
                    value={formatTime(Math.max(0, remaining))}
                    color={remaining < DAY ? "#FF6F91" : "#7CF5E1"}
                  />
                  <StatChip label="Fee/wk" value={`${formatGold(c.weeklyFee)}`} color="#FFD166" />
                  <StatChip label="Owner got" value={formatGold(c.earningsToOwner)} color="#FFD166" />
                  <StatChip label="Renter got" value={formatGold(c.earningsToRenter)} color="#7CF5E1" />
                </div>

                <div className="mt-1.5 text-[10px] text-white/55">
                  Started {new Date(c.startedAt).toLocaleDateString()} · Ends{" "}
                  {new Date(c.endsAt).toLocaleDateString()} · Split {c.ownerSharePct}/
                  {100 - c.ownerSharePct}
                </div>

                <div className="mt-1.5 text-[10px] text-white/55">
                  {c.performance.dives} dives · {c.performance.raids} raids · {c.performance.wins} wins
                </div>

                {expanded && <PerfChart charter={c} />}

                <div className="mt-2.5 flex flex-wrap gap-1.5 justify-end">
                  <GlowButton variant="ghost" size="sm" onClick={() => setExpandedPerfId(expanded ? null : c.id)}>
                    {expanded ? "Hide" : "View performance"}
                  </GlowButton>
                  {c.role === "renter" ? (
                    <GlowButton variant="rose" size="sm" onClick={() => onEndEarly(c.id)}>
                      End early
                    </GlowButton>
                  ) : (
                    <GlowButton
                      variant="ghost"
                      size="sm"
                      onClick={() => onRevoke(c.id)}
                      disabled={c.inActiveOp}
                      title={c.inActiveOp ? "Crab is mid-dive/raid — cannot revoke now" : "Revoke charter"}
                    >
                      Revoke
                    </GlowButton>
                  )}
                </div>
              </div>
            </div>
          </GlassPanel>
        );
      })}
    </div>
  );
}

function CreateView({
  eligibleCrabs,
  createForm,
  setCreateForm,
  createStep,
  setCreateStep,
  onPublish,
  playerGold,
}: {
  eligibleCrabs: { id: string; name: string; faction: FactionId; classId: ClassId; bp: number; level: number }[];
  createForm: { crabId: string; termDays: 7 | 14 | 30; ownerSharePct: number; weeklyFee: number };
  setCreateForm: React.Dispatch<React.SetStateAction<{ crabId: string; termDays: 7 | 14 | 30; ownerSharePct: number; weeklyFee: number }>>;
  createStep: 1 | 2 | 3;
  setCreateStep: (s: 1 | 2 | 3) => void;
  onPublish: () => void;
  playerGold: number;
}) {
  const selected = eligibleCrabs.find((c) => c.id === createForm.crabId);
  const ownerShare = clampOwnerShare(createForm.ownerSharePct);
  const renterShare = 100 - ownerShare;
  const projWeekly = selected ? projectWeekly(selected.bp) : 0;
  const projOwner = Math.round((projWeekly * ownerShare) / 100);
  const projRenter = Math.round((projWeekly * renterShare) / 100);

  return (
    <div className="space-y-3">
      <SectionTitle title="Publish a Charter" />

      {/* Stepper */}
      <div className="flex items-center gap-1.5 text-[10px]">
        {(["Pick crab", "Set terms", "Review"] as const).map((label, i) => {
          const step = (i + 1) as 1 | 2 | 3;
          return (
            <React.Fragment key={label}>
              <span
                className="px-2 py-1 rounded-lg font-bold"
                style={{
                  background: createStep >= step ? "linear-gradient(135deg, #12A7A0, #0A4A66)" : "rgba(255,255,255,0.06)",
                  color: createStep >= step ? "#EAF6FF" : "rgba(234,246,255,0.5)",
                }}
              >
                {i + 1}. {label}
              </span>
              {i < 2 && <span className="text-white/30">→</span>}
            </React.Fragment>
          );
        })}
      </div>

      {eligibleCrabs.length === 0 ? (
        <EmptyState
          message="All your crabs are busy or ineligible."
          hint="Free up a crab (end dives, hatches, hall listings) to charter it out."
        />
      ) : (
        <>
          {createStep === 1 && (
            <div className="space-y-2">
              <p className="text-xs text-white/70">Pick a crab to lend out. Rookies, breeding, hall-listed and active-duty crabs are excluded.</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-72 overflow-y-auto pr-1">
                {eligibleCrabs.map((c) => {
                  const f = FACTIONS[c.faction];
                  const sel = createForm.crabId === c.id;
                  return (
                    <button
                      key={c.id}
                      onClick={() => setCreateForm((p) => ({ ...p, crabId: c.id }))}
                      className="text-left rounded-xl p-2.5 transition hover:-translate-y-0.5"
                      style={{
                        background: `linear-gradient(160deg, ${f.colors.dark}cc, ${f.colors.primary}22)`,
                        border: `2px solid ${sel ? f.colors.accent : f.colors.primary + "55"}`,
                        boxShadow: sel ? `0 0 16px ${f.colors.accent}55` : "none",
                      }}
                    >
                      <div className="flex items-center gap-1.5">
                        <FactionBadge faction={c.faction} size={14} />
                        <ClassIcon classId={c.classId} size={16} />
                        <span className="font-bold text-sm font-display truncate" style={{ color: f.colors.light }}>
                          {c.name}
                        </span>
                      </div>
                      <div className="text-[10px] text-white/60 mt-1">
                        {CLASSES[c.classId].name} · Lv {c.level} · {c.bp} BP
                      </div>
                    </button>
                  );
                })}
              </div>
              <div className="flex justify-end">
                <GlowButton variant="teal" size="sm" disabled={!selected} onClick={() => setCreateStep(2)}>
                  Next: Set terms
                </GlowButton>
              </div>
            </div>
          )}

          {createStep === 2 && (
            <div className="space-y-3">
              <GlassPanel className="p-3">
                <div className="space-y-3">
                  {/* Term */}
                  <div>
                    <Label>Term length</Label>
                    <div className="flex gap-1.5">
                      {([7, 14, 30] as const).map((d) => (
                        <FilterPill
                          key={d}
                          active={createForm.termDays === d}
                          onClick={() => setCreateForm((p) => ({ ...p, termDays: d }))}
                        >
                          {d} days
                        </FilterPill>
                      ))}
                    </div>
                  </div>

                  {/* Weekly fee slider */}
                  <div>
                    <Label>
                      Weekly fee: <span className="font-bold" style={{ color: "#FFD166" }}>{formatGold(createForm.weeklyFee)} GOLD</span>
                    </Label>
                    <input
                      type="range"
                      min={100}
                      max={5000}
                      step={50}
                      value={createForm.weeklyFee}
                      onChange={(e) => setCreateForm((p) => ({ ...p, weeklyFee: Number(e.target.value) }))}
                      className="w-full accent-teal-400"
                    />
                    <div className="text-[10px] text-white/50">100 – 5,000 GOLD/week</div>
                  </div>

                  {/* Owner share slider */}
                  <div>
                    <Label>
                      Owner share:{" "}
                      <span className="font-bold" style={{ color: "#7CF5E1" }}>{ownerShare}%</span>
                      <span className="ml-2 text-white/55">→ renter keeps {renterShare}%</span>
                    </Label>
                    <input
                      type="range"
                      min={30}
                      max={60}
                      step={1}
                      value={ownerShare}
                      onChange={(e) => setCreateForm((p) => ({ ...p, ownerSharePct: clampOwnerShare(Number(e.target.value)) }))}
                      className="w-full accent-teal-400"
                    />
                    <div className="text-[10px] text-white/50" title="Capped at 60% to keep renting fair">
                      🔒 Capped at 60% to keep renting fair
                    </div>
                  </div>
                </div>
              </GlassPanel>

              <div className="flex justify-between">
                <GlowButton variant="ghost" size="sm" onClick={() => setCreateStep(1)}>
                  Back
                </GlowButton>
                <GlowButton variant="teal" size="sm" onClick={() => setCreateStep(3)}>
                  Next: Review
                </GlowButton>
              </div>
            </div>
          )}

          {createStep === 3 && selected && (
            <div className="space-y-3">
              <GlassPanel className="p-3">
                <div className="text-xs text-white/70 mb-2">Charter summary</div>
                <div className="flex items-center gap-2 mb-2">
                  <FactionBadge faction={selected.faction} size={16} />
                  <ClassIcon classId={selected.classId} size={18} />
                  <span className="font-bold font-display" style={{ color: FACTIONS[selected.faction].colors.light }}>
                    {selected.name}
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                  <StatChip label="Term" value={`${createForm.termDays}d`} />
                  <StatChip label="Fee/wk" value={formatGold(createForm.weeklyFee)} color="#FFD166" />
                  <StatChip label="Owner share" value={`${ownerShare}%`} color="#7CF5E1" />
                  <StatChip label="Renter share" value={`${renterShare}%`} color="#7CF5E1" />
                </div>

                <div className="mt-3 rounded-xl p-2.5" style={{ background: "rgba(255,209,102,0.08)", border: "1px solid rgba(255,209,102,0.25)" }}>
                  <div className="text-[10px] text-white/70 uppercase tracking-wide">Projected weekly</div>
                  <div className="text-sm font-bold" style={{ color: "#FFD166" }}>
                    ~{formatGold(projWeekly)} <GoldIcon size={12} className="inline" /> GOLD total
                  </div>
                  <div className="text-[11px] text-white/80 mt-0.5">
                    You get <span className="font-bold" style={{ color: "#FFD166" }}>~{formatGold(projOwner)}</span> · renter gets{" "}
                    <span className="font-bold" style={{ color: "#7CF5E1" }}>~{formatGold(projRenter)}</span>
                  </div>
                </div>

                <div className="mt-2 text-[10px] text-white/55">
                  Owner share is capped at 60%. Renter can leave any time without penalty. You
                  cannot seize the renter's earnings or crabs.
                </div>
              </GlassPanel>

              <div className="flex justify-between">
                <GlowButton variant="ghost" size="sm" onClick={() => setCreateStep(2)}>
                  Back
                </GlowButton>
                <GlowButton variant="gold" size="sm" onClick={onPublish}>
                  Publish Charter
                </GlowButton>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ActiveView({
  charters,
  onSettle,
}: {
  charters: ActiveCharter[];
  onSettle: (id: string) => void;
}) {
  if (charters.length === 0) {
    return <EmptyState message="No live charters right now." hint="Sign one from Browse to start earning." />;
  }
  return (
    <div className="space-y-3">
      <SectionTitle title="Active Charters" />
      {charters.map((c) => {
        const f = FACTIONS[c.faction];
        const remaining = c.endsAt - Date.now();
        const ended = remaining <= 0;
        const totalEarnings = c.earningsToOwner + c.earningsToRenter;
        const youGet = c.role === "renter" ? c.earningsToRenter : c.earningsToOwner;
        return (
          <GlassPanel key={c.id} className="p-3" glow={ended ? "#FF6F9144" : `${f.colors.accent}22`}>
            <div className="flex items-start gap-3">
              <div
                className="shrink-0 rounded-xl flex items-center justify-center"
                style={{
                  width: 52,
                  height: 52,
                  background: `linear-gradient(160deg, ${f.colors.dark}cc, ${f.colors.primary}33)`,
                  border: `1px solid ${f.colors.accent}55`,
                  fontSize: 26,
                }}
              >
                {f.emblem}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="font-bold text-sm font-display" style={{ color: f.colors.light }}>
                    {c.crabName}
                  </span>
                  <RoleBadge role={c.role} />
                  {ended && (
                    <span className="px-1.5 py-0.5 rounded-md text-[9px] font-bold uppercase" style={{ background: "#FF6F9122", color: "#FF6F91", border: "1px solid #FF6F9155" }}>
                      Ended
                    </span>
                  )}
                </div>
                <div className="text-[10px] text-white/60">
                  {c.role === "renter" ? "Borrowed from" : "Lent to"} {c.counterpartyName} · Split {c.ownerSharePct}/{100 - c.ownerSharePct}
                </div>

                <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                  <StatChip
                    label="Time left"
                    value={ended ? "Ended" : formatTime(remaining)}
                    color={ended ? "#FF6F91" : "#7CF5E1"}
                  />
                  <StatChip label="Total earned" value={formatGold(totalEarnings)} color="#FFD166" />
                  <StatChip label="Owner" value={formatGold(c.earningsToOwner)} color="#FFD166" />
                  <StatChip label="Renter" value={formatGold(c.earningsToRenter)} color="#7CF5E1" />
                </div>

                {/* Earnings bar chart */}
                <div className="mt-3">
                  <div className="text-[10px] text-white/55 mb-1">Weekly earnings (last 7 days)</div>
                  <BarChart seed={c.id} />
                </div>

                {ended ? (
                  <div className="mt-2.5 flex justify-end">
                    <GlowButton variant="gold" size="sm" onClick={() => onSettle(c.id)}>
                      Settle now · Claim {formatGold(youGet)}
                    </GlowButton>
                  </div>
                ) : (
                  <div className="mt-2.5 text-[10px] text-white/55 text-right">
                    Settle becomes available when the term ends.
                  </div>
                )}
              </div>
            </div>
          </GlassPanel>
        );
      })}
    </div>
  );
}

// ---------- SHARED SMALL COMPONENTS ----------

function RoleBadge({ role }: { role: "owner" | "renter" }) {
  const isOwner = role === "owner";
  return (
    <span
      className="px-1.5 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wide"
      style={{
        background: isOwner ? "rgba(255,209,102,0.15)" : "rgba(124,245,225,0.12)",
        color: isOwner ? "#FFD166" : "#7CF5E1",
        border: `1px solid ${isOwner ? "rgba(255,209,102,0.4)" : "rgba(124,245,225,0.35)"}`,
      }}
    >
      {isOwner ? "Lending" : "Borrowing"}
    </span>
  );
}

function FilterPill({
  active,
  onClick,
  children,
  color = "#7CF5E1",
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  color?: string;
}) {
  return (
    <button
      onClick={onClick}
      className="px-2 py-1 rounded-lg text-[10px] font-bold transition"
      style={{
        background: active ? `${color}22` : "rgba(255,255,255,0.05)",
        color: active ? color : "rgba(234,246,255,0.6)",
        border: `1px solid ${active ? color + "66" : "rgba(124,245,225,0.18)"}`,
      }}
    >
      {children}
    </button>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <div className="text-[11px] text-white/75 font-bold mb-1">{children}</div>;
}

function PerfChart({ charter }: { charter: ActiveCharter }) {
  return (
    <div className="mt-2 rounded-xl p-2" style={{ background: "rgba(10,27,61,0.5)", border: "1px solid rgba(124,245,225,0.14)" }}>
      <div className="text-[10px] text-white/60 mb-1">Weekly earnings trend</div>
      <BarChart seed={charter.id} />
    </div>
  );
}

function BarChart({ seed }: { seed: string }) {
  const series = useMemo(() => weeklySeries(seed), [seed]);
  const max = Math.max(...series, 1);
  const labels = ["M", "T", "W", "T", "F", "S", "S"];
  return (
    <div className="flex items-end gap-1 h-16">
      {series.map((v, i) => (
        <div key={i} className="flex-1 flex flex-col items-center justify-end h-full">
          <div
            className="w-full rounded-t"
            style={{
              height: `${Math.max(6, (v / max) * 100)}%`,
              background: "linear-gradient(180deg, #7CF5E1, #12A7A0)",
              boxShadow: "0 0 6px rgba(124,245,225,0.35)",
            }}
            title={`${v} GOLD`}
          />
          <div className="text-[8px] text-white/45 mt-0.5">{labels[i]}</div>
        </div>
      ))}
    </div>
  );
}

function ConfirmDialog({
  title,
  children,
  onClose,
  onConfirm,
  confirmLabel,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  onConfirm: () => void;
  confirmLabel: string;
}) {
  return (
    <div
      className="modal-backdrop-enter fixed inset-0 z-[160] flex items-center justify-center p-4"
      style={{ background: "rgba(4,12,28,0.78)", backdropFilter: "blur(4px)" }}
      onClick={onClose}
    >
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md max-h-[88vh] overflow-y-auto rounded-2xl">
        <GlassPanel className="p-4">
        <div className="flex items-start justify-between mb-2">
          <h3 className="font-bold text-base font-display" style={{ color: "#7CF5E1" }}>
            {title}
          </h3>
          <button onClick={onClose} className="text-white/60 hover:text-white" aria-label="Cancel">
            ✕
          </button>
        </div>
        <div className="space-y-2">{children}</div>
        <div className="mt-4 flex justify-end gap-2">
          <GlowButton variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </GlowButton>
          <GlowButton variant="teal" size="sm" onClick={onConfirm}>
            {confirmLabel}
          </GlowButton>
        </div>
        </GlassPanel>
      </div>
    </div>
  );
}

function SettleBody({ charter }: { charter?: ActiveCharter }) {
  if (!charter) return <p className="text-sm text-white/80">Charter not found.</p>;
  const youGet = charter.role === "renter" ? charter.earningsToRenter : charter.earningsToOwner;
  const otherGets = charter.role === "renter" ? charter.earningsToOwner : charter.earningsToRenter;
  const otherLabel = charter.role === "renter" ? "Owner" : "Renter";
  return (
    <div className="space-y-2">
      <p className="text-sm text-white/85">
        This charter's term has ended. Settling distributes the accrued earnings at the agreed{" "}
        <span className="font-bold" style={{ color: "#7CF5E1" }}>
          {charter.ownerSharePct}/{100 - charter.ownerSharePct}
        </span>{" "}
        split.
      </p>
      <div className="grid grid-cols-2 gap-2">
        <StatChip label="You receive" value={formatGold(youGet)} color="#FFD166" />
        <StatChip label={`${otherLabel} receives`} value={formatGold(otherGets)} color="#7CF5E1" />
      </div>
    </div>
  );
}
