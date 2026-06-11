# Wiezen

Online multiplayer **kleurenwiezen** (Belgian colour whist) for 4 players in the browser.
Play with friends via an invite code; empty seats can be filled with simple bots.

- Rules implemented: see [docs/RULES.md](docs/RULES.md) — full contract set incl. troel,
  abondance, miseries, piccolo, solo slim and passe parole; standard zero-sum point table.
- Stack rationale: see [docs/TECH.md](docs/TECH.md) — Angular 22 + Firebase
  (Firestore, Cloud Functions 2nd gen, anonymous Auth, Hosting).
- Build plan: see [docs/PLAN.md](docs/PLAN.md).

## Architecture

```
packages/engine   Pure TypeScript rules engine (zero deps) — used by client AND server
apps/web          Angular 22 SPA (signals, zoneless), plain Firebase JS SDK
functions         Cloud Functions (callable, 2nd gen) — the authoritative game server
firestore.rules   Clients can read public state + their own hand; nobody writes directly
```

Game state lives in three places per table:

- `tables/{code}` — public lobby/game summary (readable by signed-in users)
- `tables/{code}/private/{uid}` — that player's view incl. their hand (owner-only read)
- `tables/{code}/secret/state` — full engine state (Cloud Functions only)

Every move is a callable function (`act`) that validates with the shared engine and
commits in a transaction. The client uses the same engine to highlight legal moves
instantly. Bots run server-side after each human action.

## Local development

Prerequisites: Node ≥ 20, Java (for the Firestore emulator, e.g. `brew install openjdk`).

```bash
npm install
npm run build                      # engine + functions + web
npx firebase emulators:start --project demo-wiezen   # auth/firestore/functions/hosting
npm start -w web                   # Angular dev server on http://localhost:4200
```

The dev build automatically connects to the emulators (see
`apps/web/src/app/core/firebase.service.ts`). Open multiple browser profiles
(or incognito windows) to seat several human players.

If Java is keg-only from Homebrew: `export PATH="/opt/homebrew/opt/openjdk/bin:$PATH"`.

### Tests

```bash
npm run test:engine     # 39 unit tests incl. bot-vs-bot full-game simulations
node scripts/e2e.mjs    # end-to-end smoke test against running emulators
```

## Deploying to Firebase

1. Create a Firebase project (console.firebase.google.com), enable **Anonymous**
   authentication, **Firestore** (region `europe-west1`) and the **Blaze** plan
   (required for Cloud Functions; free quotas cover hobby use — set a budget alert).
2. Add a web app in the project settings and copy its config into
   `apps/web/src/app/core/firebase.service.ts` (replace the demo config).
3. `npx firebase login && npx firebase use <project-id>`
4. `npm run build && npx firebase deploy`

This ships hosting (the built SPA), the functions bundle, and the Firestore rules.

## Known limitations (v1)

- No persistent accounts/stats (anonymous auth only), no spectators, no chat.
- Bots are simple rule-based players: they propose/accept and occasionally bid
  abondance, but never bid miseries.
- A handful of regional bidding conventions are fixed to one ruleset
  (documented in docs/RULES.md §"Implementation defaults" and in
  `packages/engine/src/auction.ts`).
