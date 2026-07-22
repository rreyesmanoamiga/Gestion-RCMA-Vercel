import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  FileSignature, Plus, X, Download, Trash2, Pencil, Calendar, Building2,
  ClipboardList, ChevronDown, Loader2, FileText, Search,
} from 'lucide-react';
import PageHeader from '@/components/shared/PageHeader';
import { usePermissions } from '@/hooks/usePermissions';
import { useAuth } from '@/lib/AuthContext';
import { logAudit } from '@/lib/audit';
import { useSharePointUpload } from '@/hooks/useSharePointUpload';
import { TERRITORIOS, getColegiosByTerritorio } from '@/lib/colegios';

interface Minuta {
  id: string;
  created_at: string;
  tipo: 'minuta' | 'nota_tecnica';
  asunto: string;
  fecha: string;
  proyecto_id: string | null;
  proyecto_nombre: string | null;
  territorio: string | null;
  colegio: string | null;
  notas: string | null;
  archivo_nombre: string;
  onedrive_url: string | null;
  onedrive_path: string | null;
  creado_por: string | null;
  notificar_admin_colegio: boolean;
}

interface ColegioAdmin {
  user_email: string;
  nombre: string | null;
  colegio: string | null;
}

const TIPO_CFG: Record<string, { label: string; labelCorto: string; color: string; carpeta: string }> = {
  minuta:       { label: 'Minuta de Reunión',           labelCorto: 'Minuta',       color: 'text-blue-700 bg-blue-50 border-blue-200',     carpeta: 'Minutas' },
  nota_tecnica: { label: 'Nota Técnica de Seguimiento',  labelCorto: 'Nota Técnica', color: 'text-purple-700 bg-purple-50 border-purple-200', carpeta: 'Notas Tecnicas' },
};

const inputCls   = 'w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white';
const PAGE_SIZE   = 20;
const CAR_CORREOS: Record<string, { email: string; nombre: string }> = {
  NORTE:  { email: 'jalvarado@manoamiga.edu.mx', nombre: 'Julián Alvarado (CAR Norte)' },
  MEXICO: { email: 'gromero@manoamiga.edu.mx',   nombre: 'Gonzalo Romero (CAR México)' },
};
const FORM_INIT = {
  tipo: 'minuta' as 'minuta' | 'nota_tecnica',
  asunto: '', fecha: format(new Date(), 'yyyy-MM-dd'),
  proyecto_id: '', proyecto_nombre: '', territorio: '', colegio: '', notas: '',
};

