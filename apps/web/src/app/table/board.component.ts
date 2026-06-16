import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { Action, Card, PlayerView, Seat, Suit, TrickRecord, legalActionsForView, suitOf } from '@wiezen/engine';
import { ApiService } from '../core/api.service';
import { I18n, actionLabel, contractName } from '../core/i18n';
import { TableStore } from '../core/table-store.service';
import { TableDoc } from '../core/types';
import { CardComponent } from '../shared/card.component';
import { SUIT_SYMBOL } from '../shared/cards';
import { LastTrickComponent } from './last-trick.component';

/** A table position relative to the viewing player (self always sits at the bottom). */
type Position = 'bottom' | 'left' | 'top' | 'right';

interface SeatInfo {
  seat: number;
  name: string;
  isBot: boolean;
  isDealer: boolean;
  isTurn: boolean;
  isDeclarer: boolean;
  /** Holds (or partners) an auto-declared troel during bidding. */
  isTroel: boolean;
  tricks: number;
  position: Position;
}

/** A card currently rendered on the table, placed at its player's seat position. */
interface PlayedCard {
  seat: Seat;
  card: Card;
  position: Position;
}

/** Trick-resolution pacing: hold the completed trick, then sweep it to the winner. */
const TRICK_HOLD_MS = 750;
const TRICK_SWEEP_MS = 520;

/** How far (and which way) a won trick's cards travel toward each seat's edge. */
const SWEEP_VECTOR: Record<Position, { x: string; y: string }> = {
  bottom: { x: '0', y: '14rem' },
  top: { x: '0', y: '-14rem' },
  left: { x: '-16rem', y: '0' },
  right: { x: '16rem', y: '0' },
};

/** A single bidding choice rendered as a button in the action bar. */
interface ActionChip {
  action: Action;
  /** Short text portion ('' for pure suit chips like vraag/solo slim). */
  label: string;
  /** Suit glyph to show after the label ('' when the bid carries no suit). */
  suitSym: string;
  /** Colour the suit glyph red (harten/koeken). */
  red: boolean;
  variant: 'ghost' | 'primary' | 'default';
  /** Full human-readable label, used as the accessible name. */
  title: string;
  /** Plain-language explanation of the contract, shown as a hover tooltip (absent for self-evident bids). */
  explain?: string;
  /** True when this chip begins a new suit and should be preceded by a divider. */
  suitBreak?: boolean;
}

interface ActionGroup {
  label: string;
  chips: ActionChip[];
}

/** Contract families in bid-ladder order (stable ids; labels via i18n `group.*`).
 *  Empty groups are dropped at render time. */
const GROUP_ORDER = ['doorgeven', 'troef', 'samen', 'alleen', 'miserie', 'abondance', 'soloslim'];

/** Stable identity for a completed trick: its (unique-within-a-hand) cards plus winner.
 *  Used so the `lastTrick` signal keeps one reference until a different trick lands. */
function trickKey(t: TrickRecord | null): string {
  return t ? `${t.winner}:${t.cards.map((c) => c.card).join(',')}` : '';
}

function groupOf(action: Action): string {
  switch (action.type) {
    case 'pass':
    case 'wachten':
    case 'parole':
      return 'doorgeven';
    case 'troelKeep':
    case 'troelSwitch':
      return 'troef';
    case 'vraag':
    case 'meegaan':
    case 'raise':
      return 'samen';
    case 'alleen':
      return 'alleen';
    case 'miserie':
    case 'piccolo':
      return 'miserie';
    case 'abondance':
      return 'abondance';
    case 'soloSlim':
      return 'soloslim';
    default:
      return 'doorgeven';
  }
}

function chipFor(action: Action, i18n: I18n): ActionChip {
  const title = actionLabel(i18n, action);
  const suited = (suit: Suit, label = ''): ActionChip => ({
    action,
    label,
    suitSym: SUIT_SYMBOL[suit],
    red: suit === 'H' || suit === 'D',
    variant: 'default',
    title,
  });
  const text = (label: string, variant: ActionChip['variant'] = 'default'): ActionChip => ({
    action,
    label,
    suitSym: '',
    red: false,
    variant,
    title,
  });
  switch (action.type) {
    case 'pass':
      return text(i18n.t('bid.pass'), 'ghost');
    case 'wachten':
      return text(i18n.t('bid.wachten'), 'ghost');
    case 'parole':
      return text(i18n.t('bid.parole'), 'ghost');
    case 'troelKeep':
      return text(i18n.t('bid.troelKeep'));
    case 'meegaan': {
      // Each open proposal yields its own chip; the suit it joins becomes trump.
      const base = i18n.t('bid.meegaan');
      const suit = action.suit;
      return {
        action,
        label: base,
        suitSym: SUIT_SYMBOL[suit],
        red: suit === 'H' || suit === 'D',
        variant: 'primary',
        title: `${base} (${i18n.t('board.trumpWord')} ${SUIT_SYMBOL[suit]})`,
      };
    }
    case 'raise':
      return text(i18n.t('bid.raise'));
    case 'alleen':
      return text(`${action.tricks}`);
    case 'piccolo':
      return text(i18n.t('bid.piccolo'));
    case 'miserie':
      return text(
        action.variant === 'klein'
          ? i18n.t('bid.miserieKleinShort')
          : action.variant === 'groot'
            ? i18n.t('bid.miserieGrootShort')
            : i18n.t('bid.miserieOpenShort'),
      );
    case 'vraag':
    case 'troelSwitch':
    case 'soloSlim':
      return suited(action.suit);
    case 'abondance':
      return suited(action.suit, `${action.tricks}`);
    default:
      return text(title);
  }
}

