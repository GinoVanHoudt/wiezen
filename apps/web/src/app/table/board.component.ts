import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { Action, Card, Suit, bidLabel, legalActionsForView, suitOf } from '@wiezen/engine';
import { ApiService } from '../core/api.service';
import { TableStore } from '../core/table-store.service';
import { TableDoc } from '../core/types';
import { CardComponent } from '../shared/card.component';
import { SUIT_SYMBOL, actionLabel } from '../shared/cards';

interface SeatInfo {
  seat: number;
  name: string;
  isBot: boolean;
  isDealer: boolean;
  isTurn: boolean;
  isDeclarer: boolean;
  tricks: number;
  position: 'bottom' | 'left' | 'top' | 'right';
}

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

/** Contract families in bid-ladder order; empty groups are dropped at render time. */
const GROUP_ORDER = ['Doorgeven', 'Troef kiezen', 'Samen', 'Alleen', 'Miserie', 'Abondance', 'Solo slim'];

function groupOf(action: Action): string {
  switch (action.type) {
    case 'pass':
    case 'wachten':
    case 'parole':
      return 'Doorgeven';
    case 'troelKeep':
    case 'troelSwitch':
      return 'Troef kiezen';
    case 'vraag':
    case 'meegaan':
    case 'raise':
      return 'Samen';
    case 'alleen':
      return 'Alleen';
    case 'miserie':
    case 'piccolo':
      return 'Miserie';
    case 'abondance':
      return 'Abondance';
    case 'soloSlim':
      return 'Solo slim';
    default:
      return 'Doorgeven';
  }
}

