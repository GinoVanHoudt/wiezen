import { Card, Suit, rankOf, suitOf } from '@wiezen/engine';

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
