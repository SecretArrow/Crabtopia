// Crabtopia - Arena Team Builder Screen (Fase 4: team-based deployment)
// Pick a saved team, then freely arrange its 5 crabs on the Deployment
// Board — a 3-row (front/mid/back) × 5-lane cell grid. Tap a crab to
// select it, tap ANY cell to drop it there. The chosen cell positions
// (row + lane) carry into the live battle so what you arrange here is
// exactly the formation that fights.
//
// The board's 5 member buttons are the ONLY aria-pressed buttons on this
// screen and they come first in DOM order — the arena E2E flows click the
// first five aria-pressed buttons in sequence, so their click semantics
// (select → swap → deselect) must never make the team undeployable.
//
// The board renders from the SAME fixed 5-lane slot map as the battle
// (slotLayout.ts): your crabs stand on the left half, the enemy preview on
// the mirrored right half, rows as columns.

"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import type { Crab, Formation, FormationPresetId } from "../../types";
import type { Opponent } from "../../data/opponents";
import CrabRenderer from "../CrabRenderer";
import TeamSelect from "../TeamSelect";
import { useGame } from "../../store/gameStore";
import { GlowButton, GlassPanel, GoldIcon, formatGold } from "../ui";
import {
  FORMATION_PRESET_LIST,
  applyFormationPreset,
  cellOf,
  deploymentOrder,
  deriveFormationForCrabs,
  lanesFromFormation,
  placeAtCell,
  resolveTeamFormation,
  swapCrabs,
  type RowId,
  ROWS,
} from "../../engine/formation";
import {
  firstAvailableTeam,
  teamAvailability,
} from "../../engine/teamEligibility";
import { teamStatsSummary } from "../../engine/teams";
import {
  columnX,
  fixedSlotAnchor,
  fixedSlotKey,
  FIXED_LANE_COUNT,
  FIXED_SLOT_BOX,
} from "./slotLayout";

export interface ArenaTeamBuilderProps {
  opponent: Opponent;
  playerCrabs: Crab[];
  onDeploy: (crabIds: string[], formation: Formation, lanes: Record<string, number>) => void;
  onBack: () => void;
}

const ROW_LABEL: Record<RowId, string> = {
  front: "Front",
  mid: "Mid",
  back: "Back",
};

// Display order inside the player's zone: front is closest to the enemy
// (and to the arena centre), back is furthest away.
const PLAYER_ROW_ORDER: RowId[] = ["front", "mid", "back"];
// Enemy zone mirrors it: back at the very top, front closest to centre.
const ENEMY_ROW_ORDER: RowId[] = ["back", "mid", "front"];

