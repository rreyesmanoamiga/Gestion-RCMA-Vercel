import ExcelJS from 'exceljs';
import type { Actividad } from '@/pages/CalendarioMantenimiento';
import { calcularFechasEnMes } from '@/pages/CalendarioMantenimiento';
import { LOGO_MANO_AMIGA } from '@/lib/formatoInstitucional';

// ─── Colores institucionales (ARGB, requerido por exceljs) ─────────────────
const NAVY    = 'FF00295A';
const ORANGE  = 'FFED7102';
const SKY     = 'FF4F82C2';
const GREEN   = 'FF059669';
const RED_BG  = 'FFFEE2E2';
const RED_TX  = 'FFDC2626';
const GRAY_BG = 'FFF3F4F6';
const FUTURO_BG = 'FFEFF6FF';
const WHITE   = 'FFFFFFFF';

const MESES_ES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

function fechaISO(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getISOWeek(d: Date) {
  const dt = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = dt.getUTCDay() || 7;
  dt.setUTCDate(dt.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(dt.getUTCFullYear(), 0, 1));
  return Math.ceil((((dt.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

async function cargarLogoBuffer(): Promise<ArrayBuffer | null> {
  try {
    const res = await fetch('/logo.png');
    if (!res.ok) return null;
    return await res.arrayBuffer();
  } catch { return null; }
}

// ============================================================================
// REPORTE INDIVIDUAL (Excel) — un libro por año, una pestaña por mes,
// cuadrícula día por día agrupada visualmente por semana.
// ============================================================================
export async function generarReporteIndividualExcel(opts: {
  colegio: string;
  colegioNombre: string;
  territorio: string;
  año: number;
  todasActividades: Actividad[];
  actividadRef: (act: Actividad) => string;
  completionsSet: Set<string>; // key = `${colegio}|${fechaISO}|${actividadRef}`
}): Promise<Blob> {
  const { colegio, colegioNombre, territorio, año, todasActividades, actividadRef, completionsSet } = opts;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Sistema RCMA';
  wb.created = new Date();

  const logoBuffer = await cargarLogoBuffer();
  const logoId = logoBuffer ? wb.addImage({ buffer: logoBuffer as any, extension: 'png' }) : null;

  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const thinBorder = { style: 'thin' as const, color: { argb: 'FFD7DCE1' } };
  const borderAll = { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder };

  // ── Hoja de leyenda ──
  const wsL = wb.addWorksheet('Leyenda');
  wsL.views = [{ showGridLines: false }];
  wsL.getColumn(1).width = 4;
  wsL.getColumn(2).width = 55;
  if (logoId !== null) wsL.addImage(logoId, { tl: { col: 0, row: 0 }, ext: { width: 70, height: 42 } });
  wsL.getRow(1).height = 32;
  wsL.mergeCells('C1:E1');
  const tituloL = wsL.getCell('C1');
  tituloL.value = 'LEYENDA DEL REPORTE';
  tituloL.font = { bold: true, size: 13, color: { argb: NAVY }, name: 'Calibri' };
  tituloL.alignment = { vertical: 'middle' };
  wsL.mergeCells('A2:E2');
  wsL.getRow(2).height = 5;
  for (let c = 1; c <= 5; c++) wsL.getCell(2, c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ORANGE } };

  const leyendaFilas: [string, string][] = [
    [GREEN, '✓   Realizado ese día — marcado en el sistema'],
    [RED_BG, '✕   Debía realizarse ese día y no se marcó (vencido)'],
    [FUTURO_BG, '     Día futuro — todavía no corresponde marcarlo'],
    [GRAY_BG, '     No aplica ese día, según la frecuencia de la actividad'],
  ];
  let rr = 4;
  leyendaFilas.forEach(([color, texto]) => {
    const cA = wsL.getCell(rr, 1);
    cA.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: color } };
    cA.border = borderAll;
    const cB = wsL.getCell(rr, 2);
    cB.value = texto;
    cB.font = { size: 11, name: 'Calibri' };
    rr += 2;
  });
  wsL.getCell(rr + 1, 2).value = `Colegio: ${colegioNombre}   |   Territorio: ${territorio}   |   Año: ${año}`;
  wsL.getCell(rr + 1, 2).font = { italic: true, size: 10, color: { argb: 'FF6B7280' }, name: 'Calibri' };
  wsL.getCell(rr + 3, 2).value = 'Documento generado por Sistema RCMA.';
  wsL.getCell(rr + 3, 2).font = { italic: true, size: 9, color: { argb: 'FF9CA3AF' }, name: 'Calibri' };

  // ── Una hoja por mes ──
  for (let mes = 0; mes < 12; mes++) {
    const ws = wb.addWorksheet(`${MESES_ES[mes]} ${año}`);
    ws.properties.tabColor = { argb: ORANGE };
    const diasEnMes = new Date(año, mes + 1, 0).getDate();
    const fechas: Date[] = Array.from({ length: diasEnMes }, (_, i) => new Date(año, mes, i + 1));

    const COL_ACT = 1, COL_FREC = 2, COL_DIAS_INICIO = 3;
    ws.getColumn(COL_ACT).width = 34;
    ws.getColumn(COL_FREC).width = 11;
    for (let i = 0; i < fechas.length; i++) ws.getColumn(COL_DIAS_INICIO + i).width = 3.4;
    const ultimaCol = COL_DIAS_INICIO + fechas.length - 1;

    // Encabezado institucional
    ws.getRow(1).height = 34;
    ws.getRow(2).height = 20;
    ws.getRow(3).height = 6;
    if (logoId !== null) ws.addImage(logoId, { tl: { col: 0, row: 0 }, ext: { width: 70, height: 42 } });

    ws.mergeCells(1, 4, 1, ultimaCol);
    const t1 = ws.getCell(1, 4);
    t1.value = 'COLEGIOS MANO AMIGA  —  PROGRAMA DE MANTENIMIENTO';
    t1.font = { bold: true, size: 13, color: { argb: NAVY }, name: 'Calibri' };
    t1.alignment = { vertical: 'middle' };

    ws.mergeCells(2, 4, 2, ultimaCol);
    const t2 = ws.getCell(2, 4);
    t2.value = 'REPORTE INDIVIDUAL DIARIO / SEMANAL';
    t2.font = { bold: true, size: 10, color: { argb: ORANGE }, name: 'Calibri' };
    t2.alignment = { vertical: 'middle' };

    ws.mergeCells(3, 1, 3, ultimaCol);
    for (let c = 1; c <= ultimaCol; c++) ws.getCell(3, c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ORANGE } };

    ws.mergeCells(4, 1, 4, ultimaCol);
    const sub = ws.getCell(4, 1);
    sub.value = `Colegio: ${colegioNombre}   |   Territorio: ${territorio}   |   Periodo: ${MESES_ES[mes]} ${año}   |   Reporte General de Mantenimiento`;
    sub.font = { italic: true, size: 10, color: { argb: SKY }, name: 'Calibri' };
    sub.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F7FA' } };
    sub.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
    ws.getRow(4).height = 20;

    const filaSem = 6, filaDia = 7;
    ws.mergeCells(filaSem, COL_ACT, filaDia, COL_ACT);
    const actHdr = ws.getCell(filaSem, COL_ACT);
    actHdr.value = 'Actividad';
    actHdr.font = { bold: true, size: 10, color: { argb: WHITE }, name: 'Calibri' };
    actHdr.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
    actHdr.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };

    ws.mergeCells(filaSem, COL_FREC, filaDia, COL_FREC);
    const frecHdr = ws.getCell(filaSem, COL_FREC);
    frecHdr.value = 'Frecuencia';
    frecHdr.font = { bold: true, size: 10, color: { argb: WHITE }, name: 'Calibri' };
    frecHdr.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
    frecHdr.alignment = { horizontal: 'center', vertical: 'middle' };

    let semanaActual: number | null = null;
    let inicioSemanaCol = COL_DIAS_INICIO;
    let numSemana = 1;
    fechas.forEach((fecha, i) => {
      const col = COL_DIAS_INICIO + i;
      const semISO = getISOWeek(fecha);
      if (semanaActual === null) semanaActual = semISO;
      if (semISO !== semanaActual) {
        ws.mergeCells(filaSem, inicioSemanaCol, filaSem, col - 1);
        const cc = ws.getCell(filaSem, inicioSemanaCol);
        cc.value = `Semana ${numSemana}`;
        cc.font = { bold: true, size: 8, color: { argb: NAVY }, name: 'Calibri' };
        cc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEF3FA' } };
        cc.alignment = { horizontal: 'center', vertical: 'middle' };
        for (let cx = inicioSemanaCol; cx <= col - 1; cx++) ws.getCell(filaSem, cx).border = borderAll;
        inicioSemanaCol = col; semanaActual = semISO; numSemana++;
      }
      const dcell = ws.getCell(filaDia, col);
      dcell.value = fecha.getDate();
      dcell.font = { bold: true, size: 8, color: { argb: fecha.getDay() !== 0 ? NAVY : 'FF9CA3AF' }, name: 'Calibri' };
      dcell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEF3FA' } };
      dcell.alignment = { horizontal: 'center', vertical: 'middle' };
      dcell.border = borderAll;
    });
    ws.mergeCells(filaSem, inicioSemanaCol, filaSem, ultimaCol);
    const ccLast = ws.getCell(filaSem, inicioSemanaCol);
    ccLast.value = `Semana ${numSemana}`;
    ccLast.font = { bold: true, size: 8, color: { argb: NAVY }, name: 'Calibri' };
    ccLast.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEF3FA' } };
    ccLast.alignment = { horizontal: 'center', vertical: 'middle' };
    for (let cx = inicioSemanaCol; cx <= ultimaCol; cx++) ws.getCell(filaSem, cx).border = borderAll;

    ws.getRow(filaSem).height = 16;
    ws.getRow(filaDia).height = 16;

    // Filas de categorias y actividades (catálogo completo real, base + personalizadas)
    let fila = filaDia + 1;
    let catActual: string | null = null;
    todasActividades.forEach(act => {
      if (act.categoria !== catActual) {
        catActual = act.categoria;
        ws.mergeCells(fila, 1, fila, ultimaCol);
        const cc = ws.getCell(fila, 1);
        cc.value = act.categoria.toUpperCase();
        cc.font = { bold: true, size: 10, color: { argb: WHITE }, name: 'Calibri' };
        cc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ORANGE } };
        cc.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
        ws.getRow(fila).height = 18;
        fila++;
      }
      const c1 = ws.getCell(fila, COL_ACT);
      c1.value = act.actividad;
      c1.font = { size: 9, name: 'Calibri' };
      c1.border = borderAll;
      c1.alignment = { vertical: 'middle', indent: 1 };

      const c2 = ws.getCell(fila, COL_FREC);
      c2.value = act.frecuencia;
      c2.font = { size: 8.5, bold: true, color: { argb: SKY }, name: 'Calibri' };
      c2.border = borderAll;
      c2.alignment = { horizontal: 'center', vertical: 'middle' };

      const fechasActivasSet = new Set(calcularFechasEnMes(act, año, mes).map(fechaISO));

      fechas.forEach((fecha, i) => {
        const col = COL_DIAS_INICIO + i;
        const cell = ws.getCell(fila, col);
        cell.border = borderAll;
        if (!fechasActivasSet.has(fechaISO(fecha))) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GRAY_BG } };
          return;
        }
        if (fecha > hoy) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: FUTURO_BG } };
          return;
        }
        const key = `${colegio}|${fechaISO(fecha)}|${actividadRef(act)}`;
        const hecho = completionsSet.has(key);
        if (hecho) {
          cell.value = '✓';
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GREEN } };
          cell.font = { size: 8, bold: true, color: { argb: WHITE }, name: 'Calibri' };
        } else {
          cell.value = '✕';
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: RED_BG } };
          cell.font = { size: 8, bold: true, color: { argb: RED_TX }, name: 'Calibri' };
        }
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
      });
      fila++;
    });

    ws.views = [{ showGridLines: false, state: 'frozen', xSplit: COL_DIAS_INICIO - 1, ySplit: filaDia }];
  }


  const buffer = await wb.xlsx.writeBuffer();
  return new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

