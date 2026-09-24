// Componentes compartidos del módulo Programa SOL.
import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { X, Search, Link2, Unlink, FileSignature, Loader2 } from 'lucide-react';
import StatusBadge from '@/components/shared/StatusBadge';
import { nivelSOL, NIVEL_META, fmtIndice, ciclosRecientes, cicloLabel, fechaCorta } from '@/lib/sol';
import type { DirectorioColegio } from '@/lib/directorio';
import { usePermissions } from '@/hooks/usePermissions';
import { useAuth } from '@/lib/AuthContext';

/** Único usuario que captura y edita datos SOL (la base de datos lo exige por RLS). */
export const SOL_ADMIN_EMAIL = 'rreyes@manoamiga.edu.mx';
export function useSolAdmin(): boolean {
  const { isAdmin } = usePermissions();
  const { user } = useAuth();
  return isAdmin && (user?.email ?? '').toLowerCase() === SOL_ADMIN_EMAIL;
}

export const inputCls  = 'w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-slate-900 focus:outline-none bg-white text-slate-900';
export const labelCls  = 'block text-xs font-bold text-slate-500 uppercase mb-1';
export const btnPrimary = 'inline-flex items-center justify-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-md text-sm font-bold hover:bg-slate-800 transition-all shadow-sm active:scale-95 disabled:opacity-50';
export const btnSecondary = 'inline-flex items-center justify-center gap-2 px-4 py-2 border border-slate-300 bg-white text-slate-700 rounded-md text-sm font-semibold hover:bg-slate-50 transition disabled:opacity-50';

