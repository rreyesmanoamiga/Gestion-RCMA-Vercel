import React, { useMemo } from 'react';
import { db } from '@/lib/db';
import { supabase } from '@/lib/supabaseClient';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart3, Download, FileSpreadsheet, FileText,
  PieChart, Filter, TrendingUp, ClockAlert, Wrench, Package, Building2, ShieldCheck,
} from 'lucide-react';
import PageHeader from '@/components/shared/PageHeader';
import { mergeActividadesConCustom, calcularFechasEnMes } from './CalendarioMantenimiento';
import { COLEGIOS, normalizarColegio } from '@/lib/colegios';
import { useComplianceDocs, esRetraso, type ComplianceDoc } from '@/lib/complianceShared';
import PresentacionSemanal from '@/components/reports/PresentacionSemanal';
import { usePermissions } from '@/hooks/usePermissions';
import { useScope } from '@/hooks/useScope';

const btnOutline = "flex items-center gap-2 px-4 py-2.5 border border-slate-300 rounded-lg text-sm font-bold text-slate-700 hover:bg-slate-50 transition-all shadow-sm disabled:opacity-40 disabled:cursor-not-allowed";
const cardClass  = "bg-white p-6 rounded-xl border border-slate-200 shadow-sm";

interface Project  { id: string; name?: string; status?: string; progress?: number; territorio?: string; colegio?: string; budget?: number; tipo_proyecto?: string; priority?: string; responsible?: string; folio?: string; }
interface Solicitud { id: string; nombre_centro?: string; nombre_proyecto?: string; estatus?: string; created_at?: string; }
interface Ticket   { id: string; folio?: string; territorio?: string; colegio?: string; proyecto_id?: string; presupuesto?: number; estatus?: string; tipo_proyecto?: string; nombre_proveedor?: string; plan_financiamiento?: string; fecha?: string; }
interface Pendiente { id: string; nombre_proyecto?: string; estatus?: string; territorio?: string; colegio?: string; presupuesto?: number; prioridad?: string; }
interface ColegioCumplimiento { colegio: string; territorio: string; completados: number; total: number; pct: number; }
interface ReqInsumo { id: string; folio?: string; estatus?: string; total_cotizado?: number; total_con_iva?: number; prioridad?: string; proveedores_nombres?: string[]; created_at?: string; fecha_requerida?: string; departamento?: string; }
interface PlantelLev { id: string; colegio_clave?: string; colegio_nombre?: string; zona?: string; eco_nombre?: string; asignacion?: string; fase?: string; fecha_inicio?: string | null; fecha_termino?: string | null; }
interface PagoLev { id: string; plantel_id?: string; mes_numero?: number; mes_etiqueta?: string; concepto?: string; monto_programado?: number; monto_pagado?: number | null; pagado?: boolean; fecha_pago?: string | null; }
interface EntregableLev { id: string; plantel_id?: string; mecanica_suelos?: boolean; levant_arq?: boolean; levant_estructural?: boolean; levant_instalaciones?: boolean; levant_conjunto?: boolean; entregables_completos?: boolean; acta_firmada?: boolean; }
interface NexusNota { id: string; titulo?: string; categoria?: string; colegio?: string; territorio?: string; fijada?: boolean; created_at?: string; updated_at?: string; }
interface NexusPendiente { id: string; titulo?: string; tipo?: string; asignado_nombre?: string; asignado_cc?: string; asignado_cc_nombre?: string; prioridad?: string; fecha_limite?: string | null; estatus?: string; colegio?: string; territorio?: string; created_at?: string; }
interface ReporteLevDiario { id: string; plantel_id?: string | null; plantel_id_2?: string | null; fecha_reporte?: string; archivo_nombre?: string; notas?: string | null; }
interface CompliancePendiente { id: string; titulo?: string; colegio?: string | null; territorio?: string | null; prioridad?: string; estatus?: string; fecha_limite?: string | null; asignado_a?: string | null; tipo?: string; }
interface ComplianceNota { id: string; titulo?: string; categoria?: string; colegio?: string | null; territorio?: string | null; fijada?: boolean; updated_at?: string; }
interface ComplianceSeguimiento { id: string; colegio?: string; territorio?: string | null; resumen?: string; estatus?: string; created_at?: string; }
interface Stats    { total: number; completed: number; avgProgress: number; }

// ─── Helpers de dibujo ────────────────────────────────────────────────────────
type Doc = InstanceType<typeof import('jspdf').jsPDF>;

// ─── Diseño institucional de reportes (PDF) ──────────────────────────────────
// Azul marino y naranja Mano Amiga, con logo. Distinto al formato del Ticket MAS
// y de la Solicitud: franja vertical a la izquierda, secciones numeradas,
// tarjetas blancas y pie con línea naranja.
type RGB = [number, number, number];
const C_NAVY:   RGB = [0, 41, 90];
const C_NAVY2:  RGB = [31, 78, 121];
const C_BLUE:   RGB = [91, 135, 181];
const C_ORANGE: RGB = [237, 113, 2];
const C_TEXT:   RGB = [30, 41, 59];
const C_MUTED:  RGB = [100, 116, 139];
const C_LINE:   RGB = [226, 232, 240];
const C_ZEBRA:  RGB = [245, 248, 252];

const STATUS_COLORS_RGB: Record<string, RGB> = {
  en_proceso:  C_NAVY2,
  en_espera:   C_ORANGE,
  completado:  [22, 163, 74],
  cancelado:   [220, 38, 38],
  pausado:     [148, 163, 184],
  pendiente:   C_BLUE,
  aprobado:    [22, 163, 74],
};
const STATUS_LABELS: Record<string, string> = {
  en_proceso: 'En Proceso', en_espera: 'En Espera',
  completado: 'Completado', cancelado: 'Cancelado',
  pausado: 'Pausado', pendiente: 'Pendiente', aprobado: 'Aprobado',
};

function fmtMXN(n: number): string {
  return n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 });
}
/** Mezcla un color con blanco (t = 0 → color, 1 → blanco) */
const tinte = (c: RGB, t: number): RGB => c.map(v => Math.round(v + (255 - v) * t)) as RGB;
const fechaLarga = () => new Date().toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' });

// ─── Logo horizontal Mano Amiga (recortado, sin espacio vacío) ───────────────
interface LogoPDF { data: string; ratio: number }
let logoCache: LogoPDF | null | undefined;
async function cargarLogo(): Promise<LogoPDF | null> {
  if (logoCache !== undefined) return logoCache;
  try {
    logoCache = await new Promise<LogoPDF>((res, rej) => {
      const img = new Image(); img.crossOrigin = 'anonymous';
      img.onload = () => {
        const w = img.naturalWidth, h = img.naturalHeight;
        const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
        const ctx = cv.getContext('2d')!; ctx.drawImage(img, 0, 0);
        let x0 = w, y0 = h, x1 = -1, y1 = -1;
        try {
          const d = ctx.getImageData(0, 0, w, h).data;
          for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
            const i = (y * w + x) * 4;
            const vacio = d[i + 3] < 10 || (d[i] > 245 && d[i + 1] > 245 && d[i + 2] > 245);
            if (!vacio) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
          }
        } catch { x0 = 0; y0 = 0; x1 = w - 1; y1 = h - 1; }
        if (x1 < x0) { x0 = 0; y0 = 0; x1 = w - 1; y1 = h - 1; }
        const cw = x1 - x0 + 1, ch = y1 - y0 + 1;
        const out = document.createElement('canvas'); out.width = cw; out.height = ch;
        out.getContext('2d')!.drawImage(cv, x0, y0, cw, ch, 0, 0, cw, ch);
        res({ data: out.toDataURL('image/png'), ratio: cw / ch });
      };
      img.onerror = rej; img.src = '/colegio-mano-amiga.png';
    });
  } catch { logoCache = null; }
  return logoCache;
}

