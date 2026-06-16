import { beats, bidRank, isJoinable, minAlleenOver, minSamenToLead } from './bids.js';
import { card, cardsOfSuit, dealHands, nextSeat, rankOf, suitOf, SUITS } from './cards.js';
import {
  Action,
  Auction,
  Bid,
  Card,
  Contract,
  GameError,
  GameState,
  Rank,
  SEATS,
  Seat,
  Suit,
} from './types.js';

/**
 * Engine simplifications, documented against RULES.md:
 * - Troel is declared automatically at deal time (declaration is mandatory anyway).
 * - Troel caller/partner do not overcall their own troel.
 * - Each player may propose (vraag) at most once; a suit already live cannot be re-proposed.
 *   New proposals are only allowed before any partnership is accepted; once a pair forms
 *   the other still-open proposals can be joined (forming a competing pair) but no new
 *   suits may be introduced.
 * - Raise mechanic (house rule, RULES.md §2.5): when a pair must raise, the acceptor
 *   chooses to raise or to hand off to the proposer (parole); the proposer then chooses
 *   to raise or to pass. A pass drops the pair out entirely (no bound-solo).
 */

type Prop = Auction['proposals'][number];

function proposalsOf(a: Auction): Prop[] {
  return a.proposals;
}

/** Proposals still seeking a partner (not yet accepted, not dropped). */
function openProposals(a: Auction): Prop[] {
  return proposalsOf(a).filter((p) => p.acceptedBy === undefined && !p.dropped);
}

/** Standing partnerships (accepted and still live). At most two can coexist. */
function acceptedPairs(a: Auction): Prop[] {
  return proposalsOf(a).filter((p) => p.acceptedBy !== undefined && !p.dropped);
}

/** A live proposal keyed by its proposer seat (one proposal per player). */
function propBySeat(a: Auction, seat: Seat): Prop | undefined {
  return proposalsOf(a).find((p) => p.seat === seat && !p.dropped);
}

function samenBidOf(p: Prop): Bid {
  return { kind: 'samen', tricks: p.level!, suit: p.suit };
}

function isCommitted(a: Auction, seat: Seat): boolean {
  return acceptedPairs(a).some((p) => p.seat === seat || p.acceptedBy === seat);
}

/** Detect mandatory troel in the dealt hands. */
export function detectTroel(hands: Card[][]): Auction['troel'] {
  for (const seat of SEATS) {
    const aces = hands[seat]!.filter((c) => rankOf(c) === 14);
    if (aces.length === 3) {
      const missing = (['H', 'D', 'C', 'S'] as Suit[]).find((s) => !aces.some((c) => suitOf(c) === s))!;
      const fourthAce = card(missing, 14);
      const partner = SEATS.find((s) => hands[s]!.includes(fourthAce))!;
      return { caller: seat, partner, aces: 3, trump: missing, forcedLead: fourthAce };
    }
    if (aces.length === 4) {
      const callerHearts = new Set(cardsOfSuit(hands[seat]!, 'H'));
      for (let r = 13; r >= 2; r--) {
        const c = card('H', r as Rank);
        if (!callerHearts.has(c)) {
          const partner = SEATS.find((s) => hands[s]!.includes(c))!;
          return { caller: seat, partner, aces: 4, trump: 'H', forcedLead: c };
        }
      }
    }
  }
  return undefined;
}

export function startAuction(hands: Card[][], dealer: Seat): Auction {
  const firstSpeaker = nextSeat(dealer);
  const troel = detectTroel(hands);
  const auction: Auction = {
    turn: firstSpeaker,
    firstSpeaker,
    passed: [],
    spokenOnce: [],
    waiting: false,
    proposals: [],
    bids: [],
    troel,
  };
  if (troel) {
    // Troel stands as a normal bid on the ladder, held by caller and partner.
    auction.high = { bid: { kind: 'troel' }, seats: [troel.caller, troel.partner] };
    // Caller and partner are committed; only the other two seats may overcall.
    auction.turn = firstActiveFrom(auction, firstSpeaker);
  }
  return auction;
}

