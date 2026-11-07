// Component tests for the modal claim family (2026-11-07 logic audit):
// several modals pay REAL gold from the live store while their
// "already claimed" guards lived in ephemeral useState — closing and
// reopening the modal (or leaving/rejoining a clan) reset the guard
// and paid the same reward again, without limit. Each test claims,
// unmounts, remounts, and proves the reward cannot be taken twice.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { useGame } from "../../src/game/store/gameStore";
import DailyRewardsModal from "../../src/game/render/DailyRewardsModal";
import { TidepassModal } from "../../src/game/render/TidepassModal";
import CharterModal from "../../src/game/render/CharterModal";
import ClansModal from "../../src/game/render/ClansModal";
import { BazaarAuctionsModal } from "../../src/game/render/BazaarAuctionsModal";
import { DefenseHubModal } from "../../src/game/render/DefenseHubModal";
import FriendsModal from "../../src/game/render/FriendsModal";

const noop = () => {};

function setupPlayer(gold = 100000, level = 1) {
  localStorage.clear();
  useGame.getState().resetGame();
  useGame.getState().initPlayer("Tester");
  const p = useGame.getState().player!;
  useGame.setState({ player: { ...p, gold, shellwardenLevel: level } });
}

const gold = () => useGame.getState().player!.gold;

/** Walk up from a text node until an ancestor contains the wanted button. */
function cardWith(text: string, buttonName: RegExp): HTMLElement {
  let node: HTMLElement | null = screen.getByText(text) as HTMLElement;
  while (node && !within(node).queryByRole("button", { name: buttonName })) {
    node = node.parentElement;
  }
  if (!node) throw new Error(`no card containing "${text}" + ${buttonName}`);
  return node;
}

