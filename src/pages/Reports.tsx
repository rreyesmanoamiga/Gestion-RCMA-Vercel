import React, { useMemo } from 'react';
import { db } from '@/lib/db';
import { supabase } from '@/lib/supabaseClient';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart3, Download, FileSpreadsheet, FileText,
  PieChart, Filter, TrendingUp, ClockAlert,
} from 'lucide-react';
import PageHeader from '@/components/shared/PageHeader';

const btnOutline = "flex items-center gap-2 px-4 py-2.5 border border-slate-300 rounded-lg text-sm font-bold text-slate-700 hover:bg-slate-50 transition-all shadow-sm disabled:opacity-40 disabled:cursor-not-allowed";
const cardClass  = "bg-white p-6 rounded-xl border border-slate-200 shadow-sm";

interface Project  { id: string; name?: string; status?: string; progress?: number; territorio?: string; colegio?: string; }
interface Solicitud { id: string; nombre_centro?: string; nombre_proyecto?: string; estatus?: string; created_at?: string; }
interface Ticket   { id: string; folio?: string; territorio?: string; proyecto_id?: string; }
interface Stats    { total: number; completed: number; avgProgress: number; }

async function loadJsPDF(): Promise<typeof import('jspdf').jsPDF> {
  const w = window as Window & { jspdf?: { jsPDF: typeof import('jspdf').jsPDF } };
  if (w.jspdf?.jsPDF) return w.jspdf.jsPDF;
  await new Promise<void>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
    s.onload = () => resolve(); s.onerror = () => reject(new Error('jsPDF load error'));
    document.head.appendChild(s);
  });
  return w.jspdf!.jsPDF;
}

function drawBar(
  doc: InstanceType<typeof import('jspdf').jsPDF>,
  x: number, y: number, bw: number,
  active: number, completed: number, label: string,
) {
  const total = active + completed;
  const maxH = 20; const bw2 = Math.floor((bw - 6) / 2); const base = y + maxH;
  const hA = total > 0 ? Math.max(2, Math.round((active    / total) * maxH)) : 0;
  const hC = total > 0 ? Math.max(2, Math.round((completed / total) * maxH)) : 0;
  if (hA > 0) {
    doc.setFillColor(59, 130, 246); doc.rect(x, base - hA, bw2, hA, 'F');
    doc.setFontSize(6.5); doc.setFont('helvetica','bold'); doc.setTextColor(30,30,30);
    doc.text(String(active), x + bw2/2, base - hA - 1.5, { align:'center' });
  }
  if (hC > 0) {
    doc.setFillColor(34, 197, 94); doc.rect(x + bw2 + 3, base - hC, bw2, hC, 'F');
    doc.setFontSize(6.5); doc.setFont('helvetica','bold'); doc.setTextColor(30,30,30);
    doc.text(String(completed), x + bw2 + 3 + bw2/2, base - hC - 1.5, { align:'center' });
  }
  doc.setDrawColor(210,210,210); doc.line(x-1, base+0.5, x+bw, base+0.5);
  doc.setFontSize(6.5); doc.setFont('helvetica','normal'); doc.setTextColor(80,80,80);
  doc.text(label.length > 11 ? label.slice(0,9)+'\u2026' : label, x+bw/2, base+5, { align:'center' });
}

