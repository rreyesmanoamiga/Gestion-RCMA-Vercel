import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { Link } from 'react-router-dom';
import { ListTodo, ChevronDown } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import PageHeader from '@/components/shared/PageHeader';
import StatusBadge from '@/components/shared/StatusBadge';
import { usePermissions } from '@/hooks/usePermissions';
import { useScope } from '@/hooks/useScope';
import AccesoRestringido from '@/components/shared/AccesoRestringido';
import { useDirectorio } from '@/lib/directorio';

const PAGE_SIZE = 20;
const selectClass = "h-10 px-3 py-2 bg-white border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-slate-400 focus:outline-none text-slate-700";

interface TramiteCN {
  id: string;
  folio?: string;
  colegio?: string;
  territorio?: string;
  concepto_nombre?: string;
  especificacion?: string;
  nombre_tramite?: string;
  estatus?: string;
  avance?: number;
  presupuesto?: number | null;
  costo_real?: number | null;
  responsable?: string;
  fecha_compromiso?: string;
  created_at?: string;
}

const fmx = (n?: number | null) =>
  n != null ? Number(n).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' }) : '—';

export default function TramitesCN() {
  const { isAdmin, can } = usePermissions();
  const { filtrarPorAlcance } = useScope();
  const { data: directorioRows = [] } = useDirectorio();
  const puedeVer = isAdmin || can('ver_tramites_cn');

  const [filterEstatus, setFilterEstatus]     = useState('all');
  const [filterTerritorio, setFilterTerritorio] = useState('all');
  const [filterColegio, setFilterColegio]     = useState('all');
  const [visibleCount, setVisibleCount]       = useState(PAGE_SIZE);

  const { data: rawTramites = [], isLoading } = useQuery({
    queryKey: ['compliance_tramites_cn'],
    queryFn: async () => {
      const { data, error } = await supabase.from('compliance_tramites_cn')
        .select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as TramiteCN[];
    },
    enabled: puedeVer,
  });

  const tramites = useMemo(
    () => filtrarPorAlcance(rawTramites, t => t.territorio, t => t.colegio),
    [rawTramites, filtrarPorAlcance]
  );

  const colegiosPorTerritorio = useMemo(() =>
    filterTerritorio !== 'all' ? directorioRows.filter(c => c.territorio === filterTerritorio) : directorioRows,
    [directorioRows, filterTerritorio]
  );

  const filtered = useMemo(() =>
    tramites.filter(t => {
      if (filterEstatus   !== 'all' && t.estatus    !== filterEstatus)   return false;
      if (filterTerritorio !== 'all' && t.territorio !== filterTerritorio) return false;
      if (filterColegio    !== 'all' && t.colegio    !== filterColegio)    return false;
      return true;
    }),
    [tramites, filterEstatus, filterTerritorio, filterColegio]
  );

  const visible = filtered.slice(0, visibleCount);

  const kpis = useMemo(() => ({
    total:       tramites.length,
    enProceso:   tramites.filter(t => t.estatus === 'en_proceso').length,
    completados: tramites.filter(t => t.estatus === 'completado').length,
    presupuesto: tramites.reduce((s, t) => s + (t.presupuesto ?? 0), 0),
  }), [tramites]);

  if (!puedeVer) return <AccesoRestringido mensaje="No tienes permiso para ver Trámites CN." />;

  return (
    <div className="w-full p-4">
      <PageHeader title="Trámites CN" subtitle="Seguimiento de trámites de Cumplimiento Normativo / Protección Civil" icon={<ListTodo className="w-5 h-5" />} />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Total Trámites', value: kpis.total,       color: 'text-slate-900'   },
          { label: 'En Proceso',     value: kpis.enProceso,   color: 'text-amber-600'   },
          { label: 'Completados',    value: kpis.completados, color: 'text-emerald-600' },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{label}</p>
            <p className={`text-xl font-black ${color}`}>{value}</p>
          </div>
        ))}
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Presupuesto Total</p>
          <p className="text-lg font-black text-blue-600">{fmx(kpis.presupuesto)}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 mb-4">
        <select className={selectClass} value={filterEstatus} onChange={e => { setFilterEstatus(e.target.value); setVisibleCount(PAGE_SIZE); }}>
          <option value="all">Todos los estatus</option>
          <option value="en_proceso">En Proceso</option>
          <option value="completado">Completado</option>
          <option value="cancelado">Cancelado</option>
        </select>
        <select className={selectClass} value={filterTerritorio} onChange={e => { setFilterTerritorio(e.target.value); setFilterColegio('all'); setVisibleCount(PAGE_SIZE); }}>
          <option value="all">Todos los territorios</option>
          <option value="NORTE">Norte</option>
          <option value="MEXICO">México</option>
          <option value="FMA">FMA</option>
        </select>
        <select className={selectClass} value={filterColegio} onChange={e => { setFilterColegio(e.target.value); setVisibleCount(PAGE_SIZE); }}>
          <option value="all">Todos los colegios</option>
          {colegiosPorTerritorio.map(c => <option key={c.nombre} value={c.nombre}>{c.nombre}</option>)}
        </select>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin" />
        </div>
      ) : visible.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border border-slate-200">
          <ListTodo className="w-10 h-10 text-slate-300 mx-auto mb-2" />
          <p className="text-slate-500 text-sm">No hay trámites CN en esta categoría todavía.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[760px]">
              <thead>
                <tr className="bg-slate-800 text-white text-xs uppercase">
                  <th className="px-4 py-3 text-left w-[130px]">Folio</th>
                  <th className="px-4 py-3 text-left">Trámite</th>
                  <th className="px-4 py-3 text-left w-[190px]">Colegio</th>
                  <th className="px-4 py-3 text-left w-[110px]">Avance</th>
                  <th className="px-4 py-3 text-left w-[130px]">Presupuesto</th>
                  <th className="px-4 py-3 text-left w-[130px]">Costo Real</th>
                  <th className="px-4 py-3 text-left w-[120px]">Estatus</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((t, i) => (
                  <tr key={t.id} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                    <td className="px-4 py-3 font-mono text-xs font-bold text-slate-700">
                      <Link to={`/cumplimiento/tramites/${t.id}`} className="hover:underline">{t.folio}</Link>
                    </td>
                    <td className="px-4 py-3 text-slate-800 text-xs font-medium">
                      <Link to={`/cumplimiento/tramites/${t.id}`} className="hover:underline">
                        <div className="truncate max-w-[280px]" title={t.nombre_tramite}>{t.nombre_tramite}</div>
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-slate-800 text-xs">{t.colegio}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div className="h-full bg-slate-700 rounded-full" style={{ width: `${t.avance ?? 0}%` }} />
                        </div>
                        <span className="text-xs text-slate-500">{t.avance ?? 0}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-700 font-mono">{fmx(t.presupuesto)}</td>
                    <td className="px-4 py-3 text-xs text-slate-700 font-mono">{fmx(t.costo_real)}</td>
                    <td className="px-4 py-3"><StatusBadge status={t.estatus} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filtered.length > visibleCount && (
            <div className="flex flex-col items-center gap-2 py-4 border-t border-slate-100">
              <button onClick={() => setVisibleCount(v => v + PAGE_SIZE)}
                className="flex items-center gap-2 px-5 py-2.5 bg-white border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 hover:border-slate-400 transition-colors shadow-sm">
                <ChevronDown className="w-4 h-4" /> Cargar más ({filtered.length - visibleCount} restantes)
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