// ============================================================================
// Utilidades: descarga, folio, nombres y carpetas de OneDrive
// ============================================================================
export function descargarBlob(blob: Blob, nombre: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = nombre;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

/** Código corto del colegio para folios y archivos: "MA MTY" → "MTY" */
export const codigoCorto = (colegio: string) => colegio.replace(/^MA\s+/i, '').replace(/\s+/g, '');
/** Folio del reporte mensual: uno por colegio y mes (si se regenera, conserva el folio) */
export const folioMensualPC = (colegio: string, año: number, mes: number) => `PC-${codigoCorto(colegio)}-${año}-${String(mes + 1).padStart(2, '0')}`;
export const folioAnualPC = (colegio: string, año: number) => `PC-${codigoCorto(colegio)}-${año}`;
export const folioGeneralPC = (año: number) => `PC-GRAL-${año}`;
export const MESES_PC = MESES_ES;

/** Carpetas dentro de "Sistema RCMA Doc" */
export const CARPETA_PC = 'Protección Civil';
export const carpetaAnualPC = (colegioNombre: string, año: number) => `${CARPETA_PC}/${colegioNombre}/${año}`;
export const carpetaMensualPC = (colegioNombre: string, año: number, mes: number) =>
  `${carpetaAnualPC(colegioNombre, año)}/${String(mes + 1).padStart(2, '0')} ${MESES_ES[mes]}`;
export const carpetaGeneralPC = (año: number) => `${CARPETA_PC}/General/${año}`;

// ============================================================================
// Diseño institucional en PDF (mismo lenguaje visual que Ticket MAS y
// Solicitud de Proyecto: banda azul con franjas, tarjetas KPI, secciones con
// borde naranja, firmas en recuadro y pie azul). Vectorial, para poder
// guardarlo directo en OneDrive.
// ============================================================================
type Doc = InstanceType<typeof import('jspdf').jsPDF>;
type RGB = [number, number, number];
const C = {
  navy: [31, 78, 121] as RGB, navy2: [36, 89, 138] as RGB, orange: [232, 119, 34] as RGB, blue: [91, 135, 181] as RGB,
  rojo: [220, 38, 38] as RGB, verde: [5, 150, 105] as RGB, tinta: [30, 41, 59] as RGB, gris: [100, 116, 139] as RGB,
  linea: [226, 232, 240] as RGB, fondo: [241, 245, 249] as RGB, suave: [248, 250, 252] as RGB,
};
const fill = (d: Doc, c: RGB) => d.setFillColor(c[0], c[1], c[2]);
const draw = (d: Doc, c: RGB) => d.setDrawColor(c[0], c[1], c[2]);
const ink = (d: Doc, c: RGB) => d.setTextColor(c[0], c[1], c[2]);
const PIE = 'Colegios Mano Amiga — Juntos Transformando Vidas.';

async function loadJsPDF(): Promise<typeof import('jspdf').jsPDF> {
  const w = window as Window & { jspdf?: { jsPDF: typeof import('jspdf').jsPDF } };
  if (w.jspdf?.jsPDF) return w.jspdf.jsPDF;
  await new Promise<void>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('jsPDF load error'));
    document.head.appendChild(s);
  });
  return w.jspdf!.jsPDF;
}