// ─── Gráfica de barras horizontales ──────────────────────────────────────────
function drawHorizontalBars(
  doc: Doc, x: number, y: number, w: number,
  data: { label: string; value: number; color: RGB }[],
  title: string
): number {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total === 0) return y;
  if (title) {
    doc.setFontSize(8.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(...C_NAVY);
    doc.text(title.toUpperCase(), x, y); y += 6;
  }
  const max = Math.max(...data.map(d => d.value));
  const barW = w - 42; const barH = 4.2; const gap = 8;
  data.forEach(item => {
    if (item.value === 0) return;
    const filled = Math.max(3, (item.value / max) * barW);
    doc.setFontSize(7.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(...C_TEXT);
    doc.text(item.label.length > 16 ? item.label.slice(0, 15) + '…' : item.label, x, y);
    doc.setFillColor(238, 242, 247); doc.roundedRect(x + 32, y - barH + 0.8, barW, barH, barH / 2, barH / 2, 'F');
    doc.setFillColor(...item.color); doc.roundedRect(x + 32, y - barH + 0.8, filled, barH, barH / 2, barH / 2, 'F');
    doc.setFontSize(7.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(...C_NAVY);
    doc.text(String(item.value), x + 32 + filled + 2, y);
    y += gap;
  });
  return y + 2;
}

// ─── Tarjetas de KPI (blancas, con punto de color) ───────────────────────────
function drawKPIBoxes(
  doc: Doc, x: number, y: number, W: number,
  boxes: { label: string; value: string; color: RGB }[]
): number {
  const n = boxes.length;
  const bw = (W - 40 - (n - 1) * 3.5) / n;
  const bh = 17;
  boxes.forEach((box, i) => {
    const bx = x + i * (bw + 3.5);
    doc.setFillColor(255, 255, 255); doc.setDrawColor(...C_LINE); doc.setLineWidth(0.3);
    doc.roundedRect(bx, y, bw, bh, 2.5, 2.5, 'FD');
    doc.setFillColor(...box.color); doc.roundedRect(bx, y + 3, 1.4, bh - 6, 0.7, 0.7, 'F');
    const fs = box.label.length > 20 ? 5.4 : box.label.length > 15 ? 5.9 : 6.4;
    doc.setFontSize(fs); doc.setFont('helvetica', 'bold'); doc.setTextColor(...C_MUTED);
    doc.text(box.label.toUpperCase(), bx + 4.5, y + 6);
    const largo = box.value.length > 11;
    doc.setFontSize(largo ? 9.5 : 13); doc.setTextColor(...C_NAVY);
    doc.text(box.value, bx + 4.5, y + (largo ? 13 : 13.6));
  });
  return y + bh + 5;
}

// ─── Barra apilada (distribución) ────────────────────────────────────────────
function drawStackedBar(
  doc: Doc, x: number, y: number, w: number,
  segments: { value: number; color: RGB; label: string }[],
  title: string
): number {
  const total = segments.reduce((s, d) => s + d.value, 0);
  if (total === 0) return y;
  doc.setFontSize(8.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(...C_NAVY);
  doc.text(title.toUpperCase(), x, y); y += 4;
  const barH = 8; let cx = x;
  doc.setFillColor(238, 242, 247); doc.roundedRect(x, y, w, barH, 2, 2, 'F');
  const visibles = segments.filter(s => s.value > 0);
  visibles.forEach((seg, i) => {
    const sw = Math.max(2, (seg.value / total) * w);
    doc.setFillColor(...seg.color);
    if (visibles.length === 1) doc.roundedRect(cx, y, sw, barH, 2, 2, 'F');
    else if (i === 0) { doc.roundedRect(cx, y, sw, barH, 2, 2, 'F'); doc.rect(cx + sw - 2, y, 2, barH, 'F'); }
    else if (i === visibles.length - 1) { doc.roundedRect(cx, y, sw, barH, 2, 2, 'F'); doc.rect(cx, y, 2, barH, 'F'); }
    else doc.rect(cx, y, sw, barH, 'F');
    if (sw > 10) {
      doc.setFontSize(7); doc.setFont('helvetica', 'bold'); doc.setTextColor(255, 255, 255);
      doc.text(String(seg.value), cx + sw / 2, y + 5.4, { align: 'center' });
    }
    cx += sw;
  });
  y += barH + 5;
  let lx = x;
  visibles.forEach(seg => {
    doc.setFillColor(...seg.color); doc.circle(lx + 1.6, y - 1.2, 1.6, 'F');
    doc.setFontSize(7); doc.setFont('helvetica', 'normal'); doc.setTextColor(...C_TEXT);
    const txt = `${seg.label} (${seg.value})`;
    doc.text(txt, lx + 4.5, y);
    lx += doc.getTextWidth(txt) + 10;
    if (lx > x + w - 30) { lx = x; y += 6; }
  });
  return y + 7;
}

// ─── Tabla (encabezado azul redondeado, renglones alternados) ────────────────
function drawTable(
  doc: Doc, y: number, W: number,
  headers: { label: string; x: number; align?: 'left' | 'right' | 'center' }[],
  rows: string[][],
  maxRows = 40,
  pageH = 297
): number {
  const doc2 = doc as any;
  const encabezado = () => {
    doc.setFillColor(...C_NAVY); doc.roundedRect(18, y - 5, W - 36, 9, 2, 2, 'F');
    doc.rect(18, y, W - 36, 4, 'F');
    doc.setFontSize(7); doc.setFont('helvetica', 'bold'); doc.setTextColor(255, 255, 255);
    headers.forEach(h => doc.text(h.label.toUpperCase(), h.x, y + 0.6, { align: h.align ?? 'left' }));
    y += 9;
  };
  encabezado();
  doc.setFont('helvetica', 'normal');
  rows.slice(0, maxRows).forEach((row, i) => {
    if (y > pageH - 26) { doc.addPage(); y = 22; encabezado(); doc.setFont('helvetica', 'normal'); }
    if (i % 2 === 1) { doc.setFillColor(...C_ZEBRA); doc.rect(18, y - 4.6, W - 36, 7.4, 'F'); }
    doc.setDrawColor(238, 242, 247); doc.setLineWidth(0.2); doc.line(18, y + 2.8, W - 18, y + 2.8);
    doc.setFontSize(7.8); doc.setTextColor(...C_TEXT);
    row.forEach((cell, ci) => {
      const h = headers[ci];
      if (!h) return;
      const nextX = ci < headers.length - 1 ? headers[ci + 1].x : (W - 18);
      const maxW  = h.align === 'right' ? 40 : Math.max(nextX - h.x - 2, ci === headers.length - 1 ? 17 : 0);
      let txt = String(cell ?? '—');
      if (doc2.getTextWidth && doc2.getTextWidth(txt) > maxW) {
        while (txt.length > 1 && doc2.getTextWidth(txt + '…') > maxW) txt = txt.slice(0, -1);
        txt = txt + '…';
      }
      doc.text(txt, h.x, y, { align: h.align ?? 'left' });
    });
    y += 7.4;
  });
  if (rows.length > maxRows) {
    y += 2; doc.setFontSize(7.5); doc.setFont('helvetica', 'italic'); doc.setTextColor(...C_MUTED);
    doc.text(`Mostrando ${maxRows} de ${rows.length} registros.`, 20, y); y += 6;
  }
  return y + 2;
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

/** Encabezado: logo a la izquierda, título grande y chip naranja con la fecha. Deja y ≈ 44. */
async function pdfHeader(doc: Doc, W: number, title: string, subtitle: string) {
  const logo = await cargarLogo();
  if (logo) { const h = 15; doc.addImage(logo.data, 'PNG', 20, 11, h * logo.ratio, h); }
  doc.setFontSize(6.8); doc.setFont('helvetica', 'bold'); doc.setTextColor(...C_ORANGE);
  doc.text('REPORTE  ·  SISTEMA RCMA', W - 18, 12, { align: 'right', charSpace: 0.6 } as any);
  doc.setFontSize(19); doc.setTextColor(...C_NAVY);
  doc.text(title, W - 18, 20.5, { align: 'right' });
  doc.setFontSize(7.6); doc.setFont('helvetica', 'bold');
  const tw = doc.getTextWidth(subtitle) + 8;
  doc.setFillColor(255, 243, 232); doc.roundedRect(W - 18 - tw, 23.5, tw, 6, 3, 3, 'F');
  doc.setTextColor(194, 65, 12); doc.text(subtitle, W - 18 - tw / 2, 27.6, { align: 'center' });
  doc.setDrawColor(...C_LINE); doc.setLineWidth(0.5); doc.line(20, 34, W - 18, 34);
}

/** Título de sección: número en recuadro naranja, título azul y línea */
function seccionPDF(doc: Doc, y: number, W: number, numero: string | number, titulo: string): number {
  const num = String(numero).padStart(2, '0');
  doc.setFontSize(8); doc.setFont('helvetica', 'bold');
  const nw = doc.getTextWidth(num) + 5;
  doc.setFillColor(...C_ORANGE); doc.roundedRect(20, y - 4.4, nw, 6.2, 1.6, 1.6, 'F');
  doc.setTextColor(255, 255, 255); doc.text(num, 20 + nw / 2, y, { align: 'center' });
  doc.setFontSize(10); doc.setTextColor(...C_NAVY);
  const t = titulo.toUpperCase();
  doc.text(t, 20 + nw + 3, y);
  const tx = 20 + nw + 3 + doc.getTextWidth(t) + 3;
  doc.setDrawColor(203, 213, 225); doc.setLineWidth(0.3); doc.line(tx, y - 1.4, W - 18, y - 1.4);
  return y + 8;
}

/** Pie y franja lateral en cada hoja (omite las hojas de portada) */
function pdfFooter(doc: Doc, label: string, portadas = 0) {
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    if (i <= portadas) continue;
    doc.setPage(i);
    const pH = (doc as any).internal.pageSize.getHeight();
    const pW = (doc as any).internal.pageSize.getWidth();
    // Franja lateral: azul con remate naranja
    doc.setFillColor(...C_NAVY); doc.rect(0, 0, 5, pH * 0.78, 'F');
    doc.setFillColor(...C_ORANGE); doc.rect(0, pH * 0.78, 5, pH * 0.22, 'F');
    // Pie
    doc.setDrawColor(...C_ORANGE); doc.setLineWidth(0.9); doc.line(5, pH - 11, pW, pH - 11);
    doc.setFontSize(7); doc.setFont('helvetica', 'bold'); doc.setTextColor(...C_NAVY);
    doc.text('Colegios Mano Amiga', 20, pH - 5);
    const bw = doc.getTextWidth('Colegios Mano Amiga ');
    doc.setFont('helvetica', 'normal'); doc.setTextColor(...C_MUTED);
    doc.text('— Juntos Transformando Vidas  ·  ' + label, 20 + bw, pH - 5);
    const pag = 'Página ' + i + ' de ' + pages;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7);
    const pw = doc.getTextWidth(pag) + 7;
    doc.setFillColor(...C_NAVY); doc.roundedRect(pW - 18 - pw, pH - 8.6, pw, 5.4, 2.7, 2.7, 'F');
    doc.setTextColor(255, 255, 255); doc.text(pag, pW - 18 - pw / 2, pH - 4.9, { align: 'center' });
  }
}

/** Portada del Resumen General: fondo azul, círculos y 4 cifras clave */
async function portadaPDF(doc: Doc, titulo: string[], cifras: { label: string; value: string; destacada?: boolean }[]) {
  const W = 210, H = 297;
  doc.setFillColor(...C_NAVY); doc.rect(0, 0, W, H, 'F');
  doc.setFillColor(11, 58, 115); doc.circle(W + 20, 40, 105, 'F');
  doc.setFillColor(44, 86, 134); doc.circle(W + 20, 40, 70, 'F');
  doc.setDrawColor(...C_ORANGE); doc.setLineWidth(7); doc.circle(-6, H + 4, 46, 'S');
  const logo = await cargarLogo();
  doc.setFillColor(255, 255, 255); doc.roundedRect(18, 18, 62, 26, 4, 4, 'F');
  if (logo) { const lh = 16, lw = Math.min(54, lh * logo.ratio); doc.addImage(logo.data, 'PNG', 18 + (62 - lw) / 2, 18 + (26 - lw / logo.ratio) / 2, lw, lw / logo.ratio); }
  doc.setFontSize(8.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(...C_ORANGE);
  doc.text('SISTEMA RCMA  ·  COORDINACIÓN DE OBRAS Y MANTENIMIENTO', 18, 108, { charSpace: 0.8 } as any);
  doc.setFontSize(40); doc.setTextColor(255, 255, 255);
  titulo.forEach((l, i) => doc.text(l, 18, 126 + i * 16));
  doc.setFontSize(12); doc.setFont('helvetica', 'normal'); doc.setTextColor(203, 213, 225);
  doc.text('Corte al ' + fechaLarga(), 18, 126 + titulo.length * 16 + 4);
  const bw = 78, bh = 24, gx = 6, top = 178;
  cifras.slice(0, 4).forEach((c, i) => {
    const bx = 18 + (i % 2) * (bw + gx), by = top + Math.floor(i / 2) * (bh + gx);
    if (c.destacada) { doc.setFillColor(...C_ORANGE); doc.roundedRect(bx, by, bw, bh, 4, 4, 'F'); }
    else { doc.setFillColor(15, 55, 105); doc.setDrawColor(52, 90, 140); doc.setLineWidth(0.4); doc.roundedRect(bx, by, bw, bh, 4, 4, 'FD'); }
    doc.setFontSize(7); doc.setFont('helvetica', 'bold'); doc.setTextColor(...(c.destacada ? [255, 228, 204] as RGB : [147, 197, 253] as RGB));
    doc.text(c.label.toUpperCase(), bx + 6, by + 8, { charSpace: 0.4 } as any);
    doc.setFontSize(c.value.length > 10 ? 15 : 19); doc.setTextColor(255, 255, 255);
    doc.text(c.value, bx + 6, by + 18.5);
  });
  doc.setDrawColor(255, 255, 255); doc.setLineWidth(0.2); doc.line(18, H - 22, W - 18, H - 22);
  doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(203, 213, 225);
  doc.text('Colegios Mano Amiga — Juntos Transformando Vidas', 18, H - 15);
  doc.text('Documento confidencial', W - 18, H - 15, { align: 'right' });
}

// ─── Export PDF: Estatus por Colegio ──────────────────────────────────────────
async function exportEstatusColegioPDF({ projects, tickets, ticketsMas, minimos, planteles }: {
  projects: Project[]; tickets: Ticket[]; ticketsMas: any[]; minimos: any[]; planteles: PlantelLev[];
}): Promise<void> {
  const JsPDF = await loadJsPDF();
  const doc = new JsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const W = 297;
  await pdfHeader(doc, W, 'Estatus por Colegio', 'Generado el ' + fechaLarga());
  let y = 44;

  const colegios = Array.from(new Set([
    ...projects.map(p => p.colegio).filter(Boolean) as string[],
    ...tickets.map(t => t.colegio).filter(Boolean) as string[],
    ...ticketsMas.map((t: any) => t.colegio).filter(Boolean) as string[],
    ...planteles.map(p => p.colegio_nombre).filter(Boolean) as string[],
  ])).sort();

  const FASE_LABELS: Record<string, string> = {
    COMUNICADO: 'Comunicado', FASE1: 'Fase 1 – Campo', FASE2: 'Fase 2 – Gab.',
    FASE3: 'Fase 3 – Rev.', FASE4: 'Fase 4 – ECO', FASE5: 'Fase 5 – Cierre',
  };

  const rows = colegios.map(col => {
    const pColegio   = projects.filter(p => p.colegio === col);
    const activos    = pColegio.filter(p => p.status !== 'completado' && p.status !== 'cancelado').length;
    const completos  = pColegio.filter(p => p.status === 'completado').length;
    const presupuesto = pColegio.reduce((s, p) => s + (p.budget ?? 0), 0);
    const tTcmm      = tickets.filter(t => t.colegio === col).length;
    const tMasPend   = ticketsMas.filter((t: any) => t.colegio === col && (t.estatus === 'pendiente' || t.estatus === 'en_revision')).length;
    const minCol     = minimos.filter((m: any) => m.colegio === col);
    const minCumple  = minCol.filter((m: any) => m.resultado === 'completo').length;
    const pctMin     = minCol.length > 0 ? Math.round((minCumple / minCol.length) * 100) : null;
    const plantel    = planteles.find(p => p.colegio_nombre === col);
    return [
      col,
      String(activos), String(completos),
      fmtMXN(presupuesto),
      String(tTcmm), String(tMasPend),
      pctMin != null ? pctMin + '%' : '—',
      plantel ? (FASE_LABELS[plantel.fase ?? ''] ?? plantel.fase ?? '—') : '—',
    ];
  });

  const totAct  = projects.filter(p => p.status !== 'completado' && p.status !== 'cancelado').length;
  const totComp = projects.filter(p => p.status === 'completado').length;
  const totPres = projects.reduce((s, p) => s + (p.budget ?? 0), 0);
  const totMas  = ticketsMas.filter((t: any) => t.estatus === 'pendiente' || t.estatus === 'en_revision').length;
  y = seccionPDF(doc, y, W, 1, 'Panorama');
  y = drawKPIBoxes(doc, 20, y, W, [
    { label: 'Colegios',           value: String(colegios.length), color: C_NAVY },
    { label: 'Proyectos activos',  value: String(totAct),          color: C_NAVY2 },
    { label: 'Completados',        value: String(totComp),         color: [22, 163, 74] },
    { label: 'Presupuesto',        value: fmtMXN(totPres),         color: C_ORANGE },
    { label: 'Ticket MAS por atender', value: String(totMas),      color: C_BLUE },
  ]);
  y += 2;
  y = seccionPDF(doc, y, W, 2, 'Detalle por colegio');
  y = drawTable(doc, y, W, [
    { label: 'Colegio',            x: 20  },
    { label: 'Activos',            x: 88,  align: 'center' },
    { label: 'Completados',        x: 110, align: 'center' },
    { label: 'Presupuesto',        x: 142, align: 'right'  },
    { label: 'Tickets TCMM',       x: 172, align: 'center' },
    { label: 'MAS Pend.',          x: 198, align: 'center' },
    { label: '% Mínimos OK',       x: 224, align: 'center' },
    { label: 'Fase Levantamiento', x: 248 },
  ], rows, 200, 210);

  pdfFooter(doc, 'Estatus por Colegio  ·  Documento confidencial');
  doc.save('estatus-por-colegio-' + Date.now() + '.pdf');
}

// ─── Export PDF: Reporte de Incidencias ───────────────────────────────────────
async function exportIncidenciasPDF({ projects, nexusPendientes, ticketsMas, minimos, pagosLev, planteles }: {
  projects: Project[]; nexusPendientes: NexusPendiente[]; ticketsMas: any[]; minimos: any[];
  pagosLev: PagoLev[]; planteles: PlantelLev[];
}): Promise<void> {
  const JsPDF = await loadJsPDF();
  const doc = new JsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const W = 210;
  await pdfHeader(doc, W, 'Reporte de Incidencias', 'Generado el ' + fechaLarga());
  let y = 42;
  const ROJO: RGB = [220, 38, 38], VERDE: RGB = [22, 163, 74];
  const fmtF = (d?: string | null) => d ? new Date(d.length === 10 ? d + 'T12:00:00' : d).toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';

  // ── Cálculo de las 5 incidencias ──
  const ahora = Date.now();
  const horasDe = (t: any) => t.created_at ? Math.floor((ahora - new Date(t.created_at).getTime()) / 3600000) : 0;
  const tmasSinAtender = ticketsMas
    .filter((t: any) => (t.estatus === 'pendiente' || t.estatus === 'en_revision') && horasDe(t) > 12)
    .sort((a: any, b: any) => horasDe(b) - horasDe(a));
  const urgentesBajoAvance = projects.filter(p => p.priority === 'urgente' && p.status !== 'completado' && p.status !== 'cancelado' && (p.progress ?? 0) < 30);
  const pendUrgentes = nexusPendientes.filter(p =>
    (p.prioridad === 'alta' || p.prioridad === 'urgente') && p.estatus !== 'completado' && p.estatus !== 'cancelado');
  const ITEM_PRIO_INC: Record<string, string> = {
    puertas_ancho:'P1',pasillos:'P1',tablero:'P1',circuitos:'P1',polo_tierra:'P1',agua_red:'P1',gas:'P1',pasillos_libres:'P1',const_pc:'P1',pipc:'P1',seg_estr:'P1',extintores:'P1',senal_emerg:'P1',cisterna_limp:'P1',cert_extinct:'P1',
  };
  const p1NoCumple = (m: any) => (Array.isArray(m.items) ? m.items : [])
    .filter((i: any) => (ITEM_PRIO_INC[i.id] ?? 'P3') === 'P1' && i.estado === 'no_cumple').length;
  const minP1Criticos = minimos.filter((m: any) => p1NoCumple(m) > 0).sort((a: any, b: any) => p1NoCumple(b) - p1NoCumple(a));
  const plantelById = Object.fromEntries(planteles.map(p => [p.id, p]));
  const pagosPendientes = pagosLev.filter(p => !p.pagado).sort((a, b) => (a.mes_numero ?? 0) - (b.mes_numero ?? 0));

  const bloques = [
    { n: 1, corto: 'Ticket MAS sin atender',  titulo: 'Ticket MAS sin atender (más de 12 h)',        total: tmasSinAtender.length },
    { n: 2, corto: 'Urgentes atrasados',       titulo: 'Proyectos urgentes con avance menor a 30%',  total: urgentesBajoAvance.length },
    { n: 3, corto: 'Pendientes urgentes',      titulo: 'Pendientes NEXUS urgentes o de prioridad alta', total: pendUrgentes.length },
    { n: 4, corto: 'Mínimos críticos (P1)',    titulo: 'Mínimos Indispensables: incumplimientos P1', total: minP1Criticos.length },
    { n: 5, corto: 'Pagos Levantamiento',      titulo: 'Pagos de Levantamiento Nacional pendientes', total: pagosPendientes.length },
  ];
  const totalInc = bloques.reduce((s, b) => s + b.total, 0);

  // ── Semáforo general ──
  doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(...C_MUTED);
  doc.text('Focos rojos que requieren atención, con los datos del sistema al momento de generar el reporte.', 20, y); y += 6;
  const tw = (W - 40 - 4 * 3) / 5, th = 24;
  bloques.forEach((b, i) => {
    const bx = 20 + i * (tw + 3);
    const col = b.total > 0 ? ROJO : VERDE;
    doc.setFillColor(...tinte(col, 0.92)); doc.setDrawColor(...tinte(col, 0.7)); doc.setLineWidth(0.3);
    doc.roundedRect(bx, y, tw, th, 2.5, 2.5, 'FD');
    doc.setFillColor(...col); doc.circle(bx + 5, y + 6, 1.8, 'F');
    doc.setFontSize(5.8); doc.setFont('helvetica', 'bold'); doc.setTextColor(...C_MUTED);
    doc.text(String(b.n).padStart(2, '0'), bx + 8.5, y + 6.9);
    doc.setFontSize(18); doc.setTextColor(...col); doc.text(String(b.total), bx + 4, y + 16.5);
    doc.setFontSize(5.8); doc.setTextColor(...C_TEXT);
    doc.text(doc.splitTextToSize(b.corto, tw - 6), bx + 4, y + 20.8);
  });
  y += th + 4;
  // Banda de resultado general
  const colG = totalInc > 0 ? ROJO : VERDE;
  doc.setFillColor(...colG); doc.roundedRect(20, y, W - 40, 8, 2, 2, 'F');
  doc.setFontSize(8.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(255, 255, 255);
  doc.text(totalInc > 0 ? `${totalInc} incidencia${totalInc !== 1 ? 's' : ''} por atender` : 'Todo en orden: sin incidencias', W / 2, y + 5.4, { align: 'center' });
  y += 16;

  const sinIncidencias = (msg: string) => {
    if (y > 262) { doc.addPage(); y = 22; }
    doc.setFillColor(240, 253, 244); doc.setDrawColor(187, 247, 208); doc.setLineWidth(0.3);
    doc.roundedRect(20, y - 4.5, W - 40, 9, 2, 2, 'FD');
    doc.setDrawColor(...VERDE); doc.setLineWidth(0.8);
    doc.line(24, y - 0.4, 25.6, y + 1.2); doc.line(25.6, y + 1.2, 28.6, y - 2.2);
    doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.setTextColor(21, 128, 61);
    doc.text(msg, 32, y + 0.8);
    y += 10;
  };
  const seccion = (b: typeof bloques[number]) => {
    if (y > 250) { doc.addPage(); y = 22; }
    y = seccionPDF(doc, y, W, b.n, b.titulo);
  };

  // 1. Ticket MAS sin atender
  seccion(bloques[0]);
  if (tmasSinAtender.length > 0) {
    y = drawTable(doc, y, W, [
      { label: 'Folio', x: 20 }, { label: 'Colegio', x: 52 }, { label: 'Estatus', x: 112 }, { label: 'Enviado', x: 142 }, { label: 'Horas', x: 190, align: 'right' },
    ], tmasSinAtender.map((t: any) => [
      t.folio ?? '—', t.colegio ?? '—', t.estatus === 'en_revision' ? 'En revisión' : 'Pendiente', fmtF(t.created_at), String(horasDe(t)),
    ]), 30, 297);
  } else sinIncidencias('Todos los Ticket MAS están atendidos.');
  y += 3;

  // 2. Proyectos urgentes con avance bajo
  seccion(bloques[1]);
  if (urgentesBajoAvance.length > 0) {
    y = drawTable(doc, y, W, [
      { label: 'Folio', x: 20 }, { label: 'Proyecto', x: 50 }, { label: 'Colegio', x: 140 }, { label: 'Avance', x: 190, align: 'right' },
    ], urgentesBajoAvance.map(p => [p.folio ?? '—', p.name ?? '—', p.colegio ?? '—', (p.progress ?? 0) + '%']), 30, 297);
  } else sinIncidencias('Sin proyectos urgentes atrasados.');
  y += 3;

  // 3. Pendientes NEXUS urgentes / alta
  seccion(bloques[2]);
  if (pendUrgentes.length > 0) {
    y = drawTable(doc, y, W, [
      { label: 'Pendiente', x: 20 }, { label: 'Colegio', x: 86 }, { label: 'Asignado a', x: 120 }, { label: 'Prioridad', x: 150 }, { label: 'Fecha límite', x: 190, align: 'right' },
    ], pendUrgentes.map(p => [
      p.titulo ?? '—', p.colegio ?? '—', p.asignado_nombre ?? '—', p.prioridad === 'urgente' ? 'Urgente' : 'Alta', fmtF(p.fecha_limite),
    ]), 30, 297);
  } else sinIncidencias('Sin pendientes urgentes o de prioridad alta.');
  y += 3;

  // 4. Mínimos Indispensables P1
  seccion(bloques[3]);
  if (minP1Criticos.length > 0) {
    y = drawTable(doc, y, W, [
      { label: 'Colegio', x: 20 }, { label: 'Territorio', x: 90 }, { label: 'Fecha evaluación', x: 125 }, { label: 'P1 sin cumplir', x: 190, align: 'right' },
    ], minP1Criticos.map((m: any) => [m.colegio ?? '—', m.territorio ?? '—', fmtF(m.fecha), String(p1NoCumple(m))]), 30, 297);
  } else sinIncidencias('Sin incumplimientos críticos P1.');
  y += 3;

  // 5. Pagos de Levantamiento Nacional pendientes
  seccion(bloques[4]);
  if (pagosPendientes.length > 0) {
    y = drawTable(doc, y, W, [
      { label: 'Colegio', x: 20 }, { label: 'Mes', x: 95 }, { label: 'Concepto', x: 120 }, { label: 'Monto programado', x: 190, align: 'right' },
    ], pagosPendientes.map(p => [
      plantelById[p.plantel_id ?? '']?.colegio_nombre ?? '—', p.mes_etiqueta ?? '—', p.concepto ?? '—',
      p.monto_programado != null ? fmtMXN(p.monto_programado) : '—',
    ]), 30, 297);
  } else sinIncidencias('Todos los pagos de Levantamiento Nacional están cubiertos.');

  pdfFooter(doc, 'Reporte de Incidencias  ·  Documento confidencial');
  doc.save('reporte-incidencias-' + Date.now() + '.pdf');
}

// ─── Export PDF mejorado ──────────────────────────────────────────────────────
async function exportResumenPDF({ stats, projects, checklists, solicitudes, tickets, pendientes, nexusPendientes = [], ticketsMas, minimos, anteproyectos, solicitudesAll, cumplimiento, requisiciones, planteles, pagosLev, entregablesLev, complianceDocs, compliancePendientes }: {
  stats: Stats; projects: Project[]; checklists: unknown[];
  solicitudes: Solicitud[]; tickets: Ticket[]; pendientes: Pendiente[]; nexusPendientes?: NexusPendiente[];
  ticketsMas: any[]; minimos: any[]; anteproyectos: any[]; solicitudesAll: any[];
  cumplimiento: ColegioCumplimiento[]; requisiciones: ReqInsumo[];
  planteles: PlantelLev[]; pagosLev: PagoLev[]; entregablesLev: EntregableLev[];
  complianceDocs: ComplianceDoc[]; compliancePendientes: CompliancePendiente[];
}): Promise<void> {
  const JsPDF = await loadJsPDF();
  const doc = new JsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const now = new Date().toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' });
  let W = 210; let y = 20;
  const getH = () => {
    try {
      const ps = (doc as any).internal?.pageSize;
      if (typeof ps?.getHeight === 'function') return ps.getHeight() as number;
      if (typeof ps?.height === 'number') return ps.height as number;
    } catch {}
    return W > 210 ? 210 : 297;
  };

  // Cambiar a horizontal (landscape) para secciones de tablas
  const switchToLandscape = () => {
    try {
      (doc as any).addPage('a4', 'l');
    } catch {
      doc.addPage();
    }
    W = 297; y = 20;
  };

  const section = (title: string) => {
    const H = getH();
    if (y > H - 40) { doc.addPage(); y = 22; }
    y += 4;
    const m = /^(\d+)\.\s*(.*)$/.exec(title);
    y = seccionPDF(doc, y, W, m ? m[1] : '•', m ? m[2] : title);
  };
  const divider = () => {
    doc.setDrawColor(220, 220, 220); doc.line(20, y, W - 20, y); y += 5;
  };

  // ─── PORTADA ───────────────────────────────────────────────────────────────
  {
    const act = projects.filter(p => p.status !== 'completado' && p.status !== 'cancelado');
    const avg = act.length > 0 ? Math.round(act.reduce((a, p) => a + (p.progress ?? 0), 0) / act.length) : 0;
    const aut = ticketsMas.filter((t: any) => t.estatus === 'autorizado');
    const monto = aut.reduce((s: number, t: any) => s + (Number(t.cot1_importe) || 0), 0);
    const montoCorto = monto >= 1e6 ? '$' + (monto / 1e6).toFixed(2) + ' M' : fmtMXN(monto);
    await portadaPDF(doc, ['Resumen', 'General'], [
      { label: 'Proyectos activos', value: String(act.length) },
      { label: 'Avance promedio', value: avg + '%' },
      { label: 'Ticket MAS autorizados', value: String(aut.length) },
      { label: 'Monto autorizado', value: montoCorto, destacada: true },
    ]);
    doc.addPage();
    void now;
    await pdfHeader(doc, W, 'Resumen General', 'Generado el ' + fechaLarga());
  }
  y = 40;

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
    { label: 'Pendientes NEXUS', value: String((nexusPendientes.length ? nexusPendientes.filter(p => p.estatus !== 'completado' && p.estatus !== 'cancelado') : pendientes).length), color: [245, 158, 11] },
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

  // Resumen financiero (tarjetas unidas; el total en azul)
  doc.setFontSize(8.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(...C_NAVY);
  doc.text('RESUMEN FINANCIERO', 20, y); y += 3;
  {
    const fw = (W - 40) / 4, fh = 16;
    const cajas = [
      { label: 'Presupuesto Proyectos',     value: fmtMXN(budgetProj) },
      { label: 'Presupuesto Tickets',       value: fmtMXN(budgetTick) },
      { label: 'Presupuesto Anteproyectos', value: fmtMXN(budgetAnte) },
      { label: 'Total General',             value: fmtMXN(budgetProj + budgetTick + budgetAnte) },
    ];
    doc.setFillColor(255, 255, 255); doc.setDrawColor(...C_LINE); doc.setLineWidth(0.3);
    doc.roundedRect(20, y, W - 40, fh, 2.5, 2.5, 'FD');
    doc.setFillColor(...C_NAVY); doc.roundedRect(20 + 3 * fw, y, fw, fh, 2.5, 2.5, 'F'); doc.rect(20 + 3 * fw, y, 3, fh, 'F');
    cajas.forEach((c, i) => {
      const bx = 20 + i * fw, total = i === 3;
      if (i > 0 && !total) { doc.setDrawColor(...C_LINE); doc.line(bx, y + 2, bx, y + fh - 2); }
      doc.setFontSize(5.8); doc.setFont('helvetica', 'bold'); doc.setTextColor(...(total ? [203, 213, 225] as RGB : C_MUTED));
      doc.text(c.label.toUpperCase(), bx + 4, y + 5.5);
      doc.setFontSize(10.5); doc.setTextColor(...(total ? [255, 255, 255] as RGB : C_NAVY));
      doc.text(c.value, bx + 4, y + 12);
    });
    y += fh + 8;
  }

  // Desglose territorial
  if (y > getH() - 40) { doc.addPage(); y = 20; }
  doc.setFontSize(8.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(...C_NAVY);
  doc.text('ESTADO POR TERRITORIO', 20, y); y += 7;
  const tRows = ['NORTE', 'MEXICO', 'FMA'].map(ter => {
    const tp = projects.filter(p => p.territorio === ter);
    const tt = tickets.filter((t: any) => t.territorio === ter);
    const tm = ticketsMas.filter((t: any) => t.territorio === ter);
    const tact = tp.filter(p => p.status !== 'completado' && p.status !== 'cancelado').length;
    return [ter, String(tp.length), String(tact), String(tt.length), String(tm.length)];
  });
  y = drawTable(doc, y, 210, [
    { label: 'Territorio',       x: 20  },
    { label: 'Total Proyectos',  x: 66  },
    { label: 'Activos',          x: 104 },
    { label: 'Tickets TCMM',    x: 132 },
    { label: 'Ticket MAS',      x: 164 },
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
    color: C_BLUE,
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
    .map(c => ({ label: c.replace('Mano Amiga ', ''), value: projects.filter(p => p.colegio === c).length, color: C_NAVY2 }))
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
  ], ticketRows, 35, 210);
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
    ], tmasRows, 30, 210);
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
    ], minRows, 30, 210);
  } else {
    doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(150, 150, 150);
    doc.text('Sin evaluaciones de Mínimos Indispensables registradas.', 20, y); y += 10;
  }
  y += 4;

  // ─── SECCIÓN 7: Anteproyectos y Solicitudes ───────────────────────────────
  if (y > getH() - 40) { doc.addPage(); y = 20; }
  section('7. Anteproyectos y Solicitudes');

  // Sub-header anteproyectos
  doc.setFontSize(8.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(...C_NAVY);
  doc.text('ANTEPROYECTOS (' + anteproyectos.length + ')', 20, y); y += 7;

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
    ], anteRows, 25, 210);
  } else {
    doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(150, 150, 150);
    doc.text('Sin anteproyectos registrados.', 20, y); y += 8;
  }
  y += 6;

  // Sub-header solicitudes
  if (y > getH() - 40) { doc.addPage(); y = 20; }
  doc.setFontSize(8.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(...C_NAVY);
  doc.text('SOLICITUDES DE PROYECTO (' + solicitudesAll.length + ')', 20, y); y += 7;

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
    ], solRows, 25, 210);
  } else {
    doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(150, 150, 150);
    doc.text('Sin solicitudes registradas.', 20, y); y += 8;
  }
  y += 4;

  // ─── SECCIÓN 8: Proyectos Activos ─────────────────────────────────────────
  if (y > getH() - 40) { doc.addPage(); y = 20; }
  section('8. Detalle Proyectos Activos');

  // Barra de avance promedio visual
  doc.setFontSize(8.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(...C_NAVY);
  doc.text('AVANCE PROMEDIO DE PROYECTOS ACTIVOS', 20, y);
  doc.setFillColor(238, 242, 247); doc.roundedRect(20, y + 3, W - 40, 8, 2, 2, 'F');
  doc.setFillColor(...C_NAVY2); doc.roundedRect(20, y + 3, Math.max(4, Math.round(((W - 40) * avgA) / 100)), 8, 2, 2, 'F');
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
  ], activeRows, 40, 210);
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
    ], completedRows, 30, 210);
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
    ], pendRows, 30, 210);
    y += 2;
  }

  // ─── SECCIÓN 11: Mantenimiento ────────────────────────────────────────────
  if (y > getH() - 40) { doc.addPage(); y = 20; }
  section('11. Cumplimiento de Mantenimiento');

  const totalColegios = cumplimiento.length;
  const colegiosAlDia = cumplimiento.filter(c => c.pct >= 80).length;
  const colegiosRezagados = cumplimiento.filter(c => c.pct < 40).length;
  const pctPromedio = totalColegios > 0 ? Math.round(cumplimiento.reduce((s, c) => s + c.pct, 0) / totalColegios) : 0;

  y = drawKPIBoxes(doc, 20, y, W, [
    { label: 'Cumplimiento Promedio', value: `${pctPromedio}%`,        color: [15, 23, 42]   },
    { label: 'Al día (80% o más)', value: String(colegiosAlDia),    color: [22, 163, 74]  },
    { label: 'Rezagados (menos de 40%)', value: String(colegiosRezagados), color: [220, 38, 38] },
    { label: 'Total Colegios',        value: String(totalColegios),    color: [59, 130, 246] },
  ]);
  y += 4;

  if (cumplimiento.length > 0) {
    const cumpRows = cumplimiento
      .slice().sort((a, b) => a.pct - b.pct)
      .map(c => [c.colegio, c.territorio, `${c.completados} / ${c.total}`, `${c.pct}%`]);
    y = drawTable(doc, y, W, [
      { label: 'Colegio',      x: 20  },
      { label: 'Territorio',   x: 80  },
      { label: 'Completados',  x: 140, align: 'right' },
      { label: 'Cumplimiento', x: 185, align: 'right' },
    ], cumpRows, 30, 210);
  } else {
    doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(150, 150, 150);
    doc.text('Sin datos de mantenimiento este mes.', 20, y); y += 10;
  }
  y += 4;

  // ─── SECCIÓN 12: Insumos — Requisiciones ──────────────────────────────────
  if (y > getH() - 40) { doc.addPage(); y = 20; }
  section('12. Insumos — Requisiciones');

  const reqPendCot = requisiciones.filter(r => r.estatus === 'pendiente_cotizacion').length;
  const reqAutoriz = requisiciones.filter(r => r.estatus === 'autorizado').length;
  const reqSurtido = requisiciones.filter(r => r.estatus === 'surtido').length;
  const reqMontoTotal = requisiciones.reduce((s, r) => s + (r.total_con_iva ?? r.total_cotizado ?? 0), 0);

  y = drawKPIBoxes(doc, 20, y, W, [
    { label: 'Total Requisiciones', value: String(requisiciones.length), color: [15, 23, 42]   },
    { label: 'Pend. Cotización',    value: String(reqPendCot),           color: [245, 158, 11] },
    { label: 'Autorizadas',         value: String(reqAutoriz),           color: [6, 182, 212]  },
    { label: 'Surtidas',            value: String(reqSurtido),           color: [22, 163, 74]  },
    { label: 'Monto Total',         value: fmtMXN(reqMontoTotal),        color: [99, 102, 241] },
  ]);
  y += 4;

  if (requisiciones.length > 0) {
    const reqLbl: Record<string,string> = { pendiente_cotizacion:'Pend. Cotización', cotizacion_recibida:'Cotización Recibida', en_autorizacion:'En Autorización', autorizado:'Autorizado', surtido:'Surtido' };
    const reqRows = requisiciones.slice(0, 30).map(r => [
      r.folio ?? '—',
      (r.proveedores_nombres ?? []).join(', ') || 'Sin proveedor',
      reqLbl[r.estatus ?? ''] ?? (r.estatus ?? '—'),
      r.prioridad ?? '—',
      (r.total_con_iva ?? r.total_cotizado) != null ? fmtMXN(r.total_con_iva ?? r.total_cotizado ?? 0) : '—',
      r.created_at ? new Date(r.created_at).toLocaleDateString('es-MX') : '—',
    ]);
    y = drawTable(doc, y, W, [
      { label: 'Folio',      x: 20  },
      { label: 'Proveedor',  x: 60  },
      { label: 'Estatus',    x: 150 },
      { label: 'Prioridad',  x: 195 },
      { label: 'Monto',      x: 225, align: 'right' },
      { label: 'Fecha',      x: 260 },
    ], reqRows, 30, 210);
  } else {
    doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(150, 150, 150);
    doc.text('Sin requisiciones registradas.', 20, y); y += 10;
  }
  y += 4;

  // ─── SECCIÓN 13: Levantamiento Nacional ───────────────────────────────────
  if (y > getH() - 40) { doc.addPage(); y = 20; }
  section('13. Levantamiento Nacional');

  const entregablesCompletos = entregablesLev.filter(e => e.entregables_completos).length;
  const pctEntregables = entregablesLev.length > 0 ? Math.round((entregablesCompletos / entregablesLev.length) * 100) : 0;
  const pagosPendientes = pagosLev.filter(p => !p.pagado).length;
  const montoPagosPend = pagosLev.filter(p => !p.pagado).reduce((s, p) => s + (p.monto_programado ?? 0), 0);

  y = drawKPIBoxes(doc, 20, y, W, [
    { label: 'Planteles Totales',    value: String(planteles.length),    color: [15, 23, 42]   },
    { label: '% Entregables OK',     value: pctEntregables + '%',        color: pctEntregables >= 80 ? [22,163,74] : pctEntregables >= 50 ? [202,138,4] : [220,38,38] },
    { label: 'Pagos Pendientes',     value: String(pagosPendientes),     color: [245, 158, 11] },
    { label: 'Monto Pend. de Pago',  value: fmtMXN(montoPagosPend),      color: [220, 38, 38]  },
  ]);
  y += 4;

  if (planteles.length > 0) {
    const plantRows = planteles.slice(0, 30).map(p => [
      p.colegio_nombre ?? '—', p.zona ?? '—', p.eco_nombre ?? '—',
      p.asignacion ?? '—', p.fase ?? '—',
    ]);
    doc.setFontSize(8.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(...C_NAVY);
    doc.text('PLANTELES', 20, y); y += 7;
    y = drawTable(doc, y, W, [
      { label: 'Colegio',     x: 20  },
      { label: 'Zona',        x: 110 },
      { label: 'ECO',         x: 145 },
      { label: 'Asignación',  x: 200 },
      { label: 'Fase',        x: 245 },
    ], plantRows, 30, 210);
  } else {
    doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(150, 150, 150);
    doc.text('Sin planteles registrados en Levantamiento Nacional.', 20, y); y += 10;
  }
  y += 4;

  // ─── SECCIÓN 14: Cumplimiento Normativo (PC / Donatarias) ─────────────────
  if (y > getH() - 40) { doc.addPage(); y = 20; }
  section('14. Cumplimiento Normativo (Protección Civil / Donatarias)');

  const hoyCump = new Date(); hoyCump.setHours(0, 0, 0, 0);
  const cumpTotal      = complianceDocs.length;
  const cumpRetraso    = complianceDocs.filter(d => esRetraso(d, hoyCump)).length;
  const cumpPorExpirar = complianceDocs.filter(d => d.vigente === 'Por expirar').length;
  const cumpVerificado = complianceDocs.filter(d => d.estado === 'Verificado').length;
  const cumpPendActivos = compliancePendientes.filter(p => p.estatus !== 'completado' && p.estatus !== 'cancelado').length;

  y = drawKPIBoxes(doc, 20, y, W, [
    { label: 'Documentos',        value: String(cumpTotal),       color: [15, 23, 42]   },
    { label: 'En Retraso',        value: String(cumpRetraso),     color: [220, 38, 38]  },
    { label: 'Por Expirar',       value: String(cumpPorExpirar),  color: [237, 113, 2]  },
    { label: 'Verificados',       value: String(cumpVerificado),  color: [22, 163, 74]  },
    { label: 'Pendientes Activos', value: String(cumpPendActivos), color: [99, 102, 241] },
  ]);
  y += 4;

  if (complianceDocs.length > 0) {
    const porColegioMap = new Map<string, { territorio: string; total: number; retraso: number; verificados: number }>();
    complianceDocs.forEach(d => {
      const cur = porColegioMap.get(d.colegio) ?? { territorio: d.territorio, total: 0, retraso: 0, verificados: 0 };
      cur.total++;
      if (esRetraso(d, hoyCump)) cur.retraso++;
      if (d.estado === 'Verificado') cur.verificados++;
      porColegioMap.set(d.colegio, cur);
    });
    const cumpNormRows = Array.from(porColegioMap.entries())
      .sort((a, b) => b[1].retraso - a[1].retraso)
      .map(([colegio, s]) => [
        colegio.replace('Mano Amiga ', ''), s.territorio, `${s.verificados} / ${s.total}`,
        s.total > 0 ? `${Math.round((s.verificados / s.total) * 100)}%` : '0%',
        String(s.retraso),
      ]);
    y = drawTable(doc, y, W, [
      { label: 'Colegio',        x: 20  },
      { label: 'Territorio',     x: 90  },
      { label: 'Verificados',    x: 140, align: 'right' },
      { label: '% Cumplimiento', x: 180, align: 'right' },
      { label: 'En Retraso',     x: 215, align: 'right' },
    ], cumpNormRows, 30, 210);
  } else {
    doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(150, 150, 150);
    doc.text('Sin documentos de Cumplimiento Normativo registrados.', 20, y); y += 10;
  }
  y += 4;

  pdfFooter(doc, 'Resumen General  ·  Documento confidencial', 1);

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

// ─── Matriz RCMA: hojas que arma exportMatrizExcel y cómo se dibujan ──────────
type CeldaMatriz = string | number | null | undefined;
interface HojaMatriz {
  name: string; title: string; headers: string[]; rows: CeldaMatriz[][];
  widths: number[]; moneyCol?: number | number[];
}
interface ResumenMatriz { label: string; count: number }
const ORDEN_MATRIZ = [
  '📊 Resumen Ejecutivo', '📁 Proyectos', '💰 Presupuesto vs Real', '🎫 Tickets TCMM', '🎫 Ticket MAS',
  '📐 Anteproyectos', '✅ Inspecciones', '📩 Solicitudes',
  'Minimos Indispensables', 'Minimos Detalle',
  '🔧 Cumplimiento Mtto.', '📦 Requisiciones', '🏫 Levant. Planteles', '💵 Levant. Pagos', '📄 Levant. Reportes',
  '📝 Nexus Notas', '✅ Nexus Pendientes',
  '📋 Cumpl. Documentos', '✅ Cumpl. Pendientes', '📝 Cumpl. Notas', '📌 Cumpl. Seguim.',
];
const archivoMatriz = () => `Matriz_Sistema_RCMA_${new Date().toISOString().slice(0, 10)}.xlsx`;

/** Diseño nuevo (ExcelJS): logo, banda azul, línea naranja, estatus con color y total */
async function renderMatrizPro(hojas: HojaMatriz[], resRows: ResumenMatriz[], totalGeneral: number, now: string) {
  const mod: any = await import('exceljs');
  const ExcelJS = mod.default ?? mod;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Sistema RCMA'; wb.created = new Date();

  // Logo (si no carga, la matriz sale igual sin logo)
  let logoId: number | null = null; let logoRatio = 3.2;
  const logo = await cargarLogo();
  if (logo) { logoId = wb.addImage({ base64: logo.data, extension: 'png' }); logoRatio = logo.ratio; }

  const NAVY = 'FF00295A', NAVY2 = 'FF1F4E79', ORANGE = 'FFED7102', ZEBRA = 'FFF3F7FC', LINEA = 'FFE2E8F0';
  const relleno = (argb: string) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
  const borde = { top: { style: 'thin', color: { argb: LINEA } }, bottom: { style: 'thin', color: { argb: LINEA } }, left: { style: 'thin', color: { argb: LINEA } }, right: { style: 'thin', color: { argb: LINEA } } };
  const colorEstatus = (v: string): [string, string] | null => {
    const t = v.toLowerCase();
    if (/autoriz|aprob|complet|surtid|verific|sí cumple|si cumple|^cumple|entregad|^sí$|activo/.test(t)) return ['FFDCFCE7', 'FF15803D'];
    if (/cancel|rechaz|no cumple|retraso|vencid|^no$/.test(t)) return ['FFFEE2E2', 'FFB91C1C'];
    if (/pend|revisi|proceso|espera|pausad|recibid|por expirar|cotiz/.test(t)) return ['FFFEF3C7', 'FFB45309'];
    return null;
  };

  // Hojas en el orden de siempre
  const hojaDe: Record<string, any> = {};
  ORDEN_MATRIZ.forEach(n => { hojaDe[n] = wb.addWorksheet(n, { views: [{ state: 'frozen', ySplit: 4, showGridLines: false }] }); });

  /** Encabezado común: fila 1 logo + título, fila 2 banda azul, fila 3 línea naranja */
  const encabezado = (ws: any, nCols: number, titulo: string, detalle: string) => {
    ws.getRow(1).height = 46; ws.getRow(2).height = 20; ws.getRow(3).height = 5;
    const desde = nCols >= 4 ? 3 : 2;
    ws.mergeCells(1, desde, 1, nCols);
    const t = ws.getCell(1, desde);
    t.value = titulo; t.font = { name: 'Calibri', size: 18, bold: true, color: { argb: NAVY } };
    t.alignment = { horizontal: 'right', vertical: 'middle' };
    const corte = Math.max(1, Math.ceil(nCols * 0.55));
    ws.mergeCells(2, 1, 2, corte);
    const iz = ws.getCell(2, 1);
    iz.value = detalle; iz.font = { name: 'Calibri', size: 10, color: { argb: 'FFFFFFFF' } };
    iz.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
    if (corte < nCols) {
      ws.mergeCells(2, corte + 1, 2, nCols);
      const de = ws.getCell(2, corte + 1);
      de.value = 'Matriz Sistema RCMA  ·  Coordinación de Obras y Mantenimiento';
      de.font = { name: 'Calibri', size: 9, italic: true, color: { argb: 'FFCBD5E1' } };
      de.alignment = { horizontal: 'right', vertical: 'middle' };
    }
    for (let c = 1; c <= nCols; c++) { ws.getCell(2, c).fill = relleno(NAVY); ws.getCell(3, c).fill = relleno(ORANGE); }
    if (logoId != null) {
      const alto = 44;
      ws.addImage(logoId, { tl: { col: 0.12, row: 0.12 }, ext: { width: Math.round(alto * logoRatio), height: alto }, editAs: 'oneCell' });
    }
  };

  hojas.forEach(h => {
    const ws = hojaDe[h.name] ?? wb.addWorksheet(h.name);
    const nCols = h.headers.length;
    const money = h.moneyCol === undefined ? [] : Array.isArray(h.moneyCol) ? h.moneyCol : [h.moneyCol];
    ws.properties.tabColor = { argb: NAVY2 };
    ws.columns = h.widths.map(w => ({ width: w + 2 }));
    encabezado(ws, nCols, h.title.replace(/\s+\u2014\s+Sistema RCMA$/, ''), `Corte al ${now}  ·  ${h.rows.length} registro${h.rows.length !== 1 ? 's' : ''}`);

    // Encabezados de columna
    const hr = ws.getRow(4); hr.height = 26;
    h.headers.forEach((t, c) => {
      const cell = hr.getCell(c + 1);
      cell.value = t; cell.fill = relleno(NAVY2);
      cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.border = { left: { style: 'thin', color: { argb: 'FF3B6A97' } }, right: { style: 'thin', color: { argb: 'FF3B6A97' } } };
    });
    const iFolio = h.headers.findIndex(x => /^folio$/i.test(x));
    const iEstatus = h.headers.findIndex(x => /^(estatus|estado|resultado|estado general|pagado)$/i.test(x));

    // Datos
    h.rows.forEach((row, ri) => {
      const r = ws.getRow(ri + 5); r.height = 19;
      row.forEach((val, ci) => {
        const cell = r.getCell(ci + 1);
        const esMoneda = money.includes(ci);
        cell.value = val === null || val === undefined ? '—' : val;
        cell.font = { name: 'Calibri', size: 10, color: { argb: 'FF1E293B' } };
        cell.border = borde;
        cell.alignment = { vertical: 'middle', horizontal: esMoneda ? 'right' : typeof val === 'number' ? 'center' : 'left' };
        if (ri % 2 === 1) cell.fill = relleno(ZEBRA);
        if (esMoneda) cell.numFmt = '"$"#,##0.00';
        if (ci === iFolio && typeof val === 'string' && val !== '—') cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFDC2626' } };
        if (ci === iEstatus && typeof val === 'string') {
          const col = colorEstatus(val);
          if (col) { cell.fill = relleno(col[0]); cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: col[1] } }; cell.alignment = { horizontal: 'center', vertical: 'middle' }; }
        }
      });
    });

    // Total
    const tr = ws.getRow(h.rows.length + 5); tr.height = 22;
    for (let c = 1; c <= nCols; c++) {
      const cell = tr.getCell(c);
      cell.fill = relleno('FFFFF3E8');
      cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFC2410C' } };
      cell.border = { top: { style: 'medium', color: { argb: ORANGE } } };
      cell.alignment = { vertical: 'middle', horizontal: money.includes(c - 1) ? 'right' : 'left', indent: c === 1 ? 1 : 0 };
      if (money.includes(c - 1)) {
        cell.value = h.rows.reduce((s, row) => s + (typeof row[c - 1] === 'number' ? (row[c - 1] as number) : 0), 0);
        cell.numFmt = '"$"#,##0.00';
      }
    }
    tr.getCell(1).value = `TOTAL  ·  ${h.rows.length} registro${h.rows.length !== 1 ? 's' : ''}`;
    if (nCols > 0) ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: nCols } };
  });

  // Resumen ejecutivo
  const ws = hojaDe['📊 Resumen Ejecutivo'];
  ws.properties.tabColor = { argb: ORANGE };
  ws.columns = [{ width: 46 }, { width: 22 }];
  encabezado(ws, 2, 'Resumen Ejecutivo', `Corte al ${now}`);
  const hr = ws.getRow(4); hr.height = 24;
  [['MÓDULO', 'left'], ['TOTAL DE REGISTROS', 'right']].forEach(([t, al], i) => {
    const c = hr.getCell(i + 1); c.value = t; c.fill = relleno(NAVY2);
    c.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    c.alignment = { horizontal: al, vertical: 'middle', indent: i === 0 ? 1 : 0 };
  });
  resRows.forEach((row, i) => {
    const r = ws.getRow(i + 5); r.height = 21;
    const a = r.getCell(1), b = r.getCell(2);
    a.value = row.label; b.value = row.count;
    a.font = { name: 'Calibri', size: 11, color: { argb: 'FF1E293B' } }; a.alignment = { vertical: 'middle', indent: 1 };
    b.font = { name: 'Calibri', size: 12, bold: true, color: { argb: NAVY } }; b.alignment = { horizontal: 'right', vertical: 'middle' };
    [a, b].forEach(c => { c.border = borde; if (i % 2 === 1) c.fill = relleno(ZEBRA); });
  });
  const tr = ws.getRow(resRows.length + 5); tr.height = 26;
  const ta = tr.getCell(1), tb = tr.getCell(2);
  ta.value = 'TOTAL GENERAL'; tb.value = totalGeneral;
  [ta, tb].forEach(c => { c.fill = relleno(NAVY); c.font = { name: 'Calibri', size: 12, bold: true, color: { argb: 'FFFFFFFF' } }; c.border = { top: { style: 'medium', color: { argb: ORANGE } } }; });
  ta.alignment = { vertical: 'middle', indent: 1 }; tb.alignment = { horizontal: 'right', vertical: 'middle' };

  const buf = await wb.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const a = document.createElement('a'); a.href = url; a.download = archivoMatriz();
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** Diseño anterior (xlsx-js-style): respaldo por si el nuevo falla */
async function renderMatrizClasico(hojas: HojaMatriz[], resRows: ResumenMatriz[], totalGeneral: number, now: string) {
  const XLSX = await loadXLSX();
  const wb   = XLSX.utils.book_new();

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

  hojas.forEach(h => buildSheet(h.name, h.title, h.headers, h.rows, h.widths, h.moneyCol));
  const ws7: Record<string, unknown> = {};
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

  wb.SheetNames = [
    '📊 Resumen Ejecutivo', '📁 Proyectos', '💰 Presupuesto vs Real', '🎫 Tickets TCMM', '🎫 Ticket MAS',
    '📐 Anteproyectos', '✅ Inspecciones', '📩 Solicitudes',
    'Minimos Indispensables', 'Minimos Detalle',
    '🔧 Cumplimiento Mtto.', '📦 Requisiciones', '🏫 Levant. Planteles', '💵 Levant. Pagos', '📄 Levant. Reportes',
    '📝 Nexus Notas', '✅ Nexus Pendientes',
    '📋 Cumpl. Documentos', '✅ Cumpl. Pendientes', '📝 Cumpl. Notas', '📌 Cumpl. Seguim.',
  ];
  XLSX.writeFile(wb, archivoMatriz());
}

