// Crabtopia - Bazaar Auctions & Offers companion modal.
// Self-contained: timed auctions, my bids, make offer, my auctions.
// Glow-Tide themed, full-screen overlay, does not touch BazaarScreen.
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useGame } from "../store/gameStore";
import { FACTIONS } from "../content/factions";
import {
  GlassPanel,
  GlowButton,
  GoldIcon,
  formatGold,
  formatTime,
  EmptyState,
  CountdownRing,
  RarityBadge,
  FactionBadge,
} from "./ui";
import type { ClassId, FactionId, Rarity } from "../types";
import CrabSheetSprite from "../animation/CrabSheetSprite";
import { CLASS_HOME_FACTION } from "../animation/sheetResolver";

/** Auction/mock crabs carry their class in the display name. */
function classFromItemName(name: string): ClassId {
  const n = name.toLowerCase();
  for (const cls of [
    "bulwark",
    "pincher",
    "reaver",
    "skitter",
    "tidecaller",
    "shellmender",
    "warden",
    "gildclaw",
  ] as ClassId[]) {
    if (n.includes(cls)) return cls;
  }
  return "pincher";
}

type Tab = "auctions" | "my-bids" | "make-offer" | "my-auctions";

interface Auction {
  id: string;
  itemName: string;
  itemType: "crab" | "egg" | "gear";
  rarity: Rarity;
  faction?: FactionId;
  currentBid: number;
  minNextBid: number;
  buyItNow?: number;
  bidCount: number;
  topBidder: string;
  endsAt: number;
  seller: string;
  imageHint: string;
}

interface Offer {
  id: string;
  fromUser: string;
  targetListingName: string;
  offerAmount: number;
  expiresAt: number;
  message?: string;
}

// Mock fixed-price listings reused by the Make Offer tab.
const MOCK_LISTINGS: {
  id: string;
  name: string;
  seller: string;
  price: number;
  rarity: Rarity;
  faction?: FactionId;
  type: "crab" | "egg" | "gear";
}[] = [
  { id: "ml_1", name: "Stormcaller Pincher", seller: "Stormsnap", price: 1500, rarity: "rare", faction: "stormwake", type: "crab" },
  { id: "ml_2", name: "Tidebloom Egg", seller: "Pearlhide", price: 3000, rarity: "epic", faction: "coral_court", type: "egg" },
  { id: "ml_3", name: "Frostwarden's Crest", seller: "Frostgrip", price: 2200, rarity: "rare", faction: "frostshelf", type: "gear" },
  { id: "ml_4", name: "Cindergear Gauntlet", seller: "Cinderjaw", price: 18000, rarity: "legendary", faction: "cinderreef", type: "gear" },
  { id: "ml_5", name: "Moonpool Charm", seller: "Moonwarden", price: 4500, rarity: "epic", faction: "moonpool", type: "gear" },
];

const NPC_BIDDER_NAMES = [
  "Brinepinch", "Oldshell", "Tidecrest", "Goldfoot", "Riftclaw",
  "Kelpback", "Stormsnap", "Pearlhide", "Cinderjaw", "Mossclaw",
  "Frostgrip", "Moonwarden", "Driftwhisk", "Saltreaver", "Currentleaper",
];

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

function makeMockAuctions(): Auction[] {
  const now = Date.now();
  return [
    { id: "auc_1", itemName: "Stormcaller Pincher", itemType: "crab", rarity: "rare", faction: "stormwake", currentBid: 800, minNextBid: 850, buyItNow: 1500, bidCount: 3, topBidder: "Driftwhisk", endsAt: now + 1 * HOUR, seller: "Stormsnap", imageHint: "storm-crab" },
    { id: "auc_2", itemName: "Tidebloom Egg", itemType: "egg", rarity: "epic", faction: "coral_court", currentBid: 2400, minNextBid: 2500, bidCount: 7, topBidder: "Brinepinch", endsAt: now + 2 * HOUR, seller: "Pearlhide", imageHint: "coral-egg" },
    { id: "auc_3", itemName: "Frostwarden's Crest", itemType: "gear", rarity: "rare", faction: "frostshelf", currentBid: 1500, minNextBid: 1575, buyItNow: 2400, bidCount: 2, topBidder: "Goldfoot", endsAt: now + 3 * HOUR, seller: "Frostgrip", imageHint: "frost-gear" },
    { id: "auc_4", itemName: "Cindergear Gauntlet", itemType: "gear", rarity: "legendary", faction: "cinderreef", currentBid: 12000, minNextBid: 12300, buyItNow: 20000, bidCount: 12, topBidder: "Riftclaw", endsAt: now + 5 * HOUR, seller: "Cinderjaw", imageHint: "cinder-gear" },
    { id: "auc_5", itemName: "Moonpool Charm", itemType: "gear", rarity: "epic", faction: "moonpool", currentBid: 3200, minNextBid: 3300, buyItNow: 5000, bidCount: 4, topBidder: "Saltreaver", endsAt: now + 6 * HOUR, seller: "Moonwarden", imageHint: "moon-gear" },
    { id: "auc_6", itemName: "Kelpback's Bulwark", itemType: "crab", rarity: "uncommon", faction: "mangrove", currentBid: 350, minNextBid: 380, buyItNow: 700, bidCount: 1, topBidder: "Tidecrest", endsAt: now + 30 * 60 * 1000, seller: "Mossclaw", imageHint: "mangrove-crab" },
    { id: "auc_7", itemName: "Riftsnap Skitter", itemType: "crab", rarity: "epic", faction: "stormwake", currentBid: 5500, minNextBid: 5600, buyItNow: 9000, bidCount: 5, topBidder: "Currentleaper", endsAt: now + 12 * HOUR, seller: "Riftclaw", imageHint: "storm-crab" },
    { id: "auc_8", itemName: "Coral Court Royal Egg", itemType: "egg", rarity: "legendary", faction: "coral_court", currentBid: 25000, minNextBid: 25500, bidCount: 18, topBidder: "Oldshell", endsAt: now + 20 * HOUR, seller: "Pearlhide", imageHint: "coral-egg" },
  ];
}

function makeMockMyAuctions(playerName: string): Auction[] {
  const now = Date.now();
  return [
    {
      id: "my_auc_1",
      itemName: "Coral Bloom Pincher",
      itemType: "crab",
      rarity: "epic",
      faction: "coral_court",
      currentBid: 6000,
      minNextBid: 6100,
      buyItNow: 9000,
      bidCount: 4,
      topBidder: "Goldfoot",
      endsAt: now + 8 * HOUR,
      seller: playerName,
      imageHint: "coral-crab",
    },
    {
      id: "my_auc_2",
      itemName: "Mangrove Sentinel Egg",
      itemType: "egg",
      rarity: "uncommon",
      faction: "mangrove",
      currentBid: 0,
      minNextBid: 100,
      bidCount: 0,
      topBidder: "—",
      endsAt: now - 1 * HOUR, // expired, no bids -> relistable
      seller: playerName,
      imageHint: "mangrove-egg",
    },
  ];
}

