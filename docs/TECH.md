# TECH.md — Technology Stack for Online Multiplayer Kleurenwiezen

*Research date: June 2026. Target: a 4-player, turn-based, trick-taking browser card game (whist/kleurenwiezen) with lobbies, live state sync, and hidden information (private hands).*

---

## TL;DR Recommendation

**Build it with Angular 22 + Firebase (Firestore + Cloud Functions 2nd gen + Auth + Hosting), with a shared TypeScript game-engine package.** The preferred stack is a genuinely good fit for this game — turn-based, low move frequency, 4 players, hobby scale. It is not the lowest-latency option, but for trick-taking (one card played every few seconds at most) Firestore listener latency (~100–500 ms) is imperceptible, and the operational cost is effectively zero at hobby scale.

The two honest caveats:

1. **AngularFire (`@angular/fire`) is lagging.** As of June 2026 the latest stable is **20.0.1** (June 2024), with only a `21.0.0-rc.0` since. Its loose peer range (`@angular/core >= 16`) usually installs fine on newer Angular, but plan to use the **plain Firebase JS SDK (`firebase@~12.x`) wrapped in your own injectable services/signals** as the safe default. This is a small amount of glue code (~100 lines) and removes the version-lag risk entirely.
2. **Hidden information makes "Firestore + security rules only" insufficient.** Security rules grant access per *document*, not per *field*, so you cannot store the whole deal in one game doc and hide other players' hands. You need the server-authoritative pattern described below — which you'd want anyway to prevent cheating.

---

## 1. Frontend: Angular 22

**Current stable: Angular v22, released June 3, 2026** (v21 is in LTS until May 2027). Angular 22 is a "signal-first consolidation" release:

- **Signal Forms, Resource APIs (`resource`, `rxResource`, `httpResource`), and Angular Aria are now stable.**
- **Zoneless change detection is the default for new projects**; `OnPush` is the default change-detection strategy.
- Standalone components have been the default since v17; modules are effectively legacy.

### Is Angular a sensible fit for a card game UI?

**Yes.** A trick-taking card game is, UI-wise, much closer to a reactive CRUD app than to an action game: a table, 4 seats, a trick area, a bidding panel, a scoreboard, a lobby list. This is exactly what Angular excels at.

- **Signals map perfectly onto game state.** The synced game document becomes a `signal<GameState>`; derived view state (whose turn, legal cards, current trick winner) becomes `computed()`. Zoneless + OnPush means a Firestore snapshot updates exactly the components that depend on it.
- **No canvas/WebGL needed.** Render cards as DOM elements (SVG card faces or a sprite sheet) and animate with CSS transitions / the Web Animations API. 4 players × 13 cards is trivial for the DOM, and DOM gives you accessibility, easy hit-testing, and responsive layout for free.
- **CDK drag-drop** works well for playing cards from your hand; a simple click-to-play fallback is more mobile-friendly anyway.

Considerations: keep all game *logic* out of components (see §5); use `@defer` for the lobby vs. game-table routes; SSR is unnecessary for a game behind a login — a plain SPA build is fine.

## 2. Firebase for turn-based multiplayer

### Firestore vs Realtime Database

| | **Cloud Firestore** | **Realtime Database** |
|---|---|---|
| Data model | Documents/collections, structured queries | One big JSON tree |
| Listener latency | ~100–500 ms typical propagation | Often <100 ms (persistent WebSocket) |
| Pricing model | Per operation (reads/writes/deletes) + storage | Bandwidth + storage |
| Free quota (Spark & within Blaze) | 50K reads / 20K writes per day, 1 GiB stored | 1 GB stored, 10 GB/month download, 100 simultaneous connections (Spark) |
| Security rules | Per-document, expressive, works with subcollections | Per-path JSON rules |
| Offline / multi-tab | Excellent, multi-tab persistence | Good |
| Presence (online/offline) | No native support | **Native (`onDisconnect`)** |
| Scaling | Automatic, regional/multi-region | Per-database instance |

**Recommendation: Firestore as the primary store**, for three reasons specific to this game:

