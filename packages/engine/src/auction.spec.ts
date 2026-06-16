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
    expect(legal).toContainEqual({ type: 'alleen', tricks: 5, suit: 'S' });
    expect(legal.some((a) => a.type === 'vraag')).toBe(false);
    s = act(s, 1, { type: 'alleen', tricks: 5, suit: 'S' });
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

  it('hides vraag for the last speaker once a pair has formed (nobody left to accept)', () => {
    // Mirrors the screenshot: seat 1 asks ♥, seat 2 goes along, seat 3 passes, and the
    // dealer (seat 0) speaks last. A samen proposal here could never be accepted, so it
    // is not offered — but going solo still is, and it is not troel.
    let s = stateWithHands(craftHands([[], [], [], []]), 0);
    s = act(s, 1, { type: 'vraag', suit: 'H' });
    s = act(s, 2, { type: 'meegaan', suit: 'H' });
    s = act(s, 3, { type: 'pass' });
    expect(s.auction.turn).toBe(0);
    expect(s.auction.troel).toBeUndefined();
    const legal = legalActions(s, 0);
    expect(legal.some((a) => a.type === 'vraag')).toBe(false);
    expect(legal.some((a) => a.type === 'meegaan')).toBe(false); // the ask is already taken
    expect(legal).toContainEqual({ type: 'pass' });
    expect(legal.some((a) => a.type === 'abondance')).toBe(true); // solo still on the table
  });

  it('lets the last speaker go alleen once all others are committed (screenshot case)', () => {
    // seat 1 asks ♥, seat 2 joins, seat 3 passes: the dealer never proposed but no
    // partnership is left, so it may go alone in any held suit except the taken ♥.
    let s = stateWithHands(craftHands([[], [], [], []]), 0);
    s = act(s, 1, { type: 'vraag', suit: 'H' });
    s = act(s, 2, { type: 'meegaan', suit: 'H' });
    s = act(s, 3, { type: 'pass' });
    expect(s.auction.turn).toBe(0);
    const legal = legalActions(s, 0);
    const alleen = legal.filter((a) => a.type === 'alleen');
    expect(alleen.length).toBeGreaterThan(0); // can go alone
    expect(alleen.every((a) => a.type === 'alleen' && a.tricks === 5)).toBe(true); // min level beats samen 8
    expect(alleen.some((a) => a.type === 'alleen' && a.suit === 'C')).toBe(true); // e.g. clubs
    expect(alleen.some((a) => a.type === 'alleen' && a.suit === 'H')).toBe(false); // not the pair's suit
    // Going alone outbids samen 8, so the hearts pair gets a raise decision; once they
    // drop out the contract settles as the dealer's lone clubs solo.
    s = act(s, 0, { type: 'alleen', tricks: 5, suit: 'C' });
    expect(s.auction.high!.bid).toEqual({ kind: 'alleen', tricks: 5, suit: 'C' });
    expect(s.auction.pending).toMatchObject({ seat: 2, kind: 'pairRaise', pairSeat: 1 });
    s = act(s, 2, { type: 'parole' });
    s = act(s, 1, { type: 'pass' }); // hearts pair drops out
    expect(s.phase).toBe('playing');
    expect(s.contract!.bid).toEqual({ kind: 'alleen', tricks: 5, suit: 'C' });
    expect(s.contract!.declarers).toEqual([0]);
    expect(s.contract!.trump).toBe('C');
  });

  it('does not offer alleen while a partnership is still possible', () => {
    // First speaker, nobody committed yet: must try to partner first, no lone solo.
    const s = stateWithHands(craftHands([[], [], [], []]), 0);
    expect(s.auction.turn).toBe(1);
    expect(legalActions(s, 1).some((a) => a.type === 'alleen')).toBe(false);
  });

  it('hides vraag for the last speaker when everyone else has passed', () => {
    let s = stateWithHands(craftHands([[], [], [], []]), 0);
    s = act(s, 1, { type: 'pass' });
    s = act(s, 2, { type: 'pass' });
    s = act(s, 3, { type: 'pass' });
    expect(s.auction.turn).toBe(0);
    const legal = legalActions(s, 0);
    expect(legal.some((a) => a.type === 'vraag')).toBe(false); // no partner can ever accept
    expect(legal).toContainEqual({ type: 'pass' }); // pass folds the round into a redeal
    expect(legal.some((a) => a.type === 'abondance')).toBe(true);
  });

  it('still offers vraag while an open proposal keeps another seat live', () => {
    // seat 1's ♥ ask is open and seats 2 & 3 passed; the dealer may still ask a new suit
    // because the open proposer (seat 1) can come back round and accept it.
    let s = stateWithHands(craftHands([[], [], [], []]), 0);
    s = act(s, 1, { type: 'vraag', suit: 'H' });
    s = act(s, 2, { type: 'pass' });
    s = act(s, 3, { type: 'pass' });
    expect(s.auction.turn).toBe(0);
    const legal = legalActions(s, 0);
    expect(legal).toContainEqual({ type: 'meegaan', suit: 'H' });
    expect(legal).toContainEqual({ type: 'vraag', suit: 'S' });
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

  it('abondance cannot be converted from a still-open proposal', () => {
    let s = stateWithHands(craftHands([[], [], [], []]), 0);
    s = act(s, 1, { type: 'vraag', suit: 'H' });
    s = act(s, 2, { type: 'pass' });
    s = act(s, 3, { type: 'pass' });
    s = act(s, 0, { type: 'pass' });
    // Proposer's second turn with an open ask (not yet a solo): no abondance (§2.3).
    expect(legalActions(s, 1).some((a) => a.type === 'abondance')).toBe(false);
  });

  it('lets a standing solo bidder climb past alleen 8 into abondance (RULES.md §2.5)', () => {
    // Mirrors the screenshot: a player going alone is repeatedly outbid by a raising samen
    // pair. alleen caps at 8, so once the pair tops it the only way up is abondance in the
    // same suit. The engine only ever offers the minimum alleen that retakes the lead, so
    // the climb is a forced ping-pong: alleen 5/6/7/8 against the pair's samen 9/10/11/12.
    let s = stateWithHands(craftHands([[], [], [], []]), 0);
    s = act(s, 1, { type: 'vraag', suit: 'H' }); // pair forms in hearts (seats 1 & 2)
    s = act(s, 2, { type: 'meegaan', suit: 'H' });
    s = act(s, 3, { type: 'pass' }); // dealer (seat 0) is last and nobody can partner it
    const climb = (tricks: number) => {
      expect(s.auction.turn).toBe(0);
      s = act(s, 0, { type: 'alleen', tricks, suit: 'D' }); // go / re-raise alone in diamonds
      expect(s.auction.pending).toMatchObject({ seat: 2, kind: 'pairRaise', pairSeat: 1 });
      s = act(s, 2, { type: 'raise' }); // acceptor lifts the pair to retake the lead
    };
    climb(5); // alleen 5 → samen 9
    // Once outbid, the solo may keep climbing alleen OR jump straight to abondance.
    let legal = legalActions(s, 0);
    expect(legal.some((a) => a.type === 'alleen')).toBe(true);
    expect(legal).toContainEqual({ type: 'abondance', tricks: 9, suit: 'D' });
    climb(6); // alleen 6 → samen 10
    climb(7); // alleen 7 → samen 11
    climb(8); // alleen 8 → samen 12
    // Pair now sits at samen 12; alleen can no longer compete (caps at 8).
    expect(s.auction.turn).toBe(0);
    legal = legalActions(s, 0);
    expect(legal.some((a) => a.type === 'alleen')).toBe(false);
    expect(legal).toContainEqual({ type: 'abondance', tricks: 9, suit: 'D' }); // own suit...
    expect(legal.some((a) => a.type === 'abondance' && a.suit !== 'D')).toBe(false); // ...only
    expect(legal.some((a) => a.type === 'soloSlim')).toBe(false); // no straight jump to slim
    // The solo switches to abondance and, once everyone else folds, wins it.
    s = act(s, 0, { type: 'abondance', tricks: 9, suit: 'D' });
    expect(s.auction.pending).toBeUndefined(); // samen 13 < abondance 9: pair cannot answer
    s = act(s, 1, { type: 'pass' });
    s = act(s, 2, { type: 'pass' });
    expect(s.phase).toBe('playing');
    expect(s.contract!.bid).toEqual({ kind: 'abondance', tricks: 9, suit: 'D' });
    expect(s.contract!.declarers).toEqual([0]);
    expect(s.contract!.leader).toBe(0); // abondance declarer leads
  });
});
