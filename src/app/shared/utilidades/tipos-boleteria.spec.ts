import type { EtapaBoleteria } from '../../core/models/evento.model';
import { precioDelTipoEnEtapa, soloTipoPorDefecto, tiposDelEvento } from './tipos-boleteria';

const etapaLegada: EtapaBoleteria = {
  etapaId: 'et1',
  nombre: 'Preventa',
  precio: 30000,
  cierraEn: '2099-01-01T00:00:00.000Z',
  orden: 1,
};

describe('tipos-boleteria', () => {
  it('un evento sin tiposBoleta se lee como un único tipo «Por defecto»', () => {
    const tipos = tiposDelEvento({});

    expect(tipos).toEqual([{ tipoId: 'defecto', nombre: 'Por defecto', personas: 1, orden: 0 }]);
    expect(soloTipoPorDefecto(tipos)).toBe(true);
  });

  it('ordena los tipos por `orden` y distingue varios tipos del tipo por defecto', () => {
    const tipos = tiposDelEvento({
      tiposBoleta: [
        { tipoId: 'b', nombre: 'Pareja', personas: 2, orden: 1 },
        { tipoId: 'a', nombre: 'Individual', personas: 1, orden: 0 },
      ],
    });

    expect(tipos.map((tipo) => tipo.tipoId)).toEqual(['a', 'b']);
    expect(soloTipoPorDefecto(tipos)).toBe(false);
  });

  it('un único tipo con otro nombre no se considera «Por defecto»', () => {
    expect(soloTipoPorDefecto([{ tipoId: 'x', nombre: 'Pareja', personas: 2, orden: 0 }])).toBe(false);
  });

  it('el precio de una etapa sin `precios` solo existe para el tipo «defecto»', () => {
    expect(precioDelTipoEnEtapa(etapaLegada, 'defecto')).toBe(30000);
    expect(precioDelTipoEnEtapa(etapaLegada, 'otro')).toBeNull();
  });

  it('devuelve el precio del tipo y null si la etapa no lo ofrece; un precio 0 no es null', () => {
    const etapa: EtapaBoleteria = {
      ...etapaLegada,
      precios: [
        { tipoId: 'a', precio: 0 },
        { tipoId: 'b', precio: 40000 },
      ],
    };

    expect(precioDelTipoEnEtapa(etapa, 'a')).toBe(0);
    expect(precioDelTipoEnEtapa(etapa, 'b')).toBe(40000);
    expect(precioDelTipoEnEtapa(etapa, 'c')).toBeNull();
  });
});
