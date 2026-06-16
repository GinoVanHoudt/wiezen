import { describe, expect, it } from 'vitest';
import { applyAction, legalActions } from './game.js';
import { trickWinner } from './play.js';
import { GameState, Seat } from './types.js';
import { craftHands, stateWithHands } from './testing/util.js';

function samen8InHearts(): GameState {
  // Seat 1 proposes hearts, seat 3 accepts, others pass. Dealer 0, leader 1.
  let s = stateWithHands(
    craftHands([
      ['S2', 'S3', 'H2'],
      ['H14', 'H13', 'S4'],
      ['S5', 'S6', 'H3'],
      ['H12', 'H11', 'S7'],
    ]),
    0,
  );
  s = applyAction(s, 1, { type: 'vraag', suit: 'H' });
  s = applyAction(s, 2, { type: 'pass' });
  s = applyAction(s, 3, { type: 'meegaan', suit: 'H' });
  s = applyAction(s, 0, { type: 'pass' });
  expect(s.phase).toBe('playing');
  return s;
}

describe('trickWinner', () => {
  it('highest of led suit wins without trump involvement', () => {
    expect(
      trickWinner(
        [
          { seat: 1, card: 'D10' },
          { seat: 2, card: 'D13' },
          { seat: 3, card: 'S14' },
          { seat: 0, card: 'D2' },
        ],
        'H',
      ),
    ).toBe(2);
  });

  it('trump beats the led suit, higher trump beats lower', () => {
    expect(
      trickWinner(
        [
          { seat: 1, card: 'D10' },
          { seat: 2, card: 'H2' },
          { seat: 3, card: 'H5' },
          { seat: 0, card: 'D14' },
        ],
        'H',
      ),
    ).toBe(3);
  });

  it('without trump (miserie) only the led suit counts', () => {
    expect(
      trickWinner(
        [
          { seat: 2, card: 'C4' },
          { seat: 3, card: 'S14' },
          { seat: 0, card: 'H14' },
          { seat: 1, card: 'C5' },
        ],
        null,
      ),
    ).toBe(1);
  });
});

describe('trick play', () => {
  it('enforces following suit', () => {
    let s = samen8InHearts();
    // Leader is seat 1; lead a spade.
    s = applyAction(s, 1, { type: 'play', card: 'S4' });
    // Seat 2 holds spades and must follow.
    const legal = legalActions(s, 2);
    expect(legal.every((a) => a.type === 'play' && a.card.startsWith('S'))).toBe(true);
    expect(() => applyAction(s, 2, { type: 'play', card: 'H3' })).toThrow();
  });

  it('plays a full trick and the winner leads next', () => {
    let s = samen8InHearts();
    s = applyAction(s, 1, { type: 'play', card: 'S4' });
    const followers: Seat[] = [2, 3, 0];
    for (const seat of followers) {
      const legal = legalActions(s, seat);
      s = applyAction(s, seat, legal[legal.length - 1]!);
    }
    expect(s.play!.completedTricks.length).toBe(1);
    const winner = s.play!.completedTricks[0]!.winner;
    expect(s.play!.turn).toBe(winner);
    expect(s.play!.tricksWon[winner]).toBe(1);
  });

  it('it is not allowed to play out of turn', () => {
    const s = samen8InHearts();
    expect(legalActions(s, 2)).toEqual([]);
    expect(() => applyAction(s, 2, { type: 'play', card: 'S5' })).toThrow();
  });
});

describe('kleine miserie discard', () => {
  it('all four discard one card, then 12 tricks are played', () => {
    let s = stateWithHands(craftHands([[], [], [], []]), 0);
    s = applyAction(s, 1, { type: 'miserie', variant: 'klein' });
    s = applyAction(s, 2, { type: 'pass' });
    s = applyAction(s, 3, { type: 'pass' });
    s = applyAction(s, 0, { type: 'pass' });
    expect(s.phase).toBe('discard');
    for (const seat of [0, 1, 2, 3] as Seat[]) {
      const legal = legalActions(s, seat);
      expect(legal.length).toBe(13);
      s = applyAction(s, seat, legal[0]!);
    }
    expect(s.phase).toBe('playing');
    expect(s.play!.totalTricks).toBe(12);
    expect(s.hands.every((h) => h.length === 12)).toBe(true);
  });
});
