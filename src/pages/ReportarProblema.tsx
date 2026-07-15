import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/lib/AuthContext';
import { usePermissions } from '@/hooks/usePermissions';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  Wrench, Send, CheckCircle2, Eye, Clock, ChevronDown, X, AlertTriangle,
} from 'lucide-react';
import PageHeader from '@/components/shared/PageHeader';
import { logAudit } from '@/lib/audit';

const MODULOS = [
  'Dashboard', 'Protocolo de Proyectos', 'Solicitud de Proyecto', 'Solicitudes Recibidas',
  'Ticket MAS', 'Tickets Registrados', 'Proyectos', 'Presupuesto vs Real', 'Anteproyectos',
  'Levantamiento Nacional', 'Minutas y Notas Técnicas', 'NEXUS', 'Checklists',
  'Calendario de Mantenimiento', 'Insumos', 'Reportes', 'Directorio', 'Accesos', 'Auditoría',
  'Otro / No estoy seguro',
];

const TIPOS_PROBLEMA = [
  'No carga / se queda en blanco',
  'Un botón no responde',
  'No se guarda la información',
  'No llega la notificación por correo',
  'Error al subir un archivo',
  'La información se ve incorrecta o desconfigurada',
  'No puedo entrar al módulo (permisos)',
  'Otro',
];

const ESTATUS_CFG: Record<string, { label: string; cls: string; icon: any }> = {
  nuevo:       { label: 'Nuevo',        cls: 'bg-red-50 text-red-700 border-red-200',       icon: AlertTriangle },
  en_revision: { label: 'En Revisión',  cls: 'bg-blue-50 text-blue-700 border-blue-200',    icon: Eye },
  resuelto:    { label: 'Resuelto',     cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: CheckCircle2 },
};

const inputCls = 'w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-red-500 focus:outline-none bg-white';

interface Reporte {
  id: string;
  created_at: string;
  modulo: string;
  tipo_problema: string;
  descripcion: string | null;
  reportado_por: string;
  reportado_por_nombre: string | null;
  estatus: 'nuevo' | 'en_revision' | 'resuelto';
  revisado_at: string | null;
  resuelto_at: string | null;
}

const FORM_INIT = { modulo: '', tipo_problema: '', descripcion: '' };