async function exportMatrizExcel(data: {
  projects: unknown[]; checklists: unknown[]; tickets: unknown[];
  anteproyectos: unknown[]; solicitudes: unknown[];
  minimos: unknown[]; ticketsMas: unknown[]; cumplimiento: ColegioCumplimiento[];
  requisiciones: unknown[]; planteles: unknown[]; pagosLev: unknown[];
  nexusNotas: unknown[]; nexusPendientes: unknown[]; reportesLev: unknown[];
  complianceDocs: ComplianceDoc[]; compliancePendientes: CompliancePendiente[];
  complianceNotas: ComplianceNota[]; complianceSeguimientos: ComplianceSeguimiento[];
}) {
  const now  = new Date().toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' });
  const hojas: HojaMatriz[] = [];
  function buildSheet(name: string, sheetTitle: string, headers: string[], rows: CeldaMatriz[][], colWidths: number[], moneyCol?: number | number[]) {
    hojas.push({ name, title: sheetTitle, headers, rows, widths: colWidths, moneyCol });
  }

  const fmt = (d?: string | null) => d ? new Date(d).toLocaleDateString('es-MX') : '—';
  const num = (n?: number | null) => (n != null ? n : 0);

  buildSheet('📁 Proyectos', 'Proyectos — Sistema RCMA', ['Folio', 'Nombre del Proyecto', 'Estatus', 'Avance %', 'Territorio', 'Colegio', 'Responsable', 'Tipo', 'Prioridad', 'Fecha Inicio'],
    (data.projects as Record<string, unknown>[]).map(p => [p.folio ?? '—', p.name ?? '—', p.status ?? '—', p.progress ?? 0, p.territorio ?? '—', p.colegio ?? '—', p.responsible ?? '—', p.tipo_proyecto ?? '—', p.priority ?? '—', fmt(p.start_date as string)]),
    [12, 36, 14, 10, 12, 14, 26, 22, 12, 14]);

  buildSheet('🎫 Tickets TCMM', 'Tickets TCMM — Sistema RCMA', ['Folio', 'Territorio', 'Colegio', 'ECO', 'Tipo', 'Estatus', 'Proveedor', 'Presupuesto', 'Plan Financ.', 'Ticket Físico', 'Fecha'],
    (data.tickets as Record<string, unknown>[]).map(t => [t.folio ?? '—', t.territorio ?? '—', t.colegio ?? '—', t.eco ?? '—', t.tipo_proyecto ?? '—', t.estatus ?? '—', t.nombre_proveedor ?? '—', num(t.presupuesto as number), t.plan_financiamiento ?? '—', t.ticket_fisico ? 'Sí' : 'No', fmt(t.fecha as string)]),
    [14, 12, 14, 26, 18, 12, 24, 16, 16, 13, 14], 7);

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

  // ── Ticket MAS ────────────────────────────────────────────────────────────
  const tmasLbl: Record<string,string> = { autorizado:'Autorizado', pendiente:'Pendiente', en_revision:'En Revisión', cancelado:'Cancelado' };
  buildSheet('🎫 Ticket MAS', 'Ticket MAS — Sistema RCMA',
    ['Folio', 'Colegio', 'Territorio', 'Clasificación', 'Solicitante', 'Estatus', 'Fecha'],
    (data.ticketsMas as Record<string, unknown>[]).map(t => [
      t.folio ?? '—', t.colegio ?? '—', t.territorio ?? '—', t.clasificacion ?? '—',
      t.nombre_solicitante ?? '—', tmasLbl[t.estatus as string] ?? (t.estatus ?? '—'),
      fmt(t.created_at as string),
    ] as (string | number | null | undefined)[]),
    [14, 24, 12, 18, 22, 14, 14]);

  // ── Cumplimiento de Mantenimiento ────────────────────────────────────────
  buildSheet('🔧 Cumplimiento Mtto.', 'Cumplimiento de Mantenimiento por Colegio — Sistema RCMA',
    ['Colegio', 'Territorio', 'Completados', 'Total Programado', '% Cumplimiento'],
    (data.cumplimiento as unknown as ColegioCumplimiento[])
      .slice().sort((a, b) => a.pct - b.pct)
      .map(c => [c.colegio, c.territorio, c.completados, c.total, `${c.pct}%`] as (string | number | null | undefined)[]),
    [16, 12, 14, 18, 16]);

  // ── Insumos — Requisiciones ──────────────────────────────────────────────
  const reqLblXl: Record<string,string> = { pendiente_cotizacion:'Pend. Cotización', cotizacion_recibida:'Cotización Recibida', en_autorizacion:'En Autorización', autorizado:'Autorizado', surtido:'Surtido' };
  buildSheet('📦 Requisiciones', 'Insumos — Requisiciones — Sistema RCMA',
    ['Folio', 'Proveedor(es)', 'Departamento', 'Prioridad', 'Estatus', 'Total (s/IVA)', 'Total (c/IVA)', 'Fecha'],
    (data.requisiciones as Record<string, unknown>[]).map(r => [
      r.folio ?? '—', ((r.proveedores_nombres as string[] | undefined) ?? []).join(', ') || 'Sin proveedor',
      r.departamento ?? '—', r.prioridad ?? '—',
      reqLblXl[r.estatus as string] ?? (r.estatus ?? '—'),
      num(r.total_cotizado as number), num(r.total_con_iva as number),
      fmt(r.created_at as string),
    ] as (string | number | null | undefined)[]),
    [14, 30, 18, 12, 18, 16, 16, 14], [5, 6]);

  // ── Levantamiento Nacional — Planteles ───────────────────────────────────
  buildSheet('🏫 Levant. Planteles', 'Levantamiento Nacional — Planteles — Sistema RCMA',
    ['Colegio', 'Zona', 'ECO', 'Asignación', 'Fase', 'Fecha Inicio', 'Fecha Término'],
    (data.planteles as Record<string, unknown>[]).map(p => [
      p.colegio_nombre ?? '—', p.zona ?? '—', p.eco_nombre ?? '—',
      p.asignacion ?? '—', p.fase ?? '—',
      fmt(p.fecha_inicio as string), fmt(p.fecha_termino as string),
    ] as (string | number | null | undefined)[]),
    [30, 12, 22, 18, 16, 16, 16]);

  // ── Levantamiento Nacional — Pagos ───────────────────────────────────────
  const plantelNombreById = Object.fromEntries((data.planteles as Record<string, unknown>[]).map(p => [p.id, p.colegio_nombre]));
  buildSheet('💵 Levant. Pagos', 'Levantamiento Nacional — Pagos — Sistema RCMA',
    ['Colegio', 'Mes', 'Concepto', 'Monto Programado', 'Monto Pagado', 'Pagado', 'Fecha de Pago'],
    (data.pagosLev as Record<string, unknown>[]).map(p => [
      plantelNombreById[p.plantel_id as string] ?? '—', p.mes_etiqueta ?? '—', p.concepto ?? '—',
      num(p.monto_programado as number), num(p.monto_pagado as number),
      p.pagado ? 'Sí' : 'No', fmt(p.fecha_pago as string),
    ] as (string | number | null | undefined)[]),
    [28, 14, 22, 18, 16, 10, 16], [3, 4]);

  // ── Levantamiento Nacional — Reportes Diarios ────────────────────────────
  buildSheet('📄 Levant. Reportes', 'Levantamiento Nacional — Reportes Diarios — Sistema RCMA',
    ['Colegio', 'Colegio 2', 'Fecha del Reporte', 'Archivo', 'Notas'],
    (data.reportesLev as Record<string, unknown>[]).map(r => [
      plantelNombreById[r.plantel_id as string] ?? 'General',
      r.plantel_id_2 ? (plantelNombreById[r.plantel_id_2 as string] ?? '—') : '—',
      fmt(r.fecha_reporte as string), r.archivo_nombre ?? '—', r.notas ?? '—',
    ] as (string | number | null | undefined)[]),
    [26, 26, 16, 30, 36]);

  // ── NEXUS — Notas ─────────────────────────────────────────────────────────
  buildSheet('📝 Nexus Notas', 'NEXUS — Notas — Sistema RCMA',
    ['Título', 'Categoría', 'Colegio', 'Territorio', 'Fijada', 'Última Actualización'],
    (data.nexusNotas as Record<string, unknown>[]).map(n => [
      n.titulo ?? '—', n.categoria ?? '—', n.colegio ?? '—', n.territorio ?? '—',
      n.fijada ? 'Sí' : 'No', fmt(n.updated_at as string),
    ] as (string | number | null | undefined)[]),
    [32, 16, 22, 14, 10, 18]);

  // ── NEXUS — Pendientes ───────────────────────────────────────────────────
  buildSheet('✅ Nexus Pendientes', 'NEXUS — Pendientes — Sistema RCMA',
    ['Título', 'Tipo', 'Asignado a', 'Compartido con', 'Prioridad', 'Estatus', 'Fecha Límite', 'Colegio', 'Territorio'],
    (data.nexusPendientes as Record<string, unknown>[]).map(p => [
      p.titulo ?? '—', p.tipo ?? '—', p.asignado_nombre ?? '—',
      p.asignado_cc_nombre ?? (p.asignado_cc ? 'Sí' : '—'),
      p.prioridad ?? '—', p.estatus ?? '—', fmt(p.fecha_limite as string),
      p.colegio ?? '—', p.territorio ?? '—',
    ] as (string | number | null | undefined)[]),
    [32, 14, 22, 22, 12, 14, 16, 18, 12]);

  // ── Cumplimiento Normativo — Documentos ──────────────────────────────────
  buildSheet('📋 Cumpl. Documentos', 'Cumplimiento Normativo — Documentos — Sistema RCMA',
    ['Colegio', 'Territorio', 'Materia', 'Documento', 'Estado', 'Vigente', 'Fecha Límite', 'Vigente Hasta', 'Responsable'],
    data.complianceDocs.map(d => [
      d.colegio.replace('Mano Amiga ', ''), d.territorio, d.materia ?? 'Sin categoría',
      d.tipo_documento, d.estado, d.vigente ?? '—',
      fmt(d.fecha_limite_recepcion as string), fmt(d.vigente_hasta as string),
      d.responsable ?? 'Sin asignar',
    ] as (string | number | null | undefined)[]),
    [22, 12, 20, 34, 14, 12, 14, 14, 20]);

  // ── Cumplimiento Normativo — Pendientes ──────────────────────────────────
  buildSheet('✅ Cumpl. Pendientes', 'Cumplimiento Normativo — Pendientes — Sistema RCMA',
    ['Título', 'Colegio', 'Territorio', 'Tipo', 'Prioridad', 'Estatus', 'Fecha Límite', 'Asignado a'],
    data.compliancePendientes.map(p => [
      p.titulo ?? '—', p.colegio ? p.colegio.replace('Mano Amiga ', '') : 'General',
      p.territorio ?? '—', p.tipo === 'compartido' ? 'Compartido' : 'Personal',
      p.prioridad ?? '—', p.estatus ?? '—', fmt(p.fecha_limite as string), p.asignado_a ?? '—',
    ] as (string | number | null | undefined)[]),
    [30, 20, 12, 14, 12, 14, 16, 24]);

  // ── Cumplimiento Normativo — Notas ────────────────────────────────────────
  buildSheet('📝 Cumpl. Notas', 'Cumplimiento Normativo — Notas — Sistema RCMA',
    ['Título', 'Categoría', 'Colegio', 'Territorio', 'Fijada', 'Última Actualización'],
    data.complianceNotas.map(n => [
      n.titulo ?? '—', n.categoria ?? '—', n.colegio ? n.colegio.replace('Mano Amiga ', '') : '—',
      n.territorio ?? '—', n.fijada ? 'Sí' : 'No', fmt(n.updated_at as string),
    ] as (string | number | null | undefined)[]),
    [32, 16, 20, 14, 10, 18]);

  // ── Cumplimiento Normativo — Seguimientos ────────────────────────────────
  buildSheet('📌 Cumpl. Seguim.', 'Cumplimiento Normativo — Seguimientos — Sistema RCMA',
    ['Colegio', 'Territorio', 'Resumen', 'Estatus', 'Fecha Inicio'],
    data.complianceSeguimientos.map(s => [
      s.colegio ? s.colegio.replace('Mano Amiga ', '') : '—', s.territorio ?? '—',
      s.resumen ?? '—', s.estatus === 'activo' ? 'Activo' : 'Completado', fmt(s.created_at as string),
    ] as (string | number | null | undefined)[]),
    [20, 12, 44, 14, 16]);

  // Resumen ejecutivo
  const nexusPendCompartidos = (data.nexusPendientes as Record<string, unknown>[]).filter(p => !!p.asignado_cc).length;
  const resRows = [
    { label: 'Proyectos', count: data.projects.length },
    { label: 'Tickets Registrados (TCMM + TMAS)', count: data.tickets.length + data.ticketsMas.length },
    { label: 'Presupuesto vs Real', count: (data.projects as Record<string, unknown>[]).filter(p => p.budget != null).length },
    { label: 'Anteproyectos', count: data.anteproyectos.length },
    { label: 'Inspecciones', count: data.checklists.length }, { label: 'Solicitudes', count: data.solicitudes.length },
    { label: 'Mínimos Indispensables', count: data.minimos.length },
    { label: 'Mantenimiento — Colegios al Día', count: (data.cumplimiento as unknown as ColegioCumplimiento[]).filter(c => c.pct >= 80).length },
    { label: 'Requisiciones (Insumos)', count: data.requisiciones.length },
    { label: 'Planteles Levantamiento Nacional', count: data.planteles.length },
    { label: 'Pagos Levantamiento Nacional', count: data.pagosLev.length },
    { label: 'Reportes Diarios Levantamiento Nacional', count: data.reportesLev.length },
    { label: 'NEXUS — Notas', count: data.nexusNotas.length },
    { label: 'NEXUS — Pendientes', count: data.nexusPendientes.length },
    { label: 'NEXUS — Pendientes Compartidos', count: nexusPendCompartidos },
    { label: 'Cumplimiento Normativo — Documentos', count: data.complianceDocs.length },
    { label: 'Cumplimiento Normativo — Pendientes', count: data.compliancePendientes.length },
    { label: 'Cumplimiento Normativo — Notas', count: data.complianceNotas.length },
    { label: 'Cumplimiento Normativo — Seguimientos', count: data.complianceSeguimientos.length },
  ];
  const totalGeneral = resRows.filter(r => r.label !== 'NEXUS — Pendientes Compartidos').reduce((a, r) => a + r.count, 0);
  try {
    await renderMatrizPro(hojas, resRows, totalGeneral, now);
  } catch (e) {
    console.warn('Matriz con diseño nuevo no se pudo generar; se usa el formato anterior', e);
    await renderMatrizClasico(hojas, resRows, totalGeneral, now);
  }
}

