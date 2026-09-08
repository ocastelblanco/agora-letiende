import { convertirImagenAWebp } from './convertir-imagen-webp';

describe('convertirImagenAWebp', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('devuelve el archivo original si el navegador no soporta createImageBitmap/toBlob', async () => {
    const archivo = new File(['contenido'], 'afiche.png', { type: 'image/png' });

    const resultado = await convertirImagenAWebp(archivo);

    expect(resultado).toBe(archivo);
  });

  it('convierte a WEBP cuando el navegador sí soporta la conversión', async () => {
    const archivo = new File(['contenido'], 'afiche.png', { type: 'image/png' });
    const blobConvertido = new Blob(['webp-falso'], { type: 'image/webp' });

    vi.stubGlobal(
      'createImageBitmap',
      vi.fn().mockResolvedValue({ width: 3200, height: 1600, close: () => {} }),
    );
    const contextoFalso = { drawImage: vi.fn() } as unknown as CanvasRenderingContext2D;
    const toBlobSpy = vi
      .spyOn(HTMLCanvasElement.prototype, 'toBlob')
      .mockImplementation(function (this: HTMLCanvasElement, callback) {
        callback(blobConvertido);
      });
    const getContextSpy = vi
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockReturnValue(contextoFalso);

    const resultado = await convertirImagenAWebp(archivo);

    expect(resultado.type).toBe('image/webp');
    expect(resultado.name).toBe('afiche.webp');
    expect(toBlobSpy).toHaveBeenCalledWith(expect.any(Function), 'image/webp', 0.82);
    expect(contextoFalso.drawImage).toHaveBeenCalledWith(
      expect.anything(),
      0,
      0,
      1600, // reducido desde 3200, respetando el lado máximo de 1600px
      800,
    );

    getContextSpy.mockRestore();
    toBlobSpy.mockRestore();
  });

  it('devuelve el archivo original si canvas.toBlob no produce un blob', async () => {
    const archivo = new File(['contenido'], 'afiche.jpg', { type: 'image/jpeg' });

    vi.stubGlobal(
      'createImageBitmap',
      vi.fn().mockResolvedValue({ width: 800, height: 600, close: () => {} }),
    );
    const contextoFalso = { drawImage: vi.fn() } as unknown as CanvasRenderingContext2D;
    const toBlobSpy = vi
      .spyOn(HTMLCanvasElement.prototype, 'toBlob')
      .mockImplementation(function (this: HTMLCanvasElement, callback) {
        callback(null);
      });
    const getContextSpy = vi
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockReturnValue(contextoFalso);

    const resultado = await convertirImagenAWebp(archivo);

    expect(resultado).toBe(archivo);

    getContextSpy.mockRestore();
    toBlobSpy.mockRestore();
  });
});