/** Chip del semáforo SOL — siempre con número + texto, nunca solo color. */
export function SolChip({ valor, conTexto = false, className = '' }: { valor: number | null | undefined; conTexto?: boolean; className?: string }) {
  const n = nivelSOL(valor ?? null);
  const m = NIVEL_META[n];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-xs font-bold tabular-nums ${m.chip} ${className}`}>
      <span className={`w-2 h-2 rounded-full ${m.dot}`} />
      {fmtIndice(valor)}{conTexto && n !== 'na' && <span className="font-semibold">· {m.corto}</span>}
    </span>
  );
}

export function KpiSOL({ titulo, valor, detalle, icon: Icon, tono = 'slate' }: {
  titulo: string; valor: React.ReactNode; detalle?: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>; tono?: 'slate' | 'verde' | 'ambar' | 'rojo' | 'naranja';
}) {
  const tonos: Record<string, string> = {
    slate: 'bg-slate-100 text-slate-600', verde: 'bg-emerald-50 text-emerald-600', ambar: 'bg-amber-50 text-amber-600',
    rojo: 'bg-red-50 text-red-600', naranja: 'bg-orange-50 text-[#ED7102]',
  };
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{titulo}</p>
        {Icon && <span className={`w-8 h-8 rounded-lg flex items-center justify-center ${tonos[tono]}`}><Icon className="w-4 h-4" /></span>}
      </div>
      <p className="text-2xl font-black text-slate-900 mt-1 tabular-nums">{valor}</p>
      {detalle && <p className="text-xs text-slate-500 mt-0.5">{detalle}</p>}
    </div>
  );
}

export function CicloSelect({ value, onChange, className = '' }: { value: string; onChange: (v: string) => void; className?: string }) {
  const ciclos = ciclosRecientes(4);
  return (
    <select className={`${inputCls} ${className}`} value={value} onChange={e => onChange(e.target.value)}>
      {ciclos.map(c => <option key={c} value={c}>Ciclo {cicloLabel(c)}</option>)}
    </select>
  );
}

export function CampusSelect({ campus, value, onChange, todos = true, className = '' }: {
  campus: DirectorioColegio[]; value: string; onChange: (v: string) => void; todos?: boolean; className?: string;
}) {
  return (
    <select className={`${inputCls} ${className}`} value={value} onChange={e => onChange(e.target.value)}>
      {todos ? <option value="">Todos los campus</option> : <option value="" disabled>Elige campus…</option>}
      {campus.map(c => <option key={c.codigo} value={c.codigo}>{c.nombre}</option>)}
    </select>
  );
}

// ── Ticket MAS vinculado ─────────────────────────────────────────────────────
export interface TicketMasInfo {
  id: string; folio: string | null; estatus: string | null; nombre_proyecto: string | null;
  descripcion: string | null; colegio: string | null; created_at: string | null;
  proyecto_status: string | null; proyecto_id: string | null;
}

const TMAS_LABEL: Record<string, { label: string; cls: string }> = {
  pendiente:   { label: 'Ticket MAS pendiente',    cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  en_revision: { label: 'Ticket MAS en revisión',  cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  autorizado:  { label: 'Ticket MAS autorizado',   cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  rechazado:   { label: 'Ticket MAS rechazado',    cls: 'bg-red-50 text-red-700 border-red-200' },
  cancelado:   { label: 'Ticket MAS cancelado',    cls: 'bg-slate-100 text-slate-500 border-slate-300' },
};

/** Trae folio/estatus de los Ticket MAS vinculados y el estatus del proyecto que generaron. */
export function useTicketsMasInfo(ids: (string | null | undefined)[]) {
  const unicos = useMemo(() => Array.from(new Set(ids.filter(Boolean) as string[])).sort(), [ids]);
  return useQuery({
    queryKey: ['sol_tickets_mas_info', unicos],
    enabled: unicos.length > 0,
    queryFn: async () => {
      const { data: tm, error } = await supabase.from('tickets_mas')
        .select('id, folio, estatus, nombre_proyecto, descripcion, colegio, created_at').in('id', unicos);
      if (error) throw error;
      const folios = (tm ?? []).map(t => t.folio).filter(Boolean) as string[];
      const proy: Record<string, { status: string | null; id: string | null }> = {};
      if (folios.length) {
        const { data: tk } = await supabase.from('tickets').select('folio, proyecto_id').in('folio', folios);
        const pids = (tk ?? []).map(t => t.proyecto_id).filter(Boolean) as string[];
        const { data: pr } = pids.length ? await supabase.from('projects').select('id, status').in('id', pids) : { data: [] as { id: string; status: string }[] };
        for (const t of tk ?? []) {
          const p = (pr ?? []).find(x => x.id === t.proyecto_id);
          if (t.folio) proy[t.folio] = { status: p?.status ?? null, id: p?.id ?? null };
        }
      }
      const map: Record<string, TicketMasInfo> = {};
      for (const t of tm ?? []) {
        map[t.id] = { ...t, proyecto_status: t.folio ? proy[t.folio]?.status ?? null : null, proyecto_id: t.folio ? proy[t.folio]?.id ?? null : null } as TicketMasInfo;
      }
      return map;
    },
  });
}

export function TicketMasBadge({ info, compacto = false }: { info?: TicketMasInfo | null; compacto?: boolean }) {
  if (!info) return null;
  const e = TMAS_LABEL[info.estatus ?? 'pendiente'] ?? TMAS_LABEL.pendiente;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-bold ${e.cls}`}>
        <FileSignature className="w-3 h-3" />{info.folio ?? 'Sin folio'}{!compacto && <span className="font-semibold">· {e.label.replace('Ticket MAS ', '')}</span>}
      </span>
      {info.proyecto_status && (
        <span className="inline-flex items-center gap-1 text-[11px] text-slate-500">
          Proyecto: <StatusBadge status={info.proyecto_status} />
        </span>
      )}
    </div>
  );
}

