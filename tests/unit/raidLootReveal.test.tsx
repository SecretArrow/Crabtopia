// Component test: a WINNING raid keeps RaidModal open on the
// LootReveal spoils chest (launchRaid has already credited the gold
// exactly once through its normal path — the reveal is presentation
// of the real gold delta), and Continue performs the usual
// close + go-home. A stub launchRaid makes the win deterministic.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { useGame } from "../../src/game/store/gameStore";
import { teamBP } from "../../src/game/engine/bp";
import RaidModal from "../../src/game/render/RaidModal";
import type { Crab } from "../../src/game/types";

function setupRaidableSite() {
  localStorage.clear();
  useGame.getState().resetGame();
  useGame.getState().initPlayer("Tester");
  const p = useGame.getState().player!;
  const team = p.teams[0];
  const crabs = team.crabIds
    .map((id) => p.crabs.find((c) => c.id === id))
    .filter(Boolean) as Crab[];
  // Bracket the site so the starter team passes the modal's BP gate.
  const bp = teamBP(crabs, [], 1).total;
  const bracket = Math.max(1, Math.round(bp / 100));
  const siteId = "site_raid_loot_test";
  useGame.setState({
    worldSites: [
      {
        id: siteId,
        name: "Loot Reef",
        biome: "coral_court",
        pos: { x: 50, y: 50 },
        occupiedBy: "npc_team_loot",
        occupierName: "Captain NPC",
        deployTime: Date.now() - 60000,
        durationMs: 240000,
        state: "deployed",
        baseReward: 1000,
        raidCount: 0,
        rewardRemaining: 800,
        ownerIsPlayer: false,
        bpBracket: bracket,
      },
    ],
  });
  return siteId;
}

beforeEach(() => {
  setupRaidableSite();
});

describe("RaidModal victory spoils reveal", () => {
  it("shows the chest reveal with the credited delta, then Continue closes", async () => {
    const siteId = useGame.getState().worldSites[0].id;
    // Deterministic winning raid: credits exactly +777 gold.
    const fakeLaunch = ((sid: string) => {
      const st = useGame.getState();
      useGame.setState({
        player: { ...st.player!, gold: st.player!.gold + 777 },
      });
      return {
        id: "raid_fake",
        siteId: sid,
        result: {
          winner: "raider",
          stolenAmount: 500,
          participationReward: 300,
        },
      };
    }) as unknown as ReturnType<typeof useGame.getState>["launchRaid"];
    useGame.setState({ launchRaid: fakeLaunch });

    const onClose = vi.fn();
    render(<RaidModal siteId={siteId} onClose={onClose} />);

    // Step 1 → step 2 → launch.
    fireEvent.click(
      await screen.findByRole("button", { name: /Next: Reinforcements/ })
    );
    fireEvent.click(
      await screen.findByRole("button", { name: /Launch Raid/ })
    );

    // The spoils reveal appears INSTEAD of closing.
    expect(await screen.findByText(/Raid Spoils/, {}, { timeout: 5000 })).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByTestId("loot-reveal")).toBeTruthy();

    // After the reveal completes, the granted delta + breakdown show
    // and the action becomes Continue.
    const cont = await screen.findByRole(
      "button",
      { name: "Continue" },
      { timeout: 8000 }
    );
    expect(screen.getAllByText(/777/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Stolen 500/)).toBeTruthy();

    fireEvent.click(cont);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