/** Split a bid label for the auction log so its suit can render as a mini card. */
function bidParts(action: Action, i18n: I18n): { pre: string; suit: Suit | null; post: string } {
  switch (action.type) {
    case 'vraag':
      return { pre: i18n.t('bid.vraag'), suit: action.suit, post: '' };
    case 'meegaan':
      return { pre: i18n.t('bid.meegaan'), suit: action.suit, post: '' };
    case 'abondance':
      return { pre: `${i18n.t('bid.abondance')} ${action.tricks}`, suit: action.suit, post: '' };
    case 'soloSlim':
      return { pre: i18n.t('bid.soloSlim'), suit: action.suit, post: '' };
    case 'troelSwitch':
      return { pre: i18n.t('bid.troefShort'), suit: action.suit, post: i18n.t('bid.troefSwitchSuffix') };
    default:
      return { pre: actionLabel(i18n, action), suit: null, post: '' };
  }
}

/** One-line plain-language explanation of a contract for hover tooltips.
 *  Returns undefined for self-evident bids (pas/vraag/meegaan), which need none. */
function contractExplain(action: Action, i18n: I18n): string | undefined {
  switch (action.type) {
    case 'pass':
    case 'vraag':
    case 'meegaan':
      return undefined;
    case 'wachten':
      return i18n.t('explain.wachten');
    case 'parole':
      return i18n.t('explain.parole');
    case 'raise':
      return i18n.t('explain.raise');
    case 'troelKeep':
      return i18n.t('explain.troelKeep');
    case 'troelSwitch':
      return i18n.t('explain.troelSwitch');
    case 'alleen':
      return i18n.t('explain.alleen', { n: action.tricks });
    case 'abondance':
      return i18n.t('explain.abondance', { n: action.tricks });
    case 'soloSlim':
      return i18n.t('explain.soloSlim');
    case 'piccolo':
      return i18n.t('explain.piccolo');
    case 'miserie':
      switch (action.variant) {
        case 'klein':
          return i18n.t('explain.miserieKlein');
        case 'groot':
          return i18n.t('explain.miserieGroot');
        default:
          return i18n.t('explain.miserieOpen');
      }
    default:
      return undefined;
  }
}

