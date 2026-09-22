import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  ArrowLeft, Building2, FileSignature, Save, Trash2, ShieldCheck, ClipboardList,
} from 'lucide-react';
import StatusBadge from '@/components/shared/StatusBadge';
import { usePermissions } from '@/hooks/usePermissions';
import { logAudit } from '@/lib/audit';

const inputClass  = "w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-slate-900 focus:outline-none bg-white";
const btnOutline   = "inline-flex items-center gap-2 px-4 py-2 border border-slate-300 rounded-md text-sm font-bold text-slate-700 hover:bg-slate-50 transition-colors";
const btnPrimary   = "inline-flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-md text-sm font-bold hover:bg-slate-800 transition-colors";
const btnDanger    = "inline-flex items-center gap-2 px-4 py-2 border border-red-200 text-red-600 rounded-md text-sm font-bold hover:bg-red-50 transition-colors";

const fmx = (n?: number | null) =>
  n != null ? Number(n).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' }) : '—';

interface TramiteCN {
  id: string; folio?: string; colegio?: string; territorio?: string;
  concepto_nombre?: string; especificacion?: string; nombre_tramite?: string;
  descripcion?: string; estatus?: string; avance?: number;
  presupuesto?: number | null; costo_real?: number | null;
  responsable?: string; fecha_inicio?: string; fecha_compromiso?: string; fecha_completado?: string;
  notas?: string; solicitud_id?: string;
}

interface TicketMASCN { id: string; folio?: string; estatus?: string; fecha_elaboracion?: string; }