function makeMockOffers(): Offer[] {
  const now = Date.now();
  return [
    { id: "off_1", fromUser: "Brinepinch", targetListingName: "Stormcaller Pincher", offerAmount: 700, expiresAt: now + 1 * DAY, message: "Quick sale? Can pay now." },
    { id: "off_2", fromUser: "Oldshell", targetListingName: "Tidebloom Egg", offerAmount: 2200, expiresAt: now + 2 * DAY },
    { id: "off_3", fromUser: "Riftclaw", targetListingName: "Frostwarden's Crest", offerAmount: 1400, expiresAt: now + 1 * DAY, message: "Will trade a Moonpool Charm for it." },
    { id: "off_4", fromUser: "Goldfoot", targetListingName: "Cindergear Gauntlet", offerAmount: 11000, expiresAt: now + 3 * DAY },
    { id: "off_5", fromUser: "Pearlhide", targetListingName: "Moonpool Charm", offerAmount: 3000, expiresAt: now + 6 * HOUR },
  ];
}

function gearEmoji(hint: string): string {
  if (hint.includes("cinder")) return "🛡️";
  if (hint.includes("frost")) return "❄️";
  if (hint.includes("moon")) return "🌙";
  if (hint.includes("storm")) return "⚡";
  return "⚙️";
}

function nextBidStep(current: number): number {
  return Math.max(50, Math.round(current * 0.05));
}

// ---------- Item thumbnail (CSS-built egg, living sprite for crabs, emoji for gear) ----------
function ItemThumbnail({ auction, size = 64 }: { auction: Auction; size?: number }) {
  const faction = auction.faction ? FACTIONS[auction.faction] : null;
  const accent = faction ? faction.colors.accent : "#7CF5E1";
  const primary = faction ? faction.colors.primary : "#12A7A0";
  const dark = faction ? faction.colors.dark : "#0A1B3D";

  if (auction.itemType === "egg") {
    return (
      <div
        className="relative flex items-center justify-center shrink-0 rounded-xl"
        style={{
          width: size,
          height: size,
          background: `radial-gradient(circle at 35% 30%, ${accent}33, ${dark}cc 80%)`,
          border: `1px solid ${accent}44`,
          boxShadow: `0 0 12px ${primary}44, inset 0 0 8px ${accent}22`,
        }}
        aria-hidden
      >
        <div
          style={{
            width: size * 0.46,
            height: size * 0.58,
            background: `linear-gradient(160deg, ${accent}, ${primary} 55%, ${dark})`,
            borderRadius: "50% 50% 50% 50% / 60% 60% 40% 40%",
            boxShadow: `inset 2px 2px 4px rgba(255,255,255,0.5), inset -2px -3px 5px ${dark}aa, 0 2px 6px ${dark}aa`,
          }}
        />
        <span
          className="absolute rounded-full"
          style={{
            left: "26%",
            top: "22%",
            width: size * 0.12,
            height: size * 0.12,
            background: "rgba(255,255,255,0.65)",
            filter: "blur(0.5px)",
          }}
        />
      </div>
    );
  }

  if (auction.itemType === "crab") {
    // Real living art, never an emoji: the crab's own class sheet.
    const classId = classFromItemName(auction.itemName);
    return (
      <div
        className="relative flex items-center justify-center shrink-0 rounded-xl overflow-hidden"
        style={{
          width: size,
          height: size,
          background: `radial-gradient(circle at 35% 30%, ${primary}33, ${dark}cc 80%)`,
          border: `1px solid ${accent}44`,
          boxShadow: `inset 0 0 8px ${primary}33`,
        }}
        aria-hidden
      >
        <CrabSheetSprite
          classId={classId}
          faction={auction.faction ?? CLASS_HOME_FACTION[classId]}
          size={Math.round(size * 0.92)}
          seedKey={auction.id}
        />
      </div>
    );
  }

  const emoji = gearEmoji(auction.imageHint);
  return (
    <div
      className="relative flex items-center justify-center shrink-0 rounded-xl text-2xl"
      style={{
        width: size,
        height: size,
        background: `radial-gradient(circle at 35% 30%, ${primary}33, ${dark}cc 80%)`,
        border: `1px solid ${accent}44`,
        boxShadow: `inset 0 0 8px ${primary}33`,
      }}
      aria-hidden
    >
      <span style={{ filter: `drop-shadow(0 1px 2px ${dark})` }}>{emoji}</span>
    </div>
  );
}

