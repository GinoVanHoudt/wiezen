import { bidRank, isJoinable, minAlleenOver, minSamenOver } from './bids.js';
import { card, cardsOfSuit, dealHands, nextSeat, rankOf, suitOf } from './cards.js';
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
 * - A vraag (proposal) is only allowed while no bid stands yet; each player may propose once.
 * - meegaan and raises always commit to the minimum level that outbids the standing bid.
 */

interface ProposalExt {
  seat: Seat;
  suit: Suit;
  acceptedBy?: Seat;
  /** Partnership dissolved during raising; boundSeat may still go alleen in the suit. */
  broken?: boolean;
  boundSeat?: Seat;
}

function proposalOf(a: Auction): ProposalExt | undefined {
  return a.proposal as ProposalExt | undefined;
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
    samenLevel: 0,
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

/** The bid currently to beat: standing samen partnership or the high solo/negative bid. */
export function effectiveHigh(a: Auction): { bid: Bid; seats: Seat[] } | undefined {
  const p = proposalOf(a);
  const samen: { bid: Bid; seats: Seat[] } | undefined =
    p?.acceptedBy !== undefined && !p.broken && a.samenLevel >= 8
      ? { bid: { kind: 'samen', tricks: a.samenLevel, suit: p.suit }, seats: [p.seat, p.acceptedBy] }
      : undefined;
  if (!samen) return a.high;
  if (!a.high) return samen;
  return bidRank(samen.bid) > bidRank(a.high.bid) ? samen : a.high;
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
  const p = proposalOf(a);
  const high = effectiveHigh(a);
  const highBid = high?.bid;
  const hand = state.hands[seat]!;

  // Pending decisions replace the normal options.
  if (a.pending) {
    if (a.pending.seat !== seat) return [];
    const minLevel = minSamenOver(a.high?.bid);
    if (a.pending.kind === 'pairRaise') {
      if (minLevel !== null) {
        actions.push({ type: 'raise' });
        if (minLevel >= 11) actions.push({ type: 'parole' });
      }
      actions.push({ type: 'pass' });
      return actions;
    }
    if (a.pending.kind === 'parole') {
      if (minLevel !== null) actions.push({ type: 'raise' });
      actions.push({ type: 'pass' });
      return actions;
    }
  }

  // Normal turn.
  actions.push({ type: 'pass' });

  const firstTurn = !a.spokenOnce.includes(seat);

  // wachten: first speaker, very first action of the auction, no troel.
  if (seat === a.firstSpeaker && a.bids.length === 0 && !a.troel && !p) {
    actions.push({ type: 'wachten' });
  }

  // vraag: only while nothing stands at all, one proposal per player, not after wachten.
  if (!highBid && !p && !(a.waiting && seat === a.firstSpeaker)) {
    const proposedBefore = a.bids.some((b) => b.seat === seat && b.action.type === 'vraag');
    if (!proposedBefore) {
      for (const suit of ['H', 'D', 'C', 'S'] as Suit[]) {
        if (cardsOfSuit(hand, suit).length > 0) actions.push({ type: 'vraag', suit });
      }
    }
  }

  // meegaan: live unaccepted proposal by someone else, at the minimum outbidding level.
  if (p && p.acceptedBy === undefined && !p.broken && p.seat !== seat) {
    const level = minSamenOver(highBid);
    if (level !== null) actions.push({ type: 'meegaan', tricks: level });
  }

  // alleen: only for the proposer of an unaccepted proposal, or the bound seat of a broken pair.
  const boundToSuit: Suit | undefined =
    p && p.acceptedBy === undefined && !p.broken && p.seat === seat
      ? p.suit
      : p && p.broken && p.boundSeat === seat
        ? p.suit
        : undefined;
  if (boundToSuit) {
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
  const own = ownAbondance(a, seat);
  const abSuits: Suit[] = own
    ? [own.suit!]
    : firstTurn
      ? (['H', 'D', 'C', 'S'] as Suit[]).filter((s) => cardsOfSuit(hand, s).length > 0)
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
    case 'meegaan': return { kind: 'samen', tricks: action.tricks };
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
  const p = proposalOf(a);

  const isPendingDecision = !!a.pending && a.pending.seat === seat;

  if (isPendingDecision) {
    const pending = a.pending!;
    a.pending = undefined;
    if (action.type === 'raise') {
      const level = minSamenOver(a.high?.bid);
      if (level === null) throw new GameError('cannot raise');
      a.samenLevel = level;
      a.bids.push({ seat, action });
    } else if (action.type === 'parole') {
      a.pending = { seat: p!.seat, kind: 'parole' };
      a.bids.push({ seat, action });
      a.turn = p!.seat;
      return;
    } else if (action.type === 'pass') {
      // Partnership breaks; the other member stays bound to the suit.
      const prop = p!;
      prop.broken = true;
      prop.boundSeat = pending.kind === 'parole' ? prop.acceptedBy : prop.seat;
      a.passed.push(seat);
      a.bids.push({ seat, action });
    }
    advanceOrResolve(state, seat);
    return;
  }

  // Normal turn actions.
  a.bids.push({ seat, action });
  if (!a.spokenOnce.includes(seat)) a.spokenOnce.push(seat);

  switch (action.type) {
    case 'pass': {
      a.passed.push(seat);
      // A proposer who passes withdraws their unaccepted proposal.
      const prop = proposalOf(a);
      if (prop && prop.seat === seat && prop.acceptedBy === undefined) {
        a.proposal = undefined;
      }
      break;
    }
    case 'wachten': {
      a.waiting = true;
      break;
    }
    case 'vraag': {
      a.proposal = { seat, suit: action.suit };
      break;
    }
    case 'meegaan': {
      const prop = proposalOf(a)!;
      prop.acceptedBy = seat;
      a.samenLevel = action.tricks;
      break;
    }
    case 'alleen': {
      const prop = proposalOf(a)!;
      // The alleen bid replaces any proposal involvement.
      a.high = { bid: { kind: 'alleen', tricks: action.tricks, suit: prop.suit }, seats: [seat] };
      a.proposal = undefined;
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
      // If a standing partnership is outbid and can still raise, the acceptor decides.
      const prop = proposalOf(a);
      if (
        prop?.acceptedBy !== undefined &&
        !prop.broken &&
        a.samenLevel >= 8 &&
        bidRank(bid) > bidRank({ kind: 'samen', tricks: a.samenLevel }) &&
        minSamenOver(bid) !== null &&
        !a.passed.includes(prop.acceptedBy)
      ) {
        a.pending = { seat: prop.acceptedBy, kind: 'pairRaise' };
        a.turn = prop.acceptedBy;
        return;
      }
      break;
    }
    default:
      throw new GameError(`unexpected auction action ${action.type}`);
  }

  advanceOrResolve(state, seat);
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
