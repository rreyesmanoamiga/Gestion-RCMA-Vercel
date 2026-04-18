import React from 'react';
import { db } from '@/lib/db';
import { useQuery } from '@tanstack/react-query';
import { 
  BarChart3, 
  Download, 
  FileSpreadsheet, 
  FileText, 
  PieChart, 
  Filter,
  TrendingUp
} from 'lucide-react';
import PageHeader from '@/components/shared/PageHeader';

export default function Reports() {
  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => db.Project.list('-created_at', 100),
  });

  const { data: checklists = [] } = useQuery({
    queryKey: ['checklists'],
    queryFn: () => db.ChecklistRecord.list('-created_at', 100),
  });

  // Cálculos básicos para el tablero
  const totalProjects = projects.length;
  const completedProjects = projects.filter(p => p.status === 'completado').length;
  const avgProgress = totalProjects > 0 
    ? Math.round(projects.reduce((acc, p) => acc + (p.progress || 0), 0) / totalProjects) 
    : 0;

  const btnOutline = "flex items-center gap-2 px-4 py-2.5 border border-slate-300 rounded-lg text-sm font-bold text-slate-700 hover:bg-slate-50 transition-all shadow-sm";
  const cardClass = "bg-white p-6 rounded-xl border border-slate-200 shadow-sm";

  return (
    <div className="space-y-6 max-w-7xl mx-auto p-4">
      <PageHeader 
        title="Reportes y Estadísticas" 
        subtitle="Análisis de avance del Proyecto Levantamiento y mantenimiento"
      />

      {/* Grid de KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className={`${cardClass} border-l-4 border-l-slate-900`}>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Proyectos Totales</p>
          <div className="flex items-center justify-between">
            <h3 className="text-3xl font-black text-slate-900">{totalProjects}</h3>
            <BarChart3 className="w-8 h-8 text-slate-100" />
          </div>
        </div>
        <div className={`${cardClass} border-l-4 border-l-blue-600`}>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Avance General</p>
          <div className="flex items-center justify-between">
            <h3 className="text-3xl font-black text-slate-900">{avgProgress}%</h3>
            <TrendingUp className="w-8 h-8 text-blue-50" />
          </div>
        </div>
        <div className={`${cardClass} border-l-4 border-l-green-500`}>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Checklists Realizados</p>
          <div className="flex items-center justify-between">
            <h3 className="text-3xl font-black text-slate-900">{checklists.length}</h3>
            <FileText className="w-8 h-8 text-green-50" />
          </div>
        </div>
      </div>

      {/* Secciones de Exportación */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className={cardClass}>
          <h3 className="font-bold text-slate-900 mb-4 flex items-center gap-2">
            <Download className="w-4 h-4 text-slate-400" /> 
            Exportar Datos Técnicos
          </h3>
          <p className="text-xs text-slate-500 mb-6 leading-relaxed">
            Genera archivos compatibles con Excel para auditorías de obra, revisión de estimaciones o reportes de mantenimiento preventivo.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button className={btnOutline}>
              <FileSpreadsheet className="w-4 h-4 text-green-600" /> Resumen de Obras (.xlsx)
            </button>
            <button className={btnOutline}>
              <FileText className="w-4 h-4 text-red-600" /> Log de Mantenimiento (.pdf)
            </button>
            <button className={btnOutline}>
              <PieChart className="w-4 h-4 text-blue-600" /> Estatus por Colegio
            </button>
            <button className={btnOutline}>
              <Filter className="w-4 h-4 text-slate-600" /> Reporte de Incidencias
            </button>
          </div>
        </div>

        <div className={`${cardClass} bg-slate-900 text-white border-none relative overflow-hidden flex flex-col justify-center`}>
          <div className="relative z-10">
            <h3 className="text-xl font-black mb-2 italic">Sistema RCMA Cloud</h3>
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