/** The bid currently to beat across all standing partnerships and the solo/negative high. */
export function effectiveHigh(a: Auction): { bid: Bid; seats: Seat[] } | undefined {
  let best = a.high;
  for (const p of acceptedPairs(a)) {
    const cand = { bid: samenBidOf(p), seats: [p.seat, p.acceptedBy!] };
    if (!best || beats(cand.bid, best.bid)) best = cand;
  }
  return best;
}

/** The bid to beat for `pairSeat`'s pair: everything except that pair's own samen bid. */
function highExcludingPair(a: Auction, pairSeat: Seat): Bid | undefined {
  let best = a.high?.bid;
  for (const p of acceptedPairs(a)) {
    if (p.seat === pairSeat) continue;
    const bid = samenBidOf(p);
    if (!best || beats(bid, best)) best = bid;
  }
  return best;
}

function isHighHolder(a: Auction, seat: Seat): boolean {
  const high = effectiveHigh(a);
  return !!high && high.seats.includes(seat);
}

function isActive(a: Auction, seat: Seat): boolean {
  return !a.passed.includes(seat) && !isHighHolder(a, seat);
}

function firstActiveFrom(a: Auction, from: Seat): Seat {
  let s = from;
  for (let i = 0; i < 4; i++) {
    if (isActive(a, s)) return s;
    s = nextSeat(s);
  }
  return from; // no active seat; auction will resolve
}

function hasActiveSeat(a: Auction): boolean {
  return SEATS.some((s) => isActive(a, s));
}

/** Previous abondance bid by this seat (for same-suit raises). */
function ownAbondance(a: Auction, seat: Seat): Bid | undefined {
  for (let i = a.bids.length - 1; i >= 0; i--) {
    const r = a.bids[i]!;
    if (r.seat === seat && r.action.type === 'abondance') {
      return { kind: 'abondance', tricks: r.action.tricks, suit: r.action.suit };
    }
  }
  return undefined;
}

