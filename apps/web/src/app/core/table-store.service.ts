import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { Unsubscribe, doc, onSnapshot } from 'firebase/firestore';
import { PlayerView } from '@wiezen/engine';
import { FirebaseService } from './firebase.service';
import { I18n } from './i18n';
import { TableDoc } from './types';

/** Live Firestore listeners for one table, exposed as signals. */
@Injectable({ providedIn: 'root' })
export class TableStore {
  private fb = inject(FirebaseService);
  private i18n = inject(I18n);

  private code = signal<string | null>(null);
  readonly table = signal<TableDoc | null>(null);
  readonly view = signal<PlayerView | null>(null);
  readonly error = signal<string | null>(null);

  readonly mySeat = computed(() => {
    const uid = this.fb.uid();
    const t = this.table();
    return t?.players.find((p) => p.uid === uid)?.seat ?? null;
  });

  private unsubTable: Unsubscribe | null = null;
  private unsubView: Unsubscribe | null = null;

  constructor() {
    // (Re)attach the private-view listener once both code and uid are known.
    effect(() => {
      const code = this.code();
      const uid = this.fb.uid();
      this.unsubView?.();
      this.unsubView = null;
      if (!code || !uid) return;
      this.unsubView = onSnapshot(
        doc(this.fb.firestore, 'tables', code, 'private', uid),
        (snap) => {
          const data = snap.data() as { view: PlayerView } | undefined;
          this.view.set(data?.view ?? null);
        },
        (e) => this.error.set(e.message),
      );
    });
  }

  listen(code: string): void {
    if (this.code() === code) return;
    this.stop();
    this.code.set(code);
    this.unsubTable = onSnapshot(
      doc(this.fb.firestore, 'tables', code),
      (snap) => {
        this.table.set((snap.data() as TableDoc | undefined) ?? null);
        if (!snap.exists()) this.error.set(this.i18n.t('table.notFound'));
      },
      (e) => this.error.set(e.message),
    );
  }

  stop(): void {
    this.unsubTable?.();
    this.unsubTable = null;
    this.code.set(null);
    this.table.set(null);
    this.view.set(null);
    this.error.set(null);
  }
}
