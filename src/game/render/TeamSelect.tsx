// Crabtopia - Shared TeamSelect component (unified team selection).
// Used by Deploy (dives), Raids, Arena and other activities so every
// activity picks teams the same way: availability + reasons from
// teamEligibility, power + stats from teamStatsSummary, formation preview
// from resolveTeamFormation, dominant faction emblem.
"use client";

import { useMemo } from "react";
import type { Crab, Team } from "../types";
import { useGame } from "../store/gameStore";
import {
  teamAvailability,
  dominantFaction,
  rosterSufficiency,
  insufficientRosterMessage,
} from "../engine/teamEligibility";
import { teamStatsSummary, toTeamSlots, filledCrabIds } from "../engine/teams";
import { resolveTeamFormation, ROWS, type RowId } from "../engine/formation";
import { formatBP } from "../engine/bp";
import { CLASSES } from "../content/classes";
import CrabRenderer from "./CrabRenderer";
import ElementBadge from "./ElementBadge";
import FactionEmblem from "./FactionEmblem";
import { EmptyState, GlowButton } from "./ui";

interface TeamSelectProps {
  teams: Team[];
  crabs: Crab[];
  selectedTeamId: string | null;
  onSelect: (teamId: string) => void;
  requireIdle?: boolean;
  testIdPrefix?: string;
}

const ROW_LABEL: Record<RowId, string> = {
  front: "Front",
  mid: "Mid",
  back: "Back",
};

