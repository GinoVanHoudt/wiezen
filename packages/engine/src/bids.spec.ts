import { describe, expect, it } from 'vitest';
import { bidRank, minAlleenOver, minSamenOver } from './bids.js';
import { Bid } from './types.js';

describe('bid ladder', () => {
  it('orders the full ladder as in RULES.md §2.4', () => {
    const ladder: Bid[] = [
      { kind: 'samen', tricks: 8 },
      { kind: 'alleen', tricks: 5 },
      { kind: 'samen', tricks: 9 },
      { kind: 'alleen', tricks: 6 },
      { kind: 'samen', tricks: 10 },
      { kind: 'alleen', tricks: 7 },
      { kind: 'kleineMiserie' },
      { kind: 'samen', tricks: 11 },
      { kind: 'alleen', tricks: 8 },
      { kind: 'piccolo' },
      { kind: 'samen', tricks: 12 },
      { kind: 'samen', tricks: 13 },
      { kind: 'abondance', tricks: 9 },
      { kind: 'troel' },
      { kind: 'groteMiserie' },
      { kind: 'abondance', tricks: 10 },
      { kind: 'abondance', tricks: 11 },
      { kind: 'openMiserie' },
      { kind: 'abondance', tricks: 12 },
      { kind: 'soloSlim' },
    ];
    for (let i = 1; i < ladder.length; i++) {
      expect(bidRank(ladder[i]!), `${JSON.stringify(ladder[i])} > ${JSON.stringify(ladder[i - 1])}`).toBeGreaterThan(
        bidRank(ladder[i - 1]!),
      );
    }
  });

  it('computes minimum outbidding levels', () => {
    expect(minSamenOver(undefined)).toBe(8);
    expect(minSamenOver({ kind: 'alleen', tricks: 5 })).toBe(9);
    expect(minSamenOver({ kind: 'kleineMiserie' })).toBe(11);
    expect(minSamenOver({ kind: 'piccolo' })).toBe(12);
    expect(minSamenOver({ kind: 'abondance', tricks: 9 })).toBeNull();
    expect(minAlleenOver(undefined)).toBe(5);
    expect(minAlleenOver({ kind: 'samen', tricks: 9 })).toBe(6);
    expect(minAlleenOver({ kind: 'kleineMiserie' })).toBe(8);
    expect(minAlleenOver({ kind: 'piccolo' })).toBeNull();
  });
});
