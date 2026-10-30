import PDFDocument from 'pdfkit';

/**
 * Generación del reporte de un evento en PDF (roadmap #21, resto) — módulo
 * puro: recibe datos ya resueltos y devuelve el `Buffer`, sin tocar
 * DynamoDB ni S3 (eso vive en `handlers/reportes.ts`).
 *
 * `pdfkit` con las fuentes estándar de PDF (Helvetica): no requiere archivos
 * de fuente y cubre tildes, ñ y ¿¡ (codificación WinAnsi). En el bundle de la
 * Lambda se usa su build `standalone` (alias en `server/bundle-lambdas.mjs`):
 * la versión normal lee sus métricas `.afm` del disco con `fs` y esbuild no
 * las incluye. La versión queda fija en 0.17.2: la 0.20 carga las fuentes con
 * importaciones dinámicas (`#standard-fonts/*`) que esbuild no resuelve.
 */

export interface FilaReporte {
  compraId: string;
  cliente: string;
  telefono: string;
  correo: string;
  fechaCompra: string;
  medioPago: string;
  valor: number;
  etapa: string;
  tipo: string;
  ingreso: string;
}

export interface ResumenEtapaPdf {
  nombre: string;
  vendidas: number;
  recaudado: number;
}

export interface DatosReportePdf {
  nombreEvento: string;
  fechaEvento: string;
  generadoEn: string;
  totalBoletas: number;
  ingresadas: number;
  totalRecaudado: number;
  porEtapa: ResumenEtapaPdf[];
  filas: FilaReporte[];
}

const COLOR_PRIMARIO = '#230C00';
const COLOR_SECUNDARIO = '#E8630A';
const COLOR_ZEBRA = '#FFF8F1';
const MARGEN = 36;
const ALTO_FILA = 18;
const TAMANO_TABLA = 7;

// Ancho de cada columna en puntos; suman 720 = 792 (carta apaisada) - 2 × 36.
const COLUMNAS: ReadonlyArray<{ titulo: string; ancho: number; alinear?: 'right' }> = [
  { titulo: 'ID', ancho: 46 },
  { titulo: 'Cliente', ancho: 96 },
  { titulo: 'Teléfono', ancho: 60 },
  { titulo: 'Correo', ancho: 112 },
  { titulo: 'Compra', ancho: 70 },
  { titulo: 'Medio de pago', ancho: 56 },
  { titulo: 'Valor', ancho: 50, alinear: 'right' },
  { titulo: 'Etapa', ancho: 92 },
  { titulo: 'Tipo de boleta', ancho: 60 },
  { titulo: 'Ingreso', ancho: 78 },
];

/** `$45.000` — mismo formato colombiano que el pipe `pvp` (`CLAUDE.md` §4). */
const formatoPesos = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 });
export function pesos(valor: number): string {
  return `$${formatoPesos.format(valor)}`;
}

/**
 * Los textos de clientes son entrada hostil (`CLAUDE.md` §5, A03): en un PDF
 * no se ejecutan, pero un carácter de control sí puede romper la maquetación
 * de una celda. Se descartan antes de dibujar.
 */
function textoSeguro(texto: string): string {
  // eslint-disable-next-line no-control-regex
  return texto.replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ');
}

