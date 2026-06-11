import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../core/api.service';
import { FirebaseService } from '../core/firebase.service';
import { TableDoc } from '../core/types';

@Component({
  selector: 'app-lobby',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule],
  template: `
    <div class="lobby">
      <h2>Tafel {{ table().code }}</h2>
      <p class="hint">Deel deze code (of de link) met je medespelers.</p>
      <button class="copy" (click)="copyLink()">
        {{ copied() ? '✓ Link gekopieerd!' : '🔗 Kopieer uitnodigingslink' }}
      </button>

      <ul class="players">
        @for (p of table().players; track p.uid) {
          <li>
            <span class="seat">{{ p.seat + 1 }}</span>
            {{ p.name }}
            @if (p.isBot) { <span class="tag">bot</span> }
            @if (p.uid === table().hostUid) { <span class="tag host">host</span> }
          </li>
        }
        @for (i of empty(); track i) {
          <li class="open">vrije stoel</li>
        }
      </ul>

      @if (!seated()) {
        <div class="join">
          <input [(ngModel)]="name" maxlength="20" placeholder="Jouw naam" />
          <button class="primary" (click)="join()" [disabled]="busy() || !name.trim()">Aan tafel</button>
        </div>
      } @else if (isHost()) {
        <div class="host-actions">
          @if (table().players.length < 4) {
            <button (click)="addBot()" [disabled]="busy()">+ Bot toevoegen</button>
          }
          <button
            class="primary"
            (click)="start()"
            [disabled]="busy() || table().players.length !== 4"
          >
            Start het spel
          </button>
        </div>
      } @else {
        <p class="hint">Wachten tot de host het spel start…</p>
      }

      @if (error()) {
        <p class="error">{{ error() }}</p>
      }
    </div>
  `,
  styles: `
    .lobby { max-width: 24rem; margin: 10vh auto 0; text-align: center; display: flex; flex-direction: column; gap: 1rem; }
    h2 { font-size: 2rem; letter-spacing: 0.2em; margin: 0; }
    .hint { opacity: 0.75; margin: 0; }
    .players { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 0.4rem; }
    .players li {
      background: rgba(255, 255, 255, 0.08);
      border-radius: 0.4rem;
      padding: 0.55rem 0.9rem;
      text-align: left;
      display: flex;
      align-items: center;
      gap: 0.6rem;
    }
    .players li.open { opacity: 0.45; font-style: italic; justify-content: center; }
    .seat {
      background: rgba(255, 255, 255, 0.15);
      border-radius: 50%;
      width: 1.5rem;
      height: 1.5rem;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 0.8rem;
    }
    .tag { font-size: 0.7rem; background: rgba(255,255,255,0.18); border-radius: 0.3rem; padding: 0.1rem 0.4rem; }
    .tag.host { background: #d4a017; color: #1d2b1f; }
    .join, .host-actions { display: flex; gap: 0.6rem; justify-content: center; }
    input {
      padding: 0.55rem 0.8rem; border-radius: 0.4rem; border: 1px solid rgba(255,255,255,0.3);
      background: rgba(255,255,255,0.1); color: inherit; font-size: 1rem;
    }
    button {
      padding: 0.55rem 1rem; border-radius: 0.4rem; border: none; font-size: 1rem; cursor: pointer;
      background: rgba(255, 255, 255, 0.15); color: inherit;
    }
    button.primary { background: #d4a017; color: #1d2b1f; font-weight: 700; }
    button:disabled { opacity: 0.5; cursor: default; }
    button.copy {
      align-self: center;
      background: transparent;
      border: 1px dashed rgba(255, 255, 255, 0.4);
      font-size: 0.9rem;
    }
    button.copy:hover { border-style: solid; background: rgba(255, 255, 255, 0.08); }
    .error { color: #ff9d9d; }
  `,
})
export class LobbyComponent {
  private api = inject(ApiService);
  private fb = inject(FirebaseService);

  readonly table = input.required<TableDoc>();

  name = localStorage.getItem('wiezen-name') ?? '';
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly copied = signal(false);

  protected readonly seated = computed(() =>
    this.table().players.some((p) => p.uid === this.fb.uid()),
  );
  protected readonly isHost = computed(() => this.table().hostUid === this.fb.uid());
  protected readonly empty = computed(() =>
    Array.from({ length: 4 - this.table().players.length }, (_, i) => i),
  );

  async copyLink(): Promise<void> {
    const link = `${location.origin}/table/${this.table().code}`;
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      // Clipboard API unavailable (e.g. non-secure context): fall back to a prompt.
      window.prompt('Kopieer deze link:', link);
      return;
    }
    this.copied.set(true);
    setTimeout(() => this.copied.set(false), 2000);
  }

  async join(): Promise<void> {
    localStorage.setItem('wiezen-name', this.name.trim());
    await this.run(() => this.api.joinTable(this.table().code, this.name.trim()).then(() => {}));
  }

  async addBot(): Promise<void> {
    await this.run(() => this.api.addBot(this.table().code));
  }

  async start(): Promise<void> {
    await this.run(() => this.api.startGame(this.table().code));
  }

  private async run(fn: () => Promise<void>): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      await fn();
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Er ging iets mis');
    } finally {
      this.busy.set(false);
    }
  }
}
