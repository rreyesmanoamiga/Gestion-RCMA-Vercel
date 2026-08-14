import React, { useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabaseClient';
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
  vigente_desde: string | null;
  vigente_hasta: string | null;
  responsable: string | null;
  año: number;
}

export const MATERIAS = ['Todas', 'Protección civil', 'Donatarias Autorizadas', 'Sin categoría'] as const;
export const ESTADOS_EDITABLES = ['Pendiente', 'Por revisar', 'Verificado', 'Observaciones'];
export const PAGE_SIZE = 25;

// Mapeo "Mano Amiga X" (usado en compliance_documentos) -> código corto
// "MA XXX" (usado en user_permissions y en el resto del sistema, ver
// src/lib/colegios.ts). Necesario para cruzar usuarios por colegio.
export const COLEGIO_A_CODIGO: Record<string, string> = {
  'Mano Amiga Acapulco': 'MA ACA',
  'Mano Amiga Aguascalientes': 'MA AGS',
  'Mano Amiga Cancún': 'MA CAN',
  'Mano Amiga Chalco': 'MA CHA',
  'Mano Amiga Conkal': 'MA CON',
  'Mano Amiga Guadalajara': 'MA GDL',
  'Mano Amiga La Cima': 'MA CIM',
  'Mano Amiga León': 'MA LEO',
  'Mano Amiga Lerma': 'MA LER',
  'Mano Amiga Monterrey': 'MA MTY',
  'Mano Amiga Morelia': 'MA MOR',
  'Mano Amiga Piedras Negras': 'MA PIE',
  'Mano Amiga Puebla': 'MA PUE',
  'Mano Amiga Querétaro': 'MA QRO',
  'Mano Amiga Santa Catarina': 'MA SCA',
  'Mano Amiga Tapachula': 'MA TAP',
  'Mano Amiga Tijuana': 'MA TIJ',
  'Mano Amiga Torreón': 'MA TOR',
  'Mano Amiga Villas de San Juan': 'MA VSJ',
  'Mano Amiga Zomeyucán': 'MA ZOM',
};

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

// ---------------------------------------------------------------------------
// Data hooks
// ---------------------------------------------------------------------------

export function useComplianceDocs() {
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

export function DetalleModal({ doc, onClose, onSaved }: { doc: ComplianceDoc; onClose: () => void; onSaved: () => void }) {
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
