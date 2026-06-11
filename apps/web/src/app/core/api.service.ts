import { Injectable, inject } from '@angular/core';
import { httpsCallable } from 'firebase/functions';
import { Action } from '@wiezen/engine';
import { FirebaseService } from './firebase.service';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private fb = inject(FirebaseService);

  private call<T = unknown>(name: string, data: unknown): Promise<T> {
    const fn = httpsCallable(this.fb.functions, name);
    return fn(data).then((r) => r.data as T);
  }

  createTable(name: string): Promise<{ code: string }> {
    return this.call('createTable', { name });
  }

  joinTable(code: string, name: string): Promise<{ code: string }> {
    return this.call('joinTable', { code, name });
  }

  addBot(code: string): Promise<void> {
    return this.call('addBot', { code });
  }

  startGame(code: string): Promise<void> {
    return this.call('startGame', { code });
  }

  act(code: string, action: Action): Promise<void> {
    return this.call('act', { code, action });
  }

  nextHand(code: string): Promise<void> {
    return this.call('nextHand', { code });
  }
}
