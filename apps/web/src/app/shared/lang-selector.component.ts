import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { I18n, LANGS, LANG_CODE, Lang } from '../core/i18n';

/**
 * Unobtrusive language switcher pinned to the top-right corner of every screen.
 * Renders as a bare native <select> (current code + caret) so it stays keyboard-
 * and screen-reader friendly while drawing minimal attention.
 */
@Component({
  selector: 'app-lang-selector',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule],
  template: `
    <select
      class="lang"
      aria-label="Language"
      [ngModel]="i18n.lang()"
      (ngModelChange)="i18n.setLang($event)"
    >
      @for (l of langs; track l) {
        <option [ngValue]="l">{{ code(l) }}</option>
      }
    </select>
  `,
  styles: `
    :host {
      position: fixed;
      top: 0.4rem;
      right: 0.6rem;
      z-index: 200;
    }
    .lang {
      appearance: none;
      -webkit-appearance: none;
      color: inherit;
      border: none;
      font: inherit;
      font-size: 0.85rem;
      letter-spacing: 0.06em;
      opacity: 0.6;
      cursor: pointer;
      padding: 0.25rem 1.25rem 0.25rem 0.4rem;
      border-radius: 0.35rem;
      /* Crisp chevron as an inline SVG — a CSS-gradient triangle aliases badly. */
      background-color: transparent;
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='5' viewBox='0 0 8 5'%3E%3Cpath d='M1 1l3 3 3-3' fill='none' stroke='%23ece7d6' stroke-width='1.2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
      background-repeat: no-repeat;
      background-position: right 0.45rem center;
      background-size: 0.5rem 0.35rem;
    }
    .lang:hover,
    .lang:focus-visible {
      opacity: 1;
      background-color: rgba(255, 255, 255, 0.1);
      outline: none;
    }
    /* The popup list inherits system colours; force a readable dark theme. */
    .lang option {
      background: #233529;
      color: #ece7d6;
    }
  `,
})
export class LangSelectorComponent {
  protected readonly i18n = inject(I18n);
  protected readonly langs = LANGS;

  protected code(l: Lang): string {
    return LANG_CODE[l];
  }
}
