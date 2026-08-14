import ExcelJS from 'exceljs';

// ─── Colores institucionales (mismos que el resto del sistema) ────────────
const NAVY   = 'FF00295A';
const ORANGE = 'FFED7102';
const SKY    = 'FF4F82C2';
const GREEN  = 'FF059669';
const RED    = 'FFDC2626';
const AMBER  = 'FFD97706';
const WHITE  = 'FFFFFFFF';

export interface ComplianceDocReport {
  colegio: string;
  territorio: string;
  materia: string | null;
  tipo_documento: string;
  norma: string | null;
  estado: string;
  vigente: string | null;
  fecha_limite_recepcion: string | null;
  vigente_desde: string | null;
  vigente_hasta: string | null;
  responsable: string | null;
  año: number;
}

function fmtFecha(f: string | null): string {
  if (!f) return '—';
  const [y, m, d] = f.split('-');
  return `${d}/${m}/${y}`;
}

async function cargarLogoBuffer(): Promise<ArrayBuffer | null> {
  try {
    const res = await fetch('/logo.png');
    if (!res.ok) return null;
    return await res.arrayBuffer();
  } catch { return null; }
}

// ============================================================================
// EXCEL GLOBAL — un libro con hoja resumen + una hoja por colegio, formato
// institucional (mismo patrón que reportesProteccionCivil.ts).
// ============================================================================
export async function generarExcelCumplimiento(docs: ComplianceDocReport[]) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Sistema RCMA';
  wb.created = new Date();

  const logoBuffer = await cargarLogoBuffer();
  const logoId = logoBuffer ? wb.addImage({ buffer: logoBuffer as any, extension: 'png' }) : null;

  const thinBorder = { style: 'thin' as const, color: { argb: 'FFD7DCE1' } };
  const borderAll = { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder };
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);

  const esRetraso = (d: ComplianceDocReport) => {
    if (d.estado === 'Verificado') return false;
    if (!d.fecha_limite_recepcion) return false;
    return new Date(d.fecha_limite_recepcion + 'T00:00:00') < hoy;
  };

  const encabezado = (ws: ExcelJS.Worksheet, titulo: string, subtitulo: string, ultimaCol: number) => {
    ws.getRow(1).height = 34;
    ws.getRow(2).height = 20;
    ws.getRow(3).height = 6;
    if (logoId !== null) ws.addImage(logoId, { tl: { col: 0, row: 0 }, ext: { width: 70, height: 42 } });

    ws.mergeCells(1, 4, 1, ultimaCol);
    const t1 = ws.getCell(1, 4);
    t1.value = 'COLEGIOS MANO AMIGA — CUMPLIMIENTO NORMATIVO';
    t1.font = { bold: true, size: 13, color: { argb: NAVY }, name: 'Calibri' };
    t1.alignment = { vertical: 'middle' };

    ws.mergeCells(2, 4, 2, ultimaCol);
    const t2 = ws.getCell(2, 4);
    t2.value = titulo;
    t2.font = { bold: true, size: 10, color: { argb: ORANGE }, name: 'Calibri' };
    t2.alignment = { vertical: 'middle' };

    ws.mergeCells(3, 1, 3, ultimaCol);
    for (let c = 1; c <= ultimaCol; c++) ws.getCell(3, c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ORANGE } };

    ws.mergeCells(4, 1, 4, ultimaCol);
    const sub = ws.getCell(4, 1);
    sub.value = subtitulo;
    sub.font = { italic: true, size: 10, color: { argb: SKY }, name: 'Calibri' };
    sub.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F7FA' } };
    sub.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
    ws.getRow(4).height = 20;
  };

  // ── Hoja Resumen ──
  const wsR = wb.addWorksheet('Resumen');
  wsR.views = [{ showGridLines: false }];
  [1, 2, 3, 4, 5].forEach((c, i) => wsR.getColumn(c).width = [26, 12, 12, 12, 12][i]);
  encabezado(wsR, 'RESUMEN GLOBAL POR COLEGIO', `Generado: ${new Date().toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })}   |   Total documentos: ${docs.length}`, 5);

  const filaHdr = 6;
  ['Colegio', 'Territorio', 'Total', 'Verificados', 'En retraso'].forEach((h, i) => {
    const c = wsR.getCell(filaHdr, i + 1);
    c.value = h;
    c.font = { bold: true, size: 10, color: { argb: WHITE }, name: 'Calibri' };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
    c.alignment = { horizontal: i === 0 ? 'left' : 'center', vertical: 'middle', indent: i === 0 ? 1 : 0 };
    c.border = borderAll;
  });

  const porColegio = new Map<string, { territorio: string; total: number; verificados: number; retraso: number }>();
  docs.forEach(d => {
    const cur = porColegio.get(d.colegio) ?? { territorio: d.territorio, total: 0, verificados: 0, retraso: 0 };
    cur.total++;
    if (d.estado === 'Verificado') cur.verificados++;
    if (esRetraso(d)) cur.retraso++;
    porColegio.set(d.colegio, cur);
  });

  let fr = filaHdr + 1;
  Array.from(porColegio.entries()).sort((a, b) => b[1].retraso - a[1].retraso).forEach(([colegio, s], i) => {
    if (i % 2 === 1) for (let c = 1; c <= 5; c++) wsR.getCell(fr, c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
    wsR.getCell(fr, 1).value = colegio;
    wsR.getCell(fr, 2).value = s.territorio;
    wsR.getCell(fr, 3).value = s.total;
    wsR.getCell(fr, 4).value = s.verificados;
    wsR.getCell(fr, 5).value = s.retraso;
    for (let c = 1; c <= 5; c++) {
      const cell = wsR.getCell(fr, c);
      cell.font = { size: 10, name: 'Calibri', color: { argb: c === 5 && s.retraso > 0 ? RED : 'FF1E293B' }, bold: c === 5 && s.retraso > 0 };
      cell.alignment = { horizontal: c === 1 ? 'left' : 'center', vertical: 'middle', indent: c === 1 ? 1 : 0 };
      cell.border = borderAll;
    }
    fr++;
  });

  // ── Hoja Detalle (todos los documentos) ──
  const wsD = wb.addWorksheet('Detalle');
  wsD.views = [{ showGridLines: false, state: 'frozen', ySplit: 6 }];
  const anchos = [24, 10, 18, 30, 14, 12, 14, 14, 18];
  anchos.forEach((w, i) => wsD.getColumn(i + 1).width = w);
  encabezado(wsD, 'DETALLE COMPLETO DE DOCUMENTOS', `Generado: ${new Date().toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })}   |   ${docs.length} registros`, 9);

  const headersD = ['Colegio', 'Territorio', 'Materia', 'Documento', 'Estado', 'Vigente', 'Fecha límite', 'Vigente hasta', 'Responsable'];
  headersD.forEach((h, i) => {
    const c = wsD.getCell(filaHdr, i + 1);
    c.value = h;
    c.font = { bold: true, size: 9, color: { argb: WHITE }, name: 'Calibri' };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
    c.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
    c.border = borderAll;
  });

  let fd = filaHdr + 1;
  [...docs].sort((a, b) => a.colegio.localeCompare(b.colegio) || a.tipo_documento.localeCompare(b.tipo_documento)).forEach((d, i) => {
    const retrasado = esRetraso(d);
    if (i % 2 === 1) for (let c = 1; c <= 9; c++) wsD.getCell(fd, c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
    const vals = [d.colegio, d.territorio, d.materia ?? 'Sin categoría', d.tipo_documento, d.estado, d.vigente ?? '—', fmtFecha(d.fecha_limite_recepcion), fmtFecha(d.vigente_hasta), d.responsable ?? 'Sin asignar'];
    vals.forEach((v, ci) => {
      const cell = wsD.getCell(fd, ci + 1);
      cell.value = v;
      cell.font = {
        size: 9, name: 'Calibri',
        color: { argb: ci === 4 ? (d.estado === 'Verificado' ? GREEN : retrasado ? RED : AMBER) : 'FF1E293B' },
        bold: ci === 4,
      };
      cell.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
      cell.border = borderAll;
    });
    fd++;
  });

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Cumplimiento_Normativo_Global_${new Date().toISOString().slice(0, 10)}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ============================================================================
// PDF — header/footer institucionales compartidos (mismo patrón que
// reportesProteccionCivil.ts)
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

async function pdfHeader(doc: Doc, W: number, subtitle: string) {
  doc.setFillColor(0, 41, 90); doc.rect(0, 0, W, 28, 'F');
  doc.setFillColor(237, 113, 2); doc.rect(0, 28, W, 1.2, 'F');
  doc.setFontSize(14); doc.setFont('helvetica', 'bold'); doc.setTextColor(255, 255, 255);
  doc.text('COLEGIOS MANO AMIGA — CUMPLIMIENTO NORMATIVO', 34, 12);
  doc.setFontSize(9.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(255, 170, 110);
  doc.text('PROTECCIÓN CIVIL Y DONATARIAS AUTORIZADAS', 34, 19);
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

function estadoColor(estado: string, retrasado: boolean): [number, number, number] {
  if (estado === 'Verificado') return [5, 150, 105];
  if (retrasado) return [220, 38, 38];
  return [217, 119, 6];
}

// ============================================================================
// PDF GENERAL — cumplimiento de todos los colegios con KPIs, ordenado de
// mayor a menor retraso.
// ============================================================================
export async function generarPDFGeneralCumplimiento(opts: { docs: ComplianceDocReport[]; elaboradoPor: string }) {
  const { docs, elaboradoPor } = opts;
  const jsPDFctor = await loadJsPDF();
  const doc = new jsPDFctor({ unit: 'mm', format: 'letter' }) as Doc;
  const W = (doc as any).internal.pageSize.getWidth();

  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const hoyStr = hoy.toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });
  await pdfHeader(doc, W, `Reporte general · ${hoyStr}`);

  const esRetraso = (d: ComplianceDocReport) => {
    if (d.estado === 'Verificado') return false;
    if (!d.fecha_limite_recepcion) return false;
    return new Date(d.fecha_limite_recepcion + 'T00:00:00') < hoy;
  };

  let y = 40;
  doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(30, 41, 59);
  doc.text(`Alcance: ${new Set(docs.map(d => d.colegio)).size} colegios a nivel nacional`, 20, y);
  doc.text(`Elaborado por: ${elaboradoPor}`, 20, y + 5);
  doc.text(`Dirigido a: Lic. Ángel Eduardo Rodríguez Martínez`, 20, y + 10);
  doc.text(`Fecha de generación: ${hoyStr}`, W - 20, y, { align: 'right' });
  y += 20;

  const porColegio = new Map<string, { territorio: string; total: number; verificados: number; retraso: number }>();
  docs.forEach(d => {
    const cur = porColegio.get(d.colegio) ?? { territorio: d.territorio, total: 0, verificados: 0, retraso: 0 };
    cur.total++;
    if (d.estado === 'Verificado') cur.verificados++;
    if (esRetraso(d)) cur.retraso++;
    porColegio.set(d.colegio, cur);
  });
  const ordenados = Array.from(porColegio.entries())
    .map(([colegio, s]) => ({ colegio, ...s, pct: s.total > 0 ? Math.round((s.verificados / s.total) * 100) : 0 }))
    .sort((a, b) => b.retraso - a.retraso);

  const totalDocs = docs.length;
  const totalRetraso = docs.filter(esRetraso).length;
  const totalPorExpirar = docs.filter(d => d.vigente === 'Por expirar').length;
  const promedio = ordenados.length > 0 ? Math.round(ordenados.reduce((s, d) => s + d.pct, 0) / ordenados.length) : 0;

  const kpis: [string, string][] = [
    [String(totalDocs), 'Documentos totales'],
    [String(totalRetraso), 'En retraso'],
    [String(totalPorExpirar), 'Por expirar'],
    [`${promedio}%`, 'Cumplimiento promedio'],
  ];
  const kpiW = (W - 40 - 3 * 4) / 4;
  kpis.forEach(([num, label], i) => {
    const x = 20 + i * (kpiW + 4);
    doc.setDrawColor(215, 220, 225); doc.setLineWidth(0.3);
    doc.roundedRect(x, y, kpiW, 20, 2, 2, 'S');
    doc.setFontSize(16); doc.setFont('helvetica', 'bold');
    doc.setTextColor(i === 1 ? 220 : 0, i === 1 ? 38 : 41, i === 1 ? 38 : 90);
    doc.text(num, x + kpiW / 2, y + 10, { align: 'center' });
    doc.setFontSize(6.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(107, 114, 128);
    doc.text(label.toUpperCase(), x + kpiW / 2, y + 16, { align: 'center' });
  });
  y += 30;

  doc.setFillColor(0, 41, 90); doc.rect(20, y, W - 40, 7, 'F');
  doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(255, 255, 255);
  doc.text('CUMPLIMIENTO POR COLEGIO', 23, y + 5);
  y += 7;

  const colX = { colegio: 23, territorio: 90, doc: 120, barra: 150, pct: W - 25 };
  doc.setFontSize(7); doc.setTextColor(0, 41, 90); doc.setFont('helvetica', 'bold');
  doc.text('COLEGIO', colX.colegio, y + 5);
  doc.text('TERRITORIO', colX.territorio, y + 5);
  doc.text('DOCUMENTOS', colX.doc, y + 5);
  doc.text('AVANCE', colX.barra, y + 5);
  doc.text('%', colX.pct, y + 5, { align: 'right' });
  doc.setFillColor(238, 243, 250); doc.rect(20, y, W - 40, 7, 'F');
  y += 7;

  ordenados.forEach((d, i) => {
    if (y > 250) { doc.addPage(); y = 20; }
    if (i % 2 === 0) { doc.setFillColor(250, 251, 252); doc.rect(20, y, W - 40, 7, 'F'); }
    doc.setFontSize(7.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(30, 41, 59);
    doc.text(d.colegio.replace('Mano Amiga ', ''), colX.colegio, y + 5);
    doc.text(d.territorio, colX.territorio, y + 5);
    doc.text(`${d.verificados} / ${d.total}`, colX.doc, y + 5);

    const barraW = 25, barraH = 2.2;
    doc.setFillColor(238, 240, 242); doc.rect(colX.barra, y + 3, barraW, barraH, 'F');
    const color = d.pct < 40 ? [220, 38, 38] : d.pct < 80 ? [237, 113, 2] : [5, 150, 105];
    doc.setFillColor(color[0], color[1], color[2]);
    doc.rect(colX.barra, y + 3, barraW * (d.pct / 100), barraH, 'F');

    doc.setFont('helvetica', 'bold'); doc.setTextColor(color[0], color[1], color[2]);
    doc.text(`${d.pct}%`, colX.pct, y + 5, { align: 'right' });
    y += 7;
  });

  pdfFooter(doc);
  doc.save(`Reporte_General_Cumplimiento_${new Date().toISOString().slice(0, 10)}.pdf`);
}

// ============================================================================
// PDF POR COLEGIO — listado completo de documentos de un solo colegio.
// ============================================================================
export async function generarPDFColegioCumplimiento(opts: {
  colegio: string;
  territorio: string;
  docs: ComplianceDocReport[];
  elaboradoPor: string;
}) {
  const { colegio, territorio, docs, elaboradoPor } = opts;
  const jsPDFctor = await loadJsPDF();
  const doc = new jsPDFctor({ unit: 'mm', format: 'letter' }) as Doc;
  const W = (doc as any).internal.pageSize.getWidth();

  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const hoyStr = hoy.toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });
  await pdfHeader(doc, W, `Reporte individual · ${colegio}`);

  const esRetraso = (d: ComplianceDocReport) => {
    if (d.estado === 'Verificado') return false;
    if (!d.fecha_limite_recepcion) return false;
    return new Date(d.fecha_limite_recepcion + 'T00:00:00') < hoy;
  };

  let y = 40;
  doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(30, 41, 59);
  doc.text(`Colegio: ${colegio}`, 20, y);
  doc.text(`Territorio: ${territorio}`, 20, y + 5);
  doc.text(`Elaborado por: ${elaboradoPor}`, 20, y + 10);
  doc.text(`Fecha de generación: ${hoyStr}`, W - 20, y, { align: 'right' });
  y += 20;

  const total = docs.length;
  const verificados = docs.filter(d => d.estado === 'Verificado').length;
  const retraso = docs.filter(esRetraso).length;
  const porExpirar = docs.filter(d => d.vigente === 'Por expirar').length;

  const kpis: [string, string][] = [
    [String(total), 'Documentos'],
    [String(verificados), 'Verificados'],
    [String(retraso), 'En retraso'],
    [String(porExpirar), 'Por expirar'],
  ];
  const kpiW = (W - 40 - 3 * 4) / 4;
  kpis.forEach(([num, label], i) => {
    const x = 20 + i * (kpiW + 4);
    doc.setDrawColor(215, 220, 225); doc.setLineWidth(0.3);
    doc.roundedRect(x, y, kpiW, 20, 2, 2, 'S');
    doc.setFontSize(16); doc.setFont('helvetica', 'bold');
    doc.setTextColor(i === 2 ? 220 : 0, i === 2 ? 38 : 41, i === 2 ? 38 : 90);
    doc.text(num, x + kpiW / 2, y + 10, { align: 'center' });
    doc.setFontSize(6.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(107, 114, 128);
    doc.text(label.toUpperCase(), x + kpiW / 2, y + 16, { align: 'center' });
  });
  y += 30;

  doc.setFillColor(0, 41, 90); doc.rect(20, y, W - 40, 7, 'F');
  doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(255, 255, 255);
  doc.text('DETALLE DE DOCUMENTOS', 23, y + 5);
  y += 7;

  const colX = { doc: 23, materia: 95, estado: 140, fecha: W - 25 };
  doc.setFontSize(7); doc.setTextColor(0, 41, 90); doc.setFont('helvetica', 'bold');
  doc.text('DOCUMENTO', colX.doc, y + 5);
  doc.text('MATERIA', colX.materia, y + 5);
  doc.text('ESTADO', colX.estado, y + 5);
  doc.text('FECHA LÍMITE', colX.fecha, y + 5, { align: 'right' });
  doc.setFillColor(238, 243, 250); doc.rect(20, y, W - 40, 7, 'F');
  y += 7;

  [...docs].sort((a, b) => a.tipo_documento.localeCompare(b.tipo_documento)).forEach((d, i) => {
    if (y > 250) { doc.addPage(); y = 20; }
    const retrasado = esRetraso(d);
    if (i % 2 === 0) { doc.setFillColor(250, 251, 252); doc.rect(20, y, W - 40, 7, 'F'); }
    doc.setFontSize(7.2); doc.setFont('helvetica', 'normal'); doc.setTextColor(30, 41, 59);
    const nombreDoc = d.tipo_documento.length > 42 ? d.tipo_documento.slice(0, 40) + '…' : d.tipo_documento;
    doc.text(nombreDoc, colX.doc, y + 5);
    doc.text(d.materia ?? 'Sin categoría', colX.materia, y + 5);
    const [r, g, b] = estadoColor(d.estado, retrasado);
    doc.setTextColor(r, g, b); doc.setFont('helvetica', 'bold');
    doc.text(d.estado, colX.estado, y + 5);
    doc.setFont('helvetica', 'normal'); doc.setTextColor(30, 41, 59);
    doc.text(fmtFecha(d.fecha_limite_recepcion), colX.fecha, y + 5, { align: 'right' });
    y += 7;
  });

  pdfFooter(doc);
  doc.save(`Cumplimiento_${colegio.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.pdf`);
}