@Component({
  selector: 'app-board',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CardComponent, LastTrickComponent],
  template: `
    @if (view(); as v) {
      <div class="board">
        <header class="topbar">
          <span class="scores">
            @for (s of scoreboard(); track s.seat) {
              <span class="score" [class.leader]="s.isLeader">
                @if (s.isLeader) { <span class="crown" aria-hidden="true">👑</span> }
                {{ s.name }}: {{ s.score }}
              </span>
            }
          </span>
          @if (contractInfo(); as ci) {
            <span class="contract">
              <span class="gold">{{ ci.names }}</span>
              <span class="sep">·</span>
              <span class="gold">{{ ci.contract }}</span>
              <span class="sep">·</span>
              @if (ci.trumpSym) {
                <span class="mini-card" [class.red]="ci.trumpRed">{{ ci.trumpSym }}</span>
              } @else {
                <span class="gold">{{ i18n.t('board.noTrump') }}</span>
              }
            </span>
          } @else {
            <span class="contract">{{ statusLine() }}</span>
          }
        </header>

        <div class="felt">
          @for (s of seats(); track s.seat) {
            @if (s.position !== 'bottom') {
              <div class="player {{ s.position }}" [class.turn]="s.isTurn" [class.declarer]="s.isDeclarer">
                <div class="name">
                  {{ s.name }}
                  @if (s.isDealer) { <span class="badge">{{ i18n.t('board.dealer') }}</span> }
                  @if (s.isTroel) { <span class="badge troel">{{ i18n.t('board.troelTag') }}</span> }
                </div>
                <div class="meta">{{ i18n.t('board.tricks', { n: s.tricks }) }}</div>
                @if (lastTrick(); as lt) {
                  @if (lt.winner === s.seat) {
                    <app-last-trick [trick]="lt" [names]="seatNames()" [trump]="trumpSuit()" [viewerSeat]="v.seat" />
                  }
                }
              </div>
            }
          }

          <div class="trick" [style.--sweep-x]="sweep().x" [style.--sweep-y]="sweep().y">
            @for (t of displayedTrick(); track t.card) {
              <div class="trick-card {{ t.position }}" animate.enter="deal" animate.leave="sweep">
                <app-card [card]="t.card" [trump]="isTrump(t.card)" />
              </div>
            }
            @if (v.phase === 'bidding' || v.phase === 'troelTrump') {
              <div class="auction-log">
                @for (b of recentBids(); track $index) {
                  <div class="bid-line" [class.has-explain]="!!b.explain" [attr.data-tip]="b.explain">
                    <span>{{ b.name }}: {{ b.pre }}</span>
                    @if (b.suitSym) { <span class="mini-card" [class.red]="b.red">{{ b.suitSym }}</span> }
                    @if (b.post) { <span>{{ b.post }}</span> }
                  </div>
                }
              </div>
            }
          </div>

          @for (s of seats(); track s.seat) {
            @if (s.position === 'bottom') {
              <div class="player bottom" [class.turn]="s.isTurn" [class.declarer]="s.isDeclarer">
                <div class="name">
                  {{ s.name }}
                  @if (s.isDealer) { <span class="badge">{{ i18n.t('board.dealer') }}</span> }
                  @if (s.isTroel) { <span class="badge troel">{{ i18n.t('board.troelTag') }}</span> }
                </div>
                <div class="meta">{{ i18n.t('board.tricks', { n: s.tricks }) }}</div>
                @if (lastTrick(); as lt) {
                  @if (lt.winner === s.seat) {
                    <app-last-trick [trick]="lt" [names]="seatNames()" [trump]="trumpSuit()" [viewerSeat]="v.seat" />
                  }
                }
              </div>
            }
          }
        </div>

        @if (troelInfo(); as tr) {
          <div class="troel-banner">
            <span class="troel-tag">{{ i18n.t('board.troelTag') }}</span>
            <span class="players">{{ tr.players }}</span>
            <span class="sep">·</span>
            <span>{{ i18n.t('board.trumpWord') }}</span>
            <span class="mini-card" [class.red]="tr.trumpRed">{{ tr.trumpSym }}</span>
            <span class="hint">{{ i18n.t('board.troelHint') }}</span>
          </div>
        }
        @if (v.phase === 'bidding' || v.phase === 'troelTrump') {
          <div class="action-bar">
            @if (actionGroups().length > 0) {
              @for (g of actionGroups(); track g.label) {
                <div class="action-group">
                  <span class="group-label">{{ i18n.t('group.' + g.label) }}</span>
                  <div class="chips">
                    @for (c of g.chips; track $index) {
                      @if (c.suitBreak) { <span class="chip-divider" aria-hidden="true"></span> }
                      <button
                        class="chip {{ c.variant }}"
                        [class.suit-only]="!!c.suitSym && !c.label"
                        [class.red]="c.red"
                        [attr.aria-label]="c.title"
                        [attr.data-tip]="c.explain"
                        (click)="doAction(c.action)"
                        [disabled]="busy()"
                      >
                        @if (c.label) { <span class="chip-text">{{ c.label }}</span> }
                        @if (c.suitSym) { <span class="chip-suit">{{ c.suitSym }}</span> }
                      </button>
                    }
                  </div>
                </div>
              }
            } @else {
              <span class="waiting">{{ waitingText() }}</span>
            }
          </div>
        }
        @if (v.phase === 'discard' && playableCards().size > 0) {
          <div class="action-bar"><span class="waiting">{{ i18n.t('board.discardPrompt') }}</span></div>
        }

        <div class="hand">
          @for (c of v.hand; track c) {
            <app-card [card]="c" [enabled]="playableCards().has(c) && !busy() && !animating()" [trump]="isTrump(c)" (picked)="pickCard($event)" />
          }
        </div>

        @if (v.phase === 'scored' && !animating()) {
          <div class="overlay">
            <div class="panel">
              <h3>{{ i18n.t('board.handPlayed', { n: v.handNumber }) }}</h3>
              <p>{{ summaryText() }}</p>
              <table>
                @for (s of seats(); track s.seat) {
                  <tr>
                    <td>{{ s.name }}</td>
                    <td [class.pos]="(v.lastHandDeltas?.[s.seat] ?? 0) > 0" [class.neg]="(v.lastHandDeltas?.[s.seat] ?? 0) < 0">
                      {{ (v.lastHandDeltas?.[s.seat] ?? 0) > 0 ? '+' : '' }}{{ v.lastHandDeltas?.[s.seat] ?? 0 }}
                    </td>
                    <td class="total">{{ v.scores[s.seat] }}</td>
                  </tr>
                }
              </table>
              <button class="primary" (click)="nextHand()" [disabled]="busy()">{{ i18n.t('board.nextHand') }}</button>
            </div>
          </div>
        }

        @if (error()) {
          <p class="error">{{ error() }}</p>
        }
      </div>
    } @else {
      <p class="center-msg">{{ i18n.t('board.loadingCards') }}</p>
    }
  `,
  styles: `
    .board { display: flex; flex-direction: column; height: 100dvh; }
    .topbar {
      display: grid; grid-template-columns: 1fr auto 1fr; align-items: center;
      gap: 1rem; padding: 0.5rem 1rem;
      /* Scores fill the left column, the contract sits centred; the right column is
         left empty for the global language selector (fixed, top-right). */
      background: rgba(0, 0, 0, 0.35); font-size: 0.9rem;
    }
    .contract { justify-self: center; display: flex; align-items: center; gap: 0.4rem; }
    .contract .gold { color: #d4a017; font-weight: 600; }
    .contract .sep { opacity: 0.45; }
    .mini-card {
      display: inline-flex; align-items: center; justify-content: center;
      width: 1.25rem; height: 1.7rem; border-radius: 0.22rem;
      background: #fdfdf8; border: 1px solid #b9b4a4;
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.35);
      color: #1c1c20; font-size: 0.95rem; line-height: 1;
    }
    .mini-card.red { color: #b3262e; }
    .scores { display: flex; flex-wrap: wrap; gap: 0.4rem 0.8rem; opacity: 0.9; min-width: 0; }
    .score { white-space: nowrap; }
    .score.leader { font-weight: 600; }
    .crown { margin-right: 0.1rem; }
    .felt { position: relative; flex: 1; min-height: 18rem; }
    .player {
      position: absolute; text-align: center; padding: 0.4rem 0.8rem; border-radius: 0.5rem;
      background: rgba(0, 0, 0, 0.25); min-width: 8rem; border: 2px solid transparent;
      /* Above the centred trick cards so an expanded last-trick panel isn't covered. */
      z-index: 1;
    }
    /* Players declaring the contract get a gold border. */
    .player.declarer { border-color: #d4a017; }
    /* The player to move gets an arrow pointing at them (from the table's centre). */
    .player.turn::after {
      content: ''; position: absolute; width: 0; height: 0; border: 0.5rem solid transparent;
    }
    .player.top.turn::after { top: 100%; left: 50%; margin-top: 0.35rem; transform: translateX(-50%); border-bottom-color: #d4a017; }
    .player.bottom.turn::after { bottom: 100%; left: 50%; margin-bottom: 0.35rem; transform: translateX(-50%); border-top-color: #d4a017; }
    .player.left.turn::after { left: 100%; top: 50%; margin-left: 0.35rem; transform: translateY(-50%); border-right-color: #d4a017; }
    .player.right.turn::after { right: 100%; top: 50%; margin-right: 0.35rem; transform: translateY(-50%); border-left-color: #d4a017; }
    .player.top { top: 0.8rem; left: 50%; transform: translateX(-50%); }
    .player.left { left: 0.8rem; top: 50%; transform: translateY(-50%); }
    .player.right { right: 0.8rem; top: 50%; transform: translateY(-50%); }
    .player.bottom { bottom: 0.6rem; left: 50%; transform: translateX(-50%); }
    .name { font-weight: 600; }
    .meta { font-size: 0.8rem; opacity: 0.8; }
    .badge {
      font-size: 0.65rem; background: rgba(255, 255, 255, 0.2); padding: 0.05rem 0.35rem;
      border-radius: 0.3rem; margin-left: 0.3rem; vertical-align: middle;
    }
    .badge.troel { background: #d4a017; color: #1c1c20; font-weight: 700; }
    .troel-banner {
      display: flex; align-items: center; justify-content: center; flex-wrap: wrap; gap: 0.4rem;
      margin: 0.3rem auto 0; padding: 0.35rem 0.75rem; border-radius: 0.5rem;
      background: rgba(212, 160, 23, 0.14); border: 1px solid rgba(212, 160, 23, 0.5);
    }
    .troel-banner .troel-tag {
      font-weight: 700; color: #d4a017; text-transform: uppercase;
      font-size: 0.72rem; letter-spacing: 0.04em;
    }
    .troel-banner .players { font-weight: 600; }
    .troel-banner .sep { opacity: 0.45; }
    .troel-banner .hint { opacity: 0.7; font-style: italic; font-size: 0.85rem; }
    .trick {
      position: absolute; inset: 0; display: grid; place-items: center;
    }
    /* Cards are centred on the felt with margins (half the 3.4rem×4.8rem card) plus a
       directional offset, leaving \`transform\` free for the deal-in / sweep animations. */
    .trick-card { position: absolute; top: 50%; left: 50%; margin: -2.4rem 0 0 -1.7rem; }
    .trick-card.bottom { margin-top: calc(-2.4rem + 3.2rem); --deal-x: 0; --deal-y: 9rem; }
    .trick-card.top { margin-top: calc(-2.4rem - 3.2rem); --deal-x: 0; --deal-y: -9rem; }
    .trick-card.left { margin-left: calc(-1.7rem - 3rem); --deal-x: -11rem; --deal-y: 0; }
    .trick-card.right { margin-left: calc(-1.7rem + 3rem); --deal-x: 11rem; --deal-y: 0; }
    /* Deal-in: a played card flies onto the table from its own seat (--deal-* per position).
       Sweep: a won trick slides off toward the winner (--sweep-* set on .trick). */
    .deal { animation: deal 360ms cubic-bezier(0.2, 0.7, 0.3, 1) both; }
    .sweep { animation: sweep ${TRICK_SWEEP_MS}ms ease-in both; }
    @keyframes deal {
      from { opacity: 0; transform: translate(var(--deal-x, 0), var(--deal-y, 0)) scale(0.85); }
      to { opacity: 1; transform: none; }
    }
    @keyframes sweep {
      from { opacity: 1; transform: none; }
      to { opacity: 0; transform: translate(var(--sweep-x, 0), var(--sweep-y, 0)) scale(0.6); }
    }
    @media (prefers-reduced-motion: reduce) {
      .deal, .sweep { animation-duration: 1ms; }
    }
    .auction-log {
      font-size: 0.85rem; background: rgba(0, 0, 0, 0.3); padding: 0.6rem 1rem;
      border-radius: 0.5rem; max-width: 18rem; text-align: center;
    }
    .bid-line { display: flex; align-items: center; justify-content: center; gap: 0.3rem; padding: 0.05rem 0; }
    .bid-line.has-explain { cursor: help; }
    .auction-log .mini-card { width: 0.95rem; height: 1.3rem; font-size: 0.8rem; border-radius: 0.18rem; }
    .action-bar {
      display: flex; flex-wrap: wrap; gap: 0.5rem 0.75rem; justify-content: center;
      align-items: flex-start; padding: 0.6rem 0.5rem; background: rgba(0, 0, 0, 0.28);
    }
    .action-group {
      display: flex; flex-direction: column; gap: 0.4rem;
      background: rgba(0, 0, 0, 0.18); border-radius: 0.6rem; padding: 0.5rem 0.6rem;
    }
    .group-label {
      font-size: 0.7rem; letter-spacing: 0.04em; color: #8aa08c; padding-left: 0.1rem;
    }
    .chips { display: flex; flex-wrap: wrap; gap: 0.35rem; align-items: center; }
    .chip-divider { align-self: stretch; width: 1px; margin: 0.1rem 0.15rem; background: rgba(236, 231, 214, 0.25); }
    .chip {
      display: inline-flex; align-items: center; gap: 0.3rem; line-height: 1;
      padding: 0.45rem 0.75rem; border-radius: 0.45rem; border: 1px solid transparent;
      cursor: pointer; background: #e9e4d2; color: #26332a; font-size: 0.9rem; font-family: inherit;
    }
    .chip:hover:not(:disabled) { background: #fff; }
    .chip:disabled { opacity: 0.5; cursor: default; }
    .chip.primary { background: #d4a017; color: #1d2b1f; font-weight: 600; }
    .chip.ghost { background: transparent; border-color: rgba(236, 231, 214, 0.35); color: #ece7d6; }
    .chip.ghost:hover:not(:disabled) { background: rgba(236, 231, 214, 0.12); }
    .chip.suit-only { min-width: 2.1rem; justify-content: center; padding: 0.4rem 0.6rem; }
    .chip-suit { font-size: 1.05rem; }
    .chip.red:not(.primary) .chip-suit { color: #c0392b; }
    /* Hover tooltip explaining a contract — shown above chips and auction-log bids. */
    .chip[data-tip], .bid-line[data-tip] { position: relative; }
    .chip[data-tip]:hover::after, .bid-line[data-tip]:hover::after {
      content: attr(data-tip);
      position: absolute; left: 50%; bottom: calc(100% + 0.5rem); transform: translateX(-50%);
      width: max-content; max-width: 15rem; white-space: normal; text-align: left;
      background: #16211a; color: #ece7d6; border: 1px solid rgba(236, 231, 214, 0.22);
      padding: 0.5rem 0.65rem; border-radius: 0.45rem;
      font-size: 0.78rem; font-weight: 400; line-height: 1.3;
      box-shadow: 0 8px 22px rgba(0, 0, 0, 0.55); z-index: 50; pointer-events: none;
    }
    .chip[data-tip]:hover::before, .bid-line[data-tip]:hover::before {
      content: ''; position: absolute; left: 50%; bottom: calc(100% + 0.18rem); transform: translateX(-50%);
      border: 0.32rem solid transparent; border-top-color: #16211a; z-index: 51; pointer-events: none;
    }
    .waiting { opacity: 0.8; font-style: italic; padding: 0.4rem; }
    .hand {
      display: flex; justify-content: center; padding: 0.6rem 0.5rem 1rem; gap: 0.15rem;
      flex-wrap: wrap; background: rgba(0, 0, 0, 0.15);
    }
    .overlay {
      position: fixed; inset: 0; background: rgba(0, 0, 0, 0.55);
      display: grid; place-items: center; z-index: 10;
    }
    .panel {
      background: #233529; border-radius: 0.8rem; padding: 1.5rem 2rem; text-align: center;
      display: flex; flex-direction: column; gap: 0.8rem; min-width: 18rem;
      box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
    }
    .panel table { margin: 0 auto; border-collapse: collapse; }
    .panel td { padding: 0.25rem 0.8rem; text-align: right; }
    .panel td:first-child { text-align: left; }
    .panel .pos { color: #9fe29f; }
    .panel .neg { color: #ff9d9d; }
    .panel .total { font-weight: 700; }
    .panel button.primary {
      background: #d4a017; color: #1d2b1f; font-weight: 700; border: none;
      padding: 0.6rem 1rem; border-radius: 0.4rem; cursor: pointer; font-size: 1rem;
    }
    .error {
      position: fixed; bottom: 0.5rem; left: 50%; transform: translateX(-50%);
      background: #7c2a2a; padding: 0.5rem 1rem; border-radius: 0.4rem;
    }
    .center-msg { text-align: center; margin-top: 20vh; opacity: 0.85; }
  `,
})
export class BoardComponent {
  private api = inject(ApiService);
  private store = inject(TableStore);
  protected readonly i18n = inject(I18n);

