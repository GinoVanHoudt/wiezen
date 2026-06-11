import { Card, Rank, Seat, Suit } from './types.js';

export const SUITS: readonly Suit[] = ['H', 'D', 'C', 'S'];
export const RANKS: readonly Rank[] = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];

export function card(suit: Suit, rank: Rank): Card {
  return `${suit}${rank}`;
}

export function suitOf(c: Card): Suit {
  return c[0] as Suit;
}

export function rankOf(c: Card): Rank {
  return Number(c.slice(1)) as Rank;
}

export function fullDeck(): Card[] {
  const deck: Card[] = [];
  for (const s of SUITS) for (const r of RANKS) deck.push(card(s, r));
  return deck;
}

/** Deterministic 32-bit hash of a string (FNV-1a). */
function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32 PRNG. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffledDeck(seedString: string): Card[] {
  const rng = mulberry32(hashString(seedString));
  const deck = fullDeck();
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const a = deck[i]!;
    deck[i] = deck[j]!;
    deck[j] = a;
  }
  return deck;
}

/** Deal 13 cards to each seat (packets are irrelevant for software; order comes from the shuffle). */
export function dealHands(seedString: string): Card[][] {
  const deck = shuffledDeck(seedString);
  const hands: Card[][] = [[], [], [], []];
  deck.forEach((c, i) => hands[i % 4]!.push(c));
  for (const h of hands) sortHand(h);
  return hands;
}

const SUIT_ORDER: Record<Suit, number> = { S: 0, H: 1, C: 2, D: 3 };

/** Sort for display: alternating colours, descending rank. */
export function sortHand(hand: Card[]): Card[] {
  hand.sort((a, b) => {
    const sa = SUIT_ORDER[suitOf(a)];
    const sb = SUIT_ORDER[suitOf(b)];
    if (sa !== sb) return sa - sb;
    return rankOf(b) - rankOf(a);
  });
  return hand;
}

export function nextSeat(seat: Seat): Seat {
  return ((seat + 1) % 4) as Seat;
}

export function cardsOfSuit(hand: readonly Card[], suit: Suit): Card[] {
  return hand.filter((c) => suitOf(c) === suit);
}
