import React, { useMemo, useState } from 'react';
import PageHeader from '@/components/shared/PageHeader';
import {
  useComplianceDocs, esRetraso, MATERIAS, LoadingBlock, ErrorBlock,
} from '@/lib/complianceShared';

export default function CumplimientoPanelGeneral() {
  const { data: docs = [], isLoading, isError, refetch } = useComplianceDocs();
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

  return (
    <div className="p-6 lg:p-8 max-w-[1700px] mx-auto">
      <PageHeader title="Panel General" subtitle="Cumplimiento por colegio y materia — registro oficial de Compliance" />

      {isError ? <ErrorBlock onRetry={() => refetch()} /> : isLoading ? <LoadingBlock /> : (
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
            <div className="divide-y divide-slate-100 max-h-[560px] overflow-y-auto">
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
      )}
    </div>
  );
}