  readonly table = input.required<TableDoc>();

  protected readonly view = this.store.view;
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly legal = computed<Action[]>(() => {
    const v = this.view();
    return v ? legalActionsForView(v) : [];
  });

  /** Bidding actions bucketed into contract families, ordered up the bid ladder. */
  protected readonly actionGroups = computed<ActionGroup[]>(() => {
    const buckets = new Map<string, ActionChip[]>();
    for (const action of this.legal()) {
      if (action.type === 'play' || action.type === 'discard') continue;
      const group = groupOf(action);
      const chip = chipFor(action, this.i18n);
      chip.explain = contractExplain(action, this.i18n);
      (buckets.get(group) ?? buckets.set(group, []).get(group)!).push(chip);
    }
    return GROUP_ORDER.filter((label) => buckets.has(label)).map((label) => {
      const chips = buckets.get(label)!;
      if (label === 'abondance') {
        let prevSuit: Suit | null = null;
        for (const c of chips) {
          const suit = c.action.type === 'abondance' ? c.action.suit : null;
          c.suitBreak = prevSuit !== null && suit !== prevSuit;
          prevSuit = suit;
        }
      }
      return { label, chips };
    });
  });

  protected readonly trumpSuit = computed(() => this.view()?.contract?.trump ?? null);

