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
    s = act(s, 3, { type: 'meegaan', suit: 'H' });
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
    expect(legal).toContainEqual({ type: 'meegaan', suit: 'C' });
    expect(legal.some((a) => a.type === 'vraag')).toBe(false);
    s = act(s, 1, { type: 'meegaan', suit: 'C' });
    expect(s.phase).toBe('playing');
    expect(s.contract!.declarers.sort()).toEqual([1, 2]);
  });
});

describe('auction: raising and passe parole', () => {
  function pairOutbidByKleineMiserie(): GameState {
    let s = stateWithHands(craftHands([[], [], [], []]), 0);
    s = act(s, 1, { type: 'vraag', suit: 'H' });
    s = act(s, 2, { type: 'pass' });
    s = act(s, 3, { type: 'meegaan', suit: 'H' });
    s = act(s, 0, { type: 'miserie', variant: 'klein' });
    return s;
  }

  const levelOf = (s: GameState, proposer: Seat) =>
    s.auction.proposals.find((p) => p.seat === proposer)?.level;

  it('gives the acceptor a raise-or-hand-off decision when outbid (no direct pass)', () => {
    const s = pairOutbidByKleineMiserie();
    expect(s.auction.pending).toMatchObject({ seat: 3, kind: 'pairRaise', pairSeat: 1 });
    const legal = legalActions(s, 3);
    expect(legal).toContainEqual({ type: 'raise' }); // min raise is samen 11 over kleine miserie
    expect(legal).toContainEqual({ type: 'parole' });
    expect(legal.some((a) => a.type === 'pass')).toBe(false);
  });

  it('raise lifts the partnership to samen 11 and wins if others pass', () => {
    let s = pairOutbidByKleineMiserie();
    s = act(s, 3, { type: 'raise' });
    expect(levelOf(s, 1)).toBe(11);
    // The kleine miserie bidder is active again and passes.
    s = act(s, 0, { type: 'pass' });
    expect(s.phase).toBe('playing');
    expect(s.contract!.bid).toEqual({ kind: 'samen', tricks: 11, suit: 'H' });
    expect(s.contract!.declarers.sort()).toEqual([1, 3]);
  });

  it('parole hands the decision to the proposer, who can raise', () => {
    let s = pairOutbidByKleineMiserie();
    s = act(s, 3, { type: 'parole' });
    expect(s.auction.pending).toMatchObject({ seat: 1, kind: 'parole', pairSeat: 1 });
    const legal = legalActions(s, 1);
    expect(legal).toContainEqual({ type: 'raise' });
    expect(legal).toContainEqual({ type: 'pass' });
    s = act(s, 1, { type: 'raise' });
    expect(levelOf(s, 1)).toBe(11);
    s = act(s, 0, { type: 'pass' });
    expect(s.contract!.bid.kind).toBe('samen');
    expect(s.contract!.bid.tricks).toBe(11);
  });

  it('drops the pair out entirely when the proposer passes after a hand-off', () => {
    let s = pairOutbidByKleineMiserie();
    s = act(s, 3, { type: 'parole' });
    s = act(s, 1, { type: 'pass' });
    // No bound-solo: the pair is fully out and the kleine miserie wins.
    expect(s.phase).toBe('discard');
    expect(s.contract!.bid.kind).toBe('kleineMiserie');
    expect(s.contract!.declarers).toEqual([0]);
  });
});

describe('auction: competing proposals', () => {
  const levelOf = (s: GameState, proposer: Seat) =>
    s.auction.proposals.find((p) => p.seat === proposer)?.level;

  it('lets a player propose a different suit while a proposal is open', () => {
    let s = stateWithHands(craftHands([[], [], [], []]), 0);
    s = act(s, 1, { type: 'vraag', suit: 'D' }); // mirrors the screenshot: a bot asks ♦
    const legal = legalActions(s, 2);
    expect(legal).toContainEqual({ type: 'meegaan', suit: 'D' }); // join the diamonds ask
    expect(legal).toContainEqual({ type: 'vraag', suit: 'H' }); // or ask another suit
    expect(legal).toContainEqual({ type: 'vraag', suit: 'C' });
    expect(legal).toContainEqual({ type: 'vraag', suit: 'S' });
    expect(legal.some((a) => a.type === 'vraag' && a.suit === 'D')).toBe(false); // not the live suit
  });

  it('forms two pairs and the higher suit wins the tie at equal level', () => {
    let s = stateWithHands(craftHands([[], [], [], []]), 0);
    s = act(s, 1, { type: 'vraag', suit: 'S' });
    s = act(s, 2, { type: 'vraag', suit: 'H' });
    s = act(s, 3, { type: 'meegaan', suit: 'S' }); // pair(1,3) spades 8 leads
    expect(levelOf(s, 1)).toBe(8);
    s = act(s, 0, { type: 'meegaan', suit: 'H' }); // pair(0,2) hearts 8 — beats spades by suit at level 8
    expect(levelOf(s, 2)).toBe(8);
    // The trailing spades pair must decide, acceptor (seat 3) first.
    expect(s.auction.pending).toMatchObject({ seat: 3, kind: 'pairRaise', pairSeat: 1 });
    s = act(s, 3, { type: 'parole' });
    s = act(s, 1, { type: 'pass' }); // spades pair drops out entirely
    expect(s.phase).toBe('playing');
    expect(s.contract!.bid).toEqual({ kind: 'samen', tricks: 8, suit: 'H' });
    expect(s.contract!.declarers.sort()).toEqual([0, 2]);
  });

  it('lets the trailing pair raise to retake the lead (raise-war ping-pong)', () => {
    let s = stateWithHands(craftHands([[], [], [], []]), 0);
    s = act(s, 1, { type: 'vraag', suit: 'S' });
    s = act(s, 2, { type: 'vraag', suit: 'H' });
    s = act(s, 3, { type: 'meegaan', suit: 'S' }); // pair(1,3) spades 8
    s = act(s, 0, { type: 'meegaan', suit: 'H' }); // pair(0,2) hearts 8 leads
    expect(s.auction.pending).toMatchObject({ seat: 3, kind: 'pairRaise', pairSeat: 1 });
    s = act(s, 3, { type: 'raise' }); // spades 9 beats hearts 8
    expect(levelOf(s, 1)).toBe(9);
    // Now the hearts pair must decide.
    expect(s.auction.pending).toMatchObject({ seat: 0, kind: 'pairRaise', pairSeat: 2 });
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
    s = act(s, 2, { type: 'meegaan', suit: 'H' });
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