export default function Minutas() {
  const { isAdmin, can, permsRecord } = usePermissions();
  const { user } = useAuth();
  const qc = useQueryClient();
  const { uploadCustom, uploading } = useSharePointUpload();

  const puedeCrear    = isAdmin || can('crear_minutas');
  const puedeEditar   = isAdmin || can('editar_minutas');
  const puedeEliminar = isAdmin || can('eliminar_minutas');

  // Un "administrador de colegio" es cualquier usuario no-admin al que se le asignó
  // un colegio específico en Accesos (no ECO, no vacío/general). Ese perfil solo debe ver
  // minutas (nunca notas técnicas) de SU colegio, y solo las que se marcaron para notificarle.
  const miColegio       = String((permsRecord as any)?.colegio ?? '');
  const esAdminColegio  = !isAdmin && !!miColegio && miColegio !== 'ECO';

  const [search, setSearch]           = useState('');
  const [filterTipo, setFilterTipo]   = useState<'all' | 'minuta' | 'nota_tecnica'>('all');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [showForm, setShowForm]       = useState(false);
  const [editItem, setEditItem]       = useState<Minuta | null>(null);
  const [deleteItem, setDeleteItem]   = useState<Minuta | null>(null);
  const [sinProyecto, setSinProyecto] = useState(false);
  const [form, setForm]               = useState({ ...FORM_INIT });
  const [file, setFile]               = useState<File | null>(null);
  const [dragActive, setDragActive]   = useState(false);
  const [notifAngel, setNotifAngel]   = useState(false); // maestro: activa el envío, Angel siempre va como "Para"
  const [notifEnrique, setNotifEnrique] = useState(false);
  const [notifCAR, setNotifCAR]       = useState(false);
  // Notificación independiente al/los administrador(es) del colegio seleccionado
  const [notifAdminColegio, setNotifAdminColegio] = useState<Record<string, boolean>>({});
  // En edición: permite otorgar/quitar visibilidad al administrador sin reenviar correo
  const [visibleAdminColegio, setVisibleAdminColegio] = useState(false);

  // ── Data ────────────────────────────────────────────────────────────────
  const { data: minutas = [], isLoading } = useQuery({
    queryKey: ['minutas', esAdminColegio, miColegio],
    queryFn: async () => {
      let query = supabase.from('minutas').select('*').order('fecha', { ascending: false });
      if (esAdminColegio) {
        // Solo minutas (nunca notas técnicas) de su colegio, y solo las marcadas para notificarle.
        // La política RLS en Supabase aplica esta misma regla como respaldo de seguridad.
        query = query
          .eq('tipo', 'minuta')
          .eq('colegio', miColegio)
          .eq('notificar_admin_colegio', true);
      }
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as Minuta[];
    },
  });

  // Usuarios ligados (en Accesos) al colegio seleccionado en el formulario —
  // son los candidatos a "administrador exclusivo" a notificar.
  const { data: colegioAdmins = [] } = useQuery({
    queryKey: ['colegioAdmins', form.colegio],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_permissions')
        .select('user_email, nombre, colegio')
        .eq('colegio', form.colegio)
        .eq('ver_minutas', true);
      if (error) throw error;
      return (data ?? []) as ColegioAdmin[];
    },
    enabled: !editItem && puedeCrear && !!form.colegio && form.colegio !== 'ECO',
  });

  // Mismos proyectos activos que ya usa NEXUS — comparten caché (misma queryKey)
  const { data: rawProyectos = [] } = useQuery({
    queryKey: ['proyectos_nexus'],
    queryFn: async () => {
      const { data } = await supabase.from('projects').select('id, name, territorio, colegio, status')
        .in('status', ['en_proceso', 'pausado', 'en_espera']).order('name');
      return data ?? [];
    },
  });

  const colegiosDisponibles = useMemo(() => getColegiosByTerritorio(form.territorio), [form.territorio]);

  const filtered = useMemo(() => minutas.filter(m =>
    (filterTipo === 'all' || m.tipo === filterTipo) &&
    (!search ||
      m.asunto?.toLowerCase().includes(search.toLowerCase()) ||
      m.proyecto_nombre?.toLowerCase().includes(search.toLowerCase()) ||
      m.colegio?.toLowerCase().includes(search.toLowerCase()))
  ), [minutas, search, filterTipo]);

  const visible   = useMemo(() => filtered.slice(0, visibleCount), [filtered, visibleCount]);
  const hasMore   = visibleCount < filtered.length;
  const remaining = filtered.length - visibleCount;

  const resetForm = () => {
    setForm({ ...FORM_INIT });
    setFile(null);
    setSinProyecto(false);
    setEditItem(null);
    setNotifAngel(false);
    setNotifEnrique(false);
    setNotifCAR(false);
    setNotifAdminColegio({});
    setVisibleAdminColegio(false);
  };

  const openEdit = (m: Minuta) => {
    setEditItem(m);
    setSinProyecto(!!(m.proyecto_nombre && !m.proyecto_id));
    setForm({
      tipo: m.tipo ?? 'minuta',
      asunto: m.asunto, fecha: m.fecha,
      proyecto_id: m.proyecto_id ?? '', proyecto_nombre: m.proyecto_nombre ?? '',
      territorio: m.territorio ?? '', colegio: m.colegio ?? '', notas: m.notas ?? '',
    });
    setVisibleAdminColegio(!!m.notificar_admin_colegio);
    setFile(null);
    setShowForm(true);
  };

  // ── Guardar (crear o editar) ───────────────────────────────────────────
  const saveMutation = useMutation({
    mutationFn: async () => {
      if (editItem) {
        if (!puedeEditar) throw new Error('No tienes permiso para editar minutas.');
      } else {
        if (!puedeCrear) throw new Error('No tienes permiso para subir minutas.');
        if (!file) throw new Error('Selecciona el archivo PDF del documento.');
      }
      if (!form.asunto.trim()) throw new Error('Escribe el asunto de la reunión.');

      let archivo_nombre = editItem?.archivo_nombre ?? '';
      let onedrive_url   = editItem?.onedrive_url ?? null;
      let onedrive_path  = editItem?.onedrive_path ?? null;

      if (file) {
        const anio    = new Date(form.fecha).getFullYear();
        const temaCarpeta = form.asunto.trim().replace(/[/\\:*?"<>|]/g, '_').slice(0, 60);
        const carpetaRaiz = TIPO_CFG[form.tipo]?.carpeta ?? 'Minutas';
        const carpeta = `${carpetaRaiz}/${anio}/${form.territorio || 'GENERAL'}/${form.colegio || 'GENERAL'}/${temaCarpeta}`;
        const fecha   = format(new Date(), 'yyyy-MM-dd_HH-mm-ss');
        const nombre  = `${fecha}_${file.name}`;
        const webUrl  = await uploadCustom(file, carpeta, nombre);
        if (!webUrl) throw new Error('No se pudo subir el archivo a OneDrive.');
        archivo_nombre = nombre;
        onedrive_url   = webUrl;
        onedrive_path  = carpeta;
      }

      const payload = {
        tipo:            form.tipo,
        asunto:          form.asunto.trim(),
        fecha:           form.fecha,
        proyecto_id:     sinProyecto ? null : (form.proyecto_id || null),
        proyecto_nombre: form.proyecto_nombre || null,
        territorio:      form.territorio || null,
        colegio:         form.colegio || null,
        notas:           form.notas || null,
        archivo_nombre,
        onedrive_url,
        onedrive_path,
        creado_por:      user?.email ?? null,
      };

      if (editItem) {
        const { error } = await supabase.from('minutas')
          .update({ ...payload, notificar_admin_colegio: visibleAdminColegio })
          .eq('id', editItem.id);
        if (error) throw error;
        logAudit({ accion: 'editar', modulo: 'minutas', registro_id: editItem.id, registro_ref: form.asunto });
      } else {
        const adminsSeleccionados = colegioAdmins.filter(a => notifAdminColegio[a.user_email]);
        const { data, error } = await supabase.from('minutas')
          .insert({ ...payload, notificar_admin_colegio: adminsSeleccionados.length > 0 })
          .select('id').single();
        if (error) throw error;
        logAudit({ accion: 'crear', modulo: 'minutas', registro_id: data?.id ?? null, registro_ref: form.asunto });

        // Notificación independiente al/los administrador(es) del colegio (no depende de Angel)
        for (const admin of adminsSeleccionados) {
          try {
            const { error: notifError } = await supabase.functions.invoke('notify-minuta-subida', {
              body: {
                para: admin.user_email,
                cc: ['rreyes@manoamiga.edu.mx'],
                tipo_label: TIPO_CFG[form.tipo]?.label ?? 'Minuta de Reunión',
                asunto: form.asunto, fecha: form.fecha,
                proyecto_nombre: form.proyecto_nombre || null,
                territorio: form.territorio || null, colegio: form.colegio || null,
                subido_por: user?.email ?? null,
                onedrive_url, siteUrl: window.location.origin,
              },
            });
            if (notifError) {
              console.error('Error al notificar al administrador de colegio:', notifError);
              toast.warning(`El documento se guardó, pero no se pudo notificar a ${admin.nombre || admin.user_email}.`);
            }
          } catch (e) {
            console.error('Error al notificar al administrador de colegio:', e);
          }
        }

        // Notificar por correo — Para: Angel (si se activó) — CC: Enrique, CAR y tú
        if (notifAngel) {
          const ccList: string[] = ['rreyes@manoamiga.edu.mx'];
          if (notifEnrique) ccList.push('ecastaneda@manoamiga.edu.mx');
          if (notifCAR && form.territorio && CAR_CORREOS[form.territorio]) {
            ccList.push(CAR_CORREOS[form.territorio].email);
          }
          try {
            const { error: notifError } = await supabase.functions.invoke('notify-minuta-subida', {
              body: {
                para: 'arodriguez@manoamiga.edu.mx',
                cc: ccList,
                tipo_label: TIPO_CFG[form.tipo]?.label ?? 'Minuta de Reunión',
                asunto: form.asunto, fecha: form.fecha,
                proyecto_nombre: form.proyecto_nombre || null,
                territorio: form.territorio || null, colegio: form.colegio || null,
                subido_por: user?.email ?? null,
                onedrive_url, siteUrl: window.location.origin,
              },
            });
            if (notifError) {
              console.error('Error al enviar notificación de minuta:', notifError);
              toast.warning('El documento se guardó, pero la notificación por correo no pudo enviarse.');
            }
          } catch (e) {
            console.error('Error al enviar notificación de minuta:', e);
            toast.warning('El documento se guardó, pero la notificación por correo no pudo enviarse.');
          }
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['minutas'] });
      toast.success(editItem ? 'Documento actualizado' : 'Documento guardado correctamente');
      setShowForm(false);
      resetForm();
    },
  });

  // ── Eliminar ────────────────────────────────────────────────────────────
  const deleteMutation = useMutation({
    mutationFn: async (m: Minuta) => {
      if (!puedeEliminar) throw new Error('No tienes permiso para eliminar minutas.');
      const { error } = await supabase.from('minutas').delete().eq('id', m.id);
      if (error) throw error;
      logAudit({ accion: 'eliminar', modulo: 'minutas', registro_id: m.id, registro_ref: m.asunto });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['minutas'] });
      toast.success('Documento eliminado');
      setDeleteItem(null);
    },
  });

  return (
    <div className="space-y-5">
      <PageHeader
        title={esAdminColegio ? `Minutas — ${miColegio}` : 'Minutas y Notas Técnicas'}
        subtitle={esAdminColegio
          ? 'Minutas de reunión de tu colegio compartidas contigo'
          : 'Repositorio de minutas de reunión y notas técnicas de seguimiento'}
      />

      {/* Filtro por tipo — un administrador de colegio nunca ve Notas Técnicas */}
      {!esAdminColegio && (
        <div className="flex gap-2">
          {[
            { key: 'all',          label: 'Todos' },
            { key: 'minuta',       label: 'Minutas de Reunión' },
            { key: 'nota_tecnica', label: 'Notas Técnicas' },
          ].map(t => (
            <button key={t.key} onClick={() => { setFilterTipo(t.key as any); setVisibleCount(PAGE_SIZE); }}
              className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-colors ${
                filterTipo === t.key ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-400'
              }`}>
              {t.label}
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
            placeholder="Buscar por asunto, proyecto o colegio..."
            value={search} onChange={e => { setSearch(e.target.value); setVisibleCount(PAGE_SIZE); }} />
        </div>
        <span className="text-sm text-slate-400">{filtered.length} documento{filtered.length !== 1 ? 's' : ''}</span>
        {puedeCrear && (
          <button onClick={() => { resetForm(); setShowForm(true); }}
            className="ml-auto flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-bold hover:bg-slate-800 transition-colors">
            <Plus className="w-4 h-4" /> Nuevo Documento
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="text-center py-16 text-slate-400 text-sm">Cargando minutas...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-slate-400 text-sm">
          <FileSignature className="w-10 h-10 mx-auto mb-2 text-slate-300" />
          No hay documentos registrados.
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100 overflow-hidden">
          {visible.map(m => {
            const tipoCfg = TIPO_CFG[m.tipo] ?? TIPO_CFG.minuta;
            return (
            <div key={m.id} className="flex items-center gap-4 px-4 py-3 hover:bg-slate-50 transition-colors">
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${m.tipo === 'nota_tecnica' ? 'bg-purple-50' : 'bg-blue-50'}`}>
                <FileText className={`w-4 h-4 ${m.tipo === 'nota_tecnica' ? 'text-purple-600' : 'text-blue-600'}`} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-bold text-sm text-slate-900 truncate">{m.asunto}</p>
                  <span className={`shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full border ${tipoCfg.color}`}>{tipoCfg.labelCorto}</span>
                </div>
                <div className="flex items-center gap-2 flex-wrap mt-1">
                  <span className="inline-flex items-center gap-1 text-[11px] text-slate-500">
                    <Calendar className="w-3 h-3" />
                    {format(new Date(m.fecha + 'T12:00:00'), "d 'de' MMMM yyyy", { locale: es })}
                  </span>
                  {m.proyecto_nombre && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full">
                      <ClipboardList className="w-3 h-3" />{m.proyecto_nombre}
                    </span>
                  )}
                  {m.colegio && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                      <Building2 className="w-3 h-3" />{m.colegio}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {m.onedrive_url && (
                  <a href={m.onedrive_url} target="_blank" rel="noreferrer"
                    className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="Descargar / Ver">
                    <Download className="w-4 h-4" />
                  </a>
                )}
                {puedeEditar && (
                  <button onClick={() => openEdit(m)}
                    className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors" title="Editar">
                    <Pencil className="w-4 h-4" />
                  </button>
                )}
                {puedeEliminar && (
                  <button onClick={() => setDeleteItem(m)}
                    className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Eliminar">
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
            );
          })}
        </div>
      )}

      {hasMore && (
        <div className="flex flex-col items-center gap-2">
          <button onClick={() => setVisibleCount(v => v + PAGE_SIZE)}
            className="flex items-center gap-2 px-5 py-2.5 bg-white border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 hover:border-slate-400 transition-colors shadow-sm">
            <ChevronDown className="w-4 h-4" />
            Cargar más ({remaining} restante{remaining !== 1 ? 's' : ''})
          </button>
          <p className="text-xs text-slate-400">Mostrando {visible.length} de {filtered.length} minutas</p>
        </div>
      )}

      {/* ── Modal: Nueva / Editar Minuta ─────────────────────────────────── */}
      {showForm && (
        <div className="fixed inset-0 z-[100] flex items-start sm:items-center justify-center bg-black/50 p-4 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full my-8">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <h2 className="font-bold text-slate-900">{editItem ? `Editar ${TIPO_CFG[form.tipo]?.label ?? 'Documento'}` : 'Nuevo Documento'}</h2>
              <button onClick={() => { setShowForm(false); resetForm(); }} className="text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-3 max-h-[75vh] overflow-y-auto">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Tipo de Documento *</label>
                <div className="grid grid-cols-2 gap-2">
                  {(['minuta', 'nota_tecnica'] as const).map(t => (
                    <label key={t} className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer text-sm transition ${form.tipo === t ? 'border-slate-900 bg-slate-50 font-semibold' : 'border-slate-200'}`}>
                      <input type="radio" checked={form.tipo === t} onChange={() => setForm(f => ({ ...f, tipo: t }))} className="shrink-0" />
                      {TIPO_CFG[t].label}
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">
                  {form.tipo === 'nota_tecnica' ? 'Tema de la Nota Técnica *' : 'Asunto / Tema de la Reunión *'}
                </label>
                <input className={inputCls} placeholder="Ej. Seguimiento Barda Perimetral MA TIJ"
                  value={form.asunto} onChange={e => setForm(f => ({ ...f, asunto: e.target.value }))} />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Fecha de la Reunión *</label>
                <input type="date" className={inputCls} value={form.fecha}
                  onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))} />
              </div>

              {/* Vinculación con Proyecto — mismo patrón que NEXUS */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 space-y-2">
                <p className="text-xs font-bold text-blue-700 uppercase">Vinculación con Proyecto</p>
                <div className="grid grid-cols-2 gap-2">
                  <label className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer text-sm transition ${!sinProyecto ? 'border-slate-900 bg-white font-semibold' : 'border-slate-200 bg-white'}`}>
                    <input type="radio" checked={!sinProyecto}
                      onChange={() => { setSinProyecto(false); setForm(f => ({ ...f, proyecto_nombre: '' })); }}
                      className="shrink-0" /> Proyecto registrado
                  </label>
                  <label className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer text-sm transition ${sinProyecto ? 'border-slate-900 bg-white font-semibold' : 'border-slate-200 bg-white'}`}>
                    <input type="radio" checked={sinProyecto}
                      onChange={() => { setSinProyecto(true); setForm(f => ({ ...f, proyecto_id: '', proyecto_nombre: '' })); }}
                      className="shrink-0" /> Sin proyecto registrado
                  </label>
                </div>
                {!sinProyecto ? (
                  <select className={inputCls} value={form.proyecto_id} onChange={e => {
                    const p = (rawProyectos as any[]).find(p => p.id === e.target.value);
                    setForm(f => ({ ...f, proyecto_id: e.target.value, proyecto_nombre: p?.name ?? '', territorio: p?.territorio ?? f.territorio, colegio: p?.colegio ?? f.colegio }));
                  }}>
                    <option value="">Selecciona un proyecto...</option>
                    {(rawProyectos as any[]).map((p: any) => <option key={p.id} value={p.id}>{p.name} — {p.colegio}</option>)}
                  </select>
                ) : (
                  <input className={inputCls} placeholder="Nombre del tema / proyecto a organizar..."
                    value={form.proyecto_nombre} onChange={e => setForm(f => ({ ...f, proyecto_nombre: e.target.value }))} />
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Territorio</label>
                  <select className={inputCls} value={form.territorio}
                    onChange={e => setForm(f => ({ ...f, territorio: e.target.value, colegio: '' }))}>
                    <option value="">Selecciona... (opcional)</option>
                    {TERRITORIOS.map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Colegio</label>
                  <select className={inputCls} value={form.colegio}
                    onChange={e => setForm(f => ({ ...f, colegio: e.target.value }))}>
                    <option value="">Selecciona... (opcional)</option>
                    {colegiosDisponibles.map((c: string) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Notas</label>
                <textarea className={inputCls + ' resize-none'} rows={2} placeholder="Observaciones adicionales..."
                  value={form.notas} onChange={e => setForm(f => ({ ...f, notas: e.target.value }))} />
              </div>

              {!editItem && (
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-2">
                  <label className="flex items-center gap-2 text-sm font-bold text-slate-700 cursor-pointer">
                    <input type="checkbox" checked={notifAngel} onChange={e => setNotifAngel(e.target.checked)} className="w-4 h-4 rounded" />
                    Notificar a Angel Rodríguez (Gerente)
                  </label>
                  {notifAngel && (
                    <div className="pl-6 space-y-2 border-l-2 border-slate-200 ml-1">
                      <p className="text-[11px] text-slate-400">Con copia a ti automáticamente, y opcionalmente a:</p>
                      <label className="flex items-center gap-2 text-sm cursor-pointer">
                        <input type="checkbox" checked={notifEnrique} onChange={e => setNotifEnrique(e.target.checked)} className="w-4 h-4 rounded" />
                        Enrique Castañeda
                      </label>
                      <label className={`flex items-center gap-2 text-sm ${form.territorio && CAR_CORREOS[form.territorio] ? 'cursor-pointer' : 'text-slate-400 cursor-not-allowed'}`}>
                        <input type="checkbox" checked={notifCAR} disabled={!form.territorio || !CAR_CORREOS[form.territorio]}
                          onChange={e => setNotifCAR(e.target.checked)} className="w-4 h-4 rounded" />
                        {form.territorio && CAR_CORREOS[form.territorio] ? CAR_CORREOS[form.territorio].nombre : 'CAR del Territorio (selecciona territorio primero)'}
                      </label>
                    </div>
                  )}
                </div>
              )}

              {/* Notificación independiente al administrador exclusivo del colegio seleccionado.
                  Marcar esta casilla es lo único que hace visible esta minuta para ese administrador
                  dentro del sistema — sin marcarla, no la verá aunque sea de su colegio. */}
              {!editItem && form.colegio && form.colegio !== 'ECO' && colegioAdmins.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-2">
                  <p className="text-xs font-bold text-amber-700 uppercase">Administrador de {form.colegio}</p>
                  {colegioAdmins.map(admin => (
                    <label key={admin.user_email} className="flex items-center gap-2 text-sm font-medium text-slate-700 cursor-pointer">
                      <input type="checkbox"
                        checked={!!notifAdminColegio[admin.user_email]}
                        onChange={e => setNotifAdminColegio(prev => ({ ...prev, [admin.user_email]: e.target.checked }))}
                        className="w-4 h-4 rounded" />
                      ¿Enviar y hacer visible esta minuta a {admin.nombre || admin.user_email}?
                    </label>
                  ))}
                </div>
              )}

              {/* En edición: permite otorgar o quitar visibilidad al administrador de colegio
                  sin volver a enviar correo (por ejemplo si te equivocaste al subir). */}
              {editItem && form.colegio && form.colegio !== 'ECO' && (
                <label className="flex items-center gap-2 text-sm font-medium text-slate-700 cursor-pointer bg-amber-50 border border-amber-200 rounded-lg p-3">
                  <input type="checkbox" checked={visibleAdminColegio}
                    onChange={e => setVisibleAdminColegio(e.target.checked)} className="w-4 h-4 rounded" />
                  Visible para el administrador de {form.colegio} (no reenvía correo)
                </label>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">
                  {editItem ? 'Reemplazar archivo PDF (opcional)' : 'Archivo PDF de la Minuta *'}
                </label>
                {editItem?.onedrive_url && !file && (
                  <a href={editItem.onedrive_url} target="_blank" rel="noreferrer"
                    className="flex items-center gap-1 text-xs text-blue-700 hover:underline mb-1">
                    <Download className="w-3 h-3" />Ver archivo actual
                  </a>
                )}
                <label
                  onDragOver={e => { e.preventDefault(); setDragActive(true); }}
                  onDragLeave={e => { e.preventDefault(); setDragActive(false); }}
                  onDrop={e => {
                    e.preventDefault(); setDragActive(false);
                    const dropped = e.dataTransfer.files?.[0];
                    if (dropped && dropped.name.toLowerCase().endsWith('.pdf')) setFile(dropped);
                    else toast.error('Solo se aceptan archivos PDF (.pdf)');
                  }}
                  className={`flex items-center gap-3 cursor-pointer border-2 border-dashed rounded-lg px-4 py-3 transition
                  ${dragActive ? 'border-blue-500 bg-blue-100' : file ? 'border-blue-400 bg-blue-50' : 'border-slate-300 hover:border-blue-400 hover:bg-slate-50'}`}>
                  <FileText className="w-5 h-5 text-blue-500 shrink-0" />
                  <span className="flex-1 text-sm text-slate-600 truncate">
                    {file ? file.name : 'Arrastra el archivo PDF aquí o haz clic para seleccionarlo'}
                  </span>
                  <input type="file" accept=".pdf" className="hidden"
                    onChange={e => setFile(e.target.files?.[0] ?? null)} />
                </label>
              </div>
            </div>

            <div className="flex justify-end gap-3 px-5 py-4 border-t border-slate-100">
              <button onClick={() => { setShowForm(false); resetForm(); }}
                className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
                Cancelar
              </button>
              <button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || uploading}
                className="flex items-center gap-2 px-5 py-2 bg-slate-900 text-white rounded-lg text-sm font-bold hover:bg-slate-800 transition-colors disabled:opacity-50">
                {(saveMutation.isPending || uploading) && <Loader2 className="w-4 h-4 animate-spin" />}
                {editItem ? 'Guardar Cambios' : 'Guardar Minuta'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Confirmar eliminación ─────────────────────────────────── */}
      {deleteItem && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-sm w-full p-6">
            <h2 className="text-lg font-bold text-slate-900 mb-2">¿Eliminar documento?</h2>
            <p className="text-sm text-slate-600">
              <span className="font-semibold">{deleteItem.asunto}</span> — esta acción no se puede deshacer.
            </p>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setDeleteItem(null)}
                className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
                Cancelar
              </button>
              <button onClick={() => deleteMutation.mutate(deleteItem)} disabled={deleteMutation.isPending}
                className="px-4 py-2 text-sm font-bold bg-red-600 text-white hover:bg-red-700 rounded-lg disabled:opacity-50 transition-colors">
                {deleteMutation.isPending ? 'Eliminando...' : 'Sí, eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