1. The data is naturally document-shaped: `games/{gameId}`, `games/{gameId}/private/{uid}`, `lobbies/{lobbyId}` — and the per-document security-rule model is exactly what the hidden-hand pattern needs.
2. Turn-based pace means the per-operation pricing is harmless: a full 13-trick round is on the order of ~60–100 writes and a few hundred listener reads across 4 clients — thousands of full games fit inside the *daily* free quota.
3. Better querying for lobby lists, game history, and player stats.

RTDB's latency edge matters for cursor-sync or action games, not for "player B played the ♥K". The one thing RTDB does better that you may actually want is **presence**: a common hybrid is Firestore for game state + a tiny RTDB node with `onDisconnect()` for "player connected/disconnected" indicators. Add that later if needed; don't start with it.

### Hidden information — the critical design point

**Firestore security rules cannot hide fields within a document.** If a client can read `games/{id}`, it can read every byte of it. And even with split documents, *client-written* state can't be trusted: a client that deals the cards knows the whole deck. The standard, correct pattern:

1. **`games/{gameId}` — public document.** Phase, dealer, current turn, bids, cards played to the current trick, tricks won, scores. Readable by the 4 seated players (or anyone, for spectating). **Writable by no one** (rules: `allow write: if false`) — only the Admin SDK in Cloud Functions writes it, and the Admin SDK bypasses rules.
2. **`games/{gameId}/private/{uid}` — per-player private docs.** Each holds one player's current hand. Rule: `allow read: if request.auth.uid == uid; allow write: if false;`
3. **(Optional) `games/{gameId}/secret/state`** — full authoritative state readable by no one, only Functions.
4. **All moves go through Cloud Functions** (callable): `createGame`, `joinLobby`, `placeBid`, `playCard`. The function loads state with the Admin SDK, validates the move with the shared rules engine (is it your turn? do you have that card? must you follow suit?), then updates the public doc and the relevant private doc in a **transaction/batched write**. Clients never write game state directly.

Clients keep snapshot listeners on the public doc and their own private doc; the played card appears for all 4 players within a few hundred ms of the function committing. For client-side responsiveness, the *same shared engine* (see §5) computes legal moves locally so the UI can disable illegal cards instantly and optimistically animate your own play before the server confirms.

### Auth and Hosting

- **Firebase Auth**: enable **Anonymous sign-in** (friends join a lobby with zero friction via an invite link/code) plus **Google sign-in**, and use **account linking** to upgrade an anonymous account to Google without losing stats. Security rules and Functions both key off `request.auth.uid` either way.
- **Hosting**: classic **Firebase Hosting** is ideal for an SPA (global CDN, free SSL, `firebase deploy`, preview channels for PR previews). Firebase **App Hosting** exists for SSR Angular apps but is unnecessary here.

## 3. Cloud Functions (2nd gen) as the authoritative server

2nd gen functions (now branded "Cloud Run functions" — they run on Cloud Run infrastructure) are the right tool:

- **Callable functions (`onCall`)** give you auth context (`request.auth.uid`) and serialization for free — perfect for `playCard({gameId, card})`.
- **Latency:** a warm callable round-trip from Europe to `europe-west1` is typically ~100–300 ms. Deploy functions **in the same region as the Firestore database** (for Belgium: `europe-west1`) — this matters more than anything else.
- **Cold starts:** roughly 500 ms to a few seconds on Node. Mitigations: keep the functions bundle small, 2nd gen's per-instance **concurrency (default 80)** means one warm instance serves all players, and if it ever bothers you, `minInstances: 1` eliminates cold starts for roughly $8–12/month. At hobby scale, just accept the occasional cold start.
- **Cost:** requires the **Blaze** plan (pay-as-you-go), but Blaze *includes* the free quotas: **2M invocations/month free**, plus generous free GB-seconds. A move = 1 invocation; a full game ≈ 80–100 invocations. Realistic monthly bill at hobby scale: **€0**, with a budget alert set at €5 as a safety net.
- **Runtime:** use **Node.js 22** (`"engines": {"node": "22"}`) — GA for 2nd gen. Write functions with `firebase-functions` v7 (v2 API: `onCall` from `firebase-functions/v2/https`).