  /** The most recently completed trick (cards + winner), shown beside the winner's
   *  nameplate. Null until the first trick of the hand resolves. The custom equality
   *  keeps the same object identity while the trick is unchanged, so unrelated view
   *  updates (e.g. the next trick in progress) don't churn the input or snap an open
   *  last-trick panel shut — only a genuinely new trick produces a fresh value. */
  protected readonly lastTrick = computed<TrickRecord | null>(
    () => this.view()?.play?.completedTricks.at(-1) ?? null,
    { equal: (a, b) => trickKey(a) === trickKey(b) },
  );

  /** Player display names indexed by seat, for the last-trick card labels. */
  protected readonly seatNames = computed<string[]>(() => {
    const names: string[] = [];
    for (const p of this.table().players) {
      names[p.seat] = p.name ?? this.i18n.t('board.playerFallback', { n: p.seat + 1 });
    }
    return names;
  });

  protected isTrump(card: Card): boolean {
    const trump = this.trumpSuit();
    return trump !== null && suitOf(card) === trump;
  }

  protected readonly playableCards = computed<Set<Card>>(() => {
    const cards = this.legal().flatMap((a) =>
      a.type === 'play' || a.type === 'discard' ? [a.card] : [],
    );
    return new Set(cards);
  });

  protected readonly seats = computed<SeatInfo[]>(() => {
    const v = this.view();
    const t = this.table();
    if (!v) return [];
    const positions = ['bottom', 'left', 'top', 'right'] as const;
    const troel = v.auction.troel;
    return t.players
      .map((p) => {
        const rel = (p.seat - v.seat + 4) % 4;
        const isTurn =
          v.phase === 'playing'
            ? v.play?.turn === p.seat
            : v.phase === 'bidding'
              ? v.auction.turn === p.seat
              : v.phase === 'troelTrump'
                ? v.auction.troel?.partner === p.seat
                : false;
        return {
          seat: p.seat,
          name: p.name,
          isBot: p.isBot,
          isDealer: v.dealer === p.seat,
          isTurn,
          isDeclarer: v.contract?.declarers.includes(p.seat as 0 | 1 | 2 | 3) ?? false,
          isTroel: v.phase === 'bidding' && !!troel && (troel.caller === p.seat || troel.partner === p.seat),
          tricks: v.play?.tricksWon[p.seat] ?? 0,
          position: positions[rel]!,
        };
      })
      .sort((a, b) => a.seat - b.seat);
  });

