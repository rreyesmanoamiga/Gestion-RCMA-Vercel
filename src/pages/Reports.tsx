import React, { useMemo } from 'react';
import { db } from '@/lib/db';
import { supabase } from '@/lib/supabaseClient';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart3,
  Download,
  FileSpreadsheet,
  FileText,
  PieChart,
  Filter,
  TrendingUp,
  ClockAlert,
} from 'lucide-react';
import PageHeader from '@/components/shared/PageHeader';

const btnOutline = "flex items-center gap-2 px-4 py-2.5 border border-slate-300 rounded-lg text-sm font-bold text-slate-700 hover:bg-slate-50 transition-all shadow-sm disabled:opacity-40 disabled:cursor-not-allowed";
const cardClass  = "bg-white p-6 rounded-xl border border-slate-200 shadow-sm";

interface Project {
  id:          string;
  name?:       string;
  status?:     string;
  progress?:   number;
  territorio?: string;
}

interface Solicitud {
  id:          string;
  territorio?: string;
  colegio?:    string;
  estatus?:    string;
  created_at?: string;
}

interface Ticket {
  id:          string;
  folio?:      string;
  territorio?: string;
  proyecto_id?: string;
}

interface Stats {
  total:       number;
  completed:   number;
  avgProgress: number;
}

async function loadJsPDF(): Promise<typeof import('jspdf').jsPDF> {
  const w = window as Window & { jspdf?: { jsPDF: typeof import('jspdf').jsPDF } };
  if (w.jspdf?.jsPDF) return w.jspdf.jsPDF;
  await new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src     = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
    script.onload  = () => resolve();
    script.onerror = () => reject(new Error('Error cargando jsPDF'));
    document.head.appendChild(script);
  });
  return w.jspdf!.jsPDF;
}

