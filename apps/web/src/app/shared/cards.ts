import { Action, Card, Suit, bidLabel, rankOf, suitOf } from '@wiezen/engine';

export const SUIT_SYMBOL: Record<Suit, string> = { H: '♥', D: '♦', C: '♣', S: '♠' };

export function isRed(card: Card): boolean {
  const s = suitOf(card);
  return s === 'H' || s === 'D';
}

export function rankLabel(card: Card): string {
  const r = rankOf(card);
  return r === 14 ? 'A' : r === 13 ? 'K' : r === 12 ? 'Q' : r === 11 ? 'J' : String(r);
}

export function suitSymbol(card: Card): string {
  return SUIT_SYMBOL[suitOf(card)];
}

export function suitName(suit: Suit): string {
  return { H: 'harten', D: 'koeken', C: 'klaveren', S: 'schoppen' }[suit];
}

/** Human-readable (Dutch-flavoured) label for a bidding/board action. */
export function actionLabel(action: Action): string {
  switch (action.type) {
    case 'pass': return 'Pas';
    case 'wachten': return 'Wachten';
    case 'vraag': return `Vraag ${SUIT_SYMBOL[action.suit]}`;
    case 'meegaan': return action.tricks === 8 ? 'Meegaan' : `Meegaan voor ${action.tricks}`;
    case 'alleen': return `Alleen ${action.tricks}`;
    case 'abondance': return `Abondance ${action.tricks} ${SUIT_SYMBOL[action.suit]}`;
    case 'miserie':
      return action.variant === 'klein' ? 'Kleine miserie' : action.variant === 'groot' ? 'Grote miserie' : 'Open miserie';
    case 'piccolo': return 'Piccolo';
    case 'soloSlim': return `Solo slim ${SUIT_SYMBOL[action.suit]}`;
    case 'raise': return 'Verhogen';
    case 'parole': return 'Passe parole';
    case 'troelKeep': return 'Troef houden';
    case 'troelSwitch': return `Troef ${SUIT_SYMBOL[action.suit]} (9 slagen)`;
    case 'discard': return 'Leg weg';
    case 'play': return 'Speel';
  }
}

export function contractLabel(bid: Parameters<typeof bidLabel>[0]): string {
  return bidLabel(bid);
}
