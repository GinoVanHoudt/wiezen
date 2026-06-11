/**
 * Core types for the kleurenwiezen engine.
 *
 * All state is plain JSON-serializable data so it can be stored in Firestore
 * and passed between client and Cloud Functions unchanged.
 */

/** H = harten, D = ruiten/koeken, C = klaveren, S = schoppen */
export type Suit = 'H' | 'D' | 'C' | 'S';

/** 2..10, 11 = J, 12 = Q, 13 = K, 14 = A */
export type Rank = 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14;

/** A card encoded as `${Suit}${Rank}`, e.g. 'H14' = ace of hearts. */
export type Card = string;

export type Seat = 0 | 1 | 2 | 3;

export const SEATS: readonly Seat[] = [0, 1, 2, 3];

export type ContractKind =
  | 'samen' // vraag & meegaan
  | 'alleen'
  | 'kleineMiserie'
  | 'piccolo'
  | 'troel'
  | 'abondance'
  | 'groteMiserie'
  | 'openMiserie'
  | 'soloSlim';

export interface Bid {
  kind: ContractKind;
  /** samen: 8-13, alleen: 5-8, abondance: 9-12. Absent for fixed-size contracts. */
  tricks?: number;
  /** Trump suit for samen/alleen/abondance/soloSlim; absent for negative contracts and troel (derived). */
  suit?: Suit;
}

/** An action a seat can take. Returned by legalActions, accepted by applyAction. */
export type Action =
  | { type: 'pass' }
  | { type: 'wachten' }
  | { type: 'vraag'; suit: Suit }
  | { type: 'meegaan'; tricks: number }
  | { type: 'alleen'; tricks: number }
  | { type: 'abondance'; tricks: number; suit: Suit }
  | { type: 'miserie'; variant: 'klein' | 'groot' | 'open' }
  | { type: 'piccolo' }
  | { type: 'soloSlim'; suit: Suit }
  | { type: 'raise' } // acceptor (or proposer after parole) raises samen to the minimum outbidding level
  | { type: 'parole' } // passe parole: acceptor hands the raise decision to the proposer
  | { type: 'troelKeep' }
  | { type: 'troelSwitch'; suit: Suit }
  | { type: 'discard'; card: Card }
  | { type: 'play'; card: Card };

export interface BidRecord {
  seat: Seat;
  action: Action;
}

export type PendingKind =
  | 'pairRaise' // partnership outbid: acceptor must raise / parole / pass
  | 'parole' // proposer must take up the raise or pass
  | 'boundSolo'; // partnership broke: the bound seat must go alleen in the agreed suit or pass

export interface Auction {
  turn: Seat;
  firstSpeaker: Seat;
  passed: Seat[];
  /** Seats that have had at least one normal speaking turn (first-turn-only contracts). */
  spokenOnce: Seat[];
  /** First speaker said 'wachten' and may later only accept or pass. */
  waiting: boolean;
  /** Live proposal (vraag). Once accepted, the pair holds a standing samen bid. */
  proposal?: { seat: Seat; suit: Suit; acceptedBy?: Seat };
  /** Current partnership commitment level (8 once accepted, raised when outbid). */
  samenLevel: number;
  /** Standing highest non-partnership bid, with its declarers (negatives can have several). */
  high?: { bid: Bid; seats: Seat[] };
  /** Mandatory troel declaration, set at deal time. */
  troel?: {
    caller: Seat;
    partner: Seat;
    aces: 3 | 4;
    /** Suit of the 4th ace (3 aces) or hearts (4 aces). */
    trump: Suit;
    /** Card the partner must lead to trick 1 (4th ace or highest outside heart). */
    forcedLead: Card;
  };
  pending?: { seat: Seat; kind: PendingKind };
  bids: BidRecord[];
}

export interface Contract {
  bid: Bid;
  /** The seat(s) committed to the contract. Pair contracts list [proposer, acceptor] / [caller, partner]. */
  declarers: Seat[];
  trump: Suit | null;
  tricksNeeded: number;
  /** Troel: the exact card the partner must lead to trick 1. */
  forcedLead?: Card;
  /** Seat that leads trick 1. */
  leader: Seat;
}

export interface TrickRecord {
  cards: { seat: Seat; card: Card }[];
  winner: Seat;
}

export interface PlayState {
  turn: Seat;
  trick: { seat: Seat; card: Card }[];
  tricksWon: number[];
  completedTricks: TrickRecord[];
  /** 13, or 12 for kleine miserie. */
  totalTricks: number;
}

export type Phase =
  | 'bidding'
  | 'troelTrump' // troel won the auction; partner may keep or switch trump
  | 'discard' // kleine miserie: everyone discards one card
  | 'playing'
  | 'scored';

export interface RuleConfig {
  /** Multiply the next played hand after a passed-out deal. */
  doubleAfterAllPass: boolean;
}

export const DEFAULT_CONFIG: RuleConfig = {
  doubleAfterAllPass: true,
};

export interface GameState {
  config: RuleConfig;
  /** Secret RNG seed for this game; never sent to clients. */
  seed: string;
  handNumber: number;
  /** Number of redeals within this hand (rondje pas), used to vary the shuffle. */
  redeals: number;
  phase: Phase;
  dealer: Seat;
  hands: Card[][];
  /** Kleine miserie: one discarded card per seat (null until chosen). */
  discards?: (Card | null)[];
  auction: Auction;
  contract?: Contract;
  play?: PlayState;
  /** True when the next played hand scores double (after rondje pas). */
  doubleNext: boolean;
  /** Cumulative score per seat across hands. */
  scores: number[];
  /** Deltas of the most recently scored hand. */
  lastHandDeltas?: number[];
  /** Human-readable result of the last hand. */
  lastHandSummary?: string;
}

/** What one player is allowed to see. */
export interface PlayerView {
  seat: Seat;
  phase: Phase;
  dealer: Seat;
  hand: Card[];
  handCounts: number[];
  auction: Auction;
  contract?: Contract;
  play?: PlayState;
  /** Open miserie: declarer's hand exposed after trick 1. */
  exposedHands?: { seat: Seat; cards: Card[] }[];
  doubleNext: boolean;
  scores: number[];
  lastHandDeltas?: number[];
  lastHandSummary?: string;
  handNumber: number;
}

export class GameError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GameError';
  }
}
