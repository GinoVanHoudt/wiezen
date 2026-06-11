import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { Card } from '@wiezen/engine';
import { isRed, rankLabel, suitSymbol } from './cards';

@Component({
  selector: 'app-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button
      type="button"
      class="card"
      [class.red]="red()"
      [class.enabled]="enabled()"
      [class.small]="small()"
      [disabled]="!enabled()"
      (click)="picked.emit(card())"
    >
      <span class="corner">{{ rank() }}<br />{{ symbol() }}</span>
      <span class="pip">{{ symbol() }}</span>
    </button>
  `,
  styles: `
    .card {
      position: relative;
      width: 3.4rem;
      height: 4.8rem;
      border-radius: 0.4rem;
      background: #fdfdf8;
      border: 1px solid #b9b4a4;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.35);
      color: #1c1c20;
      font-family: inherit;
      cursor: default;
      padding: 0.15rem 0.25rem;
      text-align: left;
      transition: transform 0.12s ease, box-shadow 0.12s ease;
    }
    .card.small { width: 2.6rem; height: 3.7rem; }
    .card.red { color: #b3262e; }
    .card.enabled { cursor: pointer; }
    .card.enabled:hover { transform: translateY(-0.55rem); box-shadow: 0 6px 12px rgba(0, 0, 0, 0.4); }
    .card:disabled { opacity: 0.92; }
    .corner { font-size: 0.78rem; font-weight: 700; line-height: 1; display: block; }
    .pip { position: absolute; bottom: 0.2rem; right: 0.3rem; font-size: 1.5rem; line-height: 1; }
    .card.small .pip { font-size: 1.1rem; }
  `,
})
export class CardComponent {
  readonly card = input.required<Card>();
  readonly enabled = input(false);
  readonly small = input(false);
  readonly picked = output<Card>();

  protected readonly red = computed(() => isRed(this.card()));
  protected readonly rank = computed(() => rankLabel(this.card()));
  protected readonly symbol = computed(() => suitSymbol(this.card()));
}