  /** Header scoreboard ranked from most to least points, flagging the current
   *  leader(s). No one leads while every score is still tied (e.g. all 0 before
   *  the first hand). Ties break on seat order for a stable display. */
  protected readonly scoreboard = computed(() => {
    const v = this.view();
    const t = this.table();
    if (!v) return [];
    const entries = t.players
      .map((p) => ({ seat: p.seat, name: p.name, score: v.scores[p.seat] ?? 0 }))
      .sort((a, b) => b.score - a.score || a.seat - b.seat);
    const scores = entries.map((e) => e.score);
    const max = Math.max(...scores);
    const hasLead = max > Math.min(...scores);
    return entries.map((e) => ({ ...e, isLeader: hasLead && e.score === max }));
  });

  /** The cards rendered on the felt right now. Driven by {@link reconcileTrick},
   *  which paces trick resolution rather than mirroring the server state directly. */
  protected readonly displayedTrick = signal<PlayedCard[]>([]);
  /** True while a finished trick is being held + swept to its winner; the hand is
   *  locked during this beat so a play can't interrupt the animation. */
  protected readonly animating = signal(false);
  /** Where the won trick sweeps to: the offset of the winner's seat from the centre.
   *  Fed to the trick's --sweep-x/--sweep-y so every leaving card heads that way. */
  protected readonly sweep = signal<{ x: string; y: string }>({ x: '0', y: '0' });

