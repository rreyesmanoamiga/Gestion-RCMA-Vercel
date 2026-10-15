// Autorización (Vo. Bo.) de Gerencia para los Ticket MAS de FMA
// (OF. MTY, OF. CDMX y GENERAL). La usa quien tiene el permiso
// "Autorizar Ticket MAS de FMA (Gerencia)". Todo pasa por funciones de la base
// de datos que validan el permiso, el territorio y el estatus.
import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { CheckCircle2, Clock, Loader2, ShieldCheck, ArrowLeft, Ban } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { logAudit } from '@/lib/audit';
import PageHeader from '@/components/shared/PageHeader';

export interface TicketFMA {
  id: string; folio?: string; colegio?: string; territorio?: string; estatus?: string;
  nombre_solicitante?: string; puesto_solicitante?: string; correo_solicitante?: string;
  nombre_proyecto?: string; descripcion?: string; clasificacion?: string; periodicidad?: string;
  cot1_proveedor?: string; cot1_importe?: number | null; cot2_proveedor?: string; cot2_importe?: number | null;
  cot3_proveedor?: string; cot3_importe?: number | null; motivo_seleccion?: string; forma_financiamiento?: string;
  vobo_por?: string | null; vobo_at?: string | null; vobo_comentario?: string | null;
  fecha_autorizacion?: string | null; created_at?: string;
}

