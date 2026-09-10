import React, { useState, useEffect, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabaseClient';
import { useScope } from '@/hooks/useScope';
import { Loader2, AlertTriangle, RefreshCw, X } from 'lucide-react';

export interface ComplianceDoc {
  id: string;
  colegio: string;
  territorio: string;
  materia: string | null;
  tipo_documento: string;
  norma: string | null;
  estado: string;
  vigente: string | null;
  fecha_limite_recepcion: string | null;
  fecha_presentacion: string | null;
  vigente_desde: string | null;
  vigente_hasta: string | null;
  responsable: string | null;
  año: number;
}

export const MATERIAS = ['Todas', 'Protección civil', 'Donatarias Autorizadas', 'Fiscal', 'Jurídico', 'Inmobiliaria', 'Gestión de Riesgos'] as const;
export const ESTADOS_EDITABLES = ['Pendiente', 'Solicitado', 'En Trámite', 'Verificado'];
export const PAGE_SIZE = 25;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function formatFecha(fecha: string | null): string {
  if (!fecha) return '—';
  const [y, m, d] = fecha.split('-');
  return `${d}/${m}/${y}`;
}

export function diasDiferencia(fecha: string, hoy: Date): number {
  const f = new Date(fecha + 'T00:00:00');
  return Math.round((f.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24));
}

export function esRetraso(d: ComplianceDoc, hoy: Date): boolean {
  if (d.estado === 'Verificado') return false;
  if (!d.fecha_limite_recepcion) return false;
  return new Date(d.fecha_limite_recepcion + 'T00:00:00') < hoy;
}

// Años que suma cada periodicidad. 'Único trámite' o una periodicidad
// desconocida regresa null (el documento nunca vence).
const AÑOS_POR_PERIODICIDAD: Record<string, number> = {
  'Anual': 1, 'Cada 2 años': 2, 'Cada 3 años': 3, 'Cada 4 años': 4, 'Cada 5 años': 5,
};

const DIAS_ANTICIPACION_FECHA_LIMITE = 21; // 3 semanas antes del vencimiento

export interface VigenciaCalculada {
  vigente_hasta: string | null;         // Vigente desde + periodicidad
  fecha_limite_recepcion: string | null; // vigente_hasta − 3 semanas
  vigente: 'Si' | 'No' | 'Por expirar' | null;
}

// A partir de "Vigente desde" (fecha de elaboración) + la periodicidad del
// concepto (o su excepción por colegio), calcula solo:
// - Vigente hasta (cuándo vence)
// - Fecha límite (3 semanas antes de que venza, para dar margen de gestión)
// - El semáforo Vigente: Sí / Por expirar (dentro de esas 3 semanas) / No (ya venció)
// "Único trámite" no vuelve a vencer — regresa vigente_hasta null y vigente "Si" fijo.
export function calcularVigencia(vigenteDesde: string | null, periodicidad: string | null | undefined, hoy: Date): VigenciaCalculada {
  if (!vigenteDesde) return { vigente_hasta: null, fecha_limite_recepcion: null, vigente: null };

  const años = periodicidad ? AÑOS_POR_PERIODICIDAD[periodicidad] : undefined;
  if (!años) {
    // "Único trámite": no vuelve a vencer, se queda vigente para siempre.
    return { vigente_hasta: null, fecha_limite_recepcion: null, vigente: 'Si' };
  }

  const desde = new Date(vigenteDesde + 'T00:00:00');
  const hasta = new Date(desde);
  hasta.setFullYear(hasta.getFullYear() + años);

  const limite = new Date(hasta);
  limite.setDate(limite.getDate() - DIAS_ANTICIPACION_FECHA_LIMITE);

  const toISO = (d: Date) => d.toISOString().slice(0, 10);

  let vigente: 'Si' | 'No' | 'Por expirar' = 'Si';
  if (hasta < hoy) vigente = 'No';
  else if (limite <= hoy) vigente = 'Por expirar';

  return { vigente_hasta: toISO(hasta), fecha_limite_recepcion: toISO(limite), vigente };
}

// ---------------------------------------------------------------------------
// Data hooks
// ---------------------------------------------------------------------------

export function useComplianceDocs() {
  const { filtrarPorAlcance } = useScope();
  const query = useQuery({
    queryKey: ['compliance_documentos'],
    queryFn: async () => {
      // Traer TODAS las filas por bloques — sin esto, Supabase corta en 1000
      // filas por default y los documentos más nuevos podrían desaparecer
      // en silencio, sin ningún error, conforme crece el catálogo.
      const bloque = 1000;
      let desde = 0;
      let todas: unknown[] = [];
      while (true) {
        const { data, error } = await supabase
          .from('compliance_documentos')
          .select('id, colegio, territorio, materia, tipo_documento, norma, estado, vigente, fecha_limite_recepcion, fecha_presentacion, vigente_desde, vigente_hasta, responsable, año')
          .eq('activo', true)
          .range(desde, desde + bloque - 1);
        if (error) throw error;
        todas = todas.concat(data ?? []);
        if (!data || data.length < bloque) break;
        desde += bloque;
      }
      return todas as unknown as ComplianceDoc[];
    },
    retry: 1,
  });

  const data = useMemo(
    () => filtrarPorAlcance(query.data ?? [], d => d.territorio, d => d.colegio),
    [query.data, filtrarPorAlcance]
  );

  return { ...query, data };
}

export function useUpdateDoc() {
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

export function useUpdateDocsBulk() {
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

// ---------------------------------------------------------------------------
// UI compartida
// ---------------------------------------------------------------------------

export function EstadoBadge({ estado }: { estado: string }) {
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

export function VigenteBadge({ vigente }: { vigente: string | null }) {
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

export function LoadingBlock() {
  return (
    <div className="flex items-center justify-center py-20 text-slate-400">
      <Loader2 className="w-5 h-5 animate-spin mr-2" /> Cargando datos de Compliance...
    </div>
  );
}

export function ErrorBlock({ onRetry }: { onRetry: () => void }) {
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

export function EstadoSelect({ doc, onSaved, className }: { doc: ComplianceDoc; onSaved: () => void; className?: string }) {
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

export function FechaPresentacionInput({ doc, onSaved }: { doc: ComplianceDoc; onSaved: () => void }) {
  const [valor, setValor] = useState(doc.fecha_presentacion ?? '');
  const updateDoc = useUpdateDoc();

  useEffect(() => { setValor(doc.fecha_presentacion ?? ''); }, [doc.fecha_presentacion]);

  const guardar = (nuevo: string) => {
    if (nuevo === (doc.fecha_presentacion ?? '')) return;
    updateDoc.mutate(
      { id: doc.id, patch: { fecha_presentacion: nuevo || null } },
      { onSuccess: () => { toast.success('Fecha de presentación actualizada'); onSaved(); } }
    );
  };

  return (
    <input
      type="date"
      value={valor}
      onClick={e => e.stopPropagation()}
      onChange={e => { setValor(e.target.value); guardar(e.target.value); }}
      className="w-full px-2 py-1 text-xs border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-[#00295A]/30"
    />
  );
}

export function ResponsableInput({ doc, onSaved }: { doc: ComplianceDoc; onSaved: () => void }) {
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
// Modal de detalle — formulario completo, reusado por Documentos y Alertas
// ---------------------------------------------------------------------------

export function DetalleModal({ doc, onClose, onSaved, periodicidad }: { doc: ComplianceDoc; onClose: () => void; onSaved: () => void; periodicidad?: string }) {
  const updateDoc = useUpdateDoc();

  const [form, setForm] = useState({
    estado: doc.estado,
    materia: doc.materia ?? '',
    norma: doc.norma ?? '',
    fecha_presentacion: doc.fecha_presentacion ?? '',
    vigente_desde: doc.vigente_desde ?? '',
    año: String(doc.año ?? ''),
    responsable: doc.responsable ?? '',
  });

  const set = (campo: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [campo]: e.target.value }));

  const hoy = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);
  const vigencia = useMemo(
    () => calcularVigencia(form.vigente_desde || null, periodicidad, hoy),
    [form.vigente_desde, periodicidad, hoy]
  );

  const guardarTodo = () => {
    const patch: Partial<ComplianceDoc> = {
      estado: form.estado,
      vigente: vigencia.vigente,
      materia: form.materia || null,
      norma: form.norma.trim() || null,
      fecha_limite_recepcion: vigencia.fecha_limite_recepcion,
      fecha_presentacion: form.fecha_presentacion || null,
      vigente_desde: form.vigente_desde || null,
      vigente_hasta: vigencia.vigente_hasta,
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
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">{doc.colegio} · {doc.territorio}</p>
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
              <label className={labelCls}>Vigente (automático)</label>
              <div className={`${inputCls} bg-slate-50 flex items-center font-bold ${
                vigencia.vigente === 'No' ? 'text-red-600' : vigencia.vigente === 'Por expirar' ? 'text-amber-600' : vigencia.vigente === 'Si' ? 'text-emerald-600' : 'text-slate-400'
              }`}>
                {vigencia.vigente === 'Si' ? 'Sí' : vigencia.vigente ?? '— Captura Vigente desde —'}
              </div>
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
                <option value="">Sin especificar</option>
                {MATERIAS.filter(m => m !== 'Todas').map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Norma / referencia</label>
              <input value={form.norma} onChange={set('norma')} disabled={updateDoc.isPending} placeholder="—" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Fecha de presentación <span className="normal-case font-normal">(cuándo se sube al portal)</span></label>
              <input type="date" value={form.fecha_presentacion} onChange={set('fecha_presentacion')} disabled={updateDoc.isPending} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Año</label>
              <input type="number" value={form.año} onChange={set('año')} disabled={updateDoc.isPending} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Vigente desde <span className="normal-case font-normal">(fecha de elaboración)</span></label>
              <input type="date" value={form.vigente_desde} onChange={set('vigente_desde')} disabled={updateDoc.isPending} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Vigente hasta (automático)</label>
              <div className={`${inputCls} bg-slate-50 text-slate-500`}>
                {vigencia.vigente_hasta ? formatFecha(vigencia.vigente_hasta) : (form.vigente_desde ? 'No vence (trámite único)' : '—')}
              </div>
            </div>
          </div>

          {periodicidad && (
            <div className={`rounded-lg px-3 py-2.5 border ${vigencia.vigente === 'No' || vigencia.vigente === 'Por expirar' ? 'bg-amber-50 border-amber-200' : 'bg-slate-50 border-slate-200'}`}>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Periodicidad: {periodicidad}</p>
              <p className="text-xs mt-0.5">
                {!form.vigente_desde
                  ? 'Captura "Vigente desde" para calcular vencimiento y fecha límite automáticamente'
                  : vigencia.fecha_limite_recepcion
                    ? <>Fecha límite: <strong>{formatFecha(vigencia.fecha_limite_recepcion)}</strong> (3 semanas antes de vencer) · Vence: <strong>{formatFecha(vigencia.vigente_hasta)}</strong></>
                    : 'Trámite único — no vuelve a vencer'}
              </p>
            </div>
          )}
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
