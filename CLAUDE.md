# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Online multiplayer **kleurenwiezen** (Belgian colour whist, 4 players) in the browser.
Angular 22 SPA + Firebase (Firestore, callable Cloud Functions 2nd gen, anonymous Auth).
npm workspaces monorepo: `packages/engine`, `apps/web`, `functions`.

The game rules implemented (contracts, bid ladder, scoring) are specified in `docs/RULES.md`;
deliberate engine simplifications are listed at the top of `packages/engine/src/auction.ts`.
Tech-stack rationale lives in `docs/TECH.md`.

## Commands

```bash
npm run build                      # build all workspaces (engine → tsc, functions → esbuild, web → ng)
npm run test:engine                # all engine tests (vitest)
npm run test -w @wiezen/engine -- auction        # single test file (substring match)
npm run build -w @wiezen/engine    # REQUIRED after engine changes (see below)
npm run build -w functions         # rebuild functions bundle (emulator picks it up)

node scripts/e2e.mjs               # e2e smoke test (requires running emulators): plays 3 full
                                   # hands via callables, checks security rules + illegal moves
```

## Running locally

Prerequisites: Node ≥ 20 and Java (for the Firestore emulator — see gotchas below).
First time: `npm install && npm run build` (the emulator serves functions from the built bundle).

Then two terminals:

```bash
npx firebase emulators:start --project demo-wiezen   # auth 9099, firestore 8080, functions 5001, UI 4000
npm start -w web                   # ng serve on http://localhost:4200, auto-connects to emulators in dev mode
```

To seat multiple human players, open extra browser profiles or incognito windows
(anonymous auth gives each its own uid); empty seats can be filled with bots from the lobby.

Deploy: `npm run build && npx firebase deploy` (needs a real project config pasted into
`apps/web/src/app/core/firebase.service.ts` — the checked-in config is emulator-only, project id `demo-wiezen`).

## Environment gotchas

- **Use `npx firebase`, never the global CLI.** firebase-functions v7 requires firebase-tools ≥ 15
  (pinned as a root devDependency). The global v14 kills function workers with a cryptic
  "unhandled error".
- The Firestore emulator needs Java; Homebrew's openjdk is keg-only:
  `export PATH="/opt/homebrew/opt/openjdk/bin:$PATH"`.
- `apps/web` and `functions` consume `@wiezen/engine` from its **built `dist/`**, not source.
  After editing engine code, run `npm run build -w @wiezen/engine` or the change is invisible
  to `ng serve` and the functions bundle.
- Git workflow: commit and push **directly to `main`** — no feature branches or PRs (owner's preference).

## Architecture

The core design: **one pure rules engine, executed twice**.

- `packages/engine` — zero-dependency TypeScript. All game logic is pure functions over a
  JSON-serializable `GameState`: `legalActions(state, seat)`, `applyAction(state, seat, action)`
  (returns new state, throws `GameError` on illegal input), `playerView(state, seat)` (strips
  hidden information), `chooseBotAction(view)` (bots only see what a human in that seat would).
  Phase flow: `bidding → (troelTrump | discard)? → playing → scored`, driven by
  `auction.ts` (the hairiest part: troel, vragen/meegaan, raising, passe parole, bound-solo),
  `play.ts`, `score.ts`. No `Date.now()`/`Math.random()` inside the engine — shuffles are
  seeded (`seed` string in state), which keeps tests and replays deterministic.
- `functions` — the **authoritative server**. Callables: `createTable`, `joinTable`, `addBot`,
  `startGame`, `act`, `nextHand` (all in `src/index.ts`, helpers in `src/common.ts`). Each move:
  load secret state → `applyAction` → `runBots` (bots act inline until a human must decide) →
  `commitState` writes everything in one transaction. Bundled to a single CJS file with esbuild
  (engine inlined) so the workspace dependency deploys cleanly.
- `apps/web` — Angular signals, zoneless, **plain Firebase JS SDK** (deliberately no AngularFire —
  it lags Angular by ~2 majors). `core/firebase.service.ts` connects to emulators when
  `isDevMode()`. `core/table-store.service.ts` turns two Firestore listeners into signals.
  Components compute legal moves locally with `legalActionsForView(view)` from the engine, so
  illegal cards are disabled without a server round-trip; the server re-validates everything.

### Firestore layout per table (`firestore.rules` enforces this)

| Doc | Content | Access |
|---|---|---|
| `tables/{code}` | lobby + public game summary (`TableDoc`) | read: any signed-in user; write: nobody |
| `tables/{code}/private/{uid}` | that player's `PlayerView` (their hand) | read: owner only; write: nobody |
| `tables/{code}/secret/state` | full `GameState` as a JSON **string** | Admin SDK only |

Only Cloud Functions (Admin SDK, bypasses rules) write anything. The secret state is a JSON
string because `GameState.hands` is a nested array, which Firestore can't store natively.
The admin Firestore is configured with `ignoreUndefinedProperties: true` because `PlayerView`
legitimately has `undefined` fields (e.g. `play` during bidding) — don't remove that setting.

`TableDoc` is mirrored by hand in `apps/web/src/app/core/types.ts` and `functions/src/common.ts`;
keep them in sync when changing it.

### Testing approach

Engine tests live next to the source (`*.spec.ts`); shared test helpers in `src/testing/util.ts`
(`craftHands` builds deals from partial hand specs — fills round-robin so every hand has all
suits). `simulation.spec.ts` plays 100 bot-vs-bot games and asserts invariants (zero-sum scores,
trick conservation, auction termination) — extend it when touching auction or scoring logic.
`scripts/e2e.mjs` is the integration check across functions + rules + listeners.
