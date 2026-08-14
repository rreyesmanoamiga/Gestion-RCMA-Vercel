import React, { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useAuth } from '@/lib/AuthContext';
import PageHeader from '@/components/shared/PageHeader';
import {
  Search, ChevronLeft, ChevronRight, Loader2, X, Download,
  FileSpreadsheet, FileBarChart,
} from 'lucide-react';
import {
  useComplianceDocs, useUpdateDocsBulk, formatFecha,
  MATERIAS, ESTADOS_EDITABLES, PAGE_SIZE,
  LoadingBlock, ErrorBlock, VigenteBadge, EstadoSelect, ResponsableInput, DetalleModal,
  type ComplianceDoc,
} from '@/lib/complianceShared';
import {
  generarExcelCumplimiento,
  generarPDFGeneralCumplimiento,
  generarPDFColegioCumplimiento,
  type ComplianceDocReport,
} from '@/lib/reportesCumplimiento';

function BulkToolbar({
  seleccionados, onLimpiar, onAplicado,
}: { seleccionados: ComplianceDoc[]; onLimpiar: () => void; onAplicado: () => void }) {
  const [responsable, setResponsable] = useState('');
  const [nuevoEstado, setNuevoEstado] = useState('');
  const updateBulk = useUpdateDocsBulk();
  const ids = seleccionados.map(d => d.id);

  const asignarResponsable = () => {
    const limpio = responsable.trim();
    if (!limpio) { toast.error('Escribe un nombre antes de asignar'); return; }
    updateBulk.mutate(
      { ids, patch: { responsable: limpio } },
      { onSuccess: () => { toast.success(`Responsable asignado a ${ids.length} documento${ids.length !== 1 ? 's' : ''}`); setResponsable(''); onAplicado(); } }
    );
  };

  const cambiarEstado = () => {
    if (!nuevoEstado) { toast.error('Elige un estado antes de aplicar'); return; }
    updateBulk.mutate(
      { ids, patch: { estado: nuevoEstado } },
      { onSuccess: () => { toast.success(`Estado actualizado en ${ids.length} documento${ids.length !== 1 ? 's' : ''}`); setNuevoEstado(''); onAplicado(); } }
    );
  };

  return (
    <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 mb-3 px-4 py-2.5 bg-[#00295A] rounded-xl text-white shadow-md">
      <span className="text-xs font-bold whitespace-nowrap">{ids.length} seleccionado{ids.length !== 1 ? 's' : ''}</span>
      <div className="flex items-center gap-1.5 ml-2">
        <input
          value={responsable}
          onChange={e => setResponsable(e.target.value)}
          placeholder="Nombre del responsable..."
          disabled={updateBulk.isPending}
          className="px-2.5 py-1.5 text-xs rounded-lg text-slate-800 min-w-[180px] disabled:opacity-50"
        />
        <button onClick={asignarResponsable} disabled={updateBulk.isPending}
          className="px-3 py-1.5 text-xs font-bold bg-[#ED7102] rounded-lg hover:bg-[#d9640a] disabled:opacity-50 whitespace-nowrap">
          Asignar
        </button>
      </div>
      <div className="flex items-center gap-1.5">
        <select value={nuevoEstado} onChange={e => setNuevoEstado(e.target.value)} disabled={updateBulk.isPending}
          className="px-2.5 py-1.5 text-xs rounded-lg text-slate-800 disabled:opacity-50">
          <option value="">Cambiar estado a...</option>
          {ESTADOS_EDITABLES.map(e => <option key={e} value={e}>{e}</option>)}
        </select>
        <button onClick={cambiarEstado} disabled={updateBulk.isPending}
          className="px-3 py-1.5 text-xs font-bold bg-white/15 rounded-lg hover:bg-white/25 disabled:opacity-50 whitespace-nowrap">
          Aplicar
        </button>
      </div>
      {updateBulk.isPending && <Loader2 className="w-4 h-4 animate-spin ml-1" />}
      <button onClick={onLimpiar} className="ml-auto p-1.5 rounded-lg hover:bg-white/15" title="Cancelar selección">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

export default function CumplimientoDocumentos() {
  const { data: docs = [], isLoading, isError, refetch } = useComplianceDocs();
  const { user } = useAuth();
  const elaboradoPor = (user as any)?.user_metadata?.nombre || user?.email || 'Sistema RCMA';

  const [busqueda, setBusqueda] = useState('');
  const [territorioFiltro, setTerritorioFiltro] = useState('Todos');
  const [materiaFiltro, setMateriaFiltro] = useState<typeof MATERIAS[number]>('Todas');
  const [estadoFiltro, setEstadoFiltro] = useState('Todos');
  const [colegioFiltro, setColegioFiltro] = useState('Todos');
  const [pagina, setPagina] = useState(1);
  const [detalle, setDetalle] = useState<ComplianceDoc | null>(null);
  const [generando, setGenerando] = useState<'' | 'excel' | 'pdf_general' | 'pdf_colegio'>('');
  const [seleccionados, setSeleccionados] = useState<Set<string>>(new Set());

  const colegios = useMemo(() => Array.from(new Set(docs.map(d => d.colegio))).sort(), [docs]);
  const estados = useMemo(() => Array.from(new Set(docs.map(d => d.estado))).sort(), [docs]);

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

  const toggleSeleccion = (id: string) => {
    setSeleccionados(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const todosFiltradosSeleccionados = filtrados.length > 0 && filtrados.every(d => seleccionados.has(d.id));
  const toggleSeleccionarTodosFiltrados = () => {
    setSeleccionados(prev => {
      const next = new Set(prev);
      if (todosFiltradosSeleccionados) { filtrados.forEach(d => next.delete(d.id)); return next; }
      filtrados.forEach(d => next.add(d.id));
      return next;
    });
  };

  const docsSeleccionados = useMemo(() => docs.filter(d => seleccionados.has(d.id)), [docs, seleccionados]);

  const descargarExcel = async () => {
    setGenerando('excel');
    try {
      await generarExcelCumplimiento(docs as ComplianceDocReport[]);
      toast.success('Excel generado');
    } catch (err: any) {
      toast.error(`No se pudo generar el Excel: ${err?.message ?? 'error desconocido'}`);
    } finally { setGenerando(''); }
  };

  const descargarPDFGeneral = async () => {
    setGenerando('pdf_general');
    try {
      await generarPDFGeneralCumplimiento({ docs: docs as ComplianceDocReport[], elaboradoPor });
      toast.success('PDF general generado');
    } catch (err: any) {
      toast.error(`No se pudo generar el PDF: ${err?.message ?? 'error desconocido'}`);
    } finally { setGenerando(''); }
  };

  const descargarPDFColegio = async () => {
    if (colegioFiltro === 'Todos') return;
    setGenerando('pdf_colegio');
    try {
      const docsColegio = docs.filter(d => d.colegio === colegioFiltro) as ComplianceDocReport[];
      const territorio = docsColegio[0]?.territorio ?? '';
      await generarPDFColegioCumplimiento({ colegio: colegioFiltro, territorio, docs: docsColegio, elaboradoPor });
      toast.success(`PDF de ${colegioFiltro} generado`);
    } catch (err: any) {
      toast.error(`No se pudo generar el PDF: ${err?.message ?? 'error desconocido'}`);
    } finally { setGenerando(''); }
  };

  return (
    <div className="p-6 lg:p-8 max-w-[1700px] mx-auto">
      <PageHeader title="Documentos" subtitle="Registro completo de documentos de Cumplimiento — filtra, edita y descarga reportes" />

      {isError ? <ErrorBlock onRetry={() => refetch()} /> : isLoading ? <LoadingBlock /> : (
        <div>
          <div className="flex flex-wrap gap-2 mb-4">
            <button onClick={descargarExcel} disabled={generando !== ''}
              className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-bold rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 disabled:opacity-50">
              {generando === 'excel' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileSpreadsheet className="w-3.5 h-3.5" />}
              Excel global
            </button>
            <button onClick={descargarPDFGeneral} disabled={generando !== ''}
              className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-bold rounded-lg border border-[#00295A]/20 bg-[#00295A]/5 text-[#00295A] hover:bg-[#00295A]/10 disabled:opacity-50">
              {generando === 'pdf_general' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileBarChart className="w-3.5 h-3.5" />}
              PDF general
            </button>
            {colegioFiltro !== 'Todos' && (
              <button onClick={descargarPDFColegio} disabled={generando !== ''}
                className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-bold rounded-lg border border-[#ED7102]/30 bg-[#ED7102]/5 text-[#ED7102] hover:bg-[#ED7102]/10 disabled:opacity-50">
                {generando === 'pdf_colegio' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                PDF de {colegioFiltro.replace('Mano Amiga ', '')}
              </button>
            )}
          </div>

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

          {seleccionados.size > 0 && (
            <BulkToolbar seleccionados={docsSeleccionados} onLimpiar={() => setSeleccionados(new Set())} onAplicado={() => setSeleccionados(new Set())} />
          )}

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-left">
                    <th className="px-3 py-2.5 w-8">
                      <input type="checkbox" checked={todosFiltradosSeleccionados} onChange={toggleSeleccionarTodosFiltrados}
                        title="Seleccionar todos los documentos que cumplen el filtro actual" className="cursor-pointer" />
                    </th>
                    <th className="px-4 py-2.5 text-[10px] font-bold text-slate-400 uppercase tracking-wide">Colegio</th>
                    <th className="px-4 py-2.5 text-[10px] font-bold text-slate-400 uppercase tracking-wide">Territorio</th>
                    <th className="px-4 py-2.5 text-[10px] font-bold text-slate-400 uppercase tracking-wide">Documento</th>
                    <th className="px-4 py-2.5 text-[10px] font-bold text-slate-400 uppercase tracking-wide">Materia</th>
                    <th className="px-4 py-2.5 text-[10px] font-bold text-slate-400 uppercase tracking-wide">Estado</th>
                    <th className="px-4 py-2.5 text-[10px] font-bold text-slate-400 uppercase tracking-wide">Vigente</th>
                    <th className="px-4 py-2.5 text-[10px] font-bold text-slate-400 uppercase tracking-wide">Vigente desde</th>
                    <th className="px-4 py-2.5 text-[10px] font-bold text-slate-400 uppercase tracking-wide">Vigente hasta</th>
                    <th className="px-4 py-2.5 text-[10px] font-bold text-slate-400 uppercase tracking-wide">Responsable</th>
                    <th className="px-4 py-2.5 text-[10px] font-bold text-slate-400 uppercase tracking-wide">Fecha límite</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pageItems.map(d => (
                    <tr key={d.id} className={`hover:bg-slate-50 cursor-pointer ${seleccionados.has(d.id) ? 'bg-[#00295A]/5' : ''}`} onClick={() => setDetalle(d)}>
                      <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}>
                        <input type="checkbox" checked={seleccionados.has(d.id)} onChange={() => toggleSeleccion(d.id)} className="cursor-pointer" />
                      </td>
                      <td className="px-4 py-2.5 text-slate-800 whitespace-nowrap">{d.colegio.replace('Mano Amiga ', '')}</td>
                      <td className="px-4 py-2.5 text-slate-500 whitespace-nowrap">{d.territorio}</td>
                      <td className="px-4 py-2.5 text-slate-700 font-medium">{d.tipo_documento}</td>
                      <td className="px-4 py-2.5 text-slate-500 whitespace-nowrap">{d.materia ?? '—'}</td>
                      <td className="px-4 py-2.5"><EstadoSelect doc={d} onSaved={() => {}} /></td>
                      <td className="px-4 py-2.5"><VigenteBadge vigente={d.vigente} /></td>
                      <td className="px-4 py-2.5 text-slate-500 whitespace-nowrap">{formatFecha(d.vigente_desde)}</td>
                      <td className="px-4 py-2.5 text-slate-500 whitespace-nowrap">{formatFecha(d.vigente_hasta)}</td>
                      <td className="px-4 py-2.5 min-w-[140px]" onClick={e => e.stopPropagation()}><ResponsableInput doc={d} onSaved={() => {}} /></td>
                      <td className="px-4 py-2.5 text-slate-500 whitespace-nowrap">{formatFecha(d.fecha_limite_recepcion)}</td>
                    </tr>
                  ))}
                  {pageItems.length === 0 && (
                    <tr><td colSpan={11} className="text-center text-sm text-slate-400 py-8">Sin resultados para estos filtros.</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            {filtrados.length > 0 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 bg-slate-50">
                <p className="text-xs text-slate-500">Página {paginaSegura} de {totalPaginas}</p>
                <div className="flex items-center gap-2">
                  <button onClick={() => setPagina(p => Math.max(1, p - 1))} disabled={paginaSegura === 1}
                    className="p-1.5 rounded-md border border-slate-200 text-slate-500 disabled:opacity-30 hover:bg-white">
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button onClick={() => setPagina(p => Math.min(totalPaginas, p + 1))} disabled={paginaSegura === totalPaginas}
                    className="p-1.5 rounded-md border border-slate-200 text-slate-500 disabled:opacity-30 hover:bg-white">
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>

          {detalle && <DetalleModal doc={detalle} onClose={() => setDetalle(null)} onSaved={() => setDetalle(null)} />}
        </div>
      )}
    </div>
  );
}
