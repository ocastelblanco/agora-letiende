import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';

import { PrecioPipe } from './shared/pipes/precio.pipe';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, MatButtonModule, PrecioPipe],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  protected readonly title = signal('agora-letiende');
  protected readonly precioEjemplo = 45000;
}
