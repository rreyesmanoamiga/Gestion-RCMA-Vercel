import React, { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/lib/AuthContext';
import {
  ShieldCheck, FileText, ShieldAlert, LayoutDashboard, Loader2,
  Search, ChevronLeft, ChevronRight, AlertTriangle, Clock, CheckCircle2,
  X, Download, FileSpreadsheet, FileBarChart, RefreshCw,
} from 'lucide-react';
import PageHeader from '@/components/shared/PageHeader';
import {
  generarExcelCumplimiento,
  generarPDFGeneralCumplimiento,
  generarPDFColegioCumplimiento,
  type ComplianceDocReport,
} from '@/lib/reportesCumplimiento';

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
  responsable: string | null;
  año: number;
}

const MATERIAS = ['Todas', 'Protección civil', 'Donatarias Autorizadas', 'Sin categoría'] as const;
const ESTADOS_EDITABLES = ['Pendiente', 'Por revisar', 'Verificado', 'Observaciones'];
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
        .select('id, colegio, territorio, materia, tipo_documento, norma, estado, vigente, fecha_limite_recepcion, vigente_desde, vigente_hasta, responsable, año')
        .eq('activo', true);
      if (error) throw error;
      return (data ?? []) as unknown as ComplianceDoc[];
    },
    retry: 1,
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

function ErrorBlock({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="bg-white border border-red-200 rounded-xl p-10 text-center">
      <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-4">
        <AlertTriangle className="w-7 h-7 text-red-600" />
      </div>
      <h2 className="text-lg font-bold text-red-700 mb-2">No se pudieron cargar los datos</h2>
      <p className="text-sm text-slate-500 max-w-md mx-auto mb-5">
        Hubo un problema al conectar con la base de datos de Compliance. Puede ser algo temporal de red
        o de permisos — inténtalo de nuevo; si persiste, avísale a soporte del sistema.
      </p>
      <button
        onClick={onRetry}
        className="inline-flex items-center gap-2 px-4 py-2 bg-[#00295A] text-white rounded-lg text-sm font-bold hover:bg-[#003a7a] transition-colors"
      >
        <RefreshCw className="w-4 h-4" /> Reintentar
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Edición inline: Estado y Responsable
// ---------------------------------------------------------------------------

function useUpdateDoc() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<ComplianceDoc> }) => {
      const { error } = await supabase.from('compliance_documentos').update(patch).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['compliance_documentos'] });
    },
    onError: (err: any) => {
      toast.error(`No se pudo guardar el cambio: ${err?.message ?? 'error desconocido'}`);
    },
  });
}

function useUpdateDocsBulk() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ ids, patch }: { ids: string[]; patch: Partial<ComplianceDoc> }) => {
      const { error } = await supabase.from('compliance_documentos').update(patch).in('id', ids);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['compliance_documentos'] });
    },
    onError: (err: any) => {
      toast.error(`No se pudo aplicar el cambio en lote: ${err?.message ?? 'error desconocido'}`);
    },
  });
}

function EstadoSelect({ doc, onSaved, className }: { doc: ComplianceDoc; onSaved: () => void; className?: string }) {
  const updateDoc = useUpdateDoc();
  return (
    <select
      value={doc.estado}
      disabled={updateDoc.isPending}
      onClick={e => e.stopPropagation()}
      onChange={e => {
        const nuevoEstado = e.target.value;
        updateDoc.mutate(
          { id: doc.id, patch: { estado: nuevoEstado } },
          { onSuccess: () => { toast.success('Estado actualizado'); onSaved(); } }
        );
      }}
      className={`text-xs font-semibold border rounded-full px-2 py-1 bg-white cursor-pointer disabled:opacity-50 ${className ?? ''}`}
    >
      {ESTADOS_EDITABLES.map(e => <option key={e} value={e}>{e}</option>)}
    </select>
  );
}

function ResponsableInput({ doc, onSaved }: { doc: ComplianceDoc; onSaved: () => void }) {
  const [valor, setValor] = useState(doc.responsable ?? '');
  const updateDoc = useUpdateDoc();

  useEffect(() => { setValor(doc.responsable ?? ''); }, [doc.responsable]);

  const guardar = () => {
    const limpio = valor.trim();
    if (limpio === (doc.responsable ?? '')) return;
    updateDoc.mutate(
      { id: doc.id, patch: { responsable: limpio || null } },
      { onSuccess: () => { toast.success('Responsable actualizado'); onSaved(); } }
    );
  };

  return (
    <input
      value={valor}
      onClick={e => e.stopPropagation()}
      onChange={e => setValor(e.target.value)}
      onBlur={guardar}
      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
      placeholder="Sin asignar"
      disabled={updateDoc.isPending}
      className="text-xs border border-transparent hover:border-slate-200 focus:border-[#00295A] rounded px-2 py-1 w-full bg-transparent focus:bg-white outline-none disabled:opacity-50"
    />
  );
}

// ---------------------------------------------------------------------------
// Modal de detalle
// ---------------------------------------------------------------------------

