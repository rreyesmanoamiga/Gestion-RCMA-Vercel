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
  ListTodo, Plus, MessageSquare, Trash2, Flag, User, Calendar,
} from 'lucide-react';
import PageHeader from '@/components/shared/PageHeader';
import {
  generarExcelCumplimiento,
  generarPDFGeneralCumplimiento,
  generarPDFColegioCumplimiento,
  type ComplianceDocReport,
} from '@/lib/reportesCumplimiento';

const TABS = [
  { path: '/cumplimiento',              label: 'Panel General', icon: LayoutDashboard },
  { path: '/cumplimiento/documentos',   label: 'Documentos',    icon: FileText },
  { path: '/cumplimiento/alertas',      label: 'Alertas',       icon: ShieldAlert },
  { path: '/cumplimiento/seguimiento',  label: 'Seguimiento',   icon: ListTodo },
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
  const updateDoc = useUpdateDoc();

  const [form, setForm] = useState({
    estado: doc.estado,
    vigente: doc.vigente ?? '',
    materia: doc.materia ?? '',
    norma: doc.norma ?? '',
    fecha_limite_recepcion: doc.fecha_limite_recepcion ?? '',
    vigente_desde: doc.vigente_desde ?? '',
    vigente_hasta: doc.vigente_hasta ?? '',
    año: String(doc.año ?? ''),
    responsable: doc.responsable ?? '',
  });

  const set = (campo: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [campo]: e.target.value }));

  const guardarTodo = () => {
    const patch: Partial<ComplianceDoc> = {
      estado: form.estado,
      vigente: form.vigente || null,
      materia: form.materia || null,
      norma: form.norma.trim() || null,
      fecha_limite_recepcion: form.fecha_limite_recepcion || null,
      vigente_desde: form.vigente_desde || null,
      vigente_hasta: form.vigente_hasta || null,
      año: form.año ? parseInt(form.año, 10) : doc.año,
      responsable: form.responsable.trim() || null,
    };
    updateDoc.mutate(
      { id: doc.id, patch },
      { onSuccess: () => { toast.success('Documento actualizado'); onSaved(); } }
    );
  };

  const inputCls = "w-full text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#00295A]/20 disabled:opacity-50";
  const labelCls = "text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1 block";

  return (
    <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between px-5 py-4 border-b border-slate-100 bg-slate-50 rounded-t-xl sticky top-0 z-10">
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
              <label className={labelCls}>Estado</label>
              <select value={form.estado} onChange={set('estado')} disabled={updateDoc.isPending} className={inputCls}>
                {ESTADOS_EDITABLES.map(e => <option key={e} value={e}>{e}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Vigente</label>
              <select value={form.vigente} onChange={set('vigente')} disabled={updateDoc.isPending} className={inputCls}>
                <option value="">— Sin dato —</option>
                <option value="Si">Sí</option>
                <option value="No">No</option>
                <option value="Por expirar">Por expirar</option>
              </select>
            </div>
          </div>

          <div>
            <label className={labelCls}>Responsable</label>
            <input value={form.responsable} onChange={set('responsable')} disabled={updateDoc.isPending} placeholder="Sin asignar" className={inputCls} />
          </div>

          <div className="grid grid-cols-2 gap-4 pt-3 border-t border-slate-100">
            <div>
              <label className={labelCls}>Materia</label>
              <select value={form.materia} onChange={set('materia')} disabled={updateDoc.isPending} className={inputCls}>
                <option value="">Sin categoría</option>
                <option value="Protección civil">Protección civil</option>
                <option value="Donatarias Autorizadas">Donatarias Autorizadas</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Norma / referencia</label>
              <input value={form.norma} onChange={set('norma')} disabled={updateDoc.isPending} placeholder="—" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Fecha límite recepción</label>
              <input type="date" value={form.fecha_limite_recepcion} onChange={set('fecha_limite_recepcion')} disabled={updateDoc.isPending} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Año</label>
              <input type="number" value={form.año} onChange={set('año')} disabled={updateDoc.isPending} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Vigente desde</label>
              <input type="date" value={form.vigente_desde} onChange={set('vigente_desde')} disabled={updateDoc.isPending} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Vigente hasta</label>
              <input type="date" value={form.vigente_hasta} onChange={set('vigente_hasta')} disabled={updateDoc.isPending} className={inputCls} />
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-slate-100 bg-slate-50 rounded-b-xl sticky bottom-0">
          <button onClick={onClose} disabled={updateDoc.isPending} className="px-4 py-2 text-sm font-semibold text-slate-500 hover:bg-slate-200 rounded-lg disabled:opacity-50">
            Cancelar
          </button>
          <button
            onClick={guardarTodo}
            disabled={updateDoc.isPending}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-bold text-white bg-[#00295A] hover:bg-[#003a7a] rounded-lg disabled:opacity-50"
          >
            {updateDoc.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
            Guardar cambios
          </button>
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
// Seguimiento — pendientes de Cumplimiento con prioridad, estatus, fecha
// límite y un hilo de comentarios por pendiente (mismo patrón que NEXUS).
// ---------------------------------------------------------------------------

interface Pendiente {
  id: string;
  titulo: string;
  descripcion: string | null;
  colegio: string | null;
  territorio: string | null;
  documento_id: string | null;
  prioridad: 'baja' | 'media' | 'alta';
  estatus: 'pendiente' | 'en_proceso' | 'completado' | 'cancelado';
  fecha_limite: string | null;
  asignado_a: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

interface ComentarioPendiente {
  id: string;
  pendiente_id: string;
  autor_email: string | null;
  autor_nombre: string | null;
  contenido: string;
  created_at: string;
}

const PRIORIDAD_CFG: Record<Pendiente['prioridad'], { label: string; cls: string; border: string }> = {
  alta:  { label: 'Alta',  cls: 'bg-red-100 text-red-700 border-red-200',       border: 'border-l-red-500' },
  media: { label: 'Media', cls: 'bg-amber-100 text-amber-700 border-amber-200', border: 'border-l-amber-400' },
  baja:  { label: 'Baja',  cls: 'bg-slate-100 text-slate-600 border-slate-200', border: 'border-l-slate-300' },
};

const ESTATUS_CFG: Record<Pendiente['estatus'], { label: string; cls: string }> = {
  pendiente:   { label: 'Pendiente',   cls: 'bg-orange-100 text-orange-700 border-orange-200' },
  en_proceso:  { label: 'En proceso',  cls: 'bg-sky-100 text-sky-700 border-sky-200' },
  completado:  { label: 'Completado',  cls: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  cancelado:   { label: 'Cancelado',   cls: 'bg-slate-100 text-slate-500 border-slate-200' },
};

function usePendientes() {
  return useQuery({
    queryKey: ['compliance_pendientes'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('compliance_pendientes')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as Pendiente[];
    },
  });
}

function ComentariosPendiente({ pendienteId }: { pendienteId: string }) {
  const { user } = useAuth();
  const autorEmail = user?.email ?? '';
  const autorNombre = (user as any)?.user_metadata?.nombre || user?.email || 'Usuario';
  const queryClient = useQueryClient();
  const [texto, setTexto] = useState('');
  const endRef = React.useRef<HTMLDivElement>(null);

  const { data: comentarios = [] } = useQuery({
    queryKey: ['compliance_comentarios', pendienteId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('compliance_comentarios')
        .select('*')
        .eq('pendiente_id', pendienteId)
        .order('created_at');
      if (error) throw error;
      return (data ?? []) as ComentarioPendiente[];
    },
    refetchInterval: 15000,
  });

  const enviar = useMutation({
    mutationFn: async (contenido: string) => {
      const { error } = await supabase.from('compliance_comentarios').insert({
        pendiente_id: pendienteId, autor_email: autorEmail, autor_nombre: autorNombre, contenido,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['compliance_comentarios', pendienteId] });
      setTexto('');
      setTimeout(() => endRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    },
    onError: (err: any) => toast.error(err?.message ?? 'No se pudo enviar el comentario'),
  });

  const eliminar = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('compliance_comentarios').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['compliance_comentarios', pendienteId] });
      toast.success('Comentario eliminado');
    },
  });

  return (
    <div>
      <div className="space-y-2 max-h-64 overflow-y-auto mb-3 pr-1">
        {comentarios.length === 0 && <p className="text-xs text-slate-400 text-center py-4">Sin comentarios aún.</p>}
        {comentarios.map(c => (
          <div key={c.id} className="group relative bg-slate-50 border border-slate-100 rounded-xl px-3 py-2">
            <p className="text-[10px] font-bold text-slate-500 mb-0.5">{c.autor_nombre}</p>
            <p className="text-sm text-slate-800 whitespace-pre-wrap">{c.contenido}</p>
            <p className="text-[10px] text-slate-400 mt-1">{new Date(c.created_at).toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
            {c.autor_email === autorEmail && (
              <button
                onClick={() => { if (confirm('¿Eliminar este comentario?')) eliminar.mutate(c.id); }}
                className="absolute -top-2 -right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-white text-red-500 hover:text-red-700 rounded-full p-1 shadow border border-slate-200"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            )}
          </div>
        ))}
        <div ref={endRef} />
      </div>
      <div className="flex gap-2">
        <textarea
          value={texto}
          onChange={e => setTexto(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (texto.trim()) enviar.mutate(texto.trim()); } }}
          placeholder="Escribe una nota o actualización..."
          rows={2}
          className="flex-1 text-sm border border-slate-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-[#00295A]/20"
        />
        <button
          onClick={() => texto.trim() && enviar.mutate(texto.trim())}
          disabled={enviar.isPending || !texto.trim()}
          className="px-3 rounded-lg bg-[#00295A] text-white text-xs font-bold disabled:opacity-40 hover:bg-[#003a7a]"
        >
          {enviar.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Enviar'}
        </button>
      </div>
    </div>
  );
}

function PendienteModal({
  pendiente, colegios, onClose,
}: { pendiente: Pendiente; colegios: string[]; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    titulo: pendiente.titulo,
    descripcion: pendiente.descripcion ?? '',
    colegio: pendiente.colegio ?? '',
    prioridad: pendiente.prioridad,
    estatus: pendiente.estatus,
    fecha_limite: pendiente.fecha_limite ?? '',
    asignado_a: pendiente.asignado_a ?? '',
  });

  const guardar = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('compliance_pendientes').update({
        titulo: form.titulo.trim(),
        descripcion: form.descripcion.trim() || null,
        colegio: form.colegio || null,
        prioridad: form.prioridad,
        estatus: form.estatus,
        fecha_limite: form.fecha_limite || null,
        asignado_a: form.asignado_a.trim() || null,
      }).eq('id', pendiente.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['compliance_pendientes'] });
      toast.success('Pendiente actualizado');
      onClose();
    },
    onError: (err: any) => toast.error(err?.message ?? 'No se pudo guardar'),
  });

  const eliminar = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('compliance_pendientes').delete().eq('id', pendiente.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['compliance_pendientes'] });
      toast.success('Pendiente eliminado');
      onClose();
    },
  });

  const inputCls = "w-full text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#00295A]/20";
  const labelCls = "text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1 block";

  return (
    <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between px-5 py-4 border-b border-slate-100 bg-slate-50 rounded-t-xl sticky top-0 z-10">
          <input
            value={form.titulo}
            onChange={e => setForm(f => ({ ...f, titulo: e.target.value }))}
            className="text-base font-bold text-[#00295A] bg-transparent border-none outline-none w-full"
          />
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-400 shrink-0 ml-2">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className={labelCls}>Descripción</label>
            <textarea
              value={form.descripcion}
              onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))}
              rows={2}
              className={inputCls + ' resize-none'}
              placeholder="Detalle del pendiente..."
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Colegio</label>
              <select value={form.colegio} onChange={e => setForm(f => ({ ...f, colegio: e.target.value }))} className={inputCls}>
                <option value="">General (sin colegio)</option>
                {colegios.map(c => <option key={c} value={c}>{c.replace('Mano Amiga ', '')}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Asignado a</label>
              <input value={form.asignado_a} onChange={e => setForm(f => ({ ...f, asignado_a: e.target.value }))} placeholder="Sin asignar" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Prioridad</label>
              <select value={form.prioridad} onChange={e => setForm(f => ({ ...f, prioridad: e.target.value as Pendiente['prioridad'] }))} className={inputCls}>
                <option value="baja">Baja</option>
                <option value="media">Media</option>
                <option value="alta">Alta</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Estatus</label>
              <select value={form.estatus} onChange={e => setForm(f => ({ ...f, estatus: e.target.value as Pendiente['estatus'] }))} className={inputCls}>
                <option value="pendiente">Pendiente</option>
                <option value="en_proceso">En proceso</option>
                <option value="completado">Completado</option>
                <option value="cancelado">Cancelado</option>
              </select>
            </div>
            <div className="col-span-2">
              <label className={labelCls}>Fecha límite</label>
              <input type="date" value={form.fecha_limite} onChange={e => setForm(f => ({ ...f, fecha_limite: e.target.value }))} className={inputCls} />
            </div>
          </div>

          <div className="pt-3 border-t border-slate-100">
            <label className={labelCls}>
              <span className="inline-flex items-center gap-1"><MessageSquare className="w-3 h-3" /> Notas y seguimiento</span>
            </label>
            <ComentariosPendiente pendienteId={pendiente.id} />
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 px-5 py-4 border-t border-slate-100 bg-slate-50 rounded-b-xl sticky bottom-0">
          <button
            onClick={() => { if (confirm('¿Eliminar este pendiente y todas sus notas?')) eliminar.mutate(); }}
            disabled={eliminar.isPending}
            className="p-2 rounded-lg text-red-500 hover:bg-red-50 disabled:opacity-50"
            title="Eliminar pendiente"
          >
            <Trash2 className="w-4 h-4" />
          </button>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 text-sm font-semibold text-slate-500 hover:bg-slate-200 rounded-lg">Cancelar</button>
            <button
              onClick={() => guardar.mutate()}
              disabled={guardar.isPending || !form.titulo.trim()}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-bold text-white bg-[#00295A] hover:bg-[#003a7a] rounded-lg disabled:opacity-50"
            >
              {guardar.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              Guardar cambios
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function NuevoPendienteModal({ colegios, onClose }: { colegios: string[]; onClose: () => void }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    titulo: '', descripcion: '', colegio: '', prioridad: 'media' as Pendiente['prioridad'],
    fecha_limite: '', asignado_a: '',
  });

  const crear = useMutation({
    mutationFn: async () => {
      if (!form.titulo.trim()) throw new Error('Escribe un título');
      const { error } = await supabase.from('compliance_pendientes').insert({
        titulo: form.titulo.trim(),
        descripcion: form.descripcion.trim() || null,
        colegio: form.colegio || null,
        prioridad: form.prioridad,
        estatus: 'pendiente',
        fecha_limite: form.fecha_limite || null,
        asignado_a: form.asignado_a.trim() || null,
        created_by: user?.email ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['compliance_pendientes'] });
      toast.success('Pendiente creado');
      onClose();
    },
    onError: (err: any) => toast.error(err?.message ?? 'No se pudo crear el pendiente'),
  });

  const inputCls = "w-full text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#00295A]/20";
  const labelCls = "text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1 block";

  return (
    <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-slate-50 rounded-t-xl">
          <h3 className="text-base font-bold text-[#00295A]">Nuevo pendiente de Cumplimiento</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-400"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className={labelCls}>Título</label>
            <input autoFocus value={form.titulo} onChange={e => setForm(f => ({ ...f, titulo: e.target.value }))} placeholder="Ej. Conseguir Uso de Suelo actualizado" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Descripción (opcional)</label>
            <textarea value={form.descripcion} onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))} rows={2} className={inputCls + ' resize-none'} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Colegio</label>
              <select value={form.colegio} onChange={e => setForm(f => ({ ...f, colegio: e.target.value }))} className={inputCls}>
                <option value="">General (sin colegio)</option>
                {colegios.map(c => <option key={c} value={c}>{c.replace('Mano Amiga ', '')}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Asignado a</label>
              <input value={form.asignado_a} onChange={e => setForm(f => ({ ...f, asignado_a: e.target.value }))} placeholder="Sin asignar" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Prioridad</label>
              <select value={form.prioridad} onChange={e => setForm(f => ({ ...f, prioridad: e.target.value as Pendiente['prioridad'] }))} className={inputCls}>
                <option value="baja">Baja</option>
                <option value="media">Media</option>
                <option value="alta">Alta</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Fecha límite</label>
              <input type="date" value={form.fecha_limite} onChange={e => setForm(f => ({ ...f, fecha_limite: e.target.value }))} className={inputCls} />
            </div>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-slate-100 bg-slate-50 rounded-b-xl">
          <button onClick={onClose} className="px-4 py-2 text-sm font-semibold text-slate-500 hover:bg-slate-200 rounded-lg">Cancelar</button>
          <button
            onClick={() => crear.mutate()}
            disabled={crear.isPending || !form.titulo.trim()}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-bold text-white bg-[#00295A] hover:bg-[#003a7a] rounded-lg disabled:opacity-50"
          >
            {crear.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
            Crear pendiente
          </button>
        </div>
      </div>
    </div>
  );
}

function Seguimiento({ docs, isLoading: isLoadingDocs }: { docs: ComplianceDoc[]; isLoading: boolean }) {
  const { data: pendientes = [], isLoading, isError, refetch } = usePendientes();
  const [estatusFiltro, setEstatusFiltro] = useState<'Todos' | Pendiente['estatus']>('Todos');
  const [colegioFiltro, setColegioFiltro] = useState('Todos');
  const [abierto, setAbierto] = useState<Pendiente | null>(null);
  const [creando, setCreando] = useState(false);

  const colegios = useMemo(() => Array.from(new Set(docs.map(d => d.colegio))).sort(), [docs]);

  const filtrados = useMemo(() => {
    return pendientes.filter(p => {
      if (estatusFiltro !== 'Todos' && p.estatus !== estatusFiltro) return false;
      if (colegioFiltro !== 'Todos' && p.colegio !== colegioFiltro) return false;
      return true;
    }).sort((a, b) => {
      const ordenPrioridad = { alta: 0, media: 1, baja: 2 };
      if (a.estatus !== b.estatus) {
        const ordenEstatus = { pendiente: 0, en_proceso: 1, completado: 2, cancelado: 3 };
        return ordenEstatus[a.estatus] - ordenEstatus[b.estatus];
      }
      if (ordenPrioridad[a.prioridad] !== ordenPrioridad[b.prioridad]) return ordenPrioridad[a.prioridad] - ordenPrioridad[b.prioridad];
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [pendientes, estatusFiltro, colegioFiltro]);

  const conteos = useMemo(() => {
    const c = { pendiente: 0, en_proceso: 0, completado: 0, cancelado: 0 };
    pendientes.forEach(p => { c[p.estatus]++; });
    return c;
  }, [pendientes]);

  if (isLoadingDocs || isLoading) return <LoadingBlock />;
  if (isError) return <ErrorBlock onRetry={() => refetch()} />;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex gap-2 flex-wrap">
          {(['Todos', 'pendiente', 'en_proceso', 'completado', 'cancelado'] as const).map(s => (
            <button
              key={s}
              onClick={() => setEstatusFiltro(s)}
              className={`px-3 py-1.5 rounded-full text-xs font-bold transition-colors ${
                estatusFiltro === s ? 'bg-[#00295A] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {s === 'Todos' ? `Todos (${pendientes.length})` : `${ESTATUS_CFG[s].label} (${conteos[s]})`}
            </button>
          ))}
        </div>
        <button
          onClick={() => setCreando(true)}
          className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-bold rounded-lg bg-[#ED7102] text-white hover:bg-[#d9640a]"
        >
          <Plus className="w-3.5 h-3.5" /> Nuevo pendiente
        </button>
      </div>

      <div className="mb-4">
        <select value={colegioFiltro} onChange={e => setColegioFiltro(e.target.value)}
          className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white">
          <option value="Todos">Todos los colegios</option>
          {colegios.map(c => <option key={c} value={c}>{c.replace('Mano Amiga ', '')}</option>)}
        </select>
      </div>

      {filtrados.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-10 text-center">
          <ListTodo className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-sm text-slate-500">No hay pendientes {estatusFiltro !== 'Todos' ? `en "${ESTATUS_CFG[estatusFiltro as Pendiente['estatus']].label}"` : 'registrados todavía'}.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtrados.map(p => {
            const prio = PRIORIDAD_CFG[p.prioridad];
            const est = ESTATUS_CFG[p.estatus];
            const vencido = p.fecha_limite && p.estatus !== 'completado' && p.estatus !== 'cancelado' && new Date(p.fecha_limite + 'T00:00:00') < new Date(new Date().setHours(0, 0, 0, 0));
            return (
              <div
                key={p.id}
                onClick={() => setAbierto(p)}
                className={`bg-white border border-slate-200 border-l-4 ${prio.border} rounded-lg px-4 py-3 cursor-pointer hover:shadow-sm transition-shadow`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-800 truncate">{p.titulo}</p>
                    {p.descripcion && <p className="text-xs text-slate-500 truncate mt-0.5">{p.descripcion}</p>}
                    <div className="flex flex-wrap items-center gap-3 mt-1.5 text-[11px] text-slate-400">
                      {p.colegio && <span>{p.colegio.replace('Mano Amiga ', '')}</span>}
                      {p.asignado_a && <span className="inline-flex items-center gap-1"><User className="w-3 h-3" /> {p.asignado_a}</span>}
                      {p.fecha_limite && (
                        <span className={`inline-flex items-center gap-1 ${vencido ? 'text-red-600 font-bold' : ''}`}>
                          <Calendar className="w-3 h-3" /> {formatFecha(p.fecha_limite)}{vencido ? ' (vencido)' : ''}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1.5 shrink-0">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${est.cls}`}>{est.label}</span>
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${prio.cls}`}>
                      <Flag className="w-2.5 h-2.5" /> {prio.label}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {abierto && <PendienteModal pendiente={abierto} colegios={colegios} onClose={() => setAbierto(null)} />}
      {creando && <NuevoPendienteModal colegios={colegios} onClose={() => setCreando(false)} />}
    </div>
  );
}


export default function CumplimientoNormativo() {
  const location = useLocation();
  const tabActivo = TABS.find(t => t.path === location.pathname) ?? TABS[0];
  const { data: docs = [], isLoading, isError, refetch } = useComplianceDocs();

  return (
    <div className="p-6 lg:p-8 max-w-[1700px] mx-auto">
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
          {tabActivo.path === '/cumplimiento/seguimiento' && <Seguimiento docs={docs} isLoading={isLoading} />}
        </>
      )}

      <div className="flex items-center justify-center gap-2 mt-6 text-xs text-slate-400">
        <ShieldCheck className="w-4 h-4" />
        Visible solo para ti por el momento
      </div>
    </div>
  );
}
