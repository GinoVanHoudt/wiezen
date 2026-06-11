# Build Plan — Online Multiplayer Kleurenwiezen

Decisions made (2026-06-11):

- **Contracts:** full set incl. piccolo and passe parole (see RULES.md §2.3–2.5, pagat ladder + piccolo).
- **Scoring:** standard zero-sum point table (RULES.md §4.2).
- **Auth:** anonymous sign-in + 6-character invite code/link. Google sign-in possible later.
- **Bots:** simple rule-based bots from the start, to fill empty seats.
- **Stack:** Angular (latest) + Firebase (Firestore, Cloud Functions 2nd gen, Auth, Hosting), plain Firebase JS SDK (no AngularFire), shared pure-TS engine package. See TECH.md.

## Architecture summary

- `packages/engine` — pure TypeScript rules engine, zero dependencies. Full game state machine:
  deal → troel declaration → bidding (vragen/meegaan/raising/passe parole) → play → score.
  Exposes `legalActions(state, seat)`, `applyAction(state, action)`, `playerView(state, seat)`,
  `chooseBotAction(view)` (simple bot). Used by both client and Cloud Functions.
- `functions` — Cloud Functions (callable): `createTable`, `joinTable`, `addBot`, `startGame`,
  `act` (one endpoint for bid/play/discard actions). Loads secret state, validates via engine,
  commits public doc + per-seat private hand docs in a transaction. Runs bot turns inline after
  each human action. Bundled with esbuild so the workspace engine package deploys cleanly.
- `apps/web` — Angular SPA (standalone, signals, zoneless). Lobby (create/join with code) and
  game table (hand, trick area, bidding panel, scoreboard). Firestore snapshot listeners → signals.
- Firestore layout:
  - `tables/{code}` — lobby + public game state. Read: seated players. Write: nobody (functions only).
  - `tables/{code}/private/{uid}` — that player's hand/view. Read: owner. Write: nobody.
  - `tables/{code}/secret/state` — full authoritative engine state. Read/write: nobody (Admin SDK only).
- Local dev: Firebase Emulator Suite (auth, firestore, functions, hosting). Four browser profiles to test.

## Phases

1. **Scaffold** — npm workspaces, Angular app, engine package, functions package, firebase.json,
   firestore.rules, emulator config. ✅ when `npm run build` passes everywhere.
2. **Engine** — types, deck/deal, bid ladder + bidding state machine (troel, wachten, vragen,
   meegaan, raising, passe parole, piccolo, rondje pas → redeal with one-time doubling),
   trick play (follow suit, trump, misère discard), scoring table, playerView, bots.
   Extensive unit tests (vitest). ✅ when full simulated games (bots vs bots) complete correctly
   for every contract type and scores sum to zero.
3. **Backend** — Cloud Functions + Firestore security rules. ✅ when a full game can be played
   through the emulator via function calls.
4. **Frontend** — Angular UI: join/create flow, table view, bidding UI, card play, score sheet.
   ✅ when 4 browser sessions (or 1 human + 3 bots) can play a full game locally.
5. **Polish & deploy docs** — card visuals, turn indicators, reconnect handling, README with
   `firebase deploy` instructions (project setup is manual: Firebase console, Blaze plan).

## Out of scope for v1

Persistent accounts/stats, spectator mode, chat, presence indicators, Flemish doubling scoring,
configurable house rules (the engine keeps a config object so these can come later), mobile apps.