  /** Completed tricks already shown/animated; lets us detect a fresh trick win. */
  private shownCompleted = 0;
  /** Bumped on every reconcile so stale setTimeout callbacks bail out. */
  private trickSeq = 0;

  constructor() {
    // Translate the (instantly-updated) server view into a paced on-table display:
    // a played card deals in, and a finished trick is held briefly then swept to
    // the winner before the next trick appears.
    effect(() => this.reconcileTrick(this.view()));
  }

  private positionOf(seat: Seat, viewer: Seat): Position {
    const positions: readonly Position[] = ['bottom', 'left', 'top', 'right'];
    return positions[(seat - viewer + 4) % 4]!;
  }

  private placeCards(cards: { seat: Seat; card: Card }[], viewer: Seat): PlayedCard[] {
    return cards.map((t) => ({ seat: t.seat, card: t.card, position: this.positionOf(t.seat, viewer) }));
  }

  private reconcileTrick(v: PlayerView | null): void {
    const seq = ++this.trickSeq; // any pending animation from a prior state is now stale

    // Keep reconciling through 'scored' so the final trick still sweeps to its winner
    // (the score overlay is held back until then, gated on animating()).
    if (!v?.play || (v.phase !== 'playing' && v.phase !== 'scored')) {
      this.displayedTrick.set([]);
      this.animating.set(false);
      this.shownCompleted = v?.play?.completedTricks.length ?? 0;
      return;
    }

    const play = v.play;
    const completed = play.completedTricks.length;

    // Exactly one trick finished since we last looked: hold it, sweep it, then reveal
    // whatever the next trick already holds (bots may have led in the same update; the
    // final trick reveals nothing and uncovers the score overlay).
    if (completed === this.shownCompleted + 1) {
      const rec = play.completedTricks[this.shownCompleted]!;
      this.shownCompleted = completed;
      this.animating.set(true);
      this.sweep.set(SWEEP_VECTOR[this.positionOf(rec.winner, v.seat)]);
      this.displayedTrick.set(this.placeCards(rec.cards, v.seat));
      setTimeout(() => {
        if (seq !== this.trickSeq) return;
        this.displayedTrick.set([]); // triggers animate.leave → cards sweep to the winner
      }, TRICK_HOLD_MS);
      setTimeout(() => {
        if (seq !== this.trickSeq) return;
        this.displayedTrick.set(this.placeCards(play.trick, v.seat));
        this.animating.set(false);
      }, TRICK_HOLD_MS + TRICK_SWEEP_MS);
      return;
    }

    // New hand or a reconnect that skipped tricks: snap to the current trick, no animation.
    this.shownCompleted = completed;
    this.displayedTrick.set(this.placeCards(play.trick, v.seat));
    this.animating.set(false);
  }

  /** Structured contract banner (names · bid · troef) for the top-left header. */
  protected readonly contractInfo = computed(() => {
    const v = this.view();
    if (!v?.contract) return null;
    const names = v.contract.declarers
      .map(
        (d) =>
          this.table().players.find((p) => p.seat === d)?.name ??
          this.i18n.t('board.playerFallback', { n: d + 1 }),
      )
      .join(' & ');
    return {
      names,
      // The contract label carries no suit — the troef card next to it already shows the suit.
      contract: contractName(this.i18n, v.contract.bid),
      trumpSym: v.contract.trump ? SUIT_SYMBOL[v.contract.trump] : null,
      trumpRed: v.contract.trump === 'H' || v.contract.trump === 'D',
    };
  });

