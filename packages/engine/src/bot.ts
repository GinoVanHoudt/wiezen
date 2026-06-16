import { cardsOfSuit, rankOf, suitOf } from './cards.js';
import { legalActionsForView } from './game.js';
import { trickWinner } from './play.js';
import { Action, Card, PlayerView, Seat, Suit } from './types.js';

/**
 * A simple rule-based bot. It only looks at its own PlayerView, so it cannot
 * cheat: it knows exactly what a human in its seat would know.
 */

function honourPoints(hand: readonly Card[]): number {
  return hand.reduce((sum, c) => {
    const r = rankOf(c);
    return sum + (r === 14 ? 4 : r === 13 ? 3 : r === 12 ? 2 : r === 11 ? 1 : 0);
  }, 0);
}

function bestSuit(hand: readonly Card[]): { suit: Suit; length: number; tops: number } {
  let best: { suit: Suit; length: number; tops: number } = { suit: 'H', length: 0, tops: 0 };
  for (const suit of ['H', 'D', 'C', 'S'] as Suit[]) {
    const cards = cardsOfSuit(hand, suit);
    const tops = cards.filter((c) => rankOf(c) >= 12).length;
    if (cards.length > best.length || (cards.length === best.length && tops > best.tops)) {
      best = { suit, length: cards.length, tops };
    }
  }
  return best;
}

export function chooseBotAction(view: PlayerView): Action | undefined {
  const actions = legalActionsForView(view);
  if (actions.length === 0) return undefined;
  if (actions.length === 1) return actions[0];

  switch (view.phase) {
    case 'bidding':
      return chooseBid(view, actions);
    case 'troelTrump':
      return { type: 'troelKeep' };
    case 'discard': {
      // Dump the highest card: safest for everyone in a misère hand.
      const high = [...view.hand].sort((a, b) => rankOf(b) - rankOf(a))[0]!;
      return { type: 'discard', card: high };
    }
    case 'playing':
      return choosePlay(view, actions);
    default:
      return actions[0];
  }
}

function chooseBid(view: PlayerView, actions: Action[]): Action {
  const hand = view.hand;
  const hcp = honourPoints(hand);
  const best = bestSuit(hand);
  const find = (pred: (a: Action) => boolean) => actions.find(pred);

  // Respond to a pending raise decision conservatively.
  const raise = find((a) => a.type === 'raise');
  const parole = find((a) => a.type === 'parole');
  if (parole) {
    // Acceptor's call: raise only with a very strong hand, otherwise hand off.
    return raise && hcp >= 16 ? raise : parole;
  }
  if (raise) {
    // Proposer's call after a hand-off: raise only when strong, otherwise drop out.
    return hcp >= 16 ? raise : { type: 'pass' };
  }

  // Abondance with a very long, strong suit.
  const abondance = find((a) => a.type === 'abondance' && a.tricks === 9 && a.suit === best.suit);
  if (abondance && best.length >= 7 && best.tops >= 2 && hcp >= 13) return abondance;

  // Accept the best-supported open proposal with decent trump support.
  const meegaanOptions = actions
    .flatMap((a) => (a.type === 'meegaan' ? [{ action: a, support: cardsOfSuit(hand, a.suit).length }] : []))
    .sort((x, y) => y.support - x.support);
  const bestMeegaan = meegaanOptions[0];
  if (bestMeegaan && bestMeegaan.support >= 3 && (hcp >= 8 || bestMeegaan.support >= 5)) {
    return bestMeegaan.action;
  }

  // Propose a long suit.
  const vraag = find((a) => a.type === 'vraag' && a.suit === best.suit);
  if (vraag && best.length >= 5 && hcp >= 10) return vraag;
  if (vraag && best.length >= 6 && hcp >= 8) return vraag;

  // Go alone only with a strong hand.
  const alleen = find((a) => a.type === 'alleen');
  if (alleen && alleen.type === 'alleen' && alleen.tricks <= 6 && best.length >= 5 && hcp >= 12) return alleen;

  return { type: 'pass' };
}

function choosePlay(view: PlayerView, actions: Action[]): Action {
  const cards = actions.flatMap((a) => (a.type === 'play' ? [a.card] : []));
  const contract = view.contract!;
  const play = view.play!;
  const trump = contract.trump;
  const negative = contract.trump === null;
  const isDeclarer = contract.declarers.includes(view.seat);
  const byRank = [...cards].sort((a, b) => rankOf(a) - rankOf(b));
  const lowest = byRank[0]!;
  const highest = byRank[byRank.length - 1]!;

  // Avoiding tricks (misère declarer, or anyone in a negative contract).
  if (negative && isDeclarer && contract.bid.kind !== 'piccolo') {
    return { type: 'play', card: losingCard(play, cards, trump) ?? lowest };
  }

  if (play.trick.length === 0) {
    // Leading: top of the strongest suit, low in negative contracts.
    if (negative) return { type: 'play', card: lowest };
    const suit = bestSuit(cards).suit;
    const ofSuit = cardsOfSuit(cards, suit).sort((a, b) => rankOf(b) - rankOf(a));
    return { type: 'play', card: ofSuit[0] ?? highest };
  }

  // Partner already winning? Throw the lowest card.
  const partner = contract.declarers.length === 2 && isDeclarer
    ? contract.declarers.find((d) => d !== view.seat)
    : undefined;
  const winningSeat = trickWinner(play.trick, trump);
  if (partner !== undefined && winningSeat === partner) {
    return { type: 'play', card: lowest };
  }

  // Try to win the trick as cheaply as possible.
  const cheapWin = cards
    .filter((c) => wouldWin(play.trick, view.seat, c, trump))
    .sort((a, b) => rankOf(a) - rankOf(b))[0];
  if (cheapWin && !negative) return { type: 'play', card: cheapWin };
  return { type: 'play', card: lowest };
}

function wouldWin(trick: { seat: Seat; card: Card }[], seat: Seat, card: Card, trump: Suit | null): boolean {
  return trickWinner([...trick, { seat, card }], trump) === seat;
}

/** Highest card that does NOT currently win the trick (to shed dangerous cards in misère). */
function losingCard(
  play: PlayerView['play'] & object,
  cards: Card[],
  trump: Suit | null,
): Card | undefined {
  if (play.trick.length === 0) {
    return [...cards].sort((a, b) => rankOf(a) - rankOf(b))[0];
  }
  const losers = cards.filter((c) => !wouldWin(play.trick, -1 as Seat, c, trump));
  if (losers.length === 0) return undefined;
  return losers.sort((a, b) => rankOf(b) - rankOf(a))[0];
}
