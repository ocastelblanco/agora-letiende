import QRCode from 'qrcode';

/** Genera el QR de una URL en SVG (vectorial, ideal para impresión). */
export async function generarQrSvg(url: string): Promise<string> {
  return QRCode.toString(url, { type: 'svg' });
}

/** Genera el QR de una URL en PNG (raster). */
export async function generarQrPng(url: string): Promise<Buffer> {
  return QRCode.toBuffer(url, { type: 'png' });
}