// ─── Componente ───────────────────────────────────────────────────────────────
export default function Reports() {
  const { isAdmin, can } = usePermissions();
  const { data: rawProjects_    = [] } = useQuery({ queryKey: ['projects'],    queryFn: () => db.Project.list('-created_at', 500) });
  const { data: rawChecklists_  = [] } = useQuery({ queryKey: ['checklists'],  queryFn: () => db.Checklist.list('-created_at', 500) });
  const { data: rawMinimos_ = [] } = useQuery({
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
  const { data: rawSolicitudes_ = [] } = useQuery({
    queryKey: ['solicitudes'],
    queryFn: async () => { const { data, error } = await supabase.from('solicitudes').select('id,nombre_centro,nombre_proyecto,estatus,created_at').order('created_at', { ascending: false }).limit(500); if (error) throw error; return data ?? []; },
  });
  const { data: rawTickets_ = [] } = useQuery({
    queryKey: ['tickets'],
    queryFn: async () => { const { data, error } = await supabase.from('tickets').select('id,folio,territorio,proyecto_id').order('created_at', { ascending: false }).limit(500); if (error) throw error; return data ?? []; },
  });
  const { data: rawTicketsFull_ = [] } = useQuery({
    queryKey: ['tickets-full-report'],
    queryFn: async () => { const { data, error } = await supabase.from('tickets').select('*').order('created_at', { ascending: false }).limit(500); if (error) throw error; return data ?? []; },
  });
  const { data: rawPendientes_ = [] } = useQuery({ queryKey: ['pendientes-report'], queryFn: () => db.Pendiente.list('-created_at', 500) });
  const { data: rawAnteproyectos_ = [] } = useQuery({
    queryKey: ['anteproyectos-report'],
    queryFn: async () => { const { data, error } = await supabase.from('anteproyectos').select('*').order('created_at', { ascending: false }).limit(500); if (error) throw error; return data ?? []; },
  });
  const { data: rawSolicitudesAll_ = [] } = useQuery({
    queryKey: ['solicitudes-all-report'],
    queryFn: async () => { const { data, error } = await supabase.from('solicitudes').select('*').order('created_at', { ascending: false }).limit(500); if (error) throw error; return data ?? []; },
  });

  const { data: rawTicketsMas_ = [] } = useQuery({
    queryKey: ['tickets_mas_pdf_report'],
    queryFn: async () => { const { data, error } = await supabase.from('tickets_mas').select('*').order('created_at', { ascending: false }).limit(500); if (error) throw error; return data ?? []; },
  });

  // Cumplimiento de mantenimiento (mes actual) — mismo cálculo que la pestaña
  // "Cumplimiento" de Calendario: catálogo nacional de actividades vs. lo que
  // cada colegio marcó como realizado.
  const { data: rawCustomMaintenance_ = [] } = useQuery({
    queryKey: ['custom_maintenance-report'],
    queryFn: async () => { const { data, error } = await supabase.from('custom_maintenance').select('*'); if (error) throw error; return data ?? []; },
  });
  const hoyReport = new Date();
  const inicioMesReport = `${hoyReport.getFullYear()}-${String(hoyReport.getMonth()+1).padStart(2,'0')}-01`;
  const finMesReport = `${hoyReport.getFullYear()}-${String(hoyReport.getMonth()+1).padStart(2,'0')}-${String(new Date(hoyReport.getFullYear(), hoyReport.getMonth()+1, 0).getDate()).padStart(2,'0')}`;
  const { data: rawCompletions_ = [] } = useQuery({
    queryKey: ['maintenance_completions-report', inicioMesReport],
    queryFn: async () => {
      const { data, error } = await supabase.from('maintenance_completions').select('colegio')
        .gte('fecha_programada', inicioMesReport).lte('fecha_programada', finMesReport);
      if (error) throw error;
      return data ?? [];
    },
  });
  const { data: rawRequisiciones_ = [] } = useQuery({
    queryKey: ['insumos_requisiciones-report'],
    queryFn: async () => { const { data, error } = await supabase.from('insumos_requisiciones').select('*').order('created_at', { ascending: false }).limit(500); if (error) throw error; return data ?? []; },
  });
  const { data: rawPlanteles_ = [] } = useQuery({
    queryKey: ['lev_planteles-report'],
    queryFn: async () => { const { data, error } = await supabase.from('levantamiento_planteles').select('*').order('colegio_nombre'); if (error) throw error; return data ?? []; },
  });
  const { data: rawPagosLev_ = [] } = useQuery({
    queryKey: ['lev_pagos-report'],
    queryFn: async () => { const { data, error } = await supabase.from('levantamiento_pagos').select('*'); if (error) throw error; return data ?? []; },
  });
  const { data: rawEntregablesLev_ = [] } = useQuery({
    queryKey: ['lev_entregables-report'],
    queryFn: async () => { const { data, error } = await supabase.from('levantamiento_entregables').select('*'); if (error) throw error; return data ?? []; },
  });
  const { data: rawReportesLev_ = [] } = useQuery({
    queryKey: ['lev_reportes-report'],
    queryFn: async () => { const { data, error } = await supabase.from('levantamiento_reportes').select('*').order('fecha_reporte', { ascending: false }); if (error) throw error; return data ?? []; },
  });
  const { data: rawNexusNotas_ = [] } = useQuery({
    queryKey: ['nexus_notas-report'],
    queryFn: async () => { const { data, error } = await supabase.from('nexus_notas').select('*').order('updated_at', { ascending: false }); if (error) throw error; return data ?? []; },
  });
  const { data: rawNexusPendientes_ = [] } = useQuery({
    queryKey: ['nexus_pendientes-report'],
    queryFn: async () => { const { data, error } = await supabase.from('nexus_pendientes').select('*').order('created_at', { ascending: false }); if (error) throw error; return data ?? []; },
  });

  // ── Cumplimiento Normativo — reusa el mismo hook que usan sus propias páginas ──
  const { data: rawComplianceDocs_ = [] } = useComplianceDocs();
  const { data: rawCompliancePendientes_ = [] } = useQuery({
    queryKey: ['compliance_pendientes-report'],
    queryFn: async () => { const { data, error } = await supabase.from('compliance_pendientes').select('*').order('created_at', { ascending: false }); if (error) throw error; return data ?? []; },
  });
  const { data: rawComplianceNotas_ = [] } = useQuery({
    queryKey: ['compliance_notas-report'],
    queryFn: async () => { const { data, error } = await supabase.from('compliance_notas').select('*').order('updated_at', { ascending: false }); if (error) throw error; return data ?? []; },
  });
  const { data: rawComplianceSeguimientos_ = [] } = useQuery({
    queryKey: ['compliance_seguimientos-report'],
    queryFn: async () => { const { data, error } = await supabase.from('compliance_seguimientos').select('*').order('created_at', { ascending: false }); if (error) throw error; return data ?? []; },
  });


  // ── Alcance del usuario ────────────────────────────────────────────────────
  // Admin/generales ven todo. Un CAR (o cualquier usuario con territorio/colegio)
  // ve solo lo suyo, y los módulos que no tiene (NEXUS, Insumos, Cumplimiento
  // Normativo, Levantamiento) no entran ni a la pantalla ni a las exportaciones.
  const { filtrarPorAlcance } = useScope();
  const verNexus   = isAdmin || can('ver_nexus');
  const verInsumos = isAdmin || can('ver_insumos');
  const verCumplN  = isAdmin || can('ver_cumplimiento');
  const verLev     = isAdmin || can('ver_levantamiento');
  const terrDe = useMemo(() => {
    const m: Record<string, string> = {};
    COLEGIOS.forEach(c => { m[c.colegio] = c.territorio; });
    return m;
  }, []);
  const alc = <T,>(rows: T[]): T[] => filtrarPorAlcance(rows as any[],
    (r: any) => r.territorio ?? r.zona ?? terrDe[normalizarColegio(r.colegio ?? r.nombre_centro ?? r.colegio_nombre ?? '')],
    (r: any) => r.colegio ?? r.nombre_centro) as T[];
  const rawProjects       = useMemo(() => alc(rawProjects_), [rawProjects_, filtrarPorAlcance]);
  const rawChecklists     = useMemo(() => alc(rawChecklists_), [rawChecklists_, filtrarPorAlcance]);
  const rawMinimos        = useMemo(() => alc(rawMinimos_), [rawMinimos_, filtrarPorAlcance]);
  const rawSolicitudes    = useMemo(() => alc(rawSolicitudes_), [rawSolicitudes_, filtrarPorAlcance]);
  const rawSolicitudesAll = useMemo(() => alc(rawSolicitudesAll_), [rawSolicitudesAll_, filtrarPorAlcance]);
  const rawTickets        = useMemo(() => alc(rawTickets_), [rawTickets_, filtrarPorAlcance]);
  const rawTicketsFull    = useMemo(() => alc(rawTicketsFull_), [rawTicketsFull_, filtrarPorAlcance]);
  const rawPendientes     = useMemo(() => alc(rawPendientes_), [rawPendientes_, filtrarPorAlcance]);
  const rawAnteproyectos  = useMemo(() => alc(rawAnteproyectos_), [rawAnteproyectos_, filtrarPorAlcance]);
  const rawTicketsMas     = useMemo(() => alc(rawTicketsMas_), [rawTicketsMas_, filtrarPorAlcance]);
  const rawCustomMaintenance = rawCustomMaintenance_;
  const rawCompletions    = useMemo(() => alc(rawCompletions_), [rawCompletions_, filtrarPorAlcance]);
  const rawRequisiciones  = useMemo(() => verInsumos ? alc(rawRequisiciones_) : [], [rawRequisiciones_, verInsumos, filtrarPorAlcance]);
  const rawPlanteles      = useMemo(() => verLev ? alc(rawPlanteles_) : [], [rawPlanteles_, verLev, filtrarPorAlcance]);
  const idsPlanteles      = useMemo(() => new Set((rawPlanteles as any[]).map(p => p.id)), [rawPlanteles]);
  const todosPlanteles    = rawPlanteles.length === rawPlanteles_.length;
  const dePlantel = (r: any) => todosPlanteles || !r.plantel_id || idsPlanteles.has(r.plantel_id);
  const rawPagosLev       = useMemo(() => verLev ? (rawPagosLev_ as any[]).filter(dePlantel) : [], [rawPagosLev_, verLev, idsPlanteles, todosPlanteles]);
  const rawEntregablesLev = useMemo(() => verLev ? (rawEntregablesLev_ as any[]).filter(dePlantel) : [], [rawEntregablesLev_, verLev, idsPlanteles, todosPlanteles]);
  const rawReportesLev    = useMemo(() => verLev ? (rawReportesLev_ as any[]).filter(dePlantel) : [], [rawReportesLev_, verLev, idsPlanteles, todosPlanteles]);
  const rawNexusNotas     = verNexus ? rawNexusNotas_ : [];
  const rawNexusPendientes = useMemo(() => verNexus ? alc(rawNexusPendientes_) : [], [rawNexusPendientes_, verNexus, filtrarPorAlcance]);
  const rawComplianceDocs = useMemo(() => verCumplN ? alc(rawComplianceDocs_ as any[]) : [], [rawComplianceDocs_, verCumplN, filtrarPorAlcance]);
  const rawCompliancePendientes = useMemo(() => verCumplN ? alc(rawCompliancePendientes_) : [], [rawCompliancePendientes_, verCumplN, filtrarPorAlcance]);
  const rawComplianceNotas = verCumplN ? rawComplianceNotas_ : [];
  const rawComplianceSeguimientos = useMemo(() => verCumplN ? alc(rawComplianceSeguimientos_) : [], [rawComplianceSeguimientos_, verCumplN, filtrarPorAlcance]);

  const projects    = rawProjects    as unknown as Project[];
  const checklists  = rawChecklists  as unknown[];
  const solicitudes = rawSolicitudes as unknown as Solicitud[];
  const tickets     = rawTickets     as unknown as Ticket[];
  const pendientes  = rawPendientes  as unknown as Pendiente[];
  const requisiciones = rawRequisiciones as unknown as ReqInsumo[];
  const planteles    = rawPlanteles    as unknown as PlantelLev[];
  const pagosLev      = rawPagosLev      as unknown as PagoLev[];
  const ticketsMasArr = rawTicketsMas    as unknown as any[];

  const cumplimiento = useMemo((): ColegioCumplimiento[] => {
    const { todasActividades } = mergeActividadesConCustom(rawCustomMaintenance as any[]);
    let totalInstancias = 0;
    todasActividades.forEach(act => { totalInstancias += calcularFechasEnMes(act, hoyReport.getFullYear(), hoyReport.getMonth()).length; });
    return alc(COLEGIOS).map(c => {
      const completados = (rawCompletions as { colegio: string }[]).filter(r => r.colegio === c.colegio).length;
      const pct = totalInstancias > 0 ? Math.round((completados / totalInstancias) * 100) : 0;
      return { colegio: c.colegio, territorio: c.territorio, completados, total: totalInstancias, pct };
    });
  }, [rawCustomMaintenance, rawCompletions, filtrarPorAlcance]);

  const stats = useMemo((): Stats => ({
    total:       projects.length,
    completed:   projects.filter(p => p.status === 'completado').length,
    avgProgress: projects.length > 0 ? Math.round(projects.reduce((a, p) => a + (p.progress ?? 0), 0) / projects.length) : 0,
  }), [projects]);

  const activeProjects = useMemo(() => projects.filter(p => p.status !== 'completado' && p.status !== 'cancelado'), [projects]);

  const terData = useMemo(() => {
    const t = Array.from(new Set([
      ...tickets.map(t => t.territorio ?? 'Sin territorio'),
      ...ticketsMasArr.map((t: any) => t.territorio ?? 'Sin territorio'),
    ])).sort();
    return t.map(ter => ({
      territorio: ter,
      tcmm: tickets.filter(t => (t.territorio ?? 'Sin territorio') === ter).length,
      tmas: ticketsMasArr.filter((t: any) => (t.territorio ?? 'Sin territorio') === ter).length,
      count: tickets.filter(t => (t.territorio ?? 'Sin territorio') === ter).length
           + ticketsMasArr.filter((t: any) => (t.territorio ?? 'Sin territorio') === ter).length,
    }));
  }, [tickets, ticketsMasArr]);

  const handleExportPDF = () => exportResumenPDF({
    stats, projects, checklists, solicitudes, tickets: rawTicketsFull as unknown as Ticket[],
    pendientes,
    nexusPendientes: rawNexusPendientes as unknown as NexusPendiente[],
    ticketsMas:    rawTicketsMas    as any[],
    minimos:       rawMinimos       as any[],
    anteproyectos: rawAnteproyectos as any[],
    solicitudesAll: rawSolicitudesAll as any[],
    cumplimiento, requisiciones, planteles, pagosLev,
    entregablesLev: rawEntregablesLev as unknown as EntregableLev[],
    complianceDocs: rawComplianceDocs as ComplianceDoc[],
    compliancePendientes: rawCompliancePendientes as unknown as CompliancePendiente[],
  }).catch(e => { console.error('Error generando PDF:', e); alert('Error al generar PDF: ' + (e?.message ?? e)); });

  const handleExportExcel = () => exportMatrizExcel({
    projects: rawProjects, checklists: rawChecklists, tickets: rawTicketsFull,
    anteproyectos: rawAnteproyectos, solicitudes: rawSolicitudesAll,
    minimos: rawMinimos,
    ticketsMas: rawTicketsMas, cumplimiento,
    requisiciones: rawRequisiciones, planteles: rawPlanteles, pagosLev: rawPagosLev,
    nexusNotas: rawNexusNotas, nexusPendientes: rawNexusPendientes, reportesLev: rawReportesLev,
    complianceDocs: rawComplianceDocs as ComplianceDoc[],
    compliancePendientes: rawCompliancePendientes as unknown as CompliancePendiente[],
    complianceNotas: rawComplianceNotas as unknown as ComplianceNota[],
    complianceSeguimientos: rawComplianceSeguimientos as unknown as ComplianceSeguimiento[],
  }).catch(e => console.error('Error generando Excel:', e));

  const handleExportEstatusColegio = () => exportEstatusColegioPDF({
    projects, tickets: rawTicketsFull as unknown as Ticket[], ticketsMas: ticketsMasArr,
    minimos: rawMinimos as any[], planteles,
  }).catch(e => { console.error('Error generando reporte de estatus por colegio:', e); alert('Error al generar el reporte: ' + (e?.message ?? e)); });

  const handleExportIncidencias = () => exportIncidenciasPDF({
    projects, nexusPendientes: rawNexusPendientes as unknown as NexusPendiente[], ticketsMas: ticketsMasArr, minimos: rawMinimos as any[],
    pagosLev, planteles,
  }).catch(e => { console.error('Error generando reporte de incidencias:', e); alert('Error al generar el reporte: ' + (e?.message ?? e)); });

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

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className={`${cardClass} border-l-4 border-l-orange-500`}>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Cumplimiento Mantenimiento (mes)</p>
          <div className="flex items-center justify-between">
            <h3 className="text-3xl font-black text-slate-900">
              {cumplimiento.length > 0 ? Math.round(cumplimiento.reduce((s, c) => s + c.pct, 0) / cumplimiento.length) : 0}%
            </h3>
            <Wrench className="w-8 h-8 text-orange-50" />
          </div>
          <p className="text-xs text-slate-400 mt-1">{cumplimiento.filter(c => c.pct < 40).length} colegio(s) rezagado(s)</p>
        </div>
        {verInsumos && (
        <div className={`${cardClass} border-l-4 border-l-teal-500`}>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Requisiciones (Insumos)</p>
          <div className="flex items-center justify-between">
            <h3 className="text-3xl font-black text-slate-900">{requisiciones.filter(r => r.estatus !== 'surtido').length}</h3>
            <Package className="w-8 h-8 text-teal-50" />
          </div>
          <p className="text-xs text-slate-400 mt-1">{requisiciones.length} registradas en total</p>
        </div>
        )}
        {verLev && (
        <div className={`${cardClass} border-l-4 border-l-indigo-500`}>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Planteles Levantamiento</p>
          <div className="flex items-center justify-between">
            <h3 className="text-3xl font-black text-slate-900">{planteles.length}</h3>
            <Building2 className="w-8 h-8 text-indigo-50" />
          </div>
          <p className="text-xs text-slate-400 mt-1">Levantamiento Nacional</p>
        </div>
        )}
        {verLev && (
        <div className={`${cardClass} border-l-4 border-l-red-500`}>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Pagos Pendientes (Lev.)</p>
          <div className="flex items-center justify-between">
            <h3 className="text-3xl font-black text-slate-900">{pagosLev.filter(p => !p.pagado).length}</h3>
            <ClockAlert className="w-8 h-8 text-red-50" />
          </div>
          <p className="text-xs text-slate-400 mt-1">{pagosLev.length} pagos en total</p>
        </div>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {verCumplN && (
        <div className={`${cardClass} border-l-4 border-l-sky-500`}>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Cumplimiento Normativo</p>
          <div className="flex items-center justify-between">
            <h3 className="text-3xl font-black text-slate-900">{(rawComplianceDocs as ComplianceDoc[]).length}</h3>
            <ShieldCheck className="w-8 h-8 text-sky-50" />
          </div>
          <p className="text-xs text-slate-400 mt-1">
            {(rawComplianceDocs as ComplianceDoc[]).filter(d => esRetraso(d, new Date())).length} en retraso
          </p>
        </div>
        )}
      </div>

      {terData.length > 0 && (
        <div className={cardClass}>
          <h3 className="font-bold text-slate-900 mb-4 flex items-center gap-2">
            <PieChart className="w-4 h-4 text-blue-500" /> Tickets MAS por Territorio
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[10px] font-black uppercase tracking-widest text-slate-400 border-b border-slate-100">
                  <th className="text-left pb-2 pr-4">Territorio</th>
                  <th className="text-right pb-2 pr-4">TCMM</th>
                  <th className="text-right pb-2 pr-4">TMAS</th>
                  <th className="text-right pb-2">Total</th>
                </tr>
              </thead>
              <tbody>
                {terData.map(({ territorio, tcmm, tmas, count }) => (
                  <tr key={territorio} className="border-b border-slate-50 hover:bg-slate-50">
                    <td className="py-2 pr-4 text-slate-700 font-medium">{territorio}</td>
                    <td className="py-2 pr-4 text-right tabular-nums text-slate-500">{tcmm}</td>
                    <td className="py-2 pr-4 text-right tabular-nums text-slate-500">{tmas}</td>
                    <td className="py-2 text-right tabular-nums font-bold text-slate-700">{count}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-slate-900 text-white text-xs font-bold">
                  <td className="py-2 px-2 rounded-l-lg">TOTAL</td>
                  <td className="py-2 pr-4 text-right tabular-nums">{tickets.length}</td>
                  <td className="py-2 pr-4 text-right tabular-nums">{ticketsMasArr.length}</td>
                  <td className="py-2 text-right tabular-nums pr-2 rounded-r-lg">{tickets.length + ticketsMasArr.length}</td>
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
            <button className={btnOutline} onClick={handleExportEstatusColegio}>
              <PieChart className="w-4 h-4 text-blue-600" /> Estatus por Colegio
            </button>
            <button className={btnOutline} onClick={handleExportIncidencias}>
              <Filter className="w-4 h-4 text-slate-600" /> Reporte de Incidencias
            </button>
            {isAdmin && <PresentacionSemanal className={btnOutline} />}
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
