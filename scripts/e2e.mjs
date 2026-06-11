/**
 * End-to-end smoke test against the Firebase emulators.
 * Drives a full game as an anonymous client: create table, add 3 bots,
 * start, and let a "human" (played by the engine bot) finish 3 hands.
 *
 *   node scripts/e2e.mjs
 */
import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, signInAnonymously } from 'firebase/auth';
import { connectFirestoreEmulator, doc, getDoc, getFirestore, onSnapshot } from 'firebase/firestore';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';
import { chooseBotAction, legalActionsForView } from '@wiezen/engine';

const app = initializeApp({ apiKey: 'demo-api-key', projectId: 'demo-wiezen' });
const auth = getAuth(app);
const firestore = getFirestore(app);
const functions = getFunctions(app, 'europe-west1');
connectAuthEmulator(auth, 'http://localhost:9099', { disableWarnings: true });
connectFirestoreEmulator(firestore, 'localhost', 8080);
connectFunctionsEmulator(functions, 'localhost', 5001);

const call = (name) => httpsCallable(functions, name);

function fail(msg) {
  console.error(`FAIL: ${msg}`);
  process.exit(1);
}

const { user } = await signInAnonymously(auth);
console.log('signed in as', user.uid);

const { data } = await call('createTable')({ name: 'Tester' });
const code = data.code;
console.log('table created:', code);

for (let i = 0; i < 3; i++) await call('addBot')({ code });
await call('startGame')({ code });
console.log('game started');

// Security checks: secret state and foreign private docs must be unreadable.
for (const path of [`tables/${code}/secret/state`, `tables/${code}/private/bot-1`]) {
  try {
    await getDoc(doc(firestore, path));
    fail(`${path} was readable from the client`);
  } catch (e) {
    if (e.code !== 'permission-denied') fail(`unexpected error for ${path}: ${e.code} ${e.message}`);
    console.log(`OK: ${path} is not readable`);
  }
}

// Play three full hands as the human seat, using the engine bot as the brain.
let view = null;
onSnapshot(doc(firestore, `tables/${code}/private/${user.uid}`), (snap) => {
  view = snap.data()?.view ?? null;
});

const waitFor = async (pred, what, timeoutMs = 15000) => {
  const start = Date.now();
  while (!pred()) {
    if (Date.now() - start > timeoutMs) fail(`timeout waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 100));
  }
};

let handsPlayed = 0;
let actions = 0;
while (handsPlayed < 3) {
  await waitFor(() => view !== null, 'private view');
  const v = view;
  if (v.phase === 'scored') {
    const sum = v.lastHandDeltas.reduce((a, b) => a + b, 0);
    if (sum !== 0) fail(`hand deltas sum to ${sum}`);
    console.log(`hand ${v.handNumber} scored: ${v.lastHandSummary} | scores: ${v.scores.join(', ')}`);
    handsPlayed++;
    if (handsPlayed === 3) break;
    await call('nextHand')({ code });
    await waitFor(() => view?.phase !== 'scored', 'next hand to start');
    continue;
  }
  const legal = legalActionsForView(v);
  if (legal.length === 0) {
    // Not our turn; wait for the view to change.
    const before = JSON.stringify(v);
    await waitFor(() => JSON.stringify(view) !== before, 'turn or phase change');
    continue;
  }
  const action = chooseBotAction(v);
  if (++actions > 300) fail('too many actions, possible loop');
  await call('act')({ code, action });
  const before = JSON.stringify(v);
  await waitFor(() => JSON.stringify(view) !== before, `result of ${action.type}`);
}

// Illegal move must be rejected.
try {
  await call('act')({ code, action: { type: 'play', card: 'H14' } });
  fail('illegal/out-of-phase action was accepted');
} catch {
  console.log('OK: illegal action rejected');
}

console.log('PASS: full e2e game flow works');
process.exit(0);
