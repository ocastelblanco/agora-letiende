import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { FiltroPeriodoComponent } from './filtro-periodo.component';
import type { Periodo } from '../utilidades/periodo-eventos';

@Component({
  imports: [FiltroPeriodoComponent],
  template: `<app-filtro-periodo [(periodo)]="periodo" />`,
})
class AnfitrionComponent {
  readonly periodo = signal<Periodo>({ tipo: 'todos', ancla: '2026-10-17' });
}

function crear() {
  TestBed.configureTestingModule({ imports: [NoopAnimationsModule] });
  const fixture = TestBed.createComponent(AnfitrionComponent);
  fixture.detectChanges();
  const host = fixture.nativeElement as HTMLElement;
  const clic = (selector: string) => {
    (host.querySelector(selector) as HTMLElement).click();
    fixture.detectChanges();
  };
  return { fixture, host, clic };
}

describe('FiltroPeriodoComponent', () => {
  it('en "Todos" no muestra las flechas ni la etiqueta del periodo', () => {
    const { host } = crear();

    expect(host.querySelector('[aria-label="Periodo anterior"]')).toBeNull();
  });

  it('al elegir Mes muestra el mes de la fecha de referencia y las flechas', () => {
    const { fixture, host } = crear();
    const botones = host.querySelectorAll<HTMLButtonElement>('mat-button-toggle button');

    botones[1].click(); // Mes
    fixture.detectChanges();

    expect(fixture.componentInstance.periodo()).toEqual({ tipo: 'mes', ancla: '2026-10-01' });
    expect(host.textContent).toContain('Octubre 2026');
  });

  it('las flechas recorren el periodo hacia atrás y hacia adelante', () => {
    const { fixture, clic } = crear();
    fixture.componentInstance.periodo.set({ tipo: 'mes', ancla: '2026-10-01' });
    fixture.detectChanges();

    clic('[aria-label="Periodo siguiente"]');
    expect(fixture.componentInstance.periodo().ancla).toBe('2026-11-01');

    clic('[aria-label="Periodo anterior"]');
    clic('[aria-label="Periodo anterior"]');
    expect(fixture.componentInstance.periodo().ancla).toBe('2026-09-01');
  });

  it('cambiar de Mes a Semana conserva la fecha de referencia', () => {
    const { fixture, host } = crear();
    fixture.componentInstance.periodo.set({ tipo: 'mes', ancla: '2026-10-01' });
    fixture.detectChanges();

    host.querySelectorAll<HTMLButtonElement>('mat-button-toggle button')[2].click(); // Semana
    fixture.detectChanges();

    expect(fixture.componentInstance.periodo()).toEqual({ tipo: 'semana', ancla: '2026-09-28' });
  });
});
