const DIMENSION_MAXIMA_PX = 1600;
const CALIDAD_WEBP = 0.82;

/**
 * Convierte una imagen (JPEG/PNG/WEBP) a WEBP, reduciendo su lado más largo
 * a un máximo de 1600px si hace falta, antes de subirla a S3
 * (OPT-14: `image-delivery-insight` de Lighthouse marcaba las portadas de
 * eventos sin comprimir y sin formato moderno). Si el navegador no soporta
 * la conversión (falta `createImageBitmap`/`canvas.toBlob`, o falla por
 * cualquier motivo), devuelve el archivo original sin tocar — nunca bloquea
 * la subida por una optimización que no se pudo aplicar.
 */
export async function convertirImagenAWebp(archivo: File): Promise<File> {
  if (!soportaConversionWebp()) {
    return archivo;
  }

  try {
    const bitmap = await createImageBitmap(archivo);
    const escala = Math.min(1, DIMENSION_MAXIMA_PX / Math.max(bitmap.width, bitmap.height));
    const ancho = Math.round(bitmap.width * escala);
    const alto = Math.round(bitmap.height * escala);

    const canvas = document.createElement('canvas');
    canvas.width = ancho;
    canvas.height = alto;
    const contexto = canvas.getContext('2d');
    if (!contexto) {
      return archivo;
    }
    contexto.drawImage(bitmap, 0, 0, ancho, alto);

    const blob = await new Promise<Blob | null>((resolver) =>
      canvas.toBlob(resolver, 'image/webp', CALIDAD_WEBP),
    );
    if (!blob) {
      return archivo;
    }

    const nombreSinExtension = archivo.name.replace(/\.[^./]+$/, '');
    return new File([blob], `${nombreSinExtension}.webp`, { type: 'image/webp' });
  } catch {
    return archivo;
  }
}

function soportaConversionWebp(): boolean {
  return (
    typeof createImageBitmap === 'function' &&
    typeof HTMLCanvasElement !== 'undefined' &&
    typeof HTMLCanvasElement.prototype.toBlob === 'function'
  );
}