/** Polígono relleno a partir de puntos absolutos */
function poligono(d: Doc, pts: [number, number][], c: RGB) {
  fill(d, c);
  const segs = pts.slice(1).map((p, i) => [p[0] - pts[i][0], p[1] - pts[i][1]]);
  d.lines(segs, pts[0][0], pts[0][1], [1, 1], 'F', true);
}

/** Banda superior con franjas diagonales y el logo en recuadro blanco. Devuelve el alto. */
function bandaInstitucional(d: Doc, W: number, op: { titulo: string; subtitulo: string; linea?: string; alto?: number }) {
  const H = op.alto ?? 30, s = H * 0.47; // inclinación de las franjas (≈115°)
  fill(d, C.navy); d.rect(0, 0, W, H, 'F');
  poligono(d, [[W * 0.62 + s, 0], [W, 0], [W, H], [W * 0.62, H]], C.navy2);
  poligono(d, [[W * 0.76 + s, 0], [W, 0], [W, H], [W * 0.76, H]], C.orange);
  const mx = 14;
  ink(d, [203, 213, 225]); d.setFont('helvetica', 'normal'); d.setFontSize(6.5);
  d.setCharSpace(0.9); d.text('RED DE COLEGIOS MANO AMIGA', mx, 9); d.setCharSpace(0);
  ink(d, [255, 255, 255]); d.setFont('helvetica', 'bold'); d.setFontSize(15);
  d.text(op.titulo, mx, 16.5);
  d.setFont('helvetica', 'normal'); d.setFontSize(7.6); ink(d, [226, 232, 240]);
  d.text(op.subtitulo, mx, 21.5, { maxWidth: W * 0.6 });
  if (op.linea) { d.setFontSize(7); ink(d, [255, 196, 150]); d.text(op.linea, mx, 26.5); }
  // Logo (420×128 px) en recuadro blanco
  const lh = 10.5, lw = lh * 420 / 128, bx = W - mx - lw - 6, by = (H - lh) / 2 - 3;
  fill(d, [255, 255, 255]); d.roundedRect(bx, by, lw + 6, lh + 4, 2.5, 2.5, 'F');
  try { d.addImage(LOGO_MANO_AMIGA, 'PNG', bx + 3, by + 2, lw, lh); } catch { /* sin logo */ }
  return H;
}

