# Kleurenwiezen (Colour Whist / Belgian Whist) — Rules

A reference document for implementing the Belgian/Flemish card game **kleurenwiezen** (also *wiezen*, English: *Colour Whist*, French: *whist à la couleur*) in software. English terminology is used throughout with Dutch terms in italics.

---

## 1. Players, Cards and Dealing

### 1.1 Players

- Exactly **4 players**. Each plays for themselves over the session; partnerships form **per hand** through the bidding.
- With 5 or 6 at the table, players rotate: the dealer (and with 6, also the player opposite) sits out each hand.
- Play and deal proceed **clockwise**.

### 1.2 Cards

- Standard **52-card deck**, no jokers.
- Card rank (high → low): **A, K, Q, J, 10, 9, 8, 7, 6, 5, 4, 3, 2**.
- Suit rank, used only to break ties between equal bids (high → low): **Hearts ♥ > Diamonds ♦ > Clubs ♣ > Spades ♠** (*harten > koeken/ruiten > klaveren > schoppen*).

### 1.3 Dealing (*delen*)

- First dealer is chosen randomly; the deal passes to the left each hand.
- Traditionally the pack is **not shuffled** between hands — only gathered trick by trick and cut by the player to the dealer's right. (Variant: many groups, and all software implementations, shuffle every deal.)
- Each player receives **13 cards**, dealt in packets: **4–4–5** or **4–5–4** (both conventions exist; pagat.com gives 4–5–4, Dutch sources commonly give 4–4–5).
- **No trump card is turned up.** This is the defining difference from plain *wiezen*: in kleurenwiezen the trump suit (*troef*) is named by the players during bidding — hence "colour" whist. (In plain wiezen the dealer's last card is turned face up to fix trump.)

---

## 2. The Bidding Phase (*het bieden*)

Bidding has three logical stages: (1) mandatory troel declaration, (2) forming partnerships / declaring contracts ("vragen en meegaan"), (3) raising to settle the final contract.

### 2.1 Stage 1 — Troel declaration (mandatory)

Before any other bidding, starting left of the dealer, each player declares **troel** (*troel*, *trull*) or "no troel".

- A player holding **3 or 4 aces must announce troel** (it is not optional in most rules).
- **Three aces:** the holder of the **fourth ace** says "with me" (*met mij*) and becomes the partner. The **suit of that fourth ace is trump**. The partner **leads the fourth ace to the first trick**. The pair must take **8 tricks**.
- **Four aces ("royal troel", *troela*):** the partner is the holder of the **highest heart not in the troel-caller's hand** (usually ♥K; if the caller also has ♥K, then ♥Q, and so on). **Hearts are trump**, and the partner leads that highest heart to trick 1. (Dutch Wikipedia variant: with four aces the pair needs **9** tricks; pagat/Whisthub keep 8 unless trump is changed.)
- **Trump switch option:** the designated partner may instead **choose a different trump suit**, but then the pair must take **9 tricks** instead of 8 (and the obligation to lead the called card lapses).
- Troel only becomes the contract if **nobody bids higher**; any contract ranked above troel (see §2.4) overcalls it.

### 2.2 Stage 2 — Proposals and contracts

Starting left of the dealer (or, if troel was announced, only bids that outrank troel are allowed), each player in turn may:

| Action | Dutch | Meaning |
|---|---|---|
| **Pass** | *passen* | Drop out of this auction (cannot bid again). |
| **Wait** | *wachten* | Only the player left of the dealer (first to speak). Reserves the right to later **accept** a proposal; on their next turn they must accept or pass — they may not propose their own suit. |
| **Propose** | *vragen* ("ask") | Name a suit as candidate trump, seeking a partner. Must hold ≥1 card of that suit. May not re-propose a suit already live, and may propose the same suit at most a limited number of times (commonly **twice**). |
| **Accept** | *meegaan* ("go along") | Join a live proposal in that suit. Creates a 2-vs-2 partnership obligated to **8 tricks together** (*samen acht*) with the proposed suit as trump. |
| **Bid a higher contract** | — | Declare any of the solo contracts in §2.3, subject to its conditions. |

- A proposal that nobody accepts leaves the proposer the option to **go alone** (*alleen gaan*, §2.3) in that suit, or pass.
- **If all four players pass** (*rondje pas*), see §6.1.

### 2.3 The contracts

All contracts in one table. "Pair" = 2 vs 2; "alone" = 1 vs 3. Negative contracts (miseries, piccolo) are played **without trump**.

| Contract | Dutch | English | Tricks required | Who | Trump | Notes |
|---|---|---|---|---|---|---|
| Proposal & acceptance | *vraag en meegaan* (samen 8…13) | Ask & join | **8** together (raisable to 9, 10, 11, 12, 13) | Pair | Proposed suit | The standard partnership game. |
| Going alone | *alleen (gaan)* | Solo | **5** (raisable to 6, 7, **max 8**) | Alone | Own suit | Only after one's proposal found no partner, the partnership was broken, or all others are committed. To take more than 8 tricks one must bid abondance. Some regions set the minimum at **6** instead of 5; some disallow solo-5 entirely. |
| Small misère | *kleine miserie* | Small misère | **0** of 12 tricks | Alone (multiple declarers allowed) | **No trump** | Every player first discards **one card face down**; the hand is played with 12 cards. |
| Piccolo | *piccolo* | Piccolo | **exactly 1** trick | Alone (multiple allowed) | **No trump** | Not played everywhere; optional contract. |
| Troel | *troel / trull* | Troel | **8** (9 if partner switches trump) | Pair (forced partner) | Suit of 4th ace (or hearts with 4 aces) | Mandatory announcement with 3–4 aces; see §2.1. |
| Abondance | *abondance* | Abundance | **9, 10, 11 or 12** | Alone | Own suit | Must be bid on the player's **first turn to speak** (cannot convert from an earlier proposal). Declarer **leads trick 1**. May be raised to a higher abondance but the suit may not change. |
| Grand misère | *grote miserie* | Grand misère | **0** of 13 tricks | Alone (multiple allowed) | **No trump** | Full 13-card hand. |
| Open misère | *open/blote miserie, miserie op tafel* | Open misère ("misère étalée") | **0** of 13 tricks | Alone | **No trump** | Declarer's cards are placed **face up after the first trick** (variant: after bidding ends). |
| Solo slim | *solo slim* | Slam (solo slim) | **all 13** | Alone | Own suit | Bid on first turn only, or as a raise by an abondance bidder in the same suit. Declarer leads trick 1. |

### 2.4 Ranking of bids (low → high)

Each later entry **outbids** all earlier ones. This ladder (pagat.com; matched by Whisthub) interleaves partnership levels and solo levels:

1. **Samen 8** (ask & join, 8 tricks)
2. **Alleen 5** (solo 5)
3. **Samen 9**
4. **Alleen 6**
5. **Samen 10**
6. **Alleen 7**
7. **Kleine miserie**
8. **Samen 11**
9. **Alleen 8**
10. **Piccolo**
11. **Samen 12**
12. **Samen 13**
13. **Abondance 9**
14. **Troel**
15. **Grote miserie**
16. **Abondance 10**
17. **Abondance 11**
18. **Open miserie**
19. **Abondance 12**
20. **Solo slim**

> Note: the ladder is conventional, not strictly point-ordered (e.g. *samen 13* = 30 pts ranks below *abondance 9* = 10 pts), and regional groups use slightly different orders. Fix one ladder in software and document it.

### 2.5 Stage 3 — Raising (*verhogen*)

If more than one contract is on the table, bidding continues clockwise among committed players until one highest contract remains:

- A partnership may raise its trick target (samen 8 → 9 → … → 13) to outbid an interposed contract. The **acceptor** bids on behalf of the pair; they may bid the minimum needed, or **pass** (breaking the partnership — the proposer remains bound and may go alone in the suit or pass).
- **Passe parole** (*pas parole*): when the partnership would need **11+ tricks**, the acceptor may hand the decision back to the proposer, who must take up the bid or pass. If the proposer passes, the acceptor remains bound (solo in the agreed suit, or pass). Some groups disallow passe parole.
- A solo player raises 5 → 6 → 7 → 8; beyond 8 they must switch to abondance.
- Abondance raises within the same suit only (9 → 10 → 11 → 12 → solo slim).
- **Misères and piccolo are not exclusive**: if several players bid the same misère, they all play it **simultaneously**, each scored independently. (Variant: some groups force the fourth player to join when three bid small misère.)
- Players who passed are out; a player holding the current high bid is skipped.

---

## 3. Trick Play (*het spel*)

1. **Lead to trick 1:**
   - Default (vraag/meegaan, alleen, miseries, piccolo): **player left of the dealer** leads.
   - **Abondance / solo slim:** the **declarer** leads.
   - **Troel:** the **partner** leads the called card (the fourth ace, or the highest heart in a 4-ace troel) to trick 1, which simultaneously confirms the trump suit.
2. **Following:** players **must follow suit** if able (*kleur bekennen*). If void, they may play **any card** — trumping (*kopen/troeven*) or discarding is free; there is **no obligation to trump or to overtrump/beat** the trick.
3. **Winning a trick:** highest trump in the trick wins; if no trump was played, the highest card of the **led suit** wins.
4. The trick winner **leads the next trick**.
5. In negative contracts (miseries, piccolo) there is **no trump**.
6. Only the most recently completed trick may be inspected.
7. (Optional software nicety, used by Whisthub: play may stop early once the outcome is mathematically determined, e.g. one hand holds only winning trumps.)

---

## 4. Scoring (*puntentelling*)

### 4.1 Payment flow — zero-sum

Every hand sums to **zero** across the four players:

- **Partnership contracts (2 vs 2):** each winner receives the score, each loser pays it (i.e. ±S per player).
- **Solo contracts (1 vs 3):** each of the three opponents pays (or receives) the table amount S; the lone player therefore receives (or pays) **3 × S**.
- **Multiple simultaneous misères/piccolos:** each declarer is settled **independently** against the table; results are summed per player.

### 4.2 Standard point table (pagat.com basic scoring; identical to Whisthub)

"Base" is the per-opponent amount on exact success. Cumulative totals after overtricks are shown where applicable.

| Contract | Base score | Overtricks | Undertricks (contract failed) |
|---|---|---|---|
| Samen 8 | **8** | +3 per overtrick; 13th trick +10 → totals 8, 11, 14, 17, 20, **30** | base + 3 per undertrick (fail by 1 ⇒ 11, by 2 ⇒ 14, …) — *every* undertrick counts, including the first |
| Samen 9 | **11** | → 11, 14, 17, 20, 30 | 11 + 3/undertrick |
| Samen 10 | **14** | → 14, 17, 20, 30 | 14 + 3/undertrick |
| Samen 11 | **17** | → 17, 20, 30 | 17 + 3/undertrick |
| Samen 12 | **20** | → 20, 30 | 20 + 3/undertrick |
| Samen 13 | **30** | — | 30 + 3/undertrick |
| Alleen 5 | **3** | +1 per overtrick, capped at 8 tricks → 3, 4, 5, 6 | 3 + 1/undertrick |
| Alleen 6 | **4** | → 4, 5, 6 | 4 + 1/undertrick |
| Alleen 7 | **5** | → 5, 6 | 5 + 1/undertrick |
| Alleen 8 | **7** | — | 7 + 1/undertrick |
| Kleine miserie | **6** | — | flat −6 |
| Piccolo | **8** | — | flat −8 |
| Troel | **16** | none, except **all 13 tricks = 30** | flat −16 |
| Abondance 9 | **10** | none in basic rules (Whisthub variant: overtricks score the next abondance level: 10, 15, 20, 30) | flat −10 |
| Abondance 10 | **15** | (Whisthub: 15, 20, 30) | flat −15 |
| Abondance 11 | **20** | (Whisthub: 20, 30) | flat −20 |
| Abondance 12 | **30** | — | flat −30 |
| Grote miserie | **12** | — | flat −12 |
| Open miserie | **24** | — | flat −24 |
| Solo slim | **60** | — | flat −60 |

Worked examples:

- Pair bids *samen 8*, takes 10 tricks: each member of the pair +14, each opponent −14.
- Player plays *abondance 10* and succeeds: declarer +45 (3 × 15), each opponent −15.
- Two players both play *grote miserie*; one succeeds, one fails: each is settled at ±12 against the other three independently, then summed.

### 4.3 Alternative "Flemish" scoring with doubling (briefly)

A widespread alternative scores small fixed amounts (overtricks/undertricks 1 point each, ordinary games minimum ±3) with a **cumulative doubling** system: one double ×2, two doubles ×3, three ×4, etc. Doubles arise from: a team taking all 13 tricks in an ordinary game, an opponent calling "double" before play, a passed-out deal (next deal doubled), and troel (which itself counts as a double; all 13 in troel ⇒ ×3).

---

## 5. Regional Variants Worth Noting (briefly)

- **Deal pattern** 4–5–4 vs 4–4–5; shuffle every deal vs cut-only.
- **Solo minimum**: *alleen 5* allowed vs minimum 6 (common in parts of Flanders) vs solo disallowed below abondance.
- **Piccolo**: often not played; some groups add **piccolissimo** (exactly 2 tricks).
- **Troel**: required tricks 8 vs 9; 4-ace partner = ♥K holder vs "highest heart"; some groups don't play troel at all, or only with exactly 3 aces; some let the troel partner lead any card.
- **Bid ladder**: positions of misères/piccolo/troel relative to abondance differ per region/club — make it configurable.
- **Open misère exposure**: after trick 1 vs immediately after bidding.
- **Extra top contracts**: *abondance sur table* / open abondance, *open solo slim* (hand exposed), small slam (12) and grand slam (13) as separate contracts.
- **Scoring**: 26 instead of 30 for all 13 tricks; abondance overtricks scored vs not; IWWA tournament tables.
- **Game format variants** (different games, just for awareness): *vuilbakwiezen* ("dustbin whist": 17-17-17-1 deal), *bandietenwiezen*, and Dutch *rikken* (a related but distinct game).

---

## 6. Edge Cases

### 6.1 Everyone passes (*rondje pas*)

- **Classic rule (pagat):** the cards are **thrown in and the same dealer redeals** (deck cut, not shuffled). No score.
- **Common variant (Whisthub, Flemish doubling):** the hand is redealt and the **next played hand scores double**. Doubling applies **once** — consecutive passed rounds do not stack (though in the Flemish doubling system each passed deal adds one "double" step: ×2, ×3, …).
- **"Verplicht spel" (forced game):** some house rules force a contract instead of redealing. This is a house rule, not in the main written sources — treat as an optional setting; the safe default is redeal (+ optional doubling).

### 6.2 Troel mechanics summary (for implementation)

- 3 aces ⇒ partner = holder of 4th ace; **trump = suit of the 4th ace**; partner leads the 4th ace to trick 1; pair needs **8** tricks.
- 4 aces ⇒ partner = holder of the **highest heart** outside the caller's hand (♥K, else ♥Q, …); **trump = hearts**; partner leads that heart; pair needs **8** (variant: 9).
- Partner may elect a **different trump**: requirement becomes **9 tricks** and the forced lead lapses.
- Troel is **overcallable** by any higher-ranked bid; declaration itself is mandatory.
- Scoring is fixed (±16; all 13 tricks ⇒ ±30); no overtrick/undertrick increments.

### 6.3 Other edge cases

- A proposal requires ≥1 card of the proposed suit; an acceptance requires a live proposal.
- A broken partnership (acceptor passes during raising) leaves the proposer bound: solo in that suit or pass; the same applies in reverse after a failed *passe parole*.
- A player may not bid solo in a suit already undertaken by another player, and may not open with solo while a partnership in that suit is still possible.
- Abondance and solo slim can only be opened on a player's **first turn to speak** (no converting a failed proposal into abondance), except raising one's own abondance.
- In *kleine miserie*, **all four players** discard one card face down before play (12-trick hand), regardless of how many declarers there are.

---

## Implementation defaults (summary)

4 players, 52 cards, shuffle every deal, deal 4–4–5, no turn-up; mandatory troel declaration first; bid ladder as in §2.4; follow-suit-only constraint (no forced trumping); zero-sum scoring per §4.2 with solos paying 3×; all-pass ⇒ redeal with one-time doubling. Make the regional toggles in §5 configuration options.

---

## Sources

- Pagat.com — *Colour Whist (Kleurenwiezen)*, John McLeod: https://www.pagat.com/boston/kleurenwiezen.html (primary, most detailed English source: bidding conditions, rank ladder, scoring tables, variants)
- Dutch Wikipedia — *Wiezen*: https://nl.wikipedia.org/wiki/Wiezen
- Dutch Wikipedia — *Kleurenwiezen*: https://nl.wikipedia.org/wiki/Kleurenwiezen
- Whisthub — *Spelregels kleurenwiezen*: https://www.whisthub.com/nl/rules (implementation-grade rules: full point table, passe parole, rondje pas doubling, troel lead rules)
- Rijk van Afdronk — *Wiezen spelregels*: https://www.rijkvanafdronk.be/wiezen/spelregels/
- The Game Room — *Wiezen*: https://www.thegameroom.nl/kaartspellen/wiezen/
- Wikibooks — *Kaartspel/Wiezen*: https://nl.wikibooks.org/wiki/Kaartspel/Wiezen
