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

interface Project  { id: string; name?: string; status?: string; progress?: number; territorio?: string; colegio?: string; budget?: number; tipo_proyecto?: string; priority?: string; responsible?: string; folio?: string; }
interface Solicitud { id: string; nombre_centro?: string; nombre_proyecto?: string; estatus?: string; created_at?: string; }
interface Ticket   { id: string; folio?: string; territorio?: string; colegio?: string; proyecto_id?: string; presupuesto?: number; estatus?: string; tipo_proyecto?: string; nombre_proveedor?: string; plan_financiamiento?: string; fecha?: string; }
interface Pendiente { id: string; nombre_proyecto?: string; estatus?: string; territorio?: string; colegio?: string; presupuesto?: number; prioridad?: string; }
interface Stats    { total: number; completed: number; avgProgress: number; }

// ─── Helpers de dibujo ────────────────────────────────────────────────────────
type Doc = InstanceType<typeof import('jspdf').jsPDF>;

const STATUS_COLORS_RGB: Record<string, [number,number,number]> = {
  en_proceso:  [59,  130, 246],
  en_espera:   [245, 158, 11],
  completado:  [34,  197, 94],
  cancelado:   [239, 68,  68],
  pausado:     [156, 163, 175],
  pendiente:   [139, 92,  246],
  aprobado:    [34,  197, 94],
};
const STATUS_LABELS: Record<string, string> = {
  en_proceso: 'En Proceso', en_espera: 'En Espera',
  completado: 'Completado', cancelado: 'Cancelado',
  pausado: 'Pausado', pendiente: 'Pendiente', aprobado: 'Aprobado',
};

function fmtMXN(n: number): string {
  return n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 });
}

// ─── Gráfica de barras horizontales (por estatus) ─────────────────────────────
function drawHorizontalBars(
  doc: Doc, x: number, y: number, w: number,
  data: { label: string; value: number; color: [number,number,number] }[],
  title: string
): number {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total === 0) return y;

  doc.setFontSize(10); doc.setFont('helvetica', 'bold'); doc.setTextColor(30, 30, 30);
  doc.text(title, x, y); y += 6;

  const barW = w - 30; const barH = 6; const gap = 9;
  data.forEach(item => {
    if (item.value === 0) return;
    const pct = item.value / total;
    const filled = Math.max(2, Math.round(pct * barW));
    // Label izquierda
    doc.setFontSize(7.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(80, 80, 80);
    doc.text(item.label.length > 14 ? item.label.slice(0,12)+'…' : item.label, x, y);
    // Barra fondo
    doc.setFillColor(241, 245, 249); doc.rect(x + 28, y - barH + 1, barW, barH, 'F');
    // Barra rellena
    doc.setFillColor(...item.color); doc.rect(x + 28, y - barH + 1, filled, barH, 'F');
    // Valor
    doc.setFontSize(7); doc.setFont('helvetica', 'bold'); doc.setTextColor(30, 30, 30);
    doc.text(String(item.value), x + 28 + barW + 2, y);
    y += gap;
  });
  return y + 3;
}

// ─── Cajas de KPI ─────────────────────────────────────────────────────────────
function drawKPIBoxes(
  doc: Doc, x: number, y: number, W: number,
  boxes: { label: string; value: string; color: [number,number,number] }[]
): number {
  const n = boxes.length;
  const bw = (W - 40 - (n - 1) * 4) / n;
  boxes.forEach((box, i) => {
    const bx = x + i * (bw + 4);
    doc.setFillColor(...box.color); doc.rect(bx, y, bw, 16, 'F');
    doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold');
    // Ajuste dinámico de fuente para que el label siempre quepa
    const fs = box.label.length > 17 ? 5.5 : box.label.length > 14 ? 6 : 6.5;
    doc.setFontSize(fs);
    doc.text(box.label, bx + bw / 2, y + 5.5, { align: 'center' });
    doc.setFontSize(10); doc.setFont('helvetica', 'bold');
    doc.text(box.value, bx + bw / 2, y + 13.5, { align: 'center' });
  });
  return y + 22;
}

