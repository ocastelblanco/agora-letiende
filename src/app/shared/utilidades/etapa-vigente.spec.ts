import type { EtapaBoleteria } from '../../core/models/evento.model';
import { etapaVigenteParaMostrar } from './etapa-vigente';

function crearEtapa(datos: Partial<EtapaBoleteria> & Pick<EtapaBoleteria, 'etapaId' | 'orden' | 'cierraEn'>): EtapaBoleteria {
  return { nombre: `Etapa ${datos.orden}`, precio: 10000, ...datos };
}

describe('etapaVigenteParaMostrar', () => {
  it('devuelve la primera etapa por orden cuyo cierraEn todavía no ha pasado', () => {
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

  it('ordena por orden, no por posición del arreglo de entrada', () => {
    const etapas: EtapaBoleteria[] = [
      crearEtapa({ etapaId: 'segunda', orden: 2, cierraEn: '2099-01-01T00:00:00.000Z' }),
      crearEtapa({ etapaId: 'primera', orden: 1, cierraEn: '2000-01-01T00:00:00.000Z' }),
    ];

    expect(etapaVigenteParaMostrar(etapas)?.etapaId).toBe('segunda');
  });
});