export function generarReportePdf(datos: DatosReportePdf): Promise<Buffer> {
  return new Promise((resolver, rechazar) => {
    const documento = new PDFDocument({
      size: 'LETTER',
      layout: 'landscape',
      margin: MARGEN,
      bufferPages: true,
      info: { Title: `Reporte — ${textoSeguro(datos.nombreEvento)}`, Author: 'Ágora — Le Tiende' },
    });
    const trozos: Buffer[] = [];
    documento.on('data', (trozo: Buffer) => trozos.push(trozo));
    documento.on('end', () => resolver(Buffer.concat(trozos)));
    documento.on('error', rechazar);

    const anchoUtil = documento.page.width - MARGEN * 2;
    const limiteInferior = (): number => documento.page.height - MARGEN - 14;

    documento
      .fillColor(COLOR_PRIMARIO)
      .font('Helvetica-Bold')
      .fontSize(16)
      .text(textoSeguro(datos.nombreEvento), MARGEN, MARGEN, { width: anchoUtil });
    documento
      .font('Helvetica')
      .fontSize(9)
      .text(`Fecha del evento: ${datos.fechaEvento}   ·   Generado: ${datos.generadoEn} (hora de Bogotá)`, {
        width: anchoUtil,
      });
    documento.moveDown(0.8);

    documento.font('Helvetica-Bold').fontSize(10).fillColor(COLOR_SECUNDARIO).text('Resumen');
    documento.font('Helvetica').fontSize(9).fillColor(COLOR_PRIMARIO);
    documento.text(
      `Boletas: ${datos.totalBoletas}   ·   Ingresadas: ${datos.ingresadas}   ·   ` +
        `Faltan por ingresar: ${datos.totalBoletas - datos.ingresadas}   ·   Recaudado: ${pesos(datos.totalRecaudado)}`,
    );
    for (const etapa of datos.porEtapa) {
      documento.text(
        `${textoSeguro(etapa.nombre)}: ${etapa.vendidas} boletas · ${pesos(etapa.recaudado)}`,
        { indent: 10 },
      );
    }
    documento.moveDown(0.8);

    const dibujarEncabezado = (y: number): number => {
      let x = MARGEN;
      documento.rect(MARGEN, y, anchoUtil, ALTO_FILA).fill(COLOR_PRIMARIO);
      documento.fillColor('#FFE7B3').font('Helvetica-Bold').fontSize(TAMANO_TABLA);
      for (const columna of COLUMNAS) {
        documento.text(columna.titulo, x + 3, y + 5, {
          width: columna.ancho - 6,
          align: columna.alinear ?? 'left',
          lineBreak: false,
        });
        x += columna.ancho;
      }
      return y + ALTO_FILA;
    };

    // Una celda nunca se parte en dos líneas: se recorta con «…» según el
    // ancho real medido con la fuente activa (`ellipsis` de pdfkit no aplica
    // con `lineBreak: false`, y sin recortar el texto se monta sobre la fila
    // siguiente).
    const recortar = (texto: string, ancho: number): string => {
      if (documento.widthOfString(texto) <= ancho) {
        return texto;
      }
      let recortado = texto;
      while (recortado.length > 1 && documento.widthOfString(`${recortado}…`) > ancho) {
        recortado = recortado.slice(0, -1);
      }
      return `${recortado}…`;
    };

    let y = dibujarEncabezado(documento.y);
    datos.filas.forEach((fila, indice) => {
      if (y + ALTO_FILA > limiteInferior()) {
        documento.addPage();
        y = dibujarEncabezado(MARGEN);
      }
      if (indice % 2 === 1) {
        documento.rect(MARGEN, y, anchoUtil, ALTO_FILA).fill(COLOR_ZEBRA);
      }
      const celdas = [
        fila.compraId.slice(0, 8),
        fila.cliente,
        fila.telefono,
        fila.correo,
        fila.fechaCompra,
        fila.medioPago,
        pesos(fila.valor),
        fila.etapa,
        fila.tipo,
        fila.ingreso || '—',
      ];
      let x = MARGEN;
      documento.fillColor(COLOR_PRIMARIO).font('Helvetica').fontSize(TAMANO_TABLA);
      COLUMNAS.forEach((columna, posicion) => {
        documento.text(recortar(textoSeguro(celdas[posicion] ?? ''), columna.ancho - 6), x + 3, y + 5, {
          width: columna.ancho - 6,
          align: columna.alinear ?? 'left',
          lineBreak: false,
        });
        x += columna.ancho;
      });
      y += ALTO_FILA;
    });

    if (datos.filas.length === 0) {
      documento.fillColor(COLOR_PRIMARIO).font('Helvetica').fontSize(9).text('Este evento aún no tiene boletas.', MARGEN, y + 8);
    }

    // Pie con numeración — requiere `bufferPages` para volver a cada página.
    const paginas = documento.bufferedPageRange();
    for (let i = 0; i < paginas.count; i++) {
      documento.switchToPage(paginas.start + i);
      // Sin margen inferior, o pdfkit abre una página nueva al escribir el
      // pie dentro de la franja reservada del margen.
      documento.page.margins.bottom = 0;
      documento
        .fillColor(COLOR_PRIMARIO)
        .font('Helvetica')
        .fontSize(7)
        .text(`Página ${i + 1} de ${paginas.count}`, MARGEN, documento.page.height - MARGEN + 6, {
          width: anchoUtil,
          align: 'right',
          lineBreak: false,
        });
    }

    documento.end();
  });
}