// ─── Stacked bar (distribución de estatus) ────────────────────────────────────
function drawStackedBar(
  doc: Doc, x: number, y: number, w: number,
  segments: { value: number; color: [number,number,number]; label: string }[],
  title: string
): number {
  const total = segments.reduce((s, d) => s + d.value, 0);
  if (total === 0) return y;
  doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(30, 30, 30);
  doc.text(title, x, y); y += 5;
  const barH = 10; let cx = x;
  segments.forEach(seg => {
    if (seg.value === 0) return;
    const sw = Math.max(2, Math.round((seg.value / total) * w));
    doc.setFillColor(...seg.color); doc.rect(cx, y, sw, barH, 'F');
    if (sw > 12) {
      doc.setFontSize(6.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(255, 255, 255);
      doc.text(String(seg.value), cx + sw / 2, y + 6.5, { align: 'center' });
    }
    cx += sw;
  });
  // Leyenda
  y += barH + 4;
  let lx = x;
  segments.filter(s => s.value > 0).forEach(seg => {
    doc.setFillColor(...seg.color); doc.rect(lx, y, 4, 4, 'F');
    doc.setFontSize(6.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(80, 80, 80);
    const txt = `${seg.label} (${seg.value})`;
    doc.text(txt, lx + 6, y + 3.5);
    lx += doc.getTextWidth(txt) + 10;
    if (lx > x + w) { lx = x; y += 7; }
  });
  return y + 8;
}

// ─── Tabla genérica ────────────────────────────────────────────────────────────
function drawTable(
  doc: Doc, y: number, W: number,
  headers: { label: string; x: number; align?: 'left' | 'right' | 'center' }[],
  rows: string[][],
  maxRows = 40
): number {
  const doc2 = doc as any;
  doc.setFillColor(241, 245, 249); doc.rect(18, y - 4, W - 36, 9, 'F');
  doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.setTextColor(100, 116, 139);
  headers.forEach(h => doc.text(h.label, h.x, y, { align: h.align ?? 'left' }));
  y += 7;
  doc.setDrawColor(220, 220, 220); doc.line(20, y, W - 20, y); y += 2;
  doc.setFont('helvetica', 'normal'); doc.setTextColor(30, 30, 30);
  rows.slice(0, maxRows).forEach((row, i) => {
    if (y > getH() - 30) { doc.addPage(); y = 20; }
    if (i % 2 === 0) { doc.setFillColor(248, 250, 252); doc.rect(18, y - 4, W - 36, 8, 'F'); }
    doc.setFontSize(8);
    row.forEach((cell, ci) => {
      const h = headers[ci];
      const nextX = ci < headers.length - 1 ? headers[ci + 1].x : (W - 18);
      const maxW  = nextX - h.x - 2;
      // Usar medición exacta de texto para truncar solo si es necesario
      let txt = String(cell ?? '—');
      if (doc2.getTextWidth && doc2.getTextWidth(txt) > maxW) {
        while (txt.length > 1 && doc2.getTextWidth(txt + '…') > maxW) {
          txt = txt.slice(0, -1);
        }
        txt = txt + '…';
      }
      doc.text(txt, h.x, y, { align: h.align ?? 'left' });
    });
    y += 8;
  });
  if (rows.length > maxRows) {
    y += 2; doc.setFontSize(8); doc.setTextColor(100, 116, 139);
    doc.text(`Mostrando ${maxRows} de ${rows.length} registros.`, 20, y); y += 6;
  }
  return y;
}

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

// ─── Export PDF mejorado ──────────────────────────────────────────────────────
async function exportResumenPDF({ stats, projects, checklists, solicitudes, tickets, pendientes, ticketsMas, minimos, anteproyectos, solicitudesAll }: {
  stats: Stats; projects: Project[]; checklists: unknown[];
  solicitudes: Solicitud[]; tickets: Ticket[]; pendientes: Pendiente[];
  ticketsMas: any[]; minimos: any[]; anteproyectos: any[]; solicitudesAll: any[];
}): Promise<void> {
  const JsPDF = await loadJsPDF();
  const doc = new JsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const now = new Date().toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' });
  let W = 210; let y = 20;
  const getH = () => (doc as any).internal.pageSize.getHeight();

  // Cambiar a horizontal (landscape) para secciones de tablas
  const switchToLandscape = () => {
    doc.addPage([297, 210]);
    W = 297; y = 20;
  };

  const section = (title: string) => {
    const H = getH();
    if (y > H - 40) { doc.addPage(); y = 20; }
    y += 4;
    doc.setFillColor(15, 23, 42); doc.rect(18, y - 4, W - 36, 10, 'F');
    doc.setFontSize(10); doc.setFont('helvetica', 'bold'); doc.setTextColor(255, 255, 255);
    doc.text(title, 22, y + 2); y += 12;
  };
  const divider = () => {
    doc.setDrawColor(220, 220, 220); doc.line(20, y, W - 20, y); y += 5;
  };

  // ─── PORTADA ───────────────────────────────────────────────────────────────
  doc.setFillColor(15, 23, 42); doc.rect(0, 0, W, 35, 'F');
  doc.setFontSize(17); doc.setFont('helvetica', 'bold'); doc.setTextColor(255, 255, 255);
  doc.text('Reporte General — Colegios Mano Amiga', 20, 15);
  doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(180, 180, 200);
  doc.text('Sistema RCMA  ·  Generado el ' + now, 20, 24);
  doc.setFontSize(8); doc.setTextColor(100, 116, 139);
  doc.text('Documento confidencial — solo para uso interno', 20, 31);
  try {
    const logoImg = await new Promise<string>((res, rej) => {
      const img = new Image(); img.crossOrigin = 'anonymous';
      img.onload = () => { const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; c.getContext('2d')!.drawImage(img, 0, 0); res(c.toDataURL('image/png')); };
      img.onerror = rej; img.src = '/logo.png';
    });
    doc.addImage(logoImg, 'PNG', W - 38, 3, 26, 26);
  } catch { /* sin logo */ }
  y = 46;

  // ─── SECCIÓN 1: KPIs Ejecutivos ────────────────────────────────────────────
  section('1. Resumen Ejecutivo');
  const active    = projects.filter(p => p.status !== 'completado' && p.status !== 'cancelado');
  const completed = projects.filter(p => p.status === 'completado');
  const budgetProj = projects.reduce((s, p) => s + (p.budget ?? 0), 0);
  const budgetTick = tickets.reduce((s, t) => s + (t.presupuesto ?? 0), 0);
  const budgetAnte = anteproyectos.reduce((s: number, a: any) => s + ((a.presupuesto as number) ?? 0), 0);
  const avgA = active.length > 0 ? Math.round(active.reduce((a, p) => a + (p.progress ?? 0), 0) / active.length) : 0;

  // KPIs fila 1
  y = drawKPIBoxes(doc, 20, y, W, [
    { label: 'Proy. Activos',  value: String(active.length),       color: [59, 130, 246] },
    { label: 'Completados',    value: String(completed.length),    color: [34, 197, 94]  },
    { label: 'Avance Prom.',   value: avgA + '%',                  color: [99, 102, 241] },
    { label: 'Tickets TCMM',   value: String(tickets.length),      color: [239, 68,  68] },
    { label: 'Pendientes',     value: String(pendientes.length),   color: [245, 158, 11] },
    { label: 'Inspecciones',   value: String(checklists.length),   color: [20,  184, 166] },
  ]);
  y += 4;

  // KPIs fila 2 — nuevos módulos
  const tmasPend   = ticketsMas.filter((t: any) => t.estatus === 'pendiente' || t.estatus === 'en_revision').length;
  const tmasAut    = ticketsMas.filter((t: any) => t.estatus === 'autorizado').length;
  const minCumple  = minimos.filter((m: any) => m.resultado === 'completo').length;
  const pctMin     = minimos.length > 0 ? Math.round((minCumple / minimos.length) * 100) : 0;
  y = drawKPIBoxes(doc, 20, y, W, [
    { label: 'MAS Pendientes', value: String(tmasPend),             color: [13, 138, 126] },
    { label: 'MAS Autorizados', value: String(tmasAut),             color: [22, 163, 74]  },
    { label: '% Mínimos OK',   value: pctMin + '%',                color: pctMin >= 80 ? [22,163,74] : pctMin >= 50 ? [202,138,4] : [220,38,38] },
    { label: 'Anteproyectos',  value: String(anteproyectos.length), color: [99, 102, 241] },
    { label: 'Solicitudes',    value: String(solicitudesAll.length),color: [168, 85, 247] },
    { label: 'Urgentes',       value: String(projects.filter(p => p.priority === 'urgente' && p.status !== 'completado').length), color: [220, 38, 38] },
  ]);
  y += 4;

  // Resumen financiero
  doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(30, 30, 30);
  doc.text('Resumen Financiero', 20, y); y += 5;
  const fw = (W - 40 - 12) / 4;
  [
    { label: 'Presupuesto Proyectos',  value: fmtMXN(budgetProj),                    color: [59, 130, 246]  as [number,number,number] },
    { label: 'Presupuesto Tickets',    value: fmtMXN(budgetTick),                    color: [239, 68, 68]   as [number,number,number] },
    { label: 'Presupuesto Anteproyectos', value: fmtMXN(budgetAnte),                color: [99, 102, 241]  as [number,number,number] },
    { label: 'Total General',          value: fmtMXN(budgetProj + budgetTick + budgetAnte), color: [15, 23, 42] as [number,number,number] },
  ].forEach((box, i) => {
    const bx = 20 + i * (fw + 4);
    doc.setFillColor(...box.color); doc.rect(bx, y, fw, 18, 'F');
    doc.setFontSize(6.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(255, 255, 255);
    doc.text(box.label, bx + fw / 2, y + 5, { align: 'center' });
    doc.setFontSize(8.5); doc.text(box.value, bx + fw / 2, y + 14, { align: 'center' });
  });
  y += 26;

  // Desglose territorial
  if (y > getH() - 40) { doc.addPage(); y = 20; }
  doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(30, 30, 30);
  doc.text('Estado por Territorio', 20, y); y += 5;
  const tRows = ['NORTE', 'MEXICO', 'FMA'].map(ter => {
    const tp = projects.filter(p => p.territorio === ter);
    const tt = tickets.filter((t: any) => t.territorio === ter);
    const tm = ticketsMas.filter((t: any) => t.territorio === ter);
    const tact = tp.filter(p => p.status !== 'completado' && p.status !== 'cancelado').length;
    return [ter, String(tp.length), String(tact), String(tt.length), String(tm.length)];
  });
  y = drawTable(doc, y, 210, [
    { label: 'Territorio',       x: 20  },
    { label: 'Total Proyectos',  x: 72  },
    { label: 'Activos',          x: 118 },
    { label: 'Tickets TCMM',    x: 148 },
    { label: 'Ticket MAS',      x: 178 },
  ], tRows, 10);
  y += 6;

  // ─── SECCIÓN 2: Distribución de Proyectos ─────────────────────────────────
  section('2. Distribución de Proyectos');

  const statusKeys = ['en_proceso', 'en_espera', 'pausado', 'completado', 'cancelado'];
  const projByStatus = statusKeys.map(k => ({
    label: STATUS_LABELS[k] ?? k,
    value: projects.filter(p => p.status === k).length,
    color: STATUS_COLORS_RGB[k] ?? [150, 150, 150] as [number,number,number],
  }));

  // Stacked bar de estatus
  y = drawStackedBar(doc, 20, y, W - 40, projByStatus, 'Proyectos por Estatus');
  y += 4;

  // Barras horizontales por estatus
  y = drawHorizontalBars(doc, 20, y, (W - 40) / 2, projByStatus, 'Detalle por Estatus');

  // Barras por territorio (lado derecho)
  const territories = Array.from(new Set(projects.map(p => p.territorio ?? 'Sin territorio'))).sort();
  const terBars = territories.map(ter => ({
    label: ter,
    value: projects.filter(p => (p.territorio ?? 'Sin territorio') === ter).length,
    color: [59, 130, 246] as [number,number,number],
  }));
  const savedY = y;
  const halfX = 20 + (W - 40) / 2 + 6;
  y = savedY - (projByStatus.filter(s => s.value > 0).length * 9 + 6);
  y = drawHorizontalBars(doc, halfX, y, (W - 40) / 2, terBars, 'Proyectos por Territorio');
  if (y < savedY) y = savedY;
  y += 2;

  // ─── SECCIÓN 3: Análisis por Colegio ──────────────────────────────────────
  if (y > getH() - 40) { doc.addPage(); y = 20; }
  section('3. Actividad por Colegio');

  const colegios = Array.from(new Set(projects.map(p => p.colegio).filter(Boolean))).sort() as string[];
  const topColegios = colegios
    .map(c => ({ label: c, value: projects.filter(p => p.colegio === c).length, color: [99, 102, 241] as [number,number,number] }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 12);

  const half = Math.ceil(topColegios.length / 2);
  const startY3 = y;
  y = drawHorizontalBars(doc, 20, startY3, (W - 44) / 2, topColegios.slice(0, half), 'Colegio');
  const endLeft = y;
  y = drawHorizontalBars(doc, 20 + (W - 44) / 2 + 6, startY3, (W - 44) / 2, topColegios.slice(half), '');
  y = Math.max(y, endLeft) + 2;

  // ─── CAMBIO A HORIZONTAL para secciones de tablas ────────────────────────
  switchToLandscape();
  section('4. Tickets TCMM');

  // Distribución tickets por estatus
  const ticketStatuses = ['aprobado', 'cancelado'];
  const tickByStatus = ticketStatuses.map(k => ({
    label: k.charAt(0).toUpperCase() + k.slice(1),
    value: tickets.filter(t => t.estatus === k).length,
    color: STATUS_COLORS_RGB[k] ?? [150, 150, 150] as [number,number,number],
  }));
  y = drawStackedBar(doc, 20, y, W - 40, tickByStatus, 'Tickets por Estatus');
  y += 2;

  // Tabla tickets
  const ticketRows = tickets.slice(0, 35).map(t => [
    t.folio ?? '—',
    t.colegio ?? t.territorio ?? '—',
    t.tipo_proyecto ?? '—',
    t.nombre_proveedor ?? '—',
    t.presupuesto != null ? fmtMXN(t.presupuesto) : '—',
    t.estatus === 'aprobado' ? 'Aprobado' : t.estatus === 'cancelado' ? 'Cancelado' : (t.estatus ?? '—'),
  ]);

  y = drawTable(doc, y, W, [
    { label: 'Folio',      x: 20  },
    { label: 'Colegio',    x: 56  },
    { label: 'Tipo',       x: 88  },
    { label: 'Proveedor',  x: 130 },
    { label: 'Monto',      x: 210, align: 'right' },
    { label: 'Estatus',    x: 245 },
  ], ticketRows, 35);
  y += 2;

  // ─── SECCIÓN 5: Ticket MAS ────────────────────────────────────────────────
  if (y > getH() - 40) { doc.addPage(); y = 20; }
  section('5. Ticket MAS');

  const tmasTotal = ticketsMas.length;
  const tmasPendiente  = ticketsMas.filter((t: any) => t.estatus === 'pendiente').length;
  const tmasRevision   = ticketsMas.filter((t: any) => t.estatus === 'en_revision').length;
  const tmasAutorizado = ticketsMas.filter((t: any) => t.estatus === 'autorizado').length;
  const tmasCancelado  = ticketsMas.filter((t: any) => t.estatus === 'cancelado').length;

  y = drawKPIBoxes(doc, 20, y, W, [
    { label: 'Total Tickets MAS', value: String(tmasTotal),      color: [15, 23, 42]   },
    { label: 'Pendientes',        value: String(tmasPendiente),  color: [245, 158, 11] },
    { label: 'En Revisión',       value: String(tmasRevision),   color: [6, 182, 212]  },
    { label: 'Autorizados',       value: String(tmasAutorizado), color: [22, 163, 74]  },
    { label: 'Cancelados',        value: String(tmasCancelado),  color: [239, 68, 68]  },
  ]);
  y += 4;

  if (ticketsMas.length > 0) {
    const tmasRows = ticketsMas.slice(0, 30).map((t: any) => {
      const tmasEstLbl: Record<string,string> = { autorizado:'Autorizado', pendiente:'Pendiente', en_revision:'En Revisión', cancelado:'Cancelado' };
      const fechaStr = t.created_at ? new Date(t.created_at).toLocaleDateString('es-MX', { day:'2-digit', month:'2-digit', year:'numeric' }) : '—';
      return [
        t.folio ?? '—', t.colegio ?? '—', t.clasificacion ?? '—',
        t.territorio ?? '—',
        tmasEstLbl[t.estatus as string] ?? (t.estatus ?? '—'),
        fechaStr,
      ];
    });
    y = drawTable(doc, y, W, [
      { label: 'Folio',         x: 20  },
      { label: 'Colegio',       x: 65  },
      { label: 'Clasificación', x: 140 },
      { label: 'Territorio',    x: 210 },
      { label: 'Estatus',       x: 240 },
      { label: 'Fecha',         x: 265 },
    ], tmasRows, 30);
  } else {
    doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(150, 150, 150);
    doc.text('Sin Tickets MAS registrados.', 20, y); y += 10;
  }
  y += 4;

  // ─── SECCIÓN 6: Mínimos Indispensables ───────────────────────────────────
  if (y > getH() - 40) { doc.addPage(); y = 20; }
  section('6. Mínimos Indispensables');

  const minTotal   = minimos.length;
  const minCumpleN = minimos.filter((m: any) => m.resultado === 'completo').length;
  const minNoCumpl = minimos.filter((m: any) => m.resultado === 'incompleto').length;
  const minEnProc  = minimos.filter((m: any) => m.resultado === 'en_proceso').length;
  const pctMinG    = minTotal > 0 ? Math.round((minCumpleN / minTotal) * 100) : 0;

  y = drawKPIBoxes(doc, 20, y, W, [
    { label: 'Evaluados',    value: String(minTotal),   color: [15, 23, 42]   },
    { label: 'Sí Cumplen',   value: String(minCumpleN), color: [22, 163, 74]  },
    { label: 'No Cumplen',   value: String(minNoCumpl), color: [220, 38, 38]  },
    { label: 'En Proceso',   value: String(minEnProc),  color: [202, 138, 4]  },
    { label: '% Cumplimiento', value: pctMinG + '%',   color: pctMinG >= 80 ? [22,163,74] : pctMinG >= 50 ? [202,138,4] : [220,38,38] },
  ]);
  y += 4;

  // Barra de progreso
  doc.setFillColor(226, 232, 240); doc.roundedRect(20, y, W - 40, 10, 2, 2, 'F');
  const barColor: [number,number,number] = pctMinG >= 80 ? [22,163,74] : pctMinG >= 50 ? [202,138,4] : [220,38,38];
  doc.setFillColor(...barColor); doc.roundedRect(20, y, Math.max(((W - 40) * pctMinG) / 100, 4), 10, 2, 2, 'F');
  doc.setFontSize(7.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(255, 255, 255);
  if (pctMinG > 8) doc.text(pctMinG + '% de los colegios evaluados cumplen con los mínimos', 24, y + 7);
  y += 16;

  if (minimos.length > 0) {
    const ITEM_PRIO_PDF: Record<string, string> = {
      puertas_ancho:'P1',pasillos:'P1',tablero:'P1',circuitos:'P1',polo_tierra:'P1',agua_red:'P1',gas:'P1',pasillos_libres:'P1',const_pc:'P1',pipc:'P1',seg_estr:'P1',extintores:'P1',senal_emerg:'P1',cisterna_limp:'P1',cert_extinct:'P1',
    };
    const minRows = minimos.slice(0, 30).map((m: any) => {
      const items: any[] = Array.isArray(m.items) ? m.items : [];
      const p1nc = items.filter((i: any) => (ITEM_PRIO_PDF[i.id] ?? 'P2') === 'P1' && i.estado === 'no_cumple').length;
      const activos = items.filter((i: any) => i.estado !== 'na').length;
      const cumpleN = items.filter((i: any) => i.estado === 'cumple').length;
      const pct = activos > 0 ? Math.round((cumpleN / activos) * 100) : 0;
      const res = m.resultado === 'completo' ? 'Sí Cumple' : m.resultado === 'incompleto' ? 'No Cumple' : 'En Proceso';
      const fechaMin = m.fecha ? new Date(m.fecha + 'T12:00:00').toLocaleDateString('es-MX', { day:'2-digit', month:'2-digit', year:'numeric' }) : '—';
      return [m.colegio ?? '—', m.territorio ?? '—', res, pct + '%', String(p1nc), fechaMin];
    });
    y = drawTable(doc, y, W, [
      { label: 'Colegio',          x: 20  },
      { label: 'Territorio',       x: 80  },
      { label: 'Resultado',        x: 120 },
      { label: '% Cumplimiento',   x: 162 },
      { label: 'Pend. Críticos',   x: 210 },
      { label: 'Fecha Evaluación', x: 248 },
    ], minRows, 30);
  } else {
    doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(150, 150, 150);
    doc.text('Sin evaluaciones de Mínimos Indispensables registradas.', 20, y); y += 10;
  }
  y += 4;

  // ─── SECCIÓN 7: Anteproyectos y Solicitudes ───────────────────────────────
  if (y > getH() - 40) { doc.addPage(); y = 20; }
  section('7. Anteproyectos y Solicitudes');

  // Sub-header anteproyectos
  doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(99, 102, 241);
  doc.text('Anteproyectos (' + anteproyectos.length + ')', 20, y); y += 4;
  doc.setDrawColor(199, 200, 246); doc.line(20, y, W - 20, y); y += 5;

  if (anteproyectos.length > 0) {
    const anteEstLbl: Record<string,string> = { en_revision:'En Revisión', entregado:'Entregado', aprobado:'Aprobado', rechazado:'Rechazado', pendiente:'Pendiente' };
    const anteRows = anteproyectos.slice(0, 25).map((a: any) => [
      a.territorio ?? '—', a.colegio ?? '—', a.nombre_proyecto ?? '—',
      a.tipo_proyecto ?? '—',
      anteEstLbl[a.estatus as string] ?? (a.estatus ?? '—'),
      a.presupuesto != null ? fmtMXN(a.presupuesto as number) : 'Sin dato',
    ]);
    y = drawTable(doc, y, W, [
      { label: 'Territorio', x: 20  },
      { label: 'Colegio',    x: 52  },
      { label: 'Proyecto',   x: 88  },
      { label: 'Tipo',       x: 190 },
      { label: 'Estatus',    x: 228 },
      { label: 'Presupuesto',x: 262, align: 'right' },
    ], anteRows, 25);
  } else {
    doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(150, 150, 150);
    doc.text('Sin anteproyectos registrados.', 20, y); y += 8;
  }
  y += 6;

  // Sub-header solicitudes
  if (y > getH() - 40) { doc.addPage(); y = 20; }
  doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(168, 85, 247);
  doc.text('Solicitudes de Proyecto (' + solicitudesAll.length + ')', 20, y); y += 4;
  doc.setDrawColor(216, 180, 254); doc.line(20, y, W - 20, y); y += 5;

  if (solicitudesAll.length > 0) {
    const solRows = solicitudesAll.slice(0, 25).map((s: any) => [
      s.nombre_centro ?? '—', s.nombre_proyecto ?? '—',
      s.nombre_solicitante ?? '—', s.tipo_iniciativa ?? '—',
      s.estatus ?? '—',
      s.created_at ? new Date(s.created_at).toLocaleDateString('es-MX', { day:'2-digit', month:'2-digit', year:'numeric' }) : '—',
    ]);
    y = drawTable(doc, y, W, [
      { label: 'Centro',      x: 20  },
      { label: 'Proyecto',    x: 76  },
      { label: 'Solicitante', x: 155 },
      { label: 'Tipo',        x: 208 },
      { label: 'Estatus',     x: 232 },
      { label: 'Fecha',       x: 258 },
    ], solRows, 25);
  } else {
    doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(150, 150, 150);
    doc.text('Sin solicitudes registradas.', 20, y); y += 8;
  }
  y += 4;

  // ─── SECCIÓN 8: Proyectos Activos ─────────────────────────────────────────
  if (y > getH() - 40) { doc.addPage(); y = 20; }
  section('8. Detalle Proyectos Activos');

  // Barra de avance promedio visual
  doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.setTextColor(30, 30, 30);
  doc.text('Avance promedio de proyectos activos:', 20, y);
  doc.setFillColor(241, 245, 249); doc.rect(20, y + 3, W - 40, 8, 'F');
  doc.setFillColor(59, 130, 246); doc.rect(20, y + 3, Math.round(((W - 40) * avgA) / 100), 8, 'F');
  doc.setFontSize(7.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(255, 255, 255);
  if (avgA > 5) doc.text(avgA + '% de avance promedio', 24, y + 9);
  y += 18;

  const activeRows = active.map(p => [
    p.folio ?? '—',
    p.name ?? '—',
    p.colegio ?? '—',
    p.status ? (STATUS_LABELS[p.status] ?? p.status) : '—',
    (p.progress ?? 0) + '%',
    p.priority ?? '—',
  ]);
  y = drawTable(doc, y, W, [
    { label: 'Folio',     x: 20  },
    { label: 'Proyecto',  x: 58  },
    { label: 'Colegio',   x: 178 },
    { label: 'Estatus',   x: 214 },
    { label: 'Avance',    x: 248 },
    { label: 'Prioridad', x: 264 },
  ], activeRows, 40);
  y += 2;

  // ─── SECCIÓN 6: Proyectos Completados ─────────────────────────────────────
  if (completed.length > 0) {
    if (y > getH() - 40) { doc.addPage(); y = 20; }
    section('9. Proyectos Completados');
    const completedRows = completed.map(p => [
      p.folio ?? '—',
      p.name ?? '—',
      p.colegio ?? '—',
      p.tipo_proyecto ?? '—',
      p.budget != null ? fmtMXN(p.budget) : '—',
    ]);
    y = drawTable(doc, y, W, [
      { label: 'Folio',       x: 20  },
      { label: 'Proyecto',    x: 60  },
      { label: 'Colegio',     x: 188 },
      { label: 'Tipo',        x: 224 },
      { label: 'Presupuesto', x: 260, align: 'right' },
    ], completedRows, 30);
    y += 2;
  }

  // ─── SECCIÓN 7: Pendientes ────────────────────────────────────────────────
  if (pendientes.length > 0) {
    if (y > getH() - 40) { doc.addPage(); y = 20; }
    section('10. Pendientes');

    const pendStatuses = ['pendiente', 'en_proceso', 'completado'];
    const pendByStatus = pendStatuses.map(k => ({
      label: STATUS_LABELS[k] ?? k,
      value: pendientes.filter(p => p.estatus === k).length,
      color: STATUS_COLORS_RGB[k] ?? [150, 150, 150] as [number,number,number],
    }));
    y = drawStackedBar(doc, 20, y, W - 40, pendByStatus, 'Pendientes por Estatus');
    y += 4;

    const pendRows = pendientes.slice(0, 30).map(p => [
      p.territorio ?? '—',
      p.colegio ?? '—',
      p.nombre_proyecto ?? '—',
      p.prioridad ?? '—',
      p.estatus ?? '—',
      p.presupuesto != null ? fmtMXN(p.presupuesto) : '—',
    ]);
    y = drawTable(doc, y, W, [
      { label: 'Territorio', x: 20  },
      { label: 'Colegio',    x: 56  },
      { label: 'Pendiente',  x: 92  },
      { label: 'Prioridad',  x: 196 },
      { label: 'Estatus',    x: 224 },
      { label: 'Monto',      x: 260, align: 'right' },
    ], pendRows, 30);
    y += 2;
  }

  // ─── PIE DE PÁGINA ─────────────────────────────────────────────────────────
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    const pH = (doc as any).internal.pageSize.getHeight();
    const pW = (doc as any).internal.pageSize.getWidth();
    doc.setFillColor(15, 23, 42); doc.rect(0, pH - 11, pW, 11, 'F');
    doc.setFontSize(7); doc.setFont('helvetica', 'normal'); doc.setTextColor(160, 160, 180);
    doc.text('Sistema RCMA  ·  Colegios Mano Amiga  ·  Documento confidencial', 20, pH - 5);
    doc.text('Página ' + i + ' de ' + pages, pW - 20, pH - 5, { align: 'right' });
  }

  doc.save('reporte-mano-amiga-' + Date.now() + '.pdf');
}

// ─── Excel Export (sin cambios) ───────────────────────────────────────────────
async function loadXLSX() {
  type XLSXType = typeof import('xlsx');
  const w = window as Window & { XLSX?: XLSXType; XlsxStyle?: XLSXType };
  if (w.XLSX?.utils) return w.XLSX;
  if (w.XlsxStyle?.utils) return w.XlsxStyle;
  await new Promise<void>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://unpkg.com/xlsx-js-style@1.2.0/dist/xlsx.bundle.js';
    s.onload = () => resolve(); s.onerror = () => reject(new Error('XLSX load error'));
    document.head.appendChild(s);
  });
  const lib = (w.XLSX?.utils ? w.XLSX : w.XlsxStyle) as XLSXType;
  if (!lib?.utils) throw new Error('xlsx-js-style no cargó correctamente');
  return lib;
}

async function exportMatrizExcel(data: {
  projects: unknown[]; checklists: unknown[]; tickets: unknown[];
  pendientes: unknown[]; anteproyectos: unknown[]; solicitudes: unknown[];
  minimos: unknown[];
}) {
  const XLSX = await loadXLSX();
  const wb   = XLSX.utils.book_new();
  const now  = new Date().toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' });

  const bdr = {
    top:    { style: 'thin', color: { rgb: 'FFD1D5DB' } },
    bottom: { style: 'thin', color: { rgb: 'FFD1D5DB' } },
    left:   { style: 'thin', color: { rgb: 'FFD1D5DB' } },
    right:  { style: 'thin', color: { rgb: 'FFD1D5DB' } },
  };
  const sTitle    = { font: { bold: true, sz: 13, name: 'Calibri', color: { rgb: 'FFFFFFFF' } }, fill: { patternType: 'solid', fgColor: { rgb: 'FF0F172A' } }, alignment: { horizontal: 'left', vertical: 'center' } };
  const sSubtitle = { font: { italic: true, sz: 9, name: 'Calibri', color: { rgb: 'FFD1D5DB' } }, fill: { patternType: 'solid', fgColor: { rgb: 'FF0F172A' } }, alignment: { horizontal: 'right', vertical: 'center' } };
  const sBlankDark = { fill: { patternType: 'solid', fgColor: { rgb: 'FF0F172A' } } };
  const sHeader   = { font: { bold: true, sz: 10, name: 'Calibri', color: { rgb: 'FFFFFFFF' } }, fill: { patternType: 'solid', fgColor: { rgb: 'FF1E40AF' } }, alignment: { horizontal: 'center', vertical: 'center', wrapText: true }, border: bdr };
  const sData     = (alt: boolean) => ({ font: { sz: 10, name: 'Calibri', color: { rgb: 'FF111827' } }, fill: { patternType: alt ? 'solid' : 'none', fgColor: { rgb: alt ? 'FFF0F4FF' : 'FFFFFFFF' } }, alignment: { vertical: 'center' }, border: bdr });
  const sDataCenter = (alt: boolean) => ({ ...sData(alt), alignment: { horizontal: 'center', vertical: 'center' } });
  const sDataRight  = (alt: boolean) => ({ ...sData(alt), alignment: { horizontal: 'right', vertical: 'center' }, numFmt: '"$"#,##0.00' });
  const sTotal    = { font: { bold: true, sz: 10, name: 'Calibri', color: { rgb: 'FF1E40AF' } }, fill: { patternType: 'solid', fgColor: { rgb: 'FFEFF6FF' } }, border: bdr };

  function buildSheet(name: string, sheetTitle: string, headers: string[], rows: (string | number | null | undefined)[][], colWidths: number[], moneyCol?: number | number[]) {
    const ws: Record<string, unknown> = {};
    const nCols = headers.length; const nRows = rows.length;
    const splitCol = Math.floor(nCols * 0.6);
    for (let c = 0; c < nCols; c++) {
      const v = c === 0 ? sheetTitle : c === splitCol ? `Generado: ${now}` : '';
      ws[XLSX.utils.encode_cell({ r: 0, c })] = { v, t: 's', s: c >= splitCol ? sSubtitle : sTitle };
    }
    for (let c = 0; c < nCols; c++) ws[XLSX.utils.encode_cell({ r: 1, c })] = { v: '', t: 's', s: sBlankDark };
    headers.forEach((h, c) => { ws[XLSX.utils.encode_cell({ r: 2, c })] = { v: h, t: 's', s: sHeader }; });
    rows.forEach((row, ri) => {
      const alt = ri % 2 === 1;
      row.forEach((val, ci) => {
        const isMoney = moneyCol !== undefined && (Array.isArray(moneyCol) ? moneyCol.includes(ci) : ci === moneyCol);
        const isNumber = typeof val === 'number';
        const cell: Record<string, unknown> = { v: val ?? '—', t: isNumber ? 'n' : 's', s: isMoney ? sDataRight(alt) : isNumber ? sDataCenter(alt) : sData(alt) };
        if (isMoney) cell.z = '"$"#,##0.00';
        ws[XLSX.utils.encode_cell({ r: ri + 3, c: ci })] = cell;
      });
    });
    const totalRow = nRows + 3;
    ws[XLSX.utils.encode_cell({ r: totalRow, c: 0 })] = { v: `Total de registros: ${nRows}`, t: 's', s: sTotal };
    for (let c = 1; c < nCols; c++) ws[XLSX.utils.encode_cell({ r: totalRow, c })] = { v: '', t: 's', s: sTotal };
    ws['!ref'] = `A1:${XLSX.utils.encode_cell({ r: totalRow, c: nCols - 1 })}`;
    ws['!cols'] = colWidths.map(w => ({ wch: w }));
    ws['!rows'] = [{ hpt: 26 }, { hpt: 4 }, { hpt: 22 }, ...rows.map(() => ({ hpt: 18 })), { hpt: 18 }];
    ws['!autofilter'] = { ref: `A3:${XLSX.utils.encode_cell({ r: 2, c: nCols - 1 })}` };
    ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: splitCol - 1 } }, { s: { r: 0, c: splitCol }, e: { r: 0, c: nCols - 1 } }, { s: { r: 1, c: 0 }, e: { r: 1, c: nCols - 1 } }];
    XLSX.utils.book_append_sheet(wb, ws as import('xlsx').WorkSheet, name);
  }

  const fmt = (d?: string | null) => d ? new Date(d).toLocaleDateString('es-MX') : '—';
  const num = (n?: number | null) => (n != null ? n : 0);

  buildSheet('📁 Proyectos', 'Proyectos — Sistema RCMA', ['Folio', 'Nombre del Proyecto', 'Estatus', 'Avance %', 'Territorio', 'Colegio', 'Responsable', 'Tipo', 'Prioridad', 'Fecha Inicio'],
    (data.projects as Record<string, unknown>[]).map(p => [p.folio ?? '—', p.name ?? '—', p.status ?? '—', p.progress ?? 0, p.territorio ?? '—', p.colegio ?? '—', p.responsible ?? '—', p.tipo_proyecto ?? '—', p.priority ?? '—', fmt(p.start_date as string)]),
    [12, 36, 14, 10, 12, 14, 26, 22, 12, 14]);

  buildSheet('🎫 Tickets TCMM', 'Tickets TCMM — Sistema RCMA', ['Folio', 'Territorio', 'Colegio', 'ECO', 'Tipo', 'Estatus', 'Proveedor', 'Presupuesto', 'Plan Financ.', 'Ticket Físico', 'Fecha'],
    (data.tickets as Record<string, unknown>[]).map(t => [t.folio ?? '—', t.territorio ?? '—', t.colegio ?? '—', t.eco ?? '—', t.tipo_proyecto ?? '—', t.estatus ?? '—', t.nombre_proveedor ?? '—', num(t.presupuesto as number), t.plan_financiamiento ?? '—', t.ticket_fisico ? 'Sí' : 'No', fmt(t.fecha as string)]),
    [14, 12, 14, 26, 18, 12, 24, 16, 16, 13, 14], 7);

  buildSheet('⏳ Pendientes', 'Pendientes — Sistema RCMA', ['Territorio', 'Colegio', 'Proyecto', 'ECO', 'Tipo', 'Prioridad', 'Estatus', 'Asignación', 'Presupuesto', 'Última Actualiz.'],
    (data.pendientes as Record<string, unknown>[]).map(p => [p.territorio ?? '—', p.colegio ?? '—', p.nombre_proyecto ?? '—', p.eco ?? '—', p.tipo_proyecto ?? '—', p.prioridad ?? '—', p.estatus ?? '—', p.asignacion ?? '—', num(p.presupuesto as number), fmt(p.fecha_actualizacion as string)]),
    [12, 14, 34, 26, 18, 12, 14, 24, 16, 18], 8);

  buildSheet('📐 Anteproyectos', 'Anteproyectos — Sistema RCMA', ['Territorio', 'Colegio', 'Proyecto', 'ECO', 'Tipo', 'Prioridad', 'Estatus', 'Asignación', 'Presupuesto', 'Última Actualiz.'],
    (data.anteproyectos as Record<string, unknown>[]).map(a => [a.territorio ?? '—', a.colegio ?? '—', a.nombre_proyecto ?? '—', a.eco ?? '—', a.tipo_proyecto ?? '—', a.prioridad ?? '—', a.estatus ?? '—', a.asignacion ?? '—', num(a.presupuesto as number), fmt(a.fecha_actualizacion as string)]),
    [12, 14, 34, 26, 18, 12, 14, 24, 16, 18], 8);

  // Hoja: Presupuesto vs Real
  buildSheet('💰 Presupuesto vs Real', 'Presupuesto vs Real — Sistema RCMA',
    ['Folio', 'Proyecto', 'Territorio', 'Colegio', 'Estatus', 'Presupuesto Inicial', 'Costo Real', 'Diferencia', '% Ahorro/Sobrecosto'],
    (data.projects as Record<string, unknown>[]).map(p => {
      const budget = ((p.budget as number | null) ?? 0);
      const real   = ((p.costo_real as number | null) ?? 0);
      const diff   = budget - real;
      const pct    = budget > 0 ? (((diff / budget) * 100).toFixed(1) + '%') : '—';
      return [
        String(p.folio ?? '—'), String(p.name ?? '—'), String(p.territorio ?? '—'),
        String(p.colegio ?? '—'), String(p.status ?? '—'),
        num(budget), num(real), num(diff), pct,
      ] as (string | number | null | undefined)[];
    }),
    [12, 36, 14, 16, 14, 20, 18, 18, 20], [5, 6, 7]);

  buildSheet('✅ Inspecciones', 'Checklists de Inspección — Sistema RCMA', ['Título', 'Colegio', 'Territorio', 'Inspector', 'Material', 'Estado General', 'Núm. Ítems', 'Fecha'],
    (data.checklists as Record<string, unknown>[]).map(c => [c.titulo ?? '—', c.colegio ?? '—', c.territorio ?? '—', c.inspector ?? 'Sin asignar', c.material ?? '—', c.overall_status ?? '—', Array.isArray(c.items) ? (c.items as unknown[]).length : 0, fmt((c.fecha ?? c.created_at) as string)]),
    [38, 14, 12, 24, 32, 16, 12, 14]);

  buildSheet('📩 Solicitudes', 'Solicitudes de Proyecto — Sistema RCMA', ['Centro', 'Proyecto', 'Solicitante', 'Puesto', 'Tipo Iniciativa', 'Costo Aprox.', 'Estatus', 'Fecha Solicitud', 'Fecha Inicio Prop.'],
    (data.solicitudes as Record<string, unknown>[]).map(s => [s.nombre_centro ?? '—', s.nombre_proyecto ?? '—', s.nombre_solicitante ?? '—', s.puesto_solicitante ?? '—', s.tipo_iniciativa ?? '—', num(s.costo_aproximado as number), s.estatus ?? '—', fmt(s.created_at as string), fmt(s.fecha_inicio_propuesta as string)]),
    [22, 34, 24, 20, 22, 16, 14, 18, 20], 5);

  // ── Mínimos Indispensables ────────────────────────────────────────────────
  const ITEM_PRIO: Record<string, string> = {
    puertas_ancho:'P1',pasillos:'P1',tablero:'P1',circuitos:'P1',polo_tierra:'P1',
    agua_red:'P1',gas:'P1',pasillos_libres:'P1',const_pc:'P1',pipc:'P1',
    seg_estr:'P1',extintores:'P1',senal_emerg:'P1',cisterna_limp:'P1',cert_extinct:'P1',
    aulas_m2:'P2',sanitarios:'P2',bebederos:'P2',iluminacion:'P2',drenaje:'P2',
    rampa_acceso:'P2',sia:'P2',sanitario_adapt:'P2',escalones:'P2',poliza_rc:'P2',
    simulacros:'P2',brigadas:'P2',cronograma:'P2',bitacora:'P2',fumigacion:'P2',
  };
  const resLabelMin: Record<string, string> = { completo: 'Si Cumple', en_proceso: 'En Proceso', incompleto: 'No Cumple' };
  const secNomMin: Record<string, string> = { construccion:'01 Construccion', instalaciones:'02 Instalaciones', accesibilidad:'03 Accesibilidad', seguridad:'04 Seguridad y PC', mantenimiento:'05 Mantenimiento' };
  const estadoLblMin: Record<string, string> = { cumple:'Cumple', no_cumple:'No Cumple', en_proceso:'En Proceso', na:'N/A' };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const minimosList = data.minimos as any[];

  const minimosRows: (string | number | null | undefined)[][] = minimosList.map(m => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const its: any[] = Array.isArray(m.items) ? m.items : [];
    const activos  = its.filter((i: any) => i.estado !== 'na');
    const cumpleN  = its.filter((i: any) => i.estado === 'cumple').length;
    const noCumple = its.filter((i: any) => i.estado === 'no_cumple').length;
    const enProc   = its.filter((i: any) => i.estado === 'en_proceso').length;
    const pct      = activos.length > 0 ? Math.round(cumpleN / activos.length * 100) : 0;
    const p1All    = its.filter((i: any) => (ITEM_PRIO[i.id as string] ?? 'P3') === 'P1' && i.estado !== 'na');
    const p2All    = its.filter((i: any) => (ITEM_PRIO[i.id as string] ?? 'P3') === 'P2' && i.estado !== 'na');
    const pctP1    = p1All.length > 0 ? Math.round(p1All.filter((i: any) => i.estado === 'cumple').length / p1All.length * 100) : 100;
    const pctP2    = p2All.length > 0 ? Math.round(p2All.filter((i: any) => i.estado === 'cumple').length / p2All.length * 100) : 100;
    const pendP1   = its.filter((i: any) => (ITEM_PRIO[i.id as string] ?? 'P3') === 'P1' && i.estado === 'no_cumple').length;
    const pendP2   = its.filter((i: any) => (ITEM_PRIO[i.id as string] ?? 'P3') === 'P2' && i.estado === 'no_cumple').length;
    const verif    = its.filter((i: any) => i.verificado_por).length;
    return [
      String(m.colegio ?? '—'), String(m.territorio ?? '—'), String(m.inspector ?? 'Sin asignar'),
      fmt(m.fecha as string), resLabelMin[m.resultado as string] ?? String(m.resultado ?? '—'),
      pct, pctP1, pctP2, cumpleN, noCumple, enProc, pendP1, pendP2, verif,
      fmt(m.created_at as string),
    ];
  });

  buildSheet('Minimos Indispensables', 'Minimos Indispensables — Sistema RCMA',
    ['Colegio','Territorio','Inspector','Fecha Evaluacion','Resultado','% Cumplimiento',
     '% Criticos P1','% Urgentes P2','Items Cumple','Items No Cumple',
     'Items En Proceso','Pendientes Criticos','Pendientes Urgentes','Verificaciones','Fecha Registro'],
    minimosRows,
    [22, 14, 22, 18, 16, 14, 14, 14, 12, 14, 14, 16, 16, 14, 18]);

  const minimosDetalle: (string | number | null | undefined)[][] = minimosList.flatMap(m => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const its: any[] = Array.isArray(m.items) ? m.items : [];
    return its.map((it: any) => [
      String(m.colegio ?? '—'), String(m.territorio ?? '—'), fmt(m.fecha as string),
      secNomMin[it.seccion as string] ?? String(it.seccion ?? '—'),
      String(it.nombre ?? it.id ?? '—'),
      ITEM_PRIO[it.id as string] ?? 'P3',
      estadoLblMin[it.estado as string] ?? String(it.estado ?? '—'),
      it.observacion ? String(it.observacion) : '—',
      it.verificado_por ? String(it.verificado_por) : '—',
      it.fecha_verificacion ? fmt(String(it.fecha_verificacion)) : '—',
    ]);
  });

  buildSheet('Minimos Detalle', 'Detalle de Items por Evaluacion — Sistema RCMA',
    ['Colegio','Territorio','Fecha Evaluacion','Seccion','Item','Prioridad',
     'Estado','Observacion','Verificado Por','Fecha Verificacion'],
    minimosDetalle,
    [22, 14, 18, 22, 48, 12, 14, 32, 22, 18]);

  // Resumen ejecutivo
  const ws7: Record<string, unknown> = {};
  const resRows = [
    { label: 'Proyectos', count: data.projects.length }, { label: 'Tickets TCMM', count: data.tickets.length },
    { label: 'Presupuesto vs Real', count: (data.projects as Record<string, unknown>[]).filter(p => p.budget != null).length },
    { label: 'Pendientes', count: data.pendientes.length }, { label: 'Anteproyectos', count: data.anteproyectos.length },
    { label: 'Inspecciones', count: data.checklists.length }, { label: 'Solicitudes', count: data.solicitudes.length },
    { label: 'Mínimos Indispensables', count: data.minimos.length },
  ];
  const totalGeneral = resRows.reduce((a, r) => a + r.count, 0);
  const sRT = { font: { bold: true, sz: 16, name: 'Calibri', color: { rgb: 'FFFFFFFF' } }, fill: { patternType: 'solid', fgColor: { rgb: 'FF0F172A' } }, alignment: { horizontal: 'left', vertical: 'center' } };
  const sRD = { font: { italic: true, sz: 10, name: 'Calibri', color: { rgb: 'FFD1D5DB' } }, fill: { patternType: 'solid', fgColor: { rgb: 'FF0F172A' } }, alignment: { horizontal: 'right', vertical: 'center' } };
  const sRH = { font: { bold: true, sz: 11, name: 'Calibri', color: { rgb: 'FFFFFFFF' } }, fill: { patternType: 'solid', fgColor: { rgb: 'FF1E40AF' } }, alignment: { horizontal: 'left', vertical: 'center' }, border: bdr };
  const sRHN = { ...sRH, alignment: { horizontal: 'right', vertical: 'center' } };
  const sRR = (alt: boolean) => ({ font: { sz: 11, name: 'Calibri', color: { rgb: 'FF111827' } }, fill: { patternType: alt ? 'solid' : 'none', fgColor: { rgb: alt ? 'FFF0F4FF' : 'FFFFFFFF' } }, alignment: { horizontal: 'left', vertical: 'center' }, border: bdr });
  const sRN = (alt: boolean) => ({ ...sRR(alt), font: { bold: true, sz: 12, name: 'Calibri', color: { rgb: 'FF1E40AF' } }, alignment: { horizontal: 'right', vertical: 'center' } });
  const sRTL = { font: { bold: true, sz: 12, name: 'Calibri', color: { rgb: 'FFFFFFFF' } }, fill: { patternType: 'solid', fgColor: { rgb: 'FF0F172A' } }, alignment: { horizontal: 'left', vertical: 'center' }, border: bdr };
  const sRTN = { ...sRTL, alignment: { horizontal: 'right', vertical: 'center' } };
  ws7['A1'] = { v: 'SISTEMA RCMA — MATRIZ DE CONCENTRADO', t: 's', s: sRT };
  ws7['B1'] = { v: `Generado: ${now}`, t: 's', s: sRD };
  ws7['A2'] = { v: '', t: 's', s: { fill: { patternType: 'solid', fgColor: { rgb: 'FF0F172A' } } } };
  ws7['B2'] = { v: '', t: 's', s: { fill: { patternType: 'solid', fgColor: { rgb: 'FF0F172A' } } } };
  ws7['A3'] = { v: 'MÓDULO', t: 's', s: sRH }; ws7['B3'] = { v: 'TOTAL DE REGISTROS', t: 's', s: sRHN };
  resRows.forEach((row, i) => { const alt = i % 2 === 1; ws7[`A${i + 4}`] = { v: row.label, t: 's', s: sRR(alt) }; ws7[`B${i + 4}`] = { v: row.count, t: 'n', s: sRN(alt) }; });
  const sepR = resRows.length + 4;
  ws7[`A${sepR}`] = { v: '', t: 's', s: { fill: { patternType: 'solid', fgColor: { rgb: 'FFD1D5DB' } } } };
  ws7[`B${sepR}`] = { v: '', t: 's', s: { fill: { patternType: 'solid', fgColor: { rgb: 'FFD1D5DB' } } } };
  ws7[`A${sepR + 1}`] = { v: 'TOTAL GENERAL', t: 's', s: sRTL };
  ws7[`B${sepR + 1}`] = { v: totalGeneral, t: 'n', s: sRTN };
  ws7['!ref'] = `A1:B${sepR + 1}`;
  ws7['!cols'] = [{ wch: 38 }, { wch: 22 }];
  ws7['!rows'] = [{ hpt: 32 }, { hpt: 5 }, { hpt: 22 }, ...resRows.map(() => ({ hpt: 22 })), { hpt: 4 }, { hpt: 26 }];
  ws7['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 1 } }, { s: { r: 1, c: 0 }, e: { r: 1, c: 1 } }];
  XLSX.utils.book_append_sheet(wb, ws7 as import('xlsx').WorkSheet, '📊 Resumen Ejecutivo');

  wb.SheetNames = ['📊 Resumen Ejecutivo', '📁 Proyectos', '💰 Presupuesto vs Real', '🎫 Tickets TCMM', '⏳ Pendientes', '📐 Anteproyectos', '✅ Inspecciones', '📩 Solicitudes', 'Minimos Indispensables', 'Minimos Detalle'];
  XLSX.writeFile(wb, `Matriz_Sistema_RCMA_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

// ─── Componente ───────────────────────────────────────────────────────────────
export default function Reports() {
  const { data: rawProjects    = [] } = useQuery({ queryKey: ['projects'],    queryFn: () => db.Project.list('-created_at', 500) });
  const { data: rawChecklists  = [] } = useQuery({ queryKey: ['checklists'],  queryFn: () => db.Checklist.list('-created_at', 500) });
  const { data: rawMinimos = [] } = useQuery({
    queryKey: ['minimos_indispensables_report'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('minimos_indispensables')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500);
      if (error) throw error;
      return data ?? [];
    },
  });
  const { data: rawSolicitudes = [] } = useQuery({
    queryKey: ['solicitudes'],
    queryFn: async () => { const { data, error } = await supabase.from('solicitudes').select('id,nombre_centro,nombre_proyecto,estatus,created_at').order('created_at', { ascending: false }).limit(500); if (error) throw error; return data ?? []; },
  });
  const { data: rawTickets = [] } = useQuery({
    queryKey: ['tickets'],
    queryFn: async () => { const { data, error } = await supabase.from('tickets').select('id,folio,territorio,proyecto_id').order('created_at', { ascending: false }).limit(500); if (error) throw error; return data ?? []; },
  });
  const { data: rawTicketsFull = [] } = useQuery({
    queryKey: ['tickets-full-report'],
    queryFn: async () => { const { data, error } = await supabase.from('tickets').select('*').order('created_at', { ascending: false }).limit(500); if (error) throw error; return data ?? []; },
  });
  const { data: rawPendientes = [] } = useQuery({ queryKey: ['pendientes-report'], queryFn: () => db.Pendiente.list('-created_at', 500) });
  const { data: rawAnteproyectos = [] } = useQuery({
    queryKey: ['anteproyectos-report'],
    queryFn: async () => { const { data, error } = await supabase.from('anteproyectos').select('*').order('created_at', { ascending: false }).limit(500); if (error) throw error; return data ?? []; },
  });
  const { data: rawSolicitudesAll = [] } = useQuery({
    queryKey: ['solicitudes-all-report'],
    queryFn: async () => { const { data, error } = await supabase.from('solicitudes').select('*').order('created_at', { ascending: false }).limit(500); if (error) throw error; return data ?? []; },
  });

  const { data: rawTicketsMas = [] } = useQuery({
    queryKey: ['tickets_mas_pdf_report'],
    queryFn: async () => { const { data, error } = await supabase.from('tickets_mas').select('*').order('created_at', { ascending: false }).limit(500); if (error) throw error; return data ?? []; },
  });

  const projects    = rawProjects    as unknown as Project[];
  const checklists  = rawChecklists  as unknown[];
  const solicitudes = rawSolicitudes as unknown as Solicitud[];
  const tickets     = rawTickets     as unknown as Ticket[];
  const pendientes  = rawPendientes  as unknown as Pendiente[];

  const stats = useMemo((): Stats => ({
    total:       projects.length,
    completed:   projects.filter(p => p.status === 'completado').length,
    avgProgress: projects.length > 0 ? Math.round(projects.reduce((a, p) => a + (p.progress ?? 0), 0) / projects.length) : 0,
  }), [projects]);

  const activeProjects = useMemo(() => projects.filter(p => p.status !== 'completado' && p.status !== 'cancelado'), [projects]);

  const terData = useMemo(() => {
    const t = Array.from(new Set(tickets.map(t => t.territorio ?? 'Sin territorio'))).sort();
    return t.map(ter => ({ territorio: ter, count: tickets.filter(t => (t.territorio ?? 'Sin territorio') === ter).length }));
  }, [tickets]);

  const handleExportPDF = () => exportResumenPDF({
    stats, projects, checklists, solicitudes, tickets: rawTicketsFull as unknown as Ticket[],
    pendientes,
    ticketsMas:    rawTicketsMas    as any[],
    minimos:       rawMinimos       as any[],
    anteproyectos: rawAnteproyectos as any[],
    solicitudesAll: rawSolicitudesAll as any[],
  }).catch(e => console.error('Error generando PDF:', e));

  const handleExportExcel = () => exportMatrizExcel({
    projects: rawProjects, checklists: rawChecklists, tickets: rawTicketsFull,
    pendientes: rawPendientes, anteproyectos: rawAnteproyectos, solicitudes: rawSolicitudesAll,
    minimos: rawMinimos,
  }).catch(e => console.error('Error generando Excel:', e));

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