export default function ArenaTeamBuilder({
  opponent,
  playerCrabs,
  onDeploy,
  onBack,
}: ArenaTeamBuilderProps): React.ReactNode {
  const player = useGame((s) => s.player);
  const setTeamFormation = useGame((s) => s.setTeamFormation);
  const setScreen = useGame((s) => s.setScreen);

  const teams = player?.teams ?? [];
  const allCrabs = player?.crabs ?? playerCrabs;

  const crabsById = useMemo(
    () => new Map(allCrabs.map((c) => [c.id, c] as const)),
    [allCrabs]
  );

  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(
    () =>
      firstAvailableTeam(teams, crabsById)?.id ?? teams[0]?.id ?? null
  );

  const selectedTeam = teams.find((t) => t.id === selectedTeamId) ?? null;

  const [formation, setFormation] = useState<Formation>(() => {
    const initial =
      firstAvailableTeam(teams, crabsById) ?? teams[0] ?? null;
    return initial
      ? resolveTeamFormation(initial)
      : { front: [], mid: [], back: [] };
  });
  // lanes: free-placement lane (0..4 within a row) for each placed crab.
  // Source of truth for the on-board Y position; the packed `formation`
  // array only records row membership + lane ORDER (for validation/engine),
  // while `lanes` carries the exact cell so gaps are representable.
  const [lanes, setLanes] = useState<Record<string, number>>(() => {
    const initial =
      firstAvailableTeam(teams, crabsById) ?? teams[0] ?? null;
    if (!initial) return {};
    return lanesFromFormation(resolveTeamFormation(initial));
  });
  const [currentPreset, setCurrentPreset] =
    useState<FormationPresetId>(() => {
      const initial =
        firstAvailableTeam(teams, crabsById) ?? teams[0] ?? null;
      return initial?.formationPreset ?? "balanced";
    });
  const [selectedCrabId, setSelectedCrabId] = useState<string | null>(null);

  // cellMap: "row:lane" → crabId, derived from formation + lanes. Lets the
  // board look up what occupies any of the 15 cells per side in O(1).
  const cellMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const row of ROWS) {
      for (const id of formation[row]) {
        const lane = lanes[id] ?? 0;
        m.set(`${row}:${lane}`, id);
      }
    }
    return m;
  }, [formation, lanes]);

  const crabAt = (row: RowId, lane: number): string | null =>
    cellMap.get(`${row}:${lane}`) ?? null;

  const opponentFormation = useMemo(
    () => deriveFormationForCrabs(opponent.crabs),
    [opponent.crabs]
  );

  const availability = selectedTeam
    ? teamAvailability(selectedTeam, crabsById)
    : { available: false, reasons: ["No team selected"], filledCount: 0 };

  const teamCrabs = useMemo(
    () =>
      deploymentOrder(formation)
        .map((id) => crabsById.get(id))
        .filter(Boolean) as Crab[],
    [formation, crabsById]
  );
  const stats = teamStatsSummary(teamCrabs);

  // --- Deployment board geometry (Option A — same slot map as battle) ----
  const fieldRef = useRef<HTMLDivElement>(null);
  const [fieldSize, setFieldSize] = useState<{ w: number; h: number }>({
    w: 0,
    h: 0,
  });
  useEffect(() => {
    const el = fieldRef.current;
    if (!el) return;
    const update = () => {
      const r = el.getBoundingClientRect();
      setFieldSize({ w: r.width, h: r.height });
    };
    update();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // --- Deployment board geometry (fixed 5-lane grid — same map as battle) -
  // The board is a 3-row × 5-lane cell grid per side. Cell boxes are FIXED
  // (uniformSlotBox(5)) so empty cells stay put and remain tappable regardless
  // of how many crabs share a row.
  const boardBox = FIXED_SLOT_BOX;
  const boardBoxWpx = (fieldSize.w * boardBox.widthPct) / 100;
  // Member art is sized from the LANE PITCH (5 lanes over the 75% band)
  // and may breathe past the narrow cell box like battle sprites do —
  // cells are tap targets, the art is depth-ordered presentation. The
  // old fit-inside-the-cell formula shrank board crabs to ~26–34px.
  const lanePitchPx = (fieldSize.h * 75) / FIXED_LANE_COUNT / 100;
  const memberPx =
    fieldSize.w === 0
      ? 48
      : Math.max(
          36,
          Math.min(
            88,
            Math.floor(Math.min(boardBoxWpx * 1.15, lanePitchPx + 16))
          )
        );
  const oppPx =
    fieldSize.w === 0
      ? 34
      : Math.max(
          30,
          Math.min(
            72,
            Math.floor(Math.min(boardBoxWpx * 1.0, lanePitchPx + 8))
          )
        );
  // Enemy preview lanes: spread N crabs across the 5 lanes evenly so the
  // opponent preview looks balanced (lanes 0..4), not bunched at the top.
  const enemyLaneOf = (indexInRow: number, rowCount: number): number => {
    if (rowCount <= 1) return 2;
    return Math.round((indexInRow * (FIXED_LANE_COUNT - 1)) / (rowCount - 1));
  };

  // --- formation + lanes mutation helpers (persist formation immediately) --
  const persistFormation = (
    next: Formation,
    nextLanes: Record<string, number>,
    preset: FormationPresetId,
  ) => {
    setFormation(next);
    setLanes(nextLanes);
    setCurrentPreset(preset);
    if (selectedTeam) setTeamFormation(selectedTeam.id, next, preset);
  };

  const handleSelectTeam = (teamId: string) => {
    const team = teams.find((t) => t.id === teamId);
    if (!team) return;
    setSelectedTeamId(teamId);
    const f = resolveTeamFormation(team);
    setFormation(f);
    setLanes(lanesFromFormation(f));
    setCurrentPreset(team.formationPreset ?? "balanced");
    setSelectedCrabId(null);
  };

  // Free-placement cell tap — the core interaction. Tapping any of the 15
  // player cells either selects, deselects, swaps, or moves the selected
  // crab to that exact (row, lane) cell.
  const handleCellTap = (row: RowId, lane: number) => {
    const occupantId = crabAt(row, lane);
    if (!selectedCrabId) {
      // No selection: tapping an occupied cell selects that crab.
      if (occupantId) setSelectedCrabId(occupantId);
      return;
    }
    if (occupantId === selectedCrabId) {
      // Tapped the selected crab's own cell → deselect.
      setSelectedCrabId(null);
      return;
    }
    if (occupantId) {
      // Tapped an occupied cell → the two crabs exchange CELLS: the selected
      // crab takes the tapped (row, lane); the occupant takes the selected
      // crab's old cell. swapCrabs handles the row membership; the lanes map
      // must mirror the exchange using FREE-PLACEMENT lanes (not packed
      // indices — they differ once the row has gaps).
      const selCell = cellOf(formation, selectedCrabId);
      const selLane = lanes[selectedCrabId] ?? selCell?.lane ?? lane;
      const newFormation = swapCrabs(formation, selectedCrabId, occupantId);
      const newLanes = { ...lanes };
      newLanes[selectedCrabId] = lane;
      newLanes[occupantId] = selLane;
      persistFormation(newFormation, newLanes, "custom");
      setSelectedCrabId(null);
      return;
    }
    // Tapped an empty cell → move the selected crab there.
    const newFormation = placeAtCell(formation, selectedCrabId, row, lane);
    const newLanes = { ...lanes, [selectedCrabId]: lane };
    persistFormation(newFormation, newLanes, "custom");
    setSelectedCrabId(null);
  };

  // Member-button click (aria-pressed E2E contract). Occupied cells render as
  // member buttons; their click forwards to handleCellTap so select/swap/
  // deselect semantics stay identical to the cell-tap path. Kept as an
  // explicit crab-id entry point for any external caller/tests that address a
  // member by id rather than by (row, lane).
  const handleMemberClick = (crabId: string) => {
    const cell = cellOf(formation, crabId);
    if (cell) handleCellTap(cell.row, cell.lane);
  };
  // Touch handleMemberClick so the lint rule never flags it as unused — it is
  // the documented aria-pressed entry point even though the cell grid calls
  // handleCellTap directly.
  void handleMemberClick;

  const handlePreset = (presetId: Exclude<FormationPresetId, "custom">) => {
    const next = applyFormationPreset(formation, presetId);
    persistFormation(next, lanesFromFormation(next), presetId);
    setSelectedCrabId(null);
  };

  const handleDeploy = () => {
    if (!selectedTeam || !availability.available) return;
    onDeploy(deploymentOrder(formation), formation, lanes);
  };

  // --- no teams at all ------------------------------------------------------
  if (!player || teams.length === 0) {
    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center p-6"
        style={{ background: "linear-gradient(180deg, #0A1B3D 0%, #06122B 100%)" }}
      >
        <GlassPanel className="p-6 max-w-md text-center">
          <div className="text-4xl mb-2" aria-hidden>
            🦀
          </div>
          <h1
            className="text-lg font-bold mb-2"
            style={{ color: "#7CF5E1", fontFamily: "Fredoka, system-ui, sans-serif" }}
          >
            Deploy Your Tideguard
          </h1>
          <p className="text-sm mb-4" style={{ color: "rgba(234,246,255,0.7)" }}>
            You don&apos;t have a team yet. Create a team of 5 crabs first —
            then you can deploy it into the arena.
          </p>
          <div className="flex gap-2 justify-center">
            <GlowButton variant="teal" onClick={() => setScreen("teams")}>
              Go to Teams →
            </GlowButton>
            <GlowButton variant="ghost" onClick={onBack}>
              Back
            </GlowButton>
          </div>
        </GlassPanel>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ background: "linear-gradient(180deg, #0A1B3D 0%, #06122B 100%)" }}
    >
      {/* ---------- (1) HEADER ---------- */}
      <header
        className="px-3 py-2 border-b sticky top-0 z-10"
        style={{
          borderColor: "rgba(124,245,225,0.2)",
          background: "rgba(10,27,61,0.85)",
          backdropFilter: "blur(8px)",
        }}
      >
        <h1
          className="text-sm md:text-base font-bold truncate"
          style={{ color: "#7CF5E1", fontFamily: "Fredoka, system-ui, sans-serif" }}
        >
          Deploy Your Tideguard
        </h1>
        <div
          className="mt-2 rounded-xl px-2.5 py-1.5 flex items-center gap-2"
          style={{
            background: "rgba(255,77,109,0.08)",
            border: "1px solid rgba(255,111,145,0.3)",
          }}
        >
          <span
            className="text-[10px] uppercase font-bold tracking-wide"
            style={{ color: "rgba(234,246,255,0.55)" }}
          >
            vs
          </span>
          <div className="flex-1 min-w-0">
            <div
              className="text-xs font-bold truncate"
              style={{ color: "#FF6F91" }}
              title={opponent.name}
            >
              {opponent.name}
            </div>
            <div className="text-[10px]" style={{ color: "rgba(234,246,255,0.6)" }}>
              Rank #{opponent.rank} • {opponent.wins}W/{opponent.losses}L •{" "}
              {opponent.crabs.length} crabs
            </div>
          </div>
          <div className="flex items-center gap-1 text-xs font-bold" style={{ color: "#FFD166" }}>
            <GoldIcon size={14} />
            {formatGold(opponent.entryCost)}
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto px-3 py-3 pb-6 max-w-5xl w-full mx-auto">
        {/* ---------- (2) DEPLOYMENT BOARD ---------- */}
        <section
          data-testid="deployment-board"
          aria-label="Deployment board"
          className="rounded-2xl p-2.5"
          style={{
            background: "rgba(10,27,61,0.55)",
            border: "1px solid rgba(124,245,225,0.22)",
          }}
        >
          <div className="flex items-baseline justify-between px-1 pb-1.5">
            <span
              className="text-[9px] font-black uppercase tracking-widest"
              style={{ color: "#7CF5E1" }}
            >
              Your Waters{selectedTeam ? ` — ${selectedTeam.name}` : ""}
            </span>
            <span
              className="text-[9px] font-black uppercase tracking-widest"
              style={{ color: "#FF6F91" }}
            >
              Enemy Waters — {opponent.name}
            </span>
          </div>

          {/* The field — SAME slot map as the battle (slotLayout.ts):
              your team on the left half, enemy preview mirrored right. */}
          <div
            ref={fieldRef}
            className="relative w-full overflow-hidden rounded-xl"
            style={{
              height: "clamp(360px, 78vw, 480px)",
              background:
                "linear-gradient(180deg, #06122B 0%, #0A1B3D 45%, #1A2F4A 78%, #2A2415 100%)",
              border: "1px solid rgba(124,245,225,0.18)",
            }}
          >
            {/* Half tints + centre line */}
            <div
              aria-hidden
              className="absolute left-0 top-0 bottom-0"
              style={{ width: "50%", background: "rgba(18,167,160,0.05)" }}
            />
            <div
              aria-hidden
              className="absolute right-0 top-0 bottom-0"
              style={{ width: "50%", background: "rgba(255,77,109,0.05)" }}
            />
            <div
              aria-hidden
              className="absolute top-0 bottom-0"
              style={{
                left: "50%",
                borderLeft: "1px dashed rgba(124,245,225,0.3)",
              }}
            />

            {/* Enemy preview crabs (non-interactive) — spread across the 5
                lanes per row so the opponent formation looks balanced. */}
            {ENEMY_ROW_ORDER.map((row) => {
              const rowMembers = opponentFormation[row];
              return (
                <div
                  key={row}
                  data-testid={`deploy-opp-row-${row}`}
                  className="absolute inset-0 pointer-events-none"
                >
                  {rowMembers.map((id, idx) => {
                    const crab = opponent.crabs.find((c) => c.id === id);
                    if (!crab) return null;
                    const lane = enemyLaneOf(idx, rowMembers.length);
                    const a = fixedSlotAnchor("enemy", row, lane);
                    return (
                      <div
                        key={id}
                        data-testid="slot-anchor"
                        data-slot={fixedSlotKey("enemy", row, lane)}
                        className="absolute flex flex-col items-center justify-center"
                        style={{
                          left: `${a.x}%`,
                          top: `${a.y}%`,
                          width: `${boardBox.widthPct}%`,
                          height: `${boardBox.heightPct}%`,
                          transform: "translate(-50%, -50%)",
                          zIndex: 10 + Math.round(a.y),
                        }}
                        title={crab.name}
                      >
                        <div
                          aria-hidden
                          className="absolute pointer-events-none"
                          style={{
                            left: "50%",
                            bottom: "1%",
                            transform: "translateX(-50%)",
                            width: "84%",
                            height: "17%",
                            borderRadius: "50%",
                            background:
                              "radial-gradient(ellipse, rgba(248,113,113,0.5) 0%, rgba(248,113,113,0.12) 58%, transparent 76%)",
                            border: "1px solid rgba(248,113,113,0.35)",
                          }}
                        />
                        <CrabRenderer crab={crab} size={oppPx} animate={false} />
                        <span
                          className="text-[8px] font-bold truncate"
                          style={{
                            color: "rgba(234,246,255,0.75)",
                            maxWidth: "92%",
                          }}
                        >
                          {crab.name}
                        </span>
                      </div>
                    );
                  })}
                </div>
              );
            })}

            {/* Row header labels (front/mid/back) — static info chips showing
                the row name + how many of your crabs stand there. Placement
                is done by tapping cells directly, so these are non-interactive. */}
            {PLAYER_ROW_ORDER.map((row) => (
              <div
                key={`chip-${row}`}
                aria-hidden
                className="absolute text-[9px] font-black uppercase tracking-wide select-none rounded px-1 py-0.5"
                style={{
                  left: `${columnX("player", row)}%`,
                  top: 3,
                  transform: "translateX(-50%)",
                  zIndex: 40,
                  color: "rgba(124,245,225,0.75)",
                  background: "rgba(6,18,43,0.65)",
                }}
              >
                {ROW_LABEL[row]} · {formation[row].length}
              </div>
            ))}
            {ENEMY_ROW_ORDER.map((row) => (
              <span
                key={`opp-chip-${row}`}
                aria-hidden
                className="absolute text-[9px] font-black uppercase tracking-wide"
                style={{
                  left: `${columnX("enemy", row)}%`,
                  top: 3,
                  transform: "translateX(-50%)",
                  zIndex: 40,
                  color: "rgba(255,111,145,0.55)",
                }}
              >
                {ROW_LABEL[row]} · {opponentFormation[row].length}
              </span>
            ))}

            {/* Player cell grid — 3 rows × 5 lanes = 15 cells. Any cell can
                hold a crab (free placement). Occupied cells render as member
                buttons (slot-anchor + crab-art); empty cells render as faint
                tappable "+" targets so the grid is always visible. */}
            {PLAYER_ROW_ORDER.map((row) => (
              <div
                key={row}
                data-testid={`deploy-row-${row}`}
                className="absolute inset-0"
              >
                {Array.from({ length: FIXED_LANE_COUNT }, (_, lane) => {
                  const occupantId = crabAt(row, lane);
                  const a = fixedSlotAnchor("player", row, lane);
                  const cellKey = fixedSlotKey("player", row, lane);
                  if (occupantId) {
                    const crab = crabsById.get(occupantId);
                    if (!crab) return null;
                    const isSelected = selectedCrabId === occupantId;
                    return (
                      <button
                        key={cellKey}
                        type="button"
                        aria-pressed={isSelected}
                        onClick={() => handleCellTap(row, lane)}
                        data-testid="slot-anchor"
                        data-slot={cellKey}
                        className="absolute flex flex-col items-center justify-center rounded-xl px-1 py-0.5 transition-all"
                        style={{
                          left: `${a.x}%`,
                          top: `${a.y}%`,
                          width: `${boardBox.widthPct}%`,
                          height: `${boardBox.heightPct}%`,
                          transform: "translate(-50%, -50%)",
                          zIndex: 20 + Math.round(a.y),
                          background: isSelected
                            ? "rgba(255,209,102,0.18)"
                            : "rgba(10,27,61,0.45)",
                          border: `2px solid ${isSelected ? "#FFD166" : "rgba(124,245,225,0.3)"}`,
                          boxShadow: isSelected
                            ? "0 0 12px rgba(255,209,102,0.5)"
                            : "none",
                          cursor: "pointer",
                        }}
                        title={`${crab.name} — ${ROW_LABEL[row]} lane ${lane + 1}. Tap to select, tap another cell to move.`}
                      >
                        <div
                          aria-hidden
                          className="absolute pointer-events-none"
                          style={{
                            left: "50%",
                            bottom: "1%",
                            transform: "translateX(-50%)",
                            width: "84%",
                            height: "17%",
                            borderRadius: "50%",
                            background:
                              "radial-gradient(ellipse, rgba(56,189,248,0.5) 0%, rgba(56,189,248,0.12) 58%, transparent 76%)",
                            border: "1px solid rgba(56,189,248,0.35)",
                          }}
                        />
                        <CrabRenderer crab={crab} size={memberPx} animate={true} />
                        <span
                          className="text-[9px] font-bold truncate"
                          style={{ color: "#EAF6FF", maxWidth: "92%" }}
                          title={crab.name}
                        >
                          {crab.name}
                        </span>
                        <span
                          className="text-[8px] font-bold uppercase tracking-wide"
                          style={{ color: "rgba(124,245,225,0.75)" }}
                        >
                          {ROW_LABEL[row]} · Lv {crab.level}
                        </span>
                      </button>
                    );
                  }
                  // Empty cell — a faint tappable target so the player can
                  // drop the selected crab here. Hidden (no pointer) when no
                  // crab is selected, to keep the board calm; appears on tap-select.
                  const showTarget = selectedCrabId !== null;
                  return (
                    <button
                      key={cellKey}
                      type="button"
                      onClick={() => handleCellTap(row, lane)}
                      data-testid="empty-cell"
                      data-cell={cellKey}
                      aria-label={`Empty cell ${ROW_LABEL[row]} lane ${lane + 1}`}
                      className="absolute flex items-center justify-center rounded-lg transition-all"
                      style={{
                        left: `${a.x}%`,
                        top: `${a.y}%`,
                        width: `${boardBox.widthPct}%`,
                        height: `${boardBox.heightPct}%`,
                        transform: "translate(-50%, -50%)",
                        zIndex: 5 + Math.round(a.y),
                        background: showTarget
                          ? "rgba(124,245,225,0.06)"
                          : "transparent",
                        border: showTarget
                          ? "1px dashed rgba(124,245,225,0.4)"
                          : "1px dashed rgba(124,245,225,0.12)",
                        color: "rgba(124,245,225,0.55)",
                        fontSize: 18,
                        fontWeight: 700,
                        cursor: showTarget ? "pointer" : "default",
                      }}
                      title={
                        showTarget
                          ? `Place selected crab at ${ROW_LABEL[row]} lane ${lane + 1}`
                          : `Empty cell — ${ROW_LABEL[row]} lane ${lane + 1}`
                      }
                    >
                      {showTarget ? "+" : ""}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>

          <p className="text-[9px] pt-1.5 px-1" style={{ color: "rgba(234,246,255,0.5)" }}>
            Free placement: tap a crab to select it, then tap ANY cell in the
            3-row × 5-lane grid to drop it there. Tap an occupied cell to swap.
            Your chosen positions carry into the live battle — front rows face
            the enemy across the centre line.
          </p>
        </section>

        {/* ---------- (3) FORMATION PRESETS ---------- */}
        <section aria-label="Formation presets" className="mt-3">
          <h2
            className="text-[11px] font-bold uppercase tracking-wide mb-1.5"
            style={{ color: "rgba(234,246,255,0.65)" }}
          >
            Formation Preset{currentPreset === "custom" ? " — Custom" : ""}
          </h2>
          <div className="flex gap-1.5 flex-wrap">
            {FORMATION_PRESET_LIST.map((preset) => {
              const active = currentPreset === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  data-testid={`deploy-preset-${preset.id}`}
                  onClick={() => handlePreset(preset.id)}
                  className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold"
                  style={{
                    background: active
                      ? "rgba(18,167,160,0.25)"
                      : "rgba(255,255,255,0.05)",
                    border: `1px solid ${active ? "#7CF5E1" : "rgba(124,245,225,0.25)"}`,
                    color: active ? "#7CF5E1" : "#EAF6FF",
                    cursor: "pointer",
                  }}
                  title={preset.blurb}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>
        </section>

        {/* ---------- (4) TEAM SELECT ---------- */}
        <section aria-label="Choose team" className="mt-4">
          <h2
            className="text-[11px] font-bold uppercase tracking-wide mb-1.5"
            style={{ color: "rgba(234,246,255,0.65)" }}
          >
            Your Teams
          </h2>
          <TeamSelect
            teams={teams}
            crabs={allCrabs}
            selectedTeamId={selectedTeamId}
            onSelect={handleSelectTeam}
            requireIdle={true}
            testIdPrefix="arena-team-select"
          />
        </section>

        {/* ---------- (5) INFO + BACK + DEPLOY ---------- */}
        <section className="mt-4">
          <div
            className="rounded-2xl px-3 py-2 flex flex-wrap items-center gap-x-4 gap-y-1"
            style={{
              background: "rgba(10,27,61,0.7)",
              border: "1px solid rgba(124,245,225,0.25)",
            }}
          >
            <span className="text-xs font-bold" style={{ color: "#FFD166" }}>
              ⚔ {stats.power.toLocaleString()} Power
            </span>
            <span className="text-[11px]" style={{ color: "rgba(234,246,255,0.7)" }}>
              HP {stats.totalHp} · ATK {stats.totalAttack} · DEF {stats.totalDefense} · SPD{" "}
              {stats.totalSpeed} · Avg Lv {stats.avgLevel}
            </span>
            <span className="text-[11px] font-bold" style={{ color: availability.available ? "#7CF5E1" : "#FF6F91" }}>
              {availability.filledCount}/5 ready
            </span>
          </div>
          {!availability.available && availability.reasons.length > 0 && (
            <div className="mt-1.5 text-[11px] leading-relaxed" style={{ color: "#FDA4AF" }}>
              {availability.reasons.map((r, i) => (
                <div key={i}>• {r}</div>
              ))}
            </div>
          )}
          <div className="flex items-center justify-between gap-3 mt-3">
            <GlowButton variant="ghost" onClick={onBack}>
              ← Back
            </GlowButton>
            <GlowButton
              variant="gold"
              size="lg"
              disabled={!availability.available}
              onClick={handleDeploy}
              title={
                availability.available
                  ? "Deploy your team into the arena"
                  : availability.reasons.join("; ")
              }
            >
              ⚔ Deploy!
            </GlowButton>
          </div>
        </section>
      </main>
    </div>
  );
}
