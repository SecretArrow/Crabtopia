// Crabtopia - Dive Map screen (dig sites + raids)
"use client";

import { useState, useEffect, useMemo } from "react";
import { useGame } from "../../store/gameStore";
import { FACTIONS } from "../../content/factions";
import {
  formatTime,
  GoldIcon,
  GlowButton,
  GradientCard,
  FactionBadge,
  EmptyState,
  FACTION_EMBLEM_ART,
  StatChip,
  PlanktonField,
} from "../ui";
import { CONFIG, STAMINA_COSTS } from "../../engine/config";
import RaidModal from "../RaidModal";
import TeamSelect from "../TeamSelect";
import { Modal } from "../Modal";
import type { DigSite } from "../../types";

type Filter = "all" | "free" | "occupied" | "mine";

// State -> color + inner glyph for map pins.
function pinVisualFor(site: DigSite): {
  ring: string;
  border: string;
  glyph: string;
} {
  const isPlayer = site.ownerIsPlayer;
  const isCompleted = site.state === "completed";
  const isRaidable =
    !!site.occupiedBy && !isPlayer && site.raidCount < 2 && site.state === "deployed";
  if (isCompleted) return { ring: "#4FB477", border: "#FFFFFF", glyph: "✓" };
  if (isPlayer) return { ring: "#FFD166", border: "#FFFFFF", glyph: "🦀" };
  if (isRaidable) return { ring: "#C026D3", border: "#FFFFFF", glyph: "⚔️" };
  return { ring: "#7CF5E1", border: "#FFFFFF", glyph: "+" };
}

