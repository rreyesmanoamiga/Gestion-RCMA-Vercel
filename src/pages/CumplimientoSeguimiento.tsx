import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/lib/AuthContext';
import PageHeader from '@/components/shared/PageHeader';
import {
  Plus, Search, Pin, Pencil, Trash2, X, FileText, ListChecks, Users,
  ClipboardList, Clock, AlertCircle, CheckCircle2, MessageSquare, Loader2,
} from 'lucide-react';
import { useComplianceDocs, LoadingBlock, ErrorBlock, COLEGIO_A_CODIGO } from '@/lib/complianceShared';

// ---------------------------------------------------------------------------
// Modelo de datos (mismo patrón que NEXUS, tablas compliance_*)
// ---------------------------------------------------------------------------

interface Nota {
  id: string; titulo: string; contenido: string; categoria: string; color: string;
  fijada: boolean; colegio: string | null; territorio: string | null;
  created_at: string; updated_at: string;
}
interface Pendiente {
  id: string; titulo: string; descripcion: string | null; tipo: 'personal' | 'compartido';
  asignado_a: string | null; asignado_nombre: string | null;
  prioridad: 'urgente' | 'alta' | 'normal' | 'baja';
  fecha_limite: string | null; estatus: 'pendiente' | 'en_proceso' | 'completado' | 'cancelado';
  colegio: string | null; territorio: string | null; documento_id: string | null;
  created_by: string | null; created_at: string; updated_at: string;
}
interface Seguimiento {
  id: string; colegio: string; territorio: string | null; resumen: string;
  estatus: 'activo' | 'completado'; completado_at: string | null; created_at: string;
}
interface Comentario {
  id: string; pendiente_id: string | null; seguimiento_id: string | null;
  autor_email: string | null; autor_nombre: string | null; contenido: string; created_at: string;
}
interface SysUser { user_email: string; nombre: string | null; territorio: string | null; colegio: string | null; puesto: string | null; }

const CATEGORIAS = ['General', 'Importante', 'Ideas', 'Recordatorios', 'Colegios', 'Personal'];
const COLORES = ['#0f172a', '#0d8a7e', '#2563eb', '#7c3aed', '#db2777', '#ea580c', '#16a34a', '#d97706'];