  protected readonly statusLine = computed(() => {
    const v = this.view();
    if (!v) return '';
    if (v.phase === 'bidding')
      return this.i18n.t(v.doubleNext ? 'board.status.biddingDouble' : 'board.status.bidding');
    if (v.phase === 'troelTrump') return this.i18n.t('board.status.troelTrump');
    if (v.phase === 'discard') return this.i18n.t('board.status.discard');
    return '';
  });

  /** Announcement for an auto-declared troel during bidding (the app declares it
   *  silently, so the human needs to be told who holds it and why bids are limited). */
  protected readonly troelInfo = computed(() => {
    const v = this.view();
    const t = this.table();
    if (!v || v.phase !== 'bidding' || !v.auction.troel) return null;
    const tr = v.auction.troel;
    const name = (seat: Seat) => t.players.find((p) => p.seat === seat)?.name ?? '…';
    return {
      players: `${name(tr.caller)} & ${name(tr.partner)}`,
      trumpSym: SUIT_SYMBOL[tr.trump],
      trumpRed: tr.trump === 'H' || tr.trump === 'D',
    };
  });

  protected readonly waitingText = computed(() => {
    const v = this.view();
    const t = this.table();
    if (!v) return '';
    const turn = v.phase === 'troelTrump' ? v.auction.troel?.partner : v.auction.turn;
    const name = t.players.find((p) => p.seat === turn)?.name ?? '…';
    return this.i18n.t('board.waiting', { name });
  });

  protected readonly recentBids = computed(() => {
    const v = this.view();
    const t = this.table();
    if (!v) return [];
    return v.auction.bids.slice(-6).map((b) => {
      const name =
        t.players.find((p) => p.seat === b.seat)?.name ??
        this.i18n.t('board.playerFallback', { n: b.seat + 1 });
      const parts = bidParts(b.action, this.i18n);
      return {
        name,
        pre: parts.pre,
        suitSym: parts.suit ? SUIT_SYMBOL[parts.suit] : '',
        red: parts.suit === 'H' || parts.suit === 'D',
        post: parts.post,
        explain: contractExplain(b.action, this.i18n),
      };
    });
  });

  /** Localized one-line result of the last hand, rebuilt from structured view
   *  data so it follows the selected language (the server-built `lastHandSummary`
   *  is English-only and used only as a fallback). */
  protected readonly summaryText = computed(() => {
    const v = this.view();
    const t = this.table();
    if (!v?.contract || !v.play) return v?.lastHandSummary ?? '';
    const contract = v.contract;
    const bid = contract.bid;
    const play = v.play;
    const word = this.i18n.t('board.trickWord');
    const label = contractName(this.i18n, bid);
    const resultWord = (ok: boolean) =>
      this.i18n.t(ok ? 'board.result.made' : 'board.result.down');

    const made = (tricks: number): boolean => {
      switch (bid.kind) {
        case 'kleineMiserie':
        case 'groteMiserie':
        case 'openMiserie':
          return tricks === 0;
        case 'piccolo':
          return tricks === 1;
        case 'soloSlim':
          return tricks === 13;
        case 'alleen':
        case 'abondance':
          return tricks >= (bid.tricks ?? 0);
        default: // samen / troel: total against the contract's required tricks
          return tricks >= contract.tricksNeeded;
      }
    };

    if (bid.kind === 'samen' || bid.kind === 'troel') {
      const tricks = contract.declarers.reduce((sum: number, s) => sum + (play.tricksWon[s] ?? 0), 0);
      return `${label}: ${tricks} ${word}, ${resultWord(made(tricks))}`;
    }
    // One or more lone declarers, each summarized independently.
    const nameOf = (seat: number) =>
      t.players.find((p) => p.seat === seat)?.name ??
      this.i18n.t('board.playerFallback', { n: seat + 1 });
    return contract.declarers
      .map((d) => {
        const tricks = play.tricksWon[d] ?? 0;
        const who = contract.declarers.length > 1 ? `${nameOf(d)} — ` : '';
        return `${who}${label}: ${tricks} ${word}, ${resultWord(made(tricks))}`;
      })
      .join('; ');
  });

  protected pickCard(card: Card): void {
    const v = this.view();
    if (!v || this.animating()) return;
    const type = v.phase === 'discard' ? 'discard' : 'play';
    void this.doAction({ type, card } as Action);
  }

  protected async doAction(action: Action): Promise<void> {
    await this.run(() => this.api.act(this.table().code, action));
  }

  protected async nextHand(): Promise<void> {
    await this.run(() => this.api.nextHand(this.table().code));
  }

  private async run(fn: () => Promise<void>): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      await fn();
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : this.i18n.t('common.error'));
      setTimeout(() => this.error.set(null), 4000);
    } finally {
      this.busy.set(false);
    }
  }
}