export function legalAuctionActions(state: GameState, seat: Seat): Action[] {
  const a = state.auction;
  if (a.turn !== seat) return [];
  const actions: Action[] = [];
  const high = effectiveHigh(a);
  const highBid = high?.bid;
  const hand = state.hands[seat]!;

  // Pending decisions replace the normal options.
  if (a.pending) {
    if (a.pending.seat !== seat) return [];
    const pair = a.pending.pairSeat !== undefined ? propBySeat(a, a.pending.pairSeat) : undefined;
    const canRaise = pair ? minSamenToLead(pair.suit, highExcludingPair(a, pair.seat)) !== null : false;
    if (a.pending.kind === 'pairRaise') {
      // Acceptor: raise, or hand the decision to the proposer. (No direct pass.)
      if (canRaise) actions.push({ type: 'raise' });
      actions.push({ type: 'parole' });
      return actions;
    }
    if (a.pending.kind === 'parole') {
      // Proposer: raise, or pass (which drops the pair out).
      if (canRaise) actions.push({ type: 'raise' });
      actions.push({ type: 'pass' });
      return actions;
    }
  }

  // Normal turn.
  actions.push({ type: 'pass' });

  const firstTurn = !a.spokenOnce.includes(seat);
  const noPairYet = acceptedPairs(a).length === 0;

  // wachten: first speaker, very first action of the auction, no troel.
  if (seat === a.firstSpeaker && a.bids.length === 0 && !a.troel && noPairYet) {
    actions.push({ type: 'wachten' });
  }

  // vraag: only before any partnership forms and nothing else stands; one proposal per
  // player; a suit already live cannot be re-proposed; not after wachten.
  if (noPairYet && !highBid && !(a.waiting && seat === a.firstSpeaker)) {
    const proposedBefore = a.bids.some((b) => b.seat === seat && b.action.type === 'vraag');
    if (!proposedBefore) {
      const liveSuits = new Set(openProposals(a).map((p) => p.suit));
      for (const suit of SUITS) {
        if (!liveSuits.has(suit) && cardsOfSuit(hand, suit).length > 0) actions.push({ type: 'vraag', suit });
      }
    }
  }

  // meegaan: join any open proposal by another seat at the minimum level that takes the
  // lead. Forming a second pair here starts a raise-war resolved by suit rank.
  if (!isCommitted(a, seat)) {
    for (const p of openProposals(a)) {
      if (p.seat === seat) continue;
      if (minSamenToLead(p.suit, highBid) !== null) actions.push({ type: 'meegaan', suit: p.suit });
    }
  }

  // alleen: an unaccepted proposer who never found a partner may still go alone in the suit.
  const own = openProposals(a).find((p) => p.seat === seat);
  if (own) {
    const level = minAlleenOver(highBid);
    if (level !== null) actions.push({ type: 'alleen', tricks: level });
  }

  // Negative contracts: outbid, or join an identical standing negative contract.
  const negatives: Action[] = [
    { type: 'miserie', variant: 'klein' },
    { type: 'piccolo' },
    { type: 'miserie', variant: 'groot' },
    { type: 'miserie', variant: 'open' },
  ];
  for (const action of negatives) {
    const bid = bidOfAction(action);
    if (!highBid || bidRank(bid) > bidRank(highBid)) actions.push(action);
    else if (isJoinable(bid) && bidRank(bid) === bidRank(highBid) && !high!.seats.includes(seat)) {
      actions.push(action);
    }
  }

  // Abondance / solo slim: first speaking turn only, or raising one's own abondance in the same suit.
  const ab = ownAbondance(a, seat);
  const abSuits: Suit[] = ab
    ? [ab.suit!]
    : firstTurn
      ? SUITS.filter((s) => cardsOfSuit(hand, s).length > 0)
      : [];
  for (const suit of abSuits) {
    for (const tricks of [9, 10, 11, 12]) {
      const bid: Bid = { kind: 'abondance', tricks, suit };
      if (!highBid || bidRank(bid) > bidRank(highBid)) actions.push({ type: 'abondance', tricks, suit });
    }
    const slim: Bid = { kind: 'soloSlim', suit };
    if (!highBid || bidRank(slim) > bidRank(highBid)) actions.push({ type: 'soloSlim', suit });
  }

  return actions;
}

function bidOfAction(action: Action): Bid {
  switch (action.type) {
    case 'vraag': return { kind: 'samen', tricks: 8, suit: action.suit };
    case 'meegaan': return { kind: 'samen', tricks: 8, suit: action.suit };
    case 'alleen': return { kind: 'alleen', tricks: action.tricks };
    case 'abondance': return { kind: 'abondance', tricks: action.tricks, suit: action.suit };
    case 'miserie':
      return action.variant === 'klein'
        ? { kind: 'kleineMiserie' }
        : action.variant === 'groot'
          ? { kind: 'groteMiserie' }
          : { kind: 'openMiserie' };
    case 'piccolo': return { kind: 'piccolo' };
    case 'soloSlim': return { kind: 'soloSlim', suit: action.suit };
    default:
      throw new GameError(`action ${action.type} is not a bid`);
  }
}

function assertLegal(state: GameState, seat: Seat, action: Action): void {
  const legal = legalAuctionActions(state, seat);
  if (!legal.some((l) => JSON.stringify(l) === JSON.stringify(action))) {
    throw new GameError(`illegal action ${JSON.stringify(action)} for seat ${seat}`);
  }
}

/**
 * Apply a bidding action. Mutates `state` (callers clone first via the game module).
 */
