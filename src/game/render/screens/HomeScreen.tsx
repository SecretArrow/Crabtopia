// Crabtopia - Home dashboard screen (Glow-Tide Storybook redesign)
"use client";

import { useState, useEffect } from "react";
import { useGame } from "../../store/gameStore";
import { CONFIG, QUESTS } from "../../engine/config";
import {
  formatTime,
  formatGold,
  GoldIcon,
  GlowButton,
  GradientCard,
  GlassPanel,
  CountdownRing,
  StatChip,
  SectionTitle,
  EmptyState,
} from "../ui";
import { FACTIONS } from "../../content/factions";
import CrabRenderer from "../CrabRenderer";
import { hashSeed } from "../../animation/idleVariation";
import QuestsModal from "../QuestsModal";
import ClansModal from "../ClansModal";
import LeviathanRaidModal from "../LeviathanRaidModal";
import TidepassModal from "../TidepassModal";
import ReefPlotsModal from "../ReefPlotsModal";
import BazaarAuctionsModal from "../BazaarAuctionsModal";
import WeeklyLotteryModal from "../WeeklyLotteryModal";
import TideborneBoutiqueModal from "../TideborneBoutiqueModal";
import TournamentModal from "../TournamentModal";
import CharterModal from "../CharterModal";
import DefenseHubModal from "../DefenseHubModal";
import EconomyHealthModal from "../EconomyHealthModal";
import LiveRaidSpectateModal from "../LiveRaidSpectateModal";
import AdminConsoleModal from "../AdminConsoleModal";
import ProfileModal from "../ProfileModal";
import FriendsModal from "../FriendsModal";
import TutorialsModal from "../TutorialsModal";
import DailyRewardsModal from "../DailyRewardsModal";
import LeaderboardModal from "../LeaderboardModal";
import ReplayViewerModal from "../ReplayViewerModal";

