import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { BarraNavegacionComponent } from './shared/navegacion/barra-navegacion.component';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, BarraNavegacionComponent],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {}
