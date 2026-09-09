import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import PageHeader from '@/components/shared/PageHeader';
import {
  useComplianceDocs, esRetraso, formatFecha, MATERIAS, LoadingBlock, ErrorBlock,
  type ComplianceDoc,
} from '@/lib/complianceShared';
import { usePermissions } from '@/hooks/usePermissions';
import AccesoRestringido from '@/components/shared/AccesoRestringido';
import { X, ShieldCheck, ShieldAlert, ShieldX, Infinity as InfinityIcon, HelpCircle } from 'lucide-react';

export default function CumplimientoPanelGeneral() {
  const { isAdmin, can } = usePermissions();
  const { data: docs = [], isLoading, isError, refetch } = useComplianceDocs();
  const [materiaFiltro, setMateriaFiltro] = useState<typeof MATERIAS[number]>('Todas');
  const añosDisponibles = useMemo(() => Array.from(new Set(docs.map(d => d.año))).sort((a, b) => b - a), [docs]);
  const [añoFiltro, setAñoFiltro] = useState<number | 'Todos'>('Todos');
  const hoy = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);
  const [colegioModal, setColegioModal] = useState<string | null>(null);

  // Periodicidad de cada documento — para saber si es "Permanente" (Único trámite).
  const { data: conceptos = [] } = useQuery({
    queryKey: ['compliance_conceptos_periodicidad'],
    queryFn: async () => {
      const { data, error } = await supabase.from('compliance_conceptos').select('id, nombre, periodicidad');
      if (error) throw error;
      return (data ?? []) as { id: string; nombre: string; periodicidad: string }[];
    },
  });
  const { data: periodicidadesColegio = [] } = useQuery({
    queryKey: ['compliance_periodicidad_colegio_lite'],
    queryFn: async () => {
      const { data, error } = await supabase.from('compliance_periodicidad_colegio').select('colegio, concepto_id, periodicidad');
      if (error) throw error;
      return (data ?? []) as { colegio: string; concepto_id: string; periodicidad: string }[];
    },
  });
  const getPeriodicidad = (colegio: string, tipoDocumento: string): string | undefined => {
    const concepto = conceptos.find(c => c.nombre === tipoDocumento);
    if (!concepto) return undefined;
    const override = periodicidadesColegio.find(p => p.colegio === colegio && p.concepto_id === concepto.id);
    return override?.periodicidad ?? concepto.periodicidad;
  };

  const docsFiltrados = useMemo(() => {
    let list = docs;
    if (añoFiltro !== 'Todos') list = list.filter(d => d.año === añoFiltro);
    if (materiaFiltro === 'Todas') return list;
    return list.filter(d => d.materia === materiaFiltro);
  }, [docs, materiaFiltro, añoFiltro]);

  const kpis = useMemo(() => {
    const total = docsFiltrados.length;
    const retraso = docsFiltrados.filter(d => esRetraso(d, hoy)).length;
    const porExpirar = docsFiltrados.filter(d => d.vigente === 'Por expirar').length;
    const verificados = docsFiltrados.filter(d => d.estado === 'Verificado').length;
    return { total, retraso, porExpirar, verificados };
  }, [docsFiltrados, hoy]);

  const porColegio = useMemo(() => {
    const mapa = new Map<string, { colegio: string; territorio: string; total: number; retraso: number; porExpirar: number; sinInfo: number; verificados: number }>();
    docsFiltrados.forEach(d => {
      const cur = mapa.get(d.colegio) ?? { colegio: d.colegio, territorio: d.territorio, total: 0, retraso: 0, porExpirar: 0, sinInfo: 0, verificados: 0 };
      cur.total++;
      if (esRetraso(d, hoy)) cur.retraso++;
      if (d.vigente === 'Por expirar') cur.porExpirar++;
      if (!d.vigente) cur.sinInfo++; // sin "Vigente desde" capturado todavía — no es "al día"
      if (d.estado === 'Verificado') cur.verificados++;
      mapa.set(d.colegio, cur);
    });
    return Array.from(mapa.values()).sort((a, b) => b.retraso - a.retraso || b.sinInfo - a.sinInfo);
  }, [docsFiltrados, hoy]);

  if (!isAdmin && !can('ver_cumplimiento')) {
    return (
      <div className="p-6 lg:p-8 max-w-[1700px] mx-auto">
        <PageHeader title="Panel General" subtitle="Cumplimiento por colegio y materia — registro oficial de Compliance" />
        <AccesoRestringido />
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 max-w-[1700px] mx-auto">
      <PageHeader title="Panel General" subtitle="Cumplimiento por colegio y materia — registro oficial de Compliance" />

      {isError ? <ErrorBlock onRetry={() => refetch()} /> : isLoading ? <LoadingBlock /> : (
        <div>
          <div className="flex gap-2 mb-5 flex-wrap items-center">
            <select value={añoFiltro} onChange={e => setAñoFiltro(e.target.value === 'Todos' ? 'Todos' : Number(e.target.value))}
              className="text-xs font-bold border border-slate-200 rounded-full px-3 py-1.5 bg-white text-slate-600">
              <option value="Todos">Todos los años</option>
              {añosDisponibles.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
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
            <div className="divide-y divide-slate-100 max-h-[560px] overflow-y-auto">
              {porColegio.map(c => (
                <div key={c.colegio} onClick={() => setColegioModal(c.colegio)}
                  className="flex items-center justify-between px-4 py-2.5 cursor-pointer hover:bg-slate-50 transition-colors">
                  <div>
                    <p className="text-sm text-slate-800 font-medium">{c.colegio}</p>
                    <p className="text-[10px] text-slate-400">{c.territorio} · {c.verificados}/{c.total} verificados</p>
                  </div>
                  {c.retraso > 0 ? (
                    <span className="text-xs font-bold text-white bg-red-600 px-2.5 py-1 rounded-full">{c.retraso} vencido{c.retraso !== 1 ? 's' : ''}</span>
                  ) : c.porExpirar > 0 ? (
                    <span className="text-xs font-bold text-white bg-[#ED7102] px-2.5 py-1 rounded-full">{c.porExpirar} por expirar</span>
                  ) : c.sinInfo > 0 ? (
                    <span className="text-xs font-bold text-slate-500 bg-slate-100 border border-slate-200 px-2.5 py-1 rounded-full">Sin información ({c.sinInfo})</span>
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
      )}

      {colegioModal && (() => {
        const docsColegio = docsFiltrados
          .filter(d => d.colegio === colegioModal)
          .sort((a, b) => a.tipo_documento.localeCompare(b.tipo_documento));
        const territorio = docsColegio[0]?.territorio ?? '';

        const estiloEstado = (d: ComplianceDoc) => {
          const periodicidad = getPeriodicidad(d.colegio, d.tipo_documento);
          if (periodicidad === 'Único trámite') {
            return { label: 'Permanente', icon: InfinityIcon, cls: 'bg-blue-50 text-blue-700 border-blue-200' };
          }
          if (!d.vigente) return { label: 'Sin información', icon: HelpCircle, cls: 'bg-slate-100 text-slate-500 border-slate-200' };
          if (d.vigente === 'No') return { label: 'Vencido', icon: ShieldX, cls: 'bg-red-50 text-red-700 border-red-200' };
          if (d.vigente === 'Por expirar') return { label: 'Por expirar', icon: ShieldAlert, cls: 'bg-amber-50 text-amber-700 border-amber-200' };
          return { label: 'Vigente', icon: ShieldCheck, cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
        };

        return (
          <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4" onClick={() => setColegioModal(null)}>
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
              <div className="flex items-start justify-between px-5 py-4 border-b border-slate-100 bg-slate-50">
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">{territorio}</p>
                  <h3 className="text-lg font-bold text-[#00295A] mt-0.5">{colegioModal}</h3>
                  <p className="text-xs text-slate-400 mt-0.5">{docsColegio.length} documento{docsColegio.length !== 1 ? 's' : ''}</p>
                </div>
                <button onClick={() => setColegioModal(null)} className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-400">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="overflow-y-auto divide-y divide-slate-50">
                {docsColegio.map(d => {
                  const e = estiloEstado(d);
                  const Icon = e.icon;
                  return (
                    <div key={d.id} className="px-5 py-3 flex items-center gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-slate-800 truncate">{d.tipo_documento}</p>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          {e.label === 'Permanente'
                            ? 'No vence — trámite único'
                            : d.vigente_desde
                              ? <>Desde {formatFecha(d.vigente_desde)} · Hasta {d.vigente_hasta ? formatFecha(d.vigente_hasta) : '—'}</>
                              : 'Sin fecha de vigencia capturada'}
                        </p>
                      </div>
                      <span className={`shrink-0 inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full border ${e.cls}`}>
                        <Icon className="w-3 h-3" /> {e.label}
                      </span>
                    </div>
                  );
                })}
                {docsColegio.length === 0 && (
                  <p className="text-center text-sm text-slate-400 py-8">Sin documentos para este filtro.</p>
                )}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
