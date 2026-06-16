import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { Card, Seat, Suit, TrickRecord, suitOf } from '@wiezen/engine';
import { I18n } from '../core/i18n';
import { CardComponent } from '../shared/card.component';

/** Table position of a card relative to the viewer (viewer always sits at the bottom). */
type Position = 'bottom' | 'left' | 'top' | 'right';

const POSITIONS: readonly Position[] = ['bottom', 'left', 'top', 'right'];

/** One card of the trick, decorated for the cross layout. */
interface TrickCardView {
  card: Card;
  name: string;
  position: Position;
  isWinner: boolean;
  isTrump: boolean;
  /** Stacking order: first card played sits at the bottom, the last one on top. */
  z: number;
}

/**
 * The most recent completed trick, shown collapsed by default beside the winner's
 * nameplate. Expanding it replays the trick the way it sat on the felt: each card at
 * its player's position relative to the viewer (who is always at the bottom), and
 * stacked in play order — the first card played underneath, the last one on top.
 * The winning card is ringed; hovering a card reveals who played it.
 *
 * Everyone has already seen these cards once the trick resolved, so there's no hidden
 * information here — it's purely a review aid. The panel collapses automatically when
 * a new trick lands (the `trick` input only changes identity for a genuinely new trick).
 */
@Component({
  selector: 'app-last-trick',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CardComponent],
  template: `
    <div class="last-trick">
      <button
        type="button"
        class="toggle"
        [attr.aria-expanded]="expanded()"
        [attr.aria-label]="i18n.t('board.lastTrick')"
        (click)="expanded.set(!expanded())"
      >
        <span class="label">{{ i18n.t('board.lastTrick') }}</span>
        <span class="caret" aria-hidden="true">{{ expanded() ? '▾' : '▸' }}</span>
      </button>
      @if (expanded()) {
        <div class="cards">
          @for (c of cards(); track c.card) {
            <div class="slot {{ c.position }}" [class.winner]="c.isWinner" [style.z-index]="c.z" [title]="c.name">
              <app-card [card]="c.card" [trump]="c.isTrump" [small]="true" />
            </div>
          }
        </div>
      }
    </div>
  `,
  styles: `
    .last-trick { display: flex; flex-direction: column; align-items: center; gap: 0.3rem; margin-top: 0.3rem; }
    .toggle {
      display: inline-flex; align-items: center; gap: 0.25rem; cursor: pointer;
      font-family: inherit; font-size: 0.7rem; line-height: 1; color: #ece7d6;
      background: rgba(236, 231, 214, 0.1); border: 1px solid rgba(236, 231, 214, 0.3);
      border-radius: 0.35rem; padding: 0.2rem 0.45rem;
    }
    .toggle:hover { background: rgba(236, 231, 214, 0.2); }
    .caret { font-size: 0.6rem; opacity: 0.8; }
    /* A mini felt: cards laid out as the trick sat on the table, centred on the box. */
    .cards {
      position: relative; width: 6.4rem; height: 7.2rem;
      background: rgba(0, 0, 0, 0.4); border-radius: 0.5rem;
      box-shadow: 0 6px 18px rgba(0, 0, 0, 0.5);
    }
    .slot { position: absolute; top: 50%; left: 50%; border-radius: 0.4rem; }
    /* Each card is offset from the centre toward its player's edge (viewer at bottom),
       overlapping into a pile so the play-order stacking (z-index) reads clearly. */
    .slot.bottom { transform: translate(-50%, calc(-50% + 1.5rem)); }
    .slot.top { transform: translate(-50%, calc(-50% - 1.5rem)); }
    .slot.left { transform: translate(calc(-50% - 1.5rem), -50%); }
    .slot.right { transform: translate(calc(-50% + 1.5rem), -50%); }
    /* The card that took the trick gets a gold ring. */
    .slot.winner { box-shadow: 0 0 0 2px #d4a017; }
  `,
})
export class LastTrickComponent {
  protected readonly i18n = inject(I18n);

  /** The trick to display (its `cards` are in play order, leader first). */
  readonly trick = input.required<TrickRecord>();
  /** Player display names indexed by seat, surfaced as per-card hover titles. */
  readonly names = input.required<string[]>();
  /** The viewing player's seat — cards are placed relative to it (viewer at bottom). */
  readonly viewerSeat = input.required<Seat>();
  /** Current trump suit, so trump cards are marked; null for no-trump contracts. */
  readonly trump = input<Suit | null>(null);

  protected readonly expanded = signal(false);

  constructor() {
    // Auto-collapse whenever a new trick arrives. The parent's `lastTrick` keeps a
    // stable identity until the trick genuinely changes, so this only fires for a new
    // trick (not for unrelated view updates) and won't snap the panel shut mid-view.
    effect(() => {
      this.trick();
      this.expanded.set(false);
    });
  }

  protected readonly cards = computed<TrickCardView[]>(() => {
    const trick = this.trick();
    const names = this.names();
    const viewer = this.viewerSeat();
    const trump = this.trump();
    return trick.cards.map((c, i) => ({
      card: c.card,
      name: names[c.seat] ?? '',
      position: POSITIONS[(c.seat - viewer + 4) % 4]!,
      isWinner: c.seat === trick.winner,
      isTrump: trump !== null && suitOf(c.card) === trump,
      z: i + 1,
    }));
  });
}
