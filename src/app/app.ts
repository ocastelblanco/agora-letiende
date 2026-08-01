import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Button } from 'primeng/button';

import { PrecioPipe } from './shared/pipes/precio.pipe';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, Button, PrecioPipe],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  protected readonly title = signal('agora-letiende');
  protected readonly precioEjemplo = 45000;
}
