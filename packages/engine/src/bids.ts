import { Bid, GameError } from './types.js';

/**
 * The bid ladder (RULES.md §2.4, pagat.com order, piccolo included).
 * Higher rank outbids lower. Equal rank is only allowed for negative
 * contracts (multiple simultaneous declarers).
 */
export function bidRank(bid: Bid): number {
  switch (bid.kind) {
    case 'samen':
      switch (bid.tricks) {
        case 8: return 1;
        case 9: return 3;
        case 10: return 5;
        case 11: return 8;
        case 12: return 11;
        case 13: return 12;
      }
      throw new GameError(`invalid samen level ${bid.tricks}`);
    case 'alleen':
      switch (bid.tricks) {
        case 5: return 2;
        case 6: return 4;
        case 7: return 6;
        case 8: return 9;
      }
      throw new GameError(`invalid alleen level ${bid.tricks}`);
    case 'kleineMiserie': return 7;
    case 'piccolo': return 10;
    case 'abondance':
      switch (bid.tricks) {
        case 9: return 13;
        case 10: return 16;
        case 11: return 17;
        case 12: return 19;
      }
      throw new GameError(`invalid abondance level ${bid.tricks}`);
    case 'troel': return 14;
    case 'groteMiserie': return 15;
    case 'openMiserie': return 18;
    case 'soloSlim': return 20;
  }
}

/** Can several players hold this contract at the same time? */
export function isJoinable(bid: Bid): boolean {
  return bid.kind === 'kleineMiserie' || bid.kind === 'groteMiserie' || bid.kind === 'openMiserie' || bid.kind === 'piccolo';
}

export function isNegative(bid: Bid): boolean {
  return isJoinable(bid);
}

/** Lowest samen level that outbids `high` (or 8 if nothing stands). Returns null if impossible (>13). */
export function minSamenOver(high: Bid | undefined): number | null {
  for (let level = 8; level <= 13; level++) {
    if (!high || bidRank({ kind: 'samen', tricks: level }) > bidRank(high)) return level;
  }
  return null;
}

/** Lowest alleen level that outbids `high` (or 5 if nothing stands). Returns null if impossible (>8). */
export function minAlleenOver(high: Bid | undefined): number | null {
  for (let level = 5; level <= 8; level++) {
    if (!high || bidRank({ kind: 'alleen', tricks: level }) > bidRank(high)) return level;
  }
  return null;
}

const SUIT_NAMES: Record<string, string> = { H: 'hearts', D: 'diamonds', C: 'clubs', S: 'spades' };

export function bidLabel(bid: Bid): string {
  const suit = bid.suit ? ` in ${SUIT_NAMES[bid.suit]}` : '';
  switch (bid.kind) {
    case 'samen': return `samen ${bid.tricks}${suit}`;
    case 'alleen': return `alleen ${bid.tricks}${suit}`;
    case 'kleineMiserie': return 'kleine miserie';
    case 'piccolo': return 'piccolo';
    case 'troel': return 'troel';
    case 'abondance': return `abondance ${bid.tricks}${suit}`;
    case 'groteMiserie': return 'grote miserie';
    case 'openMiserie': return 'open miserie';
    case 'soloSlim': return `solo slim${suit}`;
  }
}
