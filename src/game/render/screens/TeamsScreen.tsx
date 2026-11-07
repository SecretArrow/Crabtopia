// Crabtopia - Teams screen (team builder)
"use client";

import { useState } from "react";
import { X, Pencil, Check } from "lucide-react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { useGame } from "../../store/gameStore";
import { Crab, FormationPresetId } from "../../types";
import { CLASSES } from "../../content/classes";
import { crabBaseBP, teamBP, factionBonus, classSynergy, formatBP, positioningBonus } from "../../engine/bp";
import { TEAM_SIZE, toTeamSlots, validateTeam } from "../../engine/teams";
import {
  FORMATION_PRESET_LIST,
  ROWS,
  resolveTeamFormation,
  applyFormationPreset,
  moveCrabToRow,
  swapCrabs,
  type RowId,
} from "../../engine/formation";
import CrabCard from "../CrabCard";
import CrabRenderer from "../CrabRenderer";
import {
  GlowButton,
  GlassPanel,
  GoldIcon,
  EmptyState,
  SectionTitle,
  StatChip,
} from "../ui";
import { Modal } from "../Modal";

export default function TeamsScreen() {
  const player = useGame((s) => s.player)!;
  const createTeam = useGame((s) => s.createTeam);
  const deleteTeam = useGame((s) => s.deleteTeam);
  const addCrabToTeam = useGame((s) => s.addCrabToTeam);
  const removeCrabFromTeam = useGame((s) => s.removeCrabFromTeam);
  const renameTeam = useGame((s) => s.renameTeam);
  const setTeamFormation = useGame((s) => s.setTeamFormation);
  const setScreen = useGame((s) => s.setScreen);

  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(
    player.teams[0]?.id ?? null
  );
  // Which slot index currently has its swap Popover open.
  const [pickerSlot, setPickerSlot] = useState<number | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newTeamName, setNewTeamName] = useState("");
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [selectedFormationCrabId, setSelectedFormationCrabId] = useState<string | null>(null);

  const team = player.teams.find((t) => t.id === selectedTeamId);
  const teamCrabIds = (team?.crabIds ?? []).filter(Boolean);
  const teamCrabIdSet = new Set(teamCrabIds);
  const teamCrabs = teamCrabIds
    .map((id) => player.crabs.find((c) => c.id === id))
    .filter(Boolean) as Crab[];

  const fb = factionBonus(teamCrabs);
  const cs = classSynergy(teamCrabs);
  const totalBP =
    teamCrabs.length === 5
      ? teamBP(teamCrabs).total
      : teamCrabs.reduce((s, c) => s + crabBaseBP(c), 0);

  // Picker pool: idle crabs NOT already slotted into THIS team.
  const availableForPicker = player.crabs.filter(
    (c) => c.activity === "idle" && !teamCrabIdSet.has(c.id)
  );
  // Inventory list: every owned crab except those already in this team.
  const availableInventory = player.crabs.filter((c) => !teamCrabIdSet.has(c.id));

  const diveReward = 300 + Math.round(totalBP / 20);

  // Formation (only meaningful for a full 5-crab team)
  const currentFormation = team ? resolveTeamFormation(team) : null;
  const activePreset: FormationPresetId = team?.formationPreset ?? "balanced";
  const activePresetLabel =
    activePreset === "custom"
      ? "Custom"
      : (FORMATION_PRESET_LIST.find((p) => p.id === activePreset)?.label ?? "Balanced");
  const posBonus = currentFormation ? positioningBonus(teamCrabs, currentFormation) : 0;
  const isFullTeam = teamCrabs.length === 5 && validateTeam(team?.crabIds ?? []).valid;

  const closePicker = () => setPickerSlot(null);

  const handleFormationCrabClick = (crabId: string) => {
    if (!team || !currentFormation) return;
    if (!selectedFormationCrabId) {
      setSelectedFormationCrabId(crabId);
      return;
    }
    if (selectedFormationCrabId === crabId) {
      setSelectedFormationCrabId(null);
      return;
    }
    const next = swapCrabs(currentFormation, selectedFormationCrabId, crabId);
    setTeamFormation(team.id, next, "custom");
    setSelectedFormationCrabId(null);
  };

  const handleFormationRowClick = (row: RowId) => {
    if (!team || !currentFormation || !selectedFormationCrabId) return;
    const next = moveCrabToRow(currentFormation, selectedFormationCrabId, row);
    setTeamFormation(team.id, next, "custom");
    setSelectedFormationCrabId(null);
  };

  return (
    <div className="space-y-4 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl md:text-2xl font-bold font-display">Teams</h1>
          <p className="text-xs opacity-70">
            {player.teams.length} teams ·{" "}
            {player.teams.length >= 5 ? "extra slots cost GOLD" : "5 free slots"}
          </p>
        </div>
        <GlowButton variant="teal" size="sm" onClick={() => setShowCreate(true)}>
          + New Team
        </GlowButton>
      </div>

      {/* Insufficient-roster guidance: fewer than 5 crabs owned can never
          fill a team — guide to the Market instead of a dead end. */}
      {player.crabs.length < 5 && (
        <div
          data-testid="insufficient-crabs-banner"
          className="rounded-xl p-3 border mb-3 flex items-center gap-3 flex-wrap"
          style={{
            background: "rgba(255,209,102,0.08)",
            borderColor: "rgba(255,209,102,0.45)",
          }}
        >
          <div className="flex-1 min-w-[220px]">
            <div className="text-sm font-bold" style={{ color: "#FFD166" }}>
              🦀 Not enough crabs for a full team
            </div>
            <div className="text-xs text-white/75">
              You need {5 - player.crabs.length} more crab
              {5 - player.crabs.length === 1 ? "" : "s"} to field a full team
              of 5 (you own {player.crabs.length}).
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <span data-testid="buy-crabs-cta">
              <GlowButton
                variant="gold"
                size="sm"
                onClick={() => setScreen("bazaar")}
              >
                Buy Crabs in Market
              </GlowButton>
            </span>
            <span data-testid="buy-genesis-cta">
              <GlowButton
                variant="ghost"
                size="sm"
                onClick={() => {
                  try {
                    sessionStorage.setItem("crabtopia-bazaar-tab", "genesis");
                  } catch {
                    // storage unavailable — bazaar still opens on Market tab.
                  }
                  setScreen("bazaar");
                }}
              >
                Genesis Collection →
              </GlowButton>
            </span>
          </div>
        </div>
      )}

      {/* Team selector */}
      <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
        {player.teams.map((t) => {
          const active = selectedTeamId === t.id;
          return (
            <button
              key={t.id}
              onClick={() => {
                setSelectedTeamId(t.id);
                setIsRenaming(false);
                setSelectedFormationCrabId(null);
                closePicker();
              }}
              className={`px-3 py-1.5 rounded-lg text-xs whitespace-nowrap border transition-all ${
                active ? "text-white" : "text-white/70 hover:text-white"
              }`}
              style={{
                background: active
                  ? "linear-gradient(135deg, #12A7A0, #0A4A66)"
                  : "rgba(255,255,255,0.05)",
                borderColor: active ? "#7CF5E1" : "rgba(124,245,225,0.18)",
                boxShadow: active ? "0 0 12px rgba(18,167,160,0.4)" : undefined,
              }}
            >
              {t.name} ({t.crabIds.filter(Boolean).length}/{TEAM_SIZE})
            </button>
          );
        })}
      </div>

      {/* Team builder */}
      {team && (
        <GlassPanel className="p-4">
          <div className="flex items-center justify-between mb-3">
            {isRenaming ? (
              <div className="flex items-center gap-1.5 flex-1 mr-2">
                <input
                  type="text"
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  maxLength={24}
                  autoFocus
                  className="flex-1 min-w-0 px-2 py-1 rounded-lg bg-white/10 border border-[#7CF5E1]/40 text-sm font-bold text-white focus:outline-none focus:border-[#7CF5E1]"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      const v = renameValue.trim();
                      if (v) renameTeam(team.id, v);
                      setIsRenaming(false);
                    }
                    if (e.key === "Escape") setIsRenaming(false);
                  }}
                />
                <button
                  type="button"
                  onClick={() => {
                    const v = renameValue.trim();
                    if (v) renameTeam(team.id, v);
                    setIsRenaming(false);
                  }}
                  className="w-7 h-7 flex items-center justify-center rounded-md bg-[#12A7A0]/30 border border-[#7CF5E1]/40 text-[#7CF5E1] hover:bg-[#12A7A0]/50"
                  aria-label="Save team name"
                >
                  <Check className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setIsRenaming(false)}
                  className="w-7 h-7 flex items-center justify-center rounded-md bg-white/5 border border-white/15 text-white/60 hover:text-white"
                  aria-label="Cancel rename"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
                <span className="text-[10px] text-white/50 hidden sm:inline">Save / Cancel</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 min-w-0">
                <div className="font-bold text-sm font-display truncate">{team.name}</div>
                <button
                  type="button"
                  onClick={() => {
                    setRenameValue(team.name);
                    setIsRenaming(true);
                  }}
                  className="w-6 h-6 flex items-center justify-center rounded-md text-white/50 hover:text-[#7CF5E1] hover:bg-white/10 transition-colors shrink-0"
                  aria-label={`Rename team ${team.name}`}
                  title="Rename team"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
            {player.teams.length > 1 && !isRenaming && (
              <button
                onClick={() => {
                  if (confirm("Delete team?")) {
                    deleteTeam(team.id);
                    setSelectedTeamId(player.teams[0]?.id ?? null);
                    closePicker();
                  }
                }}
                className="text-[10px] text-rose-400 hover:underline shrink-0"
              >
                Delete
              </button>
            )}
          </div>

          {/* 5 slots — each is a Radix Popover trigger. A team is always
              exactly 5 slots; legacy short arrays are padded via toTeamSlots. */}
          <div className="grid grid-cols-5 gap-1.5" data-testid="team-slots">
            {[0, 1, 2, 3, 4].map((slot) => {
              const slotId = toTeamSlots(team.crabIds)[slot];
              const crab = slotId
                ? player.crabs.find((c) => c.id === slotId)
                : undefined;
              const occupied = !!crab;
              return (
                <div key={slot} className="relative">
                  <Popover
                    open={pickerSlot === slot}
                    onOpenChange={(o) => setPickerSlot(o ? slot : null)}
                  >
                    {occupied ? (
                      <>
                        <CrabCard crab={crab} compact size={64} onClick={() => {}} />
                        {/* Click-catcher overlay so the whole card opens the swap popover. */}
                        <PopoverTrigger asChild>
                          <button
                            className="absolute inset-0 z-20 rounded-2xl cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7CF5E1]/60"
                            aria-label={`Edit slot ${slot + 1}: ${crab.name}. Click to replace or remove.`}
                          />
                        </PopoverTrigger>
                        {/* Quick-remove (compact, no background). */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            removeCrabFromTeam(team.id, slot);
                            closePicker();
                          }}
                          className="absolute -top-1 -right-1 z-30 w-6 h-6 flex items-center justify-center text-white/40 hover:text-white/80 transition-colors"
                          aria-label="Remove from slot"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </>
                    ) : (
                      <PopoverTrigger asChild>
                        <button
                          className="aspect-square w-full rounded-xl border-2 border-dashed flex flex-col items-center justify-center text-white/40 hover:border-[#7CF5E1] hover:text-[#7CF5E1] hover:shadow-[0_0_16px_rgba(124,245,225,0.30)] hover:bg-[rgba(124,245,225,0.05)] transition-all p-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7CF5E1]/60"
                          style={{ borderColor: "rgba(124,245,225,0.25)" }}
                          aria-label={`Add crab to slot ${slot + 1}`}
                        >
                          {teamCrabs.length === 0 && slot === 0 ? (
                            <>
                              <img
                                src="/art/ui/empty-state.png"
                                alt=""
                                width={64}
                                height={64}
                                draggable={false}
                                className="opacity-70 mb-1"
                              />
                              <span className="text-[10px]">+ Add Crab</span>
                            </>
                          ) : (
                            <>
                              <span className="text-3xl leading-none">+</span>
                              <span className="text-[10px] mt-1">Add Crab</span>
                            </>
                          )}
                        </button>
                      </PopoverTrigger>
                    )}

                    {/* Popover content: list of available crabs (+ remove if occupied). */}
                    <PopoverContent
                      className="w-72 p-2 rounded-xl"
                      align="center"
                      sideOffset={6}
                      style={{
                        background: "#06122B",
                        border: "1px solid rgba(124,245,225,0.2)",
                      }}
                    >
                      <div className="text-[10px] uppercase tracking-wide text-white/55 mb-2 px-1">
                        {occupied ? `Replace ${crab?.name}` : "Pick a crab"}
                      </div>
                      {availableForPicker.length === 0 ? (
                        <div className="text-xs text-white/60 py-2 px-1 text-center">
                          <div className="font-bold text-white/80 mb-0.5">
                            No idle crabs
                          </div>
                          <div className="text-[10px]">
                            All others are busy or already in this team.
                          </div>
                          {player.crabs.length < 5 && (
                            <div className="mt-1.5">
                              <div
                                className="text-[10px] font-bold"
                                style={{ color: "#FFD166" }}
                              >
                                You own only {player.crabs.length} crab
                                {player.crabs.length === 1 ? "" : "s"} — you
                                need {5 - player.crabs.length} more for a full
                                team of 5.
                              </div>
                              <button
                                type="button"
                                className="mt-1 text-[11px] font-bold underline"
                                style={{ color: "#FFD166" }}
                                onClick={() => {
                                  closePicker();
                                  setScreen("bazaar");
                                }}
                              >
                                Buy Crabs in Market →
                              </button>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="space-y-0.5 max-h-56 overflow-y-auto pr-0.5">
                          {availableForPicker.slice(0, 12).map((c) => {
                            const cBp = crabBaseBP(c);
                            return (
                              <button
                                key={c.id}
                                onClick={() => {
                                  addCrabToTeam(team.id, c.id, slot);
                                  closePicker();
                                }}
                                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-white/10 text-left transition-colors"
                              >
                                <CrabRenderer crab={c} size={40} />
                                <div className="flex-1 min-w-0">
                                  <div className="text-xs font-bold truncate">
                                    {c.name}
                                  </div>
                                  <div className="text-[10px] text-white/55 truncate">
                                    {CLASSES[c.classId].name}
                                  </div>
                                </div>
                                <div
                                  className="text-[11px] font-bold flex items-center gap-0.5 shrink-0"
                                  style={{ color: "#FFD166" }}
                                >
                                  <GoldIcon size={10} />
                                  {formatBP(cBp)}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      )}
                      {occupied && (
                        <button
                          onClick={() => {
                            removeCrabFromTeam(team.id, slot);
                            closePicker();
                          }}
                          className="w-full mt-1 pt-2 border-t border-white/10 text-xs text-rose-300 hover:text-rose-200 py-1.5 transition-colors"
                        >
                          Remove from slot
                        </button>
                      )}
                    </PopoverContent>
                  </Popover>
                </div>
              );
            })}
          </div>

          {/* Team stats — equal-width grid using shared StatChip. */}
          <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2">
            <StatChip
              label="Total BP"
              value={formatBP(totalBP)}
              color="#FFD166"
              icon={<GoldIcon size={10} />}
            />
            <StatChip label="Faction Bonus" value={fb.label} />
            <StatChip label="Synergy" value={cs.label} />
            <StatChip
              label="Est. Dive Reward"
              value={`+${diveReward}`}
              color="#FFD166"
              icon={<GoldIcon size={10} />}
            />
          </div>

          {/* Team completeness status: a team only becomes deployable at
              exactly 5/5 unique crabs (validateTeam). */}
          <div className="mt-2 flex justify-end">
            {validateTeam(team.crabIds).valid ? (
              <div className="text-[10px] text-white/60 flex items-center gap-1" data-testid="team-ready">
                <span style={{ color: "#7CF5E1" }}>✓</span> Team auto-saved · Deploy-ready (5/5)
              </div>
            ) : (
              <div className="text-[10px] flex items-center gap-1" style={{ color: "#FFD166" }} data-testid="team-incomplete">
                {teamCrabs.length}/5 slots filled — fill all 5 slots to deploy this team
              </div>
            )}
          </div>

          {/* Formation editor — only for a full 5-crab team */}
          {isFullTeam && currentFormation && (
            <div className="mt-4 pt-3 border-t border-white/10">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <div className="text-xs font-bold font-display">Formation</div>
                <div className="flex items-center gap-2 text-[10px]">
                  <span className="text-white/60">
                    Preset: <span className="font-bold text-white/90">{activePresetLabel}</span>
                  </span>
                  <span
                    className="px-1.5 py-0.5 rounded font-bold"
                    style={{ background: "rgba(124,245,225,0.12)", color: "#7CF5E1" }}
                  >
                    Positioning Bonus +{Math.round(posBonus * 100)}%
                  </span>
                </div>
              </div>

              {/* Preset chips */}
              <div className="flex flex-wrap gap-1.5 mb-3">
                {FORMATION_PRESET_LIST.map((preset) => {
                  const isActive = activePreset === preset.id;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      data-testid={`formation-preset-${preset.id}`}
                      onClick={() => {
                        setTeamFormation(
                          team.id,
                          applyFormationPreset(currentFormation, preset.id),
                          preset.id
                        );
                        setSelectedFormationCrabId(null);
                      }}
                      className="px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all"
                      style={{
                        background: isActive
                          ? "linear-gradient(135deg, #12A7A0, #0A4A66)"
                          : "rgba(255,255,255,0.05)",
                        borderColor: isActive ? "#7CF5E1" : "rgba(124,245,225,0.18)",
                        color: isActive ? "#fff" : "rgba(255,255,255,0.75)",
                        boxShadow: isActive ? "0 0 10px rgba(18,167,160,0.4)" : undefined,
                      }}
                      title={preset.blurb}
                    >
                      {preset.label}
                    </button>
                  );
                })}
                <button
                  type="button"
                  data-testid="formation-preset-custom"
                  disabled
                  className="px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all disabled:cursor-default"
                  style={{
                    background:
                      activePreset === "custom"
                        ? "linear-gradient(135deg, #7A5CFF, #5C7CFF)"
                        : "rgba(255,255,255,0.05)",
                    borderColor:
                      activePreset === "custom" ? "#A78BFA" : "rgba(124,245,225,0.18)",
                    color: activePreset === "custom" ? "#fff" : "rgba(255,255,255,0.55)",
                    opacity: activePreset === "custom" ? 1 : 0.7,
                  }}
                  title="Custom — created by manually moving crabs"
                >
                  Custom
                </button>
              </div>

              <div className="text-[10px] text-white/55 mb-2">
                {selectedFormationCrabId
                  ? "Now click a row to move the selected crab there, or click another crab to swap."
                  : "Click a crab to select it, then click a row or another crab to reposition."}
              </div>

              {/* Formation board: 3 rows/columns */}
              <div data-testid="formation-board" className="grid grid-cols-3 gap-2">
                {ROWS.map((row) => {
                  const rowLabel = row === "front" ? "Front" : row === "mid" ? "Mid" : "Back";
                  const rowIds = currentFormation[row];
                  return (
                    <div
                      key={row}
                      onClick={() => handleFormationRowClick(row)}
                      className="rounded-xl p-2 border min-h-[96px] transition-colors cursor-pointer"
                      style={{
                        background: "rgba(10,27,61,0.45)",
                        borderColor: selectedFormationCrabId
                          ? "rgba(124,245,225,0.45)"
                          : "rgba(124,245,225,0.16)",
                      }}
                      data-testid={`formation-row-${row}`}
                    >
                      <div className="text-[10px] uppercase tracking-wide font-bold text-white/60 mb-1.5 flex items-center justify-between">
                        <span>{rowLabel}</span>
                        <span className="text-white/35 normal-case font-normal">{rowIds.length}</span>
                      </div>
                      <div className="space-y-1.5">
                        {rowIds.length === 0 && (
                          <div className="text-[10px] text-white/35 py-2 text-center">Empty</div>
                        )}
                        {rowIds.map((crabId) => {
                          const crab = teamCrabs.find((c) => c.id === crabId);
                          if (!crab) return null;
                          const isSel = selectedFormationCrabId === crabId;
                          return (
                            <button
                              key={crabId}
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleFormationCrabClick(crabId);
                              }}
                              className="w-full flex items-center gap-1.5 rounded-lg px-1.5 py-1 text-left border transition-all"
                              style={{
                                background: isSel ? "rgba(124,245,225,0.18)" : "rgba(0,0,0,0.3)",
                                borderColor: isSel ? "#7CF5E1" : "rgba(255,255,255,0.08)",
                                boxShadow: isSel ? "0 0 10px rgba(124,245,225,0.35)" : undefined,
                              }}
                            >
                              <CrabRenderer crab={crab} size={40} />
                              <span className="min-w-0">
                                <span className="block text-[11px] font-bold truncate">{crab.name}</span>
                                <span className="block text-[9px] text-white/55 truncate">
                                  {CLASSES[crab.classId].name}
                                </span>
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </GlassPanel>
      )}

      {/* Available crabs (inventory minus team members). */}
      <section>
        <SectionTitle
          title={`Available Crabs (${availableInventory.length})`}
          icon={<span>🦀</span>}
        />
        {availableInventory.length === 0 ? (
          <EmptyState
            message="No other crabs available"
            hint="All your crabs are already in this team. Breed or hire more to expand your roster."
            cta={
              <div className="flex gap-2 justify-center flex-wrap">
                <GlowButton variant="teal" size="sm" onClick={() => setScreen("nursery")}>
                  Go to Nursery →
                </GlowButton>
                <GlowButton variant="gold" size="sm" onClick={() => setScreen("hall")}>
                  Hire at Hall →
                </GlowButton>
              </div>
            }
          />
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
            {availableInventory.map((c) => (
              <CrabCard key={c.id} crab={c} compact size={88} />
            ))}
          </div>
        )}
      </section>

      {/* Tips panel — fills lower space + teaches synergy rules. */}
      <GlassPanel className="p-4">
        <div className="text-xs font-bold text-white/80 mb-2 flex items-center gap-1.5 font-display">
          <span>💡</span> Team-Building Tips
        </div>
        <ul className="space-y-1.5 text-[11px] text-white/70 leading-relaxed">
          <li>
            • Same-faction pair unlocks a faction bonus. Triple same-faction = stronger bonus.
          </li>
          <li>
            • Two distinct classes grant a Paired synergy; three distinct classes grant Diverse.
          </li>
          <li>
            • Stacking one class gives a Specialist bonus — high raw output, but predictable.
          </li>
        </ul>
      </GlassPanel>

      {/* Create team modal */}
      {showCreate && (
        <Modal title="Create New Team" onClose={() => setShowCreate(false)}>
          <div className="space-y-3">
            <div className="text-xs opacity-70">
              {player.teams.length < 5
                ? "Free slot available."
                : `Extra slot cost: ${
                    [50000, 120000][player.teams.length - 5]
                  } GOLD`}
            </div>
            <input
              type="text"
              value={newTeamName}
              onChange={(e) => setNewTeamName(e.target.value)}
              placeholder="Team name..."
              maxLength={20}
              className="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white placeholder-white/40 focus:outline-none focus:border-[#7CF5E1]"
              autoFocus
            />
            <GlowButton
              variant="teal"
              size="md"
              className="w-full"
              onClick={() => {
                const id = createTeam(newTeamName || `Team ${player.teams.length + 1}`);
                if (id) {
                  setSelectedTeamId(id);
                  setNewTeamName("");
                  setShowCreate(false);
                }
              }}
            >
              Create
            </GlowButton>
          </div>
        </Modal>
      )}
    </div>
  );
}
