import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { db } from '@/lib/db';
import { FolderOpen, ChevronDown, Pencil, Trash2, X, Save, Calendar, Link2, FolderInput, TrendingUp, CheckCircle2, Clock, DollarSign } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { toast } from 'sonner';
import PageHeader from '@/components/shared/PageHeader';
import PriorityBadge from '@/components/shared/PriorityBadge';
import ColegioSelector from '@/components/shared/ColegioSelector';
import { COLEGIOS, TERRITORIOS } from '@/lib/colegios';

const PAGE_SIZE = 20;

const inputClass  = "w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-slate-900 focus:outline-none bg-white text-slate-900";
const labelClass  = "block text-xs font-bold text-slate-500 uppercase mb-1";
const selectClass = "h-10 px-3 py-2 bg-white border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-slate-400 focus:outline-none text-slate-700";

const TIPOS_PROYECTO = ['MEJORA', 'CONSTRUCCIÓN', 'REMODELACIÓN', 'ADECUACIÓN', 'MANTENIMIENTO', 'PORTAFOLIO', 'GARANTÍAS', 'REVISIÓN'];
const ASIGNACIONES   = ['MANO AMIGA SERVICIOS', 'MA COLEGIO', 'PROVEEDOR', 'ECO', 'JURÍDICO', 'INMOBILIARIA', 'RECAUDACIÓN'];
const ESTATUSES      = ['en_revision', 'aprobado', 'entregado'];
const PRIORIDADES    = ['baja', 'media', 'alta', 'urgente'];

const ESTATUS_LABELS: Record<string, string> = {
  en_revision: 'En Revisión',
  aprobado:    'Aprobado',
  entregado:   'Entregado',
};

const ESTATUS_COLORS: Record<string, string> = {
  en_revision: 'bg-amber-100 text-amber-800',
  aprobado:    'bg-green-100 text-green-800',
  entregado:   'bg-blue-100 text-blue-800',
};

// Formato MXN
const formatMXN = (val: string) => {
  const num = val.replace(/[^0-9.]/g, '');
  if (!num) return '';
  const parts = num.split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return '$' + parts.join('.');
};
const parseMXN = (val: string) => val.replace(/[$,]/g, '');

interface Anteproyecto {
  id:                   string;
  territorio?:          string;
  colegio?:             string;
  nombre_proyecto?:     string;
  presupuesto?:         number | null;
  tipo_proyecto?:       string;
  prioridad?:           string;
  asignacion?:          string;
  eco?:                 string;
  estatus?:             string;
  proyecto_id?:         string | null;
  notas?:               string;
  fecha_solicitud?:     string | null;
  fecha_entrega?:       string | null;
  ruta_onedrive?:       string | null;
  fecha_actualizacion?: string;
  created_at?:          string;
}

interface Project {
  id:     string;
  name?:  string;
  folio?: string;
}

interface FormData {
  territorio:      string;
  colegio:         string;
  nombre_proyecto: string;
  presupuesto:     string;
  tipo_proyecto:   string;
  prioridad:       string;
  asignacion:      string;
  eco:             string;
  estatus:         string;
  proyecto_id:     string;
  notas:           string;
  fecha_solicitud: string;
  fecha_entrega:   string;
  ruta_onedrive:   string;
}

const INITIAL_FORM: FormData = {
  territorio:      '',
  colegio:         '',
  nombre_proyecto: '',
  presupuesto:     '',
  tipo_proyecto:   '',
  prioridad:       'media',
  asignacion:      '',
  eco:             '',
  estatus:         'en_revision',
  proyecto_id:     '',
  notas:           '',
  fecha_solicitud: '',
  fecha_entrega:   '',
  ruta_onedrive:   '',
};