async function exportResumenPDF({ stats, projects, checklists, solicitudes, tickets }: {
  stats: Stats; projects: Project[]; checklists: unknown[];
  solicitudes: Solicitud[]; tickets: Ticket[];
}): Promise<void> {
  const JsPDF = await loadJsPDF();
  const doc = new JsPDF({ orientation:'portrait', unit:'mm', format:'a4' });
  const now = new Date().toLocaleDateString('es-MX', { year:'numeric', month:'long', day:'numeric' });
  const W = 210; let y = 20;

  const line = (text: string, size=10, bold=false, color:[number,number,number]=[30,30,30]) => {
    doc.setFontSize(size); doc.setFont('helvetica', bold?'bold':'normal');
    doc.setTextColor(...color); doc.text(text, 20, y); y += size*0.5+2;
  };
  const divider = () => { doc.setDrawColor(220,220,220); doc.line(20,y,W-20,y); y+=6; };

  // Encabezado
  doc.setFillColor(15,23,42); doc.rect(0,0,W,28,'F');
  doc.setFontSize(16); doc.setFont('helvetica','bold'); doc.setTextColor(255,255,255);
  doc.text('Reporte General \u2014 Colegios Mano Amiga', 20, 13);
  doc.setFontSize(9); doc.setFont('helvetica','normal'); doc.setTextColor(180,180,200);
  doc.text('Generado el ' + now, 20, 22);
  try {
    const logoImg = await new Promise<string>((res,rej) => {
      const img = new Image(); img.crossOrigin='anonymous';
      img.onload = () => { const c=document.createElement('canvas'); c.width=img.width; c.height=img.height; c.getContext('2d')!.drawImage(img,0,0); res(c.toDataURL('image/png')); };
      img.onerror=rej; img.src='/logo.png';
    });
    doc.addImage(logoImg,'PNG',W-38,2,24,24);
  } catch { /* sin logo */ }
  y = 40;

  // Resumen ejecutivo
  const active = projects.filter(p => p.status !== 'completado' && p.status !== 'cancelado');
  const avgA = active.length > 0 ? Math.round(active.reduce((a,p)=>a+(p.progress||0),0)/active.length) : 0;
  line('Resumen Ejecutivo', 13, true); y+=2; divider();
  line('Proyectos totales:         ' + stats.total);
  line('Proyectos activos:         ' + active.length);
  line('Proyectos completados:     ' + stats.completed);
  line('Avance promedio (activos): ' + avgA + '%');
  line('Inspecciones realizadas:   ' + checklists.length);
  line('Solicitudes recibidas:     ' + solicitudes.length);
  line('Tickets TCMM:              ' + tickets.length);
  y+=4;

  // Barras por territorio
  if (y > 200) { doc.addPage(); y=20; }
  line('Proyectos por Territorio', 13, true); y+=2; divider();
  doc.setFillColor(59,130,246); doc.rect(20,y-3,5,5,'F');
  doc.setFontSize(7.5); doc.setFont('helvetica','normal'); doc.setTextColor(50,50,50);
  doc.text('Activos', 27, y);
  doc.setFillColor(34,197,94); doc.rect(58,y-3,5,5,'F');
  doc.text('Completados', 65, y);
  y+=10;
  const ters = Array.from(new Set(projects.map(p=>p.territorio||'Sin territorio'))).sort();
  const COLS=4; const bw=(W-40)/COLS; const rowH=38; let col=0; let ry=y;
  ters.forEach(ter => {
    const tp=projects.filter(p=>(p.territorio||'Sin territorio')===ter);
    drawBar(doc, 20+col*bw, ry, bw-4,
      tp.filter(p=>p.status!=='completado'&&p.status!=='cancelado').length,
      tp.filter(p=>p.status==='completado').length, ter);
    col++; if(col>=COLS){col=0;ry+=rowH;if(ry+rowH>270){doc.addPage();ry=20;}}
  });
  y = ry + (col>0?rowH:0) + 6;
  if (y>250) { doc.addPage(); y=20; }

  // Tabla proyectos activos
  y+=4; line('Detalle de Proyectos Activos', 13, true); y+=2; divider();
  const pC = { n:20, s:110, p:150, t:170 };
  doc.setFillColor(241,245,249); doc.rect(18,y-4,W-36,8,'F');
  doc.setFontSize(8); doc.setFont('helvetica','bold'); doc.setTextColor(100,116,139);
  doc.text('Proyecto',pC.n,y); doc.text('Estado',pC.s,y); doc.text('Avance',pC.p,y); doc.text('Colegio',pC.t,y);
  y+=6; divider();
  doc.setFont('helvetica','normal'); doc.setTextColor(30,30,30);
  active.slice(0,40).forEach((p,i) => {
    if(y>270){doc.addPage();y=20;}
    if(i%2===0){doc.setFillColor(248,250,252);doc.rect(18,y-4,W-36,7,'F');}
    doc.setFontSize(8);
    doc.text(p.name&&p.name.length>45?p.name.slice(0,42)+'\u2026':(p.name||'\u2014'),pC.n,y);
    doc.text(p.status||'\u2014',pC.s,y);
    doc.text((p.progress||0)+'%',pC.p,y);
    doc.text(p.colegio||p.territorio||'\u2014',pC.t,y);
    y+=7;
  });
  if(active.length>40){y+=2;doc.setFontSize(8);doc.setTextColor(100,116,139);doc.text('... y '+(active.length-40)+' proyectos m\u00e1s.',20,y);y+=6;}

  // Tabla tickets por territorio
  if(y>230){doc.addPage();y=20;} y+=4;
  line('Tickets TCMM por Territorio', 13, true); y+=2; divider();
  const tTers = Array.from(new Set(tickets.map(t=>t.territorio||'Sin territorio'))).sort();
  doc.setFillColor(241,245,249); doc.rect(18,y-4,W-36,8,'F');
  doc.setFontSize(8); doc.setFont('helvetica','bold'); doc.setTextColor(100,116,139);
  doc.text('Territorio', 20, y); doc.text('Tickets TCMM', W-20, y, {align:'right'});
  y+=6; divider();
  doc.setFont('helvetica','normal'); doc.setTextColor(30,30,30);
  tTers.forEach((ter,i) => {
    if(y>270){doc.addPage();y=20;}
    if(i%2===0){doc.setFillColor(248,250,252);doc.rect(18,y-4,W-36,7,'F');}
    doc.setFontSize(8);
    doc.text(ter.length>50?ter.slice(0,47)+'\u2026':ter, 20, y);
    doc.text(String(tickets.filter(t=>(t.territorio||'Sin territorio')===ter).length), W-20, y, {align:'right'});
    y+=7;
  });
  y+=2;
  doc.setFillColor(15,23,42); doc.rect(18,y-4,W-36,8,'F');
  doc.setFontSize(8); doc.setFont('helvetica','bold'); doc.setTextColor(255,255,255);
  doc.text('TOTAL', 20, y); doc.text(String(tickets.length), W-20, y, {align:'right'});
  y+=10;
  doc.setFontSize(7.5); doc.setFont('helvetica','italic'); doc.setTextColor(100,116,139);
  const nota = 'Solicitudes recibidas (total): ' + solicitudes.length + '. Las solicitudes no registran territorio, por lo que se muestran solo como total global.';
  const nl = doc.splitTextToSize(nota, W-40);
  doc.text(nl, 20, y); y += nl.length*5;

  // Pie de pagina
  const pages = doc.getNumberOfPages();
  for(let i=1;i<=pages;i++){
    doc.setPage(i); doc.setFontSize(7); doc.setTextColor(160,160,160);
    doc.text('Sistema RCMA Cloud \u2014 P\u00e1gina '+i+' de '+pages, 20, 290);
    doc.text('Documento confidencial', W-20, 290, {align:'right'});
  }
  doc.save('reporte-mano-amiga-'+Date.now()+'.pdf');
}