beforeEach(() => {
  setupPlayer();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("DailyRewardsModal", () => {
  it("pays the daily reward once per Jakarta day, not once per modal open", () => {
    const g0 = gold();
    const first = render(<DailyRewardsModal onClose={noop} />);
    fireEvent.click(screen.getByRole("button", { name: "Claim Reward" }));
    expect(gold()).toBe(g0 + 400); // mock streak 5 -> cycle day 5 -> 400 GOLD
    first.unmount();

    render(<DailyRewardsModal onClose={noop} />);
    expect(
      screen.queryByRole("button", { name: "Claim Reward" })
    ).toBeNull();
    expect(gold()).toBe(g0 + 400);
  });
});

describe("TidepassModal", () => {
  it("season rewards cannot be re-claimed by reopening the modal", () => {
    const claimAll = () => {
      for (const btn of screen.queryAllByRole("button", { name: "Claim" })) {
        if (!(btn as HTMLButtonElement).disabled) fireEvent.click(btn);
      }
    };
    const g0 = gold();
    const first = render(<TidepassModal onClose={noop} />);
    claimAll();
    const g1 = gold();
    expect(g1).toBeGreaterThan(g0); // gold tiers really paid out
    first.unmount();

    render(<TidepassModal onClose={noop} />);
    claimAll();
    expect(gold()).toBe(g1);
  });
});

describe("CharterModal", () => {
  it("a settled charter does not resurrect on reopen to pay out again", () => {
    // Fast-forward past both seeded charters' terms so they can settle.
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 11 * 24 * 60 * 60 * 1000);
    const g0 = gold();

    const settleAll = () => {
      for (let i = 0; i < 4; i++) {
        const btn = screen.queryAllByRole("button", { name: /Settle now/ })[0];
        if (!btn) break;
        fireEvent.click(btn);
        fireEvent.click(
          screen.getByRole("button", { name: "Settle & Claim" })
        );
      }
    };

    const first = render(<CharterModal onClose={noop} />);
    fireEvent.click(screen.getByRole("button", { name: "Active" }));
    settleAll();
    expect(gold()).toBe(g0 + 640 + 410); // renter 640 + owner 410, once
    first.unmount();

    render(<CharterModal onClose={noop} />);
    fireEvent.click(screen.getByRole("button", { name: "Active" }));
    expect(screen.queryAllByRole("button", { name: /Settle now/ })).toHaveLength(0);
    expect(gold()).toBe(g0 + 1050);
  });
});

describe("ClansModal", () => {
  it("chest tiers stay claimed across leave + rejoin", () => {
    const g0 = gold();
    const joinStormcall = () => {
      const card = cardWith("Stormcall Syndicate", /Join/);
      fireEvent.click(within(card).getByRole("button", { name: /Join/ }));
    };
    const claimChest = () => {
      fireEvent.click(screen.getByRole("button", { name: "chest" }));
      for (const btn of screen.queryAllByRole("button", { name: "Claim" })) {
        if (!(btn as HTMLButtonElement).disabled) fireEvent.click(btn);
      }
    };

    const first = render(<ClansModal onClose={noop} />);
    joinStormcall(); // -1,000 fee; chest at 41,900 -> Bronze + Silver reached
    claimChest(); // +2,000 +5,000
    expect(gold()).toBe(g0 - 1000 + 7000);

    fireEvent.click(screen.getByRole("button", { name: "Leave Clan" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    joinStormcall(); // another -1,000
    fireEvent.click(screen.getByRole("button", { name: "chest" }));
    // Both reached tiers must read Claimed, and clicking pays nothing.
    expect(
      screen.getAllByRole("button", { name: "Claimed ✓" }).length
    ).toBeGreaterThanOrEqual(2);
    expect(gold()).toBe(g0 - 2000 + 7000);
    first.unmount();
  });
});

describe("BazaarAuctionsModal escrow", () => {
  it("raising your own bid charges only the delta; closing refunds escrow", () => {
    setupPlayer(100000, 10); // auctions unlock at Shellwarden Lv10
    const g0 = gold();
    const view = render(<BazaarAuctionsModal onClose={noop} />);
    // Kelpback's Bulwark: current 350, min next 380 (ends soonest).
    const card = cardWith("Kelpback's Bulwark", /Place Bid/);
    fireEvent.click(within(card).getByRole("button", { name: "Place Bid" }));
    expect(gold()).toBe(g0 - 380);
    // Raising your own bid to the new minimum (380 + step 50 = 430)
    // may only charge the +50 delta, not another full 430.
    const card2 = cardWith("Kelpback's Bulwark", /Place Bid/);
    fireEvent.click(within(card2).getByRole("button", { name: "Place Bid" }));
    expect(gold()).toBe(g0 - 430);
    // Closing the modal refunds the full escrow.
    view.unmount();
    expect(gold()).toBe(g0);
  });

  it("being outbid refunds the escrow immediately", () => {
    setupPlayer(100000, 10);
    const g0 = gold();
    // Fake timers BEFORE mount so the outbid interval is driven by them.
    vi.useFakeTimers();
    render(<BazaarAuctionsModal onClose={noop} />);
    const card = cardWith("Kelpback's Bulwark", /Place Bid/);
    fireEvent.click(within(card).getByRole("button", { name: "Place Bid" }));
    expect(gold()).toBe(g0 - 380);

    // Drive the outbid simulation deterministically.
    const rand = vi.spyOn(Math, "random").mockReturnValue(0);
    vi.advanceTimersByTime(22000);
    rand.mockRestore();
    expect(gold()).toBe(g0); // escrow returned in full
  });
});

describe("DefenseHubModal", () => {
  it("guard post upgrades persist in the store across reopen", () => {
    const g0 = gold();
    const first = render(<DefenseHubModal onClose={noop} />);
    fireEvent.click(screen.getByRole("button", { name: "Upgrade to L1" }));
    expect(gold()).toBe(g0 - 2000);
    expect(useGame.getState().player!.guardPostLevel).toBe(1);
    first.unmount();

    render(<DefenseHubModal onClose={noop} />);
    // Still Level 1 after reopen — the next purchase is L2, not L1 again.
    expect(screen.getAllByText("Wooden Palisade").length).toBeGreaterThanOrEqual(1);
    fireEvent.click(screen.getByRole("button", { name: "Upgrade to L2" }));
    expect(useGame.getState().player!.guardPostLevel).toBe(2);
    expect(gold()).toBe(g0 - 2000 - 6000);
  });
});

describe("FriendsModal", () => {
  it("the daily gift limit survives closing and reopening the modal", () => {
    const sendGift = () => {
      const giftBtns = screen.getAllByRole("button", { name: "Gift" });
      fireEvent.click(giftBtns[0]);
      fireEvent.click(screen.getByRole("button", { name: "Send Gift" }));
    };
    const openGiftView = () => {
      const giftBtns = screen.getAllByRole("button", { name: "Gift" });
      fireEvent.click(giftBtns[0]); // friend row -> gift view
    };

    // The "(N remaining)" label is split across JSX text nodes, so match
    // on full textContent of any element in the tree.
    const showsRemaining = (n: number) =>
      screen.queryAllByText(
        (_content, el) =>
          !!el && (el.textContent ?? "").includes(`gifts per day (${n} remaining)`)
      ).length > 0;

    const first = render(<FriendsModal onClose={noop} />);
    openGiftView();
    // Mock state starts at 1 gift already sent today -> 2 remaining.
    expect(showsRemaining(2)).toBe(true);
    sendGift();
    sendGift();
    expect(showsRemaining(0)).toBe(true);
    first.unmount();

    render(<FriendsModal onClose={noop} />);
    openGiftView();
    expect(showsRemaining(0)).toBe(true);
  });
});
