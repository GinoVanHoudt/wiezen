import { cardsOfSuit, nextSeat, rankOf, suitOf } from './cards.js';
import { Action, Card, GameError, GameState, PlayState, Seat, Suit } from './types.js';

export function startPlay(state: GameState): void {
  const contract = state.contract!;
  state.play = {
    turn: contract.leader,
    trick: [],
    tricksWon: [0, 0, 0, 0],
    completedTricks: [],
    totalTricks: contract.bid.kind === 'kleineMiserie' ? 12 : 13,
  };
  state.phase = 'playing';
}

/** Kleine miserie: every seat discards one card face down before play. */
export function legalDiscardActions(state: GameState, seat: Seat): Action[] {
  if (!state.discards || state.discards[seat] !== null) return [];
  return state.hands[seat]!.map((card) => ({ type: 'discard', card }));
}

export function applyDiscardAction(state: GameState, seat: Seat, action: Action): void {
  if (action.type !== 'discard') throw new GameError('expected a discard');
  if (!state.discards || state.discards[seat] !== null) throw new GameError('already discarded');
  const hand = state.hands[seat]!;
  const idx = hand.indexOf(action.card);
  if (idx === -1) throw new GameError('card not in hand');
  hand.splice(idx, 1);
  state.discards[seat] = action.card;
  if (state.discards.every((d) => d !== null)) startPlay(state);
}

export function legalCards(state: GameState, seat: Seat): Card[] {
  const play = state.play;
  const contract = state.contract;
  if (!play || !contract || play.turn !== seat) return [];
  const hand = state.hands[seat]!;

  // Troel: the partner must lead the called card to trick 1.
  if (
    contract.forcedLead &&
    play.completedTricks.length === 0 &&
    play.trick.length === 0 &&
    hand.includes(contract.forcedLead)
  ) {
    return [contract.forcedLead];
  }

  if (play.trick.length === 0) return [...hand];

  const led = suitOf(play.trick[0]!.card);
  const followers = cardsOfSuit(hand, led);
  return followers.length > 0 ? followers : [...hand];
}

export function trickWinner(trick: { seat: Seat; card: Card }[], trump: Suit | null): Seat {
  const led = suitOf(trick[0]!.card);
  let best = trick[0]!;
  for (const entry of trick.slice(1)) {
    const s = suitOf(entry.card);
    const bs = suitOf(best.card);
    if (trump && s === trump && bs !== trump) best = entry;
    else if (s === bs && rankOf(entry.card) > rankOf(best.card)) best = entry;
  }
  return best.seat;
}

export function applyPlayAction(state: GameState, seat: Seat, action: Action): void {
  if (action.type !== 'play') throw new GameError('expected a card play');
  const play = state.play!;
  const legal = legalCards(state, seat);
  if (!legal.includes(action.card)) {
    throw new GameError(`illegal card ${action.card} for seat ${seat}`);
  }
  const hand = state.hands[seat]!;
  hand.splice(hand.indexOf(action.card), 1);
  play.trick.push({ seat, card: action.card });

  if (play.trick.length < 4) {
    play.turn = nextSeat(seat);
    return;
  }

  const winner = trickWinner(play.trick, state.contract!.trump);
  play.tricksWon[winner]! += 1;
  play.completedTricks.push({ cards: play.trick, winner });
  play.trick = [];
  play.turn = winner;

  if (play.completedTricks.length === play.totalTricks) {
    state.phase = 'scored';
  }
}

export function declarerTricks(play: PlayState, declarers: Seat[]): number {
  return declarers.reduce((sum: number, s) => sum + play.tricksWon[s]!, 0);
}
