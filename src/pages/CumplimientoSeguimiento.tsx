import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/lib/AuthContext';
import PageHeader from '@/components/shared/PageHeader';
import {
  Loader2, X, Plus, MessageSquare, Trash2, Flag, User, Calendar, ListTodo,
} from 'lucide-react';
import { useComplianceDocs, formatFecha, LoadingBlock, ErrorBlock } from '@/lib/complianceShared';

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
  pendiente:  { label: 'Pendiente',  cls: 'bg-orange-100 text-orange-700 border-orange-200' },
  en_proceso: { label: 'En proceso', cls: 'bg-sky-100 text-sky-700 border-sky-200' },
  completado: { label: 'Completado', cls: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  cancelado:  { label: 'Cancelado',  cls: 'bg-slate-100 text-slate-500 border-slate-200' },
};

function usePendientes() {
  return useQuery({
    queryKey: ['compliance_pendientes'],
    queryFn: async () => {
      const { data, error } = await supabase.from('compliance_pendientes').select('*').order('created_at', { ascending: false });
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
      const { data, error } = await supabase.from('compliance_comentarios').select('*').eq('pendiente_id', pendienteId).order('created_at');
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

function PendienteModal({ pendiente, colegios, onClose }: { pendiente: Pendiente; colegios: string[]; onClose: () => void }) {
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
            <textarea value={form.descripcion} onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))} rows={2} className={inputCls + ' resize-none'} placeholder="Detalle del pendiente..." />
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
            <label className={labelCls}><span className="inline-flex items-center gap-1"><MessageSquare className="w-3 h-3" /> Notas y seguimiento</span></label>
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

export default function CumplimientoSeguimiento() {
  const { data: docs = [], isLoading: isLoadingDocs } = useComplianceDocs();
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

  return (
    <div className="p-6 lg:p-8 max-w-[1700px] mx-auto">
      <PageHeader title="Seguimiento" subtitle="Pendientes, notas y control de avance sobre la documentación de Cumplimiento" />

      {isLoadingDocs || isLoading ? <LoadingBlock /> : isError ? <ErrorBlock onRetry={() => refetch()} /> : (
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
            <button onClick={() => setCreando(true)} className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-bold rounded-lg bg-[#ED7102] text-white hover:bg-[#d9640a]">
              <Plus className="w-3.5 h-3.5" /> Nuevo pendiente
            </button>
          </div>

          <div className="mb-4">
            <select value={colegioFiltro} onChange={e => setColegioFiltro(e.target.value)} className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white">
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
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${prio.cls}`}><Flag className="w-2.5 h-2.5" /> {prio.label}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {abierto && <PendienteModal pendiente={abierto} colegios={colegios} onClose={() => setAbierto(null)} />}
      {creando && <NuevoPendienteModal colegios={colegios} onClose={() => setCreando(false)} />}
    </div>
  );
}