// ─── Excel Export ─────────────────────────────────────────────────────────────
async function loadXLSX() {
  const w = window as Window & { XLSX?: unknown };
  if (w.XLSX) return w.XLSX as typeof import('xlsx');
  await new Promise<void>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
    s.onload = () => resolve(); s.onerror = () => reject(new Error('XLSX load error'));
    document.head.appendChild(s);
  });
  return w.XLSX as typeof import('xlsx');
}

async function exportMatrizExcel(data: {
  projects:      unknown[];
  checklists:    unknown[];
  tickets:       unknown[];
  pendientes:    unknown[];
  anteproyectos: unknown[];
  solicitudes:   unknown[];
}) {
  const XLSX = await loadXLSX();
  const wb   = XLSX.utils.book_new();
  const now  = new Date().toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' });

  // ── Estilos reutilizables ────────────────────────────────────────────────
  const bdr = {
    top:    { style: 'thin', color: { rgb: 'FFD1D5DB' } },
    bottom: { style: 'thin', color: { rgb: 'FFD1D5DB' } },
    left:   { style: 'thin', color: { rgb: 'FFD1D5DB' } },
    right:  { style: 'thin', color: { rgb: 'FFD1D5DB' } },
  };

  const sTitle = {
    font:      { bold: true, sz: 13, name: 'Calibri', color: { rgb: 'FFFFFFFF' } },
    fill:      { patternType: 'solid', fgColor: { rgb: 'FF0F172A' } },
    alignment: { horizontal: 'left', vertical: 'center' },
  };
  const sSubtitle = {
    font:      { italic: true, sz: 9, name: 'Calibri', color: { rgb: 'FFD1D5DB' } },
    fill:      { patternType: 'solid', fgColor: { rgb: 'FF0F172A' } },
    alignment: { horizontal: 'right', vertical: 'center' },
  };
  const sBlankDark = {
    fill: { patternType: 'solid', fgColor: { rgb: 'FF0F172A' } },
  };
  const sHeader = {
    font:      { bold: true, sz: 10, name: 'Calibri', color: { rgb: 'FFFFFFFF' } },
    fill:      { patternType: 'solid', fgColor: { rgb: 'FF1E40AF' } },
    alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
    border:    bdr,
  };
  const sData = (alt: boolean) => ({
    font:      { sz: 10, name: 'Calibri', color: { rgb: 'FF111827' } },
    fill:      { patternType: alt ? 'solid' : 'none', fgColor: { rgb: alt ? 'FFF0F4FF' : 'FFFFFFFF' } },
    alignment: { vertical: 'center' },
    border:    bdr,
  });
  const sDataCenter = (alt: boolean) => ({
    ...sData(alt),
    alignment: { horizontal: 'center', vertical: 'center' },
  });
  const sDataRight = (alt: boolean) => ({
    ...sData(alt),
    alignment: { horizontal: 'right', vertical: 'center' },
    numFmt: '"$"#,##0.00',
  });
  const sTotal = {
    font:   { bold: true, sz: 10, name: 'Calibri', color: { rgb: 'FF1E40AF' } },
    fill:   { patternType: 'solid', fgColor: { rgb: 'FFEFF6FF' } },
    border: bdr,
  };

  // ── Builder de hojas ─────────────────────────────────────────────────────
  function buildSheet(
    name:      string,
    sheetTitle: string,
    headers:   string[],
    rows:      (string | number | null | undefined)[][],
    colWidths: number[],
    moneyCol?: number,   // índice de columna con formato moneda
  ) {
    const ws: Record<string, unknown> = {};
    const nCols = headers.length;
    const nRows = rows.length;

    // Fila 0 — Título (dark bg, sin merges para evitar errores)
    for (let c = 0; c < nCols; c++) {
      ws[XLSX.utils.encode_cell({ r: 0, c })] = {
        v: c === 0 ? sheetTitle : c === nCols - 1 ? `Generado: ${now}` : '',
        t: 's',
        s: c === nCols - 1 ? sSubtitle : sTitle,
      };
    }

    // Fila 1 — separador oscuro
    for (let c = 0; c < nCols; c++) {
      ws[XLSX.utils.encode_cell({ r: 1, c })] = { v: '', t: 's', s: sBlankDark };
    }

    // Fila 2 — encabezados azules
    headers.forEach((h, c) => {
      ws[XLSX.utils.encode_cell({ r: 2, c })] = { v: h, t: 's', s: sHeader };
    });

    // Filas de datos
    rows.forEach((row, ri) => {
      const alt = ri % 2 === 1;
      row.forEach((val, ci) => {
        const isMoney  = moneyCol !== undefined && ci === moneyCol;
        const isNumber = typeof val === 'number';
        const cell: Record<string, unknown> = {
          v: val ?? '—',
          t: isNumber ? 'n' : 's',
          s: isMoney ? sDataRight(alt) : isNumber ? sDataCenter(alt) : sData(alt),
        };
        if (isMoney) cell.z = '"$"#,##0.00';
        ws[XLSX.utils.encode_cell({ r: ri + 3, c: ci })] = cell;
      });
    });

    // Fila de total
    const totalRow = nRows + 3;
    ws[XLSX.utils.encode_cell({ r: totalRow, c: 0 })] = {
      v: `Total de registros: ${nRows}`, t: 's', s: sTotal,
    };
    for (let c = 1; c < nCols; c++) {
      ws[XLSX.utils.encode_cell({ r: totalRow, c })] = { v: '', t: 's', s: sTotal };
    }

    ws['!ref']        = `A1:${XLSX.utils.encode_cell({ r: totalRow, c: nCols - 1 })}`;
    ws['!cols']       = colWidths.map(w => ({ wch: w }));
    ws['!rows']       = [
      { hpt: 26 },
      { hpt: 4  },
      { hpt: 22 },
      ...rows.map(() => ({ hpt: 18 })),
      { hpt: 18 },
    ];
    ws['!autofilter'] = { ref: `A3:${XLSX.utils.encode_cell({ r: 2, c: nCols - 1 })}` };

    XLSX.utils.book_append_sheet(wb, ws as import('xlsx').WorkSheet, name);
  }

  const fmt  = (d?: string | null) => d ? new Date(d).toLocaleDateString('es-MX') : '—';
  const num  = (n?: number | null) => (n != null ? n : 0);

  // ── 1. PROYECTOS ─────────────────────────────────────────────────────────
  buildSheet(
    '📁 Proyectos', 'Proyectos — Sistema RCMA',
    ['Folio', 'Nombre del Proyecto', 'Estatus', 'Avance %', 'Territorio', 'Colegio', 'Responsable', 'Tipo', 'Prioridad', 'Fecha Inicio'],
    (data.projects as Record<string, unknown>[]).map(p => [
      p.folio ?? '—', p.name ?? '—', p.status ?? '—', p.progress ?? 0,
      p.territorio ?? '—', p.colegio ?? '—', p.responsible ?? '—',
      p.tipo_proyecto ?? '—', p.priority ?? '—', fmt(p.start_date as string),
    ]),
    [12, 36, 14, 10, 12, 14, 26, 22, 12, 14],
  );

  // ── 2. TICKETS TCMM ──────────────────────────────────────────────────────
  buildSheet(
    '🎫 Tickets TCMM', 'Tickets TCMM — Sistema RCMA',
    ['Folio', 'Territorio', 'Colegio', 'ECO', 'Tipo', 'Estatus', 'Proveedor', 'Presupuesto', 'Plan Financ.', 'Ticket Físico', 'Fecha'],
    (data.tickets as Record<string, unknown>[]).map(t => [
      t.folio ?? '—', t.territorio ?? '—', t.colegio ?? '—', t.eco ?? '—',
      t.tipo_proyecto ?? '—', t.estatus ?? '—', t.nombre_proveedor ?? '—',
      num(t.presupuesto as number), t.plan_financiamiento ?? '—',
      t.ticket_fisico ? 'Sí' : 'No', fmt(t.fecha as string),
    ]),
    [14, 12, 14, 26, 18, 12, 24, 16, 16, 13, 14],
    7,
  );

  // ── 3. PENDIENTES ─────────────────────────────────────────────────────────
  buildSheet(
    '⏳ Pendientes', 'Pendientes — Sistema RCMA',
    ['Territorio', 'Colegio', 'Proyecto', 'ECO', 'Tipo', 'Prioridad', 'Estatus', 'Asignación', 'Presupuesto', 'Última Actualiz.'],
    (data.pendientes as Record<string, unknown>[]).map(p => [
      p.territorio ?? '—', p.colegio ?? '—', p.nombre_proyecto ?? '—',
      p.eco ?? '—', p.tipo_proyecto ?? '—', p.prioridad ?? '—',
      p.estatus ?? '—', p.asignacion ?? '—',
      num(p.presupuesto as number), fmt(p.fecha_actualizacion as string),
    ]),
    [12, 14, 34, 26, 18, 12, 14, 24, 16, 18],
    8,
  );

  // ── 4. ANTEPROYECTOS ─────────────────────────────────────────────────────
  buildSheet(
    '📐 Anteproyectos', 'Anteproyectos — Sistema RCMA',
    ['Territorio', 'Colegio', 'Proyecto', 'ECO', 'Tipo', 'Prioridad', 'Estatus', 'Asignación', 'Presupuesto', 'Última Actualiz.'],
    (data.anteproyectos as Record<string, unknown>[]).map(a => [
      a.territorio ?? '—', a.colegio ?? '—', a.nombre_proyecto ?? '—',
      a.eco ?? '—', a.tipo_proyecto ?? '—', a.prioridad ?? '—',
      a.estatus ?? '—', a.asignacion ?? '—',
      num(a.presupuesto as number), fmt(a.fecha_actualizacion as string),
    ]),
    [12, 14, 34, 26, 18, 12, 14, 24, 16, 18],
    8,
  );

  // ── 5. INSPECCIONES ───────────────────────────────────────────────────────
  buildSheet(
    '✅ Inspecciones', 'Checklists de Inspección — Sistema RCMA',
    ['Título', 'Colegio', 'Territorio', 'Inspector', 'Material', 'Estado General', 'Núm. Ítems', 'Fecha'],
    (data.checklists as Record<string, unknown>[]).map(c => [
      c.titulo ?? '—', c.colegio ?? '—', c.territorio ?? '—',
      c.inspector ?? 'Sin asignar', c.material ?? '—', c.overall_status ?? '—',
      Array.isArray(c.items) ? (c.items as unknown[]).length : 0,
      fmt((c.fecha ?? c.created_at) as string),
    ]),
    [38, 14, 12, 24, 32, 16, 12, 14],
  );

  // ── 6. SOLICITUDES ────────────────────────────────────────────────────────
  buildSheet(
    '📩 Solicitudes', 'Solicitudes de Proyecto — Sistema RCMA',
    ['Centro', 'Proyecto', 'Solicitante', 'Puesto', 'Tipo Iniciativa', 'Costo Aprox.', 'Estatus', 'Fecha Solicitud', 'Fecha Inicio Prop.'],
    (data.solicitudes as Record<string, unknown>[]).map(s => [
      s.nombre_centro ?? '—', s.nombre_proyecto ?? '—',
      s.nombre_solicitante ?? '—', s.puesto_solicitante ?? '—',
      s.tipo_iniciativa ?? '—', num(s.costo_aproximado as number),
      s.estatus ?? '—', fmt(s.created_at as string),
      fmt(s.fecha_inicio_propuesta as string),
    ]),
    [22, 34, 24, 20, 22, 16, 14, 18, 20],
    5,
  );

  // ── 7. RESUMEN EJECUTIVO ──────────────────────────────────────────────────
  const ws7: Record<string, unknown> = {};

  const sResTitle = {
    font: { bold: true, sz: 16, name: 'Calibri', color: { rgb: 'FFFFFFFF' } },
    fill: { patternType: 'solid', fgColor: { rgb: 'FF0F172A' } },
    alignment: { horizontal: 'left', vertical: 'center' },
  };
  const sResDate = {
    font: { italic: true, sz: 10, name: 'Calibri', color: { rgb: 'FFD1D5DB' } },
    fill: { patternType: 'solid', fgColor: { rgb: 'FF0F172A' } },
    alignment: { horizontal: 'right', vertical: 'center' },
  };
  const sResHeader = {
    font: { bold: true, sz: 11, name: 'Calibri', color: { rgb: 'FFFFFFFF' } },
    fill: { patternType: 'solid', fgColor: { rgb: 'FF1E40AF' } },
    alignment: { horizontal: 'left', vertical: 'center' },
    border: bdr,
  };
  const sResHeaderNum = {
    ...sResHeader,
    alignment: { horizontal: 'right', vertical: 'center' },
  };
  const sResRow = (alt: boolean) => ({
    font:  { sz: 11, name: 'Calibri', color: { rgb: 'FF111827' } },
    fill:  { patternType: alt ? 'solid' : 'none', fgColor: { rgb: alt ? 'FFF0F4FF' : 'FFFFFFFF' } },
    alignment: { horizontal: 'left', vertical: 'center' },
    border: bdr,
  });
  const sResNum = (alt: boolean) => ({
    ...sResRow(alt),
    font: { bold: true, sz: 12, name: 'Calibri', color: { rgb: 'FF1E40AF' } },
    alignment: { horizontal: 'right', vertical: 'center' },
  });
  const sResTotalLabel = {
    font:   { bold: true, sz: 12, name: 'Calibri', color: { rgb: 'FFFFFFFF' } },
    fill:   { patternType: 'solid', fgColor: { rgb: 'FF0F172A' } },
    alignment: { horizontal: 'left', vertical: 'center' },
    border: bdr,
  };
  const sResTotalNum = {
    ...sResTotalLabel,
    alignment: { horizontal: 'right', vertical: 'center' },
  };

  const resRows = [
    { label: 'Proyectos',     count: data.projects.length      },
    { label: 'Tickets TCMM',  count: data.tickets.length       },
    { label: 'Pendientes',    count: data.pendientes.length     },
    { label: 'Anteproyectos', count: data.anteproyectos.length },
    { label: 'Inspecciones',  count: data.checklists.length     },
    { label: 'Solicitudes',   count: data.solicitudes.length    },
  ];
  const totalGeneral = resRows.reduce((a, r) => a + r.count, 0);

  // R0: título
  ws7['A1'] = { v: 'SISTEMA RCMA — MATRIZ DE CONCENTRADO', t: 's', s: sResTitle };
  ws7['B1'] = { v: `Generado: ${now}`,                    t: 's', s: sResDate  };
  // R1: separador
  ws7['A2'] = { v: '', t: 's', s: { fill: { patternType: 'solid', fgColor: { rgb: 'FF0F172A' } } } };
  ws7['B2'] = { v: '', t: 's', s: { fill: { patternType: 'solid', fgColor: { rgb: 'FF0F172A' } } } };
  // R2: encabezados
  ws7['A3'] = { v: 'MÓDULO',             t: 's', s: sResHeader    };
  ws7['B3'] = { v: 'TOTAL DE REGISTROS', t: 's', s: sResHeaderNum };
  // Datos
  resRows.forEach((row, i) => {
    const alt = i % 2 === 1;
    ws7[`A${i + 4}`] = { v: row.label, t: 's', s: sResRow(alt) };
    ws7[`B${i + 4}`] = { v: row.count, t: 'n', s: sResNum(alt) };
  });
  // Separador
  const sepR = resRows.length + 4;
  ws7[`A${sepR}`] = { v: '', t: 's', s: { fill: { patternType: 'solid', fgColor: { rgb: 'FFD1D5DB' } } } };
  ws7[`B${sepR}`] = { v: '', t: 's', s: { fill: { patternType: 'solid', fgColor: { rgb: 'FFD1D5DB' } } } };
  // Total general
  ws7[`A${sepR + 1}`] = { v: 'TOTAL GENERAL', t: 's', s: sResTotalLabel };
  ws7[`B${sepR + 1}`] = { v: totalGeneral,    t: 'n', s: sResTotalNum   };

  ws7['!ref']  = `A1:B${sepR + 1}`;
  ws7['!cols'] = [{ wch: 28 }, { wch: 22 }];
  ws7['!rows'] = [
    { hpt: 32 }, { hpt: 5 }, { hpt: 22 },
    ...resRows.map(() => ({ hpt: 22 })),
    { hpt: 4 }, { hpt: 26 },
  ];

  XLSX.utils.book_append_sheet(wb, ws7 as import('xlsx').WorkSheet, '📊 Resumen Ejecutivo');

  // Resumen siempre primera hoja
  wb.SheetNames = [
    '📊 Resumen Ejecutivo',
    '📁 Proyectos',
    '🎫 Tickets TCMM',
    '⏳ Pendientes',
    '📐 Anteproyectos',
    '✅ Inspecciones',
    '📩 Solicitudes',
  ];

  const fecha = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `Matriz_Sistema_RCMA_${fecha}.xlsx`);
}