export function applyAuctionAction(state: GameState, seat: Seat, action: Action): void {
  assertLegal(state, seat, action);
  const a = state.auction;

  if (a.pending && a.pending.seat === seat) {
    const pending = a.pending;
    a.pending = undefined;
    const pair = pending.pairSeat !== undefined ? propBySeat(a, pending.pairSeat) : undefined;
    if (action.type === 'raise') {
      const level = pair ? minSamenToLead(pair.suit, highExcludingPair(a, pair.seat)) : null;
      if (!pair || level === null) throw new GameError('cannot raise');
      pair.level = level;
      a.bids.push({ seat, action });
    } else if (action.type === 'parole') {
      a.bids.push({ seat, action });
      a.pending = { seat: pair!.seat, kind: 'parole', pairSeat: pair!.seat };
      a.turn = pair!.seat;
      return;
    } else if (action.type === 'pass') {
      // Proposer declined after parole: the pair drops out entirely.
      if (pair) {
        pair.dropped = true;
        if (pair.acceptedBy !== undefined && !a.passed.includes(pair.acceptedBy)) a.passed.push(pair.acceptedBy);
      }
      if (!a.passed.includes(seat)) a.passed.push(seat);
      a.bids.push({ seat, action });
    }
    settleTurn(state, seat);
    return;
  }

  // Normal turn actions.
  a.bids.push({ seat, action });
  if (!a.spokenOnce.includes(seat)) a.spokenOnce.push(seat);

  switch (action.type) {
    case 'pass': {
      a.passed.push(seat);
      // An unaccepted proposer who passes withdraws their proposal.
      const own = openProposals(a).find((p) => p.seat === seat);
      if (own) own.dropped = true;
      break;
    }
    case 'wachten': {
      a.waiting = true;
      break;
    }
    case 'vraag': {
      a.proposals.push({ seat, suit: action.suit });
      break;
    }
    case 'meegaan': {
      const target = openProposals(a).find((p) => p.suit === action.suit && p.seat !== seat);
      if (!target) throw new GameError('no open proposal to join');
      const level = minSamenToLead(target.suit, effectiveHigh(a)?.bid);
      if (level === null) throw new GameError('cannot meegaan');
      target.acceptedBy = seat;
      target.level = level;
      // Joining abandons the acceptor's own open proposal, if any.
      const own = openProposals(a).find((p) => p.seat === seat);
      if (own) own.dropped = true;
      break;
    }
    case 'alleen': {
      const own = openProposals(a).find((p) => p.seat === seat);
      if (!own) throw new GameError('no proposal to convert to alleen');
      a.high = { bid: { kind: 'alleen', tricks: action.tricks, suit: own.suit }, seats: [seat] };
      own.dropped = true;
      break;
    }
    case 'abondance':
    case 'piccolo':
    case 'soloSlim':
    case 'miserie': {
      const bid = bidOfAction(action);
      if (a.high && isJoinable(bid) && bidRank(bid) === bidRank(a.high.bid)) {
        a.high.seats.push(seat);
      } else {
        a.high = { bid, seats: [seat] };
      }
      break;
    }
    default:
      throw new GameError(`unexpected auction action ${action.type}`);
  }

  settleTurn(state, seat);
}

/** After a bid, hand the raise decision to a trailing pair if one can still climb;
 *  otherwise advance the turn or resolve. */
function settleTurn(state: GameState, lastActor: Seat): void {
  if (maybeTriggerPairRaise(state)) return;
  advanceOrResolve(state, lastActor);
}

/** If a standing pair has just been overtaken and can still raise, the acceptor must decide. */
function maybeTriggerPairRaise(state: GameState): boolean {
  const a = state.auction;
  const high = effectiveHigh(a);
  if (!high) return false;
  for (const p of acceptedPairs(a)) {
    const leads = high.seats.includes(p.seat) && high.seats.includes(p.acceptedBy!);
    if (leads) continue; // this pair is on top
    if (a.passed.includes(p.seat) || a.passed.includes(p.acceptedBy!)) continue; // already out
    if (minSamenToLead(p.suit, highExcludingPair(a, p.seat)) === null) continue; // cannot climb
    a.pending = { seat: p.acceptedBy!, kind: 'pairRaise', pairSeat: p.seat };
    a.turn = p.acceptedBy!;
    return true;
  }
  return false;
}