/** Banda delgada para páginas de continuación */
function bandaContinuacion(d: Doc, W: number, texto: string) {
  fill(d, C.navy); d.rect(0, 0, W, 11, 'F');
  poligono(d, [[W * 0.86 + 5, 0], [W, 0], [W, 11], [W * 0.86, 11]], C.orange);
  ink(d, [255, 255, 255]); d.setFont('helvetica', 'bold'); d.setFontSize(8.5);
  d.text(texto, 14, 7.2);
  return 11;
}

interface KpiPdf { etiqueta: string; valor: string; folio?: boolean; pill?: boolean; color?: RGB }
/** Tarjetas KPI flotando sobre el borde de la banda. Devuelve la Y final. */
function kpisInstitucional(d: Doc, W: number, y: number, kpis: KpiPdf[]) {
  const mx = 14, gap = 3.5, h = 14.5, w = (W - 2 * mx - gap * (kpis.length - 1)) / kpis.length;
  kpis.forEach((k, i) => {
    const x = mx + i * (w + gap);
    fill(d, [226, 232, 240]); d.roundedRect(x + 0.35, y + 0.6, w, h, 2.5, 2.5, 'F'); // sombra
    fill(d, i === 1 ? C.orange : C.navy); d.roundedRect(x, y, w, h, 2.5, 2.5, 'F');
    fill(d, [255, 255, 255]); d.roundedRect(x, y + 1.1, w, h - 1.1, 2.5, 2.5, 'F'); d.rect(x, y + 1.1, w, 3, 'F');
    d.setFont('helvetica', 'normal'); d.setFontSize(5.8); ink(d, C.gris);
    d.setCharSpace(0.5); d.text(k.etiqueta.toUpperCase(), x + 3.5, y + 6); d.setCharSpace(0);
    d.setFont('helvetica', 'bold'); d.setFontSize(10);
    if (k.pill) {
      const tw = d.getTextWidth(k.valor) + 6;
      fill(d, [253, 234, 219]); d.roundedRect(x + 3, y + 7.6, tw, 5, 2.5, 2.5, 'F');
      ink(d, [194, 65, 12]); d.setFontSize(9); d.text(k.valor, x + 6, y + 11.2);
    } else {
      ink(d, k.folio ? C.rojo : (k.color ?? C.navy));
      const txt = d.splitTextToSize(k.valor, w - 6)[0] as string;
      d.text(txt, x + 3.5, y + 11.6);
    }
  });
  return y + h + 5;
}