export default function Reports() {
  const { data: rawProjects   = [] } = useQuery({ queryKey:['projects'],   queryFn:()=>db.Project.list('-created_at',500) });
  const { data: rawChecklists = [] } = useQuery({ queryKey:['checklists'], queryFn:()=>db.Checklist.list('-created_at',500) });
  const { data: rawSolicitudes = [] } = useQuery({
    queryKey: ['solicitudes'],
    queryFn: async () => {
      const { data, error } = await supabase.from('solicitudes').select('id,nombre_centro,nombre_proyecto,estatus,created_at').order('created_at',{ascending:false}).limit(500);
      if(error) throw error; return data??[];
    },
  });
  const { data: rawTickets = [] } = useQuery({
    queryKey: ['tickets'],
    queryFn: async () => {
      const { data, error } = await supabase.from('tickets').select('id,folio,territorio,proyecto_id').order('created_at',{ascending:false}).limit(500);
      if(error) throw error; return data??[];
    },
  });

  const { data: rawPendientes = [] } = useQuery({
    queryKey: ['pendientes-report'],
    queryFn: () => db.Pendiente.list('-created_at', 500),
  });
  const { data: rawAnteproyectos = [] } = useQuery({
    queryKey: ['anteproyectos-report'],
    queryFn: async () => {
      const { data, error } = await supabase.from('anteproyectos').select('*').order('created_at', { ascending: false }).limit(500);
      if (error) throw error; return data ?? [];
    },
  });
  const { data: rawSolicitudesAll = [] } = useQuery({
    queryKey: ['solicitudes-all-report'],
    queryFn: async () => {
      const { data, error } = await supabase.from('solicitudes').select('*').order('created_at', { ascending: false }).limit(500);
      if (error) throw error; return data ?? [];
    },
  });
  const { data: rawTicketsFull = [] } = useQuery({
    queryKey: ['tickets-full-report'],
    queryFn: async () => {
      const { data, error } = await supabase.from('tickets').select('*').order('created_at', { ascending: false }).limit(500);
      if (error) throw error; return data ?? [];
    },
  });
  const checklists  = rawChecklists  as unknown[];
  const solicitudes = rawSolicitudes as unknown as Solicitud[];
  const tickets     = rawTickets     as unknown as Ticket[];
  const projects    = rawProjects    as unknown as Project[];

  const handleExportExcel = () => exportMatrizExcel({
    projects:      rawProjects,
    checklists:    rawChecklists,
    tickets:       rawTicketsFull,
    pendientes:    rawPendientes,
    anteproyectos: rawAnteproyectos,
    solicitudes:   rawSolicitudesAll,
  }).catch(e => console.error('Error generando Excel:', e));

  const stats = useMemo(():Stats => ({
    total:       projects.length,
    completed:   projects.filter(p=>p.status==='completado').length,
    avgProgress: projects.length>0 ? Math.round(projects.reduce((a,p)=>a+(p.progress||0),0)/projects.length) : 0,
  }),[projects]);

  const activeProjects = useMemo(()=>projects.filter(p=>p.status!=='completado'&&p.status!=='cancelado'),[projects]);

  const terData = useMemo(()=>{
    const t = Array.from(new Set(tickets.map(t=>t.territorio||'Sin territorio'))).sort();
    return t.map(ter=>({ territorio:ter, count:tickets.filter(t=>(t.territorio||'Sin territorio')===ter).length }));
  },[tickets]);

  const handleExportPDF = () => exportResumenPDF({stats,projects,checklists,solicitudes,tickets}).catch(e=>console.error('Error generando PDF:',e));

  return (
    <div className="space-y-6 max-w-7xl mx-auto p-4">
      <PageHeader title="Reportes y Estadísticas" subtitle="Análisis de avance del Proyecto Levantamiento y mantenimiento" />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className={`${cardClass} border-l-4 border-l-slate-900`}>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Proyectos Activos</p>
          <div className="flex items-center justify-between">
            <h3 className="text-3xl font-black text-slate-900">{activeProjects.length}</h3>
            <BarChart3 className="w-8 h-8 text-slate-100" />
          </div>
          <p className="text-xs text-slate-400 mt-1">{stats.completed} completados · {stats.total} total</p>
        </div>
        <div className={`${cardClass} border-l-4 border-l-blue-600`}>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Avance General</p>
          <div className="flex items-center justify-between">
            <h3 className="text-3xl font-black text-slate-900">{stats.avgProgress}%</h3>
            <TrendingUp className="w-8 h-8 text-blue-50" />
          </div>
        </div>
        <div className={`${cardClass} border-l-4 border-l-green-500`}>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Inspecciones</p>
          <div className="flex items-center justify-between">
            <h3 className="text-3xl font-black text-slate-900">{checklists.length}</h3>
            <FileText className="w-8 h-8 text-green-50" />
          </div>
        </div>
        <div className={`${cardClass} border-l-4 border-l-amber-500`}>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Solicitudes</p>
          <div className="flex items-center justify-between">
            <h3 className="text-3xl font-black text-slate-900">{solicitudes.length}</h3>
            <ClockAlert className="w-8 h-8 text-amber-100" />
          </div>
          <p className="text-xs text-slate-400 mt-1">{tickets.length} tickets TCMM</p>
        </div>
      </div>

      {terData.length > 0 && (
        <div className={cardClass}>
          <h3 className="font-bold text-slate-900 mb-4 flex items-center gap-2">
            <PieChart className="w-4 h-4 text-blue-500" /> Tickets TCMM por Territorio
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[10px] font-black uppercase tracking-widest text-slate-400 border-b border-slate-100">
                  <th className="text-left pb-2 pr-4">Territorio</th>
                  <th className="text-right pb-2">Tickets TCMM</th>
                </tr>
              </thead>
              <tbody>
                {terData.map(({ territorio, count }) => (
                  <tr key={territorio} className="border-b border-slate-50 hover:bg-slate-50">
                    <td className="py-2 pr-4 text-slate-700 font-medium">{territorio}</td>
                    <td className="py-2 text-right tabular-nums font-bold text-slate-700">{count}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-slate-900 text-white text-xs font-bold">
                  <td className="py-2 px-2 rounded-l-lg">TOTAL</td>
                  <td className="py-2 text-right tabular-nums pr-2 rounded-r-lg">{tickets.length}</td>
                </tr>
              </tfoot>
            </table>
            <p className="text-xs text-slate-400 mt-2">Solicitudes recibidas (total): {solicitudes.length} — las solicitudes no registran territorio.</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className={cardClass}>
          <h3 className="font-bold text-slate-900 mb-4 flex items-center gap-2">
            <Download className="w-4 h-4 text-slate-400" /> Exportar Datos Técnicos
          </h3>
          <p className="text-xs text-slate-500 mb-6 leading-relaxed">
            Genera archivos para auditorías de obra, revisión de estimaciones o reportes de mantenimiento preventivo.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button className={btnOutline} onClick={handleExportPDF}>
              <FileText className="w-4 h-4 text-red-600" /> Resumen General (.pdf)
            </button>
            <button className={btnOutline} onClick={handleExportExcel}>
              <FileSpreadsheet className="w-4 h-4 text-green-600" /> Matriz RCMA (.xlsx)
            </button>
            <button className={btnOutline} disabled title="Próximamente">
              <PieChart className="w-4 h-4 text-blue-600" /> Estatus por Colegio
            </button>
            <button className={btnOutline} disabled title="Próximamente">
              <Filter className="w-4 h-4 text-slate-600" /> Reporte de Incidencias
            </button>
          </div>
        </div>
        <div className={`${cardClass} bg-slate-900 text-white border-none relative overflow-hidden flex flex-col justify-center`}>
          <div className="relative z-10">
            <img src="/logo.png" alt="Mano Amiga" className="h-14 w-auto object-contain mb-4" />
            <p className="text-slate-400 text-sm mb-6 max-w-sm">
              Todos los datos están sincronizados con tu base de datos central. Los cambios realizados en campo se reflejan aquí en tiempo real.
            </p>
            <div className="flex gap-2">
              <span className="px-3 py-1 bg-white/10 rounded-full text-[10px] font-bold uppercase tracking-widest">v2.0 Beta</span>
              <span className="px-3 py-1 bg-green-500/20 text-green-400 rounded-full text-[10px] font-bold uppercase tracking-widest">Sincronizado</span>
            </div>
          </div>
          <BarChart3 className="absolute -right-8 -bottom-8 w-48 h-48 text-white/5 -rotate-12" />
        </div>
      </div>
    </div>
  );
}