Also use a **scheduled function** or Firestore TTL policies to clean up abandoned lobbies/games.

## 4. Honest alternatives

| Stack | Strengths vs. Firebase | When it's the better choice |
|---|---|---|
| **Supabase** (Postgres + Realtime + RLS + Edge Functions) | Relational queries (great for stats/ELO), row-level security is a natural fit for "you can only read your own hand" *as data access* (you still need Edge Functions for move authority), open source, predictable pricing | If you want SQL for rankings/history, fear vendor lock-in, or already know Postgres. Roughly equal effort; you lose Firebase's free static hosting polish. |
| **Node server + Socket.IO** (or plain WS) on Fly.io/Railway/Hetzner | Lowest latency, full control, in-memory authoritative state, trivial hidden info (server just sends each socket its own hand), no per-operation billing | If you want real-time features later (server-side ticking timers, chat, spectator streams) or just enjoy owning a server. Costs ~€5/mo always-on and you now own persistence, reconnection, scaling, and deployment yourself — meaningfully more work than Firebase. |
| **Colyseus** (Node game-server framework) | Rooms, state-sync schema, matchmaking built in; designed exactly for authoritative multiplayer | Same as above but with batteries included. Overkill for 1 move/few seconds; shines for tick-based games. Hosting story = "run a Node server" again. |
| **boardgame.io** | Turn-order, phases, secret state (`playerView`), and move validation as a framework — conceptually a perfect match for trick-taking | **Not recommended in 2026**: last npm release (0.50.2) is ~4 years old, maintenance is minimal, and it's React-centric. Steal its *ideas* (pure `move(state, action) → state` reducers, `playerView` filtering) for your own engine instead. |

**Bottom line:** for a 4-player turn-based game built by someone productive in Angular + Firebase, Firebase wins on total effort and runs free. The alternatives win when you need sub-100 ms interactivity, server-side ticking clocks, or SQL analytics — none of which kleurenwiezen needs on day one.

## 5. Recommended project structure

A single repo with npm workspaces; the **pure-TypeScript rules engine is the heart of the design** — written once, executed twice (client for instant validation/UX, Functions for authority):

```
wiezen/
├── package.json              # npm workspaces: ["packages/*", "apps/*", "functions"]
├── firebase.json             # hosting, functions, firestore, emulators config
├── firestore.rules           # public read-own-game, read-own-hand, write nothing
├── firestore.indexes.json
├── packages/
│   └── engine/               # @wiezen/engine — ZERO dependencies, pure functions
│       ├── src/
│       │   ├── types.ts      # Card, Suit, Contract, GameState, PlayerView, Move
│       │   ├── deck.ts       # shuffle (seeded RNG injectable for tests), deal
│       │   ├── bidding.ts    # kleurenwiezen contracts: vragen/meegaan, abondance,
│       │   │                 #   misère, solo slim, troel...
│       │   ├── play.ts       # legalMoves(), applyMove(), trickWinner(), follow-suit
│       │   ├── score.ts      # contract scoring, round/match totals
│       │   └── view.ts       # playerView(state, uid) — strips hidden info
│       └── *.spec.ts         # exhaustive unit tests — cheapest tests you'll ever write
├── apps/
│   └── web/                  # Angular 22 app (zoneless, standalone, signals)
│       └── src/app/
│           ├── core/         # firebase.ts (initializeApp), auth.service.ts,
│           │                 # game.repository.ts (snapshot listeners → signals),
│           │                 # game-api.service.ts (httpsCallable wrappers)
│           ├── lobby/        # lobby list, create/join with code
│           ├── game/         # table, hand, trick, bidding-panel, scoreboard
│           └── shared/       # card component (SVG), avatars
└── functions/                # Cloud Functions 2nd gen, Node 22, TypeScript
    └── src/
        ├── index.ts
        ├── lobby.ts          # createLobby, joinLobby, leaveLobby, startGame
        └── game.ts           # placeBid, playCard — load → validate via
                              #   @wiezen/engine → transaction commit
```

