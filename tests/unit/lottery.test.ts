// Weekly Lottery consistency (2026-11-07 logic audit): the modal's
// header/summary hardcoded "611 winners · 5,890 GOLD total" while its
// own PRIZE_TIERS table sums to 564 winners and 23,000 GOLD, and the
// "✓ Hash matches commitment" badge sat over a LAST_DRAW_HASH that was
// NOT the sha256 of the revealed seed it was displayed next to.
import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import {
  PRIZE_TIERS,
  TOTAL_WINNERS,
  TOTAL_GOLD,
  LAST_DRAW_SEED,
  LAST_DRAW_HASH,
} from "../../src/game/render/WeeklyLotteryModal";

describe("WeeklyLotteryModal constants", () => {
  it("derived totals equal the prize tier table sums", () => {
    const winners = PRIZE_TIERS.reduce((s, t) => s + t.winners, 0);
    const gold = PRIZE_TIERS.reduce((s, t) => s + t.winners * t.gold, 0);
    expect(TOTAL_WINNERS).toBe(winners);
    expect(TOTAL_GOLD).toBe(gold);
    // The values the UI must show (the old hardcoded ones were wrong):
    expect(winners).toBe(564);
    expect(gold).toBe(23000);
  });

  it("LAST_DRAW_HASH is the real sha256 of the revealed seed", () => {
    const digest = createHash("sha256").update(LAST_DRAW_SEED, "utf8").digest("hex");
    expect(LAST_DRAW_HASH).toBe(digest);
  });
});