// ---------- Main component ----------
export function BazaarAuctionsModal({ onClose }: { onClose: () => void }) {
  const player = useGame((s) => s.player);
  const spendGold = useGame((s) => s.spendGold);
  // Escrow refunds are the player's OWN gold coming back: they route
  // through refundGold (tokenomics-exempt — never tithed, never counted
  // as minted), not the faucet/admin credit paths.
  const refundGold = useGame((s) => s.refundGold);
  const pushToast = useGame((s) => s.pushToast);

  const [tab, setTab] = useState<Tab>("auctions");
  const [mockAuctions, setMockAuctions] = useState<Auction[]>(() => makeMockAuctions());
  const [mockOffers, setMockOffers] = useState<Offer[]>(() => makeMockOffers());
  const [myAuctions, setMyAuctions] = useState<Auction[]>(() =>
    player ? makeMockMyAuctions(player.name) : []
  );
  const [playerBidAmounts, setPlayerBidAmounts] = useState<Record<string, number>>({});
  const [playerBids, setPlayerBids] = useState<Record<string, number>>({});
  const [newOfferTarget, setNewOfferTarget] = useState<string | null>(null);
  const [newOfferAmount, setNewOfferAmount] = useState<number>(0);
  const [newOfferMessage, setNewOfferMessage] = useState<string>("");
  const [newOfferExpiry, setNewOfferExpiry] = useState<string>("3");
  const [showCreateForm, setShowCreateForm] = useState<boolean>(false);
  const [newAuctionCrabId, setNewAuctionCrabId] = useState<string>("");
  const [newAuctionStartBid, setNewAuctionStartBid] = useState<number>(0);
  const [newAuctionBuyItNow, setNewAuctionBuyItNow] = useState<number>(0);
  const [newAuctionDuration, setNewAuctionDuration] = useState<number>(3);

  // Auctions tab filters / sort
  const [rarityFilter, setRarityFilter] = useState<Rarity | "all">("all");
  const [typeFilter, setTypeFilter] = useState<"all" | "crab" | "egg" | "gear">("all");
  const [sortKey, setSortKey] = useState<"ending" | "price-low" | "price-high" | "bids">("ending");

  // ticking clock for countdowns
  const [now, setNow] = useState<number>(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Refs to avoid stale closures inside the outbid simulation interval.
  const playerNameRef = useRef<string>(player?.name ?? "");
  const pushToastRef = useRef(pushToast);
  useEffect(() => {
    playerNameRef.current = player?.name ?? "";
  }, [player?.name]);
  useEffect(() => {
    pushToastRef.current = pushToast;
  }, [pushToast]);

  // ---- Bid escrow -------------------------------------------------------
  // playerBids[auctionId] is gold the player has actually paid toward a
  // bid. It used to be a one-way sink: raising a bid charged the FULL new
  // amount again, being outbid never refunded, and closing the modal
  // forfeited everything. Escrow is now refunded on outbid, on
  // Buy-It-Now, and on modal close; raising a bid charges only the delta.
  const playerBidsRef = useRef(playerBids);
  useEffect(() => {
    playerBidsRef.current = playerBids;
  }, [playerBids]);
  const addGoldRef = useRef(refundGold);
  useEffect(() => {
    addGoldRef.current = refundGold;
  }, [refundGold]);
  const mockAuctionsRef = useRef(mockAuctions);
  useEffect(() => {
    mockAuctionsRef.current = mockAuctions;
  }, [mockAuctions]);

  const refundEscrow = (auctionId: string) => {
    const held = playerBidsRef.current[auctionId];
    if (!held) return;
    addGoldRef.current(held);
    playerBidsRef.current = { ...playerBidsRef.current };
    delete playerBidsRef.current[auctionId];
    setPlayerBids((prev) => {
      const next = { ...prev };
      delete next[auctionId];
      return next;
    });
  };
  const refundEscrowRef = useRef(refundEscrow);
  refundEscrowRef.current = refundEscrow;

  // Closing the modal refunds every outstanding escrow.
  useEffect(() => {
    return () => {
      for (const [auctionId, amount] of Object.entries(playerBidsRef.current)) {
        if (amount > 0) addGoldRef.current(amount);
      }
      playerBidsRef.current = {};
    };
  }, []);

  // Outbid simulation: occasionally bump a random auction the player is leading.
  useEffect(() => {
    const id = setInterval(() => {
      if (Math.random() > 0.35) return;
      const prev = mockAuctionsRef.current;
      const candidates = prev.filter(
        (a) =>
          a.topBidder === playerNameRef.current &&
          a.endsAt > Date.now() &&
          a.bidCount > 0
      );
      if (candidates.length === 0) return;
      const target = candidates[Math.floor(Math.random() * candidates.length)];
      const newBidder =
        NPC_BIDDER_NAMES[Math.floor(Math.random() * NPC_BIDDER_NAMES.length)];
      const bump = nextBidStep(target.currentBid);
      const newBid = target.minNextBid + Math.floor(Math.random() * 3) * bump;
      const newMinNext = newBid + nextBidStep(newBid);
      // Outbid: the player's escrowed bid comes straight back.
      refundEscrowRef.current(target.id);
      pushToastRef.current({
        title: `You've been outbid on ${target.itemName}!`,
        description: `New top bid ${formatGold(newBid)} GOLD by ${newBidder}. Your escrow was refunded.`,
        variant: "warning",
      });
      setMockAuctions((current) =>
        current.map((a) =>
          a.id === target.id
            ? {
                ...a,
                currentBid: newBid,
                minNextBid: newMinNext,
                topBidder: newBidder,
                bidCount: a.bidCount + 1,
              }
            : a
        )
      );
    }, 22000);
    return () => clearInterval(id);
  }, []);

  if (!player) return null;
  // Local non-null alias so nested handler closures keep the narrowed type.
  const p = player;

  const isLocked = (p.shellwardenLevel ?? 0) < 10;

  const filteredAuctions = useMemo(() => {
    const list = mockAuctions.filter((a) => {
      if (rarityFilter !== "all" && a.rarity !== rarityFilter) return false;
      if (typeFilter !== "all" && a.itemType !== typeFilter) return false;
      return true;
    });
    const sorted = [...list];
    switch (sortKey) {
      case "ending":
        sorted.sort((a, b) => a.endsAt - b.endsAt);
        break;
      case "price-low":
        sorted.sort((a, b) => a.currentBid - b.currentBid);
        break;
      case "price-high":
        sorted.sort((a, b) => b.currentBid - a.currentBid);
        break;
      case "bids":
        sorted.sort((a, b) => b.bidCount - a.bidCount);
        break;
    }
    return sorted;
  }, [mockAuctions, rarityFilter, typeFilter, sortKey]);

  // ---- Actions ----
  function placeBid(auction: Auction, explicitBid?: number) {
    if (isLocked) {
      pushToast({ title: "Trading locked.", description: "Reach Shellwarden Level 10 to trade.", variant: "error" });
      return;
    }
    const bid = explicitBid ?? playerBidAmounts[auction.id] ?? auction.minNextBid;
    if (bid < auction.minNextBid) {
      pushToast({
        title: "Bid too low.",
        description: `Minimum next bid is ${formatGold(auction.minNextBid)} GOLD.`,
        variant: "error",
      });
      return;
    }
    // Escrow: gold already held toward this auction counts toward the
    // new bid — raising your own bid charges only the difference.
    const held = playerBids[auction.id] ?? 0;
    const delta = bid - held;
    if (p.gold < delta) {
      pushToast({ title: "Not enough GOLD.", variant: "error" });
      return;
    }
    if (delta > 0) {
      const ok = spendGold(delta);
      if (!ok) {
        pushToast({ title: "Could not place bid.", variant: "error" });
        return;
      }
    }
    const newMinNext = bid + nextBidStep(bid);
    setMockAuctions((prev) =>
      prev.map((a) =>
        a.id === auction.id
          ? { ...a, currentBid: bid, minNextBid: newMinNext, bidCount: a.bidCount + 1, topBidder: p.name }
          : a
      )
    );
    setPlayerBids((prev) => ({ ...prev, [auction.id]: bid }));
    pushToast({
      title: `Bid placed: ${formatGold(bid)} GOLD on ${auction.itemName}`,
      description: "You are now the top bidder.",
      variant: "success",
    });
  }

  function handleBuyItNow(auction: Auction) {
    if (isLocked) {
      pushToast({ title: "Trading locked.", description: "Reach Shellwarden Level 10 to trade.", variant: "error" });
      return;
    }
    const bin = auction.buyItNow;
    if (bin == null) return;
    // Escrow held on this auction counts toward the purchase price; it
    // is released (refunded) as part of buying, never forfeited.
    const held = playerBids[auction.id] ?? 0;
    if (p.gold + held < bin) {
      pushToast({ title: "Not enough GOLD.", variant: "error" });
      return;
    }
    refundEscrow(auction.id);
    const ok = spendGold(bin);
    if (!ok) {
      pushToast({ title: "Purchase failed.", variant: "error" });
      return;
    }
    setMockAuctions((prev) => prev.filter((a) => a.id !== auction.id));
    pushToast({
      title: `Purchased ${auction.itemName} for ${formatGold(bin)} GOLD`,
      description: "3.85% fee burned. Item delivered to your inventory.",
      variant: "success",
    });
  }

  function handleSendOffer() {
    if (isLocked) {
      pushToast({ title: "Trading locked.", description: "Reach Shellwarden Level 10 to trade.", variant: "error" });
      return;
    }
    const listing = MOCK_LISTINGS.find((l) => l.id === newOfferTarget);
    if (!listing) return;
    if (newOfferAmount <= 0) {
      pushToast({ title: "Enter an offer amount.", variant: "error" });
      return;
    }
    if (newOfferAmount >= listing.price) {
      pushToast({
        title: "Offer must be below list price.",
        description: `List price is ${formatGold(listing.price)} GOLD.`,
        variant: "error",
      });
      return;
    }
    if (p.gold < newOfferAmount) {
      pushToast({ title: "Not enough GOLD to back this offer.", variant: "error" });
      return;
    }
    pushToast({
      title: `Offer of ${formatGold(newOfferAmount)} GOLD sent to ${listing.seller} for ${listing.name}.`,
      description: "Sellers can accept, decline, or counter. GOLD is escrowed only when accepted.",
      variant: "success",
    });
    setNewOfferTarget(null);
    setNewOfferAmount(0);
    setNewOfferMessage("");
    setNewOfferExpiry("3");
  }

  function handleAcceptOffer(offer: Offer) {
    if (isLocked) {
      pushToast({ title: "Trading locked.", variant: "error" });
      return;
    }
    setMockOffers((prev) => prev.filter((o) => o.id !== offer.id));
    pushToast({
      title: `Offer from ${offer.fromUser} accepted.`,
      description: `${formatGold(offer.offerAmount)} GOLD received (3.85% fee burned).`,
      variant: "success",
    });
  }

  function handleDeclineOffer(offer: Offer) {
    setMockOffers((prev) => prev.filter((o) => o.id !== offer.id));
    pushToast({
      title: `Offer from ${offer.fromUser} declined.`,
      variant: "default",
    });
  }

  function handleEndAuctionEarly(auction: Auction) {
    setMyAuctions((prev) => prev.filter((a) => a.id !== auction.id));
    if (auction.bidCount > 0 && auction.topBidder !== "—") {
      pushToast({
        title: `Auction ended. Sold to ${auction.topBidder} for ${formatGold(auction.currentBid)} GOLD.`,
        description: "3.85% fee burned on sale.",
        variant: "success",
      });
    } else {
      pushToast({
        title: "Auction ended with no bids.",
        description: "Item returned to your inventory.",
        variant: "warning",
      });
    }
  }

  function handleRelist(auction: Auction) {
    const startBid = auction.minNextBid > 0 ? auction.minNextBid : 100;
    setMyAuctions((prev) =>
      prev.map((a) =>
        a.id === auction.id
          ? {
              ...a,
              endsAt: Date.now() + DAY,
              currentBid: 0,
              minNextBid: startBid,
              bidCount: 0,
              topBidder: "—",
            }
          : a
      )
    );
    pushToast({
      title: `${auction.itemName} relisted for 24h.`,
      variant: "success",
    });
  }

  function handleListAuction() {
    if (isLocked) {
      pushToast({ title: "Trading locked.", description: "Reach Shellwarden Level 10 to trade.", variant: "error" });
      return;
    }
    const crab = p.crabs.find((c) => c.id === newAuctionCrabId);
    if (!crab) {
      pushToast({ title: "Select a crab to auction.", variant: "error" });
      return;
    }
    if (newAuctionStartBid <= 0) {
      pushToast({ title: "Set a starting bid.", variant: "error" });
      return;
    }
    const durationMs = newAuctionDuration * DAY;
    const newAuction: Auction = {
      id: `my_auc_${Date.now()}`,
      itemName: crab.name,
      itemType: "crab",
      rarity: "rare",
      faction: crab.faction,
      currentBid: 0,
      minNextBid: newAuctionStartBid,
      buyItNow: newAuctionBuyItNow > 0 ? newAuctionBuyItNow : undefined,
      bidCount: 0,
      topBidder: "—",
      endsAt: Date.now() + durationMs,
      seller: p.name,
      imageHint: "player-crab",
    };
    setMyAuctions((prev) => [newAuction, ...prev]);
    pushToast({
      title: `Auction created for ${crab.name}.`,
      description: "Listing is free, 3.85% fee on sale.",
      variant: "success",
    });
    setShowCreateForm(false);
    setNewAuctionCrabId("");
    setNewAuctionStartBid(0);
    setNewAuctionBuyItNow(0);
    setNewAuctionDuration(3);
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: "auctions", label: "Auctions" },
    { id: "my-bids", label: "My Bids" },
    { id: "make-offer", label: "Make Offer" },
    { id: "my-auctions", label: "My Auctions" },
  ];

  const myBidAuctions = mockAuctions.filter((a) => playerBids[a.id] != null);

  return (
    <div
      className="modal-backdrop-enter fixed inset-0 z-[150] flex items-center justify-center p-3 sm:p-4"
      style={{ background: "rgba(4,12,32,0.78)", backdropFilter: "blur(10px)" }}
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-3xl max-h-[88vh] overflow-y-auto rounded-2xl"
        style={{
          background: "linear-gradient(170deg, #06122B 0%, #0A1B3D 55%, #051028 100%)",
          border: "1px solid rgba(18,167,160,0.45)",
          boxShadow:
            "0 16px 70px rgba(18,167,160,0.35), inset 0 0 0 1px rgba(255,209,102,0.08)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="sticky top-0 z-10 px-4 sm:px-6 pt-5 pb-3"
          style={{
            background: "linear-gradient(180deg, #06122B 70%, rgba(6,18,43,0))",
            borderBottom: "1px solid rgba(124,245,225,0.18)",
          }}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-xl shrink-0" aria-hidden>
                🏺
              </span>
              <div className="min-w-0">
                <h2
                  className="font-display text-lg sm:text-xl font-bold truncate"
                  style={{ color: "#FFD166", textShadow: "0 0 12px rgba(255,209,102,0.35)" }}
                >
                  Bazaar Auctions &amp; Offers
                </h2>
                <div className="text-[11px] sm:text-xs opacity-75" style={{ color: "#7CF5E1" }}>
                  3.85% fee on every sale. Trading unlocks at Shellwarden Level 10
                  (you are L{player.shellwardenLevel}).
                </div>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-white/60 hover:text-white w-8 h-8 flex items-center justify-center rounded-md hover:bg-white/10 shrink-0"
              aria-label="Close"
            >
              ✕
            </button>
          </div>

          {isLocked && (
            <div
              className="mt-3 px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-2"
              style={{
                background: "rgba(255,111,145,0.12)",
                border: "1px solid rgba(255,111,145,0.4)",
                color: "#FF6F91",
              }}
              role="alert"
            >
              <span aria-hidden>🔒</span>
              <span>Reach Level 10 to trade. Browsing is allowed; bids and offers are disabled.</span>
            </div>
          )}

          {/* Tabs */}
          <div className="flex gap-1 mt-3 overflow-x-auto" role="tablist">
            {tabs.map((t) => {
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  role="tab"
                  aria-selected={active}
                  onClick={() => setTab(t.id)}
                  className="relative px-3 sm:px-4 py-1.5 text-sm font-bold transition-colors whitespace-nowrap"
                  style={{ color: active ? "#7CF5E1" : "rgba(234,246,255,0.55)" }}
                >
                  {t.label}
                  {active && (
                    <span
                      className="absolute left-1 right-1 -bottom-px h-[2px] rounded-full"
                      style={{
                        background: "linear-gradient(90deg, #12A7A0, #7CF5E1)",
                        boxShadow: "0 0 8px rgba(124,245,225,0.6)",
                      }}
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Body */}
        <div className="px-4 sm:px-6 py-4 space-y-3">
          {tab === "auctions" && (
            <>
              {/* Filters */}
              <GlassPanel className="p-3">
                <div className="flex flex-wrap items-center gap-3">
                  <FilterSelect
                    label="Rarity"
                    value={rarityFilter}
                    onChange={(v) => setRarityFilter(v as Rarity | "all")}
                    options={[
                      { v: "all", l: "All" },
                      { v: "common", l: "Common" },
                      { v: "uncommon", l: "Uncommon" },
                      { v: "rare", l: "Rare" },
                      { v: "epic", l: "Epic" },
                      { v: "legendary", l: "Legendary" },
                    ]}
                  />
                  <FilterSelect
                    label="Type"
                    value={typeFilter}
                    onChange={(v) => setTypeFilter(v as typeof typeFilter)}
                    options={[
                      { v: "all", l: "All" },
                      { v: "crab", l: "Crab" },
                      { v: "egg", l: "Egg" },
                      { v: "gear", l: "Gear" },
                    ]}
                  />
                  <FilterSelect
                    label="Sort"
                    value={sortKey}
                    onChange={(v) => setSortKey(v as typeof sortKey)}
                    options={[
                      { v: "ending", l: "Ending soon" },
                      { v: "price-low", l: "Price low-high" },
                      { v: "price-high", l: "Price high-low" },
                      { v: "bids", l: "Most bids" },
                    ]}
                  />
                  <div className="ml-auto text-xs flex items-center gap-1.5" style={{ color: "rgba(234,246,255,0.7)" }}>
                    <GoldIcon size={14} />
                    <span>{formatGold(player.gold)} GOLD</span>
                  </div>
                </div>
              </GlassPanel>

              {filteredAuctions.length === 0 ? (
                <EmptyState message="No auctions match your filters." hint="Try widening the rarity or type filter." />
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {filteredAuctions.map((a) => (
                    <AuctionCard
                      key={a.id}
                      auction={a}
                      now={now}
                      playerName={player.name}
                      bidValue={playerBidAmounts[a.id]}
                      onBidChange={(v) =>
                        setPlayerBidAmounts((prev) => ({ ...prev, [a.id]: v }))
                      }
                      onPlaceBid={() => placeBid(a)}
                      onBuyItNow={() => handleBuyItNow(a)}
                      isLocked={isLocked}
                    />
                  ))}
                </div>
              )}
            </>
          )}

          {tab === "my-bids" && (
            <>
              {myBidAuctions.length === 0 ? (
                <EmptyState message="You haven't placed any bids yet." hint="Browse the Auctions tab and place your first bid." />
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {myBidAuctions.map((a) => {
                    const leading = a.topBidder === player.name;
                    const expired = a.endsAt <= now;
                    return (
                      <GlassPanel key={a.id} className="p-3 sm:p-4" glow={leading ? "rgba(124,245,225,0.18)" : undefined}>
                        <div className="flex items-start gap-3">
                          <ItemThumbnail auction={a} />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-display font-bold text-sm truncate" style={{ color: "#EAF6FF" }}>
                                {a.itemName}
                              </span>
                              <RarityBadge rarity={a.rarity} />
                              {a.faction && <FactionBadge faction={a.faction} size={14} showName />}
                            </div>
                            <div className="mt-1 flex items-center gap-2 flex-wrap">
                              <span
                                className="text-[10px] font-bold px-1.5 py-0.5 rounded-md uppercase"
                                style={{
                                  background: leading ? "rgba(79,180,119,0.18)" : "rgba(255,111,145,0.18)",
                                  color: leading ? "#4FB477" : "#FF6F91",
                                  border: `1px solid ${leading ? "rgba(79,180,119,0.4)" : "rgba(255,111,145,0.4)"}`,
                                }}
                              >
                                {expired ? "Ended" : leading ? "Leading" : "Outbid"}
                              </span>
                              <span className="text-[11px]" style={{ color: "rgba(234,246,255,0.7)" }}>
                                {a.bidCount} bid{a.bidCount === 1 ? "" : "s"}
                              </span>
                              <span className="text-[11px]" style={{ color: "rgba(234,246,255,0.6)" }}>
                                by {a.topBidder}
                              </span>
                            </div>
                          </div>
                          <div className="flex flex-col items-center gap-1 shrink-0">
                            <CountdownRing
                              progress={Math.max(0, Math.min(1, (a.endsAt - now) / DAY))}
                              size={42}
                              color={a.endsAt - now < HOUR ? "#FF6F91" : "#7CF5E1"}
                              label={
                                <span className="text-[9px] font-bold">
                                  {expired ? "END" : formatTime(a.endsAt - now)}
                                </span>
                              }
                            />
                          </div>
                        </div>

                        <div className="mt-3 flex items-center justify-between gap-2">
                          <div className="text-xs" style={{ color: "rgba(234,246,255,0.7)" }}>
                            Current bid:{" "}
                            <span className="font-bold inline-flex items-center gap-1" style={{ color: "#FFD166" }}>
                              <GoldIcon size={12} />
                              {formatGold(a.currentBid)}
                            </span>
                          </div>
                          {!expired && !leading && (
                            <GlowButton
                              variant="gold"
                              size="sm"
                              disabled={isLocked}
                              onClick={() => placeBid(a, a.minNextBid)}
                            >
                              Re-bid {formatGold(a.minNextBid)}
                            </GlowButton>
                          )}
                        </div>
                      </GlassPanel>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {tab === "make-offer" && (
            <>
              <GlassPanel className="p-3">
                <div className="text-xs" style={{ color: "rgba(124,245,225,0.85)" }}>
                  Make an offer on any fixed-price listing. Offers are non-binding — sellers can
                  accept, decline, or counter. GOLD is only escrowed when accepted.
                </div>
              </GlassPanel>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {MOCK_LISTINGS.map((l) => {
                  const selected = newOfferTarget === l.id;
                  return (
                    <GlassPanel
                      key={l.id}
                      className="p-3 cursor-pointer"
                      glow={selected ? "rgba(255,209,102,0.25)" : undefined}
                    >
                      <div
                        onClick={() => {
                          setNewOfferTarget(selected ? null : l.id);
                          setNewOfferAmount(0);
                        }}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 flex-wrap min-w-0">
                            <span className="font-display font-bold text-sm truncate" style={{ color: "#EAF6FF" }}>
                              {l.name}
                            </span>
                            <RarityBadge rarity={l.rarity} />
                            {l.faction && <FactionBadge faction={l.faction} size={14} />}
                          </div>
                          <span
                            className="text-xs font-bold inline-flex items-center gap-1 whitespace-nowrap"
                            style={{ color: "#FFD166" }}
                          >
                            <GoldIcon size={12} />
                            {formatGold(l.price)}
                          </span>
                        </div>
                        <div className="mt-1 text-[11px]" style={{ color: "rgba(234,246,255,0.6)" }}>
                          Seller: {l.seller} · Type: {l.type}
                        </div>
                      </div>

                      {selected && (
                        <div className="mt-3 pt-3 border-t border-white/10 space-y-2">
                          <div className="text-[11px]" style={{ color: "rgba(234,246,255,0.7)" }}>
                            List price {formatGold(l.price)} GOLD — your offer must be lower.
                          </div>
                          <label className="block text-[10px] uppercase tracking-wide text-white/55">
                            Offer amount (GOLD)
                          </label>
                          <input
                            type="number"
                            min={0}
                            value={newOfferAmount || ""}
                            onChange={(e) => setNewOfferAmount(Math.max(0, Number(e.target.value)))}
                            className="w-full px-2.5 py-1.5 rounded-lg text-sm font-bold"
                            style={{
                              background: "rgba(10,27,61,0.7)",
                              border: "1px solid rgba(124,245,225,0.25)",
                              color: "#EAF6FF",
                            }}
                            placeholder={String(Math.round(l.price * 0.8))}
                          />
                          <label className="block text-[10px] uppercase tracking-wide text-white/55">
                            Message (optional)
                          </label>
                          <input
                            type="text"
                            value={newOfferMessage}
                            onChange={(e) => setNewOfferMessage(e.target.value)}
                            className="w-full px-2.5 py-1.5 rounded-lg text-sm"
                            style={{
                              background: "rgba(10,27,61,0.7)",
                              border: "1px solid rgba(124,245,225,0.25)",
                              color: "#EAF6FF",
                            }}
                            placeholder="Add a note for the seller…"
                            maxLength={120}
                          />
                          <label className="block text-[10px] uppercase tracking-wide text-white/55">
                            Expiry
                          </label>
                          <select
                            value={newOfferExpiry}
                            onChange={(e) => setNewOfferExpiry(e.target.value)}
                            className="w-full px-2.5 py-1.5 rounded-lg text-sm"
                            style={{
                              background: "rgba(10,27,61,0.7)",
                              border: "1px solid rgba(124,245,225,0.25)",
                              color: "#EAF6FF",
                            }}
                          >
                            <option value="1">1 day</option>
                            <option value="3">3 days</option>
                            <option value="7">7 days</option>
                          </select>
                          <div className="flex justify-end pt-1">
                            <GlowButton variant="teal" size="sm" disabled={isLocked} onClick={handleSendOffer}>
                              Send Offer
                            </GlowButton>
                          </div>
                        </div>
                      )}
                    </GlassPanel>
                  );
                })}
              </div>

              {/* Inbound offers preview */}
              <div className="pt-2">
                <div
                  className="text-xs font-bold mb-2 flex items-center gap-1.5"
                  style={{ color: "#FFD166" }}
                >
                  <span aria-hidden>📥</span>
                  <span>Inbound offers on your listings ({mockOffers.length})</span>
                </div>
                {mockOffers.length === 0 ? (
                  <EmptyState compact message="No inbound offers right now." />
                ) : (
                  <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                    {mockOffers.map((o) => (
                      <GlassPanel key={o.id} className="p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="text-sm font-bold truncate" style={{ color: "#EAF6FF" }}>
                              {o.fromUser} → {o.targetListingName}
                            </div>
                            {o.message && (
                              <div className="text-[11px] mt-0.5 italic opacity-70 truncate">
                                “{o.message}”
                              </div>
                            )}
                            <div className="text-[11px] mt-0.5" style={{ color: "rgba(234,246,255,0.6)" }}>
                              Expires in {formatTime(o.expiresAt - now)}
                            </div>
                          </div>
                          <span
                            className="text-sm font-bold inline-flex items-center gap-1 whitespace-nowrap"
                            style={{ color: "#FFD166" }}
                          >
                            <GoldIcon size={12} />
                            {formatGold(o.offerAmount)}
                          </span>
                        </div>
                        <div className="mt-2 flex justify-end gap-2">
                          <GlowButton
                            variant="ghost"
                            size="sm"
                            disabled={isLocked}
                            onClick={() => handleDeclineOffer(o)}
                          >
                            Decline
                          </GlowButton>
                          <GlowButton
                            variant="gold"
                            size="sm"
                            disabled={isLocked}
                            onClick={() => handleAcceptOffer(o)}
                          >
                            Accept
                          </GlowButton>
                        </div>
                      </GlassPanel>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          {tab === "my-auctions" && (
            <>
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs" style={{ color: "rgba(124,245,225,0.85)" }}>
                  Your active auctions — atomic, 3.85% fee on sale.
                </div>
                <GlowButton
                  variant="teal"
                  size="sm"
                  disabled={isLocked}
                  onClick={() => setShowCreateForm((v) => !v)}
                >
                  {showCreateForm ? "Cancel" : "+ Create New Auction"}
                </GlowButton>
              </div>

              {showCreateForm && (
                <GlassPanel className="p-3 sm:p-4">
                  <div className="text-sm font-bold mb-2" style={{ color: "#FFD166" }}>
                    List a crab as a timed auction
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] uppercase tracking-wide text-white/55 mb-1">
                        Crab
                      </label>
                      <select
                        value={newAuctionCrabId}
                        onChange={(e) => setNewAuctionCrabId(e.target.value)}
                        className="w-full px-2.5 py-1.5 rounded-lg text-sm"
                        style={{
                          background: "rgba(10,27,61,0.7)",
                          border: "1px solid rgba(124,245,225,0.25)",
                          color: "#EAF6FF",
                        }}
                      >
                        <option value="">Select a crab…</option>
                        {player.crabs
                          .filter((c) => c.activity === "idle")
                          .map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name} (Lvl {c.level}, {c.faction})
                            </option>
                          ))}
                      </select>
                      {player.crabs.filter((c) => c.activity === "idle").length === 0 && (
                        <div className="text-[10px] mt-1" style={{ color: "#FF6F91" }}>
                          No idle crabs available to list.
                        </div>
                      )}
                    </div>
                    <div>
                      <label className="block text-[10px] uppercase tracking-wide text-white/55 mb-1">
                        Starting bid (GOLD)
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={newAuctionStartBid || ""}
                        onChange={(e) => setNewAuctionStartBid(Math.max(0, Number(e.target.value)))}
                        className="w-full px-2.5 py-1.5 rounded-lg text-sm font-bold"
                        style={{
                          background: "rgba(10,27,61,0.7)",
                          border: "1px solid rgba(124,245,225,0.25)",
                          color: "#EAF6FF",
                        }}
                        placeholder="100"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] uppercase tracking-wide text-white/55 mb-1">
                        Buy It Now (optional)
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={newAuctionBuyItNow || ""}
                        onChange={(e) => setNewAuctionBuyItNow(Math.max(0, Number(e.target.value)))}
                        className="w-full px-2.5 py-1.5 rounded-lg text-sm font-bold"
                        style={{
                          background: "rgba(10,27,61,0.7)",
                          border: "1px solid rgba(124,245,225,0.25)",
                          color: "#EAF6FF",
                        }}
                        placeholder="Leave empty for no BIN"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] uppercase tracking-wide text-white/55 mb-1">
                        Duration
                      </label>
                      <select
                        value={String(newAuctionDuration)}
                        onChange={(e) => setNewAuctionDuration(Number(e.target.value))}
                        className="w-full px-2.5 py-1.5 rounded-lg text-sm"
                        style={{
                          background: "rgba(10,27,61,0.7)",
                          border: "1px solid rgba(124,245,225,0.25)",
                          color: "#EAF6FF",
                        }}
                      >
                        <option value="1">1 day</option>
                        <option value="3">3 days</option>
                        <option value="7">7 days</option>
                      </select>
                    </div>
                  </div>
                  <div className="flex justify-end mt-3">
                    <GlowButton variant="gold" size="sm" disabled={isLocked} onClick={handleListAuction}>
                      List Auction
                    </GlowButton>
                  </div>
                </GlassPanel>
              )}

              {myAuctions.length === 0 ? (
                <EmptyState
                  message="You have no active auctions. List a crab to start."
                  hint="Use the Create New Auction button above."
                />
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {myAuctions.map((a) => {
                    const expired = a.endsAt <= now;
                    const noBids = a.bidCount === 0;
                    return (
                      <GlassPanel key={a.id} className="p-3 sm:p-4">
                        <div className="flex items-start gap-3">
                          <ItemThumbnail auction={a} />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-display font-bold text-sm truncate" style={{ color: "#EAF6FF" }}>
                                {a.itemName}
                              </span>
                              <RarityBadge rarity={a.rarity} />
                              {a.faction && <FactionBadge faction={a.faction} size={14} showName />}
                            </div>
                            <div className="mt-1 text-[11px]" style={{ color: "rgba(234,246,255,0.7)" }}>
                              {a.bidCount} bid{a.bidCount === 1 ? "" : "s"} · top: {a.topBidder}
                            </div>
                            <div className="mt-1 text-[11px] flex items-center gap-1" style={{ color: "rgba(234,246,255,0.7)" }}>
                              <CountdownRing
                                progress={Math.max(0, Math.min(1, (a.endsAt - now) / DAY))}
                                size={28}
                                stroke={3}
                                color={expired ? "#FF6F91" : a.endsAt - now < HOUR ? "#FFD166" : "#7CF5E1"}
                              />
                              <span style={{ color: expired ? "#FF6F91" : "#7CF5E1", fontWeight: 700 }}>
                                {expired ? "Ended" : formatTime(a.endsAt - now)}
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="mt-3 flex items-center justify-between gap-2">
                          <div className="text-xs" style={{ color: "rgba(234,246,255,0.7)" }}>
                            Current bid:{" "}
                            <span className="font-bold inline-flex items-center gap-1" style={{ color: "#FFD166" }}>
                              <GoldIcon size={12} />
                              {formatGold(a.currentBid)}
                            </span>
                          </div>
                          <div className="flex gap-2">
                            {expired && noBids && (
                              <GlowButton variant="ghost" size="sm" onClick={() => handleRelist(a)}>
                                Relist
                              </GlowButton>
                            )}
                            <GlowButton
                              variant="rose"
                              size="sm"
                              disabled={isLocked}
                              onClick={() => handleEndAuctionEarly(a)}
                            >
                              End Auction Early
                            </GlowButton>
                          </div>
                        </div>
                      </GlassPanel>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div
          className="sticky bottom-0 px-4 sm:px-6 py-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2"
          style={{
            background: "linear-gradient(0deg, #06122B 70%, rgba(6,18,43,0))",
            borderTop: "1px solid rgba(124,245,225,0.18)",
          }}
        >
          <div className="text-[10px] leading-snug max-w-xl" style={{ color: "rgba(234,246,255,0.6)" }}>
            Auctions are atomic. The 3.85% fee is removed from the economy. Anti-laundering caps
            apply: max 20 trades/day for accounts under 30 days old.{" "}
            <button
              className="underline hover:text-white"
              onClick={() =>
                pushToast({ title: "Past auctions", description: "Archive coming soon.", variant: "default" })
              }
            >
              Past auctions
            </button>
          </div>
          <GlowButton variant="teal" size="sm" onClick={onClose}>
            Close
          </GlowButton>
        </div>
      </div>
    </div>
  );
}

// ---------- Auction card (Auctions tab) ----------
function AuctionCard({
  auction,
  now,
  playerName,
  bidValue,
  onBidChange,
  onPlaceBid,
  onBuyItNow,
  isLocked,
}: {
  auction: Auction;
  now: number;
  playerName: string;
  bidValue: number;
  onBidChange: (v: number) => void;
  onPlaceBid: () => void;
  onBuyItNow: () => void;
  isLocked: boolean;
}) {
  const remaining = auction.endsAt - now;
  const expired = remaining <= 0;
  const isLeading = auction.topBidder === playerName;
  const ringProgress = Math.max(0, Math.min(1, remaining / DAY));
  const ringColor = expired ? "#FF6F91" : remaining < HOUR ? "#FFD166" : "#7CF5E1";

  return (
    <GlassPanel
      className="p-3 sm:p-4"
      glow={isLeading ? "rgba(124,245,225,0.16)" : undefined}
    >
      <div className="flex items-start gap-3">
        <ItemThumbnail auction={auction} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-display font-bold text-sm truncate" style={{ color: "#EAF6FF" }}>
              {auction.itemName}
            </span>
            <RarityBadge rarity={auction.rarity} />
            {auction.faction && <FactionBadge faction={auction.faction} size={14} showName />}
          </div>
          <div className="mt-1 flex items-center gap-2 flex-wrap">
            {isLeading && (
              <span
                className="text-[10px] font-bold px-1.5 py-0.5 rounded-md uppercase"
                style={{
                  background: "rgba(79,180,119,0.18)",
                  color: "#4FB477",
                  border: "1px solid rgba(79,180,119,0.4)",
                }}
              >
                You're leading
              </span>
            )}
            <span className="text-[11px]" style={{ color: "rgba(234,246,255,0.6)" }}>
              by {auction.topBidder}
            </span>
            <span className="text-[11px]" style={{ color: "rgba(234,246,255,0.6)" }}>
              · {auction.bidCount} bid{auction.bidCount === 1 ? "" : "s"}
            </span>
          </div>
          <div className="mt-1 text-[11px]" style={{ color: "rgba(234,246,255,0.55)" }}>
            Seller: {auction.seller}
          </div>
        </div>
        <div className="flex flex-col items-center gap-1 shrink-0">
          <CountdownRing
            progress={ringProgress}
            size={44}
            color={ringColor}
            label={
              <span className="text-[9px] font-bold" style={{ color: ringColor }}>
                {expired ? "END" : formatTime(remaining)}
              </span>
            }
            glow={remaining < HOUR && !expired}
          />
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <div
          className="rounded-lg px-2 py-1"
          style={{ background: "rgba(10,27,61,0.5)", border: "1px solid rgba(124,245,225,0.15)" }}
        >
          <div className="text-[9px] uppercase tracking-wide text-white/50">Current bid</div>
          <div className="text-sm font-bold inline-flex items-center gap-1" style={{ color: "#FFD166" }}>
            <GoldIcon size={12} />
            {formatGold(auction.currentBid)}
          </div>
        </div>
        <div
          className="rounded-lg px-2 py-1"
          style={{ background: "rgba(10,27,61,0.5)", border: "1px solid rgba(124,245,225,0.15)" }}
        >
          <div className="text-[9px] uppercase tracking-wide text-white/50">Min next bid</div>
          <div className="text-sm font-bold" style={{ color: "#7CF5E1" }}>
            {formatGold(auction.minNextBid)}
          </div>
        </div>
      </div>

      {!expired ? (
        <div className="mt-3 flex items-center gap-2">
          <div className="relative flex-1">
            <input
              type="number"
              min={0}
              value={bidValue || ""}
              onChange={(e) => onBidChange(Math.max(0, Number(e.target.value)))}
              disabled={isLocked}
              className="w-full px-2.5 py-1.5 rounded-lg text-sm font-bold pr-12"
              style={{
                background: "rgba(10,27,61,0.7)",
                border: "1px solid rgba(124,245,225,0.25)",
                color: "#EAF6FF",
              }}
              placeholder={String(auction.minNextBid)}
              aria-label={`Bid amount for ${auction.itemName}`}
            />
            <span
              className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-bold"
              style={{ color: "rgba(234,246,255,0.5)" }}
            >
              GOLD
            </span>
          </div>
          <GlowButton variant="teal" size="sm" disabled={isLocked} onClick={onPlaceBid}>
            Place Bid
          </GlowButton>
        </div>
      ) : (
        <div
          className="mt-3 text-center text-xs font-bold py-2 rounded-lg"
          style={{ background: "rgba(255,111,145,0.1)", color: "#FF6F91", border: "1px solid rgba(255,111,145,0.3)" }}
        >
          Auction ended
        </div>
      )}

      {auction.buyItNow != null && !expired && (
        <div className="mt-2 flex items-center justify-between gap-2">
          <span className="text-[11px]" style={{ color: "rgba(234,246,255,0.6)" }}>
            Buy It Now:{" "}
            <span className="font-bold inline-flex items-center gap-1" style={{ color: "#FFD166" }}>
              <GoldIcon size={11} />
              {formatGold(auction.buyItNow)}
            </span>
          </span>
          <GlowButton variant="gold" size="sm" disabled={isLocked} onClick={onBuyItNow}>
            Buy It Now
          </GlowButton>
        </div>
      )}
    </GlassPanel>
  );
}

// ---------- Filter select helper ----------
function FilterSelect<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (v: string) => void;
  options: { v: T; l: string }[];
}) {
  return (
    <label className="flex items-center gap-1.5 text-[11px]" style={{ color: "rgba(234,246,255,0.75)" }}>
      <span className="uppercase tracking-wide text-white/55">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="px-2 py-1 rounded-md text-[11px] font-bold"
        style={{
          background: "rgba(10,27,61,0.7)",
          border: "1px solid rgba(124,245,225,0.25)",
          color: "#EAF6FF",
        }}
      >
        {options.map((o) => (
          <option key={o.v} value={o.v}>
            {o.l}
          </option>
        ))}
      </select>
    </label>
  );
}

export default BazaarAuctionsModal;
