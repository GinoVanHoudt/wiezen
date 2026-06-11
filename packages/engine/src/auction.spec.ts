import { describe, expect, it } from 'vitest';
import { applyAction, legalActions } from './game.js';
import { Action, GameState, Seat } from './types.js';
import { craftHands, stateWithHands } from './testing/util.js';

function act(state: GameState, seat: Seat, action: Action): GameState {
  return applyAction(state, seat, action);
}

describe('auction: vraag & meegaan', () => {
  it('settles samen 8 after a proposal, acceptance and two passes', () => {
    let s = stateWithHands(craftHands([[], [], [], []]), 0);
    expect(s.auction.turn).toBe(1);
    s = act(s, 1, { type: 'vraag', suit: 'H' });
    s = act(s, 2, { type: 'pass' });
    s = act(s, 3, { type: 'meegaan', tricks: 8 });
    s = act(s, 0, { type: 'pass' });
    expect(s.phase).toBe('playing');
    expect(s.contract!.bid).toEqual({ kind: 'samen', tricks: 8, suit: 'H' });
    expect(s.contract!.declarers.sort()).toEqual([1, 3]);
    expect(s.contract!.trump).toBe('H');
    expect(s.contract!.leader).toBe(1); // left of dealer 0
  });

  it('lets the proposer go alleen when nobody accepts', () => {
    let s = stateWithHands(craftHands([[], [], [], []]), 0);
    s = act(s, 1, { type: 'vraag', suit: 'S' });
    s = act(s, 2, { type: 'pass' });
    s = act(s, 3, { type: 'pass' });
    s = act(s, 0, { type: 'pass' });
    // Back to the proposer: alleen in spades or pass.
    expect(s.auction.turn).toBe(1);
    const legal = legalActions(s, 1);
    expect(legal).toContainEqual({ type: 'alleen', tricks: 5 });
    expect(legal.some((a) => a.type === 'vraag')).toBe(false);
    s = act(s, 1, { type: 'alleen', tricks: 5 });
    expect(s.phase).toBe('playing');
    expect(s.contract!.bid).toEqual({ kind: 'alleen', tricks: 5, suit: 'S' });
    expect(s.contract!.declarers).toEqual([1]);
    expect(s.contract!.leader).toBe(1);
  });

  it('redeals with doubling when everyone passes', () => {
    let s = stateWithHands(craftHands([[], [], [], []]), 0);
    const handsBefore = JSON.stringify(s.hands);
    for (const seat of [1, 2, 3, 0] as Seat[]) s = act(s, seat, { type: 'pass' });
    expect(s.phase).toBe('bidding');
    expect(s.redeals).toBe(1);
    expect(s.doubleNext).toBe(true);
    expect(s.dealer).toBe(0); // same dealer redeals
    expect(JSON.stringify(s.hands)).not.toBe(handsBefore);
  });

  it('supports wachten: first speaker may still accept later', () => {
    let s = stateWithHands(craftHands([[], [], [], []]), 0);
    s = act(s, 1, { type: 'wachten' });
    s = act(s, 2, { type: 'vraag', suit: 'C' });
    s = act(s, 3, { type: 'pass' });
    s = act(s, 0, { type: 'pass' });
    expect(s.auction.turn).toBe(1);
    const legal = legalActions(s, 1);
    expect(legal).toContainEqual({ type: 'meegaan', tricks: 8 });
    expect(legal.some((a) => a.type === 'vraag')).toBe(false);
    s = act(s, 1, { type: 'meegaan', tricks: 8 });
    expect(s.phase).toBe('playing');
    expect(s.contract!.declarers.sort()).toEqual([1, 2]);
  });
});

