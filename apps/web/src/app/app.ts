import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { LangSelectorComponent } from './shared/lang-selector.component';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, LangSelectorComponent],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {}
