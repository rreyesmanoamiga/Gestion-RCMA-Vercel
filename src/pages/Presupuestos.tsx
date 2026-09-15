import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { db } from '@/lib/db';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/lib/AuthContext';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';
import {
  DollarSign, TrendingUp, TrendingDown, Minus,
  ChevronRight, Filter, BarChart3, ChevronDown, FileBarChart, FileSpreadsheet, Loader2,
} from 'lucide-react';
import PageHeader from '@/components/shared/PageHeader';
import { generarPDFPresupuesto, generarExcelPresupuesto, type ProyectoReporte } from '@/lib/reportesPresupuesto';

const PAGE_SIZE = 20;

interface Project {
  id: string; name?: string; status?: string; budget?: number;
  costo_real?: number | null; colegio?: string; territorio?: string;
  folio?: string; tipo_proyecto?: string; created_at?: string;
}

const fmtMXN = (n: number) =>
  n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2, maximumFractionDigits: 2 });

const selectClass = "h-10 px-3 py-2 bg-white border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-slate-400 focus:outline-none text-slate-700";

export default function Presupuestos() {
  const { user } = useAuth();
  const [filtroTerritorio, setFiltroTerritorio] = useState('all');
  const [filtroColegio, setFiltroColegio]       = useState('all');
  const [filtroAño, setFiltroAño]               = useState('all');
  const [filtroEstado, setFiltroEstado]         = useState('all');
  const [visibleCount, setVisibleCount]         = useState(PAGE_SIZE);
  const [alcanceReporte, setAlcanceReporte]     = useState<'global' | 'colegio'>('global');
  const [periodoReporte, setPeriodoReporte]     = useState<'todos' | 'año'>('todos');
  const [generando, setGenerando]               = useState<'' | 'pdf' | 'excel'>('');

  const { data: raw = [], isLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: () => db.Project.list('-created_at', 500),
  });

  const projects = (raw as unknown as Project[]).filter(p => p.budget != null && p.budget > 0 && p.status !== 'cancelado');

  // Mapa proyecto_id → folio del ticket vinculado (para proyectos TMAS sin folio en project.folio)
  const { data: rawTickets = [] } = useQuery({
    queryKey: ['tickets-vinculados-presupuesto'],
    queryFn: async () => {
      const { data } = await supabase.from('tickets').select('id, folio, proyecto_id').not('proyecto_id', 'is', null);
      return data ?? [];
    },
  });
  const ticketByProject = useMemo(() => {
    const map: Record<string, string> = {};
    (rawTickets as any[]).forEach((t: any) => { if (t.proyecto_id && t.folio) map[t.proyecto_id] = t.folio; });
    return map;
  }, [rawTickets]);

  const getAño = (p: Project) => p.created_at ? new Date(p.created_at).getFullYear() : null;

  // Alcance para los KPIs: territorio + colegio + año (sin filtro de estado,
  // para que el resumen siempre refleje el universo completo de ese alcance).
  const projectsEnAlcance = useMemo(() => projects.filter(p => {
    if (filtroTerritorio !== 'all' && p.territorio !== filtroTerritorio) return false;
    if (filtroColegio !== 'all' && p.colegio !== filtroColegio) return false;
    if (filtroAño !== 'all' && String(getAño(p)) !== filtroAño) return false;
    return true;
  }), [projects, filtroTerritorio, filtroColegio, filtroAño]);

  const filtered = useMemo(() => projectsEnAlcance.filter(p => {
    if (filtroEstado === 'con_real'  && !p.costo_real)  return false;
    if (filtroEstado === 'sin_real'  && p.costo_real)   return false;
    if (filtroEstado === 'sobrecosto' && (p.costo_real == null || p.costo_real <= (p.budget ?? 0))) return false;
    if (filtroEstado === 'ahorro'    && (p.costo_real == null || p.costo_real >= (p.budget ?? 0))) return false;
    return true;
  }), [projectsEnAlcance, filtroEstado]);

  const visible   = useMemo(() => filtered.slice(0, visibleCount), [filtered, visibleCount]);
  const hasMore   = visibleCount < filtered.length;
  const remaining = filtered.length - visibleCount;

  const territorios = [...new Set(projects.map(p => p.territorio).filter(Boolean))] as string[];
  const colegios = [...new Set(projects.map(p => p.colegio).filter(Boolean))].sort() as string[];
  const años = [...new Set(projects.map(getAño).filter((a): a is number => a !== null))].sort((a, b) => b - a);

  const resumen = useMemo(() => {
    const conReal = projectsEnAlcance.filter(p => p.costo_real != null && p.costo_real > 0);
    const totalPresupuesto = projectsEnAlcance.reduce((s, p) => s + (p.budget ?? 0), 0);
    const totalReal        = conReal.reduce((s, p) => s + (p.costo_real ?? 0), 0);
    const sobrecostos      = conReal.filter(p => (p.costo_real ?? 0) > (p.budget ?? 0));
    const ahorros          = conReal.filter(p => (p.costo_real ?? 0) < (p.budget ?? 0));
    return { totalPresupuesto, totalReal, conReal: conReal.length, sobrecostos: sobrecostos.length, ahorros: ahorros.length };
  }, [projectsEnAlcance]);

  const alcanceLabel = useMemo(() => {
    const parte1 = alcanceReporte === 'colegio' && filtroColegio !== 'all' ? filtroColegio : 'Todos los colegios';
    const parte2 = periodoReporte === 'año' && filtroAño !== 'all' ? `año ${filtroAño}` : 'todos los años';
    return `${parte1} — ${parte2}`;
  }, [alcanceReporte, periodoReporte, filtroColegio, filtroAño]);

  const proyectosParaReporte = useMemo(() => {
    return projects.filter(p => {
      if (alcanceReporte === 'colegio' && filtroColegio !== 'all' && p.colegio !== filtroColegio) return false;
      if (periodoReporte === 'año' && filtroAño !== 'all' && String(getAño(p)) !== filtroAño) return false;
      return true;
    });
  }, [projects, alcanceReporte, periodoReporte, filtroColegio, filtroAño]);

  const elaboradoPor = user?.user_metadata?.nombre || user?.email || 'Usuario';

  const generarReportePDF = async () => {
    if (proyectosParaReporte.length === 0) { toast.error('No hay proyectos para este alcance'); return; }
    setGenerando('pdf');
    try {
      await generarPDFPresupuesto({
        proyectos: proyectosParaReporte.map(p => ({ ...p, año: getAño(p) ?? 0 })) as ProyectoReporte[],
        elaboradoPor, alcanceLabel,
      });
      toast.success('PDF generado');
    } catch (err: any) {
      toast.error(`No se pudo generar el PDF: ${err?.message ?? 'error desconocido'}`);
    } finally { setGenerando(''); }
  };

  const generarReporteExcel = async () => {
    if (proyectosParaReporte.length === 0) { toast.error('No hay proyectos para este alcance'); return; }
    setGenerando('excel');
    try {
      await generarExcelPresupuesto({
        proyectos: proyectosParaReporte.map(p => ({ ...p, año: getAño(p) ?? 0 })) as ProyectoReporte[],
        alcanceLabel,
      });
      toast.success('Excel generado');
    } catch (err: any) {
      toast.error(`No se pudo generar el Excel: ${err?.message ?? 'error desconocido'}`);
    } finally { setGenerando(''); }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Presupuesto vs Real"
        subtitle="Comparativa de presupuesto inicial vs costo real por proyecto"
      />

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {[
          { label: 'Proyectos con presupuesto', value: projectsEnAlcance.length,             color: 'bg-slate-900 text-white',                                  icon: <BarChart3 className="w-4 h-4" /> },
          { label: 'Con costo real',            value: resumen.conReal,             color: 'bg-blue-50 text-blue-700 border border-blue-200',           icon: <DollarSign className="w-4 h-4" /> },
          { label: 'Sobrecostos',               value: resumen.sobrecostos,         color: 'bg-red-50 text-red-700 border border-red-200',              icon: <TrendingUp className="w-4 h-4" /> },
          { label: 'Ahorros',                   value: resumen.ahorros,             color: 'bg-emerald-50 text-emerald-700 border border-emerald-200',  icon: <TrendingDown className="w-4 h-4" /> },
          { label: 'Sin costo real',            value: projectsEnAlcance.length - resumen.conReal, color: 'bg-amber-50 text-amber-700 border border-amber-200', icon: <Minus className="w-4 h-4" /> },
        ].map(k => (
          <div key={k.label} className={`rounded-xl p-4 ${k.color}`}>
            <div className="flex items-center gap-2 mb-1 opacity-70">{k.icon}
              <span className="text-xs font-bold uppercase tracking-wide">{k.label}</span>
            </div>
            <p className="text-3xl font-black">{k.value}</p>
          </div>
        ))}
      </div>

      {/* Resumen financiero total */}
      {resumen.conReal > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-5 text-center">
            <p className="text-xs font-bold text-blue-500 uppercase mb-1">Total Presupuestado</p>
            <p className="text-2xl font-black text-blue-700">{fmtMXN(resumen.totalPresupuesto)}</p>
            <p className="text-xs text-blue-400 mt-1">{projectsEnAlcance.length} proyectos</p>
          </div>
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 text-center">
            <p className="text-xs font-bold text-slate-500 uppercase mb-1">Total Costo Real</p>
            <p className="text-2xl font-black text-slate-900">{fmtMXN(resumen.totalReal)}</p>
            <p className="text-xs text-slate-400 mt-1">{resumen.conReal} proyectos cerrados</p>
          </div>
          <div className={`border rounded-xl p-5 text-center ${
            resumen.totalReal > resumen.totalPresupuesto ? 'bg-red-50 border-red-200' : 'bg-emerald-50 border-emerald-200'
          }`}>
            <p className={`text-xs font-bold uppercase mb-1 ${resumen.totalReal > resumen.totalPresupuesto ? 'text-red-500' : 'text-emerald-500'}`}>
              {resumen.totalReal > resumen.totalPresupuesto ? 'Sobrecosto Total' : 'Ahorro Total'}
            </p>
            <p className={`text-2xl font-black ${resumen.totalReal > resumen.totalPresupuesto ? 'text-red-700' : 'text-emerald-700'}`}>
              {fmtMXN(Math.abs(resumen.totalReal - resumen.totalPresupuesto))}
            </p>
            <p className={`text-xs mt-1 ${resumen.totalReal > resumen.totalPresupuesto ? 'text-red-400' : 'text-emerald-400'}`}>
              {Math.round(Math.abs((resumen.totalReal - resumen.totalPresupuesto) / resumen.totalPresupuesto) * 100)}% {resumen.totalReal > resumen.totalPresupuesto ? 'sobre' : 'bajo'} presupuesto
            </p>
          </div>
        </div>
      )}

      {/* Filtros */}
      <div className="flex gap-3 flex-wrap items-center">
        <Filter className="w-4 h-4 text-slate-400" />
        <select className={selectClass} value={filtroTerritorio} onChange={e => { setFiltroTerritorio(e.target.value); setFiltroColegio('all'); setVisibleCount(PAGE_SIZE); }}>
          <option value="all">Todos los territorios</option>
          {territorios.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <select className={selectClass} value={filtroColegio} onChange={e => { setFiltroColegio(e.target.value); setVisibleCount(PAGE_SIZE); if (e.target.value === 'all') setAlcanceReporte('global'); }}>
          <option value="all">Todos los colegios</option>
          {colegios.filter(c => filtroTerritorio === 'all' || projects.find(p => p.colegio === c)?.territorio === filtroTerritorio).map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select className={selectClass} value={filtroAño} onChange={e => { setFiltroAño(e.target.value); setVisibleCount(PAGE_SIZE); if (e.target.value === 'all') setPeriodoReporte('todos'); }}>
          <option value="all">Todos los años</option>
          {años.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        <select className={selectClass} value={filtroEstado} onChange={e => { setFiltroEstado(e.target.value); setVisibleCount(PAGE_SIZE); }}>
          <option value="all">Todos</option>
          <option value="con_real">Con costo real</option>
          <option value="sin_real">Sin costo real</option>
          <option value="sobrecosto">Sobrecosto</option>
          <option value="ahorro">Ahorro</option>
        </select>
        <span className="text-sm text-slate-500">{filtered.length} proyecto{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Generador de reportes */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-3">Generar reporte</p>
        <div className="flex flex-wrap gap-4 items-center">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-500">Alcance:</span>
            <select className={selectClass} value={alcanceReporte} onChange={e => setAlcanceReporte(e.target.value as 'global' | 'colegio')}>
              <option value="global">Global (todos los colegios)</option>
              <option value="colegio" disabled={filtroColegio === 'all'}>
                Solo {filtroColegio !== 'all' ? filtroColegio : 'el colegio filtrado arriba'}
              </option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-500">Periodo:</span>
            <select className={selectClass} value={periodoReporte} onChange={e => setPeriodoReporte(e.target.value as 'todos' | 'año')}>
              <option value="todos">Todos los años</option>
              <option value="año" disabled={filtroAño === 'all'}>
                Solo {filtroAño !== 'all' ? filtroAño : 'el año filtrado arriba'}
              </option>
            </select>
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <button onClick={generarReportePDF} disabled={generando !== ''}
              className="inline-flex items-center gap-2 px-4 py-2 bg-[#00295A] text-white rounded-lg text-sm font-bold hover:bg-[#00295A]/90 disabled:opacity-50 transition-colors">
              {generando === 'pdf' ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileBarChart className="w-4 h-4" />} PDF
            </button>
            <button onClick={generarReporteExcel} disabled={generando !== ''}
              className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-bold hover:bg-emerald-700 disabled:opacity-50 transition-colors">
              {generando === 'excel' ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSpreadsheet className="w-4 h-4" />} Excel
            </button>
          </div>
        </div>
        <p className="text-[11px] text-slate-400 mt-2">{alcanceLabel} · {proyectosParaReporte.length} proyecto{proyectosParaReporte.length !== 1 ? 's' : ''}</p>
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                {['Proyecto', 'Colegio', 'Pres. Inicial', 'Costo Real', 'Diferencia', 'Estado', ''].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filtered.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-12 text-center text-slate-400 text-sm italic">
                  No hay proyectos con presupuesto registrado.
                </td></tr>
              )}
              {visible.map(p => {
                const tieneReal   = p.costo_real != null && p.costo_real > 0;
                const diff        = tieneReal ? p.costo_real! - p.budget! : null;
                const sobrecosto  = diff !== null && diff > 0;
                const ahorro      = diff !== null && diff < 0;
                const pct         = diff !== null && p.budget! > 0
                  ? Math.round((diff / p.budget!) * 100) : null;

                return (
                  <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-slate-800 truncate max-w-[280px]">{p.name}</p>
                      {(p.folio || ticketByProject[p.id]) && <p className="text-[10px] font-bold text-red-500">{p.folio || ticketByProject[p.id]}</p>}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{p.colegio ?? '—'}</td>
                    <td className="px-4 py-3 font-bold text-blue-600">{fmtMXN(p.budget!)}</td>
                    <td className="px-4 py-3">
                      {tieneReal
                        ? <span className="font-bold text-slate-900">{fmtMXN(p.costo_real!)}</span>
                        : <span className="text-slate-400 italic text-xs">Sin registrar</span>}
                    </td>
                    <td className="px-4 py-3">
                      {diff !== null ? (
                        <div className="flex items-center gap-1">
                          {sobrecosto ? <TrendingUp className="w-3.5 h-3.5 text-red-500" /> :
                           ahorro     ? <TrendingDown className="w-3.5 h-3.5 text-emerald-500" /> :
                                        <Minus className="w-3.5 h-3.5 text-slate-400" />}
                          <span className={`font-bold text-xs ${sobrecosto ? 'text-red-600' : ahorro ? 'text-emerald-600' : 'text-slate-500'}`}>
                            {sobrecosto ? '+' : ''}{fmtMXN(diff)}
                          </span>
                          {pct !== null && (
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${sobrecosto ? 'bg-red-100 text-red-600' : 'bg-emerald-100 text-emerald-600'}`}>
                              {sobrecosto ? '+' : ''}{pct}%
                            </span>
                          )}
                        </div>
                      ) : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      {!tieneReal ? (
                        <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-amber-100 text-amber-700">Pendiente</span>
                      ) : sobrecosto ? (
                        <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-red-100 text-red-700">Sobrecosto</span>
                      ) : ahorro ? (
                        <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-emerald-100 text-emerald-700">Ahorro</span>
                      ) : (
                        <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-slate-100 text-slate-600">Exacto</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Link to={`/proyectos/${p.id}`}
                        className="text-slate-400 hover:text-slate-700 transition-colors">
                        <ChevronRight className="w-4 h-4" />
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {hasMore && (
        <div className="flex flex-col items-center gap-2">
          <button
            onClick={() => setVisibleCount(v => v + PAGE_SIZE)}
            className="flex items-center gap-2 px-5 py-2.5 bg-white border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 hover:border-slate-400 transition-colors shadow-sm"
          >
            <ChevronDown className="w-4 h-4" />
            Cargar más ({remaining} restante{remaining !== 1 ? 's' : ''})
          </button>
          <p className="text-xs text-slate-400">
            Mostrando {visible.length} de {filtered.length} proyectos
          </p>
        </div>
      )}
    </div>
  );
}