// ── Gráfica de barras por territorio (jsPDF nativo, sin canvas) ─────────────
function drawTerritoryBar(
  doc: InstanceType<typeof import('jspdf').jsPDF>,
  x: number, y: number, barW: number,
  active: number, completed: number,
  label: string,
): void {
  const total   = active + completed;
  const maxBarH = 20;

  // Barra activos (azul)
  const hActive = total > 0 ? Math.max(2, Math.round((active / total) * maxBarH)) : 0;
  // Barra completados (verde)
  const hComp   = total > 0 ? Math.max(2, Math.round((completed / total) * maxBarH)) : 0;

  const barW2 = Math.floor(barW * 0.35);
  const gap   = 3;
  const baseY = y + maxBarH;

  // Barra activos
  if (hActive > 0) {
    doc.setFillColor(59, 130, 246);
    doc.rect(x, baseY - hActive, barW2, hActive, 'F');
  }
  // Barra completados
  if (hComp > 0) {
    doc.setFillColor(34, 197, 94);
    doc.rect(x + barW2 + gap, baseY - hComp, barW2, hComp, 'F');
  }
  // Línea base
  doc.setDrawColor(200, 200, 200);
  doc.line(x - 2, baseY + 1, x + barW, baseY + 1);

  // Valores sobre barras
  doc.setFontSize(6.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 30, 30);
  if (hActive > 0)  doc.text(String(active),    x + barW2 / 2,         baseY - hActive - 1.5, { align: 'center' });
  if (hComp > 0)    doc.text(String(completed), x + barW2 + gap + barW2 / 2, baseY - hComp - 1.5,  { align: 'center' });

  // Etiqueta territorio
  doc.setFontSize(6.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(80, 80, 80);
  const lbl = label.length > 12 ? label.slice(0, 10) + '…' : label;
  doc.text(lbl, x + barW / 2, baseY + 5, { align: 'center' });
}

async function exportResumenPDF({
  stats, projects, checklists, solicitudes, tickets,
}: {
  stats:       Stats;
  projects:    Project[];
  checklists:  unknown[];
  solicitudes: Solicitud[];
  tickets:     Ticket[];
}): Promise<void> {
  const JsPDF = await loadJsPDF();
  const doc   = new JsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const now   = new Date().toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' });
  const W     = 210;
  let   y     = 20;

  const line = (text: string, size = 10, bold = false, color: [number, number, number] = [30, 30, 30]) => {
    doc.setFontSize(size);
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setTextColor(...color);
    doc.text(text, 20, y);
    y += size * 0.5 + 2;
  };

  const divider = () => {
    doc.setDrawColor(220, 220, 220);
    doc.line(20, y, W - 20, y);
    y += 6;
  };

  // ── Encabezado ─────────────────────────────────────────────────────────────
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, W, 28, 'F');
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(255, 255, 255);
  doc.text('Reporte General — Colegios Mano Amiga', 20, 13);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(180, 180, 200);
  doc.text(`Generado el ${now}`, 20, 22);

  try {
    const logoImg = await new Promise<string>((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width  = img.width;
        canvas.height = img.height;
        canvas.getContext('2d')!.drawImage(img, 0, 0);
        resolve(canvas.toDataURL('image/png'));
      };
      img.onerror = reject;
      img.src = '/logo.png';
    });
    doc.addImage(logoImg, 'PNG', W - 38, 2, 24, 24);
  } catch { /* continúa sin logo */ }

  y = 40;

  // ── Resumen ejecutivo ──────────────────────────────────────────────────────
  line('Resumen Ejecutivo', 13, true);
  y += 2;
  divider();

  // Solo proyectos activos (excluye completados y cancelados)
  const activeProjects = projects.filter(p => p.status !== 'completado' && p.status !== 'cancelado');
  const activeAvg = activeProjects.length > 0
    ? Math.round(activeProjects.reduce((acc, p) => acc + (p.progress || 0), 0) / activeProjects.length)
    : 0;

  line(`Proyectos totales:        ${stats.total}`,          10);
  line(`Proyectos activos:        ${activeProjects.length}`, 10);
  line(`Proyectos completados:    ${stats.completed}`,       10);
  line(`Avance promedio (activos):${activeAvg}%`,            10);
  line(`Inspecciones realizadas:  ${checklists.length}`,     10);
  line(`Solicitudes recibidas:    ${solicitudes.length}`,    10);
  line(`Tickets TCMM:             ${tickets.length}`,        10);
  y += 4;

  // ── Gráficas de barras por territorio ────────────────────────────────────
  if (y > 200) { doc.addPage(); y = 20; }
  line('Proyectos por Territorio', 13, true);
  y += 2;
  divider();

  // Leyenda global
  doc.setFillColor(59, 130, 246);
  doc.rect(20, y - 3, 5, 5, 'F');
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(50, 50, 50);
  doc.text('Activos', 27, y);
  doc.setFillColor(34, 197, 94);
  doc.rect(58, y - 3, 5, 5, 'F');
  doc.text('Completados', 65, y);
  y += 8;

  // Obtener territorios únicos
  const territorios = Array.from(
    new Set(projects.map(p => p.territorio || 'Sin territorio'))
  ).sort();

  const COLS  = 4;
  const barW  = (W - 40) / COLS;
  const rowH  = 38;
  let col     = 0;
  let rowY    = y;

  territorios.forEach(ter => {
    const tProj  = projects.filter(p => (p.territorio || 'Sin territorio') === ter);
    const active = tProj.filter(p => p.status !== 'completado' && p.status !== 'cancelado').length;
    const comp   = tProj.filter(p => p.status === 'completado').length;
    const bx     = 20 + col * barW;

    drawTerritoryBar(doc, bx, rowY, barW - 4, active, comp, ter);

    col++;
    if (col >= COLS) {
      col   = 0;
      rowY += rowH;
      if (rowY + rowH > 270) { doc.addPage(); rowY = 20; }
    }
  });

  y = rowY + (col > 0 ? rowH : 0) + 6;
  if (y > 250) { doc.addPage(); y = 20; }

  // ── Detalle de proyectos activos (sin completados/cancelados) ─────────────
  y += 4;
  line('Detalle de Proyectos Activos', 13, true);
  y += 2;
  divider();

  const pCols = { name: 20, status: 110, progress: 150, territory: 170 };
  doc.setFillColor(241, 245, 249);
  doc.rect(18, y - 4, W - 36, 8, 'F');
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(100, 116, 139);
  doc.text('Proyecto',   pCols.name,      y);
  doc.text('Estado',     pCols.status,    y);
  doc.text('Avance',     pCols.progress,  y);
  doc.text('Territorio', pCols.territory, y);
  y += 6;
  divider();

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(30, 30, 30);
  activeProjects.slice(0, 40).forEach((p, i) => {
    if (y > 270) { doc.addPage(); y = 20; }
    if (i % 2 === 0) { doc.setFillColor(248, 250, 252); doc.rect(18, y - 4, W - 36, 7, 'F'); }
    doc.setFontSize(8);
    const name = p.name && p.name.length > 45 ? p.name.slice(0, 42) + '…' : (p.name || '—');
    doc.text(name,                  pCols.name,      y);
    doc.text(p.status    || '—',    pCols.status,    y);
    doc.text(`${p.progress || 0}%`, pCols.progress,  y);
    doc.text(p.territorio || '—',   pCols.territory, y);
    y += 7;
  });
  if (activeProjects.length > 40) {
    y += 2;
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(`... y ${activeProjects.length - 40} proyectos más.`, 20, y);
    y += 6;
  }

  // ── Solicitudes vs Tickets por Territorio ─────────────────────────────────
  if (y > 230) { doc.addPage(); y = 20; }
  y += 4;
  line('Solicitudes vs Tickets por Territorio', 13, true);
  y += 2;
  divider();

  // Construir mapa territorio → { solicitudes, tickets }
  const terMap: Record<string, { solicitudes: number; tickets: number }> = {};
  const allTers = Array.from(new Set([
    ...solicitudes.map(s => s.territorio || 'Sin territorio'),
    ...tickets.map(t => t.territorio || 'Sin territorio'),
  ])).sort();

  allTers.forEach(ter => {
    terMap[ter] = {
      solicitudes: solicitudes.filter(s => (s.territorio || 'Sin territorio') === ter).length,
      tickets:     tickets.filter(t => (t.territorio || 'Sin territorio') === ter).length,
    };
  });

  const stCols = { territorio: 20, solicitudes: 110, tickets: 155, diferencia: 175 };
  doc.setFillColor(241, 245, 249);
  doc.rect(18, y - 4, W - 36, 8, 'F');
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(100, 116, 139);
  doc.text('Territorio',   stCols.territorio,   y);
  doc.text('Solicitudes',  stCols.solicitudes,  y);
  doc.text('Tickets',      stCols.tickets,      y);
  doc.text('Diferencia',   stCols.diferencia,   y);
  y += 6;
  divider();

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(30, 30, 30);
  allTers.forEach((ter, i) => {
    if (y > 270) { doc.addPage(); y = 20; }
    if (i % 2 === 0) { doc.setFillColor(248, 250, 252); doc.rect(18, y - 4, W - 36, 7, 'F'); }
    doc.setFontSize(8);
    const { solicitudes: s, tickets: t } = terMap[ter];
    const diff = s - t;
    const terLabel = ter.length > 45 ? ter.slice(0, 42) + '…' : ter;
    doc.text(terLabel,    stCols.territorio,  y);
    doc.text(String(s),   stCols.solicitudes, y);
    doc.text(String(t),   stCols.tickets,     y);
    // Color diferencia: rojo si hay más solicitudes que tickets (sin atender), verde si equilibrado
    if (diff > 0)  doc.setTextColor(185, 28, 28);
    else if (diff < 0) doc.setTextColor(21, 128, 61);
    else           doc.setTextColor(100, 116, 139);
    doc.text(diff > 0 ? `+${diff}` : String(diff), stCols.diferencia, y);
    doc.setTextColor(30, 30, 30);
    y += 7;
  });

  // Totales
  y += 2;
  const totSol = solicitudes.length;
  const totTck = tickets.length;
  const totDif = totSol - totTck;
  doc.setFillColor(15, 23, 42);
  doc.rect(18, y - 4, W - 36, 8, 'F');
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(255, 255, 255);
  doc.text('TOTAL',          stCols.territorio,  y);
  doc.text(String(totSol),   stCols.solicitudes, y);
  doc.text(String(totTck),   stCols.tickets,     y);
  doc.text(totDif > 0 ? `+${totDif}` : String(totDif), stCols.diferencia, y);
  y += 10;

  // Nota explicativa
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'italic');
  doc.setTextColor(100, 116, 139);
  doc.text('Diferencia = Solicitudes − Tickets. Valor positivo indica solicitudes pendientes de convertir en ticket TCMM.', 20, y);
  y += 8;

  // ── Pie de página ──────────────────────────────────────────────────────────
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(160, 160, 160);
    doc.text(`Sistema RCMA Cloud — Página ${i} de ${pages}`, 20, 290);
    doc.text('Documento confidencial', W - 20, 290, { align: 'right' });
  }

  doc.save(`reporte-mano-amiga-${Date.now()}.pdf`);
}