export default function ReportarProblema() {
  const { user } = useAuth();
  const { isAdmin } = usePermissions();
  const qc = useQueryClient();

  const [form, setForm] = useState({ ...FORM_INIT });
  const [showForm, setShowForm] = useState(!isAdmin); // usuarios normales ven el formulario directo
  const [filterEstatus, setFilterEstatus] = useState<'all' | 'nuevo' | 'en_revision' | 'resuelto'>('all');

  const userEmail = user?.email ?? '';
  const userName  = user?.user_metadata?.nombre || user?.email || 'Usuario';

  // ── Solo el admin consulta el listado completo ─────────────────────────
  const { data: reportes = [], isLoading } = useQuery({
    queryKey: ['reportes_problema'],
    queryFn: async () => {
      const { data, error } = await supabase.from('reportes_problema').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as Reporte[];
    },
    enabled: isAdmin,
  });

  const filtered = useMemo(() =>
    reportes.filter(r => filterEstatus === 'all' || r.estatus === filterEstatus),
    [reportes, filterEstatus]
  );

  const kpis = useMemo(() => ({
    nuevo: reportes.filter(r => r.estatus === 'nuevo').length,
    en_revision: reportes.filter(r => r.estatus === 'en_revision').length,
    resuelto: reportes.filter(r => r.estatus === 'resuelto').length,
  }), [reportes]);

  // ── Enviar reporte ──────────────────────────────────────────────────────
  const enviarMutation = useMutation({
    mutationFn: async () => {
      if (!form.modulo) throw new Error('Selecciona el módulo donde ocurrió el problema.');
      if (!form.tipo_problema) throw new Error('Selecciona el tipo de problema.');
      if (form.tipo_problema === 'Otro' && !form.descripcion.trim()) {
        throw new Error('Describe brevemente el problema.');
      }

      const { data, error } = await supabase.from('reportes_problema').insert({
        modulo: form.modulo,
        tipo_problema: form.tipo_problema,
        descripcion: form.descripcion.trim() || null,
        reportado_por: userEmail,
        reportado_por_nombre: userName,
      }).select('id').single();
      if (error) throw error;

      logAudit({ accion: 'crear', modulo: 'reportes_problema', registro_id: data?.id ?? null, registro_ref: `${form.modulo} — ${form.tipo_problema}` });

      try {
        await supabase.functions.invoke('notify-reporte-problema', {
          body: {
            tipo: 'nuevo', para: 'rreyes@manoamiga.edu.mx',
            modulo: form.modulo, tipo_problema: form.tipo_problema,
            descripcion: form.descripcion.trim() || null, reportado_por_nombre: userName,
            siteUrl: window.location.origin,
          },
        });
      } catch { /* no bloqueante */ }
    },
    onSuccess: () => {
      toast.success('¡Gracias! Tu reporte fue enviado a la Coordinación de Obras.');
      setForm({ ...FORM_INIT });
      if (isAdmin) { setShowForm(false); qc.invalidateQueries({ queryKey: ['reportes_problema'] }); }
    },
  });

  // ── Cambiar estatus (solo admin) ────────────────────────────────────────
  const cambiarEstatusMutation = useMutation({
    mutationFn: async ({ reporte, nuevoEstatus }: { reporte: Reporte; nuevoEstatus: 'en_revision' | 'resuelto' }) => {
      const payload: Record<string, unknown> = { estatus: nuevoEstatus };
      if (nuevoEstatus === 'en_revision') payload.revisado_at = new Date().toISOString();
      if (nuevoEstatus === 'resuelto')    payload.resuelto_at = new Date().toISOString();

      const { error } = await supabase.from('reportes_problema').update(payload).eq('id', reporte.id);
      if (error) throw error;

      logAudit({ accion: 'editar', modulo: 'reportes_problema', registro_id: reporte.id, registro_ref: `${reporte.modulo} → ${nuevoEstatus}` });

      try {
        await supabase.functions.invoke('notify-reporte-problema', {
          body: {
            tipo: nuevoEstatus, para: reporte.reportado_por,
            modulo: reporte.modulo, tipo_problema: reporte.tipo_problema,
            reportado_por_nombre: reporte.reportado_por_nombre,
          },
        });
      } catch { /* no bloqueante */ }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reportes_problema'] });
      toast.success('Estatus actualizado — se notificó al usuario.');
    },
  });

  // ═══════════════════════════════════════════════════════════════════════
  // VISTA: Usuario normal (sin acceso a la lista) — solo el formulario
  // ═══════════════════════════════════════════════════════════════════════
  if (!isAdmin) {
    return (
      <div className="max-w-2xl mx-auto space-y-5">
        <PageHeader title="Reportar Problema" subtitle="Solo para fallas o comportamientos inesperados del sistema — no para pedir funciones nuevas." />
        <ReporteForm form={form} setForm={setForm} onSubmit={() => enviarMutation.mutate()} loading={enviarMutation.isPending} />
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════
  // VISTA: Administrador — lista completa + poder reportar también
  // ═══════════════════════════════════════════════════════════════════════
  return (
    <div className="space-y-5">
      <PageHeader title="Reportar Problema" subtitle="Solo tú ves esta lista — reportes de fallas del sistema, separados de tus pendientes de proyectos." />

      <div className="grid grid-cols-3 gap-3">
        {(['nuevo', 'en_revision', 'resuelto'] as const).map(e => {
          const cfg = ESTATUS_CFG[e];
          return (
            <button key={e} onClick={() => setFilterEstatus(filterEstatus === e ? 'all' : e)}
              className={`text-left p-3 rounded-xl border-2 transition-colors ${filterEstatus === e ? cfg.cls : 'bg-white border-slate-200 hover:border-slate-300'}`}>
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{cfg.label}</p>
              <p className="text-2xl font-black text-slate-900">{kpis[e]}</p>
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-3">
        {filterEstatus !== 'all' && (
          <button onClick={() => setFilterEstatus('all')} className="text-xs text-slate-400 hover:text-slate-600 underline">Quitar filtro</button>
        )}
        <button onClick={() => setShowForm(true)}
          className="ml-auto flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-bold hover:bg-slate-800 transition-colors">
          <Wrench className="w-4 h-4" /> Reportar un Problema
        </button>
      </div>

      {isLoading ? (
        <div className="text-center py-16 text-slate-400 text-sm">Cargando reportes...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-slate-400 text-sm">
          <CheckCircle2 className="w-10 h-10 mx-auto mb-2 text-emerald-200" />
          {filterEstatus === 'all' ? 'No hay reportes registrados.' : `No hay reportes en "${ESTATUS_CFG[filterEstatus]?.label}".`}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100 overflow-hidden">
          {filtered.map(r => {
            const cfg = ESTATUS_CFG[r.estatus];
            const Icon = cfg.icon;
            return (
              <div key={r.id} className="p-4">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${cfg.cls}`}>
                        <Icon className="w-3 h-3" />{cfg.label}
                      </span>
                      <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">{r.modulo}</span>
                    </div>
                    <p className="font-bold text-sm text-slate-900">{r.tipo_problema}</p>
                    {r.descripcion && <p className="text-sm text-slate-600 mt-1">{r.descripcion}</p>}
                    <p className="text-[11px] text-slate-400 mt-2">
                      {r.reportado_por_nombre ?? r.reportado_por} · {format(new Date(r.created_at), "d 'de' MMMM yyyy, HH:mm", { locale: es })}
                    </p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    {r.estatus === 'nuevo' && (
                      <button onClick={() => cambiarEstatusMutation.mutate({ reporte: r, nuevoEstatus: 'en_revision' })}
                        disabled={cambiarEstatusMutation.isPending}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition disabled:opacity-50">
                        <Eye className="w-3.5 h-3.5" /> Estoy revisando esto
                      </button>
                    )}
                    {r.estatus === 'en_revision' && (
                      <button onClick={() => cambiarEstatusMutation.mutate({ reporte: r, nuevoEstatus: 'resuelto' })}
                        disabled={cambiarEstatusMutation.isPending}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition disabled:opacity-50">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Marcar como Resuelto
                      </button>
                    )}
                    {r.estatus === 'resuelto' && (
                      <span className="text-[11px] text-slate-400 flex items-center gap-1">
                        <Clock className="w-3 h-3" /> {r.resuelto_at && format(new Date(r.resuelto_at), "d MMM yyyy", { locale: es })}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full my-8">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <h2 className="font-bold text-slate-900">Reportar un Problema</h2>
              <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-700"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5">
              <ReporteForm form={form} setForm={setForm} onSubmit={() => enviarMutation.mutate()} loading={enviarMutation.isPending} compact />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Formulario reutilizable (usuario normal y modal de admin) ────────────
function ReporteForm({ form, setForm, onSubmit, loading, compact }: {
  form: typeof FORM_INIT; setForm: React.Dispatch<React.SetStateAction<typeof FORM_INIT>>;
  onSubmit: () => void; loading: boolean; compact?: boolean;
}) {
  return (
    <div className={compact ? 'space-y-3' : 'bg-white rounded-xl border border-slate-200 p-6 space-y-4'}>
      <div>
        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">¿En qué módulo ocurrió? *</label>
        <div className="relative">
          <select className={inputCls + ' appearance-none pr-8'} value={form.modulo}
            onChange={e => setForm(f => ({ ...f, modulo: e.target.value }))}>
            <option value="">Selecciona un módulo...</option>
            {MODULOS.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
          <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        </div>
      </div>

      <div>
        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">¿Qué tipo de problema es? *</label>
        <div className="relative">
          <select className={inputCls + ' appearance-none pr-8'} value={form.tipo_problema}
            onChange={e => setForm(f => ({ ...f, tipo_problema: e.target.value }))}>
            <option value="">Selecciona una opción...</option>
            {TIPOS_PROBLEMA.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        </div>
      </div>

      {(form.tipo_problema === 'Otro' || form.tipo_problema) && (
        <div>
          <label className="block text-xs font-bold text-slate-500 uppercase mb-1">
            {form.tipo_problema === 'Otro' ? 'Describe el problema *' : 'Detalle adicional (opcional)'}
          </label>
          <textarea className={inputCls + ' resize-none'} rows={4}
            placeholder="Cuéntanos qué pasó, en qué pantalla estabas y qué esperabas que sucediera..."
            value={form.descripcion} onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))} />
        </div>
      )}

      <button onClick={onSubmit} disabled={loading}
        className="w-full flex items-center justify-center gap-2 py-3 bg-red-600 text-white font-bold text-sm rounded-xl hover:bg-red-700 disabled:opacity-50 transition">
        <Send className="w-4 h-4" /> {loading ? 'Enviando...' : 'Enviar Reporte'}
      </button>
    </div>
  );
}