/** Encabezado de sección: fondo gris, barra naranja a la izquierda, título azul en mayúsculas */
function seccion(d: Doc, x: number, y: number, w: number, titulo: string, derecha?: string) {
  fill(d, C.fondo); d.rect(x, y, w, 6.5, 'F');
  fill(d, C.orange); d.rect(x, y, 1.3, 6.5, 'F');
  ink(d, C.navy); d.setFont('helvetica', 'bold'); d.setFontSize(7.6);
  d.setCharSpace(0.4); d.text(titulo.toUpperCase(), x + 4, y + 4.4); d.setCharSpace(0);
  if (derecha) { d.setFont('helvetica', 'normal'); d.setFontSize(6.6); ink(d, C.gris); d.text(derecha, x + w - 3, y + 4.4, { align: 'right' }); }
  return y + 6.5;
}

/** Marco redondeado de una tarjeta (se dibuja al final, sobre el contenido) */
function marcoTarjeta(d: Doc, x: number, y: number, w: number, h: number) {
  draw(d, C.linea); d.setLineWidth(0.3); d.roundedRect(x, y, w, h, 2.5, 2.5, 'S');
}

/** Rejilla de datos en N columnas (etiqueta pequeña gris + valor) */
function rejilla(d: Doc, x: number, y: number, w: number, pares: [string, string][], cols = 3) {
  const cw = w / cols, rh = 9.5;
  pares.forEach(([k, v], i) => {
    const cx = x + (i % cols) * cw, cy = y + Math.floor(i / cols) * rh;
    if (i >= cols) { draw(d, [238, 242, 247]); d.setLineWidth(0.2); d.line(cx, cy, cx + cw, cy); }
    d.setFont('helvetica', 'normal'); d.setFontSize(5.6); ink(d, C.gris);
    d.setCharSpace(0.35); d.text(k.toUpperCase(), cx + 4, cy + 3.6); d.setCharSpace(0);
    d.setFont('helvetica', 'bold'); d.setFontSize(7.6); ink(d, C.tinta);
    d.text((d.splitTextToSize(v || '—', cw - 7)[0] as string), cx + 4, cy + 7.6);
  });
  return y + Math.ceil(pares.length / cols) * rh;
}

/** Firmas en recuadros punteados */
function firmasInstitucional(d: Doc, x: number, y: number, w: number, firmas: { nombre: string; puesto: string }[]) {
  const gap = 4, fw = (w - gap * (firmas.length - 1)) / firmas.length, fh = 24;
  firmas.forEach((f, i) => {
    const fx = x + i * (fw + gap);
    draw(d, [203, 213, 225]); d.setLineWidth(0.3); d.setLineDashPattern([1.2, 1], 0);
    d.roundedRect(fx, y, fw, fh, 2.5, 2.5, 'S'); d.setLineDashPattern([], 0);
    draw(d, [148, 163, 184]); d.setLineWidth(0.25); d.line(fx + 5, y + 15, fx + fw - 5, y + 15);
    d.setFont('helvetica', 'bold'); d.setFontSize(6.8); ink(d, C.navy);
    d.text((d.splitTextToSize(f.nombre || 'Nombre y firma', fw - 6)[0] as string), fx + fw / 2, y + 18.6, { align: 'center' });
    d.setFont('helvetica', 'normal'); d.setFontSize(5.8); ink(d, C.gris);
    d.text((d.splitTextToSize(f.puesto, fw - 6)[0] as string), fx + fw / 2, y + 21.6, { align: 'center' });
  });
  return y + fh;
}

/** Pie azul en todas las páginas */
function pieInstitucional(d: Doc, referencia: string) {
  const n = d.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    d.setPage(i);
    const H = (d as any).internal.pageSize.getHeight(), W = (d as any).internal.pageSize.getWidth();
    fill(d, C.navy); d.rect(0, H - 9, W, 9, 'F');
    d.setFont('helvetica', 'italic'); d.setFontSize(7); ink(d, [255, 255, 255]);
    d.text(PIE, 14, H - 3.6);
    d.setFont('helvetica', 'normal'); ink(d, [203, 213, 225]);
    d.text(`${referencia} · Sistema RCMA · Página ${i} de ${n}`, W - 14, H - 3.6, { align: 'right' });
  }
}

const colorPct = (p: number): RGB => p >= 80 ? C.verde : p >= 40 ? C.orange : C.rojo;