export default function TeamSelect({
  teams,
  crabs,
  selectedTeamId,
  onSelect,
  requireIdle = true,
  testIdPrefix = "team-select",
}: TeamSelectProps) {
  const setScreen = useGame((s) => s.setScreen);

  const crabsById = useMemo(
    () => new Map(crabs.map((c) => [c.id, c] as const)),
    [crabs]
  );

  // Roster-level guidance: owning fewer than 5 crabs makes ANY full team
  // impossible — point at the Market instead of leaving a dead end.
  const sufficiency = rosterSufficiency(crabs);
  const insufficientMessage = insufficientRosterMessage(crabs);
  const goBazaar = (genesis: boolean) => {
    try {
      if (genesis) sessionStorage.setItem("crabtopia-bazaar-tab", "genesis");
      setScreen("bazaar");
    } catch {
      // navigation is a convenience; ignore unavailable storage/store.
    }
  };
  const insufficientBanner = insufficientMessage ? (
    <div
      data-testid={`${testIdPrefix}-insufficient`}
      className="rounded-xl p-3 border mb-2"
      style={{
        background: "rgba(255,209,102,0.08)",
        borderColor: "rgba(255,209,102,0.45)",
      }}
    >
      <div className="text-xs font-bold" style={{ color: "#FFD166" }}>
        🦀 Not enough crabs
      </div>
      <div className="text-[11px] text-white/75 mt-0.5">
        {insufficientMessage} Buy more crabs to complete your roster
        ({sufficiency.ownedCount}/5 owned).
      </div>
      <div className="flex gap-2 mt-2 flex-wrap">
        <GlowButton variant="gold" size="sm" onClick={() => goBazaar(false)}>
          Buy Crabs in Market
        </GlowButton>
        <GlowButton variant="ghost" size="sm" onClick={() => goBazaar(true)}>
          Genesis Collection →
        </GlowButton>
      </div>
    </div>
  ) : null;

  if (teams.length === 0) {
    return (
      <div data-testid={testIdPrefix}>
        {insufficientBanner}
        <EmptyState
          message="No teams yet"
          hint="Create a team of 5 crabs first — then you can deploy it here."
          cta={
            <GlowButton
              variant="teal"
              size="sm"
              onClick={() => {
                try {
                  setScreen("teams");
                } catch {
                  // setScreen is optional convenience; ignore if unavailable.
                }
              }}
            >
              Go to Teams →
            </GlowButton>
          }
        />
      </div>
    );
  }

  return (
    <div
      data-testid={testIdPrefix}
      className="space-y-2 max-h-[60vh] overflow-y-auto pr-1"
    >
      {insufficientBanner}
      {teams.map((team) => {
        const availability = teamAvailability(team, crabsById, { requireIdle });
        const isAvailable = availability.available;
        const isSelected = selectedTeamId === team.id;
        const faction = dominantFaction(team, crabsById);
        const filledIds = filledCrabIds(team.crabIds);
        const teamCrabs = filledIds
          .map((id) => crabsById.get(id))
          .filter(Boolean) as Crab[];
        const stats = teamStatsSummary(teamCrabs);
        const formation = resolveTeamFormation(team);
        const slots = toTeamSlots(team.crabIds);

        return (
          <button
            key={team.id}
            type="button"
            data-testid={`${testIdPrefix}-card-${team.id}`}
            data-selected={isSelected ? "true" : undefined}
            disabled={!isAvailable}
            onClick={() => {
              if (!isAvailable) return;
              onSelect(team.id);
            }}
            className="w-full rounded-xl p-3 border text-left transition-all disabled:cursor-not-allowed"
            style={{
              background: isSelected
                ? "rgba(18,167,160,0.14)"
                : "rgba(255,255,255,0.04)",
              borderColor: isSelected
                ? "#7CF5E1"
                : isAvailable
                  ? "rgba(124,245,225,0.25)"
                  : "rgba(255,111,145,0.35)",
              boxShadow: isSelected
                ? "0 0 14px rgba(124,245,225,0.45), 0 0 4px rgba(18,167,160,0.5)"
                : undefined,
              opacity: !isAvailable ? 0.75 : 1,
            }}
          >
            {/* Header: name + faction + power */}
            <div className="flex items-center gap-2">
              {faction && <FactionEmblem faction={faction} size={20} />}
              <span className="font-bold text-sm flex-1 min-w-0 truncate">
                {team.name}
              </span>
              <span
                className="text-[11px] font-bold shrink-0"
                style={{ color: "#FFD166" }}
              >
                {formatBP(stats.power)} BP
              </span>
              <span className="text-[10px] text-white/60 shrink-0">
                {availability.filledCount}/5
              </span>
            </div>

            {/* 5 member sprites / placeholders */}
            <div className="flex gap-1.5 mt-2">
              {slots.map((slotId, idx) => {
                const crab = slotId ? crabsById.get(slotId) : undefined;
                if (!crab) {
                  return (
                    <div
                      key={idx}
                      className="rounded-lg border border-dashed border-white/20 bg-black/20 flex items-center justify-center text-white/30 text-xs"
                      style={{ width: 40, height: 40 }}
                    >
                      ?
                    </div>
                  );
                }
                return (
                  <div
                    key={crab.id}
                    className="rounded-lg bg-black/30 p-0.5 shrink-0"
                    title={`${crab.name} · ${CLASSES[crab.classId].name} Lv${crab.level}`}
                  >
                    <CrabRenderer crab={crab} size={48} animate={false} />
                  </div>
                );
              })}
            </div>

            {/* Compact stats */}
            <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-2 text-[10px] text-white/70">
              <span>HP {stats.totalHp}</span>
              <span>ATK {stats.totalAttack}</span>
              <span>DEF {stats.totalDefense}</span>
              <span>SPD {stats.totalSpeed}</span>
              <span>SKL {stats.totalSkill}</span>
              <span>Avg Lv {stats.avgLevel}</span>
            </div>

            {/* Formation mini preview */}
            <div className="mt-2 space-y-0.5">
              {ROWS.map((row) => {
                const rowCrabs = formation[row]
                  .map((id) => crabsById.get(id))
                  .filter(Boolean) as Crab[];
                return (
                  <div
                    key={row}
                    className="flex items-center gap-1.5 text-[10px]"
                  >
                    <span className="w-10 shrink-0 uppercase tracking-wide text-white/50 font-bold">
                      {ROW_LABEL[row]}
                    </span>
                    {rowCrabs.length === 0 ? (
                      <span className="text-white/35">—</span>
                    ) : (
                      <span className="flex flex-wrap gap-x-2 gap-y-0.5">
                        {rowCrabs.map((c) => (
                          <span
                            key={c.id}
                            className="inline-flex items-center gap-1 text-white/80"
                          >
                            <span aria-hidden>{CLASSES[c.classId].icon}</span>
                            <span className="truncate max-w-[90px]">{c.name}</span>
                            <ElementBadge crab={c} />
                          </span>
                        ))}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Availability reasons */}
            {!isAvailable && availability.reasons.length > 0 && (
              <div
                data-testid={`${testIdPrefix}-reasons-${team.id}`}
                className="mt-2 text-[10px] leading-relaxed"
                style={{ color: "#FDA4AF" }}
              >
                {availability.reasons.map((r, i) => (
                  <div key={i}>• {r}</div>
                ))}
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}
