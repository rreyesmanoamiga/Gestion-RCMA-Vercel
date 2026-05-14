import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Search, ClipboardCheck, User, Calendar, ShieldCheck, Plus,
  X, FileDown, Trash2, ChevronDown, ChevronUp,
  CheckCircle2, XCircle, Clock, MinusCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { db } from '@/lib/db';
import { supabase } from '@/lib/supabaseClient';
import { TERRITORIOS, COLEGIOS } from '@/lib/colegios';
import PageHeader from '@/components/shared/PageHeader';
import EmptyState from '@/components/shared/EmptyState';
import ChecklistForm, { MATERIALES } from '@/components/checklists/ChecklistForm';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { usePermissions } from '@/hooks/usePermissions';

// ─────────────────────────────────────────────────────────────────────────────
// TAB 1 — HELPERS (Checklists normales)
// ─────────────────────────────────────────────────────────────────────────────
const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  bueno:   { label: 'Bueno',   className: 'bg-green-100 text-green-700 border border-green-200' },
  regular: { label: 'Regular', className: 'bg-yellow-100 text-yellow-700 border border-yellow-200' },
  malo:    { label: 'Malo',    className: 'bg-orange-100 text-orange-700 border border-orange-200' },
  critico: { label: 'Crítico', className: 'bg-red-100 text-red-700 border border-red-200' },
};

