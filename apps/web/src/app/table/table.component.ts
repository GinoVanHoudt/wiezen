import { ChangeDetectionStrategy, Component, OnDestroy, computed, inject, input } from '@angular/core';
import { TableStore } from '../core/table-store.service';
import { FirebaseService } from '../core/firebase.service';
import { I18n } from '../core/i18n';
import { LobbyComponent } from './lobby.component';
import { BoardComponent } from './board.component';

@Component({
  selector: 'app-table',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LobbyComponent, BoardComponent],
  template: `
    @if (store.error(); as err) {
      <p class="center-msg">{{ err }}</p>
    } @else if (!table()) {
      <p class="center-msg">{{ i18n.t('table.loading') }}</p>
    } @else if (table()!.status === 'lobby') {
      <app-lobby [table]="table()!" />
    } @else if (seated()) {
      <app-board [table]="table()!" />
    } @else {
      <p class="center-msg">{{ i18n.t('table.notSeated') }}</p>
    }
  `,
  styles: `
    .center-msg { text-align: center; margin-top: 20vh; opacity: 0.85; font-size: 1.1rem; }
  `,
})
export class TableComponent implements OnDestroy {
  protected readonly store = inject(TableStore);
  protected readonly i18n = inject(I18n);
  private fb = inject(FirebaseService);

  /** Route param (withComponentInputBinding). */
  readonly code = input.required<string>();

  protected readonly table = this.store.table;
  protected readonly seated = computed(() => this.store.mySeat() !== null);

  constructor() {
    // input() is not available in the constructor body; react to it lazily.
    queueMicrotask(() => this.store.listen(this.code().toUpperCase()));
  }

  ngOnDestroy(): void {
    this.store.stop();
  }
}
