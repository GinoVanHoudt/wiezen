import { describe, expect, it } from 'vitest';
import { scoreHand, settlementAmount } from './score.js';
import { Contract, PlayState, Seat } from './types.js';

function playWithTricks(tricksWon: number[], total = 13): PlayState {
  return { turn: 0, trick: [], tricksWon, completedTricks: [], totalTricks: total };
}

describe('settlementAmount', () => {
  it('scores samen 8 per the table', () => {
    expect(settlementAmount({ kind: 'samen', tricks: 8 }, 8)).toBe(8);
    expect(settlementAmount({ kind: 'samen', tricks: 8 }, 9)).toBe(11);
    expect(settlementAmount({ kind: 'samen', tricks: 8 }, 10)).toBe(14);
    expect(settlementAmount({ kind: 'samen', tricks: 8 }, 12)).toBe(20);
    expect(settlementAmount({ kind: 'samen', tricks: 8 }, 13)).toBe(30);
    expect(settlementAmount({ kind: 'samen', tricks: 8 }, 7)).toBe(-11);
    expect(settlementAmount({ kind: 'samen', tricks: 8 }, 5)).toBe(-17);
  });

  it('scores samen 13 and higher targets', () => {
    expect(settlementAmount({ kind: 'samen', tricks: 13 }, 13)).toBe(30);
    expect(settlementAmount({ kind: 'samen', tricks: 13 }, 12)).toBe(-33);
    expect(settlementAmount({ kind: 'samen', tricks: 10 }, 10)).toBe(14);
  });

  it('scores alleen per the table', () => {
    expect(settlementAmount({ kind: 'alleen', tricks: 5 }, 5)).toBe(3);
    expect(settlementAmount({ kind: 'alleen', tricks: 5 }, 8)).toBe(6);
    expect(settlementAmount({ kind: 'alleen', tricks: 8 }, 8)).toBe(7);
    expect(settlementAmount({ kind: 'alleen', tricks: 6 }, 4)).toBe(-6);
  });

  it('scores negative contracts flat', () => {
    expect(settlementAmount({ kind: 'kleineMiserie' }, 0)).toBe(6);
    expect(settlementAmount({ kind: 'kleineMiserie' }, 1)).toBe(-6);
    expect(settlementAmount({ kind: 'groteMiserie' }, 0)).toBe(12);
    expect(settlementAmount({ kind: 'openMiserie' }, 2)).toBe(-24);
    expect(settlementAmount({ kind: 'piccolo' }, 1)).toBe(8);
    expect(settlementAmount({ kind: 'piccolo' }, 0)).toBe(-8);
    expect(settlementAmount({ kind: 'piccolo' }, 2)).toBe(-8);
  });

  it('scores abondance and solo slim flat', () => {
    expect(settlementAmount({ kind: 'abondance', tricks: 9 }, 9)).toBe(10);
    expect(settlementAmount({ kind: 'abondance', tricks: 9 }, 12)).toBe(10);
    expect(settlementAmount({ kind: 'abondance', tricks: 10 }, 9)).toBe(-15);
    expect(settlementAmount({ kind: 'abondance', tricks: 12 }, 12)).toBe(30);
    expect(settlementAmount({ kind: 'soloSlim' }, 13)).toBe(60);
    expect(settlementAmount({ kind: 'soloSlim' }, 12)).toBe(-60);
  });
});

describe('scoreHand', () => {
  it('settles a pair contract symmetrically', () => {
    const contract: Contract = {
      bid: { kind: 'samen', tricks: 8, suit: 'H' },
      declarers: [0, 2],
      trump: 'H',
      tricksNeeded: 8,
      leader: 1,
    };
    const { deltas } = scoreHand(contract, playWithTricks([6, 2, 4, 1]));
    expect(deltas).toEqual([14, -14, 14, -14]);
  });

  it('settles a solo contract at 3x', () => {
    const contract: Contract = {
      bid: { kind: 'abondance', tricks: 9, suit: 'S' },
      declarers: [1],
      trump: 'S',
      tricksNeeded: 9,
      leader: 1,
    };
    const { deltas } = scoreHand(contract, playWithTricks([1, 10, 1, 1]));
    expect(deltas).toEqual([-10, 30, -10, -10]);
  });

  it('settles troel for the pair, 13 tricks worth 30', () => {
    const contract: Contract = {
      bid: { kind: 'troel' },
      declarers: [0, 1],
      trump: 'H',
      tricksNeeded: 8,
      leader: 1,
    };
    expect(scoreHand(contract, playWithTricks([5, 3, 4, 1])).deltas).toEqual([16, 16, -16, -16]);
    expect(scoreHand(contract, playWithTricks([7, 6, 0, 0])).deltas).toEqual([30, 30, -30, -30]);
    expect(scoreHand(contract, playWithTricks([4, 3, 5, 1])).deltas).toEqual([-16, -16, 16, 16]);
  });

  it('respects a troel trump switch needing 9 tricks', () => {
    const contract: Contract = {
      bid: { kind: 'troel' },
      declarers: [0, 1],
      trump: 'S',
      tricksNeeded: 9,
      leader: 1,
    };
    expect(scoreHand(contract, playWithTricks([5, 3, 4, 1])).deltas).toEqual([-16, -16, 16, 16]);
    expect(scoreHand(contract, playWithTricks([5, 4, 3, 1])).deltas).toEqual([16, 16, -16, -16]);
  });

  it('settles two simultaneous miserie declarers independently', () => {
    const contract: Contract = {
      bid: { kind: 'groteMiserie' },
      declarers: [0, 2],
      trump: null,
      tricksNeeded: 0,
      leader: 1,
    };
    // Seat 0 succeeds (0 tricks), seat 2 fails (2 tricks).
    const { deltas } = scoreHand(contract, playWithTricks([0, 6, 2, 5]));
    // Seat 0: +36 from table, pays nothing for seat 2's fail... receives +12 from seat 2's settlement.
    // Seat 0: +36 (own) + 12 (seat 2 down) = 48. Seat 2: -36 (own) - 12 = -48. Seats 1,3: -12 + 12 = 0.
    expect(deltas).toEqual([48, 0, -48, 0]);
    expect(deltas.reduce((a, b) => a + b, 0)).toBe(0);
  });

  it('applies the doubling multiplier', () => {
    const contract: Contract = {
      bid: { kind: 'samen', tricks: 8, suit: 'H' },
      declarers: [0, 2],
      trump: 'H',
      tricksNeeded: 8,
      leader: 1,
    };
    const { deltas } = scoreHand(contract, playWithTricks([5, 2, 3, 3]), 2);
    expect(deltas).toEqual([16, -16, 16, -16]);
  });

  it('always sums to zero', () => {
    const seats: Seat[] = [0, 1, 2, 3];
    for (const declarer of seats) {
      const tricks = [3, 4, 3, 3];
      tricks[declarer] = 3;
      const contract: Contract = {
        bid: { kind: 'alleen', tricks: 5, suit: 'C' },
        declarers: [declarer],
        trump: 'C',
        tricksNeeded: 5,
        leader: 0,
      };
      const { deltas } = scoreHand(contract, playWithTricks(tricks));
      expect(deltas.reduce((a, b) => a + b, 0)).toBe(0);
    }
  });
});