describe('auction: raising and passe parole', () => {
  function pairOutbidByKleineMiserie(): GameState {
    let s = stateWithHands(craftHands([[], [], [], []]), 0);
    s = act(s, 1, { type: 'vraag', suit: 'H' });
    s = act(s, 2, { type: 'pass' });
    s = act(s, 3, { type: 'meegaan', tricks: 8 });
    s = act(s, 0, { type: 'miserie', variant: 'klein' });
    return s;
  }

  it('gives the acceptor a raise / parole / pass decision when outbid', () => {
    const s = pairOutbidByKleineMiserie();
    expect(s.auction.pending).toEqual({ seat: 3, kind: 'pairRaise' });
    const legal = legalActions(s, 3);
    expect(legal).toContainEqual({ type: 'raise' });
    expect(legal).toContainEqual({ type: 'parole' }); // min raise is samen 11
    expect(legal).toContainEqual({ type: 'pass' });
  });

  it('raise lifts the partnership to samen 11 and wins if others pass', () => {
    let s = pairOutbidByKleineMiserie();
    s = act(s, 3, { type: 'raise' });
    expect(s.auction.samenLevel).toBe(11);
    // The kleine miserie bidder is active again and passes.
    s = act(s, 0, { type: 'pass' });
    expect(s.phase).toBe('playing');
    expect(s.contract!.bid).toEqual({ kind: 'samen', tricks: 11, suit: 'H' });
    expect(s.contract!.declarers.sort()).toEqual([1, 3]);
  });

  it('parole hands the decision to the proposer', () => {
    let s = pairOutbidByKleineMiserie();
    s = act(s, 3, { type: 'parole' });
    expect(s.auction.pending).toEqual({ seat: 1, kind: 'parole' });
    s = act(s, 1, { type: 'raise' });
    expect(s.auction.samenLevel).toBe(11);
    s = act(s, 0, { type: 'pass' });
    expect(s.contract!.bid.kind).toBe('samen');
    expect(s.contract!.bid.tricks).toBe(11);
  });

  it('breaks the pair when the acceptor passes; proposer is bound to the suit', () => {
    let s = pairOutbidByKleineMiserie();
    s = act(s, 3, { type: 'pass' });
    // Proposer (seat 1) is bound: alleen in hearts (min level 8 over kleine miserie) or pass.
    expect(s.auction.turn).toBe(1);
    const legal = legalActions(s, 1);
    expect(legal).toContainEqual({ type: 'alleen', tricks: 8 });
    s = act(s, 1, { type: 'pass' });
    expect(s.phase).toBe('discard'); // kleine miserie won
    expect(s.contract!.bid.kind).toBe('kleineMiserie');
    expect(s.contract!.declarers).toEqual([0]);
  });

  it('binds the acceptor when the proposer declines after parole', () => {
    let s = pairOutbidByKleineMiserie();
    s = act(s, 3, { type: 'parole' });
    s = act(s, 1, { type: 'pass' });
    expect(s.auction.turn).toBe(3);
    const legal = legalActions(s, 3);
    expect(legal).toContainEqual({ type: 'alleen', tricks: 8 });
    s = act(s, 3, { type: 'alleen', tricks: 8 });
    s = act(s, 0, { type: 'pass' });
    expect(s.phase).toBe('playing');
    expect(s.contract!.bid).toEqual({ kind: 'alleen', tricks: 8, suit: 'H' });
    expect(s.contract!.declarers).toEqual([3]);
  });
});

describe('auction: negative contracts and joining', () => {
  it('lets a second player join kleine miserie and both play it', () => {
    let s = stateWithHands(craftHands([[], [], [], []]), 0);
    s = act(s, 1, { type: 'miserie', variant: 'klein' });
    s = act(s, 2, { type: 'miserie', variant: 'klein' });
    s = act(s, 3, { type: 'pass' });
    s = act(s, 0, { type: 'pass' });
    expect(s.phase).toBe('discard');
    expect(s.contract!.bid.kind).toBe('kleineMiserie');
    expect(s.contract!.declarers.sort()).toEqual([1, 2]);
    expect(s.contract!.trump).toBeNull();
  });

  it('grote miserie outbids troel', () => {
    // Seat 2 holds three aces -> automatic troel with seat 0 (4th ace).
    const hands = craftHands([
      ['S14'],
      [],
      ['H14', 'D14', 'C14'],
      [],
    ]);
    let s = stateWithHands(hands, 0);
    expect(s.auction.troel).toMatchObject({ caller: 2, partner: 0, trump: 'S', forcedLead: 'S14' });
    // Only seats 1 and 3 may act; seat 1 overcalls with grote miserie.
    expect(s.auction.turn).toBe(1);
    s = act(s, 1, { type: 'miserie', variant: 'groot' });
    // Troel is dissolved, so caller and partner are free to act again.
    s = act(s, 2, { type: 'pass' });
    s = act(s, 3, { type: 'pass' });
    s = act(s, 0, { type: 'pass' });
    expect(s.phase).toBe('playing');
    expect(s.contract!.bid.kind).toBe('groteMiserie');
    expect(s.contract!.declarers).toEqual([1]);
  });
});

