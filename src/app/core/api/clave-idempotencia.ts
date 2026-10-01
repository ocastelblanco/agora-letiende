/**
 * Clave de idempotencia por intento (roadmap #32 parte 1). Un reintento del
 * mismo contenido (red caída, timeout, segundo toque) reutiliza la clave y el
 * backend no repite el efecto; contenido distinto o una operación ya
 * resuelta con éxito generan una clave nueva. El backend exige un UUID v4.
 */
export class GeneradorClaveIdempotencia {
  private clave: string | null = null;
  private huella: string | null = null;

  /** Devuelve la clave vigente para este contenido, creando una nueva si hace falta. */
  obtener(datos: unknown): string {
    const huellaActual = JSON.stringify(datos);
    if (this.clave === null || this.huella !== huellaActual) {
      this.clave = crypto.randomUUID();
      this.huella = huellaActual;
    }
    return this.clave;
  }

  /** Descarta la clave: se llama tras un éxito, para que la próxima operación sea nueva. */
  renovar(): void {
    this.clave = null;
    this.huella = null;
  }
}
