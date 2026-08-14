import React, { useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import {
  ShieldCheck, FileText, ShieldAlert, LayoutDashboard, Loader2,
  Search, ChevronLeft, ChevronRight, AlertTriangle, Clock, CheckCircle2,
} from 'lucide-react';
import PageHeader from '@/components/shared/PageHeader';

const TABS = [
  { path: '/cumplimiento',            label: 'Panel General', icon: LayoutDashboard },
  { path: '/cumplimiento/documentos', label: 'Documentos',    icon: FileText },
  { path: '/cumplimiento/alertas',    label: 'Alertas',       icon: ShieldAlert },
];

interface ComplianceDoc {
  id: string;
  colegio: string;
  territorio: string;
  materia: string | null;
  tipo_documento: string;
  norma: string | null;
  estado: string;
  vigente: string | null;
  fecha_limite_recepcion: string | null;
  vigente_desde: string | null;
  vigente_hasta: string | null;
  año: number;
}

const MATERIAS = ['Todas', 'Protección civil', 'Donatarias Autorizadas', 'Sin categoría'] as const;
const PAGE_SIZE = 25;

// ---------------------------------------------------------------------------
// Helpers compartidos
// ---------------------------------------------------------------------------

function formatFecha(fecha: string | null): string {
  if (!fecha) return '—';
  const [y, m, d] = fecha.split('-');
  return `${d}/${m}/${y}`;
}

function diasDiferencia(fecha: string, hoy: Date): number {
  const f = new Date(fecha + 'T00:00:00');
  return Math.round((f.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24));
}

function useComplianceDocs() {
  return useQuery({
    queryKey: ['compliance_documentos'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('compliance_documentos')
        .select('id, colegio, territorio, materia, tipo_documento, norma, estado, vigente, fecha_limite_recepcion, vigente_desde, vigente_hasta, año')
        .eq('activo', true);
      if (error) throw error;
      return (data ?? []) as unknown as ComplianceDoc[];
    },
  });
}

function esRetraso(d: ComplianceDoc, hoy: Date): boolean {
  if (d.estado === 'Verificado') return false;
  if (!d.fecha_limite_recepcion) return false;
  return new Date(d.fecha_limite_recepcion + 'T00:00:00') < hoy;
}

function EstadoBadge({ estado }: { estado: string }) {
  const map: Record<string, string> = {
    Verificado: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    Pendiente: 'bg-orange-100 text-orange-700 border-orange-200',
    'Por revisar': 'bg-amber-100 text-amber-700 border-amber-200',
    Observaciones: 'bg-red-100 text-red-700 border-red-200',
  };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${map[estado] ?? 'bg-slate-100 text-slate-600 border-slate-200'}`}>
      {estado}
    </span>
  );
}

function VigenteBadge({ vigente }: { vigente: string | null }) {
  if (!vigente) return <span className="text-xs text-slate-300">—</span>;
  const map: Record<string, string> = {
    Si: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    No: 'bg-slate-100 text-slate-500 border-slate-200',
    'Por expirar': 'bg-amber-100 text-amber-700 border-amber-200',
  };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${map[vigente] ?? 'bg-slate-100 text-slate-600 border-slate-200'}`}>
      {vigente}
    </span>
  );
}

function LoadingBlock() {
  return (
    <div className="flex items-center justify-center py-20 text-slate-400">
      <Loader2 className="w-5 h-5 animate-spin mr-2" /> Cargando datos de Compliance...
    </div>
  );
}

// ---------------------------------------------------------------------------
// Panel General
// ---------------------------------------------------------------------------

