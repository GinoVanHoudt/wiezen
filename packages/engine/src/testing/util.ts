import { startAuction } from '../auction.js';
import { fullDeck, sortHand } from '../cards.js';
import { chooseBotAction } from '../bot.js';
import { legalActions, applyAction, nextHand } from '../game.js';
import { playerView } from '../view.js';
import { Card, DEFAULT_CONFIG, GameState, SEATS, Seat } from '../types.js';

/**
 * Build a full deal from partial hand specs: listed cards go to their seat,
 * the rest of the deck is distributed to fill every hand to 13.
 */
export function craftHands(partial: Card[][]): Card[][] {
  const assigned = new Set(partial.flat());
  if (assigned.size !== partial.flat().length) throw new Error('duplicate card in spec');
  const rest = fullDeck().filter((c) => !assigned.has(c));
  const hands = partial.map((h) => [...h]);
  while (hands.length < 4) hands.push([]);
  // Round-robin fill so every hand holds a mix of suits.
  let i = 0;
  while (rest.length > 0) {
    const h = hands[i % 4]!;
    if (h.length < 13) h.push(rest.shift()!);
    i++;
  }
  return hands.map((h) => sortHand(h));
}

export function stateWithHands(hands: Card[][], dealer: Seat = 0): GameState {
  return {
    config: DEFAULT_CONFIG,
    seed: 'test',
    handNumber: 1,
    redeals: 0,
    phase: 'bidding',
    dealer,
    hands: hands.map((h) => [...h]),
    auction: startAuction(hands, dealer),
    doubleNext: false,
    scores: [0, 0, 0, 0],
  };
}

/** The seat expected to act next, across all phases. */
export function actingSeat(state: GameState): Seat | undefined {
  if (state.phase === 'scored') return undefined;
  for (const s of SEATS) {
    if (legalActions(state, s).length > 0) return s;
  }
  return undefined;
}

/** Let bots act until the hand is scored. Returns the final state. */
export function botsFinishHand(state: GameState, maxActions = 500): GameState {
  let s = state;
  for (let i = 0; i < maxActions; i++) {
    if (s.phase === 'scored') return s;
    const seat = actingSeat(s);
    if (seat === undefined) throw new Error(`no acting seat in phase ${s.phase}`);
    const action = chooseBotAction(playerView(s, seat));
    if (!action) throw new Error(`bot has no action for seat ${seat} in phase ${s.phase}`);
    s = applyAction(s, seat, action);
  }
  throw new Error('hand did not finish within action budget');
}

export { nextHand };
