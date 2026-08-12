import type { EtapaBoleteria } from '../../core/models/evento.model';
import { etapaVigenteParaMostrar } from './etapa-vigente';

function crearEtapa(datos: Partial<EtapaBoleteria> & Pick<EtapaBoleteria, 'etapaId' | 'orden' | 'cierraEn'>): EtapaBoleteria {
  return { nombre: `Etapa ${datos.orden}`, precio: 10000, ...datos };
}

describe('etapaVigenteParaMostrar', () => {
  it('devuelve la primera etapa por cierraEn cronológico que todavía no ha pasado', () => {
    const etapas: EtapaBoleteria[] = [
      crearEtapa({ etapaId: 'preventa', orden: 1, cierraEn: '2000-01-01T00:00:00.000Z' }),
      crearEtapa({ etapaId: 'general', orden: 2, cierraEn: '2099-01-01T00:00:00.000Z' }),
      crearEtapa({ etapaId: 'ultima', orden: 3, cierraEn: '2099-06-01T00:00:00.000Z' }),
    ];

    expect(etapaVigenteParaMostrar(etapas)?.etapaId).toBe('general');
  });

  it('devuelve null cuando todas las etapas ya cerraron', () => {
    const etapas: EtapaBoleteria[] = [
      crearEtapa({ etapaId: 'preventa', orden: 1, cierraEn: '2000-01-01T00:00:00.000Z' }),
      crearEtapa({ etapaId: 'general', orden: 2, cierraEn: '2000-06-01T00:00:00.000Z' }),
    ];

    expect(etapaVigenteParaMostrar(etapas)).toBeNull();
  });

  it('devuelve la única etapa cuando todavía no cierra', () => {
    const etapas: EtapaBoleteria[] = [crearEtapa({ etapaId: 'unica', orden: 1, cierraEn: '2099-01-01T00:00:00.000Z' })];

    expect(etapaVigenteParaMostrar(etapas)?.etapaId).toBe('unica');
  });

  it('ordena por cierraEn, no por posición del arreglo de entrada', () => {
    const etapas: EtapaBoleteria[] = [
      crearEtapa({ etapaId: 'segunda', orden: 2, cierraEn: '2099-01-01T00:00:00.000Z' }),
      crearEtapa({ etapaId: 'primera', orden: 1, cierraEn: '2000-01-01T00:00:00.000Z' }),
    ];

    expect(etapaVigenteParaMostrar(etapas)?.etapaId).toBe('segunda');
  });

  it('ordena por cierraEn aunque contradiga a orden (caso real: una etapa nueva se agrega al final del formulario pero cierra antes que una anterior)', () => {
    // Escenario real reportado: A (orden 1) ya cerrada, B (orden 2) vigente
    // "según orden", C se agrega al final (orden 3) pero su cierraEn es
    // ANTERIOR al de B. Cronológicamente A cierra primero, luego C, luego B
    // — como A ya cerró, la etapa vigente correcta es C, no B.
    const etapas: EtapaBoleteria[] = [
      crearEtapa({ etapaId: 'A', orden: 1, cierraEn: '2020-01-01T00:00:00.000Z' }),
      crearEtapa({ etapaId: 'B', orden: 2, cierraEn: '2099-06-01T00:00:00.000Z' }),
      crearEtapa({ etapaId: 'C', orden: 3, cierraEn: '2099-01-01T00:00:00.000Z' }),
    ];

    expect(etapaVigenteParaMostrar(etapas)?.etapaId).toBe('C');
  });
});