export default function TramiteCNDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { isAdmin, can } = usePermissions();
  const puedeEditar = isAdmin || can('editar_tramites_cn');
  const puedeGenerarTicket = isAdmin || can('enviar_ticket_mas_cn');

  const { data: tramite, isLoading } = useQuery({
    queryKey: ['compliance_tramites_cn', id],
    queryFn: async () => {
      const { data, error } = await supabase.from('compliance_tramites_cn').select('*').eq('id', id!).single();
      if (error) throw error;
      return data as TramiteCN;
    },
    enabled: !!id,
  });

  const { data: ticketsVinculados = [] } = useQuery({
    queryKey: ['tickets_mas_cn_por_tramite', id],
    queryFn: async () => {
      const { data, error } = await supabase.from('compliance_tickets_mas_cn')
        .select('id, folio, estatus, fecha_elaboracion').eq('tramite_id', id!).order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as TicketMASCN[];
    },
    enabled: !!id,
  });

  const [form, setForm] = useState({ estatus: '', avance: 0, presupuesto: '', costo_real: '', notas: '', fecha_compromiso: '' });

  useEffect(() => {
    if (tramite) {
      setForm({
        estatus: tramite.estatus ?? 'en_proceso',
        avance: tramite.avance ?? 0,
        presupuesto: tramite.presupuesto != null ? String(tramite.presupuesto) : '',
        costo_real: tramite.costo_real != null ? String(tramite.costo_real) : '',
        notas: tramite.notas ?? '',
        fecha_compromiso: tramite.fecha_compromiso ?? '',
      });
    }
  }, [tramite]);

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!puedeEditar) throw new Error('No tienes permiso para editar Trámites CN.');
      const payload: Record<string, unknown> = {
        estatus: form.estatus,
        avance: Math.max(0, Math.min(100, Number(form.avance) || 0)),
        presupuesto: form.presupuesto ? Number(form.presupuesto) : null,
        costo_real: form.costo_real ? Number(form.costo_real) : null,
        notas: form.notas.trim() || null,
        fecha_compromiso: form.fecha_compromiso || null,
        updated_at: new Date().toISOString(),
      };
      if (form.estatus === 'completado' && tramite?.estatus !== 'completado') {
        payload.fecha_completado = new Date().toISOString().slice(0, 10);
      }
      const { error } = await supabase.from('compliance_tramites_cn').update(payload).eq('id', id!);
      if (error) throw error;
      logAudit({ accion: 'editar', modulo: 'tramites_cn', registro_id: id ?? null, registro_ref: tramite?.folio ?? null, detalle: { estatus: form.estatus, avance: form.avance } });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['compliance_tramites_cn'] });
      toast.success('Trámite CN actualizado');
    },
    onError: (e: any) => toast.error(e.message ?? 'Error al guardar'),
  });

  const eliminarMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('compliance_tramites_cn').delete().eq('id', id!);
      if (error) throw error;
    },
    onSuccess: () => { toast.success('Trámite CN eliminado'); navigate('/cumplimiento/tramites'); },
  });

  if (isLoading) {
    return <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin" /></div>;
  }
  if (!tramite) {
    return <div className="text-center py-20 text-slate-400">Trámite CN no encontrado.</div>;
  }

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-4">
      <Link to="/cumplimiento/tramites" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft className="w-4 h-4" /> Volver a Trámites CN
      </Link>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-xs font-bold text-slate-500">{tramite.folio}</span>
              <StatusBadge status={tramite.estatus} />
            </div>
            <h1 className="text-lg font-black text-slate-900 mt-1">{tramite.nombre_tramite}</h1>
            <p className="text-sm text-slate-500 flex items-center gap-1 mt-0.5"><Building2 className="w-3.5 h-3.5" />{tramite.colegio} — {tramite.territorio}</p>
          </div>
          {puedeGenerarTicket && (
            <button onClick={() => navigate(`/cumplimiento/ticket-mas-cn?tramite_id=${tramite.id}`)} className={btnPrimary}>
              <FileSignature className="w-4 h-4" /> Generar Ticket MAS CN
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4 text-sm">
          <p><span className="text-slate-400 font-bold uppercase text-[11px] block">Concepto</span>{tramite.concepto_nombre}</p>
          <p><span className="text-slate-400 font-bold uppercase text-[11px] block">Especificación</span>{tramite.especificacion}</p>
          <p className="sm:col-span-2"><span className="text-slate-400 font-bold uppercase text-[11px] block">Descripción</span>{tramite.descripcion || '—'}</p>
          <p><span className="text-slate-400 font-bold uppercase text-[11px] block">Responsable</span>{tramite.responsable || '—'}</p>
          <p><span className="text-slate-400 font-bold uppercase text-[11px] block">Fecha de Inicio</span>{tramite.fecha_inicio || '—'}</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-4">
        <h2 className="text-xs font-black uppercase tracking-widest text-slate-500 flex items-center gap-2"><ShieldCheck className="w-4 h-4" /> Seguimiento</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-[11px] font-bold text-slate-500 uppercase block mb-1">Estatus</label>
            <select disabled={!puedeEditar} className={inputClass} value={form.estatus} onChange={e => setForm(p => ({ ...p, estatus: e.target.value }))}>
              <option value="en_proceso">En Proceso</option>
              <option value="completado">Completado</option>
              <option value="cancelado">Cancelado</option>
            </select>
          </div>
          <div>
            <label className="text-[11px] font-bold text-slate-500 uppercase block mb-1">Fecha Compromiso</label>
            <input type="date" disabled={!puedeEditar} className={inputClass} value={form.fecha_compromiso} onChange={e => setForm(p => ({ ...p, fecha_compromiso: e.target.value }))} />
          </div>
          <div>
            <label className="text-[11px] font-bold text-slate-500 uppercase block mb-1">Presupuesto</label>
            <input type="number" step="0.01" disabled={!puedeEditar} className={inputClass} value={form.presupuesto} onChange={e => setForm(p => ({ ...p, presupuesto: e.target.value }))} placeholder="$0.00" />
          </div>
          <div>
            <label className="text-[11px] font-bold text-slate-500 uppercase block mb-1">Costo Real</label>
            <input type="number" step="0.01" disabled={!puedeEditar} className={inputClass} value={form.costo_real} onChange={e => setForm(p => ({ ...p, costo_real: e.target.value }))} placeholder="$0.00" />
          </div>
          <div className="sm:col-span-2">
            <label className="text-[11px] font-bold text-slate-500 uppercase block mb-1">Avance ({form.avance}%)</label>
            <input type="range" min={0} max={100} disabled={!puedeEditar} value={form.avance} onChange={e => setForm(p => ({ ...p, avance: Number(e.target.value) }))} className="w-full" />
          </div>
          <div className="sm:col-span-2">
            <label className="text-[11px] font-bold text-slate-500 uppercase block mb-1">Notas</label>
            <textarea disabled={!puedeEditar} className={inputClass + ' h-20 resize-none'} value={form.notas} onChange={e => setForm(p => ({ ...p, notas: e.target.value }))} placeholder="Avances, pendientes, observaciones de seguimiento..." />
          </div>
        </div>
        <p className="text-[10px] text-slate-400 italic">
          Este seguimiento es independiente de Validación de Vigencias — la vigencia del documento se captura manualmente ahí cuando corresponda.
        </p>
        {puedeEditar && (
          <div className="flex justify-between items-center pt-2 border-t border-slate-100">
            {isAdmin && (
              <button onClick={() => { if (window.confirm('¿Eliminar este Trámite CN? Esta acción no se puede deshacer.')) eliminarMutation.mutate(); }} className={btnDanger}>
                <Trash2 className="w-4 h-4" /> Eliminar
              </button>
            )}
            <button onClick={() => updateMutation.mutate()} disabled={updateMutation.isPending} className={btnPrimary + ' ml-auto'}>
              <Save className="w-4 h-4" /> {updateMutation.isPending ? 'Guardando...' : 'Guardar Cambios'}
            </button>
          </div>
        )}
      </div>

      {ticketsVinculados.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <h2 className="text-xs font-black uppercase tracking-widest text-slate-500 flex items-center gap-2 mb-3"><ClipboardList className="w-4 h-4" /> Tickets MAS CN Generados</h2>
          <div className="space-y-2">
            {ticketsVinculados.map(t => (
              <div key={t.id} className="flex items-center justify-between text-sm border border-slate-100 rounded-lg px-3 py-2">
                <span className="font-mono text-xs font-bold text-slate-700">{t.folio}</span>
                <span className="text-xs text-slate-500">{t.fecha_elaboracion ? format(new Date(t.fecha_elaboracion), 'dd/MM/yyyy', { locale: es }) : '—'}</span>
                <StatusBadge status={t.estatus} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
