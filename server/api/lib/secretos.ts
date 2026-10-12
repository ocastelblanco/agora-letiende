/**
 * Lectura de secretos de firma (`tech-specs.md` §9). Un secreto ausente o
 * vacío lanza `SecretoNoConfigurado` en vez de usar `''` como llave: una
 * firma calculada con llave vacía la puede reproducir cualquiera. El error
 * llega al `catch` de cada handler, que responde un 500 genérico — nunca se
 * firma ni se acepta una firma sin la llave real.
 */
export class SecretoNoConfigurado extends Error {
  constructor(nombre: string) {
    super(`Falta la variable de entorno ${nombre}`);
    this.name = 'SecretoNoConfigurado';
  }
}

export function leerSecreto(nombre: string): string {
  const valor = process.env[nombre];
  if (!valor) {
    throw new SecretoNoConfigurado(nombre);
  }
  return valor;
}
