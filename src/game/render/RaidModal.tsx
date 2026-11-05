// Crabtopia - Raid Launcher Modal with tactic cards, formation, reinforcements
"use client";

import { useState, useEffect } from "react";
import { useGame, NPC_CRAB_CACHE } from "../store/gameStore";
import { resolveTeamFormation } from "../engine/formation";
import { FACTIONS } from "../content/factions";
import { CLASSES } from "../content/classes";
import { TACTIC_CARDS } from "../engine/battle";
import { crabBaseBP, teamBP, formatBP } from "../engine/bp";
import { formatGold, formatTime } from "./ui";
import { CONFIG } from "../engine/config";
import { TacticCardId, Crab, Formation } from "../types";
import CrabRenderer from "./CrabRenderer";
import CrabCard from "./CrabCard";
import { Modal } from "./Modal";

interface Props {
  siteId: string;
  onClose: () => void;
}

export default function RaidModal({ siteId, onClose }: Props) {
  const player = useGame((s) => s.player)!;
  const worldSites = useGame((s) => s.worldSites);
  const hallListings = useGame((s) => s.hallListings);
  const launchRaid = useGame((s) => s.launchRaid);
  const setScreen = useGame((s) => s.setScreen);

  const fullTeams = player.teams.filter((t) => t.crabIds.filter(Boolean).length === 5);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(fullTeams[0]?.id ?? null);
  const [tacticCard, setTacticCard] = useState<TacticCardId>("ambush");
  const [formation, setFormation] = useState<Formation>({ front: [], mid: [], back: [] });
  const [reinforcements, setReinforcements] = useState<string[]>([]);
  const [step, setStep] = useState<1 | 2>(1);

  // When the selected team changes, initialise the local raid formation
  // from the team's saved formation (player can still edit it locally).
  useEffect(() => {
    if (!selectedTeamId) {
      setFormation({ front: [], mid: [], back: [] });
      return;
    }
    const t = player.teams.find((x) => x.id === selectedTeamId);
    if (!t) {
      setFormation({ front: [], mid: [], back: [] });
      return;
    }
    const filled = t.crabIds.filter(Boolean).length;
    if (filled === 5) {
      setFormation(resolveTeamFormation(t));
    } else {
      setFormation({ front: [], mid: [], back: [] });
    }
    // player.teams is read for the current team object; selectedTeamId is the trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTeamId]);

  const site = worldSites.find((s) => s.id === siteId);
  if (!site) return null;
  const faction = FACTIONS[site.biome];

  const team = player.teams.find((t) => t.id === selectedTeamId);
  const teamCrabs = (team?.crabIds ?? []).map((id) => player.crabs.find((c) => c.id === id)).filter(Boolean) as Crab[];

  // idle crabs not on the team (potential reinforcements)
  const idleCrabs = player.crabs.filter((c) => c.activity === "idle" && !team?.crabIds.includes(c.id));

  // hall listings available for hire (as reinforcements)
  const availableHire = hallListings.slice(0, 8);

  const defenderBP = site.bpBracket * 100; // rough estimate
  const raiderBP = teamCrabs.length === 5 ? teamBP(teamCrabs, [], 1).total : 0;

  // BP bracket check (+/- 25%)
  const bpMatchOk = teamCrabs.length === 5 && Math.abs(raiderBP - defenderBP) <= defenderBP * 0.5;

  const handleToggleReinforcement = (id: string) => {
    setReinforcements((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= CONFIG.maxReinforcements) return prev;
      return [...prev, id];
    });
  };

  const handleLaunch = () => {
    if (!team || teamCrabs.length !== 5) return;
    const result = launchRaid(
      siteId,
      team.id,
      team.crabIds.filter(Boolean),
      tacticCard,
      formation,
      reinforcements
    );
    if (result) {
      onClose();
      setScreen("home");
    }
  };

  if (step === 1) {
    return (
      <Modal title={`⚔️ Launch Raid on ${site.name}`} onClose={onClose} maxWidth="max-w-lg">
        <div className="space-y-3">
          {/* Site info */}
          <div className="bg-white/5 rounded-lg p-2 text-xs">
            <div className="flex justify-between">
              <span>Occupied by:</span>
              <span className="font-bold">{site.occupierName}</span>
            </div>
            <div className="flex justify-between">
              <span>Reward to steal:</span>
              <span className="font-bold" style={{ color: "#FFD166" }}>💰 {Math.round(site.rewardRemaining * CONFIG.raidStealPercent)}</span>
            </div>
            <div className="flex justify-between">
              <span>Participation reward:</span>
              <span className="font-bold">💰 {Math.round(site.baseReward * CONFIG.raidParticipationPercent)}</span>
            </div>
            <div className="flex justify-between">
              <span>Defender BP bracket:</span>
              <span className="font-bold">~{defenderBP}</span>
            </div>
          </div>

          {/* Team selection */}
          <div>
            <div className="text-xs font-bold opacity-80 mb-1">1. Pick Raider Team</div>
            {fullTeams.length === 0 ? (
              <div className="text-xs opacity-60 bg-white/5 rounded p-2">
                No full teams. <button onClick={() => { onClose(); setScreen("teams"); }} className="text-[#7CF5E1] underline">Build a team</button>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-1">
                {fullTeams.map((t) => {
                  const crabs = t.crabIds.map((id) => player.crabs.find((c) => c.id === id)).filter(Boolean) as Crab[];
                  const bp = crabs.reduce((sum, c) => sum + crabBaseBP(c), 0);
                  const allIdle = crabs.every((c) => c?.activity === "idle");
                  return (
                    <button
                      key={t.id}
                      onClick={() => allIdle && setSelectedTeamId(t.id)}
                      disabled={!allIdle}
                      className={`rounded-lg p-2 text-left border transition-colors ${
                        selectedTeamId === t.id ? "bg-[#12A7A0]/20 border-[#12A7A0]" : "bg-white/5 border-white/10"
                      } ${!allIdle ? "opacity-50" : ""}`}
                    >
                      <div className="flex justify-between text-xs">
                        <span className="font-bold">{t.name}</span>
                        <span>BP {formatBP(bp)}</span>
                      </div>
                      {!allIdle && <div className="text-[10px] text-rose-400">Some crabs busy</div>}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Tactic card */}
          <div>
            <div className="text-xs font-bold opacity-80 mb-1">2. Tactic Card</div>
            <div className="grid grid-cols-3 gap-1">
              {Object.entries(TACTIC_CARDS).map(([id, card]) => (
                <button
                  key={id}
                  onClick={() => setTacticCard(id as TacticCardId)}
                  className={`rounded-lg p-2 text-left border text-[10px] transition-colors ${
                    tacticCard === id ? "bg-[#FF6F91]/20 border-[#FF6F91]" : "bg-white/5 border-white/10"
                  }`}
                >
                  <div className="font-bold">{card.name}</div>
                  <div className="opacity-70 mt-0.5">{card.description}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Formation */}
          <div>
            <div className="text-xs font-bold opacity-80 mb-1">3. Formation (optional)</div>
            <div className="grid grid-cols-3 gap-1">
              {(["front", "mid", "back"] as const).map((pos) => (
                <div key={pos} className="bg-white/5 rounded-lg p-2 border border-white/10">
                  <div className="text-[10px] uppercase opacity-70 mb-1">{pos}</div>
                  <div className="space-y-1 min-h-[40px]">
                    {teamCrabs.filter((c) => formation[pos].includes(c.id)).map((c) => (
                      <div key={c.id} className="text-[10px] bg-black/30 rounded px-1 py-0.5 flex justify-between">
                        <span className="truncate">{c.name}</span>
                        <button onClick={() => setFormation((f) => ({ ...f, [pos]: f[pos].filter((x) => x !== c.id) }))}>✕</button>
                      </div>
                    ))}
                    {teamCrabs.filter((c) => !formation.front.includes(c.id) && !formation.mid.includes(c.id) && !formation.back.includes(c.id)).map((c) => (
                      <button
                        key={c.id}
                        onClick={() => setFormation((f) => ({ ...f, [pos]: [...f[pos], c.id] }))}
                        className="text-[10px] w-full text-left opacity-60 hover:opacity-100"
                      >
                        + {c.name}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="text-[10px] opacity-60 mt-1">
              Bulwark in front: +4% BP. Tidecaller/Shellmender in back: +3% BP.
            </div>
          </div>

          {/* BP preview */}
          {teamCrabs.length === 5 && (
            <div className="bg-white/5 rounded-lg p-2 text-xs">
              <div className="flex justify-between">
                <span>Your BP:</span>
                <span className="font-bold" style={{ color: bpMatchOk ? "#4FB477" : "#FF6F91" }}>{formatBP(raiderBP)} {bpMatchOk ? "✓ in bracket" : "⚠ outside bracket"}</span>
              </div>
              <div className="flex justify-between">
                <span>Defender BP estimate:</span>
                <span>~{defenderBP}</span>
              </div>
            </div>
          )}

          <button
            onClick={() => setStep(2)}
            disabled={!team || teamCrabs.length !== 5 || !bpMatchOk}
            className="w-full px-4 py-2 rounded-lg font-bold disabled:opacity-50"
            style={{ background: "linear-gradient(135deg, #12A7A0, #0A4A66)", color: "white" }}
          >
            Next: Reinforcements →
          </button>
        </div>
      </Modal>
    );
  }

  // Step 2: reinforcements
  return (
    <Modal title="Reinforcements (optional)" onClose={onClose} maxWidth="max-w-lg">
      <div className="space-y-3">
        <div className="text-xs opacity-70">
          Add up to {CONFIG.maxReinforcements} reinforcements from your idle crabs or hire from Driftwood Hall.
          Reinforcements join the fight then return unharmed.
        </div>

        {/* Your idle crabs */}
        <div>
          <div className="text-xs font-bold opacity-80 mb-1">Your Idle Crabs</div>
          {idleCrabs.length === 0 ? (
            <div className="text-[10px] opacity-50 bg-white/5 rounded p-2">No idle crabs available.</div>
          ) : (
            <div className="grid grid-cols-3 gap-1">
              {idleCrabs.slice(0, 9).map((c) => (
                <button
                  key={c.id}
                  onClick={() => handleToggleReinforcement(c.id)}
                  className={`rounded-lg p-1 border transition-colors ${
                    reinforcements.includes(c.id) ? "bg-[#12A7A0]/20 border-[#12A7A0]" : "bg-white/5 border-white/10"
                  }`}
                >
                  <CrabRenderer crab={c} size={56} animate={false} />
                  <div className="text-[9px] truncate">{c.name}</div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Hire from hall */}
        <div>
          <div className="text-xs font-bold opacity-80 mb-1">Hire from Driftwood Hall</div>
          {availableHire.length === 0 ? (
            <div className="text-[10px] opacity-50 bg-white/5 rounded p-2">No mercenaries available.</div>
          ) : (
            <div className="grid grid-cols-3 gap-1">
              {availableHire.map((l) => {
                const crab = NPC_CRAB_CACHE[l.crabId];
                if (!crab) return null;
                const selected = reinforcements.includes(l.crabId);
                return (
                  <button
                    key={l.id}
                    onClick={() => handleToggleReinforcement(l.crabId)}
                    className={`rounded-lg p-1 border transition-colors ${
                      selected ? "bg-[#FFD166]/20 border-[#FFD166]" : "bg-white/5 border-white/10"
                    }`}
                  >
                    <CrabRenderer crab={crab} size={56} animate={false} />
                    <div className="text-[9px] truncate">{crab.name}</div>
                    <div className="text-[9px]" style={{ color: "#FFD166" }}>💰 {l.hireFee}</div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="bg-white/5 rounded-lg p-2 text-xs">
          <div className="flex justify-between">
            <span>Selected reinforcements:</span>
            <span className="font-bold">{reinforcements.length}/{CONFIG.maxReinforcements}</span>
          </div>
          <div className="flex justify-between mt-1">
            <span>Hire cost:</span>
            <span style={{ color: "#FFD166" }}>
              💰 {reinforcements.reduce((sum, id) => {
                const l = hallListings.find((x) => x.crabId === id);
                return sum + (l?.hireFee ?? 0);
              }, 0)}
            </span>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => setStep(1)}
            className="flex-1 px-4 py-2 rounded-lg font-bold bg-white/10 hover:bg-white/20"
          >
            ← Back
          </button>
          <button
            onClick={handleLaunch}
            disabled={player.raidEnergy <= 0}
            className="flex-1 px-4 py-2 rounded-lg font-bold disabled:opacity-50"
            style={{ background: "linear-gradient(135deg, #FF6F91, #C026D3)", color: "white" }}
          >
            ⚔️ Launch Raid ({player.raidEnergy}⚡)
          </button>
        </div>
      </div>
    </Modal>
  );
}