export default function MapScreen() {
  const worldSites = useGame((s) => s.worldSites);
  const player = useGame((s) => s.player)!;
  const claimDive = useGame((s) => s.claimDive);
  const retreatDive = useGame((s) => s.retreatDive);
  const refreshWorld = useGame((s) => s.refreshWorld);
  const setScreen = useGame((s) => s.setScreen);

  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null);
  const [showDeploy, setShowDeploy] = useState<string | null>(null);
  const [showRaid, setShowRaid] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");

  // tick for timer refresh
  const [, setTick] = useState(0);
  useEffect(() => {
    const i = setInterval(() => {
      setTick((t) => t + 1);
      refreshWorld();
    }, 1000);
    return () => clearInterval(i);
  }, [refreshWorld]);

  // Counts for inline summary next to filter tabs.
  const summary = useMemo(() => {
    let free = 0;
    let occupied = 0;
    let mine = 0;
    for (const s of worldSites) {
      if (s.ownerIsPlayer) mine++;
      else if (s.occupiedBy) occupied++;
      else free++;
    }
    return { free, occupied, mine };
  }, [worldSites]);

  // Sorted & filtered
  const filteredSites = useMemo(() => {
    let list = worldSites.slice();
    if (filter === "free") list = list.filter((s) => !s.occupiedBy);
    if (filter === "occupied") list = list.filter((s) => s.occupiedBy);
    if (filter === "mine") list = list.filter((s) => s.ownerIsPlayer);
    return list.sort((a, b) => b.rewardRemaining - a.rewardRemaining);
  }, [worldSites, filter]);

  const selectedSite = worldSites.find((s) => s.id === selectedSiteId);

  return (
    <div className="flex flex-col max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="min-w-0">
          <h1 className="text-xl md:text-2xl font-bold font-display">Dive Map</h1>
          <p className="text-xs opacity-70">Send teams on dives · Raid rival sites</p>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <StatChip
            label="Gold"
            value={Math.round(player.gold).toLocaleString()}
            color="#FFD166"
            icon={<GoldIcon size={14} />}
          />
          <StatChip
            label="XP"
            value={`${player.shellwardenXp.toLocaleString()} XP`}
            color="#7CF5E1"
            icon={
              <span aria-hidden className="text-[12px] leading-none">⭐</span>
            }
          />
          <GlowButton variant="teal" size="sm" onClick={() => setScreen("teams")}>
            Manage Teams →
          </GlowButton>
        </div>
      </div>

      {/* Map illustration (hero) */}
      <div
        className="relative rounded-2xl overflow-hidden mb-3"
        style={{
          aspectRatio: "16/10",
          background: "linear-gradient(180deg, #0A4A66 0%, #06122B 100%)",
          border: "1px solid rgba(124,245,225,0.18)",
        }}
      >
        {/* dive-map.png backdrop */}
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: "url(/art/dive-map.png)", opacity: 0.35 }}
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(180deg, rgba(10,74,102,0.35) 0%, rgba(6,18,43,0.7) 100%)",
          }}
        />

        {/* Ambient decorative props: drifting plankton + 3 glow circles */}
        <PlanktonField count={14} />
        <div
          aria-hidden
          className="absolute rounded-full pointer-events-none"
          style={{
            left: "12%",
            top: "62%",
            width: "120px",
            height: "120px",
            background:
              "radial-gradient(circle, rgba(124,245,225,0.18), transparent 70%)",
          }}
        />
        <div
          aria-hidden
          className="absolute rounded-full pointer-events-none"
          style={{
            left: "70%",
            top: "70%",
            width: "160px",
            height: "160px",
            background:
              "radial-gradient(circle, rgba(255,209,102,0.16), transparent 70%)",
          }}
        />
        <div
          aria-hidden
          className="absolute rounded-full pointer-events-none"
          style={{
            left: "82%",
            top: "32%",
            width: "90px",
            height: "90px",
            background:
              "radial-gradient(circle, rgba(255,111,145,0.14), transparent 70%)",
          }}
        />

        {/* Legend overlay (top-left) */}
        <div className="absolute top-2 left-2 z-20 flex flex-wrap gap-x-3 gap-y-1 text-[9px] font-bold bg-black/50 backdrop-blur-sm rounded-lg px-2 py-1.5 border border-white/10">
          <span className="flex items-center gap-1"><span style={{ color: "#7CF5E1" }}>●</span> Free</span>
          <span className="flex items-center gap-1"><span style={{ color: "#FFD166" }}>●</span> Yours</span>
          <span className="flex items-center gap-1"><span style={{ color: "#C026D3" }}>●</span> Raidable</span>
          <span className="flex items-center gap-1"><span style={{ color: "#4FB477" }}>●</span> Ready</span>
        </div>

        {/* "Your Burrow" home badge pin (bottom-right corner marker) */}
        <div
          aria-hidden
          className="absolute z-20"
          style={{ left: "calc(100% - 56px)", top: "calc(100% - 56px)" }}
        >
          <div
            className="absolute rounded-full -translate-x-1/2 -translate-y-1/2 animate-pulse"
            style={{
              width: 40,
              height: 40,
              background:
                "radial-gradient(circle, rgba(124,245,225,0.45), transparent 70%)",
            }}
          />
          <div
            className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center"
          >
            <div
              className="rounded-full flex items-center justify-center"
              style={{
                width: 28,
                height: 28,
                background: "linear-gradient(135deg, #12A7A0, #0A4A66)",
                border: "2px solid #7CF5E1",
                boxShadow: "0 0 10px rgba(124,245,225,0.6)",
                fontSize: 13,
              }}
            >
              🏠
            </div>
            <div
              className="mt-1 whitespace-nowrap text-[10px] bg-black/70 px-1.5 py-0.5 rounded font-bold"
            >
              Your Burrow
            </div>
          </div>
        </div>

        {/* dig site pins */}
        {worldSites.map((site) => {
          const f = FACTIONS[site.biome];
          const isPlayer = site.ownerIsPlayer;
          const elapsed = site.deployTime ? Date.now() - site.deployTime : 0;
          const remaining = Math.max(0, site.durationMs - elapsed);
          const progress = site.deployTime ? Math.min(1, elapsed / site.durationMs) : 0;
          const isCompleted = site.state === "completed";
          const isRaidable =
            !!site.occupiedBy && !isPlayer && site.raidCount < 2 && site.state === "deployed";

          const visual = pinVisualFor(site);

          return (
            <button
              key={site.id}
              onClick={() => setSelectedSiteId(site.id)}
              className="absolute flex flex-col items-center group focus:outline-none"
              style={{
                left: `${site.pos.x * 100}%`,
                top: `${site.pos.y * 100}%`,
                transform: "translate(-50%, -50%)",
              }}
              aria-label={`Site ${site.name}`}
            >
              {/* glow ring */}
              <div
                className="absolute rounded-full animate-pulse pointer-events-none"
                style={{
                  width: isCompleted ? "72px" : "56px",
                  height: isCompleted ? "72px" : "56px",
                  background: `radial-gradient(circle, ${visual.ring}aa, transparent)`,
                  top: "50%",
                  left: "50%",
                  transform: "translate(-50%, -50%)",
                }}
              />
              {/* Pin: larger state-coded marker with inner glyph.
                  36px on desktop, 28px on mobile (via Tailwind sizing). */}
              <div className="relative z-10">
                <div
                  className="hidden md:flex items-center justify-center rounded-full transition-transform group-hover:scale-110"
                  style={{
                    width: 36,
                    height: 36,
                    background: `${visual.ring}22`,
                    border: `2px solid ${visual.ring}`,
                    boxShadow: isRaidable
                      ? `0 0 14px ${visual.ring}`
                      : `0 2px 8px rgba(0,0,0,0.5)`,
                    fontSize: 14,
                    lineHeight: 1,
                  }}
                >
                  {/* faction emblem backdrop (kept for biome identification) */}
                  <img
                    src={FACTION_EMBLEM_ART[site.biome]}
                    alt={f.shortName}
                    width={28}
                    height={28}
                    className="absolute rounded-full object-contain opacity-70"
                    draggable={false}
                  />
                  {/* inner state glyph */}
                  <span
                    className="relative z-10 font-bold"
                    style={{
                      color: visual.ring === "#FFD166" ? "#0A1B3D" : "#FFFFFF",
                      textShadow: "0 1px 2px rgba(0,0,0,0.8)",
                      fontSize: 14,
                      lineHeight: 1,
                    }}
                  >
                    {visual.glyph}
                  </span>
                </div>
                {/* Mobile variant: 28px */}
                <div
                  className="flex md:hidden items-center justify-center rounded-full transition-transform group-hover:scale-110"
                  style={{
                    width: 28,
                    height: 28,
                    background: `${visual.ring}22`,
                    border: `2px solid ${visual.ring}`,
                    boxShadow: isRaidable
                      ? `0 0 12px ${visual.ring}`
                      : `0 2px 6px rgba(0,0,0,0.5)`,
                  }}
                >
                  <span
                    className="font-bold"
                    style={{
                      color: visual.ring === "#FFD166" ? "#0A1B3D" : "#FFFFFF",
                      textShadow: "0 1px 2px rgba(0,0,0,0.8)",
                      fontSize: 14,
                      lineHeight: 1,
                    }}
                  >
                    {visual.glyph}
                  </span>
                </div>
              </div>
              {/* label below pin */}
              <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 whitespace-nowrap text-[10px] bg-black/70 px-1.5 py-0.5 rounded font-bold">
                {isCompleted && "💰 "}
                {isRaidable && "⚔️ "}
                {isPlayer && "🟢 "}
                {site.name}
              </div>
              {/* progress bar for occupied */}
              {site.deployTime && site.state === "deployed" && (
                <div className="absolute top-full left-1/2 -translate-x-1/2 mt-5 w-14 h-1 bg-black/60 rounded-full overflow-hidden">
                  <div
                    className="h-full"
                    style={{ width: `${progress * 100}%`, background: f.colors.accent }}
                  />
                </div>
              )}
              {isCompleted && (
                <div className="absolute top-full left-1/2 -translate-x-1/2 mt-5 text-[10px] opacity-80">
                  {formatTime(remaining)}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Sticky filter bar with inline summary */}
      <div
        className="sticky top-0 z-10 -mx-1 px-1 py-2 flex items-center gap-2 flex-wrap rounded-xl"
        style={{
          background: "rgba(6,18,43,0.92)",
          backdropFilter: "blur(8px)",
          borderTop: "1px solid rgba(124,245,225,0.14)",
          borderBottom: "1px solid rgba(124,245,225,0.14)",
        }}
      >
        <div
          className="flex gap-1 p-1 rounded-xl overflow-x-auto no-scrollbar"
          style={{
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(124,245,225,0.14)",
          }}
        >
          {([
            { id: "all", label: "All" },
            { id: "free", label: "Free" },
            { id: "occupied", label: "Occupied" },
            { id: "mine", label: "Mine" },
          ] as { id: Filter; label: string }[]).map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${
                filter === f.id ? "text-white" : "text-white/60 hover:text-white"
              }`}
              style={{
                background: filter === f.id ? "linear-gradient(135deg, #12A7A0, #0A4A66)" : "transparent",
                boxShadow: filter === f.id ? "0 0 12px rgba(18,167,160,0.4)" : undefined,
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
        <span
          className="text-[10px] opacity-70 whitespace-nowrap font-semibold"
          aria-live="polite"
        >
          {summary.free} free · {summary.occupied} occupied · {summary.mine} yours
        </span>
      </div>

      {/* Site detail panel */}
      {selectedSite && (
        <div className="mt-3">
          <SiteDetailPanel
            site={selectedSite}
            onClose={() => setSelectedSiteId(null)}
            onDeploy={() => setShowDeploy(selectedSite.id)}
            onRaid={() => setShowRaid(selectedSite.id)}
            onClaim={() => claimDive(selectedSite.id)}
            onRetreat={() => retreatDive(selectedSite.id)}
          />
        </div>
      )}

      {showDeploy && <DeployModal siteId={showDeploy} onClose={() => setShowDeploy(null)} />}
      {showRaid && <RaidModal siteId={showRaid} onClose={() => setShowRaid(null)} />}

      {/* Sites list (scrollable grid) */}
      <div className="mt-3 flex flex-col min-h-0">
        <h2 className="text-sm font-bold mb-2 opacity-80 font-display">All Sites</h2>
        {filteredSites.length === 0 ? (
          <EmptyState message="No sites match" hint="Try a different filter." />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 overflow-y-auto max-h-[60vh] pr-1 pb-4 custom-scroll">
            {filteredSites.map((s) => (
              <SiteListCard
                key={s.id}
                site={s}
                onClick={() => setSelectedSiteId(s.id)}
                onDeploy={() => setShowDeploy(s.id)}
                onRaid={() => setShowRaid(s.id)}
                onClaim={() => claimDive(s.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Inline custom scrollbar styling (scoped) */}
      <style jsx>{`
        .custom-scroll::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scroll::-webkit-scrollbar-track {
          background: rgba(255, 255, 255, 0.04);
          border-radius: 3px;
        }
        .custom-scroll::-webkit-scrollbar-thumb {
          background: rgba(124, 245, 225, 0.35);
          border-radius: 3px;
        }
        .custom-scroll::-webkit-scrollbar-thumb:hover {
          background: rgba(124, 245, 225, 0.55);
        }
      `}</style>
    </div>
  );
}

// ---------- Sub-components ----------

function SiteListCard({
  site,
  onClick,
  onDeploy,
  onRaid,
  onClaim,
}: {
  site: DigSite;
  onClick: () => void;
  onDeploy: () => void;
  onRaid: () => void;
  onClaim: () => void;
}) {
  const f = FACTIONS[site.biome];
  const isPlayer = site.ownerIsPlayer;
  const elapsed = site.deployTime ? Date.now() - site.deployTime : 0;
  const remaining = Math.max(0, site.durationMs - elapsed);
  const isCompleted = site.state === "completed";
  const isRaidable = !!site.occupiedBy && !isPlayer && site.raidCount < 2 && site.state === "deployed";

  const stateBadge = isPlayer
    ? { label: "Yours", color: "#7CF5E1" }
    : isRaidable
    ? { label: "Raidable", color: "#FF6F91" }
    : site.occupiedBy
    ? { label: "Occupied", color: "#FFD166" }
    : { label: "Free", color: "#12A7A0" };

  return (
    <GradientCard faction={site.biome} className="p-3">
      <div className="flex items-center gap-3 cursor-pointer" onClick={onClick}>
        <FactionBadge faction={site.biome} size={32} glow={isRaidable || isPlayer} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-bold text-sm truncate font-display" style={{ color: f.colors.light }}>
              {site.name}
            </span>
            <span
              className="text-[9px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wide"
              style={{ background: stateBadge.color + "22", color: stateBadge.color }}
            >
              {stateBadge.label}
            </span>
          </div>
          <div className="text-[10px] opacity-70">{f.shortName} biome · BP bracket {site.bpBracket}</div>
          <div className="text-[10px] mt-0.5 flex items-center gap-1" style={{ color: "#FFD166" }}>
            <GoldIcon size={11} />
            {Math.round(site.rewardRemaining)}
            {site.occupiedBy && site.state === "deployed" && (
              <span className="opacity-60 ml-1">· {formatTime(remaining)}</span>
            )}
            {site.occupiedBy && !isPlayer && (
              <span className="opacity-60 ml-1">· by {site.occupierName}</span>
            )}
          </div>
        </div>
        <span className="opacity-50 text-xs">›</span>
      </div>

      {/* Action button */}
      <div className="mt-2 flex justify-end">
        {!site.occupiedBy && (
          <GlowButton variant="teal" size="sm" onClick={onDeploy}>
            Deploy here
          </GlowButton>
        )}
        {isPlayer && isCompleted && (
          <GlowButton variant="gold" size="sm" onClick={onClaim}>
            Claim {Math.round(site.rewardRemaining)}
          </GlowButton>
        )}
        {isRaidable && (
          <GlowButton variant="rose" size="sm" onClick={onRaid}>
            Raid!
          </GlowButton>
        )}
      </div>
    </GradientCard>
  );
}

function SiteDetailPanel({ site, onClose, onDeploy, onRaid, onClaim, onRetreat }: {
  site: DigSite;
  onClose: () => void;
  onDeploy: () => void;
  onRaid: () => void;
  onClaim: () => void;
  onRetreat: () => void;
}) {
  const f = FACTIONS[site.biome];
  const elapsed = site.deployTime ? Date.now() - site.deployTime : 0;
  const remaining = Math.max(0, site.durationMs - elapsed);
  const progress = site.deployTime ? Math.min(1, elapsed / site.durationMs) : 0;
  const isCompleted = site.state === "completed";
  const isPlayer = site.ownerIsPlayer;
  const isRaidable = !!site.occupiedBy && !isPlayer && site.raidCount < 2 && site.state === "deployed";

  return (
    <div className="rounded-2xl p-4 border-2" style={{ borderColor: f.colors.primary + "55", background: `linear-gradient(135deg, ${f.colors.dark}cc, ${f.colors.primary}22)` }}>
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <FactionBadge faction={site.biome} size={36} glow />
          <div>
            <div className="text-[10px] opacity-70 uppercase tracking-wide">{f.name} biome</div>
            <div className="text-lg font-bold font-display" style={{ color: f.colors.accent }}>{site.name}</div>
          </div>
        </div>
        <button onClick={onClose} className="text-white/60 hover:text-white">✕</button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-3 text-xs">
        <StatBox label="Base Reward" value={site.baseReward} gold />
        <StatBox label="Remaining" value={Math.round(site.rewardRemaining)} gold />
        <StatBox label="BP Bracket" value={site.bpBracket} />
        <StatBox label="Raids" value={`${site.raidCount}/2`} />
      </div>

      {site.deployTime && (
        <div className="mt-3">
          <div className="flex justify-between text-[10px] opacity-70 mb-1">
            <span>Dive progress</span>
            <span>{isCompleted ? "Complete!" : formatTime(remaining)}</span>
          </div>
          <div className="h-2 bg-black/40 rounded-full overflow-hidden">
            <div className="h-full transition-all" style={{ width: `${progress * 100}%`, background: f.colors.accent }} />
          </div>
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {!site.occupiedBy && (
          <GlowButton variant="teal" onClick={onDeploy}>⛏️ Deploy Team</GlowButton>
        )}
        {isPlayer && isCompleted && (
          <GlowButton variant="gold" onClick={onClaim}>Claim {Math.round(site.rewardRemaining)}</GlowButton>
        )}
        {isPlayer && site.state === "deployed" && (
          <GlowButton variant="ghost" onClick={onRetreat}>🏳️ Retreat</GlowButton>
        )}
        {isRaidable && (
          <GlowButton variant="rose" onClick={onRaid}>⚔️ Launch Raid</GlowButton>
        )}
        {site.occupiedBy && !isPlayer && (
          <div className="text-[10px] opacity-70 self-center">Occupied by {site.occupierName}</div>
        )}
      </div>
    </div>
  );
}

function StatBox({ label, value, gold }: { label: string; value: React.ReactNode; gold?: boolean }) {
  return (
    <div className="bg-black/30 rounded-lg p-2">
      <div className="opacity-60 text-[10px] uppercase">{label}</div>
      <div className="font-bold flex items-center gap-0.5" style={{ color: gold ? "#FFD166" : undefined }}>
        {gold && <GoldIcon size={11} />}
        {value}
      </div>
    </div>
  );
}

function DeployModal({ siteId, onClose }: { siteId: string; onClose: () => void }) {
  const player = useGame((s) => s.player)!;
  const deployDive = useGame((s) => s.deployDive);
  const completeTutorial = useGame((s) => s.completeTutorial);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);

  const handleDeploy = (teamId: string) => {
    const ok = deployDive(teamId, siteId);
    if (ok) {
      completeTutorial();
      onClose();
    }
  };

  return (
    <Modal title="Deploy Team" onClose={onClose}>
      <div className="text-xs opacity-70 mb-3">
        Pick a team of 5 crabs to send on a dive ({Math.round(CONFIG.diveDurationMs / 60000)} min in demo).
      </div>
      <TeamSelect
        teams={player.teams}
        crabs={player.crabs}
        selectedTeamId={selectedTeamId}
        requireIdle
        staminaCost={STAMINA_COSTS.dive}
        onSelect={(id) => {
          setSelectedTeamId(id);
          handleDeploy(id);
        }}
      />
    </Modal>
  );
}
