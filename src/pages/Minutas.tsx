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
}

const inputCls   = 'w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white';
const PAGE_SIZE   = 20;
const FORM_INIT = {
  asunto: '', fecha: format(new Date(), 'yyyy-MM-dd'),
  proyecto_id: '', proyecto_nombre: '', territorio: '', colegio: '', notas: '',
};

export default function Minutas() {
  const { isAdmin, can } = usePermissions();
  const { user } = useAuth();
  const qc = useQueryClient();
  const { uploadCustom, uploading } = useSharePointUpload();

  const puedeCrear    = isAdmin || can('crear_minutas');
  const puedeEditar   = isAdmin || can('editar_minutas');
  const puedeEliminar = isAdmin || can('eliminar_minutas');

  const [search, setSearch]           = useState('');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [showForm, setShowForm]       = useState(false);
  const [editItem, setEditItem]       = useState<Minuta | null>(null);
  const [deleteItem, setDeleteItem]   = useState<Minuta | null>(null);
  const [sinProyecto, setSinProyecto] = useState(false);
  const [form, setForm]               = useState({ ...FORM_INIT });
  const [file, setFile]               = useState<File | null>(null);
  const [dragActive, setDragActive]   = useState(false);

  // ── Data ────────────────────────────────────────────────────────────────
  const { data: minutas = [], isLoading } = useQuery({
    queryKey: ['minutas'],
    queryFn: async () => {
      const { data, error } = await supabase.from('minutas').select('*').order('fecha', { ascending: false });
      if (error) throw error;
      return (data ?? []) as Minuta[];
    },
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
    !search ||
    m.asunto?.toLowerCase().includes(search.toLowerCase()) ||
    m.proyecto_nombre?.toLowerCase().includes(search.toLowerCase()) ||
    m.colegio?.toLowerCase().includes(search.toLowerCase())
  ), [minutas, search]);

  const visible   = useMemo(() => filtered.slice(0, visibleCount), [filtered, visibleCount]);
  const hasMore   = visibleCount < filtered.length;
  const remaining = filtered.length - visibleCount;

  const resetForm = () => {
    setForm({ ...FORM_INIT });
    setFile(null);
    setSinProyecto(false);
    setEditItem(null);
  };

  const openEdit = (m: Minuta) => {
    setEditItem(m);
    setSinProyecto(!!(m.proyecto_nombre && !m.proyecto_id));
    setForm({
      asunto: m.asunto, fecha: m.fecha,
      proyecto_id: m.proyecto_id ?? '', proyecto_nombre: m.proyecto_nombre ?? '',
      territorio: m.territorio ?? '', colegio: m.colegio ?? '', notas: m.notas ?? '',
    });
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
        if (!file) throw new Error('Selecciona el archivo Word de la minuta.');
      }
      if (!form.asunto.trim()) throw new Error('Escribe el asunto de la reunión.');

      let archivo_nombre = editItem?.archivo_nombre ?? '';
      let onedrive_url   = editItem?.onedrive_url ?? null;
      let onedrive_path  = editItem?.onedrive_path ?? null;

      if (file) {
        const anio    = new Date(form.fecha).getFullYear();
        const carpeta = `Minutas/${anio}/${form.territorio || 'GENERAL'}`;
        const fecha   = format(new Date(), 'yyyy-MM-dd_HH-mm-ss');
        const nombre  = `${fecha}_${file.name}`;
        const webUrl  = await uploadCustom(file, carpeta, nombre);
        if (!webUrl) throw new Error('No se pudo subir el archivo a OneDrive.');
        archivo_nombre = nombre;
        onedrive_url   = webUrl;
        onedrive_path  = carpeta;
      }

      const payload = {
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
        const { error } = await supabase.from('minutas').update(payload).eq('id', editItem.id);
        if (error) throw error;
        logAudit({ accion: 'editar', modulo: 'minutas', registro_id: editItem.id, registro_ref: form.asunto });
      } else {
        const { data, error } = await supabase.from('minutas').insert(payload).select('id').single();
        if (error) throw error;
        logAudit({ accion: 'crear', modulo: 'minutas', registro_id: data?.id ?? null, registro_ref: form.asunto });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['minutas'] });
      toast.success(editItem ? 'Minuta actualizada' : 'Minuta guardada correctamente');
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
      toast.success('Minuta eliminada');
      setDeleteItem(null);
    },
  });

  return (
    <div className="space-y-5">
      <PageHeader
        title="Minutas de Reunión"
        subtitle="Repositorio de minutas y actas de reuniones institucionales"
      />

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
            placeholder="Buscar por asunto, proyecto o colegio..."
            value={search} onChange={e => { setSearch(e.target.value); setVisibleCount(PAGE_SIZE); }} />
        </div>
        <span className="text-sm text-slate-400">{filtered.length} minuta{filtered.length !== 1 ? 's' : ''}</span>
        {puedeCrear && (
          <button onClick={() => { resetForm(); setShowForm(true); }}
            className="ml-auto flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-bold hover:bg-slate-800 transition-colors">
            <Plus className="w-4 h-4" /> Nueva Minuta
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="text-center py-16 text-slate-400 text-sm">Cargando minutas...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-slate-400 text-sm">
          <FileSignature className="w-10 h-10 mx-auto mb-2 text-slate-300" />
          No hay minutas registradas.
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100 overflow-hidden">
          {visible.map(m => (
            <div key={m.id} className="flex items-center gap-4 px-4 py-3 hover:bg-slate-50 transition-colors">
              <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                <FileText className="w-4 h-4 text-blue-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-sm text-slate-900 truncate">{m.asunto}</p>
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
          ))}
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
              <h2 className="font-bold text-slate-900">{editItem ? 'Editar Minuta' : 'Nueva Minuta'}</h2>
              <button onClick={() => { setShowForm(false); resetForm(); }} className="text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-3 max-h-[75vh] overflow-y-auto">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Asunto / Tema de la Reunión *</label>
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

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">
                  {editItem ? 'Reemplazar archivo Word (opcional)' : 'Archivo Word de la Minuta *'}
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
                    if (dropped && (dropped.name.endsWith('.docx') || dropped.name.endsWith('.doc'))) setFile(dropped);
                    else toast.error('Solo se aceptan archivos Word (.docx, .doc)');
                  }}
                  className={`flex items-center gap-3 cursor-pointer border-2 border-dashed rounded-lg px-4 py-3 transition
                  ${dragActive ? 'border-blue-500 bg-blue-100' : file ? 'border-blue-400 bg-blue-50' : 'border-slate-300 hover:border-blue-400 hover:bg-slate-50'}`}>
                  <FileText className="w-5 h-5 text-blue-500 shrink-0" />
                  <span className="flex-1 text-sm text-slate-600 truncate">
                    {file ? file.name : 'Arrastra el archivo Word aquí o haz clic para seleccionarlo'}
                  </span>
                  <input type="file" accept=".docx,.doc" className="hidden"
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
            <h2 className="text-lg font-bold text-slate-900 mb-2">¿Eliminar minuta?</h2>
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
