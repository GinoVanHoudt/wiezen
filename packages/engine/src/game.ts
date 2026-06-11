import {
  applyAuctionAction,
  applyTroelTrumpAction,
  legalAuctionActions,
  legalTroelTrumpActions,
  startAuction,
} from './auction.js';
import { dealHands, nextSeat } from './cards.js';
import {
  applyDiscardAction,
  applyPlayAction,
  legalCards,
  legalDiscardActions,
  startPlay,
} from './play.js';
import { scoreHand } from './score.js';
import {
  Action,
  DEFAULT_CONFIG,
  GameError,
  GameState,
  Phase,
  PlayerView,
  RuleConfig,
  Seat,
} from './types.js';

export function newGame(seed: string, config: RuleConfig = DEFAULT_CONFIG): GameState {
  const dealer: Seat = 0;
  const hands = dealHands(`${seed}:1:0`);
  return {
    config,
    seed,
    handNumber: 1,
    redeals: 0,
    phase: 'bidding',
    dealer,
    hands,
    auction: startAuction(hands, dealer),
    doubleNext: false,
    scores: [0, 0, 0, 0],
  };
}

export function legalActions(state: GameState, seat: Seat): Action[] {
  switch (state.phase) {
    case 'bidding':
      return legalAuctionActions(state, seat);
    case 'troelTrump':
      return legalTroelTrumpActions(state, seat);
    case 'discard':
      return legalDiscardActions(state, seat);
    case 'playing':
      return legalCards(state, seat).map((card) => ({ type: 'play', card }));
    case 'scored':
      return [];
  }
}

/**
 * Apply an action and return the new state (input is not mutated).
 * Throws GameError on illegal actions.
 */
export function applyAction(state: GameState, seat: Seat, action: Action): GameState {
  const next = structuredClone(state);
  switch (next.phase) {
    case 'bidding':
      applyAuctionAction(next, seat, action);
      break;
    case 'troelTrump':
      applyTroelTrumpAction(next, seat, action);
      break;
    case 'discard':
      applyDiscardAction(next, seat, action);
      break;
    case 'playing':
      applyPlayAction(next, seat, action);
      break;
    default:
      throw new GameError(`no actions allowed in phase ${next.phase}`);
  }

  if ((next.phase as Phase) === 'playing' && !next.play) {
    startPlay(next);
  }

  if ((next.phase as Phase) === 'scored' && !next.lastHandDeltas) {
    const multiplier = next.doubleNext ? 2 : 1;
    const { deltas, summary } = scoreHand(next.contract!, next.play!, multiplier);
    next.lastHandDeltas = deltas;
    next.lastHandSummary = summary;
    next.scores = next.scores.map((s, i) => s + deltas[i]!);
    next.doubleNext = false;
  }
  return next;
}

/** Deal the next hand (server-triggered once a hand is scored). */
export function nextHand(state: GameState): GameState {
  if (state.phase !== 'scored') throw new GameError('hand is not finished');
  const next = structuredClone(state);
  next.dealer = nextSeat(next.dealer);
  next.handNumber += 1;
  next.redeals = 0;
  next.hands = dealHands(`${next.seed}:${next.handNumber}:0`);
  next.auction = startAuction(next.hands, next.dealer);
  next.contract = undefined;
  next.play = undefined;
  next.discards = undefined;
  next.lastHandDeltas = undefined;
  next.lastHandSummary = undefined;
  next.phase = 'bidding';
  return next;
}

/**
 * Legal actions computed from a player's own view (client-side validation and bots).
 * Builds a minimal state: only the acting seat's hand is populated, which is all
 * the legality checks for that seat consult.
 */
export function legalActionsForView(view: PlayerView): Action[] {
  const pseudo: GameState = {
    config: DEFAULT_CONFIG,
    seed: '',
    handNumber: view.handNumber,
    redeals: 0,
    phase: view.phase,
    dealer: view.dealer,
    hands: [[], [], [], []].map((_, i) => (i === view.seat ? [...view.hand] : [])),
    discards: view.phase === 'discard' ? deriveDiscards(view) : undefined,
    auction: view.auction,
    contract: view.contract,
    play: view.play,
    doubleNext: view.doubleNext,
    scores: view.scores,
  };
  return legalActions(pseudo, view.seat);
}

/**
 * The view doesn't reveal who discarded what; reconstruct "has this seat discarded"
 * from hand counts (12 cards = discarded).
 */
function deriveDiscards(view: PlayerView): (string | null)[] {
  return view.handCounts.map((n) => (n <= 12 ? 'X0' : null));
}