// ============================================================================
// REPORTE GENERAL (PDF) — cumplimiento de todos los colegios, de menor a mayor
// ============================================================================
export interface CumplimientoColegioPC {
  colegio: string;
  colegioNombre: string;
  territorio: string;
  completadas: number;
  totalProgramado: number;
}
export async function generarReporteGeneralPDF(opts: {
  año: number;
  datos: CumplimientoColegioPC[]; // ya calculado por colegio, orden libre (se reordena aquí)
  elaboradoPor: string;
}): Promise<Blob> {
  const { año, datos, elaboradoPor } = opts;
  const jsPDFctor = await loadJsPDF();
  const doc = new jsPDFctor({ unit: 'mm', format: 'letter' }) as Doc;
  const W = (doc as any).internal.pageSize.getWidth(), H = (doc as any).internal.pageSize.getHeight();
  const mx = 14, ancho = W - 2 * mx;
  const folio = folioGeneralPC(año);
  const hoyStr = new Date().toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });

  const ordenados = [...datos].map(d => ({ ...d, pct: d.totalProgramado > 0 ? Math.round((d.completadas / d.totalProgramado) * 100) : 0 }))
    .sort((a, b) => a.pct - b.pct);
  const promedio = ordenados.length ? Math.round(ordenados.reduce((s, d) => s + d.pct, 0) / ordenados.length) : 0;
  const alDia = ordenados.filter(d => d.pct >= 80).length;
  const rezagados = ordenados.filter(d => d.pct < 40).length;

  const hBanda = bandaInstitucional(doc, W, {
    titulo: 'REPORTE GENERAL DE MANTENIMIENTO', subtitulo: 'Programa de Mantenimiento · Protección Civil · Cumplimiento por colegio',
    linea: `Periodo: 1 de enero – ${hoyStr}`, alto: 34,
  });
  let y = kpisInstitucional(doc, W, hBanda - 5, [
    { etiqueta: 'Folio', valor: folio, folio: true },
    { etiqueta: 'Cumplimiento promedio', valor: `${promedio}%`, pill: true },
    { etiqueta: 'Al día (80% o más)', valor: String(alDia), color: C.verde },
    { etiqueta: 'Rezagados (menos de 40%)', valor: String(rezagados), color: C.rojo },
  ]);

  let y0 = y;
  y = seccion(doc, mx, y, ancho, 'Datos del reporte');
  y = rejilla(doc, mx, y, ancho, [
    ['Alcance', `${ordenados.length} colegios a nivel nacional`], ['Elaborado por', elaboradoPor.split(' — ')[0]], ['Fecha de generación', hoyStr],
    ['Dirigido a', 'Lic. Ángel Eduardo Rodríguez Martínez'], ['Puesto', elaboradoPor.split(' — ')[1] ?? ''], ['Año', String(año)],
  ]);
  marcoTarjeta(doc, mx, y0, ancho, y - y0); y += 5;

  const cols = { colegio: mx + 4, territorio: mx + 66, act: mx + 96, barra: mx + 124, pct: W - mx - 4 };
  const encabezado = () => {
    fill(doc, [255, 255, 255]);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(5.8); ink(doc, C.gris); doc.setCharSpace(0.4);
    doc.text('COLEGIO', cols.colegio, y + 4.3); doc.text('TERRITORIO', cols.territorio, y + 4.3);
    doc.text('ACTIVIDADES', cols.act, y + 4.3); doc.text('AVANCE', cols.barra, y + 4.3); doc.text('%', cols.pct, y + 4.3, { align: 'right' });
    doc.setCharSpace(0);
    draw(doc, C.linea); doc.setLineWidth(0.25); doc.line(mx, y + 6.5, mx + ancho, y + 6.5);
    y += 6.5;
  };
  y0 = y;
  y = seccion(doc, mx, y, ancho, 'Cumplimiento por colegio', 'de menor a mayor avance');
  encabezado();
  ordenados.forEach((d, i) => {
    if (y > H - 22) {
      marcoTarjeta(doc, mx, y0, ancho, y - y0);
      doc.addPage(); y = bandaContinuacion(doc, W, `Reporte General de Mantenimiento ${año} · ${folio}`) + 6; y0 = y;
      y = seccion(doc, mx, y, ancho, 'Cumplimiento por colegio (continuación)'); encabezado();
    }
    if (i % 2 === 1) { fill(doc, C.suave); doc.rect(mx + 0.3, y, ancho - 0.6, 7, 'F'); }
    const col = colorPct(d.pct);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7.4); ink(doc, C.tinta); doc.text(d.colegioNombre, cols.colegio, y + 4.7);
    doc.setFont('helvetica', 'normal'); ink(doc, C.gris);
    doc.text(d.territorio === 'MEXICO' ? 'MÉXICO' : d.territorio, cols.territorio, y + 4.7);
    doc.text(`${d.completadas} / ${d.totalProgramado}`, cols.act, y + 4.7);
    const bw = cols.pct - 14 - cols.barra;
    fill(doc, [238, 242, 247]); doc.roundedRect(cols.barra, y + 2.6, bw, 2.4, 1.2, 1.2, 'F');
    if (d.pct > 0) { fill(doc, col); doc.roundedRect(cols.barra, y + 2.6, Math.max(2.4, bw * Math.min(1, d.pct / 100)), 2.4, 1.2, 1.2, 'F'); }
    doc.setFont('helvetica', 'bold'); ink(doc, col); doc.text(`${d.pct}%`, cols.pct, y + 4.7, { align: 'right' });
    y += 7;
  });
  marcoTarjeta(doc, mx, y0, ancho, y - y0);

  // Semáforo
  y += 4; doc.setFont('helvetica', 'normal'); doc.setFontSize(6.6);
  ([[C.verde, 'Al día: 80% o más'], [C.orange, 'En proceso: 40% a 79%'], [C.rojo, 'Rezagado: menos de 40%']] as [RGB, string][]).forEach(([c, t], i) => {
    const x = mx + i * 52; fill(doc, c); doc.roundedRect(x, y - 2.3, 2.6, 2.6, 0.6, 0.6, 'F'); ink(doc, C.gris); doc.text(t, x + 4, y);
  });

  pieInstitucional(doc, `Reporte General ${año} · ${folio}`);
  return doc.output('blob');
}

