import { getFirestore, Transaction } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import {
  GameState,
  PlayerView,
  SEATS,
  Seat,
  chooseBotAction,
  applyAction,
  legalActions,
  playerView,
} from '@wiezen/engine';

export interface TablePlayer {
  uid: string;
  name: string;
  isBot: boolean;
  seat: Seat;
}

export interface TableDoc {
  code: string;
  status: 'lobby' | 'playing';
  hostUid: string;
  players: TablePlayer[];
  createdAt: number;
  updatedAt: number;
  /** Public game summary, present while status === 'playing'. */
  game?: {
    phase: string;
    turnSeat: number | null;
    handNumber: number;
    scores: number[];
    handCounts: number[];
    lastHandSummary: string | null;
    contractLabel: string | null;
  };
}

export const db = () => getFirestore();

export function tableRef(code: string) {
  return db().collection('tables').doc(code);
}

export function newTableCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += alphabet[Math.floor(Math.random() * alphabet.length)];
  return code;
}

export async function loadTable(tx: Transaction, code: string): Promise<TableDoc> {
  const snap = await tx.get(tableRef(code));
  if (!snap.exists) throw new HttpsError('not-found', 'table not found');
  return snap.data() as TableDoc;
}

export async function loadState(tx: Transaction, code: string): Promise<GameState> {
  const snap = await tx.get(tableRef(code).collection('secret').doc('state'));
  if (!snap.exists) throw new HttpsError('failed-precondition', 'game not started');
  return JSON.parse((snap.data() as { json: string }).json) as GameState;
}

/** The seat(s) that currently have a decision to make. */
export function actingSeats(state: GameState): Seat[] {
  return SEATS.filter((s) => legalActions(state, s).length > 0);
}

/** Let bot seats act until a human must decide or the hand is scored. */
export function runBots(state: GameState, players: TablePlayer[]): GameState {
  const isBot = (seat: Seat) => players.find((p) => p.seat === seat)?.isBot === true;
  let s = state;
  for (let i = 0; i < 300; i++) {
    const seats = actingSeats(s).filter(isBot);
    if (seats.length === 0) return s;
    const seat = seats[0]!;
    const action = chooseBotAction(playerView(s, seat));
    if (!action) return s;
    s = applyAction(s, seat, action);
  }
  return s;
}

/** Write secret state, per-human private views and the public table summary. */
export function commitState(tx: Transaction, table: TableDoc, state: GameState): void {
  const ref = tableRef(table.code);
  tx.set(ref.collection('secret').doc('state'), { json: JSON.stringify(state) });

  for (const player of table.players) {
    if (player.isBot) continue;
    const view: PlayerView = playerView(state, player.seat);
    tx.set(ref.collection('private').doc(player.uid), { view, updatedAt: Date.now() });
  }

  const acting = actingSeats(state);
  table.game = {
    phase: state.phase,
    turnSeat: acting.length === 1 ? acting[0]! : null,
    handNumber: state.handNumber,
    scores: state.scores,
    handCounts: state.hands.map((h) => h.length),
    lastHandSummary: state.lastHandSummary ?? null,
    contractLabel: state.contract ? state.contract.bid.kind : null,
  };
  table.updatedAt = Date.now();
  tx.set(ref, table);
}

export function seatOf(table: TableDoc, uid: string): Seat {
  const player = table.players.find((p) => p.uid === uid);
  if (!player) throw new HttpsError('permission-denied', 'you are not seated at this table');
  return player.seat;
}