function chipFor(action: Action, trumpSuit: Suit | null = null): ActionChip {
  const title = actionLabel(action);
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
      return text('Pas', 'ghost');
    case 'wachten':
      return text('Wachten', 'ghost');
    case 'parole':
      return text('Passe parole', 'ghost');
    case 'troelKeep':
      return text('Troef houden');
    case 'meegaan': {
      const base = action.tricks === 8 ? 'Meegaan' : `Meegaan ${action.tricks}`;
      if (!trumpSuit) return text(base, 'primary');
      return {
        action,
        label: base,
        suitSym: SUIT_SYMBOL[trumpSuit],
        red: trumpSuit === 'H' || trumpSuit === 'D',
        variant: 'primary',
        title: `${base} (troef ${SUIT_SYMBOL[trumpSuit]})`,
      };
    }
    case 'raise':
      return text('Verhogen');
    case 'alleen':
      return text(`${action.tricks}`);
    case 'piccolo':
      return text('Piccolo');
    case 'miserie':
      return text(action.variant === 'klein' ? 'Kleine' : action.variant === 'groot' ? 'Grote' : 'Open');
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
function bidParts(action: Action): { pre: string; suit: Suit | null; post: string } {
  switch (action.type) {
    case 'vraag':
      return { pre: 'Vraag', suit: action.suit, post: '' };
    case 'abondance':
      return { pre: `Abondance ${action.tricks}`, suit: action.suit, post: '' };
    case 'soloSlim':
      return { pre: 'Solo slim', suit: action.suit, post: '' };
    case 'troelSwitch':
      return { pre: 'Troef', suit: action.suit, post: '(9 slagen)' };
    default:
      return { pre: actionLabel(action), suit: null, post: '' };
  }
}

/** One-line plain-language explanation of a contract for hover tooltips.
 *  Returns undefined for self-evident bids (pas/vraag/meegaan), which need none. */
function contractExplain(action: Action): string | undefined {
  switch (action.type) {
    case 'pass':
    case 'vraag':
    case 'meegaan':
      return undefined;
    case 'wachten':
      return 'Wachten: je bewaart het recht om straks een vraag te aanvaarden in plaats van nu zelf te bieden.';
    case 'parole':
      return 'Passe parole: je geeft de beslissing om te verhogen terug aan de vrager (enkel vanaf 11 slagen).';
    case 'raise':
      return 'Verhogen: je belooft één slag meer om boven een tussenliggend bod te blijven.';
    case 'troelKeep':
      return 'Troel: je houdt de opgelegde troef; samen met je partner moet je 8 slagen halen.';
    case 'troelSwitch':
      return 'Troel: je kiest zelf een andere troef; dan moeten jullie samen 9 slagen halen.';
    case 'alleen':
      return `Alleen: je speelt in je eentje tegen de andere drie en moet ${action.tricks} slagen halen met je eigen troef.`;
    case 'abondance':
      return `Abondance: alleen tegen de andere drie beloof je ${action.tricks} slagen met je eigen troef. Jij komt uit.`;
    case 'soloSlim':
      return 'Solo slim: alleen tegen de andere drie beloof je álle 13 slagen met je eigen troef. Jij komt uit.';
    case 'piccolo':
      return 'Piccolo: je moet precies één slag halen, zonder troef.';
    case 'miserie':
      switch (action.variant) {
        case 'klein':
          return 'Kleine miserie: je mag geen enkele slag halen. Iedereen legt eerst één kaart weg; zonder troef.';
        case 'groot':
          return 'Grote miserie: je mag geen enkele van de 13 slagen halen, zonder troef.';
        default:
          return 'Open miserie: je mag geen enkele slag halen en speelt met je kaarten open op tafel, zonder troef.';
      }
    default:
      return undefined;
  }
}

@Component({
  selector: 'app-board',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CardComponent],
  template: `
    @if (view(); as v) {
      <div class="board">
        <header class="topbar">
          @if (contractInfo(); as ci) {
            <span class="contract">
              <span class="gold">{{ ci.names }}</span>
              <span class="sep">·</span>
              <span class="gold">{{ ci.contract }}</span>
              <span class="sep">·</span>
              @if (ci.trumpSym) {
                <span class="mini-card" [class.red]="ci.trumpRed">{{ ci.trumpSym }}</span>
              } @else {
                <span class="gold">zonder troef</span>
              }
            </span>
          } @else {
            <span class="contract">{{ statusLine() }}</span>
          }
          <span class="scores">
            @for (s of seatsByScore(); track s.seat) {
              <span class="score">{{ s.name }}: {{ v.scores[s.seat] }}</span>
            }
          </span>
        </header>

        <div class="felt">
          @for (s of seats(); track s.seat) {
            @if (s.position !== 'bottom') {
              <div class="player {{ s.position }}" [class.turn]="s.isTurn" [class.declarer]="s.isDeclarer">
                <div class="name">
                  {{ s.name }}
                  @if (s.isDealer) { <span class="badge">deler</span> }
                </div>
                <div class="meta">{{ s.tricks }} slagen</div>
              </div>
            }
          }

          <div class="trick">
            @for (t of trick(); track t.seat) {
              <div class="trick-card {{ t.position }}">
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
                  @if (s.isDealer) { <span class="badge">deler</span> }
                </div>
                <div class="meta">{{ s.tricks }} slagen</div>
              </div>
            }
          }
        </div>

        @if (v.phase === 'bidding' || v.phase === 'troelTrump') {
          <div class="action-bar">
            @if (actionGroups().length > 0) {
              @for (g of actionGroups(); track g.label) {
                <div class="action-group">
                  <span class="group-label">{{ g.label }}</span>
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
          <div class="action-bar"><span class="waiting">Kies één kaart om weg te leggen (kleine miserie)</span></div>
        }

        <div class="hand">
          @for (c of v.hand; track c) {
            <app-card [card]="c" [enabled]="playableCards().has(c) && !busy()" [trump]="isTrump(c)" (picked)="pickCard($event)" />
          }
        </div>

        @if (v.phase === 'scored') {
          <div class="overlay">
            <div class="panel">
              <h3>Deel {{ v.handNumber }} gespeeld</h3>
              <p>{{ v.lastHandSummary }}</p>
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
              <button class="primary" (click)="nextHand()" [disabled]="busy()">Volgend deel</button>
            </div>
          </div>
        }

        @if (error()) {
          <p class="error">{{ error() }}</p>
        }
      </div>
    } @else {
      <p class="center-msg">Kaarten laden…</p>
    }
  `,
  styles: `
    .board { display: flex; flex-direction: column; height: 100dvh; }
    .topbar {
      display: flex; align-items: center; gap: 1rem; padding: 0.5rem 1rem;
      background: rgba(0, 0, 0, 0.35); font-size: 0.9rem;
    }
    .contract { text-align: left; display: flex; align-items: center; gap: 0.4rem; }
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
    .scores { display: flex; gap: 0.8rem; opacity: 0.9; margin-left: auto; }
    .felt { position: relative; flex: 1; min-height: 18rem; }
    .player {
      position: absolute; text-align: center; padding: 0.4rem 0.8rem; border-radius: 0.5rem;
      background: rgba(0, 0, 0, 0.25); min-width: 8rem; border: 2px solid transparent;
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
    .trick {
      position: absolute; inset: 0; display: grid; place-items: center;
    }
    .trick-card { position: absolute; top: 50%; left: 50%; }
    .trick-card.bottom { transform: translate(-50%, calc(-50% + 3.2rem)); }
    .trick-card.top { transform: translate(-50%, calc(-50% - 3.2rem)); }
    .trick-card.left { transform: translate(calc(-50% - 3rem), -50%); }
    .trick-card.right { transform: translate(calc(-50% + 3rem), -50%); }
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
    // The standing vraag's suit becomes the trump when you go along with it.
    const trumpSuit = this.view()?.auction.proposal?.suit ?? null;
    const buckets = new Map<string, ActionChip[]>();
    for (const action of this.legal()) {
      if (action.type === 'play' || action.type === 'discard') continue;
      const group = groupOf(action);
      const chip = chipFor(action, trumpSuit);
      chip.explain = contractExplain(action);
      (buckets.get(group) ?? buckets.set(group, []).get(group)!).push(chip);
    }
    return GROUP_ORDER.filter((label) => buckets.has(label)).map((label) => {
      const chips = buckets.get(label)!;
      if (label === 'Abondance') {
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
          tricks: v.play?.tricksWon[p.seat] ?? 0,
          position: positions[rel]!,
        };
      })
      .sort((a, b) => a.seat - b.seat);
  });

  protected readonly seatsByScore = computed(() => this.seats());

  protected readonly trick = computed(() => {
    const v = this.view();
    if (!v?.play) return [];
    const positions = ['bottom', 'left', 'top', 'right'] as const;
    const current = v.play.trick.length > 0
      ? v.play.trick
      : v.play.completedTricks[v.play.completedTricks.length - 1]?.cards ?? [];
    return current.map((t) => ({
      seat: t.seat,
      card: t.card,
      position: positions[(t.seat - v.seat + 4) % 4]!,
    }));
  });

  /** Structured contract banner (names · bid · troef) for the top-left header. */
  protected readonly contractInfo = computed(() => {
    const v = this.view();
    if (!v?.contract) return null;
    const names = v.contract.declarers
      .map((d) => this.table().players.find((p) => p.seat === d)?.name ?? `speler ${d + 1}`)
      .join(' & ');
    return {
      names,
      // Drop the " in <suit>" suffix — the troef card next to it already shows the suit.
      contract: bidLabel({ ...v.contract.bid, suit: undefined }),
      trumpSym: v.contract.trump ? SUIT_SYMBOL[v.contract.trump] : null,
      trumpRed: v.contract.trump === 'H' || v.contract.trump === 'D',
    };
  });

  protected readonly statusLine = computed(() => {
    const v = this.view();
    if (!v) return '';
    if (v.phase === 'bidding') return v.doubleNext ? 'Bieden (dubbele punten!)' : 'Bieden';
    if (v.phase === 'troelTrump') return 'Troel: partner kiest troef';
    if (v.phase === 'discard') return 'Kleine miserie: iedereen legt een kaart weg';
    return '';
  });

  protected readonly waitingText = computed(() => {
    const v = this.view();
    const t = this.table();
    if (!v) return '';
    const turn = v.phase === 'troelTrump' ? v.auction.troel?.partner : v.auction.turn;
    const name = t.players.find((p) => p.seat === turn)?.name ?? '…';
    return `${name} is aan zet…`;
  });

  protected readonly recentBids = computed(() => {
    const v = this.view();
    const t = this.table();
    if (!v) return [];
    return v.auction.bids.slice(-6).map((b) => {
      const name = t.players.find((p) => p.seat === b.seat)?.name ?? `speler ${b.seat + 1}`;
      const parts = bidParts(b.action);
      return {
        name,
        pre: parts.pre,
        suitSym: parts.suit ? SUIT_SYMBOL[parts.suit] : '',
        red: parts.suit === 'H' || parts.suit === 'D',
        post: parts.post,
        explain: contractExplain(b.action),
      };
    });
  });

  protected pickCard(card: Card): void {
    const v = this.view();
    if (!v) return;
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
      this.error.set(e instanceof Error ? e.message : 'Er ging iets mis');
      setTimeout(() => this.error.set(null), 4000);
    } finally {
      this.busy.set(false);
    }
  }
}