export default function Reports() {
  const { data: rawProjects   = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => db.Project.list('-created_at', 500),
  });
  const { data: rawChecklists = [] } = useQuery({
    queryKey: ['checklists'],
    queryFn: () => db.Checklist.list('-created_at', 500),
  });
  const { data: rawSolicitudes = [] } = useQuery({
    queryKey: ['solicitudes'],
    queryFn: async () => {
      const { data, error } = await supabase.from('solicitudes').select('*').order('created_at', { ascending: false }).limit(500);
      if (error) throw error;
      return data ?? [];
    },
  });
  const { data: rawTickets = [] } = useQuery({
    queryKey: ['tickets'],
    queryFn: async () => {
      const { data, error } = await supabase.from('tickets').select('*').order('created_at', { ascending: false }).limit(500);
      if (error) throw error;
      return data ?? [];
    },
  });

  const projects    = rawProjects    as unknown as Project[];
  const checklists  = rawChecklists  as unknown[];
  const solicitudes = rawSolicitudes as unknown as Solicitud[];
  const tickets     = rawTickets     as unknown as Ticket[];

  const stats = useMemo((): Stats => ({
    total:       projects.length,
    completed:   projects.filter(p => p.status === 'completado').length,
    avgProgress: projects.length > 0
      ? Math.round(projects.reduce((acc, p) => acc + (p.progress || 0), 0) / projects.length)
      : 0,
  }), [projects]);

  // Solo proyectos activos para KPIs en pantalla
  const activeProjects = useMemo(
    () => projects.filter(p => p.status !== 'completado' && p.status !== 'cancelado'),
    [projects],
  );

  // Solicitudes vs Tickets por territorio (para la tarjeta en pantalla)
  const terData = useMemo(() => {
    const allTers = Array.from(new Set([
      ...solicitudes.map(s => s.territorio || 'Sin territorio'),
      ...tickets.map(t => t.territorio || 'Sin territorio'),
    ])).sort();
    return allTers.map(ter => ({
      territorio:  ter,
      solicitudes: solicitudes.filter(s => (s.territorio || 'Sin territorio') === ter).length,
      tickets:     tickets.filter(t => (t.territorio || 'Sin territorio') === ter).length,
    }));
  }, [solicitudes, tickets]);

  const handleExportPDF = () => {
    exportResumenPDF({ stats, projects, checklists, solicitudes, tickets }).catch(err => {
      console.error('Error generando PDF:', err);
    });
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto p-4">
      <PageHeader
        title="Reportes y Estadísticas"
        subtitle="Análisis de avance del Proyecto Levantamiento y mantenimiento"
      />

      {/* KPIs */}
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
          <p className="text-xs text-slate-400 mt-1">{tickets.length} tickets TCMM vinculados</p>
        </div>
      </div>

      {/* Solicitudes vs Tickets por territorio */}
      {terData.length > 0 && (
        <div className={cardClass}>
          <h3 className="font-bold text-slate-900 mb-4 flex items-center gap-2">
            <PieChart className="w-4 h-4 text-blue-500" />
            Solicitudes vs Tickets por Territorio
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[10px] font-black uppercase tracking-widest text-slate-400 border-b border-slate-100">
                  <th className="text-left pb-2 pr-4">Territorio</th>
                  <th className="text-right pb-2 pr-4">Solicitudes</th>
                  <th className="text-right pb-2 pr-4">Tickets TCMM</th>
                  <th className="text-right pb-2">Diferencia</th>
                </tr>
              </thead>
              <tbody>
                {terData.map(({ territorio, solicitudes: s, tickets: t }) => {
                  const diff = s - t;
                  return (
                    <tr key={territorio} className="border-b border-slate-50 hover:bg-slate-50">
                      <td className="py-2 pr-4 text-slate-700 font-medium">{territorio}</td>
                      <td className="py-2 pr-4 text-right tabular-nums text-slate-600">{s}</td>
                      <td className="py-2 pr-4 text-right tabular-nums text-slate-600">{t}</td>
                      <td className={`py-2 text-right tabular-nums font-bold ${
                        diff > 0 ? 'text-red-600' : diff < 0 ? 'text-green-600' : 'text-slate-400'
                      }`}>
                        {diff > 0 ? `+${diff}` : diff}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-slate-900 text-white text-xs font-bold">
                  <td className="py-2 px-2 rounded-l-lg">TOTAL</td>
                  <td className="py-2 text-right tabular-nums pr-4">{solicitudes.length}</td>
                  <td className="py-2 text-right tabular-nums pr-4">{tickets.length}</td>
                  <td className={`py-2 text-right tabular-nums rounded-r-lg ${
                    solicitudes.length - tickets.length > 0 ? 'text-red-300' : 'text-green-300'
                  }`}>
                    {solicitudes.length - tickets.length > 0
                      ? `+${solicitudes.length - tickets.length}`
                      : solicitudes.length - tickets.length}
                  </td>
                </tr>
              </tfoot>
            </table>
            <p className="text-xs text-slate-400 mt-2">
              Diferencia positiva = solicitudes pendientes de convertir en ticket TCMM.
            </p>
          </div>
        </div>
      )}

      {/* Exportación */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className={cardClass}>
          <h3 className="font-bold text-slate-900 mb-4 flex items-center gap-2">
            <Download className="w-4 h-4 text-slate-400" />
            Exportar Datos Técnicos
          </h3>
          <p className="text-xs text-slate-500 mb-6 leading-relaxed">
            Genera archivos para auditorías de obra, revisión de estimaciones o reportes de mantenimiento preventivo.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button className={btnOutline} onClick={handleExportPDF}>
              <FileText className="w-4 h-4 text-red-600" /> Resumen General (.pdf)
            </button>
            <button className={btnOutline} disabled title="Próximamente">
              <FileSpreadsheet className="w-4 h-4 text-green-600" /> Resumen de Obras (.xlsx)
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