function PanelGeneral({ docs, isLoading }: { docs: ComplianceDoc[]; isLoading: boolean }) {
  const [materiaFiltro, setMateriaFiltro] = useState<typeof MATERIAS[number]>('Todas');
  const hoy = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);

  const docsFiltrados = useMemo(() => {
    if (materiaFiltro === 'Todas') return docs;
    if (materiaFiltro === 'Sin categoría') return docs.filter(d => !d.materia);
    return docs.filter(d => d.materia === materiaFiltro);
  }, [docs, materiaFiltro]);

  const kpis = useMemo(() => {
    const total = docsFiltrados.length;
    const retraso = docsFiltrados.filter(d => esRetraso(d, hoy)).length;
    const porExpirar = docsFiltrados.filter(d => d.vigente === 'Por expirar').length;
    const verificados = docsFiltrados.filter(d => d.estado === 'Verificado').length;
    return { total, retraso, porExpirar, verificados };
  }, [docsFiltrados, hoy]);

  const porColegio = useMemo(() => {
    const mapa = new Map<string, { colegio: string; territorio: string; total: number; retraso: number; verificados: number }>();
    docsFiltrados.forEach(d => {
      const cur = mapa.get(d.colegio) ?? { colegio: d.colegio, territorio: d.territorio, total: 0, retraso: 0, verificados: 0 };
      cur.total++;
      if (esRetraso(d, hoy)) cur.retraso++;
      if (d.estado === 'Verificado') cur.verificados++;
      mapa.set(d.colegio, cur);
    });
    return Array.from(mapa.values()).sort((a, b) => b.retraso - a.retraso);
  }, [docsFiltrados, hoy]);

  if (isLoading) return <LoadingBlock />;

  return (
    <div>
      <div className="flex gap-2 mb-5 flex-wrap">
        {MATERIAS.map(m => (
          <button key={m} onClick={() => setMateriaFiltro(m)}
            className={`px-3 py-1.5 rounded-full text-xs font-bold transition-colors ${
              materiaFiltro === m ? 'bg-[#00295A] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}>
            {m}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <div className="bg-white border border-slate-200 rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-[#00295A]">{kpis.total}</p>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mt-1">Documentos</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-red-600">{kpis.retraso}</p>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mt-1">En retraso</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-[#ED7102]">{kpis.porExpirar}</p>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mt-1">Por expirar</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-emerald-600">{kpis.verificados}</p>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mt-1">Verificados</p>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 bg-slate-50">
          <p className="text-xs font-bold text-[#00295A] uppercase tracking-wide">Cumplimiento por colegio — ordenado de mayor a menor retraso</p>
        </div>
        <div className="divide-y divide-slate-100 max-h-[480px] overflow-y-auto">
          {porColegio.map(c => (
            <div key={c.colegio} className="flex items-center justify-between px-4 py-2.5">
              <div>
                <p className="text-sm text-slate-800">{c.colegio}</p>
                <p className="text-[10px] text-slate-400">{c.territorio} · {c.verificados}/{c.total} verificados</p>
              </div>
              {c.retraso > 0 ? (
                <span className="text-xs font-bold text-white bg-red-600 px-2.5 py-1 rounded-full">{c.retraso} en retraso</span>
              ) : (
                <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full">Al día</span>
              )}
            </div>
          ))}
          {porColegio.length === 0 && (
            <p className="text-center text-sm text-slate-400 py-8">Sin documentos para este filtro.</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Documentos — tabla completa con búsqueda, filtros y paginación
// ---------------------------------------------------------------------------

function Documentos({ docs, isLoading }: { docs: ComplianceDoc[]; isLoading: boolean }) {
  const [busqueda, setBusqueda] = useState('');
  const [territorioFiltro, setTerritorioFiltro] = useState('Todos');
  const [materiaFiltro, setMateriaFiltro] = useState<typeof MATERIAS[number]>('Todas');
  const [estadoFiltro, setEstadoFiltro] = useState('Todos');
  const [colegioFiltro, setColegioFiltro] = useState('Todos');
  const [pagina, setPagina] = useState(1);

  const colegios = useMemo(
    () => Array.from(new Set(docs.map(d => d.colegio))).sort(),
    [docs]
  );
  const estados = useMemo(
    () => Array.from(new Set(docs.map(d => d.estado))).sort(),
    [docs]
  );

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return docs.filter(d => {
      if (territorioFiltro !== 'Todos' && d.territorio !== territorioFiltro) return false;
      if (colegioFiltro !== 'Todos' && d.colegio !== colegioFiltro) return false;
      if (estadoFiltro !== 'Todos' && d.estado !== estadoFiltro) return false;
      if (materiaFiltro === 'Sin categoría' && d.materia) return false;
      if (materiaFiltro !== 'Todas' && materiaFiltro !== 'Sin categoría' && d.materia !== materiaFiltro) return false;
      if (q && !(`${d.colegio} ${d.tipo_documento} ${d.norma ?? ''}`.toLowerCase().includes(q))) return false;
      return true;
    }).sort((a, b) => a.colegio.localeCompare(b.colegio) || a.tipo_documento.localeCompare(b.tipo_documento));
  }, [docs, busqueda, territorioFiltro, colegioFiltro, estadoFiltro, materiaFiltro]);

  const totalPaginas = Math.max(1, Math.ceil(filtrados.length / PAGE_SIZE));
  const paginaSegura = Math.min(pagina, totalPaginas);
  const pageItems = filtrados.slice((paginaSegura - 1) * PAGE_SIZE, paginaSegura * PAGE_SIZE);

  const resetPagina = () => setPagina(1);

  if (isLoading) return <LoadingBlock />;

  return (
    <div>
      {/* Filtros */}
      <div className="flex flex-wrap gap-2 mb-4">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={busqueda}
            onChange={e => { setBusqueda(e.target.value); resetPagina(); }}
            placeholder="Buscar colegio, documento o norma..."
            className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00295A]/20"
          />
        </div>
        <select value={territorioFiltro} onChange={e => { setTerritorioFiltro(e.target.value); resetPagina(); }}
          className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white">
          <option value="Todos">Todo territorio</option>
          <option value="MEXICO">México</option>
          <option value="NORTE">Norte</option>
        </select>
        <select value={colegioFiltro} onChange={e => { setColegioFiltro(e.target.value); resetPagina(); }}
          className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white">
          <option value="Todos">Todos los colegios</option>
          {colegios.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={materiaFiltro} onChange={e => { setMateriaFiltro(e.target.value as typeof MATERIAS[number]); resetPagina(); }}
          className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white">
          {MATERIAS.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
        <select value={estadoFiltro} onChange={e => { setEstadoFiltro(e.target.value); resetPagina(); }}
          className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white">
          <option value="Todos">Todos los estados</option>
          {estados.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      <p className="text-xs text-slate-400 mb-2">{filtrados.length} documentos encontrados</p>

      {/* Tabla */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-left">
                <th className="px-4 py-2.5 text-[10px] font-bold text-slate-400 uppercase tracking-wide">Colegio</th>
                <th className="px-4 py-2.5 text-[10px] font-bold text-slate-400 uppercase tracking-wide">Territorio</th>
                <th className="px-4 py-2.5 text-[10px] font-bold text-slate-400 uppercase tracking-wide">Documento</th>
                <th className="px-4 py-2.5 text-[10px] font-bold text-slate-400 uppercase tracking-wide">Materia</th>
                <th className="px-4 py-2.5 text-[10px] font-bold text-slate-400 uppercase tracking-wide">Estado</th>
                <th className="px-4 py-2.5 text-[10px] font-bold text-slate-400 uppercase tracking-wide">Vigente</th>
                <th className="px-4 py-2.5 text-[10px] font-bold text-slate-400 uppercase tracking-wide">Fecha límite</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pageItems.map(d => (
                <tr key={d.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2.5 text-slate-800 whitespace-nowrap">{d.colegio.replace('Mano Amiga ', '')}</td>
                  <td className="px-4 py-2.5 text-slate-500 whitespace-nowrap">{d.territorio}</td>
                  <td className="px-4 py-2.5 text-slate-700">{d.tipo_documento}</td>
                  <td className="px-4 py-2.5 text-slate-500 whitespace-nowrap">{d.materia ?? '—'}</td>
                  <td className="px-4 py-2.5"><EstadoBadge estado={d.estado} /></td>
                  <td className="px-4 py-2.5"><VigenteBadge vigente={d.vigente} /></td>
                  <td className="px-4 py-2.5 text-slate-500 whitespace-nowrap">{formatFecha(d.fecha_limite_recepcion)}</td>
                </tr>
              ))}
              {pageItems.length === 0 && (
                <tr><td colSpan={7} className="text-center text-sm text-slate-400 py-8">Sin resultados para estos filtros.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Paginación */}
        {filtrados.length > 0 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 bg-slate-50">
            <p className="text-xs text-slate-500">
              Página {paginaSegura} de {totalPaginas}
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPagina(p => Math.max(1, p - 1))}
                disabled={paginaSegura === 1}
                className="p-1.5 rounded-md border border-slate-200 text-slate-500 disabled:opacity-30 hover:bg-white"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => setPagina(p => Math.min(totalPaginas, p + 1))}
                disabled={paginaSegura === totalPaginas}
                className="p-1.5 rounded-md border border-slate-200 text-slate-500 disabled:opacity-30 hover:bg-white"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Alertas — vencidos y por expirar, priorizados
// ---------------------------------------------------------------------------

function Alertas({ docs, isLoading }: { docs: ComplianceDoc[]; isLoading: boolean }) {
  const hoy = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);

  const vencidos = useMemo(() => {
    return docs
      .filter(d => esRetraso(d, hoy))
      .map(d => ({ ...d, dias: -diasDiferencia(d.fecha_limite_recepcion as string, hoy) }))
      .sort((a, b) => b.dias - a.dias);
  }, [docs, hoy]);

  const porExpirar = useMemo(() => {
    return docs
      .filter(d => d.vigente === 'Por expirar' && d.vigente_hasta)
      .map(d => ({ ...d, dias: diasDiferencia(d.vigente_hasta as string, hoy) }))
      .sort((a, b) => a.dias - b.dias);
  }, [docs, hoy]);

  if (isLoading) return <LoadingBlock />;

  if (vencidos.length === 0 && porExpirar.length === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-10 text-center">
        <div className="w-14 h-14 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-4">
          <CheckCircle2 className="w-7 h-7 text-emerald-600" />
        </div>
        <h2 className="text-lg font-bold text-[#00295A] mb-2">Sin alertas activas</h2>
        <p className="text-sm text-slate-500">Ningún documento está vencido o por expirar en este momento.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {vencidos.length > 0 && (
        <div className="bg-white border border-red-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-red-100 bg-red-50 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-600" />
            <p className="text-xs font-bold text-red-700 uppercase tracking-wide">
              Vencidos — {vencidos.length} documento{vencidos.length !== 1 ? 's' : ''}
            </p>
          </div>
          <div className="divide-y divide-slate-100 max-h-[420px] overflow-y-auto">
            {vencidos.map(d => (
              <div key={d.id} className="flex items-center justify-between px-4 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm text-slate-800 truncate">{d.tipo_documento}</p>
                  <p className="text-[11px] text-slate-400">{d.colegio.replace('Mano Amiga ', '')} · {d.territorio} · vencía {formatFecha(d.fecha_limite_recepcion)}</p>
                </div>
                <span className="text-xs font-bold text-white bg-red-600 px-2.5 py-1 rounded-full whitespace-nowrap ml-3">
                  {d.dias} día{d.dias !== 1 ? 's' : ''} de retraso
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {porExpirar.length > 0 && (
        <div className="bg-white border border-amber-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-amber-100 bg-amber-50 flex items-center gap-2">
            <Clock className="w-4 h-4 text-[#ED7102]" />
            <p className="text-xs font-bold text-[#ED7102] uppercase tracking-wide">
              Por expirar — {porExpirar.length} documento{porExpirar.length !== 1 ? 's' : ''}
            </p>
          </div>
          <div className="divide-y divide-slate-100 max-h-[420px] overflow-y-auto">
            {porExpirar.map(d => (
              <div key={d.id} className="flex items-center justify-between px-4 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm text-slate-800 truncate">{d.tipo_documento}</p>
                  <p className="text-[11px] text-slate-400">{d.colegio.replace('Mano Amiga ', '')} · {d.territorio} · vence {formatFecha(d.vigente_hasta)}</p>
                </div>
                <span className="text-xs font-bold text-white bg-[#ED7102] px-2.5 py-1 rounded-full whitespace-nowrap ml-3">
                  {d.dias} día{d.dias !== 1 ? 's' : ''} restantes
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Contenedor principal
// ---------------------------------------------------------------------------

export default function CumplimientoNormativo() {
  const location = useLocation();
  const tabActivo = TABS.find(t => t.path === location.pathname) ?? TABS[0];
  const { data: docs = [], isLoading } = useComplianceDocs();

  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto">
      <PageHeader title="Cumplimiento Normativo" subtitle="Protección Civil, Donatarias y documentación regulatoria — motor de ejecución sobre el registro oficial de Compliance" />

      <div className="flex gap-2 mb-6 border-b border-slate-200">
        {TABS.map(t => {
          const Icon = t.icon;
          const activo = t.path === tabActivo.path;
          return (
            <a key={t.path} href={t.path}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activo ? 'border-[#ED7102] text-[#00295A]' : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}>
              <Icon className="w-4 h-4" /> {t.label}
            </a>
          );
        })}
      </div>

      {tabActivo.path === '/cumplimiento' && <PanelGeneral docs={docs} isLoading={isLoading} />}
      {tabActivo.path === '/cumplimiento/documentos' && <Documentos docs={docs} isLoading={isLoading} />}
      {tabActivo.path === '/cumplimiento/alertas' && <Alertas docs={docs} isLoading={isLoading} />}

      <div className="flex items-center justify-center gap-2 mt-6 text-xs text-slate-400">
        <ShieldCheck className="w-4 h-4" />
        Visible solo para ti por el momento
      </div>
    </div>
  );
}