describe('auction: troel', () => {
  function troelState(): GameState {
    const hands = craftHands([
      ['S14'], // partner: 4th ace
      [],
      ['H14', 'D14', 'C14'], // caller
      [],
    ]);
    let s = stateWithHands(hands, 0);
    s = act(s, 1, { type: 'pass' });
    s = act(s, 3, { type: 'pass' });
    return s;
  }

  it('resolves to troel with the partner choosing trump', () => {
    let s = troelState();
    expect(s.phase).toBe('troelTrump');
    expect(s.contract!.declarers.sort()).toEqual([0, 2]);
    s = act(s, 0, { type: 'troelKeep' });
    expect(s.phase).toBe('playing');
    expect(s.contract!.trump).toBe('S');
    expect(s.contract!.tricksNeeded).toBe(8);
    expect(s.contract!.leader).toBe(0);
    // Forced lead: the partner's only legal play is the 4th ace.
    expect(legalActions(s, 0)).toEqual([{ type: 'play', card: 'S14' }]);
  });

  it('switching trump raises the target to 9 and frees the lead', () => {
    let s = troelState();
    s = act(s, 0, { type: 'troelSwitch', suit: 'C' });
    expect(s.phase).toBe('playing');
    expect(s.contract!.trump).toBe('C');
    expect(s.contract!.tricksNeeded).toBe(9);
    expect(s.contract!.forcedLead).toBeUndefined();
    expect(s.contract!.leader).toBe(1);
    expect(legalActions(s, 1).length).toBe(13);
  });

  it('detects a four-ace troel with the highest outside heart as partner', () => {
    const hands = craftHands([
      [],
      ['H14', 'D14', 'C14', 'S14', 'H10'], // caller with all four aces and a low-ish heart
      ['H13'], // highest heart outside the caller's hand
      [],
    ]);
    const s = stateWithHands(hands, 0);
    expect(s.auction.troel).toMatchObject({
      caller: 1,
      partner: 2,
      aces: 4,
      trump: 'H',
      forcedLead: 'H13',
    });
  });
});

describe('auction: abondance', () => {
  it('abondance beats samen, declarer leads', () => {
    let s = stateWithHands(craftHands([[], [], [], []]), 0);
    s = act(s, 1, { type: 'vraag', suit: 'H' });
    s = act(s, 2, { type: 'meegaan', tricks: 8 });
    s = act(s, 3, { type: 'abondance', tricks: 9, suit: 'D' });
    // Pair cannot raise over abondance (samen 13 < abondance 9): no pending decision.
    expect(s.auction.pending).toBeUndefined();
    s = act(s, 0, { type: 'pass' });
    // Pair members are active again (their samen is dead); both pass.
    s = act(s, 1, { type: 'pass' });
    s = act(s, 2, { type: 'pass' });
    expect(s.phase).toBe('playing');
    expect(s.contract!.bid).toEqual({ kind: 'abondance', tricks: 9, suit: 'D' });
    expect(s.contract!.leader).toBe(3);
  });

  it('abondance is only available on the first speaking turn', () => {
    let s = stateWithHands(craftHands([[], [], [], []]), 0);
    s = act(s, 1, { type: 'vraag', suit: 'H' });
    s = act(s, 2, { type: 'pass' });
    s = act(s, 3, { type: 'pass' });
    s = act(s, 0, { type: 'pass' });
    // Proposer's second turn: no abondance anymore.
    expect(legalActions(s, 1).some((a) => a.type === 'abondance')).toBe(false);
  });
});