const PRIO_CFG: Record<string, { label: string; cls: string; cardLeft: string }> = {
  urgente: { label: '🔴 Urgente', cls: 'bg-red-100 text-red-700 border-red-200',    cardLeft: 'border-l-red-500' },
  alta:    { label: '🟠 Alta',    cls: 'bg-orange-100 text-orange-700 border-orange-200', cardLeft: 'border-l-orange-400' },
  normal:  { label: '🔵 Normal',  cls: 'bg-blue-100 text-blue-700 border-blue-200',   cardLeft: 'border-l-blue-400' },
  baja:    { label: '⚪ Baja',    cls: 'bg-slate-100 text-slate-500 border-slate-200', cardLeft: 'border-l-slate-300' },
};
const EST_CFG: Record<string, { label: string; icon: React.ReactNode; cls: string }> = {
  pendiente:  { label: 'Pendiente',  icon: <Clock className="w-3 h-3" />,        cls: 'bg-amber-100 text-amber-700 border-amber-200' },
  en_proceso: { label: 'En Proceso', icon: <AlertCircle className="w-3 h-3" />,  cls: 'bg-blue-100 text-blue-700 border-blue-200' },
  completado: { label: 'Completado', icon: <CheckCircle2 className="w-3 h-3" />, cls: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  cancelado:  { label: 'Cancelado',  icon: <X className="w-3 h-3" />,            cls: 'bg-slate-100 text-slate-500 border-slate-200' },
};

const fmtDate = (d?: string | null) => d ? format(new Date(d.includes('T') ? d : d + 'T12:00:00'), "d MMM yyyy", { locale: es }) : '—';
const fmtFull = (d?: string | null) => d ? format(new Date(d), "d MMM yyyy HH:mm", { locale: es }) : '—';
const inputCls = "w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-slate-900 focus:outline-none bg-white";
const btnPrimary = "px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-semibold hover:bg-slate-800 disabled:opacity-40 transition";
const btnOutline = "px-4 py-2 border border-slate-300 rounded-lg text-sm font-semibold text-slate-700 hover:bg-slate-100 transition";

// ---------------------------------------------------------------------------
// Modal genérico
// ---------------------------------------------------------------------------
function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className={`bg-white rounded-xl shadow-2xl w-full ${wide ? 'max-w-xl' : 'max-w-md'} max-h-[90vh] overflow-y-auto`} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-slate-50 rounded-t-xl sticky top-0 z-10">
          <h3 className="text-base font-bold text-slate-900">{title}</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-400"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Comentarios (reusado por Pendientes y Seguimientos)
// ---------------------------------------------------------------------------
function Comentarios({ targetField, targetId }: { targetField: 'pendiente_id' | 'seguimiento_id'; targetId: string }) {
  const { user } = useAuth();
  const autorEmail = user?.email ?? '';
  const autorNombre = (user as any)?.user_metadata?.nombre || user?.email || 'Usuario';
  const queryClient = useQueryClient();
  const [texto, setTexto] = useState('');
  const queryKey = ['compliance_comentarios', targetField, targetId];

  const { data: comentarios = [] } = useQuery({
    queryKey,
    queryFn: async () => {
      const { data, error } = await supabase.from('compliance_comentarios').select('*').eq(targetField, targetId).order('created_at');
      if (error) throw error;
      return (data ?? []) as Comentario[];
    },
    refetchInterval: 15000,
  });

  const enviar = useMutation({
    mutationFn: async (contenido: string) => {
      const { error } = await supabase.from('compliance_comentarios').insert({
        [targetField]: targetId, autor_email: autorEmail, autor_nombre: autorNombre, contenido,
      });
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey }); setTexto(''); },
    onError: (err: any) => toast.error(err?.message ?? 'No se pudo enviar el comentario'),
  });

  const eliminar = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('compliance_comentarios').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  return (
    <div>
      <div className="space-y-2 max-h-56 overflow-y-auto mb-3 pr-1">
        {comentarios.length === 0 && <p className="text-xs text-slate-400 text-center py-4">Sin comentarios aún.</p>}
        {comentarios.map(c => (
          <div key={c.id} className="group relative bg-slate-50 border border-slate-100 rounded-xl px-3 py-2">
            <p className="text-[10px] font-bold text-slate-500 mb-0.5">{c.autor_nombre}</p>
            <p className="text-sm text-slate-800 whitespace-pre-wrap">{c.contenido}</p>
            <p className="text-[10px] text-slate-400 mt-1">{fmtFull(c.created_at)}</p>
            {c.autor_email === autorEmail && (
              <button onClick={() => { if (confirm('¿Eliminar este comentario?')) eliminar.mutate(c.id); }}
                className="absolute -top-2 -right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-white text-red-500 hover:text-red-700 rounded-full p-1 shadow border border-slate-200">
                <Trash2 className="w-3 h-3" />
              </button>
            )}
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <textarea
          value={texto} onChange={e => setTexto(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (texto.trim()) enviar.mutate(texto.trim()); } }}
          placeholder="Escribe una nota o actualización..." rows={2}
          className="flex-1 text-sm border border-slate-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-[#00295A]/20"
        />
        <button onClick={() => texto.trim() && enviar.mutate(texto.trim())} disabled={enviar.isPending || !texto.trim()}
          className="px-3 rounded-lg bg-[#00295A] text-white text-xs font-bold disabled:opacity-40 hover:bg-[#003a7a]">
          {enviar.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Enviar'}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Página principal
// ---------------------------------------------------------------------------
export default function CumplimientoSeguimiento() {
  const { user } = useAuth();
  const autorEmail = user?.email ?? '';
  const autorNombre = (user as any)?.user_metadata?.nombre || user?.email || 'Usuario';
  const queryClient = useQueryClient();
  const { data: docs = [] } = useComplianceDocs();
  const colegios = useMemo(() => Array.from(new Set(docs.map(d => d.colegio))).sort(), [docs]);

  const [tab, setTab] = useState<'notas' | 'personales' | 'compartidos' | 'seguimiento'>('notas');
  const [search, setSearch] = useState('');

  // ── Queries ──────────────────────────────────────────────────────────
  const { data: notas = [], isLoading: lNotas, isError: eNotas, refetch: rNotas } = useQuery({
    queryKey: ['compliance_notas'],
    queryFn: async () => {
      const { data, error } = await supabase.from('compliance_notas').select('*').order('fijada', { ascending: false }).order('updated_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as Nota[];
    },
  });

  const { data: pendientes = [], isLoading: lPend, isError: ePend, refetch: rPend } = useQuery({
    queryKey: ['compliance_pendientes'],
    queryFn: async () => {
      const { data, error } = await supabase.from('compliance_pendientes').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as Pendiente[];
    },
  });

  const { data: seguimientos = [], isLoading: lSeg, isError: eSeg, refetch: rSeg } = useQuery({
    queryKey: ['compliance_seguimientos'],
    queryFn: async () => {
      const { data, error } = await supabase.from('compliance_seguimientos').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as Seguimiento[];
    },
  });

  const filteredNotas = useMemo(() => notas.filter(n => !search || n.titulo.toLowerCase().includes(search.toLowerCase()) || (n.contenido ?? '').toLowerCase().includes(search.toLowerCase())), [notas, search]);
  const pendPersonales = useMemo(() => pendientes.filter(p => p.tipo === 'personal'), [pendientes]);
  const pendCompartidos = useMemo(() => pendientes.filter(p => p.tipo === 'compartido'), [pendientes]);
  const seguimientosActivos = useMemo(() => seguimientos.filter(s => s.estatus === 'activo'), [seguimientos]);

  const kpis = useMemo(() => ({
    total: pendientes.length,
    activos: pendientes.filter(p => p.estatus !== 'completado' && p.estatus !== 'cancelado').length,
    personales: pendPersonales.length,
    compartidos: pendCompartidos.length,
    completados: pendientes.filter(p => p.estatus === 'completado').length,
    urgentes: pendientes.filter(p => p.prioridad === 'urgente' && p.estatus !== 'completado').length,
    enSeguimiento: seguimientosActivos.length,
  }), [pendientes, pendPersonales, pendCompartidos, seguimientosActivos]);

  // ── Mutaciones: Notas ────────────────────────────────────────────────
  const [showNota, setShowNota] = useState(false);
  const [editNota, setEditNota] = useState<Nota | null>(null);
  const [viewNota, setViewNota] = useState<Nota | null>(null);
  const [notaConColegio, setNotaConColegio] = useState(false);
  const [notaForm, setNotaForm] = useState({ titulo: '', contenido: '', categoria: 'General', color: '#0f172a', fijada: false, territorio: '', colegio: '' });

  const openNota = (n?: Nota) => {
    setEditNota(n ?? null);
    setNotaConColegio(!!n?.colegio);
    setNotaForm(n ? { titulo: n.titulo, contenido: n.contenido ?? '', categoria: n.categoria, color: n.color, fijada: n.fijada, territorio: n.territorio ?? '', colegio: n.colegio ?? '' }
                  : { titulo: '', contenido: '', categoria: 'General', color: '#0f172a', fijada: false, territorio: '', colegio: '' });
    setShowNota(true);
  };

  const guardarNota = useMutation({
    mutationFn: async () => {
      if (!notaForm.titulo.trim()) throw new Error('Escribe un título');
      const payload = {
        titulo: notaForm.titulo.trim(), contenido: notaForm.contenido.trim() || null,
        categoria: notaForm.categoria, color: notaForm.color, fijada: notaForm.fijada,
        colegio: notaConColegio ? (notaForm.colegio || null) : null,
        territorio: notaConColegio ? (notaForm.territorio || null) : null,
      };
      if (editNota) {
        const { error } = await supabase.from('compliance_notas').update(payload).eq('id', editNota.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('compliance_notas').insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['compliance_notas'] }); toast.success(editNota ? 'Nota actualizada' : 'Nota creada'); setShowNota(false); },
    onError: (err: any) => toast.error(err?.message ?? 'No se pudo guardar'),
  });

  const eliminarNota = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from('compliance_notas').delete().eq('id', id); if (error) throw error; },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['compliance_notas'] }); toast.success('Nota eliminada'); },
  });

  // ── Mutaciones: Pendientes ───────────────────────────────────────────
  const [showPend, setShowPend] = useState(false);
  const [editPend, setEditPend] = useState<Pendiente | null>(null);
  const [viewPend, setViewPend] = useState<Pendiente | null>(null);
  const [pendForm, setPendForm] = useState({
    titulo: '', descripcion: '', tipo: 'personal' as 'personal' | 'compartido',
    asignado_a: '', asignado_nombre: '', prioridad: 'normal' as Pendiente['prioridad'],
    fecha_limite: '', estatus: 'pendiente' as Pendiente['estatus'], colegio: '', territorio: '',
  });

  // Usuarios del sistema (para "Compartidos") — misma fuente que NEXUS.
  // La notificación por correo se activa después; por ahora solo se guarda
  // a quién se asignó.
  const { data: allUsers = [] } = useQuery({
    queryKey: ['sys_users_compliance'],
    queryFn: async () => {
      const { data, error } = await supabase.from('user_permissions').select('user_email, nombre, territorio, colegio, puesto').neq('user_email', autorEmail);
      if (error) throw error;
      return (data ?? []) as SysUser[];
    },
  });

  const usuariosPorGrupo = useMemo(() => {
    const codigoColegio = COLEGIO_A_CODIGO[pendForm.colegio];
    const colegioObj = docs.find(d => d.colegio === pendForm.colegio);
    const territorioSel = colegioObj?.territorio;
    const fmaUsers = allUsers.filter(u => u.territorio === 'FMA');
    const colegioUsers = codigoColegio
      ? allUsers.filter(u => u.colegio === codigoColegio)
      : territorioSel
        ? allUsers.filter(u => u.territorio === territorioSel)
        : [];
    return { colegioUsers, fmaUsers };
  }, [allUsers, pendForm.colegio, docs]);
  const todosUsuarios = [...usuariosPorGrupo.colegioUsers, ...usuariosPorGrupo.fmaUsers];

  const openPend = (p?: Pendiente) => {
    setEditPend(p ?? null);
    setPendForm(p
      ? { titulo: p.titulo, descripcion: p.descripcion ?? '', tipo: p.tipo, asignado_a: p.asignado_a ?? '', asignado_nombre: p.asignado_nombre ?? '', prioridad: p.prioridad, fecha_limite: p.fecha_limite ?? '', estatus: p.estatus, colegio: p.colegio ?? '', territorio: p.territorio ?? '' }
      : { titulo: '', descripcion: '', tipo: tab === 'compartidos' ? 'compartido' : 'personal', asignado_a: '', asignado_nombre: '', prioridad: 'normal', fecha_limite: '', estatus: 'pendiente', colegio: '', territorio: '' });
    setShowPend(true);
  };

  const guardarPend = useMutation({
    mutationFn: async () => {
      if (!pendForm.titulo.trim()) throw new Error('Escribe un título');
      const colegioObj = docs.find(d => d.colegio === pendForm.colegio);
      const payload = {
        titulo: pendForm.titulo.trim(), descripcion: pendForm.descripcion.trim() || null,
        tipo: pendForm.tipo, asignado_a: pendForm.asignado_a.trim() || null, asignado_nombre: pendForm.asignado_nombre.trim() || null,
        prioridad: pendForm.prioridad, fecha_limite: pendForm.fecha_limite || null, estatus: pendForm.estatus,
        colegio: pendForm.colegio || null, territorio: colegioObj?.territorio ?? (pendForm.territorio || null),
      };
      if (editPend) {
        const { error } = await supabase.from('compliance_pendientes').update(payload).eq('id', editPend.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('compliance_pendientes').insert({ ...payload, created_by: autorEmail });
        if (error) throw error;
      }
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['compliance_pendientes'] }); toast.success(editPend ? 'Pendiente actualizado' : 'Pendiente creado'); setShowPend(false); },
    onError: (err: any) => toast.error(err?.message ?? 'No se pudo guardar'),
  });

  const eliminarPend = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from('compliance_pendientes').delete().eq('id', id); if (error) throw error; },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['compliance_pendientes'] }); toast.success('Pendiente eliminado'); },
  });

  const cambiarEstatusPend = useMutation({
    mutationFn: async ({ id, estatus }: { id: string; estatus: Pendiente['estatus'] }) => {
      const { error } = await supabase.from('compliance_pendientes').update({ estatus }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['compliance_pendientes'] }),
  });

  // ── Mutaciones: Seguimiento ──────────────────────────────────────────
  const [showSeg, setShowSeg] = useState(false);
  const [viewSeg, setViewSeg] = useState<Seguimiento | null>(null);
  const [segForm, setSegForm] = useState({ colegio: '', resumen: '' });

  const crearSeg = useMutation({
    mutationFn: async () => {
      if (!segForm.colegio) throw new Error('Elige un colegio');
      if (!segForm.resumen.trim()) throw new Error('Escribe un resumen del seguimiento');
      const colegioObj = docs.find(d => d.colegio === segForm.colegio);
      const { error } = await supabase.from('compliance_seguimientos').insert({
        colegio: segForm.colegio, territorio: colegioObj?.territorio ?? null, resumen: segForm.resumen.trim(), estatus: 'activo',
      });
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['compliance_seguimientos'] }); toast.success('Seguimiento creado'); setShowSeg(false); setSegForm({ colegio: '', resumen: '' }); },
    onError: (err: any) => toast.error(err?.message ?? 'No se pudo crear'),
  });

  const completarSeg = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('compliance_seguimientos').update({ estatus: 'completado', completado_at: new Date().toISOString() }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['compliance_seguimientos'] }); toast.success('Marcado como completado'); setViewSeg(null); },
  });

  const eliminarSeg = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from('compliance_seguimientos').delete().eq('id', id); if (error) throw error; },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['compliance_seguimientos'] }); toast.success('Seguimiento eliminado'); setViewSeg(null); },
  });

  const isLoading = lNotas || lPend || lSeg;
  const isError = eNotas || ePend || eSeg;
  const refetchAll = () => { rNotas(); rPend(); rSeg(); };

  // ── Tarjeta de pendiente ─────────────────────────────────────────────
  const PendGrid = ({ items }: { items: Pendiente[] }) => (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {items.map(p => {
        const pCfg = PRIO_CFG[p.prioridad];
        const eCfg = EST_CFG[p.estatus];
        return (
          <div key={p.id} className={`bg-white rounded-xl border border-slate-200 border-l-4 ${pCfg.cardLeft} shadow-sm overflow-hidden cursor-pointer hover:shadow-md transition`} onClick={() => setViewPend(p)}>
            <div className="p-4">
              <div className="flex items-start justify-between mb-2">
                <h3 className="font-bold text-slate-900 text-sm flex-1 min-w-0 truncate">{p.titulo}</h3>
                <div className="flex gap-1 ml-2 shrink-0" onClick={e => e.stopPropagation()}>
                  <button onClick={() => openPend(p)} className="p-1 text-slate-400 hover:text-slate-700 rounded"><Pencil className="w-3.5 h-3.5" /></button>
                  <button onClick={() => { if (confirm('¿Eliminar este pendiente?')) eliminarPend.mutate(p.id); }} className="p-1 text-red-400 hover:text-red-600 rounded"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              </div>
              {p.descripcion && <p className="text-xs text-slate-500 line-clamp-2 mb-2">{p.descripcion}</p>}
              <div className="flex gap-1.5 flex-wrap mb-2">
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${pCfg.cls}`}>{pCfg.label}</span>
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${eCfg.cls}`}>{eCfg.icon}{eCfg.label}</span>
              </div>
              <div className="flex items-center justify-between text-[10px] text-slate-400">
                <span>{p.colegio ? p.colegio.replace('Mano Amiga ', '') : 'General'}</span>
                {p.fecha_limite && <span className="font-semibold text-amber-600">📅 {fmtDate(p.fecha_limite)}</span>}
              </div>
              {p.tipo === 'compartido' && p.asignado_nombre && (
                <p className="text-[10px] text-teal-600 font-semibold mt-1">→ {p.asignado_nombre}</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="p-6 lg:p-8 max-w-[1700px] mx-auto">
      <div className="flex items-center justify-between mb-6">
        <PageHeader title="Seguimiento" subtitle="Notas, pendientes y seguimiento de la documentación de Cumplimiento" />
      </div>

      {isError ? <ErrorBlock onRetry={refetchAll} /> : isLoading ? <LoadingBlock /> : (
        <div className="space-y-5">
          {/* Acciones */}
          <div className="flex justify-end -mt-4">
            {tab === 'notas' && <button onClick={() => openNota()} className={btnPrimary + " flex items-center gap-2"}><Plus className="w-4 h-4" />Nueva Nota</button>}
            {(tab === 'personales' || tab === 'compartidos') && <button onClick={() => openPend()} className={btnPrimary + " flex items-center gap-2"}><Plus className="w-4 h-4" />Nuevo Pendiente</button>}
            {tab === 'seguimiento' && <button onClick={() => setShowSeg(true)} className={btnPrimary + " flex items-center gap-2"}><Plus className="w-4 h-4" />Nuevo Seguimiento</button>}
          </div>

          {/* KPIs */}
          <div className="grid grid-cols-3 sm:grid-cols-7 gap-3">
            {[
              { label: 'Total Pendientes', val: kpis.total, color: 'text-slate-800' },
              { label: 'Activos', val: kpis.activos, color: 'text-blue-600' },
              { label: 'Personales', val: kpis.personales, color: 'text-indigo-600' },
              { label: 'Compartidos', val: kpis.compartidos, color: 'text-teal-600' },
              { label: 'Completados', val: kpis.completados, color: 'text-emerald-600' },
              { label: 'Urgentes', val: kpis.urgentes, color: 'text-red-500' },
              { label: 'En Seguimiento', val: kpis.enSeguimiento, color: 'text-cyan-600' },
            ].map(k => (
              <div key={k.label} className="bg-white rounded-xl border border-slate-200 shadow-sm px-4 py-3">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">{k.label}</p>
                <p className={`text-2xl font-black ${k.color}`}>{k.val}</p>
              </div>
            ))}
          </div>

          {/* Tabs */}
          <div className="flex gap-1 bg-slate-100 rounded-lg p-1 w-fit flex-wrap">
            <button onClick={() => setTab('notas')} className={`flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-semibold transition ${tab === 'notas' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
              <FileText className="w-4 h-4" />Notas<span className={`ml-1 text-xs px-1.5 py-0.5 rounded-full font-bold ${tab === 'notas' ? 'bg-slate-900 text-white' : 'bg-slate-200 text-slate-500'}`}>{notas.length}</span>
            </button>
            <button onClick={() => setTab('personales')} className={`flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-semibold transition ${tab === 'personales' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
              <ListChecks className="w-4 h-4" />Mis Pendientes<span className={`ml-1 text-xs px-1.5 py-0.5 rounded-full font-bold ${tab === 'personales' ? 'bg-slate-900 text-white' : 'bg-slate-200 text-slate-500'}`}>{pendPersonales.filter(p => p.estatus !== 'completado').length}</span>
            </button>
            <button onClick={() => setTab('compartidos')} className={`flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-semibold transition ${tab === 'compartidos' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
              <Users className="w-4 h-4" />Compartidos<span className={`ml-1 text-xs px-1.5 py-0.5 rounded-full font-bold ${tab === 'compartidos' ? 'bg-slate-900 text-white' : 'bg-slate-200 text-slate-500'}`}>{pendCompartidos.filter(p => p.estatus !== 'completado').length}</span>
            </button>
            <button onClick={() => setTab('seguimiento')} className={`flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-semibold transition ${tab === 'seguimiento' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
              <ClipboardList className="w-4 h-4" />Seguimiento<span className={`ml-1 text-xs px-1.5 py-0.5 rounded-full font-bold ${tab === 'seguimiento' ? 'bg-slate-900 text-white' : 'bg-slate-200 text-slate-500'}`}>{seguimientosActivos.length}</span>
            </button>
          </div>

          {tab === 'notas' && (
            <div className="relative max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input className="pl-9 pr-4 py-2 border border-slate-300 rounded-lg text-sm w-full focus:ring-2 focus:ring-slate-900 focus:outline-none" placeholder="Buscar notas..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>
          )}

          {/* ── Notas ── */}
          {tab === 'notas' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredNotas.length === 0 && <div className="col-span-3 text-center py-12"><FileText className="w-10 h-10 text-slate-200 mx-auto mb-3" /><p className="text-sm font-semibold text-slate-500">Sin notas aún</p></div>}
              {filteredNotas.map(n => (
                <div key={n.id} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden cursor-pointer hover:shadow-md transition" onClick={() => setViewNota(n)}>
                  <div className="h-2" style={{ background: n.color }} />
                  <div className="p-4">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-1">{n.fijada && <Pin className="w-3 h-3 text-amber-500 shrink-0" />}<h3 className="font-bold text-slate-900 text-sm truncate">{n.titulo}</h3></div>
                        <div className="flex gap-1 flex-wrap">
                          <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">{n.categoria}</span>
                          {n.colegio && <span className="text-[10px] bg-teal-50 text-teal-700 px-2 py-0.5 rounded-full">{n.colegio.replace('Mano Amiga ', '')}</span>}
                        </div>
                      </div>
                      <div className="flex gap-1 ml-2" onClick={e => e.stopPropagation()}>
                        <button onClick={() => openNota(n)} className="p-1 text-slate-400 hover:text-slate-700 rounded"><Pencil className="w-3.5 h-3.5" /></button>
                        <button onClick={() => { if (confirm('¿Eliminar esta nota?')) eliminarNota.mutate(n.id); }} className="p-1 text-red-400 hover:text-red-600 rounded"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    </div>
                    <p className="text-xs text-slate-500 line-clamp-3">{n.contenido || <span className="italic">Sin contenido</span>}</p>
                    <p className="text-[10px] text-slate-400 mt-3">{fmtDate(n.updated_at)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ── Pendientes (personales/compartidos) ── */}
          {(tab === 'personales' || tab === 'compartidos') && (
            <div className="space-y-6">
              {(tab === 'personales' ? pendPersonales : pendCompartidos).filter(p => p.estatus !== 'completado').length === 0 && (
                <div className="text-center py-12"><CheckCircle2 className="w-10 h-10 text-emerald-200 mx-auto mb-3" /><p className="text-sm font-semibold text-slate-500">¡Todo al día!</p></div>
              )}
              <PendGrid items={(tab === 'personales' ? pendPersonales : pendCompartidos).filter(p => p.estatus !== 'completado')} />
              {(tab === 'personales' ? pendPersonales : pendCompartidos).filter(p => p.estatus === 'completado').length > 0 && (
                <div>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2"><CheckCircle2 className="w-3.5 h-3.5" />Completados</p>
                  <div className="space-y-1.5">
                    {(tab === 'personales' ? pendPersonales : pendCompartidos).filter(p => p.estatus === 'completado').map(p => (
                      <div key={p.id} className="flex items-center justify-between bg-white border border-slate-100 rounded-lg px-4 py-2 cursor-pointer hover:bg-slate-50" onClick={() => setViewPend(p)}>
                        <span className="text-sm text-slate-500 line-through">{p.titulo}</span>
                        <span className="text-[10px] text-slate-400">{p.colegio ? p.colegio.replace('Mano Amiga ', '') : 'General'}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Seguimiento por colegio ── */}
          {tab === 'seguimiento' && (
            <div className="space-y-2">
              {seguimientos.length === 0 && <div className="text-center py-12"><ClipboardList className="w-10 h-10 text-slate-200 mx-auto mb-3" /><p className="text-sm font-semibold text-slate-500">Sin seguimientos registrados</p></div>}
              {seguimientos.map(s => (
                <div key={s.id} onClick={() => setViewSeg(s)}
                  className={`bg-white border rounded-lg px-4 py-3 cursor-pointer hover:shadow-sm transition-shadow ${s.estatus === 'activo' ? 'border-cyan-200' : 'border-slate-200 opacity-70'}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-800">{s.colegio.replace('Mano Amiga ', '')}</p>
                      <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{s.resumen}</p>
                      <p className="text-[10px] text-slate-400 mt-1">Iniciado {fmtDate(s.created_at)}</p>
                    </div>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${s.estatus === 'activo' ? 'bg-cyan-100 text-cyan-700' : 'bg-emerald-100 text-emerald-700'}`}>
                      {s.estatus === 'activo' ? 'Activo' : 'Completado'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Modal: Ver/editar Nota ── */}
      {viewNota && (
        <Modal title={viewNota.titulo} onClose={() => setViewNota(null)} wide>
          <div className="space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="w-3 h-3 rounded-full" style={{ background: viewNota.color }} />
              <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">{viewNota.categoria}</span>
              {viewNota.fijada && <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full flex items-center gap-1"><Pin className="w-3 h-3" />Fijada</span>}
              {viewNota.colegio && <span className="text-xs bg-teal-50 text-teal-700 px-2 py-0.5 rounded-full">{viewNota.colegio.replace('Mano Amiga ', '')}</span>}
            </div>
            <div className="bg-slate-50 rounded-lg p-4 min-h-[160px] text-sm text-slate-700 whitespace-pre-wrap">{viewNota.contenido || <span className="text-slate-400 italic">Sin contenido</span>}</div>
            <p className="text-xs text-slate-400">Actualizada: {fmtFull(viewNota.updated_at)}</p>
          </div>
          <div className="flex gap-3 mt-4">
            <button onClick={() => setViewNota(null)} className={btnOutline + " flex-1"}>Cerrar</button>
            <button onClick={() => { setViewNota(null); openNota(viewNota); }} className={btnPrimary + " flex-1 flex items-center justify-center gap-2"}><Pencil className="w-4 h-4" />Editar</button>
          </div>
        </Modal>
      )}

      {/* ── Modal: Crear/editar Nota ── */}
      {showNota && (
        <Modal title={editNota ? 'Editar Nota' : 'Nueva Nota'} onClose={() => setShowNota(false)}>
          <div className="space-y-3">
            <div><label className="block text-xs font-bold text-slate-500 uppercase mb-1">Título</label><input autoFocus className={inputCls} value={notaForm.titulo} onChange={e => setNotaForm(f => ({ ...f, titulo: e.target.value }))} /></div>
            <div><label className="block text-xs font-bold text-slate-500 uppercase mb-1">Contenido</label><textarea rows={4} className={inputCls + ' resize-none'} value={notaForm.contenido} onChange={e => setNotaForm(f => ({ ...f, contenido: e.target.value }))} /></div>
            <div><label className="block text-xs font-bold text-slate-500 uppercase mb-1">Categoría</label><select className={inputCls} value={notaForm.categoria} onChange={e => setNotaForm(f => ({ ...f, categoria: e.target.value }))}>{CATEGORIAS.map(c => <option key={c}>{c}</option>)}</select></div>
            <div><label className="block text-xs font-bold text-slate-500 uppercase mb-1">Color</label><div className="flex gap-2 flex-wrap pt-1">{COLORES.map(c => <button key={c} onClick={() => setNotaForm(f => ({ ...f, color: c }))} className={`w-6 h-6 rounded-full border-2 transition ${notaForm.color === c ? 'border-slate-900 scale-110' : 'border-transparent'}`} style={{ background: c }} />)}</div></div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={notaConColegio} onChange={e => setNotaConColegio(e.target.checked)} />Asociar a un colegio</label>
            {notaConColegio && (
              <select className={inputCls} value={notaForm.colegio} onChange={e => setNotaForm(f => ({ ...f, colegio: e.target.value }))}>
                <option value="">Elige un colegio</option>
                {colegios.map(c => <option key={c} value={c}>{c.replace('Mano Amiga ', '')}</option>)}
              </select>
            )}
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={notaForm.fijada} onChange={e => setNotaForm(f => ({ ...f, fijada: e.target.checked }))} />Fijar nota arriba</label>
          </div>
          <div className="flex gap-3 mt-5">
            <button onClick={() => setShowNota(false)} className={btnOutline + " flex-1"}>Cancelar</button>
            <button onClick={() => guardarNota.mutate()} disabled={guardarNota.isPending} className={btnPrimary + " flex-1 flex items-center justify-center gap-2"}>
              {guardarNota.isPending && <Loader2 className="w-4 h-4 animate-spin" />}Guardar
            </button>
          </div>
        </Modal>
      )}

      {/* ── Modal: Ver pendiente + comentarios ── */}
      {viewPend && (
        <Modal title={viewPend.titulo} onClose={() => setViewPend(null)} wide>
          <div className="space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold border ${PRIO_CFG[viewPend.prioridad]?.cls}`}>{PRIO_CFG[viewPend.prioridad]?.label}</span>
              <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold border ${EST_CFG[viewPend.estatus]?.cls}`}>{EST_CFG[viewPend.estatus]?.icon}{EST_CFG[viewPend.estatus]?.label}</span>
              {viewPend.colegio && <span className="text-xs bg-teal-50 text-teal-700 px-2 py-0.5 rounded-full">{viewPend.colegio.replace('Mano Amiga ', '')}</span>}
            </div>
            {viewPend.descripcion && <p className="text-sm text-slate-700 bg-slate-50 rounded-lg p-3">{viewPend.descripcion}</p>}
            <div className="flex items-center gap-2 flex-wrap text-xs text-slate-500">
              {viewPend.fecha_limite && <span>📅 Fecha límite: {fmtDate(viewPend.fecha_limite)}</span>}
              {viewPend.tipo === 'compartido' && viewPend.asignado_nombre && <span>→ Asignado a: {viewPend.asignado_nombre}</span>}
            </div>
            <div className="flex gap-1.5 flex-wrap pt-1">
              {(['pendiente', 'en_proceso', 'completado', 'cancelado'] as const).map(est => (
                <button key={est} onClick={() => cambiarEstatusPend.mutate({ id: viewPend.id, estatus: est })}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-bold border transition ${viewPend.estatus === est ? EST_CFG[est].cls : 'bg-white text-slate-400 border-slate-200 hover:bg-slate-50'}`}>
                  {EST_CFG[est].label}
                </button>
              ))}
            </div>
            <div className="pt-3 border-t border-slate-100">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-2 flex items-center gap-1"><MessageSquare className="w-3 h-3" /> Notas y seguimiento</p>
              <Comentarios targetField="pendiente_id" targetId={viewPend.id} />
            </div>
          </div>
          <div className="flex gap-3 mt-4">
            <button onClick={() => setViewPend(null)} className={btnOutline + " flex-1"}>Cerrar</button>
            <button onClick={() => { const p = viewPend; setViewPend(null); openPend(p); }} className={btnPrimary + " flex-1 flex items-center justify-center gap-2"}><Pencil className="w-4 h-4" />Editar</button>
          </div>
        </Modal>
      )}

      {/* ── Modal: Crear/editar Pendiente ── */}
      {showPend && (
        <Modal title={editPend ? 'Editar Pendiente' : 'Nuevo Pendiente'} onClose={() => setShowPend(false)}>
          <div className="space-y-3">
            <div><label className="block text-xs font-bold text-slate-500 uppercase mb-1">Título</label><input autoFocus className={inputCls} value={pendForm.titulo} onChange={e => setPendForm(f => ({ ...f, titulo: e.target.value }))} placeholder="Ej. Conseguir Uso de Suelo actualizado" /></div>
            <div><label className="block text-xs font-bold text-slate-500 uppercase mb-1">Descripción</label><textarea rows={2} className={inputCls + ' resize-none'} value={pendForm.descripcion} onChange={e => setPendForm(f => ({ ...f, descripcion: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Tipo</label>
                <select className={inputCls} value={pendForm.tipo} onChange={e => setPendForm(f => ({ ...f, tipo: e.target.value as 'personal' | 'compartido', asignado_a: '', asignado_nombre: '' }))}>
                  <option value="personal">Personal</option>
                  <option value="compartido">Compartido</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Prioridad</label>
                <select className={inputCls} value={pendForm.prioridad} onChange={e => setPendForm(f => ({ ...f, prioridad: e.target.value as Pendiente['prioridad'] }))}>
                  <option value="urgente">Urgente</option><option value="alta">Alta</option><option value="normal">Normal</option><option value="baja">Baja</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Colegio</label>
                <select className={inputCls} value={pendForm.colegio} onChange={e => setPendForm(f => ({ ...f, colegio: e.target.value, asignado_a: '', asignado_nombre: '' }))}>
                  <option value="">General (sin colegio)</option>
                  {colegios.map(c => <option key={c} value={c}>{c.replace('Mano Amiga ', '')}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Fecha límite</label>
                <input type="date" className={inputCls} value={pendForm.fecha_limite} onChange={e => setPendForm(f => ({ ...f, fecha_limite: e.target.value }))} />
              </div>
            </div>
            {pendForm.tipo === 'compartido' && (
              <div className="bg-teal-50 border border-teal-200 rounded-lg p-3 space-y-2">
                <p className="text-xs font-bold text-teal-700 uppercase">Asignar a usuario *</p>
                {!pendForm.colegio ? (
                  <p className="text-xs text-teal-600">Elige un colegio arriba para ver a los usuarios registrados ahí.</p>
                ) : todosUsuarios.length === 0 ? (
                  <p className="text-xs text-teal-600">No hay usuarios registrados para {pendForm.colegio.replace('Mano Amiga ', '')} todavía.</p>
                ) : (
                  <select className={inputCls} value={pendForm.asignado_a} onChange={e => {
                    const u = todosUsuarios.find(u => u.user_email === e.target.value);
                    setPendForm(f => ({ ...f, asignado_a: e.target.value, asignado_nombre: u?.nombre || e.target.value }));
                  }}>
                    <option value="">Selecciona un usuario...</option>
                    {usuariosPorGrupo.colegioUsers.length > 0 && (
                      <optgroup label={`— ${pendForm.colegio.replace('Mano Amiga ', '')} —`}>
                        {usuariosPorGrupo.colegioUsers.map(u => <option key={u.user_email} value={u.user_email}>{u.nombre || u.user_email} — {u.puesto || u.colegio}</option>)}
                      </optgroup>
                    )}
                    {usuariosPorGrupo.fmaUsers.length > 0 && (
                      <optgroup label="— FMA Oficinas —">
                        {usuariosPorGrupo.fmaUsers.map(u => <option key={u.user_email} value={u.user_email}>{u.nombre || u.user_email} — {u.puesto || 'FMA'}</option>)}
                      </optgroup>
                    )}
                  </select>
                )}
                {pendForm.asignado_a && <p className="text-xs text-teal-700 font-semibold">📧 {pendForm.asignado_a}</p>}
                <p className="text-[11px] text-teal-600 italic">La notificación por correo a esta persona se activa más adelante — por ahora solo se guarda la asignación.</p>
              </div>
            )}
          </div>
          <div className="flex gap-3 mt-5">
            <button onClick={() => setShowPend(false)} className={btnOutline + " flex-1"}>Cancelar</button>
            <button onClick={() => guardarPend.mutate()} disabled={guardarPend.isPending} className={btnPrimary + " flex-1 flex items-center justify-center gap-2"}>
              {guardarPend.isPending && <Loader2 className="w-4 h-4 animate-spin" />}Guardar
            </button>
          </div>
        </Modal>
      )}

      {/* ── Modal: Nuevo Seguimiento ── */}
      {showSeg && (
        <Modal title="Nuevo Seguimiento" onClose={() => setShowSeg(false)}>
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Colegio</label>
              <select className={inputCls} value={segForm.colegio} onChange={e => setSegForm(f => ({ ...f, colegio: e.target.value }))}>
                <option value="">Elige un colegio</option>
                {colegios.map(c => <option key={c} value={c}>{c.replace('Mano Amiga ', '')}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Resumen</label>
              <textarea rows={3} className={inputCls + ' resize-none'} value={segForm.resumen} onChange={e => setSegForm(f => ({ ...f, resumen: e.target.value }))} placeholder="Qué se está siguiendo con este colegio..." />
            </div>
          </div>
          <div className="flex gap-3 mt-5">
            <button onClick={() => setShowSeg(false)} className={btnOutline + " flex-1"}>Cancelar</button>
            <button onClick={() => crearSeg.mutate()} disabled={crearSeg.isPending} className={btnPrimary + " flex-1 flex items-center justify-center gap-2"}>
              {crearSeg.isPending && <Loader2 className="w-4 h-4 animate-spin" />}Crear
            </button>
          </div>
        </Modal>
      )}

      {/* ── Modal: Ver Seguimiento + comentarios ── */}
      {viewSeg && (
        <Modal title={viewSeg.colegio.replace('Mano Amiga ', '')} onClose={() => setViewSeg(null)} wide>
          <div className="space-y-3">
            <span className={`inline-block text-xs font-bold px-2.5 py-1 rounded-full ${viewSeg.estatus === 'activo' ? 'bg-cyan-100 text-cyan-700' : 'bg-emerald-100 text-emerald-700'}`}>
              {viewSeg.estatus === 'activo' ? 'Activo' : 'Completado'}
            </span>
            <p className="text-sm text-slate-700 bg-slate-50 rounded-lg p-3 whitespace-pre-wrap">{viewSeg.resumen}</p>
            <p className="text-xs text-slate-400">Iniciado: {fmtFull(viewSeg.created_at)}</p>
            <div className="pt-3 border-t border-slate-100">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-2 flex items-center gap-1"><MessageSquare className="w-3 h-3" /> Bitácora de seguimiento</p>
              <Comentarios targetField="seguimiento_id" targetId={viewSeg.id} />
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button onClick={() => { if (confirm('¿Eliminar este seguimiento y su bitácora?')) eliminarSeg.mutate(viewSeg.id); }} className="p-2 rounded-lg text-red-500 hover:bg-red-50" title="Eliminar"><Trash2 className="w-4 h-4" /></button>
            <button onClick={() => setViewSeg(null)} className={btnOutline + " flex-1"}>Cerrar</button>
            {viewSeg.estatus === 'activo' && (
              <button onClick={() => completarSeg.mutate(viewSeg.id)} disabled={completarSeg.isPending} className={btnPrimary + " flex-1 flex items-center justify-center gap-2"}>
                {completarSeg.isPending && <Loader2 className="w-4 h-4 animate-spin" />}Marcar completado
              </button>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