/** Modal para que el administrador vincule un Ticket MAS ya existente (de Obras). */
export function TicketMasLinker({ abierto, onClose, colegio, colegioNombre, actualId, onSelect, guardando }: {
  abierto: boolean; onClose: () => void; colegio: string; colegioNombre: string;
  actualId: string | null; onSelect: (id: string | null) => void; guardando?: boolean;
}) {
  const [q, setQ] = useState('');
  const { data: tickets = [], isLoading } = useQuery({
    queryKey: ['sol_tickets_mas_campus', colegio, colegioNombre],
    enabled: abierto && !!colegio,
    queryFn: async () => {
      const { data, error } = await supabase.from('tickets_mas')
        .select('id, folio, estatus, nombre_proyecto, descripcion, colegio, created_at')
        .in('colegio', [colegioNombre, colegio])
        .order('created_at', { ascending: false }).limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });
  const filtrados = useMemo(() => {
    const n = q.trim().toLowerCase();
    if (!n) return tickets;
    return tickets.filter(t => [t.folio, t.nombre_proyecto, t.descripcion].some(x => String(x ?? '').toLowerCase().includes(n)));
  }, [tickets, q]);
  if (!abierto) return null;
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div>
            <h3 className="font-bold text-slate-900 flex items-center gap-2"><Link2 className="w-4 h-4" />Vincular Ticket MAS</h3>
            <p className="text-xs text-slate-500">Tickets MAS de {colegioNombre} (módulo de Obras)</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-md hover:bg-slate-100" aria-label="Cerrar"><X className="w-4 h-4" /></button>
        </div>
        <div className="px-5 py-3 border-b border-slate-100">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input className={inputCls + ' pl-9'} placeholder="Buscar por folio, proyecto o descripción…" value={q} onChange={e => setQ(e.target.value)} autoFocus />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
          {isLoading && <p className="p-6 text-sm text-slate-500 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />Cargando…</p>}
          {!isLoading && filtrados.length === 0 && <p className="p-6 text-sm text-slate-500 text-center">No hay Tickets MAS de este campus{q ? ' con esa búsqueda' : ''}.</p>}
          {filtrados.map(t => {
            const e = TMAS_LABEL[t.estatus ?? 'pendiente'] ?? TMAS_LABEL.pendiente;
            const sel = t.id === actualId;
            return (
              <button key={t.id} disabled={guardando} onClick={() => onSelect(t.id)}
                className={`w-full text-left px-5 py-3 hover:bg-slate-50 transition flex items-start gap-3 ${sel ? 'bg-emerald-50/60' : ''}`}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-sm text-slate-900">{t.folio ?? 'Sin folio'}</span>
                    <span className={`px-2 py-0.5 rounded-full border text-[10px] font-bold ${e.cls}`}>{e.label.replace('Ticket MAS ', '')}</span>
                    {sel && <span className="text-[10px] font-bold text-emerald-700">· Vinculado</span>}
                  </div>
                  <p className="text-sm text-slate-700 truncate">{t.nombre_proyecto || '—'}</p>
                  {t.descripcion && <p className="text-xs text-slate-500 line-clamp-2">{t.descripcion}</p>}
                </div>
                <span className="text-[11px] text-slate-400 shrink-0">{fechaCorta(t.created_at?.slice(0, 10))}</span>
              </button>
            );
          })}
        </div>
        <div className="px-5 py-3 border-t border-slate-100 flex justify-between gap-2">
          {actualId
            ? <button className={btnSecondary + ' text-red-600'} disabled={guardando} onClick={() => onSelect(null)}><Unlink className="w-4 h-4" />Quitar vínculo</button>
            : <span />}
          <button className={btnSecondary} onClick={onClose}>Cerrar</button>
        </div>
      </div>
    </div>
  );
}

/** Pill de estatus genérico para hallazgos/tarjetas. */
export function EstatusPill({ estatus }: { estatus: string }) {
  const map: Record<string, string> = {
    abierto: 'bg-red-50 text-red-700 border-red-200', pendiente: 'bg-red-50 text-red-700 border-red-200',
    en_proceso: 'bg-amber-50 text-amber-700 border-amber-200',
    cerrado: 'bg-emerald-50 text-emerald-700 border-emerald-200', resuelto: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  };
  const label: Record<string, string> = { abierto: 'Abierto', pendiente: 'Pendiente', en_proceso: 'En proceso', cerrado: 'Cerrado', resuelto: 'Resuelto' };
  return <span className={`inline-flex whitespace-nowrap px-2 py-0.5 rounded-full border text-[11px] font-bold ${map[estatus] ?? 'bg-slate-50 text-slate-500 border-slate-200'}`}>{label[estatus] ?? estatus}</span>;
}
