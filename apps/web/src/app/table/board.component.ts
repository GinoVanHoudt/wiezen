import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { Action, Card, PlayerView, bidLabel, legalActionsForView } from '@wiezen/engine';
import { ApiService } from '../core/api.service';
import { TableStore } from '../core/table-store.service';
import { TableDoc } from '../core/types';
import { CardComponent } from '../shared/card.component';
import { SUIT_SYMBOL, actionLabel } from '../shared/cards';

interface SeatInfo {
  seat: number;
  name: string;
  isBot: boolean;
  cards: number;
  isDealer: boolean;
  isTurn: boolean;
  isDeclarer: boolean;
  tricks: number;
  position: 'bottom' | 'left' | 'top' | 'right';
}

@Component({
  selector: 'app-board',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CardComponent],
  template: `
    @if (view(); as v) {
      <div class="board">
        <header class="topbar">
          <span class="code">{{ table().code }}</span>
          <span class="contract">{{ statusLine() }}</span>
          <span class="scores">
            @for (s of seatsByScore(); track s.seat) {
              <span class="score">{{ s.name }}: {{ v.scores[s.seat] }}</span>
            }
          </span>
        </header>

        <div class="felt">
          @for (s of seats(); track s.seat) {
            @if (s.position !== 'bottom') {
              <div class="player {{ s.position }}" [class.turn]="s.isTurn">
                <div class="name">
                  {{ s.name }}
                  @if (s.isDealer) { <span class="badge">deler</span> }
                  @if (s.isDeclarer) { <span class="badge declarer">speelt</span> }
                </div>
                <div class="meta">{{ s.cards }} kaarten · {{ s.tricks }} slagen</div>
              </div>
            }
          }

          <div class="trick">
            @for (t of trick(); track t.seat) {
              <div class="trick-card {{ t.position }}">
                <app-card [card]="t.card" [small]="true" />
              </div>
            }
            @if (v.phase === 'bidding' || v.phase === 'troelTrump') {
              <div class="auction-log">
                @for (b of recentBids(); track $index) {
                  <div>{{ b }}</div>
                }
              </div>
            }
          </div>

          @for (s of seats(); track s.seat) {
            @if (s.position === 'bottom') {
              <div class="player bottom" [class.turn]="s.isTurn">
                <div class="name">
                  {{ s.name }} (jij)
                  @if (s.isDealer) { <span class="badge">deler</span> }
                  @if (s.isDeclarer) { <span class="badge declarer">speelt</span> }
                </div>
                <div class="meta">{{ s.tricks }} slagen</div>
              </div>
            }
          }
        </div>

        @if (v.phase === 'bidding' || v.phase === 'troelTrump') {
          <div class="action-bar">
            @if (bidActions().length > 0) {
              @for (a of bidActions(); track $index) {
                <button (click)="doAction(a.action)" [disabled]="busy()">{{ a.label }}</button>
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
            <app-card [card]="c" [enabled]="playableCards().has(c) && !busy()" (picked)="pickCard($event)" />
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
    .code { letter-spacing: 0.2em; font-weight: 700; }
    .contract { flex: 1; text-align: center; }
    .scores { display: flex; gap: 0.8rem; opacity: 0.9; }
    .felt { position: relative; flex: 1; min-height: 18rem; }
    .player {
      position: absolute; text-align: center; padding: 0.4rem 0.8rem; border-radius: 0.5rem;
      background: rgba(0, 0, 0, 0.25); min-width: 8rem;
    }
    .player.turn { outline: 2px solid #d4a017; }
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
    .badge.declarer { background: #d4a017; color: #1d2b1f; }
    .trick {
      position: absolute; inset: 0; display: grid; place-items: center;
    }
    .trick-card { position: absolute; }
    .trick-card.bottom { bottom: 28%; left: 50%; transform: translateX(-50%); }
    .trick-card.top { top: 22%; left: 50%; transform: translateX(-50%); }
    .trick-card.left { left: 32%; top: 50%; transform: translateY(-50%); }
    .trick-card.right { right: 32%; top: 50%; transform: translateY(-50%); }
    .auction-log {
      font-size: 0.85rem; background: rgba(0, 0, 0, 0.3); padding: 0.6rem 1rem;
      border-radius: 0.5rem; max-width: 18rem; text-align: center;
    }
    .action-bar {
      display: flex; flex-wrap: wrap; gap: 0.5rem; justify-content: center; padding: 0.5rem;
      background: rgba(0, 0, 0, 0.25);
    }
    .action-bar button {
      padding: 0.45rem 0.9rem; border-radius: 0.4rem; border: none; cursor: pointer;
      background: #e9e4d2; color: #222; font-size: 0.95rem;
    }
    .action-bar button:hover { background: #fff; }
    .action-bar button:disabled { opacity: 0.5; }
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

  protected readonly bidActions = computed(() =>
    this.legal()
      .filter((a) => a.type !== 'play' && a.type !== 'discard')
      .map((action) => ({ action, label: actionLabel(action) })),
  );

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
          cards: v.handCounts[p.seat] ?? 0,
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

  protected readonly statusLine = computed(() => {
    const v = this.view();
    if (!v) return '';
    if (v.phase === 'bidding') return v.doubleNext ? 'Bieden (dubbele punten!)' : 'Bieden';
    if (v.phase === 'troelTrump') return 'Troel: partner kiest troef';
    if (v.phase === 'discard') return 'Kleine miserie: iedereen legt een kaart weg';
    if (v.contract) {
      const names = v.contract.declarers
        .map((d) => this.table().players.find((p) => p.seat === d)?.name ?? `speler ${d + 1}`)
        .join(' & ');
      const trump = v.contract.trump ? ` · troef ${SUIT_SYMBOL[v.contract.trump]}` : ' · zonder troef';
      return `${names}: ${bidLabel(v.contract.bid)}${trump}`;
    }
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
      return `${name}: ${actionLabel(b.action)}`;
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