export default function HomeScreen() {
  const player = useGame((s) => s.player)!;
  const worldSites = useGame((s) => s.worldSites);
  const setScreen = useGame((s) => s.setScreen);
  const claimDive = useGame((s) => s.claimDive);
  const hatchEggNow = useGame((s) => s.hatchEggNow);
  const claimQuest = useGame((s) => s.claimQuest);

  // Modal launcher state
  const [showQuests, setShowQuests] = useState(false);
  const [showClans, setShowClans] = useState(false);
  const [showLeviathan, setShowLeviathan] = useState(false);
  const [showTidepass, setShowTidepass] = useState(false);
  const [showReef, setShowReef] = useState(false);
  const [showAuctions, setShowAuctions] = useState(false);
  const [showLottery, setShowLottery] = useState(false);
  const [showBoutique, setShowBoutique] = useState(false);
  const [showTournament, setShowTournament] = useState(false);
  const [showCharter, setShowCharter] = useState(false);
  const [showDefenseHub, setShowDefenseHub] = useState(false);
  const [showEconomy, setShowEconomy] = useState(false);
  const [showLiveRaid, setShowLiveRaid] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showFriends, setShowFriends] = useState(false);
  const [showTutorials, setShowTutorials] = useState(false);
  const [showDaily, setShowDaily] = useState(false);
  const [showLeaderboards, setShowLeaderboards] = useState(false);
  const [showReplay, setShowReplay] = useState(false);

  // tick every second for timers
  const [, setTick] = useState(0);
  useEffect(() => {
    const i = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(i);
  }, []);

  // Active player dives (deployed/raided/completed)
  const myDives = worldSites.filter(
    (s) => s.ownerIsPlayer && (s.state === "deployed" || s.state === "completed" || s.state === "raided")
  );
  const tutorialSite = player.digSites.find((s) => s.isTutorial);
  const readyEggs = player.eggs.filter((e) => Date.now() >= e.hatchTime);
  const incubatingEggs = player.eggs.filter((e) => Date.now() < e.hatchTime);
  const claimableQuests = player.questProgress.filter((q) => !q.claimed && q.progress >= q.target);
  const idleTeams = player.teams.filter((t) => t.crabIds.filter(Boolean).length === 5);
  const recentRaids = player.raids.slice(0, 5);

  // Hero crab preview: pick a non-rookie if any, else first crab
  const heroCrab = player.crabs.find((c) => !c.isRookie) ?? player.crabs[0];

  return (
    <div
      className={`${
        myDives.length === 0 ? "space-y-3" : "space-y-5"
      } max-w-5xl mx-auto`}
    >
      {/* HERO BANNER */}
      <div
        className="relative rounded-2xl overflow-hidden"
        style={{
          background: "linear-gradient(120deg, #0A1B3D 0%, rgba(18,167,160,0.25) 100%)",
          border: "1px solid rgba(124,245,225,0.25)",
          minHeight: 220,
        }}
      >
        {/* City backdrop */}
        <div
          className="absolute inset-0 bg-cover bg-center opacity-25"
          style={{ backgroundImage: "url(/art/crabtopia-city.png)" }}
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(90deg, rgba(10,27,61,0.92) 0%, rgba(10,27,61,0.55) 50%, rgba(10,27,61,0.2) 100%)",
          }}
        />

        <div className="relative z-10 flex flex-col md:flex-row items-stretch gap-4 p-4 md:p-6">
          {/* Left: welcome */}
          <div className="flex-1 min-w-0">
            <div className="text-[11px] uppercase tracking-widest opacity-70 font-display">
              {player.name === "Shellwarden" ? "Welcome to your burrow" : "Welcome back, Shellwarden"}
            </div>
            <h1
              className="text-2xl md:text-3xl font-bold mb-1 font-display"
              style={{ color: "#FFD166", textShadow: "0 0 20px rgba(255,209,102,0.35)" }}
            >
              {player.name}
            </h1>
            <div className="text-xs md:text-sm opacity-80 mb-3">
              Level {player.shellwardenLevel} · {player.shellwardenXp} XP ·{" "}
              {player.crabs.length} {player.crabs.length === 1 ? "crab" : "crabs"} · {player.teams.length} {player.teams.length === 1 ? "team" : "teams"}
            </div>
            <GlowButton
              variant="teal"
              size="md"
              onClick={() => setScreen("map")}
            >
              Deploy a Dive →
            </GlowButton>
          </div>

          {/* Right: hero crab */}
          {heroCrab && (
            <div className="hidden md:flex flex-col items-end justify-center">
              <div
                className="relative"
                style={{
                  filter: `drop-shadow(0 8px 24px ${FACTIONS[heroCrab.faction].colors.primary}66)`,
                }}
              >
                <CrabRenderer crab={heroCrab} size={150} pose="walk" />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 3 ACTION CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <ActionCard
          icon={<img src="/art/ui/treasure-chest.png" alt="" width={36} height={36} draggable={false} />}
          title="Mining Expedition"
          subtitle="Idle dive, earn GOLD"
          badge={`${myDives.length} active`}
          onClick={() => setScreen("map")}
          faction="coral_court"
        />
        <ActionCard
          icon={<span className="text-3xl">⚔️</span>}
          title="Plunder Raid"
          subtitle="Steal rival treasure"
          badge={`${player.raidEnergy}⚡ energy`}
          onClick={() => setScreen("map")}
          faction="cinderreef"
        />
        <ActionCard
          icon={<span className="text-3xl">🦀</span>}
          title="Build Your Team"
          subtitle="Form 5-crab squads"
          badge={`${idleTeams.length} ready`}
          onClick={() => setScreen("teams")}
          faction="frostshelf"
        />
      </div>

      {/* QUICK STATS ROW */}
      <div className="flex flex-wrap gap-2">
        <StatChip
          label="Gold"
          value={formatGold(player.gold)}
          color="#FFD166"
          icon={<GoldIcon size={16} />}
        />
        <StatChip
          label="Raid Energy"
          value={`${player.raidEnergy}/${CONFIG.dailyRaidEnergy}`}
          color="#7A5CFF"
          icon={<span className="text-[16px] leading-none">⚡</span>}
        />
        <StatChip
          label="Dives Today"
          value={`${player.dailyDiveCount}/${CONFIG.dailyDiveCap}`}
          color="#12A7A0"
          icon={<span className="text-[16px] leading-none">🏖️</span>}
        />
        <StatChip
          label="Eggs"
          value={player.eggs.length}
          color="#FF6F91"
          icon={<span className="text-[16px] leading-none">🥚</span>}
        />
      </div>

      {/* ACTION ALERTS */}
      {(myDives.some((s) => s.state === "completed") ||
        readyEggs.length > 0 ||
        claimableQuests.length > 0 ||
        tutorialSite?.state === "completed") && (
        <GlassPanel glow="rgba(255,209,102,0.25)" className="p-3">
          <SectionTitle icon={<span className="animate-glow-pulse">🔔</span>} title="Action Needed" />
          <div className="space-y-2">
            {tutorialSite?.state === "completed" && (
              <AlertRow
                icon="🎓"
                title="Tutorial dive complete!"
                actionLabel="Claim +500"
                showCoin
                onAction={() => claimDive(tutorialSite.id)}
              />
            )}
            {myDives
              .filter((s) => s.state === "completed")
              .map((s) => (
                <AlertRow
                  key={s.id}
                  icon="💰"
                  title={`${s.name} ready to claim`}
                  actionLabel={`Claim ${Math.round(s.rewardRemaining)}`}
                  showCoin
                  onAction={() => claimDive(s.id)}
                />
              ))}
            {readyEggs.map((e) => (
              <AlertRow
                key={e.id}
                icon={<img src="/art/crabs/egg-glowing.png" alt="" width={22} height={22} draggable={false} />}
                title="Egg ready to hatch!"
                actionLabel="Hatch now"
                onAction={() => hatchEggNow(e.id)}
              />
            ))}
            {claimableQuests.map((q) => {
              const quest = QUESTS.find((x) => x.id === q.questId);
              if (!quest) return null;
              return (
                <AlertRow
                  key={q.questId}
                  icon="📜"
                  title={`Quest: ${quest.name}`}
                  actionLabel={`Claim +${quest.reward}`}
                  showCoin
                  onAction={() => claimQuest(q.questId)}
                />
              );
            })}
          </div>
        </GlassPanel>
      )}

      {/* ACTIVE DIVES */}
      <section>
        <SectionTitle
          icon={<span>🏖️</span>}
          title="Active Dives"
          action={
            <button onClick={() => setScreen("map")} className="text-xs text-[#7CF5E1] hover:underline">
              View map →
            </button>
          }
        />
        {myDives.length === 0 ? (
          <EmptyState
            message="No active dives"
            hint="Send a team to a dig site to start earning GOLD."
            compact
            cta={
              <GlowButton variant="teal" size="sm" onClick={() => setScreen("map")}>
                Deploy your first dive →
              </GlowButton>
            }
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {myDives.map((s) => {
              const isCompleted = s.state === "completed";
              const elapsed = Date.now() - (s.deployTime ?? Date.now());
              const remaining = Math.max(0, s.durationMs - elapsed);
              const progress = isCompleted ? 1 : Math.min(1, elapsed / s.durationMs);
              const f = FACTIONS[s.biome];
              return (
                <div
                  key={s.id}
                  className="rounded-2xl p-3 flex items-center gap-3"
                  style={{
                    background: `linear-gradient(135deg, ${f.colors.dark}cc, ${f.colors.primary}22)`,
                    border: `1px solid ${f.colors.primary}55`,
                  }}
                >
                  <CountdownRing
                    progress={progress}
                    size={48}
                    color={isCompleted ? "#FFD166" : f.colors.accent}
                    label={
                      isCompleted ? (
                        <span style={{ color: "#FFD166" }}>✓</span>
                      ) : (
                        <span style={{ color: f.colors.accent }}>
                          {formatTime(remaining).split(" ")[0]}
                        </span>
                      )
                    }
                    glow
                  />
                  <div className="min-w-0 flex-1">
                    <div className="font-bold text-sm truncate font-display" style={{ color: f.colors.light }}>
                      {s.name}
                    </div>
                    <div className="text-[10px] opacity-70">
                      {f.shortName} biome{isCompleted ? " · ready" : ""}
                    </div>
                    <div className="text-[10px] mt-1 flex items-center gap-1" style={{ color: "#FFD166" }}>
                      <GoldIcon size={11} /> {Math.round(s.rewardRemaining)}
                      {!isCompleted && <span className="opacity-60">· Raids {s.raidCount}/2</span>}
                    </div>
                  </div>
                  {isCompleted && (
                    <GlowButton
                      variant="gold"
                      size="sm"
                      onClick={() => claimDive(s.id)}
                      className="shrink-0"
                    >
                      Claim
                    </GlowButton>
                  )}
                </div>
              );
            })}
            {/* "Deploy another" CTA card to fill grid */}
            {myDives.length < 5 && (
              <button
                onClick={() => setScreen("map")}
                className="rounded-2xl p-3 flex flex-col items-center justify-center gap-1 min-h-[88px] transition-all hover:scale-[1.02]"
                style={{
                  background: "rgba(124,245,225,0.04)",
                  border: "1px dashed rgba(124,245,225,0.25)",
                }}
              >
                <span className="text-2xl">⛏️</span>
                <span className="text-xs font-bold text-[#7CF5E1] font-display">Deploy another</span>
                <span className="text-[10px] opacity-60">Find a free dig site</span>
              </button>
            )}
          </div>
        )}
      </section>

      {/* EGGS */}
      {player.eggs.length > 0 && (
        <section>
          <SectionTitle icon={<span>🥚</span>} title="Eggs" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {[...readyEggs, ...incubatingEggs].map((egg) => {
              const isReady = Date.now() >= egg.hatchTime;
              const remaining = Math.max(0, egg.hatchTime - Date.now());
              const total = CONFIG.eggHatchMs;
              const progress = 1 - remaining / total;
              const faction = FACTIONS[egg.faction];
              return (
                <div
                  key={egg.id}
                  className="rounded-xl p-2 text-center"
                  style={{
                    background: "rgba(255,255,255,0.04)",
                    border: `1px solid ${faction.colors.primary}33`,
                  }}
                >
                  <img
                    src="/art/crabs/egg-glowing.png"
                    alt=""
                    width={48}
                    height={48}
                    draggable={false}
                    className="mx-auto mb-1 object-contain egg-rock"
                    style={{
                      filter: isReady
                        ? "drop-shadow(0 0 10px rgba(255,209,102,0.9))"
                        : "saturate(0.6) brightness(0.85)",
                      animation: isReady ? "glowPulse 1.8s ease-in-out infinite" : undefined,
                      animationDelay: `${-(hashSeed(egg.id) % 2600) / 1000}s`,
                    }}
                  />
                  <div className="font-bold text-[11px] truncate font-display">{egg.name}</div>
                  {isReady ? (
                    <>
                      <div className="text-[10px]" style={{ color: "#FFD166" }}>Ready!</div>
                      <GlowButton variant="gold" size="sm" className="mt-1 w-full" onClick={() => hatchEggNow(egg.id)}>
                        Hatch Now
                      </GlowButton>
                    </>
                  ) : (
                    <>
                      <div className="text-[10px] opacity-70">{formatTime(remaining)}</div>
                      <div className="mt-1 h-1.5 bg-white/15 rounded-full overflow-hidden">
                        <div
                          className="h-full transition-all"
                          style={{ width: `${progress * 100}%`, background: "#FF6F91" }}
                        />
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* QUESTS */}
      <section>
        <SectionTitle icon={<span>📜</span>} title="Quests" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {QUESTS.slice(0, 6).map((q) => {
            const prog = player.questProgress.find((p) => p.questId === q.id);
            if (!prog) return null;
            const done = prog.progress >= prog.target;
            const pct = Math.min(100, (prog.progress / prog.target) * 100);
            return (
              <div
                key={q.id}
                className="rounded-xl p-2.5"
                style={{
                  background: "rgba(255,255,255,0.04)",
                  border: `1px solid ${done ? "#FFD16655" : "rgba(124,245,225,0.12)"}`,
                }}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="font-bold text-xs font-display truncate">{q.name}</div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      className="text-[10px] font-mono"
                      style={{ color: done ? "#FFD166" : "rgba(124,245,225,0.85)" }}
                    >
                      {prog.progress}/{prog.target}
                    </span>
                    {prog.claimed ? (
                      <span className="text-[10px] opacity-50">✓ claimed</span>
                    ) : done ? (
                      <GlowButton variant="gold" size="sm" onClick={() => claimQuest(q.id)}>
                        Claim +{q.reward}
                      </GlowButton>
                    ) : null}
                  </div>
                </div>
                <div className="text-[10px] opacity-70 mt-0.5">{q.description}</div>
                <div className="mt-1.5 h-1.5 bg-white/15 rounded-full overflow-hidden">
                  <div
                    className="h-full transition-all"
                    style={{
                      width: `${pct}%`,
                      background: done ? "linear-gradient(90deg, #FFD166, #FF7A1A)" : "linear-gradient(90deg, #12A7A0, #7CF5E1)",
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* RECENT RAIDS */}
      {recentRaids.length > 0 && (
        <section>
          <SectionTitle icon={<span>⚔️</span>} title="Recent Raids" />
          <div className="space-y-1">
            {recentRaids.map((r) => {
              const won = r.result?.winner === "raider";
              return (
                <div
                  key={r.id}
                  className="rounded-lg px-3 py-2 flex items-center justify-between text-xs"
                  style={{
                    background: "rgba(255,255,255,0.04)",
                    border: `1px solid ${won ? "#4FB47744" : "#FF6F9144"}`,
                  }}
                >
                  <span>
                    {won ? "🏆 Won" : "💔 Lost"} raid on {r.siteId}
                  </span>
                  <span className="font-bold flex items-center gap-0.5" style={{ color: "#FFD166" }}>
                    <GoldIcon size={11} />
                    {(r.result?.stolenAmount ?? 0) + (r.result?.participationReward ?? 0)}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* LIVE EVENTS — Quests, Leviathan, Lottery, Tournament */}
      <section>
        <SectionTitle
          icon={<span>🎉</span>}
          title="Live Events"
          action={
            <span className="text-[10px] opacity-60 uppercase tracking-wide">
              Weekly · Co-op · Competitive
            </span>
          }
        />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <EventCard
            icon="📜"
            color="#7CF5E1"
            title="Quests & Codex"
            desc={
              claimableQuests.length > 0
                ? `${claimableQuests.length} quest${claimableQuests.length === 1 ? "" : "s"} ready to claim!`
                : "Daily & weekly quests, achievement rewards."
            }
            onClick={() => setShowQuests(true)}
            cta="Tap to open"
          />
          <EventCard
            icon="🐉"
            color="#FF7A1A"
            title="Leviathan Raid"
            desc="Co-op world boss. 4 squads vs a 4-phase Leviathan. Loot a Legendary shard."
            onClick={() => setShowLeviathan(true)}
            cta="Tap to muster"
          />
          <EventCard
            icon="🎫"
            color="#FFD166"
            title="Weekly Lottery"
            desc="Free ticket per daily login (up to 7/week). Win pure crabs, eggs, cosmetics."
            onClick={() => setShowLottery(true)}
            cta="Tap to enter"
          />
          <EventCard
            icon="🏆"
            color="#FF6F91"
            title="Tournament"
            desc="Coral Crown weekly bracket. Spectate live matches, streamer overlay, highlights."
            onClick={() => setShowTournament(true)}
            cta="Tap to view"
          />
        </div>
      </section>

      {/* WORLD & MARKET — Clans, Reef Plots, Bazaar Auctions, Charter */}
      <section>
        <SectionTitle
          icon={<span>🌊</span>}
          title="World & Market"
          action={
            <span className="text-[10px] opacity-60 uppercase tracking-wide">
              Clans · Land · Trade · Lending
            </span>
          }
        />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <EventCard
            icon="🛡️"
            color="#7A5CFF"
            title="Clans"
            desc="Join a faction clan, share a clan chest, wage Reef Plot wars. Up to 50 members."
            onClick={() => setShowClans(true)}
            cta="Tap to browse"
          />
          <EventCard
            icon="🪸"
            color="#4FB477"
            title="Reef Plots"
            desc="Own persistent reef land. Build Training Pool, Gold Garden, Gear Forge, Hatchery."
            onClick={() => setShowReef(true)}
            cta="Tap to claim"
          />
          <EventCard
            icon="🔨"
            color="#FF7A1A"
            title="Bazaar Auctions"
            desc="Timed auctions, make-offer flow, bid history. 3.85% fee on sale. Unlocks at L10."
            onClick={() => setShowAuctions(true)}
            cta="Tap to bid"
          />
          <EventCard
            icon="📜"
            color="#12A7A0"
            title="Charters"
            desc="Fair crab lending. Owner share capped at 60%. Renter can leave anytime."
            onClick={() => setShowCharter(true)}
            cta="Tap to lend"
          />
        </div>
      </section>

      {/* STORE & INSIGHTS — Tidepass, Cosmetic Store, Economy Health, Defense Hub */}
      <section>
        <SectionTitle
          icon={<span>✨</span>}
          title="Store & Insights"
          action={
            <span className="text-[10px] opacity-60 uppercase tracking-wide">
              Seasons · Cosmetics · Defense · Economy
            </span>
          }
        />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <EventCard
            icon="🌸"
            color="#FF6F91"
            title="Tidepass & Seasons"
            desc="8-week seasonal reward track. Free + supporter lanes. Style-only, never power."
            onClick={() => setShowTidepass(true)}
            cta="Tap to view"
          />
          <EventCard
            icon="🛍️"
            color="#FFD166"
            title="Tideborne Boutique"
            desc="Real-money styles in local currency. Frames, dances, trails, burrow decor. Never power, never GOLD."
            onClick={() => setShowBoutique(true)}
            cta="Tap to browse"
          />
          <EventCard
            icon="📊"
            color="#7CF5E1"
            title="Economy Health"
            desc="Public dashboard: GOLD circulation, sinks, Gini index, issuance budget, price index."
            onClick={() => setShowEconomy(true)}
            cta="Tap to inspect"
          />
          <EventCard
            icon="🛡️"
            color="#12A7A0"
            title="Burrow Defense"
            desc="Guard Posts, Dive Insurance, Bounty Board, defense log with replays and tips."
            onClick={() => setShowDefenseHub(true)}
            cta="Tap to fortify"
          />
        </div>
      </section>

      {/* LIVE & SYSTEM — Live Raid Spectate + Admin Console */}
      <section>
        <SectionTitle
          icon={<span>📡</span>}
          title="Live & System"
          action={
            <span className="text-[10px] opacity-60 uppercase tracking-wide">
              Spectate · Admin · Demo
            </span>
          }
        />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <EventCard
            icon="⚔️"
            color="#FF7A1A"
            title="Live Raid Spectate"
            desc="Watch real-time raids unfold. Streaming event log, HP bars, reinforcement scuttle, MVP."
            onClick={() => setShowLiveRaid(true)}
            cta="Tap to watch"
          />
          <EventCard
            icon="🛠️"
            color="#FFD166"
            title="Admin Console"
            desc="Demo admin dashboard: economy dials, event scheduler, ban/refund, audit logs, kill switches."
            onClick={() => setShowAdmin(true)}
            cta="Tap to open"
          />
        </div>
      </section>

      {/* COMMUNITY & REWARDS — Daily Rewards, Profile, Friends, Leaderboards */}
      <section>
        <SectionTitle
          icon={<span>👑</span>}
          title="Community & Rewards"
          action={
            <span className="text-[10px] opacity-60 uppercase tracking-wide">
              Streaks · Profile · Friends · Rankings
            </span>
          }
        />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <EventCard
            icon="🌊"
            color="#FFD166"
            title="Tidewell Rewards"
            desc="Daily check-in streak with forgiving tiers. 7-day track, streak shields, tier perks."
            onClick={() => setShowDaily(true)}
            cta="Tap to claim"
          />
          <EventCard
            icon="🪪"
            color="#FF6F91"
            title="Shellwarden Profile"
            desc="Public profile, trophy shelf, favorite-crab showcase, faction affinity stats."
            onClick={() => setShowProfile(true)}
            cta="Tap to view"
          />
          <EventCard
            icon="🤝"
            color="#4FB477"
            title="Friends"
            desc="Friend list, visit burrows, gift styles (never crabs or GOLD). Share your ID."
            onClick={() => setShowFriends(true)}
            cta="Tap to open"
          />
          <EventCard
            icon="🏆"
            color="#7A5CFF"
            title="Leaderboards"
            desc="Shellwardens, top crabs, clans, faction war. Season resets Wednesdays 20:00."
            onClick={() => setShowLeaderboards(true)}
            cta="Tap to climb"
          />
        </div>
      </section>

      {/* LEARN & WATCH — Tutorials, Replay Archive */}
      <section>
        <SectionTitle
          icon={<span>🎓</span>}
          title="Learn & Watch"
          action={
            <span className="text-[10px] opacity-60 uppercase tracking-wide">
              Tutorials · Replays
            </span>
          }
        />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <EventCard
            icon="📖"
            color="#7CF5E1"
            title="Tutorials"
            desc="12 replayable guides: diving, raiding, genetics, bazaar, coliseum, economy. Short and visual."
            onClick={() => setShowTutorials(true)}
            cta="Tap to learn"
          />
          <EventCard
            icon="🎬"
            color="#FF7A1A"
            title="Replay Archive"
            desc="Deterministic battle replays under 300 KB. Share links, verify seeds, scrub timelines."
            onClick={() => setShowReplay(true)}
            cta="Tap to watch"
          />
        </div>
      </section>

      {/* Modals */}
      {showQuests && <QuestsModal onClose={() => setShowQuests(false)} />}
      {showLeviathan && <LeviathanRaidModal onClose={() => setShowLeviathan(false)} />}
      {showLottery && <WeeklyLotteryModal onClose={() => setShowLottery(false)} />}
      {showTournament && <TournamentModal onClose={() => setShowTournament(false)} />}
      {showClans && <ClansModal onClose={() => setShowClans(false)} />}
      {showReef && <ReefPlotsModal onClose={() => setShowReef(false)} />}
      {showAuctions && <BazaarAuctionsModal onClose={() => setShowAuctions(false)} />}
      {showCharter && <CharterModal onClose={() => setShowCharter(false)} />}
      {showTidepass && <TidepassModal onClose={() => setShowTidepass(false)} />}
      {showBoutique && <TideborneBoutiqueModal onClose={() => setShowBoutique(false)} />}
      {showEconomy && <EconomyHealthModal onClose={() => setShowEconomy(false)} />}
      {showDefenseHub && <DefenseHubModal onClose={() => setShowDefenseHub(false)} />}
      {showLiveRaid && <LiveRaidSpectateModal onClose={() => setShowLiveRaid(false)} />}
      {showAdmin && <AdminConsoleModal onClose={() => setShowAdmin(false)} />}
      {showProfile && <ProfileModal onClose={() => setShowProfile(false)} />}
      {showFriends && <FriendsModal onClose={() => setShowFriends(false)} />}
      {showTutorials && <TutorialsModal onClose={() => setShowTutorials(false)} />}
      {showDaily && <DailyRewardsModal onClose={() => setShowDaily(false)} />}
      {showLeaderboards && <LeaderboardModal onClose={() => setShowLeaderboards(false)} />}
      {showReplay && <ReplayViewerModal onClose={() => setShowReplay(false)} />}
    </div>
  );
}

// ---------- LIVE EVENT CARD ----------
function EventCard({
  icon,
  color,
  title,
  desc,
  onClick,
  cta,
}: {
  icon: string;
  color: string;
  title: string;
  desc: string;
  onClick: () => void;
  cta: string;
}) {
  return (
    <button
      onClick={onClick}
      className="relative text-left p-4 rounded-2xl overflow-hidden min-h-[120px] flex flex-col gap-2 transition-all duration-200 hover:-translate-y-1 active:scale-[0.98]"
      style={{
        background: `linear-gradient(160deg, ${color}10 0%, ${color}22 100%)`,
        border: `1px solid ${color}55`,
        boxShadow: `0 2px 12px ${color}22`,
      }}
    >
      {/* Glow accent */}
      <div
        className="absolute -top-8 -right-8 w-24 h-24 rounded-full opacity-30 pointer-events-none"
        style={{ background: `radial-gradient(circle, ${color}55, transparent 70%)` }}
      />
      <div className="flex items-center gap-2 relative z-10">
        <span className="text-2xl">{icon}</span>
        <div className="text-base font-bold font-display" style={{ color }}>
          {title}
        </div>
      </div>
      <div className="text-xs opacity-80 leading-snug relative z-10 flex-1">{desc}</div>
      <div className="mt-auto text-[10px] opacity-60 uppercase tracking-wide relative z-10 whitespace-nowrap">
        {cta} →
      </div>
    </button>
  );
}

// ---------- SUBCOMPONENTS ----------

function ActionCard({
  icon,
  title,
  subtitle,
  badge,
  onClick,
  faction,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  badge: string;
  onClick: () => void;
  faction: keyof typeof FACTIONS;
}) {
  const f = FACTIONS[faction];
  return (
    <GradientCard faction={faction} onClick={onClick} className="p-3 flex items-center gap-3">
      <div
        className="rounded-xl p-2 shrink-0"
        style={{
          background: `linear-gradient(135deg, ${f.colors.primary}33, ${f.colors.dark}55)`,
          border: `1px solid ${f.colors.accent}33`,
        }}
      >
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="font-bold text-sm font-display" style={{ color: f.colors.light }}>
          {title}
        </div>
        <div className="text-[10px] opacity-70 truncate">{subtitle}</div>
        <div
          className="mt-1 inline-block text-[9px] px-1.5 py-0.5 rounded-md font-bold"
          style={{ background: `${f.colors.accent}22`, color: f.colors.accent }}
        >
          {badge}
        </div>
      </div>
      <span className="opacity-60 text-lg shrink-0">→</span>
    </GradientCard>
  );
}

function AlertRow({
  icon,
  title,
  actionLabel,
  onAction,
  showCoin = false,
}: {
  icon: React.ReactNode;
  title: string;
  actionLabel: string;
  onAction: () => void;
  showCoin?: boolean;
}) {
  return (
    <div className="flex items-center justify-between bg-white/5 rounded-lg px-3 py-2">
      <div className="flex items-center gap-2 text-sm min-w-0">
        <span className="text-lg shrink-0">{icon}</span>
        <span className="truncate">{title}</span>
      </div>
      <GlowButton variant="gold" size="sm" onClick={onAction} className="flex items-center gap-1">
        {showCoin && <GoldIcon size={12} />}
        {actionLabel}
      </GlowButton>
    </div>
  );
}
