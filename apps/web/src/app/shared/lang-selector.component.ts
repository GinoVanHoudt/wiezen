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
      background: transparent;
      color: inherit;
      border: none;
      font: inherit;
      font-size: 0.85rem;
      letter-spacing: 0.06em;
      opacity: 0.6;
      cursor: pointer;
      padding: 0.25rem 1.15rem 0.25rem 0.4rem;
      border-radius: 0.35rem;
      /* Caret drawn with a background image so it sits right after the code. */
      background-image: linear-gradient(45deg, transparent 50%, currentColor 50%),
        linear-gradient(135deg, currentColor 50%, transparent 50%);
      background-position: right 0.5rem center, right 0.32rem center;
      background-size: 0.32rem 0.32rem, 0.32rem 0.32rem;
      background-repeat: no-repeat;
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