function advanceOrResolve(state: GameState, lastActor: Seat): void {
  const a = state.auction;
  if (a.pending) {
    a.turn = a.pending.seat;
    return;
  }
  if (hasActiveSeat(a)) {
    a.turn = firstActiveFrom(a, nextSeat(lastActor));
    return;
  }
  resolveAuction(state);
}

/** All seats are committed or passed: fix the contract, or redeal on rondje pas. */
function resolveAuction(state: GameState): void {
  const a = state.auction;
  const high = effectiveHigh(a);

  if (!high) {
    redeal(state);
    return;
  }

  const bid = high.bid;
  const leftOfDealer = nextSeat(state.dealer);

  if (bid.kind === 'samen') {
    state.contract = {
      bid,
      declarers: [...high.seats],
      trump: bid.suit!,
      tricksNeeded: bid.tricks!,
      leader: leftOfDealer,
    };
    state.phase = 'playing';
  } else if (bid.kind === 'troel') {
    const t = a.troel!;
    state.contract = {
      bid,
      declarers: [t.caller, t.partner],
      trump: t.trump,
      tricksNeeded: 8,
      forcedLead: t.forcedLead,
      leader: t.partner,
    };
    state.phase = 'troelTrump';
    return;
  } else if (bid.kind === 'alleen' || bid.kind === 'abondance' || bid.kind === 'soloSlim') {
    state.contract = {
      bid,
      declarers: [...high.seats],
      trump: bid.suit!,
      tricksNeeded: bid.kind === 'soloSlim' ? 13 : bid.tricks!,
      leader: bid.kind === 'alleen' ? leftOfDealer : high.seats[0]!,
    };
    state.phase = 'playing';
  } else {
    // Negative contracts.
    state.contract = {
      bid,
      declarers: [...high.seats],
      trump: null,
      tricksNeeded: bid.kind === 'piccolo' ? 1 : 0,
      leader: leftOfDealer,
    };
    if (bid.kind === 'kleineMiserie') {
      state.phase = 'discard';
      state.discards = [null, null, null, null];
      return;
    }
    state.phase = 'playing';
  }
}

/** Everyone passed: redeal with the same dealer; next played hand may score double. */
function redeal(state: GameState): void {
  state.redeals += 1;
  if (state.config.doubleAfterAllPass) state.doubleNext = true;
  state.hands = dealHands(`${state.seed}:${state.handNumber}:${state.redeals}`);
  state.auction = startAuction(state.hands, state.dealer);
  state.contract = undefined;
  state.play = undefined;
  state.discards = undefined;
  state.phase = 'bidding';
}

/** Troel: the partner keeps the called trump (8 tricks) or switches (9 tricks, free lead). */
export function legalTroelTrumpActions(state: GameState, seat: Seat): Action[] {
  const t = state.auction.troel!;
  if (seat !== t.partner) return [];
  const actions: Action[] = [{ type: 'troelKeep' }];
  for (const suit of ['H', 'D', 'C', 'S'] as Suit[]) {
    if (suit !== t.trump) actions.push({ type: 'troelSwitch', suit });
  }
  return actions;
}

export function applyTroelTrumpAction(state: GameState, seat: Seat, action: Action): void {
  const legal = legalTroelTrumpActions(state, seat);
  if (!legal.some((l) => JSON.stringify(l) === JSON.stringify(action))) {
    throw new GameError(`illegal troel trump action for seat ${seat}`);
  }
  const contract = state.contract!;
  if (action.type === 'troelSwitch') {
    contract.trump = action.suit;
    contract.tricksNeeded = 9;
    contract.forcedLead = undefined;
    contract.leader = nextSeat(state.dealer);
  }
  state.phase = 'playing';
}