// ─── Formulario ───────────────────────────────────────────────────────────────
function AnteproyectoForm({
  open, onClose, onSubmit, anteproyecto = null, projects = [],
}: {
  open:           boolean;
  onClose:        () => void;
  onSubmit:       (data: Record<string, unknown>) => void;
  anteproyecto?:  Anteproyecto | null;
  projects?:      Project[];
}) {
  const [formData, setFormData] = useState<FormData>(INITIAL_FORM);

  React.useEffect(() => {
    if (anteproyecto) {
      setFormData({
        territorio:      String(anteproyecto.territorio      ?? ''),
        colegio:         String(anteproyecto.colegio         ?? ''),
        nombre_proyecto: String(anteproyecto.nombre_proyecto ?? ''),
        presupuesto:     anteproyecto.presupuesto != null ? String(anteproyecto.presupuesto) : '',
        tipo_proyecto:   String(anteproyecto.tipo_proyecto   ?? ''),
        prioridad:       String(anteproyecto.prioridad       ?? 'media'),
        asignacion:      String(anteproyecto.asignacion      ?? ''),
        eco:             String(anteproyecto.eco             ?? ''),
        estatus:         String(anteproyecto.estatus         ?? 'en_revision'),
        proyecto_id:     String(anteproyecto.proyecto_id     ?? ''),
        notas:           String(anteproyecto.notas           ?? ''),
        fecha_solicitud: anteproyecto.fecha_solicitud ? anteproyecto.fecha_solicitud.split('T')[0] : '',
        fecha_entrega:   anteproyecto.fecha_entrega   ? anteproyecto.fecha_entrega.split('T')[0]   : '',
        ruta_onedrive:   String(anteproyecto.ruta_onedrive   ?? ''),
      });
    } else {
      setFormData(INITIAL_FORM);
    }
  }, [anteproyecto, open]);

  if (!open) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      ...formData,
      presupuesto:     formData.presupuesto ? parseFloat(parseMXN(formData.presupuesto)) : null,
      proyecto_id:     formData.proyecto_id     || null,
      fecha_solicitud: formData.fecha_solicitud || null,
      fecha_entrega:   formData.fecha_entrega   || null,
      ruta_onedrive:   formData.ruta_onedrive   || null,
    });
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col border border-slate-200">
        <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <h3 className="font-bold text-slate-900 flex items-center gap-2">
            <FolderOpen className="w-4 h-4" />
            {anteproyecto ? 'Editar Anteproyecto' : 'Nuevo Anteproyecto'}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-3 flex-1">
          {/* Nombre */}
          <div>
            <label className={labelClass}>Nombre del Proyecto *</label>
            <input type="text" required className={inputClass} value={formData.nombre_proyecto}
              onChange={e => setFormData(p => ({ ...p, nombre_proyecto: e.target.value }))}
              placeholder="Ej. Construcción de Aula Nueva" />
          </div>

          {/* Territorio + Colegio */}
          <ColegioSelector
            territorio={formData.territorio}
            colegio={formData.colegio}
            onTerritorioChange={val => setFormData(p => ({ ...p, territorio: val, colegio: '', eco: '' }))}
            onColegioChange={val => {
              const colegioData = COLEGIOS.find(c => c.colegio === val);
              setFormData(p => ({ ...p, colegio: val, eco: colegioData?.eco ?? '' }));
            }}
            required
          />

          {/* ECO */}
          <div>
            <label className={labelClass}>ECO (Automático)</label>
            <input type="text" readOnly className="w-full px-3 py-2 border border-slate-200 rounded-md text-sm bg-slate-50 font-semibold text-slate-600 cursor-default"
              value={formData.eco} placeholder="Se asigna según el colegio" />
          </div>

          {/* Fechas solicitud y entrega */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Fecha de Solicitud</label>
              <input type="date" className={inputClass} value={formData.fecha_solicitud}
                onChange={e => setFormData(p => ({ ...p, fecha_solicitud: e.target.value }))} />
            </div>
            <div>
              <label className={labelClass}>Fecha de Entrega</label>
              <input type="date" className={inputClass} value={formData.fecha_entrega}
                onChange={e => setFormData(p => ({ ...p, fecha_entrega: e.target.value }))} />
            </div>
          </div>

          {/* Tipo + Prioridad */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Tipo de Proyecto</label>
              <select className={inputClass} value={formData.tipo_proyecto}
                onChange={e => setFormData(p => ({ ...p, tipo_proyecto: e.target.value }))}>
                <option value="">Seleccionar...</option>
                {TIPOS_PROYECTO.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass}>Prioridad *</label>
              <select className={inputClass} value={formData.prioridad}
                onChange={e => setFormData(p => ({ ...p, prioridad: e.target.value }))}>
                {PRIORIDADES.map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
              </select>
            </div>
          </div>

          {/* Asignación + Estatus */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Asignación</label>
              <select className={inputClass} value={formData.asignacion}
                onChange={e => setFormData(p => ({ ...p, asignacion: e.target.value }))}>
                <option value="">Seleccionar...</option>
                {ASIGNACIONES.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass}>Estatus *</label>
              <select className={inputClass} value={formData.estatus}
                onChange={e => setFormData(p => ({ ...p, estatus: e.target.value }))}>
                {ESTATUSES.map(e => <option key={e} value={e}>{ESTATUS_LABELS[e]}</option>)}
              </select>
            </div>
          </div>

          {/* Presupuesto */}
          <div>
            <label className={labelClass}>Presupuesto Estimado (MXN)</label>
            <input type="text" className={inputClass}
              value={formatMXN(formData.presupuesto)}
              onChange={e => setFormData(p => ({ ...p, presupuesto: parseMXN(e.target.value) }))}
              placeholder="$0.00" />
          </div>

          {/* Vincular con Proyecto */}
          <div>
            <label className={labelClass}>
              <span className="flex items-center gap-1.5">
                <Link2 className="w-3 h-3" /> Vincular con Proyecto (opcional)
              </span>
            </label>
            <select className={inputClass} value={formData.proyecto_id}
              onChange={e => setFormData(p => ({ ...p, proyecto_id: e.target.value }))}>
              <option value="">Sin vincular</option>
              {projects.map(p => (
                <option key={p.id} value={p.id}>{p.folio ? `${p.folio} — ` : ''}{p.name}</option>
              ))}
            </select>
            <p className="text-[10px] text-slate-400 mt-1">Solo se muestran proyectos con folio TCMM asignado.</p>
          </div>

          {/* Ruta OneDrive */}
          <div>
            <label className={labelClass}>
              <span className="flex items-center gap-1.5">
                <FolderInput className="w-3 h-3" /> Ruta OneDrive (opcional)
              </span>
            </label>
            <input type="text" className={inputClass} value={formData.ruta_onedrive}
              onChange={e => setFormData(p => ({ ...p, ruta_onedrive: e.target.value }))}
              placeholder="Ej. Colegios/MA CIM/Anteproyectos/Construcción Aula" />
            <p className="text-[10px] text-slate-400 mt-1">Pega la ruta de la carpeta en OneDrive donde están los archivos del anteproyecto.</p>
          </div>

          {/* Notas */}
          <div>
            <label className={labelClass}>Notas / Descripción *</label>
            <textarea required className={`${inputClass} h-32 resize-none`} value={formData.notas}
              onChange={e => setFormData(p => ({ ...p, notas: e.target.value }))}
              placeholder="Describe el anteproyecto, requerimientos, observaciones..." />
          </div>

          <div className="pt-4 border-t border-slate-100 flex justify-end gap-3">
            <button type="button" onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200 rounded-md transition-colors">
              Cancelar
            </button>
            <button type="submit"
              className="px-4 py-2 bg-slate-900 text-white rounded-md text-sm font-medium hover:bg-slate-800 flex items-center gap-2">
              <Save className="w-4 h-4" />
              {anteproyecto ? 'Actualizar' : 'Guardar Anteproyecto'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────
export default function Anteproyectos() {
  const [showForm, setShowForm]                       = useState(false);
  const [editingAnteproyecto, setEditingAnteproyecto] = useState<Anteproyecto | null>(null);
  const [deletingId, setDeletingId]                   = useState<string | null>(null);
  const [filterEstatus, setFilterEstatus]             = useState('all');
  const [filterTerritorio, setFilterTerritorio]       = useState('all');
  const [filterColegio, setFilterColegio]             = useState('all');
  const [filterPrioridad, setFilterPrioridad]         = useState('all');
  const [visibleCount, setVisibleCount]               = useState(PAGE_SIZE);
  const queryClient = useQueryClient();

  const { data: rawAnteproyectos = [], isLoading } = useQuery({
    queryKey: ['anteproyectos'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('anteproyectos')
        .select('*')
        .order('fecha_actualizacion', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: rawProjects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => db.Project.list('-created_at', 500),
  });

  const anteproyectos = rawAnteproyectos as Anteproyecto[];
  const projects      = rawProjects as unknown as Project[];

  const projectMap = useMemo(
    () => Object.fromEntries(projects.map(p => [p.id, p.name ?? ''])),
    [projects]
  );

  const projectsVinculables = useMemo(
    () => projects.filter(p => p.folio && p.folio.startsWith('TCMM')),
    [projects]
  );

  // ── KPIs ──────────────────────────────────────────────────────────────────
  const kpis = useMemo(() => ({
    total:       anteproyectos.length,
    entregados:  anteproyectos.filter(a => a.estatus === 'entregado').length,
    pendientes:  anteproyectos.filter(a => a.estatus !== 'entregado').length,
    presupuesto: anteproyectos.reduce((sum, a) => sum + (a.presupuesto ?? 0), 0),
    vinculados:  anteproyectos.filter(a => !!a.proyecto_id).length,
  }), [anteproyectos]);

  const createMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const { data: result, error } = await supabase
        .from('anteproyectos')
        .insert({ ...data, fecha_actualizacion: new Date().toISOString() })
        .select()
        .single();
      if (error) throw error;
      return result;
    },
    onSuccess: (result: any) => {
      if (result?._offline) {
        queryClient.setQueryData(['anteproyectos'], (old: any) => [result, ...(old ?? [])]);
        toast.warning('📶 Sin conexión — Anteproyecto guardado localmente');
      } else {
        queryClient.invalidateQueries({ queryKey: ['anteproyectos'] });
        toast.success('Anteproyecto creado');
      }
      setShowForm(false);
    },
    onError: () => toast.error('Error al crear el anteproyecto'),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Record<string, unknown> }) => {
      const { data: result, error } = await supabase
        .from('anteproyectos')
        .update({ ...data, fecha_actualizacion: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return result;
    },
    onSuccess: (result: any) => {
      if (result?._offline) {
        queryClient.setQueryData(['anteproyectos'], (old: any) =>
          (old ?? []).map((a: any) => a.id === result.id ? { ...a, ...result } : a)
        );
        toast.warning('📶 Sin conexión — Cambio guardado localmente');
      } else {
        queryClient.invalidateQueries({ queryKey: ['anteproyectos'] });
        toast.success('Anteproyecto actualizado');
      }
      setEditingAnteproyecto(null);
    },
    onError: () => toast.error('Error al actualizar el anteproyecto'),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('anteproyectos').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['anteproyectos'] });
      toast.success('Anteproyecto eliminado');
      setDeletingId(null);
    },
    onError: () => toast.error('Error al eliminar el anteproyecto'),
  });

  const colegiosFiltrados = useMemo(() =>
    filterTerritorio !== 'all'
      ? COLEGIOS.filter(c => c.territorio === filterTerritorio)
      : COLEGIOS,
    [filterTerritorio]
  );

  const handleFilterChange = (setter: React.Dispatch<React.SetStateAction<string>>) =>
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      setter(e.target.value);
      setVisibleCount(PAGE_SIZE);
    };

  const filtered = useMemo(() =>
    anteproyectos.filter(a => {
      if (filterEstatus    !== 'all' && a.estatus    !== filterEstatus)    return false;
      if (filterTerritorio !== 'all' && a.territorio !== filterTerritorio) return false;
      if (filterColegio    !== 'all' && a.colegio    !== filterColegio)    return false;
      if (filterPrioridad  !== 'all' && a.prioridad  !== filterPrioridad)  return false;
      return true;
    }),
    [anteproyectos, filterEstatus, filterTerritorio, filterColegio, filterPrioridad]
  );

  const visible   = useMemo(() => filtered.slice(0, visibleCount), [filtered, visibleCount]);
  const hasMore   = visibleCount < filtered.length;
  const remaining = filtered.length - visibleCount;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Anteproyectos"
        subtitle="Gestión de anteproyectos solicitados por los colegios"
        actionLabel="Nuevo Anteproyecto"
        onAction={() => setShowForm(true)}
      />

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 flex items-center gap-1">
            <TrendingUp className="w-3 h-3" /> Solicitados
          </p>
          <p className="text-2xl font-black text-slate-900">{kpis.total}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" /> Entregados
          </p>
          <p className="text-2xl font-black text-emerald-600">{kpis.entregados}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 flex items-center gap-1">
            <Clock className="w-3 h-3" /> Pendientes
          </p>
          <p className="text-2xl font-black text-amber-600">{kpis.pendientes}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 flex items-center gap-1">
            <DollarSign className="w-3 h-3" /> Presupuesto Total
          </p>
          <p className="text-lg font-black text-blue-600">
            {kpis.presupuesto.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 flex items-center gap-1">
            <Link2 className="w-3 h-3" /> Vinculados
          </p>
          <p className="text-2xl font-black text-purple-600">{kpis.vinculados}</p>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3">
        <select className={selectClass} value={filterTerritorio}
          onChange={e => { handleFilterChange(setFilterTerritorio)(e); setFilterColegio('all'); }}>
          <option value="all">Todos los Territorios</option>
          {TERRITORIOS.map(t => <option key={t} value={t}>{t}</option>)}
        </select>

        <select className={selectClass} value={filterColegio}
          onChange={handleFilterChange(setFilterColegio)}>
          <option value="all">Todos los Colegios</option>
          {colegiosFiltrados.map(c => <option key={c.colegio} value={c.colegio}>{c.colegio}</option>)}
        </select>

        <select className={selectClass} value={filterEstatus}
          onChange={handleFilterChange(setFilterEstatus)}>
          <option value="all">Todos los Estatus</option>
          {ESTATUSES.map(e => <option key={e} value={e}>{ESTATUS_LABELS[e]}</option>)}
        </select>

        <select className={selectClass} value={filterPrioridad}
          onChange={handleFilterChange(setFilterPrioridad)}>
          <option value="all">Todas las Prioridades</option>
          {PRIORIDADES.map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
        </select>

        {filtered.length > 0 && (
          <span className="h-10 flex items-center text-sm text-slate-500">
            {filtered.length} anteproyecto{filtered.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Lista */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 py-20 text-center">
          <FolderOpen className="w-12 h-12 text-slate-200 mx-auto mb-3" />
          <p className="text-slate-400 font-medium">No hay anteproyectos registrados.</p>
          <button onClick={() => setShowForm(true)}
            className="mt-4 px-4 py-2 bg-slate-900 text-white rounded-md text-sm font-medium hover:bg-slate-800 transition-colors">
            + Nuevo Anteproyecto
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          {/* Cabecera */}
          <div className="hidden md:grid grid-cols-12 gap-2 px-5 py-3 bg-slate-50 border-b border-slate-100 text-[10px] font-black text-slate-400 uppercase tracking-widest">
            <div className="col-span-1">Colegio</div>
            <div className="col-span-2">Proyecto</div>
            <div className="col-span-1">Tipo</div>
            <div className="col-span-1">Prioridad</div>
            <div className="col-span-1">Estatus</div>
            <div className="col-span-1">Presupuesto</div>
            <div className="col-span-1">F. Solicitud</div>
            <div className="col-span-1">F. Entrega</div>
            <div className="col-span-1">Vinculado</div>
            <div className="col-span-1">OneDrive</div>
            <div className="col-span-1">Acciones</div>
          </div>

          <div className="divide-y divide-slate-100">
            {visible.map(a => (
              <div key={a.id} className="px-5 py-4 hover:bg-slate-50/50 transition-colors grid grid-cols-1 md:grid-cols-12 gap-2 items-start">
                <div className="col-span-1">
                  <p className="text-xs font-bold text-slate-800">{a.colegio || '—'}</p>
                  <p className="text-[10px] text-slate-400">{a.territorio || ''}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-sm font-bold text-slate-900 leading-tight">{a.nombre_proyecto || '—'}</p>
                  {a.eco && <p className="text-[10px] text-slate-400 mt-0.5">{a.eco}</p>}
                </div>
                <div className="col-span-1">
                  <span className="text-xs text-slate-600">{a.tipo_proyecto || '—'}</span>
                </div>
                <div className="col-span-1">
                  <PriorityBadge priority={a.prioridad} />
                </div>
                <div className="col-span-1">
                  {a.estatus ? (
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${ESTATUS_COLORS[a.estatus] ?? 'bg-slate-100 text-slate-600'}`}>
                      {ESTATUS_LABELS[a.estatus] ?? a.estatus}
                    </span>
                  ) : '—'}
                </div>
                <div className="col-span-1">
                  <span className="text-xs font-semibold text-slate-700">
                    {a.presupuesto != null
                      ? Number(a.presupuesto).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })
                      : '—'}
                  </span>
                </div>
                <div className="col-span-1">
                  {a.fecha_solicitud ? (
                    <span className="text-xs text-slate-600 flex items-center gap-1">
                      <Calendar className="w-3 h-3 text-slate-400" />
                      {format(new Date(a.fecha_solicitud), 'dd MMM yyyy', { locale: es })}
                    </span>
                  ) : <span className="text-xs text-slate-400">—</span>}
                </div>
                <div className="col-span-1">
                  {a.fecha_entrega ? (
                    <span className="text-xs text-slate-600 flex items-center gap-1">
                      <Calendar className="w-3 h-3 text-slate-400" />
                      {format(new Date(a.fecha_entrega), 'dd MMM yyyy', { locale: es })}
                    </span>
                  ) : <span className="text-xs text-slate-400">—</span>}
                </div>
                <div className="col-span-1">
                  {a.proyecto_id && projectMap[a.proyecto_id] ? (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 flex items-center gap-1">
                      <Link2 className="w-3 h-3" />
                      {projectMap[a.proyecto_id]}
                    </span>
                  ) : (
                    <span className="text-xs text-slate-400">Sin vincular</span>
                  )}
                </div>
                <div className="col-span-1">
                  {a.ruta_onedrive ? (
                    <span className="text-[10px] text-slate-500 flex items-center gap-1 truncate" title={a.ruta_onedrive}>
                      <FolderInput className="w-3 h-3 flex-shrink-0 text-blue-500" />
                      <span className="truncate">{a.ruta_onedrive}</span>
                    </span>
                  ) : <span className="text-xs text-slate-400">—</span>}
                </div>
                <div className="col-span-1 flex gap-2">
                  <button onClick={() => setEditingAnteproyecto(a)}
                    className="p-1.5 rounded-md border border-slate-200 text-slate-500 hover:bg-slate-100 transition-colors">
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => setDeletingId(a.id)}
                    className="p-1.5 rounded-md border border-red-200 text-red-500 hover:bg-red-50 transition-colors">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {hasMore && (
            <div className="flex flex-col items-center gap-2 py-6 border-t border-slate-100">
              <button onClick={() => setVisibleCount(v => v + PAGE_SIZE)}
                className="flex items-center gap-2 px-5 py-2.5 bg-white border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 hover:border-slate-400 transition-colors shadow-sm">
                <ChevronDown className="w-4 h-4" />
                Cargar más ({remaining} restante{remaining !== 1 ? 's' : ''})
              </button>
              <p className="text-xs text-slate-400">
                Mostrando {visible.length} de {filtered.length} anteproyectos
              </p>
            </div>
          )}
        </div>
      )}

      <AnteproyectoForm
        open={showForm}
        onClose={() => setShowForm(false)}
        onSubmit={data => createMutation.mutate(data)}
        projects={projectsVinculables}
      />

      <AnteproyectoForm
        open={!!editingAnteproyecto}
        onClose={() => setEditingAnteproyecto(null)}
        onSubmit={data => updateMutation.mutate({ id: editingAnteproyecto!.id, data })}
        anteproyecto={editingAnteproyecto}
        projects={projectsVinculables}
      />

      {deletingId && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-sm w-full p-6">
            <h2 className="text-lg font-bold text-slate-900">¿Eliminar anteproyecto?</h2>
            <p className="text-sm text-slate-500 mt-2">Esta acción no se puede deshacer.</p>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setDeletingId(null)}
                className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-md">
                Cancelar
              </button>
              <button onClick={() => deleteMutation.mutate(deletingId!)}
                disabled={deleteMutation.isPending}
                className="px-4 py-2 text-sm font-medium bg-red-600 text-white hover:bg-red-700 rounded-md disabled:opacity-50">
                {deleteMutation.isPending ? 'Eliminando...' : 'Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