function DetalleModal({ doc, onClose, onSaved }: { doc: ComplianceDoc; onClose: () => void; onSaved: () => void }) {
  return (
    <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between px-5 py-4 border-b border-slate-100 bg-slate-50 rounded-t-xl">
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">{doc.colegio.replace('Mano Amiga ', '')} · {doc.territorio}</p>
            <h3 className="text-base font-bold text-[#00295A] mt-0.5">{doc.tipo_documento}</h3>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-400">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1">Estado</p>
              <EstadoSelect doc={doc} onSaved={onSaved} className="w-full" />
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1">Vigente</p>
              <VigenteBadge vigente={doc.vigente} />
            </div>
          </div>

          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1">Responsable</p>
            <div className="border border-slate-200 rounded-lg px-2">
              <ResponsableInput doc={doc} onSaved={onSaved} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 pt-2 border-t border-slate-100">
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1">Materia</p>
              <p className="text-sm text-slate-700">{doc.materia ?? 'Sin categoría'}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1">Norma / referencia</p>
              <p className="text-sm text-slate-700">{doc.norma ?? '—'}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1">Fecha límite recepción</p>
              <p className="text-sm text-slate-700">{formatFecha(doc.fecha_limite_recepcion)}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1">Año</p>
              <p className="text-sm text-slate-700">{doc.año}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1">Vigente desde</p>
              <p className="text-sm text-slate-700">{formatFecha(doc.vigente_desde)}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1">Vigente hasta</p>
              <p className="text-sm text-slate-700">{formatFecha(doc.vigente_hasta)}</p>
            </div>
          </div>
        </div>
      </div>
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
// Documentos — tabla completa con búsqueda, filtros, edición inline,
// paginación, detalle y reportes.
// ---------------------------------------------------------------------------

function BulkToolbar({
  seleccionados,
  onLimpiar,
  onAplicado,
}: {
  seleccionados: ComplianceDoc[];
  onLimpiar: () => void;
  onAplicado: () => void;
}) {
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
      <span className="text-xs font-bold whitespace-nowrap">
        {ids.length} seleccionado{ids.length !== 1 ? 's' : ''}
      </span>

      <div className="flex items-center gap-1.5 ml-2">
        <input
          value={responsable}
          onChange={e => setResponsable(e.target.value)}
          placeholder="Nombre del responsable..."
          disabled={updateBulk.isPending}
          className="px-2.5 py-1.5 text-xs rounded-lg text-slate-800 min-w-[180px] disabled:opacity-50"
        />
        <button
          onClick={asignarResponsable}
          disabled={updateBulk.isPending}
          className="px-3 py-1.5 text-xs font-bold bg-[#ED7102] rounded-lg hover:bg-[#d9640a] disabled:opacity-50 whitespace-nowrap"
        >
          Asignar
        </button>
      </div>

      <div className="flex items-center gap-1.5">
        <select
          value={nuevoEstado}
          onChange={e => setNuevoEstado(e.target.value)}
          disabled={updateBulk.isPending}
          className="px-2.5 py-1.5 text-xs rounded-lg text-slate-800 disabled:opacity-50"
        >
          <option value="">Cambiar estado a...</option>
          {ESTADOS_EDITABLES.map(e => <option key={e} value={e}>{e}</option>)}
        </select>
        <button
          onClick={cambiarEstado}
          disabled={updateBulk.isPending}
          className="px-3 py-1.5 text-xs font-bold bg-white/15 rounded-lg hover:bg-white/25 disabled:opacity-50 whitespace-nowrap"
        >
          Aplicar
        </button>
      </div>

      {updateBulk.isPending && <Loader2 className="w-4 h-4 animate-spin ml-1" />}

      <button
        onClick={onLimpiar}
        className="ml-auto p-1.5 rounded-lg hover:bg-white/15"
        title="Cancelar selección"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

function Documentos({ docs, isLoading }: { docs: ComplianceDoc[]; isLoading: boolean }) {
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
      if (todosFiltradosSeleccionados) {
        // Deselecciona solo los que están en el filtro actual
        const next = new Set(prev);
        filtrados.forEach(d => next.delete(d.id));
        return next;
      }
      const next = new Set(prev);
      filtrados.forEach(d => next.add(d.id));
      return next;
    });
  };

  const docsSeleccionados = useMemo(
    () => docs.filter(d => seleccionados.has(d.id)),
    [docs, seleccionados]
  );

  const descargarExcel = async () => {
    setGenerando('excel');
    try {
      await generarExcelCumplimiento(docs as ComplianceDocReport[]);
      toast.success('Excel generado');
    } catch (err: any) {
      toast.error(`No se pudo generar el Excel: ${err?.message ?? 'error desconocido'}`);
    } finally {
      setGenerando('');
    }
  };

  const descargarPDFGeneral = async () => {
    setGenerando('pdf_general');
    try {
      await generarPDFGeneralCumplimiento({ docs: docs as ComplianceDocReport[], elaboradoPor });
      toast.success('PDF general generado');
    } catch (err: any) {
      toast.error(`No se pudo generar el PDF: ${err?.message ?? 'error desconocido'}`);
    } finally {
      setGenerando('');
    }
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
    } finally {
      setGenerando('');
    }
  };

  if (isLoading) return <LoadingBlock />;

  return (
    <div>
      {/* Botones de reporte */}
      <div className="flex flex-wrap gap-2 mb-4">
        <button
          onClick={descargarExcel}
          disabled={generando !== ''}
          className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-bold rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
        >
          {generando === 'excel' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileSpreadsheet className="w-3.5 h-3.5" />}
          Excel global
        </button>
        <button
          onClick={descargarPDFGeneral}
          disabled={generando !== ''}
          className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-bold rounded-lg border border-[#00295A]/20 bg-[#00295A]/5 text-[#00295A] hover:bg-[#00295A]/10 disabled:opacity-50"
        >
          {generando === 'pdf_general' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileBarChart className="w-3.5 h-3.5" />}
          PDF general
        </button>
        {colegioFiltro !== 'Todos' && (
          <button
            onClick={descargarPDFColegio}
            disabled={generando !== ''}
            className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-bold rounded-lg border border-[#ED7102]/30 bg-[#ED7102]/5 text-[#ED7102] hover:bg-[#ED7102]/10 disabled:opacity-50"
          >
            {generando === 'pdf_colegio' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
            PDF de {colegioFiltro.replace('Mano Amiga ', '')}
          </button>
        )}
      </div>

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

      {seleccionados.size > 0 && (
        <BulkToolbar
          seleccionados={docsSeleccionados}
          onLimpiar={() => setSeleccionados(new Set())}
          onAplicado={() => setSeleccionados(new Set())}
        />
      )}

      {/* Tabla */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-left">
                <th className="px-3 py-2.5 w-8">
                  <input
                    type="checkbox"
                    checked={todosFiltradosSeleccionados}
                    onChange={toggleSeleccionarTodosFiltrados}
                    title="Seleccionar todos los documentos que cumplen el filtro actual"
                    className="cursor-pointer"
                  />
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
                    <input
                      type="checkbox"
                      checked={seleccionados.has(d.id)}
                      onChange={() => toggleSeleccion(d.id)}
                      className="cursor-pointer"
                    />
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

      {detalle && (
        <DetalleModal doc={detalle} onClose={() => setDetalle(null)} onSaved={() => setDetalle(null)} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Alertas — vencidos y por expirar, priorizados
// ---------------------------------------------------------------------------

function Alertas({ docs, isLoading }: { docs: ComplianceDoc[]; isLoading: boolean }) {
  const hoy = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);
  const [detalle, setDetalle] = useState<ComplianceDoc | null>(null);

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
              <div key={d.id} className="flex items-center justify-between px-4 py-2.5 cursor-pointer hover:bg-slate-50" onClick={() => setDetalle(d)}>
                <div className="min-w-0">
                  <p className="text-sm text-slate-800 truncate">{d.tipo_documento}</p>
                  <p className="text-[11px] text-slate-400">{d.colegio.replace('Mano Amiga ', '')} · {d.territorio} · vencía {formatFecha(d.fecha_limite_recepcion)}{d.responsable ? ` · ${d.responsable}` : ''}</p>
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
              <div key={d.id} className="flex items-center justify-between px-4 py-2.5 cursor-pointer hover:bg-slate-50" onClick={() => setDetalle(d)}>
                <div className="min-w-0">
                  <p className="text-sm text-slate-800 truncate">{d.tipo_documento}</p>
                  <p className="text-[11px] text-slate-400">{d.colegio.replace('Mano Amiga ', '')} · {d.territorio} · vence {formatFecha(d.vigente_hasta)}{d.responsable ? ` · ${d.responsable}` : ''}</p>
                </div>
                <span className="text-xs font-bold text-white bg-[#ED7102] px-2.5 py-1 rounded-full whitespace-nowrap ml-3">
                  {d.dias} día{d.dias !== 1 ? 's' : ''} restantes
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {detalle && (
        <DetalleModal doc={detalle} onClose={() => setDetalle(null)} onSaved={() => setDetalle(null)} />
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
  const { data: docs = [], isLoading, isError, refetch } = useComplianceDocs();

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

      {isError ? (
        <ErrorBlock onRetry={() => refetch()} />
      ) : (
        <>
          {tabActivo.path === '/cumplimiento' && <PanelGeneral docs={docs} isLoading={isLoading} />}
          {tabActivo.path === '/cumplimiento/documentos' && <Documentos docs={docs} isLoading={isLoading} />}
          {tabActivo.path === '/cumplimiento/alertas' && <Alertas docs={docs} isLoading={isLoading} />}
        </>
      )}

      <div className="flex items-center justify-center gap-2 mt-6 text-xs text-slate-400">
        <ShieldCheck className="w-4 h-4" />
        Visible solo para ti por el momento
      </div>
    </div>
  );
}
