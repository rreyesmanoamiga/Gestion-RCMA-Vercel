import React, { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useAuth } from '@/lib/AuthContext';
import PageHeader from '@/components/shared/PageHeader';
import { FileBarChart, FileSpreadsheet, Loader2, ShieldCheck } from 'lucide-react';
import {
  useComplianceDocs, LoadingBlock, ErrorBlock, type ComplianceDoc,
} from '@/lib/complianceShared';
import { generarExcelCumplimiento, generarPDFGeneralCumplimiento, type ComplianceDocReport } from '@/lib/reportesCumplimiento';
import { usePermissions } from '@/hooks/usePermissions';
import AccesoRestringido from '@/components/shared/AccesoRestringido';

export default function CumplimientoReportesEjecutivos() {
  const { isAdmin, can } = usePermissions();
  const { user } = useAuth();
  const { data: docs = [], isLoading, isError, refetch } = useComplianceDocs();

  const añoActual = new Date().getFullYear();
  const [territorioFiltro, setTerritorioFiltro] = useState('Todos');
  const [colegioFiltro, setColegioFiltro] = useState('Todos');
  const [añoFiltro, setAñoFiltro] = useState<number | 'Todos'>(añoActual);
  const [generando, setGenerando] = useState<'' | 'pdf' | 'excel'>('');

  const años = useMemo(() => Array.from(new Set(docs.map(d => d.año))).sort((a, b) => b - a), [docs]);
  const colegios = useMemo(
    () => Array.from(new Set(
      docs.filter(d => territorioFiltro === 'Todos' || d.territorio === territorioFiltro).map(d => d.colegio)
    )).sort(),
    [docs, territorioFiltro]
  );

  const docsFiltrados = useMemo(() => {
    return docs.filter(d => {
      if (añoFiltro !== 'Todos' && d.año !== añoFiltro) return false;
      if (territorioFiltro !== 'Todos' && d.territorio !== territorioFiltro) return false;
      if (colegioFiltro !== 'Todos' && d.colegio !== colegioFiltro) return false;
      return true;
    });
  }, [docs, territorioFiltro, colegioFiltro, añoFiltro]);

  const alcanceLabel = useMemo(() => {
    if (colegioFiltro !== 'Todos') return colegioFiltro;
    if (territorioFiltro !== 'Todos') return `Territorio ${territorioFiltro === 'MEXICO' ? 'México' : 'Norte'}`;
    return 'nivel nacional';
  }, [territorioFiltro, colegioFiltro]);

  // Mismo territorio/colegio elegido, pero TODOS los años — es el alcance real
  // que usa tanto la página de historial del PDF como el Excel de respaldo.
  const docsAlcance = useMemo(() => {
    return docs.filter(d => {
      if (territorioFiltro !== 'Todos' && d.territorio !== territorioFiltro) return false;
      if (colegioFiltro !== 'Todos' && d.colegio !== colegioFiltro) return false;
      return true;
    });
  }, [docs, territorioFiltro, colegioFiltro]);

  // Historial por año (mismo territorio/colegio, todos los años) — va SIEMPRE en
  // una página/hoja aparte, para no mezclar años distintos en el mismo total.
  const historialPorAño = useMemo(() => {
    const mapa = new Map<number, { total: number; verificados: number }>();
    docsAlcance.forEach(d => {
      const cur = mapa.get(d.año) ?? { total: 0, verificados: 0 };
      cur.total++;
      if (d.estado === 'Verificado') cur.verificados++;
      mapa.set(d.año, cur);
    });
    return Array.from(mapa.entries())
      .map(([año, s]) => ({ año, ...s }))
      .sort((a, b) => a.año - b.año);
  }, [docsAlcance]);

  const elaboradoPor = user?.user_metadata?.nombre || (isAdmin ? 'Ing. Ricardo Joanathan Reyes Medina' : user?.email) || 'Usuario';

  const generarPDF = async () => {
    if (docsFiltrados.length === 0) { toast.error('No hay documentos para este filtro'); return; }
    setGenerando('pdf');
    try {
      await generarPDFGeneralCumplimiento({ docs: docsFiltrados as ComplianceDocReport[], elaboradoPor, alcanceLabel, historialPorAño });
      toast.success('PDF ejecutivo generado');
    } catch (err: any) {
      toast.error(`No se pudo generar el PDF: ${err?.message ?? 'error desconocido'}`);
    } finally { setGenerando(''); }
  };

  const generarExcel = async () => {
    if (docsAlcance.length === 0) { toast.error('No hay documentos para este alcance'); return; }
    setGenerando('excel');
    try {
      await generarExcelCumplimiento(docsAlcance as ComplianceDocReport[]);
      toast.success('Excel de respaldo generado (incluye todo el historial)');
    } catch (err: any) {
      toast.error(`No se pudo generar el Excel: ${err?.message ?? 'error desconocido'}`);
    } finally { setGenerando(''); }
  };

  if (!isAdmin && !can('ver_cumplimiento')) {
    return (
      <div className="p-6 lg:p-8 max-w-[1200px] mx-auto">
        <PageHeader title="Generador de Reportes Ejecutivos" subtitle="Resumen de Cumplimiento listo para Dirección" />
        <AccesoRestringido />
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 max-w-[1200px] mx-auto space-y-6">
      <PageHeader title="Generador de Reportes Ejecutivos" subtitle="Resumen de Cumplimiento listo para Dirección" />

      {isError ? <ErrorBlock onRetry={() => refetch()} /> : isLoading ? <LoadingBlock /> : (
        <>
          {/* ─── Filtros de alcance ─────────────────────────────────────────── */}
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-3">Alcance del reporte</p>
            <div className="flex flex-wrap gap-3">
              <select value={añoFiltro} onChange={e => setAñoFiltro(e.target.value === 'Todos' ? 'Todos' : Number(e.target.value))}
                className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white">
                <option value="Todos">Todos los años</option>
                {años.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
              <select value={territorioFiltro} onChange={e => { setTerritorioFiltro(e.target.value); setColegioFiltro('Todos'); }}
                className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white">
                <option value="Todos">Todo territorio</option>
                <option value="MEXICO">México</option>
                <option value="NORTE">Norte</option>
              </select>
              <select value={colegioFiltro} onChange={e => setColegioFiltro(e.target.value)}
                className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white">
                <option value="Todos">Todos los colegios</option>
                {colegios.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <p className="text-xs text-slate-400 mt-3">
              {docsFiltrados.length} documento{docsFiltrados.length !== 1 ? 's' : ''} dentro de este alcance ·
              <ShieldCheck className="w-3 h-3 inline mx-1 -mt-0.5" />{alcanceLabel}
            </p>
            <p className="text-[11px] text-slate-400 mt-1 italic">
              Por default se muestra el año en curso ({añoActual}) — el historial de años anteriores siempre se incluye aparte, en una página/hoja separada del PDF y el Excel.
            </p>
          </div>

          {/* ─── Generar ─────────────────────────────────────────────────────── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <button onClick={generarPDF} disabled={generando !== ''}
              className="bg-white border border-slate-200 hover:border-[#00295A] rounded-xl p-6 text-left transition-colors disabled:opacity-50 group">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-lg bg-[#00295A] flex items-center justify-center shrink-0">
                  {generando === 'pdf' ? <Loader2 className="w-5 h-5 text-white animate-spin" /> : <FileBarChart className="w-5 h-5 text-white" />}
                </div>
                <p className="font-bold text-[#00295A]">PDF Ejecutivo</p>
              </div>
              <p className="text-xs text-slate-500">
                1-2 páginas: KPIs de cumplimiento, riesgo por colegio y avance — listo para enviar a Dirección.
              </p>
            </button>

            <button onClick={generarExcel} disabled={generando !== ''}
              className="bg-white border border-slate-200 hover:border-emerald-600 rounded-xl p-6 text-left transition-colors disabled:opacity-50 group">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-lg bg-emerald-600 flex items-center justify-center shrink-0">
                  {generando === 'excel' ? <Loader2 className="w-5 h-5 text-white animate-spin" /> : <FileSpreadsheet className="w-5 h-5 text-white" />}
                </div>
                <p className="font-bold text-emerald-700">Excel de Respaldo</p>
              </div>
              <p className="text-xs text-slate-500">
                Detalle completo, documento por documento, con TODO el historial de años — para quien necesite revisar a fondo lo que sustenta el resumen.
              </p>
            </button>
          </div>
        </>
      )}
    </div>
  );
}