// ============================================================================
// REPORTE MENSUAL CON FIRMA (PDF) — un colegio y un mes, cuadrícula día por
// día, con folio y partida de firmas, para que el colegio lo firme y se
// entregue a Protección Civil (VoBo de licencia de funcionamiento).
// ============================================================================
export async function generarReporteIndividualPDFFirma(opts: {
  colegio: string;
  colegioNombre: string;
  nombreFiscal: string;
  direccionFiscal: string;
  territorio: string;
  año: number;
  mes: number; // 0-11
  todasActividades: Actividad[];
  actividadRef: (act: Actividad) => string;
  completionsSet: Set<string>; // key = `${colegio}|${fechaISO}|${actividadRef}`
  directorNombre: string;
  administradorNombre: string;
  elaboradoPor: string;
}): Promise<Blob> {
  const { colegio, colegioNombre, nombreFiscal, direccionFiscal, territorio, año, mes, todasActividades, actividadRef, completionsSet, directorNombre, administradorNombre, elaboradoPor } = opts;
  const jsPDFctor = await loadJsPDF();
  const doc = new jsPDFctor({ unit: 'mm', format: 'letter', orientation: 'landscape' }) as Doc;
  const W = (doc as any).internal.pageSize.getWidth(), H = (doc as any).internal.pageSize.getHeight();
  const mx = 14, ancho = W - 2 * mx;
  const folio = folioMensualPC(colegio, año, mes);
  const periodo = `${MESES_ES[mes]} ${año}`;

  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const diasEnMes = new Date(año, mes + 1, 0).getDate();
  const fechas: Date[] = Array.from({ length: diasEnMes }, (_, i) => new Date(año, mes, i + 1));

  // Cumplimiento del mes (programadas hasta hoy vs. realizadas)
  let programadas = 0, realizadas = 0;
  const activasPorAct = new Map<Actividad, Set<string>>();
  todasActividades.forEach(act => {
    const set = new Set(calcularFechasEnMes(act, año, mes).map(fechaISO)); activasPorAct.set(act, set);
    fechas.forEach(f => {
      if (!set.has(fechaISO(f)) || f > hoy) return;
      programadas++;
      if (completionsSet.has(`${colegio}|${fechaISO(f)}|${actividadRef(act)}`)) realizadas++;
    });
  });
  const pct = programadas ? Math.round((realizadas / programadas) * 100) : 0;

  const hBanda = bandaInstitucional(doc, W, {
    titulo: 'PROGRAMA DE MANTENIMIENTO — REPORTE MENSUAL',
    subtitulo: 'Programa de Mantenimiento de Edificios, locales, instalaciones y áreas en los centros de trabajo. Condiciones de seguridad.',
    linea: `Protección Civil · ${colegioNombre} · ${periodo}`, alto: 35,
  });
  let y = kpisInstitucional(doc, W, hBanda - 5, [
    { etiqueta: 'Folio', valor: folio, folio: true },
    { etiqueta: 'Periodo', valor: periodo, pill: true },
    { etiqueta: 'Colegio', valor: colegioNombre },
    { etiqueta: 'Cumplimiento del mes', valor: programadas ? `${pct}%  (${realizadas} de ${programadas})` : 'Sin actividades vencidas', color: programadas ? colorPct(pct) : C.gris },
  ]);

  // Datos del colegio
  let y0 = y;
  y = seccion(doc, mx, y, ancho, 'Datos del colegio');
  y = rejilla(doc, mx, y, ancho, [
    ['Nombre fiscal', nombreFiscal], ['Dirección fiscal', direccionFiscal], ['Territorio', territorio === 'MEXICO' ? 'MÉXICO' : territorio],
    ['Director(a)', directorNombre], ['Administrador(a)', administradorNombre], ['Fecha de emisión', new Date().toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })],
  ]);
  marcoTarjeta(doc, mx, y0, ancho, y - y0); y += 4;

  // Cuadrícula del mes
  const anchoAct = 62, anchoFrec = 15;
  const xAct = mx + 0.3, xFrec = xAct + anchoAct, xDia = xFrec + anchoFrec;
  const anchoDias = mx + ancho - 0.3 - xDia, anchoDia = anchoDias / diasEnMes;
  const filaAlto = 4.5;
  const dibujarEncabezadoTabla = () => {
    fill(doc, C.navy); doc.rect(xAct, y, mx + ancho - 0.3 - xAct, 6, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(6.2); ink(doc, [255, 255, 255]);
    doc.text('ACTIVIDAD', xAct + 3, y + 4); doc.text('FREC.', xFrec + anchoFrec / 2, y + 4, { align: 'center' });
    fechas.forEach((f, i) => {
      const finDe = f.getDay() === 0 || f.getDay() === 6;
      doc.setFontSize(5.4); ink(doc, finDe ? [255, 196, 150] : [255, 255, 255]);
      doc.text(String(f.getDate()), xDia + anchoDia * i + anchoDia / 2, y + 4, { align: 'center' });
    });
    y += 6;
  };
  y0 = y;
  y = seccion(doc, mx, y, ancho, `Programa de ${periodo}`, 'cumplimiento real registrado en el Sistema RCMA');
  dibujarEncabezadoTabla();

  let catActual: string | null = null;
  todasActividades.forEach(act => {
    if (y > H - 22) {
      marcoTarjeta(doc, mx, y0, ancho, y - y0);
      doc.addPage(); y = bandaContinuacion(doc, W, `${colegioNombre} · ${periodo} · ${folio}`) + 5; y0 = y;
      y = seccion(doc, mx, y, ancho, `Programa de ${periodo} (continuación)`); dibujarEncabezadoTabla();
    }
    if (act.categoria !== catActual) {
      catActual = act.categoria;
      fill(doc, [253, 241, 231]); doc.rect(xAct, y, mx + ancho - 0.3 - xAct, 4.8, 'F');
      fill(doc, C.orange); doc.rect(xAct, y, 1, 4.8, 'F');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(6.2); ink(doc, [194, 65, 12]);
      doc.text(act.categoria.toUpperCase(), xAct + 3, y + 3.4);
      y += 4.8;
    }
    draw(doc, [232, 236, 241]); doc.setLineWidth(0.15);
    doc.line(xAct, y + filaAlto, mx + ancho - 0.3, y + filaAlto);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(6); ink(doc, C.tinta);
    doc.text((doc.splitTextToSize(act.actividad, anchoAct - 4)[0] as string), xAct + 3, y + 3.1);
    doc.setFontSize(5.4); ink(doc, C.blue);
    doc.text(act.frecuencia, xFrec + anchoFrec / 2, y + 3.1, { align: 'center' });

    const activas = activasPorAct.get(act)!;
    fechas.forEach((fecha, i) => {
      const x = xDia + anchoDia * i, cx = x + anchoDia / 2, cy = y + filaAlto / 2;
      const r = Math.min(anchoDia, filaAlto) * 0.36;
      if (!activas.has(fechaISO(fecha))) {
        fill(doc, [203, 213, 225]); doc.circle(cx, cy, 0.25, 'F'); return;
      }
      if (fecha > hoy) {
        draw(doc, C.blue); doc.setLineWidth(0.25); doc.circle(cx, cy, r, 'S'); return;
      }
      const hecho = completionsSet.has(`${colegio}|${fechaISO(fecha)}|${actividadRef(act)}`);
      fill(doc, hecho ? C.verde : [254, 226, 226]); doc.circle(cx, cy, r, 'F');
      const s = r * 0.55;
      if (hecho) {
        draw(doc, [255, 255, 255]); doc.setLineWidth(0.3);
        doc.line(cx - s, cy, cx - s * 0.2, cy + s * 0.75); doc.line(cx - s * 0.2, cy + s * 0.75, cx + s, cy - s * 0.7);
      } else {
        draw(doc, C.rojo); doc.setLineWidth(0.3);
        doc.line(cx - s, cy - s, cx + s, cy + s); doc.line(cx - s, cy + s, cx + s, cy - s);
      }
    });
    y += filaAlto;
  });
  marcoTarjeta(doc, mx, y0, ancho, y - y0);

  // Simbología
  y += 4.5; doc.setFont('helvetica', 'normal'); doc.setFontSize(6.4);
  const ley: [string, (x: number) => void][] = [
    ['Realizada', x => { fill(doc, C.verde); doc.circle(x, y - 1, 1.2, 'F'); }],
    ['No realizada', x => { fill(doc, [254, 226, 226]); doc.circle(x, y - 1, 1.2, 'F'); draw(doc, C.rojo); doc.setLineWidth(0.25); doc.line(x - 0.6, y - 1.6, x + 0.6, y - 0.4); doc.line(x - 0.6, y - 0.4, x + 0.6, y - 1.6); }],
    ['Programada (por venir)', x => { draw(doc, C.blue); doc.setLineWidth(0.25); doc.circle(x, y - 1, 1.2, 'S'); }],
    ['No programada ese día', x => { fill(doc, [203, 213, 225]); doc.circle(x, y - 1, 0.4, 'F'); }],
  ];
  ley.forEach(([t, icono], i) => { const x = mx + 2 + i * 42; icono(x); ink(doc, C.gris); doc.text(t, x + 2.8, y); });

  // Firmas
  if (y + 36 > H - 12) { doc.addPage(); y = bandaContinuacion(doc, W, `${colegioNombre} · ${periodo} · ${folio}`) + 6; } else y += 5;
  y = seccion(doc, mx, y, ancho, 'Visto bueno y firmas') + 3;
  firmasInstitucional(doc, mx, y, ancho, [
    { nombre: elaboradoPor.split(' — ')[0], puesto: elaboradoPor.split(' — ')[1] ?? 'Coordinación de Obras y Mantenimiento' },
    { nombre: directorNombre || '', puesto: 'Director(a) del Colegio' },
    { nombre: administradorNombre || '', puesto: 'Administrador(a) del Colegio' },
    { nombre: '', puesto: 'Responsable de Mantenimiento' },
  ]);

  pieInstitucional(doc, `Reporte mensual ${folio}`);
  return doc.output('blob');
}