**Local development:** the **Firebase Emulator Suite** (`firebase emulators:start` — Auth, Firestore, Functions, Hosting emulators + UI) gives a fully offline dev loop; point the app at emulators via `connectFirestoreEmulator`/`connectAuthEmulator` in dev mode. Open four browser profiles to play against yourself. Write integration tests against the emulators with `@firebase/rules-unit-testing` to prove a player *cannot* read another player's hand doc.

**Deployment:** `ng build` → `firebase deploy` ships hosting, functions, rules, and indexes in one command; GitHub Actions + Hosting preview channels for CI.

## 6. Version pins (verified June 2026)

| Package | Version | Notes |
|---|---|---|
| Angular | **22.0.x** (stable, released 2026-06-03) | Zoneless default, Signal Forms stable; v21 LTS until May 2027 |
| `firebase` (JS SDK) | **12.14.0** | Use directly via thin Angular services — recommended |
| `@angular/fire` | **20.0.1** (latest stable; `21.0.0-rc.0` only since) | ⚠️ Lags Angular by ~2 majors; treat as optional |
| `firebase-tools` (CLI) | **15.20.0** | Requires Node ≥ 20 |
| `firebase-functions` | **7.2.5** | v2 API (`onCall`) |
| `firebase-admin` | latest 13.x | Used only in functions |
| Functions runtime | **nodejs22** (GA, 2nd gen) | Node 22 is *not* supported on 1st gen — use 2nd gen |
| TypeScript | per Angular 22 requirements | Shared by app, engine, functions |

## Trade-offs accepted with this recommendation

- **Move latency ~200–600 ms** (callable + listener propagation) instead of <100 ms with a WebSocket server — imperceptible for trick-taking.
- **Occasional cold start** (~0.5–2 s) on the first move after idle — acceptable at hobby scale; fixable later with `minInstances: 1` (~$10/mo).
- **AngularFire risk neutralized** by depending on the plain Firebase SDK.
- **Vendor lock-in** to Firestore's data model and security rules. Mitigated by the framework-agnostic engine package: the game logic — the only hard part — ports to Supabase or a Node server unchanged if you ever migrate.
- **Blaze plan required** for Cloud Functions (credit card on file), but free quotas mean a hobby project realistically bills €0; set a budget alert.

---

## Sources

- Angular releases & versioning: https://angular.dev/reference/releases and https://angular.dev/reference/versions
- Angular 22 release coverage: https://www.angulararchitects.io/en/blog/angular-22-the-most-important-new-features-at-a-glance/ , https://angular.love/angular-22-key-features-and-changes , https://endoflife.date/angular
- AngularFire repo & releases: https://github.com/angular/angularfire/releases and https://www.npmjs.com/package/@angular/fire
- AngularFire maintenance concerns (community): https://fluin.io/blog/i-gave-up-on-angularfire
- Firestore vs Realtime Database (official comparison): https://firebase.google.com/docs/database/rtdb-vs-firestore
- Firebase pricing & free quotas: https://firebase.google.com/pricing and https://firebase.google.com/docs/projects/billing/firebase-pricing-plans
- Firestore security rules: https://firebase.google.com/docs/firestore/security/get-started
- Callable Cloud Functions: https://firebase.google.com/docs/functions/callable
- Cloud Functions 2nd gen / runtimes: https://docs.cloud.google.com/functions/docs/runtime-support and https://firebase.google.com/docs/functions/get-started
- Cold starts & min instances: https://cloud.google.com/blog/products/serverless/cloud-functions-supports-min-instances , https://firebase.blog/posts/2022/12/cloud-functions-firebase-v2/
- Firebase Local Emulator Suite: https://firebase.google.com/docs/emulator-suite
- Firebase Auth anonymous sign-in & account linking: https://firebase.google.com/docs/auth/web/anonymous-auth
- boardgame.io status: https://www.npmjs.com/package/boardgame.io and https://github.com/boardgameio/boardgame.io/issues/1150
- Supabase Realtime: https://supabase.com/docs/guides/realtime — Colyseus: https://colyseus.io/
