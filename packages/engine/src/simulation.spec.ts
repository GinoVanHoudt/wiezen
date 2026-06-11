import { describe, expect, it } from 'vitest';
import { newGame, nextHand } from './game.js';
import { playerView } from './view.js';
import { GameState } from './types.js';
import { botsFinishHand } from './testing/util.js';

/**
 * Bots play complete games end to end. This exercises dealing, troel detection,
 * the whole auction state machine, trick play and scoring across many random deals.
 */
describe('bot-vs-bot simulation', () => {
  it('plays 100 games of 4 hands each without errors, scores always sum to zero', () => {
    const contractsSeen = new Set<string>();
    for (let seed = 0; seed < 100; seed++) {
      let state: GameState = newGame(`sim-${seed}`);
      for (let hand = 0; hand < 4; hand++) {
        state = botsFinishHand(state);
        expect(state.phase).toBe('scored');
        contractsSeen.add(state.contract!.bid.kind);

        // Zero-sum invariant.
        expect(state.lastHandDeltas!.reduce((a, b) => a + b, 0)).toBe(0);
        expect(state.scores.reduce((a, b) => a + b, 0)).toBe(0);

        // All tricks accounted for.
        const total = state.play!.tricksWon.reduce((a, b) => a + b, 0);
        expect(total).toBe(state.play!.totalTricks);

        // All cards played.
        expect(state.hands.every((h) => h.length === 0)).toBe(true);

        state = nextHand(state);
      }
    }
    // Bots should at least produce the bread-and-butter contracts.
    expect(contractsSeen.has('samen')).toBe(true);
  });

  it('players never see another hand through their view', () => {
    let state = newGame('view-check');
    const view = playerView(state, 0);
    expect(view.hand).toEqual(state.hands[0]);
    const json = JSON.stringify(view);
    // No card from another player's hand may appear in the view.
    for (const card of state.hands[1]!) {
      expect(json.includes(`"${card}"`)).toBe(false);
    }
    expect(view.handCounts).toEqual([13, 13, 13, 13]);
  });
});
