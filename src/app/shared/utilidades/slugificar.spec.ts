import { slugificar } from './slugificar';

describe('slugificar', () => {
  it('convierte a minúsculas y reemplaza espacios por guiones', () => {
    expect(slugificar('Noche de engaños y karaoke')).toBe('noche-de-enganos-y-karaoke');
  });

  it('quita signos de puntuación y colapsa guiones repetidos', () => {
    expect(slugificar('  Concierto:  Jazz & Blues!! ')).toBe('concierto-jazz-blues');
  });

  it('quita acentos y la eñe se convierte en n', () => {
    expect(slugificar('Fiesta de Año Nuevo — 2027')).toBe('fiesta-de-ano-nuevo-2027');
  });
});
