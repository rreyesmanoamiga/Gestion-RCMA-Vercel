import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { db } from '@/lib/db';
import { Link } from 'react-router-dom';
import {
  DollarSign, TrendingUp, TrendingDown, Minus,
  ChevronRight, Filter, BarChart3
} from 'lucide-react';
import PageHeader from '@/components/shared/PageHeader';

interface Project {
  id: string; name?: string; status?: string; budget?: number;
  costo_real?: number | null; colegio?: string; territorio?: string;
  folio?: string; tipo_proyecto?: string;
}

const fmtMXN = (n: number) =>
  n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 });

const selectClass = "h-10 px-3 py-2 bg-white border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-slate-400 focus:outline-none text-slate-700";

export default function Presupuestos() {
  const [filtroTerritorio, setFiltroTerritorio] = useState('all');
  const [filtroEstado, setFiltroEstado]         = useState('all');

  const { data: raw = [], isLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: () => db.Project.list('-created_at', 500),
  });

  const projects = (raw as unknown as Project[]).filter(p => p.budget != null && p.budget > 0);

  const filtered = useMemo(() => projects.filter(p => {
    if (filtroTerritorio !== 'all' && p.territorio !== filtroTerritorio) return false;
    if (filtroEstado === 'con_real'  && !p.costo_real)  return false;
    if (filtroEstado === 'sin_real'  && p.costo_real)   return false;
    if (filtroEstado === 'sobrecosto' && (p.costo_real == null || p.costo_real <= (p.budget ?? 0))) return false;
    if (filtroEstado === 'ahorro'    && (p.costo_real == null || p.costo_real >= (p.budget ?? 0))) return false;
    return true;
  }), [projects, filtroTerritorio, filtroEstado]);

  const territorios = [...new Set(projects.map(p => p.territorio).filter(Boolean))] as string[];

  const resumen = useMemo(() => {
    const conReal = projects.filter(p => p.costo_real != null && p.costo_real > 0);
    const totalPresupuesto = projects.reduce((s, p) => s + (p.budget ?? 0), 0);
    const totalReal        = conReal.reduce((s, p) => s + (p.costo_real ?? 0), 0);
    const sobrecostos      = conReal.filter(p => (p.costo_real ?? 0) > (p.budget ?? 0));
    const ahorros          = conReal.filter(p => (p.costo_real ?? 0) < (p.budget ?? 0));
    return { totalPresupuesto, totalReal, conReal: conReal.length, sobrecostos: sobrecostos.length, ahorros: ahorros.length };
  }, [projects]);

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
          { label: 'Proyectos con presupuesto', value: projects.length,             color: 'bg-slate-900 text-white',                                  icon: <BarChart3 className="w-4 h-4" /> },
          { label: 'Con costo real',            value: resumen.conReal,             color: 'bg-blue-50 text-blue-700 border border-blue-200',           icon: <DollarSign className="w-4 h-4" /> },
          { label: 'Sobrecostos',               value: resumen.sobrecostos,         color: 'bg-red-50 text-red-700 border border-red-200',              icon: <TrendingUp className="w-4 h-4" /> },
          { label: 'Ahorros',                   value: resumen.ahorros,             color: 'bg-emerald-50 text-emerald-700 border border-emerald-200',  icon: <TrendingDown className="w-4 h-4" /> },
          { label: 'Sin costo real',            value: projects.length - resumen.conReal, color: 'bg-amber-50 text-amber-700 border border-amber-200', icon: <Minus className="w-4 h-4" /> },
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
            <p className="text-xs text-blue-400 mt-1">{projects.length} proyectos</p>
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
        <select className={selectClass} value={filtroTerritorio} onChange={e => setFiltroTerritorio(e.target.value)}>
          <option value="all">Todos los territorios</option>
          {territorios.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <select className={selectClass} value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)}>
          <option value="all">Todos</option>
          <option value="con_real">Con costo real</option>
          <option value="sin_real">Sin costo real</option>
          <option value="sobrecosto">Sobrecosto</option>
          <option value="ahorro">Ahorro</option>
        </select>
        <span className="text-sm text-slate-500">{filtered.length} proyecto{filtered.length !== 1 ? 's' : ''}</span>
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
              {filtered.map(p => {
                const tieneReal   = p.costo_real != null && p.costo_real > 0;
                const diff        = tieneReal ? p.costo_real! - p.budget! : null;
                const sobrecosto  = diff !== null && diff > 0;
                const ahorro      = diff !== null && diff < 0;
                const pct         = diff !== null && p.budget! > 0
                  ? Math.round((diff / p.budget!) * 100) : null;

                return (
                  <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-slate-800 truncate max-w-[200px]">{p.name}</p>
                      {p.folio && <p className="text-[10px] font-bold text-red-500">{p.folio}</p>}
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
    </div>
  );
}
