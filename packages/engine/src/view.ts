import { GameState, PlayerView, SEATS, Seat } from './types.js';

/** Strip everything `seat` is not allowed to see. */
export function playerView(state: GameState, seat: Seat): PlayerView {
  const view: PlayerView = {
    seat,
    phase: state.phase,
    dealer: state.dealer,
    hand: [...state.hands[seat]!],
    handCounts: state.hands.map((h) => h.length),
    auction: structuredClone(state.auction),
    contract: state.contract ? structuredClone(state.contract) : undefined,
    play: state.play ? structuredClone(state.play) : undefined,
    doubleNext: state.doubleNext,
    scores: [...state.scores],
    lastHandDeltas: state.lastHandDeltas ? [...state.lastHandDeltas] : undefined,
    lastHandSummary: state.lastHandSummary,
    handNumber: state.handNumber,
  };

  // Open miserie: the declarer's hand is exposed once trick 1 is complete.
  if (
    state.phase === 'playing' &&
    state.contract?.bid.kind === 'openMiserie' &&
    state.play &&
    state.play.completedTricks.length >= 1
  ) {
    view.exposedHands = state.contract.declarers
      .filter((d) => d !== seat)
      .map((d) => ({ seat: d, cards: [...state.hands[d]!] }));
  }

  return view;
}

/** Views for all four seats (used by the server to write private docs). */
export function allViews(state: GameState): PlayerView[] {
  return SEATS.map((s) => playerView(state, s));
}
