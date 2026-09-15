import ExcelJS from 'exceljs';

// ─── Colores institucionales (mismos que el resto del sistema) ────────────
const NAVY   = 'FF00295A';
const ORANGE = 'FFED7102';
const SKY    = 'FF4F82C2';
const GREEN  = 'FF059669';
const RED    = 'FFDC2626';
const AMBER  = 'FFD97706';
const WHITE  = 'FFFFFFFF';

export interface ProyectoReporte {
  id: string;
  name?: string;
  colegio?: string;
  territorio?: string;
  budget?: number;
  costo_real?: number | null;
  año: number;
}

const fmtMXNNum = (n: number) => `$${n.toLocaleString('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

function anchoColumna(header: string, valores: string[]): number {
  const masLargo = Math.max(header.length, ...valores.map(v => v.length), 0);
  return Math.min(Math.max(masLargo + 3, 10), 45);
}

async function cargarLogoBuffer(): Promise<ArrayBuffer | null> {
  try {
    const res = await fetch('/logo.png');
    if (!res.ok) return null;
    return await res.arrayBuffer();
  } catch { return null; }
}

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

type Doc = InstanceType<typeof import('jspdf').jsPDF>;

async function pdfHeader(doc: Doc, W: number, subtitle: string) {
  doc.setFillColor(0, 41, 90); doc.rect(0, 0, W, 28, 'F');
  doc.setFillColor(237, 113, 2); doc.rect(0, 28, W, 1.2, 'F');
  doc.setFontSize(14); doc.setFont('helvetica', 'bold'); doc.setTextColor(255, 255, 255);
  doc.text('COLEGIOS MANO AMIGA — PRESUPUESTO VS COSTO REAL', 34, 12);
  doc.setFontSize(9.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(255, 170, 110);
  doc.text('COORDINACIÓN DE OBRAS Y MANTENIMIENTO', 34, 19);
  doc.setFontSize(8); doc.setTextColor(190, 200, 220);
  doc.text(subtitle, 34, 25);
  try {
    const logoImg = await new Promise<string>((res, rej) => {
      const img = new Image(); img.crossOrigin = 'anonymous';
      img.onload = () => { const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; c.getContext('2d')!.drawImage(img, 0, 0); res(c.toDataURL('image/png')); };
      img.onerror = rej; img.src = '/logo.png';
    });
    doc.addImage(logoImg, 'PNG', 6, 6, 26.7, 16);
  } catch { /* sin logo */ }
}

function pdfFooter(doc: Doc) {
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

// ============================================================================
// PDF EJECUTIVO — KPIs + ranking de colegios por sobrecosto, con el alcance
// (Global / por colegio, Todos los años / año específico) que se le pase.
// ============================================================================
export async function generarPDFPresupuesto(opts: {
  proyectos: ProyectoReporte[]; elaboradoPor: string; alcanceLabel: string;
}) {
  const { proyectos, elaboradoPor, alcanceLabel } = opts;
  const jsPDFctor = await loadJsPDF();
  const doc = new jsPDFctor({ unit: 'mm', format: 'letter' }) as Doc;
  const W = (doc as any).internal.pageSize.getWidth();

  const hoyStr = new Date().toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });
  await pdfHeader(doc, W, `Reporte de presupuesto · ${hoyStr}`);

  let y = 40;
  doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(30, 41, 59);
  doc.text(`Alcance: ${alcanceLabel}`, 20, y);
  doc.text(`Elaborado por: ${elaboradoPor}`, 20, y + 5);
  y += 14;

  const conReal = proyectos.filter(p => p.costo_real != null && p.costo_real > 0);
  const totalPresupuesto = proyectos.reduce((s, p) => s + (p.budget ?? 0), 0);
  const totalReal = conReal.reduce((s, p) => s + (p.costo_real ?? 0), 0);
  const diferencia = totalReal - totalPresupuesto;
  const sobrecostos = conReal.filter(p => (p.costo_real ?? 0) > (p.budget ?? 0)).length;

  const kpis: [string, string][] = [
    [String(proyectos.length), 'Proyectos'],
    [fmtMXNNum(totalPresupuesto), 'Presupuestado'],
    [fmtMXNNum(totalReal), 'Costo real'],
    [`${diferencia >= 0 ? '+' : ''}${fmtMXNNum(diferencia)}`, diferencia >= 0 ? 'Sobrecosto total' : 'Ahorro total'],
    [String(sobrecostos), 'Con sobrecosto'],
  ];
  const kpiW = (W - 40 - 4 * 4) / 5;
  kpis.forEach(([num, label], i) => {
    const x = 20 + i * (kpiW + 4);
    doc.setDrawColor(215, 220, 225); doc.setLineWidth(0.3);
    doc.roundedRect(x, y, kpiW, 20, 2, 2, 'S');
    doc.setFontSize(11); doc.setFont('helvetica', 'bold');
    doc.setTextColor(i === 3 ? (diferencia >= 0 ? 220 : 5) : 0, i === 3 ? (diferencia >= 0 ? 38 : 150) : 41, i === 3 ? (diferencia >= 0 ? 38 : 105) : 90);
    doc.text(num, x + kpiW / 2, y + 9, { align: 'center' });
    doc.setFontSize(6.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(100, 116, 139);
    doc.text(label.toUpperCase(), x + kpiW / 2, y + 15, { align: 'center', maxWidth: kpiW - 4 });
  });
  y += 30;

  // ── Ranking por colegio ────────────────────────────────────────────────
  const porColegio = new Map<string, { presupuesto: number; real: number; proyectos: number }>();
  proyectos.forEach(p => {
    const key = p.colegio ?? 'Sin colegio';
    const cur = porColegio.get(key) ?? { presupuesto: 0, real: 0, proyectos: 0 };
    cur.presupuesto += p.budget ?? 0;
    cur.real += p.costo_real ?? 0;
    cur.proyectos++;
    porColegio.set(key, cur);
  });
  const ordenados = Array.from(porColegio.entries())
    .map(([colegio, s]) => ({ colegio, ...s, diff: s.real - s.presupuesto }))
    .sort((a, b) => b.diff - a.diff);

  doc.setFillColor(0, 41, 90); doc.rect(20, y, W - 40, 7, 'F');
  doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(255, 255, 255);
  doc.text('POR COLEGIO', 23, y + 5);
  y += 7;

  const colX = { colegio: 25, proyectos: 90, presupuesto: 115, real: 150, diff: W - 25 };
  doc.setFillColor(238, 243, 250); doc.rect(20, y, W - 40, 6, 'F');
  doc.setFontSize(7); doc.setTextColor(0, 41, 90); doc.setFont('helvetica', 'bold');
  doc.text('COLEGIO', colX.colegio, y + 4.2);
  doc.text('PROY.', colX.proyectos, y + 4.2);
  doc.text('PRESUPUESTO', colX.presupuesto, y + 4.2);
  doc.text('COSTO REAL', colX.real, y + 4.2);
  doc.text('DIFERENCIA', colX.diff, y + 4.2, { align: 'right' });
  y += 6;

  ordenados.forEach((c, i) => {
    if (y > 250) { doc.addPage(); y = 20; }
    if (i % 2 === 0) { doc.setFillColor(250, 251, 252); doc.rect(20, y, W - 40, 7, 'F'); }
    doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.setTextColor(30, 41, 59);
    doc.text(c.colegio, colX.colegio, y + 5, { maxWidth: 62 });
    doc.setFont('helvetica', 'normal');
    doc.text(String(c.proyectos), colX.proyectos, y + 5);
    doc.text(fmtMXNNum(c.presupuesto), colX.presupuesto, y + 5);
    doc.text(fmtMXNNum(c.real), colX.real, y + 5);
    const color = c.diff > 0 ? [220, 38, 38] : c.diff < 0 ? [5, 150, 105] : [100, 116, 139];
    doc.setFont('helvetica', 'bold'); doc.setTextColor(color[0], color[1], color[2]);
    doc.text(`${c.diff >= 0 ? '+' : ''}${fmtMXNNum(c.diff)}`, colX.diff, y + 5, { align: 'right' });
    y += 7;
  });

  pdfFooter(doc);
  doc.save(`Presupuesto_vs_Real_${new Date().toISOString().slice(0, 10)}.pdf`);
}

// ============================================================================
// EXCEL DE RESPALDO — Resumen por colegio + Detalle por proyecto, como
// tablas nativas de Excel (con filtros), con el alcance que se le pase.
// ============================================================================
export async function generarExcelPresupuesto(opts: { proyectos: ProyectoReporte[]; alcanceLabel: string }) {
  const { proyectos, alcanceLabel } = opts;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Sistema RCMA';
  wb.created = new Date();

  const logoBuffer = await cargarLogoBuffer();
  const logoId = logoBuffer ? wb.addImage({ buffer: logoBuffer as any, extension: 'png' }) : null;
  const generadoStr = new Date().toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });

  const encabezado = (ws: ExcelJS.Worksheet, titulo: string, subtitulo: string, ultimaCol: number) => {
    const colsHeader = Math.max(ultimaCol, 10);
    ws.getRow(1).height = 34; ws.getRow(2).height = 20; ws.getRow(3).height = 6;
    if (logoId !== null) ws.addImage(logoId, { tl: { col: 0, row: 0 }, ext: { width: 70, height: 42 } });

    ws.mergeCells(1, 4, 1, colsHeader);
    const t1 = ws.getCell(1, 4);
    t1.value = 'COLEGIOS MANO AMIGA — PRESUPUESTO VS COSTO REAL';
    t1.font = { bold: true, size: 13, color: { argb: NAVY }, name: 'Calibri' }; t1.alignment = { vertical: 'middle' };

    ws.mergeCells(2, 4, 2, colsHeader);
    const t2 = ws.getCell(2, 4);
    t2.value = titulo;
    t2.font = { bold: true, size: 10, color: { argb: ORANGE }, name: 'Calibri' }; t2.alignment = { vertical: 'middle' };

    ws.mergeCells(3, 1, 3, colsHeader);
    for (let c = 1; c <= colsHeader; c++) ws.getCell(3, c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ORANGE } };

    ws.mergeCells(4, 1, 4, colsHeader);
    const sub = ws.getCell(4, 1);
    sub.value = subtitulo;
    sub.font = { italic: true, size: 10, color: { argb: SKY }, name: 'Calibri' };
    sub.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F7FA' } };
    sub.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
    ws.getRow(4).height = 20;
  };

  const FILA_TABLA = 6;

  // ── Resumen por colegio ────────────────────────────────────────────────
  const wsR = wb.addWorksheet('Resumen');
  wsR.views = [{ showGridLines: false }];
  const porColegio = new Map<string, { presupuesto: number; real: number; proyectos: number }>();
  proyectos.forEach(p => {
    const key = p.colegio ?? 'Sin colegio';
    const cur = porColegio.get(key) ?? { presupuesto: 0, real: 0, proyectos: 0 };
    cur.presupuesto += p.budget ?? 0;
    cur.real += p.costo_real ?? 0;
    cur.proyectos++;
    porColegio.set(key, cur);
  });
  const filasResumen = Array.from(porColegio.entries())
    .map(([colegio, s]) => ({ colegio, ...s, diferencia: s.real - s.presupuesto }))
    .sort((a, b) => b.diferencia - a.diferencia);

  encabezado(wsR, 'RESUMEN POR COLEGIO', `Generado: ${generadoStr}   |   ${alcanceLabel}   |   ${filasResumen.length} colegios`, 6);
  wsR.addTable({
    name: 'ResumenPresupuesto', ref: `A${FILA_TABLA}`, headerRow: true,
    style: { theme: 'TableStyleMedium2', showRowStripes: true },
    columns: [
      { name: 'Colegio', filterButton: true }, { name: 'Proyectos', filterButton: true },
      { name: 'Presupuestado', filterButton: true }, { name: 'Costo Real', filterButton: true },
      { name: 'Diferencia', filterButton: true },
    ],
    rows: filasResumen.map(f => [f.colegio, f.proyectos, f.presupuesto, f.real, f.diferencia]),
  });
  for (let c = 1; c <= 5; c++) {
    const cell = wsR.getCell(FILA_TABLA, c);
    cell.font = { bold: true, size: 10, color: { argb: WHITE }, name: 'Calibri' };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
  }
  filasResumen.forEach((f, i) => {
    const fr = FILA_TABLA + 1 + i;
    for (let c = 1; c <= 5; c++) {
      const cell = wsR.getCell(fr, c);
      if (c >= 3) cell.numFmt = '$#,##0';
      cell.font = { size: 10, name: 'Calibri', color: { argb: c === 5 ? (f.diferencia > 0 ? RED : f.diferencia < 0 ? GREEN : '1E293B') : 'FF1E293B' }, bold: c === 5 };
    }
  });
  const anchoColegioR = anchoColumna('Colegio', filasResumen.map(f => f.colegio));
  [anchoColegioR, 12, 16, 16, 16].forEach((w, i) => { wsR.getColumn(i + 1).width = w; });

  // ── Detalle por proyecto ───────────────────────────────────────────────
  const wsD = wb.addWorksheet('Detalle');
  wsD.views = [{ showGridLines: false, state: 'frozen', ySplit: FILA_TABLA }];
  const ordenadosDetalle = [...proyectos].sort((a, b) => (a.colegio ?? '').localeCompare(b.colegio ?? '') || (b.año - a.año));
  const headersD = ['Colegio', 'Territorio', 'Año', 'Proyecto', 'Presupuesto', 'Costo Real', 'Diferencia', '% Variación'];
  encabezado(wsD, 'DETALLE POR PROYECTO', `Generado: ${generadoStr}   |   ${alcanceLabel}   |   ${ordenadosDetalle.length} proyectos`, headersD.length);
  wsD.addTable({
    name: 'DetallePresupuesto', ref: `A${FILA_TABLA}`, headerRow: true,
    style: { theme: 'TableStyleMedium2', showRowStripes: true },
    columns: headersD.map(h => ({ name: h, filterButton: true })),
    rows: ordenadosDetalle.map(p => {
      const tieneReal = p.costo_real != null && p.costo_real > 0;
      const diff = tieneReal ? (p.costo_real! - (p.budget ?? 0)) : null;
      const pct = tieneReal && p.budget ? Math.round((diff! / p.budget) * 100) : null;
      return [
        p.colegio ?? '—', p.territorio ?? '—', p.año, p.name ?? 'Sin nombre',
        p.budget ?? 0, tieneReal ? p.costo_real : null, diff, pct !== null ? `${pct}%` : '—',
      ];
    }),
  });
  for (let c = 1; c <= headersD.length; c++) {
    const cell = wsD.getCell(FILA_TABLA, c);
    cell.font = { bold: true, size: 9, color: { argb: WHITE }, name: 'Calibri' };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
  }
  ordenadosDetalle.forEach((p, i) => {
    const fr = FILA_TABLA + 1 + i;
    const tieneReal = p.costo_real != null && p.costo_real > 0;
    const diff = tieneReal ? (p.costo_real! - (p.budget ?? 0)) : null;
    for (let c = 1; c <= headersD.length; c++) {
      const cell = wsD.getCell(fr, c);
      if (c === 5 || c === 6 || c === 7) cell.numFmt = '$#,##0';
      cell.font = {
        size: 9, name: 'Calibri',
        color: { argb: c === 7 && diff != null ? (diff > 0 ? RED : diff < 0 ? GREEN : '1E293B') : 'FF1E293B' },
        bold: c === 7,
      };
    }
  });
  const colValoresD: Record<string, string[]> = {
    Colegio: ordenadosDetalle.map(p => p.colegio ?? '—'),
    Territorio: ordenadosDetalle.map(p => p.territorio ?? '—'),
    Proyecto: ordenadosDetalle.map(p => p.name ?? 'Sin nombre'),
  };
  const anchosD = headersD.map(h =>
    h === 'Año' ? 8 : h === 'Presupuesto' || h === 'Costo Real' || h === 'Diferencia' ? 15 : h === '% Variación' ? 12 : anchoColumna(h, colValoresD[h] ?? [])
  );
  anchosD.forEach((w, i) => { wsD.getColumn(i + 1).width = w; });

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Presupuesto_vs_Real_${new Date().toISOString().slice(0, 10)}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
