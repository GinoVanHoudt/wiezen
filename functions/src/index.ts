import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { setGlobalOptions } from 'firebase-functions/v2';
import {
  Action,
  GameState,
  Seat,
  applyAction,
  newGame,
  nextHand as engineNextHand,
} from '@wiezen/engine';
import {
  TableDoc,
  TablePlayer,
  commitState,
  db,
  loadState,
  loadTable,
  newTableCode,
  runBots,
  seatOf,
  tableRef,
} from './common.js';

initializeApp();
// PlayerView legitimately contains undefined fields (e.g. `play` during bidding).
getFirestore().settings({ ignoreUndefinedProperties: true });
setGlobalOptions({ region: 'europe-west1', maxInstances: 5 });

const BOT_NAMES = ['Bot Miel', 'Bot Willy', 'Bot Rita', 'Bot Xavier'];

function requireAuth(uid: string | undefined): string {
  if (!uid) throw new HttpsError('unauthenticated', 'sign in first');
  return uid;
}

function cleanName(raw: unknown): string {
  const name = String(raw ?? '').trim().slice(0, 20);
  if (name.length === 0) throw new HttpsError('invalid-argument', 'name is required');
  return name;
}

export const createTable = onCall(async (request) => {
  const uid = requireAuth(request.auth?.uid);
  const name = cleanName(request.data?.name);
  const code = newTableCode();
  const table: TableDoc = {
    code,
    status: 'lobby',
    hostUid: uid,
    players: [{ uid, name, isBot: false, seat: 0 }],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  await tableRef(code).create(table);
  return { code };
});

export const joinTable = onCall(async (request) => {
  const uid = requireAuth(request.auth?.uid);
  const name = cleanName(request.data?.name);
  const code = String(request.data?.code ?? '').toUpperCase();
  await db().runTransaction(async (tx) => {
    const table = await loadTable(tx, code);
    if (table.players.some((p) => p.uid === uid)) return; // already seated
    if (table.status !== 'lobby') throw new HttpsError('failed-precondition', 'game already started');
    if (table.players.length >= 4) throw new HttpsError('failed-precondition', 'table is full');
    const seat = ([0, 1, 2, 3] as Seat[]).find((s) => !table.players.some((p) => p.seat === s))!;
    table.players.push({ uid, name, isBot: false, seat });
    table.updatedAt = Date.now();
    tx.set(tableRef(code), table);
  });
  return { code };
});

export const addBot = onCall(async (request) => {
  const uid = requireAuth(request.auth?.uid);
  const code = String(request.data?.code ?? '').toUpperCase();
  await db().runTransaction(async (tx) => {
    const table = await loadTable(tx, code);
    if (table.hostUid !== uid) throw new HttpsError('permission-denied', 'only the host can add bots');
    if (table.status !== 'lobby') throw new HttpsError('failed-precondition', 'game already started');
    if (table.players.length >= 4) throw new HttpsError('failed-precondition', 'table is full');
    const seat = ([0, 1, 2, 3] as Seat[]).find((s) => !table.players.some((p) => p.seat === s))!;
    const bot: TablePlayer = {
      uid: `bot-${seat}`,
      name: BOT_NAMES[seat]!,
      isBot: true,
      seat,
    };
    table.players.push(bot);
    table.updatedAt = Date.now();
    tx.set(tableRef(code), table);
  });
  return { code };
});

export const startGame = onCall(async (request) => {
  const uid = requireAuth(request.auth?.uid);
  const code = String(request.data?.code ?? '').toUpperCase();
  await db().runTransaction(async (tx) => {
    const table = await loadTable(tx, code);
    if (table.hostUid !== uid) throw new HttpsError('permission-denied', 'only the host can start');
    if (table.status !== 'lobby') throw new HttpsError('failed-precondition', 'already started');
    if (table.players.length !== 4) throw new HttpsError('failed-precondition', 'need 4 players (add bots?)');
    const seed = `${code}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    let state: GameState = newGame(seed);
    state = runBots(state, table.players);
    table.status = 'playing';
    commitState(tx, table, state);
  });
  return { code };
});

export const act = onCall(async (request) => {
  const uid = requireAuth(request.auth?.uid);
  const code = String(request.data?.code ?? '').toUpperCase();
  const action = request.data?.action as Action;
  if (!action || typeof action.type !== 'string') {
    throw new HttpsError('invalid-argument', 'action is required');
  }
  await db().runTransaction(async (tx) => {
    const table = await loadTable(tx, code);
    if (table.status !== 'playing') throw new HttpsError('failed-precondition', 'game is not running');
    const seat = seatOf(table, uid);
    let state = await loadState(tx, code);
    try {
      state = applyAction(state, seat, action);
    } catch (e) {
      throw new HttpsError('failed-precondition', e instanceof Error ? e.message : 'illegal move');
    }
    state = runBots(state, table.players);
    commitState(tx, table, state);
  });
  return { ok: true };
});

export const nextHand = onCall(async (request) => {
  const uid = requireAuth(request.auth?.uid);
  const code = String(request.data?.code ?? '').toUpperCase();
  await db().runTransaction(async (tx) => {
    const table = await loadTable(tx, code);
    if (table.status !== 'playing') throw new HttpsError('failed-precondition', 'game is not running');
    seatOf(table, uid); // must be seated
    let state = await loadState(tx, code);
    if (state.phase !== 'scored') throw new HttpsError('failed-precondition', 'hand is not finished');
    state = engineNextHand(state);
    state = runBots(state, table.players);
    commitState(tx, table, state);
  });
  return { ok: true };
});