function StatusBadge({ status }: { status?: string }) {
  const cfg = STATUS_CONFIG[status ?? 'bueno'] ?? STATUS_CONFIG.bueno;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${cfg.className}`}>
      {cfg.label}
    </span>
  );
}

const abreviarMaterial = (m: string) => {
  const match = m.match(/^([^(]+)/);
  return match ? match[1].trim() : m;
};

const formatFecha = (fecha?: string) => {
  if (!fecha) return null;
  try { return format(parseISO(fecha), "d MMM yyyy", { locale: es }); }
  catch { return fecha; }
};

interface ChecklistRecord {
  id: string; titulo?: string; inspector?: string; fecha?: string;
  territorio?: string; colegio?: string; material?: string;
  overall_status?: string; created_at?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 2 — MÍNIMOS INDISPENSABLES
// ─────────────────────────────────────────────────────────────────────────────
const SECCIONES_MINIMOS = [
  {
    id: 'construccion', titulo: '01 · Construcción y Espacios',
    colorHex: '#1A4B8C', norma: 'NMX-R-021-SCFI-2013 · LGE Art. 98-101',
    items: [
      { id: 'aulas_m2',        nombre: 'Aulas con superficie mínima reglamentaria (24–48 m² según alumnos)' },
      { id: 'puertas_ancho',   nombre: 'Puertas de aula >= 0.90 m y salidas de emergencia >= 1.20 m' },
      { id: 'pasillos',        nombre: 'Pasillos comunes entre aulas >= 1.20 m de ancho' },
      { id: 'direccion',       nombre: 'Dirección, subdirección y área administrativa' },
      { id: 'bodega',          nombre: 'Bodega, archivo y caseta de vigilancia' },
      { id: 'sanitarios',      nombre: 'Sanitarios separados por género (1 WC + 1 lavabo c/30 alumnos)' },
      { id: 'bebederos',       nombre: 'Bebederos de agua potable con sistema de purificación' },
      { id: 'areas_dep',       nombre: 'Áreas deportivas y recreativas' },
      { id: 'estacionamiento', nombre: 'Estacionamiento (mín. 1 cajón por cada 40 m² construidos)' },
    ],
  },
  {
    id: 'instalaciones', titulo: '02 · Instalaciones',
    colorHex: '#E07B2A', norma: 'NOM-001-SEDE-2005 · NMX-R-080-SCFI-2015',
    items: [
      { id: 'tablero',          nombre: 'Tablero eléctrico general con protecciones diferenciales' },
      { id: 'circuitos',        nombre: 'Circuitos separados por áreas (iluminación, contactos, cómputo)' },
      { id: 'iluminacion',      nombre: 'Iluminación mínima 300 lux en aulas — alumbrado de emergencia en pasillos' },
      { id: 'polo_tierra',      nombre: 'Polo a tierra certificado en toda la instalación eléctrica' },
      { id: 'agua_red',         nombre: 'Red de agua potable con suministro garantizado (cisterna o tinaco)' },
      { id: 'drenaje',          nombre: 'Red de drenaje sanitario conectada a colector o planta de tratamiento' },
      { id: 'gas',              nombre: 'Instalación de gas certificada con válvulas de corte accesibles (si aplica)' },
      { id: 'inst_elect_cert',  nombre: 'Revisión y certificación de instalación eléctrica' },
    ],
  },
  {
    id: 'accesibilidad', titulo: '03 · Accesibilidad e Inclusión',
    colorHex: '#0D8A7E', norma: 'NMX-R-090-SCFI-2016',
    items: [
      { id: 'rampa_acceso',    nombre: 'Rampa en acceso principal con pendiente <= 8%' },
      { id: 'sia',             nombre: 'Señalización internacional de accesibilidad (SIA)' },
      { id: 'pasillos_libres', nombre: 'Pasillos internos libres de obstáculos >= 1.20 m' },
      { id: 'sanitario_adapt', nombre: 'Al menos un baño adaptado por género con barras de apoyo' },
      { id: 'senaletica',      nombre: 'Señalética en braille en puertas y avisos en pictogramas' },
      { id: 'escalones',       nombre: 'Contraste visual en bordes de escalones y pasamanos en rampas' },
    ],
  },
  {
    id: 'seguridad', titulo: '04 · Seguridad y Protección Civil',
    colorHex: '#C0392B', norma: 'NOM-002-STPS-2010 · LGE Art. 101',
    items: [
      { id: 'const_pc',       nombre: 'Constancia de Protección Civil vigente (anual)' },
      { id: 'pipc',           nombre: 'Programa Interno de Protección Civil (PIPC) actualizado' },
      { id: 'seg_estr',       nombre: 'Constancia de Seguridad Estructural vigente (cada 5 años)' },
      { id: 'poliza_rc',      nombre: 'Póliza de Responsabilidad Civil vigente' },
      { id: 'extintores',     nombre: 'Extintores certificados y señalizados en cada área' },
      { id: 'senal_emerg',    nombre: 'Señalización completa de salidas de emergencia y rutas de evacuación' },
      { id: 'simulacros',     nombre: 'Registro de simulacros realizados (mín. 4 al año)' },
      { id: 'brigadas',       nombre: 'Brigadas de protección civil integradas y capacitadas' },
    ],
  },
  {
    id: 'mantenimiento', titulo: '05 · Mantenimiento Preventivo',
    colorHex: '#1A7A4A', norma: 'NMX-R-021-SCFI-2013',
    items: [
      { id: 'cronograma',    nombre: 'Cronograma de mantenimiento preventivo activo y documentado' },
      { id: 'bitacora',      nombre: 'Bitácora de mantenimiento al día con evidencias fotográficas' },
      { id: 'cisterna_limp', nombre: 'Limpieza y desinfección de cisterna/tinaco al corriente' },
      { id: 'fumigacion',    nombre: 'Control de plagas y fumigación preventiva vigente' },
      { id: 'cert_extinct',  nombre: 'Revisión y recarga de extintores al corriente' },
    ],
  },
];

type EstadoItem = 'cumple' | 'no_cumple' | 'en_proceso' | 'na';

interface ItemEval {
  id: string; seccion: string; nombre: string;
  estado: EstadoItem; observacion: string;
}

interface EvalMinimos {
  id: string; colegio: string; territorio: string; inspector: string;
  fecha: string; notas: string; items: ItemEval[];
  resultado: 'completo' | 'incompleto' | 'en_proceso'; created_at: string;
}

const ESTADO_CFG: Record<EstadoItem, { label: string; badge: string; pdf: [number,number,number] }> = {
  cumple:     { label: 'Cumple',     badge: 'bg-green-100 text-green-700 border border-green-200',   pdf: [22,163,74]   },
  no_cumple:  { label: 'No Cumple',  badge: 'bg-red-100 text-red-700 border border-red-200',         pdf: [220,38,38]   },
  en_proceso: { label: 'En Proceso', badge: 'bg-amber-100 text-amber-700 border border-amber-200',   pdf: [202,138,4]   },
  na:         { label: 'N/A',        badge: 'bg-slate-100 text-slate-500 border border-slate-200',   pdf: [148,163,184] },
};

const RESULTADO_CFG = {
  completo:   { label: 'Completo',   cls: 'bg-green-100 text-green-700 border border-green-200' },
  en_proceso: { label: 'En Proceso', cls: 'bg-amber-100 text-amber-700 border border-amber-200' },
  incompleto: { label: 'Incompleto', cls: 'bg-red-100 text-red-700 border border-red-200' },
};

function calcResultado(items: ItemEval[]): EvalMinimos['resultado'] {
  if (items.some(i => i.estado === 'no_cumple')) return 'incompleto';
  if (items.some(i => i.estado === 'en_proceso')) return 'en_proceso';
  return 'completo';
}

function initItems(): ItemEval[] {
  return SECCIONES_MINIMOS.flatMap(s =>
    s.items.map(it => ({ id: it.id, seccion: s.id, nombre: it.nombre, estado: 'na' as EstadoItem, observacion: '' }))
  );
}

// ── PDF Mínimos ───────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
// PDF HELPERS
// ─────────────────────────────────────────────────────────────────────────────
function sanitize(text: string): string {
  return (text ?? '')
    .replace(/≥/g, '>=').replace(/≤/g, '<=')
    .replace(/→/g, '->').replace(/↳/g, 'Obs:')
    .replace(/✓/g, 'OK').replace(/✗/g, 'X')
    .replace(/[^\x00-\xFF]/g, '?');
}

async function loadJsPDF() {
  const w = window as Window & { jspdf?: { jsPDF: any } };
  if (w.jspdf?.jsPDF) return w.jspdf.jsPDF;
  await new Promise<void>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
    s.onload = () => resolve(); s.onerror = () => reject(new Error('jsPDF load error'));
    document.head.appendChild(s);
  });
  return w.jspdf!.jsPDF;
}

async function generarPDFMinimos(ev: EvalMinimos) {
  const JsPDF = await loadJsPDF();
  const doc = new JsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const W = 210, mL = 20, mR = 20, cW = W - mL - mR;
  let y = 0;
  const now = format(new Date(), "d 'de' MMMM 'de' yyyy", { locale: es });

  // Header
  doc.setFillColor(15, 23, 42); doc.rect(0, 0, W, 28, 'F');
  doc.setFillColor(13, 138, 126); doc.rect(0, 0, 4, 28, 'F');
  doc.setFontSize(14); doc.setFont('helvetica', 'bold'); doc.setTextColor(255, 255, 255);
  doc.text('Evaluación de Mínimos Indispensables — Sistema RCMA', mL, 12);
  doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(180, 180, 200);
  doc.text('Colegios Mano Amiga  ·  Coordinación de Obras  ·  Generado el ' + now, mL, 22);
  try {
    const logoImg = await new Promise<string>((res, rej) => {
      const img = new Image(); img.crossOrigin = 'anonymous';
      img.onload = () => { const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height; cv.getContext('2d')!.drawImage(img, 0, 0); res(cv.toDataURL('image/png')); };
      img.onerror = rej; img.src = '/logo.png';
    });
    doc.addImage(logoImg, 'PNG', W - 38, 2, 28, 24);
  } catch { /* sin logo */ }
  y = 38;

  doc.setFontSize(17); doc.setFont('helvetica', 'bold'); doc.setTextColor(15, 23, 42);
  doc.text('Evaluación de Mínimos Indispensables', mL, y); y += 9;

  const resColors: Record<string, [number,number,number]> = { completo: [22,163,74], en_proceso: [202,138,4], incompleto: [220,38,38] };
  const resLabel: Record<string, string> = { completo: 'COMPLETO', en_proceso: 'EN PROCESO', incompleto: 'INCOMPLETO' };
  const [rr,rg,rb] = resColors[ev.resultado] ?? resColors.incompleto;
  doc.setFillColor(rr, rg, rb); doc.roundedRect(mL, y, 36, 7, 1.5, 1.5, 'F');
  doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.setTextColor(255, 255, 255);
  doc.text(resLabel[ev.resultado] ?? ev.resultado.toUpperCase(), mL + 18, y + 5, { align: 'center' });
  y += 13;

  // Info grid
  doc.setFillColor(241, 245, 249); doc.roundedRect(mL, y - 4, cW, 22, 2, 2, 'F');
  [
    { label: 'COLEGIO',   val: ev.colegio ?? '—',   sub: ev.territorio ?? '' },
    { label: 'INSPECTOR', val: ev.inspector || 'Sin asignar', sub: '' },
    { label: 'FECHA',     val: ev.fecha ? format(new Date(ev.fecha + 'T12:00:00'), "d MMM yyyy", { locale: es }) : '—', sub: '' },
  ].forEach((item, i) => {
    const x = mL + i * (cW / 3) + 4;
    doc.setFontSize(7); doc.setFont('helvetica', 'bold'); doc.setTextColor(100, 116, 139); doc.text(item.label, x, y + 2);
    doc.setFontSize(10); doc.setFont('helvetica', 'bold'); doc.setTextColor(15, 23, 42); doc.text(item.val, x, y + 10);
    if (item.sub) { doc.setFontSize(7); doc.setFont('helvetica', 'normal'); doc.setTextColor(148, 163, 184); doc.text(item.sub, x, y + 16); }
  });
  y += 28;

  // KPIs
  doc.setFontSize(12); doc.setFont('helvetica', 'bold'); doc.setTextColor(15, 23, 42);
  doc.text('Resumen por Estado', mL, y); y += 4;
  doc.setDrawColor(220, 220, 220); doc.line(mL, y, W - mR, y); y += 6;
  const kpiColors: Record<string, { bg:[number,number,number]; text:[number,number,number] }> = {
    'Cumple':     { bg:[240,253,244], text:[22,163,74]    },
    'No Cumple':  { bg:[254,242,242], text:[220,38,38]    },
    'En Proceso': { bg:[255,251,235], text:[202,138,4]    },
    'N/A':        { bg:[248,250,252], text:[100,116,139]  },
  };
  const kpiW = (cW - 6) / 4;
  [
    ['Cumple',     ev.items.filter(i => i.estado === 'cumple').length],
    ['No Cumple',  ev.items.filter(i => i.estado === 'no_cumple').length],
    ['En Proceso', ev.items.filter(i => i.estado === 'en_proceso').length],
    ['N/A',        ev.items.filter(i => i.estado === 'na').length],
  ].forEach(([label, count], i) => {
    const x = mL + i * (kpiW + 2);
    const { bg, text } = kpiColors[label as string] ?? kpiColors['N/A'];
    doc.setFillColor(...bg); doc.setDrawColor(220, 220, 220); doc.roundedRect(x, y, kpiW, 22, 2, 2, 'FD');
    doc.setFontSize(18); doc.setFont('helvetica', 'bold'); doc.setTextColor(...text);
    doc.text(String(count), x + kpiW / 2, y + 13, { align: 'center' });
    doc.setFontSize(7); doc.text((label as string).toUpperCase(), x + kpiW / 2, y + 19, { align: 'center' });
  });
  y += 30;

  if (ev.notas) {
    doc.setFontSize(9); doc.setFont('helvetica', 'italic'); doc.setTextColor(100, 116, 139);
    const nL = doc.splitTextToSize('Notas: ' + ev.notas, cW);
    doc.text(nL, mL, y); y += nL.length * 5 + 4;
  }

  // Secciones
  SECCIONES_MINIMOS.forEach(sec => {
    const secItems = ev.items.filter(it => it.seccion === sec.id);
    if (!secItems.length) return;
    if (y > 240) { doc.addPage(); y = 20; }
    const hex = sec.colorHex.replace('#', '');
    doc.setFillColor(parseInt(hex.substring(0,2),16), parseInt(hex.substring(2,4),16), parseInt(hex.substring(4,6),16));
    doc.rect(mL - 2, y - 4, cW + 4, 9, 'F');
    doc.setFontSize(10); doc.setFont('helvetica', 'bold'); doc.setTextColor(255, 255, 255);
    doc.text(sec.titulo, mL + 1, y + 2);
    doc.setFontSize(7); doc.setFont('helvetica', 'normal'); doc.setTextColor(200, 220, 255);
    doc.text(sec.norma, W - mR - 2, y + 2, { align: 'right' });
    y += 10;
    secItems.forEach((item, i) => {
      if (y > 265) { doc.addPage(); y = 20; }
      const rowH = item.observacion ? 13 : 9;
      if (i % 2 === 0) { doc.setFillColor(248, 250, 252); doc.rect(mL - 2, y - 3, cW + 4, rowH + 2, 'F'); }
      const [er, eg, eb] = ESTADO_CFG[item.estado].pdf;
      doc.setFillColor(Math.min(er+200,255), Math.min(eg+200,255), Math.min(eb+200,255));
      doc.roundedRect(mL, y - 2, 30, 6, 1, 1, 'F');
      doc.setFontSize(7); doc.setFont('helvetica', 'bold'); doc.setTextColor(er, eg, eb);
      doc.text(ESTADO_CFG[item.estado].label.toUpperCase(), mL + 15, y + 2.5, { align: 'center' });
      doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(15, 23, 42);
      doc.text(sanitize(item.nombre), mL + 34, y + 2);
      if (item.observacion) {
        doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(100, 116, 139);
        const obs = doc.splitTextToSize('Obs: ' + sanitize(item.observacion), cW - 34);
        doc.text(obs, mL + 34, y + 8);
      }
      y += rowH + 3;
    });
    y += 4;
  });

  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(7); doc.setTextColor(160, 160, 160);
    doc.text('Sistema RCMA — Mínimos Indispensables — Página ' + i + ' de ' + pages, mL, 290);
    doc.text('Documento confidencial · Colegios Mano Amiga', W - mR, 290, { align: 'right' });
  }

  doc.save(`minimos-${(ev.colegio ?? 'colegio').toLowerCase().replace(/[^a-z0-9]+/g,'-')}-${ev.fecha ?? 'sin-fecha'}.pdf`);
}

// ─────────────────────────────────────────────────────────────────────────────
// PDF REPORTE GENERAL
// ─────────────────────────────────────────────────────────────────────────────
async function generarReporteGeneral(evaluaciones: EvalMinimos[]) {
  if (!evaluaciones.length) { alert('No hay evaluaciones para generar el reporte.'); return; }

  const JsPDF = await loadJsPDF();
  const doc   = new JsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const W = 210, mL = 18, mR = 18, cW = W - mL - mR;
  const now = format(new Date(), "d 'de' MMMM 'de' yyyy", { locale: es });
  let y = 0;

  const addFooters = () => {
    const pages = doc.getNumberOfPages();
    for (let i = 1; i <= pages; i++) {
      doc.setPage(i);
      doc.setFillColor(15, 23, 42); doc.rect(0, 285, W, 12, 'F');
      doc.setFontSize(7); doc.setFont('helvetica', 'normal'); doc.setTextColor(160, 170, 190);
      doc.text('Sistema RCMA  ·  Reporte General de Mínimos Indispensables  ·  Colegios Mano Amiga', mL, 291);
      doc.text('Pág. ' + i + ' / ' + pages, W - mR, 291, { align: 'right' });
    }
  };

  // ── PORTADA ───────────────────────────────────────────────────────────────
  doc.setFillColor(15, 23, 42); doc.rect(0, 0, W, 297, 'F');
  doc.setFillColor(13, 138, 126); doc.rect(0, 0, 6, 297, 'F');
  doc.setFillColor(26, 75, 140); doc.rect(W - 6, 0, 6, 297, 'F');

  // Decorative rectangles
  doc.setFillColor(255, 255, 255); doc.setGState(doc.GState({ opacity: 0.04 }));
  doc.rect(30, 30, 150, 150, 'F');
  doc.setGState(doc.GState({ opacity: 1 }));

  try {
    const logoImg = await new Promise<string>((res, rej) => {
      const img = new Image(); img.crossOrigin = 'anonymous';
      img.onload = () => { const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height; cv.getContext('2d')!.drawImage(img, 0, 0); res(cv.toDataURL('image/png')); };
      img.onerror = rej; img.src = '/logo.png';
    });
    doc.addImage(logoImg, 'PNG', W / 2 - 20, 40, 40, 32);
  } catch { /* sin logo */ }

  doc.setFontSize(11); doc.setFont('helvetica', 'normal'); doc.setTextColor(13, 138, 126);
  doc.text('COLEGIOS MANO AMIGA', W / 2, 88, { align: 'center' });

  doc.setFontSize(26); doc.setFont('helvetica', 'bold'); doc.setTextColor(255, 255, 255);
  doc.text('REPORTE GENERAL', W / 2, 110, { align: 'center' });
  doc.setFontSize(18); doc.setFont('helvetica', 'normal');
  doc.text('Mínimos Indispensables por Plantel', W / 2, 122, { align: 'center' });

  doc.setFillColor(13, 138, 126); doc.rect(mL + 20, 132, cW - 40, 0.5, 'F');

  // KPIs portada — 4 cuadros compactos centrados
  const kpiData = [
    { label: 'Planteles\nevaluados', val: evaluaciones.length,                                          color: [255,255,255] as [number,number,number], bg: [30,50,90]   as [number,number,number] },
    { label: 'Completos',           val: evaluaciones.filter(e => e.resultado==='completo').length,     color: [22,163,74]   as [number,number,number], bg: [10,50,25]   as [number,number,number] },
    { label: 'En Proceso',          val: evaluaciones.filter(e => e.resultado==='en_proceso').length,   color: [202,138,4]   as [number,number,number], bg: [50,40,5]    as [number,number,number] },
    { label: 'Incompletos',         val: evaluaciones.filter(e => e.resultado==='incompleto').length,   color: [220,38,38]   as [number,number,number], bg: [50,10,10]   as [number,number,number] },
  ];
  const kW = 36; const kGap = 4;
  const kTotalW = kpiData.length * kW + (kpiData.length - 1) * kGap;
  const kStartX = (W - kTotalW) / 2;
  const kY = 148;
  kpiData.forEach((k, i) => {
    const x = kStartX + i * (kW + kGap);
    doc.setFillColor(...k.bg);
    doc.setDrawColor(60, 80, 120);
    doc.roundedRect(x, kY, kW, 28, 2, 2, 'FD');
    doc.setFontSize(20); doc.setFont('helvetica', 'bold'); doc.setTextColor(...k.color);
    doc.text(String(k.val), x + kW / 2, kY + 14, { align: 'center' });
    doc.setFontSize(7); doc.setFont('helvetica', 'normal'); doc.setTextColor(170, 185, 210);
    k.label.split('\n').forEach((line, li) => doc.text(line, x + kW / 2, kY + 20 + li * 4.5, { align: 'center' }));
  });

  doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(100, 120, 160);
  doc.text('Generado el ' + now, W / 2, 198, { align: 'center' });
  doc.text('Coordinacion de Obras  ·  Sistema RCMA', W / 2, 205, { align: 'center' });

  // ── PÁGINA 2: RESUMEN EJECUTIVO ───────────────────────────────────────────
  doc.addPage(); y = 20;

  doc.setFillColor(15, 23, 42); doc.rect(0, 0, W, 14, 'F');
  doc.setFillColor(13, 138, 126); doc.rect(0, 0, 4, 14, 'F');
  doc.setFontSize(11); doc.setFont('helvetica', 'bold'); doc.setTextColor(255, 255, 255);
  doc.text('Resumen Ejecutivo', mL, 10);
  doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(160, 170, 190);
  doc.text(now, W - mR, 10, { align: 'right' });
  y = 24;

  // Cumplimiento global
  const totalItems   = evaluaciones.reduce((s, e) => s + (e.items?.length ?? 0), 0);
  const totalCumple  = evaluaciones.reduce((s, e) => s + (e.items?.filter(i => i.estado === 'cumple').length ?? 0), 0);
  const pctGlobal    = totalItems > 0 ? Math.round((totalCumple / totalItems) * 100) : 0;

  doc.setFontSize(11); doc.setFont('helvetica', 'bold'); doc.setTextColor(15, 23, 42);
  doc.text('Cumplimiento Global de la Red', mL, y); y += 4;
  doc.setDrawColor(220, 220, 220); doc.line(mL, y, W - mR, y); y += 6;

  // Barra de progreso grande
  doc.setFillColor(226, 232, 240); doc.roundedRect(mL, y, cW, 10, 2, 2, 'F');
  const pctW = (pctGlobal / 100) * cW;
  const barColor: [number,number,number] = pctGlobal >= 80 ? [22,163,74] : pctGlobal >= 50 ? [202,138,4] : [220,38,38];
  doc.setFillColor(...barColor); doc.roundedRect(mL, y, Math.max(pctW, 4), 10, 2, 2, 'F');
  doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.setTextColor(255, 255, 255);
  if (pctGlobal > 10) doc.text(pctGlobal + '% Cumplimiento', mL + 4, y + 7);
  y += 16;

  // Conteo global por estado
  const estados: EstadoItem[] = ['cumple', 'no_cumple', 'en_proceso', 'na'];
  const kW2 = (cW - 9) / 4;
  estados.forEach((e, i) => {
    const cnt = evaluaciones.reduce((s, ev) => s + (ev.items?.filter(it => it.estado === e).length ?? 0), 0);
    const cfg = ESTADO_CFG[e];
    const x = mL + i * (kW2 + 3);
    doc.setFillColor(248, 250, 252); doc.setDrawColor(220, 220, 220);
    doc.roundedRect(x, y, kW2, 22, 2, 2, 'FD');
    const [cr, cg, cb] = cfg.pdf;
    doc.setFontSize(16); doc.setFont('helvetica', 'bold'); doc.setTextColor(cr, cg, cb);
    doc.text(String(cnt), x + kW2 / 2, y + 13, { align: 'center' });
    doc.setFontSize(7); doc.setTextColor(100, 116, 139);
    doc.text(cfg.label.toUpperCase(), x + kW2 / 2, y + 19, { align: 'center' });
  });
  y += 30;

  // Cumplimiento por sección (barras horizontales)
  doc.setFontSize(11); doc.setFont('helvetica', 'bold'); doc.setTextColor(15, 23, 42);
  doc.text('Cumplimiento por Categoría (todos los planteles)', mL, y); y += 4;
  doc.setDrawColor(220, 220, 220); doc.line(mL, y, W - mR, y); y += 6;

  SECCIONES_MINIMOS.forEach(sec => {
    const secTotal  = evaluaciones.reduce((s, ev) => s + (ev.items?.filter(i => i.seccion === sec.id).length ?? 0), 0);
    const secCumple = evaluaciones.reduce((s, ev) => s + (ev.items?.filter(i => i.seccion === sec.id && i.estado === 'cumple').length ?? 0), 0);
    const pct = secTotal > 0 ? Math.round((secCumple / secTotal) * 100) : 0;
    const hex = sec.colorHex.replace('#', '');
    const [hr, hg, hb] = [parseInt(hex.substring(0,2),16), parseInt(hex.substring(2,4),16), parseInt(hex.substring(4,6),16)];

    doc.setFontSize(8.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(15, 23, 42);
    doc.text(sec.titulo, mL, y + 4);
    doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(100, 116, 139);
    doc.text(pct + '%', W - mR, y + 4, { align: 'right' });

    doc.setFillColor(226, 232, 240); doc.roundedRect(mL, y + 6, cW, 5, 1, 1, 'F');
    doc.setFillColor(hr, hg, hb); doc.roundedRect(mL, y + 6, Math.max((pct / 100) * cW, 2), 5, 1, 1, 'F');
    y += 16;
  });
  y += 4;

  // ── PÁGINA 3: TABLA COMPARATIVA ───────────────────────────────────────────
  doc.addPage(); y = 20;

  doc.setFillColor(15, 23, 42); doc.rect(0, 0, W, 14, 'F');
  doc.setFillColor(26, 75, 140); doc.rect(0, 0, 4, 14, 'F');
  doc.setFontSize(11); doc.setFont('helvetica', 'bold'); doc.setTextColor(255, 255, 255);
  doc.text('Tabla Comparativa por Plantel', mL, 10);
  y = 22;

  // Encabezado tabla
  const cols = [
    { label: 'Plantel',      w: 52 },
    { label: 'Territorio',   w: 32 },
    { label: 'Inspector',    w: 30 },
    { label: 'Fecha',        w: 22 },
    { label: 'Resultado',    w: 26 },
    { label: '% Cumple',     w: 12 },
  ];
  let cx = mL;
  doc.setFillColor(15, 23, 42);
  doc.rect(mL, y, cW, 8, 'F');
  cols.forEach(c => {
    doc.setFontSize(7.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(255, 255, 255);
    doc.text(c.label, cx + 2, y + 5.5);
    cx += c.w;
  });
  y += 9;

  const resColors2: Record<string, [number,number,number]> = { completo: [22,163,74], en_proceso: [202,138,4], incompleto: [220,38,38] };
  const resLabels2: Record<string, string> = { completo: 'Completo', en_proceso: 'En Proceso', incompleto: 'Incompleto' };

  evaluaciones.forEach((ev, idx) => {
    if (y > 270) { doc.addPage(); y = 20; }
    const rowH = 9;
    doc.setFillColor(idx % 2 === 0 ? 248 : 255, idx % 2 === 0 ? 250 : 255, idx % 2 === 0 ? 252 : 255);
    doc.rect(mL, y, cW, rowH, 'F');
    doc.setDrawColor(220, 220, 220); doc.rect(mL, y, cW, rowH, 'D');

    const cumplePct = ev.items?.length > 0
      ? Math.round((ev.items.filter(i => i.estado === 'cumple').length / ev.items.length) * 100) : 0;

    const rowData = [
      ev.colegio ?? '—',
      ev.territorio ?? '—',
      ev.inspector || '—',
      ev.fecha ? format(new Date(ev.fecha + 'T12:00:00'), 'd MMM yy', { locale: es }) : '—',
      '',
      cumplePct + '%',
    ];

    cx = mL;
    rowData.forEach((val, ci) => {
      if (ci === 4) {
        // Resultado badge
        const [rr2, rg2, rb2] = resColors2[ev.resultado] ?? resColors2.incompleto;
        doc.setFillColor(rr2, rg2, rb2); doc.roundedRect(cx + 1, y + 1.5, cols[ci].w - 2, 6, 1, 1, 'F');
        doc.setFontSize(6.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(255, 255, 255);
        doc.text((resLabels2[ev.resultado] ?? ev.resultado).toUpperCase(), cx + cols[ci].w / 2, y + 6, { align: 'center' });
      } else {
        doc.setFontSize(8); doc.setFont('helvetica', ci === 0 ? 'bold' : 'normal'); doc.setTextColor(15, 23, 42);
        const txt = doc.splitTextToSize(val, cols[ci].w - 3);
        doc.text(txt[0] ?? '', cx + 2, y + 6);
      }
      cx += cols[ci].w;
    });
    y += rowH;
  });

  // ── PÁGINAS SIGUIENTES: DETALLE POR PLANTEL (condensado) ──────────────────
  evaluaciones.forEach(ev => {
    doc.addPage(); y = 20;

    // Mini header por plantel
    doc.setFillColor(15, 23, 42); doc.rect(0, 0, W, 14, 'F');
    const [rr3, rg3, rb3] = resColors2[ev.resultado] ?? resColors2.incompleto;
    doc.setFillColor(rr3, rg3, rb3); doc.rect(0, 0, 4, 14, 'F');
    doc.setFontSize(11); doc.setFont('helvetica', 'bold'); doc.setTextColor(255, 255, 255);
    doc.text(ev.colegio ?? '—', mL, 10);
    doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(160, 170, 190);
    doc.text((ev.territorio ?? '') + '  ·  ' + (ev.inspector || 'Sin inspector') + '  ·  ' + (ev.fecha ? format(new Date(ev.fecha + 'T12:00:00'), "d MMM yyyy", { locale: es }) : '—'), W - mR, 10, { align: 'right' });

    y = 22;

    // Barra de cumplimiento del plantel
    const pctPl = ev.items?.length > 0 ? Math.round((ev.items.filter(i => i.estado === 'cumple').length / ev.items.length) * 100) : 0;
    doc.setFillColor(226, 232, 240); doc.roundedRect(mL, y, cW, 7, 1.5, 1.5, 'F');
    const barC2: [number,number,number] = pctPl >= 80 ? [22,163,74] : pctPl >= 50 ? [202,138,4] : [220,38,38];
    doc.setFillColor(...barC2); doc.roundedRect(mL, y, Math.max((pctPl / 100) * cW, 3), 7, 1.5, 1.5, 'F');
    doc.setFontSize(7); doc.setFont('helvetica', 'bold'); doc.setTextColor(255, 255, 255);
    if (pctPl > 8) doc.text(pctPl + '% Cumplimiento general', mL + 3, y + 5.2);
    y += 13;

    // Mini KPIs
    const miniKpis: Array<[EstadoItem, string]> = [['cumple','Cumple'],['no_cumple','No Cumple'],['en_proceso','En Proceso'],['na','N/A']];
    const mkW = (cW - 9) / 4;
    miniKpis.forEach(([estado, label], mi) => {
      const cnt = ev.items?.filter(i => i.estado === estado).length ?? 0;
      const x = mL + mi * (mkW + 3);
      const [cr2, cg2, cb2] = ESTADO_CFG[estado].pdf;
      doc.setFillColor(248, 250, 252); doc.setDrawColor(220, 220, 220);
      doc.roundedRect(x, y, mkW, 14, 1.5, 1.5, 'FD');
      doc.setFontSize(12); doc.setFont('helvetica', 'bold'); doc.setTextColor(cr2, cg2, cb2);
      doc.text(String(cnt), x + mkW / 2, y + 9, { align: 'center' });
      doc.setFontSize(6.5); doc.setTextColor(100, 116, 139);
      doc.text(label.toUpperCase(), x + mkW / 2, y + 13, { align: 'center' });
    });
    y += 21;

    if (ev.notas) {
      doc.setFillColor(255, 251, 235); doc.setDrawColor(252, 211, 77);
      doc.roundedRect(mL, y, cW, 10, 1.5, 1.5, 'FD');
      doc.setFontSize(8); doc.setFont('helvetica', 'italic'); doc.setTextColor(120, 80, 0);
      const nL = doc.splitTextToSize('Notas: ' + ev.notas, cW - 6);
      doc.text(nL[0], mL + 3, y + 7);
      y += 14;
    }

    // Items con NO CUMPLE y EN PROCESO solamente (condensado — solo los que requieren atención)
    const itemsAtencion = ev.items?.filter(i => i.estado === 'no_cumple' || i.estado === 'en_proceso') ?? [];

    if (itemsAtencion.length > 0) {
      doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(15, 23, 42);
      doc.text('Ítems que requieren atención', mL, y); y += 4;
      doc.setDrawColor(220, 220, 220); doc.line(mL, y, W - mR, y); y += 5;

      itemsAtencion.forEach((item, i) => {
        if (y > 270) { doc.addPage(); y = 20; }
        const rowH = item.observacion ? 14 : 9;
        if (i % 2 === 0) { doc.setFillColor(254, 242, 242); doc.rect(mL - 1, y - 2, cW + 2, rowH + 1, 'F'); }
        const [er2, eg2, eb2] = ESTADO_CFG[item.estado].pdf;
        doc.setFillColor(Math.min(er2+200,255), Math.min(eg2+200,255), Math.min(eb2+200,255));
        doc.roundedRect(mL, y - 1.5, 24, 5.5, 1, 1, 'F');
        doc.setFontSize(6.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(er2, eg2, eb2);
        doc.text(ESTADO_CFG[item.estado].label.toUpperCase(), mL + 12, y + 2.5, { align: 'center' });
        doc.setFontSize(8.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(15, 23, 42);
        const nombre = doc.splitTextToSize(sanitize(item.nombre), cW - 28);
        doc.text(nombre[0], mL + 27, y + 2.5);
        if (item.observacion) {
          doc.setFontSize(7.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(100, 116, 139);
          doc.text('Obs: ' + sanitize(item.observacion), mL + 27, y + 9);
        }
        y += rowH + 2;
      });
    } else {
      doc.setFillColor(240, 253, 244); doc.setDrawColor(134, 239, 172);
      doc.roundedRect(mL, y, cW, 12, 2, 2, 'FD');
      doc.setFontSize(10); doc.setFont('helvetica', 'bold'); doc.setTextColor(22, 101, 52);
      doc.text('[OK]  Este plantel cumple con todos los minimos indispensables', W / 2, y + 8, { align: 'center' });
      y += 18;
    }

    // Items cumplidos (compacto — solo lista)
    const itemsCumple2 = ev.items?.filter(i => i.estado === 'cumple') ?? [];
    if (itemsCumple2.length > 0) {
      if (y > 250) { doc.addPage(); y = 20; }
      doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(15, 23, 42);
      doc.text('Ítems cumplidos (' + itemsCumple2.length + ')', mL, y); y += 4;
      doc.setDrawColor(220, 220, 220); doc.line(mL, y, W - mR, y); y += 4;
      const colC = Math.floor(cW / 85);
      let cx2 = mL; let rowStart = y;
      itemsCumple2.forEach((item, i) => {
        if (y > 272) { doc.addPage(); y = 20; rowStart = y; cx2 = mL; }
        doc.setFontSize(7); doc.setFont('helvetica', 'normal'); doc.setTextColor(22, 163, 74);
        doc.text('OK', cx2, y + 3);
        doc.setTextColor(50, 70, 50);
        const txt = doc.splitTextToSize(sanitize(item.nombre), 80);
        doc.text(txt[0], cx2 + 5, y + 3);
        y += 6;
        if ((i + 1) % colC === 0) { cx2 = mL; }
      });
    }
  });

  addFooters();
  doc.save(`reporte-general-minimos-${format(new Date(), 'yyyy-MM-dd')}.pdf`);
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENTE PRINCIPAL
// ─────────────────────────────────────────────────────────────────────────────
export default function Checklists() {
  const navigate     = useNavigate();
  const qc           = useQueryClient();
  const { isAdmin }  = usePermissions();

  const [activeTab, setActiveTab] = useState<'inspecciones' | 'minimos'>('inspecciones');

  // ── Tab 1: Inspecciones ───────────────────────────────────────────────────
  const [search,     setSearch]     = useState('');
  const [filterTerr, setFilterTerr] = useState('');
  const [filterCol,  setFilterCol]  = useState('');
  const [filterMat,  setFilterMat]  = useState('');
  const [formOpen,   setFormOpen]   = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['checklists'],
    queryFn: () => db.Checklist.list('-created_at', 500),
  });
  const checklists = useMemo(() => (data ?? []) as unknown as ChecklistRecord[], [data]);
  const colegiosFiltrados = useMemo(() =>
    filterTerr ? COLEGIOS.filter(c => c.territorio === filterTerr) : COLEGIOS, [filterTerr]);
  const filtered = useMemo(() => {
    let list = checklists;
    if (search)     list = list.filter(c => (c.titulo ?? '').toLowerCase().includes(search.toLowerCase()));
    if (filterTerr) list = list.filter(c => c.territorio === filterTerr);
    if (filterCol)  list = list.filter(c => c.colegio === filterCol);
    if (filterMat)  list = list.filter(c => c.material === filterMat);
    return list;
  }, [checklists, search, filterTerr, filterCol, filterMat]);

  const createMutation = useMutation({
    mutationFn: (d: Record<string, unknown>) => db.Checklist.create(d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['checklists'] }); setFormOpen(false); toast.success('Inspección creada'); },
    onError: () => toast.error('Error al crear la inspección'),
  });

  // ── Tab 2: Mínimos Indispensables ─────────────────────────────────────────
  const [mSearch,     setMSearch]     = useState('');
  const [mFilterTerr, setMFilterTerr] = useState('');
  const [mFilterCol,  setMFilterCol]  = useState('');
  const [showForm,    setShowForm]    = useState(false);
  const [expandedId,  setExpandedId]  = useState<string | null>(null);
  const [confirmDel,  setConfirmDel]  = useState<string | null>(null);

  const [formColegio,   setFormColegio]   = useState('');
  const [formInspector, setFormInspector] = useState('');
  const [formFecha,     setFormFecha]     = useState(format(new Date(), 'yyyy-MM-dd'));
  const [formNotas,     setFormNotas]     = useState('');
  const [formItems,     setFormItems]     = useState<ItemEval[]>(initItems);

  const { data: minimosRaw = [], isLoading: minimosLoading } = useQuery({
    queryKey: ['minimos_indispensables'],
    queryFn: async () => {
      const { data: d, error } = await supabase
        .from('minimos_indispensables').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return d as EvalMinimos[];
    },
  });

  const evaluaciones = useMemo(() => {
    let list = minimosRaw;
    if (mSearch)     list = list.filter(e => e.colegio?.toLowerCase().includes(mSearch.toLowerCase()));
    if (mFilterTerr) list = list.filter(e => e.territorio === mFilterTerr);
    if (mFilterCol)  list = list.filter(e => e.colegio === mFilterCol);
    return list;
  }, [minimosRaw, mSearch, mFilterTerr, mFilterCol]);

  const mColegiosFiltrados = useMemo(() =>
    mFilterTerr ? COLEGIOS.filter(c => c.territorio === mFilterTerr) : COLEGIOS, [mFilterTerr]);

  const createMinMutation = useMutation({
    mutationFn: async () => {
      const terr = COLEGIOS.find(c => c.colegio === formColegio)?.territorio ?? '';
      const { error } = await supabase.from('minimos_indispensables').insert({
        colegio: formColegio, territorio: terr, inspector: formInspector,
        fecha: formFecha, notas: formNotas, items: formItems,
        resultado: calcResultado(formItems),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['minimos_indispensables'] });
      toast.success('Evaluación guardada');
      setShowForm(false);
      setFormColegio(''); setFormInspector(''); setFormNotas('');
      setFormFecha(format(new Date(), 'yyyy-MM-dd')); setFormItems(initItems());
    },
    onError: () => toast.error('Error al guardar la evaluación'),
  });

  const deleteMinMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('minimos_indispensables').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['minimos_indispensables'] }); toast.success('Eliminado'); setConfirmDel(null); },
    onError: () => toast.error('Error al eliminar'),
  });

  const setItemEstado = (id: string, estado: EstadoItem) =>
    setFormItems(prev => prev.map(it => it.id === id ? { ...it, estado } : it));
  const setItemObs = (id: string, obs: string) =>
    setFormItems(prev => prev.map(it => it.id === id ? { ...it, observacion: obs } : it));

  const conteoForm = useMemo(() => ({
    cumple:     formItems.filter(i => i.estado === 'cumple').length,
    no_cumple:  formItems.filter(i => i.estado === 'no_cumple').length,
    en_proceso: formItems.filter(i => i.estado === 'en_proceso').length,
    na:         formItems.filter(i => i.estado === 'na').length,
  }), [formItems]);

  const inputClass = "w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-slate-900 focus:outline-none bg-white";
  const selectClass = "px-3 py-2 border border-slate-300 rounded-md text-sm bg-white text-slate-700 focus:ring-2 focus:ring-slate-900 focus:outline-none";

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="p-6">

      {/* Header con acción según tab */}
      <PageHeader
        title="Checklists"
        subtitle={activeTab === 'inspecciones' ? 'Validación visual de infraestructuras' : 'Evaluación de infraestructura mínima requerida por plantel'}
        actionLabel={activeTab === 'inspecciones' ? 'Nueva Inspección' : (isAdmin ? 'Nueva Evaluación' : undefined)}
        onAction={activeTab === 'inspecciones' ? () => setFormOpen(true) : (isAdmin ? () => { setShowForm(true); setFormItems(initItems()); } : undefined)}
      />

      {/* Tabs */}
      <div className="flex gap-1 mt-5 mb-6 bg-slate-100 rounded-lg p-1 w-fit">
        <button
          onClick={() => setActiveTab('inspecciones')}
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-semibold transition-all ${activeTab === 'inspecciones' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
          <ClipboardCheck className="w-4 h-4" /> Inspecciones
          <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${activeTab === 'inspecciones' ? 'bg-slate-900 text-white' : 'bg-slate-200 text-slate-500'}`}>
            {checklists.length}
          </span>
        </button>
        <button
          onClick={() => setActiveTab('minimos')}
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-semibold transition-all ${activeTab === 'minimos' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
          <ShieldCheck className="w-4 h-4" /> Mínimos Indispensables
          <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${activeTab === 'minimos' ? 'bg-slate-900 text-white' : 'bg-slate-200 text-slate-500'}`}>
            {minimosRaw.length}
          </span>
        </button>
      </div>

      {/* ════════════════════════════════════════════════════════════════════
          TAB 1 — INSPECCIONES
      ════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'inspecciones' && (
        <>
          <div className="flex flex-wrap gap-3 mb-4 items-center">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input type="text" placeholder="Buscar inspección..."
                className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-slate-900 focus:outline-none bg-white"
                value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <select className={selectClass} value={filterTerr} onChange={e => { setFilterTerr(e.target.value); setFilterCol(''); }}>
              <option value="">Todos los Territorios</option>
              {TERRITORIOS.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <select className={selectClass} value={filterCol} onChange={e => setFilterCol(e.target.value)}>
              <option value="">Todos los Colegios</option>
              {colegiosFiltrados.map(c => <option key={c.colegio} value={c.colegio}>{c.colegio}</option>)}
            </select>
            <select className={selectClass} value={filterMat} onChange={e => setFilterMat(e.target.value)}>
              <option value="">Todos los Materiales</option>
              {MATERIALES.map(m => <option key={m} value={m}>{abreviarMaterial(m)}</option>)}
            </select>
            <span className="text-sm text-slate-500 font-medium">
              {filtered.length} {filtered.length === 1 ? 'inspección' : 'inspecciones'}
            </span>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState icon={ClipboardCheck} title="No hay inspecciones" description="Crea tu primera inspección con el botón Nueva Inspección" />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filtered.map(c => (
                <div key={c.id} onClick={() => navigate(`/checklists/${c.id}`)}
                  className="bg-white rounded-xl border border-slate-200 p-4 cursor-pointer hover:shadow-md hover:border-slate-300 transition-all duration-200 flex flex-col gap-3">
                  <div className="flex items-start justify-between gap-2">
                    <StatusBadge status={c.overall_status} />
                    <div className="text-right">
                      <p className="text-xs font-bold text-slate-500">{c.colegio}</p>
                      <p className="text-[10px] text-slate-400 uppercase tracking-wide">{c.material ? abreviarMaterial(c.material) : ''}</p>
                    </div>
                  </div>
                  <p className="font-semibold text-slate-900 text-sm leading-snug line-clamp-2">{c.titulo ?? 'Sin título'}</p>
                  <div className="flex items-center justify-between text-xs text-slate-400 pt-1 border-t border-slate-100 mt-auto">
                    <span className="flex items-center gap-1"><User className="w-3 h-3" />{c.inspector || 'Sin inspector'}</span>
                    <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{formatFecha(c.fecha ?? c.created_at) ?? '—'}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          <ChecklistForm open={formOpen} onClose={() => setFormOpen(false)} onSubmit={d => createMutation.mutate(d)} />
        </>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          TAB 2 — MÍNIMOS INDISPENSABLES
      ════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'minimos' && (
        <>
          {/* Stats + botón reporte general */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-5">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 flex-1">
              {[
                { label: 'Total',       val: minimosRaw.length,                                          cls: 'bg-slate-900 text-white' },
                { label: 'Completos',   val: minimosRaw.filter(e => e.resultado === 'completo').length,   cls: 'bg-green-50 text-green-700 border border-green-200' },
                { label: 'En Proceso',  val: minimosRaw.filter(e => e.resultado === 'en_proceso').length, cls: 'bg-amber-50 text-amber-700 border border-amber-200' },
                { label: 'Incompletos', val: minimosRaw.filter(e => e.resultado === 'incompleto').length, cls: 'bg-red-50 text-red-700 border border-red-200' },
              ].map(s => (
                <div key={s.label} className={`rounded-xl p-4 ${s.cls}`}>
                  <p className="text-xs font-bold uppercase tracking-wide opacity-70 mb-1">{s.label}</p>
                  <p className="text-3xl font-black">{s.val}</p>
                </div>
              ))}
            </div>
            <button
              onClick={() => generarReporteGeneral(minimosRaw)}
              disabled={minimosRaw.length === 0}
              className="flex items-center gap-2 px-4 py-3 bg-slate-900 text-white rounded-xl text-sm font-semibold hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0 shadow-sm">
              <FileDown className="w-4 h-4" />
              <span>Elaborar<br/>Reporte General</span>
            </button>
          </div>

          {/* Filtros */}
          <div className="flex flex-wrap gap-3 mb-4">
            <div className="relative flex-1 min-w-[180px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-slate-900 focus:outline-none bg-white"
                placeholder="Buscar colegio..." value={mSearch} onChange={e => setMSearch(e.target.value)} />
            </div>
            <select className={selectClass} value={mFilterTerr} onChange={e => { setMFilterTerr(e.target.value); setMFilterCol(''); }}>
              <option value="">Todos los territorios</option>
              {TERRITORIOS.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <select className={selectClass} value={mFilterCol} onChange={e => setMFilterCol(e.target.value)}>
              <option value="">Todos los colegios</option>
              {mColegiosFiltrados.map(c => <option key={c.colegio} value={c.colegio}>{c.colegio}</option>)}
            </select>
          </div>

          {/* Lista */}
          {minimosLoading ? (
            <div className="flex justify-center py-16"><div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin" /></div>
          ) : evaluaciones.length === 0 ? (
            <div className="bg-white rounded-xl border border-slate-200 py-16 text-center">
              <ShieldCheck className="w-12 h-12 text-slate-200 mx-auto mb-3" />
              <p className="text-sm font-semibold text-slate-500">Sin evaluaciones registradas</p>
              {isAdmin && <p className="text-xs text-slate-400 mt-1">Crea la primera con el botón "Nueva Evaluación".</p>}
            </div>
          ) : (
            <div className="space-y-3">
              {evaluaciones.map(ev => {
                const resCfg = RESULTADO_CFG[ev.resultado] ?? RESULTADO_CFG.incompleto;
                const isExp  = expandedId === ev.id;
                const cumple = ev.items?.filter(i => i.estado === 'cumple').length ?? 0;
                const total  = ev.items?.length ?? 0;
                const pct    = total > 0 ? Math.round((cumple / total) * 100) : 0;

                return (
                  <div key={ev.id} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="px-5 py-4 flex items-center gap-4 cursor-pointer hover:bg-slate-50 transition-colors"
                      onClick={() => setExpandedId(isExp ? null : ev.id)}>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-black text-slate-900">{ev.colegio}</p>
                          <span className="text-xs text-slate-400">{ev.territorio}</span>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${resCfg.cls}`}>{resCfg.label}</span>
                        </div>
                        <div className="flex items-center gap-4 mt-1">
                          <p className="text-xs text-slate-500">{ev.inspector || 'Sin inspector'} · {ev.fecha ? format(new Date(ev.fecha + 'T12:00:00'), "d MMM yyyy", { locale: es }) : '—'}</p>
                          <div className="flex items-center gap-1.5">
                            <div className="w-20 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                              <div className="h-full bg-green-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                            </div>
                            <span className="text-xs text-slate-500">{pct}%</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button onClick={e => { e.stopPropagation(); generarPDFMinimos(ev); }}
                          className="p-2 text-slate-400 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors" title="Descargar PDF">
                          <FileDown className="w-4 h-4" />
                        </button>
                        {isAdmin && (
                          <button onClick={e => { e.stopPropagation(); setConfirmDel(ev.id); }}
                            className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                        {isExp ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                      </div>
                    </div>

                    {isExp && (
                      <div className="border-t border-slate-100 px-5 py-4 space-y-4">
                        <div className="grid grid-cols-4 gap-2">
                          {(['cumple','no_cumple','en_proceso','na'] as EstadoItem[]).map(e => (
                            <div key={e} className={`rounded-lg p-3 text-center ${ESTADO_CFG[e].badge}`}>
                              <p className="text-2xl font-black">{ev.items?.filter(i => i.estado === e).length ?? 0}</p>
                              <p className="text-[10px] font-bold uppercase mt-0.5">{ESTADO_CFG[e].label}</p>
                            </div>
                          ))}
                        </div>
                        {SECCIONES_MINIMOS.map(sec => {
                          const secItems = ev.items?.filter(i => i.seccion === sec.id) ?? [];
                          return (
                            <div key={sec.id}>
                              <div className="flex items-center gap-2 mb-2">
                                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: sec.colorHex }} />
                                <p className="text-xs font-bold text-slate-700 uppercase tracking-wide">{sec.titulo}</p>
                                <span className="text-[9px] text-slate-400 italic">{sec.norma}</span>
                              </div>
                              <div className="space-y-1">
                                {secItems.map(it => (
                                  <div key={it.id} className="flex items-start gap-3 py-1.5 px-2 rounded-lg bg-slate-50">
                                    <span className={`shrink-0 mt-0.5 text-xs font-bold px-1.5 py-0.5 rounded-full ${ESTADO_CFG[it.estado].badge}`}>{ESTADO_CFG[it.estado].label}</span>
                                    <div className="flex-1 min-w-0">
                                      <p className="text-xs font-medium text-slate-800">{it.nombre}</p>
                                      {it.observacion && <p className="text-xs text-slate-500 mt-0.5 italic">{it.observacion}</p>}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                        {ev.notas && (
                          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                            <p className="text-xs font-bold text-amber-700 mb-1">Notas generales</p>
                            <p className="text-xs text-amber-800">{ev.notas}</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Modal nueva evaluación */}
          {showForm && (
            <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/60 backdrop-blur-sm p-4 overflow-y-auto">
              <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl my-6 flex flex-col border border-slate-200">
                <div className="p-5 border-b border-slate-100 bg-slate-50 flex justify-between items-center sticky top-0 z-10">
                  <div>
                    <h3 className="font-black text-slate-900 flex items-center gap-2"><ShieldCheck className="w-4 h-4" /> Nueva Evaluación de Mínimos</h3>
                    <p className="text-xs text-slate-500 mt-0.5">Completa los 5 rubros para el plantel</p>
                  </div>
                  <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
                </div>
                <div className="p-6 space-y-6 overflow-y-auto">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Colegio *</label>
                      <select className={inputClass} value={formColegio} onChange={e => setFormColegio(e.target.value)}>
                        <option value="">Seleccionar colegio...</option>
                        {COLEGIOS.map(c => <option key={c.colegio} value={c.colegio}>{c.colegio} — {c.territorio}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Inspector</label>
                      <input className={inputClass} placeholder="Nombre del inspector" value={formInspector} onChange={e => setFormInspector(e.target.value)} />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Fecha de evaluación</label>
                      <input type="date" className={inputClass} value={formFecha} onChange={e => setFormFecha(e.target.value)} />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Notas generales</label>
                      <input className={inputClass} placeholder="Observaciones generales..." value={formNotas} onChange={e => setFormNotas(e.target.value)} />
                    </div>
                  </div>

                  <div className="grid grid-cols-4 gap-2">
                    {(['cumple','no_cumple','en_proceso','na'] as EstadoItem[]).map(e => (
                      <div key={e} className={`rounded-lg p-2 text-center text-xs font-bold ${ESTADO_CFG[e].badge}`}>
                        <span className="text-lg font-black block">{conteoForm[e]}</span>
                        {ESTADO_CFG[e].label}
                      </div>
                    ))}
                  </div>

                  {SECCIONES_MINIMOS.map(sec => (
                    <div key={sec.id}>
                      <div className="rounded-lg px-4 py-2.5 mb-3 flex items-center gap-2" style={{ backgroundColor: sec.colorHex + '18', border: `1px solid ${sec.colorHex}44` }}>
                        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: sec.colorHex }} />
                        <p className="text-sm font-black" style={{ color: sec.colorHex }}>{sec.titulo}</p>
                        <span className="text-xs text-slate-400 italic ml-auto">{sec.norma}</span>
                      </div>
                      <div className="space-y-3">
                        {sec.items.map(item => {
                          const fi = formItems.find(i => i.id === item.id)!;
                          return (
                            <div key={item.id} className="border border-slate-200 rounded-lg p-3 bg-white">
                              <p className="text-xs font-semibold text-slate-800 mb-2">{item.nombre}</p>
                              <div className="flex flex-wrap gap-1.5 mb-2">
                                {(['cumple','no_cumple','en_proceso','na'] as EstadoItem[]).map(e => (
                                  <button key={e} onClick={() => setItemEstado(item.id, e)}
                                    className={`px-2.5 py-1 rounded-full text-xs font-bold border transition-all ${fi.estado === e ? ESTADO_CFG[e].badge + ' ring-2 ring-offset-1 ring-slate-400' : 'bg-slate-50 text-slate-400 border-slate-200 hover:bg-slate-100'}`}>
                                    {ESTADO_CFG[e].label}
                                  </button>
                                ))}
                              </div>
                              {fi.estado !== 'cumple' && fi.estado !== 'na' && (
                                <input className="w-full px-2 py-1 text-xs border border-slate-200 rounded-md focus:ring-1 focus:ring-slate-400 focus:outline-none"
                                  placeholder="Observación (opcional)..." value={fi.observacion}
                                  onChange={e => setItemObs(item.id, e.target.value)} />
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="p-5 border-t border-slate-100 bg-slate-50 flex justify-end gap-3 sticky bottom-0">
                  <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200 rounded-md">Cancelar</button>
                  <button disabled={!formColegio || createMinMutation.isPending} onClick={() => createMinMutation.mutate()}
                    className="px-5 py-2 bg-slate-900 text-white rounded-lg text-sm font-semibold hover:bg-slate-800 disabled:opacity-50 transition-colors">
                    {createMinMutation.isPending ? 'Guardando...' : 'Guardar Evaluación'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Modal confirmar eliminar */}
          {confirmDel && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
              <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full p-6 border border-slate-200">
                <h3 className="font-bold text-slate-900 mb-2">¿Eliminar evaluación?</h3>
                <p className="text-sm text-slate-500 mb-5">Esta acción no se puede deshacer.</p>
                <div className="flex justify-end gap-3">
                  <button onClick={() => setConfirmDel(null)} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-md">Cancelar</button>
                  <button onClick={() => deleteMinMutation.mutate(confirmDel)} disabled={deleteMinMutation.isPending}
                    className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-semibold hover:bg-red-700 disabled:opacity-50">
                    {deleteMinMutation.isPending ? 'Eliminando...' : 'Eliminar'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
