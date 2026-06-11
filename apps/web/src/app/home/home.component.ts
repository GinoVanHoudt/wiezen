import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ApiService } from '../core/api.service';

@Component({
  selector: 'app-home',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule],
  template: `
    <div class="home">
      <h1>Wiezen</h1>
      <p class="subtitle">Kleurenwiezen online — met vrienden of tegen botten</p>

      <label>
        Jouw naam
        <input [(ngModel)]="name" maxlength="20" placeholder="bv. Gino" />
      </label>

      <div class="actions">
        <button class="primary" (click)="create()" [disabled]="busy() || !name.trim()">
          Nieuwe tafel
        </button>

        <div class="join">
          <input
            [(ngModel)]="code"
            maxlength="6"
            placeholder="CODE"
            class="code-input"
            (keyup.enter)="join()"
          />
          <button (click)="join()" [disabled]="busy() || !name.trim() || code.trim().length < 6">
            Meedoen
          </button>
        </div>
      </div>

      @if (error()) {
        <p class="error">{{ error() }}</p>
      }
    </div>
  `,
  styles: `
    .home {
      max-width: 22rem;
      margin: 14vh auto 0;
      display: flex;
      flex-direction: column;
      gap: 1.2rem;
      text-align: center;
    }
    h1 { font-size: 3rem; margin: 0; letter-spacing: 0.04em; }
    .subtitle { margin: 0; opacity: 0.8; }
    label { display: flex; flex-direction: column; gap: 0.4rem; text-align: left; font-size: 0.9rem; }
    input {
      padding: 0.6rem 0.8rem;
      border-radius: 0.4rem;
      border: 1px solid rgba(255, 255, 255, 0.3);
      background: rgba(255, 255, 255, 0.1);
      color: inherit;
      font-size: 1rem;
    }
    .actions { display: flex; flex-direction: column; gap: 0.8rem; }
    .join { display: flex; gap: 0.5rem; }
    .code-input { flex: 1; text-transform: uppercase; letter-spacing: 0.3em; text-align: center; }
    button {
      padding: 0.6rem 1rem;
      border-radius: 0.4rem;
      border: none;
      font-size: 1rem;
      cursor: pointer;
      background: rgba(255, 255, 255, 0.15);
      color: inherit;
    }
    button.primary { background: #d4a017; color: #1d2b1f; font-weight: 700; }
    button:disabled { opacity: 0.5; cursor: default; }
    .error { color: #ff9d9d; }
  `,
})
export class HomeComponent {
  private api = inject(ApiService);
  private router = inject(Router);

  name = localStorage.getItem('wiezen-name') ?? '';
  code = '';
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);

  async create(): Promise<void> {
    await this.run(async () => {
      const { code } = await this.api.createTable(this.name.trim());
      await this.router.navigate(['/table', code]);
    });
  }

  async join(): Promise<void> {
    await this.run(async () => {
      const code = this.code.trim().toUpperCase();
      await this.api.joinTable(code, this.name.trim());
      await this.router.navigate(['/table', code]);
    });
  }

  private async run(fn: () => Promise<void>): Promise<void> {
    localStorage.setItem('wiezen-name', this.name.trim());
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
