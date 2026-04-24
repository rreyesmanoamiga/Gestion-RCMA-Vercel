import React, { useMemo } from 'react';
import { db } from '@/lib/db';
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

interface Pendiente {
  id:              string;
  territorio?:     string;
  colegio?:        string;
  nombre_proyecto?: string;
  estatus?:        string;
  prioridad?:      string;
  asignacion?:     string;
  notas?:          string;
  fecha_actualizacion?: string;
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

async function exportResumenPDF({
  stats, projects, checklists, pendientes,
}: {
  stats:       Stats;
  projects:    Project[];
  checklists:  unknown[];
  pendientes:  Pendiente[];
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

  // Encabezado
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
  line(`Proyectos totales:       ${stats.total}`,        10);
  line(`Proyectos completados:   ${stats.completed}`,    10);
  line(`Avance promedio:         ${stats.avgProgress}%`, 10);
  line(`Inspecciones realizadas: ${checklists.length}`,  10);
  line(`Pendientes totales:      ${pendientes.length}`,  10);

  // Pendientes por estatus
  const pendByEstatus: Record<string, number> = {};
  pendientes.forEach(p => {
    const k = p.estatus || 'sin estatus';
    pendByEstatus[k] = (pendByEstatus[k] || 0) + 1;
  });
  Object.entries(pendByEstatus).forEach(([est, cnt]) => {
    line(`  • ${est}: ${cnt}`, 9, false, [80, 80, 80]);
  });
  y += 4;

  // ── Tabla de proyectos ────────────────────────────────────────────────────
  line('Detalle de Proyectos', 13, true);
  y += 2;
  divider();

  const pCols = { name: 20, status: 110, progress: 150, territory: 170 };
  doc.setFillColor(241, 245, 249);
  doc.rect(18, y - 4, W - 36, 8, 'F');
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(100, 116, 139);
  doc.text('Proyecto',   pCols.name,     y);
  doc.text('Estado',     pCols.status,   y);
  doc.text('Avance',     pCols.progress, y);
  doc.text('Territorio', pCols.territory, y);
  y += 6;
  divider();

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(30, 30, 30);
  projects.slice(0, 30).forEach((p, i) => {
    if (y > 270) { doc.addPage(); y = 20; }
    if (i % 2 === 0) { doc.setFillColor(248, 250, 252); doc.rect(18, y - 4, W - 36, 7, 'F'); }
    doc.setFontSize(8);
    const name = p.name && p.name.length > 45 ? p.name.slice(0, 42) + '…' : (p.name || '—');
    doc.text(name,                  pCols.name,     y);
    doc.text(p.status    || '—',    pCols.status,   y);
    doc.text(`${p.progress || 0}%`, pCols.progress, y);
    doc.text(p.territorio || '—',   pCols.territory, y);
    y += 7;
  });
  if (projects.length > 30) {
    y += 2;
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(`... y ${projects.length - 30} proyectos más.`, 20, y);
    y += 6;
  }

  // ── Tabla de pendientes ───────────────────────────────────────────────────
  if (y > 230) { doc.addPage(); y = 20; }
  y += 4;
  line('Pendientes', 13, true);
  y += 2;
  divider();

  const pendCols = { colegio: 20, proyecto: 55, estatus: 130, prioridad: 165 };
  doc.setFillColor(241, 245, 249);
  doc.rect(18, y - 4, W - 36, 8, 'F');
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(100, 116, 139);
  doc.text('Colegio',   pendCols.colegio,   y);
  doc.text('Proyecto',  pendCols.proyecto,  y);
  doc.text('Estatus',   pendCols.estatus,   y);
  doc.text('Prioridad', pendCols.prioridad, y);
  y += 6;
  divider();

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(30, 30, 30);
  pendientes.slice(0, 40).forEach((p, i) => {
    if (y > 270) { doc.addPage(); y = 20; }
    if (i % 2 === 0) { doc.setFillColor(248, 250, 252); doc.rect(18, y - 4, W - 36, 7, 'F'); }
    doc.setFontSize(7.5);
    const colegio  = (p.colegio || '—').slice(0, 20);
    const proyecto = (p.nombre_proyecto || '—').slice(0, 38);
    doc.text(colegio,            pendCols.colegio,   y);
    doc.text(proyecto,           pendCols.proyecto,  y);
    doc.text(p.estatus  || '—',  pendCols.estatus,   y);
    doc.text(p.prioridad || '—', pendCols.prioridad, y);
    y += 7;
  });
  if (pendientes.length > 40) {
    y += 2;
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(`... y ${pendientes.length - 40} pendientes más.`, 20, y);
  }

  // Pie de página
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
  const { data: rawPendientes = [] } = useQuery({
    queryKey: ['pendientes'],
    queryFn: () => db.Pendiente.list('-fecha_actualizacion', 500),
  });

  const projects   = rawProjects   as unknown as Project[];
  const checklists = rawChecklists as unknown[];
  const pendientes = rawPendientes as unknown as Pendiente[];

  const stats = useMemo((): Stats => ({
    total:       projects.length,
    completed:   projects.filter(p => p.status === 'completado').length,
    avgProgress: projects.length > 0
      ? Math.round(projects.reduce((acc, p) => acc + (p.progress || 0), 0) / projects.length)
      : 0,
  }), [projects]);

  // Stats de pendientes
  const pendStats = useMemo(() => ({
    total:      pendientes.length,
    pendiente:  pendientes.filter(p => p.estatus === 'pendiente').length,
    enProgreso: pendientes.filter(p => p.estatus === 'en_progreso').length,
    completado: pendientes.filter(p => p.estatus === 'completado').length,
    pausado:    pendientes.filter(p => p.estatus === 'pausado').length,
  }), [pendientes]);

  const handleExportPDF = () => {
    exportResumenPDF({ stats, projects, checklists, pendientes }).catch(err => {
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
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Proyectos Totales</p>
          <div className="flex items-center justify-between">
            <h3 className="text-3xl font-black text-slate-900">{stats.total}</h3>
            <BarChart3 className="w-8 h-8 text-slate-100" />
          </div>
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
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Pendientes</p>
          <div className="flex items-center justify-between">
            <h3 className="text-3xl font-black text-slate-900">{pendStats.total}</h3>
            <ClockAlert className="w-8 h-8 text-amber-100" />
          </div>
        </div>
      </div>

      {/* Resumen de pendientes por estatus */}
      {pendStats.total > 0 && (
        <div className={cardClass}>
          <h3 className="font-bold text-slate-900 mb-4 flex items-center gap-2">
            <ClockAlert className="w-4 h-4 text-amber-500" />
            Pendientes por Estatus
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: 'Pendiente',   value: pendStats.pendiente,  color: 'bg-amber-50  text-amber-700  border-amber-200'  },
              { label: 'En Progreso', value: pendStats.enProgreso, color: 'bg-blue-50   text-blue-700   border-blue-200'   },
              { label: 'Completado',  value: pendStats.completado, color: 'bg-green-50  text-green-700  border-green-200'  },
              { label: 'Pausado',     value: pendStats.pausado,    color: 'bg-slate-50  text-slate-700  border-slate-200'  },
            ].map(({ label, value, color }) => (
              <div key={label} className={`p-4 rounded-xl border text-center ${color}`}>
                <p className="text-2xl font-black">{value}</p>
                <p className="text-xs font-bold uppercase tracking-wide mt-1">{label}</p>
              </div>
            ))}
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