const ESTATUS: Record<string, string> = { pendiente: 'Pendiente', en_revision: 'En revisión', autorizado: 'Autorizado', cancelado: 'Cancelado', rechazado: 'Rechazado' };
const fmx = (n?: number | null) => (n != null ? Number(n).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' }) : '—');
const fecha = (d?: string | null) => (d ? format(new Date(d), "dd MMM yyyy, HH:mm", { locale: es }) : '—');
export const pendienteVoBo = (t: Pick<TicketFMA, 'estatus' | 'vobo_at'>) => !t.vobo_at && (t.estatus === 'pendiente' || t.estatus === 'en_revision');

/** Aviso por correo del Vo. Bo. (no bloquea si falla). */
export async function avisarVoBoFMA(tipo: 'pendiente' | 'vobo', t: TicketFMA, extra: { vobo_por?: string; comentario?: string } = {}) {
  const { data, error } = await supabase.functions.invoke('notify-ticket-mas-fma', {
    body: {
      tipo, folio: t.folio, colegio: t.colegio, proyecto: t.nombre_proyecto, descripcion: t.descripcion,
      solicitante: t.nombre_solicitante, correo_solicitante: t.correo_solicitante,
      proveedor: t.cot1_proveedor, importe: t.cot1_importe, forma_financiamiento: t.forma_financiamiento, ...extra,
    },
  });
  if (error || !(data as { success?: boolean })?.success) throw new Error((data as { error?: string })?.error ?? 'No se pudo enviar el aviso');
  return data as { para: string; copias: string[] };
}

/** Panel para dar el Vo. Bo. a un ticket (se usa en la vista de Gerencia y en el detalle normal). */
export function PanelVoBoFMA({ ticket, onHecho }: { ticket: TicketFMA; onHecho: (t: TicketFMA) => void }) {
  const [comentario, setComentario] = useState('');
  const [enviando, setEnviando] = useState(false);

  const autorizar = async () => {
    if (!window.confirm(`¿Autorizar (Vo. Bo. de Gerencia) el Ticket MAS ${ticket.folio}?`)) return;
    setEnviando(true);
    try {
      const { data, error } = await supabase.rpc('vobo_ticket_mas_fma', { p_id: ticket.id, p_comentario: comentario.trim() || null });
      if (error) throw error;
      const t = data as TicketFMA;
      await logAudit({
        accion: 'autorizar', modulo: 'tickets_mas', registro_id: ticket.id, registro_ref: ticket.folio ?? null,
        detalle: { tipo: 'Vo. Bo. Gerencia (FMA)', colegio: ticket.colegio, comentario: comentario.trim() || null },
      });
      try { await avisarVoBoFMA('vobo', { ...ticket, ...t }, { vobo_por: t.vobo_por ?? undefined, comentario: comentario.trim() || undefined }); }
      catch { toast.warning('Autorizado, pero no se pudo enviar el aviso por correo a la Coordinación.'); }
      toast.success(`Ticket ${ticket.folio} autorizado. La Coordinación RCMA ya puede completar el trámite.`);
      onHecho({ ...ticket, ...t });
    } catch (e: unknown) {
      toast.error((e as { message?: string })?.message ?? 'No se pudo autorizar');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <section className="bg-white rounded-xl border border-emerald-200 shadow-sm overflow-hidden">
      <div className="bg-emerald-700 text-white px-4 py-2.5 text-xs font-bold uppercase tracking-wider flex items-center gap-2">
        <ShieldCheck className="w-4 h-4" /> Autorización de Gerencia (Vo. Bo.)
      </div>
      <div className="p-4 space-y-3">
        <p className="text-sm text-slate-600">Al autorizar, tu nombre y la fecha quedan en el ticket, en su PDF y en la bitácora de Auditoría. Después la Coordinación RCMA registra el proyecto y abre el expediente.</p>
        <div>
          <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">Comentario (opcional)</label>
          <textarea className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm" rows={2} value={comentario} onChange={e => setComentario(e.target.value)}
            placeholder="Ej. Autorizado; ejecutar antes del cierre de mes." />
        </div>
        <button onClick={autorizar} disabled={enviando}
          className="w-full flex items-center justify-center gap-2 py-3 bg-emerald-600 text-white font-bold text-sm rounded-xl hover:bg-emerald-700 disabled:opacity-50 transition">
          {enviando ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />} Autorizar Ticket (Vo. Bo. Gerencia)
        </button>
        <p className="text-[11px] text-slate-400 text-center">Si no estás de acuerdo, no lo autorices y comunícalo a la Coordinación RCMA para cancelarlo o corregirlo.</p>
      </div>
    </section>
  );
}

/** Estado del Vo. Bo. para mostrar en el ticket. */
export function EstadoVoBoFMA({ ticket }: { ticket: TicketFMA }) {
  if (ticket.vobo_at) return (
    <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3 text-sm">
      <p className="font-bold text-emerald-800 flex items-center gap-2"><CheckCircle2 className="w-4 h-4" />Vo. Bo. de Gerencia: {ticket.vobo_por}</p>
      <p className="text-xs text-emerald-700 mt-0.5">{fecha(ticket.vobo_at)}{ticket.vobo_comentario ? ` · “${ticket.vobo_comentario}”` : ''}</p>
    </div>
  );
  if (ticket.estatus === 'cancelado') return null;
  return (
    <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm">
      <p className="font-bold text-amber-800 flex items-center gap-2"><Clock className="w-4 h-4" />Pendiente de Vo. Bo. de Gerencia</p>
      <p className="text-xs text-amber-700 mt-0.5">Es un ticket de FMA: lo autoriza Gerencia con su usuario antes de que la Coordinación complete la autorización.</p>
    </div>
  );
}

// ── Vista completa para Gerencia ───────────────────────────────────────────
export default function VoBoFMA() {
  const qc = useQueryClient();
  const [viendo, setViendo] = useState<TicketFMA | null>(null);
  const { data = [], isLoading, error } = useQuery({
    queryKey: ['tickets_mas_fma_vobo'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('tickets_mas_fma_para_vobo');
      if (error) throw error;
      return (data ?? []) as TicketFMA[];
    },
  });
  const pendientes = data.filter(pendienteVoBo);
  const resto = data.filter(t => !pendienteVoBo(t));

  if (viendo) {
    const t = viendo;
    return (
      <div className="max-w-4xl mx-auto p-4 space-y-5">
        <button onClick={() => setViendo(null)} className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"><ArrowLeft className="w-4 h-4" />Volver</button>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-lg font-black text-slate-800">Ticket {t.folio}</h1>
          <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-600 uppercase">{t.colegio}</span>
        </div>
        <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 space-y-4 text-sm">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[['Solicitante', t.nombre_solicitante], ['Puesto', t.puesto_solicitante], ['Enviado', fecha(t.created_at)], ['Clasificación', t.clasificacion], ['Periodicidad', t.periodicidad], ['Estatus', ESTATUS[t.estatus ?? ''] ?? t.estatus]].map(([k, v]) => (
              <div key={k} className="bg-slate-50 rounded-lg p-2.5"><p className="text-[10px] font-bold text-slate-400 uppercase">{k}</p><p className="text-xs text-slate-800 mt-0.5">{v || '—'}</p></div>
            ))}
          </div>
          {t.nombre_proyecto && <div><p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Proyecto</p><p className="font-bold text-[#00295A] bg-blue-50 rounded-lg p-3">{t.nombre_proyecto}</p></div>}
          <div><p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Descripción</p><p className="bg-slate-50 rounded-lg p-3 whitespace-pre-wrap">{t.descripcion || '—'}</p></div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[1, 2, 3].map(n => {
              const prov = (t as unknown as Record<string, string | undefined>)[`cot${n}_proveedor`];
              const imp = (t as unknown as Record<string, number | null | undefined>)[`cot${n}_importe`];
              return (
                <div key={n} className={`rounded-lg p-2.5 border ${n === 1 ? 'border-emerald-300 bg-emerald-50/50' : 'border-slate-200 bg-slate-50'}`}>
                  <p className="text-[10px] font-bold text-slate-500">COT. No. {n}{n === 1 ? ' · seleccionada' : ''}</p>
                  <p className="text-xs text-slate-700 mt-1">{prov || '—'}</p><p className="font-bold text-slate-900">{fmx(imp)}</p>
                </div>
              );
            })}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="bg-slate-50 rounded-lg p-2.5"><p className="text-[10px] font-bold text-slate-400 uppercase">Motivo de selección</p><p className="text-xs mt-0.5 whitespace-pre-wrap">{t.motivo_seleccion || '—'}</p></div>
            <div className="bg-slate-50 rounded-lg p-2.5"><p className="text-[10px] font-bold text-slate-400 uppercase">Forma de financiamiento</p><p className="text-xs mt-0.5">{t.forma_financiamiento || '—'}</p></div>
          </div>
        </section>
        {pendienteVoBo(t)
          ? <PanelVoBoFMA ticket={t} onHecho={act => { setViendo(act); qc.invalidateQueries({ queryKey: ['tickets_mas_fma_vobo'] }); }} />
          : <EstadoVoBoFMA ticket={t} />}
      </div>
    );
  }

  const Fila = ({ t }: { t: TicketFMA }) => (
    <button onClick={() => setViendo(t)} className="w-full text-left bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition p-4 flex flex-wrap items-center gap-3">
      <div className="flex-1 min-w-[220px]">
        <p className="font-black text-slate-900">{t.folio} <span className="text-xs font-semibold text-slate-500">· {t.colegio}</span></p>
        <p className="text-sm text-slate-700">{t.nombre_proyecto || t.descripcion || '—'}</p>
        <p className="text-xs text-slate-400">{t.nombre_solicitante} · {fecha(t.created_at)}</p>
      </div>
      <p className="font-bold text-slate-800 tabular-nums">{fmx(t.cot1_importe)}</p>
      {pendienteVoBo(t)
        ? <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200">Pendiente de tu Vo. Bo.</span>
        : t.estatus === 'cancelado'
          ? <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-slate-100 text-slate-500 border border-slate-200 flex items-center gap-1"><Ban className="w-3 h-3" />Cancelado</span>
          : <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">{t.vobo_at ? `Vo. Bo. ${t.vobo_por ?? ''}` : 'Autorizado'}</span>}
    </button>
  );

  return (
    <div className="max-w-5xl mx-auto p-4 space-y-5">
      <PageHeader title="Autorización Ticket MAS · FMA" subtitle="Tickets de OF. MTY, OF. CDMX y GENERAL que requieren el Vo. Bo. de Gerencia" />
      {isLoading ? <p className="text-slate-500 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />Cargando…</p>
        : error ? <p className="text-red-600 text-sm">{(error as Error).message}</p> : (
          <>
            <div>
              <p className="text-xs font-black uppercase tracking-widest text-slate-500 mb-2">Pendientes de autorizar ({pendientes.length})</p>
              {pendientes.length === 0 ? <p className="text-sm text-slate-400 bg-white rounded-xl border border-slate-200 p-6 text-center">No hay tickets pendientes de tu autorización.</p>
                : <div className="space-y-2">{pendientes.map(t => <Fila key={t.id} t={t} />)}</div>}
            </div>
            {resto.length > 0 && (
              <div>
                <p className="text-xs font-black uppercase tracking-widest text-slate-500 mb-2">Historial</p>
                <div className="space-y-2">{resto.map(t => <Fila key={t.id} t={t} />)}</div>
              </div>
            )}
          </>
        )}
    </div>
  );
}
