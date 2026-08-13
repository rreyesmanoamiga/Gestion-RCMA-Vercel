import ExcelJS from 'exceljs';
import type { Actividad } from '@/pages/CalendarioMantenimiento';
import { calcularFechasEnMes } from '@/pages/CalendarioMantenimiento';

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
}) {
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
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Reporte_Individual_${colegio.replace(/\s+/g, '_')}_${año}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ============================================================================
// REPORTE GENERAL (PDF) — cumplimiento de todos los colegios, ordenado de
// menor a mayor, con KPIs arriba.
// ============================================================================
type Doc = InstanceType<typeof import('jspdf').jsPDF>;

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

async function pdfHeaderPC(doc: Doc, W: number, subtitle: string) {
  doc.setFillColor(0, 41, 90); doc.rect(0, 0, W, 28, 'F');
  doc.setFillColor(237, 113, 2); doc.rect(0, 28, W, 1.2, 'F');
  doc.setFontSize(14); doc.setFont('helvetica', 'bold'); doc.setTextColor(255, 255, 255);
  doc.text('COLEGIOS MANO AMIGA — PROGRAMA DE MANTENIMIENTO', 34, 12);
  doc.setFontSize(9.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(255, 170, 110);
  doc.text('REPORTE GENERAL DE MANTENIMIENTO', 34, 19);
  doc.setFontSize(8); doc.setTextColor(190, 200, 220);
  doc.text(subtitle, 34, 25);
  try {
    const logoImg = await new Promise<string>((res, rej) => {
      const img = new Image(); img.crossOrigin = 'anonymous';
      img.onload = () => { const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; c.getContext('2d')!.drawImage(img, 0, 0); res(c.toDataURL('image/png')); };
      img.onerror = rej; img.src = '/logo.png';
    });
    doc.addImage(logoImg, 'PNG', 6, 3, 22, 22);
  } catch { /* sin logo */ }
}

function pdfFooterPC(doc: Doc) {
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    const pH = (doc as any).internal.pageSize.getHeight();
    const pW = (doc as any).internal.pageSize.getWidth();
    doc.setDrawColor(237, 113, 2); doc.setLineWidth(0.6); doc.line(20, pH - 12, pW - 20, pH - 12);
    doc.setFontSize(8); doc.setFont('helvetica', 'italic'); doc.setTextColor(79, 130, 194);
    doc.text('Colegios Mano Amiga — Juntos Transformando Vidas', 20, pH - 7);
    doc.setTextColor(140, 140, 150);
    doc.text('Página ' + i + ' de ' + pages, pW - 20, pH - 7, { align: 'right' });
  }
}

export interface CumplimientoColegioPC {
  colegio: string;
  colegioNombre: string;
  territorio: string;
  completadas: number;
  totalProgramado: number;
}

export async function generarReporteGeneralPDF(opts: {
  año: number;
  datos: CumplimientoColegioPC[]; // ya calculado por colegio, orden libre (se reordena aca)
  elaboradoPor: string;
}) {
  const { año, datos, elaboradoPor } = opts;
  const jsPDFctor = await loadJsPDF();
  const doc = new jsPDFctor({ unit: 'mm', format: 'letter' }) as Doc;
  const W = (doc as any).internal.pageSize.getWidth();

  const hoyStr = new Date().toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });
  await pdfHeaderPC(doc, W, `Periodo: 1 de enero – ${hoyStr}`);

  let y = 40;
  doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(30, 41, 59);
  doc.text(`Alcance: ${datos.length} colegios a nivel nacional`, 20, y);
  doc.text(`Elaborado por: ${elaboradoPor}`, 20, y + 5);
  doc.text(`Dirigido a: Lic. Ángel Eduardo Rodríguez Martínez`, 20, y + 10);
  doc.text(`Fecha de generación: ${hoyStr}`, W - 20, y, { align: 'right' });
  y += 20;

  const ordenados = [...datos].map(d => ({
    ...d,
    pct: d.totalProgramado > 0 ? Math.round((d.completadas / d.totalProgramado) * 100) : 0,
  })).sort((a, b) => a.pct - b.pct);

  const promedio = ordenados.length > 0 ? Math.round(ordenados.reduce((s, d) => s + d.pct, 0) / ordenados.length) : 0;
  const alDia = ordenados.filter(d => d.pct >= 80).length;
  const rezagados = ordenados.filter(d => d.pct < 40).length;

  const kpis: [string, string][] = [
    [String(ordenados.length), 'Colegios evaluados'],
    [`${promedio}%`, 'Cumplimiento promedio'],
    [String(alDia), 'Al día (≥80%)'],
    [String(rezagados), 'Rezagados (<40%)'],
  ];
  const kpiW = (W - 40 - 3 * 4) / 4;
  kpis.forEach(([num, label], i) => {
    const x = 20 + i * (kpiW + 4);
    doc.setDrawColor(215, 220, 225); doc.setLineWidth(0.3);
    doc.roundedRect(x, y, kpiW, 20, 2, 2, 'S');
    doc.setFontSize(16); doc.setFont('helvetica', 'bold');
    doc.setTextColor(i === 3 ? 220 : 0, i === 3 ? 38 : 41, i === 3 ? 38 : 90);
    doc.text(num, x + kpiW / 2, y + 10, { align: 'center' });
    doc.setFontSize(6.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(107, 114, 128);
    doc.text(label.toUpperCase(), x + kpiW / 2, y + 16, { align: 'center' });
  });
  y += 30;

  doc.setFillColor(0, 41, 90); doc.rect(20, y, W - 40, 7, 'F');
  doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(255, 255, 255);
  doc.text('CUMPLIMIENTO POR COLEGIO', 23, y + 5);
  y += 7;

  const colX = { colegio: 23, territorio: 90, act: 120, barra: 150, pct: W - 25 };
  doc.setFontSize(7); doc.setTextColor(0, 41, 90); doc.setFont('helvetica', 'bold');
  doc.text('COLEGIO', colX.colegio, y + 5);
  doc.text('TERRITORIO', colX.territorio, y + 5);
  doc.text('ACTIVIDADES', colX.act, y + 5);
  doc.text('AVANCE', colX.barra, y + 5);
  doc.text('%', colX.pct, y + 5, { align: 'right' });
  doc.setFillColor(238, 243, 250); doc.rect(20, y, W - 40, 7, 'F');
  y += 7;

  ordenados.forEach((d, i) => {
    if (y > 250) { doc.addPage(); y = 20; }
    if (i % 2 === 0) { doc.setFillColor(250, 251, 252); doc.rect(20, y, W - 40, 7, 'F'); }
    doc.setFontSize(7.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(30, 41, 59);
    doc.text(d.colegioNombre, colX.colegio, y + 5);
    doc.text(d.territorio, colX.territorio, y + 5);
    doc.text(`${d.completadas} / ${d.totalProgramado}`, colX.act, y + 5);

    const barraW = 25, barraH = 2.2;
    doc.setFillColor(238, 240, 242); doc.rect(colX.barra, y + 3, barraW, barraH, 'F');
    const color = d.pct < 40 ? [220, 38, 38] : d.pct < 60 ? [237, 113, 2] : d.pct < 80 ? [237, 113, 2] : [5, 150, 105];
    doc.setFillColor(color[0], color[1], color[2]);
    doc.rect(colX.barra, y + 3, barraW * (d.pct / 100), barraH, 'F');

    doc.setFont('helvetica', 'bold'); doc.setTextColor(color[0], color[1], color[2]);
    doc.text(`${d.pct}%`, colX.pct, y + 5, { align: 'right' });
    y += 7;
  });

  pdfFooterPC(doc);
  doc.save(`Reporte_General_ProteccionCivil_${año}.pdf`);
}
