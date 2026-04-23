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
} from 'lucide-react';
import PageHeader from '@/components/shared/PageHeader';

// Fuera del componente — se definen una sola vez
const btnOutline = "flex items-center gap-2 px-4 py-2.5 border border-slate-300 rounded-lg text-sm font-bold text-slate-700 hover:bg-slate-50 transition-all shadow-sm disabled:opacity-40 disabled:cursor-not-allowed";
const cardClass  = "bg-white p-6 rounded-xl border border-slate-200 shadow-sm";

interface Project {
  id:         string;
  name?:      string;
  status?:    string;
  progress?:  number;
  territorio?: string;
}

interface Stats {
  total:       number;
  completed:   number;
  avgProgress: number;
}

// Carga jsPDF desde CDN solo cuando se necesita
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

// Genera y descarga el reporte general en PDF
async function exportResumenPDF({
  stats,
  projects,
  checklists,
}: {
  stats:      Stats;
  projects:   Project[];
  checklists: unknown[];
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

  // Logo en encabezado del PDF
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
  } catch {
    // Si falla la carga del logo, continúa sin él
  }

  y = 40;

  // KPIs
  line('Resumen Ejecutivo', 13, true);
  y += 2;
  divider();
  line(`Proyectos totales:       ${stats.total}`,        10);
  line(`Proyectos completados:   ${stats.completed}`,    10);
  line(`Avance promedio:         ${stats.avgProgress}%`, 10);
  line(`Inspecciones realizadas: ${checklists.length}`,  10);
  y += 4;

  // Tabla de proyectos
  line('Detalle de Proyectos', 13, true);
  y += 2;
  divider();

  const cols = { name: 20, status: 110, progress: 150, territory: 170 };

  doc.setFillColor(241, 245, 249);
  doc.rect(18, y - 4, W - 36, 8, 'F');
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(100, 116, 139);
  doc.text('Proyecto',   cols.name,     y);
  doc.text('Estado',     cols.status,   y);
  doc.text('Avance',     cols.progress, y);
  doc.text('Territorio', cols.territory, y);
  y += 6;
  divider();

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(30, 30, 30);
  projects.slice(0, 40).forEach((p, i) => {
    if (y > 270) { doc.addPage(); y = 20; }
    if (i % 2 === 0) {
      doc.setFillColor(248, 250, 252);
      doc.rect(18, y - 4, W - 36, 7, 'F');
    }
    doc.setFontSize(8);
    const name = p.name && p.name.length > 45 ? p.name.slice(0, 42) + '…' : (p.name || '—');
    doc.text(name,                       cols.name,     y);
    doc.text(p.status     || '—',        cols.status,   y);
    doc.text(`${p.progress || 0}%`,      cols.progress, y);
    doc.text(p.territorio || '—',        cols.territory, y);
    y += 7;
  });

  if (projects.length > 40) {
    y += 4;
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(`... y ${projects.length - 40} proyectos más. Consulta el sistema para el listado completo.`, 20, y);
  }

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

  const projects   = rawProjects   as unknown as Project[];
  const checklists = rawChecklists as unknown[];

  const stats = useMemo((): Stats => ({
    total:       projects.length,
    completed:   projects.filter(p => p.status === 'completado').length,
    avgProgress: projects.length > 0
      ? Math.round(projects.reduce((acc, p) => acc + (p.progress || 0), 0) / projects.length)
      : 0,
  }), [projects]);

  const handleExportPDF = () => {
    exportResumenPDF({ stats, projects, checklists }).catch(err => {
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
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Inspecciones Realizadas</p>
          <div className="flex items-center justify-between">
            <h3 className="text-3xl font-black text-slate-900">{checklists.length}</h3>
            <FileText className="w-8 h-8 text-green-50" />
          </div>
        </div>
      </div>

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
            <img
              src="/logo.png"
              alt="Mano Amiga"
              className="h-14 w-auto object-contain mb-4"
            />
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
